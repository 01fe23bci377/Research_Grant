import React, { useMemo, useState } from 'react';
import { endpoints } from '../lib/api';
import { compactMoney, money } from '../lib/format';
import { useApp } from '../App';
import { Badge, Btn, Card, Field, useToast } from '../components/ui';
import { Icon } from '../components/icons';
import BudgetEditor from '../components/BudgetEditor';

const EXAMPLES = [
  {
    label: 'Rural eye screening',
    area: 'Federated learning for diabetic retinopathy screening in rural primary care',
    keywords: ['federated learning', 'diabetic retinopathy', 'screening', 'rural health', 'medical imaging'],
    type: 'government', budget: 5800000, duration: 36, human: true, setting: 'rural primary care',
  },
  {
    label: 'Engineering education',
    area: 'Learning analytics and AI tutoring for first-year engineering outcomes',
    keywords: ['learning analytics', 'education technology', 'engineering education'],
    type: 'industry', budget: 4200000, duration: 24, human: false, setting: 'underserved colleges',
  },
  {
    label: 'Trustworthy health AI',
    area: 'Trustworthy federated AI for cross-border health systems',
    keywords: ['trustworthy ai', 'federated learning', 'health systems', 'data governance'],
    type: 'international', budget: 24000000, duration: 36, human: true, setting: 'multi-country hospital networks',
  },
];

const FAULTS = [
  { id: 'missing-section', label: 'Drop the methodology section' },
  { id: 'budget-mismatch', label: 'Break budget reconciliation (+₹75,000 on a line)' },
  { id: 'cap-breach', label: 'Push equipment past its agency ceiling' },
  { id: 'ungrounded-claim', label: 'Insert an unsupported “preliminary results” claim' },
  { id: 'missing-ethics', label: 'Remove the ethics clearance from the register' },
  { id: 'expired-call', label: 'Point the run at an expired call' },
];

