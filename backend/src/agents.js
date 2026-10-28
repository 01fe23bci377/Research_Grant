'use strict';

/**
 * The six AI agents of the grant pipeline (Groups A–F), plus the repair helpers
 * the runtime and the self-healing loop call.
 */
const {
  config, db, util, specialists, swarm, skills, connector,
} = require('./core');

const { money, compactMoney, round, clamp, unique } = util;
const { mapUnits, mergeByPlan } = swarm;
const { getSpecialist, sectionMeta } = specialists;
const { citationIndex } = skills;

/* ============================ shared helpers ============================= */

const firstSentence = (text) => {
  const s = String(text || '').split(/(?<=\.)\s+/)[0];
  return s ? s.trim() : '';
};
const lowerFirst = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const trim = (s, n = 220) => { const t = String(s || ''); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const textOf = (draft) => (draft?.sections || []).map((s) => s.paragraphs.map((p) => p.text).join(' ')).join(' ');

/* ============================ Group A — funding ========================== */

const WEIGHTS = { topic: 0.4, domain: 0.15, eligibility: 0.15, budget: 0.12, deadline: 0.1, funderFit: 0.08 };

function topicScore(keywords, call) {
  if (!keywords.length) return { score: 0, matched: [] };
  const hay = [...call.tags.map((t) => t.toLowerCase()), call.title.toLowerCase(), call.program.toLowerCase(), ...call.domains];
  const matched = [];
  for (const kw of keywords) {
    const k = kw.toLowerCase();
    if (hay.some((h) => h.includes(k) || k.includes(h))) matched.push(kw);
  }
  return { score: matched.length / keywords.length, matched };
}

function domainScore(domains, call) {
  if (!domains.length) return { score: 0, matched: [] };
  const set = new Set(call.domains.map((d) => d.toLowerCase()));
  const matched = domains.filter((d) => set.has(d.toLowerCase()));
  return { score: matched.length / domains.length, matched };
}

function budgetScore(requested, call) {
  if (!requested) return { score: 0.6, note: 'No budget stated' };
  if (requested >= call.budgetMin && requested <= call.budgetMax) return { score: 1, note: `Within the ${compactMoney(call.budgetMin)}–${compactMoney(call.budgetMax)} window` };
  if (requested > call.budgetMax) return { score: Math.max(0.2, 0.7 - (requested - call.budgetMax) / call.budgetMax), note: 'Above the agency ceiling; de-scoping required' };
  return { score: Math.max(0.1, 0.55 - (call.budgetMin - requested) / call.budgetMin), note: 'Below the agency minimum award' };
}

function deadlineScore(call) {
  const left = util.daysBetween(util.today(), call.deadline);
  if (left < 0) return { score: 0, left, note: 'Expired' };
  if (left < config.reviewBufferDays) return { score: 0.35, left, note: 'Inside the review buffer' };
  if (left <= 45) return { score: 0.75, left, note: `${left} days left` };
  return { score: 1, left, note: `${left} days left` };
}

const discovery = {
  async run(ctx) {
    ctx.agent = 'funding';
    const run = ctx.run;
    const params = run.params;
    await ctx.step({ agent: 'funding', phase: 'discovery', intent: 'Read the funding catalogue through the governed connector', action: 'connector.invoke(funding.calls)', inputs: { fundingType: params.fundingType }, outputs: { endpoint: 'funding.calls' } });

    const calls = ctx.tools.fundingCalls({});
    const keywords = unique([...(params.keywords || []), ...(run.clarified?.keywords || [])]);
    const domains = run.clarified?.domains || [];
    const excluded = [];
    const scored = [];

    for (const call of calls) {
      if (!call.verified) { excluded.push({ id: call.id, title: call.title, agency: call.agency, reason: 'Unverified source — not an approved agency listing', guardrail: 'verified' }); continue; }
      if (call.status !== 'open') { excluded.push({ id: call.id, title: call.title, agency: call.agency, reason: `Call status is "${call.status}"`, guardrail: 'active' }); continue; }
      const left = util.daysBetween(util.today(), call.deadline);
      if (left < 0) { excluded.push({ id: call.id, title: call.title, agency: call.agency, reason: `Deadline passed on ${call.deadline}`, guardrail: 'active' }); continue; }

      const topic = topicScore(keywords, call);
      const domain = domainScore(domains, call);
      const budget = budgetScore(params.requestedBudget, call);
      const deadline = deadlineScore(call);
      const elig = ctx.tools.compute.eligibility(call, { careerStage: params.careerStage, institutionType: params.institutionType, partners: params.consortiumPartners || [], industryPartner: params.industryPartner });
      const fail = elig.filter((e) => e.status === 'fail').length;
      const eligibility = { score: fail ? 0 : elig.filter((e) => e.status === 'pass').length / elig.length, checks: elig };
      const funderFit = { score: params.fundingType === call.fundingType ? 1 : 0.35 };
      const score = topic.score * WEIGHTS.topic + domain.score * WEIGHTS.domain + eligibility.score * WEIGHTS.eligibility + budget.score * WEIGHTS.budget + deadline.score * WEIGHTS.deadline + funderFit.score * WEIGHTS.funderFit;

      scored.push({
        id: call.id, title: call.title, agency: call.agency, program: call.program, fundingType: call.fundingType,
        deadline: call.deadline, daysLeft: deadline.left, budgetMin: call.budgetMin, budgetMax: call.budgetMax,
        currency: call.currency, sourceUrl: call.sourceUrl, verified: call.verified, status: call.status,
        score: round(score * 100, 1), eligible: fail === 0 && deadline.left >= config.reviewBufferDays,
        factors: {
          topic: { weight: WEIGHTS.topic, value: round(topic.score, 3), matched: topic.matched },
          domain: { weight: WEIGHTS.domain, value: round(domain.score, 3), matched: domain.matched },
          eligibility: { weight: WEIGHTS.eligibility, value: round(eligibility.score, 3), checks: elig },
          budget: { weight: WEIGHTS.budget, value: round(budget.score, 3), note: budget.note },
          deadline: { weight: WEIGHTS.deadline, value: round(deadline.score, 3), note: deadline.note, daysLeft: deadline.left },
          funderFit: { weight: WEIGHTS.funderFit, value: round(funderFit.score, 3) },
        },
        warnings: buildWarnings(call, deadline, budget, elig, params.requestedBudget),
      });
    }

    scored.sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score);
    const ranked = scored.slice(0, 6);
    const selected = ranked.find((c) => c.eligible);
    if (!selected) {
      const err = new Error('No active, verified, eligible funding call matches this request.');
      err.code = 'no_eligible_call'; err.excluded = excluded;
      throw err;
    }
    const selectedCall = calls.find((c) => c.id === selected.id);

    await ctx.step({ agent: 'funding', phase: 'discovery', intent: `Rank ${scored.length} verified active calls and select the best match`, action: 'score.topic+domain+eligibility+budget+deadline', inputs: { keywords, domains, requestedBudget: params.requestedBudget }, outputs: { selected: selected.id, score: selected.score, considered: scored.length, excluded: excluded.length } });
    await ctx.step({ agent: 'funding', phase: 'discovery', intent: 'Apply discovery guardrails before returning the list', action: 'guardrail.verified+active+deadline', inputs: { totalRecords: calls.length }, outputs: { surfaced: ranked.length, excluded, rule: 'Unverified listings and expired calls are withheld from the active list.' }, result: excluded.length ? 'guarded' : 'ok' });

    run.discovery = { callId: selected.id, selectedCall, matchScore: selected.score, ranked, excluded, eligibility: selected.factors.eligibility.checks, reasoning: buildReasoning(selected, keywords, params), consideredCount: scored.length };
    ctx.checkpoint('discovery', { call: selected.id });
    return run.discovery;
  },

  async reselect(ctx) {
    ctx.agent = 'funding';
    const run = ctx.run;
    const active = ctx.tools.fundingCalls({}).filter((c) => c.verified && c.status === 'open' && util.daysBetween(util.today(), c.deadline) >= config.reviewBufferDays);
    const next = active.find((c) => c.id !== run.discovery?.callId) || active[0];
    if (!next) return null;
    run.discovery.selectedCall = next;
    run.discovery.callId = next.id;
    run.discovery.matchScore = run.discovery.ranked?.find((r) => r.id === next.id)?.score || run.discovery.matchScore;
    ctx.log({ agent: 'funding', phase: 'repair', intent: 'Re-select an active call after the previous call expired', action: 'discovery.reselect', inputs: { previous: run.discovery.callId }, outputs: { selected: next.id, deadline: next.deadline }, result: 'repaired' });
    return next;
  },
};

function buildWarnings(call, deadline, budget, checks, requested) {
  const out = [];
  if (deadline.left < config.reviewBufferDays) out.push(`Only ${deadline.left} days remain — inside the ${config.reviewBufferDays}-day review buffer.`);
  if (budget.score < 0.7) out.push(budget.note);
  for (const c of checks) if (c.status !== 'pass') out.push(`${c.label}: ${c.detail}`);
  if (requested > call.budgetMax) out.push(`Requested ${compactMoney(requested)} exceeds the ceiling; the budget will be de-scoped to ${compactMoney(call.budgetMax)}.`);
  return out;
}

function buildReasoning(selected, keywords, params) {
  const f = selected.factors;
  return [
    `Matched ${f.topic.matched.length}/${keywords.length} research keywords to the published scope (${f.topic.matched.join(', ') || 'none'}).`,
    `Domain alignment ${Math.round(f.domain.value * 100)}% across ${f.domain.matched.join(', ') || 'no overlapping tags'}.`,
    `Eligibility: ${f.eligibility.checks.map((c) => `${c.label}=${c.status}`).join('; ')}.`,
    `Deadline ${selected.deadline} (${f.deadline.note}).`,
    `Funder fit: ${params.fundingType} request against a ${selected.fundingType} call.`,
  ];
}

/* ========================= Group B — literature ========================== */

