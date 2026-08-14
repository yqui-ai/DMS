# Pipelines designer (the heaviest feature)

Model: **SAP Data Services**. Object hierarchy `Job → Work Flow → Data Flow → Transforms`.
Rebuild the canvas on **React Flow (xyflow)**; keep the node-card visual design below.

## Screen layout (1440px reference)
```
┌ header row ─────────────────────────────────────────────────────────────────┐
│ [MIG_S4_WAVE1A]  DMS_CENTRAL · JS_DMS_01 · QSA_210      Check ⑴  Run logs  Execute │
├ breadcrumb row ─────────────────────────────────────────────────────────────┤
│ JOB_MM_MATERIAL_MASTER / WF_10_MATERIAL_BASIC / DF_MARA_BASIC   Data Flow · 10 objects │
├──────────┬──────────────────────────────────────────────────┬──────┬────────┤
│ Library  │ [dock: Monitor | Trace log | Error log | Data]    │ rail │ Props  │
│ 236px    │ canvas 560px tall                                 │ 46px │ 300px  │
│ h 600px  │                                                   │      │ h600px │
└──────────┴──────────────────────────────────────────────────┴──────┴────────┘
```
Wrap behaviour: the three columns are flex items — `library 0 1 236px`, `canvas 1 1 520px`
(min `min(520px,100%)`), `props 1 1 280px`. They stack below ~1100px.

### Header row
- Project tag: violet identifier tag (`bg #ede9fe / text #6d28d9`), mono, bold.
- Context line: `repo · job server · system config`, 12px `--muted`.
- **Check** — ghost button, `shield-check` icon, followed by a count tag
  (green when 0, amber when warnings only, red when any error).
- **Run logs** — toggles the dock; primary style while the dock is open.
- **Execute** — primary; opens the run dialog; label becomes "Running…" and disables while running.

### Breadcrumb
Plain mono text segments separated by `/`. Ancestors are `--blue` 600-weight and clickable
(navigate up); the current object is `--text` 700. Right side: `<Level> · <n> objects`.

### Library panel (fixed 600px, internal scroll)
Header "Library" with `folder` icon. Collapsible groups, chevron + type icon + label + count:
1. **`MIG_S4_WAVE1A`** (project) — jobs; click opens the job on the canvas
2. **Work flows** — all work flows; click opens
3. **Data flows** — all data flows; click opens
4. **Staging tables** — `<SID>_<TABLE>_STG` names derived from the Staging Area; click opens the
   **Data preview** dock tab for that table (small `table-2` hint icon on the row)
5. **Flat files** — legacy files (`MATERIAL_MASTER_2019.xlsx`, `xref_mtart.csv`); click previews
6. **Functions** — `FN_MATNR_PAD`, `FN_UOM_CONVERT`, `FN_CHECK_DUPLICATE`
7. **Variables** — `$G_WAVE = W1A`, `$G_LOAD_DATE = sysdate()`, `$G_LOAD_PLANT = 1`,
   `$G_MOCK_CYCLE = MOCK2`, plus substitution parameter `[$$STG_SCHEMA]`

Row: 11.5px mono, 600; active/previewing row `bg #e8f1fa`; indent 31px; icon 12px in type colour.
**No Datastores group** — connections live in the Connections screen.

### Add rail (46px, right of canvas)
Icon-only buttons, 34×34, radius 9, tinted background = type colour at 16 alpha, icon 15px in
type colour, `title` = "Add <type>". Groups separated by a 26×1px `--line` divider.
- Data-flow level: **source, file** | query, case, merge, validation, lookup, tablecomp, keygen,
  mapop, sql | **target, template**
- Job / work-flow level: dataflow, workflow | script, conditional, whileloop, trycatch

A click adds the node to the right of the right-most node (`x = maxX + 240`, `y = 40 + (count % 5) * 90`)
and selects it. New names: `WF_NEW_*, DF_NEW_*, SCR_*, IF_*, WHILE_*, TRY_*, SRC_*, FMT_*, QRY_*,
CASE_*, MRG_*, VAL_*, TC_*, KEY_GEN_*, MAP_OP_*, LKP_*, SQL_*, CLS_*, MTC_*, PVT_*, TGT_*, TMPL_*`
with a 4-char base36 suffix. Adding a work flow or data flow also creates the child object so it
appears in the Library and can be stepped into.

### Node card (React Flow custom node)
200×60, `box-sizing:border-box`, radius 11, `bg #fff`, border 1px `--line`, shadow `node`.
Row layout: 32×32 icon tile (radius 9, bg = type colour @16 alpha, icon 15px) · name+subtitle · status dot.
- **Name**: 12px/700 mono, ellipsis. Clicking the *name area* selects the node → Properties.
  (In React Flow: `nodeDrag` on the card, `onClick` on the inner text block with
  `stopPropagation` on pointerdown so a click never starts a drag.)
- **Subtitle**: 10.5px `--muted`, `"<Type label> · <detail>"`, e.g.
  `Source Table · DS_ECP_STG · 128,400 rows`, `Query · 7 output columns`,
  `Validation · 4 rules`, `Work Flow · 2 objects inside`.
