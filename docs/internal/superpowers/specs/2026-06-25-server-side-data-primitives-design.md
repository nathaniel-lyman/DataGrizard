# Server-side data primitives (`dataMode`) — Design

- **Date:** 2026-06-25
- **Status:** Approved (design)
- **Scope:** Phase 1 of the server-side data effort — manual-mode primitives for the `DataGrid` component. Grid layout only.
- **Out of scope (later phases):** a `dataSource` async wrapper, infinite/lazy scroll, server-side pivot/grouping (SSRM-style), server-computed summary injection, async filter-option fetching, "select all N matching" id-set selection.

## 1. Motivation

`DataGrid` is fully client-side: `data: TData[]` is held in memory and sorting, filtering, search, and pagination all run in the browser (`getFilteredRowModel` / `getSortedRowModel` / `getPaginationRowModel` wired at `DataGrid.tsx:1013-1020`). This caps the component at datasets that fit in memory and forbids any real backend-driven grid.

This phase adds the smallest coherent primitive that unblocks the common case (large, flat, server-paginated tables): a single `dataMode` switch that flips the grid into TanStack "manual" mode and trusts externally supplied `data` + `rowCount`. The component starts no requests and owns no fetching — it rides the controlled-state triad that already exists.

## 2. Decisions (locked during brainstorming)

1. **Opt-in API:** a single `dataMode: "client" | "server"` enum (default `"client"`) plus a `rowCount` prop. Not three independent TanStack flags (avoids incoherent partial states like client-filtering one server page), and an enum rather than a boolean leaves room to add `"infinite"` later.
2. **Degradation philosophy:** *minimal & documented*. No new injection props in phase 1. Behaviors that cannot stay correct over a single page degrade predictably; the contract is documented (§6).
3. **Deliverable:** component primitives + a fake-async server demo in the demo layer + vitest coverage.
4. **Implementation approach:** flags derived from `dataMode` **plus** a `dataModeFeatureDefaults` object merged into `features` exactly like the existing `layoutFeatureDefaults` is merged for `layoutMode` — so every server-mode degradation has one source of truth, and the single shared rendering path is preserved (no second renderer).

## 3. Public API changes

New props on `DataGridProps<TData>` (exported via `src/components/DataGrid/index.ts`):

```ts
/** Whether the grid sorts/filters/paginates locally ("client", default) or
 *  trusts externally supplied `data` + `rowCount` ("server"). Server mode
 *  applies to grid layout only; ignored in pivot layout (phase 1). */
dataMode?: "client" | "server";

/** Total row count on the server. Required for correct pagination in server
 *  mode. If omitted, the grid renders the current page with an unknown total:
 *  the "of N" page/row totals are hidden and Previous/Next page blindly
 *  (Next stays enabled — pageCount is set to TanStack's -1 sentinel — so the
 *  consumer can advance until the server returns a short/empty page). */
rowCount?: number;
```

Both are backward-compatible: omitting `dataMode` is identical to today.

## 4. Derived configuration (Approach 3)

Computed alongside the existing feature merge (`DataGrid.tsx:338-344`):

```ts
const isServerMode = dataMode === "server" && !isPivotLayout; // grid-layout only

const dataModeFeatureDefaults: Partial<DataGridFeatures> = isServerMode
  ? { grouping: false, summaries: false } // cannot be correct over a single page
  : {};

// Consumer overrides remain LAST so every default is reversible.
const features = {
  ...defaultFeatures,
  ...dataModeFeatureDefaults,
  ...layoutFeatureDefaults,
  ...featureOverrides,
};

const deriveFilterOptions = !isServerMode; // gates uniqueColumnValues(...) at DataGrid.tsx:1028
```

`useReactTable` wiring (`DataGrid.tsx:972`):

```ts
manualSorting: isServerMode,
manualFiltering: isServerMode,
manualPagination: isServerMode || isTopLevelPivotPagination, // OR with existing pivot flag (line 999)
rowCount: isServerMode ? rowCount : undefined,               // TanStack derives pageCount
```

Because `isServerMode` is false in pivot layout, the existing `pivotPageCount` / pivot manual-pagination path (`DataGrid.tsx:999-1000`) is untouched, and pivot stays fully client-side.

`aria-rowcount` derivation is refined: in server mode it reflects `rowCount` (the full server total) rather than the in-memory page length, so assistive tech announces "row X of <total>". Exact expression (current code at `DataGrid.tsx:2013` is `headerRowCount + visibleRows.length`):

```ts
aria-rowcount = headerRowCount + (isServerMode ? (rowCount ?? visibleRows.length) : visibleRows.length)
```

## 5. Data flow

The controlled-state triad is unchanged; server mode only changes who acts on the emitted changes.

```
User sorts / filters / searches / pages
  -> emit*Change (useGridState): writes internal state if uncontrolled, fires on*Change
     (manual* flags = true => grid does NOT sort/filter/page locally)
  -> grid renders exactly the rows in `data`, pageCount from rowCount
  -> consumer's on*Change handler reads { sorting, columnFilters, globalFilter, pagination }
     as the server query, refetches, sets new `data` + `rowCount` (+ isLoading)
```

- The existing `on*Change` callbacks **are** the server query params — no new request object is invented.
- Loading/error are consumer-driven through the existing `isLoading` / `loadingState` / `error` / `emptyState` props (`DataGrid.tsx:197-200`). The grid starts no requests, owns no debounce, cancels nothing.
- Works controlled or uncontrolled per slice, exactly as today.

## 6. Degradation contract (server mode, grid layout)