const literature = {
  async run(ctx, callPromise = null) {
    ctx.agent = 'literature';
    const run = ctx.run;
    const params = run.params;
    const startedCall = run.discovery?.selectedCall || null;

    await ctx.step({ agent: 'literature', phase: 'literature', intent: 'Build a retrieval query from the clarified request while Group A matches the call', action: 'memory.query', inputs: { researchArea: params.researchArea, callId: startedCall?.id || 'pending' }, outputs: { keywords: (params.keywords || []).length } });

    const query = [params.researchArea, ...(params.keywords || []), ...(startedCall?.tags || [])].join(' ');
    const similar = ctx.memory.similarity(query, 10);
    const tagged = ctx.memory.byTags(unique([...(params.keywords || []), ...(startedCall?.tags || [])]), 10);
    const merged = new Map();
    for (const item of similar) merged.set(item.id, { ...item, retrieval: 'similarity' });
    for (const item of tagged) if (!merged.has(item.id)) merged.set(item.id, { ...item, retrieval: 'tag', similarity: 0.35 });
    const retrieved = [...merged.values()].sort((a, b) => (b.similarity || 0) - (a.similarity || 0)).slice(0, 10);
    if (retrieved.length < 4) {
      const err = new Error('Retrieval returned fewer than four grounded records; refusing to write an ungrounded summary.');
      err.code = 'insufficient_evidence';
      throw err;
    }

    // The task packet from Group A carries the matched call's scope tags.
    const call = run.discovery?.selectedCall || (callPromise ? await callPromise.then(() => run.discovery?.selectedCall) : null);
    if (!call) throw new Error('Literature agent requires a matched call from Group A.');

    const priorProposals = ctx.memory.priorProposals(query, 3);
    const priorOverlap = priorProposals[0]?.similarity || 0;
    const callTags = unique(call.tags.map((t) => t.toLowerCase()));
    const coveredTags = unique(retrieved.flatMap((r) => r.tags.map((t) => t.toLowerCase())));
    const covered = callTags.filter((t) => coveredTags.some((c) => c.includes(t) || t.includes(c)));
    const gaps = callTags.filter((t) => !covered.includes(t)).map((tag) => ({ tag, severity: 'medium', detail: `No retrieved record addresses "${tag}" in this setting.` }));
    const coverageRatio = clamp(covered.length / Math.max(callTags.length, 1), 0, 1);
    const noveltyScore = round(clamp(0.45 + 0.55 * (1 - coverageRatio) * (1 - priorOverlap * 0.6), 0, 1), 2);

    run.literature = {
      query, callId: call.id,
      retrieved: retrieved.map((r) => ({ id: r.id, title: r.title, authors: r.authors, year: r.year, venue: r.venue, tags: r.tags, doi: r.doi, similarity: r.similarity ?? null, retrieval: r.retrieval })),
      citations: retrieved.map((r) => ({ sourceId: r.id, title: r.title, authors: r.authors, year: r.year, venue: r.venue, doi: r.doi, type: 'literature' })),
      summary: buildLiteratureSummary({ retrieved, gaps, priorProposals, noveltyScore, params, call }),
      gaps,
      novelty: { score: noveltyScore, label: noveltyScore > 0.7 ? 'strong' : noveltyScore > 0.5 ? 'moderate' : 'incremental', rationale: priorOverlap > 0.45 ? `Closest prior proposal "${priorProposals[0].title}" overlaps materially; novelty must be argued against it.` : 'No close prior proposal in institutional history; novelty rests on the uncovered topics.', priorOverlap: round(priorOverlap, 3) },
      priorProposals,
      coverage: { totalTags: callTags.length, coveredTags: covered.length, ratio: round(coverageRatio, 2), thinAreas: gaps },
    };

    await ctx.step({ agent: 'literature', phase: 'literature', intent: `Retrieve related work for "${params.researchArea}"`, action: 'memory.similarity + memory.byTags', inputs: { query, topK: 10 }, outputs: { retrieved: retrieved.length, coveredTags: covered.length, totalTags: callTags.length, gaps: gaps.map((g) => g.tag) } });
    await ctx.step({ agent: 'literature', phase: 'literature', intent: 'Flag thin coverage instead of overstating novelty', action: 'novelty.assess', inputs: { priorOverlap: round(priorOverlap, 3) }, outputs: { novelty: noveltyScore, gaps: gaps.length }, result: gaps.length ? 'guarded' : 'ok' });
    ctx.checkpoint('literature', { sources: retrieved.length });
    return run.literature;
  },
};

function buildLiteratureSummary({ retrieved, gaps, priorProposals, noveltyScore, params, call }) {
  const lead = retrieved[0];
  const second = retrieved[1];
  const paragraphs = [
    `The corpus returned ${retrieved.length} records, led by ${lead.title} (${lead.year}, ${lead.venue}), which reports that ${lowerFirst(firstSentence(lead.abstract))}. Closely related, ${second.title} (${second.year}) finds that ${lowerFirst(firstSentence(second.abstract))}.`,
  ];
  paragraphs.push(gaps.length
    ? `Coverage is uneven against the call's scope. No retrieved record addresses ${gaps.map((g) => g.tag).join(', ')}, so these are flagged as thin coverage rather than claimed as novel; the proposal treats them as design questions requiring primary evidence.`
    : 'All topics named in the call are represented in the corpus, so novelty must be argued on method and setting rather than on an absent literature.');
  if (priorProposals.length) {
    const top = priorProposals[0];
    paragraphs.push(`Institutional history: "${top.title}" (${top.agency}, ${top.year}, ${top.outcome.replace('-', ' ')}) is the closest prior submission. Its recorded lesson is: ${top.lessons}`);
  }
  paragraphs.push(`Assessment: novelty is ${noveltyScore > 0.7 ? 'strong' : noveltyScore > 0.5 ? 'moderate' : 'incremental'} (${noveltyScore}) for ${params.researchArea} evaluated in the setting ${call.program} prioritises.`);
  return paragraphs;
}

/* ========================== Group C — drafting =========================== */

function deriveTheme(pack) {
  const { params, call } = pack;
  const text = `${params.researchArea} ${(params.keywords || []).join(' ')} ${call.program}`.toLowerCase();
  const health = /retinopath|health|clinical|patient|screen|diagnos|medical|ophthalm|care/.test(text);
  const education = /education|learning|pedagog|student|classroom|curricul|school/.test(text);
  const energy = /solar|energy|battery|material|climate|water|grid|device/.test(text);
  const federated = /federated/.test(text);
  const ai = /artificial|machine learning|deep learning|\bai\b|model|algorithm/.test(text);
  return {
    health, education, energy,
    setting: params.setting || (health ? 'rural primary care' : education ? 'underserved schools' : energy ? 'field deployment sites' : 'partner sites'),
    population: health ? 'patients attending primary-care screening' : education ? 'students in participating schools' : energy ? 'field sites and their operators' : 'participants at partner sites',
    dataNoun: health ? 'retinal images linked to referral and adjudication outcomes' : education ? 'anonymised learning records and assessment scores' : energy ? 'instrumented field measurements and operating logs' : 'study records and outcome measurements',
    outcomeNoun: health ? 'sensitivity and specificity for referable disease' : education ? 'standardised learning gain' : energy ? 'measured efficiency against baseline' : 'the pre-registered primary outcome',
    goldStandard: health ? 'ophthalmologist adjudication' : education ? 'pre/post standardised assessment' : 'an independent audit',
    methodNoun: federated ? 'federated learning' : ai ? 'machine-learning' : 'mixed-methods',
    sample: params.sampleSize || (health ? 2400 : education ? 1200 : 600),
    sites: params.sites || 4,
    duration: params.durationMonths || call.durationMonths,
  };
}

function buildPack(ctx) {
  const run = ctx.run;
  const call = run.discovery?.selectedCall;
  if (!call) throw new Error('Drafting agent requires a matched call.');
  const wanted = new Set((run.literature?.retrieved || []).map((r) => r.id));
  const corpus = ctx.tools.literature({});
  let lit = corpus.filter((l) => wanted.has(l.id));
  if (lit.length < 4) lit = corpus.slice(0, 6);
  const policies = ctx.tools.policies({});
  const personnel = ctx.tools.personnel({});
  const institution = ctx.tools.institution();
  const history = ctx.tools.history({});
  const historyPick = history.find((h) => h.id === run.literature?.priorProposals?.[0]?.id) || history[0];
  const params = run.params;
  const guide = (section) => {
    const g = call.guidelines.find((x) => x.section === section) || call.guidelines.find((x) => x.section === 'budget') || call.guidelines[0];
    return g ? { sourceId: g.id, sourceType: 'guideline', title: `${call.agency} guideline — ${g.section}`, locator: `${call.program}, ${g.section}`, quote: trim(g.text), inScope: true } : null;
  };
  return {
    run, call, params, lit, policies, personnel, institution, history: historyPick, allHistory: history,
    theme: deriveTheme({ params, call }),
    policy: (id) => policies.find((p) => p.id === id),
    guide,
  };
}

const evLit = (item) => (item ? { sourceId: item.id, sourceType: 'literature', title: `${item.title} (${item.authors?.[0] || 'Anon.'} et al., ${item.year})`, locator: `${item.venue}; DOI ${item.doi}`, quote: trim(firstSentence(item.abstract)), inScope: true } : null);
const evPolicy = (p) => (p ? { sourceId: p.id, sourceType: 'policy', title: p.title, locator: 'Institutional policy register', quote: trim(firstSentence(p.text)), inScope: true } : null);
const evHistory = (h) => (h ? { sourceId: h.id, sourceType: 'history', title: `Prior proposal — ${h.title}`, locator: `${h.agency}, ${h.year}`, quote: trim(h.lessons), inScope: true } : null);
const evRecord = (kind, title, locator, quote) => ({ sourceId: `rec-${kind}`, sourceType: 'record', title, locator, quote: trim(quote), inScope: true });
const compact = (arr) => arr.filter(Boolean);

