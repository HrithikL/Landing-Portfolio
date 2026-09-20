# Peaceful Pursuit — Orchestrated Change Set Handover

Date: Sunday 20 September 2026
Repo: `D:\Claude\Landing Portfolio` (branch `solar-pop-redesign`)
Orchestrator: Hermes (Claude Opus 5) driving Claude Code agents in print mode
**Status: all agents stopped. 8 commits landed. 1 commit is unverified and flagged.**

---

## 1. How to pick this up

Pre-change checkpoint: `4181a23`. Everything after it is this change set — one commit per wave, each independently revertable.

```
git -C "D:/Claude/Landing Portfolio" log --oneline 4181a23..HEAD
python serve.py 5173
```

No build step. Verification on this project is visual — there are no automated tests. Every JS file passes `node --check` and the stylesheet's braces balance, but **that is the only verification performed**. Nothing in this change set has been looked at in a browser.

Orchestration artefacts are committed under `.orchestration/`:
- `prompts/*.md` — the exact brief each agent was given
- `ledger/*.json` — each agent's full result (turns, tokens, cost, its own summary)
- `run_agent.sh` — `run_agent.sh <id> <model> <prompt> [budget] [turns]`

Reference screenshots used to brief the agents: `assets/refs/`.

Codebase is now ~11,823 lines (was ~11,700), `plane.js` 4,573 and `styles.css` 1,703.

---

## 2. Commit log

| Commit | Wave | Model | State |
|---|---|---|---|
| `68814a0` | A — aurora geometry, credits accordions, nav Experience button, Cool News dedupe | Sonnet 5 ×2 | Landed |
| `e8b2ddd` | Aurora levelled | orchestrator, by hand | Landed, verified numerically |
| `6ff833b` | A2 — podium/plane levelling, axis-fitting scale | Opus 5 | Landed, verified numerically |
| `1c41014` | B — radium nav text, rainbow border, blur removal, accordion CSS, fluid scaling | Opus 5 | Landed (budget-capped at 5 of 8 tasks) |
| `71a4683` | B2 — volume slider + Experience button styling | Sonnet 5 | Landed, completes Wave B |
| `b0780d4` | C2 — volume sliders, analyser feed, dropdown rebuild | Sonnet 5 | Landed |
| `192db02` | C1 — scale port, scroll threshold, tile blocking, nav driver, Experience wiring | Opus 5 | Landed, verified numerically |
| `ceab5cc` | D — peaceful choreography, menu strafing, menu bullet holes | Opus 5 | **PARTIAL / UNVERIFIED — see §5** |

---

## 3. What was delivered, by spec item

### Background and environment
- **Aurora spawn pattern** — curtains now originate from a distant point high near the vanishing point and splay outward and downward to both edges, with hanging vertical light-shafts. Geometry follows the reference photo; palette deliberately kept as the site's candy orange/pink, not the reference's teal.
- **Aurora level** — the first pass fanned correctly but read tilted, because the fan origins sat off-centre (`ox` .58/.44/.52) and droop is computed from distance-to-origin, so the left edge fell to 0.49 of screen height against 0.31 on the right. All origins moved to `ox: .5` and the ripple re-keyed from raw `X` to distance-from-centre. Left/right edge skew is now exactly `0.0`.
- **Dark-mode stability** — aurora is frozen at rest; it creeps only while the pointer moves, using the same smoothed pointer-speed signal and time constants the light-mode gradient already used.
- **Planes pass cleanly behind content** — blur/fade masks removed. Exactly one `backdrop-filter` remains and it only frosts a photo card's own image; that one is intentional.
- **Camera/alignment** — root cause measured, not guessed. The podium parks at world x ≈ ±3.83 while the camera sits at x = 0, a 15.3° off-axis azimuth. The rim read **3.39° off level**: 1.68° from pure off-axis projection skew (world verticals converge on the nadir, so anything off-centre reads rolled) plus 1.71° from `PODIUM_TILT = .12` being a world-X pitch that decomposes into apparent roll at that azimuth. New `parkRig()` builds the rig quaternion as roll(−skew about the view ray) × tilt(about the camera-relative horizontal axis) × spin(world Y). Measured rim roll after: **−0.27°** at 1920×1080, **−0.24°** at 1280×800. Camera was not moved, so `unproject`/route maths are untouched; airborne banking is on a separate path and preserved.

