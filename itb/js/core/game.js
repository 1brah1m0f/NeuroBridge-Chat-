/* AI IMPOSTOR: SPACE SHIP — authoritative game simulation (browser + Node). Owner: core. See docs/CONTRACT.md §4.
 *
 *   const game = new AS.Game({ mapId: 'starship', settings, seed, isServer: false });
 *   Contract API: addPlayer, addBot, removePlayer, setRolePreference, applyAction, tick, drainEvents, snapshotFor,
 *                 canSee, visionRadius, getPlayer, order, hostId, phase, time, map, geo, rng (+ settings, players).
 *
 *   Extra public helpers (debug tools, bots, server):
 *     game.startCountdown() / game.startGame()             start with / without the 3-2-1 countdown
 *     game.startMeeting(callerId, bodyId|null, emergency)  game.endGame(winner, reason)   game.returnToLobby()
 *     game.killPlayer(victimId, killerId?)                 game.teleport(id, x, y)
 *     game.startSabotage(kind, room?) / game.fixSabotage() game.taskProgress() -> real 0..1 (never hidden)
 *     game.canSeePlayer(viewerId, targetId)                game.list() -> players in join order
 *     game.timeLeft() -> seconds left in the current timed phase / meeting stage / countdown, or null
 *     lookups (null-prototype dicts): stationById, ventById, panelById, doorById, roomById, taskDefById,
 *       doorsByRoom {room: [door]}, panelsByKind {kind: [panel]}, ventLinks {ventId: [ids]} (symmetric)
 *     state: bodies [{id,x,y,color}], sabotage {kind, timer, panels:{id:{done,held,holder}}}, doorTimers {doorId: s},
 *       doorCooldowns {room: s}, emergencyTimer, sabotageCooldown, meeting {caller, body, emergency, stage, timer,
 *       tally, outcome}, ejection, result, countdown
 *   Ids are always strings. Action errors are bare codes ({ok:false, err:'cooldown'}); every code has an
 *   `err.<code>` i18n string (registered below / in i18n.js).
 */
