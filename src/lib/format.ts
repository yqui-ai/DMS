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

/** ISO 'YYYY-MM-DD' -> 'DD.MM.YYYY' for the prototype's date display convention. */
export const isoToDmy = (iso?: string | null): string => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}.${m}.${y}` : '';
};

/** 'DD.MM.YYYY' -> ISO 'YYYY-MM-DD', or null if not a full valid-looking date. */
export const dmyToIso = (dmy: string): string | null => {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(dmy.trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

export const fmtDuration = (seconds?: number | null): string => {
  if (seconds == null) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
};
