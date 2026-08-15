import { EmptyState } from './EmptyState';
import { PageHeader } from './PageHeader';
import { Layers } from 'lucide-react';

/** Phase-1 routing skeleton stand-in — swapped for the real screen feature-by-feature. */
export function Placeholder({ title, description }: { title: string; description?: string }) {
  return (
    <div>
      <PageHeader title={title} description={description} />
      <EmptyState icon={<Layers size={26} />} title="Screen not yet built" description="This route is wired up as part of the phase-1 foundation; the real screen lands in a later phase." />
    </div>
  );
}
