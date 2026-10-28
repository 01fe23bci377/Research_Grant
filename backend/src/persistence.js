'use strict';

/**
 * Persistence bridge: MongoDB is the system of record when connected, with the
 * local JSON store as a fallback. It also resolves the links between people and
 * runs / audit events / published versions.
 *
 *   User._id  ←  Run.actorRef        (owner / PI)
 *   User._id  ←  Run.approval.decidedByRef
 *   User._id  ←  AuditEvent.actorRef
 *   User._id  ←  Version.approvedByRef
 */
const database = require('./database');
const Run = require('./models/Run');
const AuditEvent = require('./models/AuditEvent');
const Version = require('./models/Version');

const { User } = database;

const userCache = new Map();
const savedAt = new Map();
const saveQueues = new Map();
let flushTimer = null;
let flushing = false;

const ready = () => database.isConnected();

function snapshotUser(user) {
  if (!user) return null;
  return {
    userId: user.userId || String(user._id || ''),
    Name: user.Name || user.name,
    name: user.Name || user.name,
    Role: user.Role || user.role,
    role: user.Role || user.role,
    Dept: user.Dept || user.dept || user.department,
    dept: user.Dept || user.dept || user.department,
    email: user.email,
    title: user.title,
  };
}

/** Find or create the institutional user row for an actor, then cache it. */
async function ensureUser(actor) {
  if (!ready() || !actor) return null;
  const email = (actor.email || '').toLowerCase();
  const userId = actor.userId || actor.id;
  const key = email || userId;
  if (!key) return null;
  if (userCache.has(key)) return userCache.get(key);
  try {
    let doc = null;
    if (email) doc = await User.findOne({ email });
    if (!doc && userId) doc = await User.findOne({ userId });
    if (!doc) {
      doc = await User.create({
        Name: actor.Name || actor.name || actor.userId || 'Unnamed',
        Role: actor.Role || actor.role || 'faculty',
        Dept: actor.Dept || actor.dept || actor.department || 'Unassigned',
        email: email || `${String(userId || Date.now()).replace(/[^a-z0-9]/gi, '')}@mist.edu.in`,
        title: actor.title,
        userId: userId || `usr-${Date.now().toString(36)}`,
        permissions: actor.permissions || [],
      });
    }
    userCache.set(key, doc);
    if (email) userCache.set(email, doc);
    return doc;
  } catch {
    return null;
  }
}

/** Attach actorRef + a denormalised people snapshot to a run before saving. */
async function linkActorToRun(run) {
  if (!run) return run;
  const actor = run.actor || {};
  const doc = await ensureUser(actor);
  if (doc) {
    run.actorRef = String(doc._id);
    run.actor = {
      ...actor,
      ...snapshotUser(doc),
      ref: String(doc._id),
    };
  }
  if (run.approvals?.decidedById || run.approvals?.decidedByEmail || run.approvals?.decidedBy) {
    let approver = null;
    if (run.approvals.decidedById || run.approvals.decidedByEmail) {
      approver = await ensureUser({
        id: run.approvals.decidedById,
        name: run.approvals.decidedBy,
        email: run.approvals.decidedByEmail,
        role: 'dean',
      });
    }
    if (!approver && run.approvals.decidedBy) {
      approver = await User.findOne({ Name: run.approvals.decidedBy });
    }
    if (approver) {
      run.approvals.decidedByRef = String(approver._id);
      run.approvals.decidedByName = approver.Name;
      run.approvals.decidedByRefEmail = approver.email;
      run.approvals.decidedByDept = approver.Dept;
    }
  }
  return run;
}

