import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataGrid, type DataGridSummaryItem } from "./DataGrid";
import type { GridColumnConfig } from "../../types/grid";

type Row = { id: string; dept: string; product: string; revenue: number; units: number };

const rows: Row[] = [
  { id: "1", dept: "Grocery", product: "Almond Butter", revenue: 1200, units: 24 },
  { id: "2", dept: "Grocery", product: "Apples", revenue: 900, units: 42 },
  { id: "3", dept: "Home", product: "Shelf Bin", revenue: 700, units: 18 },
  { id: "4", dept: "Home", product: "Lamp", revenue: 500, units: 12 },
];

const columns: GridColumnConfig<Row>[] = [
  { accessorKey: "dept", header: "Dept", dataType: "text", enableGrouping: true },
  { accessorKey: "product", header: "Product", dataType: "text" },
  { accessorKey: "revenue", header: "Revenue", dataType: "currency" },
  { accessorKey: "units", header: "Units", dataType: "number" },
];

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("DataGrid grid layout — grouping + pagination (bug #1)", () => {
  it("renders each leaf row exactly once when a group is expanded", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <DataGrid data={rows} columns={columns} defaultGrouping={["dept"]} getRowId={(r) => r.id} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Toggle Dept Grocery group/ }));

    expect(screen.queryAllByText("Almond Butter")).toHaveLength(1);
    const dupKeyWarning = errorSpy.mock.calls.some((c) => String(c[0]).includes("same key"));
    expect(dupKeyWarning).toBe(false);
    errorSpy.mockRestore();
  });
});

describe("DataGrid pivot layout — pagination override (bug #3)", () => {
  type R = { id: string; dept: string; sub: string; revenue: number };
  const data: R[] = [
    { id: "1", dept: "Grocery", sub: "Nut", revenue: 100 },
    { id: "2", dept: "Grocery", sub: "Fruit", revenue: 200 },
    { id: "3", dept: "Home", sub: "Decor", revenue: 300 },
  ];
  const cols: GridColumnConfig<R>[] = [
    { accessorKey: "dept", header: "Dept", dataType: "text", enableGrouping: true },
    { accessorKey: "sub", header: "Sub", dataType: "text", enableGrouping: true },
    { accessorKey: "revenue", header: "Revenue", dataType: "currency" },
  ];
  const summary: DataGridSummaryItem<R>[] = [
    { id: "rev", columnId: "revenue", label: "Revenue", value: ({ rows }) => rows.length },
  ];

  it("does not duplicate subgroup rows when pagination is force-enabled in pivot mode", () => {
    render(
      <DataGrid
        data={data}
        columns={cols}
        layoutMode="pivot"
        features={{ pagination: true }}
        summaryItems={summary}
        defaultGrouping={["dept", "sub"]}
        getRowId={(r) => r.id}
      />,
    );

    expect(screen.queryAllByText("Nut")).toHaveLength(1);
    expect(screen.queryAllByText("Fruit")).toHaveLength(1);
  });
});

describe("DataGrid numeric cell rendering (bugs #4 & #5)", () => {
  it("renders blank instead of '$NaN' for non-numeric values in a numeric column", () => {
    const data = [
      { id: "1", dept: "X", product: "P", revenue: "N/A" as unknown as number, units: 5 },
    ];
    render(<DataGrid data={data} columns={columns} getRowId={(r) => r.id} />);

    expect(screen.queryByText("$NaN")).not.toBeInTheDocument();
    expect(screen.queryByText("NaN")).not.toBeInTheDocument();
  });

  it("renders blank instead of a fake '$0' for empty-string values in a numeric column", () => {
    const data = [
      { id: "1", dept: "X", product: "P", revenue: "" as unknown as number, units: 5 },
    ];
    render(<DataGrid data={data} columns={columns} getRowId={(r) => r.id} />);

    expect(screen.queryByText("$0")).not.toBeInTheDocument();
  });
});

describe("DataGrid persistence respects controlled slices (bug #2)", () => {
  it("does not write savedViews to localStorage when savedViews is controlled", () => {
    const onSavedViewsChange = vi.fn();
    render(
      <DataGrid
        data={rows}
        columns={columns}
        getRowId={(r) => r.id}
        storageKey="ctrl-test"
        state={{ savedViews: {} }}
        onSavedViewsChange={onSavedViewsChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("View name"), { target: { value: "My view" } });
    fireEvent.click(screen.getByRole("button", { name: "Save view" }));

    expect(onSavedViewsChange).toHaveBeenCalled();
    expect(window.localStorage.getItem("ctrl-test.savedViews")).toBeNull();
  });

  it("does write savedViews to localStorage when savedViews is uncontrolled", () => {
    render(
      <DataGrid data={rows} columns={columns} getRowId={(r) => r.id} storageKey="unctrl-test" />,
    );

    fireEvent.change(screen.getByLabelText("View name"), { target: { value: "My view" } });
    fireEvent.click(screen.getByRole("button", { name: "Save view" }));

    expect(window.localStorage.getItem("unctrl-test.savedViews")).toContain("My view");
  });
});

describe("DataGrid pivot does not emit pagination events (bug #7)", () => {
  it("does not call onPaginationChange when grouping changes in pivot mode", () => {
    const onPaginationChange = vi.fn();
    const summary: DataGridSummaryItem<Row>[] = [
      { id: "rev", columnId: "revenue", label: "Revenue", value: ({ rows }) => rows.length },
    ];
    render(
      <DataGrid
        data={rows}
        columns={columns}
        layoutMode="pivot"
        summaryItems={summary}
        defaultGrouping={["dept"]}
        getRowId={(r) => r.id}
        onPaginationChange={onPaginationChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove Dept grouping" }));

    expect(onPaginationChange).not.toHaveBeenCalled();
  });
});

describe("DataGrid pagination footer on empty results (bug #8)", () => {
  it("does not show 'Page 1 of 0' when filters reduce the grid to zero rows", () => {
    render(<DataGrid data={rows} columns={columns} getRowId={(r) => r.id} />);

    fireEvent.change(screen.getByPlaceholderText(/Search/i), {
      target: { value: "zzz-no-match" },
    });

    expect(screen.queryByText(/Page 1 of 0/)).not.toBeInTheDocument();
  });
});
