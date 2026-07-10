import type {
  GridDataType,
  GridFilterOperator,
  GridFilterType,
} from "../../types/grid";

export const defaultFilterOperatorsByType: Record<GridFilterType, GridFilterOperator[]> = {
  select: ["is", "isNot", "isEmpty", "isNotEmpty"],
  boolean: ["is", "isNot", "isEmpty", "isNotEmpty"],
  multiSelect: ["isAnyOf", "isNoneOf", "isEmpty", "isNotEmpty"],
  text: [
    "contains",
    "notContains",
    "equals",
    "notEquals",
    "startsWith",
    "endsWith",
    "isEmpty",
    "isNotEmpty",
  ],
  range: ["between", "equals", "notEquals", "gt", "gte", "lt", "lte", "isEmpty", "isNotEmpty"],
  date: [
    "between",
    "equals",
    "notEquals",
    "before",
    "onOrBefore",
    "after",
    "onOrAfter",
    "isEmpty",
    "isNotEmpty",
  ],
};

export const resolveFilterOperators = (
  filterType: GridFilterType,
  configured?: GridFilterOperator[],
) => configured?.length ? configured : defaultFilterOperatorsByType[filterType];

// Maps a column's value semantics (dataType) to the control that fits it best.
// This is the type-awareness the filter layer previously lacked (it defaulted
// every column to "select"). Pure + dependency-free so it is shared by the grid
// (DataGrid.tsx) and the demo server simulation (fakeServer.ts).
export const defaultFilterTypeForDataType = (dataType: GridDataType): GridFilterType => {
  switch (dataType) {
    case "number":
    case "currency":
    case "percent":
      return "range";
    case "date":
      return "date";
    case "status":
      return "multiSelect";
    case "boolean":
      return "boolean";
    case "text":
      return "text";
    default: {
      const _exhaustive: never = dataType;
      return "text";
    }
  }
};

export const DEFAULT_FACET_THRESHOLD = 12;

export type ResolveFilterTypeArgs = {
  dataType: GridDataType;
  /** Distinct value count over the data; omit in server mode (unknown from one page). */
  distinctCount?: number;
  /** True when the consumer supplied an explicit `options` list. */
  hasStaticOptions?: boolean;
  isServerMode?: boolean;
  /** Text columns with <= this many distinct values auto-facet. Default 12. */
  facetThreshold?: number;
};

// Refines the dataType default with cardinality awareness. Only `text` is
// data-dependent: it becomes a faceted multiSelect when the value set is small
// (or static options are supplied), otherwise a free-text contains box. `status`
// is always categorical. Everything else uses the dataType default verbatim.
export const resolveFilterType = ({
  dataType,
  distinctCount,
  hasStaticOptions = false,
  isServerMode = false,
  facetThreshold = DEFAULT_FACET_THRESHOLD,
}: ResolveFilterTypeArgs): GridFilterType => {
  if (dataType === "text") {
    if (hasStaticOptions) return "multiSelect";
    if (!isServerMode && distinctCount != null && distinctCount <= facetThreshold) {
      return "multiSelect";
    }
    return "text";
  }
  return defaultFilterTypeForDataType(dataType);
};
