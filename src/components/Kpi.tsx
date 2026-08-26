import clsx from 'clsx';

export interface KpiProps {
  label: string;
  value: string | number;
  accent?: 'blue' | 'green' | 'amber' | 'red' | 'muted';
}

const ACCENT_CLASSES: Record<NonNullable<KpiProps['accent']>, string> = {
  blue: 'text-blue', green: 'text-green', amber: 'text-amber-ink', red: 'text-red', muted: 'text-text',
};

export function Kpi({ label, value, accent = 'muted' }: KpiProps) {
  return (
    <div>
      <div className={clsx('text-kpi font-bold', ACCENT_CLASSES[accent])}>{value}</div>
      <div className="text-sm2 font-semibold uppercase tracking-[.04em] text-muted mt-1">{label}</div>
    </div>
  );
}

export function StatStrip({ items }: { items: KpiProps[] }) {
  return (
    <div className="flex flex-wrap gap-6">
      {items.map((item) => <Kpi key={item.label} {...item} />)}
    </div>
  );
}
