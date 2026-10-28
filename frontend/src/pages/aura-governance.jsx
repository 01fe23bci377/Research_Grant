import React, { useEffect, useState } from 'react';
import { endpoints } from '../lib/api';
import { useApp } from '../App';
import { Badge, Btn, Card, Loading, StatusPill, Table, useToast } from '../components/ui';
import { Icon } from '../components/icons';
import { dateTime, pct, timeAgo } from '../lib/format';

export default function Governance() {
  const { navigate, bootstrap, can } = useApp();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [versions, setVersions] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [people, setPeople] = useState([]);
  const [mongo, setMongo] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => Promise.all([endpoints.metrics(), endpoints.runs(), endpoints.versions(), endpoints.policies(), endpoints.users()])
    .then(([m, r, v, p, u]) => { setData({ metrics: m, runs: r.runs }); setVersions(v.versions); setPolicies(p.policies); setPeople(u.users || []); setMongo(u.mongo || null); })
    .catch(() => {});
  useEffect(() => { load(); const id = setInterval(load, 5000); return () => clearInterval(id); }, []);

  const rollback = async (version) => {
    setBusy(true);
    try {
      await endpoints.rollback(version.runId, version.id);
      toast.push(`Restored ${version.runId} from v${version.v}.`, 'ok');
      load();
    } catch (err) {
      toast.push(err.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <Loading label="Loading governance state…" />;

  const awaiting = data.runs.filter((r) => r.status === 'awaiting_review');
  const metrics = data.metrics;

  return (
    <>
      <div className="page-head">
        <div style={{ flex: 1 }}>
          <div className="eyebrow">Governance</div>
          <h1 className="page-title">Approvals &amp; versions</h1>
          <p className="page-sub">Only the Dean R&amp;D / HoD / Research Office can authorise submission. Every release is versioned with a checksum and can be rolled back in one action.</p>
        </div>
        {!can('review:approve') && <Badge tone="amber" dot>current role cannot approve</Badge>}
      </div>

      <div className="grid g4" style={{ gap: 12, marginBottom: 16 }}>
        <div className="card stat"><div className="stat-icon tone-amber"><Icon name="clock" size={15} /></div><div className="stat-label">Awaiting sign-off</div><div className="stat-value">{awaiting.length}</div><div className="stat-foot">hard-gated packages</div></div>
        <div className="card stat"><div className="stat-icon tone-green"><Icon name="checkCircle" size={15} /></div><div className="stat-label">Published</div><div className="stat-value">{metrics.totals.published}</div><div className="stat-foot">{metrics.rates.approvalRate}% approval rate</div></div>
        <div className="card stat"><div className="stat-icon tone-indigo"><Icon name="layers" size={15} /></div><div className="stat-label">Versions</div><div className="stat-value">{metrics.totals.versions}</div><div className="stat-foot">immutable snapshots</div></div>
        <div className="card stat"><div className="stat-icon tone-teal"><Icon name="rotate" size={15} /></div><div className="stat-label">Repair success</div><div className="stat-value">{pct(metrics.rates.repairSuccessRate)}</div><div className="stat-foot">{metrics.repairs.recovered}/{metrics.repairs.runs} recovered</div></div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.35fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
        <div className="grid" style={{ gap: 16 }}>
          <Card title="Approval queue" subtitle={`${awaiting.length} package(s) waiting for ${bootstrap.institution.signatory}`} padded={false}>
            <Table
              columns={[
                { key: 'id', label: 'Run', width: 120, render: (r) => <span className="id">{r.id}</span> },
                { key: 'title', label: 'Package', render: (r) => (<><div className="row-title">{r.title}</div><div className="row-sub">{r.call?.agency} · {r.budget}</div></>) },
                { key: 'acceptance', label: 'Gate', render: (r) => <Badge tone={r.acceptance?.allPass ? 'green' : 'red'} dot>{r.acceptance?.allPass ? 'passed' : 'blocked'}</Badge> },
                { key: 'updatedAt', label: 'Updated', align: 'right', render: (r) => <span className="tiny">{timeAgo(r.updatedAt)}</span> },
                { key: 'go', label: '', align: 'right', render: (r) => <Btn size="sm" variant="ghost" iconRight="chevronRight" onClick={() => navigate(`/runs/${r.id}`)}>Review</Btn> },
              ]}
              rows={awaiting}
              empty={<div className="empty" style={{ padding: 30 }}>No packages are waiting. Start a proposal to populate the queue.</div>}
            />
          </Card>

          <Card title="Version history" subtitle="Each approval creates an immutable snapshot" padded={false}>
            <Table
              columns={[
                { key: 'runId', label: 'Run', render: (v) => <button className="btn ghost sm" onClick={() => navigate(`/runs/${v.runId}`)}><span className="mono" style={{ fontSize: 11 }}>{v.runId}</span></button> },
                { key: 'v', label: 'Version', render: (v) => <Badge tone="indigo">v{v.v}</Badge> },
                { key: 'approvedBy', label: 'Authorised by', render: (v) => <span className="tiny">{v.approvedBy || '—'}</span> },
                { key: 'at', label: 'When', align: 'right', render: (v) => <span className="tiny">{dateTime(v.at)}</span> },
                { key: 'act', label: '', align: 'right', render: (v) => (can('version:rollback') ? <Btn size="sm" variant="ghost" icon="rotate" disabled={busy} onClick={() => rollback(v)}>Restore</Btn> : <span className="tiny">—</span>) },
              ]}
              rows={versions}
              rowKey={(v) => v.id}
              empty="No versions published yet."
            />
          </Card>

          <Card title="Policies & rules" subtitle="What the compliance agent checks against" padded={false}>
            {policies.map((p) => (
              <details key={p.id} style={{ borderBottom: '1px solid #eef0f6' }}>
                <summary style={{ cursor: 'pointer', padding: '11px 18px', fontSize: 12.5, fontWeight: 550 }}>{p.title}<span className="tiny" style={{ marginLeft: 8 }}>{p.tags.join(' · ')}</span></summary>
                <div style={{ padding: '0 18px 14px', fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.6 }}>{p.text}</div>
              </details>
            ))}
          </Card>
        </div>

        <div className="grid" style={{ gap: 16 }}>
          <Card
            title="People & roles"
            subtitle="Name, role, department and email from MongoDB"
            padded={false}
            actions={<Badge tone={mongo?.connected ? 'green' : 'amber'} dot>{mongo?.connected ? 'linked' : 'file fallback'}</Badge>}
          >
            <div style={{ padding: '4px 16px 10px' }}>
              {people.map((u) => (
                <div key={u.id || u.email} style={{ padding: '9px 0', borderBottom: '1px solid #f0f2f7' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="strong" style={{ fontSize: 12 }}>{u.Name}</span>
                    <Badge tone={u.Role === 'dean' ? 'violet' : u.Role === 'research_office' ? 'teal' : u.Role === 'pi' ? 'indigo' : 'gray'}>{u.Role}</Badge>
                    <span className="tiny" style={{ marginLeft: 'auto' }}>{u.runsCount || 0} runs · {u.approvedCount || 0} approvals</span>
                  </div>
                  <div className="tiny" style={{ marginTop: 3 }}>{u.Dept} · <a href={`mailto:${u.email}`} style={{ color: 'var(--indigo)' }}>{u.email}</a></div>
                </div>
              ))}
              {people.length === 0 && <div className="tiny" style={{ padding: 8 }}>No people loaded.</div>}
            </div>
          </Card>

          <Card title="Rollback" subtitle="Reversible by design">
            <div className="callout info" style={{ marginBottom: 10 }}>
              <Icon name="rotate" size={15} />
              <div>Restoring a version rewrites the run's artifacts from the snapshot and publishes a new version that records the restore. Nothing is deleted.</div>
            </div>
            <div className="tiny">Rollback requires <span className="mono">version:rollback</span>, held by the Research Office, the Dean and the platform administrator.</div>
          </Card>
        </div>
      </div>
    </>
  );
}
