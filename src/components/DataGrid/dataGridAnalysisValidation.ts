import type {
  DataGridAggregateMetric,
  DataGridAggregateQuery,
  DataGridAnalysisWarning,
  DataGridAnalysisWarningCode,
  DataGridDataAccessLimits,
  DataGridDataError,
  DataGridQuery,
  DataGridSerializableValue,
  DataGridSourceColumnSnapshot,
} from "./dataGridApi";
import {
  metricResultKey,
} from "./dataGridAnalysis";
import type {
  DataGridServerAggregatePayload,
  DataGridServerAggregateRequest,
  DataGridServerAnalysisPayload,
  DataGridServerAnalysisRequest,
  DataGridServerQueryPayload,
  DataGridServerQueryRequest,
} from "./dataGridAnalysisContract";

export type DataGridAnalysisValidationResult<T> =
  | { ok: true; value: T; warnings: DataGridAnalysisWarning[] }
  | { ok: false; error: DataGridDataError };

export type DataGridNormalizedAggregateQuery = DataGridAggregateQuery & {
  groupBy: string[];
};

export type NormalizeDataGridQueryOptions = {
  columns: readonly DataGridSourceColumnSnapshot[];
  defaultColumnIds: readonly string[];
  limits: DataGridDataAccessLimits;
};

export type NormalizeDataGridAggregateQueryOptions = {
  columns: readonly DataGridSourceColumnSnapshot[];
  limits: DataGridDataAccessLimits;
};

const warningCodes = new Set<DataGridAnalysisWarningCode>([
  "offset_applied",
  "rows_truncated",
  "groups_truncated",
  "top_values_truncated",
  "limit_clamped",
  "supporting_rows_truncated",
  "view_changed_during_execution",
  "provider_limit_applied",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === "object" && !Array.isArray(value);

const hasExactKeys = (value: Record<string, unknown>, expected: readonly string[]) => {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index]);
};

const hasDuplicates = (values: readonly string[]) => new Set(values).size !== values.length;

const failure = <T>(
  code: DataGridDataError["code"],
  message: string,
  id?: string,
): DataGridAnalysisValidationResult<T> => ({
  ok: false,
  error: { code, message, id },
});

const invalidResponse = <T>(message: string): DataGridAnalysisValidationResult<T> =>
  failure("invalid_analysis_response", message);

export function isDataGridSerializableValue(
  value: unknown,
  seen = new WeakSet<object>(),
): value is DataGridSerializableValue {
  if (value == null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || value instanceof Date || seen.has(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null && !Array.isArray(value)) return false;
  seen.add(value);
  const valid = Array.isArray(value)
    ? value.every((item) => isDataGridSerializableValue(item, seen))
    : Object.values(value).every((item) => isDataGridSerializableValue(item, seen));
  seen.delete(value);
  return valid;
}

export function normalizeDataGridQuery(
  input: DataGridQuery,
  { columns, defaultColumnIds, limits }: NormalizeDataGridQueryOptions,
): DataGridAnalysisValidationResult<Required<DataGridQuery>> {
  const knownIds = new Set(columns.map((column) => column.id));
  const columnIds = [...(input.columnIds ?? defaultColumnIds)];
  if (columnIds.length === 0) {
    return failure("invalid_query", "At least one column is required.");
  }
  if (hasDuplicates(columnIds)) {
    return failure("invalid_query", "Duplicate column ids are not allowed.");
  }
  const unknownColumn = columnIds.find((columnId) => !knownIds.has(columnId));
  if (unknownColumn) {
    return failure("invalid_column", `Unknown source column id: ${unknownColumn}`, unknownColumn);
  }

  const offset = input.offset ?? 0;
  const limit = input.limit ?? limits.maxRowsPerQuery;
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 0) {
    return failure("invalid_query", "offset and limit must be non-negative integers.");
  }
  if (limit > limits.maxRowsPerQuery || limit * columnIds.length > limits.maxCellsPerQuery) {
    return failure(
      "limit_exceeded",
      `Query exceeds the ${limits.maxRowsPerQuery}-row or ${limits.maxCellsPerQuery}-cell limit.`,
    );
  }

  return {
    ok: true,
    value: { scope: input.scope, columnIds, offset, limit },
    warnings: [],
  };
}