function summaryOf(run) {
  return {
    runId: run.id,
    title: run.draft?.title || run.params?.researchArea || run.request,
    status: run.status,
    stage: run.stage,
    domain: run.domain,
    call: run.discovery?.selectedCall
      ? {
          id: run.discovery.selectedCall.id,
          agency: run.discovery.selectedCall.agency,
          program: run.discovery.selectedCall.program,
          deadline: run.discovery.selectedCall.deadline,
        }
      : undefined,
    budget: run.budget
      ? { total: run.budget.totals?.total, currency: run.budget.currency, formatted: run.budget.formatted?.total }
      : undefined,
    evidence: run.evidence ? { coverage: run.evidence.coverage, sources: run.evidence.sourceCount } : undefined,
    compliance: run.compliance?.summary
      ? { pass: run.compliance.summary.pass, fail: run.compliance.summary.fail, blocking: run.compliance.summary.blocking }
      : undefined,
    approval: {
      decision: run.approvals?.decision || null,
      decidedBy: run.approvals?.decidedBy || null,
      decidedById: run.approvals?.decidedById || null,
      decidedByEmail: run.approvals?.decidedByEmail || null,
      decidedAt: run.approvals?.decidedAt || null,
      notes: run.approvals?.notes || null,
      version: run.publishedVersion || null,
    },
    llm: run.llm
      ? {
          provider: run.llm.provider,
          model: run.llm.model,
          calls: run.llm.calls,
          promptTokens: run.llm.promptTokens,
          completionTokens: run.llm.completionTokens,
          fallbacks: run.llm.fallbacks,
        }
      : undefined,
    createdAt: run.createdAt ? new Date(run.createdAt) : new Date(),
    updatedAt: new Date(),
  };
}

/** Cheap change signature so the debounced sync only writes modified runs. */
function signature(run) {
  return [
    run.updatedAt,
    run.status,
    run.stage,
    run.logs?.length || 0,
    run.trace?.length || 0,
    run.package?.checksum || '',
    run.publishedVersion || '',
    run.llm?.calls || 0,
  ].join('|');
}

async function saveRun(run) {
  if (!ready() || !run?.id) return;
  // Serialise writes per run so an older snapshot cannot overwrite a newer one
  // (actor and approval refs are attached asynchronously).
  const previous = saveQueues.get(run.id) || Promise.resolve();
  const task = previous.then(() => writeRun(run)).catch((err) => {
    if (!String(err.message).includes('duplicate')) console.warn('[mongo] saveRun:', err.message);
  });
  saveQueues.set(run.id, task);
  try {
    await task;
  } finally {
    if (saveQueues.get(run.id) === task) saveQueues.delete(run.id);
  }
}

async function writeRun(run) {
  await linkActorToRun(run);
  const doc = summaryOf(run);
  if (run.approvals?.decidedByRef && database.mongoose.isValidObjectId(run.approvals.decidedByRef)) {
    doc.approval = { ...(doc.approval || {}), decidedByRef: run.approvals.decidedByRef };
  }
  const update = {
    $set: {
      ...doc,
      actorRef: run.actorRef && database.mongoose.isValidObjectId(run.actorRef) ? run.actorRef : undefined,
      actor: run.actor,
      payload: run,
    },
  };
  if (!update.$set.actorRef) delete update.$set.actorRef;
  await Run.updateOne({ runId: run.id }, update, { upsert: true });
  savedAt.set(run.id, signature(run));
}

async function saveVersion(version) {
  if (!ready() || !version?.id) return;
  try {
    let approvedByRef;
    let approvedByEmail = version.approvedByEmail || null;
    if (version.approvedBy) {
      const person = await User.findOne({ Name: version.approvedBy });
      if (person) {
        approvedByRef = person._id;
        approvedByEmail = approvedByEmail || person.email;
      }
    }
    await Version.updateOne(
      { versionId: version.id },
      {
        $set: {
          ...version,
          versionId: version.id,
          approvedByRef,
          approvedByEmail,
          runRef: version.runRef || undefined,
          at: version.at ? new Date(version.at) : new Date(),
        },
      },
      { upsert: true },
    );
  } catch (err) {
    console.warn('[mongo] saveVersion:', err.message);
  }
}

async function recordAudit(entry) {
  if (!ready() || !entry?.id) return;
  try {
    const actorEmail = entry.actorEmail || null;
    let doc = null;
    if (actorEmail || entry.actorId) {
      doc = await ensureUser({
        id: entry.actorId,
        name: entry.actor,
        email: actorEmail,
        role: entry.actorRole || 'faculty',
      });
    }
    // Agent steps inherit the owning PI so every event links to a person.
    if (!doc && entry.runId) {
      const runDoc = await Run.findOne({ runId: entry.runId }).select('actorRef').lean();
      if (runDoc?.actorRef) doc = await User.findById(runDoc.actorRef);
    }
    await AuditEvent.updateOne(
      { eventId: entry.id },
      {
        $set: {
          eventId: entry.id,
          runId: entry.runId || null,
          actorRef: doc?._id,
          actorId: entry.actorId || doc?.userId || null,
          actor: entry.actor || 'system',
          actorEmail: actorEmail || doc?.email || null,
          agent: entry.agent,
          phase: entry.phase,
          intent: entry.intent,
          action: entry.action,
          inputs: entry.inputs ?? null,
          outputs: entry.outputs ?? null,
          result: entry.result,
          level: entry.level || 'info',
          durationMs: entry.durationMs ?? null,
          ts: entry.ts ? new Date(entry.ts) : new Date(),
        },
      },
      { upsert: true },
    );
  } catch (err) {
    if (!String(err.message).includes('duplicate')) console.warn('[mongo] recordAudit:', err.message);
  }
}

