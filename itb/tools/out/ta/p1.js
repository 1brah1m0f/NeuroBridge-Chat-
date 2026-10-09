/* AMONG STARS — mini-games, set A: wires, swipe, download, upload, fuel, calibrate, leaves, align.
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

  /*@@GAMES@@*/
