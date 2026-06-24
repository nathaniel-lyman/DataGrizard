import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DataGrid } from "./DataGrid";
import type { GridColumnConfig, GridFilterConfig } from "../../types/grid";

type Row = { id: string; dept: string; revenue: number };

const data: Row[] = [
  { id: "1", dept: "Men", revenue: 500 },
  { id: "2", dept: "Women", revenue: 1500 },
  { id: "3", dept: "Kids", revenue: 1000 },
];

const columns: GridColumnConfig<Row>[] = [
  { accessorKey: "dept", header: "Dept", dataType: "text" },
  { accessorKey: "revenue", header: "Revenue", dataType: "currency" },
];

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("DataGrid column filters", () => {
  it("filters select columns by exact match (no substring leakage)", () => {
    const filters: GridFilterConfig<Row>[] = [{ accessorKey: "dept", label: "Dept" }];
    render(<DataGrid data={data} columns={columns} getRowId={(r) => r.id} filters={filters} />);

    fireEvent.click(screen.getByRole("button", { name: /Dept filter/i }));
    fireEvent.click(screen.getByRole("option", { name: "Men" }));

    expect(screen.getByText("$500")).toBeInTheDocument();
    // "women" contains "men" — a substring filter would wrongly keep this row.
    expect(screen.queryByText("$1,500")).not.toBeInTheDocument();
  });

  it("supports multi-select filtering", () => {
    const filters: GridFilterConfig<Row>[] = [
      { accessorKey: "dept", label: "Dept", filterType: "multiSelect" },
    ];
    render(<DataGrid data={data} columns={columns} getRowId={(r) => r.id} filters={filters} />);

    fireEvent.click(screen.getByRole("button", { name: /Dept filter/i }));
    fireEvent.click(screen.getByLabelText("Men"));
    fireEvent.click(screen.getByLabelText("Kids"));

    expect(screen.getByText("$500")).toBeInTheDocument();
    expect(screen.getByText("$1,000")).toBeInTheDocument();
    expect(screen.queryByText("$1,500")).not.toBeInTheDocument();
  });

  it("supports range filtering on numeric columns", () => {
    const filters: GridFilterConfig<Row>[] = [
      { accessorKey: "revenue", label: "Revenue", filterType: "range" },
    ];
    render(<DataGrid data={data} columns={columns} getRowId={(r) => r.id} filters={filters} />);

    fireEvent.change(screen.getByLabelText("Revenue minimum"), { target: { value: "1000" } });

    expect(screen.queryByText("$500")).not.toBeInTheDocument();
    expect(screen.getByText("$1,000")).toBeInTheDocument();
    expect(screen.getByText("$1,500")).toBeInTheDocument();
  });
});
