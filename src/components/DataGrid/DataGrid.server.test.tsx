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
        // Drop the leading selection-checkbox column so the first body cell is
        // the Name cell (`bodyNames()` reads cell index 0).
        features={{ rowSelection: false }}
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

  it("resets server pagination when sorting changes", () => {
    const onSortingChange = vi.fn();
    const onPaginationChange = vi.fn();
    render(
      <DataGrid
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        features={{ rowSelection: false }}
        dataMode="server"
        rowCount={100}
        state={{ pagination: { pageIndex: 1, pageSize: 25 } }}
        onSortingChange={onSortingChange}
        onPaginationChange={onPaginationChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Name" }));

    expect(onSortingChange).toHaveBeenCalledTimes(1);
    expect(onPaginationChange).toHaveBeenCalledWith({ pageIndex: 0, pageSize: 25 });
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
        // Drop the leading selection-checkbox column so the first body cell is
        // the Name cell (`bodyNames()` reads cell index 0).
        features={{ rowSelection: false }}
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

  it("does not globally search locally and emits onGlobalFilterChange", () => {
    const onGlobalFilterChange = vi.fn();
    render(
      <DataGrid
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        features={{ rowSelection: false }}
        dataMode="server"
        rowCount={3}
        onGlobalFilterChange={onGlobalFilterChange}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/Search/i), { target: { value: "alice" } });

    expect(onGlobalFilterChange).toHaveBeenCalledWith("alice");
    // All rows still render — search is the server's job under manualFiltering.
    expect(bodyNames()).toEqual(["Charlie", "Alice", "Bob"]);
  });

  it("resets server pagination when global search changes", () => {
    const onGlobalFilterChange = vi.fn();
    const onPaginationChange = vi.fn();
    render(
      <DataGrid
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        features={{ rowSelection: false }}
        dataMode="server"
        rowCount={100}
        state={{ pagination: { pageIndex: 1, pageSize: 25 } }}
        onGlobalFilterChange={onGlobalFilterChange}
        onPaginationChange={onPaginationChange}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/Search/i), { target: { value: "alice" } });

    expect(onGlobalFilterChange).toHaveBeenCalledWith("alice");
    expect(onPaginationChange).toHaveBeenCalledWith({ pageIndex: 0, pageSize: 25 });
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
        // Single option ⇒ the grid's default page size resolves to 25
        // (pageSizeOptions[1] ?? pageSizeOptions[0]), so 1000/25 = 40 pages.
        pageSizeOptions={[25]}
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

  it("keeps Next operable on an unknown-total server page (paginate forward blindly)", () => {
    const onPaginationChange = vi.fn();
    render(
      <DataGrid
        data={data} // a FULL page (3 rows == pageSize)
        columns={columns}
        getRowId={(r) => r.id}
        dataMode="server"
        // rowCount omitted ⇒ unknown total; pageSize 3 ⇒ data.length fills the page.
        pageSizeOptions={[3]}
        onPaginationChange={onPaginationChange}
      />,
    );
    // Without the pageCount: -1 sentinel, TanStack would derive pageCount=1 from
    // the loaded page and disable Next, stranding the consumer on page 1.
    const next = screen.getByRole("button", { name: "Next" });
    expect(next).toBeEnabled();
    fireEvent.click(next);
    expect(onPaginationChange).toHaveBeenCalledWith(
      expect.objectContaining({ pageIndex: 1 }),
    );
  });
});

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
    // The popover instance survives `rerender`; close it so the click below
    // re-opens (rather than toggles shut) the popover for the static-options case.
    fireEvent.click(screen.getByRole("button", { name: /Name filter/i }));

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

  it("leaves client-mode aria-rowcount as the rendered page, not the full dataset", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      id: String(i),
      name: `R${i}`,
      revenue: i,
    }));
    render(
      <DataGrid data={many} columns={columns} getRowId={(r) => r.id} pageSizeOptions={[25]} />,
    );
    // Client mode + pagination: 1 header + the 25 rendered page rows (NOT 60).
    // Guards against the server-total logic leaking into the client path.
    expect(screen.getByRole("table")).toHaveAttribute("aria-rowcount", "26");
  });
});

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
    // Exact name to target the sort-header button, not the "Resize Row Labels" handle.
    expect(screen.getByRole("button", { name: "Row Labels" })).toBeInTheDocument();
  });

  it("defaults to client mode when dataMode is omitted (backward compat)", () => {
    // rowSelection off so bodyNames() reads the Name cell, not the checkbox cell.
    render(
      <DataGrid
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        features={{ rowSelection: false }}
      />,
    );
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
