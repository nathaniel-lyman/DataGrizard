import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataGrid, type DataGridProps } from "./DataGrid";
import type { GridColumnConfig } from "../../types/grid";

type Item = {
  product: string;
  dept: string;
  status: string;
  revenue: number;
  units: number;
  margin: number;
  restocked: string;
};

const rows: Item[] = [
  { product: "Almond Butter", dept: "Grocery", status: "approved", revenue: 1200, units: 24, margin: 0.31, restocked: "2026-06-12" },
  { product: "Apples", dept: "Grocery", status: "pending", revenue: 900, units: 42, margin: 0.22, restocked: "2026-06-20" },
  { product: "Shelf Bin", dept: "Home", status: "approved", revenue: 700, units: 18, margin: 0.4, restocked: "2026-05-30" },
  { product: "Lamp", dept: "Home", status: "rejected", revenue: 500, units: 12, margin: 0.18, restocked: "2026-06-02" },
];

const columns: GridColumnConfig<Item>[] = [
  { accessorKey: "product", header: "Product", dataType: "text" },
  { accessorKey: "dept", header: "Dept", dataType: "text" },
  { accessorKey: "status", header: "Status", dataType: "status" },
  { accessorKey: "revenue", header: "Revenue", dataType: "currency" },
  { accessorKey: "units", header: "Units", dataType: "number" },
  { accessorKey: "margin", header: "Margin", dataType: "percent" },
  { accessorKey: "restocked", header: "Restocked", dataType: "date" },
];

const renderCards = ({ features, cardView, ...rest }: Partial<DataGridProps<Item>> = {}) =>
  render(
    <DataGrid
      data={rows}
      columns={columns}
      getRowId={(row) => row.product}
      {...rest}
      features={{ cardLayout: true, ...features }}
      cardView={{ mode: "cards", ...cardView }}
    />,
  );

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("DataGrid card mode: render swap", () => {
  it("renders a card list instead of a table when pinned to cards", () => {
    renderCards();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });

  it("composes cards from column metadata: title, status pill, ≤3 metrics, meta footer", () => {
    renderCards();
    const card = screen.getAllByRole("listitem")[0];
    expect(within(card).getByText("Almond Butter")).toBeInTheDocument();
    // status renders through the shared pill path (formatStatusLabel → "Approved").
    expect(within(card).getByText("Approved")).toBeInTheDocument();
    // metric labels come from column headers; restocked (date) overflows to meta.
    expect(within(card).getByText("Revenue")).toBeInTheDocument();
    expect(within(card).getByText("$1,200")).toBeInTheDocument();
    expect(within(card).getByText(/Restocked:/)).toBeInTheDocument();
  });

  it("cardView.card overrides a role while the heuristic fills the rest", () => {
    renderCards({ cardView: { mode: "cards", card: { title: "dept" } } });
    const card = screen.getAllByRole("listitem")[0];
    expect(within(card).getByText("Grocery")).toBeInTheDocument();
  });

  it("stays a table when features.cardLayout is off", () => {
    render(
      <DataGrid data={rows} columns={columns} getRowId={(r) => r.product} cardView={{ mode: "cards" }} />,
    );
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("pivot layout ignores card mode", () => {
    render(
      <DataGrid
        data={rows}
        columns={columns}
        getRowId={(r) => r.product}
        layoutMode="pivot"
        defaultGrouping={["dept"]}
        features={{ cardLayout: true }}
        cardView={{ mode: "cards" }}
      />,
    );
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("auto mode in jsdom measures width 0 and flips to cards (pin mode:'table' to opt out)", () => {
    render(
      <DataGrid
        data={rows}
        columns={columns}
        getRowId={(r) => r.product}
        features={{ cardLayout: true }}
        cardView={{ mode: "auto" }}
      />,
    );
    // jsdom: getBoundingClientRect().width === 0 < 640 would flip to cards, BUT
    // the width IS measured (0), so this asserts the real jsdom behavior:
    // auto mode measures 0 → cards. Pin mode:"table" to keep a table in jsdom.
    // We assert the deterministic outcome so the suite catches accidental changes.
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("card-mode feature defaults: no selection checkboxes, no Export button; summaries stay", () => {
    renderCards({
      summaryItems: [
        { id: "count", label: "Items", value: ({ filteredRows }) => filteredRows.length },
      ],
    });
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Export CSV" })).not.toBeInTheDocument();
    expect(screen.getByText("Items")).toBeInTheDocument();
  });

  it("tapping a card toggles the active row", () => {
    const onActiveRowChange = vi.fn();
    renderCards({
      onActiveRowChange,
      renderDetailPanel: (row) => (row ? <div>Detail: {row.product}</div> : null),
    });
    fireEvent.click(within(screen.getAllByRole("listitem")[0]).getByRole("button"));
    expect(onActiveRowChange).toHaveBeenCalledWith(rows[0]);
  });
});

describe("DataGrid card mode: chrome", () => {
  it("replaces the desktop toolbar with search + Sort/Filters chips", () => {
    renderCards();
    expect(screen.getByPlaceholderText("Search rows...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sort" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filters" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View controls" })).not.toBeInTheDocument();
  });

  it("sort sheet cycles asc → desc → clear on the same column and reorders cards", () => {
    renderCards();
    fireEvent.click(screen.getByRole("button", { name: "Sort" }));
    fireEvent.click(screen.getByRole("button", { name: "Revenue" }));
    // asc: lowest revenue first
    let cards = screen.getAllByRole("listitem");
    expect(within(cards[0]).getByText("Lamp")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Revenue" }));
    // desc: highest revenue first
    cards = screen.getAllByRole("listitem");
    expect(within(cards[0]).getByText("Almond Butter")).toBeInTheDocument();
    // third tap clears: the chip label (aria-hidden arrow excluded) reverts to
    // plain "Sort" — data order happens to equal desc order, so assert the chip.
    fireEvent.click(screen.getByRole("button", { name: "Revenue" }));
    expect(screen.getByRole("button", { name: "Sort" })).toBeInTheDocument();
  });

  it("filters sheet writes columnFilters: facet a value, cards filter, chip counts", () => {
    renderCards();
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    // dept is low-cardinality text → auto-faceted multiSelect checkboxes.
    fireEvent.click(screen.getByRole("checkbox", { name: "Grocery" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Filters (1)" })).toBeInTheDocument();
  });

  it("summaries condense to a horizontal strip in card mode", () => {
    renderCards({
      summaryItems: [
        { id: "count", label: "Items", value: ({ filteredRows }) => filteredRows.length },
      ],
    });
    // The desktop summary header ("Summary" + scope) is not rendered.
    expect(screen.queryByText("Summary")).not.toBeInTheDocument();
    expect(screen.getByText("Items")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });
});
