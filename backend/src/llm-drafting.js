'use strict';

/**
 * Groq-backed drafting for Group C.
 *
 * The model is treated as an untrusted author: it receives a fixed evidence
 * catalogue and must return JSON paragraphs tagged with source ids. We resolve
 * every id back to the canonical source record, reject unknown ids, reject
 * unsupported "results" language, and fall back to the deterministic composer
 * whenever the output fails the contract.
 */
const groq = require('./groq');

const BANNED = /(preliminary (results|findings|data)|we (have )?demonstrated|our (results|data) (show|demonstrate)|statistically significant|proven to)/i;
const MIN_PARAGRAPH_WORDS = 28;

// Five sections carry the scientific argument; the rest stay deterministic so a
// single run fits inside the on-demand token-per-minute allowance.
const DEFAULT_SECTIONS = 'abstract,background,methodology,outcomes';

function enabledSections() {
  return String(process.env.AURA_LLM_SECTIONS || DEFAULT_SECTIONS)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function isEnabled() {
  const flag = String(process.env.AURA_LLM || 'on').toLowerCase();
  return flag !== 'off' && flag !== 'false' && groq.isGroqConfigured();
}

function sourceCatalog(pack) {
  const out = new Map();
  const add = (s) => {
    if (s && s.sourceId && !out.has(s.sourceId)) out.set(s.sourceId, s);
  };
  for (const g of (pack.call.guidelines || []).slice(0, 3)) {
    add({
      sourceId: g.id,
      sourceType: 'guideline',
      title: `${pack.call.agency} — ${g.section}`,
      locator: `${pack.call.program}`,
      quote: g.text,
    });
  }
  for (const l of (pack.lit || []).slice(0, 4)) {
    add({
      sourceId: l.id,
      sourceType: 'literature',
      title: `${l.title} (${l.authors?.[0] || 'Anon.'} et al., ${l.year})`,
      locator: l.venue,
      quote: String(l.abstract || '').split(/(?<=\.)\s+/)[0],
    });
  }
  for (const p of (pack.policies || []).filter((x) => ['pol-data', 'pol-signoff'].includes(x.id))) {
    add({ sourceId: p.id, sourceType: 'policy', title: p.title, locator: 'policy register', quote: String(p.text).split(/(?<=\.)\s+/)[0] });
  }
  if (pack.history) {
    add({ sourceId: pack.history.id, sourceType: 'history', title: `Prior proposal — ${pack.history.title}`, locator: `${pack.history.agency}, ${pack.history.year}`, quote: pack.history.lessons });
  }
  add({ sourceId: 'rec-personnel', sourceType: 'record', title: 'Personnel register', locator: 'budget.personnel', quote: 'Monthly costs and default effort come from the institutional personnel register.' });
  add({ sourceId: 'rec-institution', sourceType: 'record', title: 'Institution profile', locator: 'institution.profile', quote: `${pack.institution.name}; authorised signatory ${pack.institution.signatory}.` });
  return [...out.values()];
}

function projectFacts(pack) {
  const t = pack.theme;
  const { params } = pack;
  const rules = pack.call.budgetRules || {};
  return [
    `Research area: ${params.researchArea}`,
    `Keywords: ${(params.keywords || []).join(', ')}`,
    `Duration: ${t.duration} months · Sites: ${t.sites} · Participants: ${t.sample}`,
    `Setting: ${t.setting} · Population: ${t.population}`,
    `Method: ${t.methodNoun} · Outcome: ${t.outcomeNoun} · Reference standard: ${t.goldStandard}`,
    `PI: ${pack.personnel.find((p) => p.role === 'PI')?.name || params.piName}`,
    `Requested budget: INR ${Number(params.requestedBudget || 0).toLocaleString('en-IN')} · agency range INR ${Number(pack.call.budgetMin).toLocaleString('en-IN')}–${Number(pack.call.budgetMax).toLocaleString('en-IN')}`,
    `Agency caps: equipment ≤ ${rules.equipmentCapPct}% · manpower ≤ ${rules.salaryCapPct}% · travel ≤ ${rules.travelCapPct}% · overhead ${rules.overheadPct}%`,
  ].join('\n');
}

function allowedAmounts(pack) {
  const values = [pack.params.requestedBudget, pack.call.budgetMin, pack.call.budgetMax].filter(Boolean).map(Number);
  return new Set(values);
}

function allowedPercentages(pack, sources) {
  const text = `${projectFacts(pack)} ${sources.map((s) => `${s.title} ${s.quote}`).join(' ')} ${JSON.stringify(pack.call.budgetRules)}`;
  const set = new Set();
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s?%/g)) set.add(Number(m[1]));
  return set;
}

function numbersOk(text, amounts, percentages) {
  for (const m of text.matchAll(/(?:INR|₹)\s?([\d,]+(?:\.\d+)?)\s?(lakh|lakhs|l|crore|cr)?/gi)) {
    let value = Number(m[1].replace(/,/g, ''));
    const unit = (m[2] || '').toLowerCase();
    if (unit.startsWith('crore') || unit === 'cr') value *= 10000000;
    else if (unit.startsWith('lakh') || unit === 'l') value *= 100000;
    if (![...amounts].some((allowed) => Math.abs(allowed - value) <= 1)) return false;
  }
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s?%/g)) {
    if (!percentages.has(Number(m[1]))) return false;
  }
  return true;
}

