import React, { useEffect, useMemo, useState } from 'react';
import { endpoints } from '../lib/api';
import { compactMoney, date, dateTime, pct, statusMeta, timeAgo } from '../lib/format';
import { useApp } from '../App';
import { Btn, Card, EmptyState, Progress, StatusPill, Table, Tabs } from '../components/ui';
import { Icon } from '../components/icons';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'running', label: 'Running' },
  { id: 'awaiting_review', label: 'Awaiting review' },
  { id: 'published', label: 'Published' },
  { id: 'needs_human', label: 'Needs human' },
];

export default function Runs() {
  const { navigate } = useApp();
  const [runs, setRuns] = useState(null);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');

  useEffect(() => {
    let alive = true;
    const load = () => endpoints.runs().then((d) => { if (alive) setRuns(d.runs); }).catch(() => {});
    load();
    const id = setInterval(load, 4000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const filtered = useMemo(() => {
    if (!runs) return [];
    return runs.filter((r) => (filter === 'all' ? true : r.status === filter) && (!q || `${r.id} ${r.title} ${r.call?.agency || ''}`.toLowerCase().includes(q.toLowerCase())));
  }, [runs, filter, q]);

  const counts = runs ? {
    all: runs.length,
    running: runs.filter((r) => r.status === 'running').length,
    awaiting_review: runs.filter((r) => r.status === 'awaiting_review').length,
    published: runs.filter((r) => r.status === 'published').length,
    needs_human: runs.filter((r) => r.status === 'needs_human').length,
  } : {};

  return (
    <>
      <div className="page-head">
        <div style={{ flex: 1 }}>
          <div className="eyebrow">Workspace</div>
          <h1 className="page-title">Runs</h1>
          <p className="page-sub">Each run is an end-to-end grant package: discovery, literature, drafting, budget, compliance, validation, packaging and sign-off.</p>
        </div>
        <Btn variant="primary" icon="plus" onClick={() => navigate('/new')}>New proposal</Btn>
      </div>

      <Card padded={false}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
          <div className="seg">
            {FILTERS.map((f) => (
              <button key={f.id} className={filter === f.id ? 'on' : ''} onClick={() => setFilter(f.id)}>
                {f.label}{counts[f.id] !== undefined ? ` · ${counts[f.id]}` : ''}
              </button>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ position: 'relative' }}>
            <Icon name="search" size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--faint)' }} />
            <input className="input" style={{ paddingLeft: 30, width: 240 }} placeholder="Search runs, call or id" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>

        <Table
          columns={[
            { key: 'id', label: 'Run', width: 130, render: (r) => <span className="id">{r.id}</span> },
            { key: 'title', label: 'Proposal', render: (r) => (<><div className="row-title">{r.title}</div><div className="row-sub">{r.call ? `${r.call.agency} · ${r.call.program}` : 'Call pending'} · {r.domain}</div></>) },
            { key: 'status', label: 'Status', render: (r) => (<div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><StatusPill status={r.status} />{r.acceptance?.allPass && <span className="tiny" title="Acceptance suite passed">✓ gate</span>}</div>) },
            { key: 'coverage', label: 'Evidence', align: 'right', render: (r) => (r.coverage !== null && r.coverage !== undefined ? <div style={{ minWidth: 90 }}><div className="tiny" style={{ textAlign: 'right', marginBottom: 3 }}>{pct(r.coverage)}</div><Progress value={r.coverage} tone={r.coverage >= 99 ? 'green' : 'amber'} /></div> : <span className="tiny">—</span>) },
            { key: 'budget', label: 'Budget', align: 'right', render: (r) => <span className="num">{r.budget || '—'}</span> },
            { key: 'updatedAt', label: 'Updated', align: 'right', render: (r) => <span className="tiny">{timeAgo(r.updatedAt)}</span> },
          ]}
          rows={filtered}
          onRow={(r) => navigate(`/runs/${r.id}`)}
          empty={<EmptyState icon="file" title="No runs in this view" description={runs?.length ? 'Try another filter.' : 'Start a proposal to run the eight-agent pipeline.'} action={<Btn variant="primary" size="sm" icon="plus" onClick={() => navigate('/new')}>New proposal</Btn>} />}
        />
      </Card>
    </>
  );
}
