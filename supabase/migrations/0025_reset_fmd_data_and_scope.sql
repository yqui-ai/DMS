-- One-time data reset: clear every in-scope object assignment (subproject_objects — cascades to
-- wave_object_fmd, so no Custom FMD can dangle-reference a scope row that no longer exists) and
-- wipe every FMD (Golden/Standard/Custom/Historical), then restart the FMD display-id sequences
-- from 1 so the next rows minted are FMGLD-1 / FMDSTD-1 / etc. again. The singleton Golden FMD is
-- immediately reseeded at v1.0.0, carrying forward whatever structure is actually live right now
-- (falls back to the same default structure as 0017/0021 if no Golden FMD exists at all).
--
-- subproject_objects is deleted BEFORE fmds specifically so wave_object_fmd is already empty by
-- the time fmds/fmd_versions are dropped — wave_object_fmd.fmd_version_id has no ON DELETE clause
-- (see 0021's note), and clearing subproject_objects first avoids ever needing to touch it.

do $$
declare
  golden_fmd_structure jsonb;
  new_fmd_id uuid;
begin
  select fv.sheets->'goldenStructure' into golden_fmd_structure
    from fmd_versions fv join fmds f on f.id = fv.fmd_id
    where f.type = 'Golden'
    order by fv.created_at desc limit 1;

  delete from subproject_objects;  -- cascades to wave_object_fmd
  delete from fmds;                -- cascades to fmd_versions

  alter sequence fmds_std_seq restart with 1;
  alter sequence fmds_gld_seq restart with 1;
  alter sequence fmds_hst_seq restart with 1;
  alter sequence fmds_cst_seq restart with 1;

  insert into fmds (name, class, type) values ('Golden_Field_Mapping_Document_Template', 'Global', 'Golden')
    returning id into new_fmd_id;

  insert into fmd_versions (fmd_id, version, state, sheets, comment, created_by, created_at) values (
    new_fmd_id, 'v1.0.0', 'Draft',
    jsonb_build_object('goldenStructure', coalesce(golden_fmd_structure, '{
      "sections": [
        {
          "id": "sec-source", "name": "Source Section", "color": "blue",
          "fields": [
            {"id": "fld-src-system", "field": "SRC_SYSTEM", "description": ""},
            {"id": "fld-src-table", "field": "SRC_TABLE", "description": ""},
            {"id": "fld-src-field", "field": "SRC_FIELD", "description": ""},
            {"id": "fld-src-field-desc", "field": "SRC_FIELD_DESC", "description": ""},
            {"id": "fld-src-mandatory", "field": "SRC_FIELD_MANDATORY", "description": "Mandatory or Optional"},
            {"id": "fld-src-datatype", "field": "SRC_FIELD_DATATYPE", "description": ""},
            {"id": "fld-src-length", "field": "SRC_FIELD_LENGTH", "description": ""},
            {"id": "fld-src-decimal", "field": "SRC_FIELD_DECIMAL", "description": ""},
            {"id": "fld-src-check-table", "field": "SRC_CHECK_TABLE", "description": ""}
          ]
        },
        {
          "id": "sec-mapping", "name": "Mapping Section", "color": "amber",
          "fields": [
            {"id": "fld-mapping-type", "field": "MAPPING_TYPE", "description": "COPY, TRANSFORM, XREF, DEFAULT"},
            {"id": "fld-transformation-rule", "field": "TRANSFORMATION_RULE", "description": ""},
            {"id": "fld-technical-rule", "field": "TECHNICAL_RULE", "description": ""}
          ]
        },
        {
          "id": "sec-target", "name": "Target Section", "color": "teal",
          "fields": [
            {"id": "fld-tgt-system", "field": "TGT_SYSTEM", "description": ""},
            {"id": "fld-tgt-table", "field": "TGT_TABLE", "description": ""},
            {"id": "fld-tgt-field", "field": "TGT_FIELD", "description": ""},
            {"id": "fld-tgt-field-desc", "field": "TGT_FIELD_DESC", "description": ""},
            {"id": "fld-tgt-mandatory", "field": "TGT_FIELD_MANDATORY", "description": "Mandatory or Optional"},
            {"id": "fld-tgt-datatype", "field": "TGT_FIELD_DATATYPE", "description": ""},
            {"id": "fld-tgt-length", "field": "TGT_FIELD_LENGTH", "description": ""},
            {"id": "fld-tgt-decimal", "field": "TGT_FIELD_DECIMAL", "description": ""},
            {"id": "fld-tgt-check-table", "field": "TGT_CHECK_TABLE", "description": ""}
          ]
        },
        {
          "id": "sec-load", "name": "Load Section", "color": "red",
          "fields": [
            {"id": "fld-load-approach", "field": "LOAD_APPROACH", "description": ""},
            {"id": "fld-load-table", "field": "LOAD_TABLE", "description": ""},
            {"id": "fld-load-field", "field": "LOAD_FIELD", "description": ""}
          ]
        }
      ]
    }'::jsonb)),
    'Initial default structure', 'System', now()
  );
end $$;
