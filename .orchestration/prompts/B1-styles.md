You are the ONLY agent editing `css/styles.css` this wave. You may ONLY edit `css/styles.css`. Do not touch index.html, or any JS file.

A previous agent has just restructured `index.html` and `js/content.js` (credits accordions, a standalone Experience button, two volume sliders, About container fixes). READ THE CURRENT index.html BEFORE STYLING — the markup on disk is the contract, not your assumptions. Also read `.orchestration/ledger/A3-markup.json` (the `result` field) which lists the exact new class names that agent introduced.

Read `CLAUDE.md`, `D:\Claude\Obsidian\Peaceful Pursuit\files\styles-css.md`, and `D:\Claude\Obsidian\Peaceful Pursuit\Design-Language.md` (the Solar Pop token system — use EXISTING tokens, do not invent new colours or radii).

Reference screenshots (Read them): `assets/refs/current-credits.png`, `assets/refs/current-about-cutoff.png`, `assets/refs/current-dark-main.png`, `assets/refs/current-sound-panel.png`.

## Task 1 — Navigation active state: radium gradient text

Currently `.rot.is-active` gets a 2px flare underline (styles.css ~line 310-316).
- REMOVE the underline entirely.
- Instead, highlight the active menu item by applying a bright, shining "radium" gradient strictly TO THE TEXT ITSELF (background-clip: text / text-fill-color: transparent, with an animated gradient position so it shimmers).
- "Radium" = luminous, high-energy, slightly radioactive-green-into-flare feel — but it must still sit inside the Solar Pop palette. Build it from existing tokens plus at most one new luminous accent token defined in `:root` for BOTH themes.
- Must be legible in Sunlit (light) and Dusk (dark). Provide a solid-colour fallback for browsers without background-clip:text.

## Task 2 — Nav bar rainbow border (replaces top loading bar)

There is a top loading bar shown during section transitions (search for the nav progress / `.loader__progress` / nav progress trace around styles.css ~line 320).
- Remove the top loading bar's visual treatment.
- Replace it with a THIN, CONSTANTLY-CHANGING rainbow gradient border that ENVELOPS the whole navigation bar (wraps its full perimeter, following the nav's existing pill/notch silhouette — see `current-dark-main.png` for that shape; it has a notch cut, so a naive 4-sided border will not fit — use a masked/conic gradient border technique that follows the real shape).
- The gradient must animate continuously (slow hue rotation), be thin (roughly 2px), and must not shift layout.
- Expose CSS custom properties on the nav element (e.g. `--nav-border-progress`, `--nav-viz-0` … `--nav-viz-N`, or similar) so that a JS agent can later drive this same border as a live AUDIO VISUALIZER when music plays. Document the exact custom-property contract you expose in your final summary — the JS agent will write to it.
- Also add a `[data-viz="on"]` state on the nav that styles the border in visualizer mode.

## Task 3 — Planes pass cleanly behind content

Planes flying behind the menu screens and information sections are currently faded/blurred, and the blur edges look inconsistent and unrealistic.
- Find the mask/backdrop-filter/gradient-fade treatment responsible and REMOVE the fading and blurring of planes behind text.
- Planes must pass cleanly and fully visible behind the content. Keep text legible by other means (the panel's own solid/near-solid surface), NOT by blurring what is behind it in a soft-edged way.
- Audit for `backdrop-filter`, `mask-image`, `-webkit-mask`, and any `filter: blur()` on panel/section wrappers.

## Task 4 — Credits accordions

Style the new accordion markup: collapsed shows only section titles; expanded reveals content. Smooth height transition, clear affordance (chevron/plus that rotates), no overlap, nothing cut off, works in both themes. Fix the jagged/overlapping layout visible in `current-credits.png`.

## Task 5 — About screen containers

Fix the container/text cut-off seen in `current-about-cutoff.png`. Remove fixed heights that clip, let tiles grow, ensure long list items wrap instead of clipping, and make the sheet body scroll properly if content exceeds the viewport.

## Task 6 — Global responsive scaling (IMPORTANT)

Scaling the window down currently leaves too much empty vertical space and makes everything feel small.
- Rework the responsive strategy so UI elements dynamically use the FULL screen width and height.
- Prefer fluid techniques: `clamp()` on type and spacing keyed to both `vw` and `vh`, container queries where useful, and flexible grids that reflow rather than just shrink.
- Audit existing breakpoints; a fixed max-width that strands space on wide screens or a desktop-derived min-height that strands space when short should both go.
- Do NOT scale the 3D canvas here — a separate agent handles the plane's camera framing in plane.js.

## Task 7 — Volume sliders

NOTE: the Sound dropdown is generated at RUNTIME by `js/sound.js`, not present in index.html. A parallel agent is adding two range inputs there: `#vol-music` and `#vol-vfx`, both with class `.vol-slider`, each with a `<label>` and a visible value readout, replacing the old Experience block in that dropdown. Style them by those class/id names — do not expect to find them in index.html.

Style the two new 0–100 range inputs (music, VFX) to match Solar Pop: pill track, flare-coloured fill, round thumb with the warm shadow treatment, visible value readout, accessible focus ring. Cross-browser (`::-webkit-slider-thumb` and `::-moz-range-thumb`).

## Task 8 — Standalone Experience button

Style the new nav Experience button as a sibling of Sound, matching the existing nav button language, with a clear visual difference between its Peaceful and Chaotic states.

## Constraints
- ONE file. It is ~103KB / ~1517 lines — keep it organised in its existing section order and comment voice; append new blocks near their related existing block, not all at the bottom.
- Use existing `:root` tokens. At most ONE new token (the radium accent), defined for both themes.
- No new dependencies, no preprocessor.
- Sanity check you have not broken the file: the brace count must balance and no rule may be left unterminated.

When done, output: (1) the exact CSS custom-property contract for the nav visualizer, (2) what you removed for the plane-blur fix, (3) your responsive strategy in 2 lines, (4) risks, (5) what to visually verify.
