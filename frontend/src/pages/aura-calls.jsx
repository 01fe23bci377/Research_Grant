import React, { useMemo, useState } from 'react';
import { endpoints } from '../lib/api';
import { compactMoney, date, money } from '../lib/format';
import { Badge, Btn, Card, EmptyState, Loading, Modal } from '../components/ui';
import { Icon } from '../components/icons';

export default function Calls() {
  const [calls, setCalls] = useState(null);
  const [type, setType] = useState('all');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState(null);

  React.useEffect(() => {
    endpoints.calls().then((d) => setCalls(d.calls)).catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    if (!calls) return [];
    return calls.filter((c) => (type === 'all' || c.fundingType === type) && (!q || `${c.title} ${c.agency} ${c.tags.join(' ')}`.toLowerCase().includes(q.toLowerCase())));
  }, [calls, type, q]);

  if (!calls) return <Loading label="Loading the verified catalogue…" />;

  const active = calls.filter((c) => c.active).length;

  return (
    <>
      <div className="page-head">
        <div style={{ flex: 1 }}>
          <div className="eyebrow">Catalogue</div>
          <h1 className="page-title">Funding calls</h1>
          <p className="page-sub">{active} active calls from approved agencies. Unverified listings and expired calls are withheld from discovery — they remain here only so the guardrail is inspectable.</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div className="seg">
          {['all', 'government', 'industry', 'international'].map((t) => (
            <button key={t} className={type === t ? 'on' : ''} onClick={() => setType(t)}>{t === 'all' ? 'All funders' : t === 'industry' ? 'Industry / CSR' : t[0].toUpperCase() + t.slice(1)}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ position: 'relative' }}>
          <Icon name="search" size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--faint)' }} />
          <input className="input" style={{ paddingLeft: 30, width: 260 }} placeholder="Search calls or tags" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="grid g2" style={{ gap: 14 }}>
        {filtered.map((c) => (
          <Card key={c.id} className="call-card" padded={false}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="tiny" style={{ letterSpacing: '.05em', textTransform: 'uppercase' }}>{c.agencyFull}</div>
                <div className="strong" style={{ fontSize: 13.5, marginTop: 3 }}>{c.title}</div>
                <div className="tiny" style={{ marginTop: 3 }}>{c.program}</div>
              </div>
              {c.active ? <Badge tone="green" dot>active</Badge> : c.verified ? <Badge tone="gray" dot>closed</Badge> : <Badge tone="red" dot>unverified</Badge>}
            </div>
            <div className="call-meta">
              <Badge tone="indigo">{c.fundingType}</Badge>
              <Badge tone="gray">{c.durationMonths} months</Badge>
              <Badge tone="gray">{c.pageLimit} pages</Badge>
              {c.verified && <Badge tone="teal">approved agency</Badge>}
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
              <div><div className="stat-label">Range</div><div>{compactMoney(c.budgetMin)} – {compactMoney(c.budgetMax)}</div></div>
              <div><div className="stat-label">Deadline</div><div>{date(c.deadline)}{c.active ? ` · ${c.daysLeft}d` : ''}</div></div>
              <div><div className="stat-label">Guidelines</div><div>{c.guidelines.length} locators</div></div>
            </div>
            <div className="chips">
              {c.tags.slice(0, 4).map((t) => <span className="chip" key={t}>{t}</span>)}
              {c.tags.length > 4 && <span className="chip">+{c.tags.length - 4}</span>}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', borderTop: '1px solid var(--line)', paddingTop: 10, marginTop: 'auto' }}>
              <span className="tiny mono">{c.id}</span>
              <div style={{ flex: 1 }} />
              <Btn size="sm" variant="ghost" iconRight="chevronRight" onClick={() => setSelected(c)}>Details</Btn>
            </div>
          </Card>
        ))}
      </div>
      {filtered.length === 0 && <Card><EmptyState icon="search" title="No calls match" description="Try a different filter or search term." /></Card>}

      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.title} subtitle={selected ? `${selected.agencyFull} · ${selected.program}` : ''} width={720}>
        {selected && (
          <div className="grid" style={{ gap: 16 }}>
            <div className="chips">
              <Badge tone={selected.active ? 'green' : 'gray'} dot>{selected.active ? 'active' : 'not active'}</Badge>
              <Badge tone="indigo">{selected.fundingType}</Badge>
              <Badge tone="gray">deadline {date(selected.deadline)}</Badge>
              {!selected.verified && <Badge tone="red">unverified source</Badge>}
            </div>
            <dl className="kv" style={{ gridTemplateColumns: '140px 1fr' }}>
              <dt>Award range</dt><dd>{money(selected.budgetMin)} – {money(selected.budgetMax)}</dd>
              <dt>Duration</dt><dd>up to {selected.durationMonths} months</dd>
              <dt>Eligibility</dt><dd>{selected.eligibility.careerStages.join(', ')} · {selected.eligibility.institutionTypes.join(', ')}</dd>
              <dt>Consortium</dt><dd>{selected.eligibility.consortiumRequired ? `required · min ${selected.eligibility.minPartners} partners` : 'not required'}</dd>
              <dt>Budget rules</dt><dd>overhead {selected.budgetRules.overheadPct}% · manpower ≤ {selected.budgetRules.salaryCapPct}% · equipment ≤ {selected.budgetRules.equipmentCapPct}% · travel ≤ {selected.budgetRules.travelCapPct}%</dd>
              <dt>Required sections</dt><dd>{selected.requiredSections.length} sections</dd>
              <dt>Source</dt><dd><a href={selected.sourceUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--indigo)' }}>{selected.sourceUrl} <Icon name="external" size={11} /></a></dd>
            </dl>
            <div>
              <div className="stat-label" style={{ marginBottom: 6 }}>Published guidelines (evidence locators)</div>
              {selected.guidelines.map((g) => (
                <div key={g.id} style={{ padding: '8px 0', borderBottom: '1px solid #f0f2f7' }}>
                  <div className="tiny mono">{g.id} · {g.section}</div>
                  <div style={{ fontSize: 12.5 }}>{g.text}</div>
                </div>
              ))}
            </div>
            <div>
              <div className="stat-label" style={{ marginBottom: 6 }}>Review criteria</div>
              {selected.reviewCriteria.map((r) => (
                <div key={r.criterion} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
                  <span>{r.criterion}</span><span className="strong">{Math.round(r.weight * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
