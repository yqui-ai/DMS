import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FileSpreadsheet } from 'lucide-react';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { useToast } from '../../components/Toast';
import { useMigrationObjects } from '../../lib/queries/scope';
import { useDefaultProgram, useProjects, useSubprojects } from '../../lib/queries/programme';
import { supabase } from '../../lib/supabase';
import { sanitizeName } from '../../lib/sanitize';
import { useQueryClient } from '@tanstack/react-query';

/** Historical FMD upload — brings a legacy Excel-based FMD into the catalog as a Draft reference. */
export function HistoricalUploadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { subprojectId: paramSubprojectId } = useParams();
  const { data: program } = useDefaultProgram();
  const { data: projects = [] } = useProjects(program?.id);
  const projectIds = useMemo(() => projects.map((r) => r.id), [projects]);
  const { data: subprojects = [] } = useSubprojects(projectIds);
  const { data: objects = [] } = useMigrationObjects();
  const [objectId, setObjectId] = useState('');
  const [subprojectId, setSubprojectId] = useState('');
  const [era, setEra] = useState('');
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);

  const effectiveSubprojectId = paramSubprojectId ?? subprojectId ?? subprojects[0]?.id;
  const targetObjects = objects.filter((o) => o.category === 'Master data').slice(0, 30);

  const upload = async () => {
    if (!objectId) { toast.error('Pick a migration object.'); return; }
    if (!effectiveSubprojectId) { toast.error('Pick a subproject.'); return; }
    setBusy(true);
    try {
      const obj = objects.find((o) => o.id === objectId);
      const { error } = await supabase.from('fmds').insert({
        subproject_id: effectiveSubprojectId, migration_object_id: objectId,
        name: sanitizeName(`Historical_FMD_${obj?.objectId ?? ''}${era ? `_${era}` : ''}`), type: 'Historical',
      });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['fmds-all'] });
      toast.success('Historical FMD added to the catalog as Draft.');
      setObjectId(''); setEra(''); setFileName('');
      onClose();
    } catch (err: any) {
      toast.error(err.message ?? 'Upload failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Upload Historical FMD" size="sm" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={upload} disabled={busy}>{busy ? 'Uploading…' : 'Upload to Catalog'}</Button>
      </>
    }>
      <p className="text-sm text-muted mb-4">Bring old Excel-based FMDs into the catalog for reference, then standardize them when ready.</p>
      <div className="flex flex-col gap-3.5">
        {!paramSubprojectId && (
          <Field label="Subproject">
            <select value={subprojectId} onChange={(e) => setSubprojectId(e.target.value)} className="w-full text-base bg-surface border border-[#d6dbe2] rounded-[8px] px-[11px] py-2 min-h-[38px]">
              <option value="">Select a subproject…</option>
              {subprojects.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Migration Object">
          <select value={objectId} onChange={(e) => setObjectId(e.target.value)} className="w-full text-base bg-surface border border-[#d6dbe2] rounded-[8px] px-[11px] py-2 min-h-[38px]">
            <option value="">Select an object…</option>
            {targetObjects.map((o) => <option key={o.id} value={o.id}>{o.description ?? o.objectId} — {o.objectId}</option>)}
          </select>
        </Field>
        <Field label="Source system / era">
          <input value={era} onChange={(e) => setEra(e.target.value)} placeholder="e.g. Legacy ECC, 2014–2019" className="w-full text-base bg-surface border border-[#d6dbe2] rounded-[8px] px-[11px] py-2 min-h-[38px]" />
        </Field>
        <label className="border-[1.5px] border-dashed border-line rounded-[10px] p-7 text-center cursor-pointer hover:border-blue-mid">
          <FileSpreadsheet size={26} className="text-muted mx-auto mb-2" />
          <p className="text-sm text-muted">{fileName || 'Drag and drop the legacy Excel file, or click to browse'}</p>
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')} />
        </label>
      </div>
    </Dialog>
  );
}
