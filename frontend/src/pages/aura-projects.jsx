import React, { useEffect, useMemo, useState } from 'react';
import { endpoints } from '../lib/api';
import { useApp } from '../App';
import { Badge, Btn, Card, Loading, Modal, Table, useToast } from '../components/ui';
import { Icon } from '../components/icons';
import { compactMoney, money } from '../lib/format';
import BudgetEditor from '../components/BudgetEditor';

const STATUS = <Badge tone="green" dot>Approved</Badge>;

export default function Projects() {
  const { navigate } = useApp();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [year, setYear] = useState('all');
  const [dept, setDept] = useState('all');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState(null);
  const [budget, setBudget] = useState([]);
  const [saving, setSaving] = useState(false);

  const load = () => endpoints.projects().then(setData).catch(() => {});
  useEffect(() => { load(); }, []);

  const projects = useMemo(() => {
    if (!data?.projects) return [];
    return data.projects.filter((p) =>
      (year === 'all' || p.year === year) &&
      (dept === 'all' || p.department === dept) &&
      (!q || `${p.title} ${p.agency} ${p.pi.join(' ')} ${p.department}`.toLowerCase().includes(q.toLowerCase())));
  }, [data, year, dept, q]);

  const open = (project) => {
    setSelected(project);
    setBudget(project.budgetLines?.length ? project.budgetLines : [{ requirement: '', cost: '' }]);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await endpoints.saveProjectBudget(selected.id, budget);
      toast.push(`Budget saved for ${selected.id} — ${money(res.total)}.`, 'ok');
      setSelected(res.project);
      setBudget(res.project.budgetLines?.length ? res.project.budgetLines : [{ requirement: '', cost: '' }]);
      load();
    } catch (err) {
      toast.push(err.message, 'err');
    } finally {
      setSaving(false);
    }
  };

  if (!data) return <Loading label="Loading the sanctioned project portfolio…" />;

  const s = data.summary;

  return (
    <>
      <div className="page-head">
        <div style={{ flex: 1 }}>
          <div className="eyebrow">Institutional portfolio</div>
          <h1 className="page-title">Projects</h1>
          <p className="page-sub">All sanctioned projects from 2020-21 to 2023-24. Every project is recorded as approved; completion status is intentionally not tracked. Budgets are entered by faculty as Requirement + Cost.</p>
        </div>
        <div className="chips">
          <Badge tone="green" dot>{s.approved} approved</Badge>
          <Badge tone="gray">{s.years.length} academic years</Badge>
        </div>
      </div>

      <div className="grid g4" style={{ gap: 12, marginBottom: 16 }}>
        <div className="card stat"><div className="stat-icon tone-indigo"><Icon name="layers" size={15} /></div><div className="stat-label">Projects</div><div className="stat-value">{s.count}</div><div className="stat-foot">all approved</div></div>
        <div className="card stat"><div className="stat-label">Sanctioned value</div><div className="stat-value">{compactMoney(s.totalLakh * 100000)}</div><div className="stat-foot">{s.totalLakh.toFixed(2)} lakh</div></div>
        <div className="card stat"><div className="stat-label">Funding agencies</div><div className="stat-value">{s.agencies}</div><div className="stat-foot">SERB · VGST · MeitY · AICTE · industry</div></div>
        <div className="card stat"><div className="stat-label">Departments</div><div className="stat-value">{s.departments}</div><div className="stat-foot">cross-institutional</div></div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <select className="select" style={{ width: 150 }} value={year} onChange={(e) => setYear(e.target.value)}>
          <option value="all">All years</option>
          {data.years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select className="select" style={{ width: 170 }} value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="all">All departments</option>
          {data.departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <div style={{ position: 'relative', flex: '1 1 240px' }}>
          <Icon name="search" size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--faint)' }} />
          <input className="input" style={{ paddingLeft: 30 }} placeholder="Search project, PI or agency" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="tiny">{projects.length} shown</span>
      </div>

      <Card padded={false}>
        <Table
          columns={[
            { key: 'year', label: 'Year', width: 92, render: (p) => <Badge tone="gray">{p.year}</Badge> },
            { key: 'department', label: 'Dept', width: 80, render: (p) => <span className="strong" style={{ fontSize: 11.5 }}>{p.department}</span> },
            { key: 'title', label: 'Project', render: (p) => (<><div className="row-title">{p.title}</div><div className="row-sub">{p.pi.join(' · ')}</div></>) },
            { key: 'agency', label: 'Funding agency', render: (p) => <span style={{ fontSize: 12 }}>{p.agency}</span> },
            { key: 'amountLakh', label: 'Amount', align: 'right', render: (p) => <span className="num">{p.amountLakh ? `₹${p.amountLakh.toFixed(2)} L` : 'In-kind'}</span> },
            { key: 'status', label: 'Status', align: 'right', render: () => STATUS },
            { key: 'go', label: '', align: 'right', render: (p) => <Btn size="sm" variant="ghost" iconRight="chevronRight" onClick={() => open(p)}>Budget</Btn> },
          ]}
          rows={projects}
          rowKey={(p) => p.id}
          empty="No projects match this filter."
        />
      </Card>

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.title}
        subtitle={selected ? `${selected.year} · ${selected.department} · ${selected.agency}` : ''}
        width={860}
        footer={<><Btn onClick={() => setSelected(null)}>Close</Btn><Btn variant="primary" icon="check" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save budget'}</Btn></>}
      >
        {selected && (
          <div className="grid" style={{ gap: 14 }}>
            <div className="grid g2" style={{ gap: 12 }}>
              <dl className="kv" style={{ gridTemplateColumns: '105px 1fr' }}>
                <dt>Year</dt><dd>{selected.year}</dd>
                <dt>Department</dt><dd>{selected.department}</dd>
                <dt>PI</dt><dd>{selected.pi.join(', ')}</dd>
                {selected.coPIs?.length > 0 && <><dt>Co-PI</dt><dd>{selected.coPIs.join(', ')}</dd></>}
              </dl>
              <dl className="kv" style={{ gridTemplateColumns: '105px 1fr' }}>
                <dt>Agency</dt><dd>{selected.agency}</dd>
                <dt>Sanctioned</dt><dd>{selected.amountLakh ? `${money(selected.amountLakh * 100000)} (₹${selected.amountLakh.toFixed(2)} L)` : 'In-kind'}</dd>
                <dt>Status</dt><dd><Badge tone="green" dot>Approved</Badge></dd>
                <dt>Budget</dt><dd>{selected.budgetTotal ? money(selected.budgetTotal) : 'Not entered'}</dd>
              </dl>
            </div>
            {selected.amountNote && <div className="callout"><Icon name="info" size={14} /><div>{selected.amountNote}</div></div>}
            <div>
              <div className="stat-label" style={{ marginBottom: 6 }}>Faculty budget — requirement &amp; cost</div>
              <BudgetEditor lines={budget} onChange={setBudget} />
            </div>
            {selected.budgetUpdatedBy && (
              <div className="tiny">Last saved by {selected.budgetUpdatedBy}. LLM drafting never sets these numbers.</div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
