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

async function listProjects({ year, department, q, faculty } = {}) {
  if (ready()) {
    const filter = {};
    if (year && year !== 'all') filter.year = year;
    if (department && department !== 'all') filter.department = department;

    const conditions = [];

    if (q) {
      const qReg = new RegExp(String(q).trim(), 'i');
      conditions.push({ $or: [{ title: qReg }, { agency: qReg }, { pi: qReg }, { coPIs: qReg }, { department: qReg }] });
    }

    if (faculty) {
      // Strip honorifics (Dr., Prof., Mr., Mrs.) and match PI or Co-PI
      const cleanName = String(faculty).replace(/^(Dr\.|Prof\.|Mr\.|Mrs\.|Ms\.)\s*/i, '').trim();
      if (cleanName) {
        const facReg = new RegExp(cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        conditions.push({ $or: [{ pi: facReg }, { coPIs: facReg }] });
      }
    }

    if (conditions.length === 1) {
      Object.assign(filter, conditions[0]);
    } else if (conditions.length > 1) {
      filter.$and = conditions;
    }

    const docs = await Project.find(filter).sort({ year: -1, projectId: 1 }).lean();
    if (docs.length || year || department || q || faculty) {
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

  // Memory fallback if MongoDB offline
  return PROJECTS.filter((p) => {
    const matchYear = !year || year === 'all' || p.year === year;
    const matchDept = !department || department === 'all' || p.department === department;
    const matchQ = !q || `${p.title} ${p.agency} ${p.pi.join(' ')} ${p.department}`.toLowerCase().includes(String(q).toLowerCase());
    let matchFac = true;
    if (faculty) {
      const clean = String(faculty).replace(/^(Dr\.|Prof\.|Mr\.|Mrs\.|Ms\.)\s*/i, '').toLowerCase().trim();
      const allPeople = [...(p.pi || []), ...(p.coPIs || [])].join(' ').toLowerCase();
      matchFac = allPeople.includes(clean);
    }
    return matchYear && matchDept && matchQ && matchFac;
  });
}

/**
 * Fetch all institutional faculty directly from MongoDB User collection via Mongoose ORM.
 * Never reads from static files.
 */
async function getFacultiesFromDB() {
  if (ready()) {
    try {
      const faculties = await database.User.find(
        {
          Role: { $in: ['faculty', 'pi', 'dean'] },
          isActive: { $ne: false },
        },
        { Name: 1, Dept: 1, email: 1, Role: 1, userId: 1, title: 1 }
      )
        .sort({ Name: 1 })
        .lean();

      if (faculties.length) {
        return faculties.map((f) => ({
          id: f.userId || String(f._id),
          _id: String(f._id),
          Name: f.Name,
          name: f.Name,
          Role: f.Role,
          Dept: f.Dept,
          department: f.Dept,
          email: f.email,
          title: f.title,
        }));
      }
    } catch (err) {
      console.warn('[MongoDB] getFacultiesFromDB error:', err.message);
    }
  }
  return [];
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

module.exports = { seedProjects, listProjects, getProject, saveBudget, summary, normalizeBudget, getFacultiesFromDB, YEARS, DEPARTMENTS };