function statementsFor(key, pack) {
  const t = pack.theme;
  const { call, params } = pack;
  const L = (i) => evLit(pack.lit[i % pack.lit.length]);
  const cois = pack.personnel.filter((p) => p.role === 'Co-I');
  const pi = pack.personnel.find((p) => p.role === 'PI') || pack.personnel[0];
  const ra = pack.personnel.find((p) => p.role === 'RA');
  const budgetAsk = Math.min(params.requestedBudget || call.budgetMax, call.budgetMax);

  const objectiveStatements = () => [
    { text: `Objective 1 — Assemble a ${t.sites}-site cohort of ${t.sample} ${t.population} with a shared data dictionary and site-level data-custody agreement, completed by month 9.`, evidence: compact([pack.guide('deliverables') || pack.guide('scope'), L(0)]) },
    { text: `Objective 2 — Develop and calibrate the ${t.methodNoun} pipeline under a documented privacy budget, reporting ${t.outcomeNoun} against ${t.goldStandard} by month 24.`, evidence: compact([L(1), L(3)]) },
    { text: `Objective 3 — Prospectively validate the system in ${t.setting} and publish the evaluation harness and model card by month ${t.duration}.`, evidence: compact([pack.guide('deliverables') || pack.guide('format'), L(2)]) },
    { text: `Success is judged against pre-registered thresholds rather than retrospective fit, because ${call.agency} evaluates ${call.reviewCriteria[1]?.criterion?.toLowerCase() || 'feasibility and methodology'} alongside scientific merit.`, evidence: compact([pack.guide('deliverables') || pack.guide('scope')]) },
  ];

  const methodologyStatements = () => [
    { text: `Design. The project uses a prospective, multi-site design in two phases: development on retrospective cohorts, then prospective evaluation in ${t.setting}, with the analysis plan frozen before unblinding.`, evidence: compact([L(0), pack.guide('deliverables') || pack.guide('scope')]) },
    { text: `Data. The study draws on ${t.dataNoun} from ${t.sites} participating sites. Each site retains custody of its records and exposes only model updates and aggregate metrics, so identifiable data never leaves the institution that collected it.`, evidence: compact([L(2), evPolicy(pack.policy('pol-data'))]) },
    { text: `Development. Models are trained with ${t.methodNoun} under secure aggregation and a documented differential-privacy budget; calibration is reported with reliability diagrams and subgroup breakdowns by site, age band and sex.`, evidence: compact([L(3), L(5)]) },
    { text: `Evaluation. The primary analysis reports ${t.outcomeNoun} with 95% confidence intervals against ${t.goldStandard}; secondary analyses examine site-level heterogeneity before any claim of generalisability is made.`, evidence: compact([L(1), pack.guide('deliverables') || pack.guide('scope')]) },
    { text: `Quality control. Image and record quality is screened before inference, and every excluded case is logged with a reason so that the evaluation denominator is reproducible.`, evidence: compact([L(7)]) },
    { text: `Ethics and oversight. The protocol follows the institutional human-subjects policy and the call's ethics requirement; a named clinical owner reviews every escalated case, and the ethics certificate is converted from conditional to full approval before enrolment begins.`, evidence: compact([evPolicy(pack.policy('pol-ethics')), pack.guide('ethics') || pack.guide('documents')]) },
  ];

  const timelineStatements = () => {
    const m1 = Math.max(3, Math.round(t.duration * 0.25));
    const m2 = Math.round(t.duration * 0.5);
    const m3 = Math.round(t.duration * 0.8);
    return [
      { text: `Work is organised into four work packages across ${t.duration} months. WP1 (months 1–${m1}) establishes agreements, the cohort and the data dictionary.`, evidence: compact([pack.guide('deliverables') || pack.guide('scope')]) },
      { text: `WP2 (months ${Math.max(2, m1 - 3)}–${m2}) develops and calibrates the ${t.methodNoun} pipeline; WP3 (months ${m2}–${m3}) runs prospective validation in ${t.setting}.`, evidence: compact([L(2)]) },
      { text: `WP4 (months ${m3}–${t.duration}) completes the model card, the open evaluation harness and the dissemination package, with a go/no-go review at month ${m2}.`, evidence: compact([pack.guide('deliverables') || pack.guide('format')]) },
      { text: `The principal schedule risk is site attrition; mitigation is a signed data-custody agreement before month 3 and a documented fallback site, so milestone dates remain credible rather than aspirational.`, evidence: compact([L(4)]) },
    ];
  };

  const outcomeStatements = () => [
    { text: `Outputs. The project will deliver a validated model card, an open evaluation harness, a site-level data-governance protocol and at least two peer-reviewed publications, deposited with the institutional repository.`, evidence: compact([L(1), pack.guide('deliverables') || pack.guide('format')]) },
    { text: `Outcomes. The intended outcome is a screening pathway that reports ${t.outcomeNoun} at a standard acceptable to ${call.agency}, with a documented escalation route for every positive case.`, evidence: compact([L(8)]) },
    { text: `Impact. Success at ${t.sites} sites establishes a reusable pattern for ${t.setting}, and the evaluation harness lets other institutions reproduce the result without rebuilding the pipeline.`, evidence: compact([L(5)]) },
    { text: `Dissemination follows open-science practice: code and model cards are released under an OSI licence, publications are deposited with a DOI, and results are shared with participating sites before any press activity.`, evidence: compact([pack.guide('open-science') || pack.guide('deliverables') || pack.guide('scope')]) },
  ];

  const dataStatements = () => [
    { text: `A Data Management Plan is prepared at submission and maintained by a named data steward; it records the lawful basis, de-identification method, storage location, retention period and access model for every dataset.`, evidence: compact([evPolicy(pack.policy('pol-data')), pack.guide('data') || pack.guide('documents')]) },
    { text: `Identifiable data stays inside the collecting institution. Cross-site analysis uses aggregate metrics and model updates, and any transfer of health data is preceded by a documented risk assessment.`, evidence: compact([evPolicy(pack.policy('pol-data')), L(2)]) },
    { text: `Retention is limited to the audit period required by the funder; afterwards records are destroyed or irreversibly anonymised, and the destruction is logged with the Research Office.`, evidence: compact([evPolicy(pack.policy('pol-data'))]) },
    { text: `Ethics clearance is attached at submission as a conditional certificate and converted to full approval before the first participant is enrolled, in line with institutional policy and the call requirement.`, evidence: compact([evPolicy(pack.policy('pol-ethics')), pack.guide('ethics') || pack.guide('documents')]) },
  ];

  switch (key) {
    case 'abstract':
    case 'executive-summary':
      return [
        { text: `This ${key === 'abstract' ? 'proposal' : 'programme'} responds to the ${call.agency} ${call.program} call with a ${t.duration}-month programme on ${lowerFirst(params.researchArea)}.`, evidence: compact([pack.guide('scope') || pack.guide('submission')]) },
        { text: `The starting point is that ${lowerFirst(firstSentence(pack.lit[0].abstract))}`, evidence: compact([L(0)]) },
        { text: `The work spans ${t.sites} sites and ${t.sample} ${t.population}, using ${t.methodNoun} as the core method and ${t.goldStandard} as the reference standard.`, evidence: compact([L(1), pack.guide('deliverables') || pack.guide('scope')]) },
        { text: `Outputs are a validated model card, a site-level data-governance protocol and an open evaluation harness, requested at ${compactMoney(budgetAsk)} over ${t.duration} months.`, evidence: compact([pack.guide('budget')]) },
        { text: `The programme is designed to produce evidence acceptable to ${call.agency} without centralising identifiable data, which is the constraint that has limited comparable deployments.`, evidence: compact([L(2), evPolicy(pack.policy('pol-data'))]) },
      ];
    case 'objectives': return objectiveStatements();
    case 'background':
    case 'need-assessment': {
      const gaps = pack.run.literature?.gaps || [];
      return [
        { text: `The state of the art is defined by ${pack.lit[0].title} (${pack.lit[0].year}, ${pack.lit[0].venue}), which reports that ${lowerFirst(firstSentence(pack.lit[0].abstract))}`, evidence: compact([L(0)]) },
        { text: `A second strand, represented by ${pack.lit[1].title} (${pack.lit[1].year}), finds that ${lowerFirst(firstSentence(pack.lit[1].abstract))} Together these results frame the methodological baseline this proposal builds on.`, evidence: compact([L(1)]) },
        { text: `A third body of work on ${pack.lit[2].tags[0] || 'deployment'} shows that ${lowerFirst(firstSentence(pack.lit[2].abstract))}`, evidence: compact([L(2)]) },
        { text: gaps.length ? `Coverage is thin for ${gaps.map((g) => g.tag).join(', ')}: no retrieved record addresses these topics in the intended setting, so the proposal treats them as design questions rather than settled findings.` : `Every topic named in the call is represented in the retrieved corpus, so the contribution is argued on method and setting rather than on an absent literature.`, evidence: compact([L(4)]) },
        { text: `Institutional history sharpens the argument: "${pack.history.title}" (${pack.history.agency}, ${pack.history.year}) recorded that ${pack.history.lessons}`, evidence: compact([evHistory(pack.history)]) },
      ];
    }
    case 'methodology':
    case 'approach': return methodologyStatements();
    case 'timeline':
    case 'implementation-plan':
    case 'implementation': return timelineStatements();
    case 'team':
      return [
        { text: `The Principal Investigator is ${pi.name}, ${pi.title} in ${pi.department}, whose expertise covers ${pi.expertise.slice(0, 3).join(', ')}.`, evidence: compact([evRecord('personnel', 'Personnel register', `budget.personnel · ${pi.id}`, `${pi.name} — ${pi.title}, ${pi.department}; monthly cost ₹${pi.monthlyCost.toLocaleString('en-IN')}.`)]) },
        { text: `Co-investigators ${cois.map((c) => `${c.name} (${c.department})`).join(' and ')} provide the clinical and public-health expertise the evaluation depends on, while ${ra ? `${ra.name} (${ra.title})` : 'the research associate'} owns deployment and data engineering.`, evidence: compact([evRecord('personnel', 'Personnel register', 'budget.personnel', `${cois.length} co-investigators and one research associate are named in the register.`)]) },
        { text: `Governance sits with a steering committee chaired by the ${pack.institution.signatory} and serviced by the ${pack.institution.researchOffice}; it meets quarterly, reviews milestone evidence and holds the submission sign-off.`, evidence: compact([evPolicy(pack.policy('pol-signoff')), evRecord('institution', 'Institution profile', 'institution.profile', `${pack.institution.name}; authorised signatory: ${pack.institution.signatory}.`)]) },
        { text: `Delivery capacity is evidenced by prior institutional awards in this area, including "${pack.history.title}" (${pack.history.agency}, ${pack.history.year}), whose recorded outcome was ${pack.history.outcome.replace('-', ' ')}.`, evidence: compact([evHistory(pack.history)]) },
      ];
    case 'outcomes':
    case 'sustainability':
    case 'impact':
      return outcomeStatements();
    case 'monitoring-evaluation':
      return [
        { text: `The monitoring framework defines two primary indicators with baseline, target and source. Indicator 1 — coverage of the target population, measured quarterly from partner registers against the baseline collected in quarter one.`, evidence: compact([pack.guide('metrics') || pack.guide('reporting') || pack.guide('deliverables') || pack.guide('scope')]) },
        { text: `Indicator 2 — ${t.outcomeNoun}, measured at endline by an independent assessor using the pre-registered analysis plan, with the baseline reported before the intervention begins.`, evidence: compact([L(1), pack.guide('evaluation') || pack.guide('deliverables') || pack.guide('scope')]) },
        { text: `Indicators are reported quarterly to ${call.agency} and reviewed with partners monthly, so underperformance triggers a corrective action rather than an endline surprise.`, evidence: compact([pack.guide('reporting') || pack.guide('deliverables') || pack.guide('scope')]) },
        { text: `The endline dataset and analysis code are deposited for replication, and the evaluation design is reviewed by the institutional research office before the first data collection.`, evidence: compact([pack.guide('evaluation') || pack.guide('deliverables') || pack.guide('scope'), L(3)]) },
      ];
    case 'data-management':
    case 'ethics-security':
      return dataStatements();
    case 'budget-justification':
      return [
        { text: `The request is structured across manpower, equipment, consumables, travel and overhead, and is reconciled against the agency ceiling before packaging.`, evidence: compact([pack.guide('budget')]) },
        { text: `Overheads are charged at the rate published for this call, and every line item is traceable to the institutional rate card or a named supplier quotation.`, evidence: compact([pack.guide('budget'), evRecord('rates', 'Rate card', 'budget.rates', 'Overhead, contingency and escalation rates are read from the institutional rate card.')]) },
        { text: `The itemized budget is produced by the Budget Planning Agent and reconciled before the package is assembled.`, evidence: compact([pack.guide('budget')]) },
      ];
    case 'references':
      return [
        { text: `This proposal cites ${pack.lit.length} verified records from the approved academic corpus, each resolvable by DOI and reproduced in the evidence table.`, evidence: compact([L(0)]) },
        { text: `No reference is generated that does not resolve to a corpus record; the Literature Review Agent refuses to emit citations outside the approved corpus.`, evidence: compact([L(1)]) },
      ];
    case 'compliance':
      return [
        { text: `The activity falls within Schedule VII of the Companies Act 2013 as a health and education intervention, and the implementing partner holds a valid CSR-1 registration.`, evidence: compact([pack.guide('compliance') || pack.guide('scope'), evPolicy(pack.policy('pol-signoff'))]) },
        { text: `Quarterly utilisation certificates and outcome reports are prepared by the Research Office and countersigned by the ${pack.institution.signatory}.`, evidence: compact([evPolicy(pack.policy('pol-signoff')), pack.guide('reporting') || pack.guide('deliverables')]) },
        { text: `Conflict-of-interest declarations are collected from every investigator and retained for the audit period.`, evidence: compact([evPolicy(pack.policy('pol-coi'))]) },
        { text: `An annual impact assessment is commissioned from an independent agency and submitted with the utilisation certificate, as required for continuing CSR support beyond the first tranche.`, evidence: compact([pack.guide('reporting') || pack.guide('compliance') || pack.guide('deliverables'), evPolicy(pack.policy('pol-signoff'))]) },
      ];
    case 'excellence':
      return [
        { text: `The proposal advances the state of the art in ${t.methodNoun} for ${t.setting}: ${lowerFirst(firstSentence(pack.lit[0].abstract))}`, evidence: compact([L(0)]) },
        { text: `Beyond the state of the art, the project addresses the deployment gap rather than the accuracy gap, because ${lowerFirst(firstSentence(pack.lit[1].abstract))}`, evidence: compact([L(1)]) },
        { text: `Ambition is bounded by a testable claim: that the system reaches acceptable ${t.outcomeNoun} in ${t.setting} without centralising identifiable data, and that the result transfers to a second site type.`, evidence: compact([L(2), pack.guide('scope')]) },
        { text: `The work is methodologically novel in combining site-level privacy accounting with prospective clinical evaluation, a combination the retrieved corpus reports only in pilot form.`, evidence: compact([L(3)]) },
      ];
    case 'consortium': {
      const partners = (params.consortiumPartners || []).length ? params.consortiumPartners : [
        { name: 'Meridian Institute of Science and Technology', country: 'India', role: 'Coordinator — model development and evaluation' },
        { name: 'Rheinland University of Applied Sciences', country: 'Germany', role: 'Privacy engineering and secure aggregation' },
        { name: 'Nordic Institute for Health Systems', country: 'Sweden', role: 'Health-systems evaluation and policy translation' },
      ];
      return [
        { text: `The consortium comprises ${partners.length} independent partners: ${partners.map((p) => `${p.name} (${p.country}) — ${p.role}`).join('; ')}.`, evidence: compact([evRecord('institution', 'Institution profile', 'institution.profile', `${partners.length} partner entities declared for the consortium.`)]) },
        { text: `Complementarity is explicit: no single partner holds both the clinical cohort and the privacy-engineering capability, which is why the work is only feasible as a consortium.`, evidence: compact([pack.guide('eligibility') || pack.guide('scope')]) },
        { text: `Governance uses a project management board with one vote per partner, a scientific advisory board without executive authority, and the coordinator holding budget responsibility for the ${t.duration}-month duration.`, evidence: compact([evPolicy(pack.policy('pol-signoff'))]) },
      ];
    }
    default:
      return objectiveStatements();
  }
}

