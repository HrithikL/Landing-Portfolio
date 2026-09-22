# Cool News refresh trigger (Cloudflare Worker)

Lets the site's "Refresh" button kick off the Cool News pipeline on demand, instead of waiting for
the daily schedule — without ever putting an API key in the browser. See `worker.js`'s own comment
for exactly what it does and why. This is optional: the pipeline keeps running on its daily
schedule with or without this.

## Why a Worker at all

The button needs to trigger a GitHub Actions run, which needs a GitHub token. A token — any token —
sitting in the site's JavaScript is readable by every visitor via dev tools. This Worker holds that
one token server-side; the browser only ever talks to the Worker, and the Worker is the only thing
that ever talks to GitHub. The Worker's own URL isn't secret (it can't do anything harmful if
someone finds it — worst case they can force an extra pipeline run, which the 10-minute cooldown in
`worker.js` limits), only the token inside it is.

## One-time setup

1. **Create a free Cloudflare account** (if you don't have one): https://dash.cloudflare.com/sign-up

2. **Install Wrangler** (Cloudflare's CLI), from the repo root:
   ```bash
   npm install -g wrangler
   wrangler login
   ```

3. **Create the KV namespace** (stores the cooldown timestamp):
   ```bash
   cd cloudflare
   wrangler kv namespace create NEWS_KV
   ```
   This prints an `id`. Paste it into `wrangler.toml` in place of `REPLACE_ME`.

4. **Create a GitHub token scoped to just this repo**:
   - GitHub → Settings → Developer settings → **Fine-grained tokens** → *Generate new token*
   - Repository access: **Only select repositories** → this repo
   - Permissions: **Actions → Read and write**. Nothing else.
   - Copy the token (you won't see it again).

5. **Set it as a Worker secret** (not in `wrangler.toml` — this keeps it out of git entirely):
   ```bash
   wrangler secret put GITHUB_TOKEN
   ```
   Paste the token when prompted.

6. **Update `wrangler.toml`**: set `ALLOWED_ORIGIN` to wherever the site is actually hosted (e.g.
   `https://yourusername.github.io` or a custom domain). This is what stops some other site from
   embedding your button and firing your Action.

7. **Deploy**:
   ```bash
   wrangler deploy
   ```
   This prints your Worker's URL, something like
   `https://peaceful-pursuit-news-trigger.<your-subdomain>.workers.dev`.

8. **Wire it into the site**: open `js/content.js`, find the `NEWS_TRIGGER_URL` constant near the
   top of the "Cool news" section, and set it to the URL from step 7.

That's it — the site's Refresh button now calls this Worker, which calls GitHub, which runs the
same pipeline `scripts/news/run.mjs` already runs on its daily schedule.

## Local testing

```bash
wrangler dev
```

Runs the Worker locally (prints a `localhost` URL) so you can test `/trigger` and `/status` before
deploying for real — useful since triggering it for real spends OpenRouter credit each time.

## Cost

Cloudflare Workers' free tier (100,000 requests/day) and free KV tier (1,000 writes/day, 100,000
reads/day) cover this completely — a personal site's refresh button won't come close. The only real
cost is still OpenRouter, same as every other pipeline run.
