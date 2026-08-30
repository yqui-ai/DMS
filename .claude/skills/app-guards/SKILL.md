---
name: app-guards
description: The cross-cutting safety rules in DMS — unsaved-change guards, destructive-action confirmation, input validation and type checks, and where each is enforced. Load this before adding a form, an editable surface, a delete, or anything that can lose someone's work. UPDATE THIS FILE whenever a guard is added, moved or corrected.
---

# App guards

The rules that stop the app losing or corrupting someone's work. They are cross-cutting on purpose:
each one is enforced in ONE place so a new screen inherits it instead of re-deciding it.

**Whenever a guard is added, moved, relaxed or corrected, update this file in the same change.** A
guard nobody can find is a guard the next screen won't have.

## 1. Unsaved changes

`<UnsavedChangesGuard when={dirty} what="…" />` — `src/components/UnsavedChangesGuard.tsx`.

Mount it wherever a component holds edits that aren't saved yet. Two mechanisms, because neither
covers both cases:

- `useBlocker` intercepts **in-app route changes** and asks in the app's own `ConfirmDialog`.
- `beforeunload` covers **leaving the site** — closing the tab, reloading, an external link.

**The browser ignores custom `beforeunload` text.** That's a deliberate anti-abuse rule; don't try
to work around it. The `what` prop is for the in-app dialog only.

### Rules

- **`Dialog`'s `unsavedWarning` is not enough on its own.** It only covers closing *that dialog* —
  Escape, the X, a click outside. It cannot see the sidebar, the breadcrumb, browser Back or a
  reload, and those are how an edit actually gets lost: you look something up mid-sentence and the
  sentence is gone when you come back. A dirty surface needs both.
- **Prefer a comparison to a flag.** `name !== savedName` is right; a `setDirty(true)` sprinkled
  through handlers gets forgotten, and it calls "typed a change then typed it back" dirty.
- **The guard releases itself** when `when` goes false (after a save), so it can't ask about changes
  that no longer exist.

### Where it is mounted

| Surface | Dirty when |
|---|---|
| `GoldenFmdDesignerDialog` | `dirty` — structure edited, not saved as a version |
| `GoldenXrefDesignerDialog` | `dirty` — same |
| `GeneratedFmdTableView` → `CellEditorDialog` | `draft !== value` |
| `AddReviewPointDialog` | the note body is non-empty |
| `MyProfilePage` | `name !== savedName` |
| `ProgramSettingsPage` | `editing` — a whole draft of the programme tree is in memory |
| `ConvertHistoricalFmdWizard` | a file is picked, or reviewed updates aren't saved |
| `FieldDetailView` | any cell has typed-but-uncommitted text, or an AI SQL draft is unaccepted |

### Commit-on-blur is NOT the same as "nothing to lose"

I originally left the field-level view unguarded on the reasoning that its cells commit on blur, so
there could be no unsaved state. That was wrong, and it is the mistake to avoid repeating: a rule
you are **halfway through typing has not blurred yet**, and navigating away takes it with you. An
AI-drafted rule nobody has accepted is unsaved for the same reason.

The draft text lives in the input component's own state, so the guard cannot see it unless that
component says so. `EditableValue` takes an `onDirtyChange` callback and `FieldDetailView` keeps a
Set of dirty field names — a Set, because several cells in one section can be part-typed at once.
Its cleanup fires on unmount and on leaving edit mode, so a stale "dirty" can never be left behind.

**Apply the same reasoning to any editor that commits on blur.** The grid cells in
`GeneratedFmdTableView` have the identical exposure and are covered by the same pattern via the
cell dialog; a new one must report its own uncommitted text too.

### Most abandonment is NOT navigation

`UnsavedChangesGuard` uses `useBlocker`, which only sees the ROUTER. Switching tab inside a dialog,
opening a different field, prev/next, changing structure, closing the dialog — all plain `setState`,
none of them navigation, none of them interceptable by any navigation API. I shipped the guard twice
before this landed; the second attempt still did nothing, because every way to abandon an FMD edit
is an in-app state change.

**`useUnsavedGate(dirty, what)`** (`src/components/useUnsavedGate.tsx`) is for those. Wrap the
handler — `onClick={gate(() => setTab('versions'))}` — and render its `dialog`. When nothing is
dirty the action runs straight through, so guarding a usually-clean control costs one comparison.

