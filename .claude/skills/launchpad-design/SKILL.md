---
name: launchpad-design
description: The design contract for everything ABOVE the program level — the three-tile launchpad, global Administration, and the Migration Status portfolio. Read before changing src/features/launchpad, the top-level router, AppShell/LaunchpadShell, or HeaderBar.
---

# Launchpad — above the program level

Three areas, SAP Fiori style, chosen before anything else. The app used to open straight into a
subproject picker, which assumed everyone was here to do migration work.

| Tile | Route | Who sees it | What it is |
|---|---|---|---|
| Administration | `/admin` | program-wide `program_admin` | Users and roles across the programs you administer |
| Migration Project | `/projects` | anyone with a membership | The hierarchy, and where all four levels are created |
| Migration Status | `/status` | `program_admin`, `cab` | Read-only portfolio for leadership |

**A tile you cannot use is not rendered.** Showing a disabled Administration tile to every
consultant advertises a door that never opens. Same gating in `AppSwitcher` (HeaderBar).

**`/approvals` is deliberately not a tile.** An approvals queue is somewhere you are *sent*, not an
area you choose to work in. It lives in the app switcher, gated to `APPROVER_ROLES`, and is
announced by a banner on Migration Project when something is waiting on you — an approver who is
never told is an approval that never happens.

## Migration Project's action row

Everything programme-wide hangs off this screen rather than the area switcher, because these are
things you do *with* the hierarchy. They are **tiles in a row above the search**, not header
buttons: **Library · Plant Maintenance · Archive · Change Log · Approvals** (role-gated, carries a
count). Six controls in the header slot squeezed the description into three narrow lines and gave a
place you GO the same weight as a thing you DO.

**The header keeps only actions.** `New program` is the one, and it stays a primary button.
**Reset test data is deliberately not a tile** — it is not a destination, and giving a destructive
action the same shape as four navigation targets is how it gets clicked by reflex. It is a quiet
red text link, last, pushed to the far end of the row.

**Migration Project is the only place the hierarchy is edited.** `ProgramSettingsPage` and its
`programSettings` ScreenKey are gone: its Configure tab was a second editor for the same program →
project → subproject → cycle tree, and two editors for one hierarchy is one too many. Its three
other tabs were not duplicated anywhere, so **Archive Approvers, Timelines and Internal moved into
Program Admin** rather than being deleted with the screen around them. Do not reintroduce a
settings screen that edits the hierarchy.

**Reset test data** (`ResetTestDataDialog`, `src/lib/queries/testReset.ts`) is **temporary — delete
both before this app is used for real.** It empties one programme's subproject data (scope, FMDs,
rules, XREF) so a test run can be walked again. Three things keep it safe enough to live in the app
meanwhile: it is scoped to one programme, it counts what it will remove before asking, and it
requires the programme code typed out. It cannot reach the Golden FMD, the Standard FMDs or the
Golden XREF — those are program-wide rows (`subproject_id is null`) and the delete is
subproject-scoped, so the templates are protected by construction rather than by a filter someone
could change.

**No screen reached from here carries its own back button.** The breadcrumb already goes to
Migration Project; a second way back that only one screen has reads as a page-specific control
rather than navigation. (Change Log had one; it was removed.) Centre these screens the same way —
`max-w-[1120px] mx-auto w-full` — including the Library tile page.

**Plants (`/plants`, `programme/PlantsPage.tsx`) are programme master data**, so the list is
maintained here and never inside a subproject — two waves covering plant 1010 must be talking about
the same 1010. The form asks four things: **code, name, city, country**. It does *not* ask for the
programme (taken from the filter, or the only one you can reach) and there is no description —
`plants.description` was dropped in 0050 rather than left as a column nothing writes.

***Assigning* plants is a field inside the create/edit subproject form** (`PlantPicker` in
`HierarchyDialog`), not a separate action. It was a "Plants covered" menu item on the subproject
tile for exactly one iteration: which sites a wave covers is part of what the wave *is*, so it is
decided when the wave is created — a second dialog let a subproject exist with no site attached and
nothing ever asking for one. `HierarchyTarget.programId` carries which programme's plants to offer.

Creating a subproject reads its own row back (`.select('id').single()`, subprojects only) so the
plant links can be written in the same save. That is safe *only* at this level: 0039 replaced the
subprojects SELECT policy with `can_see_subproject(id, project_id)` expressly so `INSERT …
RETURNING` works. Do not copy the `.select()` to the other levels.

`subproject_plants` is many-to-many (migration 0049). **A project's plants are DERIVED as the union
of its subprojects'** and rendered read-only on the project header — never stored at the project
level, which would be the same two-sources-of-truth trap as `fmds.owner` (dropped in 0030). Plants
share scope and FMDs through their subproject; there is deliberately no plant→FMD link, because
`subproject_objects.fmd_id` already carries that and a parallel one would have to be kept in step.

