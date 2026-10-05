import { DISCOVER } from './discover.mjs';
import { extractText } from './extract.mjs';
import { words as titleWords, alreadyCovered } from './dedupe.mjs';
import { generateArticle, FatalApiError } from './generate.mjs';
import { loadStore, toItem, mergeItems, finalizeAndWrite } from './store.mjs';

// Most specific section first: a story that fits Claude or open models is claimed there before the
// broader Projects / General sections see it (a link is only ever written up once, in one section).
const CATEGORIES = ['claude', 'models', 'repos', 'tools', 'projects', 'general'];
const TARGET_PER_CATEGORY = Number(process.env.TARGET_PER_CATEGORY || 4);
// how many candidates a section may try (some get rejected by the model as a poor fit)
const MAX_ATTEMPTS = Number(process.env.MAX_ATTEMPTS || 12);
const CONCURRENCY = 3;
const SKIP_MEMORY = 400;

const stats = { candidates: 0, attempted: 0, written: 0, skipped: 0, failed: 0 };

async function runCategory(store, category, seen, skipped) {
  console.log(`\n=== ${category} ===`);
  const existingReal = store.items.filter(it => it.category === category && !it.sample);
  const takenIds = new Set(existingReal.map(it => it.id));

  const candidates = await DISCOVER[category]();
  console.log(`[run] discovered ${candidates.length} candidate${candidates.length === 1 ? '' : 's'}`);
  stats.candidates += candidates.length;

  const queue = candidates
    .filter(c => !skipped.has(c.link) && !alreadyCovered(c, seen))
    .slice(0, MAX_ATTEMPTS);
  const newItems = [];

  // a few at a time; stop once the section has enough new stories
  async function worker() {
    while (queue.length && newItems.length < TARGET_PER_CATEGORY) {
      const primary = queue.shift();
      if (alreadyCovered(primary, seen)) continue;
      seen.push({ url: primary.link, titleWords: titleWords(primary.title) }); // claim it before the slow part
      stats.attempted++;
      console.log(`[run] writing: "${primary.title}"`);
      const { text, full } = primary.skipExtract
        ? { text: primary.summary || primary.title, full: true }
        : await extractText(primary);
      const sourceText = primary.summary && !primary.skipExtract ? `${primary.summary}\n\n${text}` : text;
      const result = await generateArticle({ category, primary, sourceText, full });
      if (!result) { stats.failed++; continue; }
      if (result.skip) {
        stats.skipped++;
        skipped.add(primary.link);
        console.log(`[run]   skipped: ${result.skip}`);
        continue;
      }
      if (newItems.length >= TARGET_PER_CATEGORY) break;
      newItems.push(toItem({ category, article: result.article, primary, existing: null, takenIds }));
      stats.written++;
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`[run] ${newItems.length} new ${newItems.length === 1 ? 'story' : 'stories'} for ${category}`);
  return mergeItems(store, category, newItems);
}

async function main() {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new FatalApiError('OPENROUTER_API_KEY is not set — add it as a repository secret (Settings → Secrets and variables → Actions) or to scripts/news/openrouterkey.env locally.');
  }
  let store = loadStore();
  // every link already on the site, across all sections, so nothing is written up twice
  const seen = store.items.filter(it => !it.sample).map(it => ({ url: it.url, titleWords: titleWords(it.title) }));
  const skipped = new Set(store.skipped || []);
  for (const category of CATEGORIES) {
    try {
      store = await runCategory(store, category, seen, skipped);
    } catch (err) {
      if (err instanceof FatalApiError) throw err;
      // one section blowing up should never take the others down with it
      console.error(`[run] category "${category}" failed: ${err.stack || err.message}`);
    }
  }
  store.skipped = [...skipped].slice(-SKIP_MEMORY);
  const written = finalizeAndWrite(store);
  console.log(`\n[run] wrote ${written}`);
  console.log(`[run] ${JSON.stringify(stats)}`);
  // Loud failure: stories were there to write but every model call failed — that's a broken key or
  // model, not a quiet news day, and the Action should go red instead of "succeeding" with nothing.
  if (stats.attempted > 0 && stats.written === 0 && stats.skipped === 0) {
    throw new Error(`all ${stats.attempted} generation attempts failed — check the OpenRouter key/model`);
  }
}

main()
  .then(() => process.exit(0)) // rss-parser/undici keep HTTP keep-alive sockets open, which can
  .catch(err => {              // otherwise leave the process hanging well after the real work is done
    console.error(`[run] FAILED: ${err.message}`);
    process.exit(1);
  });
