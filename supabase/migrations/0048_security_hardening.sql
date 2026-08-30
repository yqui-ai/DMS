/* ─────────────────────────────────────────────────────────────────────────────────────────────
   Security hardening: close two holes found in a full-codebase review.

   1. `promotion_approvals` and `wave_object_fmd` have no RLS at all. Both were created in
      0001_init.sql and neither appears in 0002_rls.sql's `foreach t in array [...]` loops, so
      they were the only two tables in `public` that RLS never reached. PostgREST exposes every
      table in `public`, and `authenticated` holds the default grants — so any signed-in user
      could read and write every row in them, across every programme. Neither table is referenced
      anywhere in `src/`, which is exactly why this went unnoticed: nothing in the app ever
      touched them, so nothing ever looked wrong.

   2. Publishing an FMD version was gated in the client only. `canPublish()` (src/lib/rbac.ts)
      hides the button unless you are the object's consultant or hold a governance role, but
      `fmd_versions`'s policy is plain subproject membership — so any member could publish any
      version by calling PostgREST directly. The UI check stays (it is what makes the rule
      legible); this makes it true.
   ───────────────────────────────────────────────────────────────────────────────────────────── */

/* ── 1. RLS for the two tables 0002 never covered ──────────────────────────────────────────────

   Guarded with `to_regclass` so this migration is safe whether or not the tables still exist —
   they are vestigial (the app moved to `subproject_objects` + `fmds.subproject_id`), and dropping
   them is a separate decision. Securing them does not depend on making it.

   Each scopes through its parent exactly as the parent scopes itself, so a row is visible on the
   same terms as the promotion / scope row it belongs to — no new grant of visibility, just the
   one that was missing. */

do $$
begin
  if to_regclass('public.promotion_approvals') is not null then
    execute 'alter table promotion_approvals enable row level security';
    execute 'drop policy if exists promotion_approvals_all on promotion_approvals';
    execute $p$
      create policy promotion_approvals_all on promotion_approvals for all
        using (promotion_id in (
          select id from promotions where subproject_id in (select current_wave_ids())
        ))
        with check (promotion_id in (
          select id from promotions where subproject_id in (select current_wave_ids())
        ))
    $p$;
  end if;

  if to_regclass('public.wave_object_fmd') is not null then
    execute 'alter table wave_object_fmd enable row level security';
    execute 'drop policy if exists wave_object_fmd_all on wave_object_fmd';
    -- `wave_objects` was renamed to `subproject_objects` in 0008; the FK followed the rename, the
    -- column name on this side did not.
    execute $p$
      create policy wave_object_fmd_all on wave_object_fmd for all
        using (wave_object_id in (
          select id from subproject_objects where subproject_id in (select current_wave_ids())
        ))
        with check (wave_object_id in (
          select id from subproject_objects where subproject_id in (select current_wave_ids())
        ))
    $p$;
  end if;
end $$;

/* ── 2. Server-side publish authorisation ─────────────────────────────────────────────────────

   Mirrors `canPublish(role, isOwner)` in src/lib/rbac.ts. Keep the two in step: the client one
   decides whether the button is offered, this one decides whether the write lands.

   SECURITY DEFINER because it reads `app_users` and `memberships`, which the caller cannot select
   directly — and it authorises the caller itself, from `auth.uid()`, rather than trusting anything
   passed in. */

create or replace function dms_may_publish_fmd(p_fmd_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select
    /* The consultant on the migration object this FMD documents, in the subproject the FMD
       belongs to. `subproject_objects.consultant` holds an email (0034 renamed it from `owner`),
       which is what the client compares against `user.email`. */
    exists (
      select 1
      from fmds f
      join subproject_objects so
        on so.migration_object_id = f.migration_object_id
       and (f.subproject_id is null or so.subproject_id = f.subproject_id)
      join app_users u
        on u.id = auth.uid() and u.email = so.consultant
      where f.id = p_fmd_id
    )
    /* ...or the consultant on any object this FMD is ASSIGNED to. Since 0045 an FMD is reusable:
       the row that owns the document is not necessarily the row that generated it. */
    or exists (
      select 1
      from subproject_objects so
      join app_users u
        on u.id = auth.uid() and u.email = so.consultant
      where so.fmd_id = p_fmd_id
    )
    /* ...or a governance role in the FMD's programme. Without this an object nobody has been
       assigned yet would be publishable by nobody at all — the same dead end that made the
       client-side rule an OR rather than a plain ownership check. Program-wide FMDs
       (subproject_id is null) accept any of the caller's governance memberships, matching
       fmds_select in 0014. */
    or exists (
      select 1
      from fmds f
      left join subprojects s on s.id = f.subproject_id
      left join projects pr on pr.id = s.project_id
      join memberships m
        on m.user_id = auth.uid()
       and m.role_id in ('program_admin', 'data_governance_lead', 'data_owner')
       and (
         f.subproject_id is null
         or m.subproject_id = f.subproject_id
         or m.program_id = pr.program_id
       )
      where f.id = p_fmd_id
    );
$$;

create or replace function fmd_versions_check_publisher() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  /* Only the null → set transition is a publish. Editing an already-published row is a different
     rule and already has its own trigger (fmd_versions_block_published_edit, 0029/0030). */
  if new.published_at is not null
     and (tg_op = 'INSERT' or old.published_at is null)
     and not dms_may_publish_fmd(new.fmd_id) then
    raise exception
      'Only the migration object''s consultant or a governance role may publish this Field Mapping version.'
      using errcode = '42501';
  end if;
  return new;
end $$;

/* INSERT as well as UPDATE: publishing takes both paths. Uncommitted edits have no row yet, so
   `publish()` in src/lib/queries/fmds.ts INSERTs a row with `published_at` already set; an
   existing draft row is UPDATEd instead. Covering only UPDATE would leave the common case open. */
drop trigger if exists fmd_versions_check_publisher on fmd_versions;
create trigger fmd_versions_check_publisher
  before insert or update on fmd_versions
  for each row execute function fmd_versions_check_publisher();
