# Server-side Data Primitives (`dataMode`) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `dataMode: "client" | "server"` switch to `DataGrid` that flips the grid into TanStack manual mode and trusts externally supplied `data` + `rowCount`, with documented degradation of behaviors that can't be correct over a single page.

**Architecture:** A single derived `isServerMode` flag drives (a) the `manualSorting/Filtering/Pagination` flags + `rowCount` passed to `useReactTable`, and (b) a `dataModeFeatureDefaults` object merged into `features` exactly like the existing `layoutFeatureDefaults` is for `layoutMode`. Server mode is scoped to grid layout only (`dataMode` is ignored in pivot). The single shared rendering path is preserved — no second renderer. A fake-async server in the demo layer exercises the surface end-to-end.

**Tech Stack:** React 19, TypeScript, TanStack Table v8, Vite, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-06-25-server-side-data-primitives-design.md`

---

## File Structure

**Modified:**
- `src/components/DataGrid/DataGrid.tsx` — new `DataGridDataMode` type + `dataMode`/`rowCount` props; `isServerMode` derivation; `dataModeFeatureDefaults` merge; `useReactTable` manual-mode wiring; filter-option gating; footer/pagination display; `aria-rowcount`.
- `src/components/DataGrid/index.ts` — export `DataGridDataMode`.
- `src/App.tsx` — Client/Server data-source toggle + server-mode state wiring.

**Created:**
- `src/data/fakeServer.ts` — demo data source: `queryRetail(query)` + `applyEdit(...)`.
- `src/data/fakeServer.test.ts` — unit tests for the demo data source.
- `src/components/DataGrid/DataGrid.server.test.tsx` — component server-mode tests (the degradation contract is the spec).
- `src/App.test.tsx` — end-to-end demo smoke test for the toggle.

**Key existing anchors (verified against current code):**
- `DataGridLayoutMode` type at `DataGrid.tsx:124`; props block `DataGrid.tsx:185-240`; destructure `DataGrid.tsx:284-336`.
- Feature merge at `DataGrid.tsx:337-344`.
- `useReactTable` config `DataGrid.tsx:972-1021` (`manualPagination` line 999, `pageCount` line 1000, `getPaginationRowModel` registration lines 1018-1020).
- `filterOptionsById` memo `DataGrid.tsx:1025-1031` (`uniqueColumnValues` at line 1028).
- Row-count footer `DataGrid.tsx:1929-1931`; `filteredRowCount` at `DataGrid.tsx:1409`.
- `aria-rowcount` at `DataGrid.tsx:2013`.
- Pagination "Page X of Y" at `DataGrid.tsx:2168-2171`.
- `matchesFilterValue` exported from `filterMatch.ts:25`.

---

## Chunk 1: Component primitives

### Task 1: `dataMode` / `rowCount` props + core manual-mode wiring

**Files:**
- Modify: `src/components/DataGrid/DataGrid.tsx` (type ~124, props ~188, destructure ~287, merge 337-344, useReactTable 999/1000/1018)
- Modify: `src/components/DataGrid/index.ts`
- Test: `src/components/DataGrid/DataGrid.server.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `src/components/DataGrid/DataGrid.server.test.tsx`:

