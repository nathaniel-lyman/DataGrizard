import type { DataGridCardConfig } from "../../types/grid";
import { isNumericDataType, type AnyColumnConfig } from "./cells";

export type CardRoles<TData> = {
  title: AnyColumnConfig<TData> | null;
  badge: AnyColumnConfig<TData> | null;
  subtitle: AnyColumnConfig<TData>[];
  metrics: AnyColumnConfig<TData>[];
  meta: AnyColumnConfig<TData>[];
};

const DEFAULT_MAX_METRICS = 3;
const MAX_SUBTITLE_COLUMNS = 2;

// Assigns every visible leaf column a card role. Overrides claim their columns
// first (an override naming a column the grid can't see is ignored); the
// heuristic fills any role still empty from the remaining columns in visible
// order. Columns never disappear: anything unclaimed lands in `meta`, so the
// card always shows the same fields the table would.
export const composeCardRoles = <TData extends object>(
  columns: AnyColumnConfig<TData>[],
  overrides?: DataGridCardConfig<TData>,
): CardRoles<TData> => {
  const byKey = new Map(columns.map((column) => [column.accessorKey as string, column]));
  const claimed = new Set<string>();

  const claim = (key: string | undefined): AnyColumnConfig<TData> | null => {
    if (!key || claimed.has(key)) return null;
    const column = byKey.get(key);
    if (!column) return null;
    claimed.add(key);
    return column;
  };
  const claimAll = (columnKeys: string[]): AnyColumnConfig<TData>[] =>
    columnKeys
      .map((key) => claim(key))
      .filter((column): column is AnyColumnConfig<TData> => column !== null);
  const remaining = () => columns.filter((column) => !claimed.has(column.accessorKey as string));

  // 1. Overrides claim first, in role order.
  let title = claim(overrides?.title);
  let badge = claim(overrides?.badge);
  const subtitle = claimAll(overrides?.subtitle ?? []);
  const metrics = claimAll(overrides?.metrics ?? []);
  const meta = claimAll(overrides?.meta ?? []);

  // 2. The heuristic fills roles the overrides left empty, visible order.
  if (!title) {
    title =
      claim(remaining().find((column) => column.dataType === "text")?.accessorKey) ??
      claim(remaining().find((column) => column.dataType !== "status")?.accessorKey);
  }
  if (!badge) {
    badge = claim(remaining().find((column) => column.dataType === "status")?.accessorKey);
  }
  if (!overrides?.subtitle) {
    subtitle.push(
      ...claimAll(
        remaining()
          .filter((column) => column.dataType === "text")
          .slice(0, MAX_SUBTITLE_COLUMNS)
          .map((column) => column.accessorKey as string),
      ),
    );
  }
  if (!overrides?.metrics) {
    const cap = overrides?.maxMetrics ?? DEFAULT_MAX_METRICS;
    metrics.push(
      ...claimAll(
        remaining()
          .filter((column) => isNumericDataType(column.dataType))
          .slice(0, cap)
          .map((column) => column.accessorKey as string),
      ),
    );
  }

  // 3. Everything left (dates, booleans, overflow text/numerics) → meta.
  meta.push(...claimAll(remaining().map((column) => column.accessorKey as string)));

  return { title, badge, subtitle, metrics, meta };
};