function nil(v) {
  return v || null;
}

/** Debounced sync of run state after each runtime persist. */
function persistState(state) {
  if (!ready()) return;
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    if (flushing) return;
    flushing = true;
    try {
      const changed = (state.runs || []).filter((r) => savedAt.get(r.id) !== signature(r));
      for (const run of changed) await saveRun(run);
      for (const v of state.versions || []) {
        if (!savedAt.get(v.id)) {
          await saveVersion(v);
          savedAt.set(v.id, 'saved');
        }
      }
    } finally {
      flushing = false;
    }
  }, 350);
}

async function hydrate(state) {
  if (!ready()) return false;
  try {
    const runs = await Run.find().sort({ createdAt: 1 }).lean();
    if (runs.length) {
      state.runs = runs.map((d) => {
        const payload = d.payload || {};
        const rawActor = payload.actor || d.actor || {};
        const actor = {
          id: rawActor.id || rawActor.userId,
          userId: rawActor.userId || rawActor.id,
          name: rawActor.name || rawActor.Name,
          role: rawActor.role || rawActor.Role,
          title: rawActor.title,
          dept: rawActor.dept || rawActor.Dept || rawActor.department,
          email: rawActor.email,
          ref: rawActor.ref,
        };
        return {
          ...payload,
          id: d.runId,
          actorRef: d.actorRef ? String(d.actorRef) : payload.actorRef,
          actor,
          approvals: {
            ...(payload.approvals || {}),
            ...(d.approval?.decidedByRef ? { decidedByRef: String(d.approval.decidedByRef) } : {}),
          },
          createdAt: payload.createdAt || d.createdAt,
          updatedAt: payload.updatedAt || d.updatedAt,
        };
      });
      for (const r of state.runs) savedAt.set(r.id, r.updatedAt);
    }
    const versions = await Version.find().sort({ at: 1 }).lean();
    if (versions.length) {
      state.versions = versions.map((v) => ({
        ...v.snapshot,
        id: v.versionId,
        runId: v.runId,
        v: v.v,
        at: v.at,
        checksum: v.checksum,
        status: v.status,
        approvedBy: v.approvedBy,
        restoredFrom: v.restoredFrom,
        approvedByRef: v.approvedByRef ? String(v.approvedByRef) : undefined,
      }));
      for (const v of state.versions) savedAt.set(v.id, 'saved');
      // Backfill approver email on older versions that predate the link.
      for (const raw of versions) {
        if (!raw.approvedByEmail && raw.approvedByRef) {
          const person = await User.findById(raw.approvedByRef).lean();
          if (person) {
            await Version.updateOne(
              { versionId: raw.versionId },
              { $set: { approvedByEmail: person.email, approvedById: person.userId } },
            ).catch(() => {});
          }
        }
      }
    }
    const events = await AuditEvent.find().sort({ ts: -1 }).limit(600).lean();
    if (events.length) {
      state.audit = events.reverse().map((e) => ({
        id: e.eventId,
        ts: e.ts,
        runId: e.runId,
        actor: e.actor,
        actorId: e.actorId,
        actorEmail: e.actorEmail,
        agent: e.agent,
        phase: e.phase,
        intent: e.intent,
        action: e.action,
        inputs: e.inputs,
        outputs: e.outputs,
        result: e.result,
        level: e.level,
        durationMs: e.durationMs,
      }));
    } else if (state.audit?.length) {
      // Backfill the audit trail from the local store on first Mongo boot.
      const docs = state.audit.slice(-1500).map((e) => ({
        eventId: e.id,
        runId: e.runId,
        actor: e.actor,
        actorId: e.actorId,
        actorEmail: e.actorEmail,
        agent: e.agent,
        phase: e.phase,
        intent: e.intent,
        action: e.action,
        inputs: e.inputs,
        outputs: e.outputs,
        result: e.result,
        level: ['info', 'warn', 'error', 'gate'].includes(e.level) ? e.level : 'info',
        durationMs: e.durationMs,
        ts: e.ts ? new Date(e.ts) : new Date(),
      }));
      if (docs.length) {
        try {
          await AuditEvent.insertMany(docs, { ordered: false });
        } catch (err) {
          if (!String(err.message).includes('duplicate')) console.warn('[mongo] audit backfill:', err.message);
        }
      }
    }
    return true;
  } catch (err) {
    console.warn('[mongo] hydrate:', err.message);
    return false;
  }
}

