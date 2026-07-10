import type {
  DataGridAggregateMetric,
  DataGridSerializableValue,
} from "./dataGridApi";

export type DataGridAnalysisRow<TData extends object> = {
  rowId: string;
  data: TData;
};

export const toSerializableValue = (
  value: unknown,
  seen = new WeakSet<object>(),
): DataGridSerializableValue => {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (Array.isArray(value)) return value.map((item) => toSerializableValue(item, seen));
  if (typeof value !== "object") return null;
  if (seen.has(value)) return null;
  seen.add(value);
  const result = Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, toSerializableValue(item, seen)]),
  );
  seen.delete(value);
  return result;
};

export const getAnalysisValue = <TData extends object>(row: TData, columnId: string) =>
  (row as Record<string, unknown>)[columnId];

const numericValues = <TData extends object>(
  rows: DataGridAnalysisRow<TData>[],
  columnId: string,
) =>
  rows
    .map(({ data }) => getAnalysisValue(data, columnId))
    .filter((value) => value != null && value !== "")
    .map(Number)
    .filter(Number.isFinite);

const comparableValues = <TData extends object>(
  rows: DataGridAnalysisRow<TData>[],
  columnId: string,
): DataGridSerializableValue[] =>
  rows
    .map(({ data }) => getAnalysisValue(data, columnId))
    .filter((value) => value != null && value !== "")
    .map((value) => toSerializableValue(value));

const compareSerializable = (left: DataGridSerializableValue, right: DataGridSerializableValue) => {
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right));
};

export const metricResultKey = (metric: DataGridAggregateMetric) =>
  metric.as ?? `${metric.operation}:${metric.columnId ?? "rows"}`;

export const aggregateMetric = <TData extends object>(
  rows: DataGridAnalysisRow<TData>[],
  metric: DataGridAggregateMetric,
  maxTopValues: number,
): DataGridSerializableValue => {
  if (metric.operation === "count" && !metric.columnId) return rows.length;
  const columnId = metric.columnId;
  if (!columnId) return null;

  if (metric.operation === "count") {
    return rows.filter(({ data }) => {
      const value = getAnalysisValue(data, columnId);
      return value != null && value !== "";
    }).length;
  }

  if (metric.operation === "distinct_count" || metric.operation === "top_values") {
    const counts = new Map<string, { value: DataGridSerializableValue; count: number }>();
    comparableValues(rows, columnId).forEach((value) => {
      const key = JSON.stringify(value);
      const current = counts.get(key);
      counts.set(key, { value, count: (current?.count ?? 0) + 1 });
    });
    if (metric.operation === "distinct_count") return counts.size;
    return [...counts.values()]
      .sort((left, right) => right.count - left.count || String(left.value).localeCompare(String(right.value)))
      .slice(0, Math.max(1, Math.min(metric.limit ?? 10, maxTopValues)))
      .map(({ value, count }) => ({ value, count }));
  }

  const numeric = numericValues(rows, columnId);
  if (metric.operation === "sum") return numeric.reduce((total, value) => total + value, 0);
  if (metric.operation === "average") {
    return numeric.length === 0
      ? null
      : numeric.reduce((total, value) => total + value, 0) / numeric.length;
  }

  const comparable = comparableValues(rows, columnId).sort(compareSerializable);
  const min = comparable[0] ?? null;
  const max = comparable[comparable.length - 1] ?? null;
  if (metric.operation === "min") return min;
  if (metric.operation === "max") return max;
  return { min, max };
};
