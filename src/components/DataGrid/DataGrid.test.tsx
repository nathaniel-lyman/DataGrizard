import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  DataGrid,
  type DataGridControlledState,
  type DataGridSavedViews,
  type DataGridSummaryItem,
} from "./DataGrid";
import { materializePivot } from "./pivot";
import type { GridColumnConfig } from "../../types/grid";

type ProductRow = {
  id: string;
  department: string;
  category: string;
  channel?: string;
  product: string;
  revenue: number;
  units: number;
};

const rows: ProductRow[] = [
  {
    id: "1",
    department: "Grocery",
    category: "Nut Butter",
    channel: "Store",
    product: "Almond Butter",
    revenue: 1200,
    units: 24,
  },
  {
    id: "2",
    department: "Grocery",
    category: "Produce",
    channel: "Online",
    product: "Apples",
    revenue: 900,
    units: 42,
  },
  {
    id: "3",
    department: "Home",
    category: "Storage",
    channel: "Store",
    product: "Shelf Bin",
    revenue: 700,
    units: 18,
  },
  {
    id: "4",
    department: "Grocery",
    category: "Produce",
    channel: "Store",
    product: "Bananas",
    revenue: 300,
    units: 12,
  },
];

const columns: GridColumnConfig<ProductRow>[] = [
  {
    accessorKey: "department",
    header: "Department",
    dataType: "text",
    enableGrouping: true,
  },
  {
    accessorKey: "category",
    header: "Category",
    dataType: "text",
    enableGrouping: true,
  },
  {
    accessorKey: "channel",
    header: "Channel",
    dataType: "text",
    enableGrouping: true,
  },
  { accessorKey: "product", header: "Product", dataType: "text" },
  { accessorKey: "revenue", header: "Revenue", dataType: "currency" },
  { accessorKey: "units", header: "Units", dataType: "number" },
];

const summaryItems: DataGridSummaryItem<ProductRow>[] = [
  {
    id: "revenue",
    columnId: "revenue",
    label: "Revenue",
    value: ({ rows }) => rows.reduce((total, row) => total + row.revenue, 0),
  },
  {
    id: "units",
    columnId: "units",
    label: "Units",
    value: ({ rows }) => rows.reduce((total, row) => total + row.units, 0),
  },
];

const groupSummaryItems: DataGridSummaryItem<ProductRow>[] = summaryItems;

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const renderGrid = () =>
  render(
    <DataGrid
      data={rows}
      columns={columns}
      layoutMode="pivot"
      summaryItems={summaryItems}
      groupSummaryItems={groupSummaryItems}
      defaultGrouping={["department", "category"]}
      storageKey="products"
      rowLabel="products"
      getRowId={(row) => row.id}
      renderDetailPanel={(row) => (
        <aside data-testid="detail-panel">{row ? row.product : "No product selected"}</aside>
      )}
    />,
  );

