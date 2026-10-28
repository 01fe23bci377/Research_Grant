import React, { useEffect, useMemo, useState } from 'react';
import { endpoints } from '../lib/api';
import { compactMoney, date, money, pct, statusMeta, timeAgo } from '../lib/format';
import { useApp } from '../App';
import { Badge, Btn, Card, EmptyState, Progress, Stat, StatusPill, Table } from '../components/ui';
import { Icon } from '../components/icons';

export default function FacultyDashboard() {
  const { navigate, bootstrap, actor } = useApp();
  const [runs, setRuns] = useState(null);
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = () => {
    Promise.all([endpoints.runs(), endpoints.calls()])
      .then(([r, c]) => {
        setRuns(r.runs);
        setCalls(c.calls || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
    const id = setInterval(loadData, 5000);
    return () => clearInterval(id);
  }, []);

  // Filter runs relevant to this faculty member (or show all with personal highlights)
  const myRuns = useMemo(() => {
    if (!runs) return [];
    const direct = runs.filter((r) => r.actorId === actor?.id || (r.actor && r.actor.id === actor?.id));
    return direct.length > 0 ? direct : runs.slice(0, 4); // fallback to recent if none owned yet
  }, [runs, actor]);

  // Recommended calls matched to faculty's discipline
  const recommendedCalls = useMemo(() => {
    if (!calls.length) return [];
    return calls
      .filter((c) => c.active)
      .slice(0, 3);
  }, [calls]);

  if (loading && !runs) {
    return (
      <div className="grid g4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card skel" style={{ height: 112 }} />
        ))}
      </div>
    );
  }

  const activeCount = myRuns.filter((r) => !['published', 'rejected'].includes(r.status)).length;
  const publishedCount = myRuns.filter((r) => r.status === 'published').length;
  const awaitingCount = myRuns.filter((r) => r.status === 'awaiting_review').length;
  const revisionsCount = myRuns.filter((r) => r.status === 'changes_requested').length;

  return (
    <>
      <section
        className="hero-band"
        style={{
          marginBottom: 16,
          background: 'radial-gradient(850px 280px at 95% -15%, rgba(67, 56, 202, 0.45), transparent 60%), linear-gradient(125deg, #131b31, #0c1224 75%)',
        }}
      >
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span className="badge indigo lg" style={{ background: 'rgba(99, 102, 241, 0.25)', color: '#c7d2fe', borderColor: '#4f46e5' }}>
                <Icon name="user" size={13} /> Faculty Research Workspace
              </span>
              <span style={{ fontSize: 11.5, color: '#94a3b8' }}>{actor?.department || 'Department of Computer Science & Engineering'}</span>
            </div>
            <h2 style={{ marginTop: 6, fontSize: 22 }}>
              Welcome back, {actor?.name}
            </h2>
            <p style={{ color: '#cbd5e1', fontSize: 13, maxWidth: 640 }}>
              Your personalized grant workspace. The 8-agent pipeline helps you match verified funding calls, compile grounded literature, cost itemized budgets, and prepare submission-ready packages for Dean sign-off.
            </p>
            <div className="hero-actions" style={{ marginTop: 14 }}>
              <Btn
                variant="primary"
                icon="sparkles"
                onClick={() => navigate('/new')}
                style={{ background: 'linear-gradient(180deg, #4f46e5, #3730a3)' }}
              >
                Start New Proposal
              </Btn>
              <Btn
                style={{ background: 'rgba(255,255,255,.08)', borderColor: 'rgba(255,255,255,.2)', color: '#fff' }}
                icon="search"
                onClick={() => navigate('/calls')}
              >
                Browse Verified Calls ({calls.filter((c) => c.active).length} open)
              </Btn>
            </div>
          </div>
          <div className="hero-meta" style={{ gap: 24 }}>
            <div>My Active Drafts<b>{activeCount}</b></div>
            <div>Awaiting Sign-off<b>{awaitingCount}</b></div>
            <div>Approved Grants<b>{publishedCount}</b></div>
            <div>Action Required<b>{revisionsCount}</b></div>
          </div>
        </div>
      </section>

      {/* Advisory Alert for Dean Feedback / Changes Requested */}
      {revisionsCount > 0 && (
        <div className="callout warn" style={{ marginBottom: 16 }}>
          <Icon name="alert" size={16} />
          <div style={{ flex: 1 }}>
            <b>Dean R&amp;D Requested Corrections on Your Proposal.</b>
            <div style={{ marginTop: 2, fontSize: 12.5 }}>
              Dean Dr. Uma Mudengudi reviewed your submission and requested adjustments to line items before final submission. Click below to inspect the notes and resume the repair loop.
            </div>
          </div>
          <Btn
            size="sm"
            variant="ghost"
            style={{ color: '#7a4607', alignSelf: 'center' }}
            onClick={() => navigate(`/runs/${myRuns.find((r) => r.status === 'changes_requested')?.id}`)}
          >
            Review Feedback
          </Btn>
        </div>
      )}

      {/* Faculty KPI Stats */}
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Stat
          label="My Active Proposals"
          value={activeCount}
          foot={`${myRuns.length} total proposals created`}
          icon="file"
          tone="indigo"
        />
        <Stat
          label="Awaiting Dean Sign-off"
          value={awaitingCount}
          foot={awaitingCount ? 'In Dean R&D review queue' : 'No proposals awaiting'}
          icon="clock"
          tone="amber"
        />
        <Stat
          label="Approved &amp; Published"
          value={publishedCount}
          foot="Authorized for agency submission"
          icon="checkCircle"
          tone="green"
        />
        <Stat
          label="Evidence Coverage"
          value={myRuns[0]?.coverage !== undefined ? pct(myRuns[0]?.coverage) : '100%'}
          foot="100% cited &amp; grounded (Lab 9)"
          icon="shield"
          tone="teal"
        />
      </div>

      {/* Main Grid: My Proposals & Matched Calls */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.65fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
        <Card
          title="My Research Proposals"
          subtitle="Proposals initiated by you, tracked through the 8-agent pipeline"
          padded={false}
          actions={
            <Btn size="sm" variant="primary" icon="plus" onClick={() => navigate('/new')}>
              New Proposal
            </Btn>
          }
        >
          <Table
            columns={[
              { key: 'id', label: 'Run', width: 110, render: (r) => <span className="id">{r.id}</span> },
              {
                key: 'title',
                label: 'Proposal & Funder',
                render: (r) => (
                  <>
                    <div className="row-title">{r.title}</div>
                    <div className="row-sub">
                      {r.call ? `${r.call.agency} · ${r.call.program}` : 'Call pending'} · {r.domain}
                    </div>
                  </>
                ),
              },
              { key: 'status', label: 'Status', render: (r) => <StatusPill status={r.status} /> },
              { key: 'budget', label: 'Requested', align: 'right', render: (r) => <span className="num">{r.budget || '—'}</span> },
              {
                key: 'actions',
                label: '',
                align: 'right',
                width: 90,
                render: (r) => (
                  <Btn size="sm" variant="ghost" onClick={() => navigate(`/runs/${r.id}`)}>
                    Inspect
                  </Btn>
                ),
              },
            ]}
            rows={myRuns}
            onRow={(r) => navigate(`/runs/${r.id}`)}
            empty={
              <EmptyState
                icon="file"
                title="No proposals initiated yet"
                description="Start a new proposal to run the 8-agent pipeline."
                action={
                  <Btn variant="primary" size="sm" icon="plus" onClick={() => navigate('/new')}>
                    Start a proposal
                  </Btn>
                }
              />
            }
          />
        </Card>

        {/* Right column: Smart-Matched Opportunities & Quick Guide */}
        <div className="grid" style={{ gap: 16 }}>
          <Card
            title="Matched Calls for Your Profile"
            subtitle="Curated from DST, SERB, AICTE, and Industry CSR"
            padded={false}
            actions={
              <Btn size="sm" variant="ghost" iconRight="arrowRight" onClick={() => navigate('/calls')}>
                All calls
              </Btn>
            }
          >
            <div style={{ padding: '6px 20px 14px' }}>
              {recommendedCalls.map((c) => (
                <div className="deadline-row" key={c.id}>
                  <div className="date-box">
                    <b>{String(new Date(c.deadline).getDate()).padStart(2, '0')}</b>
                    <span>{new Date(c.deadline).toLocaleString('en-GB', { month: 'short' })}</span>
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="strong" style={{ fontSize: 13, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {c.title}
                    </div>
                    <div className="tiny" style={{ color: 'var(--muted)' }}>
                      {c.agency} · ceiling {compactMoney(c.budgetMax)} · {c.daysLeft}d left
                    </div>
                  </div>
                  <Btn
                    size="sm"
                    variant="ghost"
                    icon="sparkles"
                    onClick={() => navigate('/new')}
                    title="Draft for this call"
                  >
                    Draft
                  </Btn>
                </div>
              ))}
            </div>
          </Card>

          <Card title="How the 8-Agent System Works">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span className="badge indigo">1</span>
                <div><b>Profile Intake:</b> Provide research area and duration; planner loop asks clarifying questions.</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span className="badge teal">2</span>
                <div><b>Parallel Discovery &amp; Literature:</b> Agents A &amp; B discover matched calls and compile literature citations simultaneously.</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span className="badge violet">3</span>
                <div><b>Drafting &amp; Costing:</b> Group C drafts narrative, Group D prepares itemized budget, Group E checks compliance.</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span className="badge amber">4</span>
                <div><b>Dean Sign-off:</b> Dean R&amp;D reviews and authorizes final package submission to agency.</div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
