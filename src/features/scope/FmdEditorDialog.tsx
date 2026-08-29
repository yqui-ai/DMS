import { useEffect, useState } from 'react';
import { Select } from '../../components/Select';
import { Plus, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/Button';
import { Tag } from '../../components/Tag';
import { useToast } from '../../components/Toast';
import {
  useLatestFmdVersion, useFmdVersionMutations,
  useGoldenFmdSummary, useFmdGoldenLink, useApplyGoldenTemplateMutation,
} from '../../lib/queries/fmds';
import { fmtDateTime } from '../../lib/format';
import type { Fmd, FmdVersion, GovState } from '../../types/entities';

type SheetKey = 'source' | 'target' | 'mapping';
const SHEET_COLUMNS: Record<SheetKey, string[]> = {
  source: ['field', 'desc', 'sample', 'sheet'],
  target: ['table', 'field', 'dataType'],
  mapping: ['source', 'target', 'dataType', 'rule', 'mandatory', 'defaultValue', 'dqRule', 'comments'],
};
const SHEET_LABEL: Record<SheetKey, string> = { source: 'Source', target: 'Target', mapping: 'Mapping' };
const STATE_VARIANT: Record<GovState, 'neutral' | 'warn' | 'accent' | 'danger'> = { Draft: 'neutral', 'In Review': 'warn', Approved: 'accent', Rejected: 'danger' };

export function FmdEditorDialog({ fmd, onClose }: { fmd: Fmd | null; onClose: () => void }) {
  const toast = useToast();
  const { data: version, isLoading } = useLatestFmdVersion(fmd?.id);
  const mutations = useFmdVersionMutations(fmd?.id ?? '');
  const { data: golden } = useGoldenFmdSummary();
  const { data: goldenLink } = useFmdGoldenLink(fmd?.id);
  const goldenMutations = useApplyGoldenTemplateMutation(fmd?.id ?? '');
  const [applyingGolden, setApplyingGolden] = useState(false);
  const [tab, setTab] = useState<SheetKey>('source');
  const [sheets, setSheets] = useState<FmdVersion['sheets']>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSheets(version?.sheets ?? {});
    setDirty(false);
    setTab('source');
  }, [version?.id]);

  if (!fmd) return null;

  const rows = sheets[tab] ?? [];
  const columns = SHEET_COLUMNS[tab];

  const updateCell = (rowIndex: number, col: string, value: string) => {
    setSheets((s) => ({ ...s, [tab]: rows.map((r, i) => (i === rowIndex ? { ...r, [col]: value } : r)) }));
    setDirty(true);
  };
  const addRow = () => {
    setSheets((s) => ({ ...s, [tab]: [...rows, Object.fromEntries(columns.map((c) => [c, '']))] }));
    setDirty(true);
  };
  const removeRow = (rowIndex: number) => {
    setSheets((s) => ({ ...s, [tab]: rows.filter((_, i) => i !== rowIndex) }));
    setDirty(true);
  };

  const save = async () => {
    if (!version) return;
    setSaving(true);
    try {
      await mutations.saveSheets(version.id, sheets);
      toast.success('FMD saved.');
      setDirty(false);
    } catch (err: any) {
      toast.error(err.message ?? 'Could not save FMD.');
    } finally {
      setSaving(false);
    }
  };

  const createVersion = async () => {
    try { await mutations.createInitialVersion(); }
    catch (err: any) { toast.error(err.message ?? 'Could not create a working version.'); }
  };

  const changeState = async (state: GovState) => {
    if (!version) return;
    try { await mutations.setState(version.id, state); }
    catch (err: any) { toast.error(err.message ?? 'Could not update state.'); }
  };

  const applyGoldenTemplate = async () => {
    if (!golden?.latestVersionId) return;
    setApplyingGolden(true);
    try {
      await goldenMutations.apply(golden.latestVersionId);
      toast.success(`Linked to Golden FMD ${golden.latestVersion}.`);
    } catch (err: any) {
      toast.error(err.message ?? 'Could not apply the Golden FMD template.');
    } finally {
      setApplyingGolden(false);
    }
  };

  return (
    <Dialog
      open={!!fmd} onClose={onClose} title={fmd.name} size="win"
      footer={version ? (
        <>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button variant="primary" onClick={save} disabled={!dirty || saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
        </>
      ) : undefined}
    >
      <div className="h-full flex flex-col">
        {isLoading ? (
          <p className="text-sm2 text-muted">Loading…</p>
        ) : !version ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <p className="text-sm2 text-muted">This FMD has no working version yet.</p>
            <Button variant="primary" onClick={createVersion}>Create working version</Button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-3">
              <Tag variant="table">{version.version}</Tag>
              <Select
                value={version.state} onChange={(e) => changeState(e.target.value as GovState)}
                size="sm"
              >
                <option>Draft</option><option>In Review</option><option>Approved</option><option>Rejected</option>
              </Select>
              <Tag variant={STATE_VARIANT[version.state]}>{version.state}</Tag>
              {version.approvedBy && <span className="text-2xs text-muted">Approved by {version.approvedBy} · {fmtDateTime(version.approvedAt)}</span>}
              {golden?.latestVersionId && (
                <div className="ml-auto flex items-center gap-2">
                  {goldenLink ? (
                    <>
                      <Tag variant={goldenLink === golden.latestVersionId ? 'accent' : 'warn'}>
                        {goldenLink === golden.latestVersionId ? 'Up to date' : 'Outdated'} · Golden FMD
                      </Tag>
                      {goldenLink !== golden.latestVersionId && (
                        <Button variant="ghost" onClick={applyGoldenTemplate} disabled={applyingGolden}>
                          {applyingGolden ? 'Updating…' : `Update to ${golden.latestVersion}`}
                        </Button>
                      )}
                    </>
                  ) : (
                    <Button variant="ghost" onClick={applyGoldenTemplate} disabled={applyingGolden}>
                      {applyingGolden ? 'Applying…' : 'Apply Golden Template'}
                    </Button>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 border-b border-line mb-3">
              {(Object.keys(SHEET_COLUMNS) as SheetKey[]).map((key) => (
                <button
                  key={key} onClick={() => setTab(key)}
                  className={clsx('px-3.5 py-2 text-sm2 font-semibold border-b-2 -mb-px', tab === key ? 'border-blue text-blue' : 'border-transparent text-muted hover:text-text')}
                >
                  {SHEET_LABEL[key]} <span className="text-2xs text-muted">({(sheets[key] ?? []).length})</span>
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-auto rounded-lg shadow-[inset_0_0_0_1px_var(--line)]">
              <table className="w-full border-collapse text-sm2">
                <thead>
                  <tr>
                    {columns.map((c) => (
                      <th key={c} className="text-2xs font-bold uppercase tracking-[.04em] text-muted bg-surface border-b border-line px-2.5 py-2 sticky top-0 text-left">{c}</th>
                    ))}
                    <th className="bg-surface border-b border-line sticky top-0 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className="border-t border-line">
                      {columns.map((c) => (
                        <td key={c} className="p-0">
                          <input
                            value={row[c] ?? ''} onChange={(e) => updateCell(i, c, e.target.value)}
                            className="w-full bg-transparent px-2.5 py-1.5 text-sm2 focus-visible:outline-none focus-visible:bg-blue-pale"
                          />
                        </td>
                      ))}
                      <td className="text-center">
                        <button onClick={() => removeRow(i)} className="text-red hover:bg-red-light p-1 rounded"><Trash2 size={12} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button onClick={addRow} className="text-blue text-sm2 font-semibold px-2.5 py-2 hover:bg-blue-pale w-full text-left">
                <Plus size={13} className="inline -mt-0.5" /> Add row
              </button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
