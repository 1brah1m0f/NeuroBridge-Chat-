/* AI IMPOSTOR: SPACE SHIP — mini-games, set A: wires, swipe, download, upload, fuel, calibrate, leaves, align.
 * Each game is registered with AS.Tasks.register(id, factory, { w, h }) (see taskhost.js header).
 * All art is procedural canvas; static device art is cached per instance in offscreen layers that are
 * re-rendered only when the panel scale changes. Strings: game.<id>.* (AZ + EN) registered below.
 * Test hook: AS.TasksA.live = the currently open instance of one of these games (inst.__test helpers).
 */
(function (AS) {
  'use strict';

  if (!AS.Tasks || typeof document === 'undefined') return;

  const U = AS.util;
  const TAU = Math.PI * 2;
  AS.TasksA = AS.TasksA || { live: null };

  // ------------------------------------------------------------------ strings
  AS.i18n.add({
    az: {
      'game.wires.title': 'Naqilləri düzəlt',
      'game.wires.hint': 'Hər naqili eyni rəngli yuvaya sürüşdür',

      'game.swipe.title': 'Kartı keçir',
      'game.swipe.hint1': 'Kartı pul kisəsindən götür',
      'game.swipe.hint2': 'Kartı soldan sağa bərabər sürətlə keçir',
      'game.swipe.insert': 'KARTI DAXİL EDİN',
      'game.swipe.swipe': 'KARTI KEÇİRİN',
      'game.swipe.fast': 'ÇOX SÜRƏTLİ. YENİDƏN CƏHD EDİN.',
      'game.swipe.slow': 'ÇOX YAVAŞ. YENİDƏN CƏHD EDİN.',
      'game.swipe.bad': 'OXUNMADI. YENİDƏN CƏHD EDİN.',
      'game.swipe.ok': 'QƏBUL EDİLDİ. TƏŞƏKKÜRLƏR!',
      'game.swipe.card': 'EKİPAJ KARTI',
      'game.swipe.crew': 'Ekipaj üzvü',

      'game.download.title': 'Məlumatları endir',
      'game.download.btn': 'ENDİR',
      'game.download.hint': 'Düyməni bas və endirmə bitənə qədər gözlə',
      'game.download.tablet': 'Planşetim',
      'game.download.station': 'Stansiya',
      'game.download.eta': 'Təxmini vaxt: {t}',
      'game.download.calc': 'Hesablanır...',
      'game.download.done': 'Tamamlandı!',
      'game.download.d': '{n} gün', 'game.download.h': '{n} saat', 'game.download.m': '{n} dəq', 'game.download.s': '{n} san',

      'game.upload.title': 'Məlumatları göndər',
      'game.upload.btn': 'GÖNDƏR',
      'game.upload.hint': 'Düyməni bas və göndərmə bitənə qədər gözlə',
      'game.upload.hq': 'Baş qərargah',

      'game.fuel.title': 'Mühərriklərə yanacaq doldur',
      'game.fuel.hintFill': 'Kanistri doldurmaq üçün düyməni basılı saxla',
      'game.fuel.hintPour': 'Yanacağı tökmək üçün düyməni basılı saxla',
      'game.fuel.fill': 'DOLDUR', 'game.fuel.pour': 'TÖK',
      'game.fuel.can': 'KANİSTR', 'game.fuel.tank': 'YANACAQ ÇƏNİ',

      'game.calibrate.title': 'Paylayıcını kalibrlə',
      'game.calibrate.hint': 'Fırlanan hissə nişana çatanda düyməni bas',
      'game.calibrate.btn': 'KALİBRLƏ',

      'game.leaves.title': 'O2 filtrini təmizlə',
      'game.leaves.hint': 'Yarpaqları tutub soldakı hava sorucusuna at',

      'game.align.title': 'Mühərrik çıxışını tənzimlə',
      'game.align.hint': 'Qolu sürüşdürərək xətti mərkəzə gətir',
      'game.align.locked': 'TƏNZİMLƏNDİ',
    },
    en: {
      'game.wires.title': 'Fix Wiring',
      'game.wires.hint': 'Drag each wire to the socket of the same color',

      'game.swipe.title': 'Swipe Card',
      'game.swipe.hint1': 'Take the card out of the wallet',
      'game.swipe.hint2': 'Swipe the card left to right at a steady speed',
      'game.swipe.insert': 'PLEASE INSERT CARD',
      'game.swipe.swipe': 'PLEASE SWIPE CARD',
      'game.swipe.fast': 'TOO FAST. TRY AGAIN.',
      'game.swipe.slow': 'TOO SLOW. TRY AGAIN.',
      'game.swipe.bad': 'BAD READ. TRY AGAIN.',
      'game.swipe.ok': 'ACCEPTED. THANK YOU!',
      'game.swipe.card': 'CREW ID',
      'game.swipe.crew': 'Crewmate',

      'game.download.title': 'Download Data',
      'game.download.btn': 'DOWNLOAD',
      'game.download.hint': 'Press the button and wait for the download',
      'game.download.tablet': 'My Tablet',
      'game.download.station': 'Station',
      'game.download.eta': 'Estimated time: {t}',
      'game.download.calc': 'Calculating...',
      'game.download.done': 'Complete!',
      'game.download.d': '{n}d', 'game.download.h': '{n}hr', 'game.download.m': '{n}m', 'game.download.s': '{n}s',

      'game.upload.title': 'Upload Data',
      'game.upload.btn': 'UPLOAD',
      'game.upload.hint': 'Press the button and wait for the upload',
      'game.upload.hq': 'Headquarters',

      'game.fuel.title': 'Fuel Engines',
      'game.fuel.hintFill': 'Hold the button to fill the gas can',
      'game.fuel.hintPour': 'Hold the button to pour fuel into the engine',
      'game.fuel.fill': 'FILL', 'game.fuel.pour': 'POUR',
      'game.fuel.can': 'GAS CAN', 'game.fuel.tank': 'FUEL TANK',

      'game.calibrate.title': 'Calibrate Distributor',
      'game.calibrate.hint': 'Press the button when the spinner meets the marker',
      'game.calibrate.btn': 'CALIBRATE',

      'game.leaves.title': 'Clean O2 Filter',
      'game.leaves.hint': 'Grab the leaves and throw them into the vent on the left',

      'game.align.title': 'Align Engine Output',
      'game.align.hint': 'Drag the lever to align the line with the center',
      'game.align.locked': 'ALIGNED',
    },
  });

  // ------------------------------------------------------------------ palette + easing
  const C = {
    outline: '#10131f',
    metalHi: '#d5dcec', metal: '#9aa3bd', metalMid: '#6b7491', metalLo: '#474e66', metalDk: '#2c3245',
    face: '#353c54', faceDk: '#22283a', well: '#141827',
    cyan: '#3fe0ff', green: '#34e07c', greenDk: '#11994d', red: '#ff3b4e', redDk: '#b5162c',
    yellow: '#ffd23f', orange: '#ff9a3c', magenta: '#ff4fd8', blue: '#3d7bff', white: '#f3f6ff', dim: '#aab4da',
  };
  const E = {
    outCubic: (t) => 1 - Math.pow(1 - U.clamp(t, 0, 1), 3),
    inOut: (t) => { t = U.clamp(t, 0, 1); return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },
    outBack: (t) => { t = U.clamp(t, 0, 1); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    outElastic: (t) => { t = U.clamp(t, 0, 1); if (t === 0 || t === 1) return t; return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1; },
  };

  // ------------------------------------------------------------------ drawing kit
  const fontCache = {};
  function font(size, weight) {
    const k = (weight || 700) + '|' + size;
    return fontCache[k] || (fontCache[k] = (weight || 700) + ' ' + size + 'px Fredoka, Nunito, "Segoe UI", sans-serif');
  }
  const rgbaCache = {};
  function rgba(hex, a) {
    const k = hex + a;
    let s = rgbaCache[k];
    if (s) return s;
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h, 16);
    s = 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
    rgbaCache[k] = s;
    return s;
  }
  function shadeHex(hex, f) { // f < 0 darker, > 0 lighter
    const n = parseInt(hex.replace('#', ''), 16);
    let r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
    if (f < 0) { r *= 1 + f; gg *= 1 + f; b *= 1 + f; } else { r += (255 - r) * f; gg += (255 - gg) * f; b += (255 - b) * f; }
    return '#' + ((1 << 24) | (Math.round(r) << 16) | (Math.round(gg) << 8) | Math.round(b)).toString(16).slice(1);
  }

  function rr(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function lin(g, x0, y0, x1, y1, stops) {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    for (let i = 0; i < stops.length; i += 2) gr.addColorStop(stops[i], stops[i + 1]);
    return gr;
  }
  function rad(g, x, y, r0, r1, stops) {
    const gr = g.createRadialGradient(x, y, r0, x, y, r1);
    for (let i = 0; i < stops.length; i += 2) gr.addColorStop(stops[i], stops[i + 1]);
    return gr;
  }

  // Offscreen static layer, re-painted only when the effective pixel scale changes.
  function layer(w, h, paint) {
    let cv = null, k = 0;
    const fn = function (g) {
      const m = g.getTransform();
      const kk = U.clamp(Math.round(Math.hypot(m.a, m.b) * 4) / 4, 0.5, 3);
      if (!cv || kk !== k) {
        k = kk;
        cv = cv || document.createElement('canvas');
        cv.width = Math.max(1, Math.ceil(w * k));
        cv.height = Math.max(1, Math.ceil(h * k));
        const cg = cv.getContext('2d');
        cg.setTransform(k, 0, 0, k, 0, 0);
        cg.clearRect(0, 0, w, h);
        paint(cg);
      }
      g.drawImage(cv, 0, 0, w, h);
    };
    fn.invalidate = () => { k = 0; };
    return fn;
  }

  const glowCache = {};
  function glowSprite(color) {
    let c = glowCache[color];
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = 64;
    const cg = c.getContext('2d');
    cg.fillStyle = rad(cg, 32, 32, 0, 32, [0, rgba(color, 1), 0.22, rgba(color, 0.55), 0.55, rgba(color, 0.16), 1, rgba(color, 0)]);
    cg.fillRect(0, 0, 64, 64);
    glowCache[color] = c;
    return c;
  }
  function glow(g, x, y, r, color, alpha) {
    if (alpha <= 0.003) return;
    const pa = g.globalAlpha, pc = g.globalCompositeOperation;
    g.globalAlpha = pa * Math.min(1, alpha);
    g.globalCompositeOperation = 'lighter';
    g.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
    g.globalAlpha = pa;
    g.globalCompositeOperation = pc;
  }

  function backdrop(g, w, h) {
    g.fillStyle = lin(g, 0, 0, 0, h, [0, '#232a48', 1, '#11152a']);
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.035)';
    g.lineWidth = 2;
    for (let x = -h; x < w; x += 26) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + h, 0); g.stroke(); }
    g.fillStyle = rad(g, w / 2, h / 2, Math.min(w, h) * 0.3, Math.max(w, h) * 0.75, [0, 'rgba(0,0,0,0)', 1, 'rgba(0,0,0,0.55)']);
    g.fillRect(0, 0, w, h);
  }

  function screw(g, x, y, r, a) {
    g.beginPath(); g.arc(x, y + r * 0.18, r + 1.5, 0, TAU); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fill();
    g.beginPath(); g.arc(x, y, r, 0, TAU);
    g.fillStyle = rad(g, x - r * 0.35, y - r * 0.4, r * 0.1, r * 1.2, [0, '#f2f5fc', 0.45, '#a3abc2', 1, '#525a72']);
    g.fill();
    g.lineWidth = 1.5; g.strokeStyle = C.outline; g.stroke();
    const dx = Math.cos(a) * r * 0.72, dy = Math.sin(a) * r * 0.72;
    g.lineCap = 'round';
    g.lineWidth = r * 0.36; g.strokeStyle = '#2b3043';
    g.beginPath(); g.moveTo(x - dx, y - dy); g.lineTo(x + dx, y + dy); g.stroke();
    g.lineWidth = r * 0.14; g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.beginPath(); g.moveTo(x - dx + 0.8, y - dy + 1.1); g.lineTo(x + dx + 0.8, y + dy + 1.1); g.stroke();
  }

  // Chunky device: dark outline, metallic bezel with screws, recessed face.
  function device(g, x, y, w, h, o) {
    o = o || {};
    const r = o.r != null ? o.r : 26, b = o.bezel != null ? o.bezel : 16;
    if (o.shadow !== false) {
      g.save();
      g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = 22; g.shadowOffsetY = 10;
      rr(g, x, y, w, h, r); g.fillStyle = C.outline; g.fill();
      g.restore();
    }
    rr(g, x, y, w, h, r); g.fillStyle = C.outline; g.fill();
    rr(g, x + 3, y + 3, w - 6, h - 6, r - 3);
    g.fillStyle = lin(g, 0, y, 0, y + h, [0, o.bezelHi || '#b9c1d6', 0.08, o.bezelMid || '#8790ab', 0.6, o.bezelLo || '#5d6681', 1, '#3c4359']);
    g.fill();
    rr(g, x + 5, y + 5, w - 10, h - 10, r - 5);
    g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,0.32)'; g.stroke();
    const fx = x + b, fy = y + b, fw = w - b * 2, fh = h - b * 2, fr = Math.max(6, r - b + 4);
    rr(g, fx - 2, fy - 2, fw + 4, fh + 4, fr + 2); g.fillStyle = C.outline; g.fill();
    rr(g, fx, fy, fw, fh, fr);
    g.fillStyle = lin(g, 0, fy, 0, fy + fh, [0, o.face || C.face, 1, o.faceDk || C.faceDk]);
    g.fill();
    g.save(); rr(g, fx, fy, fw, fh, fr); g.clip();
    g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.35)';
    rr(g, fx - 2, fy + 1, fw + 4, fh + 6, fr); g.stroke();
    g.restore();
    if (o.screws !== false) {
      const s = b * 0.5, sr = Math.max(4, b * 0.34);
      screw(g, x + s + 2, y + s + 2, sr, 0.6);
      screw(g, x + w - s - 2, y + s + 2, sr, 2.1);
      screw(g, x + s + 2, y + h - s - 2, sr, 1.2);
      screw(g, x + w - s - 2, y + h - s - 2, sr, 0.2);
    }
    return { x: fx, y: fy, w: fw, h: fh, r: fr };
  }

  // Recessed well / screen cavity.
  function well(g, x, y, w, h, r, fill) {
    rr(g, x - 3, y - 3, w + 6, h + 6, r + 3);
    g.fillStyle = lin(g, 0, y - 3, 0, y + h + 3, [0, 'rgba(0,0,0,0.55)', 1, 'rgba(255,255,255,0.18)']);
    g.fill();
    rr(g, x, y, w, h, r); g.fillStyle = fill || C.well; g.fill();
    g.save(); rr(g, x, y, w, h, r); g.clip();
    g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,0.45)';
    rr(g, x - 3, y - 1, w + 6, h + 10, r); g.stroke();
    g.restore();
  }

  // Glass display with scanlines (static part).
  function screenBox(g, x, y, w, h, r, tint) {
    well(g, x, y, w, h, r, '#05090c');
    g.save(); rr(g, x, y, w, h, r); g.clip();
    g.fillStyle = rad(g, x + w / 2, y + h / 2, 4, Math.max(w, h) * 0.7, [0, rgba(tint, 0.2), 1, rgba(tint, 0.02)]);
    g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(255,255,255,0.035)';
    for (let yy = y + 2; yy < y + h; yy += 4) g.fillRect(x, yy, w, 1.5);
    g.fillStyle = lin(g, x, y, x + w * 0.6, y + h, [0, 'rgba(255,255,255,0.10)', 0.45, 'rgba(255,255,255,0.03)', 0.46, 'rgba(255,255,255,0)', 1, 'rgba(255,255,255,0)']);
    g.fillRect(x, y, w, h);
    g.restore();
  }

  function hazard(g, x, y, w, h, s) {
    s = s || 18;
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.fillStyle = '#f5c518'; g.fillRect(x, y, w, h);
    g.fillStyle = '#1b1d26';
    for (let i = -h; i < w + h; i += s * 2) {
      g.beginPath(); g.moveTo(x + i, y + h); g.lineTo(x + i + s, y + h); g.lineTo(x + i + s + h, y); g.lineTo(x + i + h, y); g.closePath(); g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x, y, w, 2);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, y + h - 2, w, 2);
    g.restore();
    g.lineWidth = 2; g.strokeStyle = C.outline; g.strokeRect(x, y, w, h);
  }

  function led(g, x, y, r, color, on) {
    g.beginPath(); g.arc(x, y, r + 2.5, 0, TAU); g.fillStyle = C.outline; g.fill();
    g.beginPath(); g.arc(x, y, r, 0, TAU);
    g.fillStyle = on > 0.02 ? shadeHex(color, -0.55 + 0.55 * Math.min(1, on)) : shadeHex(color, -0.72);
    g.fill();
    if (on > 0.02) {
      g.beginPath(); g.arc(x, y, r * 0.62, 0, TAU); g.fillStyle = rgba('#ffffff', 0.55 * on); g.fill();
      glow(g, x, y, r * 4.2, color, 0.85 * on);
    }
    g.beginPath(); g.arc(x - r * 0.35, y - r * 0.38, r * 0.28, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.6)'; g.fill();
  }

  function text(g, s, x, y, size, color, align, base, weight) {
    g.font = font(size, weight);
    g.textAlign = align || 'center';
    g.textBaseline = base || 'middle';
    g.fillStyle = color;
    g.fillText(s, x, y);
  }
  function otext(g, s, x, y, size, fill, stroke, lw, align) {
    g.font = font(size);
    g.textAlign = align || 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = lw || 5;
    g.strokeStyle = stroke || C.outline;
    g.strokeText(s, x, y);
    g.fillStyle = fill;
    g.fillText(s, x, y);
  }
  // Glowing display text (fits to maxW).
  function gtext(g, s, x, y, size, color, maxW, align) {
    const sz = fit(g, s, maxW || 9999, size);
    g.save();
    g.shadowColor = color; g.shadowBlur = 12;
    text(g, s, x, y, sz, color, align);
    g.shadowBlur = 0;
    text(g, s, x, y, sz, rgba('#ffffff', 0.35), align);
    g.restore();
    return sz;
  }
  const fitCache = new Map();
  function fit(g, s, maxW, size, weight) {
    const key = s + '\u0001' + maxW + '\u0001' + size + '\u0001' + (weight || 700);
    let v = fitCache.get(key);
    if (v) return v;
    g.font = font(size, weight);
    const w = g.measureText(s).width;
    v = w <= maxW ? size : Math.max(9, Math.floor(size * maxW / w));
    if (fitCache.size > 400) fitCache.clear();
    fitCache.set(key, v);
    return v;
  }

  // One short instruction line at the bottom of every panel.
  function hint(g, w, h, s, alpha) {
    if (!s) return;
    const maxW = w - 90;
    const sz = fit(g, s, maxW, 19);
    g.font = font(sz);
    const tw = Math.min(maxW, g.measureText(s).width);
    const pw = tw + 58, ph = 34, px = (w - pw) / 2, py = h - ph - 9;
    g.save();
    g.globalAlpha = alpha == null ? 1 : alpha;
    rr(g, px, py, pw, ph, 17); g.fillStyle = 'rgba(6,9,22,0.82)'; g.fill();
    g.lineWidth = 2; g.strokeStyle = 'rgba(63,224,255,0.38)'; g.stroke();
    const ix = px + 20, iy = py + ph / 2;
    g.beginPath(); g.arc(ix, iy, 9, 0, TAU); g.fillStyle = C.cyan; g.fill();
    text(g, 'i', ix, iy + 1, 14, '#06202a', 'center', 'middle', 800);
    text(g, s, ix + 15, iy + 1, sz, '#e4ebff', 'left');
    g.restore();
  }

  // Chunky 3D push button (rect). press 0..1 sinks it.
  function pushButton(g, x, y, w, h, col, press, label, labelSize, disabled) {
    const depth = 7, sink = depth * U.clamp(press || 0, 0, 1);
    const top = disabled ? '#5b6278' : col[0], bot = disabled ? '#3c4256' : col[1], edge = disabled ? '#262a38' : col[2];
    rr(g, x - 3, y - 3, w + 6, h + depth + 6, 16); g.fillStyle = C.outline; g.fill();
    rr(g, x, y + sink, w, h + depth - sink, 13); g.fillStyle = edge; g.fill();
    rr(g, x, y + sink, w, h, 13); g.fillStyle = lin(g, 0, y + sink, 0, y + sink + h, [0, top, 1, bot]); g.fill();
    rr(g, x + 5, y + sink + 4, w - 10, h * 0.42, 9); g.fillStyle = 'rgba(255,255,255,0.22)'; g.fill();
    if (label) {
      const sz = fit(g, label, w - 22, labelSize || 26);
      otext(g, label, x + w / 2, y + sink + h / 2 + 2, sz, disabled ? '#c4c9d8' : '#ffffff', 'rgba(0,0,0,0.55)', 5);
    }
  }

  function inRect(px, py, x, y, w, h) { return px >= x && py >= y && px <= x + w && py <= y + h; }

  // ------------------------------------------------------------------ particles (pooled, no per-frame allocation)
  function Particles(max) {
    this.max = max; this.n = 0;
    this.x = new Float32Array(max); this.y = new Float32Array(max);
    this.vx = new Float32Array(max); this.vy = new Float32Array(max);
    this.life = new Float32Array(max); this.ttl = new Float32Array(max);
    this.size = new Float32Array(max); this.grav = new Float32Array(max);
    this.kind = new Uint8Array(max); this.col = new Array(max).fill('#ffffff');
  }
  // kind: 0 spark streak, 1 glow dot, 2 soft disc, 3 twinkle star
  Particles.prototype.emit = function (x, y, vx, vy, ttl, size, col, kind, grav) {
    let i = this.n;
    if (i >= this.max) { i = (Math.random() * this.max) | 0; } else this.n++;
    this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy;
    this.life[i] = ttl; this.ttl[i] = ttl; this.size[i] = size; this.col[i] = col;
    this.kind[i] = kind || 0; this.grav[i] = grav || 0;
  };
  Particles.prototype.burst = function (x, y, count, col, sMin, sMax, ttl, size, kind, grav, rng) {
    rng = rng || Math.random;
    for (let k = 0; k < count; k++) {
      const a = rng() * TAU, s = sMin + rng() * (sMax - sMin);
      this.emit(x, y, Math.cos(a) * s, Math.sin(a) * s, ttl * (0.6 + rng() * 0.6), size * (0.6 + rng() * 0.7), col, kind, grav);
    }
  };
  Particles.prototype.update = function (dt) {
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        const j = --this.n;
        if (i !== j) {
          this.x[i] = this.x[j]; this.y[i] = this.y[j]; this.vx[i] = this.vx[j]; this.vy[i] = this.vy[j];
          this.life[i] = this.life[j]; this.ttl[i] = this.ttl[j]; this.size[i] = this.size[j];
          this.grav[i] = this.grav[j]; this.kind[i] = this.kind[j]; this.col[i] = this.col[j];
        }
        continue;
      }
      const drag = this.kind[i] === 2 ? 0.985 : 0.965;
      this.vx[i] *= drag; this.vy[i] = this.vy[i] * drag + this.grav[i] * dt;
      this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt;
      i++;
    }
  };
  Particles.prototype.draw = function (g) {
    if (!this.n) return;
    const pa = g.globalAlpha, pc = g.globalCompositeOperation;
    g.lineCap = 'round';
    for (let i = 0; i < this.n; i++) {
      const k = this.life[i] / this.ttl[i], s = this.size[i], c = this.col[i];
      const x = this.x[i], y = this.y[i];
      if (this.kind[i] === 0) {
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = pa * Math.min(1, k * 1.6);
        g.strokeStyle = c; g.lineWidth = s * (0.4 + 0.6 * k);
        g.beginPath(); g.moveTo(x, y); g.lineTo(x - this.vx[i] * 0.035, y - this.vy[i] * 0.035); g.stroke();
        g.strokeStyle = '#ffffff'; g.lineWidth = s * 0.35 * k;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x - this.vx[i] * 0.018, y - this.vy[i] * 0.018); g.stroke();
      } else if (this.kind[i] === 1) {
        g.globalCompositeOperation = pc;
        glow(g, x, y, s * (1 + (1 - k)), c, k);
      } else if (this.kind[i] === 2) {
        g.globalCompositeOperation = pc;
        g.globalAlpha = pa * k * 0.85;
        g.fillStyle = c; g.beginPath(); g.arc(x, y, s * (1.4 - 0.4 * k), 0, TAU); g.fill();
      } else {
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = pa * k;
        const r = s * (0.5 + k);
        g.fillStyle = c;
        g.beginPath();
        g.moveTo(x, y - r); g.quadraticCurveTo(x, y, x + r, y); g.quadraticCurveTo(x, y, x, y + r);
        g.quadraticCurveTo(x, y, x - r, y); g.quadraticCurveTo(x, y, x, y - r); g.fill();
      }
    }
    g.globalAlpha = pa; g.globalCompositeOperation = pc;
  };
  Particles.prototype.clear = function () { this.n = 0; };

  // ------------------------------------------------------------------ completion guard + registration
  function finisher(ctx) {
    let state = 0, timer = 0;
    return {
      get done() { return state > 0; },
      trigger(delay) { if (state) return; state = 1; timer = delay == null ? 0.45 : delay; },
      update(dt) { if (state === 1) { timer -= dt; if (timer <= 0) { state = 2; ctx.complete(); } } },
    };
  }
  function reg(id, w, h, factory) {
    AS.Tasks.register(id, function (ctx) {
      const inst = factory(ctx, w, h);
      const d = inst.destroy;
      inst.destroy = function () {
        try { if (d) d.call(inst); } finally { if (AS.TasksA.live === inst) AS.TasksA.live = null; }
      };
      AS.TasksA.live = inst;
      return inst;
    }, { w, h });
  }
  const sfx = (ctx, name) => { try { ctx.sfx(name); } catch (e) { /* audio optional */ } };

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
})(globalThis.AS = globalThis.AS || {});
