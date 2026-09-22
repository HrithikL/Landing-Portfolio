import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validateArticle } from './schema.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BRAND_VOICE = readFileSync(path.join(__dirname, 'brand-voice.md'), 'utf8');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b';
const SITE_URL = process.env.SITE_URL || 'https://github.com/HrithikL/Landing-Portfolio';

function extractJson(text) {
  // Models sometimes wrap JSON in ```json fences despite instructions — strip them if present,
  // then grab the outermost {...} in case there's stray commentary around it.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) throw new Error('no JSON object found in model output');
  return JSON.parse(body.slice(start, end + 1));
}

async function callOpenRouter(messages) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY is not set');
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      'HTTP-Referer': SITE_URL,
      'X-Title': 'Peaceful Pursuit - Cool News pipeline',
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.6,
      max_tokens: 2600,
    }),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`OpenRouter ${res.status}: ${errBody.slice(0, 400)}`);
  }
  const data = await res.json();
  const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) throw new Error('OpenRouter returned no content');
  return content;
}

const CATEGORY_LABEL = {
  models: 'Open Source Models', claude: 'Claude Updates', tools: 'Free AI Tools',
  projects: 'Cool AI Projects', repos: 'Best GitHub Repos',
};

function buildUserPrompt({ category, primary, sourceText, full }) {
  return [
    `Discovery topic: ${CATEGORY_LABEL[category] || category}`,
    `Source: ${primary.sourceName}${primary.official ? ' (official)' : ''} — ${primary.link}`,
    `Original headline/name: ${primary.title}`,
    '',
    full ? 'Source text (extracted from the page):' : 'Source text (summary only — the full page could not be fetched, so work from this):',
    sourceText,
    '',
    'Write the Cool News entry now, as the JSON object described in your instructions. Base every field strictly on the source text above — use "None"/"Not stated" per the field rules rather than guessing.',
  ].join('\n');
}

// One story in, one validated article out (or null if the model can't produce something usable
// after a retry). Never throws for a single bad story — the caller just skips it and moves on.
export async function generateArticle({ category, primary, sourceText, full }) {
  const system = BRAND_VOICE;
  const user = buildUserPrompt({ category, primary, sourceText, full });
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    let raw;
    try {
      raw = await callOpenRouter(messages);
    } catch (err) {
      console.warn(`[generate] OpenRouter call failed for "${primary.title}": ${err.message}`);
      return null;
    }
    let parsed;
    try {
      parsed = extractJson(raw);
    } catch (err) {
      console.warn(`[generate] JSON parse failed (attempt ${attempt + 1}) for "${primary.title}": ${err.message}`);
      messages.push({ role: 'assistant', content: raw });
      messages.push({ role: 'user', content: 'That was not valid JSON. Reply again with ONLY the JSON object, no other text.' });
      continue;
    }
    const { ok, errors } = validateArticle(parsed);
    if (ok) return parsed;
    console.warn(`[generate] schema invalid (attempt ${attempt + 1}) for "${primary.title}": ${errors.join('; ')}`);
    messages.push({ role: 'assistant', content: raw });
    messages.push({ role: 'user', content: `That JSON was invalid: ${errors.join('; ')}. Reply again with a corrected JSON object only.` });
  }
  console.warn(`[generate] giving up on "${primary.title}" after retries`);
  return null;
}