function composeSection(key, pack) {
  const meta = sectionMeta(key);
  const statements = statementsFor(key, pack).filter(Boolean);
  const claims = [];
  const paragraphs = [];
  statements.forEach((s, idx) => {
    const claimId = `C-${key.slice(0, 8).toUpperCase()}-${idx + 1}`;
    claims.push({ id: claimId, sectionKey: key, text: s.text, evidence: s.evidence || [], grounded: Boolean(s.evidence?.length), generatedBy: 'drafting' });
    if (idx % 2 === 0) paragraphs.push({ text: s.text, claimIds: [claimId] });
    else { paragraphs[paragraphs.length - 1].text += ` ${s.text}`; paragraphs[paragraphs.length - 1].claimIds.push(claimId); }
  });
  const wordCount = statements.reduce((a, s) => a + s.text.split(/\s+/).filter(Boolean).length, 0);
  return { key, title: meta.title, minWords: meta.minWords, paragraphs, claims, wordCount, updatedBy: 'drafting' };
}

function disclosure() {
  return { text: 'AI-generated draft. Assembled by the Proposal Drafting Agent from the matched call guidelines, the approved literature corpus and institutional records. A named faculty member must review, edit and accept every section before submission. No preliminary findings are presented as established results.', policyId: 'pol-ai', acknowledgedBy: null, acknowledgedAt: null };
}

function recomputeDraft(run) {
  run.draft.wordCount = run.draft.sections.reduce((a, s) => a + s.wordCount, 0);
  run.draft.citations = citationIndex(run.draft);
  run.draft.updatedAt = util.nowIso();
}

const drafting = {
  async run(ctx) {
    ctx.agent = 'drafting';
    const run = ctx.run;
    const specialist = getSpecialist(run.domain);
    const pack = buildPack(ctx);

    await ctx.step({ agent: 'drafting', phase: 'drafting', intent: 'Scope drafting to the faculty request, matched call and retrieved literature', action: 'context.assemble', inputs: { call: pack.call.id, sources: pack.lit.length, specialist: specialist.id, sections: specialist.sections.length }, outputs: { scope: pack.params.researchArea, guardrail: 'draft only within faculty-provided scope' } });

    const sections = (run.plan?.units?.length ? run.plan.units.map((u) => u.key) : specialist.sections);
    const units = sections.map((key) => ({ id: key, key }));

    // Group C drafts with Groq (openai/gpt-oss-120b) when configured; every
    // section is contract-checked and falls back to the deterministic composer.
    const llmDrafting = require('./llm-drafting');
    const groq = require('./groq');
    const llmEnabled = llmDrafting.isEnabled();
    run.llm = {
      provider: 'Groq Cloud',
      model: groq.GROQ_MODEL,
      enabled: llmEnabled,
      calls: 0,
      promptTokens: 0,
      completionTokens: 0,
      sectionsFromLLM: 0,
      fallbacks: 0,
      totalLatencyMs: 0,
      avgLatencyMs: 0,
      generatedAt: util.nowIso(),
    };
    const concurrency = llmEnabled ? Number(process.env.AURA_LLM_CONCURRENCY || 1) : 5;
    const llmSections = new Set(llmDrafting.enabledSections());
    const llmUnits = units.filter((u) => llmSections.has(u.key));

    const { results, stats } = await mapUnits(units, async (unit, i) => {
      if (!llmEnabled || !llmSections.has(unit.key)) {
        await util.sleep(40 + (i % 4) * 20);
        return composeSection(unit.key, pack);
      }
      await util.sleep(400 + (i % 2) * 300);
      const meta = sectionMeta(unit.key);
      const out = await llmDrafting.draftSection({ pack, key: unit.key, meta });
      if (out?.section) {
        run.llm.calls += 1;
        run.llm.sectionsFromLLM += 1;
        run.llm.promptTokens += out.usage?.promptTokens || 0;
        run.llm.completionTokens += out.usage?.completionTokens || 0;
        run.llm.totalLatencyMs += out.latencyMs || 0;
        ctx.log({
          agent: 'drafting',
          phase: 'llm',
          intent: `Draft "${meta.title}" with ${out.model || run.llm.model}`,
          action: 'groq.chat.completions',
          inputs: { section: unit.key, evidenceUsed: out.section.sourcesUsed },
          outputs: { tokens: out.usage?.totalTokens || 0, latencyMs: out.latencyMs, model: out.model },
          result: 'ok',
          durationMs: out.latencyMs || null,
        });
        return out.section;
      }
      run.llm.calls += 1;
      run.llm.fallbacks += 1;
      ctx.log({
        agent: 'drafting',
        phase: 'llm',
        intent: `LLM draft for "${meta.title}" rejected — deterministic fallback`,
        action: 'llm.fallback',
        inputs: { section: unit.key },
        outputs: { reason: out?.error || 'unavailable', detail: out?.preview || null },
        result: 'fallback',
        level: 'warn',
      });
      return composeSection(unit.key, pack);
    }, { concurrency });

    const planLike = { units: units.map((u) => ({ ...u, ...sectionMeta(u.key), minWords: sectionMeta(u.key).minWords, required: true })) };
    const merged = mergeByPlan(planLike, results);
    const drafts = merged.merged.map((s) => ({ key: s.key, title: s.title, paragraphs: s.paragraphs, wordCount: s.wordCount, updatedBy: s.updatedBy, minWords: sectionMeta(s.key).minWords }));
    const claims = merged.merged.flatMap((s) => s.claims);

    run.draft = {
      title: `${util.capitalize(pack.params.researchArea)}: a ${pack.theme.duration}-month ${pack.theme.methodNoun} study for ${pack.theme.setting}`,
      sections: drafts, claims, citations: citationIndex({ claims }),
      wordCount: drafts.reduce((a, s) => a + s.wordCount, 0),
      version: 1, disclosure: disclosure(), generatedAt: util.nowIso(),
      generation: { ...stats, coverage: merged.coverage, aligned: merged.aligned, specialist: specialist.id, sectionCount: drafts.length },
    };
    run.swarm = { ...stats, kind: 'draft-sections', units: merged.coverage };

    if (llmEnabled) {
      run.llm.avgLatencyMs = run.llm.calls ? Math.round(run.llm.totalLatencyMs / run.llm.calls) : 0;
      run.draft.generation.llm = { ...run.llm };
      await ctx.step({
        agent: 'drafting',
        phase: 'llm',
        intent: `Groq drafted ${run.llm.sectionsFromLLM}/${llmUnits.length} key sections with ${run.llm.model}`,
        action: 'groq.summary',
        inputs: { model: run.llm.model, concurrency, sections: [...llmSections] },
        outputs: {
          sectionsFromLLM: run.llm.sectionsFromLLM,
          fallbacks: run.llm.fallbacks,
          promptTokens: run.llm.promptTokens,
          completionTokens: run.llm.completionTokens,
          avgLatencyMs: run.llm.avgLatencyMs,
        },
        result: run.llm.fallbacks ? 'partial' : 'ok',
        level: run.llm.fallbacks ? 'warn' : 'info',
        delay: false,
      });
    }

    if (!merged.aligned) {
      await ctx.step({ agent: 'drafting', phase: 'drafting', intent: 'Route plan-alignment gaps to the validation repair loop', action: 'mergeByPlan.gaps', inputs: { gaps: merged.gaps.map((g) => g.key) }, outputs: { gaps: merged.gaps.map((g) => ({ key: g.key, reason: g.reason })) }, result: 'gap', level: 'warn' });
    }

    await ctx.step({ agent: 'drafting', phase: 'drafting', intent: `Draft ${drafts.length} sections in parallel and merge by plan alignment`, action: 'swarm.mapUnits + mergeByPlan', inputs: { units: units.length, concurrency: stats.concurrency }, outputs: { sections: drafts.length, claims: claims.length, words: run.draft.wordCount, wallClockMs: stats.wallClockMs, speedup: stats.speedup, gaps: merged.gaps.map((g) => g.key) } });
    await ctx.step({ agent: 'drafting', phase: 'drafting', intent: 'Mark the narrative as an AI-generated draft requiring faculty edit', action: 'disclosure.attach', inputs: { policy: 'pol-ai' }, outputs: { disclosure: 'attached' } });
    ctx.checkpoint('drafting', { sections: drafts.length, words: run.draft.wordCount });
    return run.draft;
  },

  async regenerateSection(ctx, key) {
    const run = ctx.run;
    const pack = buildPack(ctx);
    const fresh = composeSection(key, pack);
    run.draft.claims = run.draft.claims.filter((c) => c.sectionKey !== key).concat(fresh.claims);
    const idx = run.draft.sections.findIndex((s) => s.key === key);
    if (idx >= 0) run.draft.sections[idx] = fresh;
    else run.draft.sections.push(fresh);
    run.draft.version += 1;
    recomputeDraft(run);
    return fresh;
  },

  async expandSection(ctx, key) {
    const run = ctx.run;
    const fresh = await drafting.regenerateSection(ctx, key);
    const unit = run.plan.units.find((u) => u.key === key);
    if (!unit) return fresh;
    const pack = buildPack(ctx);
    let guard = 0;
    while (guard < 3) {
      const target = run.draft.sections.find((s) => s.key === key);
      if (!target || target.wordCount >= unit.minWords) break;
      const extra = pack.lit[(target.wordCount + guard) % pack.lit.length];
      const text = `A further consideration is that ${extra.title} (${extra.year}) reports ${lowerFirst(firstSentence(extra.abstract))}`;
      const claimId = `C-${key.slice(0, 8).toUpperCase()}-X${guard + 1}`;
      run.draft.claims.push({ id: claimId, sectionKey: key, text, evidence: [{ sourceId: extra.id, sourceType: 'literature', title: `${extra.title} (${extra.authors[0]} et al., ${extra.year})`, locator: `${extra.venue}; DOI ${extra.doi}`, quote: firstSentence(extra.abstract), inScope: true }], grounded: true, generatedBy: 'drafting' });
      if (target.paragraphs.length) { target.paragraphs[target.paragraphs.length - 1].text += ` ${text}`; target.paragraphs[target.paragraphs.length - 1].claimIds.push(claimId); }
      else target.paragraphs.push({ text, claimIds: [claimId] });
      target.wordCount += text.split(/\s+/).length;
      guard += 1;
    }
    recomputeDraft(run);
    return fresh;
  },

  removeUngroundedClaims(run, claimIds) {
    const ids = new Set(claimIds);
    for (const id of ids) {
      const claim = run.draft.claims.find((c) => c.id === id);
      if (!claim) continue;
      for (const section of run.draft.sections) {
        for (const p of section.paragraphs) {
          if (!p.claimIds.includes(id)) continue;
          p.text = p.text.split(claim.text).join('').replace(/\s{2,}/g, ' ').trim();
          p.claimIds = p.claimIds.filter((c) => c !== id);
        }
        section.paragraphs = section.paragraphs.filter((p) => p.text.trim().length > 0);
        section.wordCount = section.paragraphs.reduce((a, p) => a + p.text.split(/\s+/).filter(Boolean).length, 0);
      }
      run.draft.claims = run.draft.claims.filter((c) => c.id !== id);
    }
    run.draft.sections = run.draft.sections.filter((s) => s.paragraphs.length > 0 || s.key === 'references');
    run.draft.version += 1;
    recomputeDraft(run);
  },

  attachDisclosure(run) { run.draft.disclosure = disclosure(); run.draft.version += 1; },
  recomputeDraft,
};

