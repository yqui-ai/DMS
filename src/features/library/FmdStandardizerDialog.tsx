import { useState } from 'react';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { Tag } from '../../components/Tag';
import { useToast } from '../../components/Toast';
import { useAllFmds, useLatestFmdVersion, useFmdVersionMutations } from '../../lib/queries/fmds';

/** Standardizes a historical/custom FMD's source columns into the standard mapping template.
 * Suggestions are a naive title-cased guess, matching this tool's non-AI, prototype-mocked behavior. */
function suggestTarget(field: string): string {
  return field.split(/[_\s]+/).map((w) => w[0]?.toUpperCase() + w.slice(1).toLowerCase()).join('');
}

export function FmdStandardizerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const { data: fmds = [] } = useAllFmds();
  const [fmdId, setFmdId] = useState('');
  const { data: version } = useLatestFmdVersion(fmdId || undefined);
  const mutations = useFmdVersionMutations(fmdId);

  const sourceRows = version?.sheets.source ?? [];
  const suggestions = sourceRows.map((r) => ({ target: suggestTarget(String(r.field ?? '')), source: String(r.field ?? '') }));

  const save = async () => {
    if (!version) return;
    try {
      const mapping = suggestions.map((sg) => ({ source: sg.source, target: `STANDARD.${sg.target}`, dataType: '', rule: 'Direct copy', mandatory: 'No', defaultValue: '', dqRule: '', comments: 'Auto-suggested by FMD Standardizer' }));
      await mutations.saveSheets(version.id, { ...version.sheets, mapping });
      toast.success('Saved as standard FMD.');
      onClose();
    } catch (err: any) {
      toast.error(err.message ?? 'Could not save.');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="FMD Standardizer" size="lg" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={save} disabled={!version}>Save as Standard FMD</Button>
      </>
    }>
      <p className="text-sm text-muted mb-4">Convert a historical or custom FMD into the standard field mapping template.</p>
      <Field label="Source FMD">
        <select value={fmdId} onChange={(e) => setFmdId(e.target.value)} className="w-full text-base bg-surface border border-[#d6dbe2] rounded-[8px] px-[11px] py-2 min-h-[38px] mb-4">
          <option value="">Select an FMD…</option>
          {fmds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </Field>

      {fmdId && (
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg shadow-[inset_0_0_0_1px_var(--line)] overflow-hidden">
            <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-line">
              <span className="font-bold text-sm2">Source Columns (as-is)</span><Tag variant="neutral">unmapped</Tag>
            </div>
            <div className="max-h-[380px] overflow-auto">
              <table className="w-full text-xs2">
                <thead><tr className="text-muted"><td className="px-3 py-1.5">Column</td><td className="px-3 py-1.5">Sample</td></tr></thead>
                <tbody>
                  {sourceRows.map((r, i) => (
                    <tr key={i} className="border-t border-line"><td className="px-3 py-1.5 font-semibold">{r.field}</td><td className="px-3 py-1.5 text-muted">{r.sample}</td></tr>
                  ))}
                  {sourceRows.length === 0 && <tr><td colSpan={2} className="px-3 py-4 text-center text-muted">No source columns on this FMD yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          <div className="rounded-lg shadow-[inset_0_0_0_1px_var(--line)] overflow-hidden">
            <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-line">
              <span className="font-bold text-sm2">Standard Template Fields</span><Tag variant="accent">auto-suggested</Tag>
            </div>
            <div className="max-h-[380px] overflow-auto">
              <table className="w-full text-xs2">
                <thead><tr className="text-muted"><td className="px-3 py-1.5">Standard Field</td><td className="px-3 py-1.5">Suggested Source</td></tr></thead>
                <tbody>
                  {suggestions.map((sg, i) => (
                    <tr key={i} className="border-t border-line"><td className="px-3 py-1.5 font-semibold">{sg.target}</td><td className="px-3 py-1.5 text-muted">{sg.source}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}
