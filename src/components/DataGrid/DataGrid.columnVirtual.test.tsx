import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { DataGrid } from "./DataGrid";
import type { GridColumnConfig } from "../../types/grid";

type WideRow = Record<string, string | number> & { id: string };

const COL_COUNT = 40;
const wideColumns: GridColumnConfig<WideRow>[] = Array.from({ length: COL_COUNT }, (_, i) => ({
  accessorKey: `c${i}`,
  header: `Col ${i}`,
  dataType: "number" as const,
}));

const makeWideRows = (n: number): WideRow[] =>
  Array.from({ length: n }, (_, r) => {
    const row: WideRow = { id: String(r) };
    for (let c = 0; c < COL_COUNT; c++) row[`c${c}`] = r * COL_COUNT + c;
    return row;
  });

// jsdom does no layout, so every element reports offsetWidth 0 — the
// horizontal virtualizer (@tanstack/virtual-core measures via offsetWidth)
// then computes a genuinely empty viewport instead of a small overscan
// window. Stub a realistic viewport so the tests exercise real windowing
// instead of the degenerate all-zero case (mirrors no other DataGrid test
// file's approach because none needs a *horizontal* measurement to be non-zero).
let originalOffsetWidth: PropertyDescriptor | undefined;

beforeAll(() => {
  originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get() {
      return 800;
    },
  });
});

