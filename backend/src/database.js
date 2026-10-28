'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const { facultyUsers } = require('./faculty');

// Atlas cluster for the AURA grant system. Override with MONGODB_URI in .env.
const DEFAULT_URI = 'mongodb+srv://mnag7278:mnag7278@cluster-pro.g8el1ce.mongodb.net/research_grant?retryWrites=true&w=majority';

const SEED_USERS = [
  {
    Name: 'Dr. Uma Mudengudi', Role: 'dean', Dept: 'Office of Dean R&D',
    email: 'uma.mudengudi@mist.edu.in', title: 'Dean, Research & Development',
    userId: 'usr-krishnan', password: 'password123',
    permissions: ['run:create', 'run:read:all', 'review:approve', 'package:view', 'audit:read', 'version:rollback', 'metrics:read'],
  },
  ...facultyUsers().map((f) => ({
    Name: f.name, Role: 'faculty', Dept: f.department, email: f.email,
    title: f.title || 'Faculty Member', userId: f.id, password: 'password123',
    permissions: f.permissions,
  })),
  {
    Name: 'Research & Development Office', Role: 'research_office', Dept: 'Office of Dean R&D',
    email: 'grants.cell@mist.edu.in', title: 'Grants Cell & Compliance',
    userId: 'usr-research-office', password: 'password123',
    permissions: ['run:create', 'run:read:all', 'review:approve', 'package:view', 'audit:read', 'version:rollback'],
  },
  {
    Name: 'Platform Administrator', Role: 'admin', Dept: 'Central IT',
    email: 'admin@mist.edu.in', title: 'AURA Platform Administrator',
    userId: 'usr-admin', password: 'password123',
    permissions: ['run:create', 'run:read:all', 'review:approve', 'audit:read', 'version:rollback', 'metrics:read', 'connector:invoke'],
  },
];

let isConnected = false;
let connectedAt = null;
let lastError = null;

async function connectDB() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || DEFAULT_URI;
  if (!uri || uri.includes('<db_password>')) {
    lastError = 'MONGODB_URI still contains a placeholder';
    console.log('[MongoDB]', lastError, '— using in-memory fallback.');
    return false;
  }

  try {
    mongoose.set('strictQuery', false);
    await mongoose.connect(uri, {
      dbName: process.env.MONGODB_DB || 'research_grant',
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
    });
    isConnected = true;
    connectedAt = new Date().toISOString();
    lastError = null;
    console.log(`[MongoDB] Connected to ${mongoose.connection.host}/${mongoose.connection.name}`);

    // Retire any legacy dummy users (Ananya Rao, Vikram Sen, Meera Iyer) and old duplicate domains.
    await User.deleteMany({
      $or: [
        { userId: { $in: ['usr-ananya', 'usr-vikram', 'usr-meera'] } },
        { email: { $in: ['ananya.rao@mist.edu.in', 'vikram.sen@mist.edu.in'] } },
        { email: { $regex: /@kletech\.ac\.in$/i } },
        { Name: { $regex: /ananya|vikram|meera\s*iyer/i } },
      ],
    }).catch(() => {});

    // Upsert institutional people so every actor/approver has a linked user row.
    // Existing rows are updated in place (e.g. a renamed Dean) by userId.
    let inserted = 0;
    for (const u of SEED_USERS) {
      const email = u.email.toLowerCase();
      const existing = await User.findOne({ $or: [{ userId: u.userId }, { email }] });
      if (existing) {
        await User.updateOne(
          { _id: existing._id },
          { $set: { Name: u.Name, Role: u.Role, Dept: u.Dept, email, title: u.title, userId: u.userId } },
        );
      } else {
        await User.create({ ...u, email });
        inserted += 1;
      }
    }
    console.log(`[MongoDB] User collection ready (inserted ${inserted}, updated/kept ${SEED_USERS.length - inserted}).`);
    await User.syncIndexes().catch(() => {});
    return true;
  } catch (err) {
    lastError = err.message;
    isConnected = false;
    console.warn(`[MongoDB] Connection notice: ${err.message}. Running with the local file store as fallback.`);
    return false;
  }
}

async function findUserByIdOrEmail(identifier) {
  if (!identifier) return null;
  const raw = String(identifier).trim();
  const idStr = raw.toLowerCase();

  if (isConnected) {
    try {
      const user = await User.findOne({
        $or: [
          { email: idStr },
          { userId: raw },
          { Name: new RegExp(`^${idStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        ],
      });
      if (user) return user;
    } catch {
      // fall through to memory
    }
  }

  return SEED_USERS.find(
    (u) => u.email.toLowerCase() === idStr || u.userId === raw || u.Name.toLowerCase() === idStr,
  ) || null;
}

async function getAllUsers() {
  if (isConnected) {
    try {
      const users = await User.find({ isActive: true }).sort({ Role: 1, Name: 1 });
      if (users.length) return users;
    } catch {
      // fall through
    }
  }
  return SEED_USERS;
}

function status() {
  return {
    configured: Boolean(process.env.MONGODB_URI || DEFAULT_URI),
    connected: isConnected,
    database: mongoose.connection?.name || process.env.MONGODB_DB || 'research_grant',
    host: mongoose.connection?.host || null,
    connectedAt,
    error: lastError,
    collections: ['users', 'runs', 'audit_events', 'versions'],
  };
}

module.exports = {
  connectDB,
  User,
  findUserByIdOrEmail,
  getAllUsers,
  SEED_USERS,
  isConnected: () => isConnected,
  status,
  mongoose,
};
