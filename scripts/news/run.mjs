import { DISCOVER } from './discover.mjs';
import { extractText } from './extract.mjs';
import { words as titleWords, alreadyCovered } from './dedupe.mjs';
import { generateArticle } from './generate.mjs';
import { loadStore, toItem, mergeItems, finalizeAndWrite } from './store.mjs';

const CATEGORIES = ['models', 'claude', 'tools', 'projects', 'repos'];
const TARGET_PER_CATEGORY = Number(process.env.TARGET_PER_CATEGORY || 3);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runCategory(store, category) {
  console.log(`\n=== ${category} ===`);
  const existingReal = store.items.filter(it => it.category === category && !it.sample);
  const takenIds = new Set(existingReal.map(it => it.id));
  // Grows as we write new items this run too, so two similar candidates discovered in the SAME
  // run (e.g. the same repo surfacing under two queries) can't both slip through — not just
  // duplicates of what was already published before this run started.
  const seen = existingReal.map(it => ({ url: it.url, titleWords: titleWords(it.title) }));

  const candidates = await DISCOVER[category]();
  console.log(`[run] discovered ${candidates.length} qualifying candidate${candidates.length === 1 ? '' : 's'}`);

  const fresh = candidates
    .filter(c => !alreadyCovered(c, seen))
    .sort((a, b) => (a.published < b.published ? 1 : -1))
    .slice(0, TARGET_PER_CATEGORY);

  console.log(`[run] ${fresh.length} new ${fresh.length === 1 ? 'story' : 'stories'} to write`);

  const newItems = [];
  for (const primary of fresh) {
    console.log(`[run] writing: "${primary.title}"`);
    const { text, full } = primary.skipExtract
      ? { text: primary.summary || primary.title, full: true }
      : await extractText(primary);
    const article = await generateArticle({ category, primary, sourceText: text, full });
    if (!article) continue;
    const item = toItem({ category, article, primary, existing: null, takenIds });
    newItems.push(item);
    seen.push({ url: item.url, titleWords: titleWords(item.title) });
    await sleep(500);
  }
  return mergeItems(store, category, newItems);
}

async function main() {
  let store = loadStore();
  for (const category of CATEGORIES) {
    try {
      store = await runCategory(store, category);
    } catch (err) {
      // one category blowing up should never take the others down with it
      console.error(`[run] category "${category}" failed: ${err.stack || err.message}`);
    }
  }
  const written = finalizeAndWrite(store);
  console.log(`\n[run] wrote ${written}`);
}

main()
  .then(() => process.exit(0)) // rss-parser/undici keep HTTP keep-alive sockets open, which can
  .catch(err => {              // otherwise leave the process hanging well after the real work is done
    console.error(err);
    process.exit(1);
  });
