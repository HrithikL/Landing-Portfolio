// The strict, no-fluff template every article must follow. Plain data, never raw HTML — the
// frontend (js/content.js, renderTemplate) escapes every string and maps each field to a fixed
// row in the article modal, so a rewrite can't inject markup into the page no matter what the
// source material or the model produced.
export const TOPIC_TAGS = new Set(['Claude', 'Open source models', 'Free AI Tools', 'AI Projects']);

function isStr(v, max) {
  return typeof v === 'string' && v.trim().length > 0 && (!max || v.length <= max);
}
function isStrArray(v, max) {
  return Array.isArray(v) && v.length > 0 && v.every(x => isStr(x, max));
}

export function validateArticle(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object') return { ok: false, errors: ['not an object'] };

  if (!isStr(obj.title, 140)) errors.push('title missing or too long');
  if (!TOPIC_TAGS.has(obj.topicTag)) errors.push(`topicTag must be one of: ${[...TOPIC_TAGS].join(', ')}`);
  if (!isStr(obj.endUser, 300)) errors.push('endUser missing or too long');
  if (!isStrArray(obj.toolsUsed, 120)) errors.push('toolsUsed must be a non-empty array of strings');
  if (!isStr(obj.costStructure, 200)) errors.push('costStructure missing or too long');
  if (!isStr(obj.howItWorks, 900)) errors.push('howItWorks missing or too long');
  if (!isStr(obj.inputNeeded, 300)) errors.push('inputNeeded missing or too long');
  if (!isStr(obj.outputGiven, 300)) errors.push('outputGiven missing or too long');
  if (!isStrArray(obj.workflow, 200)) errors.push('workflow must be a non-empty array of step strings');
  if (!isStrArray(obj.useCases, 200)) errors.push('useCases must be a non-empty array of strings');
  if (!isStr(obj.hardwareRequirements, 200)) errors.push('hardwareRequirements missing or too long (use "None" if none)');
  if (!isStr(obj.integrations, 300)) errors.push('integrations missing or too long (use "None" if none)');
  if (!isStr(obj.subscriptionsRequired, 300)) errors.push('subscriptionsRequired missing or too long (use "No" if none)');

  return { ok: errors.length === 0, errors };
}

// Word count across every field, for the reading-time estimate — this template has no prose
// paragraphs, so "reading time" is a rough proxy at best, but still a nicer signal than nothing.
export function wordCount(a) {
  if (!a || typeof a !== 'object') return 0;
  const texts = [
    a.endUser, a.costStructure, a.howItWorks, a.inputNeeded, a.outputGiven,
    a.hardwareRequirements, a.integrations, a.subscriptionsRequired,
    ...(a.toolsUsed || []), ...(a.workflow || []), ...(a.useCases || []),
  ].filter(Boolean);
  return texts.join(' ').split(/\s+/).filter(Boolean).length;
}
