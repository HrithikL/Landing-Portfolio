/* =========================================================
   Gunfire meets the page
   - a front FX canvas (above the text) for tracers that pass in front of the content and impact sparks
   - bullet holes punched into empty areas of the section cards, never over text
   plane.js decides which bullets go where; this file handles the page side.
   ========================================================= */
(() => {
  const Flight = window.Flight;
  const main = document.querySelector('main');
  if (!Flight || !main) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ---------- Front canvas ----------
  const canvas = document.createElement('canvas');
  canvas.id = 'fx-front';
  canvas.setAttribute('aria-hidden', 'true');
  main.after(canvas);
  const ctx = canvas.getContext('2d');
  let dpr = 1, dirty = false;
  function size() {
    dpr = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
  }
  size();
  // Text reflows on resize, so old holes could end up over it: clear them and start over
  let lastW = innerWidth;
  addEventListener('resize', () => {
    size();
    cache.clear();
    if (Math.abs(innerWidth - lastW) < 2) return;     // mobile toolbars only change the height
    lastW = innerWidth;
    holes.forEach(list => list.forEach(({ el }) => el.remove()));
    holes.clear();
    pending.length = 0;
    landed = -1;
  });

  const lines = [];      // x0, y0, x1, y1, width, alpha
  let sight = null;      // mini-game aiming reticle for this frame
  let locked = null;     // mini-game missile lock for this frame
  function reticle(x, y, hot) { sight = { x, y, hot }; }
  function lock(x, y, size) { locked = { x, y, size }; }
  function drawLock(t) {
    const { x, y } = locked;
    const r = Math.max(16, Math.min(46, locked.size)) + Math.sin(t * 12) * 2;
    const k = r * .45;
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = '#E5484D';
    ctx.lineCap = 'round';
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => {
      ctx.beginPath();
      ctx.moveTo(x + sx * r, y + sy * (r - k));
      ctx.lineTo(x + sx * r, y + sy * r);
      ctx.lineTo(x + sx * (r - k), y + sy * r);
      ctx.stroke();
    });
    ctx.font = '600 9px "JetBrains Mono", monospace';
    ctx.fillStyle = '#E5484D';
    ctx.textAlign = 'center';
    ctx.fillText('LOCK', x, y - r - 6);
  }
  function drawReticle(t) {
    const { x, y, hot } = sight;
    const r = 15 + Math.sin(t * 9) * (hot ? 1.5 : .6);
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,250,240,.75)';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = hot ? '#FF7A1A' : '#2A211A';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * (r - 5), y + Math.sin(a) * (r - 5));
      ctx.lineTo(x + Math.cos(a) * (r + 7), y + Math.sin(a) * (r + 7));
      ctx.stroke();
    }
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
  }
  const bits = [];       // impact sparks + paper chips
  function tracer(x0, y0, x1, y1, w, a) {
    if (lines.length < 600) lines.push(x0, y0, x1, y1, w, a);
  }
  function burst(x, y, dx, dy) {
    for (let i = 0; i < 14; i++) {
      const spark = i < 8;
      const ang = Math.atan2(-dy, -dx) + rnd(-1.3, 1.3);
      const sp = spark ? rnd(120, 380) : rnd(40, 150);
      bits.push({
        x, y, spark,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - (spark ? 0 : 60),
        life: 0, max: spark ? rnd(.12, .3) : rnd(.45, .9),
        size: spark ? rnd(1.2, 2.2) : rnd(1.5, 3.4), rot: rnd(0, 6), vr: rnd(-12, 12),
      });
    }
  }

  // Scroll moves the page under fixed-canvas particles: shift them with it
  function frame(dt, velocity = 0) {
    if (!lines.length && !bits.length && !sight && !locked) {
      if (dirty) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); dirty = false; }
      return;
    }
    dirty = true;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round';
    for (let i = 0; i < lines.length; i += 6) {
      const x0 = lines[i], y0 = lines[i + 1], x1 = lines[i + 2], y1 = lines[i + 3], w = lines[i + 4], a = lines[i + 5];
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, 'rgba(255,120,20,0)');
      g.addColorStop(.6, `rgba(255,140,30,${.3 * a})`);
      g.addColorStop(1, `rgba(255,160,50,${.45 * a})`);
      ctx.strokeStyle = g;
      ctx.lineWidth = w * 3;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      const c = ctx.createLinearGradient(x0, y0, x1, y1);
      c.addColorStop(0, 'rgba(255,170,60,0)');
      c.addColorStop(.5, `rgba(255,150,40,${.85 * a})`);
      c.addColorStop(1, `rgba(255,240,190,${a})`);
      ctx.strokeStyle = c;
      ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
    lines.length = 0;
    if (sight) {
      drawReticle(performance.now() / 1000);
      sight = null;
    }
    if (locked) {
      drawLock(performance.now() / 1000);
      locked = null;
    }
    const shift = velocity * dt;
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i];
      b.life += dt;
      const t = b.life / b.max;
      if (t >= 1) { bits[i] = bits[bits.length - 1]; bits.pop(); continue; }
      b.x += b.vx * dt;
      b.y += b.vy * dt - shift;
      b.vx *= 1 - dt * 3;
      b.vy += (b.spark ? 300 : 520) * dt;
      b.rot += b.vr * dt;
      if (b.spark) {
        ctx.globalAlpha = 1 - t;
        ctx.strokeStyle = t < .4 ? '#FFE3A0' : '#FF8A2A';
        ctx.lineWidth = b.size;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - b.vx * .03, b.y - b.vy * .03);
        ctx.stroke();
      } else {
        ctx.globalAlpha = (1 - t) * .9;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot);
        ctx.fillStyle = b.size > 2.6 ? '#EFE3D1' : '#8C7A69';
        ctx.fillRect(-b.size / 2, -b.size / 3, b.size, b.size * .66);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---------- Bullet holes ----------
  const SURFACE = '.card, .polaroid';
  // Anything that carries information: words, numbers, images, controls, visual widgets.
  // (The drawn project thumbnails and polaroid photos are decoration, so they can take hits; their labels can't.)
  const SOLID = 'ash-w, img, svg, input, textarea, button, a, label, .bars i, .eq, .chips span, '
    + '.avatar, .tag, .marquee, [data-count], #clock, #copy-hint, .email, figcaption';
  const MARGIN = 10, EDGE = 14, SPACING = 26;
  const MAX_PER_CARD = 6, MAX_PER_SECTION = 18;
  const cache = new Map();       // section index → { cards, time }
  const holes = new Map();       // section index → [{ el, card }]
  const pending = [];           // spots reserved by bullets still in the air
  let landed = -1;

  // Box of `el` relative to the card's border box, from layout offsets (immune to transforms)
  function layoutBox(el, card) {
    if (!('offsetLeft' in el) || !el.offsetParent) return null;
    let x = 0, y = 0, n = el;
    while (n && n !== card) {
      x += n.offsetLeft;
      y += n.offsetTop;
      n = n.offsetParent;
      if (n && n !== card) { x += n.clientLeft; y += n.clientTop; }
    }
    if (n !== card) return null;
    x += card.clientLeft;
    y += card.clientTop;
    return [x, y, x + el.offsetWidth, y + el.offsetHeight];
  }
  // Only measure a section once its flip-in has finished
  const settled = section => {
    const c = section.querySelector('.panel__content');
    const cs = c && getComputedStyle(c);
    return !cs || (cs.transform === 'none' && +cs.opacity > .99);
  };

  function measure(i) {
    const hit = cache.get(i);
    if (hit && performance.now() - hit.time < 1500) return hit;
    const section = Flight.sections[i];
    if (!section || !settled(section)) return null;
    const cards = [...section.querySelectorAll(SURFACE)].filter(el => (
      el.offsetWidth > 80 && el.offsetHeight > 70 && !el.querySelector(SURFACE)
    )).map(el => {
      const r = el.getBoundingClientRect();
      const solids = [...el.querySelectorAll(SOLID)].map(s => {
        const box = layoutBox(s, el);
        if (box) return box;
        const q = s.getBoundingClientRect();
        return [q.left - r.left, q.top - r.top, q.right - r.left, q.bottom - r.top];
      }).filter(q => q[2] > q[0] && q[3] > q[1]);
      const count = (holes.get(i) || []).filter(h => h.card === el).length;
      return { el, w: el.offsetWidth, h: el.offsetHeight, solids, count };
    });
    const data = { cards, time: performance.now() };
    cache.set(i, data);
    return data;
  }

  function isFree(card, x, y, section) {
    if (x < EDGE || y < EDGE || x > card.w - EDGE || y > card.h - EDGE) return false;
    for (const [l, t, r, b] of card.solids) {
      if (x > l - MARGIN && x < r + MARGIN && y > t - MARGIN && y < b + MARGIN) return false;
    }
    for (const h of holes.get(section) || []) {
      if (h.card === card.el && Math.hypot(h.x - x, h.y - y) < SPACING) return false;
    }
    for (const h of pending) {
      if (h.card.el === card.el && Math.hypot(h.lx - x, h.ly - y) < SPACING) return false;
    }
    return true;
  }

  // Where would a bullet fired along this screen segment land on an empty part of a card?
  // Samples clear spots on the visible cards inside a narrow cone around the line of fire, so a burst
  // spreads its damage the way real spray does.
  const CONE = .5;
  function findHit(section, x0, y0, x1, y1) {
    if (reduced || section !== landed) return null;
    const list = holes.get(section) || [];
    if (list.length + pending.length >= MAX_PER_SECTION) return null;
    const data = measure(section);
    if (!data) return null;
    const aim = Math.atan2(y1 - y0, x1 - x0), reach = Math.hypot(x1 - x0, y1 - y0);
    const top = 84, bottom = innerHeight - 12;
    const found = [];
    for (const card of data.cards) {
      if (card.count >= MAX_PER_CARD) continue;
      const r = card.el.getBoundingClientRect();
      if (r.bottom < top || r.top > bottom) continue;
      for (let k = 0; k < 16; k++) {
        const lx = rnd(EDGE, card.w - EDGE), ly = rnd(EDGE, card.h - EDGE);
        const sx = r.left + lx, sy = r.top + ly;
        if (sy < top || sy > bottom || sx < 8 || sx > innerWidth - 8) continue;
        const dx = sx - x0, dy = sy - y0, dist = Math.hypot(dx, dy);
        if (dist < 40 || dist > reach) continue;
        let da = Math.abs(Math.atan2(dy, dx) - aim);
        if (da > Math.PI) da = Math.PI * 2 - da;
        if (da > CONE || !isFree(card, lx, ly, section)) continue;
        found.push({ card, lx, ly, sx, sy, dist });
      }
    }
    if (!found.length) return null;
    const c = found[Math.floor(Math.random() * found.length)];
    c.card.count++;            // reserve now; the hole appears when the bullet arrives
    const hit = { section, card: c.card, lx: c.lx, ly: c.ly, x: c.sx, y: c.sy, t: Math.min(1, c.dist / reach) };
    pending.push(hit);
    return hit;
  }

  function crackSvg(size) {
    const n = 5 + Math.floor(Math.random() * 3);
    let cracks = '';
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + rnd(-.3, .3);
      const r1 = rnd(9, 16) * size;
      const bend = a + rnd(-.35, .35);
      const mx = Math.cos(bend) * r1 * .55, my = Math.sin(bend) * r1 * .55;
      cracks += `<path d="M${(Math.cos(a) * 4 * size).toFixed(1)} ${(Math.sin(a) * 4 * size).toFixed(1)}L${mx.toFixed(1)} ${my.toFixed(1)}L${(Math.cos(a) * r1).toFixed(1)} ${(Math.sin(a) * r1).toFixed(1)}"/>`;
    }
    const s = size;
    return `<svg viewBox="-20 -20 40 40" aria-hidden="true">
      <circle r="${9 * s}" class="bh-scorch"/>
      <g class="bh-cracks">${cracks}</g>
      <circle r="${4.6 * s}" class="bh-rim"/>
      <circle r="${3.4 * s}" class="bh-hole"/>
      <circle r="${1.3 * s}" cx="${-.9 * s}" cy="${-.9 * s}" class="bh-glint"/>
    </svg>`;
  }

  function hole(hit, dir) {
    const { section, card, lx, ly } = hit;
    const pi = pending.indexOf(hit);
    if (pi >= 0) pending.splice(pi, 1);
    if (section !== landed || !card.el.isConnected) { card.count = Math.max(0, card.count - 1); return; }
    const el = document.createElement('i');
    el.className = 'bullet-hole';
    el.setAttribute('aria-hidden', 'true');
    el.style.left = `${lx - card.el.clientLeft}px`;
    el.style.top = `${ly - card.el.clientTop}px`;
    el.style.setProperty('--rot', `${Math.round(rnd(0, 360))}deg`);
    el.innerHTML = crackSvg(rnd(.85, 1.15));
    card.el.appendChild(el);
    const list = holes.get(section) || [];
    list.push({ el, card: card.el, x: lx, y: ly });
    holes.set(section, list);
    const r = card.el.getBoundingClientRect();
    const dx = dir ? dir.x : 1, dy = dir ? -dir.y : 0;
    const l = Math.hypot(dx, dy) || 1;
    burst(r.left + lx, r.top + ly, dx / l, dy / l);
  }

  // Landing on a section: holes elsewhere fade away, so each visit starts clean
  function land(section) {
    if (section === landed) return;
    landed = section;
    cache.delete(section);
    holes.forEach((list, s) => {
      if (s === section) return;
      list.forEach(({ el }) => {
        el.classList.add('is-gone');
        setTimeout(() => el.remove(), 700);
      });
      holes.delete(s);
    });
  }

  window.Impacts = { tracer, frame, findHit, hole, land, burst, reticle, lock };
})();
