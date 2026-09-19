/* =========================================================
   Background: a living mesh gradient in the Solar Pop palette
   Soft colour fields drift on slow orbits. The cursor pulls them around and shifts
   their colours, a warm glow follows it; the plane drags the fields along in its wake
   and leaves a tangerine glow behind it. Drawn small and stretched by the GPU, so the
   blur is free and a frame costs almost nothing.
   ========================================================= */
(() => {
  const canvas = document.querySelector('.bg__mesh');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const lerp = (a, b, k) => a + (b - a) * k;

  // Each field: orbit centre (0..1), orbit size, radius (x the long side), depth (how much it follows the
  // pointer), and a colour pair per theme that it moves between as the cursor crosses the screen
  const FIELDS = [
    { cx: .14, cy: .18, ox: .10, oy: .08, r: .52, depth: .9, w: .11, day: ['#fcaf7b', '#ffd2da', .78], dusk: ['#4a2630', '#33231d', .95] },
    { cx: .86, cy: .14, ox: .08, oy: .10, r: .56, depth: .6, w: .08, day: ['#ffd2da', '#fbbd76', .9], dusk: ['#33231d', '#4a2630', .95] },
    { cx: .78, cy: .86, ox: .12, oy: .07, r: .5, depth: 1.1, w: .09, day: ['#fbbd76', '#ff839b', .62], dusk: ['#ff7a4d', '#ff9ab3', .12] },
    { cx: .26, cy: .9, ox: .09, oy: .06, r: .44, depth: .75, w: .13, day: ['#ff839b', '#fcaf7b', .36], dusk: ['#ff9ab3', '#ff7a4d', .09] },
    { cx: .52, cy: .46, ox: .16, oy: .12, r: .42, depth: .5, w: .07, day: ['#fff2d7', '#ffe4d9', .85], dusk: ['#3a2e1d', '#2f211a', .85] },
    { cx: .04, cy: .62, ox: .06, oy: .12, r: .4, depth: 1.3, w: .1, day: ['#ffe4d9', '#fff2d7', .9], dusk: ['#241a15', '#3a262a', .9] },
  ];
  const BASE = { day: hex('#fdf0e0'), dusk: hex('#17100d') };
  const CURSOR = { day: [hex('#ff6d34'), hex('#ef4a76'), .2], dusk: [hex('#ff7a4d'), hex('#ff9ab3'), .16] };
  const WAKE = { day: [hex('#ff6d34'), .26], dusk: [hex('#ff8a52'), .2] };
  FIELDS.forEach((f, i) => {
    f.day = [hex(f.day[0]), hex(f.day[1]), f.day[2]];
    f.dusk = [hex(f.dusk[0]), hex(f.dusk[1]), f.dusk[2]];
    f.ph = i * 1.7 + Math.random() * 2;
    f.x = f.cx; f.y = f.cy;        // current position (px, set on first size)
    f.dx = 0; f.dy = 0; f.vx = 0; f.vy = 0;
  });

  const SCALE = 1 / 8;
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
  const ptr = { x: W * .5, y: H * .4, sx: W * .5, sy: H * .4, px: W * .5, py: H * .4, seen: false };
  addEventListener('pointermove', e => {
    ptr.x = e.clientX; ptr.y = e.clientY;
    if (!ptr.seen) { ptr.seen = true; ptr.sx = ptr.px = ptr.x; ptr.sy = ptr.py = ptr.y; }
  }, { passive: true });

  const plane = { x: 0, y: 0, px: 0, py: 0, sx: 0, sy: 0, k: 0, ok: false };
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
  function draw(dt) {
    if (!reduced) t += dt;
    theme.k += (theme.target - theme.k) * Math.min(1, dt * 1.6);
    const n = theme.k;
    const L = Math.max(W, H);

    // pointer: smoothed position, and this frame's movement as a push on the fields
    ptr.sx += (ptr.x - ptr.sx) * Math.min(1, dt * 3.2);
    ptr.sy += (ptr.y - ptr.sy) * Math.min(1, dt * 3.2);
    const mdx = ptr.x - ptr.px, mdy = ptr.y - ptr.py;
    ptr.px = ptr.x; ptr.py = ptr.y;
    const mx = clamp(ptr.sx / W, 0, 1), my = clamp(ptr.sy / H, 0, 1);

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
    }

    // ground
    mixC(BASE.day, BASE.dusk, n, cA);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = rgba(cA, 1);
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
      f.x = x; f.y = y;
      // colour: each field slides between its two colours as the cursor crosses the screen
      const k = i % 2 ? my : mx;
      const D = f.day, N = f.dusk;
      mixC(D[0], D[1], k, cA);
      mixC(N[0], N[1], k, cB);
      mixC(cA, cB, n, cC);
      blob(x, y, fr * (1 + Math.sin(t * .3 + f.ph) * .06), cC, lerp(D[2], N[2], n));
    }

    // the cursor's own glow: tangerine on the left of the screen, rose on the right
    if (ptr.seen) {
      mixC(CURSOR.day[0], CURSOR.day[1], mx, cA);
      mixC(CURSOR.dusk[0], CURSOR.dusk[1], mx, cB);
      mixC(cA, cB, n, cC);
      const speed = Math.min(1, Math.hypot(mdx, mdy) / 40);
      blob(ptr.sx, ptr.sy, L * (.26 + speed * .04), cC, lerp(CURSOR.day[2], CURSOR.dusk[2], n) * (1 + speed * .4));
    }
    // the plane's wake: a warm glow that trails it while it flies, and a faint one while it's parked
    if (plane.ok) {
      mixC(WAKE.day[0], WAKE.dusk[0], n, cC);
      const a = lerp(WAKE.day[1], WAKE.dusk[1], n) * (.3 + plane.k * .7);
      blob(plane.sx, plane.sy, L * (.18 + plane.k * .1), cC, a);
    }
  }
  draw(0);
  requestAnimationFrame(frame);
})();