async function people() {
  if (ready()) {
    try {
      const rows = await User.aggregate([
        {
          $lookup: {
            from: 'runs',
            localField: '_id',
            foreignField: 'actorRef',
            as: 'owned',
          },
        },
        {
          $lookup: {
            from: 'runs',
            localField: '_id',
            foreignField: 'approval.decidedByRef',
            as: 'approved',
          },
        },
        {
          $project: {
            Name: 1,
            Role: 1,
            Dept: 1,
            email: 1,
            title: 1,
            userId: 1,
            permissions: 1,
            active: '$isActive',
            runsCount: { $size: '$owned' },
            approvedCount: {
              $size: {
                $filter: {
                  input: '$approved',
                  as: 'a',
                  cond: { $eq: ['$$a.approval.decision', 'approved'] },
                },
              },
            },
            lastRunAt: { $max: '$owned.createdAt' },
          },
        },
        { $sort: { Role: 1, Name: 1 } },
      ]);
      if (rows.length) {
        return rows.map((r) => ({
          id: r.userId || String(r._id),
          _id: String(r._id),
          Name: r.Name,
          Role: r.Role,
          Dept: r.Dept,
          email: r.email,
          title: r.title,
          permissions: r.permissions || [],
          runsCount: r.runsCount,
          approvedCount: r.approvedCount,
          lastRunAt: r.lastRunAt,
          active: r.active !== false,
        }));
      }
    } catch (err) {
      console.warn('[mongo] people:', err.message);
    }
  }
  return database.SEED_USERS.map((u) => ({
    id: u.userId,
    _id: u.userId,
    Name: u.Name,
    Role: u.Role,
    Dept: u.Dept,
    email: u.email,
    title: u.title,
    permissions: u.permissions || [],
    runsCount: 0,
    approvedCount: 0,
    lastRunAt: null,
    active: true,
  }));
}

async function person(identifier) {
  const users = await people();
  const key = String(identifier || '').toLowerCase();
  const match = users.find((u) => [u.id, u._id, u.email, u.Name].filter(Boolean).some((v) => String(v).toLowerCase() === key));
  if (!match) return null;
  let runs = [];
  if (ready()) {
    try {
      const docs = await Run.find({ $or: [{ actorRef: match._id }, { 'approval.decidedByRef': match._id }] })
        .sort({ createdAt: -1 })
        .lean();
      runs = docs.map((d) => ({
        id: d.runId,
        title: d.payload?.draft?.title || d.title,
        status: d.status,
        role: String(d.actorRef) === match._id ? 'owner' : 'approver',
        call: d.call?.agency || null,
        createdAt: d.createdAt,
      }));
    } catch {
      // ignore
    }
  }
  return { person: match, runs };
}

async function status() {
  const base = database.status();
  if (!ready()) return { ...base, counts: { users: 0, runs: 0, auditEvents: 0, versions: 0 } };
  try {
    const [users, runs, auditEvents, versions] = await Promise.all([
      User.countDocuments(),
      Run.countDocuments(),
      AuditEvent.countDocuments(),
      Version.countDocuments(),
    ]);
    return { ...base, counts: { users, runs, auditEvents, versions } };
  } catch (err) {
    return { ...base, error: err.message };
  }
}

module.exports = {
  ready,
  ensureUser,
  linkActorToRun,
  saveRun,
  saveVersion,
  recordAudit,
  persistState,
  hydrate,
  people,
  person,
  status,
  models: { Run, AuditEvent, Version, User },
};
