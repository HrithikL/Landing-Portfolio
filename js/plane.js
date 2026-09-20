/* =========================================================
   3D fighter biplane — procedural model with painted livery,
   guns that fire on the podium and rockets released in flight.
   Swap buildPlane() for a GLTF later; the flight rig stays the same.
   ========================================================= */
(() => {
  const Flight = window.Flight;
  if (!window.THREE || !Flight) { document.body.classList.add('no-webgl'); return; }

  const canvas = document.getElementById('scene');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (err) {
    document.body.classList.add('no-webgl');
    return;
  }

  const V3 = THREE.Vector3;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const damp = (k, dt) => 1 - Math.exp(-k * dt);
  const col = hex => new THREE.Color(hex).convertSRGBToLinear();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const maxDpr = Math.min(devicePixelRatio, 1.5);
  let dpr = maxDpr;
  renderer.setPixelRatio(dpr);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, .1, 100);
  camera.position.set(0, 1.4, 14);
  camera.lookAt(0, 0, 0);

  // ---------- Lighting ----------
  const hemi = new THREE.HemisphereLight(col(0xFFF6EA), col(0xA88560), .78);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(col(0xFFFFFF), 1.6);
  key.position.set(5, 9, 7);
  scene.add(key, key.target);
  // Real shadow of the plane on the podium. The shadow camera follows the nearest podium and the map is only
  // re-rendered while the plane is on or near it.
  const KEY_DIR = key.position.clone().normalize();
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  key.castShadow = true;
  key.shadow.mapSize.set(1536, 1536);
  key.shadow.bias = -.0006;
  key.shadow.normalBias = .03;
  key.shadow.radius = 3;
  const rim = new THREE.DirectionalLight(col(0xFFC996), .9);
  rim.position.set(-7, 3, -5);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(col(0xFFE4D9), .35);
  fill.position.set(-3, -4, 6);
  scene.add(fill);

  // ---------- Environment map (gives chrome and clearcoat something to reflect) ----------
  const envMap = (() => {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#FFFDF8');
    grad.addColorStop(.44, '#F3E4CC');
    grad.addColorStop(.52, '#B89572');
    grad.addColorStop(1, '#2E231B');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 256);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide })));
    const softbox = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.7, 3.3), side: THREE.DoubleSide });
    [[8, 10, 6], [-10, 5, -5]].forEach(([x, y, z]) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 4), softbox);
      m.position.set(x, y, z);
      m.lookAt(0, 0, 0);
      envScene.add(m);
    });
    const pm = new THREE.PMREMGenerator(renderer);
    const tex = pm.fromScene(envScene, .02).texture;
    pm.dispose();
    return tex;
  })();

  // ---------- Painted livery (canvas textures) ----------
  const ORANGE = '#FF8526', ORANGE_D = '#B34A0E', ORANGE_L = '#FFC77A', INK = '#141110';
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }
  function grain(g, w, h, n, alpha) {
    for (let i = 0; i < n; i++) {
      g.fillStyle = `rgba(255,240,220,${Math.random() * alpha})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
  }

  function mandala(g, R) {
    const stroke = (lw, color = ORANGE) => { g.lineWidth = lw; g.strokeStyle = color; g.stroke(); };
    const circle = (r, lw, color) => { g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); stroke(lw, color); };
    const petals = (n, r0, r1, w, fill, lw = 3, turn = 0) => {
      for (let i = 0; i < n; i++) {
        g.save();
        g.rotate((i + turn) / n * Math.PI * 2);
        g.beginPath();
        g.moveTo(r0, 0);
        g.quadraticCurveTo((r0 + r1) / 2, -w, r1, 0);
        g.quadraticCurveTo((r0 + r1) / 2, w, r0, 0);
        if (fill) { g.fillStyle = fill; g.fill(); }
        stroke(lw);
        g.restore();
      }
    };
    const dots = (n, r, s, color = ORANGE_L) => {
      g.fillStyle = color;
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2;
        g.beginPath();
        g.arc(Math.cos(a) * r, Math.sin(a) * r, s, 0, Math.PI * 2);
        g.fill();
      }
    };
    g.beginPath(); g.arc(0, 0, R * .07, 0, Math.PI * 2); g.fillStyle = ORANGE; g.fill();
    dots(8, R * .1, R * .014);
    petals(8, R * .08, R * .22, R * .07, 'rgba(168,67,12,.9)');
    circle(R * .235, 3);
    dots(20, R * .265, R * .012);
    petals(12, R * .29, R * .47, R * .08, 'rgba(245,122,31,.38)', 3);
    petals(12, R * .3, R * .42, R * .035, null, 2, .5);
    circle(R * .49, 5);
    circle(R * .515, 1.5, ORANGE_L);
    for (let i = 0; i < 48; i++) {
      const a = i / 48 * Math.PI * 2;
      g.beginPath();
      g.moveTo(Math.cos(a) * R * .52, Math.sin(a) * R * .52);
      g.lineTo(Math.cos(a) * R * .6, Math.sin(a) * R * .6);
      stroke(2);
    }
    circle(R * .62, 3);
    dots(40, R * .66, R * .011);
    petals(16, R * .7, R * .98, R * .1, 'rgba(168,67,12,.5)', 3.5);
    petals(16, R * .72, R * .88, R * .04, null, 2, .5);
    g.lineWidth = 3;
    for (let i = 0; i < 32; i++) {
      const a = i / 32 * Math.PI * 2;
      g.beginPath();
      g.arc(Math.cos(a) * R * 1.02, Math.sin(a) * R * 1.02, R * .05, a - 1.4, a + 1.4);
      stroke(2.5);
    }
  }

  function scroll(g, x, y, s, flip) {
    g.save();
    g.translate(x, y);
    g.scale(flip * s, s);
    g.strokeStyle = ORANGE;
    g.lineWidth = 3 / s;
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(30, -40, 80, -40, 100, 0);
    g.bezierCurveTo(120, 40, 170, 40, 190, 0);
    g.stroke();
    [[0, 0, -1], [190, 0, 1]].forEach(([cx, cy, d]) => {
      g.beginPath();
      for (let a = 0; a < 9; a += .2) {
        const r = 18 * (1 - a / 10);
        g.lineTo(cx + Math.cos(a * d) * r - 18 * d, cy + Math.sin(a) * r);
      }
      g.stroke();
    });
    for (let k = 0; k < 5; k++) {
      g.beginPath();
      g.ellipse(40 + k * 28, k % 2 ? 22 : -22, 9, 4, k, 0, Math.PI * 2);
      g.fillStyle = 'rgba(245,122,31,.55)';
      g.fill();
    }
    g.restore();
  }

  // Wing: canvas x = span (u), canvas top = leading edge
  const wingTex = canvasTex(2048, 512, (g, W, H) => {
    g.fillStyle = INK;
    g.fillRect(0, 0, W, H);
    grain(g, W, H, 2600, .05);
    const K = 1.13;                                    // keeps the mandalas round on the real wing
    [[560, 1], [W - 560, -1]].forEach(([x, flip]) => {
      g.save();
      g.scale(1, K);
      g.translate(x, H / 2 / K);
      mandala(g, 250);
      g.restore();
      scroll(g, x + flip * 290, H / 2, 1, flip);
      scroll(g, x - flip * 470, H / 2 - 120, .7, flip);
      scroll(g, x - flip * 470, H / 2 + 120, .7, -flip);
    });
    g.save();
    g.translate(W / 2, H / 2);
    g.scale(1, K);
    mandala(g, 110);
    g.restore();
    // edge pinstripes
    g.fillStyle = ORANGE;
    g.fillRect(0, 14, W, 10);
    g.fillRect(0, H - 22, W, 6);
    // crimson tips + orange band
    [[0, 1], [W, -1]].forEach(([x0, d]) => {
      const grad = g.createLinearGradient(x0, 0, x0 + d * 180, 0);
      grad.addColorStop(0, '#7A1119');
      grad.addColorStop(1, '#B3222B');
      g.fillStyle = grad;
      g.fillRect(Math.min(x0, x0 + d * 180), 0, 180, H);
      g.fillStyle = ORANGE;
      g.fillRect(Math.min(x0 + d * 180, x0 + d * 236), 0, 56, H);
      g.fillStyle = INK;
      g.fillRect(Math.min(x0 + d * 202, x0 + d * 208), 0, 6, H);
    });
  });

  // Fuselage: canvas x = around (u), canvas y = along (nose at the top)
  function dragon(g) {
    // local space: +X from tail towards the head, +Y towards the top of the fuselage
    const N = 110, LEN = 470;
    const spine = (s, o) => {
      o.x = s * LEN;
      o.y = Math.sin(s * Math.PI * 2.3 + .4) * 34 * (.3 + s * .7);
      return o;
    };
    const width = s => (6 + 25 * Math.sin(Math.min(1, s * 1.3) * Math.PI / 2)) * (s > .88 ? 1 - (s - .88) * 2.4 : 1);
    const P = [], Nn = [];
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      const a = spine(s, {}), b = spine(s + .001, {});
      const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy);
      P.push(a);
      Nn.push({ x: -dy / l, y: dx / l });
    }
    const flame = (x, y, len, ang, w) => {
      g.save();
      g.translate(x, y);
      g.rotate(ang);
      const gr = g.createLinearGradient(0, 0, len, 0);
      gr.addColorStop(0, ORANGE_L);
      gr.addColorStop(.5, ORANGE);
      gr.addColorStop(1, 'rgba(245,122,31,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(0, -w);
      g.bezierCurveTo(len * .4, -w * 1.4, len * .7, w * .6, len, w * 1.2);
      g.bezierCurveTo(len * .6, w * .3, len * .3, w * 1.3, 0, w);
      g.closePath();
      g.fill();
      g.restore();
    };
    // flames licking off the back
    for (let i = 8; i < N - 12; i += 9) {
      const p = P[i], n = Nn[i], w = width(i / N);
      flame(p.x + n.x * w * .8, p.y + n.y * w * .8, 34 + w * 1.6, Math.atan2(n.y, n.x) - 1.9, 5);
    }
    // body: dark outline then orange
    g.lineCap = 'round';
    [[ORANGE_D, 5], [ORANGE, 0]].forEach(([c, extra]) => {
      g.strokeStyle = c;
      for (let i = 0; i < N; i++) {
        g.lineWidth = width(i / N) * 2 + extra;
        g.beginPath();
        g.moveTo(P[i].x, P[i].y);
        g.lineTo(P[i + 1].x, P[i + 1].y);
        g.stroke();
      }
    });
    // pale belly
    g.strokeStyle = 'rgba(255,192,106,.85)';
    for (let i = 4; i < N - 6; i++) {
      const w = width(i / N);
      g.lineWidth = w * .55;
      g.beginPath();
      g.moveTo(P[i].x - Nn[i].x * w * .5, P[i].y - Nn[i].y * w * .5);
      g.lineTo(P[i + 1].x - Nn[i + 1].x * w * .5, P[i + 1].y - Nn[i + 1].y * w * .5);
      g.stroke();
    }
    // scales
    g.strokeStyle = ORANGE_D;
    g.lineWidth = 1.6;
    for (let i = 3; i < N - 8; i += 2) {
      const w = width(i / N), a = Math.atan2(Nn[i].x, -Nn[i].y);
      for (const off of [.15, -.1]) {
        g.beginPath();
        g.arc(P[i].x + Nn[i].x * w * off, P[i].y + Nn[i].y * w * off, w * .28, a + Math.PI * .6, a + Math.PI * 1.4);
        g.stroke();
      }
    }
    // dorsal spikes
    g.fillStyle = ORANGE;
    g.strokeStyle = ORANGE_D;
    g.lineWidth = 1.5;
    for (let i = 6; i < N - 10; i += 4) {
      const p = P[i], n = Nn[i], w = width(i / N), t = { x: n.y, y: -n.x };
      g.beginPath();
      g.moveTo(p.x + n.x * w * .8 - t.x * 5, p.y + n.y * w * .8 - t.y * 5);
      g.lineTo(p.x + n.x * (w + 13) - t.x * 7, p.y + n.y * (w + 13) - t.y * 7);
      g.lineTo(p.x + n.x * w * .8 + t.x * 5, p.y + n.y * w * .8 + t.y * 5);
      g.fill();
      g.stroke();
    }
    // legs + claws
    [.3, .64].forEach(s => {
      const i = Math.round(s * N), p = P[i], n = Nn[i], w = width(s);
      const kx = p.x - n.x * (w + 16) + 10, ky = p.y - n.y * (w + 16);
      g.strokeStyle = ORANGE;
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(p.x - n.x * w * .5, p.y - n.y * w * .5);
      g.quadraticCurveTo(p.x - n.x * (w + 8) - 6, p.y - n.y * (w + 8), kx, ky);
      g.stroke();
      g.strokeStyle = ORANGE_L;
      g.lineWidth = 2.2;
      [-.6, 0, .6].forEach(c => {
        g.beginPath();
        g.moveTo(kx, ky);
        g.lineTo(kx + Math.cos(c - Math.PI / 2 + .3) * 11 + 4, ky - n.y * 9 + Math.sin(c) * 7);
        g.stroke();
      });
    });
    // head
    const hp = P[N - 4], hn = Nn[N - 4];
    g.save();
    g.translate(hp.x, hp.y);
    g.rotate(Math.atan2(-hn.x, hn.y));
    // mane
    for (let k = 0; k < 6; k++) flame(-4 - k * 5, 12 + k * 2, 44, 2.4 + k * .14, 5);
    g.fillStyle = ORANGE;
    g.strokeStyle = ORANGE_D;
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(-14, 20);
    g.quadraticCurveTo(14, 30, 34, 20);
    g.lineTo(66, 16);
    g.quadraticCurveTo(78, 12, 76, 5);
    g.lineTo(46, 4);
    g.lineTo(70, -8);
    g.lineTo(60, -15);
    g.quadraticCurveTo(30, -12, 10, -24);
    g.quadraticCurveTo(-10, -20, -16, -4);
    g.closePath();
    g.fill();
    g.stroke();
    // teeth
    g.fillStyle = '#FFF1D8';
    for (let k = 0; k < 4; k++) {
      g.beginPath();
      g.moveTo(48 + k * 6, 4); g.lineTo(51 + k * 6, -1); g.lineTo(54 + k * 6, 4);
      g.fill();
    }
    // eye
    g.fillStyle = '#FFE08A';
    g.beginPath(); g.ellipse(28, 12, 7, 4.5, -.2, 0, Math.PI * 2); g.fill();
    g.fillStyle = INK;
    g.beginPath(); g.ellipse(29, 12, 2, 4, 0, 0, Math.PI * 2); g.fill();
    // horns
    g.fillStyle = ORANGE_L;
    g.beginPath();
    g.moveTo(4, 22); g.quadraticCurveTo(-20, 44, -44, 50); g.quadraticCurveTo(-18, 36, -6, 18);
    g.fill();
    g.beginPath();
    g.moveTo(14, 24); g.quadraticCurveTo(0, 42, -16, 56); g.quadraticCurveTo(-2, 38, 6, 22);
    g.fill();
    // whiskers
    g.strokeStyle = ORANGE;
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(70, 12); g.bezierCurveTo(90, 30, 40, 60, 10, 46); g.stroke();
    g.beginPath(); g.moveTo(60, -12); g.bezierCurveTo(70, -40, 20, -50, -10, -38); g.stroke();
    // breath
    flame(76, 0, 70, .1, 7);
    g.restore();
  }
  const fuseTex = canvasTex(1024, 1024, (g, W, H) => {
    g.fillStyle = INK;
    g.fillRect(0, 0, W, H);
    grain(g, W, H, 3000, .05);
    // panel seams around the fuselage
    g.fillStyle = 'rgba(255,255,255,.05)';
    [160, 330, 520, 700, 860].forEach(y => g.fillRect(0, y, W, 3));
    // top pinstripes either side of the spine
    g.fillStyle = ORANGE;
    [372, 646].forEach(x => g.fillRect(x, 0, 7, H));
    g.fillStyle = 'rgba(245,122,31,.5)';
    [390, 628].forEach(x => g.fillRect(x, 0, 2, H));
    // nose ring + tail cone
    g.fillStyle = ORANGE;
    g.fillRect(0, 0, W, 34);
    g.fillRect(0, H - 30, W, 30);
    g.fillStyle = '#A51E26';
    g.fillRect(0, 34, W, 10);
    // a dragon on each side, back towards the spine, head towards the nose
    [[256, 1], [768, -1]].forEach(([cx, d]) => {
      g.setTransform(0, -1, d, 0, cx, H - 110);
      dragon(g);
      g.setTransform(1, 0, 0, 1, 0, 0);
    });
  });

  // ---------- Materials ----------
  const phys = o => new THREE.MeshPhysicalMaterial(o);
  const std = o => new THREE.MeshStandardMaterial(o);
  const M = {
    black: phys({ color: col(0x1A1714), roughness: .48, metalness: .25, clearcoat: .6, clearcoatRoughness: .3 }),
    orange: phys({ color: col(0xF0521C), roughness: .32, clearcoat: 1, clearcoatRoughness: .12, emissive: col(0x3A1400) }),
    orangeIn: phys({ color: col(0xD8461A), roughness: .4, clearcoat: .6, side: THREE.DoubleSide }),
    red: phys({ color: col(0xC02A56), roughness: .36, clearcoat: .9, clearcoatRoughness: .15 }),
    chrome: std({ color: col(0xECE6DE), roughness: .14, metalness: 1, side: THREE.DoubleSide }),
    gunmetal: std({ color: col(0x2B2B2E), roughness: .36, metalness: .85 }),
    steel: std({ color: col(0x8A847E), roughness: .3, metalness: .9 }),
    brass: std({ color: col(0xD29A43), roughness: .26, metalness: .95 }),
    rubber: std({ color: col(0x171514), roughness: .88 }),
    leather: std({ color: col(0x5A3520), roughness: .6 }),
    fur: std({ color: col(0x8E6242), roughness: .85 }),
    face: std({ color: col(0xD9B08A), roughness: .7 }),
    glass: phys({ color: col(0xD8ECF2), roughness: .05, metalness: .1, transparent: true, opacity: .4, clearcoat: 1 }),
    blade: phys({ color: 0xFFFFFF, vertexColors: true, roughness: .42, clearcoat: .6, clearcoatRoughness: .2 }),
    fuse: phys({ map: fuseTex, emissiveMap: fuseTex, emissive: col(0xFFFFFF), emissiveIntensity: .24, roughness: .5, metalness: .2, clearcoat: .55, clearcoatRoughness: .3 }),
    wing: phys({ map: wingTex, emissiveMap: wingTex, emissive: col(0xFFFFFF), emissiveIntensity: .26, roughness: .52, metalness: .15, clearcoat: .45, clearcoatRoughness: .35 }),
  };
  Object.values(M).forEach(m => { m.envMap = envMap; m.envMapIntensity = .75; });

  // ---------- Geometry helpers ----------
  function roundedRect(w, h, r) {
    const s = new THREE.Shape();
    const x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }
  const extrude = (shape, depth, bevel, center = true) => {
    const g = new THREE.ExtrudeGeometry(shape, {
      depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 5, curveSegments: 28,
    });
    if (center) g.center();
    else g.translate(0, 0, -depth / 2);
    return g;
  };
  // Planar UVs from the bounding box, so a painted texture spans the whole part
  function boxUV(g, uAxis, vAxis) {
    g.computeBoundingBox();
    const b = g.boundingBox, p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const u = (p['get' + uAxis.toUpperCase()](i) - b.min[uAxis]) / (b.max[uAxis] - b.min[uAxis]);
      const v = (p['get' + vAxis.toUpperCase()](i) - b.min[vAxis]) / (b.max[vAxis] - b.min[vAxis]);
      uv.setXY(i, u, v);
    }
    uv.needsUpdate = true;
    return g;
  }
  // Horizontal lifting surface: span along Z, chord along X
  function wingGeo(span, chord, thick) {
    const g = extrude(roundedRect(span, chord, chord * .3), thick, thick * .5);
    g.rotateX(Math.PI / 2);
    g.rotateY(Math.PI / 2);
    return boxUV(g, 'z', 'x');
  }
  function rod(a, b, r, mat, seg = 10) {
    const dir = new V3().subVectors(b, a);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, dir.length(), seg), mat);
    m.position.copy(a).addScaledVector(dir, .5);
    m.quaternion.setFromUnitVectors(new V3(0, 1, 0), dir.normalize());
    return m;
  }
  const along = (geo) => { geo.rotateZ(-Math.PI / 2); return geo; };   // cylinder/cone axis → +X
  function radialTexture(stops, size = 256) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    stops.forEach(([o, color]) => grad.addColorStop(o, color));
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
  }

  // ---------- Draw-call merging ----------
  // Every static mesh under `group` (skipping subtrees `skip` says are animated) is baked into one mesh
  // per material. The plane goes from ~300 draw calls (twice, with the shadow pass) to a couple of dozen.
  function mergeGeometries(geos) {
    const names = ['position', 'normal', 'uv', 'color'].filter(n => geos.every(g => g.attributes[n]));
    const out = new THREE.BufferGeometry();
    names.forEach(n => {
      const size = geos[0].attributes[n].itemSize;
      const arr = new Float32Array(geos.reduce((a, g) => a + g.attributes[n].count * size, 0));
      let o = 0;
      geos.forEach(g => {
        const src = g.attributes[n].array;
        arr.set(src.length === g.attributes[n].count * size ? src : src.subarray(0, g.attributes[n].count * size), o);
        o += g.attributes[n].count * size;
      });
      out.setAttribute(n, new THREE.BufferAttribute(arr, size));
    });
    out.computeBoundingSphere();
    return out;
  }
  function mergeStatic(group, skip, shadow = true) {
    group.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
    const buckets = new Map();
    const victims = [];
    const walk = obj => {
      obj.children.forEach(c => {
        if (skip && skip(c)) return;
        if (c.isMesh && !c.isInstancedMesh && !Array.isArray(c.material) && !c.children.length) {
          const g = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone();
          g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, c.matrixWorld));
          if (!buckets.has(c.material)) buckets.set(c.material, []);
          buckets.get(c.material).push(g);
          victims.push(c);
        } else walk(c);
      });
    };
    walk(group);
    if (victims.length < 2) return;
    victims.forEach(v => v.parent.remove(v));
    buckets.forEach((geos, mat) => {
      const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
      mesh.castShadow = shadow && !mat.transparent;
      mesh.receiveShadow = shadow;
      mesh.frustumCulled = false;
      group.add(mesh);
      geos.forEach(g => g.dispose());
    });
  }

  // Machine gun along +X; the barrel is its own group so it can recoil
  function makeGun(len, drum) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(.3, .075, .065), M.gunmetal);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(.05, .09, .03), M.leather);
    grip.position.set(-.15, -.05, 0);
    grip.rotation.z = -.3;
    g.add(body, grip);
    const barrel = new THREE.Group();
    g.add(barrel);
    const jacket = along(new THREE.CylinderGeometry(.031, .031, len, 14));
    jacket.translate(.15 + len / 2, 0, 0);
    barrel.add(new THREE.Mesh(jacket, M.black));
    const ringGeo = new THREE.TorusGeometry(.032, .006, 6, 16);
    for (let x = .19; x < .12 + len; x += .065) {
      const r = new THREE.Mesh(ringGeo, M.steel);
      r.position.x = x;
      r.rotation.y = Math.PI / 2;
      barrel.add(r);
    }
    const muzzle = along(new THREE.CylinderGeometry(.016, .022, .06, 10));
    muzzle.translate(.15 + len + .03, 0, 0);
    barrel.add(new THREE.Mesh(muzzle, M.gunmetal));
    const band = new THREE.Mesh(along(new THREE.CylinderGeometry(.036, .036, .03, 14)), M.orange);
    band.position.x = .17;
    barrel.add(band);
    if (drum) {
      const d = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, .036, 22), M.black);
      d.position.set(.02, .058, 0);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(.09, .008, 6, 22), M.orange);
      rim.rotation.x = Math.PI / 2;
      rim.position.copy(d.position);
      g.add(d, rim);
    }
    return { g, barrel, tip: .15 + len + .07 };
  }

  // Rocket along +X, centred
  function makeRocket() {
    const r = new THREE.Group();
    const body = along(new THREE.CylinderGeometry(.04, .04, .36, 14));
    body.translate(-.02, 0, 0);
    r.add(new THREE.Mesh(body, M.black));
    const nose = along(new THREE.ConeGeometry(.04, .14, 14));
    nose.translate(.23, 0, 0);
    r.add(new THREE.Mesh(nose, M.black));
    const tip = along(new THREE.ConeGeometry(.012, .03, 8));
    tip.translate(.3, 0, 0);
    r.add(new THREE.Mesh(tip, M.orange));
    [.12, -.13].forEach(x => {
      const b = new THREE.Mesh(along(new THREE.CylinderGeometry(.043, .043, .028, 14)), M.orange);
      b.position.x = x;
      r.add(b);
    });
    const finGeo = new THREE.BoxGeometry(.09, .15, .006);
    [Math.PI / 4, -Math.PI / 4].forEach(a => {
      const f = new THREE.Mesh(finGeo, M.orange);
      f.position.x = -.17;
      f.rotation.x = a;
      r.add(f);
    });
    const nozzle = along(new THREE.CylinderGeometry(.026, .032, .04, 12, 1, true));
    nozzle.translate(-.22, 0, 0);
    r.add(new THREE.Mesh(nozzle, M.gunmetal));
    return r;
  }
  const rocketProto = makeRocket();
  mergeStatic(rocketProto);


  // ---------- The fighter biplane (nose points +X) ----------
  function buildPlane() {
    const root = new THREE.Group();
    const add = (mesh, x = 0, y = 0, z = 0) => { mesh.position.set(x, y, z); root.add(mesh); return mesh; };

    // Fuselage — lathe profile (radius, length); texture runs tail → nose with the dragons on the flanks
    const profile = [
      [0, -1.72], [.07, -1.68], [.13, -1.5], [.2, -1.15], [.29, -.65], [.37, -.2],
      [.43, .25], [.46, .65], [.465, .95], [.45, 1.02], [.3, 1.04], [0, 1.05],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const fuse = new THREE.LatheGeometry(profile, 64);
    const fp = fuse.attributes.position, fuv = fuse.attributes.uv;
    for (let i = 0; i < fp.count; i++) fuv.setY(i, (fp.getY(i) + 1.72) / 2.77);
    fuse.rotateZ(-Math.PI / 2);
    fuse.rotateX(Math.PI / 2);                          // texture seam underneath, flanks at u = .25 / .75
    add(new THREE.Mesh(fuse, M.fuse));

    // Engine: deep orange cowl around an exposed radial
    const cowl = along(new THREE.CylinderGeometry(.47, .47, .36, 56, 1, true));
    add(new THREE.Mesh(cowl, M.orangeIn), 1.14);
    const lip = add(new THREE.Mesh(new THREE.TorusGeometry(.458, .042, 14, 56), M.orange), 1.32);
    lip.rotation.y = Math.PI / 2;
    const rearLip = add(new THREE.Mesh(new THREE.TorusGeometry(.468, .018, 8, 56), M.black), .96);
    rearLip.rotation.y = Math.PI / 2;
    add(new THREE.Mesh(along(new THREE.CylinderGeometry(.16, .16, .12, 28)), M.gunmetal), 1.14);
    add(new THREE.Mesh(along(new THREE.CylinderGeometry(.07, .13, .16, 24)), M.gunmetal), 1.27);
    const barrelGeo = new THREE.CylinderGeometry(.052, .06, .2, 14);
    const finGeo = new THREE.CylinderGeometry(.082, .082, .011, 16);
    const headGeo = new THREE.BoxGeometry(.07, .05, .11);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const cyl = new THREE.Group();
      cyl.position.x = 1.14;
      cyl.rotation.x = a;
      const b = new THREE.Mesh(barrelGeo, M.black);
      b.position.y = .27;
      cyl.add(b);
      for (let k = 0; k < 4; k++) {
        const f = new THREE.Mesh(finGeo, M.gunmetal);
        f.position.y = .2 + k * .042;
        cyl.add(f);
      }
      const h = new THREE.Mesh(headGeo, M.steel);
      h.position.y = .39;
      cyl.add(h);
      root.add(cyl);
    }
    const spinner = along(new THREE.ConeGeometry(.15, .34, 32));
    add(new THREE.Mesh(spinner, M.orange), 1.56);
    const spinBack = add(new THREE.Mesh(new THREE.TorusGeometry(.148, .016, 8, 32), M.black), 1.395);
    spinBack.rotation.y = Math.PI / 2;

    // Propeller: black paddles with orange tips
    const prop = new THREE.Group();
    prop.position.x = 1.42;
    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(-.04, 0);
    bladeShape.lineTo(.04, 0);
    bladeShape.quadraticCurveTo(.13, .3, .115, .7);
    bladeShape.quadraticCurveTo(.1, .93, 0, .94);
    bladeShape.quadraticCurveTo(-.1, .93, -.115, .7);
    bladeShape.quadraticCurveTo(-.13, .3, -.04, 0);
    const bladeGeo = extrude(bladeShape, .034, .012);
    bladeGeo.translate(0, .5, 0);
    const bc = [], cBlack = col(0x16130F), cOrange = col(0xF0521C);
    const bp = bladeGeo.attributes.position;
    for (let i = 0; i < bp.count; i++) {
      const c = bp.getY(i) > .8 ? cOrange : cBlack;
      bc.push(c.r, c.g, c.b);
    }
    bladeGeo.setAttribute('color', new THREE.Float32BufferAttribute(bc, 3));
    bladeGeo.rotateY(Math.PI / 2);
    for (let i = 0; i < 2; i++) {
      const b = new THREE.Mesh(bladeGeo, M.blade);
      b.rotation.x = i * Math.PI;
      b.rotateY(.35);
      prop.add(b);
    }
    root.add(prop);

    // Motion-blur disc
    const blur = new THREE.Mesh(
      new THREE.CircleGeometry(.97, 64),
      new THREE.MeshBasicMaterial({
        map: radialTexture([[0, 'rgba(30,24,20,0)'], [.25, 'rgba(30,24,20,.06)'], [.78, 'rgba(30,24,20,.3)'], [.86, 'rgba(242,106,18,.45)'], [.97, 'rgba(242,106,18,.3)'], [1, 'rgba(30,24,20,0)']]),
        transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0,
      }),
    );
    blur.rotation.y = Math.PI / 2;
    blur.position.x = 1.45;
    root.add(blur);

    // Stacked chrome exhausts, three a side
    const pipes = [];
    [-1, 1].forEach(s => {
      [.1, 0, -.1].forEach((y, k) => {
        const z0 = .36, z1 = .58 + k * .018;
        const curve = new THREE.CatmullRomCurve3([
          new V3(1.02, y * .8, s * z0), new V3(.94, y, s * (z1 - .03)), new V3(.78, y, s * z1),
          new V3(.3, y - .01, s * z1), new V3(.04 - k * .05, y - .02, s * (z1 - .01)),
        ]);
        root.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 28, .04, 12, false), M.chrome));
        const end = curve.getPoint(1);
        const ring = add(new THREE.Mesh(new THREE.TorusGeometry(.04, .008, 6, 14), M.gunmetal), end.x, end.y, end.z);
        ring.rotation.y = Math.PI / 2;
        pipes.push(end.clone().add(new V3(-.04, 0, 0)));
      });
    });

    // Wings (biplane) with the painted livery
    add(new THREE.Mesh(wingGeo(3.9, .86, .07), M.wing), .32, .66);
    add(new THREE.Mesh(wingGeo(3.5, .8, .07), M.wing), .38, -.24);

    // Interplane + cabane struts, flying wires
    [-1, 1].forEach(s => {
      [.12, .56].forEach(x => {
        root.add(rod(new V3(x, -.2, s * 1.38), new V3(x, .62, s * 1.38), .03, M.black));
        const band = rod(new V3(x, .15, s * 1.38), new V3(x, .27, s * 1.38), .036, M.orange);
        root.add(band);
      });
      root.add(rod(new V3(.15, .36, s * .15), new V3(.15, .62, s * .3), .024, M.black));
      root.add(rod(new V3(.55, .4, s * .15), new V3(.55, .62, s * .3), .024, M.black));
      root.add(rod(new V3(.34, -.2, s * .3), new V3(.34, .62, s * 1.36), .006, M.steel, 5));
      root.add(rod(new V3(.34, -.2, s * 1.36), new V3(.34, .62, s * .3), .006, M.steel, 5));
      root.add(rod(new V3(.12, -.2, s * 1.38), new V3(.56, .62, s * 1.38), .006, M.steel, 5));
      root.add(rod(new V3(.62, -.34, s * .2), new V3(.34, -.2, s * 1.3), .006, M.steel, 5));
    });

    // Tail: orange fin, black rudder, black tailplane with orange tips
    const finShape = new THREE.Shape();
    finShape.moveTo(-.35, 0);
    finShape.lineTo(.45, 0);
    finShape.quadraticCurveTo(.1, .12, -.05, .62);
    finShape.quadraticCurveTo(-.15, .78, -.35, .75);
    finShape.lineTo(-.35, 0);
    const rudderShape = new THREE.Shape();
    rudderShape.moveTo(-.38, -.04);
    rudderShape.lineTo(-.38, .76);
    rudderShape.quadraticCurveTo(-.56, .78, -.63, .5);
    rudderShape.quadraticCurveTo(-.67, .14, -.56, -.04);
    rudderShape.lineTo(-.38, -.04);
    add(new THREE.Mesh(extrude(finShape, .045, .02, false), M.orange), -1.25, .1);
    add(new THREE.Mesh(extrude(rudderShape, .04, .016, false), M.black), -1.25, .1);
    add(new THREE.Mesh(new THREE.BoxGeometry(.02, .08, .07), M.orange), -1.63, .38);
    add(new THREE.Mesh(wingGeo(1.6, .48, .05), M.black), -1.42, .08);
    [-1, 1].forEach(s => {
      add(new THREE.Mesh(wingGeo(.22, .49, .055), M.orange), -1.42, .08, s * .7);
      add(new THREE.Mesh(new THREE.BoxGeometry(.4, .012, .02), M.orange), -1.36, .115, s * .35);
    });

    // Tandem cockpits (the crew is added after merging, see buildCrew)
    [[-.22, .36], [-.78, .26]].forEach(([x, y]) => {
      const rimMesh = add(new THREE.Mesh(new THREE.TorusGeometry(.17, .035, 12, 36), M.leather), x, y);
      rimMesh.rotation.x = Math.PI / 2;
      add(new THREE.Mesh(new THREE.CircleGeometry(.16, 24), M.rubber), x, y - .01).rotation.x = -Math.PI / 2;
      const screen = add(new THREE.Mesh(new THREE.BoxGeometry(.015, .12, .26), M.glass), x + .2, y + .08);
      screen.rotation.z = -.5;
      const frame = add(new THREE.Mesh(new THREE.BoxGeometry(.02, .02, .27), M.brass), x + .23, y + .03);
      frame.rotation.z = -.5;
    });

    // Guns: twin cowl guns and one on each upper wing
    const guns = [];
    const mountGun = (len, drum, x, y, z, side) => {
      const gn = makeGun(len, drum);
      gn.g.position.set(x, y, z);
      root.add(gn.g);
      guns.push({ ...gn, muzzle: new V3(x + gn.tip, y, z), eject: new V3(x - .02, y, z + side * .05), side, flashT: 0, recoil: 0 });
    };
    mountGun(.45, false, .5, .51, .085, 1);
    mountGun(.45, false, .5, .51, -.085, -1);
    mountGun(.5, true, .35, .745, .8, 1);
    mountGun(.5, true, .35, .745, -.8, -1);
    [.8, -.8].forEach(z => add(new THREE.Mesh(new THREE.BoxGeometry(.12, .04, .05), M.black), .35, .705, z));

    // Rocket racks: four under each lower wing
    const rack = [];
    [-1, 1].forEach(s => {
      add(new THREE.Mesh(new THREE.BoxGeometry(.46, .035, .2), M.black), .42, -.29, s * 1.0);
      add(new THREE.Mesh(new THREE.BoxGeometry(.3, .08, .02), M.orange), .42, -.33, s * 1.0);
    });
    [-.46, -.37].forEach(y => [.06, -.06].forEach(dz => [-1, 1].forEach(s => {
      const r = rocketProto.clone();
      r.position.set(.42, y, s * 1.0 + dz);
      root.add(r);
      rack.push({ mesh: r, state: 'armed', load: 1 });
    })));

    // Landing gear: fat black tyres on orange hubs (contact geometry unchanged)
    const wheels = [];
    [-1, 1].forEach(s => {
      root.add(rod(new V3(.66, -.32, s * .16), new V3(.55, -.88, s * .44), .028, M.black));
      root.add(rod(new V3(.18, -.3, s * .14), new V3(.55, -.88, s * .44), .022, M.black));
      root.add(rod(new V3(.62, -.48, s * .24), new V3(.58, -.68, s * .34), .042, M.orange));
      const wheel = new THREE.Group();
      wheel.position.set(.55, -.9, s * .5);
      const tyre = new THREE.Mesh(new THREE.TorusGeometry(.148, .087, 16, 36), M.rubber);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, .13, 28), M.orange);
      hub.rotation.x = Math.PI / 2;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(.045, .07, .17, 20), M.gunmetal);
      cap.rotation.x = Math.PI / 2;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(.2, .028, .136), M.black);
      wheel.add(tyre, hub, cap, spoke);
      root.add(wheel);
      wheels.push(wheel);
    });
    root.add(rod(new V3(.55, -.9, -.5), new V3(.55, -.9, .5), .022, M.black));
    // Tail wheel on a fork, so the plane sits tail-down like a real taildragger
    root.add(rod(new V3(-1.3, -.12, 0), new V3(-1.4, -.56, 0), .02, M.black));
    [-1, 1].forEach(s => root.add(rod(new V3(-1.4, -.55, s * .035), new V3(-1.42, -.62, s * .035), .01, M.orange, 6)));
    const tailWheel = new THREE.Mesh(new THREE.TorusGeometry(.045, .022, 8, 18), M.rubber);
    tailWheel.position.set(-1.42, -.62, 0);
    root.add(tailWheel);

    root.traverse(o => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      o.castShadow = !o.material.transparent;
      o.receiveShadow = true;
    });
    const animated = new Set([prop, blur, ...wheels, ...guns.map(gn => gn.barrel), ...rack.map(r => r.mesh)]);
    mergeStatic(root, c => animated.has(c));
    wheels.forEach(w => mergeStatic(w));
    guns.forEach(gn => mergeStatic(gn.barrel));
    const crew = buildCrew(root);
    return { root, prop, blur, pipes, wheels, guns, rack, crew, pilotHead: new V3(-.24, .74, 0) };
  }

  // ---------- Crew ----------
  // Two chibi aviators in the tandem cockpits. The pilot (front: spiky pale hair with green tips) flies with the
  // stick and works the throttle; the gunner (rear: blond, black fedora) holds the twin gun grips, squeezes the
  // triggers when the guns fire, slams the big red button for a rocket salvo and flicks switches on the panel.
  // Both panels face back and up, so all of it reads from behind the plane. Arms are two-bone IK chains,
  // solved every frame towards whatever the hands are doing. Heads and bodies are one vertex-coloured mesh
  // each; arms, hands, buttons and needles are instanced, so the whole crew costs a handful of draw calls.
  const Y_UP = new V3(0, 1, 0);
  const crewMat = std({ vertexColors: true, roughness: .6, metalness: .02 });
  crewMat.envMap = envMap;
  crewMat.envMapIntensity = .5;
  const SKIN = 0xF4CBA8, EYE_INK = 0x1B1210;
  function paint(geo, hex) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g.attributes.uv) g.deleteAttribute('uv');
    const c = col(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  }
  const pcM = new THREE.Matrix4(), pcQ = new THREE.Quaternion(), pcS = new V3(), pcP = new V3(), pcE = new THREE.Euler();
  // A coloured part: position, rotation (Euler) and scale, then an optional parent matrix
  function piece(geo, hex, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1], parent = null) {
    const g = paint(geo.clone(), hex);
    g.applyMatrix4(pcM.compose(pcP.set(...pos), pcQ.setFromEuler(pcE.set(...rot)), pcS.set(...scl)));
    if (parent) g.applyMatrix4(parent);
    return g;
  }
  // A coloured part with its +Y pointed along `dir`, centred at `at`
  function pointed(geo, hex, at, dir) {
    const g = paint(geo.clone(), hex);
    g.applyMatrix4(pcM.compose(at, pcQ.setFromUnitVectors(Y_UP, dir), pcS.set(1, 1, 1)));
    return g;
  }
  function crewMesh(parts, shadow = true) {
    const m = new THREE.Mesh(mergeGeometries(parts), crewMat);
    m.castShadow = shadow;
    m.receiveShadow = true;
    m.frustumCulled = false;
    parts.forEach(g => g.dispose());
    return m;
  }
  const sph = (r, w = 18, h = 12) => new THREE.SphereGeometry(r, w, h);

  // Big chibi head facing +X: eyes with irises and highlights, brows, blush, a smirk, then hair (and a hat)
  function buildHead(kind) {
    const P = [];
    const spiky = kind === 'spiky';
    P.push(piece(sph(.1, 30, 22), SKIN, [0, 0, 0], [0, 0, 0], [1, .95, 1.04]));
    [-1, 1].forEach(s => {
      P.push(piece(sph(.022, 10, 8), SKIN, [-.006, -.012, s * .101], [0, 0, 0], [.7, 1, .45]));
      P.push(piece(sph(.03, 16, 12), 0xFFFFFF, [.08, -.002, s * .041], [0, 0, 0], [.42, 1.08, .78]));
      P.push(piece(sph(.021, 14, 10), spiky ? 0xB2362A : 0x3E7FC0, [.089, -.006, s * .04], [0, 0, 0], [.4, 1.1, .8]));
      P.push(piece(sph(.011, 10, 8), EYE_INK, [.095, -.007, s * .04], [0, 0, 0], [.4, 1.05, .8]));
      P.push(piece(sph(.0065, 8, 6), 0xFFFFFF, [.098, .008, s * .033]));
      P.push(piece(new THREE.BoxGeometry(.007, .008, .04), spiky ? 0x9FB59A : 0xC99A2E, [.091, .045, s * .043], [s * (spiky ? .32 : -.12), 0, 0]));
      P.push(piece(sph(.014, 10, 8), 0xF29A8C, [.084, -.034, s * .062], [0, 0, 0], [.3, .6, 1]));
    });
    P.push(piece(new THREE.BoxGeometry(.006, .006, .032), 0x7A2E24, [.096, -.05, .006], [.2, 0, 0]));
    const spike = (az, el, len, rad, hex, tipHex, base = .07, from = null) => {
      const d = new V3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).normalize();
      const o = from || new V3();
      P.push(pointed(new THREE.ConeGeometry(rad, len, 7), hex, o.clone().addScaledVector(d, base + len * .5), d));
      if (tipHex) P.push(pointed(new THREE.ConeGeometry(rad * .38, len * .34, 7), tipHex, o.clone().addScaledVector(d, base + len * .86), d));
    };
    const deg = Math.PI / 180, R = (a, b) => a + Math.random() * (b - a);
    // Leather flying helmet: a snug cap over the top and back, ear flaps, a fur-trimmed face opening,
    // a seam down the middle and a chin strap; goggles pushed up on the forehead. A little hair shows at the back.
    const LEATHER = spiky ? 0x6A4328 : 0x4A3424, SEAM = spiky ? 0x4E2F1B : 0x33241A, FUR = 0xE9DDC7;
    const tuft = spiky ? 0xDCE7D4 : 0xF3C451, tip = spiky ? 0x62BD82 : 0xDFA636;
    for (let i = 0; i < 6; i++) spike((150 + i / 5 * 60) * deg, R(-38, -18) * deg, R(.045, .06), .024, tuft, spiky ? tip : null, .085);
    [-1, 1].forEach(s => spike(s * 22 * deg, -70 * deg, .035, .018, tuft, null, 0, new V3(.075, .05, s * .03)));
    P.push(piece(new THREE.SphereGeometry(.109, 30, 18, 0, Math.PI * 2, 0, Math.PI * .6), LEATHER, [-.004, .008, 0], [0, 0, .5]));
    P.push(piece(new THREE.TorusGeometry(.11, .006, 6, 40, 2.3), SEAM, [-.004, .008, 0], [0, 0, 1.0]));
    [-1, 1].forEach(s => {
      P.push(piece(sph(.052, 16, 12), LEATHER, [-.004, -.03, s * .088], [0, 0, 0], [1.05, 1.25, .42]));
      P.push(piece(sph(.016, 10, 8), SEAM, [-.004, -.03, s * .108], [0, 0, 0], [1, 1, .5]));
      P.push(piece(new THREE.CylinderGeometry(.006, .006, .07, 6), SEAM, [.03, -.085, s * .05], [s * .9, 0, 0]));
    });
    P.push(piece(new THREE.TorusGeometry(.083, .016, 10, 32), FUR, [.05, .015, 0], [0, Math.PI / 2, 0], [1, 1.12, 1.08]));
    P.push(piece(new THREE.TorusGeometry(.106, .007, 6, 36).rotateX(Math.PI / 2), 0x2A1E16, [.004, .056, 0], [0, 0, -.28]));
    [-1, 1].forEach(s => {
      const lens = [.083, .082, s * .036];
      P.push(piece(new THREE.CylinderGeometry(.03, .032, .02, 20), 0xB8893F, lens, [0, 0, -(Math.PI / 2 - .6)]));
      P.push(piece(new THREE.CylinderGeometry(.024, .024, .022, 20), 0x8FC6DA, [lens[0] + .003, lens[1] + .002, lens[2]], [0, 0, -(Math.PI / 2 - .6)]));
    });
    P.push(piece(new THREE.BoxGeometry(.012, .01, .02), 0xB8893F, [.087, .083, 0], [0, 0, -.6]));
    return crewMesh(P);
  }
  // Small body: flight jacket, collar, scarf, neck and shoulders (the arms are separate)
  function buildBody(kind) {
    // Leather flight jacket with a fur collar and a scarf trailing back in the wind
    const spiky = kind === 'spiky';
    const coat = spiky ? 0x6A4328 : 0x3E4A33, scarf = spiky ? 0xF3EFE6 : 0xC8322A;
    const P = [];
    P.push(piece(sph(.085, 20, 14), coat, [-.005, -.045, 0], [0, 0, 0], [.95, 1.15, 1.28]));
    P.push(piece(new THREE.CylinderGeometry(.028, .032, .06, 14), SKIN, [0, .05, 0]));
    P.push(piece(new THREE.TorusGeometry(.05, .02, 8, 22), 0xE9DDC7, [-.004, .018, 0], [Math.PI / 2, 0, 0]));
    P.push(piece(new THREE.TorusGeometry(.036, .014, 8, 20), scarf, [0, .045, 0], [Math.PI / 2, 0, 0]));
    P.push(piece(new THREE.BoxGeometry(.11, .008, .034), scarf, [-.07, .03, .02], [.25, .15, .35]));
    P.push(piece(new THREE.BoxGeometry(.004, .09, .004), 0x2A1E16, [.078, -.04, 0]));
    [-1, 1].forEach(s => P.push(piece(sph(.036, 14, 10), coat, [0, .012, s * .078])));
    return crewMesh(P);
  }

  const ARM_A = .085, ARM_B = .085;
  const BTN_COL = { g: 0x3BE36B, a: 0xFFB020, b: 0x3AA8FF, r: 0xFF3030, w: 0xF4F1E6 };
  function buildCrew(root) {
    const CK = [{ x: -.22, y: .36 }, { x: -.78, y: .26 }];
    const kinds = ['spiky', 'hat'];
    const pilots = [], heads = [], cabin = [];
    const buttons = [], needles = [];
    const shoulders = [];
    CK.forEach((c, k) => {
      const pilot = new THREE.Group();
      pilot.position.set(c.x - .005, c.y + .05, 0);
      pilot.scale.setScalar(1.15);
      pilot.add(buildBody(kinds[k]));
      const head = new THREE.Group();
      head.position.y = .15;
      head.add(buildHead(kinds[k]));
      head.scale.setScalar(.9);
      pilot.add(head);
      root.add(pilot);
      pilots.push(pilot);
      heads.push(head);
      // Instrument panel under the windscreen, tilted back towards the seat
      const Md = new THREE.Matrix4().compose(new V3(c.x + .135, c.y + .075, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -.55)), new V3(1, 1, 1));
      cabin.push(piece(new THREE.BoxGeometry(.014, .078, .25), 0x1D1C20, [0, 0, 0], [0, 0, 0], [1, 1, 1], Md));
      cabin.push(piece(new THREE.BoxGeometry(.016, .008, .255), 0x5A3520, [0, .04, 0], [0, 0, 0], [1, 1, 1], Md));
      cabin.push(piece(new THREE.BoxGeometry(.012, .09, .02), 0x1D1C20, [.03, -.06, 0], [0, 0, .5], [1, 1, 1], Md));
      const gauges = k ? [[.014, -.058], [.014, .058]] : [[.012, -.045], [.012, .045], [-.006, 0]];
      gauges.forEach(([gy, gz], j) => {
        const r = j === 2 ? .014 : .019;
        cabin.push(piece(new THREE.CylinderGeometry(r, r, .006, 20), 0xF1ECE0, [-.008, gy, gz], [0, 0, Math.PI / 2], [1, 1, 1], Md));
        cabin.push(piece(new THREE.TorusGeometry(r, .003, 6, 20), 0xD29A43, [-.011, gy, gz], [0, Math.PI / 2, 0], [1, 1, 1], Md));
        if (j < 2) needles.push({ m: Md.clone().multiply(new THREE.Matrix4().makeTranslation(-.0125, gy, gz)), a: 0, pilot: k, j });
      });
      const row = k
        ? [['a', -.022, -.09, 1.3], ['g', -.022, -.058, 1.3], ['b', -.022, .058, 1.3], ['w', -.022, .09, 1.3], ['r', .012, 0, 2]]
        : [['g', -.024, -.09, 1.3], ['a', -.024, -.055, 1.3], ['b', -.024, .055, 1.3], ['r', -.024, .09, 1.3], ['w', -.024, 0, 1.3]];
      const faceQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -.55)).multiply(new THREE.Quaternion().setFromUnitVectors(Y_UP, new V3(-1, 0, 0)));
      const normal = new V3(-1, 0, 0).applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -.55)));
      row.forEach(([kind, by, bz, size = 1]) => {
        buttons.push({
          base: new V3(-.009, by, bz).applyMatrix4(Md), q: faceQ, n: normal, scale: size,
          color: col(BTN_COL[kind]), pilot: k, side: bz > .01 || size > 1.5 ? 1 : -1, big: size > 1.5,
          on: Math.random() < .5, flash: 0, depth: 0,
        });
      });
      shoulders.push([-1, 1].map(s => new V3(0, .012, s * .08)));
    });
    root.add(crewMesh(cabin, false));

    // Front: control stick between the knees, throttle quadrant on the left wall
    const stick = new THREE.Group();
    stick.position.set(CK[0].x + .1, CK[0].y - .12, 0);
    stick.add(crewMesh([
      piece(new THREE.CylinderGeometry(.009, .012, .21, 10), 0x1A1714, [0, .105, 0]),
      piece(new THREE.CylinderGeometry(.019, .017, .05, 14), 0x2A2422, [0, .225, 0]),
      piece(new THREE.CylinderGeometry(.03, .03, .012, 16), 0x3A2A20, [0, .062, 0]),
    ], false));
    root.add(stick);
    const throttle = new THREE.Group();
    throttle.position.set(CK[0].x + .02, CK[0].y + .02, -.13);
    throttle.add(crewMesh([
      piece(new THREE.CylinderGeometry(.006, .007, .065, 8), 0x8A847E, [0, .032, 0]),
      piece(sph(.016, 12, 10), 0xE23A2A, [0, .068, 0]),
    ], false));
    root.add(throttle);
    root.add(crewMesh([piece(new THREE.BoxGeometry(.05, .014, .028), 0x1D1C20, [CK[0].x + .02, CK[0].y + .025, -.13])], false));
    // Rear: twin spade grips for the guns
    const grips = new THREE.Group();
    grips.position.set(CK[1].x + .09, CK[1].y + .035, 0);
    grips.add(crewMesh([
      piece(new THREE.BoxGeometry(.024, .014, .13), 0x2B2B2E, [0, 0, 0]),
      ...[-1, 1].map(s => piece(new THREE.CylinderGeometry(.011, .013, .05, 10), 0x3A2A20, [0, .03, s * .05])),
      piece(new THREE.CylinderGeometry(.008, .008, .05, 8), 0x2B2B2E, [-.02, -.025, 0]),
    ], false));
    root.add(grips);
    // trigger buttons: one on the stick, one on each grip
    buttons.push({ attach: stick, local: new V3(0, .253, 0), color: col(BTN_COL.r), pilot: 0, trigger: true, scale: .8, flash: 0, depth: 0, on: false });
    [-1, 1].forEach(s => buttons.push({ attach: grips, local: new V3(0, .058, s * .05), color: col(BTN_COL.r), pilot: 1, trigger: true, scale: .9, flash: 0, depth: 0, on: false }));

    // Instanced arms (upper, fore) tinted per pilot, gloved hands, buttons and gauge needles
    const armMat = std({ color: 0xFFFFFF, roughness: .65 });
    armMat.envMap = envMap;
    armMat.envMapIntensity = .5;
    const upperGeo = new THREE.CylinderGeometry(.021, .018, ARM_A, 10);
    upperGeo.translate(0, ARM_A / 2, 0);
    const foreGeo = new THREE.CylinderGeometry(.018, .015, ARM_B, 10);
    foreGeo.translate(0, ARM_B / 2, 0);
    const uppers = new THREE.InstancedMesh(upperGeo, armMat, 4);
    const fores = new THREE.InstancedMesh(foreGeo, armMat, 4);
    const handMat = std({ color: col(0x4A3326), roughness: .6 });
    const hands = new THREE.InstancedMesh(sph(.024, 12, 10), handMat, 4);
    [0, 1, 2, 3].forEach(i => {
      const c = col(i < 2 ? 0x6A4328 : 0x3E4A33);
      uppers.setColorAt(i, c);
      fores.setColorAt(i, c);
    });
    const btnGeo = new THREE.CylinderGeometry(.0085, .0095, .009, 14);
    const btnMesh = new THREE.InstancedMesh(btnGeo, new THREE.MeshBasicMaterial({ toneMapped: false }), buttons.length);
    buttons.forEach((b, i) => btnMesh.setColorAt(i, b.color));
    const needleGeo = new THREE.BoxGeometry(.002, .016, .003);
    needleGeo.translate(0, .007, 0);
    const needleMesh = new THREE.InstancedMesh(needleGeo, new THREE.MeshBasicMaterial({ color: col(0xC8331F) }), needles.length);
    [uppers, fores, hands, btnMesh, needleMesh].forEach(m => {
      m.frustumCulled = false;
      m.castShadow = m === uppers || m === fores;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      root.add(m);
    });
    return {
      pilots, heads, stick, throttle, grips, gripBase: grips.position.clone(), shoulders, buttons, needles, uppers, fores, hands, btnMesh, needleMesh,
      handState: [0, 1, 2, 3].map(i => ({ pilot: i >> 1, side: i % 2 ? 1 : -1, task: null, pos: new V3(), ready: false })),
      timers: [2.5, 4], look: [0, 0], lookT: [0, 0],
    };
  }

  // Outer rig: position + orientation. Inner: engine vibration.
  const plane = new THREE.Group();
  const model = buildPlane();
  plane.add(model.root);
  scene.add(plane);
  // Taildragger stance: at this nose-up angle the main wheels and the tail wheel both touch the ground
  const GROUND_PITCH = .223;
  const MAIN_WHEEL = { x: .55, y: -1.135 };        // main-wheel contact point in model units
  const groundHeight = p => -(MAIN_WHEEL.x * Math.sin(p) + MAIN_WHEEL.y * Math.cos(p));

  const glowTex = radialTexture([[0, 'rgba(255,255,255,1)'], [.18, 'rgba(255,255,255,.85)'], [.5, 'rgba(255,255,255,.2)'], [1, 'rgba(255,255,255,0)']], 128);
  // Soft contact shadow texture (used on the podium tops)
  const shadowTex = radialTexture([[0, 'rgba(70,40,20,.55)'], [.45, 'rgba(70,40,20,.22)'], [1, 'rgba(70,40,20,0)']]);

  // ---------- Smoke ----------
  // A soft, wispy puff: fractal value noise shaped into a ragged round cloud, lit from the top-left
  function smokeTexture(size, seed) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    const px = img.data;
    const N = 32, grid = new Float32Array(N * N);
    let sd = seed * 7919 + 13;
    const rand = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
    for (let i = 0; i < grid.length; i++) grid[i] = rand();
    const at = (x, y) => grid[((y % N) + N) % N * N + ((x % N) + N) % N];
    const vn = (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y);
      let fx = x - xi, fy = y - yi;
      fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
      const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * fx;
      const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * fx;
      return a + (b - a) * fy;
    };
    const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size * 2 - 1, v = y / size * 2 - 1;
        const r = Math.hypot(u, v);
        let n = 0, amp = .5, f = 3;
        for (let o = 0; o < 5; o++) { n += amp * vn(x / size * f + seed * 3.1, y / size * f + seed * 1.7); amp *= .5; f *= 2; }
        const edge = .72 + (n - .5) * .55;
        let a = 1 - sstep(edge * .25, edge, r);
        a *= Math.min(1, Math.max(0, .35 + n * .95));
        const light = Math.min(1, Math.max(0, .8 - (u * .45 + v * .6) * .22 + (n - .5) * .35));
        const k = (y * size + x) * 4;
        px[k] = px[k + 1] = px[k + 2] = 255 * light;
        px[k + 3] = 255 * Math.min(1, Math.max(0, a));
      }
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
  }
  const smokeTex = [smokeTexture(128, 3), smokeTexture(128, 7), smokeTexture(128, 11)];

  // ---------- Instanced smoke ----------
  // Every smoke puff (exhaust, rocket trails, burning wrecks) is one instance of a camera-facing quad,
  // so thousands of puffs cost a single draw call.
  function makeParticles(n, map, toneMapped = true) {
    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    geo.setIndex(quad.index);
    geo.setAttribute('position', quad.attributes.position);
    geo.setAttribute('uv', quad.attributes.uv);
    const P = new Float32Array(n * 3), Dt = new Float32Array(n * 2), Cl = new Float32Array(n * 4);
    const aP = new THREE.InstancedBufferAttribute(P, 3), aD = new THREE.InstancedBufferAttribute(Dt, 2), aC = new THREE.InstancedBufferAttribute(Cl, 4);
    [aP, aD, aC].forEach(at => at.setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('iPos', aP);
    geo.setAttribute('iDat', aD);
    geo.setAttribute('iCol', aC);
    geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: map } },
      transparent: true,
      depthWrite: false,
      vertexShader: `
        attribute vec3 iPos;
        attribute vec2 iDat;
        attribute vec4 iCol;
        varying vec2 vUv;
        varying vec4 vCol;
        void main() {
          vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
          float c = cos(iDat.y), s = sin(iDat.y);
          vec2 q = position.xy * iDat.x;
          mv.xy += vec2(c * q.x - s * q.y, s * q.x + c * q.y);
          gl_Position = projectionMatrix * mv;
          vUv = uv;
          vCol = iCol;
        }`,
      fragmentShader: `
        uniform sampler2D map;
        varying vec2 vUv;
        varying vec4 vCol;
        void main() {
          vec4 t = texture2D(map, vUv);
          float a = t.a * vCol.a;
          if (a < .004) discard;
          gl_FragColor = vec4(pow(t.rgb, vec3(2.2)) * vCol.rgb, a);
          #include <tonemapping_fragment>
          #include <encodings_fragment>
        }`,
    });
    mat.toneMapped = toneMapped;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    scene.add(mesh);
    let count = 0;
    return {
      material: mat,
      begin() { count = 0; },
      push(o, size, rot, c, alpha) {
        if (count >= n || alpha < .004) return;
        const i = count++;
        P[i * 3] = o.x; P[i * 3 + 1] = o.y; P[i * 3 + 2] = o.z;
        Dt[i * 2] = size; Dt[i * 2 + 1] = rot;
        Cl[i * 4] = c.r; Cl[i * 4 + 1] = c.g; Cl[i * 4 + 2] = c.b; Cl[i * 4 + 3] = alpha;
      },
      warm(on) { geo.instanceCount = on ? 1 : count; },
      end() {
        geo.instanceCount = count;
        [aP, aD, aC].forEach(at => {
          at.updateRange.offset = 0;
          at.updateRange.count = count * at.itemSize;
          at.needsUpdate = true;
        });
      },
    };
  }
  const smokeSys = makeParticles(1500, smokeTex[0]);
  const smokeCol = new THREE.Color();

  // Exhaust: soot-dark puffs leave the stacks in pulses, then billow, drift up and thin out
  const exhaust = Array.from({ length: 150 }, () => ({
    on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 1, spin: 0, rot: 0, seed: Math.random() * 10,
  }));
  let exhaustCursor = 0, pipeCursor = 0;
  const exA = new V3(), exB = new V3();
  function spawnExhaust(worldPos, side, back, speed) {
    const d = exhaust[exhaustCursor++ % exhaust.length];
    d.x = worldPos.x; d.y = worldPos.y; d.z = worldPos.z;
    const k = speed * scale, sk = (.25 + Math.random() * .35) * scale;
    d.vx = back.x * k + side.x * sk + (Math.random() - .5) * .18 * scale;
    d.vy = back.y * k + side.y * sk + (.05 + Math.random() * .15) * scale;
    d.vz = back.z * k + side.z * sk + (Math.random() - .5) * .18 * scale;
    d.life = 0;
    d.max = 1.3 + Math.random() * 1.1;
    d.size = .75 + Math.random() * .6;
    d.spin = (Math.random() - .5) * 1.4;
    d.rot = Math.random() * Math.PI * 2;
    d.on = true;
  }
  const smokeDay = col(0xE9E3DA), smokeNight = col(0x5E6678), sootDay = col(0x6F665E), sootNight = col(0x23262E), smokeLight = new THREE.Color();

  // ---------- Weapons FX ----------
  // Everything lives in the WebGL canvas, which sits behind the page content, so none of it can cover text.
  const X_AXIS = new V3(1, 0, 0);
  const fxTex = {
    glow: radialTexture([[0, 'rgba(255,255,255,1)'], [.22, 'rgba(255,255,255,.85)'], [.55, 'rgba(255,255,255,.2)'], [1, 'rgba(255,255,255,0)']], 128),
    ring: radialTexture([[0, 'rgba(255,255,255,0)'], [.62, 'rgba(255,255,255,0)'], [.86, 'rgba(255,255,255,.9)'], [1, 'rgba(255,255,255,0)']], 128),
    scorch: radialTexture([[0, 'rgba(20,14,10,.95)'], [.5, 'rgba(30,20,14,.6)'], [1, 'rgba(30,20,14,0)']], 128),
    flash: canvasTex(128, 128, (g, S) => {
      const c = S / 2;
      const gr = g.createRadialGradient(c, c, 0, c, c, c * .6);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(.35, 'rgba(255,220,150,.9)');
      gr.addColorStop(1, 'rgba(255,140,40,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, S, S);
      g.translate(c, c);
      for (let i = 0; i < 8; i++) {
        g.rotate(Math.PI / 4);
        const len = c * (i % 2 ? .6 : .98);
        const sg = g.createLinearGradient(0, 0, len, 0);
        sg.addColorStop(0, 'rgba(255,240,200,.95)');
        sg.addColorStop(1, 'rgba(255,150,40,0)');
        g.fillStyle = sg;
        g.beginPath();
        g.moveTo(0, -c * .09); g.lineTo(len, 0); g.lineTo(0, c * .09);
        g.fill();
      }
    }),
    tongue: canvasTex(128, 64, (g, W, H) => {
      const gr = g.createLinearGradient(0, 0, W, 0);
      gr.addColorStop(0, 'rgba(255,250,230,1)');
      gr.addColorStop(.35, 'rgba(255,190,90,.85)');
      gr.addColorStop(1, 'rgba(255,110,20,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(0, H / 2);
      g.quadraticCurveTo(W * .3, 0, W, H / 2);
      g.quadraticCurveTo(W * .3, H, 0, H / 2);
      g.fill();
    }),
    // Billowy puffs: clustered blobs with fairly firm edges and a little inner shading
    fire: canvasTex(256, 256, (g, S) => billow(g, S, 26, .1, .17, [[0, 1, 255], [.62, .95, 236], [.86, .6, 214], [1, 0, 200]])),
    smoke: smokeTex[0],
  };
  function billow(g, S, n, r0, r1, stops) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * S * .22;
      const x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d * .9;
      const r = S * (r0 + Math.random() * (r1 - r0)) * (1 - d / S);
      const gr = g.createRadialGradient(x - r * .25, y - r * .3, 0, x, y, r);
      stops.forEach(([o, al, v]) => gr.addColorStop(o, `rgba(${v},${v},${v},${al})`));
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  }
  const fxMat = (Type, o) => new Type({ transparent: true, depthWrite: false, toneMapped: false, ...o });
  // The page behind the canvas is light, so additive glows wash out: most effects use normal blending with saturated colours
  const ADD = THREE.AdditiveBlending, NORMAL = THREE.NormalBlending;

  // Muzzle flashes ride on the guns
  model.guns.forEach(gn => {
    const g = new THREE.Group();
    const star = new THREE.Sprite(fxMat(THREE.SpriteMaterial, { map: fxTex.flash, color: col(0xFFA93A), blending: NORMAL }));
    star.scale.setScalar(.36);
    star.position.x = .05;
    const tongueGeo = new THREE.PlaneGeometry(.46, .17);
    tongueGeo.translate(.23, 0, 0);
    const tongueMat = fxMat(THREE.MeshBasicMaterial, { map: fxTex.tongue, color: col(0xFFB347), blending: NORMAL, side: THREE.DoubleSide });
    const t1 = new THREE.Mesh(tongueGeo, tongueMat);
    const t2 = new THREE.Mesh(tongueGeo, tongueMat);
    t2.rotation.x = Math.PI / 2;
    g.add(star, t1, t2);
    g.position.copy(gn.muzzle);
    g.visible = false;
    model.root.add(g);
    gn.flash = { g, star };
  });
  const gunLight = new THREE.PointLight(col(0xFFA040), 0, 5, 2);
  scene.add(gunLight);
  // Exhaust flames flickering at the stack ends (brightest at night)
  const exhaustFlames = model.pipes.map(pt => {
    const fl = new THREE.Sprite(fxMat(THREE.SpriteMaterial, { map: fxTex.glow, color: col(0xFF8A3A), blending: ADD, opacity: 0 }));
    fl.position.copy(pt).add(new V3(-.05, 0, 0));
    fl.scale.setScalar(.08);
    model.root.add(fl);
    return fl;
  });

  // Navigation lights, strobe and beacon (no landing lamps: a headlight on a fighter looked wrong). Each is a real fixture built into the airframe
  // (a glass lens with a bulb inside), so it moves with the plane and reads as a lamp up close.
  // The lenses are plain tinted glass by day and light up at night, with a glow around the bulb.
  const lightSprite = (color, size, pos) => {
    const sp = new THREE.Sprite(fxMat(THREE.SpriteMaterial, { map: fxTex.glow, color: col(color), blending: ADD, opacity: 0 }));
    sp.position.copy(pos);
    sp.scale.setScalar(size);
    sp.visible = false;
    model.root.add(sp);
    return sp;
  };
  const lensMat = (hex, opacity = .78) => new THREE.MeshPhysicalMaterial({
    color: col(hex), emissive: col(hex), emissiveIntensity: 0, roughness: .06, metalness: 0,
    clearcoat: 1, clearcoatRoughness: .05, transparent: true, opacity, envMap, envMapIntensity: 1.2,
  });
  const bulbGeo = new THREE.SphereGeometry(1, 14, 10);
  const OFF = col(0x3A3632);
  function fixture(o) {
    const g = new THREE.Group();
    g.position.copy(o.pos);
    if (o.rot) g.rotation.set(o.rot[0], o.rot[1], o.rot[2]);
    model.root.add(g);
    const lens = new THREE.Mesh(o.lensGeo, lensMat(o.color, o.opacity));
    if (o.lensScale) lens.scale.set(...o.lensScale);
    const bulb = new THREE.Mesh(bulbGeo, new THREE.MeshBasicMaterial({ color: OFF.clone(), toneMapped: false }));
    bulb.scale.setScalar(o.bulb);
    if (o.bulbAt) bulb.position.set(...o.bulbAt);
    g.add(lens, bulb);
    if (o.rim) {
      const rimMesh = new THREE.Mesh(o.rim, M.chrome);
      g.add(rimMesh);
    }
    const out = new V3(...(o.glowAt || [0, 0, 0])).applyEuler(g.rotation).add(o.pos);
    const sp = lightSprite(o.color, o.glow, out);
    const core = lightSprite(0xFFFFFF, o.glow * .22, out);
    lens.castShadow = bulb.castShadow = false;
    return { g, lens, bulb, sp, core, mode: o.mode, color: col(o.color), glow: o.glow };
  }
  const podGeo = new THREE.SphereGeometry(1, 24, 16);
  const domeGeo = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  const tipRim = new THREE.TorusGeometry(.052, .007, 8, 28);
  const planeLights = [
    // wingtip pods, faired into the ends of the upper wing: red to port, green to starboard
    fixture({ pos: new V3(.32, .66, -1.968), color: 0xFF2A2A, mode: 'steady', lensGeo: podGeo, lensScale: [.13, .05, .06],
      bulb: .018, bulbAt: [0, 0, -.03], glow: .36, glowAt: [0, 0, -.05], rim: tipRim }),
    fixture({ pos: new V3(.32, .66, 1.968), color: 0x2BFF6A, mode: 'steady', lensGeo: podGeo, lensScale: [.13, .05, .06],
      bulb: .018, bulbAt: [0, 0, .03], glow: .36, glowAt: [0, 0, .05], rim: tipRim }),
    // tail light on the rudder's trailing edge
    fixture({ pos: new V3(-1.905, .5, 0), color: 0xFFF6E8, mode: 'steady', lensGeo: podGeo, lensScale: [.04, .03, .03],
      bulb: .012, bulbAt: [-.012, 0, 0], glow: .26, glowAt: [-.035, 0, 0] }),
    // anti-collision strobe, a low dome on top of the upper wing
    fixture({ pos: new V3(.26, .728, 0), color: 0xF4F8FF, mode: 'strobe', opacity: .55, lensGeo: domeGeo, lensScale: [.05, .026, .035],
      bulb: .011, bulbAt: [0, .01, 0], glow: 1.1, glowAt: [0, .04, 0] }),
    // red beacon under the belly
    fixture({ pos: new V3(-.35, -.335, 0), rot: [Math.PI, 0, 0], color: 0xFF3B30, mode: 'beacon', lensGeo: domeGeo, lensScale: [.045, .034, .045],
      bulb: .014, bulbAt: [0, .012, 0], glow: .55, glowAt: [0, .05, 0] }),
  ];
  // Light spilling onto the wing around the wingtip lamps
  const spillGeo = new THREE.PlaneGeometry(1, 1);
  spillGeo.rotateX(-Math.PI / 2);
  const spills = [[-1, 0xFF2A2A], [1, 0x2BFF6A]].map(([sz, hex]) => {
    const m = new THREE.Mesh(spillGeo, fxMat(THREE.MeshBasicMaterial, { map: fxTex.glow, color: col(hex), blending: ADD, opacity: 0 }));
    m.position.set(.32, .733, sz * 1.8);
    m.scale.set(.95, 1, .7);
    m.visible = false;
    model.root.add(m);
    return m;
  });
  const bulbCol = new THREE.Color();
  function updatePlaneLights(k) {
    const on = k > .01;
    const t = time;
    planeLights.forEach(L => {
      let v = 1;
      if (L.mode === 'strobe') { const u = t % 1.3; v = u < .05 || (u > .13 && u < .18) ? 1 : 0; }
      else if (L.mode === 'beacon') v = Math.pow(.5 + .5 * Math.sin(t * 5.5), 3);
      // strobe and beacon also blink by day, just on the lens
      const blinkDay = L.mode === 'strobe' || L.mode === 'beacon' ? (1 - k) * v : 0;
      const lit = Math.max(k * v, blinkDay * .8);
      L.lens.material.emissiveIntensity = k * v * 1.6 + blinkDay * 1.2;
      bulbCol.copy(OFF).lerp(L.color, Math.min(1, lit * 1.5)).multiplyScalar(1 + lit * 3);
      L.bulb.material.color.copy(bulbCol);
      L.sp.visible = L.core.visible = on && v > .01;
      if (on) {
        L.sp.material.opacity = k * v;
        L.core.material.opacity = k * v * .9;
        L.sp.scale.setScalar(L.glow * (L.mode === 'strobe' ? .8 + v * .4 : 1));
      }
    });
    spills.forEach(m => {
      m.visible = on;
      m.material.opacity = k * .32;
    });
  }

  const pool = (n, make) => {
    const items = Array.from({ length: n }, () => {
      const o = make();
      o.visible = false;
      o.userData = { life: 0, max: 1, vel: new V3(), spin: new V3(), start: new V3(), dir: new V3(), size: 1, on: false };
      scene.add(o);
      return o;
    });
    let cursor = 0;
    items.next = () => items[cursor++ % n];
    return items;
  };
  const tracerGeo = along(new THREE.CylinderGeometry(.009, .009, 1, 5));
  const tracers = pool(96, () => new THREE.Mesh(tracerGeo, fxMat(THREE.MeshBasicMaterial, { color: col(0xFF9A1A), blending: NORMAL })));
  const casingGeo = new THREE.CylinderGeometry(.012, .012, .05, 6);
  const casings = pool(48, () => new THREE.Mesh(casingGeo, M.brass));
  const trail = Array.from({ length: 1000 }, () => ({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 1, hot: false, dark: false, rot: 0, col: null }));
  let trailCursor = 0;

  // Rockets in flight
  const missiles = Array.from({ length: 10 }, () => {
    const g = new THREE.Group();
    g.add(rocketProto.clone());
    const flame = new THREE.Sprite(fxMat(THREE.SpriteMaterial, { map: fxTex.glow, color: col(0xFF7A14), blending: NORMAL }));
    flame.position.x = -.3;
    const jet = new THREE.Sprite(fxMat(THREE.SpriteMaterial, { map: fxTex.glow, color: col(0xFFF1C8), blending: ADD }));
    jet.position.x = -.26;
    jet.scale.setScalar(.14);
    g.add(flame, jet);
    g.visible = false;
    g.traverse(o => { o.frustumCulled = false; });
    scene.add(g);
    return { g, flame, jet, pos: new V3(), vel: new V3(), target: new V3(), life: 0, speed: 0, trailAcc: 0, active: false };
  });

  // Explosions on the "ground" band near the bottom of the screen
  const cHot = col(0xFFE27A), cMid = col(0xFF6410), cDark = col(0x4E1606), cSmoke0 = col(0x2E2622), cSmoke1 = col(0x9A8D82), tmpCol = new THREE.Color();
  function burstPoints(n, color, blending, size) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const pts = new THREE.Points(geo, fxMat(THREE.PointsMaterial, { map: fxTex.glow, color: col(color), blending, size, sizeAttenuation: true }));
    pts.frustumCulled = false;
    return { pts, n, vel: Array.from({ length: n }, () => new V3()), base: size };
  }
  const explosions = Array.from({ length: 10 }, () => {
    const g = new THREE.Group();
    const sprite = (map, color, blending = THREE.NormalBlending) => {
      const s = new THREE.Sprite(fxMat(THREE.SpriteMaterial, { map, color: col(color), blending }));
      g.add(s);
      return s;
    };
    const flat = (map, color, blending) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), fxMat(THREE.MeshBasicMaterial, { map, color: col(color), blending, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2;
      g.add(m);
      return m;
    };
    const e = {
      g, t: 0, size: 1, active: false,
      scorch: flat(fxTex.scorch, 0xFFFFFF, THREE.NormalBlending),
      ring: flat(fxTex.ring, 0xFF9A40, NORMAL),
      smoke: Array.from({ length: 8 }, () => ({ s: sprite(fxTex.smoke, 0x2E2622), off: new V3(), vel: new V3(), delay: 0, grow: 1, rot: 0 })),
      fire: Array.from({ length: 7 }, () => ({ s: sprite(fxTex.fire, 0xFFFFFF, NORMAL), off: new V3(), delay: 0, grow: 1, rot: 0 })),
      flash: sprite(fxTex.glow, 0xFFC45A, NORMAL),
      sparks: burstPoints(22, 0xFF8A1E, NORMAL, .26),
      dirt: burstPoints(14, 0x2A1F18, NORMAL, .2),
    };
    g.add(e.sparks.pts, e.dirt.pts);
    g.visible = false;
    g.traverse(o => { o.frustumCulled = false; });
    scene.add(g);
    return e;
  });
  let explosionCursor = 0;
  const fireSys = makeParticles(160, fxTex.fire, false);
  fireSys.material.depthTest = true;
  const expTmp = new V3();

  // ---------- Ground troops ----------
  // Articulated soldiers (hips, torso, head, two-part arms and legs, rifle). A squad walks in where rockets are
  // about to land, drops into a firing stance and shoots up at the plane, scatters when a rocket homes in,
  // and is thrown by the blast: they tumble, land, burn out and fade away. Anyone who survives withdraws.
  function capsule(r, len, seg = 8) {
    const pts = [];
    for (let i = 0; i <= 4; i++) { const t = -Math.PI / 2 + i / 4 * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(1e-4, Math.cos(t) * r), r + Math.sin(t) * r)); }
    for (let i = 0; i <= 4; i++) { const t = i / 4 * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(1e-4, Math.cos(t) * r), len - r + Math.sin(t) * r)); }
    return new THREE.LatheGeometry(pts, seg);
  }
  function tinted(geo, hex, [x, y, z] = [0, 0, 0], [sx, sy, sz] = [1, 1, 1]) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.scale(sx, sy, sz);
    g.translate(x, y, z);
    const c = col(hex), n = g.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
  }
  const HUE = { camo: 0x58633A, camoD: 0x3F4628, pants: 0x4A5230, vest: 0x7C6C4A, skin: 0xC4926A, boot: 0x1B1917, helm: 0x3C4628, gun: 0x1A1A1B, wood: 0x5A3A22 };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const HIP = .5;
  const BONES = (() => {
    const down = (g, len) => { g.translate(0, -len, 0); return g; };
    return {
      pelvis: mergeGeometries([tinted(box(.1, .09, .17), HUE.pants), tinted(box(.106, .026, .176), HUE.boot, [0, .04, 0])]),
      torso: mergeGeometries([
        tinted(capsule(.07, .33), HUE.camo, [0, 0, 0], [1, 1, 1.4]),
        tinted(box(.15, .16, .22), HUE.vest, [.004, .19, 0]),
        tinted(box(.085, .17, .15), HUE.camoD, [-.1, .2, 0]),
        tinted(box(.02, .03, .2), HUE.boot, [.08, .16, 0]),
      ]),
      head: mergeGeometries([
        tinted(new THREE.CylinderGeometry(.024, .028, .05, 8), HUE.skin, [0, .02, 0]),
        tinted(new THREE.SphereGeometry(.056, 12, 10), HUE.skin, [.006, .085, 0], [1, 1.08, .95]),
        tinted(new THREE.SphereGeometry(.068, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), HUE.helm, [0, .1, 0], [1.05, .95, 1.05]),
        tinted(new THREE.CylinderGeometry(.075, .075, .008, 14), HUE.helm, [0, .1, 0]),
        tinted(box(.012, .014, .1), HUE.boot, [.056, .095, 0]),
      ]),
      thigh: tinted(down(capsule(.048, .27), .27), HUE.pants),
      shin: mergeGeometries([tinted(down(capsule(.04, .25), .25), HUE.pants), tinted(box(.13, .055, .075), HUE.boot, [.028, -.25, 0])]),
      upper: tinted(down(capsule(.033, .16), .16), HUE.camo),
      fore: mergeGeometries([tinted(down(capsule(.029, .14), .14), HUE.camo), tinted(new THREE.SphereGeometry(.03, 8, 6), HUE.skin, [0, -.15, 0])]),
      rifle: mergeGeometries([
        tinted(box(.12, .04, .026), HUE.wood, [-.06, -.01, 0]),
        tinted(box(.22, .05, .032), HUE.gun, [.1, 0, 0]),
        tinted(box(.2, .016, .016), HUE.gun, [.3, .01, 0]),
        tinted(box(.03, .08, .022), HUE.gun, [.1, -.055, 0]),
      ]),
    };
  })();
  // One instanced mesh per body part, shared by every soldier: 8 draw calls however many are on screen.
  // Each soldier keeps an invisible bone hierarchy for the animation; its part transforms are copied in.
  const MAX_TROOPS = 16;
  const troopMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .78, metalness: .06 });
  const PART_COUNT = { pelvis: 1, torso: 1, head: 1, thigh: 2, shin: 2, upper: 2, fore: 2, rifle: 1 };
  const troopParts = {};
  Object.keys(PART_COUNT).forEach(k => {
    const m = new THREE.InstancedMesh(BONES[k], troopMat, MAX_TROOPS * PART_COUNT[k]);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.setColorAt(0, new THREE.Color(1, 1, 1));
    m.count = 0;
    m.frustumCulled = false;
    scene.add(m);
    troopParts[k] = m;
  });
  const troopTint = new THREE.Color(), troopCounts = {}, PART_KEYS = Object.keys(PART_COUNT);
  function drawTroops() {
    for (const k of PART_KEYS) troopCounts[k] = 0;
    for (const tr of troops) {
      if (tr.state === 'free') continue;
      tr.g.updateMatrixWorld(true);
      troopTint.setRGB(1, 1, 1).lerp(charCol, tr.char);
      for (const o of tr.slots) {
        const m = troopParts[o.userData.part], i = troopCounts[o.userData.part]++;
        m.setMatrixAt(i, o.matrixWorld);
        m.setColorAt(i, troopTint);
      }
    }
    for (const k of PART_KEYS) {
      const m = troopParts[k];
      m.count = troopCounts[k];
      if (m.count) {
        m.instanceMatrix.needsUpdate = true;
        m.instanceColor.needsUpdate = true;
      }
    }
  }
  function buildTrooper() {
    const slots = [];
    const mesh = (geo, parent) => {
      const o = new THREE.Object3D();
      o.userData.part = Object.keys(BONES).find(k => BONES[k] === geo);
      parent.add(o);
      slots.push(o);
      return o;
    };
    const g = new THREE.Group();                          // feet at the origin, facing +X
    const hips = new THREE.Group();
    hips.position.y = HIP;
    g.add(hips);
    mesh(BONES.pelvis, hips);
    const thigh = [], shin = [];
    [-1, 1].forEach(sd => {
      const t = new THREE.Group();
      t.position.set(0, -.02, sd * .05);
      hips.add(t);
      mesh(BONES.thigh, t);
      const k = new THREE.Group();
      k.position.y = -.26;
      t.add(k);
      mesh(BONES.shin, k);
      thigh.push(t);
      shin.push(k);
    });
    const torso = new THREE.Group();
    torso.position.y = .02;
    hips.add(torso);
    mesh(BONES.torso, torso);
    const head = new THREE.Group();
    head.position.y = .33;
    torso.add(head);
    mesh(BONES.head, head);
    const aim = new THREE.Group();                        // shoulders + rifle pitch together
    aim.position.set(.01, .28, 0);
    torso.add(aim);
    const arm = [], elbow = [];
    [-1, 1].forEach(sd => {
      const a = new THREE.Group();
      a.position.z = sd * .105;
      aim.add(a);
      mesh(BONES.upper, a);
      const e = new THREE.Group();
      e.position.y = -.15;
      a.add(e);
      mesh(BONES.fore, e);
      arm.push(a);
      elbow.push(e);
    });
    const rifle = new THREE.Group();
    rifle.position.set(.14, -.03, .05);
    aim.add(rifle);
    mesh(BONES.rifle, rifle);
    const flash = new THREE.Sprite(fxMat(THREE.SpriteMaterial, { map: fxTex.flash, color: col(0xFFB347), blending: NORMAL }));
    flash.position.set(.43, .01, 0);
    flash.scale.setScalar(.2);
    flash.visible = false;
    rifle.add(flash);
    const fire = new THREE.Sprite(fxMat(THREE.SpriteMaterial, { map: fxTex.fire, color: col(0xFF8A30), blending: NORMAL, opacity: 0 }));
    fire.visible = false;
    g.add(fire);
    g.visible = false;
    g.traverse(o => { o.frustumCulled = false; });
    scene.add(g);
    return {
      g, hips, torso, head, aim, rifle, thigh, shin, arm, elbow, flash, fire, slots, char: 0,
      state: 'free', t: 0, life: 6, ph: 0, seed: Math.random() * 10, size: 1, ground: 0,
      from: new V3(), dest: new V3(), walkT: 1, runDir: new V3(), kneel: false, recoil: 0,
      vel: new V3(), spinZ: 0, landed: false, burn: 0, shotAt: 0, lie: 1,
    };
  }
  const troops = Array.from({ length: MAX_TROOPS }, buildTrooper);
  const charCol = col(0x16110E);
  const troopTmp = new V3(), troopTmp2 = new V3();

  // Limb poses (angles about each joint's Z axis: + swings forward/up)
  function stride(tr, ph, amp, run) {
    const sn = Math.sin(ph), cs = Math.cos(ph);
    tr.thigh[0].rotation.z = sn * .6 * amp;
    tr.thigh[1].rotation.z = -sn * .6 * amp;
    tr.shin[0].rotation.z = -(.1 + Math.max(0, -cs) * (run ? 1.3 : .9)) * amp;
    tr.shin[1].rotation.z = -(.1 + Math.max(0, cs) * (run ? 1.3 : .9)) * amp;
    tr.hips.position.y = HIP - (run ? .03 : .01) + Math.abs(cs) * .025 * amp;
    tr.torso.rotation.z = -(run ? .32 : .08);
    tr.torso.rotation.x = sn * .05 * amp;
    tr.aim.rotation.z = run ? -.9 : -.55;                 // rifle carried low
    tr.arm[0].rotation.z = .5 - sn * (run ? .7 : .3);
    tr.arm[1].rotation.z = .5 + sn * (run ? .7 : .3);
    tr.elbow[0].rotation.z = tr.elbow[1].rotation.z = run ? 1.3 : .8;
  }
  function stance(tr, pitch, t) {
    if (tr.kneel) {
      tr.thigh[0].rotation.z = 1.45; tr.shin[0].rotation.z = -1.5;
      tr.thigh[1].rotation.z = -.25; tr.shin[1].rotation.z = -1.35;
      tr.hips.position.y = .3;
    } else {
      tr.thigh[0].rotation.z = .22; tr.shin[0].rotation.z = -.14;
      tr.thigh[1].rotation.z = -.18; tr.shin[1].rotation.z = -.06;
      tr.hips.position.y = HIP - .015 + Math.sin(t * 2.1 + tr.seed) * .004;
    }
    tr.recoil = Math.max(0, tr.recoil - .016 * 9);
    tr.torso.rotation.z = -.06 + tr.recoil * .08;
    tr.torso.rotation.x = 0;
    tr.aim.rotation.z = clamp(pitch, -.3, 1.2) + tr.recoil * .12;
    tr.arm[1].rotation.z = 1.45;                          // right arm on the grip
    tr.arm[0].rotation.z = 1.3;                           // left arm under the barrel
    tr.elbow[1].rotation.z = .9;
    tr.elbow[0].rotation.z = .25;
    tr.head.rotation.z = Math.sin(t * .9 + tr.seed) * .05;
  }

  function groundPoint(nx, ny, z, out) {
    out.set(nx, ny, .5).unproject(camera).sub(camera.position);
    return out.multiplyScalar((z - camera.position.z) / out.z).add(camera.position);
  }

  function spawnSquad(at, opt = {}) {
    troopTmp.copy(at).project(camera);
    if (troopTmp.y < -.97 || Math.abs(troopTmp.x) > .97) return;
    const n = opt.n || 2 + (Math.random() < .5 ? 1 : 0);
    const side = Math.random() < .5 ? 1 : -1;
    for (let k = 0; k < n; k++) {
      const tr = troops.find(q => q.state === 'free');
      if (!tr) return;
      const a = Math.random() * Math.PI * 2, r = (.3 + Math.random() * .6) * scale;
      tr.dest.set(at.x + Math.cos(a) * r, at.y, at.z + Math.sin(a) * r);
      // walk in from the side
      tr.walkT = .9 + Math.random() * .6;
      tr.from.copy(tr.dest).add(troopTmp2.set(side * (1.4 + Math.random()) * scale, 0, (Math.random() - .5) * scale));
      tr.g.position.copy(tr.from);
      tr.ground = at.y;
      tr.size = scale * (.6 + Math.random() * .06);
      tr.state = 'in';
      tr.t = 0;
      tr.ph = Math.random() * 6;
      tr.life = opt.life || 6.5;
      tr.kneel = Math.random() < .4;
      tr.shotAt = tr.walkT + .3 + Math.random() * .5;
      tr.g.rotation.set(0, 0, 0);
      tr.hips.rotation.set(0, 0, 0);
      tr.g.scale.setScalar(tr.size);
      tr.char = 0;
      tr.burn = 0;
      tr.fire.visible = false;
      tr.flash.visible = false;
      tr.g.visible = true;
    }
  }

  function killTroops(p, radius) {
    for (const tr of troops) {
      if (tr.state !== 'in' && tr.state !== 'alive' && tr.state !== 'run') continue;
      troopTmp.subVectors(tr.g.position, p).setY(0);
      const d = troopTmp.length();
      if (d > radius) continue;
      if (d < 1e-3) troopTmp.set(Math.random() - .5, 0, Math.random() - .5);
      troopTmp.normalize();
      const power = 1 - d / radius * .6;
      tr.state = 'dead';
      tr.t = 0;
      tr.landed = false;
      tr.burn = 0;
      tr.vel.copy(troopTmp).multiplyScalar((2.2 + Math.random() * 2) * scale * power).setY((3.2 + Math.random() * 2.4) * scale * power);
      tr.g.rotation.set(0, yawOf(troopTmp), 0);
      tr.lie = Math.random() < .5 ? 1 : -1;
      tr.spinZ = -tr.lie * (5 + Math.random() * 5);
      tr.flash.visible = false;
    }
  }

  // A rocket about to land near a soldier makes him run for it
  function threatened(tr) {
    for (const m of missiles) {
      if (!m.active || m.air || m.life < .15) continue;
      const dx = m.target.x - tr.g.position.x, dz = m.target.z - tr.g.position.z;
      if (dx * dx + dz * dz < (2.4 * scale) ** 2) return m;
    }
    return null;
  }

  function updateTroops(dt) {
    for (const tr of troops) {
      if (tr.state === 'free') continue;
      tr.t += dt;
      const g = tr.g;
      if (tr.state === 'in') {
        const k = Math.min(1, tr.t / tr.walkT);
        g.scale.setScalar(tr.size * Math.max(.001, easeOut(Math.min(1, tr.t * 4))));
        g.position.lerpVectors(tr.from, tr.dest, k);
        g.rotation.y = yawOf(troopTmp.subVectors(tr.dest, tr.from));
        tr.ph += dt * 10;
        stride(tr, tr.ph, 1 - smooth(.8, 1, k), false);
        if (k >= 1) tr.state = 'alive';
      } else if (tr.state === 'alive') {
        // face the plane and aim up at it
        troopTmp.subVectors(plane.position, g.position);
        const want = yawOf(troopTmp);
        g.rotation.y += wrapPi(want - g.rotation.y) * damp(6, dt);
        stance(tr, Math.atan2(troopTmp.y, Math.hypot(troopTmp.x, troopTmp.z)), tr.t);
        tr.flash.visible = false;
        if (tr.t > tr.shotAt) {
          tr.flash.visible = true;
          tr.flash.material.rotation = Math.random() * 3;
          tr.recoil = 1;
          tr.shotAt = tr.t + (Math.random() < .7 ? .11 : .5 + Math.random() * .6);
          if (sfx && Math.random() < .22) sfx.gun(panOf(g.position), true);
        }
        const m = threatened(tr);
        if (m && Math.random() < dt * 1.6) {
          tr.state = 'run';
          tr.runDir.subVectors(g.position, m.target).setY(0);
          if (tr.runDir.lengthSq() < 1e-4) tr.runDir.set(1, 0, 0);
          tr.runDir.normalize();
          tr.flash.visible = false;
        }
        if (tr.t > tr.life) { tr.state = 'fade'; tr.t = 0; tr.flash.visible = false; }
      } else if (tr.state === 'run') {
        g.position.addScaledVector(tr.runDir, 1.25 * scale * dt);
        g.rotation.y += wrapPi(yawOf(tr.runDir) - g.rotation.y) * damp(12, dt);
        tr.ph += dt * 15;
        stride(tr, tr.ph, 1, true);
        if (tr.t > Math.min(tr.life, 4)) { tr.state = 'fade'; tr.t = 0; }
      } else if (tr.state === 'dead') {
        if (!tr.landed) {
          tr.vel.y -= 9.8 * scale * dt;
          g.position.addScaledVector(tr.vel, dt);
          g.rotation.z = clamp(g.rotation.z + tr.spinZ * dt, -Math.PI * .55, Math.PI * .55);
          // limbs flail in the air
          const w = tr.t * 17 + tr.seed;
          tr.thigh[0].rotation.z = Math.sin(w) * 1.1; tr.thigh[1].rotation.z = Math.sin(w + 2) * 1.1;
          tr.shin[0].rotation.z = -.6 - Math.sin(w * 1.3) * .5; tr.shin[1].rotation.z = -.6 - Math.cos(w) * .5;
          tr.arm[0].rotation.z = 2.4 + Math.sin(w * 1.1) * 1.2; tr.arm[1].rotation.z = 1.2 + Math.cos(w * .9) * 1.4;
          tr.aim.rotation.z = Math.sin(w * .7) * .8;
          tr.torso.rotation.z = Math.sin(w * .5) * .4;
          if (g.position.y <= tr.ground && tr.vel.y < 0) {
            g.position.y = tr.ground;
            tr.landed = true;
          }
        } else {
          // lie still, limbs splayed, then burn
          const e = damp(9, dt);
          g.rotation.z += (-tr.lie * Math.PI / 2 - g.rotation.z) * e;
          tr.hips.position.y += (.06 - tr.hips.position.y) * e;
          tr.thigh[0].rotation.z += (.35 - tr.thigh[0].rotation.z) * e;
          tr.thigh[1].rotation.z += (-.2 - tr.thigh[1].rotation.z) * e;
          tr.shin[0].rotation.z += (-.3 - tr.shin[0].rotation.z) * e;
          tr.shin[1].rotation.z += (-.1 - tr.shin[1].rotation.z) * e;
          tr.arm[0].rotation.z += (2.6 - tr.arm[0].rotation.z) * e;
          tr.arm[1].rotation.z += (.9 - tr.arm[1].rotation.z) * e;
          tr.torso.rotation.z += (0 - tr.torso.rotation.z) * e;
          tr.aim.rotation.z += (-.3 - tr.aim.rotation.z) * e;
          tr.burn += dt;
          tr.char = Math.min(1, tr.burn / .9);
          tr.fire.visible = true;
          tr.fire.position.set(0, .3, 0);
          const life = clamp(1 - Math.abs(tr.burn - 1) / 1, 0, 1);
          tr.fire.material.opacity = life * (.75 + Math.random() * .25);
          tr.fire.scale.setScalar(.6 + Math.random() * .14);
          tr.fire.material.rotation += dt * 2;
          if (tr.burn > 1.2 && Math.random() < .45) spawnTrail(troopTmp.copy(g.position).setY(tr.ground + .15 * tr.size), false, .5, true);
          if (tr.burn > 2) { tr.state = 'fade'; tr.t = 0; }
        }
      } else if (tr.state === 'fade') {
        // crumbles to ash: sinks into the ground as it shrinks
        const o = Math.max(0, 1 - tr.t / .9);
        g.scale.setScalar(tr.size * Math.max(.001, .35 + .65 * o));
        g.position.y = tr.ground - (1 - o) * .12 * tr.size;
        if (tr.burn > 0) tr.char = Math.max(tr.char, 1 - o * .6);
        tr.fire.material.opacity *= .9;
        if (o <= 0) {
          tr.state = 'free';
          g.visible = false;
          tr.fire.visible = false;
        }
      }
    }
  }

  // ---------- Podium (hero) ----------
  function podiumTexture() {
    const S = 1024, C = S / 2;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const ring = (r0, r1, color) => {
      g.beginPath();
      g.arc(C, C, r1, 0, Math.PI * 2);
      g.arc(C, C, r0, 0, Math.PI * 2, true);
      g.fillStyle = color;
      g.fill();
    };
    const speckle = (r0, r1, n, shades, size) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(r0 * r0 + Math.random() * (r1 * r1 - r0 * r0));
        g.fillStyle = shades[i % shades.length];
        g.fillRect(C + Math.cos(a) * r, C + Math.sin(a) * r, size * (.5 + Math.random()), size * (.5 + Math.random()));
      }
    };
    // Concrete deck with a darker lip
    ring(0, C, '#ECE1CF');
    speckle(0, C, 7000, ['rgba(120,100,80,.10)', 'rgba(255,255,255,.35)', 'rgba(90,70,50,.08)'], 2.2);
    ring(C * .9, C, '#C9B394');
    ring(C * .897, C * .905, '#8C7659');
    ring(C * .985, C, '#7A664C');
    // Asphalt: dark, grainy, with tyre marks
    ring(C * .5, C * .84, '#221E1B');
    speckle(C * .5, C * .84, 16000, ['rgba(255,255,255,.07)', 'rgba(0,0,0,.35)', 'rgba(140,125,110,.12)'], 2.4);
    g.save();
    g.translate(C, C);
    g.lineCap = 'round';
    for (let i = 0; i < 14; i++) {
      const r = C * (.56 + Math.random() * .24), a0 = Math.random() * Math.PI * 2;
      g.strokeStyle = `rgba(0,0,0,${.18 + Math.random() * .2})`;
      g.lineWidth = 6 + Math.random() * 10;
      g.beginPath();
      g.arc(0, 0, r, a0, a0 + .3 + Math.random() * .7);
      g.stroke();
    }
    g.restore();
    // Crisp paint
    ring(C * .5, C * .518, '#FFFFFF');
    ring(C * .822, C * .84, '#FFFFFF');
    g.save();
    g.translate(C, C);
    g.strokeStyle = '#F7C544';
    g.lineWidth = 8;
    g.setLineDash([34, 30]);
    g.beginPath();
    g.arc(0, 0, C * .67, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#FFFFFF';
    for (let q = 0; q < 4; q++) {
      for (let k = -3; k <= 3; k++) {
        g.save();
        g.rotate(q * Math.PI / 2 + Math.PI / 4 + k * .03);
        g.fillRect(C * .54, -5, C * .08, 10);
        g.fillRect(C * .72, -5, C * .08, 10);
        g.restore();
      }
    }
    g.restore();
    // Inner pad: lighter concrete slabs
    ring(0, C * .5, '#E3D7C3');
    g.save();
    g.beginPath();
    g.arc(C, C, C * .5, 0, Math.PI * 2);
    g.clip();
    g.strokeStyle = 'rgba(60,45,30,.16)';
    g.lineWidth = 3;
    for (let x = -3; x <= 3; x++) {
      g.beginPath(); g.moveTo(C + x * C * .16, 0); g.lineTo(C + x * C * .16, S); g.stroke();
      g.beginPath(); g.moveTo(0, C + x * C * .16); g.lineTo(S, C + x * C * .16); g.stroke();
    }
    g.restore();
    speckle(0, C * .5, 3000, ['rgba(90,70,50,.12)', 'rgba(255,255,255,.4)'], 2);
    // Compass ticks + centre mark
    g.save();
    g.translate(C, C);
    g.strokeStyle = 'rgba(30,22,16,.6)';
    g.lineWidth = 4;
    for (let a = 0; a < 72; a++) {
      const ang = a * Math.PI / 36, r0 = a % 6 === 0 ? C * .38 : C * .41;
      g.beginPath();
      g.moveTo(Math.cos(ang) * r0, Math.sin(ang) * r0);
      g.lineTo(Math.cos(ang) * C * .45, Math.sin(ang) * C * .45);
      g.stroke();
    }
    g.restore();
    ring(C * .275, C * .298, '#C8472D');
    // Soft occlusion towards the rim
    const ao = g.createRadialGradient(C, C, C * .82, C, C, C);
    ao.addColorStop(0, 'rgba(40,28,16,0)');
    ao.addColorStop(1, 'rgba(40,28,16,.28)');
    g.fillStyle = ao;
    g.fillRect(0, 0, S, S);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }

  // Burn-away dissolve: noise-driven discard with a glowing ember edge, sweeping from the far side.
  // uBurn 0 = solid, 1 = gone; running it backwards makes a podium assemble out of embers.
  function withBurn(material, uniforms) {
    material.onBeforeCompile = shader => {
      shader.uniforms.uBurn = uniforms.uBurn;
      shader.uniforms.uSweep = uniforms.uSweep;
      shader.vertexShader = 'varying vec3 vBurnPos;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n  vBurnPos = position;',
      );
      shader.fragmentShader = [
        'uniform float uBurn;',
        'uniform vec2 uSweep;',
        'varying vec3 vBurnPos;',
        'float bHash(vec3 p) { p = fract(p * .3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }',
        'float bNoise(vec3 x) {',
        '  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);',
        '  return mix(mix(mix(bHash(i), bHash(i + vec3(1,0,0)), f.x), mix(bHash(i + vec3(0,1,0)), bHash(i + vec3(1,1,0)), f.x), f.y),',
        '             mix(mix(bHash(i + vec3(0,0,1)), bHash(i + vec3(1,0,1)), f.x), mix(bHash(i + vec3(0,1,1)), bHash(i + vec3(1,1,1)), f.x), f.y), f.z);',
        '}',
        shader.fragmentShader,
      ].join('\n')
        .replace('#include <map_fragment>', [
          '#include <map_fragment>',
          '  float bField = (.5 - .5 * dot(vBurnPos.xz, uSweep)) * .6',
          '    + (bNoise(vBurnPos * 7.0) * .65 + bNoise(vBurnPos * 19.0) * .35) * .4;',
          '  float bGap = bField - (uBurn * 1.25 - .12);',
          '  float bOn = step(.001, uBurn);',
          '  if (bOn > .5 && bGap < 0.0) discard;',
          '  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.14, .11, .09), bOn * (1.0 - smoothstep(0.0, .12, bGap)));',
        ].join('\n'))
        .replace('#include <emissivemap_fragment>', [
          '#include <emissivemap_fragment>',
          '  totalEmissiveRadiance += vec3(1.0, .42, .1) * 2.6 * bOn * (1.0 - smoothstep(0.0, .035, bGap));',
        ].join('\n'));
    };
    return material;
  }

  // Two podium rigs are enough: the one being left and the one being landed on.
  const PODIUM_TILT = .12;
  const PODIUM_R = 2.0;              // keep in sync with stageLayout() in main.js

  // A podium parks a long way off the camera's optical axis, so a deck that is perfectly level in world
  // space still projects as a skewed ellipse and reads as *inclined* — the lean is projection, not rotation.
  // Two corrections put every podium (and the plane parked on it) dead level on screen: tip the deck toward
  // the viewer about the camera-relative horizontal axis instead of world X, and roll off the leftover skew
  // about the line of sight. Both follow rig.position, so the slide to centre stage for the game un-corrects
  // itself on the way in, and a banking plane in flight is untouched — this only shapes the resting pose.
  const parkView = new V3(), parkAxis = new V3(), parkUp = new V3(0, 1, 0);
  const parkRollQ = new THREE.Quaternion(), parkTiltQ = new THREE.Quaternion(), parkSpinQ = new THREE.Quaternion();
  const camRight = new V3(1, 0, 0).applyQuaternion(camera.quaternion);
  const camUp = new V3(0, 1, 0).applyQuaternion(camera.quaternion);
  const camFwd = new V3(0, 0, -1).applyQuaternion(camera.quaternion);
  function parkRig(rig, spin) {
    parkView.copy(rig.position).sub(camera.position);
    // Every world vertical converges on the nadir, so world up leans by `skew` in screen space out here.
    const vz = parkView.dot(camFwd), uz = camFwd.dot(parkUp);
    const skew = Math.atan2(camRight.dot(parkUp) * vz - parkView.dot(camRight) * uz,
                            camUp.dot(parkUp) * vz - parkView.dot(camUp) * uz);
    parkAxis.set(-parkView.z, 0, parkView.x).normalize();         // horizontal, square to the line of sight
    parkTiltQ.setFromAxisAngle(parkAxis, PODIUM_TILT);
    parkSpinQ.setFromAxisAngle(parkUp, spin);
    parkRollQ.setFromAxisAngle(parkView.normalize(), -skew);
    rig.quaternion.copy(parkRollQ).multiply(parkTiltQ).multiply(parkSpinQ);
  }
  const podiumMap = podiumTexture();
  const podiumGeo = new THREE.CylinderGeometry(1, 1.035, .08, 96, 1, false);
  const contactTex = radialTexture([[0, 'rgba(12,8,4,.95)'], [.35, 'rgba(12,8,4,.55)'], [1, 'rgba(12,8,4,0)']], 128);
  const underTex = radialTexture([[0, 'rgba(20,14,8,.7)'], [.55, 'rgba(20,14,8,.3)'], [1, 'rgba(20,14,8,0)']], 128);
  const trimGeo = new THREE.TorusGeometry(1.002, .018, 8, 96);
  trimGeo.rotateX(Math.PI / 2);
  // Tyre contact patches (model units): both main wheels and the tail wheel
  const CONTACTS = [
    { at: new V3(.55, -1.13, .5), size: .5, sx: .75, op: .9 },
    { at: new V3(.55, -1.13, -.5), size: .5, sx: .75, op: .9 },
    { at: new V3(-1.42, -.68, 0), size: .28, sx: .8, op: .75 },
  ];
  const RING = Math.PI * 2;
  const RUNWAY_LIGHTS = [];
  for (let i = 0; i < 24; i++) RUNWAY_LIGHTS.push({ a: i / 24 * RING, r: .872, color: 0x74B8FF, kind: 'edge', k: i });
  for (let i = 0; i < 16; i++) RUNWAY_LIGHTS.push({ a: i / 16 * RING + .1, r: .505, color: 0xFFB347, kind: 'ring', k: i });
  for (let i = 0; i < 12; i++) RUNWAY_LIGHTS.push({ a: i / 12 * RING + .13, r: .67, color: 0xFFF6E6, kind: 'rabbit', k: i });
  for (let q = 0; q < 4; q++) {
    for (let j = -1; j <= 1; j++) RUNWAY_LIGHTS.push({ a: q * RING / 4 + RING / 8 + j * .045, r: .762, color: 0x3DFF8A, kind: 'bar', k: q });
  }
  const housingGeo = new THREE.CylinderGeometry(.015, .019, .008, 12);
  housingGeo.translate(0, .004, 0);
  const housingMat = new THREE.MeshStandardMaterial({ color: col(0x2E2B28), roughness: .38, metalness: .7 });
  const lampGeo = new THREE.SphereGeometry(.0105, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  lampGeo.scale(1, .8, 1);
  lampGeo.translate(0, .008, 0);
  const lampMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const poolGeo = new THREE.PlaneGeometry(1, 1);
  poolGeo.rotateX(-Math.PI / 2);
  poolGeo.translate(0, .0012, 0);
  const poolMat = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const podLight = new THREE.PointLight(col(0xFFC9A8), 0, 10, 2);
  scene.add(podLight);
  const lampCol = new THREE.Color(), lampM4 = new THREE.Matrix4(), lampS = new V3();
  function makePodium() {
    const uniforms = { uBurn: { value: 1 }, uSweep: { value: new THREE.Vector2(0, -1) } };
    const top = withBurn(new THREE.MeshStandardMaterial({ map: podiumMap, bumpMap: podiumMap, bumpScale: .1, roughness: .9 }), uniforms);
    const side = withBurn(new THREE.MeshStandardMaterial({ color: col(0x1E1B19), roughness: .55, metalness: .35 }), uniforms);
    const trim = withBurn(new THREE.MeshStandardMaterial({ color: col(0x55504B), roughness: .35, metalness: .8 }), uniforms);
    const mesh = new THREE.Mesh(podiumGeo, [side, top, side]);
    mesh.receiveShadow = true;
    const rim = new THREE.Mesh(trimGeo, trim);
    rim.position.y = .04;
    mesh.add(rim);
    const rig = new THREE.Group();                      // tilt + spin, never scaled
    rig.add(mesh);
    const flat = (map, order) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, opacity: 0 }));
      m.renderOrder = order;
      rig.add(m);
      return m;
    };
    const shade = flat(shadowTex, 1);
    const contacts = CONTACTS.map(() => flat(contactTex, 2));
    // soft shadow of the podium itself, so it doesn't look pasted on
    const under = flat(underTex, 0);
    under.rotation.x = -Math.PI / 2;
    // runway lights: flush fixtures on the deck (always there), lit at night with glows and light pools
    const lights = new THREE.Group();
    const n = RUNWAY_LIGHTS.length;
    const housings = new THREE.InstancedMesh(housingGeo, housingMat, n);
    const lamps = new THREE.InstancedMesh(lampGeo, lampMat, n);
    const pools = new THREE.InstancedMesh(poolGeo, poolMat, n);
    RUNWAY_LIGHTS.forEach((l, i) => {
      const x = Math.cos(l.a) * l.r, z = Math.sin(l.a) * l.r;
      lampM4.makeTranslation(x, 0, z);
      housings.setMatrixAt(i, lampM4);
      lamps.setMatrixAt(i, lampM4);
      const ps = l.kind === 'bar' ? .12 : l.kind === 'rabbit' ? .2 : .17;
      lampM4.makeScale(ps, 1, ps).setPosition(x, 0, z);
      pools.setMatrixAt(i, lampM4);
      lamps.setColorAt(i, lampCol.set(0x444444));
      pools.setColorAt(i, lampCol.set(0x000000));
    });
    [housings, lamps, pools].forEach(m => { m.frustumCulled = false; });
    housings.receiveShadow = true;
    pools.renderOrder = 1;
    const glows = new THREE.Group();
    RUNWAY_LIGHTS.forEach(l => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col(l.color), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, opacity: 0 }));
      sp.position.set(Math.cos(l.a) * l.r, .016, Math.sin(l.a) * l.r);
      sp.scale.setScalar(.06);
      sp.userData = { ...l, base: col(l.color) };
      glows.add(sp);
    });
    lights.add(housings, lamps, pools, glows);
    lights.visible = false;
    rig.add(lights);
    rig.visible = false;
    scene.add(rig);
    return { rig, mesh, shade, contacts, under, lights, housings, lamps, pools, glows, uniforms, index: -1, lastBurn: 1, solid: 0 };
  }
  const podiums = [makePodium(), makePodium()];

  // ---------- Flight routes ----------
  // Each hop has a route for scrolling down and one for scrolling up. Both recede into the distance
  // (the plane shrinks) and come back, so the whole plane stays on screen. It always faces its travel direction.
  let halfW = 1, halfH = 1, scale = 1, mobile = false, routeRY = -.04;
  let restPts = [], downRoutes = [], upRoutes = [];

  function route(points, endSide) {
    const start = points[0], end = points[points.length - 1];
    const pre = start.clone().add(start.clone().sub(points[1]).multiplyScalar(.5));
    const post = end.clone().add(new V3(-endSide * .35 * halfW, 0, 1.2));
    const c = new THREE.CatmullRomCurve3([pre, ...points, post], false, 'centripetal', .5);
    // Sampled by arc length between A and B, so the plane flies at an even speed: the curve's own parameter
    // runs fast on long legs and slow on short ones, which made the hop surge and stall at every waypoint
    c.arcLengthDivisions = 900;
    const L = c.getLengths(), n = L.length - 1, total = L[n];
    const segs = c.points.length - 1;                         // A is the 2nd point, B the second to last
    c.a0 = L[Math.round(n / segs)] / total;
    c.a1 = L[Math.round(n * (segs - 1) / segs)] / total;
    return c;
  }

  function buildRoutes() {
    const n = Flight.sides.length;
    const sx = i => (Flight.sides[i] === 'left' ? 1 : -1);   // plane sits opposite the content
    const L = Flight.layout;
    const RX = mobile || !L ? .3 : Math.abs(L.rx);
    const RY = mobile ? .5 : -.04;
    routeRY = RY;
    const Y = v => (RY + v) * halfH;
    restPts = Flight.sides.map((_, i) => new V3(sx(i) * RX * halfW, Y(0), 0));
    downRoutes = [];
    upRoutes = [];
    for (let i = 0; i < n - 1; i++) {
      const A = restPts[i], B = restPts[i + 1], a = sx(i), b = sx(i + 1);
      // Scrolling down: slip away low into the distance, bank round in a wide, level U-turn, glide back in to land.
      // (A single far waypoint made a hairpin: the plane flipped its heading in a couple of frames.)
      const R = .42 * halfW, zc = -17;
      const uTurn = (from, y) => [0, .25, .5, .75, 1].map(k => {
        const th = k * Math.PI;                                  // from the `from` side, round the far end, to the other
        return new V3(from * Math.cos(th) * R, Y(y), zc - Math.sin(th) * R * 1.25);
      });
      downRoutes.push(route([
        A,
        new V3(a * .08 * halfW, Y(-.12), -6),
        ...uTurn(a, -.26),
        new V3(b * .62 * halfW, Y(-.1), -7),
        B,
      ], b));
      // Scrolling up: the mirror image, climbing gently above centre
      upRoutes.push(route([
        B,
        new V3(b * .08 * halfW, Y(.14), -6),
        ...uTurn(b, .28),
        new V3(a * .62 * halfW, Y(.12), -7),
        A,
      ], a));
    }
  }

  function layout() {
    const W = innerWidth, H = innerHeight;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    const dist = camera.position.length();
    halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist;
    halfW = halfH * camera.aspect;
    mobile = W < 860;
    // Framing has to key off both axes. The vertical fov is fixed, so the visible world *height* never
    // changes with the window — narrow viewports were sizing the plane off width alone and stranding all
    // that headroom. Fit to whichever axis actually runs out, and let the height budget be the ceiling.
    const room = mobile ? Math.min(halfW / 3.2, halfH / 3.2) : Math.min(halfW / 5.4, halfH / 2.4);
    scale = Flight.layout ? Flight.layout.scale : clamp(room, mobile ? .5 : .8, mobile ? 1.35 : 1.75);
    buildRoutes();
  }
  layout();
  addEventListener('resize', layout);

  // ---------- Pointer parallax ----------
  const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
  addEventListener('pointermove', e => {
    mouse.x = e.clientX / innerWidth * 2 - 1;
    mouse.y = e.clientY / innerHeight * 2 - 1;
  }, { passive: true });

  // ---------- Spin the parked podium with a sideways scroll / swipe ----------
  const spins = Flight.sides.map(() => 0);
  const spinTargets = Flight.sides.map(() => 0);
  let parkedAt = 0, podiumRect = null;
  const overPodium = (x, y) => !!podiumRect && x >= podiumRect.l && x <= podiumRect.r && y >= podiumRect.t && y <= podiumRect.b;
  const defense = { on: false, armed: true, t: 0, section: -1, userSpin: 0, firing: false, missile: 0 };
  const addSpin = amount => {
    spinTargets[parkedAt] += amount;
    if (defense.on) defense.userSpin += Math.abs(amount);
  };
  // Mini-game aiming (yaw uses the same convention as yawOf: north = +90°)
  const TAU = Math.PI * 2, NORTH = Math.PI / 2;
  let AIM_RANGE = 1.15;                                // wider in the full-screen dogfight
  // Peaceful mode (js/main.js): no shooting or fighting anywhere
  const peaceful = () => !!(window.Mode && window.Mode.peaceful);
  // The dogfight is full screen, seen over our own tail like a shooter: while a round is on, the home podium glides
  // to the middle of the screen and sinks below its bottom edge, so only the top of the plane shows (tail fin,
  // upper wing, crew) and the rest of the screen is sky. GAME_VIEW is where the fuselage centre line sits
  // (NDC y: -1 is the bottom edge) and GAME_NEAR how far the podium comes towards the camera.
  let GAME_VIEW = -.68, GAME_NEAR = 1.6;
  let gameShift = 0, podShift0 = 0, podDrop0 = 0, podNear0 = 0, gameLift = 0;
  const gameAt = new V3();
  // How far the parked plane must drop for its centre to sit at GAME_VIEW once it has come GAME_NEAR closer
  function gameDrop() {
    const z = restPts[0].z + GAME_NEAR;
    gameAt.set(0, GAME_VIEW, .5).unproject(camera).sub(camera.position);
    gameAt.multiplyScalar((z - camera.position.z) / gameAt.z).add(camera.position);
    return gameAt.y - restPts[0].y;
  }
  const aim = { yaw: NORTH, pointerX: null, byPointer: false, keys: 0 };
  const aiming = () => !!game && game.aiming;
  const nudgeAim = d => {
    aim.yaw = clamp(aim.yaw + d, NORTH - AIM_RANGE, NORTH + AIM_RANGE);
    aim.byPointer = false;
  };
  // Capture phase on window: runs before Lenis, so a sideways gesture over the podium never scrolls the page
  addEventListener('wheel', e => {
    if (aiming()) {
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerWidth : 1;
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      nudgeAim(-d * unit * .0032);
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (!overPodium(e.clientX, e.clientY)) return;
    let dx = e.deltaX;
    if (e.shiftKey && !dx) dx = e.deltaY;              // Shift + mouse wheel
    if (Math.abs(dx) < .5 || Math.abs(dx) < Math.abs(e.deltaY) * (e.shiftKey ? 0 : 1)) return;
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerWidth : 1;
    addSpin(-dx * unit * .0045);
    e.preventDefault();
    e.stopPropagation();
  }, { capture: true, passive: false });
  const touch = { mode: null, x: 0, y: 0 };
  addEventListener('touchstart', e => {
    const t = e.touches[0];
    if (aiming() && e.touches.length === 1 && !e.target.closest('button, a')) {
      touch.mode = 'aim';
      touch.x = t.clientX;
      touch.y = t.clientY;
      return;
    }
    touch.mode = e.touches.length === 1 && overPodium(t.clientX, t.clientY) ? 'pending' : null;
    if (touch.mode) { touch.x = t.clientX; touch.y = t.clientY; }
  }, { capture: true, passive: true });
  addEventListener('touchmove', e => {
    if (!touch.mode) return;
    const t = e.touches[0];
    const dx = t.clientX - touch.x, dy = t.clientY - touch.y;
    if (touch.mode === 'aim') {
      nudgeAim(-dx * .007);
      touch.x = t.clientX;
      touch.y = t.clientY;
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (touch.mode === 'pending') {
      if (Math.hypot(dx, dy) < 8) return;
      touch.mode = Math.abs(dx) > Math.abs(dy) ? 'spin' : null;
      if (!touch.mode) return;
    }
    addSpin(dx * .012);
    touch.x = t.clientX;
    touch.y = t.clientY;
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
  }, { capture: true, passive: false });
  addEventListener('touchend', () => { touch.mode = null; }, { capture: true, passive: true });

  addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' || !aiming()) return;
    aim.pointerX = e.clientX;
    aim.byPointer = true;
  }, { passive: true });
  const AIM_KEYS = { arrowleft: 1, a: 1, arrowright: -1, d: -1 };
  const BLOCKED_KEYS = [' ', 'arrowup', 'arrowdown', 'pageup', 'pagedown', 'home', 'end'];
  addEventListener('keydown', e => {
    if (!game || game.state === 'idle') return;
    const k = e.key.toLowerCase();
    if (k === 'escape') { game.abort(); return; }
    if (!aiming() || e.target.closest('input, textarea')) return;
    if (k in AIM_KEYS) { aim.keys = AIM_KEYS[k]; aim.byPointer = false; }
    else if (!BLOCKED_KEYS.includes(k)) return;
    e.preventDefault();
  });
  addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    if (k in AIM_KEYS && aim.keys === AIM_KEYS[k]) aim.keys = 0;
  });

  // Spin hint: bottom of the screen, just left of the flight HUD (bottom centre on phones)
  const hint = document.querySelector('.podium-hint');
  const hintText = hint && hint.querySelector('.podium-hint__text');
  const spinWord = matchMedia('(hover: none)').matches ? 'Swipe' : 'Scroll';
  let hintFor = -1;
  const setHintText = i => {
    if (!hintText || i === hintFor) return;
    hintFor = i;
    hintText.innerHTML = i === 0
      ? `<b>Start a dogfight</b><small>${spinWord} sideways to spin · face north</small>`
      : `<b>Defend the tower</b><small>${spinWord} sideways to defend</small>`;
  };
  // Clicking the pill turns the podium to face north (which starts the defence, or the dogfight prompt)
  if (hint) hint.addEventListener('click', () => {
    if (!hintShown) return;
    const want = NORTH - poseYawFor(parkedAt);
    spinTargets[parkedAt] = want + Math.round((spins[parkedAt] - want) / TAU) * TAU;
    defense.armed = true;
    if (parkedAt === 0 && game && game.invite) game.invite();
    if (sfx) sfx.ui();
  });
  // The Home page's "Dog fight" agenda item (js/main.js): turn to face north on the home podium, which asks to play
  addEventListener('dogfight:invite', () => {
    if (parkedAt !== 0 || !game || game.state !== 'idle') return;
    const want = NORTH - poseYawFor(0);
    spinTargets[0] = want + Math.round((spins[0] - want) / TAU) * TAU;
    defense.armed = true;
    game.invite();
  });
  function placeHint() {
    const hudEl = document.querySelector('.hud');
    const hudOn = hudEl && getComputedStyle(hudEl).display !== 'none';
    hint.classList.toggle('is-centered', !hudOn);
    if (hudOn) {
      hint.style.right = `${22 + hudEl.offsetWidth + 10}px`;
      hint.style.bottom = `${22 + (hudEl.offsetHeight - hint.offsetHeight) / 2}px`;
    } else {
      hint.style.right = '';
      hint.style.bottom = '';
    }
  }
  if (hint) addEventListener('resize', () => { if (hintShown) placeHint(); });

  // ---------- HUD ----------
  const hud = document.querySelector('.hud');
  const hudEls = {
    alt: document.getElementById('hud-alt'),
    spd: document.getElementById('hud-spd'),
    hdg: document.getElementById('hud-hdg'),
    status: document.getElementById('hud-status'),
  };
  const hudCache = {};
  const setHud = (k, v) => { if (hudCache[k] !== v) { hudCache[k] = v; hudEls[k].textContent = v; } };

  // ---------- Loop ----------
  const clock = new THREE.Clock();
  const tmpA = new V3(), tmpB = new V3(), tmpC = new V3(), tmpE = new V3();
  const pos = new V3(), fwd = new V3(), dirA = new V3(), dirB = new V3(), groundPos = new V3(), proj = new V3();
  const euler = new THREE.Euler(0, 0, 0, 'YZX');
  const rigInv = new THREE.Matrix4(), contactPos = new V3();
  const airQ = new THREE.Quaternion(), groundQ = new THREE.Quaternion(), localQ = new THREE.Quaternion(), targetQ = new THREE.Quaternion();
  const forward = new V3(), back = new V3();
  const rimPts = Array.from({ length: 8 }, (_, k) => new V3(Math.cos(k / 8 * Math.PI * 2), .04, Math.sin(k / 8 * Math.PI * 2)));
  let time = 0, rpm = 12, puffAcc = 0, intro = 0, first = true, restK = 0, recoilS = 0, frameNo = 0;
  let travelDir = 1, routeMix = 0;
  let hudTimer = 0, slowFrames = 0, fastFrames = 0, hintShown = false, shadowWas = true, soundTimer = 0, hitShake = 0;

  const yawOf = v => Math.atan2(-v.z, v.x);
  const sideSign = i => (Flight.sides[i] === 'left' ? 1 : -1);
  // Steady cruise with gentle ramps at both ends...
  const JR = .08;
  const cruiseEase = t => {
    const R = JR, v = 1 / (1 - R);
    if (t < R) return v * t * t / (2 * R);
    if (t > 1 - R) return 1 - v * (1 - t) * (1 - t) / (2 * R);
    return v * (t - R / 2);
  };
  // ...and its inverse: the jump progress at which the plane has flown arc fraction s
  const cruiseInv = s => {
    const R = JR, v = 1 / (1 - R), s0 = v * R / 2;
    if (s < s0) return Math.sqrt(2 * R * s / v);
    if (s > 1 - s0) return 1 - Math.sqrt(2 * R * (1 - s) / v);
    return s / v + R / 2;
  };
  // A long nav jump is one continuous flight with an air battle in the middle: take off, fall back into the
  // distance, get jumped by four fighters, dodge their guns and a missile, turn on them and shoot every one down,
  // then come back in and land on the chosen podium. The route is laid out on screen (NDC x/y at a depth), and
  // keepInFrame() holds the whole airframe inside the viewport on every frame.
  let jump = { id: -1 };
  const jumpM = new THREE.Matrix4(), jumpY = new V3();
  const TAN_HALF = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const onScreen = (u, v, z, out = new V3()) => {
    out.set(u, v, .5).unproject(camera).sub(camera.position);
    return out.multiplyScalar((z - camera.position.z) / out.z).add(camera.position);
  };
  const ourAt = (jp, out) => jump.curve.getPointAt(cruiseEase(clamp(jp, 0, 1)), out);
  function beginJump(J) {
    if (peaceful()) { beginShow(J); return; }
    const A = restPts[J.from].clone(), B = restPts[J.to].clone();
    const a = sideSign(J.from), b = sideSign(J.to);
    const Y = v => (routeRY + v) * halfH;
    const dv = mobile ? .2 : 0;                      // phones: the battle stays above the content strip
    const S = (u, v, z) => onScreen(a * u, v + dv, z);
    const pts = [A, new V3(a * .06 * halfW, Y(-.12), -6)];   // take-off, climbing away
    const mark = {};
    const P = (name, v) => { if (name) mark[name] = pts.length; pts.push(v); };
    P(null, S(.04, .02, -17));                       // falls back into the distance
    P(null, S(-.3, .2, -27));
    P('far', S(-.5, .08, -23));                      // swings round on the far side
    P('pass1', S(-.3, -.14, -16));                   // first gun pass: barrel roll
    P('pass2', S(-.02, .1, -14));                    // a pair comes through
    P('missile', S(.2, -.1, -15));                   // missile launched: flares, then...
    // ...a full inside loop, drifting forward and a little away, while the missile goes for the flares below
    const E = pts[pts.length - 1].clone(), r = 2.5 * Math.max(.9, scale * .75);
    for (let k = 1; k <= 10; k++) {
      const th = k / 10 * Math.PI * 2;
      pts.push(new V3(E.x + a * (Math.sin(th) * r + k / 10 * r * 1.1), E.y + (1 - Math.cos(th)) * r, E.z - k / 10 * 1.5));
      if (k === 5) mark.loopTop = pts.length - 1;
    }
    P('reverse', S(.56, .06, -20));                  // reversal
    P('attack', S(.3, -.12, -21));                   // on the attack
    P('k1', S(-.02, .02, -19));
    P('k2', S(-.3, -.08, -18));
    P(null, S(-.5, .1, -20));                        // turn
    P('k3', S(-.24, .24, -23));
    P('k4', S(.06, .08, -21));                       // last kill, victory roll
    P(null, new V3(b * .62 * halfW, Y(-.1), -8));    // approach
    pts.push(B);
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', .5);
    curve.arcLengthDivisions = 1400;
    const lengths = curve.getLengths();
    const total = lengths[lengths.length - 1];
    const arcAt = i => lengths[Math.round(i / (pts.length - 1) * 1400)] / total;
    const jpAt = name => cruiseInv(arcAt(mark[name]));
    jump = {
      id: J.id, curve, length: total, durS: J.dur / 1000,
      departYaw: yawOf(new V3().subVectors(pts[1], pts[0])),
      arriveYaw: yawOf(new V3().subVectors(B, pts[pts.length - 2])),
      rolls: [
        { a: arcAt(mark.pass1) - .02, b: arcAt(mark.pass1) + .02, dir: a },
        { a: arcAt(mark.k4) + .006, b: arcAt(mark.k4) + .036, dir: a },
      ],
      phase: [jpAt('far'), jpAt('reverse'), jpAt('k4') + .01],
      up: new V3(0, 1, 0), R0: 6.5 * Math.max(.9, scale * .75), raid: null, decoy: null,
    };
    jump.raid = planRaid(jpAt, a);
  }

  // ---------- Air show: the peaceful long jump ----------
  // A four-plane display team crosses the sky, barrel-rolling as it comes; our plane climbs out and slides into
  // the head of the formation. Together they fly a loop and a formation roll trailing coloured smoke, then the
  // team splits in a bomb burst and our plane comes in to land. Nobody fires a shot.
  const SHOW_SLOTS = [[-2.7, -.2, -3.3], [-2.7, -.2, 3.3], [-5.4, -.45, -6.6], [-5.4, -.45, 6.6]].map(v => new V3(...v));
  const SHOW_BURST = [[.1, .85, -1], [.1, .85, 1], [-.2, -.35, -1], [-.2, -.35, 1]].map(v => new V3(...v).normalize());
  const SHOW_SMOKE = [col(0xFF6D34), col(0xFF839B), col(0xFBBD76), col(0xFFF6EA)];
  const OUR_SMOKE = col(0xF74A20);
  const showQ = new THREE.Quaternion(), showM = new THREE.Matrix4(), showRoll = new THREE.Quaternion();
  const showA = new V3(), showB = new V3(), showC = new V3(), showUp = new V3(0, 1, 0), tailLocal = new V3(-1.9, .1, 0);
  function beginShow(J) {
    const A = restPts[J.from].clone(), B = restPts[J.to].clone();
    const a = sideSign(J.from), b = sideSign(J.to);
    const Y = v => (routeRY + v) * halfH;
    const dv = mobile ? .2 : 0;
    const S = (u, v, z) => onScreen(a * u, v + dv, z);
    const pts = [A, new V3(a * .06 * halfW, Y(-.12), -6)];
    const mark = {};
    const P = (name, v) => { if (name) mark[name] = pts.length; pts.push(v); };
    P(null, S(.1, .02, -14));                        // climbing out
    P('join', S(-.02, .0, -21));                     // the team slides in around us
    P(null, S(-.3, -.1, -21));                       // formation run across the sky, low, level with the loop
    const E = pts[pts.length - 1].clone(), r = 2.3 * Math.max(.9, scale * .75);
    for (let k = 1; k <= 10; k++) {                  // a formation loop, drifting on
      const th = k / 10 * Math.PI * 2;
      pts.push(new V3(E.x - a * (Math.sin(th) * r + k / 10 * r * 1.2), E.y + (1 - Math.cos(th)) * r, E.z - k / 10 * 1.2));
    }
    P('roll', S(-.5, .1, -22.5));                    // formation barrel roll, straight out of the loop
    P(null, S(-.6, .08, -25));                       // a wide turn back through the distance
    P(null, S(-.42, .03, -30));
    P(null, S(-.12, .06, -27));
    P('break', S(.14, .1, -21));                     // bomb burst
    P(null, new V3(b * .62 * halfW, Y(-.1), -8));    // approach
    pts.push(B);
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', .5);
    curve.arcLengthDivisions = 1400;
    const lengths = curve.getLengths();
    const total = lengths[lengths.length - 1];
    const arcAt = i => lengths[Math.round(i / (pts.length - 1) * 1400)] / total;
    const jpAt = name => cruiseInv(arcAt(mark[name]));
    jump = {
      id: J.id, curve, length: total, durS: J.dur / 1000, show: true,
      departYaw: yawOf(new V3().subVectors(pts[1], pts[0])),
      arriveYaw: yawOf(new V3().subVectors(B, pts[pts.length - 2])),
      rolls: [{ a: arcAt(mark.roll) - .05, b: arcAt(mark.roll) + .05, dir: -a }],     // a slow formation roll
      phase: [jpAt('join'), jpAt('roll'), jpAt('break')],
      up: new V3(0, 1, 0), R0: 6.5 * Math.max(.9, scale * .75), raid: null, decoy: null,
      team: [], smokeAcc: 0, ourSmoke: [jpAt('join') - .01, jpAt('break') + .04],
    };
    jump.raid = planShow(jpAt('join'), jpAt('break'));
  }
  function planShow(jJoin, jBreak) {
    const df = dogfight && dogfight.raid;
    if (!df) return null;
    const D = jump.durS;
    const events = [];
    const at = (t, fn) => events.push({ t, fn, done: false });
    // Where the team flies before joining: a straight line through the join point along our heading there,
    // at our cruise speed, so the hand-over is seamless
    const J0 = ourAt(jJoin, new V3());
    const dir = jump.curve.getTangentAt(cruiseEase(jJoin), new V3()).normalize();
    const vJ = jump.length / (1 - JR);
    // each plane barrel-rolls about its own axis as the team crosses (rolling the whole formation about the
    // empty lead slot swung the outer planes round far too fast)
    const rollFrom = jJoin - 2.3 / D, rollTo = jJoin - 1.25 / D, rollDir = Math.random() < .5 ? 1 : -1;
    showC.crossVectors(dir, showUp).normalize();
    showB.crossVectors(showC, dir);
    showM.makeBasis(dir, showB, showC);
    const qTeam = new THREE.Quaternion().setFromRotationMatrix(showM);
    const qPre = new THREE.Quaternion();
    SHOW_SLOTS.forEach((slot, i) => {
      const out = { w: true, x: 0, y: 0, z: 0, q: new THREE.Quaternion() };
      let foe = null;
      const path = T => {
        const jp = Flight.jump.p;
        if (foe && foe.burst) {                          // bomb burst: peel away and climb or dive off the screen
          const t = T - foe.burst.T;
          showA.copy(foe.burst.P).addScaledVector(foe.burst.V, t).addScaledVector(foe.burst.dir, 3.2 * scale * t * t);
          out.x = showA.x; out.y = showA.y; out.z = showA.z;
          out.q = null;
          return out;
        }
        const w = smooth(jJoin - 1.1 / D, jJoin, jp);
        showA.copy(J0).addScaledVector(dir, (jp - jJoin) * vJ).add(showB.copy(slot).multiplyScalar(scale).applyQuaternion(qTeam));
        showRoll.setFromAxisAngle(X_AXIS, Math.PI * 2 * smooth(rollFrom, rollTo, jp) * rollDir);
        qPre.copy(qTeam).multiply(showRoll);
        if (w > 0) {
          showC.copy(slot).multiplyScalar(scale).applyQuaternion(plane.quaternion).add(plane.position);
          showA.lerp(showC, w);
          qPre.slerp(plane.quaternion, w);
        }
        out.x = showA.x; out.y = showA.y; out.z = showA.z;
        out.q = out.q || new THREE.Quaternion();
        out.q.copy(qPre);
        return out;
      };
      at(jJoin - 3 / D, () => {
        foe = df.launch(path, 9 + (i % 2), .62);
        if (!foe) return;
        foe.show = true;
        foe.stay = true;
        foe.smokeCol = SHOW_SMOKE[i];
        jump.team.push(foe);
      });
      at(jBreak, () => {
        if (!foe || !foe.active) return;
        foe.burst = { T: foe.clock, P: foe.pos.clone(), V: foe.vel.clone().multiplyScalar(.8), dir: SHOW_BURST[i].clone().applyQuaternion(plane.quaternion) };
        foe.stay = false;
        foe.age = 0;
        foe.smokeUntil = foe.clock + 2.4;
      });
    });
    return events;
  }
  // Coloured smoke: the team from the moment it appears until well into the bomb burst, our plane while in formation
  function updateShowSmoke(dt) {
    jump.smokeAcc += dt;
    if (jump.smokeAcc < .035) return;
    jump.smokeAcc = 0;
    for (const a of jump.team) {
      if (!a.active || !a.alive || (a.smokeUntil && a.clock > a.smokeUntil) || a.clock < .9) continue;
      spawnTrail(a.g.localToWorld(showA.copy(tailLocal)), false, .6, false, a.smokeCol);
    }
    const jp = Flight.jump.p;
    if (jp > jump.ourSmoke[0] && jp < jump.ourSmoke[1]) spawnTrail(plane.localToWorld(showA.set(-2.1, .15, 0)), false, .75, false, OUR_SMOKE);
  }

  function jumpPose(jp, dt) {
    const sArc = cruiseEase(jp);
    const C = jump.curve;
    C.getPointAt(sArc, pos);
    C.getTangentAt(sArc, fwd).normalize();
    const ds = .003;
    C.getPointAt(Math.max(0, sArc - ds), dirA);
    C.getPointAt(Math.min(1, sArc + ds), dirB);
    // curvature: the lift vector leans into the turn, so banks, breaks and the loop come out naturally
    tmpA.copy(dirA).add(dirB).addScaledVector(pos, -2).divideScalar(ds * ds * jump.length * jump.length);
    tmpA.addScaledVector(fwd, -tmpA.dot(fwd));
    tmpB.set(0, 1, 0).addScaledVector(tmpA, jump.R0);
    tmpB.addScaledVector(fwd, -tmpB.dot(fwd));
    if (tmpB.lengthSq() < 1e-6) tmpB.copy(jump.up);
    tmpB.normalize();
    jump.up.lerp(tmpB, damp(5, dt));
    jump.up.addScaledVector(fwd, -jump.up.dot(fwd)).normalize();
    tmpC.crossVectors(fwd, jump.up).normalize();
    jumpY.crossVectors(tmpC, fwd);
    jumpM.makeBasis(fwd, jumpY, tmpC);
    airQ.setFromRotationMatrix(jumpM);
    let roll = 0;
    for (const r of jump.rolls) roll += Math.PI * 2 * smooth(r.a, r.b, sArc) * r.dir;
    localQ.setFromAxisAngle(X_AXIS, roll);
    airQ.multiply(localQ);
    targetQ.copy(airQ);
  }

  // The battle, as events keyed to jump progress. Each fighter is flown twice: once on its gun pass
  // (out of the distance, well clear of our wings, banking away), then again sweeping in ahead of us
  // to be shot down. Nothing ever flies through anything else: keepApart() holds every fighter clear of us.
  function planRaid(jpAt, a) {
    const df = dogfight && dogfight.raid;
    if (!df) return null;
    const D = jump.durS, s = scale;
    const events = [];
    const at = (t, fn) => events.push({ t, fn, done: false });
    const burst = (t0, t1, every, fn) => events.push({ t: t0, to: t1, every: every / D, next: t0, fn });
    const liv = [1, 3, 4, 8].sort(() => Math.random() - .5);
    const progress = (foe, T) => Flight.jump.p + (T - foe.clock) / D;
    // closest a planned path comes to our own route over [j0, j1]; SAFE is the gap we insist on
    const SAFE = (2.4 + .7 * 2.2) * s * 1.3, cq = new V3(), co = new V3();
    const clearance = (posAt, j0, j1) => {
      let m = Infinity;
      for (let j = Math.max(0, j0); j <= Math.min(1, j1); j += .003) m = Math.min(m, posAt(j, cq).distanceTo(ourAt(j, co)));
      return m;
    };

    // Gun pass: out of the distance to a point well beside us, then a climbing, banking break (one rolls away)
    function pass(jpP, side, lift, livery, o = {}) {
      const vE = 11 * s, out = { w: true, x: 0, y: 0, z: 0, roll: 0 };
      const T0 = new V3(), F = new V3(), dir = new V3();
      let k = 1, climb = lift >= 0 ? 1 : -1;
      const aim = () => {
        T0.copy(ourAt(jpP, T0)).add(fxB.set(side * 4.2 * s * k, lift * s * k, 2.4 * s));
        F.copy(T0).add(fxB.set(-side * 8 * s, 1.5 * s, -34));
        dir.subVectors(T0, F).normalize();
      };
      const posAt = (jp, v) => {
        const t = (jp - jpP) * D;
        v.copy(T0).addScaledVector(dir, vE * t);
        if (t > 0) { v.x += side * 4.5 * s * k * t * t; v.y += 2.6 * s * climb * t * t; }
        return v;
      };
      // widen the pass (and let the break dive instead of climb) until it never comes near our route
      aim();
      for (let tries = 0; tries < 6 && clearance(posAt, jpP - 2.3 / D, jpP + 2.5 / D) < SAFE; tries++) {
        k *= 1.25;
        if (tries === 2) climb = -climb;
        aim();
      }
      let foe = null;
      const path = T => {
        const t = (progress(foe, T) - jpP) * D;
        posAt(progress(foe, T), fxD);
        out.x = fxD.x; out.y = fxD.y; out.z = fxD.z;
        out.roll = o.roll && t > 0 ? Math.PI * 2 * smooth(.15, .95, t) * side : 0;
        return out;
      };
      at(jpP - 2.3 / D, () => { foe = df.launch(path, livery, .7); });
      // their tracers go where we are now; we are already rolling or jinking out of the way
      burst(jpP - 1 / D, jpP - .22 / D, .085, () => {
        if (!foe || !foe.alive) return;
        fxA.copy(plane.position).add(fxB.set((Math.random() - .5) * 2 * s, (Math.random() < .5 ? -1 : 1) * (1.6 + Math.random()) * s, 0));
        df.shoot(foe, fxA, true);
      });
      if (o.missile) {
        // the missile homes on a point just below and behind us (a near-miss at worst)...
        const decoy = { pos: new V3(), alive: true };
        let m = null;
        at(jpP - .75 / D, () => {
          jump.decoy = decoy;
          if (foe) m = df.missile(foe, decoy.pos, p => { explode(p, { air: true, size: .6 }); hitShake = Math.max(hitShake, .5); }, decoy);
        });
        // ...until we pop flares: it swings onto one and bursts on it, well below the loop
        at(jpP - .4 / D, () => {
          const f = releaseFlares();
          if (m && m.active && f) m.track = f;
        });
      }
    }
    // Kill: sweeps in from the side and settles a fixed distance ahead along our heading (in the gunsight, a
    // little above and to one side), takes hits (sparks, then smoke) and goes down in flames, thrown clear of
    // our line before it blows up
    function kill(jpK, side, livery, rocket) {
      const ahead = 6.5 * s, out = { w: true, x: 0, y: 0, z: 0 };
      // the stretch of our route the fighter is ahead of us (in jump progress, at cruise speed)
      const leadJp = ahead / jump.length * (1 - JR);
      let wide = 1;
      // a tail chase: the fighter flies our own route a little ahead of us, so it stays in the sight and banks
      // through the same turns. (Pinning it along our current heading made it flick from one side of the screen
      // to the other whenever the route turned.)
      const posAt = (jp, v) => {
        ourAt(jp + leadJp, v);
        const k = 1 - smooth(jpK - 1.7 / D, jpK - .55 / D, jp);
        const hh = (camera.position.z - v.z) * TAN_HALF, hw = hh * camera.aspect;
        v.x += side * (.35 * s * wide + 1.45 * hw * k);
        v.y += .7 * s * wide + .25 * hh * k;
        v.z += 2 * k;
        return v;
      };
      const end = jpK + (rocket ? .3 : 0) / D;
      for (let tries = 0; tries < 6 && clearance(posAt, jpK - 2.1 / D, end) < SAFE; tries++) wide *= 1.2;
      let foe = null, done = false, hits = 0;
      const path = T => {
        posAt(progress(foe, T), fxD);
        out.x = fxD.x; out.y = fxD.y; out.z = fxD.z;
        return out;
      };
      const down = () => {
        if (done || !foe) return;
        done = true;
        // set on fire and thrown clear of our line; it blows up once it has fallen away
        df.kill(foe, 'burn');
        foe.vel.add(fxB.set(side * 4.5 * s, -2.2 * s, 1.5 * s));
      };
      at(jpK - 2.1 / D, () => { foe = df.launch(path, livery, .66); });
      burst(jpK - (rocket ? 1.05 : .7) / D, jpK - (rocket ? .55 : .03) / D, .05, () => {
        if (!foe || !foe.alive) return;
        jump.track = foe;
        jump.trackT = time;
        // hold fire until the target is in the gunsight
        if (fxA.subVectors(foe.pos, plane.position).normalize().dot(forward) < Math.cos(.3)) return;
        const lead2 = foe.pos.distanceTo(plane.position) / (50 * scale);
        fireGun(model.guns[gunCursor++ % model.guns.length], fxC.copy(foe.pos).addScaledVector(foe.vel, lead2));
        // rounds striking home: sparks on the airframe, then it starts to smoke
        if (Math.random() < .3) {
          hits++;
          explode(fxD.copy(foe.pos).add(fxB.set(Math.random() - .5, Math.random() - .5, Math.random() - .5).multiplyScalar(foe.world)), { air: true, size: .09, quiet: true });
          if (sfx) sfx.ping(panOf(foe.pos));
          if (hits >= 2) foe.smoke = 1;
        }
      });
      if (rocket) at(jpK - .42 / D, () => { if (!foe || !foe.alive || !airRocket(foe, down)) down(); });
      at(rocket ? jpK + .3 / D : jpK, down);
    }
    pass(jpAt('pass1'), a, 1.4, liv[0]);
    pass(jpAt('pass2'), -a, 1.6, liv[1], { roll: true });
    pass(jpAt('pass2') + .25 / D, a, -2, liv[2]);
    pass(jpAt('missile') + .35 / D, -a, -1.6, liv[3], { missile: true });
    kill(jpAt('k1'), -a, liv[0], false);
    kill(jpAt('k2'), a, liv[1], true);
    kill(jpAt('k3'), -a, liv[2], false);
    kill(jpAt('k4'), a, liv[3], true);
    return events;
  }
  function updateRaid(jp) {
    if (!jump.raid) return;
    if (jump.decoy) {
      // the missile's aim point trails just below and behind us
      jump.decoy.pos.copy(plane.position).addScaledVector(forward, -2.2 * scale).y -= 3.4 * scale;
    }
    for (const e of jump.raid) {
      if (e.to !== undefined) {
        while (jp >= e.next && e.next <= e.to) { e.fn(); e.next += e.every * (.8 + Math.random() * .4); }
      } else if (!e.done && jp >= e.t) {
        e.done = true;
        e.fn();
      }
    }
  }

  // ---------- Flares ----------
  // Bright magnesium flares kicked out below and behind, falling on smoky trails: a decoy for a missile
  const flares = Array.from({ length: 8 }, () => {
    const sp = new THREE.Sprite(fxMat(THREE.SpriteMaterial, { map: fxTex.glow, color: col(0xFFE2B0), blending: ADD, opacity: 0 }));
    sp.visible = false;
    sp.frustumCulled = false;
    scene.add(sp);
    return { sp, pos: new V3(), vel: new V3(), life: 0, alive: false, trail: 0 };
  });
  function releaseFlares() {
    const aft = fxC.set(-1, 0, 0).applyQuaternion(plane.quaternion);
    let first = null;
    flares.forEach((f, k) => {
      const side = k % 2 ? 1 : -1;
      f.pos.copy(plane.position).y -= .4 * scale;
      f.vel.copy(aft).multiplyScalar((2 + Math.random() * 2) * scale)
        .add(fxB.set((Math.random() - .5) * 2, -1.5 - Math.random(), side * (1.5 + k * .4)).multiplyScalar(scale));
      f.life = -k * .06;
      f.alive = true;
      f.trail = 0;
      if (k === 2) first = f;
    });
    if (sfx) sfx.rocket(panOf(plane.position), .35);
    return first;
  }
  function updateFlares(dt) {
    for (const f of flares) {
      if (!f.alive) continue;
      f.life += dt;
      if (f.life < 0) continue;
      if (f.life > 2.2) { f.alive = false; f.sp.visible = false; continue; }
      f.vel.y -= 3 * scale * dt;
      f.vel.multiplyScalar(1 - .6 * dt);
      f.pos.addScaledVector(f.vel, dt);
      f.sp.position.copy(f.pos);
      f.sp.visible = true;
      const k = 1 - smooth(1.5, 2.2, f.life);
      f.sp.material.opacity = k * (.75 + Math.random() * .25);
      f.sp.scale.setScalar(scale * (.55 + Math.random() * .2) * k);
      f.trail += dt;
      while (f.trail > .035) { f.trail -= .035; spawnTrail(f.pos, true, .45); }
    }
  }
  // Never let a fighter overlap our plane: anything inside the safety bubble is pushed out to its edge
  const apart = new V3();
  function keepApart() {
    if (!dogfight) return;
    const R = 2.4 * scale;
    for (const a of dogfight.actors) {
      if (!a.active || !a.foe || a.show) continue;
      const min = R + a.world * 2.2;
      apart.subVectors(a.pos, plane.position);
      const d = apart.length();
      if (d >= min) continue;
      if (d < 1e-3) apart.set(0, 1, 0);
      else apart.divideScalar(d);
      a.pos.addScaledVector(apart, min - d);
      a.g.position.copy(a.pos);
      a.g.updateMatrixWorld();
    }
  }

  // ---------- Battle damage (defence and the mini-game) ----------
  // Enemy rounds that get through strike a real spot on the plane or the podium (a ray finds the surface):
  // a torn bullet hole that glows orange-hot and cools to scorched metal, sparks and a clang. Enough hits and
  // the engine starts to smoke, then to burn; a battered podium smokes too. When the fight is over and the plane
  // swings back to its resting heading (facing left or right), the holes close up and the smoke dies away.
  const holeTex = canvasTex(64, 64, (g, S) => {
    const c = S / 2;
    const gr = g.createRadialGradient(c, c, 0, c, c, c);
    gr.addColorStop(0, 'rgba(18,10,6,.95)');
    gr.addColorStop(.32, 'rgba(34,20,12,.6)');
    gr.addColorStop(1, 'rgba(34,20,12,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    g.translate(c, c);
    for (let k = 0; k < 7; k++) {                     // torn, bent-back metal petals
      g.rotate(Math.PI * 2 / 7 + (Math.random() - .5) * .5);
      g.fillStyle = 'rgba(205,195,182,.9)';
      g.beginPath();
      g.moveTo(-2.6, 0);
      g.lineTo(0, -c * (.36 + Math.random() * .14));
      g.lineTo(2.6, 0);
      g.closePath();
      g.fill();
    }
    g.fillStyle = '#040201';
    g.beginPath();
    g.arc(0, 0, c * .2, 0, Math.PI * 2);
    g.fill();
  });
  const holeGeo = new THREE.PlaneGeometry(1, 1);
  const holes = Array.from({ length: 30 }, () => {
    const m = new THREE.Mesh(holeGeo, new THREE.MeshBasicMaterial({
      map: holeTex, transparent: true, depthWrite: false, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    }));
    m.visible = false;
    m.renderOrder = 2;
    m.userData = { on: false, t: 0, fade: 0, size: 1 };
    return m;
  });
  const HOT = new THREE.Color(3.2, 1.35, .45), COOL = new THREE.Color(1, 1, 1);
  const dmg = { plane: 0, podium: 0, cursor: 0, last: 0, smoke: 0, podSmoke: 0 };
  const hitRay = new THREE.Raycaster();
  const hitN = new V3(), hitL = new V3(), hitQ = new THREE.Quaternion(), hitS = new V3(), Z_AXIS = new V3(0, 0, 1);
  let planeMeshes = null;
  // Places enemy rounds can strike on the plane (model space): fuselage, wings, tail, cowling
  const HIT_SPOTS = [[.2, .2, .3], [.2, .2, -.3], [-.5, .25, .28], [-.5, .25, -.28], [-1.1, .2, .18], [-1.1, .2, -.18],
    [.35, .7, 1.2], [.35, .7, -1.2], [.35, .7, .6], [.35, .7, -.6], [.4, -.25, 1], [.4, -.25, -1], [.9, .1, .3], [.9, .1, -.3],
    [-1.4, .1, .5], [-1.4, .1, -.5]];
  function hitPoint(out) {
    const p = podiums.find(q => q.index === parkedAt && q.rig.visible);
    if (!p || Math.random() < .6) {
      const s = HIT_SPOTS[(Math.random() * HIT_SPOTS.length) | 0];
      return model.root.localToWorld(out.set(s[0] + (Math.random() - .5) * .2, s[1], s[2] + (Math.random() - .5) * .2));
    }
    const r = Math.sqrt(Math.random()) * .85, th = Math.random() * Math.PI * 2;
    return p.mesh.localToWorld(out.set(Math.cos(th) * r, .04, Math.sin(th) * r));
  }
  function takeHit(at, dir) {
    if (time - dmg.last < .12) return;                // a few holes a second is plenty
    if (!planeMeshes) {
      planeMeshes = [];
      model.root.traverse(o => { if (o.isMesh && !o.isInstancedMesh && o.material !== crewMat && !o.material.transparent && o.geometry.attributes.position.count > 60) planeMeshes.push(o); });
    }
    const p = podiums.find(q => q.index === parkedAt && q.rig.visible);
    hitRay.set(fxA.copy(at).addScaledVector(dir, -3 * scale), dir);
    hitRay.far = 6 * scale;
    const targets = p ? planeMeshes.concat(p.mesh) : planeMeshes;
    let h = hitRay.intersectObjects(targets, false).find(x => x.face);
    if (!h) {
      // grazed past the spot: the round carries on into the airframe instead
      fxB.subVectors(plane.position, fxA).normalize();
      hitRay.set(fxA, fxB);
      hitRay.far = 8 * scale;
      h = hitRay.intersectObjects(targets, false).find(x => x.face);
      if (h) dir = fxB;
    }
    if (!h) return;
    dmg.last = time;
    const onPod = !!p && h.object === p.mesh;
    const parent = onPod ? p.rig : model.root;
    hitN.copy(h.face.normal).transformDirection(h.object.matrixWorld);
    if (hitN.dot(dir) > 0) hitN.negate();
    const m = holes[dmg.cursor++ % holes.length];
    parent.add(m);
    parent.updateMatrixWorld();
    m.position.copy(parent.worldToLocal(hitL.copy(h.point).addScaledVector(hitN, .006 * scale)));
    parent.getWorldQuaternion(hitQ).invert();
    m.quaternion.setFromUnitVectors(Z_AXIS, hitN.applyQuaternion(hitQ));
    m.rotateZ(Math.random() * Math.PI * 2);
    parent.getWorldScale(hitS);
    const size = (onPod ? .5 : .32) * scale * (.8 + Math.random() * .4) / hitS.x;
    m.scale.setScalar(size);
    m.userData.size = size;
    m.userData.on = true;
    m.userData.t = 0;
    m.userData.fade = 0;
    m.material.opacity = 1;
    m.material.color.copy(HOT);
    m.visible = true;
    if (onPod) dmg.podium = Math.min(1, dmg.podium + .06);
    else dmg.plane = Math.min(1, dmg.plane + .07);
    if (sfx && onPod) sfx.impact(panOf(h.point));
  }
  const cowl = new V3(), dmgCol = new THREE.Color();
  function updateDamage(dt, heal) {
    const k = heal ? 1 : 0;
    dmg.plane = Math.max(0, dmg.plane - dt * .45 * k);
    dmg.podium = Math.max(0, dmg.podium - dt * .45 * k);
    for (const m of holes) {
      const u = m.userData;
      if (!u.on) continue;
      u.t += dt;
      if (heal) u.fade += dt * (.5 + Math.random() * .3);
      const cool = Math.min(1, u.t / 1.6);
      m.material.color.copy(HOT).lerp(COOL, cool * cool);
      const f = Math.min(1, u.fade);
      m.material.opacity = 1 - f;
      m.scale.setScalar(u.size * (1 - f * .6));
      if (f >= 1) { u.on = false; m.visible = false; if (m.parent) m.parent.remove(m); }
    }
    // a hurt engine smokes, then burns
    if (dmg.plane > .2) {
      model.root.localToWorld(cowl.set(1.05, .2 + Math.random() * .1, (Math.random() - .5) * .3));
      dmg.smoke += dt * (4 + dmg.plane * 14);
      while (dmg.smoke > 1) { dmg.smoke -= 1; spawnTrail(cowl, dmg.plane > .55, .6 + dmg.plane * .8, true); }
      if (dmg.plane > .6) {
        const fl = .6 + Math.random() * .4;
        fireSys.push(cowl, scale * (.18 + dmg.plane * .22) * fl, Math.random() * 6, dmgCol.setRGB(1, .55 + Math.random() * .2, .2), .8 * fl);
      }
    }
    // a battered podium smokes from its holes
    if (dmg.podium > .25) {
      const burning = holes.filter(m => m.userData.on && m.parent && m.parent !== model.root);
      dmg.podSmoke += dt * dmg.podium * 8;
      while (dmg.podSmoke > 1 && burning.length) {
        dmg.podSmoke -= 1;
        burning[(Math.random() * burning.length) | 0].getWorldPosition(cowl);
        spawnTrail(cowl, false, .5 + dmg.podium * .5, true);
      }
    }
  }

  // Keeps the whole airframe inside the viewport: projects its extremities and slides it back in if any poke out
  const HULL = [[1.7, 0, 0], [-2, .55, 0], [-1.7, .95, 0], [.32, .75, 2.02], [.32, .75, -2.02],
    [.55, -1.1, .55], [.55, -1.1, -.55], [-1.35, .1, .8], [-1.35, .1, -.8]].map(p => new V3(...p));
  const hullP = new V3();
  function keepInFrame(p, q, s, w) {
    if (w <= 0) return;
    let lx = Infinity, hx = -Infinity, ly = Infinity, hy = -Infinity;
    for (const h of HULL) {
      hullP.copy(h).multiplyScalar(s).applyQuaternion(q).add(p).project(camera);
      if (hullP.x < lx) lx = hullP.x;
      if (hullP.x > hx) hx = hullP.x;
      if (hullP.y < ly) ly = hullP.y;
      if (hullP.y > hy) hy = hullP.y;
    }
    const X0 = -.96, X1 = .96, Y0 = -.94, Y1 = .88;
    let dx = 0, dy = 0;
    if (lx < X0) dx = X0 - lx; else if (hx > X1) dx = X1 - hx;
    if (ly < Y0) dy = Y0 - ly; else if (hy > Y1) dy = Y1 - hy;
    if (!dx && !dy) return;
    const hh = (camera.position.z - p.z) * TAN_HALF;
    p.x += dx * hh * camera.aspect * w;
    p.y += dy * hh * w;
  }
  const wrapPi = a => Math.atan2(Math.sin(a), Math.cos(a));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const poseYawFor = i => (Flight.sides[i] === 'left' ? -Math.PI + .32 : -.32);
  const toScreen = v => { proj.copy(v).project(camera); return { x: (proj.x + 1) / 2 * innerWidth, y: (1 - proj.y) / 2 * innerHeight }; };

  // Position on the blended down/up route for hop `ti` at scroll progress `te` (even speed from A to B)
  // Near the podiums the route is walked slowly, so it stays with the take-off roll and the landing glide it is
  // blended with; the speed comes in the middle, where the plane is in the clear
  const ROUTE_HOLD = .7;
  function sampleRoute(ti, te, out) {
    let t = clamp(te, 0, 1);
    t -= ROUTE_HOLD / (2 * Math.PI) * Math.sin(2 * Math.PI * t);
    const d = downRoutes[ti], u = upRoutes[ti];
    d.getPointAt(d.a0 + (d.a1 - d.a0) * t, out);
    u.getPointAt(u.a0 + (u.a1 - u.a0) * (1 - t), tmpE);
    return out.lerp(tmpE, routeMix);
  }
  // Unit vector in the direction of travel
  function travelAt(ti, te, out) {
    sampleRoute(ti, te + .004, out);
    sampleRoute(ti, te - .004, tmpC);
    out.sub(tmpC).multiplyScalar(travelDir);
    return out.lengthSq() > 1e-10 ? out.normalize() : out.set(travelDir, 0, 0);
  }

  // --- Ground phase on a podium ---
  // u = how far the plane is from being parked (0 parked → ~.4 fully airborne).
  // Departing: taxi forward, lift the tail, rotate, climb forward off the podium.
  // Arriving (dir = -1): the same path mirrored, so it glides in from behind and above and rolls to a stop.
  // Sequence: turn in place to face the runway heading (0–.05) → taxi (.04–.15) → tail up → rotate → climb away.
  const turnAt = u => smooth(0, .05, u);
  const groundPitchAt = u => GROUND_PITCH * (1 - smooth(.05, .085, u)) + .26 * smooth(.09, .13, u) * (1 - smooth(.26, .4, u));
  // Take-off roll: steady acceleration that carries straight on into the climb-out (in podium radii-ish units).
// Its speed never drops, so the plane doesn't stall for a moment as it lifts off.
const ROLL_V = 8;
const rollAt = u => { const q = clamp((u - .04) / .11, 0, 1); return ROLL_V * .055 * q * q + Math.max(0, u - .15) * ROLL_V; };
  const climbAt = u => smooth(.1, .34, u) * 2.2 + Math.max(0, u - .34) * 3;
  // World yaw of a route's first leg (departure) or last leg (arrival)
  const legYaw = (curve, arriving) => {
    const pts = curve.points;
    const n = pts.length;                                     // [pre, A, …, B, post]
    return arriving ? yawOf(tmpC.subVectors(pts[n - 2], pts[n - 3])) : yawOf(tmpC.subVectors(pts[2], pts[1]));
  };

  function placePodium(p, index, burn, sPlane, introE) {
    if (p.index !== index) { p.index = index; p.lastBurn = burn; }   // re-used for another section: no stray embers
    p.rig.visible = burn < .999;
    const R = PODIUM_R * scale * introE, T = 1.6 * scale * introE;
    const top = .04 * T;
    const rest = restPts[index];
    const home = index === 0;
    p.rig.position.set(rest.x + (home ? podShift0 : 0), rest.y - top - groundHeight(GROUND_PITCH) * sPlane + (home ? podDrop0 : 0), rest.z + (home ? podNear0 : 0));
    parkRig(p.rig, spins[index]);
    p.rig.updateMatrixWorld(true);
    p.mesh.scale.set(R, T, R);
    p.top = top;
    p.uniforms.uBurn.value = burn;
    const solid = (1 - smooth(0, .4, burn)) * Math.min(1, intro * 2);
    p.under.position.set(.12 * R, -top * 1.5 - .25 * T, .1 * R);
    p.under.scale.set(R * 2.9, R * 2.9, 1);
    p.under.material.opacity = solid * (.32 + night.k * .25);
    p.solid = solid;
    // fixtures only while the deck is whole; glows and pools at night
    p.lights.visible = burn < .12 || (night.k > .01 && burn < .98);
    if (p.lights.visible) {
      p.lights.position.y = top;
      p.lights.scale.setScalar(R);
      p.housings.visible = p.lamps.visible = burn < .12;
      const k = night.k * solid;
      p.glows.visible = p.pools.visible = k > .005;
      const rabbitHead = (time * 1.7) % 1;
      if (k > .005 || p.lamps.userData.lit !== false) p.glows.children.forEach((sp, i) => {
        const l = sp.userData;
        let v;
        if (l.kind === 'edge') v = .7 + .3 * Math.pow(Math.max(0, Math.sin(l.a * 2 - time * 3)), 4);
        else if (l.kind === 'ring') v = .6 + .4 * Math.sin(time * 2.2 + l.k * .8);
        else if (l.kind === 'rabbit') {
          const d = (rabbitHead - l.k / 12 + 1) % 1;
          v = d < .06 ? 1 : .08 + Math.max(0, .4 - d * 4);
        } else v = .85 + .15 * Math.sin(time * 9 + l.k);
        const flick = .94 + Math.random() * .06;
        sp.material.opacity = k * v * flick;
        sp.scale.setScalar((l.kind === 'rabbit' ? .05 + v * .09 : l.kind === 'bar' ? .05 : .065) * (.8 + v * .3));
        lampCol.set(0x3A3836).lerp(l.base, .35).lerp(l.base, Math.min(1, k * v * 1.4)).multiplyScalar(1 + k * v * 2.2);
        p.lamps.setColorAt(i, lampCol);
        lampCol.copy(l.base).multiplyScalar(k * v * (l.kind === 'rabbit' ? .55 : .32));
        p.pools.setColorAt(i, lampCol);
      });
      if (k > .005 || p.lamps.userData.lit !== false) {
        p.lamps.instanceColor.needsUpdate = true;
        p.pools.instanceColor.needsUpdate = true;
      }
      p.lamps.userData.lit = k > .005;
    }
    p.uniforms.uSweep.value.set(Math.sin(spins[index]), -Math.cos(spins[index]));
    // Embers while it burns away or assembles
    if (p.rig.visible && burn > 0 && Math.abs(burn - p.lastBurn) > .0005 && window.Embers) {
      const rising = burn > p.lastBurn;
      const count = Math.min(rising ? 22 : 10, Math.ceil(Math.abs(burn - p.lastBurn) * (rising ? 150 : 70)));
      const front = clamp(1 - 2 * ((burn * 1.25 - .12) / .75), -1, 1);
      const sx0 = p.uniforms.uSweep.value.x, sz0 = p.uniforms.uSweep.value.y;
      for (let k = 0; k < count; k++) {
        const across = (Math.random() * 2 - 1) * Math.sqrt(Math.max(0, 1 - front * front));
        tmpA.set(sx0 * front - sz0 * across, .04, sz0 * front + sx0 * across);
        const s = toScreen(p.mesh.localToWorld(tmpA));
        window.Embers.spawn(s.x, s.y, !rising);
      }
    }
    p.lastBurn = burn;
  }

  // Plane pose on podium `p` at ground progress u; rollSign +1 departing, -1 arriving.
  // `headingWorld` is the runway direction: departures roll out along it, arrivals roll in along it.
  function groundPose(p, u, rollSign, sPlane, headingWorld) {
    const y0 = poseYawFor(p.index);
    const runway = headingWorld - spins[p.index];                 // into podium space
    const yaw = y0 + wrapPi(runway - y0) * turnAt(u);
    // Arrivals roll in slightly less nose-high, but settle into the exact three-point stance when parked
    const pitchG = groundPitchAt(u) * (1 - .125 * (1 - rollSign) * smooth(0, .08, u));
    const roll = rollAt(u) * 2.4 * sPlane * rollSign;
    const lift = climbAt(u) * scale;
    const dx = Math.cos(runway) * roll, dz = -Math.sin(runway) * roll;
    groundPos.set(dx, p.top + groundHeight(pitchG) * sPlane + lift, dz).applyMatrix4(p.rig.matrixWorld);
    euler.set(0, yaw, pitchG);
    localQ.setFromEuler(euler);
    groundQ.copy(p.rig.quaternion).multiply(localQ);
    // Tyre contact shadows: where each wheel meets the deck
    rigInv.copy(p.rig.matrixWorld).invert();
    const onDeck = Math.max(0, 1 - lift / (.25 * scale)) * (1 - smooth(0, .25, p.uniforms.uBurn.value)) * Math.min(1, intro * 2);
    CONTACTS.forEach((c, i) => {
      contactPos.copy(c.at).multiplyScalar(sPlane).applyQuaternion(groundQ).add(groundPos).applyMatrix4(rigInv);
      const m = p.contacts[i];
      m.position.set(contactPos.x, p.top + .003 + i * .0005, contactPos.z);
      m.rotation.set(-Math.PI / 2, 0, yaw);
      const sz = c.size * sPlane;
      m.scale.set(sz, sz * c.sx, 1);
      m.material.opacity = c.op * onDeck;
    });
    // Contact shadow stays on the podium top, fading as the plane climbs
    p.shade.position.set(dx - .1 * sPlane, p.top + .004, dz);
    p.shade.rotation.set(-Math.PI / 2, 0, yaw);
    const spread = 1 + lift * .25;
    p.shade.scale.set(3.9 * sPlane * spread, 3.1 * sPlane * spread, 1);
    p.shade.material.opacity = .32 * (1 - smooth(0, .25, p.uniforms.uBurn.value)) / (1 + lift * 1.2) * Math.min(1, intro * 2);
    return u;
  }

  // ---------- Weapons ----------
  // Rockets leave the racks at these points of each hop (progress along the route actually flown)
  const FIRE_AT = [.27, .3, .35, .38, .44, .47, .53, .56];
  const TRACER_SPEED = 30;
  const fxA = new V3(), fxB = new V3(), fxC = new V3(), fxD = new V3();
  let parkTime = 0, shotAcc = 0, gunCursor = 0, gunGlow = 0, gunsHot = false, gameFiring = false, missileWait = 0;
  let lastHop = -1, lastLp = 0, launchWait = 0, salvoTimer = 0, missileCursor = 0;
  const launchQueue = [];
  const easeOut = k => 1 - Math.pow(1 - k, 3);
  const sfx = window.Sfx || null;
  const Impacts = window.Impacts || null;
  const panOf = v => clamp(toScreen(v).x / innerWidth * 2 - 1, -1, 1);
  // Comfortably in front of the camera (safe to project)
  const inFront = v => fxD.copy(v).applyMatrix4(camera.matrixWorldInverse).z < -1.5;

  function fireGun(gn, aim) {
    gn.flashT = .04 + Math.random() * .025;
    gn.recoil = 1;
    gn.flash.star.material.rotation = Math.random() * Math.PI;
    const k = .75 + Math.random() * .5;
    gn.flash.g.scale.set(k * (.8 + Math.random() * .5), k, k);
    gn.flash.g.rotation.x = Math.random() * Math.PI;
    gunGlow = 1;
    // Tracer: some pass in front of the page text, the rest behind it; on the card sections some punch holes
    const tr = tracers.next();
    const d = tr.userData;
    plane.localToWorld(d.start.copy(gn.muzzle));
    d.hit = null;
    d.hitKind = null;
    d.life = 0;
    d.lastHead = 0;
    d.game = gameFiring;
    d.dir.copy(forward);
    d.dir.y = 0;
    d.dir.normalize();
    if (aim) {
      // Jump battle: the rounds leave along the barrels (the guns are harmonised to converge a few degrees
      // at most), with a little spread; they never bend off towards a target outside the sight
      fxB.subVectors(aim, d.start);
      const dist = fxB.length() || 1;
      fxB.divideScalar(dist);
      d.dir.copy(forward);
      const ang = Math.acos(clamp(d.dir.dot(fxB), -1, 1));
      if (ang > 1e-4) d.dir.lerp(fxB, Math.min(1, .085 / ang)).normalize();
      d.dir.x += (Math.random() - .5) * .018;
      d.dir.y += (Math.random() - .5) * .018;
      d.dir.z += (Math.random() - .5) * .018;
      d.dir.normalize();
      d.speed = 50 * scale;
      d.len = .8 * scale;
      d.max = Math.min(.7, dist / d.speed + .08);
      d.front = false;
    } else if (d.game) {
      // Mini-game turret: aim is left/right only; the gunner finds the height of the nearest target
      d.speed = 56 * scale;
      d.dir.y = dogfight ? dogfight.game.elevation(d.start, d.dir, d.speed) : .1;
      d.dir.x += (Math.random() - .5) * .012;
      d.dir.y += (Math.random() - .5) * .012;
      d.dir.normalize();
      d.len = .9 * scale;
      d.max = .8;
      d.front = false;
    } else {
      // Sitting tail-down the guns point skywards; the gunner holds them level and sprays across the page
      d.dir.x += (Math.random() - .5) * .03;
      d.dir.y += (Math.random() - .6) * .12;
      d.dir.z += (Math.random() - .5) * .03;
      d.dir.normalize();
      d.speed = TRACER_SPEED * scale;
      d.len = .42 * scale;
      d.max = .34 + Math.random() * .1;
      d.front = !!Impacts && Math.random() < (parkedAt === 0 ? .45 : .38);
      if (Impacts && parkedAt > 0 && Math.random() < .4) aimAtPage(d, 'card');
      else if (Impacts && parkedAt === 0 && Math.random() < .3) aimAtPage(d, 'letter');
    }
    d.on = true;
    tr.visible = false;
    tr.quaternion.setFromUnitVectors(X_AXIS, d.dir);
    tr.scale.set(.001, scale * (d.game ? 1.8 : 1), scale * (d.game ? 1.8 : 1));
    // spent casing, kicked out sideways
    const cs = casings.next();
    plane.localToWorld(cs.position.copy(gn.eject));
    fxB.set(0, 0, gn.side).transformDirection(plane.matrixWorld);
    fxC.set(0, 1, 0).transformDirection(plane.matrixWorld);
    cs.userData.vel.copy(fxB).multiplyScalar((1 + Math.random()) * scale)
      .addScaledVector(fxC, (1.4 + Math.random()) * scale)
      .addScaledVector(forward, -.6 * scale);
    cs.userData.spin.set(Math.random() * 30, Math.random() * 30, Math.random() * 30);
    cs.userData.life = 0;
    cs.userData.max = .7;
    cs.scale.setScalar(scale);
    cs.visible = true;
    if (sfx) {
      const pan = panOf(d.start);
      sfx.gun(pan);
      if (Math.random() < .35) sfx.tink(pan);
    }
  }

  // Try to land this bullet on the page (an empty patch of a card, or a headline letter);
  // re-aims it so its screen path ends exactly on the target
  function aimAtPage(d, kind) {
    let range = d.speed * d.max;
    if (d.dir.z > 1e-3) range = Math.min(range, (camera.position.z - 4 - d.start.z) / d.dir.z);
    if (range < 1) return;
    fxB.copy(d.start).addScaledVector(d.dir, range);
    if (!inFront(d.start) || !inFront(fxB)) return;
    const a = toScreen(d.start), b = toScreen(fxB);
    const hit = kind === 'letter' ? Impacts.findLetterHit(a.x, a.y, b.x, b.y) : Impacts.findHit(parkedAt, a.x, a.y, b.x, b.y);
    if (!hit) return;
    d.hitKind = kind;
    fxC.copy(d.start).addScaledVector(d.dir, range * hit.t).project(camera);
    fxC.set(hit.x / innerWidth * 2 - 1, 1 - hit.y / innerHeight * 2, fxC.z).unproject(camera);
    d.dir.subVectors(fxC, d.start);
    const len = d.dir.length();
    if (len < .5) return;
    d.dir.divideScalar(len);
    d.max = len / d.speed;
    d.hit = hit;
    d.front = true;
  }

  function updateGuns(dt) {
    model.guns.forEach(gn => {
      gn.flashT -= dt;
      gn.flash.g.visible = gn.flashT > 0;
      gn.recoil = Math.max(0, gn.recoil - dt * 16);
      gn.barrel.position.x = -gn.recoil * .04;
    });
    gunGlow = Math.max(0, gunGlow - dt * 14);
    gunLight.intensity = gunGlow * 2.4;
    gunLight.distance = 5 * scale;
    plane.localToWorld(gunLight.position.set(1.3, .65, 0));
    for (const tr of tracers) {
      const d = tr.userData;
      if (!d.on) continue;
      d.life += dt;
      if (d.life >= d.max) {
        d.on = tr.visible = false;
        if (d.hit) {
          if (d.hitKind === 'letter') Impacts.hitLetter(d.hit, d.dir);
          else Impacts.hole(d.hit, d.dir);
          if (sfx) sfx.impact(d.hit.x / innerWidth * 2 - 1, d.hitKind);
        }
        continue;
      }
      const head = d.speed * d.life, tail = Math.max(0, head - d.len);
      if (d.game && dogfight) {
        fxA.copy(d.start).addScaledVector(d.dir, head);
        fxB.copy(d.start).addScaledVector(d.dir, d.lastHead);
        d.lastHead = head;
        const hitAt = dogfight.game.hit(fxB, fxA);
        if (hitAt) {
          d.on = tr.visible = false;
          if (game) { const sp = toScreen(hitAt); game.kill(sp.x, sp.y); }
          continue;
        }
      }
      const fade = d.hit || d.game ? 1 : 1 - Math.pow(d.life / d.max, 2);
      if (d.front) {
        fxA.copy(d.start).addScaledVector(d.dir, head);
        fxB.copy(d.start).addScaledVector(d.dir, tail);
        if (!inFront(fxA) || !inFront(fxB)) continue;
        const width = clamp(scale * innerHeight * .035 / fxA.distanceTo(camera.position), 1.2, 5);
        const a = toScreen(fxB), b = toScreen(fxA);
        Impacts.tracer(a.x, a.y, b.x, b.y, width, fade);
      } else {
        tr.visible = head - tail > .001;
        tr.position.copy(d.start).addScaledVector(d.dir, (head + tail) / 2);
        tr.scale.x = Math.max(.001, head - tail);
        tr.material.opacity = fade;
      }
    }
    for (const cs of casings) {
      if (!cs.visible) continue;
      const d = cs.userData;
      d.life += dt;
      if (d.life >= d.max) { cs.visible = false; continue; }
      d.vel.y -= 9.8 * scale * dt;
      cs.position.addScaledVector(d.vel, dt);
      cs.rotation.x += d.spin.x * dt;
      cs.rotation.y += d.spin.y * dt;
      cs.rotation.z += d.spin.z * dt;
    }
  }

  // Nearest horizontal spot (NDC x) whose bottom strip isn't under a content block, so blasts never sit behind text.
  // Returns null when the whole strip is covered (e.g. phones), and the blast then happens just below the screen edge.
  const contentBlocks = [...document.querySelectorAll('.panel__content')];
  function freeColumn(nx, py) {
    const blocked = [];
    for (const el of contentBlocks) {
      if (!el.closest('.panel').classList.contains('is-live')) continue;
      const r = el.getBoundingClientRect();
      if (r.bottom > py - 90 && r.top < py + 50 && r.right > 0 && r.left < innerWidth) blocked.push([r.left - 70, r.right + 70]);
    }
    if (!blocked.length) return nx;
    const toPx = v => (v + 1) / 2 * innerWidth;
    const free = x => blocked.every(([a, b]) => x < a || x > b);
    const x0 = toPx(nx);
    for (let d = 0; d < innerWidth; d += 24) {
      for (const x of [x0 + d, x0 - d]) {
        if (x > innerWidth * .07 && x < innerWidth * .93 && free(x)) return x / innerWidth * 2 - 1;
      }
    }
    return null;
  }

  // A point on the ground band: ahead of the launch point, projected into the bottom strip of the screen
  function pickTarget(from, dir, out) {
    fxA.set(dir.x, 0, dir.z);
    if (fxA.lengthSq() < 1e-4) fxA.set(travelDir, 0, 0);
    fxA.normalize();
    out.copy(from).addScaledVector(fxA, (3 + Math.random() * 3) * scale);
    const z = clamp(out.z, -22, -3);
    out.z = z;
    proj.copy(out).project(camera);
    let ny = -.74 - Math.random() * .14;
    let nx = clamp(proj.x + (Math.random() - .5) * .14, -.86, .86);
    const free = freeColumn(nx, (1 - ny) / 2 * innerHeight);
    if (free === null) ny = -1.08 - Math.random() * .06;
    else nx = free;
    out.set(nx, ny, .5).unproject(camera).sub(camera.position);
    out.multiplyScalar((z - camera.position.z) / out.z).add(camera.position);
    return out;
  }

  // Generic rocket: ground attack (no `air`) or air-to-air (`air`, optionally homing on `track.pos` while `track.alive`)
  function spawnMissile(o) {
    const m = missiles.find(x => !x.active) || missiles[missileCursor++ % missiles.length];
    m.pos.copy(o.pos);
    m.vel.copy(o.vel);
    m.speed = m.vel.length();
    m.life = 0;
    m.trailAcc = 0;
    m.active = m.g.visible = true;
    m.size = o.size || 0;
    m.maxSpeed = o.maxSpeed || 15 * scale;
    m.track = o.track || null;
    m.onHit = o.onHit || null;
    m.air = !!o.air;
    if (o.target) m.target.copy(o.target);
    else if (m.track) m.target.copy(m.track.pos);
    if (sfx) sfx.rocket(panOf(m.pos), o.volume == null ? 1 : o.volume);
    return m;
  }

  function launchRocket(k) {
    const r = model.rack[k];
    r.state = 'gone';
    r.load = 0;
    r.mesh.visible = false;
    r.mesh.getWorldPosition(fxB);
    fxA.set(0, -1, 0).transformDirection(plane.matrixWorld);
    fxC.copy(forward).multiplyScalar(4 * scale).addScaledVector(fxA, 1.4 * scale);
    const m = spawnMissile({ pos: fxB, vel: fxC });
    if (r.target) m.target.copy(r.target);
    else pickTarget(m.pos, forward, m.target);
    r.target = null;
    salvoTimer = 1.1;
  }

  // Jump battle: a rack rocket that homes on a fighter; false if no rocket is ready
  function airRocket(foe, onHit) {
    const k = model.rack.findIndex(r => r.state === 'armed' && r.load >= 1);
    if (k < 0) return false;
    const r = model.rack[k];
    r.state = 'gone';
    r.load = 0;
    r.mesh.visible = false;
    r.mesh.getWorldPosition(fxB);
    fxA.set(0, -1, 0).transformDirection(plane.matrixWorld);
    fxC.copy(forward).multiplyScalar(8 * scale).addScaledVector(fxA, .9 * scale);
    spawnMissile({ pos: fxB, vel: fxC, air: true, track: foe, maxSpeed: 26 * scale, onHit });
    salvoTimer = 1.1;
    return true;
  }

  // col: an air-show smoke colour (a THREE.Color); otherwise grey smoke, or dark for fire
  function spawnTrail(p, hot, k = 1, dark = false, col = null) {
    const d = trail[trailCursor++ % trail.length];
    d.col = col;
    d.x = p.x; d.y = p.y; d.z = p.z;
    d.vx = (Math.random() - .5) * .3 * scale * k;
    d.vy = (.25 + Math.random() * .3) * scale * k;
    d.vz = (Math.random() - .5) * .3 * scale * k;
    d.life = 0;
    d.max = (col ? 1.9 : dark ? 1.4 : .9) + Math.random() * .6;
    if (col) { d.vx *= .35; d.vy *= .25; d.vz *= .35; }
    d.size = scale * k * (.7 + Math.random() * .5);
    d.hot = hot;
    d.dark = dark;
    d.rot = Math.random() * Math.PI * 2;
    d.on = true;
  }

  function finishMissile(m, p) {
    m.active = m.g.visible = false;
    if (m.onHit) m.onHit(p.clone());
    else {
      explode(p);
      killTroops(p, 2.3 * scale);
    }
  }

  function updateMissiles(dt, sPlane) {
    for (const m of missiles) {
      if (!m.active) continue;
      m.life += dt;
      if (m.track && m.track.alive) m.target.copy(m.track.pos);
      const size = m.size || sPlane;
      const burning = m.life > (m.air ? .05 : .16);
      if (!burning) m.vel.y -= 7 * scale * dt;
      else {
        fxA.subVectors(m.target, m.pos);
        const dist = fxA.length();
        m.speed = Math.min(m.maxSpeed, m.speed + m.maxSpeed * 2.1 * dt);
        const reach = m.speed * dt * 1.5 + (m.air ? .35 * size : .05 * scale);
        if (dist < reach || m.life > 4) {
          finishMissile(m, m.life > 4 ? m.pos : m.target);
          continue;
        }
        fxB.copy(m.vel).normalize().lerp(fxA.divideScalar(dist), damp((m.air ? 5 : 3) + m.life * 14, dt)).normalize();
        m.vel.copy(fxB).multiplyScalar(m.speed);
      }
      m.pos.addScaledVector(m.vel, dt);
      if (!m.air && m.pos.y < m.target.y) {
        finishMissile(m, fxC.copy(m.pos).setY(m.target.y));
        continue;
      }
      m.g.position.copy(m.pos);
      m.g.quaternion.setFromUnitVectors(X_AXIS, fxB.copy(m.vel).normalize());
      m.g.scale.setScalar(size);
      m.flame.visible = m.jet.visible = burning;
      m.flame.scale.setScalar(.32 + Math.random() * .16);
      if (burning) {
        m.g.updateMatrixWorld();
        m.trailAcc += dt;
        while (m.trailAcc > .02) {
          m.trailAcc -= .02;
          spawnTrail(m.g.localToWorld(fxC.set(-.32, 0, 0)), true, size / scale);
        }
      }
    }
    for (const d of trail) {
      if (!d.on) continue;
      d.life += dt;
      const t = d.life / d.max;
      if (t >= 1) { d.on = false; continue; }
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      let a;
      if (d.col) {
        a = (1 - t) * .62 * Math.min(1, t * 9);
        smokeCol.copy(d.col).lerp(cSmoke1, t * .45);
        smokeSys.push(d, d.size * (.2 + t * 1.25), d.rot, smokeCol, a);
        continue;
      }
      if (d.dark) {
        a = (1 - t) * .55 * Math.min(1, t * 10);
        smokeCol.copy(cSmoke0).lerp(cSmoke1, t);
      } else {
        a = (1 - t) * .5 * Math.min(1, t * 12);
        smokeCol.copy(cSmoke1).lerp(cMid, d.hot ? Math.max(0, .5 - t * 3) : 0);
      }
      smokeSys.push(d, d.size * (.18 + t * (d.dark ? 1 : .7)), d.rot, smokeCol, a);
    }
  }

  // o.air: mid-air burst (no ground ring, scorch or dirt); o.size scales it; o.quiet skips the sound
  function explode(p, o = {}) {
    const e = explosions.find(x => !x.active) || explosions[explosionCursor++ % explosions.length];
    const d = p.distanceTo(camera.position);
    const S = e.size = scale * .95 * Math.sqrt(clamp(d / 14, 1, 2.6)) * (.85 + Math.random() * .3) * (o.size || 1);
    e.air = !!o.air;
    e.g.position.copy(p);
    e.t = 0;
    e.active = e.g.visible = true;
    e.ring.visible = e.scorch.visible = !e.air;
    e.fire.forEach((f, i) => {
      f.off.set(Math.random() - .5, Math.random() * .6, Math.random() - .5).multiplyScalar(i ? 1.1 : .2);
      if (e.air) f.off.y -= .3;
      f.delay = i ? Math.random() * .1 : 0;
      f.grow = i ? .7 + Math.random() * .6 : 1.5;
      f.rot = (Math.random() - .5) * 2;
      f.s.material.rotation = Math.random() * Math.PI * 2;
    });
    e.smoke.forEach(f => {
      f.off.set(Math.random() - .5, Math.random() * .4, Math.random() - .5).multiplyScalar(1.2);
      f.vel.set((Math.random() - .5) * .4, (e.air ? .2 : .5) + Math.random() * .9, (Math.random() - .5) * .4);
      f.delay = .08 + Math.random() * .25;
      f.grow = (1 + Math.random() * .8) * (e.air ? .8 : 1);
      f.rot = (Math.random() - .5) * .6;
      f.s.material.rotation = Math.random() * Math.PI * 2;
    });
    [[e.sparks, 1.8, 3.8], [e.dirt, 1.2, 2.6]].forEach(([b, v0, v1]) => {
      const arr = b.pts.geometry.attributes.position.array;
      arr.fill(0);
      b.pts.geometry.attributes.position.needsUpdate = true;
      b.pts.material.size = b.base * S;
      b.vel.forEach(v => {
        v.set(Math.random() - .5, (e.air ? -.4 : .35) + Math.random() * .8, Math.random() - .5).normalize().multiplyScalar((v0 + Math.random() * (v1 - v0)) * S);
      });
    });
    if (sfx && !o.quiet) sfx.boom(panOf(p), clamp(20 / d, .18, 1) * Math.sqrt(o.size || 1), e.air);
  }

  function updateExplosions(dt) {
    for (const e of explosions) {
      if (!e.active) continue;
      e.t += dt;
      const t = e.t, S = e.size;
      if (t > 3.5) { e.active = e.g.visible = false; continue; }
      const fl = clamp(t / .16, 0, 1);
      e.flash.visible = fl < 1;
      e.flash.scale.setScalar(S * (1 + fl * 3.4));
      e.flash.material.opacity = (1 - fl) * .85;
      if (!e.air) {
        const rk = clamp(t / .6, 0, 1);
        e.ring.visible = rk < 1;
        e.ring.scale.setScalar(S * (.4 + easeOut(rk) * 3.6));
        e.ring.material.opacity = (1 - rk) * .7;
        e.scorch.scale.setScalar(S * 2.4);
        e.scorch.material.opacity = .55 * smooth(0, .15, t) * (1 - smooth(1.6, 3.4, t));
      }
      e.fire.forEach(f => {
        const lt = t - f.delay;
        f.s.visible = lt > 0 && lt < 1;
        if (!f.s.visible) return;
        const k = lt, grow = easeOut(clamp(lt / .32, 0, 1));
        f.s.position.copy(f.off).multiplyScalar(S * (.3 + grow * .7));
        f.s.position.y += lt * lt * (e.air ? .5 : 1.4) * S;
        f.s.scale.setScalar(S * f.grow * (.3 + grow * 1.1));
        f.s.material.rotation += f.rot * dt;
        if (k < .25) tmpCol.copy(cHot).lerp(cMid, k / .25);
        else tmpCol.copy(cMid).lerp(cDark, (k - .25) / .75);
        f.s.material.color.copy(tmpCol);
        f.s.material.opacity = 1 - smooth(.3, 1, k);
        f.s.visible = false;
        fireSys.push(expTmp.copy(f.s.position).add(e.g.position), f.s.scale.x, f.s.material.rotation, tmpCol, f.s.material.opacity);
      });
      e.smoke.forEach(f => {
        const lt = t - f.delay, k = lt / 3;
        f.s.visible = lt > 0 && k < 1;
        if (!f.s.visible) return;
        f.s.position.copy(f.off).multiplyScalar(S).addScaledVector(f.vel, S * lt);
        f.s.scale.setScalar(S * f.grow * (.6 + easeOut(Math.min(1, k * 1.6)) * 1.2));
        f.s.material.rotation += f.rot * dt;
        f.s.material.color.copy(cSmoke0).lerp(cSmoke1, smooth(0, .7, k));
        f.s.material.opacity = (e.air ? .6 : .72) * smooth(0, .06, k) * (1 - smooth(.3, 1, k));
        f.s.visible = false;
        smokeSys.push(expTmp.copy(f.s.position).add(e.g.position), f.s.scale.x, f.s.material.rotation, f.s.material.color, f.s.material.opacity);
      });
      (e.bursts || (e.bursts = [[e.sparks, 14, .9], [e.dirt, 12, 1.3]])).forEach(([b, grav, life]) => {
        b.pts.visible = t < life && !(e.air && b === e.dirt);
        if (!b.pts.visible) return;
        const arr = b.pts.geometry.attributes.position.array;
        for (let i = 0; i < b.n; i++) {
          const v = b.vel[i];
          v.y -= grav * S * dt;
          arr[i * 3] += v.x * dt;
          arr[i * 3 + 1] += v.y * dt;
          arr[i * 3 + 2] += v.z * dt;
          if (!e.air && arr[i * 3 + 1] < 0) {
            arr[i * 3 + 1] = 0;
            if (v.y < 0) v.multiplyScalar(.4).setY(-v.y * .3);
          }
        }
        b.pts.geometry.attributes.position.needsUpdate = true;
        b.pts.material.opacity = 1 - smooth(life * .45, life, t);
      });
    }
  }

  // Background dogfights while parked (js/dogfight.js)
  const dogfight = window.Dogfight && !reduced ? window.Dogfight.create({
    mergeStatic: (g, skip) => mergeStatic(g, skip, false),
    THREE, scene, camera, col, fxTex, fxMat, explode, spawnMissile, spawnTrail, sfx,
    getScale: () => scale, isMobile: () => mobile, sides: Flight.sides, panOf, getNight: () => night.k, glowTex: fxTex.glow,
    hitPoint, peaceful,
    onPlayerHit: (at, dir) => {
      hitShake = 1;
      if (dir) takeHit(at, dir);
      if (sfx) sfx.ping(panOf(at));
      if (Impacts) { const sp = toScreen(at); Impacts.burst(sp.x, sp.y, 0, 1); }
    },
  }) : null;

  // Mini-game (js/game.js): face north on the home podium to play
  const game = window.PlaneGame && dogfight ? window.PlaneGame.create({
    lock: on => { if (Flight.lock) Flight.lock(on); },
    onStart: () => {
      aim.yaw = clamp(yawOf(fxD.set(forward.x, 0, forward.z)), NORTH - AIM_RANGE, NORTH + AIM_RANGE);
      aim.byPointer = false;
      aim.keys = 0;
    },
    // back to the resting pose (facing left)
    onDone: () => { spinTargets[0] = Math.round(spins[0] / TAU) * TAU; },
  }) : null;
  if (game) Flight.onNavigate = () => game.abort();

  // Mini-game missile: leaves a wing rack (the podium loader refills it) and homes on the enemy nearest the aim
  function fireGameMissile(flat) {
    const r = model.rack.find(x => x.state === 'armed' && x.load >= 1);
    if (!r || !dogfight) return false;
    r.state = 'gone';
    r.load = 0;
    r.mesh.visible = false;
    r.mesh.getWorldPosition(fxB);
    const target = dogfight.game.nearest(fxB, flat, .45);
    fxC.copy(flat).multiplyScalar(7 * scale).setY(2.2 * scale);
    const o = { pos: fxB, vel: fxC, maxSpeed: 26 * scale, air: true, volume: .8 };
    const boom = p => explode(p, { air: true, size: .45 });
    if (target) {
      o.track = target;
      o.onHit = p => {
        const at = dogfight.game.destroy(target, p);
        if (!at) { boom(p); return; }
        if (game) { const sp = toScreen(at); game.kill(sp.x, sp.y); }
      };
    } else {
      o.target = fxA.copy(fxB).addScaledVector(flat, 38).setY(fxB.y + 7 * scale);
      o.onHit = boom;
    }
    spawnMissile(o);
    salvoTimer = .6;
    return true;
  }

  // Point `yaw` at the target band ahead of the guns
  const gunV = new V3();
  const gunAt = (out, sPlane) => out.copy(plane.position).setY(plane.position.y + .62 * sPlane);
  // (raised by gameLift in the dogfight, so the sight stays up in the sky while the plane sits low)
  const aimPoint = (from, yaw, out) => out.set(from.x + Math.cos(yaw) * 22, from.y + 2.2 * scale + gameLift, from.z - Math.sin(yaw) * 22);
  // Yaw whose aim point sits under screen x (bigger yaw = further left)
  function yawForScreenX(px, from) {
    let lo = NORTH - AIM_RANGE, hi = NORTH + AIM_RANGE;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      if (toScreen(aimPoint(from, mid, fxD)).x > px) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  // ---------- Day / night ----------
  // main.js sets <html data-theme> and fires `themechange`; the scene eases between the two looks.
  const night = { k: 0, target: document.documentElement.dataset.theme === 'night' ? 1 : 0, applied: -1 };
  night.k = night.target;
  addEventListener('themechange', e => { night.target = e.detail.night ? 1 : 0; });
  const LOOK = {
    day: {
      exposure: 1.12, hemiSky: col(0xFFF6EA), hemiGround: col(0xA88560), hemi: .78,
      key: col(0xFFFFFF), keyI: 1.85, rim: col(0xFFC996), rimI: .9, fill: col(0xFFE4D9), fillI: .3,
      trim: col(0x3A1400), trimIn: col(0x000000), red: col(0x000000),
      paint: .24, env: .75,
    },
    night: {
      exposure: 1.0, hemiSky: col(0x5A3A34), hemiGround: col(0x0B0706), hemi: .55,
      key: col(0xFFD6C2), keyI: 1.15, rim: col(0xFF7A4D), rimI: .8, fill: col(0x8A4A5C), fillI: .3,
      trim: col(0xFF5A10), trimIn: col(0x9A3208), red: col(0x6A0A12),
      paint: 3.4, env: .3,
    },
  };
  const glowMats = [];      // FX that switch to additive blending in the dark
  model.guns.forEach(gn => { glowMats.push(gn.flash.star.material, gn.flash.g.children[1].material); });
  tracers.forEach(t => glowMats.push(t.material));
  explosions.forEach(e => {
    glowMats.push(e.flash.material, e.ring.material, e.sparks.pts.material);
    e.fire.forEach(f => glowMats.push(f.s.material));
  });
  glowMats.push(fireSys.material);
  explosions.forEach(() => {
  });
  missiles.forEach(m => glowMats.push(m.flame.material));
  troops.forEach(tr => glowMats.push(tr.flash.material, tr.fire.material));
  const mix = (a, b, k) => a + (b - a) * k;
  function applyNight(k) {
    const D = LOOK.day, N = LOOK.night;
    renderer.toneMappingExposure = mix(D.exposure, N.exposure, k);
    hemi.color.copy(D.hemiSky).lerp(N.hemiSky, k);
    hemi.groundColor.copy(D.hemiGround).lerp(N.hemiGround, k);
    hemi.intensity = mix(D.hemi, N.hemi, k);
    key.color.copy(D.key).lerp(N.key, k);
    key.intensity = mix(D.keyI, N.keyI, k);
    rim.color.copy(D.rim).lerp(N.rim, k);
    rim.intensity = mix(D.rimI, N.rimI, k);
    fill.color.copy(D.fill).lerp(N.fill, k);
    fill.intensity = mix(D.fillI, N.fillI, k);
    // Glow paint: the orange livery lights up
    M.fuse.emissiveIntensity = mix(D.paint, N.paint, k);
    M.wing.emissiveIntensity = mix(D.paint, N.paint * .9, k);
    M.orange.emissive.copy(D.trim).lerp(N.trim, k);
    M.orangeIn.emissive.copy(D.trimIn).lerp(N.trimIn, k);
    M.red.emissive.copy(D.red).lerp(N.red, k);
    Object.values(M).forEach(m => { m.envMapIntensity = mix(D.env, N.env, k); });
    const blend = k > .5 ? ADD : NORMAL;
    glowMats.forEach(m => { m.blending = blend; });
  }

  // Inspection hook for development only: open the page with ?debug
  if (/[?&]debug\b/.test(location.search)) window.__plane = { routes: () => ({ downRoutes, upRoutes }), THREE, scene, camera, renderer, plane, model, explode, dogfight, podiums, game, spins, spinTargets, aim, troops, missiles, step: d => step(d), takeHit, hitPoint, dmg, holes, defense, gameView: (v, n) => { GAME_VIEW = v; GAME_NEAR = n; } };

  // ---------- Crew animation ----------
  // The stick follows the plane's real roll and pitch rates, the throttle follows the engine, the gunner's grips
  // shake while the guns fire, and free hands go and press buttons (hover, push in, the button lights, back).
  const cw = { roll: 0, yaw: 0, pitch: 0, first: true, salvo: 0, prevQ: new THREE.Quaternion(), dq: new THREE.Quaternion() };
  const ikD = new V3(), ikB = new V3(), ikE = new V3(), ikH = new V3(), ikS = new V3(), ikPole = new V3(), ikT = new V3();
  const ikQ = new THREE.Quaternion(), ikM = new THREE.Matrix4(), ONE = new V3(1, 1, 1), btnP = new V3(), btnQ = new THREE.Quaternion();
  const hoverP = new V3(), restP = new V3(), lookV = new V3(), headP = new V3();
  const btnC = new THREE.Color(), needleR = new THREE.Matrix4();
  const easeIO = x => x * x * (3 - 2 * x);
  function setBone(inst, i, A, B) {
    ikD.subVectors(B, A).normalize();
    ikQ.setFromUnitVectors(Y_UP, ikD);
    inst.setMatrixAt(i, ikM.compose(A, ikQ, ONE));
  }
  function solveArm(i, S, T, pole) {
    const C = model.crew;
    ikD.subVectors(T, S);
    const dist = ikD.length() || 1e-3;
    ikD.divideScalar(dist);
    const L = clamp(dist, .03, (ARM_A + ARM_B) * .995);
    const cosA = clamp((ARM_A * ARM_A + L * L - ARM_B * ARM_B) / (2 * ARM_A * L), -1, 1);
    ikB.copy(pole).addScaledVector(ikD, -pole.dot(ikD));
    if (ikB.lengthSq() < 1e-8) ikB.set(0, -1, 0);
    ikB.normalize();
    ikE.copy(S).addScaledVector(ikD, ARM_A * cosA).addScaledVector(ikB, ARM_A * Math.sqrt(1 - cosA * cosA));
    ikH.copy(S).addScaledVector(ikD, L);
    setBone(C.uppers, i, S, ikE);
    setBone(C.fores, i, ikE, ikH);
    C.hands.setMatrixAt(i, ikM.makeTranslation(ikH.x, ikH.y, ikH.z));
  }
  // Where a hand rests when it has nothing else to do (root-local)
  function restFor(h, firing, out) {
    const C = model.crew;
    if (h.pilot === 0) {
      if (h.side > 0) return out.set(-.012, .228, .02).applyMatrix4(C.stick.matrix);
      return out.set(0, .066, .012).applyMatrix4(C.throttle.matrix);
    }
    return out.set(-.012, .04, h.side * .05).applyMatrix4(C.grips.matrix);
  }
  function startTask(h, b, dur) {
    h.task = { b, t: 0, dur, pressed: false };
  }
  function pickButton(pilot, side) {
    const list = model.crew.buttons.filter(b => !b.trigger && !b.big && b.pilot === pilot && b.side === side);
    return list[(Math.random() * list.length) | 0];
  }
  function updateCrew(dt, parkedNow, flight, firing, battle) {
    const C = model.crew;
    // The plane's turn rates in its own frame
    cw.dq.copy(cw.prevQ).invert().multiply(plane.quaternion);
    cw.prevQ.copy(plane.quaternion);
    if (cw.first) { cw.first = false; cw.dq.set(0, 0, 0, 1); }
    if (cw.dq.w < 0) cw.dq.set(-cw.dq.x, -cw.dq.y, -cw.dq.z, -cw.dq.w);
    const inv = 2 / Math.max(dt, 1e-3), k = damp(5, dt);
    cw.roll += (clamp(cw.dq.x * inv, -5, 5) - cw.roll) * k;
    cw.yaw += (clamp(cw.dq.y * inv, -5, 5) - cw.yaw) * k;
    cw.pitch += (clamp(cw.dq.z * inv, -5, 5) - cw.pitch) * k;
    const busy = parkedNow ? .6 : 1;
    // Stick leans into the turn (plus the small corrections a pilot makes); throttle follows the engine
    const wig = parkedNow ? Math.sin(time * 1.3) * .04 * Math.max(0, Math.sin(time * .37)) : Math.sin(time * 3.1) * .03 * flight;
    C.stick.rotation.x = clamp(cw.roll * .16, -.5, .5) + wig;
    C.stick.rotation.z = clamp(-cw.pitch * .18, -.45, .45) + Math.sin(time * 2.3) * .02 * flight;
    C.throttle.rotation.z = -.5 + clamp((rpm - 14) / 70, 0, 1) * .95;
    C.grips.position.copy(C.gripBase);
    if (firing) { C.grips.position.x += (Math.random() - .5) * .006; C.grips.position.y += (Math.random() - .5) * .004; }
    [C.stick, C.throttle, C.grips].forEach(o => o.updateMatrix());
    // Crew bodies lean against the G, the gunner hunches over the grips while firing
    C.pilots.forEach((p, i) => {
      const hunch = i === 1 && firing ? -.14 : 0;
      p.rotation.x += (clamp(-cw.roll * .05, -.18, .18) - p.rotation.x) * damp(6, dt);
      p.rotation.z += (clamp(-cw.pitch * .04, -.12, .12) + hunch - p.rotation.z) * damp(8, dt);
      p.updateMatrix();
    });

    // Button tasks: a pilot looks over the panel every few seconds (more often in a fight)
    const salvo = salvoTimer > cw.salvo + .05;
    cw.salvo = salvoTimer;
    for (let pi = 0; pi < 2; pi++) {
      C.timers[pi] -= dt;
      if (C.timers[pi] > 0) continue;
      C.timers[pi] = (battle ? 1.4 : parkedNow ? 2.6 : 3.8) + Math.random() * 3 * busy;
      const free = C.handState.filter(h => h.pilot === pi && !h.task && !(pi === 0 && h.side > 0 && !parkedNow) && !(pi === 1 && firing));
      if (!free.length) continue;
      const h = free[(Math.random() * free.length) | 0];
      const b = pickButton(pi, h.side);
      if (b) startTask(h, b, .95 + Math.random() * .3);
    }
    if (salvo) {
      const h = C.handState[3], b = C.buttons.find(x => x.big);
      if (b) startTask(h, b, .55);
    }
    // Hands: rest -> hover over the button -> press -> back
    C.handState.forEach((h, i) => {
      restFor(h, firing, restP);
      if (h.task && h.pilot === 1 && firing && !h.task.b.big) h.task = null;
      let T = restP;
      if (h.task) {
        const t = h.task, b = t.b;
        t.t += dt;
        const u = t.t / t.dur;
        hoverP.copy(b.base).addScaledVector(b.n, .03);
        btnP.copy(b.base).addScaledVector(b.n, .012);
        if (u < .38) T = hoverP.lerp(restP, 1 - easeIO(u / .38)).clone();
        else if (u < .62) {
          const press = Math.sin((u - .38) / .24 * Math.PI);
          T = hoverP.lerp(btnP, press).clone();
          b.depth = press * .004;
          if (!t.pressed && press > .8) {
            t.pressed = true;
            b.flash = 1;
            if (!b.big) b.on = !b.on;
            if (sfx && sfx.click) sfx.click(panOf(plane.position));
          }
        } else if (u < 1) T = hoverP.lerp(restP, easeIO((u - .62) / .38)).clone();
        else { h.task = null; b.depth = 0; }
      }
      if (!h.ready) { h.pos.copy(T); h.ready = true; }
      h.pos.lerp(T, damp(h.task ? 30 : 14, dt));
      ikS.copy(C.shoulders[h.pilot][h.side > 0 ? 1 : 0]).applyMatrix4(C.pilots[h.pilot].matrix);
      ikPole.set(-.25, -.45, h.side * 1.1).applyQuaternion(C.pilots[h.pilot].quaternion);
      solveArm(i, ikS, h.pos, ikPole);
    });
    // Heads: glance into the turn, look around, watch the hand that is pressing something
    C.heads.forEach((hd, i) => {
      const hand = C.handState.find(h => h.pilot === i && h.task);
      let yaw, pitch;
      if (hand) {
        headP.set(0, .15, 0).applyMatrix4(C.pilots[i].matrix);
        lookV.subVectors(hand.task.b.base, headP);
        yaw = Math.atan2(-lookV.z, lookV.x);
        pitch = Math.atan2(lookV.y, Math.hypot(lookV.x, lookV.z)) * .8;
      } else {
        C.lookT[i] -= dt;
        if (C.lookT[i] <= 0) { C.lookT[i] = 1.5 + Math.random() * 3; C.look[i] = (Math.random() - .5) * (parkedNow ? 1.6 : .9); }
        yaw = clamp(cw.yaw * .3 + cw.roll * .12, -.7, .7) + C.look[i];
        pitch = i === 1 && firing ? -.12 : Math.sin(time * .5 + i * 2) * .05;
      }
      hd.rotation.y += (clamp(yaw, -1.1, 1.1) - hd.rotation.y) * damp(5, dt);
      hd.rotation.z += (clamp(pitch, -.45, .3) - hd.rotation.z) * damp(5, dt);
      if (i === 1 && firing) hd.position.y = .15 + (Math.random() - .5) * .004;
      else hd.position.y = .15;
    });
    // Buttons: pressed ones sink and flash; toggles stay softly lit; triggers flash with every shot
    C.buttons.forEach((b, i) => {
      b.flash = Math.max(0, b.flash - dt * 2.2);
      if (b.trigger) {
        const hot = b.pilot === 1 ? firing : firing && Math.random() < .5;
        b.depth = hot ? .003 : 0;
        if (hot) b.flash = Math.max(b.flash, .6 + Math.random() * .4);
        btnP.copy(b.local).applyMatrix4(b.attach.matrix);
        btnQ.copy(b.attach.quaternion);
        btnP.y -= b.depth;
      } else {
        btnP.copy(b.base).addScaledVector(b.n, -b.depth);
        btnQ.copy(b.q);
      }
      C.btnMesh.setMatrixAt(i, ikM.compose(btnP, btnQ, ikT.setScalar(b.scale)));
      const glow = (b.on ? .75 : .22) + b.flash * 2.2 + (b.big ? .25 : 0);
      C.btnMesh.setColorAt(i, btnC.copy(b.color).multiplyScalar(glow));
    });
    // Gauges: rpm and a climb/altitude needle
    C.needles.forEach((nd, i) => {
      const target = nd.j === 0 ? -2 + clamp(rpm / 90, 0, 1) * 3.4 : -1.2 + clamp(cw.pitch * .6 + plane.position.y * .08, -1, 1) * 1.4;
      nd.a += (target - nd.a) * damp(4, dt);
      ikM.copy(nd.m).multiply(needleR.makeRotationX(nd.a));
      C.needleMesh.setMatrixAt(i, ikM);
    });
    [C.uppers, C.fores, C.hands, C.btnMesh, C.needleMesh].forEach(m => { m.instanceMatrix.needsUpdate = true; });
    C.btnMesh.instanceColor.needsUpdate = true;
  }

  // The plane's place on screen, for the page's background gradient (js/gradient.js) to react to
  const planeNdc = new V3();
  const planeScreen = Flight.planeScreen = { x: innerWidth * .7, y: innerHeight * .6, k: 0 };
  // While a full-screen reader covers the page (js/main.js sets Flight.sceneOff once the scene has faded out),
  // the scene isn't simulated or drawn at all, and the engine goes quiet
  let sceneWasOff = false;
  function frame() {
    requestAnimationFrame(frame);
    const dt = clock.getDelta();
    if (Flight.sceneOff) {
      if (!sceneWasOff && sfx) sfx.engine(0, 0, 0);
      sceneWasOff = true;
      return;
    }
    sceneWasOff = false;
    step(dt);
  }

  function step(rawDt) {
    const dt = Math.min(rawDt, .05);
    time += dt;
    frameNo++;
    smokeSys.begin();
    fireSys.begin();

    // Adaptive resolution: drop pixel ratio if frames run long, restore when there's headroom
    if (rawDt > .021) { slowFrames++; fastFrames = 0; } else if (rawDt < .0175) { fastFrames++; slowFrames = 0; }
    if (slowFrames > 10 && dpr > 1) { dpr = Math.max(1, dpr - .25); renderer.setPixelRatio(dpr); slowFrames = 0; }
    if (fastFrames > 360 && dpr < maxDpr) { dpr = Math.min(maxDpr, dpr + .25); renderer.setPixelRatio(dpr); fastFrames = 0; }

    night.k += (night.target - night.k) * Math.min(1, dt * 1.7);
    if (Math.abs(night.target - night.k) < .002) night.k = night.target;
    if (night.k !== night.applied) { applyNight(night.k); night.applied = night.k; }

    const st = Flight.state;
    const n = Flight.sides.length;
    if (n < 2) { renderer.render(scene, camera); return; }

    // Which way are we flying? Latched, so the plane keeps its heading when you pause mid-flight.
    if (st.velocity > 30) travelDir = 1;
    else if (st.velocity < -30) travelDir = -1;
    const J = Flight.jump;
    const jumping = !!(J && J.active);
    for (let k = 0; k < n; k++) spins[k] += (spinTargets[k] - spins[k]) * damp(9, dt);

    if (document.body.classList.contains('is-loaded')) intro = Math.min(1, intro + dt / 1.6);
    const introE = intro < 1 ? 1 - Math.pow(1 - intro, 4) * Math.cos(intro * 7) : 1;
    // Full-screen dogfight: the podium slides to the centre for the round and back afterwards
    const inRoundNow = !!game && game.state !== 'idle';
    AIM_RANGE = game && game.aiming ? 1.42 : 1.15;
    gameShift += ((inRoundNow ? 1 : 0) - gameShift) * damp(1.8, dt);
    if (Math.abs(gameShift - (inRoundNow ? 1 : 0)) < .001) gameShift = inRoundNow ? 1 : 0;
    const gs = gameShift * gameShift * (3 - 2 * gameShift);
    podShift0 = -restPts[0].x * gs;
    podDrop0 = gs > 0 ? gameDrop() * gs : 0;
    podNear0 = GAME_NEAR * gs;
    gameLift = -podDrop0;
    const sPlane = scale * Math.max(.001, introE);
    mouse.sx += (mouse.x - mouse.sx) * damp(4, dt);
    mouse.sy += (mouse.y - mouse.sy) * damp(4, dt);

    let ti, te, f, lp, p, u, nearA, nearDepart, podA, podB;
    if (jumping) {
      // --- One continuous flight to a far section ---
      if (J.id !== jump.id) beginJump(J);
      const jp = clamp(J.p, 0, 1);
      ti = J.from;
      te = .5;
      lp = lastLp;
      nearA = jp < .5;
      parkedAt = nearA ? J.from : J.to;
      f = clamp(Math.min(jp, 1 - jp) * 7, 0, 1);
      jumpPose(jp, dt);
      // while shooting, the pilot pulls the nose onto the target (a few degrees, never more)
      const tr = jump.track;
      if (tr && tr.alive && time - jump.trackT < .3) {
        fwd.set(1, 0, 0).applyQuaternion(targetQ);
        tmpA.subVectors(tr.pos, pos).normalize();
        const ang = Math.acos(clamp(fwd.dot(tmpA), -1, 1));
        if (ang > .002 && ang < .7) {
          tmpB.crossVectors(fwd, tmpA).normalize();
          localQ.setFromAxisAngle(tmpB, Math.min(ang, .2));
          targetQ.premultiply(localQ);
        }
      }
      podA = podiums.find(q => q.index === J.from);
      podB = podiums.find(q => q.index === J.to && q !== podA);
      if (!podA) podA = podiums.find(q => q !== podB);
      if (!podB) podB = podiums.find(q => q !== podA);
      placePodium(podA, J.from, smooth(.07, .16, jp), sPlane, Math.max(.001, introE));
      placePodium(podB, J.to, smooth(.07, .16, 1 - jp), sPlane, Math.max(.001, introE));
      p = nearA ? podA : podB;
      u = Math.min(.7, (nearA ? jp : 1 - jp) / .13 * .42);
      groundPose(p, u, nearA ? 1 : -1, sPlane, nearA ? jump.departYaw : jump.arriveYaw);
      nearDepart = nearA;
    } else {
      ti = Math.min(st.from, n - 2);
      te = st.from >= n - 1 ? 1 : st.e;
      const mixTarget = travelDir < 0 ? 1 : 0;
      // Routes share their end points, so switching at a rest is invisible; mid-flight it blends
      if (te < .02 || te > .98) routeMix = mixTarget;
      else routeMix += (mixTarget - routeMix) * damp(5, dt);

      f = Math.sin(Math.PI * te);                        // flight intensity 0 → 1 → 0
      lp = te + (1 - 2 * te) * routeMix;                 // progress along the route actually flown
      parkedAt = te < .5 ? ti : ti + 1;

      // --- Airborne pose on the route ---
      sampleRoute(ti, te, pos);
      travelAt(ti, te, fwd);
      const turn = wrapPi(yawOf(travelAt(ti, te + .03 * travelDir, dirA)) - yawOf(travelAt(ti, te - .03 * travelDir, dirB)));
      const bankGain = 1 - Math.pow(1 - f, 3);
      const poseYaw = poseYawFor(parkedAt) + spins[parkedAt];
      const heading = poseYaw + wrapPi(yawOf(fwd) - poseYaw) * bankGain;
      const pitch = Math.asin(clamp(fwd.y, -1, 1)) * .85 * bankGain;
      const roll = clamp(-turn * 1.1, -.8, .8) * bankGain;       // gentler banks keep the approach smooth
      const cruise = smooth(.3, .45, Math.min(lp, 1 - lp));  // gentle bob only well away from the podiums
      pos.y += Math.sin(time * 1.7) * .07 * cruise * scale;
      euler.set(roll + Math.sin(time * 1.3) * .05 * cruise, heading, pitch + Math.sin(time * 1.1) * .03 * cruise);
      airQ.setFromEuler(euler);
      targetQ.copy(airQ);

      // --- Podiums: the one being left burns away once the plane is clear; the next one assembles before touchdown ---
      // Both depend only on scroll position, so reversing mid-hop simply plays the same moment backwards.
      podA = podiums.find(q => q.index === ti);
      podB = podiums.find(q => q.index === ti + 1 && q !== podA);
      if (!podA) podA = podiums.find(q => q !== podB);         // keep each rig on the section it already shows
      if (!podB) podB = podiums.find(q => q !== podA);
      placePodium(podA, ti, smooth(.16, .36, te), sPlane, Math.max(.001, introE));
      placePodium(podB, ti + 1, smooth(.16, .36, 1 - te), sPlane, Math.max(.001, introE));
      nearA = te <= .5;
      p = nearA ? podA : podB;
      u = nearA ? te : 1 - te;
      // Leaving a podium rolls out ahead (+1); landing rolls in from behind (-1). Blended with the route so a
      // change of direction mid-take-off turns smoothly into a landing.
      const leaving = nearA ? 1 - routeMix : routeMix;
      const rollSign = leaving * 2 - 1;
      const headDown = legYaw(downRoutes[ti], !nearA);        // down route leaves A, lands on B
      const headUp = legYaw(upRoutes[ti], nearA);             // up route leaves B, lands on A
      groundPose(p, u, rollSign, sPlane, headDown + wrapPi(headUp - headDown) * routeMix);
      nearDepart = nearA ? travelDir > 0 : travelDir < 0;   // for the HUD label
    }
    const groundW = 1 - smooth(.18, .42, u);
    (nearA ? podB : podA).shade.material.opacity = 0;
    (nearA ? podB : podA).contacts.forEach(m => { m.material.opacity = 0; });
    pos.lerp(groundPos, groundW);
    targetQ.slerp(groundQ, groundW);
    const parked = !jumping && u < .005;

    // Shadow camera follows the nearest podium; the map only re-renders while the plane is near it
    // (plus one last pass once it has left, which clears the old shadow)
    const shadowR = PODIUM_R * scale * 1.35, sc = key.shadow.camera;
    if (sc.right !== shadowR) {
      sc.left = sc.bottom = -shadowR;
      sc.right = sc.top = shadowR;
      sc.near = 1;
      sc.far = 60;
      sc.updateProjectionMatrix();
    }
    key.target.position.copy(p.rig.position);
    key.position.copy(p.rig.position).addScaledVector(KEY_DIR, 25);
    podLight.position.copy(p.rig.position).addScaledVector(camera.up, 1.4 * scale);
    podLight.distance = 9 * scale;
    podLight.intensity = night.k * p.solid * 1.3;
    const shadowOn = groundW > .001 && p.rig.visible;
    if ((shadowOn && (!parked || (frameNo & 1) === 0)) || (!shadowOn && shadowWas)) renderer.shadowMap.needsUpdate = true;
    shadowWas = shadowOn;

    // Screen area that accepts the sideways spin gesture (parked only)
    podiumRect = null;
    if (parked && intro >= 1 && p.rig.visible) {
      let l = Infinity, r = -Infinity, t = Infinity, b = -Infinity;
      rimPts.forEach(pt => {
        const s = toScreen(p.mesh.localToWorld(tmpA.copy(pt)));
        l = Math.min(l, s.x); r = Math.max(r, s.x); t = Math.min(t, s.y); b = Math.max(b, s.y);
      });
      const topS = toScreen(tmpB.copy(restPts[parkedAt]).addScaledVector(camera.up, 1.6 * scale));
      podiumRect = { l: l - 16, r: r + 16, t: Math.min(t, topS.y) - 16, b: b + 16 };
    }

    // Spin hint (hidden while the mini-game runs)
    if (hint) {
      const show = parked && intro >= 1 && Flight.settled === parkedAt && Math.abs(st.velocity) < 60 && !peaceful()
        && !defense.on && (!game || game.state === 'idle');
      if (show) setHintText(parkedAt);
      if (show !== hintShown) {
        hintShown = show;
        if (show) placeHint();
        hint.classList.toggle('is-on', show);
      }
    }

    // The jump battle never lets the plane leave the frame
    if (jumping) keepInFrame(pos, targetQ, sPlane, 1 - groundW);
    // Position locked to scroll; orientation eases very slightly so a mid-flight reversal turns instead of snapping
    plane.position.copy(pos);
    // Guard: never let a single bad frame poison the orientation (a NaN quaternion would hide the plane for good)
    const validTarget = Number.isFinite(targetQ.x + targetQ.y + targetQ.z + targetQ.w);
    const validPlane = Number.isFinite(plane.quaternion.x + plane.quaternion.y + plane.quaternion.z + plane.quaternion.w);
    if (validTarget) {
      if (first || !validPlane) { plane.quaternion.copy(targetQ); first = false; }
      else plane.quaternion.slerp(targetQ, damp(reduced ? 60 : 16, dt));
    }
    plane.scale.setScalar(sPlane);

    // --- Engine: revs up for take-off and in flight ---
    const taxiRev = (1 - smooth(.3, .45, u)) * smooth(0, .04, u) * 36;
    const targetRpm = 14 + f * 46 + taxiRev + Math.min(Math.abs(st.velocity) * .012, 18) + (intro < 1 ? (1 - intro) * 30 : 0) + (gunsHot ? 12 : 0);
    rpm += (targetRpm - rpm) * damp(2.5, dt);
    model.prop.rotation.x += rpm * dt;
    model.blur.material.opacity = clamp((rpm - 16) / 30, 0, 1) * .9;
    model.blur.rotation.z += dt * 2;
    const onWheels = u < .12;
    const wheelSpin = onWheels ? (parked ? 0 : (2 + taxiRev * .8) * smooth(.005, .03, u)) : rpm * .12 * (1 + f * 2);
    model.wheels.forEach(w => { w.rotation.z -= wheelSpin * dt; });

    // Engine vibration
    hitShake = Math.max(0, hitShake - dt * 5);
    // Smooth, low-frequency motion instead of per-frame jitter: parked, the plane only breathes on its
    // suspension and rocks back a touch as the guns fire; in the air a gentle buffet
    restK += ((parked ? 1 : 0) - restK) * damp(3, dt);
    const buffet = (1 - restK) * (.004 + f * .006 + rpm * .00005);
    const shake = hitShake * .03;
    recoilS += (gunGlow - recoilS) * damp(18, dt);
    model.root.position.set(
      Math.sin(time * 13) * buffet + Math.sin(time * 71) * shake - recoilS * .01,
      (onWheels ? 0 : Math.sin(time * 11 + 1) * buffet) + Math.sin(time * 1.6) * .0035 * restK * (1 - recoilS),
      Math.sin(time * 9 + 2) * buffet + Math.cos(time * 67) * shake,
    );
    model.root.rotation.x = Math.sin(time * 7) * (1 - restK) * (onWheels ? .002 : .005);
    model.root.rotation.z = Math.sin(time * 1.3) * .004 * restK - recoilS * .006;

    updatePlaneLights(night.k);

    // Exhaust: pulsing puffs from all six stacks, blown back by the prop wash and the airspeed
    forward.set(1, 0, 0).applyQuaternion(plane.quaternion);
    back.copy(forward).negate();
    plane.updateMatrixWorld(true);
    const pulse = .7 + .6 * Math.max(0, Math.sin(time * (7 + rpm * .08)));
    puffAcc += dt * (reduced ? 0 : (6 + rpm * .12 + f * 24) * pulse);
    while (puffAcc > 1) {
      puffAcc -= 1;
      const pipe = model.pipes[pipeCursor++ % model.pipes.length];
      plane.localToWorld(exA.copy(pipe));
      exB.set(0, 0, pipe.z > 0 ? 1 : -1).transformDirection(plane.matrixWorld);
      spawnExhaust(exA, exB, back, .5 + rpm * .012 + f * 3.4);
    }
    smokeLight.copy(smokeDay).lerp(smokeNight, night.k);
    const drag = 1 - dt * 1.9;
    for (const d of exhaust) {
      if (!d.on) continue;
      d.life += dt;
      const t = d.life / d.max;
      if (t >= 1) { d.on = false; continue; }
      d.vx *= drag; d.vy *= drag; d.vz *= drag;
      d.vy += .22 * scale * dt;                                   // warm smoke rises
      d.x += d.vx * dt + Math.sin(d.seed + d.life * 2.3) * .05 * scale * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt + Math.cos(d.seed * 1.3 + d.life * 1.9) * .05 * scale * dt;
      d.rot += d.spin * dt;
      const grow = 1 - Math.pow(1 - Math.min(1, t * 1.6), 2);
      const a = Math.min(1, t * 14) * Math.pow(1 - t, 1.6) * (.42 - night.k * .08);
      smokeCol.copy(night.k > .5 ? sootNight : sootDay).lerp(smokeLight, Math.min(1, t * 2.2));
      smokeSys.push(d, scale * d.size * (.16 + grow * 1.05 + t * .5), d.rot, smokeCol, a);
    }
    exhaustFlames.forEach((fl, k) => {
      const hot = clamp((rpm - 14) / 50, 0, 1);
      const v = (.25 + night.k * .75) * (.35 + hot * .65) * (.55 + Math.random() * .45);
      fl.material.opacity = v;
      fl.scale.set((.07 + Math.random() * .05 + hot * .06) * 1.6, .07 + Math.random() * .03, 1);
      fl.material.rotation = 0;
    });

    plane.updateMatrixWorld(true);
    const gunPos = gunAt(gunV, sPlane);

    // --- Mini-game: face north on the home podium; while it runs, the podium turns to aim ---
    const idleGame = !game || game.state === 'idle';
    if (game) {
      const hdg = ((90 - THREE.MathUtils.radToDeg(yawOf(forward))) % 360 + 360) % 360;
      const off = Math.min(hdg, 360 - hdg);
      game.update(dt, {
        ready: parked && parkedAt === 0 && intro >= 1 && p.rig.visible && st.y < 6 && !peaceful(),
        facing: off < 20,
        away: off > 40,
        head: toScreen(plane.localToWorld(fxA.copy(model.pilotHead))),
        arena: toScreen(fxB.copy(gunPos).setY(gunPos.y + 2.4 * scale + gameLift)),
      });
      if (game.aiming) {
        if (aim.byPointer && aim.pointerX !== null) aim.yaw = yawForScreenX(aim.pointerX, gunPos);
        if (aim.keys) aim.yaw = clamp(aim.yaw + aim.keys * 1.6 * dt, NORTH - AIM_RANGE, NORTH + AIM_RANGE);
        const want = aim.yaw - poseYawFor(0);
        spinTargets[0] = want + Math.round((spins[0] - want) / TAU) * TAU;
        if (Impacts) {
          const sp = toScreen(aimPoint(gunPos, yawOf(fxD.set(forward.x, 0, forward.z)), fxA));
          Impacts.reticle(sp.x, sp.y, game.firing);
          if (game.weapon !== 'guns' && dogfight) {
            const t = dogfight.game.nearest(gunPos, fxD.set(forward.x, 0, forward.z).normalize(), .45);
            if (t) {
              const tp = toScreen(t.pos);
              Impacts.lock(tp.x, tp.y, t.world * innerHeight * 2.4 / t.pos.distanceTo(camera.position));
            }
          }
        }
      }
    }
    // --- Defence (any section but the hero): face north and the turret picks off incoming planes ---
    const hdgNow = ((90 - THREE.MathUtils.radToDeg(yawOf(forward))) % 360 + 360) % 360;
    const offNorth = Math.min(hdgNow, 360 - hdgNow);
    if (game && game.state !== 'idle' && peaceful()) game.abort();         // switched to peaceful mid-round
    const canDefend = !!dogfight && idleGame && parked && parkedAt > 0 && intro >= 1 && p.rig.visible && !reduced && Flight.settled === parkedAt && !peaceful();
    defense.firing = false;
    if (!canDefend || (defense.on && defense.section !== parkedAt)) {
      if (defense.on) { defense.on = false; defense.armed = false; }
      if (!parked) defense.armed = true;
    } else if (!defense.on) {
      if (offNorth > 40) defense.armed = true;
      else if (defense.armed && offNorth < 20) {
        defense.on = true;
        defense.armed = false;
        defense.t = 0;
        defense.userSpin = 0;
        defense.missile = 1.5;
        defense.section = parkedAt;
        aim.yaw = clamp(yawOf(fxD.set(forward.x, 0, forward.z)), NORTH - AIM_RANGE, NORTH + AIM_RANGE);
        if (sfx) sfx.ui();
      }
    }
    if (defense.on) {
      defense.t += dt;
      const flat = fxD.set(forward.x, 0, forward.z).normalize();
      const t = dogfight.game.nearest(gunPos, flat, 2.2);
      if (t) {
        // lead the target a little, then swing the podium onto it
        const lead = t.pos.distanceTo(gunPos) / (56 * scale);
        fxA.copy(t.pos).addScaledVector(t.vel, lead).sub(gunPos);
        const want = clamp(yawOf(fxA), NORTH - AIM_RANGE, NORTH + AIM_RANGE);
        aim.yaw += wrapPi(want - aim.yaw) * damp(5, dt);
        const err = Math.abs(wrapPi(yawOf(flat) - want));
        defense.firing = err < .14 && defense.t > .8;
        defense.missile -= dt;
        if (defense.missile <= 0 && err < .3) {
          if (fireGameMissile(flat)) defense.missile = 2.4 + Math.random() * 1.6;
        }
        if (Impacts) {
          const tp = toScreen(t.pos);
          Impacts.lock(tp.x, tp.y, t.world * innerHeight * 2.4 / t.pos.distanceTo(camera.position));
        }
      } else {
        aim.yaw += wrapPi(NORTH - aim.yaw) * damp(1.5, dt);
      }
      const want = aim.yaw - poseYawFor(parkedAt);
      spinTargets[parkedAt] = want + Math.round((spins[parkedAt] - want) / TAU) * TAU;
      // ends after a while, or when you turn the podium yourself
      if (defense.t > 28 || defense.userSpin > .9) {
        defense.on = false;
        if (defense.t > 28) spinTargets[parkedAt] = Math.round(spins[parkedAt] / TAU) * TAU;
      }
    }

    // Battle damage heals once the fight is over and the plane is back on its resting heading
    updateDamage(dt, !defense.on && idleGame && (!parked || offNorth > 55));

    const inRound = !!game && game.firing && parked;
    gameFiring = (inRound && game.weapon !== 'missiles') || defense.firing;
    missileWait -= dt;
    if (inRound && game.weapon !== 'guns' && missileWait <= 0) {
      if (fireGameMissile(fxD.set(forward.x, 0, forward.z).normalize())) missileWait = game.weapon === 'both' ? .75 : .4;
    }

    // --- Guns: only while parked on a podium with the engine running, in short bursts ---
    parkTime = idleGame && !defense.on && parked && intro >= 1 && !reduced && p.rig.visible && !peaceful() ? parkTime + dt : 0;
    const burstT = parkTime - 1.2;
    gunsHot = gameFiring || (burstT > 0 && burstT % 2.9 < 1.25);
    if (gunsHot) {
      shotAcc += dt * (gameFiring ? 16 : 24);
      while (shotAcc > 1) { shotAcc -= 1; fireGun(model.guns[gunCursor++ % model.guns.length]); }
    } else shotAcc = 0;
    updateGuns(dt);

    // --- Rockets: released in flight at set points of the hop, re-armed near a podium ---
    if (jumping) updateRaid(J.p);
    if (ti !== lastHop) { lastHop = ti; lastLp = lp; }
    if (groundW > .9) {
      launchQueue.length = 0;
      model.rack.forEach((r, k) => {
        if (r.state === 'gone') r.load = -k * .07;
        r.state = 'armed';
        r.target = null;
      });
    } else if (!jumping && !reduced && intro >= 1 && lp > lastLp && !peaceful()) {
      model.rack.forEach((r, k) => {
        const spot = FIRE_AT[k] - .13;
        if (r.state === 'armed' && !r.target && spot > lastLp && spot <= lp) {
          r.target = pickTarget(plane.position, forward, new V3());
          spawnSquad(r.target);
        }
        if (r.state === 'armed' && FIRE_AT[k] > lastLp && FIRE_AT[k] <= lp) { r.state = 'queued'; launchQueue.push(k); }
      });
    }
    lastLp = lp;
    launchWait -= dt;
    if (launchQueue.length && launchWait <= 0) { launchRocket(launchQueue.shift()); launchWait = .08; }
    model.rack.forEach(r => {
      if (r.state === 'gone') return;
      r.load = Math.min(1, r.load + dt * 2.5);
      r.mesh.visible = r.load > 0;
      const k = clamp(r.load, 0, 1);
      r.mesh.scale.setScalar(Math.max(.001, easeOut(k)));
    });
    salvoTimer -= dt;
    updateCrew(dt, parked, f, gunsHot || gunGlow > .05, jumping && !jump.show && J.p > jump.phase[0] && J.p < jump.phase[2]);
    updateMissiles(dt, sPlane);
    updateExplosions(dt);
    updateTroops(dt);
    drawTroops();

    // --- Page impacts (front tracers, bullet holes), background dogfights, engine sound ---
    const settled = parked && intro >= 1 && p.rig.visible;
    if (Impacts) {
      if (settled) Impacts.land(parkedAt);
      Impacts.frame(dt, st.velocity);
    }
    updateFlares(dt);
    if (dogfight) {
      dogfight.update(dt, settled, parkedAt, {
        busy: !idleGame || defense.on,
        playing: (!!game && game.state === 'play') || defense.on,
        G: gunPos,
        lift: gameLift,
        side: inRoundNow ? 0 : plane.position.x >= 0 ? 1 : -1,
      });
      if (jumping) keepApart();
      if (jumping && jump.show) updateShowSmoke(dt);
      // the show is over (or was cut short): any display plane still on stage flies off
      if (!jumping && jump.team && jump.team.length) {
        jump.team.forEach(a => { if (a.stay) { a.stay = false; a.age = 14; } });
        jump.team.length = 0;
      }
    }
    soundTimer += dt;
    if (sfx && soundTimer > .05) {
      soundTimer = 0;
      const dist = plane.position.distanceTo(camera.position);
      sfx.engine(rpm, Math.min(1, intro * 2) * clamp(18 / dist, .3, 1.15), panOf(plane.position));
    }

    planeNdc.copy(plane.position).project(camera);
    planeScreen.x = (planeNdc.x + 1) / 2 * innerWidth;
    planeScreen.y = (1 - planeNdc.y) / 2 * innerHeight;
    planeScreen.k = f;

    // HUD (text updates throttled to ~12 fps to avoid layout work every frame)
    hudTimer += dt;
    const flying = f > .05;
    if (flying !== hud.classList.contains('is-flying')) hud.classList.toggle('is-flying', flying);
    if (hudTimer > .08) {
      hudTimer = 0;
      const alt = groundW > .5 ? climbAt(u) * 400 : (plane.position.y + halfH) * 120 + f * 2400;
      setHud('alt', String(Math.round(alt)).padStart(4, '0'));
      setHud('spd', String(Math.round(rpm * 2.1 + f * 140)).padStart(3, '0'));
      setHud('hdg', String(Math.round(((90 - THREE.MathUtils.radToDeg(yawOf(forward))) % 360 + 360) % 360) % 360).padStart(3, '0'));
      let status = 'Cruising';
      if (parked) status = 'On podium';
      else if (onWheels) status = nearDepart ? 'Take-off roll' : 'Touchdown';
      else if (groundW > .05) status = nearDepart ? 'Climbing out' : 'On approach';
      else if (lp < .5) status = 'Heading out';
      else status = 'Inbound';
      if (jumping && !onWheels && groundW < .05) {
        const jp = J.p, ph = jump.phase;
        status = jump.show ? (jp < ph[0] ? 'Climbing out' : jp < ph[2] ? 'Air show' : 'Inbound')
          : jp < ph[0] ? 'Climbing out' : jp < ph[1] ? 'Evading' : jp < ph[2] ? 'Engaging' : 'Inbound';
      }
      if (game && game.state === 'countdown') status = 'Get ready';
      else if (game && game.state === 'play') status = 'Dogfight!';
      else if (gunsHot) status = 'Guns firing';
      else if (salvoTimer > 0 && !onWheels) status = 'Salvo away';
      setHud('status', status);
    }

    smokeSys.end();
    fireSys.end();
    renderer.render(scene, camera);
  }
  // Compile every shader up front, while the loader is showing: otherwise the first explosion, fire,
  // or squad would stall a frame while its program compiles
  try {
    renderer.compile(scene, camera);
  } catch (e) { /* compiled lazily instead */ }
  // ...and draw everything once off-screen: the GPU driver only finishes a shader (and uploads its
  // textures) on the first real draw, which would otherwise be a visible stall mid-flight
  setTimeout(() => {
    const rt = new THREE.WebGLRenderTarget(8, 8);
    const shown = [];
    scene.traverse(o => { if (!o.visible) { o.visible = true; shown.push(o); } });
    const counts = Object.values(troopParts).map(m => m.count);
    Object.values(troopParts).forEach(m => { m.count = 1; });
    smokeSys.warm(true);
    fireSys.warm(true);
    renderer.shadowMap.needsUpdate = true;
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    shown.forEach(o => { o.visible = false; });
    Object.values(troopParts).forEach((m, i) => { m.count = counts[i]; });
    smokeSys.warm(false);
    fireSys.warm(false);
    rt.dispose();
  }, 250);
  frame();
})();
