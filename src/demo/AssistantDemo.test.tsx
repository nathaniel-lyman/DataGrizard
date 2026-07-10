import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AssistantDemo } from "./AssistantDemo";

afterEach(cleanup);

const receipt = {
  queryId: "dg-aggregate-7-test-1",
  gridRevision: 7,
  scope: "visible_page" as const,
  columns: [
    { id: "sales", label: "Sales", dataType: "currency" as const },
    { id: "margin_rate", label: "Margin", dataType: "percent" as const },
  ],
  filters: {
    globalFilter: "",
    columnFilters: [{ id: "department", value: { operator: "isAnyOf", value: ["Grocery"] } }],
  },
  sorting: [{ id: "sales", desc: true }],
  grouping: { view: [], aggregateBy: [] },
  supportingRowIds: ["SKU-1", "SKU-2"],
  supportingGroupKeys: [],
  warnings: [],
  timing: {
    startedAt: "2026-07-10T12:00:00.000Z",
    completedAt: "2026-07-10T12:00:00.001Z",
    durationMs: 1,
  },
  replay: {
    operation: "aggregate" as const,
    payload: {
      scope: "visible_page" as const,
      metrics: [
        { operation: "count" as const, as: "products" },
        { operation: "sum" as const, columnId: "sales", as: "totalSales" },
        { operation: "average" as const, columnId: "margin_rate", as: "averageMargin" },
      ],
      groupBy: [],
    },
  },
};

describe("AssistantDemo", () => {
  it("reveals the receipt behind a completed assistant answer", async () => {
    let planSequence = 0;
    const toolkit = {
      execute: (name: string) => {
        if (name === "grid_plan_actions") {
          planSequence += 1;
          return {
            ok: true,
            plan: {
              planId: `plan-${planSequence}`,
              baseRevision: planSequence,
              commands: [],
              diff: { entries: [], commandTypes: [], columnIds: [], rowIds: [] },
            },
            errors: [],
          };
        }
        if (name === "grid_validate_plan") {
          return { ok: true, planId: `plan-${planSequence}`, revision: planSequence, errors: [] };
        }
        if (name === "grid_apply_plan") {
          return {
            ok: true,
            receipt: {
              transactionId: `tx-${planSequence}`,
              planId: `plan-${planSequence}`,
              baseRevision: planSequence,
              appliedRevision: planSequence + 1,
              appliedCommandCount: 1,
              diff: { entries: [], commandTypes: [], columnIds: [], rowIds: [] },
            },
            errors: [],
          };
        }
        if (name === "grid_query_rows") {
          return {
            ok: true,
            scope: "visible_page",
            columns: receipt.columns,
            rows: [],
            rowCount: 2,
            returnedRowCount: 2,
            offset: 0,
            truncated: false,
            receipt: {
              ...receipt,
              queryId: "dg-query-7-test-1",
              replay: {
                operation: "query",
                payload: {
                  scope: "visible_page",
                  columnIds: ["item_name", "sales", "margin_rate"],
                  offset: 0,
                  limit: 5,
                },
              },
            },
          };
        }
        if (name === "grid_aggregate") {
          return {
            ok: true,
            scope: "visible_page",
            rowCount: 2,
            metrics: { products: 2, totalSales: 4200000, averageMargin: 0.25 },
            groups: [],
            truncated: false,
            receipt,
          };
        }
        return name === "grid_get_context"
          ? {}
          : { ok: true, appliedCommandCount: 1, errors: [] };
      },
    };

    render(<AssistantDemo toolkit={toolkit} />);
    fireEvent.click(screen.getByRole("button", { name: "Run workflow" }));

    expect(await screen.findByText(/\$4,200,000 sales/)).toBeInTheDocument();
    const disclosure = screen.getByText("View analysis receipt");
    const details = disclosure.closest("details");
    expect(details).not.toHaveAttribute("open");

    fireEvent.click(disclosure);

    expect(details).toHaveAttribute("open");
    expect(screen.getByText("Grid revision")).toBeInTheDocument();
    expect(screen.getByText("visible_page")).toBeInTheDocument();
    expect(details).toHaveTextContent("SKU-1, SKU-2");
    expect(details).toHaveTextContent('"operation": "aggregate"');
    expect(details).toHaveTextContent('"department"');
    expect(details).toHaveTextContent('"sales"');
  });
});
