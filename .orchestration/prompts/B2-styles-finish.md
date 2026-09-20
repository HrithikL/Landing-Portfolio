You may ONLY edit `css/styles.css`. Do not touch any other file.

A previous Opus agent did most of the stylesheet pass but exhausted its budget before finishing. Its completed work is already committed — DO NOT redo it, and do not restructure anything it wrote. You are finishing exactly two tasks. Be surgical and cheap: do not read the whole 1664-line file, grep to the relevant regions.

Already done (leave alone): radium gradient active nav text, the conic-gradient nav border + `--nav-border-progress` / `--nav-viz-0..7` / `[data-viz="on"]` contract, plane-blur removal, credits accordion styling, About container fixes, fluid `clamp()` scaling.

Read `D:\Claude\Obsidian\Peaceful Pursuit\Design-Language.md` for the Solar Pop token system. Use EXISTING `:root` tokens (there is also a `--radium` token now). Invent no new colours.

## Task 1 — Volume sliders

The Sound dropdown is generated at RUNTIME by `js/sound.js` (it is NOT in index.html) — a parallel agent is adding the markup right now. Style by selector; do not expect to find these in the HTML:

- `input.vol-slider[type="range"]`, ids `#vol-music` and `#vol-vfx`
- each sits with a `<label>` and a visible numeric value readout

Style to match Solar Pop: pill track, flare-coloured filled portion, round thumb with the warm `rgba(94,45,20,…)` shadow treatment (never neutral grey), clear hover/active states, accessible `:focus-visible` ring. Cross-browser: `::-webkit-slider-runnable-track`, `::-webkit-slider-thumb`, `::-moz-range-track`, `::-moz-range-thumb`, and `::-moz-range-progress` for the fill. Remember `-webkit-appearance: none` on the input. Must work in BOTH themes (Sunlit and Dusk) — check how the existing sound-menu toggles handle theme and match.

## Task 2 — Experience nav button

`index.html` now has a standalone nav button:
`<button class="experience-toggle" data-experience-toggle data-mode="chaotic" aria-pressed="false">` containing `.experience-toggle__icon` and `.experience-toggle__label`.

- It sits as a sibling of the existing `.sound-toggle` in the nav. Grep `.sound-toggle` and match that button's visual language exactly (size, radius, border, hover, spacing) so the nav reads as one coherent row.
- Give a clear visual distinction between `[data-mode="peaceful"]` and `[data-mode="chaotic"]` — e.g. calm/blush treatment vs. an energetic flare treatment. Keep both legible in both themes.
- Do not let it break the nav's notched silhouette or the new rainbow border.

## Constraints
- Append near the related existing blocks (sound-menu / nav button styles), not at the bottom of the file.
- Match the file's comment voice.
- Braces must balance — verify before you finish.
- Do not create temp/scratch files in the repo; if you need a scratch file use `$TMPDIR`.

Output 3 lines: selectors added, how you differentiated the two Experience states, risks.
