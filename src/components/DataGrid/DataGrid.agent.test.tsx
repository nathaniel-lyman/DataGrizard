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

    const queryResult = apiRef.current?.query({
      scope: "filtered",
      columnIds: ["product", "revenue", "margin"],
      limit: 10,
    });
    expect(queryResult).toMatchObject({
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
    if (!queryResult?.ok) throw new Error("Expected the query to succeed.");
    expect(queryResult.receipt).toMatchObject({
      queryId: expect.stringMatching(/^dg-query-/),
      gridRevision: apiRef.current?.getSnapshot().revision,
      scope: "filtered",
      columns: queryResult.columns,
      filters: {
        globalFilter: "",
        columnFilters: [{
          id: "department",
          value: { operator: "is", value: "Grocery" },
        }],
      },
      sorting: [],
      grouping: { view: [], aggregateBy: [] },
      supportingRowIds: ["1", "2"],
      supportingGroupKeys: [],
      warnings: [],
      timing: {
        startedAt: expect.any(String),
        completedAt: expect.any(String),
        durationMs: expect.any(Number),
      },
      replay: {
        operation: "query",
        payload: {
          scope: "filtered",
          columnIds: ["product", "revenue", "margin"],
          offset: 0,
          limit: 10,
        },
      },
    });
    if (queryResult.receipt.replay.operation !== "query") {
      throw new Error("Expected a query replay payload.");
    }
    expect(apiRef.current?.query(queryResult.receipt.replay.payload)).toMatchObject({
      ok: true,
      rows: queryResult.rows,
      rowCount: queryResult.rowCount,
    });

    const aggregateResult = apiRef.current?.aggregate({
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
    });
    expect(aggregateResult).toMatchObject({
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
    if (!aggregateResult?.ok) throw new Error("Expected the aggregate to succeed.");
    expect(aggregateResult.receipt).toMatchObject({
      queryId: expect.stringMatching(/^dg-aggregate-/),
      gridRevision: apiRef.current?.getSnapshot().revision,
      scope: "filtered",
      columns: [
        { id: "department", label: "Department", dataType: "text" },
        { id: "revenue", label: "Revenue", dataType: "currency" },
        { id: "margin", label: "Margin", dataType: "percent" },
        { id: "product", label: "Product", dataType: "text" },
      ],
      filters: queryResult.receipt.filters,
      sorting: [],
      grouping: { view: [], aggregateBy: ["department"] },
      supportingRowIds: ["1", "2"],
      supportingGroupKeys: [{ department: "Grocery" }],
      warnings: [{
        code: "top_values_truncated",
        limit: 1,
        actual: 2,
      }],
      replay: {
        operation: "aggregate",
        payload: {
          scope: "filtered",
          groupBy: ["department"],
        },
      },
    });
    if (aggregateResult.receipt.replay.operation !== "aggregate") {
      throw new Error("Expected an aggregate replay payload.");
    }
    expect(apiRef.current?.aggregate(aggregateResult.receipt.replay.payload)).toMatchObject({
      ok: true,
      metrics: aggregateResult.metrics,
      groups: aggregateResult.groups,
    });
  });

  it("reports every bounded analysis result in its receipt", () => {
    const apiRef = createRef<DataGridApi<Row>>();
    render(
      <DataGrid
        apiRef={apiRef}
        data={rows}
        columns={columns}
        getRowId={(row) => row.id}
        features={{ pagination: false }}
        dataAccessLimits={{ maxRowsPerQuery: 2, maxGroupsPerAggregate: 1, maxTopValues: 1 }}
      />,
    );

    const queryResult = apiRef.current?.query({
      scope: "all",
      columnIds: ["product"],
      offset: 1,
      limit: 1,
    });
    expect(queryResult).toMatchObject({
      ok: true,
      truncated: true,
      receipt: {
        supportingRowIds: ["2"],
        warnings: [
          { code: "offset_applied", actual: 1 },
          { code: "rows_truncated", limit: 1, actual: 3 },
        ],
      },
    });

    const aggregateResult = apiRef.current?.aggregate({
      scope: "all",
      metrics: [{ operation: "top_values", columnId: "product", as: "products", limit: 5 }],
      groupBy: ["department"],
    });
    expect(aggregateResult).toMatchObject({
      ok: true,
      truncated: true,
      receipt: {
        supportingRowIds: ["1", "2", "3"],
        supportingGroupKeys: [{ department: "Grocery" }],
        warnings: [
          { code: "limit_clamped", limit: 1, actual: 5 },
          { code: "top_values_truncated", limit: 1, actual: 3 },
          { code: "groups_truncated", limit: 1, actual: 2 },
        ],
        replay: {
          operation: "aggregate",
          payload: {
            metrics: [{ operation: "top_values", columnId: "product", as: "products", limit: 1 }],
          },
        },
      },
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

describe("live agent tool schemas", () => {
  type AgentRow = {
    id: string;
    category: string;
    amount: number;
    privateNote: string;
  };

  const agentRows: AgentRow[] = [
    { id: "1", category: "A", amount: 12, privateNote: "internal" },
    { id: "2", category: "B", amount: 20, privateNote: "restricted" },
  ];

  const agentColumns: GridColumnConfig<AgentRow>[] = [
    { accessorKey: "id", header: "ID", dataType: "text" },
    {
      accessorKey: "category",
      header: "Category",
      dataType: "text",
      semantic: {
        description: "A consumer-defined classification.",
        synonyms: ["segment"],
        allowedValues: ["A", "B"],
      },
    },
    {
      accessorKey: "amount",
      header: "Amount",
      dataType: "number",
      semantic: { unit: "widgets", sensitivity: "public" },
    },
    {
      accessorKey: "privateNote",
      header: "Private note",
      dataType: "text",
      semantic: { sensitivity: "restricted" },
    },
  ];

  it("derives column ids, operations, metadata, features, and server scopes from the mounted grid", () => {
    const apiRef = createRef<DataGridApi<AgentRow>>();
    render(
      <DataGrid
        apiRef={apiRef}
        data={agentRows}
        columns={agentColumns}
        dataMode="server"
        rowCount={20}
        getRowId={(row) => row.id}
        filters={[{
          accessorKey: "category",
          filterType: "select",
          operators: ["is", "isNot"],
          options: ["A", "B"],
        }]}
        features={{ globalSearch: false, grouping: false, rowSelection: false, cellSelection: false }}
      />,
    );
    const toolkit = createDataGridAgentToolkit({
      api: apiRef,
      permissions: {
        readData: true,
        changeView: true,
        changeFormatting: true,
        allowedSensitivityLevels: ["public"],
      },
    });

    const queryTool = toolkit.tools.find((tool) => tool.name === "grid_query_rows");
    const queryProperties = queryTool?.inputSchema.properties as Record<string, Record<string, unknown>>;
    expect(queryProperties.scope.enum).toEqual(["visible_page"]);
    expect(JSON.stringify(queryProperties.columnIds)).toContain("Synonyms: segment");
    expect(JSON.stringify(queryProperties.columnIds)).toContain("Unit: widgets");
    expect(JSON.stringify(queryProperties.columnIds)).not.toContain("privateNote");

    const aggregateTool = toolkit.tools.find((tool) => tool.name === "grid_aggregate");
    const aggregateSchema = JSON.stringify(aggregateTool?.inputSchema);
    expect(aggregateSchema).toContain('"columnId":{"const":"amount"');
    expect(aggregateSchema).toContain('"sum"');
    const categoryMetric = aggregateSchema.slice(
      aggregateSchema.indexOf('"columnId":{"const":"category"'),
      aggregateSchema.indexOf('"columnId":{"const":"amount"'),
    );
    expect(categoryMetric).not.toContain('"sum"');

    const viewTool = toolkit.tools.find((tool) => tool.name === "grid_update_view");
    const viewProperties = viewTool?.inputSchema.properties as Record<string, unknown>;
    expect(viewProperties).not.toHaveProperty("globalFilter");
    expect(viewProperties).not.toHaveProperty("grouping");
    expect(JSON.stringify(viewProperties.filters)).toContain('"const":"is"');
    expect(JSON.stringify(viewProperties.filters)).toContain('"enum":["A","B"]');

    const selectionTool = toolkit.tools.find((tool) => tool.name === "grid_update_selection");
    const selectionProperties = selectionTool?.inputSchema.properties as Record<string, unknown>;
    expect(selectionProperties).not.toHaveProperty("rowIds");
    expect(selectionProperties).not.toHaveProperty("cellSelection");

    const formattingTool = toolkit.tools.find((tool) => tool.name === "grid_format_columns");
    const formattingSchema = JSON.stringify(formattingTool?.inputSchema);
    expect(formattingSchema).toContain('"amount":{"type":"object","properties":{"numberFormat"');
    expect(formattingSchema).not.toContain('"privateNote"');
  });

  it("recomputes schemas from current permissions and enforces sensitivity on explicit and default reads", () => {
    const apiRef = createRef<DataGridApi<AgentRow>>();
    render(
      <DataGrid
        apiRef={apiRef}
        data={agentRows}
        columns={agentColumns}
        getRowId={(row) => row.id}
        features={{ pagination: false }}
      />,
    );
    let permissions = {
      readData: true,
      changeView: true,
      changeFormatting: false,
      allowedSensitivityLevels: ["public"],
    };
    const toolkit = createDataGridAgentToolkit({ api: apiRef, permissions: () => permissions });

    expect(toolkit.tools.map((tool) => tool.name)).not.toContain("grid_format_columns");
    const context = toolkit.execute("grid_get_context") as {
      permissions: { changeFormatting: boolean };
      sourceColumns: Array<{ id: string }>;
    };
    expect(context.permissions.changeFormatting).toBe(false);
    expect(context.sourceColumns.map((column) => column.id)).not.toContain("privateNote");
    expect(toolkit.execute("grid_query_rows", {
      scope: "visible_page",
      columnIds: ["privateNote"],
    })).toMatchObject({ ok: false, error: { code: "invalid_tool_input" } });

    const defaultRead = toolkit.execute("grid_query_rows", {
      scope: "visible_page",
      limit: 1,
    }) as { ok: true; rows: Array<{ values: Record<string, unknown> }> };
    expect(defaultRead.ok).toBe(true);
    expect(defaultRead.rows[0].values).not.toHaveProperty("privateNote");

    permissions = {
      ...permissions,
      changeFormatting: true,
      allowedSensitivityLevels: ["public", "restricted"],
    };
    expect(toolkit.tools.map((tool) => tool.name)).toContain("grid_format_columns");
    expect(JSON.stringify(toolkit.tools)).toContain("privateNote");
    expect(toolkit.execute("grid_format_columns", {
      presentation: { category: { numberFormat: { maximumFractionDigits: 0 } } },
    })).toMatchObject({ ok: false, error: { code: "invalid_tool_input" } });

    permissions = { ...permissions, readData: false };
    expect(toolkit.tools.map((tool) => tool.name)).not.toContain("grid_query_rows");
    expect(toolkit.execute("grid_query_rows", { scope: "visible_page" }))
      .toMatchObject({ ok: false, error: { code: "permission_denied" } });
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