/* =========================== Group D — budget ============================ */

const EQUIPMENT_CATALOG = {
  health: [
    { item: 'Non-mydriatic fundus camera (portable)', unitCost: 650000, maxQty: 4, basis: 'Supplier quotation Q-2026-114' },
    { item: 'Edge inference workstation', unitCost: 450000, maxQty: 3, basis: 'Supplier quotation Q-2026-087' },
    { item: 'Secure aggregation server', unitCost: 800000, maxQty: 1, basis: 'Institutional procurement 2026' },
    { item: 'UPS and networking kit', unitCost: 120000, maxQty: 6, basis: 'Institutional procurement 2026' },
  ],
  education: [
    { item: 'Classroom tablet kit (20 devices)', unitCost: 450000, maxQty: 4, basis: 'Supplier quotation EDU-118' },
    { item: 'Learning analytics server', unitCost: 380000, maxQty: 1, basis: 'Institutional procurement 2026' },
    { item: 'Assistive device set', unitCost: 190000, maxQty: 4, basis: 'Accessibility vendor quote' },
  ],
  energy: [
    { item: 'Solar testbed instrumentation', unitCost: 950000, maxQty: 2, basis: 'Supplier quotation EN-44' },
    { item: 'Environmental test chamber', unitCost: 1800000, maxQty: 1, basis: 'Institutional procurement 2026' },
    { item: 'Data acquisition system', unitCost: 320000, maxQty: 3, basis: 'Supplier quotation EN-51' },
  ],
  ai: [
    { item: 'GPU development server', unitCost: 1200000, maxQty: 1, basis: 'Institutional procurement 2026' },
    { item: 'Edge inference device', unitCost: 85000, maxQty: 12, basis: 'Supplier quotation AI-2026-31' },
    { item: 'Secure storage array', unitCost: 450000, maxQty: 1, basis: 'Institutional procurement 2026' },
  ],
};

function pickCatalog(theme) {
  if (theme.health) return EQUIPMENT_CATALOG.health;
  if (theme.education) return EQUIPMENT_CATALOG.education;
  if (theme.energy) return EQUIPMENT_CATALOG.energy;
  return EQUIPMENT_CATALOG.ai;
}

function resolveTeam(total, personnel) {
  const ra = personnel.find((p) => p.role === 'RA');
  const phds = personnel.filter((p) => p.role === 'PhD');
  const bands = [
    { max: 2500000, picks: [{ p: ra, effort: 25 }, { p: phds[0], effort: 50 }] },
    { max: 5000000, picks: [{ p: ra, effort: 50 }, { p: phds[0], effort: 50 }] },
    { max: 9000000, picks: [{ p: ra, effort: 100 }, { p: phds[0], effort: 100 }] },
    { max: Infinity, picks: [{ p: ra, effort: 100 }, { p: phds[0], effort: 100 }, { p: phds[1] || phds[0], effort: 50 }] },
  ];
  const band = bands.find((b) => total <= b.max) || bands[bands.length - 1];
  return band.picks.filter((x) => x.p).map((x) => ({ person: x.p, effortPct: x.effort }));
}

function buildPersonnelLines(team, months, target, flags) {
  const natural = team.map(({ person, effortPct }) => ({ person, effortPct, amount: Math.round((person.monthlyCost * months * effortPct) / 100) }));
  const naturalTotal = natural.reduce((a, l) => a + l.amount, 0);
  const scale = naturalTotal > 0 ? Math.min(1, target / naturalTotal) : 1;
  if (scale < 0.995) flags.push({ level: 'info', category: 'manpower', message: `Manpower apportioned to the agency ceiling: natural requirement ${money(naturalTotal)} reduced to ${money(target)} (${Math.round(scale * 100)}%).`, basis: 'Agency salary ceiling as a share of the total request.' });
  const lines = natural.map(({ person, effortPct, amount }) => ({
    id: `b-personnel-${person.id}`, category: 'personnel', item: `${person.name} — ${person.title}`,
    basis: `${money(person.monthlyCost)}/month × ${months} months × ${round(effortPct * scale, 1)}% effort`,
    quantity: months, unitCost: person.monthlyCost, effortPct: round(effortPct * scale, 1), months,
    amount: Math.round(amount * scale),
  }));
  if (lines.length) {
    const diff = target - lines.reduce((a, l) => a + l.amount, 0);
    if (diff !== 0) { const largest = lines.reduce((a, b) => (a.amount >= b.amount ? a : b)); largest.amount += diff; largest.basis += ` (rounding adjustment ${diff > 0 ? '+' : ''}${diff})`; }
  }
  return lines;
}

function buildEquipmentLines(theme, target) {
  const lines = [];
  let remaining = target;
  for (const entry of pickCatalog(theme)) {
    if (remaining < entry.unitCost) continue;
    const qty = clamp(Math.floor(remaining / entry.unitCost), 0, entry.maxQty);
    if (!qty) continue;
    const amount = qty * entry.unitCost;
    lines.push({ id: `b-equipment-${lines.length + 1}`, category: 'equipment', item: entry.item, basis: `${qty} × ${money(entry.unitCost)}; ${entry.basis}`, quantity: qty, unitCost: entry.unitCost, amount });
    remaining -= amount;
  }
  if (!lines.length) lines.push({ id: 'b-equipment-1', category: 'equipment', item: 'Shared institutional testbed access (allocated charge)', basis: 'Internal charge-out rate; no capital purchase requested', quantity: 1, unitCost: target, amount: target });
  return lines;
}

function buildConsumables(theme, amount, sample, months) {
  if (amount <= 0) return [];
  const base = theme.health ? 120 : theme.education ? 80 : 250;
  const participantEnvelope = Math.max(base, Math.round((amount * 0.55) / 100) * 100);
  const covered = Math.max(1, Math.floor(participantEnvelope / base));
  const perParticipant = covered * base;
  const cloud = Math.round((amount * 0.18) / 1000) * 1000;
  const dissemination = Math.min(180000, Math.round((amount * 0.08) / 1000) * 1000);
  const remainder = amount - perParticipant - cloud - dissemination;
  const lines = [
    { id: 'b-cons-1', category: 'consumables', item: `Per-participant study consumables (${covered} participants)`, basis: `${money(base)} per participant, including screening consumables and participant information; scaled to the consumables envelope`, quantity: covered, unitCost: base, amount: perParticipant },
    { id: 'b-cons-2', category: 'consumables', item: 'Cloud storage, compute and secure backup', basis: `Usage-based estimate for ${months} months`, quantity: months, unitCost: months ? Math.round(cloud / months) : cloud, amount: cloud },
    { id: 'b-cons-3', category: 'consumables', item: 'Dissemination, open-access charges and printing', basis: 'Open-access articles plus site briefs', quantity: 1, unitCost: dissemination, amount: dissemination },
  ].filter((l) => l.amount > 0);
  if (remainder > 0) lines.push({ id: 'b-cons-4', category: 'consumables', item: 'Laboratory and field consumables (balancing line)', basis: 'Absorbs the unallocated remainder of the consumables envelope; itemised at procurement', quantity: 1, unitCost: remainder, amount: remainder });
  if (!lines.length) lines.push({ id: 'b-cons-1', category: 'consumables', item: 'Study consumables', basis: 'Envelope allocation', quantity: 1, unitCost: amount, amount });
  return lines;
}

function buildTravel(theme, amount, sites, partners) {
  const field = Math.round(amount * 0.55); const conf = Math.round(amount * 0.25); const other = amount - field - conf;
  const trips = Math.max(sites * 6, 1);
  return [
    { id: 'b-travel-1', category: 'travel', item: `Field visits across ${sites} sites`, basis: `${sites} sites × 6 visits × ${money(Math.round(field / trips))} per trip`, quantity: trips, unitCost: Math.round(field / trips), amount: field },
    { id: 'b-travel-2', category: 'travel', item: 'Conference and dissemination travel', basis: 'Two national conferences for two team members', quantity: 4, unitCost: Math.round(conf / 4), amount: conf },
    { id: 'b-travel-3', category: 'travel', item: partners > 1 ? 'Consortium and partner meetings' : 'Institutional review meetings', basis: partners > 1 ? `${partners} partner meetings over the project period` : 'Quarterly review meetings', quantity: Math.max(partners, 2), unitCost: Math.round(other / Math.max(partners, 2)), amount: other },
  ];
}

