import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DataGrid } from "./DataGrid";
import { trendIconSet } from "./trendIconSet";
import type { GridColumnConfig } from "../../types/grid";

type Row = { id: string; name: string; revenue: number; units: number; change: number; rate: number };

const data: Row[] = [
  { id: "1", name: "Acme", revenue: 900, units: 900, change: 5, rate: 0.34 },
  { id: "2", name: "Globex", revenue: 1500, units: 1500, change: -3, rate: 0.92 },
];

const baseColumns: GridColumnConfig<Row>[] = [
  { accessorKey: "name", header: "Name", dataType: "text" },
  { accessorKey: "revenue", header: "Revenue", dataType: "currency" },
];

const cellOf = (text: string) => screen.getByText(text).closest("td") as HTMLElement;

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("colorScale", () => {
  it("shades the cell background across the column's auto domain", () => {
    const columns: GridColumnConfig<Row>[] = [
      baseColumns[0],
      { accessorKey: "revenue", header: "Revenue", dataType: "currency", colorScale: { colors: ["#000000", "#ffffff"] } },
    ];
    render(<DataGrid data={data} columns={columns} getRowId={(r) => r.id} />);
    expect(cellOf("$900").style.backgroundColor).toBe("rgb(0, 0, 0)");
    expect(cellOf("$1,500").style.backgroundColor).toBe("rgb(255, 255, 255)");
  });

  it("applies a readable text color over the tint", () => {
    const columns: GridColumnConfig<Row>[] = [
      baseColumns[0],
      { accessorKey: "revenue", header: "Revenue", dataType: "currency", colorScale: { colors: ["#000000", "#000000"] } },
    ];
    render(<DataGrid data={data} columns={columns} getRowId={(r) => r.id} />);
    expect(cellOf("$900").style.color).toBe("rgb(248, 250, 252)"); // #f8fafc
  });
});

describe("dataBar", () => {
  it("renders a bar proportional to value and keeps the value visible", () => {
    const columns: GridColumnConfig<Row>[] = [
      baseColumns[0],
      { accessorKey: "units", header: "Units", dataType: "number", dataBar: {} },
    ];
    render(<DataGrid data={data} columns={columns} getRowId={(r) => r.id} />);
    const high = cellOf("1,500").querySelector(".dg-databar") as HTMLElement;
    const low = cellOf("900").querySelector(".dg-databar") as HTMLElement;
    expect(high.style.width).toBe("100%");
    expect(low.style.width).toBe("60%");
    // value text still present
    expect(screen.getByText("1,500")).toBeInTheDocument();
  });

  it("hides the value text when showValue is false but keeps it in the DOM", () => {
    const columns: GridColumnConfig<Row>[] = [
      baseColumns[0],
      { accessorKey: "units", header: "Units", dataType: "number", dataBar: { showValue: false } },
    ];
    render(<DataGrid data={data} columns={columns} getRowId={(r) => r.id} />);
    const wrapper = screen.getByText("1,500").closest("span");
    expect(wrapper).toHaveClass("text-transparent");
  });
});

describe("iconSet", () => {
  it("renders the icon from the first matching rule, before the value by default", () => {
    const columns: GridColumnConfig<Row>[] = [
      baseColumns[0],
      {
        accessorKey: "change",
        header: "Change",
        dataType: "number",
        iconSet: {
          rules: [
            { when: (v) => v > 0, icon: <span data-testid="up">up</span> },
            { when: (v) => v < 0, icon: <span data-testid="down">down</span> },
          ],
        },
      },
    ];
    render(<DataGrid data={data} columns={columns} getRowId={(r) => r.id} />);
    expect(screen.getByTestId("up")).toBeInTheDocument();
    expect(screen.getByTestId("down")).toBeInTheDocument();
    expect(screen.queryByTestId("down")).not.toBe(screen.queryByTestId("up"));
  });

  it("trendIconSet renders an arrow glyph for numeric change", () => {
    const columns: GridColumnConfig<Row>[] = [
      baseColumns[0],
      { accessorKey: "change", header: "Change", dataType: "number", iconSet: trendIconSet<Row>() },
    ];
    render(<DataGrid data={data} columns={columns} getRowId={(r) => r.id} />);
    expect(cellOf("5").querySelector("svg")).toBeInTheDocument();
  });
});

describe("progressBar", () => {
  it("renders a percent cell as an accessible progress bar", () => {
    const columns: GridColumnConfig<Row>[] = [
      baseColumns[0],
      { accessorKey: "rate", header: "Rate", dataType: "percent", progressBar: true },
    ];
    render(<DataGrid data={data} columns={columns} getRowId={(r) => r.id} />);
    const bars = screen.getAllByRole("progressbar");
    expect(bars).toHaveLength(2);
    expect(bars[0]).toHaveAttribute("aria-valuenow", "34");
    expect(bars[1]).toHaveAttribute("aria-valuenow", "92");
  });
});

describe("flashOnChange", () => {
  const columns: GridColumnConfig<Row>[] = [
    baseColumns[0],
    { accessorKey: "revenue", header: "Revenue", dataType: "currency", flashOnChange: true },
  ];

  it("does not flash on initial mount", () => {
    const { container } = render(<DataGrid data={data} columns={columns} getRowId={(r) => r.id} />);
    expect(container.querySelector(".dg-flash")).toBeNull();
  });

  it("flashes up when a value increases and down when it decreases", () => {
    const { container, rerender } = render(
      <DataGrid data={data} columns={columns} getRowId={(r) => r.id} />,
    );
    rerender(
      <DataGrid
        data={[
          { ...data[0], revenue: 1200 },
          { ...data[1], revenue: 800 },
        ]}
        columns={columns}
        getRowId={(r) => r.id}
      />,
    );
    expect(container.querySelector(".dg-flash-up")).not.toBeNull();
    expect(container.querySelector(".dg-flash-down")).not.toBeNull();
  });
});
