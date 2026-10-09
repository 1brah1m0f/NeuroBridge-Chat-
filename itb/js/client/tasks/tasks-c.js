/* AI IMPOSTOR: SPACE SHIP — mini-games C (owner: tasks-c)
 *   chart  — Chart Course: drag the ship along the dotted star route through every checkpoint, in order.
 *   steer  — Stabilize Steering: drag the crosshair to the center of the nav display and release.
 *   plants — Water Plants (Greenhouse): hold the watering can over each wilted plant until it blooms.
 *   sample — Inspect Sample (long): START -> 5 tubes fill -> 45 s analysis that keeps running while the
 *            panel is closed (ctx.memory + ctx.now()) -> pick the anomalous tube; a wrong pick restarts.
 * Each game: AS.Tasks.register(id, factory, { w, h }); see js/client/tasks/taskhost.js for the ctx API.
 * Test/debug: AS.TasksC.live is the currently open tasks-c instance; instance.__test exposes layout info
 * (logical coords) and fast-forward helpers for headless tests.
 */
(function (AS) {
  'use strict';
  if (typeof document === 'undefined' || !AS.i18n) return;

  AS.i18n.add({
    az: {
      'game.chart.title': 'Marşrutu təyin et',
      'game.chart.hint': 'Gəmini marşrut boyunca sürüşdür, bütün nöqtələrdən keçir',
      'game.chart.fail': 'Marşrutdan çıxma! Yenidən cəhd et',
      'game.chart.label': 'Ulduz xəritəsi',
      'game.steer.title': 'Sükanı sabitləşdir',
      'game.steer.hint': 'Nişangahı mərkəzə sürüşdür və burax',
      'game.steer.on': 'Kurs düzgündür',
      'game.steer.off': 'Kursdan kənar',
      'game.plants.title': 'Bitkiləri sula',
      'game.plants.hint': 'Suvarma qabını hər bitkinin üstündə saxla',
      'game.plants.done': 'Bütün bitkilər çiçək açdı!',
      'game.sample.title': 'Nümunəni yoxla',
      'game.sample.start': 'Başla',
      'game.sample.idle': 'BAŞLA düyməsini bas',
      'game.sample.filling': 'Reaktiv əlavə edilir...',
      'game.sample.waiting': 'Analiz gedir...',
      'game.sample.ready': 'Anomaliyanı seç',
      'game.sample.wrong': 'Səhv! Yenidən başlayırıq',
      'game.sample.found': 'Anomaliya tapıldı!',
      'game.sample.hint': 'Analizə başlamaq üçün BAŞLA düyməsini bas',
      'game.sample.hintWait': 'Gözləyərkən başqa tapşırıqları edə bilərsən',
      'game.sample.hintPick': 'Rəngi fərqlənən sınaq şüşəsini seç',
    },
    en: {
      'game.chart.title': 'Chart Course',
      'game.chart.hint': 'Drag the ship along the route through every checkpoint',
      'game.chart.fail': 'Stay on the route! Try again',
      'game.chart.label': 'Star chart',
      'game.steer.title': 'Stabilize Steering',
      'game.steer.hint': 'Drag the crosshair to the center and release',
      'game.steer.on': 'On course',
      'game.steer.off': 'Off course',
      'game.plants.title': 'Water Plants',
      'game.plants.hint': 'Hold the watering can over each plant',
      'game.plants.done': 'All plants are blooming!',
      'game.sample.title': 'Inspect Sample',
      'game.sample.start': 'Start',
      'game.sample.idle': 'Press START',
      'game.sample.filling': 'Adding reagent...',
      'game.sample.waiting': 'Analyzing...',
      'game.sample.ready': 'Select the anomaly',
      'game.sample.wrong': 'Wrong! Starting over',
      'game.sample.found': 'Anomaly found!',
      'game.sample.hint': 'Press START to begin the analysis',
      'game.sample.hintWait': 'You can do other tasks while you wait',
      'game.sample.hintPick': 'Pick the test tube with a different color',
    },
  });

  if (!AS.Tasks || !AS.Tasks.register) return;
  const DBG = (AS.TasksC = AS.TasksC || { live: null });

  // Art kit: shared with sabotage.js, see kit.js
  const U = AS.util;
  const {
    TAU, OUT, F, clamp, lerp, smooth, outCubic, inOut, outBack, angDiff, NUM, NODASH, UP, rr, layer, glow,
    ramp, shade, paintDevice, paintWall, paintScreen, paintGlass, nebula,
    makeHint, glowText, monoText, PK, Particles, finisher,
  } = AS.TaskKit;
  const DOTS = [0.01, 13];
  const DASH_RING = [5, 6];

  // =====================================================================================
  // CHART COURSE
  // =====================================================================================
  function chartGame(ctx) {
    const W = ctx.w, H = ctx.h, rnd = ctx.rng, seed = (rnd() * 4294967295) >>> 0;
    const DX = 34, DY = 32, DW = W - 68, DH = 340, TOL = 44, GRAB = 56, REACH = 20;
    const finish = finisher(ctx);
    const hint = makeHint(W, 393);

    // ---- random route: start + 4..5 checkpoints (the last one is the destination planet) ----
    const cpCount = rnd() < 0.5 ? 4 : 5;
    const nodes = [];
    const xa = DX + 70, xb = DX + DW - 80, yMin = DY + 74, yMax = DY + DH - 62;
    let py = yMin + rnd() * (yMax - yMin);
    nodes.push({ x: xa, y: py, hit: true, pop: 0 });
    for (let i = 1; i <= cpCount; i++) {
      const x = xa + ((xb - xa) * i) / cpCount + (i < cpCount ? (rnd() - 0.5) * 34 : 0);
      let y = py, k = 0;
      do { y = yMin + rnd() * (yMax - yMin); } while (++k < 60 && (Math.abs(y - py) < 60 || Math.abs(y - py) > 165));
      py = y;
      nodes.push({ x, y, hit: false, pop: 0 });
    }
    const last = nodes.length - 1;
    const NT = 14, tw = new Float32Array(NT * 4);
    for (let i = 0; i < NT; i++) { tw[i * 4] = DX + 20 + rnd() * (DW - 40); tw[i * 4 + 1] = DY + 20 + rnd() * (DH - 40); tw[i * 4 + 2] = 1 + rnd() * 2.5; tw[i * 4 + 3] = rnd() * TAU; }

    let seg = 0, t = 0, sx = nodes[0].x, sy = nodes[0].y;
    let ang = Math.atan2(nodes[1].y - nodes[0].y, nodes[1].x - nodes[0].x);
    let dragId = null, grabbed = false, backT = 0, backFrom = 0, failT = 0, time = 0, thrust = 0, lx = sx, ly = sy, exhaust = 0;
    let solved = false, finishIn = -1, arriveT = 0;
    const TR = 28, trail = new Float32Array(TR * 2);
    let trN = 0, trH = 0, trAcc = 0;
    const parts = Particles(200);
    let pjT = 0, pjD = 0;

    function project(i, px, py2) {
      const a = nodes[i], b = nodes[i + 1];
      const vx = b.x - a.x, vy = b.y - a.y;
      const u = ((px - a.x) * vx + (py2 - a.y) * vy) / (vx * vx + vy * vy);
      pjT = u;
      const uc = clamp(u, 0, 1);
      pjD = Math.hypot(px - (a.x + vx * uc), py2 - (a.y + vy * uc));
    }
    function shipPos() {
      const a = nodes[seg], b = nodes[Math.min(seg + 1, last)];
      sx = a.x + (b.x - a.x) * t; sy = a.y + (b.y - a.y) * t;
    }
    function reach(i) {
      const n = nodes[i];
      n.hit = true; n.pop = 1;
      parts.burst(PK.STAR, n.x, n.y, 12, 190, 0.75, 8, '#c8f8ff');
      parts.ring(n.x, n.y, 40, 0.5, '#3fe0ff');
      if (i === last) {
        solved = true; dragId = null; finishIn = 0.6; arriveT = 0; seg = last - 1; t = 1;
        parts.burst(PK.STAR, n.x, n.y, 26, 300, 1.0, 10, '#ffffff');
        parts.burst(PK.DOT, n.x, n.y, 20, 240, 0.8, 4, '#7fd8ff');
        ctx.sfx('whoosh');
      } else {
        ctx.sfx('pop');
      }
    }
    function fail() {
      dragId = null; backFrom = t; backT = 1; failT = 1;
      ctx.sfx('swipe_bad');
      parts.burst(PK.SPARK, sx, sy, 10, 200, 0.4, 2.5, '#ff6b7a');
    }
    function dragTo(px, py2) {
      for (let guard = 0; guard < 8 && !solved; guard++) {
        project(seg, px, py2);
        const b = nodes[seg + 1];
        const nearEnd = Math.hypot(px - b.x, py2 - b.y) < REACH;
        if (pjT >= 1 || nearEnd) {
          let ok = nearEnd || pjD <= TOL;
          if (!ok && seg + 1 < last) { project(seg + 1, px, py2); ok = pjD <= TOL && pjT >= 0; }
          if (!ok) { fail(); return; }
          reach(seg + 1);
          if (solved) return;
          seg++; t = 0;
          continue;
        }
        if (pjD > TOL) { fail(); return; }
        t = clamp(pjT, 0, 1);
        return;
      }
    }

    const bg = layer(W, 0, 0, W, H, (c) => {
      const r = U.rng(seed);
      paintWall(c, W, H);
      paintDevice(c, 12, 12, W - 24, H - 24, 26, 'steel', r);
      paintScreen(c, DX, DY, DW, DH, 16, '#0d1840', '#050a1e');
      c.save(); rr(c, DX, DY, DW, DH, 16); c.clip();
      nebula(c, DX + DW * (0.2 + r() * 0.2), DY + DH * (0.3 + r() * 0.4), 230, '130,80,255', 0.26);
      nebula(c, DX + DW * (0.65 + r() * 0.2), DY + DH * (0.5 + r() * 0.3), 200, '30,200,255', 0.18);
      nebula(c, DX + DW * (0.4 + r() * 0.3), DY + DH * 0.15, 150, '255,80,180', 0.13);
      c.strokeStyle = 'rgba(120,160,255,0.10)'; c.lineWidth = 1;
      for (let x = DX + 24; x < DX + DW; x += 40) { c.beginPath(); c.moveTo(x + 0.5, DY); c.lineTo(x + 0.5, DY + DH); c.stroke(); }
      for (let y = DY + 20; y < DY + DH; y += 40) { c.beginPath(); c.moveTo(DX, y + 0.5); c.lineTo(DX + DW, y + 0.5); c.stroke(); }
      for (let i = 0; i < 190; i++) {
        const x = DX + r() * DW, y = DY + r() * DH, s = r();
        c.fillStyle = 'rgba(225,238,255,' + (0.2 + s * 0.65).toFixed(2) + ')';
        c.beginPath(); c.arc(x, y, 0.5 + s * s * 1.7, 0, TAU); c.fill();
      }
      // decorative constellations
      c.strokeStyle = 'rgba(160,190,255,0.16)'; c.lineWidth = 1.2; c.fillStyle = 'rgba(200,220,255,0.5)';
      for (let k = 0; k < 3; k++) {
        let x = DX + 60 + r() * (DW - 120), y = DY + 40 + r() * (DH - 80);
        c.beginPath(); c.moveTo(x, y);
        for (let j = 0; j < 4; j++) { x += (r() - 0.5) * 90; y += (r() - 0.5) * 70; c.lineTo(x, y); }
        c.stroke();
      }
      // edge ruler ticks
      c.strokeStyle = 'rgba(140,180,255,0.35)'; c.lineWidth = 1.5;
      for (let x = DX + 24; x < DX + DW; x += 20) { const L = (x - DX - 24) % 80 === 0 ? 9 : 5; c.beginPath(); c.moveTo(x, DY + DH); c.lineTo(x, DY + DH - L); c.stroke(); }
      for (let y = DY + 20; y < DY + DH; y += 20) { const L = (y - DY - 20) % 80 === 0 ? 9 : 5; c.beginPath(); c.moveTo(DX, y); c.lineTo(DX + L, y); c.stroke(); }
      c.restore();
      // lower console strip: vents + status LEDs
      c.fillStyle = 'rgba(0,0,0,0.28)';
      for (let i = 0; i < 4; i++) { rr(c, 46 + i * 14, 396, 7, 28, 3.5); c.fill(); rr(c, W - 102 + i * 14, 396, 7, 28, 3.5); c.fill(); }
    });
    const glass = layer(W, DX - 4, DY - 4, DW + 8, DH + 8, (c) => paintGlass(c, DX, DY, DW, DH, 16));

    function drawPlanet(g, x, y, active, reached) {
      const pulse = active ? 0.5 + 0.5 * Math.sin(time * 5) : 0;
      glow(g, x, y, 70 + pulse * 10, reached ? '80,255,170' : '110,150,255', 0.35 + pulse * 0.25 + (reached ? 0.3 : 0));
      if (active) {
        const k = (time * 0.8) % 1;
        g.globalAlpha = 1 - k; g.strokeStyle = '#ffd23f'; g.lineWidth = 2.5;
        g.beginPath(); g.arc(x, y, 26 + k * 30, 0, TAU); g.stroke(); g.globalAlpha = 1;
      }
      g.lineWidth = 4; g.strokeStyle = OUT;
      g.beginPath(); g.ellipse(x, y, 40, 11, -0.35, Math.PI, TAU); g.stroke();
      g.lineWidth = 2.5; g.strokeStyle = '#ffd98a'; g.stroke();
      g.beginPath(); g.arc(x, y, 23, 0, TAU); g.fillStyle = '#6f86ff'; g.fill();
      g.save(); g.clip();
      g.fillStyle = '#8fb0ff'; g.fillRect(x - 24, y - 12, 48, 7); g.fillRect(x - 24, y + 4, 48, 5);
      g.fillStyle = 'rgba(16,19,60,0.45)'; g.beginPath(); g.arc(x + 9, y + 7, 24, 0, TAU); g.fill();
      g.restore();
      g.beginPath(); g.arc(x, y, 23, 0, TAU); g.lineWidth = 3.5; g.strokeStyle = OUT; g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.ellipse(x - 9, y - 10, 6, 3.5, -0.6, 0, TAU); g.fill();
      g.lineWidth = 4; g.strokeStyle = OUT;
      g.beginPath(); g.ellipse(x, y, 40, 11, -0.35, 0, Math.PI); g.stroke();
      g.lineWidth = 2.5; g.strokeStyle = '#ffd98a'; g.stroke();
    }
    function drawShip(g, x, y, a, sc) {
      g.save(); g.translate(x, y); g.rotate(a); g.scale(sc * 1.3, sc * 1.3);
      const fl = 6 + thrust * 15 + Math.sin(time * 40) * 2;
      g.fillStyle = '#ff8a2a'; g.beginPath(); g.moveTo(-14, -6); g.quadraticCurveTo(-14 - fl * 1.2, 0, -14, 6); g.closePath(); g.fill();
      g.fillStyle = '#ffe9a0'; g.beginPath(); g.moveTo(-14, -3.2); g.quadraticCurveTo(-14 - fl * 0.65, 0, -14, 3.2); g.closePath(); g.fill();
      g.lineJoin = 'round'; g.lineWidth = 2.6; g.strokeStyle = OUT; g.fillStyle = '#ff4b5c';
      g.beginPath(); g.moveTo(-4, -7); g.lineTo(-15, -17); g.lineTo(-16, -7); g.closePath(); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(-4, 7); g.lineTo(-15, 17); g.lineTo(-16, 7); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#eef3fb';
      g.beginPath(); g.moveTo(23, 0); g.bezierCurveTo(16, -11, 0, -11, -15, -7.5); g.lineTo(-15, 7.5); g.bezierCurveTo(0, 11, 16, 11, 23, 0); g.closePath();
      g.fill(); g.stroke();
      g.fillStyle = 'rgba(70,90,150,0.35)';
      g.beginPath(); g.moveTo(-15, 2.5); g.lineTo(-15, 7.5); g.bezierCurveTo(0, 11, 16, 11, 23, 0); g.bezierCurveTo(13, 5, 0, 5.5, -15, 2.5); g.fill();
      g.fillStyle = '#ff4b5c'; g.fillRect(-11, -6.8, 3.2, 13.6);
      g.fillStyle = '#3fe0ff'; g.beginPath(); g.ellipse(7.5, -1, 6.3, 4.4, 0, 0, TAU); g.fill(); g.lineWidth = 2.2; g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.ellipse(6, -2.6, 2.2, 1.2, -0.3, 0, TAU); g.fill();
      g.restore();
    }

    const inst = {
      update(dt) {
        time += dt;
        if (backT > 0) { backT = Math.max(0, backT - dt / 0.4); t = backFrom * (1 - outCubic(1 - backT)); }
        if (failT > 0) failT = Math.max(0, failT - dt / 1.6);
        if (solved) arriveT += dt;
        shipPos();
        const mv = Math.hypot(sx - lx, sy - ly);
        lx = sx; ly = sy;
        thrust = lerp(thrust, clamp(mv / Math.max(dt, 1e-3) / 260, 0, 1), smooth(dt, 10));
        const targetA = Math.atan2(nodes[seg + 1].y - nodes[seg].y, nodes[seg + 1].x - nodes[seg].x);
        ang += angDiff(targetA, ang) * smooth(dt, 12);
        trAcc += dt;
        if (trAcc >= 1 / 45) {
          trAcc = 0;
          if (mv > 0.3) { trail[trH * 2] = sx; trail[trH * 2 + 1] = sy; trH = (trH + 1) % TR; if (trN < TR) trN++; }
          else if (trN > 0) trN--;
        }
        if (thrust > 0.15 && !solved) {
          exhaust += dt * 50 * thrust;
          while (exhaust >= 1) {
            exhaust -= 1;
            const ca = Math.cos(ang), sa = Math.sin(ang);
            const p = parts.spawn(PK.DOT, sx - ca * 20, sy - sa * 20, -ca * 60 + (Math.random() - 0.5) * 40, -sa * 60 + (Math.random() - 0.5) * 40, 0.35, 3, Math.random() < 0.5 ? '#ffb347' : '#ffe08a');
            p.drag = 3;
          }
        }
        for (let i = 0; i <= last; i++) if (nodes[i].pop > 0) nodes[i].pop = Math.max(0, nodes[i].pop - dt * 2.2);
        parts.update(dt);
        if (finishIn > 0) { finishIn -= dt; if (finishIn <= 0) finish(); }
      },
      draw(g) {
        bg(g);
        for (let i = 0; i < NT; i++) {
          const a = 0.25 + 0.75 * Math.abs(Math.sin(time * tw[i * 4 + 2] + tw[i * 4 + 3]));
          glow(g, tw[i * 4], tw[i * 4 + 1], 9, '200,225,255', a * 0.9);
        }
        g.lineCap = 'round'; g.lineJoin = 'round';
        // tolerance corridor of the remaining route (subtle guide)
        g.beginPath(); g.moveTo(sx, sy);
        for (let i = seg + 1; i <= last; i++) g.lineTo(nodes[i].x, nodes[i].y);
        g.strokeStyle = failT > 0 ? 'rgba(255,80,100,0.12)' : 'rgba(120,170,255,0.055)'; g.lineWidth = TOL * 1.6; g.stroke();
        g.setLineDash(DOTS); g.lineDashOffset = -time * 16;
        g.strokeStyle = failT > 0 && Math.sin(time * 30) > -0.2 ? '#ff6b7a' : 'rgba(235,242,255,0.9)'; g.lineWidth = 5.5; g.stroke();
        g.setLineDash(NODASH); g.lineDashOffset = 0;
        // traveled route
        g.beginPath(); g.moveTo(nodes[0].x, nodes[0].y);
        for (let i = 1; i <= seg; i++) g.lineTo(nodes[i].x, nodes[i].y);
        g.lineTo(sx, sy);
        g.strokeStyle = 'rgba(63,224,255,0.22)'; g.lineWidth = 16; g.stroke();
        g.strokeStyle = '#3fe0ff'; g.lineWidth = 5.5; g.stroke();
        // nodes
        g.textAlign = 'center'; g.textBaseline = 'middle';
        for (let i = 0; i <= last; i++) {
          const n = nodes[i];
          const isNext = !solved && i === seg + 1;
          if (i === 0) {
            glow(g, n.x, n.y, 36, '63,224,255', 0.4);
            g.beginPath(); g.arc(n.x, n.y, 15, 0, TAU); g.fillStyle = '#12304a'; g.fill(); g.lineWidth = 4; g.strokeStyle = OUT; g.stroke();
            g.beginPath(); g.arc(n.x, n.y, 11, 0, TAU); g.lineWidth = 3; g.strokeStyle = '#3fe0ff'; g.stroke();
            continue;
          }
          if (i === last) { drawPlanet(g, n.x, n.y, isNext, n.hit); continue; }
          const pop = n.pop > 0 ? 1 + 0.45 * Math.sin(n.pop * Math.PI) : 1;
          const r = 15 * pop * (isNext ? 1 + 0.08 * Math.sin(time * 7) : 1);
          if (n.hit) {
            glow(g, n.x, n.y, 46, '63,224,255', 0.55);
            g.beginPath(); g.arc(n.x, n.y, r, 0, TAU); g.fillStyle = '#3fe0ff'; g.fill(); g.lineWidth = 4; g.strokeStyle = OUT; g.stroke();
            g.beginPath(); g.moveTo(n.x - 6.5, n.y + 0.5); g.lineTo(n.x - 1.5, n.y + 5.5); g.lineTo(n.x + 7, n.y - 5);
            g.lineWidth = 3.5; g.strokeStyle = '#ffffff'; g.stroke();
          } else {
            if (isNext) glow(g, n.x, n.y, 44, '255,210,80', 0.35 + 0.2 * Math.sin(time * 7));
            g.beginPath(); g.arc(n.x, n.y, r, 0, TAU); g.fillStyle = 'rgba(12,22,56,0.95)'; g.fill(); g.lineWidth = 4; g.strokeStyle = OUT; g.stroke();
            g.setLineDash(DASH_RING); g.lineDashOffset = -time * 12;
            g.beginPath(); g.arc(n.x, n.y, r - 1, 0, TAU); g.lineWidth = 2.5; g.strokeStyle = isNext ? '#ffd23f' : '#cfe0ff'; g.stroke();
            g.setLineDash(NODASH); g.lineDashOffset = 0;
            g.font = F(15); g.fillStyle = isNext ? '#ffd23f' : '#e6eeff'; g.fillText(NUM[i], n.x, n.y + 1);
          }
        }
        // trail
        for (let k = 0; k < trN; k++) {
          const idx = (trH - 1 - k + TR * 2) % TR;
          const a = 1 - k / TR;
          g.globalAlpha = a * 0.55;
          g.fillStyle = '#9fefff';
          g.beginPath(); g.arc(trail[idx * 2], trail[idx * 2 + 1], 1 + a * 3, 0, TAU); g.fill();
        }
        g.globalAlpha = 1;
        parts.draw(g);
        // ship
        const sc = solved ? 1 - inOut(arriveT / 0.45) : 1;
        if (sc > 0.01) {
          glow(g, sx, sy, 40, '120,220,255', 0.35 + thrust * 0.3);
          if (!grabbed && !solved) {
            const k = (time * 1.2) % 1;
            g.globalAlpha = 1 - k; g.strokeStyle = '#ffd23f'; g.lineWidth = 3;
            g.beginPath(); g.arc(sx, sy, 26 + k * 22, 0, TAU); g.stroke(); g.globalAlpha = 1;
          }
          drawShip(g, sx, sy, ang + (solved ? arriveT * 9 : 0), sc);
        }
        glass(g);
        // labels: chart name + checkpoint pips
        g.font = F(15); g.textAlign = 'left'; g.textBaseline = 'middle';
        g.fillStyle = 'rgba(150,190,255,0.85)'; g.fillText(UP('game.chart.label'), DX + 16, DY + 18);
        let reached = 0;
        for (let i = 1; i <= last; i++) if (nodes[i].hit) reached++;
        for (let i = 0; i < last; i++) {
          const x = DX + DW - 18 - (last - 1 - i) * 18, y = DY + 18;
          g.beginPath(); g.arc(x, y, 5.5, 0, TAU);
          g.fillStyle = i < reached ? '#3fe0ff' : 'rgba(20,30,70,0.9)'; g.fill();
          g.lineWidth = 2; g.strokeStyle = i < reached ? '#bff6ff' : 'rgba(150,180,255,0.6)'; g.stroke();
        }
        hint(g, failT > 0 ? AS.t('game.chart.fail') : AS.t('game.chart.hint'), failT > 0 ? '#ff7d8b' : null);
      },
      pointerDown(x, y, id) {
        if (solved || dragId !== null || backT > 0) return;
        if (Math.hypot(x - sx, y - sy) <= GRAB) { dragId = id; grabbed = true; ctx.sfx('click'); dragTo(x, y); }
      },
      pointerMove(x, y, id) { if (id === dragId && !solved) dragTo(x, y); },
      pointerUp(x, y, id) { if (id === dragId) dragId = null; },
      destroy() { if (solved) finish(); if (DBG.live === inst) DBG.live = null; },
      __test: {
        nodes: () => nodes.map((n) => [Math.round(n.x), Math.round(n.y)]),
        ship: () => [Math.round(sx), Math.round(sy)],
        state: () => ({ seg, t, solved }),
      },
    };
    DBG.live = inst;
    return inst;
  }

  // =====================================================================================
  // STABILIZE STEERING
  // =====================================================================================
  function steerGame(ctx) {
    const W = ctx.w, H = ctx.h, rnd = ctx.rng, seed = (rnd() * 4294967295) >>> 0;
    const CX = W / 2, CY = 232, R = 172, LOCK = 15, LIM = R - 30;
    const finish = finisher(ctx);
    const hint = makeHint(W, 498);
    const a0 = rnd() * TAU, d0 = 98 + rnd() * 44;
    let hx = Math.cos(a0) * d0, hy = Math.sin(a0) * d0;
    let dragId = null, gx = 0, gy = 0, locked = false, time = 0, sweep = rnd() * TAU, lockPulse = 0, rot = 0, grabbed = false;
    let solved = false, snapT = 0, snapX = 0, snapY = 0, finishIn = -1, solvedT = 0;
    let xr = 1e9, yr = 1e9, xText = '', yText = '';
    const NS = 54, stars = new Float32Array(NS * 3);
    for (let i = 0; i < NS; i++) { stars[i * 3] = (rnd() * 2 - 1) * R; stars[i * 3 + 1] = (rnd() * 2 - 1) * R; stars[i * 3 + 2] = 1 + rnd() * 2.2; }
    const parts = Particles(80);
    let conic = null;

    function fmt(v) {
      const a = Math.abs(v) / 10;
      const s = a.toFixed(1);
      return (v < 0 ? '-' : '+') + (a < 10 ? '00' : a < 100 ? '0' : '') + s;
    }

    const bg = layer(W, 0, 0, W, H, (c) => {
      const r = U.rng(seed);
      paintWall(c, W, H);
      paintDevice(c, 12, 12, W - 24, H - 24, 30, 'steel', r);
      // bezel ring
      c.beginPath(); c.arc(CX, CY + 4, R + 26, 0, TAU); c.fillStyle = 'rgba(0,0,0,0.35)'; c.fill();
      const bz = c.createLinearGradient(0, CY - R - 24, 0, CY + R + 24);
      bz.addColorStop(0, '#5d687f'); bz.addColorStop(0.5, '#2b3243'); bz.addColorStop(1, '#4b556b');
      c.beginPath(); c.arc(CX, CY, R + 24, 0, TAU); c.fillStyle = bz; c.fill(); c.lineWidth = 4; c.strokeStyle = OUT; c.stroke();
      c.beginPath(); c.arc(CX, CY, R + 20, 0, TAU); c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,255,255,0.18)'; c.stroke();
      for (let d = 0; d < 360; d += 5) {
        const a = (d * Math.PI) / 180 - Math.PI / 2, big = d % 30 === 0;
        const r1 = R + 6, r2 = R + (big ? 18 : d % 10 === 0 ? 13 : 10);
        c.beginPath(); c.moveTo(CX + Math.cos(a) * r1, CY + Math.sin(a) * r1); c.lineTo(CX + Math.cos(a) * r2, CY + Math.sin(a) * r2);
        c.lineWidth = big ? 2.5 : 1.2; c.strokeStyle = big ? 'rgba(160,255,210,0.9)' : 'rgba(200,220,240,0.5)'; c.stroke();
      }
      // display face
      const fg = c.createRadialGradient(CX, CY, 10, CX, CY, R);
      fg.addColorStop(0, '#0f4a3e'); fg.addColorStop(0.7, '#082b25'); fg.addColorStop(1, '#03140f');
      c.beginPath(); c.arc(CX, CY, R, 0, TAU); c.fillStyle = fg; c.fill();
      c.save(); c.beginPath(); c.arc(CX, CY, R, 0, TAU); c.clip();
      c.strokeStyle = 'rgba(90,255,180,0.08)'; c.lineWidth = 1;
      for (let x = CX - R; x <= CX + R; x += 24) { c.beginPath(); c.moveTo(x + 0.5, CY - R); c.lineTo(x + 0.5, CY + R); c.stroke(); }
      for (let y = CY - R; y <= CY + R; y += 24) { c.beginPath(); c.moveTo(CX - R, y + 0.5); c.lineTo(CX + R, y + 0.5); c.stroke(); }
      c.strokeStyle = 'rgba(90,255,180,0.22)'; c.lineWidth = 1.5;
      for (let k = 1; k <= 3; k++) { c.beginPath(); c.arc(CX, CY, (R * k) / 3.2, 0, TAU); c.stroke(); }
      c.beginPath(); c.moveTo(CX - R, CY); c.lineTo(CX + R, CY); c.moveTo(CX, CY - R); c.lineTo(CX, CY + R); c.stroke();
      for (let k = -R; k <= R; k += 12) {
        const L = k % 48 === 0 ? 7 : 3.5;
        c.beginPath(); c.moveTo(CX + k, CY - L); c.lineTo(CX + k, CY + L); c.moveTo(CX - L, CY + k); c.lineTo(CX + L, CY + k); c.stroke();
      }
      c.restore();
      c.beginPath(); c.arc(CX, CY, R, 0, TAU); c.lineWidth = 3.5; c.strokeStyle = OUT; c.stroke();
      // readout wells
      paintScreen(c, 60, 438, 232, 44, 10, '#062a22', '#03140f');
      paintScreen(c, 308, 438, 232, 44, 10, '#0d1430', '#070b1d');
    });
    const glass = layer(W, CX - R - 2, CY - R - 2, R * 2 + 4, R * 2 + 4, (c) => {
      c.save(); c.beginPath(); c.arc(CX, CY, R, 0, TAU); c.clip();
      c.fillStyle = 'rgba(0,0,0,0.12)'; for (let y = CY - R; y < CY + R; y += 3) c.fillRect(CX - R, y, R * 2, 1);
      const v = c.createRadialGradient(CX, CY, R * 0.55, CX, CY, R);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
      c.fillStyle = v; c.fillRect(CX - R, CY - R, R * 2, R * 2);
      c.beginPath(); c.ellipse(CX - R * 0.25, CY - R * 0.55, R * 0.75, R * 0.32, -0.35, 0, TAU);
      const rf = c.createLinearGradient(0, CY - R, 0, CY - R * 0.2);
      rf.addColorStop(0, 'rgba(255,255,255,0.13)'); rf.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = rf; c.fill();
      c.restore();
    });

    function drawReticle(g, x, y, col, rgb) {
      glow(g, x, y, 76, rgb, 0.3 + lockPulse * 0.5);
      g.save(); g.translate(x, y); g.lineCap = 'round';
      for (let pass = 0; pass < 2; pass++) {
        g.strokeStyle = pass ? col : OUT; g.lineWidth = pass ? 3.5 : 7.5;
        g.beginPath(); g.arc(0, 0, 33, 0, TAU); g.stroke();
        g.beginPath(); g.arc(0, 0, 9, 0, TAU); g.stroke();
        g.save(); g.rotate(rot);
        g.beginPath();
        g.moveTo(15, 0); g.lineTo(47, 0); g.moveTo(-15, 0); g.lineTo(-47, 0);
        g.moveTo(0, 15); g.lineTo(0, 47); g.moveTo(0, -15); g.lineTo(0, -47);
        g.stroke();
        g.restore();
      }
      g.fillStyle = col; g.beginPath(); g.arc(0, 0, 3.2, 0, TAU); g.fill();
      g.restore();
    }

    const inst = {
      update(dt) {
        time += dt;
        sweep += dt * 1.7;
        if (lockPulse > 0) lockPulse = Math.max(0, lockPulse - dt * 2);
        if (solved) {
          solvedT += dt;
          snapT = Math.min(1, snapT + dt / 0.18);
          const k = 1 - outCubic(snapT);
          hx = snapX * k; hy = snapY * k;
        }
        const dist = Math.hypot(hx, hy);
        rot = locked || solved ? rot + angDiff(0, rot) * smooth(dt, 10) : rot + dt * (0.4 + dist / 200);
        const vx = -hx * 0.55, vy = -hy * 0.55;
        for (let i = 0; i < NS; i++) {
          let x = stars[i * 3] + vx * dt * (0.5 + stars[i * 3 + 2] * 0.3), y = stars[i * 3 + 1] + vy * dt * (0.5 + stars[i * 3 + 2] * 0.3);
          if (x < -R) x += 2 * R; else if (x > R) x -= 2 * R;
          if (y < -R) y += 2 * R; else if (y > R) y -= 2 * R;
          stars[i * 3] = x; stars[i * 3 + 1] = y;
        }
        parts.update(dt);
        if (finishIn > 0) { finishIn -= dt; if (finishIn <= 0) finish(); }
      },
      draw(g) {
        bg(g);
        const isLock = locked || solved;
        const col = isLock ? '#46ff9a' : '#ffb63f', rgb = isLock ? '70,255,154' : '255,182,63';
        const jx = dragId === null && !isLock ? Math.sin(time * 2.3) * 1.6 : 0, jy = dragId === null && !isLock ? Math.cos(time * 1.9) * 1.6 : 0;
        const ax = CX + hx + jx, ay = CY + hy + jy;
        g.save(); g.beginPath(); g.arc(CX, CY, R, 0, TAU); g.clip();
        g.fillStyle = 'rgba(190,255,225,0.75)';
        for (let i = 0; i < NS; i++) { const s = stars[i * 3 + 2]; g.fillRect(CX + stars[i * 3] - s / 2, CY + stars[i * 3 + 1] - s / 2, s, s); }
        if (!conic && g.createConicGradient) {
          conic = g.createConicGradient(0, 0, 0);
          conic.addColorStop(0, 'rgba(70,255,170,0)'); conic.addColorStop(0.8, 'rgba(70,255,170,0)'); conic.addColorStop(1, 'rgba(70,255,170,0.26)');
        }
        g.save(); g.translate(CX, CY); g.rotate(sweep);
        if (conic) { g.fillStyle = conic; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill(); }
        g.strokeStyle = 'rgba(130,255,200,0.55)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(R, 0); g.stroke();
        g.restore();
        // guide lines through the crosshair
        g.globalAlpha = 0.45; g.strokeStyle = col; g.lineWidth = 2;
        g.beginPath(); g.moveTo(CX - R, ay); g.lineTo(CX + R, ay); g.moveTo(ax, CY - R); g.lineTo(ax, CY + R); g.stroke();
        g.globalAlpha = 1;
        // center target
        const tc = isLock ? '#46ff9a' : '#e8fff4';
        glow(g, CX, CY, 46, isLock ? '70,255,154' : '160,255,220', isLock ? 0.6 : 0.18 + 0.1 * Math.sin(time * 4));
        g.setLineDash(DASH_RING); g.lineDashOffset = time * 8;
        g.beginPath(); g.arc(CX, CY, LOCK, 0, TAU); g.lineWidth = 2; g.strokeStyle = tc; g.stroke();
        g.setLineDash(NODASH); g.lineDashOffset = 0;
        g.lineCap = 'round'; g.lineJoin = 'round';
        for (let pass = 0; pass < 2; pass++) {
          g.lineWidth = pass ? 3.5 : 7; g.strokeStyle = pass ? tc : OUT;
          g.beginPath();
          for (let k = 0; k < 4; k++) {
            const sx = k & 1 ? 1 : -1, sy = k & 2 ? 1 : -1;
            g.moveTo(CX + sx * 26, CY + sy * 13); g.lineTo(CX + sx * 26, CY + sy * 26); g.lineTo(CX + sx * 13, CY + sy * 26);
          }
          g.stroke();
        }
        drawReticle(g, ax, ay, col, rgb);
        if (!grabbed) {
          const k = (time * 1.1) % 1;
          g.globalAlpha = (1 - k) * 0.9; g.strokeStyle = '#ffd23f'; g.lineWidth = 3;
          g.beginPath(); g.arc(ax, ay, 40 + k * 26, 0, TAU); g.stroke(); g.globalAlpha = 1;
        }
        g.restore();
        glass(g);
        parts.draw(g);
        // readouts
        const nx = Math.round(hx * 10), ny = Math.round(-hy * 10);
        if (nx !== xr) { xr = nx; xText = fmt(nx); }
        if (ny !== yr) { yr = ny; yText = fmt(ny); }
        g.textBaseline = 'middle';
        g.font = F(15); g.textAlign = 'left'; g.fillStyle = 'rgba(120,255,200,0.6)';
        g.fillText('X', 74, 461); g.fillText('Y', 184, 461);
        g.font = F(22); g.fillStyle = isLock ? '#7dffc0' : '#ffd27a';
        g.shadowColor = g.fillStyle; g.shadowBlur = 8;
        monoText(g, xText, 92, 461, 13, 0); monoText(g, yText, 202, 461, 13, 0);
        g.shadowBlur = 0; g.shadowColor = 'rgba(0,0,0,0)';
        const blink = isLock ? 1 : 0.55 + 0.45 * Math.sin(time * 6);
        g.globalAlpha = blink;
        g.beginPath(); g.arc(334, 460, 9, 0, TAU); g.fillStyle = col; g.fill(); g.lineWidth = 2.5; g.strokeStyle = OUT; g.stroke();
        glow(g, 334, 460, 26, rgb, 0.6);
        g.globalAlpha = 1;
        g.font = F(20); g.textAlign = 'left';
        glowText(g, UP(isLock ? 'game.steer.on' : 'game.steer.off'), 352, 461, col, 8);
        hint(g, AS.t('game.steer.hint'), isLock && !solved ? '#7dffc0' : null);
      },
      pointerDown(x, y, id) {
        if (solved || dragId !== null) return;
        if (Math.hypot(x - CX, y - CY) <= R + 26) {
          dragId = id; grabbed = true;
          gx = x - (CX + hx); gy = y - (CY + hy);
          if (Math.hypot(gx, gy) > 60) { gx = 0; gy = 0; hx = clamp(x - CX, -LIM, LIM); hy = clamp(y - CY, -LIM, LIM); }
          ctx.sfx('click');
        }
      },
      pointerMove(x, y, id) {
        if (id !== dragId || solved) return;
        let nx = x - gx - CX, ny = y - gy - CY;
        const d = Math.hypot(nx, ny);
        if (d > LIM) { nx *= LIM / d; ny *= LIM / d; }
        hx = nx; hy = ny;
        const L = Math.hypot(hx, hy) <= LOCK;
        if (L && !locked) { lockPulse = 1; ctx.sfx('beep'); }
        locked = L;
      },
      pointerUp(x, y, id) {
        if (id !== dragId) return;
        dragId = null;
        if (!solved && Math.hypot(hx, hy) <= LOCK) {
          solved = true; snapT = 0; snapX = hx; snapY = hy; finishIn = 0.5; lockPulse = 1;
          parts.ring(CX, CY, 60, 0.6, '#46ff9a');
          parts.burst(PK.STAR, CX, CY, 14, 220, 0.7, 8, '#b8ffd8');
          ctx.sfx('switch');
        }
      },
      destroy() { if (solved) finish(); if (DBG.live === inst) DBG.live = null; },
      __test: {
        cross: () => [Math.round(CX + hx), Math.round(CY + hy)],
        center: () => [CX, CY],
        state: () => ({ solved, locked }),
      },
    };
    DBG.live = inst;
    return inst;
  }

  // =====================================================================================
  // WATER PLANTS (Greenhouse)
  // =====================================================================================
  const FLOWERS = [
    { style: 'disc', n: 6, len: 27, wid: 10, petal: '#ff4b3e', edge: '#ffb199', center: '#ffd23f', core: 8 }, // pomegranate blossom
    { style: 'disc', n: 11, len: 25, wid: 6, petal: '#ffffff', edge: '#dfe8ff', center: '#ffc21f', core: 8.5 }, // daisy
    { style: 'disc', n: 13, len: 23, wid: 6.5, petal: '#ffd23f', edge: '#fff0a6', center: '#7a4a1c', core: 10.5 }, // sunflower
    { style: 'disc', n: 5, len: 25, wid: 12, petal: '#a77bff', edge: '#d7c4ff', center: '#fff3a0', core: 6.5 }, // violet
    { style: 'tulip', petal: '#ff5fa2', dark: '#cf3b7b', center: '#ffd23f' }, // tulip (lalə)
  ];
  const POT_COLORS = ['#d9673f', '#3fb6c9', '#efe2c4', '#8b5cff', '#ff9a3c', '#4f7cff'];

  function plantsGame(ctx) {
    const W = ctx.w, H = ctx.h, rnd = ctx.rng, seed = (rnd() * 4294967295) >>> 0;
    const SHELF = 386, RIM = 302, SOIL = RIM + 3, GROW = 1.6;
    const finish = finisher(ctx);
    const hint = makeHint(W, 434);
    const n = rnd() < 0.5 ? 3 : 4;
    const xa = n === 4 ? 96 : 112, xb = n === 4 ? 500 : 492;
    const types = U.shuffle(rnd, [0, 1, 2, 3, 4]);
    const pots = U.shuffle(rnd, POT_COLORS.slice());
    const plants = [];
    for (let i = 0; i < n; i++) {
      const fl = FLOWERS[types[i]];
      plants.push({
        x: xa + ((xb - xa) * i) / (n - 1), p: rnd() * 0.1, bloom: 0, done: false, dir: rnd() < 0.5 ? -1 : 1,
        ph: rnd() * TAU, fl, pot: pots[i], bud: ramp('#7a6448', fl.petal === '#ffffff' ? '#e9eef7' : fl.petal, 24), shake: 0, water: 0,
      });
    }
    const leafT = ramp('#a89a4a', '#38c75b', 24), leafD = ramp('#6f6526', '#1d8a3c', 24), stemT = ramp('#8b7a3e', '#2c9c47', 24), soilT = ramp('#a07c55', '#4a3020', 24);
    let canX = 640, canY = 214, dragId = null, ox = 0, oy = 0, pour = 0, target = -1, grabbed = false, time = 0, pourSnd = 0, emitAcc = 0, lift = 0;
    let solved = false, finishIn = -1;
    const parts = Particles(320);
    parts.onFloor = (p) => {
      if (p.kind !== PK.DROP) return;
      for (let k = 0; k < 2; k++) {
        const q = parts.spawn(PK.DOT, p.x, p.floor, (Math.random() - 0.5) * 90, -40 - Math.random() * 60, 0.28, 1.8, '#cdeeff');
        q.gr = 600;
      }
    };
    const CAN = '#ffb02e', CAN_D = '#d9821a', CAN_HI = '#ffe39a';

    // quadratic stem: P0 (base) -> C -> E, shared scratch (no allocation)
    let c0x = 0, c0y = 0, cCx = 0, cCy = 0, cEx = 0, cEy = 0, bx = 0, by = 0, tx = 0, ty = 0;
    function stemAt(s) {
      const u = 1 - s;
      bx = u * u * c0x + 2 * u * s * cCx + s * s * cEx; by = u * u * c0y + 2 * u * s * cCy + s * s * cEy;
      tx = 2 * u * (cCx - c0x) + 2 * s * (cEx - cCx); ty = 2 * u * (cCy - c0y) + 2 * s * (cEy - cCy);
    }

    const bg = layer(W, 0, 0, W, H, (c) => {
      const r = U.rng(seed);
      const sky = c.createLinearGradient(0, 0, 0, SHELF);
      sky.addColorStop(0, '#081433'); sky.addColorStop(1, '#123257');
      c.fillStyle = sky; c.fillRect(0, 0, W, SHELF);
      for (let i = 0; i < 120; i++) {
        const s = r();
        c.fillStyle = 'rgba(230,240,255,' + (0.2 + s * 0.6).toFixed(2) + ')';
        c.beginPath(); c.arc(r() * W, 36 + r() * 250, 0.4 + s * 1.4, 0, TAU); c.fill();
      }
      nebula(c, 140, 120, 220, '120,90,255', 0.18);
      // planet through the glass
      const px = 560 + r() * 60, py = 120, pr = 92;
      nebula(c, px, py, pr * 1.6, '90,200,255', 0.25);
      const pg = c.createRadialGradient(px - 30, py - 34, 10, px, py, pr);
      pg.addColorStop(0, '#9ff3d0'); pg.addColorStop(0.55, '#3aa58a'); pg.addColorStop(1, '#13414a');
      c.beginPath(); c.arc(px, py, pr, 0, TAU); c.fillStyle = pg; c.fill();
      c.save(); c.clip();
      c.fillStyle = 'rgba(255,255,255,0.12)';
      for (let k = 0; k < 5; k++) { c.beginPath(); c.ellipse(px - 20 + r() * 40, py - 60 + k * 28, 70 + r() * 30, 6 + r() * 5, -0.15, 0, TAU); c.fill(); }
      c.restore();
      // glass panes + mullions
      for (let x = 0; x <= W; x += 180) {
        c.fillStyle = 'rgba(255,255,255,0.035)';
        c.beginPath(); c.moveTo(x + 30, 30); c.lineTo(x + 80, 30); c.lineTo(x + 20, 300); c.lineTo(x - 30, 300); c.closePath(); c.fill();
      }
      c.fillStyle = '#26314a'; c.strokeStyle = OUT; c.lineWidth = 3;
      for (let x = 0; x <= W; x += 180) { c.fillRect(x - 8, 20, 16, 300); c.strokeRect(x - 8, 20, 16, 300); c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(x - 6, 20, 3, 300); c.fillStyle = '#26314a'; }
      c.fillRect(0, 168, W, 10); c.strokeRect(-4, 168, W + 8, 10);
      // top beam with grow-light strip
      const beam = c.createLinearGradient(0, 0, 0, 34);
      beam.addColorStop(0, '#46526e'); beam.addColorStop(1, '#232b40');
      c.fillStyle = beam; c.fillRect(0, 0, W, 34); c.fillStyle = OUT; c.fillRect(0, 34, W, 3);
      const lg = c.createLinearGradient(0, 30, 0, 300);
      lg.addColorStop(0, 'rgba(255,110,220,0.24)'); lg.addColorStop(1, 'rgba(255,110,220,0)');
      c.fillStyle = lg; c.fillRect(0, 34, W, 270);
      for (let x = 16; x < W; x += 34) { rr(c, x, 24, 24, 7, 3.5); c.fillStyle = '#ff7fe0'; c.fill(); c.fillStyle = 'rgba(255,255,255,0.7)'; c.fillRect(x + 4, 25, 16, 2); }
      // back wall below the glass
      const wall = c.createLinearGradient(0, 300, 0, SHELF);
      wall.addColorStop(0, '#24344a'); wall.addColorStop(1, '#172334');
      c.fillStyle = wall; c.fillRect(0, 300, W, SHELF - 300);
      c.fillStyle = OUT; c.fillRect(0, 298, W, 4);
      // hydroponic pipe
      c.fillStyle = '#2e8f86'; c.fillRect(0, 332, W, 14); c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(0, 334, W, 3);
      c.strokeStyle = OUT; c.lineWidth = 2.5; c.strokeRect(-4, 332, W + 8, 14);
      for (let x = 60; x < W; x += 150) { rr(c, x, 328, 18, 22, 4); c.fillStyle = '#3fb6aa'; c.fill(); c.stroke(); }
      // wooden shelf
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(0, SHELF - 10, W, 6);
      const top = c.createLinearGradient(0, SHELF - 6, 0, SHELF + 8);
      top.addColorStop(0, '#d79a5e'); top.addColorStop(1, '#b97a43');
      c.fillStyle = top; c.fillRect(0, SHELF - 6, W, 14);
      const front = c.createLinearGradient(0, SHELF + 8, 0, SHELF + 44);
      front.addColorStop(0, '#9a6236'); front.addColorStop(1, '#6e4224');
      c.fillStyle = front; c.fillRect(0, SHELF + 8, W, 36);
      c.strokeStyle = OUT; c.lineWidth = 3; c.beginPath(); c.moveTo(0, SHELF - 6); c.lineTo(W, SHELF - 6); c.moveTo(0, SHELF + 8); c.lineTo(W, SHELF + 8); c.moveTo(0, SHELF + 44); c.lineTo(W, SHELF + 44); c.stroke();
      c.strokeStyle = 'rgba(60,30,10,0.35)'; c.lineWidth = 1.5;
      for (let k = 0; k < 7; k++) { const y = SHELF + 14 + k * 4.5; c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(W * 0.3, y + (r() - 0.5) * 6, W * 0.6, y + (r() - 0.5) * 6, W, y); c.stroke(); }
      for (let x = 150 + r() * 40; x < W; x += 200) { c.strokeStyle = 'rgba(40,20,5,0.5)'; c.beginPath(); c.moveTo(x, SHELF + 8); c.lineTo(x, SHELF + 44); c.stroke(); }
      const below = c.createLinearGradient(0, SHELF + 44, 0, H);
      below.addColorStop(0, '#0d1424'); below.addColorStop(1, '#070b16');
      c.fillStyle = below; c.fillRect(0, SHELF + 44, W, H - SHELF - 44);
      // pot shadows + openings (back rim + dark interior)
      for (let i = 0; i < n; i++) {
        const pl = plants[i], x = pl.x;
        c.beginPath(); c.ellipse(x + 6, SHELF + 1, 54, 8, 0, 0, TAU); c.fillStyle = 'rgba(0,0,0,0.38)'; c.fill();
        c.beginPath(); c.ellipse(x, RIM, 60, 13, 0, 0, TAU); c.fillStyle = shade(pl.pot, 0.25); c.fill(); c.lineWidth = 3; c.strokeStyle = OUT; c.stroke();
        c.beginPath(); c.ellipse(x, RIM + 1, 51, 9.5, 0, 0, TAU); c.fillStyle = '#24160e'; c.fill();
      }
    });
    const potLayer = layer(W, 0, RIM - 20, W, SHELF - RIM + 40, (c) => {
      for (let i = 0; i < n; i++) {
        const pl = plants[i], x = pl.x;
        const body = c.createLinearGradient(x - 56, 0, x + 56, 0);
        body.addColorStop(0, shade(pl.pot, -0.25)); body.addColorStop(0.32, shade(pl.pot, 0.18)); body.addColorStop(0.55, pl.pot); body.addColorStop(1, shade(pl.pot, -0.42));
        c.beginPath(); c.moveTo(x - 54, RIM + 16); c.lineTo(x - 41, SHELF - 4); c.quadraticCurveTo(x, SHELF + 8, x + 41, SHELF - 4); c.lineTo(x + 54, RIM + 16); c.closePath();
        c.fillStyle = body; c.fill(); c.lineWidth = 3.5; c.strokeStyle = OUT; c.lineJoin = 'round'; c.stroke();
        // buta (paisley) motif
        c.save(); c.translate(x - 20, SHELF - 40); c.rotate(-0.25);
        c.beginPath(); c.moveTo(0, 12); c.bezierCurveTo(-13, 10, -13, -8, 0, -10); c.bezierCurveTo(9, -11, 13, -2, 7, 3); c.bezierCurveTo(4, 6, 6, 9, 10, 8); c.bezierCurveTo(8, 12, 4, 13, 0, 12);
        c.fillStyle = 'rgba(255,255,255,0.28)'; c.fill(); c.lineWidth = 1.5; c.strokeStyle = 'rgba(0,0,0,0.25)'; c.stroke();
        c.restore();
        // rim band (front half)
        const band = c.createLinearGradient(x - 60, 0, x + 60, 0);
        band.addColorStop(0, shade(pl.pot, -0.15)); band.addColorStop(0.35, shade(pl.pot, 0.3)); band.addColorStop(1, shade(pl.pot, -0.35));
        c.beginPath(); c.ellipse(x, RIM, 60, 13, 0, 0, Math.PI); c.lineTo(x - 60, RIM + 15); c.ellipse(x, RIM + 15, 60, 13, 0, Math.PI, 0, true); c.closePath();
        c.fillStyle = band; c.fill(); c.lineWidth = 3.5; c.strokeStyle = OUT; c.stroke();
        c.beginPath(); c.ellipse(x, RIM + 2, 57, 11, 0, 0.25, Math.PI - 0.25); c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,0.35)'; c.stroke();
      }
    });

    function drawLeaf(g, x, y, a, L, wdt, fill, dark) {
      g.save(); g.translate(x, y); g.rotate(a);
      g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(L * 0.45, -wdt, L, 0); g.quadraticCurveTo(L * 0.45, wdt, 0, 0);
      g.fillStyle = fill; g.fill(); g.lineWidth = 2.5; g.strokeStyle = OUT; g.stroke();
      g.beginPath(); g.moveTo(2, 0); g.quadraticCurveTo(L * 0.5, -wdt * 0.15, L * 0.86, 0); g.lineWidth = 1.6; g.strokeStyle = dark; g.stroke();
      g.restore();
    }
    function drawFlower(g, pl, idx) {
      const fl = pl.fl;
      if (!pl.done) {
        g.fillStyle = pl.bud[idx];
        g.beginPath(); g.moveTo(0, -24); g.bezierCurveTo(12, -18, 13, -2, 0, 2); g.bezierCurveTo(-13, -2, -12, -18, 0, -24);
        g.fill(); g.lineWidth = 2.5; g.strokeStyle = OUT; g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.ellipse(-4, -13, 2.5, 6, 0.2, 0, TAU); g.fill();
        g.fillStyle = leafT[idx];
        g.beginPath(); g.moveTo(-10, 0); g.quadraticCurveTo(-6, -10, 0, -7); g.quadraticCurveTo(6, -10, 10, 0); g.quadraticCurveTo(0, 6, -10, 0);
        g.fill(); g.lineWidth = 2; g.strokeStyle = OUT; g.stroke();
        return;
      }
      const k = Math.max(0.05, outBack(pl.bloom));
      g.translate(0, -12);
      if (fl.style === 'tulip') {
        g.lineWidth = 2.5; g.strokeStyle = OUT; g.lineJoin = 'round';
        g.fillStyle = fl.dark;
        g.beginPath(); g.moveTo(0, -36 * k); g.bezierCurveTo(15 * k, -30 * k, 18 * k, -4 * k, 0, 6 * k); g.bezierCurveTo(-18 * k, -4 * k, -15 * k, -30 * k, 0, -36 * k); g.fill(); g.stroke();
        g.fillStyle = fl.petal;
        g.beginPath(); g.moveTo(-19 * k, -30 * k); g.bezierCurveTo(-24 * k, -10 * k, -14 * k, 6 * k, 2 * k, 6 * k); g.bezierCurveTo(-2 * k, -8 * k, -6 * k, -22 * k, -19 * k, -30 * k); g.fill(); g.stroke();
        g.beginPath(); g.moveTo(19 * k, -30 * k); g.bezierCurveTo(24 * k, -10 * k, 14 * k, 6 * k, -2 * k, 6 * k); g.bezierCurveTo(2 * k, -8 * k, 6 * k, -22 * k, 19 * k, -30 * k); g.fill(); g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(-9 * k, -14 * k, 2.5 * k, 8 * k, 0.3, 0, TAU); g.fill();
        return;
      }
      g.lineWidth = 2.4; g.strokeStyle = OUT; g.lineJoin = 'round';
      const sway = Math.sin(time * 1.3 + pl.ph) * 0.06;
      for (let j = 0; j < fl.n; j++) {
        const a = (j / fl.n) * TAU + pl.ph + sway;
        const d = fl.len * 0.52 * k;
        g.beginPath(); g.ellipse(Math.sin(a) * d, -Math.cos(a) * d, fl.wid * k, fl.len * 0.56 * k, a, 0, TAU);
        g.fillStyle = fl.petal; g.fill(); g.stroke();
      }
      for (let j = 0; j < fl.n; j++) {
        const a = (j / fl.n) * TAU + pl.ph + sway, d = fl.len * 0.62 * k;
        g.beginPath(); g.ellipse(Math.sin(a) * d, -Math.cos(a) * d, fl.wid * 0.35 * k, fl.len * 0.25 * k, a, 0, TAU);
        g.fillStyle = fl.edge; g.fill();
      }
      g.beginPath(); g.arc(0, 0, fl.core * (0.4 + 0.6 * k), 0, TAU); g.fillStyle = fl.center; g.fill(); g.lineWidth = 2.5; g.stroke();
      g.fillStyle = 'rgba(0,0,0,0.25)';
      for (let j = 0; j < 5; j++) { const a = j * 1.26 + pl.ph; g.beginPath(); g.arc(Math.cos(a) * fl.core * 0.45, Math.sin(a) * fl.core * 0.45, 1.3, 0, TAU); g.fill(); }
      g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.arc(-fl.core * 0.3, -fl.core * 0.35, fl.core * 0.25, 0, TAU); g.fill();
    }
    function drawPlant(g, pl) {
      const e = inOut(pl.p), idx = Math.round(pl.p * 23);
      const sway = Math.sin(time * 1.6 + pl.ph) * (1.5 + 3 * e) + Math.sin(time * 23 + pl.ph) * 2.2 * pl.shake;
      c0x = pl.x; c0y = SOIL;
      cCx = pl.x + lerp(pl.dir * 16, sway * 0.4, e); cCy = SOIL - lerp(150, 74, e);
      cEx = pl.x + lerp(pl.dir * 70, sway, e); cEy = SOIL - lerp(84, 150, e);
      if (pl.done) cEy -= Math.sin(clamp(pl.bloom, 0, 1) * Math.PI) * 6;
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(c0x, c0y); g.quadraticCurveTo(cCx, cCy, cEx, cEy);
      g.lineWidth = 11; g.strokeStyle = OUT; g.stroke();
      g.lineWidth = 6; g.strokeStyle = stemT[idx]; g.stroke();
      const spread = lerp(2.3, 0.95, e), Ls = 0.8 + 0.25 * e, wd = lerp(0.24, 0.36, e);
      for (let j = 0; j < 3; j++) {
        const s = 0.32 + j * 0.2, side = j & 1 ? 1 : -1, L = (34 - j * 4) * Ls;
        stemAt(s);
        drawLeaf(g, bx, by, Math.atan2(ty, tx) + side * spread * (pl.dir > 0 ? 1 : 1), L, L * wd, leafT[idx], leafD[idx]);
      }
      stemAt(1);
      g.save(); g.translate(cEx, cEy); g.rotate(Math.atan2(ty, tx) + Math.PI / 2);
      drawFlower(g, pl, idx);
      g.restore();
    }
    const TILT = -0.8, SPX = -0.78, SPY = -0.63, ROSEX = -91, ROSEY = -27;
    function drawCan(g) {
      const a = TILT * inOut(pour);
      g.save(); g.translate(canX, canY - lift * 4); g.rotate(a);
      g.lineCap = 'round'; g.lineJoin = 'round';
      // spout (behind the body), rising from the lower front of the can
      g.beginPath(); g.moveTo(-30, 20); g.lineTo(-86, -24); g.lineWidth = 17; g.strokeStyle = OUT; g.stroke();
      g.lineWidth = 10.5; g.strokeStyle = CAN_D; g.stroke();
      g.beginPath(); g.moveTo(-38, 11); g.lineTo(-82, -24); g.lineWidth = 3; g.strokeStyle = CAN_HI; g.stroke();
      g.save(); g.translate(ROSEX + 2, ROSEY + 1); g.rotate(-0.68);
      g.beginPath(); g.ellipse(0, 0, 7, 14, 0, 0, TAU); g.fillStyle = '#cfd8e4'; g.fill(); g.lineWidth = 3; g.strokeStyle = OUT; g.stroke();
      g.fillStyle = '#5d6778';
      for (let k = -2; k <= 2; k++) { g.beginPath(); g.arc(-1.5, k * 4.5, 1.2, 0, TAU); g.fill(); }
      g.restore();
      // handle on the back
      g.beginPath(); g.moveTo(16, -32); g.bezierCurveTo(30, -82, 92, -46, 46, 14); g.lineWidth = 15; g.strokeStyle = OUT; g.stroke();
      g.lineWidth = 8.5; g.strokeStyle = CAN; g.stroke();
      g.beginPath(); g.moveTo(22, -40); g.bezierCurveTo(36, -70, 70, -50, 60, -20); g.lineWidth = 2.5; g.strokeStyle = CAN_HI; g.stroke();
      // body: rounded barrel
      g.beginPath(); g.moveTo(-42, -28); g.bezierCurveTo(-52, 0, -51, 30, -40, 41); g.lineTo(40, 41); g.bezierCurveTo(51, 30, 52, 0, 42, -28); g.closePath();
      g.fillStyle = CAN; g.fill();
      g.save(); g.clip();
      g.fillStyle = 'rgba(160,70,0,0.28)'; g.beginPath(); g.ellipse(46, 8, 26, 60, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.38)'; g.beginPath(); g.ellipse(-30, 2, 7, 34, 0.08, 0, TAU); g.fill();
      g.fillStyle = CAN_D; g.fillRect(-60, 20, 120, 8); g.fillRect(-60, -16, 120, 5);
      g.restore();
      g.lineWidth = 4; g.strokeStyle = OUT; g.stroke();
      g.beginPath(); g.ellipse(0, -28, 42, 7, 0, 0, TAU); g.fillStyle = CAN_D; g.fill(); g.lineWidth = 3.5; g.stroke();
      g.beginPath(); g.ellipse(0, -27.5, 32, 4, 0, 0, TAU); g.fillStyle = '#5a3208'; g.fill();
      // drop emblem
      g.beginPath(); g.moveTo(2, -9); g.bezierCurveTo(11, 3, 10, 13, 2, 13); g.bezierCurveTo(-6, 13, -7, 3, 2, -9);
      g.fillStyle = '#4fb8ff'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = OUT; g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.ellipse(-0.5, 5, 1.6, 3, 0.3, 0, TAU); g.fill();
      g.restore();
    }
    function spawnDrop() {
      const a = TILT * inOut(pour), ca = Math.cos(a), sa = Math.sin(a);
      const lx = ROSEX - 2 + (Math.random() - 0.5) * 4, lyy = ROSEY + (Math.random() - 0.5) * 18;
      const x = canX + lx * ca - lyy * sa, y = canY - lift * 4 + lx * sa + lyy * ca;
      const dx = SPX * ca - SPY * sa, dy = SPX * sa + SPY * ca;
      const sp = 60 + Math.random() * 60;
      const p = parts.spawn(PK.DROP, x, y, dx * sp + (Math.random() - 0.5) * 36, dy * sp + (Math.random() - 0.5) * 20, 1.6, 3 + Math.random() * 1.8, Math.random() < 0.25 ? '#e8f7ff' : '#6cc6ff');
      p.gr = 900;
      p.floor = SHELF - 4;
      for (let i = 0; i < n; i++) if (Math.abs(x - plants[i].x) < 50) { p.floor = SOIL + 2 + Math.random() * 6; break; }
    }
    function canHit(x, y) { return x > canX - 106 && x < canX + 70 && y > canY - 84 && y < canY + 50; }

    const inst = {
      update(dt) {
        time += dt;
        target = -1;
        if (dragId !== null && !solved) {
          const tipX = canX + ROSEX;
          let best = 52;
          if (canY < RIM - 16) {
            for (let i = 0; i < n; i++) { const d = Math.abs(tipX - plants[i].x); if (d < best) { best = d; target = i; } }
          }
        }
        const pl = target >= 0 ? plants[target] : null;
        const active = !!(pl && !pl.done);
        pour = U.approach(pour, active ? 1 : 0, dt * (active ? 4 : 5));
        lift = U.approach(lift, dragId !== null ? 1 : 0, dt * 8);
        if (pour > 0.55) {
          emitAcc += dt * 48;
          while (emitAcc >= 1) { emitAcc -= 1; spawnDrop(); }
          pourSnd -= dt;
          if (pourSnd <= 0) { ctx.sfx('pour'); pourSnd = 1.15; }
        } else { emitAcc = 0; pourSnd = 0; }
        if (active && pour > 0.6) {
          pl.p = Math.min(1, pl.p + dt / GROW);
          pl.water = Math.min(1, pl.water + dt * 3);
          pl.shake = Math.min(1, pl.shake + dt * 3);
          if (pl.p >= 1) {
            pl.done = true; pl.bloom = 0;
            stemAt(1);
            const fx = pl.x + Math.sin(time * 1.6 + pl.ph) * 4.5, fy = SOIL - 150 - 14;
            parts.burst(PK.PETAL, fx, fy, 16, 260, 1.2, 7, pl.fl.petal, 260);
            parts.burst(PK.STAR, fx, fy, 12, 220, 0.8, 9, '#fff6c8');
            parts.ring(fx, fy, 50, 0.55, '#bfffd0');
            ctx.sfx('task_step');
            let all = true;
            for (let i = 0; i < n; i++) if (!plants[i].done) all = false;
            if (all) { solved = true; finishIn = 1.0; dragId = null; }
          }
        }
        for (let i = 0; i < n; i++) {
          const q = plants[i];
          if (i !== target || !active) { q.shake = Math.max(0, q.shake - dt * 2.5); q.water = Math.max(0, q.water - dt * 1.5); }
          if (q.done && q.bloom < 1) q.bloom = Math.min(1, q.bloom + dt / 0.7);
        }
        parts.update(dt);
        if (finishIn > 0) { finishIn -= dt; if (finishIn <= 0) finish(); }
      },
      draw(g) {
        bg(g);
        for (let i = 0; i < n; i++) {
          const pl = plants[i];
          if (i === target && dragId !== null) glow(g, pl.x, SOIL - 40, 120, pl.done ? '120,255,170' : '80,200,255', 0.32);
          if (pl.done) glow(g, pl.x, SOIL - 160, 90, '255,230,140', 0.22 * pl.bloom);
          g.beginPath(); g.ellipse(pl.x, SOIL - 1, 49, 8.5, 0, 0, TAU); g.fillStyle = soilT[Math.round(pl.p * 23)]; g.fill();
          g.fillStyle = 'rgba(0,0,0,0.25)';
          g.beginPath(); g.ellipse(pl.x - 18, SOIL, 5, 1.6, 0, 0, TAU); g.ellipse(pl.x + 22, SOIL + 2, 4, 1.4, 0, 0, TAU); g.ellipse(pl.x + 4, SOIL - 3, 3, 1.2, 0, 0, TAU); g.fill();
          if (pl.water > 0.01) glow(g, pl.x, SOIL, 50, '110,200,255', pl.water * 0.45);
        }
        for (let i = 0; i < n; i++) drawPlant(g, plants[i]);
        potLayer(g);
        // moisture badges
        for (let i = 0; i < n; i++) {
          const pl = plants[i], x = pl.x + 18, y = SHELF - 36;
          g.beginPath(); g.arc(x, y, 14, 0, TAU); g.fillStyle = pl.done ? '#2bd36f' : '#121a30'; g.fill(); g.lineWidth = 3; g.strokeStyle = OUT; g.stroke();
          if (pl.done) {
            g.beginPath(); g.moveTo(x - 6, y); g.lineTo(x - 1.5, y + 5); g.lineTo(x + 7, y - 5); g.lineWidth = 3.5; g.strokeStyle = '#ffffff'; g.lineCap = 'round'; g.stroke();
          } else {
            g.save();
            g.beginPath(); g.moveTo(x, y - 10); g.bezierCurveTo(x + 8, y - 1, x + 8, y + 8, x, y + 8); g.bezierCurveTo(x - 8, y + 8, x - 8, y - 1, x, y - 10);
            g.fillStyle = '#26324f'; g.fill();
            g.clip();
            const lv = y + 8 - 18 * pl.p;
            g.fillStyle = '#4fb8ff'; g.fillRect(x - 9, lv, 18, 20);
            g.restore();
            g.beginPath(); g.moveTo(x, y - 10); g.bezierCurveTo(x + 8, y - 1, x + 8, y + 8, x, y + 8); g.bezierCurveTo(x - 8, y + 8, x - 8, y - 1, x, y - 10);
            g.lineWidth = 1.5; g.strokeStyle = 'rgba(200,230,255,0.7)'; g.stroke();
          }
        }
        parts.draw(g);
        if (!grabbed) {
          const k = (time * 1.1) % 1;
          g.globalAlpha = (1 - k) * 0.9; g.strokeStyle = '#ffd23f'; g.lineWidth = 3;
          g.beginPath(); g.arc(canX - 10, canY - 6, 64 + k * 26, 0, TAU); g.stroke(); g.globalAlpha = 1;
        }
        drawCan(g);
        hint(g, solved ? AS.t('game.plants.done') : AS.t('game.plants.hint'), solved ? '#7dffb0' : null);
      },
      pointerDown(x, y, id) {
        if (solved || dragId !== null) return;
        if (canHit(x, y)) { dragId = id; grabbed = true; ox = canX - x; oy = canY - y; ctx.sfx('click'); }
      },
      pointerMove(x, y, id) {
        if (id !== dragId || solved) return;
        canX = clamp(x + ox, 118, W - 66);
        canY = clamp(y + oy, 96, SHELF - 70);
      },
      pointerUp(x, y, id) { if (id === dragId) dragId = null; },
      destroy() { if (solved) finish(); if (DBG.live === inst) DBG.live = null; },
      __test: {
        plants: () => plants.map((q) => [Math.round(q.x), Math.round(q.p * 100) / 100, q.done]),
        can: () => [Math.round(canX), Math.round(canY)],
        // where to hold the can (its grab point = can center) so the spout is over plant i
        holdFor: (i) => [Math.round(plants[i].x - ROSEX), 170],
      },
    };
    DBG.live = inst;
    return inst;
  }

  // =====================================================================================
  // INSPECT SAMPLE (long task)
  // =====================================================================================
  const LIQ = [
    { m: '#3d8bff', l: '#9cc6ff', d: '#2257c7', rgb: '61,139,255' },
    { m: '#22c7c0', l: '#8af0ea', d: '#108a85', rgb: '34,199,192' },
    { m: '#6a63ff', l: '#b0abff', d: '#3e37c9', rgb: '106,99,255' },
  ];
  const ANOM = [
    { m: '#ff4058', l: '#ff9ba7', d: '#b81a33', rgb: '255,64,88' },
    { m: '#ff9a2e', l: '#ffcb8f', d: '#c46610', rgb: '255,154,46' },
    { m: '#ffd23f', l: '#fff0a3', d: '#c79a12', rgb: '255,210,63' },
  ];
  const SAMPLE_WAIT = 45;

  function sampleGame(ctx) {
    const W = ctx.w, H = ctx.h, rnd = ctx.rng, seed = (rnd() * 4294967295) >>> 0;
    const mem = ctx.memory || {};
    const finish = finisher(ctx);
    const hint = makeHint(W, 424);
    const TX = [92, 186, 280, 374, 468], TT = 168, TB = 322, HW = 21, FULL = 0.72, LIQH = TB - TT - 10;
    const SBX = 613, SBY = 208, SBR = 46;
    const PER = 0.6, FILL_TOTAL = PER * 5 + 0.35;
    const levels = new Float32Array(5);
    let fillOn = false, fillT = 0, carX = 500, press = 0, time = 0, wrongT = 0, wrongIdx = -1, pickIdx = -1, pickT = 0, readyFlash = 0;
    let solved = false, finishIn = -1, lastSec = -1, timeText = '0:45';
    if (mem.phase === 'wait' || mem.phase === 'ready') for (let i = 0; i < 5; i++) levels[i] = FULL;
    else mem.phase = 'idle';
    const NB = 22, bub = new Float32Array(NB * 5); // tube, x, y, r, v
    function respawnBubble(i, anyY) {
      const tb = Math.floor(Math.random() * 5);
      bub[i * 5] = tb; bub[i * 5 + 1] = (Math.random() - 0.5) * HW * 1.1;
      const surf = TB - LIQH * levels[tb];
      bub[i * 5 + 2] = anyY ? surf + Math.random() * (TB - surf) : TB - 8;
      bub[i * 5 + 3] = 1.2 + Math.random() * 2.4; bub[i * 5 + 4] = 18 + Math.random() * 34;
    }
    for (let i = 0; i < NB; i++) respawnBubble(i, true);
    const parts = Particles(140);

    const remaining = () => (mem.phase === 'wait' ? Math.max(0, mem.start + SAMPLE_WAIT - ctx.now()) : 0);
    function liq(i) {
      if (mem.phase === 'ready' || (mem.phase === 'done' && solved)) return i === mem.anomaly ? ANOM[mem.anom | 0] : LIQ[mem.liq | 0];
      return LIQ[mem.liq | 0];
    }
    function start() {
      if (mem.phase !== 'idle' || fillOn || wrongT > 0 || solved) return;
      mem.phase = 'wait';
      mem.start = ctx.now() + FILL_TOTAL;
      mem.anomaly = Math.floor(rnd() * 5);
      mem.liq = Math.floor(rnd() * LIQ.length);
      mem.anom = Math.floor(rnd() * ANOM.length);
      fillOn = true; fillT = 0; press = 1;
      for (let i = 0; i < 5; i++) levels[i] = 0;
      ctx.sfx('click');
    }
    function pick(i) {
      if (mem.phase !== 'ready' || solved || wrongT > 0) return;
      pickIdx = i; pickT = 1;
      if (i === mem.anomaly) {
        solved = true; mem.phase = 'done'; finishIn = 0.75;
        parts.burst(PK.STAR, TX[i], 240, 18, 240, 0.9, 9, '#d9fff0');
        parts.ring(TX[i], 240, 70, 0.6, '#46ff9a');
        ctx.sfx('success');
      } else {
        wrongIdx = i; wrongT = 1.7;
        mem.phase = 'idle'; mem.start = 0;
        ctx.sfx('task_fail');
      }
    }

    const bg = layer(W, 0, 0, W, H, (c) => {
      const r = U.rng(seed);
      paintWall(c, W, H);
      paintDevice(c, 12, 12, W - 24, H - 24, 24, 'white', r);
      paintScreen(c, 40, 34, 640, 60, 12, '#06261f', '#021310');
      // tube window
      paintScreen(c, 34, 112, 492, 236, 14, '#16223c', '#0a1124');
      c.save(); rr(c, 34, 112, 492, 236, 14); c.clip();
      const back = c.createRadialGradient(280, 200, 20, 280, 220, 300);
      back.addColorStop(0, 'rgba(120,200,255,0.16)'); back.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = back; c.fillRect(34, 112, 492, 236);
      c.strokeStyle = 'rgba(140,180,255,0.07)'; c.lineWidth = 1;
      for (let x = 50; x < 526; x += 22) { c.beginPath(); c.moveTo(x, 112); c.lineTo(x, 348); c.stroke(); }
      // rail
      c.fillStyle = '#4a5670'; c.fillRect(34, 120, 492, 9); c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(34, 121, 492, 2);
      c.fillStyle = OUT; c.fillRect(34, 129, 492, 2);
      // rack back plate
      c.fillStyle = '#2a3550'; c.fillRect(34, 300, 492, 48);
      c.restore();
      // tube backs
      for (let i = 0; i < 5; i++) {
        tubePath(c, TX[i]); c.fillStyle = 'rgba(190,225,255,0.10)'; c.fill();
      }
      // right control panel
      paintScreen(c, 540, 112, 146, 290, 14, '#27324d', '#161d33');
      c.beginPath(); c.arc(SBX, SBY + 3, SBR + 15, 0, TAU); c.fillStyle = 'rgba(0,0,0,0.4)'; c.fill();
      const bz = c.createLinearGradient(0, SBY - SBR - 13, 0, SBY + SBR + 13);
      bz.addColorStop(0, '#e9eef6'); bz.addColorStop(1, '#7d8aa0');
      c.beginPath(); c.arc(SBX, SBY, SBR + 12, 0, TAU); c.fillStyle = bz; c.fill(); c.lineWidth = 3.5; c.strokeStyle = OUT; c.stroke();
      c.beginPath(); c.arc(SBX, SBY, SBR + 3, 0, TAU); c.fillStyle = '#10131f'; c.fill();
      rr(c, 556, 280, 114, 30, 9); c.fillStyle = '#0c1226'; c.fill(); c.lineWidth = 2.5; c.strokeStyle = OUT; c.stroke();
      for (let k = 0; k < 6; k++) { rr(c, 562, 352 + k * 7.5, 102, 3.5, 2); c.fillStyle = 'rgba(0,0,0,0.55)'; c.fill(); }
      // button wells
      for (let i = 0; i < 5; i++) { rr(c, TX[i] - 39, 358, 78, 46, 12); c.fillStyle = 'rgba(0,0,0,0.3)'; c.fill(); }
    });
    function tubePath(c, x) {
      c.beginPath();
      c.moveTo(x - HW, TT); c.lineTo(x - HW, TB - HW); c.arc(x, TB - HW, HW, Math.PI, 0, true); c.lineTo(x + HW, TT); c.closePath();
    }
    const front = layer(W, 34, 112, 492, 236, (c) => {
      c.save(); rr(c, 34, 112, 492, 236, 14); c.clip();
      for (let i = 0; i < 5; i++) {
        const x = TX[i];
        tubePath(c, x); c.lineWidth = 3.5; c.strokeStyle = OUT; c.stroke();
        c.lineCap = 'round';
        c.beginPath(); c.moveTo(x - HW + 7, TT + 10); c.lineTo(x - HW + 7, TB - 24); c.lineWidth = 4; c.strokeStyle = 'rgba(255,255,255,0.45)'; c.stroke();
        c.beginPath(); c.moveTo(x + HW - 6, TT + 16); c.lineTo(x + HW - 6, TT + 60); c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,0.22)'; c.stroke();
        rr(c, x - HW - 5, TT - 7, HW * 2 + 10, 11, 5); c.fillStyle = '#d5e4f3'; c.fill(); c.lineWidth = 3; c.strokeStyle = OUT; c.stroke();
        for (let k = 1; k <= 4; k++) { const y = TB - 14 - k * 24; c.beginPath(); c.moveTo(x + HW - 9, y); c.lineTo(x + HW - 2, y); c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,255,255,0.35)'; c.stroke(); }
      }
      // rack front bar
      const bar = c.createLinearGradient(0, 270, 0, 290);
      bar.addColorStop(0, '#c5d2e2'); bar.addColorStop(1, '#7c8aa3');
      rr(c, 40, 270, 480, 20, 6); c.fillStyle = bar; c.fill(); c.lineWidth = 3; c.strokeStyle = OUT; c.stroke();
      for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(TX[i] - 30, 280, 3, 0, TAU); c.arc(TX[i] + 30, 280, 3, 0, TAU); c.fillStyle = '#56637c'; c.fill(); }
      c.restore();
      paintGlass(c, 34, 112, 492, 236, 14, false);
    });
    const lcdGlass = layer(W, 36, 30, 648, 68, (c) => paintGlass(c, 40, 34, 640, 60, 12));

    function drawLiquid(g, i) {
      const lv = levels[i];
      if (lv <= 0.002) return;
      const x = TX[i], L = liq(i), surf = TB - LIQH * lv;
      g.save(); tubePath(g, x); g.clip();
      g.fillStyle = L.m; g.fillRect(x - HW, surf, HW * 2, TB - surf + 2);
      g.fillStyle = L.d; g.fillRect(x + HW * 0.35, surf, HW, TB - surf + 2);
      g.fillStyle = L.l; g.globalAlpha = 0.55; g.fillRect(x - HW + 3, surf + 4, 5, TB - surf); g.globalAlpha = 1;
      g.beginPath(); g.ellipse(x, surf, HW, 4, 0, 0, TAU); g.fillStyle = L.l; g.fill();
      if (mem.phase === 'ready' && i === mem.anomaly) {
        g.fillStyle = 'rgba(60,10,20,0.55)';
        for (let k = 0; k < 6; k++) {
          const a = time * (1.2 + k * 0.17) + k * 1.9;
          g.beginPath(); g.arc(x + Math.cos(a) * HW * 0.55, surf + 22 + ((k * 23 + time * 9) % (TB - surf - 26)), 2 + (k % 3), 0, TAU); g.fill();
        }
      }
      g.fillStyle = 'rgba(255,255,255,0.7)'; g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 1.2;
      for (let b = 0; b < NB; b++) {
        if (bub[b * 5] !== i) continue;
        const by2 = bub[b * 5 + 2];
        if (by2 < surf + 3) continue;
        g.beginPath(); g.arc(x + bub[b * 5 + 1], by2, bub[b * 5 + 3], 0, TAU); g.stroke();
      }
      g.restore();
      if (mem.phase === 'ready') {
        glow(g, x, surf + 40, 60, L.rgb, i === mem.anomaly ? 0.25 + 0.12 * Math.sin(time * 5) : 0.12);
      }
    }

    const inst = {
      update(dt) {
        time += dt;
        if (press > 0) press = Math.max(0, press - dt * 4);
        if (pickT > 0) pickT = Math.max(0, pickT - dt * 2.5);
        if (readyFlash > 0) readyFlash = Math.max(0, readyFlash - dt);
        if (fillOn) {
          fillT += dt;
          const k = Math.floor(fillT / PER);
          if (k < 5) {
            const u = (fillT - k * PER) / PER;
            const from = k === 0 ? 500 : TX[k - 1];
            carX = lerp(from, TX[k], inOut(u / 0.3));
            for (let j = 0; j < k; j++) levels[j] = FULL;
            levels[k] = u < 0.3 ? 0 : FULL * inOut((u - 0.3) / 0.7);
            if (u >= 0.3 && Math.random() < dt * 30) {
              const q = parts.spawn(PK.DOT, TX[k] + (Math.random() - 0.5) * 8, TB - LIQH * levels[k], (Math.random() - 0.5) * 60, -40 - Math.random() * 50, 0.3, 2, LIQ[mem.liq | 0].l);
              q.gr = 500;
            }
            if (u >= 0.3 && u - dt / PER < 0.3) ctx.sfx('pour');
          } else {
            for (let j = 0; j < 5; j++) levels[j] = FULL;
            carX = lerp(TX[4], 500, inOut((fillT - 5 * PER) / 0.35));
            if (fillT >= FILL_TOTAL) { fillOn = false; carX = 500; }
          }
        }
        if (mem.phase === 'wait' && !fillOn && remaining() <= 0) {
          mem.phase = 'ready'; readyFlash = 1;
          ctx.sfx('beep');
          for (let i = 0; i < 5; i++) parts.ring(TX[i], 250, 34, 0.5, '#aef3ff');
        }
        if (wrongT > 0) {
          wrongT = Math.max(0, wrongT - dt);
          for (let i = 0; i < 5; i++) levels[i] = Math.max(0, levels[i] - dt * 0.9);
          if (wrongT <= 0) { wrongIdx = -1; for (let i = 0; i < 5; i++) levels[i] = 0; }
        }
        for (let b = 0; b < NB; b++) {
          if (levels[bub[b * 5]] < 0.05) continue;
          bub[b * 5 + 2] -= bub[b * 5 + 4] * dt;
          bub[b * 5 + 1] += Math.sin(time * 4 + b) * dt * 6;
          const tb = bub[b * 5];
          if (bub[b * 5 + 2] < TB - LIQH * levels[tb] + 2) respawnBubble(b, false);
        }
        parts.update(dt);
        if (finishIn > 0) { finishIn -= dt; if (finishIn <= 0) finish(); }
      },
      draw(g) {
        bg(g);
        // dispenser carriage + stream
        const k = fillOn ? Math.floor(fillT / PER) : -1;
        const pouring = fillOn && k < 5 && (fillT - k * PER) / PER >= 0.3;
        if (pouring) {
          const surf = TB - LIQH * levels[k];
          g.fillStyle = LIQ[mem.liq | 0].m;
          g.fillRect(carX - 2.5 + Math.sin(time * 40) * 0.6, 154, 5, surf - 154);
          glow(g, carX, surf, 26, LIQ[mem.liq | 0].rgb, 0.5);
        }
        for (let i = 0; i < 5; i++) drawLiquid(g, i);
        g.save(); rr(g, 34, 112, 492, 236, 14); g.clip();
        rr(g, carX - 18, 116, 36, 22, 6); g.fillStyle = '#dfe7f2'; g.fill(); g.lineWidth = 3; g.strokeStyle = OUT; g.stroke();
        g.fillStyle = '#8796ad'; g.fillRect(carX - 4, 138, 8, 12); g.strokeRect(carX - 4, 138, 8, 12);
        g.beginPath(); g.arc(carX + 9, 127, 3, 0, TAU); g.fillStyle = fillOn ? '#46ff9a' : '#3a4558'; g.fill();
        g.restore();
        front(g);
        // tube select buttons
        const ready = mem.phase === 'ready' && !solved && wrongT <= 0;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        for (let i = 0; i < 5; i++) {
          const x = TX[i];
          const isPick = i === pickIdx && pickT > 0;
          const isWrong = i === wrongIdx && wrongT > 0;
          const isRight = solved && i === mem.anomaly;
          const down = isPick ? 3 : 0;
          let col = '#3a455d', led = '#1d2333';
          if (ready) { col = '#3b6fd6'; led = '#7fd8ff'; }
          if (isWrong) { col = Math.sin(time * 26) > 0 ? '#e0344c' : '#8a1d2e'; led = '#ff5a6a'; }
          if (isRight) { col = '#20b35f'; led = '#7dffb0'; }
          rr(g, x - 35, 361 + 4, 70, 38, 10); g.fillStyle = '#10131f'; g.fill();
          rr(g, x - 35, 361 + down, 70, 38, 10); g.fillStyle = col; g.fill(); g.lineWidth = 3; g.strokeStyle = OUT; g.stroke();
          rr(g, x - 31, 364 + down, 62, 10, 5); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fill();
          g.beginPath(); g.arc(x - 18, 380 + down, 5, 0, TAU); g.fillStyle = led; g.fill(); g.lineWidth = 2; g.stroke();
          if (ready || isRight || isWrong) glow(g, x - 18, 380 + down, 16, isWrong ? '255,90,106' : isRight ? '125,255,176' : '127,216,255', 0.7);
          g.font = F(20); g.fillStyle = ready || isRight || isWrong ? '#ffffff' : '#8e9ab3'; g.fillText(NUM[i + 1], x + 8, 381 + down);
        }
        // START button
        const canStart = mem.phase === 'idle' && !fillOn && wrongT <= 0 && !solved;
        const pr = press > 0 ? 4 * Math.sin(press * Math.PI) : 0;
        if (canStart) glow(g, SBX, SBY, 92, '70,255,154', 0.35 + 0.2 * Math.sin(time * 4));
        g.beginPath(); g.arc(SBX, SBY + 5, SBR, 0, TAU); g.fillStyle = canStart ? '#0d6b38' : '#3b4252'; g.fill();
        g.beginPath(); g.arc(SBX, SBY + pr, SBR, 0, TAU); g.fillStyle = canStart ? '#2bd36f' : '#6d7687'; g.fill(); g.lineWidth = 3.5; g.strokeStyle = OUT; g.stroke();
        g.beginPath(); g.ellipse(SBX - 10, SBY - 18 + pr, 22, 12, -0.4, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fill();
        g.lineWidth = 6; g.strokeStyle = canStart ? '#ffffff' : '#a7afbd'; g.lineCap = 'round';
        g.beginPath(); g.moveTo(SBX - 9, SBY - 14 + pr); g.lineTo(SBX + 15, SBY + pr); g.lineTo(SBX - 9, SBY + 14 + pr); g.closePath(); g.fillStyle = g.strokeStyle; g.fill();
        g.lineWidth = 2.5; g.strokeStyle = OUT; g.stroke();
        if (mem.phase === 'wait') {
          const frac = 1 - Math.min(1, remaining() / SAMPLE_WAIT);
          g.beginPath(); g.arc(SBX, SBY, SBR + 19, 0, TAU); g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.45)'; g.stroke();
          g.beginPath(); g.arc(SBX, SBY, SBR + 19, -Math.PI / 2, -Math.PI / 2 + TAU * frac); g.lineWidth = 6; g.strokeStyle = '#ffc23f'; g.stroke();
        }
        g.font = F(18); g.fillStyle = canStart ? '#7dffb0' : '#6c7894'; g.textAlign = 'center';
        g.fillText(UP('game.sample.start'), SBX, 296, 104);
        for (let i = 0; i < 3; i++) {
          const on = i === 0 || (i === 1 && (fillOn || mem.phase === 'wait')) || (i === 2 && (mem.phase === 'ready' || wrongT > 0));
          const colr = i === 0 ? '#46ff9a' : i === 1 ? '#ffc23f' : '#ff5a6a';
          g.beginPath(); g.arc(585 + i * 28, 330, 6, 0, TAU); g.fillStyle = on ? colr : '#2a3044'; g.fill(); g.lineWidth = 2; g.strokeStyle = OUT; g.stroke();
          if (on) glow(g, 585 + i * 28, 330, 18, i === 0 ? '70,255,154' : i === 1 ? '255,194,63' : '255,90,106', i === 1 ? 0.5 + 0.4 * Math.sin(time * 6) : 0.7);
        }
        // LCD
        let msg, col = '#7dffcf';
        if (solved) { msg = AS.t('game.sample.found'); col = '#7dffb0'; }
        else if (wrongT > 0) { msg = AS.t('game.sample.wrong'); col = '#ff6b7a'; }
        else if (fillOn) msg = AS.t('game.sample.filling');
        else if (mem.phase === 'wait') msg = AS.t('game.sample.waiting');
        else if (mem.phase === 'ready') msg = AS.t('game.sample.ready');
        else msg = AS.t('game.sample.idle');
        g.font = F(24); g.textAlign = 'left'; g.textBaseline = 'middle';
        const blinkA = mem.phase === 'idle' && !fillOn && wrongT <= 0 ? 0.8 + 0.2 * Math.sin(time * 4) : mem.phase === 'ready' && !solved ? 0.75 + 0.25 * Math.sin(time * 6) : 1;
        g.globalAlpha = blinkA;
        glowText(g, msg, 62, 65, col, 10);
        g.globalAlpha = 1;
        const sec = mem.phase === 'wait' ? Math.ceil(Math.min(SAMPLE_WAIT, remaining())) : mem.phase === 'ready' || solved ? 0 : SAMPLE_WAIT;
        if (sec !== lastSec) { lastSec = sec; timeText = U.formatTime(sec); }
        g.font = F(34);
        const tc = mem.phase === 'wait' ? '#ffd27a' : mem.phase === 'ready' || solved ? '#7dffb0' : 'rgba(125,255,207,0.45)';
        g.shadowColor = tc; g.shadowBlur = mem.phase === 'idle' ? 0 : 10; g.fillStyle = tc;
        monoText(g, timeText, 658, 65, 20, 1);
        g.shadowBlur = 0; g.shadowColor = 'rgba(0,0,0,0)';
        if (readyFlash > 0) { g.globalAlpha = readyFlash * 0.4; rr(g, 40, 34, 640, 60, 12); g.fillStyle = '#7dffcf'; g.fill(); g.globalAlpha = 1; }
        lcdGlass(g);
        parts.draw(g);
        const hk = mem.phase === 'wait' || fillOn ? 'game.sample.hintWait' : mem.phase === 'ready' || solved ? 'game.sample.hintPick' : 'game.sample.hint';
        hint(g, AS.t(hk), mem.phase === 'ready' && !solved ? '#ffd27a' : null);
      },
      pointerDown(x, y, id) {
        if (solved) return;
        if (Math.hypot(x - SBX, y - SBY) <= SBR + 14) { start(); return; }
        if (mem.phase !== 'ready') return;
        for (let i = 0; i < 5; i++) {
          if (Math.abs(x - TX[i]) <= 40 && ((y >= TT - 12 && y <= TB + 8) || (y >= 356 && y <= 406))) { pick(i); return; }
        }
      },
      pointerMove() {},
      pointerUp() {},
      keyDown(key) {
        if (key === 'Enter' || key === ' ') start();
        else if (key >= '1' && key <= '5' && key.length === 1) pick(key.charCodeAt(0) - 49);
      },
      destroy() { if (solved) finish(); if (DBG.live === inst) DBG.live = null; },
      __test: {
        skip: () => { if (mem.phase === 'wait') { mem.start = ctx.now() - SAMPLE_WAIT - 0.05; fillOn = false; for (let i = 0; i < 5; i++) levels[i] = FULL; } return mem.phase; },
        phase: () => mem.phase,
        anomaly: () => mem.anomaly,
        tube: (i) => [TX[i], 250],
        startBtn: () => [SBX, SBY],
      },
    };
    DBG.live = inst;
    return inst;
  }

  AS.Tasks.register('chart', chartGame, { w: 720, h: 460 });
  AS.Tasks.register('steer', steerGame, { w: 600, h: 560 });
  AS.Tasks.register('plants', plantsGame, { w: 720, h: 480 });
  AS.Tasks.register('sample', sampleGame, { w: 720, h: 480 });
})(globalThis.AS = globalThis.AS || {});