function reconcile(run) {
  const b = run.budget;
  if (!b) return null;
  const totals = require('./core').tools.computeBudget(b.lines, b.rules);
  const lineSum = b.lines.reduce((a, l) => a + l.amount, 0);
  const expected = lineSum + totals.overhead + totals.contingency;
  const delta = expected - totals.total;
  b.totals = { ...totals, lineSum };
  b.reconciliation = { ok: delta === 0, delta, expected, checkedAt: util.nowIso(), formula: 'direct + overhead + contingency' };
  b.formatted = { ...b.formatted, direct: money(totals.direct), overhead: money(totals.overhead), contingency: money(totals.contingency), total: money(totals.total), personnel: money(totals.categories.personnel), equipment: money(totals.categories.equipment), consumables: money(totals.categories.consumables), travel: money(totals.categories.travel) };
  b.caps = require('./core').tools.capReport(b.lines, b.rules);
  return b.reconciliation;
}

function applyNarrative(run) {
  const draft = run.draft; const b = run.budget;
  if (!draft || !b) return;
  const idx = draft.sections.findIndex((s) => s.key === 'budget-justification');
  if (idx === -1) return;
  const claims = []; const paragraphs = [];
  b.justification.forEach((s, i) => {
    const id = `C-BUDGET-${i + 1}`;
    claims.push({ id, sectionKey: 'budget-justification', text: s.text, evidence: s.evidence, grounded: true, generatedBy: 'budget' });
    if (i % 2 === 0) paragraphs.push({ text: s.text, claimIds: [id] });
    else { paragraphs[paragraphs.length - 1].text += ` ${s.text}`; paragraphs[paragraphs.length - 1].claimIds.push(id); }
  });
  draft.sections[idx] = { ...draft.sections[idx], paragraphs, wordCount: b.justification.reduce((a, s) => a + s.text.split(/\s+/).length, 0), updatedBy: 'budget' };
  draft.claims = draft.claims.filter((c) => c.sectionKey !== 'budget-justification').concat(claims);
  drafting.recomputeDraft(run);
}

const budget = {
  async run(ctx) {
    ctx.agent = 'budget';
    const run = ctx.run;
    const call = run.discovery?.selectedCall;
    const params = run.params;
    const specialist = getSpecialist(run.domain);
    const theme = deriveTheme({ params, call });

    await ctx.step({ agent: 'budget', phase: 'budget', intent: 'Read agency rates, personnel costs and the call budget rules', action: 'connector.invoke(budget.personnel, budget.rates)', inputs: { call: call.id }, outputs: { rules: call.budgetRules, durationMonths: params.durationMonths } });

    const personnel = ctx.tools.personnel({});
    const months = params.durationMonths || call.durationMonths;
    const ceiling = call.budgetMax;
    const requested = Number(params.requestedBudget) || Math.round((call.budgetMin + call.budgetMax) / 2);
    const flags = [];
    let totalTarget = requested;
    if (requested > ceiling) { totalTarget = ceiling; flags.push({ level: 'warning', category: 'ceiling', message: `Requested ${money(requested)} exceeds the ${call.agency} ceiling; the budget is de-scoped to ${money(ceiling)} and flagged for PI decision.`, basis: 'Agency award maximum for this call.' }); }
    else if (requested < call.budgetMin) flags.push({ level: 'warning', category: 'floor', message: `Requested ${money(requested)} is below the agency minimum of ${money(call.budgetMin)}.`, basis: 'Agency award minimum for this call.' });

    const rules = call.budgetRules;
    // Faculty-owned budget: when the PI supplies requirement/cost lines, the
    // system only computes overhead, contingency, caps and reconciliation.
    if (Array.isArray(params.budgetLines) && params.budgetLines.length) {
      const faculty = params.budgetLines
        .map((l) => ({ requirement: String(l.requirement || '').trim(), cost: Math.max(0, Math.round(Number(l.cost) || 0)) }))
        .filter((l) => l.requirement && l.cost > 0);
      const lines = faculty.map((l, i) => ({
        id: `b-faculty-${i + 1}`,
        category: 'requirement',
        item: l.requirement,
        basis: 'Faculty-entered requirement — the drafting agents do not set or alter budget figures',
        quantity: 1,
        unitCost: l.cost,
        amount: l.cost,
      }));
      const totals = ctx.tools.compute.budget(lines, rules);
      const caps = ctx.tools.compute.caps(lines, rules);
      const flags = [];
      if (totals.total > ceiling) {
        flags.push({ level: 'warning', category: 'ceiling', message: `Faculty budget total ${money(totals.total)} exceeds the ${call.agency} ceiling of ${money(ceiling)}; not auto-adjusted.`, basis: 'Faculty owns the budget — the Research Office must decide.' });
      }
      const formatted = {
        direct: money(totals.direct), overhead: money(totals.overhead), contingency: money(totals.contingency),
        total: money(totals.total), ceiling: money(ceiling), requested: money(totals.direct),
        personnel: money(0), equipment: money(0), consumables: money(0), travel: money(0),
        requirements: money(totals.direct),
      };
      const guide = call.guidelines.find((g) => g.section === 'budget') || call.guidelines[0];
      run.budget = {
        callId: call.id, currency: call.currency, durationMonths: months, requested: totals.direct,
        ceiling, floor: call.budgetMin, rules, lines, facultyOwned: true,
        totals: { ...totals, lineSum: lines.reduce((a, l) => a + l.amount, 0) },
        caps, flags, formatted,
        reconciliation: { ok: true, delta: 0, checkedAt: util.nowIso(), formula: 'direct + overhead + contingency' },
        justification: [
          {
            text: `The faculty member entered ${faculty.length} budget requirements totalling ${money(totals.direct)}. The system did not generate, round or re-allocate any of these figures.`,
            evidence: [{ sourceId: 'rec-faculty-budget', sourceType: 'record', title: 'Faculty budget entry', locator: 'projects budget form', quote: 'Requirement and cost lines entered directly by the faculty member.', inScope: true }],
          },
          {
            text: `Overhead (${rules.overheadPct}%) and contingency (${rules.contingencyPct}%) are applied by the agency rules, bringing the request to ${money(totals.total)}.`,
            evidence: [{ sourceId: guide.id, sourceType: 'guideline', title: `${call.agency} budget rule`, locator: `${call.program}, ${guide.section}`, quote: guide.text, inScope: true }],
          },
          {
            text: `The itemised requirements are: ${faculty.slice(0, 4).map((l) => `${l.requirement} (${money(l.cost)})`).join('; ')}${faculty.length > 4 ? `; and ${faculty.length - 4} more` : ''}.`,
            evidence: [{ sourceId: 'rec-faculty-budget', sourceType: 'record', title: 'Faculty budget entry', locator: 'projects budget form', quote: 'Each requirement carries the cost entered by the faculty member.', inScope: true }],
          },
        ],
        generatedAt: util.nowIso(), version: 1,
      };
      reconcile(run);
      applyNarrative(run);
      await ctx.step({ agent: 'budget', phase: 'budget', intent: `Reconcile the faculty-entered budget (${faculty.length} requirements)`, action: 'budget.compute + budget.caps', inputs: { requirements: faculty.length }, outputs: { total: totals.total, overhead: totals.overhead, contingency: totals.contingency, facultyOwned: true }, delay: false });
      ctx.checkpoint('budget', { total: totals.total, facultyOwned: true });
      return run.budget;
    }
    const directTarget = Math.round(totalTarget / (1 + rules.overheadPct / 100 + rules.contingencyPct / 100));
    const salaryLimit = Math.round((rules.salaryCapPct / 100) * totalTarget);
    const equipLimit = Math.round((rules.equipmentCapPct / 100) * totalTarget);
    const travelLimit = Math.round((rules.travelCapPct / 100) * totalTarget);
    const team = resolveTeam(totalTarget, personnel);
    const naturalPersonnel = team.reduce((a, t) => a + Math.round((t.person.monthlyCost * months * t.effortPct) / 100), 0);
    const personnelTarget = Math.min(naturalPersonnel, salaryLimit, Math.round(directTarget * 0.6));
    const equipTarget = Math.min(Math.round(directTarget * specialist.budgetScheme.equipment), equipLimit);
    const travelTarget = Math.min(Math.round(directTarget * specialist.budgetScheme.travel), travelLimit);
    const consumablesTarget = Math.max(0, directTarget - personnelTarget - equipTarget - travelTarget);

    const lines = [
      ...buildPersonnelLines(team, months, personnelTarget, flags),
      ...buildEquipmentLines(theme, equipTarget),
      ...buildConsumables(theme, consumablesTarget, theme.sample, months),
      ...buildTravel(theme, travelTarget, theme.sites, (params.consortiumPartners || []).length),
    ];

    // Balance the request to the target total, then respect the ceiling.
    let totals = ctx.tools.compute.budget(lines, rules);
    const multiplier = 1 + rules.overheadPct / 100 + rules.contingencyPct / 100;
    const getBalancing = () => {
      let balancing = lines.find((l) => l.category === 'consumables');
      if (!balancing) {
        balancing = {
          id: 'b-cons-balancing',
          category: 'consumables',
          item: 'Institutional consumables and services (balancing line)',
          basis: 'Balances the request to the agency envelope; itemised at procurement',
          quantity: 1,
          unitCost: 0,
          amount: 0,
        };
        lines.push(balancing);
      }
      return balancing;
    };
    for (let pass = 0; pass < 3; pass += 1) {
      const delta = totalTarget - totals.total;
      if (Math.abs(delta) < 100) break;
      const balancing = getBalancing();
      const next = balancing.amount + Math.round(delta / multiplier);
      if (next < 0) break;
      balancing.amount = next;
      totals = ctx.tools.compute.budget(lines, rules);
    }

    let ceilingGuard = 0;
    while (totals.total > ceiling && ceilingGuard < 5) {
      const balancing = lines.find((l) => l.category === 'consumables' && l.amount > 0);
      if (!balancing) break;
      const excess = totals.total - ceiling;
      balancing.amount = Math.max(0, balancing.amount - Math.ceil(excess / multiplier));
      balancing.basis += ` (trimmed ${money(excess)} to respect the agency ceiling)`;
      totals = ctx.tools.compute.budget(lines, rules);
      ceilingGuard += 1;
    }

    const caps = ctx.tools.compute.caps(lines, rules);
    for (const cap of caps) {
      if (cap.status === 'over') flags.push({ level: 'error', category: 'cap', message: `${cap.label} is ${cap.actualPct}% of the request against a ${cap.capPct}% ceiling (${money(cap.amount)} vs ${money(cap.limit)}).`, basis: 'Agency budget rule for this call.' });
      else if (cap.status === 'at-limit') flags.push({ level: 'info', category: 'cap', message: `${cap.label} sits at the ${cap.capPct}% ceiling (${cap.actualPct}%).`, basis: 'Agency budget rule for this call.' });
    }

    const formatted = { direct: money(totals.direct), overhead: money(totals.overhead), contingency: money(totals.contingency), total: money(totals.total), ceiling: money(ceiling), requested: money(requested), personnel: money(totals.categories.personnel), equipment: money(totals.categories.equipment), consumables: money(totals.categories.consumables), travel: money(totals.categories.travel) };
    const budgetGuide = call.guidelines.find((g) => g.section === 'budget') || call.guidelines[0];

    run.budget = {
      callId: call.id, currency: call.currency, durationMonths: months, requested, ceiling, floor: call.budgetMin, rules, lines,
      totals: { ...totals, lineSum: lines.reduce((a, l) => a + l.amount, 0) },
      caps, flags, formatted,
      reconciliation: { ok: true, delta: 0, checkedAt: util.nowIso(), formula: 'direct + overhead + contingency' },
      justification: [
        { text: `The total request is ${formatted.total} against the ${call.agency} ceiling of ${formatted.ceiling}, comprising ${formatted.direct} direct costs, ${formatted.overhead} overhead at ${rules.overheadPct}% and ${formatted.contingency} contingency at ${rules.contingencyPct}%.`, evidence: [{ sourceId: budgetGuide.id, sourceType: 'guideline', title: `${call.agency} budget rule`, locator: `${call.program}, ${budgetGuide.section}`, quote: budgetGuide.text, inScope: true }] },
        { text: `Manpower is ${formatted.personnel} (${caps.find((c) => c.key === 'salary')?.actualPct ?? 0}% of the request) for ${team.map((t) => `${t.person.name} at ${t.effortPct}% for ${months} months`).join('; ')}; faculty effort is an institutional contribution and is not charged to the grant.`, evidence: [{ sourceId: 'rec-personnel', sourceType: 'record', title: 'Personnel register', locator: 'budget.personnel', quote: `Monthly costs and default effort are read from the institutional personnel register for ${team.length} charged positions.`, inScope: true }] },
        { text: `Equipment is ${formatted.equipment}, consumables ${formatted.consumables} and travel ${formatted.travel}, with ${caps.map((c) => `${c.label} ${c.actualPct}% (ceiling ${c.capPct}%)`).join(', ')} all inside the published ceilings.`, evidence: [{ sourceId: budgetGuide.id, sourceType: 'guideline', title: `${call.agency} budget caps`, locator: `${call.program}, ${budgetGuide.section}`, quote: budgetGuide.text, inScope: true }] },
        { text: `Every figure derives from the institutional rate card or a supplier quotation; ${flags.filter((f) => f.category !== 'cap').length === 0 ? 'no line required discretionary adjustment' : 'each adjustment is recorded with its basis in the budget notes'}.`, evidence: [{ sourceId: 'rec-rates', sourceType: 'record', title: 'Institutional rate card', locator: 'budget.rates', quote: 'Overhead, contingency, escalation and exchange rates are read from the institutional rate card.', inScope: true }] },
      ],
      generatedAt: util.nowIso(), version: 1,
    };

    reconcile(run);
    applyNarrative(run);

    await ctx.step({ agent: 'budget', phase: 'budget', intent: `Build an itemized ${money(totals.total)} budget within the ${call.agency} rules`, action: 'budget.compute + budget.caps', inputs: { requested, ceiling, caps: { salary: rules.salaryCapPct, equipment: rules.equipmentCapPct, travel: rules.travelCapPct } }, outputs: { lines: lines.length, total: totals.total, direct: totals.direct, overhead: totals.overhead, caps: caps.map((c) => `${c.label}:${c.actualPct}%/${c.capPct}%`), flags: flags.length }, result: caps.some((c) => c.status === 'over') ? 'guarded' : 'ok', delay: false });
    ctx.checkpoint('budget', { total: totals.total });
    return run.budget;
  },

  reconcile,
  repairReconciliation: reconcile,

  enforceCaps(run) {
    const b = run.budget;
    if (!b) return null;
    const caps = require('./core').tools.capReport(b.lines, b.rules);
    for (const cap of caps.filter((c) => c.status === 'over')) {
      const catLines = b.lines.filter((l) => l.category === cap.category);
      const current = catLines.reduce((a, l) => a + l.amount, 0);
      if (current <= cap.limit || !catLines.length) continue;
      const factor = cap.limit / current;
      for (const line of catLines) { line.amount = Math.floor(line.amount * factor); line.basis += ` (reduced to ${cap.capPct}% ceiling; basis: agency cap ${money(cap.limit)})`; }
      const after = catLines.reduce((a, l) => a + l.amount, 0);
      const balancing = b.lines.find((l) => l.category === 'consumables');
      if (balancing && current - after > 0) { balancing.amount += current - after; balancing.basis += ` (rebalanced ${money(current - after)} from ${cap.label.toLowerCase()} to respect the ceiling)`; }
    }
    reconcile(run);
    applyNarrative(run);
    return b;
  },

  applyNarrative,

  /** Repair: scale direct costs down until the total fits the agency ceiling. */
  fitCeiling(run) {
    const b = run.budget;
    if (!b) return null;
    const totals = require('./core').tools.computeBudget(b.lines, b.rules);
    if (totals.total <= b.ceiling) { reconcile(run); return b; }
    const factor = b.ceiling / totals.total;
    for (const line of b.lines) {
      line.amount = Math.floor(line.amount * factor);
      line.basis += ` (scaled ${Math.round((1 - factor) * 100)}% to fit the ${money(b.ceiling)} agency ceiling)`;
    }
    const after = require('./core').tools.computeBudget(b.lines, b.rules);
    if (after.total < b.ceiling) {
      const balancing = b.lines.find((l) => l.category === 'consumables');
      if (balancing) {
        const headroom = Math.round((b.ceiling - after.total) / (1 + b.rules.overheadPct / 100 + b.rules.contingencyPct / 100));
        balancing.amount += headroom;
        balancing.basis += ` (restored ${money(headroom)} of headroom under the ceiling)`;
      }
    }
    reconcile(run);
    applyNarrative(run);
    return b;
  },

  resolveTeam,
};