```tsx
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataGrid, type DataGridSummaryItem } from "./DataGrid";
import type { GridColumnConfig, GridFilterConfig } from "../../types/grid";

type Row = { id: string; name: string; revenue: number };

// Deliberately NOT in name order, so a client-side sort would reorder them.
const data: Row[] = [
  { id: "1", name: "Charlie", revenue: 300 },
  { id: "2", name: "Alice", revenue: 100 },
  { id: "3", name: "Bob", revenue: 200 },
];

const columns: GridColumnConfig<Row>[] = [
  { accessorKey: "name", header: "Name", dataType: "text" },
  { accessorKey: "revenue", header: "Revenue", dataType: "currency" },
];

const bodyNames = () =>
  screen
    .getAllByRole("row")
    .slice(1) // drop the header row
    .map((row) => within(row).getAllByRole("cell")[0]?.textContent ?? "");

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("DataGrid server mode — manual sorting/filtering", () => {
  it("does not sort locally and emits onSortingChange", () => {
    const onSortingChange = vi.fn();
    render(
      <DataGrid
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        dataMode="server"
        rowCount={3}
        onSortingChange={onSortingChange}
      />,
    );

    expect(bodyNames()).toEqual(["Charlie", "Alice", "Bob"]);
    fireEvent.click(screen.getByRole("button", { name: "Name" }));

    expect(onSortingChange).toHaveBeenCalledTimes(1);
    // Order is unchanged — the grid trusts `data` and lets the server sort.
    expect(bodyNames()).toEqual(["Charlie", "Alice", "Bob"]);
  });

  it("does not filter locally and emits onColumnFiltersChange", () => {
    const onColumnFiltersChange = vi.fn();
    const filters: GridFilterConfig<Row>[] = [
      { accessorKey: "name", label: "Name", filterType: "text" },
    ];
    render(
      <DataGrid
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        filters={filters}
        dataMode="server"
        rowCount={3}
        onColumnFiltersChange={onColumnFiltersChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Name filter/i }));
    fireEvent.change(screen.getByLabelText("Name contains"), { target: { value: "alice" } });

    expect(onColumnFiltersChange).toHaveBeenCalled();
    // All three rows still render — filtering is the server's job.
    expect(bodyNames()).toEqual(["Charlie", "Alice", "Bob"]);
  });

  it("turns summaries and grid grouping off by default in server mode", () => {
    // One column must be groupable for the "Group by" control to appear at all.
    const groupableColumns: GridColumnConfig<Row>[] = [
      { accessorKey: "name", header: "Name", dataType: "text", enableGrouping: true },
      { accessorKey: "revenue", header: "Revenue", dataType: "currency" },
    ];
    const summaryItems: DataGridSummaryItem<Row>[] = [
      { id: "count", label: "Count", value: ({ rows }) => rows.length },
    ];

    const { rerender } = render(
      <DataGrid
        data={data}
        columns={groupableColumns}
        getRowId={(r) => r.id}
        dataMode="client"
        summaryItems={summaryItems}
      />,
    );
    // Client mode: both the summary bar ("Count" item) and "Group by" are present.
    expect(screen.getByText("Count")).toBeInTheDocument();
    expect(screen.getByText("Group by")).toBeInTheDocument();

    rerender(
      <DataGrid
        data={data}
        columns={groupableColumns}
        getRowId={(r) => r.id}
        dataMode="server"
        rowCount={3}
        summaryItems={summaryItems}
      />,
    );
    // Server mode defaults both OFF.
    expect(screen.queryByText("Count")).not.toBeInTheDocument();
    expect(screen.queryByText("Group by")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/DataGrid/DataGrid.server.test.tsx`
Expected: FAIL — `dataMode`/`rowCount` are not valid props (TS error) or, once props exist, the grid still sorts/filters locally and shows the summary bar.

- [ ] **Step 3a: Add the `DataGridDataMode` type**

In `src/components/DataGrid/DataGrid.tsx`, immediately after the `DataGridLayoutMode` definition (line 124):

```ts
export type DataGridLayoutMode = "grid" | "pivot";

export type DataGridDataMode = "client" | "server";
```

- [ ] **Step 3b: Add the props to `DataGridProps`**

In `DataGridProps<TData>`, right after `layoutMode?: DataGridLayoutMode;` (line 188):

```ts
  layoutMode?: DataGridLayoutMode;
  /**
   * Whether the grid sorts/filters/paginates locally ("client", default) or
   * trusts externally supplied `data` + `rowCount` ("server"). Server mode
   * applies to grid layout only; ignored in pivot layout.
   */
  dataMode?: DataGridDataMode;
  /**
   * Total server row count (server mode). Required for correct pagination; if
   * omitted, the grid renders the current page with an unknown total (the
   * "of N" page/row totals are hidden).
   */
  rowCount?: number;
```

- [ ] **Step 3c: Destructure with defaults**

In the function signature, right after `layoutMode = "grid",` (line 287):

```ts
  layoutMode = "grid",
  dataMode = "client",
  rowCount,
```

- [ ] **Step 3d: Derive `isServerMode` + merge `dataModeFeatureDefaults`**

Replace lines 337-344:

```ts
  const isPivotLayout = layoutMode === "pivot";
  const isServerMode = dataMode === "server" && !isPivotLayout;
  const layoutFeatureDefaults: Partial<DataGridFeatures> =
    isPivotLayout
      ? {
          grouping: true,
        }
      : {};
  // Server mode renders a single page, so any whole-dataset aggregate (summary
  // bar, grid grouping) cannot be correct: default them OFF rather than wrong.
  // Consumer `featureOverrides` stays last, so every default is reversible.
  const dataModeFeatureDefaults: Partial<DataGridFeatures> = isServerMode
    ? { grouping: false, summaries: false }
    : {};
  const features = {
    ...defaultFeatures,
    ...layoutFeatureDefaults,
    ...dataModeFeatureDefaults,
    ...featureOverrides,
  };
```

