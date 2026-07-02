import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataGrid } from "./DataGrid";
import type { GridColumnConfig } from "../../types/grid";

type FillRow = { id: string; name: string; qty: number; price: number; locked?: boolean };

const makeFillData = (): FillRow[] => [
  { id: "1", name: "Alpha", qty: 5, price: 100 },
  { id: "2", name: "Bravo", qty: 9, price: 200, locked: true },
  { id: "3", name: "Charlie", qty: 3, price: 300 },
  { id: "4", name: "Delta", qty: 7, price: 400 },
];

const fillColumns: GridColumnConfig<FillRow>[] = [
  { accessorKey: "name", header: "Name", dataType: "text", editable: (row) => !row.locked },
  {
    accessorKey: "qty",
    header: "Qty",
    dataType: "number",
    editable: true,
    validate: (value) => (Number(value) < 0 ? "Must be positive" : null),
  },
  { accessorKey: "price", header: "Price", dataType: "currency", editable: true },
];

const cellOf = (text: string) => screen.getByText(text).closest("td") as HTMLElement;

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("DataGrid fill handle rendering", () => {
  it("renders the fill handle at the focused cell by default", () => {
    render(
      <DataGrid
        data={makeFillData()}
        columns={fillColumns}
        getRowId={(r) => r.id}
        features={{ rowSelection: false }}
      />,
    );
    expect(cellOf("Alpha").querySelector("[data-fill-handle]")).not.toBeNull();
  });

  it("does not render the fill handle when features.fillHandle is false", () => {
    render(
      <DataGrid
        data={makeFillData()}
        columns={fillColumns}
        getRowId={(r) => r.id}
        features={{ rowSelection: false, fillHandle: false }}
      />,
    );
    expect(cellOf("Alpha").querySelector("[data-fill-handle]")).toBeNull();
  });

  it("does not render the fill handle when features.cellSelection is false", () => {
    render(
      <DataGrid
        data={makeFillData()}
        columns={fillColumns}
        getRowId={(r) => r.id}
        features={{ rowSelection: false, cellSelection: false }}
      />,
    );
    expect(cellOf("Alpha").querySelector("[data-fill-handle]")).toBeNull();
  });

  it("moves the fill handle to the bottom-right corner of an active range selection", () => {
    render(
      <DataGrid
        data={makeFillData()}
        columns={fillColumns}
        getRowId={(r) => r.id}
        features={{ rowSelection: false }}
      />,
    );
    const start = cellOf("Alpha");
    fireEvent.mouseDown(start, { button: 0, buttons: 1 });
    fireEvent.mouseEnter(cellOf("9"), { buttons: 1 }); // Bravo's qty cell -> rows 1-2, columns name-qty
    fireEvent.mouseUp(document);

    expect(start.querySelector("[data-fill-handle]")).toBeNull();
    expect(cellOf("9").querySelector("[data-fill-handle]")).not.toBeNull();
  });
});

