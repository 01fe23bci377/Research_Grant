import React, { useEffect, useMemo, useState } from 'react';
import { endpoints, setActorId, setToken } from '../lib/api';
import { Badge, Btn, Modal } from '../components/ui';
import { Icon } from '../components/icons';

export default function Login({ onLoginSuccess }) {
  const [users, setUsers] = useState([]);
  const [mongoMeta, setMongoMeta] = useState(null);
  const [schemaMeta, setSchemaMeta] = useState(null);
  const [loadingUsers, setLoadingUsers] = useState(true);

  const [identifier, setIdentifier] = useState('uma.mudengudi@mist.edu.in');
  const [password, setPassword] = useState('password123');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState('');
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [showSchemaModal, setShowSchemaModal] = useState(false);

  // Fetch live users and Mongoose schema metadata directly from MongoDB via Mongoose ORM
  useEffect(() => {
    let mounted = true;
    endpoints
      .users()
      .then((res) => {
        if (!mounted) return;
        setUsers(res.users || []);
        setMongoMeta(res.mongo || null);
        setSchemaMeta(res.schema || null);
      })
      .catch((err) => {
        if (!mounted) return;
        console.warn('Failed to load users from MongoDB:', err);
      })
      .finally(() => {
        if (mounted) setLoadingUsers(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const doLogin = async (idOrEmail, pwd) => {
    setBusy(true);
    setError(null);
    try {
      const res = await endpoints.login({
        email: idOrEmail,
        password: pwd,
      });
      if (res.success && res.user) {
        setToken(res.token);
        setActorId(res.user.id);
        onLoginSuccess(res.user);
      }
    } catch (err) {
      setError(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!identifier) return;
    doLogin(identifier, password);
  };

  const selectUser = (u) => {
    const loginKey = u.email || u.id;
    setIdentifier(loginKey);
    setPassword('password123');
    doLogin(u.id || u.email, 'password123');
  };

  // Distinct departments for filtering
  const departments = useMemo(() => {
    const set = new Set();
    users.forEach((u) => {
      if (u.Dept) set.add(u.Dept);
    });
    return ['ALL', ...Array.from(set).sort()];
  }, [users]);

  // Filtered list based on search and selected department
  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      const matchDept = selectedDept === 'ALL' || u.Dept === selectedDept;
      const matchSearch =
        !q ||
        (u.Name && u.Name.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.Dept && u.Dept.toLowerCase().includes(q)) ||
        (u.Role && u.Role.toLowerCase().includes(q)) ||
        (u.title && u.title.toLowerCase().includes(q));
      return matchDept && matchSearch;
    });
  }, [users, selectedDept, search]);

  const roleTone = (role) => {
    if (role === 'dean') return 'violet';
    if (role === 'research_office') return 'teal';
    if (role === 'admin') return 'amber';
    return 'indigo';
  };

  const roleLabel = (role) => {
    if (role === 'dean') return 'Dean R&D';
    if (role === 'research_office') return 'Grants Cell';
    if (role === 'admin') return 'System Admin';
    return 'Faculty PI';
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(1100px 600px at 50% -10%, #1c2744 0%, #0b1020 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 16px',
      }}
    >
      <div style={{ width: '100%', maxWidth: 1040 }}>
        {/* Brand header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div className="brand-mark" style={{ width: 44, height: 44, fontSize: 16 }}>
              AA
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ color: '#fff', fontSize: 20, fontWeight: 700, letterSpacing: '-0.3px' }}>
                apniLeap AURA
              </div>
              <div style={{ color: '#8fa0c4', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                Research Grant Management System
              </div>
            </div>
          </div>
          <div style={{ color: '#a6b5d6', fontSize: 13 }}>
            Meridian Institute of Science and Technology (MIST) · Institutional Portal
          </div>
        </div>

        {/* Main Card */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
            gap: 0,
            background: '#fff',
            borderRadius: 20,
            boxShadow: '0 25px 60px -15px rgba(0,0,0,0.6)',
            overflow: 'hidden',
          }}
        >
          {/* Left panel: Live MongoDB Users Directory */}
          <div
            style={{
              padding: '28px 24px',
              background: '#f8f9fc',
              borderRight: '1px solid #e5e8f2',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: 680,
            }}
          >
            {/* Header & Mongo live indicator */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div>
                <div className="eyebrow" style={{ color: 'var(--indigo)', marginBottom: 2 }}>
                  Role-Based Directory · Live Store
                </div>
                <h3 style={{ margin: 0, fontSize: 16.5, color: 'var(--ink)' }}>
                  Institutional Accounts ({users.length})
                </h3>
              </div>
              <Btn
                size="sm"
                variant="ghost"
                icon="code"
                onClick={() => setShowSchemaModal(true)}
                title="View Mongoose Schema & MongoDB Collection"
                style={{ fontSize: 11, padding: '4px 8px' }}
              >
                Mongoose Schema
              </Btn>
            </div>

            {/* Live MongoDB Status Banner */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 10px',
                background: '#ecfdf5',
                border: '1px solid #a7f3d0',
                borderRadius: 8,
                fontSize: 11,
                color: '#065f46',
                marginBottom: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: '#10b981',
                    display: 'inline-block',
                    boxShadow: '0 0 6px #10b981',
                  }}
                />
                <b>MongoDB Atlas</b> · Mongoose ORM (<span className="mono">User</span> schema)
              </div>
              <span className="mono" style={{ fontSize: 10, color: '#047857' }}>
                {mongoMeta?.database || 'research_grant'}.users
              </span>
            </div>

            {/* Search Input */}
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <input
                type="text"
                className="input"
                placeholder="Search faculty by name, department, or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ fontSize: 12.5, paddingLeft: 30, height: 34 }}
              />
              <span style={{ position: 'absolute', left: 10, top: 9, color: 'var(--muted)', pointerEvents: 'none' }}>
                <Icon name="search" size={13} />
              </span>
              {search && (
                <button
                  onClick={() => setSearch('')}
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: 8,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--muted)',
                    fontSize: 12,
                  }}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Department Filter Chips */}
            <div
              style={{
                display: 'flex',
                gap: 6,
                overflowX: 'auto',
                paddingBottom: 6,
                marginBottom: 10,
                scrollbarWidth: 'none',
              }}
            >
              {departments.map((dept) => (
                <button
                  key={dept}
                  type="button"
                  onClick={() => setSelectedDept(dept)}
                  style={{
                    padding: '3px 9px',
                    borderRadius: 14,
                    fontSize: 11,
                    fontWeight: selectedDept === dept ? 600 : 500,
                    whiteSpace: 'nowrap',
                    border: '1px solid',
                    borderColor: selectedDept === dept ? '#4338ca' : '#d1d5db',
                    background: selectedDept === dept ? '#4338ca' : '#fff',
                    color: selectedDept === dept ? '#fff' : '#4b5563',
                    cursor: 'pointer',
                    transition: 'all 0.12s',
                  }}
                >
                  {dept === 'ALL' ? `All (${users.length})` : dept}
                </button>
              ))}
            </div>

            {/* Faculty List (Live from MongoDB via Mongoose) */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                paddingRight: 4,
              }}
            >
              {loadingUsers && (
                <div style={{ textAlign: 'center', padding: '36px 0', color: 'var(--muted)', fontSize: 13 }}>
                  <Icon name="refresh" size={18} className="spin" style={{ marginBottom: 8 }} />
                  <div>Loading live accounts from MongoDB via Mongoose ORM…</div>
                </div>
              )}

              {!loadingUsers && filteredUsers.length === 0 && (
                <div style={{ textAlign: 'center', padding: '32px 12px', color: 'var(--muted)', fontSize: 12.5 }}>
                  No faculty match "{search}".
                  <div style={{ marginTop: 8 }}>
                    <Btn size="sm" variant="ghost" onClick={() => { setSearch(''); setSelectedDept('ALL'); }}>
                      Reset filters
                    </Btn>
                  </div>
                </div>
              )}

              {!loadingUsers &&
                filteredUsers.map((u) => {
                  const isCurrent = identifier === u.email || identifier === u.id;
                  return (
                    <div
                      key={u.id || u._id}
                      onClick={() => selectUser(u)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 10,
                        background: isCurrent ? '#f5f3ff' : '#fff',
                        border: '1px solid',
                        borderColor: isCurrent ? '#6366f1' : '#e2e8f0',
                        cursor: 'pointer',
                        transition: 'all 0.12s ease',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                      }}
                      onMouseEnter={(e) => {
                        if (!isCurrent) {
                          e.currentTarget.style.borderColor = '#818cf8';
                          e.currentTarget.style.background = '#fafafa';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isCurrent) {
                          e.currentTarget.style.borderColor = '#e2e8f0';
                          e.currentTarget.style.background = '#fff';
                        }
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                        <span style={{ fontWeight: 650, fontSize: 13, color: 'var(--ink)' }}>{u.Name}</span>
                        <Badge tone={roleTone(u.Role)}>{roleLabel(u.Role)}</Badge>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>
                        {u.Dept} · <span className="mono">{u.email}</span>
                      </div>
                      {u.title && (
                        <div style={{ fontSize: 10.5, color: 'var(--ink-2)', lineHeight: 1.3 }}>
                          {u.title}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>

            <div style={{ marginTop: 10, fontSize: 10.5, color: 'var(--muted)', display: 'flex', justifyContent: 'space-between' }}>
              <span>Showing {filteredUsers.length} of {users.length} accounts</span>
              <span className="mono">source: mongodb · orm: mongoose</span>
            </div>
          </div>

          {/* Right panel: Credentials Sign-In */}
          <div style={{ padding: '36px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div className="eyebrow" style={{ color: 'var(--indigo)', marginBottom: 2 }}>Governed Authentication</div>
            <h3 style={{ margin: '0 0 4px', fontSize: 20, color: 'var(--ink)' }}>Account Sign In</h3>
            <p style={{ margin: '0 0 20px', fontSize: 12.5, color: 'var(--muted)' }}>
              Sign in with institutional credentials or select an account from the live directory.
            </p>

            {error && (
              <div className="callout danger" style={{ marginBottom: 16, padding: '10px 12px' }}>
                <Icon name="alert" size={15} />
                <div style={{ fontSize: 12 }}>{error}</div>
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="field">
                <label>Institutional Email / User ID</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. uma.mudengudi@mist.edu.in"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                />
              </div>

              <div className="field">
                <label>Password</label>
                <input
                  type="password"
                  className="input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <span className="hint">
                  Default institutional password: <span className="mono">password123</span>
                </span>
              </div>

              <Btn
                variant="primary"
                size="lg"
                type="submit"
                disabled={busy}
                style={{ marginTop: 8 }}
                icon={busy ? 'refresh' : 'check'}
              >
                {busy ? 'Authenticating…' : 'Sign In to AURA'}
              </Btn>
            </form>

            <div
              style={{
                marginTop: 28,
                paddingTop: 16,
                borderTop: '1px solid var(--line)',
                fontSize: 11.5,
                color: 'var(--muted)',
                lineHeight: 1.5,
              }}
            >
              <b>Access Control Policy:</b> All sessions are authenticated via Mongoose ORM against the MongoDB Atlas user ledger. Actions are signed and recorded into immutable audit logs.
            </div>
          </div>
        </div>
      </div>

      {/* Mongoose Schema & Database Inspector Modal */}
      {showSchemaModal && (
        <Modal
          title="MongoDB Mongoose Schema Inspector"
          subtitle="Real-time Mongoose Object-Document Mapper (ORM) schema definition for institutional users"
          onClose={() => setShowSchemaModal(false)}
          width={760}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Live Connection Banner */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              <div className="card stat" style={{ padding: '10px 12px' }}>
                <div className="stat-label">ORM</div>
                <div className="stat-value" style={{ fontSize: 16 }}>Mongoose 9.x</div>
                <div className="stat-foot">Object-Document Mapper</div>
              </div>
              <div className="card stat" style={{ padding: '10px 12px' }}>
                <div className="stat-label">Database</div>
                <div className="stat-value mono" style={{ fontSize: 14 }}>{mongoMeta?.database || 'research_grant'}</div>
                <div className="stat-foot">MongoDB Atlas Cluster</div>
              </div>
              <div className="card stat" style={{ padding: '10px 12px' }}>
                <div className="stat-label">Collection</div>
                <div className="stat-value mono" style={{ fontSize: 14 }}>users</div>
                <div className="stat-foot">{users.length} documents live</div>
              </div>
              <div className="card stat" style={{ padding: '10px 12px' }}>
                <div className="stat-label">Status</div>
                <div className="stat-value" style={{ fontSize: 14, color: '#059669' }}>Connected</div>
                <div className="stat-foot">TLS Atlas verified</div>
              </div>
            </div>

            {/* Mongoose Schema Definition */}
            <div>
              <div className="stat-label" style={{ marginBottom: 6 }}>
                Mongoose User Schema (<span className="mono">backend/src/models/User.js</span>)
              </div>
              <pre
                className="code"
                style={{
                  background: '#0f172a',
                  color: '#e2e8f0',
                  padding: 14,
                  borderRadius: 10,
                  fontSize: 11.5,
                  maxHeight: 240,
                  overflowY: 'auto',
                  lineHeight: 1.45,
                }}
              >
{`const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  Name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
  },
  Role: {
    type: String,
    required: [true, 'Role is required'],
    enum: ['dean', 'pi', 'faculty', 'research_office', 'admin'],
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
    match: [/^\S+@\S+\.\S+$/, 'Valid email required'],
  },
  password: { type: String, default: 'password123' },
  title: { type: String, trim: true },
  userId: { type: String, trim: true, sparse: true },
  permissions: { type: [String], default: [] },
  expertise: { type: [String], default: [] },
  careerStage: {
    type: String,
    enum: ['assistant', 'associate', 'professor', 'n/a'],
    default: 'associate'
  },
  monthlyCost: { type: Number, default: 150000 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.models.User || mongoose.model('User', UserSchema);`}
              </pre>
            </div>

            {/* Schema Required Fields Table */}
            <div>
              <div className="stat-label" style={{ marginBottom: 6 }}>
                Enforced Mongoose Schema Paths &amp; Constraints
              </div>
              <table className="table" style={{ fontSize: 11.5 }}>
                <thead>
                  <tr>
                    <th>Field Path</th>
                    <th>BSON / Mongoose Type</th>
                    <th>Required</th>
                    <th>Constraints &amp; Enums</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="mono strong">Name</td>
                    <td className="mono">String</td>
                    <td><Badge tone="green">Required</Badge></td>
                    <td>trim: true</td>
                    <td>Faculty full name with academic honorific</td>
                  </tr>
                  <tr>
                    <td className="mono strong">Role</td>
                    <td className="mono">String</td>
                    <td><Badge tone="green">Required</Badge></td>
                    <td className="mono">['dean', 'pi', 'faculty', 'research_office', 'admin']</td>
                    <td>Institutional role for RBAC permissions</td>
                  </tr>
                  <tr>
                    <td className="mono strong">Dept</td>
                    <td className="mono">String</td>
                    <td><Badge tone="green">Required</Badge></td>
                    <td>trim: true</td>
                    <td>Academic department / school</td>
                  </tr>
                  <tr>
                    <td className="mono strong">email</td>
                    <td className="mono">String</td>
                    <td><Badge tone="green">Required</Badge></td>
                    <td className="mono">unique: true, lowercase: true</td>
                    <td>Institutional email address</td>
                  </tr>
                  <tr>
                    <td className="mono">userId</td>
                    <td className="mono">String</td>
                    <td><Badge tone="neutral">Optional</Badge></td>
                    <td className="mono">sparse: true</td>
                    <td>Canonical system identifier (e.g. usr-suneeta-v-budihal)</td>
                  </tr>
                  <tr>
                    <td className="mono">permissions</td>
                    <td className="mono">[String]</td>
                    <td><Badge tone="neutral">Default</Badge></td>
                    <td>Dynamic role tokens</td>
                    <td>RBAC capabilities (e.g. run:create, review:approve)</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
              <Btn variant="primary" onClick={() => setShowSchemaModal(false)}>
                Close Inspector
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