function buildPrompt(pack, key, meta, sources) {
  const evidence = sources
    .map((s) => {
      const quote = String(s.quote || '').slice(0, 170);
      return `[${s.sourceId}] ${s.sourceType.toUpperCase()} — ${s.title}. ${s.locator}. ${quote}`;
    })
    .join('\n');

  return [
    `SECTION: ${meta.title}`,
    `PURPOSE: ${meta.purpose}`,
    `TARGET: ${meta.minWords + 20}-${meta.minWords + 70} words in 3-4 paragraphs.`,
    '',
    `CALL: ${pack.call.agency} — ${pack.call.program}. ${pack.call.title}`,
    pack.call.guidelines.map((g) => `- ${g.section}: ${g.text}`).join('\n'),
    '',
    'PROJECT FACTS (do not contradict):',
    projectFacts(pack),
    '',
    'EVIDENCE (the only sources you may cite):',
    evidence,
    '',
    'RULES:',
    '- Prose only: no headings, bullets, tables, markdown or bracketed citations.',
    '- Each paragraph lists 1-2 source ids in "sources", drawn only from EVIDENCE.',
    '- Never invent citations, numbers, partners, preliminary findings or completed results.',
    '- Use the stated requested budget exactly if you mention money; do not introduce any other amount.',
    '- Only cite a percentage if it appears in EVIDENCE or the agency caps above.',
    '- Do not state a retention period unless it is quoted above.',
    '- Describe planned work in the future tense; attribute published work to its source.',
    '- Respect the call requirements quoted above.',
    '',
    'Return strict JSON: {"paragraphs":[{"text":"...","sources":["id"]}]}',
  ].join('\n');
}

function parseJson(text) {
  if (!text) return null;
  const cleaned = String(text).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Draft one section with Groq. Returns { section, usage, model } or null when
 * the output fails the contract (caller then uses the deterministic composer).
 */
async function draftSection({ pack, key, meta, model }) {
  if (!isEnabled()) return null;
  const sources = sourceCatalog(pack);
  const byId = new Map(sources.map((s) => [s.sourceId, s]));
  const amounts = allowedAmounts(pack);
  const percentages = allowedPercentages(pack, sources);

  const result = await groq.callGroq({
    model: model || groq.GROQ_MODEL,
    systemPrompt:
      'You are the Proposal Drafting Agent (Group C) in apniLeap AURA. You write precise, fundable grant prose grounded only in the supplied evidence. You never invent references, results or numbers. Output valid JSON only.',
    prompt: buildPrompt(pack, key, meta, sources),
    temperature: 0.32,
    maxTokens: 900,
    reasoningEffort: 'low',
    json: true,
    timeoutMs: 50000,
    retries: 2,
  });

  if (!result.success) return { error: result.error, usage: null, model: result.model || model };

  const parsed = parseJson(result.content);
  if (!parsed || !Array.isArray(parsed.paragraphs)) {
    return { error: 'unparseable_json', preview: String(result.content || '').slice(0, 500), usage: result.usage, model: result.model };
  }

  const claims = [];
  const paragraphs = [];
  const usedIds = new Set();

  for (const p of parsed.paragraphs) {
    const text = String(p?.text || '').replace(/\s+/g, ' ').trim();
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length < MIN_PARAGRAPH_WORDS) continue;
    if (BANNED.test(text)) continue;
    if (!numbersOk(text, amounts, percentages)) continue;
    const ids = [...new Set((p.sources || []).map(String))].filter((id) => byId.has(id)).slice(0, 3);
    if (!ids.length) continue;

    const claimId = `C-${key.slice(0, 8).toUpperCase()}-L${claims.length + 1}`;
    const evidence = ids.map((id) => {
      const s = byId.get(id);
      usedIds.add(id);
      return {
        sourceId: s.sourceId,
        sourceType: s.sourceType,
        title: s.title,
        locator: s.locator,
        quote: s.quote,
        inScope: true,
      };
    });
    claims.push({ id: claimId, sectionKey: key, text, evidence, grounded: true, generatedBy: 'drafting-llm' });
    paragraphs.push({ text, claimIds: [claimId] });
  }

  const wordCount = paragraphs.reduce((a, p) => a + p.text.split(/\s+/).filter(Boolean).length, 0);
  if (paragraphs.length < 2 || wordCount < Math.max(60, meta.minWords - 10)) {
    return { error: 'contract_failed', preview: `paragraphs=${paragraphs.length} words=${wordCount}`, usage: result.usage, model: result.model, rejected: true };
  }

  return {
    section: {
      key,
      title: meta.title,
      minWords: meta.minWords,
      paragraphs,
      claims,
      wordCount,
      updatedBy: 'drafting-llm',
      sourcesUsed: usedIds.size,
    },
    usage: result.usage,
    model: result.model,
    latencyMs: result.latencyMs,
  };
}

module.exports = { isEnabled, draftSection, sourceCatalog, parseJson, enabledSections };
