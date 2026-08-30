import type { ReactNode } from 'react';
import { fmtDateTime } from '../../../lib/format';

/* The label/value rows a "Version details" pane is built from.
 *
 * Shared rather than copied because the FMD viewer and the XREF viewer are supposed to LOOK the
 * same, and the first attempt at that copied the layout by eye — which produced two panes that
 * agreed on nothing except the title. Two templates read the same way, opened from sibling rows of
 * one catalogue, should not be two different screens; the way to guarantee that is for both to
 * render the same components rather than to both aim at the same description. */

/** One labelled fact. Fixed label column so values line up down the pane. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <span className="w-[74px] shrink-0 text-2xs text-muted pt-[3px]">{label}</span>
      <span className="min-w-0 flex-1 text-sm2 break-words">{children}</span>
    </div>
  );
}

/** A group of facts, separated by a rule and nothing else.
 *
 * No heading: every row already carries its own label, so "PEOPLE" above a list that reads
 * Consultant / Modified by / Created by was a caption restating what the rows say. The rule groups. */
export function Group({ children }: { children: ReactNode }) {
  return <div className="border-t border-line pt-2.5 flex flex-col gap-1.5">{children}</div>;
}

/** Person plus timestamp. The date goes on its own line rather than trailing the name: an email
 * address nearly fills the column, so anything after it wrapped mid-address. */
export function By({ who, at }: { who?: string; at?: string }) {
  return (
    <>
      <span className="font-semibold break-all">{who ?? '—'}</span>
      {at && <span className="block text-2xs text-muted">{fmtDateTime(at)}</span>}
    </>
  );
}
