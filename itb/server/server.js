#!/usr/bin/env node
'use strict';
/* AI IMPOSTOR: SPACE SHIP — game server: static files + WebSocket rooms (zero npm dependencies).
 *
 *   node server/server.js            env: PORT (3000), HOST (0.0.0.0; use 127.0.0.1 for local-only tests)
 *
 * Protocol (JSON text frames on /ws), contract §5:
 *   client -> server  {t:'hello', v, name, color, hat} {t:'create'} {t:'join', code} {t:'act', a: action} {t:'leave'}
 *   server -> client  {t:'welcome', id} {t:'room', code, you} {t:'err', key} {t:'snap', s} {t:'ev', e: [events]}
 * One authoritative AS.Game per room, ticking at 30 Hz; per-player snapshots at 15 Hz (plus on ticks that
 * produced events), events every tick (private events only to their `to` player).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const wsLib = require('./ws');

const ROOT = path.resolve(__dirname, '..');
require('./env').load(path.join(ROOT, '.env')); // API keys etc. (gitignored; never served: dotfiles are blocked)
const PORT = (() => { const p = parseInt(process.env.PORT, 10); return p > 0 && p < 65536 ? p : 3000; })();
const HOST = process.env.HOST || '0.0.0.0';

const RATE_LIMIT = 60;          // messages per second per connection; more are ignored
const RATE_KICK = 400;          // a connection this abusive is closed (1008)
const MAX_APP_MESSAGE = 16384;  // game messages are tiny; bigger JSON is ignored (the ws layer caps at 1 MB)
const MAX_ROOMS = 300;
const MAX_CONNECTIONS = 600;
const HEARTBEAT_MS = 15000;
const HELLO_TIMEOUT_MS = 30000;
const CODE_CHARS = 'ABCDEFGHJKMNPRSTUVWXYZ'; // no I, L, O, Q: nothing that reads like 1 or 0

// ------------------------------------------------------------------ logging
function stamp() {
  return new Date().toTimeString().slice(0, 8);
}
function log(...a) {
  console.log('[' + stamp() + ']', ...a);
}
const errCounts = new Map();
function logError(tag, e) {
  const n = (errCounts.get(tag) || 0) + 1;
  errCounts.set(tag, n);
  if (n <= 5 || n % 200 === 0) console.error('[' + stamp() + '] ERROR ' + tag + (n > 5 ? ' (x' + n + ')' : '') + ':', (e && e.stack) || e);
}

// ------------------------------------------------------------------ shared game core
const CORE_FILES = ['ns.js', 'constants.js', 'i18n.js', 'map.js', 'geometry.js', 'game.js', 'questions.js', 'qa.js', 'bots.js'];
const coreProblems = [];
for (const f of CORE_FILES) {
  try {
    require(path.join(ROOT, 'js', 'core', f));
  } catch (e) {
    coreProblems.push(f + ' (' + (e && e.code === 'MODULE_NOT_FOUND' ? 'missing' : (e && e.message) || e) + ')');
    if (f === 'ns.js' || f === 'constants.js') {
      console.error('FATAL: cannot load js/core/' + f + ':', e);
      process.exit(1);
    }
  }
}
// Optional extra scripts (tests / stubs): AS_PRELOAD=path1<delimiter>path2
if (process.env.AS_PRELOAD) {
  for (const p of process.env.AS_PRELOAD.split(path.delimiter).filter(Boolean)) {
    try { require(path.resolve(p)); } catch (e) { coreProblems.push('AS_PRELOAD ' + p + ' (' + e.message + ')'); }
  }
}
const AS = globalThis.AS;
const T = AS.T;
const gameAvailable = () => typeof AS.Game === 'function';

// ------------------------------------------------------------------ AI services (all optional; the game works without keys)
const services = require('./services').createServices(AS, ROOT, log);
const { analytics, answerProvider, director } = services;
const gemini = services.geminiModel, groq = services.groqModel;

// ------------------------------------------------------------------ static files
const MIME = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.webmanifest': 'application/manifest+json',
};
const WIN_DEVICE = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;
// Compared case-insensitively on Windows, where /LOGS/chat.jsonl opens the same file as /logs/chat.jsonl.
const fold = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);
const PRIVATE_DIRS = [services.logDir, path.join(ROOT, 'server'), path.join(ROOT, 'tools', 'out'), path.join(ROOT, 'node_modules')].map((d) => fold(path.resolve(d)));
const isPrivate = (filePath) => { const f = fold(filePath); return PRIVATE_DIRS.some((d) => f === d || f.startsWith(d + path.sep)); };

function sendText(res, status, text, headers) {
  if (res.headersSent) { try { res.end(); } catch (e) { /* ignore */ } return; }
  res.writeHead(status, Object.assign({
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
  }, headers || {}));
  res.end(text);
}

function serveStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendText(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
  } catch (e) {
    return sendText(res, 400, 'Bad Request');
  }
  if (pathname.indexOf('\0') >= 0) return sendText(res, 400, 'Bad Request');
  if (pathname.endsWith('/') || pathname.endsWith('\\')) pathname += 'index.html';
  const rel = pathname.replace(/^[\\/]+/, '');
  const segments = rel.split(/[\\/]+/);
  // Decoded '..' (e.g. from %2e%2e or %2f) is a traversal attempt; dotfiles, ADS (':') and device names are never served.
  if (segments.some((s) => s === '..')) return sendText(res, 403, 'Forbidden');
  if (segments.some((s) => s.startsWith('.') || s.indexOf(':') >= 0 || WIN_DEVICE.test(s))) return sendText(res, 404, 'Not Found');
  const filePath = path.resolve(ROOT, rel);
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) return sendText(res, 403, 'Forbidden');
  // Server-only data inside ROOT (chat logs with author types, server code and prompts, scratch output) is never served.
  if (isPrivate(filePath)) return sendText(res, 404, 'Not Found');

  fs.stat(filePath, (err, st) => {
    if (err || !st) return sendText(res, 404, 'Not Found');
    if (st.isDirectory()) {
      // No directory listings. A folder with an index.html is redirected to its slash form.
      fs.stat(path.join(filePath, 'index.html'), (e2, st2) => {
        if (e2 || !st2 || !st2.isFile()) return sendText(res, 404, 'Not Found');
        sendText(res, 301, 'Moved', { Location: encodeURI(pathname.replace(/\\/g, '/') + '/') });
      });
      return;
    }
    if (!st.isFile()) return sendText(res, 404, 'Not Found');
    const etag = 'W/"' + st.size.toString(16) + '-' + Math.floor(st.mtimeMs).toString(16) + '"';
    const headers = {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      ETag: etag,
      'Last-Modified': st.mtime.toUTCString(),
      'X-Content-Type-Options': 'nosniff',
    };
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers);
      return res.end();
    }
    headers['Content-Length'] = st.size;
    if (req.method === 'HEAD') {
      res.writeHead(200, headers);
      return res.end();
    }
    const stream = fs.createReadStream(filePath);
    stream.on('error', (e) => {
      logError('static ' + rel, e);
      if (!res.headersSent) sendText(res, 500, 'Internal Server Error');
      else res.destroy();
    });
    res.writeHead(200, headers);
    stream.pipe(res);
  });
}

