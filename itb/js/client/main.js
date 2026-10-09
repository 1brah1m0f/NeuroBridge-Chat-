/* AI IMPOSTOR: SPACE SHIP — client application (AS.App). Contract: docs/CONTRACT.md §6.
 *
 * Boots every client module, owns the requestAnimationFrame loop and the transport (offline LocalTransport /
 * online NetTransport), predicts my own movement with the client geometry (client-authoritative moves, `tp`
 * resyncs), smooths everybody else, wires the task host, persists profile/prefs, shows toasts, and offers debug
 * helpers + URL params (?lang ?auto ?bots ?imp ?role ?seed ?skill ?debug ?scene ?sab ?team).
 *
 * App events: 'boot' 'screen'(name, prev) 'snapshot'(snap, prev) 'phase'(phase, prev, snap) 'event'(ev)
 *   'ev:<type>'(ev) 'frame'(dt, time) 'resize'(w, h) 'lang'(lang) 'status'(s) 'room'({code, you}) 'error'(key)
 *   extras: 'map'(map) 'block'(reason, on)
 */
(function (AS) {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const U = AS.util;
  const T = AS.T;

  AS.i18n.add({
    az: {
      'app.youHost': 'İndi otaq sahibi sənsən',
      'app.joined': '{name} otağa qoşuldu',
      'app.left': '{name} oyundan çıxdı',
      'app.noGame': 'Oyun faylları tam yüklənməyib',
      'app.errors': 'Xətalar',
      'app.missing': 'Çatışmayan modullar: {list}',
    },
    en: {
      'app.youHost': 'You are the host now',
      'app.joined': '{name} joined the room',
      'app.left': '{name} left the game',
      'app.noGame': 'Game files did not load completely',
      'app.errors': 'Errors',
      'app.missing': 'Missing modules: {list}',
    },
  });

  const sameId = (a, b) => a != null && b != null && String(a) === String(b);
  const idOf = (v) => (v && typeof v === 'object' ? v.id : v);
  const isEditable = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || ''));
  const findPlayer = (snap, id) => {
    if (!snap || !snap.players || id == null) return null;
    for (const p of snap.players) if (sameId(p.id, id)) return p;
    return null;
  };

  // ------------------------------------------------------------------ URL params
  const params = {};
  try { new URLSearchParams(location.search).forEach((v, k) => { params[k] = v; }); } catch (e) { /* ignore */ }
  const flag = (k) => Object.prototype.hasOwnProperty.call(params, k) && params[k] !== '0' && params[k] !== 'false';
  const numParam = (k) => {
    const v = params[k];
    if (v == null || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const DEBUG = flag('debug');

  // ------------------------------------------------------------------ persisted profile / prefs
  const LANG_IDS = (AS.i18n.LANGS || []).map((l) => l.id);
  const COLOR_IDS = AS.COLORS.map((c) => c.id);
  const ROLES = ['crew', 'impostor'];
  const SKILLS = ['easy', 'normal', 'hard'];
  const SAB_KINDS = ['lights', 'comms', 'reactor', 'o2', 'doors'];

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
  const vol = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? U.clamp(v, 0, 1) : d);
  const defaultOffline = () => ({ bots: 5, aiLevel: 3, botSkill: 'normal' });
  function cleanOffline(o) {
    const d = defaultOffline();
    if (!o || typeof o !== 'object') return d;
    const b = Math.round(Number(o.bots));
    if (Number.isFinite(b)) d.bots = U.clamp(b, 0, T.MAX_LOBBY - 1);
    const i = Math.round(Number(o.aiLevel));
    if (Number.isFinite(i)) d.aiLevel = U.clamp(i, 1, 5);
    if (SKILLS.indexOf(o.botSkill) >= 0) d.botSkill = o.botSkill;
    return d;
  }
  function loadPrefs() {
    const p = { lang: 'az', master: 0.8, sfx: 0.8, music: 0.5, showFps: false, offline: defaultOffline(), settings: AS.sanitizeSettings({}) };
    const s = U.store.get('prefs', null);
    if (s && typeof s === 'object') {
      if (LANG_IDS.indexOf(s.lang) >= 0) p.lang = s.lang;
      p.master = vol(s.master, p.master);
      p.sfx = vol(s.sfx, p.sfx);
      p.music = vol(s.music, p.music);
      if (typeof s.showFps === 'boolean') p.showFps = s.showFps;
      p.offline = cleanOffline(s.offline);
      if (s.settings && typeof s.settings === 'object') p.settings = AS.sanitizeSettings(s.settings);
    }
    return p;
  }
  function loadProfile() {
    const p = { name: 'Ulduz' + (10 + Math.floor(Math.random() * 90)), color: COLOR_IDS[Math.floor(Math.random() * COLOR_IDS.length)], hat: 'none' };
    const s = U.store.get('profile', null);
    if (s && typeof s === 'object') {
      const n = cleanName(s.name);
      if (n) p.name = n;
      if (COLOR_IDS.indexOf(s.color) >= 0) p.color = s.color;
      if (AS.HATS.indexOf(s.hat) >= 0) p.hat = s.hat;
    } else {
      U.store.set('profile', p); // keep the random first-run identity stable across reloads
    }
    return p;
  }

  // ------------------------------------------------------------------ state
  const em = new U.Emitter();
  const blocks = new Set();
  const geoCache = {};
  let booted = false;
  let canvas = null;
  let lastTs = 0;
  let phase = null;        // phase of the last snapshot (drives the 'phase' event)
  let myTp = null;         // my teleport counter from the last snapshot (prediction resync)
  let myAlive = null;
  let lastMove = null;     // last move message sent
  let lastMoveAt = -1;
  let doorKey = '';
  let pendingColor = null; // color requested via setLook, saved to the profile once confirmed
  let pendingJoins = [];
  let meCache = { snap: null, p: null };
  let gestureSeen = false;
  let toastBox = null;
  const toasts = [];
  let fpsEl = null, fpsAcc = 0, fpsFrames = 0;
  let errBox = null;
  const debugErrors = [];
  const errCounts = {};

  const App = (AS.App = {
    version: AS.VERSION,
    snap: null,
    prevSnap: null,
    myId: null,
    mode: null,          // null | 'local' | 'online'
    map: null,
    geo: null,           // client geometry (prediction, vision) built with AS.Geo.build(map)
    transport: null,
    screen: null,        // 'menu' | 'game'
    phase: null,
    room: null,          // { code } when online
    status: null,        // transport status
    params,
    fps: 0,
    view: {
      me: { x: 0, y: 0, facing: 1, moving: false },
      players: {},       // others, smoothed: { [id]: { x, y, facing, moving, tp } }
      cam: { x: 0, y: 0, zoom: 1 },
      highlights: {},
      time: 0,
    },
    profile: loadProfile(),
    prefs: loadPrefs(),
    on(name, fn) { return em.on(name, fn); },
    off(name, fn) { em.off(name, fn); },
    emit(name, ...args) { em.emit(name, ...args); },
    send,
    startOffline,
    startOnline,
    leave,
    setScreen,
    me,
    isImpostor,
    isHost,
    block,
    isBlocked,
    toast,
    saveProfile,
    savePrefs,
    worldToScreen,
    screenToWorld,
    debug: null,
  });

  // ------------------------------------------------------------------ public API
  function me() {
    const s = App.snap;
    if (!s) return null;
    if (meCache.snap === s) return meCache.p;
    const p = findPlayer(s, App.myId != null ? App.myId : s.you);
    meCache = { snap: s, p };
    return p;
  }

  function isImpostor() {
    const s = App.snap;
    if (!s) return false;
    if (s.self && s.self.role) return s.self.role === 'impostor';
    const m = me();
    return !!(m && m.role === 'impostor');
  }

  function isHost() {
    const s = App.snap;
    return !!(s && sameId(s.hostId, App.myId));
  }

  function block(reason, on) {
    const key = String(reason || 'block');
    const had = blocks.has(key);
    if (on === false) blocks.delete(key);
    else blocks.add(key);
    if (had !== blocks.has(key)) emit('block', key, blocks.has(key));
  }
  function isBlocked() {
    return blocks.size > 0;
  }

  function send(action) {
    const tr = App.transport;
    if (!tr || !action || typeof action !== 'object' || typeof action.type !== 'string') return null;
    let a = action;
    if (a.type === 'move') {
      a = Object.assign({}, a);
      if (a.tp == null) a.tp = myTp != null ? myTp : 0;
    } else if (a.type === 'settings') {
      // Partial settings are merged over the current ones (the game sanitizes a full object).
      const cur = (App.snap && App.snap.settings) || App.prefs.settings;
      const merged = AS.sanitizeSettings(Object.assign({}, cur, a.settings || {}));
      a = { type: 'settings', settings: merged };
      if (isHost()) {
        App.prefs.settings = merged;
        persistPrefs();
      }
    } else if (a.type === 'setLook') {
      const n = cleanName(a.name);
      if (n) App.profile.name = n;
      if (AS.HATS.indexOf(a.hat) >= 0) App.profile.hat = a.hat;
      pendingColor = COLOR_IDS.indexOf(a.color) >= 0 ? a.color : null;
      if (n || AS.HATS.indexOf(a.hat) >= 0) persistProfile();
    }
    let res = null;
    try {
      res = tr.send(a);
    } catch (e) {
      console.error('[App.send]', a.type, e);
    }
    if (a.type === 'setLook' && App.mode === 'local') {
      if (res && res.ok && pendingColor) {
        App.profile.color = pendingColor;
        persistProfile();
      }
      pendingColor = null;
    }
    return res;
  }

  function startOffline(opts) {
    opts = opts || {};
    if (typeof AS.Game !== 'function' || !AS.LocalTransport) {
      toast(AS.t('app.noGame'), 3500, 'error');
      emit('error', 'app.noGame');
      return false;
    }
    leave(true);
    const off = Object.assign({}, App.prefs.offline);
    for (const k of ['bots', 'aiLevel', 'botSkill']) if (opts[k] !== undefined) off[k] = opts[k];
    const clean = cleanOffline(off);
    const base = Object.assign({}, App.prefs.settings, opts.settings || {});
    base.aiLevel = clean.aiLevel;
    base.botSkill = clean.botSkill;
    const settings = AS.sanitizeSettings(base);
    const seed = opts.seed != null && Number.isFinite(Number(opts.seed)) ? Number(opts.seed) >>> 0 : (Math.random() * 4294967296) >>> 0;
    let game, mine;
    try {
      game = new AS.Game({ mapId: 'starship', settings, seed, isServer: false });
      mine = game.addPlayer({ name: App.profile.name, color: App.profile.color, hat: App.profile.hat, isBot: false });
      if (!mine) throw new Error('addPlayer returned null');
      for (let i = 0; i < clean.bots; i++) if (!game.addBot()) break;
      if (game.hostId == null) game.hostId = mine.id;
      game.drainEvents(); // lobby setup noise (joins of bots) is not news
    } catch (e) {
      console.error('[App] could not create the offline game', e);
      toast(AS.t('app.noGame'), 3500, 'error');
      emit('error', 'app.noGame');
      return false;
    }
    if (!opts.transient) {
      App.prefs.offline = clean;
      persistPrefs();
    }
    if (mine.color && mine.color !== App.profile.color && COLOR_IDS.indexOf(mine.color) >= 0) {
      App.profile.color = mine.color;
      persistProfile();
    }
    App.myId = mine.id;
    App.room = null;
    setMap(game.map || (AS.MAPS && AS.MAPS.starship) || null);
    const tr = new AS.LocalTransport({ game, myId: mine.id });
    attach(tr, 'local');
    // Prime the snapshot silently so 'screen' listeners already see the lobby, then deliver it normally.
    try { App.snap = game.snapshotFor(mine.id); } catch (e) { App.snap = null; }
    setScreen('game', true);
    App.snap = null;
    tr.update(0);
    if (opts.autoStart) send({ type: 'start' });
    return true;
  }

  function startOnline(opts) {
    opts = opts || {};
    if (!AS.NetTransport) return false;
    leave(true);
    const tr = new AS.NetTransport({ url: opts.url });
    attach(tr, 'online');
    tr.onRoom = (r) => {
      if (App.transport !== tr || !r) return;
      App.myId = r.you;
      App.room = { code: r.code };
      emit('room', { code: r.code, you: r.you });
      if (App.snap) setScreen('game', true);
    };
    tr.onWelcome = (id) => {
      if (App.transport === tr && App.myId == null) App.myId = id;
    };
    tr.hello(App.profile);
    const code = opts.code ? String(opts.code).toUpperCase().replace(/[^A-Z]/g, '') : '';
    if (code) tr.join(code);
    else tr.create();
    return true;
  }

  function leave(quiet) {
    const tr = App.transport;
    App.transport = null;
    if (tr) {
      tr.onSnapshot = tr.onEvents = tr.onStatus = null;
      if ('onRoom' in tr) tr.onRoom = null;
      if ('onError' in tr) tr.onError = null;
      if ('onWelcome' in tr) tr.onWelcome = null;
      try { tr.close(); } catch (e) { console.error('[App.leave]', e); }
    }
    if (AS.Tasks) {
      try { if (AS.Tasks.isOpen && AS.Tasks.isOpen()) AS.Tasks.close('leave'); } catch (e) { console.error(e); }
      try { if (AS.Tasks.reset) AS.Tasks.reset(); } catch (e) { console.error(e); }
    }
    try { if (AS.HUD && AS.HUD.closeOverlay) AS.HUD.closeOverlay(); } catch (e) { console.error(e); }
    App.mode = null;
    App.room = null;
    App.status = null;
    App.snap = null;
    App.prevSnap = null;
    App.myId = null;
    App.phase = null;
    resetGameState();
    setBodyAttr('data-mode', '');
    setBodyAttr('data-phase', '');
    if (!quiet) setScreen('menu');
  }

  function setScreen(name, force) {
    if (name !== 'menu' && name !== 'game') return;
    if (App.screen === name && !force) return;
    const prev = App.screen;
    App.screen = name;
    setBodyAttr('data-screen', name);
    music(name === 'menu' ? 'menu_music' : 'ambient');
    emit('screen', name, prev);
  }

  function toast(text, ms, kind) {
    if (text == null || text === '') return null;
    text = String(text);
    ms = Math.max(900, Number(ms) || 2600);
    if (!toastBox || !toastBox.isConnected) {
      toastBox = document.createElement('div');
      toastBox.id = 'app-toasts';
      (document.getElementById('toast-layer') || document.body).appendChild(toastBox);
    }
    const dup = toasts.find((t) => t.text === text && !t.out);
    if (dup) {
      clearTimeout(dup.timer);
      dup.timer = setTimeout(() => hideToast(dup), ms);
      dup.el.classList.remove('bump');
      void dup.el.offsetWidth;
      dup.el.classList.add('bump');
      return dup.el;
    }
    const el = document.createElement('div');
    el.className = 'app-toast' + (kind ? ' app-toast--' + kind : '');
    el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    el.textContent = text;
    toastBox.appendChild(el);
    const rec = { text, el, out: false, timer: 0 };
    toasts.push(rec);
    rec.timer = setTimeout(() => hideToast(rec), ms);
    const live = toasts.filter((t) => !t.out);
    if (live.length > 3) hideToast(live[0]);
    return el;
  }
  function hideToast(rec) {
    if (rec.out) return;
    rec.out = true;
    clearTimeout(rec.timer);
    rec.el.classList.add('out');
    setTimeout(() => {
      rec.el.remove();
      const i = toasts.indexOf(rec);
      if (i >= 0) toasts.splice(i, 1);
    }, 280);
  }

  function persistProfile() { U.store.set('profile', App.profile); }
  function persistPrefs() { U.store.set('prefs', App.prefs); }

  function saveProfile() {
    const p = App.profile;
    p.name = cleanName(p.name) || 'Ulduz';
    if (COLOR_IDS.indexOf(p.color) < 0) p.color = COLOR_IDS[0];
    if (AS.HATS.indexOf(p.hat) < 0) p.hat = 'none';
    persistProfile();
  }

  // Persist + apply (language, volumes, FPS counter).
  function savePrefs() {
    const p = App.prefs;
    if (LANG_IDS.indexOf(p.lang) < 0) p.lang = 'az';
    p.master = vol(p.master, 0.8);
    p.sfx = vol(p.sfx, 0.8);
    p.music = vol(p.music, 0.5);
    p.showFps = !!p.showFps;
    p.offline = cleanOffline(p.offline);
    p.settings = AS.sanitizeSettings(p.settings);
    persistPrefs();
    applyVolumes();
    updateFpsVisibility();
    if (p.lang !== AS.i18n.getLang()) AS.i18n.setLang(p.lang);
  }

  function worldToScreen(x, y) {
    const R = AS.Renderer;
    if (R && typeof R.worldToScreen === 'function') return R.worldToScreen(x, y);
    const c = App.view.cam;
    return { x: (x - c.x) * c.zoom + window.innerWidth / 2, y: (y - c.y) * c.zoom + window.innerHeight / 2 };
  }
  function screenToWorld(x, y) {
    const R = AS.Renderer;
    if (R && typeof R.screenToWorld === 'function') return R.screenToWorld(x, y);
    const c = App.view.cam;
    return { x: (x - window.innerWidth / 2) / c.zoom + c.x, y: (y - window.innerHeight / 2) / c.zoom + c.y };
  }

  function emit(name, ...args) {
    em.emit(name, ...args);
  }

  // ------------------------------------------------------------------ transport wiring
  function attach(tr, mode) {
    App.transport = tr;
    App.mode = mode;
    App.status = null;
    resetGameState();
    setBodyAttr('data-mode', mode);
    tr.onSnapshot = (s) => { if (App.transport === tr) onSnapshot(s); };
    tr.onEvents = (evs) => { if (App.transport === tr) onEvents(evs); };
    tr.onStatus = (s) => { if (App.transport === tr) onStatus(s); };
    if ('onError' in tr) tr.onError = (key) => { if (App.transport === tr) onTransportError(key); };
  }

  function resetGameState() {
    phase = null;
    myTp = null;
    myAlive = null;
    lastMove = null;
    lastMoveAt = -1;
    doorKey = '';
    pendingColor = null;
    pendingJoins = [];
    meCache = { snap: null, p: null };
    const v = App.view;
    v.players = {};
    for (const k in v.highlights) delete v.highlights[k];
    v.me.moving = false;
    if (blocks.size) {
      const had = Array.from(blocks);
      blocks.clear();
      for (const k of had) emit('block', k, false);
    }
  }

  function setMap(map) {
    App.map = map || null;
    App.geo = null;
    doorKey = '';
    if (map && AS.Geo && typeof AS.Geo.build === 'function') {
      let geo = geoCache[map.id];
      if (!geo) {
        try {
          geo = AS.Geo.build(map);
          geoCache[map.id] = geo;
        } catch (e) {
          console.error('[App] AS.Geo.build failed', e);
          geo = null;
        }
      }
      App.geo = geo;
      if (geo && typeof geo.setDoors === 'function') { try { geo.setDoors([]); } catch (e) { /* ignore */ } }
    }
    emit('map', App.map);
  }

  function syncDoors(snap) {
    const geo = App.geo;
    if (!geo || typeof geo.setDoors !== 'function') return;
    const ids = snap.doors ? Object.keys(snap.doors).sort() : [];
    const key = ids.join('|');
    if (key === doorKey) return;
    doorKey = key;
    try { geo.setDoors(ids); } catch (e) { console.error('[App] geo.setDoors', e); }
  }

  function onSnapshot(snap) {
    if (!snap || typeof snap !== 'object' || !Array.isArray(snap.players)) return;
    const prev = App.snap;
    App.prevSnap = prev;
    App.snap = snap;
    if (snap.you != null) App.myId = snap.you;
    if (snap.mapId && (!App.map || App.map.id !== snap.mapId)) setMap(AS.MAPS && AS.MAPS[snap.mapId]);
    syncDoors(snap);

    const m = me();
    if (m) {
      // Teleport counter changed (spawn, meeting, vent, kill-teleport, rejected move): snap prediction to the server.
      if (m.x != null && m.y != null && (myTp === null || m.tp !== myTp)) {
        myTp = m.tp;
        const v = App.view.me;
        v.x = m.x;
        v.y = m.y;
        if (m.facing === 1 || m.facing === -1) v.facing = m.facing;
        v.moving = false;
        lastMove = null;
      }
      if (myAlive === true && m.alive === false) closeTask('died');
      myAlive = m.alive !== false;
      if (pendingColor && m.color === pendingColor) {
        App.profile.color = pendingColor;
        pendingColor = null;
        persistProfile();
      }
    }
    if (pendingJoins.length) flushJoinToasts(snap);

    const phaseChanged = snap.phase !== phase;
    if (phaseChanged && phase === 'playing') closeTask('phase');
    if (snap.meeting && !(prev && prev.meeting)) closeTask('meeting');
    if (App.mode === 'online' && App.room && App.screen !== 'game') setScreen('game', true);

    emit('snapshot', snap, prev);
    if (phaseChanged) {
      const p0 = phase;
      phase = snap.phase;
      App.phase = phase;
      setBodyAttr('data-phase', phase || '');
      if (phase !== 'lobby' && phase !== 'playing') App.view.me.moving = false;
      // Task ids repeat between matches ("asteroids:0"), so mini-game progress from the last match must not carry
      // over when "Play again" / "Return to lobby" starts a new one without leaving the room.
      if ((phase === 'lobby' || phase === 'intro') && AS.Tasks && AS.Tasks.reset) {
        try { AS.Tasks.reset(); } catch (e) { console.error(e); }
      }
      emit('phase', phase, p0, snap);
    }
  }

  function onEvents(evs) {
    if (!Array.isArray(evs)) return;
    for (const ev of evs) {
      if (!ev || typeof ev.type !== 'string') continue;
      if (ev.to != null && App.myId != null && !sameId(ev.to, App.myId)) continue;
      try { internalEvent(ev); } catch (e) { console.error('[App] event ' + ev.type, e); }
      emit('event', ev);
      emit('ev:' + ev.type, ev);
    }
  }

  function internalEvent(ev) {
    switch (ev.type) {
      case 'meeting':
        closeTask('meeting');
        break;
      case 'kill':
        if (sameId(ev.victim, App.myId)) closeTask('died');
        break;
      case 'phase':
        if (ev.prev === 'playing' && ev.phase !== 'playing') closeTask('phase');
        break;
      case 'error': {
        if (ev.action === 'setLook' || ev.err === 'colorTaken') pendingColor = null;
        const key = 'err.' + ev.err;
        emit('error', key);
        if (AS.i18n.has(key)) toast(AS.t(key, { n: ev.n != null ? ev.n : T.MIN_PLAYERS }), 3000, 'error');
        else if (DEBUG) console.warn('[App] action rejected:', ev.action || '?', ev.err);
        break;
      }
      case 'host':
        if (App.mode === 'online' && sameId(idOf(ev.player), App.myId) && App.snap && !sameId(App.snap.hostId, App.myId)) {
          toast(AS.t('app.youHost'), 3200, 'good');
        }
        break;
      case 'join':
        if (App.mode === 'online') {
          const id = idOf(ev.player);
          const info = describe(ev);
          if (info) { if (!info.isBot && !sameId(id, App.myId)) toast(AS.t('app.joined', { name: info.name }), 2400); }
          else if (id != null) pendingJoins.push({ id, n: 0 }); // name arrives with the next snapshot
        }
        break;
      case 'leave':
        if (App.mode === 'online') {
          const id = idOf(ev.player);
          const info = describe(ev) || findPlayer(App.snap, id);
          if (info && !info.isBot && !sameId(id, App.myId)) toast(AS.t('app.left', { name: info.name }), 2600);
        }
        break;
      default:
        break;
    }
  }

  // join/leave events carry { player: id, name, isBot } (or a player object); null when the name is unknown.
  function describe(ev) {
    if (ev.player && typeof ev.player === 'object' && ev.player.name) return { name: ev.player.name, isBot: !!ev.player.isBot };
    if (typeof ev.name === 'string' && ev.name) return { name: ev.name, isBot: !!ev.isBot };
    return null;
  }

  function flushJoinToasts(snap) {
    const keep = [];
    for (const j of pendingJoins) {
      const p = findPlayer(snap, j.id);
      if (p) {
        if (!p.isBot && !sameId(p.id, App.myId)) toast(AS.t('app.joined', { name: p.name }), 2400);
      } else if (++j.n < 3) keep.push(j);
    }
    pendingJoins = keep;
  }

  function onStatus(s) {
    App.status = s;
    emit('status', s);
    // Unexpected disconnect (the error toast came through onError): back to the menu.
    if (s === 'closed' && App.mode === 'online') leave();
  }

  function onTransportError(key) {
    const k = typeof key === 'string' && key ? key : 'err.connection';
    emit('error', k);
    toast(AS.t(k, { n: T.MIN_PLAYERS }), 3600, 'error');
    // Create/join failed before we got a room: drop the connection, stay on the menu.
    if (App.mode === 'online' && !App.room) leave();
  }

  function closeTask(reason) {
    const Tk = AS.Tasks;
    if (!Tk || typeof Tk.isOpen !== 'function' || !Tk.isOpen()) return;
    try { Tk.close(reason); } catch (e) { console.error('[App] Tasks.close', e); }
  }

  function wireTasks() {
    const Tk = AS.Tasks;
    if (!Tk) return;
    Tk.getState = () => App.snap;
    Tk.send = (a) => send(a);
    Tk.onOpen = () => block('task', true);
    Tk.onClose = () => block('task', false);
    Tk.onComplete = (info) => {
      if (!info) return;
      if (info.panelId != null) {
        // Reactor is fixed by holding (ctx.hold), every other panel by finishing its mini-game.
        if (info.sabotage !== 'reactor') send({ type: 'fixPanel', panel: info.panelId });
      } else if (info.taskId != null) {
        send({ type: 'taskComplete', task: info.taskId });
      }
    };
  }

  // ------------------------------------------------------------------ frame loop
  function frame(ts) {
    requestAnimationFrame(frame);
    const t = (typeof ts === 'number' ? ts : performance.now()) / 1000;
    const raw = lastTs ? t - lastTs : 1 / 60;
    lastTs = t;
    const dt = raw > 0 ? Math.min(raw, 0.1) : 0;
    App.view.time += dt;
    tickFps(raw > 0 ? raw : 0);

    const tr = App.transport;
    if (tr) { try { tr.update(dt); } catch (e) { reportError('transport.update', e); } }
    if (App.snap && App.transport) {
      try { predict(dt); } catch (e) { reportError('predict', e); }
      try { sendMove(); } catch (e) { reportError('sendMove', e); }
      try { smoothOthers(dt); } catch (e) { reportError('smoothOthers', e); }
      // The renderer runs its own smoothed camera and publishes it in App.view.cam; this is only a fallback.
      if (!AS.Renderer || typeof AS.Renderer.render !== 'function') updateCamera();
    }
    emit('frame', dt, App.view.time);
    const R = AS.Renderer;
    if (R && typeof R.render === 'function') {
      try { R.render(dt); } catch (e) { reportError('Renderer.render', e); }
    }
  }

  function reportError(tag, e) {
    const n = (errCounts[tag] = (errCounts[tag] || 0) + 1);
    if (n <= 3 || n % 600 === 0) console.error('[App] ' + tag + (n > 3 ? ' (x' + n + ')' : ''), e);
  }

  function canMoveNow(snap, m) {
    const ph = snap.phase;
    if (ph !== 'lobby' && ph !== 'playing') return false;
    if (App.screen !== 'game' || isBlocked()) return false;
    if (m.inVent || (snap.self && snap.self.inVent)) return false;
    return m.x != null && m.y != null;
  }

  // Client-side prediction of my own movement (the server accepts plausible positions).
  function predict(dt) {
    const snap = App.snap;
    const m = me();
    const v = App.view.me;
    if (!m || !canMoveNow(snap, m)) {
      v.moving = false;
      return;
    }
    let ix = 0, iy = 0;
    const I = AS.Input;
    if (I && typeof I.getMove === 'function') {
      const mv = I.getMove() || {};
      ix = Number(mv.x) || 0;
      iy = Number(mv.y) || 0;
    }
    let len = Math.hypot(ix, iy);
    if (len > 1) { ix /= len; iy /= len; len = 1; }
    if (len < 0.08) {
      v.moving = false;
      return;
    }
    const ghost = m.alive === false;
    const speed = T.BASE_SPEED * (Number(snap.settings && snap.settings.playerSpeed) || 1) * (ghost ? T.GHOST_SPEED_MULT : 1);
    const dx = ix * speed * dt, dy = iy * speed * dt;
    if (ghost) {
      // Ghosts fly through walls but stay inside the map bounds.
      const W = (App.map && App.map.width) || 1e6, H = (App.map && App.map.height) || 1e6;
      v.x = U.clamp(v.x + dx, T.PLAYER_RADIUS, W - T.PLAYER_RADIUS);
      v.y = U.clamp(v.y + dy, T.PLAYER_RADIUS, H - T.PLAYER_RADIUS);
    } else if (App.geo && typeof App.geo.move === 'function') {
      const r = App.geo.move(v.x, v.y, dx, dy, T.PLAYER_RADIUS);
      if (r && Number.isFinite(r.x) && Number.isFinite(r.y)) { v.x = r.x; v.y = r.y; }
    } else {
      v.x += dx;
      v.y += dy;
    }
    if (Math.abs(ix) > 0.15) v.facing = ix > 0 ? 1 : -1;
    v.moving = true;
  }

  // Moves go out at MOVE_SEND_HZ while walking, plus one final message when I stop.
  function sendMove() {
    const snap = App.snap;
    const m = me();
    if (!m || !App.transport) return;
    const ph = snap.phase;
    if (ph !== 'lobby' && ph !== 'playing') return;
    if (m.inVent || (snap.self && snap.self.inVent) || m.x == null) return;
    const v = App.view.me;
    const L = lastMove;
    if (L && L.x === v.x && L.y === v.y && L.facing === v.facing && L.moving === v.moving) return;
    const now = App.view.time;
    if (v.moving && L && L.moving && now - lastMoveAt < 1 / T.MOVE_SEND_HZ - 0.004) return;
    lastMove = { x: v.x, y: v.y, facing: v.facing, moving: v.moving };
    lastMoveAt = now;
    send({ type: 'move', x: v.x, y: v.y, facing: v.facing, moving: v.moving });
  }

  function smoothOthers(dt) {
    const snap = App.snap;
    const vp = App.view.players;
    const k = 1 - Math.exp(-dt * 14);
    const seen = {};
    for (const p of snap.players) {
      if (sameId(p.id, App.myId) || p.x == null || p.y == null) continue;
      seen[p.id] = true;
      const o = vp[p.id];
      if (!o || o.tp !== p.tp || U.dist(o.x, o.y, p.x, p.y) > 250) {
        vp[p.id] = { x: p.x, y: p.y, facing: p.facing === -1 ? -1 : 1, moving: !!p.moving, tp: p.tp };
        continue;
      }
      o.x += (p.x - o.x) * k;
      o.y += (p.y - o.y) * k;
      if (p.facing === 1 || p.facing === -1) o.facing = p.facing;
      o.moving = !!p.moving;
    }
    for (const id in vp) if (!seen[id]) delete vp[id];
  }

  function updateCamera() {
    const cam = App.view.cam, v = App.view.me;
    cam.x = v.x;
    cam.y = v.y - 30; // centre on the body, not the feet
    const h = window.innerHeight || 720;
    cam.zoom = h / (h < 500 ? T.VIEW_HEIGHT_SMALL : T.VIEW_HEIGHT);
  }

  // ------------------------------------------------------------------ audio, language, page chrome
  function music(name) {
    const A = AS.Audio;
    if (A && typeof A.music === 'function') { try { A.music(name); } catch (e) { console.error('[App] Audio.music', e); } }
  }
  function applyVolumes() {
    const A = AS.Audio;
    if (A && typeof A.setVolumes === 'function') {
      try { A.setVolumes({ master: App.prefs.master, sfx: App.prefs.sfx, music: App.prefs.music }); } catch (e) { console.error('[App] Audio.setVolumes', e); }
    }
  }
  // Browsers only start WebAudio after a user gesture. The first one unlocks audio and starts the music;
  // later pointer gestures re-resume it at most once a second (mobile browsers suspend audio on interruptions).
  let lastUnlockAt = -10;
  function onGesture(e) {
    const A = AS.Audio;
    if (!A || typeof A.unlock !== 'function') return;
    const now = performance.now() / 1000;
    if (gestureSeen && (e.type === 'keydown' || now - lastUnlockAt < 1)) return;
    lastUnlockAt = now;
    try { A.unlock(); } catch (err) { /* ignore */ }
    if (!gestureSeen) {
      gestureSeen = true;
      applyVolumes();
      music(App.screen === 'menu' ? 'menu_music' : App.screen ? 'ambient' : null);
    }
  }

  function setBodyAttr(name, value) {
    if (document.body) document.body.setAttribute(name, value);
  }

  function onResize() {
    emit('resize', window.innerWidth, window.innerHeight);
  }

  function installGlobalListeners() {
    document.addEventListener('contextmenu', (e) => { if (!isEditable(e.target)) e.preventDefault(); });
    for (const n of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(n, (e) => e.preventDefault(), { passive: false });
    document.addEventListener('touchmove', (e) => { if (e.touches && e.touches.length > 1) e.preventDefault(); }, { passive: false });
    document.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
    document.addEventListener('dblclick', (e) => { if (!isEditable(e.target)) e.preventDefault(); });
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
    for (const n of ['pointerdown', 'keydown', 'touchend', 'mousedown']) window.addEventListener(n, onGesture, { capture: true, passive: true });
    window.addEventListener('pagehide', () => {
      if (App.mode === 'online' && App.transport) { try { App.transport.close(); } catch (e) { /* ignore */ } }
    });
  }

  function injectCss() {
    if (document.getElementById('app-css')) return;
    const st = document.createElement('style');
    st.id = 'app-css';
    st.textContent = `
#app-toasts{position:absolute;left:50%;top:max(16px,env(safe-area-inset-top));transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:8px;width:max-content;max-width:min(92vw,560px);pointer-events:none}
.app-toast{padding:11px 22px;border-radius:14px;background:var(--panel-2,rgba(28,37,80,.94));border:2px solid var(--line-strong,rgba(130,150,255,.48));box-shadow:var(--shadow,0 14px 44px rgba(0,0,0,.5)),inset 0 1px 0 rgba(255,255,255,.08);font-family:var(--font-body,sans-serif);font-weight:800;font-size:17px;line-height:1.3;color:var(--text,#f3f6ff);text-align:center;text-shadow:0 1px 0 rgba(0,0,0,.35);animation:app-toast-in .3s var(--ease,ease) both;transition:opacity .25s,transform .25s}
.app-toast--error{border-color:rgba(255,59,78,.8);background:linear-gradient(180deg,rgba(84,18,38,.96),rgba(48,10,26,.96));box-shadow:var(--shadow,0 14px 44px rgba(0,0,0,.5)),0 0 26px rgba(255,59,78,.35)}
.app-toast--good{border-color:rgba(52,224,124,.75);box-shadow:var(--shadow,0 14px 44px rgba(0,0,0,.5)),0 0 22px rgba(52,224,124,.3)}
.app-toast--error::before,.app-toast--good::before{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;margin-right:10px;border-radius:50%;vertical-align:-4px;font-family:var(--font-display,sans-serif);font-weight:700;font-size:14px;line-height:1}
.app-toast--error::before{content:"!";background:#ff3b4e;color:#fff;box-shadow:0 0 10px rgba(255,59,78,.65)}
.app-toast--good::before{content:"★";background:#34e07c;color:#06331a;box-shadow:0 0 10px rgba(52,224,124,.55)}
.app-toast.out{opacity:0;transform:translateY(-10px) scale(.96)}
.app-toast.bump{animation:app-toast-bump .3s var(--ease,ease)}
@keyframes app-toast-in{from{opacity:0;transform:translateY(-14px) scale(.94)}to{opacity:1;transform:none}}
@keyframes app-toast-bump{40%{transform:scale(1.06)}}
#app-fps{position:absolute;left:50%;bottom:max(6px,env(safe-area-inset-bottom));transform:translateX(-50%);padding:4px 10px;border-radius:9px;background:rgba(3,6,18,.66);border:1px solid rgba(130,150,255,.28);font:700 12px/1.2 ui-monospace,Consolas,Menlo,monospace;color:#a6f6ff;white-space:nowrap;pointer-events:none}
#app-errors{position:absolute;left:10px;bottom:max(40px,calc(env(safe-area-inset-bottom) + 34px));width:min(640px,calc(100vw - 20px));max-height:42vh;overflow:auto;padding:8px 10px 10px;border-radius:12px;background:rgba(48,4,14,.94);border:2px solid #ff3b4e;box-shadow:0 10px 30px rgba(0,0,0,.5);font:12px/1.4 ui-monospace,Consolas,Menlo,monospace;color:#ffdfe3;pointer-events:auto;-webkit-user-select:text;user-select:text}
.app-errors-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:4px;font-family:var(--font-display,sans-serif);font-size:14px;color:#fff}
.app-errors-head button{flex:none;width:26px;height:26px;border:0;border-radius:8px;background:#ff3b4e;color:#fff;font-weight:900;cursor:pointer}
.app-errors-row{white-space:pre-wrap;word-break:break-word;padding:5px 0;border-top:1px solid rgba(255,255,255,.12)}
@media (max-height:500px){#app-toasts{top:max(8px,env(safe-area-inset-top))}.app-toast{font-size:14px;padding:8px 16px}}
`;
    document.head.appendChild(st);
  }

  // ------------------------------------------------------------------ FPS + error overlay
  function updateFpsVisibility() {
    const show = DEBUG || !!App.prefs.showFps;
    if (show && !fpsEl) {
      fpsEl = document.createElement('div');
      fpsEl.id = 'app-fps';
      fpsEl.textContent = '-- FPS';
      (document.getElementById('toast-layer') || document.body).appendChild(fpsEl);
    } else if (!show && fpsEl) {
      fpsEl.remove();
      fpsEl = null;
    }
  }
  function tickFps(raw) {
    fpsAcc += raw;
    fpsFrames++;
    if (fpsAcc < 0.5) return;
    App.fps = Math.round(fpsFrames / fpsAcc);
    fpsAcc = 0;
    fpsFrames = 0;
    if (!fpsEl) return;
    let s = App.fps + ' FPS';
    if (DEBUG) {
      s += ' · ' + (App.mode || App.screen || '-');
      const snap = App.snap;
      if (snap) {
        s += ' · ' + snap.phase + ' · ' + snap.players.length + 'p';
        const v = App.view.me;
        s += ' · ' + Math.round(v.x) + ',' + Math.round(v.y);
      }
      const tr = App.transport;
      if (tr && tr.kind === 'online' && tr.stats) s += ' · ' + Math.round(tr.stats.snapRate) + ' snap/s';
    }
    fpsEl.textContent = s;
  }

  function fmtArg(a) {
    if (a instanceof Error) return a.stack || a.message;
    if (a && typeof a === 'object') { try { return JSON.stringify(a).slice(0, 300); } catch (e) { return String(a); } }
    return String(a);
  }
  function debugError(text) {
    if (!DEBUG) return;
    text = String(text).slice(0, 1500);
    const last = debugErrors[debugErrors.length - 1];
    if (last && last.text === text) last.n++;
    else {
      debugErrors.push({ text, n: 1 });
      if (debugErrors.length > 6) debugErrors.shift();
    }
    renderErrors();
  }
  function renderErrors() {
    if (!document.body) return;
    if (!errBox || !errBox.isConnected) {
      errBox = document.createElement('div');
      errBox.id = 'app-errors';
      (document.getElementById('toast-layer') || document.body).appendChild(errBox);
    }
    errBox.textContent = '';
    const head = document.createElement('div');
    head.className = 'app-errors-head';
    const title = document.createElement('b');
    title.textContent = AS.t('app.errors') + ' (' + debugErrors.reduce((s, e) => s + e.n, 0) + ')';
    const x = document.createElement('button');
    x.type = 'button';
    x.textContent = '✕';
    x.addEventListener('click', () => {
      debugErrors.length = 0;
      errBox.remove();
      errBox = null;
    });
    head.append(title, x);
    errBox.appendChild(head);
    for (const e of debugErrors) {
      const row = document.createElement('div');
      row.className = 'app-errors-row';
      row.textContent = (e.n > 1 ? '×' + e.n + '  ' : '') + e.text;
      errBox.appendChild(row);
    }
  }
  function setupDebugCapture() {
    window.addEventListener('error', (e) => {
      const err = e.error;
      debugError((err && err.stack) || (e.message + (e.filename ? ' @ ' + e.filename.split('/').pop() + ':' + e.lineno : '')));
    });
    window.addEventListener('unhandledrejection', (e) => {
      const r = e.reason;
      debugError('Unhandled rejection: ' + ((r && (r.stack || r.message)) || r));
    });
    const orig = console.error.bind(console);
    console.error = function (...args) {
      orig(...args);
      try { debugError(args.map(fmtArg).join(' ')); } catch (e) { /* ignore */ }
    };
  }

  // ------------------------------------------------------------------ debug helpers (offline games)
  function dbg() {
    const tr = App.transport;
    if (App.mode !== 'local' || !tr || !tr.game) {
      console.warn('[App.debug] only available in an offline game');
      return null;
    }
    return { tr, g: tr.game };
  }
  const gp = (g, id) => (g && typeof g.getPlayer === 'function' ? g.getPlayer(id) : null);
  const gPlayers = (g) => (g.order || []).map((id) => gp(g, id)).filter(Boolean);
  function placePlayer(g, p, x, y) {
    if (!p) return;
    let px = x, py = y;
    if (p.alive !== false && g.geo && typeof g.geo.nearestStandable === 'function') {
      try {
        const r = g.geo.nearestStandable(x, y);
        if (r && Number.isFinite(r[0]) && Number.isFinite(r[1])) { px = r[0]; py = r[1]; }
      } catch (e) { /* keep x, y */ }
    }
    p.x = px;
    p.y = py;
    p.tp = (p.tp | 0) + 1;
    p.moving = false;
    if (p.input) { p.input.x = 0; p.input.y = 0; }
  }
  function meetingStage(g) {
    if (g.meeting && typeof g.meeting === 'object' && g.meeting.stage) return g.meeting.stage;
    try {
      const s = g.snapshotFor(App.myId);
      return s && s.meeting ? s.meeting.stage : null;
    } catch (e) {
      return null;
    }
  }
  function sabotageActive(g, kind) {
    try {
      const s = g.snapshotFor(App.myId);
      if (kind === 'doors') return !!(s.doors && Object.keys(s.doors).length);
      return !!(s.sabotage && s.sabotage.kind === kind);
    } catch (e) {
      return false;
    }
  }

  function dbgStartNow(stopAt) {
    const d = dbg();
    if (!d) return false;
    const { tr, g } = d;
    const target = stopAt === 'intro' ? 'intro' : 'playing';
    if (g.phase === 'lobby') {
      let guard = 0;
      while (gPlayers(g).length < T.MIN_PLAYERS && guard++ < T.MAX_PLAYERS) if (!g.addBot()) break;
      tr.actAs(App.myId, { type: 'start' });
    }
    tr.fastForward(T.LOBBY_COUNTDOWN + T.INTRO_TIME + 3, (gg) => gg.phase === target || gg.phase === 'playing' || gg.phase === 'ended');
    return g.phase === target;
  }

  function dbgMeeting() {
    const d = dbg();
    if (!d) return false;
    const { tr, g } = d;
    if (g.phase === 'lobby' || g.phase === 'intro') dbgStartNow();
    if (g.phase === 'meeting') return true;
    if (g.phase !== 'playing') return false;
    const alive = gPlayers(g).filter((p) => p.alive && !p.left);
    const caller = alive.find((p) => sameId(p.id, App.myId)) || alive[0];
    if (!caller) return false;
    if (caller.inVent) tr.actAs(caller.id, { type: 'ventExit' });
    const b = g.map && g.map.button;
    if (b) placePlayer(g, caller, b.x, b.y + 110);
    caller.emergencyLeft = Math.max(1, caller.emergencyLeft | 0);
    for (const k of ['emergencyTimer', 'emergencyCooldown']) if (typeof g[k] === 'number') g[k] = 0;
    const st = g.settings && typeof g.settings === 'object' ? g.settings : null;
    const saved = st ? st.emergencyCooldown : undefined;
    if (st) st.emergencyCooldown = 0;
    const ok = !!(tr.actAs(caller.id, { type: 'emergency' }) || {}).ok;
    if (st) st.emergencyCooldown = saved;
    if (!ok) {
      // The cooldown lives somewhere we can't reach: wait it out (bots keep playing meanwhile).
      tr.fastForward(70, (gg) => {
        if (gg.phase !== 'playing') return true;
        const c = gp(gg, caller.id);
        if (!c || !c.alive) return true;
        if (b && U.dist(c.x, c.y, b.x, b.y) > T.BUTTON_RANGE - 10) placePlayer(gg, c, b.x, b.y + 110);
        c.emergencyLeft = Math.max(1, c.emergencyLeft | 0);
        return !!(gg.applyAction(c.id, { type: 'emergency' }) || {}).ok;
      });
    }
    tr.dirty = true;
    return g.phase === 'meeting';
  }

  function dbgKill(id) {
    const d = dbg();
    if (!d) return false;
    const { tr, g } = d;
    if (g.phase === 'lobby' || g.phase === 'intro') dbgStartNow();
    if (g.phase !== 'playing') return false;
    const ps = gPlayers(g).filter((p) => p.alive && !p.left);
    let target = id != null ? gp(g, id) : null;
    if (!target) target = ps.find((p) => p.role !== 'impostor' && !sameId(p.id, App.myId)) || ps.find((p) => p.role !== 'impostor');
    if (!target || !target.alive || target.role === 'impostor') return false;
    const imps = ps.filter((p) => p.role === 'impostor');
    const killer = imps.find((p) => sameId(p.id, App.myId)) || imps[0];
    if (!killer) return false;
    if (killer.inVent) tr.actAs(killer.id, { type: 'ventExit' });
    killer.x = target.x;
    killer.y = target.y;
    killer.tp = (killer.tp | 0) + 1;
    killer.killCooldown = 0;
    return !!(tr.actAs(killer.id, { type: 'kill', target: target.id }) || {}).ok;
  }

  function dbgSabotage(kind, room) {
    const d = dbg();
    if (!d) return false;
    const { tr, g } = d;
    kind = SAB_KINDS.indexOf(kind) >= 0 ? kind : 'reactor';
    if (g.phase === 'lobby' || g.phase === 'intro') dbgStartNow();
    if (g.phase !== 'playing') return false;
    const imp = gPlayers(g).find((p) => p.role === 'impostor' && !p.left);
    if (!imp) return false;
    if (kind === 'doors' && room == null) {
      const door = ((g.map && g.map.doors) || [])[0];
      if (door) room = door.room;
    }
    const act = { type: 'sabotage', kind };
    if (room != null) act.room = room;
    for (const k of ['sabotageCooldown', 'sabCooldown']) {
      if (typeof g[k] === 'number') g[k] = 0;
      if (typeof imp[k] === 'number') imp[k] = 0;
    }
    let ok = !!(tr.actAs(imp.id, act) || {}).ok;
    if (!ok) {
      tr.fastForward(40, (gg) => gg.phase !== 'playing' || !!(gg.applyAction(imp.id, act) || {}).ok);
      ok = sabotageActive(g, kind);
    }
    tr.dirty = true;
    return ok;
  }

  function dbgWin(team) {
    const d = dbg();
    if (!d) return false;
    const { tr, g } = d;
    team = team === 'impostor' ? 'impostor' : 'crew';
    if (g.phase === 'lobby' || g.phase === 'intro') dbgStartNow();
    if (g.phase === 'ended') return true;
    const ps = gPlayers(g).filter((p) => !p.left);
    if (team === 'crew') {
      for (const p of ps) if (p.role === 'impostor') p.alive = false;
    } else {
      const imps = ps.filter((p) => p.role === 'impostor' && p.alive).length;
      const crew = ps.filter((p) => p.role !== 'impostor' && p.alive)
        .sort((a, b) => (sameId(a.id, App.myId) ? 1 : 0) - (sameId(b.id, App.myId) ? 1 : 0));
      while (crew.length > imps) crew.shift().alive = false;
    }
    tr.fastForward(T.RESULTS_TIME + T.EJECT_TIME + 5, (gg) => gg.phase === 'ended');
    return g.phase === 'ended';
  }

  function dbgTeleport(x, y) {
    x = Number(x);
    y = Number(y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    const tr = App.transport;
    if (App.mode === 'local' && tr && tr.game) {
      const p = gp(tr.game, App.myId);
      if (!p) return false;
      p.x = x;
      p.y = y;
      p.tp = (p.tp | 0) + 1;
      tr.dirty = true;
      return true;
    }
    App.view.me.x = x;
    App.view.me.y = y;
    return true;
  }

  function dbgOpenTask(gameId, extra) {
    const Tk = AS.Tasks;
    if (!Tk || typeof Tk.open !== 'function') return false;
    const sab = { fix_lights: 'lights', fix_comms: 'comms', fix_o2: 'o2', fix_reactor: 'reactor' }[gameId];
    if (sab) {
      const s0 = App.snap;
      if (!(s0 && s0.sabotage && s0.sabotage.kind === sab) && App.mode === 'local') {
        dbgSabotage(sab);
        if (App.transport) App.transport.update(0);
      }
      const panel = ((App.map && App.map.panels) || []).find((p) => p.kind === sab);
      return Tk.open(Object.assign({ game: gameId, panelId: panel ? panel.id : sab, sabotage: sab, room: panel ? panel.room : null, params: {} }, extra || {}));
    }
    const snap = App.snap;
    const tasks = (snap && snap.self && snap.self.tasks) || [];
    for (const t of tasks) {
      if (t.done || !t.steps) continue;
      const st = t.steps[t.step];
      if (st && st.game === gameId) {
        return Tk.open(Object.assign({ game: gameId, taskId: t.id, step: t.step, steps: t.steps.length, stationId: st.station, room: st.room, params: { room: st.room } }, extra || {}));
      }
    }
    return Tk.open(Object.assign({ game: gameId, params: { room: 'admin' } }, extra || {}));
  }

  function dbgFastForward(seconds) {
    const d = dbg();
    if (!d) return 0;
    return d.tr.fastForward(Math.max(0, Number(seconds) || 0));
  }

  function dbgVoteAll(target) {
    const d = dbg();
    if (!d) return false;
    const { tr, g } = d;
    for (const p of gPlayers(g)) if (p.alive && !p.left) tr.actAs(p.id, { type: 'vote', target: target == null ? 'skip' : target });
    return true;
  }

  function openMapOverlay() {
    const H = AS.HUD;
    if (H) {
      for (const fn of ['openMap', 'showMap', 'toggleMap']) {
        if (typeof H[fn] === 'function') { try { H[fn](); return true; } catch (e) { console.error(e); } }
      }
    }
    const I = AS.Input;
    if (I) {
      for (const fn of ['trigger', 'fire', 'emit']) {
        if (typeof I[fn] === 'function') { try { I[fn]('map'); return true; } catch (e) { /* try the next way */ } }
      }
    }
    const opts = { key: 'm', code: 'KeyM', keyCode: 77, which: 77, bubbles: true, cancelable: true };
    document.body.dispatchEvent(new KeyboardEvent('keydown', opts));
    setTimeout(() => document.body.dispatchEvent(new KeyboardEvent('keyup', opts)), 80);
    return true;
  }

  // Jump straight into a game situation (screenshots / manual testing).
  function runScene(name) {
    const d = dbg();
    if (!d) return false;
    const { tr, g } = d;
    switch (name) {
      case 'lobby':
        return true;
      case 'intro':
        return dbgStartNow('intro');
      case 'game':
      case 'playing':
        return dbgStartNow();
      case 'meeting':
      case 'voting':
      case 'eject': {
        if (!dbgMeeting()) return false;
        const want = name === 'meeting' ? 'discussion' : 'voting';
        tr.fastForward(T.MEETING_INTRO_TIME + 135, (gg) => {
          if (gg.phase !== 'meeting') return true;
          const s = meetingStage(gg);
          return s === want || (want === 'discussion' && (s === 'voting' || s === 'results'));
        });
        if (name !== 'eject') return g.phase === 'meeting';
        const alive = gPlayers(g).filter((p) => p.alive && !p.left);
        const target = alive.find((p) => p.role === 'impostor' && !sameId(p.id, App.myId)) || alive.find((p) => !sameId(p.id, App.myId));
        if (target) for (const p of alive) tr.actAs(p.id, { type: 'vote', target: target.id });
        tr.fastForward(T.RESULTS_TIME + 3, (gg) => gg.phase === 'ejecting' || gg.phase === 'ended' || gg.phase === 'playing');
        return g.phase === 'ejecting';
      }
      case 'end':
        return dbgWin(params.team === 'impostor' ? 'impostor' : 'crew');
      case 'map':
        dbgStartNow();
        setTimeout(openMapOverlay, 500);
        return true;
      case 'sabotage':
        dbgStartNow();
        return dbgSabotage(params.sab || 'reactor', params.room);
      default:
        console.warn('[App] unknown scene', name);
        return false;
    }
  }

  App.debug = {
    get game() {
      const tr = App.transport;
      return App.mode === 'local' && tr && tr.game ? tr.game : null;
    },
    startNow: dbgStartNow,
    meeting: dbgMeeting,
    kill: dbgKill,
    sabotage: dbgSabotage,
    win: dbgWin,
    teleport: dbgTeleport,
    openTask: dbgOpenTask,
    ff: dbgFastForward,
    voteAll: dbgVoteAll,
    openMap: openMapOverlay,
    scene: runScene,
  };

  // ------------------------------------------------------------------ boot
  function initModule(name, call) {
    const mod = AS[name];
    if (!mod || typeof mod.init !== 'function') return false;
    try {
      call(mod);
      return true;
    } catch (e) {
      console.error('[App] ' + name + '.init failed', e);
      return false;
    }
  }

  function checkModules() {
    const want = {
      MAPS: AS.MAPS && AS.MAPS.starship, Geo: AS.Geo, Game: AS.Game, Bots: AS.Bots, Audio: AS.Audio, Art: AS.Art,
      Props: AS.Props, Renderer: AS.Renderer, Input: AS.Input, Tasks: AS.Tasks, HUD: AS.HUD, UIMenu: AS.UIMenu,
      UIFlow: AS.UIFlow, LocalTransport: AS.LocalTransport,
    };
    const missing = Object.keys(want).filter((k) => !want[k]);
    if (missing.length) {
      console.warn('[App] missing modules: ' + missing.join(', '));
      debugError(AS.t('app.missing', { list: missing.join(', ') }));
    }
  }

  function boot() {
    if (booted) return;
    booted = true;
    canvas = document.getElementById('world');
    if (DEBUG) setupDebugCapture();
    injectCss();

    const lang = LANG_IDS.indexOf(params.lang) >= 0 ? params.lang : App.prefs.lang;
    AS.i18n.setLang(lang);
    document.documentElement.lang = AS.i18n.getLang();
    AS.i18n.apply(document);
    AS.i18n.onChange((l) => {
      App.prefs.lang = l;
      persistPrefs();
      emit('lang', l);
    });

    setBodyAttr('data-screen', '');
    installGlobalListeners();
    wireTasks();
    updateFpsVisibility();

    initModule('Audio', (m) => m.init());
    applyVolumes();
    initModule('Renderer', (m) => m.init(App, canvas));
    initModule('Input', (m) => m.init(App));
    initModule('HUD', (m) => m.init(App));
    initModule('UIMenu', (m) => m.init(App));
    initModule('UIFlow', (m) => m.init(App));
    checkModules();

    emit('boot');
    setScreen('menu');
    requestAnimationFrame(frame);

    const scene = params.scene;
    if (scene || flag('auto')) {
      const opts = { transient: true };
      const b = numParam('bots');
      if (b !== undefined) opts.bots = b;
      const lv = numParam('level');
      if (lv !== undefined) opts.aiLevel = lv;
      if (SKILLS.indexOf(params.skill) >= 0) opts.botSkill = params.skill;
      const s = numParam('seed');
      if (s !== undefined) opts.seed = s;
      if (!scene) opts.autoStart = true;
      if (startOffline(opts) && scene) {
        try { runScene(scene); } catch (e) { console.error('[App] scene ' + scene, e); }
      }
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(globalThis.AS = globalThis.AS || {});
