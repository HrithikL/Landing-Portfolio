/* =========================================================
   Background dogfights: small planes duelling far behind the page while our plane sits on a podium.
   Each stop plays a randomly chosen encounter: missile kill, gun kill, head-on collision, mid-air clip,
   mutual kill or an ambushed formation. Liveries, sides, heights and timing are random too, and the
   same encounter never plays twice in a row.
   Everything is drawn in the WebGL layer (behind the content) and hazed towards the page colour.
   plane.js calls Dogfight.create(api) and then update() every frame.
   ========================================================= */
(() => {
  function create(api) {
    const { THREE, scene, camera, col, fxTex, fxMat, explode, spawnMissile, spawnTrail, sfx, getScale, isMobile, sides, panOf } = api;
    const getNight = api.getNight || (() => 0);
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

    // ---------- Liveries (mixed a little towards the page colour so they read as distant) ----------
    const LIVERIES = [
      { body: 0x2F5D8C, wing: 0xF1E3C8, trim: 0xE8B04A },   // navy / cream / gold
      { body: 0x4E7D3A, wing: 0xD9C27A, trim: 0x3A2E26 },   // olive / sand
      { body: 0xB23A48, wing: 0xF3EDE2, trim: 0x1F2A44 },   // crimson / white
      { body: 0x6C4C9C, wing: 0x7CC6B8, trim: 0xF2D16B },   // purple / teal
      { body: 0x2E8C8A, wing: 0xF4F1EA, trim: 0xE4572E },   // teal / white / red
      { body: 0x7E8794, wing: 0x3B5B92, trim: 0xF2F2F2 },   // grey / blue
      { body: 0xE0A526, wing: 0x2B2B2B, trim: 0xC8553D },   // yellow / black
      { body: 0xF2F0EA, wing: 0xC0392B, trim: 0x22313F },   // white / red
      { body: 0x1E3B2F, wing: 0xB8C4A0, trim: 0xE8C547 },   // racing green
    ];
    const HAZE_DAY = col(0xEFE1CA), HAZE_NIGHT = col(0x121827);
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

    // ---------- A simple biplane (nose +X), same proportions as the hero plane ----------
    const along = g => { g.rotateZ(-Math.PI / 2); return g; };
    const G = {
      fuse: along(new THREE.LatheGeometry(
        [[0, -1.6], [.12, -1.45], [.24, -.8], [.36, -.1], [.42, .5], [.42, .95], [.2, 1.05], [0, 1.06]].map(([r, y]) => new THREE.Vector2(r, y)), 14)),
      cowl: along(new THREE.CylinderGeometry(.45, .45, .3, 16, 1, true)),
      spinner: along(new THREE.ConeGeometry(.13, .3, 12)),
      wingTop: new THREE.BoxGeometry(.8, .06, 3.8),
      wingBot: new THREE.BoxGeometry(.74, .06, 3.3),
      tip: new THREE.BoxGeometry(.82, .066, .34),
      tail: new THREE.BoxGeometry(.42, .04, 1.4),
      fin: new THREE.BoxGeometry(.5, .55, .04),
      strut: new THREE.CylinderGeometry(.025, .025, .88, 5),
      wheel: new THREE.CylinderGeometry(.19, .19, .09, 12).rotateX(Math.PI / 2),
      blade: new THREE.BoxGeometry(.05, 1.7, .12),
      disc: new THREE.CircleGeometry(.86, 20).rotateY(Math.PI / 2),
      head: new THREE.SphereGeometry(.13, 10, 8),
      debris: new THREE.BoxGeometry(.5, .06, .34),
    };
    G.cowl.userData.side = true;
    const discMat = new THREE.MeshBasicMaterial({ color: col(0x3A302A), transparent: true, opacity: .16, side: THREE.DoubleSide, depthWrite: false });

    function buildActor() {
      const g = new THREE.Group();
      const body = new THREE.Group();
      g.add(body);
      const parts = { body: [], wing: [], trim: [] };
      const own = () => new THREE.MeshStandardMaterial({ roughness: .6, metalness: .08, transparent: true });
      const mats = { body: own(), wing: own(), trim: own(), dark: own() };
      mats.dark.color.copy(darkMat.color);
      mats.cowl = mats.trim.clone();
      mats.cowl.side = THREE.DoubleSide;
      const add = (geo, role, x, y, z) => {
        const m = new THREE.Mesh(geo, role === 'trim' && geo.userData.side ? mats.cowl : role ? mats[role] : mats.dark);
        m.position.set(x, y, z);
        body.add(m);
        if (role) parts[role].push(m);
        return m;
      };
      add(G.fuse, 'body', 0, 0, 0);
      add(G.cowl, 'trim', 1.0, 0, 0);
      add(G.spinner, 'trim', 1.3, 0, 0);
      add(G.wingTop, 'wing', .3, .66, 0);
      add(G.wingBot, 'wing', .36, -.26, 0);
      add(G.tail, 'wing', -1.35, .06, 0);
      add(G.fin, 'body', -1.35, .36, 0);
      add(G.head, null, -.3, .44, 0);
      [-1, 1].forEach(s => {
        add(G.tip, 'trim', .3, .66, s * 1.73);
        add(G.tip, 'trim', .36, -.26, s * 1.48);
        add(G.strut, null, .12, .2, s * 1.3);
        add(G.strut, null, .52, .2, s * 1.3);
        add(G.strut, null, .45, -.6, s * .38).rotation.x = s * .45;
        add(G.wheel, null, .45, -.98, s * .5);
      });
      const prop = new THREE.Group();
      prop.position.x = 1.2;
      prop.add(new THREE.Mesh(G.blade, mats.dark), new THREE.Mesh(G.disc, discMat));
      body.add(prop);
      const flame = new THREE.Sprite(fxMat(THREE.SpriteMaterial, { map: fxTex.fire, color: col(0xFF7A1A) }));
      flame.position.set(.5, .15, 0);
      flame.visible = false;
      const flash = new THREE.Sprite(fxMat(THREE.SpriteMaterial, { map: fxTex.flash, color: col(0xFFB347) }));
      flash.position.set(1.5, .35, 0);
      flash.visible = false;
      body.add(flame, flash);
      // Navigation lights (night only): red port, green starboard, white tail
      const navLights = [[0xFF2A2A, .3, .66, -1.95, .7], [0x2BFF6A, .3, .66, 1.95, .7], [0xFFFFFF, -1.6, .45, 0, .6]].map(([c, x, y, z, s]) => {
        const sp = new THREE.Sprite(fxMat(THREE.SpriteMaterial, { map: fxTex.glow, color: col(c), blending: THREE.AdditiveBlending, opacity: 0 }));
        sp.position.set(x, y, z);
        sp.scale.setScalar(s);
        sp.visible = false;
        body.add(sp);
        return sp;
      });
      // one mesh per material instead of ~20 (the prop still spins on its own)
      if (api.mergeStatic) api.mergeStatic(body, o => o === prop);
      g.visible = false;
      g.traverse(o => { o.frustumCulled = false; });
      scene.add(g);
      return {
        g, body, prop, parts, mats, flame, flash, navLights, liv: LIVERIES[0], fade: 1,
        pos: new V3(), prev: new V3(), vel: new V3(),
        active: false, alive: false, mode: 'fly', path: null, world: 1,
        seen: false, age: 0, smoke: 0, smokeAcc: 0, roll: 0, spinRate: 0, burnT: 0, fallDur: 1, flashT: 0, seed: 0,
      };
    }
    const actors = Array.from({ length: 12 }, buildActor);

    // Distant planes fade towards the sky colour (beige by day, deep navy at night)
    const hazed = (hex, k) => col(hex).lerp(HAZE.copy(HAZE_DAY).lerp(HAZE_NIGHT, getNight()), k);
    function paint(a, liv, haze = .3) {
      a.liv = liv;
      a.mats.body.color.copy(hazed(liv.body, haze));
      a.mats.wing.color.copy(hazed(liv.wing, haze));
      a.mats.trim.color.copy(hazed(liv.trim, haze));
      a.mats.cowl.color.copy(a.mats.trim.color);
    }
    function setFade(a, f) {
      a.fade = f;
      const o = Math.max(0, f);
      for (const k in a.mats) {
        a.mats[k].opacity = o;
        a.mats[k].depthWrite = o > .95;
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
    function launch(path, liv, size, haze) {
      const a = actors.find(x => !x.active);
      if (!a) return null;
      paint(a, liv, haze);
      a.enemy = false;
      a.foe = false;
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
      if (a.mode === 'fly') {
        const s = a.path(T);
        if (s.w) a.pos.set(s.x, s.y, s.z);
        else stage(s.u, s.v, s.z, a.pos);
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
        } else a.roll = Math.sin(T * 1.3 + a.seed) * .22;
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
      euler.set(a.roll, Math.atan2(-fA.z, fA.x), Math.asin(clamp(fA.y, -1, 1)));
      a.g.quaternion.setFromEuler(euler);
      a.g.position.copy(a.pos);
      a.g.scale.setScalar(a.world);
      a.g.updateMatrixWorld();
      a.prop.rotation.x += 40 * dt;
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
      // ghost out while passing behind the page content, so text stays readable (the jump battle has an empty page)
      fB.copy(a.pos).project(camera);
      const sx = (fB.x + 1) / 2 * innerWidth, sy = (1 - fB.y) / 2 * innerHeight;
      const pad = 36;
      const behind = !a.foe && !!contentBox && sx > contentBox.left - pad && sx < contentBox.right + pad && sy > contentBox.top - pad && sy < contentBox.bottom + pad;
      const want = behind ? .1 : 1;
      if (Math.abs(a.fade - want) > .005) setFade(a, a.fade + (want - a.fade) * Math.min(1, dt * 7));
      // leave the stage once seen and gone off screen (or after a safety timeout)
      if (Math.abs(fB.x) < 1.02 && Math.abs(fB.y) < 1.02) a.seen = true;
      if ((a.seen && (Math.abs(fB.x) > 1.3 || fB.y < -1.25 || fB.y > 1.4)) || a.age > 16) hide(a);
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
      } else if (kind === 'ambush') {
        // A pair in formation; a third plane dives in and shoots the leader, the wingman answers with a missile
        const lead = line(uk, vk - .05, zk, Tm, su * D, 0, .02);
        const w1 = launch(lead, L[0]);
        const w2 = launch(chase(lead, .42, () => -.1, -.6), L[0]);
        const foe = launch(chase(lead, t => lerp(2.4, .62, smooth(0, Tm - 1.3, t)), t => lerp(.6, .05, smooth(Tm - 3, Tm - 1.3, t)) + smooth(Tm + .3, Tm + 2, t) * .3, .5), L[1]);
        ev.push(burst(Tm - 1.35, Tm - .85, .07, () => shoot(foe, w1)));
        ev.push(at(Tm - .85, () => kill(w1, 'burn')));
        ev.push(at(Tm - .55, () => fireMissile(w2, foe, 'blast')));
      }
      // Sometimes a lone plane drifts past far away, just for life
      if (Math.random() < .45) {
        const s = sign();
        launch(line(-s * 1.25, rnd(vLo, vHi), -rnd(26, 30), 0, s * rnd(.18, .26), 0, .02), L[3], .3);
      }
      sc.end = Math.max(...ev.map(e => (e.to || e.t))) + .2;
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
    // They appear far ahead of our plane (which faces north), only on the right half of the screen,
    // in left / centre / right lanes, dive in shooting, then pull up and away over us.
    const GUN = new V3(), aimAt = new V3();
    const arena = { on: false, spawnAcc: 0, t: 0, bounds: [0, 0] };
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
          bearingPoint(mid, 44, 2.2 * s, fA).project(camera);
          if (fA.x < target) lo = mid; else hi = mid;
        }
        return (lo + hi) / 2;
      };
      arena.bounds = isMobile() ? [find(-.8), find(.8)] : side < 0 ? [find(-.92), find(-.06)] : [find(.06), find(.92)];
    }
    function enemyPath(th0, R0, speed, h) {
      const s = getScale();
      const juke = rnd(.03, .1), jw = rnd(.7, 1.5), ph = rnd(0, 6);
      const tb = (R0 - BREAK_R) / speed;
      const side = rnd(.4, 1) * (isMobile() ? sign() : 1);
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
    function spawnEnemy() {
      const r = Math.random();
      const lane = r < .34 ? rnd(.04, .28) : r < .67 ? rnd(.38, .62) : rnd(.72, .96);
      const th = arena.bounds[0] + (arena.bounds[1] - arena.bounds[0]) * lane;
      const hard = Math.min(1, arena.t / 30);
      const speed = rnd(6.5, 8.5) + hard * 3;
      const R0 = rnd(40, 48);
      const a = launch(enemyPath(th, R0, speed, rnd(1.3, 3.1) * getScale()), LIVERIES[Math.floor(Math.random() * LIVERIES.length)], rnd(.5, .6), 0);
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
        const a = launch(path, LIVERIES[livery % LIVERIES.length], size, 0);
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
      clear() { for (const a of actors) if (a.foe) hide(a); },
    };

    // ---------- Director ----------
    let current = null, cooldown = 1.6, bag = [], last = '';
    function nextKind() {
      if (!bag.length) {
        bag = shuffle(KINDS.slice());
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
