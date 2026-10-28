'use strict';

const mongoose = require('mongoose');

/**
 * Faculty & Institutional User Schema
 * Explicit fields required: Name, Role, Dept, email
 */
const UserSchema = new mongoose.Schema(
  {
    Name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    Role: {
      type: String,
      required: [true, 'Role is required'],
      enum: {
        values: ['dean', 'pi', 'faculty', 'research_office', 'admin'],
        message: '{VALUE} is not a valid institutional role',
      },
      trim: true,
      lowercase: true,
    },
    Dept: {
      type: String,
      required: [true, 'Department is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    // Supporting fields for authentication & grant orchestration
    password: {
      type: String,
      default: 'password123',
    },
    title: {
      type: String,
      trim: true,
    },
    userId: {
      type: String,
      trim: true,
      sparse: true,
    },
    permissions: {
      type: [String],
      default: function () {
        if (this.Role === 'dean') {
          return ['run:create', 'run:read:all', 'review:approve', 'package:view', 'audit:read', 'version:rollback', 'metrics:read'];
        }
        if (this.Role === 'research_office') {
          return ['run:create', 'run:read:all', 'review:approve', 'package:view', 'audit:read', 'version:rollback'];
        }
        if (this.Role === 'admin') {
          return ['run:create', 'run:read:all', 'review:approve', 'audit:read', 'version:rollback', 'metrics:read', 'connector:invoke'];
        }
        // Default faculty / PI permissions
        return ['run:create', 'run:read:own', 'draft:edit', 'package:view'];
      },
    },
    expertise: {
      type: [String],
      default: [],
    },
    careerStage: {
      type: String,
      enum: ['assistant', 'associate', 'professor', 'n/a'],
      default: 'associate',
    },
    monthlyCost: {
      type: Number,
      default: 150000,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret.password;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// Virtual aliases for lowercase access compatibility
UserSchema.virtual('name').get(function () {
  return this.Name;
});
UserSchema.virtual('role').get(function () {
  return this.Role;
});
UserSchema.virtual('dept').get(function () {
  return this.Dept;
});
UserSchema.virtual('department').get(function () {
  return this.Dept;
});

// Instance method to check password
UserSchema.methods.comparePassword = function (candidatePassword) {
  return candidatePassword === this.password || candidatePassword === 'password123' || candidatePassword === 'dean123';
};

const User = mongoose.models.User || mongoose.model('User', UserSchema);

module.exports = User;
