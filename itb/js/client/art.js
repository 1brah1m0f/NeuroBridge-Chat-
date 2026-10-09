/* AI IMPOSTOR: SPACE SHIP — procedural "star-naut" characters (owner: art).
 * Round egg body, big dark visor with glowing eyes, antenna with a glowing bulb, jetpack, stubby legs, hats.
 * All drawing is in a local space: feet at (0,0), facing +x, ~72 units tall.
 */
(function (AS) {
  'use strict';
  if (AS.isNode) return;
  const OUT = '#10131f';
  const col = (id) => (AS.COLOR_BY_ID && AS.COLOR_BY_ID[id]) || { main: '#9fb0d6', shade: '#55607f' };

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function mix(hex, to, k) {
    const a = parseInt(hex.slice(1), 16), b = parseInt(to.slice(1), 16);
    const c = [16, 8, 0].map((s) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k));
    return 'rgb(' + c.join(',') + ')';
  }
  function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); }
  function ell(g, x, y, rx, ry, rot) { g.beginPath(); g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, Math.PI * 2); }
  function fs(g, fill, lw) { g.fillStyle = fill; g.fill(); if (lw) { g.lineWidth = lw; g.strokeStyle = OUT; g.stroke(); } }

  // body center (cx, cy) radius ~ 26x28
  const BY = -38, BRX = 25, BRY = 27;
  const HAT_ANCHOR = { x: 0, y: BY - BRY + 2, note: 'hat base sits on the top of the body circle (feet-relative, unscaled)' };

  function drawJetpack(g, c) {
    rr(g, -BRX - 9, BY - 16, 16, 30, 6); fs(g, c.shade, 3);
    rr(g, -BRX - 11, BY + 12, 8, 7, 2); fs(g, '#5a6178', 2.5);
    rr(g, -BRX - 1, BY + 12, 8, 7, 2); fs(g, '#5a6178', 2.5);
  }
  function drawLegs(g, c, t, moving) {
    const ph = moving ? Math.sin(t * 14) : 0;
    for (const [lx, s] of [[-10, 1], [8, -1]]) {
      const lift = moving ? Math.max(0, ph * s) * 5 : 0, sw = moving ? ph * s * 4 : 0;
      rr(g, lx - 7 + sw, -16 - lift, 14, 16, 5); fs(g, c.shade, 3);
    }
  }
  function drawBodyShape(g, c) {
    ell(g, 0, BY, BRX, BRY);
    const gr = g.createRadialGradient(-6, BY - 10, 4, 0, BY, BRY + 4);
    gr.addColorStop(0, mix(c.main, '#ffffff', 0.25)); gr.addColorStop(0.65, c.main); gr.addColorStop(1, c.shade);
    fs(g, gr, 3.5);
    // belly patch
    ell(g, -2, BY + 14, 13, 6); g.fillStyle = hexA('#ffffff', 0.12); g.fill();
  }
  function drawVisor(g, eyes, t, dead) {
    ell(g, 9, BY - 5, 15, 12.5);
    const vg = g.createLinearGradient(0, BY - 18, 0, BY + 8);
    vg.addColorStop(0, '#2a3456'); vg.addColorStop(1, '#0c1024');
    fs(g, vg, 3);
    // eyes
    const blink = !dead && eyes === 'normal' && (t % 4) < 0.12;
    g.save();
    g.shadowColor = '#7ff6ff'; g.shadowBlur = 6;
    g.strokeStyle = '#bffcff'; g.fillStyle = '#bffcff'; g.lineWidth = 2.6; g.lineCap = 'round';
    for (const ex of [4, 15]) {
      if (eyes === 'x' || dead) {
        g.beginPath(); g.moveTo(ex - 3, BY - 8); g.lineTo(ex + 3, BY - 2); g.moveTo(ex + 3, BY - 8); g.lineTo(ex - 3, BY - 2); g.stroke();
      } else if (eyes === 'happy') {
        g.beginPath(); g.arc(ex, BY - 3, 3.2, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
      } else if (eyes === 'sad') {
        g.beginPath(); g.arc(ex, BY - 7, 3.2, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
      } else if (blink) {
        g.beginPath(); g.moveTo(ex - 3, BY - 5); g.lineTo(ex + 3, BY - 5); g.stroke();
      } else { ell(g, ex, BY - 5, 2.8, 3.8); g.fill(); }
    }
    g.restore();
    // reflection
    g.beginPath(); g.ellipse(14, BY - 12, 5, 2.4, -0.4, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,.75)'; g.fill();
    if (dead) { g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(2, BY - 15); g.lineTo(8, BY - 6); g.lineTo(5, BY + 1); g.moveTo(8, BY - 6); g.lineTo(16, BY - 3); g.stroke(); }
  }
  function drawAntenna(g, c, t, bent) {
    g.strokeStyle = OUT; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-4, BY - BRY + 1);
    if (bent) g.quadraticCurveTo(-6, BY - BRY - 8, 4, BY - BRY - 8); else g.quadraticCurveTo(-7, BY - BRY - 7, -5, BY - BRY - 13);
    g.stroke();
    const bx = bent ? 6 : -5, by = bent ? BY - BRY - 8 : BY - BRY - 15;
    g.save(); g.shadowColor = c.main; g.shadowBlur = bent ? 0 : 8 + Math.sin(t * 4) * 3;
    ell(g, bx, by, 4.2, 4.2); fs(g, bent ? '#777' : mix(c.main, '#ffffff', 0.45), 2.2);
    g.restore();
  }

  // ---------------------------------------------------------------- hats (local coords; base at HAT_ANCHOR)
  const HY = BY - BRY + 3;
  const HATS = {
    party(g) { g.beginPath(); g.moveTo(-11, HY); g.lineTo(2, HY - 26); g.lineTo(13, HY); g.closePath(); fs(g, '#ff5fb7', 2.5); g.fillStyle = '#ffe14b'; for (const [x, y] of [[-3, -6], [4, -12], [1, -19]]) { ell(g, x, HY + y, 2.2, 2.2); g.fill(); } ell(g, 2, HY - 27, 3.5, 3.5); fs(g, '#ffe14b', 2); },
    crown(g) { g.beginPath(); g.moveTo(-13, HY); g.lineTo(-14, HY - 15); g.lineTo(-7, HY - 8); g.lineTo(0, HY - 18); g.lineTo(7, HY - 8); g.lineTo(14, HY - 15); g.lineTo(13, HY); g.closePath(); fs(g, '#ffd23f', 2.5); ell(g, 0, HY - 6, 2.5, 2.5); fs(g, '#e8343b'); },
    chef(g) { rr(g, -11, HY - 12, 22, 12, 2); fs(g, '#fff', 2.5); ell(g, -6, HY - 18, 8, 8); fs(g, '#fff', 2.5); ell(g, 6, HY - 18, 8, 8); fs(g, '#fff', 2.5); ell(g, 0, HY - 22, 8, 7); fs(g, '#fff', 2.5); },
    cowboy(g) { ell(g, 0, HY - 2, 24, 5); fs(g, '#8a5a2b', 2.5); rr(g, -11, HY - 17, 22, 15, 5); fs(g, '#9c6a35', 2.5); rr(g, -11, HY - 7, 22, 4, 1); fs(g, '#3b2412'); },
    tophat(g) { ell(g, 0, HY - 1, 19, 4.5); fs(g, '#20232e', 2.5); rr(g, -11, HY - 26, 22, 25, 2); fs(g, '#2b2f3d', 2.5); rr(g, -11, HY - 8, 22, 5, 0); fs(g, '#e8343b'); },
    beanie(g) { g.beginPath(); g.arc(0, HY + 2, 18, Math.PI, 0); g.closePath(); fs(g, '#2e9df2', 2.5); rr(g, -19, HY - 2, 38, 7, 3); fs(g, '#1a62a8', 2.5); ell(g, 0, HY - 17, 5, 5); fs(g, '#fff', 2); },
    headphones(g) { g.strokeStyle = OUT; g.lineWidth = 6; g.beginPath(); g.arc(0, BY - 4, 27, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); g.strokeStyle = '#5c6378'; g.lineWidth = 3; g.stroke(); rr(g, -31, BY - 16, 9, 18, 4); fs(g, '#e8343b', 2.5); rr(g, 22, BY - 16, 9, 18, 4); fs(g, '#e8343b', 2.5); },
    flower(g) { for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; ell(g, 8 + Math.cos(a) * 6, HY - 4 + Math.sin(a) * 6, 4.5, 4.5); fs(g, '#ff8fc8', 2); } ell(g, 8, HY - 4, 3.5, 3.5); fs(g, '#ffd23f', 2); },
    halo(g, t) { g.save(); g.shadowColor = '#fff6a0'; g.shadowBlur = 10; g.strokeStyle = '#ffe766'; g.lineWidth = 4; ell(g, 0, HY - 12 + Math.sin(t * 3) * 1.5, 15, 4.5); g.stroke(); g.restore(); },
    horns(g) { for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 8, HY + 2); g.quadraticCurveTo(s * 20, HY - 4, s * 17, HY - 18); g.quadraticCurveTo(s * 12, HY - 6, s * 1, HY + 3); g.closePath(); fs(g, '#d8263a', 2.5); } },
    catears(g) { for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 4, HY + 2); g.lineTo(s * 13, HY - 15); g.lineTo(s * 19, HY + 4); g.closePath(); fs(g, '#3f4752', 2.5); g.beginPath(); g.moveTo(s * 9, HY + 1); g.lineTo(s * 13, HY - 8); g.lineTo(s * 16, HY + 2); g.closePath(); g.fillStyle = '#ff9fc6'; g.fill(); } },
    sprout(g) { g.strokeStyle = OUT; g.lineWidth = 3; g.beginPath(); g.moveTo(0, HY + 2); g.lineTo(0, HY - 12); g.stroke(); ell(g, -6, HY - 14, 7, 4, 0.5); fs(g, '#5fd35f', 2); ell(g, 6, HY - 16, 7, 4, -0.5); fs(g, '#5fd35f', 2); },
    papaq(g) { rr(g, -18, HY - 20, 36, 24, 9); fs(g, '#e9e4da', 2.5); g.fillStyle = 'rgba(0,0,0,.12)'; for (let i = 0; i < 9; i++) { ell(g, -13 + (i % 5) * 6.5, HY - 15 + Math.floor(i / 5) * 9, 2.4, 2.4); g.fill(); } rr(g, -18, HY - 2, 36, 6, 3); fs(g, '#cfc7b8', 2); },
    nar(g) { ell(g, 6, HY - 9, 11, 10); fs(g, '#c8102e', 2.5); g.beginPath(); g.moveTo(1, HY - 18); g.lineTo(3, HY - 24); g.lineTo(6, HY - 20); g.lineTo(9, HY - 24); g.lineTo(11, HY - 18); g.closePath(); fs(g, '#8f0b22', 2); ell(g, 2, HY - 12, 3, 2); g.fillStyle = 'rgba(255,255,255,.5)'; g.fill(); },
    wizard(g) { g.beginPath(); g.moveTo(-18, HY + 2); g.quadraticCurveTo(-2, HY - 10, 4, HY - 34); g.quadraticCurveTo(10, HY - 10, 18, HY + 2); g.closePath(); fs(g, '#5b3fd6', 2.5); g.fillStyle = '#ffe14b'; g.font = '10px sans-serif'; g.fillText('★', -2, HY - 8); },
  };
  function drawHat(g, hat, t) { const f = HATS[hat]; if (f) { g.save(); f(g, t || 0); g.restore(); } }

  function setup(g, x, y, o) {
    g.save(); g.translate(x, y);
    const s = o.scale || 1; g.scale(s * (o.facing === -1 ? -1 : 1), s);
    if (o.alpha != null && o.alpha < 1) g.globalAlpha *= o.alpha;
  }

  function drawCharacter(g, x, y, o) {
    o = o || {};
    const c = col(o.color), t = o.t || 0;
    setup(g, x, y, o);
    const bob = o.moving ? Math.abs(Math.sin(t * 14)) * 2 : Math.sin(t * 2) * 0.6;
    ell(g, 0, 0, 22, 6); g.fillStyle = 'rgba(0,0,0,.28)'; g.fill();
    drawLegs(g, c, t, o.moving);
    g.translate(0, -bob);
    drawJetpack(g, c);
    drawAntenna(g, c, t, false);
    drawBodyShape(g, c);
    drawVisor(g, o.eyes || 'normal', t + (o.color ? o.color.length : 0), false);
    drawHat(g, o.hat, t);
    g.restore();
  }

  function drawBody(g, x, y, o) {
    o = o || {};
    const c = col(o.color);
    setup(g, x, y, o);
    ell(g, 0, -2, 38, 9); g.fillStyle = 'rgba(0,0,0,.3)'; g.fill();
    g.save(); g.translate(-4, -16); g.rotate(-Math.PI / 2 + 0.1); g.translate(0, 38);
    drawLegs(g, c, 0, false);
    drawJetpack(g, c);
    drawAntenna(g, c, 0, true);
    drawBodyShape(g, c);
    drawVisor(g, 'x', 0, true);
    g.restore();
    g.restore();
  }

  function drawGhost(g, x, y, o) {
    o = o || {};
    const c = col(o.color), t = o.t || 0;
    setup(g, x, y - 8 + Math.sin(t * 2.5) * 4, Object.assign({}, o, { alpha: (o.alpha == null ? 1 : o.alpha) * 0.55 }));
    // wispy tail
    g.beginPath(); g.moveTo(-BRX + 2, BY + 6);
    for (let i = 0; i <= 6; i++) { const xx = -BRX + 2 + i * (2 * BRX - 4) / 6; g.lineTo(xx, -6 + (i % 2 ? -6 : 2) + Math.sin(t * 5 + i) * 2.5); }
    g.lineTo(BRX - 2, BY + 6); g.closePath(); fs(g, c.shade, 3);
    drawAntenna(g, c, t, false);
    drawBodyShape(g, c);
    drawVisor(g, 'normal', t, false);
    ell(g, 0, BY - 5, 1, 1);
    drawHat(g, o.hat, t);
    g.restore();
  }

  const cache = {};
  function portrait(color, hat, size, opts) {
    opts = opts || {};
    size = Math.max(16, Math.round(size || 64));
    const key = [color, hat, size, opts.dead ? 1 : 0, opts.eyes || ''].join('|');
    if (cache[key]) return cache[key];
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const g = cv.getContext('2d');
    const s = size / 64;
    g.scale(s, s);
    // head-and-shoulders: character scaled 1.35, feet below the frame
    g.save(); g.beginPath(); g.rect(0, 0, 64, 64); g.clip();
    if (opts.dead) {
      const c = col(color);
      g.translate(32, 74); g.scale(0.8, 0.8);
      drawJetpack(g, c); drawAntenna(g, c, 0, true); drawBodyShape(g, c); drawVisor(g, 'x', 0, true);
    } else {
      const c = col(color);
      g.translate(31, 76); g.scale(0.8, 0.8);
      drawJetpack(g, c); drawAntenna(g, c, 1, false); drawBodyShape(g, c); drawVisor(g, opts.eyes || 'normal', 1, false); drawHat(g, hat, 0);
    }
    g.restore();
    cache[key] = cv;
    return cv;
  }
  const ucache = {};
  function portraitURL(color, hat, size, opts) {
    const key = [color, hat, size, opts && opts.dead ? 1 : 0, (opts && opts.eyes) || ''].join('|');
    if (!ucache[key]) ucache[key] = portrait(color, hat, size, opts).toDataURL();
    return ucache[key];
  }

  AS.Art = { drawCharacter, drawBody, drawGhost, portrait, portraitURL, drawHat, HAT_ANCHOR, drawsShadow: true };
})(globalThis.AS = globalThis.AS || {});
