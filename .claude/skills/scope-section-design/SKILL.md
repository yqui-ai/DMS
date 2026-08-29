---
name: scope-section-design
description: The design contract for the Scope section — the register, the five-step builder, the layered dependency diagram and its three views, and the columns behind them. Read before changing anything under src/features/scope.
---

# Scope section design

Scope answers one question per subproject: **what are we migrating, in what order, and who is
responsible.** Everything here is scoped to one subproject (unlike Library, which is program-wide).

## Two authorities, and which wins

Scope was built twice. The current design is the **sap-dependency-analyzer** reference
(`C:\Users\yron.quinto\OneDrive - Accenture\Desktop\PYTHON\sap-dependency-analyzer`, the user's own
app) — its steps, **plus a Finalize** the reference does not need because it is not tied to a
project. The user chose this explicitly over the handoff's four-step version.

Where `design_handoff_dms_app/02-SCREENS.md §4` and the reference disagree, **the reference wins on
the wizard and the diagram**; the handoff still owns the tab strip and the finalize gate.

## Tabs

`Scope Register · ERD Diagram*` — starred tabs appear only once the scope is
finalized, via `TabStripItem.requires = 'scopeFinalized'` (filtered in `TabbedSection`). Hidden
rather than disabled: a tab you can click that then tells you it isn't ready is worse than one that
arrives when it means something.

**Scope Register is deliberately NOT gated on `scopeFinalized`.** "Which objects are we migrating,
and who owns each" is asked from the first day of scoping, and it is where the consultant and ETL
developer are assigned — which has to be possible before finalizing, not after.

The index route redirects to `register` — the section lands on the ANSWER, not on the tool that
produces it. An empty register carries the button that starts the builder, so a fresh subproject
still has one obvious next action.

### The builder decides the scope; the Register reads it back

Two different jobs, and the section only had the first one. Once a scope was finalized it offered a
graph and a set of documents, and no plain list — the only way to read back what had been agreed was
to re-enter the builder you had just closed. `ScopeRegister.tsx` is that list: load stage, SAP ident,
the source ident it was imported as, component, and the two assignment roles.

**Do not add assignment to the builder instead.** Assigning people is ongoing work against a settled
list, not a step you walk once.

### The Register ASSIGNS the FMD; it does not own a tab of its own

**FMD Mapping was merged INTO Scope Register.** The two tabs listed the same objects with two
different subsets of their columns, so "who owns this and does it have a mapping" meant switching
tabs and re-finding the row. One list, one row per object; `FmdMapping.tsx` is deleted.

Column order is fixed: **Stage · Object ID · Description · Component · Consultant · ETL Developer ·
Field Mapping · actions.** The Field Mapping column REPORTS (name, live version, `Draft` /
`Unpublished` tags) and never acts — the assign/change action is an icon in the row action cluster,
because a bordered button per row put eleven of them down the middle of the table.

**That icon is present whether or not an FMD is assigned.** Dropping it for assigned rows made the
assignment a one-way door, which is the opposite of what reuse means.


The primary action on an object with no mapping is **Assign FMD**, not Generate. A Custom FMD is a
deliverable somebody wrote once; the next wave migrating the same object should adopt it rather than
generate a second copy from the Golden template and drift from the original. Offering only
"Generate" made a fresh document the path of least resistance and produced one FMD per subproject
for the same object.

`AssignFmdDialog` lists every FMD written for that object (`useAssignableFmds`, flat queries) with
its object ident, latest version and **how many subprojects already use it** — the reuse signal.
Generating stays available, and becomes the emphasised action only when the list is empty. A
generated FMD is assigned to the subproject immediately via `onGenerated`, so "no FMD → generate →
assigned" is one action rather than two.

**There is deliberately no bulk assign.** Which existing document a subproject adopts is a judgement
per object; doing it fifty at a time is how the wrong FMD gets attached to forty-nine of them. Bulk
*generation* is fine and stays.

**The per-row action is `quiet`, and there is exactly one filled button on the screen.** Every row
carried a filled primary `Assign FMD`, so on a twelve-object scope the eleven things NOT done were
the loudest thing on the page and the one that WAS done read as the exception — backwards for
scanning what is left. State now lives in the data (a muted "Not assigned", the live version, a
`Draft` or `Unpublished` tag) and the only filled action is `Generate N missing` in the toolbar.

