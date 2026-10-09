#!/usr/bin/env node
'use strict';
/* AI IMPOSTOR: SPACE SHIP — network test: spawns server/server.js on 127.0.0.1:3107 and checks
 *   static serving (index, js mime, 304, HEAD, 404/405, traversal + dotfiles blocked, no directory listing),
 *   raw RFC 6455 behaviour (accept key, fragmentation + interleaved ping, 16/64-bit lengths, 1 MB limit -> 1009,
 *   unmasked frame -> 1002, close handshake, bad upgrades),
 *   the room protocol with 2-13 Node WebSocket clients (hello/create/join, snapshots at ~15 Hz, events, private
 *   'to' filtering, host-only actions, settings merge, colorTaken, moves + tp, rate limit, start -> intro -> playing,
 *   join in progress rejected, full rooms, bots making space for humans, host migration to a human, room deletion).
 *
 *   node tools/test-net.js [--stub] [--verbose]
 * Uses the real js/core game when it loads and works in Node; otherwise (or with --stub) a tiny stub game that
 * follows the contract, injected through the server's AS_PRELOAD hook.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const http = require('http');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const PORT = 3107;
const HOST = '127.0.0.1';
const WS_URL = 'ws://' + HOST + ':' + PORT + '/ws';
const VERBOSE = process.argv.includes('--verbose');
const FORCE_STUB = process.argv.includes('--stub');
const CORE = ['ns.js', 'constants.js', 'i18n.js', 'map.js', 'geometry.js', 'game.js', 'bots.js'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0, passes = 0;
function check(name, ok, detail) {
  if (ok) { passes++; console.log('  ok   ' + name); }
  else { failures++; console.log('  FAIL ' + name + (detail !== undefined ? '  -> ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); }
  return !!ok;
}
function section(t) { console.log('\n' + t); }

// ------------------------------------------------------------------ stub game (contract-shaped, protocol tests only)
const STUB_SRC = `(function (AS) {
  'use strict';
  const T = AS.T;
  class StubGame {
    constructor(o) {
      o = o || {};
      this.settings = AS.sanitizeSettings(o.settings); this.phase = 'lobby'; this.map = { id: 'starship' };
      this.players = new Map(); this.order = []; this.hostId = null; this.events = []; this.time = 0;
      this.countdown = null; this.cd = 0; this.timer = null; this.botN = 0;
    }
    emit(e) { this.events.push(e); }
    freeColor(want) {
      const used = new Set(); for (const p of this.players.values()) if (!p.left) used.add(p.color);
      if (want && AS.COLOR_BY_ID[want] && !used.has(want)) return want;
      const c = AS.COLORS.find((k) => !used.has(k.id)); return c ? c.id : 'red';
    }
    addPlayer(o) {
      if (this.phase !== 'lobby' || this.order.length >= T.MAX_LOBBY) return null;
      const id = o.id != null ? String(o.id) : 'bot' + (++this.botN);
      const p = { id, name: o.name || 'P', color: this.freeColor(o.color), hat: o.hat || 'none', isBot: !!o.isBot,
        x: 200 + this.order.length * 40, y: 300, facing: 1, moving: false, tp: 0, role: null, alive: true, left: false };
      this.players.set(id, p); this.order.push(id);
      if (this.hostId == null && !p.isBot) this.hostId = id;
      this.emit({ type: 'join', player: id });
      return p;
    }
    addBot() { return this.addPlayer({ name: AS.BOT_NAMES[this.botN % AS.BOT_NAMES.length], isBot: true }); }
    removePlayer(id) {
      const p = this.players.get(id); if (!p) return;
      if (this.phase === 'lobby') { this.players.delete(id); this.order = this.order.filter((x) => x !== id); }
      else { p.left = true; p.alive = false; }
      this.emit({ type: 'leave', player: id });
      if (this.hostId === id) { // deliberately naive: may pick a bot (the server must fix that)
        this.hostId = this.order.find((x) => x !== id && !this.players.get(x).left) || null;
        if (this.hostId) this.emit({ type: 'host', player: this.hostId });
      }
    }
    getPlayer(id) { return this.players.get(id) || null; }
    setRolePreference() {}
    applyAction(id, a) {
      const p = this.players.get(id); if (!p) return { ok: false, err: 'noPlayer' };
      const host = id === this.hostId;
      switch (a.type) {
        case 'move':
          if (a.tp !== p.tp) return { ok: false, err: 'tp' };
          if (this.phase !== 'lobby' && this.phase !== 'playing') return { ok: false, err: 'phase' };
          p.x = a.x; p.y = a.y; p.facing = a.facing; p.moving = a.moving; return { ok: true };
        case 'setLook':
          if (this.phase !== 'lobby') return { ok: false, err: 'phase' };
          if (a.color && a.color !== p.color) {
            for (const q of this.players.values()) if (q !== p && q.color === a.color) return { ok: false, err: 'colorTaken' };
            p.color = a.color;
          }
          if (a.name) p.name = a.name; if (a.hat) p.hat = a.hat; return { ok: true };
        case 'settings': if (!host) return { ok: false, err: 'notHost' }; this.settings = AS.sanitizeSettings(a.settings); return { ok: true };
        case 'addBot': if (!host) return { ok: false, err: 'notHost' }; return this.addBot() ? { ok: true } : { ok: false, err: 'full' };
        case 'removeBot': if (!host) return { ok: false, err: 'notHost' }; this.removePlayer(a.id); return { ok: true };
        case 'start':
          if (!host) return { ok: false, err: 'notHost' };
          if (this.phase !== 'lobby' || this.countdown != null) return { ok: false, err: 'phase' };
          if (this.order.length < T.MIN_PLAYERS) return { ok: false, err: 'needPlayers' };
          this.countdown = T.LOBBY_COUNTDOWN; this.cd = 1; this.emit({ type: 'countdown', n: this.countdown }); return { ok: true };
        default: return { ok: false, err: 'unsupported' };
      }
    }
    setPhase(ph) { const prev = this.phase; this.phase = ph; this.emit({ type: 'phase', phase: ph, prev }); }
    tick(dt) {
      this.time += dt;
      if (this.countdown != null) {
        this.cd -= dt;
        if (this.cd <= 0) {
          this.countdown--; this.cd += 1;
          if (this.countdown <= 0) {
            this.countdown = null;
            for (const p of this.players.values()) { p.tp++; p.role = 'crew'; }
            this.players.get(this.order[this.order.length - 1]).role = 'impostor';
            this.timer = T.INTRO_TIME; this.setPhase('intro');
          } else this.emit({ type: 'countdown', n: this.countdown });
        }
      } else if (this.phase === 'intro') {
        this.timer -= dt; if (this.timer <= 0) { this.timer = null; this.setPhase('playing'); }
      }
      if (this.phase === 'playing' && Math.floor(this.time) !== Math.floor(this.time - dt)) {
        for (const id of this.order) { const q = this.players.get(id); if (!q.isBot && !q.left) this.emit({ type: 'taskStep', to: id, task: 't1', step: 0, done: false }); }
      }
    }
    drainEvents() { const e = this.events; this.events = []; return e; }
    snapshotFor(viewer) {
      const me = this.players.get(viewer);
      return {
        v: 1, t: this.time, phase: this.phase, mapId: 'starship', hostId: this.hostId, you: viewer,
        timer: this.timer, countdown: this.countdown, settings: this.settings,
        players: this.order.map((id) => { const p = this.players.get(id); return { id, name: p.name, color: p.color, hat: p.hat, isBot: p.isBot,
          isHost: id === this.hostId, alive: p.alive, left: p.left, x: p.x, y: p.y, facing: p.facing, moving: p.moving, tp: p.tp,
          role: id === viewer ? p.role : undefined }; }),
        bodies: [], self: me ? { role: me.role, alive: me.alive, tasks: [] } : null, taskProgress: 0, sabotage: null, doors: {},
        meeting: null, ejection: null, result: null,
      };
    }
  }
  AS.Game = StubGame;
})(globalThis.AS = globalThis.AS || {});
`;

function realCoreProblem() {
  try {
    for (const f of CORE) {
      const p = path.join(ROOT, 'js', 'core', f);
      if (!fs.existsSync(p)) return f + ' missing';
      require(p);
    }
    const AS = globalThis.AS;
    if (typeof AS.Game !== 'function') return 'AS.Game missing';
    const g = new AS.Game({ mapId: 'starship', settings: AS.sanitizeSettings({}), seed: 7, isServer: true });
    const p = g.addPlayer({ id: 'probe1', name: 'Probe', isBot: false });
    if (!p) return 'addPlayer returned null';
    for (let i = 0; i < 4; i++) g.addBot();
    for (let i = 0; i < 5; i++) g.tick(AS.T.TICK);
    g.drainEvents();
    const s = g.snapshotFor(p.id);
    if (!s || !Array.isArray(s.players) || s.players.length !== 5) return 'snapshot shape';
    JSON.stringify(s);
    return null;
  } catch (e) {
    return 'throws: ' + (e && e.message);
  }
}

// ------------------------------------------------------------------ helpers: http, raw ws, json client
function httpReq(method, p, headers) {
  return new Promise((resolve) => {
    const req = http.request({ host: HOST, port: PORT, method, path: p, headers: headers || {} }, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', (e) => resolve({ status: 0, error: e.message, headers: {}, body: '' }));
    req.end();
  });
}

function expectedAccept(key) {
  return crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
}

function makeFrame(op, payload, o) {
  o = o || {};
  const fin = o.fin !== false, mask = o.mask !== false;
  payload = Buffer.isBuffer(payload) ? payload : Buffer.from(payload == null ? '' : String(payload));
  const len = payload.length;
  let h;
  if (len < 126) { h = Buffer.alloc(2); h[1] = len; }
  else if (len < 65536) { h = Buffer.alloc(4); h[1] = 126; h.writeUInt16BE(len, 2); }
  else { h = Buffer.alloc(10); h[1] = 127; h.writeBigUInt64BE(BigInt(len), 2); }
  h[0] = (fin ? 0x80 : 0) | (o.rsv || 0) | op;
  if (!mask) return Buffer.concat([h, payload]);
  h[1] |= 0x80;
  const key = crypto.randomBytes(4);
  const body = Buffer.alloc(len);
  for (let i = 0; i < len; i++) body[i] = payload[i] ^ key[i & 3];
  return Buffer.concat([h, key, body]);
}

function parseServerFrame(b) {
  if (b.length < 2) return null;
  const fin = !!(b[0] & 0x80), op = b[0] & 0x0f, masked = !!(b[1] & 0x80);
  let len = b[1] & 0x7f, off = 2;
  if (len === 126) { if (b.length < 4) return null; len = b.readUInt16BE(2); off = 4; }
  else if (len === 127) { if (b.length < 10) return null; len = Number(b.readBigUInt64BE(2)); off = 10; }
  if (masked) off += 4;
  if (b.length < off + len) return null;
  return { fin, op, masked, payload: b.subarray(off, off + len), size: off + len };
}

class RawConn {
  constructor(sock, rest) {
    this.sock = sock;
    this.buf = Buffer.alloc(0);
    this.frames = [];
    this.ended = false;
    this.waiters = new Set();
    sock.removeAllListeners('data');
    sock.on('data', (d) => this.feed(d));
    sock.on('close', () => { this.ended = true; this.notify(); });
    sock.on('error', () => { /* server may reset after a protocol error */ });
    if (rest && rest.length) this.feed(rest);
  }
  feed(d) {
    this.buf = Buffer.concat([this.buf, d]);
    for (;;) {
      const f = parseServerFrame(this.buf);
      if (!f) break;
      this.buf = this.buf.subarray(f.size);
      this.frames.push(f);
    }
    this.notify();
  }
  notify() { for (const w of Array.from(this.waiters)) w(); }
  write(buf) { try { this.sock.write(buf); } catch (e) { /* ignore */ } }
  waitFrame(pred, ms) {
    return new Promise((resolve) => {
      let i = 0;
      const test = () => {
        for (; i < this.frames.length; i++) if (pred(this.frames[i])) { done(this.frames[i]); return; }
        if (this.ended) done(null);
      };
      const timer = setTimeout(() => done(null), ms || 3000);
      const done = (v) => { clearTimeout(timer); this.waiters.delete(test); resolve(v); };
      this.waiters.add(test);
      test();
    });
  }
  waitEnd(ms) {
    return new Promise((resolve) => {
      const test = () => { if (this.ended) done(true); };
      const timer = setTimeout(() => done(false), ms || 3000);
      const done = (v) => { clearTimeout(timer); this.waiters.delete(test); resolve(v); };
      this.waiters.add(test);
      test();
    });
  }
  destroy() { try { this.sock.destroy(); } catch (e) { /* ignore */ } }
}

