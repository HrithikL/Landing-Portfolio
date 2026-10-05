# Peaceful Pursuit — Project Handoff

Self-contained handoff for picking up this project in a different tool/environment (including a new chat thread with no memory of prior sessions). If wherever you're reading this has filesystem access to the paths under "Knowledge base" below, prefer those (kept current); otherwise everything you need is inlined here.

**Generated 2026-10-05.** Read this whole file before touching anything — the repo is mid-transition (see "Git state" below), and skipping that section is the one way to make this handoff worse than useless.

## What this is

A single-page, no-build-step personal portfolio site for Hrithik Lega — plain HTML/CSS/JS, no framework, no bundler. A 3D biplane (Three.js) flies the visitor between 5 pinned sections; the background sky is a hand-rolled canvas gradient (day mesh / night aurora); sound is synthesised live with Web Audio; there's a playable 30-second dogfight mini-game. One section, **Cool News**, is a small autonomous content system: a scheduled pipeline (GitHub Actions + OpenRouter) discovers and rewrites AI-builder content across 5 fixed topics and publishes straight to the live site with no human in the loop — it has been running successfully, unattended, since 2026-09-22.

Repo root: `D:\Claude\Landing Portfolio` (branch `main`).

## Git state — read this before doing anything else

This is the single most important thing in this handoff. As of generation time:

- **Local `main` is 16 commits behind `origin/main`.** All 16 are automated `news: automated update YYYY-MM-DD` commits from the Cool News pipeline's daily cron (`.github/workflows/news.yml`) running on GitHub's own infrastructure — nothing you need to review commit-by-commit, just `git pull` to catch up before editing anything that touches `data/news.json` or you'll fight a merge conflict with the bot.
- **3 files have uncommitted local changes, never pushed**: `css/styles.css`, `index.html`, `js/main.js` — this is a scroll-reliability fix (see "Current state" below) that was built and verified but never committed. Review the diff (`git diff`), and either commit it or decide it's not wanted, before starting new work — don't let it sit stale under new changes.
- Run `git pull origin main` first, then handle the uncommitted scroll fix, before doing anything else.

## Structure (≈12,500 lines in the site itself; pipeline/infra below)

```
index.html              615 lines — the only HTML page, 5 <section class="panel"> blocks + templates
css/styles.css         1743 lines — single stylesheet, the "Solar Pop" design system (see below)
js/main.js             1329 lines — UI glue + shared flight/section-transition timeline (window.Flight)
js/plane.js            4576 lines — the 3D plane, weapons FX, flight routes, HUD (largest file)
js/dogfight.js         1161 lines — background/ambient dogfights (not the mini-game)
js/game.js              326 lines — the playable "Dogfight" mini-game (round/score/UI)
js/gradient.js          290 lines — the sky canvas (day mesh, night aurora)
js/impacts.js           624 lines — bullet holes/tracers punched into the page content
js/sound.js             867 lines — synthesised SFX + 3-track music playlist (window.Sfx)
js/content.js           524 lines — JS-rendered content: Resources shelves, Cool News cards + article modal, About-me sheets
data/news.json          489 lines — Cool News content, live-written by the pipeline below
serve.py                      — local no-cache dev server: `python serve.py [port]` (default 5173)

scripts/news/            — standalone Node package, CI-only, the Cool News pipeline (see below)
.github/workflows/news.yml — daily cron + manual trigger that runs the pipeline and commits results
cloudflare/               — a Worker that lets the site's own "Refresh" button trigger a real run
```

Script load order matters: `content.js` → `main.js` → `gradient.js` → `sound.js` → `impacts.js` → `dogfight.js` → `game.js` → `plane.js` (content first so DOM exists to measure; plane last since it reads globals the others set up). Cache-busting: every `<script src>`/`<link>` carries a `?v=` query string — **bump it on every real deploy** (it was stale for 3 days at one point this project and silently served old JS to testers; see the Known gaps below).

Two globals tie everything together: `window.Flight` (the section/scroll timeline, set up in `main.js`) and `window.Sfx` (audio API, set up in `sound.js`).

## The Cool News pipeline (the newest, most involved subsystem)

Five fixed AI-builder topics — **Open Source Models, Claude Updates, Free AI Tools, AI Projects, GitHub Repos**. There is no Anime or Gaming; that was the original concept and was fully replaced, not extended.

- **Discovery** (`scripts/news/discover.mjs`): each topic has its own source and its own quality bar instead of a generic "2+ outlets" rule — Hugging Face's blog (official), Anthropic's release-notes page (scraped directly, no RSS exists), and Hacker News via `hnrss.org` with a points threshold, per topic. GitHub's daily trending list for repos.
- **Rewrite** (`scripts/news/generate.mjs`, `brand-voice.md`): OpenRouter, model `nvidia/nemotron-3-ultra-550b-a55b`, strict 12-field spec-sheet template (`endUser`, `toolsUsed`, `costStructure`, `howItWorks`, `inputNeeded`, `outputGiven`, `workflow`, `useCases`, `hardwareRequirements`, `integrations`, `subscriptionsRequired`, plus `topicTag`) — no prose, no fluff, by design.
- **No image generation.** An earlier version called Gemini per article; Google's free tier gives that model a hard `0` quota (confirmed via real 429s), so it was removed rather than left broken. Instead, `js/content.js` draws a card thumbnail *and* a real flowchart diagram for the `workflow` field, both procedural SVG generated client-side from data already in `data/news.json` — free, instant, no key.
- **Publish**: `.github/workflows/news.yml` commits `data/news.json` straight to `main` if anything changed. This has run successfully, unattended, every day since 2026-09-22 — 16 commits, zero manual intervention.
- **Manual trigger from the live site**: a "Refresh" button in the Cool News section calls a Cloudflare Worker (`cloudflare/worker.js`), which holds a GitHub token **server-side only** and fires the same `workflow_dispatch` a manual "Run workflow" click would — the OpenRouter/GitHub credentials never touch the browser. Deployed and confirmed working this session (`cloudflare/README.md` has the setup steps if it needs redeploying).
- **Real bug fixed in production, not just reviewed**: a duplicate-content bug where the "already published?" check compared a story's *raw discovered* title against its *AI-rewritten* title — for repos/release-notes those read as unrelated strings, so the same story got rewritten twice under different headlines. Fixed by checking the source URL first.