Gated today: the FMD dialog's five tab buttons and its close button; the field view's Back, prev/next
and structure picker. **A new control that leaves an editable surface must be gated too — mounting
`UnsavedChangesGuard` does not cover it.**

### Cancel must call off the commit that its own click causes

Clicking Cancel BLURS whichever input has focus, and in a commit-on-blur editor blur is what
saves. So Cancel triggers the very write it is meant to undo, then races its own revert.

Two rules, both needed:

- **Set a cancelling flag on `onMouseDown`, not `onClick`** — mousedown fires before the blur. It
  has to be a `useRef`: the blur handler reads it in the same tick the click sets it, and a state
  update would not have landed. `EditableValue.commit` bails when the flag is set.
- **Revert every snapshotted field unconditionally.** Comparing against the row from the render
  closure reads the value from BEFORE the editing session, so the field just changed looks
  unchanged and gets skipped — precisely the one that needed reverting. A write matching what is
  already stored costs nothing, because `saveField` drops a change whose `from` equals its `to`.

## Select all / deselect all

One control that switches, never a pair — `<SelectAllToggle allSelected … />`. Half of any such pair
is always a no-op ("Select all" does nothing when everything is already selected), and two buttons
side by side ask the reader to work out which one applies.

`allSelected` is the caller's own comparison, because only the caller knows what "all" means — the
whole list, or just the rows a filter left visible. A toggle that ignored an active filter would be
lying about what it is about to do.

### Where editing is allowed

`canEditSelected` in `FmdVersionHistoryDialog` is the single derivation BOTH editable surfaces read
— the grid and the field-level view — so they cannot drift apart:

    showingDraft || selected.id === latest.id

That is: the newest version, **published or not**, plus the pending-edits overlay.

- **The live version stays editable.** That is how a draft gets started; locking it would leave a
  published FMD with no way back into editing at all.
- **Older versions are not editable**, and the reason is stronger than "they're frozen":
  `saveField` always writes against the NEWEST version. An edit made while reading an older one
  would not touch what is on screen — it would silently change content the editor cannot see.
- A DB trigger rejects content changes to a published version regardless of what the UI allows, so a
  wrong gate can still never rewrite a release.

Do not give the grid a narrower rule than the field view. I tried that once, reasoning that bulk
Tab-to-commit shouldn't open a draft off a release; it just made the two surfaces disagree about the
same version for no benefit the user could see.

## 2. Destructive actions

- **`ConfirmDialog` for anything hard to reverse** — publishing (freezes a version permanently),
  discarding a section's edits, deleting a field that carries data.
- **Say what is lost, in numbers.** "Discards 12 populated rows", not "are you sure?".
- **Golden and Standard FMDs can never be deleted.** No delete action may be added for either.
- **Archive, unless it is empty.** 0041 blocks DELETE on the hierarchy because a hard delete once
  cascaded away a subproject entire. That rule protects what is BELOW a record, so it has nothing
  to say about a record with nothing below it — archiving an empty project made by a typo only
  moves the typo into the archive. `dms_delete_empty` (0055) decides emptiness server-side and
  refuses by NAME ("This still has scope objects — archive it instead"); the row menu offers Delete
  **or** Archive, never both. Never decide emptiness on the client: the hierarchy tree carries
  children but not scope rows, FMDs or rules, so a check there is a guess. A program owning
  catalogue rows is never deletable — `migration_objects` cascades from it.
- **Baseline Golden fields can't be removed OR renamed** (`goldenFmdRequiredFields.ts`). A rename is
  a removal by another route, so the name input is `readOnly` in place rather than rejected on save
  — finding out at save time costs every edit made after it.

## 2b. Dialogs that act on a target — reset, and validate against what's on screen

Every dialog in this app is **rendered unconditionally** and controlled by a nullable target prop
(`object`, `target`, `entry`, `fmd`). That is the convention and it stays — but it means the
component **never unmounts between targets**, so any `useState` inside it survives the switch.

**Two rules, and the second is the one that matters.**

1. **Re-seed every piece of per-target state when the target changes.** Either a `useEffect` keyed
   on the target's id (`AddReviewPointDialog`, `GenerateFmdDialog`) or a render-time
   `if (target.id !== seededFor)` reset (`AssignFmdDialog`, `PlantDialog`, `AssignPlantsDialog`).
   Not doing this shows the previous record's values against the new one's name.

