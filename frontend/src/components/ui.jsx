import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Icon } from './icons';
import { classNames, statusMeta } from '../lib/format';

/* --------------------------------- badges -------------------------------- */

export function Badge({ tone = 'gray', children, dot, outline, lg }) {
  return (
    <span className={classNames('badge', tone, outline && 'outline', lg && 'lg')}>
      {dot && <span className="dot" />}
      {children}
    </span>
  );
}

export function StatusPill({ status, lg }) {
  const meta = statusMeta(status);
  return <Badge tone={meta.tone} dot lg={lg}>{meta.label}</Badge>;
}

/* --------------------------------- cards --------------------------------- */

export function Card({ title, subtitle, actions, children, className = '', padded = true, flush = false }) {
  return (
    <section className={classNames('card', className)}>
      {(title || actions) && (
        <header className="card-head">
          <div className="grow">
            {title && <h3 className="section-title">{title}</h3>}
            {subtitle && <p className="section-sub">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className={classNames('card-body', (flush || !padded) && 'flush')}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, foot, icon, tone = 'indigo' }) {
  return (
    <div className="card stat">
      <div className={classNames('stat-icon', 'tone-' + tone)}><Icon name={icon} size={15} /></div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {foot && <div className="stat-foot">{foot}</div>}
    </div>
  );
}

/* --------------------------------- buttons ------------------------------- */

export function Btn({ variant = 'default', size, icon, iconRight, children, className = '', ...rest }) {
  return (
    <button type="button" className={classNames('btn', variant, size, className)} {...rest}>
      {icon && <Icon name={icon} size={size === 'sm' ? 13 : 15} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === 'sm' ? 13 : 15} />}
    </button>
  );
}

/* ---------------------------------- tabs --------------------------------- */

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={active === t.id} className={classNames('tab', active === t.id && 'on')} onClick={() => onChange(t.id)}>
          {t.label}
          {t.count !== undefined && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* --------------------------------- table --------------------------------- */

export function Table({ columns, rows, onRow, empty, rowKey = (r, i) => r.id || i }) {
  if (!rows || rows.length === 0) {
    return <div className="empty">{empty || 'Nothing to show yet.'}</div>;
  }
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead>
          <tr>{columns.map((c) => <th key={c.key} style={{ width: c.width }} className={c.align === 'right' ? 'right' : ''}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={rowKey(row, i)} className={onRow ? 'click' : ''} onClick={onRow ? () => onRow(row) : undefined}>
              {columns.map((c) => (
                <td key={c.key} className={c.align === 'right' ? 'right' : ''}>
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------- progress ------------------------------- */

export function Progress({ value, tone = '', height }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className={classNames('progress', tone)} style={height ? { height } : undefined}>
      <span style={{ width: `${v}%` }} />
    </div>
  );
}

export function Meter({ label, value, max = 100, suffix = '', tone }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div className="bar-row">
      <span className="muted">{label}</span>
      <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.min(100, pct)}%`, background: tone }} /></div>
      <span className="num" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{value}{suffix}</span>
    </div>
  );
}

/* --------------------------------- modal --------------------------------- */

export function Modal({ open, onClose, title, subtitle, children, footer, width }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="modal" style={width ? { width } : undefined}>
        <div className="modal-head">
          <div style={{ flex: 1 }}>
            <h3 className="section-title">{title}</h3>
            {subtitle && <p className="section-sub">{subtitle}</p>}
          </div>
          <Btn variant="ghost" size="sm" icon="x" onClick={onClose} aria-label="Close" />
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* --------------------------------- misc ---------------------------------- */

export function EmptyState({ icon = 'inbox', title, description, action }) {
  return (
    <div className="empty">
      <div className="ic-wrap"><Icon name={icon} size={20} /></div>
      {title && <div className="strong" style={{ color: 'var(--ink)', marginBottom: 4 }}>{title}</div>}
      {description && <div style={{ fontSize: 12, maxWidth: 420, margin: '0 auto' }}>{description}</div>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="empty">
      <span className="spinner" />
      <div style={{ marginTop: 10, fontSize: 12 }}>{label}</div>
    </div>
  );
}

export function Field({ label, hint, children }) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function KpiRow({ children }) {
  return <div className="grid g4" style={{ marginBottom: 16 }}>{children}</div>;
}

export function SectionHead({ title, subtitle, actions }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
      <div style={{ flex: 1 }}>
        <h3 className="section-title">{title}</h3>
        {subtitle && <p className="section-sub">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function CopyBtn({ text, label = 'Copy' }) {
  const [done, setDone] = useState(false);
  return (
    <Btn size="sm" variant="ghost" icon={done ? 'check' : 'copy'} onClick={async () => {
      try { await navigator.clipboard.writeText(text); } catch { /* clipboard may be blocked */ }
      setDone(true);
      setTimeout(() => setDone(false), 1400);
    }}>{done ? 'Copied' : label}</Btn>
  );
}

/* -------------------------------- toasts --------------------------------- */

const ToastContext = createContext({ push: () => {} });

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, tone = '') => {
    const id = Math.random().toString(36).slice(2);
    setItems((list) => [...list, { id, message, tone }]);
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), 4200);
  }, []);
  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="toasts">
        {items.map((t) => (
          <div key={t.id} className={classNames('toast', t.tone)}>
            <Icon name={t.tone === 'err' ? 'alert' : t.tone === 'ok' ? 'checkCircle' : 'info'} size={14} />
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

/* ------------------------------- fetch hook ------------------------------- */

export function useApi(loader, deps = [], { poll = 0 } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: s.data === null }));
    loader()
      .then((data) => { if (alive) setState({ data, error: null, loading: false }); })
      .catch((err) => { if (alive) setState({ data: null, error: err, loading: false }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  useEffect(() => {
    if (!poll) return undefined;
    const id = setInterval(() => setTick((t) => t + 1), poll);
    return () => clearInterval(id);
  }, [poll]);

  return { ...state, reload };
}
