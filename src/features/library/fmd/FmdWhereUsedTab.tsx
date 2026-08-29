import { useMemo } from 'react';
import { Boxes, Building2, FileStack, FolderTree, Package, Star } from 'lucide-react';
import clsx from 'clsx';
import { Pane } from '../../../components/Pane';
import { Tag } from '../../../components/Tag';
import { useHierarchy } from '../../../lib/queries/hierarchy';
import { useFmdAssignments, useObjectScopeUsage } from '../../../lib/queries/scope';
import type { FmdUsage, GoldenWhereUsedRow, HistoricalSiblingRow } from '../../../lib/queries/fmds';
import type { MigrationObject } from '../../../types/entities';

interface SubprojectLeaf { id: string; code?: string; name: string; isOwner: boolean; isAssigned: boolean }
interface ProjectBranch { id: string; code?: string; name: string; subprojects: SubprojectLeaf[] }
interface ProgramBranch { id: string; code?: string; name: string; projects: ProjectBranch[] }

/** Where an FMD is used, as the hierarchy it is used in.
 *
 * **Never resolve this with a nested PostgREST embed.** `subprojects(projects(programs(...)))`
 * returns null whenever RLS filters any level of the chain, and it does so silently — which is
 * exactly what happened here: Object resolved while Programme, Project and Subproject all rendered
 * as "—" on an FMD that plainly had a subproject. `hierarchy.ts` already carries the rule in a
 * comment ("four requests rather than a nested select, because RLS filters each level
 * independently"); this reads from that same flat, RLS-safe hierarchy instead.
 *
 * It is a TREE rather than one chain because one document can serve more than one place: a Standard
 * FMD is the programme-wide document for its object, and the object can be in scope in several
 * subprojects across several programmes. A single Programme/Project/Subproject row could only ever
 * show one of them, and would quietly imply the others did not exist. */