| Behavior | Client mode (today) | Server mode (phase 1) | Mechanism |
|---|---|---|---|
| Sort / column filter / pagination | computed locally | grid emits change, renders `data` as-is | `manual*` flags |
| Global search | filters formatted text locally | box stays; emits `onGlobalFilterChange`; consumer searches | `manualFiltering` |
| Filter `select` options | derived via `uniqueColumnValues(data)` | only static `GridFilterConfig.options`; no derivation | `deriveFilterOptions = false` |
| Summaries bar | aggregates over filtered/selected rows | **off by default** (page-scoped totals would mislead) | `dataModeFeatureDefaults.summaries = false` |
| Grid-mode grouping | TanStack grouped/expanded models | **off by default** (grouping one page is meaningless) | `dataModeFeatureDefaults.grouping = false` |
| Export CSV | all filtered rows across pages | **current page only** (documented) | reads `getFilteredRowModel` = the page |
| Select-all / cross-page selection | all filtered rows via `getSelectedRowModel` | **loaded page only** (documented) | same |
| Pivot layout | client-side | unchanged — `dataMode` ignored in pivot | `isServerMode = ... && !isPivotLayout` |
| Column resize/order/pin/visibility, saved views, detail panel, inline editing, clipboard, keyboard nav, aria | work | **work** (operate on visible rows/cells) | no change |

Two principles:
1. **Nothing silently lies.** Where a number can't be correct over one page (summaries, grouping), the default is *off* rather than *wrong*. Where the scope narrows but stays truthful (export/select = "this page"), it stays on and is documented.
2. **Every default is consumer-overridable.** `features` overrides are last in the merge — e.g. `features={{ summaries: true }}` opts back into page-scoped summaries knowingly.

## 7. Demo wiring

Keeps `src/components/DataGrid/` free of any retail/async assumptions; the demo layer is the only place that knows there is a "server."

- **`src/data/fakeServer.ts`** (new, domain layer): owns the 500 `RetailItem` rows and exposes one async function:
  ```ts
  async function queryRetail(req: {
    sorting: SortingState;
    columnFilters: ColumnFiltersState;
    globalFilter: string;
    pagination: PaginationState;
  }): Promise<{ rows: RetailItem[]; rowCount: number }>;

  // Mutation entry point so demo edits survive a refetch (see App.tsx onCellEdit).
  function applyEdit(itemId: string, columnId: string, value: unknown): void;
  ```
  `queryRetail` applies sort -> filter -> search -> page-slice, wrapped in a ~300ms `setTimeout` to simulate latency. It **reuses the component's exported `matchesFilterValue`** (`filterMatch.ts`) so the demo's "server" filtering matches the grid's client semantics exactly. `applyEdit` mutates the in-memory store by `item_id` so a subsequent `queryRetail` reflects the edit.
- **`src/App.tsx`** gains a Client/Server toggle. In server mode it holds `data` / `rowCount` / `isLoading` in state, controls the `sorting` / `columnFilters` / `globalFilter` / `pagination` slices, and on any `on*Change` calls `queryRetail`, flips `isLoading`, and stores the result. A request-id guard drops stale responses (demonstrating the race-handling the grid intentionally does not own). `onCellEdit` calls `applyEdit` so edits survive a refetch. Client mode is exactly today's behavior.

## 8. Testing

Test-first, vitest + jsdom, new concern-split file **`src/components/DataGrid/DataGrid.server.test.tsx`**. The degradation contract is the spec — one test per row:

1. Manual sort — out-of-order `data`; click sort header; row order unchanged; `onSortingChange` fired.
2. Manual filter / search — emits the callback but renders all provided rows.
3. Pagination from `rowCount` — `rowCount=1000`, `pageSize=25` => last page 40 (not `data.length`); next/prev emit `onPaginationChange`.
4. Filter options not derived — `select` filter with no static `options` shows none; with static `options` shows exactly those.
5. Summaries off / grouping off by default in server mode; on in client mode; `features={{ summaries: true }}` re-enables.
6. Export = current page only in server mode.
7. Pivot ignores `dataMode` — `layoutMode="pivot"` + `dataMode="server"` still client-materializes and aggregates.
8. Backward-compat — omitting `dataMode` behaves exactly as client.
9. Controlled + server — controlling pagination in server mode emits without writing internal state.
10. `rowCount` omitted — server mode renders the page without crashing; unknown total handled gracefully.
11. `aria-rowcount` reflects `rowCount` in server mode.

Plus a small unit test for `queryRetail` (sort/filter/page correctness + stale-response guard).

## 9. Risks & mitigations

- **Incoherent mixed state** (e.g. consumer forgets to refetch on a callback): grid simply shows stale `data`; documented as consumer responsibility. The single `dataMode` switch prevents partial-manual footguns by construction.
- **`manualPagination` collision with pivot:** avoided by scoping `isServerMode` to non-pivot layout and OR-ing the flags.
- **Surprise behavior changes** for existing consumers: none — all new behavior is gated behind `dataMode === "server"`, default `"client"`.

## 10. Files touched

- `src/components/DataGrid/DataGrid.tsx` — props, derived config, `useReactTable` wiring, filter-option gating, `aria-rowcount`.
- `src/components/DataGrid/index.ts` — export any new public types (no new types expected beyond the prop additions on `DataGridProps`).
- `src/data/fakeServer.ts` — new demo data source.
- `src/App.tsx` — Client/Server toggle + server-mode state wiring.
- `src/components/DataGrid/DataGrid.server.test.tsx` — new test file.
