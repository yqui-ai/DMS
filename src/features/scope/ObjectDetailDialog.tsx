import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Database, ShieldCheck, Shuffle, Target, Play, AlertTriangle, ArrowUpRight } from 'lucide-react';
import clsx from 'clsx';
import { Dialog } from '../../components/Dialog';
import { Tag } from '../../components/Tag';
import { Button } from '../../components/Button';
import { useWaveObjects } from '../../lib/queries/scope';
import { useAllRules } from '../../lib/queries/rules';
import { useAllFmds } from '../../lib/queries/fmds';
import { useRuns } from '../../lib/queries/runs';
import { useFallout } from '../../lib/queries/quality';
import { fmtDateTime } from '../../lib/format';
import { FmdEditorDialog } from './FmdEditorDialog';
import type { Fmd, MigrationObject } from '../../types/entities';

type Tab = 'overview' | 'lineage' | 'fmd' | 'rules' | 'env';
const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' }, { key: 'lineage', label: 'Lineage' }, { key: 'fmd', label: 'Field Mapping' },
  { key: 'rules', label: 'Rules' }, { key: 'env', label: 'Environments' },
];

export function ObjectDetailDialog({ object, onClose }: { object: MigrationObject | null; onClose: () => void }) {
  const { waveId } = useParams();
  const [tab, setTab] = useState<Tab>('overview');
  const [openFmd, setOpenFmd] = useState<Fmd | null>(null);
  const { data: waveObjects = [] } = useWaveObjects(waveId);
  const { data: allRules = [] } = useAllRules();
  const { data: allFmds = [] } = useAllFmds();
  const { data: runs = [] } = useRuns(waveId);

  const waveObj = object ? waveObjects.find((w) => w.migrationObjectId === object.id) : undefined;
  const objRules = object ? allRules.filter((r) => r.migrationObjectId === object.id) : [];
  const activeRules = objRules.filter((r) => r.status === 'Approved');
  const fmd = object ? allFmds.find((f) => f.migrationObjectId === object.id) : undefined;
  const objRuns = object ? runs.filter((r) => r.migrationObjectId === object.id).sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? '')) : [];
  const lastRun = objRuns[0];
  const { data: fallout = [] } = useFallout(waveId);
  const openFalloutCount = lastRun ? fallout.filter((f) => f.runId === lastRun.id).length : 0;

  return (
    <>
      <Dialog open={!!object} onClose={onClose} title={object?.description ?? object?.objectId ?? ''} size="lg">
        {object && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Tag variant="table">{object.objectId}</Tag>
              {object.component && <Tag variant="connection">{object.component}</Tag>}
              {waveObj?.inScope && <Tag variant="accent">In Scope</Tag>}
            </div>

            <div className="flex items-center gap-1 border-b border-line">
              {TABS.map((t) => (
                <button
                  key={t.key} onClick={() => setTab(t.key)}
                  className={clsx('px-3.5 py-2 text-sm font-semibold border-b-2 -mb-px', tab === t.key ? 'border-blue text-blue' : 'border-transparent text-muted hover:text-text')}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'overview' && (
              <div className="grid grid-cols-2 gap-3">
                <SummaryField label="In scope">{waveObj?.inScope ? 'Yes' : 'No'}</SummaryField>
                <SummaryField label="Approach">{waveObj?.approach ?? '—'}</SummaryField>
                <SummaryField label="Data owner">{waveObj?.owner ?? '—'}</SummaryField>
                <SummaryField label="FMD status">{fmd ? 'Assigned' : 'Not created'}</SummaryField>
                <SummaryField label="Category">{object.category ?? '—'}</SummaryField>
                <SummaryField label="Technical name"><span className="font-mono">{object.technicalName ?? '—'}</span></SummaryField>
              </div>
            )}

            {tab === 'lineage' && (
              <div className="flex flex-col gap-2">
                <LineageStep icon={<Database size={15} />} label="Source" value={object.objectId} detail="Migration object" />
                <LineageStep icon={<ShieldCheck size={15} />} label="Transform Rules" value={`${objRules.length} rules`} detail={`${activeRules.length} approved`} />
                <LineageStep icon={<Shuffle size={15} />} label="Field Mapping (FMD)" value={fmd ? fmd.name : 'Not created'} detail="Source → target mapping" />
                <LineageStep icon={<Target size={15} />} label="Target" value={object.technicalName ?? 'Not mapped'} detail="SAP target structure" />
                <LineageStep icon={<Play size={15} />} label="Load Run" value={lastRun?.status ?? 'Not Started'} detail={`Last run ${fmtDateTime(lastRun?.startedAt)}`} />
                <LineageStep icon={<AlertTriangle size={15} />} label="Errors" value={`${openFalloutCount} open`} detail={openFalloutCount ? 'Needs data-owner action' : 'No open fallout'} last />
              </div>
            )}

            {tab === 'fmd' && (
              <div className="flex flex-col items-start gap-3">
                {fmd ? (
                  <>
                    <p className="text-sm text-muted">This object's field mapping document.</p>
                    <Button variant="primary" onClick={() => setOpenFmd(fmd)}>Open {fmd.name}</Button>
                  </>
                ) : (
                  <p className="text-sm text-muted">No FMD created yet for this object — create one from Scope → FMD Mapping.</p>
                )}
              </div>
            )}

            {tab === 'rules' && (
              <div className="flex flex-col gap-1.5">
                {objRules.length === 0 && <p className="text-sm text-muted">No rules target this object.</p>}
                {objRules.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 px-3 py-2 rounded-[8px] bg-surface-2 text-sm">
                    <span className="font-mono font-bold">{r.code}</span>
                    <span className="flex-1">{r.name}</span>
                    <Tag variant={r.status === 'Approved' ? 'accent' : 'neutral'}>{r.status}</Tag>
                  </div>
                ))}
              </div>
            )}

            {tab === 'env' && (
              <div className="flex flex-col gap-1.5">
                {(['Scope', 'Field Mapping', 'Rules', 'Value Mapping'] as const).map((artifact) => (
                  <div key={artifact} className="flex items-center gap-3 px-3 py-2 rounded-[8px] bg-surface-2 text-sm">
                    <span className="flex-1 font-semibold">{artifact}</span>
                    <span className="text-muted text-xs2 w-16">DEV</span>
                    <span className="text-muted text-xs2 w-16">QSA</span>
                    <span className="text-muted text-xs2 w-16">PRD</span>
                    <Button variant="ghost"><ArrowUpRight size={12} /> Promote</Button>
                  </div>
                ))}
                <p className="text-2xs text-muted mt-1">Per-environment version drift isn't tracked per artifact yet — use Promotions for the real request history.</p>
              </div>
            )}
          </div>
        )}
      </Dialog>
      <FmdEditorDialog fmd={openFmd} onClose={() => setOpenFmd(null)} />
    </>
  );
}

function SummaryField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-2xs font-semibold uppercase tracking-[.04em] text-muted mb-0.5">{label}</div>
      <div className="text-sm text-text">{children}</div>
    </div>
  );
}

function LineageStep({ icon, label, value, detail, last }: { icon: React.ReactNode; label: string; value: string; detail: string; last?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-[9px] bg-blue-light text-blue grid place-items-center shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-2xs font-semibold uppercase tracking-[.04em] text-muted">{label}</div>
        <div className="text-sm font-semibold text-text truncate">{value}</div>
        <div className="text-2xs text-muted truncate">{detail}</div>
      </div>
      {!last && <div className="w-px h-6 bg-line shrink-0" />}
    </div>
  );
}
