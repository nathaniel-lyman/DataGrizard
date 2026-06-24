# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A Vite + React 19 + TypeScript project whose **product is a single reusable component: `DataGrid`** (built on TanStack Table v8). The retail "Recommendation Workbench" screen is *only a demo consumer* that exercises the component's public surface — it is not the deliverable.

`AGENTS.md` holds the detailed contribution rules (directory layout, naming, the component-surface boundary). This file does not repeat them; it focuses on commands and the cross-file architecture you only get by reading `DataGrid.tsx` end to end.

## Commands

- `npm run dev` — Vite dev server at http://127.0.0.1:5173/ (host pinned to 127.0.0.1).
- `npm run build` — `tsc -b && vite build`. The `tsc -b` step **is** the type-check (project references in `tsconfig.json` → `tsconfig.app.json` for `src`, `tsconfig.node.json` for config files). Run `npx tsc -b` alone for a type-check without bundling. This builds the **demo app**, not the library.
- `npm run build:package` — build the distributable **library** to `dist/`: ESM `datagrid.js` + CJS `datagrid.cjs` (peers externalized via `vite.lib.config.ts`), declarations under `dist/types/` (`tsc -p tsconfig.lib.json`, emit-only), and precompiled `datagrid.css` (Tailwind via `tailwind.lib.config.js`). `prebuild:package` wipes `dist/` first. `package.json` exposes these through `exports`/`main`/`module`/`types` + a `./styles.css` subpath; react/react-dom/@tanstack are `peerDependencies`.
- `npm run preview` — serve the production `dist/` build.
- `npm test` — `vitest run` (single pass, no watch; jsdom env from `vite.config.ts`).
  - Single file: `npx vitest run src/components/DataGrid/DataGrid.test.tsx`
  - Single test by name: `npx vitest run -t "uses column visibility"`
  - Watch mode: `npx vitest`
  - Tests are split by concern next to the engine: `DataGrid.test.tsx` (pivot) plus `DataGrid.{grid,a11y,usability,controlled,config,filters,virtual}.test.tsx`, and `src/utils/formatters.test.ts`. Behavioral work here is test-first.

There is **no ESLint/Prettier setup** — don't invent a `lint` script. Type safety is enforced only by `tsc -b`.

## The prime architectural rule

`src/components/DataGrid/` must stay **domain-neutral and generic over `TData extends object`**. No retail field names, copy, status values, labels, or mock-data assumptions belong inside it. Anything domain-specific lives in `src/data/` (configs + mock rows), `src/demo/` (detail panels, actions), or `src/App.tsx` (composition). New configurable behavior is added as a typed prop or a feature flag, never a hardcoded assumption. See `AGENTS.md` § "Component-Surface First" for the full policy.

## Architecture (it almost all lives in `DataGrid.tsx`)

`DataGrid.tsx` is the main engine — state, shared table rendering, the filter engine, and optional row virtualization. `pivot.tsx` owns pivot public types plus materialization into normal TanStack rows/columns. `Toolbar.tsx` is a dumb, fully prop-driven child (search / filters / column menu / group-by builder / saved views); `icons.tsx` holds its inline SVGs. `index.ts` is the public boundary — **export any new public type there**. Subsystems to understand before editing:

- **Controlled / uncontrolled hybrid state.** Every state slice (sorting, globalFilter, columnFilters, columnVisibility, columnSizing, columnOrder, columnPinning, pagination, rowSelection, grouping, expanded, pivot, savedViews, activeViewName) follows one pattern: a `current*` value resolves as `controlledState?.X ?? internalUseState`, and an `emit*Change` helper resolves the updater, writes internal state **only when that slice is uncontrolled** (`controlledState?.X === undefined`), persists if needed, then fires the optional `on*Change` callback. Each slice is independently controllable. When adding state, replicate this triad (`current*`, `emit*Change`, optional `on*Change` prop) — do not call `setState` directly in handlers.

- **Feature flags × layout modes.** `features` is merged as `{ ...defaultFeatures, ...layoutFeatureDefaults, ...featureOverrides }`. `layoutMode` (`"grid"` | `"pivot"`) keeps pivot grouping controls on, but pivot rows/measure columns are materialized before `useReactTable` and then rendered through the shared `table.getHeaderGroups()` / `row.getVisibleCells()` path. Pivot row-label, measure, and column-axis bucket columns are generated `ColumnDef`s, so sorting, resizing, visibility, ordering, pinning, saved views, pagination, and virtualization use the standard table chrome.

