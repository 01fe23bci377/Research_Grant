const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

export function money(n) {
  return `₹${inr.format(Math.round(Number(n) || 0))}`;
}

export function compactMoney(n) {
  const v = Number(n) || 0;
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)} Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)} L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)} K`;
  return `₹${Math.round(v)}`;
}

export function date(iso, opts = {}) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', ...opts });
}

export function dateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function timeAgo(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

export function pct(value, digits = 0) {
  return `${Number(value || 0).toFixed(digits)}%`;
}

export function duration(ms) {
  if (!ms) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

export const STATUS = {
  draft: { label: 'Draft', tone: 'gray' },
  running: { label: 'Running', tone: 'indigo' },
  awaiting_review: { label: 'Awaiting review', tone: 'amber' },
  changes_requested: { label: 'Changes requested', tone: 'violet' },
  published: { label: 'Published', tone: 'green' },
  approved: { label: 'Approved', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
  needs_human: { label: 'Needs human', tone: 'red' },
};

export function statusMeta(status) {
  return STATUS[status] || { label: status || 'Unknown', tone: 'gray' };
}

export function titleCase(s) {
  return String(s || '').replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function initials(name) {
  return String(name || '?')
    .replace(/^(Dr\.|Prof\.)\s*/i, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

export function wordCount(text) {
  return String(text || '').split(/\s+/).filter(Boolean).length;
}

export function classNames(...parts) {
  return parts.filter(Boolean).join(' ');
}
