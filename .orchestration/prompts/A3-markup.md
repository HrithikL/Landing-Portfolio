You are one of several agents working in parallel on the Peaceful Pursuit site. YOU MAY ONLY EDIT `index.html` and `js/content.js`. Do not touch css/styles.css, main.js, plane.js, sound.js, gradient.js — other agents own those and your edits there will be discarded.

IMPORTANT: you are doing MARKUP/STRUCTURE only. Another agent styles everything right after you. Your job is to emit clean, semantic, class-named markup and leave a short note of the class names you introduced so the CSS agent can style them. Add NO inline styles and no `<style>` blocks.

Read `CLAUDE.md`, then `D:\Claude\Obsidian\Peaceful Pursuit\files\index-html.md` and `content-js.md`, then the sources.

Reference screenshots (Read them):
- `assets/refs/current-credits.png` — credits section, currently jagged/overlapping/cut off
- `assets/refs/current-about-cutoff.png` — About sheet, text cut off in containers
- `assets/refs/current-sound-panel.png` — the Sound dropdown as it stands today

## Task 1 — Credits → accordions

Current markup (around index.html lines 323-380) has two big `.credit-group` cards: "Audio" and "Code, type & tools". Refactor into collapsible accordion sections:

- By DEFAULT only the section TITLES are visible. Clicking a title expands to reveal that section's content.
- Use native `<details>`/`<summary>` where practical (no JS needed, accessible for free) OR a button + `aria-expanded` + `hidden` panel pattern if you need finer animation control. Pick one and be consistent. State your choice in your summary.
- Split into THREE top-level accordion sections instead of two:
  1. **Audio** — the three Sappheiros tracks (Dawn, Embrace, Awake) and all music/licence/BreakingCopyright credits.
  2. **Tools** — the tools used to build the website: Three.js, Lenis, Claude Code, Solar Pop Studio, and any build/dev tooling.
  3. **Code & Type** — fonts (Outfit, Yellowtail, Sacramento) and anything code-related that is not a "tool" per above.
  Keep every existing credit, link, licence line and attribution — losing an attribution is a licence violation. Nothing may be dropped.
- Consider making each individual track (Dawn/Embrace/Awake) a nested accordion inside Audio, since that is what currently overflows.

## Task 2 — About screen containers

In the About sheet, text is cut off in the tile containers (see the screenshot: "Hosting: not published yet; GitHub Pages is free" and similar wrap badly / clip). Fix the MARKUP side: make sure each tile's content is in a properly structured flow container that can grow, no fixed-height wrappers in the markup, no text stranded in a container that cannot scroll or expand. Note any place where the real fix is CSS and leave it for the CSS agent, listing it explicitly.

## Task 3 — Remove the duplicate Cool News entry point

The main/home section offers Cool News twice: the agenda tile (around line 187) and the ghost button "Read cool news" (around line 216). Remove exactly ONE so there is a single way in from the home section. Keep the agenda tile (it is the richer, more descriptive affordance) and remove the redundant ghost button — unless reading the surrounding markup shows the button is load-bearing for layout, in which case do the reverse and say why. The nav bar link and the side-rail dot are NOT duplicates; leave both alone.

## Task 4 — Experience button out of the Sound panel

The Sound dropdown currently holds Music, Effects, AND an Experience (Peaceful/Chaotic) toggle — see `current-sound-panel.png`.

- REMOVE the Experience block from the Sound dropdown.
- ADD a standalone "Experience" button in the nav bar, as a sibling of the Sound button, with markup that can show the current mode and toggle to the other. Give it `data-experience-toggle` and a `data-mode` attribute so the JS agent can wire it. It must read its initial state from whatever the user chose on the loader screen.
- Do not write the toggle logic in main.js (not your file). Just produce the markup + a clear contract note.

## Task 5 — Volume slider markup in the Sound panel

Inside the Sound dropdown, where Music and Effects remain:
- Add a 0–100 volume slider for MUSIC.
- Add an identical, independent 0–100 slider for VFX/EFFECTS.
- Use `<input type="range" min="0" max="100">` with proper `<label>`, `aria-label`, and a visible value readout. Give them stable ids (`vol-music`, `vol-vfx`) and a shared class so the CSS and sound agents can find them.

## Constraints
- Preserve every existing `data-goto`, `data-rot`, `id` and aria attribute that other scripts depend on — grep main.js/sound.js/plane.js for any id or data-attribute BEFORE you remove or rename it. Breaking a selector another file queries is the main risk here.
- No inline styles, no new dependencies.
- Validate: the page must still parse; check with a quick `python -c` HTML sanity parse or equivalent.

When done, output: (1) every NEW css class/id you introduced, as a list — the CSS agent depends on this; (2) every attribute contract the JS agent must wire; (3) anything you deliberately left for CSS; (4) risks.
