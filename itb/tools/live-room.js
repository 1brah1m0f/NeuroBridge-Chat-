// node tools/live-room.js [seconds=40]
// Starts the real server (with .env keys), joins one human over WebSocket, adds NPCs, starts a match and reports
// what the LLM director decided for the hidden AIs. Needs Node 22+ (global WebSocket).
const { spawn } = require('child_process');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SECS = +process.argv[2] || 40, PORT = 3141;
const srv = spawn(process.execPath, [path.join(ROOT, 'server/server.js')], { env: Object.assign({}, process.env, { HOST: '127.0.0.1', PORT: String(PORT), DIRECTOR_DEBUG: '1' }), stdio: ['ignore', 'pipe', 'pipe'] });
let out = '';
srv.stdout.on('data', (d) => { out += d; process.stdout.write(d); });
srv.stderr.on('data', (d) => process.stderr.write(d));
const done = (code) => { try { srv.kill(); } catch (e) { /* ignore */ } setTimeout(() => process.exit(code), 200); };
setTimeout(() => {
  const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws');
  let me = null, snap = null;
  ws.onopen = () => { ws.send(JSON.stringify({ t: 'hello', v: 1, name: 'Tester', lang: 'en' })); ws.send(JSON.stringify({ t: 'create' })); };
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.t === 'room') { me = d.you; for (let i = 0; i < 4; i++) ws.send(JSON.stringify({ t: 'act', a: { type: 'addBot' } })); setTimeout(() => ws.send(JSON.stringify({ t: 'act', a: { type: 'start' } })), 600); }
    if (d.t === 'snap') snap = d.s;
  };
  setTimeout(() => {
    const leaks = snap ? JSON.stringify(snap).includes('isAI') : null;
    console.log('\n--- client view: players', snap && snap.players.length, '| roles visible to me:', snap && snap.players.filter((p) => p.role).map((p) => p.role).join(',') || 'none', '| bot flags:', snap && snap.players.filter((p) => p.isBot).length, '| isAI in snapshot:', leaks);
    const lines = out.split('\n').filter((l) => /\[director\]/.test(l));
    console.log('director decisions: ' + lines.length);
    ok = lines.length > 0 && leaks === false;
    console.log(ok ? 'LIVE ROOM OK' : 'LIVE ROOM PROBLEM');
    done(ok ? 0 : 1);
  }, SECS * 1000);
}, 1500);
let ok = false;