2. **Validate the selection against the currently loaded options before writing it.** The reset is
   the cause; this is the backstop. A selection is only actionable if it is in the list this target
   was actually offered — check it in the button's `disabled` **and** again in its `onClick`, so a
   selection cannot survive the list changing underneath it.

This is not hypothetical. `AssignFmdDialog` held `picked` across targets: choosing an FMD for
`SIF_CUSTOMER_2`, closing, then opening `SIF_CUST_EXT_TH` left the old id selected. That object's
candidate list was empty — the dialog said *"No Field Mapping exists for this object yet"* — and
Assign was still enabled, so it wrote `FMD_PROJX_SIF_CUSTOMER_2` onto an unrelated object. A wrong
foreign key, written silently, from a dialog that was simultaneously telling the user there was
nothing to assign.

Anything that writes a foreign key from a user selection gets rule 2. A state bug should not be
able to reach the database.

## 3. Input validation

One function decides what a value may be, so the editor and the review can never disagree:

- **`valueTypeError(column, value)`** (`mappingRulePolicy.ts`) — checks a value against the kind and
  value list its Golden column declares. Used by the field-level editor, the grid cell, the expanded
  cell dialog **and** the mapping review.
- **Refuse at the keystroke, not at the review.** A bad value never reaches the draft, so there is
  nothing to find later and nothing to undo.
- **`optionsOf(column)`** re-parses stored value lists on read, repairing lists saved before
  `parseValueList` accepted semicolons. Read options through it, never `column.options` directly.
- **A value already in a cell that isn't on the list stays selectable.** Opening an editor must
  never silently rewrite data; the review is what flags it.

## 4. Version and draft safety

See `library-section-design` for the full model. The guards specifically:

- **One unpublished version per FMD.** Editing folds into the open draft; Golden sync folds into it
  too. Two unpublished rows means only the newest can ever be published and the other is unreachable
  work.
- **Allocate version numbers from the HIGHEST existing version**, not the newest published one.
  They differ whenever an unpublished version sits above the live one, and bumping from the
  published one produces a number that already exists — `unique (fmd_id, version)` then rejects the
  publish outright.
- **Read the newest version from the DATABASE before writing**, never from what the viewer had
  selected. A stale selection must not rebuild content over newer work.
- **A published version is frozen by a DB trigger**, not just by UI. Anything added under `sheets`
  that isn't mapping content must be stripped in that trigger too.

## 5. Navigation safety

- **Deep views are routes**, so Back closes them (`library-section-design`).
- **Never re-select a previous id to go "back"** — each hop is a real history entry, so that pushes
  a third one. Take an `onBack` and call `navigate(-1)`.
- **Whatever opens a view owns the way back**, and the label must name the real destination
  (`backLabel` on `FieldDetailView`).

## 6. Dismissable popovers

**Every dropdown, menu and popover uses `useDismiss` (`src/components/useDismiss.ts`).** No
exceptions and no hand-rolled effects — that is exactly how the app ended up with four header
dropdowns that never closed (two could be open at once, overlapping) beside three that each
implemented the same listener slightly differently, only one of which handled Escape.

```tsx
const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false));
return <div ref={ref} className="relative">…trigger…{open && <div>…panel…</div>}</div>;
```

Rules that are easy to get wrong:

- **The ref goes on the wrapper containing BOTH trigger and panel.** On the panel alone, clicking
  the trigger to close reads as an outside click, so it closes and instantly reopens.
- **`mousedown`, not `click`.** A click fires after mouseup, so a menu closing on click is still
  open while the press lands on whatever is underneath it.
- **Escape closes too**, and the hook does it for you.
- Pass a dismiss function that does the *full* close. `GlobalSearch` also clears the query and blurs
  the input — Escape leaving it closed-but-focused is not closed.

Covered today: `AppSwitcher`, `SubprojectSwitcher`, `EnvPill`, `AvatarMenu`, `GlobalSearch`,
`MultiSelectFilter`, `GeneratedFmdTableView`'s `IconPopoverButton`. Native `<select>` (the shared
`Select`) needs nothing — the browser owns it. Always-visible overlays like the dependency diagram's
legend are not popovers.
