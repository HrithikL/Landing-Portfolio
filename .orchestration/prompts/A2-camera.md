You may ONLY edit `js/plane.js`. Do not touch any other file.

This is a retry: a previous agent spent its whole budget reading the file and made no edits. DO NOT re-explore the file broadly. The orchestrator has already done the recon and hands you exact coordinates below. Read ONLY the regions named, make the fix, verify, and stop. Budget your turns — go straight to the named line numbers.

Reference screenshot showing the problem: `assets/refs/current-dark-main.png` — the podium disc and plane read as inclined, left side higher than right.

## Recon already done for you (verified, trust these)

- Camera: `js/plane.js:33-35` — `new THREE.PerspectiveCamera(35, 1, .1, 100)`, `camera.position.set(0, 1.4, 14)`, `camera.lookAt(0, 0, 0)`. There is NO camera roll and no `camera.up` override anywhere in the file. So the tilt is NOT a camera roll.
- `const PODIUM_TILT = .12;` — `js/plane.js:1995`. Used in exactly ONE place: `js/plane.js:3021` → `p.rig.rotation.set(PODIUM_TILT, spins[index], 0);` (Euler XYZ, so this is a pitch about world X of ~6.9°, combined with a Y spin).
- `const PODIUM_R = 2.0; // keep in sync with stageLayout() in main.js` — `js/plane.js:1996`.
- Responsive/layout function: `function layout()` at `js/plane.js:2150-2163`, with `addEventListener('resize', layout)` at 2163. It sets `camera.aspect`, `halfH`, `halfW`, `mobile = W < 860`, and `scale` (line 2159), then calls `buildRoutes()`. THIS is the single resize path — extend it, do not add another listener.
- Current scale line 2159: `scale = Flight.layout ? Flight.layout.scale : mobile ? clamp(halfW / 3.6, .45, .8) : clamp(halfW / 5.4, .8, 1.75);`

## Task 1 — Level the podium and plane (front-on view)

PRIMARY HYPOTHESIS (orchestrator's, verify it first): the podium is positioned well off-centre horizontally (the plane sits on the left of the screen — see the screenshot) while the camera looks at world origin `(0,0,0)`. A disc viewed off the camera's optical axis projects to a skewed ellipse and reads as *inclined* even though it is perfectly level in world space. This off-axis perspective skew, not an actual rotation, is the likely cause.

SECONDARY HYPOTHESIS: `PODIUM_TILT = .12` pitch at line 3021 exaggerates the effect.

Do this:
1. Find where the parked podium rig's world position is set (near line 3021 and the `restPts` / rest-position machinery) and determine its actual x offset.
2. Fix so the podium reads **perfectly straight and viewed exactly from the front** on EVERY section. Choose the least invasive correct fix and justify it:
   - Preferred: make the camera actually look at the parked podium's centre (so the podium is on-axis) rather than at world origin — or equivalently use an off-centre projection / adjust `camera.lookAt` per parked position. Beware: `toScreen`, `unproject` helpers and the route maths at lines 1685-1686, 2374-2377, 2972, 3338 all assume the current camera; if you change the camera target, re-verify those still work.
   - And/or reduce `PODIUM_TILT` toward 0 so the deck is level.
3. The plane's intentional banking DURING flight must be preserved. Only the resting/podium framing must be level.
4. Apply consistently across all sections — check whether per-section offsets exist and audit each.

## Task 2 — Responsive framing

When the viewport scales down the plane gets too small and leaves dead vertical space.
- Modify `layout()` (line 2150) only. Make the framing derive from BOTH viewport dimensions, not just `halfW`: the current `scale` formula at 2159 keys off width alone, which is exactly why short/narrow viewports strand vertical space.
- On narrow/portrait viewports the plane should scale UP relative to the viewport and the composition should use available height.
- Note line 2159 honours `Flight.layout.scale` from main.js when present — do not break that contract; improve only the fallback branch, or if you change the contract, say so loudly in your summary because another agent owns main.js.

## Constraints
- Three.js r128, no build step, no new dependencies, match existing style/comment voice.
- `node --check js/plane.js` must pass.
- Do NOT touch flight choreography (peaceful/chaotic animations) — a later agent owns that.
- Do not rewrite large regions. Surgical edits only.

Output 5 lines: confirmed root cause, exact fix, responsive strategy, risk, what to visually verify.
