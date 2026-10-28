import React, { useState } from 'react';
import { endpoints, setActorId, setToken } from '../lib/api';
import { Badge, Btn } from '../components/ui';
import { Icon } from '../components/icons';

const DEMO_ACCOUNTS = [
  {
    id: 'usr-krishnan',
    name: 'Dr. Uma Mudengudi',
    role: 'dean',
    title: 'Dean, Research & Development',
    department: 'Office of Dean R&D',
    email: 'uma.mudengudi@mist.edu.in',
    badge: 'Dean R&D (Executive)',
    tone: 'violet',
    desc: 'Accesses the Executive Dashboard, Institutional Grants Portfolio, and Final Sign-Off Gate.',
  },
  {
    id: 'usr-ananya',
    name: 'Dr. Ananya Rao',
    role: 'pi',
    title: 'Associate Professor & PI',
    department: 'Computer Science & Engineering',
    email: 'ananya.rao@mist.edu.in',
    badge: 'Faculty PI',
    tone: 'indigo',
    desc: 'Accesses the Faculty Workspace, Personal Proposals, and Smart-Matched Funding Calls.',
  },
  {
    id: 'usr-vikram',
    name: 'Dr. Vikram Sen',
    role: 'pi',
    title: 'Assistant Professor & PI',
    department: 'Materials Science',
    email: 'vikram.sen@mist.edu.in',
    badge: 'Faculty PI',
    tone: 'indigo',
    desc: 'Accesses Faculty Workspace for Materials & Nanotech research grants.',
  },
  {
    id: 'usr-meera',
    name: 'Meera Iyer',
    role: 'research_office',
    title: 'Research Office — Grants Cell',
    department: 'Research Office',
    email: 'grants.cell@mist.edu.in',
    badge: 'Grants Cell',
    tone: 'teal',
    desc: 'Assists with Institutional Compliance, Rate Cards, and Statutory Certifications.',
  },
];

export default function Login({ onLoginSuccess }) {
  const [identifier, setIdentifier] = useState('dean.rd@mist.edu.in');
  const [password, setPassword] = useState('password123');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

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

  const selectDemo = (acc) => {
    setIdentifier(acc.email);
    setPassword('password123');
    doLogin(acc.id, 'password123');
  };

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(1000px 500px at 50% -10%, #1c2744 0%, #0b1020 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 16px' }}>
      <div style={{ width: '100%', maxWidth: 840 }}>
        {/* Brand header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div className="brand-mark" style={{ width: 44, height: 44, fontSize: 16 }}>AA</div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ color: '#fff', fontSize: 20, fontWeight: 700, letterSpacing: '-0.3px' }}>apniLeap AURA</div>
              <div style={{ color: '#8fa0c4', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Research Grant Management System</div>
            </div>
          </div>
          <div style={{ color: '#a6b5d6', fontSize: 13 }}>
            Meridian Institute of Science and Technology (MIST) · Institutional Sign-In
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, 1fr)', gap: 20, background: '#fff', borderRadius: 20, boxShadow: '0 25px 60px -15px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
          {/* Left panel: Quick Institutional Switcher */}
          <div style={{ padding: '32px 28px', background: '#f8f9fc', borderRight: '1px solid #e5e8f2' }}>
            <div className="eyebrow" style={{ color: 'var(--indigo)' }}>Role-Based Access Control</div>
            <h3 style={{ margin: '6px 0 6px', fontSize: 17, color: 'var(--ink)' }}>Select an Institutional Role</h3>
            <p style={{ margin: '0 0 18px', fontSize: 12.5, color: 'var(--muted)' }}>
              Click any profile below to sign in instantly with simulated role credentials:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {DEMO_ACCOUNTS.map((acc) => (
                <div
                  key={acc.id}
                  onClick={() => selectDemo(acc)}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 12,
                    background: '#fff',
                    border: '1px solid #e1e5f0',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#4338ca';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#e1e5f0';
                    e.currentTarget.style.transform = 'none';
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontWeight: 650, fontSize: 13.5, color: 'var(--ink)' }}>{acc.name}</span>
                    <Badge tone={acc.tone}>{acc.badge}</Badge>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 4 }}>{acc.title} · {acc.department}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-2)', lineHeight: 1.35 }}>{acc.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right panel: Credentials Sign-In */}
          <div style={{ padding: '32px 28px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 18, color: 'var(--ink)' }}>Account Sign In</h3>
            <p style={{ margin: '0 0 20px', fontSize: 12.5, color: 'var(--muted)' }}>
              Log in with your university credentials
            </p>

            {error && (
              <div className="callout danger" style={{ marginBottom: 14, padding: '10px 12px' }}>
                <Icon name="alert" size={15} />
                <div style={{ fontSize: 12 }}>{error}</div>
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="field">
                <label>Institutional Email / Username</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. dean.rd@mist.edu.in"
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
                <span className="hint">Default demo password: <span className="mono">password123</span></span>
              </div>

              <Btn
                variant="primary"
                size="lg"
                type="submit"
                disabled={busy}
                style={{ marginTop: 6 }}
                icon={busy ? 'refresh' : 'check'}
              >
                {busy ? 'Authenticating…' : 'Sign In to AURA'}
              </Btn>
            </form>

            <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--line)', fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>
              <b>Notice:</b> Access is restricted to authorized Meridian Institute faculty and Research Office personnel. All system interactions are recorded in the governed audit ledger.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
