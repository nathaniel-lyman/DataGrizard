import { createRef } from "react";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runRetailAssistantWorkflow } from "../../demo/retailAssistantAdapter";
import { DataGrid } from "./DataGrid";
import { createDataGridAgentToolkit } from "./dataGridAgentToolkit";
import type { DataGridApi } from "./dataGridApi";
import type { GridColumnConfig } from "../../types/grid";

type Row = {
  id: string;
  department: string;
  product: string;
  revenue: number;
  margin: number;
};

const rows: Row[] = [
  { id: "1", department: "Grocery", product: "Almond Butter", revenue: 1200, margin: 0.18 },
  { id: "2", department: "Grocery", product: "Apples", revenue: 900, margin: 0.32 },
  { id: "3", department: "Home", product: "Shelf Bin", revenue: 700, margin: 0.24 },
];

const columns: GridColumnConfig<Row>[] = [
  { accessorKey: "department", header: "Department", dataType: "text", enableGrouping: true },
  { accessorKey: "product", header: "Product", dataType: "text" },
  { accessorKey: "revenue", header: "Revenue", dataType: "currency" },
  { accessorKey: "margin", header: "Margin", dataType: "percent" },
];

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("DataGrid data access API", () => {
  it("applies repeated visibility and pagination commands in one batch", () => {
    const apiRef = createRef<DataGridApi<Row>>();
    render(<DataGrid apiRef={apiRef} data={rows} columns={columns} getRowId={(row) => row.id} />);
    act(() => {
      apiRef.current?.dispatch([
        { type: "set_column_visibility", columnIds: ["department", "product", "revenue", "margin"], visible: false },
        { type: "set_column_visibility", columnIds: ["product", "revenue"], visible: true },
        { type: "set_pagination", pagination: { pageIndex: 0, pageSize: 1 } },
      ]);
    });
    expect(apiRef.current?.getSnapshot().state.columnVisibility).toEqual({
      department: false,
      product: true,
      revenue: true,
      margin: false,
    });
    expect(apiRef.current?.getSnapshot().state.pagination).toEqual({ pageIndex: 0, pageSize: 1 });
  });

  it("queries and aggregates filtered source rows with serializable results", () => {
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

    act(() => {
      apiRef.current?.dispatch([{
        type: "set_column_filters",
        filters: [{ id: "department", value: { operator: "is", value: "Grocery" } }],
      }]);
    });

    expect(apiRef.current?.query({
      scope: "filtered",
      columnIds: ["product", "revenue", "margin"],
      limit: 10,
    })).toEqual({
      ok: true,
      scope: "filtered",
      columns: [
        { id: "product", label: "Product", dataType: "text" },
        { id: "revenue", label: "Revenue", dataType: "currency" },
        { id: "margin", label: "Margin", dataType: "percent" },
      ],
      rows: [
        { rowId: "1", values: { product: "Almond Butter", revenue: 1200, margin: 0.18 } },
        { rowId: "2", values: { product: "Apples", revenue: 900, margin: 0.32 } },
      ],
      rowCount: 2,
      returnedRowCount: 2,
      offset: 0,
      truncated: false,
    });

    expect(apiRef.current?.aggregate({
      scope: "filtered",
      metrics: [
        { operation: "count", as: "products" },
        { operation: "sum", columnId: "revenue", as: "revenue" },
        { operation: "average", columnId: "margin", as: "margin" },
        { operation: "min_max", columnId: "revenue", as: "range" },
        { operation: "distinct_count", columnId: "product", as: "distinctProducts" },
        { operation: "top_values", columnId: "product", as: "topProducts", limit: 1 },
      ],
      groupBy: ["department"],
    })).toMatchObject({
      ok: true,
      rowCount: 2,
      metrics: {
        products: 2,
        revenue: 2100,
        margin: 0.25,
        range: { min: 900, max: 1200 },
        distinctProducts: 2,
        topProducts: [{ value: "Almond Butter", count: 1 }],
      },
      groups: [{ key: { department: "Grocery" }, rowCount: 2 }],
    });
  });

  it("enforces limits and refuses whole-dataset server analysis", () => {
    const apiRef = createRef<DataGridApi<Row>>();
    render(
      <DataGrid
        apiRef={apiRef}
        data={rows.slice(0, 2)}
        columns={columns}
        dataMode="server"
        rowCount={100}
        getRowId={(row) => row.id}
        dataAccessLimits={{ maxRowsPerQuery: 1, maxCellsPerQuery: 2 }}
      />,
    );

    expect(apiRef.current?.query({ scope: "all" })).toMatchObject({
      ok: false,
      error: { code: "scope_unavailable" },
    });
    expect(apiRef.current?.aggregate({
      scope: "filtered",
      metrics: [{ operation: "count" }],
    })).toMatchObject({ ok: false, error: { code: "scope_unavailable" } });
    expect(apiRef.current?.query({
      scope: "visible_page",
      columnIds: ["product", "revenue"],
      limit: 2,
    })).toMatchObject({ ok: false, error: { code: "limit_exceeded" } });
  });

  it("controls column/cell selection and serializable presentation through commands", () => {
    const apiRef = createRef<DataGridApi<Row>>();
    render(
      <DataGrid
        apiRef={apiRef}
        data={rows}
        columns={columns}
        getRowId={(row) => row.id}
        storageKey="agent-presentation"
        features={{ pagination: false }}
      />,
    );

    act(() => {
      apiRef.current?.dispatch([
        { type: "set_selected_columns", columnIds: ["revenue", "margin"] },
        {
          type: "set_cell_selection",
          selection: {
            anchor: { rowId: "1", columnId: "revenue" },
            focus: { rowId: "2", columnId: "margin" },
          },
        },
        {
          type: "set_column_presentation",
          presentation: {
            revenue: {
              dataBar: { color: "#8b5cf6" },
              numberFormat: { maximumFractionDigits: 0 },
            },
            margin: {
              rules: [{ operator: "lt", value: 0.2, tone: "warning" }],
            },
          },
        },
      ]);
    });

    expect(apiRef.current?.getSnapshot().state).toMatchObject({
      selectedColumnIds: ["revenue", "margin"],
      cellSelection: {
        anchor: { rowId: "1", columnId: "revenue" },
        focus: { rowId: "2", columnId: "margin" },
      },
      columnPresentation: {
        revenue: { dataBar: { color: "#8b5cf6" } },
        margin: { rules: [{ operator: "lt", value: 0.2, tone: "warning" }] },
      },
    });
    expect(document.querySelectorAll("[data-column-selected='true']").length).toBeGreaterThan(2);
    expect(document.querySelectorAll(".dg-databar").length).toBe(3);
    expect(document.querySelector(".dg-presentation--warning")).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem("agent-presentation.columnPresentation") ?? "null"))
      .toMatchObject({ revenue: { dataBar: { color: "#8b5cf6" } } });
  });

  it("emits controlled selection/presentation changes without mutating controlled snapshots", () => {
    const apiRef = createRef<DataGridApi<Row>>();
    const onSelectedColumnIdsChange = vi.fn();
    const onCellSelectionChange = vi.fn();
    const onColumnPresentationChange = vi.fn();
    render(
      <DataGrid
        apiRef={apiRef}
        data={rows}
        columns={columns}
        getRowId={(row) => row.id}
        state={{ selectedColumnIds: [], cellSelection: null, columnPresentation: {} }}
        onSelectedColumnIdsChange={onSelectedColumnIdsChange}
        onCellSelectionChange={onCellSelectionChange}
        onColumnPresentationChange={onColumnPresentationChange}
      />,
    );

    act(() => {
      apiRef.current?.dispatch([
        { type: "set_selected_columns", columnIds: ["revenue"] },
        {
          type: "set_cell_selection",
          selection: {
            anchor: { rowId: "1", columnId: "revenue" },
            focus: { rowId: "1", columnId: "revenue" },
          },
        },
        {
          type: "set_column_presentation",
          presentation: { revenue: { dataBar: { color: "#8b5cf6" } } },
        },
      ]);
    });

    expect(onSelectedColumnIdsChange).toHaveBeenCalledWith(["revenue"]);
    expect(onCellSelectionChange).toHaveBeenCalledWith({
      anchor: { rowId: "1", columnId: "revenue" },
      focus: { rowId: "1", columnId: "revenue" },
    });
    expect(onColumnPresentationChange).toHaveBeenCalledWith({
      revenue: { dataBar: { color: "#8b5cf6" } },
    });
    expect(apiRef.current?.getSnapshot().state).toMatchObject({
      selectedColumnIds: [],
      cellSelection: null,
      columnPresentation: {},
    });

    expect(apiRef.current?.dispatch([{
      type: "set_column_presentation",
      presentation: { revenue: { className: "generated-css" } } as never,
    }])).toMatchObject({ ok: false, errors: [{ code: "invalid_value", id: "revenue" }] });
  });

  it("restores declarative presentation from a saved view", () => {
    render(
      <DataGrid
        data={rows}
        columns={columns}
        getRowId={(row) => row.id}
        state={{
          savedViews: {
            "Revenue bars": {
              sorting: [],
              globalFilter: "",
              columnFilters: [],
              columnVisibility: {},
              columnSizing: {},
              columnPresentation: { revenue: { dataBar: { color: "#8b5cf6" } } },
            },
          },
        }}
        features={{ pagination: false }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "View controls" }));
    fireEvent.change(screen.getByLabelText("Apply saved view"), {
      target: { value: "Revenue bars" },
    });
    expect(document.querySelectorAll(".dg-databar").length).toBe(3);
  });
});

