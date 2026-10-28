'use strict';

const mongoose = require('mongoose');

/**
 * Append-only audit event. Every agent step is linked to a run and, where the
 * actor is a person, to that person's user record.
 */
const AuditEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    runId: { type: String, index: true },
    runRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Run', index: true },
    actorRef: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    actorId: { type: String, index: true },
    actor: { type: String, default: 'system' },
    actorEmail: { type: String, lowercase: true, trim: true },
    agent: { type: String, index: true },
    phase: { type: String, index: true },
    intent: String,
    action: String,
    inputs: mongoose.Schema.Types.Mixed,
    outputs: mongoose.Schema.Types.Mixed,
    result: String,
    level: { type: String, enum: ['info', 'warn', 'error', 'gate'], default: 'info' },
    durationMs: Number,
    ts: { type: Date, default: Date.now, index: true },
  },
  { minimize: false }
);

AuditEventSchema.index({ runId: 1, ts: -1 });

const AuditEvent = mongoose.models.AuditEvent || mongoose.model('AuditEvent', AuditEventSchema);

module.exports = AuditEvent;
