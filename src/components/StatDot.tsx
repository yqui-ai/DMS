export type StatDotState = 'idle' | 'running' | 'ok' | 'error';

const COLOR: Record<StatDotState, string> = {
  idle: 'var(--muted)', running: 'var(--amber)', ok: 'var(--blue-mid)', error: 'var(--red)',
};

export function StatDot({ state }: { state: StatDotState }) {
  return <span className="inline-block rounded-full" style={{ width: 6, height: 6, background: COLOR[state] }} />;
}
