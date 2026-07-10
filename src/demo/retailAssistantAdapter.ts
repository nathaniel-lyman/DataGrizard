import type {
  DataGridAgentToolDefinition,
  DataGridAggregateResult,
  DataGridQueryResult,
} from "../components/DataGrid";

type ToolkitExecutor = {
  execute: (name: DataGridAgentToolDefinition["name"], input?: unknown) => unknown;
};

export type RetailAssistantWorkflowResult = {
  toolCalls: Array<{ name: DataGridAgentToolDefinition["name"]; input: unknown }>;
  query: DataGridQueryResult;
  aggregation: DataGridAggregateResult;
  summary: string;
};

const afterGridRender = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Reference provider adapter. It deliberately lives in the demo layer: a real
 * assistant would choose these calls from the toolkit schemas, while the grid
 * package remains provider-neutral.
 */
export async function runRetailAssistantWorkflow(
  toolkit: ToolkitExecutor,
): Promise<RetailAssistantWorkflowResult> {
  const toolCalls: RetailAssistantWorkflowResult["toolCalls"] = [];
  const call = (name: DataGridAgentToolDefinition["name"], input: unknown = {}) => {
    toolCalls.push({ name, input });
    return toolkit.execute(name, input);
  };

  call("grid_get_context");
  const viewResult = call("grid_update_view", {
    filters: [{ id: "department", value: { operator: "isAnyOf", value: ["Grocery"] } }],
    sorting: [{ id: "sales", desc: true }],
    grouping: [],
  });
  if (viewResult && typeof viewResult === "object" && "ok" in viewResult && !viewResult.ok) {
    throw new Error(`grid_update_view failed: ${JSON.stringify(viewResult)}`);
  }
  await afterGridRender();

  const visibleViewResult = call("grid_update_view", {
    visibleColumnIds: ["item_name", "sales", "margin_rate"],
    pageIndex: 0,
    pageSize: 5,
  });
  if (
    visibleViewResult &&
    typeof visibleViewResult === "object" &&
    "ok" in visibleViewResult &&
    !visibleViewResult.ok
  ) {
    throw new Error(`grid_update_view failed: ${JSON.stringify(visibleViewResult)}`);
  }
  await afterGridRender();

  const formattingResult = call("grid_format_columns", {
    presentation: {
      sales: { dataBar: { color: "#8b5cf6", showValue: true } },
    },
  });
  if (
    formattingResult &&
    typeof formattingResult === "object" &&
    "ok" in formattingResult &&
    !formattingResult.ok
  ) {
    throw new Error(`grid_format_columns failed: ${JSON.stringify(formattingResult)}`);
  }
  await afterGridRender();

  const query = call("grid_query_rows", {
    scope: "visible_page",
    columnIds: ["item_name", "sales", "margin_rate"],
    limit: 5,
  }) as DataGridQueryResult;
  const aggregation = call("grid_aggregate", {
    scope: "visible_page",
    metrics: [
      { operation: "count", as: "products" },
      { operation: "sum", columnId: "sales", as: "totalSales" },
      { operation: "average", columnId: "margin_rate", as: "averageMargin" },
    ],
  }) as DataGridAggregateResult;

  const metrics = aggregation.ok ? aggregation.metrics : {};
  const products = typeof metrics.products === "number" ? metrics.products : 0;
  const totalSales = typeof metrics.totalSales === "number" ? metrics.totalSales : 0;
  const averageMargin = typeof metrics.averageMargin === "number" ? metrics.averageMargin : 0;
  return {
    toolCalls,
    query,
    aggregation,
    summary: `${products} Grocery products · ${new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(totalSales)} sales · ${new Intl.NumberFormat("en-US", {
      style: "percent",
      maximumFractionDigits: 1,
    }).format(averageMargin)} average margin`,
  };
}
