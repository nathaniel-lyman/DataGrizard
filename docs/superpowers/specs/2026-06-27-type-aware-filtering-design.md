# Type-aware, auto-provisioned filtering

**Status:** Approved design (2026-06-27)
**Component:** `src/components/DataGrid/` (the reusable `DataGrid`, generic over `TData extends object`)
**Scope:** Filtering subsystem — defaults, provisioning, and an applied-filter summary.

## Problem

Filtering "doesn't work for some columns." Two independent gaps combine:

1. **Filtering is opt-in per column.** Only columns listed in the `filters={[…]}` prop
   get a filter affordance. In the retail demo this leaves `units` (number),
   `margin_rate` and `price_gap` (percent), `brand`, and `item_id` with **no filter
   at all** — they are simply not in the list.
2. **`filterType` defaults to `"select"` with no awareness of the column's `dataType`**
   (`grid.ts:186`, `DataGrid.tsx:769`, `DataGrid.tsx:1481`). A column listed without an
   explicit `filterType` (e.g. `category` in the demo) silently falls back to `select`.
   If a numeric or date column is listed without `filterType`, the user gets a dropdown
   of every distinct raw value (raw ISO timestamps, hundreds of distinct numbers) —
   technically "working" but unusable. This is the "not aware of column type" trap.

The matching engine is **not** the problem. `matchesFilterValue` (`filterMatch.ts`) and
the control bodies (`filterBodies.tsx`) already support `text` / `select` / `multiSelect` /
`range` / `date` / `boolean` with a rich operator system (`contains`, `between`,
`before`/`after`, `isEmpty`, …), and client-mode `select` options already auto-populate
from the data. **The gap is the defaulting/wiring layer, not the predicate** — which makes
this low-risk.

Best-practice research (NN/g, Baymard, Carbon, Atlassian, AG Grid, MUI X, TanStack)
converges on: the default control should be **derived from the data type**, low-cardinality
categoricals should be **faceted**, and the UI should show an **applied-filter summary with a
result count**. None of those exist today.

## Goals

- Every column is filterable by default, with the control **inferred from its `dataType`**.
- Low-cardinality `text` columns auto-upgrade to a faceted `multiSelect`.
- A visible **applied-filter bar**: removable chips per active filter + a result count + clear-all.
- The grid and pivot filter paths stay in **lockstep** (CLAUDE.md invariant).
- Behavior is correct in `dataMode="server"`, degrading consistently with existing rules.
- Comprehensive, **test-first** coverage — including the currently-untested number, percent,
  and boolean paths.

## Non-goals

- No change to the `matchesFilterValue` predicate's matching semantics.
- No dual-handle range **slider** (deferred; min/max inputs remain the control).
- No server-backed faceting / type-ahead for high-cardinality columns in server mode
  (documented fallback, not built here).
- No change to global search, saved views, or the per-column header menu beyond routing
  filter metadata through the new source of truth.

## Design

### 1. A single `resolvedFilters` source of truth

Today filter metadata is derived from the `filters` prop and read independently by three
consumers: `filterTypeByColumnId` (`DataGrid.tsx:768`), the header popovers via
`toolbarFilters` (`DataGrid.tsx:1475`), and the pivot `pivotSourceRows` loop
(`DataGrid.tsx:1070`). They must agree on value-shape for every type or filters silently
no-op — a hand-maintained invariant.

Introduce one memo, `resolvedFilters: ResolvedColumnFilter[]`, with one entry per filterable
leaf column:

```
resolvedFilters
  = filterableLeafColumns.map(col => mergeFilter(
      inferFilter(col, { distinctCount, isServerMode, facetThreshold }), // new default
      overridesByAccessorKey[col.accessorKey],                            // optional refinement
    ))
```