/* ========================= Group E — compliance ========================== */

const docStatus = (run, key) => (run.documents || []).find((d) => d.key === key)?.status || 'missing';

function mkCheck(id, ruleId, severity, category, requirement, status, evidence, remediation, extra = {}) {
  return { id, ruleId, category, requirement, status, severity, evidence, remediation: remediation || null, manual: status === 'manual', ...extra };
}

function evaluateCompliance(ctx, call, run, budget) {
  const checks = [];
  const draft = run.draft;
  for (const key of call.requiredSections) {
    const section = draft.sections.find((s) => s.key === key);
    const present = Boolean(section) && section.wordCount > 0;
    checks.push(mkCheck(`chk-section-${key}`, 'rule-sections', 'blocking', 'Required sections', `Section "${key.replace(/-/g, ' ')}" is present and non-empty.`, present ? 'pass' : 'fail', present ? `Draft contains "${section.title}" (${section.wordCount} words).` : `No section with key "${key}".`, present ? null : 'Re-draft the missing section before packaging.', { sectionKey: key, owner: 'drafting' }));
  }

  const words = draft.wordCount || 0;
  checks.push(mkCheck('chk-page-limit', 'rule-pages', 'blocking', 'Formatting & length', `Narrative fits the ${call.pageLimit}-page limit.`, words <= call.pageLimit * config.wordsPerPage ? 'pass' : 'fail', `${words} words ≈ ${round(words / config.wordsPerPage, 1)} pages at ${config.wordsPerPage} words/page.`, words <= call.pageLimit * config.wordsPerPage ? null : 'Trim the narrative or move detail to annexures.', { owner: 'drafting' }));

  for (const elig of run.discovery?.eligibility || []) {
    checks.push(mkCheck(`chk-elig-${elig.key}`, elig.key === 'career-stage' ? 'rule-eligibility-stage' : elig.key === 'consortium' ? 'rule-consortium' : 'rule-eligibility-institution', 'blocking', 'Eligibility', `${elig.label} satisfies the published eligibility rule.`, elig.status === 'pass' ? 'pass' : elig.status === 'warning' ? 'warning' : 'fail', `${elig.detail} (${call.id}).`, elig.status === 'pass' ? null : 'Confirm eligibility with the Research Office before submission.', { owner: 'discovery' }));
  }

  if (!budget) {
    checks.push(mkCheck('chk-budget-missing', 'rule-budget-ceiling', 'blocking', 'Budget', 'Budget is available for checking.', 'fail', 'No budget object in run state.', 'Wait for the Budget Planning Agent.', { owner: 'budget' }));
  } else {
    const t = budget.totals;
    checks.push(mkCheck('chk-budget-ceiling', 'rule-budget-ceiling', 'blocking', 'Budget', `Total request does not exceed the ${call.agency} ceiling of ${money(call.budgetMax)}.`, t.total <= call.budgetMax ? 'pass' : 'fail', `Budget total ${money(t.total)} vs ceiling ${money(call.budgetMax)} (${call.id}).`, 'De-scope until within the ceiling.', { owner: 'budget' }));
    checks.push(mkCheck('chk-budget-floor', 'rule-budget-floor', 'advisory', 'Budget', `Total request meets the agency minimum of ${money(call.budgetMin)}.`, t.total >= call.budgetMin ? 'pass' : 'warning', `Budget total ${money(t.total)} vs minimum ${money(call.budgetMin)}.`, 'Confirm with the PI whether a smaller request is intended.', { owner: 'budget' }));
    for (const cap of budget.caps) checks.push(mkCheck(`chk-cap-${cap.key}`, `rule-${cap.key}-cap`, 'blocking', 'Budget', `${cap.label} stays within the ${cap.capPct}% ceiling.`, cap.status === 'over' ? 'fail' : 'pass', `${cap.label} ${cap.actualPct}% (${money(cap.amount)}) against ${cap.capPct}% (${money(cap.limit)}).`, cap.status === 'over' ? 'Reduce the category and rebalance without breaching other caps.' : null, { owner: 'budget' }));
    const expectedOverhead = Math.round((t.direct * budget.rules.overheadPct) / 100);
    checks.push(mkCheck('chk-overhead-rate', 'rule-overhead', 'blocking', 'Budget', `Overhead is charged at ${budget.rules.overheadPct}% of direct costs.`, Math.abs(expectedOverhead - t.overhead) <= 1 ? 'pass' : 'fail', `Expected ${money(expectedOverhead)}; recorded ${money(t.overhead)}.`, 'Recompute overhead from the direct-cost base.', { owner: 'budget' }));
    checks.push(mkCheck('chk-reconcile', 'rule-reconcile', 'blocking', 'Budget', 'Line items reconcile with the stated total.', budget.reconciliation?.ok ? 'pass' : 'fail', budget.reconciliation?.ok ? `Lines + overhead + contingency equal ${money(t.total)}.` : `Reconciliation delta ${money(budget.reconciliation?.delta || 0)}.`, 'Recompute totals from the line items.', { owner: 'budget' }));
  }

  const humanSubjects = Boolean(run.params.humanSubjects) || (run.clarified?.domains || []).includes('health');
  for (const doc of call.requiredDocuments) {
    const status = docStatus(run, doc.key);
    const conditional = doc.required === false && doc.condition === 'human-subjects';
    if (conditional && !humanSubjects) {
      checks.push(mkCheck(`chk-doc-${doc.key}`, 'rule-ethics', 'blocking', 'Documentation', `${doc.label} is required only where human participants are involved.`, 'pass', 'Condition not triggered.', null, { owner: 'compliance' }));
      continue;
    }
    const ok = status === 'attached' || (doc.key === 'ethics' && status === 'conditional');
    const isConditional = doc.key === 'ethics' && status === 'conditional';
    checks.push(mkCheck(`chk-doc-${doc.key}`, doc.key === 'ethics' ? 'rule-ethics' : doc.key === 'coi' ? 'rule-coi' : doc.key === 'dmp' ? 'rule-dmp' : doc.key === 'csr-1' ? 'rule-csr' : 'rule-doc', 'blocking', 'Documentation', `${doc.label} is attached at submission.`, ok ? (isConditional ? 'warning' : 'pass') : 'fail', ok ? `Document register status: ${status}.${isConditional ? ' Conditional certificate accepted under pol-ethics; full approval required before enrolment.' : ''}` : `Document register status: ${status}.`, ok ? null : `Attach "${doc.label}" before packaging.`, { owner: 'submission', docKey: doc.key }));
  }

  checks.push(mkCheck('chk-disclosure', 'rule-disclosure', 'blocking', 'Disclosure', 'AI-assisted drafting is disclosed in the submission declaration.', draft.disclosure?.text ? 'pass' : 'fail', draft.disclosure?.text ? `Declaration attached (${draft.disclosure.policyId}); faculty acknowledgement ${draft.disclosure.acknowledgedBy ? 'recorded' : 'pending review'}.` : 'No disclosure on the draft.', 'Attach the AI disclosure declaration.', { owner: 'drafting' }));

  const left = util.daysBetween(util.today(), call.deadline);
  checks.push(mkCheck('chk-deadline', 'rule-deadline', 'blocking', 'Deadline', `Submission can complete with the ${config.reviewBufferDays}-day review buffer before ${call.deadline}.`, left >= config.reviewBufferDays ? 'pass' : left >= 0 ? 'warning' : 'fail', `${left} day(s) to deadline; buffer ${config.reviewBufferDays} days.`, left >= config.reviewBufferDays ? null : 'Escalate to the Research Office for an expedited slot.', { owner: 'compliance' }));

  if ((run.domain) === 'international') {
    checks.push(mkCheck('chk-anonymity', 'rule-anonymity', 'manual', 'Domain requirements', 'Two-stage calls require an anonymised first-stage narrative.', 'manual', 'The call guide is silent on the exact anonymisation scope; a human must confirm which sections are redacted.', 'Research Office to confirm anonymisation instructions.', { owner: 'review' }));
    const text = textOf(draft).toLowerCase();
    checks.push(mkCheck('chk-open-science', 'rule-open-science', 'advisory', 'Domain requirements', 'Open-science outputs are described in the impact section.', /open[- ]science|open access|fair data/.test(text) ? 'pass' : 'warning', 'Keyword scan of impact/excellence sections.', 'Add an explicit open-science statement.', { owner: 'drafting' }));
  }
  if (run.domain === 'industry') {
    const csr = docStatus(run, 'csr-1');
    checks.push(mkCheck('chk-csr-eligibility', 'rule-csr', 'blocking', 'Domain requirements', 'Activity qualifies under Section 135 Schedule VII with CSR-1 attached.', csr === 'attached' ? 'pass' : 'fail', `CSR-1 status: ${csr}.`, csr === 'attached' ? null : 'Attach CSR-1 registration and company CSR policy.', { owner: 'submission', docKey: 'csr-1' }));
  }
  return checks;
}

