import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DataGrid } from "./DataGrid";
import type { GridColumnConfig } from "../../types/grid";

type Row = { id: string; name: string; revenue: number; segment?: string };

const columns: GridColumnConfig<Row>[] = [
  { accessorKey: "name", header: "Name", dataType: "text" },
  { accessorKey: "segment", header: "Segment", dataType: "text", enableGrouping: true },
  { accessorKey: "revenue", header: "Revenue", dataType: "currency" },
];

const makeRows = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({
    id: String(i),
    name: `Item ${i}`,
    revenue: i,
    segment: `Segment ${i % 20}`,
  }));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("DataGrid row virtualization", () => {
  it("renders far fewer DOM rows than data rows when virtualizeRows is on", () => {
    render(
      <DataGrid
        data={makeRows(1000)}
        columns={columns}
        getRowId={(r) => r.id}
        virtualizeRows
        features={{ pagination: false }}
      />,
    );

    const bodyRows = document.querySelectorAll("tbody tr");
    expect(bodyRows.length).toBeLessThan(100);
    // A row deep in the list is not mounted in the initial window.
    expect(screen.queryByText("Item 999")).not.toBeInTheDocument();
  });

  it("renders all rows when virtualization is off (control)", () => {
    render(
      <DataGrid
        data={makeRows(80)}
        columns={columns}
        getRowId={(r) => r.id}
        features={{ pagination: false }}
      />,
    );

    expect(screen.getByText("Item 0")).toBeInTheDocument();
    expect(screen.getByText("Item 79")).toBeInTheDocument();
  });

  it("virtualizes materialized pivot rows with generated-column spacer colSpan", () => {
    render(
      <DataGrid
        data={makeRows(500)}
        columns={columns}
        layoutMode="pivot"
        getRowId={(r) => r.id}
        virtualizeRows
        features={{ pagination: false, rowSelection: false }}
        pivot={{
          rows: ["segment"],
          measures: [
            { id: "revenue", label: "Revenue", columnId: "revenue", aggregation: "sum" },
          ],
        }}
      />,
    );

    const bodyRows = document.querySelectorAll("tbody tr");
    expect(bodyRows.length).toBeLessThan(80);
    expect(screen.getAllByRole("columnheader")).toHaveLength(2);
  });
});
