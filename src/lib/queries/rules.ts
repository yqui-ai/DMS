import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import type { GovState, Rule, XrefRow, XrefTable } from '../../types/entities';

const toRule = (r: any): Rule => ({
  id: r.id, waveId: r.wave_id, code: r.code, name: r.name, migrationObjectId: r.migration_object_id ?? undefined,
  type: r.type, severity: r.severity, status: r.status, expression: r.expression ?? undefined,
  owner: r.owner ?? undefined, version: r.version ?? undefined,
});

export function useRules(waveId?: string) {
  return useQuery({
    queryKey: ['rules', waveId],
    enabled: !!waveId,
    queryFn: async (): Promise<Rule[]> => {
      const { data, error } = await supabase.from('rules').select('*').eq('wave_id', waveId!).order('code');
      if (error) throw error;
      return (data ?? []).map(toRule);
    },
  });
}

/** Rules across every wave the user can access — used by the programme-wide Library > Rules catalogue. */
export function useAllRules() {
  return useQuery({
    queryKey: ['rules-all'],
    queryFn: async (): Promise<Rule[]> => {
      const { data, error } = await supabase.from('rules').select('*').order('code');
      if (error) throw error;
      return (data ?? []).map(toRule);
    },
  });
}

export function useRuleMutations(waveId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['rules', waveId] });
  return {
    async setStatus(id: string, status: GovState) {
      const { error } = await supabase.from('rules').update({ status }).eq('id', id);
      if (error) throw error;
      await invalidate();
    },
  };
}

export function useXrefTables(waveId?: string) {
  return useQuery({
    queryKey: ['xref-tables', waveId],
    enabled: !!waveId,
    queryFn: async (): Promise<XrefTable[]> => {
      const { data, error } = await supabase.from('xref_tables').select('*').eq('wave_id', waveId!).order('name');
      if (error) throw error;
      return (data ?? []).map((x) => ({ id: x.id, waveId: x.wave_id, name: x.name, purpose: x.purpose ?? undefined, version: x.version ?? undefined }));
    },
  });
}

export function useXrefRows(xrefTableId?: string) {
  return useQuery({
    queryKey: ['xref-rows', xrefTableId],
    enabled: !!xrefTableId,
    queryFn: async (): Promise<XrefRow[]> => {
      const { data, error } = await supabase.from('xref_rows').select('*').eq('xref_table_id', xrefTableId!);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id, xrefTableId: r.xref_table_id, legacyValue: r.legacy_value ?? undefined,
        s4Value: r.s4_value ?? undefined, validFrom: r.valid_from ?? undefined, status: r.status,
      }));
    },
  });
}

export function useXrefRowMutations(xrefTableId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['xref-rows', xrefTableId] });
  return {
    async update(id: string, patch: { legacyValue?: string; s4Value?: string; status?: 'Active' | 'Retired' }) {
      const payload: Record<string, unknown> = {};
      if (patch.legacyValue !== undefined) payload.legacy_value = patch.legacyValue;
      if (patch.s4Value !== undefined) payload.s4_value = patch.s4Value;
      if (patch.status !== undefined) payload.status = patch.status;
      const { error } = await supabase.from('xref_rows').update(payload).eq('id', id);
      if (error) throw error;
      await invalidate();
    },
    async add(row: { legacyValue: string; s4Value: string }) {
      const { error } = await supabase.from('xref_rows').insert({ xref_table_id: xrefTableId, legacy_value: row.legacyValue, s4_value: row.s4Value, status: 'Active' });
      if (error) throw error;
      await invalidate();
    },
  };
}
