import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

describe("DataGrid header tools on demand", () => {
  const getToolsCluster = (headerText: string) => {
    const cell = screen.getByRole("columnheader", { name: new RegExp(headerText) });
    const funnel = cell.querySelector('button[aria-label$=" filter"]');
    expect(funnel).not.toBeNull();
    return funnel!.closest("[data-header-tools]");
  };

  it("collapses the funnel/menu cluster when headerToolsOnDemand is on", () => {
    renderGrid({
      features: { rowSelection: false, pagination: false, headerToolsOnDemand: true },
    });

    const cluster = getToolsCluster("Dept");
    expect(cluster).not.toBeNull();
    expect(cluster).toHaveClass("w-0", "opacity-0", "pointer-events-none");
    // Reveal styles must exist so hover/focus/active/open can restore the cluster.
    expect(cluster!.className).toContain("group-hover/header:w-auto");
    expect(cluster!.className).toContain("focus-within:w-auto");
    expect(cluster!.className).toContain("has-[[data-active]]:w-auto");
    expect(cluster!.className).toContain("has-[[aria-expanded=true]]:w-auto");
    // Never display:none — the buttons must stay keyboard-reachable.
    expect(cluster).not.toHaveClass("hidden");
  });

  it("keeps the cluster expanded by default (flag off)", () => {
    renderGrid();

    const cluster = getToolsCluster("Dept");
    expect(cluster).not.toBeNull();
    expect(cluster).not.toHaveClass("w-0");
    expect(cluster).not.toHaveClass("opacity-0");
  });

  it("marks the header cell as the hover group", () => {
    renderGrid({
      features: { rowSelection: false, pagination: false, headerToolsOnDemand: true },
    });

    const cell = screen.getByRole("columnheader", { name: /Dept/ });
    expect(cell).toHaveClass("group/header");
  });
});

describe("DataGrid per-column sorting opt-out", () => {
  it("renders a non-sortable header for a column with enableSorting false", () => {
    const cols: GridColumnConfig<Row>[] = [
      { accessorKey: "dept", header: "Dept", dataType: "text", enableSorting: false },
      { accessorKey: "revenue", header: "Revenue", dataType: "currency" },
    ];
    render(
      <DataGrid
        data={rows}
        columns={cols}
        getRowId={(r) => r.id}
        features={{ rowSelection: false, pagination: false, rowActions: false }}
      />,
    );

    // No sort toggle button for the opted-out column…
    expect(screen.queryByRole("button", { name: "Dept" })).toBeNull();
    // …but the label still renders (non-sortable span path), with its tooltip.
    const header = screen.getByRole("columnheader", { name: "Dept" });
    expect(header.querySelector("span[title='Dept']")).not.toBeNull();
    // Other columns keep sorting.
    expect(screen.getByRole("button", { name: "Revenue" })).toBeInTheDocument();
    // And the opted-out header carries no aria-sort.
    expect(header).not.toHaveAttribute("aria-sort");
  });
});

describe("DataGrid header menu placement", () => {
  it("menu opens down by default with a scroll clamp guard", () => {
    renderGrid();
    fireEvent.click(screen.getByRole("button", { name: "Open Dept column menu" }));
    const menu = screen.getByRole("menu");
    expect(menu).toHaveClass("top-full");
    expect(menu).toHaveClass("overflow-auto");
    expect(menu).not.toHaveClass("bottom-full");
  });
});
