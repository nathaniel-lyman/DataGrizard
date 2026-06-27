// Pure, state-free helpers used by the DataGrid engine. Each is generic over
// the consumer row type (`TData extends object`) and free of React state, so
// they live here rather than inside the component. Domain-neutral by design.
import type { ColumnPinningState, Row, Updater } from "@tanstack/react-table";
import { PIVOT_ROW_LABEL_COLUMN_ID, type PivotRow } from "./pivot";

// Resolves a TanStack `Updater` (a value or an updater fn) against the current value.
export const resolveUpdater = <TValue,>(updater: Updater<TValue>, current: TValue): TValue =>
  typeof updater === "function" ? (updater as (old: TValue) => TValue)(current) : updater;

export const uniqueIds = (ids: string[]) => Array.from(new Set(ids.filter(Boolean)));

// Reconciles column pinning so locked-left ids always pin left, dedupes, and
// keeps an id from appearing in both sides.
export const normalizeColumnPinning = (
  pinning: ColumnPinningState | undefined,
  lockedLeftIds: string[] = [],
): ColumnPinningState => {
  const right = uniqueIds(pinning?.right ?? []).filter((id) => !lockedLeftIds.includes(id));
  const left = uniqueIds([...(lockedLeftIds ?? []), ...(pinning?.left ?? [])]).filter(
    (id) => !right.includes(id),
  );

  return { left, right };
};

export const uniqueColumnValues = <TData extends object>(
  data: TData[],
  key: Extract<keyof TData, string>,
) => Array.from(new Set(data.map((row) => String(row[key] ?? "")))).filter(Boolean).sort();

// Min/max over a column's finite numeric cells, for range-filter input bounds.
// Returns null when the column has no finite values (so callers can skip bounds).
export const columnNumericExtent = <TData extends object>(
  data: TData[],
  key: Extract<keyof TData, string>,
): { min: number; max: number } | null => {
  let min = Infinity;
  let max = -Infinity;
  for (const row of data) {
    const raw = row[key];
    if (raw == null || raw === "") continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return Number.isFinite(min) ? { min, max } : null;
};

export const isPivotRow = <TData extends object>(row: TData | PivotRow<TData>): row is PivotRow<TData> =>
  "__pivot" in row && row.__pivot === true;

export const isGeneratedPivotColumnId = (columnId: string) =>
  columnId === PIVOT_ROW_LABEL_COLUMN_ID || columnId.startsWith("measure:");

export const flattenExpandedRows = <TData extends object>(rows: Row<TData>[]): Row<TData>[] =>
  rows.flatMap((row) =>
    row.getIsGrouped() && row.getIsExpanded()
      ? [row, ...flattenExpandedRows(row.subRows)]
      : [row],
  );

export const collectExpandableGroupIds = <TData extends object>(
  rows: Row<TData>[],
  groupingDepth: number,
): string[] =>
  rows.flatMap((row) => {
    if (!row.getIsGrouped()) {
      return [];
    }

    const childIds = collectExpandableGroupIds(row.subRows, groupingDepth);
    return row.depth < groupingDepth - 1 ? [row.id, ...childIds] : childIds;
  });

export const getSelectionStatus = (rowIds: string[], selectedIds: Set<string>) => {
  const selectedCount = rowIds.filter((rowId) => selectedIds.has(rowId)).length;

  return {
    allSelected: rowIds.length > 0 && selectedCount === rowIds.length,
    someSelected: selectedCount > 0 && selectedCount < rowIds.length,
  };
};
