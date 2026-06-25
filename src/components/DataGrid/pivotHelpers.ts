// Pure id / value / aggregation primitives for pivot materialization. No JSX
// and no React state; types pulled from pivot.tsx are import-type-only (erased
// at build, so there is no runtime cycle with the materializer).
import type { ExpandedState } from "@tanstack/react-table";
import { type ReactNode } from "react";
import type {
  DataGridPivotAggregationContext,
  DataGridPivotMeasure,
  PivotGroupPathSegment,
} from "./pivot";

// A source column descriptor as seen by the pivot materializer (accessor +
// optional grouping/format overrides). Internal to the pivot engine.
export type PivotSourceColumn<TData extends object> = {
  accessorKey: Extract<keyof TData, string>;
  header: string;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  enablePinning?: boolean;
  getGroupingValue?: (row: TData) => unknown;
  formatGroupingValue?: (value: unknown, rows: TData[]) => ReactNode;
};

export const stableValueKey = (value: unknown) => {
  if (value == null || value === "") {
    return "blank";
  }

  return encodeURIComponent(String(value));
};

export const segmentId = (segment: PivotGroupPathSegment) =>
  `${segment.columnId}=${segment.stableKey}`;

export const groupId = (path: PivotGroupPathSegment[]) =>
  `pivot:group|${path.map(segmentId).join("|")}`;

export const measureColumnId = (
  measureId: string,
  columnPath: PivotGroupPathSegment[] = [],
  totalLevel?: "subtotal" | "grandTotal",
) =>
  [
    `measure:${measureId}`,
    ...columnPath.map((segment) => `col:${segmentId(segment)}`),
    ...(totalLevel ? [`total:${totalLevel}`] : []),
  ].join("|");

export const leafId = <TData extends object>(
  row: TData,
  index: number,
  getRowId: ((row: TData, index: number) => string) | undefined,
) => `pivot:leaf|source=${encodeURIComponent(getRowId?.(row, index) ?? String(index))}`;

export const isExpanded = (expanded: ExpandedState | undefined, rowId: string) =>
  expanded === true || Boolean(expanded && typeof expanded === "object" && expanded[rowId]);

export const getSourceValue = <TData extends object>(
  row: TData,
  column: PivotSourceColumn<TData> | undefined,
) => {
  if (!column) {
    return undefined;
  }
  return column.getGroupingValue ? column.getGroupingValue(row) : row[column.accessorKey];
};

export const asText = (value: ReactNode) => {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  return "";
};

export const aggregateMeasure = <TData extends object>(
  rows: TData[],
  measure: DataGridPivotMeasure<TData>,
  context: DataGridPivotAggregationContext<TData>,
) => {
  if (typeof measure.aggregation === "function") {
    return measure.aggregation(rows, context);
  }

  if (measure.aggregation === "count") {
    return rows.length;
  }

  const values = rows
    .map((row) => (measure.columnId ? Number(row[measure.columnId]) : Number.NaN))
    .filter(Number.isFinite);

  if (measure.aggregation === "sum") {
    return values.reduce((total, value) => total + value, 0);
  }
  if (measure.aggregation === "avg") {
    return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
  }
  if (measure.aggregation === "min") {
    return values.length ? Math.min(...values) : null;
  }
  if (measure.aggregation === "max") {
    return values.length ? Math.max(...values) : null;
  }
  return null;
};

export const sumNumericValues = (values: unknown[]) => {
  const numericValues = values.map(Number).filter(Number.isFinite);
  return numericValues.reduce((total, value) => total + value, 0);
};