describe("DataGrid pivot layout mode", () => {
  it("keeps pivot bucket ids distinct for blank, literal, and typed values", () => {
    type MixedRow = { id: string; bucket: string | number; value: number };
    const mixedRows: MixedRow[] = [
      { id: "empty", bucket: "", value: 1 },
      { id: "literal-blank", bucket: "blank", value: 2 },
      { id: "number-one", bucket: 1, value: 3 },
      { id: "string-one", bucket: "1", value: 4 },
    ];
    const result = materializePivot({
      sourceRows: mixedRows,
      sourceColumns: [
        { accessorKey: "bucket", header: "Bucket" },
        { accessorKey: "value", header: "Value" },
      ],
      pivot: {
        rows: ["bucket"],
        measures: ["value"],
        expanded: true,
        showGrandTotals: false,
        showSubtotals: true,
        paginationMode: "topLevelGroups",
      },
      pagination: { pageIndex: 0, pageSize: 25 },
      sorting: [],
      measures: [{ id: "value", label: "Value", columnId: "value", aggregation: "sum" }],
      onToggleRow: () => {},
      hasLeafRowAction: false,
      enableSorting: true,
      enableColumnVisibility: true,
      enableColumnResizing: true,
      enableColumnPinning: true,
    });

    const groupRows = result.data.filter((row) => row.__kind === "group");

    expect(groupRows).toHaveLength(4);
    expect(new Set(groupRows.map((row) => row.__id)).size).toBe(4);
    expect(groupRows.map((row) => row.__sourceRows)).toEqual(mixedRows.map((row) => [row]));
  });

  it("generates unique pivot leaf ids from original source-row positions", () => {
    const result = materializePivot({
      sourceRows: rows,
      sourceColumns: [
        { accessorKey: "department", header: "Department" },
        { accessorKey: "revenue", header: "Revenue" },
      ],
      pivot: {
        rows: ["department"],
        measures: ["revenue"],
        expanded: true,
        showGrandTotals: false,
        showSubtotals: true,
        paginationMode: "topLevelGroups",
      },
      pagination: { pageIndex: 0, pageSize: 25 },
      sorting: [],
      measures: [{ id: "revenue", label: "Revenue", columnId: "revenue", aggregation: "sum" }],
      showLeafRows: true,
      onToggleRow: () => {},
      hasLeafRowAction: false,
      enableSorting: true,
      enableColumnVisibility: true,
      enableColumnResizing: true,
      enableColumnPinning: true,
    });

    const leafIds = result.data
      .filter((row) => row.__kind === "leaf")
      .map((row) => row.__id);

    expect(leafIds).toHaveLength(rows.length);
    expect(new Set(leafIds).size).toBe(rows.length);
    expect(new Set(leafIds)).toEqual(
      new Set(rows.map((_, index) => `pivot:leaf|source=${index}`)),
    );
  });

  it("renders a compact pivot table and lets group rows toggle expansion", () => {
    renderGrid();

    expect(screen.getByLabelText("Select all filtered source rows")).toBeInTheDocument();
    expect(screen.getByText(/^Page /)).toBeInTheDocument();
    expect(screen.getByTestId("detail-panel")).toHaveTextContent("No product selected");
    expect(screen.queryByRole("columnheader", { name: "Department" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Product" })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Row Labels" })).toHaveAttribute(
      "aria-sort",
      "none",
    );
    expect(screen.getByRole("columnheader", { name: "Revenue" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Units" })).toBeInTheDocument();
    expect(screen.getByText("Grand Total")).toBeInTheDocument();

    const groceryGroup = screen.getByRole("button", {
      name: "Toggle Grocery group",
    });
    expect(screen.queryByText("Almond Butter")).not.toBeInTheDocument();
    expect(screen.getByText("Nut Butter")).toBeInTheDocument();
    expect(screen.getByText("Produce")).toBeInTheDocument();
    fireEvent.click(groceryGroup);
    expect(screen.queryByText("Nut Butter")).not.toBeInTheDocument();
    expect(screen.queryByText("Produce")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Toggle Grocery group" }));
    expect(screen.getByText("Nut Butter")).toBeInTheDocument();
  });

  it("uses column visibility to control pivot value columns", () => {
    renderGrid();

    expect(screen.getByRole("columnheader", { name: "Revenue" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Units" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /visible/ }));
    fireEvent.click(screen.getByLabelText("Toggle Units column"));

    expect(screen.getByRole("columnheader", { name: "Revenue" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Units" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Toggle Revenue column"));

    expect(screen.queryByRole("columnheader", { name: "Revenue" })).not.toBeInTheDocument();
    expect(screen.getByText("Grand Total")).toBeInTheDocument();
  });

  it("supports resizing, pinning, and ordering generated pivot measure columns", () => {
    render(
      <DataGrid
        data={rows}
        columns={columns}
        layoutMode="pivot"
        defaultGrouping={["department"]}
        rowLabel="products"
        getRowId={(row) => row.id}
        features={{ rowSelection: false, pagination: false, detailPanel: false }}
        summaryItems={summaryItems}
      />,
    );

    const rowLabelHeader = screen.getByRole("columnheader", { name: "Row Labels" });
    expect(rowLabelHeader).toHaveStyle({ position: "sticky", left: "0px" });

    const revenueHeader = screen.getByRole("columnheader", { name: "Revenue" });
    const beforeWidth = revenueHeader.style.width;
    fireEvent.keyDown(screen.getByRole("button", { name: "Resize Revenue" }), {
      key: "ArrowRight",
    });
    expect(revenueHeader.style.width).not.toBe(beforeWidth);

    fireEvent.click(screen.getByRole("button", { name: /visible/ }));
    fireEvent.click(screen.getByRole("button", { name: "Pin Revenue right" }));
    expect(revenueHeader).toHaveStyle({ position: "sticky" });

    fireEvent.click(screen.getByRole("button", { name: "Move Units left" }));
    const leafHeaders = screen.getAllByRole("columnheader").map((header) => header.textContent);
    expect(leafHeaders.join(" ")).toMatch(/Row Labels Units Revenue/);
  });

  it("sorts pivot sibling groups by row label and measure values", () => {
    renderGrid();

    fireEvent.click(screen.getByRole("button", { name: "Row Labels" }));
    fireEvent.click(screen.getByRole("button", { name: "Row Labels" }));

    let bodyRows = screen.getAllByRole("row").slice(1);
    expect(within(bodyRows[0]).getByText("Home")).toBeInTheDocument();
    expect(within(bodyRows[bodyRows.length - 1]).getByText("Grand Total")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Revenue" }));
    fireEvent.click(screen.getByRole("button", { name: "Revenue" }));

    bodyRows = screen.getAllByRole("row").slice(1);
    expect(within(bodyRows[0]).getByText("Home")).toBeInTheDocument();
    expect(within(bodyRows[bodyRows.length - 1]).getByText("Grand Total")).toBeInTheDocument();
  });

  it("multi-sorts pivot siblings by aggregate value and row label", () => {
    render(
      <DataGrid
        data={rows}
        columns={columns}
        layoutMode="pivot"
        defaultGrouping={["department", "category"]}
        rowLabel="products"
        getRowId={(row) => row.id}
        features={{ rowSelection: false, pagination: false, detailPanel: false }}
        summaryItems={summaryItems}
        state={{
          sorting: [
            { id: "measure:revenue", desc: true },
            { id: "pivot:rowLabel", desc: true },
          ],
        }}
      />,
    );

    const rowText = screen.getAllByRole("row").map((row) => row.textContent ?? "");
    const produceIndex = rowText.findIndex((text) => text.includes("Produce"));
    const nutButterIndex = rowText.findIndex((text) => text.includes("Nut Butter"));

    expect(produceIndex).toBeGreaterThan(-1);
    expect(nutButterIndex).toBeGreaterThan(-1);
    expect(produceIndex).toBeLessThan(nutButterIndex);
  });

  it("supports explicit pivot measure definitions", () => {
    render(
      <DataGrid
        data={rows}
        columns={columns}
        layoutMode="pivot"
        defaultGrouping={["department"]}
        rowLabel="products"
        getRowId={(row) => row.id}
        pivot={{
          measures: [
            {
              id: "averageRevenue",
              label: "Avg Revenue",
              columnId: "revenue",
              aggregation: "avg",
              format: (value) => `$${Math.round(Number(value)).toLocaleString()}`,
            },
          ],
        }}
      />,
    );

    expect(screen.getByRole("columnheader", { name: "Avg Revenue" })).toBeInTheDocument();
    expect(screen.getByText("$800")).toBeInTheDocument();
    expect(screen.getByText("$700")).toBeInTheDocument();
  });

  it("generates nested column-axis pivot headers and bucketed measure values", () => {
    render(
      <DataGrid
        data={rows}
        columns={columns}
        layoutMode="pivot"
        rowLabel="products"
        getRowId={(row) => row.id}
        features={{ rowSelection: false, pagination: false, detailPanel: false }}
        pivot={{
          rows: ["category"],
          columns: [{ columnId: "department" }],
          measures: [
            { id: "revenue", label: "Revenue", columnId: "revenue", aggregation: "sum" },
          ],
        }}
      />,
    );

    expect(screen.getByRole("columnheader", { name: "Grocery" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Grand Total" })).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader", { name: "Revenue" })).toHaveLength(3);

    const nutButterRow = screen.getByRole("row", { name: /Nut Butter/ });
    expect(within(nutButterRow).getAllByText("1200")).toHaveLength(2);
    expect(within(nutButterRow).getByText("0")).toBeInTheDocument();
  });

  it("generates column subtotals and honors blank total behavior", () => {
    render(
      <DataGrid
        data={rows}
        columns={columns}
        layoutMode="pivot"
        rowLabel="products"
        getRowId={(row) => row.id}
        features={{ rowSelection: false, pagination: false, detailPanel: false }}
        pivot={{
          rows: ["category"],
          columns: [{ columnId: "department" }, { columnId: "channel" }],
          measures: [
            {
              id: "revenue",
              label: "Revenue",
              columnId: "revenue",
              aggregation: "sum",
              totalBehavior: "sumVisibleChildren",
            },
            {
              id: "units",
              label: "Units",
              columnId: "units",
              aggregation: "sum",
              totalBehavior: "blank",
            },
          ],
        }}
      />,
    );

    expect(screen.getAllByRole("columnheader", { name: "Subtotal" }).length).toBeGreaterThan(0);
    const produceRow = screen.getByRole("row", { name: /Produce/ });
    expect(within(produceRow).getAllByText("1200")).toHaveLength(2);
    const cells = within(produceRow).getAllByRole("cell");
    expect(cells.some((cell) => cell.textContent === "")).toBe(true);
  });

  it("maps pivot group selection to source rows by default", () => {
    renderGrid();

    fireEvent.click(screen.getByLabelText("Select source rows for Grocery"));

    expect(screen.getByText("3 selected")).toBeInTheDocument();
    expect(screen.getByLabelText("Select source rows for Nut Butter")).toBeChecked();
    expect(screen.getByLabelText("Select source rows for Produce")).toBeChecked();
    expect(screen.getByLabelText("Select source rows for Home")).not.toBeChecked();

    fireEvent.click(screen.getByLabelText("Select all filtered source rows"));
    expect(screen.getByText("4 selected")).toBeInTheDocument();
  });

  it("paginates pivot by top-level groups by default", () => {
    render(
      <DataGrid
        data={rows}
        columns={columns}
        layoutMode="pivot"
        defaultGrouping={["department", "category"]}
        pageSizeOptions={[1]}
        rowLabel="products"
        getRowId={(row) => row.id}
        features={{ rowSelection: false }}
        summaryItems={summaryItems}
      />,
    );

    expect(screen.getByText("Grocery")).toBeInTheDocument();
    expect(screen.getByText("Nut Butter")).toBeInTheDocument();
    expect(screen.getByText("Produce")).toBeInTheDocument();
    expect(screen.queryByText("Home")).not.toBeInTheDocument();
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.queryByText("Grocery")).not.toBeInTheDocument();
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Storage")).toBeInTheDocument();
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
  });

  it("can paginate pivot by visible rows", () => {
    render(
      <DataGrid
        data={rows}
        columns={columns}
        layoutMode="pivot"
        defaultGrouping={["department", "category"]}
        pageSizeOptions={[1]}
        rowLabel="products"
        getRowId={(row) => row.id}
        features={{ rowSelection: false }}
        summaryItems={summaryItems}
        pivot={{
          defaultState: { paginationMode: "visibleRows" },
        }}
      />,
    );

    expect(screen.getByText("Grocery")).toBeInTheDocument();
    expect(screen.queryByText("Nut Butter")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.queryByText("Grocery")).not.toBeInTheDocument();
    expect(screen.getByText("Nut Butter")).toBeInTheDocument();
  });

  it("allows lowest-level pivot leaf rows to open the existing detail panel", () => {
    render(
      <DataGrid
        data={rows}
        columns={columns}
        layoutMode="pivot"
        defaultGrouping={["department"]}
        rowLabel="products"
        getRowId={(row) => row.id}
        getRowLabel={(row) => row.product}
        summaryItems={summaryItems}
        pivot={{ showLeafRows: true }}
        renderDetailPanel={(row) => (
          <aside data-testid="detail-panel">{row ? row.product : "No product selected"}</aside>
        )}
      />,
    );

    expect(screen.getByTestId("detail-panel")).toHaveTextContent("No product selected");
    expect(screen.getByRole("button", { name: "Toggle Grocery group" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "2100" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Almond Butter" }));

    expect(screen.getByTestId("detail-panel")).toHaveTextContent("Almond Butter");
  });

  it("reconciles stale generated pivot column ids from saved state", () => {
    const savedViews: DataGridSavedViews = {
      stale: {
        sorting: [],
        globalFilter: "",
        columnFilters: [],
        columnVisibility: {
          "measure:revenue|col:department=Grocery": false,
          "measure:revenue|col:department=Home": false,
        },
        columnSizing: {},
        columnOrder: [
          "pivot:rowLabel",
          "measure:revenue|col:department=Grocery",
          "measure:revenue|col:department=Home",
        ],
        columnPinning: {
          left: ["pivot:rowLabel", "measure:revenue|col:department=Grocery"],
          right: ["measure:revenue|col:department=Home"],
        },
        pivot: {
          rows: ["category"],
          columns: [{ columnId: "channel" }],
          measures: ["revenue"],
          showGrandTotals: true,
          showSubtotals: true,
          paginationMode: "topLevelGroups",
        },
      },
    };
    const state: DataGridControlledState = {
      savedViews,
      activeViewName: "stale",
    };

    render(
      <DataGrid
        data={rows}
        columns={columns}
        layoutMode="pivot"
        rowLabel="products"
        getRowId={(row) => row.id}
        state={state}
        features={{ rowSelection: false, pagination: false, detailPanel: false }}
        pivot={{
          rows: ["category"],
          columns: [{ columnId: "channel" }],
          measures: [
            { id: "revenue", label: "Revenue", columnId: "revenue", aggregation: "sum" },
          ],
        }}
      />,
    );

    expect(screen.getByRole("columnheader", { name: "Online" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Store" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Grocery" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("columnheader", { name: "Revenue" }).length).toBeGreaterThan(0);
  });

  it("keeps filtered pivot totals and hidden generated measures truthful", () => {
    render(
      <DataGrid
        data={rows}
        columns={columns}
        layoutMode="pivot"
        rowLabel="products"
        getRowId={(row) => row.id}
        filters={[{ accessorKey: "department", label: "Department" }]}
        features={{ rowSelection: false, pagination: false, detailPanel: false }}
        pivot={{
          rows: ["category"],
          columns: [{ columnId: "department" }],
          measures: [
            { id: "revenue", label: "Revenue", columnId: "revenue", aggregation: "sum" },
            { id: "units", label: "Units", columnId: "units", aggregation: "sum" },
          ],
        }}
      />,
    );

    // Pivot mode has no leaf data columns to host header filters, so filtering
    // is driven through the consolidated toolbar "Filters" popover.
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.click(screen.getByRole("button", { name: /Department filter/i }));
    fireEvent.click(screen.getByRole("option", { name: "Grocery" }));

    expect(screen.getByRole("columnheader", { name: "Grocery" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Home" })).not.toBeInTheDocument();
    expect(screen.getAllByText("2400").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /visible/ }));
    screen
      .getAllByLabelText(/Toggle .* Units column/)
      .forEach((toggle) => fireEvent.click(toggle));

    expect(screen.queryByRole("columnheader", { name: "Units" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("columnheader", { name: "Revenue" }).length).toBeGreaterThan(0);
  });

  it("saves and restores generated pivot column visibility, sizing, order, and pinning", () => {
    render(
      <DataGrid
        data={rows}
        columns={columns}
        layoutMode="pivot"
        defaultGrouping={["department"]}
        rowLabel="products"
        getRowId={(row) => row.id}
        storageKey="pivot-generated-view"
        features={{ rowSelection: false, pagination: false, detailPanel: false }}
        summaryItems={summaryItems}
      />,
    );

    const initialRevenueWidth = screen.getByRole("columnheader", { name: "Revenue" }).style.width;
    fireEvent.keyDown(screen.getByRole("button", { name: "Resize Revenue" }), {
      key: "ArrowRight",
    });
    const resizedRevenueWidth = screen.getByRole("columnheader", { name: "Revenue" }).style.width;
    expect(resizedRevenueWidth).not.toBe(initialRevenueWidth);

    fireEvent.click(screen.getByRole("button", { name: /visible/ }));
    fireEvent.click(screen.getByLabelText("Toggle Units column"));
    fireEvent.click(screen.getByRole("button", { name: "Pin Revenue right" }));
    fireEvent.click(screen.getByRole("button", { name: "Move Revenue right" }));
    fireEvent.change(screen.getByLabelText("View name"), { target: { value: "Pivot columns" } });
    fireEvent.click(screen.getByRole("button", { name: "Save view" }));

    fireEvent.click(screen.getByRole("button", { name: "Reset columns" }));
    expect(screen.getByRole("columnheader", { name: "Units" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Revenue" }).style.width).toBe(
      initialRevenueWidth,
    );

    fireEvent.change(screen.getByLabelText("Apply saved view"), {
      target: { value: "Pivot columns" },
    });

    expect(screen.queryByRole("columnheader", { name: "Units" })).not.toBeInTheDocument();
    const revenueHeader = screen.getByRole("columnheader", { name: "Revenue" });
    expect(revenueHeader.style.width).toBe(resizedRevenueWidth);
    expect(revenueHeader).toHaveStyle({ position: "sticky" });
  });

  it("persists grouping in saved views and reset restores the default grouping", () => {
    renderGrid();

    fireEvent.click(screen.getByRole("button", { name: "Remove Category grouping" }));
    expect(screen.queryByText("Nut Butter")).not.toBeInTheDocument();
    expect(screen.getByText("Grocery")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("View name"), {
      target: { value: "By department" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save view" }));

    fireEvent.click(screen.getByRole("button", { name: "Reset view" }));
    expect(screen.getByText("Nut Butter")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Apply saved view"), {
      target: { value: "By department" },
    });
    expect(screen.queryByText("Nut Butter")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reset view" }));
    expect(
      screen.getByRole("button", { name: "Toggle Grocery group" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Nut Butter")).toBeInTheDocument();
  });
});
