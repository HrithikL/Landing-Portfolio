You are the final implementation agent and the most demanding one. You own `js/plane.js`, `js/dogfight.js` and `js/impacts.js`. Do not touch main.js, sound.js, index.html or css/styles.css — they are finished and other agents' work will be lost if you edit them.

Read `CLAUDE.md`, then the vault notes `plane-js.md`, `dogfight-js.md`, `impacts-js.md` under `D:\Claude\Obsidian\Peaceful Pursuit\files\`, then the sources. plane.js is ~4,400 lines — use the vault's line-numbered section maps to navigate, do not read it end to end.

An earlier agent ALREADY fixed the camera tilt and responsive framing in plane.js. Read the current file and `.orchestration/ledger/A2-camera.json` (`result` field) before changing anything near the camera — do not undo that work. Your changes are to flight choreography only.

Context: `window.Flight` in main.js owns the section timeline and calls into plane.js for the transition animation. Two experience modes exist: **peaceful** and **chaotic**.

## Task 1 — Peaceful mode, multi-section jump choreography (the big one)

When the user jumps across MULTIPLE sections at once in peaceful mode, there is a current "performance" animation. REMOVE it and replace it with this exact sequence:

1. The plane takes off from its landing station/podium and flies STRAIGHT INTO THE DEEP CENTRE — straight away from the camera down the centre axis. Not veering left, not veering right.
2. As it flies into the deep centre, ENEMY PLANES approach from the deep centre toward the user (i.e. flying out of the vanishing point toward the camera). The main plane must DESTROY ALL of them on its way — every enemy spawned in this phase must be killed before the main plane disappears; none may survive or fly past.
3. The main plane disappears into the sky.
4. HALF A SECOND later (≈500ms), the main plane EMERGES FROM THE MIDDLE OF THE SCREEN, flanked by a SUPPORT GROUP of planes.
5. The support planes must be arranged in a REALISTIC CURVE — an arc/echelon/vee with natural spacing and slight stagger in depth and height. NOT a straight line. This is explicitly called out, so make the curve clearly readable on screen.
6. The support planes SPLIT UP (peel away outward, like a break formation), and the main plane LANDS on the podium of the SELECTED section.

Requirements:
- The whole sequence must be time-bounded and must always terminate with the plane correctly parked on the destination podium, even if the user re-triggers navigation mid-animation. Handle interruption: cancel cleanly, no orphaned enemy planes or support planes left in the scene, no leaked timers or rAF loops.
- Reuse the existing enemy/ambient plane machinery in dogfight.js rather than writing a second plane system. If dogfight.js needs a new entry point (e.g. "spawn N inbound enemies along the centre axis and report when all are destroyed"), add it there cleanly and call it from plane.js.
- Kills must use the existing weapons/explosion FX so it looks consistent with the rest of the site.
- Respect the effects volume/mute state via `window.Sfx` — do not play sound directly.

## Task 2 — Chaotic mode landing animation

When landing on a new section in chaotic mode, the automatic animation should feature the airplane engaging incoming enemies (pilots, other planes) for UP TO 15 SECONDS.
- It should DEFAULT to shooting the menus — the plane's fire should be directed at the on-screen menu items.
- RESTORE the animation where BULLET HOLES POP UP ON THE MENU ITEMS. impacts.js already implements bullet holes/tracers punched into page content — find why it is no longer firing on menu items during section landings and restore that behaviour, extending impacts.js if the menu elements are not currently valid targets.
- Cap the engagement at 15 seconds hard, then settle onto the podium. It must never strand the user in a permanent dogfight.
- The user must still be able to interrupt by navigating; same cleanup rules as Task 1.

## Constraints
- Three.js r128, no build step, no new dependencies.
- Match each file's existing style and comment voice.
- `node --check` must pass for all three files you touch.
- Performance: this site already runs a 3D scene plus canvas sky plus Web Audio. Do not spawn unbounded geometry; pool/reuse plane instances the way the existing code does.
- Do NOT regress the camera/podium levelling or responsive framing done by the earlier agent.

When done, output: (1) the peaceful sequence's phase timeline with durations, (2) what you added to dogfight.js and its signature, (3) how you restored bullet holes on menus, (4) your interruption/cleanup strategy, (5) performance notes, (6) what to visually verify.
