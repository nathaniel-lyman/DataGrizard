import type { ReactNode } from "react";

export type GridDataType = "text" | "number" | "currency" | "percent" | "status" | "date";

export type GridConditionalFormat<TValue = unknown, TData = unknown> = {
  when: (value: TValue, row: TData) => boolean;
  className: string;
};

/** Props handed to a custom cell editor via `column.renderEditCell`. */
export type GridEditCellProps<TData, K extends Extract<keyof TData, string>> = {
  value: TData[K];
  row: TData;
  onChange: (next: TData[K]) => void;
  commit: () => void;
  cancel: () => void;
  error: string | null;
};

type GridColumnConfigForKey<TData, K extends Extract<keyof TData, string>> = {
  accessorKey: K;
  header: string;
  dataType: GridDataType;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  pinned?: "left" | "right";
  enablePinning?: boolean;
  enableGrouping?: boolean;
  /** Date columns: Intl options for this column's display, overriding the grid-level `dateFormat`. */
  dateFormat?: Intl.DateTimeFormatOptions;
  /** Cell value is typed as the field's own type, e.g. `TData["revenue"]`. */
  formatValue?: (value: TData[K], row: TData) => ReactNode;
  formatGroupingValue?: (value: TData[K], rows: TData[]) => ReactNode;
  getGroupingValue?: (row: TData) => unknown;
  getCellClassName?: (value: TData[K], row: TData) => string;
  getStatusClassName?: (value: TData[K], row: TData) => string;
  /**
   * Declarative alternative to getStatusClassName: maps a raw status value to a
   * pill className. getStatusClassName, when provided, takes precedence.
   */
  statusStyles?: Record<string, string>;
  /**
   * Declarative conditional cell formatting. Every rule whose `when` predicate
   * matches contributes its className. Composes with getCellClassName.
   */
  conditionalFormats?: GridConditionalFormat<TData[K], TData>[];
  /** Whether this column's cells can be edited (static or per-row). */
  editable?: boolean | ((row: TData) => boolean);
  /** Returns an error message (non-null blocks commit). When provided, it fully
   * owns validation — the built-in numeric/date checks are skipped. */
  validate?: (value: TData[K], row: TData) => string | null;
  /** Converts the editor's string input to the typed value. Defaults per dataType. */
  parseValue?: (input: string) => TData[K];
  /** Full editor override; receives value/onChange/commit/cancel/error. */
  renderEditCell?: (props: GridEditCellProps<TData, K>) => ReactNode;
};

/**
 * A column definition. Distributes over the keys of `TData` so each column's
 * value-typed callbacks (formatValue, getCellClassName, conditionalFormats…)
 * receive `TData[accessorKey]` rather than `unknown`.
 */
export type GridColumnConfig<TData> = {
  [K in Extract<keyof TData, string>]: GridColumnConfigForKey<TData, K>;
}[Extract<keyof TData, string>];

export type GridFilterType = "select" | "multiSelect" | "range" | "text" | "date";

export type GridFilterOperator =
  | "is"
  | "isNot"
  | "isAnyOf"
  | "isNoneOf"
  | "contains"
  | "notContains"
  | "startsWith"
  | "endsWith"
  | "equals"
  | "notEquals"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between"
  | "before"
  | "onOrBefore"
  | "after"
  | "onOrAfter"
  | "isEmpty"
  | "isNotEmpty";

export type GridFilterValue = {
  operator: GridFilterOperator;
  value?: unknown;
};

export type GridFilterConfig<TData> = {
  accessorKey: Extract<keyof TData, string>;
  label: string;
  /** Defaults to "select". */
  filterType?: GridFilterType;
  /** Default operator for this filter. If omitted, the filter type chooses one. */
  operator?: GridFilterOperator;
  /** Restrict which operators appear in the filter UI. */
  operators?: GridFilterOperator[];
  options?: string[];
  formatOption?: (value: string) => string;
  /** Range-filter bounds (filterType: "range"). */
  min?: number;
  max?: number;
  step?: number;
  /** Placeholder for the text filter input (filterType: "text"). */
  placeholder?: string;
  /** Display options for date-filter bounds (filterType: "date"). */
  dateFormat?: Intl.DateTimeFormatOptions;
  /** Show quick date presets (filterType: "date"). Defaults to true. */
  presets?: boolean;
};
