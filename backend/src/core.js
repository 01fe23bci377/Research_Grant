'use strict';

/**
 * AURA core — configuration, store, governed connector, typed tools, memory,
 * skills, runtime and the domain specialist registry (Labs 2–6 and 13).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const {
  CALLS, LITERATURE, HISTORY, PERSONNEL, RATE_CARD, USERS, POLICIES,
  COMPLIANCE_RULES, DOCUMENT_REGISTER, INSTITUTION,
} = require('./seed');

/* ------------------------------- config ---------------------------------- */

const ROOT = path.resolve(__dirname, '..');
const dataDir = process.env.AURA_DATA_DIR || path.join(ROOT, 'data');

const config = {
  root: ROOT,
  dataDir,
  stateFile: path.join(dataDir, 'state.json'),
  auditFile: path.join(dataDir, 'audit.jsonl'),
  port: process.env.PORT || 3000,
  retryBudget: Number(process.env.AURA_RETRY_BUDGET || 3),
  maxSteps: Number(process.env.AURA_MAX_STEPS || 120),
  maxToolCalls: Number(process.env.AURA_MAX_TOOL_CALLS || 160),
  reviewBufferDays: Number(process.env.AURA_REVIEW_BUFFER_DAYS || 7),
  stepDelayMs: Number(process.env.AURA_STEP_DELAY || 320),
  wordsPerPage: Number(process.env.AURA_WORDS_PER_PAGE || 500),
  connectorToken: process.env.AURA_CONNECTOR_TOKEN || 'aura-internal-agent-token',
  connectorTokenHeader: 'x-connector-token',
  swarmConcurrency: Number(process.env.AURA_SWARM_CONCURRENCY || 5),
  defaultDomain: 'government',
};

/* --------------------------------- util ---------------------------------- */

const STOPWORDS = new Set(['a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'have', 'in', 'into', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the', 'their', 'this', 'to', 'was', 'were', 'will', 'with', 'within', 'we', 'our', 'can', 'not', 'but', 'via', 'per', 'using', 'use', 'used', 'based']);

