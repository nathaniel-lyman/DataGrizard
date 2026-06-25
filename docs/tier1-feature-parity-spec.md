# Tier 1 Feature Parity Spec

Date: 2026-06-24
Status: Draft (rev. 4 — sort rule refined during Feature 1 implementation design)
Owner: DataGrid component surface

## Objective

Close the six "Tier 1" gaps between `DataGrid` and the free/Community tiers of AG Grid and MUI X Data Grid:

1. **Date data type** — first-class `date` columns (formatting, filtering, sorting, editing).
2. **Header filtering** — move grid-mode column filtering into the column headers and **remove the inline toolbar filter chips** (breaking change). Pivot mode keeps a consolidated toolbar **Filters** popover (see Feature 2).
3. **Column header groups** — grouped header bands in grid mode.
4. **Keyboard cell navigation** — roving focus across cells; the keyboard model that underpins editing.
5. **Cell editing** — typed inline editors with validation and a custom-editor escape hatch; grid stays controlled.
6. **Export + clipboard** — CSV export of the current view and Ctrl/Cmd-C → TSV.

The work keeps `src/components/DataGrid/` domain-neutral and generic over `TData extends object`, and exposes all new public contracts through `src/components/DataGrid/index.ts`.

## Non-Goals (explicitly out of scope)

- Excel export, range/cell selection + fill handle, integrated charts, right-click context menu (Tier 3 / premium).
- Server-side / lazy / infinite row models; advanced filter operator builders (`startsWith`, `>`, `between`, boolean); tree data; master/detail beyond the existing single detail panel; row drag reordering; density toggle; RTL; theming API (Tier 2).
- Mutating the consumer's `data`. The grid never owns row data.

## Architectural Constraints (apply to every feature)