`/library` is likewise not a tile: it is reached from a **Library** button on Migration Project, and
from the switcher. The four catalogues also stay as direct sidebar entries, because someone already
working wants the catalogue, not a page describing it.

## The header

One control answers "where am I" and "how do I move": `AppSwitcher` shows the **current area's name
and icon**, and opens the list of the others. It was a bare grid icon with a chevron — naming
nothing, so it could not say where you were and gave no clue what it did.

**There is exactly one way home: the DMS wordmark in the sidebar.** Before this the app offered four
— the wordmark (dead text), a `Home` row inside the switcher, the breadcrumb's `Home`, and the
launchpad tile — with nothing to connect them. The switcher moves you sideways; the wordmark and the
breadcrumb go up.

`SubprojectSwitcher` renders **only when a `programId` is in the URL**. Elsewhere it read "Pick a
subproject" — advertising a choice that does not apply, phrased as a task you had failed to do.

## Shells

Two layout routes, both wrapping the shared `AuthGate` so the launchpad can never become a way in.

- **`LaunchpadShell`** — header only. No sidebar, no breadcrumb: the sidebar navigates *within* a
  subproject and the breadcrumb reports a position *inside* one. Neither has anything to say yet.
- **`AppShell`** — the full working chrome, from `/pg/:programId` down.

They are sibling **pathless layout routes** in `router.tsx`, not nested. `/me` lives on the
launchpad shell — a profile is account-level, not project-level.

**Tiles are home, always.** Every session starts at `/`. `AppSwitcher` in the header jumps between
areas without going home first.

## Roles: many per person, resolved per subproject

This is the single most important thing to preserve. **A person holds several memberships with
different roles** — functional consultant on Wave 1, ETL developer on Wave 2. `memberships` has
always modelled it (`program_id` + nullable `subproject_id`), and `useCurrentRole` has always
resolved subproject-specific first, falling back to program-wide.

What was missing was **visibility**, and that is what `RolePill` in the header fixes: it shows the
role you hold *right here*, re-resolving as you move. Never render a single global "your role"
anywhere — there is no such thing.

`useMyMemberships()` (`src/lib/queries/launchpad.ts`) is the above-program equivalent. Use it for
anything that needs role information before a program is chosen; `useCurrentRole` cannot help there
because it requires a `programId`.

**`adminProgramIds` deliberately excludes subproject-scoped `program_admin` memberships.**
Administering users and roles is a program-level act; someone made admin of one wave has no business
editing memberships that reach the others.

## Administration is scoped, not global

There is **no role above `program_admin`** in this schema and this area does not invent one. It
lists the programs you hold a program-wide admin membership on. If a true platform admin is ever
needed it is a new role, a migration, a new RLS path and a grant story — not a quiet widening here.

The per-program `/pg/:id/admin` screen still exists and still works. What it could never show is the
thing that matters about a person: seen one program at a time, someone with two roles looks like two
users with one each. The global user list groups by **membership**, so grouping by role puts a person
under each role they hold, showing only the memberships that placed them there.

## Migration Project — sections, not a tree

`HierarchyPage` renders **program sections → project groups → subproject tiles**, and the shape is
the argument: a program, a project and a subproject are not peers, and only one of them is a place
you can go and work. An indented table (the first version) made all three look like rows of one
list. A tile is a destination; a table row is a record.

- **Program** — a card with its own surface: code, name, status, lead, dates, GUID, counts.
- **Project** — a labelled band inside it. Not a card; it is a grouping, not a thing you open.
- **Subproject** — a tile. The **whole tile** is the click target, not an Open button beside the
  name: a card that looks like a door should open when you push it anywhere. The overflow `Menu`
  stops propagation so administering one never navigates into it.
- **Cycles** are listed inside their subproject's tile and created from its menu. They never got a
  level of their own because nobody navigates to a cycle.

**Centred, `max-w-[1120px] mx-auto`.** Full-bleed on a wide monitor left everything hugging the left
edge with half the screen empty, which is most of why it read as unfinished.

**Icons and status colour** live in `hierarchyLevels.tsx`:

- `LEVEL_ICON` — Building2 / FolderKanban / Boxes / RefreshCw. A building holds folders, a folder
  holds boxes: the metaphor runs the same direction as the hierarchy, which is the only reason to
  spend three icons on it.
- `statusVariant(code)` — status → `Tag` variant, keyed by CODE (shared across levels in
  `dms_ref_status`), unknown falls back to neutral. **This does not break the "colour means state,
  never category" rule** — a status IS a state: Active green, On Hold amber, Cancelled red.

