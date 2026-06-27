import type { SortingFn } from "@tanstack/react-table";
import type { GridFilterOperator, GridFilterType, GridFilterValue } from "../../types/grid";
import { toDate } from "../../utils/formatters";

const hasDateBounds = (value: object): value is { from?: unknown; to?: unknown } =>
  "from" in value || "to" in value;

const isOperatorFilterValue = (value: unknown): value is GridFilterValue =>
  Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      "operator" in value &&
      typeof (value as { operator?: unknown }).operator === "string",
  );

export type MatchOptions = {
  filterType?: GridFilterType;
  operator?: GridFilterOperator;
  /** Precomputed formatted text, used by the "text" (contains) filter. */
  searchText?: string;
};

export const defaultOperatorForFilterType = (filterType: GridFilterType = "select"): GridFilterOperator => {
  if (filterType === "multiSelect") return "isAnyOf";
  if (filterType === "range" || filterType === "date") return "between";
  if (filterType === "text") return "contains";
  return "is";
};

export const resolveFilterClause = (
  filterValue: unknown,
  options?: Pick<MatchOptions, "filterType" | "operator">,
): { operator: GridFilterOperator; value: unknown; wrapped: boolean } => {
  if (isOperatorFilterValue(filterValue)) {
    return {
      operator: filterValue.operator,
      value: filterValue.value,
      wrapped: true,
    };
  }
  return {
    operator: options?.operator ?? defaultOperatorForFilterType(options?.filterType),
    value: filterValue,
    wrapped: false,
  };
};

export const isFilterValueActive = (filterValue: unknown, options?: Pick<MatchOptions, "filterType" | "operator">) => {
  const { operator, value } = resolveFilterClause(filterValue, options);
  if (operator === "isEmpty" || operator === "isNotEmpty") {
    return true;
  }
  if (value == null || value === "") {
    return false;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((bound) => bound != null && bound !== "");
  }
  return true;
};

const isEmptyCell = (raw: unknown) => raw == null || raw === "";

const compareText = (raw: unknown, value: unknown, searchText?: string) => {
  const haystack = (searchText ?? String(raw ?? "")).toLowerCase();
  const needle = String(value ?? "").toLowerCase();
  return { haystack, needle };
};

const compareNumber = (raw: unknown) => {
  const numericValue = Number(raw);
  return Number.isFinite(numericValue) ? numericValue : null;
};

const getRange = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as { min?: number | null; max?: number | null })
    : {};

const getDateRange = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as { from?: unknown; to?: unknown })
    : {};

const isDateOnlyInput = (value: unknown) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

const localDayStart = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

const localDayEnd = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime() - 1;

const toDateTime = (value: unknown, boundary: "start" | "end" = "start") => {
  const date = toDate(value);
  if (!date) {
    return null;
  }
  if (!isDateOnlyInput(value)) {
    return date.getTime();
  }
  return boundary === "end" ? localDayEnd(date) : localDayStart(date);
};

const dateEquals = (cell: number, value: unknown) => {
  const start = toDateTime(value, "start");
  const end = toDateTime(value, "end");
  if (start == null || end == null) {
    return false;
  }
  return isDateOnlyInput(value) ? cell >= start && cell <= end : cell === start;
};

const toBoolean = (value: unknown) => {
  if (value === true || String(value).toLowerCase() === "true") {
    return true;
  }
  if (value === false || String(value).toLowerCase() === "false") {
    return false;
  }
  return null;
};

