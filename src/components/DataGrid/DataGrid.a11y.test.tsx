import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataGrid } from "./DataGrid";
import { useCellFocus } from "./useCellFocus";
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

  // WCAG 2.1 AA / ARIA grid: rows revealed by expanding a group must join the
  // roving-tabindex cell grid and renumber aria-rowindex over the new visual
  // order (rows below the expanded group shift down — no stale indices).
  it("integrates revealed rows into the cell grid with contiguous aria-rowindex after expansion", () => {
    const grouped: Row[] = [
      { id: "1", dept: "Grocery", product: "Almond Butter", revenue: 1200, units: 24 },
      { id: "2", dept: "Grocery", product: "Apples", revenue: 900, units: 42 },
      { id: "3", dept: "Bakery", product: "Bagels", revenue: 500, units: 10 },
    ];
    render(
      <DataGrid
        data={grouped}
        columns={columns}
        getRowId={(r) => r.id}
        defaultGrouping={["dept"]}
        features={{ pagination: false }}
      />,
    );

    const rowIndexes = () =>
      Array.from(document.querySelectorAll("tbody tr[aria-rowindex]")).map((row) =>
        Number(row.getAttribute("aria-rowindex")),
      );

    // Collapsed: only the two group rows are present (header row is index 1), and
    // no data cell is yet a tab stop.
    expect(rowIndexes()).toEqual([2, 3]);
    expect(screen.queryByText("Almond Butter")).not.toBeInTheDocument();
    expect(document.querySelector('td[tabindex="0"]')).toBeNull();

    // Expand Grocery: its two leaves are revealed and the Bakery group below
    // shifts from index 3 to index 5 — aria-rowindex stays contiguous.
    fireEvent.click(screen.getByRole("button", { name: "Toggle Dept Grocery group" }));
    expect(screen.getByText("Almond Butter")).toBeInTheDocument();
    expect(rowIndexes()).toEqual([2, 3, 4, 5]);

    // Revealed cells join the roving-tabindex grid (a tab stop now exists) and
    // arrow navigation flows through them in visual order.
    const firstLeaf = screen.getByText("Almond Butter").closest("td") as HTMLElement;
    expect(document.querySelector('td[tabindex="0"]')).not.toBeNull();
    firstLeaf.focus();
    fireEvent.keyDown(firstLeaf, { key: "ArrowDown" });
    expect(screen.getByText("Apples").closest("td")).toHaveFocus();
  });

  // WCAG 2.1 AA / ARIA grid: under row virtualization only a window of rows is in
  // the DOM, so the table must still advertise the FULL row count (a screen
  // reader announces "row 500 of 1000", never "of <window size>").
  it("advertises the full dataset via aria-rowcount under virtualization", () => {
    type VRow = { id: string; name: string; revenue: number };
    const vcolumns: GridColumnConfig<VRow>[] = [
      { accessorKey: "name", header: "Name", dataType: "text" },
      { accessorKey: "revenue", header: "Revenue", dataType: "currency" },
    ];
    const vdata: VRow[] = Array.from({ length: 1000 }, (_, i) => ({
      id: String(i),
      name: `Item ${i}`,
      revenue: i,
    }));

    render(
      <DataGrid
        data={vdata}
        columns={vcolumns}
        getRowId={(r) => r.id}
        virtualizeRows
        features={{ pagination: false }}
      />,
    );

    // Derived from visibleRows.length (the full set), not the rendered window:
    // 1 header row + 1000 data rows. A window-scoped count would be ~1.
    expect(screen.getByRole("table")).toHaveAttribute("aria-rowcount", "1001");
  });

  // WCAG 2.1 AA / ARIA grid: the per-row aria-rowindex (DataGrid.tsx renderVisibleRow)
  // is headerRowCount + rowVisibleIndexById.get(row.id) + 1. Its correctness under
  // virtualization hinges on rowVisibleIndexById being the row's position in the
  // FULL visibleRows list — not the rendered window — so a windowed row carries the
  // same index it would have when fully rendered. jsdom can't lay out the virtual
  // window (no ResizeObserver), so we pin the index source directly and assert it is
  // identical whether or not rows are virtualized.
  it("derives aria-rowindex from the global row position, unaffected by virtualization", () => {
    const visibleRows = ["a", "b", "c", "d"].map((id) => ({ id, getIsGrouped: () => false }));
    const table = {
      getVisibleLeafColumns: () => [
        { id: "name", getIsPinned: () => false },
        { id: "revenue", getIsPinned: () => false },
      ],
      getHeaderGroups: () => [{ id: "h" }],
    };
    const rowVirtualizer = { scrollToIndex: () => {} };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const options = (virtualizeRows: boolean): any => ({
      visibleRows,
      isPivotLayout: false,
      table,
      floatingFiltersEnabled: false,
      virtualizeRows,
      rowVirtualizer,
      virtualizeColumns: false,
      columnVirtualizer: { scrollToIndex: () => {} },
    });

    const virtual = renderHook(() => useCellFocus(options(true)));
    const plain = renderHook(() => useCellFocus(options(false)));

    const globalIndex = { a: 0, b: 1, c: 2, d: 3 };
    expect(Object.fromEntries(virtual.result.current.rowVisibleIndexById)).toEqual(globalIndex);
    // Same global index source with virtualization off — windowing never shifts it.
    expect(Object.fromEntries(plain.result.current.rowVisibleIndexById)).toEqual(globalIndex);
    expect(virtual.result.current.headerRowCount).toBe(1);
  });

  it("scrolls an off-window column into view via the column virtualizer", () => {
    const scrolled: number[] = [];
    const visibleRows = [{ id: "a", getIsGrouped: () => false }];
    const table = {
      getVisibleLeafColumns: () => [
        { id: "pin", getIsPinned: () => "left" },
        { id: "c0", getIsPinned: () => false },
        { id: "c1", getIsPinned: () => false },
      ],
      getHeaderGroups: () => [{ id: "h" }],
    };
    const options: any = {
      visibleRows,
      isPivotLayout: false,
      table,
      floatingFiltersEnabled: false,
      virtualizeRows: false,
      rowVirtualizer: { scrollToIndex: () => {} },
      virtualizeColumns: true,
      columnVirtualizer: { scrollToIndex: (i: number) => scrolled.push(i) },
    };
    const { result } = renderHook(() => useCellFocus(options));
    // "c1" is not mounted (no cellRef registered): focusCell must ask the
    // column virtualizer for its CENTER index (1), not its leaf index (2).
    act(() => result.current.focusCell("a", "c1"));
    expect(scrolled).toEqual([1]);
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
