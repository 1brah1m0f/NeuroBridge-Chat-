// Tiny external AI agent for AI IMPOSTOR: SPACE SHIP (Node 22+, uses the built-in WebSocket).
//   node tools/example-agent.js [ROOMCODE] [ws://127.0.0.1:3000/ws] [name]
// Without a room code it creates a room (you then join it from the browser with the printed code).
const code = process.argv[2] && process.argv[2].length === 4 ? process.argv[2].toUpperCase() : null;
const url = process.argv[3] || 'ws://127.0.0.1:3000/ws';
const name = process.argv[4] || 'AgentX';
const ws = new WebSocket(url);
const act = (a) => ws.send(JSON.stringify({ t: 'act', a }));
let map = null, taskT = 0, lastChatSeen = 0, voted = false;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

ws.onopen = () => {
  ws.send(JSON.stringify({ t: 'hello', v: 1, agent: true, name, lang: 'en' }));
  ws.send(JSON.stringify(code ? { t: 'join', code } : { t: 'create' }));
};
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.t === 'room') console.log('in room', msg.code, 'as', msg.you);
  if (msg.t === 'err') console.log('error', msg.key);
  if (msg.t === 'obs') think(msg.o);
};
ws.onclose = () => { console.log('closed'); process.exit(0); };

function think(o) {
  if (o.map) map = o.map;
  const me = o.me;
  if (o.phase === 'meeting' && o.meeting) {
    // answer questions in chat
    for (const c of o.meeting.chat) {
      if (c.t <= lastChatSeen || c.player === me.id) continue;
      lastChatSeen = c.t;
      if (/where|harda/i.test(c.text)) act({ type: 'chat', text: 'i was in ' + (me.room || 'the hallway') });
    }
    if (o.meeting.stage === 'voting' && !voted) {
      voted = true;
      const sus = o.events.find((e) => e.type === 'kill');
      act({ type: 'vote', target: sus ? sus.killer : 'skip' });
    }
    return;
  }
  voted = false;
  if (o.phase !== 'playing' || !me.alive) return;
  // report any body we can see
  const body = o.visibleBodies[0];
  if (body && me.role !== 'impostor') {
    if (dist(me, body) < map.ranges.report - 30) act({ type: 'report', body: body.id });
    else act({ type: 'goto', x: body.x, y: body.y });
    return;
  }
  // impostor: kill when exactly one crewmate is visible and nobody else
  if (me.role === 'impostor') {
    const crew = o.visiblePlayers.filter((p) => p.role !== 'impostor');
    if (crew.length === 1 && me.killCooldown === 0) {
      if (dist(me, crew[0]) < map.ranges.kill.normal - 10) act({ type: 'kill', target: crew[0].id });
      else act({ type: 'goto', x: crew[0].x, y: crew[0].y });
      return;
    }
  }
  // walk to the next task station and do it
  const task = me.tasks.find((t) => !t.done && t.next && t.next.x != null);
  if (!task) return;
  const st = task.next;
  if (dist(me, st) > map.ranges.use - 30) { act({ type: 'goto', x: st.x, y: st.y }); taskT = 0; return; }
  if (++taskT > 12 && !task.fake) { act({ type: 'taskComplete', task: task.id }); taskT = 0; }
}