The screen opens with the answer it exists to give — *"1 of 12 in-scope objects have a Field
Mapping"* with a progress bar — because a table makes you count and a sentence does not.

It reads `useLibraryFmds`, not `useAllFmds`: the narrow mapper carries no version or draft state,
and both are columns here.

Writes `subproject_objects.fmd_id` — never `fmds.subproject_id`. See the `library-section-design`
skill for why those are different facts.

### Generation goes through the Library's dialog

`ScopeRegister.tsx` renders `GenerateFmdDialog` — **the same dialog as Library > Migration Object.** It
previously inserted a bare `fmds` row with a name and nothing else: no structures, no version, no
Golden template. That is not an FMD, it is a placeholder wearing an FMD's name, and it skipped the
decision the document exists to record — **which of the object's sender structures are in scope**.
An object sends several; a subproject rarely migrates all of them.

The difference between generating here and generating in the Library is only *where the result is
bound*: from Scope the FMD is a **Custom** one tied to this object and this subproject (and through
it the project and programme), rather than a program-wide Standard one. The dialog decides that
itself from `useObjectScopeUsage`, and now defaults to the subproject in the URL — it used to take
`scopeUsage[0]`, so an object in two waves generated against the wrong one with nothing on screen
saying so.

**Never reimplement FMD generation.** An existing FMD opens the Library's viewer route, not a local
dialog: a generated FMD has versions, a draft model and review points, and that screen renders all
of it.

### Design > Scope's object list is NOT Library > Migration Object

Two different screens, easily confused, and deleting the wrong one is a real mistake that has
already happened once:

| | Design > Scope | Library > Migration Object |
|---|---|---|
| Component | *(removed, being rebuilt)* | `library/LibraryObjects.tsx` |
| Grain | one subproject's in-scope selection | the whole program's catalogue |
| Editable | in-scope flags, assignments | read-mostly reference |

Work under `src/features/scope/` never touches `src/features/library/`.

**The builder is not a tab, and it is not INSIDE the tabbed section either.** `scope/build/:step`
is a **sibling** route of `scope`, not a child of `TabbedSection`.

Nested, it rendered the page header and the tab strip above its own step strip: two navigation
systems stacked, with the tab strip showing nothing selected because the builder is not one of its
tabs. That is what made Scope read as messy — not the step count, but two competing answers to
"where am I". As a sibling it owns the area, shows one navigation, and carries its own compact
header (`Build scope` + subproject) with an explicit **Close** back to the register.

**One navigation on screen at a time.** If a future flow needs the same treatment, mount it as a
sibling too; do not add a `hideTabs` prop to `TabbedSection`.

## The builder — `ScopeWizard.tsx` + `wizard/`

| # | `:step` | Component | Writes |
|---|---|---|---|
| 1 | `objects` | `SelectStep` | `scope_candidates` |
| 2 | `mapping` | `MappingStep` | `mapping_status`, `mapping_note`, `subproject_objects.in_scope` |
| 3 | `check` | `DependencyCheckStep` | `in_scope` (pull-ins), `scope_waivers` |
| 4 | `sequence` | `LoadSequenceStep` | `load_seq` |
| 5 | `finalize` | `FinalizeStep` | `subprojects.scope_finalized` |

`scope` redirects to `register`; `scope/build` redirects to `build/objects`.

**Source is not a step.** It was one for exactly one iteration, and it was the clearest thing wrong
with the screen: a whole page and a click to be told *"this subproject's list was built by picking
from the SAP catalogue — continue in the next step"*. A step that reports a decision instead of
taking one is ceremony. The choice now lives in `SelectStep`'s empty state, which is the only time
the question is open; once a list exists the panel for the chosen path is simply the screen.

**The general rule: a step must take a decision that can only be taken there.** Before adding one,
check it is not just a heading over something already decided.

Each step only makes sense once the one before it is settled, which is why this is a wizard rather
than tabs. **It writes as it goes** — every step's state is a real column, so closing halfway loses
nothing and re-opening resumes. There is no "save the wizard" step.

