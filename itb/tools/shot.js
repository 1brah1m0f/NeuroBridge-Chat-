#!/usr/bin/env node
/* Headless browser harness (Chrome/Edge via DevTools Protocol). No npm deps; needs Node 22+.
 *
 *   node tools/shot.js <path-or-url>[?query] [options]
 *     --out <file.png>     screenshot path (default tools/out/shot.png)
 *     --size 1280x720      viewport (CSS px)        --dpr 1      device pixel ratio
 *     --mobile             emulate a touch phone    --wait 1500  ms to wait after load
 *     --eval "<js>"        run JS after the wait (repeatable, awaited, result printed)
 *     --steps <file.json>  array of steps: {"wait":ms} {"eval":"js"} {"shot":"file.png"}
 *                          {"key":"KeyW","down":true|false} {"press":"KeyE"} {"click":[x,y]} {"tap":[x,y]}
 *                          {"drag":[x1,y1,x2,y2,steps]} {"mouse":"down"|"up"|"move","at":[x,y]}
 *     --timeout 60000      hard timeout
 * Prints console output + page errors. Exit code 2 when uncaught page errors occurred.
 */
'use strict';
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const args = process.argv.slice(2);
const opt = { out: path.join(__dirname, 'out', 'shot.png'), size: '1280x720', dpr: 1, wait: 1500, evals: [], timeout: 60000 };
let target = null;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--out') opt.out = args[++i];
  else if (a === '--size') opt.size = args[++i];
  else if (a === '--dpr') opt.dpr = Number(args[++i]);
  else if (a === '--mobile') opt.mobile = true;
  else if (a === '--wait') opt.wait = Number(args[++i]);
  else if (a === '--eval') opt.evals.push(args[++i]);
  else if (a === '--steps') opt.steps = JSON.parse(fs.readFileSync(args[++i], 'utf8'));
  else if (a === '--timeout') opt.timeout = Number(args[++i]);
  else if (a === '--browser') opt.browser = args[++i];
  else target = a;
}
if (!target) { console.error('usage: node tools/shot.js <path-or-url> [--out f.png] [--eval js] ...'); process.exit(1); }
let url = target;
if (!/^(https?|file|about|data):/i.test(target)) {
  const q = target.indexOf('?');
  const p = q >= 0 ? target.slice(0, q) : target;
  url = pathToFileURL(path.resolve(p)).href + (q >= 0 ? target.slice(q) : '');
}
const [W, H] = opt.size.split('x').map(Number);

