import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Search, ShieldAlert, LockOpen, FileUp, ListPlus } from 'lucide-react';
import { Table, type Column } from '../../components/Table';
import { Tag } from '../../components/Tag';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Kpi } from '../../components/Kpi';
import { useToast } from '../../components/Toast';
import { useMigrationObjects, useWaveObjects, useMissingPrerequisites, useScopeMutations } from '../../lib/queries/scope';
import { useWave } from '../../lib/queries/programme';
import { useCurrentRole } from '../../lib/queries/memberships';
import { ImportObjectsDialog } from './ImportObjectsDialog';
import { SelectStandardDialog } from './SelectStandardDialog';
import { ObjectDetailDialog } from './ObjectDetailDialog';
import type { MigrationObject } from '../../types/entities';

const CATEGORY_VARIANT = { 'Master data': 'accent', 'Transactional data': 'warn' } as const;
const CAN_FINALIZE_ROLES = new Set(['program_admin', 'data_owner', 'data_governance_lead']);

interface Row {
  obj: MigrationObject;
  inScope: boolean;
  owner: string;
}

export function MigrationObjectCatalogue() {
  const { projectId, waveId } = useParams();
  const toast = useToast();
  const { data: objects = [], isLoading } = useMigrationObjects();
  const { data: waveObjects = [] } = useWaveObjects(waveId);
  const { data: wave } = useWave(waveId);
  const { data: role = 'guest' } = useCurrentRole(projectId, waveId);
  const { data: missingPrereqs = [] } = useMissingPrerequisites(waveId);
  const mutations = useScopeMutations(waveId!);

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [approach, setApproach] = useState('All');
  const [component, setComponent] = useState('All');
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selectStandardOpen, setSelectStandardOpen] = useState(false);
  const [detailObject, setDetailObject] = useState<MigrationObject | null>(null);

  const waveObjByMoId = useMemo(() => new Map(waveObjects.map((w) => [w.migrationObjectId, w])), [waveObjects]);

  const isString = <T extends string>(v: T | undefined): v is T => Boolean(v);
  const categories = useMemo(() => ['All', ...Array.from(new Set(objects.map((o) => o.category).filter(isString)))], [objects]);
  const approaches = useMemo(() => ['All', ...Array.from(new Set(objects.map((o) => o.approach).filter(isString)))], [objects]);
  const components = useMemo(() => ['All', ...Array.from(new Set(objects.map((o) => o.component).filter(isString)))].sort(), [objects]);

  const rows: Row[] = useMemo(
    () => objects.map((obj) => ({ obj, inScope: waveObjByMoId.get(obj.id)?.inScope ?? false, owner: waveObjByMoId.get(obj.id)?.owner ?? '' })),
    [objects, waveObjByMoId],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (category !== 'All' && r.obj.category !== category) return false;
      if (approach !== 'All' && r.obj.approach !== approach) return false;
      if (component !== 'All' && r.obj.component !== component) return false;
      if (!q) return true;
      return (
        r.obj.objectId.toLowerCase().includes(q) ||
        (r.obj.technicalName ?? '').toLowerCase().includes(q) ||
        (r.obj.description ?? '').toLowerCase().includes(q)
      );
    });
  }, [rows, query, category, approach, component]);

  const inScopeCount = rows.filter((r) => r.inScope).length;
  const canEdit = CAN_FINALIZE_ROLES.has(role);
  const scopeFinalized = wave?.scopeFinalized ?? false;

  const toggleScope = async (row: Row) => {
    try {
      await mutations.setInScope(row.obj.id, !row.inScope);
    } catch (err: any) {
      toast.error(err.message ?? 'Could not update scope.');
    }
  };

  const saveOwner = async (row: Row, owner: string) => {
    if (owner === row.owner) return;
    try {
      await mutations.setOwner(row.obj.id, owner);
    } catch (err: any) {
      toast.error(err.message ?? 'Could not update owner.');
    }
  };

  const finalize = async () => {
    try {
      await mutations.setScopeFinalized(!scopeFinalized);
      toast.success(scopeFinalized ? 'Scope reopened.' : 'Scope finalized — execution and governance are now unlocked.');
      setFinalizeOpen(false);
    } catch (err: any) {
      toast.error(err.message ?? 'Could not update scope status.');
    }
  };

  const columns: Column<Row>[] = [
    { key: 'objectId', header: 'Object ID', render: (r) => <Tag variant="table">{r.obj.objectId}</Tag>, width: 190 },
    { key: 'technicalName', header: 'Technical Name', render: (r) => <span className="font-mono text-sm2">{r.obj.technicalName ?? '—'}</span> },
    { key: 'description', header: 'Description', render: (r) => <span className="truncate block max-w-[320px]">{r.obj.description ?? '—'}</span> },
    {
      key: 'category', header: 'Category',
      render: (r) => r.obj.category ? <Tag variant={CATEGORY_VARIANT[r.obj.category as keyof typeof CATEGORY_VARIANT] ?? 'neutral'}>{r.obj.category}</Tag> : '—',
    },
    { key: 'approach', header: 'Approach', render: (r) => r.obj.approach ? <Tag variant="neutral">{r.obj.approach}</Tag> : '—' },
    { key: 'component', header: 'Component', render: (r) => r.obj.component ? <Tag variant="connection">{r.obj.component}</Tag> : '—' },
    {
      key: 'inScope', header: 'In Scope',
      render: (r) => (
        <input
          type="checkbox" checked={r.inScope} disabled={!canEdit || scopeFinalized}
          onClick={(e) => e.stopPropagation()}
          onChange={() => toggleScope(r)} className="w-4 h-4 accent-[var(--blue)]"
        />
      ),
    },
    {
      key: 'owner', header: 'Owner',
      render: (r) => (
        <input
          defaultValue={r.owner} disabled={!canEdit || scopeFinalized} placeholder="—"
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => saveOwner(r, e.target.value)}
          className="text-sm2 bg-transparent border-0 border-b border-transparent hover:border-line focus-visible:border-blue-mid focus-visible:outline-none w-24"
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-6">
        <Kpi label="Objects in scope" value={inScopeCount} accent="blue" />
        <Kpi label="Catalogue size" value={objects.length} />
        <Kpi label="Missing prerequisites" value={missingPrereqs.length} accent={missingPrereqs.length ? 'amber' : 'muted'} />
        <div className="ml-auto flex items-center gap-2">
          {scopeFinalized && <Tag variant="accent">Scope finalized</Tag>}
          {canEdit && !scopeFinalized && (
            <>
              <Button variant="secondary" onClick={() => setImportOpen(true)}><FileUp size={14} /> Import</Button>
              <Button variant="secondary" onClick={() => setSelectStandardOpen(true)}><ListPlus size={14} /> Select objects</Button>
            </>
          )}
          {canEdit && (
            <Button variant={scopeFinalized ? 'secondary' : 'primary'} onClick={() => setFinalizeOpen(true)}>
              {scopeFinalized ? <><LockOpen size={14} /> Reopen scope</> : 'Finalize scope'}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search object id, name, description…"
            className="text-sm pl-8 pr-3 py-1.5 rounded-[8px] border border-[#d6dbe2] bg-surface min-w-[260px]"
          />
        </div>
        <FilterSelect label="Category" value={category} options={categories} onChange={setCategory} />
        <FilterSelect label="Approach" value={approach} options={approaches} onChange={setApproach} />
        <FilterSelect label="Component" value={component} options={components} onChange={setComponent} />
        <span className="text-sm text-muted ml-1">{filtered.length.toLocaleString()} objects</span>
      </div>

      <Table
        columns={columns}
        rows={filtered}
        rowKey={(r) => r.obj.id}
        onRowClick={(r) => setDetailObject(r.obj)}
        pageSize={30}
        emptyMessage={isLoading ? 'Loading catalogue…' : 'No objects match these filters.'}
      />

      <Dialog
        open={finalizeOpen}
        onClose={() => setFinalizeOpen(false)}
        title={scopeFinalized ? 'Reopen scope' : 'Finalize scope'}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFinalizeOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={finalize}>{scopeFinalized ? 'Reopen' : 'Finalize'}</Button>
          </>
        }
      >
        {scopeFinalized ? (
          <p className="text-sm text-text">
            Reopening lets the scope be edited again, but hides Data Migration, Data Quality, Cutover and Governance
            navigation until it's finalized again.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-text">
              Finalizing locks the {inScopeCount}-object scope and unlocks Data Migration, Data Quality, Cutover and
              Governance navigation for this wave.
            </p>
            {missingPrereqs.length > 0 && (
              <div className="flex gap-2 bg-amber-bg text-amber-ink rounded-[8px] p-3 text-sm">
                <ShieldAlert size={16} className="shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold mb-1">{missingPrereqs.length} unresolved prerequisite{missingPrereqs.length === 1 ? '' : 's'}</div>
                  <ul className="space-y-0.5 max-h-32 overflow-auto">
                    {missingPrereqs.slice(0, 20).map((m, i) => (
                      <li key={i} className="font-mono text-xs">{m.object} requires {m.requires}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}
      </Dialog>

      <ImportObjectsDialog open={importOpen} onClose={() => setImportOpen(false)} objects={objects} waveObjects={waveObjects} waveId={waveId!} />
      <SelectStandardDialog open={selectStandardOpen} onClose={() => setSelectStandardOpen(false)} objects={objects} waveObjects={waveObjects} waveId={waveId!} />
      <ObjectDetailDialog object={detailObject} onClose={() => setDetailObject(null)} />
    </div>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <select
      aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}
      className="text-sm px-2.5 py-1.5 rounded-[8px] border border-[#d6dbe2] bg-surface"
    >
      {options.map((o) => <option key={o} value={o}>{o === 'All' ? `${label}: All` : o}</option>)}
    </select>
  );
}
