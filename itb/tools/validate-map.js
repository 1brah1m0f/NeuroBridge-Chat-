// node tools/validate-map.js — checks map connectivity / reachability of interactables.
const path = require('path');
for (const f of ['ns', 'constants', 'i18n', 'map', 'geometry']) require(path.join(__dirname, '../js/core/' + f + '.js'));
const AS = globalThis.AS, T = AS.T, M = AS.MAPS.starship;
const geo = AS.Geo.build(M);
let bad = 0;
const err = (m) => { bad++; console.log('ERR', m); };
const [sx, sy] = M.spawns.meeting[0];
if (!geo.canStand(sx, sy)) err('spawn0 not standable');
function reach(x, y, range, what) {
  // find a standable point within range that has a path from spawn
  for (let r = 0; r <= range - 15; r += 10) {
    for (let a = 0; a < 16; a++) {
      const px = x + Math.cos(a / 16 * Math.PI * 2) * r, py = y + Math.sin(a / 16 * Math.PI * 2) * r;
      if (!geo.canStand(px, py)) continue;
      if (geo.findPath(sx, sy, px, py)) return true;
    }
  }
  err(what + ' unreachable @' + x + ',' + y);
  return false;
}
M.spawns.meeting.concat(M.spawns.lobby).forEach(([x, y], i) => { if (!geo.canStand(x, y)) err('spawn ' + i + ' ' + x + ',' + y); });
M.stations.forEach((s) => reach(s.x, s.y, T.USE_RANGE, 'station ' + s.id));
M.panels.forEach((s) => reach(s.x, s.y, T.USE_RANGE, 'panel ' + s.id));
M.consoles.forEach((s) => reach(s.x, s.y, T.USE_RANGE, 'console ' + s.id));
M.vents.forEach((s) => { reach(s.x, s.y, T.VENT_RANGE, 'vent ' + s.id); s.links.forEach((l) => { const o = M.vents.find((v) => v.id === l); if (!o || o.links.indexOf(s.id) < 0) err('vent link ' + s.id + '->' + l); }); });
reach(M.button.x, M.button.y, T.BUTTON_RANGE, 'button');
const ids = new Set(M.stations.map((s) => s.id));
M.taskDefs.forEach((d) => d.steps.forEach((s) => [].concat(s.st).forEach((id) => { if (!ids.has(id)) err('task ' + d.id + ' bad station ' + id); })));
M.rooms.forEach((r) => { if (r.lobby) return; const c = AS.util.rectCenter(r.rect); const p = geo.nearestStandable(c[0], c[1]); if (!geo.findPath(sx, sy, p[0], p[1])) err('room ' + r.id + ' unreachable'); if (geo.roomAt(c[0], c[1]) !== r.id) err('roomAt ' + r.id); });
M.doors.concat(M.halls).concat(M.rooms).forEach((d) => { if (d.rect.some((v) => v % 10)) err('rect not /10 ' + JSON.stringify(d)); });
if (AS.TASK_GAMES) M.taskDefs.forEach((d) => d.steps.forEach((s) => { if (AS.TASK_GAMES.indexOf(s.game) < 0) err('unknown game ' + s.game); }));
console.log(bad ? bad + ' problems' : 'map OK', '| stations', M.stations.length, 'vents', M.vents.length, 'doors', M.doors.length, 'tasks', M.taskDefs.length);
process.exit(bad ? 1 : 0);
