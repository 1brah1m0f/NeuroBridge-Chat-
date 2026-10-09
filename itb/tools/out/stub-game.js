(function (AS) {
  'use strict';
  const T = AS.T;
  class StubGame {
    constructor(o) {
      o = o || {};
      this.settings = AS.sanitizeSettings(o.settings); this.phase = 'lobby'; this.map = { id: 'caspian' };
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
      if (this.phase !== 'lobby' || this.order.length >= T.MAX_PLAYERS) return null;
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
        v: 1, t: this.time, phase: this.phase, mapId: 'caspian', hostId: this.hostId, you: viewer,
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
