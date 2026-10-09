/* AI IMPOSTOR: SPACE SHIP — bots + agent perception API (owner: bots). Runs in browser AND Node.
 *
 *   AS.Agent.observe(game, id, { map: true }) -> what player `id` legitimately knows right now (see docs/AGENTS.md)
 *   game.observe(id, opts)                     same (installed on AS.Game.prototype)
 *   AS.Agent.actions(game, id)                 -> { moveTo(x,y), stop(), doTask(taskId), report(bodyId), kill(target),
 *                                                   vote(target|'skip'), chat(text), emergency(), fix(panelId, holding),
 *                                                   vent(id), ventMove(id), ventExit(), sabotage(kind, room) }
 *   AS.Bots.update / onEvent / onPhase         core hooks. Built-in bots think through observe() + actions().
 * Bots chat like people in meetings: delays, "typing…", short lowercase lines with typos, answers to questions,
 * accusations / defences based on their own memory (what they actually saw).
 */
(function (AS) {
  'use strict';
  const T = AS.T, U = AS.util;
  const dist = U.dist;

  // ====================================================================== memory + perception
  function memOf(game, id) {
    const all = game._mem || (game._mem = {});
    return all[id] || (all[id] = { seen: {}, events: [], rooms: [], sus: {}, lastP: -1 });
  }
  const tl = (lang, key, p) => (AS.i18n && AS.i18n.tl ? AS.i18n.tl(lang, key, p) : key);
  const langOf = (game) => ((game.lang || (!AS.isNode && AS.i18n ? AS.i18n.getLang() : 'az')) === 'en' ? 'en' : 'az');
  const roomAt = (game, x, y) => { try { return game.geo.roomAt(x, y); } catch (e) { return null; } };

  function perceive(game, p) {
    const m = memOf(game, p.id);
    if (game.time - m.lastP < 0.2) return m;
    m.lastP = game.time;
    if (game.phase !== 'playing') return m;
    const r = roomAt(game, p.x, p.y);
    const lr = m.rooms[m.rooms.length - 1];
    if (!lr || lr.room !== r) { m.rooms.push({ room: r, t: game.time }); if (m.rooms.length > 40) m.rooms.shift(); }
    for (const id of game.order) {
      const q = game.players[id];
      if (!q || q === p || q.left || !q.alive || q.inVent) continue;
      if (!game.canSee(p.id, q.x, q.y)) continue;
      const s = m.seen[id] || (m.seen[id] = { trail: [] });
      s.x = q.x; s.y = q.y; s.t = game.time; s.room = roomAt(game, q.x, q.y);
      const lt = s.trail[s.trail.length - 1];
      if (!lt || lt.room !== s.room || game.time - lt.t > 4) { s.trail.push({ room: s.room, t: game.time }); if (s.trail.length > 30) s.trail.shift(); }
    }
    return m;
  }

  const staticCache = {};
  function staticMap(game, lang, imp) {
    const M = game.map, key = M.id + ':' + lang + ':' + (imp ? 1 : 0);
    if (staticCache[key]) return staticCache[key];
    const out = {
      id: M.id, width: M.width, height: M.height,
      ranges: { use: T.USE_RANGE, vent: T.VENT_RANGE, report: T.REPORT_RANGE, button: T.BUTTON_RANGE, kill: T.KILL_DIST },
      rooms: M.rooms.filter((r) => !r.lobby).map((r) => ({ id: r.id, name: tl(lang, 'room.' + r.id), rect: r.rect, extra: r.extra || [] })),
      halls: M.halls.map((h) => h.rect),
      stations: M.stations.map((s) => ({ id: s.id, x: s.x, y: s.y, room: s.room })),
      panels: M.panels.map((s) => ({ id: s.id, kind: s.kind, x: s.x, y: s.y, room: s.room })),
      consoles: (M.consoles || []).map((s) => ({ id: s.id, kind: s.kind, x: s.x, y: s.y, room: s.room })),
      doors: (M.doors || []).map((d) => ({ id: d.id, room: d.room, rect: d.rect })),
      button: { x: M.button.x, y: M.button.y },
      obstacles: M.props.filter((p) => p.block).map((p) => (p.r ? { x: p.x, y: p.y, r: p.r } : { x: p.x, y: p.y, w: p.w, h: p.h })),
    };
    if (imp) out.vents = M.vents.map((v) => ({ id: v.id, x: v.x, y: v.y, room: v.room, links: v.links.slice() }));
    return (staticCache[key] = out);
  }

  function observe(game, id, opts) {
    opts = opts || {};
    const p = game.getPlayer(id);
    if (!p) return null;
    const lang = opts.lang || langOf(game);
    const m = perceive(game, p);
    const imp = p.role === 'impostor';
    const stById = game.stationById || {};
    const name = (pid) => { const q = game.getPlayer(pid); return q ? q.name : null; };
    const me = {
      id: p.id, name: p.name, color: p.color, role: p.role || null, alive: p.alive, x: Math.round(p.x), y: Math.round(p.y),
      room: roomAt(game, p.x, p.y), inVent: p.inVent || null, killCooldown: imp ? +(p.killCooldown || 0).toFixed(1) : null,
      emergencyLeft: p.emergencyLeft, emergencyCooldown: +(game.emergencyTimer || 0).toFixed(1),
      sabotageCooldown: imp ? +(game.sabotageCooldown || 0).toFixed(1) : null,
      tasks: (p.tasks || []).map((t) => {
        const s = !t.done ? t.steps[t.step] : null, st = s && stById[s.station];
        return { id: t.id, name: tl(lang, t.nameKey), kind: t.kind, fake: !!t.fake, done: t.done, step: t.step, total: t.steps.length,
          next: s ? { station: s.station, game: s.game, room: s.room, x: st ? st.x : null, y: st ? st.y : null } : null };
      }),
    };
    const visiblePlayers = [], visibleBodies = [];
    if (game.phase === 'playing' || game.phase === 'lobby') {
      for (const qid of game.order) {
        const q = game.players[qid];
        if (!q || q === p || q.left || q.inVent) continue;
        if (!q.alive && p.alive) continue;
        if (!game.canSee(p.id, q.x, q.y)) continue;
        const o = { id: q.id, name: q.name, color: q.color, x: Math.round(q.x), y: Math.round(q.y), room: roomAt(game, q.x, q.y), moving: !!q.moving, alive: q.alive };
        if (q.scanning) o.scanning = true;
        if (imp && q.role === 'impostor') o.role = 'impostor';
        visiblePlayers.push(o);
      }
      for (const b of game.bodies || []) {
        if (!game.canSee(p.id, b.x, b.y)) continue;
        visibleBodies.push({ id: b.id, name: name(b.id), color: b.color, x: b.x, y: b.y, room: roomAt(game, b.x, b.y) });
      }
    }
    let meeting = null;
    if (game.phase === 'meeting' && game.meeting) {
      const mt = game.meeting;
      meeting = {
        stage: mt.stage, timer: +Math.max(0, mt.timer).toFixed(1), caller: mt.caller, body: mt.body, emergency: mt.emergency,
        voted: game.order.filter((q) => game.players[q] && game.players[q].alive && game.players[q].vote != null),
        myVote: p.vote != null ? p.vote : null,
        freeChat: game.freeChatOpen ? game.freeChatOpen() : false,
        qa: game._qaSnapshot ? game._qaSnapshot(mt, p) : null,
        chat: (mt.chat || []).filter((c) => !c.ghost || !p.alive).slice(-60).map((c) => ({ player: c.player, name: name(c.player), text: c.text, t: c.t, ghost: c.ghost || undefined })),
      };
    }
    let sabotage = null;
    if (game.sabotage) {
      const s = game.sabotage;
      sabotage = { kind: s.kind, timer: s.timer ? +s.timer.toFixed(1) : null, panels: [] };
      for (const pn of game.map.panels) if (s.panels[pn.id]) sabotage.panels.push({ id: pn.id, x: pn.x, y: pn.y, room: pn.room, done: !!s.panels[pn.id].done, held: !!s.panels[pn.id].held });
    }
    const lastSeen = {};
    for (const k in m.seen) { const s = m.seen[k]; lastSeen[k] = { x: Math.round(s.x), y: Math.round(s.y), room: s.room, ago: +(game.time - s.t).toFixed(1) }; }
    const out = {
      v: 1, t: +game.time.toFixed(2), phase: game.phase, lang, me,
      players: game.order.map((q) => game.players[q]).filter(Boolean).map((q) => ({ id: q.id, name: q.name, color: q.color, alive: q.alive && !q.left, left: !!q.left, isBot: !!q.isBot, me: q === p })),
      visiblePlayers, visibleBodies, meeting, sabotage, lastSeen,
      closedDoors: Object.keys(game.doorTimers || {}),
      events: m.events.slice(-20).map((e) => Object.assign({ ago: +(game.time - e.t).toFixed(1) }, e)),
      taskProgress: game.taskProgress ? game.taskProgress() : null,
    };
    if (opts.map !== false) out.map = staticMap(game, lang, imp);
    return out;
  }

  // ====================================================================== actions helper
  function actions(game, id) {
    const p = game.getPlayer(id);
    const A = (a) => game.applyAction(id, a);
    return {
      moveTo(x, y) { const b = p.brain || (p.brain = {}); b.goal = { x, y }; return true; },
      stop() { if (p.brain) { p.brain.goal = null; p.brain.path = null; } p.input = { x: 0, y: 0 }; },
      doTask: (task) => A({ type: 'taskComplete', task }),
      scan: (task, on) => A({ type: on ? 'taskStart' : 'taskCancel', task }),
      report: (body) => A({ type: 'report', body }),
      kill: (target) => A({ type: 'kill', target }),
      vote: (target) => A({ type: 'vote', target }),
      chat: (text) => A({ type: 'chat', text }),
      emergency: () => A({ type: 'emergency' }),
      fix: (panel, holding) => A({ type: 'fixPanel', panel, holding }),
      vent: (vent) => A({ type: 'vent', vent }),
      ventMove: (to) => A({ type: 'ventMove', to }),
      ventExit: () => A({ type: 'ventExit' }),
      sabotage: (kind, room) => A({ type: 'sabotage', kind, room }),
    };
  }

  // navigation: follows p.brain.goal with geo.findPath, sets p.input. Returns true when arrived.
  function navigate(game, p, dt) {
    const b = p.brain;
    const g = b.goal;
    if (!g || p.inVent) { p.input = { x: 0, y: 0 }; return !!g; }
    if (dist(p.x, p.y, g.x, g.y) < 12) { p.input = { x: 0, y: 0 }; b.path = null; return true; }
    if (!p.alive) { const d = dist(p.x, p.y, g.x, g.y); p.input = { x: (g.x - p.x) / d, y: (g.y - p.y) / d }; return false; }
    if (!b.path || b.pathFor !== g) {
      b.path = game.geo.findPath(p.x, p.y, g.x, g.y);
      if (!b.path) { const n = game.geo.nearestStandable(g.x, g.y); b.path = game.geo.findPath(p.x, p.y, n[0], n[1]) || [[g.x, g.y]]; }
      b.pathFor = g; b.pi = 0; b.stuckT = 0; b.lastPos = [p.x, p.y];
    }
    let wp = b.path[b.pi];
    while (wp && dist(p.x, p.y, wp[0], wp[1]) < 10) { b.pi++; wp = b.path[b.pi]; }
    if (!wp) { p.input = { x: 0, y: 0 }; return true; }
    const d = dist(p.x, p.y, wp[0], wp[1]) || 1;
    p.input = { x: (wp[0] - p.x) / d, y: (wp[1] - p.y) / d };
    b.stuckT += dt;
    if (b.stuckT > 1) {
      if (dist(p.x, p.y, b.lastPos[0], b.lastPos[1]) < 8) { b.path = null; b.pathFor = null; }
      b.stuckT = 0; b.lastPos = [p.x, p.y];
    }
    return false;
  }

  // ====================================================================== chat language
  const LOC_AZ = { messhall: 'Ekipaj salonunda', defense: 'Silah bölməsində', oxygen: 'Həyat dəstəyində', bridge: 'Naviqasiya körpüsündə', shields: 'Qalxan idarəsində',
    comms: 'Rabitə mərkəzində', cargo: 'Yük anbarında', admin: 'Komanda mərkəzində', electrical: 'Enerji otağında', greenhouse: 'Hidroponikada',
    engine_a: 'A mühərrik bölməsində', engine_b: 'B mühərrik bölməsində', reactor: 'Reaktor nüvəsində', security: 'Təhlükəsizlik göyərtəsində', medbay: 'Tibb laboratoriyasında' };
  const LINES = {
    az: {
      where: ['{loc} idim', 'mən {loc} idim', '{loc} idim, tapşırıq edirdim', '{loc} idim, heç nə görmədim', '{loc}. tapşırıq edirdim'],
      whereWith: ['{loc} idim, {name} də orda idi', '{loc} idim {name} ilə'],
      sus: ['{name} şübhəlidir', 'məncə {name}', '{name} çox qəribə gəzirdi', '{name} {loc} idi, cəsədin yanında', '{name}, sən harda idin?'],
      noIdea: ['bilmirəm', 'heç kimi görmədim', 'hələ fikrim yoxdu', 'bilmirəm, skip?', 'heç nə görmədim'],
      sawKill: ['{name} öldürdü!! gözümlə gördüm', '{name}!! {loc} öldürdü', 'SƏS VERİN {name}, gördüm onu', '{name} qatildir, gördüm'],
      sawVent: ['{name} kanala girdi, gördüm', '{name} ventdən çıxdı!!', '{name} saxtakardır, kanalda gördüm'],
      bodyAt: ['cəsəd {loc} idi', '{loc} tapdım', 'cəsəd {loc}, yolun ortasında'],
      bodyNo: ['yox, görmədim', 'cəsədi görmədim', 'mən görmədim'],
      defend: ['mən deyiləm', 'mən deyiləm ee', 'niyə mən? {loc} idim', 'mən tapşırıq edirdim', 'yalan danışır', 'mən yox, and içirəm'],
      agree: ['hə, razıyam', 'düzdür', '+', 'mən də elə fikirləşirəm', 'hə {name} şübhəlidir'],
      disagree: ['yox, {name} mənimlə idi', '{name} təmizdir', 'əmin deyiləm'],
      skip: ['skip', 'keçək', 'dəqiq bilmirik, keçək', 'skip edək'],
      voted: ['səsim {name}', '{name} deyə səs verdim', 'mən skip etdim'],
      opener: ['harda?', 'kim?', 'nə oldu?', 'kimdi?', 'kim öldü?'],
      whoCalled: ['niyə çağırdın?', 'nə oldu, niyə düymə?'],
      emergency: ['{name} şübhəlidir, onu izləyirdim', 'sadəcə yoxlamaq istədim, kim harda idi?'],
    },
    en: {
      where: ['i was in {loc}', 'in {loc}', '{loc}, doing tasks', 'was in {loc}, saw nothing', '{loc} doing my tasks'],
      whereWith: ['i was in {loc} with {name}', '{loc}, {name} was there too'],
      sus: ['{name} is sus', 'i think {name}', '{name} was acting weird', '{name} was in {loc} near the body', '{name} where were u?'],
      noIdea: ['no idea', 'didnt see anyone', 'idk', 'idk skip?', 'saw nothing'],
      sawKill: ['{name} killed!! i saw it', '{name} in {loc}!! saw the kill', 'VOTE {name} i saw them', 'its {name}, saw it'],
      sawVent: ['{name} vented, i saw', 'saw {name} come out of a vent!!', '{name} is impostor, vented'],
      bodyAt: ['body was in {loc}', 'found it in {loc}', '{loc}, right in the middle'],
      bodyNo: ['nope didnt see it', 'didnt see the body', 'no'],
      defend: ['not me', 'its not me', 'why me? i was in {loc}', 'i was doing tasks', 'hes lying', 'not me i swear'],
      agree: ['yeah agree', 'true', '+1', 'same', 'yea {name} sus'],
      disagree: ['no {name} was with me', '{name} is clear', 'not sure'],
      skip: ['skip', 'lets skip', 'not enough info, skip', 'skip it'],
      voted: ['voted {name}', 'i voted {name}', 'i skipped'],
      opener: ['where?', 'who?', 'what happened', 'who died?', 'where body'],
      whoCalled: ['why the meeting?', 'why u press the button'],
      emergency: ['{name} is sus, was following them', 'just checking, where was everyone?'],
    },
  };

  function detectLang(text, fallback) {
    const s = text.toLowerCase();
    if (/[əğışçö]|harda|kim|nə |mən|men |sən|bilmir|şübhə|cəsəd|deyil|keç|kec|idim|yox|niyə|niye|gördüm|gordum/.test(s)) return 'az';
    if (/\b(where|who|the|you|is|was|did|saw|what|why|i|me|not|no|idk)\b/.test(s)) return 'en';
    return fallback;
  }

  function humanize(rng, s, lang) {
    if (rng() < 0.6) s = s.toLowerCase();
    if (rng() < 0.4) s = s.replace(/[.!]$/, '');
    if (lang === 'az' && rng() < 0.25) s = s.replace(/ə/g, 'e').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ç/g, 'c');
    if (rng() < 0.1) {
      const w = s.split(' '), i = Math.floor(rng() * w.length), x = w[i];
      if (x && x.length > 3) { const k = 1 + Math.floor(rng() * (x.length - 2)); w[i] = x.slice(0, k) + x[k + 1] + x[k] + x.slice(k + 2); s = w.join(' '); }
    }
    if (rng() < 0.08) s += s.slice(-1);
    if (rng() < 0.06) s += lang === 'az' ? ' 😐' : ' lol';
    return s.slice(0, 120);
  }

  function locName(lang, room) {
    if (lang === 'az') return room ? LOC_AZ[room] || tl('az', 'room.' + room) : 'dəhlizdə';
    return room ? tl('en', 'room.' + room) : 'the hallway';
  }

  // ====================================================================== bot brain
  const SKILL = { easy: { react: 2.2, kill: 0.35, task: 1.6, sus: 0.6 }, normal: { react: 1.1, kill: 0.7, task: 1.1, sus: 1 }, hard: { react: 0.5, kill: 1, task: 0.8, sus: 1.3 } };
  const skillOf = (game) => SKILL[game.settings.botSkill] || SKILL.normal;
  const TASK_TIME = { wires: 5, swipe: 3, chart: 4, steer: 3, plants: 5, sample: 8, shields: 4, simon: 7, manifold: 5, asteroids: 9,
    divert: 3, divert_accept: 2, garbage: 4, scan: T.SCAN_TIME + 0.5, download: 8, upload: 8, fuel: 5, calibrate: 5, leaves: 5, align: 4 };

  function brainOf(game, p) {
    const b = p.brain || (p.brain = {});
    if (!b.init) {
      b.init = true; b.goal = null; b.path = null; b.wait = 0; b.think = game.rng() * 0.2; b.mode = 'idle';
      b.chatQ = []; b.said = 0;
    }
    return b;
  }

  function setGoal(b, x, y) {
    if (!b.goal || dist(b.goal.x, b.goal.y, x, y) > 25) { b.goal = { x, y }; b.path = null; }
  }

  function randomRoomPoint(game, notRoom) {
    const rooms = game.map.rooms.filter((r) => !r.lobby && r.id !== notRoom);
    const r = U.pick(game.rng, rooms);
    try { return game.geo.randomPointInRoom(game.rng, r.id); } catch (e) { return game.geo.nearestStandable(r.rect[0] + r.rect[2] / 2, r.rect[1] + r.rect[3] / 2); }
  }

  function update(game, p, dt) {
    const b = brainOf(game, p);
    if (p.agent) { perceive(game, p); navigate(game, p, dt); return; }
    if (game.phase === 'lobby') {
      b.wait -= dt;
      if (b.wait <= 0 && game.lobbyRoom) {
        b.wait = 3 + game.rng() * 6;
        try { const pt = game.geo.randomPointInRoom(game.rng, game.lobbyRoom.id); setGoal(b, pt[0], pt[1]); } catch (e) { /* ignore */ }
      }
      navigate(game, p, dt);
      return;
    }
    if (game.phase === 'meeting') { p.input = { x: 0, y: 0 }; meetingTick(game, p, b); return; }
    if (game.phase !== 'playing') { p.input = { x: 0, y: 0 }; return; }
    b.think -= dt;
    if (b.think <= 0) {
      b.think = 0.2;
      try { think(game, p, b, observe(game, p.id, { map: false })); } catch (e) { if (!b.err) { b.err = 1; console.error('[Bots]', e); } }
    }
    const arrived = navigate(game, p, dt);
    if (arrived) b.arrived = (b.arrived || 0) + dt; else b.arrived = 0;
  }

  function think(game, p, b, o) {
    const act = actions(game, p.id), sk = skillOf(game), rng = game.rng;
    const imp = p.role === 'impostor';
    const m = memOf(game, p.id);
    // ---- in vent (impostor): hop then exit
    if (p.inVent) {
      b.ventT = (b.ventT || 0) + 0.2;
      if (b.ventT > 0.8 + rng() * 1.5) {
        const v = game.map.vents.find((x) => x.id === p.inVent);
        if (b.hops > 0 && v) { b.hops--; act.ventMove(U.pick(rng, v.links)); b.ventT = 0; } else { act.ventExit(); b.ventT = 0; b.goal = null; }
      }
      return;
    }
    // ---- body visible
    if (p.alive && o.visibleBodies.length) {
      const body = o.visibleBodies[0];
      const selfKill = imp && b.lastKill && game.time - b.lastKill < 25;
      if (!imp || (!selfKill && rng() < 0.01)) {
        if (!b.bodySeenAt) b.bodySeenAt = game.time;
        setGoal(b, body.x, body.y);
        if (dist(p.x, p.y, body.x, body.y) < T.REPORT_RANGE - 30 && game.time - b.bodySeenAt > sk.react) { if (act.report(body.id).ok) { b.bodySeenAt = 0; return; } }
        return;
      }
    } else b.bodySeenAt = 0;
    // ---- witnessed kill -> emergency button
    if (!imp && p.alive && b.witness && p.emergencyLeft > 0 && !(game.sabotage && AS.CRITICAL_SABOTAGES.indexOf(game.sabotage.kind) >= 0)) {
      const bt = game.map.button;
      setGoal(b, bt.x, bt.y + 110);
      if (dist(p.x, p.y, bt.x, bt.y) < T.BUTTON_RANGE - 20) { const r = act.emergency(); if (r.ok || r.err === 'cooldown' || r.err === 'noMeetings') b.witness = null; }
      return;
    }
    // ---- sabotage
    if (p.alive && o.sabotage && !imp) {
      const s = o.sabotage, crit = s.kind === 'reactor' || s.kind === 'o2';
      if (b.sabKind !== s.kind) { b.sabKind = s.kind; b.sabGo = crit ? rng() < 0.85 : rng() < 0.4; b.sabDelay = game.time + 1 + rng() * 3; }
      if (b.sabGo && game.time > b.sabDelay) {
        let pn = s.panels.filter((x) => !x.done);
        if (s.kind === 'reactor') {
          const mine = pn.find((x) => x.id === b.holdPanel);
          if (!mine) { const free = pn.filter((x) => !x.held); pn = free.length ? free : pn; }
          else pn = [mine];
        }
        pn.sort((a, c) => dist(p.x, p.y, a.x, a.y) - dist(p.x, p.y, c.x, c.y));
        const t = pn[0];
        if (t) {
          setGoal(b, t.x, t.y + 30);
          if (dist(p.x, p.y, t.x, t.y) < T.USE_RANGE - 20) {
            if (s.kind === 'reactor') { if (b.holdPanel !== t.id) { act.fix(t.id, true); b.holdPanel = t.id; } }
            else { b.fixT = (b.fixT || 0) + 0.2; if (b.fixT > 2 + rng() * 2) { act.fix(t.id); b.fixT = 0; } }
          }
          return;
        }
      }
    } else { b.sabKind = null; b.holdPanel = null; }
    if (imp) return thinkImpostor(game, p, b, o, act, sk, m);
    // ---- tasks (crew, alive or ghost)
    const task = o.me.tasks.find((t) => !t.done && t.next && t.next.x != null && !t.fake);
    if (task) {
      const n = task.next;
      if (b.taskId !== task.id + ':' + task.step) { b.taskId = task.id + ':' + task.step; b.taskT = 0; b.scanOn = false; }
      setGoal(b, n.x, n.y);
      if (dist(p.x, p.y, n.x, n.y) < T.USE_RANGE - 25) {
        if (n.game === 'scan' && !b.scanOn && game.settings.visualTasks) { act.scan(task.id, true); b.scanOn = true; }
        b.taskT += 0.2;
        if (b.taskT > (TASK_TIME[n.game] || 4) * sk.task) { act.doTask(task.id); b.taskT = 0; }
      }
      return;
    }
    wander(game, p, b);
  }

  function wander(game, p, b) {
    if (!b.goal || b.arrived > 1.5 + game.rng() * 4) { const pt = randomRoomPoint(game, null); setGoal(b, pt[0], pt[1]); b.arrived = 0; }
  }

  // ---- directive executor: the director (LLM) sets b.directive = { a, until, ... }; null/expired -> built-in behaviour.
  function roomPoint(game, roomId) {
    try { return game.geo.randomPointInRoom(game.rng, roomId); } catch (e) {
      const r = game.roomById[roomId];
      return r ? game.geo.nearestStandable(r.rect[0] + r.rect[2] / 2, r.rect[1] + r.rect[3] / 2) : null;
    }
  }
  function followDirective(game, p, b, o, act, m) {
    const d = b.directive;
    if (!d) return false;
    if (game.time > d.until) { b.directive = null; return false; }
    const rng = game.rng;
    switch (d.a) {
      case 'goto': {
        if (!d.pt) d.pt = roomPoint(game, d.room);
        if (!d.pt) { b.directive = null; return false; }
        setGoal(b, d.pt[0], d.pt[1]);
        if (b.arrived > (d.stay || 2)) b.directive = null;
        return true;
      }
      case 'fake_task': {
        const t = o.me.tasks.find((x) => x.id === d.task && x.next && x.next.x != null);
        if (!t) { b.directive = null; return false; }
        setGoal(b, t.next.x, t.next.y);
        if (b.arrived > (d.stay || 3 + rng() * 4)) b.directive = null;
        return true;
      }
      case 'follow': case 'kill': {
        const q = game.getPlayer(d.who);
        if (!q || !q.alive || q.left || q.role === 'impostor') { b.directive = null; return false; }
        const seen = m.seen[q.id];
        const vis = o.visiblePlayers.find((x) => x.id === q.id);
        const tgt = vis || (seen && game.time - seen.t < 15 ? seen : null);
        if (!tgt) { b.directive = null; return false; }
        const range = T.KILL_DIST[game.settings.killDistance] || 140;
        const dd = dist(p.x, p.y, tgt.x, tgt.y);
        if (d.a === 'kill' && vis && p.killCooldown <= 0 && dd < range - 10) {
          const witnesses = o.visiblePlayers.filter((x) => x.alive && x.id !== q.id && x.role !== 'impostor').length;
          if (witnesses === 0 || d.reckless) {
            if (act.kill(q.id).ok) { b.lastKill = game.time; b.goal = null; b.mode = 'flee'; b.directive = null; const v = game.map.vents.filter((x) => dist(p.x, p.y, x.x, x.y) < 450).sort((a, c) => dist(p.x, p.y, a.x, a.y) - dist(p.x, p.y, c.x, c.y))[0]; b.fleeVent = v && rng() < 0.6 ? v.id : null; if (!b.fleeVent) { const pt = randomRoomPoint(game, roomAt(game, p.x, p.y)); setGoal(b, pt[0], pt[1]); } return true; }
          }
        }
        // follow at a polite distance, close in only to kill
        if (d.a === 'follow' && dd < 180) { b.goal = null; p.input = { x: 0, y: 0 }; } else setGoal(b, tgt.x, tgt.y);
        return true;
      }
      case 'vent': {
        const v = d.vent ? game.map.vents.find((x) => x.id === d.vent) : game.map.vents.filter((x) => x.room === d.room)[0];
        if (!v) { b.directive = null; return false; }
        setGoal(b, v.x, v.y);
        if (dist(p.x, p.y, v.x, v.y) < T.VENT_RANGE - 20 && act.vent(v.id).ok) { b.hops = 1 + Math.floor(rng() * 2); b.ventT = 0; b.directive = null; b.goal = null; }
        return true;
      }
      case 'sabotage': {
        if (game.sabotageCooldown <= 0 && !game.sabotage) act.sabotage(d.kind, d.room);
        b.directive = null;
        return false;
      }
      case 'wait': {
        b.goal = null; p.input = { x: 0, y: 0 };
        return true;
      }
      default: b.directive = null; return false;
    }
  }

  function thinkImpostor(game, p, b, o, act, sk, m) {
    const rng = game.rng;
    if (p.alive && b.directive && b.mode !== 'flee' && followDirective(game, p, b, o, act, m)) return;
    if (!p.alive) {
      if (game.sabotageCooldown <= 0 && !game.sabotage && rng() < 0.01) act.sabotage(U.pick(rng, ['lights', 'comms', 'reactor', 'o2']));
      wander(game, p, b);
      return;
    }
    const crew = o.visiblePlayers.filter((q) => q.alive && q.role !== 'impostor');
    const range = T.KILL_DIST[game.settings.killDistance] || 140;
    // kill
    // the director can hold opportunistic kills back for a while (b.holdKill = game.time until which not to strike)
    if (p.killCooldown <= 0 && crew.length && !(b.holdKill && game.time < b.holdKill)) {
      const target = crew.slice().sort((a, c) => dist(p.x, p.y, a.x, a.y) - dist(p.x, p.y, c.x, c.y))[0];
      const witnesses = crew.length - 1;
      if (witnesses === 0) {
        setGoal(b, target.x, target.y);
        if (dist(p.x, p.y, target.x, target.y) < range - 10 && rng() < sk.kill) {
          if (act.kill(target.id).ok) {
            b.lastKill = game.time; b.goal = null; b.mode = 'flee';
            const v = game.map.vents.filter((x) => dist(p.x, p.y, x.x, x.y) < 450).sort((a, c) => dist(p.x, p.y, a.x, a.y) - dist(p.x, p.y, c.x, c.y))[0];
            b.fleeVent = v && rng() < 0.6 ? v.id : null;
            if (!b.fleeVent) { const pt = randomRoomPoint(game, roomAt(game, p.x, p.y)); setGoal(b, pt[0], pt[1]); }
            return;
          }
        }
        return;
      }
    }
    // flee via vent
    if (b.mode === 'flee') {
      if (b.fleeVent) {
        const v = game.map.vents.find((x) => x.id === b.fleeVent);
        setGoal(b, v.x, v.y);
        if (dist(p.x, p.y, v.x, v.y) < T.VENT_RANGE - 20) { if (act.vent(v.id).ok) { b.hops = Math.floor(rng() * 2) + 1; b.ventT = 0; } b.fleeVent = null; b.mode = 'fake'; }
        return;
      }
      if (b.arrived > 0.5 || game.time - b.lastKill > 12) b.mode = 'fake';
      return;
    }
    // sabotage now and then
    if (game.sabotageCooldown <= 0 && !game.sabotage && rng() < 0.012 * sk.kill) {
      act.sabotage(U.pick(rng, ['lights', 'lights', 'comms', 'reactor', 'o2']));
    } else if (rng() < 0.004 && game.doorRooms && game.doorRooms.length) act.sabotage('doors', U.pick(rng, game.doorRooms));
    // hunt when nearly ready: go towards somebody last seen
    if (p.killCooldown < 4) {
      let best = null, bd = 1e9;
      for (const k in m.seen) {
        const q = game.getPlayer(k), s = m.seen[k];
        if (!q || !q.alive || q.role === 'impostor' || game.time - s.t > 12) continue;
        const d = dist(p.x, p.y, s.x, s.y);
        if (d < bd) { bd = d; best = s; }
      }
      if (best) { setGoal(b, best.x, best.y); return; }
    }
    // fake tasks: stand at task stations for a while
    if (!b.fake || (b.arrived > b.fake.stay)) {
      const ts = o.me.tasks.filter((t) => t.next && t.next.x != null);
      const t = ts.length ? U.pick(rng, ts) : null;
      if (t) { b.fake = { stay: 2 + rng() * 5 }; setGoal(b, t.next.x, t.next.y); b.arrived = 0; } else wander(game, p, b);
    }
  }

  // ====================================================================== meetings + chat
  function speak(game, p, text, delay) {
    if (!game.freeChatOpen || !(game.freeChatOpen() || game.phase === 'meeting' && game.meeting && game.meeting.stage === 'intro')) return; // free chat only exists on level 3+ after a found body
    const b = brainOf(game, p);
    if (b.said + b.chatQ.length >= 7) return;
    const lang = b.chatLang || langOf(game);
    const s = humanize(game.rng, text, lang);
    const typing = Math.min(5, 1 + s.length * 0.07);
    const last = b.chatQ.length ? b.chatQ[b.chatQ.length - 1].at : game.time;
    const at = Math.max(game.time + delay, last + typing + 0.5);
    b.chatQ.push({ at, typingAt: at - typing, text: s });
  }
  function line(game, lang, kind, params) {
    const arr = (LINES[lang] || LINES.az)[kind];
    let s = U.pick(game.rng, arr);
    if (params) s = s.replace(/\{(\w+)\}/g, (mm, k) => (params[k] != null ? params[k] : ''));
    return s;
  }

  function meetingTick(game, p, b) {
    const mt = game.meeting;
    if (!mt || !p.alive) { b.chatQ = []; return; }
    const act = actions(game, p.id);
    if (mt.stage === 'discussion' || mt.stage === 'voting') {
      while (b.chatQ.length && game.time >= b.chatQ[0].at) { const c = b.chatQ.shift(); if (act.chat(c.text).ok) b.said++; }
      if (b.chatQ.length && game.time >= b.chatQ[0].typingAt && !(p.typingUntil > game.time)) game.setTyping(p.id, b.chatQ[0].at - game.time + 0.2);
    }
    if (mt.stage === 'voting' && p.vote == null) {
      if (b.voteAt == null) b.voteAt = game.time + 2 + game.rng() * Math.min(18, Math.max(3, mt.timer * 0.5));
      if (game.time >= b.voteAt || mt.timer < 4) {
        const v = decideVote(game, p);
        if (act.vote(v).ok && game.rng() < 0.3 && mt.timer > 6) {
          const q = game.getPlayer(v);
          speak(game, p, q ? line(game, b.chatLang || langOf(game), 'voted', { name: q.name }) : (b.chatLang || langOf(game)) === 'az' ? 'mən skip etdim' : 'i skipped', 1 + game.rng() * 2);
        }
      }
    }
  }

  function aliveOthers(game, p) { return game.order.map((i) => game.players[i]).filter((q) => q && q !== p && q.alive && !q.left); }

  function topSus(game, p) {
    const m = memOf(game, p.id);
    let best = null, bs = -1e9;
    for (const q of aliveOthers(game, p)) {
      if (p.role === 'impostor' && q.role === 'impostor') continue;
      const s = m.sus[q.id] || 0;
      if (s > bs) { bs = s; best = q; }
    }
    return best ? { p: best, s: bs } : null;
  }

  function decideVote(game, p) {
    if (p.isAI) return decideVoteAI(game, p);
    const t = topSus(game, p);
    const sk = skillOf(game);
    const thr = p.role === 'impostor' ? 25 : 30 / sk.sus;
    if (t && t.s >= thr) return t.p.id;
    return 'skip';
  }

  // AI impostors: pick the human the table already distrusts (accusations, allies' votes), never an ally.
  function decideVoteAI(game, p) {
    const m = memOf(game, p.id), rng = game.rng;
    const targets = aliveOthers(game, p).filter((q) => q.role !== 'impostor');
    if (!targets.length) return 'skip';
    const allyVotes = {};
    for (const a of aliveOthers(game, p)) if (a.role === 'impostor' && a.vote != null) allyVotes[a.vote] = (allyVotes[a.vote] || 0) + 1;
    const chat = (game.meeting && game.meeting.chat) || [];
    let best = null, bs = -1e9;
    for (const q of targets) {
      let sc = (m.sus[q.id] || 0) + (allyVotes[q.id] || 0) * 35 + rng() * 12;
      const mine = (game.meeting && game.meeting.qa && game.meeting.qa.answers) || [];
      if (mine.some((a) => a.player === q.id && a.text == null)) sc += 15; // timed out = looks off
      for (const c of chat) if (c.player !== q.id && mentioned(game, c.text).indexOf(q) >= 0 && /(sus|şübh|imp|saxtakar|ai|bot)/i.test(c.text)) sc += 10;
      if (sc > bs) { bs = sc; best = q; }
    }
    if (allyVotes.skip && !Object.keys(allyVotes).some((k) => k !== 'skip')) return 'skip';
    return best && bs > 10 && rng() > 0.15 ? best.id : 'skip';
  }

  // Build suspicion from this bot's own memory when a meeting starts.
  function buildSuspicion(game, p, bodyInfo) {
    const m = memOf(game, p.id);
    const sus = (m.sus = {});
    for (const q of aliveOthers(game, p)) sus[q.id] = game.rng() * 8;
    for (const e of m.events) {
      if (e.type === 'kill' && e.killer) sus[e.killer] = (sus[e.killer] || 0) + 100;
      if (e.type === 'vent' && e.player) sus[e.player] = (sus[e.player] || 0) + 90;
    }
    if (bodyInfo && bodyInfo.room !== undefined) {
      for (const k in m.seen) {
        const tr = m.seen[k].trail || [];
        for (const pt of tr) {
          const dt = bodyInfo.t - pt.t;
          if (dt < -2 || dt > 25) continue;
          if (pt.room === bodyInfo.room) sus[k] = (sus[k] || 0) + (dt < 8 ? 35 : 20);
          else if (Math.abs(dt) < 4) sus[k] = (sus[k] || 0) - 25; // alibi
        }
      }
    }
    if (p.role === 'impostor') for (const q of aliveOthers(game, p)) if (q.role === 'impostor') sus[q.id] = -999;
  }

  function onMeeting(game, ev) {
    const mt = game.meeting;
    const body = ev.body != null ? (game._deaths || {})[ev.body] : null;
    const lang0 = langOf(game);
    for (const id of game.order) {
      const p = game.players[id];
      if (!p || !p.isBot || p.agent || !p.alive) continue;
      const b = brainOf(game, p);
      b.chatQ = []; b.said = 0; b.voteAt = null; b.goal = null; b.path = null; b.chatLang = lang0; b.answered = {};
      buildSuspicion(game, p, body);
      const m = memOf(game, p.id), rng = game.rng;
      const myRoom = lastRoomBefore(m, body ? body.t : game.time);
      const start = T.MEETING_INTRO_TIME;
      const isCaller = mt && String(mt.caller) === String(p.id);
      const L = (k, prm) => line(game, lang0, k, prm);
      const imp = p.role === 'impostor';
      if (isCaller && body) speak(game, p, L('bodyAt', { loc: locName(lang0, body.room) }), start + 1 + rng() * 2.5);
      const witnessed = m.events.filter((e) => (e.type === 'kill' || e.type === 'vent') && game.time - e.t < 120).pop();
      if (!imp && witnessed) {
        const q = game.getPlayer(witnessed.killer || witnessed.player);
        if (q && q.alive) speak(game, p, L(witnessed.type === 'kill' ? 'sawKill' : 'sawVent', { name: q.name, loc: locName(lang0, witnessed.room) }), start + 1.5 + rng() * 3);
      } else if (isCaller && !body) {
        const t = topSus(game, p);
        const E = LINES[lang0].emergency;
        speak(game, p, t && t.s > 25 ? E[0].replace('{name}', t.p.name) : E[1], start + 1 + rng() * 2);
      } else if (rng() < 0.45) {
        const r = rng();
        if (r < 0.4) speak(game, p, L('opener'), start + 1 + rng() * 4);
        else if (r < 0.75) speak(game, p, L('where', { loc: locName(lang0, imp ? fakeRoom(game, p, body) : myRoom) }), start + 2 + rng() * 6);
        else {
          const t = topSus(game, p);
          if (t && t.s > 30) speak(game, p, L('sus', { name: t.p.name, loc: locName(lang0, body ? body.room : null) }), start + 3 + rng() * 6);
        }
      }
    }
  }

  function lastRoomBefore(m, t) {
    let r = null;
    for (const x of m.rooms) { if (x.t <= t) r = x.room; }
    return r;
  }
  function fakeRoom(game, p, body) {
    const m = memOf(game, p.id);
    const r = lastRoomBefore(m, body ? body.t : game.time);
    if (body && r === body.room) { const opts = game.map.rooms.filter((x) => !x.lobby && x.id !== r); return U.pick(game.rng, opts).id; }
    return r;
  }

  function mentioned(game, text) {
    const s = ' ' + text.toLowerCase() + ' ';
    const out = [];
    for (const id of game.order) {
      const q = game.players[id];
      if (!q || q.left) continue;
      const n = q.name.toLowerCase();
      const cn = [tl('az', 'color.' + q.color), tl('en', 'color.' + q.color)].map((c) => c.toLowerCase());
      if ((n.length >= 2 && s.indexOf(n) >= 0) || cn.some((c) => c.length > 2 && new RegExp('[^a-zəğıöüşç]' + c + '[^a-zəğıöüşç]').test(s))) out.push(q);
    }
    return out;
  }

  function onChat(game, ev) {
    if (ev.ghost) return;
    const from = game.getPlayer(ev.player);
    if (!from) return;
    const text = String(ev.text || '');
    const low = text.toLowerCase();
    const lang = detectLang(text, langOf(game));
    const names = mentioned(game, text).filter((q) => q !== from);
    const qWhere = /(where|harda|harada|hardaydın|hardaydin|hardasan|hardaydiz)/.test(low);
    const qSus = /(\bsus\b|şübh|shubh|who|kim\b|kimdi|kimdir|imp|saxtakar|qatil)/.test(low);
    const qBody = /(body|cəsəd|ceset|cesed|meyit|öl[üd]|kill)/.test(low);
    const qSkip = /(skip|keç|kec)/.test(low);
    const accuse = names.length && /(sus|şübh|shubh|imp|saxtakar|qatil|vote|səs|ses|kill|öldür|oldur|vent|kanal)/.test(low);
    const vouch = names.length && /(clear|safe|with me|təmiz|temiz|mənimlə|menimle)/.test(low);
    const question = qWhere || qSus || qBody || /\?$/.test(text.trim());
    const fromHuman = !from.isBot;
    const rng = game.rng;
    const bots = aliveOthers(game, from).filter((q) => q.isBot && !q.agent);
    U.shuffle(rng, bots);
    let responders = 0;
    for (const p of bots) {
      const b = brainOf(game, p), m = memOf(game, p.id);
      b.chatLang = lang;
      const addressed = names.indexOf(p) >= 0;
      // update beliefs
      if (accuse && p.role !== 'impostor') for (const q of names) if (q !== p) m.sus[q.id] = (m.sus[q.id] || 0) + (fromHuman ? 18 : 12);
      if (accuse && addressed) m.sus[from.id] = (m.sus[from.id] || 0) + (p.role === 'impostor' ? 40 : 15);
      if (vouch) for (const q of names) m.sus[q.id] = (m.sus[q.id] || 0) - 10;
      const chance = addressed ? 0.95 : !fromHuman ? (accuse ? 0.25 : question && !qSkip ? 0.15 : 0.03) : question || accuse ? 0.5 : qSkip ? 0.3 : 0.12;
      if (responders >= (addressed ? 4 : 2) || rng() > chance) continue;
      const L = (k, prm) => line(game, lang, k, prm);
      const imp = p.role === 'impostor';
      const body = game.meeting && game.meeting.body != null ? (game._deaths || {})[game.meeting.body] : null;
      const myRoom = imp ? fakeRoom(game, p, body) : lastRoomBefore(m, body ? body.t : game.time);
      const delay = 2 + rng() * 7;
      let msg = null;
      if (accuse && addressed) msg = L('defend', { loc: locName(lang, myRoom) });
      else if (qWhere && (addressed || !names.length)) {
        const comp = Object.keys(m.seen).map((k) => game.getPlayer(k)).find((q) => q && q.alive && q !== p && m.seen[q.id].room === myRoom && body && Math.abs(m.seen[q.id].t - body.t) < 10);
        msg = comp && !imp ? L('whereWith', { loc: locName(lang, myRoom), name: comp.name }) : L('where', { loc: locName(lang, myRoom) });
      } else if (accuse) {
        const q = names[0], s = m.sus[q.id] || 0;
        if (imp && q.role === 'impostor') msg = L('disagree', { name: q.name });
        else if (s > 40 || (imp && rng() < 0.6)) msg = L('agree', { name: q.name });
        else if (s < 0) msg = L('disagree', { name: q.name });
        else if (rng() < 0.4) msg = L('noIdea');
      } else if (qBody) {
        if (game.meeting && String(game.meeting.caller) === String(p.id) && body) msg = L('bodyAt', { loc: locName(lang, body.room) });
        else msg = L('bodyNo');
      } else if (qSus) {
        const t = topSus(game, p);
        msg = t && t.s > 30 ? L('sus', { name: t.p.name, loc: locName(lang, body ? body.room : null) }) : L('noIdea');
      } else if (qSkip) msg = rng() < 0.7 ? L('skip') : L('noIdea');
      if (msg) { speak(game, p, msg, delay); responders++; }
    }
  }

  // ====================================================================== meeting Q&A (offline answers + facts for the LLM)
  const roomLabel = (lang, room) => (room ? tl(lang, 'room.' + room) : tl(lang, 'room.hallway'));

  // What this player legitimately knows, as short English facts (used as prompt context and for local answers).
  // AI impostors additionally get their hidden truth, clearly marked so the model keeps it secret.
  function qaFacts(game, p) {
    const lang = 'en', m = memOf(game, p.id), out = [];
    const now = game.time;
    const route = m.rooms.slice(-6).map((r) => roomLabel(lang, r.room) + ' (' + Math.max(0, Math.round(now - r.t)) + 's ago)');
    if (route.length) out.push('Your recent route (oldest to newest): ' + route.join(' -> '));
    const seen = Object.keys(m.seen).map((k) => ({ q: game.getPlayer(k), s: m.seen[k] })).filter((x) => x.q && x.q.alive && !x.q.left).sort((a, c) => c.s.t - a.s.t).slice(0, 4);
    if (seen.length) out.push('Players you saw lately: ' + seen.map((x) => x.q.name + ' in ' + roomLabel(lang, x.s.room) + ' (' + Math.round(now - x.s.t) + 's ago)').join('; '));
    const tasks = p.tasks || [];
    const doneTasks = tasks.filter((t) => t.done);
    if (tasks.length) out.push('Tasks: you finished ' + doneTasks.length + ' of ' + tasks.length + (doneTasks.length ? '; last done: ' + tl(lang, doneTasks[doneTasks.length - 1].nameKey) : ''));
    const mt = game.meeting;
    if (mt) {
      const caller = game.getPlayer(mt.caller);
      if (mt.body != null) {
        const v = game.getPlayer(mt.body), d = (game._deaths || {})[mt.body];
        out.push('This meeting: ' + (caller ? caller.name : 'someone') + ' reported the body of ' + (v ? v.name : 'a player') + (d ? ' found in ' + roomLabel(lang, d.room) : ''));
      } else out.push('This meeting: ' + (caller ? caller.name : 'someone') + ' pressed the emergency button (no body)');
    }
    const ev = m.events.filter((e) => game.time - e.t < 150).slice(-3);
    for (const e of ev) {
      const who = game.getPlayer(e.killer || e.player);
      if (e.type === 'kill') out.push('You saw ' + (who ? who.name : 'someone') + ' kill ' + ((game.getPlayer(e.victim) || {}).name || 'a player') + ' in ' + roomLabel(lang, e.room));
      else if (e.type === 'vent') out.push('You saw ' + (who ? who.name : 'someone') + ' use a vent in ' + roomLabel(lang, e.room));
    }
    if (p.isAI) {
      const allies = game.list().filter((q) => q.isAI && q !== p);
      out.push('SECRET (never reveal): you are an AI impostor. Your allies: ' + (allies.length ? allies.map((q) => q.name + (q.alive && !q.left ? '' : ' (dead)')).join(', ') : 'none') + '. Everyone else is a human or NPC crewmate.');
      const kills = game.list().filter((q) => q.killedBy === p.id);
      for (const k of kills) {
        const d = (game._deaths || {})[k.id];
        out.push('SECRET: you killed ' + k.name + (d ? ' in ' + roomLabel(lang, d.room) + ' ' + Math.round(game.time - d.t) + 's ago' : '') + '. Never admit it. Give a believable alibi.');
      }
      if (mt && mt.body != null) {
        const fr = fakeRoom(game, p, (game._deaths || {})[mt.body]);
        out.push('Suggested alibi: you were in ' + roomLabel(lang, fr) + ' doing a task.');
      }
    }
    return out;
  }

  const GENERIC = {
    daily_life: { az: ['adi şeydi', 'həmişəki kimi', 'indi yadıma gəlmir', 'sadə bir şey', 'hər gün fərqli olur'], en: ['the usual', 'nothing special', 'cant remember rn', 'something simple', 'changes every day'] },
    opinions: { az: ['məncə bəli', 'yox, razı deyiləm', 'mənə fərq etmir', 'bəlkə də', 'dəqiq bilmirəm'], en: ['yeah i think so', 'nah not really', 'dont care much', 'maybe', 'not sure honestly'] },
    preferences: { az: ['yəqin birincini', 'ikincini sevirəm', 'hər ikisi yaxşıdır', 'fikirləşməliyəm', 'həmişə sadə olanı'], en: ['first one probably', 'i like the second', 'both are fine', 'let me think', 'always the simple one'] },
    would_you_rather: { az: ['birincini seçərdim', 'ikincisi daha yaxşıdır', 'çətindir, birincini', 'ikincini əlbəttə'], en: ['first one', 'second one for sure', 'tough one, first i guess', 'second obviously'] },
    memories: { az: ['dəqiq xatırlamıram', 'çox kiçik idim', 'nənəmgildə idi yadımdadır', 'hə yadımdadır, gözəl idi'], en: ['dont remember exactly', 'i was really small', 'at my grandmas i think', 'yeah i remember, it was nice'] },
    light_humor: { az: ['yəqin nəsə axmaq bir şey 😄', 'bütün gün yatardım', 'heç bir istedadım yoxdur haha', 'deməyə utanıram'], en: ['probably something dumb lol', 'id just sleep all day', 'no talent at all haha', 'too weird to say'] },
  };
  const SYSTEMS = { az: ['reaktor', 'oksigen', 'elektrik', 'rabitə', 'qalxanlar'], en: ['the reactor', 'oxygen', 'electrical', 'comms', 'the shields'] };

  // Synchronous answer used offline, for NPC crew and whenever the LLM fails. Based on what the bot really saw.
  function qaLocal(game, p, ctx) {
    const lang = ctx.lang === 'en' ? 'en' : 'az', rng = game.rng, imp = p.role === 'impostor', m = memOf(game, p.id);
    const q = ctx.question, cat = q.category;
    const Lg = (k, prm) => line(game, lang, k, prm);
    const body = game.meeting && game.meeting.body != null ? (game._deaths || {})[game.meeting.body] : null;
    if (cat === 'game') {
      const room = imp ? fakeRoom(game, p, body) : lastRoomBefore(m, body ? body.t : game.time);
      const sees = Object.keys(m.seen).map((k) => ({ q: game.getPlayer(k), s: m.seen[k] }))
        .filter((x) => x.q && x.q.alive && !x.q.left && x.q !== p && (!imp || x.q.role !== 'impostor' || rng() < 0.3)).sort((a, c) => c.s.t - a.s.t);
      const who = sees.length ? sees[Math.min(sees.length - 1, rng() < 0.35 ? 1 : 0)].q.name : null;
      const tasks = p.tasks || [];
      const done = tasks.filter((t) => t.done).length;
      const sus = topSus(game, p);
      switch (q.id) {
        case 'game-where-body': case 'game-before-meeting': case 'game-most-time': case 'game-last-minute':
          return Lg('where', { loc: locName(lang, room) });
        case 'game-last-task': case 'game-task-count': {
          const n = imp ? Math.max(0, Math.min(tasks.length, done + Math.floor(rng() * 2))) : done;
          if (lang === 'az') return n ? n + ' tapşırıq etmişəm, sonuncu ' + locName('az', room).toLowerCase() + ' idi' : 'hələ heç nə etməmişəm';
          return n ? 'did ' + n + ' so far, last one was in ' + locName('en', room) : 'havent done any yet';
        }
        case 'game-last-seen': case 'game-nearest': case 'game-start-with':
          return who ? (lang === 'az' ? U.pick(rng, [who + ' idi', who, 'məncə ' + who, who + ' ilə rastlaşdım']) : U.pick(rng, ['it was ' + who, who, 'i think ' + who, 'ran into ' + who])) : Lg('noIdea');
        case 'game-who-alone':
          return who && rng() < 0.6 ? (lang === 'az' ? who + ' tək gəzirdi' : who + ' was walking alone') : Lg('noIdea');
        case 'game-strange': case 'game-vents': case 'game-followed': {
          const ev = m.events.slice(-1)[0];
          if (!imp && ev) {
            const w = game.getPlayer(ev.killer || ev.player);
            if (w) return Lg(ev.type === 'kill' ? 'sawKill' : 'sawVent', { name: w.name, loc: locName(lang, ev.room) });
          }
          return lang === 'az' ? U.pick(rng, ['yox heç nə', 'heç nə görmədim', 'qəribə heç nə yoxdu']) : U.pick(rng, ['nope nothing', 'didnt see anything weird', 'nothing strange']);
        }
        case 'game-trust': {
          const pool = aliveOthers(game, p).filter((x) => imp || x.role !== 'impostor').sort((a, c) => (m.sus[a.id] || 0) - (m.sus[c.id] || 0));
          const t = pool[0];
          return t ? (lang === 'az' ? t.name + ', yanımda idi' : t.name + ', was near me') : Lg('noIdea');
        }
        case 'game-suspicious':
          return sus && sus.s > 20 ? Lg('sus', { name: sus.p.name, loc: locName(lang, body ? body.room : null) }) : Lg('noIdea');
        case 'game-ship-system': return U.pick(rng, SYSTEMS[lang]);
        default: return Lg('where', { loc: locName(lang, room) });
      }
    }
    const g = GENERIC[cat] || GENERIC.opinions;
    return U.pick(rng, g[lang] || g.en);
  }

  // ====================================================================== hooks
  function onEvent(game, ev) {
    if (ev.type === 'kill') {
      const room = roomAt(game, ev.x, ev.y);
      (game._deaths || (game._deaths = {}))[ev.victim] = { x: ev.x, y: ev.y, room, t: game.time };
      for (const id of game.order) {
        const w = game.players[id];
        if (!w || !w.alive || w.left || id === ev.killer || id === ev.victim || !(w.isBot || w.agent)) continue;
        if (!game.canSee(w.id, ev.x, ev.y)) continue;
        memOf(game, id).events.push({ type: 'kill', killer: ev.killer, victim: ev.victim, room, t: game.time });
        if (w.isBot && w.role !== 'impostor' && game.rng() < 0.9) brainOf(game, w).witness = ev.killer;
      }
    } else if (ev.type === 'vent') {
      if (ev.action === 'move') return;
      const room = roomAt(game, ev.x, ev.y);
      for (const id of game.order) {
        const w = game.players[id];
        if (!w || !w.alive || w.left || id === ev.player || !(w.isBot || w.agent) || w.role === 'impostor') continue;
        if (!game.canSee(w.id, ev.x, ev.y)) continue;
        memOf(game, id).events.push({ type: 'vent', player: ev.player, room, t: game.time });
      }
    } else if (ev.type === 'meeting') {
      try { onMeeting(game, ev); } catch (e) { console.error('[Bots] meeting', e); }
    } else if (ev.type === 'chat') {
      try { onChat(game, ev); } catch (e) { console.error('[Bots] chat', e); }
    }
  }

  function onPhase(game, phase, prev) {
    if (phase === 'intro' || phase === 'lobby') { game._mem = {}; game._deaths = {}; }
    for (const id of game.order) {
      const p = game.players[id];
      if (!p || !p.isBot) continue;
      const b = brainOf(game, p);
      if (phase === 'playing') { b.goal = null; b.path = null; b.witness = null; b.mode = 'idle'; b.fake = null; b.directive = null; b.chatQ = []; b.holdPanel = null; b.sabKind = null; }
    }
  }

  AS.Agent = { observe, actions, perceive, navigate, staticMap, LINES };
  AS.Bots = { update, onEvent, onPhase, observe, qaFacts, qaLocal };
  if (AS.Game && AS.Game.prototype && !AS.Game.prototype.observe) {
    AS.Game.prototype.observe = function (id, opts) { return observe(this, id, opts); };
  }
})(globalThis.AS = globalThis.AS || {});
