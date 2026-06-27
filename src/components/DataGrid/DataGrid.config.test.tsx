import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataGrid } from "./DataGrid";
import type { GridColumnConfig } from "../../types/grid";

type Row = { id: string; name: string; revenue: number; status: string };

const data: Row[] = [
  { id: "1", name: "Acme", revenue: 900, status: "active" },
  { id: "2", name: "Globex", revenue: 1500, status: "churned" },
];

const columns: GridColumnConfig<Row>[] = [
  { accessorKey: "name", header: "Name", dataType: "text" },
  {
    accessorKey: "revenue",
    header: "Revenue",
    dataType: "currency",
    conditionalFormats: [{ when: (value) => Number(value) < 1000, className: "text-rose-600" }],
  },
  {
    accessorKey: "status",
    header: "Status",
    dataType: "status",
    statusStyles: { active: "text-emerald-700", churned: "text-rose-700" },
  },
];

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("DataGrid internationalization", () => {
  it("formats currency using the provided locale and currency", () => {
    render(<DataGrid data={data} columns={columns} getRowId={(r) => r.id} locale="de-DE" currency="EUR" />);
    expect(screen.getByText((t) => t.includes("1.500"))).toBeInTheDocument();
    expect(screen.queryByText((t) => t.includes("$1,500"))).not.toBeInTheDocument();
  });
});

describe("DataGrid declarative formatting", () => {
  it("applies declarative statusStyles to status pills", () => {
    render(<DataGrid data={data} columns={columns} getRowId={(r) => r.id} />);
    expect(screen.getByText("Active")).toHaveClass("text-emerald-700");
    expect(screen.getByText("Churned")).toHaveClass("text-rose-700");
  });

  it("applies declarative conditionalFormats to cells", () => {
    render(<DataGrid data={data} columns={columns} getRowId={(r) => r.id} />);
    const lowCell = screen.getByText("$900").closest("td") as HTMLElement;
    const highCell = screen.getByText("$1,500").closest("td") as HTMLElement;
    expect(lowCell).toHaveClass("text-rose-600");
    expect(highCell).not.toHaveClass("text-rose-600");
  });
});

