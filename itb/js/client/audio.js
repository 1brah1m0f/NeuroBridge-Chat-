/* AI IMPOSTOR: SPACE SHIP — tiny WebAudio synth (owner: audio). Safe no-ops before unlock / without WebAudio. */
(function (AS) {
  'use strict';
  if (AS.isNode) return;
  let ctx = null, master = null, sfxG = null, musG = null;
  const vol = { master: 0.8, sfx: 0.9, music: 0.5 };
  const loops = {};
  let musicName = null, musicTimer = 0;

  // recipe: [freqStart, freqEnd, duration, type, gain, delay]
  const R = {
    click: [[700, 900, 0.05, 'square', 0.15]], hover: [[900, 900, 0.03, 'sine', 0.06]], back: [[500, 300, 0.08, 'square', 0.12]],
    join: [[500, 800, 0.12, 'sine', 0.2]], leave: [[600, 300, 0.15, 'sine', 0.2]], countdown: [[880, 880, 0.12, 'square', 0.18]],
    role_crew: [[330, 330, 0.3, 'triangle', 0.3], [440, 440, 0.3, 'triangle', 0.3, 0.25], [660, 660, 0.6, 'triangle', 0.3, 0.5]],
    role_impostor: [[220, 110, 0.9, 'sawtooth', 0.3], [233, 116, 0.9, 'sawtooth', 0.2]],
    kill: [['n', 0, 0.25, 'noise', 0.5], [300, 60, 0.3, 'sawtooth', 0.35]],
    body_report: [[880, 440, 0.2, 'square', 0.25], [880, 440, 0.2, 'square', 0.25, 0.25], [880, 440, 0.3, 'square', 0.25, 0.5]],
    emergency: [[600, 900, 0.25, 'square', 0.25], [600, 900, 0.25, 'square', 0.25, 0.3], [600, 900, 0.25, 'square', 0.25, 0.6]],
    meeting_start: [[440, 660, 0.3, 'triangle', 0.25]], vote: [[600, 1000, 0.08, 'square', 0.18]], vote_reveal: [[400, 600, 0.1, 'triangle', 0.2]],
    eject: [[400, 80, 1.2, 'sine', 0.3], ['n', 0, 0.8, 'noise', 0.15]], impostor_reveal: [[150, 100, 0.8, 'sawtooth', 0.3]],
    task_step: [[660, 990, 0.1, 'sine', 0.2]], task_complete: [[523, 523, 0.1, 'triangle', 0.25], [659, 659, 0.1, 'triangle', 0.25, 0.1], [784, 784, 0.25, 'triangle', 0.25, 0.2]],
    task_fail: [[300, 200, 0.2, 'square', 0.2]], wire_connect: [[800, 1200, 0.07, 'square', 0.15]], keypad: [[1000, 1000, 0.05, 'square', 0.12]],
    swipe_ok: [[700, 1100, 0.15, 'sine', 0.2]], swipe_bad: [[200, 150, 0.25, 'square', 0.2]], shoot: [[1200, 200, 0.1, 'square', 0.15]],
    explode: [['n', 0, 0.3, 'noise', 0.3]], pour: [['n', 0, 0.3, 'noise', 0.08]], beep: [[1000, 1000, 0.08, 'sine', 0.15]],
    switch: [[400, 300, 0.04, 'square', 0.15]], scan_beep: [[1200, 1200, 0.06, 'sine', 0.15]], success: [[660, 1320, 0.3, 'triangle', 0.25]],
    vent_in: [[300, 120, 0.2, 'square', 0.2], ['n', 0, 0.15, 'noise', 0.15]], vent_out: [[120, 300, 0.2, 'square', 0.2]], vent_move: [[200, 260, 0.1, 'square', 0.12]],
    sabotage: [[300, 200, 0.4, 'sawtooth', 0.25]], lights_off: [[400, 100, 0.4, 'sawtooth', 0.2]], lights_on: [[100, 500, 0.3, 'sine', 0.2]],
    door_close: [['n', 0, 0.2, 'noise', 0.25], [120, 80, 0.2, 'square', 0.2]], door_open: [[80, 160, 0.2, 'square', 0.15]],
    footstep: [['n', 0, 0.03, 'noise', 0.05]], victory: [[523, 523, 0.2, 'triangle', 0.3], [659, 659, 0.2, 'triangle', 0.3, 0.2], [784, 784, 0.2, 'triangle', 0.3, 0.4], [1047, 1047, 0.6, 'triangle', 0.3, 0.6]],
    defeat: [[392, 392, 0.3, 'triangle', 0.3], [330, 330, 0.3, 'triangle', 0.3, 0.3], [262, 200, 0.8, 'triangle', 0.3, 0.6]],
    error: [[200, 160, 0.15, 'square', 0.2]], whoosh: [['n', 0, 0.4, 'noise', 0.15]], pop: [[600, 1200, 0.06, 'sine', 0.2]],
    cooldown_ready: [[880, 1320, 0.12, 'sine', 0.15]], chat: [[1100, 1400, 0.05, 'sine', 0.12]],
  };
  let noiseBuf = null;
  function init() {}
  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      ctx = new AC();
      master = ctx.createGain(); master.connect(ctx.destination);
      sfxG = ctx.createGain(); sfxG.connect(master);
      musG = ctx.createGain(); musG.connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      apply();
      if (musicName) { const m = musicName; musicName = null; music(m); }
    } catch (e) { ctx = null; }
  }
  function apply() { if (!ctx) return; master.gain.value = vol.master; sfxG.gain.value = vol.sfx; musG.gain.value = vol.music * 0.35; }
  function tone(spec, out, gainMul, rate) {
    const [f0, f1, d, type, gv, delay] = spec;
    const t0 = ctx.currentTime + (delay || 0);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(Math.max(0.001, gv * gainMul), t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    g.connect(out);
    let src;
    if (type === 'noise') { src = ctx.createBufferSource(); src.buffer = noiseBuf; }
    else { src = ctx.createOscillator(); src.type = type; src.frequency.setValueAtTime(f0 * rate, t0); src.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * rate), t0 + d); }
    src.connect(g); src.start(t0); src.stop(t0 + d + 0.05);
  }
  function play(name, o) {
    if (!ctx || ctx.state !== 'running') return;
    const r = R[name]; if (!r) return;
    o = o || {};
    try { for (const s of r) tone(s, sfxG, o.volume == null ? 1 : o.volume, o.rate || 1); } catch (e) { /* ignore */ }
  }
  // loops: re-trigger a short pattern on an interval
  const LOOPS = { alarm: ['emergency', 1.2], scan_loop: ['scan_beep', 0.5], fuel_loop: ['pour', 0.3] };
  function loop(name) {
    if (loops[name]) return;
    if (name === 'ambient' || name === 'menu_music') { music(name); return; }
    const L = LOOPS[name]; if (!L) return;
    play(L[0]); loops[name] = setInterval(() => play(L[0], { volume: 0.7 }), L[1] * 1000);
  }
  function stop(name) { if (loops[name]) { clearInterval(loops[name]); delete loops[name]; } if (name === musicName) music(null); }
  // music: slow arpeggio pads
  const SONGS = { menu_music: [[220, 277, 330, 415], [196, 247, 294, 370], [175, 220, 262, 330], [196, 247, 294, 392]], ambient: [[110, 165], [104, 156], [98, 147], [104, 156]] };
  function music(name) {
    if (musicName === name) return;
    musicName = name;
    clearInterval(musicTimer); musicTimer = 0;
    if (!name || !ctx || !SONGS[name]) return;
    let bar = 0;
    const step = () => {
      const ch = SONGS[name][bar++ % SONGS[name].length];
      ch.forEach((f, i) => tone([f, f, name === 'ambient' ? 3.8 : 1.9, 'sine', 0.18, (name === 'ambient' ? 0 : i * 0.22)], musG, 1, 1));
    };
    step(); musicTimer = setInterval(step, name === 'ambient' ? 4000 : 2000);
  }
  function setVolumes(v) { Object.assign(vol, v || {}); apply(); }
  AS.Audio = { init, unlock, play, loop, stop, music, setVolumes };
})(globalThis.AS = globalThis.AS || {});