export function FmdWhereUsedTab({
  usage, fmdId, fmdType, fmdSubprojectId, object, ownNames,
  whereUsed, whereUsedLoading, siblings, siblingsLoading, histSourceName, onOpenFmd,
}: {
  usage?: FmdUsage;
  /** This FMD's id — what the assignment lookup keys on. */
  fmdId?: string;
  fmdType?: string;
  /** The subproject this FMD belongs to, when it is a Custom one. */
  fmdSubprojectId?: string;
  /** Resolved by the caller from the catalogue it already holds — never re-fetched here. */
  object?: MigrationObject;
  /** Placement names already carried on the library row, used when the hierarchy cannot place it. */
  ownNames?: { programName?: string; projectName?: string; subprojectName?: string };
  /** Golden only: the FMDs generated from this template. */
  whereUsed: GoldenWhereUsedRow[];
  whereUsedLoading: boolean;
  /** AI-converted FMDs only: other plants from the same source workbook. */
  siblings: HistoricalSiblingRow[];
  siblingsLoading: boolean;
  histSourceName?: string;
  onOpenFmd?: (fmdId: string) => void;
}) {
  const { data: hierarchy = [], isLoading: hierarchyLoading } = useHierarchy();
  const { data: assignments = [] } = useFmdAssignments(fmdId);
  /** Only for the footnote — subprojects that COULD adopt this but have not. */
  const { data: scopeUsage = [] } = useObjectScopeUsage(object?.id);

  /** Where this FMD is actually USED — the subprojects that assigned it — plus the one that wrote
   * it, whether or not it has adopted its own document.
   *
   * **Not "where the object is in scope".** That was the bug: the tree was built from
   * `useObjectScopeUsage`, so any subproject with SIF_CUSTOMER_2 in scope appeared as a user of
   * this FMD even though it had never assigned it — while the Assign dialog, counting real
   * assignments, called the same document "unassigned". Two screens, two answers, and this was the
   * wrong one. Scope is an opportunity to use an FMD; assignment is using it. */
  const tree = useMemo((): ProgramBranch[] => {
    const assignedTo = new Set(assignments);
    const wanted = new Set<string>(assignedTo);
    if (fmdSubprojectId) wanted.add(fmdSubprojectId);
    if (wanted.size === 0) return [];

    const out: ProgramBranch[] = [];
    const placed = new Set<string>();
    for (const program of hierarchy) {
      const projects: ProjectBranch[] = [];
      for (const project of program.projects) {
        const subprojects = project.subprojects
          .filter((s) => wanted.has(s.id))
          .map((s) => {
            placed.add(s.id);
            return {
              id: s.id, code: s.code, name: s.name,
              isOwner: s.id === fmdSubprojectId,
              isAssigned: assignedTo.has(s.id),
            };
          });
        if (subprojects.length) projects.push({ id: project.id, code: project.code, name: project.name, subprojects });
      }
      if (projects.length) out.push({ id: program.id, code: program.code, name: program.name, projects });
    }

    /** The FMD's own home, when the hierarchy could not place it.
     *
     * `useLibraryFmds` already resolved these names onto the row, so the owning branch can always
     * be drawn even if the hierarchy query is still loading, is filtered, or the subproject has
     * been archived out of it. Without this the one placement the reader is certain about — the one
     * they clicked in from — could be the one thing missing. */
    if (fmdSubprojectId && !placed.has(fmdSubprojectId) && ownNames?.subprojectName) {
      out.push({
        id: `own-${fmdSubprojectId}`,
        name: ownNames.programName ?? 'Programme',
        projects: [{
          id: `own-p-${fmdSubprojectId}`,
          name: ownNames.projectName ?? 'Project',
          subprojects: [{ id: fmdSubprojectId, name: ownNames.subprojectName, isOwner: true, isAssigned: assignedTo.has(fmdSubprojectId) }],
        }],
      });
    }
    return out;
  }, [hierarchy, assignments, fmdSubprojectId, ownNames]);

  const assignedCount = assignments.length;
  /** Subprojects with the object in scope that use something else, or nothing. Stated as a
   * footnote, never as a branch — showing them in the tree is exactly what made this screen claim
   * usage that did not exist. */
  const couldAdopt = scopeUsage.filter((u) => !assignments.includes(u.subprojectId)).length;

  return (
    <div className="h-full overflow-auto flex flex-col gap-3">
      <Pane
        title="Used in"
        className="shrink-0"
        actions={
          <span className="text-2xs text-muted tabular-nums">
            {assignedCount === 0
              ? 'Not assigned'
              : `Assigned in ${assignedCount} subproject${assignedCount === 1 ? '' : 's'}`}
          </span>
        }
        bodyClassName="p-0"
      >
        {hierarchyLoading ? (
          <p className="text-sm2 text-muted p-4">Loading…</p>
        ) : tree.length === 0 ? (
          <div className="px-3.5 py-3">
            <p className="text-sm2 text-text">
              {fmdType === 'Golden'
                ? 'The Golden template belongs to the whole programme — it is not tied to a subproject.'
                : 'Not assigned to any subproject yet.'}
            </p>
            {object && fmdType !== 'Golden' && (
              <p className="text-2xs text-muted mt-1">
                {couldAdopt > 0
                  ? <>Its object <span className="font-mono font-semibold text-text">{object.objectId}</span> is in scope in {couldAdopt} subproject{couldAdopt === 1 ? '' : 's'} that could adopt it — assign it from Scope &gt; FMD Mapping.</>
                  : <>Its object <span className="font-mono font-semibold text-text">{object.objectId}</span> is not in scope anywhere yet.</>}
              </p>
            )}
          </div>
        ) : (
          tree.map((program) => (
            <div key={program.id} className="border-b border-line last:border-b-0">
              <Node icon={<Building2 size={14} />} depth={0} code={program.code} name={program.name} kind="Programme" />
              {program.projects.map((project) => (
                <div key={project.id}>
                  <Node icon={<FolderTree size={14} />} depth={1} code={project.code} name={project.name} kind="Project" />
                  {project.subprojects.map((sub) => (
                    <div key={sub.id}>
                      {/* "Assigned" is the fact that matters; "Written here" is provenance. A
                          subproject that authored the document but never adopted it says exactly
                          that, instead of being counted as a user of it. */}
                      <Node
                        icon={<Boxes size={14} />} depth={2} code={sub.code} name={sub.name} kind="Subproject"
                        badge={sub.isAssigned ? 'Assigned' : 'Written here, not assigned'}
                        badgeTone={sub.isAssigned ? 'accent' : 'neutral'}
                      />
                      {object && sub.isAssigned && (
                        <Node
                          icon={<Package size={14} />} depth={3}
                          code={object.objectId} name={object.description ?? ''} kind="Object" mono
                        />
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))
        )}
      </Pane>

      {/* Upward reference: what this document was built from. */}
      {usage?.basedOn && (
        <Pane title="Generated from" className="shrink-0" bodyClassName="p-0">
          <div className="flex items-center gap-3 px-3.5 py-2.5">
            <FileStack size={14} className="text-muted shrink-0" />
            <span className="min-w-0 flex-1">
              <button
                type="button"
                onClick={onOpenFmd ? () => onOpenFmd(usage.basedOn!.fmdId) : undefined}
                disabled={!onOpenFmd}
                className="text-sm2 font-semibold text-blue hover:underline disabled:text-text disabled:no-underline truncate block text-left"
              >
                {usage.basedOn.name}
              </button>
              {usage.basedOn.displayId && (
                <span className="text-2xs text-muted font-mono">{usage.basedOn.displayId}</span>
              )}
            </span>
            <span className="text-sm2 font-mono shrink-0">{usage.basedOn.version ?? '—'}</span>
            <Tag variant={usage.basedOn.isOutdated ? 'warn' : 'accent'} size="sm" className="shrink-0">
              {usage.basedOn.isOutdated ? 'Template moved on' : 'Current template'}
            </Tag>
          </div>
        </Pane>
      )}

      {/* Downward reference: what was built from this document. Golden only — nothing else in DMS
          is a template for anything. */}
      {fmdType === 'Golden' && (
        <Pane
          title="Referenced by"
          className="shrink-0"
          actions={<span className="text-2xs text-muted tabular-nums">{whereUsed.length} FMD{whereUsed.length === 1 ? '' : 's'}</span>}
          bodyClassName="p-0"
        >
          {whereUsedLoading ? (
            <p className="text-sm2 text-muted p-4">Loading…</p>
          ) : whereUsed.length === 0 ? (
            <p className="text-sm2 text-muted px-3.5 py-6 text-center">Nothing has been generated from this template yet.</p>
          ) : (
            whereUsed.map((r) => (
              <div key={r.fmdId} className="flex items-center gap-3 px-3.5 py-2 border-b border-line-soft last:border-b-0">
                <span className="w-[110px] shrink-0 font-mono text-2xs text-muted truncate">{r.displayId ?? '—'}</span>
                <button
                  type="button"
                  onClick={onOpenFmd ? () => onOpenFmd(r.fmdId) : undefined}
                  disabled={!onOpenFmd}
                  className="text-sm2 text-blue hover:underline disabled:text-text disabled:no-underline truncate flex-1 min-w-0 text-left"
                >
                  {r.name}
                </button>
                <span className="w-[150px] shrink-0 font-mono text-2xs text-muted truncate" title={r.objectId}>{r.objectId ?? '—'}</span>
                <span className="w-[110px] shrink-0 font-mono text-2xs text-muted truncate" title={r.reference}>{r.reference}</span>
                <span className="w-[70px] shrink-0 font-mono text-2xs text-right">{r.basedOnVersion ?? '—'}</span>
                <Tag variant={r.isOutdated ? 'warn' : 'accent'} size="sm" className="shrink-0 w-[92px] justify-center">
                  {r.isOutdated ? 'Outdated' : 'Up to date'}
                </Tag>
              </div>
            ))
          )}
        </Pane>
      )}

      {/* Sideways: the other plants converted from the same workbook. Shown only when there IS a
          tracked source, rather than explaining its own absence on every other FMD. */}
      {!!histSourceName && (
        <Pane
          title="Same source file"
          className="shrink-0"
          actions={<span className="text-2xs text-muted font-mono truncate">{histSourceName}</span>}
          bodyClassName="p-0"
        >
          {siblingsLoading ? (
            <p className="text-sm2 text-muted p-4">Loading…</p>
          ) : siblings.length === 0 ? (
            <p className="text-sm2 text-muted px-3.5 py-6 text-center">No other plants converted from this file yet.</p>
          ) : (
            siblings.map((r) => (
              <div key={r.fmdId} className="flex items-center gap-3 px-3.5 py-2 border-b border-line-soft last:border-b-0">
                <span className="w-[110px] shrink-0 font-mono text-2xs text-muted truncate">{r.displayId ?? '—'}</span>
                <button
                  type="button"
                  onClick={onOpenFmd ? () => onOpenFmd(r.fmdId) : undefined}
                  disabled={!onOpenFmd}
                  className="text-sm2 text-blue hover:underline disabled:text-text disabled:no-underline truncate flex-1 min-w-0 text-left"
                >
                  {r.name}
                </button>
                <span className="w-[90px] shrink-0 font-mono text-2xs text-muted truncate">{r.plant ?? '—'}</span>
                <span className="w-[110px] shrink-0 font-mono text-2xs text-muted truncate">{r.reference}</span>
                <span className="w-[70px] shrink-0 font-mono text-2xs text-right">{r.version ?? '—'}</span>
              </div>
            ))
          )}
        </Pane>
      )}
    </div>
  );
}

/** One level of the tree. Indent carries the depth and a guide rule keeps long lists readable —
 * four levels of icon alone leaves the eye no line to follow back up to the parent. */
function Node({ icon, depth, code, name, kind, badge, badgeTone = 'accent', mono }: {
  icon: React.ReactNode;
  depth: number;
  code?: string;
  name: string;
  kind: string;
  badge?: string;
  badgeTone?: 'accent' | 'neutral';
  mono?: boolean;
}) {
  return (
    <div
      className={clsx(
        'flex items-center gap-2.5 py-1.5 pr-3.5 border-b border-line-soft last:border-b-0',
        depth > 0 && 'border-l border-line ml-[26px]',
      )}
      style={{ paddingLeft: depth === 0 ? 14 : 14 }}
    >
      <span className="text-muted shrink-0">{icon}</span>
      {code && (
        <span className={clsx('shrink-0 font-semibold text-text', mono ? 'text-sm2 font-mono' : 'text-sm2')}>
          {code}
        </span>
      )}
      <span className={clsx('truncate min-w-0', code ? 'text-2xs text-muted' : 'text-sm2 font-semibold text-text')}>
        {name || '—'}
      </span>
      {badge && (
        <Tag variant={badgeTone} size="sm" className="shrink-0 ml-auto flex items-center gap-1">
          {badgeTone === 'accent' && <Star size={10} />} {badge}
        </Tag>
      )}
      <span className={clsx('text-2xs text-muted shrink-0', badge ? '' : 'ml-auto')}>{kind}</span>
    </div>
  );
}
