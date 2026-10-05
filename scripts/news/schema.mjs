// The strict, no-fluff template every article follows. Plain data, never raw HTML: the frontend
// (js/content.js, renderTemplate) escapes every string and maps each field to a fixed row in the
// article modal, so a rewrite can't inject markup into the page whatever the source or model produced.
// Only a few fields are required; the rest appear only when the source actually supports them —
// the site never shows a "not stated" row, so such values are stripped here as well.
// the use-case badge every row and article leads with (js/content.js DOMAINS uses the same keys)
export const DOMAINS = new Set(['logistics', 'health', 'defense', 'security', 'finance', 'education', 'creative', 'games', 'research', 'data', 'language', 'productivity', 'software']);
export const TOPIC_TAGS = new Set(['Open source models', 'Claude', 'AI Projects', 'Free AI Tools', 'GitHub Repos', 'General']);

const EMPTY = /^\s*(none|n\/?a|not stated|not specified|not mentioned|not available|not applicable|unknown|unspecified|tbd|no information|-+)\.?\s*$/i;
const TEXT = { modelUsed: 200, builtBy: 160, endUser: 300, costStructure: 200, inputNeeded: 300, outputGiven: 300, hardwareRequirements: 200, integrations: 300, subscriptionsRequired: 300 };
const LISTS = { toolsUsed: 120, workflow: 200, useCases: 200, tips: 300 };

const isStr = (v, max) => typeof v === 'string' && v.trim().length > 0 && (!max || v.length <= max);

// Drops empty/"not stated" optional values (and anything malformed) so they never reach the site.
export function cleanArticle(obj) {
  const out = { ...obj };
  for (const [k, max] of Object.entries(TEXT)) {
    if (!(k in out)) continue;
    if (!isStr(out[k], max) || EMPTY.test(out[k])) delete out[k];
  }
  for (const [k, max] of Object.entries(LISTS)) {
    if (!(k in out)) continue;
    const list = Array.isArray(out[k]) ? out[k].filter(x => isStr(x, max) && !EMPTY.test(x)).map(x => x.trim()) : [];
    if (list.length) out[k] = list; else delete out[k];
  }
  return out;
}

export function validateArticle(obj, category) {
  const errors = [];
  if (!obj || typeof obj !== 'object') return { ok: false, errors: ['not an object'] };
  if (!isStr(obj.title, 140)) errors.push('title missing or too long');
  if (!isStr(obj.summary, 400)) errors.push('summary missing or too long (1-2 sentences)');
  if (!TOPIC_TAGS.has(obj.topicTag)) errors.push(`topicTag must be one of: ${[...TOPIC_TAGS].join(', ')}`);
  if (!isStr(obj.howItWorks, 900)) errors.push('howItWorks missing or too long');
  if (obj.domain !== undefined && !DOMAINS.has(obj.domain)) errors.push(`domain must be one of: ${[...DOMAINS].join(', ')}`);
  // the open-models section is only about projects on a named open model
  if (category === 'models' && !isStr(obj.modelUsed, 200)) errors.push('modelUsed is required for this section: name the open-source model the project uses');
  if ('workflow' in obj && !Array.isArray(obj.workflow)) errors.push('workflow must be an array of short steps');
  if ('toolsUsed' in obj && !Array.isArray(obj.toolsUsed)) errors.push('toolsUsed must be an array');
  if ('useCases' in obj && !Array.isArray(obj.useCases)) errors.push('useCases must be an array');
  return { ok: errors.length === 0, errors };
}

// Word count across every field, for the reading-time estimate.
export function wordCount(a) {
  if (!a || typeof a !== 'object') return 0;
  const texts = [
    a.summary, a.modelUsed, a.builtBy, a.endUser, a.costStructure, a.howItWorks, a.inputNeeded, a.outputGiven,
    a.hardwareRequirements, a.integrations, a.subscriptionsRequired,
    ...(a.toolsUsed || []), ...(a.workflow || []), ...(a.useCases || []), ...(a.tips || []),
  ].filter(Boolean);
  return texts.join(' ').split(/\s+/).filter(Boolean).length;
}