**`9999-12-31` is the open-ended sentinel** `end_date` defaults to (migration 0001). Never print it
— "Jan 05, 2026 – Dec 31, 9999" reads as a data error. `dateRange()` renders "From 5 Jan 2026"
instead. Any new screen showing these dates must do the same.

Row actions live in `Menu`, not as naked icon buttons — see the `design-system` skill.

### Creating a program goes through an RPC

`dms_create_program` (migration 0038), **not** a plain insert. Under RLS,
`INSERT ... RETURNING` also has to pass the SELECT policy, and a program is only selectable once you
hold a membership on it — which the creator does not, at the instant they create it. The AFTER
INSERT trigger that grants it has not fired when RETURNING is evaluated, so the statement fails with
`new row violates row-level security policy for table "programs"`. The function does both writes
atomically and is SECURITY DEFINER, so it checks `auth.uid()` itself.

Every other level is a normal insert — you already hold a membership on the program.

### People are picked, never typed

`PersonSelect` + `useAssignablePeople` (`src/lib/queries/people.ts`). Person-shaped fields were free
text, so one colleague could be recorded three ways and nothing could group them.

**The scope is the point:**

| Field | Scope |
|---|---|
| Program Lead / Co-Lead | `program_admin` on that program (all visible admins while creating one, since it has no members yet) |
| Consultant / ETL developer on a subproject | members of that subproject, plus program-wide members |

The stored value is still the person's **name** — `programs.owner`, `subproject_objects.consultant`
and friends are `text` columns; making them user ids is a migration for another day. A value not in
the list is kept and labelled "not in this scope", never silently dropped: rows written before this
existed hold names that may match no account.

## Migration Status

`program_status` view, migration `0036`. **`security_invoker = on` is load-bearing** — without it
the view runs as its owner and hands every caller every program in the system, defeating the RLS in
`0002`. With it, the existing policies apply: you see a program because you hold a membership on it.
**Leadership is granted `cab` on each program they watch.** There is no cross-program bypass
anywhere in this schema; do not add one to make this screen easier.

It is computed in SQL because the risk half reads `fmd_versions.sheets` — the largest column in the
database. A client-side rollup would download every published FMD of every program to count findings.

Two halves, side by side, and both are needed:

- **Progress** — Scoped → Mapped → FMD live → Loaded, each as a share of objects **in scope**. Never
  as a share of the previous stage: a percentage that shifts its own denominator can rise when
  nothing improved.
- **Risk** — open review errors/warnings, missing prerequisites, failed runs (7d).

Either alone misleads. A program can be 90% mapped and completely stuck, or show zero findings
because nobody has reviewed anything.

Open findings come from the **latest review of each FMD's latest published version**, minus
`addressed`. Counting every run ever would report one issue once per review.

**Read-only, no drill-down.** Someone watching twenty programs is not about to fix a field mapping,
and a link into one invites a change made without the context for it.

## Maintaining this skill

Update this file in the same change as any edit to the tiles, the shells, the top-level router, the
`program_status` view, or the role-visibility rules above.

## Archiving — the approval loop

`ArchiveApprovalsPage` (`/approvals`) is where a request is decided. Requests were being raised with
nowhere to approve them, so nothing could reach the three signatures it needed and every archive sat
Pending forever.

- It opens on **"Needs my approval"** — the reason to come here is to be unblocked or to unblock
  someone. All-open and Decided are the questions that follow.
- Every required role is listed whether decided or not. Seeing **who is left** is the entire point of
  a multi-approval; showing only the decisions made would hide it.
- Approve/Reject render only for roles the viewer holds on that request's program. RLS enforces the
  same rule on write, so this only avoids offering a button that would be rejected.
- The database applies the archive once every role approves (trigger, migration 0040). **Nothing in
  the client decides that** — it records one role's decision and re-reads.

### Who holds the approver roles

The three ROLES are fixed in `dms_archive_approver_roles()`. Who *holds* them is a membership, set
in **Program Settings → Archive Approvers** (`ArchiveApproversTab`).

A role may have several holders and any one of them can give that role's approval — which is what
stops one person's holiday blocking the programme. A role with **nobody** in it is not a stricter
control, it is a request that can never be approved; the tab warns about that at setup rather than
letting it surface at the first archive request.

### Pending archive is a state, shown as one

`useHierarchy` attaches `archiveState` (`none` / `pending` / `archived`) to every node, derived from
open requests in one extra query. A pending archive **replaces** the status tag rather than sitting
beside it — "Active · Archive requested" asks the reader which one wins, and the answer is always the
archive.

Derived, not stamped on the row: writing a status would mean remembering and restoring the previous
one when a request is rejected or cancelled, which is a second source of truth that drifts the first
time a restore is missed.

While a request is open, **Edit is disabled** and Archive becomes **Withdraw request** — a second
request would be rejected by the partial unique index anyway, and the record is on its way to
read-only.