function rawUpgrade(p, headers) {
  return new Promise((resolve) => {
    const key = (headers && headers.key) || crypto.randomBytes(16).toString('base64');
    const sock = net.connect(PORT, HOST);
    let buf = Buffer.alloc(0), done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    sock.on('error', (e) => finish({ status: 0, error: e.message }));
    sock.on('connect', () => {
      const h = { Host: HOST + ':' + PORT, Upgrade: 'websocket', Connection: 'Upgrade', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13' };
      for (const k in headers || {}) if (k !== 'key') { if (headers[k] == null) delete h[k]; else h[k] = headers[k]; }
      let req = 'GET ' + p + ' HTTP/1.1\r\n';
      for (const k in h) req += k + ': ' + h[k] + '\r\n';
      sock.write(req + '\r\n');
    });
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      const i = buf.indexOf('\r\n\r\n');
      if (i < 0) return;
      const head = buf.subarray(0, i).toString();
      const status = Number(head.split(' ')[1]);
      const accept = (/sec-websocket-accept:\s*(\S+)/i.exec(head) || [])[1];
      if (status !== 101) { sock.destroy(); finish({ status, head }); return; }
      finish({ status, head, accept, expected: expectedAccept(key), conn: new RawConn(sock, buf.subarray(i + 4)) });
    });
    setTimeout(() => { sock.destroy(); finish({ status: 0, error: 'timeout' }); }, 4000);
  });
}

