// Launches start-server.bat with HOST=127.0.0.1 PORT=3108, waits for the banner, fetches /, kills the tree.
const { spawn, execSync } = require('child_process');
const path = require('path');
const root = path.resolve(__dirname, '..', '..');
const child = spawn('cmd.exe', ['/c', path.join(root, 'start-server.bat')], {
  cwd: path.join(root, 'tools'), // the bat must cd to its own folder by itself
  env: Object.assign({}, process.env, { HOST: '127.0.0.1', PORT: '3108' }),
  stdio: ['pipe', 'pipe', 'pipe'],
});
let out = '';
child.stdout.on('data', (d) => { out += d; });
child.stderr.on('data', (d) => { out += d; });
const t0 = Date.now();
const timer = setInterval(async () => {
  if (/listening on/.test(out) || Date.now() - t0 > 8000) {
    clearInterval(timer);
    let status = 0;
    try { status = (await fetch('http://127.0.0.1:3108/')).status; } catch (e) { status = 'ERR ' + e.message; }
    try { execSync('taskkill /pid ' + child.pid + ' /T /F', { stdio: 'ignore' }); } catch (e) { /* ignore */ }
    console.log(out);
    console.log('GET / ->', status);
    process.exit(0);
  }
}, 100);
