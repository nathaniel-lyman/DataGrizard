# Column virtualization

**Date:** 2026-07-20
**Status:** Approved design, pre-implementation

## Problem

The grid renders every visible leaf column for every rendered row. Row
virtualization (`virtualizeRows`) bounds the row count, but a wide column set —
especially pivot mode, where column-axis buckets × measures can generate
hundreds of `measure:*` columns — still renders every `<td>` in every windowed
row. React reconciliation cost grows linearly with column count and makes wide
pivots sluggish. AG Grid windows columns; DataGrid should too.

## Public API

One new flat prop, exactly parallel to `virtualizeRows`:

| Prop | Type | Default | Meaning |
| --- | --- | --- | --- |
| `virtualizeColumns` | `boolean` | `false` | Window unpinned center columns to the horizontal viewport. |

- Works in both `layoutMode="grid"` and `"pivot"`. Card layout ignores it
  (no table is rendered there).
- Column overscan is a fixed internal constant (4 columns), matching how row
  overscan (12) is internal today. No overscan prop (YAGNI).
- `aria-colcount` and per-cell `aria-colindex` continue to reflect the **full**
  visible leaf set — windowing does not change accessibility semantics.
- Export, clipboard, summaries, filters, and selection are data-driven and
  unaffected by what happens to be rendered.
- Zero breaking change: with the prop unset, the render path is unchanged.

## Windowing architecture

A second `useVirtualizer` (from the already-bundled `@tanstack/react-virtual`)
with `horizontal: true`, sharing the existing `scrollRef` scroll element with
`rowVirtualizer`:

- `count` = number of **unpinned center** visible leaf columns. Pinned
  left/right columns always render (pin-aware windowing, AG Grid convention);
  their sticky offsets (`getStart("left")` / `getAfter("right")`) are computed
  from the pinned set only, so they are unaffected by windowing.
- `estimateSize: (i) => centerColumns[i].getSize()` — exact, because widths
  come from the `columnSizing` slice; no `measureElement` pass is needed.
- `enabled: virtualizeColumns && !isCardMode`.
- A `useEffect` calls `columnVirtualizer.measure()` whenever `columnSizing`,
  column order, or column visibility change, so drag-resizes and
  autosize/fit re-window with correct offsets.

### Pure helpers: new sibling `columnVirtual.ts`

Following the `gridHelpers.ts` / `cellEffects.ts` pattern (pure logic in
siblings, engine orchestrates), three pure functions:

- `partitionLeafColumns(visibleLeafColumns)` → `{ left, center, right }`
  arrays, split by `column.getIsPinned()`.
- `computeColumnWindow(virtualItems, centerColumns, totalCenterWidth)` →
  `{ renderedCenterColumns, leftSpacerWidth, rightSpacerWidth }`. Spacer
  widths are `virtualItems[0].start` and
  `totalCenterWidth - virtualItems[last].end` (the same math the row path
  uses vertically).
- `clipHeaderGroups(headerGroups, renderedLeafIds)` → per header row, each
  band header's `colSpan` clipped to the count of its rendered leaves; bands
  with zero rendered leaves are dropped. Leaf-level header rows pass through
  filtered to rendered leaves.

All three take plain data in and return plain data out — unit-testable in
jsdom without mocking the virtualizer.

## Rendering

When windowing is active, every column-aligned table section renders the same
five-part sequence: pinned-left cells → one left spacer → windowed center
cells → one right spacer → pinned-right cells. Spacers are omitted when their
width is 0.

- **`<colgroup>`** (the width authority under `table-layout: fixed`):
  pinned-left `<col>`s → spacer `<col style={{width: leftSpacerWidth}}>` →
  windowed center `<col>`s → right spacer `<col>` → pinned-right `<col>`s.
- **Header rows** (`DataGridHeader`): band rows use `clipHeaderGroups`; leaf
  header rows and the floating-filter row render only pinned + windowed
  columns with spacer `<th>`/`<td>`s (`aria-hidden="true"`, zero padding /
  border, matching the row-spacer idiom in `DataGridBody.tsx`).
- **Body rows**: `row.getVisibleCells()` is filtered to pinned + windowed
  columns, with spacer `<td>`s. Full-width single-cell rows (group toggle
  rows, the summary row, detail-panel rows) keep their existing
  full-leaf-count `colSpan` and are not windowed.
- **Composition with `virtualizeRows`**: both spacer systems coexist. Row
  spacer `<tr>`s keep spanning `bodyColSpan` (full leaf count) as today.

## Subsystem interactions

- **Keyboard cell navigation** (`useCellFocus`): moving focus to a column
  outside the window (arrows, Home/End, Ctrl+Home/Ctrl+End, Tab during edit)
  calls `columnVirtualizer.scrollToIndex(centerIndex)` and focuses the cell
  via the same deferred-focus mechanism the hook uses for virtualized rows —
  focus geometry is computed from the full column list, never from what is
  rendered.
- **Fill handle / cell-range selection**: commit paths (`commitFill`,
  Ctrl+D/Ctrl+R) operate on data coordinates and are unaffected. Pointer-drag
  extension only reaches rendered cells — the same accepted limitation row
  virtualization has today.
- **Column resize**: the drag handle lives on a rendered header; the
  `measure()` effect above keeps offsets true during and after a resize.
- **`flashOnChange`**: already virtualization-safe (grid-level previous-value
  map diffed on `data`, not on mount/unmount) — no change.
- **Pivot**: windowing operates on the post-reconciliation visible leaf set,
  so generated row-label / `measure:*` / subtotal / grand-total columns need
  no special handling. `pivot:rowLabel` is typically pinned left and thus
  always rendered.
- **Server mode / pagination**: orthogonal — windowing is purely presentational.

## Error handling / edge cases

- Zero center columns (everything pinned or hidden): virtualizer count is 0,
  no spacers, layout identical to today.
- Window narrower than one column: the virtualizer always yields at least the
  column at the scroll offset; overscan pads the rest.
- jsdom (zero-size scroll element): virtual items are empty; tests drive the
  window through mocked `getBoundingClientRect`/scroll offsets, mirroring the
  existing `DataGrid.virtual.test.tsx` setup.

## Testing (test-first)

- **Unit** (`columnVirtual.test.ts`): `partitionLeafColumns` split;
  `computeColumnWindow` spacer math (start/middle/end of scroll range, empty
  window); `clipHeaderGroups` colSpan clipping incl. band fully outside the
  window and band straddling the window edge.
- **Integration** (`DataGrid.columnVirtual.test.tsx`, mirroring the row
  virtual test's jsdom scroll mocking): only windowed + pinned columns render;
  pinned columns render at both scroll extremes; colgroup spacer widths sum to
  the hidden columns' widths; band header colSpan matches rendered leaves;
  keyboard nav to an offscreen column scrolls it into view and focuses it;
  pivot measure columns window; `virtualizeColumns` off → full column render
  (regression guard).
