'use strict';

/**
 * HTTP API for the AURA console.
 */
const express = require('express');
const {
  config, db, util, connector, skills, specialists, runtime,
} = require('./core');
const engine = require('./engine');
const { AGENTS, CALLS, LITERATURE, POLICIES, USERS, INSTITUTION, DOCUMENT_REGISTER, COMPLIANCE_RULES } = require('./seed');

const { money } = util;

function actorFrom(req) {
  const authHeader = req.get('authorization');
  let tokenUserId = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const matched = USERS.find((u) => token.includes(u.id));
    if (matched) tokenUserId = matched.id;
  }
  const id = tokenUserId || req.get('x-actor-id') || req.body?.actorId || req.query?.actorId || 'usr-suneeta-v-budihal';
  const actor = USERS.find((u) => u.id === id) || USERS[0];
  return actor;
}

function createApp() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-actor-id');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  app.get('/api/health', wrap(async (req, res) => {
    const mongo = await persistence.status();
    res.json({
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: util.nowIso(),
      version: '1.2.0',
      store: mongo.connected ? 'mongodb' : 'file',
      mongo,
      llm: { configured: groq.isGroqConfigured(), provider: 'Groq Cloud', model: groq.GROQ_MODEL },
    });
  }));

  app.get('/api/bootstrap', wrap(async (req, res) => {
    const people = await persistence.people();
    const mongo = await persistence.status();
    res.json({
      institution: INSTITUTION,
      agents: AGENTS,
      users: people.map((p) => ({
        id: p.id,
        name: p.Name,
        role: p.Role,
        title: p.title,
        dept: p.Dept,
        email: p.email,
        permissions: p.permissions,
        runsCount: p.runsCount,
      })),
      people,
      specialists: Object.values(specialists.SPECIALISTS).map((s) => ({ id: s.id, label: s.label, description: s.description, sections: s.sections, scheme: s.scheme.requiredFields })),
      graph: engine.GRAPH,
      skills: { plan: skills.PLAN_SCHEMA, format: skills.FORMAT_SCHEMA },
      metrics: engine.metrics.computeMetrics(),
      config: { retryBudget: config.retryBudget, reviewBufferDays: config.reviewBufferDays, stepDelayMs: config.stepDelayMs, connectorHeader: config.connectorTokenHeader },
      connector: connector.catalog(),
      counts: { calls: CALLS.length, literature: LITERATURE.length, policies: POLICIES.length, rules: COMPLIANCE_RULES.length, documents: DOCUMENT_REGISTER.length },
      mongo,
      llm: { configured: groq.isGroqConfigured(), provider: 'Groq Cloud', model: groq.GROQ_MODEL, drafting: require('./llm-drafting').isEnabled() },
      now: util.nowIso(),
    });
  }));

