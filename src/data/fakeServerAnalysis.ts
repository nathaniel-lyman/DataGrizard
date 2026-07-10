import {
  aggregateMetric,
  getAnalysisValue,
  metricResultKey,
  toSerializableValue,
  type DataGridAnalysisRow,
} from "../components/DataGrid/dataGridAnalysis";
import type {
  DataGridAggregateGroup,
  DataGridAnalysisWarning,
  DataGridSerializableValue,
} from "../components/DataGrid/dataGridApi";
import type {
  DataGridServerAggregateRequest,
  DataGridServerAnalysisAdapter,
  DataGridServerAnalysisProvenance,
  DataGridServerAnalysisRequest,
  DataGridServerQueryRequest,
} from "../components/DataGrid/dataGridAnalysisContract";
import { matchesFilterValue } from "../components/DataGrid/filterMatch";
import type { QuerySortClause } from "../components/DataGrid/serverQuery";
import { mockRetailData, type RetailItem } from "./mockRetailData";

const SOURCE_REVISION = "mock-retail-2026-07-10";
const DEFAULT_ORDERING = "item_id ascending";

const abortError = () => new DOMException("The analysis request was aborted.", "AbortError");

const yieldToAbortSignal = (signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }

    const onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    queueMicrotask(() => {
      signal.removeEventListener("abort", onAbort);
      if (signal.aborted) reject(abortError());
      else resolve();
    });
  });

const compare = (left: unknown, right: unknown) => {
  if (left == null && right == null) return 0;
  if (left == null) return -1;
  if (right == null) return 1;
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right));
};

const filterRows = (
  rows: readonly RetailItem[],
  request: DataGridServerAnalysisRequest,
) => {
  const { filters, search } = request.context.querySpec;
  const term = search?.term.trim().toLowerCase() ?? "";

  return rows.filter((row) => {
    const record = row as Record<string, unknown>;
    if (!filters.every((filter) => matchesFilterValue(record[filter.column], filter.value, {
      filterType: filter.filterType,
      operator: filter.operator,
      searchText: String(record[filter.column] ?? ""),
    }))) {
      return false;
    }
    return !term || (search?.columns ?? []).some((column) =>
      String(record[column] ?? "").toLowerCase().includes(term));
  });
};

const orderRows = (rows: readonly RetailItem[], orderBy: QuerySortClause[]) =>
  [...rows].sort((left, right) => {
    for (const order of orderBy) {
      const result = compare(
        getAnalysisValue(left, order.column),
        getAnalysisValue(right, order.column),
      );
      if (result !== 0) return order.direction === "desc" ? -result : result;
    }
    return left.item_id.localeCompare(right.item_id);
  });

const effectiveOrdering = (orderBy: QuerySortClause[]) =>
  orderBy.length === 0
    ? DEFAULT_ORDERING
    : `${orderBy.map((order) => `${order.column} ${order.direction}`).join(", ")}, item_id ascending tie-breaker`;

