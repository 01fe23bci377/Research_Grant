'use strict';

/**
 * Pipeline engine: graph orchestration (Lab 7), evidence grounding (9),
 * self-healing validation (10), acceptance gate (11), governance (12),
 * metrics (14) and the run lifecycle.
 */
const {
  config, db, util, specialists, skills, runtime, connector, tools: toolFactory,
} = require('./core');
const agents = require('./agents');
const { AGENTS, CALLS, DOCUMENT_REGISTER, USERS, INSTITUTION } = require('./seed');

const { money } = util;
const { createContext, canRetry } = runtime;
const { getSpecialist } = specialists;

/* ------------------------------- graph ----------------------------------- */

const GRAPH = {
  nodes: [
    { id: 'gate-1', label: 'Gate 1 · profile intake', agent: 'coordinator', phase: 'Intake' },
    { id: 'plan', label: 'Plan & lock', agent: 'coordinator', phase: 'Intake' },
    { id: 'discovery', label: 'Funding discovery', agent: 'funding', phase: 'Parallel discovery', parallelGroup: 'discovery' },
    { id: 'literature', label: 'Literature review', agent: 'literature', phase: 'Parallel discovery', parallelGroup: 'discovery' },
    { id: 'merge', label: 'Context merge', agent: 'coordinator', phase: 'Discovery' },
    { id: 'drafting', label: 'Proposal drafting', agent: 'drafting', phase: 'Drafting' },
    { id: 'budget', label: 'Budget planning', agent: 'budget', phase: 'Parallel budget & compliance', parallelGroup: 'budget' },
    { id: 'compliance', label: 'Compliance check', agent: 'compliance', phase: 'Parallel budget & compliance', parallelGroup: 'budget' },
    { id: 'validation', label: 'Validate & repair', agent: 'coordinator', phase: 'Validation' },
    { id: 'packaging', label: 'Package', agent: 'submission', phase: 'Packaging' },
    { id: 'acceptance', label: 'Acceptance gate', agent: 'coordinator', phase: 'Packaging' },
    { id: 'review', label: 'Research Office review', agent: 'review', phase: 'Approval', gate: true },
    { id: 'publish', label: 'Publish & dashboard', agent: 'coordinator', phase: 'Approval' },
  ],
  edges: [
    ['gate-1', 'plan'], ['plan', 'discovery'], ['plan', 'literature'],
    ['discovery', 'merge'], ['literature', 'merge'], ['merge', 'drafting'],
    ['drafting', 'budget'], ['drafting', 'compliance'], ['budget', 'validation'], ['compliance', 'validation'],
    ['validation', 'packaging'], ['validation', 'drafting', 'fail (bounded retry)'],
    ['packaging', 'acceptance'], ['acceptance', 'review', 'pass'], ['acceptance', 'validation', 'fail (bounded retry)'],
    ['review', 'publish', 'approved'], ['review', 'drafting', 'changes requested'], ['publish', 'dashboard'],
  ],
  retryEdge: { from: 'validation', to: 'drafting', budget: config.retryBudget },
};

/* ------------------------------- intake ---------------------------------- */

const DOMAIN_LEXICON = [
  { tag: 'ai-ml', words: ['ai', 'artificial', 'machine', 'learning', 'federated', 'model', 'algorithm', 'neural', 'deep'] },
  { tag: 'health', words: ['health', 'clinical', 'patient', 'medical', 'retina', 'retinopathy', 'diagnos', 'screening', 'ophthalm'] },
  { tag: 'public-health', words: ['rural', 'community', 'primary', 'public', 'epidemi'] },
  { tag: 'education', words: ['education', 'learning', 'student', 'school', 'classroom', 'pedagog', 'curricul'] },
  { tag: 'energy', words: ['energy', 'solar', 'battery', 'grid', 'power'] },
  { tag: 'materials', words: ['material', 'membrane', 'perovskite', 'alloy', 'polymer'] },
  { tag: 'climate', words: ['climate', 'water', 'carbon', 'sustainab'] },
  { tag: 'robotics', words: ['robot', 'cyber-physical', 'cps', 'autonomous', 'manufactur'] },
];

function deriveDomains(text) {
  const t = String(text || '').toLowerCase();
  return DOMAIN_LEXICON.filter((d) => d.words.some((w) => t.includes(w))).map((d) => d.tag);
}

function deriveKeywords(text) {
  const seen = [];
  for (const w of util.tokenize(text)) if (!seen.includes(w) && w.length > 3) seen.push(w);
  return seen.slice(0, 6);
}

function clarify({ request = '', params = {} } = {}) {
  const researchArea = String(params.researchArea || request || '').trim();
  const words = researchArea.split(/\s+/).filter(Boolean);
  const missing = [];
  const questions = [];

  if (researchArea.length < 12 || words.length < 4) {
    missing.push('researchArea');
    questions.push('What is the specific research area, population and setting? For example: "federated learning for diabetic retinopathy screening in rural primary care".');
    questions.push('Which 3–5 keywords should the funding discovery agent match against agency calls?');
  }
  if (!params.fundingType) {
    missing.push('fundingType');
    questions.push('Which funder type should be prioritised: government agency, industry/CSR, or international?');
  }
  if (!params.requestedBudget) {
    missing.push('requestedBudget');
    questions.push('What total budget should the plan target, and over how many months?');
  }
  if (!params.consent) {
    missing.push('consent');
    questions.push('Do you consent to profile and publication matching against your research area? Gate 1 cannot start without it.');
  }

  const keywords = (params.keywords && params.keywords.length ? params.keywords : deriveKeywords(researchArea)).slice(0, 8);
  const domains = util.unique([...(params.domains || []), ...deriveDomains(`${researchArea} ${keywords.join(' ')}`)]);
  const clarified = {
    statement: `${researchArea || 'unspecified area'} · ${params.fundingType || 'unspecified'} · ${params.requestedBudget ? util.compactMoney(params.requestedBudget) : 'budget TBC'} · ${params.durationMonths || 36} months`,
    researchArea,
    keywords,
    domains,
    fundingType: params.fundingType || null,
    requestedBudget: Number(params.requestedBudget) || null,
    durationMonths: Number(params.durationMonths) || 36,
    careerStage: params.careerStage || 'associate',
    institutionType: params.institutionType || 'university',
    humanSubjects: params.humanSubjects ?? domains.includes('health'),
    setting: params.setting || null,
    sites: Number(params.sites) || 4,
    sampleSize: Number(params.sampleSize) || 2400,
    consortiumPartners: params.consortiumPartners || [],
    industryPartner: Boolean(params.industryPartner),
  };

  return { complete: missing.length === 0, missing, questions, clarified, atLeastTwoQuestions: questions.length >= 2 };
}

/* ------------------------------ run factory ------------------------------ */

