import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { wordCount } from './schema.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, '..', '..', 'data', 'news.json');
const PER_CATEGORY_CAP = 8;
const WPM = 200;

const CATEGORIES = { models: 'Open Source Models', claude: 'Claude Updates', tools: 'Free AI Tools', projects: 'AI Projects', repos: 'GitHub Repos' };

function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'story';
}

export function loadStore() {
  if (!existsSync(DATA_PATH)) {
    return { version: 2, updated: new Date().toISOString(), categories: CATEGORIES, items: [] };
  }
  const store = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
  store.categories = CATEGORIES; // always the current 5 topics, regardless of what an older file had
  return store;
}

function makeId(category, published, title, taken) {
  const date = (published || new Date().toISOString()).slice(0, 10);
  const base = `${category}-${date}-${slugify(title)}`;
  let id = base, n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  taken.add(id);
  return id;
}

// Turns one generated article + its source into a full data/news.json item.
export function toItem({ category, article, primary, existing, takenIds }) {
  const id = existing ? existing.id : makeId(category, primary.published, article.title, takenIds);
  return {
    id,
    category,
    title: article.title.trim(),
    topicTag: article.topicTag,
    endUser: article.endUser,
    toolsUsed: article.toolsUsed,
    costStructure: article.costStructure,
    howItWorks: article.howItWorks,
    inputNeeded: article.inputNeeded,
    outputGiven: article.outputGiven,
    workflow: article.workflow,
    useCases: article.useCases,
    hardwareRequirements: article.hardwareRequirements,
    integrations: article.integrations,
    subscriptionsRequired: article.subscriptionsRequired,
    readingTime: Math.max(1, Math.round(wordCount(article) / WPM)),
    url: primary.link,
    source: { name: primary.sourceName, url: primary.sourceUrl },
    author: primary.author || primary.sourceName,
    published: (primary.published || new Date().toISOString()).slice(0, 10),
    official: !!primary.official,
    likes: existing ? existing.likes : 0,
    dislikes: existing ? existing.dislikes : 0,
    image: existing ? existing.image : null, // no image pipeline anymore — the frontend generates its own card/hero art
  };
}

// Merges freshly generated items into the store: new stories replace sample placeholders in their
// category, existing real stories keep their id/likes/dislikes if regenerated, and each category is
// capped at the newest PER_CATEGORY_CAP items. A category untouched this run (no qualifying finds,
// or its sources were down) keeps whatever it already had, samples included.
export function mergeItems(store, category, newItems) {
  if (!newItems.length) return store;
  const others = store.items.filter(it => it.category !== category);
  const previousReal = store.items.filter(it => it.category === category && !it.sample);
  const byId = new Map(previousReal.map(it => [it.id, it]));
  newItems.forEach(it => byId.set(it.id, it));
  const merged = [...byId.values()]
    .sort((a, b) => (a.published < b.published ? 1 : -1))
    .slice(0, PER_CATEGORY_CAP);
  store.items = [...others, ...merged];
  return store;
}

export function finalizeAndWrite(store) {
  const stillSample = store.items.some(it => it.sample);
  store.updated = new Date().toISOString();
  if (!stillSample) delete store.note;
  writeFileSync(DATA_PATH, JSON.stringify(store, null, 2) + '\n');
  return DATA_PATH;
}
