# Fill handle (drag-to-extend + Ctrl+D/Ctrl+R)

**Status:** Approved design (2026-07-01)
**Component:** `src/components/DataGrid/` (the reusable `DataGrid`, generic over `TData extends object`)
**Scope:** Grid-mode cell editing — extending an existing `cellSelection` range's values into adjacent cells.

## Problem

The grid already supports rectangular cell-range selection (`features.cellSelection`,
`DataGrid.tsx:152/384`) and clipboard paste through the validated edit pipeline
(`pasteTextIntoCell`, `DataGrid.tsx:2376-2434`, wired to Ctrl/Cmd-V at `DataGrid.tsx:2489-2494`).
What's missing is the spreadsheet-standard **fill handle**: dragging a small handle at the
corner of a selection to replicate its values into adjacent cells, plus the keyboard
equivalents (`Ctrl+D`/`Ctrl+R`). Today the only way to replicate a value across many cells is
copy-then-paste, which requires leaving the selection to invoke the OS clipboard.

An earlier survey of the codebase incorrectly assumed paste didn't exist either; it does, and
is fully tested. This design is scoped to the genuinely missing piece: the drag/keyboard fill
interaction and its constant-value (tiling) semantics.

## Goals

- Drag a handle from the bottom-right corner of the current `cellSelection` (or focused cell)
  down/right to replicate its value(s) into the cells passed over.
- `Ctrl+D` (fill down) / `Ctrl+R` (fill right) provide a fully keyboard-operable equivalent
  over an existing multi-row/multi-column selection — required, not optional, given the
  project's stated WCAG 2.1 AA target and the fact that a drag-only feature would be
  unreachable by keyboard users.
- A single **tiling** rule handles both "replicate one cell's value" and "repeat an N×M
  block's pattern" as the same code path (modulo indexing), so no special-casing single- vs
  multi-cell sources.
- Reuse the existing validated-edit contract: each target cell runs through
  `computeEditError`/editability checks before being included, and valid edits flow through
  `onCellEdit` exactly like paste and inline editing — the grid still never mutates `data`.

## Non-goals

- **No pattern/sequence detection.** No numeric increment (1,2,3→4,5,6), no date increment,
  no text-suffix increment. Fill is pure constant/tile replication. (Documented follow-up if
  ever needed — not built here.)
- **No drag up/left.** Only down and right, matching the most common fill-handle convention
  and avoiding anchor-math complexity for a rarely-used direction.
- **No skip-feedback UI.** A target cell that fails validation or isn't editable is silently
  skipped, identical to today's `pasteTextIntoCell` behavior (`DataGrid.tsx:2410`,
  `:2416-2418`, `:2420-2422`). Surfacing skipped-cell counts is a separate, documented
  follow-up (originally flagged alongside paste in the broader enterprise-gap review) —
  intentionally out of scope here to keep this change shippable.
- **No touch/pointer-event support.** Matches existing precedent: the column-resize handle
  (`header.getResizeHandler()`, `DataGrid.tsx:3399`) and the existing range-selection drag
  (`onMouseDown`/`onMouseEnter`, `DataGrid.tsx:2878-2903`) are both mouse-only. Not a
  regression introduced by this feature.
- **No pivot-mode support.** `cellSelectionEnabled` is already `false` in pivot
  (`DataGrid.tsx:2261`); the fill handle follows the same gate.

## Design

### 1. Feature flag

Add `fillHandle: boolean` to `DataGridFeatures` (`DataGrid.tsx:127`-ish, alongside
`cellSelection` at `:152`) and `fillHandle: true` to `defaultFeatures` (`:384` region),
following the exact pattern `headerToolsOnDemand` used (`:164`, `:388`). A derived
`fillHandleEnabled = features.fillHandle && cellSelectionEnabled` constant (next to
`cellSelectionEnabled` at `:2261`) is the single gate every piece of new code checks — mirrors
how `cellSelectionEnabled` itself already folds in `!isPivotLayout`.

