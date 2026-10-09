/* AI IMPOSTOR: SPACE SHIP — station props, floors and vents (owner: props). World coords; 3/4 top-down cartoon look. */
(function (AS) {
  'use strict';
  if (AS.isNode) return;
  const OUT = '#10131f';

  function rr(g, x, y, w, h, r) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r || 0); else g.rect(x, y, w, h); }
  function ell(g, x, y, rx, ry) { g.beginPath(); g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2); }
  function fs(g, fill, lw) { g.fillStyle = fill; g.fill(); if (lw !== 0) { g.lineWidth = lw || 3; g.strokeStyle = OUT; g.stroke(); } }
  function glow(g, x, y, r, c, on) { g.save(); if (on) { g.shadowColor = c; g.shadowBlur = 10; } ell(g, x, y, r, r); g.fillStyle = on ? c : '#2a3040'; g.fill(); g.restore(); }
  // footprint box with a 3/4 front face: top surface lifted by H
  function box(g, x0, y0, w, h, H, top, front, r) {
    rr(g, x0, y0 + h - H, w, H, r || 4); fs(g, front);
    rr(g, x0, y0 - H, w, h, r || 4); fs(g, top);
  }
  const blink = (t, rate, ph) => Math.sin(t * (rate || 3) + (ph || 0)) > 0;

  const D = {
    table_round(g, p) {
      const r = p.r || 80;
      ell(g, p.x, p.y + 6, r * 0.55, r * 0.25); fs(g, '#2a2f3c');
      ell(g, p.x, p.y - 16, r, r * 0.62); fs(g, '#8e9ab5');
      ell(g, p.x, p.y - 22, r - 6, r * 0.58 - 6); fs(g, '#b7c3da', 0);
      if (p.button) {
        ell(g, p.x, p.y - 26, 26, 17); fs(g, '#596179');
        ell(g, p.x, p.y - 34, 19, 12); fs(g, '#e8343b');
        ell(g, p.x - 5, p.y - 37, 6, 3); g.fillStyle = 'rgba(255,255,255,.6)'; g.fill();
      }
    },
    bench(g, p) { box(g, p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, 16, '#8e9ab5', '#5e6880'); },
    chair(g, p) { box(g, p.x - 18, p.y - 18, 36, 36, 18, '#6b7590', '#4b5470', 6); rr(g, p.x - 18, p.y - 50, 36, 20, 6); fs(g, '#7f89a6'); },
    crate(g, p) {
      const w = p.w || 70, h = p.h || 70;
      box(g, p.x - w / 2, p.y - h / 2, w, h, 40, '#c08a4a', '#93622e');
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 3; g.beginPath(); g.moveTo(p.x - w / 2 + 6, p.y + h / 2 - 34); g.lineTo(p.x + w / 2 - 6, p.y + h / 2 - 6); g.stroke();
    },
    crate_stack(g, p) { D.crate(g, { x: p.x - 18, y: p.y + 6, w: 60, h: 60 }); D.crate(g, { x: p.x + 22, y: p.y + 10, w: 56, h: 56 }); D.crate(g, { x: p.x, y: p.y - 34, w: 54, h: 40 }); },
    boxes(g, p) { box(g, p.x - 30, p.y - 25, 60, 50, 26, '#d9b77a', '#a8864d'); rr(g, p.x - 18, p.y - 70, 36, 22, 3); fs(g, '#e4c48a'); },
    barrel(g, p) { const r = p.r || 28; rr(g, p.x - r, p.y - 54, r * 2, 54, 8); fs(g, '#d0582c'); ell(g, p.x, p.y - 54, r, r * 0.4); fs(g, '#e8743f'); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(p.x - r + 2, p.y - 30, r * 2 - 4, 5); },
    console(g, p, t) {
      const w = p.w || 120, h = p.h || 50;
      box(g, p.x - w / 2, p.y - h / 2, w, h, 30, '#3d4660', '#2a3146');
      const scr = { nav: '#3ef0e8', comms: '#8ff04a', security: '#f25cc0', admin: '#ffd23f', weapons: '#ff7a6b', shields: '#2e9df2', o2: '#7fe0ff', reactor: '#ff8a3d', electrical: '#f6e14b', medbay: '#7ff0b0' }[p.style] || '#3ef0e8';
      rr(g, p.x - w / 2 + 10, p.y - h / 2 - 26, w - 20, h - 14, 4); fs(g, '#0d1426', 2);
      g.save(); g.globalAlpha = 0.85; g.fillStyle = scr;
      for (let i = 0; i < 3; i++) g.fillRect(p.x - w / 2 + 16, p.y - h / 2 - 20 + i * 8, (w - 40) * (0.4 + 0.5 * Math.abs(Math.sin(t * 0.8 + i + p.x))), 4);
      g.restore();
      glow(g, p.x + w / 2 - 12, p.y + h / 2 - 16, 3.5, '#e8343b', blink(t, 2, p.x));
    },
    admin_table(g, p, t) {
      box(g, p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, 34, '#4a5574', '#30384f', 14);
      g.save(); g.globalAlpha = 0.5 + Math.sin(t * 2) * 0.1; g.fillStyle = '#3ef0e8';
      rr(g, p.x - p.w / 2 + 20, p.y - p.h / 2 - 24, p.w - 40, p.h - 20, 8); g.fill();
      g.globalAlpha = 0.9; g.strokeStyle = '#bffcff'; g.lineWidth = 2; g.strokeRect(p.x - 60, p.y - 70, 40, 24); g.strokeRect(p.x - 10, p.y - 60, 60, 20); g.strokeRect(p.x - 40, p.y - 30, 50, 20);
      g.restore();
    },
    engine(g, p, t) {
      const w = p.w, h = p.h, x0 = p.x - w / 2, y0 = p.y - h / 2;
      box(g, x0, y0, w, h, 60, '#7a8299', '#545b70', 20);
      ell(g, p.x, y0 - 10, w * 0.32, h * 0.3); fs(g, '#3a4054');
      g.save(); g.shadowColor = '#ff9a3d'; g.shadowBlur = 20; ell(g, p.x, y0 - 10, w * 0.18, h * 0.16); g.fillStyle = blink(t, 6) ? '#ffb347' : '#ff8a1e'; g.fill(); g.restore();
      for (const k of [-1, 1]) { rr(g, p.x + k * (w / 2 - 20) - 10, y0 - 60, 20, h + 50, 6); fs(g, '#9aa3bb'); }
    },
    reactor_core(g, p, t) {
      const r = p.r || 110;
      ell(g, p.x, p.y, r, r * 0.55); fs(g, '#3a3f52');
      rr(g, p.x - r * 0.55, p.y - 150, r * 1.1, 150, 30); fs(g, '#596079');
      g.save(); g.shadowColor = '#5cf2ff'; g.shadowBlur = 30;
      rr(g, p.x - r * 0.3, p.y - 140, r * 0.6, 120, 20); g.fillStyle = 'rgba(92,242,255,' + (0.6 + Math.sin(t * 3) * 0.2) + ')'; g.fill();
      g.restore();
      ell(g, p.x, p.y - 150, r * 0.55, r * 0.2); fs(g, '#7a8299');
    },
    shield_emitter(g, p, t) {
      const r = p.r || 70;
      ell(g, p.x, p.y, r, r * 0.55); fs(g, '#40486a');
      g.save(); g.shadowColor = '#2e9df2'; g.shadowBlur = 25; ell(g, p.x, p.y - 40, r * 0.6, r * 0.6); g.fillStyle = 'rgba(46,157,242,' + (0.55 + Math.sin(t * 2) * 0.15) + ')'; g.fill(); g.restore();
      ell(g, p.x, p.y - 40, r * 0.6, r * 0.6); g.lineWidth = 3; g.strokeStyle = OUT; g.stroke();
    },
    turret_seat(g, p, t) {
      ell(g, p.x, p.y, 60, 36); fs(g, '#4b5470');
      rr(g, p.x - 26, p.y - 50, 52, 46, 10); fs(g, '#6b7590');
      rr(g, p.x - 8, p.y - 110, 16, 70, 4); fs(g, '#9aa3bb'); glow(g, p.x, p.y - 112, 6, '#ff5b5b', blink(t, 3));
    },
    pilot_seat(g, p) { rr(g, p.x - 26, p.y - 30, 52, 50, 10); fs(g, '#5b6380'); rr(g, p.x - 24, p.y - 70, 48, 40, 12); fs(g, '#7c86a6'); },
    bed(g, p) { box(g, p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, 24, '#e9eef7', '#aab4c8', 10); rr(g, p.x - p.w / 2 + 8, p.y - p.h / 2 - 20, 40, p.h - 16, 8); fs(g, '#ffffff', 2); },
    scanner_pad(g, p, t) { const r = p.r || 55; ell(g, p.x, p.y, r, r * 0.6); fs(g, '#2b3550'); g.save(); g.globalAlpha = 0.5 + Math.sin(t * 3) * 0.2; ell(g, p.x, p.y, r * 0.7, r * 0.4); g.fillStyle = '#3ef08c'; g.fill(); g.restore(); },
    sample_station(g, p, t) { box(g, p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, 34, '#dfe6f2', '#a3adc4', 6); for (let i = 0; i < 5; i++) { rr(g, p.x - 50 + i * 22, p.y - 70, 12, 30, 4); fs(g, ['#7ff0b0', '#3ef0e8', '#f25cc0', '#ffd23f', '#ff7a6b'][i], 2); } },
    o2_tank(g, p) { const r = p.r || 30; rr(g, p.x - r, p.y - 90, r * 2, 92, r); fs(g, '#cfe8ff'); rr(g, p.x - 6, p.y - 104, 12, 16, 3); fs(g, '#7a8299'); g.fillStyle = '#2e9df2'; g.fillRect(p.x - r + 4, p.y - 50, r * 2 - 8, 8); },
    tree(g, p, t) { const r = p.r || 45; rr(g, p.x - 7, p.y - 50, 14, 52, 4); fs(g, '#7a5233'); const sw = Math.sin(t * 1.2 + p.x) * 2; for (const [dx, dy, k] of [[-16, -70, 0.7], [16, -74, 0.7], [0, -95, 0.85]]) { ell(g, p.x + dx + sw, p.y + dy, r * k, r * k * 0.85); fs(g, '#2fae5a'); } },
    plant_bed(g, p, t) { box(g, p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, 26, '#6b4a2e', '#4c321e', 8); for (let i = 0; i < 8; i++) { const x = p.x - p.w / 2 + 18 + i * (p.w - 36) / 7; ell(g, x, p.y - 34 + Math.sin(t * 2 + i) * 1.5, 11, 14); fs(g, i % 3 ? '#4fd36a' : '#ff8fc8', 2); } },
    fuel_tank(g, p) { rr(g, p.x - 40, p.y - 110, 80, 115, 14); fs(g, '#e8b72e'); g.fillStyle = OUT; g.font = '700 28px sans-serif'; g.textAlign = 'center'; g.fillText('⛽', p.x, p.y - 45); },
    locker(g, p) { rr(g, p.x - 30, p.y - 90, 60, 105, 4); fs(g, '#7a8299'); g.fillStyle = 'rgba(0,0,0,.3)'; for (let i = 0; i < 3; i++) g.fillRect(p.x - 20, p.y - 80 + i * 8, 40, 3); },
    server_rack(g, p, t) { rr(g, p.x - 35, p.y - 100, 70, 120, 4); fs(g, '#2b3146'); for (let i = 0; i < 6; i++) { rr(g, p.x - 28, p.y - 92 + i * 16, 56, 11, 2); fs(g, '#3c4562', 1.5); glow(g, p.x + 20, p.y - 86 + i * 16, 2.5, i % 2 ? '#8ff04a' : '#3ef0e8', blink(t, 5, i + p.y)); } },
    radar_dish(g, p, t) { const r = p.r || 60; rr(g, p.x - 8, p.y - 60, 16, 62, 4); fs(g, '#7a8299'); g.save(); g.translate(p.x, p.y - 70); g.rotate(Math.sin(t * 0.6) * 0.5); ell(g, 0, 0, r, r * 0.45); fs(g, '#d8dfec'); ell(g, 0, 0, 8, 8); fs(g, '#e8343b', 2); g.restore(); },
    dropship_seat(g, p) { rr(g, p.x - 26, p.y - 28, 52, 46, 8); fs(g, '#8a5a3c'); rr(g, p.x - 26, p.y - 66, 52, 40, 10); fs(g, '#a26b48'); },
    laptop(g, p, t) { rr(g, p.x - 30, p.y - 6, 60, 18, 3); fs(g, '#9aa3bb'); rr(g, p.x - 28, p.y - 40, 56, 36, 3); fs(g, '#2b3146'); g.fillStyle = blink(t, 1, p.x) ? '#3ef0e8' : '#1f9fb0'; g.fillRect(p.x - 22, p.y - 34, 44, 24); },
    rug(g, p) { rr(g, p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, 30); g.fillStyle = 'rgba(120,60,90,.35)'; g.fill(); g.lineWidth = 6; g.strokeStyle = 'rgba(255,210,63,.25)'; g.stroke(); },
    hazard_floor(g, p) { g.save(); rr(g, p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, 10); g.clip(); g.fillStyle = 'rgba(255,200,0,.18)'; for (let i = -p.h; i < p.w; i += 40) { g.beginPath(); g.moveTo(p.x - p.w / 2 + i, p.y + p.h / 2); g.lineTo(p.x - p.w / 2 + i + 20, p.y + p.h / 2); g.lineTo(p.x - p.w / 2 + i + 20 + p.h, p.y - p.h / 2); g.lineTo(p.x - p.w / 2 + i + p.h, p.y - p.h / 2); g.fill(); } g.restore(); },
    // ---- wall mounted (drawn on the north wall face, bottom at y-8)
    window(g, p, t) { const w = p.w || 200, h = 50; rr(g, p.x - w / 2, p.y - 70, w, h, 10); fs(g, '#070b1a'); g.fillStyle = '#fff'; for (let i = 0; i < 6; i++) g.fillRect(p.x - w / 2 + ((i * 53 + t * 8) % w), p.y - 64 + (i * 17) % 40, 2, 2); },
    monitor_wall(g, p, t) { const w = p.w || 260; for (let i = 0; i < 4; i++) { rr(g, p.x - w / 2 + i * (w / 4) + 4, p.y - 70, w / 4 - 8, 44, 4); fs(g, '#132036'); g.fillStyle = 'rgba(62,240,232,' + (0.3 + 0.2 * Math.sin(t * 2 + i)) + ')'; g.fillRect(p.x - w / 2 + i * (w / 4) + 10, p.y - 64, w / 4 - 20, 32); } },
    garbage_chute(g, p) { rr(g, p.x - 50, p.y - 70, 100, 60, 6); fs(g, '#5a6178'); rr(g, p.x - 36, p.y - 58, 72, 36, 4); fs(g, '#1b1f2c'); },
    pipes(g, p) { for (let i = 0; i < 3; i++) { rr(g, p.x - p.w / 2, p.y - 70 + i * 18, p.w, 12, 6); fs(g, ['#8e9ab5', '#b3803a', '#6b7590'][i], 2); } },
    handprint(g, p, t) { rr(g, p.x - 30, p.y - 68, 60, 52, 8); fs(g, '#2b3146'); g.save(); g.globalAlpha = 0.6 + 0.3 * Math.sin(t * 4); g.fillStyle = '#5cf2ff'; ell(g, p.x, p.y - 38, 11, 12); g.fill(); for (let i = 0; i < 4; i++) { rr(g, p.x - 12 + i * 7, p.y - 62, 5, 16, 2); g.fill(); } g.restore(); },
    keypad(g, p, t) { rr(g, p.x - 25, p.y - 66, 50, 50, 6); fs(g, '#3d4660'); for (let i = 0; i < 9; i++) { rr(g, p.x - 17 + (i % 3) * 12, p.y - 58 + Math.floor(i / 3) * 12, 9, 9, 2); g.fillStyle = '#9aa3bb'; g.fill(); } glow(g, p.x + 18, p.y - 62, 2.5, '#8ff04a', blink(t, 2, p.x)); },
    wire_panel(g, p) { rr(g, p.x - 30, p.y - 60, 60, 42, 5); fs(g, '#5a6178'); ['#e8343b', '#2e5cf2', '#f6e14b', '#f25cc0'].forEach((c, i) => { g.fillStyle = c; g.fillRect(p.x - 22, p.y - 54 + i * 8, 44, 4); }); },
    dial_panel(g, p, t) { rr(g, p.x - 35, p.y - 64, 70, 48, 6); fs(g, '#4b5470'); ell(g, p.x - 12, p.y - 40, 12, 12); fs(g, '#d8dfec', 2); g.strokeStyle = '#e8343b'; g.lineWidth = 2; g.beginPath(); g.moveTo(p.x - 12, p.y - 40); g.lineTo(p.x - 12 + Math.cos(t) * 9, p.y - 40 + Math.sin(t) * 9); g.stroke(); glow(g, p.x + 18, p.y - 46, 4, '#3ef0e8', true); },
    light_panel(g, p, t) { rr(g, p.x - 45, p.y - 70, 90, 58, 6); fs(g, '#4b5470'); for (let i = 0; i < 5; i++) glow(g, p.x - 30 + i * 15, p.y - 42, 4, '#ffd23f', blink(t, 1.5, i)); },
    electrical_box(g, p, t) { rr(g, p.x - 40, p.y - 72, 80, 60, 6); fs(g, '#8e9ab5'); g.fillStyle = '#f6e14b'; g.beginPath(); g.moveTo(p.x + 2, p.y - 66); g.lineTo(p.x - 10, p.y - 40); g.lineTo(p.x, p.y - 40); g.lineTo(p.x - 4, p.y - 18); g.lineTo(p.x + 12, p.y - 46); g.lineTo(p.x + 2, p.y - 46); g.closePath(); g.fill(); },
  };

  function draw(g, p, t) {
    const f = D[p.type];
    t = t || 0;
    if (f) f(g, p, t);
    else if (p.r) { ell(g, p.x, p.y, p.r, p.r * 0.6); fs(g, '#6b7590'); }
    else if (p.w) box(g, p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, 20, '#6b7590', '#4b5470');
  }
  function footprintBottom(p) { return p.y + (p.r ? p.r * 0.5 : p.h ? p.h / 2 : 0); }

  // ---------------------------------------------------------------- floors (64-unit tiles, aligned to world)
  const FLOORS = {
    steel: ['#59627a', '#4e566c', 'tile'], white: ['#c9d2e2', '#b6c0d3', 'tile'], dark: ['#2f3446', '#282c3c', 'tile'],
    grate: ['#4a4f5e', '#3a3f4c', 'grate'], carpet: ['#4a3150', '#422a47', 'dots'], wood: ['#7a5a3e', '#6a4c33', 'plank'],
    grass: ['#3d7a45', '#356b3c', 'dots'], hazard: ['#4d4a3a', '#3f3d30', 'tile'], concrete: ['#6c6a66', '#62605c', 'dots'],
    blue: ['#36507a', '#2f466b', 'tile'], reactor: ['#3b3a4a', '#33323f', 'grate'], dropship: ['#5d5f72', '#525466', 'plank'],
    hall: ['#4b5266', '#434a5c', 'tile'],
  };
  const pats = {};
  function pattern(g, style) {
    if (pats[style]) return pats[style];
    const [a, b, kind] = FLOORS[style] || FLOORS.steel;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    x.fillStyle = a; x.fillRect(0, 0, 64, 64);
    x.fillStyle = b; x.strokeStyle = b; x.lineWidth = 2;
    if (kind === 'tile') { x.strokeRect(1, 1, 62, 62); x.fillRect(30, 30, 4, 4); }
    else if (kind === 'grate') { for (let i = 4; i < 64; i += 10) x.fillRect(i, 0, 4, 64); x.fillRect(0, 0, 64, 3); }
    else if (kind === 'plank') { for (let i = 0; i < 64; i += 16) x.fillRect(0, i, 64, 2); x.fillRect(20, 0, 2, 16); x.fillRect(50, 16, 2, 16); x.fillRect(10, 32, 2, 16); x.fillRect(40, 48, 2, 16); }
    else { for (let i = 0; i < 6; i++) x.fillRect((i * 23) % 60, (i * 37) % 60, 4, 4); }
    pats[style] = g.createPattern(c, 'repeat');
    return pats[style];
  }
  function drawFloor(g, rect, style) {
    g.fillStyle = pattern(g, style);
    g.fillRect(rect[0], rect[1], rect[2], rect[3]);
  }

  function drawVent(g, x, y, open, t) {
    open = open || 0;
    rr(g, x - 36, y - 20, 72, 40, 8); fs(g, '#3a4054');
    rr(g, x - 30, y - 15, 60, 30, 5); fs(g, '#151925', 2);
    g.save();
    g.translate(x, y - 15);
    g.scale(1, 1 - open * 0.85);
    rr(g, -30, 0, 60, 30, 5); fs(g, '#6b7590', 2);
    g.strokeStyle = '#3a4054'; g.lineWidth = 3;
    for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(-22, 6 + i * 6); g.lineTo(22, 6 + i * 6); g.stroke(); }
    g.restore();
  }

  AS.Props = { draw, drawFloor, drawVent, footprintBottom, TYPES: Object.keys(D) };
})(globalThis.AS = globalThis.AS || {});
