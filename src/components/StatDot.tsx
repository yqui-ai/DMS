export type StatDotState = 'idle' | 'running' | 'ok' | 'error';

const COLOR: Record<StatDotState, string> = {
  idle: '#9aa3af', running: '#e2a900', ok: '#1e6bb8', error: '#da291c',
};

export function StatDot({ state }: { state: StatDotState }) {
  return <span className="inline-block rounded-full" style={{ width: 6, height: 6, background: COLOR[state] }} />;
}