- **Domain-neutral.** No retail field names, copy, or status values inside `src/components/DataGrid/`. New behavior is a typed prop or a feature flag.
- **State triad for controlled slices.** Any new *controlled* slice replicates: a `current*` value (`controlledState?.X ?? internal`), an `emit*Change` helper that writes internal state only when uncontrolled (`controlledState?.X === undefined`), persists if needed, then fires the optional `on*Change` prop.
- **Ephemeral UI state follows the `activeRow` pattern.** `focusedCell` and `editingCell` are internal `useState` + optional `on*Change` callback — **not** controlled slices, **not** persisted.
- **Persistence stays scoped.** No new `localStorage` keys. Only the existing four scoped keys (`columnSizing`, `columnOrder`, `columnPinning`, `savedViews`) are written, and only when `storageKey` is set. Header/popover filters reuse the existing in-memory `columnFilters` slice; `DataGridSavedView` already serializes `columnFilters`, so filters are captured by saved views with no extra work.
- **Two filter execution paths exist today and both must be updated together.** Grid mode filters via `column.setFilterValue()` → TanStack `getFilteredRowModel()` → the single `gridColumnFilterFn` → `matchesFilterValue`. Pivot mode filters source rows directly through `pivotSourceRows` using the same `matchesFilterValue`. Any change to filter matching (Feature 2's `text`/`date`) **must** be made in `matchesFilterValue` and threaded into **both** call sites, or the two paths diverge.
- **One render path.** Column header groups render through the existing `table.getHeaderGroups()` chrome (the same nested-header path pivot already uses). No new table renderer.
- **Test-first**, split by concern next to the engine.

## Public API Surface (with source files)

All exported from `index.ts`.

```ts
// src/types/grid.ts
type GridDataType = "text" | "number" | "currency" | "percent" | "status" | "date";   // + "date"
type GridFilterType = "select" | "multiSelect" | "range" | "text" | "date";           // + "text", "date"

// src/types/grid.ts — GridColumnConfigForKey<TData, K> gains (typed per K):
editable?: boolean | ((row: TData) => boolean);
validate?: (value: TData[K], row: TData) => string | null;          // non-null = error, blocks commit
parseValue?: (input: string) => TData[K];                            // editor string -> typed value
renderEditCell?: (props: GridEditCellProps<TData, K>) => ReactNode;  // full editor override
dateFormat?: Intl.DateTimeFormatOptions;                            // per-column date format

// src/types/grid.ts — new public type (referenced by GridColumnConfigForKey.renderEditCell)
type GridEditCellProps<TData, K extends Extract<keyof TData, string>> = {
  value: TData[K];
  row: TData;
  onChange: (next: TData[K]) => void;
  commit: () => void;
  cancel: () => void;
  error: string | null;
};

// src/types/grid.ts — GridFilterConfig<TData> is EXTENDED (not "same shape") for the new types:
//   filterType?: GridFilterType;                  // now includes "text" | "date"
//   placeholder?: string;                         // text filter input placeholder
//   dateFormat?: Intl.DateTimeFormatOptions;      // how date-filter bounds/options display
//   presets?: boolean;                            // date filter: show quick presets (default true)
// (existing options/formatOption/min/max/step retained)

// src/components/DataGrid/DataGrid.tsx — new public types
type DataGridColumnGroup = { groupId: string; header: string; children: Array<string | DataGridColumnGroup> };
type DataGridCellEdit<TData> = { rowId: string; row: TData; columnId: string; value: unknown; previousValue: unknown };
type DataGridFocusedCell = { rowId: string; columnId: string } | null;

// src/components/DataGrid/DataGrid.tsx — DataGridProps gains:
columnGroups?: DataGridColumnGroup[];
onCellEdit?: (edit: DataGridCellEdit<TData>) => void;
onFocusedCellChange?: (cell: DataGridFocusedCell) => void;
getExportFileName?: (context: { rowCount: number; selectedCount: number }) => string;
dateFormat?: Intl.DateTimeFormatOptions;             // grid-level default date format

// DataGridFeatures gains:
editing: boolean;          // default true; inert until a column sets `editable`
export: boolean;           // default true
clipboard: boolean;        // default true
floatingFilters: boolean;  // default false; opt-in always-visible grid-mode filter row
```

`defaultFeatures` includes the four new flags as above. `layoutFeatureDefaults` sets per-layout values (see "Feature flags × layout" below).

## Feature Interaction Matrix (resolved in one place)

| Pair | Resolution (authoritative) |
|------|---------------------------|
| Keyboard × Editing × Detail panel (Enter/Space/Escape) | One deterministic chain; existing always-firing Enter **and Space** handlers are gated. See Feature 4 §"Key precedence". |
| Header filters × Pivot mode | Header filters are **grid-mode only**. Pivot mode uses a consolidated toolbar **Filters** popover. See Feature 2. |
| Header filters × Column groups | Filter affordance and floating row attach to the **leaf** header cell/row only, never to a band row. See Feature 2 + 3. |
| Keyboard (aria) × Column groups | `aria-rowindex` offset = header-row count; `aria-colindex` over leaf columns only; band cells are excluded from roving focus. See Feature 4. |
| Editing × Date (write-back) | Canonical committed date representation + round-trip rule + invalid-date validation defined once. See Feature 5 §"Date editing". |
| Export/Clipboard × Selection scope | Export (no selection) = all filtered rows across pages; "selection" = `getSelectedRowModel()` (cross-page). See Feature 6. |
| Editing × Filter (self-filtering edit) | Post-commit, if the committed row leaves the filtered/sorted view, focus reseeds to the nearest valid cell (same path as row-removal). See Feature 5 §"Post-commit focus". |
| Date filter × null/invalid rows | Under the date range filter, rows whose value is null/unparseable are **excluded** (filtered out). This is distinct from sort, where invalid dates are **kept and ordered to the end under ascending sort**. See Features 1 & 2. |

## Feature flags × layout (`layoutFeatureDefaults`)

Merge order is `{ ...defaultFeatures, ...layoutFeatureDefaults, ...featureOverrides }`. New flags by layout:

- `editing`: default `true` in both layouts but **inert in pivot** (pivot/group/aggregate rows are never editable; see Feature 5). Consumer-overridable.
- `export`, `clipboard`: `true` in both layouts (pivot exports its materialized displayed values).
- `floatingFilters`: `false` in both; only meaningful in grid mode. The floating-row render path is gated on `layoutMode === "grid"`, so even a `featureOverride` of `floatingFilters: true` cannot leak the row into pivot (analogous to `editing` being inert in pivot).

---

## Feature 1 — Date data type

### Behavior

- `GridDataType` gains `"date"`. A date value may be a `Date`, ISO-8601 string (`"2026-06-24"` or full timestamp), or epoch milliseconds.
- `src/utils/formatters.ts` gains:
  - `toDate(value: unknown): Date | null` — normalizes the three representations; returns `null` for blank/unparseable input. **Date-only ISO strings (`"2026-06-24"`) are parsed as local midnight** (constructed from the y/m/d parts, not `new Date("2026-06-24")` which is UTC) to avoid off-by-one display under negative-offset time zones.
  - `formatDate(value, options: FormatOptions & { dateFormat?: Intl.DateTimeFormatOptions }): string` — `Intl.DateTimeFormat(locale, dateFormat)`; default `{ year: "numeric", month: "short", day: "numeric" }`. No dependency added. Returns `""` for `toDate(value) === null`.
- `renderCellValue` dispatches `date` → `formatDate`; null/unparseable → empty string.
- `getColumnSearchText` returns the formatted date string (global search matches the displayed value).
- Alignment: **left-aligned** (text-like), not `tabular-nums`.
- **Sorting:** a `dateSortingFn` normalizes both cells via `toDate` and compares timestamps. **Invalid/blank dates sort to the END under ascending sort** (and therefore to the top under descending) via a single comparator. *Rationale (contract over symmetry):* the alternative — normalizing at the accessor (`accessorFn → Date | undefined`) so `sortUndefined: "last"` could place blanks last in both directions — would change the value passed to the typed per-key callbacks (`formatValue`, `getCellClassName`, `conditionalFormats`) from the raw `TData[K]` to a `Date`, breaking the distributive-union contract. So date columns keep `accessorKey` and accept the natural single-comparator placement. Date columns wire this `sortingFn` into their generated `ColumnDef`.
- Per-column `dateFormat` overrides the grid-level `dateFormat` prop, which overrides the built-in default.

### Edge cases

- Mixed representations within one column are tolerated (each cell normalized independently).
- See Feature 5 for the committed representation when a date cell is edited, and the date-filter null behavior in the Interaction Matrix.

### Tests (`formatters.test.ts`, `DataGrid.config.test.tsx`)

- `toDate` parses Date/ISO/epoch; returns `null` for `""`/`null`/`"not-a-date"`.
- A date-only ISO string formats to the same calendar day under a forced negative UTC offset (local-midnight construction asserted).
- `formatDate` honors locale + `dateFormat`; empty for unparseable.
- A `date` column renders formatted text, sorts chronologically across mixed representations, sorts blanks to the end under ascending sort, and search matches the formatted string.

---

## Feature 2 — Filtering: grid-mode header filters + pivot Filters popover (replaces inline chips)

### Behavior — grid mode

- **Breaking:** the inline filter chips are removed from `Toolbar.tsx`. The toolbar retains search, the column (visibility/order/pin) menu, the group-by builder, saved views, and gains the Export button (Feature 6).
- The existing `filters` prop (`GridFilterConfig<TData>[]`) is **retained and extended** (see Public API) as the declaration of which columns are filterable and how — it now renders in the **leaf** column headers. Match to a column is by `accessorKey`.
- `GridFilterType` gains:
  - `"text"` — case-insensitive **contains** match against the **formatted** cell text (`getColumnSearchText`). This deliberately matches only the displayed text, unlike global search which also concatenates the raw value; documented so the two are not assumed identical.
  - `"date"` — from/to range over normalized timestamps, with optional quick presets (Today, Last 7 days, Last 30 days, This month, Clear). **Presets resolve to concrete `{from,to}` bounds** when applied (they are not a stored mode); a saved view captures the resolved bounds and therefore does not stay relative — this decay is accepted and documented.
- **Default form (header menu):** each filterable **leaf** header shows a filter affordance (icon with an "active" visual state when a filter is set). Clicking opens a popover with the type-appropriate control (`select`/`multiSelect`/`range`/`text`/`date`). The popover closes on outside-click and Escape; it is keyboard-reachable and focus-trapped while open.
- **Opt-in floating row** (`features.floatingFilters`): an always-visible filter row renders **directly under the leaf header row** (below any group band rows) with the same controls inline. The popover affordance remains. Both write the same state.

### Behavior — pivot mode

- Pivot dimensions are not rendered as leaf `<th>` data columns, so header filters do not apply. Instead, the toolbar shows a single **Filters** popover button (only in pivot layout, only when `filters` is non-empty) that lists the declared filters with the same controls. This preserves pivot filtering after the inline chips are removed.

### Filter engine changes (the critical fix)

- `matchesFilterValue` gains explicit, disambiguated branches and the **column/format context required to match formatted text**. Its signature is extended so both call sites pass the column config and `FormatOptions`:
  - **`{min,max}` (range)** — unchanged numeric behavior.
  - **`{from,to}` (date)** — a NEW, distinct object branch (disambiguated from `{min,max}` by key presence). Normalizes the cell via **`toDate`** (not `Number`) and the bounds via `toDate`; open-ended when only one bound is set; **null/unparseable cell → excluded** (returns false).
  - **`text`** — substring match against `getColumnSearchText(column, raw, row, formatOptions)` (formatted text), case-insensitive. Both call sites must resolve the column config at the match point (`columnsById.get(filter.id)`); the pivot loop (`pivotSourceRows`) does not currently look it up, so that lookup is added there too.
  - **`select`/`multiSelect`** — unchanged exact / membership behavior (`"Men"` must not leak into `"Women"`).
- `gridColumnFilterFn` is updated to pass the column config + `FormatOptions` into `matchesFilterValue`; `pivotSourceRows` is updated identically. Empty/cleared filter values are normalized **once** (a shared helper) so both paths remove the `columnFilters` entry rather than leaving a dangling empty predicate.

### Migration

- `src/App.tsx` / `src/data/mockRetailData.ts`: the `filters` config stays valid; add a `text` filter and a `date` column + `date` filter to exercise the new types.
- **`DataGrid.filters.test.tsx`** is rewritten to drive filters from the grid-mode header (popover + floating-row) instead of the toolbar.
- **`DataGrid.test.tsx`** (pivot) currently filters via the removed "Department filter" toolbar button (the "keeps filtered pivot totals…" test). It is updated to drive filtering through the new pivot **Filters** popover (or controlled `columnFilters`). Any other test querying a toolbar filter chip is migrated the same way.

### Tests (`DataGrid.filters.test.tsx`, `DataGrid.test.tsx`)

- Toolbar no longer renders inline filter chips (grid mode).
- Grid header filter popover opens, applies select/multiSelect/range/text/date, shows active state; clearing removes the predicate.
- `floatingFilters: true` renders the inline row under the leaf header row and filters identically.
- `text` is a contains match against formatted text; `select` stays exact (`"Men"` ≠ `"Women"`).
- `date` range filters rows; null/unparseable rows are excluded; a preset resolves to expected bounds.
- Pivot **Filters** popover filters source rows (replaces the old toolbar-button assertion).
- A saved view round-trips an active filter (grid and pivot).

---

## Feature 3 — Column header groups (grid mode)

### Behavior

- New prop `columnGroups?: DataGridColumnGroup[]` — MUI-style grouping tree: `{ groupId, header, children: Array<string | DataGridColumnGroup> }`. Leaf `string`s are column `accessorKey`s; nested groups allowed.
- In grid mode, when provided, flat leaf `ColumnDef`s are assembled into nested grouped `ColumnDef`s before `useReactTable`. Rendering uses the existing `table.getHeaderGroups()` path (the nested-header chrome pivot already produces); resizing/sorting/visibility/pinning continue to operate on the **leaf** columns.
- v1 semantics (MUI): a group is a **header band over the leaf columns that currently sit contiguously**. If a reorder splits a group's members, the band splits into multiple bands (no forced contiguity, no group-level drag). Columns named in no group render with an empty spanning header cell.
- **Filter affordance attaches to the leaf header cell only** (never a band row). The floating filter row, if enabled, sits under the leaf header row, below all band rows.
- `columnGroups` is config, not state — not persisted, not controlled. Pivot mode ignores it.

### Edge cases

- A child **leaf `accessorKey`** that does not resolve to a visible column is skipped. A **`groupId`** is a group identity string, not a column reference — it is not "resolved to a column". An empty group (no resolving leaves) renders nothing.
- Band `colSpan` = count of currently-visible leaf columns under it (hidden columns don't widen the band).
- Nested groups stack header rows; depth bounded only by config.

### Tests (`DataGrid.grid.test.tsx`)

- A two-group config renders two bands with correct `colSpan`.
- Hiding a column under a group narrows its band; reordering a column out splits the band.
- Leaf-level sorting/resizing still works with groups present.
- With groups + a filterable column, the filter affordance renders on the leaf header (not the band) and `aria-rowindex`/`aria-colindex` are correct (see Feature 4).

---

## Feature 4 — Keyboard cell navigation

### Behavior

- Internal `focusedCell: DataGridFocusedCell` (`{ rowId, columnId }`), optional `onFocusedCellChange`. Follows the `activeRow` pattern (internal, not controlled).
- Roving `tabIndex`: the focused **body leaf** cell has `tabIndex={0}`, all other body cells `-1` — one tab stop. **Header band cells are excluded from roving focus.** First focus into the grid seeds to the previously focused cell or the first data cell.
- Movement keys: **Arrows** (one cell within visible leaf columns / visible rows), **Home/End** (row ends), **Ctrl/Cmd+Home / Ctrl/Cmd+End** (grid corners), **PageUp/PageDown** (by the count of currently-rendered body rows — i.e. the virtualizer's current visible range when virtualized, else the rendered row count; approximate paging under variable row heights is acceptable).

### Key precedence (authoritative; resolves the Enter/Space/Escape collisions)

The existing always-firing handlers are **gated** so they do not double-fire:

- **Escape:** cancel edit if `editingCell` is set → else close the detail panel if `activeRow` is set → else no-op. The document-level Escape listener (`closeActiveRow`) only runs when no `editingCell` is set.
- **Enter / F2:** enter edit if the focused cell is editable → else trigger the row action (detail panel / `onRowClick`) if the row is actionable → else toggle expansion on a group/pivot row → else no-op. The row `onKeyDown` Enter→`handleRowClick` only runs when the focused cell is not editable. (Enter on a cell that is **both** editable and on an actionable row → editing wins.)
- **Space:** toggle row selection when `rowSelection` is enabled and the focused cell is not in an editor; Space does **not** also open the detail panel. The existing actionable-row `onKeyDown` currently fires `handleRowClick` on **both Enter and Space** — Space must be **split out of that branch** (not merely guarded) so it no longer triggers the row action. With `rowSelection` disabled, Space on an actionable row falls through to no row action.

### Tab semantics (consistent with the single-tab-stop model)

- **Not editing:** Tab/Shift+Tab leave the grid via the roving tab stop (native behavior); they do not move the focused cell.
- **Editing:** Tab commits the current cell and moves edit+focus to the next editable cell in row order (Shift+Tab reverses). At the last/first editable cell, Tab commits and focus lands on the now-non-editing roving cell (the single tab stop), so one further Tab leaves the grid natively. **Exception:** if commit fails validation, Tab stays in edit mode and does NOT advance (validation wins — see Feature 5).

### Virtualization & reseed

- Navigating to an off-screen row calls the virtualizer's `scrollToIndex`, then focuses the target cell **after the virtualizer reports the index measured** (not a blind single rAF). Non-virtualized focus is immediate.
- Removing the focused row/column (filter, hide, data change) reseeds focus to the nearest valid cell, or clears it if none remain.
- Pinned columns: navigation follows visible leaf order (left-pinned → center → right-pinned).

### Accessibility

- Native `<table>` semantics retained. Add `aria-rowcount`/`aria-colcount` on the table; `aria-colindex` on header and body cells over **leaf columns only**; `aria-rowindex` on body rows **offset by the header-row count** (so the first body row's index accounts for band + leaf header rows). Under virtualization, `aria-rowindex` = the row's **absolute `visibleRows` index** + header-row count (independent of the rendered window and spacer `<tr>`s), so windowing does not skew the announced position. Roving tabindex is the focus model.

### Edge cases

- Empty/loading/error states: no focusable cells; the grid container is the tab stop.
- When a popover/editor is open, the grid's key handler defers to it.

### Tests (`DataGrid.keyboard.test.tsx`, extend `DataGrid.a11y.test.tsx`)

- Arrow/Home/End/Ctrl+Home/Ctrl+End move focus as expected; exactly one cell has `tabIndex=0`.
- Enter opens the detail panel on an actionable (non-editable) row; Space toggles selection; Escape with an open panel and no edit closes the panel.
- Reseeding: hiding the focused column moves focus to a neighbor.
- `aria-rowindex`/`aria-colindex` correct, including with column groups (offset applied).
- (Virtualized) navigating past the window scrolls and focuses the target row.

---

## Feature 5 — Cell editing

### Behavior

- Column config gains `editable`, `validate`, `parseValue`, `renderEditCell` (typed per `K`; mirrored on the value-erased `AnyColumnConfig`).
- Default editors by `dataType`: text → `<input type="text">`; number/currency/percent → `<input type="number">`; date → `<input type="date">`; status → `<select>` over the keys of `statusStyles` (status column without `statusStyles` falls back to text input). `renderEditCell` overrides entirely and drives lifecycle via the provided `commit`/`cancel`/`onChange`.
- `editingCell` is internal (activeRow pattern). Enter editing: double-click an editable cell, or Enter/F2 on the focused editable cell. The editor mounts in place and receives focus.
- **Commit (Enter / Tab / blur):** run `parseValue` (default per dataType) then `validate`. On error (validation message, or the built-in numeric-NaN / invalid-date rejection), stay in edit mode, show an inline error on the cell, do **not** emit. On success, fire `onCellEdit({ rowId, row, columnId, value, previousValue })` and exit. **The grid never mutates `data`.**
- **`error` provenance:** calling the provided `commit()` runs parse+validate; on failure the grid sets `GridEditCellProps.error` and keeps the editor mounted for re-render. A `renderEditCell` override therefore receives the non-null `error` and may display it, but does not implement its own validation lifecycle — the grid owns parse/validate/commit.
- **Cancel (Escape):** discard the draft, exit, no emit.
- Feature flag `editing` (default true) gates the subsystem; with it off, no cell is editable. With it on, a cell is editable only when its column's `editable` resolves truthy. **Pivot/group/aggregate rows are never editable** (no `accessorKey`-backed source value); `editingCell` is refused on them.

### Date editing (canonical representation + round-trip)

- The default date editor (`<input type="date">`) yields an ISO `yyyy-mm-dd` string. **The default `parseValue` for a `date` column returns that ISO string.** Because `parseValue` is typed `(input: string) => TData[K]`, the string-returning default is only type-sound when `TData[K]` accepts `string`; **a date column whose field is typed `Date` or `number` (epoch) MUST provide its own `parseValue`** (documented; the demo's editable date column stores ISO strings to use the default).
- **Round-trip rule:** `format(parseValue(input))` must display the same calendar day the user picked. `toDate`'s local-midnight parsing of date-only ISO guarantees this; a test asserts no day shift under a negative UTC offset.
- **Invalid/blank date validation:** a blank or unparseable date input is rejected as a validation error (mirrors numeric-NaN rejection), unless the column's `validate`/`parseValue` explicitly permits it.

### Post-commit focus

- After a successful commit, focus returns to the committed cell. If the commit changes data such that the row leaves the current filtered/sorted view (self-filtering edit), focus reseeds to the nearest valid cell via the same path as row-removal (Feature 4). A data change that removes the editing row mid-edit cancels the edit.

### Numeric/`parseValue` rules

- Default `parseValue`: number/currency/percent → `Number(input)` (NaN → validation error); date → ISO string (above); text/status → the string.
- `renderEditCell` is responsible for its own inputs but must call the provided controls.

### Tests (`DataGrid.editing.test.tsx`)

- Double-click and Enter/F2 enter edit mode on an editable cell; non-editable cells do not; pivot rows refuse editing.
- Default editors render per `dataType` (number input, status select, date input).
- Enter/Tab/blur commit → `onCellEdit` with correct `previousValue`/`value`; Escape cancels with no emit.
- `validate` error blocks commit and shows the error; **Tab on a validation error stays in edit mode and does not advance**; fixing it allows commit.
- `parseValue` converts input; numeric NaN and blank/invalid date are rejected.
- Date commit round-trips to the same displayed day under a forced negative UTC offset.
- `renderEditCell` override drives commit/cancel; `editing: false` disables editing.
- Grid does not mutate the passed `data` array (asserted by identity).
- Self-filtering edit: with an active filter, committing a value that drops the row reseeds focus and does not throw.

---

## Feature 6 — Export + clipboard

### Behavior

- New `src/utils/export.ts` (domain-neutral, no deps):
  - `toDelimited(rows: string[][], delimiter): string` — RFC-4180 quoting (wrap fields containing the delimiter/quote/newline; double embedded quotes). `toCsv`/`toTsv` are thin wrappers.
  - `downloadTextFile(filename, mime, content): void` — Blob + object URL; guards `typeof window === "undefined"`.
- **CSV export:** toolbar **Export CSV** button (gated by `features.export`). Cell text comes from the shared cell-to-text path: **reuse `getColumnSearchText` verbatim** (status → label, numeric/date → formatter, text → string). Header row uses column `header`.
  - **Scope (authoritative):** with no selection, Export emits **all filtered rows across pages** (not just the current page), in the active sort + column order, respecting visibility. When rows are selected, Export emits the **selection only**. "Selection" reads `getSelectedRowModel()` (cross-page), so the existing "Select all N filtered" affordance exports across pages.
  - Filename from `getExportFileName?.({ rowCount, selectedCount })`, default `${tableLabel || "data"}.csv`.
- **Clipboard copy (Ctrl/Cmd-C):** copies, as TSV, the selected rows (visible columns, in order) or — when no rows are selected — the single focused cell. `navigator.clipboard.writeText` with a `document.execCommand("copy")` fallback; both failing → swallow (no throw), like the persistence helpers. Gated by `features.clipboard`.
  - **Suppression gate:** the grid's Ctrl/Cmd-C handler does **nothing** (lets the native copy proceed) when `document.activeElement` is an `input`/`textarea`/`contenteditable`, or `editingCell` is set, or a filter popover is open — so copy never hijacks text selection inside an editor/popover. With no selection **and** no focused cell (empty/loading/error), Ctrl/Cmd-C is a no-op.
- Pivot mode: export/copy operate over the materialized `visibleRows` and visible generated columns. Selection-only export in pivot uses source rows consistent with existing pivot selection semantics.

### Edge cases

- Zero rows → header-only CSV (not an error).
- Clipboard API unavailable (insecure context) → `execCommand` fallback.

### Tests (`DataGrid.export.test.tsx`)

- `toCsv`/`toTsv` quote fields with delimiters/quotes/newlines correctly.
- Export reflects current sort/filter/visible-columns/order and uses formatted text.
- **Pagination on:** Export with no selection emits all filtered rows across pages (not just the page).
- Selection-only export when rows are selected (cross-page via `getSelectedRowModel`).
- Ctrl/Cmd-C writes TSV for the selection (mocked `navigator.clipboard`); is suppressed while an editor/filter input is focused; no-ops with no selection and no focused cell; falls back without throwing when the API is absent.
- `getExportFileName` honored.

---

## Build Order & Verification

Sequential — every feature touches `DataGrid.tsx` heavily, so they ship one at a time (parallel worktrees would collide). **Each feature is its own implementation plan and is independently verified** (write the concern's tests first; `npx tsc -b` clean; `npm test` green) before the next begins.

1. **Date data type** — foundational; editing and filtering depend on it.
2. **Filtering** (grid header filters + pivot Filters popover; demo + `DataGrid.filters.test.tsx` + `DataGrid.test.tsx` migration) — depends on the `date` filter type and the `matchesFilterValue` extension.
3. **Column header groups** — independent; reuses the nested-header render path.
4. **Keyboard cell navigation** — foundational for the editing UX; establishes the Enter/Escape precedence and aria offsets.
5. **Cell editing** — depends on keyboard navigation and the date editor.
6. **Export + clipboard** — depends on selection and visible-column resolution.

## Definition of Done

- All six features implemented behind the named props/flags, domain-neutral, with public types exported from `index.ts`.
- New/rewritten test files green; full `npm test` green; `npx tsc -b` clean.
- `src/App.tsx` + `src/data/mockRetailData.ts` demo migrated to grid header filters + pivot Filters popover, exercising a `date` column, a `text` filter, an editable column, column groups, and export.
- `CLAUDE.md` and `AGENTS.md` updated where the new public surface, the toolbar-filter removal, or the pivot Filters popover changes the documented architecture.
