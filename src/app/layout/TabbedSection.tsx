import { Outlet, useParams } from 'react-router-dom';
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
  const basePath = `/pg/${programId}/sp/${subprojectId}/${segment}`;

  return (
    <ScreenGate screen={screen}>
      <PageHeader title={title} description={description} />
      <TabStrip items={tabs} basePath={basePath} />
      <Outlet />
    </ScreenGate>
  );
}