// ------------------------------------------------------------------ validation helpers
// Drop control / zero-width / bidi characters (no escapes in the source on purpose).
function stripInvisible(s) {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c < 32 || (c >= 0x7f && c <= 0x9f) || (c >= 0x200b && c <= 0x200f) || (c >= 0x2028 && c <= 0x202e) || (c >= 0x2060 && c <= 0x206f) || c === 0xfeff) continue;
    out += ch;
  }
  return out;
}
function cleanName(s) {
  if (typeof s !== 'string') return '';
  s = stripInvisible(s).replace(/\s+/g, ' ').trim();
  return Array.from(s).slice(0, 12).join('').trim();
}
const isId = (v) => (typeof v === 'string' && v.length > 0 && v.length <= 64) || (typeof v === 'number' && Number.isFinite(v));
const isNum = (v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e7;
const SAB_KINDS = ['lights', 'comms', 'reactor', 'o2', 'doors'];

// Whitelist + normalize every client action before it reaches the simulation.
function sanitizeAction(a, game) {
  if (!a || typeof a !== 'object' || Array.isArray(a) || typeof a.type !== 'string') return null;
  const type = a.type;
  switch (type) {
    case 'move':
      if (!isNum(a.x) || !isNum(a.y)) return null;
      return { type, x: a.x, y: a.y, facing: a.facing < 0 ? -1 : 1, moving: !!a.moving, tp: Number.isInteger(a.tp) ? a.tp : -1 };
    case 'kill':
      return isId(a.target) ? { type, target: a.target } : null;
    case 'report':
      return isId(a.body) ? { type, body: a.body } : null;
    case 'vent':
      return isId(a.vent) ? { type, vent: a.vent } : null;
    case 'ventMove':
      return isId(a.to) ? { type, to: a.to } : null;
    case 'emergency':
    case 'ventExit':
    case 'start':
    case 'addBot':
    case 'returnLobby':
      return { type };
    case 'sabotage': {
      if (SAB_KINDS.indexOf(a.kind) < 0) return null;
      const o = { type, kind: a.kind };
      if (a.room != null) { if (!isId(a.room)) return null; o.room = a.room; }
      return o;
    }
    case 'fixPanel': {
      if (!isId(a.panel)) return null;
      const o = { type, panel: a.panel };
      if (a.holding !== undefined) o.holding = !!a.holding;
      return o;
    }
    case 'taskStart':
    case 'taskCancel':
    case 'taskComplete':
      return isId(a.task) ? { type, task: a.task } : null;
    case 'vote':
      return isId(a.target) ? { type, target: a.target } : null;
    case 'setLook': {
      const o = { type };
      if (a.name !== undefined) { const n = cleanName(a.name); if (n) o.name = n; }
      if (typeof a.color === 'string' && AS.COLOR_BY_ID[a.color]) o.color = a.color;
      if (typeof a.hat === 'string' && AS.HATS.indexOf(a.hat) >= 0) o.hat = a.hat;
      return o;
    }
    case 'settings': {
      if (!a.settings || typeof a.settings !== 'object' || Array.isArray(a.settings)) return null;
      // Partial updates are merged over the room's current settings, then sanitized by the game.
      const cur = game && game.settings && typeof game.settings === 'object' ? game.settings : null;
      const s = Object.assign({}, cur || {});
      for (const def of AS.SETTINGS_SCHEMA) {
        const v = a.settings[def.key];
        if (typeof v === 'number' || typeof v === 'boolean' || (typeof v === 'string' && v.length <= 32)) s[def.key] = v;
      }
      return { type, settings: AS.sanitizeSettings(s) };
    }
    case 'removeBot':
      return isId(a.id) ? { type, id: a.id } : null;
    case 'chat':
      return typeof a.text === 'string' && a.text.length <= 400 ? { type, text: a.text } : null;
    case 'answer':
      return typeof a.text === 'string' && a.text.length <= 1200 ? { type, text: a.text } : null;
    case 'typing':
    case 'stop':
      return { type };
    case 'goto':
      return isNum(a.x) && isNum(a.y) ? { type, x: a.x, y: a.y } : null;
    default:
      return null;
  }
}

// ------------------------------------------------------------------ rooms
const rooms = new Map();   // code -> Room
const clients = new Set(); // every open connection
let nextClientId = 1;

function makeCode() {
  for (let i = 0; i < 2000; i++) {
    let c = '';
    for (let k = 0; k < 4; k++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
  return null;
}

class Room {
  constructor(code) {
    this.code = code;
    this.members = new Map(); // playerId -> client (humans connected to this room)
    this.pending = [];        // events waiting for the next flush (game events + server-made ones, in order)
    this.tickNo = 0;
    this.forceSnap = true;
    this.createdAt = Date.now();
    this.game = new AS.Game({ mapId: 'starship', settings: AS.sanitizeSettings({}), seed: crypto.randomInt(0x7fffffff), isServer: true });
    this.game.aiProvider = answerProvider;   // meeting answers (Gemini); null -> built-in answers
    analytics.attach(this.game, code);
  }
  collect() {
    let evs = null;
    try { evs = this.game.drainEvents(); } catch (e) { logError('room ' + this.code + ' drainEvents', e); }
    if (evs && evs.length) for (const e of evs) if (e && typeof e === 'object') this.pending.push(e);
  }
  playerCount() {
    const g = this.game;
    let n = 0;
    for (const id of g.order || []) { const p = g.getPlayer(id); if (p && !p.left) n++; }
    return n;
  }
  nameOf(id) {
    const p = this.game.getPlayer(id);
    return p ? p.name : String(id);
  }
}

const sameId = (a, b) => a != null && b != null && String(a) === String(b);

function send(client, msg, droppable) {
  const ws = client.ws;
  if (ws.readyState !== wsLib.OPEN) return;
  // Snapshots are superseded by the next one; skip them for a congested peer instead of queueing.
  if (droppable && ws.bufferedAmount > 262144) return;
  let text;
  try { text = JSON.stringify(msg); } catch (e) { logError('serialize ' + msg.t, e); return; }
  ws.send(text);
}
function sendErr(client, key) {
  send(client, { t: 'err', key });
}
function sendSnap(room, client) {
  let s = null;
  try { s = room.game.snapshotFor(client.pid); } catch (e) { logError('room ' + room.code + ' snapshotFor', e); }
  if (s) send(client, { t: 'snap', s }, true);
}
function sendRoom(room, client) {
  send(client, { t: 'room', code: room.code, you: client.pid });
  sendSnap(room, client); // first snapshot right away: the client can show the lobby without waiting for a tick
}

// Host = first connected human in join order. Fixes the host after joins/leaves (never a bot).
function ensureHost(room) {
  const g = room.game;
  if (g.hostId != null && room.members.has(g.hostId)) return;
  let next = null;
  for (const id of g.order || []) if (room.members.has(id)) { next = id; break; }
  if (next == null) for (const id of room.members.keys()) { next = id; break; }
  if (next == null || sameId(g.hostId, next)) return;
  g.hostId = next;
  room.pending.push({ type: 'host', player: next });
  log('[' + room.code + '] host is now ' + room.nameOf(next));
}

function addToRoom(room, client) {
  const g = room.game;
  if (g.phase !== 'lobby') return 'err.inProgress';
  if (room.playerCount() >= T.MAX_LOBBY) {
    // Humans beat bots: drop the most recently added bot to make space.
    const ids = (g.order || []).slice().reverse();
    const bot = ids.find((id) => { const p = g.getPlayer(id); return p && p.isBot; });
    if (bot == null) return 'err.full';
    try { g.removePlayer(bot); } catch (e) { logError('room ' + room.code + ' removePlayer(bot)', e); return 'err.full'; }
  }
  let p = null;
  try {
    p = g.addPlayer({ id: client.id, name: client.name, color: client.color, hat: client.hat, isBot: !!client.agent });
    if (p && client.agent) p.agent = true;
    if (p && g.lang == null) g.lang = client.lang || 'az';
  } catch (e) {
    logError('room ' + room.code + ' addPlayer', e);
    return 'net.server';
  }
  if (!p) return 'err.full';
  client.pid = p.id;
  client.room = room;
  room.members.set(p.id, client);
  room.collect();
  ensureHost(room);
  room.forceSnap = true;
  return null;
}

function removeFromRoom(client, why) {
  const room = client.room;
  if (!room) return;
  const pid = client.pid;
  const name = room.nameOf(pid);
  client.room = null;
  client.pid = null;
  client.pendingMove = null;
  room.members.delete(pid);
  try { room.game.removePlayer(pid); } catch (e) { logError('room ' + room.code + ' removePlayer', e); }
  room.collect();
  if (room.members.size === 0) {
    rooms.delete(room.code);
    log('[' + room.code + '] ' + name + ' ' + why + ' - room closed (' + rooms.size + ' open)');
    return;
  }
  ensureHost(room);
  room.forceSnap = true;
  log('[' + room.code + '] ' + name + ' ' + why + ' (' + room.members.size + ' online)');
}

// ------------------------------------------------------------------ message handlers
function onHello(client, m) {
  if (m.v !== AS.PROTOCOL) {
    client.badVersion = true;
    sendErr(client, 'net.version');
    return;
  }
  client.badVersion = false;
  client.name = cleanName(m.name) || 'Ulduz';
  client.color = typeof m.color === 'string' && AS.COLOR_BY_ID[m.color] ? m.color : null;
  client.hat = typeof m.hat === 'string' && AS.HATS.indexOf(m.hat) >= 0 ? m.hat : 'none';
  client.hello = true;
  // The agent flag decides who receives observe() (with its private bot data), so it is fixed once the client
  // is in a room: a human re-sending hello mid-match must not turn into an "agent".
  if (!client.room) client.agent = m.agent === true;
  client.lang = m.lang === 'en' ? 'en' : 'az';
  send(client, { t: 'welcome', id: client.id });
}

// create/join without a hello use the default profile; a client that announced another protocol version can't play.
function readyToPlay(client) {
  if (client.badVersion) {
    sendErr(client, 'net.version');
    return false;
  }
  client.hello = true;
  return true;
}

function onCreate(client) {
  if (!readyToPlay(client)) return;
  if (!gameAvailable()) return sendErr(client, 'net.server');
  if (client.room) removeFromRoom(client, 'switched rooms');
  if (rooms.size >= MAX_ROOMS) return sendErr(client, 'net.busy');
  const code = makeCode();
  if (!code) return sendErr(client, 'net.busy');
  let room;
  try {
    room = new Room(code);
  } catch (e) {
    logError('create room', e);
    return sendErr(client, 'net.server');
  }
  rooms.set(code, room);
  const err = addToRoom(room, client);
  if (err) {
    rooms.delete(code);
    return sendErr(client, err);
  }
  log('[' + code + '] created by ' + client.name + ' (' + client.ip + '), ' + rooms.size + ' open');
  sendRoom(room, client);
}

function onJoin(client, m) {
  if (!readyToPlay(client)) return;
  const code = String(m.code == null ? '' : m.code).toUpperCase().replace(/[^A-Z]/g, '');
  const room = code.length === 4 ? rooms.get(code) : null;
  if (!room) return sendErr(client, 'err.noRoom');
  if (client.room === room) return sendRoom(room, client);
  if (room.game.phase !== 'lobby') return sendErr(client, 'err.inProgress');
  if (client.room) removeFromRoom(client, 'switched rooms');
  const err = addToRoom(room, client);
  if (err) return sendErr(client, err);
  log('[' + code + '] ' + client.name + ' joined (' + room.playerCount() + '/' + T.MAX_LOBBY + ')');
  sendRoom(room, client);
}

function countErrorsFor(room, pid) {
  let n = 0;
  for (const e of room.pending) if (e.type === 'error' && sameId(e.to, pid)) n++;
  return n;
}

// Moves are coalesced: only the newest one per client is applied, at the next tick. Packets that arrive bunched
// up after network jitter then count as one longer step, instead of several "instant" jumps the game's
// plausibility check would reject (which would snap the player back).
function flushMove(room, client) {
  const mv = client.pendingMove;
  if (!mv) return;
  client.pendingMove = null;
  try { room.game.applyAction(client.pid, mv); } catch (e) { logError('room ' + room.code + ' applyAction move', e); }
}

function onAct(client, a) {
  const room = client.room;
  if (!room) return;
  const action = sanitizeAction(a, room.game);
  if (!action) return;
  if (action.type === 'move') {
    client.pendingMove = action;
    return;
  }
  flushMove(room, client); // keep ordering: position first, then the action that depends on it
  const before = countErrorsFor(room, client.pid);
  let res;
  try {
    res = room.game.applyAction(client.pid, action);
  } catch (e) {
    logError('room ' + room.code + ' applyAction ' + action.type, e);
    res = { ok: false, err: 'internal' };
  }
  room.collect();
  if (res && res.ok === false && countErrorsFor(room, client.pid) === before) {
    room.pending.push({ type: 'error', to: client.pid, err: res.err || 'invalid', action: action.type });
  }
  room.forceSnap = true;
}

function onMessage(client, data, isBinary) {
  client.alive = true;
  client.lastSeen = Date.now();
  if (isBinary) return;
  const now = client.lastSeen;
  if (now - client.winStart >= 1000) {
    client.winStart = now;
    client.winCount = 0;
  }
  client.winCount++;
  if (client.winCount > RATE_LIMIT) {
    if (client.winCount === RATE_LIMIT + 1) log('[conn ' + client.id + '] rate limited (' + client.ip + ')');
    if (client.winCount > RATE_KICK) client.ws.close(1008, 'Too many messages');
    return;
  }
  if (typeof data !== 'string' || data.length > MAX_APP_MESSAGE) return;
  let m;
  try { m = JSON.parse(data); } catch (e) { return; }
  if (!m || typeof m !== 'object' || typeof m.t !== 'string') return;
  try {
    switch (m.t) {
      case 'hello': onHello(client, m); break;
      case 'create': onCreate(client); break;
      case 'join': onJoin(client, m); break;
      case 'act': onAct(client, m.a); break;
      case 'leave': removeFromRoom(client, 'left'); break;
      default: break;
    }
  } catch (e) {
    logError('message ' + m.t, e);
    sendErr(client, 'net.server');
  }
}

function onConnection(ws, req) {
  const ip = ((req.headers['x-forwarded-for'] || '').split(',')[0].trim() || ws.remoteAddress || '?').replace(/^::ffff:/, '');
  if (clients.size >= MAX_CONNECTIONS) {
    ws.close(1013, 'Server full');
    return;
  }
  const client = {
    id: 'p' + (nextClientId++).toString(36),
    ws, ip, pid: null, room: null, hello: false, badVersion: false, pendingMove: null,
    name: 'Ulduz', color: null, hat: 'none',
    alive: true, connectedAt: Date.now(), lastSeen: Date.now(), winStart: 0, winCount: 0,
  };
  clients.add(client);
  ws.on('message', (data, isBinary) => onMessage(client, data, isBinary));
  ws.on('pong', () => { client.alive = true; });
  ws.on('close', () => {
    clients.delete(client);
    try { removeFromRoom(client, 'disconnected'); } catch (e) { logError('disconnect', e); }
  });
}

// ------------------------------------------------------------------ simulation loop
const TICK_MS = T.TICK * 1000;
let loopLast = process.hrtime.bigint();
let loopAcc = 0;

function logRoomEvents(room, evs) {
  for (const e of evs) {
    if (e.type === 'phase') {
      if (e.phase === 'intro') log('[' + room.code + '] game started with ' + room.playerCount() + ' players');
      else if (e.phase === 'lobby' && e.prev === 'ended') log('[' + room.code + '] back to lobby');
    } else if (e.type === 'gameEnd') {
      log('[' + room.code + '] ' + e.winner + ' won (' + e.reason + ')');
    }
  }
}

function tickRoom(room) {
  const g = room.game;
  for (const c of room.members.values()) flushMove(room, c);
  if (director) { try { director.tick(g); } catch (e) { logError('room ' + room.code + ' director', e); } }
  try { g.tick(T.TICK); } catch (e) { logError('room ' + room.code + ' tick', e); }
  room.collect();
  room.tickNo++;
  const evs = room.pending;
  room.pending = [];
  const snapNow = room.forceSnap || evs.length > 0 || room.tickNo % Math.max(1, Math.round(1 / (T.TICK * T.SNAPSHOT_HZ))) === 0;
  room.forceSnap = false;
  if (evs.length) logRoomEvents(room, evs);
  for (const [pid, c] of room.members) {
    if (evs.length) {
      const mine = [];
      for (const e of evs) if (e.to == null || sameId(e.to, pid)) mine.push(e);
      if (mine.length) send(c, { t: 'ev', e: mine });
    }
    if (snapNow && !c.agent) sendSnap(room, c);
    if (c.agent && room.tickNo % 8 === 0) {
      let o = null;
      try { o = g.observe ? g.observe(pid, { map: !c.sentMap, lang: c.lang }) : null; } catch (e) { logError('observe', e); }
      if (o) { c.sentMap = true; send(c, { t: 'obs', o }, true); }
    }
  }
}

function loop() {
  const nowNs = process.hrtime.bigint();
  let el = Number(nowNs - loopLast) / 1e6;
  loopLast = nowNs;
  if (el > 250) el = 250; // after a stall (sleep/debugger) don't try to catch up for seconds
  loopAcc += el;
  let n = 0;
  while (loopAcc >= TICK_MS && n < 5) {
    loopAcc -= TICK_MS;
    n++;
    for (const room of rooms.values()) tickRoom(room);
  }
  if (n >= 5) loopAcc = 0;
}

function heartbeat() {
  const now = Date.now();
  for (const c of clients) {
    if (c.ws.readyState !== wsLib.OPEN) continue;
    if (!c.alive) {
      log('[conn ' + c.id + '] no response, dropping');
      c.ws.terminate();
      continue;
    }
    if (!c.hello && now - c.connectedAt > HELLO_TIMEOUT_MS) {
      c.ws.close(1008, 'No hello');
      continue;
    }
    c.alive = false;
    c.ws.ping();
  }
}

// ------------------------------------------------------------------ startup
function lanAddresses() {
  const out = [];
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) {
    for (const a of ifs[name] || []) {
      const fam = typeof a.family === 'string' ? a.family : a.family === 4 ? 'IPv4' : 'IPv6';
      if (fam !== 'IPv4' || a.internal || a.address.startsWith('169.254.')) continue;
      out.push({ name, address: a.address });
    }
  }
  const score = (x) => {
    let s = 0;
    if (/^192\.168\./.test(x.address)) s -= 3;
    else if (/^10\./.test(x.address)) s -= 2;
    else if (/^172\.(1[6-9]|2\d|3[01])\./.test(x.address)) s -= 1;
    if (/wi-?fi|wlan|wireless|ethernet|^eth|^en\d|^wl/i.test(x.name)) s -= 2;
    if (/vEthernet|virtual|vbox|vmware|wsl|hyper-v|docker|loopback|bluetooth|tailscale|zerotier|hamachi|vpn|tap|tun/i.test(x.name)) s += 10;
    return s;
  };
  return out.sort((a, b) => score(a) - score(b));
}

function printBanner() {
  const line = '  ' + '-'.repeat(62);
  const lines = ['', '  * AI IMPOSTOR: SPACE SHIP - server işləyir / server is running', line];
  lines.push('  Bu kompüterdə / On this computer:      http://localhost:' + PORT + '/');
  if (HOST === '127.0.0.1' || HOST === 'localhost' || HOST === '::1') {
    lines.push('  (HOST=' + HOST + ': yalnız bu kompüter / only this computer)');
  } else {
    const ips = lanAddresses();
    if (ips.length) {
      lines.push('  Dostlar üçün (eyni Wi-Fi) / Friends on the same Wi-Fi:');
      for (const ip of ips) lines.push('      http://' + ip.address + ':' + PORT + '/' + '   (' + ip.name + ')');
    } else {
      lines.push('  Şəbəkə tapılmadı / No network adapter found (Wi-Fi?)');
    }
  }
  lines.push(line);
  lines.push('  AI chat answers: ' + (gemini ? 'Gemini ' + gemini : 'built-in (set GEMINI_API_KEY in .env)'));
  lines.push('  AI movement:     ' + (groq ? 'Groq ' + groq : 'built-in (set GROQ_API_KEY in .env)'));
  lines.push(line);
  if (coreProblems.length) lines.push('  ! Problem: ' + coreProblems.join(', '));
  lines.push('  Dayandırmaq üçün / To stop: Ctrl+C', '');
  console.log(lines.join('\n'));
}

const server = http.createServer((req, res) => {
  try {
    serveStatic(req, res);
  } catch (e) {
    logError('http', e);
    sendText(res, 500, 'Internal Server Error');
  }
});
server.on('clientError', (err, socket) => {
  try { socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); } catch (e) { /* ignore */ }
});
wsLib.attach(server, { path: '/ws', maxPayload: 1 << 20, onConnection });

server.on('error', (e) => {
  if (e && e.code === 'EADDRINUSE') {
    console.error('\n  Port ' + PORT + ' artıq istifadə olunur (bəlkə server artıq açıqdır?).');
    console.error('  Port ' + PORT + ' is already in use (is the server already running?).');
    console.error('  Başqa port / Another port:  set PORT=3001 && node server\\server.js\n');
  } else if (e && e.code === 'EACCES') {
    console.error('\n  Port ' + PORT + ' üçün icazə yoxdur / Permission denied for port ' + PORT + '\n');
  } else {
    console.error('Server error:', e);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  printBanner();
  log('listening on ' + HOST + ':' + PORT);
});

const loopTimer = setInterval(loop, 5);
const beatTimer = setInterval(heartbeat, HEARTBEAT_MS);

process.on('uncaughtException', (e) => logError('uncaught', e));
process.on('unhandledRejection', (e) => logError('unhandled rejection', e));

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  log('shutting down');
  clearInterval(loopTimer);
  clearInterval(beatTimer);
  for (const c of clients) { try { c.ws.close(1001, 'Server shutting down'); } catch (e) { /* ignore */ } }
  try { server.close(); } catch (e) { /* ignore */ }
  setTimeout(() => process.exit(0), 300).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
