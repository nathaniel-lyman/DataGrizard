import type { ReactNode } from "react";
import type {
  GridColorScale,
  GridDataBar,
  GridDataType,
  GridFlashOnChange,
  GridIconSet,
  GridProgressBar,
} from "../../types/grid";
import {
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
  formatStatusLabel,
  type FormatOptions,
} from "../../utils/formatters";
import { renderIconSet, renderProgressBar } from "./cellEffectsRender";

// Widened, value-erased view of a column config used internally by the engine.
// The public GridColumnConfig is a per-key union (value: TData[K]); the engine
// works generically over `unknown` cell values, so consumer columns are cast to
// this shape once at the prop boundary.
export type AnyColumnConfig<TData> = {
  accessorKey: Extract<keyof TData, string>;
  header: string;
  dataType: GridDataType;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  pinned?: "left" | "right";
  enablePinning?: boolean;
  enableGrouping?: boolean;
  dateFormat?: Intl.DateTimeFormatOptions;
  formatValue?: (value: unknown, row: TData) => ReactNode;
  formatGroupingValue?: (value: unknown, rows: TData[]) => ReactNode;
  getGroupingValue?: (row: TData) => unknown;
  getCellClassName?: (value: unknown, row: TData) => string;
  getStatusClassName?: (value: unknown, row: TData) => string;
  statusStyles?: Record<string, string>;
  conditionalFormats?: { when: (value: unknown, row: TData) => boolean; className: string }[];
  colorScale?: GridColorScale;
  dataBar?: GridDataBar;
  iconSet?: GridIconSet<unknown, TData>;
  progressBar?: boolean | GridProgressBar;
  flashOnChange?: boolean | GridFlashOnChange;
  editable?: boolean | ((row: TData) => boolean);
  validate?: (value: unknown, row: TData) => string | null;
  parseValue?: (input: string) => unknown;
  renderEditCell?: (props: {
    value: unknown;
    row: TData;
    onChange: (next: unknown) => void;
    commit: () => void;
    cancel: () => void;
    error: string | null;
  }) => ReactNode;
};

export const reactNodeToText = (value: ReactNode) => {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  return "";
};

export const isNumericDataType = (dataType: GridDataType) =>
  dataType === "currency" || dataType === "number" || dataType === "percent";

const formatNumericValue = (dataType: GridDataType, value: unknown, formatOptions: FormatOptions) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return "";
  }
  if (dataType === "currency") {
    return formatCurrency(numericValue, formatOptions);
  }
  if (dataType === "number") {
    return formatNumber(numericValue, formatOptions);
  }
  return formatPercent(numericValue, formatOptions);
};

export const formatBooleanValue = (value: unknown) => {
  if (value === true || String(value).toLowerCase() === "true") {
    return "True";
  }
  if (value === false || String(value).toLowerCase() === "false") {
    return "False";
  }
  return "";
};

const renderBaseCellValue = <TData extends object>(
  column: AnyColumnConfig<TData>,
  value: unknown,
  row: TData,
  formatOptions: FormatOptions,
): ReactNode => {
  if (column.formatValue) {
    return column.formatValue(value, row);
  }

  if (value == null || value === "") {
    return "";
  }

  if (isNumericDataType(column.dataType)) {
    return formatNumericValue(column.dataType, value, formatOptions);
  }

  if (column.dataType === "status") {
    const statusClassName =
      column.getStatusClassName?.(value, row) ??
      column.statusStyles?.[String(value)] ??
      "border-slate-200 bg-slate-50 text-slate-700";

    return (
      <span
        className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusClassName}`}
      >
        {formatStatusLabel(String(value))}
      </span>
    );
  }

  if (column.dataType === "date") {
    return formatDate(value, {
      ...formatOptions,
      dateFormat: column.dateFormat ?? formatOptions.dateFormat,
    });
  }

  if (column.dataType === "boolean") {
    return formatBooleanValue(value);
  }

  return String(value);
};

export const renderCellValue = <TData extends object>(
  column: AnyColumnConfig<TData>,
  value: unknown,
  row: TData,
  formatOptions: FormatOptions,
): ReactNode => {
  // A progress bar fully replaces the percent rendering.
  if (column.progressBar && column.dataType === "percent") {
    return renderProgressBar(value, column.progressBar, formatOptions);
  }

  const base = renderBaseCellValue(column, value, row, formatOptions);

  // Icon sets adorn the formatted value (skip blank cells).
  if (column.iconSet && value != null && value !== "") {
    return renderIconSet(base, value, row, column.iconSet);
  }

  return base;
};

export const renderGroupingValue = <TData extends object>(
  column: AnyColumnConfig<TData>,
  value: unknown,
  rows: TData[],
): ReactNode => {
  if (column.formatGroupingValue) {
    return column.formatGroupingValue(value, rows);
  }

  if (value == null || value === "") {
    return "Blank";
  }

  return String(value);
};

// Produces the plain-text representation a user actually sees in a cell, so
// global search can match formatted output ("$1,200", "12.0%", "In Progress")
// in addition to the raw underlying value.
export const getColumnSearchText = <TData extends object>(
  column: AnyColumnConfig<TData>,
  value: unknown,
  row: TData,
  formatOptions: FormatOptions,
): string => {
  if (value == null || value === "") {
    return "";
  }
  if (column.formatValue) {
    const formatted = column.formatValue(value, row);
    if (typeof formatted === "string" || typeof formatted === "number") {
      return String(formatted);
    }
  }
  if (column.dataType === "status") {
    return formatStatusLabel(String(value));
  }
  if (isNumericDataType(column.dataType)) {
    return formatNumericValue(column.dataType, value, formatOptions);
  }
  if (column.dataType === "date") {
    return formatDate(value, {
      ...formatOptions,
      dateFormat: column.dateFormat ?? formatOptions.dateFormat,
    });
  }
  if (column.dataType === "boolean") {
    return formatBooleanValue(value);
  }
  return String(value);
};

export const getCellClasses = <TData extends object>(
  column: AnyColumnConfig<TData>,
  value: unknown,
  row: TData,
) => {
  const alignment = isNumericDataType(column.dataType) ? "text-right tabular-nums" : "text-left";

  const conditional = (column.conditionalFormats ?? [])
    .filter((rule) => rule.when(value, row))
    .map((rule) => rule.className)
    .join(" ");

  return `${alignment} text-slate-800 ${column.getCellClassName?.(value, row) ?? ""} ${conditional}`.trim();
};
