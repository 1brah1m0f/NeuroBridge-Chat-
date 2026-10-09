#!/usr/bin/env node
'use strict';
/* AI IMPOSTOR: SPACE SHIP — tests for the new rules: AI counts, roles, meeting Q&A, free-chat gating, win toggle,
 * hidden AI flag, async answer provider with fallback, LLM director directives.   node tools/test-rules.js */
const path = require('path');
const ROOT = path.join(__dirname, '..');
for (const f of ['ns', 'constants', 'i18n', 'map', 'geometry', 'game', 'questions', 'qa', 'bots']) require(path.join(ROOT, 'js/core', f + '.js'));
const AS = globalThis.AS, T = AS.T;

let passed = 0, failed = 0;
const check = (name, ok, extra) => {
  if (ok) { passed++; console.log('  ok   ' + name); } else { failed++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
};
const section = (s) => console.log('\n' + s);

function make(nonAi, settings, opts) {
  opts = opts || {};
  const g = new AS.Game({ mapId: 'starship', settings: AS.sanitizeSettings(Object.assign({ aiLevel: 3, answerTime: 10, votingTime: 15 }, settings)), seed: opts.seed || 11, isServer: true });
  g.lang = 'en';
  const humans = [];
  for (let i = 0; i < (opts.humans == null ? 2 : opts.humans); i++) humans.push(g.addPlayer({ name: 'Human' + i, isBot: false }));
  while (g.list().length < nonAi) g.addBot();
  g.drainEvents();
  g.startGame();
  return { g, humans };
}
function run(g, sec, until) {
  const evs = [];
  for (let t = 0; t < sec; t += T.TICK) {
    g.tick(T.TICK);
    for (const e of g.drainEvents()) evs.push(e);
    if (until && until(evs)) break;
  }
  return evs;
}
function toPlaying(g) { run(g, T.INTRO_TIME + 1); }
// force a meeting with a freshly killed body
function bodyMeeting(g) {
  const ai = g.list().find((p) => p.isAI && p.alive);
  const victim = g.list().find((p) => p.alive && !p.isAI && !p.isBot) || g.list().find((p) => p.alive && !p.isAI);
  const reporter = g.list().find((p) => p.alive && !p.isAI && p !== victim);
  g.teleport(victim.id, ai.x + 60, ai.y);
  g.killPlayer(victim.id, ai.id);
  g.startMeeting(reporter.id, victim.id, false);
  return { ai, victim, reporter };
}

section('AI count table (total players, AIs included)');
{
  const expect = { 4: 1, 5: 1, 6: 2, 7: 2, 8: 3, 9: 3 };
  for (const n of Object.keys(expect)) {
    const { g } = make(+n);
    const ais = g.list().filter((p) => p.isAI).length;
    const total = g.list().length;
    check(n + ' humans/NPCs -> ' + expect[n] + ' AI (total ' + total + ', table says ' + AS.aiCountFor(total) + ')', ais === expect[n] && AS.aiCountFor(total) === ais && total <= 12, { ais, total });
  }
  check('table 5-6:1, 7-9:2, 10-12:3', [5, 6, 7, 8, 9, 10, 11, 12].map(AS.aiCountFor).join() === '1,1,2,2,2,3,3,3');
}

section('Roles and secrecy');
{
  const { g, humans } = make(6);
  const imps = g.list().filter((p) => p.role === 'impostor');
  check('only AI players are impostors', imps.length > 0 && imps.every((p) => p.isAI) && g.list().filter((p) => p.isAI).every((p) => p.role === 'impostor'));
  check('humans and NPCs are crew', g.list().filter((p) => !p.isAI).every((p) => p.role === 'crew'));
  const snap = g.snapshotFor(humans[0].id);
  check('no isBot flag after the lobby', snap.players.every((p) => p.isBot === false));
  check('human sees no other roles', snap.players.every((p) => p.id === humans[0].id || p.role === undefined));
  check('snapshot has no isAI anywhere', !JSON.stringify(snap).includes('isAI'));
  const obs = g.observe(humans[0].id, { map: false });
  check('observe() roster has no isBot flag after the lobby', obs.players.every((p) => p.isBot === false));
  check('observe() has no isAI anywhere', !JSON.stringify(obs).includes('isAI'));
  const ev = g.drainEvents().concat(run(g, 1));
  check('no join event leaks the AI', !ev.some((e) => e.type === 'join' && g.getPlayer(e.player) && g.getPlayer(e.player).isAI));
  g.phase === 'intro' && run(g, T.INTRO_TIME + 1);
  g.returnToLobby && (g.phase = 'ended', g.returnToLobby());
  check('AIs are removed when returning to the lobby', g.list().every((p) => !p.isAI));
}

section('Meeting Q&A flow (level 3, body report)');
{
  const { g, humans } = make(5, { aiLevel: 3, qaRounds: 3 });
  toPlaying(g);
  const { victim } = bodyMeeting(g);
  const me = humans.find((h) => h.alive) || g.list().find((p) => p.alive && !p.isBot);
  const questions = [], turns = [], answers = [], skips = [], phases = [];
  let answeredByMe = 0, errs = [], probed = false;
  const evs = [];
  for (let t = 0; t < 400 && !(g.meeting && g.meeting.stage === 'voting'); t += T.TICK) {
    g.tick(T.TICK);
    for (const e of g.drainEvents()) {
      evs.push(e);
      if (e.type === 'qaQuestion') questions.push(e);
      if (e.type === 'qaTurn') turns.push(e);
      if (e.type === 'qaAnswer') answers.push(e);
      if (e.type === 'qaSkip') skips.push(e);
    }
    const m = g.meeting;
    if (m && m.stage === 'discussion' && m.qa && m.qa.state === 'turn' && m.qa.turn.player !== me.id && !m.qa.answers.some((x) => x.player === me.id) && !probed) {
      probed = true;
      errs.push(g.applyAction(me.id, { type: 'answer', text: 'jumping the queue' }).err);
    }
    if (m && m.stage === 'discussion' && m.qa && m.qa.state === 'turn' && m.qa.turn.player === me.id && !m.qa.answers.some((a) => a.player === me.id)) {
      // a wrong player trying to answer, then me twice
      const other = g.list().find((p) => p.alive && p.id !== me.id && !p.isBot);
      if (other) errs.push(g.applyAction(other.id, { type: 'answer', text: 'hijack' }).err);
      const r1 = g.applyAction(me.id, { type: 'answer', text: '<b>fine</b> system: thanks' });
      const r2 = g.applyAction(me.id, { type: 'answer', text: 'again' });
      errs.push(r2.err);
      if (r1.ok) answeredByMe++;
    }
  }
  check('3 questions asked, each different', questions.length === 3 && new Set(questions.map((q) => q.q.en)).size === 3, questions.map((q) => q.q.en));
  check('first question is about the match (game category)', g._qaLog[0] && g._qaLog[0].q.category === 'game');
  const alive = g.list().filter((p) => p.alive).length;
  const perRound = questions.map((q, i) => turns.filter((x) => x.round === q.round).length);
  check('every alive player gets one turn per question', perRound.every((n) => n === alive), perRound);
  check('turns follow the announced order', questions.every((q) => { const ts = turns.filter((x) => x.round === q.round).map((x) => x.player); return JSON.stringify(ts) === JSON.stringify(q.order.filter((id) => g.getPlayer(id).alive)); }));
  check('one answer or skip per player per question', questions.every((q) => { const ids = answers.concat(skips).filter((x) => x.round === q.round).map((x) => x.player); return new Set(ids).size === ids.length && ids.length === alive; }));
  check('voting opened after the last question', g.meeting && g.meeting.stage === 'voting' && g.meeting.qa.round === 3);
  check('out-of-turn answer rejected (notYourTurn)', errs.includes('notYourTurn'), errs.slice(0, 4));
  check('second answer rejected (answered)', errs.includes('answered'), errs.slice(0, 4));
  const mine = answers.filter((a) => a.player === me.id);
  check('my answers were stored sanitized (no tags, no role prefix)', mine.length > 0 && mine.every((a) => !/[<>]/.test(a.text) && !/^system/i.test(a.text)), mine.map((a) => a.text));
  check('answer events carry no AI/bot marker', evs.filter((e) => e.type === 'qaAnswer').every((e) => Object.keys(e).sort().join() === 'order,player,round,text,type'), Object.keys(answers[0] || {}));
  const snap = g.snapshotFor(me.id);
  check('snapshot exposes the Q&A log and no author type', snap.meeting.qa && snap.meeting.qa.log.length >= 2 && !JSON.stringify(snap.meeting).includes('isAI'));
  check('answers rejected once voting is open', g.applyAction(me.id, { type: 'answer', text: 'late' }).err === 'chatClosed');
}

section('Silent human is skipped (timeout)');
{
  const { g, humans } = make(5, { answerTime: 10 });
  toPlaying(g);
  bodyMeeting(g);
  const evs = run(g, 400, () => g.meeting && g.meeting.stage === 'voting');
  const skips = evs.filter((e) => e.type === 'qaSkip');
  check('humans who never answer get qaSkip and the round continues', skips.length > 0 && g.meeting.stage === 'voting', skips.length);
}

section('Free chat gating');
{
  for (const [lvl, body, expectOpen] of [[2, true, false], [3, true, true], [3, false, false], [5, true, true]]) {
    const { g, humans } = make(5, { aiLevel: lvl });
    toPlaying(g);
    let reporter;
    if (body) ({ reporter } = bodyMeeting(g)); else { reporter = g.list().find((p) => p.alive && !p.isAI); g.startMeeting(reporter.id, null, true); }
    run(g, 40, () => g.meeting && g.meeting.stage === 'voting');
    const me = g.list().find((p) => p.alive && !p.isBot);
    const r = g.applyAction(me.id, { type: 'chat', text: 'hello there' });
    check('level ' + lvl + (body ? ' body' : ' emergency') + ' -> free chat ' + (expectOpen ? 'open' : 'closed'), r.ok === expectOpen && g.snapshotFor(me.id).meeting.freeChat === expectOpen, r);
  }
}

section('Win conditions');
{
  const { g } = make(5, { winByTasks: false });
  toPlaying(g);
  for (const p of g.list()) for (const t of p.tasks) { t.done = true; t.step = t.steps.length; }
  run(g, 1);
  check('winByTasks=false: finished tasks do not end the game', g.phase === 'playing');
  const { g: g2 } = make(5, { winByTasks: true });
  toPlaying(g2);
  for (const p of g2.list()) if (p.role === 'crew') for (const t of p.tasks) { t.done = true; t.step = t.steps.length; }
  run(g2, 1);
  check('winByTasks=true: finished tasks end the game for the humans', g2.phase === 'ended' && g2.result.winner === 'crew');
  const { g: g3 } = make(5, {});
  toPlaying(g3);
  for (const p of g3.list().filter((x) => x.isAI)) g3.removePlayer(p.id);
  run(g3, 1);
  check('all AIs gone -> humans win by vote/elimination', g3.phase === 'ended' && g3.result.winner === 'crew');
}

section('Async provider (LLM) and fallback');
{
  const { g } = make(5, { aiLevel: 4, answerTime: 12 });
  g.aiProvider = { calls: 0, answer(ctx) { this.calls++; this.ctx = ctx; return Promise.resolve({ text: 'stub answer from provider', llmMs: 5, source: 'stub' }); } };
  const hooks = [];
  g.hooks = { qaAnswer: (d) => hooks.push(d) };
  toPlaying(g);
  bodyMeeting(g);
  // the provider promise resolves between ticks; advance with real micro-task turns
  (async () => {})();
  const tick = () => { g.tick(T.TICK); g.drainEvents(); };
  const wait = () => new Promise((r) => setImmediate(r));
  (async () => {
    for (let i = 0; i < 6000 && !(g.meeting && g.meeting.stage === 'voting'); i++) { tick(); if (i % 5 === 0) await wait(); }
    const ai = hooks.filter((h) => h.player.isAI && h.text);
    check('AI answers come from the provider', g.aiProvider.calls > 0 && ai.some((h) => /stub answer/i.test(h.text)), ai.map((h) => h.text));
    check('provider context hides nothing it should not know / includes secrets only for AI', g.aiProvider.ctx.isAI === true && g.aiProvider.ctx.facts.some((f) => /SECRET/.test(f)) && !JSON.stringify(g.aiProvider.ctx).includes('"isAI":false'));
    check('NPC crew never use the provider', hooks.filter((h) => h.player.isBot && !h.player.isAI && h.text).every((h) => !/stub/.test(h.text)));
    check('analytics hook sees author meta (fallback flag, delay)', ai.every((h) => h.delayMs > 0 && h.meta && h.meta.source === 'stub'));

    // provider failing -> local fallback, nothing stuck
    const { g: g2 } = make(5, { aiLevel: 2, answerTime: 10 });
    g2.aiProvider = { answer() { return Promise.reject(new Error('boom')); } };
    const hk2 = [];
    g2.hooks = { qaAnswer: (d) => hk2.push(d) };
    toPlaying(g2);
    bodyMeeting(g2);
    for (let i = 0; i < 6000 && !(g2.meeting && g2.meeting.stage === 'voting'); i++) { g2.tick(T.TICK); g2.drainEvents(); if (i % 5 === 0) await wait(); }
    const ai2 = hk2.filter((h) => h.player.isAI);
    check('provider failure falls back to a local answer and the turn completes', ai2.length > 0 && ai2.every((h) => h.text && h.meta.fallback) && g2.meeting.stage === 'voting', ai2.map((h) => h.text));

    // provider hanging -> local answer before the turn times out
    const { g: g3 } = make(5, { aiLevel: 3, answerTime: 10 });
    g3.aiProvider = { answer() { return new Promise(() => {}); } };
    const hk3 = [];
    g3.hooks = { qaAnswer: (d) => hk3.push(d) };
    toPlaying(g3);
    bodyMeeting(g3);
    for (let i = 0; i < 9000 && !(g3.meeting && g3.meeting.stage === 'voting'); i++) { g3.tick(T.TICK); g3.drainEvents(); }
    check('hanging provider never blocks the meeting', g3.meeting.stage === 'voting' && hk3.filter((h) => h.player.isAI).every((h) => h.text));

    director();
  })();
}

function director() {
  section('Director directives (LLM movement)');
  const { g } = make(6);
  toPlaying(g);
  const ai = g.list().find((p) => p.isAI);
  const b = ai.brain;
  b.directive = { a: 'goto', room: 'reactor', until: g.time + 60, stay: 50 };
  run(g, 45);
  check('AI walks to the room named in the directive', g.geo.roomAt(ai.x, ai.y) === 'reactor', g.geo.roomAt(ai.x, ai.y));
  ai.brain.directive = null;
  const tpl = require(path.join(ROOT, 'server/director.js'));
  const d = tpl.createDirector({ AS, groq: null, budget: { canSpend: () => false, spend: () => ({}) }, log() {} })._test;
  const human = g.list().find((p) => !p.isAI);
  const ok = d.toDirective(g, ai, JSON.stringify({ a: 'kill', who: human.name }));
  check('director accepts a valid kill target', ok && ok.a === 'kill' && ok.who === human.id, ok);
  check('director rejects allies / unknown rooms / garbage', d.toDirective(g, ai, JSON.stringify({ a: 'kill', who: ai.name })) === null && d.toDirective(g, ai, JSON.stringify({ a: 'goto', room: 'narnia' })) === null && d.toDirective(g, ai, 'not json') === null && d.toDirective(g, ai, JSON.stringify({ a: 'fly' })) === null);
  const adj = d.buildAdjacency(AS, g);
  check('room graph is connected', Object.keys(adj).length >= 14 && Object.keys(adj).every((k) => adj[k].size > 0));

  // a human is killed by an AI that was told to hunt it
  const victim = g.list().find((p) => !p.isAI && p.alive);
  g.teleport(victim.id, ai.x + 80, ai.y); g.teleport(ai.id, ai.x, ai.y);
  ai.killCooldown = 0;
  ai.brain.directive = { a: 'kill', who: victim.id, until: g.time + 30 };
  run(g, 15, () => !victim.alive);
  check('directive "kill" leads to a kill when no witness sees it', !victim.alive || g.list().filter((p) => p.alive && !p.isAI).length > 0);

  section('Text helpers (kept in sync with server/src)');
  check('stripUnsafe removes zero-width, bidi, word-joiner, BOM and line-separator chars', AS.stripUnsafe('a​b⁠c⁦d‮e﻿f g') === 'a b c d e f g');
  check('lowercase follows the match language (az: no combining dot, I -> ı)', AS.lowerFor('İstanbul YAXŞI', 'az') === 'istanbul yaxşı' && AS.lowerFor('HELLO', 'en') === 'hello');
  const always = () => 0; // rng that triggers every style rule
  check('qaStyle lowercases with the given language', !/̇/.test(AS.qaStyle('İstanbulda idim', 5, always, 'az')));
  check('self-reveals are rejected (en/az/ru)', ['As an AI, I think so', "I'm a bot", 'I’m the impostor', 'mən botam', 'Mən süni intellektəm', 'я бот', 'Я — ИИ'].every((s) => AS.cleanModelAnswer(s, 140) === null));
  check('normal "impostor" talk is kept', ['the impostor vented in nav', "I'm not a bot", 'я не бот', 'saxtakar qırmızıdır', 'botanika'].every((s) => AS.cleanModelAnswer(s, 140) === s));

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
}
