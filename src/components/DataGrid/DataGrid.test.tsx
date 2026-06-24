import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DataGrid, type DataGridSummaryItem } from "./DataGrid";
import type { GridColumnConfig } from "../../types/grid";

type ProductRow = {
  id: string;
  department: string;
  category: string;
  product: string;
  revenue: number;
  units: number;
};

const rows: ProductRow[] = [
  {
    id: "1",
    department: "Grocery",
    category: "Nut Butter",
    product: "Almond Butter",
    revenue: 1200,
    units: 24,
  },
  {
    id: "2",
    department: "Grocery",
    category: "Produce",
    product: "Apples",
    revenue: 900,
    units: 42,
  },
  {
    id: "3",
    department: "Home",
    category: "Storage",
    product: "Shelf Bin",
    revenue: 700,
    units: 18,
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
  it("renders a compact pivot table and lets group rows toggle expansion", () => {
    renderGrid();

    expect(screen.queryByLabelText("Select all visible rows")).not.toBeInTheDocument();
    expect(screen.queryByText(/^Page /)).not.toBeInTheDocument();
    expect(screen.queryByTestId("detail-panel")).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Department" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Product" })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Row Labels/ })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Revenue" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Units" })).toBeInTheDocument();
    expect(screen.getByText("Grand Total")).toBeInTheDocument();

    const groceryGroup = screen.getByRole("button", {
      name: "Toggle Department Grocery group",
    });
    expect(screen.queryByText("Almond Butter")).not.toBeInTheDocument();
    expect(screen.getByText("Nut Butter")).toBeInTheDocument();
    expect(screen.getByText("Produce")).toBeInTheDocument();
    fireEvent.click(groceryGroup);
    expect(screen.queryByText("Nut Butter")).not.toBeInTheDocument();
    expect(screen.queryByText("Produce")).not.toBeInTheDocument();

    fireEvent.click(groceryGroup);
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

  it("persists grouping in saved views and reset restores the default grouping", () => {
    renderGrid();

    fireEvent.click(screen.getByRole("button", { name: "Remove Department grouping" }));
    expect(
      screen.queryByRole("button", { name: "Toggle Department Grocery group" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Nut Butter")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("View name"), {
      target: { value: "By category" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save view" }));

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.queryByText("Nut Butter")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Apply saved view"), {
      target: { value: "By category" },
    });
    expect(screen.getByText("Nut Butter")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reset view" }));
    expect(
      screen.getByRole("button", { name: "Toggle Department Grocery group" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Nut Butter")).toBeInTheDocument();
  });
});
