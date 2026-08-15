import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Table, type Column } from '../../components/Table';
import { Tag } from '../../components/Tag';
import { Button } from '../../components/Button';
import { useToast } from '../../components/Toast';
import { useMigrationObjects, useWaveObjects } from '../../lib/queries/scope';
import { useAllFmds } from '../../lib/queries/fmds';
import { supabase } from '../../lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { FmdEditorDialog } from './FmdEditorDialog';
import type { Fmd, MigrationObject } from '../../types/entities';

interface Row { obj: MigrationObject; fmd?: Fmd }

export function FmdMapping() {
  const { waveId } = useParams();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data: objects = [] } = useMigrationObjects();
  const { data: waveObjects = [] } = useWaveObjects(waveId);
  const { data: allFmds = [] } = useAllFmds();
  const [creating, setCreating] = useState<string | null>(null);
  const [openFmd, setOpenFmd] = useState<Fmd | null>(null);

  const fmdsByObject = useMemo(() => new Map(allFmds.filter((f) => f.waveId === waveId).map((f) => [f.migrationObjectId, f])), [allFmds, waveId]);
  const inScopeIds = new Set(waveObjects.filter((w) => w.inScope).map((w) => w.migrationObjectId));
  const rows: Row[] = objects.filter((o) => inScopeIds.has(o.id)).map((o) => ({ obj: o, fmd: fmdsByObject.get(o.id) }));

  const createFmd = async (obj: MigrationObject) => {
    setCreating(obj.id);
    try {
      const { data, error } = await supabase
        .from('fmds').insert({ wave_id: waveId, migration_object_id: obj.id, name: `FMD — ${obj.objectId}` })
        .select('id, wave_id, migration_object_id, name').single();
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['fmds-all'] });
      setOpenFmd({ id: data.id, waveId: data.wave_id, migrationObjectId: data.migration_object_id, name: data.name });
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
