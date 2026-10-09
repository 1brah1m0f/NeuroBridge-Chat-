/* AI IMPOSTOR: SPACE SHIP — world geometry (browser + Node). Owner: core. See docs/CONTRACT.md §3.
 *
 *   const geo = AS.Geo.build(map);
 *     The static part (floor grid, obstacles, nav grid, boundary) is cached per map id. Every build() call returns a
 *     NEW lightweight instance with its own door state, so several games on one server can share a map safely.
 *
 *   geo.cols, geo.rows, geo.cell, geo.floor (Uint8Array, 1 = floor), geo.ox, geo.oy (grid origin, normally 0,0)
 *   geo.width, geo.height                       world bounds (map.width/height)
 *   geo.isFloor(x, y)                           floor cell (ignores doors / props)
 *   geo.isOpen(x, y)                            floor and not a closed door (vision / LOS)
 *   geo.canStand(x, y, r = PLAYER_RADIUS)       circle fully on open floor and not overlapping a block prop
 *   geo.move(x, y, dx, dy, r) -> {x, y}         sub-stepped (<= 8 units) sliding collision, never tunnels
 *   geo.setDoors(closedDoorIds)                 ids of the doors that are currently closed
 *   geo.lineOfSight(x1, y1, x2, y2) -> bool     grid DDA; walls + closed doors block, props never do
 *   geo.castRay(x, y, angle, maxDist) -> dist   exact distance to the first wall / closed door (grid DDA)
 *   geo.visibility(x, y, radius, rays = 360) -> Float32Array [x0,y0,x1,y1,...]  vision polygon (corners refined)
 *   geo.roomAt(x, y) -> roomId | null           null in halls / void
 *   geo.findPath(x1, y1, x2, y2) -> [[x,y], ...] | null
 *                                               waypoints AFTER the start, last = goal (or the nearest standable point
 *                                               to it); A* on a 20-unit standability grid + string pulling
 *   geo.nearestStandable(x, y, r) -> [x, y]     spiral search
 *   geo.randomPointInRoom(rng, roomId) -> [x, y] | null
 *   geo.boundary() -> [{x1, y1, x2, y2, floor: 'n'|'s'|'e'|'w'}]  merged floor/non-floor edges (cached)
 *   extras: geo.segmentClear(x1, y1, x2, y2, r), geo.isDoorClosed(id), geo.closedDoors() -> [ids], geo.doorAt(x, y),
 *           geo.doors [{id, room, rect, orient}], geo.obstacles [{kind:'rect', x0,y0,x1,y1} | {kind:'circle', x,y,r}]
 */
