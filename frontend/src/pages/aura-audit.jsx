import React, { useEffect, useMemo, useState } from 'react';
import { endpoints } from '../lib/api';
import { Badge, Card, Loading } from '../components/ui';
import { Icon } from '../components/icons';
import { dateTime } from '../lib/format';

const LEVEL_TONE = { error: 'red', warn: 'amber', gate: 'violet', info: 'gray' };

export default function Audit() {
  const [events, setEvents] = useState(null);
  const [q, setQ] = useState('');
  const [level, setLevel] = useState('all');
  const [agent, setAgent] = useState('all');
  const [limit, setLimit] = useState(120);

  useEffect(() => {
    let alive = true;
    const load = () => endpoints.audit(`?limit=${limit}`).then((d) => { if (alive) setEvents(d.events); }).catch(() => {});
    load();
    const id = setInterval(load, 5000);
    return () => { alive = false; clearInterval(id); };
  }, [limit]);

  const agents = useMemo(() => (events ? ['all', ...new Set(events.map((e) => e.agent))] : ['all']), [events]);
  const filtered = useMemo(() => {
    if (!events) return [];
    return events.filter((e) => (level === 'all' || e.level === level) && (agent === 'all' || e.agent === agent) && (!q || `${e.intent} ${e.action} ${e.actor} ${e.runId || ''}`.toLowerCase().includes(q.toLowerCase())));
  }, [events, q, level, agent]);

  if (!events) return <Loading label="Loading the audit trail…" />;

  return (
    <>
      <div className="page-head">
        <div style={{ flex: 1 }}>
          <div className="eyebrow">Governance</div>
          <h1 className="page-title">Audit trail</h1>
          <p className="page-sub">Every agent step records its intent, action, inputs, outputs and result — not just messages. Gates and failures are marked explicitly.</p>
        </div>
        <Badge tone="gray" dot>{events.length} recent events</Badge>
      </div>

      <Card padded={false}>
        <div style={{ display: 'flex', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 240px' }}>
            <Icon name="search" size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--faint)' }} />
            <input className="input" style={{ paddingLeft: 30 }} placeholder="Search intent, action, actor or run" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="select" style={{ width: 150 }} value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="all">All levels</option>
            <option value="info">Info</option>
            <option value="warn">Warning</option>
            <option value="error">Error</option>
            <option value="gate">Gate</option>
          </select>
          <select className="select" style={{ width: 170 }} value={agent} onChange={(e) => setAgent(e.target.value)}>
            {agents.map((a) => <option key={a} value={a}>{a === 'all' ? 'All agents' : a}</option>)}
          </select>
          <select className="select" style={{ width: 120 }} value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
            {[60, 120, 250].map((n) => <option key={n} value={n}>Last {n}</option>)}
          </select>
        </div>

        <div style={{ maxHeight: 'calc(100vh - 290px)', overflowY: 'auto' }}>
          {filtered.map((e) => (
            <details key={e.id} style={{ borderBottom: '1px solid #eef0f6' }}>
              <summary style={{ cursor: 'pointer', padding: '10px 16px', display: 'flex', gap: 10, alignItems: 'center', listStyle: 'none' }}>
                <Badge tone={LEVEL_TONE[e.level] || 'gray'} dot>{e.level}</Badge>
                <span style={{ fontSize: 12.5, fontWeight: 550, minWidth: 240 }}>{e.intent || e.action}</span>
                <span className="tiny mono">{e.agent}</span>
                <span className="tiny" style={{ marginLeft: 'auto' }}>{e.runId || '—'}</span>
                <span className="tiny" style={{ width: 130, textAlign: 'right' }}>{dateTime(e.ts)}</span>
                <span className="tiny" style={{ width: 56, textAlign: 'right' }}>{e.durationMs ?? 0}ms</span>
              </summary>
              <div style={{ padding: '0 16px 14px 16px' }}>
                <div className="tiny" style={{ marginBottom: 6 }}>{e.action} · actor {e.actor}</div>
                <pre className="code light" style={{ margin: 0, fontSize: 10.5 }}>{JSON.stringify({ inputs: e.inputs, outputs: e.outputs, result: e.result }, null, 2)}</pre>
              </div>
            </details>
          ))}
          {filtered.length === 0 && <div className="empty">No events match this filter.</div>}
        </div>
      </Card>
    </>
  );
}
