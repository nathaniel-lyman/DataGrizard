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

`DataGrid.tsx` (~1700 lines) is the entire engine — state, both layout renderers, the filter engine, and optional row virtualization. `Toolbar.tsx` is a dumb, fully prop-driven child (search / filters / column menu / group-by builder / saved views); `icons.tsx` holds its inline SVGs. `index.ts` is the public boundary — **export any new public type there**. Subsystems to understand before editing:

- **Controlled / uncontrolled hybrid state.** Every state slice (sorting, globalFilter, columnFilters, columnVisibility, columnSizing, columnOrder, pagination, rowSelection, grouping, expanded, savedViews, activeViewName) follows one pattern: a `current*` value resolves as `controlledState?.X ?? internalUseState`, and an `emit*Change` helper resolves the updater, writes internal state **only when that slice is uncontrolled** (`controlledState?.X === undefined`), persists if needed, then fires the optional `on*Change` callback. Each slice is independently controllable. When adding state, replicate this triad (`current*`, `emit*Change`, optional `on*Change` prop) — do not call `setState` directly in handlers.

- **Feature flags × layout modes.** `features` is merged as `{ ...defaultFeatures, ...layoutFeatureDefaults, ...featureOverrides }`. `layoutMode` (`"grid"` | `"pivot"`) injects `layoutFeatureDefaults`: **pivot disables rowSelection, detailPanel, and pagination, and forces grouping on**, then renders a completely different Excel-style table (cyan header/footer, "Row Labels" column, Grand Total `tfoot`). The `features` prop overrides both. Many code paths branch on `isPivotLayout` — check both layouts when changing rendering.

- **Persistence is opt-in and scoped.** Only when a `storageKey` prop is given are exactly three slices written to `localStorage`: `${storageKey}.columnSizing`, `.columnOrder`, `.savedViews`. All other state is in-memory. Writes live **inside** the `controlledState?.X === undefined` guard, so a slice the consumer controls is never persisted by the grid. The `loadJson`/`saveJson`/`removeJson` helpers guard `typeof window === "undefined"` and swallow parse errors. Never introduce an unscoped/global key (two grids would collide).

- **Column config drives cell rendering.** `GridColumnConfig<TData>` (in `src/types/grid.ts`) is the public column contract — a **per-key distributive union** so value-typed callbacks (`formatValue`, `getCellClassName`, `conditionalFormats`…) receive `TData[accessorKey]`, not `unknown`. Internally the engine casts columns once to a value-erased `AnyColumnConfig<TData>` (in `DataGrid.tsx`). `renderCellValue` dispatches on `column.dataType` (`text` | `number` | `currency` | `percent` | `status`) to the locale-aware formatters (driven by `locale`/`currency` props), unless `column.formatValue` overrides; non-finite/blank numerics render empty (no `$NaN`/fake `$0`). `status` pills are styled by `getStatusClassName` **or** the declarative `statusStyles` map. Numeric types right-align with `tabular-nums`; per-cell classes come from `getCellClassName` **and** the declarative `conditionalFormats` rules (composed). Column filters use a single `gridColumnFilterFn` supporting `select` (exact), `multiSelect` (array), and `range` ({min,max}); global search matches **formatted** text via `getColumnSearchText`.

- **Summaries.** `summaryItems` render a summary bar in grid mode; `groupSummaryItems` render inside group rows and pivot rows/footer. Each item's `value`/`description` are callbacks receiving a `DataGridSummaryContext` (`rows`, `filteredRows`, `selectedRows`, `allRows`, `scope`). `scope` is `"filtered"` | `"selected"` | `"group"`; `summarySelectionMode="auto"` flips filtered→selected once any row is selected. Group/pivot contexts are built from a group's *leaf* rows.

- **Grouping, expansion & row windowing.** Multi-level grouping via TanStack's grouped/expanded row models. `visibleRows` is the single source of what renders, and **how it's derived is correctness-critical**: flatten over the *nested* `getExpandedRowModel()` (`flattenExpandedRows` for grid, `flattenPivotRows` for pivot) — NOT the final `getRowModel()`, which is already flattened once the pagination model is registered and would double-emit leaves. Exception: grid + pagination renders `getRowModel().rows` directly (already flat + paginated). Gotcha: `expanded` may be the literal boolean `true` (pivot's default = all expanded) *or* a `Record<id, boolean>` — toggle/flatten logic must handle both. When `virtualizeRows` is set, `renderBodyRows` windows `visibleRows` via `@tanstack/react-virtual` using top/bottom spacer `<tr>`s + `measureElement` (works for leaf, group, and pivot rows); off by default.

- **Detail panel & active row.** `activeRow` is internal state (not a controlled slice) surfaced via the `onActiveRowChange` callback. `renderDetailPanel(row, { close })` is handed a close control; clicking the active row again toggles it shut and Escape closes it. Grid leaf rows and actionable pivot rows get `role="button"` + `tabIndex` and Enter/Space handlers **only** when a row action exists (`renderDetailPanel` or `onRowClick`).

## Demo / consumer layer

`src/App.tsx` wires it together with a Grid/Pivot layout toggle (pivot = summary subtotals; grid = item-level rows + the detail panel) and opts into `virtualizeRows`. `src/data/mockRetailData.ts` defines the `RetailItem` type, the retail column/filter/summary configs (filters use `select` / `multiSelect` / `range` types), status pill styles, and 500 deterministic synthetic rows (`seededRandom` via `Math.sin` — stable across reloads). `src/demo/RetailDetailPanel.tsx` is the `renderDetailPanel` consumer. `src/utils/formatters.ts` holds the shared, locale-aware currency/number/percent/signed-percent/status-label formatters used by both the grid and the demo.