function createRun({ request, params = {}, consent = false, actorId = 'usr-ananya', faults = [] }) {
  const actor = USERS.find((u) => u.id === actorId) || USERS[0];
  const { complete, missing, questions, clarified } = clarify({ request, params: { ...params, consent } });
  const domain = clarified.fundingType === 'industry' ? 'industry' : clarified.fundingType === 'international' ? 'international' : 'government';
  const run = {
    id: db.nextRunId(),
    createdAt: util.nowIso(),
    updatedAt: util.nowIso(),
    completedAt: null,
    actor: {
      id: actor.id,
      userId: actor.id,
      name: actor.name,
      role: actor.role,
      title: actor.title,
      dept: actor.department || actor.dept || actor.Dept,
      email: actor.email,
    },
    request,
    consent: Boolean(consent),
    intake: { complete, missing, questions },
    params: {
      researchArea: clarified.researchArea,
      keywords: clarified.keywords,
      fundingType: clarified.fundingType || 'government',
      requestedBudget: clarified.requestedBudget || 0,
      durationMonths: clarified.durationMonths,
      careerStage: clarified.careerStage,
      institutionType: clarified.institutionType,
      humanSubjects: clarified.humanSubjects,
      setting: clarified.setting,
      sites: clarified.sites,
      sampleSize: clarified.sampleSize,
      consortiumPartners: clarified.consortiumPartners,
      industryPartner: clarified.industryPartner,
      piName: actor.name,
      deadlineWindowDays: 120,
      // Faculty-entered budget rows: [{ requirement, cost }] in rupees.
      budgetLines: Array.isArray(params.budgetLines)
        ? params.budgetLines
            .map((l) => ({ requirement: String(l.requirement || '').trim(), cost: Math.max(0, Math.round(Number(l.cost) || 0)) }))
            .filter((l) => l.requirement && l.cost > 0)
        : [],
    },
    clarified,
    domain,
    status: 'draft',
    stage: 'intake',
    plan: null,
    discovery: null,
    literature: null,
    draft: null,
    budget: null,
    compliance: null,
    evidence: null,
    validation: { attempts: 0, maxAttempts: config.retryBudget, report: null, diagnostics: [] },
    package: null,
    acceptance: null,
    approvals: { required: true, decision: null, decidedBy: null, decidedAt: null, notes: null, history: [] },
    declaration: null,
    documents: JSON.parse(JSON.stringify(DOCUMENT_REGISTER)),
    versions: [],
    publishedVersion: null,
    swarm: null,
    graph: GRAPH,
    trace: [],
    logs: [],
    checkpoints: [],
    faults: [...(faults || [])],
    injected: [],
    metrics: { steps: 0, toolCalls: 0, repairAttempts: 0, cycleMs: null },
    error: null,
    institution: INSTITUTION,
  };
  return run;
}

/* ------------------------------- evidence -------------------------------- */

const RECORD_IDS = new Set(['rec-personnel', 'rec-institution', 'rec-rates', 'rec-faculty-budget']);

function createResolver(call, tools) {
  const lit = new Set(tools.literature({}).map((l) => l.id));
  const pol = new Set(tools.policies({}).map((p) => p.id));
  const hist = new Set(tools.history({}).map((h) => h.id));
  const guides = new Set((call?.guidelines || []).map((g) => g.id));
  return (ev) => {
    if (!ev?.sourceId) return false;
    if (ev.sourceType === 'literature') return lit.has(ev.sourceId);
    if (ev.sourceType === 'guideline') return guides.has(ev.sourceId);
    if (ev.sourceType === 'policy') return pol.has(ev.sourceId);
    if (ev.sourceType === 'history') return hist.has(ev.sourceId);
    if (ev.sourceType === 'record') return RECORD_IDS.has(ev.sourceId);
    return false;
  };
}

function buildEvidence(run, tools) {
  const call = run.discovery?.selectedCall;
  const claims = run.draft?.claims || [];
  const resolve = createResolver(call, tools);
  const records = [];
  const withoutEvidence = [];
  const outOfScope = [];
  for (const claim of claims) {
    const evs = claim.evidence || [];
    if (!evs.length) {
      withoutEvidence.push({ claimId: claim.id, sectionKey: claim.sectionKey, text: claim.text, reason: 'No evidence attached.' });
      continue;
    }
    let any = false;
    for (const ev of evs) {
      const known = resolve(ev);
      const quoteOk = Boolean(ev.quote && String(ev.quote).trim().length >= 10);
      const inScope = known && quoteOk;
      if (inScope) any = true;
      if (!inScope) outOfScope.push({ claimId: claim.id, sourceId: ev.sourceId, sourceType: ev.sourceType, reason: !known ? 'Source does not resolve in the approved corpus for this call.' : 'Source quote missing or too short.' });
      records.push({ claimId: claim.id, claimText: claim.text, sectionKey: claim.sectionKey, sourceId: ev.sourceId, sourceTitle: ev.title, sourceType: ev.sourceType, locator: ev.locator, quote: ev.quote, inScope, knownSource: known, quoteOk });
    }
    claim.grounded = any;
  }
  const grounded = claims.length - withoutEvidence.length;
  return {
    records, totalClaims: claims.length, groundedClaims: grounded,
    coverage: claims.length ? util.round((grounded / claims.length) * 100, 1) : 0,
    sourceCount: new Set(records.filter((r) => r.inScope).map((r) => r.sourceId)).size,
    claimsWithoutEvidence: withoutEvidence, outOfScope,
    rejected: [...new Set([...withoutEvidence.map((c) => c.claimId), ...outOfScope.map((o) => o.claimId)])],
    checkedAt: util.nowIso(),
    scope: { callId: call?.id || null, guidelines: call?.guidelines?.length || 0, note: 'In-scope = matched call guideline, approved corpus, institutional policy, history, or personnel/rate register.' },
  };
}

function checkCitations(run, tools) {
  const resolve = createResolver(run.discovery?.selectedCall, tools);
  const citations = run.draft?.citations || [];
  const unresolved = citations.filter((c) => !resolve({ sourceId: c.sourceId, sourceType: c.type }));
  return { total: citations.length, unresolved, ok: citations.length > 0 && unresolved.length === 0 };
}

/* ------------------------------ validation ------------------------------- */

