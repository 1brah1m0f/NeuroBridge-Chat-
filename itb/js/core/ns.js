/* AI IMPOSTOR: SPACE SHIP — shared namespace + utilities (runs in browser AND Node).
 * Every file in js/ follows the same pattern:
 *   (function (AS) { 'use strict'; ... })(globalThis.AS = globalThis.AS || {});
 */
(function (AS) {
  'use strict';

  AS.VERSION = '1.0.0';
  AS.isNode = typeof window === 'undefined';

  const U = (AS.util = {});

  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
  U.dist2 = (ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay;
    return dx * dx + dy * dy;
  };
  U.approach = (v, target, delta) => (v < target ? Math.min(v + delta, target) : Math.max(v - delta, target));
  U.smooth = (dt, rate) => 1 - Math.exp(-dt * rate); // frame-rate independent lerp factor

  // Seeded RNG (mulberry32). Returns () => float in [0, 1).
  U.rng = function (seed) {
    let a = (seed >>> 0) || 0x9e3779b9;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  U.hashString = function (str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };
  U.randInt = (rng, a, b) => a + Math.floor(rng() * (b - a + 1)); // inclusive
  U.pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
  U.shuffle = function (rng, arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  };

  let uidCounter = 0;
  U.uid = (prefix) => (prefix || 'id') + (++uidCounter).toString(36) + Math.floor(Math.random() * 1e6).toString(36);

  // rect = [x, y, w, h]
  U.pointInRect = (x, y, r) => x >= r[0] && y >= r[1] && x <= r[0] + r[2] && y <= r[1] + r[3];
  U.rectsOverlap = (a, b) => a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1];
  U.circleRectOverlap = function (cx, cy, r, rect) {
    const nx = U.clamp(cx, rect[0], rect[0] + rect[2]);
    const ny = U.clamp(cy, rect[1], rect[1] + rect[3]);
    return U.dist2(cx, cy, nx, ny) < r * r;
  };
  U.rectCenter = (r) => [r[0] + r[2] / 2, r[1] + r[3] / 2];

  U.clone = (o) => JSON.parse(JSON.stringify(o));
  U.formatTime = function (sec) {
    sec = Math.max(0, Math.ceil(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  };
  U.now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

  // Tiny event emitter used by App and others.
  U.Emitter = class {
    constructor() { this._h = {}; }
    on(name, fn) { (this._h[name] || (this._h[name] = [])).push(fn); return () => this.off(name, fn); }
    off(name, fn) { const a = this._h[name]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } }
    emit(name, ...args) {
      const a = this._h[name];
      if (!a) return;
      for (const fn of a.slice()) {
        try { fn(...args); } catch (e) { console.error('[emit ' + name + ']', e); }
      }
    }
  };

  // Safe localStorage wrapper (file://, private mode, Node).
  U.store = {
    get(key, fallback) {
      try {
        if (typeof localStorage === 'undefined') return fallback;
        const v = localStorage.getItem('amongstars.' + key);
        return v == null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { if (typeof localStorage !== 'undefined') localStorage.setItem('amongstars.' + key, JSON.stringify(value)); } catch (e) { /* ignore */ }
    },
  };
})(globalThis.AS = globalThis.AS || {});
