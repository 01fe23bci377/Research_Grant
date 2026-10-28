'use strict';

const mongoose = require('mongoose');
const User = require('./User');
const Project = require('./Project');
const Run = require('./Run');
const AuditEvent = require('./AuditEvent');
const Version = require('./Version');
const Faculty = require('./Faculty');

module.exports = {
  mongoose,
  User,
  Project,
  Run,
  AuditEvent,
  Version,
  Faculty,
};

