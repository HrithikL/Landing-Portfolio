# Peaceful Pursuit — Project Handoff

Self-contained handoff for picking up this project in a different tool/environment. If wherever you're reading this has filesystem access to the paths under "Knowledge base" below, prefer those (they're kept current); otherwise, everything you need to get oriented is inlined here.

## What this is

A single-page, no-build-step personal portfolio site ("Peaceful Pursuit") for Hrithik Lega — plain HTML/CSS/JS, no framework, no bundler. A 3D biplane (Three.js) flies the visitor between 5 pinned sections; the background sky is a hand-rolled canvas gradient (day mesh / night aurora); sound is synthesised live with Web Audio; there's a playable 30-second dogfight mini-game.

Repo root: `D:\Claude\Landing Portfolio` (git branch `solar-pop-redesign`, last commit as of this handoff: `1c6ea91` "Solar Pop redesign, interactive gradient sky, sticky sections").

## Structure (≈11,700 lines total)

```
index.html          566 lines — the only HTML page, 5 <section class="panel"> blocks + templates
css/styles.css     1517 lines — single stylesheet, the "Solar Pop" design system (see below)
js/main.js         1319 lines — UI glue + shared flight/section-transition timeline (window.Flight)
js/plane.js        4398 lines — the 3D plane, weapons FX, flight routes, HUD (largest file)
js/dogfight.js     1160 lines — background/ambient dogfights (not the mini-game)
js/game.js          326 lines — the playable "Dogfight" mini-game (round/score/UI)
js/gradient.js      272 lines — the sky canvas (day mesh, night aurora)
js/impacts.js       520 lines — bullet holes/tracers punched into the page content
js/sound.js         767 lines — synthesised SFX + 3-track music playlist (window.Sfx)
js/content.js       337 lines — JS-rendered content: Resources shelves, News cards, About-me sheets
data/news.json           — Cool News section data (currently all placeholder/sample stories)
docs/news-pipeline.md    — design doc for auto-fetching real news (not implemented yet)
serve.py                 — local no-cache dev server: `python serve.py [port]` (default 5173)
```

Script load order matters: `content.js` → `main.js` → `gradient.js` → `sound.js` → `impacts.js` → `dogfight.js` → `game.js` → `plane.js` (content first so DOM exists to measure; plane last since it reads globals the others set up).

Two globals tie everything together: `window.Flight` (the section/scroll timeline, set up in `main.js`) and `window.Sfx` (audio API, set up in `sound.js`).

## Design system — "Solar Pop" (condensed; full version below)

One line, from the CSS's own header comment: *"cream grounds, one loud orange-red, a pink that softens it, heavy geometric caps interrupted by one script word."* Two themes, same token names, different values:

| Token | Sunlit (day) | Dusk (night) |
|---|---|---|
| `surface` (ground) | `#fdf0e0` | `#17100d` |
| `ink` (headline text) | `#091929` | `#fff6ea` |
| `flare` (the one loud accent) | `#f74a20` | `#ff7a4d` |
| `blush` (softening pink — **same in both themes**) | `#ff839b` | `#ff839b` |
| `rose` (script-word colour) | `#ef4a76` | `#ff9ab3` |

Type: `Outfit` (display/body, geometric sans) + exactly one word per headline in `Yellowtail` script, always coloured `rose`, dropped slightly below baseline. `Sacramento` reserved for a signature flourish. Shapes: nested radius scale 8→48px plus full pills for chips/buttons, nothing sharp-cornered; shadows are warm-tinted (`rgba(94,45,20,…)`), never neutral grey. Illustration style (for any generated image — social posts, gallery): "soft editorial illustration" in the candy palette above — warm orange/pink/amber light, not cool/studio light, not photo-real, not flat vector.

Full palette (all tokens, both themes), sky/aurora gradient colours, and voice guidance for blog copy: `D:\Claude\Obsidian\Peaceful Pursuit\Design-Language.md` (see Knowledge base below) — read that instead of re-deriving this from the CSS if you have access to it.

## Current state / known gaps

**2026-09-20: a large orchestrated change set landed — read `docs/handover/2026-09-20-orchestrated-change-set.md` first.** It covers the aurora rework, podium/camera levelling, responsive scaling, credits accordions, the radium nav treatment, the rainbow nav border + audio visualizer, scroll-threshold and tile-blocking logic, volume sliders, and the flight choreography. It also carries the per-agent cost/token ledger and, importantly, a list of what has **not** been visually verified. Commit `ceab5cc` (flight animations) is explicitly flagged as unverified and is safe to revert on its own.

- Site itself is functionally complete post-redesign; no known open bugs.
- `data/news.json` is 100% placeholder (`sample: true`) — the real fetch/verify/publish pipeline is only a spec, in `docs/news-pipeline.md`, not built.
- No image-generation pipeline yet for social/gallery images — `Design-Language.md` exists specifically so generated images can match the site.
- About-me → Gallery tile is a "Coming soon" placeholder.
- News likes/dislikes are client-only (`localStorage`); a real shared counter needs a small backend (see `docs/news-pipeline.md`).

## Running it

```bash
python serve.py 5173
```
Plain `http.server` with `Cache-Control: no-cache` so edits show up on a normal refresh — no build step, no watch process needed.

## Which model to use (if driving this via a raw Claude API key, e.g. from Hermes)

Default to **`claude-sonnet-5`** for edits to this site — it's what did all the actual work on this project this session (1M context, balanced cost/capability). Escalate to `claude-opus-5` only for a genuinely hard, multi-file bug or an architecture-level call; don't default to it for routine copy/CSS/JS changes. Full current pricing and a task-by-task routing table (including where `claude-haiku-4-5` and `claude-fable-5-1` fit, and why Fable isn't a "better writer" than Sonnet, just pricier): `D:\Claude\Obsidian\Global\Model-Capabilities.md` if reachable, otherwise use the two rules above as the fallback.

## Knowledge base (use if this environment has filesystem access)

This project maintains an external "LLM wiki" (Obsidian vaults, not part of the git repo) so an AI assistant can find the relevant file for a change without reading the whole codebase:

- **This repo's own pointer**: `D:\Claude\Landing Portfolio\CLAUDE.md` — explains the convention and links to both vaults below.
- **Project vault**: `D:\Claude\Obsidian\Peaceful Pursuit\index.md` — entry point; has an "I want to change X → open this" lookup table, one page per source file with a line-numbered section map, and `Design-Language.md` (the full design reference this file condenses above).
- **Global vault**: `D:\Claude\Obsidian\Global\index.md` — knowledge that generalizes across this user's projects (tool/language gotchas, personal conventions, task playbooks, model routing), not specific to this repo.

If your environment can read these paths, treat `index.md` in each as the map and open only what it points at. If it can't, this handoff file is the fallback — everything above is accurate as of the date this file was generated; verify line numbers against source before trusting them, since code can drift.

## Picking up work

1. Read this file (and `CLAUDE.md` + the vault `index.md`s if reachable) before making any change.
2. Run the dev server and load the page before/after any visual change — this site has no automated tests; verification is visual.
3. Keep new work inside the existing token system (`css/styles.css` `:root`) rather than introducing new colours/radii ad hoc.
4. If you make a structural change (new file, moved responsibility, new global), and you have access to the vault, update it — that's the whole point of the system.
