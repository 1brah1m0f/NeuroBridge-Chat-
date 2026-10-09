/* AI IMPOSTOR: SPACE SHIP — map "Kosmik gəmi / Space Ship" (owner: map). Data only + a few build helpers.
 * Layout: 5 columns x 3 rows of rooms joined by 160-wide halls; dropship lobby below the station.
 */
(function (AS) {
  'use strict';

  AS.i18n.add({
    az: {
      'room.messhall': 'Ekipaj salonu', 'room.defense': 'Silah bölməsi', 'room.oxygen': 'Həyat dəstəyi', 'room.bridge': 'Naviqasiya körpüsü',
      'room.shields': 'Qalxan idarəsi', 'room.comms': 'Rabitə mərkəzi', 'room.cargo': 'Yük anbarı', 'room.admin': 'Komanda mərkəzi',
      'room.electrical': 'Enerji otağı', 'room.greenhouse': 'Hidroponika', 'room.engine_a': 'A mühərrik bölməsi',
      'room.engine_b': 'B mühərrik bölməsi', 'room.reactor': 'Reaktor nüvəsi', 'room.security': 'Təhlükəsizlik göyərtəsi',
      'room.medbay': 'Tibb laboratoriyası', 'room.lobby': 'Servis gəmisi', 'room.hallway': 'Dəhliz',
      'task.swipe_card': 'Ekipaj girişini təsdiqlə', 'task.fix_wiring': 'Enerji naqillərini bərpa et', 'task.water_plants': 'Hidroponika bağını sula',
      'task.fuel_engines': 'Mühərrikləri yanacaqla doldur', 'task.download_upload': 'Ulduz xəritələrini ötür',
      'task.divert_power': 'Enerjini yenidən yönləndir', 'task.inspect_sample': 'Gövdə nümunəsini analiz et', 'task.submit_scan': 'İnsan təsdiqi skanı',
      'task.clear_asteroids': 'Asteroidləri məhv et', 'task.start_reactor': 'Reaktoru işə sal',
      'task.prime_shields': 'Qalxanları doldur', 'task.unlock_manifolds': 'Soyuducu kollektorları sıfırla', 'task.chart_course': 'Naviqasiya kursunu çək',
      'task.stabilize_steering': 'İstiqaməti sabitləşdir', 'task.calibrate_distributor': 'Enerji paylayıcısını balanslaşdır',
      'task.clean_filter': 'Oksigen filtrini təmizlə', 'task.empty_garbage': 'Tullantı kapsulunu boşalt', 'task.align_engine': 'Mühərrik gücünü tənzimlə',
      'task.sync_data': 'Rabitə məlumatını sinxronlaşdır', 'task.tune_radar': 'Rabitə antenasını kalibrlə',
      'task.step.fill': 'Yanacaq elementini doldur', 'task.step.upload': 'Məlumatı göndər', 'task.step.accept': 'Yönləndirilən enerjini qəbul et',
    },
    en: {
      'room.messhall': 'Crew Lounge', 'room.defense': 'Weapons Bay', 'room.oxygen': 'Life Support', 'room.bridge': 'Navigation Bridge',
      'room.shields': 'Shield Control', 'room.comms': 'Communications', 'room.cargo': 'Cargo Hold', 'room.admin': 'Command Center',
      'room.electrical': 'Power Room', 'room.greenhouse': 'Hydroponics', 'room.engine_a': 'Engine Bay A',
      'room.engine_b': 'Engine Bay B', 'room.reactor': 'Reactor Core', 'room.security': 'Security Deck',
      'room.medbay': 'Med Lab', 'room.lobby': 'Shuttle', 'room.hallway': 'Corridor',
      'task.swipe_card': 'Authorize Crew Access', 'task.fix_wiring': 'Repair Power Wiring', 'task.water_plants': 'Tend the Hydroponics Garden',
      'task.fuel_engines': 'Refuel the Engines', 'task.download_upload': 'Transfer Star Charts',
      'task.divert_power': 'Reroute Power', 'task.inspect_sample': 'Analyze Hull Sample', 'task.submit_scan': 'Human Verification Scan',
      'task.clear_asteroids': 'Destroy Asteroids', 'task.start_reactor': 'Start the Reactor',
      'task.prime_shields': 'Charge the Shields', 'task.unlock_manifolds': 'Reset Coolant Manifolds', 'task.chart_course': 'Plot Navigation Course',
      'task.stabilize_steering': 'Stabilize Heading', 'task.calibrate_distributor': 'Balance Power Distributor',
      'task.clean_filter': 'Clean the Oxygen Filter', 'task.empty_garbage': 'Empty the Waste Pod', 'task.align_engine': 'Align Engine Output',
      'task.sync_data': 'Sync Comms Data', 'task.tune_radar': 'Tune the Comms Array',
      'task.step.fill': 'Fill the Fuel Cell', 'task.step.upload': 'Upload Data', 'task.step.accept': 'Accept Rerouted Power',
    },
  });

  // ---- grid ----
  const CX = { 1: [200, 560], 2: [960, 500], 3: [1660, 800], 4: [2660, 500], 5: [3360, 500] };
  const RY = { 1: 200, 2: 900, 3: 1600 };
  const RH = 500;
  const HW = 160; // hall width
  const R = (c, r) => [CX[c][0], RY[r], CX[c][1], RH];

  const rooms = [
    { id: 'engine_a', rect: R(1, 1), floor: 'grate', wall: 'orange' },
    { id: 'medbay', rect: R(2, 1), floor: 'white', wall: 'white' },
    { id: 'messhall', rect: R(3, 1), floor: 'steel', wall: 'metal' },
    { id: 'defense', rect: R(4, 1), floor: 'dark', wall: 'dark' },
    { id: 'oxygen', rect: R(5, 1), floor: 'blue', wall: 'blue' },
    { id: 'reactor', rect: R(1, 2), floor: 'reactor', wall: 'dark' },
    { id: 'security', rect: R(2, 2), floor: 'carpet', wall: 'dark' },
    { id: 'admin', rect: R(3, 2), floor: 'wood', wall: 'metal' },
    { id: 'greenhouse', rect: R(4, 2), floor: 'grass', wall: 'green' },
    { id: 'bridge', rect: R(5, 2), floor: 'blue', wall: 'blue' },
    { id: 'engine_b', rect: R(1, 3), floor: 'grate', wall: 'orange' },
    { id: 'electrical', rect: R(2, 3), floor: 'hazard', wall: 'dark' },
    { id: 'cargo', rect: R(3, 3), floor: 'concrete', wall: 'metal' },
    { id: 'shields', rect: R(4, 3), floor: 'steel', wall: 'blue' },
    { id: 'comms', rect: R(5, 3), floor: 'dark', wall: 'metal' },
    { id: 'lobby', rect: [1660, 2400, 800, 400], floor: 'dropship', wall: 'metal', lobby: true },
  ];
  rooms.forEach((r) => (r.nameKey = 'room.' + r.id));
  const byId = {};
  rooms.forEach((r) => (byId[r.id] = r));

  // ---- halls + doors (doors keyed by the room they close) ----
  const halls = [], doors = [];
  const DOOR_ROOMS = { medbay: 1, security: 1, electrical: 1, cargo: 1, engine_a: 1, engine_b: 1, messhall: 1 };
  function hallH(a, b) { // a left of b
    const A = byId[a].rect, B = byId[b].rect, yc = A[1] + RH / 2, x0 = A[0] + A[2], x1 = B[0];
    halls.push({ rect: [x0 - 10, yc - HW / 2, x1 - x0 + 20, HW], floor: 'hall' });
    if (DOOR_ROOMS[a]) doors.push({ id: 'door_' + a + '_e', room: a, rect: [x0, yc - HW / 2, 20, HW], orient: 'v' });
    if (DOOR_ROOMS[b]) doors.push({ id: 'door_' + b + '_w', room: b, rect: [x1 - 20, yc - HW / 2, 20, HW], orient: 'v' });
  }
  function hallV(a, b) { // a above b
    const A = byId[a].rect, B = byId[b].rect, xc = A[0] + A[2] / 2, y0 = A[1] + RH, y1 = B[1];
    halls.push({ rect: [xc - HW / 2, y0 - 10, HW, y1 - y0 + 20], floor: 'hall' });
    if (DOOR_ROOMS[a]) doors.push({ id: 'door_' + a + '_s', room: a, rect: [xc - HW / 2, y0, HW, 20], orient: 'h' });
    if (DOOR_ROOMS[b]) doors.push({ id: 'door_' + b + '_n', room: b, rect: [xc - HW / 2, y1 - 20, HW, 20], orient: 'h' });
  }
  [['engine_a', 'medbay'], ['medbay', 'messhall'], ['messhall', 'defense'], ['defense', 'oxygen'],
    ['reactor', 'security'], ['greenhouse', 'bridge'],
    ['engine_b', 'electrical'], ['electrical', 'cargo'], ['cargo', 'shields'], ['shields', 'comms']].forEach((p) => hallH(p[0], p[1]));
  [['engine_a', 'reactor'], ['reactor', 'engine_b'], ['messhall', 'admin'], ['admin', 'cargo'],
    ['oxygen', 'bridge'], ['bridge', 'comms'], ['defense', 'greenhouse']].forEach((p) => hallV(p[0], p[1]));

  // ---- props ----
  const P = (type, x, y, o) => Object.assign({ type, x, y, block: false }, o || {});
  const B = (type, x, y, o) => P(type, x, y, Object.assign({ block: true }, o));
  const W = (type, x, y, o) => P(type, x, y, Object.assign({ wall: true }, o));
  const F = (type, x, y, o) => P(type, x, y, Object.assign({ floor: true }, o));
  const props = [
    // mess hall
    B('table_round', 2060, 450, { r: 80, button: true }), B('table_round', 1790, 600, { r: 60 }), B('table_round', 2330, 600, { r: 60 }),
    W('window', 2060, 200, { w: 300, h: 60 }), W('garbage_chute', 2380, 200, { w: 100, h: 60 }), W('wire_panel', 1740, 200, { w: 60, h: 40 }),
    F('rug', 2060, 450, { w: 520, h: 360 }),
    // upper engine
    B('engine', 470, 430, { w: 220, h: 180 }), W('dial_panel', 300, 200, { w: 70, h: 50 }), W('pipes', 620, 200, { w: 200, h: 70 }),
    // reactor
    B('reactor_core', 480, 1150, { r: 110 }), W('handprint', 280, 900, { w: 60, h: 50 }), W('handprint', 680, 900, { w: 60, h: 50 }),
    W('keypad', 480, 900, { w: 50, h: 50 }), B('console', 300, 1340, { w: 120, h: 50, style: 'reactor' }), F('hazard_floor', 480, 1150, { w: 300, h: 300 }),
    // lower engine
    B('engine', 470, 1830, { w: 220, h: 180 }), W('dial_panel', 300, 1600, { w: 70, h: 50 }), W('pipes', 620, 1600, { w: 200, h: 70 }),
    // security
    W('monitor_wall', 1210, 900, { w: 260, h: 60 }), B('console', 1210, 1000, { w: 120, h: 50, style: 'security' }),
    W('wire_panel', 1400, 900, { w: 60, h: 40 }), B('locker', 1000, 1370, { w: 60, h: 30 }), B('server_rack', 1420, 1370, { w: 70, h: 40 }),
    // medbay
    B('bed', 1060, 280, { w: 150, h: 70 }), B('sample_station', 1300, 260, { w: 130, h: 60 }), F('scanner_pad', 1110, 560, { r: 55 }),
    // electrical
    W('electrical_box', 1050, 1600, { w: 80, h: 60 }), W('wire_panel', 1200, 1600, { w: 60, h: 40 }), W('dial_panel', 1360, 1600, { w: 70, h: 50 }),
    B('console', 1210, 2060, { w: 120, h: 50, style: 'electrical' }), P('laptop', 1040, 1900, { w: 60, h: 40 }),
    // admin
    B('admin_table', 2060, 1150, { w: 240, h: 140 }), W('keypad', 1800, 900, { w: 50, h: 50 }), W('wire_panel', 1950, 900, { w: 60, h: 40 }),
    W('keypad', 2200, 900, { w: 50, h: 50 }), B('console', 2330, 960, { w: 120, h: 50, style: 'admin' }),
    B('chair', 1840, 1300, { w: 40, h: 40 }), B('chair', 2280, 1300, { w: 40, h: 40 }),
    // cargo
    B('crate_stack', 1800, 1760, { w: 110, h: 90 }), B('crate', 1760, 2010, { w: 70, h: 70 }), B('boxes', 2340, 1720, { w: 60, h: 50 }),
    B('barrel', 2390, 2040, { r: 28 }), B('fuel_tank', 2200, 2020, { w: 80, h: 90 }), W('wire_panel', 1950, 1600, { w: 60, h: 40 }),
    // greenhouse
    B('plant_bed', 2910, 1180, { w: 240, h: 80 }), B('tree', 2740, 990, { r: 45 }), B('tree', 3080, 990, { r: 45 }), B('tree', 3090, 1330, { r: 45 }),
    // defense
    B('turret_seat', 2910, 400, { w: 120, h: 120 }), B('console', 3080, 260, { w: 120, h: 50, style: 'weapons' }),
    W('light_panel', 2760, 200, { w: 90, h: 60 }), W('window', 2910, 200, { w: 200, h: 60 }),
    // oxygen
    B('o2_tank', 3460, 330, { r: 30 }), B('o2_tank', 3540, 330, { r: 30 }), W('keypad', 3700, 200, { w: 50, h: 50 }),
    W('garbage_chute', 3480, 200, { w: 100, h: 60 }), W('light_panel', 3800, 200, { w: 90, h: 60 }),
    B('console', 3610, 600, { w: 120, h: 50, style: 'o2' }),
    // bridge
    B('console', 3780, 1000, { w: 120, h: 50, style: 'nav' }), B('console', 3780, 1300, { w: 120, h: 50, style: 'nav' }),
    B('pilot_seat', 3810, 1150, { w: 60, h: 60 }), P('laptop', 3450, 990, { w: 60, h: 40 }), W('wire_panel', 3450, 900, { w: 60, h: 40 }),
    W('window', 3700, 900, { w: 240, h: 60 }),
    // shields
    B('shield_emitter', 2910, 1850, { r: 70 }), B('console', 2910, 2060, { w: 120, h: 50, style: 'shields' }), W('light_panel', 2760, 1600, { w: 90, h: 60 }),
    // comms
    B('console', 3420, 1680, { w: 120, h: 50, style: 'comms' }), B('server_rack', 3800, 1700, { w: 70, h: 40 }), B('server_rack', 3800, 1780, { w: 70, h: 40 }),
    B('radar_dish', 3700, 1990, { r: 60 }), P('laptop', 3450, 2010, { w: 60, h: 40 }), W('light_panel', 3620, 1600, { w: 90, h: 60 }),
    // lobby (dropship)
    B('dropship_seat', 1740, 2480, { w: 60, h: 60 }), B('dropship_seat', 1820, 2480, { w: 60, h: 60 }), B('dropship_seat', 2300, 2480, { w: 60, h: 60 }),
    B('dropship_seat', 2380, 2480, { w: 60, h: 60 }), B('crate', 1720, 2740, { w: 70, h: 70 }), B('crate_stack', 2400, 2740, { w: 110, h: 90 }),
    W('window', 2060, 2400, { w: 300, h: 60 }),
  ];
  props.forEach((p) => { if (!p.room) for (const r of rooms) if (AS.util.pointInRect(p.x, p.y, r.rect)) { p.room = r.id; break; } });

  // ---- stations ----
  const S = (id, x, y, room) => ({ id, x, y, room });
  const stations = [
    S('st_admin_swipe', 1800, 950, 'admin'), S('st_admin_upload', 2330, 1030, 'admin'), S('st_wires_admin', 1950, 950, 'admin'),
    S('st_wires_elec', 1200, 1650, 'electrical'), S('st_elec_divert', 1360, 1650, 'electrical'), S('st_elec_calib', 1210, 1990, 'electrical'),
    S('st_dl_elec', 1040, 1900, 'electrical'),
    S('st_wires_cargo', 1950, 1650, 'cargo'), S('st_cargo_fuel', 2200, 1930, 'cargo'),
    S('st_wires_sec', 1400, 950, 'security'), S('st_wires_mess', 1740, 250, 'messhall'), S('st_mess_garbage', 2380, 250, 'messhall'),
    S('st_wires_nav', 3450, 950, 'bridge'), S('st_dl_nav', 3450, 1050, 'bridge'), S('st_nav_chart', 3780, 1070, 'bridge'), S('st_nav_steer', 3780, 1240, 'bridge'),
    S('st_green_plants', 2910, 1260, 'greenhouse'),
    S('st_engine_a', 610, 570, 'engine_a'), S('st_engine_a_align', 300, 250, 'engine_a'),
    S('st_engine_b', 610, 1970, 'engine_b'), S('st_engine_b_align', 300, 1650, 'engine_b'),
    S('st_reactor_simon', 300, 1270, 'reactor'), S('st_reactor_manifold', 480, 950, 'reactor'),
    S('st_medbay_sample', 1300, 330, 'medbay'), S('st_medbay_scan', 1110, 560, 'medbay'),
    S('st_defense_turret', 2910, 500, 'defense'), S('st_dl_defense', 3080, 330, 'defense'), S('st_acc_defense', 2760, 250, 'defense'),
    S('st_o2_filter', 3610, 530, 'oxygen'), S('st_o2_garbage', 3480, 250, 'oxygen'), S('st_acc_o2', 3800, 250, 'oxygen'),
    S('st_shields', 2910, 1990, 'shields'), S('st_acc_shields', 2760, 1650, 'shields'),
    S('st_comms_radar', 3570, 1990, 'comms'), S('st_dl_comms', 3450, 1940, 'comms'), S('st_acc_comms', 3620, 1650, 'comms'),
  ];

  const T1 = (id, kind, steps, o) => Object.assign({ id, nameKey: 'task.' + id, kind, steps }, o || {});
  const st = (s, game, nameKey) => (nameKey ? { st: s, game, nameKey } : { st: s, game });
  const taskDefs = [
    T1('swipe_card', 'common', [st('st_admin_swipe', 'swipe')]),
    T1('fix_wiring', 'common', [st('st_wires_elec', 'wires'), st(['st_wires_cargo', 'st_wires_admin', 'st_wires_nav'], 'wires'), st(['st_wires_sec', 'st_wires_mess'], 'wires')]),
    T1('water_plants', 'common', [st('st_green_plants', 'plants')]),
    T1('fuel_engines', 'long', [st('st_cargo_fuel', 'fuel', 'task.step.fill'), st('st_engine_a', 'fuel'), st('st_cargo_fuel', 'fuel', 'task.step.fill'), st('st_engine_b', 'fuel')]),
    T1('download_upload', 'long', [st(['st_dl_elec', 'st_dl_nav', 'st_dl_defense', 'st_dl_comms'], 'download'), st('st_admin_upload', 'upload', 'task.step.upload')]),
    T1('divert_power', 'long', [st('st_elec_divert', 'divert'), st(['st_acc_defense', 'st_acc_o2', 'st_acc_shields', 'st_acc_comms'], 'divert_accept', 'task.step.accept')]),
    T1('inspect_sample', 'long', [st('st_medbay_sample', 'sample')]),
    T1('submit_scan', 'long', [st('st_medbay_scan', 'scan')], { visual: true }),
    T1('clear_asteroids', 'long', [st('st_defense_turret', 'asteroids')]),
    T1('start_reactor', 'long', [st('st_reactor_simon', 'simon')]),
    T1('prime_shields', 'short', [st('st_shields', 'shields')]),
    T1('unlock_manifolds', 'short', [st('st_reactor_manifold', 'manifold')]),
    T1('chart_course', 'short', [st('st_nav_chart', 'chart')]),
    T1('stabilize_steering', 'short', [st('st_nav_steer', 'steer')]),
    T1('calibrate_distributor', 'short', [st('st_elec_calib', 'calibrate')]),
    T1('clean_filter', 'short', [st('st_o2_filter', 'leaves')]),
    T1('empty_garbage', 'short', [st(['st_mess_garbage', 'st_o2_garbage'], 'garbage')]),
    T1('align_engine', 'short', [st('st_engine_a_align', 'align'), st('st_engine_b_align', 'align')]),
    T1('sync_data', 'short', [st('st_dl_comms', 'download')]),
    T1('tune_radar', 'short', [st('st_comms_radar', 'calibrate')]),
  ];

  const V = (id, x, y, room, links) => ({ id, x, y, room, links });
  const vents = [
    V('v_engine_a', 680, 640, 'engine_a', ['v_reactor', 'v_engine_b']), V('v_reactor', 690, 1330, 'reactor', ['v_engine_a', 'v_engine_b']),
    V('v_engine_b', 680, 1680, 'engine_b', ['v_engine_a', 'v_reactor']),
    V('v_medbay', 1400, 640, 'medbay', ['v_security', 'v_elec']), V('v_security', 1340, 1330, 'security', ['v_medbay', 'v_elec']),
    V('v_elec', 1400, 2030, 'electrical', ['v_medbay', 'v_security']),
    V('v_mess', 1720, 280, 'messhall', ['v_admin', 'v_green']), V('v_admin', 1740, 1330, 'admin', ['v_mess', 'v_green']),
    V('v_green', 2740, 1330, 'greenhouse', ['v_mess', 'v_admin']),
    V('v_defense', 3100, 640, 'defense', ['v_o2', 'v_bridge']), V('v_o2', 3420, 640, 'oxygen', ['v_defense', 'v_bridge']),
    V('v_bridge', 3450, 1330, 'bridge', ['v_defense', 'v_o2']),
    V('v_cargo', 2320, 1880, 'cargo', ['v_shields', 'v_comms']), V('v_shields', 3080, 1680, 'shields', ['v_cargo', 'v_comms']),
    V('v_comms', 3800, 2040, 'comms', ['v_cargo', 'v_shields']),
  ];

  const panels = [
    { id: 'p_lights', kind: 'lights', x: 1050, y: 1650, room: 'electrical', game: 'fix_lights' },
    { id: 'p_comms', kind: 'comms', x: 3420, y: 1740, room: 'comms', game: 'fix_comms' },
    { id: 'p_o2_oxygen', kind: 'o2', x: 3700, y: 250, room: 'oxygen', game: 'fix_o2' },
    { id: 'p_o2_admin', kind: 'o2', x: 2200, y: 950, room: 'admin', game: 'fix_o2' },
    { id: 'p_reactor_l', kind: 'reactor', x: 280, y: 950, room: 'reactor', game: 'fix_reactor' },
    { id: 'p_reactor_r', kind: 'reactor', x: 680, y: 950, room: 'reactor', game: 'fix_reactor' },
  ];

  const meeting = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
    meeting.push([Math.round(2060 + Math.cos(a) * 175), Math.round(450 + Math.sin(a) * 160)]);
  }
  const lobbySp = [];
  for (let i = 0; i < 12; i++) lobbySp.push([1820 + (i % 6) * 96, 2590 + Math.floor(i / 6) * 90]);

  AS.MAPS = AS.MAPS || {};
  AS.MAPS.starship = {
    id: 'starship', nameKey: 'map.starship', width: 4060, height: 3000,
    rooms, halls, props, stations, taskDefs, vents, panels, doors,
    button: { x: 2060, y: 450 },
    cameras: [
      { id: 'cam_w', x: 860, y: 450, nameKey: 'room.hallway' }, { id: 'cam_mess', x: 2060, y: 800, nameKey: 'room.hallway' },
      { id: 'cam_e', x: 2560, y: 450, nameKey: 'room.hallway' }, { id: 'cam_s', x: 2560, y: 1850, nameKey: 'room.hallway' },
    ],
    consoles: [
      { id: 'c_admin', kind: 'admin', x: 2060, y: 1150, room: 'admin' },
      { id: 'c_cams', kind: 'cams', x: 1210, y: 1000, room: 'security' },
    ],
    spawns: { meeting, lobby: lobbySp },
  };
})(globalThis.AS = globalThis.AS || {});
