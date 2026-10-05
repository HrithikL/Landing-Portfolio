import { JSDOM } from 'jsdom';
import { fetchFeed, normalizeItem } from './fetch-rss.mjs';

// Discovery: finds candidate stories for each Cool News section. Every section is about cool things
// people (vibe coders, indie devs, small teams) BUILT with AI — not corporate news. So:
//   - everything is limited to the past DAYS_BACK days (the site promises "stories from the past week")
//   - anything about people joining/leaving/being hired by a company is dropped here, before it can
//     cost a model call (the model is told to reject it too, as a second line of defence)
// Sources are plain public JSON/HTML endpoints that answer from CI without auth: Hacker News via the
// Algolia search API (Show HN is literally "I built this"), Anthropic's release notes, GitHub's own
// search API and the weekly trending list. (Reddit refuses unauthenticated bots, so it isn't used.)

const UA = 'PeacefulPursuitNewsBot/1.1 (+https://github.com/HrithikL/Landing-Portfolio)';
export const DAYS_BACK = Number(process.env.NEWS_DAYS_BACK || 7);
const since = () => Math.floor(Date.now() / 1000) - DAYS_BACK * 86400;
const withinWindow = iso => Date.now() - Date.parse(iso) <= DAYS_BACK * 86400 * 1000;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// People moves are not stories here, ever.
const PEOPLE_NEWS = /\b(joins?|joined|joining|hires?|hired|hiring|leaves|left|leaving|departs?|departure|steps? down|stepping down|appoint(s|ed)?|poach(es|ed)?|resign(s|ed)?|exits?|new (ceo|cto|cfo|head|chief|vp)|welcomes?|onboards?)\b/i;
// Corporate plumbing that isn't something someone built either
const CORPORATE = /\b(raises?|raised|funding|series [a-e]|valuation|acquir(es|ed)|acquisition|layoffs?|lawsuit|sues|ipo)\b/i;
export const isPeopleOrCorporate = text => PEOPLE_NEWS.test(text) || CORPORATE.test(text);

const AI_TERMS = /\b(ai|llm|llms|gpt|agent|agents|agentic|claude|gemini|llama|qwen|mistral|deepseek|gemma|ollama|rag|mcp|copilot|vibe.?cod\w*|diffusion|whisper|embedding|chatbot|model|models|inference|local.?llm)\b/i;

async function getJson(url, { headers = {}, label } = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt === 0) { await sleep(1500); continue; }
      console.warn(`[discover] ${label || url} failed: ${err.message}`);
      return null;
    }
  }
}

// ---------- Hacker News (Algolia) ----------
// One query → stories from the window with at least `points`, newest-and-best first. `show` limits to
// Show HN posts, i.e. someone presenting a thing they made.
async function hn(query, { points = 10, show = false, max = 30 } = {}) {
  const params = new URLSearchParams({
    query, tags: show ? 'show_hn' : 'story', hitsPerPage: String(max),
    numericFilters: `created_at_i>${since()},points>=${points}`,
  });
  const data = await getJson(`https://hn.algolia.com/api/v1/search?${params}`, { label: `HN "${query}"` });
  return (data && data.hits || []).map(h => {
    const link = h.url || `https://news.ycombinator.com/item?id=${h.objectID}`;
    return {
      title: (h.title || '').replace(/^Show HN:\s*/i, '').trim(),
      rawTitle: h.title || '',
      link,
      discussion: `https://news.ycombinator.com/item?id=${h.objectID}`,
      summary: stripHtml(h.story_text || ''),
      author: h.author || 'Hacker News',
      published: new Date((h.created_at_i || Date.now() / 1000) * 1000).toISOString(),
      points: h.points || 0,
      sourceName: h.url ? hostOf(h.url) : 'Hacker News',
      sourceUrl: h.url ? originOf(h.url) : 'https://news.ycombinator.com',
      official: false,
    };
  }).filter(it => it.title && it.link);
}

