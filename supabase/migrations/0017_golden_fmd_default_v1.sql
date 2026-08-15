-- v1.0.0 is always the initial default Golden FMD structure — seed it once so FMDGLD-1 exists in
-- the Field Mapping list even if no one has opened the designer yet. Guarded so it's a no-op if a
-- Golden FMD already exists (from an earlier session or a re-run of this migration).

do $$
declare new_fmd_id uuid;
begin
  if exists (select 1 from fmds where type = 'Golden') then
    return;
  end if;

  insert into fmds (name, class, type) values ('Golden_Field_Mapping_Document_Template', 'Global', 'Golden')
    returning id into new_fmd_id;

  insert into fmd_versions (fmd_id, version, state, sheets, comment, created_by, created_at) values (
    new_fmd_id, 'v1.0.0', 'Draft',
    '{
      "goldenStructure": {
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
              {"id": "fld-mapping-type", "field": "MAPPING_TYPE", "description": "Copy, Default, Transform, XREF"},
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
      }
    }'::jsonb,
    'Initial default structure', 'System', now()
  );
end $$;
