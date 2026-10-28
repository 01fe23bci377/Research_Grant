import React, { useEffect, useState } from 'react';
import { endpoints } from '../lib/api';
import { useApp } from '../App';
import { Badge, Btn, Card, Loading, Modal, Table, Tabs, useToast } from '../components/ui';
import { Icon } from '../components/icons';
import { timeAgo } from '../lib/format';

export default function Platform() {
  const { bootstrap } = useApp();
  const toast = useToast();
  const [tab, setTab] = useState(() => new URLSearchParams(window.location.hash.split('?')[1] || '').get('tab') || 'connector');
  const changeTab = (next) => {
    setTab(next);
    const base = window.location.hash.split('?')[0];
    window.history.replaceState(null, '', `${base}?tab=${next}`);
  };
  const [conn, setConn] = useState(null);
  const [skills, setSkills] = useState(null);
  const [probe, setProbe] = useState(null);
  const [argsText, setArgsText] = useState('{}');
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [llm, setLlm] = useState(null);
  const [mongo, setMongo] = useState(null);
  const [prompt, setPrompt] = useState('In two sentences, explain why federated learning suits rural diabetic-retinopathy screening.');
  const [genResult, setGenResult] = useState(null);
  const [testing, setTesting] = useState(false);

  const load = () => Promise.all([endpoints.connector(), endpoints.skills(), endpoints.llmStatus(), endpoints.mongoStatus()])
    .then(([c, s, l, m]) => { setConn(c); setSkills(s); setLlm(l); setMongo(m); })
    .catch(() => {});
  useEffect(() => { load(); const id = setInterval(load, 6000); return () => clearInterval(id); }, []);

  const testModel = async () => {
    setTesting(true);
    setGenResult(null);
    try {
      const res = await endpoints.generate({ prompt, maxTokens: 220, temperature: 0.2 });
      setGenResult(res);
      load();
    } catch (err) {
      toast.push(err.message, 'err');
    } finally {
      setTesting(false);
    }
  };

  const openProbe = (endpoint) => {
    const args = {};
    Object.keys(endpoint.args || {}).forEach((k) => { args[k] = endpoint.args[k].includes('number') ? 5 : ''; });
    setProbe(endpoint);
    setArgsText(JSON.stringify(args, null, 2));
    setResult(null);
  };

  const invoke = async () => {
    setRunning(true);
    try {
      const body = JSON.parse(argsText || '{}');
      const res = await endpoints.invoke(probe.name, body);
      setResult(res);
      load();
    } catch (err) {
      toast.push(err.message, 'err');
    } finally {
      setRunning(false);
    }
  };

  if (!conn || !skills) return <Loading label="Loading the connector registry…" />;

  const collectionCount = mongo?.counts || {};

  return (
    <>
      <div className="page-head">
        <div style={{ flex: 1 }}>
          <div className="eyebrow">Platform</div>
          <h1 className="page-title">Connector, skills &amp; runtime</h1>
          <p className="page-sub">Every source is exposed through one authenticated, audited connector. Agents never read a store directly, and both skills are case-agnostic.</p>
        </div>
      </div>

      <div className="grid g4" style={{ gap: 12, marginBottom: 16 }}>
        <div className="card stat"><div className="stat-label">Connector calls</div><div className="stat-value">{conn.stats.calls}</div><div className="stat-foot">authenticated + audited</div></div>
        <div className="card stat"><div className="stat-label">Sources</div><div className="stat-value">{conn.catalog.sources.length}</div><div className="stat-foot">one governed interface</div></div>
        <div className="card stat"><div className="stat-label">Endpoints</div><div className="stat-value">{conn.catalog.endpoints.length}</div><div className="stat-foot">typed request/response</div></div>
        <div className="card stat"><div className="stat-label">Skills</div><div className="stat-value">{skills.skills.length}</div><div className="stat-foot">plan · format</div></div>
      </div>

      <div className="card">
        <Tabs
          tabs={[{ id: 'connector', label: 'Connector' }, { id: 'skills', label: 'Skills' }, { id: 'data', label: 'Models & data' }, { id: 'runtime', label: 'Runtime & guardrails' }]}
          active={tab}
          onChange={changeTab}
        />
        <div className="card-body">
          {tab === 'connector' && (
            <div className="grid" style={{ gap: 16 }}>
              <div className="grid g3" style={{ gap: 10 }}>
                {conn.catalog.sources.map((s) => (
                  <div key={s.key} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px', background: 'var(--surface-2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Icon name="database" size={14} style={{ color: 'var(--indigo)' }} />
                      <span className="strong" style={{ fontSize: 12.5 }}>{s.name}</span>
                    </div>
                    <div className="tiny" style={{ marginTop: 4 }}>{s.adapter} · v{s.version} · custodian {s.custodianship}</div>
                    <div className="chips" style={{ marginTop: 7 }}>{s.endpoints.map((e) => <span key={e} className="chip mono" style={{ fontSize: 9.5 }}>{e}</span>)}</div>
                  </div>
                ))}
              </div>

              <Table
                columns={[
                  { key: 'name', label: 'Endpoint', render: (e) => <span className="mono" style={{ fontSize: 11.5 }}>{e.name}</span> },
                  { key: 'summary', label: 'Contract', render: (e) => <span style={{ fontSize: 12 }}>{e.summary}</span> },
                  { key: 'args', label: 'Args', render: (e) => <span className="tiny mono">{Object.keys(e.args || {}).join(', ') || '—'}</span> },
                  { key: 'source', label: 'Source', render: (e) => <Badge tone="gray">{e.sourceName}</Badge> },
                  { key: 'go', label: '', align: 'right', render: (e) => <Btn size="sm" variant="ghost" icon="play" onClick={() => openProbe(e)}>Invoke</Btn> },
                ]}
                rows={conn.catalog.endpoints}
                rowKey={(e) => e.name}
              />

              <Card title="Recent connector traffic" subtitle="Authentication, arguments and result size are recorded" padded={false}>
                <Table
                  columns={[
                    { key: 'endpoint', label: 'Endpoint', render: (l) => <span className="mono" style={{ fontSize: 11 }}>{l.endpoint}</span> },
                    { key: 'agent', label: 'Agent', render: (l) => <span className="tiny">{l.agent || l.actor}</span> },
                    { key: 'status', label: 'Status', render: (l) => <Badge tone={l.status === 'ok' ? 'green' : 'red'} dot>{l.status}</Badge> },
                    { key: 'count', label: 'Rows', align: 'right', render: (l) => l.count },
                    { key: 'latencyMs', label: 'Latency', align: 'right', render: (l) => `${l.latencyMs}ms` },
                    { key: 'ts', label: 'When', align: 'right', render: (l) => <span className="tiny">{timeAgo(l.ts)}</span> },
                  ]}
                  rows={conn.log.slice(0, 8)}
                  rowKey={(l) => l.id}
                  empty="No connector calls yet."
                />
              </Card>
            </div>
          )}

          {tab === 'skills' && (
            <div className="grid g2" style={{ gap: 16 }}>
              {skills.skills.map((s) => (
                <Card key={s.name} title={`${s.name} skill`} subtitle={`schema v${s.version}`} actions={<Badge tone="indigo" outline>typed</Badge>}>
                  <p style={{ fontSize: 12.5, marginTop: 0 }}>{s.description}</p>
                  <div className="stat-label" style={{ marginBottom: 6 }}>Input schema</div>
                  <pre className="code light" style={{ fontSize: 10.5, maxHeight: 220 }}>{JSON.stringify(s.input, null, 2)}</pre>
                  <div className="stat-label" style={{ margin: '10px 0 6px' }}>Output schema</div>
                  <pre className="code light" style={{ fontSize: 10.5, maxHeight: 160 }}>{JSON.stringify(s.output, null, 2)}</pre>
                </Card>
              ))}
              <div className="callout info" style={{ gridColumn: '1 / -1' }}>
                <Icon name="info" size={15} />
                <div>{skills.note}</div>
              </div>
            </div>
          )}

          {tab === 'data' && (
            <div className="grid" style={{ gap: 16 }}>
              <div className="grid g2" style={{ gap: 16 }}>
                <Card
                  title="Groq language model"
                  subtitle="Group C drafting provider"
                  actions={<Badge tone={llm?.configured ? 'green' : 'amber'} dot>{llm?.configured ? 'active' : 'key missing'}</Badge>}
                >
                  <dl className="kv" style={{ gridTemplateColumns: '128px 1fr' }}>
                    <dt>Model</dt><dd className="mono">{llm?.model || '—'}</dd>
                    <dt>Provider</dt><dd>{llm?.provider || 'Groq Cloud'}</dd>
                    <dt>Drafting</dt><dd>{llm?.drafting ? 'enabled for key sections' : 'deterministic only'}</dd>
                    <dt>Concurrency</dt><dd>{llm?.concurrency || 1}</dd>
                    <dt>Calls</dt><dd>{llm?.calls || 0} this process · {llm?.runs?.sections || 0} sections drafted across runs</dd>
                    <dt>Tokens</dt><dd>{(llm?.runs?.promptTokens || 0)} prompt · {(llm?.runs?.completionTokens || 0)} completion (runs)</dd>
                    <dt>Last latency</dt><dd>{llm?.lastLatencyMs || 0} ms{llm?.lastError ? ` · last error: ${llm.lastError}` : ''}</dd>
                  </dl>
                  <div className="divider" />
                  <div className="field">
                    <label>Test the model</label>
                    <textarea className="textarea" rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
                  </div>
                  <Btn size="sm" variant="primary" icon="play" style={{ marginTop: 8 }} onClick={testModel} disabled={testing || !llm?.configured}>
                    {testing ? 'Calling Groq…' : 'Generate'}
                  </Btn>
                  {genResult && (
                    <div style={{ marginTop: 10 }}>
                      <div className="tiny" style={{ marginBottom: 4 }}>
                        {genResult.success ? `${genResult.model} · ${genResult.usage?.totalTokens || 0} tokens · ${genResult.latencyMs} ms` : genResult.error}
                      </div>
                      <div className="code light" style={{ maxHeight: 160 }}>{genResult.content || '—'}</div>
                    </div>
                  )}
                </Card>

                <Card
                  title="MongoDB Atlas"
                  subtitle="System of record for people and runs"
                  actions={<Badge tone={mongo?.connected ? 'green' : 'amber'} dot>{mongo?.connected ? 'connected' : 'fallback'}</Badge>}
                >
                  <dl className="kv" style={{ gridTemplateColumns: '128px 1fr' }}>
                    <dt>Database</dt><dd className="mono">{mongo?.database || '—'}</dd>
                    <dt>Host</dt><dd className="mono" style={{ fontSize: 10.5 }}>{mongo?.host || '—'}</dd>
                    <dt>Collections</dt><dd>{(mongo?.collections || []).join(' · ')}</dd>
                    <dt>Documents</dt><dd>{collectionCount.users || 0} people · {collectionCount.runs || 0} runs · {collectionCount.auditEvents || 0} events · {collectionCount.versions || 0} versions</dd>
                    <dt>Links</dt><dd>runs.actorRef · approval.decidedByRef · audit.actorRef · version.approvedByRef</dd>
                  </dl>
                  <div className="divider" />
                  <div className="stat-label" style={{ marginBottom: 6 }}>Schema — users</div>
                  <div className="chips">
                    {['Name', 'Role', 'Dept', 'email'].map((f) => <span className="chip mono" key={f}>{f}</span>)}
                    <span className="chip">permissions[]</span>
                    <span className="chip">userId</span>
                  </div>
                  <div className="tiny" style={{ marginTop: 8 }}>Required: Name, Role, Dept, email · Role enum dean / pi / faculty / research_office / admin.</div>
                  <div className="callout info" style={{ marginTop: 10 }}>
                    <Icon name="shield" size={14} />
                    <div>Every approval stores the authorising person's id, email and department, and the published version keeps an immutable snapshot.</div>
                  </div>
                </Card>
              </div>
            </div>
          )}

          {tab === 'runtime' && (
            <div className="grid" style={{ gap: 16 }}>
              <div className="grid g4" style={{ gap: 12 }}>
                {[
                  { label: 'Retry budget', value: bootstrap.config.retryBudget, foot: 'validation → repair attempts' },
                  { label: 'Review buffer', value: `${bootstrap.config.reviewBufferDays} days`, foot: 'before the agency deadline' },
                  { label: 'Step budget', value: bootstrap.config.maxSteps || 120, foot: 'hard runtime ceiling' },
                  { label: 'Connector auth', value: 'agent-token', foot: `header ${bootstrap.config.connectorHeader}` },
                ].map((s) => (
                  <div className="card stat" key={s.label}><div className="stat-label">{s.label}</div><div className="stat-value" style={{ fontSize: 20 }}>{s.value}</div><div className="stat-foot">{s.foot}</div></div>
                ))}
              </div>
              <Card title="Runtime guarantees">
                <div className="grid g2" style={{ gap: 14 }}>
                  <div>
                    <div className="stat-label" style={{ marginBottom: 6 }}>Every step</div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.8 }}>
                      <li>records intent → action → inputs → outputs → result</li>
                      <li>counts against step and tool-call budgets</li>
                      <li>checkpoints state for crash recovery</li>
                      <li>escalates instead of looping when the retry budget is spent</li>
                    </ul>
                  </div>
                  <div>
                    <div className="stat-label" style={{ marginBottom: 6 }}>Gates</div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.8 }}>
                      <li>Gate 1: consent + permissions before any read</li>
                      <li>Validation: bounded repair of failing artifacts only</li>
                      <li>Acceptance: hard gate; no amber package reaches review</li>
                      <li>Approval: Dean R&amp;D / Research Office only</li>
                      <li>Publish: versioned, rollback-able</li>
                    </ul>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>

      <Modal open={Boolean(probe)} onClose={() => setProbe(null)} title={`Invoke ${probe?.name}`} subtitle="Runs against the governed connector with the internal agent token" width={680}
        footer={<><Btn onClick={() => setProbe(null)}>Close</Btn><Btn variant="primary" icon="play" onClick={invoke} disabled={running}>{running ? 'Running…' : 'Invoke'}</Btn></>}>
        <div className="field" style={{ marginBottom: 12 }}>
          <label>Arguments (JSON)</label>
          <textarea className="textarea mono" rows={5} value={argsText} onChange={(e) => setArgsText(e.target.value)} />
        </div>
        {result && (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <Badge tone={result.ok ? 'green' : 'red'} dot>{result.ok ? 'ok' : result.error.code}</Badge>
              <span className="tiny">{result.meta?.count ?? 0} row(s) · {result.meta?.latencyMs}ms · {result.meta?.source}</span>
            </div>
            <pre className="code" style={{ maxHeight: 300 }}>{JSON.stringify(result.ok ? result.data : result.error, null, 2)}</pre>
          </>
        )}
      </Modal>
    </>
  );
}