### Responsive and layout
- **Global scaling** — the old rule keyed off width alone. With a fixed 35° vertical FOV the visible world *height* is constant regardless of window height, so a width-derived scale threw away headroom that never shrank. Now fits whichever axis runs out: `mobile ? min(halfW/3.2, halfH/3.2) : min(halfW/5.4, halfH/2.4)`, clamped `[.5,1.35]` / `[.8,1.75]`. Ported into **both** `plane.js layout()` and `main.js stageLayout()` and verified to match at 12 viewports. Mobile grows (390×844: .57 → .64; 768×1024: .80 → 1.04); desktop unchanged. Plus 44 `clamp()` sites in the stylesheet.
- **About containers** — `.tile__text` wrappers, `min-width: 0`, `overflow-wrap`; no fixed heights that clip.
- **Credits** — three native `<details>`/`<summary>` accordions: **Audio**, **Tools**, **Code & type**, with each track nested inside Audio. All collapsed by default. Every attribution, link and licence line preserved verbatim.

### Menu and UI
- **Radium nav highlight** — the `.rot.is-active` underline is gone, replaced by an animated luminous gradient clipped to the text itself, with a solid-colour fallback.
- **Rainbow nav border** — top loading bar removed; a thin conic-gradient border follows the nav's notched silhouette and animates continuously.
- **Audio visualizer** — 8 log-spaced bands (40 Hz–12 kHz) driven from an `AnalyserNode` on the music bus, written to the nav each frame. The rAF loop only runs while music plays.
- **Duplicate Cool News** — the `.btn--ghost` "Read cool news" button is gone from the hero; the richer agenda tile is kept. Nav link and side-rail dot are not duplicates and were left alone.
- **Experience toggle** — removed from the Sound dropdown, now a standalone nav button that defaults to the loader-screen choice and toggles via the existing mode path.

### Scroll logic
- **Threshold** — a gesture starts on first push, on direction reversal, or after a quiet window. Detents vs trackpad are discriminated on **both** coarseness (≥ 40 px/event) and sparseness (≥ 25 ms between events), because magnitude alone misclassifies a hard flick — a pad streams at 8–16 ms and can fake the size of a detent but never the spacing. Wheel detents need 3 actions; a trackpad flick is capped at 1 action however far it runs on; touch needs 2 swipes. Decay is HOLD 1000 ms then LEAK 1.2/s, with the gesture object nulled once drained so no stale count leaks forward.
- **Tile blocking** — `closest()` on `[data-hold-scroll], .agenda__item, .news-card, .res-card, .tile, .credit-acc`, tested per wheel/touchmove event. No hover listeners, works for JS-rendered cards with no re-marking pass. **`[data-hold-scroll]` is the opt-in hook for anything new.**

### Sound
- Bus topology: FX → `fxBus`(gate) → `fxVol` → master; Music → `musicBus`(gate) → `musicVol` → `analyser` → `musicDuck` → master → compressor → limiter.
- Perceptual `(v/100)²` curve so half-travel sounds like half. Persisted in the existing `hl-audio` prefs object rather than new keys.
- An audit confirmed every effect voice already routed through `fxBus`, so none were stranded outside the slider's control.

---

## 4. Known issues and gotchas

**The Sound dropdown is not in `index.html`.** It is built at runtime inside `js/sound.js` (`menu.innerHTML = …`, ~line 660). An agent lost most of a budget discovering this. This belongs in the vault file notes.

**Chrome slider fill needs `--p`.** The WebKit track fill reads `var(--p, .5)` (0–1, not a percentage). Firefox fills natively via `::-moz-range-progress` and would have hidden the bug. The sound agent ran with a pre-patch brief and did not set it; the orchestrator added it in `paintVol()` and the `input` handler afterwards. Any new slider must do the same.