describe("DataGrid fill handle drag-to-extend", () => {
  it("drags the fill handle down 3 rows and replicates the source value", () => {
    const onCellEdit = vi.fn();
    render(
      <DataGrid
        data={makeFillData()}
        columns={fillColumns}
        getRowId={(r) => r.id}
        onCellEdit={onCellEdit}
        features={{ rowSelection: false }}
      />,
    );
    const source = cellOf("$100"); // row1 price
    fireEvent.mouseDown(source, { button: 0, buttons: 1 });
    fireEvent.mouseUp(document);

    const handle = source.querySelector("[data-fill-handle]") as HTMLElement;
    fireEvent.mouseDown(handle, { button: 0, buttons: 1 });
    fireEvent.mouseEnter(cellOf("$400"), { buttons: 1 }); // row4 price
    fireEvent.mouseUp(document);

    expect(onCellEdit).toHaveBeenCalledTimes(3);
    expect(onCellEdit).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ rowId: "2", columnId: "price", value: 100, previousValue: 200 }),
    );
    expect(onCellEdit).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ rowId: "3", columnId: "price", value: 100, previousValue: 300 }),
    );
    expect(onCellEdit).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ rowId: "4", columnId: "price", value: 100, previousValue: 400 }),
    );
    expect(source).toHaveAttribute("data-cell-selected", "true");
    expect(cellOf("$400")).toHaveAttribute("data-cell-selected", "true");
  });

  it("tiles a 2-row source's pattern when dragged down to 4 rows", () => {
    const onCellEdit = vi.fn();
    render(
      <DataGrid
        data={makeFillData()}
        columns={fillColumns}
        getRowId={(r) => r.id}
        onCellEdit={onCellEdit}
        features={{ rowSelection: false }}
      />,
    );
    const start = cellOf("5"); // row1 qty
    fireEvent.mouseDown(start, { button: 0, buttons: 1 });
    fireEvent.mouseEnter(cellOf("9"), { buttons: 1 }); // row2 qty -> selects rows 1-2
    fireEvent.mouseUp(document);

    const handle = cellOf("9").querySelector("[data-fill-handle]") as HTMLElement;
    fireEvent.mouseDown(handle, { button: 0, buttons: 1 });
    fireEvent.mouseEnter(cellOf("7"), { buttons: 1 }); // row4 qty -> extend to rows 1-4
    fireEvent.mouseUp(document);

    expect(onCellEdit).toHaveBeenCalledTimes(2);
    expect(onCellEdit).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ rowId: "3", columnId: "qty", value: 5, previousValue: 3 }),
    );
    expect(onCellEdit).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ rowId: "4", columnId: "qty", value: 9, previousValue: 7 }),
    );
  });

  it("drags the fill handle right across 2 columns and replicates the source value", () => {
    const onCellEdit = vi.fn();
    render(
      <DataGrid
        data={makeFillData()}
        columns={fillColumns}
        getRowId={(r) => r.id}
        onCellEdit={onCellEdit}
        features={{ rowSelection: false }}
      />,
    );
    const source = cellOf("Alpha");
    fireEvent.mouseDown(source, { button: 0, buttons: 1 });
    fireEvent.mouseUp(document);

    const handle = source.querySelector("[data-fill-handle]") as HTMLElement;
    fireEvent.mouseDown(handle, { button: 0, buttons: 1 });
    fireEvent.mouseEnter(cellOf("$100"), { buttons: 1 }); // row1 price -> extend name..price
    fireEvent.mouseUp(document);

    expect(onCellEdit).toHaveBeenCalledTimes(2);
    expect(onCellEdit).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ rowId: "1", columnId: "qty", value: "Alpha" }),
    );
    expect(onCellEdit).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ rowId: "1", columnId: "price", value: "Alpha" }),
    );
  });

  it("skips a non-editable target cell while sibling cells in the same fill still commit", () => {
    const onCellEdit = vi.fn();
    render(
      <DataGrid
        data={makeFillData()}
        columns={fillColumns}
        getRowId={(r) => r.id}
        onCellEdit={onCellEdit}
        features={{ rowSelection: false }}
      />,
    );
    const source = cellOf("Alpha"); // row1 name
    fireEvent.mouseDown(source, { button: 0, buttons: 1 });
    fireEvent.mouseUp(document);

    const handle = source.querySelector("[data-fill-handle]") as HTMLElement;
    fireEvent.mouseDown(handle, { button: 0, buttons: 1 });
    fireEvent.mouseEnter(cellOf("Delta"), { buttons: 1 }); // row4 name -> rows 1-4 (row2 is locked)
    fireEvent.mouseUp(document);

    expect(onCellEdit).toHaveBeenCalledTimes(2);
    expect(onCellEdit).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ rowId: "3", columnId: "name", value: "Alpha" }),
    );
    expect(onCellEdit).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ rowId: "4", columnId: "name", value: "Alpha" }),
    );
  });

  it("skips a target cell that fails computeEditError", () => {
    const onCellEdit = vi.fn();
    const data: FillRow[] = [
      { id: "1", name: "Alpha", qty: -1, price: 100 },
      { id: "2", name: "Bravo", qty: 9, price: 200 },
    ];
    render(
      <DataGrid
        data={data}
        columns={fillColumns}
        getRowId={(r) => r.id}
        onCellEdit={onCellEdit}
        features={{ rowSelection: false }}
      />,
    );
    const source = cellOf("Alpha").closest("tr")!.querySelectorAll("td")[1] as HTMLElement; // row1 qty (-1)
    fireEvent.mouseDown(source, { button: 0, buttons: 1 });
    fireEvent.mouseUp(document);

    const handle = source.querySelector("[data-fill-handle]") as HTMLElement;
    fireEvent.mouseDown(handle, { button: 0, buttons: 1 });
    const target = cellOf("Bravo").closest("tr")!.querySelectorAll("td")[1] as HTMLElement; // row2 qty
    fireEvent.mouseEnter(target, { buttons: 1 });
    fireEvent.mouseUp(document);

    expect(onCellEdit).not.toHaveBeenCalled();
  });
});
