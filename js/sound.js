/* =========================================================
   Sound — effects synthesised with WebAudio; music streamed from three audio files.

   - effects: a small bank of variations rendered ahead of time with OfflineAudioContext, played through a
     voice manager (per-sound voice limits, oldest voice fades out), so heavy gunfire never floods the audio
     thread. Gunfire and rocket launches are synthesised to sound like the real thing.
   - music: "Dawn", "Embrace" and "Awake" by Sappheiros (CC BY 3.0), played as a playlist and picked from the
     song button in the nav. Peaceful mode starts on Dawn, Chaotic on Awake.
   The master chain ends in a glue compressor and a limiter, so stacked sounds never clip.

   Browsers only allow audio after a click, tap or key press, so sound starts on the first interaction.
   The nav "Sound" button opens a small menu with separate Music and Effects switches (remembered).
   ========================================================= */
(() => {
  const AC = window.AudioContext || window.webkitAudioContext;
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const btn = document.querySelector('.sound-toggle');
  const navEl = document.querySelector('.nav');
  const KEY = 'hl-audio';
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const hz = n => 440 * Math.pow(2, (n - 69) / 12);
  const VOLUME = .8;
  const NOISE_RATE = 32000;          // sample rate of the shared noise buffer
  const volCurve = v => Math.pow(clamp(v, 0, 100) / 100, 2);   // perceptual: half-travel sounds like half, not silence

  const prefs = { music: true, fx: true, track: '', musicVol: 100, fxVol: 100 };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved) Object.assign(prefs, saved);
    else if (localStorage.getItem('hl-sound') === 'off') prefs.music = prefs.fx = false;
  } catch (e) { /* storage blocked */ }

  let ctx = null, master = null, fxBus = null, fxVol = null, musicBus = null, musicVol = null, musicDuck = null, analyser = null, engine = null, bg = null, output = null, limiterNode = null;
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
    noise = newBuffer(1, NOISE_RATE * 2, NOISE_RATE);
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
    // A machine-gun round: a hard, clipped muzzle crack, the low thump of the cartridge, the metallic clack of
    // the bolt cycling a few milliseconds later, and the report rolling away across the sky
    gun: { n: 6, dur: .5, make(d, v) {
      const t = .004;
      const crack = C.createWaveShaper();
      crack.curve = driveCurve(3.5);
      crack.connect(d);
      hiss({ t, dest: crack, type: 'highpass', f: rnd(900, 1400), attack: .0004, peak: 1.05 * v, decay: rnd(.016, .024) });
      tone({ t, dest: crack, type: 'square', f: rnd(95, 125), f2: 38, attack: .0005, peak: .42 * v, decay: .05 });
      tone({ t, dest: d, f: rnd(140, 175), f2: 46, attack: .001, peak: .8 * v, decay: .1 });
      hiss({ t, dest: d, type: 'lowpass', f: 1500, f2: 220, attack: .001, peak: .5 * v, decay: .13 });
      const bolt = t + rnd(.022, .032);
      hiss({ t: bolt, dest: d, f: rnd(2600, 3500), q: 9, attack: .0005, peak: .2 * v, decay: .02 });
      tone({ t: bolt, dest: d, type: 'triangle', f: rnd(1800, 2400), attack: .0005, peak: .05 * v, decay: .03 });
      hiss({ t: t + .015, dest: lowpass(900, d), f: 480, q: .6, attack: .02, peak: .16 * v, decay: .34 });
    } },
    // Far off: the crack is gone, just a dull report and its echo
    gunFar: { n: 3, dur: .6, make(d, v) {
      const l = lowpass(1600, d);
      hiss({ t: .004, dest: l, type: 'highpass', f: 500, attack: .001, peak: .55 * v, decay: .035 });
      tone({ t: .004, dest: l, f: 115, f2: 44, attack: .001, peak: .5 * v, decay: .09 });
      hiss({ t: .03, dest: l, f: 420, q: .6, attack: .03, peak: .16 * v, decay: .42 });
    } },
    tink: { n: 3, dur: .16, make(d, v) {
      const f = rnd(3600, 6200);
      tone({ t: .002, dest: d, f, peak: .09 * v, decay: .06 });
      tone({ t: .002, dest: d, f: f * 1.51, peak: .04 * v, decay: .045 });
      tone({ t: .05, dest: d, f: f * .98, peak: .03 * v, decay: .04 });
    } },
    // A rocket leaving the rack: the ignition pop and thump, then the motor's roar opening up as it tears away,
    // the hiss of the jet and the rough crackle of the burn
    rocket: { n: 3, dur: 1.9, make(d, v) {
      hiss({ t: .003, dest: d, type: 'highpass', f: 1500, attack: .0005, peak: .5 * v, decay: .02 });
      tone({ t: .003, dest: d, f: 125, f2: 38, attack: .001, peak: .7 * v, decay: .18 });
      hiss({ t: .02, dest: d, f: 480, f2: rnd(1900, 2400), q: .9, attack: .06, peak: .55 * v, decay: 1.35 });
      hiss({ t: .02, dest: d, type: 'lowpass', f: 380, f2: 170, attack: .04, peak: .45 * v, decay: 1.45 });
      hiss({ t: .03, dest: d, type: 'highpass', f: 4200, attack: .05, peak: .12 * v, decay: 1.1 });
      for (let i = 0; i < 28; i++) {
        hiss({ t: rnd(.05, 1.25), dest: d, f: rnd(1200, 3400), q: 3, attack: .0005, peak: rnd(.05, .14) * v * (1 - i / 40), decay: .008 });
      }
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
  const LIMIT = { click: 2, gear: 1, gun: 8, gunFar: 3, tink: 3, impact: 4, letter: 3, boom: 4, boomAir: 3, boomFar: 3, rocket: 4, rocketSoft: 3, ping: 2, crash: 2 };
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
    // fx: on/off gate (fxBus) feeds a perceptual volume gain (fxVol), then the master chain
    fxBus = ctx.createGain();
    fxBus.gain.value = prefs.fx ? 1 : 0;
    fxVol = ctx.createGain();
    fxVol.gain.value = volCurve(prefs.fxVol);
    fxBus.connect(fxVol);
    fxVol.connect(master);
    musicDuck = ctx.createGain();
    musicDuck.connect(master);
    // the visualiser analyser sits inline on the music chain (post-volume, pre-duck) so it reads
    // what's actually audible but isn't disturbed by the duck ride under explosions
    analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0;        // hand-rolled attack/release smoothing in the viz loop instead
    analyser.connect(musicDuck);
    // music: on/off gate (musicBus) feeds a perceptual volume gain (musicVol) - so switching music
    // back on restores the slider's level rather than snapping to full blast
    musicVol = ctx.createGain();
    musicVol.gain.value = volCurve(prefs.musicVol);
    musicVol.connect(analyser);
    musicBus = ctx.createGain();
    musicBus.gain.value = prefs.music ? 1 : 0;
    musicBus.connect(musicVol);
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

  // =========================================================
  // Nav border visualiser: reduces the music to 8 bands (log-spaced 40 Hz-12 kHz, so the split
  // reads like octaves rather than raw bin index), eases each with a fast attack and slow release
  // so it doesn't strobe, and writes the result onto the CSS custom properties the nav border
  // contract expects (see the comment above .nav[data-viz="on"] in styles.css). Only runs while
  // music is actually playing - no idle rAF loop.
  // =========================================================
  const VIZ_BANDS = 8;
  const vizLevels = new Array(VIZ_BANDS).fill(0);
  let vizLevel = 0, vizRAF = 0, vizData = null, vizEdges = null;
  function vizStep() {
    if (!bgm.playing) { stopViz(); return; }
    if (!vizData) vizData = new Uint8Array(analyser.frequencyBinCount);
    if (!vizEdges) {
      const lo = 40, hi = Math.min(ctx.sampleRate / 2, 12000);
      vizEdges = Array.from({ length: VIZ_BANDS + 1 }, (_, i) => lo * Math.pow(hi / lo, i / VIZ_BANDS));
    }
    analyser.getByteFrequencyData(vizData);
    const binHz = ctx.sampleRate / analyser.fftSize;
    let sumLevel = 0;
    for (let b = 0; b < VIZ_BANDS; b++) {
      const i0 = Math.max(0, Math.floor(vizEdges[b] / binHz));
      const i1 = Math.min(vizData.length - 1, Math.max(i0 + 1, Math.floor(vizEdges[b + 1] / binHz)));
      let sum = 0;
      for (let i = i0; i <= i1; i++) sum += vizData[i];
      const raw = sum / (i1 - i0 + 1) / 255;
      vizLevels[b] += (raw - vizLevels[b]) * (raw > vizLevels[b] ? .6 : .08);
      sumLevel += vizLevels[b];
      navEl.style.setProperty(`--nav-viz-${b}`, vizLevels[b].toFixed(3));
    }
    const rawLevel = sumLevel / VIZ_BANDS;
    vizLevel += (rawLevel - vizLevel) * (rawLevel > vizLevel ? .6 : .08);
    navEl.style.setProperty('--nav-level', vizLevel.toFixed(3));
    vizRAF = requestAnimationFrame(vizStep);
  }
  function startViz() {
    if (!navEl || !analyser || vizRAF) return;
    navEl.dataset.viz = 'on';
    vizRAF = requestAnimationFrame(vizStep);
  }
  function stopViz() {
    if (vizRAF) cancelAnimationFrame(vizRAF);
    vizRAF = 0;
    if (navEl) delete navEl.dataset.viz;
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
    get visualizing() { return !!vizRAF; },
  };


  // =========================================================
  // Soundtrack: three pieces by Sappheiros (Creative Commons BY 3.0, credited in the Credits section),
  // streamed from assets/audio and played as one playlist: the chosen song, then on through the others.
  // Each <audio> element is routed through the music bus, so the Music switch and the ducking under big
  // blasts still apply to it.
  // =========================================================
  const statusEl = { set() {} };
  const SONGS = {
    dawn: { src: 'assets/audio/dawn.mp3', name: 'Dawn', kind: 'Sappheiros' },
    embrace: { src: 'assets/audio/embrace.mp3', name: 'Embrace', kind: 'Sappheiros' },
    awake: { src: 'assets/audio/awake.mp3', name: 'Awake', kind: 'Sappheiros' },
  };
  const ORDER = Object.keys(SONGS);
  // The experience mode picks where the playlist starts
  const MODE_SONG = { peaceful: 'dawn', chaotic: 'awake' };
  if (!SONGS[prefs.track]) prefs.track = MODE_SONG[window.Mode ? window.Mode.value : 'peaceful'] || 'dawn';
  let onTrack = () => {};              // the menus repaint when the playlist moves on

  const bgm = (() => {
    const LEVEL = .55;
    const els = {};
    let cur = null, want = false, held = false;
    function element(id) {
      if (els[id]) return els[id];
      const a = new Audio();
      a.preload = 'none';
      a.src = SONGS[id].src;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      ctx.createMediaElementSource(a).connect(gain);
      gain.connect(musicBus);
      const e = { id, a, gain, timer: 0 };
      a.addEventListener('ended', () => { if (cur === e) next(); });
      a.addEventListener('waiting', () => { if (cur === e) statusEl.set(`Loading “${SONGS[id].name}”…`); });
      a.addEventListener('playing', () => statusEl.set(''));
      return (els[id] = e);
    }
    function fadeTo(e, v, dur) {
      const t = ctx.currentTime, g = e.gain.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(v, t + dur);
    }
    function begin(id) {
      const e = element(id);
      cur = e;
      clearTimeout(e.timer);
      if (e.a.ended) e.a.currentTime = 0;
      const p = e.a.play();
      if (p) p.catch(() => {});
      fadeTo(e, LEVEL, 1.6);
      startViz();
    }
    function release(e, fade) {
      fadeTo(e, 0, fade);
      clearTimeout(e.timer);
      e.timer = setTimeout(() => { if (cur !== e) e.a.pause(); }, fade * 1000 + 80);
    }
    function start() {
      want = true;
      if (held || !liveMusic() || cur) return;
      begin(prefs.track);
    }
    function stop(fade = .8) {
      want = false;
      if (!cur) return;
      const e = cur;
      cur = null;
      stopViz();
      release(e, fade);
    }
    // Change the song: the old one fades out while the new one fades in
    function switchTo(id) {
      if (!SONGS[id] || (id === prefs.track && cur)) return;
      prefs.track = id;
      if (cur) { const e = cur; cur = null; release(e, 1.1); }
      if (prefs.music) start();
    }
    // A song finished: carry on with the next one
    function next() {
      const id = ORDER[(ORDER.indexOf(cur.id) + 1) % ORDER.length];
      const e = cur;
      cur = null;
      e.gain.gain.value = 0;
      prefs.track = id;
      onTrack();
      if (want && !held && liveMusic()) begin(id);
      else stopViz();
    }
    return {
      start, stop, switchTo,
      hold(on) {
        held = on;
        if (on) { const w = want; stop(.4); want = w; }
        else setTimeout(() => { if (!held && want) start(); }, 600);
      },
      // the tab was hidden or shown again: don't let the song run on silently
      pause(on) {
        if (!cur) return;
        if (on) cur.a.pause();
        else { const p = cur.a.play(); if (p) p.catch(() => {}); }
      },
      get playing() { return !!cur; },
      get ready() { return true; },
      get track() { return prefs.track; },
      get el() { return cur && cur.a; },          // for development: the element playing right now
    };
  })();
  Sfx.bgm = bgm;
  // The mini-game used to have its own track; the playlist now simply carries on through a round
  const music = { start() {}, stop() {}, get playing() { return false; }, get ready() { return true; } };
  Sfx.music = music;
  window.Sfx = Sfx;
  // Inspection hook for development only: open the page with ?debug
  if (/[?&]debug\b/.test(location.search)) Sfx.__debug = { get ctx() { return ctx; }, get master() { return master; }, get output() { return output; }, get limiter() { return limiterNode; }, get voices() { return voices.length; }, songs: SONGS };

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
    <p class="sound-menu__status" aria-live="polite" hidden></p>
    <div class="sound-menu__vol">
      <label class="sound-menu__vol-label" for="vol-music"><b>Music volume</b><small>How loud the soundtrack plays</small></label>
      <span class="sound-menu__vol-row">
        <input type="range" min="0" max="100" id="vol-music" class="vol-slider" data-pref="musicVol" aria-label="Music volume">
        <output class="sound-menu__vol-value" for="vol-music">100</output>
      </span>
    </div>
    <div class="sound-menu__vol">
      <label class="sound-menu__vol-label" for="vol-vfx"><b>Effects volume</b><small>Engine, guns, explosions</small></label>
      <span class="sound-menu__vol-row">
        <input type="range" min="0" max="100" id="vol-vfx" class="vol-slider" data-pref="fxVol" aria-label="Effects volume">
        <output class="sound-menu__vol-value" for="vol-vfx">100</output>
      </span>
    </div>`;
  document.body.appendChild(menu);
  const status = menu.querySelector('.sound-menu__status');
  statusEl.set = text => { status.textContent = text; status.hidden = !text; };
  const boxes = [...menu.querySelectorAll('input[type="checkbox"]')];
  const sliders = [...menu.querySelectorAll('.vol-slider')];
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
  const paintVol = () => {
    sliders.forEach(s => {
      const v = prefs[s.dataset.pref];
      s.value = v;
      // Chrome draws the filled part of the track from --p (0..1); Firefox fills it natively
      // via ::-moz-range-progress. Without this the slider sits at the CSS fallback of 50%.
      s.style.setProperty('--p', (clamp(v, 0, 100) / 100).toFixed(3));
      const out = menu.querySelector(`output[for="${s.id}"]`);
      if (out) out.value = String(v);
    });
  };
  const paintMenu = () => {
    boxes.forEach(b => { b.checked = prefs[b.dataset.pref]; });
    paintVol();
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
  onTrack = paintMenu;

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
  // Volume sliders: the live gain follows the drag, the saved value only lands on release
  function setVol(key, value, persist) {
    prefs[key] = clamp(value, 0, 100);
    if (persist) { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) { /* storage blocked */ } }
    if (!ctx) return;
    const g = (key === 'musicVol') ? musicVol : fxVol;
    if (g) g.gain.setTargetAtTime(volCurve(prefs[key]), ctx.currentTime, .05);
  }
  sliders.forEach(s => {
    const out = menu.querySelector(`output[for="${s.id}"]`);
    s.addEventListener('input', () => {
      setVol(s.dataset.pref, +s.value, false);
      s.style.setProperty('--p', (clamp(+s.value, 0, 100) / 100).toFixed(3));
      if (out) out.value = s.value;
    });
    s.addEventListener('change', () => setVol(s.dataset.pref, +s.value, true));
  });
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
  }
  // The experience mode picks the song: Dawn when peaceful, Awake when chaotic. Music that is switched off stays off.
  // (The Experience control itself is a standalone nav button now, wired elsewhere - this just reacts to it.)
  addEventListener('modechange', e => {
    const id = MODE_SONG[e.detail.mode] || 'dawn';
    if (prefs.track !== id) {
      if (ctx && prefs.music) bgm.switchTo(id);
      else prefs.track = id;
      try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (err) { /* storage blocked */ }
      paintMenu();
    } else if (ctx && prefs.music) bgm.start();
  });

  function unlock() {
    if (!ctx) setup();
    const go = () => {
      prepare();
      // on the intro menu the music waits for the choice, which picks the song it starts on
      if (prefs.music && !document.querySelector('.loader.is-asking:not(.is-chosen)')) bgm.start();
    };
    if (ctx.state !== 'running') ctx.resume().then(go);
    else go();
  }
  ['pointerdown', 'keydown', 'touchend'].forEach(type => addEventListener(type, () => { if (anyOn()) unlock(); }, { capture: true, passive: true }));
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    bgm.pause(document.hidden);
    if (document.hidden) { ctx.suspend(); stopViz(); }
    else { if (anyOn()) ctx.resume(); if (bgm.playing) startViz(); }
  });
})();
