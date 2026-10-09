/* AI IMPOSTOR: SPACE SHIP — shared canvas art kit for the task and sabotage mini-games (tasks-c.js, sabotage.js).
 * Load after taskhost.js and before the files that use it. Everything is exposed on AS.TaskKit:
 *   const { rr, layer, paintDevice, Particles, finisher, ... } = AS.TaskKit;
 */
(function (AS) {
  'use strict';

  const TAU = Math.PI * 2;
  const OUT = '#10131f';
  const STACK = 'Fredoka, Nunito, "Segoe UI", sans-serif';
  const FC = [];
  const F = (px) => FC[px] || (FC[px] = '700 ' + px + 'px ' + STACK);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (dt, rate) => 1 - Math.exp(-dt * rate);
  const outCubic = (t) => { t = clamp(t, 0, 1); const u = 1 - t; return 1 - u * u * u; };
  const inOut = (t) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t, 0, 1));
  const outBack = (t) => { t = clamp(t, 0, 1); const u = t - 1; return 1 + 2.70158 * u * u * u + 1.70158 * u * u; };
  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };
  const NUM = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const NODASH = [];
  const seedOf = (rnd) => (rnd() * 4294967295) >>> 0;

  // Bumped whenever web fonts finish loading so cached layers containing text repaint.
  let fontVer = 0;
  try { if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => { fontVer++; }); } catch (e) { /* ignore */ }

  const upCache = {};
  function UP(key) {
    const lang = AS.i18n.getLang();
    const m = upCache[lang] || (upCache[lang] = {});
    return m[key] || (m[key] = AS.i18n.upper(AS.t(key)));
  }

  function rr(g, x, y, w, h, r) {
    if (r > w / 2) r = w / 2;
    if (r > h / 2) r = h / 2;
    g.beginPath();
    g.moveTo(x + r, y);
    g.lineTo(x + w - r, y); g.arcTo(x + w, y, x + w, y + r, r);
    g.lineTo(x + w, y + h - r); g.arcTo(x + w, y + h, x + w - r, y + h, r);
    g.lineTo(x + r, y + h); g.arcTo(x, y + h, x, y + h - r, r);
    g.lineTo(x, y + r); g.arcTo(x, y, x + r, y, r);
    g.closePath();
  }

  // Static art cached in an offscreen canvas at device scale (logical coords in `paint`).
  // Repainted on resize, font load or language change.
  function layer(CW, x, y, w, h, paint) {
    let cv = null, cs = 0, fv = -1, ln = '';
    return function (g) {
      const s = g.canvas.width / CW;
      if (!(s > 0)) return;
      const lang = AS.i18n.getLang();
      if (!cv || Math.abs(s - cs) > 1e-3 || fv !== fontVer || ln !== lang) {
        if (!cv) cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.ceil(w * s));
        cv.height = Math.max(1, Math.ceil(h * s));
        const c = cv.getContext('2d');
        c.setTransform(s, 0, 0, s, -x * s, -y * s);
        paint(c);
        cs = s; fv = fontVer; ln = lang;
      }
      g.drawImage(cv, x, y, cv.width / s, cv.height / s);
    };
  }

  // Additive glow sprites (one radial gradient per color, reused forever).
  const glowSpr = {};
  function glowSprite(rgb) {
    let c = glowSpr[rgb];
    if (!c) {
      c = document.createElement('canvas');
      c.width = c.height = 128;
      const x = c.getContext('2d');
      const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(' + rgb + ',1)');
      gr.addColorStop(0.2, 'rgba(' + rgb + ',0.62)');
      gr.addColorStop(0.5, 'rgba(' + rgb + ',0.18)');
      gr.addColorStop(1, 'rgba(' + rgb + ',0)');
      x.fillStyle = gr;
      x.fillRect(0, 0, 128, 128);
      glowSpr[rgb] = c;
    }
    return c;
  }
  function glow(g, x, y, r, rgb, a) {
    if (!(a > 0.004)) return;
    const pa = g.globalAlpha, pc = g.globalCompositeOperation;
    g.globalAlpha = pa * Math.min(1, a);
    g.globalCompositeOperation = 'lighter';
    g.drawImage(glowSprite(rgb), x - r, y - r, r * 2, r * 2);
    g.globalAlpha = pa;
    g.globalCompositeOperation = pc;
  }

  function hexRgb(h) { const v = parseInt(h.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
  function ramp(a, b, n) {
    const A = hexRgb(a), B = hexRgb(b), out = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      out.push('rgb(' + Math.round(A[0] + (B[0] - A[0]) * t) + ',' + Math.round(A[1] + (B[1] - A[1]) * t) + ',' + Math.round(A[2] + (B[2] - A[2]) * t) + ')');
    }
    return out;
  }
  function shade(hex, f) { // f<0 darker, f>0 lighter
    const c = hexRgb(hex);
    const m = (v) => Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f);
    return 'rgb(' + m(c[0]) + ',' + m(c[1]) + ',' + m(c[2]) + ')';
  }

  function screw(c, x, y, r, a) {
    c.beginPath(); c.arc(x, y + 1.5, r + 1.5, 0, TAU); c.fillStyle = 'rgba(0,0,0,0.35)'; c.fill();
    const gr = c.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, '#b9c3d1'); gr.addColorStop(1, '#5d6778');
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = gr; c.fill();
    c.lineWidth = 2; c.strokeStyle = OUT; c.stroke();
    c.save(); c.translate(x, y); c.rotate(a);
    c.lineCap = 'round'; c.strokeStyle = '#3a4252'; c.lineWidth = 2.2;
    c.beginPath(); c.moveTo(-r * 0.55, 0); c.lineTo(r * 0.55, 0); c.moveTo(0, -r * 0.55); c.lineTo(0, r * 0.55); c.stroke();
    c.restore();
  }

  const TONE = {
    steel: ['#e4eaf3', '#aab5c7', '#717d93', '#465066'],
    dark: ['#7d879b', '#535c71', '#343b4d', '#21273a'],
    white: ['#ffffff', '#e3e9f2', '#b6c2d3', '#7f8da3'],
    olive: ['#b9c28f', '#8a955e', '#5e6842', '#3e472b'],
    amber: ['#ffe28f', '#f2b739', '#c7881c', '#8a5a10'],
    red: ['#c9707a', '#8e3a46', '#5e2230', '#3d1520'],
  };
  // Metal device housing with grain, sheen, double rim and four screws. `rim` = inner highlight alpha.
  function paintDevice(c, x, y, w, h, r, tone, rnd, rim) {
    const T = TONE[tone] || TONE.steel;
    rr(c, x + 2, y + 10, w, h, r); c.fillStyle = 'rgba(0,0,0,0.5)'; c.fill();
    const gr = c.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, T[0]); gr.addColorStop(0.06, T[1]); gr.addColorStop(0.86, T[2]); gr.addColorStop(1, T[3]);
    rr(c, x, y, w, h, r); c.fillStyle = gr; c.fill();
    c.save(); rr(c, x, y, w, h, r); c.clip();
    for (let i = 0; i < h; i += 2) {
      c.fillStyle = (rnd() < 0.5 ? 'rgba(255,255,255,' : 'rgba(0,0,0,') + (rnd() * 0.045).toFixed(3) + ')';
      c.fillRect(x, y + i, w, 1);
    }
    const sh = c.createLinearGradient(x, y, x + w * 0.7, y + h);
    sh.addColorStop(0, 'rgba(255,255,255,0.22)'); sh.addColorStop(0.32, 'rgba(255,255,255,0)');
    sh.addColorStop(0.7, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.14)');
    c.fillStyle = sh; c.fillRect(x, y, w, h);
    c.restore();
    rr(c, x, y, w, h, r); c.lineWidth = 4; c.strokeStyle = OUT; c.stroke();
    rr(c, x + 4, y + 4, w - 8, h - 8, Math.max(2, r - 4)); c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,' + (rim == null ? 0.45 : rim) + ')'; c.stroke();
    rr(c, x + 7, y + 7, w - 14, h - 14, Math.max(2, r - 7)); c.lineWidth = 1.5; c.strokeStyle = 'rgba(0,0,0,0.2)'; c.stroke();
    const k = Math.max(14.5, r * 0.56);
    screw(c, x + k, y + k, 7, rnd() * TAU); screw(c, x + w - k, y + k, 7, rnd() * TAU);
    screw(c, x + k, y + h - k, 7, rnd() * TAU); screw(c, x + w - k, y + h - k, 7, rnd() * TAU);
  }
  // Panel wall behind a device. `tint` = red emergency palette (sabotages).
  function paintWall(c, W, H, tint) {
    const g1 = c.createLinearGradient(0, 0, 0, H);
    g1.addColorStop(0, tint ? '#3a1d2e' : '#222c56'); g1.addColorStop(1, tint ? '#14080f' : '#0c1029');
    c.fillStyle = g1; c.fillRect(0, 0, W, H);
    c.lineWidth = 2;
    for (let y = 60; y < H; y += 120) {
      c.strokeStyle = 'rgba(0,0,0,0.45)'; c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.05)'; c.beginPath(); c.moveTo(0, y + 2); c.lineTo(W, y + 2); c.stroke();
    }
    const v = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.6)');
    c.fillStyle = v; c.fillRect(0, 0, W, H);
  }
  // Recessed screen/well: dark bezel lip + gradient face.
  function paintScreen(c, x, y, w, h, r, top, bot) {
    rr(c, x - 7, y - 7, w + 14, h + 14, r + 7); c.fillStyle = '#1b2030'; c.fill(); c.lineWidth = 3; c.strokeStyle = OUT; c.stroke();
    rr(c, x - 5, y - 5, w + 10, h + 10, r + 5); c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,255,255,0.12)'; c.stroke();
    const gr = c.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, top); gr.addColorStop(1, bot);
    rr(c, x, y, w, h, r); c.fillStyle = gr; c.fill();
  }
  // Glass overlay for a screen: scanlines, vignette, diagonal reflection, crisp edge.
  function paintGlass(c, x, y, w, h, r, scan) {
    c.save(); rr(c, x, y, w, h, r); c.clip();
    if (scan !== false) { c.fillStyle = 'rgba(0,0,0,0.13)'; for (let yy = y + 1; yy < y + h; yy += 3) c.fillRect(x, yy, w, 1); }
    const v = c.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.3, x + w / 2, y + h / 2, Math.hypot(w, h) * 0.56);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.5)');
    c.fillStyle = v; c.fillRect(x, y, w, h);
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + w * 0.42, y); c.lineTo(x + w * 0.2, y + h); c.lineTo(x, y + h); c.closePath();
    const rf = c.createLinearGradient(x, y, x + w * 0.35, y + h * 0.7);
    rf.addColorStop(0, 'rgba(255,255,255,0.11)'); rf.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = rf; c.fill();
    c.restore();
    rr(c, x, y, w, h, r); c.lineWidth = 3; c.strokeStyle = OUT; c.stroke();
    rr(c, x + 2.5, y + 2.5, w - 5, h - 5, Math.max(1, r - 2)); c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,255,255,0.1)'; c.stroke();
  }
  function nebula(c, x, y, r, rgb, a) {
    const gr = c.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(' + rgb + ',' + a + ')'); gr.addColorStop(1, 'rgba(' + rgb + ',0)');
    c.fillStyle = gr; c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function ledStatic(c, x, y, r, col) {
    c.beginPath(); c.arc(x, y, r + 2, 0, TAU); c.fillStyle = OUT; c.fill();
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = col; c.fill();
    c.beginPath(); c.arc(x - r * 0.3, y - r * 0.35, r * 0.35, 0, TAU); c.fillStyle = 'rgba(255,255,255,0.6)'; c.fill();
  }
  // Yellow/black warning stripes.
  function hazard(c, x, y, w, h, r) {
    c.save(); rr(c, x, y, w, h, r); c.clip();
    c.fillStyle = '#ffc928'; c.fillRect(x, y, w, h);
    c.fillStyle = '#1a1a22';
    for (let sx = x - h; sx < x + w + h; sx += 28) { c.beginPath(); c.moveTo(sx, y + h); c.lineTo(sx + h, y); c.lineTo(sx + h + 14, y); c.lineTo(sx + 14, y + h); c.closePath(); c.fill(); }
    c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(x, y, w, 3);
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x, y + h - 4, w, 4);
    c.restore();
    rr(c, x, y, w, h, r); c.lineWidth = 3; c.strokeStyle = OUT; c.stroke();
  }

  // One short instruction line on a pill at the bottom of the panel.
  function makeHint(W, y) {
    let last = null, tw = 0, fv = -1;
    return function (g, text, color) {
      g.font = F(19);
      if (text !== last || fv !== fontVer) { last = text; fv = fontVer; tw = Math.min(W - 40, g.measureText(text).width + 70); }
      const x = (W - tw) / 2, h = 34, cy = y + h / 2;
      rr(g, x, y + 3, tw, h, 17); g.fillStyle = 'rgba(0,0,0,0.4)'; g.fill();
      rr(g, x, y, tw, h, 17); g.fillStyle = 'rgba(9,13,32,0.92)'; g.fill();
      g.lineWidth = 2; g.strokeStyle = 'rgba(130,160,255,0.5)'; g.stroke();
      g.beginPath(); g.arc(x + 21, cy, 9, 0, TAU); g.fillStyle = color || '#3fe0ff'; g.fill();
      g.fillStyle = '#0a1024'; g.font = F(14); g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('i', x + 21, cy + 1);
      g.font = F(19); g.fillStyle = color || '#eef2ff';
      g.fillText(text, x + tw / 2 + 12, cy + 1, tw - 56);
    };
  }

  function glowText(g, s, x, y, color, blur, maxW) {
    g.shadowColor = color; g.shadowBlur = blur;
    g.fillStyle = color;
    if (maxW) g.fillText(s, x, y, maxW); else g.fillText(s, x, y);
    g.shadowBlur = 0; g.shadowColor = 'rgba(0,0,0,0)';
  }
  // Fixed-pitch digits (proportional fonts would jitter while counting). align 0=left 0.5=center 1=right
  function monoText(g, s, x, y, cell, align) {
    const n = s.length;
    let w = 0;
    for (let i = 0; i < n; i++) w += s[i] === ':' || s[i] === '.' ? cell * 0.5 : cell;
    let cx = x - w * align;
    g.textAlign = 'center';
    for (let i = 0; i < n; i++) {
      const cw = s[i] === ':' || s[i] === '.' ? cell * 0.5 : cell;
      g.fillText(s[i], cx + cw / 2, y);
      cx += cw;
    }
  }

  // Pooled particles — no allocation after construction.
  const PK = { DOT: 0, SPARK: 1, DROP: 2, PETAL: 3, STAR: 4, RING: 5 };
  function Particles(max) {
    const pool = [];
    for (let i = 0; i < max; i++) pool.push({ on: false, kind: 0, x: 0, y: 0, vx: 0, vy: 0, gr: 0, drag: 0, life: 0, max: 1, size: 1, color: '#fff', rot: 0, vr: 0, floor: 1e9 });
    let next = 0;
    const sys = {
      onFloor: null,
      spawn(kind, x, y, vx, vy, life, size, color) {
        let p = null;
        for (let i = 0; i < max; i++) {
          const q = pool[(next + i) % max];
          if (!q.on) { p = q; next = (next + i + 1) % max; break; }
        }
        if (!p) { p = pool[next]; next = (next + 1) % max; }
        p.on = true; p.kind = kind; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = p.max = life; p.size = size; p.color = color;
        p.gr = 0; p.drag = 0; p.rot = Math.random() * TAU; p.vr = 0; p.floor = 1e9;
        return p;
      },
      burst(kind, x, y, n, speed, life, size, color, grav) {
        for (let i = 0; i < n; i++) {
          const a = Math.random() * TAU, s = speed * (0.35 + Math.random() * 0.65);
          const p = sys.spawn(kind, x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.6 + Math.random() * 0.4), size * (0.6 + Math.random() * 0.6), color);
          p.gr = grav || 0; p.drag = 2.2; p.vr = (Math.random() - 0.5) * 10;
        }
      },
      ring(x, y, size, life, color) { sys.spawn(PK.RING, x, y, 0, 0, life, size, color); },
      update(dt) {
        for (let i = 0; i < max; i++) {
          const p = pool[i];
          if (!p.on) continue;
          p.life -= dt;
          if (p.life <= 0) { p.on = false; continue; }
          if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; }
          p.vy += p.gr * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
          if (p.y > p.floor) { p.on = false; if (sys.onFloor) sys.onFloor(p); }
        }
      },
      clear() { for (let i = 0; i < max; i++) pool[i].on = false; },
      draw(g) {
        const pa = g.globalAlpha;
        for (let i = 0; i < max; i++) {
          const p = pool[i];
          if (!p.on) continue;
          const k = p.life / p.max;
          g.globalAlpha = pa * (k < 0.4 ? k / 0.4 : 1);
          switch (p.kind) {
            case 0:
              g.fillStyle = p.color; g.beginPath(); g.arc(p.x, p.y, p.size * (0.35 + 0.65 * k), 0, TAU); g.fill();
              break;
            case 1:
              g.strokeStyle = p.color; g.lineWidth = p.size; g.lineCap = 'round';
              g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035); g.stroke();
              break;
            case 2:
              g.fillStyle = p.color; g.beginPath();
              g.ellipse(p.x, p.y, p.size * 0.72, p.size * 1.3, Math.atan2(p.vy, p.vx) - Math.PI / 2, 0, TAU); g.fill();
              break;
            case 3:
              g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
              g.fillStyle = p.color; g.beginPath(); g.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, TAU); g.fill();
              g.restore();
              break;
            case 4: {
              const s = p.size * (0.5 + 0.5 * k);
              g.fillStyle = p.color; g.beginPath();
              g.moveTo(p.x, p.y - s); g.quadraticCurveTo(p.x, p.y, p.x + s, p.y); g.quadraticCurveTo(p.x, p.y, p.x, p.y + s);
              g.quadraticCurveTo(p.x, p.y, p.x - s, p.y); g.quadraticCurveTo(p.x, p.y, p.x, p.y - s); g.fill();
              break;
            }
            case 5:
              g.strokeStyle = p.color; g.lineWidth = 4 * k + 0.5;
              g.beginPath(); g.arc(p.x, p.y, 6 + p.size * (1 - k), 0, TAU); g.stroke();
              break;
          }
        }
        g.globalAlpha = pa;
      },
    };
    return sys;
  }

  // Completes exactly once, even if called from several paths. f.done() tells whether it already ran.
  function finisher(ctx) {
    let done = false;
    const f = () => { if (!done) { done = true; ctx.complete(); } };
    f.done = () => done;
    return f;
  }

  AS.TaskKit = {
    TAU, OUT, STACK, F, clamp, lerp, smooth, outCubic, inOut, outBack, angDiff, NUM, NODASH, seedOf,
    UP, rr, layer, glowSprite, glow, hexRgb, ramp, shade, screw, TONE,
    paintDevice, paintWall, paintScreen, paintGlass, nebula, ledStatic, hazard,
    makeHint, glowText, monoText, PK, Particles, finisher,
  };
})(globalThis.AS = globalThis.AS || {});
