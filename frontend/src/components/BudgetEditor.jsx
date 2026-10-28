import React from 'react';
import { money } from '../lib/format';
import { Btn } from './ui';
import { Icon } from './icons';

/**
 * Faculty-owned budget: Requirement + Cost rows, with an explicit add-row
 * control. No agent or model can add, remove or re-price these lines.
 */
export function BudgetEditor({ lines = [], onChange, readOnly = false, compact = false }) {
  const rows = lines.length ? lines : [{ requirement: '', cost: '' }];
  const total = rows.reduce((a, l) => a + (Number(l.cost) || 0), 0);

  const update = (index, patch) => {
    const next = rows.map((row, i) => (i === index ? { ...row, ...patch } : row));
    onChange(next);
  };
  const add = () => onChange([...rows, { requirement: '', cost: '' }]);
  const remove = (index) => onChange(rows.filter((_, i) => i !== index));

  return (
    <div>
      <div style={{ border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
        <table className="tbl" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th style={{ width: '55%' }}>Requirement</th>
              <th className="right" style={{ width: 150 }}>Cost (₹)</th>
              {!readOnly && <th style={{ width: 44 }} />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <td>
                  {readOnly ? (
                    <span style={{ fontSize: 12.5 }}>{row.requirement || '—'}</span>
                  ) : (
                    <input
                      className="input"
                      placeholder="e.g. GPU workstation, field visits, consumables"
                      value={row.requirement}
                      onChange={(e) => update(i, { requirement: e.target.value })}
                    />
                  )}
                </td>
                <td>
                  {readOnly ? (
                    <span className="num">{money(row.cost)}</span>
                  ) : (
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="1000"
                      placeholder="0"
                      value={row.cost}
                      onChange={(e) => update(i, { cost: e.target.value })}
                    />
                  )}
                </td>
                {!readOnly && (
                  <td className="right">
                    <Btn size="sm" variant="ghost" icon="x" aria-label="Remove requirement" onClick={() => remove(i)} disabled={rows.length === 1} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td style={{ textAlign: 'right', fontWeight: 650 }}>Total</td>
              <td className="num strong" style={{ color: 'var(--indigo)' }}>{money(total)}</td>
              {!readOnly && <td />}
            </tr>
          </tfoot>
        </table>
      </div>
      {!readOnly && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
          <Btn size="sm" icon="plus" onClick={add}>Add requirement</Btn>
          <span className="tiny">The faculty member owns these figures. The assistant only totals them and checks agency rules.</span>
        </div>
      )}
      {!compact && !readOnly && (
        <div className="callout info" style={{ marginTop: 10, fontSize: 11.5 }}>
          <Icon name="info" size={14} />
          <div>LLM drafting never proposes or changes budget amounts. Overhead and contingency are applied from the agency's published rules on the total you enter.</div>
        </div>
      )}
    </div>
  );
}

export default BudgetEditor;
