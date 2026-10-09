  // Small star-naut fallback portrait (used when AS.Art is not loaded).
  function miniNaut(g, cx, cy, s, colorId) {
    const c = AS.COLOR_BY_ID[colorId] || AS.COLORS[0];
    g.save(); g.translate(cx, cy); g.scale(s / 100, s / 100);
    g.lineWidth = 7; g.strokeStyle = C.outline; g.lineCap = 'round';
    g.beginPath(); g.moveTo(10, -46); g.lineTo(18, -66); g.stroke();
    g.beginPath(); g.arc(19, -70, 8, 0, TAU); g.fillStyle = shadeHex(c.main, 0.45); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(0, 6, 44, 50, 0, 0, TAU);
    g.fillStyle = rad(g, -14, -12, 6, 60, [0, shadeHex(c.main, 0.25), 0.6, c.main, 1, c.shade]); g.fill(); g.stroke();
    rr(g, -30, -26, 58, 38, 19); g.fillStyle = '#1b2236'; g.fill(); g.stroke();
    g.fillStyle = '#9ff3ff';
    g.beginPath(); g.ellipse(-11, -8, 6, 8, 0, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(10, -8, 6, 8, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.beginPath(); g.ellipse(-18, -18, 7, 3.5, -0.4, 0, TAU); g.fill();
    g.restore();
  }
  function portraitInto(g, x, y, size, colorId, hat) {
    let done = false;
    if (AS.Art && AS.Art.portrait) {
      try {
        const p = AS.Art.portrait(colorId, hat || 'none', Math.round(size * 2), {});
        if (p && p.width) { g.drawImage(p, x, y, size, size); done = true; }
      } catch (e) { done = false; }
    }
    if (!done) miniNaut(g, x + size / 2, y + size * 0.6, size * 0.95, colorId);
  }

  // =================================================================== SWIPE CARD
  reg('swipe', 700, 520, function (ctx, W, H) {
    const rng = ctx.rng;
    const fin = finisher(ctx);
    const parts = new Particles(80);
    const CW = 170, CH = 108;
    const START = 72, END = 462, SLOT_Y = 112, LIP_Y = 190;
    const WAL = { x: 170, y: 292, w: 360, h: 172 };
    const IN_WALLET = { x: 352, y: 262, a: -0.07 };
    const MIN_T = 0.35, MAX_T = 1.3;

    const prof = (AS.App && AS.App.profile) || {};
    const colorId = prof.color || U.pick(rng, AS.COLORS).id;
    const hat = prof.hat || 'none';
    const name = (prof.name || U.pick(rng, AS.BOT_NAMES)).slice(0, 12);
    const idNo = U.randInt(rng, 1000, 9999) + '-' + U.randInt(rng, 10, 99);
    const accent = (AS.COLOR_BY_ID[colorId] || AS.COLORS[1]).main;

    let stage = 'wallet', st = 0, time = 0;
    let cx = IN_WALLET.x, cy = IN_WALLET.y, ca = IN_WALLET.a;
    let fromX = 0, fromY = 0, fromA = 0;
    let pid = null, grab = 0, tStart = -1, maxX = START, back = false;
    let msg = 'game.swipe.insert', msgCol = '#7dff9a', msgT = 0, ledR = 0, ledG = 0, wobble = 0;

    const card = layer(CW, CH, (g) => {
      rr(g, 1, 1, CW - 2, CH - 2, 10); g.fillStyle = C.outline; g.fill();
      rr(g, 3, 3, CW - 6, CH - 6, 8); g.fillStyle = lin(g, 0, 0, CW, CH, [0, '#ffffff', 1, '#d7e6f5']); g.fill();
      g.save(); rr(g, 3, 3, CW - 6, CH - 6, 8); g.clip();
      g.fillStyle = accent; g.fillRect(3, 3, CW - 6, 22);
      g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(3, 3, CW - 6, 6);
      g.fillStyle = 'rgba(80,110,170,0.10)';
      for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(150, 95, 18 + i * 14, 0, TAU); g.lineWidth = 4; g.strokeStyle = 'rgba(80,110,170,0.08)'; g.stroke(); }
      g.restore();
      otext(g, ctx.t('game.swipe.card'), 12, 15, fit(g, ctx.t('game.swipe.card'), 120, 14), '#ffffff', 'rgba(0,0,0,0.45)', 3, 'left');
      // star logo
      g.save(); g.translate(CW - 17, 14); g.fillStyle = C.yellow; g.strokeStyle = C.outline; g.lineWidth = 1.5;
      g.beginPath();
      for (let i = 0; i < 10; i++) { const r = i % 2 ? 3.4 : 8, a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      g.closePath(); g.fill(); g.stroke(); g.restore();
      rr(g, 10, 31, 52, 52, 7); g.fillStyle = '#aeb9cf'; g.fill();
      g.save(); rr(g, 10, 31, 52, 52, 7); g.clip();
      g.fillStyle = lin(g, 0, 31, 0, 83, [0, '#cfe3ff', 1, '#8fa6cc']); g.fillRect(10, 31, 52, 52);
      portraitInto(g, 8, 33, 56, colorId, hat);
      g.restore();
      rr(g, 10, 31, 52, 52, 7); g.lineWidth = 2; g.strokeStyle = 'rgba(16,19,31,0.6)'; g.stroke();
      text(g, name, 70, 41, fit(g, name, 92, 16), '#1d2540', 'left');
      text(g, ctx.t('game.swipe.crew'), 70, 58, fit(g, ctx.t('game.swipe.crew'), 92, 11, 600), '#5a6787', 'left', 'middle', 600);
      text(g, '№ ' + idNo, 70, 73, 11, '#5a6787', 'left', 'middle', 600);
      g.fillStyle = '#1d2540';
      let bx = 12;
      for (let i = 0; bx < CW - 14; i++) { const bw = 1 + ((i * 7 + idNo.charCodeAt(i % idNo.length)) % 3); g.fillRect(bx, 89, bw, 12); bx += bw + 2; }
      rr(g, 120, 86, 36, 16, 3); g.fillStyle = lin(g, 0, 86, 0, 102, [0, '#ffe58a', 1, '#c9962c']); g.fill();
    });

    const bg = layer(W, H, (g) => {
      backdrop(g, W, H);
      const f = device(g, 30, 14, 640, 238, { r: 26, bezel: 16 });
      screenBox(g, 72, 40, 392, 52, 10, '#34e07c');
      // speaker grille
      for (let i = 0; i < 5; i++) { rr(g, 592 + i * 11, 48, 5, 36, 3); g.fillStyle = '#151a28'; g.fill(); }
      well(g, f.x + 10, 104, f.w - 20, 120, 12, '#0b0e18');
      g.save(); rr(g, f.x + 10, 104, f.w - 20, 120, 12); g.clip();
      g.fillStyle = 'rgba(63,224,255,0.06)'; g.fillRect(f.x + 10, 104, f.w - 20, 120);
      g.strokeStyle = 'rgba(255,255,255,0.05)';
      for (let x = f.x + 20; x < f.x + f.w - 10; x += 22) { g.beginPath(); g.moveTo(x, 104); g.lineTo(x, 224); g.stroke(); }
      g.restore();
      // wallet back (open bifold)
      g.save();
      g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 18; g.shadowOffsetY = 8;
      rr(g, WAL.x, WAL.y, WAL.w, WAL.h, 18); g.fillStyle = '#2a170c'; g.fill();
      g.restore();
      rr(g, WAL.x, WAL.y, WAL.w, WAL.h, 18); g.fillStyle = C.outline; g.fill();
      rr(g, WAL.x + 3, WAL.y + 3, WAL.w - 6, WAL.h - 6, 15);
      g.fillStyle = lin(g, 0, WAL.y, 0, WAL.y + WAL.h, [0, '#9a6136', 1, '#5e3519']); g.fill();
      g.setLineDash([7, 5]); g.lineWidth = 2; g.strokeStyle = 'rgba(255,214,160,0.55)';
      rr(g, WAL.x + 11, WAL.y + 11, WAL.w - 22, WAL.h - 22, 10); g.stroke();
      g.setLineDash([]);
      g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(WAL.x + WAL.w / 2 - 3, WAL.y + 4, 6, WAL.h - 8);
      // left half: a bank card + bills peeking
      g.save(); g.translate(WAL.x + 40, WAL.y - 12); g.rotate(0.05);
      rr(g, 0, 0, 120, 70, 8); g.fillStyle = '#6dd39a'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = C.outline; g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(8, 10, 104, 6);
      g.restore();
      g.save(); g.translate(WAL.x + 26, WAL.y + 6); g.rotate(-0.04);
      rr(g, 0, 0, 132, 66, 8); g.fillStyle = '#ff9a3c'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = C.outline; g.stroke();
      rr(g, 12, 16, 22, 16, 3); g.fillStyle = '#ffe58a'; g.fill();
      g.restore();
    });
    const front = layer(W, H, (g) => {
      // reader front lip
      rr(g, 44, LIP_Y - 3, 612, 50, 10); g.fillStyle = C.outline; g.fill();
      rr(g, 47, LIP_Y, 606, 44, 8);
      g.fillStyle = lin(g, 0, LIP_Y, 0, LIP_Y + 44, [0, '#c5cde0', 0.15, '#8d96b0', 1, '#545c75']); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(52, LIP_Y + 3, 596, 2);
      rr(g, 300, LIP_Y + 12, 100, 18, 9); g.fillStyle = '#2b3145'; g.fill();
      for (let i = 0; i < 3; i++) { g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(318 + i * 24, LIP_Y + 18, 14, 6); }
      screw(g, 70, LIP_Y + 22, 6, 0.3); screw(g, 630, LIP_Y + 22, 6, 1.4);
      // wallet front pocket (right half)
      const px = WAL.x + WAL.w / 2 + 6, py = WAL.y + 40, pw = WAL.w / 2 - 18, ph = WAL.h - 52;
      rr(g, px - 3, py - 3, pw + 6, ph + 6, 12); g.fillStyle = C.outline; g.fill();
      rr(g, px, py, pw, ph, 10); g.fillStyle = lin(g, 0, py, 0, py + ph, [0, '#a8703f', 1, '#6c3f1f']); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.16)'; g.fillRect(px + 6, py + 4, pw - 12, 3);
      g.setLineDash([6, 5]); g.lineWidth = 2; g.strokeStyle = 'rgba(255,214,160,0.55)';
      rr(g, px + 8, py + 10, pw - 16, ph - 18, 7); g.stroke(); g.setLineDash([]);
      // left half pocket
      const qx = WAL.x + 12, qw = WAL.w / 2 - 18;
      rr(g, qx - 3, py - 3, qw + 6, ph + 6, 12); g.fillStyle = C.outline; g.fill();
      rr(g, qx, py, qw, ph, 10); g.fillStyle = lin(g, 0, py, 0, py + ph, [0, '#a8703f', 1, '#6c3f1f']); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.16)'; g.fillRect(qx + 6, py + 4, qw - 12, 3);
      g.setLineDash([6, 5]); g.lineWidth = 2; g.strokeStyle = 'rgba(255,214,160,0.55)';
      rr(g, qx + 8, py + 10, qw - 16, ph - 18, 7); g.stroke(); g.setLineDash([]);
    });

    function say(key, col) { msg = key; msgCol = col; msgT = 0; }
    function drawCard(g) {
      g.save();
      g.translate(cx + CW / 2, cy + CH / 2); g.rotate(ca);
      g.translate(-CW / 2, -CH / 2);
      card(g);
      g.restore();
    }
    function lift() {
      if (stage !== 'wallet') return;
      stage = 'lift'; st = 0; fromX = cx; fromY = cy; fromA = ca;
      sfx(ctx, 'whoosh');
      say('game.swipe.swipe', '#7dff9a');
    }
    function startBack() {
      stage = 'back'; st = 0; fromX = cx; pid = null;
    }
    function judge() {
      const dur = ctx.now() - tStart;
      inst.__lastDur = dur;
      pid = null;
      if (back) { say('game.swipe.bad', '#ff6b6b'); }
      else if (dur < MIN_T) { say('game.swipe.fast', '#ff6b6b'); }
      else if (dur > MAX_T) { say('game.swipe.slow', '#ff6b6b'); }
      else {
        stage = 'ok'; st = 0; ledG = 1;
        say('game.swipe.ok', '#5dff8f');
        sfx(ctx, 'swipe_ok');
        parts.burst(END + CW - 10, SLOT_Y + 40, 14, C.green, 60, 220, 0.6, 3, 3, 0, rng);
        fin.trigger(0.9);
        return;
      }
      ledR = 1; wobble = 1;
      sfx(ctx, 'swipe_bad');
      startBack();
    }

    const inst = {
      update(dt) {
        time += dt; st += dt; msgT += dt;
        parts.update(dt);
        ledR = Math.max(0, ledR - dt * 1.2);
        wobble = Math.max(0, wobble - dt * 2.5);
        if (stage === 'wallet') {
          cy = IN_WALLET.y + Math.sin(time * 2.4) * 2.5;
        } else if (stage === 'lift') {
          const T1 = 0.42, T2 = 0.16;
          if (st < T1) {
            const k = E.inOut(st / T1);
            cx = U.lerp(fromX, START, k); cy = U.lerp(fromY, SLOT_Y - 40, k) - Math.sin(k * Math.PI) * 70; ca = U.lerp(fromA, 0, k) + Math.sin(k * Math.PI) * 0.25;
          } else {
            const k = E.outBack((st - T1) / T2);
            cx = START; ca = 0; cy = U.lerp(SLOT_Y - 40, SLOT_Y, k);
            if (st >= T1 + T2) { stage = 'ready'; cy = SLOT_Y; sfx(ctx, 'click'); }
          }
        } else if (stage === 'back') {
          const k = E.outCubic(st / 0.35);
          cx = U.lerp(fromX, START, k);
          if (st >= 0.35) { stage = 'ready'; cx = START; }
        }
        fin.update(dt);
      },
      draw(g) {
        bg(g);
        const inSlot = stage === 'ready' || stage === 'drag' || stage === 'back' || stage === 'ok' || (stage === 'lift' && st >= 0.42);
        if (inSlot) {
          // reader read-head glow while swiping
          if (stage === 'drag') glow(g, 350, LIP_Y - 4, 90, C.cyan, 0.35);
          drawCard(g);
        } else if (stage === 'wallet') drawCard(g);
        front(g);
        if (stage === 'lift' && st < 0.42) drawCard(g);
        // display text
        const blinkOn = msgCol === '#ff6b6b' ? (msgT > 1.2 || Math.floor(msgT * 6) % 2 === 0) : true;
        g.save();
        if (wobble > 0) g.translate(Math.sin(time * 70) * 4 * wobble, 0);
        if (blinkOn) gtext(g, ctx.t(msg), 268, 67, 22, msgCol, 360);
        g.restore();
        led(g, 500, 66, 8, C.red, Math.max(ledR, stage === 'drag' ? 0.25 : 0));
        led(g, 536, 66, 8, C.green, stage === 'ok' ? 0.7 + 0.3 * Math.sin(time * 10) : (stage === 'ready' ? 0.15 + 0.15 * Math.sin(time * 4) : 0));
        // arrow guide across the slot when ready
        if (stage === 'ready') {
          const a = 0.35 + 0.35 * Math.sin(time * 5);
          g.save(); g.globalAlpha = a;
          g.fillStyle = C.cyan;
          for (let i = 0; i < 3; i++) {
            const x = 330 + i * 34 + ((time * 40) % 34);
            g.beginPath(); g.moveTo(x, 132); g.lineTo(x + 16, 148); g.lineTo(x, 164); g.lineTo(x + 8, 148); g.closePath(); g.fill();
          }
          g.restore();
        }
        if (stage === 'wallet') {
          const a = 0.5 + 0.5 * Math.sin(time * 5);
          g.save(); g.globalAlpha = a;
          g.lineWidth = 3; g.strokeStyle = C.cyan;
          rr(g, cx - 6, cy - 6, CW + 12, 70, 12); g.stroke();
          g.restore();
        }
        parts.draw(g);
        hint(g, W, H, ctx.t(stage === 'wallet' || stage === 'lift' ? 'game.swipe.hint1' : 'game.swipe.hint2'));
      },
      pointerDown(x, y, id) {
        if (fin.done) return;
        if (stage === 'wallet') {
          if (inRect(x, y, WAL.x - 10, IN_WALLET.y - 20, WAL.w + 20, WAL.h + 60)) lift();
          return;
        }
        if (stage === 'ready' && pid === null && inRect(x, y, cx - 20, SLOT_Y - 30, CW + 40, 150)) {
          stage = 'drag'; pid = id; grab = x - cx; tStart = -1; maxX = cx; back = false;
          sfx(ctx, 'click');
        }
      },
      pointerMove(x, y, id) {
        if (stage !== 'drag' || id !== pid) return;
        const nx = U.clamp(x - grab, START, END);
        if (tStart < 0 && nx > START + 3) tStart = ctx.now();
        if (nx < maxX - 30) back = true;
        maxX = Math.max(maxX, nx);
        cx = nx;
        if (cx >= END) judge();
      },
      pointerUp(x, y, id) {
        if (stage !== 'drag' || id !== pid) return;
        inst.pointerMove(x, y, id); // the final position may arrive only with the release event
        if (stage !== 'drag') return;
        pid = null;
        if (tStart >= 0 && cx > START + 24) {
          say('game.swipe.bad', '#ff6b6b'); ledR = 1; wobble = 1; sfx(ctx, 'swipe_bad');
        }
        startBack();
      },
      keyDown(key) { if ((key === ' ' || key === 'Enter') && stage === 'wallet') lift(); },
      destroy() { parts.clear(); },
      __test: {
        plan: () => ({ card: [IN_WALLET.x + CW / 2, IN_WALLET.y + 30], start: [START + CW / 2, SLOT_Y + 40], end: [END + CW / 2 + 30, SLOT_Y + 40] }),
        stage: () => stage,
        last: () => ({ msg, dur: tStart >= 0 ? ctx.now() - tStart : -1 }),
      },
    };
    return inst;
  });

  /*@@GAMES@@*/
