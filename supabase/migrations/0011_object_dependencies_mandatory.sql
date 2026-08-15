/* DMC_SIN_SCOBJSEQ (the real source for object_dependencies, replacing the old dmc_data.js
   fixture derivation) carries a PREDEC_MANDATORY flag per prerequisite pair — worth keeping
   since it lets the UI distinguish a blocking prerequisite from an advisory one. */

alter table object_dependencies add column mandatory boolean not null default false;
