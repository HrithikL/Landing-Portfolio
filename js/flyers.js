/* =========================================================
   Ambient flyers: every so often a small replica of the site's own biplane (orange cowling and spinner,
   charcoal fuselage with orange trim, red-pink wings, silver exhausts) crosses the screen on a smooth,
   near-level line with a gentle bob and a spinning prop.
   They only ever fly BEHIND the information sections (#flyers-back, under the page): wherever one of the
   section's blocks is (heading, card, tile grid…) the plane is clipped out completely, and it reappears the
   moment it is back in open sky — the same rule the 3D background planes follow (dogfight.js placeMasks).
   Planes never overlap each other: each one reserves its own lane of sky for its whole crossing, and a
   new plane only launches into a lane that is clear. Nothing steers or stalls, so the motion stays smooth.
   The airframe is painted once to an offscreen sprite; each frame is just a drawImage plus the prop.
   Off during the dogfight, while a panel is open, and for reduced motion.
   ========================================================= */
(() => {
  const back = document.getElementById('flyers-back');
  if (!back || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const layers = [back].map(c => ({ c, ctx: c.getContext('2d') }));
  const root = document.documentElement;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  let W = 0, H = 0;
  function size() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    layers.forEach(({ c, ctx }) => {
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    });
  }
  size();
  addEventListener('resize', size);

  // ---------- The airframe, painted once (side view, nose to the right) ----------
  // Sprite units: 200 x 120, the mast/centre of mass at (100, 60).
  const SW = 200, SH = 120, SS = 3;                         // drawn at 3x for crisp scaling down
  const sprite = (() => {
    const c = document.createElement('canvas');
    c.width = SW * SS; c.height = SH * SS;
    const g = c.getContext('2d');
    g.scale(SS, SS);
    g.translate(100, 60);
    g.lineCap = 'round'; g.lineJoin = 'round';
    const lin = (x0, y0, x1, y1, stops) => { const gr = g.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, c]) => gr.addColorStop(o, c)); return gr; };
    const CHAR = '#2a2320', CHAR_LIT = '#4a3f39', ORANGE = '#ff7a2f', ORANGE_DK = '#d9541a', RED = '#ff4d63', RED_DK = '#c9283f';

    // lower wing (behind the fuselage)
    g.fillStyle = lin(0, 18, 0, 26, [[0, RED], [1, RED_DK]]);
    g.beginPath(); g.moveTo(-18, 20); g.quadraticCurveTo(10, 15, 44, 19); g.quadraticCurveTo(48, 22, 44, 25); g.lineTo(-18, 25); g.closePath(); g.fill();
    // landing gear: struts, wheel with an orange hub
    g.strokeStyle = CHAR; g.lineWidth = 2.6;
    g.beginPath(); g.moveTo(26, 12); g.lineTo(34, 40); g.moveTo(42, 12); g.lineTo(34, 40); g.stroke();
    g.fillStyle = '#141110'; g.beginPath(); g.arc(34, 40, 9, 0, Math.PI * 2); g.fill();
    g.fillStyle = ORANGE; g.beginPath(); g.arc(34, 40, 3.6, 0, Math.PI * 2); g.fill();
    g.strokeStyle = CHAR; g.lineWidth = 2; g.beginPath(); g.moveTo(-58, 6); g.lineTo(-62, 13); g.stroke();   // tail skid
    // tailplane + fin
    g.fillStyle = lin(0, -2, 0, 4, [[0, CHAR_LIT], [1, CHAR]]);
    g.beginPath(); g.moveTo(-50, 1); g.lineTo(-74, -1); g.lineTo(-76, 3); g.lineTo(-50, 5); g.closePath(); g.fill();
    g.fillStyle = lin(-70, -28, -50, 0, [[0, ORANGE], [1, ORANGE_DK]]);
    g.beginPath(); g.moveTo(-50, 0); g.lineTo(-62, -26); g.quadraticCurveTo(-72, -28, -74, -20); g.lineTo(-70, 0); g.closePath(); g.fill();
    g.fillStyle = CHAR; g.fillRect(-68, -16, 12, 3);                      // stripe on the fin
    // fuselage: tapering body, lit from above
    g.fillStyle = lin(0, -12, 0, 14, [[0, CHAR_LIT], [.45, CHAR], [1, '#171311']]);
    g.beginPath();
    g.moveTo(54, -13); g.lineTo(54, 13);
    g.quadraticCurveTo(10, 15, -62, 4);
    g.lineTo(-64, -1);
    g.quadraticCurveTo(10, -16, 54, -13);
    g.closePath(); g.fill();
    // orange trim along the side and a band behind the cockpit
    g.strokeStyle = ORANGE; g.lineWidth = 2;
    g.beginPath(); g.moveTo(52, 1); g.quadraticCurveTo(0, 3, -60, 1); g.stroke();
    g.fillStyle = ORANGE; g.beginPath(); g.moveTo(-2, -12); g.lineTo(4, -12); g.lineTo(2, 12); g.lineTo(-4, 11); g.closePath(); g.fill();
    // silver exhaust stacks
    g.strokeStyle = '#d6cec6'; g.lineWidth = 2.2;
    [-6, -2, 2].forEach(y => { g.beginPath(); g.moveTo(48, y + 6); g.lineTo(18, y + 7); g.stroke(); });
    // cockpit and pilot
    g.fillStyle = '#1a1513'; g.beginPath(); g.ellipse(14, -13, 11, 4, 0, Math.PI, 0); g.fill();
    g.fillStyle = '#f2d8bf'; g.beginPath(); g.arc(14, -17, 4.2, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#6b3b22'; g.beginPath(); g.arc(14, -18.2, 4.4, Math.PI, 0); g.fill();
    // upper wing (in front) on cabane and interplane struts
    g.strokeStyle = CHAR; g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(-6, 21); g.lineTo(-2, -28); g.moveTo(40, 20); g.lineTo(44, -28);
    g.moveTo(24, -12); g.lineTo(26, -28); g.moveTo(34, -12); g.lineTo(36, -28); g.stroke();
    g.fillStyle = lin(0, -34, 0, -25, [[0, '#ff8291'], [.5, RED], [1, RED_DK]]);
    g.beginPath(); g.moveTo(-14, -27); g.quadraticCurveTo(14, -36, 52, -31); g.quadraticCurveTo(57, -28, 52, -25); g.lineTo(-14, -25); g.closePath(); g.fill();
    g.fillStyle = CHAR; g.fillRect(4, -30, 22, 3);                       // dark panel on the wing
    // engine cowling with its dark intake ring, then the spinner
    g.fillStyle = lin(0, -17, 0, 17, [[0, '#ffa266'], [.5, ORANGE], [1, ORANGE_DK]]);
    g.beginPath(); g.moveTo(52, -16); g.quadraticCurveTo(70, -18, 72, 0); g.quadraticCurveTo(70, 18, 52, 16); g.closePath(); g.fill();
    g.fillStyle = '#231c19'; g.beginPath(); g.ellipse(71, 0, 3.5, 13, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = lin(72, -6, 72, 6, [[0, '#ffa266'], [1, ORANGE_DK]]);
    g.beginPath(); g.moveTo(72, -6); g.quadraticCurveTo(86, -2, 88, 0); g.quadraticCurveTo(86, 2, 72, 6); g.closePath(); g.fill();
    return c;
  })();

  // ---------- Where the sections are (for the behind layer's clip) ----------
  const SEL = '.panel.is-live .panel__content > *, .nav, .hud, .rail, .podium-hint, .nav-score';
  let rects = [], rectsAt = 0;
  function readRects(now) {
    if (now - rectsAt < 120) return;
    rectsAt = now;
    rects = [];
    document.querySelectorAll(SEL).forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width > 8 && r.height > 8 && r.bottom > 0 && r.top < H && r.right > 0 && r.left < W) rects.push([r.left - 6, r.top - 6, r.width + 12, r.height + 12]);
    });
  }

  // ---------- The flyers ----------
  const planes = [];
  const MAX = 4, LANE_GAP = 46;                             // px of clear sky kept between two planes' lanes
  let nextAt = performance.now() + rnd(1500, 3500);
  const laneOf = (y0, y1, half) => [Math.min(y0, y1) - half, Math.max(y0, y1) + half];
  const laneFree = (lane) => planes.every(p => lane[1] + LANE_GAP < p.lane[0] || lane[0] - LANE_GAP > p.lane[1]);

  function spawn() {
    const layer = 0;                                         // behind the sections, always
    const scale = rnd(.26, .38);
    const half = (SH / 2) * scale + 8;
    for (let tries = 0; tries < 8; tries++) {
      const y0 = rnd(.12, .86) * H, y1 = clamp(y0 + rnd(-.07, .07) * H, .1 * H, .9 * H);
      const lane = laneOf(y0, y1, half);
      if (!laneFree(lane)) continue;
      const dir = Math.random() < .5 ? 1 : -1;
      const span = SW * scale;
      planes.push({
        dir, layer, scale, lane, y0, y1, y: y0,
        x: dir > 0 ? -span : W + span, span,
        speed: rnd(85, 135),
        bob: Math.random() * 6.28, prop: Math.random() * 6.28, pitch: 0, life: 0,
      });
      return;
    }
  }

  function drawPlane(ctx, p) {
    const w = SW * p.scale, h = SH * p.scale;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(p.dir, 1);
    ctx.rotate(p.pitch);
    ctx.drawImage(sprite, -w / 2, -h / 2, w, h);
    // the propeller: a soft disc with one bright blade sweeping through it
    const px = 74 * p.scale, ph = 34 * p.scale;
    ctx.fillStyle = 'rgba(240, 232, 224, .18)';
    ctx.beginPath(); ctx.ellipse(px, 0, 2 * p.scale + .6, ph, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(40, 32, 28, .85)';
    ctx.lineWidth = Math.max(1, 3 * p.scale);
    const b = Math.cos(p.prop) * ph;
    ctx.beginPath(); ctx.moveTo(px, -b); ctx.lineTo(px, b); ctx.stroke();
    ctx.restore();
  }

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = clamp((now - last) / 1000, 0, .05);
    last = now;
    const off = root.classList.contains('is-game') || root.classList.contains('is-overlay') || document.hidden;
    if (off) {
      if (planes.length) { planes.length = 0; layers.forEach(({ ctx }) => ctx.clearRect(0, 0, W, H)); }
      nextAt = now + rnd(2000, 4000);
      return;
    }
    if (now > nextAt && planes.length < MAX) { spawn(); nextAt = now + rnd(5000, 10000); }
    layers.forEach(({ ctx }) => ctx.clearRect(0, 0, W, H));
    if (!planes.length) return;
    readRects(now);

    // the behind layer is clipped to "everywhere except the sections"
    const bctx = layers[0].ctx;
    bctx.save();
    bctx.beginPath();
    bctx.rect(0, 0, W, H);
    rects.forEach(r => bctx.rect(r[0], r[1], r[2], r[3]));
    bctx.clip('evenodd');

    for (let i = planes.length - 1; i >= 0; i--) {
      const p = planes[i];
      p.life += dt;
      p.x += p.dir * p.speed * dt;
      const k = clamp(p.dir > 0 ? (p.x + p.span) / (W + 2 * p.span) : (W + p.span - p.x) / (W + 2 * p.span), 0, 1);
      p.bob += dt * 1.3;
      const yPrev = p.y;
      p.y = p.y0 + (p.y1 - p.y0) * k + Math.sin(p.bob) * 3;
      // nose follows the climb/descent, a little
      p.pitch += (clamp(Math.atan2(p.y - yPrev, p.speed * dt || 1), -.12, .12) - p.pitch) * Math.min(1, dt * 3);
      p.prop += dt * 38;
      drawPlane(layers[p.layer].ctx, p);
      if (k >= 1 || p.life > 60) planes.splice(i, 1);
    }
    bctx.restore();
  }
  requestAnimationFrame(frame);
  if (location.search.includes('debug')) window.__flyers = { planes, spawn, sprite };
})();