**`camRight`/`camUp`/`camFwd` in `plane.js` are captured once** from `camera.quaternion`, valid only because the camera is set at lines 34–35 and never rotates again. If a future change animates camera orientation, those three must move inside `parkRig()`.

**Agent self-reports can be stale.** `C2-sound` reported that the slider CSS "never landed" — it had, in commit `71a4683`, which was made after C2 started. Parallel agents cannot see each other's commits. Verify claims against the repo, not the summary.

---

## 5. The unverified commit — `ceab5cc`

The animation wave exhausted its $5 budget after 42 turns. All three files parse and no scratch files were left behind, but **the agent did not consider the task complete and produced no final summary**. Treat this commit as suspect.

Landed (confirmed present in the diff):
- `plane.js` — `SUPPORT` formation table + `SUPPORT_BURST`, `planShow()` show planner, leg easing (`legIn`/`legOut`), `segOf`/`ourAt` path sampling, `clearance`/`safeGap` spacing checks, engage beats at .34/.46/.57/.68/.79 of the outbound leg, `menuWalk()` strafing pass
- `impacts.js` — full menu bullet-hole API: `menuItems()`, `menuBand()`, `menuFree()`, `findMenuHit()`, `holeMenu()`, `ageMenuHoles()`, `retireMenu()`
- `dogfight.js` — `clear(keepShow)` so sweeping the stage can spare the display flight that flies itself off after the break

Not confirmed, and the first things to test:
- the 0.5 s re-emergence beat between disappearing and returning with the support group
- that **all** inbound enemies are destroyed before the main plane disappears
- the hard 15 s cap on the chaotic engagement
- interruption and cleanup when the user re-navigates mid-animation (orphaned planes, leaked timers/rAF loops)

If the flight animations misbehave: `git revert ceab5cc` — it is isolated to those three files and nothing else depends on it.

---

## 6. Cost and token ledger

Figures from each agent's own print-mode result object. Note input tokens are tiny against cache reads — repo context is being served from cache, which is where the cost savings already are.

| Agent | Model | Turns | Input | Output | Cache read | Cost USD | Wall s | Outcome |
|---|---|---|---|---|---|---|---|---|
| A1-aurora | Sonnet 5 | 16 | 1,563 | 16,392 | 788,369 | 0.5422 | 198.5 | success |
| A2-camera (retry) | Opus 5 | 15 | 2,178 | 25,671 | 613,981 | 1.4369 | 312.6 | success |
| A3-markup | Sonnet 5 | 42 | 2,250 | 28,469 | 2,280,061 | 1.1453 | 270.4 | success |
| B1-styles | Opus 5 | 34 | 2,600 | 47,279 | 2,293,544 | 3.6202 | 552.1 | budget exhausted |
| B2-styles-finish | Sonnet 5 | 11 | 1,705 | 11,479 | 560,714 | 0.4022 | 112.3 | success |
| C1-main | Opus 5 | 41 | 2,448 | 39,231 | 2,289,966 | 3.1644 | 490.1 | success |
| C2-sound | Sonnet 5 | 30 | 2,044 | 34,320 | 2,724,436 | 1.3035 | 383.3 | success |
| D1-animation | Opus 5 | 42 | 2,129 | 72,284 | 3,264,534 | 5.0486 | 854.9 | budget exhausted |
| **TOTAL (final runs)** | | **231** | **16,917** | **275,125** | **14,815,605** | **16.6633** | | |

### Discarded runs (superseded — ledger overwritten, cost still real)

| Agent | Model | Turns | Cost USD | Outcome |
|---|---|---|---|---|
| A2-camera (1st) | Opus 5 | 19 | 2.0915 | Budget exhausted **with zero edits written** |
| B2-styles-finish (1st) | Sonnet 5 | 8 | 0.2045 | Killed by account session rate limit |
| C1-main (1st) | Opus 5 | 23 | 0.9325 | Killed by account session rate limit |
| C2-sound (1st) | Sonnet 5 | 15 | 0.4221 | Killed by account session rate limit |
| D1-animation (1st) | Opus 5 | 32 | 2.4751 | Killed by account session rate limit |
| **Wasted subtotal** | | **97** | **6.1257** | |

