-- Portfolio rollup for the Migration Status launchpad tile.
--
-- Computed in SQL rather than in the browser because the risk half of it reads
-- `fmd_versions.sheets`, and that JSONB is the biggest column in the database — a client-side
-- rollup would download every published FMD of every program to count findings nobody asked to
-- see. One row per program, a few dozen bytes each.
--
-- SECURITY INVOKER is load-bearing. Without it the view would run as its owner and hand every
-- caller every program in the system, which is the opposite of what the RLS in 0002 is for. With
-- it, the underlying policies still apply: you see a program only if you hold a membership on it.
-- Leadership therefore needs a `cab` membership on each program they are meant to watch — that is
-- the grant, and it is deliberate. There is no cross-program bypass anywhere in this schema and
-- this view does not introduce one.

create or replace view program_status
with (security_invoker = on) as
with scope as (
  select
    pr.id as program_id,
    so.migration_object_id,
    so.mapping_status
  from programs pr
  join projects pj on pj.program_id = pr.id
  join subprojects sp on sp.project_id = pj.id
  join subproject_objects so on so.subproject_id = sp.id
  where so.in_scope
),
-- An object counts as having a live FMD when some FMD for it has at least one PUBLISHED version.
-- An unpublished generation is work in progress, not a mapping anyone can build against.
fmd_live as (
  select distinct pr.id as program_id, f.migration_object_id
  from programs pr
  join projects pj on pj.program_id = pr.id
  join subprojects sp on sp.project_id = pj.id
  join fmds f on f.subproject_id = sp.id
  join fmd_versions fv on fv.fmd_id = f.id
  where f.migration_object_id is not null and fv.published_at is not null
),
loaded as (
  select distinct pr.id as program_id, r.migration_object_id
  from programs pr
  join projects pj on pj.program_id = pr.id
  join subprojects sp on sp.project_id = pj.id
  join runs r on r.subproject_id = sp.id
  where r.migration_object_id is not null
    and r.status in ('Completed', 'Completed with rejects')
),
failed_runs as (
  select pr.id as program_id, count(*) as n
  from programs pr
  join projects pj on pj.program_id = pr.id
  join subprojects sp on sp.project_id = pj.id
  join runs r on r.subproject_id = sp.id
  where r.status = 'Failed' and r.started_at > now() - interval '7 days'
  group by pr.id
),
-- Findings from the LATEST review of each FMD's latest published version, minus the ones someone
-- has marked addressed. Older runs are superseded, not outstanding — counting every run ever would
-- report the same issue once per review.
latest_published as (
  select distinct on (f.id)
    pr.id as program_id, fv.sheets
  from programs pr
  join projects pj on pj.program_id = pr.id
  join subprojects sp on sp.project_id = pj.id
  join fmds f on f.subproject_id = sp.id
  join fmd_versions fv on fv.fmd_id = f.id
  where fv.published_at is not null
  order by f.id, fv.published_at desc
),
findings as (
  select
    lp.program_id,
    count(*) filter (where finding->>'addressed' is null) as open_findings,
    count(*) filter (where finding->>'addressed' is null and finding->>'severity' = 'error') as open_errors
  from latest_published lp
  cross join lateral (
    select review
    from jsonb_array_elements(coalesce(lp.sheets->'mappingReviews', '[]'::jsonb)) review
    order by review->>'reviewedAt' desc nulls last
    limit 1
  ) newest
  cross join lateral jsonb_array_elements(coalesce(newest.review->'findings', '[]'::jsonb)) finding
  group by lp.program_id
),
-- A prerequisite of an in-scope object that is not itself in scope, in the same program.
missing_prereqs as (
  select s.program_id, count(*) as n
  from scope s
  join object_dependencies od on od.migration_object_id = s.migration_object_id
  where not exists (
    select 1 from scope s2
    where s2.program_id = s.program_id and s2.migration_object_id = od.requires_object_id
  )
  group by s.program_id
)
select
  pr.id                                                as program_id,
  pr.code,
  pr.name,
  count(distinct s.migration_object_id)                                            as objects_in_scope,
  count(distinct s.migration_object_id) filter (where s.mapping_status = 'Confirmed') as objects_mapped,
  count(distinct fl.migration_object_id)                                           as objects_fmd_live,
  count(distinct l.migration_object_id)                                            as objects_loaded,
  coalesce(max(fd.open_findings), 0)                                               as open_findings,
  coalesce(max(fd.open_errors), 0)                                                 as open_errors,
  coalesce(max(mp.n), 0)                                                           as missing_prereqs,
  coalesce(max(fr.n), 0)                                                           as failed_runs_7d
from programs pr
left join scope s          on s.program_id = pr.id
left join fmd_live fl      on fl.program_id = pr.id
left join loaded l         on l.program_id = pr.id
left join findings fd      on fd.program_id = pr.id
left join missing_prereqs mp on mp.program_id = pr.id
left join failed_runs fr   on fr.program_id = pr.id
group by pr.id, pr.code, pr.name;

comment on view program_status is
  'One row per program for the Migration Status tile: progress counts and outstanding risks. '
  'security_invoker = on, so RLS still limits it to programs the caller has a membership on.';
