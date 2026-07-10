import type {
  DataGridAggregateMetric,
  DataGridServerAnalysisAdapter,
  DataGridServerAnalysisRequest,
  DataGridSerializableValue,
  GridColumnConfig,
  GridFilterConfig,
} from "../../src/components/DataGrid";

export type ReliabilityRow = {
  id: string;
  product: string;
  region: string;
  segment: string;
  revenue_actual: number;
  revenue_forecast: number;
  margin_rate: number;
  units: number;
  employee_email: string;
  private_note: string;
  customer_secret: string;
};

export const RESTRICTED_CANARIES = [
  "dg-secret-email-7319@example.invalid",
  "DG_PRIVATE_NOTE_8842",
  "DG_CUSTOMER_SECRET_2291",
] as const;

export const reliabilityRows: ReliabilityRow[] = [
  {
    id: "r1", product: "Alpha", region: "North", segment: "Enterprise",
    revenue_actual: 1200, revenue_forecast: 1500, margin_rate: 0.2, units: 10,
    employee_email: RESTRICTED_CANARIES[0], private_note: RESTRICTED_CANARIES[1],
    customer_secret: RESTRICTED_CANARIES[2],
  },
  {
    id: "r2", product: "Beta", region: "South", segment: "SMB",
    revenue_actual: 900, revenue_forecast: 950, margin_rate: 0.3, units: 8,
    employee_email: "beta-owner@example.invalid", private_note: "restricted-beta",
    customer_secret: "restricted-customer-beta",
  },
  {
    id: "r3", product: "Gamma", region: "North", segment: "SMB",
    revenue_actual: 700, revenue_forecast: 800, margin_rate: 0.1, units: 6,
    employee_email: "gamma-owner@example.invalid", private_note: "restricted-gamma",
    customer_secret: "restricted-customer-gamma",
  },
  {
    id: "r4", product: "Delta", region: "West", segment: "Enterprise",
    revenue_actual: 2000, revenue_forecast: 2100, margin_rate: 0.4, units: 12,
    employee_email: "delta-owner@example.invalid", private_note: "restricted-delta",
    customer_secret: "restricted-customer-delta",
  },
  {
    id: "r5", product: "Epsilon", region: "East", segment: "Consumer",
    revenue_actual: 500, revenue_forecast: 550, margin_rate: 0.25, units: 5,
    employee_email: "epsilon-owner@example.invalid", private_note: "restricted-epsilon",
    customer_secret: "restricted-customer-epsilon",
  },
  {
    id: "r6", product: "Zeta", region: "South", segment: "Enterprise",
    revenue_actual: 1100, revenue_forecast: 1250, margin_rate: 0.15, units: 9,
    employee_email: "zeta-owner@example.invalid", private_note: "restricted-zeta",
    customer_secret: "restricted-customer-zeta",
  },
];

export const reliabilityColumns: GridColumnConfig<ReliabilityRow>[] = [
  { accessorKey: "product", header: "Product", dataType: "text", semantic: { synonyms: ["item", "sku name"], sensitivity: "public" } },
  { accessorKey: "region", header: "Region", dataType: "text", enableGrouping: true, semantic: { synonyms: ["market", "area"], allowedValues: ["North", "South", "East", "West"], sensitivity: "public" } },
  { accessorKey: "segment", header: "Segment", dataType: "text", enableGrouping: true, semantic: { synonyms: ["customer group", "tier"], allowedValues: ["Enterprise", "SMB", "Consumer"], sensitivity: "public" } },
  { accessorKey: "revenue_actual", header: "Revenue", dataType: "currency", semantic: { description: "Booked actual revenue.", synonyms: ["actual sales", "booked revenue"], currency: "USD", sensitivity: "public" } },
  { accessorKey: "revenue_forecast", header: "Revenue forecast", dataType: "currency", semantic: { description: "Forecast revenue, not booked actuals.", synonyms: ["projected revenue", "forecast sales"], currency: "USD", sensitivity: "public" } },
  { accessorKey: "margin_rate", header: "Margin", dataType: "percent", semantic: { description: "Gross margin rate as a decimal fraction.", synonyms: ["margin percent", "gross margin"], unit: "ratio", sensitivity: "public" } },
  { accessorKey: "units", header: "Units", dataType: "number", semantic: { synonyms: ["quantity", "volume"], unit: "items", sensitivity: "public" } },
  { accessorKey: "employee_email", header: "Employee email", dataType: "text", semantic: { sensitivity: "restricted" } },
  { accessorKey: "private_note", header: "Private note", dataType: "text", semantic: { sensitivity: "restricted" } },
  { accessorKey: "customer_secret", header: "Customer secret", dataType: "text", semantic: { sensitivity: "restricted" } },
];

