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
