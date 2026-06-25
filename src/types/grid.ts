import type { ReactNode } from "react";

export type GridDataType = "text" | "number" | "currency" | "percent" | "status" | "date";

export type GridConditionalFormat<TValue = unknown, TData = unknown> = {
  when: (value: TValue, row: TData) => boolean;
  className: string;
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

export type GridFilterConfig<TData> = {
  accessorKey: Extract<keyof TData, string>;
  label: string;
  /** Defaults to "select". */
  filterType?: GridFilterType;
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