**The source is not stored.** `ScopeWizard` derives it as `candidates[0]?.origin ?? pickedSource`,
so an existing list settles the question and a resumed scope lands on the right panel without a
column of its own. Once candidates exist the "switch path" link disappears — changing it then would
mean discarding a list, which is not something a quiet link should do.

**Dependency Check and Load Sequence are two steps, not one screen with a toggle.** They answer
different questions — "is anything missing" and "in what order does this run" — and the second is
only meaningful once the first is settled. The old `diagram` step was dropped from the wizard: it
drew the same graph as Load Sequence, and it still exists as the standalone ERD Diagram tab, which
is where people go back to it.

### Every step body must be part of the flex chain

This has broken twice, the same way both times. `ScopeWizard` gives the step body a
`flex-1 min-h-0` slot between the step strip and the Back/Next footer. A step whose root is a plain
`flex flex-col` overflows that slot **without a scrollbar** and paints its last rows over the
footer, so the controls look like list content and the closing paragraph is cut off.

Every step root is therefore `flex flex-col gap-3 flex-1 min-h-0`, with:
- `shrink-0` on the metrics strip, toolbar, legend and trailing note,
- `flex-1 min-h-0 overflow-y-auto` on the one element meant to scroll (the list, or the ReactFlow
  canvas).

**Never size a step's scroll area with `max-h-[Nvh]` or `h-[Nvh]`.** MappingStep used `54vh` and
LoadSequenceStep `52vh`; a vh guess is right on one monitor and leaves either dead space or an
overlapped footer on every other. Height comes from the chain. The footer itself is opaque
(`bg-bg border-t`) so a scrolled list passes behind it rather than through it.

### `scope_candidates` is the authority; `subproject_objects` is the record

The candidate list decides what is in scope. `subproject_objects.in_scope` is where that decision is
written down so the dependency check, the load sequence, the ERD and FMD Mapping can act on it.

**`reconcileScope(subprojectId)` in `scopeCandidates.ts` keeps them in step, and every mutation that
can change what belongs in scope must call it.** Nothing did, and the consequence was that scope was
**append-only in practice**: un-ticking a catalogue object deleted its candidate but left the scope
row, so the object went on loading invisibly. Un-confirming a mapping, parking a row as custom,
re-mapping it, and re-uploading a file with `IN_SCOPE=No` all leaked the same way.

A candidate belongs in scope when it is `in_scope && !custom && mapped && confirmed`. Objects that
fall out are set `in_scope = false`, **never deleted** — the owner, consultant, ETL developer and
load position have to survive an object being taken out and put back. The function is a full
reconcile rather than a targeted delete so it also repairs rows leaked before it existed.

**Anything that puts an object in scope must create a candidate too.** `adoptPrerequisites` is why
the Dependency Check's "Add to Scope" writes a candidate (origin `standard`, mapped to itself,
pre-confirmed) as well as the scope row. A bare scope row would be invisible in Select Objects and
Object Mapping, would make the Finalize count disagree with what actually loads, and would be
reconciled straight back out on the next edit.

### Selection vs mapping are different facts

Select Objects records an intention ("we think we need this"). Object Mapping records a finding
("we have confirmed where it comes from") and is the step that actually puts a row in scope. A
project lives in the gap between those for weeks. Do **not** collapse them into one checkbox.

`mapping_status` is `Confirmed | Review | Missing`, **nullable**. Null means *unreviewed*, which is
counted separately from `Missing` — nobody looking is not the same as someone looking and finding
nothing. Keep the TS union in `entities.ts` in sync with the CHECK constraint in migration `0035`;
adding a value in TS alone makes every insert of it fail at the database.

### Waivers

A missing prerequisite has exactly two resolutions: pull it into scope, or waive it.

**A waiver is keyed on the PAIR** — `scope_waivers (subproject_id, migration_object_id,
requires_object_id)`, migration `0044`. An object with four gaps can easily have three genuinely
covered elsewhere and one that is an oversight; one column on the object could never say that.
`waived_by` is resolved inside `useScopeMutations` from `useAuth()`, not passed in by callers — a
caller that forgot would write an anonymous waiver, which is the one field a waiver cannot do
without.

