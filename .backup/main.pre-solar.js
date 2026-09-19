/* =========================================================
   UI + shared flight timeline
   Flight.state is read every frame by plane.js

   The page is a pinned stage: every section sits fixed in the viewport. Scrolling parks the plane
   on a section, then flies it to the next one. While it flies, the section it leaves slides out
   sideways into a burner at its outer edge and turns to ash; the next one assembles out of the
   burner on the other side. A section taller than the screen scrolls inside its column while parked.
   ========================================================= */
(() => {
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

  const main = $('main');
  const nav = $('.nav');
  const sections = $$('.panel');
  const ids = sections.map(s => s.id);
  const contents = sections.map(s => s.querySelector('.panel__content'));
  // Each section's content sits in a clip window whose outer edge is the burner line, so sliding out
  // is a pure compositor move (no per-frame clip-path repaint)
  contents.forEach(el => {
    const w = document.createElement('div');
    w.className = 'panel__clip';
    el.parentNode.insertBefore(w, el);
    w.appendChild(el);
  });
  // Living borders: a conic gradient spun by the compositor inside a hairline mask
  const edged = $$('.card, .polaroid, .more__list li');
  edged.forEach(el => el.insertAdjacentHTML('beforeend', '<i class="edge" aria-hidden="true"><i></i></i>'));
  function sizeEdges() {
    edged.forEach(el => {
      const d = Math.ceil(Math.hypot(el.offsetWidth, el.offsetHeight)) + 6;
      if (el._edgeD !== d) { el._edgeD = d; el.lastElementChild.style.setProperty('--d', `${d}px`); }
    });
  }
  let maxScroll = 1;

  // ---------- Flight timeline ----------
  // Each section is parked over a scroll range [rests[i], restEnds[i]] (longer than zero only when its
  // content is taller than the screen). Between two parked ranges the plane flies; `e` is the eased
  // 0→1 progress of that flight.
  const Flight = window.Flight = {
    sections,
    sides: sections.map(s => s.dataset.side),
    rests: [],
    restEnds: [],
    hop: 800,
    settled: -1,               // section that is parked and fully assembled (-1 while anything moves)
    live: sections.map(() => false),
    state: { y: scrollY, from: 0, to: 0, e: 0, t: 0, velocity: 0 },
  };

  const easeInOutSine = t => -(Math.cos(Math.PI * t) - 1) / 2;

  // ---------- Stage layout ----------
  // gutter | content | gutter | podium | gutter (mirrored on right-hand sections).
  // The podium's on-screen size follows the 3D camera (35° fov, 14.07 away) and plane.js's
  // scale rule and PODIUM_R, so the content column gets exactly what's left.
  function stageLayout() {
    const W = innerWidth, H = innerHeight;
    const root = document.documentElement.style;
    const mobile = W < 860;
    const halfW = Math.tan(17.5 * Math.PI / 180) * Math.hypot(1.4, 14) * W / H;
    const scale = mobile ? clamp(halfW / 3.6, .45, .8) : clamp(halfW / 5.4, .8, 1.75);
    const D = 2.0 * scale / halfW * W * 1.12;      // + rim, bevel and perspective
    const G = Math.round(clamp(W * .05, 20, 100));
    const col = Math.round(Math.max(320, W - 3 * G - D));
    Flight.layout = { scale, rx: (W - G - D / 2) / W * 2 - 1, gutter: G, col, podium: D, mobile };
    if (mobile) ['--col', '--hero-col', '--gutter'].forEach(k => root.removeProperty(k));
    else {
      root.setProperty('--gutter', `${G}px`);
      root.setProperty('--col', `${col}px`);
      root.setProperty('--hero-col', `${col}px`);
    }
  }
  stageLayout();

  function timeline(y) {
    const a = Flight.rests, b = Flight.restEnds, n = a.length;
    if (!n || y <= b[0]) return { from: 0, to: 0, e: 0, t: 0 };
    if (y >= a[n - 1]) return { from: n - 1, to: n - 1, e: 0, t: 0 };
    let i = 0;
    while (i < n - 1 && y >= a[i + 1]) i++;
    if (y <= b[i]) return { from: i, to: i, e: 0, t: 0 };
    const t = clamp((y - b[i]) / (a[i + 1] - b[i]), 0, 1);
    return { from: i, to: i + 1, e: easeInOutSine(clamp((t - .04) / .92, 0, 1)), t };
  }

  // ---------- Smooth scrolling ----------
  const lenis = window.Lenis && !reduced
    ? new window.Lenis({ lerp: .1, wheelMultiplier: .9, smoothWheel: true, syncTouch: false })
    : null;
  const currentScroll = () => (lenis ? lenis.scroll : window.scrollY);
  // A nav jump across two or more sections is one continuous flight (plane.js flies it); the page
  // scroll stays put until the plane lands, then snaps to the destination.
  const jump = Flight.jump = { active: false, id: 0, from: 0, to: 0, p: 0, y: 0, t0: 0, dur: 1 };
  function startJump(from, to) {
    jump.id++;
    jump.active = true;
    jump.from = from;
    jump.to = to;
    jump.p = 0;
    jump.t0 = lastT;
    jump.dur = clamp(13.5 + Math.abs(to - from) * .25, 14, 15) * 1000;
    jump.y = Flight.rests[from];
    if (lenis) lenis.stop();
  }
  function endJump() {
    jump.active = false;
    const y = Flight.rests[jump.to];
    if (lenis) {
      lenis.start();
      lenis.scrollTo(y, { immediate: true, force: true });
    } else window.scrollTo(0, y);
    lastY = y;
  }

  Flight.lock = on => {
    if (lenis) { if (on) lenis.stop(); else lenis.start(); }
    document.documentElement.classList.toggle('is-game', on);
  };

  // Nav jumps: steady cruise through every section on the way, with gentle ramps at the start and end
  const RAMP = .2;
  const easeCruise = t => {
    const v = 1 / (1 - RAMP);
    if (t < RAMP) return v * t * t / (2 * RAMP);
    if (t > 1 - RAMP) return 1 - v * (1 - t) * (1 - t) / (2 * RAMP);
    return v * (t - RAMP / 2);
  };
  // One hop from a podium: the middle of the flight, where the rockets go in, runs in slow motion (x SLOW);
  // take-off and landing keep their old pace. A time-warp of the old sine ease, sampled into a table.
  const HOP_OLD = 5.2, SLOW = 1.85;
  const hopWarp = (() => {
    const N = 400, tNew = new Float64Array(N + 1);
    const bump = x => smooth(.24, .36, x) * (1 - smooth(.58, .67, x));
    for (let i = 1; i <= N; i++) {
      const x = (i - .5) / N;
      tNew[i] = tNew[i - 1] + (1 + (SLOW - 1) * bump(x)) / N;
    }
    const total = tNew[N];
    return {
      duration: HOP_OLD * total,
      ease: p => {
        const t = clamp(p, 0, 1) * total;
        let lo = 0, hi = N;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tNew[m] < t) lo = m; else hi = m; }
        const f = (t - tNew[lo]) / Math.max(1e-9, tNew[hi] - tNew[lo]);
        return easeInOutSine((lo + f) / N);
      },
    };
  })();
  // The section the page is resting on. A stray wheel tick, trackpad inertia or a sideways podium spin can
  // leave the scroll a little off its rest, which still counts as resting there; -1 only when really in flight.
  function restingAt(y) {
    const a = Flight.rests, e = Flight.restEnds;
    let best = -1, d = Infinity;
    for (let k = 0; k < a.length; k++) {
      const dist = y < a[k] ? a[k] - y : y > e[k] ? y - e[k] : 0;
      if (dist < d) { d = dist; best = k; }
    }
    return d <= Flight.hop * .3 ? best : -1;
  }
  let pendingGo = -1;
  function goTo(id, instant) {
    const i = typeof id === 'number' ? id : ids.indexOf(id);
    if (i < 0 || jump.active) return;
    if (Flight.onNavigate) Flight.onNavigate();
    pendingGo = -1;
    const target = Flight.rests[i];
    const y = currentScroll();
    const tl = timeline(y);
    const parked = restingAt(y);
    const canJump = !instant && lenis && !document.body.classList.contains('no-webgl');
    if (canJump && parked >= 0 && Math.abs(i - parked) >= 2) {
      startJump(parked, i);
      return;
    }
    // Asked for a far section in mid-flight: land on the nearest podium first, then make the long jump from there
    if (canJump && parked < 0) {
      const near = clamp(Math.round(tl.from + tl.e), 0, ids.length - 1);
      if (Math.abs(i - near) >= 2) {
        pendingGo = i;
        lenis.scrollTo(Flight.rests[near], {
          duration: 1.6, easing: easeInOutSine,
          onComplete: () => { if (pendingGo === i) { pendingGo = -1; goTo(i); } },
        });
        return;
      }
    }
    if (lenis) {
      if (instant) { lenis.scrollTo(target, { immediate: true, force: true }); return; }
      const hops = Math.abs(i - (tl.from + tl.e));
      if (parked >= 0 && Math.abs(i - parked) === 1) {
        lenis.scrollTo(target, { duration: hopWarp.duration, easing: hopWarp.ease });
        return;
      }
      // mid-flight: a slow, film-like flight; longer moves cruise
      const duration = hops <= 1.2 ? clamp(2.2 + hops * 3, 2.6, 5.4) : clamp(1.6 + hops * 2.6, 3, 16);
      lenis.scrollTo(target, { duration, easing: hops > 1.2 ? easeCruise : easeInOutSine });
    } else {
      window.scrollTo({ top: target, behavior: reduced || instant ? 'auto' : 'smooth' });
    }
  }
  Flight.goTo = goTo;
  $$('[data-goto]').forEach(el => el.addEventListener('click', e => {
    e.preventDefault();
    goTo(el.dataset.goto);
  }));

  // ---------- Rotation buttons (nav links) ----------
  $$('[data-rot]').forEach(a => {
    const label = a.textContent.trim();
    a.classList.add('rot');
    a.setAttribute('aria-label', label);
    a.innerHTML = `<span class="rot__sizer">${label}</span>`
      + '<span class="rot__space" aria-hidden="true">'
      + `<span class="rot__arm rot__arm--1"><span>${label}</span></span>`
      + '<span class="rot__arm rot__arm--2"><i class="rot__fill"></i></span>'
      + `<span class="rot__arm rot__arm--3"><span>${label}</span></span>`
      + '</span>';
  });

  // ---------- Day / night theme ----------
  const Theme = window.Theme = (() => {
    const KEY = 'hl-theme';
    const root = document.documentElement;
    const btn = $('.theme-toggle');
    const meta = $('meta[name="theme-color"]');
    const stars = $('.bg__stars');
    let night = root.dataset.theme === 'night';

    function drawStars() {
      if (!stars || stars.dataset.ready) return;
      stars.dataset.ready = '1';
      $$('i', stars).forEach((layer, k) => {
        const S = 900;
        const c = document.createElement('canvas');
        c.width = c.height = S;
        const g = c.getContext('2d');
        for (let i = 0; i < (k ? 70 : 240); i++) {
          const x = Math.random() * S, y = Math.random() * S;
          const r = k ? rnd(.8, 1.7) : rnd(.35, .9);
          const tint = Math.random() < .2 ? '255,214,170' : Math.random() < .3 ? '190,210,255' : '240,242,255';
          if (k) {
            const glow = g.createRadialGradient(x, y, 0, x, y, r * 5);
            glow.addColorStop(0, `rgba(${tint},.35)`);
            glow.addColorStop(1, `rgba(${tint},0)`);
            g.fillStyle = glow;
            g.fillRect(x - r * 5, y - r * 5, r * 10, r * 10);
          }
          g.fillStyle = `rgba(${tint},${rnd(.45, 1)})`;
          g.beginPath();
          g.arc(x, y, r, 0, Math.PI * 2);
          g.fill();
        }
        layer.style.backgroundImage = `url(${c.toDataURL()})`;
      });
    }
    function paint() {
      if (btn) {
        btn.setAttribute('aria-pressed', String(night));
        btn.setAttribute('aria-label', night ? 'Switch to day mode' : 'Switch to night mode');
        btn.title = night ? 'Day mode' : 'Night mode';
      }
      if (meta) meta.content = night ? '#07090F' : '#F3E8D6';
      if (night) drawStars();
    }
    function apply(next) {
      night = next;
      root.dataset.theme = next ? 'night' : 'day';
      try { localStorage.setItem(KEY, root.dataset.theme); } catch (e) { /* storage blocked */ }
      paint();
      dispatchEvent(new CustomEvent('themechange', { detail: { night } }));
    }
    // The sky changes behind the page (CSS: the sun climbs away, the moon rises out of the distance) while the page
    // itself cross-fades in place. Only the visible layers are captured for the cross-fade; the sky and the 3D scene
    // are not captured at all, so they keep animating live underneath.
    let vtBusy = false;
    function toggle() {
      const next = !night;
      if (window.Sfx && window.Sfx.ui) window.Sfx.ui();
      if (reduced || !document.startViewTransition || vtBusy) { apply(next); return; }
      const named = [...$$('.panel.is-live'), $('.nav'), $('.hud'), $('.rail'), $('.nav-score'), $('.podium-hint'), $('.cursor')]
        .filter(el => el && el.getClientRects().length);
      named.forEach((el, k) => { el.style.viewTransitionName = `theme-${k}`; });
      root.classList.add('theme-vt');
      vtBusy = true;
      let vt;
      try { vt = document.startViewTransition(() => apply(next)); } catch (e) { vt = null; }
      const done = () => {
        vtBusy = false;
        named.forEach(el => { el.style.viewTransitionName = ''; });
        root.classList.remove('theme-vt');
      };
      if (vt) {
        // a skipped transition (e.g. the tab was hidden) rejects its promises: nothing to animate, just tidy up
        const quiet = () => {};
        vt.ready.catch(quiet);
        if (vt.updateCallbackDone) vt.updateCallbackDone.catch(quiet);
        vt.finished.catch(quiet).finally(done);
      }
      else { done(); apply(next); }
    }
    if (btn) btn.addEventListener('click', toggle);
    paint();
    return { get night() { return night; }, toggle };
  })();

  // ---------- Nav progress: traces the notch outline, fillet to fillet ----------
  const navRing = (() => {
    const svg = $('.nav__ring');
    const track = $('.nav__ring-track');
    const fill = $('.nav__ring-fill');
    const glow = $('.nav__ring-glow');
    const head = $('.nav__ring-head');
    let length = 1, value = 0, samples = null;
    function draw() {
      const w = nav.clientWidth, h = nav.clientHeight;
      if (!w || !h) return;
      const F = parseFloat(getComputedStyle(nav).getPropertyValue('--fillet')) || 24;
      const R = parseFloat(getComputedStyle(nav).borderBottomLeftRadius) || 30;
      const i = 1.1;
      const L = F + i, Rt = F + w - i, B = h - i;
      // down the left fillet, along the bottom, up the right fillet
      const d = `M 0 ${i} A ${F} ${F} 0 0 1 ${L} ${F} L ${L} ${B - R} A ${R - i} ${R - i} 0 0 0 ${L + R - i} ${B} `
        + `L ${Rt - R + i} ${B} A ${R - i} ${R - i} 0 0 0 ${Rt} ${B - R} L ${Rt} ${F} A ${F} ${F} 0 0 1 ${w + 2 * F} ${i}`;
      svg.setAttribute('viewBox', `0 0 ${w + 2 * F} ${h}`);
      [track, fill, glow].forEach(p => p.setAttribute('d', d));
      length = fill.getTotalLength();
      // sample the outline once, so the moving head never has to query the SVG (which forces a layout)
      const N = 400;
      samples = new Float32Array((N + 1) * 2);
      for (let k = 0; k <= N; k++) {
        const pt = fill.getPointAtLength(k / N * length);
        samples[k * 2] = pt.x;
        samples[k * 2 + 1] = pt.y;
      }
      set(value);
    }
    function set(p) {
      value = p;
      const on = p > .0005 ? 1 : 0;
      fill.style.strokeDashoffset = glow.style.strokeDashoffset = 1 - p;
      fill.style.opacity = on;
      glow.style.opacity = on * .35;
      if (samples) {
        const N = samples.length / 2 - 1, f = p * N, k = Math.min(N - 1, Math.floor(f)), u = f - k;
        head.setAttribute('cx', (samples[k * 2] + (samples[k * 2 + 2] - samples[k * 2]) * u).toFixed(1));
        head.setAttribute('cy', (samples[k * 2 + 1] + (samples[k * 2 + 3] - samples[k * 2 + 1]) * u).toFixed(1));
      }
      head.style.opacity = p > .0005 && p < .9995 ? 1 : 0;
    }
    new ResizeObserver(draw).observe(nav);
    draw();
    return { set, draw };
  })();

  // ---------- Score pill: top-right corner, dropped below the notch when they would touch ----------
  const scorePill = $('.nav-score');
  function placeScore() {
    if (!scorePill || scorePill.hidden) return;
    const n = nav.getBoundingClientRect();
    const fillet = parseFloat(getComputedStyle(nav).getPropertyValue('--fillet')) || 24;
    const left = innerWidth - 18 - scorePill.offsetWidth;
    scorePill.classList.toggle('is-low', left < n.left + nav.offsetWidth + fillet + 12);
  }
  if (scorePill) {
    new MutationObserver(placeScore).observe(scorePill, { attributes: true, attributeFilter: ['hidden'] });
    new ResizeObserver(placeScore).observe(nav);
    addEventListener('resize', placeScore);
  }

  // ---------- Embers & ash (one canvas for every burn) ----------
  const embers = window.Embers = (() => {
    const canvas = $('#embers');
    const ctx = canvas.getContext('2d');
    const parts = [];
    const glows = [];
    let dpr = 1, dirty = false;
    function size() {
      dpr = Math.min(devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(innerWidth * dpr);
      canvas.height = Math.round(innerHeight * dpr);
    }
    size();
    addEventListener('resize', size);
    const sprite = (w, h, paint) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      paint(c.getContext('2d'));
      return c;
    };
    const dot = sprite(48, 48, g => {
      const gr = g.createRadialGradient(24, 24, 0, 24, 24, 24);
      gr.addColorStop(0, 'rgba(255,240,200,1)');
      gr.addColorStop(.2, 'rgba(255,160,70,.95)');
      gr.addColorStop(.55, 'rgba(225,85,35,.3)');
      gr.addColorStop(1, 'rgba(200,60,20,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 48, 48);
    });
    // The burner line: bright core, soft orange bloom, fading at both ends (drawn upright for the side burners)
    const line = sprite(40, 256, g => {
      const v = g.createLinearGradient(0, 0, 40, 0);
      v.addColorStop(0, 'rgba(255,120,40,0)');
      v.addColorStop(.4, 'rgba(255,140,50,.45)');
      v.addColorStop(.5, 'rgba(255,228,165,1)');
      v.addColorStop(.6, 'rgba(255,140,50,.45)');
      v.addColorStop(1, 'rgba(255,120,40,0)');
      g.fillStyle = v;
      g.fillRect(0, 0, 40, 256);
      g.globalCompositeOperation = 'destination-in';
      const h = g.createLinearGradient(0, 0, 0, 256);
      h.addColorStop(0, 'rgba(0,0,0,0)');
      h.addColorStop(.1, 'rgba(0,0,0,1)');
      h.addColorStop(.9, 'rgba(0,0,0,1)');
      h.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = h;
      g.fillRect(0, 0, 40, 256);
    });
    // push: sideways drift (px/s), so ash follows the direction the block is moving
    function spawn(x, y, reverse, push = 0) {
      if (reduced || parts.length > 420) return;
      const ember = Math.random() < .45;
      parts.push({
        x, y, ember,
        vx: rnd(-22, 22) + push * rnd(.3, 1),
        vy: rnd(-120, -40) * (reverse ? -.3 : 1),
        life: 0, max: rnd(.8, 1.9),
        size: ember ? rnd(5, 13) : rnd(1.5, 3.6),
        rot: rnd(0, 6.3), vr: rnd(-5, 5), seed: rnd(0, 10),
      });
    }
    // Upright burner line at x, from y0 to y1
    function glowV(x, y0, y1, strength) {
      if (!reduced && strength > .02 && y1 > y0 + 4) glows.push(x, y0, y1, strength);
    }
    function step(dt, scrollDelta, time) {
      if (!parts.length && !glows.length) {
        if (dirty) {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          dirty = false;
          canvas.style.visibility = 'hidden';        // an idle full-screen canvas still costs a composite pass
        }
        return;
      }
      if (!dirty) canvas.style.visibility = '';
      dirty = true;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (let i = 0; i < glows.length; i += 4) {
        const x = glows[i], y0 = glows[i + 1], y1 = glows[i + 2], s = glows[i + 3];
        ctx.globalAlpha = Math.min(1, s) * (.75 + .25 * Math.sin(time * 23 + y0));
        ctx.drawImage(line, x - 20, y0 - 24, 40, y1 - y0 + 48);
        // a second, flickering tongue of heat
        ctx.globalAlpha *= .45;
        ctx.drawImage(line, x - 34 - Math.sin(time * 17) * 4, y0 - 10, 68, y1 - y0 + 20);
      }
      glows.length = 0;
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.life += dt;
        const t = p.life / p.max;
        if (t >= 1) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
        p.x += (p.vx + Math.sin(p.seed + p.life * 3) * 20) * dt;
        p.y += p.vy * dt - scrollDelta * .85;
        p.vx *= 1 - dt * 1.2;
        p.vy *= 1 - dt * .35;
        p.rot += p.vr * dt;
        const a = Math.sin(Math.min(1, t * 6) * Math.PI / 2) * (1 - t);
        if (p.ember) {
          ctx.globalAlpha = a * (.65 + .35 * Math.sin(p.seed + p.life * 18));
          const sz = p.size * (1 - t * .5);
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.drawImage(dot, p.x - sz / 2, p.y - sz / 2, sz, sz);
        } else {
          ctx.globalAlpha = a * .75;
          const c = Math.cos(p.rot) * dpr, sn = Math.sin(p.rot) * dpr;
          ctx.setTransform(c, sn, -sn, c, p.x * dpr, p.y * dpr);
          ctx.fillStyle = t < .3 ? '#5E5248' : '#A39A90';
          ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * .66);
        }
      }
      ctx.globalAlpha = 1;
    }
    return { spawn, glowV, step };
  })();

  // ---------- Split text into characters ----------
  const SKIP = '[data-count], #clock, #copy-hint, .marquee, script, style, svg, textarea, input';
  function charify(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: n => (!n.nodeValue.trim() || n.parentElement.closest(SKIP) || n.parentElement.closest('ash-t')
        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      // One wrapper per text run, so flex/grid parents still see a single item.
      // Custom tags so existing 'span' rules in the stylesheet never touch the letters.
      const frag = document.createElement('ash-t');
      const label = document.createElement('ash-sr');
      label.textContent = node.nodeValue;
      frag.appendChild(label);
      node.nodeValue.split(/(\s+)/).forEach(part => {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
        const word = document.createElement('ash-w');
        word.setAttribute('aria-hidden', 'true');
        for (const letter of part) {
          const c = document.createElement('ash-c');
          c.textContent = letter;
          word.appendChild(c);
        }
        frag.appendChild(word);
      });
      node.parentNode.replaceChild(frag, node);
    });
  }

  // ---------- The stage + side burners ----------
  const stage = (() => {
    const ZONE = 90;       // px ahead of the burner where letters start to burn
    const RAG = 64;        // the fire front is ragged by up to this much, so it starts this far out
    const HEAT_FADE = 10;
    let vh = innerHeight, vw = document.documentElement.clientWidth, mobile = false;
    const blocks = contents.map((el, i) => ({
      el, panel: sections[i], i, sgn: sections[i].dataset.side === 'right' ? 1 : -1,
      W: 1, H: 1, left: 0, top: 0, over: 0, readTop: 0,
      keys: new Float32Array(0), els: [], rgb: new Uint8Array(0), last: new Float32Array(0),
      lo: 0, hi: 0, full: true, amt: -1, off: -1, cut: -1, heat: 0, front: 0, live: null, tall: false,
    }));

    // Position of `el` inside `root`, from the offset chain (immune to transforms)
    function rel(el, root, cache) {
      if (!el || el === root) return { x: 0, y: 0 };
      let v = cache.get(el);
      if (v) return v;
      const p = el.offsetParent;
      if (!p || !root.contains(p) && p !== root) v = { x: el.offsetLeft, y: el.offsetTop };
      else {
        const q = rel(p, root, cache);
        v = { x: q.x + el.offsetLeft + (p === root ? 0 : p.clientLeft), y: q.y + el.offsetTop + (p === root ? 0 : p.clientTop) };
      }
      cache.set(el, v);
      return v;
    }

    function measureLetters(b) {
      const cache = new Map();
      const colours = new Map();
      const colourOf = el => {
        let c = colours.get(el);
        if (!c) {
          const str = getComputedStyle(el).color;
          const m = (str.match(/[\d.]+/g) || ['0', '0', '0']).slice(0, 3).map(Number);
          c = str.startsWith('color(') ? m.map(v => Math.round(v * 255)) : m;
          colours.set(el, c);
        }
        return c;
      };
      const items = $$('ash-c', b.el).map(el => {
        const p = rel(el.offsetParent, b.el, cache);
        const x = p.x + el.offsetLeft + el.offsetWidth / 2;
        const y = p.y + el.offsetTop + el.offsetHeight / 2;
        const fromEdge = b.sgn < 0 ? x : b.W - x;
        return {
          el,
          colour: colourOf(el.parentElement.parentElement.parentElement),
          // ragged, wavy fire front
          key: fromEdge - Math.random() * 30 - (Math.sin(y * .021) * .5 + .5) * 22,
        };
      }).sort((a, c) => a.key - c.key);
      b.els.forEach(el => { el.style.cssText = ''; });
      b.els = items.map(i => i.el);
      b.keys = Float32Array.from(items, i => i.key);
      b.rgb = Uint8Array.from(items.flatMap(i => i.colour));
      b.last = new Float32Array(b.els.length).fill(-1);
      b.full = true;
    }

    function measureBlock(b) {
      const inner = b.el.parentElement.parentElement;
      const cs = getComputedStyle(inner);
      const padTop = parseFloat(cs.paddingTop), padBottom = parseFloat(cs.paddingBottom);
      const avail = vh - padTop - padBottom;
      b.H = b.el.offsetHeight;
      b.W = b.el.offsetWidth;
      b.over = Math.max(0, Math.round(b.H - avail));
      const tall = b.over > 0;
      if (tall !== b.tall) {
        b.tall = tall;
        b.panel.classList.toggle('is-tall', tall);
      }
      b.left = b.el.parentElement.offsetLeft + b.el.offsetLeft;
      // the burner is the screen edge: the block slides this far before its first letters reach it
      b.gap = Math.max(0, b.sgn < 0 ? b.left : vw - (b.left + b.W));
      b.top = b.el.parentElement.offsetTop + b.el.offsetTop;
      const navBottom = nav.offsetHeight;
      b.readTop = mobile ? Math.max(navBottom + 8, padTop - 24) : navBottom + 10;
      if (tall) b.panel.style.setProperty('--read-top', `${b.readTop}px`);
      measureLetters(b);
      b.amt = -1;
      b.off = -1;
      b.cut = -1;
    }

    function measure() {
      vh = innerHeight;
      vw = document.documentElement.clientWidth;          // the visible width (no scrollbar): the burners sit here
      mobile = innerWidth < 860;
      blocks.forEach(measureBlock);
      // Scroll track: parked range (overflow) + a hop to the next section
      const HOP = Math.round(Math.max(620, vh * 1.05));
      const rests = [], ends = [];
      let y = 0;
      blocks.forEach((b, i) => {
        rests.push(y);
        y += b.over;
        ends.push(y);
        if (i < blocks.length - 1) y += HOP;
      });
      Flight.rests = rests;
      Flight.restEnds = ends;
      Flight.hop = HOP;
      main.style.setProperty('--track', `${y + vh}px`);
      maxScroll = Math.max(1, y);
    }

    // One style write per letter: rise, drift, shrink and fade, while the colour glows ember-orange then greys to ash
    function paint(b, i, p) {
      const el = b.els[i];
      if (p === 0) { el.style.cssText = ''; return; }
      const ash = Math.min(1, p * 1.8);
      const ember = Math.max(0, Math.min(p * 4, (1 - p) * 1.4)) * .9;
      const o = i * 3, rgb = b.rgb;
      let r = rgb[o] + (143 - rgb[o]) * ash, g = rgb[o + 1] + (134 - rgb[o + 1]) * ash, bl = rgb[o + 2] + (124 - rgb[o + 2]) * ash;
      r += (255 - r) * ember; g += (122 - g) * ember; bl += (46 - bl) * ember;
      el.style.cssText = `opacity:${(1 - p * p).toFixed(3)};transform:translate(${(b.sgn * 7 * p).toFixed(1)}px,${(-11 * p).toFixed(1)}px) scale(${(1 - .3 * p).toFixed(3)});color:rgb(${r | 0},${g | 0},${bl | 0})`;
    }

    const lowerBound = (keys, v) => {
      let a = 0, c = keys.length;
      while (a < c) { const m = (a + c) >> 1; if (keys[m] < v) a = m + 1; else c = m; }
      return a;
    };

    // amt: 0 = parked in place, 1 = fully burnt away; off = how far the content has scrolled inside its column
    function apply(b, amt, off, dt) {
      const live = amt < 1;
      if (live !== b.live) {
        b.live = live;
        b.panel.classList.toggle('is-live', live);
        b.panel.classList.toggle('is-in', live);
        Flight.live[b.i] = live;
        if (!live) b.full = true;
      }
      const prevFront = b.front;
      const gap = b.gap || 0;
      const span = gap + b.W + ZONE + RAG;
      const D = amt * span - ZONE - RAG;       // how far the block has slid towards the screen edge
      const F = D - gap;                       // burner front, measured in from the block's outer edge
      b.front = F;
      const dF = F - prevFront;
      const edgeX = b.sgn < 0 ? 0 : vw;
      if (live && (amt !== b.amt || off !== b.off)) {
        const move = Math.max(0, D);
        b.el.style.transform = move > 0 || off > 0 ? `translate3d(${(b.sgn * move).toFixed(1)}px,${(-off).toFixed(1)}px,0)` : '';
      }
      if (b.dirty && live && amt > 0) {
        b.dirty = false;
        measureLetters(b);
      }
      // Letters inside the burn band
      if (live && (amt !== b.amt || b.full)) {
        const quiet = b.full;
        const nlo = lowerBound(b.keys, F), nhi = lowerBound(b.keys, F + ZONE);
        const from = b.full ? 0 : Math.min(b.lo, nlo);
        const to = b.full ? b.els.length : Math.max(b.hi, nhi);
        b.full = false;
        for (let i = from; i < to; i++) {
          const p = i < nlo ? 1 : i >= nhi ? 0 : Math.round((F + ZONE - b.keys[i]) / ZONE * 16) / 16;
          const prev = b.last[i];
          if (p === prev) continue;
          b.last[i] = p;
          paint(b, i, p);
          if (!quiet && dF > 0 && prev < .35 && p >= .35 && p < 1 && Math.random() < .22) {
            embers.spawn(edgeX + b.sgn * rnd(0, 30), b.top - off + rnd(0, b.H), false, b.sgn * 60);
          }
        }
        b.lo = nlo;
        b.hi = nhi;
      }
      b.amt = amt;
      b.off = off;
      // Burner glow + sparks along the cut
      const burning = live && F > 0 && F < b.W;
      b.heat += ((burning ? Math.min(1, Math.abs(dF) / 6) : 0) - b.heat) * Math.min(1, dt * HEAT_FADE);
      if (b.heat > .02) {
        const x = edgeX;
        const y0 = clamp(b.top - off, 0, vh), y1 = clamp(b.top - off + b.H, 0, vh);
        embers.glowV(x, y0, y1, b.heat);
        if (Math.abs(dF) > .2) {
          const count = Math.min(6, Math.round(Math.abs(dF) * (y1 - y0) / 2600 + Math.random()));
          for (let k = 0; k < count; k++) embers.spawn(x + b.sgn * rnd(-4, 10), rnd(y0, y1), dF < 0, b.sgn * (dF > 0 ? 80 : -40));
        }
      }
    }

    const outE = t => smooth(.03, .55, t);
    const inE = t => smooth(.45, .97, t);

    function update(y, dt) {
      const a = Flight.rests, e = Flight.restEnds, n = blocks.length, hop = Flight.hop;
      let settled = -1;
      for (let i = 0; i < n; i++) {
        const b = blocks[i];
        let amt;
        if (jump.active) {
          amt = i === jump.from ? outE(Math.min(1, jump.p / .32))
            : i === jump.to ? 1 - inE(clamp((jump.p - .8) / .2, 0, 1)) : 1;
        } else if (i > 0 && y < a[i] - hop) amt = 1;
        else if (i > 0 && y < a[i]) amt = 1 - inE((y - (a[i] - hop)) / hop);
        else if (y <= e[i] || i === n - 1) amt = 0;
        else if (y < e[i] + hop) amt = outE((y - e[i]) / hop);
        else amt = 1;
        amt = Math.round(amt * 2000) / 2000;
        const off = jump.active ? (i === jump.from ? Math.max(0, b.off) : 0) : Math.round(clamp(y - a[i], 0, b.over) * 2) / 2;
        if (amt === b.amt && off === b.off && b.heat < .02 && !(b.full && amt < 1)) continue;
        apply(b, amt, off, dt);
        if (amt === 0) settled = i;
      }
      for (let i = 0; i < n; i++) if (blocks[i].amt === 0 && blocks[i].live) settled = i;
      Flight.settled = settled;
    }

    function refreshBlock(i) {
      const b = blocks[i];
      if (!b) return;
      const amt = b.amt, off = b.off;
      measureBlock(b);
      apply(b, Math.max(0, amt), Math.max(0, off), 0);
    }
    // Re-measuring a section's letters is done in idle time, one section per slot, never mid-burn
    let idleQueued = false;
    const ric = window.requestIdleCallback || (cb => setTimeout(() => cb({ timeRemaining: () => 10 }), 120));
    function scheduleIdle() {
      if (idleQueued) return;
      idleQueued = true;
      ric(deadline => {
        idleQueued = false;
        for (const b of blocks) {
          if (!b.dirty || (b.amt > 0 && b.amt < 1)) continue;
          if (deadline.timeRemaining() < 5) break;
          b.dirty = false;
          measureLetters(b);
        }
        if (blocks.some(b => b.dirty)) scheduleIdle();
      }, { timeout: 1500 });
    }
    const markDirty = i => { if (blocks[i]) { blocks[i].dirty = true; scheduleIdle(); } };
    return { measure, update, refreshBlock, markDirty, get blocks() { return blocks; } };
  })();

  // ---------- Frame loop ----------
  const navLinks = $$('.nav__links a');
  const railBtns = $$('.rail button');
  const cue = $('.scroll-cue');
  const cueInner = $('.scroll-cue__inner');
  let lastY = scrollY, active = -1, lastT = performance.now(), lastProgress = -1, lastCue = -1;

  let clicked = 0, settleTime = 0, travelled = false;
  function lockIn(i) {
    if (window.Sfx && window.Sfx.gear) window.Sfx.gear();
    if (reduced) return;
    const el = contents[i];
    if (el.animate) {
      el.animate([
        { translate: '0 0', scale: '1' },
        { translate: '0 6px', scale: '.992', offset: .22 },
        { translate: '0 -2px', scale: '1.003', offset: .55 },
        { translate: '0 0', scale: '1' },
      ], { duration: 420, easing: 'cubic-bezier(.3,.7,.3,1)' });
    }
    const s = sections[i];
    s.classList.remove('is-locked');
    void s.offsetWidth;
    s.classList.add('is-locked');
    setTimeout(() => s.classList.remove('is-locked'), 1000);
  }

  function setActive(i) {
    if (i === active) return;
    active = i;
    sections.forEach((s, k) => s.classList.toggle('is-current', k === i));
    const id = ids[i];
    navLinks.forEach(a => a.classList.toggle('is-active', a.dataset.goto === id));
    railBtns.forEach(b => b.classList.toggle('is-active', b.dataset.goto === id));
    facts.onSection(id);
  }

  function tick(now) {
    requestAnimationFrame(tick);
    frame(now);
  }
  function frame(now) {
    const dt = clamp((now - lastT) / 1000, 1e-3, .05);
    lastT = now;
    if (lenis) lenis.raf(now);
    if (jump.active) {
      jump.p = clamp((now - jump.t0) / jump.dur, 0, 1);
      jump.y = Flight.rests[jump.from] + (Flight.rests[jump.to] - Flight.rests[jump.from]) * easeInOutSine(jump.p);
      if (jump.p >= 1) endJump();
    }
    const y = currentScroll();

    const tl = timeline(y);
    const st = Flight.state;
    // Smoothed velocity only feeds engine RPM and heading, never position
    st.velocity += ((y - lastY) / dt - st.velocity) * .25;
    lastY = y;
    st.y = y; st.from = tl.from; st.to = tl.to; st.e = tl.e; st.t = tl.t;

    if (document.body.classList.contains('is-loaded')) {
      setActive(jump.active ? (jump.p < .5 ? jump.from : jump.to) : tl.t > .5 ? tl.to : tl.from);
      stage.update(y, dt);
      const at = Flight.settled;
      if (at < 0) { settleTime = 0; if (clicked >= 0) { travelled = true; clicked = -1; } }
      else if (at !== clicked) {
        settleTime += dt;
        if (settleTime > .12 && Math.abs(st.velocity) < 40) {
          if (travelled) lockIn(at);
          clicked = at;
        }
      }
    }
    embers.step(dt, 0, now / 1000);

    // "Scroll to take off" fades away the moment you scroll
    const cueVis = Math.round(clamp(1 - y / 140, 0, 1) * 100) / 100;
    if (cueVis !== lastCue) {
      lastCue = cueVis;
      cueInner.style.opacity = cueVis;
      cueInner.style.transform = `translateY(${((1 - cueVis) * 16).toFixed(1)}px)`;
      cue.style.visibility = cueVis > 0 ? '' : 'hidden';
    }

    const progress = Math.round(clamp((jump.active ? jump.y : y) / maxScroll, 0, 1) * 2000) / 2000;
    if (progress !== lastProgress) {
      lastProgress = progress;
      navRing.set(progress);
    }
  }

  // ---------- Hero title split ----------
  function splitWords(el) {
    let i = 0;
    const wrap = (text, parent) => {
      text.split(/(\s+)/).forEach(part => {
        if (!part) return;
        if (/^\s+$/.test(part)) { parent.appendChild(document.createTextNode(' ')); return; }
        const w = document.createElement('span');
        w.className = 'w';
        const inner = document.createElement('span');
        inner.textContent = part;
        inner.style.setProperty('--i', i++);
        w.appendChild(inner);
        parent.appendChild(w);
      });
    };
    [...el.childNodes].forEach(node => {
      if (node.nodeType === 3) {
        const frag = document.createDocumentFragment();
        wrap(node.textContent, frag);
        el.replaceChild(frag, node);
      } else if (node.nodeType === 1) {
        const text = node.textContent;
        node.textContent = '';
        wrap(text, node);
      }
    });
  }
  $$('[data-split]').forEach(splitWords);
  contents.forEach(charify);

  // ---------- Measurement ----------
  let measureQueued = false;
  function measure() {
    measureQueued = false;
    // keep the reader on the same section across a re-layout
    const y = currentScroll();
    const tl = timeline(y);
    const parkedAt = tl.from === tl.to ? tl.from : -1;
    const inside = parkedAt >= 0 && Flight.rests.length ? y - Flight.rests[parkedAt] : 0;
    stage.measure();
    sizeEdges();
    if (lenis) lenis.resize();
    if (parkedAt >= 0 && Flight.rests.length) {
      const target = Flight.rests[parkedAt] + clamp(inside, 0, Flight.restEnds[parkedAt] - Flight.rests[parkedAt]);
      if (Math.abs(target - y) > 1) {
        if (lenis) lenis.scrollTo(target, { immediate: true, force: true });
        else window.scrollTo(0, target);
      }
    }
    placeScore();
  }
  const queueMeasure = () => {
    if (measureQueued) return;
    measureQueued = true;
    requestAnimationFrame(measure);
  };

  // ---------- Counters ----------
  function countUp(el, delay = 0) {
    const end = +el.dataset.count;
    const dur = 1800;
    setTimeout(() => {
      const t0 = performance.now();
      const step = now => {
        const p = clamp((now - t0) / dur, 0, 1);
        el.textContent = Math.round(end * (1 - Math.pow(1 - p, 4))).toLocaleString();
        if (p < 1) return requestAnimationFrame(step);
        el.removeAttribute('data-count');
        charify(el);
        stage.refreshBlock(sections.indexOf(el.closest('.panel')));
      };
      requestAnimationFrame(step);
    }, delay);
  }

  // ---------- Preloader ----------
  const loaderBar = $('#loader');
  const loaderCount = $('.loader__count');
  const t0 = performance.now();
  const LOAD_MS = reduced ? 200 : 1700;
  function loadStep(now) {
    const p = clamp((now - t0) / LOAD_MS, 0, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    loaderBar.style.setProperty('--p', eased.toFixed(3));
    loaderCount.textContent = String(Math.round(eased * 100)).padStart(3, '0');
    if (p < 1) return requestAnimationFrame(loadStep);
    measure();
    const deep = ids.indexOf(location.hash.slice(1));
    if (deep > 0) goTo(deep, true);
    document.body.classList.add('is-loaded');
    $$('[data-count]').forEach(el => countUp(el, el.closest('.panel--hero') ? 1700 : 500));
  }

  // ---------- Custom cursor ----------
  if (finePointer && !reduced) {
    const cursor = $('.cursor');
    const dot = $('.cursor__dot');
    const ring = $('.cursor__ring');
    let mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my;
    addEventListener('pointermove', e => { mx = e.clientX; my = e.clientY; }, { passive: true });
    const loop = () => {
      rx += (mx - rx) * .18; ry += (my - ry) * .18;
      dot.style.transform = `translate3d(${mx}px, ${my}px, 0)`;
      ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
      requestAnimationFrame(loop);
    };
    loop();
    document.addEventListener('pointerover', e => {
      cursor.classList.toggle('is-hover', !!e.target.closest('a, button, .tilt, input, textarea'));
    });
  }

  // ---------- Magnetic buttons + tilt cards ----------
  if (finePointer && !reduced) {
    $$('.magnetic').forEach(el => {
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${(e.clientX - r.left - r.width / 2) * .25}px`);
        el.style.setProperty('--my', `${(e.clientY - r.top - r.height / 2) * .35}px`);
      });
      el.addEventListener('pointerleave', () => {
        el.style.setProperty('--mx', '0px');
        el.style.setProperty('--my', '0px');
      });
    });
    $$('.tilt').forEach(el => {
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - .5;
        const py = (e.clientY - r.top) / r.height - .5;
        el.style.setProperty('--ry', `${px * 8}deg`);
        el.style.setProperty('--rx', `${-py * 8}deg`);
      });
      el.addEventListener('pointerleave', () => {
        el.style.setProperty('--ry', '0deg');
        el.style.setProperty('--rx', '0deg');
      });
    });
  }

  // ---------- Fun facts ----------
  const facts = (() => {
    const LIST = [
      ['Origin story', 'I got obsessed with computers after breaking Windows — by editing registry values I probably shouldn’t have touched.'],
      ['Origin story', 'I fixed that broken PC myself, armed with YouTube tutorials, XDA guides and a lot of forum threads.'],
      ['Why code', 'Beautiful websites with advanced animation are what made me want to learn to code in the first place.'],
      ['Career', 'I went from Customer Onboarding Analyst to AI Developer in just 13 months.'],
      ['Shipping', 'Carrier Pre-Alerts went from idea to production in one week — including a live bug fixed the same morning.'],
      ['Engineering', 'One of my booking bots can never send a second truck. It’s idempotent by construction.'],
      ['Debugging', 'I once retracted my own diagnosis when the measurements disagreed — and found the real bug because of it.'],
      ['Debugging', 'I cracked a “phantom bookings” mystery by reproducing a failure that looked exactly like a success.'],
      ['Speed', 'A reconciliation run that took 40 seconds now takes 9 — and 500 consignments go through in about six minutes.'],
      ['Automation', 'A finished Teams meeting becomes HubSpot notes and a call log in about a minute, with zero manual steps.'],
      ['Automation', 'Pre-Alerts cover six states, and adding a new carrier is a single Excel row.'],
      ['By the numbers', 'The Customer Service Automation Suite is about 14,600 lines of Python across ten composable skills.'],
      ['By the numbers', 'I wrote 95 of the 147 commits on that suite and merged 51 pull requests.'],
      ['Reverse engineering', 'I found the tenant-cookie quirk that finally made a legacy portal’s headless login work.'],
      ['Cloud', 'TGE bookings now run fully in the cloud — on a portal everyone assumed needed an office PC.'],
      ['Docs', 'I’ve written 11 SOP and agent-skill documents that people and AI agents both work from.'],
      ['Reliability', 'My report rules run as deterministic Python, not model interpretation, so every report can be reproduced.'],
      ['Design roots', 'Before AI, I was a UI designer: wireframes, prototypes and usability tests.'],
      ['Study', 'I hold a Master of IT in Data Analytics from Deakin University in Melbourne.'],
      ['Workflow', 'I’m strong on concepts and debugging; AI lets me turn specs into software at full speed.'],
      ['Off the clock', 'You’ll often find me on a badminton court — fast rallies, quick reflexes, head fully cleared.'],
      ['Player one', 'My game library runs from competitive shooters to huge adventure worlds and horror that keeps the lights on.'],
    ];
    const DWELL = 8500;
    const el = $('#fact');
    const tag = $('#fact-tag');
    const num = $('#fact-num');
    const total = $('#fact-total');
    const track = $('#fact-track');
    const card = el && el.closest('.bento__fact');
    if (!el || !track) return { onSection() {} };
    const pad = n => String(n).padStart(2, '0');
    total.textContent = pad(LIST.length);
    track.style.setProperty('--fact-ms', `${DWELL}ms`);
    track.innerHTML = LIST.map(() => '<i></i>').join('');
    const bars = [...track.children];
    const seen = new Set([0]);
    let idx = 0, here = false, hover = false, swapping = false;
    const random = sections.find(s => s.contains(el));

    function paintTrack() {
      bars.forEach((b, i) => {
        b.classList.toggle('is-seen', seen.has(i) && i !== idx);
        b.classList.remove('is-on');
      });
      void track.offsetWidth;                  // restart the timer animation
      bars[idx].classList.add('is-on');
    }
    function run() {
      track.style.setProperty('--fact-run', here && !hover && !swapping && !document.hidden && !reduced ? 'running' : 'paused');
    }
    function show(i) {
      if (swapping) return;
      idx = (i + LIST.length) % LIST.length;
      seen.add(idx);
      swapping = true;
      run();
      el.classList.add('is-swapping');
      tag.style.opacity = 0;
      setTimeout(() => {
        el.textContent = LIST[idx][1];
        tag.textContent = LIST[idx][0];
        num.textContent = pad(idx + 1);
        tag.style.opacity = '';
        charify(el);
        stage.markDirty(sections.indexOf(random));
        el.classList.remove('is-swapping');
        swapping = false;
        paintTrack();
        run();
      }, 320);
    }
    $('#shuffle').addEventListener('click', () => show(idx + 1 + Math.floor(Math.random() * (LIST.length - 1))));
    $('#fact-next').addEventListener('click', () => show(idx + 1));
    $('#fact-prev').addEventListener('click', () => show(idx - 1));
    track.addEventListener('animationend', () => show(idx + 1));
    card.addEventListener('pointerenter', () => { hover = true; run(); });
    card.addEventListener('pointerleave', () => { hover = false; run(); });
    document.addEventListener('visibilitychange', run);
    tag.textContent = LIST[0][0];
    paintTrack();
    run();
    return { onSection(id) { here = id === (random && random.id); run(); } };
  })();

  // ---------- Copy email ----------
  const copyBtn = $('#copy-email');
  const hint = $('#copy-hint');
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(copyBtn.dataset.email);
      hint.textContent = 'Copied ✓';
    } catch {
      hint.textContent = 'Select & copy';
    }
    setTimeout(() => { hint.textContent = 'Copy'; }, 1800);
  });

  // ---------- Contact form (opens the visitor's mail client) ----------
  $('#contact-form').addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const subject = `Project enquiry from ${f.get('name')}`;
    const body = `${f.get('message')}\n\n— ${f.get('name')} (${f.get('email')})`;
    location.href = `mailto:${copyBtn.dataset.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  });

  // ---------- Keyboard: tabbing into another section flies there ----------
  document.addEventListener('focusin', e => {
    const s = e.target.closest && e.target.closest('.panel');
    if (!s || !document.body.classList.contains('is-loaded')) return;
    const i = sections.indexOf(s);
    if (i >= 0 && i !== active && !e.target.closest('.nav')) goTo(i);
  });

  // ---------- Clock & year ----------
  const clock = $('#clock');
  const fmt = new Intl.DateTimeFormat('en-AU', { hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Melbourne', hour12: true, timeZoneName: 'short' });
  const tickClock = () => { clock.textContent = fmt.format(new Date()); };
  tickClock();
  setInterval(tickClock, 20000);
  $('#year').textContent = new Date().getFullYear();

  // Inspection hook for development only: open the page with ?debug
  if (/[?&]debug\b/.test(location.search)) {
    window.__main = { step: (ms = 16.7) => frame(lastT + ms), clock: () => lastT, stage, timeline, measure, lenis };
  }

  // ---------- Boot ----------
  measure();
  addEventListener('resize', () => { stageLayout(); queueMeasure(); });
  // The burner re-reads every letter's colour once the theme's colour transitions have settled
  // new theme = new letter colours for the burner: re-read them quietly once the colours have settled
  addEventListener('themechange', () => setTimeout(() => stage.blocks.forEach((_, i) => stage.markDirty(i)), 600));
  addEventListener('load', queueMeasure);
  if (document.fonts) document.fonts.ready.then(queueMeasure);
  requestAnimationFrame(loadStep);
  requestAnimationFrame(tick);
})();