export default function Intake() {
  const { navigate, actor } = useApp();
  const toast = useToast();
  const [form, setForm] = useState({
    request: '',
    researchArea: '',
    keywordsText: '',
    fundingType: 'government',
    budget: 5800000,
    budgetLines: [{ requirement: '', cost: '' }],
    duration: 36,
    careerStage: 'associate',
    humanSubjects: true,
    setting: '',
    sites: 4,
    sampleSize: 2400,
    consent: true,
  });
  const [step, setStep] = useState(1);
  const [review, setReview] = useState(null);
  const [intake, setIntake] = useState(null);
  const [loading, setLoading] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [faults, setFaults] = useState([]);
  const [showFaults, setShowFaults] = useState(false);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const keywords = useMemo(() => form.keywordsText.split(',').map((k) => k.trim()).filter(Boolean), [form.keywordsText]);

  const budgetLines = (form.budgetLines || [])
    .map((l) => ({ requirement: String(l.requirement || '').trim(), cost: Math.max(0, Math.round(Number(l.cost) || 0)) }))
    .filter((l) => l.requirement && l.cost > 0);
  const budgetTotal = budgetLines.reduce((sum, l) => sum + l.cost, 0);
  const params = () => ({
    researchArea: form.researchArea || form.request,
    keywords,
    fundingType: form.fundingType,
    requestedBudget: budgetTotal,
    budgetLines,
    durationMonths: Number(form.duration),
    careerStage: form.careerStage,
    institutionType: 'university',
    humanSubjects: form.humanSubjects,
    setting: form.setting,
    sites: Number(form.sites) || 4,
    sampleSize: Number(form.sampleSize) || 2400,
  });

  const applyExample = (ex) => {
    set({
      request: `${ex.area}.`,
      researchArea: ex.area,
      keywordsText: ex.keywords.join(', '),
      fundingType: ex.type,
      budget: ex.budget,
      budgetLines: [{ requirement: 'Total project cost (edit this breakdown)', cost: ex.budget }],
      duration: ex.duration,
      humanSubjects: ex.human,
      setting: ex.setting,
    });
  };

  const prepare = async () => {
    if (!(form.researchArea || form.request).trim()) {
      toast.push('Describe the research area first.', 'err');
      return;
    }
    setLoading(true);
    try {
      const body = { request: form.request || `${form.researchArea}.`, params: params() };
      const [preview, check] = await Promise.all([
        endpoints.planPreview(body),
        endpoints.clarify({ request: body.request, params: { ...params(), consent: form.consent } }),
      ]);
      setReview(preview);
      setIntake(check);
      setStep(2);
    } catch (err) {
      toast.push(err.message, 'err');
    } finally {
      setLoading(false);
    }
  };

  const launch = async () => {
    setLaunching(true);
    try {
      const { run } = await endpoints.startRun({
        request: form.request || `${form.researchArea}.`,
        params: params(),
        consent: form.consent,
        faults,
      });
      toast.push(`Run ${run.id} started — the coordinator is building the plan.`, 'ok');
      navigate(`/runs/${run.id}`);
    } catch (err) {
      toast.push(err.message, 'err');
      setLaunching(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div style={{ flex: 1 }}>
          <div className="eyebrow">Workspace</div>
          <h1 className="page-title">New proposal</h1>
          <p className="page-sub">Gate 1 clarifies the brief before anything is drafted. The coordinator then locks a plan, fans out to the specialists, and routes the package through validation to human sign-off.</p>
        </div>
        <div className="seg">
          <button className={step === 1 ? 'on' : ''} onClick={() => setStep(1)}>1 · Brief</button>
          <button className={step === 2 ? 'on' : ''} onClick={() => review && setStep(2)}>2 · Plan &amp; launch</button>
        </div>
      </div>

      {step === 1 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.55fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
          <Card title="Faculty brief" subtitle="What should the system plan for?">
            <div className="chips" style={{ marginBottom: 14 }}>
              {EXAMPLES.map((ex) => <button key={ex.label} className="chip" onClick={() => applyExample(ex)}><Icon name="sparkles" size={11} />{ex.label}</button>)}
            </div>

            <div className="grid" style={{ gap: 14 }}>
              <Field label="Research area" hint="Specific, with population and setting — this drives discovery, literature and the draft.">
                <textarea className="textarea" rows={3} placeholder="e.g. Federated learning for diabetic retinopathy screening in rural primary care" value={form.researchArea} onChange={(e) => set({ researchArea: e.target.value })} />
              </Field>

              <Field label="Free-text request (optional)" hint="Kept for the audit trail; the structured research area is what the agents use.">
                <textarea className="textarea" rows={2} placeholder="Anything else the Dean or faculty member asked for…" value={form.request} onChange={(e) => set({ request: e.target.value })} />
              </Field>

              <Field label="Keywords" hint="Comma-separated. Discovery matches these against agency scopes.">
                <input className="input" value={form.keywordsText} onChange={(e) => set({ keywordsText: e.target.value })} placeholder="federated learning, diabetic retinopathy, screening" />
              </Field>
              {keywords.length > 0 && <div className="chips">{keywords.map((k) => <span className="chip on" key={k}>{k}</span>)}</div>}

              <div className="grid g2" style={{ gap: 12 }}>
                <Field label="Funder type">
                  <div className="seg" style={{ width: '100%' }}>
                    {['government', 'industry', 'international'].map((t) => (
                      <button key={t} className={form.fundingType === t ? 'on' : ''} style={{ flex: 1 }} onClick={() => set({ fundingType: t })}>{t === 'government' ? 'Government' : t === 'industry' ? 'Industry / CSR' : 'International'}</button>
                    ))}
                  </div>
                </Field>
                <div style={{ gridColumn: '1 / -1' }}>
                  <div className="stat-label" style={{ marginBottom: 6 }}>Budget — entered by faculty</div>
                  <BudgetEditor lines={form.budgetLines} onChange={(lines) => set({ budgetLines: lines })} compact />
                </div>
              </div>

              <div className="grid g3" style={{ gap: 12 }}>
                <Field label="Duration">
                  <select className="select" value={form.duration} onChange={(e) => set({ duration: Number(e.target.value) })}>
                    {[12, 18, 24, 36, 48].map((m) => <option key={m} value={m}>{m} months</option>)}
                  </select>
                </Field>
                <Field label="PI career stage">
                  <select className="select" value={form.careerStage} onChange={(e) => set({ careerStage: e.target.value })}>
                    <option value="assistant">Assistant Professor</option>
                    <option value="associate">Associate Professor</option>
                    <option value="professor">Professor</option>
                  </select>
                </Field>
                <Field label="Setting">
                  <input className="input" value={form.setting} onChange={(e) => set({ setting: e.target.value })} placeholder="rural primary care" />
                </Field>
              </div>

              <div className="grid g3" style={{ gap: 12 }}>
                <Field label="Sites"><input className="input" type="number" min="1" max="20" value={form.sites} onChange={(e) => set({ sites: e.target.value })} /></Field>
                <Field label="Participants"><input className="input" type="number" min="50" step="50" value={form.sampleSize} onChange={(e) => set({ sampleSize: e.target.value })} /></Field>
                <Field label="Human subjects">
                  <label className="check" style={{ paddingTop: 8 }}>
                    <input type="checkbox" checked={form.humanSubjects} onChange={(e) => set({ humanSubjects: e.target.checked })} />
                    Triggers ethics + DMP requirements
                  </label>
                </Field>
              </div>

              <label className="check" style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10, padding: 12 }}>
                <input type="checkbox" checked={form.consent} onChange={(e) => set({ consent: e.target.checked })} />
                <span><b>Gate 1 consent.</b> I consent to profile and publication matching against this research area, and understand that the draft requires faculty review before submission.</span>
              </label>

              <div>
                <button className="btn ghost sm" onClick={() => setShowFaults((v) => !v)}>
                  <Icon name="zap" size={13} /> {showFaults ? 'Hide' : 'Show'} failure injection (Lab 10)
                </button>
                {showFaults && (
                  <div style={{ marginTop: 10, border: '1px dashed var(--line-strong)', borderRadius: 12, padding: 12 }}>
                    <div className="tiny" style={{ marginBottom: 8 }}>The pipeline will detect these and repair only the affected artifact within the retry budget. Useful for demonstrating self-healing.</div>
                    <div className="grid g2" style={{ gap: 6 }}>
                      {FAULTS.map((f) => (
                        <label className="check" key={f.id}>
                          <input type="checkbox" checked={faults.includes(f.id)} onChange={(e) => setFaults((list) => e.target.checked ? [...list, f.id] : list.filter((x) => x !== f.id))} />
                          {f.label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
              <Btn variant="primary" icon="arrowRight" onClick={prepare} disabled={loading}>
                {loading ? 'Preparing…' : 'Prepare plan'}
              </Btn>
              <Btn variant="ghost" onClick={() => applyExample(EXAMPLES[0])}>Use default brief</Btn>
            </div>
          </Card>

          <div className="grid" style={{ gap: 16 }}>
            <Card title="What happens next" subtitle="The eight-agent operating model">
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.9, color: 'var(--ink-2)' }}>
                <li>Gate 1 clarifies the brief and checks consent.</li>
                <li>Coordinator locks a plan from the domain template.</li>
                <li>Group A and Group B run in parallel: calls and literature.</li>
                <li>Group C drafts; Groups D and E cost and check in parallel.</li>
                <li>Validation repairs only what fails, within a bounded budget.</li>
                <li>Group F packages; the acceptance suite is a hard gate.</li>
                <li>Dean R&amp;D / Research Office sign-off publishes a version.</li>
              </ol>
            </Card>
            <div className="callout info">
              <Icon name="lock" size={15} />
              <div>
                <b>Nothing is submitted automatically.</b>
                <p style={{ margin: '3px 0 0' }}>The package is held at draft until an authorised signatory records a decision. Every figure and claim is traceable to a source.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {step === 2 && review && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
          <div className="grid" style={{ gap: 16 }}>
            <Card title="Clarified request" subtitle="Gate 1 output" actions={<Badge tone={intake?.complete ? 'green' : 'amber'} dot>{intake?.complete ? 'Complete' : 'Needs input'}</Badge>}>
              <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>{review.clarified.statement}</p>
              <div className="chips" style={{ marginTop: 12 }}>
                {(review.clarified.keywords || []).map((k) => <span className="chip" key={k}>{k}</span>)}
                {(review.clarified.domains || []).map((d) => <Badge key={d} tone="indigo">{d}</Badge>)}
              </div>
              {!intake?.complete && (
                <div className="callout warn" style={{ marginTop: 14 }}>
                  <Icon name="alert" size={15} />
                  <div>
                    <b>The coordinator needs more before Gate 1 can start:</b>
                    <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                      {intake.questions.map((q, i) => <li key={i}>{q}</li>)}
                    </ul>
                    <Btn size="sm" style={{ marginTop: 10 }} icon="arrowRight" onClick={() => setStep(1)}>Back to the brief</Btn>
                  </div>
                </div>
              )}
            </Card>

            <Card title="Locked run plan" subtitle={`${review.specialist.label} template · ${review.plan.units.length} units`} actions={<Badge tone="indigo" outline>v{review.plan.version} · {review.plan.checksum.slice(0, 10)}</Badge>}>
              <div className="tiny" style={{ marginBottom: 10 }}>{review.plan.goal}</div>
              <div className="grid g2" style={{ gap: 8, marginBottom: 14 }}>
                {review.plan.phases.map((p) => (
                  <div key={p.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '9px 11px', background: 'var(--surface-2)' }}>
                    <div className="strong" style={{ fontSize: 12 }}>{p.label}</div>
                    <div className="tiny">{p.mode} · {p.agents.join(', ')}{p.gate ? ' · gate' : ''}</div>
                  </div>
                ))}
              </div>
              <div className="tiny" style={{ textTransform: 'uppercase', letterSpacing: '.09em', marginBottom: 6 }}>Drafting units</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {review.plan.units.map((u) => (
                  <span key={u.key} className="chip" title={`${u.minWords}+ words · ${u.purpose}`}>
                    <Icon name="file" size={11} /> {u.title}
                  </span>
                ))}
              </div>
              <div className="callout" style={{ marginTop: 14 }}>
                <Icon name="info" size={15} />
                <div>The plan locks at launch. Once a call is matched, the coordinator reconciles required sections to that call's published guidelines — extra template units are kept, missing required units are added.</div>
              </div>
            </Card>
          </div>

          <div className="grid" style={{ gap: 16 }}>
            <Card title="Launch" subtitle="Starts the eight-agent pipeline">
              <dl className="kv">
                <dt>Funder type</dt><dd style={{ textTransform: 'capitalize' }}>{form.fundingType}</dd>
                <dt>Budget total</dt><dd>{money(budgetTotal)}</dd>
                <dt>Duration</dt><dd>{form.duration} months</dd>
                <dt>Human subjects</dt><dd>{form.humanSubjects ? 'Yes — ethics + DMP' : 'No'}</dd>
                <dt>Failure injection</dt><dd>{faults.length ? faults.join(', ') : 'None'}</dd>
                <dt>Acting as</dt><dd>{actor?.name}</dd>
              </dl>
              <Btn variant="primary" block icon="play" style={{ marginTop: 16 }} onClick={launch} disabled={!intake?.complete || launching}>
                {launching ? 'Starting…' : 'Launch run'}
              </Btn>
              {!intake?.complete && <div className="tiny" style={{ marginTop: 8 }}>Complete the Gate 1 questions to enable launch.</div>}
              <div className="divider" />
              <div className="tiny">The coordinator will audit every step, and pause at the Research Office approval gate.</div>
            </Card>
            <Card title="Evidence discipline" subtitle="What the run guarantees">
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.8 }}>
                <li>Every claim carries an in-scope source locator.</li>
                <li>Citations resolve to the approved corpus or they are rejected.</li>
                <li>Budget arithmetic runs in typed tools and reconciles.</li>
                <li>Statistics come from the agency's published caps.</li>
                <li>AI assistance is disclosed, and faculty must accept the draft.</li>
              </ul>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
