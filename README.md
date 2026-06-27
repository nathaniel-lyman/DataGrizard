# DataGrizard

A reusable, **domain-neutral** analytical data grid for React, built on
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

## Styling

The component is styled with Tailwind utility classes. Pick **one** of:

1. **You already use Tailwind (recommended).** Add the package to your
   `content` globs so your build emits the classes the grid uses:

   ```js
   // tailwind.config.js
   export default {
     content: [
       "./src/**/*.{ts,tsx}",
       "./node_modules/datagrizard/dist/**/*.{js,cjs}",
     ],
   };
   ```

2. **You don't use Tailwind.** Import the precompiled stylesheet once:

   ```ts
   import "datagrizard/styles.css";
   ```

   > This file includes Tailwind's preflight (a CSS reset). If you already use
   > Tailwind, prefer option 1 to avoid shipping preflight twice.

**Consumer-supplied class names** (e.g. `statusStyles`, `conditionalFormats`, or
`getRowClassName` returning `text-emerald-700`) are **your** classes — they must
be reachable by your own Tailwind build (option 1) or already present in your
CSS. The shipped `styles.css` only contains the grid's own classes.

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
`pagination`, `rowSelection`, `grouping`, `expanded`, `pivot`, `savedViews`,
`activeViewName`. When a slice is controlled, the grid never writes it to
`localStorage` — persistence is yours.

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

- Sortable headers expose `aria-sort`; multi-sort via Shift-click with priority
  badges and a Clear-sort control.
- Rows with a click/detail action are keyboard-operable (Enter/Space) and focusable.
- Column resize handles are keyboard-operable (Arrow keys to resize, Enter/Home to reset).
- Header column menus expose sort, clear sort/filter, hide, pin/unpin, autosize,
  fit visible columns, and reset-width actions.
- The Columns menu and multi-select filters close on Escape and outside click.
- `tableLabel` renders a visually-hidden `<caption>` as the table's accessible name.

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
  }}
/>
```

| feature           | grid default | pivot default |
| ----------------- | ------------ | ------------- |
| `toolbar`         | ✅           | ✅            |
| `globalSearch`    | ✅           | ✅            |
| `sorting`         | ✅           | ✅            |
| `columnVisibility`| ✅           | ✅            |
| `columnResizing`  | ✅           | ✅            |
| `columnOrdering`  | ✅           | ✅            |
| `columnPinning`   | ✅           | ✅            |
| `savedViews`      | ✅           | ✅            |
| `grouping`        | ✅           | ✅ (forced)   |
| `summaries`       | ✅           | ✅            |
| `pagination`      | ✅           | ✅            |
| `rowSelection`    | ✅           | ✅            |
| `detailPanel`     | ✅           | ✅            |
| `rowActions`      | ✅           | ✅            |
| `headerMenu`      | ✅           | ✅            |

## Building from source

```bash
npm run dev            # demo app at http://127.0.0.1:5173/
npm test               # vitest
npm run build          # type-check + build the demo app
npm run build:package  # build the distributable library (dist/: ESM, CJS, .d.ts, CSS)
npm run test:package   # build, pack, and smoke-test the package exports
```

## License

MIT
