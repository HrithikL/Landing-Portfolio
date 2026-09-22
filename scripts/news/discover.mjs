import { JSDOM } from 'jsdom';
import { fetchFeed, normalizeItem } from './fetch-rss.mjs';

const UA = 'PeacefulPursuitNewsBot/1.0 (+https://github.com/HrithikL/Landing-Portfolio)';
const DAYS_BACK = 3;

function withinWindow(iso) {
  return Date.now() - Date.parse(iso) <= DAYS_BACK * 24 * 60 * 60 * 1000;
}

function stripHtml(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z0-9#]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}

const AI_KEYWORDS = [
  'ai', 'llm', 'gpt', 'gemini', 'claude', 'agent', 'ml', 'machine learning', 'neural', 'diffusion',
  'transformer', 'langchain', 'rag', 'embedding', 'genai', 'generative', 'copilot', 'chatbot',
  'fine-tun', 'inference', 'vision model', 'multimodal',
];
function looksAiRelated(text) {
  const t = text.toLowerCase();
  return AI_KEYWORDS.some(k => t.includes(k));
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// External feeds occasionally hiccup (a reset connection, a slow response past the timeout) —
// worth one retry before giving up on a source for this run, rather than losing a whole category's
// candidates to a single transient blip.
async function safeFetchFeed(label, url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fetchFeed(url);
    } catch (err) {
      if (attempt === 0) { await sleep(1500); continue; }
      console.warn(`[discover] ${label} feed failed: ${err.message}`);
      return [];
    }
  }
}

// ---------- 1. Open Source Models ----------
// Official (Hugging Face's own blog) always qualifies; community chatter about a specific model
// only counts once Hacker News's own points threshold says enough people cared.
export async function discoverModels() {
  const out = [];
  const hf = await safeFetchFeed('Hugging Face blog', 'https://huggingface.co/blog/feed.xml');
  for (const raw of hf) {
    const it = normalizeItem(raw, { sourceName: 'Hugging Face Blog', sourceUrl: 'https://huggingface.co/blog', official: true, category: 'models' });
    if (it && withinWindow(it.published)) out.push(it);
  }
  const hn = await safeFetchFeed('HN (open models)', 'https://hnrss.org/newest?q=open+source+model&points=40');
  for (const raw of hn) {
    const it = normalizeItem(raw, { sourceName: 'Hacker News', sourceUrl: 'https://news.ycombinator.com', official: false, category: 'models' });
    if (it && withinWindow(it.published)) out.push(it);
  }
  return out;
}

// ---------- 2. Claude Updates ----------
// Anthropic doesn't publish RSS for this, but the release-notes page server-renders one
// <h3 id="month-day-year"> section per day, so we scrape it directly instead of via a feed.
const CLAUDE_RELEASE_NOTES_URL = 'https://docs.claude.com/en/release-notes/overview';
export async function discoverClaude() {
  try {
    const res = await fetch(CLAUDE_RELEASE_NOTES_URL, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`bad response ${res.status}`);
    const html = await res.text();
    const dom = new JSDOM(html);
    const headings = [...dom.window.document.querySelectorAll('h3[id]')].slice(0, 4); // most recent few only
    return headings.map(h => {
      const dateText = h.textContent.trim();
      let node = h.nextElementSibling, text = '';
      while (node && node.tagName !== 'H3' && text.length < 4000) {
        text += ' ' + node.textContent.trim();
        node = node.nextElementSibling;
      }
      return {
        title: `Claude release notes — ${dateText}`,
        link: `${CLAUDE_RELEASE_NOTES_URL}#${h.id}`,
        summary: text.trim(),
        author: 'Anthropic',
        published: new Date(dateText).toString() !== 'Invalid Date' ? new Date(dateText).toISOString() : new Date().toISOString(),
        sourceName: 'Anthropic', sourceUrl: 'https://www.anthropic.com', official: true, category: 'claude',
        skipExtract: true, // the release-notes text itself IS the source text; no separate article page to fetch
      };
    }).filter(it => withinWindow(it.published));
  } catch (err) {
    console.warn(`[discover] Claude release notes failed: ${err.message}`);
    return [];
  }
}

// ---------- 3. Free AI Tools (image/video generation) ----------
// Show HN is exactly "someone launched a thing" — filter to a modest points bar (Show HN posts
// run lower than the newest firehose) and to titles/text that actually mention image or video.
export async function discoverTools() {
  const raw = await safeFetchFeed('HN Show HN', 'https://hnrss.org/show?points=15');
  const out = [];
  for (const r of raw) {
    const it = normalizeItem(r, { sourceName: 'Hacker News (Show HN)', sourceUrl: 'https://news.ycombinator.com/show', official: false, category: 'tools' });
    if (!it || !withinWindow(it.published)) continue;
    const blob = `${it.title} ${it.summary}`.toLowerCase();
    if (/(image|video|photo|animation|render)/.test(blob) && looksAiRelated(blob)) out.push(it);
  }
  return out;
}

// ---------- 4. Cool AI Projects ----------
// "Someone built an end-to-end thing with free tools" — Hacker News's own points threshold is
// the community-validation signal here, same reasoning as Open Source Models.
export async function discoverProjects() {
  const queries = ['AI+agent+built', 'AI+workflow+automation'];
  const out = [];
  for (const q of queries) {
    const raw = await safeFetchFeed(`HN (${q})`, `https://hnrss.org/newest?q=${q}&points=40`);
    for (const r of raw) {
      const it = normalizeItem(r, { sourceName: 'Hacker News', sourceUrl: 'https://news.ycombinator.com', official: false, category: 'projects' });
      if (it && withinWindow(it.published)) out.push(it);
    }
  }
  return out;
}

// ---------- 5. Best GitHub Repos ----------
// GitHub's own trending algorithm is the quality bar (a repo either is or isn't trending today) —
// we just need to narrow "trending, period" down to "trending AND actually AI-related".
export async function discoverRepos() {
  const raw = await safeFetchFeed('GitHub Trending', 'https://mshibanami.github.io/GitHubTrendingRSS/daily/all.xml');
  const out = [];
  for (const r of raw) {
    const description = stripHtml(r.content || r.contentSnippet || r.summary || '');
    const blob = `${r.title} ${description}`;
    if (!looksAiRelated(blob)) continue;
    const it = normalizeItem({ ...r, contentSnippet: description }, {
      sourceName: 'GitHub Trending', sourceUrl: 'https://github.com/trending', official: false, category: 'repos', skipExtract: true,
    });
    if (it) out.push(it); // trending feed has no per-item date; freshness = "on today's trending list"
  }
  return out;
}

export const DISCOVER = { models: discoverModels, claude: discoverClaude, tools: discoverTools, projects: discoverProjects, repos: discoverRepos };
