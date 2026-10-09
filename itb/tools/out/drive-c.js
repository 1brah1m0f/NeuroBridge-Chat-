// Scratch test driver for tasks-c / sabotage mini-games (real CDP input via tools/shot.js --steps).
// usage: node tools/out/drive-c.js <game> [seed] [lang]
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const game = process.argv[2];
const seed = Number(process.argv[3] || 1234);
const lang = process.argv[4] || 'en';
const SIZES = { chart: [720, 460], steer: [600, 560], plants: [720, 480], sample: [720, 480], fix_lights: [680, 480], fix_comms: [720, 470], fix_o2: [680, 500], fix_reactor: [600, 520] };
const [LW, LH] = SIZES[game];
const sab = game.startsWith('fix_') ? '&sab=' + game.slice(4) : '';
const url = `tools/tasktest.html?lang=${lang}&hide=1${sab}`;
const OUT = path.join('tools', 'out');

function rngJs(s) { return `(()=>{let a=${s};Math.random=function(){a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296};return 'seeded'})()`; }
function mulberry(s) { let a = s; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const OPEN = `(()=>{${rngJs(seed)};openGame('${game}');return 'open'})()`;
const INFO = `(()=>{const c=document.querySelector('.task-canvas');const r=c.getBoundingClientRect();const L=(AS.TasksC&&AS.TasksC.live)||(AS.SabotageC&&AS.SabotageC.live);const T=L.__test;const o={rect:[r.left,r.top,r.width,r.height]};for(const k in T){if(T[k].length===0){try{o[k]=T[k]()}catch(e){o[k]='ERR '+e.message}}}return 'INFO '+JSON.stringify(o)})()`;

function shot(args) {
  try { return execFileSync('node', ['tools/shot.js', url, ...args], { encoding: 'utf8', timeout: 170000 }); }
  catch (e) { return (e.stdout || '') + (e.stderr || ''); }
}
const p1 = shot(['--out', path.join(OUT, `d_${game}_0.png`), '--size', '1000x760', '--wait', '700', '--eval', OPEN, '--eval', 'new Promise(r=>setTimeout(r,300))', '--eval', INFO]);
const m = /INFO (\{.*\})/.exec(p1);
if (!m) { console.log(p1); process.exit(1); }
const info = JSON.parse(m[1]);
const [rx, ry, rw, rh] = info.rect;
const P = (x, y) => [Math.round((rx + (x * rw) / LW) * 10) / 10, Math.round((ry + (y * rh) / LH) * 10) / 10];
const steps = [{ eval: OPEN }, { wait: 500 }];
const down = (x, y) => steps.push({ mouse: 'move', at: P(x, y) }, { mouse: 'down', at: P(x, y) });
const move = (x, y) => steps.push({ mouse: 'move', at: P(x, y), buttons: 1 }, { wait: 16 });
const up = (x, y) => steps.push({ mouse: 'up', at: P(x, y) });
const click = (x, y) => steps.push({ click: P(x, y) }, { wait: 120 });
const glide = (x0, y0, x1, y1, stepLen) => { const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (stepLen || 8))); for (let i = 1; i <= n; i++) move(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n); };
const shotStep = (name) => steps.push({ shot: path.join(OUT, `d_${game}_${name}.png`) });