const requestFingerprint = (request: DataGridServerAnalysisRequest) => {
  const serialized = JSON.stringify({
    operation: request.operation,
    input: request.input,
    querySpec: request.context.querySpec,
  });
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fake-${(hash >>> 0).toString(16).padStart(8, "0")}`;
};

const provenance = (
  request: DataGridServerAnalysisRequest,
): DataGridServerAnalysisProvenance => ({
  sourceRevision: SOURCE_REVISION,
  requestFingerprint: requestFingerprint(request),
  effectiveOrdering: effectiveOrdering(request.context.querySpec.orderBy),
});

const query = (request: DataGridServerQueryRequest, rows: RetailItem[]) => {
  const { columnIds, offset, limit } = request.input;
  const page = rows.slice(offset, offset + limit);
  const warnings: DataGridAnalysisWarning[] = [];
  if (offset > 0) {
    warnings.push({
      code: "offset_applied",
      message: `The first ${Math.min(offset, rows.length)} remote rows were skipped by the query offset.`,
      actual: offset,
    });
  }
  if (offset + page.length < rows.length) {
    warnings.push({
      code: "rows_truncated",
      message: `The remote query returned ${page.length} of ${rows.length} rows.`,
      limit,
      actual: rows.length,
    });
  }

  return {
    operation: "query" as const,
    rows: page.map((row) => ({
      rowId: row.item_id,
      values: Object.fromEntries(columnIds.map((columnId) => [
        columnId,
        toSerializableValue(getAnalysisValue(row, columnId)),
      ])),
    })),
    rowCount: rows.length,
    returnedRowCount: page.length,
    offset,
    truncated: offset + page.length < rows.length,
    warnings,
    provenance: provenance(request),
  };
};

const aggregate = (request: DataGridServerAggregateRequest, rows: RetailItem[]) => {
  const analysisRows: DataGridAnalysisRow<RetailItem>[] = rows.map((data) => ({
    rowId: data.item_id,
    data,
  }));
  const { metrics, groupBy } = request.input;
  const { limits } = request.context;
  const compute = (scopeRows: DataGridAnalysisRow<RetailItem>[]) =>
    Object.fromEntries(metrics.map((metric) => [
      metricResultKey(metric),
      aggregateMetric(scopeRows, metric, limits.maxTopValues),
    ]));
  const warnings: DataGridAnalysisWarning[] = [];

  for (const metric of metrics) {
    if (metric.operation !== "top_values" || !metric.columnId) continue;
    const resultLimit = Math.max(1, Math.min(metric.limit ?? 10, limits.maxTopValues));
    const distinctCount = new Set(analysisRows
      .map(({ data }) => getAnalysisValue(data, metric.columnId as string))
      .filter((value) => value != null && value !== "")
      .map((value) => JSON.stringify(toSerializableValue(value)))).size;
    if (distinctCount > resultLimit) {
      warnings.push({
        code: "top_values_truncated",
        message: `${metricResultKey(metric)} returned ${resultLimit} of ${distinctCount} remote values.`,
        limit: resultLimit,
        actual: distinctCount,
      });
    }
  }

  const grouped = new Map<
    string,
    { key: Record<string, DataGridSerializableValue>; rows: DataGridAnalysisRow<RetailItem>[] }
  >();
  for (const row of analysisRows) {
    const key = Object.fromEntries(groupBy.map((columnId) => [
      columnId,
      toSerializableValue(getAnalysisValue(row.data, columnId)),
    ]));
    const serialized = JSON.stringify(key);
    const current = grouped.get(serialized);
    if (current) current.rows.push(row);
    else grouped.set(serialized, { key, rows: [row] });
  }

  const groupCellWidth = Math.max(1, groupBy.length + metrics.length);
  const maxGroupsByCells = Math.max(1, Math.floor(limits.maxCellsPerQuery / groupCellWidth));
  const groupLimit = Math.min(limits.maxGroupsPerAggregate, maxGroupsByCells);
  const allGroups = groupBy.length === 0 ? [] : [...grouped.values()];
  const returnedGroups = allGroups.slice(0, groupLimit);
  if (returnedGroups.length < allGroups.length) {
    warnings.push({
      code: "groups_truncated",
      message: `The remote aggregate returned ${returnedGroups.length} of ${allGroups.length} groups.`,
      limit: returnedGroups.length,
      actual: allGroups.length,
    });
  }

  const supportingRows = analysisRows.slice(0, limits.maxRowsPerQuery);
  if (supportingRows.length < analysisRows.length) {
    warnings.push({
      code: "supporting_rows_truncated",
      message: `Evidence is limited to ${supportingRows.length} of ${analysisRows.length} remote rows.`,
      limit: supportingRows.length,
      actual: analysisRows.length,
    });
  }

  const groups: DataGridAggregateGroup[] = returnedGroups.map((group) => ({
    key: group.key,
    rowCount: group.rows.length,
    metrics: compute(group.rows),
  }));
  return {
    operation: "aggregate" as const,
    rowCount: analysisRows.length,
    metrics: compute(analysisRows),
    groups,
    truncated: returnedGroups.length < allGroups.length,
    supportingRowIds: supportingRows.map((row) => row.rowId),
    warnings,
    provenance: provenance(request),
  };
};

/**
 * Complete-dataset retail adapter used by the demo and tests. It models the
 * consumer-owned backend layer; the reusable DataGrid remains domain-neutral.
 */
export const fakeRetailServerAnalysis: DataGridServerAnalysisAdapter = {
  id: "fake-retail-analysis",
  capabilities: {
    queryScopes: ["all", "filtered"],
    aggregateScopes: ["all", "filtered"],
  },
  async execute(request) {
    await yieldToAbortSignal(request.signal);
    const rows = orderRows(
      filterRows(mockRetailData, request),
      request.context.querySpec.orderBy,
    );
    if (request.signal.aborted) throw abortError();
    return request.operation === "query" ? query(request, rows) : aggregate(request, rows);
  },
};