function validate(run, tools) {
  const call = run.discovery?.selectedCall;
  const draft = run.draft;
  const budget = run.budget;
  const checks = [];
  const failures = [];

  const add = (id, label, passed, detail, failure) => {
    checks.push({ id, label, passed: Boolean(passed), detail });
    if (!passed && failure) failures.push({ check: id, ...failure });
  };

  const left = call ? util.daysBetween(util.today(), call.deadline) : -1;
  const callActive = Boolean(call) && call.verified && call.status === 'open' && left >= 0;
  add('call_active', 'The matched call is verified, open and not expired', callActive, call ? `${call.id}: verified=${call.verified}, status=${call.status}, ${left} days left` : 'No call selected',
    callActive ? null : { code: 'call_inactive', message: 'The selected call is no longer an active, verified opportunity.', artifact: 'discovery', owner: 'funding', repair: 'reselect-call', scope: 'pipeline' });

  const units = run.plan?.units || [];
  const missing = units.filter((u) => u.required && !(draft?.sections || []).some((s) => s.key === u.key));
  add('sections_complete', 'Every required section from the locked plan is present', missing.length === 0 && Boolean(draft), missing.length ? `Missing: ${missing.map((m) => m.key).join(', ')}` : `${units.length} units covered`,
    missing.length ? { code: 'section_missing', message: `Missing required section(s): ${missing.map((m) => m.key).join(', ')}`, artifact: 'draft', keys: missing.map((m) => m.key), owner: 'drafting', repair: 'regenerate-section' } : null);

  const short = (draft?.sections || []).filter((s) => { const u = units.find((x) => x.key === s.key); return u && s.wordCount < u.minWords; });
  add('sections_min_words', 'Every section meets its plan minimum length', short.length === 0, short.length ? short.map((s) => `${s.key} ${s.wordCount}/${units.find((u) => u.key === s.key).minWords}`).join('; ') : 'All sections within range',
    short.length ? { code: 'section_short', message: `Section(s) below minimum length: ${short.map((s) => s.key).join(', ')}`, artifact: 'draft', keys: short.map((s) => s.key), owner: 'drafting', repair: 'expand-section' } : null);

  const evidence = buildEvidence(run, tools);
  run.evidence = evidence;
  const ungrounded = evidence.claimsWithoutEvidence.map((c) => c.claimId);
  add('claims_grounded', 'Every claim carries at least one in-scope source', ungrounded.length === 0 && evidence.outOfScope.length === 0,
    ungrounded.length || evidence.outOfScope.length ? `${ungrounded.length} claim(s) without evidence; ${evidence.outOfScope.length} out-of-scope source(s)` : `${evidence.groundedClaims}/${evidence.totalClaims} claims grounded across ${evidence.sourceCount} sources (${evidence.coverage}%)`,
    ungrounded.length || evidence.outOfScope.length ? { code: 'claim_ungrounded', message: `${ungrounded.length + evidence.outOfScope.length} claim source(s) failed the in-scope check.`, artifact: 'evidence', claimIds: [...new Set([...ungrounded, ...evidence.outOfScope.map((o) => o.claimId)])], owner: 'drafting', repair: 'remove-ungrounded-claim' } : null);

  const citations = checkCitations(run, tools);
  add('citations_resolve', 'Every rendered citation resolves to a corpus record', citations.ok, citations.ok ? `${citations.total} citations resolved` : `${citations.unresolved.length} unresolved of ${citations.total}`,
    citations.ok ? null : { code: 'citation_unresolved', message: 'The citation index contains sources outside the approved corpus.', artifact: 'draft', owner: 'drafting', repair: 'rebuild-citations' });

  const reconciled = Boolean(budget?.reconciliation?.ok);
  const liveTotals = budget ? toolFactory.computeBudget(budget.lines, budget.rules) : null;
  const liveDelta = liveTotals && budget?.totals ? liveTotals.total - budget.totals.total : 0;
  add('budget_reconciles', 'Budget line items reconcile with the stated total', reconciled && liveDelta === 0,
    budget ? (reconciled && liveDelta === 0 ? `${money(budget.totals.total)} reconciled` : `Delta ${money(liveDelta || budget.reconciliation?.delta || 0)} between line items and totals`) : 'No budget',
    reconciled && liveDelta === 0 ? null : { code: 'budget_reconcile', message: `Budget reconciliation failed by ${money(liveDelta || budget?.reconciliation?.delta || 0)}.`, artifact: 'budget', owner: 'budget', repair: 'reconcile-budget' });

  const liveCaps = budget ? toolFactory.capReport(budget.lines, budget.rules) : [];
  const overCaps = liveCaps.filter((c) => c.status === 'over');
  add('budget_caps', 'No budget category exceeds an agency ceiling', overCaps.length === 0, overCaps.length ? overCaps.map((c) => `${c.label} ${c.actualPct}%>${c.capPct}%`).join('; ') : 'All categories inside their ceilings',
    overCaps.length ? { code: 'budget_cap', message: `Category ceiling breached: ${overCaps.map((c) => c.label).join(', ')}.`, artifact: 'budget', categories: overCaps.map((c) => c.key), owner: 'budget', repair: 'enforce-caps' } : null);

  // Recompute compliance against the current document register and budget so a
  // late document removal or figure edit cannot slip past cached checks.
  if (run.compliance && draft && budget) agents.compliance.reevaluate(run);

  const blocking = (run.compliance?.checks || []).filter((c) => c.status === 'fail' && c.severity === 'blocking');
  add('compliance_blocking', 'No blocking compliance requirement fails', blocking.length === 0 && Boolean(run.compliance), blocking.length ? blocking.map((b) => b.id).join(', ') : `${run.compliance?.summary?.pass || 0} requirements passed`,
    blocking.length ? { code: 'compliance_blocking', message: `${blocking.length} blocking compliance requirement(s) failing.`, artifact: 'compliance', checks: blocking.map((b) => ({ id: b.id, docKey: b.docKey, owner: b.owner, sectionKey: b.sectionKey, category: b.category })), owner: 'compliance', repair: 'compliance-fix' } : null);

  const disclosed = Boolean(draft?.disclosure?.text);
  add('ai_disclosure', 'AI-assisted drafting is disclosed', disclosed, disclosed ? `Declaration attached (${draft.disclosure.policyId})` : 'No disclosure on the draft',
    disclosed ? null : { code: 'disclosure_missing', message: 'AI disclosure missing.', artifact: 'draft', owner: 'drafting', repair: 'attach-disclosure' });

  add('deadline_valid', `Submission is feasible with the ${config.reviewBufferDays}-day review buffer`, left >= config.reviewBufferDays, `${left} days remaining before ${call?.deadline}`,
    left >= config.reviewBufferDays ? null : { code: 'deadline_infeasible', message: `Only ${left} days remain; the review buffer is ${config.reviewBufferDays} days.`, artifact: 'compliance', owner: 'review', repair: 'escalate' });

  const specialist = getSpecialist(run.domain);
  if (draft) {
    const text = agents.helpers.textOf(draft);
    const objectivesSection = draft.sections.find((s) => s.key === 'objectives');
    const objectivesText = objectivesSection ? objectivesSection.paragraphs.map((p) => p.text).join(' ') : '';
    const numberedObjectives = (objectivesText.match(/Objective \d/gi) || []).length;
    const ordinalObjectives = ['first', 'second', 'third', 'fourth'].filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(objectivesText)).length;
    const output = {
      objectives: Math.max(numberedObjectives, ordinalObjectives),
      hasMilestones: /milestone|month \d|work package|quarter/i.test(text),
      measurable: /target|measurabl|%|threshold/i.test(text),
      indicators: (text.match(/indicator/gi) || []).length,
      hasSustainability: draft.sections.some((s) => s.key === 'sustainability'),
      complianceStatement: /schedule vii|csr-1|companies act/i.test(text),
      partners: (run.params.consortiumPartners || []).length,
      openScience: /open[- ]science|open access|fair data/i.test(text),
      ethics: draft.sections.some((s) => s.key === 'ethics-security' || s.key === 'data-management'),
    };
    const scheme = specialist.scheme.check(output);
    add('specialist_scheme', `Domain specialist contract (${specialist.label}) is satisfied`, scheme.passed, scheme.results.map((r) => `${r.label}: ${r.passed ? 'ok' : r.detail}`).join('; '),
      scheme.passed ? null : { code: 'specialist_scheme', message: `Domain contract not satisfied: ${scheme.results.filter((r) => !r.passed).map((r) => r.label).join(', ')}`, artifact: 'draft', owner: 'drafting', repair: 'regenerate-section', keys: scheme.results.some((r) => !r.passed && /objective/i.test(r.label)) ? ['objectives'] : [specialist.sections[0]] });
    run.specialistCheck = { specialist: specialist.id, output, scheme };
  }

  const passed = checks.every((c) => c.passed);
  return {
    report: {
      passed, checks, failures, attempts: run.validation?.attempts || 0, checkedAt: util.nowIso(),
      summary: { total: checks.length, passed: checks.filter((c) => c.passed).length, failed: checks.filter((c) => !c.passed).length, evidenceCoverage: evidence.coverage, budgetDelta: budget?.reconciliation?.delta ?? null, blockingCompliance: blocking.length },
    },
    evidence,
  };
}