// Unified column-filter predicate, shared by the grid filterFn and the pivot
// source-row loop so both paths stay in lockstep. Dispatches by filter-value
// shape/operator, preserving the older raw value shapes while supporting the
// newer `{ operator, value }` filter clause:
//   - date {from,to}: normalized via toDate (checked BEFORE the {min,max}
//     range branch); null/unparseable cell is excluded.
//   - array: multi-select membership.
//   - object {min,max}: numeric range.
//   - string + filterType "text": case-insensitive contains against the
//     formatted text (searchText), avoiding leakage into the raw value.
//   - string otherwise: exact match (select; "Men" != "Women").
export const matchesFilterValue = (raw: unknown, filterValue: unknown, options?: MatchOptions) => {
  const { operator, value } = resolveFilterClause(filterValue, options);

  if (operator === "isEmpty") {
    return isEmptyCell(raw);
  }
  if (operator === "isNotEmpty") {
    return !isEmptyCell(raw);
  }

  if (!isFilterValueActive(filterValue, options)) {
    return true;
  }

  // An empty object ({}) carries no constraint — treat as "no filter" so a
  // stale/programmatic controlled value never routes into the numeric range
  // branch and excludes every row.
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  ) {
    return true;
  }

  if (
    options?.filterType === "date" ||
    (value !== null && typeof value === "object" && !Array.isArray(value) && hasDateBounds(value))
  ) {
    const cell = toDate(raw)?.getTime() ?? null;
    if (cell == null) {
      return false;
    }
    if (operator === "equals" || operator === "is") {
      return dateEquals(cell, value);
    }
    if (operator === "notEquals" || operator === "isNot") {
      return !dateEquals(cell, value);
    }
    const { from, to } = getDateRange(value);
    const singleFromTime = toDateTime(value, "start");
    const singleToTime = toDateTime(value, "end");
    const fromTime = toDateTime(from, "start") ?? singleFromTime;
    const toTime = toDateTime(to, "end") ?? singleToTime;
    if (operator === "before") {
      return fromTime != null && cell < fromTime;
    }
    if (operator === "onOrBefore") {
      return toTime != null && cell <= toTime;
    }
    if (operator === "after") {
      return toTime != null && cell > toTime;
    }
    if (operator === "onOrAfter") {
      return fromTime != null && cell >= fromTime;
    }
    if (fromTime != null && cell < fromTime) {
      return false;
    }
    if (toTime != null && cell > toTime) {
      return false;
    }
    return true;
  }

  if (Array.isArray(value)) {
    const selected = value.map(String);
    const included = selected.includes(String(raw ?? ""));
    return operator === "isNoneOf" ? !included : selected.length === 0 || included;
  }

  if (options?.filterType === "boolean") {
    const cell = toBoolean(raw);
    const target = toBoolean(value);
    if (cell == null || target == null) {
      return false;
    }
    return operator === "isNot" || operator === "notEquals" ? cell !== target : cell === target;
  }

  if (options?.filterType === "range" || typeof value === "object") {
    const numericValue = compareNumber(raw);
    if (numericValue == null) {
      return false;
    }
    if (operator === "equals" || operator === "is") {
      const target = Number(value);
      return Number.isFinite(target) && numericValue === target;
    }
    if (operator === "notEquals" || operator === "isNot") {
      const target = Number(value);
      return !Number.isFinite(target) || numericValue !== target;
    }
    const { min, max } = getRange(value);
    const lower = min ?? (Number.isFinite(Number(value)) ? Number(value) : undefined);
    if (operator === "gt") {
      return lower != null && numericValue > lower;
    }
    if (operator === "gte") {
      return lower != null && numericValue >= lower;
    }
    if (operator === "lt") {
      return lower != null && numericValue < lower;
    }
    if (operator === "lte") {
      return lower != null && numericValue <= lower;
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
    const { haystack, needle } = compareText(raw, value, options.searchText);
    if (operator === "notContains") {
      return !haystack.includes(needle);
    }
    if (operator === "startsWith") {
      return haystack.startsWith(needle);
    }
    if (operator === "endsWith") {
      return haystack.endsWith(needle);
    }
    if (operator === "equals" || operator === "is") {
      return haystack === needle;
    }
    if (operator === "notEquals" || operator === "isNot") {
      return haystack !== needle;
    }
    return haystack.includes(needle);
  }

  if (operator === "isNot" || operator === "notEquals") {
    return String(raw ?? "") !== String(value);
  }

  return String(raw ?? "") === String(value);
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

export const booleanSortingFn: SortingFn<unknown> = (rowA, rowB, columnId) => {
  const a = toBoolean(rowA.getValue(columnId));
  const b = toBoolean(rowB.getValue(columnId));
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return Number(a) - Number(b);
};
