/* =========================================================
   Sound — synthesised with WebAudio, no audio files: effects, the game music and the background soundtrack.
   Browsers only allow audio after a click, tap or key press, so sound starts on the first interaction.
   The nav "Sound" button opens a small menu with separate Music and Effects switches (remembered).
   ========================================================= */
(() => {
  const AC = window.AudioContext || window.webkitAudioContext;
  const btn = document.querySelector('.sound-toggle');
  const KEY = 'hl-audio';
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const VOLUME = .85;

  const prefs = { music: true, fx: true };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved) Object.assign(prefs, saved);
    else if (localStorage.getItem('hl-sound') === 'off') prefs.music = prefs.fx = false;
  } catch (e) { /* storage blocked */ }
  let ctx = null, master = null, fxBus = null, musicBus = null, noise = null, engine = null, bg = null;
  let lastGun = 0, lastBgGun = 0;

  const anyOn = () => prefs.music || prefs.fx;
  function paintButton() {
    if (!btn) return;
    btn.classList.toggle('is-on', anyOn());
    btn.title = anyOn() ? 'Sound settings' : 'Sound is off';
  }
  if (!AC) { if (btn) btn.hidden = true; return; }
  paintButton();

  // ---------- Graph ----------
  function setup() {
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 14; comp.ratio.value = 4;
    comp.attack.value = .003; comp.release.value = .25;
    master = ctx.createGain();
    master.gain.value = VOLUME;
    master.connect(comp);
    fxBus = ctx.createGain();
    fxBus.gain.value = prefs.fx ? 1 : 0;
    fxBus.connect(master);
    musicBus = ctx.createGain();
    musicBus.gain.value = prefs.music ? 1 : 0;
    musicBus.connect(master);
    comp.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    engine = buildEngine(.16);
    bg = buildEngine(0, true);
  }

  const running = () => !!ctx && ctx.state === 'running';
  const live = () => running() && prefs.fx;
  const liveMusic = () => running() && prefs.music;

  const outlet = (pan, lowpass) => {
    const p = ctx.createStereoPanner();
    p.pan.value = clamp(pan || 0, -1, 1);
    p.connect(fxBus);
    if (!lowpass) return p;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lowpass;
    f.connect(p);
    return f;
  };
  const envelope = (g, t, attack, peak, decay) => {
    g.gain.setValueAtTime(.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(.0001, t + attack + decay);
  };
  function hiss({ t, dest, type = 'bandpass', f = 1000, f2 = 0, q = 1, attack = .002, peak = .5, decay = .1 }) {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    s.playbackRate.value = rnd(.85, 1.15);
    const flt = ctx.createBiquadFilter();
    flt.type = type;
    flt.Q.value = q;
    flt.frequency.setValueAtTime(f, t);
    if (f2) flt.frequency.exponentialRampToValueAtTime(f2, t + attack + decay);
    const g = ctx.createGain();
    envelope(g, t, attack, peak, decay);
    s.connect(flt); flt.connect(g); g.connect(dest);
    s.start(t, Math.random() * 1.5);
    s.stop(t + attack + decay + .05);
  }
  function tone({ t, dest, type = 'sine', f = 200, f2 = 0, attack = .002, peak = .5, decay = .2 }) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + attack + decay);
    const g = ctx.createGain();
    envelope(g, t, attack, peak, decay);
    o.connect(g); g.connect(dest);
    o.start(t);
    o.stop(t + attack + decay + .05);
  }

  // Radial engine: detuned saw + sub through a lowpass, pulsed at the cylinder firing rate, plus propeller wash
  function buildEngine(level, distant) {
    const out = ctx.createGain();
    out.gain.value = level;
    const pan = ctx.createStereoPanner();
    out.connect(pan);
    pan.connect(fxBus);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = distant ? 420 : 500;
    lp.Q.value = 1.5;
    const chug = ctx.createGain();
    chug.gain.value = .55;
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 14;
    const depth = ctx.createGain();
    depth.gain.value = .4;
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
    n.buffer = noise;
    n.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 500;
    bp.Q.value = .7;
    const wash = ctx.createGain();
    wash.gain.value = distant ? .25 : 0;
    n.connect(bp); bp.connect(wash); wash.connect(out);
    [lfo, o1, o2, n].forEach(s => s.start());
    if (distant) {                        // slow doppler-ish wobble for far-away planes
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
      engine.out.gain.setTargetAtTime(clamp(level, 0, 1.2) * .15, t, .15);
      engine.pan.pan.setTargetAtTime(clamp(pan * .6, -1, 1), t, .1);
    },
    // Distant drone for the background dogfight; count = planes in the air
    background(count, pan) {
      if (!live()) return;
      const t = ctx.currentTime;
      bg.out.gain.setTargetAtTime(Math.min(3, count) * .018, t, .4);
      bg.pan.pan.setTargetAtTime(clamp(pan * .5, -1, 1), t, .3);
    },
    gun(pan, far) {
      if (!live()) return;
      const t = ctx.currentTime;
      if (far) { if (t - lastBgGun < .06) return; lastBgGun = t; }
      else { if (t - lastGun < .03) return; lastGun = t; }
      const v = far ? .28 : 1;
      const dest = outlet(pan, far ? 1500 : 0);
      hiss({ t, dest, f: rnd(1300, 2000), q: .8, peak: .5 * v, decay: .07 });
      tone({ t, dest, f: 160, f2: 45, peak: .65 * v, decay: .09 });
      if (!far) hiss({ t, dest, type: 'highpass', f: 3600, peak: .16, decay: .03 });
    },
    // Brass casing landing on the podium
    tink(pan) {
      if (!live()) return;
      const t = ctx.currentTime + rnd(.22, .5);
      const dest = outlet(pan);
      const f = rnd(3600, 6200);
      tone({ t, dest, f, peak: .045, decay: .06 });
      tone({ t, dest, f: f * 1.51, peak: .02, decay: .04 });
    },
    rocket(pan, v = 1) {
      if (!live()) return;
      const t = ctx.currentTime;
      const dest = outlet(pan, v < .6 ? 1800 : 0);
      tone({ t, dest, f: 110, f2: 50, peak: .35 * v, decay: .12 });
      hiss({ t: t + .04, dest, f: 380, f2: 2600, q: 1.2, attack: .05, peak: .32 * v, decay: .85 });
    },
    boom(pan, v = 1, air = false) {
      if (!live()) return;
      const t = ctx.currentTime;
      const dest = outlet(pan, v < .45 ? 900 : 0);
      tone({ t, dest, f: air ? 95 : 75, f2: 26, peak: .9 * v, decay: air ? .8 : 1.1 });
      hiss({ t, dest, type: 'lowpass', f: 1400, f2: 120, q: .5, peak: .85 * v, decay: air ? 1.1 : 1.6 });
      for (let i = 0; i < 7; i++) {
        hiss({ t: t + rnd(.04, .7), dest, f: rnd(1800, 4200), q: 2, peak: rnd(.05, .14) * v, decay: .025 });
      }
    },
    // Two planes colliding: metal crunch before the blast
    crash(pan, v = .5) {
      if (!live()) return;
      const t = ctx.currentTime;
      const dest = outlet(pan, 2200);
      hiss({ t, dest, f: 700, q: 4, peak: .4 * v, decay: .3 });
      tone({ t, dest, type: 'square', f: 140, f2: 38, peak: .18 * v, decay: .35 });
    },
    // Bullet punching through a card
    impact(pan) {
      if (!live()) return;
      const t = ctx.currentTime;
      const dest = outlet(pan);
      hiss({ t, dest, f: 1100, q: 1.6, peak: .32, decay: .05 });
      hiss({ t: t + .01, dest, type: 'highpass', f: 2600, peak: .14, decay: .1 });
      tone({ t, dest, f: 320, f2: 110, peak: .12, decay: .06 });
    },
  };
  // ---------- Background soundtrack ----------
  // Easy-going rock over electronic drums: 100 BPM, E minor (Em C G D). A 32-bar loop:
  // intro (pad + clean guitar), verse (palm-muted chugs), chorus (open power chords + lead), bridge (half-time).
  const bgm = (() => {
    const BPM = 100, STEP = 60 / BPM / 4, BARS = 32, LEVEL = .42;
    const hz = n => 440 * Math.pow(2, (n - 69) / 12);
    const BASS = [40, 36, 43, 38];                                   // E2 C2 G2 D2
    const POWER = [52, 48, 55, 50];                                  // guitar roots
    const CHORDS = [[52, 55, 59], [48, 52, 55], [55, 59, 62], [50, 54, 57]];
    const LEAD = [
      [[0, 71, 4], [4, 74, 2], [6, 71, 2], [8, 69, 6], [14, 67, 2]],
      [[0, 67, 6], [6, 64, 2], [8, 67, 4], [12, 69, 4]],
      [[0, 71, 3], [3, 74, 3], [6, 76, 6], [12, 74, 4]],
      [[0, 69, 8], [8, 66, 4], [12, 69, 4]],
      [[0, 76, 4], [4, 74, 2], [6, 76, 2], [8, 79, 6], [14, 76, 2]],
      [[0, 74, 6], [6, 72, 2], [8, 71, 8]],
      [[0, 71, 2], [2, 74, 2], [4, 76, 4], [8, 74, 2], [10, 71, 2], [12, 69, 4]],
      [[0, 71, 12], [12, 69, 2], [14, 67, 2]],
    ];
    let bus = null, timer = 0, next = 0, step = 0, held = false, curve = null, curveHot = null, lastNote = 71;

    const driveCurve = k => {
      const n = 2048, c = new Float32Array(n);
      for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; c[i] = (1 + k) * x / (1 + k * Math.abs(x)); }
      return c;
    };
    function impulse(seconds) {
      const len = Math.floor(ctx.sampleRate * seconds);
      const ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
      }
      return ir;
    }

    function makeBus() {
      if (!curve) { curve = driveCurve(7); curveHot = driveCurve(16); }
      const out = ctx.createGain();
      out.gain.value = 0;
      out.connect(musicBus);
      const verb = ctx.createConvolver();
      verb.buffer = impulse(2.4);
      const verbOut = ctx.createGain();
      verbOut.gain.value = .32;
      verb.connect(verbOut); verbOut.connect(out);
      const send = ctx.createGain();
      send.connect(verb);
      const drums = ctx.createGain();
      drums.gain.value = .7;
      drums.connect(out);
      const duck = ctx.createGain();
      duck.connect(out);
      // guitar "amp": a gentle cabinet curve
      const cab = ctx.createBiquadFilter();
      cab.type = 'lowpass';
      cab.frequency.value = 4200;
      const mid = ctx.createBiquadFilter();
      mid.type = 'peaking';
      mid.frequency.value = 850;
      mid.gain.value = 3;
      const gtr = ctx.createGain();
      gtr.gain.value = .32;
      gtr.connect(mid); mid.connect(cab); cab.connect(duck);
      const gtrSend = ctx.createGain();
      gtrSend.gain.value = .25;
      cab.connect(gtrSend); gtrSend.connect(send);
      // lead + clean guitar echo
      const delay = ctx.createDelay(1);
      delay.delayTime.value = STEP * 3;
      const fb = ctx.createGain();
      fb.gain.value = .3;
      const damp = ctx.createBiquadFilter();
      damp.type = 'lowpass';
      damp.frequency.value = 2200;
      delay.connect(damp); damp.connect(fb); fb.connect(delay);
      damp.connect(out);
      const lead = ctx.createGain();
      lead.gain.value = .26;
      lead.connect(out); lead.connect(delay); lead.connect(send);
      return { out, send, drums, duck, gtr, lead };
    }

    // ----- drums -----
    const kick = (t, v = 1) => {
      tone({ t, dest: bus.drums, f: 135, f2: 42, attack: .001, peak: v, decay: .34 });
      hiss({ t, dest: bus.drums, type: 'highpass', f: 2500, peak: .05 * v, decay: .012 });
      bus.duck.gain.cancelScheduledValues(t);
      bus.duck.gain.setValueAtTime(.55, t);
      bus.duck.gain.linearRampToValueAtTime(1, t + .22);
    };
    const snare = (t, v = 1) => {
      hiss({ t, dest: bus.drums, type: 'highpass', f: 1500, peak: .38 * v, decay: .19 });
      hiss({ t, dest: bus.send, type: 'highpass', f: 1800, peak: .22 * v, decay: .12 });
      tone({ t, dest: bus.drums, type: 'triangle', f: 210, f2: 150, peak: .26 * v, decay: .09 });
    };
    const hat = (t, open, v = 1) => hiss({ t, dest: bus.drums, type: 'highpass', f: 8000, peak: (open ? .12 : .075) * v, decay: open ? .2 : .03 });
    const crash = (t, v = 1) => {
      hiss({ t, dest: bus.drums, type: 'highpass', f: 4800, peak: .14 * v, decay: 1.8 });
      hiss({ t, dest: bus.send, type: 'highpass', f: 4000, peak: .08 * v, decay: 1.2 });
    };

    // ----- bass, pad -----
    function bass(t, n, len, v = 1) {
      const sub = ctx.createOscillator();
      sub.frequency.value = hz(n);
      const saw = ctx.createOscillator();
      saw.type = 'sawtooth';
      saw.frequency.value = hz(n);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(700, t);
      f.frequency.exponentialRampToValueAtTime(220, t + len);
      const g = ctx.createGain();
      g.gain.setValueAtTime(.0001, t);
      g.gain.linearRampToValueAtTime(.42 * v, t + .006);
      g.gain.setTargetAtTime(.0001, t + len * .7, len * .25);
      const sg = ctx.createGain();
      sg.gain.value = .6;
      sub.connect(sg); sg.connect(g);
      saw.connect(f); f.connect(g);
      g.connect(bus.duck);
      [sub, saw].forEach(o => { o.start(t); o.stop(t + len + .3); });
    }
    function pad(t, chord, len, v = 1) {
      chord.forEach(n => [-7, 7].forEach(det => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = hz(n);
        o.detune.value = det;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 900;
        const g = ctx.createGain();
        g.gain.setValueAtTime(.0001, t);
        g.gain.linearRampToValueAtTime(.022 * v, t + len * .35);
        g.gain.linearRampToValueAtTime(.0001, t + len);
        o.connect(f); f.connect(g); g.connect(bus.duck); g.connect(bus.send);
        o.start(t);
        o.stop(t + len + .05);
      }));
    }

    // ----- guitars -----
    // Power chord through a soft overdrive; `mute` = palm-muted chug
    function power(t, root, len, mute, v = 1) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = curve;
      shaper.oversample = '2x';
      const pre = ctx.createGain();
      pre.gain.value = .5;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(mute ? 1100 : 3200, t);
      if (!mute) f.frequency.exponentialRampToValueAtTime(1800, t + len);
      const g = ctx.createGain();
      g.gain.setValueAtTime(.0001, t);
      g.gain.linearRampToValueAtTime((mute ? .5 : .6) * v, t + .005);
      if (mute) g.gain.exponentialRampToValueAtTime(.0001, t + .13);
      else { g.gain.setTargetAtTime(.35 * v, t + .05, .3); g.gain.setTargetAtTime(.0001, t + len, .08); }
      pre.connect(shaper); shaper.connect(f); f.connect(g); g.connect(bus.gtr);
      const stop = t + (mute ? .16 : len + .4);
      [0, 7, 12].forEach((iv, k) => [-6, 6].forEach(det => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = hz(root + iv);
        o.detune.value = det;
        // a real strum: strings a few ms apart
        o.connect(pre);
        o.start(t + k * (mute ? 0 : .008));
        o.stop(stop);
      }));
    }
    function clean(t, n, v = 1) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = hz(n);
      const o2 = ctx.createOscillator();
      o2.frequency.value = hz(n + 12);
      const g = ctx.createGain();
      envelope(g, t, .003, .1 * v, .55);
      const g2 = ctx.createGain();
      g2.gain.value = .35;
      o.connect(g); o2.connect(g2); g2.connect(g);
      g.connect(bus.lead);
      [o, o2].forEach(x => { x.start(t); x.stop(t + .62); });
    }
    // Singing lead: overdrive, slide into the note, vibrato once it settles
    function leadNote(t, n, len, v = 1) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = curveHot;
      shaper.oversample = '2x';
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 2600;
      f.Q.value = 1.5;
      const g = ctx.createGain();
      g.gain.setValueAtTime(.0001, t);
      g.gain.linearRampToValueAtTime(.3 * v, t + .025);
      g.gain.setTargetAtTime(.22 * v, t + .06, .2);
      g.gain.setTargetAtTime(.0001, t + len - .04, .06);
      const vib = ctx.createOscillator();
      vib.frequency.value = 5.4;
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(0, t + Math.min(.2, len * .4));
      depth.gain.linearRampToValueAtTime(hz(n) * .012, t + Math.min(.45, len * .8));
      vib.connect(depth);
      [0, 5].forEach((det, k) => {
        const o = ctx.createOscillator();
        o.type = k ? 'square' : 'sawtooth';
        o.detune.value = det;
        o.frequency.setValueAtTime(hz(lastNote), t);
        o.frequency.exponentialRampToValueAtTime(hz(n), t + .05);
        depth.connect(o.frequency);
        o.connect(shaper);
        o.start(t);
        o.stop(t + len + .3);
      });
      shaper.connect(f); f.connect(g); g.connect(bus.lead);
      vib.start(t);
      vib.stop(t + len + .3);
      lastNote = n;
    }

    function play(s, t) {
      const bar = Math.floor(s / 16) % BARS, i = s % 16, c = bar % 4;
      const intro = bar < 8, verse = bar >= 8 && bar < 16, chorus = bar >= 16 && bar < 24, bridge = bar >= 24;
      // drums
      if (intro) {
        if (i === 0 || i === 8) kick(t, .75);
        if (i % 2 === 0 && bar >= 2) hat(t, false, .8);
        if (bar === 7 && i >= 12) snare(t, .3 + (i - 12) * .1);
      } else if (verse || chorus) {
        if (i === 0 || i === 8 || (i === 10 && c % 2) || (chorus && i === 6)) kick(t);
        if (i === 4 || i === 12) snare(t);
        if (chorus) hat(t, i % 4 === 2, i % 2 ? .6 : 1);
        else if (i % 2 === 0) hat(t, false, i % 4 ? .7 : 1);
        if (i === 0 && (bar === 8 || bar === 16 || bar === 20)) crash(t);
        if ((bar === 15 || bar === 23) && i >= 12) snare(t, .5 + (i - 12) * .12);
      } else if (bridge) {
        if (i === 0) kick(t, .85);
        if (i === 8) snare(t, .8);
        if (i % 4 === 2) hat(t, false, .7);
        if (bar === 31 && i >= 8 && i % 2 === 0) snare(t, .4 + (i - 8) * .08);
        if (bar === 31 && i >= 12) kick(t, .6);
      }
      // bass
      if (intro || bridge) { if (i === 0 || i === 8) bass(t, BASS[c], STEP * 7.5, .85); }
      else if (i % 2 === 0) bass(t, BASS[c] + (chorus && i % 4 === 2 ? 12 : 0), STEP * 1.7);
      // pad
      if ((intro || bridge) && i === 0) pad(t, CHORDS[c], STEP * 16);
      // guitars
      if ((intro || bridge) && i % 2 === 0 && bar !== 31) {
        const pattern = [0, 1, 2, 1, 2, 1, 0, 2][i / 2];
        clean(t, CHORDS[c][pattern] + 12, intro ? .9 : .7);
      }
      if (verse && i % 2 === 0 && i !== 4 && i !== 12) power(t, POWER[c], 0, true, i === 0 ? 1 : .8);
      if (verse && (i === 4 || i === 12)) power(t, POWER[c], 0, true, .6);
      if (chorus && (i === 0 || i === 6 || i === 10)) power(t, POWER[c], STEP * (i === 10 ? 5.5 : i === 0 ? 5.5 : 3.5), false);
      // lead: chorus, and a softer reprise over the bridge
      if (chorus || bridge) {
        LEAD[bar % 8].forEach(([at, n, len]) => { if (at === i) leadNote(t, n - (bridge ? 12 : 0) + 12, STEP * len, bridge ? .7 : 1); });
      }
    }

    function schedule() {
      if (!ctx || !bus) return;
      while (next < ctx.currentTime + .2) {
        play(step, next);
        next += STEP;
        step++;
      }
    }

    function start() {
      if (bus || held || !liveMusic()) return;
      bus = makeBus();
      step = 0;
      next = ctx.currentTime + .15;
      bus.out.gain.setValueAtTime(0, ctx.currentTime);
      bus.out.gain.linearRampToValueAtTime(LEVEL, ctx.currentTime + 2.5);
      schedule();
      timer = setInterval(schedule, 30);
    }
    function stop(fade = .8) {
      clearInterval(timer);
      timer = 0;
      if (!bus || !ctx) return;
      const old = bus;
      bus = null;
      const t = ctx.currentTime;
      old.out.gain.cancelScheduledValues(t);
      old.out.gain.setValueAtTime(old.out.gain.value, t);
      old.out.gain.linearRampToValueAtTime(0, t + fade);
      setTimeout(() => old.out.disconnect(), fade * 1000 + 400);
    }
    return {
      start, stop,
      // the game music takes over while a round runs
      hold(on) {
        held = on;
        if (on) stop(.4);
        else setTimeout(() => { if (!held) start(); }, 1600);
      },
      get playing() { return !!bus; },
    };
  })();
  Sfx.bgm = bgm;

  // ---------- Game music: drum machine + bass + arpeggio, 125 BPM, A minor ----------
  // One bar of count-in (kick, snare roll, riser) and then the groove; scheduled a little ahead of time.
  const music = (() => {
    const BPM = 125, STEP = 60 / BPM / 4;
    const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];   // Am  F  C  G
    const ROOTS = [33, 29, 36, 31];
    const hz = n => 440 * Math.pow(2, (n - 69) / 12);
    let bus = null, timer = 0, next = 0, step = 0;

    function makeBus() {
      const out = ctx.createGain();
      out.gain.value = .9;
      out.connect(musicBus);
      const drums = ctx.createGain();
      drums.gain.value = .75;
      drums.connect(out);
      const duck = ctx.createGain();            // side-chained to the kick
      duck.connect(out);
      const synth = ctx.createGain();
      synth.gain.value = .5;
      synth.connect(duck);
      const delay = ctx.createDelay(1);
      delay.delayTime.value = STEP * 3;
      const fb = ctx.createGain();
      fb.gain.value = .32;
      const damp = ctx.createBiquadFilter();
      damp.type = 'lowpass';
      damp.frequency.value = 2400;
      delay.connect(damp); damp.connect(fb); fb.connect(delay); damp.connect(duck);
      return { out, drums, duck, synth, delay };
    }

    const kick = (t, v = 1) => {
      tone({ t, dest: bus.drums, f: 160, f2: 40, attack: .001, peak: 1.1 * v, decay: .3 });
      hiss({ t, dest: bus.drums, type: 'highpass', f: 3000, peak: .08 * v, decay: .012 });
      bus.duck.gain.cancelScheduledValues(t);
      bus.duck.gain.setValueAtTime(.3, t);
      bus.duck.gain.linearRampToValueAtTime(1, t + .2);
    };
    const snare = (t, v = 1) => {
      hiss({ t, dest: bus.drums, type: 'highpass', f: 1400, peak: .45 * v, decay: .15 });
      tone({ t, dest: bus.drums, type: 'triangle', f: 230, f2: 150, peak: .28 * v, decay: .08 });
    };
    const clap = t => {
      for (let i = 0; i < 3; i++) hiss({ t: t + i * .011, dest: bus.drums, f: 1500, q: 1.1, peak: .32, decay: .03 });
      hiss({ t: t + .033, dest: bus.drums, f: 1300, q: .9, peak: .3, decay: .18 });
    };
    const hat = (t, open, v = 1) => hiss({ t, dest: bus.drums, type: 'highpass', f: 7800, peak: (open ? .16 : .1) * v, decay: open ? .17 : .035 });
    const crash = t => hiss({ t, dest: bus.drums, type: 'highpass', f: 5200, peak: .2, decay: 1.4 });

    function bass(t, n, len) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = hz(n);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.Q.value = 6;
      f.frequency.setValueAtTime(900, t);
      f.frequency.exponentialRampToValueAtTime(160, t + len);
      const g = ctx.createGain();
      envelope(g, t, .004, .55, len);
      o.connect(f); f.connect(g); g.connect(bus.synth);
      o.start(t);
      o.stop(t + len + .05);
    }
    function pluck(t, n, v, bright) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = hz(n);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.Q.value = 4;
      f.frequency.setValueAtTime(bright, t);
      f.frequency.exponentialRampToValueAtTime(500, t + .14);
      const g = ctx.createGain();
      envelope(g, t, .002, v, .16);
      o.connect(f); f.connect(g); g.connect(bus.synth); g.connect(bus.delay);
      o.start(t);
      o.stop(t + .22);
    }
    function stab(t, chord) {
      chord.forEach(n => {
        [-8, 8].forEach(det => {
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = hz(n + 12);
          o.detune.value = det;
          const f = ctx.createBiquadFilter();
          f.type = 'lowpass';
          f.frequency.setValueAtTime(3200, t);
          f.frequency.exponentialRampToValueAtTime(700, t + .25);
          const g = ctx.createGain();
          envelope(g, t, .004, .06, .28);
          o.connect(f); f.connect(g); g.connect(bus.synth);
          o.start(t);
          o.stop(t + .35);
        });
      });
    }

    function play(s, t) {
      const bar = Math.floor(s / 16), i = s % 16;
      if (bar === 0) {                                   // count-in
        if (i % 4 === 0) kick(t, .9);
        if (i >= 8) snare(t, .25 + (i - 8) * .07);
        if (i === 0) hiss({ t, dest: bus.drums, f: 300, f2: 5000, q: 2, attack: STEP * 15, peak: .22, decay: .05 });
        return;
      }
      const c = (bar - 1) % 4, chord = CHORDS[c];
      if (i === 0 && c === 0) crash(t);
      if (i % 4 === 0) kick(t);
      if (i === 14 && c === 3) kick(t, .7);
      if (i === 4 || i === 12) clap(t);
      if (i % 4 === 2) hat(t, true);
      else hat(t, false, i % 2 ? .7 : 1);
      if (i % 2 === 0) bass(t, ROOTS[c] + (i % 4 === 2 ? 12 : 0), STEP * 1.8);
      if (bar >= 3) {
        const up = [0, 1, 2, 1, 2, 0, 2, 1][i % 8];
        pluck(t, chord[up] + (i % 8 >= 4 ? 12 : 0) + 12, .09, 1500 + (bar % 8) * 350);
      }
      if (bar >= 5 && (i === 0 || i === 3 || i === 6 || i === 10)) stab(t, chord);
      if (bar >= 9 && i % 8 === 7) snare(t, .35);
    }

    function schedule() {
      if (!ctx || !bus) return;
      while (next < ctx.currentTime + .15) {
        play(step, next);
        next += STEP;
        step++;
      }
    }

    return {
      start() {
        this.stop(true);
        bgm.hold(true);
        if (!liveMusic()) return;
        bus = makeBus();
        step = 0;
        next = ctx.currentTime + .06;
        schedule();
        timer = setInterval(schedule, 25);
      },
      stop(now) {
        clearInterval(timer);
        timer = 0;
        if (!now) bgm.hold(false);
        if (!bus || !ctx) return;
        const old = bus;
        bus = null;
        const t = ctx.currentTime;
        old.out.gain.cancelScheduledValues(t);
        old.out.gain.setValueAtTime(old.out.gain.value, t);
        old.out.gain.linearRampToValueAtTime(0, t + (now ? .05 : .45));
        setTimeout(() => old.out.disconnect(), 800);
      },
      get playing() { return !!bus; },
    };
  })();
  Sfx.music = music;

  // Countdown beep (the GO beep is higher and longer)
  Sfx.beep = go => {
    if (!live()) return;
    const t = ctx.currentTime, dest = outlet(0);
    tone({ t, dest, type: 'square', f: go ? 1320 : 880, peak: .09, decay: go ? .35 : .12 });
    tone({ t, dest, f: go ? 660 : 440, peak: .12, decay: go ? .35 : .12 });
  };
  // Last seconds of the round
  Sfx.tick = () => {
    if (!live()) return;
    tone({ t: ctx.currentTime, dest: outlet(0), type: 'triangle', f: 1760, peak: .08, decay: .05 });
  };
  // Victory jingle
  Sfx.fanfare = () => {
    if (!live()) return;
    const t = ctx.currentTime + .1, dest = outlet(0);
    const hzOf = n => 440 * Math.pow(2, (n - 69) / 12);
    [72, 76, 79, 84].forEach((n, i) => {
      tone({ t: t + i * .12, dest, type: 'square', f: hzOf(n), peak: .07, decay: .16 });
      tone({ t: t + i * .12, dest, type: 'triangle', f: hzOf(n) / 2, peak: .1, decay: .18 });
    });
    [72, 76, 79, 84, 88].forEach(n => tone({ t: t + .5, dest, type: 'sawtooth', f: hzOf(n), attack: .02, peak: .035, decay: 1.2 }));
    hiss({ t: t + .5, dest, type: 'highpass', f: 5000, peak: .2, decay: 1.3 });
    tone({ t: t + .5, dest, f: 130, f2: 60, peak: .5, decay: .3 });
  };
  // Enemy bullet glancing off our plane
  Sfx.ping = pan => {
    if (!live()) return;
    const t = ctx.currentTime, dest = outlet(pan);
    tone({ t, dest, f: rnd(2200, 3200), f2: rnd(700, 1000), peak: .09, decay: .2 });
    hiss({ t, dest, f: 2600, q: 3, peak: .12, decay: .03 });
  };
  // Small UI blip (the pilot's question popping up)
  Sfx.ui = () => {
    if (!live()) return;
    const t = ctx.currentTime, dest = outlet(0);
    tone({ t, dest, f: 990, peak: .06, decay: .06 });
    tone({ t: t + .07, dest, f: 1480, peak: .05, decay: .09 });
  };
  window.Sfx = Sfx;

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
    </label>`;
  document.body.appendChild(menu);
  const boxes = [...menu.querySelectorAll('input')];
  const paintMenu = () => boxes.forEach(b => { b.checked = prefs[b.dataset.pref]; });
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

  let menuOpen = false;
  function openMenu(on) {
    menuOpen = on;
    menu.classList.toggle('is-open', on);
    if (btn) btn.setAttribute('aria-expanded', String(on));
    if (on && btn) {
      const r = btn.getBoundingClientRect();
      menu.style.top = `${Math.round(r.bottom + 12)}px`;
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
  });
  addEventListener('keydown', e => { if (e.key === 'Escape' && menuOpen) openMenu(false); });
  addEventListener('resize', () => { if (menuOpen) openMenu(true); });

  function unlock() {
    if (!ctx) setup();
    if (ctx.state !== 'running') ctx.resume().then(() => { if (prefs.music) bgm.start(); });
    else if (prefs.music) bgm.start();
  }
  ['pointerdown', 'keydown', 'touchend'].forEach(type => addEventListener(type, () => { if (anyOn()) unlock(); }, { capture: true, passive: true }));
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend();
    else if (anyOn()) ctx.resume();
  });
})();
