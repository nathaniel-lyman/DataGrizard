import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
