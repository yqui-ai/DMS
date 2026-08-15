import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Table, type Column } from '../../components/Table';
import { Tag } from '../../components/Tag';
import { Button } from '../../components/Button';
import { useToast } from '../../components/Toast';
import { useMigrationObjects, useSubprojectObjects } from '../../lib/queries/scope';
import { useAllFmds } from '../../lib/queries/fmds';
import { sanitizeName } from '../../lib/sanitize';
import { supabase } from '../../lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { FmdEditorDialog } from './FmdEditorDialog';
import type { Fmd, MigrationObject } from '../../types/entities';

interface Row { obj: MigrationObject; fmd?: Fmd }

export function FmdMapping() {
  const { subprojectId } = useParams();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data: objects = [] } = useMigrationObjects();
  const { data: subprojectObjects = [] } = useSubprojectObjects(subprojectId);
  const { data: allFmds = [] } = useAllFmds();
  const [creating, setCreating] = useState<string | null>(null);
  const [openFmd, setOpenFmd] = useState<Fmd | null>(null);

  const fmdsByObject = useMemo(() => new Map(allFmds.filter((f) => f.subprojectId === subprojectId).map((f) => [f.migrationObjectId, f])), [allFmds, subprojectId]);
  const inScopeIds = new Set(subprojectObjects.filter((w) => w.inScope).map((w) => w.migrationObjectId));
  const rows: Row[] = objects.filter((o) => inScopeIds.has(o.id)).map((o) => ({ obj: o, fmd: fmdsByObject.get(o.id) }));

  const createFmd = async (obj: MigrationObject) => {
    setCreating(obj.id);
    try {
      const { data, error } = await supabase
        .from('fmds').insert({ subproject_id: subprojectId, migration_object_id: obj.id, name: sanitizeName(`FMD_${obj.objectId}`) })
        .select('id, subproject_id, migration_object_id, name, class, type').single();
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['fmds-all'] });
      await queryClient.invalidateQueries({ queryKey: ['fmds-library'] });
      setOpenFmd({ id: data.id, subprojectId: data.subproject_id, migrationObjectId: data.migration_object_id, name: data.name, class: data.class, type: data.type });
    } catch (err: any) {
      toast.error(err.message ?? 'Could not create FMD.');
    } finally {
      setCreating(null);
    }
  };

  const columns: Column<Row>[] = [
    { key: 'objectId', header: 'Object', render: (r) => <Tag variant="table">{r.obj.objectId}</Tag> },
    { key: 'description', header: 'Description', render: (r) => r.obj.description ?? '—' },
    {
      key: 'fmd', header: 'FMD',
      render: (r) => r.fmd ? (
        <button onClick={() => setOpenFmd(r.fmd!)}><Tag variant="accent">{r.fmd.name}</Tag></button>
      ) : (
        <Button variant="ghost" onClick={() => createFmd(r.obj)} disabled={creating === r.obj.id}>
          <Plus size={13} /> {creating === r.obj.id ? 'Creating…' : 'Create FMD'}
        </Button>
      ),
    },
  ];

  return (
    <>
      <Table columns={columns} rows={rows} rowKey={(r) => r.obj.id} emptyMessage="No objects in scope yet." />
      <FmdEditorDialog fmd={openFmd} onClose={() => setOpenFmd(null)} />
    </>
  );
}
