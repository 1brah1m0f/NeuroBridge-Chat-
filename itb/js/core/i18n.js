/* AI IMPOSTOR: SPACE SHIP — i18n (Azerbaijani default + English).
 * Usage: AS.t('key', {n: 2, name: 'Kosmo'})  ->  '{n}' / '{name}' placeholders are replaced.
 * Plurals: if params.n === 1 and 'key_one' exists it is used (English only needs it).
 * Each module registers its OWN strings with AS.i18n.add({ az: {...}, en: {...} }) using its own key prefix.
 * DOM helper: elements with data-i18n="key" get textContent; data-i18n-ph="key" sets placeholder;
 * data-i18n-title="key" sets title. Call AS.i18n.apply(root) after building DOM (auto on language change).
 */
(function (AS) {
  'use strict';

  const dict = { az: {}, en: {} };
  let lang = 'az';
  const listeners = [];

  const i18n = (AS.i18n = {
    LANGS: [
      { id: 'az', name: 'Azərbaycanca' },
      { id: 'en', name: 'English' },
    ],
    add(d) {
      for (const l in d) {
        if (!dict[l]) dict[l] = {};
        Object.assign(dict[l], d[l]);
      }
    },
    has(key) { return dict[lang][key] != null || dict.en[key] != null; },
    t(key, params) {
      let s;
      if (params && params.n === 1) s = dict[lang][key + '_one'];
      if (s == null) s = dict[lang][key];
      if (s == null && params && params.n === 1) s = dict.en[key + '_one'];
      if (s == null) s = dict.en[key];
      if (s == null) return key;
      if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? params[k] : m));
      return s;
    },
    // translate in a specific language (bots / server)
    tl(l, key, params) { const keep = lang; if (dict[l]) lang = l; try { return i18n.t(key, params); } finally { lang = keep; } },
    getLang() { return lang; },
    setLang(l) {
      if (!dict[l] || l === lang) return;
      lang = l;
      if (typeof document !== 'undefined') {
        document.documentElement.lang = l;
        i18n.apply(document);
      }
      for (const fn of listeners.slice()) { try { fn(l); } catch (e) { console.error(e); } }
    },
    onChange(fn) { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; },
    // Locale-correct uppercase (Azerbaijani i -> İ).
    upper(s) { return String(s).toLocaleUpperCase(lang === 'az' ? 'az' : 'en'); },
    apply(root) {
      if (!root || !root.querySelectorAll) return;
      root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = i18n.t(el.getAttribute('data-i18n')); });
      root.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.setAttribute('placeholder', i18n.t(el.getAttribute('data-i18n-ph'))); });
      root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.setAttribute('title', i18n.t(el.getAttribute('data-i18n-title'))); });
    },
  });
  AS.t = i18n.t;

  // ---------- Shared strings (roles, colors, hats, settings, results, common UI) ----------
  i18n.add({
    az: {
      'game.title': 'AI SAXTAKAR: KOSMİK GƏMİ',
      'game.tagline': 'Aramızda kim AI-dır?',
      'map.starship': 'Kosmik gəmi',

      'ui.ok': 'Oldu', 'ui.cancel': 'Ləğv et', 'ui.back': 'Geri', 'ui.close': 'Bağla', 'ui.yes': 'Bəli', 'ui.no': 'Xeyr',
      'ui.play': 'Oyna', 'ui.start': 'Başla', 'ui.leave': 'Çıx', 'ui.settings': 'Ayarlar', 'ui.language': 'Dil',
      'ui.loading': 'Yüklənir...', 'ui.you': 'Sən', 'ui.host': 'Otaq sahibi', 'ui.bot': 'Bot', 'ui.seconds': '{n} san',
      'ui.players': 'Oyunçular', 'ui.save': 'Yadda saxla', 'ui.resume': 'Davam et', 'ui.on': 'Açıq', 'ui.off': 'Bağlı',

      'role.crew': 'Real oyunçu', 'role.crew.plural': 'Real oyunçular',
      'role.impostor': 'AI saxtakar', 'role.impostor.plural': 'AI saxtakarlar',
      'role.ghost': 'Ruh',

      'win.tasks': 'Real oyunçular gəminin bütün sistemlərini təmir etdi',
      'win.votedOut': 'Bütün AI saxtakarlar gəmidən atıldı',
      'win.kills': 'AI saxtakarlar real oyunçuları üstələdi',
      'win.sabotage': 'Sabotaj gəmini məhv etdi',
      'win.disconnect': 'Oyunçular oyunu tərk etdi',
      'ai.level.1': 'Yeni başlayan', 'ai.level.2': 'Başlayan', 'ai.level.3': 'Orta', 'ai.level.4': 'Təcrübəli', 'ai.level.5': 'Ustad',

      'sab.lights': 'İşıqlar', 'sab.comms': 'Rabitə', 'sab.reactor': 'Reaktor', 'sab.o2': 'Oksigen', 'sab.doors': 'Qapılar',

      'color.red': 'Qırmızı', 'color.blue': 'Mavi', 'color.green': 'Yaşıl', 'color.pink': 'Çəhrayı',
      'color.orange': 'Narıncı', 'color.yellow': 'Sarı', 'color.black': 'Qara', 'color.white': 'Ağ',
      'color.purple': 'Bənövşəyi', 'color.brown': 'Qəhvəyi', 'color.cyan': 'Firuzəyi', 'color.lime': 'Açıq yaşıl',
      'color.maroon': 'Tünd qırmızı', 'color.rose': 'Qızılgül', 'color.coral': 'Mərcan', 'color.teal': 'Tünd firuzəyi',

      'hat.none': 'Yoxdur', 'hat.party': 'Şənlik papağı', 'hat.crown': 'Tac', 'hat.chef': 'Aşpaz papağı',
      'hat.cowboy': 'Kovboy şlyapası', 'hat.tophat': 'Silindr', 'hat.beanie': 'Toxunma papaq', 'hat.headphones': 'Qulaqlıq',
      'hat.flower': 'Gül', 'hat.halo': 'Nur halqası', 'hat.horns': 'Buynuzlar', 'hat.catears': 'Pişik qulaqları',
      'hat.sprout': 'Cücərti', 'hat.papaq': 'Papaq', 'hat.nar': 'Nar', 'hat.wizard': 'Sehrbaz papağı',

      'set.aiLevel': 'AI səviyyəsi', 'set.winByTasks': 'Tapşırıqla qələbə', 'set.qaRounds': 'Sual sayı', 'set.answerTime': 'Cavab vaxtı', 'set.impostors': 'AI sayı', 'set.killCooldown': 'AI-nin öldürmə gözləməsi', 'set.killDistance': 'AI-nin öldürmə məsafəsi',
      'set.killDistance.short': 'Qısa', 'set.killDistance.normal': 'Orta', 'set.killDistance.long': 'Uzun',
      'set.playerSpeed': 'Oyunçu sürəti', 'set.crewVision': 'Real oyunçunun görmə məsafəsi', 'set.impostorVision': 'AI-nin görmə məsafəsi',
      'set.emergencyMeetings': 'Təcili yığıncaq sayı', 'set.emergencyCooldown': 'Təcili düymə gözləməsi',
      'set.discussionTime': 'Müzakirə vaxtı', 'set.votingTime': 'Səsvermə vaxtı',
      'set.confirmEjects': 'Atılanın rolunu göstər', 'set.anonymousVotes': 'Gizli səsvermə',
      'set.taskBarUpdates': 'Tapşırıq zolağı', 'set.taskBarUpdates.always': 'Həmişə', 'set.taskBarUpdates.meetings': 'Yığıncaqlarda', 'set.taskBarUpdates.never': 'Heç vaxt',
      'set.commonTasks': 'Ümumi tapşırıqlar', 'set.longTasks': 'Uzun tapşırıqlar', 'set.shortTasks': 'Qısa tapşırıqlar',
      'set.visualTasks': 'Görünən tapşırıqlar', 'set.botSkill': 'Botların səviyyəsi',
      'set.botSkill.easy': 'Asan', 'set.botSkill.normal': 'Orta', 'set.botSkill.hard': 'Çətin',

      'err.full': 'Otaq doludur', 'err.inProgress': 'Oyun artıq başlayıb', 'err.noRoom': 'Belə otaq tapılmadı',
      'err.colorTaken': 'Bu rəng artıq seçilib', 'err.notHost': 'Yalnız otaq sahibi edə bilər',
      'err.needPlayers': 'Ən azı {n} oyunçu lazımdır', 'err.connection': 'Serverə qoşulmaq alınmadı', 'err.disconnected': 'Serverlə əlaqə kəsildi',
    },
    en: {
      'game.title': 'AI IMPOSTOR: SPACE SHIP',
      'game.tagline': 'Which of us is the AI?',
      'map.starship': 'Space Ship',

      'ui.ok': 'OK', 'ui.cancel': 'Cancel', 'ui.back': 'Back', 'ui.close': 'Close', 'ui.yes': 'Yes', 'ui.no': 'No',
      'ui.play': 'Play', 'ui.start': 'Start', 'ui.leave': 'Leave', 'ui.settings': 'Settings', 'ui.language': 'Language',
      'ui.loading': 'Loading...', 'ui.you': 'You', 'ui.host': 'Host', 'ui.bot': 'Bot', 'ui.seconds': '{n}s',
      'ui.players': 'Players', 'ui.save': 'Save', 'ui.resume': 'Resume', 'ui.on': 'On', 'ui.off': 'Off',

      'role.crew': 'Real Player', 'role.crew.plural': 'Real Players',
      'role.impostor': 'AI Impostor', 'role.impostor.plural': 'AI Impostors',
      'role.ghost': 'Ghost',

      'win.tasks': 'Real players repaired every ship system',
      'win.votedOut': 'All AI Impostors were ejected from the ship',
      'win.kills': 'The AIs outnumbered the real players',
      'win.sabotage': 'Sabotage destroyed the ship',
      'win.disconnect': 'Players disconnected',
      'ai.level.1': 'Rookie', 'ai.level.2': 'Beginner', 'ai.level.3': 'Average', 'ai.level.4': 'Advanced', 'ai.level.5': 'Master',

      'sab.lights': 'Lights', 'sab.comms': 'Comms', 'sab.reactor': 'Reactor', 'sab.o2': 'Oxygen', 'sab.doors': 'Doors',

      'color.red': 'Red', 'color.blue': 'Blue', 'color.green': 'Green', 'color.pink': 'Pink',
      'color.orange': 'Orange', 'color.yellow': 'Yellow', 'color.black': 'Black', 'color.white': 'White',
      'color.purple': 'Purple', 'color.brown': 'Brown', 'color.cyan': 'Cyan', 'color.lime': 'Lime',
      'color.maroon': 'Maroon', 'color.rose': 'Rose', 'color.coral': 'Coral', 'color.teal': 'Teal',

      'hat.none': 'None', 'hat.party': 'Party Hat', 'hat.crown': 'Crown', 'hat.chef': 'Chef Hat',
      'hat.cowboy': 'Cowboy Hat', 'hat.tophat': 'Top Hat', 'hat.beanie': 'Beanie', 'hat.headphones': 'Headphones',
      'hat.flower': 'Flower', 'hat.halo': 'Halo', 'hat.horns': 'Horns', 'hat.catears': 'Cat Ears',
      'hat.sprout': 'Sprout', 'hat.papaq': 'Papakha', 'hat.nar': 'Pomegranate', 'hat.wizard': 'Wizard Hat',

      'set.aiLevel': 'AI Level', 'set.winByTasks': 'Win by Tasks', 'set.qaRounds': 'Questions per Meeting', 'set.answerTime': 'Answer Time', 'set.impostors': '# AI Impostors', 'set.killCooldown': 'AI Kill Cooldown', 'set.killDistance': 'AI Kill Distance',
      'set.killDistance.short': 'Short', 'set.killDistance.normal': 'Normal', 'set.killDistance.long': 'Long',
      'set.playerSpeed': 'Player Speed', 'set.crewVision': 'Player Vision', 'set.impostorVision': 'AI Vision',
      'set.emergencyMeetings': 'Emergency Meetings', 'set.emergencyCooldown': 'Emergency Cooldown',
      'set.discussionTime': 'Discussion Time', 'set.votingTime': 'Voting Time',
      'set.confirmEjects': 'Confirm Ejects', 'set.anonymousVotes': 'Anonymous Votes',
      'set.taskBarUpdates': 'Task Bar Updates', 'set.taskBarUpdates.always': 'Always', 'set.taskBarUpdates.meetings': 'Meetings', 'set.taskBarUpdates.never': 'Never',
      'set.commonTasks': 'Common Tasks', 'set.longTasks': 'Long Tasks', 'set.shortTasks': 'Short Tasks',
      'set.visualTasks': 'Visual Tasks', 'set.botSkill': 'Bot Skill',
      'set.botSkill.easy': 'Easy', 'set.botSkill.normal': 'Normal', 'set.botSkill.hard': 'Hard',

      'err.full': 'Room is full', 'err.inProgress': 'Game already in progress', 'err.noRoom': 'Room not found',
      'err.colorTaken': 'That color is taken', 'err.notHost': 'Only the host can do that',
      'err.needPlayers': 'Need at least {n} players', 'err.connection': 'Could not connect to server', 'err.disconnected': 'Disconnected from server',
    },
  });
})(globalThis.AS = globalThis.AS || {});