- **Persistence is opt-in and scoped.** Only when a `storageKey` prop is given are exactly four slices written to `localStorage`: `${storageKey}.columnSizing`, `.columnOrder`, `.columnPinning`, `.savedViews`. All other state is in-memory. Writes live **inside** the `controlledState?.X === undefined` guard, so a slice the consumer controls is never persisted by the grid. The `loadJson`/`saveJson`/`removeJson` helpers guard `typeof window === "undefined"` and swallow parse errors. Never introduce an unscoped/global key (two grids would collide).

- **Column config drives cell rendering.** `GridColumnConfig<TData>` (in `src/types/grid.ts`) is the public column contract — a **per-key distributive union** so value-typed callbacks (`formatValue`, `getCellClassName`, `conditionalFormats`…) receive `TData[accessorKey]`, not `unknown`. Internally the engine casts columns once to a value-erased `AnyColumnConfig<TData>` (in `DataGrid.tsx`). `renderCellValue` dispatches on `column.dataType` (`text` | `number` | `currency` | `percent` | `status`) to the locale-aware formatters (driven by `locale`/`currency` props), unless `column.formatValue` overrides; non-finite/blank numerics render empty (no `$NaN`/fake `$0`). `status` pills are styled by `getStatusClassName` **or** the declarative `statusStyles` map. Numeric types right-align with `tabular-nums`; per-cell classes come from `getCellClassName` **and** the declarative `conditionalFormats` rules (composed). Column filters use a single `gridColumnFilterFn` supporting `select` (exact), `multiSelect` (array), and `range` ({min,max}); global search matches **formatted** text via `getColumnSearchText`.

- **Summaries and pivot measures.** `summaryItems` render a summary bar in grid mode and are adapted into pivot measures for compatibility. New pivot consumers should pass `pivot.measures` with built-in or custom aggregations. Each summary item's `value`/`description` receives a `DataGridSummaryContext` (`rows`, `filteredRows`, `selectedRows`, `allRows`, `scope`). `scope` is `"filtered"` | `"selected"` | `"group"`; `summarySelectionMode="auto"` flips filtered→selected once any row is selected.

- **Grouping, expansion & row windowing.** Grid mode uses TanStack's grouped/expanded row models. Pivot mode owns grouping in the materializer via `pivot.rows` and stable IDs such as `pivot:group|department=Grocery`; do not reintroduce a pivot-only table renderer. `pivot.columns` builds nested generated header groups and per-bucket measure IDs like `measure:revenue|col:department=Grocery`, plus subtotal and grand-total generated columns. `totalBehavior` is resolved in the materializer for total buckets. `visibleRows` is the single source of what renders. For grid grouping without pagination, flatten over the nested `getExpandedRowModel()`; grid + pagination and pivot use `table.getRowModel().rows`. Pivot pagination defaults to `topLevelGroups` (manual page count, children stay with parents) and can opt into flat `visibleRows`. When `virtualizeRows` is set, `renderBodyRows` windows `visibleRows` via `@tanstack/react-virtual` using top/bottom spacer `<tr>`s + `measureElement`.

- **Generated pivot column state.** Pivot generated IDs must be reconciled whenever axes/measures change. Keep `pivot:rowLabel` and current `measure:*` IDs, prune stale generated IDs from visibility/order/pinning, and append missing generated IDs in the materialized order.

- **Pivot selection.** Pivot selection defaults to `sourceRows`: selecting an aggregate row toggles every source row under it, header select-all toggles all filtered source rows, and selected counts/summaries read source IDs from `rowSelection`. Other selection modes fall back to pivot-row selection and should be treated as less complete until intentionally expanded.

- **Detail panel & active row.** `activeRow` is internal state (not a controlled slice) surfaced via the `onActiveRowChange` callback. `renderDetailPanel(row, { close })` is handed a close control; clicking the active row again toggles it shut and Escape closes it. Grid leaf rows and actionable pivot rows get `role="button"` + `tabIndex` and Enter/Space handlers **only** when a row action exists (`renderDetailPanel` or `onRowClick`).

## Demo / consumer layer

`src/App.tsx` wires it together with a Grid/Pivot layout toggle (pivot = summary subtotals; grid = item-level rows + the detail panel) and opts into `virtualizeRows`. `src/data/mockRetailData.ts` defines the `RetailItem` type, the retail column/filter/summary configs (filters use `select` / `multiSelect` / `range` types), status pill styles, and 500 deterministic synthetic rows (`seededRandom` via `Math.sin` — stable across reloads). `src/demo/RetailDetailPanel.tsx` is the `renderDetailPanel` consumer. `src/utils/formatters.ts` holds the shared, locale-aware currency/number/percent/signed-percent/status-label formatters used by both the grid and the demo.