export function normalizeDataGridAggregateQuery(
  input: DataGridAggregateQuery,
  { columns, limits }: NormalizeDataGridAggregateQueryOptions,
): DataGridAnalysisValidationResult<DataGridNormalizedAggregateQuery> {
  if (!Array.isArray(input.metrics) || input.metrics.length === 0) {
    return failure("invalid_query", "At least one aggregate metric is required.");
  }
  if (input.metrics.length > limits.maxCellsPerQuery) {
    return failure(
      "limit_exceeded",
      `Aggregate output exceeds the ${limits.maxCellsPerQuery}-cell limit.`,
    );
  }

  const groupBy = [...(input.groupBy ?? [])];
  if (hasDuplicates(groupBy)) {
    return failure("invalid_query", "Duplicate groupBy column ids are not allowed.");
  }
  const columnById = new Map(columns.map((column) => [column.id, column]));
  const referencedColumnIds = [
    ...groupBy,
    ...input.metrics.flatMap((metric) => (metric.columnId ? [metric.columnId] : [])),
  ];
  const unknownColumn = referencedColumnIds.find((columnId) => !columnById.has(columnId));
  if (unknownColumn) {
    return failure("invalid_column", `Unknown source column id: ${unknownColumn}`, unknownColumn);
  }

  const keys = input.metrics.map(metricResultKey);
  if (keys.some((key) => key.trim().length === 0)) {
    return failure("invalid_query", "Aggregate result keys must not be empty.");
  }
  if (hasDuplicates(keys)) {
    return failure("invalid_query", "Aggregate result keys must be unique.");
  }

  const warnings: DataGridAnalysisWarning[] = [];
  const metrics: DataGridAggregateMetric[] = [];
  for (const metric of input.metrics) {
    if (metric.operation !== "count" && !metric.columnId) {
      return failure("invalid_query", `${metric.operation} requires a columnId.`);
    }
    if (metric.columnId) {
      const column = columnById.get(metric.columnId);
      if (!column?.aggregateOperations.includes(metric.operation)) {
        return failure(
          "invalid_query",
          `${metric.operation} is not supported for column ${metric.columnId}.`,
          metric.columnId,
        );
      }
    }

    if (metric.operation !== "top_values") {
      metrics.push({ ...metric });
      continue;
    }
    if (metric.limit != null && !Number.isInteger(metric.limit)) {
      return failure("invalid_query", "top_values limit must be an integer.");
    }
    const effectiveLimit = Math.max(1, Math.min(metric.limit ?? 10, limits.maxTopValues));
    if (metric.limit != null && metric.limit !== effectiveLimit) {
      warnings.push({
        code: "limit_clamped",
        message: `${metricResultKey(metric)} requested ${metric.limit} values; the configured limit is ${effectiveLimit}.`,
        limit: effectiveLimit,
        actual: metric.limit,
      });
    }
    metrics.push({ ...metric, limit: effectiveLimit });
  }

  return {
    ok: true,
    value: { scope: input.scope, metrics, groupBy },
    warnings,
  };
}

const validNonNegativeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const validateWarnings = (value: unknown): value is DataGridAnalysisWarning[] => {
  if (value === undefined) return true;
  if (!Array.isArray(value)) return false;
  return value.every((warning) => {
    if (!isRecord(warning) || !hasExactKeys(
      warning,
      ["code", "message", ...(warning.limit === undefined ? [] : ["limit"]), ...(warning.actual === undefined ? [] : ["actual"])],
    )) return false;
    if (typeof warning.code !== "string" || !warningCodes.has(warning.code as DataGridAnalysisWarningCode)) {
      return false;
    }
    if (typeof warning.message !== "string") return false;
    return (warning.limit === undefined || (typeof warning.limit === "number" && Number.isFinite(warning.limit))) &&
      (warning.actual === undefined || (typeof warning.actual === "number" && Number.isFinite(warning.actual)));
  });
};

