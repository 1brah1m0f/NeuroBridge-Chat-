'use strict';
/* AI movement director (Groq). Server side only.
 *
 * Every few seconds each AI impostor is shown a compact view of what it can legitimately see plus the ship map
 * (rooms and how they connect) and answers with ONE JSON decision: go to a room, fake a task, follow a human,
 * hunt a human, use a vent, sabotage, wait. The decision is stored as `brain.directive`; js/core/bots.js turns it
 * into pathfinding, task faking, kills and vents (followDirective). When the LLM is slow, rate-limited or wrong, the
 * built-in bot behaviour simply keeps running, so an AI is never frozen and never does anything illegal.
 */

const MIN_SECS = 6, MAX_SECS = 40;
const EST_TOKENS = 800;

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

function buildAdjacency(AS, game) {
  const rooms = game.map.rooms.filter((r) => !r.lobby);
  const rects = (r) => [r.rect].concat(r.extra || []);
  const grow = (rc, d) => [rc[0] - d, rc[1] - d, rc[2] + 2 * d, rc[3] + 2 * d];
  const adj = {};
  for (const r of rooms) adj[r.id] = new Set();
  const link = (a, b) => { if (a !== b) { adj[a].add(b); adj[b].add(a); } };
  for (const h of game.map.halls || []) {
    const touching = rooms.filter((r) => rects(r).some((rc) => AS.util.rectsOverlap(grow(rc, 10), h.rect)));
    for (const a of touching) for (const b of touching) link(a.id, b.id);
  }
  for (const a of rooms) for (const b of rooms) if (rects(a).some((ra) => rects(b).some((rb) => AS.util.rectsOverlap(ra, rb)))) link(a.id, b.id);
  return adj;
}