afterAll(() => {
  if (originalOffsetWidth) {
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", originalOffsetWidth);
  }
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("DataGrid column virtualization", () => {
  it("renders far fewer header cells than columns when virtualizeColumns is on", () => {
    render(
      <DataGrid
        data={makeWideRows(5)}
        columns={wideColumns}
        getRowId={(r) => r.id}
        virtualizeColumns
        features={{ pagination: false, rowSelection: false }}
      />,
    );
    const headers = screen.getAllByRole("columnheader");
    expect(headers.length).toBeLessThan(COL_COUNT);
    expect(screen.queryByText("Col 39")).not.toBeInTheDocument();
  });

  it("windows body cells to match and keeps colgroup spacer widths true", () => {
    render(
      <DataGrid
        data={makeWideRows(3)}
        columns={wideColumns}
        getRowId={(r) => r.id}
        virtualizeColumns
        features={{ pagination: false, rowSelection: false }}
      />,
    );
    const firstBodyRow = document.querySelector("tbody tr");
    const cells = firstBodyRow ? firstBodyRow.querySelectorAll("td") : [];
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.length).toBeLessThan(COL_COUNT);
    // colgroup: rendered cols + spacer cols; total col width must equal the
    // full table width (sum of every leaf column's size = 40 * default size).
    const cols = document.querySelectorAll("colgroup col");
    expect(cols.length).toBeGreaterThan(0);
    expect(cols.length).toBeLessThan(COL_COUNT);
    const widthOf = (el: Element) =>
      Number.parseFloat((el as HTMLElement).style.width || "0");
    const totalColWidth = [...cols].reduce((sum, c) => sum + widthOf(c), 0);
    // cols[0] is a real (non-spacer) column here only because nothing is
    // pinned and the scroll offset is 0 in this fixture — otherwise it could
    // be the left spacer <col>, which has a different width.
    const perColumn = widthOf(cols[0]);
    expect(totalColWidth).toBeCloseTo(perColumn * COL_COUNT, 0);
  });

  // Header windowing (Task 5) is what makes pinned-column *header* labels a
  // reliable signal — until then every header always renders. This checks
  // the part Task 4 owns: pinned columns' BODY cells always render while an
  // unpinned, off-window column's body cell does not. Row 0's values equal
  // its column index (r * COL_COUNT + c, r = 0), so text content pinpoints
  // the column.
  it("always renders pinned columns (body cells)", () => {
    render(
      <DataGrid
        data={makeWideRows(3)}
        columns={wideColumns}
        getRowId={(r) => r.id}
        virtualizeColumns
        defaultColumnPinning={{ left: ["c0"], right: ["c39"] }}
        features={{ pagination: false, rowSelection: false, columnPinning: true }}
      />,
    );
    const firstBodyRow = document.querySelector("tbody tr");
    expect(firstBodyRow).not.toBeNull();
    const rowScope = within(firstBodyRow as HTMLElement);
    expect(rowScope.getByText("0")).toBeInTheDocument(); // pinned left, c0
    expect(rowScope.getByText("39")).toBeInTheDocument(); // pinned right, c39
    // Center column beyond the window still unmounted in the body.
    expect(rowScope.queryByText("30")).not.toBeInTheDocument();
  });

  it("renders every column when virtualizeColumns is off (regression guard)", () => {
    render(
      <DataGrid
        data={makeWideRows(2)}
        columns={wideColumns}
        getRowId={(r) => r.id}
        features={{ pagination: false, rowSelection: false }}
      />,
    );
    expect(screen.getByText("Col 0")).toBeInTheDocument();
    expect(screen.getByText("Col 39")).toBeInTheDocument();
  });

  it("clips grouped-header band colSpan to rendered leaves", () => {
    render(
      <DataGrid
        data={makeWideRows(2)}
        columns={wideColumns}
        getRowId={(r) => r.id}
        virtualizeColumns
        columnGroups={[
          { groupId: "g-early", header: "Early", children: ["c0", "c1", "c2", "c3"] },
          { groupId: "g-late", header: "Late", children: ["c36", "c37", "c38", "c39"] },
        ]}
        features={{ pagination: false, rowSelection: false }}
      />,
    );
    // Early band renders, clipped to its rendered leaves (window starts at c0).
    const early = screen.getByText("Early").closest("th");
    expect(early).not.toBeNull();
    const colSpan = Number(early?.getAttribute("colspan") ?? "1");
    expect(colSpan).toBeGreaterThanOrEqual(1);
    expect(colSpan).toBeLessThanOrEqual(4);
    // Late band's leaves are all outside the initial window: band dropped.
    expect(screen.queryByText("Late")).not.toBeInTheDocument();
    // Band row and leaf row must consume identical total column slots:
    const headerRows = document.querySelectorAll("thead tr");
    expect(headerRows.length).toBe(2);
    const [bandRow, leafRow] = headerRows;
    const slots = (tr: Element) =>
      [...tr.children].reduce((sum, cell) => sum + Number(cell.getAttribute("colspan") ?? "1"), 0);
    expect(slots(bandRow)).toBe(slots(leafRow));
  });

  it("windows generated pivot measure columns", () => {
    type PivotSource = { id: string; segment: string; region: string; revenue: number };
    const rows: PivotSource[] = Array.from({ length: 200 }, (_, i) => ({
      id: String(i),
      segment: `Segment ${i % 5}`,
      region: `Region ${i % 40}`,
      revenue: i,
    }));
    render(
      <DataGrid<PivotSource>
        data={rows}
        columns={[
          { accessorKey: "segment", header: "Segment", dataType: "text" },
          { accessorKey: "region", header: "Region", dataType: "text" },
          { accessorKey: "revenue", header: "Revenue", dataType: "currency" },
        ]}
        layoutMode="pivot"
        getRowId={(r) => r.id}
        virtualizeColumns
        features={{ pagination: false, rowSelection: false }}
        pivot={{
          rows: ["segment"],
          columns: [{ columnId: "region" }],
          measures: [{ id: "revenue", label: "Revenue", columnId: "revenue", aggregation: "sum" }],
        }}
      />,
    );
    // 40 region buckets × 1 measure (+ row label + totals) — the window
    // renders a strict subset of leaf header cells.
    const headerRows = [...document.querySelectorAll("thead tr")];
    const leafHeaderRow = headerRows[headerRows.length - 1];
    expect(leafHeaderRow).toBeDefined();
    expect(leafHeaderRow.querySelectorAll("th").length).toBeLessThan(40);
  });
});
