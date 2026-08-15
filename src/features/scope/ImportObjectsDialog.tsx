import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/Button';
import { useToast } from '../../components/Toast';
import { useScopeMutations } from '../../lib/queries/scope';
import { exportTimestamp } from '../../lib/format';
import type { MigrationObject, SubprojectObject } from '../../types/entities';

/** Minimal CSV parser — handles quoted fields containing commas ("a, b"). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field || row.length) { row.push(field); if (row.some((c) => c !== '')) rows.push(row); }
  return rows;
}

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function ImportObjectsDialog({
  open, onClose, objects, subprojectObjects, subprojectId,
}: {
  open: boolean; onClose: () => void; objects: MigrationObject[]; subprojectObjects: SubprojectObject[]; subprojectId: string;
}) {
  const toast = useToast();
  const mutations = useScopeMutations(subprojectId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<{ applied: number; skipped: number } | null>(null);

  const downloadTemplate = () => {
    const byId = new Map(subprojectObjects.map((w) => [w.migrationObjectId, w]));
    const header = ['object_id', 'description', 'in_scope', 'owner'];
    const lines = [header.join(',')];
    for (const o of objects) {
      const w = byId.get(o.id);
      lines.push([o.objectId, o.description ?? '', w?.inScope ? 'TRUE' : 'FALSE', w?.owner ?? ''].map(csvCell).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `migration-object-scope-template_${exportTimestamp()}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const handleFile = async (file: File) => {
    setBusy(true);
    setSummary(null);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      const [header, ...dataRows] = rows;
      const idIdx = header.indexOf('object_id');
      const scopeIdx = header.indexOf('in_scope');
      const ownerIdx = header.indexOf('owner');
      if (idIdx === -1 || scopeIdx === -1) throw new Error('CSV must have object_id and in_scope columns.');

      const byObjectId = new Map(objects.map((o) => [o.objectId, o]));
      let applied = 0, skipped = 0;
      for (const row of dataRows) {
        const obj = byObjectId.get(row[idIdx]);
        if (!obj) { skipped++; continue; }
        const inScope = /^(true|yes|1|x)$/i.test((row[scopeIdx] ?? '').trim());
        await mutations.setInScope(obj.id, inScope);
        const owner = ownerIdx !== -1 ? row[ownerIdx]?.trim() : undefined;
        if (owner) await mutations.setOwner(obj.id, owner);
        applied++;
      }
      setSummary({ applied, skipped });
      toast.success(`Import applied to ${applied} object${applied === 1 ? '' : 's'}${skipped ? ` (${skipped} unmatched)` : ''}.`);
    } catch (err: any) {
      toast.error(err.message ?? 'Import failed.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Import object list" size="sm" footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-sm text-text mb-2">
            Download the current scope as a CSV, edit the <code className="font-mono text-xs2 bg-surface-2 px-1 py-0.5 rounded">in_scope</code> / <code className="font-mono text-xs2 bg-surface-2 px-1 py-0.5 rounded">owner</code> columns, then upload it back.
          </p>
          <Button variant="secondary" onClick={downloadTemplate}><Download size={13} /> Download template ({objects.length} objects)</Button>
        </div>
        <div>
          <Button variant="primary" onClick={() => fileRef.current?.click()} disabled={busy}>
            <Upload size={13} /> {busy ? 'Importing…' : 'Upload CSV'}
          </Button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
        </div>
        {summary && (
          <p className="text-sm text-muted">
            Applied to {summary.applied} object{summary.applied === 1 ? '' : 's'}.
            {summary.skipped > 0 && ` ${summary.skipped} row${summary.skipped === 1 ? '' : 's'} didn't match a catalogue object_id and were skipped.`}
          </p>
        )}
      </div>
    </Dialog>
  );
}
