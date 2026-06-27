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
    const filters: GridFilterConfig<Row>[] = [
      { accessorKey: "dept", label: "Dept", filterType: "select" },
    ];
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

    fireEvent.click(screen.getByRole("button", { name: /Revenue filter/i }));
    fireEvent.change(screen.getByLabelText("Revenue minimum"), { target: { value: "1000" } });

    expect(screen.queryByText("$500")).not.toBeInTheDocument();
    expect(screen.getByText("$1,000")).toBeInTheDocument();
    expect(screen.getByText("$1,500")).toBeInTheDocument();
  });

  it("filters via a header text popover and marks the trigger active", () => {
    const filters: GridFilterConfig<Row>[] = [
      { accessorKey: "dept", label: "Dept", filterType: "text" },
    ];
    render(<DataGrid data={data} columns={columns} getRowId={(r) => r.id} filters={filters} />);

    const trigger = screen.getByRole("button", { name: /Dept filter/i });
    expect(trigger).not.toHaveAttribute("data-active");

    fireEvent.click(trigger);
    fireEvent.change(screen.getByLabelText("Dept contains"), { target: { value: "men" } });

    // contains "men" → "Men" and "Women" (case-insensitive), not "Kids".
    expect(screen.getByText("$500")).toBeInTheDocument();
    expect(screen.getByText("$1,500")).toBeInTheDocument();
    expect(screen.queryByText("$1,000")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Dept filter/i })).toHaveAttribute("data-active");
  });

  it("lets text filters use a starts-with operator from the header popover", () => {
    const filters: GridFilterConfig<Row>[] = [
      { accessorKey: "dept", label: "Dept", filterType: "text" },
    ];
    render(<DataGrid data={data} columns={columns} getRowId={(r) => r.id} filters={filters} />);

    fireEvent.click(screen.getByRole("button", { name: /Dept filter/i }));
    fireEvent.change(screen.getByLabelText("Dept operator"), { target: { value: "startsWith" } });
    fireEvent.change(screen.getByLabelText("Dept contains"), { target: { value: "Wo" } });

    expect(screen.queryByText("$500")).not.toBeInTheDocument();
    expect(screen.getByText("$1,500")).toBeInTheDocument();
    expect(screen.queryByText("$1,000")).not.toBeInTheDocument();
  });

  it("lets numeric filters use a greater-than operator from the header popover", () => {
    const filters: GridFilterConfig<Row>[] = [
      { accessorKey: "revenue", label: "Revenue", filterType: "range" },
    ];
    render(<DataGrid data={data} columns={columns} getRowId={(r) => r.id} filters={filters} />);

    fireEvent.click(screen.getByRole("button", { name: /Revenue filter/i }));
    fireEvent.change(screen.getByLabelText("Revenue operator"), { target: { value: "gt" } });
    fireEvent.change(screen.getByLabelText("Revenue value"), { target: { value: "1000" } });

    expect(screen.queryByText("$500")).not.toBeInTheDocument();
    expect(screen.queryByText("$1,000")).not.toBeInTheDocument();
    expect(screen.getByText("$1,500")).toBeInTheDocument();
  });

  it("renders an always-visible floating filter row when enabled", () => {
    const filters: GridFilterConfig<Row>[] = [{ accessorKey: "dept", label: "Dept" }];
    render(
      <DataGrid
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        filters={filters}
        features={{ floatingFilters: true }}
      />,
    );

    // The floating row shows the inline trigger summarizing the current value
    // ("All") without needing to open the header icon popover first.
    expect(screen.getAllByRole("button", { name: /Dept filter/i }).length).toBeGreaterThan(1);
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

  it("supports wrapped operator values while preserving legacy raw filters", () => {
    render(
      <DataGrid
        data={engineData}
        columns={engineColumns}
        filters={engineFilters}
        getRowId={(r) => r.id}
        state={{ columnFilters: [{ id: "name", value: { operator: "startsWith", value: "Blue" } }] }}
      />,
    );

    expect(screen.getByText("Blue Shirt")).toBeInTheDocument();
    expect(screen.queryByText("Red Shirt")).not.toBeInTheDocument();
    expect(screen.queryByText("Green Hat")).not.toBeInTheDocument();
  });
  const engineData: EngineRow[] = [
    { id: "1", name: "Red Shirt", when: "2026-01-10" },
    { id: "2", name: "Blue Shirt", when: "2026-06-24" },
    { id: "4", name: "Timed Shirt", when: "2026-06-24T15:30:00" },
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

    // The Jun 24 date-only and timestamp rows are both in range; Red Shirt
    // (Jan 10) is before, and Green Hat has a blank date so it is excluded.
    expect(screen.getByText("Blue Shirt")).toBeInTheDocument();
    expect(screen.getByText("Timed Shirt")).toBeInTheDocument();
    expect(screen.queryByText("Red Shirt")).not.toBeInTheDocument();
    expect(screen.queryByText("Green Hat")).not.toBeInTheDocument();
  });

  it("treats date-only filters as full local calendar days", () => {
    render(
      <DataGrid
        data={engineData}
        columns={engineColumns}
        filters={engineFilters}
        getRowId={(r) => r.id}
        state={{
          columnFilters: [
            { id: "when", value: { operator: "equals", value: "2026-06-24" } },
          ],
        }}
      />,
    );

    expect(screen.getByText("Blue Shirt")).toBeInTheDocument();
    expect(screen.getByText("Timed Shirt")).toBeInTheDocument();
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

  it("supports date comparison operators", () => {
    render(
      <DataGrid
        data={engineData}
        columns={engineColumns}
        filters={engineFilters}
        getRowId={(r) => r.id}
        state={{ columnFilters: [{ id: "when", value: { operator: "after", value: "2026-03-01" } }] }}
      />,
    );

    expect(screen.getByText("Blue Shirt")).toBeInTheDocument();
    expect(screen.queryByText("Red Shirt")).not.toBeInTheDocument();
    expect(screen.queryByText("Green Hat")).not.toBeInTheDocument();
  });
});

describe("DataGrid auto-provisioned filters", () => {
  it("auto-provisions a range filter for an unlisted numeric column", () => {
    render(
      <DataGrid
        data={[{ id: "a", price: 5 }, { id: "b", price: 50 }]}
        columns={[
          { accessorKey: "id", header: "ID", dataType: "text" },
          { accessorKey: "price", header: "Price", dataType: "currency" },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Price filter/i }));
    expect(screen.getByLabelText("Price minimum")).toBeInTheDocument();
    expect(screen.getByLabelText("Price maximum")).toBeInTheDocument();
  });

  it("infers multiSelect for a low-cardinality text column (auto-facet)", () => {
    render(
      <DataGrid
        data={[{ id: "a", dept: "Grocery" }, { id: "b", dept: "Home" }]}
        columns={[
          { accessorKey: "id", header: "ID", dataType: "text" },
          { accessorKey: "dept", header: "Dept", dataType: "text" },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Dept filter/i }));
    expect(screen.getByRole("checkbox", { name: "Grocery" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Home" })).toBeInTheDocument();
  });

  it("keeps free-text contains for high-cardinality text under facetThreshold", () => {
    render(
      <DataGrid
        data={[{ id: "a", name: "Alpha" }, { id: "b", name: "Beta" }]}
        columns={[{ accessorKey: "name", header: "Name", dataType: "text" }]}
        facetThreshold={1}
        // Disable row selection so the only checkboxes that could appear are
        // facet checkboxes — which a free-text "contains" filter must not render.
        features={{ rowSelection: false }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Name filter/i }));
    expect(screen.getByLabelText("Name contains")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("respects enableFiltering: false (no funnel)", () => {
    render(
      <DataGrid
        data={[{ id: "a", note: "x" }]}
        columns={[
          { accessorKey: "id", header: "ID", dataType: "text" },
          { accessorKey: "note", header: "Note", dataType: "text", enableFiltering: false },
        ]}
      />,
    );
    expect(screen.queryByRole("button", { name: /Note filter/i })).not.toBeInTheDocument();
  });

  it("reverts to opt-in when features.autoColumnFilters is false", () => {
    render(
      <DataGrid
        data={[{ id: "a", price: 1 }]}
        columns={[
          { accessorKey: "id", header: "ID", dataType: "text" },
          { accessorKey: "price", header: "Price", dataType: "number" },
        ]}
        filters={[{ accessorKey: "price" }]}
        features={{ autoColumnFilters: false }}
      />,
    );
    expect(screen.getByRole("button", { name: /Price filter/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ID filter/i })).not.toBeInTheDocument();
  });

  it("infers from dataType when a filters entry omits filterType (regression for the old select default)", () => {
    render(
      <DataGrid
        data={[{ id: "a", price: 5 }, { id: "b", price: 9 }]}
        columns={[{ accessorKey: "price", header: "Price", dataType: "number" }]}
        filters={[{ accessorKey: "price" }]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Price filter/i }));
    expect(screen.getByLabelText("Price minimum")).toBeInTheDocument();
  });
});
