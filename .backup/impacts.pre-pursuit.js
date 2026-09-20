/* =========================================================
   Gunfire meets the page
   - a front FX canvas (above the text) for tracers that pass in front of the content and impact sparks
   - bullet holes and grazes punched into empty areas of the section cards, never over text.
     Shooting never runs dry: once a card carries its share of damage, the oldest marks fade away.
   - every hit flashes the card from the point of impact and gives it a small jolt
   - on the hero, some bullets strike the headline letters: they flash white-hot, crack and char, then cool down
   plane.js decides which bullets go where; this file handles the page side.
   ========================================================= */
(() => {
  const Flight = window.Flight;
  const main = document.querySelector('main');
  if (!Flight || !main) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const now = () => performance.now();

  // ---------- Front canvas ----------
  const canvas = document.createElement('canvas');
  canvas.id = 'fx-front';
  canvas.setAttribute('aria-hidden', 'true');
  main.after(canvas);
  const ctx = canvas.getContext('2d');
  canvas.style.visibility = 'hidden';
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
    holes.forEach(list => list.forEach(h => h.el.remove()));
    holes.clear();
    pending.length = 0;
    landed = -1;
  });

  const lines = [];      // x0, y0, x1, y1, width, alpha
  let sight = null;      // mini-game aiming reticle for this frame
  let locked = null;     // mini-game missile lock for this frame
  function reticle(x, y, hot) { sight = { x, y, hot }; }
  function lock(x, y, sz) { locked = { x, y, size: sz }; }
  function drawLock(t) {
    const { x, y } = locked;
    const r = Math.max(16, Math.min(46, locked.size)) + Math.sin(t * 12) * 2;
    const k = r * .45;
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = '#f74a20';
    ctx.lineCap = 'round';
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => {
      ctx.beginPath();
      ctx.moveTo(x + sx * r, y + sy * (r - k));
      ctx.lineTo(x + sx * r, y + sy * r);
      ctx.lineTo(x + sx * (r - k), y + sy * r);
      ctx.stroke();
    });
    ctx.font = '700 10px Outfit, system-ui, sans-serif';
    ctx.fillStyle = '#f74a20';
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
    ctx.strokeStyle = hot ? '#ff6d34' : '#091929';
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
  const bits = [];       // impact sparks, paper chips and smoke wisps
  function tracer(x0, y0, x1, y1, w, a) {
    if (lines.length < 600) lines.push(x0, y0, x1, y1, w, a);
  }
  // kind: 'card' (paper chips), 'letter' (hot grit), default sparks only
  function burst(x, y, dx, dy, kind) {
    if (bits.length > 500) return;
    const n = kind ? 18 : 12;
    for (let i = 0; i < n; i++) {
      const spark = i < 9;
      const ang = Math.atan2(-dy, -dx) + rnd(-1.3, 1.3);
      const sp = spark ? rnd(140, 420) : rnd(40, 170);
      bits.push({
        x, y, type: spark ? 0 : kind === 'letter' ? 2 : 1,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - (spark ? 0 : 70),
        life: 0, max: spark ? rnd(.12, .32) : rnd(.45, .95),
        size: spark ? rnd(1.2, 2.3) : rnd(1.5, 3.8), rot: rnd(0, 6), vr: rnd(-12, 12),
      });
    }
    if (kind) {
      for (let i = 0; i < 3; i++) {
        bits.push({ x, y, type: 3, vx: rnd(-20, 20) - dx * 30, vy: rnd(-40, -15), life: 0, max: rnd(.6, 1.1), size: rnd(6, 12), rot: 0, vr: 0 });
      }
    }
  }

  function frame(dt) {
    if (!lines.length && !bits.length && !sight && !locked) {
      if (dirty) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        dirty = false;
        canvas.style.visibility = 'hidden';
      }
      return;
    }
    if (!dirty) canvas.style.visibility = '';
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
    if (sight) { drawReticle(now() / 1000); sight = null; }
    if (locked) { drawLock(now() / 1000); locked = null; }
    const night = document.documentElement.dataset.theme === 'night';
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i];
      b.life += dt;
      const t = b.life / b.max;
      if (t >= 1) { bits[i] = bits[bits.length - 1]; bits.pop(); continue; }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vx *= 1 - dt * 3;
      if (b.type === 3) {
        b.vy *= 1 - dt * 1.5;
        ctx.globalAlpha = Math.sin(t * Math.PI) * (night ? .25 : .3);
        ctx.fillStyle = night ? '#8d8178' : '#6b645c';
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.size * (.6 + t * 1.4), 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      b.vy += (b.type === 0 ? 300 : 520) * dt;
      b.rot += b.vr * dt;
      if (b.type === 0) {
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
        ctx.fillStyle = b.type === 2
          ? (t < .35 ? '#FFB35A' : night ? '#6B5A4C' : '#3A2A20')
          : (b.size > 2.6 ? (night ? '#2f211a' : '#fbe3cd') : (night ? '#5B4A3E' : '#8C7A69'));
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
  const SOLID = 'ash-w, img, svg, input, textarea, button, a, label, .bars i, .eq, .chips span, .fact, .fact__track, '
    + '.avatar, .tag, .marquee, [data-count], #clock, #copy-hint, .email, figcaption, .thumb__year, .thumb__metric';
  const MARGIN = 10, EDGE = 16, SPACING = 30;
  const MAX_PER_CARD = 4, MAX_PER_SECTION = 12;
  const cache = new Map();       // section index → { cards, time }
  const holes = new Map();       // section index → [{ el, card, x, y, t }]
  const pending = [];            // spots reserved by bullets still in the air
  let landed = -1, lastReserve = 0;

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

  function measure(i) {
    const hit = cache.get(i);
    const t = now();
    if (hit && t - hit.time < 3000) {
      if (t - hit.rectTime > 120) {
        hit.cards.forEach(c => { c.rect = c.el.getBoundingClientRect(); });
        hit.rectTime = t;
      }
      return hit;
    }
    const section = Flight.sections[i];
    if (!section || Flight.settled !== i) return null;
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
      return { el, w: el.offsetWidth, h: el.offsetHeight, solids, rect: r, lastFx: 0 };
    });
    const data = { cards, time: t, rectTime: t };
    cache.set(i, data);
    return data;
  }

  function clear(card, x, y, margin = MARGIN) {
    if (x < EDGE || y < EDGE || x > card.w - EDGE || y > card.h - EDGE) return false;
    for (const [l, t, r, b] of card.solids) {
      if (x > l - margin && x < r + margin && y > t - margin && y < b + margin) return false;
    }
    return true;
  }
  function isFree(card, x, y, section) {
    if (!clear(card, x, y)) return false;
    for (const h of holes.get(section) || []) {
      if (h.card === card.el && !h.gone && Math.hypot(h.x - x, h.y - y) < SPACING) return false;
    }
    for (const h of pending) {
      if (h.card.el === card.el && Math.hypot(h.lx - x, h.ly - y) < SPACING) return false;
    }
    return true;
  }

  // Where would a bullet fired along this screen segment land on an empty part of a card?
  // Samples clear spots on the visible cards inside a narrow cone around the line of fire.
  const CONE = .5;
  function findHit(section, x0, y0, x1, y1) {
    if (reduced || section !== landed || section === 0) return null;
    const t = now();
    if (pending.length > 5 || t - lastReserve < 50) return null;
    const data = measure(section);
    if (!data) return null;
    const aim = Math.atan2(y1 - y0, x1 - x0), reach = Math.hypot(x1 - x0, y1 - y0);
    const top = (document.querySelector('.nav') || { offsetHeight: 70 }).offsetHeight + 8, bottom = innerHeight - 12;
    const found = [];
    for (const card of data.cards) {
      const r = card.rect;
      if (r.bottom < top || r.top > bottom || r.width < 10) continue;
      for (let k = 0; k < 14; k++) {
        const lx = rnd(EDGE, card.w - EDGE), ly = rnd(EDGE, card.h - EDGE);
        const sx = r.left + lx * r.width / card.w, sy = r.top + ly * r.height / card.h;
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
    lastReserve = t;
    const hit = { section, card: c.card, lx: c.lx, ly: c.ly, x: c.sx, y: c.sy, t: Math.min(1, c.dist / reach), aim };
    pending.push(hit);
    return hit;
  }

  function crackSvg(size, torn) {
    const n = 5 + Math.floor(Math.random() * 4);
    let cracks = '', petals = '';
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + rnd(-.3, .3);
      const r1 = rnd(9, 17) * size;
      const bend = a + rnd(-.35, .35);
      const mx = Math.cos(bend) * r1 * .55, my = Math.sin(bend) * r1 * .55;
      cracks += `<path d="M${(Math.cos(a) * 4 * size).toFixed(1)} ${(Math.sin(a) * 4 * size).toFixed(1)}L${mx.toFixed(1)} ${my.toFixed(1)}L${(Math.cos(a) * r1).toFixed(1)} ${(Math.sin(a) * r1).toFixed(1)}"/>`;
      if (Math.random() < .4 && i + 1 < n) {
        const b2 = a + rnd(.4, .8), r2 = r1 * rnd(.4, .6);
        cracks += `<path d="M${mx.toFixed(1)} ${my.toFixed(1)}L${(Math.cos(b2) * r2).toFixed(1)} ${(Math.sin(b2) * r2).toFixed(1)}"/>`;
      }
      if (torn) {
        // curled flaps of torn surface around the hole
        const p0 = 4.4 * size, p1 = rnd(6, 8.5) * size, w = rnd(.22, .38);
        petals += `<path class="bh-petal" d="M${(Math.cos(a - w) * p0).toFixed(1)} ${(Math.sin(a - w) * p0).toFixed(1)}L${(Math.cos(a) * p1).toFixed(1)} ${(Math.sin(a) * p1).toFixed(1)}L${(Math.cos(a + w) * p0).toFixed(1)} ${(Math.sin(a + w) * p0).toFixed(1)}Z"/>`;
      }
    }
    const s = size;
    return `<svg viewBox="-20 -20 40 40" aria-hidden="true">
      <circle r="${13 * s}" class="bh-soot"/>
      <circle r="${9 * s}" class="bh-scorch"/>
      <g class="bh-cracks">${cracks}</g>
      ${petals}
      <circle r="${4.8 * s}" class="bh-rim"/>
      <circle r="${3.5 * s}" class="bh-hole"/>
      <circle r="${4.1 * s}" class="bh-ember"/>
      <circle r="${1.3 * s}" cx="${-.9 * s}" cy="${-.9 * s}" class="bh-glint"/>
    </svg>`;
  }

  function retire(h) {
    if (h.gone) return;
    h.gone = true;
    h.el.classList.add('is-gone');
    setTimeout(() => h.el.remove(), 750);
  }
  // Keep the damage readable: a few marks per card, a dozen per section; the oldest fade away
  function makeRoom(section, cardEl) {
    const list = holes.get(section) || [];
    const onCard = list.filter(h => h.card === cardEl && !h.gone);
    if (onCard.length >= MAX_PER_CARD) retire(onCard[0]);
    const alive = list.filter(h => !h.gone);
    if (alive.length >= MAX_PER_SECTION) retire(alive[0]);
    holes.set(section, list.filter(h => !h.gone || now() - h.t < 800));
  }

  function flashCard(card, x, y) {
    const t = now();
    if (t - card.lastFx < 70) return;
    card.lastFx = t;
    let f = card.el.querySelector(':scope > .hit-flash');
    if (!f) {
      f = document.createElement('i');
      f.className = 'hit-flash';
      f.setAttribute('aria-hidden', 'true');
      card.el.appendChild(f);
    }
    f.style.setProperty('--hx', `${x.toFixed(0)}px`);
    f.style.setProperty('--hy', `${y.toFixed(0)}px`);
    if (f.animate) {
      f.animate([{ opacity: 1 }, { opacity: .55, offset: .25 }, { opacity: 0 }], { duration: 460, easing: 'ease-out' });
      const jx = rnd(-2.2, 2.2), jy = rnd(-2.2, 2.2);
      card.el.animate([
        { translate: `${jx.toFixed(1)}px ${jy.toFixed(1)}px`, rotate: `${rnd(-.5, .5).toFixed(2)}deg` },
        { translate: '0px 0px', rotate: '0deg' },
      ], { duration: 280, easing: 'cubic-bezier(.2,.9,.3,1)' });
    }
  }

  // A shallow hit: a scorched streak along the bullet's path, only where the whole streak is clear
  function tryGraze(hit, card) {
    const len = rnd(46, 78);
    const ang = hit.aim;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const sx = hit.lx - ca * len * .7, sy = hit.ly - sa * len * .7;
    for (let k = 0; k <= 6; k++) {
      const u = k / 6;
      if (!clear(card, sx + ca * len * u, sy + sa * len * u, 12)) return null;
    }
    const el = document.createElement('i');
    el.className = 'bullet-graze';
    el.setAttribute('aria-hidden', 'true');
    el.style.left = `${(sx - card.el.clientLeft).toFixed(1)}px`;
    el.style.top = `${(sy - card.el.clientTop).toFixed(1)}px`;
    el.style.width = `${len.toFixed(0)}px`;
    el.style.setProperty('--ang', `${(ang * 180 / Math.PI).toFixed(1)}deg`);
    return el;
  }

  function hole(hit, dir) {
    const { section, card, lx, ly } = hit;
    const pi = pending.indexOf(hit);
    if (pi >= 0) pending.splice(pi, 1);
    if (section !== landed || !card.el.isConnected || Flight.settled !== section) return;
    makeRoom(section, card.el);
    let el = Math.random() < .28 ? tryGraze(hit, card) : null;
    if (!el) {
      // bigger, torn holes where there's room for them
      const big = Math.random() < .45 && clear(card, lx, ly, 24);
      const s = big ? rnd(1.15, 1.45) : rnd(.8, 1.1);
      el = document.createElement('i');
      el.className = 'bullet-hole';
      el.setAttribute('aria-hidden', 'true');
      el.style.left = `${(lx - card.el.clientLeft).toFixed(1)}px`;
      el.style.top = `${(ly - card.el.clientTop).toFixed(1)}px`;
      el.style.setProperty('--rot', `${Math.round(rnd(0, 360))}deg`);
      el.style.setProperty('--s', s.toFixed(2));
      el.innerHTML = crackSvg(rnd(.9, 1.1), big || Math.random() < .4);
    }
    card.el.appendChild(el);
    const list = holes.get(section) || [];
    list.push({ el, card: card.el, x: lx, y: ly, t: now(), gone: false });
    holes.set(section, list);
    flashCard(card, lx, ly);
    const r = card.el.getBoundingClientRect();
    const dx = dir ? dir.x : 1, dy = dir ? -dir.y : 0;
    const l = Math.hypot(dx, dy) || 1;
    burst(r.left + lx * r.width / card.w, r.top + ly * r.height / card.h, dx / l, dy / l, 'card');
  }

  // Landing on a section: marks elsewhere fade away, so each visit starts clean
  function land(section) {
    if (section === landed) return;
    landed = section;
    cache.delete(section);
    pending.length = 0;
    holes.forEach((list, s) => {
      if (s === section) return;
      list.forEach(retire);
      holes.delete(s);
    });
  }

  // ---------- Hero headline damage ----------
  const heroTitle = document.querySelector('.hero__title');
  let letters = [], lettersAt = 0, lastLetterHit = 0;
  const damaged = new Set();
  const pendingLetters = new Set();
  function heroLetters() {
    const t = now();
    if (t - lettersAt < 700) return letters;
    lettersAt = t;
    letters = heroTitle ? [...heroTitle.querySelectorAll('ash-c')].map(el => {
      const r = el.getBoundingClientRect();
      return { el, x: r.left + r.width / 2, y: r.top + r.height * .56, w: r.width };
    }).filter(l => l.w > 4 && l.y > 60 && l.y < innerHeight) : [];
    return letters;
  }
  function findLetterHit(x0, y0, x1, y1) {
    if (reduced || landed !== 0 || Flight.settled !== 0 || !heroTitle) return null;
    const t = now();
    if (t - lastLetterHit < 220 || pendingLetters.size > 2) return null;
    const aim = Math.atan2(y1 - y0, x1 - x0), reach = Math.hypot(x1 - x0, y1 - y0);
    const found = [];
    for (const l of heroLetters()) {
      if (pendingLetters.has(l.el)) continue;
      const dx = l.x - x0, dy = l.y - y0, dist = Math.hypot(dx, dy);
      if (dist < 60 || dist > reach) continue;
      let da = Math.abs(Math.atan2(dy, dx) - aim);
      if (da > Math.PI) da = Math.PI * 2 - da;
      if (da > .42) continue;
      const dmg = +(l.el.dataset.dmg || 0);
      // fresh letters are likelier targets, so damage spreads across the headline
      const weight = dmg >= 3 ? .15 : 1 - dmg * .25;
      if (Math.random() < weight) found.push({ l, dist });
    }
    if (!found.length) return null;
    const c = found[Math.floor(Math.random() * found.length)];
    lastLetterHit = t;
    pendingLetters.add(c.l.el);
    return { letter: c.l.el, x: c.l.x + rnd(-.2, .2) * c.l.w, y: c.l.y + rnd(-6, 6), t: Math.min(1, c.dist / reach) };
  }
  function hitLetter(hit, dir) {
    const el = hit.letter;
    pendingLetters.delete(el);
    if (!el.isConnected || Flight.settled !== 0) return;
    const dmg = Math.min(3, +(el.dataset.dmg || 0) + 1);
    el.dataset.dmg = dmg;
    if (!el.dataset.crack) el.dataset.crack = String(Math.floor(Math.random() * 3));
    if (!el.dataset.tilt) el.dataset.tilt = Math.random() < .5 ? 'l' : 'r';
    el.classList.add('is-dmg');
    el._healAt = now() + 6500;
    damaged.add(el);
    if (el.animate) {
      el.animate([
        { color: '#FFFBEA', textShadow: '0 0 .25em #FFB35A, 0 0 .06em #FFFFFF', transform: 'scale(1.14) translateY(-.03em)' },
        { color: '#FFC27A', textShadow: '0 0 .2em rgba(255,120,30,.8)', offset: .35 },
      ], { duration: 520, easing: 'ease-out' });
    }
    const dx = dir ? dir.x : -1, dy = dir ? -dir.y : 0;
    const l = Math.hypot(dx, dy) || 1;
    burst(hit.x, hit.y, dx / l, dy / l, 'letter');
  }
  // Damage cools off: one step every couple of seconds once a letter hasn't been hit for a while
  setInterval(() => {
    const t = now();
    damaged.forEach(el => {
      if (t < el._healAt) return;
      const dmg = +(el.dataset.dmg || 0) - 1;
      if (dmg <= 0 || !el.isConnected) {
        el.classList.remove('is-dmg');
        delete el.dataset.dmg;
        delete el.dataset.crack;
        delete el.dataset.tilt;
        damaged.delete(el);
      } else {
        el.dataset.dmg = dmg;
        el._healAt = t + 2400;
      }
    });
  }, 500);

  window.Impacts = { tracer, frame, findHit, hole, land, burst, reticle, lock, findLetterHit, hitLetter };
})();
