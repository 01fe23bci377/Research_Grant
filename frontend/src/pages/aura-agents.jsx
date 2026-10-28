import React from 'react';
import { endpoints } from '../lib/api';
import { useApp } from '../App';
import { Badge, Card, Loading, Table } from '../components/ui';
import { Icon } from '../components/icons';

export default function Agents() {
  const { navigate } = useApp();
  const [data, setData] = React.useState(null);

  React.useEffect(() => {
    endpoints.agents().then((d) => setData(d.agents)).catch(() => {});
  }, []);

  if (!data) return <Loading label="Loading the agent registry…" />;

  const ai = data.filter((a) => a.kind === 'ai');
  const human = data.filter((a) => a.kind === 'human');

  return (
    <>
      <div className="page-head">
        <div style={{ flex: 1 }}>
          <div className="eyebrow">Operating model</div>
          <h1 className="page-title">Eight agents</h1>
          <p className="page-sub">Seven specialist agents execute under one coordinator; the Dean R&amp;D / HoD / Research Office is the eighth and holds the final submission authority.</p>
        </div>
        <div className="chips">
          <Badge tone="indigo" dot>7 agentic</Badge>
          <Badge tone="violet" dot>1 human authority</Badge>
        </div>
      </div>

      <div className="grid g2" style={{ gap: 14 }}>
        {ai.map((a) => (
          <Card key={a.id} className="agent-card" padded={false}>
            <div className="agent-top">
              <div className={`agent-badge tone-${a.order === 0 ? 'indigo' : a.order < 3 ? 'teal' : a.order < 5 ? 'violet' : 'amber'}`}>{a.order}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className="strong" style={{ fontSize: 13.5 }}>{a.name}</span>
                  <Badge tone="gray">{a.group}</Badge>
                </div>
                <div className="tiny" style={{ marginTop: 2 }}>{a.stage} · {a.activity?.steps || 0} audited steps</div>
              </div>
              <Icon name={a.order === 0 ? 'gitBranch' : a.order === 1 ? 'search' : a.order === 2 ? 'book' : a.order === 3 ? 'file' : a.order === 4 ? 'coins' : 'shield'} size={16} style={{ color: 'var(--faint)' }} />
            </div>
            <div className="agent-role">{a.role}</div>
            <div className="guardrail"><b>Guardrails.</b> {a.guardrails}</div>
            <div className="tool-chips">
              {a.tools.map((t) => <span className="chip mono" style={{ fontSize: 10 }} key={t}>{t}</span>)}
            </div>
            <div style={{ display: 'flex', gap: 14, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
              <div style={{ flex: 1 }}>
                <div className="stat-label">Inputs</div>
                <div className="tiny">{a.inputs.join(' · ')}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div className="stat-label">Outputs</div>
                <div className="tiny">{a.outputs.join(' · ')}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {human.map((a) => (
        <Card key={a.id} style={{ marginTop: 16, borderColor: '#d9d3f7', background: 'linear-gradient(180deg,#fbfaff,#fff)' }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div className="agent-badge tone-violet" style={{ width: 40, height: 40 }}><Icon name="shield" size={17} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="strong" style={{ fontSize: 14 }}>{a.name}</span>
                <Badge tone="violet" dot>final authority</Badge>
                <Badge tone="gray">Order {a.order}</Badge>
              </div>
              <p style={{ fontSize: 12.5, margin: '6px 0 8px', color: 'var(--ink-2)' }}>{a.role}</p>
              <div className="guardrail" style={{ background: 'var(--violet-soft)', borderColor: '#e4dcff', color: '#3f2a86' }}>{a.guardrails}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="stat-label">Steps</div>
              <div className="strong" style={{ fontSize: 20 }}>{a.activity?.steps || 0}</div>
            </div>
          </div>
        </Card>
      ))}

      <div className="callout info" style={{ marginTop: 16 }}>
        <Icon name="info" size={15} />
        <div>The coordinator never bypasses the approval gate. Groups A/B and D/E are launched in parallel; a validation failure routes back to the owning agent with a bounded retry edge, and exhaustion escalates to a human.</div>
      </div>
    </>
  );
}
