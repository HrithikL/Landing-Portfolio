# Cool News pipeline

Finds material across 5 fixed topics and rewrites each into a strict, no-fluff spec-sheet article
via OpenRouter, then writes the result into `data/news.json`. This is a standalone Node package —
it never ships to the site and has no effect on the no-build-step front end; it only produces a
JSON file the site already knows how to read. Card art and the workflow diagram are generated
client-side by the site itself (procedural SVG, no image API, no cost) — see `js/content.js`.

Runs on a schedule via `.github/workflows/news.yml`, which commits the changes straight to `main`.
Whatever's hosting the site (GitHub Pages, Netlify, Vercel, Cloudflare Pages — anything that
redeploys on push) picks up the change automatically. There is no server: this is the entire
"backend."

## The five topics

There is no Anime or Gaming anymore. Every story is tagged with one `category` (which topic it was
*discovered* under) and a `topicTag` in its own body (which of four labels the *article itself*
classifies as — set by the model, not the discovery source):

| `category` | What it discovers | Source |
|---|---|---|
| `models` | Open source models and their use cases | Hugging Face's blog (official) + Hacker News, filtered to a 40+ point bar |
| `claude` | Claude platform updates | Anthropic's own release-notes page, scraped directly (no public RSS exists) |
| `tools` | New free AI tools for image/video generation | Hacker News "Show HN", filtered to a 15+ point bar and image/video keywords |
| `projects` | End-to-end AI workflows people built | Hacker News, filtered to a 40+ point bar and agent/workflow keywords |
| `repos` | Notable GitHub repos | GitHub's own daily trending list, filtered to AI-relevant keywords |

There's no "2+ outlets" verification bar here — it doesn't apply to a GitHub repo or a Show HN
post. Each topic has its own quality signal instead (an official source, a community points
threshold, or trending-list membership), applied inside `discover.mjs` at fetch time.

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
cp .env.example .env   # then paste your real key in — any filename works with --env-file, just
                        # keep it matching scripts/news/*.env so .gitignore actually catches it
node --env-file=.env run.mjs
```

This writes into `../../data/news.json`. Check `git diff` before deciding whether to commit.

## The strict article template

Every article is exactly these fields — see `brand-voice.md` for the full prompt and
`schema.mjs` for validation:

`title`, `topicTag` (one of `Claude` / `Open source models` / `Free AI Tools` / `AI Projects`),
`endUser`, `toolsUsed[]`, `costStructure`, `howItWorks`, `inputNeeded`, `outputGiven`, `workflow[]`
(ordered steps — rendered as an actual flowchart diagram on the site, not prose), `useCases[]`,
`hardwareRequirements`, `integrations`, `subscriptionsRequired`. No prose paragraphs, no narrative
— this is a spec sheet, and the model is instructed accordingly (no fluff, "None"/"Not stated"
instead of guessing when the source is silent on a field).

## Things worth knowing

- **Cost**: nemotron-3-ultra-550b-a55b is a large model; each story is one call. At the default of
  up to 15 new stories/day (3 per topic × 5 topics), check OpenRouter's usage dashboard after the
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