function stripHtml(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&[a-z0-9#]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return 'Source'; } };
const originOf = u => { try { return new URL(u).origin; } catch (e) { return u; } };

async function hnMany(queries, opts) {
  const out = [];
  for (const q of queries) { out.push(...await hn(q, opts)); await sleep(250); }
  return out;
}

// common final filter: in the window, not people/corporate news, de-duplicated by link
function clean(list, category, { requireAi = true } = {}) {
  const seen = new Set();
  return list.filter(it => {
    if (!it || !it.link || seen.has(it.link)) return false;
    seen.add(it.link);
    const blob = `${it.rawTitle || it.title} ${it.summary || ''}`;
    if (!withinWindow(it.published)) return false;
    if (isPeopleOrCorporate(it.rawTitle || it.title)) return false;
    if (requireAi && !AI_TERMS.test(blob)) return false;
    return true;
  }).map(it => ({ ...it, category })).sort((a, b) => (b.points || 0) - (a.points || 0));
}

// ---------- 1. Open Source AI Models: projects people built on open models ----------
const OPEN_MODELS = ['llama', 'qwen', 'mistral', 'deepseek', 'gemma', 'gpt-oss', 'ollama', 'llama.cpp', 'local llm', 'open source model', 'open weights', 'nemotron', 'phi-4', 'whisper', 'stable diffusion', 'flux', 'mlx', 'vllm'];
export async function discoverModels() {
  const hits = await hnMany(OPEN_MODELS, { points: 8, show: true, max: 15 });
  return clean(hits, 'models').filter(it => /llama|qwen|mistral|deepseek|gemma|gpt-oss|ollama|nemotron|phi|whisper|diffusion|flux|mlx|vllm|open.?(source|weight)|local/i.test(`${it.rawTitle} ${it.summary}`));
}

// ---------- 2. Claude: projects built with Claude, token-saving tips, new features ----------
const CLAUDE_RELEASE_NOTES_URL = 'https://docs.claude.com/en/release-notes/overview';
async function claudeReleaseNotes() {
  try {
    const res = await fetch(CLAUDE_RELEASE_NOTES_URL, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`bad response ${res.status}`);
    const dom = new JSDOM(await res.text());
    const headings = [...dom.window.document.querySelectorAll('h3[id]')].slice(0, 6);
    return headings.map(h => {
      // the heading id is the date ("september-30-2026"); its text can carry extra words
      const fromId = h.id.replace(/-/g, ' ');
      const d = new Date(fromId);
      let node = h.nextElementSibling, text = '';
      while (node && node.tagName !== 'H3' && text.length < 4000) { text += ' ' + node.textContent.trim(); node = node.nextElementSibling; }
      return {
        title: `New in Claude — ${h.textContent.trim()}`,
        rawTitle: h.textContent.trim(),
        link: `${CLAUDE_RELEASE_NOTES_URL}#${h.id}`,
        summary: text.trim(),
        author: 'Anthropic',
        published: isNaN(d) ? new Date(0).toISOString() : d.toISOString(),
        sourceName: 'Claude release notes', sourceUrl: CLAUDE_RELEASE_NOTES_URL, official: true,
        skipExtract: true, kind: 'feature', points: 1000,
      };
    });
  } catch (err) {
    console.warn(`[discover] Claude release notes failed: ${err.message}`);
    return [];
  }
}
export async function discoverClaude() {
  const features = await claudeReleaseNotes();
  const projects = (await hnMany(['claude', 'claude code', 'built with claude', 'claude skill', 'claude mcp'], { points: 10, show: true, max: 15 }))
    .map(it => ({ ...it, kind: 'project' }));
  const tips = (await hnMany(['claude code tokens', 'claude token usage', 'claude code tips', 'claude context window', 'claude.md', 'claude code cost'], { points: 15, max: 10 }))
    .map(it => ({ ...it, kind: 'tip' }));
  // a balanced mix: newest features, the best projects, and a couple of tips
  const f = clean(features, 'claude', { requireAi: false }).slice(0, 2);
  const p = clean(projects, 'claude').filter(it => /claude/i.test(`${it.rawTitle} ${it.summary}`)).slice(0, 4);
  const t = clean(tips, 'claude').filter(it => /claude/i.test(`${it.rawTitle} ${it.summary}`) && /token|cost|context|cache|tip|usage|limit|cheap|save/i.test(`${it.rawTitle} ${it.summary}`)).slice(0, 2);
  return [...f, ...t, ...p];
}

// ---------- 3. Cool AI Projects & Workflows: end-to-end builds on free tools ----------
export async function discoverProjects() {
  const hits = await hnMany(['ai agent', 'built with ai', 'vibe coded', 'vibe coding', 'ai workflow', 'automation ai', 'llm app', 'ai side project', 'free ai'], { points: 12, show: true, max: 20 });
  return clean(hits, 'projects');
}

// ---------- 4. Tools: free tools many people use, with what they're used for ----------
export async function discoverTools() {
  const hits = await hnMany(['free ai tool', 'open source alternative', 'free tool', 'cli', 'browser extension', 'self-hosted', 'open source ai tool', 'local-first', 'desktop app ai', 'vscode extension', 'mcp server', 'chrome extension ai'], { points: 8, show: true, max: 30 });
  return clean(hits, 'tools');
}

// ---------- 5. Top GitHub repos of the week: AI repos for web dev, software, games, problem-solving ----------
// GitHub's own numbers are the quality bar: repos created this week ranked by stars, plus the weekly
// trending list. The model then keeps only websites, apps, games and problem-solving tools (it rejects
// awesome-lists, newsletters, prompt dumps and course material).
export async function discoverRepos() {
  const day = new Date(Date.now() - DAYS_BACK * 86400 * 1000).toISOString().slice(0, 10);
  const headers = process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {};
  const out = [];
  for (const q of ['ai', 'llm', 'agent', 'claude', 'game ai', 'website ai']) {
    const params = new URLSearchParams({ q: `${q} created:>${day} in:name,description,topics`, sort: 'stars', order: 'desc', per_page: '15' });
    const data = await getJson(`https://api.github.com/search/repositories?${params}`, { headers, label: `GitHub search "${q}"` });
    for (const r of (data && data.items) || []) {
      if (r.fork || r.archived || (r.stargazers_count || 0) < 40) continue;
      out.push({
        title: r.full_name, rawTitle: `${r.full_name} ${r.description || ''}`, link: r.html_url,
        summary: [r.description, r.topics && r.topics.length ? `Topics: ${r.topics.join(', ')}` : '', r.language ? `Language: ${r.language}` : '', `${r.stargazers_count} stars this week`].filter(Boolean).join('. '),
        author: r.owner && r.owner.login || 'GitHub', published: r.created_at,
        sourceName: 'GitHub', sourceUrl: 'https://github.com', official: false, points: r.stargazers_count, readme: `${r.full_name}`,
      });
    }
    await sleep(800);
  }
  // the weekly trending list (older repos that broke out this week)
  try {
    const raw = await fetchFeed('https://mshibanami.github.io/GitHubTrendingRSS/weekly/all.xml');
    raw.forEach((r, i) => {
      const it = normalizeItem({ ...r, contentSnippet: stripHtml(r.content || r.contentSnippet || '') }, { sourceName: 'GitHub', sourceUrl: 'https://github.com', official: false });
      if (it) out.push({ ...it, rawTitle: `${it.title} ${it.summary}`, published: new Date().toISOString(), points: 500 - i * 10, readme: it.title });
    });
  } catch (err) { console.warn(`[discover] GitHub weekly trending failed: ${err.message}`); }
  return clean(out, 'repos').filter(it => !/\b(awesome|newsletter|weekly|interview|roadmap|course|tutorials?|cheatsheet|prompts? collection|leaked|system prompts)\b/i.test(it.rawTitle));
}

// ---------- 6. General: cool AI builds that don't fit the other sections ----------
export async function discoverGeneral() {
  const hits = await hnMany(['ai', 'llm', 'gpt', 'machine learning', 'ai game', 'ai art', 'ai music', 'ai hardware', 'generated', 'neural'], { points: 10, show: true, max: 30 });
  return clean(hits, 'general');
}

export const DISCOVER = { models: discoverModels, claude: discoverClaude, projects: discoverProjects, tools: discoverTools, repos: discoverRepos, general: discoverGeneral };
