import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DataGrid } from "./DataGrid";
import type { GridColumnConfig } from "../../types/grid";

type Row = { id: string; dept: string; product: string; revenue: number };

const rows: Row[] = [
  { id: "1", dept: "Grocery", product: "Almond Butter", revenue: 1200 },
  { id: "2", dept: "Home", product: "Shelf Bin", revenue: 700 },
];

const LONG_HEADER = "Product Name With A Very Long Descriptive Label";

const columns: GridColumnConfig<Row>[] = [
  { accessorKey: "dept", header: "Dept", dataType: "text", width: 120 },
  { accessorKey: "product", header: LONG_HEADER, dataType: "text", width: 240 },
  { accessorKey: "revenue", header: "Revenue", dataType: "currency", width: 130 },
];

const renderGrid = (props: Partial<Parameters<typeof DataGrid<Row>>[0]> = {}) =>
  render(
    <DataGrid
      data={rows}
      columns={columns}
      getRowId={(r) => r.id}
      features={{ rowSelection: false, pagination: false, rowActions: false }}
      {...props}
    />,
  );

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("DataGrid header layout", () => {
  it("uses fixed table layout with a col element per visible leaf column", () => {
    renderGrid();

    const table = screen.getByRole("table");
    expect(table).toHaveClass("table-fixed");

    const cols = table.querySelectorAll("colgroup col");
    expect(cols).toHaveLength(3);
    expect((cols[0] as HTMLElement).style.width).toBe("120px");
    expect((cols[1] as HTMLElement).style.width).toBe("240px");
    expect((cols[2] as HTMLElement).style.width).toBe("130px");
  });

  it("keeps one col per leaf column when banded column groups are present", () => {
    renderGrid({
      columnGroups: [
        { groupId: "catalog", header: "Catalog", children: ["dept", "product"] },
      ],
    });

    const table = screen.getByRole("table");
    expect(table.querySelectorAll("colgroup col")).toHaveLength(3);
  });

  it("exposes the full column name as a title on sortable header labels", () => {
    renderGrid();

    const headerButton = screen.getByRole("button", { name: LONG_HEADER });
    const label = headerButton.querySelector("span[title]");
    expect(label).not.toBeNull();
    expect(label).toHaveAttribute("title", LONG_HEADER);
    expect(label).toHaveClass("truncate");
  });

  it("ellipsizes non-sortable header labels via a truncating child span", () => {
    renderGrid({ features: { rowSelection: false, pagination: false, sorting: false } });

    const header = screen.getByRole("columnheader", { name: LONG_HEADER });
    const label = header.querySelector("span[title]");
    expect(label).not.toBeNull();
    expect(label).toHaveAttribute("title", LONG_HEADER);
    expect(label).toHaveClass("truncate");
    // The span must not itself be a flex container — text-overflow does not
    // apply to flex containers, which silently disables the ellipsis.
    expect(label).not.toHaveClass("flex");
  });

  it("headerWrap line-clamps labels and top-aligns the header tools", () => {
    renderGrid({ headerWrap: true });

    const headerButton = screen.getByRole("button", { name: LONG_HEADER });
    const label = headerButton.querySelector("span[title]");
    expect(label).toHaveClass("line-clamp-2");
    expect(label).not.toHaveClass("truncate");

    const headerCell = screen.getByRole("columnheader", { name: new RegExp(LONG_HEADER) });
    const toolsRow = headerCell.querySelector(":scope > div");
    expect(toolsRow).toHaveClass("items-start");
    expect(toolsRow).not.toHaveClass("items-center");

    // Cells default to vertical-align middle, which re-centers single-line
    // headers against taller wrapped neighbors and misaligns the tools —
    // wrapped headers must top-align every cell in the row.
    for (const cell of screen.getAllByRole("columnheader")) {
      expect(cell).toHaveClass("align-top");
    }
  });

  it("defaults headerWrap off, centering the header tools", () => {
    renderGrid();

    const headerCell = screen.getByRole("columnheader", { name: new RegExp(LONG_HEADER) });
    const toolsRow = headerCell.querySelector(":scope > div");
    expect(toolsRow).toHaveClass("items-center");
  });
});
