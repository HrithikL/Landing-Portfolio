// Tiny title-similarity check so the same story/repo/release doesn't get rewritten (and re-billed)
// every single day. Not entity resolution — just enough to notice "we already wrote this one".
const STOPWORDS = new Set(['a', 'an', 'the', 'of', 'in', 'on', 'to', 'for', 'and', 'or', 'is', 'are', 'with', 'at', 'as', 'by', 'from', 'new']);

export function words(title) {
  return new Set(
    String(title).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOPWORDS.has(w))
  );
}

export function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let hits = 0;
  for (const w of a) if (b.has(w)) hits++;
  return hits / (a.size + b.size - hits);
}

const ALREADY_COVERED_SIMILARITY = 0.5;

// Title-similarity alone isn't enough: the STORED title is the model's rewritten headline, which
// for repos/Claude-release-notes reads nothing like the raw discovered title ("owner/repo", or
// "Claude release notes — September 3, 2026") — word overlap between the two is near zero even
// though it's definitely the same story, so a title-only check let real duplicates through (the
// same repo/release got rewritten twice under different headlines). The link is stable across
// runs regardless of how differently the model titles it each time, so check that first.
export function alreadyCovered(candidate, existing) {
  if (existing.some(it => it.url === candidate.link)) return true;
  const w = words(candidate.title);
  return existing.some(it => jaccard(it.titleWords, w) >= ALREADY_COVERED_SIMILARITY);
}
