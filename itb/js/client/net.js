/* AI IMPOSTOR: SPACE SHIP — transports (client side). Contract: docs/CONTRACT.md §5.
 *
 *   const tr = new AS.LocalTransport({ game, myId });   // offline: the AS.Game runs inside the page
 *   const tr = new AS.NetTransport({ url });            // online: WebSocket to server/server.js (path /ws)
 *   tr.send(action); tr.update(dt); tr.close();
 *   tr.onSnapshot = (snap) => {}; tr.onEvents = (events) => {}; tr.onStatus = (s) => {};  // 'connecting'|'open'|'closed'|'error'
 *   NetTransport only: tr.hello(profile); tr.create(); tr.join(code); tr.leave();
 *                      tr.onRoom = ({ code, you }) => {}; tr.onError = (i18nKey) => {}; tr.onWelcome = (id) => {};
 *   LocalTransport extras (debug tools): tr.actAs(playerId, action), tr.fastForward(maxSeconds, untilFn), tr.flush()
 *   AS.Net.resolveUrl(input) -> 'ws://host:port/ws' | null   (accepts '', 'host', 'host:port', 'http(s)://…', 'ws(s)://…')
 */
(function (AS) {
  'use strict';

  AS.i18n.add({
    az: {
      'net.version': 'Oyunun versiyası serverlə uyğun gəlmir. Səhifəni yeniləyin.',
      'net.server': 'Serverdə xəta baş verdi',
      'net.badUrl': 'Server ünvanı düzgün deyil',
      'net.busy': 'Server hazırda məşğuldur, bir az sonra yenidən cəhd edin',
    },
    en: {
      'net.version': 'Game version does not match the server. Refresh the page.',
      'net.server': 'Server error',
      'net.badUrl': 'Invalid server address',
      'net.busy': 'The server is busy, try again in a moment',
    },
  });

  const Net = (AS.Net = AS.Net || {});
  Net.DEFAULT_PORT = 3000;
  Net.PATH = '/ws';

  const sameId = (a, b) => a != null && b != null && String(a) === String(b);
  const forViewer = (events, myId) => {
    const out = [];
    if (!Array.isArray(events)) return out;
    for (const e of events) if (e && typeof e === 'object' && (e.to == null || sameId(e.to, myId))) out.push(e);
    return out;
  };
  Net.filterEvents = forViewer;

  // Rate-limited console.error so a broken module cannot flood the console 60x per second.
  const errCount = {};
  function logError(tag, e) {
    const n = (errCount[tag] = (errCount[tag] || 0) + 1);
    if (n <= 3 || n % 300 === 0) console.error('[' + tag + ']' + (n > 3 ? ' (x' + n + ')' : ''), e);
  }

  /* Turn whatever the user typed into a WebSocket URL.
   *   ''                         -> same origin when served over http(s), else ws://localhost:3000/ws
   *   '192.168.1.5' / 'my-pc'    -> ws://192.168.1.5:3000/ws  (LAN hosts get the default port)
   *   '192.168.1.5:4000'         -> ws://192.168.1.5:4000/ws
   *   'http://host:3000/'        -> ws://host:3000/ws        'https://abc.trycloudflare.com' -> wss://abc.trycloudflare.com/ws
   *   'abc.ngrok-free.app'       -> wss://abc.ngrok-free.app/ws (bare public domains are usually TLS tunnels)
   */
  Net.resolveUrl = function (input) {
    let s = input == null ? '' : String(input).trim();
    const loc = typeof location !== 'undefined' ? location : null;
    if (!s) {
      if (loc && (loc.protocol === 'http:' || loc.protocol === 'https:') && loc.host) {
        return (loc.protocol === 'https:' ? 'wss://' : 'ws://') + loc.host + Net.PATH;
      }
      return 'ws://localhost:' + Net.DEFAULT_PORT + Net.PATH;
    }
    s = s.replace(/\s+/g, '').replace(/[?#].*$/, '');
    let scheme = null;
    const m = /^([a-z][a-z0-9+.-]*):\/\//i.exec(s);
    if (m) {
      scheme = m[1].toLowerCase();
      s = s.slice(m[0].length);
      if (scheme === 'http') scheme = 'ws';
      else if (scheme === 'https') scheme = 'wss';
      else if (scheme !== 'ws' && scheme !== 'wss') return null;
    }
    const slash = s.indexOf('/');
    let hostport = slash >= 0 ? s.slice(0, slash) : s;
    let path = slash >= 0 ? s.slice(slash) : '';
    if (!hostport || /[^a-z0-9.\-:[\]_]/i.test(hostport)) return null;
    const portMatch = /:(\d{1,5})$/.exec(hostport);
    if (portMatch && (Number(portMatch[1]) < 1 || Number(portMatch[1]) > 65535)) return null;
    const hostname = hostport.replace(/:\d{1,5}$/, '').replace(/^\[|\]$/g, '');
    if (!hostname) return null;
    const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.indexOf(':') >= 0;
    const isLan = isIp || hostname === 'localhost' || /\.(local|lan|home|internal)$/i.test(hostname) || hostname.indexOf('.') < 0;
    if (!scheme) {
      scheme = !portMatch && !isLan ? 'wss' : 'ws';
      if (!portMatch && isLan) hostport += ':' + Net.DEFAULT_PORT;
    }
    if (!path || path === '/' || /\.html?$/i.test(path)) path = Net.PATH;
    else if (!/\/ws$/.test(path)) path = path.replace(/\/+$/, '') + Net.PATH;
    return scheme + '://' + hostport + path;
  };

  // ------------------------------------------------------------------ LocalTransport
  class LocalTransport {
    constructor(opts) {
      opts = opts || {};
      this.kind = 'local';
      this.game = opts.game || null;
      this.myId = opts.myId;
      this.onSnapshot = null;
      this.onEvents = null;
      this.onStatus = null;
      this.status = 'open';
      this.maxTicksPerFrame = 5;
      this.acc = 0;
      this.ticks = 0;
      this.pending = [];
      this.dirty = true; // emit a snapshot on the next update even if no tick ran
      this.closed = false;
      this._announced = false;
    }

    // Apply my action immediately (same rules the server uses). Returns the game's { ok, err }.
    send(action) {
      return this.actAs(this.myId, action);
    }

    // Apply an action as any player (used by App.debug). Rejections of non-move actions by MY player
    // become a private {type:'error', to, err} event unless the game already emitted one.
    actAs(playerId, action) {
      if (this.closed || !this.game) return { ok: false, err: 'closed' };
      if (!action || typeof action !== 'object' || typeof action.type !== 'string') return { ok: false, err: 'invalid' };
      const mine = sameId(playerId, this.myId);
      const before = mine ? this._countErrors() : 0;
      let res;
      try {
        res = this.game.applyAction(playerId, action);
      } catch (e) {
        logError('LocalTransport.applyAction ' + action.type, e);
        res = { ok: false, err: 'internal' };
      }
      this._collect();
      if (mine && res && res.ok === false && action.type !== 'move' && this._countErrors() === before) {
        this.pending.push({ type: 'error', to: this.myId, err: res.err || 'invalid', action: action.type });
      }
      if (action.type !== 'move' || !mine) this.dirty = true;
      return res || { ok: true };
    }

    // Fixed-step simulation: accumulate real time, run at most 5 ticks per frame (drop the rest),
    // then deliver my events and a fresh snapshot.
    update(dt) {
      if (this.closed || !this.game) return;
      if (!this._announced) {
        this._announced = true;
        if (this.onStatus) this.onStatus('open');
        if (this.closed) return;
      }
      const T = AS.T.TICK;
      this.acc += Math.max(0, Math.min(Number(dt) || 0, 0.25));
      let n = 0;
      while (this.acc >= T && n < this.maxTicksPerFrame) {
        try { this.game.tick(T); } catch (e) { logError('LocalTransport.tick', e); }
        this.acc -= T;
        n++;
      }
      if (n >= this.maxTicksPerFrame && this.acc >= T) this.acc = 0; // too slow: let the game fall behind instead of spiralling
      this.ticks += n;
      if (n > 0) this._collect();
      if (n > 0 || this.dirty || this.pending.length) this.flush();
    }

    // Deliver pending events + a snapshot right now (no tick).
    flush() {
      if (this.closed || !this.game) return;
      this.dirty = false;
      const evs = this.pending;
      this.pending = [];
      if (evs.length && this.onEvents) {
        try { this.onEvents(evs); } catch (e) { logError('LocalTransport.onEvents', e); }
      }
      if (this.closed || !this.onSnapshot) return;
      let snap = null;
      try { snap = this.game.snapshotFor(this.myId); } catch (e) { logError('LocalTransport.snapshotFor', e); }
      if (snap) {
        try { this.onSnapshot(snap); } catch (e) { logError('LocalTransport.onSnapshot', e); }
      }
    }

    // Debug: simulate up to maxSeconds of game time at once (until `until(game)` returns true).
    fastForward(maxSeconds, until) {
      if (this.closed || !this.game) return 0;
      const T = AS.T.TICK;
      let t = 0;
      while (t < maxSeconds) {
        if (until) {
          let stop = false;
          try { stop = !!until(this.game); } catch (e) { logError('LocalTransport.fastForward', e); stop = true; }
          this._collect();
          if (stop) break;
        }
        try { this.game.tick(T); } catch (e) { logError('LocalTransport.tick', e); }
        this._collect();
        t += T;
      }
      this.dirty = true;
      return t;
    }

    close() {
      if (this.closed) return;
      this.closed = true;
      this.pending = [];
      this.status = 'closed';
      const cb = this.onStatus;
      this.onSnapshot = this.onEvents = this.onStatus = null;
      if (cb) { try { cb('closed'); } catch (e) { logError('LocalTransport.onStatus', e); } }
    }

    _collect() {
      let evs = null;
      try { evs = this.game.drainEvents(); } catch (e) { logError('LocalTransport.drainEvents', e); }
      if (evs && evs.length) for (const e of forViewer(evs, this.myId)) this.pending.push(e);
    }

    _countErrors() {
      let n = 0;
      for (const e of this.pending) if (e.type === 'error') n++;
      return n;
    }
  }

  // ------------------------------------------------------------------ NetTransport
  class NetTransport {
    constructor(opts) {
      opts = opts || {};
      this.kind = 'online';
      this.url = Net.resolveUrl(opts.url);
      this.onSnapshot = null;
      this.onEvents = null;
      this.onStatus = null;
      this.onRoom = null;
      this.onError = null;
      this.onWelcome = null;
      this.status = 'idle';
      this.ws = null;
      this.myId = null;
      this.code = null;
      this.queue = [];
      this.everOpen = false;
      this.closedByUser = false;
      this.connError = false;
      this.timeoutMs = opts.timeout || 8000;
      this.stats = { snaps: 0, snapRate: 0, rateT: now(), lastSnapAt: 0, bytesIn: 0 };
      this._timer = 0;
      // Connect on the next microtask so callbacks assigned right after `new` see 'connecting'.
      Promise.resolve().then(() => this.connect());
    }

    connect() {
      if (this.ws || this.closedByUser) return;
      if (!this.url) { this._fail('net.badUrl'); return; }
      if (typeof WebSocket === 'undefined') { this._fail('err.connection'); return; }
      this._setStatus('connecting');
      let ws;
      try {
        ws = new WebSocket(this.url);
      } catch (e) {
        this._fail('net.badUrl');
        return;
      }
      this.ws = ws;
      this._timer = setTimeout(() => {
        if (this.ws === ws && ws.readyState !== 1) {
          this._error('err.connection');
          try { ws.close(); } catch (e) { /* ignore */ }
        }
      }, this.timeoutMs);
      ws.onopen = () => {
        if (this.ws !== ws) return;
        clearTimeout(this._timer);
        this.everOpen = true;
        this._setStatus('open');
        const q = this.queue;
        this.queue = [];
        for (const m of q) this._raw(m);
      };
      ws.onmessage = (e) => {
        if (this.ws !== ws) return;
        this._onMessage(e.data);
      };
      ws.onerror = () => {
        if (this.ws !== ws || this.closedByUser) return;
        this._setStatus('error');
      };
      ws.onclose = () => {
        if (this.ws !== ws) return;
        clearTimeout(this._timer);
        this.ws = null;
        if (!this.closedByUser) {
          this._error(this.everOpen ? 'err.disconnected' : 'err.connection');
          this._setStatus('closed');
        }
      };
    }

    hello(profile) {
      const p = profile || {};
      this._send({ t: 'hello', v: AS.PROTOCOL, name: p.name, color: p.color, hat: p.hat }, true);
    }
    create() { this._send({ t: 'create' }, true); }
    join(code) {
      const c = String(code == null ? '' : code).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
      this._send({ t: 'join', code: c }, true);
    }
    leave() { this._send({ t: 'leave' }, false); }

    send(action) {
      if (!action || typeof action !== 'object' || typeof action.type !== 'string') return false;
      const isMove = action.type === 'move';
      // Drop position updates while the socket is congested; the next one supersedes them anyway.
      if (isMove && this.ws && this.ws.bufferedAmount > 65536) return false;
      return this._send({ t: 'act', a: action }, !isMove);
    }

    update() {
      const t = now();
      if (t - this.stats.rateT >= 1) {
        this.stats.snapRate = this.stats.snaps / (t - this.stats.rateT);
        this.stats.snaps = 0;
        this.stats.rateT = t;
      }
    }

    close() {
      if (this.closedByUser) return;
      this.closedByUser = true;
      this.queue = [];
      clearTimeout(this._timer);
      const ws = this.ws;
      this.ws = null;
      if (ws) {
        try { if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'leave' })); } catch (e) { /* ignore */ }
        try { ws.close(1000, 'bye'); } catch (e) { /* ignore */ }
      }
      const cb = this.onStatus;
      this.status = 'closed';
      this.onSnapshot = this.onEvents = this.onStatus = this.onRoom = this.onError = this.onWelcome = null;
      if (cb) { try { cb('closed'); } catch (e) { logError('NetTransport.onStatus', e); } }
    }

    _send(msg, queueable) {
      if (this.closedByUser) return false;
      const ws = this.ws;
      if (ws && ws.readyState === 1) return this._raw(msg);
      if (queueable && this.queue.length < 64) this.queue.push(msg);
      return false;
    }

    _raw(msg) {
      const ws = this.ws;
      if (!ws || ws.readyState !== 1) return false;
      try {
        ws.send(JSON.stringify(msg));
        return true;
      } catch (e) {
        return false;
      }
    }

    _onMessage(data) {
      if (typeof data !== 'string') return;
      this.stats.bytesIn += data.length;
      let m;
      try { m = JSON.parse(data); } catch (e) { return; }
      if (!m || typeof m !== 'object') return;
      try {
        switch (m.t) {
          case 'welcome':
            if (this.myId == null) this.myId = m.id;
            if (this.onWelcome) this.onWelcome(m.id);
            break;
          case 'room':
            this.code = m.code;
            this.myId = m.you;
            if (this.onRoom) this.onRoom({ code: m.code, you: m.you });
            break;
          case 'err':
            if (this.onError) this.onError(typeof m.key === 'string' ? m.key : 'net.server');
            break;
          case 'snap':
            this.stats.snaps++;
            this.stats.lastSnapAt = now();
            if (m.s && this.onSnapshot) this.onSnapshot(m.s);
            break;
          case 'ev': {
            const evs = forViewer(m.e, this.myId);
            if (evs.length && this.onEvents) this.onEvents(evs);
            break;
          }
          default:
            break;
        }
      } catch (e) {
        logError('NetTransport.' + m.t, e);
      }
    }

    _setStatus(s) {
      if (this.status === s) return;
      this.status = s;
      if (this.onStatus) { try { this.onStatus(s); } catch (e) { logError('NetTransport.onStatus', e); } }
    }

    // Report one connection-level error per transport (timeout + close would otherwise double up).
    _error(key) {
      if (this.connError) return;
      this.connError = true;
      if (this.onError) { try { this.onError(key); } catch (e) { logError('NetTransport.onError', e); } }
    }

    _fail(key) {
      this._error(key);
      this._setStatus('error');
      this._setStatus('closed');
    }
  }

  function now() {
    return (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
  }

  AS.LocalTransport = LocalTransport;
  AS.NetTransport = NetTransport;
})(globalThis.AS = globalThis.AS || {});