**Grand total ≈ $22.79**, of which **$6.13 (27%) bought nothing durable**. Original ceiling was $12 at $2/agent; the user was told when the relaunch passed it and elected to continue.

---

## 7. Lessons worth promoting to the Global vault

**Do the recon in the cheap context, not the expensive one.** The first `A2-camera` run on Opus 5 spent its entire $2 across 19 turns reading the 4,398-line `plane.js` and wrote nothing. The retry — same model, same task — finished in 15 turns for $1.44 once the orchestrator had done the grep by hand and handed over exact line numbers plus a stated hypothesis. Both hypotheses turned out to be correct and contributed roughly half the defect each. When delegating into a large file, find the coordinates cheaply, then hand them over.

**Budget caps land mid-task, not at task boundaries.** Three of eight agents hit their cap. Two had written useful, valid work; one had written nothing. Always audit what actually landed rather than trusting the exit code, and prefer a cheap finisher over restarting a premium model on an almost-complete file — `B2-styles-finish` closed out B1's remaining two tasks for $0.40 against B1's $3.62.

**`subtype: success` can coexist with `terminal_reason: api_error`.** Four agents reported success while having been cut off mid-work by an account rate limit. Check `terminal_reason`, not just the exit code.

**Partial writes must be reverted, not built on.** The rate limit left 4 inert lines in `sound.js`. Reverting and letting the agent redo it coherently is cheaper than having the next agent reason about a stranded fragment.

**Parallel agents cannot see each other's commits.** Cross-file contracts (the `--nav-viz-*` properties, the `--p` slider fill, the `stageLayout()` scale rule) have to be carried between agents explicitly in the prompt, and re-checked by the orchestrator afterwards — two of the three above needed a manual fix-up.

---

## 8. Visual verification checklist

Nothing below has been checked. Run `python serve.py 5173` and work through it.

1. Night mode: aurora fans from a distant origin to both edges and is **level**; static at rest, creeps only under the cursor.
2. Podium rim and plane wings level on **every** section, both sides; deck still reads as a disc with a visible top face, not a flat sliver.
3. Scroll a full hop: plane still banks into turns, rolls level only on touchdown.
4. Dogfight on section 0: podium stays level as it slides to centre stage.
5. Short/landscape window: plane fills the height, disc does not clip the edge.
6. Planes pass behind panels with no blur or fade at the edges.
7. Active nav item shows the radium gradient on the text, no underline.
8. Nav border animates continuously; no top loading bar during transitions.
9. Play music: the nav border becomes a live 8-band visualizer and stops when music stops.
10. Sound panel: both sliders fill correctly **in Chrome** (the `--p` fix) and are independent.
11. Experience button reflects the loader choice and toggles cleanly.
12. Scroll: one trackpad flick does **not** advance; 3 wheel detents do; hovering any tile blocks advancement entirely.
13. Credits: only three titles visible until clicked; all attributions present when expanded.
14. About tiles: no clipped text at any window size.
15. **`ceab5cc` items** — peaceful multi-section jump (takeoff into deep centre, all enemies destroyed, 0.5 s beat, curved support formation, split, land) and chaotic mode (≤ 15 s, shoots the menus, bullet holes appear). Revert that commit if misbehaving.

---

## 9. Not yet done

`E1-docs` (Haiku 4.5) was written but never run. It would: append a session entry to `D:\Claude\Obsidian\Peaceful Pursuit\log.md`, refresh the stale file notes (especially the sound-dropdown finding), create a token/cost page in the project vault, append the delegation lesson to the Global vault, and update the repo's own `HANDOFF.md`. The prompt is ready at `.orchestration/prompts/E1-docs.md`.