`ResolvedColumnFilter` is the existing runtime `GridFilter` descriptor shape (id, label,
filterType, operator(s), options, min/max/step, placeholder, dateFormat, presets,
formatOption) minus `onChange` and `value` (both attached/read by `DataGrid` at render).
Every downstream
consumer — `filterTypeByColumnId`, `filterOperatorByColumnId`, the header funnel attachment,
the pivot loop, and the new applied-filter bar — reads from `resolvedFilters`. Lockstep
becomes structural rather than manual.

`filterableLeafColumns` = **non-synthetic real leaf data columns** (i.e. excluding the
synthetic `select`/`rowActions` columns), minus any column with `enableFiltering === false`.
This is **independent of `columnVisibility`** by design: a column that is filtered and then
hidden must keep its `resolvedFilters` entry so the applied-filter bar can still resolve the
chip's label/type and offer to clear it. (Whether a hidden column shows a *header* funnel is
naturally handled by the header not rendering; the metadata persists regardless.) When
`features.autoColumnFilters` is `false`, the set is instead exactly the columns named in the
`filters` prop (legacy opt-in).

### 2. Type → control inference (`filterDefaults.ts`)

A new **pure** module (no React), independently unit-tested:

```ts
defaultFilterTypeForDataType(dataType): GridFilterType
//  text -> "text"        number  -> "range"
//  currency -> "range"   percent -> "range"
//  date -> "date"        status  -> "multiSelect"
//  boolean -> "boolean"

resolveFilterType({ dataType, distinctCount, hasStaticOptions, isServerMode, facetThreshold }): GridFilterType
//  text: "multiSelect" when hasStaticOptions OR (!isServerMode && distinctCount <= facetThreshold);
//        otherwise "text".
//  status: always "multiSelect".
//  everything else: defaultFilterTypeForDataType(dataType).
```

- `facetThreshold` defaults to **12**, overridable via a new `facetThreshold?: number` grid prop.
- An explicit `filterType` in a `filters` override **always wins** (backward compatible).
- Range bounds for `number`/`currency`/`percent` are auto-derived from the data for input
  `min`/`max`/`step` hints; an explicit `min`/`max`/`step` override wins. **This is new
  work:** today's `filterOptionsById` (`DataGrid.tsx:1464`) computes only **distinct values**
  (`uniqueColumnValues`) and iterates the `filters` prop only — under auto-provision it must
  broaden to all `filterableLeafColumns`, and a parallel min/max scan must be added for
  numeric columns (skipped in server mode, where bounds come from overrides if at all).
- The `boolean` filterType has **no dedicated control body**: it renders through `SelectBody`
  (the `else` branch of `FilterBody`, `filterBodies.tsx:377`) fed by `["true","false"]`
  options (`DataGrid.tsx:1469`). This is existing, working behavior — called out because it
  is non-obvious.

### 3. Auto-provision, overrides, and opt-out

- **`features.headerFilters`** (default **true**) — master toggle for per-column header
  filters. (Named `headerFilters`, not `columnFilters`, to avoid collision with the
  existing `columnFilters` **state slice**.) With auto-provision on, every leaf data column
  gets a type-appropriate filter without being listed. The existing
  `features.floatingFilters` (the always-visible filter row) is inert when
  `headerFilters` is `false`, and otherwise renders the same `resolvedFilters`.
- **`features.autoColumnFilters`** (default **true**) — set **false** to revert to today's
  opt-in behavior (only columns named in `filters` are filterable).
- **Opt-out** a single column via `GridColumnConfig.enableFiltering = false` (parallels the
  existing `enableGrouping` / `enablePinning`), or a `filters` override
  `{ accessorKey, filterable: false }`.
- The `filters` prop's role shifts from "the list of filterable columns" to
  "**per-column overrides**" (label, filterType, options, operators, placeholder, bounds,
  presets, `filterable`). `label` becomes **optional** and defaults to the column `header`.

### 4. Applied-filter bar (`AppliedFilters.tsx`)

Gated by **`features.filterSummary`** (default **true**). Rendered under the toolbar, above
the table, in **both** grid and pivot layouts:

```
[ Sales: 1,000–5,000 ✕ ]  [ Status: 2 selected ✕ ]  [ "milk" ✕ ]   Clear all
Showing 142 of 500 rows
```

- One removable chip per active column filter, plus a chip for an active global search.
  `✕` clears just that filter; **Clear all** reuses the existing `clearFilters`
  (`DataGrid.tsx:1578`).
- Chip summaries reuse the `summarize()` logic currently private in `filters.tsx`
  (`filters.tsx:65`), extracted to a shared exported `summarizeFilter()`.
- **Result count:** client mode → `Showing {filtered} of {total}` (filtered row count vs
  `data.length`); server mode → `{rowCount} results` (the server's filtered total; the
  unfiltered total is unknown to the grid).
- Empty state: when no filters and no search are active, the bar renders nothing
  (or only the count, see below) — no empty chip row.

### 5. Server mode (`dataMode="server"`)

Folds into the existing `dataModeFeatureDefaults` philosophy (`DataGrid.tsx:670`):

- Auto-facet cannot read a complete distinct set from one page, so `text`/`status`
  columns fall back to `text` contains unless static `options` are supplied (then
  `multiSelect`). `range`/`date`/`boolean` infer normally.
- Filtering continues to flow through the existing `on*Change` server-query callbacks;
  no new server contract.
- Result count uses `rowCount`.

