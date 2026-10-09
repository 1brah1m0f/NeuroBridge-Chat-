#!/usr/bin/env node
/* AI IMPOSTOR: SPACE SHIP — core tests: geometry (AS.Geo) + simulation (AS.Game).
 *   node tools/test-core.js            fixture tests + real-map smoke test (if js/core/map.js defines AS.MAPS.starship)
 *   node tools/test-core.js --verbose  also print every passing test
 * Exit code 1 on any failure. Real-map content problems are reported as warnings (map.js is owned by the map module).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const VERBOSE = process.argv.includes('--verbose');
const load = (rel) => require(path.join(ROOT, rel));
load('js/core/ns.js');
load('js/core/constants.js');
load('js/core/i18n.js');
let mapLoadError = null;
if (fs.existsSync(path.join(ROOT, 'js/core/map.js'))) {
  try { load('js/core/map.js'); } catch (e) { mapLoadError = e; }
}
load('js/core/geometry.js');
load('js/core/game.js');
const AS = globalThis.AS;
const T = AS.T;
const now = () => Number(process.hrtime.bigint()) / 1e6;

// ------------------------------------------------------------------ tiny harness
let passed = 0, failed = 0;
const failures = [], warnings = [];
let currentSection = '';
function section(name) { currentSection = name; console.log('\n== ' + name); }
function test(name, fn) {
  try {
    fn();
    passed++;
    if (VERBOSE) console.log('  ok   ' + name);
  } catch (e) {
    failed++;
    failures.push(currentSection + ' / ' + name);
    const msg = e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n        ') : String(e);
    console.log('  FAIL ' + name + '\n        ' + msg);
  }
}
function warn(msg) { warnings.push(msg); console.log('  WARN ' + msg); }
function assert(c, msg) { if (!c) throw new Error('assertion failed: ' + (msg || '')); }
function eq(a, b, msg) { if (a !== b) throw new Error((msg || 'eq') + ': expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || 'near') + ': expected ' + b + ' ±' + tol + ', got ' + a); }
function okRes(r, msg) { if (!r || r.ok !== true) throw new Error((msg || 'action') + ' should succeed, got ' + JSON.stringify(r)); }
function errRes(r, code, msg) { if (!r || r.ok !== false || r.err !== code) throw new Error((msg || 'action') + ' should fail with ' + code + ', got ' + JSON.stringify(r)); }

// ------------------------------------------------------------------ fixture map
const seatsAround = (cx, cy, rad, n) => Array.from({ length: n }, (_, i) => {
  const a = (i / n) * Math.PI * 2;
  return [Math.round(cx + Math.cos(a) * rad), Math.round(cy + Math.sin(a) * rad)];
});
const FIX = {
  id: 'testmap', nameKey: 'map.starship', width: 2400, height: 1700,
  rooms: [
    { id: 'messhall', nameKey: 'room.messhall', rect: [200, 200, 800, 600], floor: 'steel' },
    { id: 'reactor', nameKey: 'room.reactor', rect: [1400, 200, 700, 600], extra: [[1600, 800, 300, 200]], floor: 'reactor' },
    { id: 'electrical', nameKey: 'room.electrical', rect: [200, 1000, 600, 400], floor: 'dark' },
    { id: 'lobby', nameKey: 'room.lobby', rect: [1300, 1300, 700, 300], floor: 'dropship', lobby: true },
  ],
  halls: [
    { rect: [990, 400, 420, 160], floor: 'hall' },   // mess hall <-> reactor
    { rect: [400, 790, 160, 220], floor: 'hall' },   // mess hall <-> electrical
  ],
  props: [
    { type: 'table_round', x: 600, y: 500, r: 80, block: true, button: true, room: 'messhall' },
    { type: 'crate', x: 860, y: 680, w: 70, h: 70, block: true, room: 'messhall' },
    { type: 'barrel', x: 1750, y: 600, r: 28, block: true, room: 'reactor' },
    { type: 'console', x: 1750, y: 260, block: true, room: 'reactor' },        // default footprint 120x50
    { type: 'rug', x: 600, y: 500, w: 300, h: 200, floor: true },
    { type: 'monitor_wall', x: 600, y: 200, w: 260, h: 60, wall: true },
    { type: 'chair', x: 300, y: 700 },
  ],
  stations: [
    { id: 'st_mess', x: 300, y: 300, room: 'messhall' },
    { id: 'st_mess2', x: 900, y: 300, room: 'messhall' },
    { id: 'st_reac', x: 1900, y: 400, room: 'reactor' },
    { id: 'st_elec1', x: 300, y: 1300, room: 'electrical' },
    { id: 'st_elec2', x: 700, y: 1300, room: 'electrical' },
    { id: 'st_scan', x: 850, y: 450, room: 'messhall' },
  ],
  taskDefs: [
    { id: 'swipe', nameKey: 'task.swipe', kind: 'common', steps: [{ st: 'st_mess', game: 'swipe' }] },
    { id: 'wires', nameKey: 'task.wires', kind: 'common', steps: [{ st: ['st_elec1', 'st_elec2'], game: 'wires' }, { st: 'st_reac', game: 'wires' }] },
    { id: 'fuel', nameKey: 'task.fuel', kind: 'long', steps: [{ st: 'st_elec1', game: 'fuel' }, { st: 'st_reac', game: 'fuel' }] },
    { id: 'upload', nameKey: 'task.upload', kind: 'long', steps: [{ st: 'st_mess2', game: 'download' }, { st: 'st_reac', game: 'upload' }] },
    { id: 'scan', nameKey: 'task.scan', kind: 'short', visual: true, steps: [{ st: 'st_scan', game: 'scan' }] },
    { id: 'calib', nameKey: 'task.calib', kind: 'short', steps: [{ st: 'st_reac', game: 'calibrate' }] },
    { id: 'leaves', nameKey: 'task.leaves', kind: 'short', steps: [{ st: 'st_elec2', game: 'leaves' }] },
    { id: 'align', nameKey: 'task.align', kind: 'short', steps: [{ st: 'st_mess', game: 'align' }] },
  ],
  vents: [
    { id: 'v_mess', x: 900, y: 750, room: 'messhall', links: ['v_reac'] },
    { id: 'v_reac', x: 2000, y: 700, room: 'reactor', links: ['v_mess', 'v_elec'] },
    { id: 'v_elec', x: 700, y: 1100, room: 'electrical', links: ['v_reac'] },
  ],
  button: { x: 600, y: 500 },
  panels: [
    { id: 'pn_lights', kind: 'lights', x: 260, y: 1060, room: 'electrical', game: 'fix_lights' },
    { id: 'pn_comms', kind: 'comms', x: 940, y: 260, room: 'messhall', game: 'fix_comms' },
    { id: 'pn_o2a', kind: 'o2', x: 260, y: 740, room: 'messhall', game: 'fix_o2' },
    { id: 'pn_o2b', kind: 'o2', x: 740, y: 1340, room: 'electrical', game: 'fix_o2' },
    { id: 'pn_reac1', kind: 'reactor', x: 1460, y: 260, room: 'reactor', game: 'fix_reactor' },
    { id: 'pn_reac2', kind: 'reactor', x: 2040, y: 740, room: 'reactor', game: 'fix_reactor' },
  ],
  doors: [
    { id: 'd_reac', room: 'reactor', rect: [1400, 400, 20, 160], orient: 'v' },
    { id: 'd_elec', room: 'electrical', rect: [400, 990, 160, 20], orient: 'h' },
  ],
  cameras: [],
  consoles: [],
  spawns: {
    meeting: seatsAround(600, 500, 150, 12),
    lobby: [1400, 1500, 1600, 1700, 1800, 1900].flatMap((x) => [[x, 1380], [x, 1520]]),
  },
};
AS.MAPS = AS.MAPS || {};
AS.MAPS.testmap = FIX;

// ------------------------------------------------------------------ helpers
function newGame(settings, seed) { return new AS.Game({ mapId: 'testmap', settings, seed: seed == null ? 7 : seed }); }
function lobbyGame(n, settings, seed) {
  const g = newGame(settings, seed);
  g.addPlayer({ id: 'h1', name: 'Host', color: 'red' });
  if (n > 1) g.addPlayer({ id: 'h2', name: 'Second', color: 'blue' });
  for (let i = 2; i < n; i++) g.addBot();
  return g;
}
function run(g, sec) { const n = Math.round(sec / T.TICK); for (let i = 0; i < n; i++) g.tick(T.TICK); }
function runUntil(g, pred, maxSec) { const n = Math.round(maxSec / T.TICK); for (let i = 0; i < n; i++) { if (pred()) return true; g.tick(T.TICK); } return pred(); }
// Started game in phase 'playing'. imps: ids or order indexes that become impostors.
function setup(n, opts) {
  opts = opts || {};
  const g = lobbyGame(n, opts.settings, opts.seed);
  const ids = g.order.slice();
  const impIds = (opts.imps || ['h1']).map((x) => (typeof x === 'number' ? ids[x] : x));
  for (const id of ids) g.setRolePreference(id, impIds.includes(id) ? 'impostor' : 'crew');
  assert(g.startGame(), 'startGame');
  run(g, T.INTRO_TIME + 0.05);
  eq(g.phase, 'playing', 'phase after intro');
  g.drainEvents();
  return { g, ids, imp: impIds, crew: ids.filter((id) => !impIds.includes(id)) };
}
const P = (g, id) => g.getPlayer(id);
const evs = (list, type) => list.filter((e) => e.type === type);
const snapP = (snap, id) => snap.players.find((p) => p.id === id);
function finiteDeep(o, where) {
  if (typeof o === 'number') { if (!isFinite(o)) throw new Error('non-finite number at ' + where); return; }
  if (o === undefined) throw new Error('undefined at ' + where);
  if (Array.isArray(o)) { o.forEach((v, i) => finiteDeep(v, where + '[' + i + ']')); return; }
  if (o && typeof o === 'object') for (const k of Object.keys(o)) if (o[k] !== undefined) finiteDeep(o[k], where + '.' + k);
}
function pathWalkable(geo, x, y, path) {
  let px = x, py = y;
  for (const [qx, qy] of path) {
    if (!geo.segmentClear(px, py, qx, qy, T.PLAYER_RADIUS - 0.5)) return false;
    px = qx; py = qy;
  }
  return true;
}
function completeAllTasks(g, id) {
  const p = P(g, id);
  for (const t of p.tasks) {
    while (!t.done) {
      const st = g.stationById[t.steps[t.step].station];
      g.teleport(id, st.x, st.y);
      okRes(g.applyAction(id, { type: 'taskComplete', task: t.id }), 'taskComplete ' + t.id);
    }
  }
}

// ================================================================== GEOMETRY
section('Geometry (fixture)');
const geo = AS.Geo.build(FIX);

test('grid dimensions + floor cells', () => {
  eq(geo.cell, 10); eq(geo.cols, 240); eq(geo.rows, 170);
  assert(geo.floor instanceof Uint8Array && geo.floor.length === 240 * 170, 'floor array');
  assert(geo.isFloor(600, 300), 'mess hall floor');
  assert(geo.isFloor(1200, 480), 'hall floor');
  assert(!geo.isFloor(1200, 300), 'void between rooms');
  assert(geo.isFloor(1700, 900), 'room extra rect');
  assert(!geo.isFloor(-5, 300) && !geo.isFloor(99999, 1), 'outside grid');
  assert(geo.isFloor(200, 200) && !geo.isFloor(199.9, 200) && !geo.isFloor(1000, 300), 'rect edges are cell exact');
});

test('roomAt (rooms, extra, halls, void)', () => {
  eq(geo.roomAt(600, 300), 'messhall'); eq(geo.roomAt(1700, 900), 'reactor'); eq(geo.roomAt(500, 1200), 'electrical');
  eq(geo.roomAt(1200, 480), null); eq(geo.roomAt(1200, 300), null); eq(geo.roomAt(1500, 1400), 'lobby');
  eq(geo.roomAt(995, 450), 'messhall', 'hall/room overlap belongs to the room');
});

test('canStand: walls, round + rect + default-footprint props, non-blocking props', () => {
  assert(geo.canStand(220, 300), 'touching the west wall is allowed');
  assert(!geo.canStand(219, 300), 'overlapping the west wall');
  assert(!geo.canStand(600, 401), 'overlapping round table (r80)');
  assert(geo.canStand(600, 399), 'next to round table');
  assert(!geo.canStand(860, 735), 'overlapping crate');
  assert(geo.canStand(860, 736), 'touching crate bottom');
  assert(!geo.canStand(1750, 300), 'console default footprint blocks');
  assert(geo.canStand(1750, 306), 'below console footprint');
  assert(geo.canStand(300, 700), 'chair (no block flag) does not block');
  assert(geo.canStand(600, 230), 'wall prop does not block');
  assert(geo.canStand(1200, 480) && !geo.canStand(1200, 415), 'hall width respected');
  assert(!geo.canStand(NaN, 300) && !geo.canStand(300, Infinity), 'NaN safe');
  assert(geo.canStand(300, 300, 0) && !geo.canStand(1200, 300, 0), 'r = 0 is a point test');
});

test('move: flush against walls, sliding, no tunnelling', () => {
  let r = geo.move(300, 300, -200, 0);
  near(r.x, 220, 0.3, 'flush x'); eq(r.y, 300);
  r = geo.move(230, 300, -50, 50);
  near(r.x, 220, 0.3, 'slide x'); near(r.y, 350, 0.01, 'slide y');
  r = geo.move(970, 300, 600, 0);
  near(r.x, 980, 0.3, 'no tunnelling through a 400-unit void');
  r = geo.move(600, 300, 0, 300);
  assert(r.y <= 400.01 && r.y > 380, 'stops at the round table, got ' + r.y);
  r = geo.move(300, 300, 37, -21);
  near(r.x, 337, 1e-9); near(r.y, 279, 1e-9);
  r = geo.move(300, 300, 0, 0);
  eq(r.x, 300); eq(r.y, 300);
  for (let i = 0; i < 300; i++) {
    const a = (i / 300) * Math.PI * 2;
    const q = geo.move(600 + Math.cos(a) * 140, 500 + Math.sin(a) * 140, Math.cos(a + 2) * 900, Math.sin(a + 2) * 900);
    assert(geo.canStand(q.x, q.y), 'move result always standable');
  }
});

test('move: corner assist slides into a doorway when slightly misaligned', () => {
  // Hall to the reactor spans y 400..560 at x = 1000; a player at y = 412 needs y >= 420 to pass.
  let x = 960, y = 412;
  for (let i = 0; i < 30; i++) { const r = geo.move(x, y, 8, 0); x = r.x; y = r.y; }
  assert(x > 1100 && y >= 420, 'entered the hall, got ' + x.toFixed(1) + ',' + y.toFixed(1));
  // Pushing into a flat wall never drifts sideways.
  const r = geo.move(220, 500, -40, 0);
  near(r.x, 220, 0.3); eq(r.y, 500);
});

test('move: depenetrates a stuck start position', () => {
  const r = geo.move(600, 470, 5, 0);
  assert(geo.canStand(r.x, r.y), 'popped out of the table');
});

test('doors: setDoors / isOpen / canStand / LOS / isDoorClosed', () => {
  const g2 = AS.Geo.build(FIX);
  assert(g2 !== geo && g2.B === geo.B, 'static part shared, instance separate');
  assert(g2.lineOfSight(1300, 480, 1500, 480), 'open door: LOS');
  assert(g2.canStand(1410, 480), 'standing in the open doorway');
  assert(g2.setDoors(['d_reac']) === true, 'setDoors reports change');
  assert(g2.setDoors(['d_reac']) === false, 'no change');
  assert(g2.isDoorClosed('d_reac') && !g2.isDoorClosed('d_elec'), 'isDoorClosed');
  eq(g2.closedDoors().join(), 'd_reac');
  assert(!g2.isOpen(1405, 480) && g2.isFloor(1405, 480), 'door cell closed but still floor');
  assert(!g2.canStand(1410, 480) && !g2.canStand(1390, 480) && g2.canStand(1379, 480), 'closed door blocks');
  assert(!g2.lineOfSight(1300, 480, 1500, 480), 'closed door blocks LOS');
  assert(geo.lineOfSight(1300, 480, 1500, 480), 'other instance unaffected');
  const m = g2.move(1300, 480, 200, 0);
  assert(m.x <= 1380.01, 'cannot walk through closed door, got ' + m.x);
  eq(g2.doorAt(1405, 480), 'd_reac');
  g2.setDoors([]);
  assert(g2.canStand(1410, 480) && g2.isOpen(1405, 480), 'reopened');
});

test('castRay + lineOfSight', () => {
  near(geo.castRay(600, 300, Math.PI, 1000), 400, 1e-6, 'ray west to wall');
  near(geo.castRay(600, 300, -Math.PI / 2, 1000), 100, 1e-6, 'ray north to wall');
  near(geo.castRay(600, 300, 0, 50), 50, 1e-9, 'capped at maxDist');
  near(geo.castRay(300, 480, 0, 5000), 2100 - 300, 1e-6, 'through the hall to the reactor east wall');
  assert(geo.lineOfSight(300, 300, 900, 700), 'LOS across the room (props never block)');
  assert(!geo.lineOfSight(300, 300, 300, 1300), 'walls block LOS');
  assert(geo.lineOfSight(480, 700, 480, 1300), 'LOS through the hall');
  assert(!geo.lineOfSight(960, 380, 1060, 420), 'corner blocks LOS');
  assert(geo.lineOfSight(500, 500, 500, 500), 'zero length');
});

test('visibility polygon: shape, crisp corners, timing < 1.5 ms', () => {
  const poly = geo.visibility(600, 350, 330, 360);
  assert(poly instanceof Float32Array && poly.length >= 720 && poly.length % 2 === 0, 'Float32Array of pairs');
  for (let i = 0; i < poly.length; i += 2) {
    const d = Math.hypot(poly[i] - 600, poly[i + 1] - 350);
    assert(d <= 330.01, 'inside the radius');
    assert(poly[i] >= 199.99 && poly[i + 1] >= 199.99, 'never past the walls');
  }
  // Doorway corner (1000, 400) seen from the mess hall creates refined points right at the corner.
  const p2 = geo.visibility(800, 470, 900, 360);
  let best = Infinity;
  for (let i = 0; i < p2.length; i += 2) best = Math.min(best, Math.hypot(p2[i] - 1000, p2[i + 1] - 400));
  assert(best < 1, 'refined point within 1 unit of the doorway corner, got ' + best.toFixed(2));
  const N = 300;
  let t0 = now();
  for (let i = 0; i < N; i++) geo.visibility(300 + (i % 60) * 10, 260 + (i % 7) * 60, 330, 360);
  const ms = (now() - t0) / N;
  console.log('        visibility(330, 360 rays): ' + ms.toFixed(3) + ' ms avg');
  assert(ms < 1.5, 'visibility too slow: ' + ms.toFixed(3) + ' ms');
  t0 = now();
  for (let i = 0; i < 50; i++) geo.visibility(1200, 480, 1650, 360);
  console.log('        visibility(1650, 360 rays): ' + ((now() - t0) / 50).toFixed(3) + ' ms avg');
  eq(geo.visibility(NaN, 0, 300).length, 0, 'NaN origin');
});

test('findPath: reachable, walkable, smoothed; null when unreachable', () => {
  let t0 = now();
  const p = geo.findPath(300, 300, 1900, 600);
  const ms = now() - t0;
  assert(p && p.length >= 2, 'path mess hall -> reactor');
  const last = p[p.length - 1];
  eq(last[0], 1900); eq(last[1], 600);
  assert(pathWalkable(geo, 300, 300, p), 'every segment walkable by a player circle');
  assert(p.length <= 6, 'smoothed (got ' + p.length + ' points)');
  console.log('        findPath mess->reactor: ' + ms.toFixed(2) + ' ms, ' + p.length + ' waypoints');
  const p2 = geo.findPath(300, 300, 300, 1300);
  assert(p2 && pathWalkable(geo, 300, 300, p2), 'path to electrical through the hall');
  const direct = geo.findPath(300, 300, 400, 320);
  eq(direct.length, 1, 'direct line -> single waypoint');
  eq(geo.findPath(300, 300, 1500, 1400), null, 'lobby is disconnected');
  const g2 = AS.Geo.build(FIX);
  g2.setDoors(['d_reac']);
  eq(g2.findPath(300, 300, 1900, 600), null, 'closed door -> unreachable');
  g2.setDoors([]);
  assert(g2.findPath(300, 300, 1900, 600), 'reopened -> reachable');
  const p3 = geo.findPath(300, 300, 600, 500); // goal inside the table -> nearest standable
  assert(p3 && geo.canStand(p3[p3.length - 1][0], p3[p3.length - 1][1]), 'unstandable goal snapped');
  const p4 = geo.findPath(600, 470, 300, 300); // start inside the table
  assert(p4 && geo.canStand(p4[0][0], p4[0][1]), 'unstandable start snapped');
  eq(geo.findPath(NaN, 1, 2, 3), null, 'NaN safe');
  t0 = now();
  for (let i = 0; i < 100; i++) geo.findPath(250 + (i % 5) * 100, 250 + (i % 3) * 100, 2000 - (i % 4) * 100, 300 + (i % 6) * 80);
  const avg = (now() - t0) / 100;
  console.log('        findPath avg (fixture): ' + avg.toFixed(2) + ' ms');
  assert(avg < 5, 'findPath too slow');
});

test('nearestStandable + randomPointInRoom', () => {
  const p = geo.nearestStandable(600, 500);
  assert(geo.canStand(p[0], p[1]), 'standable');
  near(Math.hypot(p[0] - 600, p[1] - 500), 100, 3, 'just outside the table');
  const q = geo.nearestStandable(1200, 300);
  assert(geo.canStand(q[0], q[1]) && Math.hypot(q[0] - 1200, q[1] - 300) < 140, 'from the void to the nearest floor');
  const w = geo.nearestStandable(-500, -500);
  assert(geo.canStand(w[0], w[1]), 'from outside the map');
  const rng = AS.util.rng(3);
  for (const room of ['messhall', 'reactor', 'electrical', 'lobby']) {
    for (let i = 0; i < 40; i++) {
      const pt = geo.randomPointInRoom(rng, room);
      assert(pt && geo.canStand(pt[0], pt[1]) && geo.roomAt(pt[0], pt[1]) === room, 'random point in ' + room);
    }
  }
  eq(geo.randomPointInRoom(rng, 'nope'), null);
});

test('boundary: merged edges with floor sides', () => {
  const edges = geo.boundary();
  assert(Array.isArray(edges) && edges.length > 10, 'edges');
  const has = (x1, y1, x2, y2, f) => edges.some((e) => e.x1 === x1 && e.y1 === y1 && e.x2 === x2 && e.y2 === y2 && e.floor === f);
  assert(has(200, 200, 1000, 200, 's'), 'mess hall north wall (floor south)');
  assert(has(200, 200, 200, 800, 'e'), 'mess hall west wall (floor east)');
  assert(has(1400, 1300, 2000, 1300, 's'), 'lobby north wall');
  assert(has(1600, 1000, 1900, 1000, 'n'), 'reactor extra south wall (floor north)');
  assert(has(1000, 200, 1000, 400, 'w') && has(1000, 560, 1000, 800, 'w'), 'mess hall east wall split by the hall');
  for (const e of edges) assert((e.x1 === e.x2) !== (e.y1 === e.y2) && (e.x1 < e.x2 || e.y1 < e.y2), 'axis aligned, ordered');
  // No two collinear edges of the same type touch (maximal merge).
  const key = (e) => e.floor + (e.x1 === e.x2 ? 'v' + e.x1 : 'h' + e.y1);
  const groups = {};
  for (const e of edges) (groups[key(e)] = groups[key(e)] || []).push(e);
  for (const k in groups) {
    const g = groups[k].sort((a, b) => a.x1 - b.x1 || a.y1 - b.y1);
    for (let i = 1; i < g.length; i++) assert(!(g[i].x1 === g[i - 1].x2 && g[i].y1 === g[i - 1].y2), 'unmerged edges at ' + k);
  }
});

// ================================================================== GAME: LOBBY
section('Game: lobby');

test('construct, host = first human, colors unique, names trimmed', () => {
  const g = newGame();
  eq(g.phase, 'lobby'); eq(g.map, FIX); assert(g.geo && typeof g.rng === 'function', 'geo + rng');
  const b0 = g.addBot();
  eq(g.hostId, null, 'bots never host');
  const a = g.addPlayer({ id: 'h1', name: '  Kapitan Uzunadlı Oyunçu  ', color: 'red', hat: 'crown' });
  eq(a.name, 'Kapitan Uzun'); eq(a.color, b0.color === 'red' ? a.color : 'red'); eq(a.hat, 'crown');
  eq(g.hostId, 'h1');
  const b = g.addPlayer({ id: 'h2', name: 'B', color: a.color, hat: 'nope' });
  assert(b.color !== a.color, 'taken color replaced'); eq(b.hat, 'none');
  eq(g.addPlayer({ id: 'h2', name: 'dup' }), null, 'duplicate id');
  const c = g.addPlayer({ name: '' });
  assert(c && typeof c.id === 'string' && c.name.length > 0, 'auto id + default name');
  const colors = g.list().map((p) => p.color);
  eq(new Set(colors).size, colors.length, 'colors unique');
  const ev = g.drainEvents();
  eq(evs(ev, 'join').length, 4); eq(evs(ev, 'host').length, 1); eq(evs(ev, 'host')[0].player, 'h1');
  for (const p of g.list()) {
    assert(g.geo.canStand(p.x, p.y) && g.geo.roomAt(p.x, p.y) === 'lobby', 'lobby spawn for ' + p.name);
  }
});

test('addBot names/colors/hats, max players, removeBot, host-only actions', () => {
  const g = lobbyGame(2);
  errRes(g.applyAction('h2', { type: 'addBot' }), 'notHost');
  for (let i = 0; i < 10; i++) okRes(g.applyAction('h1', { type: 'addBot' }));
  eq(g.order.length, 12);
  errRes(g.applyAction('h1', { type: 'addBot' }), 'full');
  eq(g.addPlayer({ name: 'late' }), null, 'room full');
  const bots = g.list().filter((p) => p.isBot);
  eq(bots.length, 10);
  for (const b of bots) assert(AS.BOT_NAMES.includes(b.name) && AS.HATS.includes(b.hat) && b.isBot, 'bot look');
  eq(new Set(g.list().map((p) => p.name)).size, 12, 'bot names unique');
  eq(new Set(g.list().map((p) => p.color)).size, 12, 'colors unique');
  errRes(g.applyAction('h1', { type: 'removeBot', id: 'h2' }), 'target', 'cannot remove humans');
  okRes(g.applyAction('h1', { type: 'removeBot', id: bots[3].id }));
  eq(g.getPlayer(bots[3].id), null); eq(g.order.length, 11);
  const ev = g.drainEvents();
  assert(evs(ev, 'leave').some((e) => e.player === bots[3].id), 'leave event');
  assert(evs(ev, 'error').some((e) => e.to === 'h2' && e.err === 'notHost'), 'private error event');
});

test('setLook: color taken / free, name, hat, phase', () => {
  const g = lobbyGame(4);
  errRes(g.applyAction('h2', { type: 'setLook', color: 'red' }), 'colorTaken');
  const ev = g.drainEvents();
  assert(evs(ev, 'error').some((e) => e.to === 'h2' && e.err === 'colorTaken'), 'error event');
  okRes(g.applyAction('h2', { type: 'setLook', color: 'lime', name: '  Nərgiz  ', hat: 'papaq' }));
  const p = P(g, 'h2');
  eq(p.color, 'lime'); eq(p.name, 'Nərgiz'); eq(p.hat, 'papaq');
  errRes(g.applyAction('h2', { type: 'setLook', color: 'magenta' }), 'badColor');
  okRes(g.applyAction('h2', { type: 'setLook', color: 'lime' }), 'own color is fine');
  g.startGame();
  errRes(g.applyAction('h2', { type: 'setLook', name: 'x' }), 'phase');
});

test('settings: host only, sanitized, merged', () => {
  const g = lobbyGame(4);
  errRes(g.applyAction('h2', { type: 'settings', settings: { impostors: 3 } }), 'notHost');
  okRes(g.applyAction('h1', { type: 'settings', settings: { impostors: 9, killCooldown: 21.3, killDistance: 'long', taskBarUpdates: 'bogus' } }));
  eq(g.settings.impostors, 3); eq(g.settings.killCooldown, 22.5); eq(g.settings.killDistance, 'long'); eq(g.settings.taskBarUpdates, 'always');
  okRes(g.applyAction('h1', { type: 'settings', settings: { votingTime: 30 } }));
  eq(g.settings.impostors, 3, 'partial update keeps other values'); eq(g.settings.votingTime, 30);
  const snap = g.snapshotFor('h1');
  eq(snap.settings.votingTime, 30); eq(Object.keys(snap.settings).length, AS.SETTINGS_SCHEMA.length);
});

test('host migration (lobby + in game)', () => {
  const g = lobbyGame(5);
  g.addPlayer({ id: 'h3', name: 'Third' });
  g.drainEvents();
  g.removePlayer('h1');
  eq(g.hostId, 'h2');
  const ev = g.drainEvents();
  assert(evs(ev, 'host').some((e) => e.player === 'h2'), 'host event');
  okRes(g.applyAction('h2', { type: 'addBot' }));
  g.startGame();
  g.removePlayer('h2');
  eq(g.hostId, 'h3', 'migrates in game');
  eq(P(g, 'h2').left, true);
  g.removePlayer('h3');
  eq(g.hostId, null, 'no humans left');
});

test('lobby movement + move validation (tp, plausibility, walls)', () => {
  const g = lobbyGame(4);
  const p = P(g, 'h1');
  const tp0 = p.tp, x0 = p.x, y0 = p.y;
  run(g, 0.2);
  okRes(g.applyAction('h1', { type: 'move', x: x0 + 30, y: y0, facing: -1, moving: true, tp: tp0 }));
  eq(p.x, x0 + 30); eq(p.facing, -1); eq(p.moving, true);
  errRes(g.applyAction('h1', { type: 'move', x: x0 + 40, y: y0, tp: tp0 - 1 }), 'stale');
  eq(p.tp, tp0, 'stale move does not bump tp');
  errRes(g.applyAction('h1', { type: 'move', x: x0 + 700, y: y0, tp: tp0 }), 'implausible');
  eq(p.tp, tp0 + 1, 'implausible move bumps tp'); eq(p.x, x0 + 30, 'position kept');
  run(g, 0.5);
  errRes(g.applyAction('h1', { type: 'move', x: p.x, y: 1295, tp: p.tp }), 'blocked');
  eq(p.tp, tp0 + 2, 'unstandable move bumps tp');
  errRes(g.applyAction('h1', { type: 'move', x: NaN, y: 1, tp: p.tp }), 'badAction');
  const b = g.list().find((q) => q.isBot);
  errRes(g.applyAction(b.id, { type: 'move', x: b.x, y: b.y, tp: b.tp }), 'bot');
});

test('start: needPlayers, countdown 3-2-1, intro, role counts, tasks, seats', () => {
  const g3 = lobbyGame(3);
  const r = g3.applyAction('h1', { type: 'start' });
  errRes(r, 'needPlayers'); eq(r.n, T.MIN_PLAYERS);
  assert(evs(g3.drainEvents(), 'error').some((e) => e.err === 'needPlayers' && e.n === T.MIN_PLAYERS), 'needPlayers event');

  const g = lobbyGame(9, { impostors: 3, commonTasks: 2, longTasks: 1, shortTasks: 3 });
  errRes(g.applyAction('h2', { type: 'start' }), 'notHost');
  g.setRolePreference('h2', 'impostor');
  g.setRolePreference('h1', 'crew');
  okRes(g.applyAction('h1', { type: 'start' }));
  errRes(g.applyAction('h1', { type: 'start' }), 'busy');
  eq(g.countdown, 3);
  let snap = g.snapshotFor('h1');
  eq(snap.countdown, 3); eq(snap.timer, 3); eq(snap.phase, 'lobby');
  const seen = [];
  for (let i = 0; i < 120 && g.phase === 'lobby'; i++) { g.tick(T.TICK); for (const e of g.drainEvents()) if (e.type === 'countdown') seen.push(e.n); }
  eq(seen.join(), '2,1');
  eq(g.phase, 'intro');
  const all = g.list();
  const imps = all.filter((p) => p.role === 'impostor');
  eq(imps.length, 3, 'impostors = min(settings, maxImpostorsFor(9))');
  eq(P(g, 'h2').role, 'impostor', 'preference honored'); eq(P(g, 'h1').role, 'crew');
  for (const p of all) {
    eq(p.tasks.length, 6, 'task count'); assert(g.geo.canStand(p.x, p.y), 'seat standable');
    eq(g.geo.roomAt(p.x, p.y), 'messhall', 'seated in the mess hall');
    eq(p.emergencyLeft, g.settings.emergencyMeetings);
    eq(p.killCooldown, p.role === 'impostor' ? Math.min(T.FIRST_KILL_COOLDOWN, g.settings.killCooldown) : 0);
    for (const t of p.tasks) eq(t.fake, p.role === 'impostor', 'fake flag');
  }
  const commonSig = (p) => p.tasks.filter((t) => t.kind === 'common').map((t) => t.def + ':' + t.steps.map((s) => s.station).join('/')).join(',');
  eq(new Set(all.map(commonSig)).size, 1, 'common tasks shared (same defs + stations)');
  eq(all[0].tasks.filter((t) => t.kind === 'common').length, 2);
  eq(new Set(all.map((p) => p.x + ',' + p.y)).size, all.length, 'distinct seats');
  const s0 = all[0].tasks[0].steps[0];
  assert(s0.station && s0.game && s0.room && s0.nameKey, 'step fields');
  snap = g.snapshotFor('h1');
  eq(snap.phase, 'intro'); near(snap.timer, T.INTRO_TIME, 0.11);
  run(g, T.INTRO_TIME + 0.05);
  eq(g.phase, 'playing');
  eq(g.snapshotFor('h1').timer, null);

  const g4 = lobbyGame(4, { impostors: 3 });
  g4.startGame();
  eq(g4.list().filter((p) => p.role === 'impostor').length, 1, 'clamped to maxImpostorsFor(4)');
});

test('countdown cancelled when players drop below the minimum', () => {
  const g = lobbyGame(4);
  okRes(g.applyAction('h1', { type: 'start' }));
  g.removePlayer(g.order[3]);
  eq(g.countdown, null);
  run(g, 4);
  eq(g.phase, 'lobby');
});

// ================================================================== GAME: PLAY
section('Game: kills, reports, meetings, votes');

test('kill: cooldown, role, range, LOS, teleport onto body, cooldown reset', () => {
  const { g, crew } = setup(8, { imps: ['h1', 2] });
  const imp = P(g, 'h1'), c = P(g, 'h2');
  g.teleport('h1', 600, 300); g.teleport('h2', 700, 300);
  errRes(g.applyAction('h1', { type: 'kill', target: 'h2' }), 'cooldown');
  run(g, T.FIRST_KILL_COOLDOWN + 0.1);
  eq(imp.killCooldown, 0);
  errRes(g.applyAction('h2', { type: 'kill', target: crew[1] }), 'notImpostor');
  errRes(g.applyAction('h1', { type: 'kill', target: g.order[2] }), 'target', 'fellow impostor');
  errRes(g.applyAction('h1', { type: 'kill', target: 'nobody' }), 'target');
  g.teleport('h2', 600 + 141, 300);
  errRes(g.applyAction('h1', { type: 'kill', target: 'h2' }), 'range');
  g.teleport('h1', 960, 380); g.teleport('h2', 1060, 420);
  errRes(g.applyAction('h1', { type: 'kill', target: 'h2' }), 'los');
  g.teleport('h1', 600, 300); g.teleport('h2', 700, 300);
  const tp = imp.tp;
  g.drainEvents();
  okRes(g.applyAction('h1', { type: 'kill', target: 'h2' }));
  eq(c.alive, false); eq(imp.x, 700); eq(imp.y, 300); eq(imp.tp, tp + 1, 'killer tp++');
  eq(imp.killCooldown, g.settings.killCooldown);
  eq(g.bodies.length, 1); eq(g.bodies[0].id, 'h2'); eq(g.bodies[0].color, c.color);
  const ke = evs(g.drainEvents(), 'kill')[0];
  assert(ke && ke.killer === 'h1' && ke.victim === 'h2' && ke.x === 700 && ke.y === 300, 'kill event');
  errRes(g.applyAction('h1', { type: 'kill', target: crew[1] }), 'cooldown');
  errRes(g.applyAction('h2', { type: 'report', body: 'h2' }), 'dead', 'ghosts cannot report');
});

test('ghost visibility in snapshots + ghost flight', () => {
  const { g, crew } = setup(6);
  const victim = crew[0];
  g.teleport('h1', 600, 300); g.teleport(victim, 700, 300);
  run(g, T.FIRST_KILL_COOLDOWN + 0.1);
  okRes(g.applyAction('h1', { type: 'kill', target: victim }));
  const aliveView = snapP(g.snapshotFor(crew[1]), victim);
  assert(aliveView.x === undefined && aliveView.alive === false, 'alive viewers do not get ghost positions');
  const selfView = snapP(g.snapshotFor(victim), victim);
  eq(selfView.x, 700, 'ghost sees itself');
  assert(snapP(g.snapshotFor(victim), crew[1]).x !== undefined, 'ghost sees the living');
  eq(g.snapshotFor(victim).self.visionRadius, AS.Game.UNLIMITED_VISION);
  assert(g.canSee(victim, 2300, 1650), 'dead viewers see everything');
  // h2 is a human crew member: kill h2 too and fly through a wall
  g.teleport('h2', 650, 260);
  P(g, 'h1').killCooldown = 0;
  okRes(g.applyAction('h1', { type: 'kill', target: 'h2' }));
  const h2 = P(g, 'h2');
  run(g, 0.5);
  okRes(g.applyAction('h2', { type: 'move', x: 650, y: 100, tp: h2.tp }), 'ghost flies over the void');
  run(g, 0.5);
  okRes(g.applyAction('h2', { type: 'move', x: -50, y: 100, tp: h2.tp }));
  eq(h2.x, 0, 'clamped to map bounds');
});

test('report -> meeting: seats, bodies cleared, stages, votes, majority ejection', () => {
  const { g, crew } = setup(8, { imps: ['h1', 2], settings: { discussionTime: 15, votingTime: 30 } });
  run(g, T.FIRST_KILL_COOLDOWN + 0.1);
  const victim = crew[2];
  g.teleport('h1', 600, 300); g.teleport(victim, 700, 300);
  okRes(g.applyAction('h1', { type: 'kill', target: victim }));
  g.teleport('h2', 450, 260);
  errRes(g.applyAction('h2', { type: 'report', body: victim }), 'range');
  g.teleport('h2', 650, 330);
  g.drainEvents();
  okRes(g.applyAction('h2', { type: 'report', body: victim }));
  eq(g.phase, 'meeting'); eq(g.bodies.length, 0, 'bodies cleared');
  let ev = g.drainEvents();
  const me = evs(ev, 'meeting')[0];
  assert(me && me.caller === 'h2' && me.body === victim && me.emergency === false, 'meeting event');
  assert(evs(ev, 'meetingStage')[0].stage === 'intro', 'intro stage event');
  for (const p of g.list()) if (p.alive) eq(g.geo.roomAt(p.x, p.y), 'messhall', 'alive players seated');
  let snap = g.snapshotFor('h2');
  eq(snap.meeting.stage, 'intro'); eq(snap.meeting.body, victim); eq(snap.meeting.tally, null);
  errRes(g.applyAction('h2', { type: 'vote', target: 'h1' }), 'stage');
  run(g, T.MEETING_INTRO_TIME + 0.05);
  eq(g.meeting.stage, 'discussion');
  run(g, 15);
  eq(g.meeting.stage, 'voting');
  errRes(g.applyAction(victim, { type: 'vote', target: 'h1' }), 'dead');
  errRes(g.applyAction('h2', { type: 'vote', target: victim }), 'target', 'cannot vote for the dead');
  // 4 votes h1, 1 skip, 1 vote h2; one abstains
  const alive = g.list().filter((p) => p.alive).map((p) => p.id);
  eq(alive.length, 7);
  const voters = alive.filter((id) => id !== 'h1');
  okRes(g.applyAction(voters[0], { type: 'vote', target: 'h1' }));
  errRes(g.applyAction(voters[0], { type: 'vote', target: 'skip' }), 'voted');
  okRes(g.applyAction(voters[1], { type: 'vote', target: 'h1' }));
  okRes(g.applyAction(voters[2], { type: 'vote', target: 'h1' }));
  okRes(g.applyAction(voters[3], { type: 'vote', target: 'h1' }));
  okRes(g.applyAction(voters[4], { type: 'vote', target: 'skip' }));
  okRes(g.applyAction('h1', { type: 'vote', target: 'h2' }));
  snap = g.snapshotFor('h2');
  eq(snap.meeting.voted.length, 6); eq(snap.meeting.myVote, voters.indexOf('h2') >= 0 && voters.indexOf('h2') <= 3 ? 'h1' : snap.meeting.myVote);
  eq(snapP(snap, voters[0]).voted, true); eq(snapP(snap, voters[5]).voted, false);
  eq(snap.meeting.tally, null, 'no tally before results');
  ev = g.drainEvents();
  eq(evs(ev, 'vote').length, 6);
  run(g, 30);
  eq(g.meeting.stage, 'results');
  snap = g.snapshotFor('h2');
  eq(snap.meeting.tally.h1.length, 4); eq(snap.meeting.tally.skip.length, 1); eq(snap.meeting.tally.h2.length, 1);
  run(g, T.RESULTS_TIME + 0.05);
  eq(g.phase, 'ejecting');
  ev = g.drainEvents();
  const ej = evs(ev, 'eject')[0];
  assert(ej && ej.id === 'h1' && ej.role === 'impostor' && ej.reason === 'vote', 'eject event ' + JSON.stringify(ej));
  snap = g.snapshotFor('h2');
  eq(snap.ejection.id, 'h1'); eq(snap.ejection.role, 'impostor'); eq(snap.ejection.impostorsLeft, 1); eq(snap.meeting, null);
  near(snap.timer, T.EJECT_TIME, 0.11);
  eq(P(g, 'h1').alive, false);
  P(g, g.order[2]).killCooldown = 3;
  run(g, T.EJECT_TIME + 0.05);
  eq(g.phase, 'playing');
  eq(P(g, g.order[2]).killCooldown, g.settings.killCooldown, 'kill cooldown reset after ejection');
  eq(g.sabotageCooldown, T.SABOTAGE_START_COOLDOWN);
  eq(g.emergencyTimer, g.settings.emergencyCooldown);
});

test('tally rules: tie, skip >= top, no votes, anonymous votes', () => {
  const O = AS.Game.tallyOutcome;
  eq(O({ a: [1, 2], b: [3] }).id, 'a');
  eq(O({ a: [1, 2], b: [3, 4] }).reason, 'tie');
  eq(O({ a: [1, 2], skip: [3, 4] }).reason, 'skip');
  eq(O({ a: [1, 2], skip: [3, 4, 5] }).reason, 'skip');
  eq(O({ a: [1, 2, 3], skip: [4, 5] }).id, 'a');
  eq(O({ skip: [1] }).reason, 'skip');
  eq(O({}).reason, 'none');
  const { g } = setup(6, { settings: { discussionTime: 0, anonymousVotes: true, confirmEjects: false } });
  g.teleport('h2', 600, 380);
  run(g, g.settings.emergencyCooldown + 0.1);
  okRes(g.applyAction('h2', { type: 'emergency' }));
  run(g, T.MEETING_INTRO_TIME + 0.05);
  eq(g.meeting.stage, 'voting', 'discussionTime 0 skips discussion');
  const ids = g.list().map((p) => p.id);
  okRes(g.applyAction(ids[0], { type: 'vote', target: ids[2] }));
  okRes(g.applyAction(ids[1], { type: 'vote', target: ids[2] }));
  okRes(g.applyAction(ids[2], { type: 'vote', target: ids[3] }));
  okRes(g.applyAction(ids[3], { type: 'vote', target: ids[3] }));
  okRes(g.applyAction(ids[4], { type: 'vote', target: 'skip' }));
  okRes(g.applyAction(ids[5], { type: 'vote', target: 'skip' }));
  eq(g.meeting.stage, 'results', 'all voted -> results immediately');
  const snap = g.snapshotFor(ids[0]);
  eq(snap.meeting.tally[ids[2]].join(), ',', 'anonymous voters are null');
  run(g, T.RESULTS_TIME + 0.05);
  const ej = g.snapshotFor(ids[0]).ejection;
  eq(ej.id, null); eq(ej.reason, 'tie'); eq(ej.role, null); eq(ej.impostorsLeft, null);
});

test('emergency: range, cooldown, uses, critical sabotage block', () => {
  const { g } = setup(6, { settings: { emergencyMeetings: 1, emergencyCooldown: 15, discussionTime: 0 } });
  g.teleport('h2', 600, 380);
  errRes(g.applyAction('h2', { type: 'emergency' }), 'cooldown');
  eq(g.snapshotFor('h2').self.emergencyCooldown, 15);
  run(g, 15.1);
  g.teleport('h2', 300, 300);
  errRes(g.applyAction('h2', { type: 'emergency' }), 'range');
  g.teleport('h2', 600, 380);
  g.startSabotage('reactor');
  errRes(g.applyAction('h2', { type: 'emergency' }), 'critical');
  g.fixSabotage();
  okRes(g.applyAction('h2', { type: 'emergency' }));
  eq(P(g, 'h2').emergencyLeft, 0);
  const me = evs(g.drainEvents(), 'meeting')[0];
  assert(me.emergency === true && me.body === null && me.caller === 'h2', 'emergency meeting event');
  run(g, T.MEETING_INTRO_TIME + g.settings.votingTime + T.RESULTS_TIME + T.EJECT_TIME + 0.5);
  eq(g.phase, 'playing');
  g.teleport('h2', 600, 380);
  run(g, 15.1);
  errRes(g.applyAction('h2', { type: 'emergency' }), 'noUses');
});

section('Game: vents, sabotage, doors');

test('vents: enter / move / exit, links, cooldown, invisibility', () => {
  const { g } = setup(6);
  g.teleport('h2', 950, 740);
  errRes(g.applyAction('h2', { type: 'vent', vent: 'v_mess' }), 'notImpostor');
  g.teleport('h1', 400, 300);
  errRes(g.applyAction('h1', { type: 'vent', vent: 'v_mess' }), 'range');
  g.teleport('h1', 950, 740);
  const tp = P(g, 'h1').tp;
  g.drainEvents();
  okRes(g.applyAction('h1', { type: 'vent', vent: 'v_mess' }));
  const p = P(g, 'h1');
  eq(p.inVent, 'v_mess'); eq(p.x, 900); eq(p.y, 750); eq(p.tp, tp + 1);
  const ve = evs(g.drainEvents(), 'vent')[0];
  assert(ve.player === 'h1' && ve.vent === 'v_mess' && ve.action === 'enter' && ve.x === 900, 'vent event');
  const other = snapP(g.snapshotFor('h2'), 'h1');
  assert(other.x === undefined && other.inVent === undefined, 'invisible to others in a vent');
  const own = g.snapshotFor('h1');
  eq(snapP(own, 'h1').inVent, true); eq(snapP(own, 'h1').x, 900); eq(own.self.inVent, 'v_mess');
  assert(!g.canSeePlayer('h2', 'h1'), 'canSeePlayer false while venting');
  errRes(g.applyAction('h1', { type: 'ventMove', to: 'v_reac' }), 'cooldown');
  run(g, 0.45);
  errRes(g.applyAction('h1', { type: 'ventMove', to: 'v_elec' }), 'notLinked');
  errRes(g.applyAction('h1', { type: 'move', x: 905, y: 750, tp: p.tp }), 'inVent');
  okRes(g.applyAction('h1', { type: 'ventMove', to: 'v_reac' }));
  eq(p.inVent, 'v_reac'); eq(p.x, 2000);
  run(g, 0.45);
  okRes(g.applyAction('h1', { type: 'ventMove', to: 'v_elec' }), 'links are symmetric');
  run(g, T.FIRST_KILL_COOLDOWN);
  errRes(g.applyAction('h1', { type: 'kill', target: 'h2' }), 'inVent');
  okRes(g.applyAction('h1', { type: 'ventExit' }));
  eq(p.inVent, null); assert(g.geo.canStand(p.x, p.y), 'standable exit');
  eq(evs(g.drainEvents(), 'vent').map((e) => e.action).join(), 'move,move,exit');
  errRes(g.applyAction('h1', { type: 'ventExit' }), 'notInVent');
});

test('sabotage permissions + cooldowns', () => {
  const { g } = setup(6);
  errRes(g.applyAction('h2', { type: 'sabotage', kind: 'lights' }), 'notImpostor');
  errRes(g.applyAction('h1', { type: 'sabotage', kind: 'lights' }), 'cooldown');
  run(g, T.SABOTAGE_START_COOLDOWN + 0.1);
  errRes(g.applyAction('h1', { type: 'sabotage', kind: 'meteor' }), 'badAction');
  errRes(g.applyAction('h1', { type: 'sabotage', kind: 'constructor' }), 'badAction');
  okRes(g.applyAction('h1', { type: 'sabotage', kind: 'lights' }));
  errRes(g.applyAction('h1', { type: 'sabotage', kind: 'comms' }), 'sabotageActive');
  okRes(g.applyAction('h1', { type: 'sabotage', kind: 'doors', room: 'reactor' }), 'doors allowed during other sabotage');
  errRes(g.applyAction('h1', { type: 'sabotage', kind: 'doors', room: 'reactor' }), 'cooldown');
  errRes(g.applyAction('h1', { type: 'sabotage', kind: 'doors', room: 'messhall' }), 'noDoors');
  const s = g.snapshotFor('h1').self;
  eq(s.doorCooldowns.reactor, T.DOOR_COOLDOWN); eq(s.doorCooldowns.electrical, 0);
  eq(g.snapshotFor('h2').self.doorCooldowns.reactor, undefined, 'crew gets no door cooldowns');
});

test('lights: crew vision drops (min clamp), impostor unaffected, fix', () => {
  const { g } = setup(6, { settings: { crewVision: 1, impostorVision: 1.5 } });
  const crewR = T.BASE_VISION, impR = T.BASE_VISION * 1.5;
  eq(g.visionRadius('h2'), crewR); eq(g.visionRadius('h1'), impR);
  g.startSabotage('lights');
  eq(g.visionRadius('h2'), Math.max(T.MIN_VISION, crewR * T.LIGHTS_OFF_MULT)); eq(g.visionRadius('h1'), impR);
  eq(g.snapshotFor('h2').self.visionRadius, Math.round(Math.max(T.MIN_VISION, crewR * T.LIGHTS_OFF_MULT)));
  g.teleport('h2', 600, 300); g.teleport(g.order[2], 600 + 200, 300);
  assert(!g.canSee('h2', 800, 300), 'out of reduced vision');
  assert(g.canSee('h1', 800, 300), 'impostor still sees');
  errRes(g.applyAction('h2', { type: 'fixPanel', panel: 'pn_lights' }), 'range');
  g.teleport('h2', 300, 1100);
  errRes(g.applyAction('h2', { type: 'fixPanel', panel: 'pn_comms' }), 'noSabotage');
  g.drainEvents();
  okRes(g.applyAction('h2', { type: 'fixPanel', panel: 'pn_lights' }));
  eq(g.sabotage, null); eq(g.sabotageCooldown, T.SABOTAGE_COOLDOWN);
  assert(evs(g.drainEvents(), 'sabotageFixed').some((e) => e.kind === 'lights'), 'fixed event');
  eq(g.visionRadius('h2'), crewR);
  const g2 = setup(4, { settings: { crewVision: 0.25 } }).g;
  eq(g2.visionRadius('h2'), T.MIN_VISION, 'MIN_VISION clamp');
});

test('comms hides task progress; taskBarUpdates modes', () => {
  const { g, crew } = setup(6, { settings: { commonTasks: 1, longTasks: 0, shortTasks: 1 } });
  eq(g.snapshotFor('h2').taskProgress, 0);
  const t = P(g, 'h2').tasks.find((x) => x.steps.length === 1);
  const st = g.stationById[t.steps[0].station];
  g.teleport('h2', st.x, st.y);
  okRes(g.applyAction('h2', { type: 'taskComplete', task: t.id }));
  const total = crew.reduce((n, id) => n + P(g, id).tasks.reduce((m, k) => m + k.steps.length, 0), 0);
  near(g.snapshotFor('h2').taskProgress, 1 / total, 0.001);
  g.startSabotage('comms');
  eq(g.snapshotFor('h2').taskProgress, null, 'hidden during comms');
  eq(g.snapshotFor('h1').taskProgress, null, 'hidden for impostors too');
  g.teleport('h2', 900, 300);
  okRes(g.applyAction('h2', { type: 'fixPanel', panel: 'pn_comms' }));
  near(g.snapshotFor('h2').taskProgress, 1 / total, 0.001);

  const m = setup(6, { settings: { taskBarUpdates: 'meetings', discussionTime: 0 } }).g;
  const t2 = P(m, 'h2').tasks[0];
  const st2 = m.stationById[t2.steps[0].station];
  m.teleport('h2', st2.x, st2.y);
  okRes(m.applyAction('h2', { type: 'taskComplete', task: t2.id }));
  eq(m.snapshotFor('h2').taskProgress, 0, 'meetings mode: not refreshed yet');
  m.startMeeting('h2', null, true);
  assert(m.snapshotFor('h2').taskProgress > 0, 'refreshed when a meeting starts');
  const nv = setup(6, { settings: { taskBarUpdates: 'never' } }).g;
  eq(nv.snapshotFor('h2').taskProgress, null, 'never mode');
});

test('reactor: two holders at once fix it; release; busy; timeout -> impostor win', () => {
  const { g, crew } = setup(6);
  const a = 'h2', b = crew[1];
  g.startSabotage('reactor');
  near(g.snapshotFor(a).sabotage.timer, T.REACTOR_TIME, 0.01);
  g.teleport(a, 1500, 300); g.teleport(b, 2000, 700);
  okRes(g.applyAction(a, { type: 'fixPanel', panel: 'pn_reac1', holding: true }));
  let s = g.snapshotFor(a);
  eq(s.sabotage.panels.pn_reac1.held, true); eq(s.sabotage.panels.pn_reac2.held, false); eq(s.self.holding, 'pn_reac1');
  okRes(g.applyAction(a, { type: 'fixPanel', panel: 'pn_reac1', holding: false }));
  eq(g.snapshotFor(a).sabotage.panels.pn_reac1.held, false, 'released');
  okRes(g.applyAction(b, { type: 'fixPanel', panel: 'pn_reac2', holding: true }));
  assert(g.sabotage, 'one hand is not enough');
  g.teleport(crew[2], 1500, 300);
  okRes(g.applyAction(crew[2], { type: 'fixPanel', panel: 'pn_reac1', holding: true }));
  errRes(g.applyAction(a, { type: 'fixPanel', panel: 'pn_reac1', holding: true }), 'noSabotage', 'fixed already');
  eq(g.sabotage, null, 'both held -> fixed');
  eq(P(g, b).holding, null); eq(P(g, crew[2]).holding, null);
  okRes(g.applyAction(a, { type: 'fixPanel', panel: 'pn_reac1', holding: false }), 'release after fix is harmless');

  g.sabotageCooldown = 0;
  g.startSabotage('reactor');
  okRes(g.applyAction(crew[2], { type: 'fixPanel', panel: 'pn_reac1', holding: true }));
  errRes(g.applyAction(a, { type: 'fixPanel', panel: 'pn_reac1', holding: true }), 'busy');
  g.teleport(crew[2], 600, 300);
  run(g, 0.1);
  eq(g.sabotage.panels.pn_reac1.held, false, 'walking away releases the hand scanner');
  run(g, T.REACTOR_TIME);
  eq(g.phase, 'ended');
  eq(g.result.winner, 'impostor'); eq(g.result.reason, 'sabotage');
  eq(g.result.impostors.join(), 'h1');
});

test('o2: both panels; timeout; meeting clears critical sabotage but not lights', () => {
  const { g } = setup(6);
  g.startSabotage('o2');
  g.teleport('h2', 300, 700);
  okRes(g.applyAction('h2', { type: 'fixPanel', panel: 'pn_o2a' }));
  eq(g.snapshotFor('h2').sabotage.panels.pn_o2a.done, true); assert(g.sabotage, 'one panel is not enough');
  g.teleport('h2', 700, 1300);
  okRes(g.applyAction('h2', { type: 'fixPanel', panel: 'pn_o2b' }));
  eq(g.sabotage, null, 'o2 fixed');
  g.sabotageCooldown = 0;
  g.startSabotage('o2');
  run(g, 5);
  // body report during o2 -> meeting clears it
  g.teleport('h1', 600, 300); g.teleport(g.order[2], 700, 300);
  P(g, 'h1').killCooldown = 0;
  okRes(g.applyAction('h1', { type: 'kill', target: g.order[2] }));
  g.teleport('h2', 650, 330);
  g.drainEvents();
  okRes(g.applyAction('h2', { type: 'report' }), 'report nearest body without id');
  eq(g.sabotage, null, 'critical cleared by the meeting');
  assert(evs(g.drainEvents(), 'sabotageFixed').some((e) => e.kind === 'o2'), 'sabotageFixed on meeting');
  const g2 = setup(6).g;
  g2.startSabotage('lights');
  g2.startMeeting('h2', null, true);
  eq(g2.sabotage.kind, 'lights', 'lights persist through meetings');
  const g3 = setup(6).g;
  g3.startSabotage('o2');
  run(g3, T.O2_TIME + 0.1);
  eq(g3.result.reason, 'sabotage');
});

test('doors: close, push-out, block movement + LOS, timers, cooldown, meeting opens', () => {
  const { g } = setup(6);
  const other = g.order[2];
  run(g, T.SABOTAGE_START_COOLDOWN + 0.1);
  g.teleport('h2', 1410, 480);   // standing in the reactor doorway
  g.teleport(other, 1300, 480);  // in the hall, clear of the door
  const tp = P(g, 'h2').tp, tpOther = P(g, other).tp;
  g.drainEvents();
  okRes(g.applyAction('h1', { type: 'sabotage', kind: 'doors', room: 'reactor' }));
  let ev = g.drainEvents();
  assert(evs(ev, 'doors').some((e) => e.room === 'reactor' && e.closed === true), 'doors event');
  assert(evs(ev, 'sabotage').some((e) => e.kind === 'doors' && e.room === 'reactor'), 'sabotage event');
  const p = P(g, 'h2');
  eq(p.tp, tp + 1, 'pushed out (tp++)');
  assert(g.geo.canStand(p.x, p.y) && (p.x <= 1380 || p.x >= 1440), 'outside the doorway: ' + p.x);
  eq(P(g, other).tp, tpOther, 'others untouched');
  assert(g.geo.isDoorClosed('d_reac') && !g.geo.lineOfSight(1300, 480, 1500, 480), 'closed door blocks LOS');
  near(g.snapshotFor('h2').doors.d_reac, T.DOOR_CLOSE_TIME, 0.01);
  eq(g.snapshotFor('h2').doors.d_elec, undefined, 'only closed doors listed');
  // a human cannot step into the closed doorway
  g.teleport('h2', 1370, 480);
  run(g, 0.3);
  errRes(g.applyAction('h2', { type: 'move', x: 1396, y: 480, tp: P(g, 'h2').tp }), 'blocked');
  // a bot cannot walk through it either
  P(g, other).input = { x: 1, y: 0 };
  run(g, 1);
  assert(P(g, other).x <= 1380.01, 'bot stopped by the door, x=' + P(g, other).x);
  P(g, other).input = { x: 0, y: 0 };
  errRes(g.applyAction('h1', { type: 'sabotage', kind: 'doors', room: 'reactor' }), 'cooldown');
  okRes(g.applyAction('h1', { type: 'sabotage', kind: 'lights' }), 'other sabotage while doors are closed');
  g.drainEvents();
  run(g, T.DOOR_CLOSE_TIME - 1.3 + 0.1);
  ev = g.drainEvents();
  assert(evs(ev, 'doors').some((e) => e.room === 'reactor' && e.closed === false), 'doors reopen event');
  assert(!g.geo.isDoorClosed('d_reac') && g.geo.lineOfSight(1300, 480, 1500, 480), 'reopened');
  eq(Object.keys(g.snapshotFor('h2').doors).length, 0);
  errRes(g.applyAction('h1', { type: 'sabotage', kind: 'doors', room: 'reactor' }), 'cooldown', 'still cooling down');
  run(g, T.DOOR_COOLDOWN - T.DOOR_CLOSE_TIME + 0.2);
  okRes(g.applyAction('h1', { type: 'sabotage', kind: 'doors', room: 'reactor' }), 'cooldown over');
  okRes(g.applyAction('h1', { type: 'sabotage', kind: 'doors', room: 'electrical' }), 'other room independent');
  g.drainEvents();
  g.startMeeting('h2', null, true);
  ev = g.drainEvents();
  eq(evs(ev, 'doors').filter((e) => e.closed === false).length, 2, 'meeting opens all doors');
  assert(!g.geo.isDoorClosed('d_reac') && !g.geo.isDoorClosed('d_elec'), 'geo doors open');
  eq(g.sabotage.kind, 'lights', 'lights persist');
});

test('game instances on the same map have independent doors', () => {
  const a = setup(5).g, b = setup(5).g;
  assert(a.geo !== b.geo, 'separate geo instances');
  a.startSabotage('doors', 'reactor');
  assert(a.geo.isDoorClosed('d_reac') && !b.geo.isDoorClosed('d_reac'), 'independent door state');
});

section('Game: tasks, ghosts, wins, disconnects, lobby return');

test('tasks: range, ordered steps, private taskStep events, fake tasks rejected', () => {
  const { g } = setup(6, { settings: { commonTasks: 1, longTasks: 1, shortTasks: 2 } });
  const p = P(g, 'h2');
  eq(p.tasks.length, 4);
  const t = p.tasks.find((x) => x.steps.length === 2);
  assert(t, 'has a 2-step task');
  const st0 = g.stationById[t.steps[0].station], st1 = g.stationById[t.steps[1].station];
  const far = Math.hypot(st0.x - 600, st0.y - 300) > 300 ? [600, 300] : [1900, 600];
  g.teleport('h2', far[0], far[1]);
  errRes(g.applyAction('h2', { type: 'taskComplete', task: t.id }), 'range');
  g.teleport('h2', st0.x, st0.y);
  g.drainEvents();
  okRes(g.applyAction('h2', { type: 'taskComplete', task: t.id }));
  eq(t.step, 1); eq(t.done, false);
  let te = evs(g.drainEvents(), 'taskStep')[0];
  assert(te && te.to === 'h2' && te.task === t.id && te.step === 1 && te.done === false, 'private taskStep event');
  if (Math.hypot(st1.x - st0.x, st1.y - st0.y) > T.USE_RANGE + 20) errRes(g.applyAction('h2', { type: 'taskComplete', task: t.id }), 'range', 'next step is elsewhere');
  g.teleport('h2', st1.x, st1.y);
  okRes(g.applyAction('h2', { type: 'taskComplete', task: t.id }));
  eq(t.done, true); eq(t.step, 2);
  te = evs(g.drainEvents(), 'taskStep')[0];
  eq(te.done, true);
  errRes(g.applyAction('h2', { type: 'taskComplete', task: t.id }), 'taskDone');
  errRes(g.applyAction('h2', { type: 'taskComplete', task: 'nope' }), 'noTask');
  const ft = P(g, 'h1').tasks[0];
  eq(ft.fake, true);
  const fst = g.stationById[ft.steps[0].station];
  g.teleport('h1', fst.x, fst.y);
  errRes(g.applyAction('h1', { type: 'taskComplete', task: ft.id }), 'notCrew', 'impostor fake tasks rejected');
  const snap = g.snapshotFor('h2');
  const sTask = snap.self.tasks.find((x) => x.id === t.id);
  assert(sTask.done && sTask.steps.length === 2 && sTask.steps[1].room === st1.room && sTask.nameKey, 'snapshot task fields');
  eq(g.snapshotFor('h1').self.tasks[0].fake, true, 'impostor sees a fake list');
});

test('visual scan: taskStart/taskCancel, visibility setting, auto-off', () => {
  const { g } = setup(6, { settings: { commonTasks: 0, longTasks: 0, shortTasks: 5 } });
  const p = P(g, 'h2');
  const t = p.tasks.find((x) => x.def === 'scan');
  assert(t, 'scan task assigned');
  g.teleport('h2', 850, 450);
  const notScan = p.tasks.find((x) => x.def !== 'scan');
  errRes(g.applyAction('h2', { type: 'taskStart', task: notScan.id }), 'notScan');
  errRes(g.applyAction('h1', { type: 'taskStart', task: 'scan' }), 'notCrew');
  g.drainEvents();
  okRes(g.applyAction('h2', { type: 'taskStart', task: t.id }));
  eq(p.scanning, true);
  assert(evs(g.drainEvents(), 'scan').some((e) => e.player === 'h2' && e.active === true), 'scan event');
  eq(snapP(g.snapshotFor('h1'), 'h2').scanning, true, 'others see the scan');
  okRes(g.applyAction('h2', { type: 'taskCancel', task: t.id }));
  eq(p.scanning, false);
  assert(evs(g.drainEvents(), 'scan').some((e) => e.active === false), 'scan off event');
  okRes(g.applyAction('h2', { type: 'taskStart', task: t.id }));
  run(g, T.SCAN_TIME + 2.2);
  eq(p.scanning, false, 'auto-off');
  okRes(g.applyAction('h2', { type: 'taskStart', task: t.id }));
  okRes(g.applyAction('h2', { type: 'taskComplete', task: t.id }));
  eq(p.scanning, false); eq(t.done, true);
  const g2 = setup(6, { settings: { visualTasks: false, commonTasks: 0, longTasks: 0, shortTasks: 5 } }).g;
  const t2 = P(g2, 'h2').tasks.find((x) => x.def === 'scan');
  g2.teleport('h2', 850, 450);
  g2.drainEvents();
  okRes(g2.applyAction('h2', { type: 'taskStart', task: t2.id }));
  eq(snapP(g2.snapshotFor('h1'), 'h2').scanning, false, 'hidden when visual tasks are off');
  eq(snapP(g2.snapshotFor('h2'), 'h2').scanning, true, 'self still sees it');
  eq(evs(g2.drainEvents(), 'scan').length, 0, 'no public scan event');
});

test('ghost crew keep doing tasks; all tasks done -> crew wins (tasks)', () => {
  const { g, crew } = setup(5, { settings: { commonTasks: 1, longTasks: 1, shortTasks: 1 } });
  run(g, T.FIRST_KILL_COOLDOWN + 0.1);
  g.teleport('h1', 600, 300); g.teleport(crew[1], 700, 300);
  okRes(g.applyAction('h1', { type: 'kill', target: crew[1] }));
  for (const id of crew.slice(0, -1)) completeAllTasks(g, id);
  eq(g.phase, 'playing', 'not yet');
  assert(g.taskProgress() < 1 && g.taskProgress() > 0.5, 'progress counts ghost work');
  completeAllTasks(g, crew[crew.length - 1]);
  eq(g.phase, 'ended'); eq(g.result.winner, 'crew'); eq(g.result.reason, 'tasks');
  eq(g.snapshotFor('h2').taskProgress, 1);
});

test('kills to parity -> impostors win (kills); roles revealed at the end', () => {
  const { g, crew } = setup(4);
  run(g, T.FIRST_KILL_COOLDOWN + 0.1);
  g.teleport('h1', 600, 300); g.teleport(crew[0], 700, 300);
  okRes(g.applyAction('h1', { type: 'kill', target: crew[0] }));
  eq(g.phase, 'playing');
  P(g, 'h1').killCooldown = 0;
  g.teleport(crew[1], 700, 300);
  g.drainEvents();
  okRes(g.applyAction('h1', { type: 'kill', target: crew[1] }));
  eq(g.phase, 'ended'); eq(g.result.winner, 'impostor'); eq(g.result.reason, 'kills');
  const ev = g.drainEvents();
  assert(evs(ev, 'gameEnd').some((e) => e.winner === 'impostor' && e.reason === 'kills'), 'gameEnd event');
  assert(evs(ev, 'phase').some((e) => e.phase === 'ended' && e.prev === 'playing'), 'phase event');
  const snap = g.snapshotFor(crew[2]);
  eq(snapP(snap, 'h1').role, 'impostor', 'roles revealed when ended');
  eq(snap.result.impostors.join(), 'h1');
});

test('voting out the last impostor -> crew wins after the eject screen', () => {
  const { g } = setup(5, { settings: { discussionTime: 0 } });
  g.startMeeting('h2', null, true);
  run(g, T.MEETING_INTRO_TIME + 0.05);
  for (const p of g.list()) okRes(g.applyAction(p.id, { type: 'vote', target: p.id === 'h1' ? 'skip' : 'h1' }));
  run(g, T.RESULTS_TIME + 0.05);
  eq(g.phase, 'ejecting', 'end waits for the eject screen');
  eq(g.snapshotFor('h2').ejection.impostorsLeft, 0);
  run(g, T.EJECT_TIME + 0.05);
  eq(g.phase, 'ended'); eq(g.result.winner, 'crew'); eq(g.result.reason, 'votedOut');
});

test('disconnect mid-game: left, no body, tasks dropped, voting completes, win re-check', () => {
  const { g, crew } = setup(6, { settings: { discussionTime: 0 } });
  const before = g._progress().total;
  const leaver = crew[1];
  const n = P(g, leaver).tasks.reduce((m, t) => m + t.steps.length, 0);
  g.drainEvents();
  g.removePlayer(leaver);
  const p = P(g, leaver);
  eq(p.left, true); eq(p.alive, false); eq(p.tasks.length, 0); eq(g.bodies.length, 0);
  eq(g._progress().total, before - n, 'progress denominator drops');
  assert(evs(g.drainEvents(), 'leave').some((e) => e.player === leaver), 'leave event');
  const sp = snapP(g.snapshotFor('h2'), leaver);
  assert(sp.left === true && sp.x === undefined, 'left players have no position');
  eq(g.removePlayer(leaver), false, 'second removal ignored');
  errRes(g.applyAction(leaver, { type: 'vote', target: 'skip' }), 'left');
  // meeting: everyone but crew[2] votes, then crew[2] leaves -> results immediately
  g.startMeeting('h2', null, true);
  run(g, T.MEETING_INTRO_TIME + 0.05);
  for (const q of g.list()) if (q.alive && q.id !== crew[2]) okRes(g.applyAction(q.id, { type: 'vote', target: 'skip' }));
  eq(g.meeting.stage, 'voting');
  g.removePlayer(crew[2]);
  eq(g.meeting.stage, 'results', 'last missing voter left');
  run(g, T.RESULTS_TIME + T.EJECT_TIME + 0.2);
  eq(g.phase, 'playing');
  g.removePlayer('h1');
  eq(g.phase, 'ended'); eq(g.result.winner, 'crew'); eq(g.result.reason, 'disconnect');
  const g2 = setup(4).g;
  g2.removePlayer('h2');
  g2.removePlayer(g2.order[2]);
  eq(g2.phase, 'ended'); eq(g2.result.winner, 'impostor'); eq(g2.result.reason, 'disconnect');
});

test('returnLobby: host only, left players removed, bots stay, full reset', () => {
  const { g } = setup(6);
  const bots = g.list().filter((p) => p.isBot).map((p) => p.id);
  g.startSabotage('lights');
  g.removePlayer('h2');
  g.endGame('crew', 'tasks');
  eq(g.phase, 'ended');
  errRes(g.applyAction('h1', { type: 'start' }), 'phase');
  okRes(g.applyAction('h1', { type: 'setLook', hat: 'nar' }), 'setLook allowed when ended');
  errRes(g.applyAction(bots[0], { type: 'returnLobby' }), 'notHost');
  g.drainEvents();
  okRes(g.applyAction('h1', { type: 'returnLobby' }));
  eq(g.phase, 'lobby'); eq(g.getPlayer('h2'), null); eq(g.order.length, 5);
  for (const id of bots) assert(g.getPlayer(id), 'bot stays');
  for (const p of g.list()) {
    eq(p.role, null); eq(p.alive, true); eq(p.tasks.length, 0); eq(p.inVent, null); eq(p.vote, null);
    assert(g.geo.roomAt(p.x, p.y) === 'lobby' && g.geo.canStand(p.x, p.y), 'back in the lobby');
  }
  eq(new Set(g.list().map((p) => p.x + ',' + p.y)).size, 5, 'distinct lobby spots');
  eq(g.sabotage, null); eq(g.result, null); eq(g.bodies.length, 0);
  const snap = g.snapshotFor('h1');
  eq(snap.result, null); eq(snap.taskProgress, null); eq(snap.self.role, null);
  assert(evs(g.drainEvents(), 'phase').some((e) => e.phase === 'lobby' && e.prev === 'ended'), 'phase event');
  okRes(g.applyAction('h1', { type: 'addBot' }));
  okRes(g.applyAction('h1', { type: 'start' }), 'can start again');
});

section('Game: snapshots, robustness, bot hooks');

test('snapshot filtering: roles, positions, vents, self', () => {
  const { g, crew } = setup(9, { imps: ['h1', 2] });
  const imp2 = g.order[2];
  let s = g.snapshotFor('h2');
  eq(s.v, 1); eq(s.mapId, 'testmap'); eq(s.you, 'h2'); eq(s.hostId, 'h1'); eq(s.phase, 'playing');
  eq(snapP(s, 'h2').role, 'crew'); eq(snapP(s, 'h1').role, undefined); eq(snapP(s, imp2).role, undefined);
  eq(snapP(s, 'h1').isHost, true); eq(snapP(s, imp2).isBot, true);
  s = g.snapshotFor('h1');
  eq(snapP(s, imp2).role, 'impostor', 'fellow impostor visible'); eq(snapP(s, crew[1]).role, undefined);
  eq(s.self.role, 'impostor'); assert(s.self.killCooldown > 0, 'kill cooldown');
  eq(s.self.sabotageCooldown, T.SABOTAGE_START_COOLDOWN);
  for (const p of s.players) if (p.x !== undefined) assert(Number.isInteger(p.x) && Number.isInteger(p.y), 'integer positions');
  const spec = g.snapshotFor('spectator');
  eq(spec.self, null); eq(spec.you, 'spectator');
  for (const p of spec.players) eq(p.role, undefined);
  assert(g.canSee('h2', P(g, 'h2').x + 10, P(g, 'h2').y), 'canSee nearby');
  assert(!g.canSee('h2', 300, 1300), 'canSee blocked by walls / range');
  assert(!g.canSee('nobody', 0, 0), 'unknown viewer');
});

test('snapshots are JSON-safe in every phase', () => {
  const g = lobbyGame(6);
  const check = (label) => {
    for (const id of g.order.concat(['ghost-viewer'])) {
      const s = g.snapshotFor(id);
      finiteDeep(s, label);
      const j = JSON.parse(JSON.stringify(s));
      eq(JSON.stringify(j), JSON.stringify(s), label + ' roundtrip');
    }
  };
  check('lobby');
  okRes(g.applyAction('h1', { type: 'start' }));
  check('countdown');
  run(g, 3.1); check('intro');
  run(g, T.INTRO_TIME); check('playing');
  const imp = g.list().find((p) => p.role === 'impostor');
  g.startSabotage('reactor'); g.startSabotage('doors', 'electrical');
  if (imp) { g.teleport(imp.id, 950, 740); imp.ventTime = -9; g.applyAction(imp.id, { type: 'vent', vent: 'v_mess' }); }
  check('sabotage+vent');
  const victim = g.list().find((p) => p.role === 'crew');
  g.killPlayer(victim.id, imp && imp.id);
  check('body');
  g.startMeeting(g.order[1] === victim.id ? g.order[0] : g.order[1], victim.id, false);
  check('meeting');
  run(g, T.MEETING_INTRO_TIME + g.settings.discussionTime + 0.1);
  for (const p of g.list()) if (p.alive) g.applyAction(p.id, { type: 'vote', target: 'skip' });
  check('results');
  run(g, T.RESULTS_TIME + 0.1); check('ejecting');
  g.endGame('impostor', 'kills'); check('ended');
});

test('applyAction / tick / snapshot never throw on garbage', () => {
  const { g } = setup(6);
  const evil = { toString() { throw new Error('evil toString'); } };
  const junk = [null, undefined, 5, 'x', [], {}, { type: 5 }, { type: 'constructor' }, { type: '__proto__' }, { type: 'toString' },
    { type: 'hasOwnProperty' }, { type: 'kill', target: {} }, { type: 'kill', target: null }, { type: 'kill', target: '__proto__' },
    { type: 'vote', target: ['a'] }, { type: 'move', x: 'a', y: {}, tp: {} }, { type: 'move', x: 1e308, y: -1e308, tp: 0 },
    { type: 'sabotage', kind: {}, room: [] }, { type: 'sabotage', kind: 'doors', room: 'constructor' }, { type: 'sabotage', kind: 'doors' },
    { type: 'fixPanel', panel: { a: 1 } }, { type: 'fixPanel', panel: 'constructor', holding: true }, { type: 'taskComplete', task: null },
    { type: 'taskStart', task: '__proto__' }, { type: 'vent', vent: '__proto__' }, { type: 'vent' }, { type: 'ventMove', to: 'constructor' },
    { type: 'setLook', name: evil, color: 'toString', hat: 'constructor' }, { type: 'settings', settings: 'nope' },
    { type: 'report', body: 'constructor' }, { type: 'removeBot', id: '__proto__' }, { type: 'emergency', extra: evil }];
  const errLog = console.error;
  let logged = 0;
  console.error = () => { logged++; };
  try {
    for (const a of junk) {
      for (const id of ['h1', 'h2', g.order[3], 'nobody', null, '__proto__', 'constructor']) {
        let r;
        try { r = g.applyAction(id, a); } catch (e) { throw new Error('applyAction threw for ' + JSON.stringify(a) + ': ' + e.message); }
        assert(r && typeof r.ok === 'boolean', 'result object');
      }
    }
    g.getPlayer('h2').input = { x: NaN, y: Infinity };
    g.list().filter((p) => p.isBot).forEach((b) => { b.input = { x: 'a', y: null }; });
    run(g, 1);
    finiteDeep(g.snapshotFor('h1'), 'after junk');
    eq(g.getPlayer('__proto__'), null); eq(g.getPlayer('constructor'), null);
  } finally {
    console.error = errLog;
  }
  assert(logged <= 1, 'internal errors are logged once at most (got ' + logged + ')');
  eq(g.phase, 'playing');
});

test('bot hooks: update / onEvent / onPhase, safe points, errors logged once, input movement', () => {
  const calls = { update: 0, ev: [], phase: [], throwFrom: 40, ids: new Set() };
  AS.Bots = {
    update(game, p, dt) {
      calls.update++; calls.ids.add(p.id);
      assert(dt === T.TICK, 'dt');
      p.input = { x: -1, y: 0 };
      if (calls.update >= calls.throwFrom) throw new Error('bot boom');
    },
    onEvent(game, ev) { calls.ev.push(ev.type); },
    onPhase(game, phase, prev) { calls.phase.push(prev + '>' + phase); },
  };
  const errLog = console.error;
  let logged = 0;
  console.error = () => { logged++; };
  try {
    const g = lobbyGame(4);
    const bots = g.list().filter((p) => p.isBot);
    const x0 = bots.map((b) => b.x);
    run(g, 0.5);
    eq(calls.update, 2 * 15, 'update per bot per tick');
    eq(calls.ids.size, 2);
    bots.forEach((b, i) => assert(b.x < x0[i] && b.moving && b.facing === -1, 'bot moved left'));
    run(g, 5);
    for (const b of bots) { near(b.x, 1320, 0.5, 'bot stopped at the lobby wall'); assert(g.geo.canStand(b.x, b.y), 'standable'); }
    assert(calls.ev.includes('join'), 'onEvent got join events');
    g.startGame();
    assert(calls.phase.length === 0, 'onPhase is deferred to the next safe point');
    run(g, T.INTRO_TIME + 0.1);
    eq(calls.phase.join(), 'lobby>intro,intro>playing');
    assert(calls.ev.includes('phase'), 'phase events delivered too');
    eq(logged, 1, 'bot errors logged once');
    eq(g.phase, 'playing', 'game survives throwing bots');
    // ghost bots fly through walls
    const gb = bots[0];
    g.killPlayer(gb.id);
    g.teleport(gb.id, 230, 300);
    calls.throwFrom = Infinity;
    run(g, 1);
    assert(gb.x < 200, 'ghost bot flew through the west wall, x=' + gb.x.toFixed(1));
  } finally {
    console.error = errLog;
    delete AS.Bots;
  }
});
