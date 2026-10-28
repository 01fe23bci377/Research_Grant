import React, { useMemo } from 'react';
import { date, dateTime, money, pct, duration } from '../lib/format';
import { Badge, Btn, Card, EmptyState, Progress, Table } from '../components/ui';
import { Icon } from '../components/icons';

function TextBlock({ children, style }) {
  return <div style={{ fontSize: 13, lineHeight: 1.68, color: 'var(--ink-2)', ...style }}>{children}</div>;
}

/* -------------------------------- overview -------------------------------- */

export function OverviewTab({ run }) {
  const report = run.validation?.report;
  const plan = run.plan;
  const diagnostics = run.validation?.diagnostics || [];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.55fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
      <div className="grid" style={{ gap: 16 }}>
        <Card
          title="Validation & repair"
          subtitle={`Attempt ${run.validation?.attempts || 0} of ${run.validation?.maxAttempts || 3} · bounded retry`}
          actions={report ? <Badge tone={report.passed ? 'green' : 'red'} dot>{report.passed ? 'All checks pass' : `${report.summary.failed} failing`}</Badge> : <Badge tone="gray">not run</Badge>}
        >
          {!report && <EmptyState icon="clock" title="Validation has not run yet" description="The run is still producing artifacts." />}
          {report && (
            <>
              <div className="grid" style={{ gap: 0 }}>
                {report.checks.map((c) => (
                  <div className="check-row" key={c.id}>
                    <span className={`status-dot ${c.passed ? 'pass' : 'fail'}`}><Icon name={c.passed ? 'check' : 'x'} size={11} /></span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 550 }}>{c.label}</div>
                      <div className="tiny">{c.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
              {diagnostics.length > 0 && (
                <>
                  <div className="divider" />
                  <div className="tiny" style={{ textTransform: 'uppercase', letterSpacing: '.09em', marginBottom: 8 }}>Diagnosis log</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {diagnostics.map((d) => (
                      <div key={d.id} className="callout" style={{ padding: '9px 11px', fontSize: 11.5 }}>
                        <Icon name="zap" size={13} style={{ marginTop: 2, color: 'var(--amber)' }} />
                        <div>
                          <b>Attempt {d.attempt} · {d.failure}</b> → <span className="mono" style={{ fontSize: 10.5 }}>{d.repair}</span>
                          <div className="tiny" style={{ marginTop: 2 }}>{d.result}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </Card>

        {plan && (
          <Card title="Locked plan" subtitle={`${plan.specialistId} specialist · ${plan.units.length} units`} actions={<Badge tone="indigo" outline>checksum {plan.checksum.slice(0, 10)}</Badge>}>
            <TextBlock style={{ marginBottom: 12 }}>{plan.goal}</TextBlock>
            <div className="grid g2" style={{ gap: 8, marginBottom: 12 }}>
              {plan.phases.map((p) => (
                <div key={p.id} style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 9, padding: '8px 10px' }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600 }}>{p.label}</div>
                  <div className="tiny">{p.mode} · {p.agents.join(' · ')}{p.gate ? ' · gate' : ''}</div>
                </div>
              ))}
            </div>
            <Table
              columns={[
                { key: 'title', label: 'Unit', render: (u) => <span style={{ fontWeight: 550 }}>{u.title}</span> },
                { key: 'words', label: 'Words', align: 'right', render: (u) => { const s = run.draft?.sections?.find((x) => x.key === u.key); return s ? `${s.wordCount} / ${u.minWords}` : '—'; } },
                { key: 'status', label: 'State', align: 'right', render: (u) => { const s = run.draft?.sections?.find((x) => x.key === u.key); if (!s) return <Badge tone="gray">pending</Badge>; return s.wordCount >= u.minWords ? <Badge tone="green">covered</Badge> : <Badge tone="amber">short</Badge>; } },
              ]}
              rows={plan.units}
            />
          </Card>
        )}
      </div>

      <div className="grid" style={{ gap: 16 }}>
        <Card title="Run facts">
          <dl className="kv" style={{ gridTemplateColumns: '112px 1fr' }}>
            <dt>Run</dt><dd className="mono">{run.id}</dd>
            <dt>Status</dt><dd style={{ textTransform: 'capitalize' }}>{run.status.replace('_', ' ')}</dd>
            <dt>Stage</dt><dd style={{ textTransform: 'capitalize' }}>{run.stage}</dd>
            <dt>Acting PI</dt><dd>{run.params.piName}</dd>
            <dt>Domain</dt><dd style={{ textTransform: 'capitalize' }}>{run.domain}</dd>
            <dt>Created</dt><dd>{dateTime(run.createdAt)}</dd>
            <dt>Steps</dt><dd>{run.metrics?.steps} · {run.metrics?.toolCalls} tool calls</dd>
            <dt>Budget</dt><dd>{run.budget?.formatted?.total || '—'}</dd>
            <dt>Evidence</dt><dd>{run.evidence ? `${pct(run.evidence.coverage)} across ${run.evidence.sourceCount} sources` : '—'}</dd>
          </dl>
        </Card>

        {run.swarm && (
          <Card title="Parallel swarm" subtitle="Draft sections, merged by plan alignment">
            <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
              <div><div className="stat-label">Concurrency</div><div className="strong" style={{ fontSize: 20 }}>{run.swarm.concurrency}×</div></div>
              <div><div className="stat-label">Wall clock</div><div className="strong" style={{ fontSize: 20 }}>{run.swarm.wallClockMs}ms</div></div>
              <div><div className="stat-label">Sequential</div><div className="strong" style={{ fontSize: 20 }}>{run.swarm.sequentialEstimateMs}ms</div></div>
            </div>
            <div className="bar-row" style={{ gridTemplateColumns: '90px 1fr 44px' }}>
              <span className="muted">speed-up</span>
              <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.min(100, run.swarm.speedup * 25)}%` }} /></div>
              <span>{run.swarm.speedup}×</span>
            </div>
          </Card>
        )}

        {run.llm && (
          <Card
            title="Language model"
            subtitle="Group C drafting"
            actions={<Badge tone={run.llm.sectionsFromLLM > 0 ? 'green' : 'gray'} dot>{run.llm.sectionsFromLLM > 0 ? 'Groq' : 'deterministic'}</Badge>}
          >
            <dl className="kv" style={{ gridTemplateColumns: '118px 1fr' }}>
              <dt>Model</dt><dd className="mono" style={{ fontSize: 10.5 }}>{run.llm.model}</dd>
              <dt>LLM sections</dt><dd>{run.llm.sectionsFromLLM} of {run.llm.calls} attempted</dd>
              <dt>Tokens</dt><dd>{run.llm.promptTokens} prompt · {run.llm.completionTokens} completion</dd>
              <dt>Avg latency</dt><dd>{run.llm.avgLatencyMs || 0} ms</dd>
              <dt>Fallbacks</dt><dd>{run.llm.fallbacks}{run.llm.fallbacks ? ' (contract or rate-limit)' : ''}</dd>
            </dl>
            <div className="tiny" style={{ marginTop: 8 }}>Every model paragraph is mapped back to corpus source ids and rejected if it cites anything unknown or invents a number.</div>
          </Card>
        )}

        <Card title="Checkpoints" subtitle={`${run.checkpoints?.length || 0} recoverable points`} padded={false}>
          <div style={{ padding: '10px 18px 14px' }}>
            {(run.checkpoints || []).map((c) => (
              <div className="feed-item" key={c.id}>
                <span className="feed-dot" />
                <div><div style={{ fontWeight: 550 }}>{c.label}</div><div className="tiny">{c.summary?.sections ? `${c.summary.sections} sections` : c.stage}</div></div>
                <span className="feed-time">{dateTime(c.at)}</span>
              </div>
            ))}
            {!run.checkpoints?.length && <div className="tiny">No checkpoints yet.</div>}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* -------------------------------- discovery ------------------------------- */

export function DiscoveryTab({ run }) {
  const d = run.discovery;
  if (!d) return <EmptyState icon="search" title="Discovery has not completed" description="The Funding Discovery Agent is still matching calls." />;
  const call = d.selectedCall;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
      <div className="grid" style={{ gap: 16 }}>
        <Card title="Ranked calls" subtitle="Verified, active and deadline-safe only" padded={false}>
          <Table
            columns={[
              { key: 'agency', label: 'Call', render: (r) => (<><div className="row-title">{r.agency} · {r.program}</div><div className="row-sub">{r.title}</div></>) },
              { key: 'score', label: 'Match', align: 'right', render: (r) => <div style={{ minWidth: 70 }}><div className="tiny" style={{ textAlign: 'right' }}>{r.score}</div><Progress value={r.score} /></div> },
              { key: 'deadline', label: 'Deadline', align: 'right', render: (r) => (<><div>{r.deadline}</div><div className="tiny">{r.daysLeft} days</div></>) },
              { key: 'eligible', label: '', align: 'right', render: (r) => r.id === call.id ? <Badge tone="green" dot>selected</Badge> : r.eligible ? <Badge tone="gray">eligible</Badge> : <Badge tone="amber">flagged</Badge> },
            ]}
            rows={d.ranked}
            onRow={() => {}}
            rowKey={(r) => r.id}
          />
        </Card>

        <Card title="Match factors" subtitle="How the selected call scored">
          {Object.entries(call.factors || {}).map(([key, f]) => (
            <div key={key} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 4 }}>
                <span style={{ textTransform: 'capitalize' }}>{key} <span className="tiny">· weight {(f.weight * 100).toFixed(0)}%</span></span>
                <span className="strong">{(f.value * 100).toFixed(0)}%</span>
              </div>
              <Progress value={f.value * 100} tone={f.value > 0.6 ? 'green' : f.value > 0.3 ? 'amber' : 'red'} />
              {f.matched?.length ? <div className="tiny" style={{ marginTop: 3 }}>{f.matched.join(' · ')}</div> : null}
              {f.note && <div className="tiny" style={{ marginTop: 3 }}>{f.note}</div>}
            </div>
          ))}
        </Card>
      </div>

      <div className="grid" style={{ gap: 16 }}>
        <Card title={call.agency} subtitle={call.program} actions={<Badge tone="green" dot>verified</Badge>}>
          <TextBlock style={{ fontWeight: 600, fontSize: 14 }}>{call.title}</TextBlock>
          <div className="chips" style={{ marginTop: 10 }}>
            <Badge tone="indigo">{call.fundingType}</Badge>
            <Badge tone="gray">{call.currency}</Badge>
            {call.verified && <Badge tone="teal">approved agency</Badge>}
          </div>
          <dl className="kv" style={{ gridTemplateColumns: '110px 1fr', marginTop: 14 }}>
            <dt>Award range</dt><dd>{money(call.budgetMin)} – {money(call.budgetMax)}</dd>
            <dt>Deadline</dt><dd>{date(call.deadline)} · {call.daysLeft} days</dd>
            <dt>Duration</dt><dd>up to {call.durationMonths} months</dd>
            <dt>Page limit</dt><dd>{call.pageLimit} pages</dd>
            <dt>Source</dt><dd><a href={call.sourceUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--indigo)' }}>{call.sourceUrl.replace('https://', '')} <Icon name="external" size={11} /></a></dd>
          </dl>
        </Card>

        <Card title="Why this call" subtitle="Funding Discovery Agent reasoning">
          <ol style={{ margin: 0, paddingLeft: 16, fontSize: 12.5, lineHeight: 1.8 }}>
            {d.reasoning.map((r, i) => <li key={i}>{r}</li>)}
          </ol>
        </Card>

        <Card title="Guardrails applied" subtitle={`${d.excluded.length} listing(s) withheld`}>
          {d.excluded.length === 0 && <div className="tiny">No exclusions.</div>}
          {d.excluded.map((x) => (
            <div key={x.id} style={{ padding: '8px 0', borderBottom: '1px solid #f0f2f7' }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <Badge tone={x.guardrail === 'verified' ? 'red' : 'amber'}>{x.guardrail === 'verified' ? 'unverified' : 'not active'}</Badge>
                <span style={{ fontSize: 12, fontWeight: 550 }}>{x.agency}</span>
              </div>
              <div className="tiny" style={{ marginTop: 3 }}>{x.title} — {x.reason}</div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

/* -------------------------------- literature ------------------------------ */

export function LiteratureTab({ run }) {
  const lit = run.literature;
  if (!lit) return <EmptyState icon="book" title="Literature review not complete" description="Group B is still retrieving the corpus." />;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
      <div className="grid" style={{ gap: 16 }}>
        <Card title="Related work & gap analysis" subtitle={`${lit.retrieved.length} retrieved records · ${lit.coverage.coveredTags}/${lit.coverage.totalTags} call topics covered`}>
          {lit.summary.map((p, i) => <TextBlock key={i} style={{ marginBottom: 12 }}>{p}</TextBlock>)}
        </Card>

        <Card title="Citations" subtitle="Every reference resolves to the approved corpus" padded={false}>
          <Table
            columns={[
              { key: 'title', label: 'Record', render: (r) => (<><div className="row-title">{r.title}</div><div className="row-sub">{r.authors.join(', ')} · {r.venue} · {r.year}</div></>) },
              { key: 'doi', label: 'DOI', align: 'right', render: (r) => <span className="mono" style={{ fontSize: 10.5 }}>{r.doi.replace('10.5555/', '')}</span> },
              { key: 'similarity', label: 'Similarity', align: 'right', render: (r) => r.similarity ? r.similarity.toFixed(2) : 'tag' },
            ]}
            rows={lit.retrieved}
            rowKey={(r) => r.id}
          />
        </Card>
      </div>

      <div className="grid" style={{ gap: 16 }}>
        <Card title="Novelty" subtitle="Computed, not asserted">
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 10 }}>
            <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-1.5px' }}>{lit.novelty.score}</div>
            <Badge tone={lit.novelty.label === 'strong' ? 'green' : lit.novelty.label === 'moderate' ? 'amber' : 'red'} style={{ marginBottom: 6 }}>{lit.novelty.label}</Badge>
          </div>
          <Progress value={lit.novelty.score * 100} tone={lit.novelty.score > 0.7 ? 'green' : 'amber'} />
          <div className="tiny" style={{ marginTop: 10 }}>{lit.novelty.rationale}</div>
          <div className="tiny" style={{ marginTop: 6 }}>Prior-proposal overlap: {lit.novelty.priorOverlap}</div>
        </Card>

        <Card title="Thin coverage" subtitle="Flagged rather than overstated">
          {lit.gaps.length === 0 && <div className="tiny">All call topics are represented in the corpus.</div>}
          <div className="chips">
            {lit.gaps.map((g) => <Badge key={g.tag} tone="amber" dot>{g.tag}</Badge>)}
          </div>
          {lit.gaps.length > 0 && <div className="tiny" style={{ marginTop: 8 }}>These become design questions in the draft, not claims of novelty.</div>}
        </Card>

        <Card title="Institutional history" padded={false}>
          {(lit.priorProposals || []).map((p) => (
            <div key={p.id} style={{ padding: '10px 18px', borderBottom: '1px solid #f0f2f7' }}>
              <div className="strong" style={{ fontSize: 12 }}>{p.title}</div>
              <div className="tiny">{p.agency} · {p.year} · <span style={{ textTransform: 'capitalize' }}>{p.outcome.replace('-', ' ')}</span> · sim {p.similarity}</div>
            </div>
          ))}
          {!lit.priorProposals?.length && <div className="tiny" style={{ padding: 16 }}>No close prior proposals.</div>}
        </Card>
      </div>
    </div>
  );
}

/* ---------------------------------- draft --------------------------------- */

export function DraftTab({ run }) {
  const draft = run.draft;
  if (!draft) return <EmptyState icon="file" title="Draft not complete" description="Group C is composing the narrative." />;

  const citationBySource = useMemo(() => new Map((draft.citations || []).map((c) => [c.sourceId, c])), [draft]);
  const claimsById = useMemo(() => new Map((draft.claims || []).map((c) => [c.id, c])), [draft]);

  const citationsFor = (claimIds) => {
    const keys = [];
    for (const id of claimIds || []) {
      const claim = claimsById.get(id);
      for (const ev of claim?.evidence || []) {
        const c = citationBySource.get(ev.sourceId);
        if (c && !keys.find((k) => k.key === c.key)) keys.push(c);
      }
    }
    return keys;
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.7fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
      <Card padded={false}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--line)' }}>
          <div className="callout warn" style={{ marginBottom: 12 }}>
            <Icon name="info" size={15} />
            <div>{draft.disclosure?.text}</div>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <Badge tone="indigo" outline>draft v{draft.version}</Badge>
            <span className="tiny">{draft.sections.length} sections · {draft.wordCount} words · {draft.citations?.length} citations</span>
            <div style={{ flex: 1 }} />
            <a className="btn sm" href={`/api/runs/${run.id}/files/proposal.md`}><Icon name="download" size={13} /> Download</a>
          </div>
        </div>
        <div className="proposal" style={{ padding: '22px 26px' }}>
          <h2 style={{ fontFamily: 'var(--serif)', fontSize: 22, margin: '0 0 18px', letterSpacing: '-0.3px' }}>{draft.title}</h2>
          {draft.sections.map((section) => (
            <section key={section.key} style={{ marginBottom: 22 }}>
              <h2>
                {section.title}
                <span className="words">{section.wordCount} words{section.updatedBy !== 'drafting' ? ` · updated by ${section.updatedBy}` : ''}</span>
              </h2>
              {section.key === 'references' ? (
                <ol style={{ paddingLeft: 20, fontSize: 12.5, lineHeight: 1.7 }}>
                  {(draft.citations || []).map((c) => (
                    <li key={c.key}><span className="mono" style={{ fontSize: 11 }}>[{c.key}]</span> {c.title}. <i>{c.locator}</i></li>
                  ))}
                </ol>
              ) : (
                section.paragraphs.map((p, i) => (
                  <p key={i}>
                    {p.text}
                    {citationsFor(p.claimIds).map((c) => (
                      <span className="cite" key={c.key} title={`${c.title} — ${c.locator}`}>{c.key}</span>
                    ))}
                  </p>
                ))
              )}
            </section>
          ))}
        </div>
      </Card>

      <div className="grid" style={{ gap: 16 }}>
        <Card title="Claim grounding" subtitle="Sentence-level evidence">
          <div style={{ display: 'flex', gap: 16 }}>
            <div><div className="stat-label">Claims</div><div className="strong" style={{ fontSize: 22 }}>{run.evidence?.totalClaims ?? draft.claims.length}</div></div>
            <div><div className="stat-label">Grounded</div><div className="strong" style={{ fontSize: 22, color: 'var(--green)' }}>{run.evidence?.groundedClaims ?? '—'}</div></div>
            <div><div className="stat-label">Coverage</div><div className="strong" style={{ fontSize: 22 }}>{run.evidence ? pct(run.evidence.coverage) : '—'}</div></div>
          </div>
          <div className="divider" />
          <div className="tiny">Each sentence is a claim with at least one source locator. Ungrounded claims are rejected and removed, not softened.</div>
        </Card>

        <Card title="Citation index" padded={false}>
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {(draft.citations || []).map((c) => (
              <div key={c.key} style={{ padding: '9px 16px', borderBottom: '1px solid #f0f2f7' }}>
                <div style={{ fontSize: 11.5, fontWeight: 600 }}><span className="cite" style={{ verticalAlign: 'baseline' }}>{c.key}</span> {c.title}</div>
                <div className="tiny">{c.type} · {c.locator}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
