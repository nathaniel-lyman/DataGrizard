# DataGrizard

A trustworthy, **domain-neutral analytical control plane for agents**, delivered
as a reusable React data grid built on
[TanStack Table v8](https://tanstack.com/table/v8). One component, two layouts
(**grid** and Excel-style **pivot**), with grouping, saved views, summaries,
column management, column pinning, conditional formatting, and a fully controllable state
surface.

The product is the `DataGrid` component. The retail "Recommendation Workbench"
screen in `src/App.tsx` is only a demo consumer that exercises the public API.

---

## Install

```bash
npm install datagrizard
```

`react`, `react-dom`, and `@tanstack/react-table` are **peer dependencies** —
install them in your app if you haven't already:

```bash
npm install react react-dom @tanstack/react-table
```

DataGrizard has no regular runtime dependencies. Its UI icons are local SVG
components, and its internal row-virtualization implementation is bundled, so
consumers do not install `lucide-react` or `@tanstack/react-virtual`.

## Compatibility

- React and React DOM 18.2.x or 19.x.
- Chrome and Edge 111+, Firefox 121+, and Safari 16.2+ (including iOS Safari).

The package CSS is shipped as modern CSS without legacy fallbacks or
autoprefixing. Its browser floor is set by features including `color-mix()`,
`:has()`, and dynamic viewport units such as `dvh`.

## Styling

Import the package stylesheet once, before your own overrides:

```ts
import "datagrizard/styles.css";
import "./grid-theme.css";
```

The stylesheet is hand-written, fully scoped to the grid's `dg-*` classes, and
does not ship a global reset or require Tailwind in the consuming app. Override
the design tokens in CSS loaded after the package stylesheet:

```css
.analytics-grid .dg-root {
  --dg-accent: #1d4ed8;
  --dg-accent-text: #ffffff;
  --dg-radius: 0.5rem;
}
```

### Theme tokens

| Token | Default | Controls |
| --- | --- | --- |
| `--dg-bg` | `#ffffff` | Grid and row background |
| `--dg-surface` | `#f8fafc` | Headers, toolbars, grouped rows, and zebra surfaces |
| `--dg-surface-raised` | `#ffffff` | Menus, popovers, and sheets |
| `--dg-hover` | `#f1f5f9` | Hover surfaces |
| `--dg-active` | `#e2e8f0` | Pressed and active surfaces |
| `--dg-border` | `#e2e8f0` | Default borders |
| `--dg-border-strong` | `#cbd5e1` | Emphasized borders and controls |
| `--dg-text` | `#0f172a` | Primary text |
| `--dg-text-strong` | `#020617` | Strong headings and values |
| `--dg-text-muted` | `#64748b` | Secondary text |
| `--dg-text-faint` | `#94a3b8` | Placeholders and tertiary text |
| `--dg-accent` | `#0f172a` | Primary buttons and active toggles |
| `--dg-accent-text` | `#ffffff` | Text on accent surfaces |
| `--dg-accent-bg` | `#f1f5f9` | Selection and focus wash |
| `--dg-accent-hover` | `#1e293b` | Hover state for accent controls |
| `--dg-danger` | `#be123c` | Destructive text and controls |
| `--dg-danger-bg` | `#fff1f2` | Destructive backgrounds |
| `--dg-danger-solid` | `#be123c` | Solid validation-error surface |
| `--dg-danger-ring` | `#fecdd3` | Validation focus ring |
| `--dg-on-danger` | `#ffffff` | Text on solid danger surfaces |
| `--dg-success` | `#047857` | Success text and positive states |
| `--dg-info-bg` | `#eff6ff` | Informational backgrounds |
| `--dg-info-text` | `#1e40af` | Informational text |
| `--dg-radius` | `0.375rem` | Standard control radius |
| `--dg-radius-sm` | `0.25rem` | Compact control radius |
| `--dg-font-family` | `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` | Grid font stack |
| `--dg-font-size` | `0.875rem` | Base grid font size |
| `--dg-shadow` | `0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)` | Raised-surface shadow |
| `--dg-ring` | `#cbd5e1` | Default focus ring |
| `--dg-ring-strong` | `#64748b` | Emphasized focus ring |
| `--dg-pivot-grand-bg` | `#cffafe` | Pivot grand-total background |
| `--dg-pivot-group-bg` | `#ecfeff` | Pivot grouped-row background |
| `--dg-pivot-border` | `#a5f3fc` | Pivot emphasis borders |
| `--dg-range-bg` | `#dbeafe` | Selected cell-range background |
| `--dg-selection-ring` | `#2563eb` | Cell-selection outline |
| `--dg-info-border` | `#bfdbfe` | Informational borders |
| `--dg-info-strong` | `#1e3a8a` | Strong informational text |
| `--dg-danger-border` | `#fecaca` | Destructive borders |
| `--dg-overlay-bg` | `rgb(255 255 255 / 0.9)` | Loading and state overlays |
| `--dg-backdrop` | `rgb(15 23 42 / 0.4)` | Bottom-sheet backdrop |
| `--dg-progress-fill` | `#0f172a` | Default progress-bar fill |
| `--dg-data-bar` | `#0ea5e9` | Default positive data-bar fill |
| `--dg-data-bar-negative` | `#ef4444` | Default negative data-bar fill |
| `--dg-pinned-shadow-left` | `2px 0 4px -2px rgb(15 23 42 / 0.28)` | Left-pinned column edge |
| `--dg-pinned-shadow-right` | `-2px 0 4px -2px rgb(15 23 42 / 0.28)` | Right-pinned column edge |

### Dark preset

Opt into the built-in dark preset by placing `dg-theme-dark` on an ancestor of
the grid. It reassigns the same token contract; no `theme` prop or automatic
color-scheme switch is involved.

```tsx
<div className="dg-theme-dark">
  <DataGrid data={data} columns={columns} />
</div>
```

**Consumer-supplied class names** from `statusStyles`, `conditionalFormats`,
`getCellClassName`, or `getRowClassName` remain pass-through values. Define
those classes in your own stylesheet (or your own Tailwind build); the package
stylesheet contains only DataGrizard's own `dg-*` classes.

---

## Quick start (grid)

```tsx
import { DataGrid, type GridColumnConfig } from "datagrizard";

type Product = {
  id: string;
  name: string;
  category: string;
  revenue: number;
  margin: number;
};

const columns: GridColumnConfig<Product>[] = [
  { accessorKey: "name", header: "Product", dataType: "text" },
  { accessorKey: "category", header: "Category", dataType: "text", enableGrouping: true },
  { accessorKey: "revenue", header: "Revenue", dataType: "currency" },
  {
    accessorKey: "margin",
    header: "Margin",
    dataType: "percent",
    conditionalFormats: [{ when: (value) => value < 0.2, className: "text-amber-700 font-semibold" }],
  },
];

export function Demo({ data }: { data: Product[] }) {
  return (
    <div className="h-[600px]">
      <DataGrid
        data={data}
        columns={columns}
        getRowId={(row) => row.id}
        rowLabel="products"
        tableLabel="Product performance"
        storageKey="product-grid"
        renderDetailPanel={(row, { close }) =>
          row ? (
            <aside className="w-72 border-l p-4">
              <button onClick={close}>Close</button>
              <h2>{row.name}</h2>
            </aside>
          ) : null
        }
      />
    </div>
  );
}
```

`getRowId` is strongly recommended — stable IDs keep row selection and the
active detail row correct across data updates.

## Pivot layout

```tsx
<DataGrid
  data={data}
  columns={columns}
  layoutMode="pivot"
  pivot={{
    rows: ["category"],
    columns: [{ columnId: "week", order: "asc" }],
    measures: [
      { id: "rev", columnId: "revenue", label: "Revenue", aggregation: "sum" },
      { id: "units", columnId: "units", label: "Units", aggregation: "sum" },
    ],
    defaultState: { paginationMode: "topLevelGroups" },
  }}
/>
```

Pivot mode materializes grouped pivot rows and generated measure columns, then
renders them through the same TanStack Table path as grid mode:
`table.getHeaderGroups()`, `row.getVisibleCells()`, and `flexRender(...)`.
Generated pivot columns participate in sorting, resizing, visibility, ordering,
pinning, saved views, pagination, and virtualization.

`pivot.rows` defines the row axis. `pivot.columns` optionally defines a column
axis and produces nested TanStack header groups such as Week → Revenue / Units,
plus a generated Grand Total column group. Without a column axis, measures render
as simple columns beside `Row Labels`.

Pivot row selection defaults to source-row semantics: selecting a group row
selects all filtered source rows beneath that group, and the selected count
reports source rows. `pivot.defaultState.paginationMode` supports
`"topLevelGroups"` (default, keeps expanded children with their parent) and
`"visibleRows"` (flat row-window pagination).

Column-axis pivots generate subtotal columns for nested axis groups and a Grand
Total column group. Measures can choose `totalBehavior: "aggregate"`,
`"sumVisibleChildren"`, or `"blank"` for those total cells.

`summaryItems` / `groupSummaryItems` are still accepted in pivot mode as a
compatibility adapter, but new consumers should use `pivot.measures`.

---

## Column configuration

```ts
type GridColumnConfig<TData> = {
  accessorKey: keyof TData & string;
  header: string;
  dataType: "text" | "number" | "currency" | "percent" | "status" | "date" | "boolean";
  semantic?: {
    description?: string;
    synonyms?: string[];
    unit?: string;
    currency?: string;
    allowedValues?: Array<string | number | boolean | null>;
    sensitivity?: string;
  };
  width?: number; minWidth?: number; maxWidth?: number;
  pinned?: "left" | "right";
  enablePinning?: boolean;
  enableGrouping?: boolean;
  // value is typed as TData[accessorKey] — not `unknown`.
  formatValue?: (value, row) => ReactNode;
  getCellClassName?: (value, row) => string;
  getStatusClassName?: (value, row) => string;
  statusStyles?: Record<string, string>;          // declarative status pills
  conditionalFormats?: { when: (value, row) => boolean; className: string }[];
  formatGroupingValue?: (value, rows) => ReactNode;
  getGroupingValue?: (row) => unknown;
};
```

- `dataType` drives default formatting and alignment. `number`/`currency`/`percent`
  right-align with `tabular-nums`; non-finite / blank values render empty (no
  `$NaN` or fake `$0`).
- `boolean` renders `True` / `False`, participates in boolean-aware sorting,
  global search, filtering, and inline editing.
- `status` renders a pill. Style it declaratively with `statusStyles`
  (`{ active: "bg-emerald-50 text-emerald-700 border-emerald-200" }`) or
  imperatively with `getStatusClassName`.
- `conditionalFormats` rules compose — every matching rule contributes its class.
- `pinned` sets an initial frozen side for a column. Set `enablePinning: false`
  to keep a column out of the Columns menu pin controls.
- `semantic` is optional consumer-owned business metadata. The reusable grid
  does not assume a vocabulary or sensitivity taxonomy; its agent toolkit uses
  this metadata to describe columns and enforce the caller's sensitivity
  allowlist.

## Clipboard, range selection, and batch editing

With `editing`, `cellSelection`, and `clipboard` enabled (the grid defaults),
users can drag or Shift+Arrow to select a rectangle, copy it with Ctrl/Cmd-C,
and paste spreadsheet TSV with Ctrl/Cmd-V. Quoted tabs, escaped quotes, embedded
newlines, CRLF input, localized currency/number text, percentages, and common
boolean labels are parsed. Paste uses the browser's native `paste` event, so it
does not require async Clipboard API read permission. The status bar reports how
many cells were copied, pasted, or skipped.

Every pasted value still passes through the column's `parseValue` and `validate`
contracts. A custom `parseValue` receives the original clipboard text; otherwise
the built-in numeric/boolean normalization runs first. Read-only, invalid, and
out-of-bounds cells are skipped without blocking valid cells in the same paste.

Existing consumers can keep handling edits one cell at a time:

```tsx
<DataGrid onCellEdit={(edit) => updateCell(edit)} />
```

For an atomic store or server transaction, provide `onCellEditBatch`. It takes
precedence for paste and fill operations while ordinary inline edits continue
to use `onCellEdit`:

```tsx
<DataGrid
  onCellEdit={(edit) => updateCell(edit)}
  onCellEditBatch={({ source, edits, skippedCellCount }) => {
    applyCellTransaction({ source, edits, skippedCellCount });
  }}
/>
```

## Filters

```ts
filters={[
  { accessorKey: "category", label: "Category" },                       // select (exact match)
  { accessorKey: "brand",    label: "Brand", filterType: "multiSelect" },
  { accessorKey: "revenue",  label: "Revenue", filterType: "range" },   // numeric min/max
  { accessorKey: "name",     label: "Name", filterType: "text" },
  { accessorKey: "active",   label: "Active", filterType: "boolean" },
  { accessorKey: "createdAt", label: "Created", filterType: "date" },
]}
```

Select filters use **exact** matching (no substring leakage). Options default to
the distinct column values, or pass `options`. Global search matches the
**formatted** text users see (`$1,200`, `12.0%`, `In Progress`) as well as raw
values.

Column filters support operator-aware clauses while preserving the legacy raw
values. The header filter popover exposes contextual operators such as
`contains`, `startsWith`, `equals`, `gt`, `between`, `before`, `after`,
`isEmpty`, and `isNotEmpty`.

```tsx
<DataGrid
  data={rows}
  columns={columns}
  filters={[
    {
      accessorKey: "name",
      label: "Name",
      filterType: "text",
      operators: ["contains", "startsWith", "equals", "isEmpty"],
    },
    {
      accessorKey: "revenue",
      label: "Revenue",
      filterType: "range",
      operator: "gte",
    },
  ]}
  state={{
    columnFilters: [
      { id: "name", value: { operator: "startsWith", value: "Blue" } },
      { id: "revenue", value: { operator: "gte", value: 1000 } },
    ],
  }}
/>
```

## Summaries

`summaryItems` render a summary bar in grid mode and remain a pivot compatibility
adapter. New pivot callers should use `pivot.measures` with built-in aggregations
(`count`, `sum`, `avg`, `min`, `max`) or a custom aggregation function. Each
summary item's `value`/`description` is a callback receiving
`{ rows, filteredRows, selectedRows, allRows, scope }`. With
`summarySelectionMode="auto"` (default) the scope flips from filtered to selected
once any row is selected. Selected scope is intersected with the active filter.

## Controlled / uncontrolled

Every state slice is independently controllable. Omit `state.X` to let the grid
manage it internally; provide `state.X` + `onXChange` to control it:

```tsx
const [sorting, setSorting] = useState([]);
<DataGrid state={{ sorting }} onSortingChange={setSorting} ... />
```

Controllable slices: `sorting`, `globalFilter`, `columnFilters`,
`columnVisibility`, `columnSizing`, `columnOrder`, `columnPinning`,
`pagination`, `rowSelection`, `selectedColumnIds`, `cellSelection`,
`columnPresentation`, `grouping`, `expanded`, `pivot`, `savedViews`,
`activeViewName`. Use `onSelectedColumnIdsChange`, `onCellSelectionChange`, and
`onColumnPresentationChange` for the corresponding new slices. When a slice is controlled, the grid never writes it to
`localStorage` — persistence is yours.

## Programmatic grid API

Pass an `apiRef` when an assistant, application command palette, or other
automation needs to inspect and manipulate the grid. The API exposes detached
snapshots, bounded data reads, aggregations, and domain-neutral commands; it
does not expose the internal TanStack Table instance.

```tsx
import { useRef } from "react";
import { DataGrid, type DataGridApi } from "datagrizard";

const gridApi = useRef<DataGridApi<Product>>(null);

<DataGrid apiRef={gridApi} data={data} columns={columns} getRowId={(row) => row.id} />;

const snapshot = gridApi.current?.getSnapshot();
const rows = gridApi.current?.query({
  scope: "filtered",
  columnIds: ["product", "revenue", "margin"],
  limit: 50,
});
const totals = gridApi.current?.aggregate({
  scope: "filtered",
  metrics: [
    { operation: "count", as: "products" },
    { operation: "sum", columnId: "revenue", as: "revenue" },
    { operation: "average", columnId: "margin", as: "margin" },
  ],
  groupBy: ["category"],
});

// Canonical integration path when the grid may use a complete remote dataset.
const remoteRows = await gridApi.current?.queryAsync({
  scope: "filtered",
  columnIds: ["product", "revenue", "margin"],
  limit: 50,
});
const remoteTotals = await gridApi.current?.aggregateAsync({
  scope: "filtered",
  metrics: [{ operation: "sum", columnId: "revenue", as: "revenue" }],
});
const proposed = gridApi.current?.plan([
  { type: "set_column_visibility", columnIds: ["margin"], visible: false },
  { type: "move_columns", columnIds: ["revenue"], beforeColumnId: "category" },
  { type: "set_sorting", sorting: [{ id: "revenue", desc: true }] },
]);
if (proposed?.ok) {
  // `diff` is a detached before/after preview; the grid is still unchanged.
  console.log(proposed.plan.diff);
  const validated = gridApi.current?.validatePlan(proposed.plan);
  const applied = validated?.ok ? gridApi.current?.applyPlan(proposed.plan) : null;
  if (applied?.ok) gridApi.current?.undo(applied.receipt.transactionId);
}
```

The action lifecycle is `plan → validate → apply → undo`. Planning previews a
structured before/after diff without mutation. Validation checks the complete
batch, and apply repeats validation before emitting any state change. Plans
carry their base grid revision and are rejected with `stale_revision` when the
live grid changes. A successful apply returns a transaction receipt for undo.
The lower-level `dispatch()` compatibility method remains available and still
validates the entire batch before applying any command.

The first API surface supports column visibility, ordering, pinning, sizing and
reset; sorting; global and column filters; pagination; row, column, and cell
selection; declarative column presentation; grouping; and pivot state. The
snapshot reports column capabilities, current view state, feature flags,
layout/data modes, and loaded/filtered/selected/visible row counts.

`query()` supports `all`, `filtered`, `selected_rows`, and `visible_page`.
`aggregate()` supports count, sum, average, min, max, min/max, distinct count,
top values, and grouped metrics. Results contain plain serializable values.
Reads default to 100 rows / 2,000 cells and can be tightened with
`dataAccessLimits`. In server mode, `all` and `filtered` explicitly return
`scope_unavailable`; DataGrizard never summarizes a loaded page as though it
were the complete server dataset. `queryAsync()` and `aggregateAsync()` return
the same result unions, but may route `all` and `filtered` through an opt-in
`serverAnalysis` adapter. They accept `{ signal }` for caller cancellation.
Use the async methods for assistants and integrations that may cross a remote
boundary; the synchronous methods remain local-only.

## Agent toolkit

`createDataGridAgentToolkit()` provides provider-neutral JSON schemas plus one
executor. Its schemas are generated from the mounted grid—not from a static
catalog. They reflect source column IDs and types, semantic metadata, resolved
filter operators and allowed values, aggregate operations legal for each type,
enabled features, layout/data mode, live policies, and data-access limits.

Add business meaning to the same generic column config used by the grid:

```tsx
const columns = [
  {
    accessorKey: "amount",
    header: "Amount",
    dataType: "currency",
    semantic: {
      description: "Recognized amount for the current record.",
      synonyms: ["value", "total"],
      currency: "USD",
      sensitivity: "internal",
    },
  },
] satisfies GridColumnConfig<Row>[];
```

Provider SDKs and authorization decisions stay in the consumer layer:

```tsx
import { createDataGridAgentToolkit } from "datagrizard";

const toolkit = createDataGridAgentToolkit({
  api: gridApi,
  policy: () => ({
    operations: [
      "get_context", "query_rows", "aggregate",
      "set_column_visibility", "set_sorting", "set_global_filter",
      "set_column_filters", "set_pagination", "set_column_presentation",
      "undo",
    ],
    scopes: ["filtered", "visible_page"],
    columns: ({ column, operation }) =>
      column.semantic?.sensitivity !== "restricted" &&
      !(operation === "set_column_presentation" && column.id === "amount"),
  }),
  limits: { maxRowsPerQuery: 100, maxCellsPerQuery: 2_000 },
});

// `tools` is a live getter. Read it when preparing each provider request.
// Tools, scopes, and column choices disappear when policy/features no longer allow them.
const tools = toolkit.tools;
const output = await toolkit.execute(toolCall.name, toolCall.arguments);
```

The available tools are drawn from `grid_get_context`, `grid_query_rows`,
`grid_aggregate`, `grid_plan_actions`, `grid_validate_plan`,
`grid_apply_plan`, and `grid_undo`. Agent mutations never apply directly:
`grid_plan_actions` returns a preview and plan ID, which must be validated and
then applied. A tool is omitted when current operation, scope, or column policy
and grid features make it unavailable. In server mode, whole-dataset `all` and
`filtered` scopes are omitted rather than pretending the loaded page is the
dataset. The executor repeats policy, stale-revision, and type-legal aggregation
checks; the JSON schema is not treated as a security boundary by itself.

Formatting is serializable through `columnPresentation`: number/date formats,
color scales, data bars, progress bars, and operator/tone rules. The schema does
not accept CSS class names, JavaScript predicates, arbitrary formulas, or code.
Presentation is included in snapshots, scoped persistence, commands, and saved
views.

## Server data

For the common server-backed table, pass `dataSource`. The grid owns sorting,
search, column filters, and pagination, calls your adapter with those slices, and
renders in server mode:

```tsx
<DataGrid
  columns={columns}
  getRowId={(row) => row.id}
  dataSource={async ({ sorting, columnFilters, globalFilter, pagination, signal }) => {
    const response = await fetch("/api/products/query", {
      method: "POST",
      signal,
      body: JSON.stringify({ sorting, columnFilters, globalFilter, pagination }),
    });
    return response.json() as Promise<{ rows: Product[]; rowCount: number }>;
  }}
/>
```

`dataSource` receives an `AbortSignal` and a monotonic `requestId`; stale
responses are ignored. Sort/filter/search changes reset pagination to page 1.
Throw from the adapter to show the error overlay, or customize it with
`renderDataSourceError`.

Complete-dataset analysis is a separate contract. `dataSource` fetches the page
that the grid renders; `serverAnalysis` answers bounded queries and aggregates
over the whole server dataset. They can use different endpoints, permissions,
caches, and backend services:

```tsx
import type {
  DataGridServerAnalysisAdapter,
  DataGridServerAnalysisPayload,
} from "datagrizard";

const productsAnalysis: DataGridServerAnalysisAdapter = {
  id: "products-warehouse",
  capabilities: {
    queryScopes: ["all", "filtered"],
    aggregateScopes: ["all", "filtered"],
  },
  async execute({ signal, ...request }) {
    const response = await fetch("/api/products/analysis", {
      method: "POST",
      headers: { "content-type": "application/json" },
      // The runtime AbortSignal is deliberately not part of the JSON body.
      signal,
      body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error("Product analysis failed");
    return response.json() as Promise<DataGridServerAnalysisPayload>;
  },
};

<DataGrid
  columns={columns}
  getRowId={(row) => row.id}
  dataSource={productsPageDataSource}
  serverAnalysis={productsAnalysis}
/>;
```

The request body is a provider-neutral envelope containing the normalized
projection or metrics, complete-dataset scope, typed filter/search query spec,
source-column metadata, limits, query ID, and starting grid revision. It does
not contain row objects, accessors, formatters, predicates, provider SDK types,
or the `AbortSignal`. The endpoint must independently authorize and validate the
user, dataset, columns, operation, and limits; browser-side tool schemas are not
a security boundary. The adapter returns only the query/aggregate payload and
optional remote provenance. DataGrizard validates it and builds the canonical
receipt.

`serverAnalysis` is inert in client mode. In server mode, only the adapter's
advertised `all`/`filtered` capabilities appear in snapshots and agent tools.
Without a capable adapter, async complete-dataset reads return
`scope_unavailable` and never fall back to the loaded page.

For custom orchestration, keep using the lower-level controlled API:

```tsx
<DataGrid
  data={rows}
  columns={columns}
  dataMode="server"
  rowCount={rowCount}
  state={{ sorting, columnFilters, globalFilter, pagination }}
  onSortingChange={setSorting}
  onColumnFiltersChange={setColumnFilters}
  onGlobalFilterChange={setGlobalFilter}
  onPaginationChange={setPagination}
/>
```

## Persistence

Pass `storageKey` to persist exactly four slices under scoped keys:
`${storageKey}.columnSizing`, `${storageKey}.columnOrder`,
`${storageKey}.columnPinning`, `${storageKey}.savedViews`. Nothing else is
persisted, and two grids with different keys never collide.

## Internationalization

```tsx
<DataGrid locale="de-DE" currency="EUR" ... />
```

Defaults to `en-US` / `USD`. Applies to cell formatting and the searchable text.

## Density

```tsx
<DataGrid density="compact" ... />
```

`density` accepts `"compact"`, `"standard"` (default), or `"comfortable"` and
adjusts header/body cell padding plus the default virtual-row estimate.

## Row actions

Pass `rowActions` to add a domain-neutral actions menu at the end of each leaf
row. Actions can be static or resolved per row, and each action can hide or
disable itself from the current row.

```tsx
<DataGrid
  data={rows}
  columns={columns}
  getRowId={(row) => row.id}
  rowActions={(row) => [
    {
      id: "approve",
      label: "Approve",
      hidden: row.status === "approved",
      onSelect: (selectedRow) => approve(selectedRow.id),
    },
    {
      id: "archive",
      label: "Archive",
      destructive: true,
      disabled: row.locked,
      onSelect: (selectedRow) => archive(selectedRow.id),
    },
  ]}
/>
```

The actions column is excluded from export, filtering, sorting, the Columns
menu, and spreadsheet-style cell navigation. Disable the whole surface with
`features={{ rowActions: false }}`.

## Accessibility

DataGrizard targets **WCAG 2.1 Level AA**. It ships native table semantics, ARIA
grid annotations, full keyboard operation, and managed focus. The behaviors
below are covered by the `DataGrid.a11y.test.tsx` and `DataGrid.keyboard.test.tsx`
suites.

**Structure & ARIA**

- Renders a semantic `<table>`. `tableLabel` becomes a visually-hidden
  `<caption>` — the table's accessible name.
- The table exposes `aria-rowcount` / `aria-colcount`, and every cell carries
  `aria-rowindex` / `aria-colindex` (row index offset by the header rows).
- Under client-side row virtualization (`virtualizeRows`, pagination off) only a
  window of rows is in the DOM, yet each rendered row keeps its **true index
  within the full row set** and `aria-rowcount` reports that full total, so
  assistive tech announces "row N of total" correctly. The off-screen spacer
  rows are `aria-hidden`.
- Expanding a group inserts its rows into the cell grid in visual order and
  renumbers `aria-rowindex` over the new order — rows below shift down, with no
  stale or duplicated indices.
- Sortable headers expose `aria-sort`; multi-sort is available via Shift-click
  with visible priority badges and a Clear-sort control.
- Loading and error overlays announce through an `aria-live` region
  (`role="status"` / `role="alert"`).

**Keyboard & focus**

- Cells own the tab stop through a roving `tabindex` (exactly one cell is
  tabbable). Arrows / Home / End / Ctrl+Home / Ctrl+End / PageUp / PageDown move
  between cells; rows themselves are not focusable.
- On a focused cell, Enter / F2 follows the precedence chain edit → row action →
  group toggle, Space toggles row selection, and Escape cancels an in-progress
  edit before closing the detail panel.
- Column resize handles are keyboard-operable (Arrows to resize, Enter/Home to
  reset). The Columns menu, header menus, and multi-select filters close on
  Escape and outside click.
- Value-change flashing and other motion honor `prefers-reduced-motion`.

**Your responsibilities**

- Keep the contrast of any class names you supply (`statusStyles`,
  `conditionalFormats`, `getRowClassName`, `colorScale` text, …) at AA — the grid
  can't validate your palette.
- Pass `tableLabel` so the table has an accessible name, and give every column a
  human-readable `header`.

**Scope & known limitations**

- Row numbering is scoped to the rendered row set: a paginated view numbers the
  current page (each page is a self-contained grid), and in server mode
  `aria-rowcount` reflects the backend total you supply via `rowCount`. The
  globally-correct `aria-rowindex` guarantee above applies to the
  virtualized/non-paginated grid.
- jsdom cannot lay out the virtual row window, so the global-`aria-rowindex`
  guarantee is verified at its source (the index is taken from the full row
  list) rather than by scrolling a rendered window in tests.
- These automated tests assert structure, ARIA, and keyboard behavior. They are
  not a substitute for a manual screen-reader pass or an automated axe/contrast
  audit against your app's actual theme.

---

## Feature flags & layout modes

```ts
features={{ pagination: false, rowSelection: false /* … */ }}
```

For a bare table with only sortable, resizable columns:

```tsx
<DataGrid
  data={rows}
  columns={columns}
  getRowId={(row) => row.id}
  features={{
    toolbar: false,
    globalSearch: false,
    sorting: true,
    columnResizing: true,
    columnVisibility: false,
    columnOrdering: false,
    columnPinning: false,
    savedViews: false,
    grouping: false,
    summaries: false,
    pagination: false,
    rowSelection: false,
    detailPanel: false,
    rowActions: false,
    headerMenu: false,
    collapsibleToolbar: false,
  }}
/>
```

| feature              | grid default | pivot default |
| -------------------- | ------------ | ------------- |
| `toolbar`            | ✅           | ✅            |
| `globalSearch`       | ✅           | ✅            |
| `sorting`            | ✅           | ✅            |
| `columnVisibility`   | ✅           | ✅            |
| `columnResizing`     | ✅           | ✅            |
| `columnOrdering`     | ✅           | ✅            |
| `columnPinning`      | ✅           | ✅            |
| `savedViews`         | ✅           | ✅            |
| `grouping`           | ✅           | ✅ (forced)   |
| `summaries`          | ✅           | ✅            |
| `pagination`         | ✅           | ✅            |
| `rowSelection`       | ✅           | ✅            |
| `detailPanel`        | ✅           | ✅            |
| `editing`            | ✅           | ❌            |
| `cellSelection`      | ✅           | ❌            |
| `fillHandle`         | ✅           | ❌            |
| `clipboard`          | ✅           | ❌            |
| `rowActions`         | ✅           | ✅            |
| `headerMenu`         | ✅           | ✅            |
| `collapsibleToolbar` | ✅           | ✅            |

`collapsibleToolbar` keeps search, filters, and export visible while placing
advanced view setup controls (grouping, columns, saved views, reset view) behind
the toolbar's **View controls** disclosure. Set it to `false` to render those
controls expanded.

## Building from source

```bash
npm run dev            # demo app at http://127.0.0.1:5173/
npm test               # vitest
npm run build          # type-check + build the demo app
npm run build:package  # build ESM/CJS, .d.ts/.d.cts, and scoped CSS
npm run test:package   # pack, smoke/type-test, publint, and run attw
```

## License

MIT
