import { createRef } from "react";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataGrid } from "./DataGrid";
import type { DataGridApi, DataGridCommandResult } from "./dataGridApi";
import type { GridColumnConfig } from "../../types/grid";

type Row = {
  id: string;
  department: string;
  product: string;
  revenue: number;
  units: number;
};

const rows: Row[] = [
  { id: "1", department: "Grocery", product: "Almond Butter", revenue: 1200, units: 24 },
  { id: "2", department: "Grocery", product: "Apples", revenue: 900, units: 42 },
  { id: "3", department: "Home", product: "Shelf Bin", revenue: 700, units: 18 },
];

const columns: GridColumnConfig<Row>[] = [
  {
    accessorKey: "department",
    header: "Department",
    dataType: "text",
    enableGrouping: true,
  },
  { accessorKey: "product", header: "Product", dataType: "text" },
  { accessorKey: "revenue", header: "Revenue", dataType: "currency" },
  { accessorKey: "units", header: "Units", dataType: "number" },
];

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("DataGrid public API", () => {
  it("returns a detached snapshot of the current grid", () => {
    const apiRef = createRef<DataGridApi<Row>>();
    render(
      <DataGrid
        apiRef={apiRef}
        data={rows}
        columns={columns}
        getRowId={(row) => row.id}
        features={{ pagination: false, rowSelection: false }}
      />,
    );

    const snapshot = apiRef.current?.getSnapshot();
    expect(snapshot).toMatchObject({
      layoutMode: "grid",
      dataMode: "client",
      displayMode: "table",
      rowCounts: {
        loaded: 3,
        filtered: 3,
        selected: 0,
        visible: 3,
        total: 3,
      },
      state: {
        sorting: [],
        globalFilter: "",
        columnFilters: [],
        grouping: [],
      },
    });
    expect(snapshot?.columns).toEqual([
      expect.objectContaining({
        id: "department",
        label: "Department",
        dataType: "text",
        generated: false,
        visible: true,
        order: 0,
      }),
      expect.objectContaining({ id: "product", order: 1 }),
      expect.objectContaining({ id: "revenue", order: 2 }),
      expect.objectContaining({ id: "units", order: 3 }),
    ]);

    snapshot?.state.sorting.push({ id: "product", desc: false });
    expect(apiRef.current?.getSnapshot().state.sorting).toEqual([]);
  });

  it("applies a validated command batch through the existing state emitters", () => {
    const apiRef = createRef<DataGridApi<Row>>();
    render(
      <DataGrid
        apiRef={apiRef}
        data={rows}
        columns={columns}
        getRowId={(row) => row.id}
        features={{ pagination: false }}
      />,
    );

    let result: DataGridCommandResult | undefined;
    act(() => {
      result = apiRef.current?.dispatch([
        { type: "set_column_visibility", columnIds: ["units"], visible: false },
        { type: "move_columns", columnIds: ["product"], beforeColumnId: "department" },
        { type: "pin_columns", columnIds: ["product"], position: "left" },
        { type: "set_column_sizes", sizes: { product: 220 } },
        { type: "set_sorting", sorting: [{ id: "revenue", desc: true }] },
        {
          type: "set_column_filters",
          filters: [{ id: "department", value: { operator: "is", value: "Grocery" } }],
        },
        { type: "set_row_selection", rowIds: ["1"] },
        { type: "set_grouping", columnIds: ["department"] },
      ]);
    });

    expect(result).toEqual({ ok: true, appliedCommandCount: 8, errors: [] });
    const snapshot = apiRef.current?.getSnapshot();
    expect(snapshot?.state).toMatchObject({
      sorting: [{ id: "revenue", desc: true }],
      columnFilters: [{ id: "department", value: { operator: "is", value: "Grocery" } }],
      rowSelection: { "1": true },
      columnSizing: { product: 220 },
      grouping: ["department"],
    });
    expect(snapshot?.state.columnOrder.slice(0, 3)).toEqual(["select", "product", "department"]);
    expect(snapshot?.state.columnPinning.left).toEqual(["select", "product"]);
    expect(snapshot?.columns.find((column) => column.id === "units")?.visible).toBe(false);
    expect(snapshot?.rowCounts).toMatchObject({ filtered: 2, selected: 1 });
    expect(screen.queryByRole("columnheader", { name: /Units/ })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Product/ })).toHaveStyle({
      position: "sticky",
      width: "220px",
    });
  });

  it("rejects the full command batch when any command is invalid", () => {
    const apiRef = createRef<DataGridApi<Row>>();
    render(
      <DataGrid
        apiRef={apiRef}
        data={rows}
        columns={columns}
        getRowId={(row) => row.id}
      />,
    );

    let result: DataGridCommandResult | undefined;
    act(() => {
      result = apiRef.current?.dispatch([
        { type: "set_column_visibility", columnIds: ["units"], visible: false },
        { type: "set_sorting", sorting: [{ id: "missing", desc: false }] },
      ]);
    });

    expect(result).toMatchObject({
      ok: false,
      appliedCommandCount: 0,
      errors: [
        {
          commandIndex: 1,
          code: "invalid_column",
          id: "missing",
        },
      ],
    });
    expect(apiRef.current?.getSnapshot().state.sorting).toEqual([]);
    expect(screen.getByRole("columnheader", { name: /Units/ })).toBeInTheDocument();
  });

  it("emits controlled changes without mutating the controlled snapshot", () => {
    const apiRef = createRef<DataGridApi<Row>>();
    const onSortingChange = vi.fn();
    const onColumnVisibilityChange = vi.fn();
    render(
      <DataGrid
        apiRef={apiRef}
        data={rows}
        columns={columns}
        getRowId={(row) => row.id}
        state={{ sorting: [], columnVisibility: {} }}
        onSortingChange={onSortingChange}
        onColumnVisibilityChange={onColumnVisibilityChange}
      />,
    );

    act(() => {
      apiRef.current?.dispatch([
        { type: "set_sorting", sorting: [{ id: "product", desc: false }] },
        { type: "set_column_visibility", columnIds: ["units"], visible: false },
      ]);
    });

    expect(onSortingChange).toHaveBeenCalledWith([{ id: "product", desc: false }]);
    expect(onColumnVisibilityChange).toHaveBeenCalledWith({ units: false });
    expect(apiRef.current?.getSnapshot().state.sorting).toEqual([]);
    expect(apiRef.current?.getSnapshot().state.columnVisibility).toEqual({});
    expect(screen.getByRole("columnheader", { name: /Units/ })).toBeInTheDocument();
  });

  it("clears scoped persisted column state when reset through the API", () => {
    const apiRef = createRef<DataGridApi<Row>>();
    render(
      <DataGrid
        apiRef={apiRef}
        data={rows}
        columns={columns}
        getRowId={(row) => row.id}
        storageKey="agent-grid"
        features={{ rowSelection: false }}
      />,
    );

    act(() => {
      apiRef.current?.dispatch([
        { type: "move_columns", columnIds: ["units"], beforeColumnId: "department" },
        { type: "pin_columns", columnIds: ["product"], position: "right" },
        { type: "set_column_sizes", sizes: { revenue: 240 } },
      ]);
    });
    expect(window.localStorage.getItem("agent-grid.columnOrder")).not.toBeNull();
    expect(window.localStorage.getItem("agent-grid.columnPinning")).not.toBeNull();
    expect(window.localStorage.getItem("agent-grid.columnSizing")).not.toBeNull();

    act(() => {
      apiRef.current?.dispatch([{ type: "reset_columns" }]);
    });
    expect(window.localStorage.getItem("agent-grid.columnOrder")).toBeNull();
    expect(window.localStorage.getItem("agent-grid.columnPinning")).toBeNull();
    expect(window.localStorage.getItem("agent-grid.columnSizing")).toBeNull();
    expect(apiRef.current?.getSnapshot().state.columnSizing).toEqual({});
  });

  it("updates pivot state without exposing the materialized table internals", () => {
    const apiRef = createRef<DataGridApi<Row>>();
    render(
      <DataGrid
        apiRef={apiRef}
        data={rows}
        columns={columns}
        getRowId={(row) => row.id}
        layoutMode="pivot"
        features={{ pagination: false, rowSelection: false }}
        pivot={{
          rows: ["department"],
          measures: [
            { id: "revenue", label: "Revenue", columnId: "revenue", aggregation: "sum" },
          ],
        }}
      />,
    );

    act(() => {
      expect(
        apiRef.current?.dispatch([
          {
            type: "set_pivot",
            pivot: {
              rows: ["product"],
              measures: ["revenue"],
              showGrandTotals: false,
              showSubtotals: false,
            },
          },
        ]),
      ).toEqual({ ok: true, appliedCommandCount: 1, errors: [] });
    });

    const snapshot = apiRef.current?.getSnapshot();
    expect(snapshot?.layoutMode).toBe("pivot");
    expect(snapshot?.state.pivot).toMatchObject({
      rows: ["product"],
      measures: ["revenue"],
      showGrandTotals: false,
      showSubtotals: false,
    });
    expect(snapshot?.columns.every((column) => !("columnDef" in column))).toBe(true);
  });
});
