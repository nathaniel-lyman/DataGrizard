import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataGrid } from "./DataGrid";
import type { GridColumnConfig, GridFilterConfig } from "../../types/grid";

type Row = { id: string; name: string; active: boolean };

const data: Row[] = [
  { id: "1", name: "Alpha", active: true },
  { id: "2", name: "Bravo", active: false },
  { id: "3", name: "Charlie", active: true },
];

const columns: GridColumnConfig<Row>[] = [
  { accessorKey: "name", header: "Name", dataType: "text" },
  { accessorKey: "active", header: "Active", dataType: "boolean", editable: true },
];

const bodyRowNames = () =>
  within(screen.getByRole("table"))
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0]?.textContent ?? "")
    .filter(Boolean);

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("DataGrid boolean columns", () => {
  it("renders boolean values as readable labels", () => {
    render(
      <DataGrid data={data} columns={columns} getRowId={(row) => row.id} features={{ rowSelection: false }} />,
    );

    expect(screen.getAllByText("True")).toHaveLength(2);
    expect(screen.getByText("False")).toBeInTheDocument();
  });

  it("sorts false before true when ascending", () => {
    render(
      <DataGrid data={data} columns={columns} getRowId={(row) => row.id} features={{ rowSelection: false }} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Active" }));

    expect(bodyRowNames()).toEqual(["Bravo", "Alpha", "Charlie"]);
  });

  it("matches boolean labels in global search", () => {
    render(
      <DataGrid data={data} columns={columns} getRowId={(row) => row.id} features={{ rowSelection: false }} />,
    );

    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "false" } });

    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
    expect(screen.getByText("Bravo")).toBeInTheDocument();
    expect(screen.queryByText("Charlie")).not.toBeInTheDocument();
  });

  it("filters boolean columns through the header filter", () => {
    const filters: GridFilterConfig<Row>[] = [
      { accessorKey: "active", label: "Active", filterType: "boolean" },
    ];
    render(
      <DataGrid
        data={data}
        columns={columns}
        getRowId={(row) => row.id}
        filters={filters}
        features={{ rowSelection: false }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Active filter/i }));
    fireEvent.click(screen.getByRole("option", { name: "False" }));

    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
    expect(screen.getByText("Bravo")).toBeInTheDocument();
    expect(screen.queryByText("Charlie")).not.toBeInTheDocument();
  });

  it("edits boolean columns as booleans", () => {
    const onCellEdit = vi.fn();
    render(
      <DataGrid
        data={data}
        columns={columns}
        getRowId={(row) => row.id}
        onCellEdit={onCellEdit}
        features={{ rowSelection: false }}
      />,
    );

    const falseCell = screen.getByText("False").closest("td") as HTMLElement;
    fireEvent.doubleClick(falseCell);
    const editor = within(falseCell).getByRole("combobox") as HTMLSelectElement;
    expect(editor.value).toBe("false");
    fireEvent.change(editor, { target: { value: "true" } });
    fireEvent.keyDown(editor, { key: "Enter" });

    expect(onCellEdit).toHaveBeenCalledWith(
      expect.objectContaining({ rowId: "2", columnId: "active", value: true, previousValue: false }),
    );
  });
});
