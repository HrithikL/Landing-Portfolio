import Parser from 'rss-parser';

const parser = new Parser({
  timeout: 15000,
  headers: { 'User-Agent': 'PeacefulPursuitNewsBot/1.0 (+https://github.com/HrithikL/Landing-Portfolio)' },
});

// Low-level: fetch and parse one RSS/Atom feed into rss-parser's raw item shape. A dead/broken
// feed throws — callers decide how to handle that (skip it, warn, etc.) rather than this module
// deciding for them.
export async function fetchFeed(url) {
  const feed = await parser.parseURL(url);
  return feed.items || [];
}

// Normalizes one rss-parser item into the shape the rest of the pipeline expects. `extra` lets a
// caller attach source-specific metadata (sourceName, official, score, ...) without this function
// needing to know about every possible source type.
export function normalizeItem(raw, extra) {
  const published = raw.isoDate || raw.pubDate;
  const ts = published ? Date.parse(published) : NaN;
  if (!raw.title || !raw.link) return null;
  return {
    title: raw.title.trim(),
    link: raw.link.trim(),
    summary: (raw.contentSnippet || raw.content || raw.summary || '').trim(),
    author: raw.creator || raw.author || (extra && extra.sourceName) || '',
    published: !isNaN(ts) ? new Date(ts).toISOString() : new Date().toISOString(),
    ...extra,
  };
}
