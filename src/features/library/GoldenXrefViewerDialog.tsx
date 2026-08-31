import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { ExternalLink } from 'lucide-react';
import { DocumentShell } from '../../components/DocumentShell';
import { useToast } from '../../components/Toast';
import { Select } from '../../components/Select';
import { Tag } from '../../components/Tag';
import { Button } from '../../components/Button';
import { useGoldenXrefMutations, useXrefVersions, type LibraryXrefRow } from '../../lib/queries/rules';
import { useLibraryPath } from '../../lib/libraryNav';
import { GoldenFmdStructureView } from './GoldenFmdStructureView';
import { XrefDraftTab } from './xref/XrefDraftTab';
import { XrefVersionsTab } from './xref/XrefVersionsTab';
import { XrefWhereUsedTab } from './xref/XrefWhereUsedTab';

type Tab = 'structure' | 'draft' | 'versions' | 'where-used';

/** Read-only view of the (singleton) Golden XREF — shaped exactly like the Golden FMD viewer.
 *
 * It used to be laid out the other way round: a permanent 300px rail of versions and details on the
 * left with the structure squeezed into whatever was left. Two templates that are read the same
 * way, opened from sibling rows of the same catalogue, gave the reader two different screens — and
 * the one that showed the actual content gave it the smaller half.
 *
 * So it follows the contract in the library-section-design skill, the one the GOLDEN FMD viewer
 * already keeps: ONE version selector in the header driving every tab, and the same tabs.
 *
 *   · Cross Reference — the selected version's fields, at full dialog width.
 *   · Draft           — present only while an unpublished draft exists, and the only place Publish
 *                       lives, exactly as on the FMD.
 *   · Versions        — the selected version's facts, plus Compare versions…
 *   · Where used      — which tables were built from this template and which have fallen behind.
 *
 * **No Health or Review tab here.** Both are things you ask about a document being built for a
 * subproject — is it complete, what do we think of it — and the Golden template is neither: it is
 * what those documents are generated FROM. They belong to the non-Golden XREF viewer, which does
 * not exist yet; `XrefHealthTab` and `XrefReviewTab` are written and waiting for it (see the note
 * at the top of each). Mounting them here made the Golden XREF viewer carry two tabs its FMD
 * counterpart deliberately does not have.
 *
 * Editing is still only ever through the "Golden XREF" toolbar button / GoldenXrefDesignerDialog. */
export function GoldenXrefViewerDialog({ xref, onClose, asPage }: {
  xref: LibraryXrefRow | null;
  onClose: () => void;
  /** Rendered as its own page rather than over the catalogue — see DocumentShell. */
  asPage?: boolean;
}) {
  const { data: versions = [], isLoading } = useXrefVersions(xref?.id);
  const mutations = useGoldenXrefMutations();
  const toast = useToast();
  const to = useLibraryPath();
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
    ...(hasDraft ? [{ key: 'draft' as const, label: 'Draft' }] : []),
    { key: 'versions' as const, label: 'Versions' },
    { key: 'where-used' as const, label: 'Where used' },
  ];

  if (!xref) return null;

  /* Same placement as the FMD viewer: the document's own actions live in the TITLE BAR beside the
     close button, so the tab row is left to the tabs.
     The version selector is still the ONE selector for the whole dialog — every tab that reads a
     version reads whatever is picked here. It hides on the tabs that do not read one: Draft is by
     definition the draft, and Where used compares against the latest published version. A selector
     that visibly does nothing is worse than none. */
  const documentActions = (
    <>
          {/* Same reasoning as the FMD viewer's: a modal has to be closed to look at anything
              else, and an in-app full-screen mode would not change that — it still occupies the
              one window. The address already exists (this view is a route); this makes it
              reachable without copying the URL out of the bar. */}
          {/* Hidden in page mode: you are already in that tab, and a button offering
              to open one more of the same document is an invitation to lose track of which is
              which. */}
          {!asPage && <Button
            variant="quiet" size="sm"
            onClick={() => window.open(`${window.location.origin}${to('view')}/xref/${xref.id}`, '_blank', 'noopener')}
            title="Open this XREF in a new browser tab, so you can keep it open while using other screens"
          >
            <ExternalLink size={14} /> New tab
          </Button>}
          {versions.length > 0 && (tab === 'structure' || tab === 'versions') && (
            <label className="flex items-center gap-1.5 text-2xs text-muted">
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
    </>
  );

  return (
    <DocumentShell
      asPage={asPage}
      open={!!xref}
      onClose={onClose}
      title={xref.name}
      backTo={to('xref')}
      backLabel="Back to Cross Reference"
      headerActions={documentActions}
    >
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

          </div>

          <div className="flex-1 min-h-0 overflow-auto">
            {tab === 'structure' ? (
              selected?.structure?.sections?.length ? (
                <GoldenFmdStructureView structure={selected.structure} />
              ) : (
                <p className="text-sm2 text-muted py-8 text-center">No structure recorded for this version.</p>
              )
            ) : tab === 'draft' ? (
              <XrefDraftTab versions={versions} onPublish={publish} publishing={publishing} />
            ) : tab === 'versions' ? (
              <XrefVersionsTab xref={xref} versions={versions} selected={selected} />
            ) : (
              <XrefWhereUsedTab goldenId={xref.id} latestPublished={latestPublished} />
            )}
          </div>
        </div>
      )}
    </DocumentShell>
  );
}
