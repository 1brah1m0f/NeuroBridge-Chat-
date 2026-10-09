// Scratch driver: node tools/out/ta/drive.js <game> [seed] [lang]
// Phase 1 reads AS.TasksA.live.__test.plan() (logical coords), phase 2 replays real mouse input.
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const game = process.argv[2], seed = Number(process.argv[3] || 7), lang = process.argv[4] || 'en';
const root = path.resolve(__dirname, '..', '..', '..');
const page = 'tools/tasktest.html?lang=' + lang + '&hide=1';
const open = { eval: "Math.random = AS.util.rng(" + seed + "); openGame('" + game + "'); 'opened'" };
function run(steps, out) {
  const f = path.join(__dirname, 'steps-' + game + '.json');
  fs.writeFileSync(f, JSON.stringify(steps));
  try {
    return execFileSync('node', ['tools/shot.js', page, '--size', '1000x760', '--wait', '600', '--steps', f, '--out', out], { cwd: root, encoding: 'utf8' });
  } catch (e) { return (e.stdout || '') + (e.stderr || ''); }
}
const o1 = run([open, { wait: 400 }, { eval: "JSON.stringify({r: document.querySelector('.task-canvas').getBoundingClientRect(), w: AS.Tasks && AS.TasksA.live && 1, plan: AS.TasksA.live.__test.plan()})" }], 'tools/out/ta/_p1.png');
const line = o1.split('\n').find((l) => l.startsWith('[eval] {'));
if (!line) { console.log(o1); process.exit(1); }
const info = JSON.parse(line.slice(7));
const W = { wires: 620, leaves: 680, swipe: 700, align: 700 }[game] || 600;
const sc = info.r.width / W;
const P = (p) => [Math.round(info.r.x + p[0] * sc), Math.round(info.r.y + p[1] * sc)];
const steps = [open, { wait: 500 }];
const mk = require('./plans.js')[process.env.PLAN || game];
mk(info.plan, P, steps);
steps.push({ wait: 1300 }, { shot: 'tools/out/' + game + '-done.png' });
console.log(run(steps, 'tools/out/' + game + '-done.png'));
