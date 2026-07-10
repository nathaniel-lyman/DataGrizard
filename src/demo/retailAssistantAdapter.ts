import type {
  DataGridAgentToolDefinition,
  DataGridAggregateResult,
  DataGridQueryResult,
} from "../components/DataGrid";

type ToolkitExecutor = {
  execute: (name: DataGridAgentToolDefinition["name"], input?: unknown) => Promise<unknown>;
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
  const call = async (name: DataGridAgentToolDefinition["name"], input: unknown = {}) => {
    toolCalls.push({ name, input });
    return await toolkit.execute(name, input);
  };

  const context = await call("grid_get_context");
  const contextFeatures = context && typeof context === "object"
    ? (context as { features?: { grouping?: unknown } }).features
    : undefined;
  const groupingEnabled = contextFeatures?.grouping === true;
  const planResult = await call("grid_plan_actions", {
    filters: [{ id: "department", value: { operator: "isAnyOf", value: ["Grocery"] } }],
    sorting: [{ id: "sales", desc: true }],
    ...(groupingEnabled ? { grouping: [] } : {}),
    visibleColumnIds: ["item_name", "sales", "margin_rate"],
    presentation: {
      sales: { dataBar: { color: "#8b5cf6", showValue: true } },
    },
  });
  if (!planResult || typeof planResult !== "object" || !("ok" in planResult) || !planResult.ok) {
    throw new Error(`grid_plan_actions failed: ${JSON.stringify(planResult)}`);
  }
  const planId = (planResult as unknown as { plan: { planId: string } }).plan.planId;
  const validation = await call("grid_validate_plan", { planId });
  if (!validation || typeof validation !== "object" || !("ok" in validation) || !validation.ok) {
    throw new Error(`grid_validate_plan failed: ${JSON.stringify(validation)}`);
  }
  const applied = await call("grid_apply_plan", { planId });
  if (!applied || typeof applied !== "object" || !("ok" in applied) || !applied.ok) {
    throw new Error(`grid_apply_plan failed: ${JSON.stringify(applied)}`);
  }
  await afterGridRender();

  // TanStack resets pagination after filter/group changes. Plan the page-size
  // change against that committed revision so it cannot be overwritten by the
  // table's own reset lifecycle.
  const pagePlan = await call("grid_plan_actions", { pageIndex: 0, pageSize: 5 });
  if (!pagePlan || typeof pagePlan !== "object" || !("ok" in pagePlan) || !pagePlan.ok) {
    throw new Error(`grid_plan_actions failed: ${JSON.stringify(pagePlan)}`);
  }
  const pagePlanId = (pagePlan as unknown as { plan: { planId: string } }).plan.planId;
  const pageValidation = await call("grid_validate_plan", { planId: pagePlanId });
  if (!pageValidation || typeof pageValidation !== "object" || !("ok" in pageValidation) || !pageValidation.ok) {
    throw new Error(`grid_validate_plan failed: ${JSON.stringify(pageValidation)}`);
  }
  const pageApplied = await call("grid_apply_plan", { planId: pagePlanId });
  if (!pageApplied || typeof pageApplied !== "object" || !("ok" in pageApplied) || !pageApplied.ok) {
    throw new Error(`grid_apply_plan failed: ${JSON.stringify(pageApplied)}`);
  }
  await afterGridRender();

  const query = await call("grid_query_rows", {
    scope: "visible_page",
    columnIds: ["item_name", "sales", "margin_rate"],
    limit: 5,
  }) as DataGridQueryResult;
  const aggregation = await call("grid_aggregate", {
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