class Client {
  constructor(label) {
    this.label = label;
    this.msgs = [];
    this.events = [];
    this.errs = [];
    this.snap = null;
    this.snapTimes = [];
    this.id = null;
    this.code = null;
    this.closed = false;
    this.closeCode = null;
    this.waiters = new Set();
  }
  connect() {
    return new Promise((resolve, reject) => {
      const ws = (this.ws = new WebSocket(WS_URL));
      const t = setTimeout(() => reject(new Error(this.label + ' connect timeout')), 4000);
      ws.onopen = () => { clearTimeout(t); resolve(this); };
      ws.onerror = () => { /* surfaced through onclose / timeouts */ };
      ws.onclose = (e) => { this.closed = true; this.closeCode = e.code; this.notify(); };
      ws.onmessage = (e) => {
        let m;
        try { m = JSON.parse(e.data); } catch (err) { return; }
        this.msgs.push(m);
        if (m.t === 'welcome') this.id = m.id;
        else if (m.t === 'room') { this.code = m.code; this.id = m.you; }
        else if (m.t === 'err') this.errs.push(m.key);
        else if (m.t === 'snap') { this.snap = m.s; this.snapTimes.push(Date.now()); }
        else if (m.t === 'ev') for (const ev of m.e) this.events.push(ev);
        this.notify();
      };
    });
  }
  notify() { for (const w of Array.from(this.waiters)) w(); }
  send(o) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  act(a) { this.send({ t: 'act', a }); }
  // Resolve with the first message (index >= since) matching pred, or null on timeout.
  waitMsg(pred, ms, since) {
    let i = since == null ? this.msgs.length : since;
    return new Promise((resolve) => {
      const test = () => {
        for (; i < this.msgs.length; i++) if (pred(this.msgs[i])) { done(this.msgs[i]); return; }
        if (this.closed) done(null);
      };
      const timer = setTimeout(() => done(null), ms || 3000);
      const done = (v) => { clearTimeout(timer); this.waiters.delete(test); resolve(v); };
      this.waiters.add(test);
      test();
    });
  }
  // Resolve with the current or next snapshot matching pred.
  waitSnap(pred, ms) {
    return new Promise((resolve) => {
      const test = () => { if (this.snap && pred(this.snap)) done(this.snap); else if (this.closed) done(null); };
      const timer = setTimeout(() => done(null), ms || 3000);
      const done = (v) => { clearTimeout(timer); this.waiters.delete(test); resolve(v); };
      this.waiters.add(test);
      test();
    });
  }
  waitEvent(pred, ms, since) {
    return this.waitMsg((m) => m.t === 'ev' && m.e.some(pred), ms, since).then((m) => (m ? m.e.find(pred) : null));
  }
  player(id) { return this.snap && this.snap.players.find((p) => String(p.id) === String(id == null ? this.id : id)); }
  close() { try { this.ws.close(); } catch (e) { /* ignore */ } }
}

