/* =========================================================
   Sound — synthesised with WebAudio, no audio files.

   Everything is rendered ahead of time with OfflineAudioContext, then played back as plain buffers:
   - effects: a small bank of pre-rendered variations, played through a voice manager
     (per-sound voice limits, oldest voice fades out), so heavy gunfire never floods the audio thread;
   - music: both soundtracks are rendered once (in short chunks, between frames) into looping buffers,
     so nothing on the main thread can make them stutter.
   The master chain ends in a glue compressor and a limiter, so stacked sounds never clip.

   Two background soundtracks, picked from the nav (remembered):
   - "Carol of the Skies": a driving violin arrangement of "Shchedryk" (Carol of the Bells), G minor, 3/4 at
     170 BPM, strings and bells only (no drums, no bass);
   - "Dogfight": the mini-game's electronic track (A minor, 125 BPM, light drums), also on offer as the soundtrack.
   While music plays, gunfire locks to the song's 16ths and rings a plucked note from the current chord,
   so a burst plays along with the tune.

   Browsers only allow audio after a click, tap or key press, so sound starts on the first interaction.
   The nav "Sound" button opens a small menu with separate Music and Effects switches (remembered).
   ========================================================= */
(() => {
  const AC = window.AudioContext || window.webkitAudioContext;
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const btn = document.querySelector('.sound-toggle');
  const KEY = 'hl-audio';
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const hz = n => 440 * Math.pow(2, (n - 69) / 12);
  const VOLUME = .8;
  const MUSIC_RATE = 32000;          // render rate for the soundtracks (keeps the buffers small)

  const prefs = { music: true, fx: true, track: 'winter' };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved) Object.assign(prefs, saved);
    else if (localStorage.getItem('hl-sound') === 'off') prefs.music = prefs.fx = false;
  } catch (e) { /* storage blocked */ }

  let ctx = null, master = null, fxBus = null, musicBus = null, musicDuck = null, engine = null, bg = null, output = null, limiterNode = null;
  const anyOn = () => prefs.music || prefs.fx;
  function paintButton() {
    if (!btn) return;
    btn.classList.toggle('is-on', anyOn());
    btn.title = anyOn() ? 'Sound settings' : 'Sound is off';
  }
  if (!AC || !OAC) { if (btn) btn.hidden = true; return; }
  paintButton();

  // ---------- Shared buffers ----------
  const newBuffer = (channels, length, rate) => {
    try { return new AudioBuffer({ numberOfChannels: channels, length, sampleRate: rate }); }
    catch (e) { return (ctx || new OAC(1, 1, rate)).createBuffer(channels, length, rate); }
  };
  let noise = null;
  function noiseBuffer() {
    if (noise) return noise;
    noise = newBuffer(1, MUSIC_RATE * 2, MUSIC_RATE);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noise;
  }
  const impulses = new Map();
  function impulse(rate, seconds = 2.6) {
    const k = `${rate}:${seconds}`;
    if (impulses.has(k)) return impulses.get(k);
    const len = Math.floor(rate * seconds);
    const ir = newBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        lp += ((Math.random() * 2 - 1) - lp) * (.35 + .6 * (1 - i / len));     // darker as it decays
        d[i] = lp * Math.pow(1 - i / len, 2.6) * (i < rate * .012 ? i / (rate * .012) : 1);
      }
    }
    impulses.set(k, ir);
    return ir;
  }
  const curves = new Map();
  function driveCurve(k) {
    if (curves.has(k)) return curves.get(k);
    const n = 2048, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; c[i] = (1 + k) * x / (1 + k * Math.abs(x)); }
    curves.set(k, c);
    return c;
  }
  const renderDone = oc => new Promise(res => {
    const p = oc.startRendering();
    if (p && p.then) p.then(res); else oc.oncomplete = e => res(e.renderedBuffer);
  });
  // All offline renders run one after another
  let queue = Promise.resolve();
  const enqueue = job => (queue = queue.then(job, job));

  // ---------- Synth primitives (work in any context) ----------
  let C = null;                       // context being scheduled into
  const envelope = (g, t, attack, peak, decay) => {
    g.gain.setValueAtTime(.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(.0001, t + attack + decay);
  };
  const connect = (node, dests) => [].concat(dests).forEach(d => d && node.connect(d));
  function hiss({ t, dest, type = 'bandpass', f = 1000, f2 = 0, q = 1, attack = .002, peak = .5, decay = .1, rate = 1 }) {
    const s = C.createBufferSource();
    s.buffer = noiseBuffer();
    s.playbackRate.value = rate * rnd(.9, 1.1);
    const flt = C.createBiquadFilter();
    flt.type = type;
    flt.Q.value = q;
    flt.frequency.setValueAtTime(f, t);
    if (f2) flt.frequency.exponentialRampToValueAtTime(f2, t + attack + decay);
    const g = C.createGain();
    envelope(g, t, attack, peak, decay);
    s.connect(flt); flt.connect(g); connect(g, dest);
    s.start(t, Math.random() * 1.5);
    s.stop(t + attack + decay + .05);
    return g;
  }
  function tone({ t, dest, type = 'sine', f = 200, f2 = 0, attack = .002, peak = .5, decay = .2, detune = 0 }) {
    const o = C.createOscillator();
    o.type = type;
    o.detune.value = detune;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + attack + decay);
    const g = C.createGain();
    envelope(g, t, attack, peak, decay);
    o.connect(g); connect(g, dest);
    o.start(t);
    o.stop(t + attack + decay + .05);
    return g;
  }
  const lowpass = (f, dest, q = .7) => {
    const l = C.createBiquadFilter();
    l.type = 'lowpass';
    l.frequency.value = f;
    l.Q.value = q;
    l.connect(dest);
    return l;
  };
  const panner = (pan, dest) => {
    const p = C.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    connect(p, dest);
    return p;
  };

  // =========================================================
  // Effects bank
  // =========================================================
  const FX = {
    gun: { n: 4, dur: .3, make(d, v) {
      const t = .004;
      hiss({ t, dest: d, f: rnd(1700, 2500), q: .9, attack: .001, peak: .75 * v, decay: rnd(.04, .06) });
      tone({ t, dest: d, f: rnd(150, 190), f2: 46, attack: .001, peak: .85 * v, decay: .1 });
      tone({ t, dest: d, type: 'triangle', f: 92, f2: 40, attack: .001, peak: .3 * v, decay: .14 });
      hiss({ t, dest: d, type: 'highpass', f: 4200, attack: .0005, peak: .22 * v, decay: .018 });
      hiss({ t: t + rnd(.03, .045), dest: d, f: 3100, q: 5, peak: .07 * v, decay: .014 });
      hiss({ t: t + .01, dest: d, type: 'lowpass', f: 900, f2: 300, peak: .14 * v, decay: .22 });
    } },
    gunFar: { n: 2, dur: .35, make(d, v) {
      const l = lowpass(1400, d);
      hiss({ t: .004, dest: l, f: 1300, q: .8, peak: .5 * v, decay: .07 });
      tone({ t: .004, dest: l, f: 140, f2: 45, peak: .5 * v, decay: .1 });
      hiss({ t: .02, dest: l, type: 'lowpass', f: 700, f2: 200, peak: .12 * v, decay: .28 });
    } },
    tink: { n: 3, dur: .16, make(d, v) {
      const f = rnd(3600, 6200);
      tone({ t: .002, dest: d, f, peak: .09 * v, decay: .06 });
      tone({ t: .002, dest: d, f: f * 1.51, peak: .04 * v, decay: .045 });
      tone({ t: .05, dest: d, f: f * .98, peak: .03 * v, decay: .04 });
    } },
    rocket: { n: 2, dur: 1.2, make(d, v) {
      tone({ t: .004, dest: d, f: 110, f2: 50, peak: .4 * v, decay: .12 });
      hiss({ t: .04, dest: d, f: 380, f2: 2600, q: 1.2, attack: .05, peak: .34 * v, decay: .9 });
      hiss({ t: .04, dest: d, type: 'lowpass', f: 500, attack: .03, peak: .18 * v, decay: .8 });
    } },
    rocketSoft: { n: 1, dur: 1.2, make(d, v) { FX.rocket.make(lowpass(1800, d), v * .9); } },
    boom: { n: 3, dur: 2.4, make(d, v, air) {
      tone({ t: .004, dest: d, f: air ? 95 : 72, f2: 26, attack: .002, peak: .95 * v, decay: air ? .8 : 1.15 });
      tone({ t: .004, dest: d, type: 'triangle', f: 48, f2: 22, attack: .01, peak: .4 * v, decay: 1.2 });
      hiss({ t: .004, dest: d, type: 'lowpass', f: 1600, f2: 110, q: .5, peak: .9 * v, decay: air ? 1.1 : 1.7 });
      hiss({ t: .004, dest: d, f: 2600, q: .7, peak: .35 * v, decay: .08 });
      for (let i = 0; i < 8; i++) hiss({ t: rnd(.05, .8), dest: d, f: rnd(1800, 4200), q: 2, peak: rnd(.05, .13) * v, decay: .025 });
    } },
    boomAir: { n: 2, dur: 1.8, make(d, v) { FX.boom.make(d, v, true); } },
    boomFar: { n: 2, dur: 2.4, make(d, v) { FX.boom.make(lowpass(900, d), v); } },
    crash: { n: 1, dur: .7, make(d, v) {
      const l = lowpass(2400, d);
      hiss({ t: .004, dest: l, f: 700, q: 4, peak: .45 * v, decay: .32 });
      tone({ t: .004, dest: l, type: 'square', f: 140, f2: 38, peak: .16 * v, decay: .36 });
      for (let i = 0; i < 5; i++) tone({ t: rnd(.02, .3), dest: l, type: 'triangle', f: rnd(900, 2400), peak: .04 * v, decay: .05 });
    } },
    // Bullet punching through a card: thud, crack and a little debris
    impact: { n: 4, dur: .34, make(d, v) {
      tone({ t: .003, dest: d, f: rnd(260, 360), f2: 90, attack: .001, peak: .32 * v, decay: .07 });
      hiss({ t: .003, dest: d, f: rnd(900, 1400), q: 1.6, attack: .001, peak: .38 * v, decay: .05 });
      hiss({ t: .012, dest: d, type: 'highpass', f: 2600, peak: .16 * v, decay: .09 });
      for (let i = 0; i < 3; i++) hiss({ t: rnd(.05, .2), dest: d, f: rnd(2500, 5000), q: 3, peak: rnd(.03, .07) * v, decay: .012 });
    } },
    // Bullet cracking a headline letter: stone-like chip with a ricochet whine
    letter: { n: 3, dur: .5, make(d, v) {
      hiss({ t: .003, dest: d, f: rnd(1800, 2600), q: 2.5, attack: .001, peak: .42 * v, decay: .04 });
      tone({ t: .003, dest: d, type: 'triangle', f: rnd(700, 900), f2: 300, peak: .18 * v, decay: .05 });
      tone({ t: .02, dest: d, f: rnd(2400, 3400), f2: rnd(900, 1300), attack: .005, peak: .05 * v, decay: .3 });
      for (let i = 0; i < 4; i++) hiss({ t: rnd(.04, .22), dest: d, f: rnd(3000, 6000), q: 4, peak: rnd(.03, .06) * v, decay: .01 });
    } },
    ping: { n: 2, dur: .3, make(d, v) {
      tone({ t: .002, dest: d, f: rnd(2200, 3200), f2: rnd(700, 1000), peak: .1 * v, decay: .2 });
      hiss({ t: .002, dest: d, f: 2600, q: 3, peak: .13 * v, decay: .03 });
    } },
    beep: { n: 1, dur: .2, make(d) {
      tone({ t: .003, dest: d, type: 'square', f: 880, peak: .08, decay: .12 });
      tone({ t: .003, dest: d, f: 440, peak: .12, decay: .12 });
    } },
    beepGo: { n: 1, dur: .45, make(d) {
      tone({ t: .003, dest: d, type: 'square', f: 1320, peak: .08, decay: .35 });
      tone({ t: .003, dest: d, f: 660, peak: .12, decay: .35 });
    } },
    // A section locking into place: two sharp detent clicks and a low mechanical thunk
    gear: { n: 3, dur: .4, make(d) {
      const t = .003, t2 = t + rnd(.05, .065);
      hiss({ t, dest: d, f: rnd(3100, 3600), q: 7, attack: .0005, peak: .5, decay: .012 });
      tone({ t, dest: d, type: 'square', f: 2200, peak: .05, decay: .008 });
      hiss({ t: t2, dest: d, f: rnd(2300, 2700), q: 6, attack: .0005, peak: .6, decay: .016 });
      tone({ t: t2, dest: d, type: 'triangle', f: 190, f2: 70, peak: .5, decay: .09 });
      tone({ t: t2 + .004, dest: d, f: 2750, peak: .035, decay: .16 });
      hiss({ t: t2, dest: d, type: 'lowpass', f: 650, peak: .22, decay: .06 });
    } },
    click: { n: 2, dur: .06, make(d) {
      hiss({ t: .002, dest: d, f: rnd(3400, 4600), q: 5, attack: .0005, peak: .4, decay: .007 });
      tone({ t: .002, dest: d, type: 'square', f: rnd(1600, 2000), peak: .04, decay: .01 });
    } },
    tick: { n: 1, dur: .1, make(d) { tone({ t: .003, dest: d, type: 'triangle', f: 1760, peak: .08, decay: .05 }); } },
    ui: { n: 1, dur: .22, make(d) {
      tone({ t: .003, dest: d, f: 990, peak: .06, decay: .06 });
      tone({ t: .073, dest: d, f: 1480, peak: .05, decay: .09 });
    } },
    fanfare: { n: 1, dur: 2.2, make(d) {
      const t = .02;
      [72, 76, 79, 84].forEach((n, i) => {
        tone({ t: t + i * .12, dest: d, type: 'square', f: hz(n), peak: .06, decay: .16 });
        tone({ t: t + i * .12, dest: d, type: 'triangle', f: hz(n) / 2, peak: .1, decay: .18 });
      });
      [72, 76, 79, 84, 88].forEach(n => tone({ t: t + .5, dest: lowpass(3500, d), type: 'sawtooth', f: hz(n), attack: .02, peak: .03, decay: 1.2 }));
      hiss({ t: t + .5, dest: d, type: 'highpass', f: 5000, peak: .16, decay: 1.3 });
      tone({ t: t + .5, dest: d, f: 130, f2: 60, peak: .45, decay: .3 });
    } },
  };
  const bank = new Map();
  let bankReady = false;
  function renderBank() {
    return enqueue(async () => {
      if (bankReady) return;
      const rate = ctx.sampleRate;
      for (const [name, def] of Object.entries(FX)) {
        const list = [];
        for (let k = 0; k < def.n; k++) {
          const oc = new OAC(1, Math.ceil(def.dur * rate), rate);
          C = oc;
          const out = oc.createGain();
          out.connect(oc.destination);
          def.make(out, 1);
          list.push(await renderDone(oc));
        }
        bank.set(name, list);
      }
      bankReady = true;
    });
  }

  // Voice manager: per-sound limits; the oldest voice of a kind fades out when a new one needs room
  const LIMIT = { click: 2, gear: 1, gun: 6, gunFar: 3, tink: 3, impact: 4, letter: 3, boom: 4, boomAir: 3, boomFar: 3, rocket: 4, rocketSoft: 3, ping: 2, crash: 2 };
  const voices = [];
  const last = {};
  function release(v, t) {
    const i = voices.indexOf(v);
    if (i >= 0) voices.splice(i, 1);
    v.g.gain.cancelScheduledValues(t);
    v.g.gain.setTargetAtTime(0, t, .012);
    try { v.src.stop(t + .09); } catch (e) { /* already stopped */ }
  }
  function play(name, { pan = 0, gain = 1, rate = 1, delay = 0, gap = 0 } = {}) {
    if (!live() || !bankReady) return;
    const list = bank.get(name);
    if (!list) return;
    const t = ctx.currentTime + delay;
    if (gap) { if (t - (last[name] || -1) < gap) return; last[name] = t; }
    const same = voices.filter(v => v.name === name);
    if (same.length >= (LIMIT[name] || 2)) release(same[0], ctx.currentTime);
    if (voices.length >= 28) release(voices[0], ctx.currentTime);
    const src = ctx.createBufferSource();
    src.buffer = list[(Math.random() * list.length) | 0];
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    const p = ctx.createStereoPanner();
    p.pan.value = clamp(pan || 0, -1, 1);
    src.connect(g); g.connect(p); p.connect(fxBus);
    src.start(t);
    const v = { src, g, name };
    voices.push(v);
    src.onended = () => {
      const i = voices.indexOf(v);
      if (i >= 0) voices.splice(i, 1);
      p.disconnect();
    };
  }
  // Big blasts push the music down for a moment, so they read clearly without clipping
  function duckMusic(amount, hold) {
    if (!musicDuck) return;
    const t = ctx.currentTime;
    musicDuck.gain.cancelScheduledValues(t);
    musicDuck.gain.setTargetAtTime(1 - amount, t, .02);
    musicDuck.gain.setTargetAtTime(1, t + hold, .25);
  }

  // =========================================================
  // Live graph
  // =========================================================
  function setup() {
    try { ctx = new AC({ latencyHint: 'balanced' }); } catch (e) { ctx = new AC(); }
    C = ctx;
    master = ctx.createGain();
    master.gain.value = VOLUME;
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -16; glue.knee.value = 10; glue.ratio.value = 3;
    glue.attack.value = .004; glue.release.value = .22;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20;
    limiter.attack.value = .0015; limiter.release.value = .1;
    const out = ctx.createGain();
    out.gain.value = .9;
    master.connect(glue); glue.connect(limiter); limiter.connect(out); out.connect(ctx.destination);
    output = out;
    limiterNode = limiter;
    fxBus = ctx.createGain();
    fxBus.gain.value = prefs.fx ? 1 : 0;
    fxBus.connect(master);
    musicDuck = ctx.createGain();
    musicDuck.connect(master);
    musicBus = ctx.createGain();
    musicBus.gain.value = prefs.music ? 1 : 0;
    musicBus.connect(musicDuck);
    engine = buildEngine(.0);
    bg = buildEngine(0, true);
  }

  const running = () => !!ctx && ctx.state === 'running';
  const live = () => running() && prefs.fx;
  const liveMusic = () => running() && prefs.music;

  // Radial engine: detuned saw + sub through a lowpass, pulsed smoothly at the cylinder firing rate, plus propeller wash
  function buildEngine(level, distant) {
    C = ctx;
    const out = ctx.createGain();
    out.gain.value = level;
    const pan = ctx.createStereoPanner();
    out.connect(pan);
    pan.connect(fxBus);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = distant ? 420 : 500;
    lp.Q.value = 1.1;
    const chug = ctx.createGain();
    chug.gain.value = .62;
    const lfo = ctx.createOscillator();
    // a soft pulse (sine + a touch of 2nd harmonic): no hard edges, so no clicks
    lfo.setPeriodicWave(ctx.createPeriodicWave(new Float32Array([0, 0, 0]), new Float32Array([0, 1, .3])));
    lfo.frequency.value = 14;
    const depth = ctx.createGain();
    depth.gain.value = .3;
    lfo.connect(depth);
    depth.connect(chug.gain);
    const o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.value = distant ? 70 : 40;
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = distant ? 36 : 20;
    o2.detune.value = 7;
    const sub = ctx.createGain();
    sub.gain.value = .8;
    o1.connect(lp); o2.connect(sub); sub.connect(lp); lp.connect(chug); chug.connect(out);
    const n = ctx.createBufferSource();
    n.buffer = noiseBuffer();
    n.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 500;
    bp.Q.value = .7;
    const wash = ctx.createGain();
    wash.gain.value = distant ? .25 : 0;
    n.connect(bp); bp.connect(wash); wash.connect(out);
    [lfo, o1, o2, n].forEach(s => s.start());
    if (distant) {
      const vib = ctx.createOscillator();
      vib.frequency.value = .35;
      const vAmt = ctx.createGain();
      vAmt.gain.value = 6;
      vib.connect(vAmt); vAmt.connect(o1.frequency); vAmt.connect(o2.frequency);
      vib.start();
    }
    return { out, pan, lp, lfo, o1, o2, bp, wash };
  }

  // ---------- Public API (all calls are no-ops until sound is live) ----------
  const Sfx = {
    get state() { return ctx ? ctx.state : 'locked'; },
    get ready() { return { fx: bankReady, bgm: bgm.ready, game: music.ready }; },
    // rpm ~14 idle … ~100 full power; level 0–1; pan −1…1
    engine(rpm, level, pan) {
      if (!live()) return;
      const t = ctx.currentTime, k = .08;
      const f = 24 + rpm * .85;
      engine.o1.frequency.setTargetAtTime(f, t, k);
      engine.o2.frequency.setTargetAtTime(f / 2, t, k);
      engine.lfo.frequency.setTargetAtTime(f / 2.3, t, k);
      engine.lp.frequency.setTargetAtTime(240 + rpm * 13, t, k);
      engine.bp.frequency.setTargetAtTime(280 + rpm * 11, t, k);
      engine.wash.gain.setTargetAtTime(clamp((rpm - 12) / 70, 0, .7), t, k);
      engine.out.gain.setTargetAtTime(clamp(level, 0, 1.2) * .13, t, .15);
      engine.pan.pan.setTargetAtTime(clamp(pan * .6, -1, 1), t, .1);
    },
    background(count, pan) {
      if (!live()) return;
      const t = ctx.currentTime;
      bg.out.gain.setTargetAtTime(Math.min(3, count) * .016, t, .4);
      bg.pan.pan.setTargetAtTime(clamp(pan * .5, -1, 1), t, .3);
    },
    gun(pan, far) {
      if (musicalShot(pan, far)) return;
      if (far) play('gunFar', { pan, gain: .5, gap: .06, rate: rnd(.95, 1.05) });
      else play('gun', { pan, gain: .78, gap: .036, rate: rnd(.96, 1.06) });
    },
    tink(pan) { play('tink', { pan, gain: .7, delay: rnd(.22, .5), rate: rnd(.9, 1.15) }); },
    rocket(pan, v = 1) {
      if (v < .6) play('rocketSoft', { pan, gain: v * 1.3 });
      else play('rocket', { pan, gain: v, rate: rnd(.95, 1.05) });
    },
    boom(pan, v = 1, air = false) {
      if (v < .45) play('boomFar', { pan, gain: v * 1.7, rate: rnd(.9, 1.05) });
      else play(air ? 'boomAir' : 'boom', { pan, gain: v * .9, rate: rnd(.92, 1.06) });
      if (v > .35) duckMusic(Math.min(.45, v * .45), .35);
    },
    crash(pan, v = .5) { play('crash', { pan, gain: v * 1.6 }); },
    impact(pan, kind) {
      if (kind === 'letter') play('letter', { pan, gain: .8, gap: .05, rate: rnd(.9, 1.12) });
      else play('impact', { pan, gain: .85, gap: .04, rate: rnd(.9, 1.1) });
    },
    beep(go) { play(go ? 'beepGo' : 'beep'); },
    tick() { play('tick'); },
    gear() { play('gear', { gain: .95 }); },
    fanfare() { play('fanfare'); duckMusic(.3, 1.5); },
    ping(pan) { play('ping', { pan, gap: .05 }); },
    ui() { play('ui', { gap: .05 }); },
    click(pan) { play('click', { pan, gain: .45, gap: .05, rate: rnd(.92, 1.1) }); },
  };

  // ---------- Gunfire in time and in tune with the soundtrack ----------
  // While music plays, every shot lands on the song's next 16th (one shot per 16th, so a burst becomes a
  // rhythm), a little softer, and rings a plucked note from the chord of the moment, climbing through it
  // shot by shot: a burst plays an arpeggio along with the tune.
  const shots = { slot: -1, farSlot: -1, k: 0, last: -9 };
  function tuneNote(n, pan, delay, v) {
    const src = ctx.createBufferSource();
    src.buffer = pluckBuffer(n, .8);
    const g = ctx.createGain();
    g.gain.value = v;
    const p = ctx.createStereoPanner();
    p.pan.value = clamp(pan * .6, -1, 1);
    src.connect(g); g.connect(p); p.connect(fxBus);
    src.start(ctx.currentTime + delay);
    src.onended = () => p.disconnect();
  }
  function musicalShot(pan, far) {
    if (!live() || !bankReady || !prefs.music) return false;
    const c = bgm.clock(ctx.currentTime + .015);
    if (!c) return false;
    const delay = Math.max(0, c.slotTime - ctx.currentTime);
    if (far) {
      if (c.slot === shots.farSlot || c.slot === shots.slot) return true;
      shots.farSlot = c.slot;
      play('gunFar', { pan, gain: .38, delay, rate: rnd(.97, 1.03) });
      return true;
    }
    if (c.slot === shots.slot) return true;
    shots.slot = c.slot;
    if (c.slotTime - shots.last > .4) shots.k = 0;
    shots.last = c.slotTime;
    const [a, b, d] = c.S.chordAt(c.bar);
    const run = [a, b, d, a + 12, b + 12, d + 12, a + 24, d + 12, b + 12, a + 12];
    play('gun', { pan, gain: .5, delay, rate: rnd(.98, 1.02) });
    tuneNote(run[shots.k++ % run.length] + 12, pan, delay, .42);
    return true;
  }

  // =========================================================
  // Offline song renderer
  // A song = { bpm, bars, makeBus(ctx), play(bus, step, time) }. Rendered in chunks of a few bars;
  // each chunk carries a reverb tail that is mixed into the following bars (and wrapped around the loop).
  // =========================================================
  // Build audio in small slices during idle time, with at most two chunks rendering at once,
  // so preparing the soundtrack never steals frames from the animation
  const idleWait = () => new Promise(r => (window.requestIdleCallback
    ? requestIdleCallback(() => r(), { timeout: 120 })
    : setTimeout(r, 16)));
  async function renderSong(song, fromBar, toBar, loop, onStatus) {
    const rate = MUSIC_RATE;
    const SPB = song.steps || 16, STEP = 60 / song.bpm / 4, BAR = STEP * SPB;
    const TAIL = 3.4, CHUNK = 2;
    const len = Math.round((toBar - fromBar) * BAR * rate);
    const total = loop ? len : len + Math.round(TAIL * rate);
    const L = new Float32Array(total), R = new Float32Array(total);
    const inflight = new Set();
    let done = 0, chunks = 0;
    for (let b = fromBar; b < toBar; b += CHUNK) chunks++;
    for (let b = fromBar; b < toBar; b += CHUNK) {
      while (inflight.size >= 2) await Promise.race(inflight);
      const bars = Math.min(CHUNK, toBar - b);
      const oc = new OAC(2, Math.ceil((bars * BAR + TAIL) * rate), rate);
      C = oc;
      const bus = song.makeBus(oc);
      for (let s0 = b * SPB; s0 < (b + bars) * SPB; s0 += 8) {
        C = oc;
        for (let s = s0; s < Math.min(s0 + 8, (b + bars) * SPB); s++) song.play(bus, s, (s - b * SPB) * STEP);
        await idleWait();
      }
      const off = Math.round((b - fromBar) * BAR * rate);
      const job = renderDone(oc).then(buf => {
        const bl = buf.getChannelData(0), br = buf.getChannelData(1);
        for (let j = 0; j < bl.length; j++) {
          let q = off + j;
          if (q >= total) { if (!loop) break; q %= total; }
          L[q] += bl[j];
          R[q] += br[j];
        }
        done++;
        if (onStatus) onStatus(done / chunks);
      });
      inflight.add(job);
      job.then(() => inflight.delete(job));
    }
    await Promise.all(inflight);
    const out = newBuffer(2, total, rate);
    out.copyToChannel ? (out.copyToChannel(L, 0), out.copyToChannel(R, 1)) : (out.getChannelData(0).set(L), out.getChannelData(1).set(R));
    return out;
  }
  function peakOf(buf) {
    let p = 0;
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < d.length; i += 3) { const v = Math.abs(d[i]); if (v > p) p = v; }
    }
    return p;
  }
  // ---------- Plucked strings (Karplus-Strong), shared by the violin track's pizzicato and the musical gunfire ----------
  const plucks = new Map();
  function pluckBuffer(n, bright = .5) {
    const key = `${n}:${bright}`;
    if (plucks.has(key)) return plucks.get(key);
    const rate = MUSIC_RATE, f = hz(n), len = Math.floor(rate * .9);
    const buf = newBuffer(1, len, rate), d = buf.getChannelData(0);
    const N = Math.max(2, Math.round(rate / f)), line = new Float32Array(N);
    let lp = 0;
    for (let i = 0; i < N; i++) { lp += ((Math.random() * 2 - 1) - lp) * (.25 + bright * .7); line[i] = lp; }
    const decay = .994 + Math.min(.005, 60 / f * .01);
    let idx = 0;
    for (let i = 0; i < len; i++) {
      const cur = line[idx], nxt = line[(idx + 1) % N];
      line[idx] = (cur + nxt) * .5 * decay;
      d[i] = cur * Math.min(1, i / 40) * (1 - i / len);
      idx = (idx + 1) % N;
    }
    plucks.set(key, buf);
    return buf;
  }

  // ---------- "Carol of the Skies" ----------
  // A driving violin arrangement of Leontovych's "Shchedryk" (1916, the tune behind "Carol of the Bells"),
  // G minor, 3/4 at 170 BPM. Strings and bells only (no drums, no bass): the drive comes from the strings
  // themselves, with a hard-bowed solo violin with a bit of electric bite, relentless spiccato chugs, col legno chops,
  // tremolo swells, rising runs and full-section stabs. Intro, the ostinato, the ostinato in thirds, the
  // falling "merry, merry" lines, the tolling bells, and a climax in octaves that drops back into the ostinato.
  const winter = (() => {
    const BPM = 170, STEP = 60 / BPM / 4, SPB = 12, INTRO = 4;
    const GM = [55, 58, 62], D = [54, 57, 62], CM = [55, 60, 63], EB = [55, 58, 63], F = [53, 57, 60];
    const LAMENT = [GM, D, GM, CM, EB, D, GM, D];
    // [16th step, note, length in 16ths] inside one bar
    const OST = [[0, 70, 4], [4, 69, 2], [6, 70, 2], [8, 67, 4]];                 // Bb A Bb G
    const OST_3RD = [[0, 74, 4], [4, 72, 2], [6, 74, 2], [8, 70, 4]];             // D C D Bb
    const FALL = [
      [[0, 79, 2], [2, 79, 2], [4, 79, 2], [6, 77, 2], [8, 75, 2], [10, 74, 2]],
      [[0, 77, 2], [2, 77, 2], [4, 77, 2], [6, 75, 2], [8, 74, 2], [10, 72, 2]],
      [[0, 75, 2], [2, 75, 2], [4, 75, 2], [6, 74, 2], [8, 72, 2], [10, 70, 2]],
      [[0, 74, 2], [2, 72, 2], [4, 70, 2], [6, 69, 2], [8, 67, 4]],
    ];
    const FALL_CH = [GM, F, EB, D];
    const TOLL = [[[0, 74, 12]], [[0, 75, 12]], [[0, 74, 8], [8, 72, 4]], []];
    const TOLL_CH = [GM, CM, GM, D];
    const RUN = [67, 69, 70, 72, 74, 75, 77, 79, 81, 82, 84, 86];                // G minor, two octaves up
    // loop bar -> section
    const sec = lb => (lb < 8 ? 'ost' : lb < 16 ? 'third' : lb < 24 ? 'fall' : lb < 28 ? 'toll' : 'climax');
    const chordAt = bar => {
      if (bar < INTRO) return GM;
      const lb = (bar - INTRO) % 32, s = sec(lb);
      if (s === 'fall') return FALL_CH[lb % 4];
      if (s === 'toll') return TOLL_CH[lb - 24];
      return LAMENT[lb % 8];
    };

    function makeBus(oc) {
      const out = oc.createGain();
      out.gain.value = .72;
      out.connect(oc.destination);
      const verb = oc.createConvolver();
      verb.buffer = impulse(oc.sampleRate, 2.2);
      const wet = oc.createGain();
      wet.gain.value = .26;
      verb.connect(wet); wet.connect(out);
      const send = oc.createGain();
      send.connect(verb);
      const strings = oc.createGain();
      strings.connect(out);
      const bells = oc.createGain();
      bells.gain.value = .75;
      bells.connect(out);
      const bs = oc.createGain();
      bs.gain.value = .6;
      bells.connect(bs); bs.connect(send);
      return { out, send, strings, bells };
    }
    // Bowed violin: detuned saws (optionally driven for an electric bite), delayed vibrato, body EQ, bow noise
    function violin(B, t, n, len, v, o = {}) {
      const f = hz(n), att = o.att || .03, rel = o.rel || .12, voices = o.voices || 2;
      const g = C.createGain();
      g.gain.setValueAtTime(.0001, t);
      if (o.swell) g.gain.linearRampToValueAtTime(v, t + len * .9);
      else {
        g.gain.linearRampToValueAtTime(v * (o.accent || 1.15), t + att);
        g.gain.setTargetAtTime(v * .8, t + att, .08);
      }
      g.gain.setTargetAtTime(.0001, t + len, rel / 3);
      if (o.trem) {                                        // bowed tremolo: fast, even re-bowing
        const lfo = C.createOscillator();
        lfo.frequency.value = 15;
        const d = C.createGain();
        d.gain.value = .45;
        const tg = C.createGain();
        tg.gain.value = .55;
        lfo.connect(d); d.connect(tg.gain);
        g.connect(tg);
        lfo.start(t); lfo.stop(t + len + rel + .05);
        o.out = tg;
      }
      const lp = C.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = o.dark ? 3000 : 6200;
      const bright = C.createBiquadFilter();
      bright.type = 'peaking';
      bright.frequency.value = 3000;
      bright.Q.value = 1.1;
      bright.gain.value = o.dark ? 2 : 6;
      const body = C.createBiquadFilter();
      body.type = 'peaking';
      body.frequency.value = 480;
      body.Q.value = 1.3;
      body.gain.value = 4;
      const hp = C.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 200;
      let head = lp;
      if (o.drive) {
        const sh = C.createWaveShaper();
        sh.curve = driveCurve(o.drive);
        sh.connect(lp);
        head = sh;
      }
      lp.connect(bright); bright.connect(body); body.connect(hp); hp.connect(g);
      const vib = C.createOscillator();
      vib.frequency.value = 5.6 + Math.random() * .6;
      const depth = C.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.setValueAtTime(0, t + Math.min(.16, len * .4));
      depth.gain.linearRampToValueAtTime(f * (o.vib == null ? .007 : o.vib), t + Math.min(.4, len * .8));
      vib.connect(depth);
      const end = t + len + rel + .05;
      for (let k = 0; k < voices; k++) {
        const osc = C.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = f;
        osc.detune.value = (k - (voices - 1) / 2) * 8 + (Math.random() - .5) * 3;
        depth.connect(osc.frequency);
        const og = C.createGain();
        og.gain.value = 1 / voices;
        osc.connect(og); og.connect(head);
        osc.start(t); osc.stop(end);
      }
      vib.start(t); vib.stop(end);
      hiss({ t, dest: g, f: 3400, q: .8, attack: .004, peak: .06, decay: Math.min(.12, len) });   // the bow biting in
      const outNode = o.out || g;
      const p = panner(o.pan || 0, B.strings);
      outNode.connect(p);
      const s = C.createGain();
      s.gain.value = o.wet == null ? .45 : o.wet;
      outNode.connect(s); s.connect(B.send);
    }
    // Spiccato chug: a short, hard bow stroke
    function chug(B, t, n, v, pan) {
      const o = C.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = hz(n);
      const o2 = C.createOscillator();
      o2.type = 'sawtooth';
      o2.frequency.value = hz(n);
      o2.detune.value = 9;
      const f = C.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(3800, t);
      f.frequency.exponentialRampToValueAtTime(900, t + .07);
      const g = C.createGain();
      envelope(g, t, .003, v, .075);
      const p = panner(pan, B.strings);
      o.connect(f); o2.connect(f); f.connect(g); g.connect(p);
      hiss({ t, dest: p, f: 2600, q: 1.2, attack: .001, peak: v * .35, decay: .02 });
      [o, o2].forEach(x => { x.start(t); x.stop(t + .11); });
    }
    // Col legno: the wood of the bow struck on the strings, a dry percussive click with a pitch
    function chop(B, t, v, n = 55) {
      hiss({ t, dest: B.strings, f: 1900, q: 1.6, attack: .001, peak: v, decay: .045 });
      hiss({ t, dest: B.strings, type: 'lowpass', f: 700, attack: .001, peak: v * .6, decay: .06 });
      tone({ t, dest: B.strings, type: 'triangle', f: hz(n), attack: .001, peak: v * .5, decay: .05 });
    }
    function pizz(B, t, n, v, pan) {
      const src = C.createBufferSource();
      src.buffer = pluckBuffer(n, .45);
      const g = C.createGain();
      g.gain.value = v;
      const p = panner(pan, B.strings);
      src.connect(g); g.connect(p);
      const s = C.createGain();
      s.gain.value = .4;
      g.connect(s); s.connect(B.send);
      src.start(t);
    }
    function bell(B, t, n, v) {
      const f = hz(n);
      [[1, 1, 1.8], [2.76, .34, .6], [5.4, .18, .3], [8.93, .08, .15]].forEach(([m, a, d]) =>
        tone({ t, dest: B.bells, f: f * m, attack: .002, peak: v * a, decay: d }));
    }
    const lead = (B, t, i, list, k, v, o) => list.forEach(([st, n, len]) => {
      if (st === i) violin(B, t, n + k, STEP * len * .92, v, { accent: st === 0 ? 1.3 : 1.1, ...o });
    });

    function play(B, s, t) {
      const bar = Math.floor(s / SPB), i = s % SPB;
      const lb = bar - INTRO, S = lb < 0 ? 'intro' : sec(lb % 32);
      const ch = chordAt(bar), root = ch[0];
      if (S === 'intro') {
        // pizzicato ostinato, a tremolo swell underneath, and a run up into the theme
        OST.forEach(([st, n]) => { if (st === i) pizz(B, t, n, .42 + bar * .08, st === 4 ? .3 : -.3); });
        if (i === 0 && bar < 3) violin(B, t, 55 + (bar === 2 ? 3 : 0), STEP * 11.5, .05 + bar * .02, { trem: true, dark: true, swell: true, voices: 3, pan: -.3 });
        if (bar === 3) chug(B, t, RUN[i], .06 + i * .006, (i % 2 ? .3 : -.3));
        return;
      }
      // ---- the drive: spiccato 16ths on the root and fifth, accented in the ostinato's rhythm ----
      if (S !== 'toll') {
        const acc = i === 0 ? 1 : (i === 4 || i === 6 || i === 8) ? .8 : .5;
        const v = (S === 'climax' ? .09 : S === 'ost' ? .065 : .08) * acc;
        chug(B, t, i % 4 === 2 ? root + 7 : root, v, i % 2 ? .45 : .25);
        if (S === 'climax' || S === 'fall') chug(B, t, root + 12, v * .6, -.4);
      }
      // col legno chops: beat one, then the offbeat kicks that push it forward
      if (S !== 'toll') {
        if (i === 0) chop(B, t, S === 'ost' ? .16 : .22);
        if ((S === 'fall' || S === 'climax') && (i === 6 || i === 10)) chop(B, t, .14, 62);
        if (S === 'third' && i === 8) chop(B, t, .12, 62);
      }
      // full-section stabs on the downbeat of every other bar in the big sections
      if (i === 0 && (S === 'climax' || (S === 'fall' && lb % 2 === 0) || (S === 'third' && lb % 4 === 0))) {
        ch.forEach((n, k) => violin(B, t, n + 12, STEP * 2.2, .08, { voices: 3, pan: (k - 1) * .6, rel: .25, dark: k === 0 }));
      }
      // ---- the melody ----
      if (S === 'ost') lead(B, t, i, OST, 12, .2, { drive: 1.4, voices: 2 });
      if (S === 'third') {
        lead(B, t, i, OST, 12, .12, { voices: 3, dark: true, pan: -.35 });
        lead(B, t, i, OST_3RD, 12, .19, { drive: 1.4, voices: 2 });
        if (lb >= 12) lead(B, t, i, OST, 0, .1, { voices: 3, dark: true, pan: .35 });
      }
      if (S === 'fall') {
        const bars = FALL[lb % 4], up = lb >= 20 ? 12 : 0;
        lead(B, t, i, bars, up, .2, { drive: 1.5, voices: 2 });
        if (up) lead(B, t, i, bars, 0, .12, { voices: 3, dark: true, pan: -.3 });
        if (i === 0) ch.forEach((n, k) => violin(B, t, n, STEP * 11.6, .045, { trem: true, voices: 2, dark: true, pan: (k - 1) * .5 }));
      }
      if (S === 'toll') {
        const k = lb - 24;
        lead(B, t, i, TOLL[k], 12, .18, { drive: 1.2, voices: 3, att: .12, rel: .4 });
        if (i % 4 === 0 && k < 3) bell(B, t, i === 4 ? 74 + 12 : 67 + 12, .13);
        if (i === 0) ch.forEach((n, j) => violin(B, t, n + 12, STEP * 11.6, .06 + k * .02, { trem: true, swell: true, voices: 2, pan: (j - 1) * .5 }));
        if (k === 3) chug(B, t, RUN[i] + 12, .07 + i * .008, i % 2 ? .35 : -.35);
      }
      if (S === 'climax') {
        lead(B, t, i, OST, 12, .21, { drive: 1.6, voices: 2 });
        lead(B, t, i, OST, 24, .07, { voices: 2, pan: .3 });
        lead(B, t, i, OST, 0, .11, { voices: 3, dark: true, pan: -.3 });
        if (i % 4 === 0) bell(B, t, ch[i / 4] + 24, .08);
        if (lb === 31 && i >= 8) chug(B, t, RUN[i] + 12, .1, 0);
      }
    }
    return { bpm: BPM, steps: SPB, makeBus, play, introBars: INTRO, bars: INTRO + 32, chordAt };
  })();

  // ---------- Game track: 125 BPM, A minor, one-bar count-in then a 16-bar loop ----------
  const arcade = (() => {
    const BPM = 125, STEP = 60 / BPM / 4;
    const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
    const ROOTS = [33, 29, 36, 31];
    function makeBus(oc) {
      const out = oc.createGain();
      out.gain.value = .6;
      out.connect(oc.destination);
      const drums = oc.createGain();
      drums.gain.value = .55;
      drums.connect(out);
      const duck = oc.createGain();
      duck.connect(out);
      const synth = oc.createGain();
      synth.gain.value = .5;
      synth.connect(duck);
      const delay = oc.createDelay(1);
      delay.delayTime.value = STEP * 3;
      const fb = oc.createGain();
      fb.gain.value = .32;
      const damp = oc.createBiquadFilter();
      damp.type = 'lowpass';
      damp.frequency.value = 2400;
      delay.connect(damp); damp.connect(fb); fb.connect(delay); damp.connect(duck);
      return { out, drums, duck, synth, delay };
    }
    const kick = (B, t, v = 1) => {
      tone({ t, dest: B.drums, f: 160, f2: 40, attack: .001, peak: 1.05 * v, decay: .3 });
      hiss({ t, dest: B.drums, type: 'highpass', f: 3000, peak: .08 * v, decay: .012 });
      B.duck.gain.cancelScheduledValues(t);
      B.duck.gain.setValueAtTime(.3, t);
      B.duck.gain.linearRampToValueAtTime(1, t + .2);
    };
    const snare = (B, t, v = 1) => {
      hiss({ t, dest: B.drums, type: 'highpass', f: 1400, peak: .45 * v, decay: .15 });
      tone({ t, dest: B.drums, type: 'triangle', f: 230, f2: 150, peak: .28 * v, decay: .08 });
    };
    const clap = (B, t) => {
      for (let i = 0; i < 3; i++) hiss({ t: t + i * .011, dest: B.drums, f: 1500, q: 1.1, peak: .32, decay: .03 });
      hiss({ t: t + .033, dest: B.drums, f: 1300, q: .9, peak: .3, decay: .18 });
    };
    const hat = (B, t, open, v = 1) => hiss({ t, dest: B.drums, type: 'highpass', f: 7800, peak: (open ? .16 : .1) * v, decay: open ? .17 : .035 });
    const crash = (B, t) => hiss({ t, dest: B.drums, type: 'highpass', f: 5200, peak: .2, decay: 1.4 });
    function bass(B, t, n, len) {
      const o = C.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = hz(n);
      const f = C.createBiquadFilter();
      f.type = 'lowpass';
      f.Q.value = 6;
      f.frequency.setValueAtTime(900, t);
      f.frequency.exponentialRampToValueAtTime(160, t + len);
      const g = C.createGain();
      envelope(g, t, .004, .55, len);
      o.connect(f); f.connect(g); g.connect(B.synth);
      o.start(t); o.stop(t + len + .05);
    }
    function pluck(B, t, n, v, bright) {
      const o = C.createOscillator();
      o.type = 'square';
      o.frequency.value = hz(n);
      const f = C.createBiquadFilter();
      f.type = 'lowpass';
      f.Q.value = 4;
      f.frequency.setValueAtTime(bright, t);
      f.frequency.exponentialRampToValueAtTime(500, t + .14);
      const g = C.createGain();
      envelope(g, t, .002, v, .16);
      o.connect(f); f.connect(g); g.connect(B.synth); g.connect(B.delay);
      o.start(t); o.stop(t + .22);
    }
    function stab(B, t, chord) {
      chord.forEach(n => [-8, 8].forEach(det => {
        const o = C.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = hz(n + 12);
        o.detune.value = det;
        const f = C.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(3200, t);
        f.frequency.exponentialRampToValueAtTime(700, t + .25);
        const g = C.createGain();
        envelope(g, t, .004, .06, .28);
        o.connect(f); f.connect(g); g.connect(B.synth);
        o.start(t); o.stop(t + .35);
      }));
    }
    function play(B, s, t) {
      const bar = Math.floor(s / 16), i = s % 16;
      if (bar === 0) {                                   // count-in
        if (i % 4 === 0) kick(B, t, .9);
        if (i >= 8) snare(B, t, .25 + (i - 8) * .07);
        if (i === 0) hiss({ t, dest: B.drums, f: 300, f2: 5000, q: 2, attack: STEP * 15, peak: .22, decay: .05 });
        return;
      }
      const lb = (bar - 1) % 16;                         // bar inside the loop
      const c = lb % 4, chord = CHORDS[c];
      if (i === 0 && c === 0) crash(B, t);
      if (i % 4 === 0) kick(B, t);
      if (i === 14 && c === 3) kick(B, t, .7);
      if (i === 4 || i === 12) clap(B, t);
      if (i % 4 === 2) hat(B, t, true);
      else hat(B, t, false, i % 2 ? .7 : 1);
      if (i % 2 === 0) bass(B, t, ROOTS[c] + (i % 4 === 2 ? 12 : 0), STEP * 1.8);
      if (lb >= 2) {
        const up = [0, 1, 2, 1, 2, 0, 2, 1][i % 8];
        pluck(B, t, chord[up] + (i % 8 >= 4 ? 12 : 0) + 12, .09, 1500 + (lb % 8) * 350);
      }
      if (lb >= 4 && (i === 0 || i === 3 || i === 6 || i === 10)) stab(B, t, chord);
      if (lb >= 8 && i % 8 === 7) snare(B, t, .35);
    }
    // As a background soundtrack: the count-in bar is its intro, then the 16-bar loop
    const chordAt = bar => CHORDS[Math.max(0, bar - 1) % 16 % 4];
    return { bpm: BPM, makeBus, play, introBars: 1, bars: 17, chordAt };
  })();

  // =========================================================
  // Players
  // =========================================================
  const statusEl = { set() {} };
  let musicGain = 1;          // shared loudness correction for the rendered tracks

  const SONGS = {
    winter: { song: winter, name: 'Carol of the Skies', kind: 'Violin' },
    dogfight: { song: arcade, name: 'Dogfight', kind: 'Electronic' },
  };
  if (!SONGS[prefs.track]) prefs.track = 'winter';
  const barOf = S => 60 / S.bpm / 4 * (S.steps || 16);

  const bgm = (() => {
    const LEVEL = .62;
    const cache = {};
    let cur = null, held = false, want = false;
    const entry = id => cache[id] || (cache[id] = { intro: null, loop: null, norm: 1, rendering: null });
    function render(id = prefs.track) {
      const e = entry(id);
      if (e.rendering) return e.rendering;
      const S = SONGS[id].song, name = SONGS[id].name;
      e.rendering = enqueue(async () => {
        statusEl.set(`Tuning “${name}”…`);
        e.intro = await renderSong(S, 0, S.introBars, false);
        e.norm = .9 / Math.max(peakOf(e.intro), .1);
        if (want && !held && prefs.track === id && !cur) begin(id);
        e.loop = await renderSong(S, S.introBars, S.bars, true, p => statusEl.set(`Tuning “${name}”… ${Math.round(p * 100)}%`));
        e.norm = Math.min(e.norm, .9 / Math.max(peakOf(e.loop), .1));
        if (cur && cur.id === id) { cur.norm.gain.value = e.norm; queueLoop(); }
        statusEl.set('');
      });
      return e.rendering;
    }
    function queueLoop() {
      const e = entry(cur.id);
      if (!e.loop || cur.looped) return;
      const at = Math.max(cur.loopAt, ctx.currentTime + .03);
      const s = ctx.createBufferSource();
      s.buffer = e.loop;
      s.loop = true;
      s.connect(cur.norm);
      s.start(at);
      cur.srcs.push(s);
      cur.looped = true;
      cur.loopAt = at;
    }
    function begin(id) {
      const e = entry(id);
      if (cur || !e.intro || !liveMusic()) return;
      const S = SONGS[id].song, BAR = barOf(S);
      const t = ctx.currentTime + .08;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(LEVEL, t + 1.2);
      gain.connect(musicBus);
      const norm = ctx.createGain();
      norm.gain.value = e.norm;
      norm.connect(gain);
      const s = ctx.createBufferSource();
      s.buffer = e.intro;
      s.connect(norm);
      s.start(t);
      cur = { id, S, gain, norm, srcs: [s], t0: t, loopAt: t + S.introBars * BAR, loopDur: (S.bars - S.introBars) * BAR, looped: false };
      queueLoop();
    }
    function start() {
      want = true;
      if (held || !liveMusic()) return;
      const e = entry(prefs.track);
      if (!e.intro) { render(prefs.track); return; }
      begin(prefs.track);
    }
    function stop(fade = .8) {
      want = false;
      if (!cur || !ctx) return;
      const old = cur;
      cur = null;
      const t = ctx.currentTime;
      old.gain.gain.cancelScheduledValues(t);
      old.gain.gain.setValueAtTime(old.gain.gain.value, t);
      old.gain.gain.linearRampToValueAtTime(0, t + fade);
      old.srcs.forEach(s => { try { s.stop(t + fade + .05); } catch (e) { /* not started */ } });
      setTimeout(() => old.gain.disconnect(), fade * 1000 + 300);
    }
    // Where the song is at time `at`: its current bar, and when (and which) the next 16th falls
    function clock(at) {
      if (!cur) return null;
      const S = cur.S, STEP = 60 / S.bpm / 4, SPB = S.steps || 16;
      let rel, base = 0;
      if (!cur.looped || at < cur.loopAt) {
        rel = at - cur.t0;
        if (rel < 0) return null;
      } else {
        rel = (at - cur.loopAt) % cur.loopDur;
        base = S.introBars * SPB;
      }
      const k = Math.ceil(rel / STEP - 1e-6);
      const slotTime = at + (k * STEP - rel);
      return { S, slotTime, slot: Math.round(slotTime / STEP), bar: Math.floor((base + k) / SPB) };
    }
    // Change the soundtrack: the old one fades out while the new one fades in
    function switchTo(id) {
      if (!SONGS[id]) return;
      if (id === prefs.track && cur) return;
      prefs.track = id;
      if (cur) stop(1.1);
      if (prefs.music) start();
    }
    return {
      start, stop, render, clock, switchTo,
      hold(on) {
        held = on;
        if (on) { const w = want; stop(.4); want = w; }
        else setTimeout(() => { if (!held && want) start(); }, 1600);
      },
      get playing() { return !!cur; },
      get ready() { return !!entry(prefs.track).loop; },
      get track() { return prefs.track; },
    };
  })();
  Sfx.bgm = bgm;

  const music = (() => {
    const BAR = 60 / arcade.bpm * 4;
    let buf = null, rendering = null, out = null, pending = false;
    function render() {
      if (rendering) return rendering;
      rendering = enqueue(async () => {
        buf = await renderSong(arcade, 0, 17, false);
        const norm = .85 / Math.max(peakOf(buf), .1);
        const d0 = buf.getChannelData(0), d1 = buf.getChannelData(1);
        for (let i = 0; i < d0.length; i++) { d0[i] *= norm; d1[i] *= norm; }
        if (pending) begin();
      });
      return rendering;
    }
    function begin() {
      pending = false;
      if (!buf || !liveMusic()) return;
      const gain = ctx.createGain();
      gain.gain.value = .75;
      gain.connect(musicBus);
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.loopStart = BAR;
      s.loopEnd = BAR * 17;
      s.connect(gain);
      s.start(ctx.currentTime + .03);
      out = { gain, s };
    }
    return {
      render,
      start() {
        this.stop(true);
        bgm.hold(true);
        if (!liveMusic()) return;
        if (buf) begin();
        else { pending = true; render(); }
      },
      stop(now) {
        pending = false;
        if (!now) bgm.hold(false);
        if (!out || !ctx) return;
        const old = out;
        out = null;
        const t = ctx.currentTime;
        old.gain.gain.cancelScheduledValues(t);
        old.gain.gain.setValueAtTime(old.gain.gain.value, t);
        old.gain.gain.linearRampToValueAtTime(0, t + (now ? .05 : .45));
        try { old.s.stop(t + .5); } catch (e) { /* already stopped */ }
        setTimeout(() => old.gain.disconnect(), 800);
      },
      get playing() { return !!out; },
      get ready() { return !!buf; },
    };
  })();
  Sfx.music = music;
  window.Sfx = Sfx;
  // Inspection hook for development only: open the page with ?debug
  if (/[?&]debug\b/.test(location.search)) Sfx.__debug = { get ctx() { return ctx; }, get master() { return master; }, get output() { return output; }, get limiter() { return limiterNode; }, get voices() { return voices.length; }, songs: SONGS, renderSong, peakOf };

  // ---------- Sound menu + unlock ----------
  const menu = document.createElement('div');
  menu.className = 'sound-menu';
  menu.id = 'sound-menu';
  menu.setAttribute('role', 'dialog');
  menu.setAttribute('aria-label', 'Sound settings');
  menu.innerHTML = `
    <label class="sound-menu__row">
      <span><b>Music</b><small>Background soundtrack</small></span>
      <input type="checkbox" data-pref="music"><i aria-hidden="true"></i>
    </label>
    <label class="sound-menu__row">
      <span><b>Effects</b><small>Engine, guns, explosions</small></span>
      <input type="checkbox" data-pref="fx"><i aria-hidden="true"></i>
    </label>
    <p class="sound-menu__status" aria-live="polite" hidden></p>`;
  document.body.appendChild(menu);
  const status = menu.querySelector('.sound-menu__status');
  statusEl.set = text => { status.textContent = text; status.hidden = !text; };
  const boxes = [...menu.querySelectorAll('input')];
  const navTrack = document.querySelector('.track-toggle');
  const navTrackLabel = navTrack && navTrack.querySelector('.track-toggle__label');
  const songMenu = document.createElement('div');
  songMenu.className = 'track-menu';
  songMenu.id = 'track-menu';
  songMenu.setAttribute('role', 'menu');
  songMenu.setAttribute('aria-label', 'Choose the soundtrack');
  songMenu.innerHTML = `<p class="track-menu__head">Soundtrack</p>` + Object.entries(SONGS).map(([id, s]) => `
    <button type="button" role="menuitemradio" data-track="${id}">
      <span class="track-menu__eq" aria-hidden="true"><i></i><i></i><i></i></span>
      <span><b>${s.name}</b><small>${s.kind}</small></span>
    </button>`).join('');
  document.body.appendChild(songMenu);
  const trackBtns = [...songMenu.querySelectorAll('[data-track]')];
  const paintMenu = () => {
    boxes.forEach(b => { b.checked = prefs[b.dataset.pref]; });
    const s = SONGS[prefs.track];
    trackBtns.forEach(b => b.setAttribute('aria-checked', String(b.dataset.track === prefs.track)));
    songMenu.classList.toggle('is-muted', !prefs.music);
    if (navTrack) {
      navTrackLabel.textContent = s.name;
      navTrack.title = `Soundtrack: ${s.name}`;
      navTrack.setAttribute('aria-label', `Soundtrack: ${s.name}. Choose the soundtrack`);
      navTrack.classList.toggle('is-on', prefs.music);
    }
  };
  paintMenu();
  paintButton();

  function setPref(key, on) {
    prefs[key] = on;
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) { /* storage blocked */ }
    paintButton();
    paintMenu();
    if (on) unlock();
    if (!ctx) return;
    const t = ctx.currentTime;
    if (key === 'fx') fxBus.gain.setTargetAtTime(on ? 1 : 0, t, .05);
    if (key === 'music') {
      musicBus.gain.setTargetAtTime(on ? 1 : 0, t, .08);
      if (on) bgm.start(); else bgm.stop(.3);
    }
  }
  boxes.forEach(b => b.addEventListener('change', () => setPref(b.dataset.pref, b.checked)));
  // Picking a soundtrack also switches the music on
  function pickTrack(id) {
    if (!SONGS[id]) return;
    if (!prefs.music) {
      prefs.track = id;
      setPref('music', true);                            // saves, unlocks and starts the chosen track
    } else {
      if (ctx) bgm.switchTo(id);
      else { prefs.track = id; unlock(); }
      try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) { /* storage blocked */ }
    }
    paintMenu();
  }
  let songOpen = false;
  function openSongs(on) {
    songOpen = on;
    songMenu.classList.toggle('is-open', on);
    if (!navTrack) return;
    navTrack.setAttribute('aria-expanded', String(on));
    if (on) {
      if (menuOpen) openMenu(false);
      const r = navTrack.getBoundingClientRect();
      songMenu.style.top = `${Math.round(r.bottom + 14)}px`;
      songMenu.style.left = `${Math.round(Math.min(innerWidth - songMenu.offsetWidth - 12, Math.max(12, r.left + r.width / 2 - songMenu.offsetWidth / 2)))}px`;
      const cur = trackBtns.find(b => b.dataset.track === prefs.track);
      if (cur) cur.focus({ preventScroll: true });
    }
  }
  trackBtns.forEach(b => b.addEventListener('click', () => { pickTrack(b.dataset.track); openSongs(false); }));
  if (navTrack) {
    navTrack.setAttribute('aria-haspopup', 'menu');
    navTrack.setAttribute('aria-controls', 'track-menu');
    navTrack.setAttribute('aria-expanded', 'false');
    navTrack.addEventListener('click', e => { e.preventDefault(); openSongs(!songOpen); });
  }
  songMenu.addEventListener('keydown', e => {
    const i = trackBtns.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = trackBtns.length;
      trackBtns[((i < 0 ? 0 : i) + (e.key === 'ArrowDown' ? 1 : n - 1)) % n].focus();
    }
  });
  paintMenu();
  paintButton();

  let menuOpen = false;
  function openMenu(on) {
    menuOpen = on;
    if (on && songOpen) openSongs(false);
    menu.classList.toggle('is-open', on);
    if (btn) btn.setAttribute('aria-expanded', String(on));
    if (on && btn) {
      const r = btn.getBoundingClientRect();
      menu.style.top = `${Math.round(r.bottom + 14)}px`;
      menu.style.right = `${Math.round(Math.max(12, innerWidth - r.right - 40))}px`;
    }
  }
  if (btn) {
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.setAttribute('aria-controls', 'sound-menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.removeAttribute('aria-pressed');
    btn.addEventListener('click', e => { e.preventDefault(); openMenu(!menuOpen); });
  }
  document.addEventListener('pointerdown', e => {
    if (menuOpen && !menu.contains(e.target) && !(btn && btn.contains(e.target))) openMenu(false);
    if (songOpen && !songMenu.contains(e.target) && !(navTrack && navTrack.contains(e.target))) openSongs(false);
  });
  addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (menuOpen) openMenu(false);
    if (songOpen) { openSongs(false); if (navTrack) navTrack.focus(); }
  });
  addEventListener('resize', () => { if (menuOpen) openMenu(true); if (songOpen) openSongs(true); });

  let prepared = false;
  function prepare() {
    if (prepared) return;
    prepared = true;
    renderBank();
    if (prefs.music) bgm.render(prefs.track);
    Object.keys(SONGS).forEach(id => { if (id !== prefs.track) bgm.render(id); });
    music.render();
  }
  function unlock() {
    if (!ctx) setup();
    const go = () => {
      prepare();
      if (prefs.music) bgm.start();
    };
    if (ctx.state !== 'running') ctx.resume().then(go);
    else go();
  }
  ['pointerdown', 'keydown', 'touchend'].forEach(type => addEventListener(type, () => { if (anyOn()) unlock(); }, { capture: true, passive: true }));
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend();
    else if (anyOn()) ctx.resume();
  });
})();
