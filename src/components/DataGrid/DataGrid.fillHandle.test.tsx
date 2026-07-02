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
