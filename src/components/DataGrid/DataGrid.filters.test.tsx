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

// Engine-level matcher behavior, isolated from the filter UI by driving the
// controlled columnFilters slice directly. (The header UI is covered separately.)
describe("DataGrid filter engine (text + date)", () => {
  type EngineRow = { id: string; name: string; when: string };
  const engineColumns: GridColumnConfig<EngineRow>[] = [
    { accessorKey: "name", header: "Name", dataType: "text" },
    { accessorKey: "when", header: "When", dataType: "date" },
  ];
  const engineData: EngineRow[] = [
    { id: "1", name: "Red Shirt", when: "2026-01-10" },
    { id: "2", name: "Blue Shirt", when: "2026-06-24" },
    { id: "3", name: "Green Hat", when: "" },
  ];
  const engineFilters: GridFilterConfig<EngineRow>[] = [
    { accessorKey: "name", label: "Name", filterType: "text" },
    { accessorKey: "when", label: "When", filterType: "date" },
  ];

  it("matches the text filter as a case-insensitive contains", () => {
    render(
      <DataGrid
        data={engineData}
        columns={engineColumns}
        filters={engineFilters}
        getRowId={(r) => r.id}
        state={{ columnFilters: [{ id: "name", value: "shirt" }] }}
      />,
    );

    expect(screen.getByText("Red Shirt")).toBeInTheDocument();
    expect(screen.getByText("Blue Shirt")).toBeInTheDocument();
    expect(screen.queryByText("Green Hat")).not.toBeInTheDocument();
  });

  it("filters the date column by a {from,to} range and excludes blank/unparseable dates", () => {
    render(
      <DataGrid
        data={engineData}
        columns={engineColumns}
        filters={engineFilters}
        getRowId={(r) => r.id}
        state={{ columnFilters: [{ id: "when", value: { from: "2026-03-01", to: "2026-12-31" } }] }}
      />,
    );

    // Only Blue Shirt (Jun 24) is in range; Red Shirt (Jan 10) is before, and
    // Green Hat has a blank date so it is excluded.
    expect(screen.getByText("Blue Shirt")).toBeInTheDocument();
    expect(screen.queryByText("Red Shirt")).not.toBeInTheDocument();
    expect(screen.queryByText("Green Hat")).not.toBeInTheDocument();
  });

  it("treats an open-ended date range (only `from`) as a lower bound", () => {
    render(
      <DataGrid
        data={engineData}
        columns={engineColumns}
        filters={engineFilters}
        getRowId={(r) => r.id}
        state={{ columnFilters: [{ id: "when", value: { from: "2026-03-01" } }] }}
      />,
    );

    expect(screen.getByText("Blue Shirt")).toBeInTheDocument();
    expect(screen.queryByText("Red Shirt")).not.toBeInTheDocument();
  });
});