describe("provider-neutral assistant workflow", () => {
  it("proves the Grocery top-five workflow through tool calls and visible UI", async () => {
    type RetailRow = { id: string; item_name: string; department: string; sales: number; margin_rate: number };
    const retailRows: RetailRow[] = [
      ...Array.from({ length: 6 }, (_, index) => ({
        id: String(index + 1),
        item_name: `Grocery ${index + 1}`,
        department: "Grocery",
        sales: 1000 - index * 100,
        margin_rate: 0.2 + index * 0.01,
      })),
      { id: "7", item_name: "Home 1", department: "Home", sales: 5000, margin_rate: 0.4 },
    ];
    const retailColumns: GridColumnConfig<RetailRow>[] = [
      { accessorKey: "item_name", header: "Product", dataType: "text" },
      { accessorKey: "department", header: "Department", dataType: "text", enableGrouping: true },
      { accessorKey: "sales", header: "Revenue", dataType: "currency" },
      { accessorKey: "margin_rate", header: "Margin", dataType: "percent" },
    ];
    const apiRef = createRef<DataGridApi<RetailRow>>();
    render(
      <DataGrid
        apiRef={apiRef}
        data={retailRows}
        columns={retailColumns}
        getRowId={(row) => row.id}
        defaultGrouping={["department"]}
      />,
    );
    const toolkit = createDataGridAgentToolkit({
      api: apiRef,
      permissions: { readData: true, changeView: true, changeFormatting: true },
      limits: { maxRowsPerQuery: 100, maxCellsPerQuery: 2_000 },
    });

    const result = await runRetailAssistantWorkflow(toolkit);

    expect(result?.toolCalls.map((call) => call.name)).toEqual([
      "grid_get_context",
      "grid_update_view",
      "grid_update_view",
      "grid_format_columns",
      "grid_query_rows",
      "grid_aggregate",
    ]);
    expect(result?.query).toMatchObject({ ok: true, returnedRowCount: 5, rowCount: 5 });
    expect(result?.aggregation).toMatchObject({
      ok: true,
      metrics: { products: 5, totalSales: 4000 },
    });
    if (result?.aggregation.ok) {
      expect(result.aggregation.metrics.averageMargin).toBeCloseTo(0.22);
    }
    expect(apiRef.current?.getSnapshot().state).toMatchObject({
      sorting: [{ id: "sales", desc: true }],
      grouping: [],
      pagination: { pageIndex: 0, pageSize: 5 },
      columnPresentation: { sales: { dataBar: { color: "#8b5cf6", showValue: true } } },
    });
    expect(screen.getByText("Grocery 1")).toBeInTheDocument();
    expect(screen.queryByText("Grocery 6")).not.toBeInTheDocument();
    expect(screen.queryByText("Home 1")).not.toBeInTheDocument();
    expect(document.querySelectorAll(".dg-databar").length).toBe(5);
  });
});
