# Cool News: how stories get onto the page

The Cool News section reads one file, `data/news.json`. It's kept up to date by a scheduled
pipeline in `scripts/news/` — see `scripts/news/README.md` for the full how-it-works and one-time
setup (an OpenRouter key as a repo secret). This file is the shorter reference: the flow, the file
format, and how the frontend renders a story.

There is no Anime or Gaming here — this section is AI-builder content across five fixed topics.

## Running it on demand from the site

The Cool News section header has a **Refresh** button. It does not call OpenRouter or GitHub
directly — a key or token in the site's own JavaScript would be readable by every visitor via dev
tools. Instead it calls a small Cloudflare Worker (`cloudflare/`, see `cloudflare/README.md` for
setup) that holds a GitHub token server-side and fires the same `workflow_dispatch` a manual "Run
workflow" click on the Actions tab would. The button polls for the run to finish, then re-fetches
`data/news.json` straight from GitHub and re-renders — no page reload needed. Until the Worker is
deployed and its URL set in `js/content.js`'s `NEWS_TRIGGER_URL`, the button just explains that
plainly instead of failing silently. This is optional — the pipeline runs daily on schedule with or
without it.

## The five topics

| `category` | Covers | Discovered via |
|---|---|---|
| `models` | Open source models and their tailored use cases | Hugging Face's blog (official) + Hacker News (40+ points) |
| `claude` | Claude platform updates | Anthropic's release-notes page, scraped directly |
| `tools` | New free AI tools for image/video generation | Hacker News "Show HN" (15+ points, image/video keywords) |
| `projects` | End-to-end AI workflows people built with free tools | Hacker News (40+ points, agent/workflow keywords) |
| `repos` | Notable GitHub repos, explained for non-experts | GitHub's daily trending list, filtered to AI relevance |

There's no "2+ outlets" verification bar — it doesn't apply to a GitHub repo or a Show HN post.
Each topic has its own quality signal instead (an official source, a community points threshold, or
trending-list membership), decided inside `scripts/news/discover.mjs` at fetch time. `official` on
a published item records whether it came from a topic's official source.

## The flow

```
 discover (per-topic) ──► extract full text ──► rewrite (OpenRouter) ──► data/news.json ──► site ──► diagram + card art
 (RSS/scrape, own          (Readability,          (nvidia/nemotron-…,      (commit)         (redeploy)  (generated in the
  quality bar per topic)    RSS-summary fallback)   strict template)                                     browser, from data)
```

1. **Discover** (daily, via `.github/workflows/news.yml`). Each of the 5 topics has its own
   discovery function in `discover.mjs` — see the table above.
2. **Skip what's already published** — a simple title-similarity check (`dedupe.mjs`) against
   what's already in `data/news.json` for that category.
3. **Extract** full article text from the story's own page (Readability), falling back to the
   RSS/page summary if that fails. The Claude and GitHub-repo topics skip this step — their
   discovery step already has the real source text (the release-notes page content, or the
   trending feed's README snippet).
4. **Rewrite.** OpenRouter (`OPENROUTER_MODEL`, default `nvidia/nemotron-3-ultra-550b-a55b`),
   system-prompted with `scripts/news/brand-voice.md`, turns the source text into the strict
   template below — no prose, no fluff, structured JSON. No image-generation step: an earlier
   version called Gemini per story, but Google's free tier gives that model a hard `0` quota, so it
   was removed rather than left as a permanently-broken step.
5. **Write `data/news.json`.** Up to `TARGET_PER_CATEGORY` (default 3) new stories per topic per
   run, capped at the newest 8 per topic overall. A topic untouched this run (no qualifying finds,
   sources down) keeps whatever it already had, samples included.
6. **Publish.** The workflow commits `data/news.json` straight to `main` if it changed. Whatever's
   hosting the site redeploys on push. There's no server; the "backend" is entirely CI + a
   committed file.
7. **Visuals, generated in the browser, for free.** The site never received a real photo for any
   story — instead, `js/content.js` procedurally draws each card's thumbnail (an SVG gradient +
   network motif, seeded from the story's id, so it's stable across visits) and, inside the article
   modal, an actual flowchart diagram built from the `workflow` array (boxes and arrows, matching
   the same diagram style used on the About-me page). No API, no key, no rate limit, no cost.

## The strict article template

Every item's fields, beyond the usual `id`/`category`/`url`/`source`/`published`/`likes`/etc.:

| Field | Meaning |
|---|---|
| `topicTag` | One of exactly: `Claude`, `Open source models`, `Free AI Tools`, `AI Projects` — the article's own classification, independent of which `category` discovered it |
| `endUser` | Who it's useful to |
| `toolsUsed` | Array of tool/library/model names |
| `costStructure` | Free / free tier + paid / paid, with numbers if known |
| `howItWorks` | 2-4 sentences, mechanism only |
| `inputNeeded` / `outputGiven` | What you provide / what you get |
| `workflow` | Array of ordered steps — renders as an actual flowchart diagram in the modal (boxes + arrows), not prose |
| `useCases` | Array of practical use cases |
| `hardwareRequirements` | Specific, or `"None"` |
| `integrations` | Named apps/services it connects to, or `"None"` |
| `subscriptionsRequired` | `"No"`, or the specific paid tier needed |

This is deliberately **not** raw HTML: `js/content.js` (`renderTemplate`) escapes every string and
maps each field to a fixed row in the article modal. A rewritten article can never inject markup
into the page, no matter what the source site or the model produced. An item without these fields
yet (old data, or a story the pipeline hasn't reached) falls back to showing its plain `summary`.

## Frontend: cards and the article modal

Clicking a card's title or its "Read article" button (`js/content.js`, `data-article-open`) never
navigates away — it opens `#article` (the same panel component as the About-me sheets), rendering
a hero image (real if `image` is ever set, generated card art otherwise), the topic tag, every
template field as a labeled row (the `workflow` field as a diagram, not a list), and a "Read the
original at `source.name`" button linking to `url` in a new tab. The card's own byline "Original
report ↗" link still jumps straight to `source.url` for anyone who wants to skip the rewrite
entirely.

## Likes and dislikes

Each visitor's vote is saved in their own browser (`localStorage`, key `pp-votes`), on top of the
counts in the file. Shared counts need a small backend (Cloudflare Worker + KV, or Supabase) — not
built yet, out of scope for the article pipeline itself.
