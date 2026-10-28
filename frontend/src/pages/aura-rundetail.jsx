import React, { useMemo, useState } from 'react';
import { endpoints } from '../lib/api';
import { date, dateTime, duration, money, pct, statusMeta, timeAgo } from '../lib/format';
import { useApp } from '../App';
import { Badge, Btn, Modal, StatusPill, Tabs, useApi, useToast } from '../components/ui';
import { Icon } from '../components/icons';
import { OverviewTab, DiscoveryTab, LiteratureTab, DraftTab } from './runTabsA';
import { BudgetTab, ComplianceTab, EvidenceTab, PackageTab, AuditTab } from './runTabsB';

const NODE_ICON = { done: 'check', running: 'refresh', failed: 'x', waiting: 'clock', skipped: 'minus' };

export default function RunDetail({ id }) {
  const { navigate, can, actor, refreshBootstrap } = useApp();
  const toast = useToast();
  const { data, error, loading, reload } = useApi(() => endpoints.run(id), [id], { poll: 2500 });
  const [tab, setTab] = useState(() => new URLSearchParams(window.location.hash.split('?')[1] || '').get('tab') || 'overview');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [decision, setDecision] = useState('approve');
  const [busy, setBusy] = useState(false);
  const [reviseOpen, setReviseOpen] = useState(false);
  const [reviseKey, setReviseKey] = useState('abstract');
  const [reviseText, setReviseText] = useState('');
  const [revising, setRevising] = useState(false);

  const changeTab = (next) => {
    setTab(next);
    const base = window.location.hash.split('?')[0];
    window.history.replaceState(null, '', `${base}?tab=${next}`);
  };

  const run = data?.run;
  const textOf = (key) => (run?.draft?.sections?.find((s) => s.key === key)?.paragraphs || []).map((p) => p.text).join('\n\n');

  const traceMap = useMemo(() => {
    const map = new Map();
    for (const entry of run?.trace || []) {
      const key = entry.id.startsWith('repair-') ? entry.id : entry.id;
      map.set(key, entry);
    }
    return map;
  }, [run]);

  if (loading && !run) {
    return <div className="card skel" style={{ height: 220 }} />;
  }
  if (error) {
    return (
      <div className="card pad">
        <div className="callout danger"><Icon name="alert" /><div>{error.message}</div></div>
        <Btn style={{ marginTop: 12 }} onClick={() => navigate('/runs')}>Back to runs</Btn>
      </div>
    );
  }
  if (!run) return null;

  const status = statusMeta(run.status);
  const nodes = run.graph?.nodes || [];
  const reviewNode = run.status === 'awaiting_review' ? 'waiting' : run.status === 'published' ? 'done' : run.status === 'needs_human' ? 'failed' : (traceMap.get('review')?.status || 'idle');

  const nodeStatus = (node) => {
    if (node.id === 'review') return reviewNode;
    if (node.id === 'publish') return run.status === 'published' ? 'done' : 'idle';
    const entry = traceMap.get(node.id);
    if (!entry) return 'idle';
    if (entry.status === 'running') return 'running';
    if (entry.status === 'failed') return 'failed';
    if (entry.status === 'waiting') return 'waiting';
    return 'done';
  };

  const act = async (fn, success) => {
    setBusy(true);
    try {
      await fn();
      if (success) toast.push(success, 'ok');
      reload();
      refreshBootstrap();
    } catch (err) {
      toast.push(err.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const submitReview = () => act(async () => {
    await endpoints.review(run.id, { decision, notes });
    setReviewOpen(false);
    setNotes('');
  }, decision === 'approve' ? 'Package approved and published.' : decision === 'reject' ? 'Package rejected.' : 'Corrections routed to the owning agent.');

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'discovery', label: 'Discovery', count: run.discovery?.ranked?.length },
    { id: 'literature', label: 'Literature', count: run.literature?.retrieved?.length },
    { id: 'draft', label: 'Draft', count: run.draft?.sections?.length },
    { id: 'budget', label: 'Budget', count: run.budget?.lines?.length },
    { id: 'compliance', label: 'Compliance', count: run.compliance?.checks?.length },
    { id: 'evidence', label: 'Evidence', count: run.evidence?.records?.length },
    { id: 'package', label: 'Package', count: run.package?.files?.length },
    { id: 'audit', label: 'Audit', count: run.logs?.length },
  ];

  return (
    <>
      <button className="btn ghost sm" style={{ marginBottom: 10 }} onClick={() => navigate('/runs')}>
        <Icon name="arrowRight" size={13} style={{ transform: 'rotate(180deg)' }} /> All runs
      </button>

      <div className="page-head" style={{ marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="eyebrow">{run.id} · {run.domain} funder</div>
          <h1 className="page-title" style={{ fontSize: 23, maxWidth: 900 }}>{run.draft?.title || run.params.researchArea}</h1>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 9 }}>
            <StatusPill status={run.status} />
            {run.discovery?.selectedCall && (
              <span className="tiny">
                <Icon name="building" size={12} style={{ verticalAlign: -2 }} /> {run.discovery.selectedCall.agency} · {run.discovery.selectedCall.program} · deadline {date(run.discovery.selectedCall.deadline)}
              </span>
            )}
            <span className="tiny">PI {run.params.piName}</span>
            <span className="tiny">·</span>
            <span className="tiny">created {timeAgo(run.createdAt)}</span>
            {run.publishedVersion && <Badge tone="green" dot>published v{run.publishedVersion}</Badge>}
            {run.rollback && <Badge tone="violet">rolled back to v{run.rollback.toVersion}</Badge>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['needs_human', 'changes_requested'].includes(run.status) && (
            <Btn icon="play" onClick={() => act(() => endpoints.resume(run.id), 'Run resumed.')} disabled={busy}>Resume</Btn>
          )}
          {can('draft:edit') && ['awaiting_review', 'changes_requested'].includes(run.status) && run.draft && (
            <Btn icon="edit" onClick={() => { const key = run.draft.sections[0]?.key || 'abstract'; setReviseKey(key); setReviseText(textOf(key)); setReviseOpen(true); }}>
              Revise draft
            </Btn>
          )}
          {run.status === 'awaiting_review' && (
            <Btn variant="primary" icon="shield" onClick={() => setReviewOpen(true)} disabled={!can('review:approve')} title={can('review:approve') ? '' : 'Only the Dean R&D / Research Office may approve'}>
              Review package
            </Btn>
          )}
          {run.package?.files?.length ? (
            <Btn icon="download" onClick={() => { window.location.href = endpoints.downloadUrl(run.id, 'proposal.md'); }}>Proposal</Btn>
          ) : null}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="pipeline">
          {nodes.map((node, i) => {
            const st = nodeStatus(node);
            return (
              <div className={`pipe-node ${st}`} key={node.id} title={`${node.label} · ${node.agent}${st !== 'idle' ? ` · ${st}` : ''}`}>
                {i < nodes.length - 1 && <span className="pipe-conn" />}
                <div className="pipe-dot">
                  {st === 'done' ? <Icon name="check" size={13} /> : st === 'failed' ? <Icon name="x" size={13} /> : st === 'running' ? <span className="spinner" style={{ width: 11, height: 11, borderWidth: 2 }} /> : <span>{i + 1}</span>}
                </div>
                <div className="pipe-label">{node.label}</div>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 14, padding: '10px 20px 14px', borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
          <span className="tiny"><Icon name="gitBranch" size={12} style={{ verticalAlign: -2 }} /> parallel: discovery ∥ literature, budget ∥ compliance</span>
          <span className="tiny"><Icon name="rotate" size={12} style={{ verticalAlign: -2 }} /> retry budget: {run.validation?.maxAttempts} · used {run.validation?.attempts}</span>
          {run.swarm && <span className="tiny"><Icon name="zap" size={12} style={{ verticalAlign: -2 }} /> swarm {run.swarm.concurrency}× · {run.swarm.wallClockMs}ms vs {run.swarm.sequentialEstimateMs}ms sequential</span>}
          <span className="tiny" style={{ marginLeft: 'auto' }}>checksum {run.package?.checksum?.slice(0, 12) || '—'}</span>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 0 }}>
        <Tabs tabs={tabs} active={tab} onChange={changeTab} />
        <div className="card-body">
          {tab === 'overview' && <OverviewTab run={run} />}
          {tab === 'discovery' && <DiscoveryTab run={run} />}
          {tab === 'literature' && <LiteratureTab run={run} />}
          {tab === 'draft' && <DraftTab run={run} />}
          {tab === 'budget' && <BudgetTab run={run} />}
          {tab === 'compliance' && <ComplianceTab run={run} />}
          {tab === 'evidence' && <EvidenceTab run={run} />}
          {tab === 'package' && (
            <PackageTab
              run={run}
              actor={actor}
              canApprove={can('review:approve')}
              canRollback={can('version:rollback')}
              busy={busy}
              onReview={() => setReviewOpen(true)}
              onRollback={(versionId) => act(() => endpoints.rollback(run.id, versionId), 'Version restored.')}
            />
          )}
          {tab === 'audit' && <AuditTab run={run} />}
        </div>
      </div>

      <Modal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title="Research Office decision"
        subtitle={`${run.id} · checksum ${run.package?.checksum?.slice(0, 16)}`}
        footer={<>
          <Btn onClick={() => setReviewOpen(false)}>Cancel</Btn>
          <Btn variant="primary" onClick={submitReview} disabled={busy || (decision === 'approve' && !run.acceptance?.allPass)}>Record decision</Btn>
        </>}
      >
        <div className="callout info" style={{ marginBottom: 14 }}>
          <Icon name="shield" size={15} />
          <div>
            <b>{actor?.name}</b> is acting as {actor?.title}. This decision is final for submission and is written to the audit trail.
          </div>
        </div>
        <div className="grid g3" style={{ gap: 8, marginBottom: 16 }}>
          {[
            { id: 'approve', label: 'Approve', desc: 'Publish a signed version' },
            { id: 'request_changes', label: 'Request changes', desc: 'Route back to the owner' },
            { id: 'reject', label: 'Reject', desc: 'Close the package' },
          ].map((d) => (
            <button key={d.id} className="card" style={{ textAlign: 'left', padding: 12, cursor: 'pointer', borderColor: decision === d.id ? 'var(--indigo)' : undefined, boxShadow: decision === d.id ? '0 0 0 3px rgba(91,79,224,.14)' : undefined, background: '#fff' }} onClick={() => setDecision(d.id)}>
              <div className="strong" style={{ fontSize: 12.5 }}>{d.label}</div>
              <div className="tiny">{d.desc}</div>
            </button>
          ))}
        </div>
        <div className="field">
          <label>Decision notes</label>
          <textarea className="textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Conditions, corrections, or the basis for approval…" />
        </div>
        {!run.acceptance?.allPass && <div className="callout danger" style={{ marginTop: 12 }}>The acceptance suite has not passed; approval is blocked by the hard gate.</div>}
      </Modal>

      <Modal
        open={reviseOpen}
        onClose={() => setReviseOpen(false)}
        title="Revise draft before Dean review"
        subtitle="Your text replaces the AI draft for this section. The package is re-validated and returned to the approval queue."
        width={780}
        footer={<>
          <Btn onClick={() => setReviseOpen(false)}>Cancel</Btn>
          <Btn variant="primary" icon="check" disabled={revising} onClick={async () => {
            setRevising(true);
            try {
              await endpoints.reviseDraft(run.id, [{ key: reviseKey, text: reviseText }]);
              toast.push('Draft revised and resubmitted to the Dean.', 'ok');
              setReviseOpen(false);
              reload();
            } catch (err) {
              toast.push(err.message, 'err');
            } finally {
              setRevising(false);
            }
          }}>{revising ? 'Saving…' : 'Save & resubmit'}</Btn>
        </>}
      >
        <div className="field" style={{ marginBottom: 10 }}>
          <label>Section</label>
          <select className="select" value={reviseKey} onChange={(e) => { setReviseKey(e.target.value); setReviseText(textOf(e.target.value)); }}>
            {(run.draft?.sections || []).map((s) => <option key={s.key} value={s.key}>{s.title}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Section text</label>
          <textarea className="textarea" rows={14} value={reviseText} onChange={(e) => setReviseText(e.target.value)} />
        </div>
        <div className="tiny" style={{ marginTop: 6 }}>{reviseText.split(/\s+/).filter(Boolean).length} words · faculty edits are not overwritten by the drafting agents</div>
      </Modal>
    </>
  );
}
