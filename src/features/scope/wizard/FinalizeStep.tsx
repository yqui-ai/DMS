import { AlertTriangle, CheckCircle2, Circle, Lock } from 'lucide-react';
import clsx from 'clsx';
import { Button } from '../../../components/Button';

export interface ReadinessCheck {
  key: string;
  label: string;
  /** `pass` — nothing to do. `warn` — finalizing is allowed but accepts a known gap. `block` —
   * finalizing would produce a scope that cannot be worked. */
  level: 'pass' | 'warn' | 'block';
  detail: string;
  /** Which wizard step fixes it. */
  step?: number;
}

/** Step 6 — the readiness summary, then the one-way door.
 *
 * Finalizing opens ERD Diagram, FMD Mapping and the sections downstream, so it is worth showing
 * what is being signed off rather than just asking. Every warning names the step that fixes it: a
 * checklist that tells you something is wrong without telling you where to go is a checklist
 * people learn to click past.
 *
 * Warnings do not block. A prerequisite left out on purpose and an object with no source yet are
 * both real project states, and a wizard that refuses to close on them just gets worked around. */
export function FinalizeStep({ checks, finalized, canFinalize, onFinalize, onGoToStep, busy }: {
  checks: ReadinessCheck[];
  finalized: boolean;
  canFinalize: boolean;
  onFinalize: () => void;
  onGoToStep: (step: number) => void;
  busy?: boolean;
}) {
  const blocking = checks.filter((c) => c.level === 'block');
  const warnings = checks.filter((c) => c.level === 'warn');

  return (
    <div className="flex flex-col gap-3 max-w-[760px] flex-1 min-h-0 overflow-y-auto">
      <div className="rounded-lg shadow-[inset_0_0_0_1px_var(--line)] bg-surface divide-y divide-line-soft overflow-hidden">
        {checks.map((c) => (
          <div key={c.key} className="flex items-start gap-3 px-4 py-2.5">
            {c.level === 'pass' && <CheckCircle2 size={15} className="text-green shrink-0 mt-0.5" />}
            {c.level === 'warn' && <AlertTriangle size={15} className="text-amber-ink shrink-0 mt-0.5" />}
            {c.level === 'block' && <Circle size={15} className="text-red-ink shrink-0 mt-0.5" />}
            <div className="min-w-0 flex-1">
              <div className={clsx('text-sm2 font-semibold', c.level === 'block' ? 'text-red-ink' : 'text-text')}>
                {c.label}
              </div>
              <div className="text-2xs text-muted">{c.detail}</div>
            </div>
            {c.level !== 'pass' && c.step !== undefined && (
              <button
                type="button"
                onClick={() => onGoToStep(c.step!)}
                className="text-2xs font-semibold text-blue hover:underline shrink-0 mt-0.5"
              >
                Fix it
              </button>
            )}
          </div>
        ))}
      </div>

      {finalized ? (
        <div className="flex items-center gap-2 rounded-lg bg-green-bg px-4 py-3">
          <Lock size={15} className="text-green shrink-0" />
          <div className="text-sm2 text-green">
            <span className="font-semibold">This scope is finalized.</span>{' '}
            ERD Diagram and FMD Mapping are open. Changing the object list here re-opens the
            downstream work, so make changes deliberately.
          </div>
        </div>
      ) : (
        <>
          <p className="text-2xs text-muted">
            Finalizing locks nothing away — it opens ERD Diagram, FMD Mapping and the sections
            downstream, and records that the object list has been agreed.
            {warnings.length > 0 && ' Finalizing with warnings accepts them as deliberate.'}
          </p>
          <div>
            <Button variant="primary" onClick={onFinalize} disabled={!canFinalize || busy}>
              {busy ? 'Finalizing…' : 'Finalize scope'}
            </Button>
            {blocking.length > 0 && (
              <p className="text-2xs text-red-ink mt-1.5">
                {blocking[0].detail}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
