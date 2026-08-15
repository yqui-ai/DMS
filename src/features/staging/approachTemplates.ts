import type { SubprojectApproach } from '../../types/entities';

export const APPROACH_TEMPLATES: Record<SubprojectApproach, { label: string; stages: string[] }> = {
  M_ADMC: { label: 'Automated Direct — Migration Cockpit', stages: ['Select', 'Transform', 'Validate', 'Load (LTMC)', 'Reconcile'] },
  M_ADPG: { label: 'Automated Direct — Program', stages: ['Select', 'Transform', 'Enrich', 'Validate', 'Load (Program)', 'Reconcile'] },
  M_LSMW: { label: 'LSMW / Batch Input', stages: ['Select', 'Transform', 'Load (LSMW)', 'Reconcile'] },
  M_IDOC: { label: 'IDoc Inbound', stages: ['Select', 'Transform', 'Validate', 'Load (IDoc)', 'Post-process', 'Reconcile'] },
  M_DRCT: { label: 'Direct Load — no transform', stages: ['Select', 'Validate', 'Load', 'Reconcile'] },
  M_MNL: { label: 'Manual', stages: ['Select', 'Prepare Template', 'Manual Load', 'Reconcile'] },
};