const database = require('./database');
const groq = require('./groq');
const persistence = require('./persistence');
const llmDrafting = require('./llm-drafting');

  /* --------------------------------- auth ---------------------------------- */
  app.post('/api/auth/login', wrap(async (req, res) => {
    const { email, username, userId, password } = req.body || {};
    const identifier = String(email || username || userId || '').trim().toLowerCase();

    // Check MongoDB User model first, then fallback to seed USERS
    let user = await database.findUserByIdOrEmail(identifier);
    if (!user) {
      user = USERS.find((u) =>
        u.id.toLowerCase() === identifier ||
        (u.email && u.email.toLowerCase() === identifier) ||
        u.name.toLowerCase().includes(identifier)
      ) || (userId ? USERS.find((u) => u.id === userId) : null);
    }

    if (!user) {
      return res.status(401).json({ error: 'invalid_credentials', message: 'User account not found. Please select an institutional account.' });
    }

    if (password && password !== 'password123' && password !== 'dean123' && password !== user.password) {
      return res.status(401).json({ error: 'invalid_password', message: 'Incorrect password.' });
    }

    const uid = user.userId || user.id || `usr-${Date.now()}`;
    const name = user.Name || user.name;
    const role = user.Role || user.role;
    const dept = user.Dept || user.department;
    const emailAddr = user.email;

    const token = `aura-tok-${uid}-${Date.now()}`;
    db.audit({ actor: name, agent: 'coordinator', phase: 'auth', intent: 'User authenticated', action: 'auth.login', inputs: { role }, outputs: { userId: uid }, result: 'success' });

    res.json({
      success: true,
      token,
      user: {
        id: uid,
        Name: name,
        Role: role,
        Dept: dept,
        email: emailAddr,
        name,
        role,
        dept,
        department: dept,
        title: user.title,
        permissions: user.permissions,
      },
    });
  }));

  app.get('/api/auth/me', wrap(async (req, res) => {
    const actor = actorFrom(req);
    res.json({
      user: {
        id: actor.id,
        Name: actor.Name || actor.name,
        Role: actor.Role || actor.role,
        Dept: actor.Dept || actor.department,
        email: actor.email,
        name: actor.name,
        role: actor.role,
        department: actor.department,
        dept: actor.department,
        title: actor.title,
        permissions: actor.permissions,
      },
    });
  }));

  app.post('/api/auth/logout', (req, res) => {
    const actor = actorFrom(req);
    db.audit({ actor: actor.name, agent: 'coordinator', phase: 'auth', intent: 'User signed out', action: 'auth.logout', inputs: {}, outputs: {}, result: 'success' });
    res.json({ success: true, message: 'Logged out successfully' });
  });

  /* ------------------------------- users / faculty ------------------------ */
  app.get('/api/users', wrap(async (req, res) => {
    const people = await persistence.people();
    const mongoStatus = await persistence.status();
    res.json({
      source: mongoStatus.connected ? 'mongodb' : 'fallback',
      orm: 'mongoose',
      model: 'User',
      collection: 'users',
      total: people.length,
      users: people,
      mongo: mongoStatus,
      schema: {
        model: 'User',
        collection: 'users',
        required: ['Name', 'Role', 'Dept', 'email'],
        roleEnum: ['dean', 'pi', 'faculty', 'research_office', 'admin'],
        fields: {
          Name: { type: 'String', required: true, description: 'Faculty full name with academic honorific' },
          Role: { type: 'String', required: true, enum: ['dean', 'pi', 'faculty', 'research_office', 'admin'], description: 'Institutional access role' },
          Dept: { type: 'String', required: true, description: 'Academic department or school' },
          email: { type: 'String', required: true, unique: true, description: 'Institutional email address' },
          password: { type: 'String', default: 'password123' },
          title: { type: 'String', description: 'Academic designation / administrative office' },
          userId: { type: 'String', description: 'Institutional user identifier' },
          permissions: { type: '[String]', description: 'Governed RBAC permission tokens' },
          careerStage: { type: 'String', enum: ['assistant', 'associate', 'professor', 'n/a'], default: 'associate' },
          expertise: { type: '[String]', description: 'Domain keywords for grant matching' },
          monthlyCost: { type: 'Number', default: 150000 },
          isActive: { type: 'Boolean', default: true },
        },
        links: ['runs.actorRef', 'runs.approval.decidedByRef', 'audit_events.actorRef', 'versions.approvedByRef'],
      },
    });
  }));

  app.get('/api/users/:id', wrap(async (req, res) => {
    const detail = await persistence.person(req.params.id);
    if (!detail) return res.status(404).json({ error: 'not_found', message: 'Person not found' });
    res.json(detail);
  }));

  app.get('/api/people', wrap(async (req, res) => {
    res.json({ people: await persistence.people(), mongo: await persistence.status() });
  }));

  app.get('/api/people/:id', wrap(async (req, res) => {
    const detail = await persistence.person(req.params.id);
    if (!detail) return res.status(404).json({ error: 'not_found', message: 'Person not found' });
    res.json(detail);
  }));

  app.get('/api/mongo/status', wrap(async (req, res) => {
    res.json(await persistence.status());
  }));

  app.get('/api/mongo/schemas', wrap(async (req, res) => {
    const models = require('./models');
    const mongoose = models.mongoose;
    const modelKeys = ['User', 'Project', 'Run', 'AuditEvent', 'Version'];
    const schemasInfo = {};

    for (const key of modelKeys) {
      const model = models[key];
      if (!model || !model.schema) continue;
      const paths = {};
      for (const [pathname, schemaType] of Object.entries(model.schema.paths)) {
        paths[pathname] = {
          instance: schemaType.instance,
          required: Boolean(schemaType.isRequired),
          enumValues: schemaType.enumValues || null,
          defaultValue: typeof schemaType.defaultValue === 'function' ? '(computed)' : schemaType.defaultValue,
        };
      }
      let count = null;
      if (database.isConnected()) {
        try {
          count = await model.countDocuments();
        } catch {
          count = null;
        }
      }
      schemasInfo[key] = {
        modelName: key,
        collectionName: model.collection?.name || key.toLowerCase() + 's',
        paths,
        pathCount: Object.keys(paths).length,
        documentCount: count,
      };
    }

    res.json({
      connected: database.isConnected(),
      database: database.status(),
      orm: 'mongoose',
      models: schemasInfo,
      sampleSchema: {
        model: 'User',
        code: `const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  Name: { type: String, required: [true, 'Name is required'], trim: true },
  Role: {
    type: String,
    required: [true, 'Role is required'],
    enum: ['dean', 'pi', 'faculty', 'research_office', 'admin'],
    trim: true,
    lowercase: true,
  },
  Dept: { type: String, required: [true, 'Department is required'], trim: true },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Valid email required'],
  },
  password: { type: String, default: 'password123' },
  title: { type: String, trim: true },
  userId: { type: String, trim: true, sparse: true },
  permissions: { type: [String], default: [] },
  expertise: { type: [String], default: [] },
  careerStage: { type: String, enum: ['assistant', 'associate', 'professor', 'n/a'], default: 'associate' },
  monthlyCost: { type: Number, default: 150000 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.models.User || mongoose.model('User', UserSchema);`,
      },
    });
  }));


  app.post('/api/users', wrap(async (req, res) => {
    const { Name, Role, Dept, email, password, title, careerStage, expertise } = req.body || {};

    if (!Name || !Role || !Dept || !email) {
      return res.status(400).json({
        error: 'missing_fields',
        message: 'Name, Role, Dept, and email are required fields',
        schema: { Name: 'String (required)', Role: 'String (dean/pi/faculty/research_office)', Dept: 'String (required)', email: 'String (required)' },
      });
    }

    try {
      if (database.isConnected()) {
        const created = await database.User.create({
          Name,
          Role,
          Dept,
          email,
          password: password || 'password123',
          title: title || (Role === 'dean' ? 'Dean, Research & Development' : 'Faculty Researcher'),
          careerStage: careerStage || 'associate',
          expertise: expertise || [],
          userId: `usr-${Date.now().toString(36)}`,
        });
        // Keep the in-process actor registry in sync so x-actor-id works immediately.
        USERS.push({
          id: created.userId,
          name: created.Name,
          Name: created.Name,
          role: created.Role,
          department: created.Dept,
          dept: created.Dept,
          email: created.email,
          title: created.title,
          permissions: created.permissions,
        });
        return res.status(201).json({ success: true, user: created });
      }

      // Memory creation fallback
      const newUser = {
        id: `usr-${Date.now().toString(36)}`,
        Name,
        Role,
        Dept,
        email,
        name: Name,
        role: Role,
        department: Dept,
        dept: Dept,
        title: title || (Role === 'dean' ? 'Dean, Research & Development' : 'Faculty Researcher'),
        permissions: Role === 'dean' ? ['run:create', 'run:read:all', 'review:approve', 'package:view', 'audit:read', 'version:rollback', 'metrics:read'] : ['run:create', 'run:read:own', 'draft:edit', 'package:view'],
      };
      USERS.push(newUser);
      res.status(201).json({ success: true, user: newUser });
    } catch (err) {
      res.status(400).json({ error: 'creation_failed', message: err.message });
    }
  }));

  /* -------------------------------- projects ------------------------------- */
  const projectStore = require('./project-store');

  app.get('/api/projects', wrap(async (req, res) => {
    const { year, department, q, faculty, my } = req.query;
    const actor = actorFrom(req);
    // If 'my=true' or 'my=1', filter to the authenticated faculty member's name
    const targetFaculty = (my === 'true' || my === '1') ? (actor?.Name || actor?.name) : faculty;
    const projects = await projectStore.listProjects({ year, department, q, faculty: targetFaculty });
    const faculties = await projectStore.getFacultiesFromDB();
    res.json({
      projects,
      faculties,
      summary: await projectStore.summary(),
      years: projectStore.YEARS,
      departments: projectStore.DEPARTMENTS,
      filter: { faculty: targetFaculty || null, year: year || null, department: department || null },
      source: 'mongodb',
    });
  }));

  app.get('/api/faculties', wrap(async (req, res) => {
    const faculties = await projectStore.getFacultiesFromDB();
    res.json({
      faculties,
      total: faculties.length,
      source: 'mongodb',
      orm: 'mongoose',
      model: 'User',
    });
  }));

  app.get('/api/projects/:id', wrap(async (req, res) => {
    const project = await projectStore.getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'not_found', message: 'Project not found' });
    res.json({ project });
  }));

  app.put('/api/projects/:id/budget', wrap(async (req, res) => {
    const actor = actorFrom(req);
    const lines = Array.isArray(req.body?.lines) ? req.body.lines : [];
    try {
      const saved = await projectStore.saveBudget(req.params.id, lines, actor);
      db.audit({ actor: actor.name, actorId: actor.id, agent: 'faculty', phase: 'budget', intent: `Faculty entered budget for ${req.params.id}`, action: 'project.budget.save', inputs: { lines: lines.length }, outputs: { total: saved.total }, result: 'saved' });
      res.json({ success: true, ...saved });
    } catch (err) {
      res.status(err.status || 400).json({ error: 'budget_save_failed', message: err.message });
    }
  }));

  /* ------------------------------- groq llm ------------------------------- */
  app.get('/api/llm/status', (req, res) => {
    const stats = groq.getStats();
    const runs = db.state.runs.reduce((acc, r) => {
      if (!r.llm) return acc;
      acc.sections += r.llm.sectionsFromLLM || 0;
      acc.promptTokens += r.llm.promptTokens || 0;
      acc.completionTokens += r.llm.completionTokens || 0;
      acc.fallbacks += r.llm.fallbacks || 0;
      return acc;
    }, { sections: 0, promptTokens: 0, completionTokens: 0, fallbacks: 0 });
    res.json({
      ...stats,
      provider: 'Groq Cloud',
      status: stats.configured ? 'active' : 'api_key_pending_in_env',
      drafting: llmDrafting.isEnabled(),
      concurrency: Number(process.env.AURA_LLM_CONCURRENCY || 1),
      runs,
    });
  });

  app.post('/api/llm/generate', wrap(async (req, res) => {
    const { prompt, systemPrompt, maxTokens, temperature, json } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'prompt_required' });
    const result = await groq.callGroq({
      prompt,
      systemPrompt,
      maxTokens: maxTokens || 600,
      temperature,
      json: Boolean(json),
      reasoningEffort: 'low',
    });
    res.json(result);
  }));

  /* ------------------------------- intake -------------------------------- */
  app.post('/api/intake/clarify', (req, res) => {
    const { request = '', params = {} } = req.body || {};
    res.json(engine.clarify({ request, params: { ...params, consent: params.consent ?? req.body?.consent } }));
  });

  app.post('/api/plan/preview', (req, res) => {
    const { request = '', params = {} } = req.body || {};
    const clarified = engine.clarify({ request, params: { ...params, consent: true } });
    const specialist = specialists.getSpecialist(clarified.clarified.fundingType === 'industry' ? 'industry' : clarified.clarified.fundingType === 'international' ? 'international' : 'government');
    const plan = skills.buildPlan({
      researchArea: clarified.clarified.researchArea,
      keywords: clarified.clarified.keywords,
      callId: 'pending',
      callTitle: `${clarified.clarified.fundingType || 'government'} call (to be matched)`,
      domain: specialist.id,
      requestedBudget: clarified.clarified.requestedBudget,
      durationMonths: clarified.clarified.durationMonths,
      sections: params.sections && params.sections.length ? params.sections.filter((s) => specialist.sections.includes(s)) : specialist.sections,
      retryBudget: config.retryBudget,
    });
    res.json({ clarified: clarified.clarified, plan, specialist: { id: specialist.id, label: specialist.label, description: specialist.description } });
  });

  /* -------------------------------- runs --------------------------------- */
  app.post('/api/runs', wrap(async (req, res) => {
    const actor = actorFrom(req);
    const { request = '', params = {}, consent = false, faults = [], sections = [] } = req.body || {};
    const check = engine.clarify({ request, params: { ...params, consent } });
    if (!check.complete) return res.status(422).json({ error: 'intake_incomplete', intake: check });
    const run = await engine.startRun({ request, params, consent, actorId: actor.id, faults });
    if (Array.isArray(sections) && sections.length) run.sections = sections;
    res.status(201).json({ run: engine.serializeRun(run) });
  }));

  app.get('/api/runs', (req, res) => {
    const { status, q, mine } = req.query;
    const actor = actorFrom(req);
    let runs = [...db.state.runs].reverse();
    if (mine === 'true' || mine === '1') {
      runs = runs.filter((r) => r.actorId === actor.id || (r.actor && r.actor.id === actor.id));
    }
    if (status) runs = runs.filter((r) => r.status === status);
    if (q) runs = runs.filter((r) => `${r.id} ${r.params?.researchArea || ''} ${r.draft?.title || ''}`.toLowerCase().includes(String(q).toLowerCase()));
    res.json({ runs: runs.map(engine.summarizeRun) });
  });

  app.get('/api/runs/:id', (req, res) => {
    const run = db.getRun(req.params.id);
    if (!run) return res.status(404).json({ error: 'not_found', message: 'Run not found' });
    res.json({ run: engine.serializeRun(run) });
  });

  app.post('/api/runs/:id/resume', wrap(async (req, res) => {
    const run = db.getRun(req.params.id);
    if (!run) return res.status(404).json({ error: 'not_found' });
    const updated = await engine.resumeRun(run);
    res.json({ run: engine.serializeRun(updated) });
  }));

  /**
   * Lab 12 — faculty revision before the Dean sees the package. The PI may
   * rewrite one or more sections; the revision is re-validated, re-packaged and
   * returned to the approval queue.
   */
  app.put('/api/runs/:id/draft', wrap(async (req, res) => {
    const run = db.getRun(req.params.id);
    if (!run) return res.status(404).json({ error: 'not_found' });
    const actor = actorFrom(req);
    const canEdit = actor.permissions.includes('draft:edit') || actor.role === 'admin' || actor.id === run.actor?.id;
    if (!canEdit) return res.status(403).json({ error: 'forbidden', message: 'Only the owning PI may revise this draft.' });
    if (!['awaiting_review', 'changes_requested', 'needs_human'].includes(run.status)) {
      return res.status(409).json({ error: 'not_revisable', message: `Run is "${run.status}"; revisions are accepted before Dean sign-off.` });
    }
    const edits = Array.isArray(req.body?.sections) ? req.body.sections : [];
    if (!edits.length) return res.status(422).json({ error: 'no_sections', message: 'Provide at least one section revision.' });

    const applied = [];
    for (const edit of edits) {
      const section = run.draft?.sections?.find((s) => s.key === edit.key);
      const text = String(edit.text || '').trim();
      if (!section) return res.status(422).json({ error: 'unknown_section', message: `Unknown section "${edit.key}".` });
      const words = text.split(/\s+/).filter(Boolean).length;
      if (!words) return res.status(422).json({ error: 'empty_section', message: `Section "${edit.key}" cannot be empty.` });
      const unit = run.plan?.units?.find((u) => u.key === edit.key);
      if (unit && words < unit.minWords) {
        return res.status(422).json({ error: 'section_too_short', message: `Section "${edit.key}" needs at least ${unit.minWords} words.` });
      }
      section.paragraphs = [{ text, claimIds: [] }];
      section.wordCount = words;
      section.updatedBy = `faculty:${actor.name}`;
      section.facultyEdited = true;
      run.draft.claims = (run.draft.claims || []).filter((c) => c.sectionKey !== edit.key);
      applied.push(edit.key);
    }
    run.draft.version = (run.draft.version || 1) + 1;
    run.draft.wordCount = run.draft.sections.reduce((a, s) => a + s.wordCount, 0);
    run.draft.citations = require('./core').skills.citationIndex(run.draft);
    run.draft.facultyRevisedAt = util.nowIso();
    run.draft.facultyRevisedBy = actor.name;
    run.updatedAt = util.nowIso();
    run.status = 'changes_requested';
    db.audit({ runId: run.id, actor: actor.name, actorId: actor.id, actorEmail: actor.email, agent: 'drafting', phase: 'revision', intent: `Faculty revised ${applied.length} section(s) before Dean review`, action: 'draft.revise', inputs: { sections: applied }, outputs: { draftVersion: run.draft.version }, result: 'revised' });

    const updated = await engine.resumeRun(run);
    res.json({ run: engine.serializeRun(updated), revised: applied });
  }));

  app.post('/api/runs/:id/inject', wrap(async (req, res) => {
    const run = db.getRun(req.params.id);
    if (!run) return res.status(404).json({ error: 'not_found' });
    if (['published', 'rejected'].includes(run.status)) return res.status(409).json({ error: 'immutable', message: 'A published or rejected run cannot be fault-injected.' });
    run.faults = req.body?.faults || [];
    engine.injectFaults(run, runtime.createContext(run, run.actor));
    const updated = await engine.resumeRun(run);
    res.json({ run: engine.serializeRun(updated) });
  }));

  app.post('/api/runs/:id/review', wrap(async (req, res) => {
    const run = db.getRun(req.params.id);
    if (!run) return res.status(404).json({ error: 'not_found' });
    const actor = actorFrom(req);
    const { decision = 'approve', notes = '', edits = null } = req.body || {};
    const updated = engine.governance.approveRun(run, actor, { decision, notes, edits });
    res.json({ run: engine.serializeRun(updated) });
  }));

  app.post('/api/runs/:id/rollback', wrap(async (req, res) => {
    const run = db.getRun(req.params.id);
    if (!run) return res.status(404).json({ error: 'not_found' });
    const actor = actorFrom(req);
    const updated = engine.governance.rollbackRun(run, req.body?.versionId, actor);
    res.json({ run: engine.serializeRun(updated) });
  }));

  app.get('/api/runs/:id/audit', (req, res) => {
    const events = db.state.audit.filter((a) => a.runId === req.params.id).reverse().slice(0, 300);
    res.json({ events });
  });

  app.get('/api/runs/:id/files/:name', (req, res) => {
    const run = db.getRun(req.params.id);
    const file = run?.package?.files?.find((f) => f.name === req.params.name);
    if (!file) return res.status(404).json({ error: 'not_found' });
    res.setHeader('Content-Type', file.mime || 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
    res.send(file.content);
  });

  /* ------------------------------ catalogue ------------------------------ */
  app.get('/api/agents', (req, res) => {
    const metrics = engine.metrics.computeMetrics();
    res.json({ agents: AGENTS.map((a) => ({ ...a, activity: metrics.agents.find((m) => m.id === a.id) })) });
  });

  app.get('/api/calls', (req, res) => {
    const { fundingType, agency, status, q } = req.query;
    const calls = CALLS.filter((c) => (!fundingType || c.fundingType === fundingType) && (!agency || c.agency === agency) && (!status || c.status === status) && (!q || `${c.title} ${c.agency} ${c.tags.join(' ')}`.toLowerCase().includes(String(q).toLowerCase())))
      .map((c) => ({ ...c, daysLeft: util.daysBetween(util.today(), c.deadline), active: c.verified && c.status === 'open' && util.daysBetween(util.today(), c.deadline) >= 0 }));
    res.json({ calls });
  });

  app.get('/api/calls/:id', (req, res) => {
    const call = CALLS.find((c) => c.id === req.params.id);
    if (!call) return res.status(404).json({ error: 'not_found' });
    res.json({ call: { ...call, daysLeft: util.daysBetween(util.today(), call.deadline) } });
  });

  app.get('/api/literature', (req, res) => {
    const { q } = req.query;
    const items = q ? LITERATURE.filter((l) => `${l.title} ${l.abstract} ${l.tags.join(' ')}`.toLowerCase().includes(String(q).toLowerCase())) : LITERATURE;
    res.json({ literature: items, synthetic: true });
  });

  app.get('/api/policies', (req, res) => res.json({ policies: POLICIES, rules: COMPLIANCE_RULES }));

  app.get('/api/connector', (req, res) => {
    res.json({ catalog: connector.catalog(), log: [...db.state.connectorLog].reverse().slice(0, 60), stats: { calls: db.state.connectorLog.length, sources: connector.catalog().sources.length } });
  });

  app.post('/api/connector/invoke', (req, res) => {
    const { endpoint, args = {} } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: 'endpoint_required' });
    const result = connector.invoke(endpoint, args, { token: config.connectorToken, actor: actorFrom(req).name, agent: 'console', purpose: 'manual-probe' });
    if (!result.ok) return res.status(result.error.code === 'unauthorized' ? 401 : 400).json(result);
    res.json(result);
  });

  app.get('/api/skills', (req, res) => res.json({ skills: [skills.PLAN_SCHEMA, skills.FORMAT_SCHEMA], note: 'Both skills are case-agnostic: the plan skill is invoked for every funding type, and the format skill renders every completed run.' }));

  /* ------------------------------- metrics -------------------------------- */
  app.get('/api/metrics', (req, res) => res.json(engine.metrics.computeMetrics()));

  app.get('/api/audit', (req, res) => {
    const limit = Number(req.query.limit || 100);
    const { runId, agent, level } = req.query;
    let events = [...db.state.audit].reverse();
    if (runId) events = events.filter((e) => e.runId === runId);
    if (agent) events = events.filter((e) => e.agent === agent);
    if (level) events = events.filter((e) => e.level === level);
    res.json({ events: events.slice(0, limit), total: events.length });
  });

  app.get('/api/versions', (req, res) => {
    const versions = [...db.state.versions].reverse().map(({ snapshot, ...rest }) => rest);
    res.json({ versions });
  });

  /* --------------------------------- demo --------------------------------- */
  app.post('/api/demo', wrap(async (req, res) => {
    const seed = require('./seed-demo');
    const created = await seed.seedDemo({ force: Boolean(req.body?.force), actorId: actorFrom(req).id });
    res.json(created);
  }));

  app.use('/api', (req, res) => res.status(404).json({ error: 'not_found', message: `No route for ${req.method} ${req.originalUrl}` }));

  app.use((err, req, res, next) => {
    console.error('[api]', err.message);
    res.status(err.status || 500).json({ error: err.code || 'internal_error', message: err.message });
  });

  return app;
}

module.exports = { createApp, actorFrom };
