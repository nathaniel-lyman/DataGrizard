import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataGrid } from "./DataGrid";
import type { GridColumnConfig } from "../../types/grid";

type Row = { id: string; name: string; qty: number; price: number };

const data: Row[] = [
  { id: "1", name: "Alpha", qty: 5, price: 100 },
  { id: "2", name: "Bravo", qty: 9, price: 200 },
  { id: "3", name: "Cara", qty: 2, price: 300 },
];

const columns: GridColumnConfig<Row>[] = [
  { accessorKey: "name", header: "Name", dataType: "text" },
  { accessorKey: "qty", header: "Qty", dataType: "number" },
  { accessorKey: "price", header: "Price", dataType: "currency" },
];

const cellOf = (text: string) => screen.getByText(text).closest("td") as HTMLElement;

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("DataGrid keyboard cell navigation", () => {
  it("exposes exactly one roving tab stop at the first data cell", () => {
    render(
      <DataGrid data={data} columns={columns} getRowId={(r) => r.id} features={{ rowSelection: false }} />,
    );

    expect(cellOf("Alpha")).toHaveAttribute("tabindex", "0");
    expect(document.querySelectorAll('td[tabindex="0"]')).toHaveLength(1);
    expect(cellOf("5")).toHaveAttribute("tabindex", "-1");
  });

  it("moves focus with ArrowRight and ArrowDown", () => {
    render(
      <DataGrid data={data} columns={columns} getRowId={(r) => r.id} features={{ rowSelection: false }} />,
    );

    const start = cellOf("Alpha");
    start.focus();
    fireEvent.keyDown(start, { key: "ArrowRight" });
    expect(document.activeElement).toBe(cellOf("5"));
    expect(cellOf("5")).toHaveAttribute("tabindex", "0");

    fireEvent.keyDown(cellOf("5"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(cellOf("9"));
  });

  it("extends a cell range with Shift+Arrow keys", () => {
    render(
      <DataGrid data={data} columns={columns} getRowId={(r) => r.id} features={{ rowSelection: false }} />,
    );

    const start = cellOf("Alpha");
    start.focus();
    fireEvent.keyDown(start, { key: "ArrowRight", shiftKey: true });

    expect(start).toHaveAttribute("data-cell-selected", "true");
    expect(cellOf("5")).toHaveAttribute("data-cell-selected", "true");
    expect(document.activeElement).toBe(cellOf("5"));
  });

  it("jumps to row ends with Home/End and grid corners with Ctrl+Home/End", () => {
    render(
      <DataGrid data={data} columns={columns} getRowId={(r) => r.id} features={{ rowSelection: false }} />,
    );

    const qty = cellOf("9"); // Bravo row, middle column
    qty.focus();
    fireEvent.keyDown(qty, { key: "End" });
    expect(document.activeElement).toBe(cellOf("$200"));

    fireEvent.keyDown(cellOf("$200"), { key: "Home" });
    expect(document.activeElement).toBe(cellOf("Bravo"));

    fireEvent.keyDown(cellOf("Bravo"), { key: "End", ctrlKey: true });
    expect(document.activeElement).toBe(cellOf("$300")); // last row, last column

    fireEvent.keyDown(cellOf("$300"), { key: "Home", ctrlKey: true });
    expect(document.activeElement).toBe(cellOf("Alpha")); // first row, first column
  });

  it("triggers the row action with Enter on the focused cell", () => {
    const onRowClick = vi.fn();
    render(
      <DataGrid data={data} columns={columns} getRowId={(r) => r.id} onRowClick={onRowClick} features={{ rowSelection: false }} />,
    );

    const cell = cellOf("Bravo");
    cell.focus();
    fireEvent.keyDown(cell, { key: "Enter" });
    expect(onRowClick).toHaveBeenCalledWith(expect.objectContaining({ name: "Bravo" }));
  });

  it("toggles row selection with Space (not the row action)", () => {
    render(<DataGrid data={data} columns={columns} getRowId={(r) => r.id} />);

    const cell = cellOf("Alpha");
    cell.focus();
    expect(screen.getByLabelText("Select 1")).not.toBeChecked();
    fireEvent.keyDown(cell, { key: " " });
    expect(screen.getByLabelText("Select 1")).toBeChecked();
  });

  it("exposes ARIA grid position attributes", () => {
    render(
      <DataGrid data={data} columns={columns} getRowId={(r) => r.id} features={{ rowSelection: false }} />,
    );

    const table = screen.getByRole("table");
    expect(table).toHaveAttribute("aria-colcount", "3");
    expect(table).toHaveAttribute("aria-rowcount", "4"); // 1 header row + 3 data rows

    // First body row is rowindex 2 (after the single header row).
    expect(cellOf("Alpha").closest("tr")).toHaveAttribute("aria-rowindex", "2");
    expect(cellOf("Alpha")).toHaveAttribute("aria-colindex", "1");
    expect(cellOf("5")).toHaveAttribute("aria-colindex", "2");
  });
});