### 2. New selection/drag state

Alongside the existing `cellSelection` state and `isSelectingCellsRef` (`:2262`, and the ref
declared near the `stopSelecting` effect at `:2308-2313`), add:

- `isFillDraggingRef` (a `useRef<boolean>(false)`, same shape as `isSelectingCellsRef`) —
  distinguishes a fill-drag from a range-select drag so the existing `onMouseEnter` handler
  can branch.
- `fillPreview: DataGridCellRange | null` state — the in-progress preview rectangle, cleared
  on commit or on the same document-level `mouseup` listener that already stops range-select
  dragging (`:2308-2312`, extended to also read/reset `isFillDraggingRef`).
- `fillSourceRef` (a `useRef<DataGridCellRange | null>`) — captured at drag start; the
  normalized `cellSelection` at that moment (or a synthetic 1×1 range built from
  `focusedCell` when no range is active).

### 3. Handle rendering

A small square element (`data-fill-handle`, ~6×6px, `cursor-crosshair` or similar), rendered
only when `fillHandleEnabled` and a selection/focus target exists, absolutely positioned at
the bottom-right corner of the **last cell** in the normalized `cellSelection` (or the
focused cell). It attaches to the same `<td>` render path as the existing
`data-cell-selected` attribute (`:2925`) — added as one more conditional attribute/child on
that cell, not a separate render pass, so it inherits the existing pinned-column and
virtualization positioning for free.

`onMouseDown` on the handle:
```
event.stopPropagation();       // do not also trigger the cell's own onMouseDown (range-select)
fillSourceRef.current = normalizeCellRange(cellSelection) ?? syntheticRangeFromFocusedCell();
isFillDraggingRef.current = true;
```

### 4. Drag extend (reuses the existing per-cell `onMouseEnter`)

The existing handler at `:2894-2903` currently only branches on `isSelectingCellsRef`. Add a
second branch:
```
onMouseEnter={
  isNavCell && (cellSelectionEnabled || fillHandleEnabled)
    ? (event) => {
        if (isFillDraggingRef.current && event.buttons === 1) {
          setFillPreview(clampToDownRight(fillSourceRef.current, { rowId: row.id, columnId: cell.column.id }));
          return;
        }
        if (isSelectingCellsRef.current && event.buttons === 1) {
          extendCellSelection({ rowId: row.id, columnId: cell.column.id });
        }
      }
    : undefined
}
```
`clampToDownRight(source, hovered)` is a small pure helper (colocated near
`normalizeCellRange`, `:2266`): computes the rectangle from `source`'s bottom-right corner to
`hovered`, clamped so it never extends above `source`'s top row or left of its left column
(a hover above/left of the source collapses the preview to the source itself — no-op fill).

### 5. Visual preview

Cells inside `fillPreview` but outside the original `fillSourceRef` range get a
`data-fill-preview="true"` attribute (dashed outline via CSS, additive to the existing
`data-cell-selected` styling) — same computation shape as `isCellRangeSelected`
(`:2840`), just against `fillPreview` instead of `cellSelection`.

### 6. Commit (`commitFill`)

Triggered by `mouseup` (drag path) or `Ctrl+D`/`Ctrl+R` (keyboard path, see §7). Colocated near
`pasteTextIntoCell` (`:2376`) as a sibling function of the same style/size — not extracted to
a new module; flagged for extraction only if it grows past that function's scope.

