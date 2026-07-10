import { isValidElement, type ReactNode } from "react";
import type {
  GridColorScale,
  GridColumnSemanticMetadata,
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
  toDate,
  type FormatOptions,
} from "../../utils/formatters";
import { renderIconSet, renderProgressBar } from "./cellEffectsRender";
import type { DataGridPresentationRule } from "./dataGridTypes";

// Widened, value-erased view of a column config used internally by the engine.
// The public GridColumnConfig is a per-key union (value: TData[K]); the engine
// works generically over `unknown` cell values, so consumer columns are cast to
// this shape once at the prop boundary.
export type AnyColumnConfig<TData> = {
  accessorKey: Extract<keyof TData, string>;
  header: string;
  dataType: GridDataType;
  semantic?: GridColumnSemanticMetadata;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  pinned?: "left" | "right";
  enablePinning?: boolean;
  enableGrouping?: boolean;
  enableFiltering?: boolean;
  enableSorting?: boolean;
  dateFormat?: Intl.DateTimeFormatOptions;
  numberFormat?: Intl.NumberFormatOptions;
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
  presentationRules?: DataGridPresentationRule[];
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

export const reactNodeToText = (value: ReactNode): string => {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(reactNodeToText).join("");
  }
  if (isValidElement(value)) {
    return reactNodeToText((value.props as { children?: ReactNode }).children);
  }
  return "";
};

export const isNumericDataType = (dataType: GridDataType) =>
  dataType === "currency" || dataType === "number" || dataType === "percent";

const formatNumericValue = (
  dataType: GridDataType,
  value: unknown,
  formatOptions: FormatOptions,
  numberFormat?: Intl.NumberFormatOptions,
) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return "";
  }
  if (numberFormat) {
    return new Intl.NumberFormat(formatOptions.locale ?? "en-US", {
      ...(dataType === "currency"
        ? { style: "currency", currency: formatOptions.currency ?? "USD" }
        : dataType === "percent"
          ? { style: "percent" }
          : {}),
      ...numberFormat,
    }).format(numericValue);
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
    return formatNumericValue(column.dataType, value, formatOptions, column.numberFormat);
  }

  if (column.dataType === "status") {
    const statusClassName =
      column.getStatusClassName?.(value, row) ??
      column.statusStyles?.[String(value)] ??
      "dg-pill--muted";

    return (
      <span
        className={`dg-pill ${statusClassName}`}
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
    return reactNodeToText(column.formatValue(value, row));
  }
  if (column.dataType === "status") {
    return formatStatusLabel(String(value));
  }
  if (isNumericDataType(column.dataType)) {
    return formatNumericValue(column.dataType, value, formatOptions, column.numberFormat);
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
  const alignment = isNumericDataType(column.dataType) ? "dg-cell--numeric" : "dg-cell--text";

  const conditional = (column.conditionalFormats ?? [])
    .filter((rule) => rule.when(value, row))
    .map((rule) => rule.className)
    .join(" ");

  const presentation = (column.presentationRules ?? [])
    .filter((rule) => matchesPresentationRule(value, rule))
    .map((rule) => `dg-presentation--${rule.tone}`)
    .join(" ");

  return `${alignment} dg-cell--content ${column.getCellClassName?.(value, row) ?? ""} ${conditional} ${presentation}`.trim();
};

function matchesPresentationRule(raw: unknown, rule: DataGridPresentationRule) {
  const empty = raw == null || raw === "";
  if (rule.operator === "isEmpty") return empty;
  if (rule.operator === "isNotEmpty") return !empty;
  const target = rule.value;
  if (rule.operator === "isAnyOf" || rule.operator === "isNoneOf") {
    const included = Array.isArray(target) && target.map(String).includes(String(raw ?? ""));
    return rule.operator === "isNoneOf" ? !included : included;
  }
  const numericRaw = Number(raw);
  const numericTarget = Number(target);
  if (["gt", "gte", "lt", "lte"].includes(rule.operator)) {
    if (!Number.isFinite(numericRaw) || !Number.isFinite(numericTarget)) return false;
    if (rule.operator === "gt") return numericRaw > numericTarget;
    if (rule.operator === "gte") return numericRaw >= numericTarget;
    if (rule.operator === "lt") return numericRaw < numericTarget;
    return numericRaw <= numericTarget;
  }
  if (rule.operator === "between") {
    const bounds = target && typeof target === "object"
      ? target as { min?: unknown; max?: unknown }
      : {};
    const min = Number(bounds.min);
    const max = Number(bounds.max);
    return Number.isFinite(numericRaw) &&
      (!Number.isFinite(min) || numericRaw >= min) &&
      (!Number.isFinite(max) || numericRaw <= max);
  }
  if (["before", "onOrBefore", "after", "onOrAfter"].includes(rule.operator)) {
    const rawTime = toDate(raw)?.getTime();
    const targetTime = toDate(target)?.getTime();
    if (rawTime == null || targetTime == null) return false;
    if (rule.operator === "before") return rawTime < targetTime;
    if (rule.operator === "onOrBefore") return rawTime <= targetTime;
    if (rule.operator === "after") return rawTime > targetTime;
    return rawTime >= targetTime;
  }
  const haystack = String(raw ?? "").toLowerCase();
  const needle = String(target ?? "").toLowerCase();
  if (rule.operator === "contains") return haystack.includes(needle);
  if (rule.operator === "notContains") return !haystack.includes(needle);
  if (rule.operator === "startsWith") return haystack.startsWith(needle);
  if (rule.operator === "endsWith") return haystack.endsWith(needle);
  if (rule.operator === "isNot" || rule.operator === "notEquals") return haystack !== needle;
  return haystack === needle;
}
