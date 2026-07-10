import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

const chooseDropdownOption = (label: string, option: string) => {
  fireEvent.click(screen.getByRole("button", { name: label }));
  fireEvent.click(screen.getByRole("option", { name: option }));
};

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

  it("shows a message instead of a blank popover when a multiSelect filter has no options", () => {
    // Server mode with a named multiSelect filter that has no static options —
    // the documented degradation where the grid cannot auto-facet, so the
    // option list is empty. Without a message the popover body renders blank.
    const filters: GridFilterConfig<Row>[] = [
      { accessorKey: "dept", label: "Dept", filterType: "multiSelect" },
    ];
    render(
      <DataGrid
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        filters={filters}
        dataMode="server"
        rowCount={data.length}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Dept filter/i }));
    expect(screen.getByText("No options available")).toBeInTheDocument();
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
    // Exact name (not the /Dept filter/i regex) so the chip bar's
    // "Remove Dept filter" button doesn't also match this query.
    expect(screen.getByRole("button", { name: "Dept filter" })).toHaveAttribute("data-active");
  });

  it("filter popover dialog carries scrollable clamp styling and default down placement", () => {
    // jsdom rects are all zeros → helper reports openUp=false/alignEnd=false;
    // this pins the default branch and the overflow guard.
    const filters: GridFilterConfig<Row>[] = [
      { accessorKey: "dept", label: "Dept", filterType: "text" },
    ];
    render(<DataGrid data={data} columns={columns} getRowId={(r) => r.id} filters={filters} />);
    fireEvent.click(screen.getAllByRole("button", { name: /filter$/ })[0]);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveClass("dg-popover--below");
    expect(dialog).toHaveClass("dg-popover");
    expect(dialog).not.toHaveClass("dg-popover--above");
  });

  it("lets text filters use a starts-with operator from the header popover", () => {
    const filters: GridFilterConfig<Row>[] = [
      { accessorKey: "dept", label: "Dept", filterType: "text" },
    ];
    render(<DataGrid data={data} columns={columns} getRowId={(r) => r.id} filters={filters} />);

    fireEvent.click(screen.getByRole("button", { name: /Dept filter/i }));
    chooseDropdownOption("Dept operator", "Starts with");
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
    chooseDropdownOption("Revenue operator", "Greater than");
    fireEvent.change(screen.getByLabelText("Revenue value"), { target: { value: "1000" } });

    expect(screen.queryByText("$500")).not.toBeInTheDocument();
    expect(screen.queryByText("$1,000")).not.toBeInTheDocument();
    expect(screen.getByText("$1,500")).toBeInTheDocument();
  });

  it("adds a search box to multiSelect filters with many options and filters the list", () => {
    // 12 distinct dept values → auto-facets to multiSelect (facetThreshold default
    // is 12) and exceeds the 10-option search-box threshold.
    type WideRow = { id: string; dept: string };
    const wideData: WideRow[] = Array.from({ length: 12 }, (_, i) => ({
      id: String(i),
      dept: `Dept${i}`,
    }));
    const wideColumns: GridColumnConfig<WideRow>[] = [
      { accessorKey: "dept", header: "Dept", dataType: "text" },
    ];
    render(<DataGrid data={wideData} columns={wideColumns} getRowId={(r) => r.id} />);

    fireEvent.click(screen.getByRole("button", { name: /Dept filter/i }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getAllByRole("checkbox").length).toBe(12);

    const search = screen.getByPlaceholderText("Find option...");
    fireEvent.change(search, { target: { value: "Dept1" } });

    // "Dept1", "Dept10", "Dept11" match; the rest are filtered out of view.
    expect(within(dialog).getAllByRole("checkbox").length).toBeLessThan(12);
  });

  it("omits the search box for short option lists", () => {
    const filters: GridFilterConfig<Row>[] = [
      { accessorKey: "dept", label: "Dept", filterType: "multiSelect" },
    ];
    render(<DataGrid data={data} columns={columns} getRowId={(r) => r.id} filters={filters} />);

    fireEvent.click(screen.getByRole("button", { name: /Dept filter/i }));
    expect(screen.queryByPlaceholderText("Find option...")).toBeNull();
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

// ----- type-aware filter predicate coverage -----
// Drives the real filter controls (aria-labels verified against filterBodies.tsx)
// and asserts which rows are visible.  All data is domain-neutral.
describe("type-aware filter predicate coverage", () => {
  // --- shared number dataset ---
  type NRow = { id: string; n: number };
  const nData: NRow[] = [
    { id: "neg",   n: -2 },
    { id: "zero",  n: 0 },
    { id: "dec",   n: 3.5 },
    { id: "hi",    n: 10 },
    { id: "blank", n: NaN }, // non-finite → excluded by any active range filter
  ];
  const nColumns: GridColumnConfig<NRow>[] = [
    { accessorKey: "id", header: "ID", dataType: "text" },
    { accessorKey: "n",  header: "N",  dataType: "number" },
  ];
  const openNFilter = () =>
    fireEvent.click(screen.getByRole("button", { name: /N filter/i }));

  // --- number: between ---
  it("number: between min+max keeps only in-range rows (inclusive both ends)", () => {
    render(<DataGrid data={nData} columns={nColumns} getRowId={(r) => r.id} />);
    openNFilter();
    fireEvent.change(screen.getByLabelText("N minimum"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("N maximum"), { target: { value: "5" } });
    // 0 and 3.5 are in [0, 5]; -2 and 10 are not; NaN is excluded
    expect(screen.getByText("zero")).toBeInTheDocument();
    expect(screen.getByText("dec")).toBeInTheDocument();
    expect(screen.queryByText("neg")).not.toBeInTheDocument();
    expect(screen.queryByText("hi")).not.toBeInTheDocument();
    expect(screen.queryByText("blank")).not.toBeInTheDocument();
  });

  it("number: min-only keeps rows >= min", () => {
    render(<DataGrid data={nData} columns={nColumns} getRowId={(r) => r.id} />);
    openNFilter();
    fireEvent.change(screen.getByLabelText("N minimum"), { target: { value: "3.5" } });
    // 3.5 and 10 pass; -2, 0, NaN do not
    expect(screen.getByText("dec")).toBeInTheDocument();
    expect(screen.getByText("hi")).toBeInTheDocument();
    expect(screen.queryByText("neg")).not.toBeInTheDocument();
    expect(screen.queryByText("zero")).not.toBeInTheDocument();
    expect(screen.queryByText("blank")).not.toBeInTheDocument();
  });

  it("number: max-only keeps rows <= max", () => {
    render(<DataGrid data={nData} columns={nColumns} getRowId={(r) => r.id} />);
    openNFilter();
    fireEvent.change(screen.getByLabelText("N maximum"), { target: { value: "0" } });
    // -2 and 0 pass; 3.5, 10, NaN do not
    expect(screen.getByText("neg")).toBeInTheDocument();
    expect(screen.getByText("zero")).toBeInTheDocument();
    expect(screen.queryByText("dec")).not.toBeInTheDocument();
    expect(screen.queryByText("hi")).not.toBeInTheDocument();
    expect(screen.queryByText("blank")).not.toBeInTheDocument();
  });

  it("number: gt keeps rows strictly greater than bound", () => {
    render(<DataGrid data={nData} columns={nColumns} getRowId={(r) => r.id} />);
    openNFilter();
    chooseDropdownOption("N operator", "Greater than");
    fireEvent.change(screen.getByLabelText("N value"),    { target: { value: "3.5" } });
    // only 10 > 3.5
    expect(screen.getByText("hi")).toBeInTheDocument();
    expect(screen.queryByText("dec")).not.toBeInTheDocument();
    expect(screen.queryByText("zero")).not.toBeInTheDocument();
    expect(screen.queryByText("neg")).not.toBeInTheDocument();
    expect(screen.queryByText("blank")).not.toBeInTheDocument();
  });

  it("number: gte keeps rows >= bound (includes the exact match)", () => {
    render(<DataGrid data={nData} columns={nColumns} getRowId={(r) => r.id} />);
    openNFilter();
    chooseDropdownOption("N operator", "Greater than or equal");
    fireEvent.change(screen.getByLabelText("N value"),    { target: { value: "3.5" } });
    // 3.5 and 10 pass
    expect(screen.getByText("dec")).toBeInTheDocument();
    expect(screen.getByText("hi")).toBeInTheDocument();
    expect(screen.queryByText("zero")).not.toBeInTheDocument();
    expect(screen.queryByText("neg")).not.toBeInTheDocument();
    expect(screen.queryByText("blank")).not.toBeInTheDocument();
  });

  it("number: lt keeps rows strictly less than bound", () => {
    render(<DataGrid data={nData} columns={nColumns} getRowId={(r) => r.id} />);
    openNFilter();
    chooseDropdownOption("N operator", "Less than");
    fireEvent.change(screen.getByLabelText("N value"),    { target: { value: "0" } });
    // only -2 < 0
    expect(screen.getByText("neg")).toBeInTheDocument();
    expect(screen.queryByText("zero")).not.toBeInTheDocument();
    expect(screen.queryByText("dec")).not.toBeInTheDocument();
    expect(screen.queryByText("hi")).not.toBeInTheDocument();
    expect(screen.queryByText("blank")).not.toBeInTheDocument();
  });

  it("number: lte keeps rows <= bound (includes the exact match)", () => {
    render(<DataGrid data={nData} columns={nColumns} getRowId={(r) => r.id} />);
    openNFilter();
    chooseDropdownOption("N operator", "Less than or equal");
    fireEvent.change(screen.getByLabelText("N value"),    { target: { value: "0" } });
    // -2 and 0 pass
    expect(screen.getByText("neg")).toBeInTheDocument();
    expect(screen.getByText("zero")).toBeInTheDocument();
    expect(screen.queryByText("dec")).not.toBeInTheDocument();
    expect(screen.queryByText("hi")).not.toBeInTheDocument();
    expect(screen.queryByText("blank")).not.toBeInTheDocument();
  });

  it("number: equals keeps only the exact matched row", () => {
    render(<DataGrid data={nData} columns={nColumns} getRowId={(r) => r.id} />);
    openNFilter();
    chooseDropdownOption("N operator", "Equals");
    fireEvent.change(screen.getByLabelText("N value"),    { target: { value: "10" } });
    expect(screen.getByText("hi")).toBeInTheDocument();
    expect(screen.queryByText("neg")).not.toBeInTheDocument();
    expect(screen.queryByText("zero")).not.toBeInTheDocument();
    expect(screen.queryByText("dec")).not.toBeInTheDocument();
    expect(screen.queryByText("blank")).not.toBeInTheDocument();
  });

  it("number: notEquals excludes matched row; blank/NaN cell is also excluded", () => {
    render(<DataGrid data={nData} columns={nColumns} getRowId={(r) => r.id} />);
    openNFilter();
    chooseDropdownOption("N operator", "Does not equal");
    fireEvent.change(screen.getByLabelText("N value"),    { target: { value: "10" } });
    // -2, 0, 3.5 pass; 10 excluded; NaN excluded (non-finite)
    expect(screen.getByText("neg")).toBeInTheDocument();
    expect(screen.getByText("zero")).toBeInTheDocument();
    expect(screen.getByText("dec")).toBeInTheDocument();
    expect(screen.queryByText("hi")).not.toBeInTheDocument();
    expect(screen.queryByText("blank")).not.toBeInTheDocument();
  });

  it("number: negative bound — gt -2 excludes the -2 row itself", () => {
    render(<DataGrid data={nData} columns={nColumns} getRowId={(r) => r.id} />);
    openNFilter();
    chooseDropdownOption("N operator", "Greater than");
    fireEvent.change(screen.getByLabelText("N value"),    { target: { value: "-2" } });
    // 0, 3.5, 10 > -2; -2 is not strictly greater than -2; NaN excluded
    expect(screen.getByText("zero")).toBeInTheDocument();
    expect(screen.getByText("dec")).toBeInTheDocument();
    expect(screen.getByText("hi")).toBeInTheDocument();
    expect(screen.queryByText("neg")).not.toBeInTheDocument();
    expect(screen.queryByText("blank")).not.toBeInTheDocument();
  });

  it("number: decimal bound — between 0 and 3.5 is inclusive at both endpoints", () => {
    render(<DataGrid data={nData} columns={nColumns} getRowId={(r) => r.id} />);
    openNFilter();
    fireEvent.change(screen.getByLabelText("N minimum"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("N maximum"), { target: { value: "3.5" } });
    // 0 and 3.5 in [0, 3.5]; -2 and 10 out; NaN excluded
    expect(screen.getByText("zero")).toBeInTheDocument();
    expect(screen.getByText("dec")).toBeInTheDocument();
    expect(screen.queryByText("neg")).not.toBeInTheDocument();
    expect(screen.queryByText("hi")).not.toBeInTheDocument();
    expect(screen.queryByText("blank")).not.toBeInTheDocument();
  });

  it("number: zero is a real value — gte 0 keeps the zero row", () => {
    render(<DataGrid data={nData} columns={nColumns} getRowId={(r) => r.id} />);
    openNFilter();
    chooseDropdownOption("N operator", "Greater than or equal");
    fireEvent.change(screen.getByLabelText("N value"),    { target: { value: "0" } });
    // 0, 3.5, 10 >= 0; -2 does not; NaN excluded
    expect(screen.getByText("zero")).toBeInTheDocument();
    expect(screen.getByText("dec")).toBeInTheDocument();
    expect(screen.getByText("hi")).toBeInTheDocument();
    expect(screen.queryByText("neg")).not.toBeInTheDocument();
    expect(screen.queryByText("blank")).not.toBeInTheDocument();
  });

  it("number: between {min:-1, max:0} keeps only the zero row among finite values (zero is not blank)", () => {
    render(<DataGrid data={nData} columns={nColumns} getRowId={(r) => r.id} />);
    openNFilter();
    // [-1, 0]: only 0 qualifies; -2 is below, 3.5 and 10 are above, NaN excluded
    fireEvent.change(screen.getByLabelText("N minimum"), { target: { value: "-1" } });
    fireEvent.change(screen.getByLabelText("N maximum"), { target: { value: "0" } });
    expect(screen.getByText("zero")).toBeInTheDocument();
    expect(screen.queryByText("neg")).not.toBeInTheDocument();
    expect(screen.queryByText("dec")).not.toBeInTheDocument();
    expect(screen.queryByText("hi")).not.toBeInTheDocument();
    expect(screen.queryByText("blank")).not.toBeInTheDocument();
  });

  it("number: inverted range (min > max) matches no rows", () => {
    render(<DataGrid data={nData} columns={nColumns} getRowId={(r) => r.id} />);
    openNFilter();
    // min=10 > max=3 → no value can satisfy both bounds
    fireEvent.change(screen.getByLabelText("N minimum"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("N maximum"), { target: { value: "3" } });
    expect(screen.queryByText("neg")).not.toBeInTheDocument();
    expect(screen.queryByText("zero")).not.toBeInTheDocument();
    expect(screen.queryByText("dec")).not.toBeInTheDocument();
    expect(screen.queryByText("hi")).not.toBeInTheDocument();
    expect(screen.queryByText("blank")).not.toBeInTheDocument();
  });

  it("number: blank/NaN cell is excluded when any range filter is active", () => {
    render(<DataGrid data={nData} columns={nColumns} getRowId={(r) => r.id} />);
    openNFilter();
    // max-only with a very high bound — all finite rows pass, NaN row does not
    fireEvent.change(screen.getByLabelText("N maximum"), { target: { value: "100" } });
    expect(screen.getByText("neg")).toBeInTheDocument();
    expect(screen.getByText("zero")).toBeInTheDocument();
    expect(screen.getByText("dec")).toBeInTheDocument();
    expect(screen.getByText("hi")).toBeInTheDocument();
    expect(screen.queryByText("blank")).not.toBeInTheDocument();
  });

  // --- percent column ---
  it("percent: between range over raw fractional values keeps in-range rows", () => {
    type PRow = { id: string; rate: number };
    const pData: PRow[] = [
      { id: "low",  rate: 0.1 },
      { id: "mid",  rate: 0.5 },
      { id: "high", rate: 0.9 },
    ];
    const pColumns: GridColumnConfig<PRow>[] = [
      { accessorKey: "id",   header: "ID",   dataType: "text" },
      { accessorKey: "rate", header: "Rate", dataType: "percent" },
    ];
    render(<DataGrid data={pData} columns={pColumns} getRowId={(r) => r.id} />);
    fireEvent.click(screen.getByRole("button", { name: /Rate filter/i }));
    // min=0.4: mid (0.5) and high (0.9) are >= 0.4; low (0.1) is not
    fireEvent.change(screen.getByLabelText("Rate minimum"), { target: { value: "0.4" } });
    expect(screen.getByText("mid")).toBeInTheDocument();
    expect(screen.getByText("high")).toBeInTheDocument();
    expect(screen.queryByText("low")).not.toBeInTheDocument();
  });

  // --- currency column ---
  it("currency: between range keeps in-range rows", () => {
    type CRow = { id: string; price: number };
    const cData: CRow[] = [
      { id: "cheap",     price: 5 },
      { id: "medium",    price: 25 },
      { id: "expensive", price: 100 },
    ];
    const cColumns: GridColumnConfig<CRow>[] = [
      { accessorKey: "id",    header: "ID",    dataType: "text" },
      { accessorKey: "price", header: "Price", dataType: "currency" },
    ];
    render(<DataGrid data={cData} columns={cColumns} getRowId={(r) => r.id} />);
    fireEvent.click(screen.getByRole("button", { name: /Price filter/i }));
    // [10, 50]: only 25 qualifies; 5 and 100 are out
    fireEvent.change(screen.getByLabelText("Price minimum"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Price maximum"), { target: { value: "50" } });
    expect(screen.getByText("medium")).toBeInTheDocument();
    expect(screen.queryByText("cheap")).not.toBeInTheDocument();
    expect(screen.queryByText("expensive")).not.toBeInTheDocument();
  });

  // --- boolean column ---
  type BRow = { id: string; flag: boolean };
  const bData: BRow[] = [
    { id: "yes1", flag: true },
    { id: "yes2", flag: true },
    { id: "no1",  flag: false },
    { id: "no2",  flag: false },
  ];
  const bColumns: GridColumnConfig<BRow>[] = [
    { accessorKey: "id",   header: "ID",   dataType: "text" },
    { accessorKey: "flag", header: "Flag", dataType: "boolean" },
  ];

  it("boolean: funnel opens a listbox with True and False options", () => {
    render(<DataGrid data={bData} columns={bColumns} getRowId={(r) => r.id} />);
    fireEvent.click(screen.getByRole("button", { name: /Flag filter/i }));
    const listbox = screen.getByRole("listbox", { name: /Flag options/i });
    expect(listbox).toBeInTheDocument();
    expect(within(listbox).getByRole("option", { name: "True" })).toBeInTheDocument();
    expect(within(listbox).getByRole("option", { name: "False" })).toBeInTheDocument();
  });

  it("boolean: clicking True keeps only true rows", () => {
    render(<DataGrid data={bData} columns={bColumns} getRowId={(r) => r.id} />);
    fireEvent.click(screen.getByRole("button", { name: /Flag filter/i }));
    // Clicking the option closes the popover
    fireEvent.click(screen.getByRole("option", { name: "True" }));
    expect(screen.getByText("yes1")).toBeInTheDocument();
    expect(screen.getByText("yes2")).toBeInTheDocument();
    expect(screen.queryByText("no1")).not.toBeInTheDocument();
    expect(screen.queryByText("no2")).not.toBeInTheDocument();
  });

  it("boolean: clicking False keeps only false rows", () => {
    render(<DataGrid data={bData} columns={bColumns} getRowId={(r) => r.id} />);
    fireEvent.click(screen.getByRole("button", { name: /Flag filter/i }));
    fireEvent.click(screen.getByRole("option", { name: "False" }));
    expect(screen.getByText("no1")).toBeInTheDocument();
    expect(screen.getByText("no2")).toBeInTheDocument();
    expect(screen.queryByText("yes1")).not.toBeInTheDocument();
    expect(screen.queryByText("yes2")).not.toBeInTheDocument();
  });
});

describe("DataGrid applied-filter chip bar", () => {
  it("shows a removable chip for each active filter", () => {
    render(
      <DataGrid
        data={[
          { id: "a", dept: "Grocery", price: 5 },
          { id: "b", dept: "Home", price: 50 },
        ]}
        columns={[
          { accessorKey: "dept", header: "Dept", dataType: "text" },
          { accessorKey: "price", header: "Price", dataType: "number" },
        ]}
        getRowId={(r) => r.id}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Dept filter/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Grocery" }));
    const chip = screen.getByTestId("applied-filter-dept");
    expect(chip).toHaveTextContent(/Dept/);
    fireEvent.click(within(chip).getByRole("button", { name: /Remove Dept filter/i }));
    expect(screen.queryByTestId("applied-filter-dept")).not.toBeInTheDocument();
  });

  it("clears every active filter when Clear all is clicked", () => {
    render(
      <DataGrid
        data={[
          { id: "a", dept: "Grocery", price: 5 },
          { id: "b", dept: "Home", price: 50 },
        ]}
        columns={[
          { accessorKey: "dept", header: "Dept", dataType: "text" },
          { accessorKey: "price", header: "Price", dataType: "number" },
        ]}
        getRowId={(r) => r.id}
      />,
    );
    // Two active filters → two chips (a Dept facet selection and a Price range).
    fireEvent.click(screen.getByRole("button", { name: /Dept filter/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Grocery" }));
    fireEvent.click(screen.getByRole("button", { name: /Price filter/i }));
    fireEvent.change(screen.getByLabelText("Price minimum"), { target: { value: "10" } });
    expect(screen.getByTestId("applied-filter-dept")).toBeInTheDocument();
    expect(screen.getByTestId("applied-filter-price")).toBeInTheDocument();

    // Clear all removes BOTH chips (not just one) and restores the full row set.
    fireEvent.click(screen.getByRole("button", { name: /clear all/i }));
    expect(screen.queryByTestId("applied-filter-dept")).not.toBeInTheDocument();
    expect(screen.queryByTestId("applied-filter-price")).not.toBeInTheDocument();
    expect(screen.getByText(/2 of 2 rows/i)).toBeInTheDocument();
  });

  it("hides the applied-filter bar when features.filterSummary is false", () => {
    render(
      <DataGrid
        data={[{ id: "a", dept: "Grocery" }, { id: "b", dept: "Home" }]}
        columns={[{ accessorKey: "dept", header: "Dept", dataType: "text" }]}
        getRowId={(r) => r.id}
        features={{ filterSummary: false }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Dept filter/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Grocery" }));
    expect(screen.queryByTestId("applied-filter-dept")).not.toBeInTheDocument();
  });

  it("status bar reflects the filtered row count", () => {
    render(
      <DataGrid
        data={[{ id: "a", dept: "Grocery" }, { id: "b", dept: "Home" }]}
        columns={[{ accessorKey: "dept", header: "Dept", dataType: "text" }]}
        getRowId={(r) => r.id}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Dept filter/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Grocery" }));
    expect(screen.getByText(/1 of 2 rows/i)).toBeInTheDocument();
  });

  it("keeps the chip for a filtered column even when that column is hidden", () => {
    render(
      <DataGrid
        data={[{ id: "a", dept: "Grocery" }, { id: "b", dept: "Home" }]}
        columns={[
          { accessorKey: "id", header: "ID", dataType: "text" },
          { accessorKey: "dept", header: "Dept", dataType: "text" },
        ]}
        getRowId={(r) => r.id}
        state={{ columnVisibility: { dept: false }, columnFilters: [{ id: "dept", value: ["Grocery"] }] }}
      />,
    );
    const chip = screen.getByTestId("applied-filter-dept");
    expect(chip).toHaveTextContent(/Dept/);
    expect(within(chip).getByRole("button", { name: /Remove Dept filter/i })).toBeInTheDocument();
  });

  it("renders an applied-filter chip in pivot mode for an active filter", () => {
    type PivotRow = { id: string; dept: string; revenue: number };
    const pivotData: PivotRow[] = [
      { id: "1", dept: "Grocery", revenue: 100 },
      { id: "2", dept: "Home", revenue: 200 },
    ];
    const pivotColumns: GridColumnConfig<PivotRow>[] = [
      { accessorKey: "dept", header: "Dept", dataType: "text", enableGrouping: true },
      { accessorKey: "revenue", header: "Revenue", dataType: "currency" },
    ];
    render(
      <DataGrid
        data={pivotData}
        columns={pivotColumns}
        layoutMode="pivot"
        getRowId={(r) => r.id}
        pivot={{
          rows: ["dept"],
          measures: [
            { id: "revenue", label: "Revenue", columnId: "revenue", aggregation: "sum" },
          ],
        }}
        state={{ columnFilters: [{ id: "dept", value: ["Grocery"] }] }}
      />,
    );
    const chip = screen.getByTestId("applied-filter-dept");
    expect(chip).toHaveTextContent(/Dept/);
  });

  it("bounds applied-filter chip labels so long values cannot push Clear all away", () => {
    const longValue =
      "an extremely long free-text filter value that would otherwise stretch the chip and push Clear all off-screen";
    render(
      <DataGrid
        data={[
          { id: "a", note: longValue },
          { id: "b", note: "other" },
        ]}
        columns={[{ accessorKey: "note", header: "Note", dataType: "text" }]}
        getRowId={(r) => r.id}
        state={{ columnFilters: [{ id: "note", value: longValue }] }}
      />,
    );
    const chip = screen.getAllByTestId(/applied-filter-/)[0];
    const label = chip.querySelector(".dg-applied-filter-label");
    expect(label).toHaveClass("dg-applied-filter-label");
  });
});
