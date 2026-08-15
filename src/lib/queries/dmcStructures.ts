import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabase';
import type { DmcField, DmcStructure } from '../../types/entities';

const toStructure = (s: any): DmcStructure => ({
  id: s.id, migrationObjectId: s.migration_object_id, side: s.side, guid: s.guid, structGuid: s.struct_guid,
  ident: s.ident, description: s.description ?? undefined, seq: s.seq ?? undefined, level: s.level ?? undefined,
  parentGuid: s.parent_guid ?? undefined, ddicName: s.ddic_name ?? undefined, tabClass: s.tab_class ?? undefined,
  technical: s.technical ?? undefined,
});

const toField = (f: any): DmcField => ({
  id: f.id, structureId: f.structure_id, fieldName: f.field_name, seq: f.seq ?? undefined, keyFlag: f.key_flag,
  dataType: f.data_type ?? undefined, length: f.length ?? undefined, outputLength: f.output_length ?? undefined,
  decimals: f.decimals ?? undefined, domName: f.dom_name ?? undefined, rollName: f.roll_name ?? undefined,
  checkTable: f.check_table ?? undefined, description: f.description ?? undefined,
});

/** Sender + receiver structure tree for one migration object. */
export function useDmcStructures(migrationObjectId?: string) {
  return useQuery({
    queryKey: ['dmc-structures', migrationObjectId],
    enabled: !!migrationObjectId,
    queryFn: async (): Promise<DmcStructure[]> => {
      const { data, error } = await supabase
        .from('dmc_structures').select('*').eq('migration_object_id', migrationObjectId!)
        .order('side').order('seq');
      if (error) throw error;
      return (data ?? []).map(toStructure);
    },
  });
}

/** Field list for one structure, ordered by their DMC_FIELD-POS position. */
export function useDmcFields(structureId?: string) {
  return useQuery({
    queryKey: ['dmc-fields', structureId],
    enabled: !!structureId,
    queryFn: async (): Promise<DmcField[]> => {
      const { data, error } = await supabase.from('dmc_fields').select('*').eq('structure_id', structureId!).order('seq');
      if (error) throw error;
      return (data ?? []).map(toField);
    },
  });
}
