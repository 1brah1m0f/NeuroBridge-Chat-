/* AI IMPOSTOR: SPACE SHIP — in-game HUD. Owner: hud.
 *
 *   AS.HUD.init(App)                      builds #hud content + overlays in #modal-layer, listens to App 'frame'
 *   AS.HUD.openOverlay(kind)              'map' | 'sabotage' | 'admin' | 'cams'   (App.block('hud', true) while open)
 *   AS.HUD.closeOverlay(), AS.HUD.overlay() -> kind|null
 *   AS.HUD.use(), .report(), .kill(), .vent(), .ventMove(id), .sabotage(kind, room?), .toggleMap()
 *   AS.HUD.state() -> last computed interaction state (targets), AS.HUD.refresh() (force full DOM refresh)
 * Every frame (phase 'playing') it determines usable targets from App.snap / App.view.me / App.map and writes
 * App.view.highlights = { station, panel, button, console, vent, body, target } for the renderer.
 * Visible only in phase 'playing' on the game screen (the settings gear also shows in the lobby).
 */
(function (AS) {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const T = AS.T;
  const U = AS.util;
  const t = (k, p) => AS.t(k, p);
  const up = (s) => (AS.i18n && AS.i18n.upper ? AS.i18n.upper(s) : String(s).toUpperCase());

  AS.i18n.add({
    az: {
      'hud.use': 'İstifadə', 'hud.report': 'Bildir', 'hud.kill': 'Öldür', 'hud.vent': 'Kanal', 'hud.ventExit': 'Çıx',
      'hud.sabotage': 'Sabotaj', 'hud.map': 'Xəritə', 'hud.fix': 'Düzəlt', 'hud.emergency': 'Yığıncaq',
      'hud.admin': 'Nəzarət', 'hud.cams': 'Kameralar', 'hud.settings': 'Ayarlar',
      'hud.tasks': 'Tapşırıqlar', 'hud.totalTasks': 'Tamamlanan tapşırıqlar',
      'hud.impostorGoal': 'Sabotaj et və hamını öldür.', 'hud.fakeTasks': 'Saxta tapşırıqlar:',
      'hud.ghostCrew': 'Sən öldün. Tapşırıqlarını bitirərək komandana kömək et!',
      'hud.ghostImpostor': 'Sən öldün, amma sabotaj etməyə davam edə bilərsən.',
      'hud.commsDown': 'Rabitə pozulub', 'hud.commsDownHint': 'Tapşırıqları görmək üçün rabitəni bərpa et.',
      'hud.alert.reactor': 'Reaktor partlayır: {time}', 'hud.alert.o2': 'Oksigen tükənir: {time}',
      'hud.alert.reactorHint': 'Hər iki əl skanerini eyni anda basıb saxlayın ({n}/2)',
      'hud.alert.o2Hint': 'Hər iki paneldə kodu daxil edin ({n}/2)',
      'hud.alert.lights': 'İşıqlar sönüb! Elektrik otağında düzəldin.',
      'hud.alert.comms': 'Rabitə pozulub! Rabitə otağında bərpa edin.',
      'hud.err.noMeetings': 'Təcili yığıncaq haqqın qalmayıb',
      'hud.err.meetingCooldown': 'Təcili düymə {n} saniyəyə hazır olacaq',
      'hud.err.crisis': 'Təhlükə vaxtı yığıncaq çağırmaq olmaz!',
      'hud.err.sabCooldown': 'Sabotaj {n} saniyəyə hazır olacaq', 'hud.err.sabActive': 'Artıq bir sabotaj gedir',
      'hud.err.doorCooldown': 'Bu qapılar {n} saniyəyə hazır olacaq', 'hud.err.doorsClosed': 'Bu qapılar artıq bağlıdır',
      'hud.err.noTaskGame': 'Bu tapşırıq hələ hazır deyil',
      'hud.mapTitle': 'Gəmi xəritəsi', 'hud.sabTitle': 'Sabotaj', 'hud.adminTitle': 'Nəzarət xəritəsi',
      'hud.camsTitle': 'Təhlükəsizlik kameraları',
      'hud.legend.tasks': 'Tapşırıqların', 'hud.legend.sabotage': 'Sabotaj', 'hud.legend.you': 'Sən',
      'hud.legend.players': 'Oyunçular', 'hud.legend.doors': 'Qapılar',
      'hud.sabHint': 'Sabotaj etmək üçün otaqdakı nişana toxun', 'hud.adminHint': 'Hər nöqtə bir oyunçudur',
      'hud.noSignal': 'SİQNAL YOXDUR', 'hud.live': 'CANLI', 'hud.closed': 'Bağlı',
      'hud.ventHint': 'Başqa kanala keçmək üçün oxu seç',
    },
    en: {
      'hud.use': 'Use', 'hud.report': 'Report', 'hud.kill': 'Kill', 'hud.vent': 'Vent', 'hud.ventExit': 'Exit',
      'hud.sabotage': 'Sabotage', 'hud.map': 'Map', 'hud.fix': 'Fix', 'hud.emergency': 'Meeting',
      'hud.admin': 'Admin', 'hud.cams': 'Cameras', 'hud.settings': 'Settings',
      'hud.tasks': 'Tasks', 'hud.totalTasks': 'Total tasks completed',
      'hud.impostorGoal': 'Sabotage and kill everyone.', 'hud.fakeTasks': 'Fake tasks:',
      'hud.ghostCrew': 'You are dead. Finish your tasks to help your team!',
      'hud.ghostImpostor': 'You are dead, but you can still sabotage.',
      'hud.commsDown': 'Comms sabotaged', 'hud.commsDownHint': 'Restore comms to see your tasks.',
      'hud.alert.reactor': 'Reactor meltdown in {time}', 'hud.alert.o2': 'Oxygen depleted in {time}',
      'hud.alert.reactorHint': 'Hold both hand scanners at the same time ({n}/2)',
      'hud.alert.o2Hint': 'Enter the code at both panels ({n}/2)',
      'hud.alert.lights': 'Lights out! Fix them in Electrical.',
      'hud.alert.comms': 'Comms down! Restore them in Comms.',
      'hud.err.noMeetings': 'No emergency meetings left',
      'hud.err.meetingCooldown': 'Emergency button ready in {n}s',
      'hud.err.crisis': "Can't call a meeting during a crisis!",
      'hud.err.sabCooldown': 'Sabotage ready in {n}s', 'hud.err.sabActive': 'A sabotage is already active',
      'hud.err.doorCooldown': 'These doors are ready in {n}s', 'hud.err.doorsClosed': 'These doors are already closed',
      'hud.err.noTaskGame': 'This task is not available yet',
      'hud.mapTitle': 'Ship map', 'hud.sabTitle': 'Sabotage', 'hud.adminTitle': 'Admin map',
      'hud.camsTitle': 'Security cameras',
      'hud.legend.tasks': 'Your tasks', 'hud.legend.sabotage': 'Sabotage', 'hud.legend.you': 'You',
      'hud.legend.players': 'Players', 'hud.legend.doors': 'Doors',
      'hud.sabHint': 'Tap a room icon to sabotage', 'hud.adminHint': 'Each dot is a player',
      'hud.noSignal': 'NO SIGNAL', 'hud.live': 'LIVE', 'hud.closed': 'Closed',
      'hud.ventHint': 'Pick an arrow to move to another vent',
    },
  });

  // ---------------------------------------------------------------- icons (inline SVG, 64x64)
  const INK = '#0b1022';
  const svg = (inner, extra) =>
    '<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false" stroke="' + INK + '" stroke-width="4" ' +
    'stroke-linejoin="round" stroke-linecap="round"' + (extra || '') + '>' + inner + '</svg>';
  const P = (pts) => pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join(' ') + ' Z';

  function gearPath() {
    const cx = 32, cy = 32, ro = 27, ri = 20, n = 8, pts = [];
    for (let j = 0; j < n; j++) {
      const a = (j / n) * Math.PI * 2, w2 = (Math.PI / n) * 0.66, w1 = (Math.PI / n) * 0.36;
      pts.push([cx + Math.cos(a - w2) * ri, cy + Math.sin(a - w2) * ri]);
      pts.push([cx + Math.cos(a - w1) * ro, cy + Math.sin(a - w1) * ro]);
      pts.push([cx + Math.cos(a + w1) * ro, cy + Math.sin(a + w1) * ro]);
      pts.push([cx + Math.cos(a + w2) * ri, cy + Math.sin(a + w2) * ri]);
    }
    return P(pts) + ' M41 32 A9 9 0 1 0 23 32 A9 9 0 1 0 41 32 Z';
  }
  function trefoilPath() {
    let d = '';
    for (let j = 0; j < 3; j++) {
      const c = -Math.PI / 2 + (j * Math.PI * 2) / 3, a0 = c - Math.PI / 6, a1 = c + Math.PI / 6, r1 = 9, r2 = 22;
      const pt = (r, a) => (32 + Math.cos(a) * r).toFixed(2) + ' ' + (33 + Math.sin(a) * r).toFixed(2);
      d += 'M' + pt(r1, a0) + ' L' + pt(r2, a0) + ' A' + r2 + ' ' + r2 + ' 0 0 1 ' + pt(r2, a1) +
        ' L' + pt(r1, a1) + ' A' + r1 + ' ' + r1 + ' 0 0 0 ' + pt(r1, a0) + ' Z ';
    }
    return d;
  }

  const ICON = {
    use: svg(
      '<path d="M29 2v4M18 6l3 3M40 6l-3 3" fill="none" stroke="currentColor" stroke-width="3.5"/>' +
      '<path fill="currentColor" d="M24 38V17a5 5 0 0 1 10 0v16a5 5 0 0 1 9 1a5 5 0 0 1 9 2v11c0 8-6 14-14 14h-5c-6 0-9-3-12-7l-8-11a4.5 4.5 0 0 1 7-6l4 4z"/>' +
      '<path d="M34 33v6M43 34v5" fill="none" stroke-width="3"/>'),
    report: svg(
      '<path fill="currentColor" d="M8 26h9l24-13v38L17 38H8a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3z"/>' +
      '<path fill="currentColor" d="M13 38l4 15h8l-3-15z"/>' +
      '<path d="M48 25q5 7 0 14M54 19q10 13 0 26" fill="none" stroke="currentColor" stroke-width="4.5"/>'),
    kill: svg(
      '<path fill="#eef3ff" d="M28 40L50 10q5-5 7 1L35 47z"/>' +
      '<path d="M36 41L53 15" fill="none" stroke="#aeb9d3" stroke-width="2.5"/>' +
      '<path d="M20 35l18 16" fill="none" stroke-width="10"/><path d="M20 35l18 16" fill="none" stroke="#c9d3ea" stroke-width="4.5"/>' +
      '<path d="M27 46L12 60" fill="none" stroke-width="14"/><path d="M27 46L12 60" fill="none" stroke="currentColor" stroke-width="7.5"/>'),
    vent: svg(
      '<rect x="7" y="16" width="50" height="34" rx="8" fill="currentColor"/>' +
      '<path d="M16 26h32M16 33h32M16 40h32" fill="none" stroke-width="4"/>' +
      '<circle cx="12" cy="21" r="1.5" fill="' + INK + '" stroke="none"/><circle cx="52" cy="21" r="1.5" fill="' + INK + '" stroke="none"/>' +
      '<circle cx="12" cy="45" r="1.5" fill="' + INK + '" stroke="none"/><circle cx="52" cy="45" r="1.5" fill="' + INK + '" stroke="none"/>'),
    sabotage: svg(
      '<path fill="currentColor" d="M32 6L59 54q1 3-2 3H7q-3 0-2-3z"/>' +
      '<path fill="#ffe14d" stroke-width="3" d="M35 18L23 37h8l-3 13 13-20h-8z"/>'),
    map: svg(
      '<path fill="currentColor" d="M6 15l16-6 20 6 16-6v40l-16 6-20-6-16 6z"/>' +
      '<path d="M22 9v40M42 15v40" fill="none" stroke-width="3"/>' +
      '<path fill="#ff4d5e" stroke-width="3" d="M32 21a6 6 0 0 1 6 6c0 5-6 11-6 11s-6-6-6-11a6 6 0 0 1 6-6z"/>'),
    fix: svg('<path fill="currentColor" d="M45 6a14 14 0 0 0-13 19L8 49a5.5 5.5 0 0 0 8 8l24-24a14 14 0 0 0 19-13l-8 8-8-2-2-8z"/>'),
    emergency: svg(
      '<path d="M32 4v7M11 13l5 5M53 13l-5 5M4 33h6M54 33h6" fill="none" stroke="currentColor" stroke-width="4.5"/>' +
      '<path fill="#ff4d5e" d="M14 46a18 18 0 0 1 36 0z"/>' +
      '<path d="M23 38a10 10 0 0 1 7-8" fill="none" stroke="#ffd0d5" stroke-width="3.5"/>' +
      '<rect x="8" y="45" width="48" height="11" rx="4" fill="currentColor"/>'),
    admin: svg(
      '<path fill="currentColor" opacity=".45" stroke="none" d="M14 44L32 8l18 36z"/>' +
      '<circle cx="26" cy="30" r="3.5" fill="#fff" stroke-width="2.5"/><circle cx="36" cy="23" r="3.5" fill="#fff" stroke-width="2.5"/><circle cx="36" cy="36" r="3.5" fill="#fff" stroke-width="2.5"/>' +
      '<path fill="currentColor" d="M7 44h50l-7 13H14z"/>'),
    cams: svg(
      '<path d="M22 46l-6 11h16" fill="none" stroke="currentColor" stroke-width="5"/>' +
      '<rect x="5" y="19" width="38" height="27" rx="6" fill="currentColor"/>' +
      '<path fill="currentColor" d="M43 28l15-9v28l-15-9z"/>' +
      '<circle cx="15" cy="28" r="4" fill="#ff4d5e" stroke-width="2.5"/>'),
    gear: svg('<path fill="currentColor" fill-rule="evenodd" d="' + gearPath() + '"/>'),
    arrow: svg('<path fill="currentColor" d="M10 24h24V11l22 21-22 21V40H10z"/>'),
    lights: svg(
      '<path fill="currentColor" d="M32 5a17 17 0 0 0-10 31c3 2 4 5 4 9h12c0-4 1-7 4-9A17 17 0 0 0 32 5z"/>' +
      '<path d="M26 22a7 7 0 0 1 6-6" fill="none" stroke="#fff" stroke-width="3.5"/>' +
      '<path d="M25 51h14M27 58h10" fill="none" stroke-width="4.5"/>'),
    comms: svg(
      '<path d="M18 46l-6 13h20" fill="none" stroke="currentColor" stroke-width="5"/>' +
      '<path fill="currentColor" d="M7 19c0 20 16 37 37 37z"/>' +
      '<path d="M24 39l15-15" fill="none" stroke-width="4"/><circle cx="41" cy="22" r="4.5" fill="currentColor" stroke-width="3"/>' +
      '<path d="M47 12a9 9 0 0 1 6 6M49 4a17 17 0 0 1 11 11" fill="none" stroke="currentColor" stroke-width="4"/>'),
    reactor: svg('<circle cx="32" cy="33" r="27" fill="currentColor"/><path fill="' + INK + '" stroke="none" d="' + trefoilPath() + '"/><circle cx="32" cy="33" r="5" fill="' + INK + '" stroke="none"/>'),
    o2: svg(
      '<circle cx="30" cy="35" r="24" fill="currentColor"/><circle cx="52" cy="12" r="6" fill="currentColor" stroke-width="3"/><circle cx="57" cy="27" r="3.5" fill="currentColor" stroke-width="2.5"/>' +
      '<text x="27" y="45" text-anchor="middle" font-size="28" font-weight="700" fill="' + INK + '" stroke="none" font-family="Fredoka, Nunito, sans-serif">O</text>' +
      '<text x="43" y="50" text-anchor="middle" font-size="15" font-weight="800" fill="' + INK + '" stroke="none" font-family="Fredoka, Nunito, sans-serif">2</text>'),
    door: svg(
      '<rect x="10" y="6" width="34" height="52" rx="4" fill="currentColor"/>' +
      '<rect x="16" y="12" width="22" height="16" rx="2" fill="none" stroke-width="3"/>' +
      '<rect x="34" y="36" width="24" height="20" rx="4" fill="#ffd23f"/>' +
      '<path d="M39 36v-5a7 7 0 0 1 14 0v5" fill="none" stroke-width="4"/>'),
    chevron: svg('<path d="M16 24l16 16 16-16" fill="none" stroke="currentColor" stroke-width="8"/>'),
    close: svg('<path d="M18 18l28 28M46 18L18 46" fill="none" stroke="currentColor" stroke-width="8"/>'),
    tasks: svg(
      '<rect x="11" y="9" width="42" height="50" rx="6" fill="currentColor"/>' +
      '<rect x="22" y="4" width="20" height="10" rx="3" fill="#9fb0d6"/>' +
      '<path d="M19 27l4 4 7-8M19 43l4 4 7-8M35 28h10M35 44h10" fill="none" stroke-width="4"/>'),
    warn: svg('<path fill="currentColor" d="M32 6L59 54q1 3-2 3H7q-3 0-2-3z"/><path d="M32 22v16" fill="none" stroke-width="6"/><circle cx="32" cy="47" r="3.5" fill="' + INK + '" stroke="none"/>'),
  };

  // ---------------------------------------------------------------- small DOM helpers (touch DOM only on change)
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function h(tag, cls, html) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html != null) el.innerHTML = html;
    return el;
  }
  function txt(el, s) { s = s == null ? '' : String(s); if (el._txt !== s) { el._txt = s; el.textContent = s; } }
  function htm(el, s) { if (el._htm !== s) { el._htm = s; el.innerHTML = s; } }
  function cls(el, c, on) { on = !!on; const k = '_c_' + c; if (el[k] !== on) { el[k] = on; el.classList.toggle(c, on); } }
  function sty(el, prop, v) { const k = '_s_' + prop; if (el[k] !== v) { el[k] = v; el.style.setProperty(prop, v); } }
  function attr(el, a, v) { const k = '_a_' + a; if (el[k] !== v) { el[k] = v; if (v == null) el.removeAttribute(a); else el.setAttribute(a, v); } }
  function onPress(el, fn) {
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      fn(e);
    });
    el.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  const sfx = (name, o) => { try { if (AS.Audio && AS.Audio.play) AS.Audio.play(name, o); } catch (e) { /* ignore */ } };
  function toast(text, ms) {
    if (App && typeof App.toast === 'function') { App.toast(text, ms || 1800); return; }
    const layer = document.getElementById('toast-layer') || document.body;
    const el = h('div', 'toast hud-toast');
    el.textContent = text;
    layer.appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity .25s'; el.style.opacity = '0'; }, (ms || 1800) - 250);
    setTimeout(() => el.remove(), ms || 1800);
  }
  function toScreen(x, y) {
    let r = null;
    try {
      if (AS.Renderer && typeof AS.Renderer.worldToScreen === 'function') r = AS.Renderer.worldToScreen(x, y);
      else if (App && typeof App.worldToScreen === 'function') r = App.worldToScreen(x, y);
    } catch (e) { r = null; }
    if (Array.isArray(r) && isFinite(r[0]) && isFinite(r[1])) return { x: r[0], y: r[1] };
    if (r && isFinite(r.x) && isFinite(r.y)) return { x: r.x, y: r.y };
    return null;
  }
  function colorOf(id) { const c = AS.COLOR_BY_ID && AS.COLOR_BY_ID[id]; return c || { main: '#9fb0d6', shade: '#55607f' }; }

  // ---------------------------------------------------------------- map cache
  const SAB_ROOM_PREF = { lights: 'electrical', comms: 'comms', reactor: 'reactor', o2: 'oxygen' };
  const SAB_KINDS = ['reactor', 'o2', 'lights', 'comms'];
  let MC = null;

  function mapCache() {
    const map = App && App.map;
    if (!map) return null;
    if (MC && MC.map === map) return MC;
    const c = {
      map, stations: {}, panels: {}, vents: {}, consoles: {}, rooms: [], roomById: {}, halls: [],
      doorsByRoom: {}, doorRooms: [], sabRoom: {}, bounds: null, cameras: map.cameras || [],
    };
    (map.stations || []).forEach((s) => (c.stations[s.id] = s));
    (map.panels || []).forEach((p) => (c.panels[p.id] = p));
    (map.vents || []).forEach((v) => (c.vents[v.id] = v));
    (map.consoles || []).forEach((k) => (c.consoles[k.id] = k));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const grow = (r) => { x0 = Math.min(x0, r[0]); y0 = Math.min(y0, r[1]); x1 = Math.max(x1, r[0] + r[2]); y1 = Math.max(y1, r[1] + r[3]); };
    (map.rooms || []).forEach((r) => {
      if (r.lobby || r.id === 'lobby') return;
      const rects = [r.rect].concat(r.extra || []);
      const lbl = r.label || U.rectCenter(r.rect);
      const room = { id: r.id, nameKey: r.nameKey || 'room.' + r.id, rects, cx: lbl[0], cy: lbl[1], main: r.rect };
      rects.forEach(grow);
      c.rooms.push(room);
      c.roomById[r.id] = room;
    });
    (map.halls || []).forEach((hl) => { c.halls.push(hl.rect); grow(hl.rect); });
    if (!isFinite(x0)) { x0 = 0; y0 = 0; x1 = map.width || 1000; y1 = map.height || 1000; }
    c.bounds = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    (map.doors || []).forEach((d) => {
      if (!c.doorsByRoom[d.room]) { c.doorsByRoom[d.room] = []; c.doorRooms.push(d.room); }
      c.doorsByRoom[d.room].push(d.id);
    });
    SAB_KINDS.forEach((k) => {
      const ps = (map.panels || []).filter((p) => p.kind === k);
      if (!ps.length) return;
      const pref = SAB_ROOM_PREF[k];
      c.sabRoom[k] = ps.some((p) => p.room === pref) && c.roomById[pref] ? pref : ps[0].room;
    });
    MC = c;
    return c;
  }

  function roomName(id) {
    if (!id) return '';
    const r = MC && MC.roomById[id];
    return t(r ? r.nameKey : 'room.' + id);
  }

  function roomAt(x, y) {
    if (App && App.geo && typeof App.geo.roomAt === 'function') {
      try { return App.geo.roomAt(x, y); } catch (e) { /* fall through */ }
    }
    const M = mapCache();
    if (!M) return null;
    for (const r of M.rooms) for (const rc of r.rects) if (U.pointInRect(x, y, rc)) return r.id;
    return null;
  }

  function los(x1, y1, x2, y2) {
    const g = App && App.geo;
    if (!g || typeof g.lineOfSight !== 'function') return true;
    try { return !!g.lineOfSight(x1, y1, x2, y2); } catch (e) { return true; }
  }
  // Lenient LOS for interactables mounted on walls/props: target point or a point nudged toward the viewer.
  function losSoft(x1, y1, x2, y2) {
    if (los(x1, y1, x2, y2)) return true;
    const d = Math.hypot(x1 - x2, y1 - y2) || 1;
    const k = Math.min(1, 34 / d);
    return los(x1, y1, x2 + (x1 - x2) * k, y2 + (y1 - y2) * k);
  }

  // ---------------------------------------------------------------- module state
  let App = null;
  let inited = false;
  let screenName = null;
  let root = null, gearWrap = null;
  const E = {};          // element refs
  const B = {};          // action buttons
  let st = null;         // last computed interaction state
  const hl = { station: null, panel: null, button: null, console: null, vent: null, body: null, target: null };
  let lastTaskSig = '';
  let lastRoom = undefined, roomHideAt = 0;
  let alarmOn = false;
  let killCdMax = 0, emCdMax = 0, prevKillCd = 0;
  let lastVentAct = -1;
  let ventDirLatch = false;
  let ventArrowsFor = null;
  const ventArrows = [];
  let ov = null;         // open overlay
  let nowT = 0;
  let lastPhase = null;

  // ================================================================ helpers on snapshot
  const snap = () => App && App.snap;
  function meSnap() { try { return App.me ? App.me() : null; } catch (e) { return null; } }
  function mePos() { const v = App.view && App.view.me; const m = meSnap(); return v && v.x != null ? v : m; }
  const playing = () => { const s = snap(); return !!(s && s.phase === 'playing' && App.screen === 'game'); };

  // ================================================================ DOM
  function build() {
    root = document.getElementById('hud');
    root.innerHTML = '';
    root.classList.add('hud-root');
    E.tasks = h('div', 'hud-tasks interactive');
    E.tasksHead = h('button', 'hud-tasks-head', ICON.tasks + '<span></span>');
    E.tasksBody = h('div', 'hud-tasks-body');
    E.barWrap = h('div', 'hud-total');
    E.barLabel = h('div', 'hud-total-label');
    E.bar = h('div', 'hud-total-bar', '<i></i>');
    E.barWrap.append(E.barLabel, E.bar);
    E.tasks.append(E.barWrap, E.tasksHead, E.tasksBody);
    onPress(E.tasksHead, () => E.tasks.classList.toggle('collapsed'));
    E.alert = h('div', 'hud-alert hidden');
    E.edges = h('div', 'hud-edges hidden');
    E.room = h('div', 'hud-room');
    E.top = h('div', 'hud-top interactive');
    gearWrap = h('button', 'hud-btn-sm', ICON.gear);
    onPress(gearWrap, () => { if (AS.UIMenu && AS.UIMenu.openSettings) AS.UIMenu.openSettings({ inGame: true }); });
    E.mapBtn = h('button', 'hud-btn-sm', ICON.map);
    onPress(E.mapBtn, () => toggleMap());
    E.top.append(E.mapBtn, gearWrap);
    E.actions = h('div', 'hud-actions interactive');
    for (const k of ['sabotage', 'vent', 'kill', 'report', 'use']) {
      const b = h('button', 'hud-act hud-act--' + k, '<span class="ico">' + (ICON[k] || '') + '</span><span class="lbl"></span><span class="cd"></span>');
      B[k] = b;
      E.actions.appendChild(b);
      onPress(b, () => { if (!b.classList.contains('off')) HUD[k](); });
    }
    E.vents = h('div', 'hud-vents interactive');
    root.append(E.edges, E.tasks, E.alert, E.room, E.top, E.actions, E.vents);
  }

  // ================================================================ interaction state
  function compute() {
    const s = snap(), me = meSnap(), pos = mePos(), M = mapCache();
    const out = { station: null, task: null, panel: null, button: false, console: null, vent: null, body: null, target: null };
    if (!s || !me || !pos || !M || s.phase !== 'playing') return out;
    const alive = me.alive !== false && s.self && s.self.alive !== false;
    const imp = s.self && s.self.role === 'impostor';
    const near = (o, r) => o && Math.hypot(o.x - pos.x, o.y - pos.y) <= r && losSoft(pos.x, pos.y, o.x, o.y);
    if (s.self && s.self.inVent) { out.vent = M.vents[s.self.inVent] || null; return out; }
    if (alive && s.sabotage && s.sabotage.panels) {
      for (const id in s.sabotage.panels) { const pn = M.panels[id]; if (pn && !s.sabotage.panels[id].done && near(pn, T.USE_RANGE)) { out.panel = pn; break; } }
    }
    if (!imp && s.self && s.self.tasks) {
      for (const tk of s.self.tasks) {
        if (tk.done || tk.fake) continue;
        const stp = tk.steps[tk.step]; const so = stp && M.stations[stp.station];
        if (so && near(so, T.USE_RANGE)) { out.station = so; out.task = tk; break; }
      }
    }
    if (alive) {
      if (near(App.map.button, T.BUTTON_RANGE)) out.button = true;
      for (const id in M.consoles) if (near(M.consoles[id], T.USE_RANGE)) { out.console = M.consoles[id]; break; }
      let bd = T.REPORT_RANGE;
      for (const b of s.bodies || []) { const d = Math.hypot(b.x - pos.x, b.y - pos.y); if (d <= bd && los(pos.x, pos.y, b.x, b.y)) { bd = d; out.body = b; } }
      if (imp) {
        for (const id in M.vents) if (near(M.vents[id], T.VENT_RANGE)) { out.vent = M.vents[id]; break; }
        const kd = T.KILL_DIST[s.settings.killDistance] || 140;
        let best = kd;
        for (const p of s.players) {
          if (p.id === me.id || !p.alive || p.left || p.x == null || p.role === 'impostor') continue;
          const v = App.view.players && App.view.players[p.id]; const px = v ? v.x : p.x, py = v ? v.y : p.y;
          const d = Math.hypot(px - pos.x, py - pos.y);
          if (d <= best && los(pos.x, pos.y, px, py)) { best = d; out.target = p; }
        }
      }
    }
    return out;
  }

  // ================================================================ actions
  const HUD = {};
  HUD.use = function () {
    if (!playing() || !st) return;
    const s = snap();
    if (st.panel) {
      const pn = st.panel;
      AS.Tasks.open({ game: pn.game, panelId: pn.id, sabotage: pn.kind, room: pn.room, params: { room: pn.room } });
    } else if (st.station && st.task) {
      const tk = st.task, step = tk.steps[tk.step];
      if (!AS.Tasks.has || !AS.Tasks.has(step.game)) { toast(t('hud.err.noTaskGame')); return; }
      AS.Tasks.open({ game: step.game, taskId: tk.id, step: tk.step, steps: tk.steps.length, stationId: step.station, room: step.room, params: { room: step.room } });
    } else if (st.button) {
      const se = s.self;
      if (se.emergencyLeft <= 0) toast(t('hud.err.noMeetings'));
      else if (s.sabotage && AS.CRITICAL_SABOTAGES.indexOf(s.sabotage.kind) >= 0) toast(t('hud.err.crisis'));
      else if (se.emergencyCooldown > 0) toast(t('hud.err.meetingCooldown', { n: Math.ceil(se.emergencyCooldown) }));
      else { App.send({ type: 'emergency' }); sfx('click'); }
    } else if (st.console) openOverlay(st.console.kind === 'admin' ? 'admin' : 'cams');
  };
  HUD.report = function () { if (playing() && st && st.body) App.send({ type: 'report', body: st.body.id }); };
  HUD.kill = function () { const s = snap(); if (playing() && st && st.target && !(s.self.killCooldown > 0)) App.send({ type: 'kill', target: st.target.id }); };
  HUD.vent = function () {
    const s = snap();
    if (!playing() || !s.self || s.self.role !== 'impostor') return;
    const now = performance.now();
    if (now - lastVentAct < 400) return;
    lastVentAct = now;
    if (s.self.inVent) App.send({ type: 'ventExit' });
    else if (st && st.vent) App.send({ type: 'vent', vent: st.vent.id });
  };
  HUD.ventMove = function (id) { App.send({ type: 'ventMove', to: id }); sfx('vent_move'); };
  HUD.sabotage = function (kind, room) {
    if (kind == null) { openOverlay('sabotage'); return; }
    const s = snap();
    if (kind === 'doors') {
      const cd = s.self.doorCooldowns && s.self.doorCooldowns[room];
      if (cd > 0) { toast(t('hud.err.doorCooldown', { n: Math.ceil(cd) })); return; }
    } else {
      if (s.sabotage) { toast(t('hud.err.sabActive')); return; }
      if (s.self.sabotageCooldown > 0) { toast(t('hud.err.sabCooldown', { n: Math.ceil(s.self.sabotageCooldown) })); return; }
    }
    App.send({ type: 'sabotage', kind, room });
    sfx('click');
    if (kind !== 'doors') closeOverlay();
  };
  function toggleMap() { if (ov) closeOverlay(); else openOverlay(snap() && snap().self && snap().self.role === 'impostor' ? 'sabotage' : 'map'); }
  HUD.toggleMap = toggleMap;

  // ================================================================ overlays
  function openOverlay(kind) {
    closeOverlay();
    const layer = document.getElementById('modal-layer') || document.body;
    const el = h('div', 'hud-ov modal-backdrop');
    const box = h('div', 'hud-ov-box panel hud-ov--' + kind);
    const title = { map: 'hud.mapTitle', sabotage: 'hud.sabTitle', admin: 'hud.adminTitle', cams: 'hud.camsTitle' }[kind];
    const head = h('div', 'hud-ov-head', '<b>' + esc(t(title)) + '</b>');
    const x = h('button', 'hud-btn-sm', ICON.close);
    onPress(x, closeOverlay);
    head.appendChild(x);
    box.appendChild(head);
    const area = h('div', 'hud-ov-area');
    box.appendChild(area);
    el.appendChild(box);
    el.addEventListener('pointerdown', (e) => { if (e.target === el) closeOverlay(); });
    layer.appendChild(el);
    ov = { kind, el, area, canvases: [] };
    if (kind === 'cams') {
      area.classList.add('hud-cams');
      for (let i = 0; i < 4; i++) { const c = h('canvas'); area.appendChild(c); ov.canvases.push(c); }
    } else { const c = h('canvas'); area.appendChild(c); ov.canvases.push(c); }
    if (kind === 'sabotage') { ov.sabLayer = h('div', 'hud-sab-layer'); area.appendChild(ov.sabLayer); }
    App.block('hud', true);
    drawOverlay();
  }
  function closeOverlay() { if (!ov) return; ov.el.remove(); ov = null; App.block('hud', false); }
  function fitCanvas(c) {
    const r = c.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(10, Math.round(r.width * d)), hh = Math.max(10, Math.round(r.height * d));
    if (c.width !== w || c.height !== hh) { c.width = w; c.height = hh; }
    const g = c.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0);
    return { g, w: r.width, h: r.height };
  }
  function noise(g, w, hh) {
    g.fillStyle = '#111'; g.fillRect(0, 0, w, hh);
    for (let k = 0; k < 300; k++) { g.fillStyle = Math.random() < 0.5 ? '#333' : '#777'; g.fillRect(Math.random() * w, Math.random() * hh, 3, 2); }
    g.fillStyle = '#fff'; g.font = '700 18px Fredoka, sans-serif'; g.textAlign = 'center'; g.fillText(t('hud.noSignal'), w / 2, hh / 2);
  }
  function drawOverlay() {
    if (!ov) return;
    const s = snap(), M = mapCache(), R = AS.Renderer;
    if (!s || !M || !R) return;
    const comms = s.sabotage && s.sabotage.kind === 'comms';
    if (ov.kind === 'cams') {
      const cams = M.cameras.slice(0, 4);
      ov.canvases.forEach((c, i) => {
        const f = fitCanvas(c), cam = cams[i];
        if (comms || !cam || !R.renderCamera) { noise(f.g, f.w, f.h); return; }
        try { R.renderCamera(f.g, f.w, f.h, cam.x, cam.y, 700); } catch (e) { /* ignore */ }
        f.g.fillStyle = '#e8343b'; f.g.beginPath(); f.g.arc(14, 14, 5, 0, 7); f.g.fill();
        f.g.fillStyle = '#fff'; f.g.font = '700 12px Nunito, sans-serif'; f.g.textAlign = 'left'; f.g.fillText(t('hud.live'), 24, 18);
      });
      return;
    }
    const f = fitCanvas(ov.canvases[0]), g = f.g;
    g.clearRect(0, 0, f.w, f.h);
    const markers = [];
    const opts = { me: true, markers, sabotageRooms: [] };
    if (s.self && s.self.tasks && s.self.role !== 'impostor' && !comms) {
      for (const tk of s.self.tasks) { if (tk.done) continue; const so = M.stations[tk.steps[tk.step].station]; if (so) markers.push({ x: so.x, y: so.y, kind: 'task' }); }
    }
    if (s.sabotage) for (const id in s.sabotage.panels) { const pn = M.panels[id]; if (pn && !s.sabotage.panels[id].done) { markers.push({ x: pn.x, y: pn.y, kind: 'sabotage' }); opts.sabotageRooms.push(pn.room); } }
    if (ov.kind === 'admin') {
      opts.me = false;
      if (!comms) {
        const dots = {};
        for (const p of s.players) { if (!p.alive || p.left || p.x == null) continue; const r = roomAt(p.x, p.y); if (r) dots[r] = (dots[r] || 0) + 1; }
        opts.dots = dots;
      }
    }
    if (ov.kind === 'sabotage') opts.doorRooms = Object.keys(s.doors || {}).map((d) => { const dd = (App.map.doors || []).find((x) => x.id === d); return dd && dd.room; }).filter(Boolean);
    let L = null;
    try { L = R.drawMinimap(g, f.w, f.h, opts); } catch (e) { /* ignore */ }
    if (ov.kind === 'admin' && comms) { g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, 0, f.w, f.h); g.fillStyle = '#fff'; g.font = '700 28px Fredoka, sans-serif'; g.textAlign = 'center'; g.fillText(t('hud.noSignal'), f.w / 2, f.h / 2); }
    if (ov.kind === 'sabotage' && L) sabButtons(L);
  }
  function sabButtons(L) {
    const s = snap(), M = mapCache();
    const pos = (room, dx, dy) => { const r = M.roomById[room]; return r ? [L.ox + r.cx * L.s + dx, L.oy + r.cy * L.s + dy] : null; };
    if (!ov.sabBtns) {
      ov.sabBtns = [];
      for (const k of SAB_KINDS) {
        if (!M.sabRoom[k]) continue;
        const b = h('button', 'hud-sab-btn hud-sab-btn--' + k, ICON[k] || ICON.warn);
        onPress(b, () => HUD.sabotage(k)); ov.sabLayer.appendChild(b);
        ov.sabBtns.push({ b, kind: k, room: M.sabRoom[k], dx: 0, dy: -6 });
        if (k === 'o2') for (const pn of App.map.panels) if (pn.kind === 'o2' && pn.room !== M.sabRoom.o2) { const b2 = h('button', 'hud-sab-btn hud-sab-btn--o2', ICON.o2 || ICON.warn); onPress(b2, () => HUD.sabotage('o2')); ov.sabLayer.appendChild(b2); ov.sabBtns.push({ b: b2, kind: 'o2', room: pn.room, dx: -34, dy: -6 }); }
      }
      for (const r of M.doorRooms) {
        const b = h('button', 'hud-sab-btn hud-sab-btn--door', ICON.door + '<i></i>');
        onPress(b, () => HUD.sabotage('doors', r)); ov.sabLayer.appendChild(b);
        ov.sabBtns.push({ b, kind: 'doors', room: r, dx: 0, dy: 30 });
      }
    }
    for (const o of ov.sabBtns) {
      const p = pos(o.room, o.dx, o.dy); if (!p) continue;
      o.b.style.left = p[0] + 'px'; o.b.style.top = p[1] + 'px';
      const cd = o.kind === 'doors' ? (s.self.doorCooldowns && s.self.doorCooldowns[o.room]) || 0 : s.sabotage ? 99 : s.self.sabotageCooldown || 0;
      cls(o.b, 'off', cd > 0);
      const i = o.b.querySelector('i'); if (i) txt(i, cd > 0 && cd < 99 ? Math.ceil(cd) : '');
    }
  }

  // ================================================================ per-frame refresh
  function taskLine(tk) {
    const step = tk.steps[Math.min(tk.step, tk.steps.length - 1)];
    const name = t(step && step.nameKey ? step.nameKey : tk.nameKey);
    const multi = tk.steps.length > 1 ? ' (' + Math.min(tk.step, tk.steps.length) + '/' + tk.steps.length + ')' : '';
    return '<div class="hud-task' + (tk.done ? ' done' : tk.step > 0 ? ' partial' : '') + '">' + esc(roomName(step && step.room)) + ': ' + esc(name) + multi + '</div>';
  }
  function refreshTasks(s) {
    const se = s.self || {};
    const comms = s.sabotage && s.sabotage.kind === 'comms';
    const imp = se.role === 'impostor';
    let html = '';
    if (imp) html += '<div class="hud-imp">' + esc(t(se.alive === false ? 'hud.ghostImpostor' : 'hud.impostorGoal')) + '</div><div class="hud-fake">' + esc(t('hud.fakeTasks')) + '</div>';
    else if (se.alive === false) html += '<div class="hud-ghost">' + esc(t('hud.ghostCrew')) + '</div>';
    if (comms && !imp) html += '<div class="hud-comms">' + esc(t('hud.commsDown')) + '<br><small>' + esc(t('hud.commsDownHint')) + '</small></div>';
    else for (const tk of se.tasks || []) html += taskLine(tk);
    htm(E.tasksBody, html);
    txt(E.tasksHead.querySelector('span'), t('hud.tasks'));
    const tp = s.taskProgress;
    cls(E.barWrap, 'hidden', tp == null && !comms);
    txt(E.barLabel, t('hud.totalTasks'));
    sty(E.bar.firstChild, 'width', Math.round((tp || 0) * 100) + '%');
  }
  function refreshButtons(s) {
    const se = s.self || {};
    const imp = se.role === 'impostor', alive = se.alive !== false;
    const useLabel = st.panel ? 'hud.fix' : st.station ? 'hud.use' : st.button ? 'hud.emergency' : st.console ? (st.console.kind === 'admin' ? 'hud.admin' : 'hud.cams') : 'hud.use';
    const show = (k, on) => cls(B[k], 'hidden', !on);
    show('use', true); cls(B.use, 'off', !(st.panel || st.station || st.button || st.console));
    txt(B.use.querySelector('.lbl'), up(t(useLabel)));
    show('report', alive); cls(B.report, 'off', !st.body); txt(B.report.querySelector('.lbl'), up(t('hud.report')));
    show('kill', imp && alive); cls(B.kill, 'off', !st.target || se.killCooldown > 0); txt(B.kill.querySelector('.lbl'), up(t('hud.kill')));
    txt(B.kill.querySelector('.cd'), se.killCooldown > 0 ? Math.ceil(se.killCooldown) : '');
    if (imp && alive && prevKillCd > 0 && !(se.killCooldown > 0)) sfx('cooldown_ready');
    prevKillCd = se.killCooldown || 0;
    show('vent', imp && alive); cls(B.vent, 'off', !(st.vent || se.inVent)); txt(B.vent.querySelector('.lbl'), up(t(se.inVent ? 'hud.ventExit' : 'hud.vent')));
    show('sabotage', imp); txt(B.sabotage.querySelector('.lbl'), up(t('hud.sabotage')));
    const scd = s.sabotage ? 0 : se.sabotageCooldown || 0;
    txt(B.sabotage.querySelector('.cd'), scd > 0 ? Math.ceil(scd) : '');
  }
  function refreshAlert(s) {
    const sb = s.sabotage;
    const crit = !!(sb && (sb.kind === 'reactor' || sb.kind === 'o2'));
    cls(E.alert, 'hidden', !sb); cls(E.edges, 'hidden', !crit);
    if (sb) {
      let msg;
      if (crit) {
        const n = Object.values(sb.panels || {}).filter((p) => (sb.kind === 'reactor' ? p.held : p.done)).length;
        msg = esc(t('hud.alert.' + sb.kind, { time: Math.ceil(sb.timer || 0) })) + '<small>' + esc(t('hud.alert.' + sb.kind + 'Hint', { n })) + '</small>';
      } else msg = esc(t('hud.alert.' + sb.kind));
      htm(E.alert, '<span class="ico">' + ICON.warn + '</span><span>' + msg + '</span>');
    }
    if (crit && !alarmOn) { alarmOn = true; try { if (AS.Audio) AS.Audio.loop('alarm'); } catch (e) { /* ignore */ } }
    if (!crit && alarmOn) { alarmOn = false; try { if (AS.Audio) AS.Audio.stop('alarm'); } catch (e) { /* ignore */ } }
  }
  function refreshRoom() {
    const pos = mePos();
    const r = pos ? roomAt(pos.x, pos.y) : null;
    if (r !== lastRoom) { lastRoom = r; roomHideAt = nowT + 2.5; txt(E.room, r ? roomName(r) : t('room.hallway')); }
    cls(E.room, 'show', nowT < roomHideAt);
  }
  function refreshVentArrows(s) {
    const v = (s.self && s.self.inVent) || null;
    if (v !== ventArrowsFor) {
      ventArrowsFor = v;
      E.vents.innerHTML = ''; ventArrows.length = 0;
      const M = mapCache(); const cur = v && M.vents[v];
      if (cur) for (const id of cur.links) {
        const o = M.vents[id]; if (!o) continue;
        const b = h('button', 'hud-vent-arrow', ICON.arrow);
        const a = Math.atan2(o.y - cur.y, o.x - cur.x);
        b.style.setProperty('--a', a + 'rad');
        onPress(b, () => HUD.ventMove(id));
        E.vents.appendChild(b); ventArrows.push({ b, a, id });
      }
    }
    if (ventArrows.length) {
      const pos = mePos(); const sc = pos && toScreen(pos.x, pos.y - 30);
      for (const va of ventArrows) if (sc) { va.b.style.left = sc.x + Math.cos(va.a) * 110 + 'px'; va.b.style.top = sc.y + Math.sin(va.a) * 110 + 'px'; }
    }
  }

  function frame(dt) {
    nowT += dt || 0;
    const s = snap();
    const show = !!(s && App.screen === 'game' && s.phase === 'playing');
    cls(root, 'hud-on', show);
    cls(root, 'hud-lobby', !!(s && App.screen === 'game' && s.phase === 'lobby'));
    if (s && s.phase !== lastPhase) { lastPhase = s.phase; if (s.phase !== 'playing') closeOverlay(); lastRoom = undefined; }
    if (!show) {
      for (const k in hl) hl[k] = null;
      if (App.view) App.view.highlights = hl;
      if (alarmOn) { alarmOn = false; try { if (AS.Audio) AS.Audio.stop('alarm'); } catch (e) { /* ignore */ } }
      return;
    }
    st = compute();
    hl.station = st.station ? st.station.id : null; hl.panel = st.panel ? st.panel.id : null; hl.button = st.button && !st.station && !st.panel;
    hl.console = st.console ? st.console.id : null; hl.vent = st.vent ? st.vent.id : null; hl.body = st.body ? st.body.id : null; hl.target = st.target ? st.target.id : null;
    App.view.highlights = hl;
    refreshTasks(s); refreshButtons(s); refreshAlert(s); refreshRoom(); refreshVentArrows(s);
    if (ov) drawOverlay();
  }

  function init(app) {
    if (inited) return;
    inited = true;
    App = app;
    build();
    App.on('frame', frame);
    App.on('lang', () => { lastRoom = undefined; if (ov) openOverlay(ov.kind); });
    if (AS.Input && AS.Input.on) {
      AS.Input.on('use', () => HUD.use());
      AS.Input.on('report', () => HUD.report());
      AS.Input.on('kill', () => HUD.kill());
      AS.Input.on('vent', () => HUD.vent());
      AS.Input.on('map', () => { if (playing()) toggleMap(); });
      AS.Input.on('sabotage', () => { if (playing() && snap().self.role === 'impostor') openOverlay('sabotage'); });
      AS.Input.on('escape', () => { if (ov) closeOverlay(); });
    }
  }

  AS.HUD = Object.assign(HUD, {
    init, openOverlay, closeOverlay, overlay: () => (ov ? ov.kind : null), state: () => st,
    refresh() { lastRoom = undefined; ventArrowsFor = null; }, openMap: () => openOverlay('map'),
  });
})(globalThis.AS = globalThis.AS || {});
