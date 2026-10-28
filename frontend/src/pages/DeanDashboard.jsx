import React, { useEffect, useState } from 'react';
import { endpoints } from '../lib/api';
import { compactMoney, date, money, pct, statusMeta, timeAgo } from '../lib/format';
import { useApp } from '../App';
import { Badge, Btn, Card, EmptyState, Modal, Progress, Stat, StatusPill, Table, useToast } from '../components/ui';
import { Icon } from '../components/icons';

export default function DeanDashboard() {
  const { navigate, bootstrap, actor, refreshBootstrap } = useApp();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [runs, setRuns] = useState(null);
  const [audit, setAudit] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [decision, setDecision] = useState('approve');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const loadData = () => {
    Promise.all([endpoints.metrics(), endpoints.runs(), endpoints.audit('?limit=8')])
      .then(([m, r, a]) => {
        setData(m);
        setRuns(r.runs);
        setAudit(a.events);
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadData();
    const id = setInterval(loadData, 4500);
    return () => clearInterval(id);
  }, []);

  if (!data || !runs) {
    return (
      <div className="grid g4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card skel" style={{ height: 112 }} />
        ))}
      </div>
    );
  }

  const awaiting = runs.filter((r) => r.status === 'awaiting_review');
  const published = runs.filter((r) => r.status === 'published');
  const activeRuns = runs.filter((r) => !['published', 'rejected'].includes(r.status));
  const upcoming = data.upcoming || [];

  const handleReviewSubmit = async () => {
    if (!selectedRun) return;
    setBusy(true);
    try {
      await endpoints.review(selectedRun.id, { decision, notes });
      toast.push(
        decision === 'approve'
          ? `Proposal ${selectedRun.id} authorized and published.`
          : decision === 'reject'
          ? `Proposal ${selectedRun.id} rejected.`
          : 'Corrections routed back to the owning agent.',
        'ok'
      );
      setSelectedRun(null);
      setNotes('');
      loadData();
      refreshBootstrap();
    } catch (err) {
      toast.push(err.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="hero-band" style={{ marginBottom: 16, background: 'radial-gradient(900px 300px at 95% -20%, rgba(99, 102, 241, 0.45), transparent 60%), linear-gradient(130deg, #181c30, #0c1022 70%)' }}>
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span className="badge violet lg" style={{ background: 'rgba(139, 92, 246, 0.25)', color: '#c4b5fd', borderColor: '#7c3aed' }}>
                <Icon name="shield" size={13} /> Dean R&amp;D Executive View
              </span>
              <span style={{ fontSize: 11.5, color: '#94a3b8' }}>Institutional Portfolio Governance</span>
            </div>
            <h2 style={{ marginTop: 6, fontSize: 22 }}>
              Institute Grants Executive Overview &amp; Authority Gate
            </h2>
            <p style={{ color: '#cbd5e1', fontSize: 13, maxWidth: 640 }}>
              Welcome, <b>{actor?.name}</b>. As Dean, Research &amp; Development, you hold the final submission authority for all institutional grant packages under Lab 12 governance.
            </p>
            <div className="hero-actions" style={{ marginTop: 14 }}>
              <Btn
                variant="primary"
                icon="shield"
                onClick={() => navigate('/governance')}
                style={{ background: 'linear-gradient(180deg, #6366f1, #4338ca)' }}
              >
                Sign-off Queue ({awaiting.length} pending)
              </Btn>
              <Btn
                style={{ background: 'rgba(255,255,255,.08)', borderColor: 'rgba(255,255,255,.2)', color: '#fff' }}
                icon="layers"
                onClick={() => navigate('/platform')}
              >
                Platform &amp; Connector
              </Btn>
              <Btn
                style={{ background: 'rgba(255,255,255,.08)', borderColor: 'rgba(255,255,255,.2)', color: '#fff' }}
                icon="activity"
                onClick={() => navigate('/audit')}
              >
                Audit Trail
              </Btn>
            </div>
          </div>
          <div className="hero-meta" style={{ gap: 24 }}>
            <div>Active Pipeline<b>{activeRuns.length}</b></div>
            <div>Awaiting Sign-off<b>{data.totals.awaitingReview}</b></div>
            <div>Approved Releases<b>{data.totals.published}</b></div>
            <div>Compliance Pass<b>{pct(data.rates.compliancePassRate)}</b></div>
          </div>
        </div>
      </section>

      {/* KPI Stats */}
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Stat
          label="Total Pipeline Volume"
          value={activeRuns.length ? compactMoney(activeRuns.reduce((acc, r) => acc + Number(String(r.budget || '0').replace(/[^0-9]/g, '')), 0)) : '₹0'}
          foot="Requested across active runs"
          icon="coins"
          tone="indigo"
        />
        <Stat
          label="Awaiting Dean Sign-off"
          value={data.totals.awaitingReview}
          foot={awaiting.length ? 'Urgent action items pending' : 'Queue all clear'}
          icon="clock"
          tone={awaiting.length ? 'amber' : 'green'}
        />
        <Stat
          label="Published &amp; Approved"
          value={data.totals.published}
          foot={`${data.totals.versions} versioned releases`}
          icon="checkCircle"
          tone="green"
        />
        <Stat
          label="Institutional Compliance"
          value={pct(data.rates.compliancePassRate)}
          foot={`${data.totals.toolCalls} governed audits`}
          icon="shield"
          tone="teal"
        />
      </div>

      {/* Pending Approval Gate Alert Banner */}
      {awaiting.length > 0 && (
        <Card
          title="Sign-off Required — Pending Human Authority Gate (Order 7)"
          subtitle="Proposals have passed SDLC acceptance test suites and await Dean R&D authorization."
          style={{ marginBottom: 16, borderColor: '#f59e0b', background: '#fffdfa' }}
          padded={false}
        >
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Run ID</th>
                  <th>Proposal Title</th>
                  <th>Funding Agency &amp; Call</th>
                  <th className="right">Requested Budget</th>
                  <th className="right">Evidence</th>
                  <th className="right" style={{ width: 180 }}>Sign-Off Action</th>
                </tr>
              </thead>
              <tbody>
                {awaiting.map((r) => (
                  <tr key={r.id}>
                    <td><span className="mono strong">{r.id}</span></td>
                    <td>
                      <div className="strong" style={{ fontSize: 13 }}>{r.title}</div>
                      <div className="tiny" style={{ color: 'var(--muted)' }}>PI: {r.actor?.name || 'Dr. Ananya Rao'} · {r.domain}</div>
                    </td>
                    <td>
                      <Badge tone="indigo">{r.call?.agency || 'Government'}</Badge>
                      <div className="tiny" style={{ marginTop: 2 }}>{r.call?.program || 'Statutory Grant'}</div>
                    </td>
                    <td className="right"><span className="num strong">{r.budget || '—'}</span></td>
                    <td className="right">
                      <span className="num" style={{ color: 'var(--green)' }}>{pct(r.coverage || 100)}</span>
                    </td>
                    <td className="right">
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <Btn size="sm" variant="ghost" icon="eye" onClick={() => navigate(`/runs/${r.id}`)}>
                          Inspect
                        </Btn>
                        <Btn
                          size="sm"
                          variant="primary"
                          icon="shield"
                          onClick={() => {
                            setSelectedRun(r);
                            setDecision('approve');
                            setNotes('Reviewed budget ceilings and statutory compliance. Approved for submission.');
                          }}
                        >
                          Review &amp; Authorize
                        </Btn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Main Grid: All Institutional Runs & Deadlines */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.65fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
        <Card
          title="All Institutional Grant Proposals"
          subtitle="Cross-departmental pipeline visibility (Computer Science, Materials, Biotechnology)"
          padded={false}
          actions={
            <Btn size="sm" variant="ghost" iconRight="arrowRight" onClick={() => navigate('/runs')}>
              All runs ({runs.length})
            </Btn>
          }
        >
          <Table
            columns={[
              { key: 'id', label: 'Run', width: 110, render: (r) => <span className="id">{r.id}</span> },
              {
                key: 'title',
                label: 'Proposal & PI',
                render: (r) => (
                  <>
                    <div className="row-title">{r.title}</div>
                    <div className="row-sub">
                      PI: {r.actor?.name || 'Faculty'} · {r.call ? `${r.call.agency} (${r.call.program})` : 'Call matching'}
                    </div>
                  </>
                ),
              },
              { key: 'status', label: 'Status', render: (r) => <StatusPill status={r.status} /> },
              { key: 'budget', label: 'Budget', align: 'right', render: (r) => <span className="num">{r.budget || '—'}</span> },
              { key: 'updatedAt', label: 'Updated', align: 'right', render: (r) => <span className="tiny">{timeAgo(r.updatedAt)}</span> },
            ]}
            rows={runs.slice(0, 7)}
            onRow={(r) => navigate(`/runs/${r.id}`)}
            empty={<EmptyState icon="file" title="No proposals yet" />}
          />
        </Card>

        <div className="grid" style={{ gap: 16 }}>
          {/* Upcoming Funder Deadlines */}
          <Card
            title="Agency Deadlines Window"
            subtitle="Verified calls · 7-day review buffer monitored"
            padded={false}
          >
            <div style={{ padding: '6px 20px 14px' }}>
              {upcoming.length === 0 && <div className="tiny" style={{ padding: 12 }}>No active deadlines.</div>}
              {upcoming.slice(0, 4).map((c) => {
                const d = new Date(c.deadline);
                const isUrgent = c.daysLeft <= 14;
                return (
                  <div className="deadline-row" key={c.id}>
                    <div className="date-box" style={isUrgent ? { background: '#fef2f2', color: '#dc2626' } : undefined}>
                      <b>{String(d.getDate()).padStart(2, '0')}</b>
                      <span>{d.toLocaleString('en-GB', { month: 'short' })}</span>
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="strong" style={{ fontSize: 13, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        {c.title}
                      </div>
                      <div className="tiny" style={{ color: 'var(--muted)' }}>
                        {c.agency} · {compactMoney(c.budgetMax)} max · {c.daysLeft} days left
                      </div>
                    </div>
                    {isUrgent && <Badge tone="red">Urgent</Badge>}
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Quick Governance Links */}
          <Card title="Executive Authority Actions">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Btn
                variant="ghost"
                icon="shield"
                iconRight="chevronRight"
                style={{ justifyContent: 'space-between', border: '1px solid var(--line)' }}
                onClick={() => navigate('/governance')}
              >
                <span>Release Registry &amp; Rollback</span>
                <span className="tiny muted">{data.totals.versions} released</span>
              </Btn>
              <Btn
                variant="ghost"
                icon="activity"
                iconRight="chevronRight"
                style={{ justifyContent: 'space-between', border: '1px solid var(--line)' }}
                onClick={() => navigate('/audit')}
              >
                <span>Immutable Execution Audit Trail</span>
                <span className="tiny muted">{data.totals.toolCalls} events</span>
              </Btn>
              <Btn
                variant="ghost"
                icon="layers"
                iconRight="chevronRight"
                style={{ justifyContent: 'space-between', border: '1px solid var(--line)' }}
                onClick={() => navigate('/platform')}
              >
                <span>Governed Connector &amp; Rate Cards</span>
                <span className="tiny muted">Lab 5</span>
              </Btn>
            </div>
          </Card>
        </div>
      </div>

      {/* Review & Authorize Modal */}
      <Modal
        open={Boolean(selectedRun)}
        onClose={() => setSelectedRun(null)}
        title={`Dean Sign-Off: ${selectedRun?.title}`}
        subtitle={`Run ${selectedRun?.id} · Requested ${selectedRun?.budget || '—'}`}
        width={680}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setSelectedRun(null)}>Cancel</Btn>
            <Btn
              variant={decision === 'approve' ? 'primary' : decision === 'reject' ? 'danger' : 'default'}
              icon={decision === 'approve' ? 'check' : decision === 'reject' ? 'alert' : 'rotate'}
              disabled={busy}
              onClick={handleReviewSubmit}
            >
              {busy ? 'Processing...' : decision === 'approve' ? 'Authorize & Release' : decision === 'reject' ? 'Reject Submission' : 'Route Corrections'}
            </Btn>
          </>
        }
      >
        {selectedRun && (
          <div className="grid" style={{ gap: 14 }}>
            <div className="callout info">
              <Icon name="shield" size={16} />
              <div>
                <b>Order 7 Guardrail:</b> Dean R&amp;D decision is the final authority for authorizing grant proposal submission. AI agents cannot self-publish.
              </div>
            </div>

            <div className="field">
              <label>Decision</label>
              <div className="seg" style={{ width: '100%' }}>
                <button
                  type="button"
                  style={{ flex: 1 }}
                  className={decision === 'approve' ? 'on' : ''}
                  onClick={() => setDecision('approve')}
                >
                  ✓ Authorize Submission
                </button>
                <button
                  type="button"
                  style={{ flex: 1 }}
                  className={decision === 'request_corrections' ? 'on' : ''}
                  onClick={() => setDecision('request_corrections')}
                >
                  ↺ Request Corrections
                </button>
                <button
                  type="button"
                  style={{ flex: 1 }}
                  className={decision === 'reject' ? 'on' : ''}
                  onClick={() => setDecision('reject')}
                >
                  ✕ Reject
                </button>
              </div>
            </div>

            <div className="field">
              <label>Authority Notes</label>
              <textarea
                className="textarea"
                rows={3}
                placeholder="Institutional review justification..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