const uid = (prefix = 'id') => `${prefix}-${crypto.randomBytes(4).toString('hex')}`;
const nowIso = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const round = (n, d = 0) => Math.round(n * 10 ** d) / 10 ** d;
const sleep = (ms) => (ms ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());
const sha256 = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const unique = (list) => [...new Set(list)];
const groupBy = (list, fn) => list.reduce((acc, item) => { const k = typeof fn === 'function' ? fn(item) : item[fn]; (acc[k] = acc[k] || []).push(item); return acc; }, {});

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const money = (n) => `₹${inr.format(Math.round(Number(n) || 0))}`;
function compactMoney(n) {
  const v = Number(n) || 0;
  if (v >= 10000000) return `₹${round(v / 10000000, 2)} Cr`;
  if (v >= 100000) return `₹${round(v / 100000, 1)} L`;
  if (v >= 1000) return `₹${round(v / 1000, 1)} K`;
  return `₹${Math.round(v)}`;
}
function tokenize(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter((t) => t.length > 2 && !STOPWORDS.has(t));
}
function termFreq(tokens) {
  const tf = new Map();
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
  return tf;
}
function cosine(a, b) {
  let dot = 0; let na = 0; let nb = 0;
  for (const v of a.values()) na += v * v;
  for (const v of b.values()) nb += v * v;
  for (const [k, v] of a) if (b.has(k)) dot += v * b.get(k);
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
function jaccard(a, b) {
  const A = new Set(a); const B = new Set(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  return inter / (A.size + B.size - inter);
}
const pct = (part, whole) => (whole ? round((part / whole) * 100, 1) : 0);
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60);

const util = { uid, nowIso, today, daysBetween, clamp, round, sleep, sha256, capitalize, unique, groupBy, money, compactMoney, tokenize, termFreq, cosine, jaccard, pct, slug };

/* --------------------------------- store --------------------------------- */

const state = { runs: [], audit: [], versions: [], connectorLog: [], meta: { createdAt: nowIso(), bootCount: 0 } };
let loaded = false;

function load() {
  if (loaded) return state;
  loaded = true;
  fs.mkdirSync(config.dataDir, { recursive: true });
  try {
    if (fs.existsSync(config.stateFile)) {
      const raw = JSON.parse(fs.readFileSync(config.stateFile, 'utf8'));
      state.runs = raw.runs || [];
      state.audit = raw.audit || [];
      state.versions = raw.versions || [];
      state.connectorLog = raw.connectorLog || [];
      state.meta = { ...state.meta, ...(raw.meta || {}) };
    }
  } catch (err) {
    console.error('[store] load failed:', err.message);
  }
  state.meta.bootCount += 1;
  return state;
}

function persist() {
  fs.mkdirSync(config.dataDir, { recursive: true });
  const payload = { runs: state.runs.slice(-50), audit: state.audit.slice(-3000), versions: state.versions.slice(-60), connectorLog: state.connectorLog.slice(-300), meta: { ...state.meta, savedAt: nowIso() } };
  const tmp = path.join(config.dataDir, `state.${process.pid}.tmp`);
  try {
    fs.writeFileSync(tmp, JSON.stringify(payload), 'utf8');
    fs.renameSync(tmp, config.stateFile);
  } catch (err) {
    console.error('[store] persist failed:', err.message);
  }
  // MongoDB is the system of record when connected; JSON remains the fallback.
  try {
    require('./persistence').persistState(state);
  } catch { /* persistence is optional */ }
}

function audit(event) {
  const entry = { id: uid('aud'), ts: nowIso(), runId: null, actor: 'system', agent: 'system', phase: 'system', intent: '', action: '', inputs: null, outputs: null, result: 'ok', durationMs: null, level: 'info', ...event };
  state.audit.push(entry);
  if (state.audit.length > 3000) state.audit.splice(0, state.audit.length - 3000);
  try {
    fs.mkdirSync(config.dataDir, { recursive: true });
    fs.appendFileSync(config.auditFile, `${JSON.stringify(entry)}\n`, 'utf8');
  } catch { /* audit file is best-effort */ }
  try {
    require('./persistence').recordAudit(entry);
  } catch { /* persistence is optional */ }
  return entry;
}

const db = {
  state,
  load,
  persist,
  audit,
  getRun: (id) => state.runs.find((r) => r.id === id) || null,
  addRun(run) {
    state.runs.push(run);
    if (state.runs.length > 50) state.runs.splice(0, 1);
    persist();
    try { require('./persistence').saveRun(run); } catch { /* optional */ }
    return run;
  },
  nextRunId() {
    const year = new Date().getFullYear();
    const n = state.runs.filter((r) => r.id.includes(`RUN-${year}`)).length + 1;
    return `RUN-${year}-${String(n).padStart(4, '0')}`;
  },
  addVersion(v) {
    state.versions.push(v);
    persist();
    try { require('./persistence').saveVersion(v); } catch { /* optional */ }
    return v;
  },
  logConnector(entry) { state.connectorLog.push(entry); if (state.connectorLog.length > 300) state.connectorLog.shift(); },
};

/* ------------------------------- connector ------------------------------- */

const SOURCES = {
  funding: { name: 'funding-catalogue', adapter: 'json-seed', version: '2026.10', custodianship: 'Research Office' },
  literature: { name: 'approved-literature-corpus', adapter: 'json-seed', version: '2026.10', custodianship: 'Library' },
  history: { name: 'institutional-grant-history', adapter: 'json-seed', version: '2026.10', custodianship: 'Research Office' },
  hr: { name: 'personnel-and-rate-card', adapter: 'json-seed', version: '2026.10', custodianship: 'Finance' },
  policy: { name: 'institutional-policy-register', adapter: 'json-seed', version: '2026.10', custodianship: 'Registrar' },
  rules: { name: 'compliance-rulebook', adapter: 'json-seed', version: '2026.10', custodianship: 'Research Office' },
};

const ENDPOINTS = {
  'funding.calls': { source: 'funding', summary: 'Read funding calls with optional filters.', args: { agency: 'string', fundingType: 'string', status: 'string' }, read: (a = {}) => CALLS.filter((c) => (!a.agency || c.agency === a.agency) && (!a.fundingType || c.fundingType === a.fundingType) && (!a.status || c.status === a.status)) },
  'funding.call': { source: 'funding', summary: 'Read one call with its guidelines.', args: { id: 'string!' }, read: ({ id }) => CALLS.find((c) => c.id === id) || null },
  'funding.guidelines': { source: 'funding', summary: 'Read guideline snippets (evidence locators).', args: { callId: 'string!' }, read: ({ callId }) => (CALLS.find((c) => c.id === callId) || {}).guidelines || [] },
  'budget.personnel': { source: 'hr', summary: 'Read the personnel register.', args: { role: 'string' }, read: (a = {}) => PERSONNEL.filter((p) => !a.role || p.role === a.role) },
  'budget.rates': { source: 'hr', summary: 'Read the institutional rate card.', args: {}, read: () => RATE_CARD },
  'compliance.rules': { source: 'rules', summary: 'Read compliance rules for a funding type.', args: { appliesTo: 'string' }, read: (a = {}) => COMPLIANCE_RULES.filter((r) => !a.appliesTo || r.appliesTo === 'all' || r.appliesTo === a.appliesTo) },
  'compliance.documents': { source: 'rules', summary: 'Read the document register.', args: {}, read: () => DOCUMENT_REGISTER },
  'policy.institutional': { source: 'policy', summary: 'Read institutional policies.', args: { tag: 'string' }, read: (a = {}) => POLICIES.filter((p) => !a.tag || p.tags.includes(a.tag)) },
  'literature.corpus': { source: 'literature', summary: 'Read the approved academic corpus.', args: { tag: 'string' }, read: (a = {}) => LITERATURE.filter((l) => !a.tag || l.tags.includes(a.tag)) },
  'history.proposals': { source: 'history', summary: 'Read prior proposals and grants.', args: { tag: 'string' }, read: (a = {}) => HISTORY.filter((h) => !a.tag || h.tags.includes(a.tag)) },
  'institution.profile': { source: 'hr', summary: 'Read the institution profile and signatory.', args: {}, read: () => INSTITUTION },
  'identity.users': { source: 'hr', summary: 'Read roles and permissions.', args: {}, read: () => USERS },
  'search.literature': {
    source: 'literature', summary: 'Tokenised search over the approved corpus.', args: { q: 'string!' },
    read: ({ q }) => {
      const terms = new Set(tokenize(q));
      return LITERATURE.map((l) => {
        const tokens = new Set(tokenize(`${l.title} ${l.abstract} ${l.tags.join(' ')}`));
        let hits = 0;
        for (const t of terms) if (tokens.has(t)) hits += 1;
        return { l, hits };
      }).filter((x) => x.hits > 0).sort((a, b) => b.hits - a.hits).slice(0, 10).map((x) => x.l);
    },
  },
};

function invoke(name, args = {}, ctx = {}) {
  const started = Date.now();
  const endpoint = ENDPOINTS[name];
  const requestId = uid('con');
  const base = {
    id: requestId, ts: nowIso(), endpoint: name, args, actor: ctx.actor || 'unknown', agent: ctx.agent || null,
    runId: ctx.runId || null, purpose: ctx.purpose || null,
    source: endpoint ? SOURCES[endpoint.source]?.name : null,
    sourceKey: endpoint ? endpoint.source : null,
    authenticated: ctx.token === config.connectorToken,
  };
  if (!endpoint) return finish(base, started, 'error', 0, { code: 'unknown_endpoint', message: `Unknown endpoint ${name}` });
  if (ctx.token !== config.connectorToken) return finish(base, started, 'error', 0, { code: 'unauthorized', message: 'A valid agent token is required.' });
  try {
    const data = endpoint.read(args);
    const count = Array.isArray(data) ? data.length : data ? 1 : 0;
    return finish(base, started, 'ok', count, null, data);
  } catch (err) {
    return finish(base, started, 'error', 0, { code: 'read_failed', message: err.message });
  }
}

function finish(base, started, status, count, error, data) {
  const entry = { ...base, status, count, error, latencyMs: Date.now() - started };
  db.logConnector(entry);
  audit({ runId: base.runId, actor: base.actor, agent: base.agent || 'connector', phase: 'connector', intent: `Read ${base.endpoint}`, action: `connector.invoke(${base.endpoint})`, inputs: base.args, outputs: { status, count, source: entry.source }, result: status, durationMs: entry.latencyMs, level: status === 'ok' ? 'info' : 'warn' });
  if (error) return { ok: false, error, meta: entry, data: null };
  return { ok: true, data, meta: { endpoint: base.endpoint, source: entry.source, count, latencyMs: entry.latencyMs, requestId: base.id, adapter: SOURCES[base.sourceKey]?.adapter, version: SOURCES[base.sourceKey]?.version } };
}

function catalog() {
  return {
    sources: Object.entries(SOURCES).map(([key, s]) => ({ key, ...s, endpoints: Object.entries(ENDPOINTS).filter(([, e]) => e.source === key).map(([n]) => n) })),
    endpoints: Object.entries(ENDPOINTS).map(([name, e]) => ({ name, summary: e.summary, args: e.args, source: e.source, sourceName: SOURCES[e.source]?.name })),
    auth: { scheme: 'agent-token', header: config.connectorTokenHeader, note: 'All agent reads are authenticated and audited. Browser calls are proxied with the internal agent token.' },
  };
}

/* --------------------------------- tools --------------------------------- */

const CATEGORIES = ['personnel', 'equipment', 'consumables', 'travel', 'requirement'];

function sumByCategory(lines) {
  const sums = { personnel: 0, equipment: 0, consumables: 0, travel: 0, requirement: 0 };
  for (const l of lines) sums[CATEGORIES.includes(l.category) ? l.category : 'consumables'] += Number(l.amount) || 0;
  return sums;
}

function computeBudget(lines, rules = {}) {
  const categories = sumByCategory(lines);
  const direct = CATEGORIES.reduce((a, c) => a + categories[c], 0);
  const overheadPct = Number(rules.overheadPct ?? 15);
  const contingencyPct = Number(rules.contingencyPct ?? 0);
  const overhead = Math.round((direct * overheadPct) / 100);
  const contingency = Math.round((direct * contingencyPct) / 100);
  const total = direct + overhead + contingency;
  const lineSum = lines.reduce((a, l) => a + (Number(l.amount) || 0), 0);
  return { categories, direct, overhead, contingency, total, overheadPct, contingencyPct, lineSum };
}

function capReport(lines, rules = {}) {
  const t = computeBudget(lines, rules);
  return [
    { key: 'salary', label: 'Manpower', category: 'personnel', capPct: Number(rules.salaryCapPct ?? 100) },
    { key: 'equipment', label: 'Equipment', category: 'equipment', capPct: Number(rules.equipmentCapPct ?? 100) },
    { key: 'travel', label: 'Travel', category: 'travel', capPct: Number(rules.travelCapPct ?? 100) },
  ].map((d) => {
    const amount = t.categories[d.category] || 0;
    const actualPct = t.total ? round((amount / t.total) * 100, 1) : 0;
    return { ...d, amount, actualPct, limit: Math.round((d.capPct / 100) * t.total), status: actualPct > d.capPct + 0.05 ? 'over' : actualPct >= d.capPct - 2 ? 'at-limit' : 'ok' };
  });
}

function checkEligibility(call, profile = {}) {
  const e = call.eligibility || {};
  const out = [
    { key: 'career-stage', label: 'PI career stage', status: (e.careerStages || []).includes(profile.careerStage || 'associate') ? 'pass' : 'fail', detail: `${profile.careerStage || 'associate'} vs [${(e.careerStages || []).join(', ')}]` },
    { key: 'institution', label: 'Institution type', status: (e.institutionTypes || []).includes(profile.institutionType || 'university') ? 'pass' : 'fail', detail: `${profile.institutionType || 'university'} vs [${(e.institutionTypes || []).join(', ')}]` },
  ];
  if (e.consortiumRequired) {
    const n = (profile.partners || []).length;
    out.push({ key: 'consortium', label: 'Consortium size', status: n >= (e.minPartners || 2) ? 'pass' : 'fail', detail: `${n} partner(s); minimum ${e.minPartners}` });
  }
  if (e.coFundingRequired) {
    out.push({ key: 'co-funding', label: 'Industry co-funding', status: profile.industryPartner ? 'pass' : 'warning', detail: profile.industryPartner ? 'Co-funding partner declared' : 'No industry partner declared' });
  }
  return out;
}

function createTools(ctx) {
  const callTool = (tool, args, fn) => {
    const started = Date.now();
    ctx.assertBudget('tool');
    const result = fn();
    const count = Array.isArray(result) ? result.length : result ? 1 : 0;
    ctx.countTool();
    ctx.log({ agent: ctx.agent, phase: 'tool', intent: `Call tool ${tool}`, action: `${tool}()`, inputs: args, outputs: { count }, result: 'ok', durationMs: Date.now() - started });
    return result;
  };
  const read = (endpoint, purpose) => (args = {}) => callTool(endpoint, args, () => {
    const res = invoke(endpoint, args, { token: config.connectorToken, actor: ctx.actor?.name, agent: ctx.agent, runId: ctx.run.id, purpose });
    if (!res.ok) throw new Error(res.error.message);
    return res.data;
  });
  return {
    fundingCalls: read('funding.calls', 'discovery'),
    fundingCall: read('funding.call', 'discovery'),
    guidelines: read('funding.guidelines', 'compliance'),
    personnel: read('budget.personnel', 'budget'),
    rates: read('budget.rates', 'budget'),
    rules: read('compliance.rules', 'compliance'),
    documents: read('compliance.documents', 'compliance'),
    policies: read('policy.institutional', 'drafting'),
    literature: read('literature.corpus', 'literature'),
    history: read('history.proposals', 'literature'),
    institution: read('institution.profile', 'planning'),
    users: read('identity.users', 'permissions'),
    searchLiterature: read('search.literature', 'literature'),
    compute: {
      budget: (lines, rules) => callTool('budget.compute', { lines: lines.length }, () => computeBudget(lines, rules)),
      caps: (lines, rules) => callTool('budget.caps', { lines: lines.length }, () => capReport(lines, rules)),
      eligibility: (call, profile) => callTool('eligibility.check', { callId: call.id }, () => checkEligibility(call, profile)),
    },
  };
}

/* --------------------------------- memory -------------------------------- */

function buildIndex(docs, textFn) {
  const tfs = docs.map((d) => termFreq(tokenize(textFn(d))));
  const df = new Map();
  for (const tf of tfs) for (const term of tf.keys()) df.set(term, (df.get(term) || 0) + 1);
  const N = docs.length || 1;
  const idf = new Map();
  for (const [term, freq] of df) idf.set(term, Math.log(1 + N / (1 + freq)));
  return { docs, idf, vectors: tfs.map((tf) => { const v = new Map(); for (const [t, f] of tf) v.set(t, f * (idf.get(t) || 1)); return v; }) };
}

function retrieveSimilar(index, query, k = 5, filter) {
  const q = new Map();
  for (const [t, f] of termFreq(tokenize(query))) q.set(t, f * (index.idf.get(t) || Math.log(2)));
  return index.docs.map((doc, i) => ({ doc, score: cosine(q, index.vectors[i]) }))
    .filter((r) => (!filter || filter(r.doc)) && r.score > 0)
    .sort((a, b) => b.score - a.score).slice(0, k)
    .map((r) => ({ ...r.doc, similarity: round(r.score, 4) }));
}

function retrieveByTags(items, tags, k = 10) {
  const wanted = tags.map((t) => String(t).toLowerCase());
  return items.map((item) => {
    const it = (item.tags || []).map((t) => String(t).toLowerCase());
    return { item, hits: wanted.filter((t) => it.some((x) => x.includes(t) || t.includes(x))).length, score: jaccard(wanted, it) };
  }).filter((r) => r.hits > 0).sort((a, b) => b.hits - a.hits || b.score - a.score).slice(0, k)
    .map((r) => ({ ...r.item, tagScore: round(r.score, 3), matchedTags: r.hits }));
}

function createMemory(tools) {
  let litIdx = null; let histIdx = null;
  const L = () => (litIdx = litIdx || buildIndex(tools.literature(), (l) => `${l.title} ${l.abstract} ${l.tags.join(' ')} ${l.venue}`));
  const H = () => (histIdx = histIdx || buildIndex(tools.history(), (h) => `${h.title} ${h.abstract} ${h.tags.join(' ')}`));
  return {
    similarity: (q, k = 8, filter) => retrieveSimilar(L(), q, k, filter),
    byTags: (tags, k = 10) => retrieveByTags(tools.literature(), tags, k),
    priorProposals: (q, k = 3) => retrieveSimilar(H(), q, k).map((h) => ({ id: h.id, title: h.title, agency: h.agency, year: h.year, outcome: h.outcome, similarity: h.similarity, lessons: h.lessons, tags: h.tags })),
    stats: () => ({ literature: L().docs.length, history: H().docs.length, embedding: 'tf-idf cosine (demo)' }),
  };
}

/* ------------------------------- specialists ------------------------------ */

const SECTIONS = {
  abstract: { title: 'Abstract', minWords: 90, purpose: 'Problem, approach, expected outcome' },
  objectives: { title: 'Objectives', minWords: 90, purpose: 'Measurable objectives' },
  background: { title: 'Background & State of the Art', minWords: 130, purpose: 'Related work and gap' },
  methodology: { title: 'Methodology', minWords: 160, purpose: 'Design, data, analysis, validation' },
  timeline: { title: 'Work Plan & Timeline', minWords: 100, purpose: 'Work packages and milestones' },
  team: { title: 'Team & Governance', minWords: 90, purpose: 'Roles, capacity, oversight' },
  outcomes: { title: 'Expected Outcomes & Impact', minWords: 110, purpose: 'Outputs, outcomes, dissemination' },
  'data-management': { title: 'Data Management & Ethics', minWords: 110, purpose: 'DMP, consent, retention, ethics' },
  'budget-justification': { title: 'Budget Justification', minWords: 80, purpose: 'Basis for each cost category' },
  references: { title: 'References', minWords: 30, purpose: 'Resolvable citations' },
  'executive-summary': { title: 'Executive Summary', minWords: 90, purpose: 'One-page funder summary' },
  'need-assessment': { title: 'Need Assessment', minWords: 130, purpose: 'Evidence of need and beneficiaries' },
  approach: { title: 'Approach & Methodology', minWords: 150, purpose: 'Delivery approach' },
  'implementation-plan': { title: 'Implementation Plan', minWords: 120, purpose: 'Phases, owners, locations' },
  'monitoring-evaluation': { title: 'Monitoring & Evaluation', minWords: 110, purpose: 'Indicators, baselines, targets' },
  sustainability: { title: 'Sustainability & Scale', minWords: 100, purpose: 'Continuity after the grant' },
  compliance: { title: 'Compliance & Eligibility', minWords: 90, purpose: 'Statutory and funder compliance' },
  excellence: { title: 'Excellence', minWords: 130, purpose: 'Ambition and state of the art' },
  impact: { title: 'Impact', minWords: 110, purpose: 'Pathways to impact and open science' },
  implementation: { title: 'Implementation', minWords: 120, purpose: 'Work packages, risks, resources' },
  consortium: { title: 'Consortium & Partners', minWords: 90, purpose: 'Partner roles and complementarity' },
  'ethics-security': { title: 'Ethics & Security', minWords: 100, purpose: 'Human oversight, bias, dual use' },
};

const sectionMeta = (key) => ({ key, ...(SECTIONS[key] || { title: key.replace(/-/g, ' '), minWords: 80, purpose: '' }) });

function checkScheme(output, rules) {
  const results = rules.map((r) => ({ label: r.label, passed: Boolean(r.test(output)), detail: r.test(output) ? 'satisfied' : r.fail }));
  return { passed: results.every((r) => r.passed), results };
}

const SPECIALISTS = {
  government: {
    id: 'government', label: 'Government agency',
    description: 'National agency template: merit, methodology, measurable outcomes, Indian costing norms.',
    sections: ['abstract', 'objectives', 'background', 'methodology', 'timeline', 'team', 'outcomes', 'data-management', 'budget-justification', 'references'],
    budgetScheme: { personnel: 0.42, equipment: 0.3, consumables: 0.18, travel: 0.1 },
    scheme: {
      requiredClaimsPerSection: 2, requiredFields: ['objectives', 'methodology', 'timeline', 'outcomes'], check: (o) => checkScheme(o, [
        { test: (x) => x.objectives >= 3, label: 'At least three objectives', fail: 'Fewer than three objectives' },
        { test: (x) => x.hasMilestones, label: 'Milestones defined', fail: 'No dated milestones' },
        { test: (x) => x.measurable, label: 'Measurable targets present', fail: 'No measurable target' },
      ])
    },
  },
  industry: {
    id: 'industry', label: 'Industry / CSR',
    description: 'CSR and foundation template: need, implementation, monitoring & evaluation, sustainability, statutory compliance.',
    sections: ['executive-summary', 'need-assessment', 'objectives', 'approach', 'implementation-plan', 'monitoring-evaluation', 'sustainability', 'budget-justification', 'compliance', 'references'],
    budgetScheme: { personnel: 0.48, equipment: 0.18, consumables: 0.22, travel: 0.12 },
    scheme: {
      requiredClaimsPerSection: 2, requiredFields: ['need-assessment', 'monitoring-evaluation', 'sustainability', 'compliance'], check: (o) => checkScheme(o, [
        { test: (x) => x.indicators >= 2, label: 'Two or more outcome indicators', fail: 'Fewer than two indicators' },
        { test: (x) => x.hasSustainability, label: 'Sustainability plan present', fail: 'No sustainability plan' },
        { test: (x) => x.complianceStatement, label: 'Statutory compliance statement', fail: 'Missing CSR/Schedule VII statement' },
      ])
    },
  },
  international: {
    id: 'international', label: 'International funder',
    description: 'EU-style excellence / impact / implementation template with consortium, ethics and open-science requirements.',
    sections: ['excellence', 'objectives', 'methodology', 'impact', 'implementation', 'consortium', 'ethics-security', 'data-management', 'budget-justification', 'references'],
    budgetScheme: { personnel: 0.5, equipment: 0.24, consumables: 0.16, travel: 0.1 },
    scheme: {
      requiredClaimsPerSection: 2, requiredFields: ['excellence', 'impact', 'implementation', 'consortium'], check: (o) => checkScheme(o, [
        { test: (x) => x.partners >= 3, label: 'Consortium of at least three partners', fail: 'Consortium below three partners' },
        { test: (x) => x.openScience, label: 'Open-science statement', fail: 'No open-science statement' },
        { test: (x) => x.ethics, label: 'Ethics & security assessment', fail: 'No ethics/security assessment' },
      ])
    },
  },
};

const getSpecialist = (id) => SPECIALISTS[id] || SPECIALISTS.government;

/* --------------------------------- swarm --------------------------------- */

async function mapUnits(units, worker, opts = {}) {
  const concurrency = Math.max(1, Math.min(opts.concurrency || config.swarmConcurrency, units.length || 1));
  const results = new Array(units.length);
  let cursor = 0;
  const timings = [];
  async function lane() {
    for (; ;) {
      const i = cursor; cursor += 1;
      if (i >= units.length) return;
      const started = Date.now();
      try {
        results[i] = await worker(units[i], i);
        results[i]._meta = { durationMs: Date.now() - started, status: 'ok' };
      } catch (err) {
        results[i] = { key: units[i].key, error: err.message, _meta: { durationMs: Date.now() - started, status: 'error' } };
      }
      timings.push({ key: units[i].key, durationMs: Date.now() - started });
    }
  }
  const startedAt = Date.now();
  await Promise.all(Array.from({ length: concurrency }, lane));
  const wallClockMs = Date.now() - startedAt;
  const sequentialEstimateMs = timings.reduce((a, t) => a + t.durationMs, 0);
  return { results, stats: { units: units.length, concurrency, wallClockMs, sequentialEstimateMs, speedup: round(sequentialEstimateMs / Math.max(wallClockMs, 1), 1) } };
}

function mergeByPlan(plan, results) {
  const byKey = new Map(results.filter(Boolean).map((r) => [r.key, r]));
  const coverage = [];
  const merged = [];
  for (const unit of plan.units) {
    const r = byKey.get(unit.key);
    const words = r?.wordCount || 0;
    const claims = r?.claims?.length || 0;
    const ok = Boolean(r) && !r.error && words >= unit.minWords && claims > 0;
    coverage.push({ unitId: unit.id, key: unit.key, title: unit.title || sectionMeta(unit.key).title, required: unit.required, words, minWords: unit.minWords, claims, status: ok ? 'covered' : r?.error ? 'error' : 'gap', reason: ok ? null : r?.error || (words < unit.minWords ? `Below ${unit.minWords}-word minimum` : 'No evidence-bearing content') });
    if (r && !r.error) merged.push({ ...r, aligned: ok });
  }
  const required = coverage.filter((c) => c.required);
  return { merged, coverage, aligned: required.every((c) => c.status === 'covered'), gaps: required.filter((c) => c.status !== 'covered') };
}

/* --------------------------------- skills -------------------------------- */

const PLAN_SCHEMA = {
  name: 'plan', version: '1.0.0',
  description: 'Expand parsed intake inputs and a matched call into a locked execution plan.',
  input: { type: 'object', required: ['researchArea', 'callId', 'domain'], properties: { researchArea: { type: 'string' }, callId: { type: 'string' }, domain: { type: 'string', enum: ['government', 'industry', 'international'] }, requestedBudget: { type: 'number' }, durationMonths: { type: 'number' }, keywords: { type: 'array', items: { type: 'string' } } } },
  output: { type: 'object', required: ['id', 'units', 'phases', 'acceptance', 'locked'], properties: { units: { type: 'array' }, phases: { type: 'array' }, acceptance: { type: 'array' }, locked: { type: 'boolean' } } },
};

const FORMAT_SCHEMA = {
  name: 'format', version: '1.0.0',
  description: 'Render a run into submission-format documents.',
  input: { type: 'object', required: ['run'], properties: { template: { type: 'string', enum: ['proposal', 'budget', 'compliance', 'cover-letter', 'evidence'] } } },
  output: { type: 'object', required: ['files'], properties: { files: { type: 'array' } } },
};

const ACCEPTANCE_CHECKS = ['sections_complete', 'sections_min_words', 'claims_grounded', 'citations_resolve', 'budget_reconciles', 'budget_caps', 'compliance_blocking', 'ai_disclosure', 'deadline_valid'];

function buildPlan({ researchArea, keywords = [], callId, callTitle, domain, requestedBudget, durationMonths, sections, retryBudget = config.retryBudget, specialistId }) {
  const units = sections.map((key, index) => ({
    id: `U${String(index + 1).padStart(2, '0')}`,
    key, title: sectionMeta(key).title, purpose: sectionMeta(key).purpose,
    agent: 'drafting', minWords: sectionMeta(key).minWords, required: true, evidenceRequired: true,
  }));
  const plan = {
    id: `PLAN-${slug(researchArea).slice(0, 12)}-${uid('x').slice(-4)}`,
    version: 1,
    title: `Grant package — ${researchArea}`,
    goal: `Produce a validated, submission-ready proposal and compliance package for ${callTitle}.`,
    domain, specialistId: specialistId || domain, callId,
    inputs: { researchArea, keywords, requestedBudget, durationMonths },
    constraints: { retryBudget, requiredSections: sections.length },
    phases: [
      { id: 'gate-1', label: 'Profile intake', mode: 'sequential', agents: ['coordinator'], gate: true },
      { id: 'discovery', label: 'Parallel discovery & review', mode: 'parallel', agents: ['funding', 'literature'] },
      { id: 'drafting', label: 'Drafting', mode: 'sequential', agents: ['drafting'] },
      { id: 'budget-compliance', label: 'Parallel budget & compliance', mode: 'parallel', agents: ['budget', 'compliance'] },
      { id: 'validation', label: 'Validation & repair', mode: 'sequential', agents: ['coordinator'] },
      { id: 'packaging', label: 'Packaging', mode: 'sequential', agents: ['submission'] },
      { id: 'approval', label: 'Stakeholder approval', mode: 'sequential', agents: ['review'], gate: true },
      { id: 'publish', label: 'Dashboard update', mode: 'sequential', agents: ['coordinator'], after: 'approval' },
    ],
    units,
    acceptance: [...ACCEPTANCE_CHECKS],
    coverage: { sections: units.length, required: units.filter((u) => u.required).length },
    locked: false, createdAt: nowIso(), lockedAt: null, checksum: null,
  };
  return lockPlan(plan);
}

function lockPlan(plan) {
  const errors = [];
  if (!plan.units?.length) errors.push('Plan has no units.');
  const known = ['coordinator', 'funding', 'literature', 'drafting', 'budget', 'compliance', 'submission', 'review'];
  for (const phase of plan.phases || []) for (const a of phase.agents) if (!known.includes(a)) errors.push(`Unknown agent "${a}"`);
  const keys = new Set(plan.units.map((u) => u.key));
  if (!keys.has('objectives')) errors.push('Missing mandatory unit "objectives"');
  if (!['methodology', 'approach', 'excellence'].some((k) => keys.has(k))) errors.push('Missing a methodology/excellence unit');
  if (!keys.has('references')) errors.push('Missing mandatory unit "references"');
  if (errors.length) { const err = new Error(`Plan validation failed: ${errors.join('; ')}`); err.code = 'plan_invalid'; throw err; }
  plan.locked = true;
  plan.lockedAt = nowIso();
  plan.checksum = sha256(JSON.stringify({ units: plan.units, phases: plan.phases, acceptance: plan.acceptance, callId: plan.callId }));
  return plan;
}

function revisePlan(plan, edits = {}) {
  const next = { ...plan, ...edits, locked: false };
  if (Array.isArray(edits.units)) next.units = edits.units.map((u, i) => ({ minWords: 60, required: true, evidenceRequired: true, agent: 'drafting', ...u, id: u.id || `U${String(i + 1).padStart(2, '0')}` }));
  return lockPlan(next);
}

function citationIndex(draft) {
  const seen = new Map();
  for (const claim of draft.claims || []) for (const ev of claim.evidence || []) {
    if (!seen.has(ev.sourceId)) seen.set(ev.sourceId, { key: `S${seen.size + 1}`, sourceId: ev.sourceId, type: ev.sourceType, title: ev.title, locator: ev.locator, quote: ev.quote });
  }
  return [...seen.values()];
}

function renderProposal(run) {
  const { draft, params } = run;
  const call = run.discovery?.selectedCall;
  const lines = [`# ${draft.title}`, ''];
  lines.push(`**Funding call:** ${call?.title} (${call?.agency})  `, `**Programme:** ${call?.program}  `, `**Institution:** ${run.institution?.name}  `, `**Principal Investigator:** ${params.piName}  `, `**Duration:** ${params.durationMonths} months  `, `**Prepared by:** apniLeap AURA — multi-agent grant pipeline  `, `**Run:** ${run.id} · draft v${draft.version}`, '');
  lines.push('> **AI-generated draft.** This narrative was assembled by the Proposal Drafting Agent from the matched call guidelines, an approved literature corpus and institutional records. A named faculty member must review, edit and accept every section before submission.', '');
  for (const section of draft.sections) {
    lines.push(`## ${section.title}`, '');
    if (section.key === 'references') {
      for (const c of draft.citations || []) lines.push(`- **[${c.key}]** ${c.title}. ${c.locator}. (${c.type})`);
      lines.push('');
      continue;
    }
    for (const p of section.paragraphs) {
      const markers = unique(p.claimIds.map((id) => {
        const claim = draft.claims.find((c) => c.id === id);
        if (!claim?.evidence?.length) return null;
        const found = (draft.citations || []).find((c) => c.sourceId === claim.evidence[0].sourceId);
        return found ? `[${found.key}]` : null;
      }).filter(Boolean));
      lines.push(`${p.text}${markers.length ? ` ${markers.join('')}` : ''}`, '');
    }
  }
  return lines.join('\n');
}

function renderBudgetCsv(budget) {
  const rows = [['Category', 'Item', 'Basis', 'Quantity', 'Unit cost (INR)', 'Amount (INR)']];
  for (const l of budget.lines) rows.push([l.category, l.item, l.basis, l.quantity ?? '', l.unitCost ?? '', l.amount]);
  rows.push([], ['Subtotal', 'Direct costs', '', '', '', budget.totals.direct], ['Overhead', `${budget.totals.overheadPct}% of direct`, '', '', '', budget.totals.overhead], ['Contingency', `${budget.totals.contingencyPct}% of direct`, '', '', '', budget.totals.contingency], ['Total', '', '', '', '', budget.totals.total]);
  return rows.map((r) => r.map((c) => (String(c).includes(',') ? `"${c}"` : c)).join(',')).join('\n');
}

function renderComplianceMd(compliance) {
  const lines = ['# Compliance checklist', ''];
  const groups = groupBy(compliance.checks, 'category');
  for (const [category, checks] of Object.entries(groups)) {
    lines.push(`## ${category}`, '', '| Status | Requirement | Evidence |', '| --- | --- | --- |');
    for (const c of checks) lines.push(`| ${c.status.toUpperCase()} | ${c.requirement} | ${c.evidence} |`);
    lines.push('');
  }
  lines.push(`**Summary:** ${compliance.summary.pass} pass · ${compliance.summary.fail} fail · ${compliance.summary.manual} manual · ${compliance.summary.warning} warning`, '', `Checked exclusively against the published guidelines for ${compliance.callTitle}.`);
  return lines.join('\n');
}

function renderCoverLetter(run) {
  const call = run.discovery?.selectedCall;
  return [`# Cover letter — ${call?.program}`, '', `To: ${call?.agencyFull}`, `Subject: Submission of proposal “${run.draft.title}”`, '', 'Dear Review Committee,', '', `On behalf of ${run.institution?.name}, I am pleased to submit the attached proposal “${run.draft.title}” in response to ${call?.title}. The request is ${run.budget?.formatted?.total} over ${run.params.durationMonths} months.`, '', `The proposal has completed the institutional compliance review (${run.compliance?.summary?.pass ?? 0} requirements passed) and is authorised for submission by the Research & Development Office.`, '', 'AI-assisted drafting was used to assemble the narrative; all scientific content has been reviewed and accepted by the Principal Investigator.', '', 'Yours sincerely,', `${run.params.piName}`, `Principal Investigator, ${run.institution?.name}`, '', `Authorised signatory: ${run.institution?.signatory}`].join('\n');
}

function renderEvidenceCsv(run) {
  const rows = [['Claim', 'Section', 'Source', 'Source type', 'Locator', 'In scope']];
  for (const ev of run.evidence?.records || []) rows.push([String(ev.claimText).replace(/"/g, "'"), ev.sectionKey, ev.sourceTitle, ev.sourceType, ev.locator, ev.inScope ? 'yes' : 'no']);
  return rows.map((r) => r.map((c) => (String(c).includes(',') ? `"${c}"` : c)).join(',')).join('\n');
}

function renderManifest(run) {
  return JSON.stringify({ runId: run.id, title: run.draft?.title, call: run.discovery?.selectedCallId, generatedAt: nowIso(), version: run.package?.version, checksum: run.package?.checksum, files: (run.package?.files || []).map((f) => ({ name: f.name, bytes: f.bytes, kind: f.kind })), approval: run.approvals, disclosure: run.draft?.disclosure }, null, 2);
}

const formatSkill = { proposal: renderProposal, budget: renderBudgetCsv, compliance: renderComplianceMd, 'cover-letter': renderCoverLetter, evidence: renderEvidenceCsv, manifest: renderManifest };

/* -------------------------------- runtime -------------------------------- */

class BudgetExceeded extends Error {
  constructor(what) { super(`Runtime budget exceeded: ${what}`); this.code = 'budget_exceeded'; }
}

function createContext(run, actor) {
  const ctx = {
    run, actor: actor || run.actor, agent: 'coordinator', tools: null, memory: null,
    log(entry) {
      const record = { id: uid('log'), ts: nowIso(), agent: entry.agent || ctx.agent, phase: entry.phase || 'step', intent: entry.intent || '', action: entry.action || '', inputs: entry.inputs ?? null, outputs: entry.outputs ?? null, result: entry.result || 'ok', durationMs: entry.durationMs ?? null, level: entry.level || 'info' };
      run.logs.push(record);
      if (run.logs.length > 300) run.logs.splice(0, run.logs.length - 300);
      run.metrics.steps = run.logs.filter((l) => l.phase !== 'tool').length;
      db.audit({ runId: run.id, actor: ctx.actor?.name || 'system', agent: record.agent, phase: record.phase, intent: record.intent, action: record.action, inputs: record.inputs, outputs: record.outputs, result: record.result, durationMs: record.durationMs, level: record.level });
      return record;
    },
    async step({ agent, phase, intent, action, inputs, outputs, result = 'ok', level = 'info', delay = true }) {
      const started = Date.now();
      ctx.assertBudget('step');
      if (delay && config.stepDelayMs) await sleep(config.stepDelayMs);
      return ctx.log({ agent, phase, intent, action, inputs, outputs, result, level, durationMs: Date.now() - started });
    },
    assertBudget(kind) {
      if (kind === 'step' && (run.metrics.steps || 0) >= config.maxSteps) throw new BudgetExceeded('max steps');
      if (kind === 'tool' && (run.metrics.toolCalls || 0) >= config.maxToolCalls) throw new BudgetExceeded('max tool calls');
    },
    countTool() { run.metrics.toolCalls = (run.metrics.toolCalls || 0) + 1; },
    checkpoint(label, extra = {}) {
      const point = { id: uid('ckpt'), label, at: nowIso(), stage: run.stage, status: run.status, summary: { plan: Boolean(run.plan?.locked), call: run.discovery?.selectedCallId || null, sections: run.draft?.sections?.length || 0, budgetTotal: run.budget?.totals?.total || 0, ...extra } };
      run.checkpoints.push(point);
      if (run.checkpoints.length > 30) run.checkpoints.shift();
      persist();
      return point;
    },
    markStage(stage, label) { run.stage = stage; if (label) run.stageLabel = label; persist(); },
  };
  ctx.tools = createTools(ctx);
  ctx.memory = createMemory(ctx.tools);
  return ctx;
}

const canRetry = (run) => (run.validation?.attempts || 0) < (run.validation?.maxAttempts ?? config.retryBudget);

module.exports = {
  config, util, db, connector: { invoke, catalog, ENDPOINTS, SOURCES }, tools: { createTools, computeBudget, capReport, checkEligibility },
  memory: { createMemory }, specialists: { SPECIALISTS, SECTIONS, getSpecialist, sectionMeta }, swarm: { mapUnits, mergeByPlan },
  skills: { PLAN_SCHEMA, FORMAT_SCHEMA, ACCEPTANCE_CHECKS, buildPlan, lockPlan, revisePlan, citationIndex, renderProposal, renderBudgetCsv, renderComplianceMd, renderCoverLetter, renderEvidenceCsv, renderManifest, formatSkill },
  runtime: { createContext, canRetry, BudgetExceeded },
  ...util,
};
