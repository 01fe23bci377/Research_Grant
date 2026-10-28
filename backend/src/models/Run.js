'use strict';

const mongoose = require('mongoose');

/**
 * A grant run, stored with a full artifact payload and explicit links to the
 * institutional person who owns it and the person who authorised it.
 */
const RunSchema = new mongoose.Schema(
  {
    runId: { type: String, required: true, unique: true, index: true },
    title: { type: String, trim: true },
    status: { type: String, index: true, default: 'draft' },
    stage: { type: String, default: 'intake' },
    domain: { type: String, enum: ['government', 'industry', 'international'], default: 'government' },

    // Link: run.actorRef → users._id
    actorRef: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    actor: {
      userId: String,
      Name: String,
      name: String,
      Role: String,
      role: String,
      Dept: String,
      dept: String,
      email: { type: String, lowercase: true, trim: true },
    },

    call: {
      id: String,
      agency: String,
      program: String,
      deadline: String,
    },
    budget: { total: Number, currency: String, formatted: String },
    evidence: { coverage: Number, sources: Number },
    compliance: { pass: Number, fail: Number, blocking: Number },
    approval: {
      decision: { type: String, index: true },
      decidedBy: String,
      decidedById: String,
      decidedByEmail: { type: String, lowercase: true, trim: true },
      decidedByRef: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
      decidedAt: Date,
      notes: String,
      version: Number,
    },
    llm: {
      provider: String,
      model: String,
      calls: Number,
      promptTokens: Number,
      completionTokens: Number,
      fallbacks: Number,
    },
    // Full run document for exact replay/rollback fidelity.
    payload: { type: mongoose.Schema.Types.Mixed },
    createdAt: { type: Date, default: Date.now, index: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { minimize: false }
);

RunSchema.index({ 'actor.email': 1, createdAt: -1 });

const Run = mongoose.models.Run || mongoose.model('Run', RunSchema);

module.exports = Run;