async function applyRepair(ctx, failure) {
  const run = ctx.run;
  switch (failure.repair) {
    case 'regenerate-section':
      for (const key of failure.keys || []) await agents.drafting.regenerateSection(ctx, key);
      return `Regenerated section(s): ${(failure.keys || []).join(', ')}`;
    case 'expand-section':
      for (const key of failure.keys || []) await agents.drafting.expandSection(ctx, key);
      return `Expanded section(s) to the plan minimum: ${(failure.keys || []).join(', ')}`;
    case 'remove-ungrounded-claim': {
      const ids = failure.claimIds || run.evidence?.rejected || [];
      agents.drafting.removeUngroundedClaims(run, ids);
      return `Rejected ${ids.length} ungrounded claim(s) and removed them from the narrative.`;
    }
    case 'rebuild-citations':
      run.draft.citations = skills.citationIndex(run.draft);
      return 'Rebuilt the citation index from claim evidence.';
    case 'reconcile-budget':
      agents.budget.repairReconciliation(run);
      return `Recomputed budget totals from the line items (delta ${run.budget.reconciliation.delta}).`;
    case 'enforce-caps':
      agents.budget.enforceCaps(run);
      return 'Rebalanced breaching categories into consumables until every ceiling held.';
    case 'attach-disclosure':
      agents.drafting.attachDisclosure(run);
      return 'Attached the AI-assisted drafting declaration.';
    case 'compliance-fix': {
      const fixes = [];
      for (const failed of failure.checks || []) {
        if (failed.docKey) {
          const doc = agents.compliance.attachDocument(run, failed.docKey, 'Attached during targeted compliance repair.');
          fixes.push(doc ? `attached ${failed.docKey}` : `no register entry for ${failed.docKey}`);
        } else if (failed.category === 'Budget') {
          if (failed.id === 'chk-budget-ceiling') { agents.budget.fitCeiling(run); fixes.push('scaled direct costs to fit the agency ceiling'); }
          else if (/cap/i.test(failed.id)) { agents.budget.enforceCaps(run); fixes.push('rebalanced capped category'); }
          else { agents.budget.repairReconciliation(run); fixes.push('recomputed budget totals'); }
        } else if (failed.sectionKey) {
          await agents.drafting.regenerateSection(ctx, failed.sectionKey);
          fixes.push(`regenerated ${failed.sectionKey}`);
        } else fixes.push(`escalated ${failed.id}`);
      }
      return fixes.join('; ') || 'No automatically repairable compliance item.';
    }
    case 'reselect-call':
      return 'Re-selecting an active call and rebuilding dependent artefacts.';
    default:
      return null;
  }
}

/* ----------------------------- acceptance -------------------------------- */

function runAcceptance(run) {
  const validation = run.validation?.report || { checks: [] };
  const tests = validation.checks.map((c) => ({ id: c.id, name: c.label, passed: c.passed, detail: c.detail, group: 'Artifact' }));
  const pkg = run.package;
  tests.push({ id: 'package_files', name: 'Package contains the required submission files', passed: (pkg?.files?.length || 0) >= 5, detail: pkg ? `${pkg.files.length} files` : 'No package', group: 'Package' });
  tests.push({ id: 'package_checksum', name: 'Package checksum matches its contents', passed: Boolean(pkg) && pkg.checksum === agents.submission.checksumOf(pkg.files), detail: pkg?.checksum?.slice(0, 16), group: 'Package' });
  tests.push({ id: 'package_gate', name: 'Package requires human sign-off before submission', passed: Boolean(pkg?.requiresApproval) && pkg?.agencySubmission?.submitted === false, detail: 'requiresApproval=' + Boolean(pkg?.requiresApproval), group: 'Package' });
  tests.push({ id: 'declaration', name: 'Submission declaration is attached', passed: Boolean(run.declaration?.text), detail: run.declaration?.status || 'missing', group: 'Package' });
  tests.push({ id: 'compliance_manual', name: 'Manual-interpretation items are routed to a human', passed: (run.compliance?.manualItems || []).every((id) => run.compliance.checks.find((c) => c.id === id)?.manual), detail: `${run.compliance?.manualItems?.length || 0} manual item(s)`, group: 'Governance' });
  const allPass = tests.every((t) => t.passed);
  return { tests, allPass, ranAt: util.nowIso(), blocking: tests.filter((t) => !t.passed) };
}

/* ------------------------------- governance ------------------------------ */

function actorById(id) { return USERS.find((u) => u.id === id) || null; }
const canApprove = (actor) => Boolean(actor?.permissions?.includes('review:approve'));
const canRollback = (actor) => Boolean(actor?.permissions?.includes('version:rollback'));