const validateProvenance = (value: unknown) => {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  const allowed = new Set(["sourceRevision", "requestFingerprint", "effectiveOrdering"]);
  return Object.entries(value).every(([key, item]) => allowed.has(key) && typeof item === "string");
};

const validateMetricRecord = (
  value: unknown,
  metrics: readonly DataGridAggregateMetric[],
  maxTopValues: number,
) => {
  if (!isRecord(value)) return false;
  const aliases = metrics.map(metricResultKey);
  if (!hasExactKeys(value, aliases)) return false;
  return metrics.every((metric) => {
    const metricValue = value[metricResultKey(metric)];
    if (!isDataGridSerializableValue(metricValue)) return false;
    if (metric.operation !== "top_values") return true;
    if (!Array.isArray(metricValue)) return false;
    const limit = Math.max(1, Math.min(metric.limit ?? 10, maxTopValues));
    return metricValue.length <= limit && metricValue.every((entry) =>
      isRecord(entry) &&
      hasExactKeys(entry, ["value", "count"]) &&
      isDataGridSerializableValue(entry.value) &&
      validNonNegativeInteger(entry.count));
  });
};

export function validateDataGridServerQueryPayload(
  request: DataGridServerQueryRequest,
  payload: unknown,
): DataGridAnalysisValidationResult<DataGridServerQueryPayload> {
  if (!isRecord(payload) || payload.operation !== "query") {
    return invalidResponse("The server analysis response has the wrong operation discriminator.");
  }
  const optionalKeys = [
    ...(payload.warnings === undefined ? [] : ["warnings"]),
    ...(payload.provenance === undefined ? [] : ["provenance"]),
  ];
  if (!hasExactKeys(payload, [
    "operation", "rows", "rowCount", "returnedRowCount", "offset", "truncated", ...optionalKeys,
  ])) {
    return invalidResponse("The server query response contains missing or unexpected fields.");
  }
  if (!validNonNegativeInteger(payload.rowCount) ||
    !validNonNegativeInteger(payload.returnedRowCount) ||
    !validNonNegativeInteger(payload.offset)) {
    return invalidResponse("Server query counts and offset must be non-negative integers.");
  }
  if (typeof payload.truncated !== "boolean" || !Array.isArray(payload.rows)) {
    return invalidResponse("The server query response has invalid rows or truncation state.");
  }
  if (!validateWarnings(payload.warnings) || !validateProvenance(payload.provenance)) {
    return invalidResponse("The server query response has invalid warnings or provenance.");
  }

  const columnIds = request.input.columnIds;
  const rowIds = new Set<string>();
  for (const row of payload.rows) {
    if (!isRecord(row) || !hasExactKeys(row, ["rowId", "values"]) ||
      typeof row.rowId !== "string" || row.rowId.length === 0 || !isRecord(row.values) ||
      !hasExactKeys(row.values, columnIds) ||
      !Object.values(row.values).every((value) => isDataGridSerializableValue(value))) {
      return invalidResponse("The server query response contains an invalid row projection.");
    }
    if (rowIds.has(row.rowId)) {
      return invalidResponse(`The server query response contains duplicate row id: ${row.rowId}`);
    }
    rowIds.add(row.rowId);
  }

  if (payload.returnedRowCount !== payload.rows.length) {
    return invalidResponse("returnedRowCount must match the number of returned rows.");
  }
  if (payload.offset !== request.input.offset) {
    return invalidResponse("The server query response offset does not match the request.");
  }
  if (payload.rows.length > request.input.limit ||
    payload.rows.length > request.context.limits.maxRowsPerQuery ||
    payload.rows.length * columnIds.length > request.context.limits.maxCellsPerQuery) {
    return invalidResponse("The server query response exceeds the requested output limits.");
  }
  if (payload.rows.length > 0 && payload.offset + payload.rows.length > payload.rowCount) {
    return invalidResponse("The server query response rowCount is inconsistent with its rows.");
  }
  const hasRemainingRows = payload.offset < payload.rowCount &&
    payload.offset + payload.rows.length < payload.rowCount;
  if (payload.truncated !== hasRemainingRows) {
    return invalidResponse("The server query truncation flag is inconsistent with rowCount.");
  }

  const value = payload as unknown as DataGridServerQueryPayload;
  return { ok: true, value, warnings: [...(value.warnings ?? [])] };
}

