import { Outlet, useParams } from 'react-router-dom';
import { useSubproject } from '../../lib/queries/programme';
import { ScreenGate } from './ScreenGate';
import { TabStrip, type TabStripItem } from './TabStrip';
import { PageHeader } from '../../components/PageHeader';
import type { ScreenKey } from '../../types/entities';

export interface TabbedSectionProps {
  screen: ScreenKey;
  title: string;
  description?: string;
  tabs: TabStripItem[];
  segment: string; // path segment under /pg/:programId/sp/:subprojectId
}

/** Section root for a nav item with a per-screen tab strip (Scope, Rules & XREF, Data Migration, Data Quality, …). */
export function TabbedSection({ screen, title, description, tabs, segment }: TabbedSectionProps) {
  const { programId, subprojectId } = useParams();
  const { data: subproject } = useSubproject(subprojectId);
  const basePath = `/pg/${programId}/sp/${subprojectId}/${segment}`;

  /** Some tabs only exist once a precondition is met — Scope's ERD Diagram and FMD Mapping appear
   * after the scope is finalized. Hiding rather than disabling: a tab you can click that then tells
   * you it isn't ready is a worse answer than a tab that arrives when it means something. */
  const visible = tabs.filter((t) => t.requires !== 'scopeFinalized' || subproject?.scopeFinalized);

  return (
    <ScreenGate screen={screen}>
      <div className="shrink-0">
        <PageHeader title={title} description={description} />
        <TabStrip items={visible} basePath={basePath} />
      </div>
      {/* min-h-0 is what lets a filling child shrink below its content height. Without it
          flex-1 does nothing and the page grows instead. */}
      <div className="flex-1 min-h-0 flex flex-col"><Outlet /></div>
    </ScreenGate>
  );
}
