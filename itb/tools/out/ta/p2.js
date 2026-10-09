  // =================================================================== WIRES
  reg('wires', 620, 560, function (ctx, W, H) {
    const rng = ctx.rng;
    const fin = finisher(ctx);
    const parts = new Particles(160);
    const COLORS = ['#f0323c', '#2f6bff', '#ffd23f', '#ff4fd8'];
    const ROWS = [94, 200, 307, 414];
    const FACE = { x: 28, y: 26, w: 564, h: 456 };
    const SLOT_L = 50, PLUG_X = 128, SOCK_X = 512, SLOT_R = 570, SNAP = 44;

    const leftOrder = U.shuffle(rng, [0, 1, 2, 3]);
    let rightOrder = U.shuffle(rng, [0, 1, 2, 3]);
    for (let n = 0; n < 8 && rightOrder.every((c, i) => c === leftOrder[i]); n++) rightOrder = U.shuffle(rng, [0, 1, 2, 3]);
    const sockRow = []; // color -> row index on the right
    rightOrder.forEach((c, i) => { sockRow[c] = i; });

    const wires = leftOrder.map((c, i) => ({
      color: c, row: i, y: ROWS[i], ex: PLUG_X, ey: ROWS[i], state: 0, pid: null,
      fromX: 0, fromY: 0, t: 0, conn: false, flash: 0, wob: rng() * TAU,
    }));
    const sockets = rightOrder.map((c, i) => ({ color: c, y: ROWS[i], used: false, bad: 0, glow: 0 }));
    let hover = -1, time = 0, connected = 0;

    function symbol(g, idx, x, y, r) {
      g.beginPath();
      if (idx === 0) { g.moveTo(x, y - r); g.lineTo(x + r * 0.95, y + r * 0.75); g.lineTo(x - r * 0.95, y + r * 0.75); g.closePath(); }
      else if (idx === 1) { g.rect(x - r * 0.78, y - r * 0.78, r * 1.56, r * 1.56); }
      else if (idx === 2) { g.arc(x, y, r * 0.85, 0, TAU); }
      else { g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath(); }
      g.lineWidth = 3; g.strokeStyle = 'rgba(16,19,31,0.85)'; g.stroke();
      g.fillStyle = '#ffffff'; g.fill();
    }

    const bg = layer(W, H, (g) => {
      backdrop(g, W, H);
      const f = device(g, 12, 10, 596, 488, { r: 28, bezel: 16 });
      g.save(); rr(g, f.x, f.y, f.w, f.h, f.r); g.clip();
      hazard(g, f.x, f.y, f.w, 14, 14);
      hazard(g, f.x, f.y + f.h - 14, f.w, 14, 14);
      g.restore();
      // middle cavity with grid
      well(g, 108, 50, 404, 408, 16, '#121625');
      g.save(); rr(g, 108, 50, 404, 408, 16); g.clip();
      g.strokeStyle = 'rgba(120,140,220,0.07)'; g.lineWidth = 1;
      for (let x = 108; x < 512; x += 24) { g.beginPath(); g.moveTo(x, 50); g.lineTo(x, 458); g.stroke(); }
      for (let y = 50; y < 458; y += 24) { g.beginPath(); g.moveTo(108, y); g.lineTo(512, y); g.stroke(); }
      g.fillStyle = rad(g, 310, 254, 40, 260, [0, 'rgba(63,224,255,0.05)', 1, 'rgba(0,0,0,0.35)']);
      g.fillRect(108, 50, 404, 408);
      g.restore();
      // terminal blocks
      for (const bx of [FACE.x + 4, 534]) {
        const bw = 54;
        rr(g, bx - 2, 44, bw + 4, 420, 12); g.fillStyle = C.outline; g.fill();
        rr(g, bx, 46, bw, 416, 10);
        g.fillStyle = lin(g, bx, 0, bx + bw, 0, [0, '#59617c', 0.3, '#8f98b3', 0.7, '#6f7894', 1, '#4a5168']);
        g.fill();
        screw(g, bx + bw / 2, 60, 6, 0.4);
        screw(g, bx + bw / 2, 448, 6, 1.9);
        for (const y of ROWS) {
          rr(g, bx + 9, y - 20, bw - 18, 40, 8); g.fillStyle = '#0c0f19'; g.fill();
          g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,0.25)'; g.stroke();
        }
      }
      // right stubs + sockets (static)
      for (const s of sockets) {
        const col = COLORS[s.color], y = s.y;
        g.lineCap = 'round';
        g.lineWidth = 24; g.strokeStyle = C.outline; g.beginPath(); g.moveTo(SOCK_X + 16, y); g.lineTo(SLOT_R + 4, y); g.stroke();
        g.lineWidth = 16; g.strokeStyle = col; g.beginPath(); g.moveTo(SOCK_X + 16, y); g.lineTo(SLOT_R + 4, y); g.stroke();
        g.lineWidth = 4; g.strokeStyle = rgba('#ffffff', 0.45); g.beginPath(); g.moveTo(SOCK_X + 18, y - 4); g.lineTo(SLOT_R, y - 4); g.stroke();
        rr(g, SOCK_X - 24, y - 25, 46, 50, 11); g.fillStyle = C.outline; g.fill();
        rr(g, SOCK_X - 21, y - 22, 40, 44, 9);
        g.fillStyle = lin(g, 0, y - 22, 0, y + 22, [0, shadeHex(col, 0.25), 1, shadeHex(col, -0.35)]); g.fill();
        rr(g, SOCK_X - 14, y - 12, 18, 24, 5); g.fillStyle = '#07080d'; g.fill();
        g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(SOCK_X - 18, y - 19, 34, 4);
        symbol(g, s.color, SOCK_X + 10, y - 31, 7);
      }
    });

    function wirePath(g, w) {
      const x1 = SLOT_L, y1 = w.y, ax = PLUG_X - 40;
      const x2 = w.ex - 30, y2 = w.ey;
      const d = Math.max(36, Math.abs(x2 - ax) * 0.45);
      g.beginPath();
      g.moveTo(x1, y1); g.lineTo(ax, y1);
      g.bezierCurveTo(ax + d, y1, x2 - d, y2, x2, y2);
      g.lineTo(w.ex - 20, y2);
    }
    function drawWire(g, w) {
      const col = COLORS[w.color];
      g.lineCap = 'round'; g.lineJoin = 'round';
      wirePath(g, w);
      g.lineWidth = 24; g.strokeStyle = C.outline; g.stroke();
      g.lineWidth = 16; g.strokeStyle = col; g.stroke();
      g.save(); g.translate(0, -4); wirePath(g, w);
      g.lineWidth = 4; g.strokeStyle = rgba('#ffffff', 0.45); g.stroke();
      g.restore();
      // travelling energy pulse after connection
      if (w.conn && w.t < 0.7) {
        const u = w.t / 0.7;
        const ax = PLUG_X - 40, x2 = w.ex - 30, d = Math.max(36, Math.abs(x2 - ax) * 0.45);
        const m = 1 - u;
        const px = m * m * m * ax + 3 * m * m * u * (ax + d) + 3 * m * u * u * (x2 - d) + u * u * u * x2;
        const py = m * m * m * w.y + 3 * m * m * u * w.y + 3 * m * u * u * w.ey + u * u * u * w.ey;
        glow(g, px, py, 34, col, 1);
        glow(g, px, py, 16, '#ffffff', 0.9);
      }
    }
    function drawPlug(g, w, scale) {
      const col = COLORS[w.color], x = w.ex, y = w.ey;
      g.save(); g.translate(x, y); g.scale(scale, scale);
      if (!w.conn) { // metal pin
        rr(g, -12, -8, 22, 16, 4); g.fillStyle = C.outline; g.fill();
        rr(g, -10, -6, 18, 12, 3); g.fillStyle = lin(g, 0, -6, 0, 6, [0, '#fff1c4', 0.5, '#d9a441', 1, '#8a5a1c']); g.fill();
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(-4, -6, 2, 12); g.fillRect(2, -6, 2, 12);
      }
      rr(g, -40, -17, 32, 34, 8); g.fillStyle = C.outline; g.fill();
      rr(g, -37, -14, 26, 28, 6); g.fillStyle = lin(g, 0, -14, 0, 14, [0, shadeHex(col, 0.3), 0.55, col, 1, shadeHex(col, -0.4)]); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(-33, -11, 18, 4);
      g.restore();
      symbol(g, w.color, x - 24 * scale, y + 1, 6 * scale);
    }

    function nearestWire(x, y) {
      let best = -1, bd = 48 * 48;
      for (let i = 0; i < wires.length; i++) {
        const w = wires[i];
        if (w.conn || w.state === 1) continue;
        const d = U.dist2(x, y, w.ex - 18, w.ey);
        if (d < bd) { bd = d; best = i; }
        if (x < PLUG_X - 10 && Math.abs(y - w.y) < 34 && x > FACE.x) { best = i; break; }
      }
      return best;
    }
    function snapSocket(x, y) {
      let best = null, bd = SNAP * SNAP;
      for (const s of sockets) {
        if (s.used) continue;
        const d = U.dist2(x, y, SOCK_X - 6, s.y);
        if (d < bd) { bd = d; best = s; }
      }
      return best;
    }
    function moveEnd(w, x, y) {
      w.ex = U.clamp(x, 70, SOCK_X - 6); w.ey = U.clamp(y, 54, 454);
      const s = snapSocket(w.ex, w.ey);
      if (s) { w.ex = SOCK_X - 10; w.ey = s.y; }
    }

    const inst = {
      update(dt) {
        time += dt;
        parts.update(dt);
        for (const w of wires) {
          w.t += dt;
          if (w.state === 2) {
            const k = E.outBack(w.t / 0.32);
            w.ex = U.lerp(w.fromX, PLUG_X, k); w.ey = U.lerp(w.fromY, w.y, k);
            if (w.t >= 0.32) { w.state = 0; w.ex = PLUG_X; w.ey = w.y; }
          }
          w.flash = Math.max(0, w.flash - dt * 2.2);
        }
        for (const s of sockets) { s.bad = Math.max(0, s.bad - dt * 2.5); s.glow = U.approach(s.glow, s.used ? 1 : 0, dt * 3); }
        fin.update(dt);
      },
      draw(g) {
        bg(g);
        // socket glow + LEDs
        for (const s of sockets) {
          const col = COLORS[s.color];
          if (s.glow > 0) {
            glow(g, SOCK_X - 2, s.y, 70, col, 0.55 * s.glow);
            rr(g, SOCK_X - 14, s.y - 12, 18, 24, 5);
            g.fillStyle = rgba(shadeHex(col, 0.55), s.glow); g.fill();
          }
          if (s.bad > 0) glow(g, SOCK_X - 2, s.y, 60, C.red, s.bad);
          led(g, 561, s.y - 34, 6, s.used ? C.green : col, s.used ? 1 : 0.12 + 0.1 * Math.sin(time * 3 + s.y));
        }
        // idle wires first, dragged ones on top
        for (let pass = 0; pass < 2; pass++) {
          for (let i = 0; i < wires.length; i++) {
            const w = wires[i];
            if ((w.state === 1) !== (pass === 1)) continue;
            drawWire(g, w);
            let sc = 1;
            if (w.state === 1) sc = 1.12;
            else if (!w.conn && i === hover) sc = 1.08;
            else if (!w.conn) sc = 1 + 0.03 * Math.sin(time * 4 + w.wob);
            drawPlug(g, w, sc);
            if (w.conn && w.flash > 0) {
              g.save(); g.globalAlpha = w.flash;
              g.beginPath(); g.arc(SOCK_X - 6, w.ey, 26 + (1 - w.flash) * 34, 0, TAU);
              g.lineWidth = 5 * w.flash + 1; g.strokeStyle = '#fff6c8'; g.stroke();
              g.restore();
            }
          }
        }
        parts.draw(g);
        hint(g, W, H, ctx.t('game.wires.hint'));
      },
      pointerDown(x, y, id) {
        if (fin.done) return;
        const i = nearestWire(x, y);
        if (i < 0) return;
        const w = wires[i];
        w.state = 1; w.pid = id; w.t = 0;
        moveEnd(w, x + 20, y);
        sfx(ctx, 'click');
      },
      pointerMove(x, y, id) {
        let dragging = false;
        for (const w of wires) if (w.state === 1 && w.pid === id) { moveEnd(w, x + 20, y); dragging = true; }
        if (!dragging) hover = fin.done ? -1 : nearestWire(x, y);
      },
      pointerUp(x, y, id) {
        for (const w of wires) {
          if (w.state !== 1 || w.pid !== id) continue;
          moveEnd(w, x + 20, y);
          w.pid = null;
          const s = snapSocket(w.ex, w.ey);
          if (s && s.color === w.color) {
            s.used = true; w.conn = true; w.state = 3; w.t = 0; w.flash = 1;
            w.ex = SOCK_X - 10; w.ey = s.y;
            connected++;
            sfx(ctx, 'wire_connect');
            const col = COLORS[w.color];
            parts.burst(SOCK_X - 12, s.y, 16, '#ffe9a0', 140, 420, 0.5, 3.4, 0, 700, rng);
            parts.burst(SOCK_X - 12, s.y, 8, col, 90, 260, 0.45, 3, 0, 500, rng);
            parts.burst(SOCK_X - 12, s.y, 4, col, 10, 40, 0.5, 26, 1, 0, rng);
            if (connected === wires.length) fin.trigger(0.6);
          } else {
            if (s) { s.bad = 1; sfx(ctx, 'error'); }
            w.state = 2; w.t = 0; w.fromX = w.ex; w.fromY = w.ey;
          }
        }
      },
      destroy() { parts.clear(); },
      __test: {
        // logical coordinates of each wire's plug and its matching socket (for automated drags)
        plan: () => wires.map((w) => ({ from: [w.ex - 18, w.ey], to: [SOCK_X - 26, ROWS[sockRow[w.color]]] })),
        connected: () => connected,
      },
    };
    return inst;
  });

  /*@@GAMES@@*/
