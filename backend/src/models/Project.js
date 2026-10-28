'use strict';

const mongoose = require('mongoose');

/** Sanctioned institutional project. All listed projects are approved. */
const ProjectSchema = new mongoose.Schema(
  {
    projectId: { type: String, required: true, unique: true, index: true },
    year: { type: String, required: true, index: true },
    department: { type: String, required: true, index: true },
    title: { type: String, required: true },
    pi: { type: [String], default: [] },
    coPIs: { type: [String], default: [] },
    agency: { type: String, required: true },
    amountLakh: { type: Number, default: 0 },
    amountNote: String,
    approved: { type: Boolean, default: true },
    status: { type: String, default: 'approved' },
    // Faculty-owned budget: [{ requirement, cost }] in rupees.
    budgetLines: {
      type: [{ requirement: String, cost: Number }],
      default: [],
    },
    budgetTotal: { type: Number, default: 0 },
    budgetUpdatedBy: String,
    budgetUpdatedAt: Date,
  },
  { timestamps: true },
);

const Project = mongoose.models.Project || mongoose.model('Project', ProjectSchema);

module.exports = Project;