function findBrowser() {
  const c = [opt.browser, process.env.BROWSER,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  for (const p of c) if (p && fs.existsSync(p)) return p;
  throw new Error('No Chrome/Edge found');
}

const KEYS = {
  Space: [' ', 32], Enter: ['Enter', 13], Escape: ['Escape', 27], Tab: ['Tab', 9], Backspace: ['Backspace', 8],
  ArrowUp: ['ArrowUp', 38], ArrowDown: ['ArrowDown', 40], ArrowLeft: ['ArrowLeft', 37], ArrowRight: ['ArrowRight', 39],
};
function keyInfo(code) {
  if (KEYS[code]) return { key: KEYS[code][0], vk: KEYS[code][1] };
  let m = /^Key([A-Z])$/.exec(code);
  if (m) return { key: m[1].toLowerCase(), vk: m[1].charCodeAt(0) };
  m = /^Digit(\d)$/.exec(code);
  if (m) return { key: m[1], vk: 48 + Number(m[1]) };
  return { key: code, vk: 0 };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (v) => (typeof v === 'string' ? v : JSON.stringify(v));

(async () => {
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'as-shot-'));
  const exe = findBrowser();
  const proc = spawn(exe, [
    '--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + userDir, '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--allow-file-access-from-files',
    '--hide-scrollbars', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--window-size=' + W + ',' + H, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let errors = 0;
  const killAll = () => {
    try { if (process.platform === 'win32') execSync('taskkill /pid ' + proc.pid + ' /T /F', { stdio: 'ignore' }); else proc.kill('SIGKILL'); } catch (e) { /* ignore */ }
    setTimeout(() => { try { fs.rmSync(userDir, { recursive: true, force: true }); } catch (e) { /* ignore */ } }, 300);
  };
  const hard = setTimeout(() => { console.error('[shot] TIMEOUT'); killAll(); process.exit(3); }, opt.timeout);

  const wsUrl = await new Promise((resolve, reject) => {
    let buf = '';
    proc.stderr.on('data', (d) => {
      buf += d.toString();
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf);
      if (m) resolve(m[1]);
    });
    proc.on('exit', () => reject(new Error('browser exited: ' + buf.slice(-500))));
  });
  const port = new URL(wsUrl).port;
  let pageWs = null;
  for (let i = 0; i < 50 && !pageWs; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
      const pg = list.find((t) => t.type === 'page');
      if (pg) pageWs = pg.webSocketDebuggerUrl;
    } catch (e) { /* retry */ }
    if (!pageWs) await sleep(100);
  }
  const ws = new WebSocket(pageWs);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pending = new Map();
  const waiters = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const p = msg.params;
      const text = p.args.map((a) => (a.value !== undefined ? fmt(a.value) : a.description || a.type)).join(' ');
      console.log('[console.' + p.type + '] ' + text);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      errors++;
      const d = msg.params.exceptionDetails;
      console.log('[PAGE ERROR] ' + ((d.exception && d.exception.description) || d.text) + ' @ ' + (d.url || '') + ':' + d.lineNumber);
    } else if (msg.method === 'Log.entryAdded') {
      const e = msg.params.entry;
      if (e.level === 'error' || e.level === 'warning') console.log('[log.' + e.level + '] ' + e.text + (e.url ? ' @ ' + e.url : ''));
    }
    for (const w of waiters.slice()) if (w.method === msg.method) { waiters.splice(waiters.indexOf(w), 1); w.resolve(msg.params); }
  };
  const send = (method, params) => new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, { resolve, reject });
    ws.send(JSON.stringify({ id: i, method, params: params || {} }));
  });
  const waitFor = (method, ms) => new Promise((resolve) => {
    const w = { method, resolve };
    waiters.push(w);
    setTimeout(() => { const i = waiters.indexOf(w); if (i >= 0) { waiters.splice(i, 1); resolve(null); } }, ms);
  });

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: opt.dpr, mobile: !!opt.mobile });
  if (opt.mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const loaded = waitFor('Page.loadEventFired', 20000);
  await send('Page.navigate', { url });
  await loaded;
  await sleep(opt.wait);

  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) {
      errors++;
      console.log('[EVAL ERROR] ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text));
    } else {
      const v = r.result.value;
      console.log('[eval] ' + (v === undefined ? '(undefined)' : fmt(v)).slice(0, 4000));
    }
  };
  const shot = async (file) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    console.log('[shot] ' + path.resolve(file));
  };
  const mouse = (type, x, y, buttons) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: buttons || 0, clickCount: 1 });

  for (const e of opt.evals) await evaluate(e);
  for (const s of opt.steps || []) {
    if (s.wait) await sleep(s.wait);
    else if (s.eval) await evaluate(s.eval);
    else if (s.shot) await shot(s.shot);
    else if (s.key) {
      const k = keyInfo(s.key);
      await send('Input.dispatchKeyEvent', { type: s.down === false ? 'keyUp' : 'keyDown', key: k.key, code: s.key, windowsVirtualKeyCode: k.vk, text: s.down === false || k.key.length !== 1 ? undefined : k.key });
    } else if (s.press) {
      const k = keyInfo(s.press);
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k.key, code: s.press, windowsVirtualKeyCode: k.vk, text: k.key.length === 1 ? k.key : undefined });
      await sleep(60);
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k.key, code: s.press, windowsVirtualKeyCode: k.vk });
    } else if (s.click) {
      await mouse('mouseMoved', s.click[0], s.click[1]);
      await mouse('mousePressed', s.click[0], s.click[1], 1);
      await sleep(40);
      await mouse('mouseReleased', s.click[0], s.click[1]);
    } else if (s.mouse) {
      const t = { down: 'mousePressed', up: 'mouseReleased', move: 'mouseMoved' }[s.mouse];
      await mouse(t, s.at[0], s.at[1], s.mouse === 'up' ? 0 : s.buttons != null ? s.buttons : s.mouse === 'down' ? 1 : 0);
    } else if (s.tap) {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: s.tap[0], y: s.tap[1] }] });
      await sleep(50);
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else if (s.drag) {
      const [x1, y1, x2, y2, n = 12] = s.drag;
      await mouse('mouseMoved', x1, y1);
      await mouse('mousePressed', x1, y1, 1);
      for (let i = 1; i <= n; i++) { await mouse('mouseMoved', x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n, 1); await sleep(16); }
      await mouse('mouseReleased', x2, y2);
    }
  }
  if (opt.out && !(opt.steps && opt.steps.some((s) => s.shot) && !args.includes('--out'))) await shot(opt.out);
  console.log('[done] page errors: ' + errors);
  clearTimeout(hard);
  try { ws.close(); } catch (e) { /* ignore */ }
  killAll();
  setTimeout(() => process.exit(errors ? 2 : 0), 400);
})().catch((e) => { console.error('[shot] FAILED', e); process.exit(1); });
