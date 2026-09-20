You are one of two agents working in parallel. YOU MAY ONLY EDIT `js/sound.js`. Do not touch main.js, index.html, css/styles.css — other agents own those.

Read `CLAUDE.md`, `D:\Claude\Obsidian\Peaceful Pursuit\files\sound-js.md`, then the source. `window.Sfx` (the audio API) lives here.

BEFORE you code, read the CURRENT `index.html` and the CURRENT `js/sound.js`.

CRITICAL FINDING from the markup agent: **the Sound dropdown is NOT in index.html — it is built at runtime inside `js/sound.js` (`menu.innerHTML = ...`, around line 586).** That makes the dropdown YOUR responsibility. You must therefore ALSO do the markup work that the earlier agent could not reach:

- **Remove** the `.sound-menu__mode` block (the Experience / Peaceful-Chaotic toggle, around lines ~596-602). Experience now lives as a standalone nav button (`.experience-toggle`, already added to index.html) and is wired by the main.js agent. Removing it here is required — leaving it creates two competing controls.
- **Add**, in its place, the two sliders, each with a `<label>` and a visible value readout:
  `<input type="range" min="0" max="100" id="vol-music" class="vol-slider" aria-label="Music volume">`
  `<input type="range" min="0" max="100" id="vol-vfx" class="vol-slider" aria-label="Effects volume">`
  Keep the existing Music and Effects on/off toggles above them.
- Match the existing dropdown's markup conventions and class naming so the CSS agent's styling lands correctly.

Also read `.orchestration/ledger/B1-styles.json` (`result` field) for the CSS custom-property contract the nav border/visualizer exposes.

## Task 1 — Music volume slider (0–100)

- Wire `#vol-music` to control music playback volume through a dedicated music GainNode.
- 0 = silent, 100 = current default full volume. Map the slider perceptually (roughly `(v/100)^2` or an equal-loudness curve), not linearly — a linear gain slider feels wrong in the top half.
- Persist the setting to `localStorage` and restore it on load; the site already uses localStorage elsewhere, match that convention.
- Keep the existing Music on/off toggle working and coherent with the slider (turning music back on should restore the slider's level, not full blast).

## Task 2 — VFX volume slider (0–100)

- Same again for `#vol-vfx`, controlling ALL synthesised effects (engine, guns, explosions) independently of music, via a separate effects GainNode.
- Every effect voice must route through that one effects bus — audit the file for any oscillator/buffer source that currently connects straight to `destination` and re-route it. Missing one means that sound ignores the slider.
- Persist and restore, same as music. Keep the existing Effects toggle coherent.

## Task 3 — Audio visualizer feed for the nav border

When music is playing, the nav bar's rainbow border must become a live audio visualizer.
- Add an `AnalyserNode` on the MUSIC bus (not the master — the visualizer should react to the song, not to gunfire).
- Run a `requestAnimationFrame` loop while music plays that reads frequency data, reduces it to a small number of bands (e.g. 8–16), smooths them (attack fast, release slow, so it doesn't strobe), and writes them to the exact CSS custom properties B1 exposed on the nav element.
- Set the nav's visualizer state attribute (e.g. `data-viz="on"`) while music plays and clear it when music stops/pauses, so CSS can switch treatments.
- The loop MUST stop when music is not playing — no permanent rAF loop burning battery at idle.
- Expose this on `window.Sfx` so other files can query visualizer state rather than reaching into internals.

## Constraints
- Web Audio only, no dependencies, no build step.
- Respect autoplay policy: do not resume/construct the AudioContext outside an existing user-gesture path. Reuse the file's existing unlock logic.
- Match the file's existing style and comment voice.
- `node --check js/sound.js` must pass.

When done, output: (1) the exact CSS properties you write and how many bands, (2) the gain bus topology after your change, (3) any effect voice you had to re-route, (4) the localStorage keys you used, (5) risks.