function approveRun(run, actor, { decision = 'approve', notes = '', edits = null }) {
  if (!actor) { const e = new Error('Unknown actor'); e.status = 401; throw e; }
  if (!canApprove(actor)) { const e = new Error(`${actor.name} does not hold the review:approve permission.`); e.status = 403; throw e; }
  if (run.status !== 'awaiting_review' && run.status !== 'changes_requested') { const e = new Error(`Run is "${run.status}"; only a packaged run awaiting review can be decided.`); e.status = 409; throw e; }
  if (!run.acceptance?.allPass) { const e = new Error('The acceptance suite has not passed; a run cannot skip the hard gate.'); e.status = 409; throw e; }
  if (!run.package) { const e = new Error('No submission package exists.'); e.status = 409; throw e; }

  if (edits && Array.isArray(edits.sections)) {
    for (const edit of edits.sections) {
      const section = run.draft.sections.find((s) => s.key === edit.key);
      if (section && typeof edit.text === 'string') {
        section.paragraphs = [{ text: edit.text, claimIds: [] }];
        section.wordCount = edit.text.split(/\s+/).filter(Boolean).length;
        section.updatedBy = actor.name;
      }
    }
    run.draft.version += 1;
    run.draft.citations = skills.citationIndex(run.draft);
    run.package = agents.submission.buildPackage(run, run.package);
  }

  const entry = {
    at: util.nowIso(),
    actor: actor.name,
    actorId: actor.id || actor.userId,
    actorEmail: actor.email,
    role: actor.role,
    dept: actor.department || actor.dept || actor.Dept,
    decision,
    notes,
    checksum: run.package.checksum,
    version: run.package.version,
  };
  run.approvals.history.push(entry);
  run.updatedAt = util.nowIso();

  if (decision === 'approve') {
    run.approvals.decision = 'approved';
    run.approvals.decidedBy = actor.name;
    run.approvals.decidedById = actor.id || actor.userId;
    run.approvals.decidedByEmail = actor.email;
    run.approvals.decidedByDept = actor.department || actor.dept || actor.Dept;
    run.approvals.decidedAt = util.nowIso();
    run.approvals.notes = notes;
    run.package.status = 'approved';
    run.package.agencySubmission = { submitted: false, submittedAt: null, requiresSignOff: true, portalReference: `PORTAL-${run.id}` };
    run.declaration.status = 'signed';
    run.declaration.signedBy = actor.name;
    run.declaration.signedById = actor.id || actor.userId;
    run.status = 'published';
    run.stage = 'published';
    run.completedAt = util.nowIso();
    run.metrics.cycleMs = new Date(run.completedAt) - new Date(run.createdAt);

    const versions = db.state.versions.filter((v) => v.runId === run.id);
    const v = versions.length ? Math.max(...versions.map((x) => x.v)) + 1 : 1;
    const version = {
      id: util.uid('ver'), runId: run.id, v, at: util.nowIso(), checksum: run.package.checksum, status: 'published',
      callId: run.discovery?.selectedCallId, title: run.draft.title, approvedBy: actor.name, bytes: run.package.files.reduce((a, f) => a + f.bytes, 0),
      snapshot: { draft: run.draft, budget: run.budget, compliance: run.compliance, evidence: run.evidence, package: run.package, approvals: run.approvals, declaration: run.declaration },
    };
    db.addVersion(version);
    run.versions.push({ v, at: version.at, checksum: version.checksum, status: 'published', approvedBy: actor.name });
    run.publishedVersion = v;
    run.trace.push({ id: `publish-${v}`, label: `Published v${v}`, agent: 'coordinator', status: 'done', startedAt: util.nowIso(), endedAt: util.nowIso(), kind: 'gate' });
    db.audit({ runId: run.id, actor: actor.name, actorId: actor.id || actor.userId, actorEmail: actor.email, actorRole: actor.role, agent: 'governance', phase: 'approval', intent: `Authorise submission of ${run.id}`, action: 'governance.publish', inputs: { version: v, checksum: run.package.checksum }, outputs: { status: 'published', publishedVersion: v, approvedById: actor.id || actor.userId }, result: 'approved', level: 'gate' });
  } else if (decision === 'request_changes') {
    run.approvals.decision = 'changes_requested';
    run.approvals.decidedBy = actor.name;
    run.approvals.decidedById = actor.id || actor.userId;
    run.approvals.decidedByEmail = actor.email;
    run.approvals.decidedAt = util.nowIso();
    run.approvals.notes = notes;
    run.status = 'changes_requested';
    run.stage = 'validation';
    run.package.status = 'revision';
    run.acceptance = null;
    run.approvals.routing = (run.validation?.report?.failures || []).map((f) => f.owner)[0] || 'drafting';
    db.audit({ runId: run.id, actor: actor.name, actorId: actor.id || actor.userId, actorEmail: actor.email, actorRole: actor.role, agent: 'governance', phase: 'approval', intent: 'Request corrections before submission', action: 'governance.request_changes', inputs: { notes }, outputs: { routedTo: run.approvals.routing }, result: 'changes_requested', level: 'gate' });
  } else {
    run.approvals.decision = 'rejected';
    run.approvals.decidedBy = actor.name;
    run.approvals.decidedById = actor.id || actor.userId;
    run.approvals.decidedByEmail = actor.email;
    run.approvals.decidedAt = util.nowIso();
    run.status = 'rejected';
    run.stage = 'rejected';
    run.completedAt = util.nowIso();
    run.package.status = 'rejected';
    db.audit({ runId: run.id, actor: actor.name, actorId: actor.id || actor.userId, actorEmail: actor.email, actorRole: actor.role, agent: 'governance', phase: 'approval', intent: 'Reject the submission package', action: 'governance.reject', inputs: { notes }, outputs: { status: 'rejected' }, result: 'rejected', level: 'gate' });
  }
  db.persist();
  // Force the linked write so approval refs resolve even if the debounce races.
  require('./persistence').saveRun(run).catch(() => {});
  return run;
}

function rollbackRun(run, versionId, actor) {
  if (!actor || !canRollback(actor)) { const e = new Error(`${actor?.name || 'Actor'} does not hold the version:rollback permission.`); e.status = 403; throw e; }
  const version = db.state.versions.find((v) => v.id === versionId && v.runId === run.id) || db.state.versions.find((v) => v.runId === run.id && v.v === Number(versionId));
  if (!version) { const e = new Error('Version not found for this run.'); e.status = 404; throw e; }
  const snapshot = version.snapshot;
  run.draft = snapshot.draft;
  run.budget = snapshot.budget;
  run.compliance = snapshot.compliance;
  run.evidence = snapshot.evidence;
  run.package = { ...snapshot.package, status: 'approved' };
  run.approvals = snapshot.approvals;
  run.declaration = snapshot.declaration;
  run.status = 'published';
  run.stage = 'published';
  run.publishedVersion = version.v;
  run.rollback = { at: util.nowIso(), by: actor.name, toVersion: version.v, fromVersion: run.versions[run.versions.length - 1]?.v || null };
  const v = Math.max(...db.state.versions.filter((x) => x.runId === run.id).map((x) => x.v)) + 1;
  run.publishedVersion = v;
  db.addVersion({ id: util.uid('ver'), runId: run.id, v, at: util.nowIso(), checksum: run.package.checksum, status: 'published', restoredFrom: version.v, approvedBy: actor.name, title: run.draft.title, snapshot });
  run.versions.push({ v, at: util.nowIso(), checksum: run.package.checksum, status: 'published', restoredFrom: version.v, approvedBy: actor.name });
  db.audit({ runId: run.id, actor: actor.name, actorId: actor.id || actor.userId, actorEmail: actor.email, actorRole: actor.role, agent: 'governance', phase: 'rollback', intent: `Roll back to version ${version.v}`, action: 'governance.rollback', inputs: { versionId, to: version.v }, outputs: { publishedVersion: v, restoredFrom: version.v }, result: 'rolled_back', level: 'gate' });
  db.persist();
  require('./persistence').saveRun(run).catch(() => {});
  return run;
}

/* -------------------------------- metrics -------------------------------- */

