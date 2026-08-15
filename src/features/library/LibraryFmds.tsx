import { useState } from 'react';
import { Upload, Wand2 } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';
import { Table, type Column } from '../../components/Table';
import { Button } from '../../components/Button';
import { useAllFmds } from '../../lib/queries/fmds';
import { FmdEditorDialog } from '../scope/FmdEditorDialog';
import { HistoricalUploadDialog } from './HistoricalUploadDialog';
import { FmdStandardizerDialog } from './FmdStandardizerDialog';
import type { Fmd } from '../../types/entities';

export function LibraryFmds() {
  const { data: fmds = [], isLoading } = useAllFmds();
  const [openFmd, setOpenFmd] = useState<Fmd | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [standardizerOpen, setStandardizerOpen] = useState(false);

  const columns: Column<Fmd>[] = [
    { key: 'name', header: 'Name', render: (f) => f.name },
  ];

  return (
    <div>
      <PageHeader
        title="Field Mapping Documents"
        description="FMDs across every wave you have access to."
        actions={<>
          <Button variant="secondary" onClick={() => setUploadOpen(true)}><Upload size={13} /> Upload Historical FMD</Button>
          <Button variant="secondary" onClick={() => setStandardizerOpen(true)}><Wand2 size={13} /> FMD Standardizer</Button>
        </>}
      />
      {!isLoading && fmds.length === 0 ? (
        <EmptyState title="No FMDs yet" description="Field mapping documents created for any wave will list here." />
      ) : (
        <Table columns={columns} rows={fmds} rowKey={(f) => f.id} onRowClick={setOpenFmd} emptyMessage="Loading…" />
      )}
      <FmdEditorDialog fmd={openFmd} onClose={() => setOpenFmd(null)} />
      <HistoricalUploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
      <FmdStandardizerDialog open={standardizerOpen} onClose={() => setStandardizerOpen(false)} />
    </div>
  );
}
