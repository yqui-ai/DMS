import { useState } from 'react';
import { AlertTriangle, Hammer } from 'lucide-react';
import clsx from 'clsx';
import { Pane } from '../../../components/Pane';
import { Tag } from '../../../components/Tag';
import { Button } from '../../../components/Button';
import { useToast } from '../../../components/Toast';
import { useBuildXrefFromGolden, useXrefWhereUsed } from '../../../lib/queries/xrefReview';
import type { XrefVersion } from '../../../types/entities';

/** Which cross-reference tables were built from this template, and which have fallen behind.
 *
 * The Golden FMD's Where-used answers the same question about FMDs, and could do so from day one
 * because generation always stamped `fmds.based_on_golden_version_id`. Nothing ever wrote the XREF
 * equivalent, so this tab could not exist: every table read as unrelated to the template, and a
 * list that says "unknown" for every row is worse than no list. Migration 0060 adds the column and
 * **Build from Golden** is what writes it — which is also why most rows start as "Never built".
 *
 * Only the LATEST PUBLISHED version is a valid thing to build from. Building from a draft would
 * put unreleased work into a table the programme is using, and building from a superseded version
 * would generate something already outdated. */
export function XrefWhereUsedTab({ goldenId, latestPublished }: {
  goldenId: string;
  /** The Golden's newest published version. Undefined while it has only ever been a draft. */
  latestPublished?: XrefVersion;
}) {
  const { data: rows = [], isLoading } = useXrefWhereUsed(goldenId, latestPublished?.id);
  const { build } = useBuildXrefFromGolden();
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  const outdated = rows.filter((r) => r.isOutdated).length;
  const neverBuilt = rows.filter((r) => r.neverBuilt).length;

  const runBuild = async (id: string, name: string) => {
    if (!latestPublished) return;
    setBusyId(id);
    try {
      const version = await build(id, latestPublished.id, latestPublished.version, latestPublished.structure);
      toast.success(`${name} rebuilt from ${latestPublished.version} as ${version}.`);
    } catch (err: any) {
      toast.error(err.message ?? 'Could not build from the template.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      {!latestPublished && (
        <div className="flex items-start gap-3 rounded-lg bg-amber-bg shadow-[inset_0_0_0_1px_var(--amber-ink)] px-4 py-3 shrink-0">
          <AlertTriangle size={16} className="text-amber-ink shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="text-sm2 font-semibold text-amber-ink">The template has never been published</div>
            <p className="text-2xs text-amber-ink/90 mt-0.5">
              Nothing can be built from a draft — publish it first, on the Draft tab.
            </p>
          </div>
        </div>
      )}

      <Pane
        title="Tables built from this template"
        className="flex-1 min-h-0"
        actions={
          <>
            {outdated > 0 && <Tag variant="warn" size="sm">{outdated} outdated</Tag>}
            {neverBuilt > 0 && <Tag variant="neutral" size="sm">{neverBuilt} never built</Tag>}
            {rows.length > 0 && outdated === 0 && neverBuilt === 0 && <Tag variant="accent" size="sm">All current</Tag>}
          </>
        }
      >
        <div className="overflow-auto">
          {isLoading ? (
            <p className="text-sm2 text-muted p-3.5">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm2 text-muted p-3.5">
              No other cross-reference tables exist yet. Once they do, this shows which template
              version each was built from and whether it has since moved on.
            </p>
          ) : (
            rows.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-3.5 py-2 border-b border-line-soft last:border-b-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 min-w-0">
                    {r.displayId && <span className="font-mono text-2xs text-muted shrink-0">{r.displayId}</span>}
                    <span className="font-mono text-sm2 truncate" title={r.name}>{r.name}</span>
                  </div>
                  <div className="text-2xs text-muted">{r.reference}</div>
                </div>

                <span className="text-2xs text-muted shrink-0 w-[150px] text-right">
                  {r.neverBuilt
                    ? 'Not built from the template'
                    : <>Built from <span className="font-mono font-semibold text-text">{r.basedOnVersion ?? '—'}</span></>}
                </span>

                {/* State reads as a tag, not as a colour on the row — the row is data, and tinting
                    every one of them would leave nothing for the exceptions to stand out against. */}
                <span className="shrink-0 w-[96px] flex justify-end">
                  {r.isOutdated
                    ? <Tag variant="warn" size="sm">Outdated</Tag>
                    : r.neverBuilt
                      ? <Tag variant="neutral" size="sm">Never built</Tag>
                      : <Tag variant="accent" size="sm">Current</Tag>}
                </span>

                <Button
                  variant="quiet" size="sm" className="shrink-0"
                  disabled={!latestPublished || busyId === r.id}
                  onClick={() => runBuild(r.id, r.name)}
                  title={latestPublished
                    ? `Generate this table's structure from Golden ${latestPublished.version}`
                    : 'Publish the template first'}
                >
                  <Hammer size={13} />
                  {busyId === r.id ? 'Building…' : r.neverBuilt ? 'Build' : 'Rebuild'}
                </Button>
              </div>
            ))
          )}
        </div>
      </Pane>

      <p className={clsx('text-2xs text-muted shrink-0')}>
        Building writes the template's structure onto the table as a new published version and
        records which Golden version it came from. It does not touch the table's value rows.
      </p>
    </div>
  );
}
