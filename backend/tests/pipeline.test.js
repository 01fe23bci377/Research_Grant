'use strict';

process.env.AURA_STEP_DELAY = '0';
process.env.AURA_DATA_DIR = require('path').join(__dirname, '..', '.test-data');
process.env.AURA_SEED = '0';
process.env.AURA_LLM = 'off';
process.env.MONGODB_URI = '';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const dataDir = process.env.AURA_DATA_DIR;
fs.rmSync(dataDir, { recursive: true, force: true });

const { db, config, skills, specialists, util } = require('../src/core');
const engine = require('../src/engine');
const { USERS } = require('../src/seed');
const agents = require('../src/agents');

db.load();

const HEALTH_PARAMS = {
  researchArea: 'Federated learning for diabetic retinopathy screening in rural primary care',
  keywords: ['federated learning', 'diabetic retinopathy', 'screening', 'rural health', 'medical imaging'],
  fundingType: 'government',
  requestedBudget: 5800000,
  durationMonths: 36,
  careerStage: 'associate',
  institutionType: 'university',
  humanSubjects: true,
  sites: 4,
  sampleSize: 2400,
};

async function runPipeline(params = HEALTH_PARAMS, faults = []) {
  const run = engine.createRun({ request: `${params.researchArea}.`, params, consent: true, actorId: 'usr-ananya', faults });
  db.addRun(run);
  await engine.execute(run);
  return run;
}

test('Lab 1 — vague requests produce at least two clarifying questions', () => {
  const result = engine.clarify({ request: 'grant for AI', params: {} });
  assert.equal(result.complete, false);
  assert.ok(result.questions.length >= 2, 'expected >= 2 clarifying questions');
  assert.ok(result.missing.includes('researchArea'));
});

test('Lab 1 — complete intake is accepted', () => {
  const result = engine.clarify({ request: HEALTH_PARAMS.researchArea, params: { ...HEALTH_PARAMS, consent: true } });
  assert.equal(result.complete, true);
  assert.ok(result.clarified.domains.includes('ai-ml'));
});

test('Lab 3 — plan skill is reusable across domains and locks', () => {
  const gov = skills.buildPlan({ researchArea: 'x', callId: 'a', callTitle: 'A', domain: 'government', requestedBudget: 5000000, durationMonths: 36, sections: specialists.getSpecialist('government').sections });
  const ind = skills.buildPlan({ researchArea: 'y', callId: 'b', callTitle: 'B', domain: 'industry', requestedBudget: 3000000, durationMonths: 24, sections: specialists.getSpecialist('industry').sections });
  assert.equal(gov.locked, true);
  assert.equal(ind.locked, true);
  assert.notEqual(gov.checksum, ind.checksum);
  assert.ok(gov.units.some((u) => u.key === 'methodology'));
  assert.ok(ind.units.some((u) => u.key === 'monitoring-evaluation'));
});

test('Lab 2 — budget arithmetic reconciles and respects caps', () => {
  const lines = [
    { category: 'personnel', amount: 3000000 },
    { category: 'equipment', amount: 1500000 },
    { category: 'consumables', amount: 600000 },
    { category: 'travel', amount: 400000 },
  ];
  const totals = require('../src/core').tools.computeBudget(lines, { overheadPct: 15, contingencyPct: 5 });
  assert.equal(totals.direct, 5500000);
  assert.equal(totals.overhead, 825000);
  assert.equal(totals.contingency, 275000);
  assert.equal(totals.total, 6600000);
  const caps = require('../src/core').tools.capReport(lines, { salaryCapPct: 50, equipmentCapPct: 30, travelCapPct: 10 });
  assert.ok(caps.find((c) => c.key === 'salary').status === 'ok');
});

test('Lab 5 — connector rejects unauthenticated reads', () => {
  const res = require('../src/core').connector.invoke('funding.calls', {}, { token: 'wrong' });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'unauthorized');
});

test('Full pipeline — produces a validated, packaged run awaiting review', async () => {
  const run = await runPipeline();
  assert.equal(run.status, 'awaiting_review', run.error ? JSON.stringify(run.error) : '');
  assert.ok(run.discovery?.selectedCall);
  assert.equal(run.discovery.selectedCall.fundingType, 'government');
  assert.ok(run.draft.sections.length >= 8);
  assert.equal(run.validation.report.passed, true);
  assert.equal(run.evidence.coverage, 100);
  assert.equal(run.compliance.summary.blocking, 0);
  assert.equal(run.acceptance.allPass, true);
  assert.equal(run.package.requiresApproval, true);
  assert.equal(run.package.agencySubmission.submitted, false);
  assert.equal(run.package.checksum, agents.submission.checksumOf(run.package.files));
  assert.ok(run.plan.locked);
  assert.ok(run.discovery.excluded.some((c) => c.guardrail === 'verified'));
  assert.ok(run.discovery.excluded.some((c) => c.guardrail === 'active'));
  assert.ok(run.logs.some((l) => l.phase === 'connector' || l.phase === 'tool'));
});

test('Lab 10 — injected faults are diagnosed and repaired within the retry budget', async () => {
  const run = await runPipeline(HEALTH_PARAMS, ['missing-section', 'budget-mismatch', 'cap-breach', 'ungrounded-claim', 'missing-ethics']);
  assert.equal(run.status, 'awaiting_review');
  assert.equal(run.validation.report.passed, true);
  assert.ok(run.validation.attempts >= 1);
  assert.ok(run.validation.diagnostics.length >= 3);
  assert.ok(run.validation.diagnostics.some((d) => d.repair === 'regenerate-section'));
  assert.ok(run.validation.diagnostics.some((d) => d.repair === 'reconcile-budget'));
  assert.ok(run.validation.diagnostics.some((d) => d.repair === 'enforce-caps'));
  assert.ok(run.evidence.coverage === 100);
  assert.equal(run.acceptance.allPass, true);
});

test('Lab 12 — only an authorised role can approve; versions and rollback persist', async () => {
  const run = await runPipeline();
  const pi = USERS.find((u) => u.id === 'usr-ananya');
  const dean = USERS.find((u) => u.id === 'usr-krishnan');
  assert.equal(engine.governance.canApprove(pi), false);
  assert.throws(() => engine.governance.approveRun(run, pi, { decision: 'approve' }), /permission/);

  engine.governance.approveRun(run, dean, { decision: 'approve', notes: 'Approved in test.' });
  assert.equal(run.status, 'published');
  assert.equal(run.package.status, 'approved');
  assert.ok(run.publishedVersion >= 1);
  const versions = db.state.versions.filter((v) => v.runId === run.id);
  assert.equal(versions.length, 1);
  assert.ok(versions[0].snapshot.draft);

  const first = versions[0];
  engine.governance.rollbackRun(run, first.id, dean);
  assert.equal(run.publishedVersion, 2);
  assert.equal(run.rollback.toVersion, 1);
});

test('Guardrail — a run for an ineligible career stage is not silently accepted', async () => {
  const params = { ...HEALTH_PARAMS, careerStage: 'professor', fundingType: 'government' };
  const run = engine.createRun({ request: `${params.researchArea}.`, params, consent: true, actorId: 'usr-ananya' });
  db.addRun(run);
  await engine.execute(run);
  // Either an eligible call is found, or the run escalates instead of shipping an ineligible request.
  assert.ok(['awaiting_review', 'needs_human'].includes(run.status));
  if (run.status === 'awaiting_review') {
    const call = run.discovery.selectedCall;
    assert.ok(call.eligibility.careerStages.includes('professor'));
  }
});
