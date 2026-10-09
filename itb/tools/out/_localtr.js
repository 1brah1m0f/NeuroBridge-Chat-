// Unit checks for AS.LocalTransport using the protocol stub game (tools/out/stub-game.js).
const path = require('path');
const root = path.resolve(__dirname, '..', '..');
for (const f of ['ns.js', 'constants.js', 'i18n.js']) require(path.join(root, 'js', 'core', f));
require(path.join(root, 'tools', 'out', 'stub-game.js'));
require(path.join(root, 'js', 'client', 'net.js'));
const AS = globalThis.AS;
let fails = 0;
const check = (n, ok, d) => { console.log((ok ? '  ok   ' : '  FAIL ') + n + (ok ? '' : '  -> ' + JSON.stringify(d))); if (!ok) fails++; };

const g = new AS.Game({ settings: {} });
const me = g.addPlayer({ id: 'me', name: 'Me', isBot: false });
for (let i = 0; i < 4; i++) g.addBot();
g.drainEvents();
const tr = new AS.LocalTransport({ game: g, myId: me.id });
const evs = [], snaps = [], status = [];
tr.onEvents = (e) => evs.push(...e);
tr.onSnapshot = (s) => snaps.push(s);
tr.onStatus = (s) => status.push(s);

tr.update(0);
check('first update: status open + snapshot without ticking', status[0] === 'open' && snaps.length === 1 && g.time === 0, { status, n: snaps.length, t: g.time });
tr.update(1.0); // 30 ticks due, capped at 5, backlog dropped
check('max 5 ticks per frame', Math.abs(g.time - 5 * AS.T.TICK) < 1e-9, g.time);
check('backlog dropped after a long frame', tr.acc < AS.T.TICK, tr.acc);
const n0 = snaps.length;
tr.update(0.01);
check('no tick -> no snapshot', snaps.length === n0, snaps.length - n0);
tr.update(0.03);
check('tick -> one snapshot per frame', snaps.length === n0 + 1, snaps.length - n0);

g.emit({ type: 'taskStep', to: 'someoneElse', task: 'x' });
g.emit({ type: 'taskStep', to: 'me', task: 'y' });
g.emit({ type: 'countdown', n: 3 });
tr.update(0.04);
check('private events for others filtered, mine + public delivered', evs.some((e) => e.task === 'y') && !evs.some((e) => e.task === 'x') && evs.some((e) => e.type === 'countdown'), evs);

evs.length = 0;
const r = tr.send({ type: 'setLook', color: g.getPlayer(g.order[1]).color });
tr.update(0);
check('rejected action -> synthesized private error event', r.ok === false && evs.length === 1 && evs[0].type === 'error' && evs[0].err === 'colorTaken' && evs[0].to === 'me', evs);
evs.length = 0;
const origApply = g.applyAction; g.applyAction = ((orig) => function (id, a) { const res = orig.call(this, id, a); if (!res.ok) this.emit({ type: 'error', to: id, err: res.err }); return res; })(g.applyAction);
tr.send({ type: 'setLook', color: g.getPlayer(g.order[1]).color });
tr.update(0);
check('no duplicate when the game emits its own error event', evs.filter((e) => e.type === 'error').length === 1, evs);
evs.length = 0;
g.applyAction = origApply;
tr.send({ type: 'move', x: 1, y: 1, tp: 999 });
tr.update(0);
check('rejected moves stay silent', evs.length === 0, evs);

tr.send({ type: 'start' });
tr.fastForward(30, (gg) => gg.phase === 'playing');
check('fastForward until playing', g.phase === 'playing', g.phase);
const before = snaps.length;
tr.update(0);
check('fastForward marks dirty -> snapshot on next update', snaps.length === before + 1 && snaps[snaps.length - 1].phase === 'playing');
check('actAs as another player', tr.actAs(g.order[1], { type: 'nope' }).ok === false && !evs.some((e) => e.to !== 'me' && e.type === 'error'));

tr.close();
check('close -> status closed, callbacks dropped', status[status.length - 1] === 'closed' && tr.onSnapshot === null);
tr.update(1);
check('update after close is a no-op', snaps.length === before + 1);

// URL resolution
const cases = [
  ['', 'ws://localhost:3000/ws'], ['192.168.1.5', 'ws://192.168.1.5:3000/ws'], ['192.168.1.5:4000', 'ws://192.168.1.5:4000/ws'],
  ['http://10.0.0.2:3000/', 'ws://10.0.0.2:3000/ws'], ['https://abc.trycloudflare.com', 'wss://abc.trycloudflare.com/ws'],
  ['abc.ngrok-free.app', 'wss://abc.ngrok-free.app/ws'], ['localhost', 'ws://localhost:3000/ws'], ['DESKTOP-PC', 'ws://DESKTOP-PC:3000/ws'],
  ['ws://host:9/ws', 'ws://host:9/ws'], ['https://x.example.com/among/', 'wss://x.example.com/among/ws'], [' 192.168.1.5:3000/index.html ', 'ws://192.168.1.5:3000/ws'],
  ['ftp://x', null], ['bad host', 'ws://badhost:3000/ws'], ['a b!', null], ['host:99999', null],
];
for (const [inp, want] of cases) check('resolveUrl(' + JSON.stringify(inp) + ')', AS.Net.resolveUrl(inp) === want, AS.Net.resolveUrl(inp));
console.log(fails ? fails + ' FAILED' : 'all ok');
process.exit(fails ? 1 : 0);
