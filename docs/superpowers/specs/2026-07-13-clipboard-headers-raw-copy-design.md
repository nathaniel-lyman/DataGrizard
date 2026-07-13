# Clipboard copy-with-headers and raw-value copy

**Date:** 2026-07-13
**Status:** Approved design, pre-implementation

## Problem

The DataGrid's Ctrl/Cmd-C copy (`features.clipboard`) always serializes cells as
*formatted display text* via `getCellText` → `getColumnSearchText`, and never
includes column headers. Copying a percent cell yields `"23%"`, a currency cell
`"$1,200.00"` — text that spreadsheets treat as strings or re-parse lossily.
Consumers need (1) a way to copy the underlying values so numerics land in
Excel as numbers (a percent stored as `0.23` should paste as `0.23`, which
Excel renders as 23% under percent formatting), and (2) an option to include a
header row.

## Public API

Two new flat props on `DataGrid` (types exported through
`src/components/DataGrid/index.ts`), following the existing flat-prop
convention (`locale`, `currency`, `dateFormat`, `facetThreshold`):

| Prop | Type | Default | Meaning |
| --- | --- | --- | --- |
| `clipboardValueMode` | `"formatted" \| "raw"` | `"formatted"` | What Ctrl/Cmd-C serializes per cell. |
| `clipboardIncludeHeaders` | `boolean` | `false` | When true, plain Ctrl/Cmd-C prepends a header row. |

Keyboard: **Ctrl/Cmd-Shift-C always copies with headers**, regardless of
`clipboardIncludeHeaders` (AG Grid convention). Value mode still follows
`clipboardValueMode`. Plain Ctrl/Cmd-C behavior is unchanged unless a prop is
set — zero breaking change.

Both props are inert when `features.clipboard` is off, exactly like the
existing copy path.

## Raw serialization

New `getCellRawText(row, column)` in `useCellRangeInteractions.ts`, beside the
existing `getCellText`. Rules, dispatched on the column config's `dataType`:

- `number` / `currency` / `percent`: `String(value)` for finite numbers;
  non-finite or non-numeric → empty string (parallel to the formatter's
  no-`$NaN` rule). Percent emits the stored fraction (`0.23`), not the
  display number (`23`), so spreadsheet percent formatting round-trips.
- `date`: ISO 8601 via the existing `toDate` helper
  (`src/utils/formatters.ts`); unparseable → empty string.
- `status` / `text` / `boolean` and unknown types: `String(value)`.
- `null` / `undefined`: empty string.
- `formatValue` overrides are **ignored** in raw mode by definition.
- Pivot rows: unchanged from today (`String(value)`; measure values are
  already raw numbers).

## Header row

Header label resolution, in order: `columnConfig.header` (a plain `string` in
`GridColumnConfig`) → `columnDef.header` when it is a string (covers generated
pivot row-label/measure columns) → the column id. Headers are always plain
text in both value modes.

The header row follows whichever column set the copy matrix used, which
`copyFromCell` already computes:

1. rectangular cell range → the range's `columnIds`;
2. selected rows → visible non-synthetic leaf columns;
3. single focused cell → that one column.

## Wiring

- `copyFromCell(row, columnId)` gains an options argument
  `{ includeHeaders: boolean }` and consults `clipboardValueMode` when
  building the matrix (choosing `getCellText` vs `getCellRawText`).
- The Ctrl/Cmd-C branch in `onCellKeyDown` passes
  `includeHeaders: clipboardIncludeHeaders || event.shiftKey`. Today the
  branch matches plain `c` with ctrl/meta; it must accept the Shift variant
  instead of falling through.
- The ARIA-live announcement keeps counting **data cells only** (the header
  row does not change the announced count).
- No changes to paste: `normalizeClipboardInput` already passes plain numeric
  strings through, so raw copies round-trip into editable cells unchanged.

## Non-goals

- Export CSV is untouched (keeps formatted text + its existing contract).
- No per-column clipboard serialization override.
- No cut (Ctrl+X), no undo/redo, no per-keystroke raw modifier.
- No `text/html` clipboard flavor.

## Testing (test-first)

In `DataGrid.export.test.tsx` (copy coverage lives there) plus a keyboard
case:

1. Ctrl/Cmd-Shift-C prepends the header row; plain Ctrl/Cmd-C does not by
   default.
2. `clipboardIncludeHeaders` makes plain Ctrl/Cmd-C include headers.
3. `clipboardValueMode="raw"`: percent copies as `0.23`, currency as
   `1234.5`, date as ISO 8601, status as the raw code; `formatValue` ignored.
4. Default mode output is byte-identical to today's formatted copy.
5. Header row follows the rectangular range's columns (not all visible
   columns).
6. Pivot copy behavior unchanged.
7. Announcement counts exclude the header row.

## Constraints honored

- `src/components/DataGrid/` stays domain-neutral; no retail assumptions.
- New public types exported from `index.ts`.
- Behavioral work is test-first per CLAUDE.md.
