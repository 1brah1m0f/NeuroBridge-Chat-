/* AI IMPOSTOR: SPACE SHIP — shared constants & tuning (browser + Node). */
(function (AS) {
  'use strict';

  AS.GAME_TITLE = 'AI IMPOSTOR: SPACE SHIP';
  AS.PROTOCOL = 1;

  // ---- Tuning (world units; seconds) ----
  AS.T = {
    TICK: 1 / 30,              // fixed simulation step
    SNAPSHOT_HZ: 15,           // online snapshot rate (local mode: every tick)
    MOVE_SEND_HZ: 30,          // client -> server move rate
    GRID: 10,                  // geometry cell size. ALL floor/door rect coords are multiples of 10.
    PLAYER_RADIUS: 20,         // collision circle at the FEET point (x, y)
    BASE_SPEED: 260,           // units/s at playerSpeed 1.0
    GHOST_SPEED_MULT: 1.3,
    BASE_VISION: 330,          // vision radius at vision 1.0
    MIN_VISION: 90,
    LIGHTS_OFF_MULT: 0.25,     // crew vision multiplier while lights are sabotaged
    KILL_DIST: { short: 100, normal: 140, long: 190 },
    USE_RANGE: 110,            // task stations, sabotage panels, consoles
    VENT_RANGE: 100,
    REPORT_RANGE: 170,
    BUTTON_RANGE: 160,         // emergency button (measured to button x,y)
    MIN_PLAYERS: 4,            // humans + NPC crew in the lobby (the AI impostors are added on top at start)
    MAX_PLAYERS: 12,           // total in a match, AI impostors included
    MAX_LOBBY: 9,              // lobby cap: 9 + 3 AI = 12
    QA_QUESTION_TIME: 3,       // seconds the question is shown before the first answer turn
    QA_GAP: 0.8,               // pause between answer turns
    QA_ROUND_END: 2,           // pause after the last answer of a question
    LOBBY_COUNTDOWN: 3,
    INTRO_TIME: 6,
    FIRST_KILL_COOLDOWN: 10,   // at game start: min(this, settings.killCooldown)
    MEETING_INTRO_TIME: 3,     // "Emergency meeting / Body reported" splash
    RESULTS_TIME: 5,
    EJECT_TIME: 7,
    SABOTAGE_COOLDOWN: 30,     // after a non-door sabotage ends
    SABOTAGE_START_COOLDOWN: 10, // at game start and after each meeting
    REACTOR_TIME: 45,
    O2_TIME: 45,
    DOOR_CLOSE_TIME: 10,
    DOOR_COOLDOWN: 30,         // per room
    SCAN_TIME: 9,
    VENT_ACTION_COOLDOWN: 0.4,
    WALL_FACE: 80,             // visual height of north wall faces (renderer); map leaves room for it
    VIEW_HEIGHT: 900,          // world units visible vertically on desktop
    VIEW_HEIGHT_SMALL: 700,    // when CSS viewport height < 500 (phones)
  };

  AS.PHASE = { LOBBY: 'lobby', INTRO: 'intro', PLAYING: 'playing', MEETING: 'meeting', EJECTING: 'ejecting', ENDED: 'ended' };
  AS.ROLE = { CREW: 'crew', IMPOSTOR: 'impostor' };
  AS.SABOTAGE = { LIGHTS: 'lights', COMMS: 'comms', REACTOR: 'reactor', O2: 'o2', DOORS: 'doors' };
  AS.CRITICAL_SABOTAGES = ['reactor', 'o2'];
  AS.WIN_REASON = { TASKS: 'tasks', VOTED_OUT: 'votedOut', KILLS: 'kills', SABOTAGE: 'sabotage', DISCONNECT: 'disconnect' };

  // ---- Character colors (main body + shade). Names via i18n key `color.<id>` ----
  AS.COLORS = [
    { id: 'red', main: '#e8343b', shade: '#9b1730' },
    { id: 'blue', main: '#2e5cf2', shade: '#1a2f9e' },
    { id: 'green', main: '#1fa45a', shade: '#0f6b3a' },
    { id: 'pink', main: '#f25cc0', shade: '#a8317f' },
    { id: 'orange', main: '#f7871e', shade: '#b3510f' },
    { id: 'yellow', main: '#f6e14b', shade: '#c09a1a' },
    { id: 'black', main: '#3f4752', shade: '#1e232b' },
    { id: 'white', main: '#e3ecf5', shade: '#8996b5' },
    { id: 'purple', main: '#7b3fd6', shade: '#47208a' },
    { id: 'brown', main: '#7a5233', shade: '#4c2f1c' },
    { id: 'cyan', main: '#3ef0e8', shade: '#1f9fb0' },
    { id: 'lime', main: '#8ff04a', shade: '#4fa520' },
    { id: 'maroon', main: '#7d2236', shade: '#4a1020' },
    { id: 'rose', main: '#f7c1d9', shade: '#d27ba3' },
    { id: 'coral', main: '#ff7a6b', shade: '#c9453d' },
    { id: 'teal', main: '#1b8f8f', shade: '#0d5658' },
  ];
  AS.COLOR_BY_ID = {};
  AS.COLORS.forEach((c) => (AS.COLOR_BY_ID[c.id] = c));

  // ---- Hats (drawn by AS.Art). Names via i18n key `hat.<id>` ----
  AS.HATS = ['none', 'party', 'crown', 'chef', 'cowboy', 'tophat', 'beanie', 'headphones', 'flower', 'halo', 'horns', 'catears', 'sprout', 'papaq', 'nar', 'wizard'];

  AS.BOT_NAMES = ['Kosmo', 'Nova', 'Orbit', 'Pixel', 'Kometa', 'Ulduz', 'Aysel', 'Murad', 'Leyla', 'Tural', 'Nigar', 'Elvin',
    'Günay', 'Rüstəm', 'Fidan', 'Kamran', 'Səbinə', 'Zaur', 'Lalə', 'Orxan', 'Aytac', 'Comet', 'Rocket', 'Nebula', 'Bolt',
    'Echo', 'Zippy', 'Mochi', 'Luna', 'Atlas'];

  // ---- Lobby settings schema (lobby UI is generated from this) ----
  AS.SETTINGS_SCHEMA = [
    { key: 'aiLevel', type: 'int', min: 1, max: 5, step: 1, def: 3 },
    { key: 'winByTasks', type: 'bool', def: true },
    { key: 'killCooldown', type: 'num', min: 10, max: 60, step: 2.5, def: 25, unit: 's' },
    { key: 'killDistance', type: 'enum', options: ['short', 'normal', 'long'], def: 'normal' },
    { key: 'playerSpeed', type: 'num', min: 0.5, max: 3, step: 0.25, def: 1, unit: 'x' },
    { key: 'crewVision', type: 'num', min: 0.25, max: 5, step: 0.25, def: 1, unit: 'x' },
    { key: 'impostorVision', type: 'num', min: 0.25, max: 5, step: 0.25, def: 1.5, unit: 'x' },
    { key: 'emergencyMeetings', type: 'int', min: 0, max: 9, step: 1, def: 1 },
    { key: 'emergencyCooldown', type: 'int', min: 0, max: 60, step: 5, def: 15, unit: 's' },
    { key: 'qaRounds', type: 'int', min: 1, max: 5, step: 1, def: 3 },
    { key: 'answerTime', type: 'int', min: 10, max: 60, step: 5, def: 25, unit: 's' },
    { key: 'votingTime', type: 'int', min: 15, max: 300, step: 15, def: 60, unit: 's' },
    { key: 'confirmEjects', type: 'bool', def: true },
    { key: 'anonymousVotes', type: 'bool', def: false },
    { key: 'taskBarUpdates', type: 'enum', options: ['always', 'meetings', 'never'], def: 'always' },
    { key: 'commonTasks', type: 'int', min: 0, max: 2, step: 1, def: 1 },
    { key: 'longTasks', type: 'int', min: 0, max: 3, step: 1, def: 1 },
    { key: 'shortTasks', type: 'int', min: 0, max: 5, step: 1, def: 2 },
    { key: 'visualTasks', type: 'bool', def: true },
    { key: 'botSkill', type: 'enum', options: ['easy', 'normal', 'hard'], def: 'normal' },
  ];
  AS.DEFAULT_SETTINGS = {};
  AS.SETTINGS_SCHEMA.forEach((s) => (AS.DEFAULT_SETTINGS[s.key] = s.def));

  // AI impostors for a TOTAL player count (humans + NPC crew + AI):  5-6 -> 1, 7-9 -> 2, 10-12 -> 3.
  AS.aiCountFor = (total) => (total >= 10 ? 3 : total >= 7 ? 2 : 1);
  // AI impostors to ADD to `nonAi` humans/NPCs so that the total matches the table above (4 -> 1, 6 -> 2, 8 -> 3, 9 -> 3).
  AS.aiNeededFor = function (nonAi) {
    for (let a = 1; a <= 3; a++) if (AS.aiCountFor(nonAi + a) === a) return a;
    return 3;
  };
  AS.maxImpostorsFor = (n) => AS.aiCountFor(n); // legacy name

  // Clamp/validate any settings object -> full valid settings object.
  AS.sanitizeSettings = function (input) {
    const out = {};
    const src = input || {};
    for (const s of AS.SETTINGS_SCHEMA) {
      let v = src[s.key];
      if (s.type === 'bool') v = typeof v === 'boolean' ? v : s.def;
      else if (s.type === 'enum') v = s.options.indexOf(v) >= 0 ? v : s.def;
      else {
        v = Number(v);
        if (!isFinite(v)) v = s.def;
        v = Math.min(s.max, Math.max(s.min, v));
        v = Math.round((v - s.min) / s.step) * s.step + s.min;
        v = Math.round(v * 100) / 100;
      }
      out[s.key] = v;
    }
    if (out.commonTasks + out.longTasks + out.shortTasks === 0) out.shortTasks = 1;
    return out;
  };

  // Mini-game ids. Each is registered with AS.Tasks.register(id, factory, opts).
  AS.TASK_GAMES = [
    'wires', 'swipe', 'download', 'upload', 'fuel', 'calibrate', 'leaves', 'align',            // tasks-a.js
    'shields', 'simon', 'manifold', 'asteroids', 'divert', 'divert_accept', 'garbage', 'scan',  // tasks-b.js
    'chart', 'steer', 'plants', 'sample',                                                      // tasks-c.js
  ];
  AS.SABOTAGE_GAMES = ['fix_lights', 'fix_comms', 'fix_o2', 'fix_reactor'];                  // sabotage.js

  // Sound effect names (AS.Audio.play(name)). Loops: AS.Audio.loop(name) / AS.Audio.stop(name).
  AS.SFX = [
    'click', 'hover', 'back', 'join', 'leave', 'countdown', 'role_crew', 'role_impostor',
    'kill', 'body_report', 'emergency', 'meeting_start', 'vote', 'vote_reveal', 'eject', 'impostor_reveal',
    'task_step', 'task_complete', 'task_fail', 'wire_connect', 'keypad', 'swipe_ok', 'swipe_bad',
    'shoot', 'explode', 'pour', 'beep', 'switch', 'scan_beep', 'success',
    'vent_in', 'vent_out', 'vent_move', 'sabotage', 'lights_off', 'lights_on', 'door_close', 'door_open',
    'footstep', 'victory', 'defeat', 'error', 'whoosh', 'pop', 'cooldown_ready',
  ];
  AS.SFX_LOOPS = ['alarm', 'scan_loop', 'fuel_loop', 'ambient', 'menu_music'];
})(globalThis.AS = globalThis.AS || {});
