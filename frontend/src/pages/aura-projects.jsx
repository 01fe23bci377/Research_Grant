import React, { useEffect, useMemo, useState } from 'react';
import { endpoints } from '../lib/api';
import { useApp } from '../App';
import { Badge, Btn, Card, Loading, Modal, Table, useToast } from '../components/ui';
import { Icon } from '../components/icons';
import { compactMoney, money } from '../lib/format';
import { BudgetEditor } from '../components/BudgetEditor';

const STATUS = <Badge tone="green" dot>Approved</Badge>;

export default function Projects() {
  const { navigate, actor } = useApp();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [year, setYear] = useState('all');
  const [dept, setDept] = useState('all');
  const [faculty, setFaculty] = useState('all');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState(null);
  const [budget, setBudget] = useState([]);
  const [saving, setSaving] = useState(false);

  const load = () => endpoints.projects().then(setData).catch(() => {});
  useEffect(() => { load(); }, []);

  const cleanActor = useMemo(() => {
    return String(actor?.Name || actor?.name || '')
      .replace(/^(Dr\.|Prof\.|Mr\.|Mrs\.|Ms\.)\s*/i, '')
      .toLowerCase()
      .trim();
  }, [actor]);

  const projects = useMemo(() => {
    if (!data?.projects) return [];
    return data.projects.filter((p) => {
      const matchYear = year === 'all' || p.year === year;
      const matchDept = dept === 'all' || p.department === dept;
      const matchQ =
        !q ||
        `${p.title} ${p.agency} ${(p.pi || []).join(' ')} ${(p.coPIs || []).join(' ')} ${p.department}`
          .toLowerCase()
          .includes(q.toLowerCase());

      let matchFac = true;
      if (faculty !== 'all') {
        const clean = faculty.replace(/^(Dr\.|Prof\.|Mr\.|Mrs\.|Ms\.)\s*/i, '').toLowerCase().trim();
        const all = [...(p.pi || []), ...(p.coPIs || [])].join(' ').toLowerCase();
        matchFac = all.includes(clean);
      }

      return matchYear && matchDept && matchQ && matchFac;
    });
  }, [data, year, dept, q, faculty]);

  const myCount = useMemo(() => {
    if (!data?.projects || !cleanActor) return 0;
    return data.projects.filter((p) => {
      const all = [...(p.pi || []), ...(p.coPIs || [])].join(' ').toLowerCase();
      return all.includes(cleanActor);
    }).length;
  }, [data, cleanActor]);

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

  if (!data) return <Loading label="Loading the sanctioned project portfolio from MongoDB…" />;

  const s = data.summary;

  return (
    <>
      <div className="page-head">
        <div style={{ flex: 1 }}>
          <div className="eyebrow">Institutional portfolio · MongoDB Atlas</div>
          <h1 className="page-title">Sanctioned Projects</h1>
          <p className="page-sub">
            All approved institutional grants from 2020-21 to 2023-24. Project details and faculty names are pulled directly from MongoDB Atlas using Mongoose ORM. Budgets are entered by faculty as Requirement + Cost.
          </p>
        </div>
        <div className="chips">
          <Badge tone="green" dot>{s.approved} approved</Badge>
          <Badge tone="indigo">Mongoose ORM</Badge>
          <Badge tone="gray">{s.years.length} academic years</Badge>
        </div>
      </div>

      <div className="grid g4" style={{ gap: 12, marginBottom: 16 }}>
        <div className="card stat"><div className="stat-icon tone-indigo"><Icon name="layers" size={15} /></div><div className="stat-label">Projects</div><div className="stat-value">{s.count}</div><div className="stat-foot">all approved (MongoDB)</div></div>
        <div className="card stat"><div className="stat-label">Sanctioned value</div><div className="stat-value">{compactMoney(s.totalLakh * 100000)}</div><div className="stat-foot">{s.totalLakh.toFixed(2)} lakh total</div></div>
        <div className="card stat"><div className="stat-label">Funding agencies</div><div className="stat-value">{s.agencies}</div><div className="stat-foot">SERB · VGST · MeitY · AICTE · DST</div></div>
        <div className="card stat"><div className="stat-label">Departments</div><div className="stat-value">{s.departments}</div><div className="stat-foot">cross-institutional</div></div>
      </div>

      {/* Filter toolbar */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <select className="select" style={{ width: 140 }} value={year} onChange={(e) => setYear(e.target.value)}>
          <option value="all">All years</option>
          {data.years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>

        <select className="select" style={{ width: 170 }} value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="all">All departments</option>
          {data.departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>

        {/* Dynamic Faculty select pulled live from MongoDB User collection */}
        <select className="select" style={{ width: 220 }} value={faculty} onChange={(e) => setFaculty(e.target.value)}>
          <option value="all">All Faculty / PIs (MongoDB)</option>
          {(data.faculties || []).map((f) => (
            <option key={f.id || f.Name} value={f.Name}>
              {f.Name} ({f.Dept})
            </option>
          ))}
        </select>

        {cleanActor && (
          <Btn
            size="sm"
            variant={faculty === actor?.name || faculty === actor?.Name ? 'primary' : 'ghost'}
            icon="user"
            onClick={() => {
              if (faculty === actor?.name || faculty === actor?.Name) {
                setFaculty('all');
              } else {
                setFaculty(actor?.Name || actor?.name);
              }
            }}
            title="Filter to projects where you are involved"
          >
            My Grants ({myCount})
          </Btn>
        )}

        <div style={{ position: 'relative', flex: '1 1 200px' }}>
          <Icon name="search" size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--faint)' }} />
          <input className="input" style={{ paddingLeft: 30 }} placeholder="Search project, PI or agency" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        {(year !== 'all' || dept !== 'all' || faculty !== 'all' || q) && (
          <Btn size="sm" variant="ghost" onClick={() => { setYear('all'); setDept('all'); setFaculty('all'); setQ(''); }}>
            Reset
          </Btn>
        )}

        <span className="tiny">{projects.length} shown</span>
      </div>

      <Card padded={false}>
        <Table
          columns={[
            { key: 'year', label: 'Year', width: 92, render: (p) => <Badge tone="gray">{p.year}</Badge> },
            { key: 'department', label: 'Dept', width: 80, render: (p) => <span className="strong" style={{ fontSize: 11.5 }}>{p.department}</span> },
            {
              key: 'title',
              label: 'Project & Investigators',
              render: (p) => (
                <>
                  <div className="row-title">{p.title}</div>
                  <div className="row-sub">
                    <b>PI:</b> {(p.pi || []).join(' · ')}
                    {p.coPIs && p.coPIs.length > 0 && <span> · <b>Co-PI:</b> {p.coPIs.join(' · ')}</span>}
                  </div>
                </>
              ),
            },
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

      {/* Budget modal */}
      {selected && (
        <Modal
          title={`Faculty Budget — ${selected.id}`}
          subtitle={`${selected.title} · ${selected.year} · ${selected.department} · ${selected.agency}`}
          onClose={() => setSelected(null)}
          width={640}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)' }}>
              Faculty-owned budget breakdown in rupees. Stored directly in MongoDB.
            </p>
            <BudgetEditor lines={budget} onChange={setBudget} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <Btn variant="ghost" onClick={() => setSelected(null)} disabled={saving}>Cancel</Btn>
              <Btn variant="primary" icon="check" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save Budget'}
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
