import clsx from 'clsx';
import { Check } from 'lucide-react';

export interface FlowStep { key: string; label: string }

/** The handoff's `pflow` step dots (reference/Data Migration Solution v2.dc.html).
 *
 * Numbered dots joined by a rule: done steps go pale blue with a tick, the current one solid blue,
 * the rest grey. A step you have already passed stays clickable so the wizard can be walked
 * backwards — a step you have not reached does not, because arriving at "finalize" without having
 * chosen anything is not a state worth rendering. */
export function StepFlow({ steps, current, onSelect }: {
  steps: FlowStep[];
  /** Index of the step being shown. */
  current: number;
  onSelect?: (index: number) => void;
}) {
  return (
    <div className="flex items-center flex-wrap mb-6">
      {steps.map((step, i) => {
        const done = i < current;
        const active = i === current;
        const reachable = i <= current;
        return (
          <div key={step.key} className="flex items-center">
            <button
              type="button"
              onClick={reachable && onSelect ? () => onSelect(i) : undefined}
              disabled={!reachable || !onSelect}
              aria-current={active ? 'step' : undefined}
              className={clsx('flex items-center gap-[9px] px-0.5 py-1.5', reachable && onSelect ? 'cursor-pointer' : 'cursor-default')}
            >
              <span
                className={clsx(
                  'w-[26px] h-[26px] rounded-full grid place-items-center text-2xs font-bold shrink-0',
                  active ? 'bg-blue text-white' : done ? 'bg-blue-light text-blue' : 'bg-surface-2 text-muted',
                )}
              >
                {done ? <Check size={13} /> : i + 1}
              </span>
              <span className={clsx('text-sm2 font-semibold whitespace-nowrap', active ? 'text-text' : 'text-muted')}>
                {step.label}
              </span>
            </button>
            {i < steps.length - 1 && <span className="w-9 h-px bg-line mx-3" aria-hidden />}
          </div>
        );
      })}
    </div>
  );
}
