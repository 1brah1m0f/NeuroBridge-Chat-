/* AI IMPOSTOR: SPACE SHIP — world renderer (AS.Renderer). Owner: renderer. Contract §7.
 *
 *   AS.Renderer.init(App, canvas)                 attach to the #world canvas (DPR-aware, resizes itself every frame)
 *   AS.Renderer.render(dt)                        draw one frame from App.snap / App.view / App.map / App.geo
 *   AS.Renderer.worldToScreen(x, y) -> {x, y}     CSS px relative to the canvas' top-left
 *   AS.Renderer.screenToWorld(x, y) -> {x, y}
 *   AS.Renderer.drawMinimap(ctx, w, h, opts) -> layout
 *       opts: { markers: [{x, y, kind: 'task'|'sabotage'|'player'|'body'|'vent'|'ping', color}],
 *               dots: {roomId: count}, me: true | {x, y, color, hat}, labels: true,
 *               sabotageRooms: [roomId], doorRooms: [roomId] }
 *       (w, h) are in the ctx's current user units; the device resolution is read from ctx.getTransform().
 *   AS.Renderer.minimapLayout(w, h) -> { s, ox, oy, w, h, toMap(x, y) -> [mx, my], toWorld(mx, my) -> [x, y],
 *                                        roomCenter(roomId) -> [mx, my] | null }   (for placing DOM buttons)
 *   AS.Renderer.renderCamera(ctx, w, h, cx, cy, viewW, opts?)   security camera view, no fog; opts.tags (default true)
 *   AS.Renderer.shake(amount, time)               screen shake: amount ≈ CSS px, time in s
 *   AS.Renderer.flash(color, time)                full-screen flash (any CSS color, alpha honoured) fading over `time` s
 *   AS.Renderer.invalidate()                      drop cached static layers (map edited at runtime)
 *   AS.Renderer.stats                             { ms, chunks, built, entities } — perf readout
 *
 * Frame: starfield → cached static chunks (hull, wall caps, floors, edge shading, door tracks, north wall faces)
 *   → floor decals → vents → wall props → depth-sorted props / bodies / characters / ghosts / doors (with highlight
 *   outlines) → particles → vision fog → lights-out / alarm tints → vignette → name tags → screen flash.
 */
