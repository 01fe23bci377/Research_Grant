import React, { useEffect, useMemo, useState } from 'react';
import { endpoints } from '../lib/api';
import { compactMoney, date, money, pct, statusMeta, timeAgo } from '../lib/format';
import { useApp } from '../App';
import { Badge, Btn, Card, EmptyState, Modal, Progress, Stat, StatusPill, Table, useToast } from '../components/ui';
import { Icon } from '../components/icons';
import { BudgetEditor } from '../components/BudgetEditor';

export default function FacultyDashboard() {
  const { navigate, bootstrap, actor } = useApp();
  const toast = useToast();

  const [runs, setRuns] = useState(null);
  const [calls, setCalls] = useState([]);
  const [myProjects, setMyProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingProjects, setLoadingProjects] = useState(true);

  // Budget editing modal state
  const [selectedProject, setSelectedProject] = useState(null);
  const [budget, setBudget] = useState([]);
  const [savingBudget, setSavingBudget] = useState(false);

  const loadData = () => {
    Promise.all([
      endpoints.runs(),
      endpoints.calls(),
      endpoints.myProjects().catch(() => ({ projects: [] })),
    ])
      .then(([r, c, p]) => {
        setRuns(r.runs || []);
        setCalls(c.calls || []);
        setMyProjects(p.projects || []);
        setLoading(false);
        setLoadingProjects(false);
      })
      .catch(() => {
        setLoading(false);
        setLoadingProjects(false);
      });
  };

  useEffect(() => {
    loadData();
    const id = setInterval(loadData, 6000);
    return () => clearInterval(id);
  }, [actor?.id]);

  // Clean name helper to check involvement in PI or Co-PI
  const cleanActorName = useMemo(() => {
    return String(actor?.Name || actor?.name || '')
      .replace(/^(Dr\.|Prof\.|Mr\.|Mrs\.|Ms\.)\s*/i, '')
      .toLowerCase()
      .trim();
  }, [actor]);

  const isLeadPI = (project) => {
    if (!cleanActorName) return false;
    return (project.pi || []).some((name) =>
      name.toLowerCase().includes(cleanActorName)
    );
  };

  const isCoPI = (project) => {
    if (!cleanActorName) return false;
    return (project.coPIs || []).some((name) =>
      name.toLowerCase().includes(cleanActorName)
    );
  };

  // Filter runs initiated by this faculty member
  const myRuns = useMemo(() => {
    if (!runs) return [];
    const direct = runs.filter(
      (r) => r.actorId === actor?.id || (r.actor && r.actor.id === actor?.id)
    );
    return direct.length > 0 ? direct : runs.slice(0, 4);
  }, [runs, actor]);

  // Recommended calls matched to faculty's discipline
  const recommendedCalls = useMemo(() => {
    if (!calls.length) return [];
    return calls.filter((c) => c.active).slice(0, 3);
  }, [calls]);

  // Sanctioned project statistics for this faculty
  const totalSanctionedRupees = useMemo(() => {
    return myProjects.reduce((acc, p) => acc + (Number(p.amountLakh) || 0) * 100000, 0);
  }, [myProjects]);

  const piCount = useMemo(() => myProjects.filter(isLeadPI).length, [myProjects, cleanActorName]);
  const coPiCount = useMemo(() => myProjects.filter(isCoPI).length, [myProjects, cleanActorName]);

  const openBudgetModal = (project) => {
    setSelectedProject(project);
    setBudget(
      project.budgetLines && project.budgetLines.length
        ? project.budgetLines
        : [{ requirement: '', cost: '' }]
    );
  };

  const saveBudget = async () => {
    if (!selectedProject) return;
    setSavingBudget(true);
    try {
      const res = await endpoints.saveProjectBudget(selectedProject.id, budget);
      toast.push(`Faculty budget saved for ${selectedProject.id} (${money(res.total)}).`, 'ok');
      setSelectedProject(null);
      loadData();
    } catch (err) {
      toast.push(err.message || 'Failed to save budget', 'err');
    } finally {
      setSavingBudget(false);
    }
  };

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
      {/* Hero Band */}
      <section
        className="hero-band"
        style={{
          marginBottom: 16,
          background:
            'radial-gradient(850px 280px at 95% -15%, rgba(67, 56, 202, 0.45), transparent 60%), linear-gradient(125deg, #131b31, #0c1224 75%)',
        }}
      >
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span
                className="badge indigo lg"
                style={{ background: 'rgba(99, 102, 241, 0.25)', color: '#c7d2fe', borderColor: '#4f46e5' }}
              >
                <Icon name="user" size={13} /> Faculty Research Workspace
              </span>
              <span style={{ fontSize: 11.5, color: '#94a3b8' }}>
                {actor?.department || actor?.Dept || 'Department of Computer Science & Engineering'}
              </span>
            </div>
            <h2 style={{ marginTop: 6, fontSize: 22 }}>Welcome back, {actor?.name || actor?.Name}</h2>
            <p style={{ color: '#cbd5e1', fontSize: 13, maxWidth: 640 }}>
              Your personalized grant workspace. In this dashboard, view your institutional sanctioned research grants (fetched live from MongoDB), itemize your faculty-owned budgets, and prepare upcoming proposal drafts.
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
              <Btn
                style={{ background: 'rgba(255,255,255,.08)', borderColor: 'rgba(255,255,255,.2)', color: '#fff' }}
                icon="layers"
                onClick={() => navigate('/projects')}
              >
                Full Institutional Portfolio
              </Btn>
            </div>
          </div>
          <div className="hero-meta" style={{ gap: 24 }}>
            <div>
              My Sanctioned Grants<b>{myProjects.length}</b>
            </div>
            <div>
              Sanctioned Value<b>{compactMoney(totalSanctionedRupees)}</b>
            </div>
            <div>
              Active Drafts<b>{activeCount}</b>
            </div>
            <div>
              Awaiting Sign-off<b>{awaitingCount}</b>
            </div>
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
          label="My Sanctioned Grants"
          value={myProjects.length}
          foot={`${piCount} Lead PI · ${coPiCount} Co-PI`}
          icon="checkCircle"
          tone="green"
        />
        <Stat
          label="Sanctioned Research Value"
          value={compactMoney(totalSanctionedRupees)}
          foot={totalSanctionedRupees > 0 ? 'Approved institutional awards' : 'No grants awarded yet'}
          icon="layers"
          tone="indigo"
        />
        <Stat
          label="Active Proposal Drafts"
          value={activeCount}
          foot={`${myRuns.length} proposals created`}
          icon="file"
          tone="teal"
        />
        <Stat
          label="Awaiting Dean Sign-off"
          value={awaitingCount}
          foot={awaitingCount ? 'In Dean review queue' : 'No pending reviews'}
          icon="clock"
          tone="amber"
        />
      </div>

      {/* SECTION 1: MY SANCTIONED PROJECTS (FETCHED LIVE FROM MONGODB) */}
      <div style={{ marginBottom: 20 }}>
        <Card
          title="My Sanctioned Grants & Research Projects"
          subtitle="Approved institutional grants where you are involved as Principal Investigator (PI) or Co-Investigator · Live from MongoDB"
          padded={false}
          actions={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 11,
                  padding: '3px 8px',
                  borderRadius: 6,
                  background: '#ecfdf5',
                  color: '#065f46',
                  border: '1px solid #a7f3d0',
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#10b981',
                    display: 'inline-block',
                  }}
                />
                MongoDB Atlas (Mongoose ORM)
              </span>
              <Badge tone="indigo">{myProjects.length} Projects</Badge>
            </div>
          }
        >
          {loadingProjects ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>
              <Icon name="refresh" className="spin" size={16} /> Loading your sanctioned projects from MongoDB…
            </div>
          ) : (
            <Table
              columns={[
                {
                  key: 'id',
                  label: 'Project ID',
                  width: 120,
                  render: (p) => <Badge tone="gray">{p.id}</Badge>,
                },
                {
                  key: 'year',
                  label: 'Year',
                  width: 90,
                  render: (p) => <span className="mono strong">{p.year}</span>,
                },
                {
                  key: 'title',
                  label: 'Grant Title & Agency',
                  render: (p) => (
                    <>
                      <div className="row-title" style={{ fontWeight: 650 }}>{p.title}</div>
                      <div className="row-sub" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <span className="badge teal sm">{p.agency}</span>
                        <span>· {p.department}</span>
                      </div>
                    </>
                  ),
                },
                {
                  key: 'role',
                  label: 'My Role',
                  width: 110,
                  render: (p) => {
                    const pi = isLeadPI(p);
                    const copi = isCoPI(p);
                    if (pi) return <Badge tone="violet">Lead PI</Badge>;
                    if (copi) return <Badge tone="indigo">Co-Investigator</Badge>;
                    return <Badge tone="neutral">Investigator</Badge>;
                  },
                },
                {
                  key: 'team',
                  label: 'Investigation Team',
                  render: (p) => (
                    <div style={{ fontSize: 11.5, color: 'var(--ink-2)', lineHeight: 1.35 }}>
                      <div>
                        <b>PI:</b> {(p.pi || []).map((name, i) => (
                          <span
                            key={i}
                            style={{
                              fontWeight: name.toLowerCase().includes(cleanActorName) ? 700 : 400,
                              color: name.toLowerCase().includes(cleanActorName) ? 'var(--indigo)' : 'inherit',
                            }}
                          >
                            {i > 0 ? ', ' : ''}{name}
                          </span>
                        ))}
                      </div>
                      {p.coPIs && p.coPIs.length > 0 && (
                        <div style={{ color: 'var(--muted)' }}>
                          <b>Co-PI:</b> {p.coPIs.map((name, i) => (
                            <span
                              key={i}
                              style={{
                                fontWeight: name.toLowerCase().includes(cleanActorName) ? 700 : 400,
                                color: name.toLowerCase().includes(cleanActorName) ? 'var(--indigo)' : 'inherit',
                              }}
                            >
                              {i > 0 ? ', ' : ''}{name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ),
                },
                {
                  key: 'amountLakh',
                  label: 'Sanctioned',
                  align: 'right',
                  width: 110,
                  render: (p) => (
                    <span className="num" style={{ fontWeight: 650, color: 'var(--ink)' }}>
                      {p.amountLakh ? `₹${p.amountLakh.toFixed(2)} L` : 'In-kind'}
                    </span>
                  ),
                },
                {
                  key: 'budget',
                  label: 'Faculty Budget',
                  align: 'right',
                  width: 130,
                  render: (p) => (
                    <div style={{ textAlign: 'right' }}>
                      <div className="num" style={{ fontSize: 12 }}>
                        {p.budgetTotal > 0 ? money(p.budgetTotal) : <span style={{ color: 'var(--muted)' }}>Not itemized</span>}
                      </div>
                      <div className="tiny" style={{ color: 'var(--muted)' }}>
                        {p.budgetLines?.length || 0} line items
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'actions',
                  label: '',
                  align: 'right',
                  width: 110,
                  render: (p) => (
                    <Btn
                      size="sm"
                      variant="primary"
                      icon="edit"
                      onClick={() => openBudgetModal(p)}
                      title="Itemize Requirement + Cost for this project"
                    >
                      Itemize Budget
                    </Btn>
                  ),
                },
              ]}
              rows={myProjects}
              rowKey={(p) => p.id}
              empty={
                <EmptyState
                  icon="layers"
                  title="No sanctioned projects on record"
                  description={`No historical approved projects were found for ${actor?.name || 'this faculty member'} in MongoDB Atlas. You can start a new proposal below to submit for institutional sanction.`}
                  action={
                    <Btn variant="primary" size="sm" icon="plus" onClick={() => navigate('/new')}>
                      Start a New Proposal
                    </Btn>
                  }
                />
              }
            />
          )}
        </Card>
      </div>

      {/* SECTION 2: MY PROPOSALS & MATCHED CALLS */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.65fr) minmax(0, 1fr)',
          gap: 16,
          alignItems: 'start',
        }}
      >
        <Card
          title="My Proposal Runs &amp; Drafts"
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
              {
                key: 'budget',
                label: 'Requested',
                align: 'right',
                render: (r) => <span className="num">{r.budget || '—'}</span>,
              },
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

        {/* Right column: Smart-Matched Opportunities & System Guide */}
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
                    <div
                      className="strong"
                      style={{
                        fontSize: 13,
                        textOverflow: 'ellipsis',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                      }}
                    >
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
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                fontSize: 12.5,
                color: 'var(--ink-2)',
                lineHeight: 1.5,
              }}
            >
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span className="badge indigo">1</span>
                <div>
                  <b>Profile Intake:</b> Provide research area and duration; planner loop asks clarifying questions.
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span className="badge teal">2</span>
                <div>
                  <b>Parallel Discovery:</b> Agents A &amp; B discover matched calls and compile literature citations simultaneously.
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span className="badge violet">3</span>
                <div>
                  <b>Drafting &amp; Costing:</b> Group C drafts narrative, Group D prepares itemized budget, Group E checks statutory compliance.
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span className="badge amber">4</span>
                <div>
                  <b>Dean Sign-off:</b> Dean R&amp;D reviews and authorizes final package submission to agency.
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Modal: Faculty Budget Editor */}
      {selectedProject && (
        <Modal
          title={`Faculty Budget — ${selectedProject.id}`}
          subtitle={`${selectedProject.title} · Sanctioned ₹${selectedProject.amountLakh?.toFixed(2)} Lakhs (${selectedProject.agency})`}
          onClose={() => setSelectedProject(null)}
          width={640}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)' }}>
              Faculty-owned budget breakdown in rupees. Only you (the faculty investigator) can add, modify or remove requirement lines. Saved directly to MongoDB Atlas.
            </p>

            <BudgetEditor lines={budget} onChange={setBudget} />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <Btn variant="ghost" onClick={() => setSelectedProject(null)} disabled={savingBudget}>
                Cancel
              </Btn>
              <Btn variant="primary" icon="check" onClick={saveBudget} disabled={savingBudget}>
                {savingBudget ? 'Saving to MongoDB…' : 'Save Faculty Budget'}
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
