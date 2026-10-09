/* AI IMPOSTOR: SPACE SHIP — Task panel host. Mini-games register here and are opened in a modal canvas panel.
 *
 *   AS.Tasks.register(gameId, factory, { w: 600, h: 600, titleKey: 'game.<id>.title' })
 *   factory(ctx) -> instance { update(dt), draw(g), pointerDown(x,y,id), pointerMove(x,y,id), pointerUp(x,y,id), keyDown?(key), destroy?() }
 *     All coordinates are LOGICAL (0..w, 0..h). `g` is a 2D context already transformed to logical units.
 *   ctx = { w, h, t, lang, sfx, loop, stopLoop, rng, now, memory, info, params, complete, close, hold, send, getState }
 *
 *   AS.Tasks.open(info)  info = { game, taskId?, step?, steps?, stationId?, panelId?, room?, sabotage?, params? }
 *   AS.Tasks.close(), AS.Tasks.isOpen(), AS.Tasks.current(), AS.Tasks.reset()
 *   Hooks (set by the app): AS.Tasks.onOpen(info), AS.Tasks.onComplete(info), AS.Tasks.onClose(info, completed),
 *                           AS.Tasks.getState() -> latest snapshot, AS.Tasks.send(action)
 */
(function (AS) {
  'use strict';

  const registry = {};
  const memory = {};
  let cur = null;

  AS.i18n.add({
    az: { 'task.complete': 'TAPŞIRIQ TAMAMLANDI!', 'task.fixed': 'DÜZƏLDİLDİ!', 'task.close': 'Bağla' },
    en: { 'task.complete': 'TASK COMPLETE!', 'task.fixed': 'FIXED!', 'task.close': 'Close' },
  });

  const Tasks = (AS.Tasks = {
    onOpen: null,
    onComplete: null,
    onClose: null,
    getState: () => (AS.App && AS.App.snap) || null,
    send: (a) => { if (AS.App && AS.App.send) AS.App.send(a); },

    register(gameId, factory, opts) {
      registry[gameId] = { factory, opts: Object.assign({ w: 600, h: 600, titleKey: 'game.' + gameId + '.title' }, opts || {}) };
    },
    has: (id) => !!registry[id],
    list: () => Object.keys(registry),
    isOpen: () => !!cur,
    current: () => (cur ? cur.info : null),
    reset() { for (const k in memory) delete memory[k]; },

    open(info) {
      if (cur) Tasks.close('replaced');
      const reg = registry[info.game];
      if (!reg) { console.warn('[Tasks] unknown game', info.game); return false; }
      const o = reg.opts;
      const memKey = (info.taskId || info.panelId || info.game) + ':' + (info.step || 0);
      if (!memory[memKey]) memory[memKey] = {};

      const parent = (typeof document !== 'undefined' && document.getElementById('task-layer')) || document.body;
      const root = document.createElement('div');
      root.className = 'task-overlay';
      root.innerHTML =
        '<div class="task-frame">' +
        '<div class="task-head"><span class="task-title"></span><button class="task-x" type="button" aria-label="close">✕</button></div>' +
        '<div class="task-canvas-wrap"><canvas class="task-canvas"></canvas><div class="task-done"></div></div>' +
        '</div>';
      parent.appendChild(root);
      const canvas = root.querySelector('canvas');
      const g = canvas.getContext('2d');
      root.querySelector('.task-title').textContent = AS.t(info.titleKey || o.titleKey);

      const state = { info, reg, root, canvas, g, inst: null, raf: 0, last: 0, completed: false, closing: false, scale: 1, memKey, doneTimer: 0 };
      cur = state;

      const ctx = {
        w: o.w, h: o.h,
        t: AS.t,
        lang: AS.i18n.getLang(),
        sfx: (name) => { if (AS.Audio) AS.Audio.play(name); },
        loop: (name) => { if (AS.Audio && AS.Audio.loop) AS.Audio.loop(name); },
        stopLoop: (name) => { if (AS.Audio && AS.Audio.stop) AS.Audio.stop(name); },
        rng: Math.random,
        now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000,
        memory: memory[memKey],
        info,
        params: info.params || {},
        complete: () => complete(state, 'task.complete'),
        close: () => { if (cur === state) Tasks.close('game'); },
        hold: (holding) => { if (info.panelId) Tasks.send({ type: 'fixPanel', panel: info.panelId, holding: !!holding }); },
        send: (a) => Tasks.send(a),
        getState: () => Tasks.getState(),
      };
      try {
        state.inst = reg.factory(ctx) || {};
      } catch (e) {
        console.error('[Tasks] factory failed for', info.game, e);
        root.remove(); cur = null; return false;
      }

      const toLogical = (e) => {
        const r = canvas.getBoundingClientRect();
        return [((e.clientX - r.left) / r.width) * o.w, ((e.clientY - r.top) / r.height) * o.h];
      };
      const call = (fn, ...a) => { try { if (state.inst[fn]) state.inst[fn](...a); } catch (err) { console.error('[Tasks] ' + info.game + '.' + fn, err); } };
      canvas.addEventListener('pointerdown', (e) => {
        if (state.completed) return;
        e.preventDefault();
        try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        const p = toLogical(e); call('pointerDown', p[0], p[1], e.pointerId);
      });
      canvas.addEventListener('pointermove', (e) => { if (state.completed) return; const p = toLogical(e); call('pointerMove', p[0], p[1], e.pointerId); });
      const up = (e) => { const p = toLogical(e); call('pointerUp', p[0], p[1], e.pointerId); };
      canvas.addEventListener('pointerup', up);
      canvas.addEventListener('pointercancel', up);
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      root.querySelector('.task-x').addEventListener('click', () => { if (AS.Audio) AS.Audio.play('back'); Tasks.close('user'); });
      root.addEventListener('pointerdown', (e) => { if (e.target === root) Tasks.close('user'); });
      state.onKey = (e) => {
        if (cur !== state) return;
        if (e.key === 'Escape') { Tasks.close('user'); return; }
        call('keyDown', e.key);
      };
      window.addEventListener('keydown', state.onKey);
      state.onResize = () => layout(state);
      window.addEventListener('resize', state.onResize);
      layout(state);

      const frame = (ts) => {
        if (cur !== state) return;
        const dt = state.last ? Math.min(0.05, (ts - state.last) / 1000) : 0;
        state.last = ts;
        // Sabotage panels auto-close when the sabotage is resolved (by anyone).
        if (info.sabotage && !state.completed) {
          const s = Tasks.getState();
          if (s && !(s.sabotage && s.sabotage.kind === info.sabotage)) complete(state, 'task.fixed', true);
        }
        if (!state.completed || state.inst.drawWhileDone !== false) call('update', dt);
        const dpr = state.dpr;
        g.setTransform(dpr * state.scale, 0, 0, dpr * state.scale, 0, 0);
        g.clearRect(0, 0, o.w, o.h);
        call('draw', g);
        if (state.doneTimer > 0) {
          state.doneTimer -= dt;
          if (state.doneTimer <= 0) { Tasks.close('complete'); return; }
        }
        state.raf = requestAnimationFrame(frame);
      };
      state.raf = requestAnimationFrame(frame);
      if (Tasks.onOpen) Tasks.onOpen(info);
      return true;
    },

    close(reason) {
      const s = cur;
      if (!s) return;
      cur = null;
      cancelAnimationFrame(s.raf);
      window.removeEventListener('keydown', s.onKey);
      window.removeEventListener('resize', s.onResize);
      try { if (s.inst && s.inst.destroy) s.inst.destroy(); } catch (e) { console.error(e); }
      if (s.info.panelId && s.info.sabotage === 'reactor') Tasks.send({ type: 'fixPanel', panel: s.info.panelId, holding: false });
      s.root.classList.add('closing');
      setTimeout(() => s.root.remove(), 160);
      if (Tasks.onClose) Tasks.onClose(s.info, s.completed, reason);
    },
  });

  function complete(state, labelKey, externallyFixed) {
    if (state.completed) return;
    state.completed = true;
    if (AS.Audio) AS.Audio.play('task_complete');
    const el = state.root.querySelector('.task-done');
    el.textContent = AS.t(labelKey);
    el.classList.add('show');
    state.doneTimer = 1.0;
    if (!externallyFixed && Tasks.onComplete) Tasks.onComplete(state.info);
  }

  function layout(state) {
    const o = state.reg.opts;
    const vw = window.innerWidth, vh = window.innerHeight;
    const maxW = vw * 0.94, maxH = vh * 0.94 - 56; // leave room for the header
    const scale = Math.max(0.3, Math.min(maxW / o.w, maxH / o.h, 1.6));
    state.scale = scale;
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const c = state.canvas;
    c.style.width = Math.round(o.w * scale) + 'px';
    c.style.height = Math.round(o.h * scale) + 'px';
    c.width = Math.round(o.w * scale * state.dpr);
    c.height = Math.round(o.h * scale * state.dpr);
  }

  // Inject minimal panel CSS (games draw everything else on their canvas).
  if (typeof document !== 'undefined' && !document.getElementById('taskhost-css')) {
    const st = document.createElement('style');
    st.id = 'taskhost-css';
    st.textContent = `
.task-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(2,4,12,.62);animation:fade-in .18s ease;pointer-events:auto;touch-action:none}
.task-overlay.closing{opacity:0;transition:opacity .15s}
.task-frame{display:flex;flex-direction:column;align-items:stretch;border-radius:22px;padding:8px 10px 10px;background:linear-gradient(180deg,#26305f,#151b3d);border:3px solid #3a4690;box-shadow:0 20px 60px rgba(0,0,0,.6),inset 0 2px 0 rgba(255,255,255,.12);animation:pop-in .22s cubic-bezier(.2,.8,.2,1)}
.task-head{display:flex;align-items:center;justify-content:space-between;gap:12px;height:44px;padding:0 4px 0 10px}
.task-title{font-family:var(--font-display,sans-serif);font-weight:700;font-size:20px;color:#fff;letter-spacing:.5px;text-shadow:0 2px 0 rgba(0,0,0,.4);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.task-x{width:38px;height:38px;border-radius:50%;border:0;cursor:pointer;font-size:18px;font-weight:900;color:#fff;background:linear-gradient(180deg,#ff5a6a,#d61f45);box-shadow:0 3px 0 #8c0f28}
.task-x:active{transform:translateY(2px);box-shadow:0 1px 0 #8c0f28}
.task-canvas-wrap{position:relative;border-radius:14px;overflow:hidden;background:#0b0f22}
.task-canvas{display:block;touch-action:none;cursor:pointer}
.task-done{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%) scale(.6);text-align:center;font-family:var(--font-display,sans-serif);font-weight:700;font-size:42px;color:#fff;opacity:0;pointer-events:none;text-shadow:-3px -3px 0 #000,3px -3px 0 #000,-3px 3px 0 #000,3px 3px 0 #000,0 0 24px rgba(52,224,124,.9);transition:all .25s cubic-bezier(.2,.8,.2,1);background:rgba(0,0,0,.35);padding:18px 0}
.task-done.show{opacity:1;transform:translateY(-50%) scale(1)}
@media (max-height:500px){.task-head{height:36px}.task-title{font-size:16px}.task-x{width:32px;height:32px}}
`;
    document.head.appendChild(st);
  }
})(globalThis.AS = globalThis.AS || {});
