// node tools/sim.js [games=3] [bots=8] [--chat]  — bot-only games, headless.
const path = require('path');
for (const f of ['ns', 'constants', 'i18n', 'map', 'geometry', 'game', 'questions', 'qa', 'bots']) require(path.join(__dirname, '../js/core/' + f + '.js'));
const AS = globalThis.AS;
const N = +process.argv[2] || 3, NB = +process.argv[3] || 8, showChat = process.argv.includes('--chat');
let fails = 0;
for (let g = 0; g < N; g++) {
  const game = new AS.Game({ mapId: 'starship', settings: AS.sanitizeSettings({ aiLevel: +(process.env.LEVEL || 3), answerTime: 20, votingTime: 30 }), seed: 1000 + g });
  for (let i = 0; i < NB; i++) game.addBot();
  game.startGame();
  const stats = { kills: 0, meetings: 0, chat: 0, qa: 0, qaSkips: 0, steps: 0, sab: 0 };
  let t = 0;
  const t0 = Date.now();
  while (game.phase !== 'ended' && t < 900) {
    game.tick(AS.T.TICK); t += AS.T.TICK;
    for (const e of game.drainEvents()) {
      if (e.type === 'kill') stats.kills++;
      if (e.type === 'meeting') stats.meetings++;
      if (e.type === 'taskStep') stats.steps++;
      if (e.type === 'sabotage') stats.sab++;
      if (e.type === 'qaQuestion' && showChat) console.log('   ?? Q' + e.round + '/' + e.rounds + ': ' + e.q.en);
      if (e.type === 'qaAnswer') { stats.qa++; if (showChat) console.log('   [' + game.getPlayer(e.player).name + '] ' + e.text); }
      if (e.type === 'qaSkip') stats.qaSkips++;
      if (e.type === 'chat') { stats.chat++; if (showChat) console.log('   [' + game.getPlayer(e.player).name + '] ' + e.text); }
      if (e.type === 'eject' && showChat) console.log('   -- eject', e.id && game.getPlayer(e.id).name, e.role, e.reason);
    }
  }
  if (game.phase !== 'ended') fails++;
  console.log('game', g, game.phase, game.result && game.result.winner, game.result && game.result.reason, 't=' + t.toFixed(0) + 's', JSON.stringify(stats), (Date.now() - t0) + 'ms');
}
process.exit(fails ? 1 : 0);