function computeMetrics() {
  const runs = db.state.runs;
  const published = runs.filter((r) => r.status === 'published');
  const rejected = runs.filter((r) => r.status === 'rejected');
  const awaiting = runs.filter((r) => r.status === 'awaiting_review');
  const needsHuman = runs.filter((r) => r.status === 'needs_human');
  const withEvidence = runs.filter((r) => r.evidence);
  const avg = (arr) => (arr.length ? util.round(arr.reduce((a, b) => a + b, 0) / arr.length, 1) : 0);
  const cycles = published.filter((r) => r.metrics.cycleMs).map((r) => r.metrics.cycleMs / 60000);
  const repairs = runs.reduce((a, r) => a + (r.validation?.attempts || 0), 0);
  const repairedRuns = runs.filter((r) => r.validation?.attempts > 0);
  const repairedOk = repairedRuns.filter((r) => r.validation?.report?.passed);
  const byDomain = { government: 0, industry: 0, international: 0 };
  for (const r of runs) byDomain[r.domain] = (byDomain[r.domain] || 0) + 1;
  const upcoming = CALLS.filter((c) => c.verified && c.status === 'open' && util.daysBetween(util.today(), c.deadline) >= 0)
    .sort((a, b) => util.daysBetween(util.today(), a.deadline) - util.daysBetween(util.today(), b.deadline))
    .slice(0, 5)
    .map((c) => ({ id: c.id, agency: c.agency, title: c.title, deadline: c.deadline, daysLeft: util.daysBetween(util.today(), c.deadline), budgetMax: c.budgetMax }));

  return {
    totals: { runs: runs.length, published: published.length, awaitingReview: awaiting.length, rejected: rejected.length, needsHuman: needsHuman.length, versions: db.state.versions.length, toolCalls: runs.reduce((a, r) => a + (r.metrics.toolCalls || 0), 0) },
    rates: {
      approvalRate: published.length + rejected.length ? util.round((published.length / (published.length + rejected.length)) * 100, 1) : 0,
      evidenceCoverage: avg(withEvidence.map((r) => r.evidence.coverage)),
      compliancePassRate: avg(runs.filter((r) => r.compliance).map((r) => r.compliance.summary.passRate)),
      repairSuccessRate: repairedRuns.length ? util.round((repairedOk.length / repairedRuns.length) * 100, 1) : 0,
      avgCycleMinutes: avg(cycles),
    },
    repairs: { total: repairs, runs: repairedRuns.length, recovered: repairedOk.length },
    byDomain,
    upcoming,
    recent: runs.slice(-6).reverse().map((r) => ({ id: r.id, title: r.draft?.title || r.params.researchArea, status: r.status, createdAt: r.createdAt, call: r.discovery?.selectedCall?.agency || null, coverage: r.evidence?.coverage || 0 })),
    funnel: {
      intake: runs.length,
      discovered: runs.filter((r) => r.discovery).length,
      drafted: runs.filter((r) => r.draft).length,
      validated: runs.filter((r) => r.validation?.report?.passed).length,
      packaged: runs.filter((r) => r.package).length,
      approved: published.length,
    },
    agents: AGENTS.map((a) => ({ id: a.id, name: a.short, group: a.group, steps: runs.reduce((acc, r) => acc + (r.logs || []).filter((l) => l.agent === a.id).length, 0) })),
  };
}

/* ------------------------------ orchestration ---------------------------- */

function startNode(run, id) {
  const def = GRAPH.nodes.find((n) => n.id === id) || { id, label: id, agent: 'coordinator' };
  const node = { ...def, status: 'running', startedAt: util.nowIso(), endedAt: null, durationMs: null, detail: null };
  run.trace.push(node);
  db.persist();
  return node;
}

function endNode(run, node, status = 'done', detail = null) {
  if (!node) return;
  node.status = status;
  node.endedAt = util.nowIso();
  node.durationMs = new Date(node.endedAt) - new Date(node.startedAt);
  if (detail) node.detail = detail;
  db.persist();
}

async function execute(run) {
  const ctx = createContext(run, run.actor);
  run.status = 'running';
  run.startedAt = util.nowIso();
  db.persist();

  try {
    /* Gate 1 — intake and permissions */
    const gate = startNode(run, 'gate-1');
    run.stage = 'intake';
    ctx.agent = 'coordinator';
    const users = ctx.tools.users({});
    const actor = users.find((u) => u.id === run.actor.id);
    if (!actor) throw Object.assign(new Error('Actor is not provisioned in the identity register.'), { code: 'permission_denied' });
    if (!actor.permissions.includes('run:create')) throw Object.assign(new Error(`${actor.name} does not hold run:create.`), { code: 'permission_denied' });
    if (!run.consent) throw Object.assign(new Error('Profile and publication matching consent is required at Gate 1.'), { code: 'consent_required' });
    if (!run.intake.complete) throw Object.assign(new Error(`Intake incomplete: ${run.intake.missing.join(', ')}`), { code: 'intake_incomplete' });

    await ctx.step({ agent: 'coordinator', phase: 'intake', intent: 'Check permissions and Gate 1 consent', action: 'identity.permissions + consent', inputs: { actor: run.actor.id, consent: run.consent }, outputs: { role: actor.role, permissions: actor.permissions.length }, result: 'ok' });
    await ctx.step({ agent: 'coordinator', phase: 'intake', intent: 'Clarify the free-text request into structured parameters', action: 'clarify(request)', inputs: { request: run.request.slice(0, 200) }, outputs: { researchArea: run.clarified.researchArea, keywords: run.clarified.keywords, domains: run.clarified.domains } });
    endNode(run, gate, 'done', `${run.clarified.keywords.length} keywords · ${run.clarified.domains.join(', ') || 'no domain tags'}`);

    /* Plan v1 */
    const planNode = startNode(run, 'plan');
    run.stage = 'planning';
    const specialist = getSpecialist(run.domain);
    run.plan = skills.buildPlan({
      researchArea: run.clarified.researchArea, keywords: run.clarified.keywords,
      callId: 'pending', callTitle: `${run.params.fundingType} call (to be matched)`,
      domain: run.domain, requestedBudget: run.params.requestedBudget, durationMonths: run.params.durationMonths,
      sections: specialist.sections, retryBudget: config.retryBudget, specialistId: specialist.id,
    });
    await ctx.step({ agent: 'coordinator', phase: 'planning', intent: 'Create and lock the run plan from the domain template', action: 'skill.plan', inputs: { domain: run.domain, sections: specialist.sections.length }, outputs: { planId: run.plan.id, units: run.plan.units.length, phases: run.plan.phases.length, checksum: run.plan.checksum.slice(0, 12) } });
    ctx.checkpoint('plan', { units: run.plan.units.length });
    endNode(run, planNode, 'done', `${run.plan.units.length} units · locked`);

    /* Parallel discovery */
    const discoveryNode = startNode(run, 'discovery');
    const literatureNode = startNode(run, 'literature');
    const fundingCtx = createContext(run, run.actor);
    const literatureCtx = createContext(run, run.actor);
    const discoveryPromise = agents.discovery.run(fundingCtx);
    const [discoveryResult, literatureResult] = await Promise.allSettled([
      discoveryPromise,
      agents.literature.run(literatureCtx, discoveryPromise),
    ]);
    if (discoveryResult.status === 'rejected') throw discoveryResult.reason;
    if (literatureResult.status === 'rejected') throw literatureResult.reason;
    endNode(run, discoveryNode, 'done', discoveryResult.value.selectedCall.agency);
    endNode(run, literatureNode, 'done', `${literatureResult.value.retrieved.length} sources`);

    /* Merge + plan reconciliation to the call */
    const mergeNode = startNode(run, 'merge');
    const call = run.discovery.selectedCall;
    const callSections = call.requiredSections;
    run.plan = skills.buildPlan({
      researchArea: run.clarified.researchArea, keywords: run.clarified.keywords,
      callId: call.id, callTitle: `${call.agency} ${call.program}`,
      domain: run.domain, requestedBudget: run.params.requestedBudget, durationMonths: run.params.durationMonths,
      sections: callSections, retryBudget: config.retryBudget, specialistId: specialist.id,
    });
    await ctx.step({ agent: 'coordinator', phase: 'merge', intent: 'Reconcile the locked plan with the matched call requirements', action: 'plan.revise + context.merge', inputs: { call: call.id, requiredSections: call.requiredSections.length }, outputs: { planVersion: run.plan.version, units: run.plan.units.length, callDeadline: call.deadline } });
    ctx.checkpoint('plan-reconciled', { call: call.id, units: run.plan.units.length });
    endNode(run, mergeNode, 'done', `plan v${run.plan.version} · ${call.id}`);

    /* Drafting */
    const draftNode = startNode(run, 'drafting');
    run.stage = 'drafting';
    const draftingCtx = createContext(run, run.actor);
    await agents.drafting.run(draftingCtx);
    endNode(run, draftNode, 'done', `${run.draft.sections.length} sections · ${run.draft.wordCount} words`);

    /* Parallel budget + compliance */
    const budgetNode = startNode(run, 'budget');
    const complianceNode = startNode(run, 'compliance');
    run.stage = 'budget';
    const budgetCtx = createContext(run, run.actor);
    const complianceCtx = createContext(run, run.actor);
    const budgetPromise = agents.budget.run(budgetCtx).then(() => run.budget);
    const compliancePromise = agents.compliance.run(complianceCtx, budgetPromise);
    const [budgetRes, complianceRes] = await Promise.allSettled([budgetPromise, compliancePromise]);
    if (budgetRes.status === 'rejected') throw budgetRes.reason;
    if (complianceRes.status === 'rejected') throw complianceRes.reason;
    endNode(run, budgetNode, 'done', run.budget.formatted.total);
    endNode(run, complianceNode, 'done', `${run.compliance.summary.pass} pass · ${run.compliance.summary.fail} fail`);

    /* Failure injection (Lab 10 demonstration) */
    injectFaults(run, ctx);

    /* Validation + bounded repair */
    const validationNode = startNode(run, 'validation');
    run.stage = 'validation';
    await validateAndRepair(run, ctx);
    endNode(run, validationNode, run.validation.report.passed ? 'done' : 'failed', `attempt ${run.validation.attempts} · ${run.validation.report.summary.failed} failing`);
    if (!run.validation.report.passed) {
      run.status = 'needs_human';
      run.error = { code: 'validation_failed', message: 'Validation could not be repaired within the retry budget.', failures: run.validation.report.failures };
      run.stage = 'validation';
      run.completedAt = util.nowIso();
      db.persist();
      return run;
    }

    /* Packaging */
    const packageNode = startNode(run, 'packaging');
    run.stage = 'packaging';
    const submissionCtx = createContext(run, run.actor);
    await agents.submission.run(submissionCtx);
    endNode(run, packageNode, 'done', `v${run.package.version} · ${run.package.files.length} files`);

    /* Acceptance gate */
    const acceptanceNode = startNode(run, 'acceptance');
    run.acceptance = runAcceptance(run);
    if (!run.acceptance.allPass) {
      const rebuilt = agents.submission.buildPackage(run, run.package);
      run.package = rebuilt;
      run.acceptance = runAcceptance(run);
    }
    endNode(run, acceptanceNode, run.acceptance.allPass ? 'done' : 'failed', `${run.acceptance.tests.filter((t) => t.passed).length}/${run.acceptance.tests.length} tests`);
    if (!run.acceptance.allPass) {
      run.status = 'needs_human';
      run.error = { code: 'acceptance_failed', message: 'The acceptance suite did not pass; the package may not advance to human review.', failing: run.acceptance.blocking };
      run.stage = 'packaging';
      run.completedAt = util.nowIso();
      db.persist();
      return run;
    }

    /* Human review gate */
    const reviewNode = startNode(run, 'review');
    run.stage = 'review';
    run.status = 'awaiting_review';
    await ctx.step({ agent: 'review', phase: 'approval', intent: 'Hand the package to the Dean R&D / Research Office for sign-off', action: 'gate.await_human', inputs: { checksum: run.package.checksum }, outputs: { requiredRole: 'review:approve', signatory: INSTITUTION.signatory }, result: 'gated', level: 'gate' });
    endNode(run, reviewNode, 'waiting', 'awaiting sign-off');
    run.updatedAt = util.nowIso();
    db.persist();
    return run;
  } catch (err) {
    const message = err?.message || 'Unknown pipeline error';
    run.status = run.status === 'published' ? run.status : 'needs_human';
    run.error = { code: err.code || 'pipeline_error', message };
    run.stage = run.stage || 'error';
    const last = run.trace.find((n) => n.status === 'running');
    if (last) endNode(run, last, 'failed', message);
    ctx.log({ agent: ctx.agent, phase: 'error', intent: 'Pipeline halted', action: 'exception.route', inputs: {}, outputs: { code: run.error.code, message }, result: 'error', level: 'error' });
    db.persist();
    return run;
  }
}

