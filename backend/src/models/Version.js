'use strict';

const mongoose = require('mongoose');

/**
 * Immutable published version. Links to the run and to the authorising person.
 */
const VersionSchema = new mongoose.Schema(
  {
    versionId: { type: String, required: true, unique: true, index: true },
    runId: { type: String, required: true, index: true },
    runRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Run', index: true },
    v: { type: Number, required: true },
    status: { type: String, default: 'published' },
    checksum: { type: String, index: true },
    title: String,
    approvedBy: String,
    approvedById: String,
    approvedByEmail: { type: String, lowercase: true, trim: true },
    approvedByRef: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    restoredFrom: Number,
    bytes: Number,
    snapshot: { type: mongoose.Schema.Types.Mixed },
    at: { type: Date, default: Date.now, index: true },
  },
  { minimize: false }
);

VersionSchema.index({ runId: 1, v: -1 });

const Version = mongoose.models.Version || mongoose.model('Version', VersionSchema);

module.exports = Version;
