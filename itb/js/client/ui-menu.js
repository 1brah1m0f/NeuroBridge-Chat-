/* AI IMPOSTOR: SPACE SHIP — menus: main menu (animated starfield + floating star-nauts + logo), offline setup, online
 * (create / join by code), customize, settings, how to play, and the LOBBY overlay (room code, players,
 * host settings generated from AS.SETTINGS_SCHEMA, bots, start countdown).
 *
 *   AS.UIMenu.init(App)
 *   AS.UIMenu.openSettings({ inGame })   in-game variant adds Resume + Leave game
 *   AS.UIMenu.openCustomize()            works in the menu and in the lobby (sends setLook there)
 *   extra: openOffline(), openOnline(), openHowto(), openLobbySettings(), closeAll(), isOpen()
 *
 * DOM: one section in #screens for the main menu (#screen-menu), one for the lobby overlay (#screen-lobby,
 * pointer-events only on its bars so the world canvas / joystick stay usable), modals in #modal-layer.
 * While any of these modals is open in the game screen, App.block('menu', true) stops movement.
 */
(function (AS) {
  'use strict';
  if (typeof document === 'undefined') return;

  // ------------------------------------------------------------------ strings
  AS.i18n.add({
    az: {
      'menu.tagline': 'Kosmik gəmidə AI saxtakarlar gizlənib. Onları tap!',
      'menu.playOffline': 'Oflayn oyna',
      'menu.playOffline.sub': 'Tək, AI-lara qarşı (internetsiz)',
      'menu.online': 'Onlayn',
      'menu.online.sub': 'Otaq yarat və ya dostuna qoşul',
      'menu.customize': 'Görünüş',
      'menu.settings': 'Ayarlar',
      'menu.howto': 'Necə oynanılır',
      'menu.version': 'Versiya {v}',
      'menu.footer': 'Oflayn · Onlayn 9 insan + AI = 12 nəfərədək',

      'menu.offline.title': 'Oflayn oyun',
      'menu.offline.bots': 'Digər oyunçular (NPC)',
      'menu.offline.impostors': 'AI səviyyəsi',
      'menu.offline.impMax': 'ən çox {n}',
      'menu.offline.skill': 'Botların səviyyəsi',
      'menu.offline.role': 'İstədiyin rol',
      'menu.offline.players': '{n} oyunçu',
      'menu.offline.impCount': '+ {n} AI saxtakar',
      'menu.offline.start': 'Oyuna başla',
      'menu.role.random': 'Təsadüfi',
      'menu.role.crew': 'Ekipaj',
      'menu.role.impostor': 'Saxtakar',

      'menu.online.title': 'Onlayn oyun',
      'menu.online.server': 'Server ünvanı',
      'menu.online.serverHint': 'Serveri kompüterdə işə sal:',
      'menu.online.create': 'Otaq yarat',
      'menu.online.createSub': 'Yeni otaq aç və kodu dostlarınla paylaş',
      'menu.online.join': 'Qoşul',
      'menu.online.joinTitle': 'Otağa qoşul',
      'menu.online.joinSub': 'Dostunun verdiyi 4 hərfli kodu yaz',
      'menu.online.code': 'Otaq kodu',
      'menu.online.or': 'və ya',
      'menu.online.badCode': 'Kod 4 hərfdən ibarət olmalıdır',
      'menu.online.badServer': 'Server ünvanını yaz',
      'menu.status.connecting': 'Serverə qoşulur...',
      'menu.status.open': 'Qoşuldu, otaq hazırlanır...',
      'menu.status.closed': 'Əlaqə kəsildi',
      'menu.status.error': 'Qoşulmaq alınmadı',

      'menu.cz.title': 'Görünüş',
      'menu.cz.name': 'Adın',
      'menu.cz.namePh': 'Adını yaz',
      'menu.cz.color': 'Rəng',
      'menu.cz.hat': 'Baş geyimi',
      'menu.cz.taken': 'Bu rəng artıq tutulub',
      'menu.cz.done': 'Hazırdır',

      'menu.set.title': 'Ayarlar',
      'menu.set.language': 'Dil',
      'menu.set.audio': 'Səs',
      'menu.set.master': 'Ümumi səs',
      'menu.set.sfx': 'Effektlər',
      'menu.set.music': 'Musiqi',
      'menu.set.display': 'Ekran',
      'menu.set.fps': 'FPS sayğacını göstər',
      'menu.set.resume': 'Davam et',
      'menu.set.leave': 'Oyundan çıx',
      'menu.set.leaveConfirm': 'Əminsən? Yenidən bas',

      'menu.howto.title': 'Necə oynanılır',
      'menu.howto.rules': 'Qaydalar',
      'menu.howto.controls': 'İdarəetmə',
      'menu.howto.roles.t': 'Real oyunçular və AI saxtakarlar',
      'menu.howto.roles.d': 'Gəmidə 1-3 gizli AI saxtakar var (5-6 oyunçuda 1, 7-9-da 2, 10-12-də 3). Onlar insan kimi davranır, bir-birini tanıyır və sizi öldürür. Siz gəmini işlək saxlayıb AI-ları tapmalısınız.',
      'menu.howto.tasks.t': 'Tapşırıqlar',
      'menu.howto.tasks.d': 'Gəminin elektrik, naviqasiya, rabitə və digər sistemlərini sarı nişanlı yerlərdə təmir et. Zolaq dolanda və ya bütün AI-lar tapılanda qalib gəlirsən.',
      'menu.howto.report.t': 'Cəsədi bildir',
      'menu.howto.report.d': 'Cəsəd tapdın? BİLDİR düyməsini bas və dərhal yığıncaq çağır.',
      'menu.howto.meeting.t': 'Yığıncaq və səsvermə',
      'menu.howto.meeting.d': 'Yığıncaqda hər kəs növbə ilə sualları cavablandırır (adətən 3 sual). Cavablardan kimin AI olduğunu çıxar, sonra səs ver: ən çox səs alan gəmidən atılır. AI səviyyəsi 3-dən yuxarıdırsa və cəsəd tapılıbsa, sərbəst çat da açılır.',
      'menu.howto.sabotage.t': 'Sabotaj',
      'menu.howto.sabotage.d': 'Saxtakarlar işıqları, rabitəni, qapıları, oksigeni və reaktoru sıradan çıxarır. Kritik qəzanı vaxtında düzəltməsəniz, uduzursunuz.',
      'menu.howto.vents.t': 'Ventilyasiya',
      'menu.howto.vents.d': 'AI saxtakarlar ventilyasiya borularına girib gəmidə gözə görünmədən hərəkət edə bilər.',
      'menu.howto.ghost': 'Öldün? Ruh kimi tapşırıqlara davam et — ekipaja yenə də kömək edə bilərsən.',
      'menu.ctl.keyboard': 'Klaviatura və siçan',
      'menu.ctl.touch': 'Sensor ekran',
      'menu.ctl.move': 'Hərəkət',
      'menu.ctl.use': 'İstifadə et',
      'menu.ctl.report': 'Bildir',
      'menu.ctl.kill': 'Öldür (saxtakar)',
      'menu.ctl.vent': 'Ventilyasiya (saxtakar)',
      'menu.ctl.map': 'Xəritə',
      'menu.ctl.esc': 'Menyu / bağla',
      'menu.ctl.mouse': 'Mini-oyunlarda siçanla klikləyib sürüşdür.',
      'menu.ctl.joystick': 'Ekranın sol tərəfində barmağını sürüşdür — virtual coystik.',
      'menu.ctl.buttons': 'Sağdakı böyük düymələr: istifadə, bildir, öldür, ventilyasiya, sabotaj.',
      'menu.ctl.tasks': 'Mini-oyunlarda toxun və sürüşdür.',

      'menu.lobby.code': 'Otaq kodu',
      'menu.lobby.copy': 'Kodu kopyala',
      'menu.lobby.copied': 'Kod kopyalandı: {code}',
      'menu.lobby.offline': 'Oflayn oyun',
      'menu.lobby.players': 'Oyunçular',
      'menu.lobby.customize': 'Görünüş',
      'menu.lobby.settings': 'Oyun ayarları',
      'menu.lobby.addBot': 'NPC əlavə et',
      'menu.lobby.removeBot': 'Botu çıxar',
      'menu.lobby.start': 'Başla',
      'menu.lobby.need': 'Daha {n} oyunçu lazımdır',
      'menu.lobby.waitHost': 'Otaq sahibinin başlatması gözlənilir',
      'menu.lobby.leave': 'Çıx',
      'menu.lobby.starting': 'Oyun başlayır',
      'menu.lobby.readonly': 'Ayarları yalnız otaq sahibi dəyişə bilər',
      'menu.lobby.defaults': 'Standart',
      'menu.lobby.impWarn': 'İndiki oyunçu sayı ilə ən çox {n} saxtakar olacaq',
      'menu.lobby.grp.impostor': 'AI saxtakarlar',
      'menu.lobby.grp.player': 'Oyunçular',
      'menu.lobby.grp.meeting': 'Yığıncaqlar',
      'menu.lobby.grp.tasks': 'Tapşırıqlar',
      'menu.lobby.grp.bots': 'NPC-lər',
      'menu.lobby.grp.ai': 'AI',
      'menu.lobby.aiJoin': 'Başlayanda {n} AI saxtakar qoşulacaq (gizli)',
      'menu.lobby.grp.other': 'Digər',
    },
    en: {
      'menu.tagline': 'AI impostors are hiding on the ship. Find them!',
      'menu.playOffline': 'Play offline',
      'menu.playOffline.sub': 'Solo against AI impostors, no internet',
      'menu.online': 'Online',
      'menu.online.sub': 'Create a room or join a friend',
      'menu.customize': 'Customize',
      'menu.settings': 'Settings',
      'menu.howto': 'How to play',
      'menu.version': 'Version {v}',
      'menu.footer': 'Offline · Online up to 9 humans + AI = 12',

      'menu.offline.title': 'Offline game',
      'menu.offline.bots': 'Other players (NPC)',
      'menu.offline.impostors': 'AI level',
      'menu.offline.impMax': 'max {n}',
      'menu.offline.skill': 'Bot skill',
      'menu.offline.role': 'Preferred role',
      'menu.offline.players': '{n} players',
      'menu.offline.impCount': '+ {n} AI impostors',
      'menu.offline.impCount_one': '+ 1 AI impostor',
      'menu.offline.start': 'Start game',
      'menu.role.random': 'Random',
      'menu.role.crew': 'Crewmate',
      'menu.role.impostor': 'Impostor',

      'menu.online.title': 'Online game',
      'menu.online.server': 'Server address',
      'menu.online.serverHint': 'Run the server on a computer:',
      'menu.online.create': 'Create room',
      'menu.online.createSub': 'Open a new room and share the code with friends',
      'menu.online.join': 'Join',
      'menu.online.joinTitle': 'Join a room',
      'menu.online.joinSub': 'Type the 4-letter code from your friend',
      'menu.online.code': 'Room code',
      'menu.online.or': 'or',
      'menu.online.badCode': 'The code must be 4 letters',
      'menu.online.badServer': 'Enter the server address',
      'menu.status.connecting': 'Connecting to server...',
      'menu.status.open': 'Connected, preparing the room...',
      'menu.status.closed': 'Disconnected',
      'menu.status.error': 'Could not connect',

      'menu.cz.title': 'Customize',
      'menu.cz.name': 'Your name',
      'menu.cz.namePh': 'Enter your name',
      'menu.cz.color': 'Color',
      'menu.cz.hat': 'Headwear',
      'menu.cz.taken': 'That color is taken',
      'menu.cz.done': 'Done',

      'menu.set.title': 'Settings',
      'menu.set.language': 'Language',
      'menu.set.audio': 'Audio',
      'menu.set.master': 'Master volume',
      'menu.set.sfx': 'Sound effects',
      'menu.set.music': 'Music',
      'menu.set.display': 'Display',
      'menu.set.fps': 'Show FPS counter',
      'menu.set.resume': 'Resume',
      'menu.set.leave': 'Leave game',
      'menu.set.leaveConfirm': 'Sure? Press again',

      'menu.howto.title': 'How to play',
      'menu.howto.rules': 'Rules',
      'menu.howto.controls': 'Controls',
      'menu.howto.roles.t': 'Real players vs AI impostors',
      'menu.howto.roles.d': 'Hidden AI impostors are on the ship (1 AI for 5-6 players, 2 for 7-9, 3 for 10-12). They act like people, know each other and kill. Keep the ship running and find every AI.',
      'menu.howto.tasks.t': 'Tasks',
      'menu.howto.tasks.d': 'Repair the ship systems (power, navigation, communications and more) at the yellow spots. Fill the task bar or find every AI to win.',
      'menu.howto.report.t': 'Report bodies',
      'menu.howto.report.d': 'Found a body? Press REPORT to call a meeting right away.',
      'menu.howto.meeting.t': 'Meetings & voting',
      'menu.howto.meeting.d': 'In a meeting everyone answers questions in turn (3 by default). Work out who the AI is from the answers, then vote: the most voted player is ejected. On AI level 3+, free chat also opens when a body was found.',
      'menu.howto.sabotage.t': 'Sabotage',
      'menu.howto.sabotage.d': 'Impostors can sabotage lights, comms, doors, oxygen and the reactor. Fix a critical sabotage in time or you lose.',
      'menu.howto.vents.t': 'Vents',
      'menu.howto.vents.d': 'AI impostors can jump into vents and travel around the ship unseen.',
      'menu.howto.ghost': 'Killed? Keep doing tasks as a ghost — you can still help the crew.',
      'menu.ctl.keyboard': 'Keyboard & mouse',
      'menu.ctl.touch': 'Touch screen',
      'menu.ctl.move': 'Move',
      'menu.ctl.use': 'Use',
      'menu.ctl.report': 'Report',
      'menu.ctl.kill': 'Kill (impostor)',
      'menu.ctl.vent': 'Vent (impostor)',
      'menu.ctl.map': 'Map',
      'menu.ctl.esc': 'Menu / close',
      'menu.ctl.mouse': 'Click and drag inside mini-games.',
      'menu.ctl.joystick': 'Drag on the left side of the screen — virtual joystick.',
      'menu.ctl.buttons': 'Big buttons on the right: use, report, kill, vent, sabotage.',
      'menu.ctl.tasks': 'Tap and drag inside mini-games.',

      'menu.lobby.code': 'Room code',
      'menu.lobby.copy': 'Copy code',
      'menu.lobby.copied': 'Code copied: {code}',
      'menu.lobby.offline': 'Offline game',
      'menu.lobby.players': 'Players',
      'menu.lobby.customize': 'Customize',
      'menu.lobby.settings': 'Game settings',
      'menu.lobby.addBot': 'Add NPC',
      'menu.lobby.removeBot': 'Remove bot',
      'menu.lobby.start': 'Start',
      'menu.lobby.need': 'Need {n} more players',
      'menu.lobby.need_one': 'Need 1 more player',
      'menu.lobby.waitHost': 'Waiting for the host to start',
      'menu.lobby.leave': 'Leave',
      'menu.lobby.starting': 'Game starting',
      'menu.lobby.readonly': 'Only the host can change the settings',
      'menu.lobby.defaults': 'Defaults',
      'menu.lobby.impWarn': 'With the current player count there will be at most {n}',
      'menu.lobby.grp.impostor': 'AI Impostors',
      'menu.lobby.grp.player': 'Players',
      'menu.lobby.grp.meeting': 'Meetings',
      'menu.lobby.grp.tasks': 'Tasks',
      'menu.lobby.grp.bots': 'NPCs',
      'menu.lobby.grp.ai': 'AI',
      'menu.lobby.aiJoin': '{n} hidden AI impostor(s) will join when the game starts',
      'menu.lobby.grp.other': 'Other',
    },
  });

  // ------------------------------------------------------------------ helpers
  const U = AS.util;
  const T = AS.T;
  const t = (k, p) => AS.t(k, p);
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const sameId = (a, b) => a != null && b != null && String(a) === String(b);
  let App = null;
  const warned = {};
  function warnOnce(tag, e) {
    if (warned[tag]) return;
    warned[tag] = true;
    console.warn('[UIMenu] ' + tag, e);
  }

  // Tiny hyperscript: h('button', { class, text, i18n, html, style, dataset, onclick, ...attrs }, children)
  function h(tag, props, kids) {
    const e = document.createElement(tag);
    if (props) {
      for (const k in props) {
        const v = props[k];
        if (v == null || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k === 'html') e.innerHTML = v;
        else if (k === 'i18n') { e.setAttribute('data-i18n', v); e.textContent = t(v); }
        else if (k === 'style') e.style.cssText = v;
        else if (k === 'dataset') Object.assign(e.dataset, v);
        else if (k.length > 2 && k[0] === 'o' && k[1] === 'n') e.addEventListener(k.slice(2), v);
        else e.setAttribute(k, v === true ? '' : v);
      }
    }
    if (kids != null) {
      const arr = Array.isArray(kids) ? kids : [kids];
      for (const c of arr) {
        if (c == null || c === false) continue;
        e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
      }
    }
    return e;
  }

  function sfx(name) {
    try { if (AS.Audio && AS.Audio.play) AS.Audio.play(name); } catch (e) { warnOnce('sfx', e); }
  }

  // 24×24 stroke icons (currentColor).
  const ICONS = {
    bot: '<rect x="4" y="7.5" width="16" height="11.5" rx="4"/><circle cx="9.2" cy="13.2" r="1.5" fill="currentColor" stroke="none"/><circle cx="14.8" cy="13.2" r="1.5" fill="currentColor" stroke="none"/><path d="M12 7.5V4.6"/><circle cx="12" cy="3.4" r="1.4" fill="currentColor" stroke="none"/><path d="M1.8 12v3.4M22.2 12v3.4"/>',
    globe: '<circle cx="12" cy="12" r="9.2"/><path d="M2.8 12h18.4M12 2.8c2.6 2.6 3.9 5.6 3.9 9.2s-1.3 6.6-3.9 9.2M12 2.8C9.4 5.4 8.1 8.4 8.1 12s1.3 6.6 3.9 9.2"/>',
    gear: '<path d="M10.3 2.8h3.4l.5 2.6 1.8.8 2.2-1.5 2.4 2.4-1.5 2.2.8 1.8 2.6.5v3.4l-2.6.5-.8 1.8 1.5 2.2-2.4 2.4-2.2-1.5-1.8.8-.5 2.6h-3.4l-.5-2.6-1.8-.8-2.2 1.5-2.4-2.4 1.5-2.2-.8-1.8-2.6-.5v-3.4l2.6-.5.8-1.8-1.5-2.2 2.4-2.4 2.2 1.5 1.8-.8z" stroke-linejoin="round"/><circle cx="12" cy="12" r="3.2"/>',
    help: '<circle cx="12" cy="12" r="9.4"/><path d="M9.2 9.4a2.9 2.9 0 1 1 4 2.7c-.8.4-1.2 1-1.2 1.9v.5"/><circle cx="12" cy="17.3" r="1.25" fill="currentColor" stroke="none"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-1.3-1.2-1.6-1.2-2.8 0-1 .8-1.6 1.8-1.6H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><circle cx="7.4" cy="11.4" r="1.3" fill="currentColor" stroke="none"/><circle cx="9.8" cy="7.3" r="1.3" fill="currentColor" stroke="none"/><circle cx="14.6" cy="7.3" r="1.3" fill="currentColor" stroke="none"/>',
    copy: '<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.6"/><path d="M15.5 8.5V6.4a2.4 2.4 0 0 0-2.4-2.4H6.4A2.4 2.4 0 0 0 4 6.4v6.7a2.4 2.4 0 0 0 2.4 2.4h2.1"/>',
    users: '<circle cx="9" cy="8.4" r="3.6"/><path d="M2.4 20c.6-3.7 3.3-5.6 6.6-5.6s6 1.9 6.6 5.6"/><circle cx="17.2" cy="9.4" r="2.8"/><path d="M17.6 14.6c2.3.3 3.7 2 4.1 4.6"/>',
    planet: '<circle cx="12" cy="12" r="6.2"/><path d="M5.2 14.3c-2.4 2.3-3.2 4.1-2.3 4.8 1.3 1 6.4-1.4 11.3-5.1s8.3-7.8 7.3-8.9c-.6-.7-2.4-.3-4.6.9"/>',
    crown: '<path d="M3.2 8.2l4.6 4.1L12 5.2l4.2 7.1 4.6-4.1-1.9 10.6H5.1z" fill="currentColor" stroke-linejoin="round"/>',
    close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    plus: '<path d="M12 5.5v13M5.5 12h13"/>',
    minus: '<path d="M5.5 12h13"/>',
    check: '<path d="M5 12.6l4.4 4.4L19 7.4"/>',
    play: '<path d="M8 5.2v13.6L19 12z" fill="currentColor" stroke-linejoin="round"/>',
    leave: '<path d="M13.5 4H18a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4.5"/><path d="M9.5 7.8L5.3 12l4.2 4.2M5.6 12h10"/>',
    sliders: '<path d="M4 6.5h9M17.5 6.5H20M4 12h3M11.5 12H20M4 17.5h11M19.5 17.5h.5"/><circle cx="15.3" cy="6.5" r="2.2"/><circle cx="9.3" cy="12" r="2.2"/><circle cx="17.3" cy="17.5" r="2.2"/>',
    rocket: '<path d="M12 2.6c3.4 2.3 4.9 6 4.5 10.4L14 16h-4l-2.5-3C7.1 8.6 8.6 4.9 12 2.6z" stroke-linejoin="round"/><circle cx="12" cy="9.2" r="1.8"/><path d="M8.2 13.4L5.2 15.6l.9 3.3 3.3-2.1M15.8 13.4l3 2.2-.9 3.3-3.3-2.1M10.6 19.3L12 21.6l1.4-2.3"/>',
    server: '<rect x="3.5" y="4" width="17" height="6.6" rx="2"/><rect x="3.5" y="13.4" width="17" height="6.6" rx="2"/><circle cx="7.5" cy="7.3" r="1.1" fill="currentColor" stroke="none"/><circle cx="7.5" cy="16.7" r="1.1" fill="currentColor" stroke="none"/><path d="M12 7.3h5M12 16.7h5"/>',
    keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2.6"/><path d="M6.2 9.8h.1M9.6 9.8h.1M13 9.8h.1M16.4 9.8h.1M7.2 14.2h9.6"/>',
    phone: '<rect x="2.5" y="6.5" width="19" height="11" rx="2.6"/><circle cx="7" cy="12" r="2"/><circle cx="17" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
    lock: '<rect x="5" y="11" width="14" height="9.5" rx="2.2"/><path d="M8.2 11V8.3a3.8 3.8 0 0 1 7.6 0V11"/>',
    star: '<path d="M12 3.2l2.6 5.5 6 .7-4.5 4.1 1.2 5.9L12 16.4l-5.3 3 1.2-5.9-4.5-4.1 6-.7z" fill="currentColor" stroke-linejoin="round"/>',
    trash: '<path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l1 12.2h9L17.5 7"/>',
  };
  function svgIcon(name, cls) {
    return '<svg class="mm-ico' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
  }
  function icon(name, cls) {
    const wrap = document.createElement('span');
    wrap.innerHTML = svgIcon(name, cls);
    return wrap.firstChild;
  }

  const colorOf = (id) => AS.COLOR_BY_ID[id] || AS.COLORS[0];

  function portraitURL(color, hat, size, opts) {
    if (!AS.Art || typeof AS.Art.portraitURL !== 'function') return null;
    try { return AS.Art.portraitURL(color, hat || 'none', size, opts || {}); } catch (e) { warnOnce('portraitURL', e); return null; }
  }
  // <img> portrait (2× for crisp edges) or a CSS fallback bubble when AS.Art is missing.
  function portraitEl(color, hat, size, cls, opts) {
    const dpr = Math.min(2, Math.max(1, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1));
    const url = portraitURL(color, hat, Math.round(size * Math.max(1.5, dpr)), opts);
    const c = colorOf(color);
    if (url) return h('img', { class: 'mm-portrait' + (cls ? ' ' + cls : ''), src: url, alt: '', draggable: 'false' });
    return h('span', { class: 'mm-portrait mm-portrait--fb' + (cls ? ' ' + cls : ''), style: '--c:' + c.main + ';--s:' + c.shade });
  }
  function setPortrait(img, color, hat, size, opts) {
    if (!img) return img;
    const fresh = portraitEl(color, hat, size, img.className.replace(/\bmm-portrait(--fb)?\b/g, '').trim(), opts);
    if (img.tagName === 'IMG' && fresh.tagName === 'IMG') { if (img.src !== fresh.src) img.src = fresh.src; return img; }
    img.replaceWith(fresh);
    return fresh;
  }

  // Number formatting (Azerbaijani uses a decimal comma).
  function fmtNumber(v) {
    const s = String(Math.round(Number(v) * 100) / 100);
    return AS.i18n.getLang() === 'az' ? s.replace('.', ',') : s;
  }
  function fmtSetting(s, v) {
    if (s.type === 'bool') return t(v ? 'ui.on' : 'ui.off');
    if (s.type === 'enum') return t('set.' + s.key + '.' + v);
    if (s.key === 'aiLevel') return v + ' · ' + t('ai.level.' + v);
    if (s.unit === 's') return t('ui.seconds', { n: fmtNumber(v) });
    if (s.unit === 'x') return fmtNumber(v) + 'x';
    return fmtNumber(v);
  }

  function cleanName(s) {
    s = String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, '');
    s = s.replace(/\s+/g, ' ').trim();
    return Array.from(s).slice(0, 12).join('').trim();
  }

  function inGameSession() { return !!(App && App.mode && App.snap); }
  function myId() { return App && (App.myId != null ? App.myId : App.snap ? App.snap.you : null); }
  function isHostNow() {
    if (!App || !App.snap) return false;
    if (typeof App.isHost === 'function') return !!App.isHost();
    return sameId(App.snap.hostId, myId());
  }
  function myPlayer() {
    if (!App || !App.snap) return null;
    if (typeof App.me === 'function') { const m = App.me(); if (m) return m; }
    const id = myId();
    return (App.snap.players || []).find((p) => sameId(p.id, id)) || null;
  }
  function inLobbyPhase() {
    return !!(App && App.mode && App.snap && (App.snap.phase === 'lobby' || App.snap.phase === 'ended'));
  }

  // ------------------------------------------------------------------ modal system
  const modals = [];
  function modalLayer() { return document.getElementById('modal-layer') || document.body; }
  function syncBlock() {
    if (!App || typeof App.block !== 'function') return;
    try { App.block('menu', modals.length > 0 && App.screen === 'game'); } catch (e) { warnOnce('block', e); }
  }
  function getModal(id) { for (const m of modals) if (m.id === id) return m; return null; }

  /* openModal(id, { title, icon, cls, drawer, build(m), onClose(m), dismiss })
   * m = { id, back, box, body, foot, render(), update?(snap), state } — build() fills m.body / m.foot and may set m.update. */
  function openModal(id, opts) {
    closeModal(id, true);
    const m = { id, opts, update: null, cleanup: null };
    m.back = h('div', { class: 'modal-backdrop mm-back' + (opts.drawer ? ' mm-back--drawer' : '') });
    m.box = h('div', { class: 'panel modal mm-modal mm-modal--' + id + (opts.cls ? ' ' + opts.cls : ''), role: 'dialog', 'aria-modal': 'true' });
    m.titleEl = h('div', { class: 'mm-mtitle' });
    m.head = h('div', { class: 'mm-mhead' }, [
      opts.icon ? h('span', { class: 'mm-mhead-ico mm-mhead-ico--' + opts.icon, html: svgIcon(opts.icon) }) : null,
      m.titleEl,
      h('button', { class: 'mm-x', type: 'button', 'aria-label': t('ui.close'), html: svgIcon('close'), onclick: () => { sfx('back'); closeModal(id); } }),
    ]);
    m.body = h('div', { class: 'mm-mbody' });
    m.foot = h('div', { class: 'mm-mfoot' });
    m.box.append(m.head, m.body, m.foot);
    m.back.appendChild(m.box);
    let downOnBack = false;
    m.back.addEventListener('pointerdown', (e) => { downOnBack = e.target === m.back; });
    m.back.addEventListener('click', (e) => {
      if (e.target === m.back && downOnBack && opts.dismiss !== false) { sfx('back'); closeModal(id); }
      downOnBack = false;
    });
    m.render = function () {
      if (m.cleanup) { try { m.cleanup(); } catch (e) { console.error(e); } m.cleanup = null; }
      m.update = null;
      m.body.textContent = '';
      m.foot.textContent = '';
      m.titleEl.textContent = t(typeof opts.title === 'function' ? opts.title() : opts.title);
      opts.build(m);
      m.foot.classList.toggle('hidden', !m.foot.childNodes.length);
      m.lang = AS.i18n.getLang();
    };
    modalLayer().appendChild(m.back);
    modals.push(m);
    m.render();
    syncBlock();
    return m;
  }
  function closeModal(id, instant) {
    let i = -1;
    for (let k = 0; k < modals.length; k++) if (modals[k].id === id) i = k;
    if (i < 0) return false;
    const m = modals[i];
    modals.splice(i, 1);
    if (m.cleanup) { try { m.cleanup(); } catch (e) { console.error(e); } m.cleanup = null; }
    if (m.opts.onClose) { try { m.opts.onClose(m); } catch (e) { console.error('[UIMenu] onClose', e); } }
    if (instant) m.back.remove();
    else {
      m.back.classList.add('mm-out');
      setTimeout(() => m.back.remove(), 190);
    }
    syncBlock();
    return true;
  }
  function closeAll(instant, keep) {
    for (let k = modals.length - 1; k >= 0; k--) {
      const m = modals[k];
      if (m && (!keep || keep.indexOf(m.id) < 0)) closeModal(m.id, instant);
    }
  }

  // ------------------------------------------------------------------ small components
  // Stepper [-] value [+] with press-and-hold repeat.
  function stepper(o) {
    const st = { value: o.value, min: o.min, max: o.max, step: o.step || 1 };
    const val = h('span', { class: 'mm-step-val' });
    const dec = h('button', { class: 'mm-step-btn', type: 'button', 'aria-label': '−', html: svgIcon('minus') });
    const inc = h('button', { class: 'mm-step-btn', type: 'button', 'aria-label': '+', html: svgIcon('plus') });
    const root = h('div', { class: 'mm-stepper' + (o.cls ? ' ' + o.cls : '') }, [dec, val, inc]);
    function render() {
      val.textContent = o.format ? o.format(st.value) : String(st.value);
      dec.disabled = st.value <= st.min + 1e-9;
      inc.disabled = st.value >= st.max - 1e-9;
    }
    function bump(dir) {
      let nv = Math.round((st.value + dir * st.step) * 100) / 100;
      nv = U.clamp(nv, st.min, st.max);
      if (Math.abs(nv - st.value) < 1e-9) return false;
      st.value = nv;
      render();
      val.classList.remove('mm-bump');
      void val.offsetWidth;
      val.classList.add('mm-bump');
      sfx('click');
      if (o.onChange) o.onChange(nv);
      return true;
    }
    let timer = 0;
    const stop = () => { clearTimeout(timer); clearInterval(timer); timer = 0; };
    for (const [btn, dir] of [[dec, -1], [inc, 1]]) {
      btn.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || btn.disabled) return;
        e.preventDefault();
        stop();
        if (!bump(dir)) return;
        timer = setTimeout(() => { timer = setInterval(() => { if (!bump(dir)) stop(); }, 85); }, 420);
      });
      btn.addEventListener('pointerup', stop);
      btn.addEventListener('pointerleave', stop);
      btn.addEventListener('pointercancel', stop);
      btn.addEventListener('click', (e) => { if (e.detail === 0) bump(dir); }); // keyboard activation
    }
    root.set = (v, mn, mx) => {
      if (mn != null) st.min = mn;
      if (mx != null) st.max = mx;
      st.value = U.clamp(v, st.min, st.max);
      render();
    };
    root.get = () => st.value;
    root.setDisabled = (d) => { root.classList.toggle('is-disabled', !!d); dec.disabled = !!d || st.value <= st.min; inc.disabled = !!d || st.value >= st.max; };
    render();
    return root;
  }

  // Segmented control: options [{ id, label, cls? }].
  function segmented(o) {
    const root = h('div', { class: 'mm-seg' + (o.cls ? ' ' + o.cls : ''), role: 'radiogroup' });
    for (const opt of o.options) {
      const b = h('button', {
        type: 'button', class: 'mm-seg-btn' + (opt.cls ? ' ' + opt.cls : ''), role: 'radio', dataset: { v: String(opt.id) },
        onclick: () => {
          if (root.value === String(opt.id) || root.classList.contains('is-disabled')) return;
          set(String(opt.id));
          sfx('click');
          if (o.onChange) o.onChange(opt.id);
        },
      }, opt.label);
      root.appendChild(b);
    }
    function set(v) {
      root.value = String(v);
      for (const b of root.children) {
        const on = b.dataset.v === root.value;
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
      }
    }
    root.set = set;
    set(o.value);
    return root;
  }

  function toggleSwitch(o) {
    const input = h('input', { type: 'checkbox' });
    input.checked = !!o.checked;
    input.addEventListener('change', () => { sfx('click'); if (o.onChange) o.onChange(input.checked); });
    const root = h('label', { class: 'toggle mm-toggle' }, [input, h('span')]);
    root.set = (v) => { input.checked = !!v; };
    return root;
  }

  // 0..1 slider with a filled track and a % readout.
  function slider(o) {
    const input = h('input', { type: 'range', min: '0', max: '100', step: '1', class: 'mm-range', 'aria-label': o.label || '' });
    input.value = String(Math.round(U.clamp(o.value, 0, 1) * 100));
    const out = h('span', { class: 'mm-range-val' });
    const paint = () => { input.style.setProperty('--p', input.value + '%'); out.textContent = input.value + '%'; };
    input.addEventListener('input', () => { paint(); if (o.onInput) o.onInput(Number(input.value) / 100); });
    input.addEventListener('change', () => { if (o.onCommit) o.onCommit(Number(input.value) / 100); });
    paint();
    return h('div', { class: 'mm-range-wrap' }, [input, out]);
  }

  function field(labelKey, control, extra) {
    return h('div', { class: 'mm-field' }, [
      h('div', { class: 'mm-label' }, [h('span', { i18n: labelKey }), extra || null]),
      control,
    ]);
  }

  AS.i18n.add({
    az: { 'menu.chatHint': 'Yığıncaqlarda suallar var — cavablardan AI-ı tap!', 'menu.agentHint': 'AI agentlər üçün: docs/AGENTS.md' },
    en: { 'menu.chatHint': 'Meetings ask questions — spot the AI by its answers!', 'menu.agentHint': 'For AI agents: docs/AGENTS.md' },
  });

  function bigBtn(icoName, key, subKey, cls, fn) {
    return h('button', { class: 'btn mm-big ' + (cls || ''), type: 'button', onclick: () => { sfx('click'); fn(); } }, [
      h('span', { class: 'mm-big-ico', html: svgIcon(icoName) }),
      h('span', { class: 'mm-big-txt' }, [h('b', { i18n: key }), subKey ? h('small', { i18n: subKey }) : null]),
    ]);
  }

  // ------------------------------------------------------------------ main menu screen
  let menuEl = null, starsCv = null, starsRaf = 0;
  const stars = [], floaters = [];
  function buildMenu() {
    const screens = document.getElementById('screens');
    starsCv = h('canvas', { class: 'mm-stars' });
    menuEl = h('section', { class: 'screen mm-screen' }, [
      starsCv,
      h('div', { class: 'mm-center' }, [
        h('h1', { class: 'mm-logo' }, [h('span', { class: 'mm-logo-a', text: 'AI IMPOSTOR' }), h('span', { class: 'mm-logo-b', text: 'SPACE SHIP' })]),
        h('div', { class: 'mm-tag', i18n: 'menu.tagline' }),
        h('div', { class: 'mm-buttons' }, [
          bigBtn('play', 'menu.playOffline', 'menu.playOffline.sub', 'btn--primary', openOffline),
          bigBtn('globe', 'menu.online', 'menu.online.sub', 'btn--success', openOnline),
          h('div', { class: 'mm-row' }, [
            bigBtn('palette', 'menu.customize', null, 'mm-small', () => openCustomize()),
            bigBtn('gear', 'menu.settings', null, 'mm-small', () => openSettings({})),
            bigBtn('help', 'menu.howto', null, 'mm-small', openHowto),
          ]),
        ]),
        h('div', { class: 'mm-hint', i18n: 'menu.chatHint' }),
      ]),
      h('div', { class: 'mm-foot' }, [h('span', { i18n: 'menu.footer' }), h('span', { class: 'mm-ver', text: 'v' + AS.VERSION })]),
    ]);
    screens.appendChild(menuEl);
    for (let i = 0; i < 160; i++) stars.push({ x: Math.random(), y: Math.random(), z: 0.2 + Math.random() * 0.8 });
    const cols = AS.COLORS.map((c) => c.id);
    for (let i = 0; i < 6; i++) floaters.push({ x: Math.random(), y: Math.random(), vx: (Math.random() - 0.5) * 0.02, vy: (Math.random() - 0.5) * 0.02, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.6, c: cols[(i * 5) % cols.length], hat: AS.HATS[(i * 3 + 1) % AS.HATS.length], s: 0.8 + Math.random() * 0.8 });
  }
  let lastT = 0;
  function animStars(ts) {
    starsRaf = 0;
    if (!App || App.screen !== 'menu') return;
    const dt = Math.min(0.05, (ts - lastT) / 1000 || 0); lastT = ts;
    const d = Math.min(2, devicePixelRatio || 1), w = innerWidth, hh = innerHeight;
    if (starsCv.width !== Math.round(w * d)) { starsCv.width = Math.round(w * d); starsCv.height = Math.round(hh * d); }
    const g = starsCv.getContext('2d');
    g.setTransform(d, 0, 0, d, 0, 0);
    const gr = g.createRadialGradient(w * 0.5, hh * 0.4, 50, w * 0.5, hh * 0.5, Math.max(w, hh));
    gr.addColorStop(0, '#131a3a'); gr.addColorStop(1, '#03050c');
    g.fillStyle = gr; g.fillRect(0, 0, w, hh);
    for (const s of stars) {
      s.x -= dt * 0.01 * s.z; if (s.x < 0) s.x += 1;
      g.fillStyle = 'rgba(255,255,255,' + (0.3 + s.z * 0.7) + ')';
      g.fillRect(s.x * w, s.y * hh, s.z * 2.2, s.z * 2.2);
    }
    for (const f of floaters) {
      f.x += f.vx * dt; f.y += f.vy * dt; f.r += f.vr * dt;
      if (f.x < -0.1) f.x = 1.1; if (f.x > 1.1) f.x = -0.1; if (f.y < -0.1) f.y = 1.1; if (f.y > 1.1) f.y = -0.1;
      if (AS.Art) { g.save(); g.translate(f.x * w, f.y * hh); g.rotate(f.r); AS.Art.drawCharacter(g, 0, 36, { color: f.c, hat: f.hat, scale: f.s, t: ts / 1000 }); g.restore(); }
    }
    starsRaf = requestAnimationFrame(animStars);
  }
  function onScreen(name) {
    if (menuEl) menuEl.classList.toggle('active', name === 'menu');
    if (name === 'menu' && !starsRaf) starsRaf = requestAnimationFrame(animStars);
    if (name === 'menu') closeAll(true);
    renderLobby();
  }

  // ------------------------------------------------------------------ offline setup
  function openOffline() {
    const off = Object.assign({ bots: 5, aiLevel: 3, botSkill: 'normal' }, App.prefs.offline || {});
    openModal('offline', {
      title: 'menu.offline.title', icon: 'bot',
      build(m) {
        const info = h('div', { class: 'mm-note' });
        const upd = () => { const n = off.bots + 1; info.textContent = t('menu.offline.players', { n }) + ' ' + t('menu.offline.impCount', { n: AS.aiNeededFor(n) }) + ' · ' + t('ai.level.' + off.aiLevel); };
        const bots = stepper({ value: off.bots, min: 3, max: T.MAX_LOBBY - 1, onChange: (v) => { off.bots = v; upd(); } });
        const lvl = stepper({ value: off.aiLevel, min: 1, max: 5, format: (v) => v + ' · ' + t('ai.level.' + v), onChange: (v) => { off.aiLevel = v; upd(); } });
        const skill = segmented({ value: off.botSkill, options: ['easy', 'normal', 'hard'].map((k) => ({ id: k, label: t('set.botSkill.' + k) })), onChange: (v) => (off.botSkill = v) });
        m.body.append(field('menu.offline.bots', bots), field('menu.offline.impostors', lvl), field('menu.offline.skill', skill), info);
        upd();
        m.foot.append(h('button', { class: 'btn btn--primary btn--lg', type: 'button', onclick: () => { sfx('click'); closeAll(true); App.startOffline({ bots: off.bots, aiLevel: off.aiLevel, botSkill: off.botSkill }); } }, t('menu.offline.start')));
      },
    });
  }

  // ------------------------------------------------------------------ online
  function openOnline() {
    const fileMode = location.protocol === 'file:';
    let server = AS.util.store.get('server', fileMode ? 'localhost:3000' : '');
    openModal('online', {
      title: 'menu.online.title', icon: 'globe',
      build(m) {
        const status = h('div', { class: 'mm-note mm-status' });
        m.status = status;
        let srv = null;
        if (fileMode || server) {
          srv = h('input', { class: 'input', value: server, placeholder: 'localhost:3000', spellcheck: 'false' });
          srv.addEventListener('input', () => { server = srv.value.trim(); });
          m.body.append(field('menu.online.server', srv), h('div', { class: 'mm-note' }, [t('menu.online.serverHint'), ' ', h('code', { text: 'start-server.bat' })]));
        }
        const url = () => {
          AS.util.store.set('server', server);
          const r = AS.Net && AS.Net.resolveUrl ? AS.Net.resolveUrl(server) : null;
          return r || undefined;
        };
        const code = h('input', { class: 'input mm-code', maxlength: '4', placeholder: 'ABCD', spellcheck: 'false', autocapitalize: 'characters' });
        code.addEventListener('input', () => { code.value = code.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4); });
        const go = (c) => {
          if (fileMode && !server) { App.toast(t('menu.online.badServer'), 2500, 'error'); return; }
          if (c != null && c.length !== 4) { App.toast(t('menu.online.badCode'), 2500, 'error'); return; }
          status.textContent = t('menu.status.connecting');
          App.startOnline({ url: url(), code: c });
        };
        m.body.append(
          h('button', { class: 'btn btn--success btn--lg mm-wide', type: 'button', onclick: () => { sfx('click'); go(null); } }, [h('b', { i18n: 'menu.online.create' })]),
          h('div', { class: 'mm-note', i18n: 'menu.online.createSub' }),
          h('div', { class: 'mm-or', i18n: 'menu.online.or' }),
          field('menu.online.joinTitle', h('div', { class: 'row' }, [code, h('button', { class: 'btn btn--primary', type: 'button', onclick: () => { sfx('click'); go(code.value); } }, t('menu.online.join'))])),
          status,
        );
      },
    });
  }

  // ------------------------------------------------------------------ customize
  function takenColors() {
    if (!inLobbyPhase()) return [];
    const me = myId();
    return (App.snap.players || []).filter((p) => !sameId(p.id, me) && !p.left).map((p) => p.color);
  }
  function openCustomize() {
    const prof = App.profile;
    openModal('customize', {
      title: 'menu.cz.title', icon: 'palette',
      build(m) {
        const me = myPlayer();
        const cur = { name: prof.name, color: me && inLobbyPhase() ? me.color : prof.color, hat: me && inLobbyPhase() ? me.hat : prof.hat };
        let prev = portraitEl(cur.color, cur.hat, 120, 'mm-prev');
        const name = h('input', { class: 'input', value: cur.name || '', maxlength: '12', placeholder: t('menu.cz.namePh') });
        const colors = h('div', { class: 'mm-colors' });
        const hats = h('div', { class: 'mm-hats' });
        const apply = () => {
          prev = setPortrait(prev, cur.color, cur.hat, 120);
          for (const b of colors.children) b.classList.toggle('on', b.dataset.c === cur.color);
          for (const b of hats.children) b.classList.toggle('on', b.dataset.h === cur.hat);
        };
        const commit = () => {
          prof.name = cleanName(name.value) || prof.name; prof.color = cur.color; prof.hat = cur.hat;
          App.saveProfile();
          if (inLobbyPhase()) App.send({ type: 'setLook', name: prof.name, color: cur.color, hat: cur.hat });
        };
        const taken = takenColors();
        for (const c of AS.COLORS) {
          const b = h('button', { class: 'mm-color', type: 'button', dataset: { c: c.id }, style: '--c:' + c.main + ';--s:' + c.shade, title: t('color.' + c.id) });
          if (taken.indexOf(c.id) >= 0) { b.disabled = true; b.title = t('menu.cz.taken'); }
          b.onclick = () => { sfx('click'); cur.color = c.id; apply(); commit(); };
          colors.appendChild(b);
        }
        for (const id of AS.HATS) {
          const b = h('button', { class: 'mm-hat', type: 'button', dataset: { h: id }, title: t('hat.' + id) }, portraitEl(cur.color === 'white' ? 'black' : 'white', id, 56));
          b.onclick = () => { sfx('click'); cur.hat = id; apply(); commit(); };
          hats.appendChild(b);
        }
        name.addEventListener('change', commit);
        m.body.append(h('div', { class: 'mm-cz' }, [h('div', { class: 'mm-cz-prev' }, [prev]), h('div', { class: 'mm-cz-form' }, [field('menu.cz.name', name), field('menu.cz.color', colors)])]), field('menu.cz.hat', hats));
        apply();
        m.foot.append(h('button', { class: 'btn btn--primary', type: 'button', onclick: () => { commit(); sfx('click'); closeModal('customize'); } }, t('menu.cz.done')));
      },
    });
  }

  // ------------------------------------------------------------------ settings
  function openSettings(opts) {
    opts = opts || {};
    const P = App.prefs;
    openModal('settings', {
      title: 'menu.set.title', icon: 'gear',
      build(m) {
        const lang = segmented({ value: P.lang, options: AS.i18n.LANGS.map((l) => ({ id: l.id, label: l.name })), onChange: (v) => { P.lang = v; App.savePrefs(); } });
        const sl = (k) => slider({ value: P[k], label: t('menu.set.' + k), onInput: (v) => { P[k] = v; App.savePrefs(); } });
        m.body.append(
          field('menu.set.language', lang),
          h('div', { class: 'mm-sec', i18n: 'menu.set.audio' }), field('menu.set.master', sl('master')), field('menu.set.sfx', sl('sfx')), field('menu.set.music', sl('music')),
          h('div', { class: 'mm-sec', i18n: 'menu.set.display' }), field('menu.set.fps', toggleSwitch({ checked: P.showFps, onChange: (v) => { P.showFps = v; App.savePrefs(); } })),
        );
        if (opts.inGame && inGameSession()) {
          let armed = false;
          const leaveB = h('button', { class: 'btn btn--danger', type: 'button', onclick: () => { if (!armed) { armed = true; leaveB.textContent = t('menu.set.leaveConfirm'); return; } closeAll(true); App.leave(); } }, t('menu.set.leave'));
          m.foot.append(leaveB, h('button', { class: 'btn btn--primary', type: 'button', onclick: () => closeModal('settings') }, t('menu.set.resume')));
        }
      },
    });
  }

  // ------------------------------------------------------------------ how to play
  function openHowto() {
    openModal('howto', {
      title: 'menu.howto.title', icon: 'help',
      build(m) {
        const sec = (k) => h('div', { class: 'mm-how' }, [h('b', { i18n: 'menu.howto.' + k + '.t' }), h('p', { i18n: 'menu.howto.' + k + '.d' })]);
        const key = (keys, k) => h('div', { class: 'mm-key' }, [h('span', {}, keys.map((x) => h('span', { class: 'kbd', text: x }))), h('span', { i18n: k })]);
        m.body.append(
          h('div', { class: 'mm-sec', i18n: 'menu.howto.rules' }),
          ...['roles', 'tasks', 'report', 'meeting', 'sabotage', 'vents'].map(sec),
          h('p', { class: 'mm-note', i18n: 'menu.howto.ghost' }), h('p', { class: 'mm-note', i18n: 'menu.chatHint' }),
          h('div', { class: 'mm-sec', i18n: 'menu.howto.controls' }),
          h('b', { i18n: 'menu.ctl.keyboard' }),
          key(['W', 'A', 'S', 'D'], 'menu.ctl.move'), key(['E', 'Space'], 'menu.ctl.use'), key(['R'], 'menu.ctl.report'), key(['Q'], 'menu.ctl.kill'),
          key(['V'], 'menu.ctl.vent'), key(['Tab', 'M'], 'menu.ctl.map'), key(['Esc'], 'menu.ctl.esc'),
          h('p', { class: 'mm-note', i18n: 'menu.ctl.mouse' }),
          h('b', { i18n: 'menu.ctl.touch' }), h('p', { class: 'mm-note', i18n: 'menu.ctl.joystick' }), h('p', { class: 'mm-note', i18n: 'menu.ctl.buttons' }),
          h('p', { class: 'mm-note', i18n: 'menu.agentHint' }),
        );
      },
    });
  }

  // ------------------------------------------------------------------ lobby overlay + game settings
  let lobbyEl = null, lobbySig = '';
  const GROUPS = { aiLevel: 'ai', winByTasks: 'ai', killCooldown: 'impostor', killDistance: 'impostor', impostorVision: 'impostor', playerSpeed: 'player', crewVision: 'player',
    emergencyMeetings: 'meeting', emergencyCooldown: 'meeting', qaRounds: 'meeting', answerTime: 'meeting', votingTime: 'meeting', confirmEjects: 'meeting', anonymousVotes: 'meeting',
    taskBarUpdates: 'tasks', commonTasks: 'tasks', longTasks: 'tasks', shortTasks: 'tasks', visualTasks: 'tasks', botSkill: 'bots' };
  function openGameSettings() {
    openModal('gamesettings', {
      title: 'menu.lobby.settings', icon: 'sliders',
      build(m) {
        const host = isHostNow();
        const s = Object.assign({}, App.snap.settings);
        const send = () => App.send({ type: 'settings', settings: s });
        if (!host) m.body.append(h('div', { class: 'mm-note', i18n: 'menu.lobby.readonly' }));
        let grp = null;
        for (const sc of AS.SETTINGS_SCHEMA) {
          const g = GROUPS[sc.key] || 'other';
          if (g !== grp) { grp = g; m.body.append(h('div', { class: 'mm-sec', i18n: 'menu.lobby.grp.' + g })); }
          let ctl;
          if (!host) ctl = h('span', { class: 'mm-ro', text: fmtSetting(sc, s[sc.key]) });
          else if (sc.type === 'bool') ctl = toggleSwitch({ checked: s[sc.key], onChange: (v) => { s[sc.key] = v; send(); } });
          else if (sc.type === 'enum') ctl = segmented({ value: s[sc.key], options: sc.options.map((o) => ({ id: o, label: t('set.' + sc.key + '.' + o) })), onChange: (v) => { s[sc.key] = v; send(); } });
          else ctl = stepper({ value: s[sc.key], min: sc.min, max: sc.max, step: sc.step, format: (v) => fmtSetting(sc, v), onChange: (v) => { s[sc.key] = v; send(); } });
          m.body.append(field('set.' + sc.key, ctl));
        }
        if (host) m.foot.append(h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => { App.send({ type: 'settings', settings: AS.sanitizeSettings({}) }); closeModal('gamesettings'); } }, t('menu.lobby.defaults')));
      },
    });
  }
  function renderLobby() {
    const s = App && App.snap;
    const show = !!(s && App.mode && App.screen === 'game' && s.phase === 'lobby');
    if (!show) { if (lobbyEl) { lobbyEl.remove(); lobbyEl = null; lobbySig = ''; } return; }
    const host = isHostNow();
    const ps = (s.players || []).filter((p) => !p.left);
    const sig = [AS.i18n.getLang(), host, s.countdown, App.room && App.room.code, ps.map((p) => p.id + p.color + p.hat + p.name + (p.isHost ? 'h' : '')).join(',')].join('|');
    if (sig === lobbySig && lobbyEl) return;
    lobbySig = sig;
    if (lobbyEl) lobbyEl.remove();
    const code = App.mode === 'online' && App.room ? App.room.code : null;
    const need = Math.max(0, T.MIN_PLAYERS - ps.length);
    const list = h('div', { class: 'lb-list' }, ps.map((p) => h('div', { class: 'lb-p' + (sameId(p.id, myId()) ? ' me' : '') }, [
      portraitEl(p.color, p.hat, 40, 'lb-por'),
      h('span', { class: 'lb-name', text: p.name }),
      p.isHost ? h('span', { class: 'lb-tag', html: svgIcon('crown') }) : null,
      p.isBot ? h('span', { class: 'lb-tag chip', text: t('ui.bot') }) : null,
      p.isBot && host ? h('button', { class: 'lb-x', type: 'button', title: t('menu.lobby.removeBot'), html: svgIcon('close'), onclick: () => App.send({ type: 'removeBot', id: p.id }) }) : null,
    ])));
    const startB = h('button', { class: 'btn btn--primary btn--lg', type: 'button', disabled: !host || need > 0 || s.countdown != null ? true : null, onclick: () => { sfx('click'); App.send({ type: 'start' }); } }, t('menu.lobby.start'));
    lobbyEl = h('div', { class: 'lb panel interactive' }, [
      h('div', { class: 'lb-head' }, [
        code ? h('button', { class: 'lb-code', type: 'button', title: t('menu.lobby.copy'), onclick: () => { try { navigator.clipboard.writeText(code); } catch (e) { /* ignore */ } App.toast(t('menu.lobby.copied', { code }), 1800); } }, [h('small', { i18n: 'menu.lobby.code' }), h('b', { text: code })])
          : h('b', { class: 'lb-off', i18n: 'menu.lobby.offline' }),
        h('span', { class: 'chip', text: t('menu.lobby.players') + ' ' + ps.length + '/' + T.MAX_LOBBY }),
      ]),
      list,
      h('div', { class: 'lb-btns' }, [
        h('button', { class: 'btn btn--sm', type: 'button', onclick: openCustomize }, t('menu.lobby.customize')),
        h('button', { class: 'btn btn--sm', type: 'button', onclick: openGameSettings }, t('menu.lobby.settings')),
        host ? h('button', { class: 'btn btn--sm btn--success', type: 'button', disabled: ps.length >= T.MAX_LOBBY ? true : null, onclick: () => App.send({ type: 'addBot' }) }, t('menu.lobby.addBot')) : null,
      ]),
      ps.length >= T.MIN_PLAYERS ? h('div', { class: 'mm-note' }, t('menu.lobby.aiJoin', { n: AS.aiNeededFor(ps.length) })) : null,
      h('div', { class: 'mm-note' }, s.countdown != null ? t('menu.lobby.starting') + ' ' + s.countdown : need > 0 ? t('menu.lobby.need', { n: need }) : host ? '' : t('menu.lobby.waitHost')),
      h('div', { class: 'lb-btns' }, [h('button', { class: 'btn btn--danger btn--sm', type: 'button', onclick: () => App.leave() }, t('menu.lobby.leave')), host ? startB : null]),
    ]);
    (document.getElementById('screens') || document.body).appendChild(lobbyEl);
  }

  // ------------------------------------------------------------------ init / API
  function init(app) {
    App = app;
    buildMenu();
    App.on('screen', onScreen);
    App.on('snapshot', () => { renderLobby(); for (const m of modals) if (m.update) try { m.update(App.snap); } catch (e) { warnOnce('upd', e); } });
    App.on('lang', () => { AS.i18n.apply && AS.i18n.apply(document.body); lobbySig = ''; renderLobby(); for (const m of modals.slice()) m.render(); });
    App.on('status', (s) => { const m = getModal('online'); if (m && m.status) m.status.textContent = t('menu.status.' + s); });
    App.on('room', () => closeAll(true));
    App.on('phase', (p) => { if (p !== 'lobby' && p !== 'ended') closeAll(true, ['settings']); });
    if (AS.Input && AS.Input.on) AS.Input.on('escape', () => { if (modals.length) closeModal(modals[modals.length - 1].id); });
    onScreen(App.screen);
  }

  AS.UIMenu = { init, openSettings, openCustomize, openOffline, openOnline, closeAll };
})(globalThis.AS = globalThis.AS || {});