- **Selected**: 2px border in type colour + shadow `nodeSelected`.
- **Running**: 2px `#e2a900` border. **Status dot**: running `#e2a900`, done `#1e6bb8`, rejects `#da291c`.
- **Double-click**: work/data flow → step into it (breadcrumb pushes); transform with a schema →
  mapping editor; anything else → select.
- **Handles**: source handle on the right edge (13px circle, white fill, 2px border in type
  colour, `cursor:crosshair`), target handle on the left. Connecting = drag handle → drop on a node.

### Edges
Bezier, `stroke #94a3b8`, 2px; after a successful run the upstream-completed edges turn
`#1e6bb8` at 2.5px. Conditional edges are labelled pills at the midpoint, uppercase 10px/700:
- `PASS` / `THEN` — `bg #e8f1fa`, text `#1e6bb8`, solid line
- `FAIL` / `ELSE` — `bg #fdeceb`, text `#a81409`, **red dashed** line (`6 4`)
Clicking a label flips the pair (Pass↔Fail, Then↔Else). Unlabelled edges show a small white ×
button at the midpoint to delete the link.

### Object types (icon · colour · label)
| type | lucide icon | colour | label |
|---|---|---|---|
| workflow | git-branch | #7c3aed | Work Flow |
| dataflow | shuffle | #1e6bb8 | Data Flow |
| script | terminal | #334155 | Script |
| conditional | git-fork | #b45309 | Conditional |
| whileloop | repeat | #0f766e | While Loop |
| trycatch | shield-alert | #a81409 | Try / Catch |
| source | database | #1e6bb8 | Source Table |
| file | file-text | #1e6bb8 | File Format |
| query | filter | #0f766e | Query |
| case | split | #b45309 | Case |
| merge | merge | #0f766e | Merge |
| validation | shield-check | #15803d | Validation |
| tablecomp | git-compare | #7c3aed | Table Comparison |
| keygen | key | #7c3aed | Key Generation |
| mapop | arrow-right-left | #6b7280 | Map Operation |
| lookup | search | #7c3aed | Lookup Ext |
| sql | code | #334155 | SQL Transform |
| cleanse | wand-2 | #d97706 | Data Cleanse |
| match | check-check | #d97706 | Match |
| pivot | table-2 | #0f766e | Pivot |
| target | upload | #a81409 | Target Table |
| template | file-plus | #a81409 | Template Table |

### Properties panel (300px, fixed 600px, internal scroll)
Header: type icon + type label. Empty state copy:
*"Click an object's name to edit it here. Add objects from the rail on the right of the canvas."*

Body order:
1. **Name** input (mono).
2. Action buttons row: **Open** (child object), **Mapping editor** (nodes with a schema),
   **View data** (source / target / file / template → Data preview dock tab).
3. **Identifier chips** — read-only colored tags, one per identifier field:
   `table`, `lookupTable`, `returnCol`, `column`, `keys`, `compareCols`, `format` → blue;
   `datastore` (label rendered as **Connection**) and `format` → violet;
   `column`/`keys`/`compareCols`/`returnCol` → teal.
4. **Editable fields** per type (below).
5. **Rules** list for Validation nodes: rule column as a green mono tag, condition in muted text,
   and an action select (Send to Fail / Send to Pass / Send to Both).
6. **Delete object** — red ghost button.

Editable field sets (label · control):
- **source**: Connection*, Table*, Rows in staging, Where clause (textarea), Join rank, Cache (No/Yes), Array fetch size
- **file**: File format*, File path, Delimiter (Comma/Semicolon/Tab/Pipe), Skip rows, Rows
- **query**: From / join (textarea), Where (textarea), Group by, Order by, Distinct rows (No/Yes)
- **lookup**: Lookup table*, Condition (textarea), Return column*, Cache spec (PRE_LOAD_CACHE/DEMAND_LOAD_CACHE/NO_CACHE), Multiple match policy (MAX/MIN/FIRST/LAST), Default value
- **validation**: rules list only
- **mapop**: Normal / Insert / Update / Delete row becomes (NORMAL, INSERT, UPDATE, DELETE, DISCARD)
- **tablecomp**: Comparison table*, Input primary keys*, Compare columns*, Detect deletes (No/Yes), Comparison method (Sorted input / Row-by-row select / Cached comparison table)
- **keygen**: Table*, Generated key column*, Increment
- **target**: Connection*, Table*, Target type, Delete data before load (Yes/No), Bulk load (Yes/No), Rows per commit, Error handling (Use overflow file / Write to error table / Stop job), Overflow file
- **template**: Connection*, Template table*
- **script / conditional / whileloop**: code textarea (Script / If expression / While condition)
- **trycatch**: On exception (Log and continue / Re-raise / Skip work flow)
- **sql**: Connection*, SQL text (textarea) · **merge**: Note · **cleanse**: Cleansing package, Input fields
- **match**: Match criteria, Group posting (Best record / First record / All records) · **pivot**: Pivot columns, Header column

(*) = rendered as an identifier chip, not an input.

