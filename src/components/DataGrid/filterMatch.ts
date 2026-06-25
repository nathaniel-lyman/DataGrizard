import type { SortingFn } from "@tanstack/react-table";
import type { GridFilterType } from "../../types/grid";
import { toDate } from "../../utils/formatters";

const hasDateBounds = (value: object): value is { from?: unknown; to?: unknown } =>
  "from" in value || "to" in value;

export type MatchOptions = {
  filterType?: GridFilterType;
  /** Precomputed formatted text, used by the "text" (contains) filter. */
  searchText?: string;
};

// Unified column-filter predicate, shared by the grid filterFn and the pivot
// source-row loop so both paths stay in lockstep. Dispatches by filter-value
// shape, with `filterType` disambiguating the two string cases (text contains
// vs select exact):
//   - date {from,to}: normalized via toDate (checked BEFORE the {min,max}
//     range branch); null/unparseable cell is excluded.
//   - array: multi-select membership.
//   - object {min,max}: numeric range.
//   - string + filterType "text": case-insensitive contains against the
//     formatted text (searchText), avoiding leakage into the raw value.
//   - string otherwise: exact match (select; "Men" != "Women").
export const matchesFilterValue = (raw: unknown, filterValue: unknown, options?: MatchOptions) => {
  if (filterValue == null || filterValue === "") {
    return true;
  }

  // An empty object ({}) carries no constraint — treat as "no filter" so a
  // stale/programmatic controlled value never routes into the numeric range
  // branch and excludes every row.
  if (
    typeof filterValue === "object" &&
    !Array.isArray(filterValue) &&
    Object.keys(filterValue).length === 0
  ) {
    return true;
  }

  if (typeof filterValue === "object" && !Array.isArray(filterValue) && hasDateBounds(filterValue)) {
    const { from, to } = filterValue;
    const cell = toDate(raw)?.getTime();
    if (cell == null) {
      return false;
    }
    const fromTime = toDate(from)?.getTime();
    const toTime = toDate(to)?.getTime();
    if (fromTime != null && cell < fromTime) {
      return false;
    }
    if (toTime != null && cell > toTime) {
      return false;
    }
    return true;
  }

  if (Array.isArray(filterValue)) {
    return filterValue.length === 0 || filterValue.map(String).includes(String(raw ?? ""));
  }

  if (typeof filterValue === "object") {
    const { min, max } = filterValue as { min?: number | null; max?: number | null };
    const numericValue = Number(raw);
    if (!Number.isFinite(numericValue)) {
      return false;
    }
    if (min != null && numericValue < min) {
      return false;
    }
    if (max != null && numericValue > max) {
      return false;
    }
    return true;
  }

  if (options?.filterType === "text") {
    const haystack = (options.searchText ?? String(raw ?? "")).toLowerCase();
    return haystack.includes(String(filterValue).toLowerCase());
  }

  return String(raw ?? "") === String(filterValue);
};

// Sorts date columns chronologically across mixed representations (Date / ISO
// string / epoch ms). Blank/unparseable dates sort to the END under ascending
// order (and therefore to the top under descending) — a single comparator that
// keeps date columns on `accessorKey`, so the typed per-key callbacks still
// receive the raw value rather than a normalized Date.
export const dateSortingFn: SortingFn<unknown> = (rowA, rowB, columnId) => {
  const a = toDate(rowA.getValue(columnId))?.getTime() ?? null;
  const b = toDate(rowB.getValue(columnId))?.getTime() ?? null;
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
};