function injectFaults(run, ctx) {
  const faults = run.faults || [];
  if (!faults.length) return;
  for (const fault of faults) {
    try {
      if (fault === 'missing-section') {
        run.draft.sections = run.draft.sections.filter((s) => s.key !== 'methodology');
        run.draft.claims = run.draft.claims.filter((c) => c.sectionKey !== 'methodology');
        run.injected.push({ fault, detail: 'Removed the methodology section.' });
      } else if (fault === 'budget-mismatch') {
        const line = run.budget.lines.reduce((a, b) => (a.amount >= b.amount ? a : b));
        line.amount += 75000;
        run.injected.push({ fault, detail: `Inflated "${line.item}" by ₹75,000 without recomputing totals.` });
      } else if (fault === 'cap-breach') {
        const line = run.budget.lines.find((l) => l.category === 'equipment') || run.budget.lines[0];
        line.amount = Math.round(run.budget.totals.total * 0.55);
        line.basis += ' (injected over-cap purchase)';
        run.injected.push({ fault, detail: 'Set an equipment line to 55% of the request.' });
      } else if (fault === 'ungrounded-claim') {
        const claim = { id: 'C-INJECTED-1', sectionKey: 'outcomes', text: 'Preliminary results show a 40% improvement in outcomes across all sites.', evidence: [], grounded: false, generatedBy: 'injected' };
        run.draft.claims.push(claim);
        const section = run.draft.sections.find((s) => s.key === 'outcomes') || run.draft.sections[0];
        section.paragraphs.push({ text: claim.text, claimIds: [claim.id] });
        section.wordCount += claim.text.split(/\s+/).length;
        run.injected.push({ fault, detail: 'Injected an ungrounded claim asserting preliminary results.' });
      } else if (fault === 'expired-call') {
        const expired = CALLS.find((c) => c.id === 'call-serb-supra-expired');
        if (expired) { run.discovery.selectedCall = expired; run.discovery.callId = expired.id; run.injected.push({ fault, detail: 'Pointed the run at an expired call.' }); }
      } else if (fault === 'missing-ethics') {
        const doc = run.documents.find((d) => d.key === 'ethics');
        if (doc) { doc.status = 'missing'; run.injected.push({ fault, detail: 'Removed the ethics clearance from the document register.' }); }
      }
    } catch (err) {
      run.injected.push({ fault, detail: `Injection skipped: ${err.message}` });
    }
  }
  if (run.injected.length) {
    ctx.log({ agent: 'coordinator', phase: 'fault-injection', intent: 'Inject failures to exercise diagnosis and targeted repair', action: 'fault.inject', inputs: { faults }, outputs: { injected: run.injected }, result: 'injected', level: 'warn' });
    run.stage = 'validation';
  }
}

