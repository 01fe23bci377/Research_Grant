'use strict';

const database = require('./database');
const Project = require('./models/Project');
const { PROJECTS, YEARS, DEPARTMENTS } = require('./projects');

const ready = () => database.isConnected();

function normalizeBudget(lines = []) {
  return lines
    .map((l) => ({
      requirement: String(l.requirement || '').trim(),
      cost: Math.max(0, Math.round(Number(l.cost) || 0)),
    }))
    .filter((l) => l.requirement && l.cost > 0);
}

async function seedProjects() {
  if (!ready()) return { seeded: false, count: PROJECTS.length };
  let upserted = 0;
  for (const p of PROJECTS) {
    const res = await Project.updateOne(
      { projectId: p.id },
      {
        $setOnInsert: {
          projectId: p.id,
          year: p.year,
          department: p.department,
          title: p.title,
          pi: p.pi,
          coPIs: p.coPIs || [],
          agency: p.agency,
          amountLakh: p.amountLakh,
          amountNote: p.amountNote,
          approved: true,
          status: 'approved',
          budgetLines: [],
          budgetTotal: 0,
        },
      },
      { upsert: true },
    );
    if (res.upsertedCount) upserted += 1;
  }
  return { seeded: true, count: PROJECTS.length, upserted };
}

async function listProjects({ year, department, q } = {}) {
  if (ready()) {
    const filter = {};
    if (year) filter.year = year;
    if (department) filter.department = department;
    if (q) filter.$or = [{ title: new RegExp(q, 'i') }, { agency: new RegExp(q, 'i') }, { pi: new RegExp(q, 'i') }];
    const docs = await Project.find(filter).sort({ year: -1, projectId: 1 }).lean();
    if (docs.length) {
      return docs.map((d) => ({
        id: d.projectId,
        year: d.year,
        department: d.department,
        title: d.title,
        pi: d.pi,
        coPIs: d.coPIs,
        agency: d.agency,
        amountLakh: d.amountLakh,
        amountNote: d.amountNote,
        approved: true,
        status: 'approved',
        budgetLines: d.budgetLines || [],
        budgetTotal: d.budgetTotal || 0,
        budgetUpdatedBy: d.budgetUpdatedBy,
        budgetUpdatedAt: d.budgetUpdatedAt,
      }));
    }
  }
  return PROJECTS.filter((p) => (!year || p.year === year) && (!department || p.department === department) && (!q || `${p.title} ${p.agency} ${p.pi.join(' ')}`.toLowerCase().includes(String(q).toLowerCase())));
}

async function getProject(id) {
  if (ready()) {
    const d = await Project.findOne({ projectId: id }).lean();
    if (d) {
      return {
        id: d.projectId, year: d.year, department: d.department, title: d.title,
        pi: d.pi, coPIs: d.coPIs, agency: d.agency, amountLakh: d.amountLakh,
        amountNote: d.amountNote, approved: true, status: 'approved',
        budgetLines: d.budgetLines || [], budgetTotal: d.budgetTotal || 0,
        budgetUpdatedBy: d.budgetUpdatedBy, budgetUpdatedAt: d.budgetUpdatedAt,
      };
    }
  }
  return PROJECTS.find((p) => p.id === id) || null;
}

async function saveBudget(id, lines, actor) {
  const clean = normalizeBudget(lines);
  const total = clean.reduce((a, l) => a + l.cost, 0);
  if (ready()) {
    const res = await Project.updateOne(
      { projectId: id },
      {
        $set: {
          budgetLines: clean,
          budgetTotal: total,
          budgetUpdatedBy: actor ? actor.name : 'faculty',
          budgetUpdatedAt: new Date(),
        },
      },
    );
    if (!res.matchedCount) {
      const err = new Error('Project not found');
      err.status = 404;
      throw err;
    }
  }
  const project = await getProject(id);
  return { project, total };
}

async function summary() {
  const projects = await listProjects();
  const totalLakh = projects.reduce((a, p) => a + (Number(p.amountLakh) || 0), 0);
  const byYear = {};
  for (const p of projects) {
    byYear[p.year] = byYear[p.year] || { count: 0, amountLakh: 0 };
    byYear[p.year].count += 1;
    byYear[p.year].amountLakh += Number(p.amountLakh) || 0;
  }
  return {
    count: projects.length,
    approved: projects.length,
    totalLakh: Math.round(totalLakh * 1000) / 1000,
    agencies: [...new Set(projects.map((p) => p.agency))].length,
    departments: [...new Set(projects.map((p) => p.department))].length,
    years: YEARS,
    byYear,
  };
}

module.exports = { seedProjects, listProjects, getProject, saveBudget, summary, normalizeBudget, YEARS, DEPARTMENTS };
