# AI IMPOSTOR: SPACE SHIP — module contract (single source of truth)

> Sections 1-9 are the original module contract. Section 10 documents what changed for AI IMPOSTOR (roles, Q&A meetings, LLM-driven AIs). Where they disagree, section 10 wins.

An Among-Us-style social deduction game ("AI IMPOSTOR: SPACE SHIP"), map "Xəzər Stansiyası / Caspian Station".
Plain HTML5 canvas + DOM. Offline vs bots by double-clicking `index.html` (file://), and online rooms via
`node server/server.js` (zero npm dependencies). UI languages: Azerbaijani (default) + English.

**HARD RULES**
- **Chat is question-and-answer only** (see section 10). No quick-chat, emotes or speech bubbles. Free chat exists only on AI level 3+ after a found body.
- Characters must be clearly *different* from Among Us crewmates (see Art). Name is AI IMPOSTOR: SPACE SHIP.
- No build step, no npm deps, no ES modules. Every JS file is a classic script:
  `(function (AS) { 'use strict'; ... })(globalThis.AS = globalThis.AS || {});`
- No image/audio files: all art is procedural canvas/CSS, all sound is WebAudio-synthesized.
- Every user-visible string goes through `AS.t(key)`; register your strings with `AS.i18n.add({az:{...}, en:{...}})`
  inside your own file, keys prefixed by your module (e.g. `menu.*`, `hud.*`, `flow.*`, `game.<gameId>.*`).
  Azerbaijani must be natural and correct (ə ı ö ü ğ ş ç İ). Use `AS.i18n.upper(s)` for uppercase.
- Touch + mouse + keyboard must all work. Target 60 fps on a mid laptop.
- Only edit files you own (table below). If you need something from another module, code defensively
  (`if (AS.Art) ...`) and note it in your final report.
- Shared code (`js/core/*`) must run in Node too: no `window`/`document` there.

## Files & owners

| File | Owner |
|---|---|
| js/core/ns.js, constants.js, i18n.js, css/base.css, index.html, js/client/tasks/taskhost.js, tools/shot.js, tools/tasktest.html | foundation (exists — read, don't rewrite; tiny additive fixes OK, report them) |
| js/core/map.js, tools/mapview.html, tools/validate-map.js | map |
| js/core/geometry.js, js/core/game.js, tools/test-core.js | core |
| js/core/bots.js, tools/sim.js | bots |
| js/client/art.js, tools/artsheet.html | art |
| js/client/props.js, tools/propsheet.html | props |
| js/client/renderer.js, tools/rendertest.html | renderer |
| js/client/audio.js, tools/audiotest.html | audio |
| js/client/input.js, js/client/hud.js, css/hud.css, tools/hudtest.html | hud |
| js/client/ui-menu.js, css/menu.css, tools/menutest.html | menu (main menu, customize, settings, online, offline setup, how-to, **lobby overlay**) |
| js/client/ui-flow.js, css/flow.css, tools/flowtest.html | flow (role intro, meeting/voting, ejection, killed overlay, end screen) |
| js/client/tasks/tasks-a.js | tasks-a |
| js/client/tasks/tasks-b.js | tasks-b |
| js/client/tasks/tasks-c.js, js/client/tasks/sabotage.js | tasks-c |
| js/client/main.js, js/client/net.js, server/server.js, server/ws.js, package.json, start-server.bat, README.md | app |

Script load order is fixed in `index.html` (core → bots → audio → art → props → renderer → input → tasks → net → hud → ui-menu → ui-flow → main).
`server/server.js` `require`s `js/core/ns.js, constants.js, i18n.js, map.js, geometry.js, game.js, bots.js` in that order.

## 1. World

World units, +x right, +y down. A player's `(x, y)` is the **feet point**; collision is a circle of
`AS.T.PLAYER_RADIUS` (20) at the feet. Characters are drawn ~72 units tall upward from the feet.
3/4 top-down view like Among Us: north walls show a front face `AS.T.WALL_FACE` (80) tall drawn *above* the
floor edge; other walls are ~24-unit rims. Speeds/ranges are in `AS.T` (constants.js).

## 2. Map format (`js/core/map.js`) — owner: map

```js
AS.MAPS = AS.MAPS || {};
AS.MAPS.caspian = {
  id: 'caspian', nameKey: 'map.caspian', width: W, height: H,     // world bounds (station + lobby + margins)
  rooms: [ { id, nameKey: 'room.<id>', rect: [x,y,w,h], extra?: [[x,y,w,h],...], floor: '<floorStyle>',
             wall?: '<wallStyle>', label?: [x,y], lobby?: true } ],
  halls: [ { rect: [x,y,w,h], floor: 'hall' } ],                 // corridors; roomAt() returns null there
  props: [ { type, x, y, w?, h?, r?, style?, flip?, button?, block: bool, wall?: bool, floor?: bool, room? } ],
  stations: [ { id, x, y, room } ],                               // task locations (stand within USE_RANGE)
  taskDefs: [ { id, nameKey: 'task.<id>', kind: 'common'|'short'|'long', visual?: bool,
                steps: [ { st: 'stationId' | ['stationId', ...], game: '<miniGameId>', nameKey? } ] } ],
  vents: [ { id, x, y, room, links: ['ventId', ...] } ],        // links symmetric
  button: { x, y },                                               // emergency button (center of the mess-hall table)
  panels: [ { id, kind: 'lights'|'comms'|'o2'|'reactor', x, y, room, game: 'fix_lights'|'fix_comms'|'fix_o2'|'fix_reactor' } ],
  doors: [ { id, room, rect: [x,y,w,h], orient: 'v'|'h' } ],    // blocks a hall opening when closed
  cameras: [ { id, x, y, nameKey } ],                             // 4 security camera view centers
  consoles: [ { id, kind: 'admin'|'cams', x, y, room } ],
  spawns: { meeting: [[x,y], ...12+], lobby: [[x,y], ...12+] },
};
```
- **All floor rects (rooms, extra, halls, lobby) and door rects use multiples of 10.**
- Walkable floor = union of every room rect (+extra) and hall rect. The **lobby** ("dropship") is a room with
  `lobby: true`, disconnected from the station (≥200 units of void), and excluded from minimaps.
- Gaps between separate floor regions: ≥120 units vertically (wall face + rim), ≥60 horizontally.
- Halls are ≥140 wide (two players pass). Halls overlap the rooms they join by ≥10 so the union connects.
- Room ids (fixed): `messhall, defense, oxygen, bridge, shields, comms, cargo, admin, electrical, greenhouse,
  engine_a, engine_b, reactor, security, medbay, lobby`. Map registers `room.<id>` strings and `room.hallway`.
  AZ/EN: Yeməkxana/Mess Hall, Müdafiə/Defense, Oksigen/Oxygen, Körpü/Bridge, Qalxanlar/Shields, Rabitə/Comms,
  Anbar/Cargo, İdarəetmə/Admin, Elektrik/Electrical, İstixana/Greenhouse, Yuxarı mühərrik/Upper Engine,
  Aşağı mühərrik/Lower Engine, Reaktor/Reactor, Təhlükəsizlik/Security, Tibb otağı/MedBay, Gəmi/Dropship, Dəhliz/Hallway.
- Props: `x,y` = center of the footprint (`w,h` rect or `r` circle). `block: true` → movement obstacle
  (never blocks vision). `wall: true` → mounted on a north wall face: `y` = that wall's floor edge, drawn upward,
  `h` = visual height (≤ 80). `floor: true` → floor decal drawn under everything.
- Interactables (stations, panels, consoles, vents, button) must be reachable: a standing player can get within
  `AS.T.USE_RANGE` (110) / `VENT_RANGE` (100) / `BUTTON_RANGE` (160).
- Task defs: ≥3 common, ≥5 long, ≥10 short. A step whose `st` is an array → one station is picked at assignment.
  Mini-game ids: see `AS.TASK_GAMES`. Map registers `task.<id>` names (and step `nameKey`s if used).
- 4 sabotage kinds placed: lights (Electrical), comms (Comms), o2 ×2 (Oxygen + Admin), reactor ×2 (Reactor, far apart).
- ≥10 vents in 3–4 networks. Doors on most rooms' openings (not Mess Hall's? — up to map). 4 cameras in halls.

### Prop types (implemented by props.js; used by map.js)
Recommended footprint, flags. `style` variants in brackets.
| type | footprint | flags |
|---|---|---|
| table_round | r 80 (`button:true` → emergency button on top) | block |
| bench | w,h | block |
| chair | 40×40 | — |
| crate / crate_stack / boxes | 70×70 / 110×90 / 60×50 | block |
| barrel | r 28 | block |
| console [nav, comms, security, admin, weapons, shields, o2, reactor, electrical, medbay, generic] | 120×50 | block |
| admin_table (hologram map) | 240×140 | block |
| monitor_wall | 260×60 | wall |
| engine (`flip`) | 220×180 | block |
| reactor_core | r 110 | block |
| handprint (reactor panel) | 60×50 | wall |
| shield_emitter | r 70 | block |
| turret_seat | 120×120 | block |
| pilot_seat | 60×60 | block |
| bed | 150×70 | block |
| scanner_pad | r 55 | floor |
| sample_station | 130×60 | block |
| o2_tank | r 30 | block |
| tree | r 45 | block |
| plant_bed | w,h | block |
| electrical_box / wire_panel / keypad / dial_panel / light_panel | 80×60 / 60×40 / 50×50 / 70×50 / 90×60 | wall |
| fuel_tank | 80×90 | block |
| garbage_chute | 100×60 | wall |
| pipes | w×h | wall |
| locker | 60×30 | block |
| server_rack | 70×40 | block |
| radar_dish | r 60 | block |
| window | w×60 | wall |
| rug / hazard_floor | w×h | floor |
| dropship_seat | 60×60 | block |
| laptop | 60×40 | — |

Floor styles: `steel, white, dark, grate, carpet, wood, grass, hazard, concrete, blue, reactor, dropship, hall`.
Wall styles (optional per room, renderer decides colors): `metal, white, dark, green, blue, orange`.

## 3. Geometry (`js/core/geometry.js`) — owner: core

```js
const geo = AS.Geo.build(map);           // precomputes a 10-unit grid of floor cells, door cells, obstacles
geo.cols, geo.rows, geo.cell, geo.floor  // Uint8Array, 1 = floor
geo.isFloor(x, y)                        // ignores doors/obstacles
geo.isOpen(x, y)                         // floor and not a closed door (vision / LOS)
geo.canStand(x, y, r = PLAYER_RADIUS)    // circle on open floor, not overlapping block props
geo.move(x, y, dx, dy, r) -> {x, y}      // sliding collision, sub-stepped (no tunnelling)
geo.setDoors(closedDoorIds)              // array of door ids currently closed
geo.lineOfSight(x1, y1, x2, y2) -> bool  // walls + closed doors block; props don't
geo.castRay(x, y, angle, maxDist) -> dist
geo.visibility(x, y, radius, rays = 360) -> Float32Array [x0,y0,x1,y1,...]  // vision polygon
geo.roomAt(x, y) -> roomId | null
geo.findPath(x1, y1, x2, y2) -> [[x,y], ...] | null   // smoothed, walkable by a PLAYER_RADIUS circle; <5 ms typical
geo.nearestStandable(x, y) -> [x, y]
geo.randomPointInRoom(rng, roomId) -> [x, y]
geo.boundary() -> [{x1, y1, x2, y2, floor: 'n'|'s'|'e'|'w'}]  // merged wall edges; `floor` = side the floor is on
                                                               // (horizontal edge with floor:'s' = a NORTH wall → wall face)
```

## 4. Game simulation (`js/core/game.js`) — owner: core

```js
const game = new AS.Game({ mapId: 'caspian', settings, seed, isServer: false });
game.addPlayer({ id?, name, color?, hat?, isBot? }) -> player | null   // lobby only; auto-assigns a free color
game.addBot() -> player | null                                          // random unused name/color/hat
game.removePlayer(id)                       // lobby: removed; in game: marked left (alive=false, no body), tasks dropped, win re-checked
game.setRolePreference(id, 'crew'|'impostor'|null)   // honored at start when possible (offline)
game.applyAction(playerId, action) -> { ok: true } | { ok: false, err: 'code' }
game.tick(dt)                               // fixed step AS.T.TICK; runs timers, bots, win checks
game.drainEvents() -> [event]               // events since last drain
game.snapshotFor(viewerId) -> snapshot      // JSON-safe, filtered for that viewer
game.canSee(viewerId, x, y) -> bool         // vision radius + line of sight (dead viewers see all)
game.visionRadius(id) -> number
game.getPlayer(id); game.order /* ids in join order */; game.hostId; game.phase; game.time; game.map; game.geo; game.rng
```
Internal player: `{ id, name, color, hat, isBot, x, y, facing (1|-1), moving, tp, role, alive, left, tasks,
killCooldown, emergencyLeft, inVent, ventTime, scanning, holding, vote, input:{x,y} (bots), brain:{} (bots) }`.

### Actions (`applyAction`)
| action | who / when | effect |
|---|---|---|
| `{type:'move', x, y, facing, moving, tp}` | humans; lobby/playing; not in vent | client-authoritative position. Ignored if `tp !== player.tp`. Rejected (and `tp++` so the client resyncs) if the jump is implausible (> speed×elapsed×1.6+40) or not standable (alive). Ghosts fly freely inside map bounds. |
| `{type:'kill', target}` | impostor, alive, playing, cooldown 0, not in vent | target alive crew within `KILL_DIST[settings.killDistance]` + LOS → target dies, body left, **killer teleports onto the body** (`tp++`), cooldown = settings.killCooldown |
| `{type:'report', body}` | alive, within REPORT_RANGE + LOS | meeting |
| `{type:'emergency'}` | alive, within BUTTON_RANGE of map.button, `emergencyLeft>0`, no critical sabotage, ≥ emergencyCooldown since game start / last meeting | meeting |
| `{type:'vent', vent}` / `{type:'ventMove', to}` / `{type:'ventExit'}` | impostor alive; within VENT_RANGE to enter; `to` must be linked; 0.4 s between vent actions | `inVent`, position = vent (`tp++`), invisible to others |
| `{type:'sabotage', kind, room?}` | impostor (alive or dead), playing | lights/comms/reactor/o2: only if no active sabotage and sabotage cooldown 0. doors: `room` doors close DOOR_CLOSE_TIME, per-room DOOR_COOLDOWN, allowed during other sabotages. Players standing in a closing door are pushed out (`tp++`). |
| `{type:'fixPanel', panel, holding?}` | alive, within USE_RANGE of the panel, sabotage of that kind active | lights/comms: fixed. o2: that panel done; both done → fixed. reactor: `holding` true/false; fixed when both reactor panels are held at once (by 2 players). |
| `{type:'taskStart', task}` / `{type:'taskCancel', task}` | crew; visual 'scan' step | `scanning` on/off (visible to others if settings.visualTasks; auto-off after SCAN_TIME+2) |
| `{type:'taskComplete', task}` | crew (alive or ghost), within USE_RANGE of the current step's station | step++ ; task done when last step completes. Impostors (fake tasks) are rejected. |
| `{type:'vote', target}` | alive, meeting stage 'voting', once | `target` = player id or `'skip'`; all alive voted → results |
| `{type:'setLook', name?, color?, hat?}` | lobby (and ended) | color must be free (`err:'colorTaken'`); name trimmed to 12 chars |
| `{type:'settings', settings}` | host, lobby | `AS.sanitizeSettings` |
| `{type:'start'}` | host, lobby, ≥ MIN_PLAYERS | 3-s countdown (`countdown` events) → intro |
| `{type:'addBot'}` / `{type:'removeBot', id}` | host, lobby | |
| `{type:'returnLobby'}` | host, ended | back to lobby (bots stay, left players removed) |

### Rules
- Phases: `lobby → (countdown) → intro (INTRO_TIME) → playing ⇄ meeting → ejecting → playing | ended`.
- Start: impostors = min(settings.impostors, `AS.maxImpostorsFor(n)`). Everyone teleported to `spawns.meeting`.
  Tasks: same `commonTasks` common defs for everyone + random `longTasks` long + `shortTasks` short.
  Impostors get a fake list (`fake: true`). Kill cooldown = min(FIRST_KILL_COOLDOWN, killCooldown).
  Sabotage cooldown = SABOTAGE_START_COOLDOWN. `emergencyLeft = settings.emergencyMeetings`.
- Vision radius: crew `BASE_VISION × crewVision` (× LIGHTS_OFF_MULT while lights are out, min MIN_VISION);
  impostor `BASE_VISION × impostorVision` (unaffected by lights). Dead players: unlimited.
- Task progress = completed steps / total steps of all non-left crew (ghost crew keep doing tasks).
  Shown per settings.taskBarUpdates (`'meetings'` → only refreshed when a meeting starts); hidden (null) during comms sabotage.
- Meeting: everyone alive is teleported to `spawns.meeting`; bodies cleared; vents exited; critical sabotage
  (reactor/o2) cleared; doors opened; lights/comms persist. Stages: `intro` (MEETING_INTRO_TIME) → `discussion`
  (discussionTime) → `voting` (votingTime) → `results` (RESULTS_TIME) → phase `ejecting` (EJECT_TIME).
  Tally: most votes wins; tie for most → nobody; skip ≥ top → nobody. Missing votes = abstain.
  After ejecting: kill cooldowns = killCooldown, sabotage cooldown = SABOTAGE_START_COOLDOWN, emergency timer restarts.
- Win: crew if task progress reaches 1 or no impostors remain; impostors if alive impostors ≥ alive crew,
  or reactor/o2 timer hits 0. Checked continuously (after an ejection the end shows after the eject screen).
- Ghosts: no collision, can't report/vote/use button/fix sabotage; crew ghosts can do tasks; impostor ghosts can sabotage.

### Bot hooks (core calls these if `AS.Bots` exists)
- `AS.Bots.update(game, player, dt)` every tick for each bot. Bots move by setting `player.input = {x, y}`
  (unit-ish vector; core moves them with `geo.move`, same speed rules) and act via `game.applyAction(bot.id, action)`.
- `AS.Bots.onEvent(game, ev)` for every emitted event; `AS.Bots.onPhase(game, phase, prev)`.
- Bots must only use information they could legitimately know (use `game.canSee`).

### Events (`drainEvents`) — `to` (player id) means private to that player
`{type:'phase', phase, prev}` · `{type:'countdown', n}` · `{type:'join', player}` · `{type:'leave', player}` · `{type:'host', player}` ·
`{type:'kill', killer, victim, x, y}` · `{type:'meeting', caller, body /*id|null*/, emergency}` · `{type:'meetingStage', stage}` ·
`{type:'vote', voter}` · `{type:'eject', id /*|null*/, role /*|null*/, reason /*'vote'|'tie'|'skip'|'none'*/}` ·
`{type:'vent', player, vent, action:'enter'|'exit'|'move', x, y}` · `{type:'sabotage', kind, room?}` · `{type:'sabotageFixed', kind}` ·
`{type:'doors', room, closed}` · `{type:'taskStep', to, task, step, done}` · `{type:'scan', player, active}` ·
`{type:'gameEnd', winner, reason}` · `{type:'error', to, err}`

### Snapshot (`snapshotFor(viewerId)`)
```js
{
  v: 1, t, phase, mapId, hostId, you,
  timer,                 // seconds left in the current timed phase/stage (intro, meeting stage, ejecting) or lobby countdown; else null
  countdown,             // lobby start countdown number or null
  settings,              // full sanitized settings
  players: [ {           // ALL players, join order
    id, name, color, hat, isBot, isHost, alive, left,
    x, y, facing, moving,   // OMITTED when (viewer alive && player dead) or (player in a vent && player !== viewer)
    tp,                     // teleport counter
    role,                   // only: self; fellow impostors for an impostor viewer; everyone when phase 'ended'
    inVent,                 // self only (bool)
    scanning, voted,        // voted: during meeting
  } ],
  bodies: [ { id, x, y, color } ],
  self: { role, alive, visionRadius, killCooldown, emergencyLeft, emergencyCooldown /*s until usable*/,
          sabotageCooldown, doorCooldowns: {room: s}, inVent /*ventId|null*/, holding /*panelId|null*/,
          tasks: [ { id, def, nameKey, kind, fake, step, done,
                     steps: [ { station, game, room, nameKey } ] } ] },
  taskProgress,          // 0..1 or null (hidden)
  sabotage: null | { kind, timer /*critical only*/, panels: { panelId: { done, held } } },
  doors: { doorId: secondsLeft },          // closed doors only
  meeting: null | { caller, body, emergency, stage, timer, voted: [ids], myVote,
                    tally /*results stage only*/: { [playerId|'skip']: [voterId | null /*anonymous*/] } },
  ejection: null | { id, role /*null unless confirmEjects*/, reason, impostorsLeft /*null unless confirmEjects*/ },
  result: null | { winner: 'crew'|'impostor', reason, impostors: [ids] },
}
```

## 5. Network (`js/client/net.js`, `server/*`) — owner: app

Transports share one interface:
```js
tr.send(action); tr.update(dt) /* local only: runs fixed ticks */; tr.close();
tr.onSnapshot = (snap) => {}; tr.onEvents = (events) => {}; tr.onStatus = (s /*'connecting'|'open'|'closed'|'error'*/) => {};
new AS.LocalTransport({ game, myId })      // offline: game runs in the page; snapshot every tick
new AS.NetTransport({ url })               // tr.hello(profile); tr.create(); tr.join(code); tr.onRoom = ({code, you}) => {}; tr.onError = (key) => {}
```
WebSocket protocol (JSON text frames), path `/ws`:
client→server `{t:'hello', v, name, color, hat}` `{t:'create'}` `{t:'join', code}` `{t:'act', a: action}` `{t:'leave'}` ·
server→client `{t:'welcome', id}` `{t:'room', code, you}` `{t:'err', key}` `{t:'snap', s}` `{t:'ev', e: [events]}`.
Server: static files from the project root + rooms (4-letter codes, max 12, host = first human, host migrates,
room deleted when no humans), 30 Hz ticks, 15 Hz snapshots, events every tick, joining mid-game rejected
(`err.inProgress`). Listens on `PORT` (3000) / `HOST` (0.0.0.0) and prints LAN URLs.
**Tests must run the server with `HOST=127.0.0.1`** (avoids Windows firewall pop-ups).

## 6. Client app (`js/client/main.js`) — owner: app

```js
AS.App = {
  snap, prevSnap, myId, mode /* null|'local'|'online' */, map, geo /* client geo for prediction/vision */,
  view: { me: {x, y, facing, moving}, players: { [id]: {x, y, facing, moving} } /* smoothed, others */,
          cam: {x, y, zoom}, highlights: { station?, panel?, vent?, button?, console?, body?, target? }, time },
  profile: { name, color, hat }, prefs: { lang, master, sfx, music, showFps },
  on(name, fn), off(name, fn), emit(name, ...args),
  send(action),                      // to the transport (adds tp for moves)
  startOffline({ bots, impostors, role, botSkill }), startOnline({ url, code /*null = create*/ }), leave(),
  setScreen('menu'|'game'), me() /* my snapshot player */, isImpostor(),
  block(reason, on) /* stop movement while panels/overlays open */, isBlocked(),
  toast(text, ms), saveProfile(), savePrefs(), worldToScreen(x, y), screenToWorld(x, y),
  debug: { game, startNow(), meeting(), kill(id?), sabotage(kind), win(team), teleport(x, y), openTask(game) },
};
```
App events: `'boot'`, `'screen'(name)`, `'snapshot'(snap, prev)`, `'phase'(phase, prev, snap)`, `'event'(ev)` and
`'ev:<type>'(ev)`, `'frame'(dt, time)`, `'resize'(w, h)`, `'lang'(lang)`, `'status'(s)`, `'room'({code})`, `'error'(key)`.
main.js: boots modules in order (`AS.Audio.init()`, `AS.Renderer.init(App, canvas)`, `AS.Input.init(App)`,
`AS.HUD.init(App)`, `AS.UIMenu.init(App)`, `AS.UIFlow.init(App)`, each guarded), owns the rAF loop
(transport.update → own-movement prediction with `geo.move` → send `move` at 30 Hz → smooth others → emit 'frame'
→ `AS.Renderer.render(dt)`), applies `tp` resyncs, wires `AS.Tasks` hooks (onComplete → `taskComplete` or
`fixPanel`; onOpen/onClose → `App.block('task', …)`), closes task panels when a meeting starts / you die,
switches music, persists profile/prefs with `AS.util.store`, unlocks audio on first gesture.
Debug URL params: `?lang=en|az`, `?auto=1` (skip menu → offline game started immediately), `?bots=N`, `?imp=N`,
`?role=impostor|crew`, `?seed=N`, `?debug=1` (FPS + error overlay), `?scene=lobby|intro|meeting|voting|eject|end|map|sabotage`.

## 7. Client modules

**Art** (`AS.Art`) — characters. Design brief: a chubby, round **"star-naut"**: nearly circular egg body
(NOT a bean), large round dark-glass helmet visor with two glowing cute eyes and a white reflection, a short
antenna with a glowing bulb tinted from the body color, a compact jetpack with two nozzles on the back, two stubby
legs with a walk cycle, thick dark outline (#10131f), soft shading with the `shade` color.
```js
AS.Art.drawCharacter(ctx, x, y, { color, hat, facing = 1, scale = 1, t = 0, moving = false, alpha = 1, eyes = 'normal'|'happy'|'sad'|'x', outline: true })
AS.Art.drawBody(ctx, x, y, { color, scale, facing })        // dead: lying down, cracked visor, X eyes, bent antenna
AS.Art.drawGhost(ctx, x, y, { color, hat, facing, scale, t, alpha })  // translucent floating, wispy tail, bobbing
AS.Art.portrait(color, hat, size, { dead, eyes }) -> HTMLCanvasElement (cached)   // head-and-shoulders for UI
AS.Art.portraitURL(color, hat, size, opts) -> dataURL (cached)                    // for <img>
AS.Art.HAT_ANCHOR  // documented hat placement
```
All 16 hats in `AS.HATS` drawn procedurally (papaq = Azerbaijani papakha, nar = pomegranate). Anchor (x,y) = feet.

**Props** (`AS.Props`) — `draw(ctx, prop, t)` for every prop type above (world coords; ctx already in world
space; wall props drawn upward from `y`), `drawFloor(ctx, rect, style)` (cached patterns aligned to world
coords), `drawVent(ctx, x, y, open /*0..1*/, t)`, `footprintBottom(prop)` (y used for depth sorting).
Look: chunky, readable, Among-Us-like 3/4 cartoon art with outlines, subtle glows/blinking lights. Cache
static props to offscreen canvases where possible.

**Renderer** (`AS.Renderer`) — `init(App, canvas)`, `render(dt)`, `worldToScreen`, `screenToWorld`,
`drawMinimap(ctx, w, h, { markers, dots, me, labels, sabotageRooms, doorRooms })`, `renderCamera(ctx, w, h, cx, cy, viewW)`,
`shake(amount, time)`, `flash(color, time)`. Draws: starfield outside hull, floors, walls (3/4 north faces from
`geo.boundary()`), doors, floor decals, props/characters/bodies depth-sorted by y, vents (opening anim on `vent`
events), name tags, highlight outlines (`App.view.highlights`), scan effect, vision fog (soft-edged polygon from
`geo.visibility`, ~88% dark outside; others/bodies hidden outside vision; no fog in lobby/ended or when dead),
lights-out effect, kill/report/task particles. Zoom: `cssHeight / VIEW_HEIGHT` (`VIEW_HEIGHT_SMALL` on phones).

**Input** (`AS.Input`) — `init(App)`, `getMove() -> {x, y}` (WASD/arrows + virtual joystick on touch),
`on(action, fn)` for `'use'(E/Space) 'report'(R) 'kill'(Q) 'vent'(V) 'map'(Tab/M) 'sabotage' 'escape'(Esc)`, `isTouch()`.
Ignores keys while typing in inputs.

**HUD** (`AS.HUD`) — `init(App)`. In `#hud`: task list (top-left, collapsible; "Room: Task (1/3)", fake tasks for
impostors, ghost hint), total task bar, action buttons (USE / REPORT / KILL with cooldown / VENT / SABOTAGE / MAP,
disabled-state when not usable, contextual icon+label), room-name toast, sabotage alert banner + red pulsing edges
+ countdown, vent arrows to linked vents, settings gear (→ `AS.UIMenu.openSettings({inGame:true})`).
Overlays in `#modal-layer`: map (tasks yellow, sabotage red, you), impostor sabotage map (sabotage buttons + door
buttons per room with cooldowns), admin table (dot counts per room, disabled by comms), security cams (2×2 via
`AS.Renderer.renderCamera`, static noise during comms). Determines usable targets each frame and sets
`App.view.highlights`; opens mini-games via `AS.Tasks.open({ game, taskId, step, steps, stationId, room, panelId, sabotage, params })`.
Hidden in lobby except settings gear (menu owns lobby UI).

**Menu** (`AS.UIMenu`) — `init(App)`, `openSettings(opts)`, `openCustomize()`. Main menu (animated starfield +
floating characters + AI IMPOSTOR: SPACE SHIP logo), offline setup (bots 3–11, impostors, bot skill, preferred role),
online (server address when on file://, create room / join by code), customize (name, color grid with taken colors
disabled in lobby, hat grid, live preview), settings (language, volumes, FPS), how to play. **Lobby overlay**
(phase 'lobby'): room code + copy, player count, host's settings panel generated from `AS.SETTINGS_SCHEMA`,
add/remove bots, START (host; countdown), customize, leave.

**Flow** (`AS.UIFlow`) — `init(App)`. Role intro ("Şşş!" beat, then CREWMATE/IMPOSTOR reveal with team lineup),
meeting (splash EMERGENCY / BODY REPORTED with caller/body, then a voting tablet: player cards with portraits,
dead/left marks, "VOTED" stamps, vote by click/tap + confirm, SKIP, stage timers, results with voter chips),
ejection (space scene, ejected character tumbling across, typed text + impostors remaining), you-were-killed
overlay (killer's color), end screen (VICTORY/DEFEAT, winners lineup, reason, Play again / Lobby / Menu).

**Audio** (`AS.Audio`) — `init()`, `unlock()`, `play(name, {volume, rate})`, `loop(name)`, `stop(name)`,
`music(name|null)` (`'menu_music'|'ambient'|null`), `setVolumes({master, sfx, music})`. Names: `AS.SFX`, `AS.SFX_LOOPS`.
Safe no-ops before unlock / without WebAudio.

**Tasks** (`AS.Tasks`, see taskhost.js header) — each mini-game: `AS.Tasks.register(id, factory, {w, h})`,
registers `game.<id>.title` (+ any other strings), draws polished Among-Us-quality art on its canvas, works with
mouse AND touch, finishes by `ctx.complete()`. Long-running state survives close/reopen via `ctx.memory`.
`ctx.params.room` (divert_accept target room id) is provided. `scan`: `ctx.send({type:'taskStart', task: ctx.info.taskId})`
when scanning starts, `{type:'taskCancel', ...}` in `destroy()` if unfinished. Sabotage games: `fix_reactor`
uses `ctx.hold(true/false)` while the hand is pressed and reads `ctx.getState().sabotage.panels` to show the other
panel's status (never completes itself — the host auto-closes when the sabotage ends); `fix_o2` = keypad with a
random 5-digit code on a sticky note; `fix_lights` = 5 switches; `fix_comms` = tune a dial to match a waveform.

## 8. Visual style
Dark space theme. Tokens in `css/base.css` (`--cyan`, `--red`, `.btn--primary`, `.panel`, `.outline-text`, …).
Fonts: Fredoka (display) / Nunito (body), fallbacks in base.css. Chunky rounded buttons with a 3D bottom edge,
glassy panels, white outlined headline text, crew = cyan, impostor = red. Canvas text: use
`'700 20px Fredoka, Nunito, "Segoe UI", sans-serif'`. Must look great at 1280×720 and on a 844×390 phone.

## 9. Testing
- `node tools/shot.js <page.html?query> --out tools/out/<name>.png [--size WxH] [--mobile] [--wait ms] [--eval js] [--steps f.json]`
  → screenshot + console/page errors (exit 2 on page errors). **Look at your screenshots** (Read the PNG).
- Put scratch output in `tools/out/` (git-ignored scratch). Node tests: `node tools/<test>.js`.
- Mini-games: `tools/tasktest.html?game=<id>&lang=en` (`&sab=<kind>` for sabotage games).


## 10. AI IMPOSTOR rules, Q&A meetings and LLM services

**Roles.** Humans and NPC crew (`addBot` in the lobby) are always `crew`. The impostors are **AI players** (`player.isAI`),
created by `game.startGame()` on top of the lobby: `AS.aiNeededFor(nonAi)` so that the TOTAL matches `AS.aiCountFor(total)`:
5-6 players -> 1 AI, 7-9 -> 2, 10-12 -> 3 (lobby cap `T.MAX_LOBBY` = 9, match cap `T.MAX_PLAYERS` = 12, `MIN_PLAYERS` = 4 before AIs).
AIs know each other (impostor role) and are removed again by `returnToLobby()`. They never get a `join` event, and snapshots never contain
`isAI`; `isBot` is only visible in the lobby (NPCs) and is `false` for everyone once a match starts.

**Win.** AIs win when alive AIs >= alive crew, or on critical sabotage. Humans win when no AI is alive, or (setting `winByTasks`, default on)
when all tasks are done. Impostors never kill each other (not implemented; the design doc allows it).

**Settings** (`AS.SETTINGS_SCHEMA`): `aiLevel` 1-5 (disguise level, default 3), `winByTasks`, `qaRounds` (default 3), `answerTime` (seconds per turn, default 25).
`impostors` and `discussionTime` were removed.

**Meeting flow.** `intro -> discussion (Q&A) -> voting -> results`. `js/core/qa.js` (installed on `AS.Game.prototype`):
- `qaRounds` questions from `AS.QUESTIONS` (118: human-likeness questions + 16 match questions, no repeats per match; round 1 is a match question, e.g. "where were you?").
- Per question: random turn order of alive players; each answers ONCE within `answerTime`; silence -> `qaSkip`. After the last question voting opens.
- Action `{type:'answer', text}` (humans/agents, max 140 chars, stripped of markup, system prefixes and control chars). Errors: `notYourTurn`, `answered`, `empty`, `tooLong`, `rate`, `chatClosed`.
- Events: `qaQuestion {round, rounds, q:{az,en}, order}`, `qaTurn {player, round, seconds}`, `qaAnswer {player, text, order, round}`, `qaSkip {player, round}`. No event carries an author type.
- Snapshot `meeting.qa = {round, rounds, state, q, order, turn:{player,left}, answers, log, maxChars}` and `meeting.freeChat`.
- **Free chat** (`chat` action) works only when `game.freeChatOpen()`: AI level >= 3 AND the meeting was started by a body report (not the button), during discussion/voting. Levels 1-2 and emergency meetings are Q&A only.

**Bot answers.** NPC crew and AIs answer through `game._qaPlan`: provider text if available, otherwise `AS.Bots.qaLocal` (rule-based, uses what the bot saw). The text is restyled per level (`AS.AI_LEVELS`: typos, lowercase, missing final punctuation) and posted after a human-like delay (`AS.aiDelay`) with typing indicators, through the same code path as a human answer.
`game.aiProvider = { answer(ctx) -> Promise<{text, llmMs?, source?}|null> }` (set by the server; never in the browser). Failure, null or a hang (answer not planned by 65% of the turn) falls back to the local answer, so a turn can never get stuck.

**Server AI services** (`server/`, all optional, keys in `itb/.env`):
- `ai-chat.js` + `prompts/ai_chat_prompt.txt`: Gemini answers for AIs. Question and other players' text go in `<data>` blocks; private match facts (`AS.Bots.qaFacts`) include SECRET lines (allies, own kills, suggested alibi) that only the AI sees.
- `director.js`: Groq decides AI movement. It sees the ship graph and what the AI legitimately sees, and answers one JSON action (`goto, fake_task, follow, kill, vent, sabotage, wait`). Output is validated and stored as `brain.directive`; `bots.js` (`followDirective`) pathfinds, fakes tasks, kills (only without witnesses unless reckless), vents. When the model is slow, rate-limited or wrong, the built-in behaviour keeps running.
- `analytics.js`: `logs/chat.jsonl` (round answers with author type + level + delay + fallback flag; meeting results with votes per AI). `node tools/chat-summary.js` prints per-level stats.
- Hooks (server only): `game.hooks.qaAnswer / qaRound / meetingResult`.

**Tests.** `node tools/test-rules.js` (rules, Q&A, gating, provider, director), `node tools/test-net.js` (server + protocol), `node tools/sim.js 3 7 --chat` (headless bot games), `node tools/live-test.js` and `node tools/live-room.js` (real LLMs). `tools/test-core.js` is legacy: its fixtures assume human impostors, so several of its role-based tests fail by design.
