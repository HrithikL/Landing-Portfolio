/* =========================================================
   UI + shared flight timeline
   Flight.state is read every frame by plane.js
   ========================================================= */
(() => {
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

  const sections = $$('.panel');
  const ids = sections.map(s => s.id);
  let maxScroll = 1;
  const SAFE_TOP = 176;      // px from the top of the viewport where resting content begins

  // ---------- Flight timeline ----------
  // Each section has a "rest" scroll position. Between two rests the plane flies;
  // `e` is the eased 0→1 progress of that flight.
  const Flight = window.Flight = {
    sections,
    sides: sections.map(s => s.dataset.side),
    rests: [],
    state: { y: scrollY, from: 0, to: 0, e: 0, velocity: 0 },
  };

  function measureRests() {
    const vh = innerHeight;
    maxScroll = Math.max(1, document.documentElement.scrollHeight - vh);
    Flight.rests = sections.map(s => {
      const top = s.getBoundingClientRect().top + scrollY;
      // offsetTop/offsetHeight ignore the flip transform
      const c = s.querySelector('.panel__content');
      const cTop = top + c.offsetTop;
      // Centre the content, but never let it start inside the burner band under the nav
      const rest = Math.min(cTop + c.offsetHeight / 2 - vh / 2 + 20, cTop - SAFE_TOP);
      return clamp(rest, 0, maxScroll);
    });
    Flight.rests[0] = 0;
    for (let i = 1; i < Flight.rests.length; i++) {
      if (Flight.rests[i] <= Flight.rests[i - 1]) Flight.rests[i] = Flight.rests[i - 1] + 1;
    }
  }

  // Gentle ease: the plane tracks the scroll position closely, with soft starts and landings
  const easeInOutSine = t => -(Math.cos(Math.PI * t) - 1) / 2;

  function timeline(y) {
    const r = Flight.rests, n = r.length;
    if (y <= r[0]) return { from: 0, to: 0, e: 0 };
    if (y >= r[n - 1]) return { from: n - 1, to: n - 1, e: 0 };
    let i = 0;
    while (i < n - 2 && y >= r[i + 1]) i++;
    const t = (y - r[i]) / (r[i + 1] - r[i]);
    return { from: i, to: i + 1, e: easeInOutSine(clamp((t - .04) / .92, 0, 1)) };
  }

  // ---------- Smooth scrolling ----------
  // Lenis glides the real page scroll; every animation reads that same value each frame,
  // so the plane and the page always move together — no lag, no catch-up burst.
  const lenis = window.Lenis && !reduced
    ? new window.Lenis({ lerp: .1, wheelMultiplier: .9, smoothWheel: true, syncTouch: false })
    : null;
  const currentScroll = () => (lenis ? lenis.scroll : window.scrollY);
  // The mini-game freezes the page while a round runs
  Flight.lock = on => {
    if (lenis) { if (on) lenis.stop(); else lenis.start(); }
    document.documentElement.classList.toggle('is-game', on);
  };

  // Nav jumps: steady cruise through every section on the way (each hop still eases in and out on its own
  // through timeline()), with gentle ramps at the start and end
  const RAMP = .12;
  const easeCruise = t => {
    const v = 1 / (1 - RAMP);                      // cruise speed, so the curve ends at 1
    if (t < RAMP) return v * t * t / (2 * RAMP);
    if (t > 1 - RAMP) return 1 - v * (1 - t) * (1 - t) / (2 * RAMP);
    return v * (t - RAMP / 2);
  };
  function goTo(id) {
    const i = ids.indexOf(id);
    if (i < 0) return;
    if (Flight.onNavigate) Flight.onNavigate();
    if (lenis) {
      const y = currentScroll();
      const tl = timeline(y);
      const hops = Math.abs(i - (tl.from + tl.e));
      const duration = clamp(.5 + hops * 1.45, 1.1, 9.5);
      lenis.scrollTo(Flight.rests[i], { duration, easing: hops > 1.2 ? easeCruise : easeInOutSine });
    } else {
      window.scrollTo({ top: Flight.rests[i], behavior: reduced ? 'auto' : 'smooth' });
    }
  }
  $$('[data-goto]').forEach(el => el.addEventListener('click', e => {
    e.preventDefault();
    goTo(el.dataset.goto);
  }));

  // ---------- Day / night theme ----------
  // The <head> script sets data-theme before first paint (saved choice, else the system setting).
  // Switching fires `themechange`, which plane.js, dogfight.js and the burner listen to.
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
    function toggle() {
      const next = !night;
      if (window.Sfx && window.Sfx.ui) window.Sfx.ui();
      // Circular reveal from the switch, where the browser supports view transitions
      if (document.startViewTransition && !reduced && btn) {
        const r = btn.getBoundingClientRect();
        root.style.setProperty('--vt-x', `${Math.round(r.left + r.width / 2)}px`);
        root.style.setProperty('--vt-y', `${Math.round(r.top + r.height / 2)}px`);
        root.classList.add('theme-vt');
        const vt = document.startViewTransition(() => apply(next));
        vt.finished.finally(() => root.classList.remove('theme-vt'));
      } else apply(next);
    }
    if (btn) btn.addEventListener('click', toggle);
    paint();
    return { get night() { return night; }, toggle };
  })();

  // ---------- Nav progress: traces the whole pill outline ----------
  const navRing = (() => {
    const nav = $('.nav');
    const svg = $('.nav__ring');
    const track = $('.nav__ring-track');
    const fill = $('.nav__ring-fill');
    const glow = $('.nav__ring-glow');
    const head = $('.nav__ring-head');
    let length = 1, value = 0;
    function draw() {
      const w = nav.clientWidth, h = nav.clientHeight;
      if (!w || !h) return;
      const i = 1.25, r = h / 2 - i;
      // Starts at the left end, runs clockwise over the top and back along the bottom
      const d = `M ${i} ${h / 2} A ${r} ${r} 0 0 1 ${i + r} ${i} L ${w - i - r} ${i} `
        + `A ${r} ${r} 0 0 1 ${w - i} ${h / 2} A ${r} ${r} 0 0 1 ${w - i - r} ${h - i} `
        + `L ${i + r} ${h - i} A ${r} ${r} 0 0 1 ${i} ${h / 2}`;
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      [track, fill, glow].forEach(p => p.setAttribute('d', d));
      length = fill.getTotalLength();
      set(value);
    }
    function set(p) {
      value = p;
      const on = p > .0005 ? 1 : 0;
      fill.style.strokeDashoffset = glow.style.strokeDashoffset = 1 - p;
      fill.style.opacity = on;
      glow.style.opacity = on * .35;
      const pt = fill.getPointAtLength(p * length);
      head.setAttribute('cx', pt.x);
      head.setAttribute('cy', pt.y);
      head.style.opacity = p > .0005 && p < .9995 ? 1 : 0;
    }
    new ResizeObserver(draw).observe(nav);
    draw();
    return { set };
  })();

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
    // The burner line: bright core, soft orange bloom, fading at both ends
    const line = sprite(256, 40, g => {
      const v = g.createLinearGradient(0, 0, 0, 40);
      v.addColorStop(0, 'rgba(255,120,40,0)');
      v.addColorStop(.42, 'rgba(255,140,50,.45)');
      v.addColorStop(.5, 'rgba(255,225,160,1)');
      v.addColorStop(.58, 'rgba(255,140,50,.45)');
      v.addColorStop(1, 'rgba(255,120,40,0)');
      g.fillStyle = v;
      g.fillRect(0, 0, 256, 40);
      g.globalCompositeOperation = 'destination-in';
      const h = g.createLinearGradient(0, 0, 256, 0);
      h.addColorStop(0, 'rgba(0,0,0,0)');
      h.addColorStop(.12, 'rgba(0,0,0,1)');
      h.addColorStop(.88, 'rgba(0,0,0,1)');
      h.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = h;
      g.fillRect(0, 0, 256, 40);
    });
    function spawn(x, y, reverse) {
      if (reduced || parts.length > 360) return;
      const ember = Math.random() < .45;
      parts.push({
        x, y, ember,
        vx: rnd(-22, 22),
        vy: rnd(-120, -40) * (reverse ? -.3 : 1),
        life: 0, max: rnd(.8, 1.9),
        size: ember ? rnd(5, 13) : rnd(1.5, 3.6),
        rot: rnd(0, 6.3), vr: rnd(-5, 5), seed: rnd(0, 10),
      });
    }
    function glow(x0, x1, y, strength) {
      if (!reduced && strength > .02) glows.push(x0, x1, y, strength);
    }
    function step(dt, scrollDelta, time) {
      if (!parts.length && !glows.length) {
        if (dirty) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); dirty = false; }
        return;
      }
      dirty = true;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (let i = 0; i < glows.length; i += 4) {
        const [x0, x1, y, s] = [glows[i], glows[i + 1], glows[i + 2], glows[i + 3]];
        ctx.globalAlpha = s * (.75 + .25 * Math.sin(time * 23 + x0));
        ctx.drawImage(line, x0 - 20, y - 20, x1 - x0 + 40, 40);
      }
      glows.length = 0;
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.life += dt;
        const t = p.life / p.max;
        if (t >= 1) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
        p.x += (p.vx + Math.sin(p.seed + p.life * 3) * 20) * dt;
        p.y += p.vy * dt - scrollDelta * .85;
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
    return { spawn, glow, step };
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

  // ---------- The burner ----------
  // The bottom edge of the nav is an invisible burner. Anything scrolled up to it burns:
  // letters ignite, char and fade across a short band below the line (only the letters inside
  // that band are touched each frame), and whole blocks are clipped right at the line.
  const burner = (() => {
    const nav = $('.nav');
    const ZONE = 76;       // px below the line where letters burn
    const EDGE = 12;       // boxes are cut this far below the line
    let line = 90, keys = new Float64Array(0), xs = new Float32Array(0), els = [], last = new Float32Array(0);
    let rgb = new Uint8Array(0);    // each letter's resting colour, read once per measure
    let lo = 0, hi = 0, full = true, blocks = [];

    function measure() {
      line = nav.offsetTop + nav.offsetHeight + 4;
      const cache = new Map();
      // Document position from the offset chain — unaffected by transforms (flip, tilt, intro)
      const base = el => {
        if (!el) return { x: 0, y: 0 };
        let v = cache.get(el);
        if (!v) {
          const p = base(el.offsetParent);
          v = { x: p.x + el.offsetLeft, y: p.y + el.offsetTop };
          cache.set(el, v);
        }
        return v;
      };
      const colours = new Map();
      const colourOf = el => {
        let c = colours.get(el);
        if (!c) {
          const str = getComputedStyle(el).color;             // "rgb(r, g, b)" or "color(srgb r g b)"
          const m = (str.match(/[\d.]+/g) || ['0', '0', '0']).slice(0, 3).map(Number);
          c = str.startsWith('color(') ? m.map(v => Math.round(v * 255)) : m;
          colours.set(el, c);
        }
        return c;
      };
      const items = $$('ash-c').map(el => {
        const p = base(el.offsetParent);
        return {
          el,
          colour: colourOf(el.parentElement.parentElement.parentElement),
          key: p.y + el.offsetTop + el.offsetHeight * .5 - Math.random() * 28,   // ragged fire front
          x: p.x + el.offsetLeft + el.offsetWidth / 2,
        };
      }).sort((a, b) => a.key - b.key);
      els = items.map(i => i.el);
      keys = Float64Array.from(items, i => i.key);
      xs = Float32Array.from(items, i => i.x);
      rgb = Uint8Array.from(items.flatMap(i => i.colour));
      last = new Float32Array(els.length).fill(-1);
      full = true;
      blocks = sections.map(s => {
        const el = s.querySelector('.panel__content');
        const p = base(el);
        return { el, top: p.y, left: p.x, width: el.offsetWidth, height: el.offsetHeight, cut: -1, heat: 0 };
      });
    }

    // One style write per letter: rise, shrink and fade, while the colour glows ember-orange then greys to ash.
    // (Setting the final values directly is several times cheaper than per-letter CSS maths.)
    function paint(i, p) {
      const el = els[i];
      if (p === 0) { el.style.cssText = ''; return; }
      const ash = Math.min(1, p * 1.8);
      const ember = Math.max(0, Math.min(p * 4, (1 - p) * 1.4)) * .9;
      const o = i * 3;
      let r = rgb[o] + (143 - rgb[o]) * ash, g = rgb[o + 1] + (134 - rgb[o + 1]) * ash, b = rgb[o + 2] + (124 - rgb[o + 2]) * ash;
      r += (255 - r) * ember; g += (122 - g) * ember; b += (46 - b) * ember;
      el.style.cssText = `opacity:${(1 - p * p).toFixed(3)};transform:translateY(${(-9 * p).toFixed(1)}px) scale(${(1 - .3 * p).toFixed(3)});color:rgb(${r | 0},${g | 0},${b | 0})`;
    }

    const lowerBound = v => {
      let a = 0, b = keys.length;
      while (a < b) { const m = (a + b) >> 1; if (keys[m] < v) a = m + 1; else b = m; }
      return a;
    };

    function update(y, dy, dt) {
      const zTop = y + line, zBot = zTop + ZONE;
      const nlo = lowerBound(zTop), nhi = lowerBound(zBot);
      const from = full ? 0 : Math.min(lo, nlo);
      const to = full ? els.length : Math.max(hi, nhi);
      const quiet = full;
      full = false;
      // Nothing burns until you actually start scrolling (the hero sits close to the nav)
      const gate = clamp(y / 90, 0, 1);
      for (let i = from; i < to; i++) {
        const p = i < nlo ? 1 : i >= nhi ? 0 : Math.round((zBot - keys[i]) / ZONE * gate * 16) / 16;
        const prev = last[i];
        if (p === prev) continue;
        last[i] = p;
        paint(i, p);
        if (!quiet && prev < .35 && p >= .35 && p < 1 && Math.random() < .28) embers.spawn(xs[i], keys[i] - y, false);
      }
      lo = nlo;
      hi = nhi;

      for (let k = 0; k < blocks.length; k++) {
        const b = blocks[k];
        const cut = clamp(Math.round(y + line + EDGE - b.top), 0, b.height + 1);
        if (cut !== b.cut) {
          b.cut = cut;
          b.el.style.clipPath = cut > 0 ? `inset(${cut}px -300px -300px -300px)` : '';
        }
        const burning = cut > 0 && cut <= b.height;
        b.heat += ((burning ? Math.min(1, Math.abs(dy) / 9) : 0) - b.heat) * Math.min(1, dt * 10);
        if (b.heat > .02) {
          embers.glow(b.left, b.left + b.width, line + EDGE, b.heat);
          if (dy > 0 && !quiet) {
            const count = Math.min(5, Math.round(dy * b.width / 3000 + Math.random()));
            for (let i = 0; i < count; i++) embers.spawn(rnd(b.left, b.left + b.width), line + EDGE + rnd(0, 10), false);
          }
        }
      }
    }
    return { measure, update, refresh: () => { full = true; } };
  })();

  // ---------- Frame loop ----------
  const navLinks = $$('.nav__links a');
  const railBtns = $$('.rail button');
  const cue = $('.scroll-cue');
  const cueInner = $('.scroll-cue__inner');
  let lastY = scrollY, lastFrameY = scrollY, active = -1, lastT = performance.now(), lastProgress = -1, lastCue = -1;

  function setActive(i) {
    if (i === active) return;
    active = i;
    // Everything above the current stop stays revealed (the burner takes care of it); sections below fold away
    sections.forEach((s, k) => s.classList.toggle('is-in', k <= i));
    const id = ids[i];
    navLinks.forEach(a => a.classList.toggle('is-active', a.dataset.goto === id));
    railBtns.forEach(b => b.classList.toggle('is-active', b.dataset.goto === id));
  }

  function tick(now) {
    requestAnimationFrame(tick);
    const dt = clamp((now - lastT) / 1000, 1e-3, .05);
    lastT = now;
    if (lenis) lenis.raf(now);
    const y = currentScroll();

    const tl = timeline(y);
    const st = Flight.state;
    // Smoothed velocity only feeds engine RPM and heading, never position
    st.velocity += ((y - lastY) / dt - st.velocity) * .25;
    lastY = y;
    st.y = y; st.from = tl.from; st.to = tl.to; st.e = tl.e;

    const dy = y - lastFrameY;
    lastFrameY = y;
    if (document.body.classList.contains('is-loaded')) {
      setActive(tl.e > .64 ? tl.to : tl.from);
      burner.update(y, dy, dt);
    }
    embers.step(dt, dy, now / 1000);

    // "Scroll to take off" fades away the moment you scroll
    const cueVis = Math.round(clamp(1 - y / 140, 0, 1) * 100) / 100;
    if (cueVis !== lastCue) {
      lastCue = cueVis;
      cueInner.style.opacity = cueVis;
      cueInner.style.transform = `translateY(${((1 - cueVis) * 16).toFixed(1)}px)`;
      cue.style.visibility = cueVis > 0 ? '' : 'hidden';
    }

    const progress = Math.round(clamp(y / maxScroll, 0, 1) * 2000) / 2000;
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
  sections.forEach(s => charify(s.querySelector('.panel__content')));

  // ---------- Measurement ----------
  let measureQueued = false;
  function measure() {
    measureQueued = false;
    measureRests();
    burner.measure();
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
        queueMeasure();
      };
      requestAnimationFrame(step);
    }, delay);
  }
  const counted = new WeakSet();
  const countObserver = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting && !counted.has(en.target) && document.body.classList.contains('is-loaded')) {
        counted.add(en.target);
        countUp(en.target, en.target.closest('.panel--hero') ? 1700 : 500);
      }
    });
  }, { threshold: .6 });

  // ---------- Preloader ----------
  const loaderBar = $('.loader__bar i');
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
    document.body.classList.add('is-loaded');
    $$('[data-count]').forEach(el => countObserver.observe(el));
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
        el.style.setProperty('--ry', `${px * 10}deg`);
        el.style.setProperty('--rx', `${-py * 10}deg`);
      });
      el.addEventListener('pointerleave', () => {
        el.style.setProperty('--ry', '0deg');
        el.style.setProperty('--rx', '0deg');
      });
    });
  }

  // ---------- Fun facts ----------
  const facts = [
    'I got obsessed with computers after breaking Windows — by editing registry values I probably shouldn’t have touched.',
    'I fixed that broken PC myself, armed with YouTube tutorials, XDA guides and a lot of forum threads.',
    'I went from Customer Onboarding Analyst to AI Developer in just over a year.',
    'Carrier Pre-Alerts went from idea to production in one week — including a live bug fixed the same morning.',
    'One of my bots can never send a second truck. It’s idempotent by construction.',
    'I once retracted my own diagnosis when the measurements disagreed — and found the real bug because of it.',
    'I’m strong on concepts and debugging; AI lets me turn specs into software at full speed.',
  ];
  let factIdx = 0;
  const factEl = $('#fact');
  $('#shuffle').addEventListener('click', () => {
    factIdx = (factIdx + 1 + Math.floor(Math.random() * (facts.length - 1))) % facts.length;
    factEl.classList.add('is-swapping');
    setTimeout(() => {
      factEl.textContent = facts[factIdx];
      charify(factEl);
      queueMeasure();
      factEl.classList.remove('is-swapping');
    }, 320);
  });

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

  // ---------- Clock & year ----------
  const clock = $('#clock');
  const fmt = new Intl.DateTimeFormat('en-AU', { hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Melbourne', hour12: true, timeZoneName: 'short' });
  const tickClock = () => { clock.textContent = fmt.format(new Date()); };
  tickClock();
  setInterval(tickClock, 20000);
  $('#year').textContent = new Date().getFullYear();

  // ---------- Boot ----------
  measure();
  addEventListener('resize', queueMeasure);
  addEventListener('themechange', queueMeasure);      // the burner re-reads every letter's colour
  addEventListener('load', queueMeasure);
  if (document.fonts) document.fonts.ready.then(queueMeasure);
  new ResizeObserver(queueMeasure).observe(document.body);
  requestAnimationFrame(loadStep);
  requestAnimationFrame(tick);
})();