export const reliabilityFilters: GridFilterConfig<ReliabilityRow>[] = [
  { accessorKey: "product", filterType: "text" },
  { accessorKey: "region", filterType: "multiSelect", operators: ["isAnyOf", "isNoneOf"], options: ["North", "South", "East", "West"] },
  { accessorKey: "segment", filterType: "multiSelect", operators: ["isAnyOf", "isNoneOf"], options: ["Enterprise", "SMB", "Consumer"] },
  { accessorKey: "revenue_actual", filterType: "range" },
  { accessorKey: "margin_rate", filterType: "range" },
];

const metricValue = (rows: ReliabilityRow[], metric: DataGridAggregateMetric): DataGridSerializableValue => {
  if (metric.operation === "count") return rows.length;
  const values = metric.columnId
    ? rows.map((row) => row[metric.columnId as keyof ReliabilityRow]).filter((value): value is number => typeof value === "number")
    : [];
  if (metric.operation === "sum") return values.reduce((sum, value) => sum + value, 0);
  if (metric.operation === "average") return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  if (metric.operation === "min") return values.length ? Math.min(...values) : null;
  if (metric.operation === "max") return values.length ? Math.max(...values) : null;
  if (metric.operation === "min_max") return values.length ? { min: Math.min(...values), max: Math.max(...values) } : { min: null, max: null };
  const rawValues = metric.columnId ? rows.map((row) => row[metric.columnId as keyof ReliabilityRow]) : [];
  if (metric.operation === "distinct_count") return new Set(rawValues.map(String)).size;
  if (metric.operation === "top_values") {
    const counts = new Map<string, { value: DataGridSerializableValue; count: number }>();
    rawValues.forEach((value) => {
      const key = JSON.stringify(value);
      const existing = counts.get(key);
      counts.set(key, { value: value as DataGridSerializableValue, count: (existing?.count ?? 0) + 1 });
    });
    return [...counts.values()].sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value))).slice(0, metric.limit ?? 10);
  }
  return null;
};

const publicValue = (row: ReliabilityRow, columnId: string) =>
  row[columnId as keyof ReliabilityRow] as DataGridSerializableValue;

const rowsForRequest = (request: DataGridServerAnalysisRequest) => {
  if (request.context.scope !== "filtered") return reliabilityRows;
  return request.context.filters.columnFilters.reduce((rows, filter) => {
    if (filter.id === "region" && filter.value && typeof filter.value === "object") {
      const value = (filter.value as { value?: unknown }).value;
      if (Array.isArray(value)) return rows.filter((row) => value.includes(row.region));
    }
    if (filter.id === "segment" && filter.value && typeof filter.value === "object") {
      const value = (filter.value as { value?: unknown }).value;
      if (Array.isArray(value)) return rows.filter((row) => value.includes(row.segment));
    }
    return rows;
  }, reliabilityRows);
};

export const createReliabilityServerAnalysis = (
  capability: "all" | "filtered" | "all-and-filtered",
): DataGridServerAnalysisAdapter => {
  const scopes = capability === "all-and-filtered" ? ["all", "filtered"] as const : [capability] as const;
  return {
    id: `reliability-${capability}`,
    capabilities: { queryScopes: scopes, aggregateScopes: scopes },
    async execute(request) {
      const rows = rowsForRequest(request);
      const provenance = { sourceRevision: "reliability-v1", effectiveOrdering: "id ascending" };
      if (request.operation === "query") {
        const sliced = rows.slice(request.input.offset, request.input.offset + request.input.limit);
        return {
          operation: "query",
          rows: sliced.map((row) => ({
            rowId: row.id,
            values: Object.fromEntries(request.input.columnIds.map((columnId) => [columnId, publicValue(row, columnId)])),
          })),
          rowCount: rows.length,
          returnedRowCount: sliced.length,
          offset: request.input.offset,
          truncated: request.input.offset + sliced.length < rows.length,
          provenance,
        };
      }
      const metrics = Object.fromEntries(request.input.metrics.map((metric) => [
        metric.as ?? `${metric.operation}:${metric.columnId ?? "rows"}`,
        metricValue(rows, metric),
      ]));
      return {
        operation: "aggregate",
        rowCount: rows.length,
        metrics,
        groups: [],
        truncated: false,
        supportingRowIds: rows.slice(0, request.context.limits.maxRowsPerQuery).map((row) => row.id),
        provenance,
      };
    },
  };
};
