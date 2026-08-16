-- One-time data reset: wipe every FMD (Golden/Standard/Custom/Historical) and every XREF table, then
-- restart their display-id sequences from 1 so the next rows minted are FMGLD-1 / FMDSTD-1 / etc.
-- again. The singleton Golden FMD and Golden XREF are immediately reseeded at v1.0.0, carrying
-- forward whatever structure was actually live for each at the moment this migration runs (falls
-- back to the original default structure — same as 0017/0020 — if neither was ever created).

do $$
declare
  golden_fmd_structure jsonb;
  golden_xref_structure jsonb;
  new_fmd_id uuid;
  new_xref_id uuid;
begin
  select fv.sheets->'goldenStructure' into golden_fmd_structure
    from fmd_versions fv join fmds f on f.id = fv.fmd_id
    where f.type = 'Golden'
    order by fv.created_at desc limit 1;

  select xv.structure into golden_xref_structure
    from xref_versions xv join xref_tables x on x.id = xv.xref_table_id
    where x.type = 'Golden'
    order by xv.created_at desc limit 1;

  -- wave_object_fmd.fmd_version_id has no ON DELETE clause — clear it first or the cascade below fails.
  update wave_object_fmd set fmd_version_id = null where fmd_version_id is not null;

  delete from fmds;         -- cascades to fmd_versions
  delete from xref_tables;  -- cascades to xref_versions and xref_rows

  alter sequence fmds_std_seq restart with 1;
  alter sequence fmds_gld_seq restart with 1;
  alter sequence fmds_hst_seq restart with 1;
  alter sequence fmds_cst_seq restart with 1;
  alter sequence xref_gbl_seq restart with 1;
  alter sequence xref_lcl_seq restart with 1;
  alter sequence xref_gld_seq restart with 1;

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
    }'::jsonb)),
    'Initial default structure', 'System', now()
  );

  insert into xref_tables (name, class, type) values ('Golden_Cross_Reference_Template', 'Global', 'Golden')
    returning id into new_xref_id;

  insert into xref_versions (xref_table_id, version, state, structure, comment, created_by, created_at) values (
    new_xref_id, 'v1.0.0', 'Draft',
    coalesce(golden_xref_structure, '{
      "sections": [
        {
          "id": "sec-general", "name": "General Section", "color": "blue",
          "fields": [
            {"id": "fld-xref-name", "field": "XREF_NAME", "description": ""},
            {"id": "fld-xref-desc", "field": "XREF_DESCRIPTION", "description": ""}
          ]
        },
        {
          "id": "sec-field1", "name": "Field 1 Section", "color": "amber",
          "fields": [
            {"id": "fld-legacy-fieldname1", "field": "LEGACY_FIELDNAME1", "description": ""},
            {"id": "fld-legacy-fieldname1-desc", "field": "LEGACY_FIELDNAME1_DESCRIPTION", "description": ""},
            {"id": "fld-legacy-value1", "field": "LEGACY_VALUE1", "description": ""},
            {"id": "fld-legacy-value1-desc", "field": "LEGACY_VALUE1_DESCRIPTION", "description": ""},
            {"id": "fld-new-fieldname1", "field": "NEW_FIELDNAME1", "description": ""},
            {"id": "fld-new-fieldname1-desc", "field": "NEW_FIELDNAME1_DESCRIPTION", "description": ""},
            {"id": "fld-new-fieldvalue1", "field": "NEW_FIELDVALUE1", "description": ""},
            {"id": "fld-new-fieldvalue1-desc", "field": "NEW_FIELDVALUE1_DESCRIPTION", "description": ""}
          ]
        },
        {
          "id": "sec-field2", "name": "Field 2 Section", "color": "teal",
          "fields": [
            {"id": "fld-legacy-fieldname2", "field": "LEGACY_FIELDNAME2", "description": ""},
            {"id": "fld-legacy-fieldname2-desc", "field": "LEGACY_FIELDNAME2_DESCRIPTION", "description": ""},
            {"id": "fld-legacy-value2", "field": "LEGACY_VALUE2", "description": ""},
            {"id": "fld-legacy-value2-desc", "field": "LEGACY_VALUE2_DESCRIPTION", "description": ""},
            {"id": "fld-new-fieldname2", "field": "NEW_FIELDNAME2", "description": ""},
            {"id": "fld-new-fieldname2-desc", "field": "NEW_FIELDNAME2_DESCRIPTION", "description": ""},
            {"id": "fld-new-fieldvalue2", "field": "NEW_FIELDVALUE2", "description": ""},
            {"id": "fld-new-fieldvalue2-desc", "field": "NEW_FIELDVALUE2_DESCRIPTION", "description": ""}
          ]
        },
        {
          "id": "sec-field3", "name": "Field 3 Section", "color": "red",
          "fields": [
            {"id": "fld-legacy-fieldname3", "field": "LEGACY_FIELDNAME3", "description": ""},
            {"id": "fld-legacy-fieldname3-desc", "field": "LEGACY_FIELDNAME3_DESCRIPTION", "description": ""},
            {"id": "fld-legacy-value3", "field": "LEGACY_VALUE3", "description": ""},
            {"id": "fld-legacy-value3-desc", "field": "LEGACY_VALUE3_DESCRIPTION", "description": ""},
            {"id": "fld-new-fieldname3", "field": "NEW_FIELDNAME3", "description": ""},
            {"id": "fld-new-fieldname3-desc", "field": "NEW_FIELDNAME3_DESCRIPTION", "description": ""},
            {"id": "fld-new-fieldvalue3", "field": "NEW_FIELDVALUE3", "description": ""},
            {"id": "fld-new-fieldvalue3-desc", "field": "NEW_FIELDVALUE3_DESCRIPTION", "description": ""}
          ]
        },
        {
          "id": "sec-field4", "name": "Field 4 Section", "color": "violet",
          "fields": [
            {"id": "fld-legacy-fieldname4", "field": "LEGACY_FIELDNAME4", "description": ""},
            {"id": "fld-legacy-fieldname4-desc", "field": "LEGACY_FIELDNAME4_DESCRIPTION", "description": ""},
            {"id": "fld-legacy-value4", "field": "LEGACY_VALUE4", "description": ""},
            {"id": "fld-legacy-value4-desc", "field": "LEGACY_VALUE4_DESCRIPTION", "description": ""},
            {"id": "fld-new-fieldname4", "field": "NEW_FIELDNAME4", "description": ""},
            {"id": "fld-new-fieldname4-desc", "field": "NEW_FIELDNAME4_DESCRIPTION", "description": ""},
            {"id": "fld-new-fieldvalue4", "field": "NEW_FIELDVALUE4", "description": ""},
            {"id": "fld-new-fieldvalue4-desc", "field": "NEW_FIELDVALUE4_DESCRIPTION", "description": ""}
          ]
        }
      ]
    }'::jsonb),
    'Initial default structure', 'System', now()
  );
end $$;