async function validateAndRepair(run, ctx) {
  const tools = ctx.tools;
  let { report } = validate(run, tools);
  run.validation.report = report;
  run.validation.maxAttempts = config.retryBudget;

  while (!report.passed && canRetry(run)) {
    run.validation.attempts += 1;
    run.metrics.repairAttempts = run.validation.attempts;
    const failures = report.failures;
    const repairNode = startNode(run, `repair-${run.validation.attempts}`);
    repairNode.kind = 'repair';
    repairNode.label = `Repair attempt ${run.validation.attempts}`;

    const pipeline = failures.some((f) => f.scope === 'pipeline');
    if (pipeline) {
      const next = await agents.discovery.reselect(ctx);
      if (next) {
        const litCtx = createContext(run, run.actor);
        const draftCtx = createContext(run, run.actor);
        const budgetCtx = createContext(run, run.actor);
        const complianceCtx = createContext(run, run.actor);
        await agents.literature.run(litCtx);
        await agents.drafting.run(draftCtx);
        await agents.budget.run(budgetCtx);
        await agents.compliance.run(complianceCtx, Promise.resolve(run.budget));
        run.validation.diagnostics.push({ id: util.uid('diag'), at: util.nowIso(), attempt: run.validation.attempts, failure: 'call_inactive', owner: 'funding', repair: 'reselect-call', result: `Re-selected ${next.id} and rebuilt literature, draft, budget and compliance.` });
      }
    } else {
      for (const failure of failures) {
        const note = await applyRepair(ctx, failure);
        if (!note) continue;
        run.validation.diagnostics.push({ id: util.uid('diag'), at: util.nowIso(), attempt: run.validation.attempts, failure: failure.code, owner: failure.owner, repair: failure.repair, target: failure.keys || failure.claimIds || failure.categories || failure.sectionKey || failure.artifact, result: note });
        ctx.log({ agent: failure.owner, phase: 'repair', intent: `Repair ${failure.code}`, action: failure.repair, inputs: acceptanceTarget(failure), outputs: { result: note }, result: 'repaired', level: 'warn' });
      }
      if (run.compliance) agents.compliance.reevaluate(run, { ctx });
    }

    if (run.budget) agents.budget.reconcile(run);
    ({ report } = validate(run, tools));
    run.validation.report = report;
    endNode(run, repairNode, report.passed ? 'done' : 'retried', `${failures.length} failure(s) diagnosed`);
  }

  if (report.passed && run.validation.attempts > 0) {
    run.validation.recovered = true;
    run.validation.recoveredAt = util.nowIso();
  }
  run.updatedAt = util.nowIso();
  db.persist();
  return report;
}

function acceptanceTarget(failure) {
  return failure.keys || failure.claimIds || failure.categories || failure.sectionKey || failure.artifact;
}

/* -------------------------------- outputs -------------------------------- */

function summarizeRun(run) {
  return {
    id: run.id, title: run.draft?.title || run.params.researchArea, status: run.status, stage: run.stage,
    createdAt: run.createdAt, updatedAt: run.updatedAt,
    pi: run.params.piName, domain: run.domain, actor: run.actor,
    call: run.discovery?.selectedCall ? { id: run.discovery.selectedCall.id, agency: run.discovery.selectedCall.agency, program: run.discovery.selectedCall.program, deadline: run.discovery.selectedCall.deadline } : null,
    matchScore: run.discovery?.matchScore || null,
    budget: run.budget?.formatted?.total || null,
    coverage: run.evidence?.coverage ?? null,
    compliance: run.compliance?.summary || null,
    acceptance: run.acceptance ? { allPass: run.acceptance.allPass, passed: run.acceptance.tests.filter((t) => t.passed).length, total: run.acceptance.tests.length } : null,
    approvals: {
      decision: run.approvals.decision,
      by: run.approvals.decidedBy,
      byId: run.approvals.decidedById || null,
      byEmail: run.approvals.decidedByEmail || null,
      byDept: run.approvals.decidedByDept || null,
    },
    publishedVersion: run.publishedVersion,
    error: run.error,
  };
}

function serializeRun(run) {
  return { ...run, graph: GRAPH, summary: summarizeRun(run) };
}

async function startRun(input) {
  const run = createRun(input);
  run.faults = input.faults || [];
  run.updatedAt = util.nowIso();
  // Resolve the institutional person and attach the Mongo link before the run starts.
  try {
    await require('./persistence').linkActorToRun(run);
  } catch (err) {
    console.warn('[persistence] actor link skipped:', err.message);
  }
  db.addRun(run);
  db.audit({ runId: run.id, actor: run.actor.name, actorId: run.actor.id, actorEmail: run.actor.email, actorRole: run.actor.role, agent: 'coordinator', phase: 'intake', intent: 'Create a grant run', action: 'run.create', inputs: { request: run.request, params: run.params, faults: run.faults }, outputs: { id: run.id, actorRef: run.actorRef || null }, result: 'created' });
  setImmediate(() => { execute(run).catch((err) => console.error('[execute]', err)); });
  return run;
}

async function resumeRun(run) {
  if (['published', 'rejected'].includes(run.status)) return run;
  if (run.status === 'awaiting_review') return run;
  const wasRevision = run.status === 'changes_requested';
  run.status = 'running';
  run.error = null;
  const ctx = createContext(run, run.actor);
  try {
    if (!run.draft) return execute(run);
    if (!run.budget || !run.compliance) {
      const budgetCtx = createContext(run, run.actor);
      const complianceCtx = createContext(run, run.actor);
      const p = agents.budget.run(budgetCtx).then(() => run.budget);
      await agents.compliance.run(complianceCtx, p);
    }
    if (wasRevision) {
      const validationNode = startNode(run, 'validation');
      await validateAndRepair(run, ctx);
      endNode(run, validationNode, run.validation.report.passed ? 'done' : 'failed', 'faculty revision');
      if (!run.validation.report.passed) { run.status = 'needs_human'; db.persist(); return run; }
      // A faculty revision must produce a new package, not reuse the old files.
      const pkgCtx = createContext(run, run.actor);
      await agents.submission.run(pkgCtx);
    }
    if (!run.package) {
      const pkgCtx = createContext(run, run.actor);
      await agents.submission.run(pkgCtx);
    }
    run.acceptance = runAcceptance(run);
    if (!run.acceptance.allPass) {
      run.status = 'needs_human';
      run.error = { code: 'acceptance_failed', message: 'Acceptance suite failed on resume.', failing: run.acceptance.blocking };
      db.persist();
      return run;
    }
    run.status = 'awaiting_review';
    run.stage = 'review';
    run.trace.push({ id: `review-${run.validation.attempts}`, label: 'Research Office review', agent: 'review', status: 'waiting', startedAt: util.nowIso(), endedAt: null, kind: 'gate' });
    db.persist();
  } catch (err) {
    run.status = 'needs_human';
    run.error = { code: 'resume_failed', message: err.message };
    db.persist();
  }
  return run;
}

module.exports = {
  GRAPH, createRun, startRun, execute, resumeRun, clarify, deriveDomains, deriveKeywords,
  evidence: { buildEvidence, checkCitations }, validate, applyRepair, runAcceptance,
  governance: { actorById, canApprove, canRollback, approveRun, rollbackRun },
  metrics: { computeMetrics }, summarizeRun, serializeRun, injectFaults,
};
