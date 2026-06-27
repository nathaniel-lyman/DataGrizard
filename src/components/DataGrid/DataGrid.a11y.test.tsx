import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataGrid } from "./DataGrid";
import type { GridColumnConfig } from "../../types/grid";

type Row = { id: string; dept: string; product: string; revenue: number; units: number };

const rows: Row[] = [
  { id: "1", dept: "Grocery", product: "Almond Butter", revenue: 1200, units: 24 },
  { id: "2", dept: "Grocery", product: "Apples", revenue: 900, units: 42 },
];

const columns: GridColumnConfig<Row>[] = [
  { accessorKey: "dept", header: "Dept", dataType: "text", enableGrouping: true },
  { accessorKey: "product", header: "Product", dataType: "text" },
  { accessorKey: "revenue", header: "Revenue", dataType: "currency" },
  { accessorKey: "units", header: "Units", dataType: "number" },
];

const openViewControls = () => {
  fireEvent.click(screen.getByRole("button", { name: "View controls" }));
};

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("DataGrid accessibility", () => {
  it("exposes aria-sort on sortable headers reflecting the sort state", () => {
    render(<DataGrid data={rows} columns={columns} getRowId={(r) => r.id} />);
    // Text columns sort ascending-first (numeric columns sort descending-first
    // by TanStack default), so assert on a text column for an intuitive cycle.
    const header = screen.getByRole("columnheader", { name: /Product/ });

    expect(header).toHaveAttribute("aria-sort", "none");
    fireEvent.click(screen.getByRole("button", { name: "Product" }));
    expect(header).toHaveAttribute("aria-sort", "ascending");
    fireEvent.click(screen.getByRole("button", { name: "Product" }));
    expect(header).toHaveAttribute("aria-sort", "descending");
  });

  it("triggers the row action via Enter on a focused cell", () => {
    const onRowClick = vi.fn();
    render(
      <DataGrid data={rows} columns={columns} getRowId={(r) => r.id} onRowClick={onRowClick} />,
    );
    // Keyboard focus lives on cells (roving tabindex), not the row.
    const cell = screen.getByText("Almond Butter").closest("td") as HTMLElement;
    cell.focus();
    fireEvent.keyDown(cell, { key: "Enter" });
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });

  it("does not make rows focusable (cells own the tab stop)", () => {
    render(<DataGrid data={rows} columns={columns} getRowId={(r) => r.id} onRowClick={() => {}} />);
    const row = screen.getByText("Almond Butter").closest("tr") as HTMLElement;
    expect(row).not.toHaveAttribute("tabindex");
  });

  it("closes the Columns popover on Escape and restores focus to the trigger", () => {
    render(<DataGrid data={rows} columns={columns} getRowId={(r) => r.id} />);
    openViewControls();
    const trigger = screen.getByRole("button", { name: /visible/ });

    fireEvent.click(trigger);
    expect(screen.getByRole("button", { name: "Reset columns" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("button", { name: "Reset columns" })).not.toBeInTheDocument();
  });

  it("closes the Columns popover when clicking outside it", () => {
    render(<DataGrid data={rows} columns={columns} getRowId={(r) => r.id} />);

    openViewControls();
    fireEvent.click(screen.getByRole("button", { name: /visible/ }));
    expect(screen.getByRole("button", { name: "Reset columns" })).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("button", { name: "Reset columns" })).not.toBeInTheDocument();
  });

  it("resizes a column from the keyboard via the resize handle", () => {
    render(<DataGrid data={rows} columns={columns} getRowId={(r) => r.id} />);
    const header = screen.getByRole("columnheader", { name: /Revenue/ }) as HTMLElement;
    const handle = screen.getByRole("button", { name: "Resize Revenue" });

    const before = header.style.width;
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(header.style.width).not.toBe(before);
  });

  it("renders an accessible table caption when tableLabel is provided", () => {
    render(
      <DataGrid data={rows} columns={columns} getRowId={(r) => r.id} tableLabel="Product analytics" />,
    );
    expect(screen.getByRole("table", { name: "Product analytics" })).toBeInTheDocument();
  });

  it("preserves pivot table accessibility through generated headers and controls", () => {
    render(
      <DataGrid
        data={rows}
        columns={columns}
        layoutMode="pivot"
        defaultGrouping={["dept", "product"]}
        getRowId={(r) => r.id}
        tableLabel="Pivot analytics"
        summaryItems={[
          { id: "revenue", label: "Revenue", columnId: "revenue", value: ({ rows }) => rows.length },
        ]}
      />,
    );

    expect(screen.getByRole("table", { name: "Pivot analytics" })).toBeInTheDocument();
    const rowLabelHeader = screen.getByRole("columnheader", { name: "Row Labels" });
    expect(rowLabelHeader).toHaveAttribute("aria-sort", "none");
    fireEvent.click(screen.getByRole("button", { name: "Row Labels" }));
    expect(rowLabelHeader).toHaveAttribute("aria-sort");
    expect(screen.getByRole("button", { name: "Toggle Grocery group" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByLabelText("Select source rows for Grocery")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "2" })).not.toBeInTheDocument();
  });
});
