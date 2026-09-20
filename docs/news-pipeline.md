# Cool News: how stories will get onto the page

The Cool News section reads one file, `data/news.json`. Today that file holds sample stories. The plan below replaces them with real, verified stories automatically, without changing the page.

## The flow

```
 sources ──► fetch ──► group ──► verify ──► write the teaser ──► make the image ──► data/news.json ──► site
 (RSS/APIs)   (daily)   (same story)  (2+ sources)  (Claude)          (image model)       (commit)          (deploy)
```

1. **Fetch** (scheduled, for example every morning at 7 am AEST). Pull the newest items from each topic's feeds:
   - **AI**: The Verge AI, MIT Technology Review, Ars Technica, TechCrunch AI, and the Anthropic, OpenAI and Google DeepMind blogs
   - **Anime**: Anime News Network, Crunchyroll News, MyAnimeList News, Anime Corner
   - **Gaming**: IGN, Polygon, Eurogamer, GameSpot, PC Gamer, Rock Paper Shotgun
2. **Group** items that report the same story (matching titles, links and key names), so one story becomes one card.
3. **Verify.** A story is only published when it's either:
   - reported by at least **two independent outlets**, or
   - announced on the **official source** (a company blog or a studio's site).

   `verified: true` and `sources: <count>` record the result. Anything else waits for the next run.
4. **Write the teaser.** Claude (for example `claude-sonnet-5`) reads the original articles and writes:
   - a plain, accurate title;
   - a 1–2 sentence summary that makes people want to click (the lure) without claiming anything the sources don't say;
   - an `imagePrompt` describing a picture for the card.
5. **Make the image.** An image model turns `imagePrompt` into a card picture in the site's candy palette, saved as `assets/news/<id>.webp` and linked from `image`. If this step fails, the page falls back to its own generated artwork.
6. **Write `data/news.json`.** Keep the newest ~8 stories per topic and drop `sample`.
7. **Publish.** Commit the file and images; the static host (for example GitHub Pages) redeploys.

A GitHub Action on a cron schedule can run all of it, with the API keys kept in repository secrets.

## The file format

Each item in `items` has the following fields:

| Field | Meaning |
|---|---|
| `id` | Stable id, such as `ai-2026-09-19-agents` |
| `category` | `ai`, `anime` or `gaming` |
| `title`, `summary` | What the card shows |
| `url` | "Open article": the original report |
| `source.name`, `source.url` | The publisher, shown and linked on the card |
| `author` | Byline from the original report |
| `published` | Publication date, `YYYY-MM-DD` |
| `verified`, `sources` | Verification result and outlet count |
| `likes`, `dislikes` | Starting counts (see below) |
| `image`, `imagePrompt` | Card picture, and the prompt that made it |
| `sample` | Only on placeholder stories; shows a "Sample" tag |

## Likes and dislikes

For now each visitor's vote is saved in their own browser (`localStorage`, key `pp-votes`), on top of the counts in the file. Shared counts need a small backend:

- a store such as a Cloudflare Worker with KV, or Supabase;
- `POST /vote {id, vote}` to record a vote;
- `GET /counts` to read the totals, which the page merges in.