if (game === 'chart') {
  const N = info.nodes;
  // first: a deliberate deviation to prove the fail/reset path
  down(N[0][0], N[0][1]); glide(N[0][0], N[0][1], N[0][0] + 20, N[0][1] - 90, 6); up(N[0][0] + 20, N[0][1] - 90);
  steps.push({ wait: 300 }, { eval: "'after fail: '+JSON.stringify(AS.TasksC.live.__test.state())" }, { wait: 300 });
  down(N[0][0], N[0][1]);
  for (let i = 1; i < N.length; i++) { glide(N[i - 1][0], N[i - 1][1], N[i][0], N[i][1], 7); if (i === 2) shotStep('mid'); }
  up(N[N.length - 1][0], N[N.length - 1][1]);
  steps.push({ wait: 300 }, { shot: path.join(OUT, `d_${game}_end.png`) }, { wait: 900 });
} else if (game === 'steer') {
  const [cx, cy] = info.cross, [ox, oy] = info.center;
  down(cx, cy); glide(cx, cy, ox + 40, oy + 30, 10); up(ox + 40, oy + 30);
  steps.push({ wait: 200 }, { eval: "'released off-center: '+JSON.stringify(AS.TasksC.live.__test.state())" });
  down(ox + 40, oy + 30); glide(ox + 40, oy + 30, ox + 2, oy - 1, 5); shotStep('locked'); up(ox + 2, oy - 1);
  steps.push({ wait: 1500 });
} else if (game === 'plants') {
  const [cx, cy] = info.can;
  down(cx, cy);
  let px = cx, py = cy;
  info.plants.forEach((pl, i) => {
    const tx = pl[0] + 91, ty = 170;
    glide(px, py, tx, ty, 12); px = tx; py = ty;
    steps.push({ wait: i === 0 ? 900 : 2100 });
    if (i === 0) { shotStep('pour'); steps.push({ wait: 1200 }); }
  });
  shotStep('bloom');
  up(px, py);
  steps.push({ wait: 1500 });
} else if (game === 'sample') {
  const anom = Math.floor(mulberry(seed)() * 5);
  const TX = [92, 186, 280, 374, 468];
  steps.push({ eval: rngJs(seed) });
  click(613, 208);
  steps.push({ wait: 1300 }); shotStep('fill');
  steps.push({ wait: 2600 }, { eval: "'skip -> '+AS.TasksC.live.__test.skip()" }, { wait: 400 });
  shotStep('wait');
  steps.push({ eval: "'phase '+AS.TasksC.live.__test.phase()+' anomaly '+AS.TasksC.live.__test.anomaly()" });
  steps.push({ wait: 100 }, { eval: "(()=>{AS.Tasks.close('user');openGame('sample');return 'reopened phase '+AS.TasksC.live.__test.phase()})()" }, { wait: 600 });
  shotStep('ready');
  click(TX[(anom + 1) % 5], 250);
  steps.push({ wait: 600 }); shotStep('wrong');
  steps.push({ wait: 1800 }, { eval: "'after wrong: '+AS.TasksC.live.__test.phase()" });
  steps.push({ eval: rngJs(seed) });
  click(613, 208);
  steps.push({ wait: 3900 }, { eval: "'skip -> '+AS.TasksC.live.__test.skip()" }, { wait: 500 });
  click(TX[anom], 250);
  steps.push({ wait: 300 }); shotStep('done'); steps.push({ wait: 1200 });
} else if (game === 'fix_lights') {
  const sw = info.switches;
  const firstOn = sw.findIndex((s) => s[2]);
  if (firstOn >= 0) { click(sw[firstOn][0], 265); click(sw[firstOn][0], 265); }
  sw.forEach((s, i) => { if (!s[2]) { click(s[0], 265); steps.push({ wait: 150 }); if (i === sw.length - 1 || i === 2) shotStep('s' + i); } });
  steps.push({ wait: 200 }); shotStep('end'); steps.push({ wait: 1200 });
} else if (game === 'fix_comms') {
  const [KX, KY, KR] = info.knob;
  const SWEEP = 1.5 * Math.PI;
  let delta = (info.target - info.value) * SWEEP;
  let a = -Math.PI / 2;
  const R = KR * 0.8;
  down(KX + Math.cos(a) * R, KY + Math.sin(a) * R);
  const n = Math.ceil(Math.abs(delta) / 0.06);
  for (let i = 1; i <= n; i++) { const aa = a + (delta * i) / n; move(KX + Math.cos(aa) * R, KY + Math.sin(aa) * R); if (i === Math.floor(n / 2)) shotStep('mid'); }
  const ae = a + delta;
  up(KX + Math.cos(ae) * R, KY + Math.sin(ae) * R);
  steps.push({ eval: "'after knob: '+JSON.stringify(AS.SabotageC.live.__test.state())+' v='+AS.SabotageC.live.__test.value().toFixed(4)+' t='+AS.SabotageC.live.__test.target().toFixed(4)" });
  steps.push({ wait: 500 }); shotStep('lock'); steps.push({ wait: 1500 });
} else if (game === 'fix_o2') {
  const code = info.code;
  const wrong = code.split('').map((d) => String((Number(d) + 1) % 10)).join('');
  for (const d of wrong) steps.push({ press: 'Digit' + d }, { wait: 60 });
  steps.push({ press: 'Enter' }, { wait: 150 }); shotStep('wrong');
  steps.push({ wait: 900 });
  // real clicks for the correct code
  const keyPos = (lab) => { const LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'OK']; const i = LABELS.indexOf(lab); const KW = 86, KH = 62, KG = 16, KX0 = 270 + (396 - (3 * KW + 2 * KG)) / 2; return [KX0 + (i % 3) * (KW + KG) + KW / 2, 134 + Math.floor(i / 3) * (KH + KG) + KH / 2]; };
  for (const d of code) { const k = keyPos(d); click(k[0], k[1]); }
  shotStep('typed');
  const ok = keyPos('OK'); click(ok[0], ok[1]);
  steps.push({ wait: 250 }); shotStep('ok'); steps.push({ wait: 1200 });
} else if (game === 'fix_reactor') {
  const [px, py] = info.pad;
  down(px, py); steps.push({ wait: 500 }); shotStep('holding');
  steps.push({ eval: "(()=>{FAKE.sabotage.panels={p_reactor:{done:false,held:true},p_reactor2:{done:false,held:true}};return 'other held'})()" }, { wait: 500 });
  shotStep('both');
  move(px + 250, py); steps.push({ wait: 200 });
  move(px, py + 10); steps.push({ wait: 200 });
  up(px, py + 10); steps.push({ wait: 200 });
  steps.push({ eval: "(()=>{FAKE.sabotage.timer=7;FAKE.sabotage.panels={p_reactor2:{done:false,held:false}};return 'reset'})()" }, { wait: 300 });
  shotStep('idle');
  steps.push({ eval: "(()=>{FAKE.sabotage=null;return 'sabotage fixed externally'})()" }, { wait: 400 });
  shotStep('fixed'); steps.push({ wait: 1200 });
}
fs.writeFileSync(path.join(OUT, `steps_${game}.json`), JSON.stringify(steps));
const out = shot(['--size', '1000x760', '--wait', '600', '--steps', path.join(OUT, `steps_${game}.json`)]);
const lines = out.split('\n').filter((l) => !/ERR_FILE_NOT_FOUND|^\[shot\]/.test(l) && l.trim());
console.log(lines.join('\n'));
console.log(/TASK_COMPLETE /.test(out) ? `RESULT ${game}: COMPLETED` : `RESULT ${game}: not completed`);
