# Cool News pipeline

Finds material across 6 sections and rewrites each into a strict, no-fluff spec-sheet article
via OpenRouter, then writes the result into `data/news.json`. This is a standalone Node package —
it never ships to the site and has no effect on the no-build-step front end; it only produces a
JSON file the site already knows how to read. Card art and the workflow diagram are generated
client-side by the site itself (procedural SVG, no image API, no cost) — see `js/content.js`.

Runs on a schedule via `.github/workflows/news.yml`, which commits the changes straight to `main`.
Whatever's hosting the site (GitHub Pages, Netlify, Vercel, Cloudflare Pages — anything that
redeploys on push) picks up the change automatically. There is no server: this is the entire
"backend."

## The six sections

Every section is about **cool things people built with AI** (vibe coders, indie devs, small teams),
never corporate news. Discovery is limited to the past 7 days (`NEWS_DAYS_BACK`), and anything about
people joining/leaving/being hired by a company, funding, acquisitions or lawsuits is dropped in
`discover.mjs` before it costs a model call (the model is also told to reject it with `{"skip": …}`).

| `category` | Tab | What it features | Source |
|---|---|---|---|
| `models` | Open Source AI | Projects built on a named open model (`modelUsed` is required), end to end | Hacker News Show HN (Algolia API), open-model keywords |
| `claude` | Claude | Projects built with Claude, token-saving tips (`tips[]`), new Claude features | Anthropic release notes + HN |
| `projects` | AI Projects | End-to-end projects/workflows on free AI tools | HN Show HN |
| `tools` | Tools | Free tools many builders use, with use cases | HN Show HN |
| `repos` | Top Repos | Top AI repos of the week: web dev, software, games, problem-solving tools | GitHub search (created this week, by stars) + weekly trending |
| `general` | General | Cool AI builds that fit nowhere else | HN Show HN |

Sections run most-specific first (claude → models → repos → tools → projects → general) and share
one "already seen" list, so a story is only ever written up once. The model judges fit per section
and can reject a candidate; rejected links are remembered in `data/news.json` (`skipped`) so they
aren't re-billed on the next run. Reddit isn't used (it refuses unauthenticated bots).

## One-time setup

1. **Get an OpenRouter API key**: https://openrouter.ai/keys
2. **Add it as a repo secret**: GitHub repo → Settings → Secrets and variables → Actions → *New
   repository secret* → `OPENROUTER_API_KEY`.
3. That's it — the workflow already has `contents: write` permission to commit back using the
   default `GITHUB_TOKEN`, no extra token needed.

The workflow also runs on `workflow_dispatch`, so you can trigger a run by hand from the Actions
tab.

## Running locally

```bash
cd scripts/news
npm install
# put OPENROUTER_API_KEY=... in scripts/news/openrouterkey.env (any scripts/news/*.env is gitignored)
node --env-file=openrouterkey.env run.mjs
```

Or just press **Refresh** in the Cool News section while `python serve.py` is running: the dev
server runs this same pipeline with the key from `scripts/news/*.env` (the key never reaches the
browser) and the page reloads the new stories when it finishes. On the hosted site the button goes
through the Cloudflare Worker → GitHub Action instead (`cloudflare/README.md`).

If every model call fails (bad key, no credit) the run exits non-zero, so the Action goes red
instead of "succeeding" with nothing new.

## The strict article template

See `brand-voice.md` for the prompt and `schema.mjs` for validation. Required: `title`, `summary`,
`topicTag`, `howItWorks` (+ `modelUsed` in the open-models section). Optional, included only when
the source supports them: `modelUsed`, `builtBy`, `endUser`, `toolsUsed[]`, `costStructure`,
`inputNeeded`, `outputGiven`, `workflow[]` (drawn as a flowchart on the site), `useCases[]`,
`hardwareRequirements`, `integrations`, `subscriptionsRequired`, `tips[]`. There is never a
"Not stated"/"None"/"N/A" value: `cleanArticle()` strips them and the site hides missing rows.
Each item's `url` is the story itself (the card's "Original article" link), not the outlet's homepage.

## Things worth knowing

- **Cost**: nemotron-3-ultra-550b-a55b is a large model; each story is one call. At the default of
  up to 24 new stories/run (4 per section × 6 sections; it falls back to the model's `:free` route if the paid one is refused), check OpenRouter's usage dashboard after the
  first few runs. `TARGET_PER_CATEGORY` (env var, or edit `run.mjs`) is the knob to turn it down.
- **No image generation API is used, on purpose.** An earlier version of this pipeline called
  Gemini per story, but Google's free tier gives a hard `0` quota for its image models (billing
  required even for light use), and that was cut rather than asked of you. Card thumbnails and the
  in-article workflow diagram are both generated in the browser from data the pipeline already
  writes (`js/content.js`) — free, instant, no key, no rate limit.
- **The Claude topic scrapes a webpage, not a feed** — Anthropic doesn't publish RSS for their
  release notes. `discover.mjs`'s `discoverClaude()` parses `<h3 id="...">` date headings directly
  out of the page's HTML. If Anthropic redesigns that page, this breaks in an obvious way (0
  candidates found, or a warning in the log) rather than silently.
- **Be a reasonable visitor**: the extractor and discovery fetchers identify with a
  `PeacefulPursuitNewsBot` user-agent and fetch a handful of pages per run, not a crawl. Reddit was
  deliberately left out of the source list — it returns 429/403 to any non-browser user-agent, and
  spoofing a browser UA to get past that felt like the wrong tradeoff for this project.
- **Feed URLs drift.** If a run's log shows a source failing repeatedly, check `discover.mjs` for
  that source's URL/query and update it. A single feed returning `502` for one run is usually just
  that free community service having a bad moment — it isn't retried more than once per run to
  avoid hammering it, so a 0-candidates category is often just tomorrow's run away from fine.