```ts
const commitFill = (source: DataGridCellRange, target: DataGridCellRange) => {
  if (!features.editing || !onCellEdit) return;
  const sourceRowIds = /* rowIds within source, via navRowIds slice */;
  const sourceColumnIds = /* columnIds within source, via navColumnIds slice */;
  const targetRowIds = /* rowIds within target */;
  const targetColumnIds = /* columnIds within target */;
  const edits: DataGridCellEdit<TData>[] = [];
  targetRowIds.forEach((targetRowId, rowOffset) => {
    const targetRow = rowById.get(targetRowId);
    if (!targetRow) return;
    targetColumnIds.forEach((targetColumnId, colOffset) => {
      const columnConfig = columnsById.get(targetColumnId);
      if (!columnConfig || !isCellEditable(targetRow, targetColumnId)) return;
      // Tiling: same formula handles 1x1 source ("replicate a constant") and
      // NxM source ("repeat the block") without special-casing either.
      const sourceRowId = sourceRowIds[rowOffset % sourceRowIds.length];
      const sourceColumnId = sourceColumnIds[colOffset % sourceColumnIds.length];
      const sourceRow = rowById.get(sourceRowId);
      if (!sourceRow) return;
      const value = (sourceRow.original as Record<string, unknown>)[sourceColumnId];
      const targetOriginal = targetRow.original as TData;
      if (computeEditError(columnConfig as unknown as EditCellColumn<TData>, value, targetOriginal)) {
        return; // skip, consistent with pasteTextIntoCell's :2420-2422 semantics
      }
      edits.push({
        rowId: targetRow.id,
        row: targetOriginal,
        columnId: targetColumnId,
        value,
        previousValue: (targetOriginal as Record<string, unknown>)[targetColumnId],
      });
    });
  });
  edits.forEach((edit) => onCellEdit(edit));
};
```

Key difference from `pasteTextIntoCell`: the source is **already-typed data** (read via
`sourceRow.original[sourceColumnId]`), not clipboard text, so there is no `parseEditValue`
step — only the `computeEditError` validation gate applies. This is the one deliberate
asymmetry with the paste path and is called out here so a future reader doesn't "fix" it into
a redundant parse.

After commit, `mouseup` clears `isFillDraggingRef`/`fillPreview` and sets `cellSelection` to
the union of `source` + `target` (mirrors spreadsheet convention: the filled result stays
selected).

### 7. Keyboard fill (`Ctrl+D` / `Ctrl+R`)

In `onCellKeyDown` (`:2464`), alongside the existing `ctrl` + `c`/`v` branches
(`:2478-2495`): when `fillHandleEnabled` and the normalized `cellSelection` spans more than
one row (`Ctrl+D`) or more than one column (`Ctrl+R`), call `commitFill` with:
- `Ctrl+D`: source = the selection's **top row**, target = the remaining rows.
- `Ctrl+R`: source = the selection's **left column**, target = the remaining columns.

Both route through the identical `commitFill` used by drag — no parallel implementation.
No-op (falls through to existing handling) when `fillHandleEnabled` is false, the selection
is a single cell, or `Ctrl+D`/`Ctrl+R` doesn't apply to the current selection shape.

## Data flow

