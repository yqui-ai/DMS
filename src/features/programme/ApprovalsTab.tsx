import { useMemo } from 'react';
import { Select } from '../../components/Select';
import { useApprovalMatrix, useApprovalMutations } from '../../lib/queries/governance';
import { useRolesFull } from '../../lib/queries/roles';
import { useToast } from '../../components/Toast';
import type { RoleId } from '../../types/entities';

export function ApprovalsTab({ programId }: { programId: string }) {
  const toast = useToast();
  const { data: entries = [], isLoading } = useApprovalMatrix(programId);
  const { data: roles = [] } = useRolesFull();
  const mutations = useApprovalMutations(programId);

  const byArea = useMemo(() => {
    const m = new Map<string, typeof entries>();
    for (const e of entries) m.set(e.area, [...(m.get(e.area) ?? []), e]);
    return m;
  }, [entries]);

  const toggleRequired = async (id: string, next: boolean) => {
    try { await mutations.update(id, { approvalRequired: next }); }
    catch (err: any) { toast.error(err.message ?? 'Could not update.'); }
  };
  const changeApprover = async (id: string, roleId: RoleId) => {
    try { await mutations.update(id, { approverRoleId: roleId }); }
    catch (err: any) { toast.error(err.message ?? 'Could not update.'); }
  };

  if (isLoading) return <p className="text-sm2 text-muted py-8 text-center">Loading…</p>;
  if (entries.length === 0) return <p className="text-sm2 text-muted py-8 text-center">No approval rules configured for this programme.</p>;

  return (
    <div className="flex flex-col gap-5">
      {Array.from(byArea.entries()).map(([area, rows]) => (
        <div key={area} className="bg-surface rounded-lg shadow-card p-4">
          <div className="font-bold text-text mb-3">{area}</div>
          <table className="w-full text-sm2 border-collapse">
            <thead>
              <tr className="text-2xs font-bold uppercase tracking-[.04em] text-muted">
                <td className="py-1.5 pr-3">Action</td>
                <td className="py-1.5 pr-3">Approval required</td>
                <td className="py-1.5">Approver role</td>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="border-t border-line">
                  <td className="py-2 pr-3 capitalize">{e.action}</td>
                  <td className="py-2 pr-3">
                    <input
                      type="checkbox" checked={e.approvalRequired}
                      onChange={(ev) => toggleRequired(e.id, ev.target.checked)}
                      className="w-4 h-4 accent-[var(--blue)]"
                    />
                  </td>
                  <td className="py-2">
                    <Select
                      value={e.approverRoleId ?? ''} disabled={!e.approvalRequired}
                      onChange={(ev) => changeApprover(e.id, ev.target.value as RoleId)}
                      className="text-sm2 px-2 py-1 rounded-[8px] border border-line-strong bg-surface disabled:opacity-50"
                    >
                      <option value="">—</option>
                      {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
