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

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("DataGrid grid layout smoke", () => {
  it("renders headers, leaf rows, the select column, and the pagination footer", () => {
    render(<DataGrid data={rows} columns={columns} getRowId={(r) => r.id} />);

    expect(screen.getByRole("columnheader", { name: /Product/ })).toBeInTheDocument();
    expect(screen.getByText("Almond Butter")).toBeInTheDocument();
    expect(screen.getByLabelText("Select all visible rows")).toBeInTheDocument();
    expect(screen.getByText(/Page 1 of 1/)).toBeInTheDocument();
  });
});

describe("DataGrid controlled/uncontrolled triad", () => {
  it("controlled sorting emits but does not mutate internally until props change", () => {
    const onSortingChange = vi.fn();
    const { rerender } = render(
      <DataGrid
        data={rows}
        columns={columns}
        getRowId={(r) => r.id}
        state={{ sorting: [] }}
        onSortingChange={onSortingChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Product" }));

    expect(onSortingChange).toHaveBeenCalledTimes(1);
    // Controlled + parent has not applied the new state → grid stays unsorted.
    expect(screen.getByRole("columnheader", { name: /Product/ })).toHaveAttribute(
      "aria-sort",
      "none",
    );

    rerender(
      <DataGrid
        data={rows}
        columns={columns}
        getRowId={(r) => r.id}
        state={{ sorting: [{ id: "product", desc: false }] }}
        onSortingChange={onSortingChange}
      />,
    );
    expect(screen.getByRole("columnheader", { name: /Product/ })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
  });

  it("uncontrolled sorting mutates internally", () => {
    render(<DataGrid data={rows} columns={columns} getRowId={(r) => r.id} />);

    fireEvent.click(screen.getByRole("button", { name: "Product" }));

    expect(screen.getByRole("columnheader", { name: /Product/ })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
  });

  it("controlled column pinning emits but does not mutate internally until props change", () => {
    const onColumnPinningChange = vi.fn();
    const { rerender } = render(
      <DataGrid
        data={rows}
        columns={columns}
        getRowId={(r) => r.id}
        features={{ rowSelection: false }}
        state={{ columnPinning: { left: [], right: [] } }}
        onColumnPinningChange={onColumnPinningChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /visible/ }));
    fireEvent.click(screen.getByRole("button", { name: "Pin Product left" }));

    expect(onColumnPinningChange).toHaveBeenCalledWith({ left: ["product"], right: [] });
    expect(screen.getByRole("columnheader", { name: /Product/ }).style.position).toBe("");

    rerender(
      <DataGrid
        data={rows}
        columns={columns}
        getRowId={(r) => r.id}
        features={{ rowSelection: false }}
        state={{ columnPinning: { left: ["product"], right: [] } }}
        onColumnPinningChange={onColumnPinningChange}
      />,
    );
    expect(screen.getByRole("columnheader", { name: /Product/ })).toHaveStyle({
      position: "sticky",
    });
  });
});

describe("DataGrid scoped localStorage persistence", () => {
  it("writes only scoped keys and never an unscoped key", () => {
    render(<DataGrid data={rows} columns={columns} getRowId={(r) => r.id} storageKey="grid-A" />);

    fireEvent.change(screen.getByLabelText("View name"), { target: { value: "My view" } });
    fireEvent.click(screen.getByRole("button", { name: "Save view" }));

    expect(window.localStorage.getItem("grid-A.savedViews")).toContain("My view");
    expect(window.localStorage.getItem("savedViews")).toBeNull();
  });

  it("persists column pinning under the scoped key", () => {
    render(
      <DataGrid
        data={rows}
        columns={columns}
        getRowId={(r) => r.id}
        storageKey="grid-A"
        features={{ rowSelection: false }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /visible/ }));
    fireEvent.click(screen.getByRole("button", { name: "Pin Product left" }));

    expect(window.localStorage.getItem("grid-A.columnPinning")).toBe(
      JSON.stringify({ left: ["product"], right: [] }),
    );
    expect(window.localStorage.getItem("columnPinning")).toBeNull();
  });

  it("rehydrates saved views on remount from the scoped key", () => {
    const { unmount } = render(
      <DataGrid data={rows} columns={columns} getRowId={(r) => r.id} storageKey="grid-A" />,
    );
    fireEvent.change(screen.getByLabelText("View name"), { target: { value: "My view" } });
    fireEvent.click(screen.getByRole("button", { name: "Save view" }));
    unmount();

    render(<DataGrid data={rows} columns={columns} getRowId={(r) => r.id} storageKey="grid-A" />);
    expect(screen.getByRole("option", { name: "My view" })).toBeInTheDocument();
  });

  it("does not collide across two grids with different storage keys", () => {
    const { unmount } = render(
      <DataGrid data={rows} columns={columns} getRowId={(r) => r.id} storageKey="grid-1" />,
    );
    fireEvent.change(screen.getByLabelText("View name"), { target: { value: "V1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save view" }));
    unmount();

    expect(window.localStorage.getItem("grid-1.savedViews")).toContain("V1");
    expect(window.localStorage.getItem("grid-2.savedViews")).toBeNull();
  });

  it("keeps firing callbacks when localStorage writes fail", () => {
    const onSavedViewsChange = vi.fn();
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });

    try {
      render(
        <DataGrid
          data={rows}
          columns={columns}
          getRowId={(r) => r.id}
          storageKey="quota-test"
          onSavedViewsChange={onSavedViewsChange}
        />,
      );

      fireEvent.change(screen.getByLabelText("View name"), { target: { value: "No storage" } });
      fireEvent.click(screen.getByRole("button", { name: "Save view" }));

      expect(onSavedViewsChange).toHaveBeenCalledWith(
        expect.objectContaining({ "No storage": expect.any(Object) }),
      );
    } finally {
      setItemSpy.mockRestore();
    }
  });
});
