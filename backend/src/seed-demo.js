'use strict';

/**
 * Seed a small demo workspace so the console has content on first boot.
 * One package is approved by the Research Office (a recorded, auditable
 * decision on seeded data), one is left awaiting review.
 */
const { config, db, util } = require('./core');
const engine = require('./engine');
const { USERS } = require('./seed');

const HEALTH_REQUEST = 'Federated learning for diabetic retinopathy screening in rural primary care, validated across four clinics in Maharashtra.';
const HEALTH_PARAMS = {
  researchArea: 'Federated learning for diabetic retinopathy screening in rural primary care',
  keywords: ['federated learning', 'diabetic retinopathy', 'screening', 'rural health', 'medical imaging'],
  fundingType: 'government',
  requestedBudget: 5800000,
  durationMonths: 36,
  careerStage: 'associate',
  institutionType: 'university',
  humanSubjects: true,
  setting: 'rural primary care',
  sites: 4,
  sampleSize: 2400,
};

const EDU_REQUEST = 'Learning analytics and AI tutoring to improve first-year engineering outcomes in underserved colleges.';
const EDU_PARAMS = {
  researchArea: 'Learning analytics and AI tutoring for first-year engineering outcomes',
  keywords: ['learning analytics', 'education technology', 'engineering education', 'student outcomes'],
  fundingType: 'industry',
  requestedBudget: 4200000,
  durationMonths: 24,
  careerStage: 'associate',
  institutionType: 'university',
  humanSubjects: false,
  setting: 'underserved colleges',
  sites: 6,
  sampleSize: 1200,
};

async function seedDemo({ force = false } = {}) {
  if (db.state.runs.length && !force) return { seeded: false, reason: 'workspace already has runs', runs: db.state.runs.map((r) => r.id) };
  const previousDelay = config.stepDelayMs;
  config.stepDelayMs = 25;
  const created = [];
  try {
    const run1 = engine.createRun({ request: HEALTH_REQUEST, params: HEALTH_PARAMS, consent: true, actorId: 'usr-ananya' });
    db.addRun(run1);
    await engine.execute(run1);
    created.push(run1);
    if (run1.status === 'awaiting_review' && run1.acceptance?.allPass) {
      const meera = USERS.find((u) => u.id === 'usr-meera');
      engine.governance.approveRun(run1, meera, { decision: 'approve', notes: 'Seeded demonstration package reviewed by the Research Office.' });
    }

    // The second seed stays deterministic so the workspace does not burn the
    // on-demand Groq token budget before the user creates their own run.
    const previousLlm = process.env.AURA_LLM;
    process.env.AURA_LLM = 'off';
    const run2 = engine.createRun({ request: EDU_REQUEST, params: EDU_PARAMS, consent: true, actorId: 'usr-ananya' });
    db.addRun(run2);
    await engine.execute(run2);
    created.push(run2);
    process.env.AURA_LLM = previousLlm;

    db.persist();
    return {
      seeded: true,
      runs: created.map((r) => ({ id: r.id, status: r.status, title: r.draft?.title, call: r.discovery?.selectedCall?.agency, repairs: r.validation?.attempts || 0 })),
    };
  } finally {
    config.stepDelayMs = previousDelay;
    db.persist();
  }
}

module.exports = { seedDemo, HEALTH_PARAMS, EDU_PARAMS, HEALTH_REQUEST, EDU_REQUEST };
