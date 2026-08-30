import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Dialog } from '../../components/Dialog';
import { useToast } from '../../components/Toast';
import { Select } from '../../components/Select';
import { Tag } from '../../components/Tag';
import { useGoldenXrefMutations, useXrefVersions, type LibraryXrefRow } from '../../lib/queries/rules';
import { GoldenFmdStructureView } from './GoldenFmdStructureView';
import { XrefHealthTab } from './xref/XrefHealthTab';
import { XrefDraftTab } from './xref/XrefDraftTab';
import { XrefReviewTab } from './xref/XrefReviewTab';
import { XrefWhereUsedTab } from './xref/XrefWhereUsedTab';

type Tab = 'structure' | 'health' | 'draft' | 'versions' | 'where-used';

/** Read-only view of the (singleton) Golden XREF — shaped exactly like the Golden FMD viewer.
 *
 * It used to be laid out the other way round: a permanent 300px rail of versions and details on the
 * left with the structure squeezed into whatever was left. Two templates that are read the same
 * way, opened from sibling rows of the same catalogue, gave the reader two different screens — and
 * the one that showed the actual content gave it the smaller half.
 *
 * So it follows the contract in the library-section-design skill, the one the FMD viewer already
 * keeps: ONE version selector in the header driving every tab, and the same five tabs answering the
 * same five questions.
 *
 *   · Cross Reference — the selected version's fields, at full dialog width.
 *   · Health          — can this template do its job. Always the LATEST version, so the header
 *                       selector hides while it is open.
 *   · Draft           — present only while an unpublished draft exists, and the only place Publish
 *                       lives, exactly as on the FMD.
 *   · Versions & Review — the selected version's facts beside the review of the template.
 *   · Where used      — which tables were built from this template and which have fallen behind.
 *
 * Editing is still only ever through the "Golden XREF" toolbar button / GoldenXrefDesignerDialog. */
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
  const hasDraft = !!latest && !latest.publishedAt;
  const latestPublished = versions.find((v) => v.publishedAt);

  const publish = async () => {
    if (!xref) return;
    setPublishing(true);
    try {
      const version = await mutations.publishDraft(xref.id);
      toast.success(`Published ${version}.`);
      // Land on Versions afterwards: the Draft tab is about to disappear, and leaving someone on a
      // tab that vanishes under them is disorienting.
      setTab('versions');
    } catch (err: any) {
      toast.error(err.message ?? 'Could not publish the draft.');
    } finally {
      setPublishing(false);
    }
  };

  /* The Draft tab exists only while a draft does — its absence is how you know nothing is pending,
     and a permanently-present tab reading "no draft" is a tab nobody ever needs to click. */
  const TABS = [
    { key: 'structure' as const, label: 'Cross Reference' },
    { key: 'health' as const, label: 'Health' },
    ...(hasDraft ? [{ key: 'draft' as const, label: 'Draft' }] : []),
    { key: 'versions' as const, label: 'Versions & Review' },
    { key: 'where-used' as const, label: 'Where used' },
  ];

  if (!xref) return null;

  return (
    <Dialog open={!!xref} onClose={onClose} title={xref.name} size="win">
      {isLoading ? (
        <p className="text-sm2 text-muted">Loading…</p>
      ) : (
        <div className="flex flex-col h-full min-h-0">
          <div className="flex items-center justify-between gap-3 border-b border-line mb-3 shrink-0">
            <div className="flex items-center gap-1">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={clsx(
                    'px-3.5 py-2 text-sm2 font-semibold border-b-2 -mb-px',
                    tab === t.key ? 'border-blue text-blue' : 'border-transparent text-muted hover:text-text',
                  )}
                >
                  {t.label}
                  {t.key === 'draft' && <Tag variant="danger" size="sm" className="ml-1.5">1</Tag>}
                </button>
              ))}
            </div>

            {/* One selector for the whole dialog, matching the FMD viewer — every tab that renders
                a version renders whatever is picked here, so there is a single answer to which
                version is on screen. Hidden on the tabs that do not read it: Health always measures
                the latest, Draft is by definition the draft, and Where used compares against the
                latest published one. A selector that visibly does nothing is worse than none. */}
            {versions.length > 0 && (tab === 'structure' || tab === 'versions') && (
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

          <div className="flex-1 min-h-0 overflow-auto">
            {tab === 'structure' ? (
              selected?.structure?.sections?.length ? (
                <GoldenFmdStructureView structure={selected.structure} />
              ) : (
                <p className="text-sm2 text-muted py-8 text-center">No structure recorded for this version.</p>
              )
            ) : tab === 'health' ? (
              <XrefHealthTab
                versions={versions}
                selectedId={selected?.id}
                onOpenDraft={() => setTab('draft')}
              />
            ) : tab === 'draft' ? (
              <XrefDraftTab versions={versions} onPublish={publish} publishing={publishing} />
            ) : tab === 'versions' ? (
              <XrefReviewTab xref={xref} versions={versions} selected={selected} />
            ) : (
              <XrefWhereUsedTab goldenId={xref.id} latestPublished={latestPublished} />
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
