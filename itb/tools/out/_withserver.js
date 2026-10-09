// Runs a command while server/server.js listens on 127.0.0.1:<PORT> (stub core unless --real), then stops it.
//   node tools/out/_withserver.js [--real] [--port 3109] -- <command...>
const { spawn, execSync } = require('child_process');
const path = require('path');
const root = path.resolve(__dirname, '..', '..');
const argv = process.argv.slice(2);
const sep = argv.indexOf('--');
const opts = argv.slice(0, sep < 0 ? argv.length : sep);
const cmd = sep < 0 ? [] : argv.slice(sep + 1);
const port = opts.includes('--port') ? opts[opts.indexOf('--port') + 1] : '3109';
const env = Object.assign({}, process.env, { HOST: '127.0.0.1', PORT: port });
if (!opts.includes('--real')) env.AS_PRELOAD = path.join(root, 'tools', 'out', 'stub-game.js');
const srv = spawn(process.execPath, [path.join(root, 'server', 'server.js')], { env, cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let out = '';
srv.stdout.on('data', (d) => { out += d; });
srv.stderr.on('data', (d) => { out += d; });
const stop = () => { try { execSync('taskkill /pid ' + srv.pid + ' /T /F', { stdio: 'ignore' }); } catch (e) { /* ignore */ } };
const t0 = Date.now();
const wait = setInterval(() => {
  if (!/listening on/.test(out) && Date.now() - t0 < 8000) return;
  clearInterval(wait);
  const c = spawn(cmd[0], cmd.slice(1), { cwd: root, stdio: 'inherit', shell: false });
  c.on('exit', (code) => {
    stop();
    console.log('--- server log ---\n' + out.split('\n').filter((l) => !/^\s*$/.test(l)).slice(-25).join('\n'));
    process.exit(code || 0);
  });
}, 100);
