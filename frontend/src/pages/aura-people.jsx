import React, { useEffect, useMemo, useState } from 'react';
import { endpoints } from '../lib/api';
import { useApp } from '../App';
import { Badge, Btn, Card, Loading, Modal, Table } from '../components/ui';
import { Icon } from '../components/icons';
import { dateTime, initials } from '../lib/format';

const ROLE_TONE = { dean: 'violet', pi: 'indigo', research_office: 'teal', admin: 'amber', faculty: 'gray' };

export default function People() {
  const { navigate } = useApp();
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);

  const load = () => endpoints.users().then(setData).catch(() => {});
  useEffect(() => { load(); const id = setInterval(load, 10000); return () => clearInterval(id); }, []);

  const people = useMemo(() => {
    if (!data?.users) return [];
    return data.users.filter((p) => !q || `${p.Name} ${p.Role} ${p.Dept} ${p.email}`.toLowerCase().includes(q.toLowerCase()));
  }, [data, q]);

  const open = async (person) => {
    setSelected(person);
    setDetail(null);
    try {
      const res = await endpoints.person(person.id || person.email);
      setDetail(res);
    } catch {
      setDetail({ runs: [] });
    }
  };

  if (!data) return <Loading label="Loading the institutional directory…" />;

  const totals = data.users.reduce((acc, p) => ({
    runs: acc.runs + (p.runsCount || 0),
    approvals: acc.approvals + (p.approvedCount || 0),
  }), { runs: 0, approvals: 0 });

  return (
    <>
      <div className="page-head">
        <div style={{ flex: 1 }}>
          <div className="eyebrow">Institution</div>
          <h1 className="page-title">People</h1>
          <p className="page-sub">Name, role, department and email are the system of record in MongoDB. Every run, approval, audit event and version links back to one of these people.</p>
        </div>
        <div className="chips">
          <Badge tone={data.mongo?.connected ? 'green' : 'amber'} dot>{data.mongo?.connected ? 'MongoDB connected' : 'file fallback'}</Badge>
          <Badge tone="indigo">{data.schema?.collection || 'users'}</Badge>
        </div>
      </div>

      <div className="grid g4" style={{ gap: 12, marginBottom: 16 }}>
        <div className="card stat"><div className="stat-icon tone-indigo"><Icon name="users" size={15} /></div><div className="stat-label">People</div><div className="stat-value">{data.users.length}</div><div className="stat-foot">in users collection</div></div>
        <div className="card stat"><div className="stat-icon tone-teal"><Icon name="file" size={15} /></div><div className="stat-label">Linked runs</div><div className="stat-value">{totals.runs}</div><div className="stat-foot">by actorRef</div></div>
        <div className="card stat"><div className="stat-icon tone-green"><Icon name="shield" size={15} /></div><div className="stat-label">Approvals</div><div className="stat-value">{totals.approvals}</div><div className="stat-foot">by decidedByRef</div></div>
        <div className="card stat"><div className="stat-icon tone-amber"><Icon name="database" size={15} /></div><div className="stat-label">Database</div><div className="stat-value" style={{ fontSize: 19 }}>{data.mongo?.database || '—'}</div><div className="stat-foot">{data.mongo?.counts ? `${data.mongo.counts.runs} runs · ${data.mongo.counts.auditEvents} events` : 'offline'}</div></div>
      </div>

      <Card padded={false}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ position: 'relative', flex: '1 1 240px' }}>
            <Icon name="search" size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--faint)' }} />
            <input className="input" style={{ paddingLeft: 30 }} placeholder="Search name, role, department or email" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Badge tone="gray" outline>schema: Name · Role · Dept · email</Badge>
        </div>
        <Table
          columns={[
            {
              key: 'Name',
              label: 'Name',
              render: (p) => (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div className="avatar" style={{ background: 'linear-gradient(140deg,#5b4fe0,#2e2a86)' }}>{initials(p.Name)}</div>
                  <div>
                    <div className="row-title">{p.Name}</div>
                    <div className="row-sub">{p.title || p.Role}</div>
                  </div>
                </div>
              ),
            },
            { key: 'Role', label: 'Role', render: (p) => <Badge tone={ROLE_TONE[p.Role] || 'gray'}>{p.Role}</Badge> },
            { key: 'Dept', label: 'Department', render: (p) => <span style={{ fontSize: 12.5 }}>{p.Dept}</span> },
            { key: 'email', label: 'Email', render: (p) => <a href={`mailto:${p.email}`} style={{ color: 'var(--indigo)', fontSize: 12 }}>{p.email}</a> },
            { key: 'runsCount', label: 'Runs', align: 'right', render: (p) => <span className="num">{p.runsCount || 0}</span> },
            { key: 'approvedCount', label: 'Approvals', align: 'right', render: (p) => <span className="num">{p.approvedCount || 0}</span> },
            { key: 'go', label: '', align: 'right', render: (p) => <Btn size="sm" variant="ghost" iconRight="chevronRight" onClick={() => open(p)}>Open</Btn> },
          ]}
          rows={people}
          rowKey={(p) => p.id || p.email}
          empty="No people match this search."
        />
      </Card>

      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.Name} subtitle={selected ? `${selected.Role} · ${selected.Dept}` : ''} width={680}>
        {selected && (
          <div className="grid" style={{ gap: 14 }}>
            <dl className="kv" style={{ gridTemplateColumns: '110px 1fr' }}>
              <dt>Email</dt><dd><a href={`mailto:${selected.email}`} style={{ color: 'var(--indigo)' }}>{selected.email}</a></dd>
              <dt>Role</dt><dd style={{ textTransform: 'capitalize' }}>{selected.Role}</dd>
              <dt>Department</dt><dd>{selected.Dept}</dd>
              <dt>Title</dt><dd>{selected.title || '—'}</dd>
              <dt>Linked runs</dt><dd>{selected.runsCount || 0} owned · {selected.approvedCount || 0} approved</dd>
              <dt>User ID</dt><dd className="mono">{selected.id}</dd>
            </dl>
            <div>
              <div className="stat-label" style={{ marginBottom: 6 }}>Linked runs</div>
              {!detail && <div className="tiny">Loading…</div>}
              {detail && detail.runs?.length === 0 && <div className="tiny">No runs linked yet.</div>}
              {detail && detail.runs?.map((r) => (
                <button
                  key={r.id}
                  className="card"
                  style={{ width: '100%', textAlign: 'left', padding: '9px 12px', marginBottom: 6, cursor: 'pointer', background: '#fff' }}
                  onClick={() => navigate(`/runs/${r.id}`)}
                >
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span className="mono" style={{ fontSize: 10.5, color: 'var(--muted)' }}>{r.id}</span>
                    <Badge tone={r.role === 'owner' ? 'indigo' : 'violet'}>{r.role}</Badge>
                    <span className="tiny" style={{ marginLeft: 'auto' }}>{r.status}</span>
                  </div>
                  <div style={{ fontSize: 12, marginTop: 3 }}>{r.title}</div>
                </button>
              ))}
            </div>
            <div className="callout info"><Icon name="database" size={15} /><div>Linked by <span className="mono">runs.actorRef</span>, <span className="mono">runs.approval.decidedByRef</span>, <span className="mono">audit_events.actorRef</span> and <span className="mono">versions.approvedByRef</span>.</div></div>
          </div>
        )}
      </Modal>
    </>
  );
}
