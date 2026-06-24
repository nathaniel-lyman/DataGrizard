import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
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

describe("DataGrid global search", () => {
  it("matches formatted cell text, not just raw values", () => {
    render(<DataGrid data={rows} columns={columns} getRowId={(r) => r.id} />);

    fireEvent.change(screen.getByPlaceholderText(/Search/i), { target: { value: "$1,200" } });

    expect(screen.getByText("Almond Butter")).toBeInTheDocument();
    expect(screen.queryByText("Apples")).not.toBeInTheDocument();
  });

  it("clears the search via the clear button", () => {
    render(<DataGrid data={rows} columns={columns} getRowId={(r) => r.id} />);
    const input = screen.getByPlaceholderText(/Search/i) as HTMLInputElement;

    fireEvent.change(input, { target: { value: "Apples" } });
    expect(screen.queryByText("Almond Butter")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /clear search/i }));

    expect(input.value).toBe("");
    expect(screen.getByText("Almond Butter")).toBeInTheDocument();
  });
});

describe("DataGrid selected-row scope", () => {
  it("counts only filtered rows in the selected count", () => {
    render(
      <DataGrid data={rows} columns={columns} getRowId={(r) => r.id} getRowLabel={(r) => r.product} />,
    );

    fireEvent.click(screen.getByLabelText("Select Apples"));
    expect(screen.getByText("1 selected")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Search/i), { target: { value: "Almond" } });
    expect(screen.getByText("0 selected")).toBeInTheDocument();
  });
});

describe("DataGrid detail panel", () => {
  it("toggles closed when the active row is clicked again and on Escape", () => {
    render(
      <DataGrid
        data={rows}
        columns={columns}
        getRowId={(r) => r.id}
        renderDetailPanel={(row) => (
          <div data-testid="panel">{row ? row.product : "none"}</div>
        )}
      />,
    );
    const row = screen.getByText("Almond Butter").closest("tr") as HTMLElement;

    fireEvent.click(row);
    expect(screen.getByTestId("panel")).toHaveTextContent("Almond Butter");

    fireEvent.click(row);
    expect(screen.getByTestId("panel")).toHaveTextContent("none");

    fireEvent.click(row);
    expect(screen.getByTestId("panel")).toHaveTextContent("Almond Butter");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByTestId("panel")).toHaveTextContent("none");
  });

  it("closes via the close control passed to renderDetailPanel", () => {
    render(
      <DataGrid
        data={rows}
        columns={columns}
        getRowId={(r) => r.id}
        renderDetailPanel={(row, controls) => (
          <div data-testid="panel">
            {row ? row.product : "none"}
            <button onClick={controls.close}>Close panel</button>
          </div>
        )}
      />,
    );

    fireEvent.click(screen.getByText("Almond Butter").closest("tr") as HTMLElement);
    expect(screen.getByTestId("panel")).toHaveTextContent("Almond Butter");

    fireEvent.click(screen.getByRole("button", { name: "Close panel" }));
    expect(screen.getByTestId("panel")).toHaveTextContent("none");
  });
});

describe("DataGrid select-all across pages", () => {
  it("offers to select all matching rows when a full page is selected but more match", () => {
    const many: Row[] = Array.from({ length: 5 }, (_, i) => ({
      id: String(i),
      dept: "D",
      product: `P${i}`,
      revenue: 100 + i,
      units: i,
    }));
    render(<DataGrid data={many} columns={columns} getRowId={(r) => r.id} pageSizeOptions={[2]} />);

    fireEvent.click(screen.getByLabelText("Select all visible rows"));
    fireEvent.click(screen.getByRole("button", { name: /select all 5/i }));

    expect(screen.getByText("5 selected")).toBeInTheDocument();
  });
});

describe("DataGrid clear sort", () => {
  it("clears sorting via the clear-sort control", () => {
    render(<DataGrid data={rows} columns={columns} getRowId={(r) => r.id} />);

    fireEvent.click(screen.getByRole("button", { name: "Product" }));
    expect(screen.getByRole("columnheader", { name: /Product/ })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );

    fireEvent.click(screen.getByRole("button", { name: /clear sort/i }));
    expect(screen.getByRole("columnheader", { name: /Product/ })).toHaveAttribute(
      "aria-sort",
      "none",
    );
  });
});
