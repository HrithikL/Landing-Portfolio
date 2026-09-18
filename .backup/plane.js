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

  const maxDpr = Math.min(devicePixelRatio, 1.75);
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
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -.0006;
  key.shadow.normalBias = .03;
  key.shadow.radius = 3;
  const rim = new THREE.DirectionalLight(col(0xFFC996), .9);
  rim.position.set(-7, 3, -5);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(col(0xDDE6FF), .35);
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
    orange: phys({ color: col(0xF26A12), roughness: .32, clearcoat: 1, clearcoatRoughness: .12, emissive: col(0x3A1400) }),
    orangeIn: phys({ color: col(0xE0600F), roughness: .4, clearcoat: .6, side: THREE.DoubleSide }),
    red: phys({ color: col(0xA51E26), roughness: .36, clearcoat: .9, clearcoatRoughness: .15 }),
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

  function makePilot(fur) {
    const p = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.SphereGeometry(.13, 18, 12), M.leather);
    torso.scale.set(1, .8, 1.1);
    const head = new THREE.Mesh(new THREE.SphereGeometry(.105, 22, 16), fur);
    head.position.y = .15;
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(.06, 16, 12), M.face);
    muzzle.scale.set(.8, .75, 1.1);
    muzzle.position.set(.085, .12, 0);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(.112, 22, 14, 0, Math.PI * 2, 0, Math.PI / 1.85), M.leather);
    helmet.position.y = .16;
    helmet.rotation.z = .3;
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(.085, .03, 8, 20), M.orange);
    scarf.rotation.x = Math.PI / 2;
    scarf.position.y = .06;
    p.add(torso, head, muzzle, helmet, scarf);
    [-1, 1].forEach(s => {
      const lens = new THREE.Mesh(new THREE.TorusGeometry(.03, .011, 8, 18), M.brass);
      lens.rotation.y = Math.PI / 2;
      lens.position.set(.088, .19, s * .042);
      const glassDisc = new THREE.Mesh(new THREE.CircleGeometry(.026, 16), M.glass);
      glassDisc.rotation.y = Math.PI / 2;
      glassDisc.position.set(.09, .19, s * .042);
      const ear = new THREE.Mesh(new THREE.SphereGeometry(.03, 10, 8), M.face);
      ear.position.set(-.01, .15, s * .105);
      p.add(lens, glassDisc, ear);
    });
    const strap = new THREE.Mesh(new THREE.TorusGeometry(.108, .01, 6, 30), M.leather);
    strap.position.y = .19;
    strap.rotation.x = Math.PI / 2;
    p.add(strap);
    return p;
  }

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
    const bc = [], cBlack = col(0x16130F), cOrange = col(0xF26A12);
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

    // Tandem cockpits with two goggled aviators
    [[-.22, .36], [-.78, .26]].forEach(([x, y], k) => {
      const rimMesh = add(new THREE.Mesh(new THREE.TorusGeometry(.17, .035, 12, 36), M.leather), x, y);
      rimMesh.rotation.x = Math.PI / 2;
      add(new THREE.Mesh(new THREE.CircleGeometry(.16, 24), M.rubber), x, y - .01).rotation.x = -Math.PI / 2;
      const pilot = makePilot(k ? M.fur : M.leather);
      pilot.position.set(x - .02, y + .02, 0);
      root.add(pilot);
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
    return { root, prop, blur, pipes, wheels, guns, rack, pilotHead: new V3(-.24, .74, 0) };
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

  // ---------- Exhaust puffs ----------
  const puffGeo = new THREE.SphereGeometry(.11, 12, 8);
  const puffs = Array.from({ length: 40 }, () => {
    const m = new THREE.Mesh(puffGeo, new THREE.MeshStandardMaterial({ color: col(0xF8F1E6), roughness: 1, transparent: true, opacity: 0, depthWrite: false }));
    m.visible = false;
    m.userData = { life: 0, max: 1, vel: new V3() };
    scene.add(m);
    return m;
  });
  let puffCursor = 0;
  function spawnPuff(worldPos, back, speed) {
    const p = puffs[puffCursor++ % puffs.length];
    const d = p.userData;
    p.position.copy(worldPos);
    d.vel.copy(back).multiplyScalar(speed);
    d.vel.x += (Math.random() - .5) * .3;
    d.vel.y += .35 + Math.random() * .3;
    d.vel.z += (Math.random() - .5) * .3;
    d.life = 0;
    d.max = .9 + Math.random() * .7;
    d.base = .5 + Math.random() * .5;
    p.visible = true;
  }

  // ---------- Clouds ----------
  const cloudMat = new THREE.MeshStandardMaterial({ color: col(0xFFF9F0), roughness: 1, transparent: true, opacity: .55, depthWrite: false });
  const cloudGeo = new THREE.SphereGeometry(1, 16, 10);
  const clouds = Array.from({ length: 5 }, (_, i) => {
    const g = new THREE.Group();
    const n = 4 + (i % 3);
    for (let k = 0; k < n; k++) {
      const s = new THREE.Mesh(cloudGeo, cloudMat);
      const r = .45 + Math.random() * .45;
      s.scale.set(r * 1.2, r * .85, r);
      s.position.set((k - n / 2) * .7 + Math.random() * .2, Math.random() * .35 - (k === 0 || k === n - 1 ? .15 : 0), Math.random() * .3);
      g.add(s);
    }
    g.userData = { speed: .12 + Math.random() * .18, baseY: (i / 5) * 2 - 1, par: .6 + Math.random() * .8, x: (Math.random() * 2 - 1), size: .8 + Math.random() * .6 };
    g.position.z = -26 - Math.random() * 8;
    scene.add(g);
    return g;
  });

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
    smoke: canvasTex(256, 256, (g, S) => billow(g, S, 24, .09, .16, [[0, .85, 255], [.6, .75, 225], [.85, .45, 200], [1, 0, 190]])),
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

  // Navigation lights, strobe, beacon and a landing light: switched on at night
  const lightSprite = (color, size, x, y, z) => {
    const sp = new THREE.Sprite(fxMat(THREE.SpriteMaterial, { map: fxTex.glow, color: col(color), blending: ADD, opacity: 0 }));
    sp.position.set(x, y, z);
    sp.scale.setScalar(size);
    sp.visible = false;
    model.root.add(sp);
    return sp;
  };
  const planeLights = [
    { sp: lightSprite(0xFF2A2A, .6, .32, .66, -1.98), mode: 'steady' },     // port wingtip (red)
    { sp: lightSprite(0x2BFF6A, .6, .32, .66, 1.98), mode: 'steady' },      // starboard wingtip (green)
    { sp: lightSprite(0xFFFFFF, .45, -1.92, .48, 0), mode: 'steady' },       // tail
    { sp: lightSprite(0xFFFFFF, 1.3, .3, .74, 0), mode: 'strobe' },          // top-wing strobe
    { sp: lightSprite(0xFF3B30, .7, -.35, -.46, 0), mode: 'beacon' },        // belly beacon
    { sp: lightSprite(0xFFE9C4, .9, .78, -.22, .95), mode: 'landing' },      // landing lights on the lower wing
    { sp: lightSprite(0xFFE9C4, .9, .78, -.22, -.95), mode: 'landing' },
  ];
  const landingLight = new THREE.SpotLight(col(0xFFE2B8), 0, 16, .55, .55, 1.3);
  landingLight.position.set(.9, -.2, 0);
  landingLight.target.position.set(6, -2.6, 0);
  model.root.add(landingLight, landingLight.target);
  const beamTex = canvasTex(64, 256, (g, W, H) => {
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, 'rgba(255,255,255,.9)');
    gr.addColorStop(.3, 'rgba(255,255,255,.35)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
  });
  const beamGeo = new THREE.ConeGeometry(1.25, 5, 32, 1, true);
  beamGeo.translate(0, -2.5, 0);
  beamGeo.rotateZ(Math.PI / 2);                       // apex at the light, opening forward (+X)
  beamGeo.rotateZ(-.42);                              // tipped down towards the deck
  const beam = new THREE.Mesh(beamGeo, fxMat(THREE.MeshBasicMaterial, { map: beamTex, color: col(0xFFE2B8), blending: ADD, opacity: 0, side: THREE.DoubleSide }));
  beam.position.set(.9, -.2, 0);
  beam.visible = false;
  model.root.add(beam);

  function updatePlaneLights(k) {
    const on = k > .01;
    const t = time;
    planeLights.forEach(({ sp, mode }) => {
      sp.visible = on;
      if (!on) return;
      let v = 1;
      if (mode === 'strobe') { const u = t % 1.3; v = u < .05 || (u > .13 && u < .18) ? 1 : 0; }
      else if (mode === 'beacon') v = Math.pow(.5 + .5 * Math.sin(t * 5.5), 3);
      else if (mode === 'landing') v = .9 + Math.random() * .1;
      sp.material.opacity = k * v;
    });
    landingLight.intensity = k * 2.6;
    beam.visible = on;
    beam.material.opacity = k * .1;
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
  const trail = pool(360, () => new THREE.Sprite(fxMat(THREE.SpriteMaterial, { map: fxTex.smoke, opacity: 0, toneMapped: true })));

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
  const RUNWAY_LIGHTS = [];
  for (let i = 0; i < 28; i++) RUNWAY_LIGHTS.push({ a: i / 28 * Math.PI * 2, r: .845, color: 0x8FC8FF });
  for (let i = 0; i < 16; i++) RUNWAY_LIGHTS.push({ a: i / 16 * Math.PI * 2 + .1, r: .5, color: 0xFFB347 });
  function makePodium() {
    const uniforms = { uBurn: { value: 1 }, uSweep: { value: new THREE.Vector2(0, -1) } };
    const top = withBurn(new THREE.MeshStandardMaterial({ map: podiumMap, bumpMap: podiumMap, bumpScale: .1, roughness: .9 }), uniforms);
    const side = withBurn(new THREE.MeshStandardMaterial({ color: col(0xBFAA8A), roughness: .8 }), uniforms);
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
    // runway lights, shown at night
    const lights = new THREE.Group();
    RUNWAY_LIGHTS.forEach(l => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col(l.color), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, opacity: 0 }));
      sp.position.set(Math.cos(l.a) * l.r, .012, Math.sin(l.a) * l.r);
      sp.scale.setScalar(.075);
      sp.userData = l;
      lights.add(sp);
    });
    lights.visible = false;
    rig.add(lights);
    rig.visible = false;
    scene.add(rig);
    return { rig, mesh, shade, contacts, under, lights, uniforms, index: -1, lastBurn: 1 };
  }
  const podiums = [makePodium(), makePodium()];

  // ---------- Flight routes ----------
  // Each hop has a route for scrolling down and one for scrolling up. Both recede into the distance
  // (the plane shrinks) and come back, so the whole plane stays on screen. It always faces its travel direction.
  let halfW = 1, halfH = 1, scale = 1, mobile = false;
  let restPts = [], downRoutes = [], upRoutes = [];

  function route(points, endSide) {
    const start = points[0], end = points[points.length - 1];
    const pre = start.clone().add(start.clone().sub(points[1]).multiplyScalar(.5));
    const post = end.clone().add(new V3(-endSide * .35 * halfW, 0, 1.2));
    return new THREE.CatmullRomCurve3([pre, ...points, post], false, 'centripetal', .5);
  }

  function buildRoutes() {
    const n = Flight.sides.length;
    const sx = i => (Flight.sides[i] === 'left' ? 1 : -1);   // plane sits opposite the content
    const RX = mobile ? .3 : .5;
    const RY = mobile ? .5 : -.04;
    const Y = v => (RY + v) * halfH;
    restPts = Flight.sides.map((_, i) => new V3(sx(i) * RX * halfW, Y(0), 0));
    downRoutes = [];
    upRoutes = [];
    for (let i = 0; i < n - 1; i++) {
      const A = restPts[i], B = restPts[i + 1], a = sx(i), b = sx(i + 1);
      // Scrolling down: slip away low into the distance, swing across, glide back in to land
      downRoutes.push(route([
        A,
        new V3(a * .06 * halfW, Y(-.12), -6),
        new V3(b * .04 * halfW, Y(-.26), -24),
        new V3(b * .62 * halfW, Y(-.1), -8),
        B,
      ], b));
      // Scrolling up: the mirror image, climbing gently above centre
      upRoutes.push(route([
        B,
        new V3(b * .06 * halfW, Y(.14), -6),
        new V3(a * .04 * halfW, Y(.3), -24),
        new V3(a * .62 * halfW, Y(.12), -8),
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
    scale = mobile ? clamp(halfW / 3.6, .45, .8) : clamp(halfW / 5.4, .8, 1.5);
    buildRoutes();
    clouds.forEach(c => c.scale.setScalar(c.userData.size * (mobile ? 1 : 1.8)));
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
  const addSpin = amount => { spinTargets[parkedAt] += amount; };
  // Mini-game aiming (yaw uses the same convention as yawOf: north = +90°)
  const TAU = Math.PI * 2, NORTH = Math.PI / 2, AIM_RANGE = 1.15;
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
  if (hintText) hintText.innerHTML = `${matchMedia('(hover: none)').matches ? 'Swipe' : 'Scroll'} sideways to spin <b>· face north to play</b>`;
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
  let time = 0, rpm = 12, puffAcc = 0, intro = 0, first = true;
  let travelDir = 1, routeMix = 0;
  let hudTimer = 0, slowFrames = 0, fastFrames = 0, hintShown = false, shadowWas = true, soundTimer = 0, hitShake = 0;

  const yawOf = v => Math.atan2(-v.z, v.x);
  const wrapPi = a => Math.atan2(Math.sin(a), Math.cos(a));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const poseYawFor = i => (Flight.sides[i] === 'left' ? -Math.PI + .32 : -.32);
  const toScreen = v => { proj.copy(v).project(camera); return { x: (proj.x + 1) / 2 * innerWidth, y: (1 - proj.y) / 2 * innerHeight }; };

  // Position on the blended down/up route for hop `ti` at scroll progress `te` (5 route points → u = (1 + 4t) / 6)
  function sampleRoute(ti, te, out) {
    const t = clamp(te, 0, 1);
    downRoutes[ti].getPoint((1 + 4 * t) / 6, out);
    upRoutes[ti].getPoint((1 + 4 * (1 - t)) / 6, tmpE);
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
  const rollAt = u => Math.pow(smooth(.04, .15, u), 2) * .9 + Math.max(0, u - .15) * 1.3;   // in podium radii-ish units
  const climbAt = u => smooth(.1, .34, u) * 2.2 + Math.max(0, u - .34) * 3;
  // World yaw of a route's first leg (departure) or last leg (arrival)
  const legYaw = (curve, arriving) => {
    const pts = curve.points;
    return arriving ? yawOf(tmpC.subVectors(pts[5], pts[4])) : yawOf(tmpC.subVectors(pts[2], pts[1]));
  };

  function placePodium(p, index, burn, sPlane, introE) {
    if (p.index !== index) { p.index = index; p.lastBurn = burn; }   // re-used for another section: no stray embers
    p.rig.visible = burn < .999;
    const R = 2.35 * scale * introE, T = 1.6 * scale * introE;
    const top = .04 * T;
    const rest = restPts[index];
    p.rig.position.set(rest.x, rest.y - top - groundHeight(GROUND_PITCH) * sPlane, rest.z);
    p.rig.rotation.set(PODIUM_TILT, spins[index], 0);
    p.rig.updateMatrixWorld(true);
    p.mesh.scale.set(R, T, R);
    p.top = top;
    p.uniforms.uBurn.value = burn;
    const solid = (1 - smooth(0, .4, burn)) * Math.min(1, intro * 2);
    p.under.position.set(.12 * R, -top * 1.5 - .25 * T, .1 * R);
    p.under.scale.set(R * 2.9, R * 2.9, 1);
    p.under.material.opacity = solid * (.32 + night.k * .25);
    p.lights.visible = night.k > .01 && burn < .98;
    if (p.lights.visible) {
      p.lights.position.y = top;
      p.lights.scale.setScalar(R);
      p.lights.children.forEach((sp, k) => {
        const l = sp.userData;
        const chase = .45 + .55 * Math.pow(Math.max(0, Math.sin(l.a * (l.r > .7 ? 2 : -2) - time * 4)), 6);
        sp.material.opacity = night.k * solid * (l.r > .7 ? chase : .65 + .35 * Math.sin(time * 2 + k));
      });
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

  function fireGun(gn) {
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
    d.life = 0;
    d.lastHead = 0;
    d.game = gameFiring;
    d.dir.copy(forward);
    d.dir.y = 0;
    d.dir.normalize();
    if (d.game) {
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
      if (Impacts && parkedAt > 0 && Math.random() < .5) aimAtCard(d);
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

  // Try to land this bullet on an empty patch of a card; re-aims it so its screen path ends on the hole
  function aimAtCard(d) {
    let range = d.speed * d.max;
    if (d.dir.z > 1e-3) range = Math.min(range, (camera.position.z - 4 - d.start.z) / d.dir.z);
    if (range < 1) return;
    fxB.copy(d.start).addScaledVector(d.dir, range);
    if (!inFront(d.start) || !inFront(fxB)) return;
    const a = toScreen(d.start), b = toScreen(fxB);
    const hit = Impacts.findHit(parkedAt, a.x, a.y, b.x, b.y);
    if (!hit) return;
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
          Impacts.hole(d.hit, d.dir);
          if (sfx) sfx.impact(d.hit.x / innerWidth * 2 - 1);
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
    pickTarget(m.pos, forward, m.target);
    salvoTimer = 1.1;
  }

  function spawnTrail(p, hot, k = 1, dark = false) {
    const s = trail.next();
    const d = s.userData;
    s.position.copy(p);
    d.vel.set((Math.random() - .5) * .3, .25 + Math.random() * .3, (Math.random() - .5) * .3).multiplyScalar(scale * k);
    d.life = 0;
    d.max = (dark ? 1.4 : .9) + Math.random() * .6;
    d.size = scale * k * (.7 + Math.random() * .5);
    d.hot = hot;
    d.dark = dark;
    s.material.rotation = Math.random() * Math.PI * 2;
    s.visible = true;
  }

  function finishMissile(m, p) {
    m.active = m.g.visible = false;
    if (m.onHit) m.onHit(p.clone());
    else explode(p);
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
    for (const s of trail) {
      if (!s.visible) continue;
      const d = s.userData;
      d.life += dt;
      const t = d.life / d.max;
      if (t >= 1) { s.visible = false; continue; }
      s.position.addScaledVector(d.vel, dt);
      s.scale.setScalar(d.size * (.18 + t * (d.dark ? 1 : .7)));
      if (d.dark) {
        s.material.opacity = (1 - t) * .55 * Math.min(1, t * 10);
        s.material.color.copy(cSmoke0).lerp(cSmoke1, t);
      } else {
        s.material.opacity = (1 - t) * .5 * Math.min(1, t * 12);
        s.material.color.copy(cSmoke1).lerp(cMid, d.hot ? Math.max(0, .5 - t * 3) : 0);
      }
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
      });
      [[e.sparks, 14, .9], [e.dirt, 12, 1.3]].forEach(([b, grav, life]) => {
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
    THREE, scene, camera, col, fxTex, fxMat, explode, spawnMissile, spawnTrail, sfx,
    getScale: () => scale, isMobile: () => mobile, sides: Flight.sides, panOf, getNight: () => night.k, glowTex: fxTex.glow,
    onPlayerHit: at => {
      hitShake = 1;
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
  const aimPoint = (from, yaw, out) => out.set(from.x + Math.cos(yaw) * 22, from.y + 2.2 * scale, from.z - Math.sin(yaw) * 22);
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
      key: col(0xFFFFFF), keyI: 1.85, rim: col(0xFFC996), rimI: .9, fill: col(0xDDE6FF), fillI: .3,
      cloud: col(0xFFF9F0), cloudOp: .55, puff: col(0xF8F1E6), trim: col(0x3A1400), trimIn: col(0x000000), red: col(0x000000),
      paint: .24, env: .75,
    },
    night: {
      exposure: 1.0, hemiSky: col(0x2E3F66), hemiGround: col(0x06070B), hemi: .55,
      key: col(0xA9C1FF), keyI: 1.2, rim: col(0xFF7A33), rimI: .75, fill: col(0x4455A0), fillI: .28,
      cloud: col(0x283248), cloudOp: .62, puff: col(0x6A7288), trim: col(0xFF5A10), trimIn: col(0x9A3208), red: col(0x6A0A12),
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
  missiles.forEach(m => glowMats.push(m.flame.material));
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
    cloudMat.color.copy(D.cloud).lerp(N.cloud, k);
    cloudMat.opacity = mix(D.cloudOp, N.cloudOp, k);
    puffs.forEach(pf => pf.material.color.copy(D.puff).lerp(N.puff, k));
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
  if (/[?&]debug\b/.test(location.search)) window.__plane = { THREE, scene, camera, renderer, plane, model, explode, dogfight, podiums, game, spins, spinTargets, aim, step: d => step(d) };

  function frame() {
    requestAnimationFrame(frame);
    step(clock.getDelta());
  }

  function step(rawDt) {
    const dt = Math.min(rawDt, .05);
    time += dt;

    // Adaptive resolution: drop pixel ratio if frames run long, restore when there's headroom
    if (rawDt > .024) { slowFrames++; fastFrames = 0; } else if (rawDt < .018) { fastFrames++; slowFrames = 0; }
    if (slowFrames > 12 && dpr > 1) { dpr = Math.max(1, dpr - .25); renderer.setPixelRatio(dpr); slowFrames = 0; }
    if (fastFrames > 300 && dpr < maxDpr) { dpr = Math.min(maxDpr, dpr + .25); renderer.setPixelRatio(dpr); fastFrames = 0; }

    night.k += (night.target - night.k) * Math.min(1, dt * 2.6);
    if (Math.abs(night.target - night.k) < .002) night.k = night.target;
    if (night.k !== night.applied) { applyNight(night.k); night.applied = night.k; }

    const st = Flight.state;
    const n = Flight.sides.length;
    if (n < 2) { renderer.render(scene, camera); return; }

    // Which way are we flying? Latched, so the plane keeps its heading when you pause mid-flight.
    if (st.velocity > 30) travelDir = 1;
    else if (st.velocity < -30) travelDir = -1;
    const ti = Math.min(st.from, n - 2);
    const te = st.from >= n - 1 ? 1 : st.e;
    const mixTarget = travelDir < 0 ? 1 : 0;
    // Routes share their end points, so switching at a rest is invisible; mid-flight it blends
    if (te < .02 || te > .98) routeMix = mixTarget;
    else routeMix += (mixTarget - routeMix) * damp(5, dt);

    const f = Math.sin(Math.PI * te);                  // flight intensity 0 → 1 → 0
    const lp = te + (1 - 2 * te) * routeMix;           // progress along the route actually flown
    parkedAt = te < .5 ? ti : ti + 1;
    for (let k = 0; k < n; k++) spins[k] += (spinTargets[k] - spins[k]) * damp(9, dt);

    if (document.body.classList.contains('is-loaded')) intro = Math.min(1, intro + dt / 1.6);
    const introE = intro < 1 ? 1 - Math.pow(1 - intro, 4) * Math.cos(intro * 7) : 1;
    const sPlane = scale * Math.max(.001, introE);

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
    mouse.sx += (mouse.x - mouse.sx) * damp(4, dt);
    mouse.sy += (mouse.y - mouse.sy) * damp(4, dt);
    euler.set(roll + Math.sin(time * 1.3) * .05 * cruise, heading, pitch + Math.sin(time * 1.1) * .03 * cruise);
    airQ.setFromEuler(euler);
    targetQ.copy(airQ);

    // --- Podiums: the one being left burns away once the plane is clear; the next one assembles before touchdown ---
    // Both depend only on scroll position, so reversing mid-hop simply plays the same moment backwards.
    let podA = podiums.find(q => q.index === ti);
    let podB = podiums.find(q => q.index === ti + 1 && q !== podA);
    if (!podA) podA = podiums.find(q => q !== podB);         // keep each rig on the section it already shows
    if (!podB) podB = podiums.find(q => q !== podA);
    placePodium(podA, ti, smooth(.16, .36, te), sPlane, Math.max(.001, introE));
    placePodium(podB, ti + 1, smooth(.16, .36, 1 - te), sPlane, Math.max(.001, introE));
    const nearA = te <= .5;
    const p = nearA ? podA : podB;
    const u = nearA ? te : 1 - te;
    // Leaving a podium rolls out ahead (+1); landing rolls in from behind (-1). Blended with the route so a
    // change of direction mid-take-off turns smoothly into a landing.
    const leaving = nearA ? 1 - routeMix : routeMix;
    const rollSign = leaving * 2 - 1;
    const headDown = legYaw(downRoutes[ti], !nearA);        // down route leaves A, lands on B
    const headUp = legYaw(upRoutes[ti], nearA);             // up route leaves B, lands on A
    groundPose(p, u, rollSign, sPlane, headDown + wrapPi(headUp - headDown) * routeMix);
    const groundW = 1 - smooth(.18, .42, u);
    (nearA ? podB : podA).shade.material.opacity = 0;
    (nearA ? podB : podA).contacts.forEach(m => { m.material.opacity = 0; });
    const nearDepart = nearA ? travelDir > 0 : travelDir < 0;   // for the HUD label
    pos.lerp(groundPos, groundW);
    targetQ.slerp(groundQ, groundW);
    const parked = u < .005;

    // Shadow camera follows the nearest podium; the map only re-renders while the plane is near it
    // (plus one last pass once it has left, which clears the old shadow)
    const shadowR = 2.35 * scale * 1.35, sc = key.shadow.camera;
    if (sc.right !== shadowR) {
      sc.left = sc.bottom = -shadowR;
      sc.right = sc.top = shadowR;
      sc.near = 1;
      sc.far = 60;
      sc.updateProjectionMatrix();
    }
    key.target.position.copy(p.rig.position);
    key.position.copy(p.rig.position).addScaledVector(KEY_DIR, 25);
    const shadowOn = groundW > .001 && p.rig.visible;
    if (shadowOn || shadowWas) renderer.shadowMap.needsUpdate = true;
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
      const show = parked && parkedAt === 0 && intro >= 1 && st.y < 90 && (!game || game.state === 'idle');
      if (show !== hintShown) {
        hintShown = show;
        if (show) placeHint();
        hint.classList.toggle('is-on', show);
      }
    }

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
    const wheelSpin = onWheels ? (parked ? .4 : 2 + taxiRev * .8) : rpm * .12 * (1 + f * 2);
    model.wheels.forEach(w => { w.rotation.z -= wheelSpin * dt; });

    // Engine vibration
    hitShake = Math.max(0, hitShake - dt * 5);
    const vib = .006 + f * .006 + rpm * .00008 + gunGlow * .012 + hitShake * .03;
    model.root.position.set((Math.random() - .5) * vib - gunGlow * .012, onWheels ? 0 : (Math.random() - .5) * vib, (Math.random() - .5) * vib);
    model.root.rotation.x = Math.sin(time * 47) * (onWheels ? .002 : .006);

    updatePlaneLights(night.k);

    // Exhaust
    forward.set(1, 0, 0).applyQuaternion(plane.quaternion);
    back.copy(forward).negate();
    puffAcc += dt * (reduced ? 0 : 6 + f * 20);
    while (puffAcc > 1) {
      puffAcc -= 1;
      const pipe = model.pipes[Math.random() < .5 ? 0 : 1];
      spawnPuff(plane.localToWorld(tmpA.copy(pipe)), back, 1.2 + f * 3);
    }
    for (let k = 0; k < puffs.length; k++) {
      const pf = puffs[k];
      if (!pf.visible) continue;
      const d = pf.userData;
      d.life += dt;
      const t = d.life / d.max;
      if (t >= 1) { pf.visible = false; continue; }
      pf.position.addScaledVector(d.vel, dt);
      d.vel.multiplyScalar(1 - dt * 1.4);
      pf.scale.setScalar(scale * d.base * (.6 + t * 2.6));
      pf.material.opacity = Math.sin(Math.min(1, t * 3) * Math.PI / 2) * (1 - t) * .7;
    }

    plane.updateMatrixWorld(true);
    const gunPos = gunAt(gunV, sPlane);

    // --- Mini-game: face north on the home podium; while it runs, the podium turns to aim ---
    const idleGame = !game || game.state === 'idle';
    if (game) {
      const hdg = ((90 - THREE.MathUtils.radToDeg(yawOf(forward))) % 360 + 360) % 360;
      const off = Math.min(hdg, 360 - hdg);
      game.update(dt, {
        ready: parked && parkedAt === 0 && intro >= 1 && p.rig.visible && st.y < 6,
        facing: off < 20,
        away: off > 40,
        head: toScreen(plane.localToWorld(fxA.copy(model.pilotHead))),
        arena: toScreen(fxB.copy(gunPos).setY(gunPos.y + 2.4 * scale)),
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
    const inRound = !!game && game.firing && parked;
    gameFiring = inRound && game.weapon !== 'missiles';
    missileWait -= dt;
    if (inRound && game.weapon !== 'guns' && missileWait <= 0) {
      if (fireGameMissile(fxD.set(forward.x, 0, forward.z).normalize())) missileWait = game.weapon === 'both' ? .75 : .4;
    }

    // --- Guns: only while parked on a podium with the engine running, in short bursts ---
    parkTime = idleGame && parked && intro >= 1 && !reduced && p.rig.visible ? parkTime + dt : 0;
    const burstT = parkTime - 1.2;
    gunsHot = gameFiring || (burstT > 0 && burstT % 2.9 < 1.25);
    if (gunsHot) {
      shotAcc += dt * (gameFiring ? 16 : 24);
      while (shotAcc > 1) { shotAcc -= 1; fireGun(model.guns[gunCursor++ % model.guns.length]); }
    } else shotAcc = 0;
    updateGuns(dt);

    // --- Rockets: released in flight at set points of the hop, re-armed near a podium ---
    if (ti !== lastHop) { lastHop = ti; lastLp = lp; }
    if (groundW > .9) {
      launchQueue.length = 0;
      model.rack.forEach((r, k) => {
        if (r.state === 'gone') r.load = -k * .07;
        r.state = 'armed';
      });
    } else if (!reduced && intro >= 1 && lp > lastLp) {
      model.rack.forEach((r, k) => {
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
    updateMissiles(dt, sPlane);
    updateExplosions(dt);

    // --- Page impacts (front tracers, bullet holes), background dogfights, engine sound ---
    const settled = parked && intro >= 1 && p.rig.visible;
    if (Impacts) {
      if (settled) Impacts.land(parkedAt);
      Impacts.frame(dt, st.velocity);
    }
    if (dogfight) dogfight.update(dt, settled, parkedAt, { busy: !idleGame, playing: !!game && game.state === 'play', G: gunPos });
    soundTimer += dt;
    if (sfx && soundTimer > .05) {
      soundTimer = 0;
      const dist = plane.position.distanceTo(camera.position);
      sfx.engine(rpm, Math.min(1, intro * 2) * clamp(18 / dist, .3, 1.15), panOf(plane.position));
    }

    // Clouds drift + scroll parallax
    const range = halfH * 3.2;
    for (let k = 0; k < clouds.length; k++) {
      const c = clouds[k], d = c.userData;
      d.x -= d.speed * dt * (1 + f * 3) / Math.max(halfW, 1);
      if (d.x < -1.6) d.x += 3.2;
      c.position.x = d.x * halfW * 2.6;
      const y = d.baseY * range * .5 + (st.y / innerHeight) * d.par * halfH * .6;
      c.position.y = ((((y + range / 2) % range) + range) % range - range / 2) * 2;
    }

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
      if (game && game.state === 'countdown') status = 'Get ready';
      else if (game && game.state === 'play') status = 'Dogfight!';
      else if (gunsHot) status = 'Guns firing';
      else if (salvoTimer > 0 && !onWheels) status = 'Salvo away';
      setHud('status', status);
    }

    renderer.render(scene, camera);
  }
  frame();
})();
