// Peaceful Pursuit — Cool News refresh trigger.
//
// The site's "Refresh" button can't call OpenRouter (or GitHub) directly: any secret placed in
// browser JS is readable by anyone who opens dev tools on the page, and an OpenRouter key sitting
// in public client code means anyone visiting the site could run up charges on it. This Worker is
// the one place the real secret (a GitHub token, NOT the OpenRouter key) lives — it never ships to
// the browser. The browser only ever talks to this Worker; this Worker is the only thing that ever
// talks to GitHub's API.
//
// What it does: POST /trigger fires a workflow_dispatch on .github/workflows/news.yml, which runs
// the actual pipeline (scripts/news/run.mjs, using the OPENROUTER_API_KEY repo secret — a
// completely separate secret from this Worker's GITHUB_TOKEN) and commits new articles if it finds
// any. GET /status reports the latest run's state so the button can show progress.
//
// Required bindings (see wrangler.toml / README.md in this folder):
//   - env.GITHUB_TOKEN   (secret, `wrangler secret put GITHUB_TOKEN`) — fine-grained PAT, scoped to
//                         this one repo, "Actions: Read and write" permission only.
//   - env.NEWS_KV        (KV namespace) — stores the last-triggered timestamp for the cooldown.
//   - env.GITHUB_OWNER, env.GITHUB_REPO, env.WORKFLOW_FILE, env.ALLOWED_ORIGIN (plain vars)

const COOLDOWN_MS = 10 * 60 * 1000; // one manual trigger per 10 minutes — cheap insurance against
                                     // someone hammering the button and burning OpenRouter credit

function isAllowedOrigin(origin, env) {
  if (!origin) return false;
  if (/^https?:\/\/localhost(:\d+)?$/.test(origin) || /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) return true;
  const allowed = (env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
  return allowed.includes(origin);
}

function corsHeaders(origin, env) {
  const headers = { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' };
  if (isAllowedOrigin(origin, env)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}

async function githubRequest(env, path, init) {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'peaceful-pursuit-news-trigger',
      ...(init && init.headers),
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin, env);

    if (request.method === 'OPTIONS') return new Response(null, { headers });
    // A request from a page this Worker doesn't recognize gets no CORS header above, so the
    // browser blocks the response from ever reaching that page's JS — this isn't hardened against
    // a direct curl (nothing here is secret-bearing to leak either way), just against the button
    // being embedded on some other site and quietly firing on your GitHub Action.
    if (!isAllowedOrigin(origin, env) && request.method !== 'GET') {
      return json({ ok: false, error: 'origin not allowed' }, 403, headers);
    }

    if (url.pathname === '/trigger' && request.method === 'POST') {
      const last = Number((await env.NEWS_KV.get('last_trigger_at')) || 0);
      const now = Date.now();
      if (now - last < COOLDOWN_MS) {
        return json({ ok: false, error: 'cooldown', retryAfterSeconds: Math.ceil((COOLDOWN_MS - (now - last)) / 1000) }, 429, headers);
      }
      const res = await githubRequest(env, `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/actions/workflows/${env.WORKFLOW_FILE}/dispatches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: env.GITHUB_REF || 'main' }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return json({ ok: false, error: `GitHub ${res.status}: ${text.slice(0, 300)}` }, 502, headers);
      }
      await env.NEWS_KV.put('last_trigger_at', String(now));
      return json({ ok: true, triggeredAt: now }, 200, headers);
    }

    if (url.pathname === '/status' && request.method === 'GET') {
      const res = await githubRequest(env, `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/actions/workflows/${env.WORKFLOW_FILE}/runs?per_page=1`);
      if (!res.ok) return json({ ok: false }, 502, headers);
      const data = await res.json();
      const run = data.workflow_runs && data.workflow_runs[0];
      return json({
        ok: true,
        run: run ? { status: run.status, conclusion: run.conclusion, htmlUrl: run.html_url, createdAt: run.created_at, updatedAt: run.updated_at } : null,
      }, 200, headers);
    }

    return json({ ok: false, error: 'not found' }, 404, headers);
  },
};
