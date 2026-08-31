/* ─────────────────────────────────────────────────────────────────────────────────────────────
   Bring the XREF the two things the FMD's viewer has that the XREF's could not show: review
   points, and lineage back to the Golden template.

   0059 gave the Golden XREF the FMD's draft/publish model. What was still missing was everything
   built ON TOP of a version: somewhere to record what a reviewer thinks of the template, and the
   pointer that lets a generated table say which template version it came from. Without the second
   one a "Where used" tab could only ever list rows and shrug — there was nothing recorded to say
   whether any of them was current.
   ───────────────────────────────────────────────────────────────────────────────────────────── */

/* ── Review points ────────────────────────────────────────────────────────────────────────────
   The XREF's fmd_field_notes (0027/0028).

   Anchored to the TABLE, never to a version — exactly as the FMD's are. A point says something
   about the template ("this column has no description", "we agreed to drop VALID_TO"), and the
   next release does not answer it. Attaching points to a version would silently discard the whole
   review the moment anyone published.

   `section_id` / `field` are nullable so a point can be about one field, one section, or the whole
   template. The FMD requires a row_key because every point there IS about a row; a template has a
   meaningful "about the document as a whole" case, and forcing a fake anchor to express it would
   put those points on an arbitrary field. */

create table xref_review_points (
  id uuid primary key default gen_random_uuid(),
  xref_table_id uuid not null references xref_tables on delete cascade,
  section_id text,
  field text,
  -- Same vocabulary as the FMD's, including the two retired values, so the shared
  -- src/lib/reviewPointCategories.ts renders both tables' rows through one map. Adding a key there
  -- without adding it here makes every insert of it fail at the database.
  tag text not null default 'remark' check (tag in ('todo', 'remark', 'question', 'issue', 'decision')),
  parent_id uuid references xref_review_points on delete cascade,
  body text not null,
  resolved boolean not null default false,
  created_by text not null,
  created_at timestamptz not null default now()
);

create index xref_review_points_table_idx on xref_review_points (xref_table_id);

alter table xref_review_points enable row level security;

/* The Library RLS shape, copied exactly: visible if the row's subproject is one of mine, OR it is
   program-wide and I have any membership. The second clause is the only reason Golden rows —
   which have no subproject — are reachable at all. */
create policy xref_review_points_all on xref_review_points for all using (
  xref_table_id in (
    select id from xref_tables
    where subproject_id in (select current_wave_ids())
       or (subproject_id is null and exists (select 1 from memberships m where m.user_id = auth.uid()))
  )
) with check (
  xref_table_id in (
    select id from xref_tables
    where subproject_id in (select current_wave_ids())
       or (subproject_id is null and exists (select 1 from memberships m where m.user_id = auth.uid()))
  )
);

/* ── Lineage back to the Golden template ──────────────────────────────────────────────────────
   The XREF's `fmds.based_on_golden_version_id` (0018).

   ON DELETE SET NULL, matching that column and for the same reason: losing the template version a
   table was built from should make the table read as "never built from Golden", not delete the
   table. 0026 records what happened when a sibling column got this wrong. */

alter table xref_tables
  add column if not exists based_on_golden_version_id uuid references xref_versions(id) on delete set null;

comment on column xref_tables.based_on_golden_version_id is
  'The Golden XREF version this table was generated from. Null means it was never built from the '
  'template — which is a real state, not missing data: every row predating this column is exactly '
  'that. Compared against the Golden''s latest published version to decide "Outdated".';