### Mapping editor (modal, dialog-lg)
Title: type icon + "Mapping — " + node name as a blue mono tag.
Two panes: **Input columns** (name + type) and **Output columns** (name as grey mono tag, type,
right-aligned expression preview; `unmapped` shown in `#a81409`). Selecting an output column
sets the Mapping tab target. Tab strip below: **Mapping · Select · From · Where · Group By · Order By**.
- Mapping tab: "Expression for <COL>" textarea + helper "Use input columns, global variables
  ($G_…) or custom functions."
- Other tabs edit `distinct`, `join`, `where`, `groupBy`, `orderBy` respectively.

### Run dialog ("Run <object>")
Grid of 4 fields: Run on (JS_DMS_01/JS_DMS_02), Environment (DEV_100/QSA_210/PRD_400),
Parallel streams, Monitor sample rate (s).
Options checkboxes: Enable recovery, Collect statistics, Use collected statistics, Log row counts,
Log transforms, Log session, Log SQL.
Variables table: variable as amber mono tag, type, editable value.
Actions: Cancel · Run.

### Execute (simulated engine, phase 1)
1. Topologically order the open object's nodes (Kahn; append unreachable nodes at the end).
2. For step `i`: at `i*460ms` mark the node **running**; at `i*460+380ms` mark it **done**.
3. Row maths: `rows = Σ upstream rows`, else the node's own `rows`, else
   `8000 + (nodeId.length*1373) % 52000`. Edges labelled `Fail` carry `max(1, round(rows*0.004))`.
   Validation and Table Comparison lose 0.4% (`round(rows*0.996)`).
4. A target whose type contains "Reject" and receives rows > 0 ends **Completed with rejects**
   (red dot) and writes an error-log line.
5. Monitor rows: object (blue mono tag), type, state tag, row count, elapsed `(0.4 + i*0.7)s`.
6. Trace log lines: `(HH:MM:SS) JOB: <name> started on <server> · config <env>`, the variables line,
   the parallelism/recovery line, then one line per object, then a completion line.
7. Persist a `runs` row + `run_log` rows so the Runs register and Job Monitor show the run.

### Check / validation rules
Produce `{severity, where, message}` and let a click select the offending node:
- **Error** — node with no input that is not source/file/script
- **Warning** — node with no output that is not target/template/script
- **Warning** — a `*_STG` source with no matching ingested table in the Staging Area
- **Error** — Query with output columns lacking a mapping expression
- **Error** — Target with no table selected
- **Warning** — Validation transform with no rules ("every row passes")
- **Warning** — empty job / work flow

### Dock panel (above the canvas)
Tabs: **Monitor · Trace log · Error log · Data preview** (active tab = blue pill, white text).
- Monitor: table as above; empty copy "No run yet — press Execute to run the open flow."
- Trace/Error: mono lines, error lines in `#a81409`.
- Data preview: header with the table name as a blue mono tag + "<n> columns · first 8 rows" +
  "Open full viewer"; then an 8-row table. Column sets are SAP-shaped per table
  (MARA → MATNR, MTART, MEINS, MATKL, BRGEW, LVORM; MAKT → MATNR, SPRAS, MAKTX; MARC → MATNR,
  WERKS, DISPO, EKGRP; GLT0 → BUKRS, RACCT, RYEAR, HSL01; XREF_MTART → XREF_ID, LEGACY_MTART,
  S4_MTART, WAVE; …). In the rebuild this must query Supabase for real staging rows
  (`select * from <staging table> limit 8`) with the prototype's generator as the fallback.

### Seeded content to reproduce
`JOB_MM_MATERIAL_MASTER`: `SCR_SET_GLOBALS → WF_00_INITIALIZE → WF_10_MATERIAL_BASIC →
IF_PLANT_IN_SCOPE –THEN→ WF_20_MATERIAL_PLANT → WF_90_RECONCILE` (`–ELSE→ WF_90_RECONCILE`).
`JOB_FI_GL_BALANCES`: `SCR_SET_FI_GLOBALS → WF_10_GL_BALANCES`.
Work flows: `WF_00_INITIALIZE` (SCR_CHECK_STAGING → TRY_CATCH_XREF → DF_XREF_LOAD),
`WF_10_MATERIAL_BASIC` (DF_MARA_BASIC → DF_MAKT_DESCRIPTION),
`WF_20_MATERIAL_PLANT` (DF_MARC_PLANT → DF_MARD_STORLOC),
`WF_90_RECONCILE` (DF_RECON_COUNTS → SCR_LOG_SUMMARY), `WF_10_GL_BALANCES` (DF_GL_BALANCE_LOAD).
`DF_MARA_BASIC` (the reference data flow):
`ECP_MARA_STG + ECP_MAKT_STG → QRY_JOIN_BASIC → LKP_MTART_XREF → VAL_MARA_MANDATORY
 –PASS→ MAP_OP_NORMAL → TC_MATERIAL → /1LT/DS_MATERIAL`, `–FAIL→ ERR_MARA_REJECTS`.
Exact field values for every seeded node are in `reference/Data Migration Solution v2.dc.html`
(search `dsGraphs:`) — use them for the seed script.
