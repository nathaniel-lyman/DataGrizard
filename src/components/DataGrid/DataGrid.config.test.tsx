import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
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
