// node tools/live-test.js [seconds=60] [level=4] [speed=3]
// Runs a headless match against the REAL LLMs (needs itb/.env): the Groq director moves the AI impostors, and after
// the movement phase a body is reported so the Gemini-powered Q&A meeting runs. Prints what the AIs decided and said.
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
require(path.join(ROOT, 'server/env.js')).load(path.join(ROOT, '.env'));
process.env.DIRECTOR_DEBUG = '1';
const AS = (globalThis.AS = {});
for (const f of ['ns', 'constants', 'i18n', 'map', 'geometry', 'game', 'questions', 'qa', 'bots']) require(path.join(ROOT, 'js/core', f + '.js'));
const svc = require(path.join(ROOT, 'server/services.js')).createServices(AS, ROOT, (m) => console.log(m));

const SECS = +process.argv[2] || 60, LEVEL = +process.argv[3] || 4, SPEED = +process.argv[4] || 3;
const game = new AS.Game({ mapId: 'starship', settings: AS.sanitizeSettings({ aiLevel: LEVEL, answerTime: 20, votingTime: 20, qaRounds: 3 }), seed: 4242, isServer: true });
game.lang = 'en';
game.aiProvider = svc.answerProvider;
svc.analytics.attach(game, 'TEST');
for (let i = 0; i < 6; i++) game.addBot();
game.startGame();
console.log('players:', game.list().map((p) => p.name + (p.isAI ? '*' : '')).join(', '), '(* = AI, hidden from clients)');
const dir = svc.director || { tick() {} };

let sim = 0, phase = 'move', meetingAt = null;
const t0 = Date.now();
const timer = setInterval(() => {
  for (let k = 0; k < SPEED; k++) {
    dir.tick(game);
    game.tick(AS.T.TICK);
    sim += AS.T.TICK;
    for (const e of game.drainEvents()) {
      const nm = (id) => (game.getPlayer(id) || {}).name;
      if (e.type === 'kill') console.log('[' + sim.toFixed(0) + 's] KILL', nm(e.killer), '->', nm(e.victim));
      if (e.type === 'qaQuestion') console.log('\n?? Q' + e.round + '/' + e.rounds + ': ' + e.q.en);
      if (e.type === 'qaAnswer') console.log('   [' + nm(e.player) + (game.getPlayer(e.player).isAI ? '*' : '') + '] ' + e.text);
      if (e.type === 'qaSkip') console.log('   [' + nm(e.player) + '] (no answer)');
      if (e.type === 'chat') console.log('   chat [' + nm(e.player) + '] ' + e.text);
      if (e.type === 'eject') console.log('-- eject', nm(e.id), e.role, e.reason);
      if (e.type === 'gameEnd') console.log('-- game end', e.winner, e.reason);
    }
  }
  if (phase === 'move' && sim >= SECS && game.phase === 'playing') {
    phase = 'meeting';
    const crew = game.list().filter((p) => p.alive && p.role === 'crew');
    const ai = game.list().find((p) => p.isAI && p.alive);
    if (game.bodies.length === 0 && crew.length > 2) { game.teleport(crew[0].id, ai.x + 60, ai.y); game.killPlayer(crew[0].id, ai.id); }
    const reporter = crew.find((p) => p.alive) || crew[1];
    console.log('\n=== calling meeting (body reported) ===');
    game.startMeeting(reporter.id, game.bodies[0] ? game.bodies[0].id : null, false);
    meetingAt = sim;
  }
  if (phase === 'meeting' && (game.phase === 'playing' || game.phase === 'ended' || game.phase === 'ejecting')) {
    console.log('\n=== done in', ((Date.now() - t0) / 1000).toFixed(0), 's wall; log:', svc.analytics.file);
    clearInterval(timer);
    process.exit(0);
  }
  if (Date.now() - t0 > 300000) { console.log('timeout'); process.exit(1); }
}, 33);
