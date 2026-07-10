import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssistantDemo } from "./AssistantDemo";

afterEach(cleanup);
afterEach(() => vi.unstubAllGlobals());

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
  it("labels prompt suggestions as examples rather than video prompts", () => {
    render(<AssistantDemo toolkit={{ execute: vi.fn() }} />);

    expect(screen.getByText("Try an example:")).toBeInTheDocument();
    expect(screen.queryByText("Video prompts:")).not.toBeInTheDocument();
  });

  it("executes model-selected tools through the toolkit before rendering the final answer", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        responseId: "resp-first",
        text: "",
        toolCalls: [{ callId: "call-context", name: "grid_get_context", arguments: "{}" }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        responseId: "resp-final",
        text: "Grocery is now the active analysis view. I inspected the live grid first.",
        toolCalls: [],
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const execute = vi.fn().mockResolvedValue({ revision: 4, rowCount: 500 });
    const toolkit = {
      getTools: () => [{
        name: "grid_get_context" as const,
        description: "Inspect the live grid.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
      }],
      execute,
    };

    render(<AssistantDemo toolkit={toolkit} />);
    fireEvent.click(screen.getByRole("button", { name: "Ask live agent" }));

    expect(await screen.findByText(/Grocery is now the active analysis view/)).toBeInTheDocument();
    expect(execute).toHaveBeenCalledWith("grid_get_context", {});
    expect(screen.getByText(/grid_get_context/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      previousResponseId: "resp-first",
      toolOutputs: [{ callId: "call-context", output: { revision: 4, rowCount: 500 } }],
    });
  });

  it("reveals the receipt behind a completed assistant answer", async () => {
    let planSequence = 0;
    const toolkit = {
      execute: vi.fn(async (name: string) => {
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
      }),
    };

    render(<AssistantDemo toolkit={toolkit} />);
    fireEvent.click(screen.getByRole("button", { name: "Run deterministic proof" }));

    expect(await screen.findByText(/\$4,200,000 sales/)).toBeInTheDocument();
    const undo = screen.getByRole("button", { name: "Undo latest agent change" });
    fireEvent.click(undo);
    expect(await screen.findByRole("button", { name: "Latest change undone" })).toBeDisabled();
    expect(toolkit.execute).toHaveBeenCalledWith("grid_undo", { transactionId: "tx-2" });
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
