You are one of two agents working in parallel. YOU MAY ONLY EDIT `js/main.js`. Do not touch sound.js, plane.js, css/styles.css or index.html — other agents own those.

Read `CLAUDE.md`, `D:\Claude\Obsidian\Peaceful Pursuit\files\main-js.md`, then the source. `window.Flight` (the section/scroll timeline) lives here.

Earlier agents have already changed things you depend on. BEFORE you code:
- Read the CURRENT `index.html` — an agent added a standalone nav Experience button (`data-experience-toggle`, `data-mode`) and two range inputs `#vol-music` / `#vol-vfx`, and removed the Experience block from the Sound dropdown.
- Read `.orchestration/ledger/B1-styles.json` (`result` field) for the EXACT CSS custom-property contract the stylesheet exposes for the nav rainbow border / visualizer. You must drive those exact property names.

## Task 1 — Scroll threshold (2–3 distinct scroll actions)

The automatic scroll trigger fires too eagerly, causing accidental navigation. Around main.js line 320 there is the wheel/touch input handling.
- Require 2 to 3 DISTINCT scroll actions before advancing to the next section.
- "Distinct" means discrete gestures, not accumulated delta from one long inertial fling — a single trackpad flick must not satisfy all three. Implement a gesture segmenter: accumulate delta, but only count a NEW action after the input has quiesced (delta ≈ 0) for a short window, or after direction changes.
- Decay the counter if the user stops scrolling for ~1s, so a stale partial count doesn't leak into a later gesture.
- Must feel right on a mouse wheel (discrete clicks), a trackpad (continuous), and touch. Tune per input type — `input()` already distinguishes 'wheel' vs 'touch'.
- Optional but nice: surface the accumulating progress to CSS (a custom property) so the nav border can hint at it. Only if the CSS contract from B1 supports it.

## Task 2 — Block scroll navigation over info tiles

Completely disable the scroll-to-navigate trigger while the pointer is hovering an information tile.
- Identify the info tiles (agenda tiles on home, news cards, resource shelves, about sheet tiles, credits accordions) and suppress section advancement while hovered.
- Prefer a robust approach: mark the scroll-blocking containers with a single data attribute / class and test `event.target.closest(...)` in the wheel handler, rather than attaching dozens of hover listeners.
- Inner scrollable content must still scroll normally — only the section JUMP is disabled.
- Handle pointer leaving the tile mid-gesture, and touch as well as mouse.

## Task 3 — Nav rainbow border driver (replaces top loading bar)

The top loading bar for section transitions is being removed (CSS agent removed its styling).
- Remove the JS that drives the old top loading bar. Do not leave orphaned timers or dead DOM writes.
- Drive the new nav rainbow border instead, using the exact custom properties B1 exposed.
- During a section transition the border should express transition progress; at rest it just runs its slow continuous hue animation (which is pure CSS — do not fight it from JS).

## Task 4 — Experience toggle wiring

- Wire the new standalone nav Experience button.
- It must DEFAULT to whatever the user selected on the loader screen (`data-mode="peaceful"` / `"chaotic"` from the mode cards).
- Clicking toggles to the alternative mode and applies it live — the same code path the loader's mode cards already use. Find that function and reuse it; do not duplicate mode-switching logic.
- Keep the button's label/`data-mode`/`aria-pressed` in sync with the actual mode, including when mode is changed from anywhere else.

## Constraints
- Plain JS, no dependencies, match existing style and comment voice.
- `node --check js/main.js` must pass.
- Do NOT edit the flight choreography — a later agent owns the peaceful/chaotic animations in plane.js.

When done, output: (1) how you segmented gestures and the final thresholds per input type, (2) the selector/attribute you used for scroll-blocking tiles (the CSS agent may need to know), (3) what you removed with the loading bar, (4) risks.