(function (AS) {
  'use strict';

  const T = AS.T || {};
  const U = AS.util || {};
  const FACE = T.WALL_FACE || 80;          // north wall face height
  const RIM = 24;                          // wall cap thickness
  const HULL = 58;                         // outer hull plating around the station silhouette
  const CHUNK = 1024;                      // static layer chunk size (world units)
  const CHUNK_BUDGET = 30e6;               // max cached chunk pixels (~120 MB)
  const TAG_UP = 104;                      // name tag baseline above the feet
  const FONT = 'Fredoka, Nunito, "Segoe UI", sans-serif';
  const INK = '#10131f';
  const YELLOW = '#ffd23f', RED = '#ff3b4e', ORANGE = '#ffab3d';
  const CAP = '#151a29', CAP_EDGE = '#59658a';
  const TAU = Math.PI * 2;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smoothK = (dt, rate) => 1 - Math.exp(-dt * rate);
  const hashStr = (s) => (U.hashString ? U.hashString(String(s)) : String(s).split('').reduce((h, c) => (Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0), 2166136261));
  const mkRng = (seed) => (U.rng ? U.rng(seed) : (() => { let a = seed >>> 0; return () => ((a = (Math.imul(a ^ (a >>> 15), 2246822507) + 0x9e3779b9) >>> 0) / 4294967296); })());
  const easeIO = (t) => t * t * (3 - 2 * t);

  if (AS.i18n) {
    AS.i18n.add({
      az: { 'render.you': 'Sən', 'render.live': 'CANLI', 'render.noSignal': 'Siqnal yoxdur' },
      en: { 'render.you': 'You', 'render.live': 'LIVE', 'render.noSignal': 'No signal' },
    });
  }
  const tr = (k) => (AS.t ? AS.t(k) : k);

  // ---------------------------------------------------------------- palettes
  const WALL = {
    metal: { hi: '#a9b8d2', face: '#7486a6', low: '#5b6b8a', low2: '#4a5774', band: '#2c3550', accent: '#52d6ff', base: '#252c40', pipe: '#9aa6bb', lamp: '#e9f6ff' },
    white: { hi: '#f6f8fc', face: '#d5dce8', low: '#b6c0d2', low2: '#a2adc2', band: '#66738c', accent: '#3fe4ff', base: '#555f76', pipe: '#c4ccda', lamp: '#ffffff' },
    dark: { hi: '#6c7592', face: '#474f66', low: '#373e52', low2: '#2d3344', band: '#1a1e2b', accent: '#ffd23f', base: '#14171f', pipe: '#6d7690', lamp: '#ffe8a3' },
    green: { hi: '#97d1a7', face: '#5d9b74', low: '#487f5d', low2: '#3c6b4e', band: '#20402c', accent: '#b6f66c', base: '#1b2f21', pipe: '#94aa9b', lamp: '#f1ffd8' },
    blue: { hi: '#91ace9', face: '#5975b9', low: '#46609c', low2: '#3a4f86', band: '#1e2b55', accent: '#64f1ff', base: '#17203e', pipe: '#95a7d0', lamp: '#def8ff' },
    orange: { hi: '#e7b07c', face: '#b97a42', low: '#985f2f', low2: '#814f27', band: '#3f2412', accent: '#ffd24c', base: '#2e1a0c', pipe: '#b9a492', lamp: '#fff0c4' },
    hall: { hi: '#95a3bf', face: '#677592', low: '#515d78', low2: '#444e66', band: '#252d42', accent: '#3fe0ff', base: '#1d2333', pipe: '#909bb1', lamp: '#e6f4ff' },
  };
  const WALL_BY_FLOOR = { white: 'white', grass: 'green', reactor: 'orange', dark: 'dark', blue: 'blue', wood: 'orange', carpet: 'blue', dropship: 'white', hazard: 'dark', concrete: 'metal', grate: 'metal', steel: 'metal', hall: 'hall' };
  const FLOOR_FB = { steel: '#66748d', white: '#d6dde7', dark: '#2f3546', grate: '#4b5568', carpet: '#7b4058', wood: '#8b5b37', grass: '#418f50', hazard: '#5f5f48', concrete: '#7c8087', blue: '#3e5b9f', reactor: '#4f3b3b', dropship: '#56637c', hall: '#535e75' };

  function colorOf(c) {
    if (c && AS.COLOR_BY_ID && AS.COLOR_BY_ID[c]) return AS.COLOR_BY_ID[c];
    if (typeof c === 'string' && c[0] === '#') return { main: c, shade: c };
    return { main: '#9aa4ba', shade: '#5d6680' };
  }

  // ---------------------------------------------------------------- state
  let App = null, canvas = null, ctx = null;
  let cssW = 0, cssH = 0, dpr = 1, zoom = 1, scale = 1, lastDprRaw = 0;
  let clock = 0, frameNo = 0;
  const cam = { x: 0, y: 0, ready: false };
  let curView = null;                         // last main view transform {s, dx, dy, ...}
  let shakeAmt = 0, shakeDur = 0, shakeLeft = 0, shakeX = 0, shakeY = 0;
  let flashColor = '#fff', flashDur = 0, flashLeft = 0;
  let world = null, worldMap = null, worldGeo = null, ownGeo = null;
  const doorAnim = {}, ventAnim = {}, visAlpha = {}, lastVentOf = {};
  const particles = [];
  let lightsAmt = 0, lightsFlicker = 0, visR = null, lastClosedKey = '';
  let lastState = null;
  const warned = {};
  const stats = { ms: 0, chunks: 0, built: 0, entities: 0 };
  const debug = { noCache: false };            // AS.Renderer.debug.noCache = true → draw static layers every frame

  function warnOnce(key, e) {
    if (warned[key]) return;
    warned[key] = true;
    try { console.warn('[Renderer] ' + key + ': ' + (e && e.message ? e.message : e)); } catch (er) { /* ignore */ }
  }
  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0);
    return c;
  }
  function rrPath(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.moveTo(x + r, y);
    g.lineTo(x + w - r, y);
    g.arcTo(x + w, y, x + w, y + r, r);
    g.lineTo(x + w, y + h - r);
    g.arcTo(x + w, y + h, x + w - r, y + h, r);
    g.lineTo(x + r, y + h);
    g.arcTo(x, y + h, x, y + h - r, r);
    g.lineTo(x, y + r);
    g.arcTo(x, y, x + r, y, r);
    g.closePath();
  }

  // ================================================================ world (static data built from map + geo)
  function fpRect(p) { // footprint [x0, y0, x1, y1]
    if (p.r) return [p.x - p.r, p.y - p.r, p.x + p.r, p.y + p.r];
    const w = p.w || 60, h = p.h || 40;
    if (p.wall) return [p.x - w / 2, p.y - h, p.x + w / 2, p.y];
    return [p.x - w / 2, p.y - h / 2, p.x + w / 2, p.y + h / 2];
  }
  function footBottom(p) {
    if (AS.Props && AS.Props.footprintBottom) { try { const v = AS.Props.footprintBottom(p); if (isFinite(v)) return v; } catch (e) { /* fall through */ } }
    return p.r ? p.y + p.r * 0.4 : p.y + (p.h || 40) / 2;
  }

  function computeBoundary(map) {
    const G = 10, W = Math.ceil((map.width || 6000) / G) + 2, H = Math.ceil((map.height || 4000) / G) + 2;
    const grid = new Uint8Array(W * H);
    const mark = (r) => {
      const x0 = Math.max(0, Math.floor(r[0] / G)), y0 = Math.max(0, Math.floor(r[1] / G));
      const x1 = Math.min(W, Math.ceil((r[0] + r[2]) / G)), y1 = Math.min(H, Math.ceil((r[1] + r[3]) / G));
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) grid[y * W + x] = 1;
    };
    for (const r of map.rooms || []) { mark(r.rect); for (const e of r.extra || []) mark(e); }
    for (const h of map.halls || []) mark(h.rect);
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : grid[y * W + x]);
    const out = [];
    for (let y = 0; y <= H; y++) {
      let run = null;
      for (let x = 0; x <= W; x++) {
        const a = x < W ? at(x, y - 1) : 0, b = x < W ? at(x, y) : 0;
        const side = a === b ? null : b ? 's' : 'n';
        if (run && run.side !== side) { out.push({ x1: run.x * G, y1: y * G, x2: x * G, y2: y * G, floor: run.side }); run = null; }
        if (side && !run) run = { x, side };
      }
    }
    for (let x = 0; x <= W; x++) {
      let run = null;
      for (let y = 0; y <= H; y++) {
        const a = y < H ? at(x - 1, y) : 0, b = y < H ? at(x, y) : 0;
        const side = a === b ? null : b ? 'e' : 'w';
        if (run && run.side !== side) { out.push({ x1: x * G, y1: run.y * G, x2: x * G, y2: y * G, floor: run.side }); run = null; }
        if (side && !run) run = { y, side };
      }
    }
    return out;
  }

  function buildWorld(map, geo) {
    const W = {
      map, geo, floors: [], solids: [], edges: [], faces: [], leds: [], lamps: [],
      floorProps: [], wallProps: [], props: [], doors: [], vents: [], ventById: {}, roomById: {},
      stations: {}, panels: {}, consoles: {}, buttonProp: null, sbounds: null,
    };
    const rooms = map.rooms || [];
    for (const r of rooms) W.roomById[r.id] = r;
    for (const h of map.halls || []) W.floors.push({ rect: h.rect, style: h.floor || 'hall', room: null, lobby: false });
    for (const r of rooms) {
      W.floors.push({ rect: r.rect, style: r.floor || 'steel', room: r.id, lobby: !!r.lobby });
      for (const e of r.extra || []) W.floors.push({ rect: e, style: r.floor || 'steel', room: r.id, lobby: !!r.lobby });
    }
    // station bounds (minimap) — everything but the lobby
    let sb = null;
    for (const f of W.floors) {
      if (f.lobby) continue;
      const r = f.rect;
      if (!sb) sb = [r[0], r[1], r[0] + r[2], r[1] + r[3]];
      else { sb[0] = Math.min(sb[0], r[0]); sb[1] = Math.min(sb[1], r[1]); sb[2] = Math.max(sb[2], r[0] + r[2]); sb[3] = Math.max(sb[3], r[1] + r[3]); }
    }
    W.sbounds = sb || [0, 0, map.width || 1000, map.height || 1000];

    let edges = null;
    if (geo && typeof geo.boundary === 'function') { try { edges = geo.boundary(); } catch (e) { warnOnce('geo.boundary', e); } }
    if (!edges || !edges.length) edges = computeBoundary(map);
    W.edges = edges.map((e) => ({
      x1: Math.min(e.x1, e.x2), x2: Math.max(e.x1, e.x2), y1: Math.min(e.y1, e.y2), y2: Math.max(e.y1, e.y2),
      floor: e.floor, h: e.y1 === e.y2,
    }));

    const roomAtFb = (x, y) => {
      for (const r of rooms) {
        if (U.pointInRect ? U.pointInRect(x, y, r.rect) : (x >= r.rect[0] && y >= r.rect[1] && x <= r.rect[0] + r.rect[2] && y <= r.rect[1] + r.rect[3])) return r.id;
        for (const e of r.extra || []) if (x >= e[0] && y >= e[1] && x <= e[0] + e[2] && y <= e[1] + e[3]) return r.id;
      }
      return null;
    };
    const roomAt = (x, y) => {
      if (geo && typeof geo.roomAt === 'function') { try { return geo.roomAt(x, y); } catch (e) { warnOnce('geo.roomAt', e); } }
      return roomAtFb(x, y);
    };
    const styleOf = (rid) => {
      if (!rid) return 'hall';
      const r = W.roomById[rid];
      if (!r) return 'hall';
      return (r.wall && WALL[r.wall] ? r.wall : WALL_BY_FLOOR[r.floor] || 'metal');
    };

    // props
    for (const p of map.props || []) {
      const f = fpRect(p);
      if (p.floor) W.floorProps.push({ p, b: [f[0] - 20, f[1] - 20, f[2] + 20, f[3] + 20] });
      else if (p.wall) W.wallProps.push({ p, b: [f[0] - 24, f[1] - 40, f[2] + 24, f[3] + 24] });
      else W.props.push({ p, key: footBottom(p), b: [f[0] - 50, f[1] - 260, f[2] + 50, f[3] + 30] });
      if (p.button) W.buttonProp = W.props[W.props.length - 1];
    }
    W.wallProps.sort((a, b) => a.p.y - b.p.y);

    // faces (north walls) split per wall style
    for (const e of W.edges) {
      if (!e.h || e.floor !== 's' || e.x2 - e.x1 < 1) continue;
      let cur = null;
      for (let x = e.x1; x < e.x2; x += 10) {
        const st = styleOf(roomAt(x + 5, e.y1 + 5));
        if (!cur || cur.style !== st) {
          if (cur) { cur.x2 = x; cur.joinR = true; W.faces.push(cur); }
          cur = { x1: x, x2: e.x2, y: e.y1, style: st, joinL: !!cur, joinR: false };
        }
      }
      if (cur) { cur.x2 = e.x2; W.faces.push(cur); }
    }
    for (const fc of W.faces) planFace(W, fc);

    for (const f of W.floors) W.solids.push(f.rect);
    for (const fc of W.faces) W.solids.push([fc.x1, fc.y - FACE, fc.x2 - fc.x1, FACE]);

    for (const d of map.doors || []) {
      const r = d.rect;
      const orient = d.orient || (r[2] >= r[3] ? 'h' : 'v');
      W.doors.push({ id: d.id, room: d.room, rect: r, orient, b: [r[0] - 30, r[1] - FACE - 30, r[0] + r[2] + 30, r[1] + r[3] + 30] });
    }
    for (const v of map.vents || []) { const o = { v, b: [v.x - 70, v.y - 70, v.x + 70, v.y + 60] }; W.vents.push(o); W.ventById[v.id] = v; }

    // interactables → the prop that represents them (outlined when highlighted)
    const allProps = W.props.concat(W.wallProps);
    const nearest = (x, y, maxD) => {
      let best = null, bd = maxD;
      for (const e of allProps) {
        const p = e.p;
        if (p.floor) continue;
        let r = fpRect(p);
        if (p.wall) r = [r[0], p.y - 12, r[2], p.y];
        const dx = Math.max(r[0] - x, 0, x - r[2]), dy = Math.max(r[1] - y, 0, y - r[3]);
        const d = Math.hypot(dx, dy);
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    };
    const assoc = (list, into) => { for (const o of list || []) into[o.id] = { x: o.x, y: o.y, e: nearest(o.x, o.y, 95) }; };
    assoc(map.stations, W.stations);
    assoc(map.panels, W.panels);
    assoc(map.consoles, W.consoles);
    return W;
  }

  function planFace(W, fc) {
    const rng = mkRng(hashStr(fc.x1 + ':' + fc.y + ':' + fc.style));
    const excl = [];
    for (const e of W.wallProps) {
      const p = e.p;
      if (Math.abs(p.y - fc.y) > 24) continue;
      const hw = (p.w || (p.r ? p.r * 2 : 60)) / 2 + 16;
      excl.push([p.x - hw, p.x + hw]);
    }
    const free = (a, b) => excl.every((r) => b < r[0] || a > r[1]);
    const items = [];
    let x = fc.x1 + 44 + rng() * 90;
    while (x < fc.x2 - 60) {
      const k = rng();
      const type = k < 0.3 ? 'lamp' : k < 0.52 ? 'pipe' : k < 0.68 ? 'grille' : k < 0.8 ? 'sign' : 'panel';
      let w = type === 'pipe' ? 110 + rng() * 170 : type === 'lamp' ? 36 : type === 'grille' ? 42 : type === 'sign' ? 34 : 46;
      if (x + w > fc.x2 - 34) w = fc.x2 - 34 - x;
      if (w >= 30 && free(x - 8, x + w + 8)) {
        const it = { type, x, w, v: rng() };
        items.push(it);
        const yt = fc.y - FACE;
        if (type === 'lamp') W.lamps.push({ x: x + w / 2, y: fc.y, c: WALL[fc.style].lamp });
        if (type === 'panel') {
          const cols = ['#4dff9a', '#ffd23f', '#ff5a6a', '#52d6ff'];
          for (let i = 0; i < 3; i++) W.leds.push({ x: x + 8 + i * 9, y: yt + 27, c: cols[(i + ((it.v * 7) | 0)) % 4], rate: 0.6 + rng() * 2.2, ph: rng() * 10 });
        }
      }
      x += Math.max(w, 30) + 64 + rng() * 170;
    }
    fc.decor = items;
  }

  function ensureWorld() {
    if (!App) return null;
    let map = App.map || null;
    if (!map && App.snap && AS.MAPS) map = AS.MAPS[App.snap.mapId] || null;
    if (!map) { world = null; return null; }
    let geo = App.geo || null;
    if (!geo && AS.Geo && typeof AS.Geo.build === 'function') {
      if (!ownGeo || ownGeo.map !== map) { try { ownGeo = { map, geo: AS.Geo.build(map) }; } catch (e) { warnOnce('Geo.build', e); ownGeo = { map, geo: null }; } }
      geo = ownGeo.geo;
    }
    if (map !== worldMap || geo !== worldGeo || !world) {
      worldMap = map; worldGeo = geo;
      world = buildWorld(map, geo);
      clearChunks();
      mm.base = null;
      lastClosedKey = '';
    }
    return world;
  }

  // ================================================================ static chunks
  const chunks = new Map();
  let chunkPx = 0;
  const canvasPool = [];
  function clearChunks() {
    for (const c of chunks.values()) if (c.canvas) canvasPool.push(c.canvas);
    chunks.clear(); chunkPx = 0;
    if (canvasPool.length > 8) canvasPool.length = 8;
  }
  function chunkAt(s, cx, cy, build) {
    const key = s.toFixed(5) + '|' + cx + '|' + cy;
    let c = chunks.get(key);
    if (c) { c.used = frameNo; return c; }
    if (!build) return null;
    c = buildChunk(s, cx, cy);
    c.used = frameNo;
    chunks.set(key, c);
    stats.built++;
    if (c.canvas) {
      chunkPx += c.canvas.width * c.canvas.height;
      if (chunkPx > CHUNK_BUDGET) evictChunks();
    }
    return c;
  }
  function evictChunks() {
    const arr = Array.from(chunks.entries()).filter((e) => e[1].canvas && e[1].used < frameNo).sort((a, b) => a[1].used - b[1].used);
    for (const [k, c] of arr) {
      if (chunkPx <= CHUNK_BUDGET * 0.8) break;
      chunkPx -= c.canvas.width * c.canvas.height;
      if (canvasPool.length < 6) canvasPool.push(c.canvas);
      chunks.delete(k);
    }
  }
  function buildChunk(s, cx, cy) {
    const X0 = cx * CHUNK, Y0 = cy * CHUNK, X1 = X0 + CHUNK, Y1 = Y0 + CHUNK;
    const px = Math.round(X0 * s), py = Math.round(Y0 * s);
    const pw = Math.round(X1 * s) - px, ph = Math.round(Y1 * s) - py;
    const m = HULL + 12;
    let any = false;
    for (const r of world.solids) {
      if (r[0] - m < X1 && r[0] + r[2] + m > X0 && r[1] - m < Y1 && r[1] + r[3] + m > Y0) { any = true; break; }
    }
    if (!any) return { canvas: null, px, py };
    let cv = null;
    for (let i = 0; i < canvasPool.length; i++) {
      if (canvasPool[i].width === pw && canvasPool[i].height === ph) { cv = canvasPool.splice(i, 1)[0]; break; }
    }
    if (!cv) cv = makeCanvas(pw, ph);
    const g = cv.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, pw, ph);
    g.setTransform(s, 0, 0, s, -px, -py);
    g.imageSmoothingEnabled = true;
    drawStatic(g, X0 - 1, Y0 - 1, X1 + 1, Y1 + 1);
    return { canvas: cv, px, py };
  }

  // hull plating pattern (128×128 world units, drawn at 2x)
  let hullTile = null;
  function hullPattern(g) {
    if (!hullTile) {
      const c = makeCanvas(256, 256), x = c.getContext('2d');
      x.fillStyle = '#0d1322'; x.fillRect(0, 0, 256, 256);
      for (let r = 0; r < 4; r++) {
        for (let q = -1; q < 3; q++) {
          const px = q * 128 + (r % 2 ? 64 : 0), py = r * 64;
          x.fillStyle = (r + q) % 2 ? '#0f1627' : '#0c1221';
          x.fillRect(px + 2, py + 2, 124, 60);
          x.fillStyle = 'rgba(120,150,220,0.06)'; x.fillRect(px + 2, py + 2, 124, 2);
          x.fillStyle = 'rgba(0,0,0,0.45)'; x.fillRect(px, py, 128, 2); x.fillRect(px, py, 2, 64);
          x.fillStyle = 'rgba(140,170,240,0.10)';
          for (const [ax, ay] of [[8, 8], [118, 8], [8, 54], [118, 54]]) x.fillRect(px + ax, py + ay, 3, 3);
        }
      }
      hullTile = c;
    }
    const pat = g.createPattern(hullTile, 'repeat');
    try { if (pat && pat.setTransform && typeof DOMMatrix !== 'undefined') pat.setTransform(new DOMMatrix([0.5, 0, 0, 0.5, 0, 0])); } catch (e) { /* ignore */ }
    return pat || '#0d1322';
  }

  function unionFill(g, rects, m, rad) {
    g.beginPath();
    for (const r of rects) rrPath(g, r[0] - m, r[1] - m, r[2] + 2 * m, r[3] + 2 * m, rad);
    g.fill();
  }

  function drawStatic(g, ax0, ay0, ax1, ay1) {
    const W = world;
    const hit = (r, m) => r[0] - m < ax1 && r[0] + r[2] + m > ax0 && r[1] - m < ay1 && r[1] + r[3] + m > ay0;
    const sol = W.solids.filter((r) => hit(r, HULL + 12));
    if (!sol.length) return;
    // 1. hull silhouette (soft outer glow, rim light, plating)
    g.fillStyle = 'rgba(70,120,255,0.07)'; unionFill(g, sol, HULL + 10, HULL + 10);
    g.fillStyle = '#2b3658'; unionFill(g, sol, HULL + 3, HULL + 3);
    g.fillStyle = hullPattern(g); unionFill(g, sol, HULL, HULL);
    // 2. wall caps + light inner edge
    g.fillStyle = CAP; unionFill(g, sol, RIM, 5);
    g.fillStyle = '#232a3f'; unionFill(g, sol, RIM - 3, 4);
    g.fillStyle = CAP; unionFill(g, sol, RIM - 5, 3);
    g.fillStyle = CAP_EDGE; unionFill(g, sol, 4.5, 2);
    // 3. floors (halls first so rooms cover the overlaps)
    for (const f of W.floors) if (hit(f.rect, 2)) drawFloorRect(g, f);
    // 4. light pools under wall lamps
    for (const l of W.lamps) {
      if (l.x < ax0 - 140 || l.x > ax1 + 140 || l.y < ay0 - 160 || l.y > ay1 + 160) continue;
      const gr = g.createRadialGradient(l.x, l.y, 4, l.x, l.y, 130);
      gr.addColorStop(0, 'rgba(255,248,220,0.13)');
      gr.addColorStop(1, 'rgba(255,248,220,0)');
      g.fillStyle = gr;
      g.fillRect(l.x - 130, l.y, 260, 130);
    }
    // 5. edge shading (ambient occlusion + face shadow)
    for (const e of W.edges) {
      if (e.x2 < ax0 - 40 || e.x1 > ax1 + 40 || e.y2 < ay0 - 40 || e.y1 > ay1 + 40) continue;
      let gr;
      if (e.h) {
        const len = e.x2 - e.x1;
        if (e.floor === 's') {
          gr = g.createLinearGradient(0, e.y1, 0, e.y1 + 34);
          gr.addColorStop(0, 'rgba(0,0,10,0.5)'); gr.addColorStop(0.35, 'rgba(0,0,10,0.2)'); gr.addColorStop(1, 'rgba(0,0,10,0)');
          g.fillStyle = gr; g.fillRect(e.x1, e.y1, len, 34);
        } else {
          gr = g.createLinearGradient(0, e.y1, 0, e.y1 - 18);
          gr.addColorStop(0, 'rgba(0,0,10,0.36)'); gr.addColorStop(1, 'rgba(0,0,10,0)');
          g.fillStyle = gr; g.fillRect(e.x1, e.y1 - 18, len, 18);
        }
      } else {
        const len = e.y2 - e.y1;
        if (e.floor === 'e') {
          gr = g.createLinearGradient(e.x1, 0, e.x1 + 18, 0);
          gr.addColorStop(0, 'rgba(0,0,10,0.34)'); gr.addColorStop(1, 'rgba(0,0,10,0)');
          g.fillStyle = gr; g.fillRect(e.x1, e.y1, 18, len);
        } else {
          gr = g.createLinearGradient(e.x1, 0, e.x1 - 18, 0);
          gr.addColorStop(0, 'rgba(0,0,10,0.34)'); gr.addColorStop(1, 'rgba(0,0,10,0)');
          g.fillStyle = gr; g.fillRect(e.x1 - 18, e.y1, 18, len);
        }
      }
    }
    // 6. door tracks (recessed slots in the floor)
    for (const d of W.doors) if (hit(d.rect, 30)) drawDoorTrack(g, d);
    // 7. north wall faces
    for (const fc of W.faces) {
      if (fc.x2 < ax0 - 4 || fc.x1 > ax1 + 4 || fc.y < ay0 - 4 || fc.y - FACE - 6 > ay1) continue;
      drawFace(g, fc);
    }
  }

  function drawFloorRect(g, f) {
    if (AS.Props && typeof AS.Props.drawFloor === 'function') {
      try { AS.Props.drawFloor(g, f.rect, f.style); return; } catch (e) { warnOnce('Props.drawFloor', e); }
    }
    const r = f.rect;
    g.fillStyle = FLOOR_FB[f.style] || FLOOR_FB.steel;
    g.fillRect(r[0], r[1], r[2], r[3]);
    const step = f.style === 'grass' ? 60 : 40;
    g.fillStyle = 'rgba(0,0,0,0.13)';
    for (let x = Math.ceil(r[0] / step) * step; x < r[0] + r[2]; x += step) g.fillRect(x, r[1], 1.5, r[3]);
    for (let y = Math.ceil(r[1] / step) * step; y < r[1] + r[3]; y += step) g.fillRect(r[0], y, r[2], 1.5);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let x = Math.ceil(r[0] / step) * step; x < r[0] + r[2]; x += step) g.fillRect(x + 1.5, r[1], 1, r[3]);
  }

  function hazard(g, x, y, w, h, sw, c1, c2) {
    g.save();
    g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.fillStyle = c1; g.fillRect(x, y, w, h);
    g.fillStyle = c2;
    g.beginPath();
    const p = sw * 2;
    for (let sx = Math.floor((x - h) / p) * p; sx < x + w + h; sx += p) {
      g.moveTo(sx, y + h); g.lineTo(sx + h, y); g.lineTo(sx + h + sw, y); g.lineTo(sx + sw, y + h); g.closePath();
    }
    g.fill();
    g.restore();
  }

  function drawDoorTrack(g, d) {
    const [x, y, w, h] = d.rect;
    if (d.orient === 'h') {
      const cy = y + h / 2;
      g.fillStyle = '#0e121d'; g.fillRect(x, cy - 6, w, 12);
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x, cy + 5, w, 1.5);
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x, cy - 6, w, 2);
      hazard(g, x, cy - 6, 18, 12, 4, '#f2c230', '#1a1a1a');
      hazard(g, x + w - 18, cy - 6, 18, 12, 4, '#f2c230', '#1a1a1a');
    } else {
      const cx = x + w / 2;
      g.fillStyle = '#0e121d'; g.fillRect(cx - 6, y, 12, h);
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(cx + 5, y, 1.5, h);
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(cx - 6, y, 2, h);
      hazard(g, cx - 6, y, 12, 18, 4, '#f2c230', '#1a1a1a');
      hazard(g, cx - 6, y + h - 18, 12, 18, 4, '#f2c230', '#1a1a1a');
    }
  }

  function drawFace(g, fc) {
    const st = WALL[fc.style] || WALL.metal;
    const x1 = fc.x1, x2 = fc.x2, yb = fc.y, yt = yb - FACE, len = x2 - x1;
    const gr = g.createLinearGradient(0, yt, 0, yb);
    gr.addColorStop(0, st.hi); gr.addColorStop(0.07, st.face); gr.addColorStop(0.5, st.face);
    gr.addColorStop(0.5, st.low); gr.addColorStop(1, st.low2);
    g.fillStyle = gr; g.fillRect(x1, yt, len, FACE);
    // top lip
    g.fillStyle = st.hi; g.fillRect(x1, yt, len, 3);
    g.fillStyle = 'rgba(0,0,0,0.24)'; g.fillRect(x1, yt + 3, len, 1.5);
    // accent band
    const by = yt + 38;
    g.fillStyle = st.band; g.fillRect(x1, by, len, 6);
    g.fillStyle = st.accent; g.globalAlpha = 0.8; g.fillRect(x1, by + 2, len, 2); g.globalAlpha = 1;
    g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(x1, by + 6, len, 1.2);
    // baseboard
    g.fillStyle = st.base; g.fillRect(x1, yb - 7, len, 7);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x1, yb - 7, len, 1);
    // panel seams + rivets
    const P = 100;
    for (let sx = Math.ceil((x1 + 24) / P) * P; sx < x2 - 24; sx += P) {
      g.fillStyle = 'rgba(0,0,0,0.30)';
      g.fillRect(sx - 1, yt + 5, 2, by - yt - 5); g.fillRect(sx - 1, by + 7, 2, yb - 7 - by - 7);
      g.fillStyle = 'rgba(255,255,255,0.13)';
      g.fillRect(sx + 1, yt + 5, 1, by - yt - 5); g.fillRect(sx + 1, by + 7, 1, yb - 7 - by - 7);
      g.fillStyle = 'rgba(0,0,0,0.32)';
      g.fillRect(sx - 8, yt + 9, 2.5, 2.5); g.fillRect(sx + 5.5, yt + 9, 2.5, 2.5);
      g.fillRect(sx - 8, yb - 14, 2.5, 2.5); g.fillRect(sx + 5.5, yb - 14, 2.5, 2.5);
    }
    for (const d of fc.decor) drawDecor(g, d, fc, st, yt, yb, by);
    // ends / style joins
    g.fillStyle = 'rgba(0,0,0,0.38)';
    if (!fc.joinL) g.fillRect(x1, yt, 3, FACE);
    if (!fc.joinR) g.fillRect(x2 - 3, yt, 3, FACE);
    if (fc.joinL) {
      g.fillStyle = '#2a3046'; g.fillRect(x1 - 5, yt, 10, FACE);
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x1 - 5, yt, 2, FACE);
      g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(x1 + 4, yt, 1.5, FACE);
    }
  }

  function drawDecor(g, d, fc, st, yt, yb, by) {
    const x = d.x, w = d.w;
    switch (d.type) {
      case 'lamp': {
        const ly = yt + 9;
        const gl = g.createRadialGradient(x + w / 2, ly + 4, 2, x + w / 2, ly + 4, 44);
        gl.addColorStop(0, 'rgba(255,250,225,0.42)'); gl.addColorStop(0.6, 'rgba(255,250,225,0.12)'); gl.addColorStop(1, 'rgba(255,250,225,0)');
        g.fillStyle = gl; g.fillRect(x + w / 2 - 44, yt + 3, 88, FACE - 10);
        g.fillStyle = INK; g.beginPath(); rrPath(g, x - 2, ly - 2, w + 4, 11, 4); g.fill();
        g.fillStyle = st.lamp; g.beginPath(); rrPath(g, x + 1, ly + 1, w - 2, 5, 2.5); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(x + 4, ly + 1.5, w - 8, 1.5);
        break;
      }
      case 'pipe': {
        const py = yt + 18 + Math.round(d.v * 10);
        const pg = g.createLinearGradient(0, py, 0, py + 9);
        pg.addColorStop(0, '#e8edf5'); pg.addColorStop(0.35, st.pipe); pg.addColorStop(1, '#3d4459');
        g.fillStyle = INK; g.fillRect(x - 1, py - 1, w + 2, 11);
        g.fillStyle = pg; g.fillRect(x, py, w, 9);
        for (let bx = x + 16; bx < x + w - 8; bx += 44) {
          g.fillStyle = INK; g.fillRect(bx - 1, py - 3, 6, 15);
          g.fillStyle = '#5c6580'; g.fillRect(bx, py - 2, 4, 13);
        }
        g.fillStyle = INK; g.fillRect(x - 4, py - 3, 6, 15); g.fillRect(x + w - 2, py - 3, 6, 15);
        if (d.v > 0.5) {
          const vx = x + w - 10, vh = yb - 7 - (py + 9);
          g.fillStyle = INK; g.fillRect(vx - 1, py + 4, 11, vh + 4);
          const vg = g.createLinearGradient(vx, 0, vx + 9, 0);
          vg.addColorStop(0, '#e8edf5'); vg.addColorStop(0.4, st.pipe); vg.addColorStop(1, '#3d4459');
          g.fillStyle = vg; g.fillRect(vx, py + 5, 9, vh + 2);
        }
        break;
      }
      case 'grille': {
        const gy = by + 12;
        g.fillStyle = INK; g.beginPath(); rrPath(g, x - 1.5, gy - 1.5, w + 3, 23, 4); g.fill();
        g.fillStyle = '#20263a'; g.beginPath(); rrPath(g, x, gy, w, 20, 3); g.fill();
        g.fillStyle = 'rgba(160,180,220,0.35)';
        for (let i = 0; i < 4; i++) g.fillRect(x + 4, gy + 3.5 + i * 4.3, w - 8, 1.6);
        break;
      }
      case 'sign': {
        const sy = yt + 13;
        g.fillStyle = INK; g.fillRect(x - 1.5, sy - 1.5, w + 3, 17);
        hazard(g, x, sy, w, 14, 5, '#f4c531', '#1c1c22');
        break;
      }
      case 'panel': {
        const py = yt + 12;
        g.fillStyle = INK; g.beginPath(); rrPath(g, x - 1.5, py - 1.5, w + 3, 25, 4); g.fill();
        g.fillStyle = '#2b3247'; g.beginPath(); rrPath(g, x, py, w, 22, 3); g.fill();
        g.fillStyle = '#10182a'; g.fillRect(x + 4, py + 3, w - 8, 7);
        g.fillStyle = 'rgba(82,214,255,0.55)'; g.fillRect(x + 6, py + 5, (w - 12) * (0.35 + d.v * 0.6), 3);
        g.fillStyle = 'rgba(0,0,0,0.5)';
        for (let i = 0; i < 3; i++) g.fillRect(x + 6 + i * 9, py + 13, 5, 5);
        break;
      }
    }
  }

  // ================================================================ starfield
  const STAR_LAYERS = [
    { size: 1024, par: 0.012, nebula: true },
    { size: 512, par: 0.03, n: 170, r: [0.35, 0.8], a: [0.2, 0.55] },
    { size: 512, par: 0.065, n: 60, r: [0.6, 1.15], a: [0.4, 0.85] },
    { size: 768, par: 0.12, n: 16, r: [1.0, 1.7], a: [0.75, 1], glow: true },
  ];
  let starTiles = null, starDpr = 0, bgGrad = null, bgKey = '';
  const twinkles = [];
  let shooting = null, nextShoot = 3;
  function buildStars() {
    starDpr = dpr;
    starTiles = STAR_LAYERS.map((L, li) => {
      const S = Math.round(L.size * dpr);
      const c = makeCanvas(S, S), x = c.getContext('2d');
      const rng = mkRng(9001 + li * 77);
      if (L.nebula) {
        const blobs = [['92,52,170', 0.16, 330], ['30,110,140', 0.14, 280], ['40,60,160', 0.15, 360], ['150,50,120', 0.08, 220], ['40,150,170', 0.07, 200]];
        for (const [rgb, a, rad] of blobs) {
          const bx = rng() * S, by = rng() * S, rr = rad * dpr;
          for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
            const gx = bx + ox * S, gy = by + oy * S;
            if (gx + rr < 0 || gx - rr > S || gy + rr < 0 || gy - rr > S) continue;
            const gr = x.createRadialGradient(gx, gy, 0, gx, gy, rr);
            gr.addColorStop(0, 'rgba(' + rgb + ',' + a + ')'); gr.addColorStop(0.55, 'rgba(' + rgb + ',' + a * 0.4 + ')'); gr.addColorStop(1, 'rgba(' + rgb + ',0)');
            x.fillStyle = gr; x.fillRect(gx - rr, gy - rr, rr * 2, rr * 2);
          }
        }
      } else {
        const tints = ['255,255,255', '200,220,255', '255,240,215', '190,255,250'];
        for (let i = 0; i < L.n; i++) {
          const sx = rng() * S, sy = rng() * S;
          const r = (L.r[0] + rng() * (L.r[1] - L.r[0])) * dpr, a = L.a[0] + rng() * (L.a[1] - L.a[0]);
          const tint = tints[(rng() * tints.length) | 0];
          if (L.glow) {
            const gr = x.createRadialGradient(sx, sy, 0, sx, sy, r * 5);
            gr.addColorStop(0, 'rgba(' + tint + ',' + a * 0.5 + ')'); gr.addColorStop(1, 'rgba(' + tint + ',0)');
            x.fillStyle = gr; x.fillRect(sx - r * 5, sy - r * 5, r * 10, r * 10);
          }
          x.fillStyle = 'rgba(' + tint + ',' + a + ')';
          x.beginPath(); x.arc(sx, sy, r, 0, TAU); x.fill();
        }
      }
      return { c, S, par: L.par };
    });
    twinkles.length = 0;
    const rng = mkRng(424242);
    for (let i = 0; i < 46; i++) twinkles.push({ x: rng() * 1600, y: rng() * 1000, r: 0.8 + rng() * 1.3, w: 0.8 + rng() * 2.6, ph: rng() * TAU, big: rng() < 0.22 });
  }
  function drawStarfield(g, W, H, cx, cy, dt) {
    if (!starTiles || starDpr !== dpr) buildStars();
    const key = W + 'x' + H;
    if (bgKey !== key) {
      bgKey = key;
      bgGrad = g.createLinearGradient(0, 0, W * 0.3, H);
      bgGrad.addColorStop(0, '#04060e'); bgGrad.addColorStop(0.55, '#070b1a'); bgGrad.addColorStop(1, '#0a0d22');
    }
    g.fillStyle = bgGrad; g.fillRect(0, 0, W, H);
    for (const L of starTiles) {
      const S = L.S;
      let ox = (-cx * zoom * L.par * dpr) % S; if (ox > 0) ox -= S;
      let oy = (-cy * zoom * L.par * dpr) % S; if (oy > 0) oy -= S;
      ox = Math.round(ox); oy = Math.round(oy);
      for (let x = ox; x < W; x += S) for (let y = oy; y < H; y += S) g.drawImage(L.c, x, y);
    }
    // twinkling stars
    const TW = 1600 * dpr, TH = 1000 * dpr;
    let tox = (-cx * zoom * 0.09 * dpr) % TW; if (tox > 0) tox -= TW;
    let toy = (-cy * zoom * 0.09 * dpr) % TH; if (toy > 0) toy -= TH;
    for (const s of twinkles) {
      const a = 0.25 + 0.75 * Math.pow(0.5 + 0.5 * Math.sin(clock * s.w + s.ph), 2);
      for (let bx = tox; bx < W; bx += TW) for (let by = toy; by < H; by += TH) {
        const x = bx + s.x * dpr, y = by + s.y * dpr;
        if (x < -10 || y < -10 || x > W + 10 || y > H + 10) continue;
        g.globalAlpha = a;
        g.fillStyle = '#fff';
        const r = s.r * dpr;
        g.fillRect(x - r * 0.5, y - r * 0.5, r, r);
        if (s.big) {
          g.globalAlpha = a * 0.55;
          g.fillRect(x - r * 3, y - 0.35 * dpr, r * 6, 0.7 * dpr);
          g.fillRect(x - 0.35 * dpr, y - r * 3, 0.7 * dpr, r * 6);
        }
      }
    }
    g.globalAlpha = 1;
    // shooting star
    nextShoot -= dt;
    if (!shooting && nextShoot <= 0) {
      const ang = 0.35 + Math.random() * 0.5, sp = (900 + Math.random() * 600) * dpr;
      const dir = Math.random() < 0.5 ? 1 : -1;
      shooting = { x: Math.random() * W, y: Math.random() * H * 0.5, vx: Math.cos(ang) * sp * dir, vy: Math.sin(ang) * sp, life: 0.7, max: 0.7 };
      nextShoot = 4 + Math.random() * 7;
    }
    if (shooting) {
      const s = shooting;
      s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.life <= 0) shooting = null;
      else {
        const k = s.life / s.max, tx = s.x - s.vx * 0.13, ty = s.y - s.vy * 0.13;
        const gr = g.createLinearGradient(s.x, s.y, tx, ty);
        gr.addColorStop(0, 'rgba(255,255,255,' + 0.9 * k + ')'); gr.addColorStop(1, 'rgba(160,220,255,0)');
        g.strokeStyle = gr; g.lineWidth = 2 * dpr; g.lineCap = 'round';
        g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(tx, ty); g.stroke();
      }
    }
  }

  // ================================================================ init / sizing / camera
  function init(app, cv) {
    App = app || App;
    canvas = cv || canvas || (typeof document !== 'undefined' ? document.getElementById('world') : null);
    if (!canvas) return;
    ctx = canvas.getContext('2d', { alpha: false }) || canvas.getContext('2d');
    if (App && !App.view) App.view = { me: null, players: {}, cam: { x: 0, y: 0, zoom: 1 }, highlights: {}, time: 0 };
    if (App && typeof App.on === 'function' && !App.__rendererHooked) {
      App.__rendererHooked = true;
      App.on('event', onEvent);
      App.on('phase', (phase) => {
        if (phase === 'meeting' || phase === 'lobby' || phase === 'intro' || phase === 'ejecting') { particles.length = 0; cam.ready = false; }
      });
    }
    checkSize();
  }

  function checkSize() {
    if (!canvas) return;
    const w = canvas.clientWidth || (typeof innerWidth !== 'undefined' ? innerWidth : 1280);
    const h = canvas.clientHeight || (typeof innerHeight !== 'undefined' ? innerHeight : 720);
    const raw = (typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1) || 1;
    if (w === cssW && h === cssH && raw === lastDprRaw && canvas.width > 1) return;
    let d = Math.min(raw, 2);
    const maxPx = 3.8e6;
    if (w * h * d * d > maxPx) d = Math.max(1, Math.sqrt(maxPx / (w * h)));
    cssW = w; cssH = h; lastDprRaw = raw;
    canvas.width = Math.max(1, Math.round(w * d));
    canvas.height = Math.max(1, Math.round(h * d));
    dpr = canvas.width / w;
    zoom = h / (h < 500 ? (T.VIEW_HEIGHT_SMALL || 700) : (T.VIEW_HEIGHT || 900));
    scale = zoom * dpr;
    vignette = null; bgKey = '';
  }

  function myId() { return (App && (App.myId != null ? App.myId : App.snap && App.snap.you)) || null; }

  function mePos(snap) {
    const v = App.view && App.view.me;
    if (v && isFinite(v.x) && isFinite(v.y)) return v;
    const id = myId();
    if (snap && snap.players) for (const p of snap.players) if (p.id === id && p.x != null) return p;
    return null;
  }

  function updateCamera(dt, snap) {
    const me = mePos(snap);
    let tx, ty;
    if (me) { tx = me.x; ty = me.y - 34; }
    else if (world) {
      const lob = (world.map.rooms || []).find((r) => r.lobby);
      const r = lob ? lob.rect : world.sbounds;
      tx = lob ? r[0] + r[2] / 2 : (r[0] + r[2]) / 2; ty = lob ? r[1] + r[3] / 2 : (r[1] + r[3]) / 2;
    } else { tx = cam.x; ty = cam.y; }
    if (!cam.ready || Math.hypot(tx - cam.x, ty - cam.y) > 520) { cam.x = tx; cam.y = ty; cam.ready = true; }
    else { const k = smoothK(dt, 11); cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k; }
    if (shakeLeft > 0) {
      shakeLeft = Math.max(0, shakeLeft - dt);
      const a = shakeAmt * Math.pow(shakeLeft / shakeDur, 1.6) / zoom;
      shakeX = (Math.sin(clock * 71.3) + Math.sin(clock * 37.1) * 0.6) * a * 0.62;
      shakeY = (Math.cos(clock * 63.7) + Math.sin(clock * 29.3) * 0.6) * a * 0.62;
    } else { shakeX = 0; shakeY = 0; }
  }

  function mainView() {
    const vw = cssW / zoom, vh = cssH / zoom;
    const cx = cam.x + shakeX, cy = cam.y + shakeY;
    const x0 = cx - vw / 2, y0 = cy - vh / 2;
    const dx = Math.round(x0 * scale), dy = Math.round(y0 * scale);
    const V = { s: scale, dx, dy, x0: dx / scale, y0: dy / scale, w: canvas.width, h: canvas.height };
    V.x1 = V.x0 + V.w / scale; V.y1 = V.y0 + V.h / scale;
    if (App.view) {
      const c = App.view.cam || (App.view.cam = {});
      c.x = V.x0 + vw / 2; c.y = V.y0 + vh / 2; c.zoom = zoom;
    }
    return V;
  }

  function worldToScreen(x, y) {
    const V = curView;
    if (!V) return { x: 0, y: 0 };
    return { x: (x * V.s - V.dx) / dpr, y: (y * V.s - V.dy) / dpr };
  }
  function screenToWorld(x, y) {
    const V = curView;
    if (!V) return { x: 0, y: 0 };
    return { x: (x * dpr + V.dx) / V.s, y: (y * dpr + V.dy) / V.s };
  }

  function shake(amount, time) {
    amount = Number(amount) || 8; time = Number(time) || 0.35;
    if (shakeLeft > 0 && shakeAmt * (shakeLeft / shakeDur) > amount) return;
    shakeAmt = amount; shakeDur = time; shakeLeft = time;
  }
  function flash(color, time) {
    flashColor = color || '#ffffff'; flashDur = Number(time) || 0.4; flashLeft = flashDur;
  }

  // ================================================================ events → effects
  function rand(a, b) { return a + Math.random() * (b - a); }
  function addP(o) { if (particles.length < 520) particles.push(o); }

  function visibleFx(x, y) {
    const st = lastState;
    if (!st || !st.fogOn || !st.me) return true;
    return canSeeRaw(st, x, y);
  }

  function onEvent(ev) {
    if (!ev || !ev.type) return;
    const me = myId();
    try {
      switch (ev.type) {
        case 'kill': {
          const mine = ev.killer === me || ev.victim === me;
          if (ev.x == null || (!mine && !visibleFx(ev.x, ev.y))) break;
          let col = '#ff5a6a';
          const vp = App.snap && App.snap.players && App.snap.players.find((p) => p.id === ev.victim);
          if (vp) col = colorOf(vp.color).main;
          killFx(ev.x, ev.y, col);
          if (mine) shake(ev.victim === me ? 16 : 10, 0.45); else shake(4, 0.25);
          break;
        }
        case 'vent': {
          if (ev.vent) ventAnim[ev.vent] = 1;
          const prev = lastVentOf[ev.player];
          if (ev.action === 'move' && prev && prev !== ev.vent) ventAnim[prev] = 1;
          lastVentOf[ev.player] = ev.action === 'exit' ? null : ev.vent;
          const v = world && world.ventById[ev.vent];
          const x = ev.x != null ? ev.x : v && v.x, y = ev.y != null ? ev.y : v && v.y;
          if (x != null && (ev.player === me || visibleFx(x, y))) ventPuff(x, y);
          break;
        }
        case 'taskStep':
          if (ev.to === me) taskFx(!!ev.done);
          break;
        case 'sabotage':
          if (ev.kind === 'lights') lightsFlicker = 0.9;
          else if (ev.kind === 'reactor' || ev.kind === 'o2') { flash('rgba(255,40,60,0.32)', 0.6); shake(5, 0.4); }
          break;
        case 'sabotageFixed':
          if (ev.kind === 'lights') flash('rgba(255,250,230,0.22)', 0.45);
          break;
        case 'doors':
          if (ev.closed && world) {
            for (const d of world.doors) {
              if (d.room !== ev.room) continue;
              const [x, y, w, h] = d.rect;
              if (!visibleFx(x + w / 2, y + h / 2)) continue;
              for (let i = 0; i < 7; i++) {
                const px = d.orient === 'h' ? x + Math.random() * w : x + w / 2 + rand(-10, 10);
                const py = d.orient === 'h' ? y + h + rand(-4, 6) : y + Math.random() * h;
                addP({ k: 'smoke', x: px, y: py, vx: rand(-30, 30), vy: rand(-26, -6), life: rand(0.5, 0.8), max: 0.8, size: rand(10, 18), color: '180,190,210' });
              }
            }
          }
          break;
        case 'phase':
          if (ev.phase === 'meeting' || ev.phase === 'lobby') particles.length = 0;
          break;
      }
    } catch (e) { warnOnce('onEvent', e); }
  }

  function killFx(x, y, col) {
    const cy = y - 30;
    addP({ k: 'ring', x, y: cy, life: 0.5, max: 0.5, size: 110, color: '#ffffff', w: 7 });
    addP({ k: 'ring', x, y: cy, life: 0.7, max: 0.7, size: 160, color: col, w: 5 });
    addP({ k: 'flare', x, y: cy, life: 0.28, max: 0.28, size: 120, color: '255,255,255' });
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * TAU, sp = rand(160, 430);
      addP({ k: 'shard', x, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 140, g: 720, drag: 1.6, life: rand(0.55, 0.95), max: 0.95, size: rand(6, 12), color: col, rot: Math.random() * TAU, vr: rand(-12, 12) });
    }
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * TAU, sp = rand(240, 560);
      addP({ k: 'spark', x, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 3.2, life: rand(0.25, 0.45), max: 0.45, size: rand(3, 6), color: '255,240,200' });
    }
  }
  function ventPuff(x, y) {
    for (let i = 0; i < 10; i++) {
      addP({ k: 'smoke', x: x + rand(-24, 24), y: y + rand(-10, 8), vx: rand(-40, 40), vy: rand(-80, -30), life: rand(0.5, 0.9), max: 0.9, size: rand(12, 22), color: '120,130,150' });
    }
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + rand(-1, 1);
      addP({ k: 'spark', x, y: y - 4, vx: Math.cos(a) * rand(120, 240), vy: Math.sin(a) * rand(120, 240), drag: 3, life: 0.35, max: 0.35, size: 3, color: '180,230,255' });
    }
  }
  function taskFx(done) {
    const me = App && App.view && App.view.me;
    if (!me) return;
    const n = done ? 22 : 10;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, sp = rand(60, done ? 260 : 170);
      addP({ k: 'star', x: me.x + rand(-20, 20), y: me.y - 40 + rand(-24, 24), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 90, drag: 2.2, life: rand(0.6, 1.1), max: 1.1, size: rand(6, done ? 13 : 9), color: Math.random() < 0.5 ? '255,215,70' : '90,235,255', rot: Math.random() * TAU, vr: rand(-5, 5) });
    }
    addP({ k: 'ring', x: me.x, y: me.y - 36, life: 0.55, max: 0.55, size: done ? 150 : 90, color: done ? '#ffd23f' : '#5be8ff', w: 4 });
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles[i] = particles[particles.length - 1]; particles.pop(); continue; }
      if (p.vx != null) {
        if (p.drag) { const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; }
        if (p.g) p.vy += p.g * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
      }
      if (p.vr) p.rot += p.vr * dt;
    }
  }
  function drawParticles(g, V) {
    for (const p of particles) {
      if (p.x < V.x0 - 200 || p.x > V.x1 + 200 || p.y < V.y0 - 200 || p.y > V.y1 + 200) continue;
      const k = clamp(p.life / p.max, 0, 1);
      switch (p.k) {
        case 'ring': {
          const r = p.size * (1 - Math.pow(k, 2.2));
          g.globalAlpha = k * 0.9;
          g.strokeStyle = p.color; g.lineWidth = p.w * (0.4 + k);
          g.beginPath(); g.ellipse(p.x, p.y, r, r * 0.72, 0, 0, TAU); g.stroke();
          break;
        }
        case 'flare': {
          const r = p.size * (1.2 - k * 0.4);
          const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
          gr.addColorStop(0, 'rgba(' + p.color + ',' + 0.85 * k + ')'); gr.addColorStop(1, 'rgba(' + p.color + ',0)');
          g.globalAlpha = 1; g.globalCompositeOperation = 'lighter';
          g.fillStyle = gr; g.fillRect(p.x - r, p.y - r, r * 2, r * 2);
          g.globalCompositeOperation = 'source-over';
          break;
        }
        case 'shard': {
          g.globalAlpha = Math.min(1, k * 1.6);
          g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
          g.fillStyle = INK; g.fillRect(-p.size / 2 - 1.5, -p.size / 3 - 1.5, p.size + 3, p.size * 0.66 + 3);
          g.fillStyle = p.color; g.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
          g.restore();
          break;
        }
        case 'spark': {
          g.globalAlpha = k; g.globalCompositeOperation = 'lighter';
          g.fillStyle = 'rgb(' + p.color + ')';
          g.beginPath(); g.arc(p.x, p.y, p.size * (0.5 + k * 0.5), 0, TAU); g.fill();
          g.globalCompositeOperation = 'source-over';
          break;
        }
        case 'star': {
          g.globalAlpha = Math.min(1, k * 1.8);
          g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
          const r = p.size * (0.6 + 0.4 * k);
          g.fillStyle = 'rgb(' + p.color + ')';
          g.beginPath();
          for (let i = 0; i < 8; i++) { const rr = i % 2 ? r * 0.36 : r; const a = (i / 8) * TAU; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
          g.closePath(); g.fill();
          g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(0, 0, r * 0.22, 0, TAU); g.fill();
          g.restore();
          break;
        }
        case 'smoke': {
          const r = p.size * (1.6 - k * 0.6);
          g.globalAlpha = k * 0.42;
          g.fillStyle = 'rgb(' + p.color + ')';
          g.beginPath(); g.arc(p.x, p.y, r, 0, TAU); g.fill();
          break;
        }
      }
    }
    g.globalAlpha = 1;
  }

  // ================================================================ fallbacks for missing art/props
  function fbCharacter(g, x, y, o, ghost) {
    const c = colorOf(o.color);
    g.save();
    g.globalAlpha = o.alpha == null ? 1 : o.alpha;
    g.translate(x, y);
    if ((o.facing || 1) < 0) g.scale(-1, 1);
    const t = o.t || 0, mv = o.moving ? 1 : 0;
    const bob = ghost ? Math.sin(t * 3) * 4 - 10 : mv * Math.abs(Math.sin(t * 11)) * -3;
    g.lineWidth = 4; g.strokeStyle = INK; g.lineJoin = 'round';
    if (!ghost) {
      const sw = mv * Math.sin(t * 11) * 6;
      g.fillStyle = c.shade;
      g.beginPath(); rrPath(g, -16 + sw, -16, 13, 16, 5); g.fill(); g.stroke();
      g.beginPath(); rrPath(g, 3 - sw, -16, 13, 16, 5); g.fill(); g.stroke();
    }
    g.fillStyle = c.shade; g.beginPath(); rrPath(g, -33, -50 + bob, 12, 26, 5); g.fill(); g.stroke();
    g.fillStyle = c.main; g.beginPath(); g.ellipse(0, -40 + bob, 26, 29, 0, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = '#1a2340'; g.beginPath(); g.ellipse(7, -46 + bob, 16, 13, 0, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = '#8ff6ff'; g.beginPath(); g.arc(2, -46 + bob, 3, 0, TAU); g.arc(12, -46 + bob, 3, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.ellipse(0, -52 + bob, 5, 2.5, -0.4, 0, TAU); g.fill();
    g.restore();
  }
  function fbBody(g, x, y, o) {
    const c = colorOf(o.color);
    g.save(); g.translate(x, y);
    if ((o.facing || 1) < 0) g.scale(-1, 1);
    g.lineWidth = 4; g.strokeStyle = INK;
    g.fillStyle = c.main; g.beginPath(); g.ellipse(0, -14, 30, 16, 0, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = '#1a2340'; g.beginPath(); g.ellipse(18, -18, 11, 9, 0, 0, TAU); g.fill(); g.stroke();
    g.strokeStyle = '#ff6b7a'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(14, -22); g.lineTo(21, -15); g.moveTo(21, -22); g.lineTo(14, -15); g.stroke();
    g.restore();
  }
  function fbProp(g, p) {
    const f = fpRect(p);
    g.save();
    g.lineWidth = 3; g.strokeStyle = INK;
    if (p.wall) {
      g.fillStyle = '#4a5674'; g.beginPath(); rrPath(g, f[0], f[1], f[2] - f[0], f[3] - f[1] - 6, 6); g.fill(); g.stroke();
      g.fillStyle = '#52d6ff'; g.fillRect(f[0] + 8, f[1] + 8, Math.max(4, f[2] - f[0] - 16), 6);
    } else if (p.floor) {
      g.fillStyle = 'rgba(80,110,160,0.35)'; g.beginPath();
      if (p.r) g.arc(p.x, p.y, p.r, 0, TAU); else rrPath(g, f[0], f[1], f[2] - f[0], f[3] - f[1], 8);
      g.fill();
    } else if (p.r) {
      const hgt = Math.min(60, p.r * 0.7);
      g.fillStyle = '#56627f'; g.beginPath(); g.ellipse(p.x, p.y, p.r, p.r * 0.62, 0, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = '#7d8aa8'; g.beginPath(); g.ellipse(p.x, p.y - hgt * 0.5, p.r * 0.92, p.r * 0.56, 0, 0, TAU); g.fill(); g.stroke();
    } else {
      const hgt = Math.min(50, (f[3] - f[1]) * 0.8);
      g.fillStyle = '#4c5774'; g.beginPath(); rrPath(g, f[0], f[1] - hgt + (f[3] - f[1]), f[2] - f[0], hgt, 6); g.fill(); g.stroke();
      g.fillStyle = '#7886a5'; g.beginPath(); rrPath(g, f[0], f[1] - hgt, f[2] - f[0], f[3] - f[1], 6); g.fill(); g.stroke();
    }
    g.restore();
  }
  function fbVent(g, x, y, open) {
    g.save();
    g.lineWidth = 3; g.strokeStyle = INK;
    g.fillStyle = '#0b0e16'; g.beginPath(); rrPath(g, x - 34, y - 20, 68, 40, 8); g.fill(); g.stroke();
    if (open < 0.5) {
      g.fillStyle = '#7a869f'; g.beginPath(); rrPath(g, x - 31, y - 17, 62, 34, 6); g.fill();
      g.fillStyle = '#3c465d';
      for (let i = 0; i < 4; i++) g.fillRect(x - 25, y - 11 + i * 7, 50, 3);
    } else {
      g.fillStyle = '#7a869f'; g.beginPath(); rrPath(g, x - 31, y - 17 - 26 * open, 62, 14, 5); g.fill(); g.stroke();
    }
    g.restore();
  }

  function drawProp(g, p, t) {
    if (AS.Props && typeof AS.Props.draw === 'function') {
      try { AS.Props.draw(g, p, t); return; } catch (e) { warnOnce('Props.draw ' + p.type, e); }
    }
    fbProp(g, p);
  }
  function drawVentArt(g, v, open, t) {
    if (AS.Props && typeof AS.Props.drawVent === 'function') {
      try { AS.Props.drawVent(g, v.x, v.y, open, t); return; } catch (e) { warnOnce('Props.drawVent', e); }
    }
    fbVent(g, v.x, v.y, open);
  }
  function drawCharArt(g, x, y, o) {
    if (AS.Art && typeof AS.Art.drawCharacter === 'function') {
      try { AS.Art.drawCharacter(g, x, y, o); return; } catch (e) { warnOnce('Art.drawCharacter', e); }
    }
    fbCharacter(g, x, y, o, false);
  }
  function drawGhostArt(g, x, y, o) {
    if (AS.Art && typeof AS.Art.drawGhost === 'function') {
      try { AS.Art.drawGhost(g, x, y, o); return; } catch (e) { warnOnce('Art.drawGhost', e); }
    }
    fbCharacter(g, x, y, Object.assign({}, o, { alpha: (o.alpha == null ? 1 : o.alpha) * 0.55 }), true);
  }
  function drawBodyArt(g, x, y, o) {
    if (AS.Art && typeof AS.Art.drawBody === 'function') {
      try { AS.Art.drawBody(g, x, y, o); return; } catch (e) { warnOnce('Art.drawBody', e); }
    }
    fbBody(g, x, y, o);
  }
  const artDrawsShadow = () => !!(AS.Art && (AS.Art.drawsShadow || AS.Art.SHADOW));
  function shadow(g, x, y, rx, a) {
    g.fillStyle = 'rgba(0,0,12,' + a + ')';
    g.beginPath(); g.ellipse(x, y, rx, rx * 0.36, 0, 0, TAU); g.fill();
  }

  // ================================================================ highlight outlines
  let olA = null, olB = null;
  function drawOutlined(g, V, bx, by, bw, bh, color, fn) {
    const s = V.s, pad = 8;
    const x0 = Math.floor(bx * s) / s, y0 = Math.floor(by * s) / s;
    const w = Math.ceil(bw * s) + pad * 2, h = Math.ceil(bh * s) + pad * 2;
    if (w > 1800 || h > 1800 || w < 4 || h < 4) { fn(g); return; }
    if (!olA) { olA = makeCanvas(w, h); olB = makeCanvas(w, h); }
    if (olA.width < w || olA.height < h) {
      olA.width = olB.width = Math.max(olA.width, w);
      olA.height = olB.height = Math.max(olA.height, h);
    }
    const a = olA.getContext('2d'), b = olB.getContext('2d');
    a.setTransform(1, 0, 0, 1, 0, 0); a.clearRect(0, 0, w + 2, h + 2);
    a.setTransform(s, 0, 0, s, pad - x0 * s, pad - y0 * s);
    fn(a);
    a.setTransform(1, 0, 0, 1, 0, 0);
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.globalCompositeOperation = 'source-over';
    b.clearRect(0, 0, w + 2, h + 2);
    b.drawImage(olA, 0, 0, w, h, 0, 0, w, h);
    b.globalCompositeOperation = 'source-in';
    b.fillStyle = color; b.fillRect(0, 0, w, h);
    b.globalCompositeOperation = 'source-over';
    const ox = x0 - pad / s, oy = y0 - pad / s, ww = w / s, hh = h / s;
    const pulse = 0.5 + 0.5 * Math.sin(clock * 6);
    const r = (2.6 + pulse * 1.2) * (dpr > 1.4 ? 1.4 : 1) / s;
    g.save();
    g.shadowColor = color; g.shadowBlur = (10 + pulse * 8) * dpr;
    g.globalAlpha = 0.65 + pulse * 0.25;
    g.drawImage(olB, 0, 0, w, h, ox, oy, ww, hh);
    g.shadowBlur = 0;
    g.globalAlpha = 1;
    for (let i = 0; i < 8; i++) {
      const an = (i / 8) * TAU;
      g.drawImage(olB, 0, 0, w, h, ox + Math.cos(an) * r, oy + Math.sin(an) * r, ww, hh);
    }
    g.restore();
    g.drawImage(olA, 0, 0, w, h, ox, oy, ww, hh);
  }
  function propBounds(p) {
    const f = fpRect(p);
    if (p.wall) return [f[0] - 14, f[1] - 30, f[2] - f[0] + 28, f[3] - f[1] + 44];
    if (p.floor) return [f[0] - 14, f[1] - 14, f[2] - f[0] + 28, f[3] - f[1] + 28];
    const up = p.type === 'engine' || p.type === 'reactor_core' ? 230 : p.type === 'tree' ? 200 : p.type === 'radar_dish' || p.type === 'shield_emitter' ? 180 : 150;
    return [f[0] - 26, f[1] - up, f[2] - f[0] + 52, f[3] - f[1] + up + 22];
  }
  function ring(g, x, y, color, r) {
    const pulse = 0.5 + 0.5 * Math.sin(clock * 6);
    g.save();
    g.strokeStyle = color; g.lineWidth = 4;
    g.shadowColor = color; g.shadowBlur = 12 * dpr;
    g.globalAlpha = 0.6 + pulse * 0.35;
    g.beginPath(); g.ellipse(x, y, r + pulse * 6, (r + pulse * 6) * 0.55, 0, 0, TAU); g.stroke();
    g.restore();
  }

  // ================================================================ per-frame state
  function frameState(snap, forCamera) {
    const id = myId();
    const st = {
      snap, myId: id, phase: snap ? snap.phase : null, meP: null, me: null, alive: true, dead: false, impostor: false,
      inVent: null, fogOn: false, R: 1e9, pl: {}, los: {}, hl: null, camera: !!forCamera,
    };
    if (snap && snap.players) for (const p of snap.players) { st.pl[p.id] = p; if (p.id === id) st.meP = p; }
    const self = (snap && snap.self) || {};
    st.alive = self.alive != null ? self.alive !== false : !(st.meP && st.meP.alive === false);
    st.dead = !st.alive;
    st.impostor = (self.role || (st.meP && st.meP.role)) === 'impostor';
    st.inVent = self.inVent || (st.meP && st.meP.inVent ? (self.inVent || true) : null);
    st.me = mePos(snap);
    const ph = st.phase;
    st.fogOn = !forCamera && !!st.me && !st.dead && ph !== 'lobby' && ph !== 'ended' && !!snap;
    st.R = visR != null ? visR : (self.visionRadius || T.BASE_VISION || 330);
    return st;
  }

  function canSeeRaw(st, x, y) {
    const dx = x - st.me.x, dy = y - st.me.y, R = st.R + 6;
    if (dx * dx + dy * dy > R * R) return false;
    const geo = world && world.geo;
    if (geo && typeof geo.lineOfSight === 'function') {
      try { return !!geo.lineOfSight(st.me.x, st.me.y, x, y); } catch (e) { warnOnce('geo.lineOfSight', e); }
    }
    return true;
  }
  function canSee(st, key, x, y) {
    if (!st.fogOn) return true;
    if (st.los[key] != null) return st.los[key];
    return (st.los[key] = canSeeRaw(st, x, y));
  }
  function fade(key, target, dt) {
    let a = visAlpha[key];
    if (a == null) a = target;
    a += (target - a) * smoothK(dt, 12);
    if (Math.abs(a - target) < 0.01) a = target;
    visAlpha[key] = a;
    return a;
  }

  function highlightInfo(st) {
    const H = { props: new Map(), vent: null, body: null, target: null, rings: [] };
    const hl = (App.view && App.view.highlights) || {};
    const W = world;
    const idOf = (v) => (v && typeof v === 'object' ? v.id : v);
    const use = (val, table, color) => {
      if (!val) return;
      const id = idOf(val);
      const o = table[id];
      if (o && o.e) H.props.set(o.e.p, color);
      else if (o) H.rings.push({ x: o.x, y: o.y, c: color });
      else if (typeof val === 'object' && val.x != null) H.rings.push({ x: val.x, y: val.y, c: color });
    };
    use(hl.station, W.stations, YELLOW);
    use(hl.panel, W.panels, YELLOW);
    use(hl.console, W.consoles, YELLOW);
    if (hl.button) {
      if (W.buttonProp) H.props.set(W.buttonProp.p, YELLOW);
      else if (W.map.button) H.rings.push({ x: W.map.button.x, y: W.map.button.y, c: YELLOW });
    }
    if (hl.vent) H.vent = idOf(hl.vent);
    if (hl.body) H.body = idOf(hl.body);
    if (hl.target) H.target = idOf(hl.target);
    return H;
  }

  // ================================================================ world pass (shared by main view + cameras)
  const ents = [];
  function drawWorld(g, V, st, dt, opts) {
    const W = world, t = clock;
    const inV = (b) => b[2] > V.x0 && b[0] < V.x1 && b[3] > V.y0 && b[1] < V.y1;
    // --- static chunks (or direct drawing when debug.noCache is set, for perf comparison)
    let n = 0;
    if (debug.noCache) {
      g.setTransform(V.s, 0, 0, V.s, -V.dx, -V.dy);
      drawStatic(g, V.x0, V.y0, V.x1, V.y1);
    } else {
      g.setTransform(1, 0, 0, 1, 0, 0);
      const cx0 = Math.floor(V.x0 / CHUNK), cx1 = Math.floor((V.x1 - 0.001) / CHUNK);
      const cy0 = Math.floor(V.y0 / CHUNK), cy1 = Math.floor((V.y1 - 0.001) / CHUNK);
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const c = chunkAt(V.s, cx, cy, true);
          if (c.canvas) { g.drawImage(c.canvas, c.px - V.dx, c.py - V.dy); n++; }
        }
      }
    }
    stats.chunks = n;
    g.setTransform(V.s, 0, 0, V.s, -V.dx, -V.dy);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.lineJoin = 'round'; g.lineCap = 'round';
    const H = st.hl;
    // --- floor decals
    for (const e of W.floorProps) {
      if (!inV(e.b)) continue;
      const hc = H && H.props.get(e.p);
      if (hc) { const b = propBounds(e.p); drawOutlined(g, V, b[0], b[1], b[2], b[3], hc, (c) => drawProp(c, e.p, t)); }
      else drawProp(g, e.p, t);
    }
    // --- vents
    for (const e of W.vents) {
      const v = e.v;
      if (!inV(e.b)) continue;
      let open = ventAnim[v.id] || 0;
      const mine = st.inVent && (st.inVent === v.id || (st.inVent === true && st.me && Math.hypot(st.me.x - v.x, st.me.y - v.y) < 8));
      if (mine) open = Math.max(open, 0.18);
      if (H && H.vent === v.id) drawOutlined(g, V, v.x - 60, v.y - 60, 120, 100, YELLOW, (c) => drawVentArt(c, v, open, t));
      else drawVentArt(g, v, open, t);
      if (mine) ventEyes(g, v.x, v.y);
    }
    // --- wall props (on north faces) + status LEDs
    for (const e of W.wallProps) {
      if (!inV(e.b)) continue;
      const hc = H && H.props.get(e.p);
      if (hc) { const b = propBounds(e.p); drawOutlined(g, V, b[0], b[1], b[2], b[3], hc, (c) => drawProp(c, e.p, t)); }
      else drawProp(g, e.p, t);
    }
    for (const l of W.leds) {
      if (l.x < V.x0 || l.x > V.x1 || l.y < V.y0 || l.y > V.y1) continue;
      const on = Math.sin(t * l.rate * 3 + l.ph) > -0.2;
      if (!on) continue;
      g.fillStyle = l.c; g.fillRect(l.x, l.y, 5, 5);
      g.globalAlpha = 0.35; g.fillRect(l.x - 2, l.y - 2, 9, 9); g.globalAlpha = 1;
    }
    // --- collect depth-sorted entities
    ents.length = 0;
    for (const e of W.props) if (inV(e.b)) ents.push({ k: e.key, o: 0, e });
    const snap = st.snap;
    const deadView = st.dead || st.phase === 'ended';
    if (snap && snap.bodies && st.phase !== 'lobby') {
      for (const b of snap.bodies) {
        if (b.x == null || b.x < V.x0 - 80 || b.x > V.x1 + 80 || b.y < V.y0 - 40 || b.y > V.y1 + 120) continue;
        const vis = opts.filter ? (canSee(st, 'b' + b.id, b.x, b.y) ? 1 : 0) : 1;
        const a = opts.filter ? fade('b' + b.id, vis, dt) : 1;
        if (a <= 0.02) continue;
        ents.push({ k: b.y + 2, o: 1, b, a });
      }
    }
    if (snap && snap.players) {
      const vp = (App.view && App.view.players) || {};
      for (const p of snap.players) {
        if (p.left) continue;
        let x, y, facing, moving;
        const self = p.id === st.myId;
        if (self) {
          if (st.inVent || p.inVent) continue;
          const m = st.me || p;
          if (m.x == null) continue;
          x = m.x; y = m.y; facing = m.facing != null ? m.facing : p.facing; moving = m.moving != null ? m.moving : p.moving;
        } else {
          if (p.x == null) continue;
          const s = vp[p.id];
          if (s && isFinite(s.x)) { x = s.x; y = s.y; facing = s.facing != null ? s.facing : p.facing; moving = s.moving != null ? s.moving : p.moving; }
          else { x = p.x; y = p.y; facing = p.facing; moving = p.moving; }
        }
        if (x < V.x0 - 80 || x > V.x1 + 80 || y < V.y0 - 20 || y > V.y1 + 140) continue;
        const ghost = p.alive === false;
        if (ghost && !deadView && !self) continue;
        let a = 1;
        if (opts.filter && !self && !ghost) a = fade('p' + p.id, canSee(st, 'p' + p.id, x, y) ? 1 : 0, dt);
        if (a <= 0.02) continue;
        ents.push({ k: y, o: 2, p, x, y, facing: facing || 1, moving: !!moving, ghost, a, self });
      }
    }
    for (const d of W.doors) {
      if (!inV(d.b)) continue;
      const c = easeIO(clamp(doorAnim[d.id] || 0, 0, 1));
      const [x, y, w, h] = d.rect;
      if (d.orient === 'h') ents.push({ k: y + h, o: 3, d, c, part: 0 });
      else { ents.push({ k: y + Math.max(8, (h / 2) * c), o: 3, d, c, part: 1 }); ents.push({ k: y + h, o: 3, d, c, part: 2 }); }
    }
    ents.sort((a, b) => a.k - b.k || a.o - b.o);
    stats.entities = ents.length;
    const noShadow = artDrawsShadow();
    const tags = [];
    for (const en of ents) {
      switch (en.o) {
        case 0: {
          const p = en.e.p, hc = H && H.props.get(p);
          if (hc) { const b = propBounds(p); drawOutlined(g, V, b[0], b[1], b[2], b[3], hc, (c) => drawProp(c, p, t)); }
          else drawProp(g, p, t);
          break;
        }
        case 1: {
          const b = en.b;
          const o = { color: b.color, scale: 1, facing: (hashStr(b.id) & 1) ? 1 : -1 };
          g.globalAlpha = en.a;
          if (H && H.body === b.id) drawOutlined(g, V, b.x - 75, b.y - 70, 150, 100, ORANGE, (c) => drawBodyArt(c, b.x, b.y, o));
          else drawBodyArt(g, b.x, b.y, o);
          g.globalAlpha = 1;
          break;
        }
        case 2: {
          const p = en.p;
          const o = { color: p.color, hat: p.hat, facing: en.facing, scale: 1, t: t + (hashStr(p.id) % 1000) / 137, moving: en.moving, alpha: en.a, eyes: 'normal', outline: true };
          if (en.ghost) {
            o.alpha = en.a * (en.self ? 0.8 : 0.62);
            drawGhostArt(g, en.x, en.y, o);
          } else {
            if (!noShadow) shadow(g, en.x, en.y, 26, 0.28 * en.a);
            if (p.scanning) scanUnder(g, en.x, en.y, t);
            if (H && H.target === p.id) drawOutlined(g, V, en.x - 60, en.y - 150, 120, 168, RED, (c) => drawCharArt(c, en.x, en.y, o));
            else drawCharArt(g, en.x, en.y, o);
            if (p.scanning) scanOver(g, en.x, en.y, t);
          }
          if (opts.tags && en.a > 0.05) tags.push(en);
          break;
        }
        case 3:
          drawDoor(g, en.d, en.c, en.part);
          break;
      }
    }
    g.globalAlpha = 1;
    if (H) for (const r of H.rings) ring(g, r.x, r.y, r.c, 46);
    drawParticles(g, V);
    return tags;
  }

  function ventEyes(g, x, y) {
    const blink = (clock % 3.4) < 0.12 ? 0.15 : 1;
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const ex of [-9, 9]) {
      const gr = g.createRadialGradient(x + ex, y - 2, 0, x + ex, y - 2, 12);
      gr.addColorStop(0, 'rgba(120,250,255,0.55)'); gr.addColorStop(1, 'rgba(120,250,255,0)');
      g.fillStyle = gr; g.fillRect(x + ex - 12, y - 14, 24, 24);
    }
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#cfffff';
    for (const ex of [-9, 9]) { g.beginPath(); g.ellipse(x + ex, y - 2, 3.6, 4.4 * blink, 0, 0, TAU); g.fill(); }
    g.restore();
  }

  function scanUnder(g, x, y, t) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const k = ((t * 0.9 + i / 3) % 1);
      g.globalAlpha = (1 - k) * 0.7;
      g.strokeStyle = '#3dff9e'; g.lineWidth = 3;
      const r = 20 + k * 46;
      g.beginPath(); g.ellipse(x, y - k * 10, r, r * 0.38, 0, 0, TAU); g.stroke();
    }
    g.restore();
  }
  function scanOver(g, x, y, t) {
    const k = 0.5 + 0.5 * Math.sin(t * 3.2);
    const ly = y - 6 - k * 78;
    g.save();
    g.globalCompositeOperation = 'lighter';
    const gr = g.createLinearGradient(0, ly - 16, 0, ly + 16);
    gr.addColorStop(0, 'rgba(60,255,160,0)'); gr.addColorStop(0.5, 'rgba(60,255,160,0.35)'); gr.addColorStop(1, 'rgba(60,255,160,0)');
    g.fillStyle = gr; g.fillRect(x - 34, ly - 16, 68, 32);
    g.fillStyle = 'rgba(190,255,220,0.9)'; g.fillRect(x - 32, ly - 1, 64, 2);
    const bg = g.createLinearGradient(0, y - 90, 0, y);
    bg.addColorStop(0, 'rgba(60,255,160,0)'); bg.addColorStop(1, 'rgba(60,255,160,0.16)');
    g.fillStyle = bg; g.beginPath(); g.moveTo(x - 40, y); g.lineTo(x - 30, y - 92); g.lineTo(x + 30, y - 92); g.lineTo(x + 40, y); g.closePath(); g.fill();
    g.restore();
  }

  // ---------------------------------------------------------------- doors
  function doorPost(g, bx, by, bw, bh, H, c) {
    const fy = by + bh - H;
    g.fillStyle = INK;
    g.fillRect(bx - 1.5, by - H - 1.5, bw + 3, bh + H + 3);
    g.fillStyle = '#69769a'; g.fillRect(bx, by - H, bw, bh);
    g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(bx, by - H, bw, 1.5);
    const gr = g.createLinearGradient(bx, 0, bx + bw, 0);
    gr.addColorStop(0, '#4c5878'); gr.addColorStop(0.5, '#3b4562'); gr.addColorStop(1, '#2a3149');
    g.fillStyle = gr; g.fillRect(bx, fy, bw, H);
    g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(bx, fy, bw, 1.5);
    hazard(g, bx, by + bh - 16, bw, 9, 4, '#f4c531', '#1c1d24');
    // status light: green when open -> red when closed
    const r = Math.round(60 + 195 * c), gC = Math.round(230 - 170 * c), b = Math.round(120 - 40 * c);
    const lx = bx + bw / 2, ly = fy + 12;
    g.fillStyle = INK; g.fillRect(lx - 3.5, ly - 3.5, 7, 7);
    g.fillStyle = 'rgb(' + r + ',' + gC + ',' + b + ')'; g.fillRect(lx - 2.5, ly - 2.5, 5, 5);
    g.save();
    g.globalCompositeOperation = 'lighter';
    const gl = g.createRadialGradient(lx, ly, 0, lx, ly, 12);
    gl.addColorStop(0, 'rgba(' + r + ',' + gC + ',' + b + ',0.55)'); gl.addColorStop(1, 'rgba(' + r + ',' + gC + ',' + b + ',0)');
    g.fillStyle = gl; g.fillRect(lx - 12, ly - 12, 24, 24);
    g.restore();
  }
  function drawDoor(g, d, c, part) {
    const [x, y, w, h] = d.rect;
    const DH = FACE;
    if (d.orient === 'h') {
      doorPost(g, x - 6, y, 12, h, DH + 4, c);
      doorPost(g, x + w - 6, y, 12, h, DH + 4, c);
      if (c > 0.002) {
        const half = (w / 2 - 6) * c;
        doorPanelH(g, x + 6, y, half, h, DH, false);
        doorPanelH(g, x + w - 6 - half, y, half, h, DH, true);
      }
    } else {
      const half = (h / 2 - 6) * c;
      if (part === 1) {
        doorPost(g, x, y - 6, w, 12, DH + 4, c);
        if (c > 0.002) doorPanelV(g, x, y + 6, w, half, DH, false);
      } else {
        if (c > 0.002) doorPanelV(g, x, y + h - 6 - half, w, half, DH, true);
        doorPost(g, x, y + h - 6, w, 12, DH + 4, c);
      }
    }
  }
  function doorPanelH(g, px, y, pw, h, DH, right) {
    if (pw < 0.5) return;
    const fy = y + h - DH;
    g.fillStyle = INK; g.fillRect(px - 1.5, y - DH - 1.5, pw + 3, h + DH + 3);
    // top surface
    g.fillStyle = '#c3cbdb'; g.fillRect(px, y - DH, pw, h);
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(px, y - DH + h / 2 - 1, pw, 2);
    // front face
    const gr = g.createLinearGradient(0, fy, 0, fy + DH);
    gr.addColorStop(0, '#a7b0c3'); gr.addColorStop(0.55, '#7e889f'); gr.addColorStop(1, '#5f687e');
    g.fillStyle = gr; g.fillRect(px, fy, pw, DH);
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(px, fy, pw, 2);
    // window slot
    if (pw > 26) {
      const wx = right ? px + 10 : px + pw - 10 - Math.min(26, pw - 20);
      const ww = Math.min(26, pw - 20);
      g.fillStyle = '#1a2236'; g.fillRect(wx, fy + 10, ww, 14);
      g.fillStyle = 'rgba(120,220,255,0.35)'; g.fillRect(wx + 2, fy + 12, ww - 4, 3);
    }
    hazard(g, px, fy + DH - 30, pw, 18, 7, '#f4c531', '#1c1d24');
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(px, fy + DH - 12, pw, 12);
    // meeting seam
    g.fillStyle = INK;
    g.fillRect(right ? px : px + pw - 3, y - DH, 3, h + DH);
    g.fillStyle = 'rgba(255,90,90,0.9)';
    g.fillRect(right ? px + 4 : px + pw - 8, fy + 34, 4, 4);
  }
  function doorPanelV(g, x, py, w, ph, DH, bottom) {
    if (ph < 0.5) return;
    g.fillStyle = INK; g.fillRect(x - 1.5, py - DH - 1.5, w + 3, ph + DH + 3);
    // long top surface with hazard stripes
    hazard(g, x, py - DH, w, ph, 7, '#f4c531', '#1c1d24');
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x, py - DH, 2, ph);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + w - 3, py - DH, 3, ph);
    // front face
    const gr = g.createLinearGradient(0, py + ph - DH, 0, py + ph);
    gr.addColorStop(0, '#a7b0c3'); gr.addColorStop(1, '#5f687e');
    g.fillStyle = gr; g.fillRect(x, py + ph - DH, w, DH);
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x, py + ph - DH, w, 2);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x, py + ph - 12, w, 12);
    g.fillStyle = INK; g.fillRect(x, bottom ? py - DH : py + ph - DH - 2, w, 3);
  }

  // ---------------------------------------------------------------- fog of war
  let fogCv = null, fogCtx = null;
  const visCache = { key: '', path: null, wallPath: null };
  function visPoly(st) {
    const geo = world.geo, me = st.me, R = st.R;
    const key = Math.round(me.x * 2) + ',' + Math.round(me.y * 2) + ',' + Math.round(R) + ',' + lastClosedKey;
    if (visCache.key === key) return visCache;
    let poly = null;
    if (geo && typeof geo.visibility === 'function') {
      try { poly = geo.visibility(me.x, me.y, R, 360); } catch (e) { warnOnce('geo.visibility', e); }
    }
    const path = new Path2D(), wall = new Path2D();
    if (poly && poly.length >= 6) {
      const n = poly.length / 2;
      path.moveTo(poly[0], poly[1]);
      for (let i = 1; i < n; i++) path.lineTo(poly[i * 2], poly[i * 2 + 1]);
      path.closePath();
      // wall-hit runs (rays that stopped before the radius) → used to reveal the wall caps
      let open = false, px = 0, py = 0;
      for (let i = 0; i <= n; i++) {
        const j = i % n, x = poly[j * 2], y = poly[j * 2 + 1];
        const hitWall = Math.hypot(x - me.x, y - me.y) < R - 3;
        if (hitWall && open && Math.hypot(x - px, y - py) < 46) wall.lineTo(x, y);
        else if (hitWall) wall.moveTo(x, y);
        open = hitWall; px = x; py = y;
      }
    } else {
      path.arc(me.x, me.y, R, 0, TAU);
    }
    visCache.key = key; visCache.path = path; visCache.wallPath = wall;
    return visCache;
  }
  function drawFog(V, st) {
    const fw = Math.ceil(V.w / 2), fh = Math.ceil(V.h / 2);
    if (!fogCv) { fogCv = makeCanvas(fw, fh); fogCtx = fogCv.getContext('2d'); }
    if (fogCv.width !== fw || fogCv.height !== fh) { fogCv.width = fw; fogCv.height = fh; }
    const f = fogCtx;
    const lightsDark = lightsAmt * (st.impostor ? 0 : 1);
    f.setTransform(1, 0, 0, 1, 0, 0);
    f.globalCompositeOperation = 'source-over';
    f.clearRect(0, 0, fw, fh);
    f.fillStyle = 'rgba(4,6,14,' + (0.88 + 0.075 * lightsDark).toFixed(3) + ')';
    f.fillRect(0, 0, fw, fh);
    const fs = V.s / 2;
    f.setTransform(fs, 0, 0, fs, -V.dx / 2, -V.dy / 2);
    f.globalCompositeOperation = 'destination-out';
    const R = st.R, mx = st.me.x, my = st.me.y;
    const vc = visPoly(st);
    const edge = Math.min(0.3, 80 / Math.max(1, R));
    const gr = f.createRadialGradient(mx, my, 0, mx, my, R);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1 - edge, 'rgba(0,0,0,1)');
    gr.addColorStop(1 - edge * 0.45, 'rgba(0,0,0,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    f.fillStyle = gr; f.strokeStyle = gr;
    f.lineJoin = 'round'; f.lineCap = 'butt'; f.lineWidth = RIM * 2 + 8;
    f.fill(vc.path);
    f.stroke(vc.wallPath);
    // north wall faces above the visible floor edges: same polygon shifted up by the face height
    let any = false;
    f.save();
    f.beginPath();
    for (const fc of world.faces) {
      if (fc.x2 < mx - R - 40 || fc.x1 > mx + R + 40 || fc.y < my - R - 10 || fc.y - FACE > my + R) continue;
      f.rect(fc.x1 - RIM - 4, fc.y - FACE - RIM - 6, fc.x2 - fc.x1 + RIM * 2 + 8, FACE + RIM + 6);
      any = true;
    }
    for (const d of world.doors) {
      const r = d.rect;
      if (r[0] > mx + R + 40 || r[0] + r[2] < mx - R - 40 || r[1] > my + R + 10 || r[1] + r[3] < my - R - 10) continue;
      f.rect(r[0] - 10, r[1] - FACE - 14, r[2] + 20, r[3] + FACE + 14);
      any = true;
    }
    if (any) {
      f.clip();
      f.translate(0, -FACE);
      f.fill(vc.path);
      f.stroke(vc.wallPath);
    }
    f.restore();
    f.globalCompositeOperation = 'source-over';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(fogCv, 0, 0, fw, fh, 0, 0, fw * 2, fh * 2);
  }

  // ---------------------------------------------------------------- overlays
  let vignette = null;
  function drawVignette(alpha) {
    const W = canvas.width, H = canvas.height;
    if (!vignette) {
      vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.38, W / 2, H / 2, Math.hypot(W, H) * 0.62);
      vignette.addColorStop(0, 'rgba(0,0,8,0)'); vignette.addColorStop(1, 'rgba(0,0,8,0.5)');
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = vignette; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
  function drawTints(st, dt) {
    const W = canvas.width, H = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (lightsAmt > 0.005) {
      let a = lightsAmt * (st.dead ? 0.1 : st.impostor ? 0.14 : 0.12);
      if (lightsFlicker > 0) a *= (Math.sin(clock * 47) > 0.1 ? 1.5 : 0.35);
      ctx.fillStyle = 'rgba(2,5,22,' + clamp(a, 0, 0.6).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    const sab = st.snap && st.snap.sabotage;
    if (sab && (sab.kind === 'reactor' || sab.kind === 'o2') && st.phase === 'playing') {
      const a = 0.045 + 0.055 * (0.5 + 0.5 * Math.sin(clock * 5.2));
      ctx.fillStyle = 'rgba(255,30,50,' + a.toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }
  }
  function drawFlash(dt) {
    if (flashLeft <= 0) return;
    flashLeft = Math.max(0, flashLeft - dt);
    const k = Math.pow(flashLeft / flashDur, 1.4);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = k;
    ctx.fillStyle = flashColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
  }
  function drawTags(g, V, st, list, sizeCss, ds) {
    if (!list.length) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    const px = Math.round(sizeCss * ds);
    g.font = '700 ' + px + 'px ' + FONT;
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.lineJoin = 'round';
    for (const en of list) {
      const p = en.p;
      const name = String(p.name || '');
      if (!name) continue;
      const sx = en.x * V.s - V.dx, sy = (en.y - (en.ghost ? TAG_UP + 12 : TAG_UP)) * V.s - V.dy;
      const red = (st.impostor || st.phase === 'ended') && p.role === 'impostor';
      g.globalAlpha = en.a * (en.ghost ? 0.75 : 1);
      g.lineWidth = Math.max(3, px * 0.24);
      g.strokeStyle = 'rgba(6,8,18,0.92)';
      g.strokeText(name, sx, sy);
      g.fillStyle = red ? '#ff4f61' : en.ghost ? '#dfe8ff' : '#ffffff';
      g.fillText(name, sx, sy);
    }
    g.globalAlpha = 1;
  }

  // ================================================================ main render
  function render(dt) {
    if (!ctx || !canvas || !App) return;
    const t0 = (typeof performance !== 'undefined' ? performance.now() : 0);
    dt = dt > 0 ? Math.min(dt, 0.1) : 0;
    clock += dt; frameNo++;
    checkSize();
    ensureWorld();
    const snap = App.snap;
    // animated state
    updateParticles(dt);
    for (const k in ventAnim) { ventAnim[k] = Math.max(0, ventAnim[k] - dt * 1.4); if (!ventAnim[k]) delete ventAnim[k]; }
    if (lightsFlicker > 0) lightsFlicker = Math.max(0, lightsFlicker - dt);
    const lightsTarget = snap && snap.sabotage && snap.sabotage.kind === 'lights' && snap.phase === 'playing' ? 1 : 0;
    lightsAmt += (lightsTarget - lightsAmt) * smoothK(dt, 2.6);
    if (Math.abs(lightsAmt - lightsTarget) < 0.003) lightsAmt = lightsTarget;
    const targetR = (snap && snap.self && snap.self.visionRadius) || (T.BASE_VISION || 330);
    visR = visR == null || !isFinite(visR) ? targetR : visR + (targetR - visR) * smoothK(dt, 3.2);
    if (Math.abs(visR - targetR) < 0.5) visR = targetR;
    if (world) {
      const closed = (snap && snap.doors) || {};
      for (const d of world.doors) {
        const target = closed[d.id] != null && snap.phase !== 'meeting' ? 1 : 0;
        const cur = doorAnim[d.id] || 0;
        doorAnim[d.id] = target > cur ? Math.min(1, cur + dt / 0.22) : Math.max(0, cur - dt / 0.38);
      }
      const ck = Object.keys(closed).sort().join(',');
      if (ck !== lastClosedKey) {
        lastClosedKey = ck;
        // main.js syncs App.geo itself; only drive the geo this module had to build on its own
        if (ownGeo && world.geo === ownGeo.geo && world.geo && typeof world.geo.setDoors === 'function') {
          try { world.geo.setDoors(Object.keys(closed)); } catch (e) { warnOnce('geo.setDoors', e); }
        }
      }
    }
    updateCamera(dt, snap);
    const V = mainView();
    curView = V;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    drawStarfield(ctx, V.w, V.h, cam.x, cam.y, dt);
    if (!world || !snap) {
      drawVignette(0.8);
      drawFlash(dt);
      stats.ms = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
      return;
    }
    const st = frameState(snap, false);
    st.hl = highlightInfo(st);
    lastState = st;
    const tags = drawWorld(ctx, V, st, dt, { filter: st.fogOn, tags: true });
    if (st.fogOn) drawFog(V, st);
    drawTints(st, dt);
    drawVignette(st.phase === 'lobby' ? 0.65 : 1);
    if (st.phase !== 'meeting' && st.phase !== 'ejecting') {
      const sz = clamp(20 * zoom, 14, 24);
      drawTags(ctx, V, st, tags, sz, dpr);
    }
    drawFlash(dt);
    // warm up neighbouring chunks when the frame was cheap
    const now = (typeof performance !== 'undefined' ? performance.now() : 0);
    if (now - t0 < 7) prebuild(V);
    stats.ms = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
  }

  function prebuild(V) {
    const cx0 = Math.floor(V.x0 / CHUNK) - 1, cx1 = Math.floor(V.x1 / CHUNK) + 1;
    const cy0 = Math.floor(V.y0 / CHUNK) - 1, cy1 = Math.floor(V.y1 / CHUNK) + 1;
    const mw = world.map.width || 1e5, mh = world.map.height || 1e5;
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        if (cx < -1 || cy < -1 || cx * CHUNK > mw + CHUNK || cy * CHUNK > mh + CHUNK) continue;
        if (!chunkAt(V.s, cx, cy, false)) { chunkAt(V.s, cx, cy, true); return; }
      }
    }
  }

  // ================================================================ security cameras
  function renderCamera(g, w, h, cx, cy, viewW, opts) {
    if (!g) return;
    opts = opts || {};
    ensureWorld();
    const m = g.getTransform ? g.getTransform() : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    const ds = Math.hypot(m.a, m.b) || 1;
    g.save();
    g.beginPath(); g.rect(0, 0, w, h); g.clip();
    g.fillStyle = '#04060d'; g.fillRect(0, 0, w, h);
    if (!world) {
      g.fillStyle = '#7f8bb0'; g.font = '700 ' + Math.round(Math.max(10, h * 0.08)) + 'px ' + FONT;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(tr('render.noSignal'), w / 2, h / 2);
      g.restore();
      return;
    }
    viewW = viewW || 900;
    const s = (w / viewW) * ds;
    const viewH = (viewW * h) / w;
    const ox = m.e, oy = m.f;
    const x0 = cx - viewW / 2, y0 = cy - viewH / 2;
    const dx = Math.round(x0 * s - ox), dy = Math.round(y0 * s - oy);
    const V = { s, dx, dy, w: Math.round(w * ds), h: Math.round(h * ds) };
    V.x0 = (dx + ox) / s; V.y0 = (dy + oy) / s; V.x1 = V.x0 + viewW + 1; V.y1 = V.y0 + viewH + 1;
    const snap = App && App.snap;
    const st = frameState(snap, true);
    st.hl = null;
    const tags = drawWorld(g, V, st, 0, { filter: false, tags: opts.tags !== false });
    if (opts.tags !== false) drawTags(g, V, st, tags, clamp(13 * (s / ds) * 1.4, 9, 14), ds);
    if (lightsAmt > 0.01) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = 'rgba(2,5,22,' + (lightsAmt * 0.35).toFixed(3) + ')';
      g.fillRect(ox, oy, w * ds, h * ds);
    }
    g.restore();
  }

  // ================================================================ minimap
  const mm = { base: null, key: '' };
  function minimapLayout(w, h) {
    ensureWorld();
    const b = world ? world.sbounds : [0, 0, 1000, 1000];
    const pad = Math.max(8, Math.min(w, h) * 0.045);
    const bw = b[2] - b[0], bh = b[3] - b[1];
    const s = Math.min((w - pad * 2) / bw, (h - pad * 2) / bh);
    const ox = (w - bw * s) / 2 - b[0] * s, oy = (h - bh * s) / 2 - b[1] * s;
    return {
      s, ox, oy, w, h,
      toMap: (x, y) => [ox + x * s, oy + y * s],
      toWorld: (mx, my) => [(mx - ox) / s, (my - oy) / s],
      roomCenter: (id) => {
        const r = world && world.roomById[id];
        if (!r) return null;
        const c = r.label || [r.rect[0] + r.rect[2] / 2, r.rect[1] + r.rect[3] / 2];
        return [ox + c[0] * s, oy + c[1] * s];
      },
    };
  }
  function roomRects(r) { return [r.rect].concat(r.extra || []); }
  function buildMinimapBase(w, h, ds, labels, L) {
    const cv = makeCanvas(Math.round(w * ds), Math.round(h * ds));
    const g = cv.getContext('2d');
    g.setTransform(ds, 0, 0, ds, 0, 0);
    const W = world;
    const st = W.floors.filter((f) => !f.lobby);
    const R = (r, m) => [L.ox + r[0] * L.s - m, L.oy + r[1] * L.s - m, r[2] * L.s + 2 * m, r[3] * L.s + 2 * m];
    const rad = Math.max(2, 26 * L.s);
    // outer glow + outline + fill (union)
    g.fillStyle = 'rgba(80,170,255,0.16)';
    g.beginPath(); for (const f of st) { const q = R(f.rect, 5); rrPath(g, q[0], q[1], q[2], q[3], rad + 5); } g.fill();
    g.fillStyle = '#86c3ff';
    g.beginPath(); for (const f of st) { const q = R(f.rect, 2); rrPath(g, q[0], q[1], q[2], q[3], rad + 2); } g.fill();
    g.fillStyle = '#132550';
    g.beginPath(); for (const f of st) { const q = R(f.rect, 0); rrPath(g, q[0], q[1], q[2], q[3], rad); } g.fill();
    // rooms: lighter fills with a thin border around each room's union
    for (const r of W.map.rooms || []) {
      if (r.lobby) continue;
      const rcs = roomRects(r);
      g.fillStyle = 'rgba(150,200,255,0.45)';
      g.beginPath(); for (const rc of rcs) { const q = R(rc, -0.5); rrPath(g, q[0], q[1], q[2], q[3], Math.max(1, rad - 0.5)); } g.fill();
      let y0 = Infinity, y1 = -Infinity;
      for (const rc of rcs) { y0 = Math.min(y0, rc[1]); y1 = Math.max(y1, rc[1] + rc[3]); }
      const gr = g.createLinearGradient(0, L.oy + y0 * L.s, 0, L.oy + y1 * L.s);
      gr.addColorStop(0, '#2b52a3'); gr.addColorStop(1, '#1e3a7a');
      g.fillStyle = gr;
      g.beginPath(); for (const rc of rcs) { const q = R(rc, -1.6); rrPath(g, q[0], q[1], q[2], q[3], Math.max(1, rad - 1.6)); } g.fill();
    }
    // subtle grid inside the silhouette
    g.save();
    g.beginPath(); for (const f of st) { const q = R(f.rect, 0); rrPath(g, q[0], q[1], q[2], q[3], rad); } g.clip();
    g.strokeStyle = 'rgba(160,210,255,0.07)'; g.lineWidth = 1;
    const step = Math.max(8, 200 * L.s);
    g.beginPath();
    for (let x = L.ox % step; x < w; x += step) { g.moveTo(x, 0); g.lineTo(x, h); }
    for (let y = L.oy % step; y < h; y += step) { g.moveTo(0, y); g.lineTo(w, y); }
    g.stroke();
    g.restore();
    if (labels) {
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      for (const r of W.map.rooms || []) {
        if (r.lobby) continue;
        const name = AS.i18n && AS.i18n.upper ? AS.i18n.upper(tr(r.nameKey || 'room.' + r.id)) : tr(r.nameKey || 'room.' + r.id);
        const c = r.label || [r.rect[0] + r.rect[2] / 2, r.rect[1] + r.rect[3] / 2];
        const mx = L.ox + c[0] * L.s, my = L.oy + c[1] * L.s;
        const maxW = r.rect[2] * L.s * 0.94;
        let fs = clamp(L.s * 40, 8, 15);
        g.font = '700 ' + fs + 'px ' + FONT;
        let tw = g.measureText(name).width;
        if (tw > maxW && fs > 7) { fs = Math.max(7, fs * maxW / tw); g.font = '700 ' + fs.toFixed(1) + 'px ' + FONT; tw = g.measureText(name).width; }
        g.lineWidth = Math.max(2.5, fs * 0.32); g.strokeStyle = 'rgba(5,10,30,0.92)';
        g.strokeText(name, mx, my);
        g.fillStyle = '#e9f3ff'; g.fillText(name, mx, my);
      }
    }
    return cv;
  }

  // tiny star-naut silhouette for admin dots: round body, visor, jetpack, legs
  function miniNaut(g, x, y, r) {
    g.fillStyle = INK;
    g.beginPath(); g.arc(x, y - r * 0.1, r + 1.4, 0, TAU); g.fill();
    g.fillRect(x - r * 1.2 - 1.2, y - r * 0.45 - 1.2, r * 0.5 + 2.4, r * 0.9 + 2.4);
    g.fillRect(x - r * 0.62 - 1.2, y + r * 0.5, r * 0.5 + 2.4, r * 0.62 + 1.2);
    g.fillRect(x + r * 0.12 - 1.2, y + r * 0.5, r * 0.5 + 2.4, r * 0.62 + 1.2);
    g.fillStyle = '#dfe7f7';
    g.fillRect(x - r * 1.2, y - r * 0.45, r * 0.5, r * 0.9);
    g.fillRect(x - r * 0.62, y + r * 0.5, r * 0.5, r * 0.5);
    g.fillRect(x + r * 0.12, y + r * 0.5, r * 0.5, r * 0.5);
    g.fillStyle = '#f4f8ff';
    g.beginPath(); g.arc(x, y - r * 0.1, r, 0, TAU); g.fill();
    g.fillStyle = '#26345e';
    g.beginPath(); g.ellipse(x + r * 0.22, y - r * 0.28, r * 0.62, r * 0.42, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath(); g.ellipse(x + r * 0.05, y - r * 0.42, r * 0.2, r * 0.1, -0.4, 0, TAU); g.fill();
  }

  function markerColor(c, def) {
    if (!c) return def;
    if (AS.COLOR_BY_ID && AS.COLOR_BY_ID[c]) return AS.COLOR_BY_ID[c].main;
    return c;
  }

  function drawMinimap(g, w, h, opts) {
    if (!g) return null;
    opts = opts || {};
    ensureWorld();
    if (!world) return null;
    const L = minimapLayout(w, h);
    const m = g.getTransform ? g.getTransform() : { a: 1, b: 0 };
    const ds = clamp(Math.hypot(m.a, m.b) || 1, 0.5, 4);
    const labels = opts.labels !== false;
    const key = [w, h, ds.toFixed(3), labels, AS.i18n ? AS.i18n.getLang() : '', world.map.id].join('|');
    if (mm.key !== key || !mm.base) { mm.base = buildMinimapBase(w, h, ds, labels, L); mm.key = key; }
    g.save();
    g.drawImage(mm.base, 0, 0, w, h);
    const t = clock;
    const pulse = 0.5 + 0.5 * Math.sin(t * 6);
    const R = (r, mg) => [L.ox + r[0] * L.s - mg, L.oy + r[1] * L.s - mg, r[2] * L.s + 2 * mg, r[3] * L.s + 2 * mg];
    const rad = Math.max(2, 26 * L.s);
    // sabotage rooms
    for (const id of opts.sabotageRooms || []) {
      const r = world.roomById[id];
      if (!r) continue;
      g.beginPath();
      for (const rc of roomRects(r)) { const q = R(rc, 0); rrPath(g, q[0], q[1], q[2], q[3], rad); }
      g.fillStyle = 'rgba(235,30,55,' + (0.42 + 0.3 * pulse).toFixed(3) + ')'; g.fill();
      g.strokeStyle = 'rgba(255,110,120,' + (0.7 + 0.3 * pulse).toFixed(3) + ')'; g.lineWidth = 2; g.stroke();
    }
    // door rooms (closed / targetable doors)
    for (const id of opts.doorRooms || []) {
      const r = world.roomById[id];
      if (r) {
        g.beginPath();
        for (const rc of roomRects(r)) { const q = R(rc, 1); rrPath(g, q[0], q[1], q[2], q[3], rad + 1); }
        g.strokeStyle = 'rgba(255,171,61,0.85)'; g.lineWidth = 1.5; g.stroke();
      }
      for (const d of world.doors) {
        if (d.room !== id) continue;
        const q = R(d.rect, 0);
        const th = Math.max(3, 4 * (L.s * 10));
        g.fillStyle = '#ff6a3d'; g.shadowColor = '#ff6a3d'; g.shadowBlur = 6;
        if (d.orient === 'h') g.fillRect(q[0], q[1] + q[3] / 2 - th / 2, q[2], th);
        else g.fillRect(q[0] + q[2] / 2 - th / 2, q[1], th, q[3]);
        g.shadowBlur = 0;
      }
    }
    // admin dots
    if (opts.dots) {
      for (const id in opts.dots) {
        const n = opts.dots[id] | 0;
        const r = world.roomById[id];
        if (!r || n <= 0) continue;
        const c = r.label || [r.rect[0] + r.rect[2] / 2, r.rect[1] + r.rect[3] / 2];
        const cxm = L.ox + c[0] * L.s, cym = L.oy + c[1] * L.s + clamp(L.s * 40, 8, 15) * 1.15;
        const dr = clamp(L.s * 26, 3.5, 8);
        const perRow = Math.max(1, Math.min(n, Math.floor((r.rect[2] * L.s * 0.9) / (dr * 2.5)) || 1));
        for (let i = 0; i < n; i++) {
          const row = Math.floor(i / perRow), col = i % perRow;
          const inRow = Math.min(perRow, n - row * perRow);
          const x = cxm + (col - (inRow - 1) / 2) * dr * 2.5, y = cym + row * dr * 2.6;
          miniNaut(g, x, y, dr);
        }
      }
    }
    // markers
    for (const mk of opts.markers || []) {
      if (mk.x == null) continue;
      const x = L.ox + mk.x * L.s, y = L.oy + mk.y * L.s;
      const kind = mk.kind || 'ping';
      if (kind === 'task') {
        const col = markerColor(mk.color, YELLOW);
        const r = clamp(L.s * 24, 4, 8);
        g.globalAlpha = 0.35 + 0.35 * pulse;
        g.fillStyle = col; g.beginPath(); g.arc(x, y, r * (1.6 + pulse * 0.5), 0, TAU); g.fill();
        g.globalAlpha = 1;
        g.fillStyle = INK; g.beginPath(); g.moveTo(x, y - r * 1.5); g.lineTo(x + r * 1.3, y + r); g.lineTo(x - r * 1.3, y + r); g.closePath(); g.fill();
        g.fillStyle = col; g.beginPath(); g.moveTo(x, y - r * 1.05); g.lineTo(x + r * 0.95, y + r * 0.7); g.lineTo(x - r * 0.95, y + r * 0.7); g.closePath(); g.fill();
        g.fillStyle = INK; g.fillRect(x - 0.8, y - r * 0.45, 1.6, r * 0.6); g.fillRect(x - 0.8, y + r * 0.3, 1.6, 1.6);
      } else if (kind === 'sabotage') {
        const r = clamp(L.s * 30, 5, 10);
        g.strokeStyle = 'rgba(255,60,80,' + (1 - pulse * 0.7) + ')'; g.lineWidth = 2;
        g.beginPath(); g.arc(x, y, r * (1.2 + pulse), 0, TAU); g.stroke();
        g.fillStyle = INK; g.beginPath(); g.arc(x, y, r + 1.5, 0, TAU); g.fill();
        g.fillStyle = markerColor(mk.color, RED); g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
        g.fillStyle = '#fff'; g.fillRect(x - 1, y - r * 0.55, 2, r * 0.7); g.fillRect(x - 1, y + r * 0.3, 2, 2);
      } else if (kind === 'body') {
        const r = clamp(L.s * 22, 4, 8);
        g.strokeStyle = INK; g.lineWidth = 5;
        g.beginPath(); g.moveTo(x - r, y - r); g.lineTo(x + r, y + r); g.moveTo(x + r, y - r); g.lineTo(x - r, y + r); g.stroke();
        g.strokeStyle = markerColor(mk.color, RED); g.lineWidth = 2.5; g.stroke();
      } else if (kind === 'vent') {
        const r = clamp(L.s * 20, 3.5, 7);
        g.fillStyle = INK; g.fillRect(x - r - 1.5, y - r * 0.7 - 1.5, r * 2 + 3, r * 1.4 + 3);
        g.fillStyle = markerColor(mk.color, '#8d99b8'); g.fillRect(x - r, y - r * 0.7, r * 2, r * 1.4);
        g.fillStyle = INK; for (let i = -1; i <= 1; i++) g.fillRect(x - r * 0.7, y + i * r * 0.4 - 0.5, r * 1.4, 1);
      } else {
        const r = clamp(L.s * 22, 3.5, 7);
        g.fillStyle = INK; g.beginPath(); g.arc(x, y, r + 1.8, 0, TAU); g.fill();
        g.fillStyle = markerColor(mk.color, '#ffffff'); g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      }
    }
    // me
    if (opts.me) {
      let mx, my, col, hat;
      const sp = App && App.snap && App.snap.players ? App.snap.players.find((p) => p.id === myId()) : null;
      if (opts.me === true) {
        const v = mePos(App && App.snap);
        if (v) { mx = v.x; my = v.y; }
      } else { mx = opts.me.x; my = opts.me.y; col = opts.me.color; hat = opts.me.hat; }
      if (col == null && sp) col = sp.color;
      if (hat == null && sp) hat = sp.hat;
      if (mx != null) {
        const x = L.ox + mx * L.s, y = L.oy + my * L.s;
        const size = Math.round(clamp(L.s * 90, 18, 34));
        g.strokeStyle = 'rgba(255,255,255,' + (0.8 - pulse * 0.6).toFixed(3) + ')'; g.lineWidth = 2;
        g.beginPath(); g.arc(x, y, size * (0.45 + pulse * 0.3), 0, TAU); g.stroke();
        let drawn = false;
        if (AS.Art && typeof AS.Art.portrait === 'function') {
          try {
            const pc = AS.Art.portrait(col || 'red', hat || 'none', Math.round(size * ds));
            if (pc) { g.drawImage(pc, x - size / 2, y - size / 2 - size * 0.12, size, size); drawn = true; }
          } catch (e) { warnOnce('Art.portrait', e); }
        }
        if (!drawn) {
          const c = colorOf(col);
          g.fillStyle = INK; g.beginPath(); g.arc(x, y, size * 0.32 + 2, 0, TAU); g.fill();
          g.fillStyle = c.main; g.beginPath(); g.arc(x, y, size * 0.32, 0, TAU); g.fill();
          g.fillStyle = '#1a2340'; g.beginPath(); g.ellipse(x + size * 0.08, y - size * 0.06, size * 0.17, size * 0.12, 0, 0, TAU); g.fill();
        }
      }
    }
    g.restore();
    return L;
  }

  function invalidate() { world = null; worldMap = null; worldGeo = null; clearChunks(); mm.base = null; }

  AS.Renderer = {
    init, render, worldToScreen, screenToWorld, drawMinimap, minimapLayout, renderCamera, shake, flash, invalidate, stats, debug,
    get zoom() { return zoom; },
    get dpr() { return dpr; },
  };
})(globalThis.AS = globalThis.AS || {});