(function (AS) {
  'use strict';

  const T = AS.T || {};
  const CELL = T.GRID || 10;
  const PR = T.PLAYER_RADIUS || 20;
  const NAV = CELL * 2;            // coarse A* cell
  const SUB = 8;                   // max movement sub-step
  const BK = 80;                   // obstacle bucket size
  const TAU = Math.PI * 2;
  const SQRT2 = Math.SQRT2;
  const REFINE = 6;                // binary refinement iterations at vision discontinuities

  // Footprints from the contract's prop table, used when a block prop omits w/h/r.
  const FOOTPRINT = {
    table_round: { r: 80 }, crate: { w: 70, h: 70 }, crate_stack: { w: 110, h: 90 }, boxes: { w: 60, h: 50 },
    barrel: { r: 28 }, console: { w: 120, h: 50 }, admin_table: { w: 240, h: 140 }, engine: { w: 220, h: 180 },
    reactor_core: { r: 110 }, shield_emitter: { r: 70 }, turret_seat: { w: 120, h: 120 }, pilot_seat: { w: 60, h: 60 },
    bed: { w: 150, h: 70 }, sample_station: { w: 130, h: 60 }, o2_tank: { r: 30 }, tree: { r: 45 },
    fuel_tank: { w: 80, h: 90 }, locker: { w: 60, h: 30 }, server_rack: { w: 70, h: 40 }, radar_dish: { r: 60 },
    dropship_seat: { w: 60, h: 60 }, chair: { w: 40, h: 40 }, laptop: { w: 60, h: 40 },
  };

  const cache = Object.create(null);   // mapId -> { map, base }
  const trigCache = Object.create(null);

  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const arr = (v) => (Array.isArray(v) ? v : []);
  const clampI = (v, a, b) => (v < a ? a : v > b ? b : v);
  const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

  function toRect(r) {
    if (!r || r.length < 4) return null;
    const x = +r[0], y = +r[1], w = +r[2], h = +r[3];
    if (!isFinite(x) || !isFinite(y) || !(w > 0) || !(h > 0) || !isFinite(w) || !isFinite(h)) return null;
    return [x, y, w, h];
  }

  function trig(n) {
    let t = trigCache[n];
    if (!t) {
      t = { c: new Float64Array(n), s: new Float64Array(n) };
      for (let k = 0; k < n; k++) { const a = (k / n) * TAU; t.c[k] = Math.cos(a); t.s[k] = Math.sin(a); }
      trigCache[n] = t;
    }
    return t;
  }

  // ---------------------------------------------------------------- static base (cached per map)
  function buildBase(map) {
    const t0 = now();
    const rooms = arr(map.rooms), halls = arr(map.halls), doors = arr(map.doors), props = arr(map.props);

    const roomList = [];               // { id, rects }
    const roomById = Object.create(null);
    const roomRects = [];              // { i, rect }
    rooms.forEach((rm) => {
      if (!rm || rm.id == null) return;
      const rects = [];
      for (const r of [rm.rect].concat(arr(rm.extra))) { const rr = toRect(r); if (rr) rects.push(rr); }
      const entry = { id: rm.id, rects, lobby: !!rm.lobby };
      const i = roomList.length;
      roomList.push(entry);
      roomById[rm.id] = entry;
      for (const rr of rects) roomRects.push({ i, rect: rr });
    });
    const hallRects = [];
    for (const h of halls) { const rr = toRect(h && h.rect); if (rr) hallRects.push(rr); }

    let minX = 0, minY = 0;
    let maxX = isNum(+map.width) ? +map.width : 0, maxY = isNum(+map.height) ? +map.height : 0;
    const allRects = roomRects.map((o) => o.rect).concat(hallRects);
    for (const d of doors) { const rr = toRect(d && d.rect); if (rr) allRects.push(rr); }
    for (const rr of allRects) {
      if (rr[0] < minX) minX = rr[0];
      if (rr[1] < minY) minY = rr[1];
      if (rr[0] + rr[2] > maxX) maxX = rr[0] + rr[2];
      if (rr[1] + rr[3] > maxY) maxY = rr[1] + rr[3];
    }
    const ox = Math.floor(minX / CELL) * CELL, oy = Math.floor(minY / CELL) * CELL;
    const cols = Math.max(1, Math.ceil((maxX - ox) / CELL)), rows = Math.max(1, Math.ceil((maxY - oy) / CELL));
    const N = cols * rows;
    const floor = new Uint8Array(N);
    const roomIdx = new Uint16Array(N);

    const forCells = (rr, fn) => {
      const i0 = clampI(Math.round((rr[0] - ox) / CELL), 0, cols), i1 = clampI(Math.round((rr[0] + rr[2] - ox) / CELL), 0, cols);
      const j0 = clampI(Math.round((rr[1] - oy) / CELL), 0, rows), j1 = clampI(Math.round((rr[1] + rr[3] - oy) / CELL), 0, rows);
      for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) fn(j * cols + i);
    };
    for (const rr of hallRects) forCells(rr, (c) => { floor[c] = 1; });
    for (const o of roomRects) forCells(o.rect, (c) => { floor[c] = 1; if (!roomIdx[c]) roomIdx[c] = o.i + 1; });

    // Doors: the cells of each door rect (only floor cells matter).
    const doorList = [];
    const doorIndex = Object.create(null);
    for (const d of doors) {
      const rr = toRect(d && d.rect);
      if (!rr || d.id == null || doorIndex[d.id] != null) continue;
      const cells = [];
      forCells(rr, (c) => { if (floor[c]) cells.push(c); });
      doorIndex[d.id] = doorList.length;
      doorList.push({ id: d.id, room: d.room != null ? d.room : null, rect: rr, orient: d.orient === 'h' ? 'h' : 'v', cells: Int32Array.from(cells) });
    }

    // Obstacles from block props (rect footprint centered at x,y or circle r). Wall/floor props never block.
    const obstacles = [];
    for (const p of props) {
      if (!p || p.block !== true || p.wall === true || p.floor === true) continue;
      const x = +p.x, y = +p.y;
      if (!isFinite(x) || !isFinite(y)) continue;
      const def = FOOTPRINT[p.type] || {};
      const w = +p.w, h = +p.h, r = +p.r;
      if (w > 0 && h > 0) obstacles.push({ kind: 'rect', x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2 });
      else if (r > 0) obstacles.push({ kind: 'circle', x, y, r });
      else if (def.w) obstacles.push({ kind: 'rect', x0: x - def.w / 2, y0: y - def.h / 2, x1: x + def.w / 2, y1: y + def.h / 2 });
      else if (def.r) obstacles.push({ kind: 'circle', x, y, r: def.r });
    }
    const NO = obstacles.length;
    const oKind = new Uint8Array(NO);              // 0 rect, 1 circle
    const oA = new Float64Array(NO), oB = new Float64Array(NO), oC = new Float64Array(NO), oD = new Float64Array(NO);
    obstacles.forEach((o, k) => {
      if (o.kind === 'rect') { oKind[k] = 0; oA[k] = o.x0; oB[k] = o.y0; oC[k] = o.x1; oD[k] = o.y1; }
      else { oKind[k] = 1; oA[k] = o.x; oB[k] = o.y; oC[k] = o.r; oD[k] = 0; }
    });
    // Bucket grid (CSR layout) for fast obstacle queries.
    const bCols = Math.max(1, Math.ceil((cols * CELL) / BK)), bRows = Math.max(1, Math.ceil((rows * CELL) / BK));
    const lists = new Array(bCols * bRows);
    obstacles.forEach((o, k) => {
      const x0 = o.kind === 'rect' ? o.x0 : o.x - o.r, x1 = o.kind === 'rect' ? o.x1 : o.x + o.r;
      const y0 = o.kind === 'rect' ? o.y0 : o.y - o.r, y1 = o.kind === 'rect' ? o.y1 : o.y + o.r;
      const bi0 = clampI(Math.floor((x0 - ox) / BK), 0, bCols - 1), bi1 = clampI(Math.floor((x1 - ox) / BK), 0, bCols - 1);
      const bj0 = clampI(Math.floor((y0 - oy) / BK), 0, bRows - 1), bj1 = clampI(Math.floor((y1 - oy) / BK), 0, bRows - 1);
      for (let j = bj0; j <= bj1; j++) for (let i = bi0; i <= bi1; i++) (lists[j * bCols + i] || (lists[j * bCols + i] = [])).push(k);
    });
    const bStart = new Int32Array(bCols * bRows + 1);
    let total = 0;
    for (let b = 0; b < lists.length; b++) { bStart[b] = total; total += lists[b] ? lists[b].length : 0; }
    bStart[lists.length] = total;
    const bItems = new Int32Array(total);
    for (let b = 0; b < lists.length; b++) if (lists[b]) bItems.set(lists[b], bStart[b]);

    const B = {
      map, mapId: map.id, cols, rows, ox, oy, N, floor, roomIdx, roomList, roomById,
      width: isNum(+map.width) && +map.width > 0 ? +map.width : cols * CELL + ox,
      height: isNum(+map.height) && +map.height > 0 ? +map.height : rows * CELL + oy,
      diag: Math.hypot(cols, rows) * CELL,
      doors: doorList, doorIndex,
      obstacles, oKind, oA, oB, oC, oD, bCols, bRows, bStart, bItems,
      edges: null,
    };

    // Coarse standability grid for A* (cell centers standable by a PLAYER_RADIUS circle, all doors open).
    const navCols = Math.ceil(cols / 2), navRows = Math.ceil(rows / 2), NN = navCols * navRows;
    const navStatic = new Uint8Array(NN);
    for (let j = 0; j < navRows; j++) {
      const cy = oy + j * NAV + NAV / 2;
      for (let i = 0; i < navCols; i++) {
        if (standOn(B, floor, ox + i * NAV + NAV / 2, cy, PR)) navStatic[j * navCols + i] = 1;
      }
    }
    // Nav cells that a closed door would block.
    const navDoorMap = new Map();
    doorList.forEach((d, di) => {
      const r = d.rect;
      const i0 = clampI(Math.floor((r[0] - PR - ox) / NAV) - 1, 0, navCols - 1), i1 = clampI(Math.floor((r[0] + r[2] + PR - ox) / NAV) + 1, 0, navCols - 1);
      const j0 = clampI(Math.floor((r[1] - PR - oy) / NAV) - 1, 0, navRows - 1), j1 = clampI(Math.floor((r[1] + r[3] + PR - oy) / NAV) + 1, 0, navRows - 1);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const k = j * navCols + i;
        if (!navStatic[k]) continue;
        const cx = ox + i * NAV + NAV / 2, cy = oy + j * NAV + NAV / 2;
        const nx = cx < r[0] ? r[0] : cx > r[0] + r[2] ? r[0] + r[2] : cx;
        const ny = cy < r[1] ? r[1] : cy > r[1] + r[3] ? r[1] + r[3] : cy;
        if ((cx - nx) * (cx - nx) + (cy - ny) * (cy - ny) < PR * PR) {
          let l = navDoorMap.get(k);
          if (!l) navDoorMap.set(k, (l = []));
          l.push(di);
        }
      }
    });
    // Connected components (4-connectivity == 8-connectivity without corner cutting).
    const navComp = new Int32Array(NN).fill(-1);
    const queue = new Int32Array(NN);
    let comp = 0;
    for (let s = 0; s < NN; s++) {
      if (!navStatic[s] || navComp[s] >= 0) continue;
      let qh = 0, qt = 0;
      queue[qt++] = s; navComp[s] = comp;
      while (qh < qt) {
        const c = queue[qh++];
        const ci = c % navCols, cj = (c / navCols) | 0;
        if (ci > 0 && navStatic[c - 1] && navComp[c - 1] < 0) { navComp[c - 1] = comp; queue[qt++] = c - 1; }
        if (ci < navCols - 1 && navStatic[c + 1] && navComp[c + 1] < 0) { navComp[c + 1] = comp; queue[qt++] = c + 1; }
        if (cj > 0 && navStatic[c - navCols] && navComp[c - navCols] < 0) { navComp[c - navCols] = comp; queue[qt++] = c - navCols; }
        if (cj < navRows - 1 && navStatic[c + navCols] && navComp[c + navCols] < 0) { navComp[c + navCols] = comp; queue[qt++] = c + navCols; }
      }
      comp++;
    }
    B.navCols = navCols; B.navRows = navRows; B.NN = NN;
    B.navStatic = navStatic; B.navDoorMap = navDoorMap; B.navComp = navComp;
    // A* scratch (shared by all instances of this map; JS is single-threaded).
    B.scratch = {
      g: new Float64Array(NN), parent: new Int32Array(NN), seen: new Uint32Array(NN), closed: new Uint32Array(NN), gen: 0,
      heapN: new Int32Array(1024), heapK: new Float64Array(1024), size: 0,
    };
    B.buildMs = now() - t0;
    return B;
  }

  // Circle (x, y, r) fully on cells with grid[c] = 1 and clear of obstacles. Touching is allowed.
  function standOn(B, grid, x, y, r) {
    const ox = B.ox, oy = B.oy, cols = B.cols;
    const i0 = Math.floor((x - r - ox) / CELL), i1 = Math.ceil((x + r - ox) / CELL) - 1;
    const j0 = Math.floor((y - r - oy) / CELL), j1 = Math.ceil((y + r - oy) / CELL) - 1;
    if (!(i0 >= 0 && j0 >= 0 && i1 < cols && j1 < B.rows)) return false; // also rejects NaN
    const r2 = r * r;
    for (let j = j0; j <= j1; j++) {
      const cy0 = oy + j * CELL, cy1 = cy0 + CELL;
      const ny = y < cy0 ? cy0 : y > cy1 ? cy1 : y;
      const ddy = (y - ny) * (y - ny);
      if (ddy >= r2) continue;
      const row = j * cols;
      for (let i = i0; i <= i1; i++) {
        if (grid[row + i]) continue;
        const cx0 = ox + i * CELL, cx1 = cx0 + CELL;
        const nx = x < cx0 ? cx0 : x > cx1 ? cx1 : x;
        if ((x - nx) * (x - nx) + ddy < r2) return false;
      }
    }
    if (B.bItems.length) {
      const bi0 = clampI(Math.floor((x - r - ox) / BK), 0, B.bCols - 1), bi1 = clampI(Math.floor((x + r - ox) / BK), 0, B.bCols - 1);
      const bj0 = clampI(Math.floor((y - r - oy) / BK), 0, B.bRows - 1), bj1 = clampI(Math.floor((y + r - oy) / BK), 0, B.bRows - 1);
      const oKind = B.oKind, oA = B.oA, oB = B.oB, oC = B.oC, oD = B.oD, bStart = B.bStart, bItems = B.bItems;
      for (let bj = bj0; bj <= bj1; bj++) {
        for (let bi = bi0; bi <= bi1; bi++) {
          const b = bj * B.bCols + bi;
          for (let q = bStart[b], qe = bStart[b + 1]; q < qe; q++) {
            const k = bItems[q];
            if (oKind[k] === 0) {
              const nx = x < oA[k] ? oA[k] : x > oC[k] ? oC[k] : x;
              const ny = y < oB[k] ? oB[k] : y > oD[k] ? oD[k] : y;
              if ((x - nx) * (x - nx) + (y - ny) * (y - ny) < r2) return false;
            } else {
              const rr = r + oC[k];
              if ((x - oA[k]) * (x - oA[k]) + (y - oB[k]) * (y - oB[k]) < rr * rr) return false;
            }
          }
        }
      }
    }
    return true;
  }

  function computeBoundary(B) {
    const cols = B.cols, rows = B.rows, floor = B.floor, ox = B.ox, oy = B.oy;
    const F = (i, j) => (i >= 0 && j >= 0 && i < cols && j < rows ? floor[j * cols + i] : 0);
    const edges = [];
    // Horizontal edges on grid lines y = oy + j*CELL. Floor below -> 's' (north wall), floor above -> 'n'.
    for (let j = 0; j <= rows; j++) {
      let run = null, start = 0;
      for (let i = 0; i <= cols; i++) {
        let type = null;
        if (i < cols) { const a = F(i, j - 1), b = F(i, j); if (a !== b) type = b ? 's' : 'n'; }
        if (type !== run) {
          if (run) edges.push({ x1: ox + start * CELL, y1: oy + j * CELL, x2: ox + i * CELL, y2: oy + j * CELL, floor: run });
          run = type; start = i;
        }
      }
    }
    // Vertical edges on grid lines x = ox + i*CELL. Floor to the right -> 'e', to the left -> 'w'.
    for (let i = 0; i <= cols; i++) {
      let run = null, start = 0;
      for (let j = 0; j <= rows; j++) {
        let type = null;
        if (j < rows) { const a = F(i - 1, j), b = F(i, j); if (a !== b) type = b ? 'e' : 'w'; }
        if (type !== run) {
          if (run) edges.push({ x1: ox + i * CELL, y1: oy + start * CELL, x2: ox + i * CELL, y2: oy + j * CELL, floor: run });
          run = type; start = j;
        }
      }
    }
    return edges;
  }

  // ---------------------------------------------------------------- per-instance API
  class Geo {
    constructor(B) {
      this.B = B;
      this.map = B.map;
      this.mapId = B.mapId;
      this.cell = CELL;
      this.navCell = NAV;
      this.cols = B.cols;
      this.rows = B.rows;
      this.ox = B.ox;
      this.oy = B.oy;
      this.width = B.width;
      this.height = B.height;
      this.floor = B.floor;
      this.doors = B.doors.map((d) => ({ id: d.id, room: d.room, rect: d.rect.slice(), orient: d.orient }));
      this.obstacles = B.obstacles;
      this.buildMs = B.buildMs;
      this.open = B.floor.slice();          // floor minus closed door cells
      this.navOpen = B.navStatic.slice();   // nav standability minus closed doors
      this.closed = new Uint8Array(B.doors.length);
    }

    _cellIndex(x, y) {
      const B = this.B;
      const i = Math.floor((x - B.ox) / CELL), j = Math.floor((y - B.oy) / CELL);
      if (!(i >= 0 && j >= 0 && i < B.cols && j < B.rows)) return -1;
      return j * B.cols + i;
    }

    isFloor(x, y) { const c = this._cellIndex(x, y); return c >= 0 && this.B.floor[c] === 1; }
    isOpen(x, y) { const c = this._cellIndex(x, y); return c >= 0 && this.open[c] === 1; }

    canStand(x, y, r) {
      if (r == null) r = PR;
      return standOn(this.B, this.open, x, y, r);
    }

    setDoors(ids) {
      const B = this.B;
      const want = new Uint8Array(B.doors.length);
      if (ids && typeof ids !== 'string') {
        for (const id of ids) { const k = B.doorIndex[id]; if (k != null) want[k] = 1; }
      } else if (typeof ids === 'string') {
        const k = B.doorIndex[ids]; if (k != null) want[k] = 1;
      }
      let changed = false;
      for (let k = 0; k < want.length; k++) if (want[k] !== this.closed[k]) { changed = true; break; }
      if (!changed) return false;
      this.closed = want;
      const open = this.open, floor = B.floor;
      for (const d of B.doors) for (let q = 0; q < d.cells.length; q++) open[d.cells[q]] = floor[d.cells[q]];
      for (let k = 0; k < want.length; k++) if (want[k]) { const cells = B.doors[k].cells; for (let q = 0; q < cells.length; q++) open[cells[q]] = 0; }
      const navOpen = this.navOpen, navStatic = B.navStatic;
      for (const [k, deps] of B.navDoorMap) {
        let blocked = false;
        for (let q = 0; q < deps.length; q++) if (want[deps[q]]) { blocked = true; break; }
        navOpen[k] = navStatic[k] && !blocked ? 1 : 0;
      }
      return true;
    }

    isDoorClosed(id) { const k = this.B.doorIndex[id]; return k != null && this.closed[k] === 1; }
    closedDoors() { const out = []; for (let k = 0; k < this.closed.length; k++) if (this.closed[k]) out.push(this.B.doors[k].id); return out; }
    doorAt(x, y) {
      for (const d of this.B.doors) { const r = d.rect; if (x >= r[0] && y >= r[1] && x < r[0] + r[2] && y < r[1] + r[3]) return d.id; }
      return null;
    }

    move(x, y, dx, dy, r) {
      if (r == null) r = PR;
      if (!isNum(x) || !isNum(y)) return { x, y };
      dx = isNum(dx) ? dx : 0; dy = isNum(dy) ? dy : 0;
      if (!this.canStand(x, y, r)) {
        // Stuck (rounding, door closed on us, bad teleport): pop out to the nearest valid spot first.
        const p = this.nearestStandable(x, y, r);
        x = p[0]; y = p[1];
      }
      const dist = Math.hypot(dx, dy);
      if (dist < 1e-9) return { x, y };
      const n = Math.ceil(dist / SUB);
      const sx = dx / n, sy = dy / n;
      const ax = Math.abs(sx), ay = Math.abs(sy);
      for (let k = 0; k < n; k++) {
        if (this.canStand(x + sx, y + sy, r)) { x += sx; y += sy; continue; }
        let fullX = false, fullY = false;
        if (sx !== 0) {
          if (this.canStand(x + sx, y, r)) { x += sx; fullX = true; }
          else x += sx * this._flush(x, y, sx, 0, r);
        }
        if (sy !== 0) {
          if (this.canStand(x, y + sy, r)) { y += sy; fullY = true; }
          else y += sy * this._flush(x, y, 0, sy, r);
        }
        // Corner assist: pushing (almost) straight into a wall next to an opening / around a round prop ->
        // slide sideways toward the opening (only if one exists within ~1.5 r), never along a flat wall.
        if (ax > ay * 4 && !fullX) {
          const off = this._opening(x, y, sx, 0, r);
          if (off) { const m = Math.min(ax, Math.abs(off)) * (off > 0 ? 1 : -1); if (this.canStand(x, y + m, r)) y += m; }
        } else if (ay > ax * 4 && !fullY) {
          const off = this._opening(x, y, 0, sy, r);
          if (off) { const m = Math.min(ay, Math.abs(off)) * (off > 0 ? 1 : -1); if (this.canStand(x + m, y, r)) x += m; }
        }
      }
      return { x, y };
    }

    // Signed perpendicular offset (<= 1.5 r) at which a step (vx, vy) becomes possible, or 0.
    _opening(x, y, vx, vy, r) {
      const px = vx !== 0 ? 0 : 1, py = vx !== 0 ? 1 : 0;
      const max = r * 1.5;
      for (let off = 3; off <= max; off += 3) {
        const a = this.canStand(x + vx + px * off, y + vy + py * off, r);
        const b = this.canStand(x + vx - px * off, y + vy - py * off, r);
        if (a && !b) return off;
        if (b && !a) return -off;
        if (a && b) return off; // symmetric (dead-center into a round prop / thin pillar): pick a side
      }
      return 0;
    }

    // Largest f in [0,1] such that (x + vx*f, y + vy*f) is standable (start assumed standable).
    _flush(x, y, vx, vy, r) {
      let lo = 0, hi = 1;
      for (let i = 0; i < 5; i++) {
        const m = (lo + hi) * 0.5;
        if (this.canStand(x + vx * m, y + vy * m, r)) lo = m; else hi = m;
      }
      return lo;
    }

    // Exact grid DDA: distance from (x,y) along unit (dx,dy) to the first non-open cell, capped at maxDist.
    _march(x, y, dx, dy, maxDist) {
      const B = this.B, open = this.open, cols = B.cols, rows = B.rows;
      if (!(maxDist > 0)) return 0;
      if (maxDist > B.diag) maxDist = B.diag;
      const gx = (x - B.ox) / CELL, gy = (y - B.oy) / CELL;
      let cx = Math.floor(gx), cy = Math.floor(gy);
      if (!(cx >= 0 && cy >= 0 && cx < cols && cy < rows)) return 0;
      const adx = dx < 0 ? -dx : dx, ady = dy < 0 ? -dy : dy;
      const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
      const tDX = adx > 1e-12 ? CELL / adx : Infinity, tDY = ady > 1e-12 ? CELL / ady : Infinity;
      let tMX = adx > 1e-12 ? (dx > 0 ? cx + 1 - gx : gx - cx) * tDX : Infinity;
      let tMY = ady > 1e-12 ? (dy > 0 ? cy + 1 - gy : gy - cy) * tDY : Infinity;
      for (;;) {
        let t;
        if (tMX < tMY) { t = tMX; cx += stepX; tMX += tDX; }
        else { t = tMY; cy += stepY; tMY += tDY; }
        if (t >= maxDist) return maxDist;
        if (cx < 0 || cy < 0 || cx >= cols || cy >= rows || open[cy * cols + cx] === 0) return t;
      }
    }

    castRay(x, y, angle, maxDist) {
      if (!isNum(x) || !isNum(y) || !isNum(angle)) return 0;
      if (maxDist == null) maxDist = this.B.diag;
      return this._march(x, y, Math.cos(angle), Math.sin(angle), maxDist);
    }

    lineOfSight(x1, y1, x2, y2) {
      if (!isNum(x1) || !isNum(y1) || !isNum(x2) || !isNum(y2)) return false;
      const dx = x2 - x1, dy = y2 - y1;
      const d = Math.hypot(dx, dy);
      if (d < 1e-6) return true;
      return this._march(x1, y1, dx / d, dy / d, d) >= d - 1e-6;
    }

    visibility(x, y, radius, rays) {
      const n = Math.max(8, Math.min(4096, (rays | 0) || 360));
      if (!isNum(x) || !isNum(y)) return new Float32Array(0);
      let R = +radius;
      if (!(R > 0)) R = 0;
      if (R > this.B.diag) R = this.B.diag;
      const tab = trig(n), c = tab.c, s = tab.s;
      const d = new Float64Array(n);
      for (let k = 0; k < n; k++) d[k] = this._march(x, y, c[k], s[k], R);
      const out = new Float32Array(n * 6);
      let m = 0;
      const step = TAU / n, jump = CELL * 1.5;
      for (let k = 0; k < n; k++) {
        out[m++] = x + c[k] * d[k]; out[m++] = y + s[k] * d[k];
        const k2 = k + 1 === n ? 0 : k + 1;
        const d0 = d[k], d1 = d[k2];
        if (d0 - d1 > jump || d1 - d0 > jump) {
          // Binary refinement: find the exact angle of the shadow edge between the two rays.
          let lo = k * step, hi = lo + step, dlo = d0, dhi = d1;
          for (let it = 0; it < REFINE; it++) {
            const mid = (lo + hi) * 0.5;
            const dm = this._march(x, y, Math.cos(mid), Math.sin(mid), R);
            if (Math.abs(dm - dlo) <= Math.abs(dm - dhi)) { lo = mid; dlo = dm; } else { hi = mid; dhi = dm; }
          }
          out[m++] = x + Math.cos(lo) * dlo; out[m++] = y + Math.sin(lo) * dlo;
          out[m++] = x + Math.cos(hi) * dhi; out[m++] = y + Math.sin(hi) * dhi;
        }
      }
      return out.slice(0, m);
    }

    roomAt(x, y) {
      const c = this._cellIndex(x, y);
      if (c < 0) return null;
      const k = this.B.roomIdx[c];
      return k ? this.B.roomList[k - 1].id : null;
    }

    segmentClear(x1, y1, x2, y2, r) {
      if (r == null) r = PR;
      const dx = x2 - x1, dy = y2 - y1;
      const d = Math.hypot(dx, dy);
      if (!isFinite(d)) return false;
      const n = Math.max(1, Math.ceil(d / 5));
      for (let k = 1; k <= n; k++) {
        const t = k / n;
        if (!this.canStand(x1 + dx * t, y1 + dy * t, r)) return false;
      }
      return true;
    }

    nearestStandable(x, y, r) {
      if (r == null) r = PR;
      const B = this.B;
      const minX = B.ox + r, maxX = B.ox + B.cols * CELL - r, minY = B.oy + r, maxY = B.oy + B.rows * CELL - r;
      if (!isNum(x)) x = (minX + maxX) / 2;
      if (!isNum(y)) y = (minY + maxY) / 2;
      x = x < minX ? minX : x > maxX ? maxX : x;
      y = y < minY ? minY : y > maxY ? maxY : y;
      if (this.canStand(x, y, r)) return [x, y];
      const maxD = B.diag;
      let d = 1;
      while (d <= maxD) {
        const spacing = d < 100 ? 3 : Math.max(4, d / 30);
        const n = Math.max(8, Math.ceil((TAU * d) / spacing));
        for (let k = 0; k < n; k++) {
          const a = (k / n) * TAU;
          const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
          if (this.canStand(px, py, r)) return [px, py];
        }
        d += d < 40 ? 1.5 : d < 200 ? 4 : 10;
      }
      return [x, y];
    }

    randomPointInRoom(rng, roomId) {
      const room = this.B.roomById[roomId];
      if (!room || !room.rects.length) return null;
      const rnd = typeof rng === 'function' ? rng : Math.random;
      let area = 0;
      for (const r of room.rects) area += r[2] * r[3];
      for (let tries = 0; tries < 80; tries++) {
        let pickA = rnd() * area, rect = room.rects[0];
        for (const r of room.rects) { pickA -= r[2] * r[3]; if (pickA <= 0) { rect = r; break; } }
        const m = PR + 2;
        if (rect[2] <= 2 * m || rect[3] <= 2 * m) continue;
        const px = Math.round(rect[0] + m + rnd() * (rect[2] - 2 * m));
        const py = Math.round(rect[1] + m + rnd() * (rect[3] - 2 * m));
        if (this.canStand(px, py) && this.roomAt(px, py) === roomId) return [px, py];
      }
      const r0 = room.rects[0];
      const p = this.nearestStandable(r0[0] + r0[2] / 2, r0[1] + r0[3] / 2);
      return [p[0], p[1]];
    }

    boundary() {
      const B = this.B;
      if (!B.edges) B.edges = computeBoundary(B);
      return B.edges.slice();
    }

    // ---------------- path finding
    findPath(x1, y1, x2, y2) {
      if (!isNum(x1) || !isNum(y1) || !isNum(x2) || !isNum(y2)) return null;
      const B = this.B;
      let sx = x1, sy = y1;
      const lead = [];
      if (!this.canStand(sx, sy)) {
        const p = this.nearestStandable(sx, sy);
        sx = p[0]; sy = p[1];
        lead.push([r1(sx), r1(sy)]);
      }
      let gx = x2, gy = y2;
      if (!this.canStand(gx, gy)) { const p = this.nearestStandable(gx, gy); gx = p[0]; gy = p[1]; }
      const goal = [r1(gx), r1(gy)];
      const dd = Math.hypot(gx - sx, gy - sy);
      if (dd < 1) { lead.push(goal); return lead; }
      if (dd <= 320 && this.segmentClear(sx, sy, gx, gy)) { lead.push(goal); return lead; }
      const s = this._navNear(sx, sy), g = this._navNear(gx, gy);
      if (s < 0 || g < 0) return null;
      if (B.navComp[s] < 0 || B.navComp[s] !== B.navComp[g]) return null;
      const cells = s === g ? [s] : this._astar(s, g);
      if (!cells) return null;
      // Cell centers, keeping only turning points.
      const nc = B.navCols, half = NAV / 2;
      const pts = [[sx, sy]];
      for (let k = 0; k < cells.length; k++) {
        const c = cells[k];
        if (k > 0 && k < cells.length - 1) {
          const a = cells[k - 1], b = cells[k + 1];
          const d1x = (c % nc) - (a % nc), d1y = ((c / nc) | 0) - ((a / nc) | 0);
          const d2x = (b % nc) - (c % nc), d2y = ((b / nc) | 0) - ((c / nc) | 0);
          if (d1x === d2x && d1y === d2y) continue;
        }
        pts.push([B.ox + (c % nc) * NAV + half, B.oy + ((c / nc) | 0) * NAV + half]);
      }
      pts.push([gx, gy]);
      // String pulling: from each anchor jump to the farthest point reachable in a straight, clear line.
      const out = lead;
      let i = 0;
      while (i < pts.length - 1) {
        let j = i + 1;
        while (j + 1 < pts.length && this.segmentClear(pts[i][0], pts[i][1], pts[j + 1][0], pts[j + 1][1])) j++;
        out.push(j === pts.length - 1 ? goal : [r1(pts[j][0]), r1(pts[j][1])]);
        i = j;
      }
      return out;
    }

    _navNear(x, y) {
      const B = this.B, nc = B.navCols, nr = B.navRows;
      const ni = Math.floor((x - B.ox) / NAV), nj = Math.floor((y - B.oy) / NAV);
      for (let rad = 0; rad <= 4; rad++) {
        let best = -1, bestD = Infinity;
        for (let j = nj - rad; j <= nj + rad; j++) {
          if (j < 0 || j >= nr) continue;
          for (let i = ni - rad; i <= ni + rad; i++) {
            if (i < 0 || i >= nc) continue;
            if (Math.max(Math.abs(i - ni), Math.abs(j - nj)) !== rad) continue;
            const k = j * nc + i;
            if (!this.navOpen[k]) continue;
            const cx = B.ox + i * NAV + NAV / 2, cy = B.oy + j * NAV + NAV / 2;
            const d = (cx - x) * (cx - x) + (cy - y) * (cy - y);
            if (d < bestD && this.segmentClear(x, y, cx, cy)) { best = k; bestD = d; }
          }
        }
        if (best >= 0) return best;
      }
      return -1;
    }

    _astar(s, g) {
      const B = this.B, nc = B.navCols, nr = B.navRows, open = this.navOpen, S = B.scratch;
      let gen = ++S.gen;
      if (gen >= 0xfffffff0) { S.seen.fill(0); S.closed.fill(0); S.gen = gen = 1; }
      const gScore = S.g, parent = S.parent, seen = S.seen, closed = S.closed;
      const gi = g % nc, gj = (g / nc) | 0;
      const W = 1.001; // tie-breaker
      const hOf = (k) => {
        const dx = Math.abs((k % nc) - gi), dy = Math.abs(((k / nc) | 0) - gj);
        return (dx + dy + (SQRT2 - 2) * (dx < dy ? dx : dy)) * W;
      };
      S.size = 0;
      gScore[s] = 0; parent[s] = -1; seen[s] = gen;
      heapPush(S, s, hOf(s));
      while (S.size > 0) {
        const cur = heapPop(S);
        if (closed[cur] === gen) continue;
        closed[cur] = gen;
        if (cur === g) {
          const path = [];
          for (let c = g; c !== -1; c = parent[c]) path.push(c);
          path.reverse();
          return path;
        }
        const ci = cur % nc, cj = (cur / nc) | 0;
        const gc = gScore[cur];
        for (let d = 0; d < 8; d++) {
          const di = DI[d], dj = DJ[d];
          const ni = ci + di, nj = cj + dj;
          if (ni < 0 || nj < 0 || ni >= nc || nj >= nr) continue;
          const nk = nj * nc + ni;
          if (!open[nk] || closed[nk] === gen) continue;
          let cost = 1;
          if (di !== 0 && dj !== 0) {
            if (!open[cj * nc + ni] || !open[nj * nc + ci]) continue;
            cost = SQRT2;
          }
          const ng = gc + cost;
          if (seen[nk] !== gen || ng < gScore[nk]) {
            seen[nk] = gen; gScore[nk] = ng; parent[nk] = cur;
            heapPush(S, nk, ng + hOf(nk));
          }
        }
      }
      return null;
    }
  }

  const DI = [1, -1, 0, 0, 1, 1, -1, -1];
  const DJ = [0, 0, 1, -1, 1, -1, 1, -1];
  const r1 = (v) => Math.round(v * 10) / 10;

  function heapPush(S, node, key) {
    if (S.size >= S.heapN.length) {
      const n2 = new Int32Array(S.heapN.length * 2); n2.set(S.heapN); S.heapN = n2;
      const k2 = new Float64Array(S.heapK.length * 2); k2.set(S.heapK); S.heapK = k2;
    }
    const N = S.heapN, K = S.heapK;
    let i = S.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (K[p] <= key) break;
      N[i] = N[p]; K[i] = K[p]; i = p;
    }
    N[i] = node; K[i] = key;
  }

  function heapPop(S) {
    const N = S.heapN, K = S.heapK;
    const top = N[0];
    const size = --S.size;
    if (size > 0) {
      const node = N[size], key = K[size];
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= size) break;
        const r = l + 1;
        const c = r < size && K[r] < K[l] ? r : l;
        if (K[c] >= key) break;
        N[i] = N[c]; K[i] = K[c]; i = c;
      }
      N[i] = node; K[i] = key;
    }
    return top;
  }

  AS.Geo = {
    CELL,
    NAV_CELL: NAV,
    build(map, opts) {
      if (!map || typeof map !== 'object') throw new Error('[AS.Geo] build(map): no map');
      const key = map.id != null ? String(map.id) : null;
      const fresh = !!(opts && opts.nocache);
      let B = null;
      if (key != null && !fresh && cache[key] && cache[key].map === map) B = cache[key].base;
      if (!B) {
        B = buildBase(map);
        if (key != null) cache[key] = { map, base: B };
      }
      return new Geo(B);
    },
    clearCache() { for (const k in cache) delete cache[k]; },
  };
})(globalThis.AS = globalThis.AS || {});
