/* AI IMPOSTOR: SPACE SHIP — sabotage repair panels (owner: tasks-c)
 *   fix_lights  — electrical box: flip all 5 lever switches up (ON) -> complete.
 *   fix_comms   — radio: rotate the dial until the live waveform matches the target, hold ~1 s -> complete.
 *   fix_o2      — keypad: type the 5-digit code from the sticky note and press ✓ (keyboard digits,
 *                 Backspace, Enter also work); wrong -> cleared + error; correct -> complete.
 *   fix_reactor — handprint scanner: press & hold -> ctx.hold(true); release / leave the pad -> ctx.hold(false).
 *                 Shows the other reactor panel's held state from ctx.getState().sabotage.panels.
 *                 NEVER completes itself: the host auto-closes the panel when the reactor sabotage ends.
 * All are opened with info.panelId + info.sabotage. Test/debug: AS.SabotageC.live = open instance (.__test).
 */
(function (AS) {
  'use strict';
  if (typeof document === 'undefined' || !AS.i18n) return;

  AS.i18n.add({
    az: {
      'game.fix_lights.title': 'İşıqları bərpa et',
      'game.fix_lights.hint': 'Bütün açarları yuxarı qaldır',
      'game.fix_comms.title': 'Rabitəni bərpa et',
      'game.fix_comms.hint': 'Dalğalar üst-üstə düşənə qədər düyməni fırlat',
      'game.fix_comms.nosignal': 'Siqnal yoxdur',
      'game.fix_comms.tuning': 'Köklənir...',
      'game.fix_comms.locked': 'Siqnal tutuldu',
      'game.fix_o2.title': 'Oksigeni bərpa et',
      'game.fix_o2.hint': 'Qeyddəki kodu yığ və ✓ düyməsini bas',
      'game.fix_o2.note': 'Bugünkü kod:',
      'game.fix_o2.wrong': 'Səhv kod',
      'game.fix_o2.ok': 'Qəbul edildi',
      'game.fix_reactor.title': 'Reaktoru sabitləşdir',
      'game.fix_reactor.idle': 'Əlini skanerə qoy və saxla',
      'game.fix_reactor.waiting': 'İkinci istifadəçi gözlənilir...',
      'game.fix_reactor.hold': 'Saxla!',
      'game.fix_reactor.hint': 'İki nəfər hər iki skaneri eyni anda saxlamalıdır',
      'game.fix_reactor.you': 'Sən',
      'game.fix_reactor.other': 'Digər panel',
      'game.fix_reactor.meltdown': 'Ərimə',
    },
    en: {
      'game.fix_lights.title': 'Fix Lights',
      'game.fix_lights.hint': 'Flip all the switches up',
      'game.fix_comms.title': 'Fix Communications',
      'game.fix_comms.hint': 'Turn the dial until the waves match',
      'game.fix_comms.nosignal': 'No signal',
      'game.fix_comms.tuning': 'Tuning...',
      'game.fix_comms.locked': 'Signal locked',
      'game.fix_o2.title': 'Restore Oxygen',
      'game.fix_o2.hint': 'Enter the code from the note and press ✓',
      'game.fix_o2.note': "Today's code:",
      'game.fix_o2.wrong': 'Wrong code',
      'game.fix_o2.ok': 'Accepted',
      'game.fix_reactor.title': 'Stop Reactor Meltdown',
      'game.fix_reactor.idle': 'Hold to stop the meltdown',
      'game.fix_reactor.waiting': 'Waiting for second user...',
      'game.fix_reactor.hold': 'Hold!',
      'game.fix_reactor.hint': 'Two crewmates must hold both scanners at once',
      'game.fix_reactor.you': 'You',
      'game.fix_reactor.other': 'Other panel',
      'game.fix_reactor.meltdown': 'Meltdown',
    },
  });

  if (!AS.Tasks || !AS.Tasks.register) return;
  const DBG = (AS.SabotageC = AS.SabotageC || { live: null });

  // Art kit: shared with tasks-c.js, see kit.js
  const U = AS.util;
  const K = AS.TaskKit;
  const {
    TAU, OUT, F, clamp, lerp, angDiff, NUM, NODASH, UP, rr, layer, glow, paintWall, paintScreen,
    paintGlass, hazard, makeHint, glowText, monoText, PK, Particles, finisher, seedOf,
  } = K;
  // sabotage panels use a slightly softer inner rim than the task devices
  const paintDevice = (c, x, y, w, h, r, tone, rnd) => K.paintDevice(c, x, y, w, h, r, tone, rnd, 0.4);

  // =====================================================================================
  // FIX LIGHTS — five lever switches
  // =====================================================================================
  function lightsGame(ctx) {
    const W = ctx.w, H = ctx.h, rnd = ctx.rng, seed = seedOf(rnd);
    const finish = finisher(ctx);
    const hint = makeHint(W, 420);
    const PX = 36, PY = 74, PW = W - 72, PH = 324;
    const BULB_Y = 122, SLOT_T = 180, SLOT_B = 350, HY_ON = 212, HY_OFF = 318;
    const CXS = new Float32Array(5);
    for (let i = 0; i < 5; i++) CXS[i] = PX + (PW * (i + 0.5)) / 5;
    const on = [false, false, false, false, false];
    for (let i = 0; i < 5; i++) on[i] = rnd() < 0.5;
    let offs = 0;
    for (let i = 0; i < 5; i++) if (!on[i]) offs++;
    while (offs < 2) { const i = Math.floor(rnd() * 5); if (on[i]) { on[i] = false; offs++; } }
    const pos = new Float32Array(5), vel = new Float32Array(5), flash = new Float32Array(5), flick = new Float32Array(5);
    for (let i = 0; i < 5; i++) pos[i] = on[i] ? 1 : 0;
    let solved = false, finishIn = -1, time = 0, allT = 0, dark = offs / 5;
    const parts = Particles(120);

    function toggle(i) {
      if (solved) return;
      on[i] = !on[i];
      vel[i] += on[i] ? 2 : -2;
      ctx.sfx('switch');
      const hy = on[i] ? HY_ON : HY_OFF;
      parts.burst(PK.SPARK, CXS[i], hy + (on[i] ? -24 : 24), on[i] ? 8 : 4, 220, 0.35, 2.2, on[i] ? '#ffe27a' : '#9aa6bb');
      if (on[i]) { flash[i] = 1; parts.ring(CXS[i], BULB_Y, 34, 0.45, '#ffe58a'); }
      let all = true;
      for (let j = 0; j < 5; j++) if (!on[j]) all = false;
      if (all) {
        solved = true; finishIn = 0.6; allT = 0.0001;
        for (let j = 0; j < 5; j++) parts.burst(PK.STAR, CXS[j], BULB_Y, 6, 200, 0.7, 8, '#fff4c2');
      }
    }

    const bg = layer(W, 0, 0, W, H, (c) => {
      const r = U.rng(seed);
      paintWall(c, W, H);
      paintDevice(c, 12, 12, W - 24, H - 24, 22, 'dark', r);
      hazard(c, 44, 28, W - 88, 30, 8);
      // warning sign
      c.save(); c.translate(W / 2, 43);
      c.beginPath(); c.moveTo(0, -26); c.lineTo(28, 20); c.lineTo(-28, 20); c.closePath();
      c.lineJoin = 'round'; c.lineWidth = 10; c.strokeStyle = OUT; c.stroke();
      c.fillStyle = '#ffd23f'; c.fill(); c.lineWidth = 4; c.strokeStyle = '#1a1a22'; c.stroke();
      c.beginPath(); c.moveTo(3, -13); c.lineTo(-7, 4); c.lineTo(0, 4); c.lineTo(-4, 16); c.lineTo(8, -2); c.lineTo(1, -2); c.lineTo(5, -13); c.closePath();
      c.fillStyle = '#1a1a22'; c.fill();
      c.restore();
      // recessed inner panel
      paintScreen(c, PX, PY, PW, PH, 14, '#262d3d', '#151a26');
      c.save(); rr(c, PX, PY, PW, PH, 14); c.clip();
      const ish = c.createLinearGradient(0, PY, 0, PY + 26);
      ish.addColorStop(0, 'rgba(0,0,0,0.55)'); ish.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = ish; c.fillRect(PX, PY, PW, 26);
      // conduit wires behind
      c.lineCap = 'round';
      for (let i = 0; i < 5; i++) {
        const x = CXS[i] + 40;
        c.strokeStyle = OUT; c.lineWidth = 7; c.beginPath(); c.moveTo(x, PY); c.bezierCurveTo(x, 160, x + 6, 200, x - 4, PY + PH); c.stroke();
        c.strokeStyle = ['#e8343b', '#2e5cf2', '#f6e14b', '#1fa45a', '#f25cc0'][i]; c.lineWidth = 3.5; c.stroke();
      }
      c.restore();
      for (let i = 0; i < 5; i++) {
        const x = CXS[i];
        // bulb socket
        rr(c, x - 15, BULB_Y + 20, 30, 20, 4); c.fillStyle = '#9aa6bb'; c.fill(); c.lineWidth = 3; c.strokeStyle = OUT; c.stroke();
        c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(x - 13, BULB_Y + 26, 26, 2); c.fillRect(x - 13, BULB_Y + 32, 26, 2);
        // switch slot
        rr(c, x - 31, SLOT_T - 4, 62, SLOT_B - SLOT_T + 8, 20); c.fillStyle = '#8d97ab'; c.fill(); c.lineWidth = 3; c.strokeStyle = OUT; c.stroke();
        rr(c, x - 27, SLOT_T, 54, SLOT_B - SLOT_T, 17); c.fillStyle = '#0b0e16'; c.fill();
        const sg = c.createLinearGradient(0, SLOT_T, 0, SLOT_T + 30);
        sg.addColorStop(0, 'rgba(0,0,0,0.7)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = sg; rr(c, x - 27, SLOT_T, 54, 30, 17); c.fill();
        c.fillStyle = '#222838'; c.fillRect(x - 3, SLOT_T + 18, 6, SLOT_B - SLOT_T - 36);
        // ON / OFF marks (I / O)
        c.strokeStyle = 'rgba(200,215,240,0.7)'; c.lineWidth = 3; c.lineCap = 'round';
        c.beginPath(); c.moveTo(x - 46, SLOT_T + 18); c.lineTo(x - 46, SLOT_T + 34); c.stroke();
        c.beginPath(); c.arc(x - 46, SLOT_B - 26, 7, 0, TAU); c.stroke();
        // number plate
        rr(c, x - 18, SLOT_B + 12, 36, 24, 7); c.fillStyle = '#d9dfe8'; c.fill(); c.lineWidth = 2.5; c.strokeStyle = OUT; c.stroke();
        c.font = F(17); c.fillStyle = '#20263a'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(NUM[i + 1], x, SLOT_B + 25);
      }
    });

    function drawBulb(g, x, y, i) {
      const lit = pos[i] > 0.5;
      const fl = lit ? 0.92 + 0.08 * Math.sin(time * 31 + i * 7) * flick[i] + flash[i] * 0.5 + (allT > 0 ? 0.35 * Math.sin(Math.min(1, allT * 2) * Math.PI) : 0) : 0;
      if (lit) glow(g, x, y, 92, '255,214,90', 0.75 * fl);
      g.beginPath(); g.arc(x, y, 24, 0, TAU);
      g.fillStyle = lit ? '#fff1a6' : '#3a4152'; g.fill(); g.lineWidth = 3.5; g.strokeStyle = OUT; g.stroke();
      g.beginPath(); g.moveTo(x - 8, y + 21); g.lineTo(x - 8, y + 8); g.lineTo(x - 4, y + 2); g.lineTo(x, y + 8); g.lineTo(x + 4, y + 2); g.lineTo(x + 8, y + 8); g.lineTo(x + 8, y + 21);
      g.lineWidth = lit ? 3 : 2; g.strokeStyle = lit ? '#ff9d2e' : '#6b7385'; g.lineJoin = 'round'; g.stroke();
      if (lit) glow(g, x, y + 5, 26, '255,255,230', 0.8 * fl);
      g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.ellipse(x - 9, y - 10, 5, 8, 0.6, 0, TAU); g.fill();
    }
    function drawLever(g, x, i) {
      const p = pos[i], y = lerp(HY_OFF, HY_ON, p), isOn = p > 0.5;
      // lit track in the free part of the slot: green below a raised lever, red above a lowered one
      const t0 = isOn ? y + 26 : SLOT_T + 6, t1 = isOn ? SLOT_B - 6 : y - 26;
      if (t1 - t0 > 6) {
        rr(g, x - 21, t0, 42, t1 - t0, 14);
        g.fillStyle = isOn ? 'rgba(70,255,154,0.2)' : 'rgba(255,90,106,0.2)'; g.fill();
        glow(g, x, (t0 + t1) / 2, 40, isOn ? '70,255,154' : '255,90,106', 0.25);
      }
      rr(g, x - 32, y - 20 + 5, 64, 40, 12); g.fillStyle = 'rgba(0,0,0,0.5)'; g.fill();
      rr(g, x - 32, y - 20, 64, 40, 12); g.fillStyle = '#dfe5ee'; g.fill(); g.lineWidth = 3.5; g.strokeStyle = OUT; g.stroke();
      rr(g, x - 27, y - 16, 54, 11, 6); g.fillStyle = 'rgba(255,255,255,0.7)'; g.fill();
      g.fillStyle = 'rgba(60,70,90,0.45)';
      g.fillRect(x - 20, y - 1, 40, 2.5); g.fillRect(x - 20, y + 5, 40, 2.5);
      rr(g, x - 32, y + 9, 64, 11, 6); g.fillStyle = 'rgba(80,90,110,0.35)'; g.fill();
      g.beginPath(); g.arc(x + 20, y - 1, 4.5, 0, TAU); g.fillStyle = isOn ? '#46ff9a' : '#ff5a6a'; g.fill(); g.lineWidth = 2; g.strokeStyle = OUT; g.stroke();
      glow(g, x + 20, y - 1, 14, isOn ? '70,255,154' : '255,90,106', 0.8);
    }

    const inst = {
      update(dt) {
        time += dt;
        for (let i = 0; i < 5; i++) {
          // springy lever: critically under-damped toward target
          const target = on[i] ? 1 : 0;
          vel[i] += (target - pos[i]) * 260 * dt;
          vel[i] *= Math.max(0, 1 - 16 * dt);
          pos[i] += vel[i] * dt;
          if (pos[i] < -0.08) { pos[i] = -0.08; vel[i] = 0; }
          if (pos[i] > 1.08) { pos[i] = 1.08; vel[i] = 0; }
          if (flash[i] > 0) flash[i] = Math.max(0, flash[i] - dt * 2.5);
          flick[i] = on[i] ? Math.max(0, flick[i] - dt * 1.5) : 1;
        }
        let o = 0;
        for (let i = 0; i < 5; i++) if (!on[i]) o++;
        dark += (o / 5 - dark) * Math.min(1, dt * 6);
        if (allT > 0) allT += dt;
        parts.update(dt);
        if (finishIn > 0) { finishIn -= dt; if (finishIn <= 0) finish(); }
      },
      draw(g) {
        bg(g);
        for (let i = 0; i < 5; i++) drawLever(g, CXS[i], i);
        if (dark > 0.01) {
          g.globalAlpha = dark * 0.42; g.fillStyle = '#02040c';
          g.fillRect(0, 0, W, H);
          g.globalAlpha = 1;
        }
        for (let i = 0; i < 5; i++) drawBulb(g, CXS[i], BULB_Y, i);
        parts.draw(g);
        hint(g, AS.t('game.fix_lights.hint'), solved ? '#7dffb0' : null);
      },
      pointerDown(x, y, id) {
        if (solved) return;
        for (let i = 0; i < 5; i++) {
          if (Math.abs(x - CXS[i]) <= 58 && y >= BULB_Y - 30 && y <= SLOT_B + 40) { toggle(i); return; }
        }
      },
      pointerMove() {},
      pointerUp() {},
      keyDown(key) { if (key.length === 1 && key >= '1' && key <= '5') toggle(key.charCodeAt(0) - 49); },
      destroy() { if (solved) finish(); if (DBG.live === inst) DBG.live = null; },
      __test: {
        switches: () => Array.from(CXS, (x, i) => [Math.round(x), 265, on[i]]),
        state: () => ({ solved, on: on.slice() }),
      },
    };
    DBG.live = inst;
    return inst;
  }

  // =====================================================================================
  // FIX COMMS — tune the dial so the waveform matches the target
  // =====================================================================================
  function commsGame(ctx) {
    const W = ctx.w, H = ctx.h, rnd = ctx.rng, seed = seedOf(rnd);
    const finish = finisher(ctx);
    const hint = makeHint(W, 414);
    const OX = 40, OY = 40, OW = 420, OH = 262;
    const BX = 40, BY = 328, BW = 420, BH = 58;
    const KX = 586, KY = 228, KR = 64, SWEEP = 1.5 * Math.PI, TOLV = 0.022, HOLD = 1.0;
    const target = 0.12 + rnd() * 0.76;
    let value = 0.5;
    for (let k = 0; k < 50; k++) { value = 0.03 + rnd() * 0.94; if (Math.abs(value - target) > 0.3) break; }
    let dragId = null, mode = 0, lastA = 0, tickAcc = 0, tickCd = 0, steady = 0, matched = false, time = 0, lockPulse = 0, grabbed = false;
    let solved = false, finishIn = -1, fq = -1, fqText = '';
    const parts = Particles(90);
    const N = 120, waveY = new Float32Array(N + 1);
    const TGT_DASH = [9, 7];

    const knobA = () => (value * 270 - 225) * (Math.PI / 180);

    const bg = layer(W, 0, 0, W, H, (c) => {
      const r = U.rng(seed);
      paintWall(c, W, H);
      paintDevice(c, 12, 12, W - 24, H - 24, 24, 'olive', r);
      // oscilloscope
      paintScreen(c, OX, OY, OW, OH, 16, '#06221a', '#020c09');
      c.save(); rr(c, OX, OY, OW, OH, 16); c.clip();
      c.strokeStyle = 'rgba(80,255,170,0.10)'; c.lineWidth = 1;
      for (let x = OX + OW / 10; x < OX + OW; x += OW / 10) { c.beginPath(); c.moveTo(x, OY); c.lineTo(x, OY + OH); c.stroke(); }
      for (let y = OY + OH / 8; y < OY + OH; y += OH / 8) { c.beginPath(); c.moveTo(OX, y); c.lineTo(OX + OW, y); c.stroke(); }
      c.strokeStyle = 'rgba(80,255,170,0.25)'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(OX, OY + OH / 2); c.lineTo(OX + OW, OY + OH / 2); c.moveTo(OX + OW / 2, OY); c.lineTo(OX + OW / 2, OY + OH); c.stroke();
      for (let x = OX; x < OX + OW; x += OW / 50) { c.beginPath(); c.moveTo(x, OY + OH / 2 - 3); c.lineTo(x, OY + OH / 2 + 3); c.stroke(); }
      c.restore();
      // tuning band (vintage dial)
      paintScreen(c, BX, BY, BW, BH, 10, '#f3e6c4', '#d9c79c');
      c.save(); rr(c, BX, BY, BW, BH, 10); c.clip();
      c.strokeStyle = '#4a3a20'; c.fillStyle = '#4a3a20'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = F(14);
      for (let k = 0; k <= 40; k++) {
        const x = BX + 18 + (k / 40) * (BW - 36), big = k % 8 === 0;
        c.lineWidth = big ? 2 : 1;
        c.beginPath(); c.moveTo(x, BY + 6); c.lineTo(x, BY + (big ? 20 : 13)); c.stroke();
        if (big) c.fillText(String(88 + k / 2), x, BY + 36);
      }
      c.fillStyle = '#c0392b'; c.font = F(11); c.fillText('MHz', BX + BW - 24, BY + 48);
      c.restore();
      // signal meter well + frequency LCD
      paintScreen(c, 496, 40, 180, 64, 10, '#0b1a14', '#04100b');
      paintScreen(c, 500, 328, 172, 58, 10, '#0b1a14', '#04100b');
      // antenna icon
      c.strokeStyle = 'rgba(125,255,190,0.7)'; c.lineWidth = 2.5; c.lineCap = 'round';
      c.beginPath(); c.moveTo(516, 92); c.lineTo(522, 62); c.lineTo(528, 92); c.moveTo(519, 80); c.lineTo(525, 80); c.stroke();
      c.beginPath(); c.arc(522, 60, 7, -2.4, -0.7); c.stroke();
      c.beginPath(); c.arc(522, 60, 12, -2.4, -0.7); c.stroke();
      // knob dial plate + scale
      c.beginPath(); c.arc(KX, KY + 4, KR + 34, 0, TAU); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fill();
      const pl = c.createLinearGradient(0, KY - KR - 30, 0, KY + KR + 30);
      pl.addColorStop(0, '#3a4030'); pl.addColorStop(1, '#22261a');
      c.beginPath(); c.arc(KX, KY, KR + 30, 0, TAU); c.fillStyle = pl; c.fill(); c.lineWidth = 3.5; c.strokeStyle = OUT; c.stroke();
      c.font = F(13); c.fillStyle = '#e8e2c8'; c.textAlign = 'center'; c.textBaseline = 'middle';
      for (let k = 0; k <= 30; k++) {
        const a = ((k / 30) * 270 - 225) * (Math.PI / 180), big = k % 3 === 0;
        const r1 = KR + 6, r2 = KR + (big ? 15 : 11);
        c.beginPath(); c.moveTo(KX + Math.cos(a) * r1, KY + Math.sin(a) * r1); c.lineTo(KX + Math.cos(a) * r2, KY + Math.sin(a) * r2);
        c.lineWidth = big ? 2.5 : 1.3; c.strokeStyle = big ? '#f3ecd0' : 'rgba(243,236,208,0.6)'; c.stroke();
        if (big && k % 6 === 0) c.fillText(String(k / 3), KX + Math.cos(a) * (KR + 24), KY + Math.sin(a) * (KR + 24));
      }
      // knob body (static lighting)
      c.beginPath(); c.arc(KX + 2, KY + 6, KR, 0, TAU); c.fillStyle = 'rgba(0,0,0,0.5)'; c.fill();
      const kb = c.createRadialGradient(KX - KR * 0.35, KY - KR * 0.4, 6, KX, KY, KR);
      kb.addColorStop(0, '#5d6573'); kb.addColorStop(0.7, '#2c313b'); kb.addColorStop(1, '#1a1e26');
      c.beginPath(); c.arc(KX, KY, KR, 0, TAU); c.fillStyle = kb; c.fill(); c.lineWidth = 4; c.strokeStyle = OUT; c.stroke();
      const cap = c.createRadialGradient(KX - 14, KY - 16, 4, KX, KY, KR * 0.68);
      cap.addColorStop(0, '#f2f5f9'); cap.addColorStop(0.6, '#a9b3c3'); cap.addColorStop(1, '#6b7586');
      c.beginPath(); c.arc(KX, KY, KR * 0.68, 0, TAU); c.fillStyle = cap; c.fill(); c.lineWidth = 3; c.stroke();
    });
    const scopeGlass = layer(W, OX - 4, OY - 4, OW + 8, OH + 8, (c) => paintGlass(c, OX, OY, OW, OH, 16));
    const bandGlass = layer(W, BX - 4, BY - 4, BW + 8, BH + 8, (c) => paintGlass(c, BX, BY, BW, BH, 10, false));

    const inst = {
      update(dt) {
        time += dt;
        if (tickCd > 0) tickCd -= dt;
        if (lockPulse > 0) lockPulse = Math.max(0, lockPulse - dt * 2);
        const was = matched;
        matched = !solved && Math.abs(value - target) <= TOLV;
        if (matched && !was) { ctx.sfx('beep'); lockPulse = 1; }
        if (!solved) {
          if (matched) steady = Math.min(HOLD, steady + dt);
          else steady = Math.max(0, steady - dt * 3);
          if (steady >= HOLD) {
            solved = true; finishIn = 0.45; value = target; dragId = null;
            parts.ring(KX, KY, 90, 0.6, '#7dffb0');
            parts.burst(PK.STAR, OX + OW / 2, OY + OH / 2, 18, 260, 0.8, 9, '#c8ffe6');
          }
        }
        parts.update(dt);
        if (finishIn > 0) { finishIn -= dt; if (finishIn <= 0) finish(); }
      },
      draw(g) {
        bg(g);
        const diff = Math.abs(value - target);
        const close = 1 - clamp(diff / 0.4, 0, 1);
        const ok = matched || solved;
        // waveforms
        g.save(); rr(g, OX, OY, OW, OH, 16); g.clip();
        const midY = OY + OH / 2, amp = OH * 0.3, ft = 1.2 + target * 4.6, fc = 1.2 + value * 4.6, ph = time * 0.9;
        g.beginPath();
        for (let i = 0; i <= N; i++) {
          const u = i / N, y = midY + Math.sin((u * ft - ph) * TAU) * amp;
          if (i) g.lineTo(OX + u * OW, y); else g.moveTo(OX, y);
        }
        g.setLineDash(TGT_DASH); g.lineDashOffset = 0;
        g.strokeStyle = ok ? 'rgba(200,255,235,0.5)' : 'rgba(120,230,255,0.55)'; g.lineWidth = 3; g.lineJoin = 'round'; g.stroke();
        g.setLineDash(NODASH);
        const noise = (1 - close) * amp * 0.75 + (ok ? 0 : 4);
        const wob = ok ? 1 : 0.8 + 0.2 * Math.sin(time * 9);
        for (let i = 0; i <= N; i++) {
          const u = i / N;
          waveY[i] = midY + Math.sin((u * fc - ph) * TAU) * amp * wob + (Math.random() - 0.5) * noise;
        }
        g.beginPath();
        for (let i = 0; i <= N; i++) { if (i) g.lineTo(OX + (i / N) * OW, waveY[i]); else g.moveTo(OX, waveY[0]); }
        const wc = ok ? '#b8ffe0' : close > 0.55 ? '#c6ff6b' : '#ffb347';
        g.globalAlpha = 0.22; g.strokeStyle = wc; g.lineWidth = 10; g.stroke();
        g.globalAlpha = 1; g.lineWidth = 3.5; g.stroke();
        g.restore();
        scopeGlass(g);
        // status label on the scope
        g.font = F(16); g.textAlign = 'left'; g.textBaseline = 'middle';
        const st = ok ? 'game.fix_comms.locked' : close > 0.55 ? 'game.fix_comms.tuning' : 'game.fix_comms.nosignal';
        const sc = ok ? '#7dffb0' : close > 0.55 ? '#ffd27a' : '#ff6b7a';
        g.globalAlpha = ok ? 1 : 0.7 + 0.3 * Math.sin(time * 5);
        glowText(g, UP(st), OX + 16, OY + 20, sc, 8);
        g.globalAlpha = 1;
        // signal bars
        const lit = Math.round(close * 8);
        for (let i = 0; i < 8; i++) {
          const bh = 10 + i * 5, x = 542 + i * 16, y = 96 - bh;
          const colr = i < 3 ? '#ff5a6a' : i < 6 ? '#ffd23f' : '#46ff9a';
          rr(g, x, y, 11, bh, 3);
          if (i < lit) { g.fillStyle = colr; g.fill(); } else { g.fillStyle = 'rgba(120,140,130,0.18)'; g.fill(); }
        }
        if (lit > 0) glow(g, 542 + (lit - 1) * 16 + 5, 82, 30, lit > 5 ? '70,255,154' : lit > 2 ? '255,210,63' : '255,90,106', 0.45);
        // band needle
        const nx = BX + 18 + value * (BW - 36);
        g.save(); rr(g, BX, BY, BW, BH, 10); g.clip();
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(nx - 1, BY, 6, BH);
        g.fillStyle = '#e8262f'; g.fillRect(nx - 2, BY, 4, BH);
        g.restore();
        bandGlass(g);
        glow(g, nx, BY + BH / 2, 26, '255,60,60', 0.35);
        // frequency readout
        const f10 = Math.round((88 + value * 20) * 10);
        if (f10 !== fq) { fq = f10; fqText = (f10 / 10).toFixed(1); }
        g.font = F(30); g.textBaseline = 'middle';
        g.shadowColor = ok ? '#7dffb0' : '#ffd27a'; g.shadowBlur = 10; g.fillStyle = g.shadowColor;
        monoText(g, fqText, 640, 358, 19, 1);
        g.shadowBlur = 0; g.shadowColor = 'rgba(0,0,0,0)';
        g.font = F(12); g.textAlign = 'left'; g.fillStyle = 'rgba(125,255,190,0.65)'; g.fillText('MHz', 644, 366);
        // knob: knurled grip + pointer (rotates)
        const a = knobA();
        g.save(); g.translate(KX, KY); g.rotate(a);
        g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 2.5; g.lineCap = 'round';
        g.beginPath();
        for (let k = 0; k < 28; k++) { const t = (k / 28) * TAU, ca = Math.cos(t), sa = Math.sin(t); g.moveTo(ca * (KR * 0.74), sa * (KR * 0.74)); g.lineTo(ca * (KR - 5), sa * (KR - 5)); }
        g.stroke();
        g.fillStyle = OUT; rr(g, KR * 0.18, -5.5, KR * 0.5, 11, 5.5); g.fill();
        g.fillStyle = ok ? '#7dffb0' : '#ff6b5a'; rr(g, KR * 0.22, -3, KR * 0.42, 6, 3); g.fill();
        g.beginPath(); g.arc(KR * 0.86, 0, 5, 0, TAU); g.fillStyle = ok ? '#7dffb0' : '#ffd27a'; g.fill(); g.lineWidth = 2; g.strokeStyle = OUT; g.stroke();
        g.restore();
        glow(g, KX + Math.cos(a) * KR * 0.86, KY + Math.sin(a) * KR * 0.86, 18, ok ? '125,255,176' : '255,210,122', 0.7);
        // steady/lock progress ring
        if (steady > 0 || solved) {
          const fr = solved ? 1 : steady / HOLD;
          g.beginPath(); g.arc(KX, KY, KR + 38, -Math.PI / 2, -Math.PI / 2 + TAU * fr);
          g.lineWidth = 7; g.strokeStyle = OUT; g.lineCap = 'round'; g.stroke();
          g.lineWidth = 4; g.strokeStyle = '#7dffb0'; g.stroke();
          glow(g, KX, KY, KR + 60, '125,255,176', 0.22 * fr + lockPulse * 0.3);
        }
        if (!grabbed) {
          const k = (time * 1.1) % 1;
          g.globalAlpha = (1 - k) * 0.9; g.strokeStyle = '#ffd23f'; g.lineWidth = 3;
          g.beginPath(); g.arc(KX, KY, KR + 8 + k * 26, 0, TAU); g.stroke(); g.globalAlpha = 1;
        }
        parts.draw(g);
        hint(g, AS.t('game.fix_comms.hint'), ok ? '#7dffb0' : null);
      },
      pointerDown(x, y, id) {
        if (solved || dragId !== null) return;
        if (Math.hypot(x - KX, y - KY) <= KR + 34) { dragId = id; mode = 1; lastA = Math.atan2(y - KY, x - KX); grabbed = true; ctx.sfx('click'); return; }
        if (x >= BX && x <= BX + BW && y >= BY - 10 && y <= BY + BH + 10) { dragId = id; mode = 2; grabbed = true; inst.pointerMove(x, y, id); }
      },
      pointerMove(x, y, id) {
        if (id !== dragId || solved) return;
        const prev = value;
        if (mode === 1) {
          const a = Math.atan2(y - KY, x - KX);
          const d = angDiff(a, lastA);
          lastA = a;
          value = clamp(value + d / SWEEP, 0, 1);
        } else if (mode === 2) {
          value = clamp((x - BX - 18) / (BW - 36), 0, 1);
        }
        tickAcc += Math.abs(value - prev);
        if (tickAcc > 0.025 && tickCd <= 0) { tickAcc = 0; tickCd = 0.05; ctx.sfx('click'); }
      },
      pointerUp(x, y, id) { if (id === dragId) { dragId = null; mode = 0; } },
      keyDown(key) {
        if (solved) return;
        if (key === 'ArrowLeft' || key === 'ArrowDown') { value = clamp(value - 0.006, 0, 1); grabbed = true; }
        else if (key === 'ArrowRight' || key === 'ArrowUp') { value = clamp(value + 0.006, 0, 1); grabbed = true; }
      },
      destroy() { if (solved) finish(); if (DBG.live === inst) DBG.live = null; },
      __test: {
        target: () => target,
        value: () => value,
        knob: () => [KX, KY, KR],
        band: () => [BX + 18, BY + BH / 2, BW - 36],
        state: () => ({ solved, matched, steady }),
      },
    };
    DBG.live = inst;
    return inst;
  }

  // =====================================================================================
  // FIX O2 — keypad + sticky note code
  // =====================================================================================
  function o2Game(ctx) {
    const W = ctx.w, H = ctx.h, rnd = ctx.rng, seed = seedOf(rnd);
    const finish = finisher(ctx);
    const hint = makeHint(W, 460);
    let code = '';
    for (let i = 0; i < 5; i++) code += NUM[Math.floor(rnd() * 10)];
    const DX0 = 270, DY0 = 14, DW0 = 396, DH0 = 432;
    const LX = 298, LY = 40, LW = 340, LH = 70;
    const KW = 86, KH = 62, KG = 16, KX0 = DX0 + (DW0 - (3 * KW + 2 * KG)) / 2, KY0 = 134;
    const LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'OK'];
    const press = new Float32Array(12);
    const noteRot = -0.06 - rnd() * 0.05;
    let input = '', errT = 0, okT = 0, time = 0, solved = false, finishIn = -1;
    const parts = Particles(80);

    function keyX(i) { return KX0 + (i % 3) * (KW + KG); }
    function keyY(i) { return KY0 + Math.floor(i / 3) * (KH + KG); }
    function hit(i) {
      if (solved) return;
      press[i] = 1;
      const lab = LABELS[i];
      if (lab === 'C') { if (input.length) { input = ''; ctx.sfx('back'); } else ctx.sfx('keypad'); return; }
      if (lab === 'OK') { submit(); return; }
      if (errT > 0) errT = 0;
      if (input.length < 5) { input += lab; ctx.sfx('keypad'); }
      else ctx.sfx('beep');
    }
    function submit() {
      if (solved) return;
      if (input === code) {
        solved = true; okT = 1; finishIn = 0.5;
        parts.burst(PK.STAR, LX + LW / 2, LY + LH / 2, 16, 240, 0.8, 9, '#c8ffe6');
        ctx.sfx('beep');
      } else {
        errT = 1; input = '';
        ctx.sfx('error');
      }
    }

    const bg = layer(W, 0, 0, W, H, (c) => {
      const r = U.rng(seed);
      paintWall(c, W, H);
      // O2 pipes on the wall
      c.lineCap = 'butt';
      c.fillStyle = '#2e6f8f'; c.fillRect(0, 370, DX0, 20); c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(0, 373, DX0, 4);
      c.strokeStyle = OUT; c.lineWidth = 3; c.strokeRect(-4, 370, DX0 + 4, 20);
      for (let x = 18; x < DX0; x += 210) { rr(c, x, 364, 16, 32, 4); c.fillStyle = '#3f8fb0'; c.fill(); c.stroke(); }
      paintDevice(c, DX0, DY0, DW0, DH0, 24, 'steel', r);
      paintScreen(c, LX, LY, LW, LH, 12, '#0a2a1f', '#03130d');
      for (let i = 0; i < 12; i++) { rr(c, keyX(i) - 3, keyY(i) - 3, KW + 6, KH + 10, 14); c.fillStyle = 'rgba(0,0,0,0.35)'; c.fill(); }
      // O2 gauge face
      const gx = 140, gy = 380, gr = 58;
      c.beginPath(); c.arc(gx, gy + 4, gr + 10, 0, TAU); c.fillStyle = 'rgba(0,0,0,0.4)'; c.fill();
      const bz = c.createLinearGradient(0, gy - gr - 10, 0, gy + gr + 10);
      bz.addColorStop(0, '#e9eef6'); bz.addColorStop(1, '#6f7c93');
      c.beginPath(); c.arc(gx, gy, gr + 9, 0, TAU); c.fillStyle = bz; c.fill(); c.lineWidth = 3.5; c.strokeStyle = OUT; c.stroke();
      c.beginPath(); c.arc(gx, gy, gr, 0, TAU); c.fillStyle = '#f4f1e6'; c.fill(); c.lineWidth = 2.5; c.stroke();
      c.lineWidth = 8;
      c.beginPath(); c.arc(gx, gy, gr - 9, Math.PI * 0.75, Math.PI * 1.15); c.strokeStyle = '#e8343b'; c.stroke();
      c.beginPath(); c.arc(gx, gy, gr - 9, Math.PI * 1.15, Math.PI * 1.6); c.strokeStyle = '#ffc928'; c.stroke();
      c.beginPath(); c.arc(gx, gy, gr - 9, Math.PI * 1.6, Math.PI * 2.25); c.strokeStyle = '#2bd36f'; c.stroke();
      c.lineWidth = 2; c.strokeStyle = '#2a2f3a';
      for (let k = 0; k <= 10; k++) {
        const a = Math.PI * 0.75 + (k / 10) * Math.PI * 1.5;
        c.beginPath(); c.moveTo(gx + Math.cos(a) * (gr - 4), gy + Math.sin(a) * (gr - 4)); c.lineTo(gx + Math.cos(a) * (gr - 15), gy + Math.sin(a) * (gr - 15)); c.stroke();
      }
      c.fillStyle = '#2a2f3a'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = F(22); c.fillText('O', gx - 5, gy + 30); c.font = F(13); c.fillText('2', gx + 6, gy + 36);
      // sticky note
      c.save(); c.translate(140, 168); c.rotate(noteRot);
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.moveTo(-92, -78); c.lineTo(96, -78); c.lineTo(96, 84); c.lineTo(-88, 90); c.closePath(); c.fill();
      const np = c.createLinearGradient(0, -86, 0, 86);
      np.addColorStop(0, '#fff2a0'); np.addColorStop(1, '#ffd84f');
      c.beginPath(); c.moveTo(-90, -84); c.lineTo(90, -84); c.lineTo(90, 62); c.quadraticCurveTo(78, 70, 66, 84); c.lineTo(-90, 84); c.closePath();
      c.fillStyle = np; c.fill(); c.lineWidth = 3; c.strokeStyle = OUT; c.stroke();
      c.beginPath(); c.moveTo(90, 62); c.quadraticCurveTo(74, 64, 66, 84); c.quadraticCurveTo(70, 70, 90, 62); c.fillStyle = '#e8b92e'; c.fill(); c.lineWidth = 2; c.stroke();
      c.strokeStyle = 'rgba(80,110,200,0.25)'; c.lineWidth = 1.5;
      for (let y = -44; y < 70; y += 22) { c.beginPath(); c.moveTo(-80, y); c.lineTo(80, y); c.stroke(); }
      c.save(); c.rotate(0.08);
      c.fillStyle = 'rgba(235,245,255,0.55)'; c.fillRect(-40, -96, 80, 24);
      c.strokeStyle = 'rgba(120,140,170,0.35)'; c.lineWidth = 1.5; c.strokeRect(-40, -96, 80, 24);
      c.restore();
      c.fillStyle = '#2b3a7a'; c.font = F(17); c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillText(AS.t('game.fix_o2.note'), -76, -52, 152);
      c.fillStyle = '#1b2a6b'; c.font = F(44); c.textBaseline = 'middle';
      monoText(c, code, 0, 6, 29, 0.5);
      c.strokeStyle = '#c0392b'; c.lineWidth = 3; c.lineCap = 'round';
      c.beginPath(); c.moveTo(-70, 40); c.bezierCurveTo(-30, 34, 20, 46, 70, 36); c.stroke();
      c.restore();
    });
    const lcdGlass = layer(W, LX - 4, LY - 4, LW + 8, LH + 8, (c) => paintGlass(c, LX, LY, LW, LH, 12));

    function drawKey(g, i) {
      const x = keyX(i), y = keyY(i), lab = LABELS[i];
      const d = press[i] > 0 ? 5 * Math.sin(Math.min(1, press[i]) * Math.PI * 0.5 + Math.PI * 0.5) : 0;
      const isC = lab === 'C', isOK = lab === 'OK';
      const face = isC ? '#ff6b6b' : isOK ? '#3ddc84' : '#eef2f7';
      const edge = isC ? '#a8323a' : isOK ? '#178a4a' : '#8b97ad';
      rr(g, x, y + 6, KW, KH, 13); g.fillStyle = edge; g.fill(); g.lineWidth = 3; g.strokeStyle = OUT; g.stroke();
      rr(g, x, y + d, KW, KH, 13); g.fillStyle = face; g.fill(); g.stroke();
      rr(g, x + 5, y + d + 4, KW - 10, 14, 7); g.fillStyle = 'rgba(255,255,255,0.45)'; g.fill();
      const cx = x + KW / 2, cy = y + KH / 2 + d + 1;
      if (isOK && input.length === 5 && !solved) glow(g, cx, cy, 60, '61,220,132', 0.35 + 0.25 * Math.sin(time * 6));
      g.lineCap = 'round'; g.lineJoin = 'round';
      if (isC) {
        g.lineWidth = 6; g.strokeStyle = '#ffffff';
        g.beginPath(); g.moveTo(cx - 11, cy - 11); g.lineTo(cx + 11, cy + 11); g.moveTo(cx + 11, cy - 11); g.lineTo(cx - 11, cy + 11); g.stroke();
      } else if (isOK) {
        g.lineWidth = 6; g.strokeStyle = '#ffffff';
        g.beginPath(); g.moveTo(cx - 14, cy); g.lineTo(cx - 4, cy + 10); g.lineTo(cx + 15, cy - 11); g.stroke();
      } else {
        g.font = F(32); g.fillStyle = '#26314d'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(lab, cx, cy + 1);
      }
    }

    const inst = {
      update(dt) {
        time += dt;
        for (let i = 0; i < 12; i++) if (press[i] > 0) press[i] = Math.max(0, press[i] - dt * 6);
        if (errT > 0) errT = Math.max(0, errT - dt * 1.1);
        if (okT > 0 && !solved) okT = Math.max(0, okT - dt);
        parts.update(dt);
        if (finishIn > 0) { finishIn -= dt; if (finishIn <= 0) finish(); }
      },
      draw(g) {
        bg(g);
        // O2 gauge needle from the sabotage timer
        const s = ctx.getState && ctx.getState();
        const sab = s && s.sabotage;
        const frac = sab && sab.kind === 'o2' && sab.timer != null ? clamp(sab.timer / ((AS.T && AS.T.O2_TIME) || 45), 0, 1) : 0.5 + 0.05 * Math.sin(time);
        const na = Math.PI * 0.75 + frac * Math.PI * 1.5 + Math.sin(time * 18) * 0.012;
        g.lineCap = 'round';
        g.beginPath(); g.moveTo(140, 380); g.lineTo(140 + Math.cos(na) * 44, 380 + Math.sin(na) * 44); g.lineWidth = 6; g.strokeStyle = OUT; g.stroke();
        g.lineWidth = 3; g.strokeStyle = '#e8262f'; g.stroke();
        g.beginPath(); g.arc(140, 380, 7, 0, TAU); g.fillStyle = '#2a2f3a'; g.fill();
        if (frac < 0.3) glow(g, 140, 380, 80, '255,60,60', 0.25 + 0.2 * Math.sin(time * 8));
        // LCD
        const shake = errT > 0.55 ? Math.sin(time * 70) * 6 * (errT - 0.55) * 2.2 : 0;
        g.save(); g.translate(shake, 0);
        g.textBaseline = 'middle';
        if (errT > 0.35 && input.length === 0) {
          g.font = F(28); g.textAlign = 'center';
          glowText(g, UP('game.fix_o2.wrong'), LX + LW / 2, LY + LH / 2 + 1, '#ff5a6a', 12, LW - 30);
        } else if (solved) {
          g.font = F(28); g.textAlign = 'center';
          glowText(g, UP('game.fix_o2.ok'), LX + LW / 2, LY + LH / 2 + 1, '#7dffb0', 12, LW - 30);
        } else {
          g.font = F(40);
          for (let i = 0; i < 5; i++) {
            const cx = LX + 46 + i * 62, cy = LY + LH / 2;
            if (i < input.length) { g.textAlign = 'center'; glowText(g, input[i], cx, cy + 2, '#7dffcf', 10); }
            else {
              const cur = i === input.length && Math.sin(time * 7) > 0;
              g.fillStyle = cur ? '#7dffcf' : 'rgba(125,255,207,0.3)';
              g.fillRect(cx - 15, cy + 16, 30, 4);
            }
          }
        }
        g.restore();
        if (errT > 0) { g.globalAlpha = errT * 0.35; rr(g, LX, LY, LW, LH, 12); g.fillStyle = '#ff2a3d'; g.fill(); g.globalAlpha = 1; }
        if (okT > 0) { g.globalAlpha = 0.25; rr(g, LX, LY, LW, LH, 12); g.fillStyle = '#46ff9a'; g.fill(); g.globalAlpha = 1; }
        lcdGlass(g);
        for (let i = 0; i < 12; i++) drawKey(g, i);
        parts.draw(g);
        hint(g, AS.t('game.fix_o2.hint'), errT > 0 ? '#ff7d8b' : solved ? '#7dffb0' : null);
      },
      pointerDown(x, y, id) {
        if (solved) return;
        for (let i = 0; i < 12; i++) {
          const kx = keyX(i), ky = keyY(i);
          if (x >= kx - KG / 2 && x <= kx + KW + KG / 2 && y >= ky - KG / 2 && y <= ky + KH + KG / 2) { hit(i); return; }
        }
      },
      pointerMove() {},
      pointerUp() {},
      keyDown(key) {
        if (solved) return;
        if (key.length === 1 && key >= '0' && key <= '9') { const d = key.charCodeAt(0) - 48; hit(d === 0 ? 10 : d - 1); }
        else if (key === 'Enter') hit(11);
        else if (key === 'Backspace') { if (input.length) { input = input.slice(0, -1); ctx.sfx('keypad'); } }
        else if (key === 'Delete') hit(9);
      },
      destroy() { if (solved) finish(); if (DBG.live === inst) DBG.live = null; },
      __test: {
        code: () => code,
        key: (lab) => { const i = LABELS.indexOf(lab); return [keyX(i) + KW / 2, keyY(i) + KH / 2]; },
        state: () => ({ solved, input }),
      },
    };
    DBG.live = inst;
    return inst;
  }

  // =====================================================================================
  // FIX REACTOR — two-person handprint scanner (never completes by itself)
  // =====================================================================================
  function reactorGame(ctx) {
    const W = ctx.w, H = ctx.h, rnd = ctx.rng, seed = seedOf(rnd);
    const hint = makeHint(W, 470);
    const myPanel = ctx.info && ctx.info.panelId;
    const PX = 150, PY = 116, PW = 300, PH = 278, PR = 34;
    const HX = 318, HY = 300, HS = 0.86; // hand origin (palm center) + scale
    const LX = 70, LY = 34, LW = 460, LH = 58;
    const downIds = [], inIds = [];
    let holding = false, time = 0, holdT = 0, scanY = 0, otherHeld = false, both = 0, sec = -1, timeText = '';
    const parts = Particles(90);
    let scanGrad = null;

    function inPad(x, y) { return x >= PX && x <= PX + PW && y >= PY && y <= PY + PH; }
    function setHold(h) {
      if (h === holding) return;
      holding = h;
      ctx.hold(h);
      if (h) { ctx.sfx('scan_beep'); ctx.loop('scan_loop'); parts.ring(HX, HY - 40, 120, 0.5, '#8ff3ff'); }
      else ctx.stopLoop('scan_loop');
    }
    function sync() { setHold(inIds.length > 0); }
    function removeId(arr, id) { const i = arr.indexOf(id); if (i >= 0) arr.splice(i, 1); }

    // hand silhouette: palm + 4 fingers + thumb (capsules), local coords around the palm center
    const FINGERS = [[-36, -48, 27, 84], [-8, -50, 28, 98], [20, -48, 27, 88], [46, -38, 23, 66]]; // x, base y, width, length
    function handParts(g, mode) {
      // mode 0: append all outlines into one path (for stroke/fill as union-ish)
      for (let i = 0; i < 4; i++) {
        const f = FINGERS[i];
        rr(g, f[0] - f[2] / 2, f[1] - f[3], f[2], f[3] + 30, f[2] / 2);
        if (mode === 1) g.stroke(); else g.fill();
      }
      g.save(); g.translate(-50, 12); g.rotate(-0.58);
      rr(g, -16, -70, 32, 86, 16);
      if (mode === 1) g.stroke(); else g.fill();
      g.restore();
      rr(g, -58, -60, 118, 120, 40);
      if (mode === 1) g.stroke(); else g.fill();
    }
    function paintHand(g, fill, line, lw, prints) {
      g.save(); g.translate(HX, HY); g.scale(HS, HS);
      g.lineJoin = 'round';
      g.lineWidth = lw * 2; g.strokeStyle = line; handParts(g, 1);
      g.fillStyle = fill; handParts(g, 0);
      g.restore();
      paintPrints(g, prints);
    }
    function paintPrints(g, col) {
      g.save(); g.translate(HX, HY); g.scale(HS, HS);
      g.strokeStyle = col; g.lineWidth = 2; g.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        const f = FINGERS[i], cx = f[0], cy = f[1] - f[3] + f[2] * 0.62;
        for (let k = 1; k <= 3; k++) { g.beginPath(); g.ellipse(cx, cy, k * 3.2, k * 4.2, 0, Math.PI * 1.1, Math.PI * 1.9 + 0.6); g.stroke(); }
      }
      g.beginPath(); g.moveTo(-40, -8); g.quadraticCurveTo(0, -30, 44, -14); g.stroke();
      g.beginPath(); g.moveTo(-34, 14); g.quadraticCurveTo(-4, -2, 40, 8); g.stroke();
      g.beginPath(); g.moveTo(-20, 52); g.quadraticCurveTo(-30, 10, -50, -14); g.stroke();
      g.restore();
    }
    const handIdle = layer(W, PX, PY, PW, PH, (c) => paintHand(c, '#173a63', '#8fd2ff', 3, 'rgba(140,210,255,0.55)'));
    const handLive = layer(W, PX, PY, PW, PH, (c) => paintHand(c, '#33c8f0', '#d6f6ff', 3.5, 'rgba(10,60,90,0.7)'));
    const handOk = layer(W, PX, PY, PW, PH, (c) => paintHand(c, '#2fd88a', '#c9ffe4', 3.5, 'rgba(10,80,50,0.7)'));

    const bg = layer(W, 0, 0, W, H, (c) => {
      const r = U.rng(seed);
      paintWall(c, W, H, true);
      paintDevice(c, 40, 12, W - 80, H - 24, 26, 'dark', r);
      paintScreen(c, LX, LY, LW, LH, 12, '#2a0b12', '#140409');
      // scanner housing
      rr(c, PX - 16, PY - 14, PW + 32, PH + 28, PR + 12); c.fillStyle = '#1a1e29'; c.fill(); c.lineWidth = 4; c.strokeStyle = OUT; c.stroke();
      rr(c, PX - 12, PY - 10, PW + 24, PH + 20, PR + 9); c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,0.12)'; c.stroke();
      hazard(c, PX - 10, PY + PH + 18 - 4, PW + 20, 12, 5);
      const pad = c.createLinearGradient(0, PY, 0, PY + PH);
      pad.addColorStop(0, '#0f2440'); pad.addColorStop(1, '#081426');
      rr(c, PX, PY, PW, PH, PR); c.fillStyle = pad; c.fill();
      c.save(); rr(c, PX, PY, PW, PH, PR); c.clip();
      c.strokeStyle = 'rgba(100,200,255,0.12)'; c.lineWidth = 1;
      for (let x = PX + 15; x < PX + PW; x += 20) { c.beginPath(); c.moveTo(x, PY); c.lineTo(x, PY + PH); c.stroke(); }
      for (let y = PY + 14; y < PY + PH; y += 20) { c.beginPath(); c.moveTo(PX, y); c.lineTo(PX + PW, y); c.stroke(); }
      c.restore();
      // corner brackets on the pad
      c.strokeStyle = 'rgba(140,220,255,0.55)'; c.lineWidth = 3; c.lineCap = 'round';
      const m = 16, L = 26;
      c.beginPath();
      c.moveTo(PX + m, PY + m + L); c.lineTo(PX + m, PY + m); c.lineTo(PX + m + L, PY + m);
      c.moveTo(PX + PW - m - L, PY + m); c.lineTo(PX + PW - m, PY + m); c.lineTo(PX + PW - m, PY + m + L);
      c.moveTo(PX + m, PY + PH - m - L); c.lineTo(PX + m, PY + PH - m); c.lineTo(PX + m + L, PY + PH - m);
      c.moveTo(PX + PW - m - L, PY + PH - m); c.lineTo(PX + PW - m, PY + PH - m); c.lineTo(PX + PW - m, PY + PH - m - L);
      c.stroke();
      // lamp wells
      rr(c, 84, 424, 156, 36, 18); c.fillStyle = 'rgba(0,0,0,0.4)'; c.fill();
      rr(c, W - 240, 424, 156, 36, 18); c.fill();
      rr(c, 256, 420, 88, 44, 12); c.fillStyle = '#16060b'; c.fill(); c.lineWidth = 3; c.strokeStyle = OUT; c.stroke();
    });
    const lcdGlass = layer(W, LX - 4, LY - 4, LW + 8, LH + 8, (c) => paintGlass(c, LX, LY, LW, LH, 12));
    const padGlass = layer(W, PX - 2, PY - 2, PW + 4, PH + 4, (c) => paintGlass(c, PX, PY, PW, PH, PR, false));

    const inst = {
      update(dt) {
        time += dt;
        const s = ctx.getState && ctx.getState();
        const pans = s && s.sabotage && s.sabotage.panels;
        otherHeld = false;
        if (pans) for (const k in pans) if (k !== myPanel && pans[k] && pans[k].held) otherHeld = true;
        holdT = holding ? holdT + dt : 0;
        both += ((holding && otherHeld ? 1 : 0) - both) * Math.min(1, dt * 8);
        scanY = (Math.sin(time * 3.2) * 0.5 + 0.5);
        if (holding && Math.random() < dt * 22) {
          const p = parts.spawn(PK.DOT, PX + 30 + Math.random() * (PW - 60), PY + PH - 20, (Math.random() - 0.5) * 20, -60 - Math.random() * 80, 1.0, 2.2, both > 0.5 ? '#9dffc8' : '#9ff0ff');
          p.drag = 0.5;
        }
        parts.update(dt);
      },
      draw(g) {
        // alarm wash
        const alarm = 0.5 + 0.5 * Math.sin(time * 5.5);
        bg(g);
        g.globalAlpha = 0.12 + alarm * 0.22; g.fillStyle = '#ff1f3d';
        g.fillRect(0, 0, 40, H); g.fillRect(W - 40, 0, 40, H); g.fillRect(40, 0, W - 80, 12); g.fillRect(40, H - 12, W - 80, 12);
        g.globalAlpha = 1;
        glow(g, LX + LW / 2, LY + LH / 2, 260, '255,40,70', 0.08 + alarm * 0.1);
        const live = holding, ok = both > 0.5;
        const rgb = ok ? '70,255,154' : live ? '63,224,255' : '120,170,255';
        // pad contents
        g.save(); rr(g, PX, PY, PW, PH, PR); g.clip();
        if (live) glow(g, HX - 10, HY - 40, 220, rgb, 0.35);
        const idleA = 0.55 + 0.25 * Math.sin(time * 3);
        g.globalAlpha = live ? 1 : idleA;
        (ok ? handOk : live ? handLive : handIdle)(g);
        g.globalAlpha = 1;
        if (live) {
          if (!scanGrad) {
            scanGrad = g.createLinearGradient(0, -34, 0, 34);
            scanGrad.addColorStop(0, 'rgba(160,255,255,0)'); scanGrad.addColorStop(0.5, 'rgba(200,255,255,0.55)'); scanGrad.addColorStop(1, 'rgba(160,255,255,0)');
          }
          const y = PY + 12 + scanY * (PH - 24);
          g.save(); g.translate(0, y); g.fillStyle = scanGrad; g.fillRect(PX, -34, PW, 68); g.restore();
          g.fillStyle = ok ? '#b8ffdc' : '#d8ffff'; g.fillRect(PX, y - 1.5, PW, 3);
          glow(g, PX + PW / 2, y, 140, rgb, 0.25);
        }
        g.restore();
        padGlass(g);
        // pad rim glow
        rr(g, PX - 3, PY - 3, PW + 6, PH + 6, PR + 3);
        g.lineWidth = 4; g.strokeStyle = ok ? '#46ff9a' : live ? '#3fe0ff' : 'rgba(120,170,255,0.45)';
        g.globalAlpha = live ? 1 : 0.6 + 0.4 * idleA; g.stroke(); g.globalAlpha = 1;
        parts.draw(g);
        // status LCD
        const key = !live ? 'game.fix_reactor.idle' : ok ? 'game.fix_reactor.hold' : 'game.fix_reactor.waiting';
        const col = !live ? '#ff8a96' : ok ? '#7dffb0' : '#ffd27a';
        g.font = F(ok ? 30 : 22); g.textAlign = 'center'; g.textBaseline = 'middle';
        const pulse = ok ? 1 : 0.75 + 0.25 * Math.sin(time * (live ? 6 : 3));
        g.globalAlpha = pulse;
        glowText(g, live && !ok ? AS.t(key) : UP(key), LX + LW / 2, LY + LH / 2 + 1, col, 10, LW - 34);
        g.globalAlpha = 1;
        lcdGlass(g);
        // lamps: you / other panel + meltdown timer
        const s = ctx.getState && ctx.getState();
        const sab = s && s.sabotage;
        const tm = sab && sab.kind === 'reactor' && sab.timer != null ? sab.timer : null;
        lamp(g, 106, 442, live, UP('game.fix_reactor.you'));
        lamp(g, W - 218, 442, otherHeld, UP('game.fix_reactor.other'));
        const sc = tm == null ? -1 : Math.ceil(tm);
        if (sc !== sec) { sec = sc; timeText = sc < 0 ? '--:--' : U.formatTime(sc); }
        g.font = F(11); g.textAlign = 'center'; g.fillStyle = 'rgba(255,140,150,0.8)';
        g.fillText(UP('game.fix_reactor.meltdown'), W / 2, 430, 80);
        g.font = F(24);
        const urgent = tm != null && tm < 10;
        g.globalAlpha = urgent ? 0.55 + 0.45 * Math.sin(time * 12) : 1;
        g.shadowColor = '#ff3b4e'; g.shadowBlur = 10; g.fillStyle = '#ff5a6a';
        monoText(g, timeText, W / 2, 449, 15, 0.5);
        g.shadowBlur = 0; g.shadowColor = 'rgba(0,0,0,0)'; g.globalAlpha = 1;
        hint(g, AS.t('game.fix_reactor.hint'));
      },
      pointerDown(x, y, id) {
        if (downIds.indexOf(id) < 0) downIds.push(id);
        if (inPad(x, y) && inIds.indexOf(id) < 0) inIds.push(id);
        sync();
      },
      pointerMove(x, y, id) {
        if (downIds.indexOf(id) < 0) return;
        const inside = inPad(x, y), idx = inIds.indexOf(id);
        if (inside && idx < 0) inIds.push(id);
        else if (!inside && idx >= 0) inIds.splice(idx, 1);
        else return;
        sync();
      },
      pointerUp(x, y, id) {
        removeId(downIds, id); removeId(inIds, id);
        sync();
      },
      destroy() {
        // the host sends {fixPanel, holding:false} for reactor panels on close; just silence the loop
        downIds.length = 0; inIds.length = 0;
        if (holding) { holding = false; ctx.stopLoop('scan_loop'); }
        if (DBG.live === inst) DBG.live = null;
      },
      __test: {
        pad: () => [PX + PW / 2, PY + PH / 2],
        state: () => ({ holding, otherHeld }),
      },
    };
    function lamp(g, x, y, on, label) {
      g.beginPath(); g.arc(x + 14, y, 10, 0, TAU); g.fillStyle = on ? '#46ff9a' : '#5a1a24'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = OUT; g.stroke();
      if (on) glow(g, x + 14, y, 30, '70,255,154', 0.8);
      g.font = F(16); g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = on ? '#c9ffe4' : 'rgba(220,200,210,0.7)';
      g.fillText(label, x + 32, y + 1, 104);
    }
    DBG.live = inst;
    return inst;
  }

  AS.Tasks.register('fix_lights', lightsGame, { w: 680, h: 480 });
  AS.Tasks.register('fix_comms', commsGame, { w: 720, h: 470 });
  AS.Tasks.register('fix_o2', o2Game, { w: 680, h: 500 });
  AS.Tasks.register('fix_reactor', reactorGame, { w: 600, h: 520 });
})(globalThis.AS = globalThis.AS || {});