- [ ] **Step 3e: Wire the manual flags + `rowCount` into `useReactTable`**

Replace the single line 999 (`manualPagination: isTopLevelPivotPagination,`) and the `pageCount` line 1000 with:

```ts
    manualSorting: isServerMode,
    manualFiltering: isServerMode,
    manualPagination: isServerMode || isTopLevelPivotPagination,
    pageCount: pivotPageCount,
    rowCount: isServerMode ? rowCount : undefined,
```

- [ ] **Step 3f: Skip the client pagination row model in server mode**

Replace the `getPaginationRowModel` registration (lines 1018-1020):

```ts
    ...(features.pagination && !isTopLevelPivotPagination && !isServerMode
      ? { getPaginationRowModel: getPaginationRowModel() }
      : {}),
```

- [ ] **Step 3g: Export the new type**

In `src/components/DataGrid/index.ts`, add `DataGridDataMode` to the type re-export block (alongside `DataGridLayoutMode`):

```ts
  DataGridControlledState,
  DataGridDataMode,
  DataGridExpandedState,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/DataGrid/DataGrid.server.test.tsx`
Expected: PASS (all three tests).

- [ ] **Step 5: Type-check + commit**

Run: `npx tsc -b`
Expected: no errors.

```bash
git add src/components/DataGrid/DataGrid.tsx src/components/DataGrid/index.ts src/components/DataGrid/DataGrid.server.test.tsx
git commit -m "feat(datagrid): add dataMode server primitive (manual sort/filter/paginate)"
```

---

### Task 2: Server-aware pagination + row-count display

