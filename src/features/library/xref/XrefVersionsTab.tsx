import { useState } from 'react';
import { GitCompare } from 'lucide-react';
import { Pane } from '../../../components/Pane';
import { Tag } from '../../../components/Tag';
import { Button } from '../../../components/Button';
import { flattenXref } from '../../../lib/xrefHealth';
import { By, Fact, Group } from '../fmd/versionFacts';
import { XrefCompareDialog } from './XrefCompareDialog';
import type { LibraryXrefRow } from '../../../lib/queries/rules';
import type { XrefVersion } from '../../../types/entities';

/** The selected version's facts, at full width.
 *
 * The Golden FMD's Versions tab is exactly this — who touched it, what it is, why. Review panes are
 * NOT here: a review is something you write about a document being built for a subproject, and the
 * Golden template is neither. (The FMD makes the same split by labelling the tab "Versions & Review"
 * only for Custom FMDs.)
 *
 * **No version list.** The header dropdown is the single selector; a list beside it is a second one
 * for the same thing. Compare versions… is the exception that proves it — it needs a *baseline* as
 * well as a subject, which is a different question from "which version am I looking at", and it
 * asks it inside its own dialog rather than putting a second selector on this pane. */
export function XrefVersionsTab({ xref, versions, selected }: {
  xref: LibraryXrefRow;
  /** Newest first. */
  versions: XrefVersion[];
  selected?: XrefVersion;
}) {
  const [comparing, setComparing] = useState(false);
  const latest = versions[0];

  return (
    <>
      <Pane
        title="Version details"
        bodyClassName="p-3.5"
        actions={
          <Button
            variant="quiet" size="sm" className="ml-auto"
            onClick={() => setComparing(true)}
            disabled={versions.length < 2}
            title={versions.length < 2 ? 'There is only one version to look at' : undefined}
          >
            <GitCompare size={13} /> Compare versions…
          </Button>
        }
      >
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

            {/* Stable attributes of the template rather than of this release — the same split the
                FMD pane makes between who touched a version and what the document is. */}
            <Group>
              <Fact label="Class">{xref.class}</Fact>
              <Fact label="Reference">{xref.reference}</Fact>
              <Fact label="Fields">{flattenXref(selected.structure).length}</Fact>
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

      <XrefCompareDialog
        open={comparing}
        versions={versions}
        selectedId={selected?.id}
        onClose={() => setComparing(false)}
      />
    </>
  );
}
