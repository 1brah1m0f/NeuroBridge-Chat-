/* AI IMPOSTOR: SPACE SHIP — Input (keyboard, mouse-hold movement, virtual joystick on touch). Owner: hud.
 *
 *   AS.Input.init(App)
 *   AS.Input.getMove() -> {x, y}        length <= 1. Zero while App.isBlocked().
 *   AS.Input.on(action, fn) -> off()    actions: 'use' (E/Space) 'report' (R) 'kill' (Q) 'vent' (V)
 *                                        'map' (Tab/M) 'sabotage' (no key; HUD button) 'escape' (Esc)
 *                                        + 'touchmode' (isTouch) when the control scheme switches.
 *   AS.Input.off(action, fn), AS.Input.trigger(action), AS.Input.isTouch(), AS.Input.isDown(code)
 *   AS.Input.hint(action) -> 'E' | 'R' | ... (keyboard hint label), AS.Input.reset()
 * Keys use KeyboardEvent.code (layout independent). Ignored while typing in inputs or with Ctrl/Alt/Meta.
 * Movement: WASD / arrows; desktop: hold the left mouse button on the world canvas to walk toward the cursor;
 * touch: floating virtual joystick in the bottom-left area (element in #hud).
 */
(function (AS) {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const ACTION_KEYS = {
    KeyE: 'use', Space: 'use', Enter: null, KeyR: 'report', KeyQ: 'kill', KeyV: 'vent',
    Tab: 'map', KeyM: 'map', Escape: 'escape',
  };
  const MOVE_KEYS = {
    KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1],
    KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
  };
  const HINTS = { use: 'E', report: 'R', kill: 'Q', vent: 'V', map: 'Tab', escape: 'Esc' };
  const JOY_RADIUS = 58;      // px, knob travel
  const JOY_DEAD = 0.14;      // dead zone (fraction of radius)
  const MOUSE_FULL = 90;      // px from the character where mouse-walk reaches full speed
  const MOUSE_DEAD = 14;

  const em = new AS.util.Emitter();
  const down = new Set();
  let App = null;
  let inited = false;
  let screenName = null;
  let touchMode = detectTouch();
  const joy = { active: false, id: null, hx: 0, hy: 0, cx: 0, cy: 0, x: 0, y: 0, shown: false, el: null, base: null, knob: null, zone: null };
  const mouse = { active: false, id: null, x: 0, y: 0 };

  function detectTouch() {
    try {
      const q = new URLSearchParams(location.search).get('touch');
      if (q === '1') return true;
      if (q === '0') return false;
    } catch (e) { /* ignore */ }
    try {
      if (window.matchMedia) {
        if (window.matchMedia('(pointer: coarse)').matches) return true;
        if (navigator.maxTouchPoints > 0 && window.matchMedia('(hover: none)').matches) return true;
      }
    } catch (e) { /* ignore */ }
    return false;
  }

  function setTouchMode(on) {
    on = !!on;
    if (on === touchMode) return;
    touchMode = on;
    if (!on) releaseJoy();
    updateJoyVisibility(true);
    em.emit('touchmode', on);
  }

  function isTyping(e) {
    const t = e && e.target;
    if (!t || t === document.body || t === window) return false;
    const tag = (t.tagName || '').toLowerCase();
    if (tag === 'textarea' || tag === 'select') return true;
    if (tag === 'input') {
      const type = (t.type || 'text').toLowerCase();
      return ['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'color'].indexOf(type) < 0;
    }
    return !!t.isContentEditable;
  }

  function inGame() {
    if (!App) return false;
    if (screenName) return screenName === 'game';
    if (typeof App.screen === 'string') return App.screen === 'game';
    return !!App.mode;
  }
  function phase() { return App && App.snap ? App.snap.phase : null; }
  function canWalkPhase() { const p = phase(); return p === 'playing' || p === 'lobby'; }
  function blocked() { return !!(App && typeof App.isBlocked === 'function' && App.isBlocked()); }
  function inVent() { const s = App && App.snap && App.snap.self; return !!(s && s.inVent); }

  // ---------- keyboard ----------
  function onKeyDown(e) {
    if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    const code = e.code || '';
    const game = inGame();
    if (MOVE_KEYS[code]) {
      down.add(code);
      if (game) { e.preventDefault(); if (touchMode && !e.repeat) setTouchMode(false); }
      return;
    }
    const action = ACTION_KEYS[code];
    if (!action) return;
    if (game && (code === 'Tab' || code === 'Space')) e.preventDefault();
    if (e.repeat) return;
    if (game && touchMode && action !== 'escape') setTouchMode(false);
    em.emit(action, e);
  }
  function onKeyUp(e) { if (e.code) down.delete(e.code); }

  // ---------- mouse-hold walking (desktop) ----------
  function onPointerDownWorld(e) {
    if (e.pointerType === 'touch') { setTouchMode(true); return; }
    if (e.pointerType === 'mouse' && touchMode) setTouchMode(false);
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    if (!e.target || e.target.id !== 'world') return;
    if (!inGame() || !canWalkPhase() || blocked()) return;
    mouse.active = true; mouse.id = e.pointerId; mouse.x = e.clientX; mouse.y = e.clientY;
  }
  function onPointerMove(e) {
    if (mouse.active && e.pointerId === mouse.id) { mouse.x = e.clientX; mouse.y = e.clientY; }
  }
  function onPointerUp(e) {
    if (mouse.active && e.pointerId === mouse.id) { mouse.active = false; mouse.id = null; }
  }

  function toScreen(x, y) {
    let r = null;
    try {
      if (AS.Renderer && typeof AS.Renderer.worldToScreen === 'function') r = AS.Renderer.worldToScreen(x, y);
      else if (App && typeof App.worldToScreen === 'function') r = App.worldToScreen(x, y);
    } catch (e) { r = null; }
    if (Array.isArray(r) && isFinite(r[0])) return { x: r[0], y: r[1] };
    if (r && isFinite(r.x)) return { x: r.x, y: r.y };
    return null;
  }

  function mouseVector() {
    const me = App && App.view && App.view.me;
    let sp = me && isFinite(me.x) ? toScreen(me.x, me.y - 30) : null;
    if (!sp) sp = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const dx = mouse.x - sp.x, dy = mouse.y - sp.y;
    const d = Math.hypot(dx, dy);
    if (d < MOUSE_DEAD) return { x: 0, y: 0 };
    const m = Math.min(1, (d - MOUSE_DEAD) / (MOUSE_FULL - MOUSE_DEAD) + 0.35);
    return { x: (dx / d) * m, y: (dy / d) * m };
  }

  // ---------- virtual joystick (touch) ----------
  function buildJoystick() {
    const host = document.getElementById('hud') || document.body;
    const zone = document.createElement('div');
    zone.className = 'as-joy-zone interactive';
    const el = document.createElement('div');
    el.className = 'as-joy';
    el.innerHTML = '<div class="as-joy__base"><div class="as-joy__ring"></div><div class="as-joy__knob"></div></div>';
    host.insertBefore(el, host.firstChild);
    host.insertBefore(zone, host.firstChild);
    joy.zone = zone; joy.el = el; joy.base = el.firstChild; joy.knob = el.querySelector('.as-joy__knob');
    zone.addEventListener('pointerdown', onJoyDown);
    zone.addEventListener('pointermove', onJoyMove);
    zone.addEventListener('pointerup', onJoyUp);
    zone.addEventListener('pointercancel', onJoyUp);
    zone.addEventListener('lostpointercapture', onJoyUp);
    zone.addEventListener('contextmenu', (e) => e.preventDefault());
    placeJoyHome();
  }

  function placeJoyHome() {
    const small = window.innerHeight < 500;
    joy.hx = (small ? 92 : 120);
    joy.hy = window.innerHeight - (small ? 92 : 130);
    if (!joy.active) setJoyCenter(joy.hx, joy.hy, false);
  }

  function setJoyCenter(x, y, instant) {
    joy.cx = x; joy.cy = y;
    if (!joy.base) return;
    joy.base.style.transition = instant ? 'none' : '';
    joy.base.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
  }

  function setKnob(dx, dy) {
    if (joy.knob) joy.knob.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)';
  }

  function onJoyDown(e) {
    if (joy.active) return;
    e.preventDefault();
    if (e.pointerType === 'touch') setTouchMode(true);
    if (blocked()) return;
    joy.active = true; joy.id = e.pointerId;
    try { joy.zone.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const m = JOY_RADIUS + 14;
    const x = AS.util.clamp(e.clientX, m, window.innerWidth - m);
    const y = AS.util.clamp(e.clientY, m, window.innerHeight - m);
    // Touching near the resting joystick grabs it in place; elsewhere it re-centers under the finger.
    if (Math.hypot(e.clientX - joy.hx, e.clientY - joy.hy) > JOY_RADIUS * 1.2) setJoyCenter(x, y, true);
    else setJoyCenter(joy.hx, joy.hy, true);
    joy.el.classList.add('is-active');
    updateJoy(e.clientX, e.clientY);
  }
  function onJoyMove(e) {
    if (!joy.active || e.pointerId !== joy.id) return;
    e.preventDefault();
    updateJoy(e.clientX, e.clientY);
  }
  function onJoyUp(e) {
    if (!joy.active || (e && e.pointerId !== joy.id)) return;
    releaseJoy();
  }
  function updateJoy(px, py) {
    let dx = px - joy.cx, dy = py - joy.cy;
    const d = Math.hypot(dx, dy);
    if (d > JOY_RADIUS) { dx = (dx / d) * JOY_RADIUS; dy = (dy / d) * JOY_RADIUS; }
    setKnob(dx, dy);
    const m = Math.min(1, d / JOY_RADIUS);
    if (m < JOY_DEAD || d === 0) { joy.x = 0; joy.y = 0; return; }
    const k = (m - JOY_DEAD) / (1 - JOY_DEAD) / Math.max(1e-6, m);
    joy.x = (dx / JOY_RADIUS) * k; joy.y = (dy / JOY_RADIUS) * k;
    const len = Math.hypot(joy.x, joy.y);
    if (len > 1) { joy.x /= len; joy.y /= len; }
  }
  function releaseJoy() {
    if (joy.active && joy.zone && joy.id != null) { try { joy.zone.releasePointerCapture(joy.id); } catch (e) { /* ignore */ } }
    joy.active = false; joy.id = null; joy.x = 0; joy.y = 0;
    setKnob(0, 0);
    if (joy.el) joy.el.classList.remove('is-active');
    setJoyCenter(joy.hx, joy.hy, false);
  }

  function updateJoyVisibility(force) {
    if (!joy.el) return;
    const show = touchMode && inGame() && canWalkPhase() && !blocked() && !inVent();
    if (!show && joy.active) releaseJoy();
    if (show === joy.shown && !force) return;
    joy.shown = show;
    joy.el.classList.toggle('is-on', show);
    joy.zone.classList.toggle('is-on', show);
  }

  // ---------- public ----------
  const Input = (AS.Input = {
    init(app) {
      App = app || AS.App || null;
      if (inited) return;
      inited = true;
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', Input.reset);
      document.addEventListener('visibilitychange', () => { if (document.hidden) Input.reset(); });
      window.addEventListener('pointerdown', onPointerDownWorld, true);
      window.addEventListener('pointermove', onPointerMove, true);
      window.addEventListener('pointerup', onPointerUp, true);
      window.addEventListener('pointercancel', onPointerUp, true);
      window.addEventListener('resize', placeJoyHome);
      window.addEventListener('contextmenu', (e) => { if (e.target && e.target.id === 'world') e.preventDefault(); });
      buildJoystick();
      if (App && typeof App.on === 'function') {
        App.on('screen', (name) => { screenName = name; Input.reset(); updateJoyVisibility(true); });
        App.on('frame', () => updateJoyVisibility(false));
        App.on('phase', () => { mouse.active = false; updateJoyVisibility(true); });
      }
      updateJoyVisibility(true);
    },

    getMove() {
      if (blocked()) return { x: 0, y: 0 };
      if (joy.active) return { x: joy.x, y: joy.y };
      let x = 0, y = 0;
      for (const code of down) { const v = MOVE_KEYS[code]; if (v) { x += v[0]; y += v[1]; } }
      if (x || y) {
        x = Math.max(-1, Math.min(1, x)); y = Math.max(-1, Math.min(1, y));
        const l = Math.hypot(x, y);
        return { x: x / l, y: y / l };
      }
      if (mouse.active) {
        if (!inGame() || !canWalkPhase()) { mouse.active = false; return { x: 0, y: 0 }; }
        return mouseVector();
      }
      return { x: 0, y: 0 };
    },

    on(action, fn) { return em.on(action, fn); },
    off(action, fn) { em.off(action, fn); },
    trigger(action) { em.emit(action, null); },
    isTouch: () => touchMode,
    setTouch(on) { setTouchMode(on); },
    isDown: (code) => down.has(code),
    hint: (action) => HINTS[action] || '',
    joystickActive: () => joy.active,
    reset() {
      down.clear();
      mouse.active = false; mouse.id = null;
      releaseJoy();
    },
  });
})(globalThis.AS = globalThis.AS || {});