(function (AS) {
  'use strict';

  const U = AS.util;
  const T = AS.T;
  const UNLIMITED_VISION = 100000;
  const MAIN_SABOTAGES = new Set(['lights', 'comms', 'reactor', 'o2']);
  const isCritical = (k) => k === 'reactor' || k === 'o2';
  const r1 = (v) => Math.round(v * 10) / 10;
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
  const ok = () => ({ ok: true });
  const fail = (err, extra) => (extra ? Object.assign({ ok: false, err }, extra) : { ok: false, err });
  const dict = () => Object.create(null);
  const validColor = (c) => typeof c === 'string' && AS.COLORS.some((k) => k.id === c);
  const validHat = (h) => typeof h === 'string' && AS.HATS.indexOf(h) >= 0;
  const USER_ERRORS = new Set(['colorTaken', 'notHost', 'needPlayers', 'full']); // also emitted as private 'error' events
  const MAX_EVENTS = 4000;
  const USE_SLACK = 15;   // tolerance for client/server position lag on range checks

  function cleanText(s) {
    if (typeof s !== 'string') return '';
    s = cleanName.strip(s);
    return Array.from(s).slice(0, 120).join('').trim();
  }

  function cleanName(s) {
    if (s == null) return '';
    s = cleanName.strip(String(s));
    return Array.from(s).slice(0, 12).join('').trim();
  }
  cleanName.strip = function (s) {
    return s.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, '').replace(/\s+/g, ' ').trim();
  };

  if (AS.i18n) {
    AS.i18n.add({
      az: {
        'core.player': 'Oyunçu {n}', 'core.bot': 'Bot {n}',
        'err.phase': 'İndi bunu etmək olmaz', 'err.dead': 'Ruhlar bunu edə bilməz',
        'err.notImpostor': 'Bunu yalnız saxtakar edə bilər', 'err.notCrew': 'Bunu yalnız ekipaj üzvü edə bilər',
        'err.cooldown': 'Hələ hazır deyil', 'err.range': 'Çox uzaqdasan', 'err.los': 'Hədəf görünmür',
        'err.target': 'Yanlış hədəf', 'err.inVent': 'Əvvəlcə ventilyasiyadan çıx', 'err.notInVent': 'Ventilyasiyada deyilsən',
        'err.noVent': 'Yaxınlıqda ventilyasiya yoxdur', 'err.notLinked': 'Bu ventilyasiyalar bir-birinə bağlı deyil',
        'err.sabotageActive': 'Artıq sabotaj gedir', 'err.critical': 'Təhlükəli sabotaj zamanı yığıncaq çağırmaq olmaz',
        'err.noUses': 'Təcili yığıncaq haqqın qalmayıb', 'err.voted': 'Artıq səs vermisən', 'err.stage': 'Səsvermə hələ başlamayıb',
        'err.noBody': 'Yaxınlıqda cəsəd yoxdur', 'err.noTask': 'Tapşırıq tapılmadı', 'err.taskDone': 'Bu tapşırıq artıq tamamlanıb',
        'err.notScan': 'Bu addım skan deyil', 'err.noPanel': 'Panel tapılmadı', 'err.noSabotage': 'Düzəldiləcək nasazlıq yoxdur',
        'err.noDoors': 'Bu otaqda qapı yoxdur', 'err.busy': 'Bu artıq istifadə olunur', 'err.badAction': 'Yanlış əməliyyat',
        'err.badColor': 'Belə rəng yoxdur', 'err.left': 'Sən oyunu tərk etmisən', 'err.noPlayer': 'Oyunçu tapılmadı',
        'err.noButton': 'Təcili düymə tapılmadı', 'err.bot': 'Botlar bunu edə bilməz', 'err.internal': 'Daxili xəta baş verdi',
        'err.stale': 'Mövqe yenilənir', 'err.implausible': 'Mövqe düzəldildi', 'err.blocked': 'Bura keçmək olmur',
      },
      en: {
        'core.player': 'Player {n}', 'core.bot': 'Bot {n}',
        'err.phase': 'Not possible right now', 'err.dead': 'Ghosts cannot do that',
        'err.notImpostor': 'Only impostors can do that', 'err.notCrew': 'Only crewmates can do that',
        'err.cooldown': 'Not ready yet', 'err.range': 'Too far away', 'err.los': 'Target not in sight',
        'err.target': 'Invalid target', 'err.inVent': 'Leave the vent first', 'err.notInVent': 'You are not in a vent',
        'err.noVent': 'No vent nearby', 'err.notLinked': 'Those vents are not connected',
        'err.sabotageActive': 'A sabotage is already active', 'err.critical': 'Cannot call a meeting during a critical sabotage',
        'err.noUses': 'No emergency meetings left', 'err.voted': 'You already voted', 'err.stage': 'Voting has not started yet',
        'err.noBody': 'No body nearby', 'err.noTask': 'Task not found', 'err.taskDone': 'Task already completed',
        'err.notScan': 'This step is not a scan', 'err.noPanel': 'Panel not found', 'err.noSabotage': 'Nothing to fix here',
        'err.noDoors': 'This room has no doors', 'err.busy': 'Already in use', 'err.badAction': 'Invalid action',
        'err.badColor': 'Unknown color', 'err.left': 'You left the game', 'err.noPlayer': 'Player not found',
        'err.noButton': 'Emergency button not found', 'err.bot': 'Bots cannot do that', 'err.internal': 'Internal error',
        'err.stale': 'Syncing position', 'err.implausible': 'Position corrected', 'err.blocked': 'Cannot go there',
      },
    });
  }

  class Game {
    constructor(opts) {
      opts = opts || {};
      const maps = AS.MAPS || {};
      let mapId = opts.mapId != null ? String(opts.mapId) : 'starship';
      let map = maps[mapId];
      if (!map || typeof map !== 'object') {
        const ids = Object.keys(maps).filter((k) => maps[k] && typeof maps[k] === 'object');
        if (!ids.length) throw new Error('[AS.Game] no maps registered (AS.MAPS is empty)');
        mapId = ids.indexOf('starship') >= 0 ? 'starship' : ids[0];
        map = maps[mapId];
      }
      this.mapId = mapId;
      this.map = map;
      this.geo = AS.Geo.build(map);
      this.settings = AS.sanitizeSettings(opts.settings);
      const seed = Number(opts.seed);
      this.seed = opts.seed != null && isFinite(seed) ? seed >>> 0 : (Math.random() * 4294967296) >>> 0;
      this.rng = U.rng(this.seed);
      this.isServer = !!opts.isServer;

      this.players = dict();
      this.order = [];
      this.hostId = null;
      this.phase = 'lobby';
      this.time = 0;
      this.phaseTime = 0;     // seconds spent in the current phase
      this.phaseTimer = 0;    // countdown for intro / ejecting
      this.countdown = null;
      this.countdownTimer = 0;
      this.bodies = [];
      this.sabotage = null;
      this.sabotageCooldown = 0;
      this.doorTimers = dict();
      this.doorCooldowns = dict();
      this.emergencyTimer = 0;
      this.meeting = null;
      this.ejection = null;
      this.result = null;
      this.taskProgressShown = 0;
      this.meetingCount = 0;
      this.rolePrefs = dict();
      this.events = [];
      this._botQueue = [];
      this._logged = dict();
      this._cause = null;
      this._index();
    }

    // ------------------------------------------------------------------ indexes
    _index() {
      const m = this.map;
      const byId = (list) => {
        const o = dict();
        for (const it of Array.isArray(list) ? list : []) if (it && it.id != null && o[it.id] == null) o[it.id] = it;
        return o;
      };
      this.stationById = byId(m.stations);
      this.ventById = byId(m.vents);
      this.panelById = byId(m.panels);
      this.doorById = byId(m.doors);
      this.roomById = byId(m.rooms);
      this.taskDefById = byId(m.taskDefs);
      this.doorsByRoom = dict();
      for (const d of Array.isArray(m.doors) ? m.doors : []) {
        if (!d || d.id == null || d.room == null || !Array.isArray(d.rect)) continue;
        (this.doorsByRoom[d.room] || (this.doorsByRoom[d.room] = [])).push(d);
      }
      this.doorRooms = Object.keys(this.doorsByRoom);
      this.panelsByKind = dict();
      for (const p of Array.isArray(m.panels) ? m.panels : []) {
        if (p && p.id != null && p.kind) (this.panelsByKind[p.kind] || (this.panelsByKind[p.kind] = [])).push(p);
      }
      const links = dict();
      for (const v of Array.isArray(m.vents) ? m.vents : []) {
        if (!v || v.id == null) continue;
        if (!links[v.id]) links[v.id] = [];
        for (const l of Array.isArray(v.links) ? v.links : []) {
          if (l === v.id || !this.ventById[l]) continue;
          if (links[v.id].indexOf(l) < 0) links[v.id].push(l);
          if (!links[l]) links[l] = [];
          if (links[l].indexOf(v.id) < 0) links[l].push(v.id);
        }
      }
      this.ventLinks = links;
      this.lobbyRoom = (Array.isArray(m.rooms) ? m.rooms : []).find((r) => r && r.lobby) || null;
    }

    // ------------------------------------------------------------------ players
    getPlayer(id) {
      if (id == null) return null;
      return this.players[String(id)] || null;
    }

    list() {
      const out = [];
      for (const id of this.order) { const p = this.players[id]; if (p) out.push(p); }
      return out;
    }

    _active() {
      const out = [];
      for (const id of this.order) { const p = this.players[id]; if (p && !p.left) out.push(p); }
      return out;
    }

    _hasBots() {
      for (const id of this.order) { const p = this.players[id]; if (p && p.isBot && !p.left) return true; }
      return false;
    }

    _colorTaken(color, exceptId) {
      for (const id of this.order) { const p = this.players[id]; if (p && p.id !== exceptId && p.color === color) return true; }
      return false;
    }

    _freeColors(exceptId) {
      return AS.COLORS.map((c) => c.id).filter((c) => !this._colorTaken(c, exceptId));
    }

    _newPlayer(id, name, color, hat, isBot) {
      return {
        id, name, color, hat, isBot: !!isBot, isAI: false,
        x: 0, y: 0, facing: 1, moving: false, tp: 0,
        role: null, alive: true, left: false, tasks: [],
        killCooldown: 0, emergencyLeft: 0, inVent: null, ventTime: -99,
        scanning: false, scanTask: null, scanTime: 0, holding: null, vote: null,
        input: { x: 0, y: 0 }, brain: {},
        lastMove: this.time, joinTime: this.time, deathTime: null, killedBy: null, ejected: false,
      };
    }

    addPlayer(info) {
      try {
        info = info || {};
        if (this.phase !== 'lobby') return null;
        if (this._active().length >= T.MAX_LOBBY) return null;
        let id = info.id != null && info.id !== '' ? String(info.id) : null;
        if (id == null) { do { id = U.uid('p'); } while (this.players[id]); }
        if (this.players[id]) return null;
        const isBot = !!info.isBot;
        const name = cleanName(info.name) || AS.t(isBot ? 'core.bot' : 'core.player', { n: this.order.length + 1 });
        let color = validColor(info.color) && !this._colorTaken(info.color, null) ? info.color : null;
        if (!color) {
          const free = this._freeColors(null);
          if (!free.length) return null;
          color = U.pick(this.rng, free);
        }
        const hat = validHat(info.hat) ? info.hat : 'none';
        const p = this._newPlayer(id, name, color, hat, isBot);
        this.players[id] = p;
        this.order.push(id);
        this._placeInLobby(p);
        this._emit({ type: 'join', player: id, name: p.name, color: p.color, isBot: p.isBot });
        if (!isBot && this.hostId == null) this._setHost(id);
        return p;
      } catch (e) {
        this._logOnce('addPlayer', e);
        return null;
      }
    }

    addBot() {
      if (this.phase !== 'lobby' || this._active().length >= T.MAX_LOBBY) return null;
      const used = new Set(this.list().map((p) => String(p.name).toLocaleLowerCase()));
      const names = AS.BOT_NAMES.filter((n) => !used.has(n.toLocaleLowerCase()));
      let name = names.length ? U.pick(this.rng, names) : null;
      if (!name) { let n = 1; while (used.has(('bot ' + n).toLocaleLowerCase())) n++; name = 'Bot ' + n; }
      const hats = AS.HATS.filter((h) => h !== 'none');
      const hat = this.rng() < 0.12 || !hats.length ? 'none' : U.pick(this.rng, hats);
      return this.addPlayer({ name, hat, isBot: true });
    }

    removePlayer(id) {
      try {
        const p = this.getPlayer(id);
        if (!p) return false;
        if (this.phase === 'lobby') {
          delete this.players[p.id];
          const i = this.order.indexOf(p.id);
          if (i >= 0) this.order.splice(i, 1);
          delete this.rolePrefs[p.id];
          this._emit({ type: 'leave', player: p.id, name: p.name, color: p.color });
          if (this.countdown != null && this._active().length < T.MIN_PLAYERS) { this.countdown = null; this.countdownTimer = 0; }
        } else {
          if (p.left) return false;
          this._stopScan(p);
          this._releaseHold(p);
          p.inVent = null;
          p.left = true;
          p.alive = false;
          p.tasks = [];
          p.vote = null;
          p.moving = false;
          if (p.input) { p.input.x = 0; p.input.y = 0; }
          this._cause = 'disconnect';
          this._emit({ type: 'leave', player: p.id, name: p.name, color: p.color });
        }
        if (this.hostId === p.id) this._migrateHost();
        if (this.phase === 'meeting' && this.meeting && this.meeting.stage === 'voting' && this._allVoted()) this._toResults();
        if (this.phase !== 'lobby' && this.phase !== 'ended') this._checkWin();
        return true;
      } catch (e) {
        this._logOnce('removePlayer', e);
        return false;
      }
    }

    setRolePreference(id, pref) {
      const p = this.getPlayer(id);
      if (!p) return false;
      if (pref === 'crew' || pref === 'impostor') this.rolePrefs[p.id] = pref;
      else delete this.rolePrefs[p.id];
      return true;
    }

    _setHost(id) {
      if (this.hostId === id) return;
      this.hostId = id;
      this._emit({ type: 'host', player: id });
    }

    _migrateHost() {
      let next = null;
      for (const id of this.order) { const q = this.players[id]; if (q && !q.isBot && !q.left) { next = q.id; break; } }
      this._setHost(next);
    }

    // ------------------------------------------------------------------ positions
    _teleport(p, x, y) {
      p.x = x; p.y = y;
      p.tp++;
      p.lastMove = this.time;
      p.moving = false;
    }

    // Integer, standable point at/near (x, y) (snapshots round positions; keep teleports exact).
    _standPoint(x, y) {
      const geo = this.geo;
      let rx = Math.round(x), ry = Math.round(y);
      if (isNum(rx) && isNum(ry) && geo.canStand(rx, ry)) return [rx, ry];
      const p = geo.nearestStandable(x, y);
      rx = Math.round(p[0]); ry = Math.round(p[1]);
      if (geo.canStand(rx, ry)) return [rx, ry];
      for (let d = 1; d <= 3; d++) {
        for (const o of [[d, 0], [-d, 0], [0, d], [0, -d], [d, d], [-d, -d], [d, -d], [-d, d]]) {
          if (geo.canStand(rx + o[0], ry + o[1])) return [rx + o[0], ry + o[1]];
        }
      }
      return [p[0], p[1]];
    }

    _placeInLobby(p) {
      const sp = this.map.spawns && Array.isArray(this.map.spawns.lobby) ? this.map.spawns.lobby : [];
      const spawns = sp.filter((s) => s && isNum(+s[0]) && isNum(+s[1]));
      const idx = Math.max(0, this.order.indexOf(p.id));
      let pos = null;
      for (let k = 0; k < spawns.length && !pos; k++) {
        const s = spawns[(idx + k) % spawns.length];
        let taken = false;
        for (const id of this.order) {
          const q = this.players[id];
          if (q && q !== p && !q.left && Math.hypot(q.x - s[0], q.y - s[1]) < 30) { taken = true; break; }
        }
        if (!taken) pos = [+s[0], +s[1]];
      }
      if (!pos && spawns.length) { const s = spawns[idx % spawns.length]; pos = [+s[0], +s[1]]; }
      if (!pos && this.lobbyRoom) pos = this.geo.randomPointInRoom(this.rng, this.lobbyRoom.id);
      if (!pos) pos = this.geo.nearestStandable(this.geo.width / 2, this.geo.height / 2);
      const pt = this._standPoint(pos[0], pos[1]);
      this._teleport(p, pt[0], pt[1]);
      p.facing = this.rng() < 0.5 ? -1 : 1;
    }

    _seatPlayers(onlyAlive) {
      const seats = (this.map.spawns && Array.isArray(this.map.spawns.meeting) ? this.map.spawns.meeting : [])
        .filter((s) => s && isNum(+s[0]) && isNum(+s[1]));
      const btn = this.map.button && isNum(+this.map.button.x) ? this.map.button : null;
      const n = Math.max(1, this.order.length);
      this.order.forEach((id, idx) => {
        const p = this.players[id];
        if (!p || p.left || (onlyAlive && !p.alive)) return;
        let sx, sy;
        if (seats.length) { const s = seats[idx % seats.length]; sx = +s[0]; sy = +s[1]; }
        else if (btn) { const a = (idx / n) * Math.PI * 2; sx = btn.x + Math.cos(a) * 160; sy = btn.y + Math.sin(a) * 160; }
        else { const c = this.geo.nearestStandable(this.geo.width / 2, this.geo.height / 2); sx = c[0]; sy = c[1]; }
        const pt = p.alive ? this._standPoint(sx, sy) : [sx, sy];
        this._teleport(p, pt[0], pt[1]);
        if (btn) p.facing = btn.x >= pt[0] ? 1 : -1;
      });
    }

    teleport(id, x, y) {
      const p = this.getPlayer(id);
      if (!p || !isNum(x) || !isNum(y)) return false;
      if (p.alive) { const pt = this._standPoint(x, y); x = pt[0]; y = pt[1]; }
      else { x = clamp(x, 0, this.geo.width); y = clamp(y, 0, this.geo.height); }
      p.inVent = null;
      this._teleport(p, x, y);
      return true;
    }

    _speed(p) {
      return T.BASE_SPEED * this.settings.playerSpeed * (p.alive ? 1 : T.GHOST_SPEED_MULT);
    }

    // ------------------------------------------------------------------ vision
    visionRadius(id) {
      const p = this.getPlayer(id);
      const s = this.settings;
      if (p && (!p.alive || p.left)) return UNLIMITED_VISION;
      if (p && p.role === 'impostor') return Math.max(T.MIN_VISION, T.BASE_VISION * s.impostorVision);
      let r = T.BASE_VISION * s.crewVision;
      if (p && this.sabotage && this.sabotage.kind === 'lights') r *= T.LIGHTS_OFF_MULT;
      return Math.max(T.MIN_VISION, r);
    }

    canSee(viewerId, x, y) {
      const v = this.getPlayer(viewerId);
      if (!v || !isNum(x) || !isNum(y)) return false;
      if (!v.alive || v.left) return true;
      if (this.phase === 'lobby' || this.phase === 'ended') return true;
      if (dist(v.x, v.y, x, y) > this.visionRadius(v.id)) return false;
      return this.geo.lineOfSight(v.x, v.y, x, y);
    }

    canSeePlayer(viewerId, targetId) {
      const v = this.getPlayer(viewerId), t = this.getPlayer(targetId);
      if (!v || !t || t.left) return false;
      if (t === v) return true;
      if (t.inVent) return false;
      if (!t.alive && v.alive && !v.left) return false;
      return this.canSee(v.id, t.x, t.y);
    }

    // ------------------------------------------------------------------ tasks
    _instTask(def, fake) {
      const steps = def.steps.map((st) => {
        st = st || {};
        const sid = Array.isArray(st.st) ? (st.st.length ? U.pick(this.rng, st.st) : null) : st.st;
        const station = sid != null ? this.stationById[sid] : null;
        let room = null;
        if (station) room = station.room != null ? station.room : this.geo.roomAt(station.x, station.y);
        return {
          station: sid != null ? String(sid) : null,
          game: st.game || null,
          room,
          nameKey: st.nameKey || def.nameKey || 'task.' + def.id,
        };
      });
      return {
        id: String(def.id), def: String(def.id), nameKey: def.nameKey || 'task.' + def.id, kind: def.kind || 'short',
        fake: !!fake, visual: !!def.visual, step: 0, done: false, steps,
      };
    }

    _assignTasks(players) {
      const rng = this.rng, s = this.settings;
      const defs = (Array.isArray(this.map.taskDefs) ? this.map.taskDefs : [])
        .filter((d) => d && d.id != null && Array.isArray(d.steps) && d.steps.length);
      const ofKind = (k) => defs.filter((d) => d.kind === k);
      // Common tasks: the same defs (and the same station picks) for everyone.
      const common = U.shuffle(rng, ofKind('common')).slice(0, s.commonTasks).map((d) => this._instTask(d, false));
      const longs = ofKind('long'), shorts = ofKind('short');
      for (const p of players) {
        const fake = p.role === 'impostor';
        const list = common.map((t) => Object.assign({}, t, { fake, steps: t.steps.map((x) => Object.assign({}, x)) }));
        for (const d of U.shuffle(rng, longs.slice()).slice(0, s.longTasks)) list.push(this._instTask(d, fake));
        for (const d of U.shuffle(rng, shorts.slice()).slice(0, s.shortTasks)) list.push(this._instTask(d, fake));
        const seen = new Set();
        for (const t of list) { let id = t.id, n = 2; while (seen.has(id)) id = t.id + '#' + n++; t.id = id; seen.add(id); }
        p.tasks = list;
      }
    }

    _progress() {
      let done = 0, total = 0;
      for (const id of this.order) {
        const p = this.players[id];
        if (!p || p.left || p.role !== 'crew') continue;
        for (const t of p.tasks) {
          if (t.fake) continue;
          total += t.steps.length;
          done += t.done ? t.steps.length : Math.min(t.step, t.steps.length);
        }
      }
      return { done, total };
    }

    taskProgress() {
      const pr = this._progress();
      return pr.total > 0 ? pr.done / pr.total : 0;
    }

    _task(p, id) {
      if (id == null) return null;
      id = String(id);
      for (const t of p.tasks) if (t.id === id) return t;
      return null;
    }

    _stopScan(p) {
      if (!p || !p.scanning) return;
      p.scanning = false;
      p.scanTask = null;
      if (this.settings.visualTasks) this._emit({ type: 'scan', player: p.id, active: false });
    }

    // ------------------------------------------------------------------ flow
    startCountdown() {
      if (this.phase !== 'lobby' || this.countdown != null) return false;
      this.countdown = T.LOBBY_COUNTDOWN;
      this.countdownTimer = T.LOBBY_COUNTDOWN;
      this._emit({ type: 'countdown', n: this.countdown });
      return true;
    }

    _tickCountdown(dt) {
      if (this.countdown == null) return;
      this.countdownTimer -= dt;
      if (this.countdownTimer <= 1e-6) {
        this.countdown = null;
        this.countdownTimer = 0;
        this.startGame();
        return;
      }
      const n = Math.ceil(this.countdownTimer - 1e-6);
      if (n < this.countdown) { this.countdown = n; this._emit({ type: 'countdown', n }); }
    }

    // Immediate start (no countdown). Used by the countdown and by debug tools.
    startGame() {
      if (this.phase !== 'lobby') return false;
      let players = this._active().filter((p) => !p.isAI);
      if (!players.length) return false;
      this.countdown = null;
      this.countdownTimer = 0;
      // AI impostors are added on top of the humans / NPC crew: total 5-6 -> 1 AI, 7-9 -> 2, 10-12 -> 3.
      this._dropAI();
      this._spawnAI(AS.aiNeededFor(players.length));
      players = this._active();
      this._assignRoles(players);
      this._qaUsed = new Set();
      this._qaLog = [];
      for (const p of players) {
        p.alive = true; p.left = false; p.deathTime = null; p.killedBy = null; p.ejected = false;
        p.killCooldown = p.role === 'impostor' ? Math.min(T.FIRST_KILL_COOLDOWN, this.settings.killCooldown) : 0;
        p.emergencyLeft = this.settings.emergencyMeetings;
        p.inVent = null; p.ventTime = -99; p.scanning = false; p.scanTask = null; p.holding = null; p.vote = null;
        p.input = { x: 0, y: 0 }; p.brain = {}; p.moving = false;
      }
      this._assignTasks(players);
      this.bodies = [];
      this.sabotage = null;
      this.sabotageCooldown = T.SABOTAGE_START_COOLDOWN;
      this.doorTimers = dict();
      this.geo.setDoors([]);
      this._initDoorCooldowns();
      this.emergencyTimer = this.settings.emergencyCooldown;
      this.meeting = null;
      this.ejection = null;
      this.result = null;
      this.taskProgressShown = 0;
      this.meetingCount = 0;
      this._cause = null;
      this._seatPlayers(false);
      this._setPhase('intro', T.INTRO_TIME);
      return true;
    }

    // Humans and NPC crew are always crew; only the AI players are impostors (they know each other).
    _assignRoles(players) {
      for (const p of players) p.role = p.isAI ? 'impostor' : 'crew';
    }

    _dropAI() {
      for (const id of this.order.slice()) {
        const p = this.players[id];
        if (p && p.isAI) { delete this.players[id]; delete this.rolePrefs[id]; this.order.splice(this.order.indexOf(id), 1); }
      }
    }

    // Creates `count` AI impostor players. They look exactly like any other player (no bot flag is ever sent).
    _spawnAI(count) {
      const used = new Set(this.list().map((p) => String(p.name).toLocaleLowerCase()));
      const hats = AS.HATS.filter((h) => h !== 'none');
      for (let i = 0; i < count && this._active().length < T.MAX_PLAYERS; i++) {
        const names = AS.BOT_NAMES.filter((n) => !used.has(n.toLocaleLowerCase()));
        const name = names.length ? U.pick(this.rng, names) : 'Player ' + (this.order.length + 1);
        used.add(name.toLocaleLowerCase());
        const free = this._freeColors(null);
        if (!free.length) break;
        const hat = this.rng() < 0.2 || !hats.length ? 'none' : U.pick(this.rng, hats);
        let id; do { id = U.uid('p'); } while (this.players[id]);
        const p = this._newPlayer(id, name, U.pick(this.rng, free), hat, true);
        p.isAI = true;
        this.players[id] = p;
        this.order.push(id);
        this._placeInLobby(p);
        // no 'join' event: AIs are part of the match from the first snapshot, not "new arrivals"
      }
    }

    _initDoorCooldowns() {
      this.doorCooldowns = dict();
      for (const room of this.doorRooms) this.doorCooldowns[room] = T.SABOTAGE_START_COOLDOWN;
    }

    _setPhase(phase, timer) {
      const prev = this.phase;
      this.phase = phase;
      this.phaseTimer = timer || 0;
      this.phaseTime = 0;
      this._emit({ type: 'phase', phase, prev });
      if (AS.Bots && this._hasBots()) this._botQueue.push({ phase, prev });
    }

    _beginPlaying() {
      this.emergencyTimer = this.settings.emergencyCooldown;
      this._setPhase('playing');
      this._checkWin();
    }

    startMeeting(callerId, bodyId, emergency) {
      if (this.phase !== 'playing') return false;
      const caller = this.getPlayer(callerId);
      if (this.sabotage && isCritical(this.sabotage.kind)) this._clearSabotage();
      else this._releaseAllHolds();
      this._openAllDoors();
      for (const p of this.list()) {
        p.inVent = null;
        if (p.scanning) this._stopScan(p);
        p.holding = null;
        p.vote = null;
        p.moving = false;
        if (p.input) { p.input.x = 0; p.input.y = 0; }
      }
      this.bodies = [];
      this._seatPlayers(true);
      this.taskProgressShown = this.taskProgress();
      this.meetingCount++;
      this.meeting = {
        caller: caller ? caller.id : null,
        body: bodyId != null ? String(bodyId) : null,
        emergency: !!emergency,
        stage: 'intro',
        timer: T.MEETING_INTRO_TIME,
        tally: null,
        outcome: null,
        startTime: this.time,
      };
      if (this._qaInit) this._qaInit(this.meeting);
      this._emit({ type: 'meeting', caller: this.meeting.caller, body: this.meeting.body, emergency: this.meeting.emergency });
      this._setPhase('meeting');
      this._emit({ type: 'meetingStage', stage: 'intro' });
      return true;
    }

    _setStage(stage, time) {
      const m = this.meeting;
      m.stage = stage;
      m.timer = time;
      this._emit({ type: 'meetingStage', stage });
    }

    _tickMeeting(dt) {
      const m = this.meeting;
      if (!m) { this._setPhase('playing'); return; }
      m.timer -= dt;
      if (m.stage === 'voting' && this._allVoted()) { this._toResults(); return; }
      if (m.stage === 'discussion') { this._qaTick(dt); return; } // question & answer rounds; opens voting when done
      if (m.timer > 0) return;
      if (m.stage === 'intro') {
        if (this._qaTick && m.qa && m.qa.rounds > 0) { this._setStage('discussion', 0); this._qaTick(0); }
        else this._setStage('voting', this.settings.votingTime);
      } else if (m.stage === 'voting') this._toResults();
      else this._startEjection();
    }

    _allVoted() {
      let voters = 0;
      for (const id of this.order) {
        const p = this.players[id];
        if (!p || p.left || !p.alive) continue;
        voters++;
        if (p.vote == null) return false;
      }
      return voters > 0;
    }

    _toResults() {
      const m = this.meeting;
      if (!m || m.stage === 'results') return;
      const tally = dict();
      for (const id of this.order) {
        const p = this.players[id];
        if (!p || p.left || !p.alive || p.vote == null) continue;
        const key = p.vote;
        if (key !== 'skip') { const t = this.players[key]; if (!t || t.left || !t.alive) continue; }
        (tally[key] || (tally[key] = [])).push(p.id);
      }
      m.tally = tally;
      m.outcome = Game.tallyOutcome(tally);
      this._setStage('results', T.RESULTS_TIME);
    }

    // Most votes wins; tie for most -> nobody; skip >= top -> nobody; no votes -> nobody.
    static tallyOutcome(tally) {
      let top = 0, topIds = [], skip = 0, total = 0;
      for (const k in tally) {
        const c = tally[k].length;
        total += c;
        if (k === 'skip') { skip = c; continue; }
        if (c > top) { top = c; topIds = [k]; } else if (c === top && c > 0) topIds.push(k);
      }
      if (total === 0) return { id: null, reason: 'none' };
      if (skip >= top) return { id: null, reason: 'skip' };
      if (topIds.length > 1) return { id: null, reason: 'tie' };
      return { id: topIds[0], reason: 'vote' };
    }

    _startEjection() {
      const m = this.meeting;
      const out = (m && m.outcome) || { id: null, reason: 'none' };
      const conf = !!this.settings.confirmEjects;
      let id = out.id, reason = out.reason, role = null;
      const p = id != null ? this.players[id] : null;
      if (id != null && (!p || p.left || !p.alive)) { id = null; reason = 'none'; }
      if (p && id != null) {
        p.alive = false;
        p.deathTime = this.time;
        p.ejected = true;
        this._stopScan(p);
        this._releaseHold(p);
        p.inVent = null;
        this._cause = p.role === 'impostor' ? 'votedOut' : 'kills';
        if (conf) role = p.role;
      }
      let impostorsLeft = null;
      if (conf) { impostorsLeft = 0; for (const q of this._active()) if (q.alive && q.role === 'impostor') impostorsLeft++; }
      this.ejection = { id, role, reason, impostorsLeft };
      if (this._hook) this._hook('meetingResult', { game: this, meetingNo: this.meetingCount, tally: m && m.tally ? m.tally : {}, ejected: id, ejectedWasAI: !!(p && p.isAI) });
      for (const q of this.list()) q.vote = null;
      this.meeting = null;
      this._emit({ type: 'eject', id, role, reason, impostorsLeft });
      this._setPhase('ejecting', T.EJECT_TIME);
    }

    _finishEjection() {
      this.ejection = null;
      for (const p of this._active()) if (p.role === 'impostor') p.killCooldown = this.settings.killCooldown;
      this.sabotageCooldown = T.SABOTAGE_START_COOLDOWN;
      this._initDoorCooldowns();
      this.emergencyTimer = this.settings.emergencyCooldown;
      const w = this._evaluateWin();
      if (w) { this.endGame(w.winner, w.reason); return; }
      this._setPhase('playing');
    }

    _evaluateWin() {
      let impAlive = 0, crewAlive = 0;
      for (const id of this.order) {
        const p = this.players[id];
        if (!p || p.left || !p.alive) continue;
        if (p.role === 'impostor') impAlive++;
        else if (p.role === 'crew') crewAlive++;
      }
      const dc = this._cause === 'disconnect';
      if (impAlive === 0) return { winner: 'crew', reason: dc ? 'disconnect' : 'votedOut' };
      if (impAlive >= crewAlive) return { winner: 'impostor', reason: dc ? 'disconnect' : 'kills' };
      const pr = this._progress();
      if (this.settings.winByTasks !== false && pr.total > 0 && pr.done >= pr.total) return { winner: 'crew', reason: 'tasks' };
      return null;
    }

    // Win checks run continuously; during 'ejecting' they wait for the eject screen to finish.
    _checkWin() {
      if (this.phase !== 'playing' && this.phase !== 'meeting' && this.phase !== 'intro') return false;
      const w = this._evaluateWin();
      if (w) { this.endGame(w.winner, w.reason); return true; }
      return false;
    }

    endGame(winner, reason) {
      if (this.phase === 'lobby' || this.phase === 'ended') return false;
      winner = winner === 'impostor' ? 'impostor' : 'crew';
      if (typeof reason !== 'string' || !reason) reason = winner === 'crew' ? 'tasks' : 'kills';
      const impostors = this.order.filter((id) => this.players[id] && this.players[id].role === 'impostor');
      this.result = { winner, reason, impostors };
      this.meeting = null;
      this.ejection = null;
      if (this.sabotage) { this._releaseAllHolds(); this.sabotage = null; }
      this._openAllDoors();
      for (const p of this.list()) {
        p.inVent = null; p.scanning = false; p.scanTask = null; p.holding = null; p.vote = null; p.moving = false;
        if (p.input) { p.input.x = 0; p.input.y = 0; }
      }
      this._emit({ type: 'gameEnd', winner, reason });
      this._setPhase('ended');
      return true;
    }

    returnToLobby() {
      if (this.phase !== 'ended') return false;
      this._dropAI();
      for (const id of this.order.slice()) {
        const p = this.players[id];
        if (!p || p.left) { delete this.players[id]; delete this.rolePrefs[id]; this.order.splice(this.order.indexOf(id), 1); }
      }
      for (const p of this.list()) {
        p.role = null; p.alive = true; p.left = false; p.tasks = []; p.killCooldown = 0; p.emergencyLeft = 0;
        p.inVent = null; p.ventTime = -99; p.scanning = false; p.scanTask = null; p.holding = null; p.vote = null;
        p.input = { x: 0, y: 0 }; p.brain = {}; p.deathTime = null; p.killedBy = null; p.ejected = false; p.moving = false;
      }
      this.bodies = [];
      this.sabotage = null;
      this.sabotageCooldown = 0;
      this.doorTimers = dict();
      this.doorCooldowns = dict();
      this.geo.setDoors([]);
      this.emergencyTimer = 0;
      this.meeting = null;
      this.ejection = null;
      this.result = null;
      this.countdown = null;
      this.countdownTimer = 0;
      this.taskProgressShown = 0;
      this._cause = null;
      for (const p of this.list()) { p.x = -1e4; p.y = -1e4; }
      this._setPhase('lobby');
      for (const p of this.list()) this._placeInLobby(p);
      const h = this.getPlayer(this.hostId);
      if (!h || h.isBot || h.left) this._migrateHost();
      return true;
    }

    // ------------------------------------------------------------------ kills / sabotage / doors
    _kill(victim, killer) {
      victim.inVent = null;
      this._stopScan(victim);
      this._releaseHold(victim);
      victim.alive = false;
      victim.deathTime = this.time;
      victim.killedBy = killer ? killer.id : null;
      victim.moving = false;
      const body = { id: victim.id, x: Math.round(victim.x), y: Math.round(victim.y), color: victim.color };
      this.bodies.push(body);
      if (killer) {
        killer.inVent = null;
        this._teleport(killer, victim.x, victim.y);
        killer.killCooldown = this.settings.killCooldown;
      }
      this._cause = 'kills';
      this._emit({ type: 'kill', killer: killer ? killer.id : null, victim: victim.id, x: body.x, y: body.y });
      this._checkWin();
    }

    killPlayer(victimId, killerId) {
      if (this.phase !== 'playing') return false;
      const v = this.getPlayer(victimId);
      if (!v || !v.alive || v.left) return false;
      const k = killerId != null ? this.getPlayer(killerId) : null;
      this._kill(v, k && k !== v && k.alive && !k.left ? k : null);
      return true;
    }

    startSabotage(kind, room) {
      if (this.phase !== 'playing') return false;
      if (kind === 'doors') {
        let r = room != null ? String(room) : null;
        if (r == null) r = this.doorRooms.find((x) => !(this.doorCooldowns[x] > 0)) || this.doorRooms[0] || null;
        if (r == null || !this.doorsByRoom[r]) return false;
        this._closeDoors(r);
        return true;
      }
      if (!MAIN_SABOTAGES.has(kind) || this.sabotage) return false;
      const panels = dict();
      for (const pn of this.panelsByKind[kind] || []) panels[pn.id] = { done: false, held: false, holder: null };
      this.sabotage = {
        kind,
        timer: kind === 'reactor' ? T.REACTOR_TIME : kind === 'o2' ? T.O2_TIME : 0,
        panels,
        startTime: this.time,
      };
      this._emit({ type: 'sabotage', kind });
      return true;
    }

    fixSabotage() {
      if (!this.sabotage) return false;
      this._clearSabotage();
      return true;
    }

    _clearSabotage() {
      const s = this.sabotage;
      if (!s) return;
      this._releaseAllHolds();
      this.sabotage = null;
      this.sabotageCooldown = T.SABOTAGE_COOLDOWN;
      this._emit({ type: 'sabotageFixed', kind: s.kind });
    }

    _releaseHold(p) {
      if (!p || p.holding == null) return;
      const s = this.sabotage;
      const st = s && s.panels[p.holding];
      if (st && st.holder === p.id) { st.held = false; st.holder = null; }
      p.holding = null;
    }

    _releaseAllHolds() {
      const s = this.sabotage;
      if (s) for (const k in s.panels) { s.panels[k].held = false; s.panels[k].holder = null; }
      for (const p of this.list()) p.holding = null;
    }

    _validateHolders() {
      const s = this.sabotage;
      for (const pid in s.panels) {
        const st = s.panels[pid];
        if (!st.held) continue;
        const h = this.players[st.holder];
        const panel = this.panelById[pid];
        if (!h || h.left || !h.alive || h.inVent || h.holding !== pid || !panel ||
            dist(h.x, h.y, panel.x, panel.y) > T.USE_RANGE + 40) {
          st.held = false;
          st.holder = null;
          if (h && h.holding === pid) h.holding = null;
        }
      }
    }

    _closeDoors(room) {
      const doors = this.doorsByRoom[room];
      if (!doors) return;
      for (const d of doors) this.doorTimers[d.id] = T.DOOR_CLOSE_TIME;
      this.doorCooldowns[room] = T.DOOR_COOLDOWN;
      this.geo.setDoors(Object.keys(this.doorTimers));
      // Push out anyone standing in a closing doorway.
      for (const p of this._active()) {
        if (!p.alive || p.inVent) continue;
        let hit = false;
        for (const d of doors) if (U.circleRectOverlap(p.x, p.y, T.PLAYER_RADIUS, d.rect)) { hit = true; break; }
        if (hit && !this.geo.canStand(p.x, p.y)) {
          const pt = this._standPoint(p.x, p.y);
          this._teleport(p, pt[0], pt[1]);
        }
      }
      this._emit({ type: 'sabotage', kind: 'doors', room });
      this._emit({ type: 'doors', room, closed: true });
    }

    _openAllDoors() {
      const ids = Object.keys(this.doorTimers);
      if (!ids.length) return;
      const rooms = new Set();
      for (const id of ids) { const d = this.doorById[id]; if (d && d.room != null) rooms.add(d.room); }
      this.doorTimers = dict();
      this.geo.setDoors([]);
      for (const room of rooms) this._emit({ type: 'doors', room, closed: false });
    }

    _tickDoors(dt) {
      for (const room in this.doorCooldowns) if (this.doorCooldowns[room] > 0) this.doorCooldowns[room] = Math.max(0, this.doorCooldowns[room] - dt);
      let reopened = null;
      for (const id in this.doorTimers) {
        this.doorTimers[id] -= dt;
        if (this.doorTimers[id] <= 0) { delete this.doorTimers[id]; (reopened || (reopened = [])).push(id); }
      }
      if (!reopened) return;
      this.geo.setDoors(Object.keys(this.doorTimers));
      const rooms = new Set();
      for (const id of reopened) { const d = this.doorById[id]; if (d && d.room != null) rooms.add(d.room); }
      for (const room of rooms) {
        const still = (this.doorsByRoom[room] || []).some((d) => this.doorTimers[d.id] > 0);
        if (!still) this._emit({ type: 'doors', room, closed: false });
      }
    }

    // ------------------------------------------------------------------ actions
    applyAction(playerId, action) {
      let type = '?';
      try {
        if (!action || typeof action !== 'object' || typeof action.type !== 'string') return fail('badAction');
        type = action.type;
        const p = this.getPlayer(playerId);
        if (!p) return fail('noPlayer');
        if (p.left) return fail('left');
        const fn = ACTIONS[type];
        if (!fn) return fail('badAction');
        const res = fn.call(this, p, action) || ok();
        if (!res.ok && USER_ERRORS.has(res.err) && !p.isBot) {
          const ev = { type: 'error', to: p.id, err: res.err };
          if (res.n != null) ev.n = res.n;
          this._emit(ev);
        }
        return res;
      } catch (e) {
        this._logOnce('action:' + type, e);
        return fail('internal');
      }
    }

    _a_move(p, a) {
      if (p.isBot) return fail('bot');
      if (this.phase !== 'lobby' && this.phase !== 'playing') return fail('phase');
      if (p.inVent) return fail('inVent');
      if (Number(a.tp) !== p.tp) return fail('stale');
      let x = Number(a.x), y = Number(a.y);
      if (!isNum(x) || !isNum(y)) return fail('badAction');
      const elapsed = clamp(this.time - p.lastMove, 0, 1);
      if (dist(p.x, p.y, x, y) > this._speed(p) * elapsed * 1.6 + 40) {
        this._teleport(p, p.x, p.y);
        return fail('implausible');
      }
      if (!p.alive) {
        x = clamp(x, 0, this.geo.width);
        y = clamp(y, 0, this.geo.height);
      } else if (!this.geo.canStand(x, y, T.PLAYER_RADIUS - 2)) {
        this._teleport(p, p.x, p.y);
        return fail('blocked');
      }
      p.x = x;
      p.y = y;
      if (a.facing != null) p.facing = Number(a.facing) < 0 ? -1 : 1;
      p.moving = !!a.moving;
      p.lastMove = this.time;
      return ok();
    }

    _a_kill(p, a) {
      if (this.phase !== 'playing') return fail('phase');
      if (p.role !== 'impostor') return fail('notImpostor');
      if (!p.alive) return fail('dead');
      if (p.inVent) return fail('inVent');
      if (p.killCooldown > 0) return fail('cooldown');
      const t = this.getPlayer(a.target);
      if (!t || t === p || !t.alive || t.left || t.role === 'impostor' || t.inVent) return fail('target');
      const range = T.KILL_DIST[this.settings.killDistance] || T.KILL_DIST.normal;
      if (dist(p.x, p.y, t.x, t.y) > range) return fail('range');
      if (!this.geo.lineOfSight(p.x, p.y, t.x, t.y)) return fail('los');
      this._kill(t, p);
      return ok();
    }

    _a_report(p, a) {
      if (this.phase !== 'playing') return fail('phase');
      if (!p.alive) return fail('dead');
      if (p.inVent) return fail('inVent');
      let body = null;
      if (a.body != null) {
        const id = String(a.body);
        body = this.bodies.find((b) => b.id === id) || null;
      } else {
        let best = Infinity;
        for (const b of this.bodies) {
          const d = dist(p.x, p.y, b.x, b.y);
          if (d < best && d <= T.REPORT_RANGE && this.geo.lineOfSight(p.x, p.y, b.x, b.y)) { best = d; body = b; }
        }
      }
      if (!body) return fail('noBody');
      if (dist(p.x, p.y, body.x, body.y) > T.REPORT_RANGE + USE_SLACK) return fail('range');
      if (!this.geo.lineOfSight(p.x, p.y, body.x, body.y)) return fail('los');
      this.startMeeting(p.id, body.id, false);
      return ok();
    }

    _a_emergency(p) {
      if (this.phase !== 'playing') return fail('phase');
      if (!p.alive) return fail('dead');
      if (p.inVent) return fail('inVent');
      const btn = this.map.button;
      if (!btn || !isNum(+btn.x) || !isNum(+btn.y)) return fail('noButton');
      if (dist(p.x, p.y, +btn.x, +btn.y) > T.BUTTON_RANGE + USE_SLACK) return fail('range');
      if (!(p.emergencyLeft > 0)) return fail('noUses');
      if (this.sabotage && isCritical(this.sabotage.kind)) return fail('critical');
      if (this.emergencyTimer > 0) return fail('cooldown');
      p.emergencyLeft--;
      this.startMeeting(p.id, null, true);
      return ok();
    }

    _ventCheck(p) {
      if (this.phase !== 'playing') return fail('phase');
      if (p.role !== 'impostor') return fail('notImpostor');
      if (!p.alive) return fail('dead');
      if (this.time - p.ventTime < T.VENT_ACTION_COOLDOWN - 1e-6) return fail('cooldown');
      return null;
    }

    _a_vent(p, a) {
      const bad = this._ventCheck(p);
      if (bad) return bad;
      if (p.inVent) return fail('inVent');
      let v = null;
      if (a.vent != null) v = this.ventById[a.vent] || null;
      else {
        let best = Infinity;
        for (const id in this.ventById) {
          const c = this.ventById[id];
          const d = dist(p.x, p.y, c.x, c.y);
          if (d < best) { best = d; v = c; }
        }
      }
      if (!v) return fail('noVent');
      if (dist(p.x, p.y, v.x, v.y) > T.VENT_RANGE + USE_SLACK) return fail('range');
      this._stopScan(p);
      this._releaseHold(p);
      p.inVent = String(v.id);
      p.ventTime = this.time;
      this._teleport(p, v.x, v.y);
      this._emit({ type: 'vent', player: p.id, vent: p.inVent, action: 'enter', x: v.x, y: v.y });
      return ok();
    }

    _a_ventMove(p, a) {
      const bad = this._ventCheck(p);
      if (bad) return bad;
      if (!p.inVent) return fail('notInVent');
      const to = a.to != null ? this.ventById[a.to] : null;
      if (!to) return fail('noVent');
      const links = this.ventLinks[p.inVent] || [];
      if (links.indexOf(to.id) < 0) return fail('notLinked');
      p.inVent = String(to.id);
      p.ventTime = this.time;
      this._teleport(p, to.x, to.y);
      this._emit({ type: 'vent', player: p.id, vent: p.inVent, action: 'move', x: to.x, y: to.y });
      return ok();
    }

    _a_ventExit(p) {
      if (!p.inVent) return fail('notInVent');
      if (this.phase !== 'playing') return fail('phase');
      if (this.time - p.ventTime < T.VENT_ACTION_COOLDOWN - 1e-6) return fail('cooldown');
      const v = this.ventById[p.inVent];
      const pt = v ? this._standPoint(v.x, v.y) : this._standPoint(p.x, p.y);
      const id = p.inVent;
      p.inVent = null;
      p.ventTime = this.time;
      this._teleport(p, pt[0], pt[1]);
      this._emit({ type: 'vent', player: p.id, vent: id, action: 'exit', x: v ? v.x : pt[0], y: v ? v.y : pt[1] });
      return ok();
    }

    _a_sabotage(p, a) {
      if (this.phase !== 'playing') return fail('phase');
      if (p.role !== 'impostor') return fail('notImpostor');
      const kind = a.kind;
      if (kind === 'doors') {
        const room = a.room != null ? String(a.room) : null;
        const doors = room != null ? this.doorsByRoom[room] : null;
        if (!doors || !doors.length) return fail('noDoors');
        if (this.doorCooldowns[room] > 0) return fail('cooldown');
        this._closeDoors(room);
        return ok();
      }
      if (!MAIN_SABOTAGES.has(kind)) return fail('badAction');
      if (this.sabotage) return fail('sabotageActive');
      if (this.sabotageCooldown > 0) return fail('cooldown');
      if (!this.panelsByKind[kind] || !this.panelsByKind[kind].length) return fail('noPanel');
      this.startSabotage(kind);
      return ok();
    }

    _a_fixPanel(p, a) {
      const panel = a.panel != null ? this.panelById[a.panel] || null : null;
      if (a.holding === false) {
        // Releasing a hand scanner always succeeds (task panels send this on close, even after the fix).
        if (p.holding != null && (!panel || p.holding === String(panel.id))) this._releaseHold(p);
        return ok();
      }
      if (this.phase !== 'playing') return fail('phase');
      if (!p.alive) return fail('dead');
      if (p.inVent) return fail('inVent');
      if (!panel) return fail('noPanel');
      const s = this.sabotage;
      if (!s || s.kind !== panel.kind) return fail('noSabotage');
      if (dist(p.x, p.y, panel.x, panel.y) > T.USE_RANGE + USE_SLACK) return fail('range');
      const pid = String(panel.id);
      const st = s.panels[pid] || (s.panels[pid] = { done: false, held: false, holder: null });
      if (s.kind === 'lights' || s.kind === 'comms') {
        st.done = true;
        this._clearSabotage();
        return ok();
      }
      if (s.kind === 'o2') {
        st.done = true;
        let all = true;
        for (const k in s.panels) if (!s.panels[k].done) { all = false; break; }
        if (all) this._clearSabotage();
        return ok();
      }
      // reactor: both hand scanners must be held at the same time (by two players)
      if (st.held && st.holder !== p.id) {
        const h = this.players[st.holder];
        if (h && !h.left && h.alive && h.holding === pid) return fail('busy');
      }
      if (p.holding != null && p.holding !== pid) this._releaseHold(p);
      st.held = true;
      st.holder = p.id;
      p.holding = pid;
      let all = true;
      for (const k in s.panels) if (!s.panels[k].held) { all = false; break; }
      if (all) this._clearSabotage();
      return ok();
    }

    _a_taskStart(p, a) {
      if (this.phase !== 'playing') return fail('phase');
      if (p.role !== 'crew') return fail('notCrew');
      const task = this._task(p, a.task);
      if (!task) return fail('noTask');
      if (task.done) return fail('taskDone');
      const step = task.steps[task.step];
      if (!step || step.game !== 'scan') return fail('notScan');
      const st = step.station != null ? this.stationById[step.station] : null;
      if (st && dist(p.x, p.y, st.x, st.y) > T.USE_RANGE + 30) return fail('range');
      if (!p.alive) return ok(); // ghosts scan invisibly
      if (!p.scanning || p.scanTask !== task.id) {
        if (p.scanning) this._stopScan(p);
        p.scanning = true;
        p.scanTask = task.id;
        p.scanTime = this.time;
        if (this.settings.visualTasks) this._emit({ type: 'scan', player: p.id, active: true });
      } else p.scanTime = this.time;
      return ok();
    }

    _a_taskCancel(p, a) {
      if (p.scanning && (a.task == null || String(a.task) === p.scanTask)) this._stopScan(p);
      return ok();
    }

    _a_taskComplete(p, a) {
      if (this.phase !== 'playing') return fail('phase');
      if (p.role !== 'crew') return fail('notCrew');
      const task = this._task(p, a.task);
      if (!task || task.fake) return fail('noTask');
      if (task.done) return fail('taskDone');
      const step = task.steps[task.step];
      const st = step && step.station != null ? this.stationById[step.station] : null;
      if (st && dist(p.x, p.y, st.x, st.y) > T.USE_RANGE + USE_SLACK) return fail('range');
      task.step++;
      if (task.step >= task.steps.length) { task.step = task.steps.length; task.done = true; }
      if (p.scanning && p.scanTask === task.id) this._stopScan(p);
      this._emit({ type: 'taskStep', to: p.id, task: task.id, step: task.step, done: task.done });
      this._checkWin();
      return ok();
    }

    _a_vote(p, a) {
      if (this.phase !== 'meeting' || !this.meeting) return fail('phase');
      if (this.meeting.stage !== 'voting') return fail('stage');
      if (!p.alive) return fail('dead');
      if (p.vote != null) return fail('voted');
      let target;
      if (a.target === 'skip') target = 'skip';
      else {
        const t = this.getPlayer(a.target);
        if (!t || !t.alive || t.left) return fail('target');
        target = t.id;
      }
      p.vote = target;
      this._emit({ type: 'vote', voter: p.id });
      if (this._allVoted()) this._toResults();
      return ok();
    }

    _a_setLook(p, a) {
      if (this.phase !== 'lobby' && this.phase !== 'ended') return fail('phase');
      let err = null;
      if (a.name != null) { const n = cleanName(a.name); if (n) p.name = n; }
      if (a.hat != null) { if (validHat(a.hat)) p.hat = a.hat; }
      if (a.color != null && a.color !== p.color) {
        if (!validColor(a.color)) err = 'badColor';
        else if (this._colorTaken(a.color, p.id)) err = 'colorTaken';
        else p.color = a.color;
      }
      return err ? fail(err) : ok();
    }

    _a_settings(p, a) {
      if (p.id !== this.hostId) return fail('notHost');
      if (this.phase !== 'lobby') return fail('phase');
      const src = a.settings && typeof a.settings === 'object' ? a.settings : {};
      this.settings = AS.sanitizeSettings(Object.assign({}, this.settings, src));
      return ok();
    }

    _a_start(p) {
      if (p.id !== this.hostId) return fail('notHost');
      if (this.phase !== 'lobby') return fail('phase');
      if (this.countdown != null) return fail('busy');
      if (this._active().length < T.MIN_PLAYERS) return fail('needPlayers', { n: T.MIN_PLAYERS });
      this.startCountdown();
      return ok();
    }

    _a_addBot(p) {
      if (p.id !== this.hostId) return fail('notHost');
      if (this.phase !== 'lobby') return fail('phase');
      return this.addBot() ? ok() : fail('full');
    }

    _a_removeBot(p, a) {
      if (p.id !== this.hostId) return fail('notHost');
      if (this.phase !== 'lobby') return fail('phase');
      let b = a.id != null ? this.getPlayer(a.id) : null;
      if (a.id == null) { const bots = this.list().filter((q) => q.isBot); b = bots[bots.length - 1] || null; }
      if (!b || !b.isBot) return fail('target');
      this.removePlayer(b.id);
      return ok();
    }

    // ---- chat (meetings) ----
    _a_chat(p, a) {
      if (this.phase !== 'meeting' || !this.meeting) return fail('phase');
      if (!this.freeChatOpen()) return fail('chatClosed'); // levels 1-2 and emergency meetings: questions & answers only
      let text = cleanText(a.text);
      if (!text) return fail('badAction');
      const now = this.time;
      p.chatTimes = (p.chatTimes || []).filter((x) => now - x < 10);
      if (p.chatTimes.length >= 5 || (p.chatTimes.length && now - p.chatTimes[p.chatTimes.length - 1] < 0.7)) return fail('rate');
      p.chatTimes.push(now);
      p.typingUntil = 0;
      const m = this.meeting;
      const msg = { id: (this._chatSeq = (this._chatSeq || 0) + 1), player: p.id, text, t: r1(now), ghost: !p.alive };
      m.chat = m.chat || [];
      m.chat.push(msg);
      if (m.chat.length > 60) m.chat.splice(0, m.chat.length - 60);
      if (!msg.ghost) this._emit({ type: 'chat', player: p.id, text, t: msg.t, id: msg.id });
      else for (const q of this.list()) if (!q.alive && !q.left) this._emit({ type: 'chat', to: q.id, player: p.id, text, t: msg.t, id: msg.id, ghost: true });
      return ok();
    }

    _a_typing(p) {
      if (this.phase !== 'meeting') return fail('phase');
      const qt = this.meeting && this.meeting.qa && this.meeting.qa.turn;
      if (!this.freeChatOpen() && !(qt && qt.player === p.id)) return fail('chatClosed');
      p.typingUntil = this.time + 3;
      return ok();
    }

    setTyping(id, secs) { const p = this.getPlayer(id); if (p) p.typingUntil = this.time + (secs || 3); }

    // External AI agents (server): pathfind toward a point; bots.js does the walking.
    _a_goto(p, a) {
      if (!p.agent) return fail('notAgent');
      const x = Number(a.x), y = Number(a.y);
      if (!isNum(x) || !isNum(y)) return fail('badAction');
      p.brain = p.brain || {};
      const g0 = p.brain.goal;
      if (g0 && Math.hypot(g0.x - x, g0.y - y) < 20) return ok();
      p.brain.goal = { x, y, set: this.time };
      p.brain.path = null;
      return ok();
    }
    _a_stop(p) { if (p.brain) { p.brain.goal = null; p.brain.path = null; } if (p.input) { p.input.x = 0; p.input.y = 0; } return ok(); }

    _a_returnLobby(p) {
      if (p.id !== this.hostId) return fail('notHost');
      if (this.phase !== 'ended') return fail('phase');
      this.returnToLobby();
      return ok();
    }

    // ------------------------------------------------------------------ tick
    tick(dt) {
      dt = isNum(dt) ? clamp(dt, 0, 0.25) : T.TICK;
      try {
        this.time += dt;
        this.phaseTime += dt;
        this._flushBots();
        this._botsUpdate(dt);
        switch (this.phase) {
          case 'lobby':
            this._moveBots(dt);
            this._tickCountdown(dt);
            break;
          case 'intro':
            this.phaseTimer -= dt;
            if (this.phaseTimer <= 0) this._beginPlaying();
            break;
          case 'playing':
            this._moveBots(dt);
            this._tickPlaying(dt);
            break;
          case 'meeting':
            this._tickMeeting(dt);
            break;
          case 'ejecting':
            this.phaseTimer -= dt;
            if (this.phaseTimer <= 0) this._finishEjection();
            break;
          default:
            break;
        }
        this._flushBots();
      } catch (e) {
        this._logOnce('tick:' + this.phase, e);
      }
    }

    _tickPlaying(dt) {
      for (const id of this.order) {
        const p = this.players[id];
        if (!p || p.left) continue;
        if (p.killCooldown > 0) p.killCooldown = Math.max(0, p.killCooldown - dt);
        if (p.scanning && this.time - p.scanTime > T.SCAN_TIME + 2) this._stopScan(p);
      }
      if (this.sabotageCooldown > 0) this.sabotageCooldown = Math.max(0, this.sabotageCooldown - dt);
      if (this.emergencyTimer > 0) this.emergencyTimer = Math.max(0, this.emergencyTimer - dt);
      this._tickDoors(dt);
      const s = this.sabotage;
      if (s) {
        if (s.kind === 'reactor') this._validateHolders();
        if (isCritical(s.kind)) {
          s.timer -= dt;
          if (s.timer <= 0) {
            s.timer = 0;
            this.endGame('impostor', 'sabotage');
            return;
          }
        }
      }
      this._checkWin();
    }

    _moveBots(dt) {
      for (const id of this.order) {
        const p = this.players[id];
        if (!p || !p.isBot || p.left) continue;
        if (p.inVent) { p.moving = false; continue; }
        const inp = p.input || {};
        let ix = Number(inp.x), iy = Number(inp.y);
        if (!isFinite(ix)) ix = 0;
        if (!isFinite(iy)) iy = 0;
        const len = Math.hypot(ix, iy);
        if (len < 1e-3) { p.moving = false; continue; }
        if (len > 1) { ix /= len; iy /= len; }
        const sp = this._speed(p) * dt;
        let nx, ny;
        if (!p.alive) {
          nx = clamp(p.x + ix * sp, 0, this.geo.width);
          ny = clamp(p.y + iy * sp, 0, this.geo.height);
        } else {
          const r = this.geo.move(p.x, p.y, ix * sp, iy * sp, T.PLAYER_RADIUS);
          nx = r.x; ny = r.y;
        }
        const moved = Math.hypot(nx - p.x, ny - p.y);
        p.x = nx;
        p.y = ny;
        p.moving = moved > 0.05;
        if (Math.abs(ix) > 0.05) p.facing = ix > 0 ? 1 : -1;
        p.lastMove = this.time;
      }
    }

    timeLeft() {
      if (this.phase === 'lobby') return this.countdown != null ? Math.max(0, this.countdownTimer) : null;
      if (this.phase === 'intro' || this.phase === 'ejecting') return Math.max(0, this.phaseTimer);
      if (this.phase === 'meeting' && this.meeting) return Math.max(0, this.meeting.timer);
      return null;
    }

    // ------------------------------------------------------------------ bots
    _botsUpdate(dt) {
      const B = AS.Bots;
      if (!B || typeof B.update !== 'function') return;
      for (const id of this.order.slice()) {
        const p = this.players[id];
        if (!p || !p.isBot || p.left) continue;
        try { B.update(this, p, dt); } catch (e) { this._logOnce('Bots.update', e); }
      }
    }

    // Hooks are delivered at safe points (start/end of tick), never in the middle of an action.
    _flushBots() {
      const q = this._botQueue;
      if (!q.length) return;
      const B = AS.Bots;
      if (!B || !this._hasBots()) { q.length = 0; return; }
      let n = 0;
      while (q.length && n++ < 2000) {
        const it = q.shift();
        try {
          if (it.ev) { if (typeof B.onEvent === 'function') B.onEvent(this, it.ev); }
          else if (typeof B.onPhase === 'function') B.onPhase(this, it.phase, it.prev);
        } catch (e) { this._logOnce('Bots.hook', e); }
      }
      q.length = 0;
    }

    // ------------------------------------------------------------------ events / snapshots
    _emit(ev) {
      this.events.push(ev);
      if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
      if (AS.Bots && this._hasBots()) this._botQueue.push({ ev });
    }

    drainEvents() {
      const e = this.events;
      this.events = [];
      return e;
    }

    _logOnce(key, e) {
      if (this._logged[key]) return;
      this._logged[key] = true;
      try { console.error('[AS.Game] ' + key + ':', e && e.stack ? e.stack : e); } catch (_) { /* ignore */ }
    }

    snapshotFor(viewerId) {
      try {
        return this._snapshot(viewerId);
      } catch (e) {
        this._logOnce('snapshot', e);
        return null;
      }
    }

    _snapshot(viewerId) {
      const viewer = this.getPlayer(viewerId);
      const phase = this.phase;
      const ended = phase === 'ended';
      const vAlive = !viewer || (viewer.alive && !viewer.left);
      const vImp = !!viewer && viewer.role === 'impostor';
      const inMeeting = phase === 'meeting';
      const visual = !!this.settings.visualTasks;

      const players = [];
      for (const id of this.order) {
        const p = this.players[id];
        if (!p) continue;
        const self = p === viewer;
        const o = { id: p.id, name: p.name, color: p.color, hat: p.hat, isBot: phase === 'lobby' ? p.isBot && !p.isAI : false, isHost: p.id === this.hostId, alive: p.alive, left: p.left };
        const hide = p.left || (vAlive && !p.alive && !self) || (!!p.inVent && !self);
        if (!hide) { o.x = Math.round(p.x); o.y = Math.round(p.y); o.facing = p.facing; o.moving = !!p.moving; }
        o.tp = p.tp;
        if (self || ended || (vImp && p.role === 'impostor')) o.role = p.role;
        if (self) o.inVent = !!p.inVent;
        o.scanning = !!p.scanning && !hide && (self || visual);
        if (inMeeting) o.voted = p.vote != null;
        players.push(o);
      }

      const bodies = this.bodies.map((b) => ({ id: b.id, x: Math.round(b.x), y: Math.round(b.y), color: b.color }));

      let self = null;
      if (viewer) {
        const doorCooldowns = {};
        if (vImp) for (const room of this.doorRooms) doorCooldowns[room] = r1(Math.max(0, this.doorCooldowns[room] || 0));
        self = {
          role: viewer.role,
          alive: viewer.alive,
          visionRadius: Math.round(this.visionRadius(viewer.id)),
          killCooldown: viewer.role === 'impostor' ? r1(Math.max(0, viewer.killCooldown)) : 0,
          emergencyLeft: viewer.emergencyLeft,
          emergencyCooldown: phase === 'lobby' ? 0 : r1(Math.max(0, this.emergencyTimer)),
          sabotageCooldown: vImp ? r1(Math.max(0, this.sabotageCooldown)) : 0,
          doorCooldowns,
          inVent: viewer.inVent || null,
          holding: viewer.holding || null,
          tasks: viewer.tasks.map((t) => ({
            id: t.id, def: t.def, nameKey: t.nameKey, kind: t.kind, fake: t.fake, visual: t.visual, step: t.step, done: t.done,
            steps: t.steps.map((s) => ({ station: s.station, game: s.game, room: s.room, nameKey: s.nameKey })),
          })),
        };
      }

      let taskProgress = null;
      if (phase !== 'lobby') {
        if (ended) taskProgress = r3(this.taskProgress());
        else if (!(this.sabotage && this.sabotage.kind === 'comms')) {
          const mode = this.settings.taskBarUpdates;
          if (mode === 'always') taskProgress = r3(this.taskProgress());
          else if (mode === 'meetings') taskProgress = r3(this.taskProgressShown);
        }
      }

      let sabotage = null;
      if (this.sabotage) {
        const s = this.sabotage;
        const panels = {};
        for (const pid in s.panels) panels[pid] = { done: !!s.panels[pid].done, held: !!s.panels[pid].held };
        sabotage = { kind: s.kind, timer: isCritical(s.kind) ? r1(Math.max(0, s.timer)) : null, panels };
      }

      const doors = {};
      for (const id in this.doorTimers) doors[id] = r1(Math.max(0, this.doorTimers[id]));

      let meeting = null;
      if (inMeeting && this.meeting) {
        const m = this.meeting;
        const voted = [];
        for (const id of this.order) { const p = this.players[id]; if (p && !p.left && p.alive && p.vote != null) voted.push(p.id); }
        meeting = {
          caller: m.caller, body: m.body, emergency: m.emergency, stage: m.stage, timer: r1(Math.max(0, m.timer)),
          voted, myVote: viewer && viewer.vote != null ? viewer.vote : null, tally: null,
          chat: (m.chat || []).filter((c) => !c.ghost || !viewer || !viewer.alive).slice(-60).map((c) => ({ id: c.id, player: c.player, text: c.text, t: c.t, ghost: c.ghost || undefined })),
          freeChat: this.freeChatOpen(),
          qa: this._qaSnapshot ? this._qaSnapshot(m, viewer) : null,
          typing: this.order.filter((id) => { const q = this.players[id]; return q && q.typingUntil > this.time && (q.alive || !viewer || !viewer.alive); }),
        };
        if (m.stage === 'results' && m.tally) {
          const anon = !!this.settings.anonymousVotes;
          const t = {};
          for (const k in m.tally) t[k] = m.tally[k].map((v) => (anon ? null : v));
          meeting.tally = t;
        }
      }

      const ejection = phase === 'ejecting' && this.ejection ? {
        id: this.ejection.id, role: this.ejection.role, reason: this.ejection.reason, impostorsLeft: this.ejection.impostorsLeft,
      } : null;
      const result = this.result ? { winner: this.result.winner, reason: this.result.reason, impostors: this.result.impostors.slice() } : null;

      let timer = null;
      if (phase === 'lobby') timer = this.countdown != null ? r1(Math.max(0, this.countdownTimer)) : null;
      else if (phase === 'intro' || phase === 'ejecting') timer = r1(Math.max(0, this.phaseTimer));
      else if (phase === 'meeting' && this.meeting) timer = r1(Math.max(0, this.meeting.timer));

      return {
        v: 1,
        t: Math.round(this.time * 100) / 100,
        phase,
        mapId: this.mapId,
        hostId: this.hostId,
        you: viewer ? viewer.id : viewerId != null ? String(viewerId) : null,
        timer,
        countdown: this.countdown,
        settings: Object.assign({}, this.settings),
        players,
        bodies,
        self,
        taskProgress,
        sabotage,
        doors,
        meeting,
        ejection,
        result,
      };
    }
  }

  const ACTIONS = Object.assign(Object.create(null), {
    move: Game.prototype._a_move,
    kill: Game.prototype._a_kill,
    report: Game.prototype._a_report,
    emergency: Game.prototype._a_emergency,
    vent: Game.prototype._a_vent,
    ventMove: Game.prototype._a_ventMove,
    ventExit: Game.prototype._a_ventExit,
    sabotage: Game.prototype._a_sabotage,
    fixPanel: Game.prototype._a_fixPanel,
    taskStart: Game.prototype._a_taskStart,
    taskCancel: Game.prototype._a_taskCancel,
    taskComplete: Game.prototype._a_taskComplete,
    vote: Game.prototype._a_vote,
    setLook: Game.prototype._a_setLook,
    settings: Game.prototype._a_settings,
    start: Game.prototype._a_start,
    addBot: Game.prototype._a_addBot,
    removeBot: Game.prototype._a_removeBot,
    returnLobby: Game.prototype._a_returnLobby,
    chat: Game.prototype._a_chat,
    typing: Game.prototype._a_typing,
    answer: function (p, a) { return this._a_answer ? this._a_answer(p, a) : fail('badAction'); }, // installed by qa.js
    goto: Game.prototype._a_goto,
    stop: Game.prototype._a_stop,
  });

  Game.UNLIMITED_VISION = UNLIMITED_VISION;
  Game.ACTIONS = Object.keys(ACTIONS);
  AS.Game = Game;
})(globalThis.AS = globalThis.AS || {});
