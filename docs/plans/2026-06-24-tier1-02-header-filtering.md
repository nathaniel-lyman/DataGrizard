# Feature 2: Header Filtering + Pivot Filters Popover — Implementation Plan

> Test-first. `npx tsc -b` + `npm test` green before each commit. Spec: `docs/tier1-feature-parity-spec.md` Feature 2 (rev. 4).

**Goal:** Move grid-mode column filtering into the column headers (per-leaf filter popover, opt-in floating row) and remove the inline toolbar filter chips; give pivot mode a consolidated toolbar **Filters** popover. Add `text` (contains) and `date` (from/to + presets) filter types.

**Architecture:** One matcher (`matchesFilterValue`) gains a `{from,to}` date branch (checked by key *before* the `{min,max}` range branch) and a `text` branch that needs the filter type + formatted text. Both filter execution paths — the grid `columnFilterFn` closure and the pivot `pivotSourceRows` loop — pass the same context. Filter UI controls are extracted to a shared `filters.tsx` and reused by the header popover, the floating row, and the pivot popover.

---

## Increment A — Filter engine (the critical, well-tested core)

**Files:** `src/types/grid.ts`, `src/components/DataGrid/DataGrid.tsx`, test `src/components/DataGrid/DataGrid.filters.test.tsx`.

- [ ] `GridFilterType` → `"select" | "multiSelect" | "range" | "text" | "date"`. Extend `GridFilterConfig` with `placeholder?: string`, `dateFormat?: Intl.DateTimeFormatOptions`, `presets?: boolean`.
- [ ] Rework `matchesFilterValue(raw, filterValue, options?)` where `options = { filterType?, searchText? }`:
  - empty (`null`/`""`) → true.
  - **date `{from,to}`** (NEW branch, matched by `"from" in fv || "to" in fv`, BEFORE the generic object branch): normalize cell + bounds via `toDate`; cell null/unparseable → `false`; open-ended when a bound is missing.
  - array → multiSelect (unchanged).
  - object → range `{min,max}` (unchanged numeric).
  - string + `filterType === "text"` → case-insensitive contains against `options.searchText` (falls back to `String(raw)`).
  - string otherwise → exact (`select`, unchanged; `"Men"` ≠ `"Women"`).
- [ ] Build `filterTypeByColumnId: Map<string, GridFilterType>` from the `filters` prop (memo).
- [ ] Replace the module-level `gridColumnFilterFn` usage with a **component-scoped** `columnFilterFn` memo capturing `columnsById`, `filterTypeByColumnId`, `formatOptions`. It computes `searchText` via `getColumnSearchText` only for `text` columns, then calls `matchesFilterValue`. Wire it as each column's `filterFn`; add to the `columnDefs` memo deps.
- [ ] Thread the same context into the pivot loop (`pivotSourceRows` ~line 968): look up `columnsById.get(filter.id)` + `filterTypeByColumnId.get(filter.id)`, compute `searchText` for text, call `matchesFilterValue`.
- [ ] Tests: text contains matches formatted text and is case-insensitive; select stays exact; date `{from,to}` filters by bounds and excludes null/unparseable; range `{min,max}` unchanged. Drive via controlled `state.columnFilters` to isolate the engine from UI. `tsc -b` + targeted test green. **Commit.**

## Increment B — Extract + extend filter controls

**Files:** create `src/components/DataGrid/filters.tsx`; modify `src/components/DataGrid/Toolbar.tsx`.

- [ ] Move `formatOptionLabel`, `SelectFilter`, `MultiSelectFilter`, `RangeFilter`, `FilterControl`, and the `GridFilter` descriptor type (`{ id, label, filterType, value, options, formatOption?, min?, max?, step?, placeholder?, dateFormat?, presets?, onChange }`) into `filters.tsx`. Export `FilterControl` + `GridFilter`.
- [ ] Add `showLabel?: boolean` (default true) to `FilterControl` and each control; floating-row usage passes `false`.
- [ ] Add `TextFilter` (a debounce-free `<input type="text">` with `placeholder`, contains semantics; commits via `onChange(value || undefined)`), and `DateFilter` (`from`/`to` `<input type="date">` writing `{ from, to }`, clearing to `undefined` when both empty; optional preset buttons — Today / Last 7 days / Last 30 days / This month / Clear — that resolve to concrete `{from,to}` bounds when `presets !== false`).
- [ ] `FilterControl` dispatches `text` → `TextFilter`, `date` → `DateFilter`, plus existing three.
- [ ] Toolbar imports `FilterControl`/`GridFilter` from `filters.tsx` (no behavior change yet — chips still render). `tsc -b` + full test green. **Commit.**

## Increment C — Header filter UI, pivot popover, remove chips, migration

**Files:** `src/components/DataGrid/DataGrid.tsx`, `Toolbar.tsx`, `filters.tsx` (header popover wrapper), `src/data/mockRetailData.ts`, tests.

- [ ] `DataGridFeatures += floatingFilters: boolean` (default false; defaulted off in both layouts; floating-row render gated on `layoutMode === "grid"`). Export nothing new from features beyond the flag.
- [ ] **Grid header affordance:** in the header render (`getHeaderGroups` map ~line 2081), for a filterable **leaf** column (id in `filtersByColumnId`), render a filter icon button that toggles a per-column popover containing `<FilterControl>`. Active state styling when the column has a non-empty filter value. Use the existing outside-click/Escape popover pattern. Add a `FilterIcon` to `icons.tsx`.
- [ ] **Floating row:** when `features.floatingFilters && layoutMode === "grid"`, render a second `<tr>` in `<thead>` under the leaf header row, one cell per visible leaf column, rendering `<FilterControl showLabel={false}>` for filterable columns (empty cell otherwise).
- [ ] **Remove inline chips:** Toolbar no longer maps `filters` inline. In **pivot** layout, Toolbar renders a single **Filters** popover button (only when `filters.length > 0`) listing the `FilterControl`s. Pass a `layoutMode`/`filtersInHeader` signal so Toolbar shows the pivot popover but not the grid chips. Keep the search box + Clear filters.
- [ ] Reuse the existing `toolbarFilters` descriptor array for header/floating/pivot controls (it already carries value/onChange/options/min/max/step; add `placeholder`/`dateFormat`/`presets` passthrough).
- [ ] **Demo:** add a `text` filter (e.g. Item Name) and a `date` filter (`last_restocked_at`) to `retailFilters`.
- [ ] **Tests:** rewrite `DataGrid.filters.test.tsx` to drive filters from the grid header (popover + `floatingFilters` row), covering select/multiSelect/range/text/date + active state + clear + saved-view round-trip. Update `DataGrid.test.tsx` pivot filter test to use the pivot **Filters** popover (or controlled `columnFilters`). Assert the toolbar shows no inline chips in grid mode.
- [ ] `tsc -b` + full `npm test` green. **Commit.**

## Done When

- Grid filtering happens in the headers (popover default, floating row opt-in); pivot filtering via the toolbar Filters popover; no inline chips.
- `text` + `date` filters work through one matcher in both grid and pivot paths; saved views capture filters.
- Demo exercises text + date filters; full suite green.