`subproject_objects.waiver_reason` is the pre-0044 object-grain column. It is **still read** (a
reason recorded before the split is still true about that object, and `checks` accepts it as cover
so old scopes don't suddenly read as unresolved) but **nothing writes it** — `setWaiverReason` was
removed. Do not add a writer back: it would produce waivers the pair-grain check screen can neither
show against the right prerequisite nor un-waive.

Warnings never block finalize. A prerequisite left out on purpose and an object with no source yet
are both real project states; a wizard that refuses to close on them just gets worked around. Only
an empty scope blocks.

## The dependency diagram — `diagram/`

One graph, three ways of reading it, switched with `Segmented`. Each answers a question the others
answer badly, so **do not drop one to "simplify"**:

| View | Answers |
|---|---|
| `GraphView` | What shape is this? |
| `CardsView` | What is actually in layer 3? |
| `ExecutionView` | What loads when? |

### Hierarchy was removed — do not rebuild it

`HierarchyView` rendered the graph as an expandable tree. **A dependency graph is not a tree**: any
object several others need got re-drawn under each of them, with its whole subtree, every time. On a
six-object scope that produced twenty-odd rows in which `SIF_BANK_2` appeared five times and
`SIF_VENDOR_2` four, each re-expansion repeating facts already on screen. Deleted 2026-08-28.

**No view may render the same object twice.** If a future view needs "what does this one object
need", it belongs in the object's own detail dialog, which already draws that as a star.

### Graph shares its style with Library > Migration Object

`GraphView` deliberately uses the same card shape (260×118), `ColorTag` category/component tags,
overlay legend, Simple/Futuristic toggle and select-to-highlight interaction as
`library/DependencyDiagram.tsx`. They are the same kind of picture, and looking like two unrelated
tools is what made the app feel assembled rather than designed. The theme comes from the shared
`useErdTheme`, so it is one preference rather than two.

What Scope adds is the **layer bands** — the Library diagram is a star (one root and its direct
prerequisites) and has no depth to show; a scope is a whole graph and its depth is the point.

Selection highlights **one hop**, not full lineage: on a layered graph an ancestry walk lights up
most of the diagram and answers nothing. Full lineage lives in Load Sequence.

**Dimming must drain colour, not just opacity.** Unselected nodes go `opacity-[.22] grayscale` and
their layer bands dim with them. Opacity alone was not enough: at 30% a saturated layer ring is
still a coloured shape, so eight faded nodes went on competing with the two you selected — and the
bands stayed at *full* saturation, which made the loudest things on screen the layers you were not
looking at. Bands whose layer contains a lineage node stay lit, so the selection keeps its depth
context.

### Colour is an accent, not a surface

`ExecutionView` used to give every wave a full-bleed saturated bar. Seven of them stacked turned a
load plan into a colour chart: the bars were the loudest thing on the page while carrying one word
and a count each, and the object rows they exist to introduce read as an afterthought.

Waves are now laid out as a schedule — a continuous coloured **spine** down the left plus a small
**chip** in a quiet header. The layer hue still identifies the wave; it just no longer occupies the
full width. Apply the same restraint to any future grouped list: a full-width saturated block per
group is almost always wrong once there are more than three groups.

The graph's layer bands keep their saturated header strip — there the band *is* the structure, and
the strip is a fixed 34px rather than a slab.

`DependencyDiagram.tsx` owns the toolbar, the layer + component filters and the partition tabs;
filters apply across all four views so narrowing in one stays narrowed when you switch. It is used
**once**, by the standalone ERD Diagram tab (`ScopeErd.tsx`, which opens on `execution`) — the
after-the-fact reading of a scope that has been agreed. The wizard's Load Sequence step draws the
same graph from the same `buildScopeGraph` output, so the two never disagree about the shape.

## Load Sequence — `wizard/LoadSequenceStep.tsx`

The executable order, as a diagram rather than a numbered list. Stages run **left to right** with
arrows **prerequisite → dependent**, so the picture reads in the direction the load runs.
Everything inside one stage is independent by definition and can run in parallel — the schedule
people actually want out of a dependency graph, and the thing a flat ordered list cannot show.

Node cards carry the component badge, name, ident, type, and `▲n ▼n`: how many objects need this,
and how many prerequisites it has. Clicking a node dims everything outside its lineage (walked both
directions); clicking the pane clears it.

Edges: solid = mandatory, dashed = optional, dotted grey = **circular, excluded from staging**. A
cycle is named underneath (`SIF_A ⇄ SIF_B`), never resolved into a stage. There is no correct stage
for an object in a cycle, and inventing one produces a plan that looks settled and fails on the day.

### Layers are the whole point

`computeLayers` in `src/lib/scopeGraph.ts` gives every node a longest-path depth. Layer 0 needs
nothing else in scope; layer N waits for N-1. **This is the only place in DMS where colour encodes
something other than state** (`src/lib/layerTheme.ts`) and it is deliberate: layer depth is an
ordered scale, not a category. Read the `design-system` skill's colour rule as still binding
everywhere else.

#### The palette has four roles and they do not mix

Rebuilt 2026-08-28. The first version was ten **pale tints** on a 33° hue step, and L2/L3/L4 were
indistinguishable — measured RGB separation between adjacent headers was 18–31. Two changes fixed
it: hue steps went to ~60° so no two adjacent layers share a colour family, and the bands became
**saturated** rather than 90%-lightness tints, which took adjacent separation to 89–149.

| Role | Use for | Text on it |
|---|---|---|
| `band` | Stage/layer header strip | `LAYER_BAND_TEXT` (white) — **never `ink`** |
| `wash` | Pill fill, band interior, card grid ground | `ink` |
| `surface` | Node body inside a band | `--text` |
| `ink` | Node borders, and the layer's label on white | — |

Every pairing is measured: white-on-band 4.99–10.35 : 1, ink-on-wash 4.82–9.45 : 1, ink-on-white
4.99–10.35 : 1. **Do not introduce a fifth role or pair a role from one layer with a role from
another** — the combinations are verified as pairs, not individually.

`ink` doubles as the border colour because it is the strong value. The old pastel borders measured
1.5–2.7 : 1 against white, under the 3:1 a UI boundary needs, so node outlines were decorative
rather than legible. Borders are drawn as a 1.5px `inset` box-shadow, not a 1px `border`: at 1px a
saturated hue greys out as soon as the canvas zooms below ~80%.

#### Node boxes are sized for the worst case

React Flow positions absolutely, so **a node shorter than its content clips it silently** — no
scrollbar, no overflow, no warning. This shipped twice: `LoadSequenceStep` at 196×84 lost the whole
meta row of any object whose name wrapped to two lines, and `GraphView` at 200×60 clipped three-line
names. Both are now budgeted for the tallest content they can hold (240×106 and 224×76), not the
common case. **If you add a row to a node, raise `NODE_H` in the same change.**

### Cycles are a NOTE, not a per-node mark

A cycle has no valid load order. `computeLayers` returns `cyclic: Set<string>` — members still get
a layer (a guess) so the diagram draws. Never drop them and never recurse into them.

**Say it once, underneath the diagram.** Cycle membership used to be drawn on every member in every
view — a red ring in Graph, an icon in Cards, a "cycle" row wherever Hierarchy re-drew the object —
so two objects produced five or six red flags on one screen. That made a rare condition look like
widespread failure and buried the only thing worth knowing: *which* objects, and that their stage is
a guess. `DependencyDiagram` renders one `cycleNote` naming each cycle as `A ⇄ B`; `GraphNode.cyclic`
stays in the data for filtering, and the card deliberately does not draw it.

The same rule applies to Load Sequence, which names cycles in a single line under the canvas rather
than badging each node.

### Scale

`VIEW_LIMITS` — cards 100, hierarchy 100, graph soft 100 / hard 500. Only the canvas is partitioned
(`partitionGraph`), because the other three render plain DOM. **Partitions never split a layer**
unless that single layer is itself over the hard limit; half of layer 3 is worse than no partition,
because the missing half is the context the visible half needs.

### The load sequence is derived, not typed

`sequenceFromLayers(nodes, currentOrder)` — layer order, then the saved order as tie-break, then
ident. Re-running it is stable and nothing moves that wasn't forced to.

`ExecutionView` allows drag reorder **within a wave only**. Everything in one wave is independent by
definition, so those drags are always safe; a cross-wave drag is the one edit that can produce an
order which fails on the day. Constraining it means every order this screen can produce is valid —
which is why there is no violations warning to write and none to ignore.

## Roles

Two columns, two jobs, assigned **after** the scope is finalized (never on the initial catalogue
list):

- `consultant` — owns the object's **mapping**. Gates FMD publishing together with the governance
  roles.
- `etl_developer` — builds the object's **pipeline**. Carries no publishing rights.

Read program-wide via `useScopeObjectOwners()` + `scopeOwnerKey()`. An FMD has no owner of its own —
see the `library-section-design` skill.

## Query keys

A scope write changes what the check and the graph are *about*, so `useScopeMutations`' `invalidate`
clears all four together: `subproject-objects/<id>`, `dependency-check/<id>`,
`scope-dependencies/<id>`, `missing-prereqs`. Adding a mutation that skips any of them leaves a
stale check listing a prerequisite the user just pulled in.

`useMissingPrerequisites` (gaps only, for banners) and `useDependencyCheck` (every pair, resolved
both ends, for the wizard) are both live and answer different questions. Don't merge them.

## Deleted, and why

| Removed | Because |
|---|---|
| `ScopeCriteria` | Row-level extraction filters — never in the handoff, not part of scoping |
| `ScopeSequence` | Sequencing is the Execution view now |
| `ScopeAssignments` | Assignment belongs on the (rebuilt) object list, post-finalize |
| `ScopeDependencyGraph` | Superseded by `diagram/GraphView` |
| `ScopeOverview` | Old design, being rebuilt from scratch |
| `MigrationObjectCatalogue` | Old design, being rebuilt from scratch |
| `ImportObjectsDialog`, `SelectStandardDialog` | Only used by the removed catalogue |

`ObjectDetailDialog` stays — `staging/PipelineStages` uses it.

Don't reintroduce any of these as tabs.

## Still owed

- **No scope-level KPIs anywhere.** The Register counts rows and unassigned objects; there is no
  read of coverage, custom-object share or stage depth for someone who is not doing the work.
- **Custom objects go no further than "parked".** They are excluded from mapping, carry no
  dependencies and never reach a load stage, so a scope that is largely custom finalizes as mostly
  empty. Fine while custom handling is deferred; wrong the moment it isn't.
- **The Register's assignment is per row.** No bulk "assign these twelve to X", which is how the
  work is actually handed out.
- Migrations are current through `0044`, and `convert-historical-fmd` is deployed (v20, 2026-08-28).

## Maintaining this skill

This file is the Scope design contract. **Whenever you change Scope — a wizard step, a diagram view,
a column behind them, or the finalize gate — update this file in the same change.** A stale contract
is worse than none.

### The ERD graph has a search, and it MOVES the viewport

`NodeSearch` sits in the canvas overlay beside the theme toggle. Picking a result both selects the
object (lighting its lineage, which is what you wanted it for) **and** calls
`fitView({ nodes: [{ id }] })` on the captured React Flow instance.

Selecting without moving is the failure mode to avoid: a scope of forty objects is several screens
wide at readable zoom, so a match that lights up off-screen looks exactly like the search doing
nothing. The instance is held in a ref captured from `onInit` rather than via `useReactFlow()`,
which only works inside a provider — wrapping the component in one purely to move the viewport is
a lot of restructuring for a single call.

### Lineage: white for lit, red for mandatory

When a selection is active the lit nodes go **white** (`--surface`), not their layer tint. Once the
rest of the canvas is drained to 22% grayscale those pale tints are the only colour left, so the
lineage read as "slightly less pale" rather than as the answer. Layer identity survives on the ring
and the band.

A node joined to the selection by a **mandatory** edge gets a red ring. That distinction is the
reason the lineage exists — one is a scheduling preference, the other is a load that fails without
it — and it was previously only readable by tracing each arrow back to the legend.

**No reddish hue may enter `layerTheme`.** L3 was pink and L4 orange; the moment mandatory
prerequisites started ringing red, a red-ringed node inside a pink band next to an orange band asked
the reader to tell "must load first" from "three loads deep" by shade. The ramp is now drawn only
from green, lime, olive, teal, cyan, blue, indigo, violet, purple and slate.

**Futuristic stays dark.** The glow is the signal in that theme and a glow only reads against a dark
ground; it was lightened once and had to be put back darker than it started.