export function validateDataGridServerAggregatePayload(
  request: DataGridServerAggregateRequest,
  payload: unknown,
): DataGridAnalysisValidationResult<DataGridServerAggregatePayload> {
  if (!isRecord(payload) || payload.operation !== "aggregate") {
    return invalidResponse("The server analysis response has the wrong operation discriminator.");
  }
  const optionalKeys = [
    ...(payload.supportingRowIds === undefined ? [] : ["supportingRowIds"]),
    ...(payload.warnings === undefined ? [] : ["warnings"]),
    ...(payload.provenance === undefined ? [] : ["provenance"]),
  ];
  if (!hasExactKeys(payload, [
    "operation", "rowCount", "metrics", "groups", "truncated", ...optionalKeys,
  ])) {
    return invalidResponse("The server aggregate response contains missing or unexpected fields.");
  }
  if (!validNonNegativeInteger(payload.rowCount) || typeof payload.truncated !== "boolean" ||
    !Array.isArray(payload.groups) ||
    !validateMetricRecord(payload.metrics, request.input.metrics, request.context.limits.maxTopValues) ||
    !validateWarnings(payload.warnings) || !validateProvenance(payload.provenance)) {
    return invalidResponse("The server aggregate response has invalid counts, metrics, or metadata.");
  }

  const groupBy = request.input.groupBy;
  const maxGroupCells = Math.max(
    1,
    Math.floor(
      request.context.limits.maxCellsPerQuery /
        Math.max(1, request.input.metrics.length + groupBy.length),
    ),
  );
  if (payload.groups.length > request.context.limits.maxGroupsPerAggregate ||
    payload.groups.length > maxGroupCells) {
    return invalidResponse("The server aggregate response exceeds the configured group or cell limit.");
  }

  const groupKeys = new Set<string>();
  for (const group of payload.groups) {
    if (!isRecord(group) || !hasExactKeys(group, ["key", "rowCount", "metrics"]) ||
      !isRecord(group.key) || !hasExactKeys(group.key, groupBy) ||
      !Object.values(group.key).every((value) => isDataGridSerializableValue(value)) ||
      !validNonNegativeInteger(group.rowCount) || group.rowCount > payload.rowCount ||
      !validateMetricRecord(group.metrics, request.input.metrics, request.context.limits.maxTopValues)) {
      return invalidResponse("The server aggregate response contains an invalid group.");
    }
    const serializedKey = JSON.stringify(group.key);
    if (groupKeys.has(serializedKey)) {
      return invalidResponse("The server aggregate response contains duplicate group keys.");
    }
    groupKeys.add(serializedKey);
  }

  if (payload.supportingRowIds !== undefined) {
    if (!Array.isArray(payload.supportingRowIds) ||
      payload.supportingRowIds.some((id) => typeof id !== "string" || id.length === 0) ||
      hasDuplicates(payload.supportingRowIds) ||
      payload.supportingRowIds.length > request.context.limits.maxRowsPerQuery) {
      return invalidResponse("The server aggregate response contains invalid or over-limit evidence ids.");
    }
  }

  const value = payload as unknown as DataGridServerAggregatePayload;
  return { ok: true, value, warnings: [...(value.warnings ?? [])] };
}

export function validateDataGridServerAnalysisPayload(
  request: DataGridServerAnalysisRequest,
  payload: unknown,
): DataGridAnalysisValidationResult<DataGridServerAnalysisPayload> {
  return request.operation === "query"
    ? validateDataGridServerQueryPayload(request, payload)
    : validateDataGridServerAggregatePayload(request, payload);
}
