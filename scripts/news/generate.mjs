import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validateArticle, cleanArticle } from './schema.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BRAND_VOICE = readFileSync(path.join(__dirname, 'brand-voice.md'), 'utf8');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
// NVIDIA Nemotron via OpenRouter. If the paid route is refused (no credit, rate limit) the same model's
// free route is tried before giving up on a story.
const MODEL = process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b';
const FALLBACK_MODEL = process.env.OPENROUTER_FALLBACK_MODEL || `${MODEL.replace(/:free$/, '')}:free`;
const SITE_URL = process.env.SITE_URL || 'https://github.com/HrithikL/Landing-Portfolio';

// What each section is for — spliced into the system prompt so the model can judge fit and reject.
export const SECTIONS = {
  models: { label: 'Open Source AI Models', tag: 'Open source models', brief: 'Cool projects people built USING an open-source / open-weight model (Llama, Qwen, Mistral, DeepSeek, Gemma, gpt-oss, Whisper, Flux, Nemotron…, run locally or self-hosted). Every entry MUST name the specific open model in `modelUsed` and give the full end-to-end picture: what was built, how, with what, and the use cases. Reject model announcements or benchmarks with no project.' },
  claude: { label: 'Claude', tag: 'Claude', brief: 'Three kinds of story: (1) a cool project someone built with Claude / Claude Code (say how Claude was used); (2) a practical guide to saving Claude tokens/cost (fill `tips` with concrete actions); (3) a newly shipped Claude feature (from Anthropic\'s release notes: what it does and how to use it). Reject anything where Claude is incidental.' },
  projects: { label: 'Cool AI Projects & Workflows', tag: 'AI Projects', brief: 'End-to-end projects and workflows people built with free (or free-tier) AI tools. Explain the whole pipeline from setup to output.' },
  tools: { label: 'Free Tools', tag: 'Free AI Tools', brief: 'Free tools (free or with a usable free tier) that many builders use, with concrete use cases and what people build with them. Reject paid-only products.' },
  repos: { label: 'Top GitHub Repos of the Week', tag: 'GitHub Repos', brief: 'A top AI repository this week that is a website/web-dev tool, a useful piece of software, a game, or a problem-solving tool built by users. Explain it so a non-expert gets what it does and how to run it. Reject awesome-lists, newsletters, prompt collections, courses and model-weight dumps.' },
  general: { label: 'General Projects', tag: 'General', brief: 'Any cool AI-built project that doesn\'t fit the other sections (games, art, music, hardware, science, fun experiments). It must be something a person built.' },
};

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

export class FatalApiError extends Error {}

async function callOpenRouter(messages, model) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new FatalApiError('OPENROUTER_API_KEY is not set');
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      'HTTP-Referer': SITE_URL,
      'X-Title': 'Endless Pursuit - Cool News pipeline',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.5,
      // Nemotron reasons before answering and the reasoning counts against max_tokens: enough room for
      // a low-effort think plus the JSON, but small enough that a low-credit key isn't refused (402)
      max_tokens: 4500,
      reasoning: { effort: 'low' },
    }),
    signal: AbortSignal.timeout(180000),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    const err = new Error(`OpenRouter ${res.status}: ${errBody.slice(0, 300)}`);
    err.status = res.status;
    if (res.status === 401) throw new FatalApiError(err.message); // a bad key fails every story — stop
    throw err;
  }
  const data = await res.json();
  const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) throw new Error(`OpenRouter returned no content (finish: ${data.choices && data.choices[0] && data.choices[0].finish_reason})`);
  return content;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
// Paid route first, then the free route; an empty reply, a rate limit or a server hiccup on the free
// route gets one more try after a pause (free routes are busy and drop the odd request).
async function callWithFallback(messages) {
  try {
    return await callOpenRouter(messages, MODEL);
  } catch (err) {
    if (err instanceof FatalApiError || MODEL === FALLBACK_MODEL) throw err;
    console.warn(`[generate] ${MODEL} failed (${err.message.slice(0, 90)}) — trying ${FALLBACK_MODEL}`);
  }
  for (let attempt = 0; ; attempt++) {
    try {
      return await callOpenRouter(messages, FALLBACK_MODEL);
    } catch (err) {
      if (err instanceof FatalApiError || attempt >= 2) throw err;
      if (err.status && err.status < 429 && err.status !== 408) throw err;
      await sleep(4000 * (attempt + 1));
    }
  }
}

function buildUserPrompt({ category, primary, sourceText, full }) {
  return [
    `Section: ${SECTIONS[category].label}${primary.kind ? ` (story kind: ${primary.kind})` : ''}`,
    `Source: ${primary.sourceName}${primary.official ? ' (official)' : ''} — ${primary.link}`,
    primary.discussion ? `Discussion: ${primary.discussion}` : '',
    `Published: ${String(primary.published).slice(0, 10)}`,
    `Original headline/name: ${primary.rawTitle || primary.title}`,
    '',
    full ? 'Source text (extracted from the page):' : 'Source text (summary only — the full page could not be fetched, so work from this):',
    sourceText,
    '',
    'Write the Cool News entry now as the JSON object described in your instructions, or {"skip": "reason"} if it should be rejected. Leave out any optional field the source does not support.',
  ].filter(x => x !== '').join('\n');
}

// One story in → { article } | { skip } | null (couldn't produce anything usable after a retry).
// Throws FatalApiError only when no story could ever succeed (missing/invalid key).
export async function generateArticle({ category, primary, sourceText, full }) {
  const S = SECTIONS[category];
  const system = BRAND_VOICE.replace('{{SECTION}}', `**${S.label}** (topicTag "${S.tag}"): ${S.brief}`);
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: buildUserPrompt({ category, primary, sourceText, full }) },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    let raw;
    try {
      raw = await callWithFallback(messages);
    } catch (err) {
      if (err instanceof FatalApiError) throw err;
      console.warn(`[generate] model call failed for "${primary.title}": ${err.message}`);
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
    if (parsed && typeof parsed.skip === 'string') return { skip: parsed.skip };
    const article = cleanArticle(parsed);
    const { ok, errors } = validateArticle(article, category);
    if (ok) return { article };
    console.warn(`[generate] schema invalid (attempt ${attempt + 1}) for "${primary.title}": ${errors.join('; ')}`);
    messages.push({ role: 'assistant', content: raw });
    messages.push({ role: 'user', content: `That JSON was invalid: ${errors.join('; ')}. Reply again with a corrected JSON object only (or {"skip": "reason"}).` });
  }
  console.warn(`[generate] giving up on "${primary.title}" after retries`);
  return null;
}
