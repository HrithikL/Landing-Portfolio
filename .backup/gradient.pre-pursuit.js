/* =========================================================
   Background sky, drawn small and stretched by the GPU (so the blur is free).
   Day: a living mesh gradient in the Solar Pop palette. Soft colour fields drift on slow orbits;
   the cursor pulls them around and shifts their colours, a warm glow follows it, and the plane
   drags the fields along in its wake.
   Night: an aurora over a deep blue-green sky. Curtains of green, emerald and lime light hang across
   the top of the screen with rays reaching up; they ripple and brighten where the cursor is and
   flare and bend where the plane flies through.
   ========================================================= */
(() => {
  const canvas = document.querySelector('.bg__mesh');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const lerp = (a, b, k) => a + (b - a) * k;

  // ---------- Day: colour fields ----------
  // Each field: orbit centre (0..1), orbit size, radius (x the long side), depth (how much it follows the
  // pointer), and the two colours it moves between as the cursor crosses the screen
  const FIELDS = [
    { cx: .14, cy: .18, ox: .10, oy: .08, r: .52, depth: .9, w: .11, day: ['#fcaf7b', '#ffd2da', .78] },
    { cx: .86, cy: .14, ox: .08, oy: .10, r: .56, depth: .6, w: .08, day: ['#ffd2da', '#fbbd76', .9] },
    { cx: .78, cy: .86, ox: .12, oy: .07, r: .5, depth: 1.1, w: .09, day: ['#fbbd76', '#ff839b', .62] },
    { cx: .26, cy: .9, ox: .09, oy: .06, r: .44, depth: .75, w: .13, day: ['#ff839b', '#fcaf7b', .36] },
    { cx: .52, cy: .46, ox: .16, oy: .12, r: .42, depth: .5, w: .07, day: ['#fff2d7', '#ffe4d9', .85] },
    { cx: .04, cy: .62, ox: .06, oy: .12, r: .4, depth: 1.3, w: .1, day: ['#ffe4d9', '#fff2d7', .9] },
  ];
  const BASE_DAY = hex('#fdf0e0');
  const CURSOR_DAY = [hex('#ff6d34'), hex('#ef4a76'), .2];
  const WAKE_DAY = [hex('#ff6d34'), .26];
  FIELDS.forEach((f, i) => {
    f.day = [hex(f.day[0]), hex(f.day[1]), f.day[2]];
    f.ph = i * 1.7 + Math.random() * 2;
    f.dx = 0; f.dy = 0; f.vx = 0; f.vy = 0;
  });

  // ---------- Night: the aurora ----------
  // Sky from top to bottom: deep navy-teal, into a dark green-blue near the horizon
  const SKY = [[0, hex('#020a16')], [.45, hex('#04151f')], [1, hex('#061d1f')]];
  // Curtains: where their lower edge hangs (fraction of the height), how far the rays reach up, how they wave,
  // and the colours they run through along their length
  const CURTAINS = [
    { y: .2, ray: .2, amp: .045, f1: 2.1, f2: 5.3, s1: .09, s2: .05, bright: .9, cols: ['#39ff88', '#b6ff3b', '#12d27a'] },
    { y: .33, ray: .3, amp: .06, f1: 1.5, f2: 4.1, s1: -.07, s2: .06, bright: 1, cols: ['#1fe08a', '#7dff4d', '#0fbf8f'] },
    { y: .46, ray: .34, amp: .05, f1: 1.2, f2: 3.3, s1: .05, s2: -.04, bright: .75, cols: ['#12c98a', '#3dff9e', '#9cff3a'] },
  ];
  CURTAINS.forEach((c, i) => { c.ph = i * 2.3 + Math.random() * 3; c.cols = c.cols.map(hex); });
  // One vertical ray, pre-drawn per colour: light concentrated at the curtain's lower edge, rays fading upwards
  const RAY_H = 128;
  const raySprite = rgb => {
    const s = document.createElement('canvas');
    s.width = 1; s.height = RAY_H;
    const g = s.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, RAY_H);
    const c = `${rgb[0]},${rgb[1]},${rgb[2]}`;
    gr.addColorStop(0, `rgba(${c},0)`);
    gr.addColorStop(.55, `rgba(${c},.35)`);
    gr.addColorStop(.86, `rgba(${c},1)`);
    gr.addColorStop(.92, `rgba(${c},.55)`);
    gr.addColorStop(1, `rgba(${c},0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, 1, RAY_H);
    return s;
  };
  CURTAINS.forEach(c => { c.sprites = c.cols.map(raySprite); });
  const AIRGLOW = hex('#0c3b2c');
  const CURSOR_NIGHT = [hex('#2bff8e'), hex('#b6ff3b'), .14];
  const WAKE_NIGHT = [hex('#7dff4d'), .16];

  const SCALE = 1 / 5;
  let W = 1, H = 1, cw = 1, ch = 1;
  function size() {
    W = innerWidth; H = innerHeight;
    cw = Math.max(40, Math.ceil(W * SCALE));
    ch = Math.max(30, Math.ceil(H * SCALE));
    canvas.width = cw;
    canvas.height = ch;
  }
  size();
  addEventListener('resize', () => { size(); draw(0); });

  // Pointer: position (smoothed) and the movement since the last frame
  const ptr = { x: W * .5, y: H * .4, sx: W * .5, sy: H * .4, px: W * .5, py: H * .4, seen: false, stir: 0 };
  addEventListener('pointermove', e => {
    ptr.x = e.clientX; ptr.y = e.clientY;
    if (!ptr.seen) { ptr.seen = true; ptr.sx = ptr.px = ptr.x; ptr.sy = ptr.py = ptr.y; }
  }, { passive: true });

  const plane = { x: 0, y: 0, px: 0, py: 0, sx: 0, sy: 0, k: 0, ok: false, stir: 0 };
  const theme = { k: document.documentElement.dataset.theme === 'night' ? 1 : 0, target: 0 };
  theme.target = theme.k;
  addEventListener('themechange', e => { theme.target = e.detail.night ? 1 : 0; });

  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a.toFixed(3)})`;
  const mixC = (a, b, k, out) => { out[0] = lerp(a[0], b[0], k); out[1] = lerp(a[1], b[1], k); out[2] = lerp(a[2], b[2], k); return out; };
  const cA = [0, 0, 0], cB = [0, 0, 0], cC = [0, 0, 0];

  function blob(x, y, r, c, a) {
    if (a < .004) return;
    const X = x * SCALE, Y = y * SCALE, R = r * SCALE;
    const g = ctx.createRadialGradient(X, Y, 0, X, Y, R);
    g.addColorStop(0, rgba(c, a));
    g.addColorStop(.45, rgba(c, a * .62));
    g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g;
    ctx.fillRect(X - R, Y - R, R * 2, R * 2);
  }

  let last = performance.now(), t = Math.random() * 100;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = clamp((now - last) / 1000, 1e-3, .05);
    last = now;
    draw(dt);
  }

  function drawDay(dt, a, mx, my, mdx, mdy, pdx, pdy, L) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = a;
    ctx.fillStyle = rgba(BASE_DAY, 1);
    ctx.fillRect(0, 0, cw, ch);
    const K = 2.6, C = 2.1;                  // spring back home, damping
    for (let i = 0; i < FIELDS.length; i++) {
      const f = FIELDS[i];
      const hx = (f.cx + Math.sin(t * f.w * 2 + f.ph) * f.ox) * W;
      const hy = (f.cy + Math.cos(t * f.w * 1.6 + f.ph * 1.3) * f.oy) * H;
      // parallax: every field leans towards the cursor by its depth
      const lx = (mx - .5) * W * .14 * f.depth, ly = (my - .5) * H * .12 * f.depth;
      const x = hx + lx + f.dx, y = hy + ly + f.dy;
      // stirred by the cursor's movement and by the plane passing through
      const fr = f.r * L;
      const dmx = x - ptr.x, dmy = y - ptr.y;
      const fallM = Math.exp(-(dmx * dmx + dmy * dmy) / (fr * fr * .45));
      f.vx += mdx * fallM * 5.5; f.vy += mdy * fallM * 5.5;
      if (plane.ok && plane.k > .02) {
        const dpx = x - plane.x, dpy = y - plane.y;
        const fallP = Math.exp(-(dpx * dpx + dpy * dpy) / (fr * fr * .3)) * plane.k;
        f.vx += pdx * fallP * 7; f.vy += pdy * fallP * 7;
      }
      f.vx += (-f.dx * K - f.vx * C) * dt;
      f.vy += (-f.dy * K - f.vy * C) * dt;
      f.dx = clamp(f.dx + f.vx * dt, -L * .35, L * .35);
      f.dy = clamp(f.dy + f.vy * dt, -L * .35, L * .35);
      // colour: each field slides between its two colours as the cursor crosses the screen
      mixC(f.day[0], f.day[1], i % 2 ? my : mx, cC);
      blob(x, y, fr * (1 + Math.sin(t * .3 + f.ph) * .06), cC, f.day[2]);
    }
    if (ptr.seen) {
      mixC(CURSOR_DAY[0], CURSOR_DAY[1], mx, cC);
      const speed = Math.min(1, Math.hypot(mdx, mdy) / 40);
      blob(ptr.sx, ptr.sy, L * (.26 + speed * .04), cC, CURSOR_DAY[2] * (1 + speed * .4));
    }
    if (plane.ok) blob(plane.sx, plane.sy, L * (.18 + plane.k * .1), WAKE_DAY[0], WAKE_DAY[1] * (.3 + plane.k * .7));
    ctx.globalAlpha = 1;
  }

  function drawAurora(a, mx, L) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = a;
    const sky = ctx.createLinearGradient(0, 0, 0, ch);
    SKY.forEach(([o, c]) => sky.addColorStop(o, rgba(c, 1)));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, cw, ch);
    // a faint green airglow under the curtains
    const glow = ctx.createLinearGradient(0, 0, 0, ch * .75);
    glow.addColorStop(0, rgba(AIRGLOW, 0));
    glow.addColorStop(.55, rgba(AIRGLOW, .55));
    glow.addColorStop(1, rgba(AIRGLOW, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, cw, ch);

    // curtains of light, added on top of each other
    ctx.globalCompositeOperation = 'lighter';
    const pX = plane.ok ? plane.sx / W : -9, pY = plane.ok ? plane.sy / H : -9;
    const mX = ptr.seen ? ptr.sx / W : -9, mY = ptr.seen ? ptr.sy / H : -9;
    const breathe = .82 + .18 * Math.sin(t * .23);
    for (const c of CURTAINS) {
      const top = c.ray * ch;
      for (let x = 0; x < cw; x++) {
        const X = x / cw;
        // the cursor makes the nearest part of the curtain ripple and glow; the plane bends and flares it
        const nearM = Math.exp(-((X - mX) ** 2) / .012) * Math.exp(-((c.y - mY) ** 2) / .08) * ptr.stir;
        const nearP = Math.exp(-((X - pX) ** 2) / .006) * Math.exp(-((c.y - pY) ** 2) / .05) * plane.stir;
        const yN = c.y
          + c.amp * Math.sin(X * c.f1 * Math.PI + t * c.s1 * 6 + c.ph)
          + c.amp * .45 * Math.sin(X * c.f2 * Math.PI - t * c.s2 * 9 + c.ph * 1.7)
          + nearM * .05 * Math.sin(t * 5 + X * 30)
          - nearP * .07;
        // rays: bright and dim streaks that slowly drift along the curtain
        let I = (.5 + .5 * Math.sin(X * 41 + t * .9 + c.ph)) * (.55 + .45 * Math.sin(X * 13 - t * .5 + c.ph * 2));
        I = (.25 + .75 * I) * c.bright * breathe;
        I *= Math.min(1, X * 6, (1 - X) * 6) * .65 + .35;          // a touch softer at the screen edges
        I += nearM * .55 + nearP * .9;
        if (I < .02) continue;
        // colour along the curtain, nudged by where the cursor is
        const u = .5 + .5 * Math.sin(X * 2.6 + t * .11 + c.ph + (mx - .5) * 2.2);
        const i0 = u < .5 ? 0 : 1, w = u < .5 ? u * 2 : (u - .5) * 2;
        const yPx = yN * ch, h = top + ch * .06;
        ctx.globalAlpha = a * clamp(I, 0, 1.4) * (1 - w) * .62;
        ctx.drawImage(c.sprites[i0], x, yPx - top, 1.6, h);
        ctx.globalAlpha = a * clamp(I, 0, 1.4) * w * .62;
        ctx.drawImage(c.sprites[i0 + 1], x, yPx - top, 1.6, h);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    // soft green glows for the cursor and the plane's wake
    ctx.globalAlpha = a;
    if (ptr.seen) {
      mixC(CURSOR_NIGHT[0], CURSOR_NIGHT[1], mx, cC);
      blob(ptr.sx, ptr.sy, L * .2, cC, CURSOR_NIGHT[2] * (.6 + ptr.stir * .6));
    }
    if (plane.ok) blob(plane.sx, plane.sy, L * (.14 + plane.k * .08), WAKE_NIGHT[0], WAKE_NIGHT[1] * (.3 + plane.k * .7));
    ctx.globalAlpha = 1;
  }

  function draw(dt) {
    if (!reduced) t += dt;
    theme.k += (theme.target - theme.k) * Math.min(1, dt * 1.6);
    if (Math.abs(theme.target - theme.k) < .002) theme.k = theme.target;
    const n = theme.k;
    const L = Math.max(W, H);

    // pointer: smoothed position, and this frame's movement as a push on the fields
    ptr.sx += (ptr.x - ptr.sx) * Math.min(1, dt * 3.2);
    ptr.sy += (ptr.y - ptr.sy) * Math.min(1, dt * 3.2);
    const mdx = ptr.x - ptr.px, mdy = ptr.y - ptr.py;
    ptr.px = ptr.x; ptr.py = ptr.y;
    const mx = clamp(ptr.sx / W, 0, 1), my = clamp(ptr.sy / H, 0, 1);
    // how stirred-up the sky is near the cursor: rises as it moves, settles when it stops
    ptr.stir += (Math.min(1, Math.hypot(mdx, mdy) / 18) - ptr.stir) * Math.min(1, dt * (Math.hypot(mdx, mdy) > 1 ? 6 : 1.2));

    // plane: where it is on screen, how hard it is flying, and how far it moved
    const ps = window.Flight && window.Flight.planeScreen;
    let pdx = 0, pdy = 0;
    if (ps && isFinite(ps.x) && isFinite(ps.y)) {
      if (!plane.ok) { plane.ok = true; plane.x = plane.px = plane.sx = ps.x; plane.y = plane.py = plane.sy = ps.y; }
      plane.x = ps.x; plane.y = ps.y;
      pdx = clamp(plane.x - plane.px, -80, 80); pdy = clamp(plane.y - plane.py, -80, 80);
      plane.px = plane.x; plane.py = plane.y;
      plane.sx += (plane.x - plane.sx) * Math.min(1, dt * 2.2);      // the glow trails a little behind
      plane.sy += (plane.y - plane.sy) * Math.min(1, dt * 2.2);
      plane.k += (clamp(ps.k, 0, 1) - plane.k) * Math.min(1, dt * 2);
      plane.stir += (plane.k * Math.min(1, Math.hypot(pdx, pdy) / 6) - plane.stir) * Math.min(1, dt * 2.5);
    }

    if (n < .999) drawDay(dt, 1, mx, my, mdx, mdy, pdx, pdy, L);
    if (n > .001) drawAurora(n, mx, L);
  }
  if (location.search.includes('debug')) window.__sky = { theme, ptr, plane, draw };
  draw(0);
  requestAnimationFrame(frame);
})();
