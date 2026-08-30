import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Dialog } from '../../components/Dialog';
import { useToast } from '../../components/Toast';
import { Select } from '../../components/Select';
import { Pane } from '../../components/Pane';
import { Tag } from '../../components/Tag';
import { Button } from '../../components/Button';
import { By, Fact, Group } from './fmd/versionFacts';
import { useGoldenXrefMutations, useXrefVersions, type LibraryXrefRow } from '../../lib/queries/rules';
import { GoldenFmdStructureView } from './GoldenFmdStructureView';

type Tab = 'structure' | 'versions';

/** Read-only view of the (singleton) Golden XREF — shaped exactly like the Golden FMD viewer.
 *
 * It used to be laid out the other way round: a permanent 300px rail of versions and details on the
 * left with the structure squeezed into whatever was left. Two templates that are read the same
 * way, opened from sibling rows of the same catalogue, gave the reader two different screens — and
 * the one that showed the actual content gave it the smaller half.
 *
 * So it follows the contract in the library-section-design skill, the one the FMD viewer already
 * keeps:
 *   · ONE version selector in the header, driving every tab — a single answer to "which version am
 *     I looking at" wherever you are in the dialog.
 *   · Structure tab: the selected version's fields at FULL dialog width, and nothing else.
 *   · Versions tab: the version details at full width. NO version list — the header dropdown is
 *     already the selector, and a list beside it is a second one for the same thing.
 *
 * Editing is still only ever through the "Golden XREF" toolbar button / GoldenXrefDesignerDialog.
 * There is no Where-used tab because nothing references a Golden XREF template yet — an empty tab
 * would be a promise the data cannot keep. */
export function GoldenXrefViewerDialog({ xref, onClose }: { xref: LibraryXrefRow | null; onClose: () => void }) {
  const { data: versions = [], isLoading } = useXrefVersions(xref?.id);
  const mutations = useGoldenXrefMutations();
  const toast = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('structure');
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    setSelectedId(versions[0]?.id ?? null);
    setTab('structure');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xref?.id, versions.length]);

  const latest = versions[0];
  const selected = useMemo(
    () => versions.find((v) => v.id === selectedId) ?? latest,
    [versions, selectedId, latest],
  );

  /* A version is a draft when it has no `published_at` — never because its `state` reads "Draft".
     State is a word the designer writes; published_at is what the database trigger enforces. */
  const isDraft = !!selected && !selected.publishedAt;

  const publish = async () => {
    if (!xref) return;
    setPublishing(true);
    try {
      const version = await mutations.publishDraft(xref.id);
      toast.success(`Published ${version}.`);
    } catch (err: any) {
      toast.error(err.message ?? 'Could not publish the draft.');
    } finally {
      setPublishing(false);
    }
  };

  /* Publishing is offered wherever the draft is on screen, because that is where the decision gets
     made — reading the structure is what tells you it is ready. The FMD keeps its Publish on a
     dedicated Draft tab; the XREF has no such tab (its draft is a whole structure, not a list of
     pending cell edits), so the banner rides above whichever tab is showing it. */
  const draftBanner = isDraft && (
    <div className="flex items-center gap-3 mb-3 shrink-0 rounded border border-amber-300 bg-amber-50 px-3 py-2">
      <span className="text-sm2 text-amber-900 flex-1 min-w-0">
        This is an unpublished draft. It is not the live Golden XREF until you publish it.
      </span>
      <Button size="sm" onClick={publish} disabled={publishing}>
        {publishing ? 'Publishing…' : 'Publish'}
      </Button>
    </div>
  );

  if (!xref) return null;

  return (
    <Dialog open={!!xref} onClose={onClose} title={xref.name} size="win">
      {isLoading ? (
        <p className="text-sm2 text-muted">Loading…</p>
      ) : (
        <div className="flex flex-col h-full min-h-0">
          <div className="flex items-center justify-between gap-3 border-b border-line mb-3 shrink-0">
            <div className="flex items-center gap-1">
              {([
                { key: 'structure', label: 'Cross Reference' },
                { key: 'versions', label: 'Versions' },
              ] as const).map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={clsx(
                    'px-3.5 py-2 text-sm2 font-semibold border-b-2 -mb-px',
                    tab === t.key ? 'border-blue text-blue' : 'border-transparent text-muted hover:text-text',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* One selector for the whole dialog, matching the FMD viewer. Both tabs render
                whatever is picked here, so there is a single answer to which version is on screen. */}
            {versions.length > 0 && (
              <label className="flex items-center gap-1.5 text-2xs text-muted shrink-0 -mt-[5px]">
                Version
                <Select
                  value={selected?.id ?? ''}
                  onChange={(e) => setSelectedId(e.target.value)}
                  size="sm"
                >
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {/* "latest" is only meaningful for a released version — a draft sits above
                          the live one without being it, so it says so instead. */}
                      {v.version}{!v.publishedAt ? ' · unpublished' : v.id === latest?.id ? ' · latest' : ''}
                    </option>
                  ))}
                </Select>
              </label>
            )}
          </div>

          {draftBanner}

          <div className="flex-1 min-h-0 overflow-auto">
            {tab === 'structure' ? (
              selected?.structure?.sections?.length ? (
                <GoldenFmdStructureView structure={selected.structure} />
              ) : (
                <p className="text-sm2 text-muted py-8 text-center">No structure recorded for this version.</p>
              )
            ) : (
              /* Full width, and NO version list.
                 The header dropdown is the single version selector — a list pane beside it was a
                 second selector for the same thing, which is exactly what the FMD viewer removed
                 and what the library-section-design skill says not to reintroduce. Rendered with
                 the same Fact/Group primitives as that pane rather than a lookalike, so the two
                 cannot drift again. */
              <Pane title="Version details" bodyClassName="p-3.5">
                {selected ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-sm2 text-blue-deep w-fit bg-blue-pale px-2 py-0.5 rounded">
                        {selected.version}
                      </span>
                      {!selected.publishedAt
                        ? <Tag variant="danger">Draft</Tag>
                        : selected.id === latest?.id && <Tag variant="accent">Latest</Tag>}
                    </div>

                    <Group>
                      <Fact label="Modified by"><By who={selected.createdBy} at={selected.createdAt} /></Fact>
                      <Fact label="Published by">
                        {selected.publishedAt
                          ? <By who={selected.publishedBy} at={selected.publishedAt} />
                          : <span className="text-muted">Not published yet</span>}
                      </Fact>
                    </Group>

                    {/* Stable attributes of the template rather than of this release — the same
                        split the FMD pane makes between who touched a version and what the
                        document is. */}
                    <Group>
                      <Fact label="Class">{xref.class}</Fact>
                      <Fact label="Reference">{xref.reference}</Fact>
                      <Fact label="Versions">{versions.length}</Fact>
                    </Group>

                    <Group>
                      <Fact label="Comment">
                        {selected.comment || <span className="text-muted">No comment provided</span>}
                      </Fact>
                    </Group>
                  </div>
                ) : (
                  <p className="text-sm2 text-muted">No versions yet.</p>
                )}
              </Pane>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