describe("DataGrid feature flags", () => {
  it("can render a bare table with sorting and resizing but no analytical chrome", () => {
    render(
      <DataGrid
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        features={{
          toolbar: false,
          globalSearch: false,
          sorting: true,
          columnResizing: true,
          columnVisibility: false,
          columnOrdering: false,
          columnPinning: false,
          savedViews: false,
          pagination: false,
          rowSelection: false,
          detailPanel: false,
          summaries: false,
          grouping: false,
        }}
      />,
    );

    expect(screen.queryByLabelText("Search")).not.toBeInTheDocument();
    expect(screen.queryByText("Reset view")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Select all visible rows")).not.toBeInTheDocument();
    expect(screen.queryByText(/Page 1 of/)).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Name/ })).toHaveAttribute(
      "aria-sort",
      "none",
    );
    expect(screen.getByRole("button", { name: "Resize Name" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Name" }));
    expect(screen.getByRole("columnheader", { name: /Name/ })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
  });

  it("can disable header sorting independently from column resizing", () => {
    render(
      <DataGrid
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        features={{
          toolbar: false,
          globalSearch: false,
          sorting: false,
          columnResizing: true,
          columnVisibility: false,
          columnOrdering: false,
          columnPinning: false,
          savedViews: false,
          pagination: false,
          rowSelection: false,
          detailPanel: false,
          summaries: false,
          grouping: false,
        }}
      />,
    );

    expect(screen.getByRole("columnheader", { name: "Name" })).not.toHaveAttribute("aria-sort");
    expect(screen.queryByRole("button", { name: "Name" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resize Name" })).toBeInTheDocument();
  });
});

describe("DataGrid row actions", () => {
  it("renders a generic actions column and invokes the selected action with row context", () => {
    const onApprove = vi.fn();

    render(
      <DataGrid
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        features={{ rowSelection: false, pagination: false }}
        rowActions={[
          {
            id: "approve",
            label: "Approve",
            onSelect: onApprove,
          },
        ]}
      />,
    );

    expect(screen.getByRole("columnheader", { name: "Actions" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open actions for 1" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Approve" }));

    expect(onApprove).toHaveBeenCalledWith(
      data[0],
      expect.objectContaining({ row: data[0], rowId: "1", closeMenu: expect.any(Function) }),
    );
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("supports hidden and disabled row actions per row", () => {
    const onHidden = vi.fn();
    const onDisabled = vi.fn();

    render(
      <DataGrid
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        features={{ rowSelection: false, pagination: false }}
        rowActions={(row) => [
          {
            id: "hidden-for-active",
            label: "Hidden active action",
            hidden: row.status === "active",
            onSelect: onHidden,
          },
          {
            id: "disabled-for-churned",
            label: "Disabled churned action",
            disabled: row.status === "churned",
            onSelect: onDisabled,
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open actions for 1" }));
    expect(screen.queryByRole("menuitem", { name: "Hidden active action" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Disabled churned action" }));
    expect(onDisabled).toHaveBeenCalledWith(
      data[0],
      expect.objectContaining({ rowId: "1" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Open actions for 2" }));
    const disabledAction = screen.getByRole("menuitem", { name: "Disabled churned action" });
    expect(disabledAction).toBeDisabled();
    fireEvent.click(disabledAction);
    expect(onHidden).not.toHaveBeenCalled();
    expect(onDisabled).toHaveBeenCalledTimes(1);
  });

  it("keeps action clicks from triggering row click behavior", () => {
    const onRowClick = vi.fn();
    const onAction = vi.fn();

    render(
      <DataGrid
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        onRowClick={onRowClick}
        features={{ rowSelection: false, pagination: false }}
        rowActions={[
          {
            id: "inspect",
            label: "Inspect",
            onSelect: onAction,
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open actions for 1" }));
    expect(onRowClick).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("menuitem", { name: "Inspect" }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("can disable the row actions column through feature flags", () => {
    render(
      <DataGrid
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        features={{ rowSelection: false, pagination: false, rowActions: false }}
        rowActions={[
          {
            id: "approve",
            label: "Approve",
            onSelect: vi.fn(),
          },
        ]}
      />,
    );

    expect(screen.queryByRole("columnheader", { name: "Actions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Open actions for/ })).not.toBeInTheDocument();
  });
});

describe("DataGrid density", () => {
  it("uses standard density by default and exposes compact density", () => {
    const { rerender } = render(
      <DataGrid data={data} columns={columns} getRowId={(r) => r.id} features={{ rowSelection: false }} />,
    );

    const table = screen.getByRole("table");
    expect(table).toHaveAttribute("data-density", "standard");
    expect(screen.getByText("Acme").closest("td")).toHaveClass("px-3", "py-2");

    rerender(
      <DataGrid
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        density="compact"
        features={{ rowSelection: false }}
      />,
    );

    expect(screen.getByRole("table")).toHaveAttribute("data-density", "compact");
    expect(screen.getByText("Acme").closest("td")).toHaveClass("px-2", "py-1");
  });
});

describe("DataGrid header column menu", () => {
  it("sorts, clears sort, and hides a column", () => {
    render(
      <DataGrid
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        features={{ rowSelection: false, pagination: false }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Revenue column menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Sort descending/i }));

    expect(bodyRowNames()).toEqual(["Globex", "Acme"]);
    expect(screen.getByRole("columnheader", { name: /Revenue/ })).toHaveAttribute(
      "aria-sort",
      "descending",
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Revenue column menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Clear sort" }));
    expect(screen.getByRole("columnheader", { name: /Revenue/ })).toHaveAttribute(
      "aria-sort",
      "none",
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Status column menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Hide column" }));
    expect(screen.queryByRole("columnheader", { name: /Status/ })).not.toBeInTheDocument();
  });

  it("clears a column filter from the header menu", () => {
    render(
      <DataGrid
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        filters={[{ accessorKey: "status", label: "Status" }]}
        features={{ rowSelection: false, pagination: false }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Status filter/i }));
    fireEvent.click(screen.getByRole("option", { name: "Active" }));
    expect(screen.queryByText("Globex")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open Status column menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Clear filter" }));

    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("Globex")).toBeInTheDocument();
  });

  it("pins columns and emits autosize, fit, and reset width changes", () => {
    const onColumnSizingChange = vi.fn();
    render(
      <DataGrid
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        state={{ columnSizing: { revenue: 320 } }}
        onColumnSizingChange={onColumnSizingChange}
        features={{ rowSelection: false, pagination: false }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Revenue column menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Pin left" }));
    expect(screen.getByRole("columnheader", { name: /Revenue/ })).toHaveStyle({
      position: "sticky",
    });

    fireEvent.click(screen.getByRole("button", { name: "Open Revenue column menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Unpin column" }));
    expect(screen.getByRole("columnheader", { name: /Revenue/ }).style.position).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Open Revenue column menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Autosize column" }));
    expect(onColumnSizingChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ revenue: expect.any(Number) }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Revenue column menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Fit visible columns" }));
    expect(onColumnSizingChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        name: expect.any(Number),
        revenue: expect.any(Number),
        status: expect.any(Number),
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Revenue column menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Reset width" }));
    expect(onColumnSizingChange).toHaveBeenLastCalledWith({});
  });
});

type DateRow = { id: string; name: string; when: string | number | Date };

const dateColumns: GridColumnConfig<DateRow>[] = [
  { accessorKey: "name", header: "Name", dataType: "text" },
  { accessorKey: "when", header: "Restocked", dataType: "date" },
];

const dateData: DateRow[] = [
  { id: "1", name: "Alpha", when: "2026-06-24" }, // ISO string -> Jun
  { id: "2", name: "Bravo", when: new Date(2026, 0, 10).getTime() }, // epoch ms -> Jan
  { id: "3", name: "Charlie", when: new Date(2026, 11, 31) }, // Date -> Dec
  { id: "4", name: "Delta", when: "" }, // blank
];

const bodyRowNames = () => {
  const table = screen.getByRole("table");
  const rows = within(table).getAllByRole("row");
  // Skip the header row; read each body row's first data cell (Name).
  return rows
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0]?.textContent ?? "")
    .filter((name) => name.length > 0);
};

describe("DataGrid date data type", () => {
  it("renders Intl-formatted dates across mixed representations and empty for blanks", () => {
    render(
      <DataGrid
        data={dateData}
        columns={dateColumns}
        getRowId={(r) => r.id}
        locale="en-US"
        features={{ rowSelection: false, pagination: false }}
      />,
    );

    expect(screen.getByText("Jun 24, 2026")).toBeInTheDocument();
    expect(screen.getByText("Jan 10, 2026")).toBeInTheDocument();
    expect(screen.getByText("Dec 31, 2026")).toBeInTheDocument();

    // The blank row renders an empty date cell (no stray text).
    const deltaRow = screen.getByText("Delta").closest("tr") as HTMLElement;
    const deltaCells = within(deltaRow).getAllByRole("cell");
    expect(deltaCells[1].textContent).toBe("");
  });

  it("sorts chronologically with blank dates last (ascending)", () => {
    render(
      <DataGrid
        data={dateData}
        columns={dateColumns}
        getRowId={(r) => r.id}
        locale="en-US"
        features={{ rowSelection: false, pagination: false }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Restocked" }));

    expect(bodyRowNames()).toEqual(["Bravo", "Alpha", "Charlie", "Delta"]);
  });

  it("matches formatted date text in global search", () => {
    render(
      <DataGrid
        data={dateData}
        columns={dateColumns}
        getRowId={(r) => r.id}
        locale="en-US"
        features={{ rowSelection: false, pagination: false }}
      />,
    );

    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "Jun 24" } });

    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.queryByText("Bravo")).not.toBeInTheDocument();
    expect(screen.queryByText("Charlie")).not.toBeInTheDocument();
  });
});

describe("DataGrid column pinning configuration", () => {
  it("pins columns from column config", () => {
    render(
      <DataGrid
        data={data}
        columns={[
          { accessorKey: "name", header: "Name", dataType: "text", pinned: "left" },
          { accessorKey: "revenue", header: "Revenue", dataType: "currency", pinned: "right" },
          { accessorKey: "status", header: "Status", dataType: "status" },
        ]}
        getRowId={(r) => r.id}
        features={{ rowSelection: false }}
      />,
    );

    expect(screen.getByRole("columnheader", { name: /Name/ })).toHaveStyle({
      position: "sticky",
      left: "0px",
    });
    expect(screen.getByRole("columnheader", { name: /Revenue/ })).toHaveStyle({
      position: "sticky",
      right: "0px",
    });
    expect(screen.getByText("Acme").closest("td")).toHaveStyle({
      position: "sticky",
      left: "0px",
    });
  });

  it("stacks pinned body cells below the sticky header so rows scroll underneath", () => {
    render(
      <DataGrid
        data={data}
        columns={[
          { accessorKey: "name", header: "Name", dataType: "text", pinned: "left" },
          { accessorKey: "revenue", header: "Revenue", dataType: "currency" },
          { accessorKey: "status", header: "Status", dataType: "status" },
        ]}
        getRowId={(r) => r.id}
        features={{ rowSelection: false }}
      />,
    );

    const bodyCell = screen.getByText("Acme").closest("td")!;
    const headerCell = screen.getByRole("columnheader", { name: /Name/ });
    const bodyZ = Number(bodyCell.style.zIndex);
    const headerZ = Number(headerCell.style.zIndex);

    // The <thead> is `sticky top-0 z-10`, so it establishes a stacking context
    // at root z-index 10. A pinned body cell sits in `tbody` (no stacking
    // context), so its z-index resolves against the same root: it MUST stay
    // below 10 or it paints over the header as the body scrolls.
    expect(bodyZ).toBeGreaterThan(0); // still above non-pinned (z-auto) body cells
    expect(bodyZ).toBeLessThan(10); // below the sticky header
    // Pinned header cells still outrank pinned body cells.
    expect(headerZ).toBeGreaterThan(bodyZ);
  });

  it("pins and unpins columns from the Columns menu", () => {
    render(
      <DataGrid
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        features={{ rowSelection: false }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /visible/ }));
    fireEvent.click(screen.getByRole("button", { name: "Pin Revenue left" }));

    expect(screen.getByRole("columnheader", { name: /Revenue/ })).toHaveStyle({
      position: "sticky",
    });

    fireEvent.click(screen.getByRole("button", { name: "Unpin Revenue" }));
    expect(screen.getByRole("columnheader", { name: /Revenue/ }).style.position).toBe("");
  });
});