function createDirector({ AS, groq, budget, log, debug }) {
  const roomName = (id) => AS.i18n.tl('en', 'room.' + id);

  function staticInfo(game) {
    if (game._dirStatic) return game._dirStatic;
    const adj = buildAdjacency(AS, game);
    const ids = Object.keys(adj);
    const lines = ids.map((id) => id + ' = ' + roomName(id) + ': ' + [...adj[id]].join(', '));
    const vents = game.map.vents.map((v) => v.room);
    return (game._dirStatic = { ids, lines, ventRooms: vents });
  }

  function systemPrompt(game, p) {
    const s = staticInfo(game);
    return [
      'You control ' + p.name + ', an AI impostor hiding among human crewmates on a spaceship in a social-deduction game.',
      'Behave like a believable crewmate: visit task rooms, pretend to do tasks, sometimes wander. Your goal is to eliminate humans without being seen and to avoid suspicion. Never kill with a witness. Work with your allies (other AI impostors) but do not cluster with them.',
      'Ship map (room id = name: connected rooms):',
      s.lines.join('\n'),
      'Reply with ONE JSON object only: {"a": ACTION, ...}. Actions:',
      '{"a":"goto","room":"<room id>","secs":10-25}  walk to a room and linger there',
      '{"a":"fake_task","task":"<task id from your list>"}  pretend to do that task',
      '{"a":"follow","who":"<human name>","secs":10-25}  quietly shadow a human',
      '{"a":"kill","who":"<human name>"}  hunt that human and strike only when nobody else can see (use when kill cooldown is ~0)',
      '{"a":"vent","room":"<room id with a vent>"}  sneak through a vent when unobserved',
      '{"a":"sabotage","kind":"lights|comms|reactor|o2|doors"}  only when sabotage is ready; use it to lure or split humans',
      '{"a":"wait","secs":5-10}',
      'Optional extra field "hold_kill":true stops you striking opportunistically for ~20 seconds. Vary your choices; do not repeat the same room twice in a row.',
    ].join('\n');
  }

  function userPrompt(game, p, o) {
    const s = staticInfo(game);
    const me = o.me, st = game.stationById || {};
    const L = [];
    L.push('Time ' + Math.round(game.time) + 's. You are in ' + (me.room ? roomName(me.room) + ' (' + me.room + ')' : 'a hallway') + '.');
    L.push('Kill cooldown: ' + Math.ceil(me.killCooldown || 0) + 's. Sabotage: ' + (game.sabotage ? 'one is active' : game.sabotageCooldown > 0 ? 'cooldown ' + Math.ceil(game.sabotageCooldown) + 's' : 'ready') + '.');
    const allies = game.list().filter((q) => q.isAI && q !== p);
    L.push('Allies (AI impostors): ' + (allies.length ? allies.map((q) => q.name + (q.alive && !q.left ? ' alive' : ' dead')).join(', ') : 'none') + '.');
    const humans = game.list().filter((q) => q.alive && !q.left && !q.isAI);
    L.push('Alive humans/crew: ' + humans.map((q) => q.name).join(', ') + ' (' + humans.length + ').');
    const vis = o.visiblePlayers.filter((q) => q.alive);
    L.push('Visible now: ' + (vis.length ? vis.map((q) => q.name + (q.role === 'impostor' ? ' [ally]' : '') + ' in ' + (q.room ? roomName(q.room) : 'hallway') + (q.moving ? ' moving' : '')).join('; ') : 'nobody') + '.');
    const ls = Object.keys(o.lastSeen).map((k) => ({ q: game.getPlayer(k), v: o.lastSeen[k] })).filter((x) => x.q && x.q.alive && !x.q.left && !x.q.isAI && !vis.some((v) => v.id === x.q.id)).sort((a, c) => a.v.ago - c.v.ago).slice(0, 3);
    if (ls.length) L.push('Last seen: ' + ls.map((x) => x.q.name + ' in ' + (x.v.room ? roomName(x.v.room) : 'hallway') + ' ' + Math.round(x.v.ago) + 's ago').join('; ') + '.');
    if (o.visibleBodies.length) L.push('Bodies in view: ' + o.visibleBodies.map((b) => (b.name || 'someone') + ' in ' + (b.room ? roomName(b.room) : 'hallway')).join(', ') + '.');
    const fake = o.me.tasks.filter((t) => t.next && t.next.x != null).slice(0, 5);
    L.push('Your task list for cover (id: name @ room): ' + (fake.length ? fake.map((t) => t.id + ': ' + t.name + ' @ ' + t.next.room).join('; ') : 'none') + '.');
    const b = p.brain || {};
    if (b.lastDirective) L.push('Your previous plan: ' + b.lastDirective + ' (' + Math.round(game.time - b.lastDirectiveAt) + 's ago).');
    if (b.lastKill) L.push('You last killed ' + Math.round(game.time - b.lastKill) + 's ago.');
    L.push('Room ids with vents: ' + [...new Set(s.ventRooms)].join(', ') + '.');
    L.push('Choose your next action.');
    return L.join('\n');
  }

  const norm = (x) => String(x == null ? '' : x).trim().toLowerCase();

  function resolveRoom(game, v) {
    const s = staticInfo(game), n = norm(v);
    if (!n) return null;
    if (s.ids.indexOf(n) >= 0) return n;
    return s.ids.find((id) => norm(roomName(id)) === n) || null;
  }
  function resolveHuman(game, p, v) {
    const n = norm(v);
    return game.list().find((q) => q.alive && !q.left && !q.isAI && q !== p && norm(q.name) === n) || null;
  }

  // Validate the model's decision against the real game state and turn it into a brain directive (or null).
  function toDirective(game, p, raw) {
    let d;
    try { d = JSON.parse(raw); } catch (e) {
      const m = /\{[\s\S]*\}/.exec(raw);
      if (!m) return null;
      try { d = JSON.parse(m[0]); } catch (e2) { return null; }
    }
    if (!d || typeof d !== 'object') return null;
    const secs = clamp(Number(d.secs) || 15, MIN_SECS, MAX_SECS);
    const until = game.time + secs;
    switch (d.a) {
      case 'goto': { const room = resolveRoom(game, d.room); return room ? { a: 'goto', room, until, stay: 2 + Math.random() * 4 } : null; }
      case 'fake_task': {
        const t = (p.tasks || []).find((x) => String(x.id) === String(d.task) && !x.done);
        return t ? { a: 'fake_task', task: t.id, until: game.time + 30, stay: 3 + Math.random() * 5 } : null;
      }
      case 'follow': { const q = resolveHuman(game, p, d.who); return q ? { a: 'follow', who: q.id, until } : null; }
      case 'kill': { const q = resolveHuman(game, p, d.who); return q ? { a: 'kill', who: q.id, until: game.time + 30 } : null; }
      case 'vent': { const room = resolveRoom(game, d.room); return room ? { a: 'vent', room, until: game.time + 20 } : null; }
      case 'sabotage': return ['lights', 'comms', 'reactor', 'o2', 'doors'].indexOf(d.kind) >= 0 ? { a: 'sabotage', kind: d.kind, until: game.time + 5 } : null;
      case 'wait': return { a: 'wait', until: game.time + clamp(Number(d.secs) || 6, 3, 12) };
      default: return null;
    }
  }

  async function ask(game, p, st) {
    st.busy = true;
    const hit = budget.spend(EST_TOKENS);
    try {
      const A = AS.Agent;
      const o = A.observe(game, p.id, { map: false, lang: 'en' });
      const t0 = Date.now();
      const res = await groq(systemPrompt(game, p), userPrompt(game, p, o), { temperature: 0.8, maxTokens: 420, timeoutMs: 9000 });
      hit.tokens = res.tokens || EST_TOKENS;
      if (game.phase !== 'playing' || !p.alive || p.left) return;
      const d = toDirective(game, p, res.text);
      const b = p.brain || (p.brain = {});
      if (!d) { st.fails++; if (debug) log('[director] ' + p.name + ' bad output: ' + res.text.slice(0, 120)); return; }
      st.fails = 0;
      b.directive = d;
      b.goal = null; b.path = null; b.arrived = 0; b.fake = null;
      b.lastDirective = d.a + (d.room ? ' ' + d.room : '') + (d.task ? ' ' + d.task : '') + (d.who ? ' ' + ((game.getPlayer(d.who) || {}).name) : '');
      b.lastDirectiveAt = game.time;
      try { const j = JSON.parse(/\{[\s\S]*\}/.exec(res.text)[0]); if (j.hold_kill) b.holdKill = game.time + 20; } catch (e) { /* optional */ }
      if (debug) log('[director] ' + p.name + ' -> ' + b.lastDirective + ' (' + (Date.now() - t0) + 'ms, ' + hit.tokens + ' tok)');
    } catch (e) {
      st.fails++;
      if (e && e.status === 429) st.pause = game.time + 20; // provider says slow down
      if (debug || st.fails === 1) log('[director] ' + p.name + ' error: ' + (e && e.message));
    } finally {
      st.busy = false;
      st.next = game.time + 8 + Math.random() * 6 + Math.min(40, st.fails * 8);
    }
  }

  return {
    tick(game) {
      if (game.phase !== 'playing') return;
      for (const id of game.order) {
        const p = game.players[id];
        if (!p || !p.isAI || !p.alive || p.left || p.inVent) continue;
        const b = p.brain || (p.brain = {});
        const st = b.llm || (b.llm = { next: game.time + 1 + Math.random() * 4, busy: false, fails: 0, pause: 0 });
        if (st.busy || game.time < st.next || game.time < st.pause) continue;
        if (b.mode === 'flee') continue;
        if (b.directive && game.time < b.directive.until - 3) continue;
        if (!budget.canSpend(EST_TOKENS)) { st.next = game.time + 3; continue; }
        void ask(game, p, st);
      }
    },
    _test: { toDirective, buildAdjacency, staticInfo },
  };
}

module.exports = { createDirector };
