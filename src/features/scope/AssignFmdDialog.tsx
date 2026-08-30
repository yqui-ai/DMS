import { useState } from 'react';
import { Check, FileText, Link2Off, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/Button';
import { Tag } from '../../components/Tag';
import { ToolbarSearch } from '../../components/ToolbarSearch';
import { useAssignableFmds, type AssignableFmd } from '../../lib/queries/scope';
import type { MigrationObject } from '../../types/entities';

/** Assign an existing FMD to this subproject's object — or, only if there is none, generate one.
 *
 * **Picking comes first, generating is the fallback.** A Custom FMD for SIF_CUSTOMER_2 is something
 * a consultant wrote once; the next wave migrating customers should pick it up, not generate a
 * second copy from the Golden template and start drifting from the original. The screen used to
 * offer only "Generate FMD", which made a fresh document the path of least resistance and produced
 * one FMD per subproject for the same object — duplicates nobody reconciled afterwards.
 *
 * Assignment writes `subproject_objects.fmd_id`. The FMD is not moved or copied, so several
 * subprojects can point at the same row; that sharing IS the reuse. */
export function AssignFmdDialog({ object, currentFmdId, busy, onAssign, onGenerate, onClose }: {
  /** The in-scope object being given a mapping document. Null closes the dialog. */
  object: MigrationObject | null;
  currentFmdId?: string;
  busy?: boolean;
  onAssign: (fmdId: string | null) => void;
  /** Hands off to the Golden-template generator for this object. */
  onGenerate: () => void;
  onClose: () => void;
}) {
  const { data: candidates = [], isLoading } = useAssignableFmds(object?.id, object?.objectId);
  const [picked, setPicked] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [seededFor, setSeededFor] = useState<string | null>(null);

  /* Reset the pick when the dialog is pointed at a different object.
   *
   * This is rendered unconditionally from the register and controlled by a nullable `object`, so it
   * never unmounts between rows and `picked` survived the switch. Choosing an FMD for SIF_CUSTOMER_2
   * and then opening SIF_CUST_EXT_TH left the old id selected: the candidate list was empty ("No
   * Field Mapping exists for this object yet"), but `selection` was still truthy, so Assign was
   * enabled and wrote the previous object's document to this one. */
  if (object && object.id !== seededFor) {
    setSeededFor(object.id);
    setPicked(null);
    setQuery('');
  }

  if (!object) return null;

  /* Only ever an FMD that is actually offered for THIS object.
   *
   * The reset above fixes the cause; this makes the class of bug unable to reach the database at
   * all. A selection is valid only if it is in the loaded candidate list, so no future state slip
   * can assign a document that was never on screen. `currentFmdId` is exempt because an already
   * assigned FMD is legitimately shown as current even when the candidate query does not return it
   * — but it is never a NEW assignment, since Assign is disabled while selection === currentFmdId. */
  const isOffered = (id: string | null) => !!id && candidates.some((c) => c.id === id);
  const rawSelection = picked ?? currentFmdId ?? null;
  const selection = isOffered(rawSelection) || rawSelection === currentFmdId ? rawSelection : null;
  const none = !isLoading && candidates.length === 0;

  // Searches the object ident too, not just the name. The ident is what ties an FMD to the object
  // it maps, and it is the thing people actually recognise — an FMD called ZFMD_PROG2_W1_… is only
  // findable by the SIF_ ident buried in it.
  const q = query.trim().toLowerCase();
  const shown = q
    ? candidates.filter((c) => (
      c.name.toLowerCase().includes(q)
      || (c.displayId ?? '').toLowerCase().includes(q)
      || (c.objectIdent ?? '').toLowerCase().includes(q)
    ))
    : candidates;

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Field Mapping for ${object.objectId}`}
      size="md"
      footer={
        <>
          {currentFmdId && (
            <Button
              variant="dangerGhost" disabled={busy}
              onClick={() => { onAssign(null); onClose(); }}
            >
              <Link2Off size={14} /> Un-assign
            </Button>
          )}
          <span className="flex-1" />
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          {/* Generating stays available even when candidates exist — reusing is the default, not a
              rule. What changed is which one you have to go looking for. */}
          <Button variant={none ? 'ai' : 'quiet'} disabled={busy} onClick={onGenerate}>
            <Sparkles size={14} /> Generate a new one
          </Button>
          {/* `isOffered`, not just `selection`: assigning is only ever valid for a document this
              object was actually offered. Re-checked at the click as well as in the disable, so a
              selection cannot survive the list changing underneath it. */}
          <Button
            variant="primary" disabled={busy || !isOffered(selection) || selection === currentFmdId}
            onClick={() => { if (isOffered(selection) && selection !== currentFmdId) { onAssign(selection); onClose(); } }}
          >
            {busy ? 'Assigning…' : 'Assign'}
          </Button>
        </>
      }
    >
      <p className="text-sm2 text-muted mb-3">
        {object.description ?? object.objectId} — pick the document this subproject will use. The
        same FMD can be used by several subprojects; assigning it here does not copy it.
      </p>

      {isLoading ? (
        <p className="text-sm2 text-muted py-8 text-center">Loading…</p>
      ) : none ? (
        <div className="rounded-lg bg-surface-2 px-4 py-6 text-center">
          <FileText size={20} className="text-muted mx-auto mb-2" />
          <p className="text-sm2 text-text font-semibold">No Field Mapping exists for this object yet.</p>
          <p className="text-2xs text-muted mt-1">
            Generate one from the Golden template and the object&apos;s sender structures — you choose
            which structures are in scope. It can then be reused by other subprojects.
          </p>
        </div>
      ) : (
        <>
          {candidates.length > 5 && (
            <div className="mb-2">
              <ToolbarSearch value={query} onChange={setQuery} placeholder="Search by name, ID or object…" />
            </div>
          )}
          <div className="rounded-lg bg-surface shadow-[inset_0_0_0_1px_var(--line)] divide-y divide-line-soft overflow-hidden max-h-[46vh] overflow-y-auto">
            {shown.length === 0 ? (
              <p className="text-sm2 text-muted px-3.5 py-6 text-center">No Field Mapping matches that.</p>
            ) : shown.map((c) => (
              <CandidateRow
                key={c.id} candidate={c}
                selected={selection === c.id}
                isCurrent={c.id === currentFmdId}
                onPick={() => setPicked(c.id)}
              />
            ))}
          </div>
        </>
      )}
    </Dialog>
  );
}

function CandidateRow({ candidate: c, selected, isCurrent, onPick }: {
  candidate: AssignableFmd; selected: boolean; isCurrent: boolean; onPick: () => void;
}) {
  return (
    <label
      className={clsx(
        'flex items-center gap-3 px-3.5 py-2.5 cursor-pointer',
        selected ? 'bg-blue-pale' : 'hover:bg-surface-2',
      )}
    >
      <input
        type="radio" name="assign-fmd" checked={selected} onChange={onPick}
        className="w-3.5 h-3.5 accent-[var(--blue)] shrink-0"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm2 font-semibold text-text truncate">{c.name}</span>
        <span className="block text-2xs text-muted truncate">
          <span className="font-mono">{c.displayId ?? '—'}</span>
          {/* The object ident is WHY this row is a candidate. Showing it makes the match visible
              rather than something the reader has to take on trust. */}
          {c.objectIdent && <> · <span className="font-mono font-semibold text-text">{c.objectIdent}</span></>}
        </span>
      </span>
      <span className="text-2xs text-muted shrink-0">{c.type}</span>
      <span className="text-sm2 font-mono shrink-0 w-[64px] text-right">{c.latestVersion ?? '—'}</span>
      {/* "Used in N" is the reuse signal — a document three waves already rely on is usually the
          one you want, and one nobody uses yet is worth a second look before adopting. */}
      <span className="text-2xs text-muted shrink-0 w-[80px] text-right">
        {c.usedIn === 0 ? 'unassigned' : `used in ${c.usedIn}`}
      </span>
      {isCurrent && (
        <Tag variant="accent" size="sm" className="shrink-0 flex items-center gap-1">
          <Check size={10} /> Current
        </Tag>
      )}
    </label>
  );
}
