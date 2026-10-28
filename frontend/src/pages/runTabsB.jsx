import React, { useMemo, useState } from 'react';
import { dateTime, money, pct, timeAgo, duration } from '../lib/format';
import { Badge, Btn, Card, CopyBtn, EmptyState, Progress, Table } from '../components/ui';
import { Icon } from '../components/icons';

/* --------------------------------- budget --------------------------------- */

const CATEGORY_LABEL = { personnel: 'Manpower', equipment: 'Equipment', consumables: 'Consumables', travel: 'Travel', requirement: 'Faculty requirements' };

export function BudgetTab({ run }) {
  const b = run.budget;
  if (!b) return <EmptyState icon="coins" title="Budget not prepared" description="Group D is costing the proposal." />;

  const categories = ['requirement', 'personnel', 'equipment', 'consumables', 'travel'];
  const grouped = categories.map((c) => ({ category: c, lines: b.lines.filter((l) => l.category === c) })).filter((g) => g.lines.length);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="grid g4" style={{ gap: 12 }}>
        {[
          { label: 'Total request', value: b.formatted.total, foot: `ceiling ${b.formatted.ceiling}` },
          { label: 'Direct costs', value: b.formatted.direct, foot: 'manpower + equipment + consumables + travel' },
          { label: 'Overhead', value: b.formatted.overhead, foot: `${b.rules.overheadPct}% of direct` },
          { label: 'Contingency', value: b.formatted.contingency, foot: `${b.rules.contingencyPct}% of direct` },
        ].map((s) => (
          <div className="card stat" key={s.label}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ fontSize: 22 }}>{s.value}</div>
            <div className="stat-foot">{s.foot}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.7fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
        <Card title="Budget breakdown" subtitle={`${b.lines.length} line items · ${b.durationMonths} months`} actions={<a className="btn sm" href={`/api/runs/${run.id}/files/budget.csv`}><Icon name="download" size={13} /> CSV</a>} padded={false}>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Item</th><th>Basis</th><th className="right">Amount</th></tr></thead>
              <tbody>
                {grouped.map((g) => (
                  <React.Fragment key={g.category}>
                    <tr>
                      <td colSpan={3} style={{ background: 'var(--surface-2)', fontWeight: 650, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)' }}>
                        {CATEGORY_LABEL[g.category]} · {money(g.lines.reduce((a, l) => a + l.amount, 0))}
                      </td>
                    </tr>
                    {g.lines.map((l) => (
                      <tr key={l.id}>
                        <td style={{ fontWeight: 550 }}>{l.item}</td>
                        <td className="tiny">{l.basis}</td>
                        <td className="num">{money(l.amount)}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
                <tr><td colSpan={2} style={{ textAlign: 'right', fontWeight: 600 }}>Direct costs</td><td className="num strong">{money(b.totals.direct)}</td></tr>
                <tr><td colSpan={2} style={{ textAlign: 'right' }}>Overhead ({b.rules.overheadPct}%)</td><td className="num">{money(b.totals.overhead)}</td></tr>
                <tr><td colSpan={2} style={{ textAlign: 'right' }}>Contingency ({b.rules.contingencyPct}%)</td><td className="num">{money(b.totals.contingency)}</td></tr>
                <tr><td colSpan={2} style={{ textAlign: 'right', fontWeight: 700 }}>Total</td><td className="num strong" style={{ color: 'var(--indigo)' }}>{money(b.totals.total)}</td></tr>
              </tbody>
            </table>
          </div>
        </Card>

        <div className="grid" style={{ gap: 16 }}>
          <Card title="Cap checks" subtitle="Agency ceilings, computed live">
            {b.caps.map((c) => (
              <div key={c.key} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 4 }}>
                  <span>{c.label} <span className="tiny">· ceiling {c.capPct}%</span></span>
                  <span className={`badge ${c.status === 'over' ? 'red' : c.status === 'at-limit' ? 'amber' : 'green'}`}>{c.actualPct}%</span>
                </div>
                <Progress value={(c.actualPct / Math.max(c.capPct, 1)) * 100} tone={c.status === 'over' ? 'red' : c.status === 'at-limit' ? 'amber' : 'green'} />
                <div className="tiny" style={{ marginTop: 3 }}>{money(c.amount)} of {money(c.limit)} allowed</div>
              </div>
            ))}
            <div className="divider" />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }}>
              <span>Reconciliation</span>
              <Badge tone={b.reconciliation?.ok ? 'green' : 'red'} dot>{b.reconciliation?.ok ? 'balanced' : `delta ${money(b.reconciliation?.delta)}`}</Badge>
            </div>
            <div className="tiny" style={{ marginTop: 6 }}>{b.reconciliation?.formula} · checked {timeAgo(b.reconciliation?.checkedAt)}</div>
          </Card>

          <Card title="Budget notes" subtitle={`${b.flags.length} recorded basis entries`}>
            {b.flags.length === 0 && <div className="tiny">No adjustments were required.</div>}
            {b.flags.map((f, i) => (
              <div key={i} className={`callout ${f.level === 'error' ? 'danger' : f.level === 'warning' ? 'warn' : ''}`} style={{ marginBottom: 8, fontSize: 11.5, padding: '9px 11px' }}>
                <Icon name={f.level === 'error' ? 'alert' : 'info'} size={13} style={{ marginTop: 2 }} />
                <div><b>{f.category}</b> · {f.message}<div className="tiny" style={{ marginTop: 2 }}>{f.basis}</div></div>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- compliance -------------------------------- */

const STATUS_TONE = { pass: 'green', fail: 'red', warning: 'amber', manual: 'violet' };

export function ComplianceTab({ run }) {
  const c = run.compliance;
  if (!c) return <EmptyState icon="shield" title="Compliance not checked" description="Group E is evaluating the rulebook." />;
  const groups = useMemo(() => {
    const out = {};
    for (const chk of c.checks) (out[chk.category] = out[chk.category] || []).push(chk);
    return out;
  }, [c]);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="grid g4" style={{ gap: 12 }}>
        {[
          { label: 'Passing', value: c.summary.pass, tone: 'green' },
          { label: 'Failing', value: c.summary.fail, tone: 'red' },
          { label: 'Warnings', value: c.summary.warning, tone: 'amber' },
          { label: 'Manual review', value: c.summary.manual, tone: 'violet' },
        ].map((s) => (
          <div className="card stat" key={s.label}>
            <div className={`stat-icon tone-${s.tone}`}><Icon name={s.tone === 'green' ? 'checkCircle' : s.tone === 'red' ? 'xCircle' : s.tone === 'amber' ? 'alert' : 'eye'} size={15} /></div>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ fontSize: 24 }}>{s.value}</div>
            <div className="stat-foot">{c.summary.total} requirements</div>
          </div>
        ))}
      </div>

      <div className="callout info">
        <Icon name="info" size={15} />
        <div>Checked against <b>{c.callTitle}</b> and {c.checkedAgainst.guidelines.length} published guideline locators. Ambiguous requirements are routed to a human rather than guessed.</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
        {Object.entries(groups).map(([category, checks]) => (
          <Card key={category} title={category} subtitle={`${checks.filter((x) => x.status === 'pass').length}/${checks.length} passing`} padded={false}>
            <div style={{ padding: '4px 18px 10px' }}>
              {checks.map((chk) => (
                <div className="check-row" key={chk.id}>
                  <span className={`status-dot ${chk.status}`}>
                    <Icon name={chk.status === 'pass' ? 'check' : chk.status === 'fail' ? 'x' : chk.status === 'manual' ? 'eye' : 'alert'} size={11} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 550 }}>{chk.requirement}</div>
                    <div className="tiny" style={{ marginTop: 2 }}>{chk.evidence}</div>
                    {chk.remediation && <div className="tiny" style={{ marginTop: 3, color: 'var(--amber)' }}>↳ {chk.remediation}</div>}
                    {chk.manual && <Badge tone="violet" style={{ marginTop: 5 }}>human interpretation</Badge>}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------- evidence -------------------------------- */

export function EvidenceTab({ run }) {
  const e = run.evidence;
  if (!e) return <EmptyState icon="scale" title="No evidence record yet" description="Grounding is rebuilt by the validator." />;

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="grid g4" style={{ gap: 12 }}>
        <div className="card stat"><div className="stat-label">Claims</div><div className="stat-value">{e.totalClaims}</div><div className="stat-foot">sentence-level</div></div>
        <div className="card stat"><div className="stat-label">Grounded</div><div className="stat-value" style={{ color: 'var(--green)' }}>{e.groundedClaims}</div><div className="stat-foot">with in-scope source</div></div>
        <div className="card stat"><div className="stat-label">Coverage</div><div className="stat-value">{pct(e.coverage)}</div><div className="stat-foot">{e.records.length} source links</div></div>
        <div className="card stat"><div className="stat-label">Sources</div><div className="stat-value">{e.sourceCount}</div><div className="stat-foot">unique locators</div></div>
      </div>

      {e.rejected.length > 0 && (
        <div className="callout danger">
          <Icon name="alert" size={15} />
          <div><b>{e.rejected.length} claim(s) were rejected as ungrounded.</b> They are removed from the narrative rather than kept without support.</div>
        </div>
      )}

      <Card title="Evidence table" subtitle={e.scope.note} padded={false} actions={<a className="btn sm" href={`/api/runs/${run.id}/files/evidence-table.csv`}><Icon name="download" size={13} /> CSV</a>}>
        <Table
          columns={[
            { key: 'claim', label: 'Claim', render: (r) => <span style={{ fontSize: 12 }}>{r.claimText.length > 150 ? `${r.claimText.slice(0, 150)}…` : r.claimText}</span> },
            { key: 'section', label: 'Section', render: (r) => <span className="tiny">{r.sectionKey}</span> },
            { key: 'source', label: 'Source', render: (r) => (<><div style={{ fontSize: 11.5, fontWeight: 550 }}>{r.sourceTitle}</div><div className="tiny">{r.sourceType} · {r.locator}</div></>) },
            { key: 'inScope', label: 'In scope', align: 'right', render: (r) => <Badge tone={r.inScope ? 'green' : 'red'} dot>{r.inScope ? 'yes' : 'no'}</Badge> },
          ]}
          rows={e.records}
          rowKey={(r, i) => `${r.claimId}-${r.sourceId}-${i}`}
        />
      </Card>
    </div>
  );
}

/* ---------------------------------- package -------------------------------- */

export function PackageTab({ run, actor, canApprove, canRollback, busy, onReview, onRollback }) {
  const pkg = run.package;
  const acceptance = run.acceptance;
  if (!pkg) return <EmptyState icon="inbox" title="Package not assembled" description="Group F packages the artefacts after validation passes." />;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
      <div className="grid" style={{ gap: 16 }}>
        <Card title="Acceptance gate" subtitle="No package advances to human review without a green suite" actions={<Badge tone={acceptance?.allPass ? 'green' : 'red'} dot>{acceptance?.allPass ? 'green' : 'blocked'}</Badge>}>
          <div className="grid g2" style={{ gap: 8 }}>
            {(acceptance?.tests || []).map((t) => (
              <div key={t.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', border: '1px solid var(--line)', borderRadius: 9, padding: '8px 10px', background: t.passed ? '#fbfefc' : '#fff8f7' }}>
                <span className={`status-dot ${t.passed ? 'pass' : 'fail'}`} style={{ marginTop: 0 }}><Icon name={t.passed ? 'check' : 'x'} size={11} /></span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600 }}>{t.name}</div>
                  <div className="tiny">{t.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Submission package" subtitle={`${pkg.submissionId} · version ${pkg.version}`} padded={false}>
          <div style={{ padding: '12px 18px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid var(--line)' }}>
            <Badge tone={pkg.status === 'approved' ? 'green' : 'amber'} dot>{pkg.status}</Badge>
            <span className="tiny">checksum {pkg.checksum.slice(0, 20)}…</span>
            <CopyBtn text={pkg.checksum} />
            <div style={{ flex: 1 }} />
            <span className="tiny">built {timeAgo(pkg.builtAt)}</span>
          </div>
          <Table
            columns={[
              { key: 'name', label: 'File', render: (f) => <span className="mono" style={{ fontSize: 12 }}>{f.name}</span> },
              { key: 'kind', label: 'Kind', render: (f) => <Badge tone="gray">{f.kind}</Badge> },
              { key: 'bytes', label: 'Size', align: 'right', render: (f) => <span className="tiny">{(f.bytes / 1024).toFixed(1)} KB</span> },
              { key: 'action', label: '', align: 'right', render: (f) => <a className="btn sm" href={`/api/runs/${run.id}/files/${encodeURIComponent(f.name)}`}><Icon name="download" size={12} /> Download</a> },
            ]}
            rows={pkg.files}
            rowKey={(f) => f.name}
          />
          <div style={{ padding: '12px 18px', borderTop: '1px solid var(--line)' }}>
            <div className="tiny" style={{ textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>Guardrails</div>
            {pkg.guardrails.map((g, i) => <div key={i} className="tiny" style={{ marginBottom: 4 }}>• {g}</div>)}
          </div>
        </Card>
      </div>

      <div className="grid" style={{ gap: 16 }}>
        <Card title="Authorisation">
          {run.approvals?.decision ? (
            <div>
              <div className="callout ok" style={{ marginBottom: 10 }}>
                <Icon name="checkCircle" size={15} />
                <div>
                  <b style={{ textTransform: 'capitalize' }}>{run.approvals.decision.replace('_', ' ')}</b> by {run.approvals.decidedBy}
                  <div className="tiny">{dateTime(run.approvals.decidedAt)}</div>
                </div>
              </div>
              {run.approvals.notes && <div className="tiny">“{run.approvals.notes}”</div>}
            </div>
          ) : (
            <div>
              <div className="callout warn" style={{ marginBottom: 10 }}>
                <Icon name="clock" size={15} />
                <div><b>Awaiting {run.institution.signatory}.</b><div className="tiny">The package cannot be submitted to the agency until a decision is recorded.</div></div>
              </div>
              <Btn variant="primary" block icon="shield" onClick={onReview} disabled={!canApprove || busy}>
                {canApprove ? 'Record decision' : 'Requires Research Office role'}
              </Btn>
            </div>
          )}
          <div className="divider" />
          <div className="tiny" style={{ marginBottom: 4 }}>Declaration</div>
          <div style={{ fontSize: 11.5, lineHeight: 1.5 }}>{run.declaration?.text}</div>
          <div style={{ marginTop: 8 }}><Badge tone={run.declaration?.status === 'signed' ? 'green' : 'amber'} dot>{run.declaration?.status || 'pending'}</Badge></div>
        </Card>

        <Card title="Versions" subtitle="Immutable, rollback-able" padded={false}>
          <div style={{ padding: '6px 18px 12px' }}>
            {(run.versions || []).length === 0 && <div className="tiny" style={{ padding: 10 }}>No published version yet. Approval creates v1.</div>}
            {(run.versions || []).map((v) => (
              <div key={v.v} className="feed-item" style={{ alignItems: 'center' }}>
                <Badge tone={v.status === 'published' ? 'green' : 'gray'}>v{v.v}</Badge>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 11.5 }}>{v.approvedBy || 'system'}{v.restoredFrom ? ` · restored v${v.restoredFrom}` : ''}</div>
                  <div className="tiny">{dateTime(v.at)}</div>
                </div>
                {canRollback && run.status === 'published' && (
                  <Btn size="sm" variant="ghost" icon="rotate" onClick={() => onRollback(v.v)} disabled={busy}>Rollback</Btn>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card title="Submission record">
          <dl className="kv" style={{ gridTemplateColumns: '110px 1fr' }}>
            <dt>Submitted</dt><dd>{pkg.agencySubmission?.submitted ? 'yes' : 'no'}</dd>
            <dt>Requires sign-off</dt><dd>{pkg.requiresApproval ? 'yes' : 'no'}</dd>
            <dt>Portal ref</dt><dd>{pkg.agencySubmission?.portalReference || '—'}</dd>
            <dt>Documents</dt><dd>{pkg.manifest?.documents?.filter((d) => d.required).length || 0} required</dd>
          </dl>
        </Card>
      </div>
    </div>
  );
}

/* ----------------------------------- audit --------------------------------- */

export function AuditTab({ run }) {
  const [phase, setPhase] = useState('all');
  const logs = run.logs || [];
  const phases = useMemo(() => ['all', ...new Set(logs.map((l) => l.phase))], [logs]);
  const filtered = phase === 'all' ? logs : logs.filter((l) => l.phase === phase);

  return (
    <div className="grid" style={{ gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="tiny">{logs.length} steps · every step records intent, action, inputs and outputs</span>
        <div style={{ flex: 1 }} />
        <select className="select" style={{ width: 180 }} value={phase} onChange={(e) => setPhase(e.target.value)}>
          {phases.map((p) => <option key={p} value={p}>{p === 'all' ? 'All phases' : p}</option>)}
        </select>
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        {filtered.slice().reverse().map((l) => (
          <details key={l.id} style={{ borderBottom: '1px solid #eef0f6' }}>
            <summary style={{ cursor: 'pointer', padding: '10px 16px', display: 'flex', gap: 10, alignItems: 'center', listStyle: 'none' }}>
              <span className={`feed-dot ${l.result === 'error' ? 'err' : l.level === 'warn' ? 'warn' : 'ok'}`} />
              <span style={{ fontWeight: 550, fontSize: 12 }}>{l.intent}</span>
              <span className="tiny mono">{l.agent}</span>
              <span className="tiny" style={{ marginLeft: 'auto' }}>{l.phase} · {l.durationMs ?? 0}ms</span>
            </summary>
            <div style={{ padding: '0 16px 14px 40px' }}>
              <div className="tiny" style={{ marginBottom: 6 }}>{l.action}</div>
              <pre className="code light" style={{ margin: 0, fontSize: 10.5 }}>{JSON.stringify({ inputs: l.inputs, outputs: l.outputs, result: l.result }, null, 2)}</pre>
            </div>
          </details>
        ))}
        {filtered.length === 0 && <div className="tiny" style={{ padding: 20 }}>No steps in this phase.</div>}
      </div>
    </div>
  );
}
