/* =========================================================
   Background sky, drawn small and stretched by the GPU (so the blur is free).
   Day: a living mesh gradient in the Solar Pop palette, graded for contrast (an "HDR" look): deep coral,
   pink and amber fields around a bright cream core, with the corners burnt in a little. The fields drift
   on slow orbits; the cursor pulls them around and shifts their colours, a warm glow follows it, and the
   plane drags the fields along in its wake.
   A smooth level band (DAY_BAND) runs across the top: purple, candy red, pink, dark orange and candy brown.
   Night: a candy aurora over a near-black plum sky. Curtains of candy orange and pink light run as straight,
   level bands across the top of the screen, light-shafts reaching up and a soft tail melting down into the
   sky; the whole sky is still at rest and only drifts, very slowly, in response to the cursor (the hover
   ripple), and flares and lifts where the plane flies through.
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
    { cx: .14, cy: .18, ox: .10, oy: .08, r: .52, depth: .9, w: .11, day: ['#ff9a5c', '#ff94b4', .82] },
    { cx: .86, cy: .14, ox: .08, oy: .10, r: .56, depth: .6, w: .08, day: ['#ffb0c4', '#ffab4f', .9] },
    { cx: .78, cy: .86, ox: .12, oy: .07, r: .5, depth: 1.1, w: .09, day: ['#ff9b3d', '#ff5f8a', .78] },
    { cx: .26, cy: .9, ox: .09, oy: .06, r: .44, depth: .75, w: .13, day: ['#ff6f91', '#ff8a3d', .58] },
    { cx: .52, cy: .46, ox: .16, oy: .12, r: .42, depth: .5, w: .07, day: ['#fff8ee', '#fff1dc', .95] },
    { cx: .04, cy: .62, ox: .06, oy: .12, r: .4, depth: 1.3, w: .1, day: ['#ffd3bd', '#ffeccc', .9] },
  ];
  // The day sky is never one fixed picture: the whole palette moves through three morning moods
  // (coral sunrise → gold mid-morning → rose haze → back) on a slow loop, each field cross-fading to its
  // colours in the next mood, so the gradient keeps transitioning even when nothing touches it.
  const DAY_MOODS = [
    ['#ff9a5c', '#ffb0c4', '#ff9b3d', '#ff6f91', '#fff8ee', '#ffd3bd'],    // coral sunrise (the original)
    ['#ffb347', '#ffc98a', '#ff8a3d', '#ff9a6b', '#fffaf0', '#ffe6b8'],    // gold mid-morning
    ['#ff8fb3', '#ffb8d0', '#ff7a6b', '#f7779f', '#fff4f2', '#ffd6dc'],    // rose haze
  ].map(m => m.map(hex));
  const MOOD_SECONDS = 14;                   // per mood, plus the cross-fade into the next
  const BASE_DAY = hex('#fce3cb');
  // contrast grade: the corners burn in a little, and a bright cream core lifts the middle
  const VIGNETTE_DAY = hex('#c8421e'), CORE_DAY = hex('#fffaf2');
  const CURSOR_DAY = [hex('#ff6d34'), hex('#ef4a76'), .2];
  const WAKE_DAY = [hex('#ff6d34'), .26];
  FIELDS.forEach((f, i) => {
    f.day = [hex(f.day[0]), hex(f.day[1]), f.day[2]];
    f.ph = i * 1.7 + Math.random() * 2;
    f.dx = 0; f.dy = 0; f.vx = 0; f.vy = 0;
  });

  // ---------- Night: the aurora ----------
  // Sky from top to bottom: near-black ink into a very dark plum near the horizon
  const SKY = [[0, hex('#010108')], [.45, hex('#05030c')], [1, hex('#100611')]];
  // Curtains: straight, level bands of light running edge to edge across the top of the sky (no arch, no
  // droop), together filling roughly the top 30% of the screen. "y" is the band's lower edge as a fraction of the screen
  // height, kept above the section headings so the text never sits on the brightest part; "ray" is how far
  // the light-shafts reach up from it. The ripple is a travelling wave along X, so the band stays level and
  // only shimmers. They sit high enough that the lower edge fades out into the plain sky well before the
  // headings, which is what keeps every line of text on top of them readable.
  const CURTAINS = [
    { y: .215, ray: .2, amp: .014, f1: 2.1, f2: 5.3, s1: .09, s2: .05, bright: .85, cols: ['#ff7a2f', '#ff4f9a', '#ffa43d'] },
    { y: .185, ray: .18, amp: .018, f1: 1.5, f2: 4.1, s1: -.07, s2: .06, bright: .95, cols: ['#ff5fa2', '#ff8a3d', '#ff3d7f'] },
    { y: .24, ray: .22, amp: .012, f1: 1.2, f2: 3.3, s1: .05, s2: -.04, bright: .6, cols: ['#ff9f45', '#ff6fb5', '#ff6d34'] },
  ];
  // Sunlit: one smooth, level band of colour across the top — no rays, no streaks — running purple →
  // candy red → pink → dark orange → dark candy brown along its length. It is drawn as a soft vertical mask
  // (riding the same gentle ripple as the aurora) filled with that horizontal gradient, which drifts slowly
  // sideways; the cursor brightens and lifts the stretch of band nearest to it.
  const DAY_BAND = {
    y: .2, depth: .3, amp: .012, f1: 1.4, f2: 3.6, s1: .07, s2: .05, ph: Math.random() * 6,
    stops: ['#6d3fa0', '#d7263d', '#ff5c8a', '#e0571c', '#5a2a1c'],
  };
  // One vertical ray, pre-drawn per colour: light gathered toward the band's lower edge, shafts fading
  // upward, and a long soft tail below so the band melts into the sky instead of stopping on a hard line.
  // `hot` pushes the brightest stripe toward a cream (night: peachy cream, day: warm white).
  const RAY_H = 160;
  const raySprite = (rgb, hotTo, hotK) => {
    const s = document.createElement('canvas');
    s.width = 1; s.height = RAY_H;
    const g = s.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, RAY_H);
    const c = `${rgb[0]},${rgb[1]},${rgb[2]}`;
    const hot = rgb.map((v, i) => Math.round(v + (hotTo[i] - v) * hotK)).join(',');
    gr.addColorStop(0, `rgba(${c},0)`);
    gr.addColorStop(.18, `rgba(${c},.2)`);
    gr.addColorStop(.42, `rgba(${c},.55)`);
    gr.addColorStop(.62, `rgba(${c},.85)`);
    gr.addColorStop(.68, `rgba(${hot},.9)`);
    gr.addColorStop(.76, `rgba(${c},.45)`);
    gr.addColorStop(.88, `rgba(${c},.12)`);
    gr.addColorStop(1, `rgba(${c},0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, 1, RAY_H);
    return s;
  };
  CURTAINS.forEach((c, i) => {
    c.ph = i * 2.3 + Math.random() * 3; c.cols = c.cols.map(hex);
    c.sprites = c.cols.map(rgb => raySprite(rgb, [255, 236, 214], .4));
  });
  // the day band's vertical profile: transparent above, full through the middle, a long soft fade below
  const BAND_H = 128;
  const bandMask = (() => {
    const m = document.createElement('canvas');
    m.width = 1; m.height = BAND_H;
    const g = m.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, BAND_H);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(.22, 'rgba(0,0,0,.55)');
    gr.addColorStop(.5, 'rgba(0,0,0,1)');
    gr.addColorStop(.72, 'rgba(0,0,0,.6)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 1, BAND_H);
    return m;
  })();
  const bandCanvas = document.createElement('canvas');
  const bctx = bandCanvas.getContext('2d');
  const AIRGLOW = hex('#2c0c22');
  const CURSOR_NIGHT = [hex('#ff6fb5'), hex('#ffa43d'), .14];
  const WAKE_NIGHT = [hex('#ff8a3d'), .16];

  const SCALE = 1 / 5;
  let W = 1, H = 1, cw = 1, ch = 1;
  function size() {
    W = Math.max(1, innerWidth); H = Math.max(1, innerHeight);
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
  // Day <-> night runs on the clock, not a lerp: the same 1.5 s ease-in-out as the page's own view-transition
  // cross-fade (css: ::view-transition-*), so the sky and the page arrive together with no lagging tail.
  const THEME_FADE = 1.5;
  const easeIO = x => (x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
  const theme = { k: document.documentElement.dataset.theme === 'night' ? 1 : 0, target: 0, from: 0, t: 1 };
  theme.target = theme.from = theme.k;
  addEventListener('themechange', e => {
    theme.from = theme.k;
    theme.target = e.detail.night ? 1 : 0;
    theme.t = reduced ? 1 : 0;
  });

  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a.toFixed(3)})`;
  const mixC = (a, b, k, out) => { out[0] = lerp(a[0], b[0], k); out[1] = lerp(a[1], b[1], k); out[2] = lerp(a[2], b[2], k); return out; };
  const cA = [0, 0, 0], cB = [0, 0, 0], cC = [0, 0, 0];

  function blob(x, y, r, c, a) {
    if (a < .004) return;
    const X = x * SCALE, Y = y * SCALE, R = r * SCALE;
    if (!isFinite(X) || !isFinite(Y) || !(R > 0)) return;
    const g = ctx.createRadialGradient(X, Y, 0, X, Y, R);
    g.addColorStop(0, rgba(c, a));
    g.addColorStop(.45, rgba(c, a * .62));
    g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g;
    ctx.fillRect(X - R, Y - R, R * 2, R * 2);
  }

  let last = performance.now(), t = Math.random() * 100;
  // The aurora's own clock: unlike `t`, it only creeps forward while the pointer is stirring the sky
  // (see `ptr.stir` below), so the curtains sit still at rest and drift very slowly under the cursor.
  let auroraT = Math.random() * 100;
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
    // where we are in the mood loop: hold, then a smooth cross-fade into the next mood
    const mp = (t / MOOD_SECONDS) % DAY_MOODS.length;
    const m0 = Math.floor(mp), m1 = (m0 + 1) % DAY_MOODS.length;
    const mf = mp - m0, mk = mf < .45 ? 0 : (x => x * x * (3 - 2 * x))((mf - .45) / .55);
    for (let i = 0; i < FIELDS.length; i++) {
      const f = FIELDS[i];
      // orbits run a touch quicker than before, so the mesh visibly breathes
      const hx = (f.cx + Math.sin(t * f.w * 3 + f.ph) * f.ox) * W;
      const hy = (f.cy + Math.cos(t * f.w * 2.4 + f.ph * 1.3) * f.oy) * H;
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
      // …and the whole mesh drifts through the mood loop on top of that
      mixC(DAY_MOODS[m0][i], DAY_MOODS[m1][i], mk, cA);
      mixC(cC, cA, .6, cC);
      blob(x, y, fr * (1 + Math.sin(t * .3 + f.ph) * .06), cC, f.day[2]);
    }
    if (ptr.seen) {
      mixC(CURSOR_DAY[0], CURSOR_DAY[1], mx, cC);
      const speed = Math.min(1, Math.hypot(mdx, mdy) / 40);
      blob(ptr.sx, ptr.sy, L * (.26 + speed * .04), cC, CURSOR_DAY[2] * (1 + speed * .4));
    }
    if (plane.ok) blob(plane.sx, plane.sy, L * (.18 + plane.k * .1), WAKE_DAY[0], WAKE_DAY[1] * (.3 + plane.k * .7));
    // grade: a soft cream highlight in the middle and burnt-in corners, for depth and contrast
    const cx = cw * (.5 + (mx - .5) * .08), cy = ch * (.44 + (my - .5) * .06);
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(cw, ch) * .42);
    core.addColorStop(0, rgba(CORE_DAY, .42));
    core.addColorStop(1, rgba(CORE_DAY, 0));
    ctx.fillStyle = core;
    ctx.fillRect(0, 0, cw, ch);
    drawDayBand(a);
    ctx.globalAlpha = a;
    const vig = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * .35, cw / 2, ch / 2, Math.hypot(cw, ch) * .62);
    vig.addColorStop(0, rgba(VIGNETTE_DAY, 0));
    vig.addColorStop(1, rgba(VIGNETTE_DAY, .2));
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, cw, ch);
    ctx.globalAlpha = 1;
  }

  // The sunlit band: mask the band's shape column by column on a scratch canvas, fill that mask with the
  // horizontal palette, then lay it over the mesh in one draw.
  function drawDayBand(a) {
    const B = DAY_BAND;
    if (bandCanvas.width !== cw || bandCanvas.height !== ch) { bandCanvas.width = cw; bandCanvas.height = ch; }
    bctx.globalCompositeOperation = 'source-over';
    bctx.clearRect(0, 0, cw, ch);
    const mX = ptr.seen ? ptr.sx / W : -9, mY = ptr.seen ? ptr.sy / H : -9;
    const h = B.depth * ch;
    for (let x = 0; x < cw; x++) {
      const X = x / cw;
      const near = Math.exp(-((X - mX) ** 2) / .015) * Math.exp(-((B.y - mY) ** 2) / .04) * ptr.stir;
      const yN = B.y
        + B.amp * Math.sin(X * 2 * B.f1 * Math.PI + auroraT * B.s1 * 6 + B.ph)
        + B.amp * .5 * Math.sin(X * 2 * B.f2 * Math.PI - auroraT * B.s2 * 9 + B.ph * 1.7)
        - near * .025;
      bctx.globalAlpha = Math.min(1, (Math.min(1, X * 6, (1 - X) * 6) * .35 + .65) + near * .35);
      bctx.drawImage(bandMask, x, yN * ch - h / 2, 1.6, h);
    }
    bctx.globalAlpha = 1;
    bctx.globalCompositeOperation = 'source-in';
    const drift = (t * .012) % 1;
    const gr = bctx.createLinearGradient(-cw * drift, 0, cw * (2 - drift), 0);
    const n = B.stops.length;
    // the palette runs twice across a double-width gradient, so the sideways drift loops seamlessly
    for (let r = 0; r < 2; r++) B.stops.forEach((c, i) => gr.addColorStop(Math.min(1, (r + i / n) / 2), c));
    gr.addColorStop(1, B.stops[0]);
    bctx.fillStyle = gr;
    bctx.fillRect(0, 0, cw, ch);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = a * .58;
    ctx.drawImage(bandCanvas, 0, 0);
    ctx.globalAlpha = a;
  }

  // The level band of light both themes share. Each column is one shaft; its lower edge rides a gentle
  // travelling ripple, the cursor makes the nearest stretch ripple and glow (the hover effect), and the
  // plane lifts and flares it where it flies through.
  const SHAFT_EDGE = .66;                                   // where the bright edge sits inside the sprite
  function drawCurtains(set, a, mx, op, gain) {
    ctx.globalCompositeOperation = op;
    const pX = plane.ok ? plane.sx / W : -9, pY = plane.ok ? plane.sy / H : -9;
    const mX = ptr.seen ? ptr.sx / W : -9, mY = ptr.seen ? ptr.sy / H : -9;
    const breathe = .82 + .18 * Math.sin(auroraT * .23);
    for (const c of set) {
      const top = c.ray * ch, h = top / SHAFT_EDGE;
      for (let x = 0; x < cw; x++) {
        const X = x / cw;
        const nearM = Math.exp(-((X - mX) ** 2) / .012) * Math.exp(-((c.y - mY) ** 2) / .03) * ptr.stir;
        const nearP = Math.exp(-((X - pX) ** 2) / .006) * Math.exp(-((c.y - pY) ** 2) / .03) * plane.stir;
        const yN = c.y
          + c.amp * Math.sin(X * 2 * c.f1 * Math.PI + auroraT * c.s1 * 6 + c.ph)
          + c.amp * .45 * Math.sin(X * 2 * c.f2 * Math.PI - auroraT * c.s2 * 9 + c.ph * 1.7)
          + nearM * .03 * Math.sin(auroraT * 5 + X * 30)
          - nearP * .05;
        // rays: bright and dim streaks that slowly drift along the band
        let I = (.5 + .5 * Math.sin(X * 41 + auroraT * .9 + c.ph)) * (.55 + .45 * Math.sin(X * 13 - auroraT * .5 + c.ph * 2));
        I = (.3 + .7 * I) * c.bright * breathe;
        I *= Math.min(1, X * 5, (1 - X) * 5) * .5 + .5;           // eases off toward the screen edges
        I += nearM * .55 + nearP * .9;
        if (I < .02) continue;
        // colour along the band, nudged by where the cursor is
        const u = .5 + .5 * Math.sin(X * 2.6 + auroraT * .11 + c.ph + (mx - .5) * 2.2);
        const i0 = u < .5 ? 0 : 1, w = u < .5 ? u * 2 : (u - .5) * 2;
        const y0 = yN * ch - top;
        ctx.globalAlpha = a * clamp(I, 0, 1.4) * (1 - w) * gain;
        ctx.drawImage(c.sprites[i0], x, y0, 1.6, h);
        ctx.globalAlpha = a * clamp(I, 0, 1.4) * w * gain;
        ctx.drawImage(c.sprites[i0 + 1], x, y0, 1.6, h);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  function drawAurora(a, mx, L) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = a;
    const sky = ctx.createLinearGradient(0, 0, 0, ch);
    SKY.forEach(([o, c]) => sky.addColorStop(o, rgba(c, 1)));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, cw, ch);
    // a faint plum airglow under the curtains
    const glow = ctx.createLinearGradient(0, 0, 0, ch * .75);
    glow.addColorStop(0, rgba(AIRGLOW, 0));
    glow.addColorStop(.55, rgba(AIRGLOW, .55));
    glow.addColorStop(1, rgba(AIRGLOW, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, cw, ch);

    // curtains of light, added on top of each other
    drawCurtains(CURTAINS, a, mx, 'lighter', .5);
    ctx.globalCompositeOperation = 'source-over';
    // soft candy glows for the cursor and the plane's wake
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
    theme.t = Math.min(1, theme.t + dt / THEME_FADE);
    theme.k = theme.from + (theme.target - theme.from) * easeIO(theme.t);
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
    // the aurora's clock only ticks while the cursor is stirring it, and only a little — it sits still at rest
    if (!reduced) auroraT += dt * ptr.stir * .18;

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
    drawStars(dt, n, mx, my);
  }

  // ---------- Night: a live starfield ----------
  // Real stars, not a texture: each one scintillates on its own clock (two detuned waves, so the
  // twinkle never looks like a metronome), the brightest carry a soft halo and four-point diffraction
  // spikes that flare as they twinkle, and every so often one catches a brief extra glint. Drawn at
  // full resolution on its own canvas (the sky canvas is deliberately blurry), with a hair of parallax
  // against the cursor. Stars fade out through the aurora band so the light reads as in front of them.
  const starCanvas = document.querySelector('.bg__starfield');
  const sctx = starCanvas && starCanvas.getContext('2d');
  const stars = [];
  let sW = 0, sH = 0, sDpr = 1, starsOn = false;
  const STAR_TINTS = ['255,246,234', '255,246,234', '255,228,217', '255,210,218', '220,230,255'];
  const glowSprite = tint => {
    const s = document.createElement('canvas');
    s.width = s.height = 64;
    const g = s.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, `rgba(${tint},.9)`);
    gr.addColorStop(.18, `rgba(${tint},.35)`);
    gr.addColorStop(.5, `rgba(${tint},.08)`);
    gr.addColorStop(1, `rgba(${tint},0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    return s;
  };
  const GLOWS = STAR_TINTS.map(glowSprite);
  function sizeStars() {
    if (!starCanvas) return;
    sDpr = Math.min(1.75, devicePixelRatio || 1);
    sW = innerWidth; sH = innerHeight;
    starCanvas.width = Math.round(sW * sDpr); starCanvas.height = Math.round(sH * sDpr);
    sctx.setTransform(sDpr, 0, 0, sDpr, 0, 0);
    // density follows the screen area: roughly one star per 5,000 px², capped
    const want = Math.min(420, Math.round(sW * sH / 5000));
    stars.length = 0;
    for (let i = 0; i < want; i++) {
      const bright = Math.random() < .07;
      stars.push({
        x: Math.random(), y: Math.random(), depth: .3 + Math.random() * .7,
        r: bright ? 1.1 + Math.random() * .9 : .35 + Math.random() * .75,
        base: bright ? .85 : .25 + Math.random() * .55,
        f1: .6 + Math.random() * 2.2, f2: 2.5 + Math.random() * 4, ph: Math.random() * 6.28,
        tint: Math.floor(Math.random() * STAR_TINTS.length), bright, glint: 0,
      });
    }
  }
  if (starCanvas) { sizeStars(); addEventListener('resize', sizeStars); }
  let starT = 0;
  function drawStars(dt, n, mx, my) {
    if (!starCanvas) return;
    if (n < .01) { if (starsOn) { sctx.clearRect(0, 0, sW, sH); starsOn = false; } return; }
    starsOn = true;
    if (!reduced) starT += dt;
    sctx.clearRect(0, 0, sW, sH);
    const px = (mx - .5) * 14, py = (my - .5) * 10;
    for (const s of stars) {
      // twinkle: two detuned waves, sharpened so a star dips and sparkles rather than pulsing evenly
      let tw = .5 + .3 * Math.sin(starT * s.f1 + s.ph) + .2 * Math.sin(starT * s.f2 + s.ph * 1.7);
      tw = tw * tw;
      if (!reduced && !s.glint && Math.random() < dt * .02) s.glint = 1;     // the odd bright glint
      if (s.glint) s.glint = Math.max(0, s.glint - dt * 1.6);
      const y = s.y * sH;
      // under the aurora band (top ~30% of the sky) the stars are washed out by its light
      const band = y < sH * .34 ? .3 + .7 * Math.min(1, Math.abs(y / sH - .2) / .14) : 1;
      const a = n * band * Math.min(1, s.base * (.35 + .9 * tw) + s.glint * .8);
      if (a < .02) continue;
      const x = s.x * sW + px * s.depth, yy = y + py * s.depth;
      const r = s.r * (.85 + .3 * tw + s.glint * .6);
      if (s.bright || s.glint > .05) {
        const gs = r * (s.bright ? 10 : 7) * (1 + s.glint);
        sctx.globalAlpha = a * .7;
        sctx.drawImage(GLOWS[s.tint], x - gs, yy - gs, gs * 2, gs * 2);
        // diffraction spikes, longest at the top of a twinkle
        const sp = r * (4 + 7 * tw + 10 * s.glint);
        sctx.globalAlpha = a * .55;
        sctx.strokeStyle = `rgb(${STAR_TINTS[s.tint]})`;
        sctx.lineWidth = .6;
        sctx.beginPath();
        sctx.moveTo(x - sp, yy); sctx.lineTo(x + sp, yy);
        sctx.moveTo(x, yy - sp); sctx.lineTo(x, yy + sp);
        sctx.stroke();
      }
      sctx.globalAlpha = a;
      sctx.fillStyle = `rgb(${STAR_TINTS[s.tint]})`;
      sctx.beginPath();
      sctx.arc(x, yy, r, 0, Math.PI * 2);
      sctx.fill();
    }
    sctx.globalAlpha = 1;
  }
  if (location.search.includes('debug')) window.__sky = { theme, ptr, plane, draw };
  draw(0);
  requestAnimationFrame(frame);
})();