async function hello(label, profile) {
  const c = await new Client(label).connect();
  c.send(Object.assign({ t: 'hello', v: 1, name: label, color: null, hat: 'none' }, profile || {}));
  await c.waitMsg((m) => m.t === 'welcome' || m.t === 'err', 3000, 0);
  return c;
}

// ------------------------------------------------------------------ main
(async () => {
  const problem = FORCE_STUB ? 'forced with --stub' : realCoreProblem();
  const env = Object.assign({}, process.env, { HOST, PORT: String(PORT) });
  delete env.AS_PRELOAD;
  if (problem) {
    const stubPath = path.join(ROOT, 'tools', 'out', 'stub-game.js');
    fs.mkdirSync(path.dirname(stubPath), { recursive: true });
    fs.writeFileSync(stubPath, STUB_SRC);
    env.AS_PRELOAD = stubPath;
    console.log('Game core: STUB (' + problem + ')');
  } else {
    console.log('Game core: real js/core');
  }

  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'server.js')], { env, cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let serverOut = '';
  child.stdout.on('data', (d) => { serverOut += d; if (VERBOSE) process.stdout.write('    [server] ' + d); });
  child.stderr.on('data', (d) => { serverOut += d; if (VERBOSE) process.stdout.write('    [server!] ' + d); });
  const kill = () => { try { child.kill(); } catch (e) { /* ignore */ } };
  process.on('exit', kill);
  const t0 = Date.now();
  while (!/listening on/.test(serverOut) && Date.now() - t0 < 8000 && child.exitCode == null) await sleep(50);
  if (!/listening on/.test(serverOut)) {
    console.log('Server did not start:\n' + serverOut);
    kill();
    process.exit(1);
  }
  const clients = [];
  const track = (c) => { clients.push(c); return c; };

  try {
    // ---------------------------------------------------------------- static files
    section('Static files');
    let r = await httpReq('GET', '/');
    check('GET / -> index.html', r.status === 200 && /text\/html/.test(r.headers['content-type']) && r.body.includes('id="world"'), r.status);
    r = await httpReq('GET', '/js/core/ns.js');
    check('GET /js/core/ns.js -> javascript mime', r.status === 200 && /javascript/.test(r.headers['content-type']), r.headers['content-type']);
    const etag = r.headers.etag;
    r = await httpReq('GET', '/js/core/ns.js', { 'If-None-Match': etag });
    check('If-None-Match -> 304', r.status === 304, r.status);
    r = await httpReq('HEAD', '/index.html');
    check('HEAD /index.html -> 200 without body', r.status === 200 && r.body === '' && Number(r.headers['content-length']) > 0, r.status);
    r = await httpReq('GET', '/nope-404.js');
    check('missing file -> 404', r.status === 404, r.status);
    r = await httpReq('POST', '/');
    check('POST -> 405', r.status === 405, r.status);
    r = await httpReq('GET', '/js/');
    check('directory without index -> 404 (no listing)', r.status === 404, r.status);
    r = await httpReq('GET', '/js');
    check('directory path -> 404 (no listing)', r.status === 404, r.status);
    for (const p of ['/../../../../Windows/win.ini', '/..%2f..%2f..%2f..%2fWindows%2fwin.ini', '/..%5c..%5c..%5c..%5cWindows%5cwin.ini',
      '/%2e%2e/%2e%2e/%2e%2e/%2e%2e/Windows/win.ini', '/js/..%5c..%5c..%5c..%5c..%5cWindows%5cwin.ini', '/C:/Windows/win.ini', '/C:%5cWindows%5cwin.ini']) {
      r = await httpReq('GET', p);
      check('traversal blocked: ' + p, r.status !== 200 && !/\[fonts\]|for 16-bit/i.test(r.body), r.status);
    }
    r = await httpReq('GET', '/.git/config');
    check('dotfiles hidden', r.status === 404, r.status);
    r = await httpReq('GET', '/index.html%00.js');
    check('NUL byte rejected', r.status === 400 || r.status === 404, r.status);
    // a real file in the log dir, so a 404 means "blocked", not "missing"
    const probeLog = path.join(ROOT, 'logs', 'net-test-probe.jsonl');
    fs.mkdirSync(path.dirname(probeLog), { recursive: true });
    fs.writeFileSync(probeLog, '{"authorType":"ai"}\n');
    try {
      for (const p of ['/logs/net-test-probe.jsonl', '/LOGS/net-test-probe.jsonl', '/server/server.js', '/server/prompts/ai_chat_prompt.txt']) {
        r = await httpReq('GET', p);
        check('server-only file hidden: ' + p, r.status === 404 && !r.body.includes('authorType'), r.status);
      }
    } finally { try { fs.unlinkSync(probeLog); } catch (e) { /* ignore */ } }

    // ---------------------------------------------------------------- raw websocket protocol
    section('WebSocket (RFC 6455)');
    let u = await rawUpgrade('/ws', { key: 'dGhlIHNhbXBsZSBub25jZQ==' });
    check('101 + RFC sample accept key', u.status === 101 && u.accept === 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=', u.accept);
    if (u.conn) {
      const c = u.conn;
      c.write(makeFrame(0x1, '{"t":"hel', { fin: false }));
      c.write(makeFrame(0x9, 'png1'));
      c.write(makeFrame(0x0, 'lo","v":1,"name":"Raw"}', { fin: true }));
      const pong = await c.waitFrame((f) => f.op === 0xa);
      check('ping inside a fragmented message -> pong with payload', pong && pong.payload.toString() === 'png1', pong && pong.payload.toString());
      const wel = await c.waitFrame((f) => f.op === 0x1 && f.payload.toString().includes('welcome'));
      check('fragmented text message reassembled', !!wel);
      check('server frames are unmasked', c.frames.every((f) => !f.masked));
      c.write(makeFrame(0x1, JSON.stringify({ t: 'hello', v: 1, name: 'Raw16', pad: 'x'.repeat(400) })));
      const w16 = await c.waitFrame((f) => f.op === 0x1 && f.payload.toString().includes('welcome') && f !== wel);
      check('16-bit length frame', !!w16);
      c.write(makeFrame(0x1, JSON.stringify({ t: 'noop', pad: 'y'.repeat(70000) })));
      c.write(makeFrame(0x9, 'after64'));
      const p64 = await c.waitFrame((f) => f.op === 0xa && f.payload.toString() === 'after64');
      check('64-bit length frame parsed (stream stays in sync)', !!p64);
      c.write(makeFrame(0x8, Buffer.from([0x03, 0xe8])));
      const cl = await c.waitFrame((f) => f.op === 0x8);
      check('close handshake: close frame echoed (1000)', cl && cl.payload.length >= 2 && cl.payload.readUInt16BE(0) === 1000, cl && cl.payload);
      check('close handshake: server closes TCP', await c.waitEnd(3000));
    }
    u = await rawUpgrade('/ws');
    if (u.conn) {
      u.conn.write(makeFrame(0x1, '{"t":"x"}', { mask: false }));
      const cl = await u.conn.waitFrame((f) => f.op === 0x8);
      check('unmasked client frame -> close 1002', cl && cl.payload.readUInt16BE(0) === 1002, cl && cl.payload);
      u.conn.destroy();
    }
    u = await rawUpgrade('/ws');
    if (u.conn) {
      u.conn.write(makeFrame(0x1, Buffer.alloc(1200 * 1024, 0x61)));
      const cl = await u.conn.waitFrame((f) => f.op === 0x8, 4000);
      check('message > 1 MB -> close 1009', cl && cl.payload.readUInt16BE(0) === 1009, cl && cl.payload);
      u.conn.destroy();
    }
    u = await rawUpgrade('/ws');
    if (u.conn) {
      u.conn.write(makeFrame(0x1, Buffer.from([0x22, 0xff, 0xfe, 0x22])));
      const cl = await u.conn.waitFrame((f) => f.op === 0x8);
      check('invalid UTF-8 -> close 1007', cl && cl.payload.readUInt16BE(0) === 1007, cl && cl.payload);
      u.conn.destroy();
    }
    u = await rawUpgrade('/ws', { 'Sec-WebSocket-Key': null });
    check('upgrade without key -> 400', u.status === 400, u.status);
    u = await rawUpgrade('/elsewhere');
    check('upgrade on other path -> 404', u.status === 404, u.status);
    u = await rawUpgrade('/ws', { 'Sec-WebSocket-Version': '8' });
    check('unsupported version -> 426', u.status === 426, u.status);

    // ---------------------------------------------------------------- rooms
    section('Rooms and game protocol');
    const A = track(await hello('Alfa', { color: 'red', hat: 'crown' }));
    check('hello -> welcome with id', !!A.id, A.msgs[0]);
    A.send({ t: 'create' });
    const roomA = await A.waitMsg((m) => m.t === 'room' || m.t === 'err', 3000, 0);
    check('create -> room with 4-letter code', roomA && roomA.t === 'room' && /^[ABCDEFGHJKMNPRSTUVWXYZ]{4}$/.test(roomA.code), roomA);
    check('room.you equals welcome id', roomA && String(roomA.you) === String(A.msgs[0].id));
    let s = await A.waitSnap((x) => x.phase === 'lobby', 2000);
    check('first snapshot arrives with the room (lobby, 1 player, I am host)', s && s.players.length === 1 && String(s.hostId) === String(A.id) && String(s.you) === String(A.id), s && { phase: s.phase, n: s.players.length, host: s.hostId });
    const code = A.code;

    const B = track(await hello('Beta', { color: 'red' }));
    B.send({ t: 'join', code: code.toLowerCase() });
    const roomB = await B.waitMsg((m) => m.t === 'room' || m.t === 'err', 3000, 0);
    check('join (lowercase code accepted) -> room', roomB && roomB.t === 'room' && roomB.code === code, roomB);
    s = await B.waitSnap((x) => x.players.length === 2, 2000);
    check('B snapshot lists both players', !!s, B.snap && B.snap.players.length);
    check('requested taken color is replaced by a free one', s && B.player().color && B.player().color !== A.player(A.id) && B.player().color !== 'red', s && B.player());
    const joinEv = await A.waitEvent((e) => e.type === 'join', 2000, 0);
    check('A receives a join event', !!joinEv);

    // A human already in a room must not switch to "agent" (agents get observe(), which carries private bot data).
    const obsMark = B.msgs.length;
    B.send({ t: 'hello', v: 1, name: 'Beta', agent: true });
    await B.waitMsg((m) => m.t === 'welcome', 2000, obsMark);
    const obs = await B.waitMsg((m) => m.t === 'obs', 1500, obsMark);
    check('hello {agent:true} inside a room does not grant observations', obs === null, obs && Object.keys(obs.o || {}));
    check('...and snapshots keep coming', !!(await B.waitMsg((m) => m.t === 'snap', 1500, obsMark)));

    const C = track(await hello('Gamma', { v: 999 }));
    check('wrong protocol version -> err net.version', C.errs.includes('net.version'), C.errs);
    C.send({ t: 'hello', v: 1, name: 'Gamma' });
    await C.waitMsg((m) => m.t === 'welcome', 2000, 0);
    C.send({ t: 'join', code: 'ZZZZ' });
    await C.waitMsg((m) => m.t === 'err', 2000);
    check('unknown room -> err.noRoom', C.errs.includes('err.noRoom'), C.errs);
    C.send({ t: 'join', code: 'AB' });
    C.send({ t: 'join', code: 12345 });
    await sleep(300);
    check('malformed codes -> err.noRoom (no crash)', C.errs.filter((k) => k === 'err.noRoom').length >= 3, C.errs);

    // host-only actions + private error events
    const nBefore = A.snap.players.length;
    const evMarkA = A.msgs.length;
    B.act({ type: 'addBot' });
    const errB = await B.waitEvent((e) => e.type === 'error', 2000, 0);
    check('non-host addBot -> private error event to B', errB && String(errB.to) === String(B.id), errB);
    await sleep(250);
    check('error event is not sent to A', !A.msgs.slice(evMarkA).some((m) => m.t === 'ev' && m.e.some((e) => e.type === 'error')));
    check('non-host addBot ignored', A.snap.players.length === nBefore, A.snap.players.length);

    for (let i = 0; i < 3; i++) A.act({ type: 'addBot' });
    s = await A.waitSnap((x) => x.players.length === nBefore + 3, 2000);
    check('host adds 3 bots', !!s && s.players.filter((p) => p.isBot).length === 3, A.snap.players.length);

    const before = Object.assign({}, A.snap.settings);
    A.act({ type: 'settings', settings: { answerTime: 30 } });
    s = await A.waitSnap((x) => x.settings && x.settings.answerTime === 30, 2000);
    check('partial settings update merged', !!s && s.settings.votingTime === before.votingTime && s.settings.aiLevel === before.aiLevel, A.snap.settings);
    A.act({ type: 'settings', settings: { killCooldown: 'lots', aiLevel: 99 } });
    await sleep(250);
    check('invalid settings values sanitized', A.snap.settings.aiLevel <= 5 && typeof A.snap.settings.killCooldown === 'number', A.snap.settings);

    const bColor = B.player().color;
    A.act({ type: 'setLook', color: bColor });
    const ct = await A.waitEvent((e) => e.type === 'error' && e.err === 'colorTaken', 2000, 0);
    check('setLook with a taken color -> colorTaken', !!ct, ct);
    A.act({ type: 'setLook', name: '  Al\u0007fa  Prime  Extra Long Name ', hat: 'party' });
    s = await A.waitSnap((x) => { const p = x.players.find((q) => String(q.id) === String(A.id)); return p && p.hat === 'party'; }, 2000);
    const aName = s && s.players.find((q) => String(q.id) === String(A.id)).name;
    check('setLook name cleaned + trimmed to 12 chars', !!aName && aName.length <= 12 && !aName.includes('\u0007'), aName);

    // movement
    const meA = A.player();
    const tx = meA.x + 6, ty = meA.y;
    A.act({ type: 'move', x: tx, y: ty, facing: -1, moving: true, tp: meA.tp });
    s = await B.waitSnap((x) => { const p = x.players.find((q) => String(q.id) === String(A.id)); return p && p.x != null && Math.abs(p.x - tx) < 0.5; }, 2000);
    check('move accepted and visible to others', !!s, B.player(A.id));
    check('facing transmitted', s && B.player(A.id).facing === -1, s && B.player(A.id).facing);
    A.act({ type: 'move', x: tx + 5, y: ty, facing: 1, moving: false, tp: meA.tp + 50 });
    await sleep(300);
    check('move with stale tp ignored', Math.abs(B.player(A.id).x - tx) < 0.5, B.player(A.id).x);
    A.act({ type: 'move', x: 'NaN', y: null, tp: meA.tp });
    A.send({ t: 'act', a: null });
    A.send({ t: 'act', a: { type: 'nonsense' } });
    A.send({ t: 'act', a: { type: 'kill', target: { nested: true } } });
    A.ws.send('not json at all');
    await sleep(200);
    check('garbage input ignored, connection alive', !A.closed && A.ws.readyState === 1);

    // snapshot rate
    await sleep(300);
    const sinceT = Date.now();
    await sleep(2000);
    const rate = B.snapTimes.filter((t) => t >= sinceT).length / 2;
    check('snapshot rate ~15 Hz (got ' + rate.toFixed(1) + '/s)', rate >= 11 && rate <= 22, rate);

    // rate limit
    await sleep(1100);
    const hatBefore = B.player().hat;
    for (let i = 0; i < 75; i++) B.send({ t: 'noop', i });
    B.act({ type: 'setLook', hat: 'wizard' });
    await sleep(500);
    check('messages beyond 60/s are ignored', B.player().hat === hatBefore, B.player().hat);
    await sleep(800);
    B.act({ type: 'setLook', hat: 'wizard' });
    s = await B.waitSnap((x) => x.players.find((q) => String(q.id) === String(B.id)).hat === 'wizard', 2000);
    check('rate limit window resets (connection kept)', !!s && !B.closed);

    // start
    const evMark = B.msgs.length;
    A.act({ type: 'start' });
    const cd = await B.waitEvent((e) => e.type === 'countdown', 2000, evMark);
    check('start -> countdown events', !!cd, cd);
    s = await B.waitSnap((x) => x.phase === 'intro' || x.phase === 'playing', 6000);
    check('countdown -> intro', !!s, B.snap && B.snap.phase);
    const roles = B.snap && B.snap.players.filter((p) => p.role);
    check('roles hidden: B only sees its own role (or fellow impostors)', roles && roles.length >= 1 && roles.some((p) => String(p.id) === String(B.id)), roles);

    const D = track(await hello('Delta'));
    D.send({ t: 'join', code });
    await D.waitMsg((m) => m.t === 'err' || m.t === 'room', 2000, 0);
    check('joining a running game -> err.inProgress', D.errs.includes('err.inProgress'), D.errs);

    s = await A.waitSnap((x) => x.phase === 'playing', 10000);
    check('intro -> playing', !!s, A.snap && A.snap.phase);
    await sleep(1500);
    const leak = [A, B].some((c) => c.events.some((e) => e.to != null && String(e.to) !== String(c.id)));
    check('private events only reach their player', !leak);

    // host migration mid-game + leave
    const evMarkB = B.msgs.length;
    A.send({ t: 'leave' });
    s = await B.waitSnap((x) => String(x.hostId) === String(B.id), 3000);
    check('host leaves -> host migrates to the other human', !!s, B.snap && B.snap.hostId);
    const aP = B.player(A.id);
    check('leaver marked left in a running game', !aP || aP.left === true, aP);
    const hostEv = await B.waitEvent((e) => e.type === 'host', 1500, evMarkB);
    check('host event sent', !!hostEv && String(hostEv.player && hostEv.player.id != null ? hostEv.player.id : hostEv.player) === String(B.id), hostEv);
    A.send({ t: 'create' });
    const roomA2 = await A.waitMsg((m) => m.t === 'room', 3000);
    check('a client can create a new room after leaving', !!roomA2 && roomA2.code !== code, roomA2);

    B.close();
    await sleep(400);
    D.send({ t: 'join', code });
    await D.waitMsg((m) => m.t === 'err', 2000);
    check('room deleted when the last human leaves', D.errs.filter((k) => k === 'err.noRoom').length >= 1, D.errs);

    // lobby host migration must skip bots
    section('Lobby host migration, full rooms');
    const H = track(await hello('Host2'));
    H.send({ t: 'create' });
    await H.waitMsg((m) => m.t === 'room', 3000, 0);
    H.act({ type: 'addBot' });
    await H.waitSnap((x) => x.players.length === 2, 2000);
    const G = track(await hello('Guest2'));
    G.send({ t: 'join', code: H.code });
    await G.waitMsg((m) => m.t === 'room', 3000, 0);
    H.close();
    s = await G.waitSnap((x) => String(x.hostId) === String(G.id), 3000);
    check('host leaves the lobby -> next human becomes host (not the bot)', !!s, G.snap && { host: G.snap.hostId, players: G.snap.players.map((p) => p.id + (p.isBot ? '(bot)' : '')) });

    // bots make room for humans; 9 humans -> full (the 3 AIs join at start)
    for (let i = 0; i < 10; i++) G.act({ type: 'addBot' });
    s = await G.waitSnap((x) => x.players.length === 9, 3000);
    check('room filled to 9 with bots', !!s, G.snap && G.snap.players.length);
    const humans = [];
    for (let i = 0; i < 8; i++) {
      const c = track(await hello('H' + i));
      c.send({ t: 'join', code: G.code });
      humans.push(c);
    }
    await Promise.all(humans.map((c) => c.waitMsg((m) => m.t === 'room' || m.t === 'err', 3000, 0)));
    const joined = humans.filter((c) => c.code === G.code).length;
    check('bots give their seats to joining humans (8 joined)', joined === 8, joined);
    s = await G.waitSnap((x) => x.players.length === 9 && x.players.every((p) => !p.isBot), 3000);
    check('room now has 9 humans, 0 bots', !!s, G.snap && G.snap.players.length);
    const X = track(await hello('Extra'));
    X.send({ t: 'join', code: G.code });
    await X.waitMsg((m) => m.t === 'err' || m.t === 'room', 3000, 0);
    check('10th player -> err.full', X.errs.includes('err.full'), X.errs);

    section('Server health');
    r = await httpReq('GET', '/index.html');
    check('still serving after all of the above', r.status === 200);
    check('no server errors logged', !/ERROR/.test(serverOut), (serverOut.match(/.*ERROR.*/g) || []).slice(0, 5).join(' | '));
  } catch (e) {
    failures++;
    console.log('  FAIL test crashed: ' + (e && e.stack));
  }

  for (const c of clients) c.close();
  await sleep(200);
  kill();
  if (failures || VERBOSE) console.log('\n--- server output ---\n' + serverOut.split('\n').slice(-60).join('\n'));
  console.log('\n' + passes + ' passed, ' + failures + ' failed');
  process.exit(failures ? 1 : 0);
})();
