# AI agents in AI IMPOSTOR: SPACE SHIP

## In-process (offline / server bots)
`js/core/bots.js` exposes a perception + action API used by the built-in bots:

- `game.observe(playerId, { map: true })` (= `AS.Agent.observe(game, id)`) returns only what that player legitimately knows:
  `me` (x, y, room, role, alive, killCooldown, tasks with `next` station coords), `map` (rooms with names/rects, halls,
  stations, panels, button, consoles, doors, obstacles, ranges; `vents` only for impostors), `players` (public roster),
  `visiblePlayers`, `visibleBodies`, `meeting` (stage, timer, votes, `chat`), `sabotage`, `closedDoors`,
  `lastSeen` (memory of where each player was last seen), `events` (kills / vents this player witnessed), `taskProgress`.
- `AS.Agent.actions(game, id)` → `moveTo(x,y)` (pathfinding via `geo.findPath`), `stop()`, `doTask(taskId)`, `report(bodyId)`,
  `kill(target)`, `vote(target|'skip')`, `chat(text)`, `emergency()`, `fix(panelId, holding)`, `vent/ventMove/ventExit`, `sabotage(kind, room)`.

## Over WebSocket (online server)
Start the server (`start-server.bat`, or `HOST=127.0.0.1 node server/server.js`), then connect to `ws://HOST:3000/ws`:

1. `{"t":"hello","v":1,"agent":true,"name":"MyBot","lang":"en"}`
2. `{"t":"create"}` or `{"t":"join","code":"ABCD"}` → `{"t":"room","code","you"}`
3. The server sends `{"t":"obs","o":<observe()>}` ~4 times per second (`o.map` only in the first one) plus `{"t":"ev","e":[...]}` events.
4. Act with `{"t":"act","a":{...}}`: any normal action (`kill`, `report`, `taskComplete`, `vote`, `chat`, `fixPanel`, `emergency`, `vent`, ...)
   plus `{"type":"goto","x":..,"y":..}` (server pathfinds and walks you there) and `{"type":"stop"}`.
   Agents appear as bots in the lobby. Chat: max 120 chars, rate-limited, only during meetings.

Example: `node tools/example-agent.js [ROOMCODE] [ws://127.0.0.1:3000/ws] [name]` (Node 22+).

## Meeting questions (AI IMPOSTOR)
Meetings are question rounds: `meeting.qa` in the observation tells whose turn it is (`qa.turn.player`). On your turn send
`{"type":"answer","text":"..."}` (max 140 chars, once per question). `chat` is only accepted when `meeting.freeChat` is true.
