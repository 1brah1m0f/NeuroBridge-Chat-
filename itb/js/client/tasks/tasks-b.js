/* AI IMPOSTOR: SPACE SHIP — mini-games B (owner: tasks-b): shields, simon, manifold, asteroids, divert, divert_accept, garbage, scan,
 * plus download, upload, fuel, calibrate, leaves, align (compact versions). Mouse + touch via pointer events. */
(function (AS) {
  'use strict';
  if (AS.isNode || !AS.Tasks) return;
  const OUT = '#10131f';
  AS.i18n.add({
    az: {
      'game.shields.title': 'Qalxanları aktivləşdir', 'game.simon.title': 'Reaktoru işə sal', 'game.manifold.title': 'Kollektoru aç',
      'game.asteroids.title': 'Asteroidləri vur', 'game.divert.title': 'Enerjini yönləndir', 'game.divert_accept.title': 'Enerjini qəbul et',
      'game.garbage.title': 'Zibili boşalt', 'game.scan.title': 'Tibbi skan', 'game.download.title': 'Məlumatı yüklə', 'game.upload.title': 'Məlumatı göndər',
      'game.fuel.title': 'Yanacaq', 'game.calibrate.title': 'Kalibrləmə', 'game.leaves.title': 'Filtri təmizlə', 'game.align.title': 'Mühərriki tənzimlə',
      'tb.download': 'Yüklə', 'tb.upload': 'Göndər', 'tb.hold': 'Basıb saxla', 'tb.pull': 'Qolu aşağı çək', 'tb.hits': 'Vuruldu: {n}/{m}',
      'tb.watch': 'Diqqətlə bax…', 'tb.repeat': 'Təkrarla!', 'tb.scanning': 'Skan edilir… {n}%', 'tb.lock': 'Kilidlə', 'tb.drag': 'Yarpaqları kanala at',
      'tb.slide': 'Sürgünü yaşıl zonaya çək', 'tb.flip': 'Açarı çevir', 'tb.time': 'Qalan vaxt: {n} san',
    },
    en: {
      'game.shields.title': 'Prime Shields', 'game.simon.title': 'Start Reactor', 'game.manifold.title': 'Unlock Manifolds',
      'game.asteroids.title': 'Clear Asteroids', 'game.divert.title': 'Divert Power', 'game.divert_accept.title': 'Accept Diverted Power',
      'game.garbage.title': 'Empty Garbage', 'game.scan.title': 'Submit Scan', 'game.download.title': 'Download Data', 'game.upload.title': 'Upload Data',
      'game.fuel.title': 'Fuel', 'game.calibrate.title': 'Calibrate', 'game.leaves.title': 'Clean O2 Filter', 'game.align.title': 'Align Engine Output',
      'tb.download': 'Download', 'tb.upload': 'Upload', 'tb.hold': 'Press & hold', 'tb.pull': 'Pull the lever down', 'tb.hits': 'Hits: {n}/{m}',
      'tb.watch': 'Watch carefully…', 'tb.repeat': 'Repeat!', 'tb.scanning': 'Scanning… {n}%', 'tb.lock': 'Lock', 'tb.drag': 'Drag the leaves into the vent',
      'tb.slide': 'Slide into the green zone', 'tb.flip': 'Flip the switch', 'tb.time': 'Time left: {n}s',
    },
  });
  const FONT = (s) => '700 ' + s + 'px Fredoka, Nunito, "Segoe UI", sans-serif';
  function rr(g, x, y, w, h, r) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); }
  function fill(g, c, lw) { g.fillStyle = c; g.fill(); if (lw) { g.lineWidth = lw; g.strokeStyle = OUT; g.stroke(); } }
  function bg(g, W, H, c1, c2) { const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, c1 || '#2b3350'); gr.addColorStop(1, c2 || '#171c2e'); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
  function text(g, s, x, y, size, color, align) { g.font = FONT(size || 22); g.textAlign = align || 'center'; g.textBaseline = 'middle'; g.lineWidth = 4; g.strokeStyle = OUT; g.strokeText(s, x, y); g.fillStyle = color || '#fff'; g.fillText(s, x, y); }
  function button(g, x, y, w, h, label, c, pressed) { rr(g, x, y + (pressed ? 4 : 0), w, h - 4, 14); fill(g, '#0b0f1c'); rr(g, x, y + (pressed ? 4 : 0), w, h - 8, 14); fill(g, c || '#2ecc71', 3); text(g, label, x + w / 2, y + h / 2 - 4 + (pressed ? 4 : 0), 24); }
  const inR = (x, y, r) => x >= r[0] && y >= r[1] && x <= r[0] + r[2] && y <= r[1] + r[3];
  function bar(g, x, y, w, h, k, c) { rr(g, x, y, w, h, h / 2); fill(g, '#0b0f1c', 3); if (k > 0) { rr(g, x + 3, y + 3, Math.max(h - 6, (w - 6) * Math.min(1, k)), h - 6, (h - 6) / 2); fill(g, c || '#3ef0e8'); } }
  function fin(ctx) { let done = false, tm = 0; return { get done() { return done; }, go() { if (!done) { done = true; tm = 0.5; ctx.sfx('task_complete'); } }, update(dt) { if (done && tm > 0) { tm -= dt; if (tm <= 0) ctx.complete(); } } }; }
  const reg = (id, w, h, f) => AS.Tasks.register(id, f, { w, h });

  // ---------------------------------------------------------------- shields
  reg('shields', 520, 520, (ctx) => {
    const F = fin(ctx), W = ctx.w, cells = [];
    const cx = W / 2, cy = 270;
    cells.push([cx, cy]);
    for (let i = 0; i < 6; i++) cells.push([cx + Math.cos(i * Math.PI / 3 + Math.PI / 6) * 128, cy + Math.sin(i * Math.PI / 3 + Math.PI / 6) * 128]);
    const red = cells.map(() => ctx.rng() < 0.6);
    if (!red.some(Boolean)) red[0] = true;
    let t = 0;
    const hex = (g, x, y, r) => { g.beginPath(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + Math.PI / 6; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.closePath(); };
    return {
      update(dt) { t += dt; F.update(dt); },
      draw(g) {
        bg(g, W, ctx.h, '#1d2b4a', '#0d1426');
        cells.forEach(([x, y], i) => { hex(g, x, y, 66); fill(g, red[i] ? '#e8343b' : F.done ? '#bffcff' : '#e3ecf5', 4); });
        text(g, ctx.t('game.shields.title'), W / 2, 40, 26);
      },
      pointerDown(x, y) { cells.forEach(([cx2, cy2], i) => { if (Math.hypot(x - cx2, y - cy2) < 60 && red[i] && !F.done) { red[i] = false; ctx.sfx('switch'); if (!red.some(Boolean)) F.go(); } }); },
      pointerMove() {}, pointerUp() {},
    };
  });

  // ---------------------------------------------------------------- simon (start reactor)
  reg('simon', 640, 440, (ctx) => {
    const F = fin(ctx), W = ctx.w, seq = [];
    for (let i = 0; i < 5; i++) seq.push(Math.floor(ctx.rng() * 9));
    let round = 1, mode = 'show', idx = 0, timer = 1, lit = -1, litT = 0, flash = 0;
    const cell = (i, ox) => [ox + (i % 3) * 92, 110 + Math.floor(i / 3) * 92, 80, 80];
    return {
      update(dt) {
        F.update(dt); litT -= dt; if (litT <= 0) lit = -1; flash = Math.max(0, flash - dt);
        if (mode === 'show') { timer -= dt; if (timer <= 0) { if (idx < round) { lit = seq[idx++]; litT = 0.45; timer = 0.65; ctx.sfx('beep'); } else { mode = 'input'; idx = 0; } } }
      },
      draw(g) {
        bg(g, W, ctx.h, '#2b3046', '#151827');
        text(g, ctx.t(mode === 'show' ? 'tb.watch' : 'tb.repeat'), W / 2, 50, 24, mode === 'show' ? '#ffd23f' : '#8ff04a');
        for (let i = 0; i < 9; i++) {
          const a = cell(i, 30), b = cell(i, 350);
          rr(g, a[0], a[1], a[2], a[3], 10); fill(g, lit === i && mode === 'show' ? '#3ef0e8' : '#0b1426', 3);
          rr(g, b[0], b[1], b[2], b[3], 10); fill(g, lit === i && mode === 'input' ? '#3ef0e8' : flash > 0 ? '#e8343b' : '#4b5470', 3);
        }
        for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(W / 2 - 80 + i * 40, 400, 10, 0, 7); fill(g, i < round - (mode === 'show' ? 1 : 1) || F.done ? '#8ff04a' : '#2a3040', 2); }
      },
      pointerDown(x, y) {
        if (mode !== 'input' || F.done) return;
        for (let i = 0; i < 9; i++) if (inR(x, y, cell(i, 350))) {
          lit = i; litT = 0.25; ctx.sfx('beep');
          if (seq[idx] === i) { idx++; if (idx >= round) { if (round >= 5) F.go(); else { round++; mode = 'show'; idx = 0; timer = 0.9; } } }
          else { ctx.sfx('task_fail'); flash = 0.5; mode = 'show'; idx = 0; timer = 1.2; }
        }
      },
      pointerMove() {}, pointerUp() {},
    };
  });

  // ---------------------------------------------------------------- manifold
  reg('manifold', 620, 340, (ctx) => {
    const F = fin(ctx), W = ctx.w, nums = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    for (let i = nums.length - 1; i > 0; i--) { const j = Math.floor(ctx.rng() * (i + 1)); [nums[i], nums[j]] = [nums[j], nums[i]]; }
    let next = 1, err = 0;
    const r = (i) => [40 + (i % 5) * 110, 100 + Math.floor(i / 5) * 110, 96, 96];
    return {
      update(dt) { F.update(dt); err = Math.max(0, err - dt); },
      draw(g) {
        bg(g, W, ctx.h, '#2f3a5a', '#161c30');
        text(g, ctx.t('game.manifold.title'), W / 2, 50, 24);
        nums.forEach((n, i) => { const q = r(i); rr(g, q[0], q[1], q[2], q[3], 12); fill(g, err ? '#e8343b' : n < next ? '#2e9df2' : '#d8dfec', 3); text(g, String(n), q[0] + 48, q[1] + 48, 34, n < next ? '#fff' : '#1b2238'); });
      },
      pointerDown(x, y) {
        if (F.done) return;
        nums.forEach((n, i) => { if (inR(x, y, r(i))) { if (n === next) { next++; ctx.sfx('keypad'); if (next > 10) F.go(); } else if (n >= next) { next = 1; err = 0.4; ctx.sfx('task_fail'); } } });
      },
      pointerMove() {}, pointerUp() {},
    };
  });

  // ---------------------------------------------------------------- asteroids
  reg('asteroids', 560, 560, (ctx) => {
    const F = fin(ctx), W = ctx.w, H = ctx.h, NEED = 15;
    const mem = ctx.memory; mem.hits = mem.hits || 0;
    const rocks = [], booms = [];
    let spawn = 0, aim = [W / 2, H / 2];
    return {
      update(dt) {
        F.update(dt);
        spawn -= dt;
        if (spawn <= 0 && rocks.length < 6) { spawn = 0.5 + ctx.rng() * 0.6; rocks.push({ x: W + 40, y: 60 + ctx.rng() * (H - 120), vx: -(90 + ctx.rng() * 120), vy: (ctx.rng() - 0.5) * 60, r: 22 + ctx.rng() * 18, a: 0 }); }
        for (const k of rocks) { k.x += k.vx * dt; k.y += k.vy * dt; k.a += dt; }
        for (let i = rocks.length - 1; i >= 0; i--) if (rocks[i].x < -60) rocks.splice(i, 1);
        for (const b of booms) b.t -= dt;
        while (booms.length && booms[0].t <= 0) booms.shift();
      },
      draw(g) {
        g.fillStyle = '#050816'; g.fillRect(0, 0, W, H);
        g.fillStyle = '#fff'; for (let i = 0; i < 40; i++) g.fillRect((i * 97) % W, (i * 61) % H, 2, 2);
        for (const k of rocks) { g.save(); g.translate(k.x, k.y); g.rotate(k.a); g.beginPath(); for (let i = 0; i < 8; i++) { const rr2 = k.r * (0.8 + ((i * 7) % 3) * 0.12); g.lineTo(Math.cos(i * 0.785) * rr2, Math.sin(i * 0.785) * rr2); } g.closePath(); fill(g, '#8a7a6a', 3); g.restore(); }
        for (const b of booms) { g.beginPath(); g.arc(b.x, b.y, 30 * (1 - b.t / 0.3) + 5, 0, 7); g.fillStyle = 'rgba(255,190,80,' + b.t * 3 + ')'; g.fill(); }
        g.strokeStyle = '#8ff04a'; g.lineWidth = 2; g.beginPath(); g.arc(aim[0], aim[1], 18, 0, 7); g.moveTo(aim[0] - 26, aim[1]); g.lineTo(aim[0] + 26, aim[1]); g.moveTo(aim[0], aim[1] - 26); g.lineTo(aim[0], aim[1] + 26); g.stroke();
        text(g, ctx.t('tb.hits', { n: Math.min(NEED, mem.hits), m: NEED }), W / 2, H - 28, 22, '#8ff04a');
      },
      pointerDown(x, y) {
        aim = [x, y]; ctx.sfx('shoot');
        for (let i = rocks.length - 1; i >= 0; i--) { const k = rocks[i]; if (Math.hypot(x - k.x, y - k.y) < k.r + 10) { rocks.splice(i, 1); booms.push({ x: k.x, y: k.y, t: 0.3 }); ctx.sfx('explode'); mem.hits++; if (mem.hits >= NEED) F.go(); break; } }
      },
      pointerMove(x, y) { aim = [x, y]; }, pointerUp() {},
    };
  });

  // ---------------------------------------------------------------- divert (8 sliders, one is live)
  reg('divert', 640, 420, (ctx) => {
    const F = fin(ctx), W = ctx.w, target = Math.floor(ctx.rng() * 8);
    let v = 0, drag = false;
    const sx = (i) => 60 + i * 74, TOP = 120, BOT = 350;
    return {
      update(dt) { F.update(dt); },
      draw(g) {
        bg(g, W, ctx.h, '#3a3a2a', '#1b1b12');
        text(g, ctx.t('game.divert.title'), W / 2, 40, 24, '#ffd23f');
        for (let i = 0; i < 8; i++) {
          rr(g, sx(i) - 6, TOP, 12, BOT - TOP, 6); fill(g, i === target ? '#ffd23f' : '#4b4b3a', 2);
          const y = i === target ? BOT - v * (BOT - TOP) : BOT;
          rr(g, sx(i) - 22, y - 12, 44, 24, 6); fill(g, i === target ? '#e3ecf5' : '#8e8e7a', 3);
          if (i === target) { g.save(); g.shadowColor = '#ffd23f'; g.shadowBlur = 15; g.beginPath(); g.arc(sx(i), 90, 9, 0, 7); g.fillStyle = '#ffd23f'; g.fill(); g.restore(); }
        }
      },
      pointerDown(x, y) { if (Math.abs(x - sx(target)) < 34 && y > TOP - 30 && y < BOT + 30) drag = true; },
      pointerMove(x, y) { if (!drag || F.done) return; v = Math.max(0, Math.min(1, (BOT - y) / (BOT - TOP))); if (v > 0.97) { v = 1; drag = false; F.go(); } },
      pointerUp() { drag = false; if (!F.done) v = 0; },
    };
  });

  // ---------------------------------------------------------------- divert_accept / simple switch
  reg('divert_accept', 420, 420, (ctx) => {
    const F = fin(ctx), W = ctx.w;
    let on = 0;
    return {
      update(dt) { F.update(dt); if (F.done) on = Math.min(1, on + dt * 5); },
      draw(g) {
        bg(g, W, ctx.h, '#3a3a2a', '#1b1b12');
        text(g, ctx.t('tb.flip'), W / 2, 50, 24, '#ffd23f');
        rr(g, W / 2 - 60, 110, 120, 220, 20); fill(g, '#2a2a1e', 4);
        g.save(); g.translate(W / 2, 220); g.rotate(-0.6 + on * 1.2); rr(g, -12, -100, 24, 100, 10); fill(g, '#9aa3bb', 3); g.beginPath(); g.arc(0, -100, 22, 0, 7); fill(g, on > 0.5 ? '#8ff04a' : '#e8343b', 3); g.restore();
      },
      pointerDown() { if (!F.done) { ctx.sfx('switch'); F.go(); } }, pointerMove() {}, pointerUp() {},
    };
  });

  // ---------------------------------------------------------------- hold-to-progress games (garbage, fuel, download, upload, scan)
  function progressGame(id, o) {
    reg(id, 560, 440, (ctx) => {
      const F = fin(ctx), W = ctx.w, H = ctx.h, mem = ctx.memory;
      let p = o.keep ? mem.p || 0 : 0, holding = false, started = !!o.auto, t = 0;
      if (o.onStart && started) o.onStart(ctx);
      const btn = [W / 2 - 110, H - 120, 220, 76];
      return {
        update(dt) {
          t += dt; F.update(dt);
          if (F.done) return;
          if ((o.hold ? holding : started)) { p += dt / o.time; if (o.keep) mem.p = p; if (o.loop) ctx.loop && ctx.loop(o.loop); }
          else if (o.loop && ctx.stopLoop) ctx.stopLoop(o.loop);
          if (p >= 1) { p = 1; if (o.loop && ctx.stopLoop) ctx.stopLoop(o.loop); if (o.keep) mem.p = 0; F.go(); }
        },
        draw(g) {
          bg(g, W, H, o.c1, o.c2);
          text(g, ctx.t(o.title(ctx)), W / 2, 40, 26);
          o.art(g, W, H, p, t, holding || started);
          bar(g, 60, H - 170, W - 120, 30, p, o.bar);
          if (o.scan) text(g, ctx.t('tb.scanning', { n: Math.floor(p * 100) }), W / 2, H - 80, 24, '#8ff04a');
          else button(g, btn[0], btn[1], btn[2], btn[3], ctx.t(o.label(ctx)), o.btn, holding);
        },
        pointerDown(x, y) { if (o.scan || F.done) return; if (inR(x, y, btn) || o.anywhere) { holding = true; if (!started) { started = true; ctx.sfx('beep'); } } },
        pointerMove() {}, pointerUp() { holding = false; },
        destroy() { if (o.loop && ctx.stopLoop) ctx.stopLoop(o.loop); if (o.onDestroy) o.onDestroy(ctx, F.done); },
      };
    });
  }
  const dataArt = (up) => (g, W, H, p, t, on) => {
    for (const [x, ic] of [[110, up ? '📁' : '🖥️'], [W - 110, up ? '🖥️' : '📁']]) { rr(g, x - 50, 90, 100, 90, 14); fill(g, '#3d4660', 3); g.font = '44px sans-serif'; g.textAlign = 'center'; g.fillText(ic, x, 150); }
    if (on && p < 1) for (let i = 0; i < 4; i++) { const k = ((t * 0.8 + i / 4) % 1); g.font = '22px sans-serif'; g.fillText('📄', 170 + k * (W - 340), 130 - Math.sin(k * Math.PI) * 30); }
  };
  progressGame('download', { time: 7, keep: false, title: () => 'game.download.title', label: () => 'tb.download', art: dataArt(false), bar: '#3ef0e8', btn: '#2e9df2' });
  progressGame('upload', { time: 7, keep: false, title: () => 'game.upload.title', label: () => 'tb.upload', art: dataArt(true), bar: '#8ff04a', btn: '#2ecc71' });
  progressGame('fuel', { time: 3, hold: true, keep: true, loop: 'fuel_loop', title: () => 'game.fuel.title', label: () => 'tb.hold', bar: '#ffd23f', btn: '#f7871e',
    art: (g, W, H, p) => { rr(g, W / 2 - 70, 80, 140, 160, 16); fill(g, '#5a6178', 3); rr(g, W / 2 - 58, 92 + 136 * (1 - p), 116, 136 * p, 10); fill(g, '#ffd23f'); } });
  progressGame('garbage', { time: 2.5, hold: true, keep: true, anywhere: true, title: () => 'game.garbage.title', label: () => 'tb.pull', bar: '#a8864d', btn: '#7a8299',
    art: (g, W, H, p, t, on) => { rr(g, W / 2 - 90, 70, 180, 170, 14); fill(g, '#3a4054', 3); g.fillStyle = '#8a6a3a'; for (let i = 0; i < 10 * (1 - p); i++) { g.beginPath(); g.arc(W / 2 - 60 + (i * 37) % 120, 220 - Math.floor(i / 4) * 30 - (on ? (t * 300) % 20 : 0), 14, 0, 7); g.fill(); } } });
  progressGame('scan', { time: AS.T.SCAN_TIME, auto: true, scan: true, title: () => 'game.scan.title', label: () => 'tb.hold', bar: '#8ff04a', c1: '#18324a', c2: '#0b1726',
    onStart: (ctx) => ctx.send({ type: 'taskStart', task: ctx.info.taskId }),
    onDestroy: (ctx, done) => { if (!done) ctx.send({ type: 'taskCancel', task: ctx.info.taskId }); },
    art: (g, W, H, p, t) => { if (AS.Art) AS.Art.drawCharacter(g, W / 2, 230, { color: (AS.App && AS.App.profile && AS.App.profile.color) || 'red', scale: 2, t }); const y = 80 + (Math.sin(t * 3) * 0.5 + 0.5) * 150; g.fillStyle = 'rgba(62,240,140,.5)'; g.fillRect(W / 2 - 90, y, 180, 6); } });

  // ---------------------------------------------------------------- calibrate (3 spinning dials, lock in the green)
  reg('calibrate', 560, 460, (ctx) => {
    const F = fin(ctx), W = ctx.w;
    const dials = [0, 1, 2].map((i) => ({ a: ctx.rng() * 6, sp: 2.2 + i * 0.9, locked: false }));
    let cur = 0, err = 0;
    const btn = [W - 170, 0, 130, 70];
    return {
      update(dt) { F.update(dt); err = Math.max(0, err - dt); dials.forEach((d, i) => { if (!d.locked && i >= cur) d.a += d.sp * dt; }); },
      draw(g) {
        bg(g, W, ctx.h, '#2b3046', '#151827');
        text(g, ctx.t('game.calibrate.title'), W / 2, 36, 24);
        dials.forEach((d, i) => {
          const y = 120 + i * 120, x = 140;
          g.beginPath(); g.arc(x, y, 46, 0, 7); fill(g, '#0d1426', 3);
          g.beginPath(); g.moveTo(x, y); g.arc(x, y, 44, -0.35 - Math.PI / 2, 0.35 - Math.PI / 2); g.closePath(); g.fillStyle = 'rgba(143,240,74,.45)'; g.fill();
          g.strokeStyle = d.locked ? '#8ff04a' : '#ffd23f'; g.lineWidth = 5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(d.a) * 40, y + Math.sin(d.a) * 40); g.stroke();
          btn[1] = y - 35;
          if (i === cur && !F.done) button(g, btn[0], btn[1], btn[2], btn[3], ctx.t('tb.lock'), err ? '#e8343b' : '#2e9df2');
          else { rr(g, btn[0], y - 35, btn[2], 62, 14); fill(g, d.locked ? '#2ecc71' : '#2a3040', 3); }
        });
      },
      pointerDown(x, y) {
        if (F.done) return;
        const by = 120 + cur * 120 - 35;
        if (!inR(x, y, [btn[0], by, btn[2], btn[3]])) return;
        const d = dials[cur];
        let a = (d.a + Math.PI / 2) % (Math.PI * 2); if (a > Math.PI) a -= Math.PI * 2;
        if (Math.abs(a) < 0.38) { d.locked = true; cur++; ctx.sfx('beep'); if (cur >= 3) F.go(); }
        else { err = 0.4; ctx.sfx('task_fail'); if (cur > 0) { cur = 0; dials.forEach((q) => (q.locked = false)); } }
      },
      pointerMove() {}, pointerUp() {},
    };
  });

  // ---------------------------------------------------------------- leaves (drag into the vent at the left)
  reg('leaves', 600, 460, (ctx) => {
    const F = fin(ctx), W = ctx.w, H = ctx.h;
    const leaves = []; for (let i = 0; i < 7; i++) leaves.push({ x: 260 + ctx.rng() * 300, y: 90 + ctx.rng() * 300, a: ctx.rng() * 6, vx: 0, vy: 0 });
    let drag = null, t = 0;
    return {
      update(dt) {
        t += dt; F.update(dt);
        for (const l of leaves) if (l !== drag) { l.x += Math.sin(t * 1.3 + l.a) * 12 * dt + 6 * dt; l.y += Math.cos(t + l.a) * 10 * dt; l.x = Math.min(W - 30, Math.max(150, l.x)); l.y = Math.min(H - 30, Math.max(70, l.y)); }
      },
      draw(g) {
        bg(g, W, H, '#244a5a', '#10242c');
        rr(g, 14, 120, 90, 220, 12); fill(g, '#0b1014', 4);
        g.strokeStyle = '#3a4054'; g.lineWidth = 4; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(20, 140 + i * 34); g.lineTo(98, 140 + i * 34); g.stroke(); }
        text(g, ctx.t('tb.drag'), W / 2 + 40, 36, 22);
        for (const l of leaves) { g.save(); g.translate(l.x, l.y); g.rotate(l.a + Math.sin(t * 2 + l.a) * 0.3); g.beginPath(); g.ellipse(0, 0, 26, 12, 0, 0, 7); fill(g, '#5fd35f', 3); g.strokeStyle = '#2f7a2f'; g.lineWidth = 2; g.beginPath(); g.moveTo(-22, 0); g.lineTo(22, 0); g.stroke(); g.restore(); }
      },
      pointerDown(x, y) { drag = leaves.find((l) => Math.hypot(l.x - x, l.y - y) < 34) || null; },
      pointerMove(x, y) { if (drag) { drag.x = x; drag.y = y; } },
      pointerUp() {
        if (drag && drag.x < 120 && drag.y > 110 && drag.y < 350) { leaves.splice(leaves.indexOf(drag), 1); ctx.sfx('whoosh'); if (!leaves.length) F.go(); }
        drag = null;
      },
    };
  });

  // ---------------------------------------------------------------- align (drag the needle to the center line)
  reg('align', 520, 460, (ctx) => {
    const F = fin(ctx), W = ctx.w, H = ctx.h, mid = 230;
    let y = ctx.rng() < 0.5 ? 100 : 360, drag = false;
    return {
      update(dt) { F.update(dt); },
      draw(g) {
        bg(g, W, H, '#33384e', '#171a28');
        text(g, ctx.t('tb.slide'), W / 2, 36, 22);
        rr(g, 80, 70, 260, 320, 20); fill(g, '#0d1426', 3);
        g.fillStyle = 'rgba(143,240,74,.35)'; g.fillRect(84, mid - 18, 252, 36);
        g.strokeStyle = '#ffd23f'; g.lineWidth = 5; g.beginPath(); g.moveTo(110, 230); g.lineTo(320, y); g.stroke();
        rr(g, 380, 70, 50, 320, 25); fill(g, '#2a3040', 3);
        rr(g, 370, y - 22, 70, 44, 12); fill(g, F.done ? '#8ff04a' : '#e3ecf5', 3);
      },
      pointerDown(x, yy) { if (Math.abs(x - 405) < 50 && Math.abs(yy - y) < 40) drag = true; },
      pointerMove(x, yy) { if (drag && !F.done) y = Math.max(90, Math.min(370, yy)); },
      pointerUp() { if (drag && Math.abs(y - mid) < 16) { y = mid; F.go(); } drag = false; },
    };
  });
})(globalThis.AS = globalThis.AS || {});
