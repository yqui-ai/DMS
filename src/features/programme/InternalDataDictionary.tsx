import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Toolbar } from '../../components/Toolbar';
import { supabase } from '../../lib/supabase';
import { Tag } from '../../components/Tag';

interface TableDef { table: string; category: string; desc: string; fields: string }

const TABLE_DEFS: TableDef[] = [
  { table: 'programs', category: 'Program', desc: 'Program header — code, name, description, start/end dates.', fields: 'id, code, name, description, start_date, end_date' },
  { table: 'projects', category: 'Program', desc: 'Projects under the programme, each holding subprojects.', fields: 'id, program_id, code, name, seq, start_date, end_date' },
  { table: 'subprojects', category: 'Program', desc: 'SubPrograms — the unit that opens the workspace; carries scope_finalized.', fields: 'id, project_id, code, name, freeze_date, scope_finalized, seq' },
  { table: 'cycles', category: 'Program', desc: 'Mock/dress-rehearsal cycles per subproject.', fields: 'id, subproject_id, name, seq, mig_start, mig_end, data_freeze' },
  { table: 'subproject_objects', category: 'Scope', desc: 'In-scope migration objects for a subproject, with approach and load sequence.', fields: 'subproject_id, migration_object_id, in_scope, approach, load_seq, owner' },
  { table: 'selection_criteria', category: 'Scope', desc: 'Row-level extraction filters (simple + complex) tied to scope objects.', fields: 'subproject_id, table_name, mode, field, condition, value, scope' },
  { table: 'fmds', category: 'Scope', desc: 'Field mapping documents, one per in-scope object.', fields: 'id, subproject_id, migration_object_id, name' },
  { table: 'fmd_versions', category: 'Scope', desc: 'FMD sheets (source/target/mapping) and governance state.', fields: 'fmd_id, version, state, sheets' },
  { table: 'rules', category: 'Rules & XREF', desc: 'Data quality rules — type, severity, status, owner, version.', fields: 'subproject_id, code, name, type, severity, status, owner, version' },
  { table: 'xref_tables', category: 'Rules & XREF', desc: 'Value mapping (XREF) tables.', fields: 'subproject_id, name, purpose, version' },
  { table: 'unmapped_values', category: 'Rules & XREF', desc: 'Legacy values with no XREF mapping yet.', fields: 'subproject_id, set_name, value, occurrences, status, suggestion' },
  { table: 'approval_matrix', category: 'Governance', desc: 'Per-area approval workflow rules.', fields: 'program_id, area, action, approval_required, approver_role_id' },
  { table: 'promotions', category: 'Governance', desc: 'Environment promotion requests.', fields: 'subproject_id, artefact_type, artefact_name, from_env, to_env, status' },
  { table: 'cutover_tasks', category: 'Governance', desc: 'Sequenced go-live checklist.', fields: 'subproject_id, seq, name, owner, status, depends_on' },
  { table: 'app_users', category: 'Admin', desc: 'Program members, mirrored from auth.users.', fields: 'id, name, email, status, last_login' },
  { table: 'roles', category: 'Admin', desc: 'Role definitions.', fields: 'id, name, description, is_standard' },
  { table: 'role_screens', category: 'Admin', desc: 'Per-role, per-screen view/edit permission matrix.', fields: 'role_id, screen_key, can_view, can_edit' },
  { table: 'ai_provider_keys', category: 'Admin', desc: 'Connected AI provider credentials for AI Usage & Billing.', fields: 'program_id, provider, label, endpoint, key_masked, budget, active' },
  { table: 'connections', category: 'Systems', desc: 'Source/Staging/Target system connections.', fields: 'program_id, sid, description, type, role, status' },
  { table: 'runs', category: 'Execution', desc: 'Job runs shown in Runs register and Job Monitor.', fields: 'subproject_id, code, migration_object_id, status, src_count, tgt_count, rej_count' },
  { table: 'source_tables', category: 'Execution', desc: 'Staging Area extraction status per table.', fields: 'subproject_id, connection_id, name, tier, status, records' },
];

function useTableCounts() {
  return useQuery({
    queryKey: ['internal-table-counts'],
    queryFn: async () => {
      const entries = await Promise.all(
        TABLE_DEFS.map(async (t) => {
          const { count } = await supabase.from(t.table).select('*', { count: 'exact', head: true });
          return [t.table, count ?? 0] as const;
        }),
      );
      return Object.fromEntries(entries);
    },
    staleTime: 60_000,
  });
}

export function InternalDataDictionary() {
  const [search, setSearch] = useState('');
  const { data: counts = {} } = useTableCounts();

  const filtered = TABLE_DEFS.filter((t) => !search || (t.table + ' ' + t.desc).toLowerCase().includes(search.toLowerCase()));
  const byCategory = new Map<string, TableDef[]>();
  for (const t of filtered) byCategory.set(t.category, [...(byCategory.get(t.category) ?? []), t]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm2 text-muted">A live data dictionary of the tables backing this app — for admins and support debugging.</p>
      <Toolbar spacing="none" search={{ value: search, onChange: setSearch, placeholder: 'Search tables…' }} count={filtered.length} noun="tables" />
      <div className="rounded-lg shadow-card overflow-hidden">
        {Array.from(byCategory.entries()).map(([category, defs]) => (
          <div key={category}>
            <div className="px-3.5 py-1.5 bg-blue-pale text-2xs font-bold uppercase tracking-[.05em] text-blue-deep">{category}</div>
            {defs.map((t) => (
              <div key={t.table} className="flex items-start gap-3 px-3.5 py-2.5 border-t border-line bg-surface">
                <Tag variant="table">{t.table}</Tag>
                <div className="flex-1 min-w-0">
                  <div className="text-sm2 text-text">{t.desc}</div>
                  <div className="text-2xs font-mono text-muted mt-0.5 truncate">{t.fields}</div>
                </div>
                <span className="text-sm2 font-bold text-muted shrink-0">{counts[t.table] ?? '—'}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