**Demo server must learn the same inference.** The wire contract ships only `columnFilters`
(id + value), *not* the resolved filter type, so the demo's `src/data/fakeServer.ts` builds
its own `filterTypeById` map — today from `retailFilters`, resolving `filter.filterType ??
"select"` (`fakeServer.ts:28-40`). Once `retailFilters` shrinks to overrides (dropping, e.g.,
`item_name`'s explicit `filterType: "text"`), `fakeServer` would resolve those columns as
`select` and do **exact-match instead of contains** for text (and mis-handle boolean) —
breaking the "correct in server mode" goal. (Range/date/multiSelect survive because their
value *shape* alone routes correctly in `matchesFilterValue`; only `text`/`boolean` depend on
the type map.) Fix: `fakeServer.ts` must derive each column's filter type from the **same
inference** (`filterDefaults` over the retail columns), not from the shrunken `filters` list.
The production `serverQuery.ts` / `retailBigQuery.ts` have the analogous dependency but live
outside the component and are out of scope here — noted as a follow-up.

### 6. Public API changes (`src/types/grid.ts`, re-exported from `index.ts`)

- `GridColumnConfig`: add `enableFiltering?: boolean` (default true).
- `GridFilterConfig`: `label?` becomes optional; add `filterable?: boolean`.
- `DataGridProps`: add `facetThreshold?: number`.
- `DataGridFeatures`: add `headerFilters: boolean`, `autoColumnFilters: boolean`,
  `filterSummary: boolean` (all default true in `defaultFeatures`).
- Export `ResolvedColumnFilter` / any new public type and the `filterDefaults` helpers as
  appropriate from `index.ts`.

### 7. Backward compatibility

The library's only consumer is the demo, so blast radius is small, but compatibility is
preserved: an explicit `filterType` always wins; existing `filters` entries keep working as
overrides; `features.autoColumnFilters: false` restores the exact opt-in behavior. The one
intentional behavior change is that omitting `filterType` now infers from `dataType` instead
of defaulting to `select`.

## Data flow

1. `DataGrid` builds `columnsById` and the leaf column list (existing).
2. New `resolvedFilters` memo merges per-column inference with `filters` overrides. The
   client-mode distinct-value scan (`filterOptionsById`) is broadened from the `filters`
   prop to all `filterableLeafColumns`, and a new min/max scan supplies numeric range bounds.
3. `filterTypeByColumnId` / `filterOperatorByColumnId` are rebuilt from `resolvedFilters`.
4. Header funnels (grid) and the pivot Filters popover render from `resolvedFilters`.
5. A filter change writes the `columnFilters` slice via the existing controlled/uncontrolled
   triad — unchanged.
6. `columnFilterFn` (grid) and the `pivotSourceRows` loop (pivot) call `matchesFilterValue`
   with the `filterType`/`operator` from `resolvedFilters` — unchanged predicate.
7. `AppliedFilters` reads active `columnFilters` + global search + filtered/total counts and
   renders chips + count.

## Error handling & edge cases

- **Empty / cleared filter values** already pass-through via `isFilterValueActive`
  (`filterMatch.ts:49`) and the empty-`{}` guard (`filterMatch.ts:156`) — preserved.
- **Non-numeric cell in a range filter** / **unparseable date in a date filter** are
  excluded (existing predicate behavior) — covered by new tests.
- **Auto-facet flip:** a `text` column can cross `facetThreshold` as data changes, switching
  control type. This is accepted (research-flagged as mildly "magical"); the threshold and
  explicit `filterType` override give full control.
- **High-cardinality id columns** (e.g. `item_id`) infer to `text` contains — usable, not a
  giant dropdown.
- **Synthetic columns** (`select`, `rowActions`) are never filterable.

## Testing plan (test-first)

- **`filterDefaults.test.ts`** (new): the full `dataType → filterType` matrix;
  `resolveFilterType` facet threshold boundary (≤ vs >); server-mode fallback; static-options
  upgrade; status always multiSelect.
- **`DataGrid.filters.test.tsx`** (extend):
  - auto-provision: an **unlisted** column is filterable with the inferred control.
  - opt-out via `enableFiltering: false` and via `filters` `filterable: false`.
  - `features.autoColumnFilters: false` restores opt-in.
  - auto-facet upgrade at/under threshold and `text` fallback above it.
  - **number** range: min, max, between, gt/gte/lt/lte, equals, plus negatives / decimals /
    zero / inverted bounds.
  - **percent** range and **currency** range.
  - **boolean** filter (rendered via `SelectBody`).
  - the old "omitted `filterType`" case now infers correctly (regression for `category`).
  - applied-filter bar: chip render, remove a single chip, clear-all, result count
    (client and server wording); chip metadata persists when a filtered column is hidden.
  - **pivot mode:** auto-provisioned filters reach the pivot Filters popover, and the
    applied-filter bar renders in pivot (lockstep with grid).
  - **server mode:** `fakeServer` derives the correct type so a `text` column does
    contains (not exact match) and `boolean` matches — guarding the §5 regression.
  - **`facetThreshold` end-to-end:** one DataGrid-level assertion that the `facetThreshold`
    prop flows through to inference (prop → `resolvedFilters` → rendered control type),
    not just the pure-module test — this prop→memo seam is the easiest to miss.

## Files touched

- `src/types/grid.ts` — relax `GridFilterConfig`; add `enableFiltering`, `facetThreshold`,
  new feature flags.
- **new** `src/components/DataGrid/filterDefaults.ts` + `filterDefaults.test.ts`.
- `src/components/DataGrid/DataGrid.tsx` — `resolvedFilters` memo; route maps/header/pivot
  through it; new flags; count wiring; render `AppliedFilters`.
- **new** `src/components/DataGrid/AppliedFilters.tsx`.
- `src/components/DataGrid/filters.tsx` — extract/export `summarizeFilter()`.
- `src/components/DataGrid/index.ts` — export new public types.
- `src/data/mockRetailData.ts` — reduce `retailFilters` to genuine overrides; add a
  `boolean` column (e.g. `on_promotion`) so the demo exercises every dataType→filter path.
- `src/data/fakeServer.ts` — derive its `filterTypeById` from the shared `filterDefaults`
  inference over the retail columns, not from the shrunken `retailFilters` list (see §5).
- `src/components/DataGrid/DataGrid.filters.test.tsx` — extend as above.
```