1. User drags the fill handle or presses `Ctrl+D`/`Ctrl+R` over an existing `cellSelection`.
2. A source range (existing selection, or its top row / left column for the keyboard path)
   and a target range (preview rectangle, or the selection's remaining rows/columns) are
   computed.
3. `commitFill` tiles source values onto target cells via modulo indexing, validates each via
   the existing `computeEditError`, and skips invalid/non-editable targets — identical
   semantics to `pasteTextIntoCell`.
4. Valid edits batch into `onCellEdit` calls, same contract as paste and inline editing — the
   grid never mutates `data`; the consumer applies the edits and re-renders with new `data`.
5. `cellSelection` updates to the union of source+target so the result is visibly selected.

## Error handling & edge cases

- **Non-editable target cell** (`isCellEditable` false, e.g. `enableEditing: false` on that
  column or row): skipped, matching `pasteTextIntoCell`'s existing behavior — no error thrown,
  no `onCellEdit` call for that cell.
- **Validation failure** (`computeEditError` returns a message): skipped, same as above.
- **Fill preview never leaves the source range** (e.g. mouse released without moving, or
  `Ctrl+D` on a single-row selection): `commitFill` is not called — no-op, not an error.
- **Hover above/left of the source during drag**: `clampToDownRight` collapses the preview to
  the source itself (down/right-only invariant); releasing there is a no-op.
- **Virtualized rows**: `commitFill` operates over `navRowIds`/`rowById` (the full row model),
  not the rendered/windowed subset — identical to how `pasteTextIntoCell` already handles
  virtualization-safe row lookups (`:2401-2402`). No special handling needed.
- **Server mode (`dataMode="server"`)**: no branching required — `commitFill` only reads
  already-loaded row data and emits `onCellEdit`, exactly like paste; server mode has no
  server-side concept of "fill" to reconcile.

## Testing plan (test-first)

New `describe("DataGrid fill handle")` block, added to `DataGrid.editing.test.tsx` initially
(reusing that file's `makeData`/`cellOf`/`onCellEdit` fixtures and the mouse-drag pattern
already exercised by the "pastes a TSV matrix into a selected cell range" test at `:287-320`);
split into a dedicated `DataGrid.fillHandle.test.tsx` if it grows past ~6-8 cases, matching the
project's per-concern test-file convention.

- Handle renders (`[data-fill-handle]` present) only when `features.fillHandle` and
  `features.cellSelection` are both on and a cell is focused/selected; absent when either flag
  is off.
- Drag from a single cell down 3 rows replicates its value into the 3 new cells — `onCellEdit`
  called 3× with the same `value`, each with the correct `rowId`/`previousValue`.
- Drag from a 2-row selection down 4 rows tiles the pattern (new rows 3 and 4 mirror rows 1
  and 2 respectively) — proves the modulo tiling formula for N>1 sources.
- Drag right from a single cell across 2 columns replicates the value into both.
- `Ctrl+D` over a 3-row selection fills the top row's values into rows 2-3.
- `Ctrl+R` over a 3-column selection fills the left column's values into columns 2-3.
- A non-editable target cell within the fill range is skipped (no `onCellEdit` call for it),
  while sibling valid cells in the same fill still commit.
- A target cell that fails `computeEditError` is skipped the same way.
- Fill is a no-op (no `onCellEdit` calls, no state change) when `features.fillHandle` is
  false, `features.editing` is false, or the source/target range doesn't expand (e.g.
  `Ctrl+D` on a single-row selection).
- After a successful drag-fill, `cellSelection` covers the union of source and filled cells
  (asserted via `data-cell-selected` on the new cells, matching the existing assertion style
  at `:320` in the paste test).

## Files touched

- `src/components/DataGrid/DataGrid.tsx` — `fillHandle` feature flag + default;
  `fillHandleEnabled` derived constant; `isFillDraggingRef`/`fillPreview`/`fillSourceRef`
  state; `clampToDownRight` helper near `normalizeCellRange` (`:2266`); handle rendering and
  extended `onMouseEnter` in the `<td>` render (`:2860-2925` region); `commitFill` sibling to
  `pasteTextIntoCell` (`:2376`); `Ctrl+D`/`Ctrl+R` branches in `onCellKeyDown` (`:2464`).
- `src/components/DataGrid/DataGrid.editing.test.tsx` — new `describe("DataGrid fill handle")`
  block (or extracted to a new `DataGrid.fillHandle.test.tsx`, see Testing plan).
- `src/index.css` / `src/styles.css` — `[data-fill-handle]` and `[data-fill-preview]` styling
  (dashed outline, small square), added to both the demo and precompiled library stylesheets,
  following the existing dual-file pattern noted for flash-on-change keyframes in CLAUDE.md.
- `CLAUDE.md` — extend the "Keyboard cell navigation & editing" bullet with the fill-handle
  gating (`features.fillHandle`) and the `Ctrl+D`/`Ctrl+R` shortcuts, once implemented.
- `CHANGELOG.md` — `### Added` entry, once implemented.
