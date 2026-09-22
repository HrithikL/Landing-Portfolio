import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

const UA = 'PeacefulPursuitNewsBot/1.0 (+https://github.com/HrithikL/Landing-Portfolio)';
const TIMEOUT_MS = 12000;
const MAX_CHARS = 12000; // plenty for a ~500-word rewrite; keeps the OpenRouter prompt bounded

// Fetches the article's own page and pulls the readable text out of it (Mozilla's Readability —
// the same engine behind Firefox reader mode). Sites that block bots, paywall, time out, or simply
// don't parse cleanly fall back to the RSS item's own summary — always return *something* to
// generate from rather than failing the story outright.
export async function extractText(item) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(item.link, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      redirect: 'follow',
      signal: controller.signal,
    });
    clearTimeout(timer);
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !type.includes('html')) throw new Error(`bad response ${res.status} ${type}`);

    const html = await res.text();
    const dom = new JSDOM(html, { url: item.link });
    const article = new Readability(dom.window.document).parse();
    const text = (article && article.textContent || '').trim();
    if (text.length < 200) throw new Error('article too short after extraction');

    return { text: text.slice(0, MAX_CHARS), full: true };
  } catch (err) {
    console.warn(`[extract] full-text failed for ${item.link}: ${err.message} — falling back to RSS summary`);
    return { text: (item.summary || item.title).slice(0, MAX_CHARS), full: false };
  }
}