**Files:**
- Modify: `src/components/DataGrid/DataGrid.tsx` (footer 1929-1931, pagination 2168-2171; add `displayedTotalRowCount` near 1409)
- Test: `src/components/DataGrid/DataGrid.server.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `DataGrid.server.test.tsx`:

```tsx
describe("DataGrid server mode — pagination", () => {
  it("derives page count and total from rowCount, not data.length", () => {
    const onPaginationChange = vi.fn();
    render(
      <DataGrid
        data={data} // one page of 3 rows
        columns={columns}
        getRowId={(r) => r.id}
        dataMode="server"
        rowCount={1000}
        pageSizeOptions={[25, 50]}
        onPaginationChange={onPaginationChange}
      />,
    );

    // Footer total reflects the server total.
    expect(screen.getByText(/3 of 1000 rows/)).toBeInTheDocument();
    // 1000 / 25 = 40 pages.
    expect(screen.getByText(/Page 1 of 40/)).toBeInTheDocument();

    const next = screen.getByRole("button", { name: "Next" });
    expect(next).toBeEnabled();
    fireEvent.click(next);
    expect(onPaginationChange).toHaveBeenCalledWith(
      expect.objectContaining({ pageIndex: 1 }),
    );
  });

  it("hides the 'of N' total when rowCount is omitted", () => {
    render(
      <DataGrid
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        dataMode="server"
      />,
    );
    expect(screen.getByText(/3 rows/)).toBeInTheDocument();
    // Neither the row-total nor the page indicator shows an "of N".
    expect(screen.queryByText(/3 of/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Page 1 of/)).not.toBeInTheDocument();
    expect(screen.getByText(/Page 1/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run -t "server mode — pagination"`
Expected: FAIL — footer shows "3 of 3 rows" (uses `data.length`) and "Page 1 of 1".

- [ ] **Step 3a: Add `displayedTotalRowCount`**

After `const selectedRowCount = selectedSummaryRows.length;` (line 1410):

```ts
  const selectedRowCount = selectedSummaryRows.length;
  // Server mode: the page total comes from the server (rowCount), not from the
  // in-memory page (data.length). Undefined when an unknown-total server page.
  const displayedTotalRowCount = isServerMode ? rowCount : data.length;
```

- [ ] **Step 3b: Update the footer count (lines 1929-1931)**

```tsx
          <span>
            {displayedTotalRowCount != null
              ? `${filteredRowCount} of ${displayedTotalRowCount} ${rowLabel}`
              : `${filteredRowCount} ${rowLabel}`}
          </span>
```

- [ ] **Step 3c: Update the page indicator (lines 2168-2171)**

```tsx
              <span>
                Page {table.getState().pagination.pageIndex + 1}
                {isServerMode && rowCount == null
                  ? ""
                  : ` of ${Math.max(table.getPageCount(), 1)}`}
              </span>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run -t "server mode — pagination"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/DataGrid/DataGrid.tsx src/components/DataGrid/DataGrid.server.test.tsx
git commit -m "feat(datagrid): server-aware pagination + row-count display"
```

---

### Task 3: Filter `select` options not derived in server mode

**Files:**
- Modify: `src/components/DataGrid/DataGrid.tsx` (filter-option memo 1025-1031)
- Test: `src/components/DataGrid/DataGrid.server.test.tsx`

- [ ] **Step 1: Write the failing test**

Append:

```tsx
describe("DataGrid server mode — filter options", () => {
  it("does not derive select options from the page, but honors static options", () => {
    const filtersNoOptions: GridFilterConfig<Row>[] = [
      { accessorKey: "name", label: "Name" }, // select, no static options
    ];
    const { rerender } = render(
      <DataGrid
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        filters={filtersNoOptions}
        dataMode="server"
        rowCount={3}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Name filter/i }));
    // The page contains "Alice" but it must NOT become a derived option.
    expect(screen.queryByRole("option", { name: "Alice" })).not.toBeInTheDocument();

    const filtersWithOptions: GridFilterConfig<Row>[] = [
      { accessorKey: "name", label: "Name", options: ["Alice", "Bob"] },
    ];
    rerender(
      <DataGrid
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        filters={filtersWithOptions}
        dataMode="server"
        rowCount={3}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Name filter/i }));
    expect(screen.getByRole("option", { name: "Alice" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run -t "server mode — filter options"`
Expected: FAIL — "Alice" appears as a derived option in the no-options case.

- [ ] **Step 3: Gate the derivation (lines 1025-1031)**

```ts
  const filterOptionsById = useMemo(() => {
    const map: Record<string, string[]> = {};
    filters.forEach((filter) => {
      map[filter.accessorKey] =
        filter.options ??
        (isServerMode ? [] : uniqueColumnValues(data, filter.accessorKey));
    });
    return map;
  }, [data, filters, isServerMode]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run -t "server mode — filter options"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/DataGrid/DataGrid.tsx src/components/DataGrid/DataGrid.server.test.tsx
git commit -m "feat(datagrid): skip filter-option derivation in server mode"
```

---

### Task 4: `aria-rowcount` reflects the server total

**Files:**
- Modify: `src/components/DataGrid/DataGrid.tsx` (aria-rowcount 2013)
- Test: `src/components/DataGrid/DataGrid.server.test.tsx`

- [ ] **Step 1: Write the failing test**

Append:

```tsx
describe("DataGrid server mode — a11y", () => {
  it("sets aria-rowcount to the server total plus header rows", () => {
    render(
      <DataGrid
        data={data} // 3 rendered page rows
        columns={columns}
        getRowId={(r) => r.id}
        dataMode="server"
        rowCount={1000}
      />,
    );
    // 1 header row (no column groups) + 1000 server rows.
    expect(screen.getByRole("table")).toHaveAttribute("aria-rowcount", "1001");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run -t "server mode — a11y"`
Expected: FAIL — current value is `1 + 3 = 4`.

- [ ] **Step 3: Update the attribute (line 2013)**

```tsx
            aria-rowcount={
              headerRowCount +
              (isServerMode ? rowCount ?? visibleRows.length : visibleRows.length)
            }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run -t "server mode — a11y"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/DataGrid/DataGrid.tsx src/components/DataGrid/DataGrid.server.test.tsx
git commit -m "feat(datagrid): aria-rowcount reflects server total in server mode"
```

---

### Task 5: Contract verification (export, pivot, backward-compat, controlled, override)

These assert behaviors the design says hold "for free." Some pass immediately; treat any failure as a real regression to fix in `DataGrid.tsx`.

**Files:**
- Test: `src/components/DataGrid/DataGrid.server.test.tsx`

- [ ] **Step 1: Write the tests**

Append:

```tsx
describe("DataGrid server mode — contract", () => {
  it("ignores dataMode in pivot layout (pivot stays client-side)", () => {
    render(
      <DataGrid
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        layoutMode="pivot"
        dataMode="server"
        rowCount={3}
        pivot={{ rows: ["name"], measures: [] }}
        summaryItems={[
          { id: "rev", columnId: "revenue", label: "Revenue", value: ({ rows }) => rows.length },
        ]}
      />,
    );
    // Pivot still materializes client-side: the row-label header is present.
    expect(screen.getByRole("button", { name: /Row Labels/i })).toBeInTheDocument();
  });

  it("defaults to client mode when dataMode is omitted (backward compat)", () => {
    render(<DataGrid data={data} columns={columns} getRowId={(r) => r.id} />);
    // Client mode DOES sort locally: clicking Name reorders to Alice/Bob/Charlie.
    fireEvent.click(screen.getByRole("button", { name: "Name" }));
    expect(bodyNames()).toEqual(["Alice", "Bob", "Charlie"]);
  });

  it("allows re-enabling summaries via features override", () => {
    render(
      <DataGrid
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        dataMode="server"
        rowCount={3}
        features={{ summaries: true }}
        summaryItems={[{ id: "count", label: "Count", value: ({ rows }) => rows.length }]}
      />,
    );
    expect(screen.getByText("Count")).toBeInTheDocument();
  });

  it("supports controlling the pagination slice in server mode", () => {
    const onPaginationChange = vi.fn();
    render(
      <DataGrid
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        dataMode="server"
        rowCount={1000}
        pageSizeOptions={[25, 50]}
        state={{ pagination: { pageIndex: 0, pageSize: 25 } }}
        onPaginationChange={onPaginationChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    // Controlled: emits but the grid stays on the prop-provided page 1.
    expect(onPaginationChange).toHaveBeenCalledWith(
      expect.objectContaining({ pageIndex: 1 }),
    );
    expect(screen.getByText(/Page 1 of 40/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run -t "server mode — contract"`
Expected: PASS. If the pivot or backward-compat case fails, fix `isServerMode = dataMode === "server" && !isPivotLayout` (pivot must keep `isServerMode` false); if the override case fails, confirm `featureOverrides` is last in the merge.

- [ ] **Step 3: Run the full server test file**

Run: `npx vitest run src/components/DataGrid/DataGrid.server.test.tsx`
Expected: PASS (all describes).

- [ ] **Step 4: Commit**

```bash
git add src/components/DataGrid/DataGrid.server.test.tsx
git commit -m "test(datagrid): server-mode contract (pivot/back-compat/controlled/override)"
```

---

## Chunk 2: Demo data source + toggle

### Task 6: Fake-async server (`fakeServer.ts`)

**Files:**
- Create: `src/data/fakeServer.ts`
- Test: `src/data/fakeServer.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/data/fakeServer.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyEdit, queryRetail } from "./fakeServer";

// Drive the simulated network latency deterministically.
const resolveQuery = async (query: Parameters<typeof queryRetail>[0]) => {
  vi.useFakeTimers();
  const promise = queryRetail(query);
  await vi.runAllTimersAsync();
  const result = await promise;
  vi.useRealTimers();
  return result;
};

const baseQuery = {
  sorting: [],
  columnFilters: [],
  globalFilter: "",
  pagination: { pageIndex: 0, pageSize: 25 },
} as const;

afterEach(() => {
  vi.useRealTimers();
});

describe("queryRetail", () => {
  it("returns the first page and the full filtered rowCount", async () => {
    const result = await resolveQuery({ ...baseQuery });
    expect(result.rows).toHaveLength(25);
    expect(result.rowCount).toBe(500);
  });

  it("slices by page", async () => {
    const page2 = await resolveQuery({
      ...baseQuery,
      pagination: { pageIndex: 1, pageSize: 25 },
    });
    expect(page2.rows).toHaveLength(25);
    expect(page2.rowCount).toBe(500);
  });

  it("sorts ascending and descending", async () => {
    const asc = await resolveQuery({ ...baseQuery, sorting: [{ id: "sales", desc: false }] });
    const desc = await resolveQuery({ ...baseQuery, sorting: [{ id: "sales", desc: true }] });
    expect(asc.rows[0].sales).toBeLessThanOrEqual(asc.rows[1].sales);
    expect(desc.rows[0].sales).toBeGreaterThanOrEqual(desc.rows[1].sales);
  });

  it("applies a multiSelect column filter", async () => {
    const result = await resolveQuery({
      ...baseQuery,
      columnFilters: [{ id: "department", value: ["Grocery"] }],
    });
    expect(result.rowCount).toBeGreaterThan(0);
    expect(result.rowCount).toBeLessThan(500);
    expect(result.rows.every((row) => row.department === "Grocery")).toBe(true);
  });

  it("applies global search across string fields", async () => {
    const all = await resolveQuery({ ...baseQuery });
    const needle = all.rows[0].item_name.slice(0, 4).toLowerCase();
    const result = await resolveQuery({ ...baseQuery, globalFilter: needle });
    expect(result.rowCount).toBeGreaterThan(0);
    expect(
      result.rows.every((row) =>
        JSON.stringify(row).toLowerCase().includes(needle),
      ),
    ).toBe(true);
  });
});

describe("applyEdit", () => {
  it("persists an edit so a later query reflects it", async () => {
    const before = await resolveQuery({ ...baseQuery });
    const target = before.rows[0];
    applyEdit(target.item_id, "units", 99999);
    const after = await resolveQuery({ ...baseQuery });
    const updated = after.rows.find((row) => row.item_id === target.item_id);
    expect(updated?.units).toBe(99999);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/fakeServer.test.ts`
Expected: FAIL — `./fakeServer` does not exist.

- [ ] **Step 3: Implement `fakeServer.ts`**

Create `src/data/fakeServer.ts`:

```ts
import type {
  ColumnFiltersState,
  PaginationState,
  SortingState,
} from "@tanstack/react-table";
import { matchesFilterValue } from "../components/DataGrid/filterMatch";
import { mockRetailData, retailFilters, type RetailItem } from "./mockRetailData";

export type RetailQuery = {
  sorting: SortingState;
  columnFilters: ColumnFiltersState;
  globalFilter: string;
  pagination: PaginationState;
};

export type RetailQueryResult = {
  rows: RetailItem[];
  rowCount: number;
};

const LATENCY_MS = 300;

// Mutable in-memory store (a copy) so applyEdit persists across queries.
const store: RetailItem[] = mockRetailData.map((row) => ({ ...row }));

const filterTypeById = new Map(
  retailFilters.map((filter) => [
    filter.accessorKey as string,
    filter.filterType ?? "select",
  ]),
);

const SEARCH_FIELDS: (keyof RetailItem)[] = [
  "item_id",
  "item_name",
  "department",
  "category",
  "brand",
  "recommendation_status",
];

const compare = (a: unknown, b: unknown): number => {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
};

const applySort = (rows: RetailItem[], sorting: SortingState): RetailItem[] => {
  if (sorting.length === 0) return rows;
  return [...rows].sort((rowA, rowB) => {
    for (const sort of sorting) {
      const result = compare(
        rowA[sort.id as keyof RetailItem],
        rowB[sort.id as keyof RetailItem],
      );
      if (result !== 0) return sort.desc ? -result : result;
    }
    return 0;
  });
};

const applyColumnFilters = (
  rows: RetailItem[],
  columnFilters: ColumnFiltersState,
): RetailItem[] =>
  rows.filter((row) =>
    columnFilters.every((filter) => {
      const raw = row[filter.id as keyof RetailItem];
      return matchesFilterValue(raw, filter.value, {
        filterType: filterTypeById.get(filter.id),
        searchText: String(raw ?? ""),
      });
    }),
  );

const applyGlobalFilter = (rows: RetailItem[], globalFilter: string): RetailItem[] => {
  const needle = globalFilter.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) =>
    SEARCH_FIELDS.some((field) =>
      String(row[field] ?? "").toLowerCase().includes(needle),
    ),
  );
};

/** Simulated server query: filters/searches/sorts/paginates the in-memory store. */
export async function queryRetail(query: RetailQuery): Promise<RetailQueryResult> {
  await new Promise((resolve) => setTimeout(resolve, LATENCY_MS));

  const filtered = applyGlobalFilter(
    applyColumnFilters(store, query.columnFilters),
    query.globalFilter,
  );
  const sorted = applySort(filtered, query.sorting);
  const { pageIndex, pageSize } = query.pagination;
  const start = pageIndex * pageSize;
  return { rows: sorted.slice(start, start + pageSize), rowCount: sorted.length };
}

/** Mutation entry point so demo edits survive a refetch (see App.tsx onCellEdit). */
export function applyEdit(itemId: string, columnId: string, value: unknown): void {
  const target = store.find((row) => row.item_id === itemId);
  if (target) {
    (target as Record<string, unknown>)[columnId] = value;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/fakeServer.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check + commit**

Run: `npx tsc -b`
Expected: no errors.

```bash
git add src/data/fakeServer.ts src/data/fakeServer.test.ts
git commit -m "feat(demo): fake-async retail server (queryRetail + applyEdit)"
```

---

### Task 7: Client/Server toggle in `App.tsx`

**Files:**
- Modify: `src/App.tsx`
- Test: `src/App.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `src/App.test.tsx`:

```tsx
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import App from "./App";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("App server-mode demo", () => {
  it("loads a server page (total from the fake server) when toggled on", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Grid" }));
    fireEvent.click(screen.getByRole("button", { name: "Server" }));

    // queryRetail resolves after ~300ms; findBy polls up to 1000ms.
    expect(await screen.findByText(/of 500 items/)).toBeInTheDocument();
  });

  it("disables the Server toggle in pivot layout (server is grid-only)", () => {
    render(<App />); // starts in pivot
    expect(screen.getByRole("button", { name: "Server" })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL — there is no "Server" button.

- [ ] **Step 3: Rewrite `App.tsx`**

Replace the full contents of `src/App.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import type { ColumnFiltersState, PaginationState, SortingState } from "@tanstack/react-table";
import {
  DataGrid,
  type DataGridColumnGroup,
  type DataGridDataMode,
  type DataGridLayoutMode,
} from "./components/DataGrid";
import {
  mockRetailData,
  retailColumns,
  retailFilters,
  retailGroupSummaryItems,
  retailSummaryItems,
  type RetailItem,
} from "./data/mockRetailData";
import { applyEdit, queryRetail } from "./data/fakeServer";
import { RetailDetailPanel } from "./demo/RetailDetailPanel";

const layouts: { id: DataGridLayoutMode; label: string }[] = [
  { id: "pivot", label: "Pivot" },
  { id: "grid", label: "Grid" },
];

const dataModes: { id: DataGridDataMode; label: string }[] = [
  { id: "client", label: "Client" },
  { id: "server", label: "Server" },
];

// Grid-mode header bands (ignored in pivot mode).
const retailColumnGroups: DataGridColumnGroup[] = [
  { groupId: "item", header: "Item", children: ["item_id", "item_name"] },
  { groupId: "merch", header: "Merchandising", children: ["department", "category", "brand"] },
  {
    groupId: "performance",
    header: "Performance",
    children: ["sales", "units", "margin_rate", "price_gap"],
  },
];

function App() {
  const [layoutMode, setLayoutMode] = useState<DataGridLayoutMode>("pivot");
  const [dataMode, setDataMode] = useState<DataGridDataMode>("client");

  // Client mode: the grid never mutates `data`; we apply onCellEdit by item_id.
  const [rows, setRows] = useState(mockRetailData);

  // Server mode: we control the query slices and hold the fetched page.
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 50 });
  const [serverRows, setServerRows] = useState<RetailItem[]>([]);
  const [serverRowCount, setServerRowCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const requestIdRef = useRef(0);

  // Server mode applies to grid layout only.
  const isServer = dataMode === "server" && layoutMode === "grid";

  useEffect(() => {
    if (!isServer) return;
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    queryRetail({ sorting, columnFilters, globalFilter, pagination }).then((result) => {
      if (requestId !== requestIdRef.current) return; // drop stale responses
      setServerRows(result.rows);
      setServerRowCount(result.rowCount);
      setIsLoading(false);
    });
  }, [isServer, sorting, columnFilters, globalFilter, pagination, refreshToken]);

  return (
    <main className="flex h-screen flex-col bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-semibold text-slate-950">
              Retail Recommendation Workbench
            </h1>
            <p className="mt-0.5 text-xs text-slate-500">
              {layoutMode === "pivot"
                ? "Pivot view — grouped subtotals. Switch to Grid to drill to item level."
                : isServer
                  ? "Grid view — server mode: sort/filter/paginate round-trip to a simulated backend."
                  : "Grid view — expand a group to see items, or click a row for detail."}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <div
              role="group"
              aria-label="Data source"
              className="flex rounded-md border border-slate-200 bg-slate-50 p-0.5"
            >
              {dataModes.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setDataMode(mode.id)}
                  aria-pressed={dataMode === mode.id}
                  disabled={mode.id === "server" && layoutMode === "pivot"}
                  title={
                    mode.id === "server" && layoutMode === "pivot"
                      ? "Server mode is grid-only"
                      : undefined
                  }
                  className={`h-7 rounded px-3 font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-40 ${
                    dataMode === mode.id
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <div
              role="group"
              aria-label="Layout mode"
              className="flex rounded-md border border-slate-200 bg-slate-50 p-0.5"
            >
              {layouts.map((layout) => (
                <button
                  key={layout.id}
                  type="button"
                  onClick={() => setLayoutMode(layout.id)}
                  aria-pressed={layoutMode === layout.id}
                  className={`h-7 rounded px-3 font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 ${
                    layoutMode === layout.id
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {layout.label}
                </button>
              ))}
            </div>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-medium">
              500 rows
            </span>
          </div>
        </div>
      </header>

      <section className="flex min-h-0 flex-1 p-4">
        <DataGrid
          data={isServer ? serverRows : rows}
          columns={retailColumns}
          layoutMode={layoutMode}
          dataMode={isServer ? "server" : "client"}
          rowCount={isServer ? serverRowCount : undefined}
          isLoading={isServer ? isLoading : false}
          state={isServer ? { sorting, columnFilters, globalFilter, pagination } : undefined}
          onSortingChange={isServer ? setSorting : undefined}
          onColumnFiltersChange={isServer ? setColumnFilters : undefined}
          onGlobalFilterChange={isServer ? setGlobalFilter : undefined}
          onPaginationChange={isServer ? setPagination : undefined}
          columnGroups={retailColumnGroups}
          filters={retailFilters}
          onCellEdit={({ rowId, columnId, value }) => {
            if (isServer) {
              applyEdit(rowId, columnId, value);
              setRefreshToken((token) => token + 1);
            } else {
              setRows((current) =>
                current.map((row) =>
                  row.item_id === rowId ? { ...row, [columnId]: value } : row,
                ),
              );
            }
          }}
          getExportFileName={({ selectedCount }) =>
            selectedCount > 0 ? `retail-selection-${selectedCount}.csv` : "retail-recommendations.csv"
          }
          summaryItems={retailSummaryItems}
          groupSummaryItems={retailGroupSummaryItems}
          defaultGrouping={["department", "category"]}
          pivot={{ showLeafRows: true }}
          storageKey="retail-recommendation-workbench"
          rowLabel="items"
          tableLabel="Retail recommendation analytics"
          searchPlaceholder="Search item, brand, department..."
          viewNamePlaceholder="Pricing review"
          getRowId={(row) => row.item_id}
          getRowLabel={(row) => row.item_id}
          virtualizeRows
          renderDetailPanel={(item) => <RetailDetailPanel item={item} />}
        />
      </section>
    </main>
  );
}

export default App;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS (both tests).

- [ ] **Step 5: Type-check + commit**

Run: `npx tsc -b`
Expected: no errors.

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat(demo): Client/Server data-source toggle wired to fake server"
```

---

## Chunk 3: Whole-suite verification + docs

### Task 8: Full verification + CLAUDE.md note

**Files:**
- Modify: `CLAUDE.md` (architecture bullet list — one new entry)

- [ ] **Step 1: Run the full type-check**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: all tests pass (existing + new server-mode, fakeServer, App tests). If any pre-existing test broke, investigate — the feature merge re-order must be a no-op in client/pivot (`dataModeFeatureDefaults` is `{}` whenever `isServerMode` is false), so a break signals a real regression.

- [ ] **Step 3: Build the demo app (smoke)**

Run: `npm run build`
Expected: `tsc -b && vite build` succeed.

- [ ] **Step 4: Add a CLAUDE.md architecture note**

In `CLAUDE.md`, under "Architecture (it almost all lives in `DataGrid.tsx`)", add a new bullet after the "Controlled / uncontrolled hybrid state." bullet:

```markdown
- **Client vs server data (`dataMode`).** `dataMode="server"` (grid layout only; ignored in pivot) flips `useReactTable` into `manualSorting/Filtering/Pagination` and trusts the supplied `data` (current page) + `rowCount`. It rides the controlled-state triad — the existing `on*Change` callbacks are the server query. Degradations are centralized in a `dataModeFeatureDefaults` merge (parallel to `layoutFeatureDefaults`): grid grouping and summaries default **off** (can't be correct over one page), filter `select` options come only from static `GridFilterConfig.options`, and export/select-all/`aria-rowcount` scope to the loaded page (with `aria-rowcount` reflecting `rowCount`). All defaults stay consumer-overridable via `features`. The demo's `src/data/fakeServer.ts` simulates the backend.
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: note dataMode server primitive in CLAUDE.md architecture"
```

- [ ] **Step 6: Final confirmation**

Run: `npm test`
Expected: green. Feature complete.

---

## Notes for the implementer

- **TanStack manual mode:** with `manual*: true`, the matching `get*RowModel` getters become passthroughs, so `getFilteredRowModel().rows` returns the full supplied page — which is exactly why export/select-all/summaries scope to the page automatically. `rowCount` lets TanStack derive `getPageCount()`/`getCanNextPage()`.
- **Why `getPaginationRowModel` is dropped in server mode:** the supplied `data` is already the page; registering it would try to re-slice. This mirrors the existing pivot precedent (`!isTopLevelPivotPagination`).
- **jsdom + `virtualizeRows`:** the demo enables virtualization; in jsdom the scroll viewport is 0px so body rows may window to none. The App test asserts the footer total ("of 500 items"), which derives from row models, not from virtualized DOM rows — so it is robust to this.
- **Don't** add server-computed summary injection, async filter-option fetching, "select all N matching", infinite scroll, or server pivot — all explicitly deferred (see spec §1).
