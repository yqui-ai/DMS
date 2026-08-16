-- v1.0.0 is always the initial default Golden XREF structure — seed it once so it exists in the
-- Cross Reference (XREF) list even if no one has opened the designer yet (same pattern as 0017).

do $$
declare new_xref_id uuid;
begin
  if exists (select 1 from xref_tables where type = 'Golden') then
    return;
  end if;

  insert into xref_tables (name, class, type) values ('Golden_Cross_Reference_Template', 'Global', 'Golden')
    returning id into new_xref_id;

  insert into xref_versions (xref_table_id, version, state, structure, comment, created_by, created_at) values (
    new_xref_id, 'v1.0.0', 'Draft',
    '{
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
    }'::jsonb,
    'Initial default structure', 'System', now()
  );
end $$;
