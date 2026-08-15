/** Number/date formatters — en-US, tabular nums for financial/count columns. */

const numberFmt = new Intl.NumberFormat('en-US');
const decimalFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const percentFmt = new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dateFmt = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: '2-digit' });
const dateTimeFmt = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });

export const fmtNumber = (n?: number | null): string => (n == null ? '—' : numberFmt.format(n));
export const fmtDecimal = (n?: number | null): string => (n == null ? '—' : decimalFmt.format(n));
export const fmtPercent = (n?: number | null): string => (n == null ? '—' : percentFmt.format(n / 100));
export const fmtDate = (iso?: string | null): string => (!iso ? '—' : dateFmt.format(new Date(iso)));
export const fmtDateTime = (iso?: string | null): string => (!iso ? '—' : dateTimeFmt.format(new Date(iso)));

export const fmtDuration = (seconds?: number | null): string => {
  if (seconds == null) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
};