Full detail: `scripts/news/README.md` and `docs/news-pipeline.md`.

## Design system — "Solar Pop" (condensed; full version in the vault)

One line, from the CSS's own header comment: *"cream grounds, one loud orange-red, a pink that softens it, heavy geometric caps interrupted by one script word."* Two themes, same token names, different values:

| Token | Sunlit (day) | Dusk (night) |
|---|---|---|
| `surface` (ground) | `#fdf0e0` | `#17100d` |
| `ink` (headline text) | `#091929` | `#fff6ea` |
| `flare` (the one loud accent) | `#f74a20` | `#ff7a4d` |
| `blush` (softening pink — **same in both themes**) | `#ff839b` | `#ff839b` |
| `rose` (script-word colour) | `#ef4a76` | `#ff9ab3` |

Type: `Outfit` (display/body) + exactly one word per headline in `Yellowtail` script, always `rose`, dropped slightly below baseline. `Sacramento` reserved for a signature flourish. Radius scale 8→48px plus full pills; nothing sharp-cornered. Shadows are warm-tinted, never neutral grey. Full palette + voice guidance: `D:\Claude\Obsidian\Peaceful Pursuit\Design-Language.md`.

## Current state / known gaps

- **Cool News is live and self-sustaining** — the one piece of this project that now runs without anyone present. Verify it's still running by checking `.github/workflows/news.yml`'s run history on GitHub, or just that `data/news.json` keeps getting newer `updated` timestamps.
- **The scroll-threshold reliability fix is built, verified, but uncommitted** (see "Git state" above). It fixes a real bug: wheel scrolling sometimes needed 3 separate, oddly-timed scroll attempts to advance a section because the old code tried to guess "mouse clicks vs. trackpad stream" from event timing and got it wrong for plenty of real mice. Also removes the "Keep scrolling to fly to…" gauge pill entirely, per explicit request — it now just goes once the (now simpler, 2-action) threshold is met.
- **The cache-busting version string was stale for ~3 days** before being caught and bumped (`?v=20260920p` → `?v=20260923a`) — a reminder to bump it on every real deploy, not just when something looks broken.
- About-me → Gallery tile is still a "Coming soon" placeholder.
- News likes/dislikes are still client-only (`localStorage`); a shared counter needs a small backend — not built, out of scope so far.
- **The project vault's wiki pages are behind this session's changes** — `files/news-pipeline.md` and `files/content-js.md` don't yet reflect the dedup fix, the SVG diagrams, or the Cloudflare trigger (flagged honestly in the vault's own `log.md` rather than silently left wrong). A `maintain` pass on the Peaceful Pursuit vault is worth running before trusting those two pages closely.
- No automated tests anywhere in this project — verification is visual (the site) or log-reading (the pipeline).

## Running it

```bash
python serve.py 5173
```
Plain `http.server` with `Cache-Control: no-cache`. No build step, no watch process.

To run the Cool News pipeline locally (spends real OpenRouter credit):
```bash
cd scripts/news && npm install
cp .env.example .env   # paste a real OPENROUTER_API_KEY in
node --env-file=.env run.mjs
```

## Which model to use (if driving this via a raw Claude API key, e.g. from Hermes)

Default to **`claude-sonnet-5`** — it did essentially all of this project's work, including the Cool News pipeline build and the scroll fix. Escalate to `claude-opus-5` only for a genuinely hard multi-file bug or an architecture-level call. Full current pricing and task-by-task routing: `D:\Claude\Obsidian\Global\Model-Capabilities.md` if reachable (written 2026-09-20 — re-verify if it's been a long gap), otherwise the rule above is the fallback.

## Knowledge base (use if this environment has filesystem access)

- **This repo's own pointer**: `D:\Claude\Landing Portfolio\CLAUDE.md`
- **Project vault**: `D:\Claude\Obsidian\Peaceful Pursuit\index.md` — "I want to change X → open this" lookup table, one page per source file, `Design-Language.md`. Two pages are currently behind this session, see "Current state" above.
- **Global vault**: `D:\Claude\Obsidian\Global\index.md` — tool/language gotchas, personal conventions, task playbooks, model routing.

If your environment can read these paths, treat each `index.md` as the map and open only what it points at. If it can't, this file is the fallback — verify specifics against source before trusting them, since code drifts.

## Picking up work

1. **Resolve "Git state" above first** — pull, then deal with the uncommitted scroll fix. Don't build on top of either without addressing them.
2. Run the dev server and load the page before/after any visual change — no automated tests, verification is visual.
3. If touching the Cool News pipeline, know that it's live in production (daily cron) — a bad change ships to the real site on the next scheduled run, not just on request.
4. Keep new work inside the existing token system (`css/styles.css` `:root`) rather than introducing new colours/radii ad hoc.
5. If you have vault access and make a structural change, update it in the same session — that's the whole point of the system.
