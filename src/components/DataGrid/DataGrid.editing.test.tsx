import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataGrid } from "./DataGrid";
import type { GridColumnConfig } from "../../types/grid";

type Row = { id: string; name: string; qty: number; price: number; status: string };

const makeData = (): Row[] => [
  { id: "1", name: "Alpha", qty: 5, price: 100, status: "active" },
  { id: "2", name: "Bravo", qty: 9, price: 200, status: "churned" },
];

const columns: GridColumnConfig<Row>[] = [
  { accessorKey: "name", header: "Name", dataType: "text", editable: true },
  {
    accessorKey: "qty",
    header: "Qty",
    dataType: "number",
    editable: true,
    validate: (value) => (Number(value) < 0 ? "Must be positive" : null),
  },
  { accessorKey: "price", header: "Price", dataType: "currency", editable: true },
  {
    accessorKey: "status",
    header: "Status",
    dataType: "status",
    editable: true,
    statusStyles: { active: "text-emerald-700", churned: "text-rose-700" },
  },
];

const cellOf = (text: string) => screen.getByText(text).closest("td") as HTMLElement;

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("DataGrid cell editing", () => {
  it("enters edit on double-click and commits via Enter without mutating data", () => {
    const onCellEdit = vi.fn();
    const data = makeData();
    render(
      <DataGrid data={data} columns={columns} getRowId={(r) => r.id} onCellEdit={onCellEdit} features={{ rowSelection: false }} />,
    );

    fireEvent.doubleClick(cellOf("Alpha"));
    const input = screen.getByDisplayValue("Alpha");
    fireEvent.change(input, { target: { value: "Alphabet" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onCellEdit).toHaveBeenCalledWith(
      expect.objectContaining({ rowId: "1", columnId: "name", value: "Alphabet", previousValue: "Alpha" }),
    );
    // The grid never mutates the data prop.
    expect(data[0].name).toBe("Alpha");
  });

  it("does not edit non-editable cells or when editing is disabled", () => {
    const onCellEdit = vi.fn();
    render(
      <DataGrid
        data={makeData()}
        columns={[{ accessorKey: "name", header: "Name", dataType: "text" }, ...columns.slice(1)]}
        getRowId={(r) => r.id}
        onCellEdit={onCellEdit}
        features={{ rowSelection: false }}
      />,
    );
    fireEvent.doubleClick(cellOf("Alpha")); // name is no longer editable here
    expect(screen.queryByDisplayValue("Alpha")).not.toBeInTheDocument();

    cleanup();
    render(
      <DataGrid data={makeData()} columns={columns} getRowId={(r) => r.id} features={{ rowSelection: false, editing: false }} />,
    );
    fireEvent.doubleClick(cellOf("Alpha"));
    expect(screen.queryByDisplayValue("Alpha")).not.toBeInTheDocument();
  });

  it("enters edit via Enter/F2 on a focused cell and cancels via Escape", () => {
    const onCellEdit = vi.fn();
    render(
      <DataGrid data={makeData()} columns={columns} getRowId={(r) => r.id} onCellEdit={onCellEdit} features={{ rowSelection: false }} />,
    );

    const cell = cellOf("Alpha");
    cell.focus();
    fireEvent.keyDown(cell, { key: "Enter" });
    const input = screen.getByDisplayValue("Alpha");
    fireEvent.change(input, { target: { value: "Zeta" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(onCellEdit).not.toHaveBeenCalled();
    expect(screen.queryByDisplayValue("Zeta")).not.toBeInTheDocument();
  });

  it("renders a number editor and rejects NaN with the built-in guard", () => {
    const onCellEdit = vi.fn();
    render(
      <DataGrid data={makeData()} columns={columns} getRowId={(r) => r.id} onCellEdit={onCellEdit} features={{ rowSelection: false }} />,
    );

    fireEvent.doubleClick(cellOf("$100"));
    const input = screen.getByDisplayValue("100");
    expect(input).toHaveAttribute("type", "number");
    // Clearing a numeric cell parses to NaN, which the built-in guard rejects.
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onCellEdit).not.toHaveBeenCalled();
    expect(screen.getByRole("spinbutton")).toBeInTheDocument(); // still editing
  });

  it("blocks commit on validation error and Tab does not advance while invalid", () => {
    const onCellEdit = vi.fn();
    render(
      <DataGrid data={makeData()} columns={columns} getRowId={(r) => r.id} onCellEdit={onCellEdit} features={{ rowSelection: false }} />,
    );

    fireEvent.doubleClick(cellOf("5"));
    const input = screen.getByDisplayValue("5");
    fireEvent.change(input, { target: { value: "-3" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCellEdit).not.toHaveBeenCalled();

    // Tab on an invalid value also stays in edit mode (validation wins).
    fireEvent.keyDown(screen.getByDisplayValue("-3"), { key: "Tab" });
    expect(onCellEdit).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("-3")).toBeInTheDocument();
  });

  it("renders a status select editor over statusStyles keys", () => {
    const onCellEdit = vi.fn();
    render(
      <DataGrid data={makeData()} columns={columns} getRowId={(r) => r.id} onCellEdit={onCellEdit} features={{ rowSelection: false }} />,
    );

    const statusCell = cellOf("Active");
    fireEvent.doubleClick(statusCell);
    const select = within(statusCell).getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("active");
    fireEvent.change(select, { target: { value: "churned" } });
    fireEvent.keyDown(select, { key: "Enter" });

    expect(onCellEdit).toHaveBeenCalledWith(
      expect.objectContaining({ columnId: "status", value: "churned", previousValue: "active" }),
    );
  });

  it("supports a custom renderEditCell editor", () => {
    const onCellEdit = vi.fn();
    const customColumns: GridColumnConfig<Row>[] = [
      {
        accessorKey: "name",
        header: "Name",
        dataType: "text",
        editable: true,
        renderEditCell: ({ value, onChange, commit }) => (
          <input
            data-testid="custom-editor"
            value={String(value ?? "")}
            onChange={(event) => onChange(event.target.value)}
            onBlur={commit}
          />
        ),
      },
      ...columns.slice(1),
    ];
    render(
      <DataGrid data={makeData()} columns={customColumns} getRowId={(r) => r.id} onCellEdit={onCellEdit} features={{ rowSelection: false }} />,
    );

    fireEvent.doubleClick(cellOf("Alpha"));
    const custom = screen.getByTestId("custom-editor");
    fireEvent.change(custom, { target: { value: "Custom" } });
    fireEvent.blur(custom);

    expect(onCellEdit).toHaveBeenCalledWith(expect.objectContaining({ value: "Custom" }));
  });

  it("cancelling an edit with Escape does not close an open detail panel", () => {
    render(
      <DataGrid
        data={makeData()}
        columns={columns}
        getRowId={(r) => r.id}
        features={{ rowSelection: false }}
        renderDetailPanel={(row) => (row ? <div>Detail {row.name}</div> : null)}
      />,
    );

    // Single click opens the detail panel for Alpha's row.
    fireEvent.click(cellOf("Bravo")); // Bravo row, name cell
    expect(screen.getByText("Detail Bravo")).toBeInTheDocument();

    // Double-click a cell to edit, then Escape cancels the edit only.
    fireEvent.doubleClick(cellOf("9"));
    const input = screen.getByDisplayValue("9");
    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByDisplayValue("9")).not.toBeInTheDocument(); // editor closed
    expect(screen.getByText("Detail Bravo")).toBeInTheDocument(); // panel stays open
  });
});
