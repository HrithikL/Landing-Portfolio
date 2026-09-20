/* =========================================================
   Background flying: small planes far behind the page while our plane sits on a podium.
   In Chaotic mode each stop plays a randomly chosen fight: missile kill, gun kill, head-on collision,
   mid-air clip, mutual kill or an ambushed formation. In Peaceful mode nobody shoots: formations with a
   ripple roll, a barrel roll around the leader, a loop, a smoke weave, a display trio or a race.
   Four airframes (biplane, monoplane, triplane and a twin-engine fighter) and a shelf of liveries mean
   no two planes in the sky look alike; sides, heights and timing are random too, and the
   same encounter never plays twice in a row.
   Everything is drawn in the WebGL layer (behind the content) and hazed towards the page colour.
   plane.js calls Dogfight.create(api) and then update() every frame.
   ========================================================= */
(() => {
  function create(api) {
    const { THREE, scene, camera, col, fxTex, fxMat, explode, spawnMissile, spawnTrail, sfx, getScale, isMobile, sides, panOf } = api;
    const getNight = api.getNight || (() => 0);
    const peaceful = api.peaceful || (() => false);
    const V3 = THREE.Vector3;
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const rnd = (a, b) => a + Math.random() * (b - a);
    const sign = () => (Math.random() < .5 ? -1 : 1);
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    const shuffle = arr => {
      for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
      return arr;
    };
    const X_AXIS = new V3(1, 0, 0);
    const fA = new V3(), fB = new V3(), fC = new V3();

    // ---------- Liveries (mixed a little towards the sky colour so they read as distant) ----------
    // body / wing / trim / accent. 0–8: fighters, 9–10: the display team, 11+: candy colours for peaceful skies.
    const LIVERIES = [
      { body: 0x2F5D8C, wing: 0xF1E3C8, trim: 0xE8B04A, accent: 0xC8553D },   // navy / cream / gold
      { body: 0x4E7D3A, wing: 0xD9C27A, trim: 0x3A2E26, accent: 0xE8C547 },   // olive / sand
      { body: 0xB23A48, wing: 0xF3EDE2, trim: 0x1F2A44, accent: 0xF2D16B },   // crimson / white
      { body: 0x6C4C9C, wing: 0x7CC6B8, trim: 0xF2D16B, accent: 0xFF6FB5 },   // purple / teal
      { body: 0x2E8C8A, wing: 0xF4F1EA, trim: 0xE4572E, accent: 0x1F2A44 },   // teal / white / red
      { body: 0x7E8794, wing: 0x3B5B92, trim: 0xF2F2F2, accent: 0xD7263D },   // grey / blue
      { body: 0xE0A526, wing: 0x2B2B2B, trim: 0xC8553D, accent: 0xF4F1EA },   // yellow / black
      { body: 0xF2F0EA, wing: 0xC0392B, trim: 0x22313F, accent: 0xC0392B },   // white / red
      { body: 0x1E3B2F, wing: 0xB8C4A0, trim: 0xE8C547, accent: 0xF4F1EA },   // racing green
      { body: 0xF0521C, wing: 0xFFF6EA, trim: 0x091929, accent: 0xFFD23F },   // display team: tangerine / cream
      { body: 0xFF839B, wing: 0xFFF6EA, trim: 0xF74A20, accent: 0x091929 },   // display team: blush / cream
      { body: 0x3ECFA8, wing: 0xFFF6EA, trim: 0xFF5FA2, accent: 0xFFD23F },   // mint / pink
      { body: 0x4FA3FF, wing: 0xFFFFFF, trim: 0xFF7A2F, accent: 0x1F2A44 },   // sky blue / orange
      { body: 0xA78BFA, wing: 0xFFE8A3, trim: 0xE0457B, accent: 0xFFFFFF },   // lilac / butter
      { body: 0xFFD23F, wing: 0x1E1E24, trim: 0xEF476F, accent: 0x1E1E24 },   // lemon / black
      { body: 0xFF6B6B, wing: 0xFFF1E0, trim: 0x1FB5A8, accent: 0xFFD23F },   // coral / teal
      { body: 0x1F6FEB, wing: 0xFFD166, trim: 0xEF476F, accent: 0xFFFFFF },   // ocean / gold
      { body: 0xFF8FC8, wing: 0xFFFFFF, trim: 0x7C4DFF, accent: 0xFFD23F },   // bubblegum / violet
      { body: 0xFF8A3D, wing: 0x2B2D42, trim: 0xFFD23F, accent: 0xFFF6EA },   // tangerine / charcoal
      { body: 0x06A77D, wing: 0xF4F1DE, trim: 0xE07A5F, accent: 0x2B2D42 },   // jade / clay
      { body: 0xC9CED6, wing: 0xD7263D, trim: 0x16161A, accent: 0xFFFFFF },   // silver / scarlet
    ];
    const CANDY = LIVERIES.slice(9);
    const HAZE_DAY = col(0xEFE1CA), HAZE_NIGHT = col(0x120914);
    const HAZE = HAZE_DAY.clone();
    const mats = new Map();
    const matOf = hex => {
      let m = mats.get(hex);
      if (!m) {
        m = new THREE.MeshStandardMaterial({ color: col(hex).lerp(HAZE, .3), roughness: .6, metalness: .08 });
        mats.set(hex, m);
      }
      return m;
    };
    const darkMat = matOf(0x2A2420);

    // ---------- Airframes (nose +X), built from the same parts as the hero plane ----------
    // Four types, so no two formations look alike: the biplane (our own plane's twin, guns on the cowl and the
    // top wing, rockets under the bottom one), a sleek monoplane with an elliptical wing and a bubble canopy, a
    // triplane with twin cowl guns, and a twin-engine heavy fighter. Every part belongs to one colour role
    // (body, wing, trim, accent, dark, metal, glass), so a livery is only a set of colours.
    const along = g => { g.rotateZ(-Math.PI / 2); return g; };
    const V2 = THREE.Vector2;
    function rrect(w, h, r) {
      const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
      s.moveTo(x + r, y);
      s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
      s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
      s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
      return s;
    }
    const extrude = (shape, depth, bevel) => {
      const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10 });
      g.center();
      return g;
    };
    // lifting surface: span along Z, chord along X (rounded tips like the hero's wings)
    const slab = (span, chord, thick, round = .3) => {
      const g = extrude(rrect(span, chord, chord * round), thick, thick * .45);
      g.rotateX(Math.PI / 2);
      g.rotateY(Math.PI / 2);
      return g;
    };
    // elliptical wing (straight-ish trailing edge), span along Z
    const ellipseWing = (span, chord, thick) => {
      const s = new THREE.Shape();
      s.absellipse(0, 0, span / 2, chord / 2, 0, Math.PI * 2, false, 0);
      const g = extrude(s, thick, thick * .4);
      g.rotateX(Math.PI / 2);
      g.rotateY(Math.PI / 2);
      return g;
    };
    const lathe = (pts, seg = 16) => along(new THREE.LatheGeometry(pts.map(([r, y]) => new V2(r, y)), seg));
    const tube = (r1, r2, len, seg = 10, open = false) => along(new THREE.CylinderGeometry(r2, r1, len, seg, 1, open));
    const disc = (r, seg = 20) => new THREE.CircleGeometry(r, seg).rotateX(-Math.PI / 2);
    const ring = (r, t, seg = 20) => new THREE.TorusGeometry(r, t, 6, seg).rotateY(Math.PI / 2);
    const hring = (r, t) => new THREE.TorusGeometry(r, t, 6, 20).rotateX(Math.PI / 2);
    const front = (r, seg = 20) => new THREE.CircleGeometry(r, seg).rotateY(Math.PI / 2);
    // the hero's curved fin, and a rudder that trails it
    const finGeo = (h, len, thick) => {
      const s = new THREE.Shape();
      s.moveTo(-len * .45, 0);
      s.lineTo(len * .55, 0);
      s.quadraticCurveTo(len * .12, h * .16, -len * .06, h * .82);
      s.quadraticCurveTo(-len * .19, h, -len * .45, h * .97);
      s.lineTo(-len * .45, 0);
      const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: thick * .4, bevelSize: thick * .4, bevelSegments: 1, curveSegments: 8 });
      g.translate(0, 0, -thick / 2);
      return g;
    };
    const rudderGeo = (h, len, thick) => {
      const s = new THREE.Shape();
      s.moveTo(0, -h * .05);
      s.lineTo(0, h);
      s.quadraticCurveTo(-len * .7, h * 1.02, -len * .9, h * .62);
      s.quadraticCurveTo(-len * 1.05, h * .18, -len * .72, -h * .05);
      s.lineTo(0, -h * .05);
      const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false, curveSegments: 8 });
      g.translate(0, 0, -thick / 2);
      return g;
    };
    const G = {
      blade: new THREE.BoxGeometry(.05, 1.6, .12),
      bladeTip: new THREE.BoxGeometry(.055, .22, .13),
      disc: new THREE.CircleGeometry(.84, 20).rotateY(Math.PI / 2),
      head: new THREE.SphereGeometry(.12, 10, 8),
      debris: new THREE.BoxGeometry(.5, .06, .34),
      strut: new THREE.CylinderGeometry(.024, .024, 1, 6),
      wheel: new THREE.TorusGeometry(.13, .065, 6, 14),
      hub: new THREE.CylinderGeometry(.085, .085, .1, 10).rotateX(Math.PI / 2),
      barrel: tube(.026, .026, 1, 8),
      jacket: tube(.042, .042, 1, 10),
      drum: new THREE.CylinderGeometry(.075, .075, .04, 12),
      rocket: tube(.034, .034, .34, 8),
      rocketNose: along(new THREE.ConeGeometry(.034, .1, 8)),
      stack: tube(.03, .03, .16, 6),
      canopy: new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      screen: new THREE.BoxGeometry(.015, .12, .24),
    };
    const discMat = new THREE.MeshBasicMaterial({ color: col(0x3A302A), transparent: true, opacity: .16, side: THREE.DoubleSide, depthWrite: false });

    // Part lists per type: [geometry, role, position, rotation?, scale?]
    const P = (geo, role, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => ({ geo, role, x, y, z, rx, ry, rz, sx, sy, sz });
    const strutBetween = (role, a, b, r = 1) => {
      const dir = new V3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const len = dir.length();
      const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), dir.normalize());
      const e = new THREE.Euler().setFromQuaternion(q);
      return P(G.strut, role, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, e.x, e.y, e.z, r, len, r);
    };
    const both = fn => [-1, 1].flatMap(fn);
    const gear = (x, y, z, fuseY) => both(s => [
      strutBetween('dark', [x + .1, fuseY, s * .14], [x, y, s * z]),
      strutBetween('dark', [x - .32, fuseY, s * .12], [x, y, s * z], .8),
      P(G.wheel, 'dark', x, y, s * z),
      P(G.hub, 'trim', x, y, s * z),
    ]);
    // wing roundels on the top and the underside (we mostly see these planes from below), and one on each flank
    const under = r => new THREE.CircleGeometry(r, 20).rotateX(Math.PI / 2);
    const roundel = (x, yTop, yBot, z, r) => both(s => [
      P(disc(r), 'trim', x, yTop, s * z),
      P(disc(r * .55), 'accent', x, yTop + .002, s * z),
      P(under(r), 'trim', x, yBot, s * z),
      P(under(r * .55), 'accent', x, yBot - .002, s * z),
    ]);
    const flank = (x, y, z, r) => both(s => [
      P(new THREE.CircleGeometry(r, 18), 'trim', x, y, s * z, 0, s < 0 ? Math.PI : 0, 0),
      P(new THREE.CircleGeometry(r * .55, 18), 'accent', x, y, s * (z + .002), 0, s < 0 ? Math.PI : 0, 0),
    ]);
    const gun = (x, y, z, len, jacket) => [
      P(G.barrel, 'dark', x + len / 2, y, z, 0, 0, 0, len, 1, 1),
      ...(jacket ? [P(G.jacket, 'metal', x + len * .3, y, z, 0, 0, 0, len * .55, 1, 1)] : []),
    ];
    const rockets = (x, y, zs) => both(s => zs.flatMap(z => [
      P(G.rocket, 'dark', x, y, s * z),
      P(G.rocketNose, 'accent', x + .21, y, s * z),
    ]));
    const stacks = (x, y, z) => both(s => [0, 1, 2].map(k => P(G.stack, 'metal', x - k * .14, y, s * z, 0, 0, -.35)));

    const TYPES = {
      // Our own plane's twin: stubby fuselage, orange-style cowl and lip, two rounded wings, guns top and front
      biplane: {
        props: [[1.26, 0, 0]], wingTip: [.3, .66, 1.95], tail: -1.62, nose: 1.5,
        parts: () => [
          P(lathe([[0, -1.62], [.1, -1.5], [.2, -1.1], [.3, -.6], [.38, -.15], [.43, .3], [.45, .8], [.44, .98], [.3, 1.02], [0, 1.03]], 18), 'body', 0, 0, 0),
          P(tube(.46, .46, .34, 18, true), 'trim', 1.1, 0, 0),
          P(ring(.45, .04), 'accent', 1.27, 0, 0),
          P(front(.42), 'dark', 1.06, 0, 0),
          P(along(new THREE.ConeGeometry(.14, .32, 12)), 'accent', 1.42, 0, 0),
          P(slab(3.9, .84, .07), 'wing', .3, .66, 0),
          P(slab(3.4, .78, .07), 'wing', .36, -.25, 0),
          ...both(s => [P(slab(.36, .86, .075, .45), 'trim', .3, .66, s * 1.78), P(slab(.34, .8, .075, .45), 'trim', .36, -.25, s * 1.55)]),
          ...roundel(.3, .705, -.295, 1.25, .2),
          ...flank(-.9, .02, .245, .13),
          ...both(s => [.12, .52].map(x => P(G.strut, 'dark', x, .21, s * 1.3, 0, 0, 0, 1, .86, 1))),
          ...both(s => [strutBetween('dark', [.15, .34, s * .14], [.15, .63, s * .3]), strutBetween('dark', [.55, .38, s * .14], [.55, .63, s * .3])]),
          P(tube(.33, .33, .1, 16), 'accent', -.55, 0, 0),
          P(finGeo(.78, .8, .045), 'accent', -1.28, .1, 0),
          P(rudderGeo(.76, .3, .04), 'trim', -1.66, .1, 0),
          P(slab(1.5, .46, .05), 'wing', -1.38, .08, 0),
          ...both(s => [P(slab(.22, .48, .055, .45), 'trim', -1.38, .08, s * .66)]),
          P(hring(.16, .03), 'dark', -.3, .36, 0),
          P(G.screen, 'glass', -.08, .44, 0, 0, 0, -.5),
          P(G.head, 'dark', -.32, .46, 0),
          ...gun(.55, .5, .09, .5), ...gun(.55, .5, -.09, .5),
          ...both(s => [...gun(.3, .75, s * .8, .55), P(G.drum, 'dark', .3, .81, s * .8)]),
          ...rockets(.4, -.36, [.95, 1.1]),
          ...stacks(.8, .1, .38),
          ...gear(.5, -.95, .48, -.3),
          strutBetween('dark', [-1.28, -.12, 0], [-1.4, -.52, 0], .8),
          P(G.wheel, 'dark', -1.4, -.55, 0, 0, 0, 0, .35, .35, .35),
        ],
      },
      // Sleek monoplane: long nose, elliptical low wing, bubble canopy, four wing guns and a belly scoop
      mono: {
        props: [[1.66, 0, 0]], wingTip: [.2, -.2, 2.15], tail: -1.95, nose: 1.9,
        parts: () => [
          P(lathe([[0, -1.9], [.08, -1.8], [.16, -1.4], [.25, -.8], [.33, -.2], [.39, .4], [.41, .9], [.41, 1.2], [.3, 1.27], [0, 1.28]], 18), 'body', 0, 0, 0),
          P(tube(.42, .42, .5, 18, true), 'trim', 1.05, 0, 0),
          P(ring(.41, .035), 'accent', 1.3, 0, 0),
          P(front(.38), 'dark', 1.27, 0, 0),
          P(along(new THREE.ConeGeometry(.16, .46, 14)), 'accent', 1.52, 0, 0),
          P(tube(.42, .42, .08, 16), 'accent', .72, 0, 0),
          P(ellipseWing(4.3, .98, .08), 'wing', .2, -.22, 0),
          ...roundel(.18, -.175, -.265, 1.45, .2),
          ...flank(-.6, .03, .3, .14),
          ...both(s => [P(ellipseWing(.5, .34, .085), 'trim', .2, -.22, s * 1.93)]),
          P(G.canopy, 'glass', -.2, .3, 0, 0, 0, 0, .55, .3, .25),
          P(hring(.25, .018), 'metal', -.2, .31, 0, 0, 0, 0, 2.2, 1, 1),
          P(G.head, 'dark', -.25, .38, 0, 0, 0, 0, .8, .8, .8),
          P(new THREE.BoxGeometry(.5, .14, .22), 'dark', -.15, -.4, 0),
          P(tube(.23, .23, .08, 14), 'accent', -1.05, 0, 0),
          P(finGeo(.72, .9, .045), 'body', -1.55, .12, 0),
          P(rudderGeo(.7, .28, .04), 'trim', -1.97, .12, 0),
          P(ellipseWing(1.5, .52, .05), 'wing', -1.62, .1, 0),
          ...both(s => [...gun(.55, -.2, s * .95, .38), ...gun(.55, -.22, s * 1.15, .38)]),
          ...rockets(.1, -.34, [1.35, 1.55, 1.75]),
          ...stacks(.8, .14, .37),
        ],
      },
      // Triplane: short, three stacked wings on single struts, twin cowl guns with cooling jackets
      tri: {
        props: [[1.12, 0, 0]], wingTip: [.25, .85, 1.62], tail: -1.5, nose: 1.35,
        parts: () => [
          P(lathe([[0, -1.5], [.1, -1.35], [.2, -.9], [.3, -.4], [.38, .1], [.42, .55], [.42, .82], [.3, .88], [0, .9]], 10), 'body', 0, 0, 0),
          P(tube(.44, .44, .26, 16, true), 'trim', .96, 0, 0),
          P(ring(.43, .035), 'accent', 1.08, 0, 0),
          P(front(.4), 'dark', .92, 0, 0),
          P(along(new THREE.ConeGeometry(.12, .24, 10)), 'accent', 1.2, 0, 0),
          P(slab(3.3, .72, .06), 'wing', .25, .85, 0),
          P(slab(3.0, .7, .06), 'wing', .3, .28, 0),
          P(slab(2.7, .68, .06), 'wing', .35, -.3, 0),
          ...roundel(.25, .885, -.335, 1.1, .18),
          ...flank(-.8, .02, .265, .13),
          ...both(s => [P(slab(.3, .74, .065, .45), 'trim', .25, .85, s * 1.5)]),
          ...both(s => [P(G.strut, 'dark', .28, .28, s * 1.15, 0, 0, 0, 1.4, 1.18, 1.4)]),
          ...both(s => [strutBetween('dark', [.2, .35, s * .14], [.2, .84, s * .3]), strutBetween('dark', [.5, .35, s * .14], [.5, .84, s * .3])]),
          P(slab(.9, .26, .05), 'wing', .5, -.88, 0),
          P(tube(.31, .31, .1, 12), 'accent', -.45, 0, 0),
          P(finGeo(.6, .6, .045), 'trim', -1.2, .1, 0),
          P(rudderGeo(.62, .3, .04), 'accent', -1.5, .08, 0),
          P(slab(1.3, .5, .05), 'wing', -1.28, .08, 0),
          P(hring(.15, .03), 'dark', -.3, .38, 0),
          P(G.head, 'dark', -.32, .48, 0),
          ...gun(.25, .48, .09, .52, true), ...gun(.25, .48, -.09, .52, true),
          ...gear(.5, -.92, .45, -.3),
          strutBetween('dark', [-1.2, -.1, 0], [-1.3, -.45, 0], .8),
          P(G.wheel, 'dark', -1.3, -.48, 0, 0, 0, 0, .35, .35, .35),
        ],
      },
      // Twin-engine heavy fighter: pointed nose full of guns, two engines on the wing, twin fins
      twin: {
        props: [[1.15, -.04, 1.05], [1.15, -.04, -1.05]], wingTip: [.1, -.04, 2.35], tail: -1.95, nose: 1.6,
        parts: () => [
          P(lathe([[0, -1.8], [.08, -1.7], [.15, -1.3], [.24, -.6], [.3, 0], [.32, .6], [.3, 1.05], [.18, 1.35], [0, 1.45]], 16), 'body', 0, 0, 0),
          P(slab(4.7, .88, .075, .35), 'wing', .1, -.05, 0),
          ...both(s => [P(slab(.36, .9, .08, .45), 'trim', .1, -.05, s * 2.2)]),
          ...roundel(.05, -.005, -.095, 1.75, .19),
          ...flank(-.9, .02, .205, .11),
          ...both(s => [
            P(lathe([[0, -.95], [.12, -.8], [.2, -.3], [.24, .3], [.24, .7], [0, .72]], 14), 'body', .35, -.04, s * 1.05),
            P(tube(.25, .25, .22, 14, true), 'trim', .98, -.04, s * 1.05),
            P(ring(.245, .03), 'accent', 1.07, -.04, s * 1.05),
            P(along(new THREE.ConeGeometry(.09, .2, 10)), 'accent', 1.17, -.04, s * 1.05),
          ]),
          P(G.canopy, 'glass', .2, .22, 0, 0, 0, 0, .75, .26, .22),
          P(G.head, 'dark', .25, .3, 0, 0, 0, 0, .75, .75, .75),
          P(tube(.27, .27, .08, 14), 'accent', -.5, 0, 0),
          P(slab(1.7, .46, .05), 'wing', -1.6, .06, 0),
          ...both(s => [P(finGeo(.56, .5, .04), 'accent', -1.62, .06, s * .82), P(finGeo(.3, .5, .04).rotateX(Math.PI), 'accent', -1.62, .06, s * .82)]),
          ...gun(1.2, .06, .07, .4), ...gun(1.2, .06, -.07, .4), ...gun(1.18, .14, .04, .38), ...gun(1.18, .14, -.04, .38),
          ...gun(1.0, -.14, 0, .5, true),
        ],
      },
    };
    const TYPE_NAMES = Object.keys(TYPES);
    // geometry is shared per type; each actor clones it into its own merged meshes
    Object.values(TYPES).forEach(T => { T.list = T.parts(); });

    function buildActor(type) {
      const T = TYPES[type];
      const g = new THREE.Group();
      const body = new THREE.Group();
      g.add(body);
      const own = (o = {}) => new THREE.MeshStandardMaterial({ roughness: .55, metalness: .1, transparent: true, ...o });
      const mats = { body: own(), wing: own(), trim: own(), accent: own(), dark: own(), metal: own({ roughness: .35, metalness: .6 }), glass: own({ roughness: .1, metalness: .2 }) };
      mats.dark.color.copy(darkMat.color);
      mats.glass.userData.base = .55;
      mats.trimIn = mats.trim.clone();
      mats.trimIn.side = THREE.DoubleSide;
      const tmp = new THREE.Mesh();
      T.list.forEach(p => {
        const m = new THREE.Mesh(p.geo, p.role === 'trim' && p.geo.parameters && p.geo.parameters.openEnded ? mats.trimIn : mats[p.role]);
        m.position.set(p.x, p.y, p.z);
        m.rotation.set(p.rx, p.ry, p.rz);
        m.scale.set(p.sx, p.sy, p.sz);
        body.add(m);
      });
      // props: black blades with accent tips, and a faint motion disc
      const props = T.props.map(([x, y, z]) => {
        const pr = new THREE.Group();
        pr.position.set(x, y, z);
        const k = z ? .62 : 1;
        [0, Math.PI / 2 * (type === 'mono' ? 2 / 3 : 1)].forEach(a => {
          const bl = new THREE.Mesh(G.blade, mats.dark);
          bl.rotation.x = a;
          bl.scale.setScalar(k);
          pr.add(bl);
        });
        [-1, 1].forEach(s => {
          const tip = new THREE.Mesh(G.bladeTip, mats.accent);
          tip.position.y = s * .72 * k;
          tip.scale.setScalar(k);
          pr.add(tip);
        });
        const dsc = new THREE.Mesh(G.disc, discMat);
        dsc.scale.setScalar(k);
        pr.add(dsc);
        body.add(pr);
        return pr;
      });
      const flame = new THREE.Sprite(fxMat(THREE.SpriteMaterial, { map: fxTex.fire, color: col(0xFF7A1A) }));
      flame.position.set(.5, .15, 0);
      flame.visible = false;
      const flash = new THREE.Sprite(fxMat(THREE.SpriteMaterial, { map: fxTex.flash, color: col(0xFFB347) }));
      flash.position.set(T.nose, .35, 0);
      flash.visible = false;
      body.add(flame, flash);
      // Navigation lights (night only): red port, green starboard, white tail
      const [wx, wy, wz] = T.wingTip;
      const navLights = [[0xFF2A2A, wx, wy, -wz, .7], [0x2BFF6A, wx, wy, wz, .7], [0xFFFFFF, T.tail, .45, 0, .6]].map(([c, x, y, z, s]) => {
        const sp = new THREE.Sprite(fxMat(THREE.SpriteMaterial, { map: fxTex.glow, color: col(c), blending: THREE.AdditiveBlending, opacity: 0 }));
        sp.position.set(x, y, z);
        sp.scale.setScalar(s);
        sp.visible = false;
        body.add(sp);
        return sp;
      });
      // one mesh per material instead of ~60 (the props still spin on their own)
      if (api.mergeStatic) api.mergeStatic(body, o => props.includes(o));
      g.visible = false;
      g.traverse(o => { o.frustumCulled = false; });
      scene.add(g);
      return {
        g, body, type, prop: props[0], props, mats, flame, flash, navLights, liv: LIVERIES[0], fade: 1,
        pos: new V3(), prev: new V3(), vel: new V3(),
        active: false, alive: false, mode: 'fly', path: null, world: 1,
        seen: false, age: 0, smoke: 0, smokeAcc: 0, roll: 0, spinRate: 0, burnT: 0, fallDur: 1, flashT: 0, seed: 0,
      };
    }
    const MIX = { biplane: 5, mono: 4, tri: 4, twin: 3 };
    const actors = Object.entries(MIX).flatMap(([type, n]) => Array.from({ length: n }, () => buildActor(type)));

    // Distant planes fade towards the sky colour (beige by day, deep plum at night)
    const hazed = (hex, k) => col(hex).lerp(HAZE.copy(HAZE_DAY).lerp(HAZE_NIGHT, getNight()), k);
    function paint(a, liv, haze = .3) {
      a.liv = liv;
      a.mats.body.color.copy(hazed(liv.body, haze));
      a.mats.wing.color.copy(hazed(liv.wing, haze));
      a.mats.trim.color.copy(hazed(liv.trim, haze));
      a.mats.trimIn.color.copy(a.mats.trim.color);
      a.mats.accent.color.copy(hazed(liv.accent || liv.trim, haze));
      a.mats.metal.color.copy(hazed(0xB8B4AE, haze));
      a.mats.dark.color.copy(hazed(0x1E1916, haze));
      a.mats.glass.color.copy(hazed(0x9FC6E0, haze * .6));
    }
    function setFade(a, f) {
      a.fade = f;
      const o = Math.max(0, f);
      for (const k in a.mats) {
        const m = a.mats[k];
        m.opacity = o * (m.userData.base || 1);
        m.depthWrite = o > .95 && !m.userData.base;
      }
      a.flame.material.opacity = o;
      a.flash.material.opacity = o;
    }

    const pool = (n, make) => {
      const items = Array.from({ length: n }, () => {
        const o = make();
        o.visible = false;
        o.frustumCulled = false;
        o.userData = { on: false, life: 0, max: 1, start: new V3(), dir: new V3(), vel: new V3(), spin: new V3(), speed: 1, len: 1, smokeAcc: 0 };
        scene.add(o);
        return o;
      });
      let cursor = 0;
      items.next = () => items[cursor++ % n];
      return items;
    };
    const tracerGeo = along(new THREE.CylinderGeometry(.03, .03, 1, 5));
    const tracers = pool(56, () => new THREE.Mesh(tracerGeo, fxMat(THREE.MeshBasicMaterial, { color: col(0xFF8A1A) })));
    const debris = pool(28, () => new THREE.Mesh(G.debris, darkMat));

    // ---------- Stage: paths in screen space (u, v = NDC) at a depth z ----------
    function stage(u, v, z, out) {
      out.set(u, v, .5).unproject(camera).sub(camera.position);
      return out.multiplyScalar((z - camera.position.z) / out.z).add(camera.position);
    }
    // Passes through (uk, vk, zk) at time Tm with a gentle weave that is zero at that moment
    const line = (uk, vk, zk, Tm, su, sv = 0, wave = .03) => t => {
      const d = t - Tm;
      return { u: uk + d * su, v: vk + d * sv + Math.sin(d * 1.4) * wave, z: zk + Math.sin(d * .9) * .6 };
    };
    // Follows another path `lag` seconds behind, offset vertically by dv(t)
    const chase = (lead, lag, dv, dz = .4) => t => {
      const s = lead(t - (typeof lag === 'function' ? lag(t) : lag));
      return { u: s.u, v: s.v + dv(t), z: s.z + dz };
    };
    const lerp = (a, b, k) => a + (b - a) * k;

    // ---------- Actors ----------
    const randomType = () => pick(['biplane', 'biplane', 'mono', 'mono', 'tri', 'twin']);
    function launch(path, liv, size, haze, type) {
      const want = type || randomType();
      const a = actors.find(x => !x.active && x.type === want) || actors.find(x => !x.active);
      if (!a) return null;
      paint(a, liv, haze);
      a.enemy = false;
      a.foe = false;
      a.show = a.stay = false;                  // air-show team: stays on stage through its routine
      a.burst = null;
      a.smokeUntil = 0;
      a.trail = null;
      a.trailAcc = 0;
      a.bank = 0;
      a.yawPrev = null;
      a.path = path;
      a.active = a.alive = true;
      a.mode = 'fly';
      a.world = getScale() * (size || rnd(.36, .46));
      a.seen = false;
      a.age = 0;
      a.smoke = 0;
      a.flashT = 0;
      a.seed = rnd(0, 6);
      a.first = true;
      setFade(a, 1);
      a.flame.visible = false;
      a.g.visible = true;
      return a;
    }
    function hide(a) {
      a.active = a.alive = false;
      a.g.visible = false;
    }
    const nose = (a, out, dy = .35) => a.g.localToWorld(out.set(1.5, dy, 0));
    const tailPoint = (a, out) => a.g.localToWorld(out.set(.2, .1, 0));
    const euler = new THREE.Euler(0, 0, 0, 'YZX');

    function stepActor(a, T, dt) {
      a.age += dt;
      a.prev.copy(a.pos);
      a.q = null;
      if (a.mode === 'fly') {
        const s = a.path(T);
        if (s.w) a.pos.set(s.x, s.y, s.z);
        else stage(s.u, s.v, s.z, a.pos);
        if (s.q) a.q = s.q;                              // flown in formation: attitude given by the path
        if (a.first) {
          const p = a.path(T - .05);
          if (p.w) a.prev.set(p.x, p.y, p.z);
          else stage(p.u, p.v, p.z, a.prev);
          a.vel.subVectors(a.pos, a.prev).divideScalar(.05);
          a.first = false;
        } else if (dt > 0) {
          fA.subVectors(a.pos, a.prev).divideScalar(dt);
          a.vel.lerp(fA, .35);
        }
        if (a.foe) {
          // raid fighters bank into their turns (and may roll on the break)
          const yaw = Math.atan2(-a.vel.z, a.vel.x);
          if (a.yawPrev !== null && dt > 0) {
            const dy = Math.atan2(Math.sin(yaw - a.yawPrev), Math.cos(yaw - a.yawPrev));
            a.bank += (clamp(-dy / dt * .45, -1.3, 1.3) - a.bank) * Math.min(1, dt * 4);
          }
          a.yawPrev = yaw;
          a.roll = a.bank + (s.roll || 0);
        } else a.roll = Math.sin(T * 1.3 + a.seed) * .22 + (s.roll || 0);
        // looping: once the plane is flying back the way it came it is on its back (the flip is seamless at the vertical)
        if (s.dir && a.vel.x * s.dir < 0) a.roll += Math.PI;
      } else {
        // falling: gravity, drag, spinning, burning
        a.vel.y -= 4.5 * getScale() * dt;
        a.vel.multiplyScalar(1 - .15 * dt);
        a.pos.addScaledVector(a.vel, dt);
        a.roll += a.spinRate * dt;
        a.burnT += dt;
        a.flame.scale.setScalar(rnd(.8, 1.2));
        if (a.burnT > a.fallDur) { blast(a, .8); return; }
      }
      fA.copy(a.vel);
      if (fA.lengthSq() < 1e-8) fA.set(1, 0, 0);
      fA.normalize();
      if (a.q) a.g.quaternion.copy(a.q);
      else {
        euler.set(a.roll, Math.atan2(-fA.z, fA.x), Math.asin(clamp(fA.y, -1, 1)));
        a.g.quaternion.setFromEuler(euler);
      }
      a.g.position.copy(a.pos);
      a.g.scale.setScalar(a.world);
      a.g.updateMatrixWorld();
      for (const pr of a.props) pr.rotation.x += 40 * dt;
      // display smoke (peaceful skies): a steady coloured trail from the tail
      if (a.trail && a.alive && a.mode === 'fly' && a.fade > .5) {
        a.trailAcc += dt;
        while (a.trailAcc > .045) {
          a.trailAcc -= .045;
          spawnTrail(a.g.localToWorld(fB.set(-1.85, .05, 0)), false, a.world / getScale() * 1.1, false, a.trail);
        }
      }
      a.flashT -= dt;
      a.flash.visible = a.flashT > 0;
      const nk = getNight() * (a.alive ? 1 : 0);
      a.navLights.forEach((sp, i) => {
        sp.visible = nk > .01;
        if (sp.visible) sp.material.opacity = nk * a.fade * (i === 2 ? ((a.age * 1.4 + a.seed) % 1 < .5 ? 1 : .15) : 1);
      });
      if (a.flash.visible) a.flash.material.rotation = Math.random() * 6;
      // smoke from damage or fire
      if (a.smoke > 0 || a.mode === 'fall') {
        a.smokeAcc += dt;
        const every = a.mode === 'fall' ? .03 : .06;
        while (a.smokeAcc > every) {
          a.smokeAcc -= every;
          spawnTrail(tailPoint(a, fB), a.mode === 'fall', a.world / getScale() * (a.mode === 'fall' ? 1.5 : 1), true);
        }
      }
      // ghost out while passing behind the page content, so text stays readable (the jump battle and the dogfight
      // have an empty page)
      fB.copy(a.pos).project(camera);
      const sx = (fB.x + 1) / 2 * innerWidth, sy = (1 - fB.y) / 2 * innerHeight;
      const pad = 36;
      const behind = !a.foe && !a.enemy && !!contentBox && sx > contentBox.left - pad && sx < contentBox.right + pad && sy > contentBox.top - pad && sy < contentBox.bottom + pad;
      const want = behind ? .1 : 1;
      if (Math.abs(a.fade - want) > .005) setFade(a, a.fade + (want - a.fade) * Math.min(1, dt * 7));
      // leave the stage once seen and gone off screen (or after a safety timeout)
      if (Math.abs(fB.x) < 1.02 && Math.abs(fB.y) < 1.02) a.seen = true;
      if (!a.stay && ((a.seen && (Math.abs(fB.x) > 1.3 || fB.y < -1.25 || fB.y > 1.4)) || a.age > 16)) hide(a);
    }

    function blast(a, size = 1) {
      if (!a.active) return;
      explode(a.pos.clone(), { air: true, size: .55 * size * (a.world / getScale()) / .4 });
      scatter(a);
      hide(a);
    }
    function scatter(a) {
      for (let i = 0; i < 5; i++) {
        const d = debris.next();
        const u = d.userData;
        d.material = matOf(i % 2 ? a.liv.body : a.liv.wing);
        d.position.copy(a.pos);
        u.vel.copy(a.vel).multiplyScalar(.35)
          .add(fA.set(rnd(-1, 1), rnd(-.2, 1.2), rnd(-1, 1)).normalize().multiplyScalar(rnd(1, 3) * getScale()));
        u.spin.set(rnd(-9, 9), rnd(-9, 9), rnd(-9, 9));
        u.life = 0;
        u.max = rnd(1, 1.8);
        u.smokeAcc = 0;
        d.scale.setScalar(a.world * rnd(.5, 1.2));
        d.visible = u.on = true;
      }
    }
    // 'blast' = blown apart now; 'burn' = catches fire, spins down and explodes on the way
    function kill(a, how, size) {
      if (!a || !a.alive) return;
      a.alive = false;
      if (how === 'blast') { blast(a, size || 1); return; }
      a.mode = 'fall';
      a.spinRate = sign() * rnd(5, 9);
      a.fallDur = rnd(1.1, 1.9);
      a.burnT = 0;
      a.flame.visible = true;
      a.vel.multiplyScalar(.85);
      explode(a.pos.clone(), { air: true, size: .22 });
    }
    function collide(a, b, how) {
      if (!a || !b || !a.alive || !b.alive) return;
      const mid = fC.addVectors(a.pos, b.pos).multiplyScalar(.5).clone();
      if (sfx) sfx.crash(panOf(mid), .6);
      if (how === 'blast') {
        a.alive = b.alive = false;
        explode(mid, { air: true, size: .95 * (a.world / getScale()) / .4 });
        scatter(a); scatter(b);
        hide(a); hide(b);
      } else {
        explode(mid, { air: true, size: .3 });
        kill(a, 'burn');
        kill(b, 'burn');
        a.vel.y += .8 * getScale();
        b.vel.x *= -.3;
      }
    }

    function shoot(a, b, miss) {
      if (!a || !a.alive) return;
      nose(a, fA);
      const speed = 24 * getScale();
      if (!b || !b.active) return;
      fB.copy(b.pos);
      fB.addScaledVector(b.vel, fB.distanceTo(fA) / speed);
      if (miss) fB.y += sign() * rnd(.9, 1.7) * a.world;
      const tr = tracers.next();
      const d = tr.userData;
      d.dir.subVectors(fB, fA);
      const dist = d.dir.length();
      if (dist < .05) return;
      d.dir.divideScalar(dist);
      d.dir.x += rnd(-.02, .02);
      d.dir.y += rnd(-.02, .02);
      d.dir.normalize();
      d.start.copy(fA);
      d.speed = speed;
      d.len = 1.3 * a.world;
      d.life = 0;
      d.max = Math.min(.8, dist / speed + (miss ? .3 : .02));
      d.on = true;
      d.player = false;
      tr.quaternion.setFromUnitVectors(X_AXIS, d.dir);
      a.flashT = .05;
      if (sfx) sfx.gun(panOf(fA), true);
    }

    // An enemy shooting at our plane; bullets that aren't misses glance off it
    function shootAt(a, point, miss) {
      if (!a || !a.alive) return;
      nose(a, fA);
      const speed = 26 * getScale();
      fB.copy(point);
      if (miss) fB.add(fC.set(sign() * rnd(.6, 1.4), rnd(-.3, 1), 0).multiplyScalar(getScale()));
      const tr = tracers.next();
      const d = tr.userData;
      d.dir.subVectors(fB, fA);
      const dist = d.dir.length();
      if (dist < .05) return;
      d.dir.divideScalar(dist);
      d.start.copy(fA);
      d.speed = speed;
      d.len = 1.4 * a.world;
      d.life = 0;
      d.max = dist / speed + (miss ? .2 : 0);
      d.on = true;
      d.player = !miss;
      tr.quaternion.setFromUnitVectors(X_AXIS, d.dir);
      a.flashT = .05;
      if (sfx) sfx.gun(panOf(fA), true);
    }

    function fireMissile(a, target, how, decoy) {
      if (!a || !a.alive || !target || !target.alive) return;
      nose(a, fA, -.35);
      fB.copy(a.vel).normalize();
      fC.copy(target.pos).add(fB.clone().set(0, a.world * rnd(1.8, 2.6) * sign(), 0));
      spawnMissile({
        pos: fA,
        vel: fB.multiplyScalar(a.vel.length() + 1.2 * getScale()),
        size: a.world * .95,
        maxSpeed: 12 * getScale(),
        air: true,
        track: decoy ? null : target,
        target: decoy ? fC : undefined,
        volume: .35,
        onHit: p => {
          if (!decoy && target.alive) kill(target, how);
          else explode(p, { air: true, size: .35 });
        },
      });
    }

    // ---------- Encounters ----------
    const KINDS = ['missile', 'guns', 'headon', 'clip', 'mutual', 'ambush'];
    // Peaceful skies: nobody shoots. Formations cross the sky, a pair rolls, a lone plane wanders by.
    const PEACE_KINDS = ['formation', 'echelon', 'pair', 'loop', 'weave', 'smoke', 'race', 'lone'];
    const rolled = (path, t0, t1, dir) => t => { const q = path(t); q.roll = (q.roll || 0) + Math.PI * 2 * smooth(t0, t1, t) * dir; return q; };
    // Display smoke for peaceful skies, in the site's candy colours
    const SMOKE = [0xFF6D34, 0xFF839B, 0xFBBD76, 0xB28DFF, 0x3ECFA8, 0xFFD23F, 0x7CC8FF].map(h => col(h));
    // A straight run through (uk, vk) with a full loop flown at Tm: a circle in screen space, entered and left
    // at cruise speed (so the speed never jumps)
    const looping = (uk, vk, zk, Tm, su, D, dur) => {
      const Ru = su * dur / (Math.PI * 2);
      return t => {
        const aspect = innerWidth / innerHeight;
        if (t <= Tm) return { u: uk + (t - Tm) * su * D, v: vk, z: zk, dir: D };
        if (t >= Tm + dur) return { u: uk + (t - Tm - dur) * su * D, v: vk, z: zk, dir: D };
        const ph = (t - Tm) / dur * Math.PI * 2;
        return { u: uk + D * Ru * Math.sin(ph), v: vk + Ru * aspect * (1 - Math.cos(ph)), z: zk - Math.sin(ph / 2) * .8, dir: D };
      };
    };
    const at = (t, fn) => ({ t, fn });
    const burst = (from, to, every, fn) => ({ t: from, to, every, fn });

    function start(kind, section) {
      const mobile = isMobile();
      const free = sides[section] === 'left' ? 1 : -1;       // our plane parks opposite the content
      const D = sign();                                     // direction the fight travels
      const uk = mobile ? rnd(-.35, .35) : free * rnd(.2, .6);
      const vLo = mobile ? .56 : .32, vHi = mobile ? .8 : .6;
      const vk = rnd(vLo, vHi);
      const zk = -rnd(15, 23);
      const su = rnd(.3, .37);
      const Tm = (uk * D + 1.3) / su;                       // when the lead plane reaches the kill point
      const L = shuffle(LIVERIES.slice());
      const ev = [];
      const sc = { kind, T: 0, ev, abort: false };

      if (kind === 'missile') {
        const path = line(uk, vk, zk, Tm, su * D, rnd(-.03, .03), .05);
        const miss = Math.random() < .4;
        const tgt = launch(path, L[0]);
        const att = launch(chase(path, .95, t => .07 + smooth(Tm + (miss ? .7 : 0), Tm + 2.2, t) * .45), L[1]);
        ev.push(at(Tm - .75, () => fireMissile(att, tgt, pick(['blast', 'burn']), miss)));
        if (miss) {
          ev.push(burst(Tm - .15, Tm + .45, .07, () => shoot(att, tgt)));
          ev.push(at(Tm + .4, () => kill(tgt, pick(['burn', 'blast']))));
        }
      } else if (kind === 'guns') {
        const path = line(uk, vk, zk, Tm, su * D, rnd(-.02, .02), .07);
        const tgt = launch(path, L[0]);
        const att = launch(chase(path, .6, t => .05 * (1 - smooth(Tm - 2.2, Tm - 1.4, t)) + smooth(Tm + .2, Tm + 2.2, t) * .4), L[1]);
        ev.push(burst(Tm - 1.75, Tm - 1.25, .07, () => shoot(att, tgt, Math.random() < .4)));
        ev.push(at(Tm - 1.3, () => { if (tgt) tgt.smoke = 1; }));
        ev.push(burst(Tm - .6, Tm, .065, () => shoot(att, tgt)));
        ev.push(at(Tm - .05, () => kill(tgt, Math.random() < .6 ? 'burn' : 'blast')));
      } else if (kind === 'headon' || kind === 'mutual') {
        const mutual = kind === 'mutual';
        const T2 = Math.max(uk * D + 1.3, -uk * D + 1.3) / su;
        const gap = mutual ? rnd(.08, .12) : 0;
        const a = launch(line(uk, vk + gap, zk, T2, D * (uk * D + 1.3) / T2, 0, .035), L[0]);
        const b = launch(line(uk, vk - gap, mutual ? zk - .8 : zk, T2, -D * (-uk * D + 1.3) / T2, 0, -.03), L[1]);
        if (mutual) {
          ev.push(burst(T2 - 2, T2 - .75, .075, () => shoot(a, b, Math.random() < .3)));
          ev.push(burst(T2 - 1.9, T2 - .6, .075, () => shoot(b, a, Math.random() < .3)));
          ev.push(at(T2 - 1.35, () => { if (a) a.smoke = 1; if (b) b.smoke = 1; }));
          const [first, second] = shuffle([a, b]);
          ev.push(at(T2 - .75, () => kill(first, pick(['blast', 'burn']))));
          ev.push(at(T2 - .58, () => kill(second, pick(['blast', 'burn']))));
        } else {
          ev.push(burst(T2 - 1.5, T2 - .9, .08, () => shoot(a, b, true)));
          ev.push(burst(T2 - 1.4, T2 - .85, .08, () => shoot(b, a, true)));
          ev.push(at(T2 - .02, () => collide(a, b, 'blast')));
        }
      } else if (kind === 'clip') {
        // One flies level, the other dives across its path; their wings clip and both spin down burning
        const a = launch(line(uk, vk, zk, Tm, su * D, 0, .03), L[0]);
        const b = launch(line(uk, vk, zk, Tm, su * .35 * sign(), -rnd(.28, .36), .02), L[1]);
        ev.push(at(Tm - .02, () => collide(a, b, 'burn')));
      } else if (PEACE_KINDS.includes(kind)) {
        // No fighting: just flying. Every plane wears its own colours, formations may mix airframes, and each kind
        // flies its own routine: ripple rolls, a barrel roll around the leader, a loop, a smoke weave, a race.
        sc.peace = true;
        const cols = shuffle(CANDY.concat(LIVERIES.slice(0, 9)).slice()).slice(0, 5);
        const smokes = shuffle(SMOKE.slice());
        const same = Math.random() < .5 ? randomType() : null;           // half the time one airframe for the group
        const typeOf = () => same || randomType();
        const size = rnd(.37, .45);
        const fly = (path, k, type) => launch(path, cols[k % cols.length], size * rnd(.95, 1.05), .15, type || typeOf());
        const dir = sign();
        if (kind === 'formation' || kind === 'echelon') {
          const lead = line(uk, vk, zk, Tm, su * .8 * D, rnd(-.02, .03), .02);
          const n = kind === 'formation' ? 3 : 4;
          const ripple = Math.random() < .7, t0 = Tm - rnd(.8, 1.4);
          for (let k = 0; k < n; k++) {
            let path = k === 0 ? lead
              : kind === 'formation' ? chase(lead, .32, () => (k === 1 ? .07 : -.07), k === 1 ? -.9 : .9)
                : chase(lead, .26 * k, () => -.045 * k, .7 * k);
            // a ripple roll: one after another down the line, not all at once
            if (ripple) path = rolled(path, t0 + k * .45, t0 + k * .45 + 1.2, dir);
            fly(path, k);
          }
        } else if (kind === 'pair') {
          // the wingman flies a barrel roll right around the leader
          const lead = line(uk, vk, zk, Tm, su * .8 * D, rnd(-.02, .02), .02);
          fly(lead, 0);
          const r0 = Tm - 1.2, r1 = Tm + 1.4;
          fly(t => {
            const q = lead(t - .12), ph = Math.PI * 2 * smooth(r0, r1, t) * dir;
            return { u: q.u, v: q.v + .085 * Math.cos(ph), z: q.z - 1.1 * Math.sin(ph) - .3, roll: ph };
          }, 1);
        } else if (kind === 'loop') {
          // one plane loops mid-screen trailing smoke; sometimes a second follows it round
          const v0 = mobile ? rnd(.45, .55) : rnd(.18, .3);
          const a = fly(looping(uk, v0, zk, Tm, su * .85, D, rnd(2.8, 3.4)), 0);
          if (a) a.trail = smokes[0];
          if (Math.random() < .5) {
            const b = fly(chase(looping(uk, v0, zk, Tm, su * .85, D, 3.1), .7, () => 0, .6), 1);
            if (b) { b.trail = smokes[1]; b.path = (p => t => ({ ...p(t), dir: D }))(b.path); }
          }
        } else if (kind === 'weave') {
          // scissors: two planes weave through each other, each trailing its own colour
          const A = rnd(.07, .1), w = rnd(1.4, 1.9);
          [0, 1].forEach(k => {
            const a = fly(t => {
              const d = t - Tm, ph = d * w + k * Math.PI;
              return { u: uk + d * su * .85 * D, v: vk + A * Math.sin(ph), z: zk + (k ? .8 : -.8) * Math.cos(ph), roll: -Math.cos(ph) * .7 * D };
            }, k);
            if (a) a.trail = smokes[k];
          });
        } else if (kind === 'smoke') {
          // a display trio, line abreast, climbing gently, then fanning out: three colours of smoke
          const Tb = Tm + rnd(-.4, .4);
          const lead = line(uk, vk - .06, zk, Tm, su * .8 * D, .02, .015);
          [0, 1, 2].forEach(k => {
            const a = fly(t => {
              const q = lead(t - k * .08), f = smooth(Tb, Tb + 2.2, t);
              return { u: q.u, v: q.v + (k - 1) * (.05 + f * .22), z: q.z + (k - 1) * 1.1, roll: (k - 1) * f * .6 * D };
            }, k);
            if (a) a.trail = smokes[k];
          });
        } else if (kind === 'race') {
          // two different airframes racing; the one behind catches up and overtakes
          const types = shuffle(['biplane', 'mono', 'tri', 'twin']);
          const gap = rnd(.12, .2);
          fly(line(uk + gap * D, vk + .03, zk, Tm, su * .78 * D, 0, .015), 0, types[0]);
          fly(t => {
            const q = line(uk - gap * D, vk - .04, zk + 1.2, Tm, su * .78 * D, 0, .02)(t);
            q.u += D * gap * 2.4 * smooth(Tm - 1.5, Tm + 2.5, t);
            return q;
          }, 1, types[1]);
        } else {
          // a lone plane wandering by, with one slow roll
          const t0 = Tm - rnd(0, 1);
          fly(rolled(line(uk, vk, zk, Tm, su * .7 * D, rnd(-.03, .03), .03), t0, t0 + 2.2, dir), 0);
        }
        sc.end = Tm + 1.5;
      } else if (kind === 'ambush') {
        // A pair in formation; a third plane dives in and shoots the leader, the wingman answers with a missile
        const lead = line(uk, vk - .05, zk, Tm, su * D, 0, .02);
        const w1 = launch(lead, L[0]);
        const w2 = launch(chase(lead, .42, () => -.1, -.6), L[2]);
        const foe = launch(chase(lead, t => lerp(2.4, .62, smooth(0, Tm - 1.3, t)), t => lerp(.6, .05, smooth(Tm - 3, Tm - 1.3, t)) + smooth(Tm + .3, Tm + 2, t) * .3, .5), L[1]);
        ev.push(burst(Tm - 1.35, Tm - .85, .07, () => shoot(foe, w1)));
        ev.push(at(Tm - .85, () => kill(w1, 'burn')));
        ev.push(at(Tm - .55, () => fireMissile(w2, foe, 'blast')));
      }
      // Sometimes a lone plane drifts past far away, just for life
      if (Math.random() < .45) {
        const s = sign();
        launch(line(-s * 1.25, rnd(vLo, vHi), -rnd(26, 30), 0, s * rnd(.18, .26), 0, .02), sc.peace ? pick(CANDY) : L[3], .3);
      }
      if (!sc.peace) sc.end = Math.max(...ev.map(e => (e.to || e.t))) + .2;
      return sc;
    }

    function runEvents(sc) {
      for (const e of sc.ev) {
        if (e.to !== undefined) {
          if (e.next === undefined) e.next = e.t;
          while (sc.T >= e.next && e.next <= e.to) {
            e.fn();
            e.next += e.every * rnd(.8, 1.2);
          }
        } else if (!e.done && sc.T >= e.t) {
          e.done = true;
          e.fn();
        }
      }
    }

    // ---------- Mini-game enemies ----------
    // They appear far ahead of our plane (which faces north) across the whole sky, in left / centre / right
    // lanes, dive in shooting, then pull up and away over us. In the round our plane sits low at the bottom of
    // the screen (a view over its tail), so `lift` raises the enemies' altitude to keep them up in the sky.
    const GUN = new V3(), aimAt = new V3();
    const arena = { on: false, spawnAcc: 0, t: 0, bounds: [0, 0], lift: 0 };
    const BREAK_R = 9;
    function bearingPoint(th, R, h, out) {
      return out.set(GUN.x + Math.sin(th) * R, GUN.y + h, GUN.z - Math.cos(th) * R);
    }
    function arenaBounds(side) {
      // bearings whose spawn point lands at 6 % / 94 % of the right half (screen centre → right edge)
      const s = getScale();
      const find = target => {
        let lo = -1.4, hi = 1.4;
        for (let i = 0; i < 24; i++) {
          const mid = (lo + hi) / 2;
          bearingPoint(mid, 44, 2.2 * s + arena.lift, fA).project(camera);
          if (fA.x < target) lo = mid; else hi = mid;
        }
        return (lo + hi) / 2;
      };
      arena.side = side;
      arena.bounds = isMobile() || side === 0 ? [find(-.9), find(.9)] : side < 0 ? [find(-.92), find(-.06)] : [find(.06), find(.92)];
    }
    function enemyPath(th0, R0, speed, h) {
      const s = getScale();
      const juke = rnd(.03, .1), jw = rnd(.7, 1.5), ph = rnd(0, 6);
      const tb = (R0 - BREAK_R) / speed;
      const side = rnd(.4, 1) * (isMobile() || arena.side === 0 ? sign() : 1);
      const g = GUN.clone();
      return t => {
        const tt = Math.min(t, tb);
        const R = R0 - speed * tt;
        const th = th0 + Math.sin(tt * jw + ph) * juke * (R / R0);
        let x = g.x + Math.sin(th) * R, z = g.z - Math.cos(th) * R;
        let y = g.y + h + Math.sin(tt * 1.7 + ph) * .25 * s;
        if (t > tb) {                              // break off: overshoot, climb and roll away
          const d = t - tb;
          x += -Math.sin(th) * speed * d * .7 + side * d * d * 2.6 * s;
          z += Math.cos(th) * speed * d * .55;
          y += d * d * 3.4 * s + d * 1.5 * s;
        }
        return { w: true, x, y, z };
      };
    }
    // A strafing run: comes in from off the left or right edge, crosses in front of us firing, and leaves on the far side
    function strafePath(from, h, R, speed) {
      const s = getScale(), g = GUN.clone(), ph = rnd(0, 6);
      const th0 = from * 1.55, th1 = -from * 1.55;
      const dur = Math.abs(th1 - th0) * R / speed;
      return t => {
        const k = t / dur;
        const th = th0 + (th1 - th0) * k;
        const r = R * (1 - .28 * Math.sin(Math.PI * clamp(k, 0, 1)));        // swings in closer mid-run
        return { w: true, x: g.x + Math.sin(th) * r, y: g.y + h + Math.sin(t * 1.3 + ph) * .3 * s, z: g.z - Math.cos(th) * r };
      };
    }
    function spawnStrafer() {
      const from = sign(), R = rnd(20, 26), speed = rnd(9, 12) + Math.min(1, arena.t / 30) * 3;
      const a = launch(strafePath(from, rnd(1.4, 3.8) * getScale() + arena.lift, R, speed), LIVERIES[Math.floor(Math.random() * LIVERIES.length)], rnd(.5, .58), 0);
      if (!a) return;
      a.enemy = true;
      a.clock = 0;
      a.tb = 1.55 * 2 * R / speed * .7;
      a.nextShot = a.tb * rnd(.25, .4);
      a.shots = 0;
    }
    function spawnEnemy() {
      if (arena.side === 0 && !isMobile() && Math.random() < .3) { spawnStrafer(); return; }
      const r = Math.random();
      const lane = r < .34 ? rnd(.04, .28) : r < .67 ? rnd(.38, .62) : rnd(.72, .96);
      const th = arena.bounds[0] + (arena.bounds[1] - arena.bounds[0]) * lane;
      const hard = Math.min(1, arena.t / 30);
      const speed = rnd(6.5, 8.5) + hard * 3;
      const R0 = rnd(40, 48);
      const a = launch(enemyPath(th, R0, speed, rnd(1.3, 3.6) * getScale() + arena.lift), LIVERIES[Math.floor(Math.random() * LIVERIES.length)], rnd(.5, .6), 0);
      if (!a) return;
      a.enemy = true;
      a.clock = 0;
      a.tb = (R0 - BREAK_R) / speed;
      a.nextShot = a.tb * rnd(.15, .3);
      a.shots = 0;
    }
    function updateArena(dt, playing, side) {
      if (!playing) return;
      if (!arena.on) {
        arena.on = true;
        arena.t = 0;
        arena.spawnAcc = .6;
        arenaBounds(side);
      }
      arena.t += dt;
      arena.spawnAcc -= dt;
      const alive = actors.filter(a => a.enemy && a.alive).length;
      if (arena.spawnAcc <= 0 && alive < 6) {
        spawnEnemy();
        if (arena.t > 12 && Math.random() < .35) spawnEnemy();     // later on they come in pairs
        arena.spawnAcc = Math.max(.55, 1.35 - arena.t * .028) * rnd(.8, 1.2);
      }
      for (const a of actors) {
        if (!a.enemy || !a.alive || a.clock < a.nextShot || a.clock > a.tb) continue;
        // rounds that are on target go for a real spot on our plane or the podium (plane.js picks it)
        const miss = Math.random() < .35;
        shootAt(a, !miss && api.hitPoint ? api.hitPoint(aimAt) : GUN, miss);
        a.shots++;
        a.nextShot = a.clock + (a.shots % 5 ? .09 : rnd(.5, .9));
      }
    }
    const gameApi = {
      // The live enemy closest to the line of fire (flat = horizontal aim direction), within maxAng radians
      nearest(start, flat, maxAng = .35) {
        let best = null, bestA = maxAng;
        for (const a of actors) {
          if (!a.enemy || !a.alive || !a.active) continue;
          const dx = a.pos.x - start.x, dz = a.pos.z - start.z, hd = Math.hypot(dx, dz);
          if (hd < 1) continue;
          const ang = Math.acos(clamp((dx * flat.x + dz * flat.z) / hd, -1, 1));
          if (ang < bestA) { bestA = ang; best = a; }
        }
        return best;
      },
      // Pitch (as a slope) the turret needs to reach the enemy nearest the line of fire
      elevation(start, flat, bulletSpeed) {
        const best = gameApi.nearest(start, flat);
        if (!best) return 2.2 * getScale() / 24;
        const hd = Math.hypot(best.pos.x - start.x, best.pos.z - start.z);
        return (best.pos.y + best.vel.y * (hd / bulletSpeed) - start.y) / hd;
      },
      // A missile reached `a` (only counts if it really is close); returns where it went down
      destroy(a, near) {
        if (!a || !a.enemy || !a.alive || !a.active) return null;
        if (near && near.distanceTo(a.pos) > a.world * 4) return null;
        const at = a.pos.clone();
        kill(a, Math.random() < .8 ? 'blast' : 'burn', 1.2);
        return at;
      },
      // Does this bullet step hit an enemy? Returns where, and brings it down.
      hit(p0, p1) {
        fA.subVectors(p1, p0);
        const len2 = fA.lengthSq() || 1;
        for (const a of actors) {
          if (!a.enemy || !a.alive || !a.active) continue;
          const k = clamp(fB.subVectors(a.pos, p0).dot(fA) / len2, 0, 1);
          fC.copy(p0).addScaledVector(fA, k);
          if (fC.distanceTo(a.pos) < a.world * 2.1) {
            const at = a.pos.clone();
            kill(a, Math.random() < .7 ? 'blast' : 'burn');
            return at;
          }
        }
        return null;
      },
    };

    // ---------- Raid: the fighters our plane battles during a long nav jump (plane.js scripts it) ----------
    const raid = {
      // path(T) returns a world point { w: true, x, y, z }; T = seconds since launch
      launch(path, livery, size) {
        const a = launch(path, LIVERIES[livery % LIVERIES.length], size, 0, livery === 9 || livery === 10 ? 'biplane' : undefined);
        if (!a) return null;
        a.foe = true;
        a.clock = 0;
        return a;
      },
      shoot(a, point, miss) { shootAt(a, point, miss); },
      // an enemy missile flying to a fixed point (our plane has already broken away from it)
      // `track` (anything with pos and alive) steers it; the returned missile can be re-aimed (at a flare)
      missile(a, point, onHit, track) {
        if (!a || !a.alive) return null;
        nose(a, fA, -.35);
        fB.copy(a.vel).normalize().multiplyScalar(a.vel.length() + 2 * getScale());
        a.flashT = .08;
        return spawnMissile({ pos: fA, vel: fB, size: a.world * 1.1, maxSpeed: 17 * getScale(), air: true, target: point, track, volume: .5, onHit });
      },
      kill(a, how) { if (a && a.active && a.alive) kill(a, how || 'blast', 1.15); },
      // Sweep the stage. `keepShow` spares the display flight, which flies itself off after the break.
      clear(keepShow) { for (const a of actors) if (a.foe && !(keepShow && a.show)) hide(a); },
    };

    // ---------- Director ----------
    let current = null, cooldown = 1.6, bag = [], last = '', bagPeace = null;
    function nextKind() {
      const calm = peaceful();
      if (!bag.length || bagPeace !== calm) {
        bagPeace = calm;
        bag = shuffle((calm ? PEACE_KINDS : KINDS).slice());
        if (bag[bag.length - 1] === last) bag.unshift(bag.pop());
      }
      return (last = bag.pop());
    }

    const blocks = [...document.querySelectorAll('.panel__content')];
    let contentBox = null, boxTimer = 0;
    // play: { playing, G } while the mini-game runs (G = our gun position)
    function update(dt, settled, section, play) {
      const playing = !!(play && play.playing);
      if (play && play.G) GUN.copy(play.G);
      arena.lift = (play && play.lift) || 0;
      if (!playing) arena.on = false;
      if (play && play.busy) settled = false;       // no background fights around the mini-game
      boxTimer -= dt;
      if (boxTimer <= 0) {
        boxTimer = .25;
        const el = blocks[section];
        contentBox = el ? el.getBoundingClientRect() : null;
      }
      if (current) {
        if (!settled) current.abort = true;              // our plane is leaving: hurry everyone off stage
        if (peaceful() && !current.peace && !current.abort) current.abort = true;   // switched to peaceful mid-fight
        current.T += dt * (current.abort ? 3.5 : 1);
        if (!current.abort) runEvents(current);
      }
      let flying = 0, panSum = 0;
      for (const a of actors) {
        if (!a.active) continue;
        if (a.enemy || a.foe) a.clock += dt;
        stepActor(a, a.enemy || a.foe ? a.clock : current ? current.T : 0, dt);
        if (a.active && a.alive) { flying++; panSum += panOf(a.pos); }
      }
      if (current && !actors.some(a => a.active) && (current.abort || current.T > current.end)) {
        current = null;
        cooldown = rnd(1.2, 2.6);
      }
      if (!settled) cooldown = Math.max(cooldown, 1.6);
      else if (!current) {
        cooldown -= dt;
        if (cooldown <= 0) current = start(nextKind(), section);
      }
      updateArena(dt, playing, play && play.side);
      for (const tr of tracers) {
        const d = tr.userData;
        if (!d.on) continue;
        d.life += dt;
        if (d.life >= d.max) {
          d.on = tr.visible = false;
          if (d.player && api.onPlayerHit) api.onPlayerHit(fA.copy(d.start).addScaledVector(d.dir, d.speed * d.max), d.dir);
          continue;
        }
        const head = d.speed * d.life, tail = Math.max(0, head - d.len);
        tr.position.copy(d.start).addScaledVector(d.dir, (head + tail) / 2);
        tr.scale.set(Math.max(.001, head - tail), getScale(), getScale());
        tr.material.opacity = 1 - Math.pow(d.life / d.max, 3);
        tr.visible = true;
      }
      for (const p of debris) {
        const d = p.userData;
        if (!d.on) continue;
        d.life += dt;
        if (d.life >= d.max) { d.on = p.visible = false; continue; }
        d.vel.y -= 6 * getScale() * dt;
        p.position.addScaledVector(d.vel, dt);
        p.rotation.x += d.spin.x * dt;
        p.rotation.y += d.spin.y * dt;
        p.rotation.z += d.spin.z * dt;
        d.smokeAcc += dt;
        if (d.life < .7 && d.smokeAcc > .06) {
          d.smokeAcc = 0;
          spawnTrail(p.position, false, p.scale.x / getScale() * .8, true);
        }
      }
      if (sfx) sfx.background(flying, flying ? panSum / flying : 0);
    }

    return { update, actors, game: gameApi, raid, get kind() { return current ? current.kind : null; }, get time() { return current ? current.T : 0; } };
  }

  window.Dogfight = { create };
})();