function summarise(checks) {
  const s = { total: checks.length, pass: 0, fail: 0, warning: 0, manual: 0, blocking: 0 };
  for (const c of checks) {
    if (c.status === 'pass') s.pass += 1;
    else if (c.status === 'fail') { s.fail += 1; if (c.severity === 'blocking') s.blocking += 1; }
    else if (c.status === 'warning') s.warning += 1;
    else if (c.status === 'manual') s.manual += 1;
  }
  s.passRate = checks.length ? round((s.pass / checks.length) * 100, 1) : 0;
  return s;
}

const compliance = {
  async run(ctx, budgetPromise) {
    ctx.agent = 'compliance';
    const run = ctx.run;
    const call = run.discovery?.selectedCall;
    if (!call) throw new Error('Compliance agent requires a matched call.');

    await ctx.step({ agent: 'compliance', phase: 'compliance', intent: `Load the rulebook scoped to "${call.fundingType}" and the call guidelines`, action: 'connector.invoke(compliance.rules, policy.institutional)', inputs: { callId: call.id, fundingType: call.fundingType }, outputs: { guidelines: call.guidelines.length, requiredSections: call.requiredSections.length } });

    const rules = ctx.tools.rules({ appliesTo: call.fundingType });
    const policies = ctx.tools.policies({});
    let budgetState = null;
    try { budgetState = await budgetPromise; } catch { budgetState = run.budget; }

    const checks = evaluateCompliance(ctx, call, run, budgetState || run.budget);
    const summary = summarise(checks);
    const blockings = checks.filter((c) => c.status === 'fail' && c.severity === 'blocking');

    run.compliance = {
      callId: call.id, callTitle: `${call.agency} — ${call.program}`, checkedAgainst: { callId: call.id, guidelines: call.guidelines.map((g) => g.id), policies: policies.filter((p) => ['pol-ethics', 'pol-data', 'pol-coi', 'pol-ai', 'pol-signoff'].includes(p.id)).map((p) => p.id), ruleCount: rules.length },
      checks, summary, blockings: blockings.map((b) => b.id), manualItems: checks.filter((c) => c.status === 'manual').map((c) => c.id), generatedAt: util.nowIso(),
    };

    await ctx.step({ agent: 'compliance', phase: 'compliance', intent: `Check ${checks.length} requirements against ${call.agency} guidelines only`, action: 'checks.evaluate', inputs: { callId: call.id, rules: rules.length }, outputs: { pass: summary.pass, fail: summary.fail, warning: summary.warning, manual: summary.manual, blocking: summary.blocking, failing: blockings.map((b) => b.id) }, result: summary.blocking ? 'fail' : summary.manual ? 'manual' : 'ok', level: summary.blocking ? 'warn' : 'info', delay: false });
    ctx.checkpoint('compliance', { pass: summary.pass, fail: summary.fail });
    return run.compliance;
  },

  reevaluate(run) {
    const call = run.discovery?.selectedCall;
    if (!call) return null;
    const checks = evaluateCompliance(null, call, run, run.budget);
    const summary = summarise(checks);
    run.compliance = { ...run.compliance, checks, summary, blockings: checks.filter((c) => c.status === 'fail' && c.severity === 'blocking').map((c) => c.id), generatedAt: util.nowIso() };
    return run.compliance;
  },

  attachDocument(run, key, note) {
    const doc = (run.documents || []).find((d) => d.key === key);
    if (!doc) return null;
    doc.status = 'attached';
    doc.note = note || 'Attached by the Submission Agent during targeted repair.';
    doc.attachedAt = util.nowIso();
    return doc;
  },

  evaluateCompliance,
  summarise,
};

/* ========================= Group F — submission ========================== */

function buildFiles(run) {
  return [
    { name: 'proposal.md', kind: 'proposal', mime: 'text/markdown', content: skills.renderProposal(run) },
    { name: 'budget.csv', kind: 'budget', mime: 'text/csv', content: skills.renderBudgetCsv(run.budget) },
    { name: 'compliance-checklist.md', kind: 'compliance', mime: 'text/markdown', content: skills.renderComplianceMd(run.compliance) },
    { name: 'cover-letter.md', kind: 'cover-letter', mime: 'text/markdown', content: skills.renderCoverLetter(run) },
    { name: 'evidence-table.csv', kind: 'evidence', mime: 'text/csv', content: skills.renderEvidenceCsv(run) },
    { name: 'manifest.json', kind: 'manifest', mime: 'application/json', content: skills.renderManifest(run) },
  ].map((f) => ({ ...f, bytes: Buffer.byteLength(f.content, 'utf8') }));
}

const checksumOf = (files) => util.sha256(files.map((f) => `${f.name}:${f.content}`).sort().join('\n'));

function buildPackage(run, previous) {
  const files = buildFiles(run);
  const version = previous ? previous.version + 1 : 1;
  return {
    submissionId: `SUB-${run.id}-v${version}`, version, status: 'draft', builtAt: util.nowIso(), checksum: checksumOf(files), files,
    manifest: {
      agent: 'submission', format: 'agency-portal bundle (Markdown + CSV)',
      documents: (run.documents || []).map((d) => ({ key: d.key, label: d.label, status: d.status, required: (run.discovery?.selectedCall?.requiredDocuments || []).some((r) => r.key === d.key) })),
      declaration: run.draft?.disclosure?.text, totals: run.budget?.formatted,
    },
    requiresApproval: true,
    agencySubmission: { submitted: false, submittedAt: null, requiresSignOff: true, portalReference: null },
    guardrails: ['No submission occurs without Dean R&D / HoD / Research Office sign-off.', 'A version-controlled record is kept for every built package.', 'Post-sign-off edits re-trigger review and invalidate the approved checksum.'],
  };
}

const submission = {
  async run(ctx) {
    ctx.agent = 'submission';
    const run = ctx.run;
    const call = run.discovery?.selectedCall;
    await ctx.step({ agent: 'submission', phase: 'packaging', intent: `Assemble the ${call?.agency || 'agency'} submission format from approved artefacts`, action: 'skill.format', inputs: { sections: run.draft?.sections?.length, budgetLines: run.budget?.lines?.length }, outputs: { documents: run.documents?.length } });

    const pkg = buildPackage(run, run.package || null);
    run.package = pkg;
    run.declaration = { text: 'I confirm that the scientific content of this proposal has been reviewed and accepted by the named Principal Investigator, that AI-assisted drafting is disclosed, and that the figures presented reconcile with the submitted budget.', status: 'pending', signatory: run.institution?.signatory };

    await ctx.step({ agent: 'submission', phase: 'packaging', intent: 'Hash the bundle and register an immutable version record', action: 'package.checksum', inputs: { files: pkg.files.map((f) => f.name) }, outputs: { checksum: pkg.checksum, version: pkg.version, bytes: pkg.files.reduce((a, f) => a + f.bytes, 0) } });
    await ctx.step({ agent: 'submission', phase: 'packaging', intent: 'Hold the package at draft status pending sign-off', action: 'guardrail.requiresApproval', inputs: { status: pkg.status }, outputs: { requiresApproval: true, submitted: false, signatory: run.institution?.signatory }, result: 'gated' });
    ctx.checkpoint('packaging', { version: pkg.version });
    return pkg;
  },
  buildPackage,
  checksumOf,
  buildFiles,
};

module.exports = {
  discovery, literature, drafting, budget, compliance, submission,
  helpers: { firstSentence, buildPack, deriveTheme, textOf, evLit, evGuide: null, evPolicy, evHistory, evRecord, compact, recomputeDraft: drafting.recomputeDraft },
  EQUIPMENT_CATALOG,
};
