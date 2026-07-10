import { useImperativeHandle, useRef, type Ref } from "react";
import type {
  ColumnFiltersState,
  ColumnOrderState,
  ColumnPinningState,
  ColumnSizingState,
  ExpandedState,
  GroupingState,
  PaginationState,
  RowSelectionState,
  SortingState,
  Table,
  Updater,
  VisibilityState,
} from "@tanstack/react-table";
import type {
  DataGridDisplayMode,
  GridFilterOperator,
  GridFilterType,
  GridSemanticAllowedValue,
} from "../../types/grid";
import type { AnyColumnConfig } from "./cells";
import type {
  DataGridActionPlan,
  DataGridApi,
  DataGridAnalysisColumn,
  DataGridAnalysisReceipt,
  DataGridAnalysisWarning,
  DataGridAggregateOperation,
  DataGridAggregateQuery,
  DataGridAggregateResult,
  DataGridCommand,
  DataGridCommandError,
  DataGridCommandErrorCode,
  DataGridCommandResult,
  DataGridPlanResult,
  DataGridPlanValidationResult,
  DataGridApplyPlanResult,
  DataGridDataAccessLimits,
  DataGridQuery,
  DataGridQueryResult,
  DataGridQueryScope,
  DataGridSnapshot,
  DataGridTransactionDiff,
  DataGridTransactionStateKey,
  DataGridUndoResult,
} from "./dataGridApi";
import type {
  DataGridCellRange,
  DataGridColumnPresentationState,
  DataGridControlledState,
  DataGridDataMode,
  DataGridFeatures,
  DataGridLayoutMode,
} from "./dataGridTypes";
import { ROW_ACTIONS_COLUMN_ID, SELECT_COLUMN_ID } from "./gridConstants";
import { removeJson } from "./storage";
import type { DataGridPivotState, PivotRow } from "./pivot";
import {
  aggregateMetric,
  getAnalysisValue,
  metricResultKey,
  toSerializableValue,
  type DataGridAnalysisRow,
} from "./dataGridAnalysis";
import type {
  DataGridAnalysisExecutionOptions,
  DataGridAnalysisContext,
  DataGridServerAnalysisAdapter,
  DataGridServerAnalysisProvenance,
} from "./dataGridAnalysisContract";
import {
  normalizeDataGridAggregateQuery,
  normalizeDataGridQuery,
  validateDataGridServerAnalysisPayload,
} from "./dataGridAnalysisValidation";
import { buildDataGridAnalysisQuerySpec } from "./serverQuery";

let analysisQuerySequence = 0;
let actionPlanSequence = 0;
let transactionSequence = 0;

type AnalysisStart = {
  queryId: string;
  gridRevision: number;
  startedAt: Date;
  startedAtMs: number;
};

const monotonicNow = () => globalThis.performance?.now() ?? Date.now();

const beginAnalysis = (
  operation: "query" | "aggregate",
  gridRevision: number,
): AnalysisStart => ({
  queryId: `dg-${operation}-${gridRevision}-${Date.now().toString(36)}-${++analysisQuerySequence}`,
  gridRevision,
  startedAt: new Date(),
  startedAtMs: monotonicNow(),
});

const completeAnalysisTiming = (start: AnalysisStart) => {
  const completedAt = new Date();
  return {
    startedAt: start.startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: Math.max(0, Number((monotonicNow() - start.startedAtMs).toFixed(3))),
  };
};

type GridState = {
  sorting: SortingState;
  globalFilter: string;
  columnFilters: ColumnFiltersState;
  columnVisibility: VisibilityState;
  columnSizing: ColumnSizingState;
  columnOrder: ColumnOrderState;
  columnPinning: ColumnPinningState;
  pagination: PaginationState;
  rowSelection: RowSelectionState;
  selectedColumnIds: string[];
  cellSelection: DataGridCellRange | null;
  columnPresentation: DataGridColumnPresentationState;
  grouping: GroupingState;
  expanded: ExpandedState;
  pivot: DataGridPivotState;
};

type GridEmitters = {
  sorting: (updater: Updater<SortingState>) => void;
  globalFilter: (updater: Updater<string>) => void;
  columnFilters: (updater: Updater<ColumnFiltersState>) => void;
  columnVisibility: (updater: Updater<VisibilityState>) => void;
  columnSizing: (updater: Updater<ColumnSizingState>) => void;
  columnOrder: (updater: Updater<ColumnOrderState>) => void;
  columnPinning: (updater: Updater<ColumnPinningState>) => void;
  pagination: (updater: Updater<PaginationState>) => void;
  rowSelection: (updater: Updater<RowSelectionState>) => void;
  selectedColumnIds: (updater: Updater<string[]>) => void;
  cellSelection: (updater: Updater<DataGridCellRange | null>) => void;
  columnPresentation: (updater: Updater<DataGridColumnPresentationState>) => void;
  grouping: (updater: Updater<GroupingState>) => void;
  pivot: (updater: Updater<DataGridPivotState>) => void;
};

type StorageKeys = {
  columnSizing: string;
  columnOrder: string;
  columnPinning: string;
  columnPresentation: string;
};

type UseDataGridApiOptions<TData extends object> = {
  apiRef?: Ref<DataGridApi<TData>>;
  table: Table<TData | PivotRow<TData>>;
  columnsById: Map<string, AnyColumnConfig<TData>>;
  resolvedFilters: Array<{
    accessorKey: string;
    filterType: GridFilterType;
    operators: GridFilterOperator[];
    allowedValues?: GridSemanticAllowedValue[];
    min?: number;
    max?: number;
  }>;
  groupableColumnIds: string[];
  pivotMeasureIds: string[];
  layoutMode: DataGridLayoutMode;
  dataMode: DataGridDataMode;
  displayMode: DataGridDisplayMode;
  features: DataGridFeatures;
  state: GridState;
  emitters: GridEmitters;
  counts: DataGridSnapshot["rowCounts"];
  defaultColumnOrder: ColumnOrderState;
  defaultColumnPinning: ColumnPinningState;
  lockedLeftColumnIds: string[];
  controlledState?: DataGridControlledState;
  storageKeys?: StorageKeys;
  getColumnLabel: (columnId: string) => string;
  scopeRows: Record<DataGridQueryScope, DataGridAnalysisRow<TData>[]>;
  dataAccessLimits: DataGridDataAccessLimits;
  serverAnalysis?: DataGridServerAnalysisAdapter;
};

const hasDuplicates = (ids: string[]) => new Set(ids).size !== ids.length;

const aggregateOperationsForDataType = (
  dataType: string,
): DataGridAggregateOperation[] => {
  const common: DataGridAggregateOperation[] = ["count", "distinct_count", "top_values"];
  if (["number", "currency", "percent"].includes(dataType)) {
    return ["count", "sum", "average", "min", "max", "min_max", "distinct_count", "top_values"];
  }
  if (dataType === "date") {
    return ["count", "min", "max", "min_max", "distinct_count", "top_values"];
  }
  return common;
};

const cloneSemanticMetadata = <TData extends object>(
  column: AnyColumnConfig<TData>,
) => column.semantic
  ? {
      ...column.semantic,
      synonyms: column.semantic.synonyms ? [...column.semantic.synonyms] : undefined,
      allowedValues: column.semantic.allowedValues
        ? [...column.semantic.allowedValues]
        : undefined,
    }
  : undefined;

const cloneExpanded = (expanded: ExpandedState): ExpandedState =>
  expanded === true ? true : { ...expanded };

const cloneSnapshotValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(cloneSnapshotValue);
  if (value instanceof Date) return new Date(value.getTime());
  if (value != null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneSnapshotValue(item)]),
    );
  }
  return value;
};

const clonePivot = (pivot: DataGridPivotState): DataGridPivotState => ({
  ...pivot,
  rows: [...pivot.rows],
  columns: pivot.columns?.map((axis) => ({ ...axis })),
  measures: [...pivot.measures],
  expanded: pivot.expanded == null ? pivot.expanded : cloneExpanded(pivot.expanded),
});

const PRESENTATION_KEYS = new Set([
  "numberFormat",
  "dateFormat",
  "colorScale",
  "dataBar",
  "progressBar",
  "rules",
]);
const PRESENTATION_TONES = new Set(["positive", "negative", "warning", "accent", "muted"]);
const PRESENTATION_OPERATORS = new Set([
  "is", "isNot", "isAnyOf", "isNoneOf", "contains", "notContains", "startsWith",
  "endsWith", "equals", "notEquals", "gt", "gte", "lt", "lte", "between",
  "before", "onOrBefore", "after", "onOrAfter", "isEmpty", "isNotEmpty",
]);
const NUMBER_FORMAT_KEYS = new Set([
  "localeMatcher", "style", "currency", "currencyDisplay", "currencySign", "useGrouping",
  "minimumIntegerDigits", "minimumFractionDigits", "maximumFractionDigits",
  "minimumSignificantDigits", "maximumSignificantDigits", "compactDisplay", "notation",
  "signDisplay", "unit", "unitDisplay", "roundingMode", "roundingPriority",
  "roundingIncrement", "trailingZeroDisplay",
]);
const DATE_FORMAT_KEYS = new Set([
  "dateStyle", "timeStyle", "calendar", "dayPeriod", "numberingSystem", "localeMatcher",
  "timeZone", "hour12", "hourCycle", "formatMatcher", "weekday", "era", "year", "month",
  "day", "hour", "minute", "second", "timeZoneName", "fractionalSecondDigits",
]);

const isSerializableInput = (value: unknown, seen = new WeakSet<object>()): boolean => {
  if (value == null || ["string", "number", "boolean"].includes(typeof value)) return true;
  if (Array.isArray(value)) return value.every((item) => isSerializableInput(item, seen));
  if (typeof value !== "object" || value instanceof Date || seen.has(value)) return false;
  seen.add(value);
  const valid = Object.values(value).every((item) => isSerializableInput(item, seen));
  seen.delete(value);
  return valid;
};

const validatePresentationValue = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "Column presentation must be an object.";
  }
  const presentation = value as Record<string, unknown>;
  const unexpected = Object.keys(presentation).find((key) => !PRESENTATION_KEYS.has(key));
  if (unexpected) return `Unsupported presentation property: ${unexpected}.`;
  if (!isSerializableInput(presentation)) return "Column presentation must contain only serializable values.";
  const validateObjectKeys = (property: string, allowed: Set<string>) => {
    const nested = presentation[property];
    if (nested == null) return null;
    if (typeof nested !== "object" || Array.isArray(nested)) return `${property} must be an object.`;
    const invalid = Object.keys(nested).find((key) => !allowed.has(key));
    return invalid ? `Unsupported ${property} property: ${invalid}.` : null;
  };
  const nestedError =
    validateObjectKeys("numberFormat", NUMBER_FORMAT_KEYS) ??
    validateObjectKeys("dateFormat", DATE_FORMAT_KEYS) ??
    validateObjectKeys("colorScale", new Set(["colors", "domain", "autoTextColor"])) ??
    validateObjectKeys("dataBar", new Set(["color", "negativeColor", "domain", "showValue"]));
  if (nestedError) return nestedError;
  if (presentation.colorScale != null) {
    const colors = (presentation.colorScale as Record<string, unknown>).colors;
    if (
      !Array.isArray(colors) ||
      (colors.length !== 2 && colors.length !== 3) ||
      colors.some((color) => typeof color !== "string")
    ) {
      return "colorScale.colors must contain two or three color strings.";
    }
  }
  if (presentation.progressBar != null && typeof presentation.progressBar !== "boolean") {
    return "progressBar must be a boolean.";
  }
  if (presentation.rules != null) {
    if (!Array.isArray(presentation.rules)) return "rules must be an array.";
    const invalidRule = presentation.rules.find((rule) => {
      if (!rule || typeof rule !== "object" || Array.isArray(rule)) return true;
      const item = rule as Record<string, unknown>;
      return typeof item.operator !== "string" ||
        !PRESENTATION_OPERATORS.has(item.operator) ||
        typeof item.tone !== "string" ||
        !PRESENTATION_TONES.has(item.tone) ||
        Object.keys(item).some((key) => !["operator", "value", "tone"].includes(key));
    });
    if (invalidRule) return "Each presentation rule requires a supported operator and tone.";
  }
  return null;
};

const addError = (
  errors: DataGridCommandError[],
  commandIndex: number,
  code: DataGridCommandErrorCode,
  message: string,
  id?: string,
) => {
  errors.push({ commandIndex, code, message, id });
};

const validateIds = (
  ids: string[],
  validIds: Set<string>,
  errors: DataGridCommandError[],
  commandIndex: number,
  kind: "column" | "row",
  allowEmpty = false,
) => {
  if (!allowEmpty && ids.length === 0) {
    addError(errors, commandIndex, "empty_command", `At least one ${kind} id is required.`);
    return;
  }
  if (hasDuplicates(ids)) {
    addError(errors, commandIndex, "duplicate_id", `Duplicate ${kind} ids are not allowed.`);
  }
  ids.forEach((id) => {
    if (!validIds.has(id)) {
      addError(
        errors,
        commandIndex,
        kind === "column" ? "invalid_column" : "invalid_row",
        `Unknown ${kind} id: ${id}`,
        id,
      );
    }
  });
};

export function useDataGridApi<TData extends object>({
  apiRef,
  table,
  columnsById,
  resolvedFilters,
  groupableColumnIds,
  pivotMeasureIds,
  layoutMode,
  dataMode,
  displayMode,
  features,
  state,
  emitters,
  counts,
  defaultColumnOrder,
  defaultColumnPinning,
  lockedLeftColumnIds,
  controlledState,
  storageKeys,
  getColumnLabel,
  scopeRows,
  dataAccessLimits,
  serverAnalysis,
}: UseDataGridApiOptions<TData>) {
  const revisionInputs = [
    table.options.data,
    table.options.columns,
    layoutMode,
    dataMode,
    displayMode,
    ...Object.values(features),
    state.sorting,
    state.globalFilter,
    state.columnFilters,
    state.columnVisibility,
    state.columnSizing,
    state.columnOrder,
    state.columnPinning,
    state.pagination,
    state.rowSelection,
    state.selectedColumnIds,
    state.cellSelection,
    state.columnPresentation,
    state.grouping,
    state.expanded,
    state.pivot,
    counts.loaded,
    counts.filtered,
    counts.selected,
    counts.visible,
    counts.total,
    serverAnalysis,
  ];
  const revisionRef = useRef<{ inputs: unknown[]; value: number }>({ inputs: [], value: 0 });
  const pendingApplyBaseRevisionRef = useRef<number | null>(null);
  const transactionsRef = useRef(new Map<string, {
    expectedRevision: number;
    beforeState: Partial<GridState>;
    diff: DataGridTransactionDiff;
  }>());
  if (
    revisionRef.current.inputs.length !== revisionInputs.length ||
    revisionRef.current.inputs.some((value, index) => value !== revisionInputs[index])
  ) {
    revisionRef.current = {
      inputs: revisionInputs,
      value: revisionRef.current.value + 1,
    };
    pendingApplyBaseRevisionRef.current = null;
  }

  const dataColumns = table
    .getAllLeafColumns()
    .filter((column) => column.id !== SELECT_COLUMN_ID && column.id !== ROW_ACTIONS_COLUMN_ID);
  const dataColumnIds = dataColumns.map((column) => column.id);
  const dataColumnIdSet = new Set(dataColumnIds);
  const sourceColumnIdSet = new Set(columnsById.keys());
  const filterByColumnId = new Map(
    resolvedFilters.map((filter) => [filter.accessorKey, filter]),
  );
  const filterableColumnIdSet = new Set(filterByColumnId.keys());
  const groupableColumnIdSet = new Set(groupableColumnIds);
  const loadedRowIdSet = new Set(table.getCoreRowModel().flatRows.map((row) => row.id));
  const pivotMeasureIdSet = new Set(pivotMeasureIds);
  const lockedLeftColumnIdSet = new Set(lockedLeftColumnIds);

  const sourceColumns = [...columnsById.entries()].map(([id, column]) => {
    const renderedColumn = table.getColumn(id);
    const filter = filterByColumnId.get(id);
    return {
      id,
      label: column.header,
      dataType: column.dataType,
      semantic: cloneSemanticMetadata(column),
      visible: renderedColumn?.getIsVisible() ?? false,
      canHide: layoutMode === "grid" && Boolean(renderedColumn?.getCanHide()),
      canSort: layoutMode === "grid" && Boolean(renderedColumn?.getCanSort()),
      canFilter: filterableColumnIdSet.has(id),
      canGroup: layoutMode === "grid" && groupableColumnIdSet.has(id),
      filter: filter
        ? {
            type: filter.filterType,
            operators: [...filter.operators],
            allowedValues: filter.allowedValues ? [...filter.allowedValues] : undefined,
            min: filter.min,
            max: filter.max,
          }
        : undefined,
      aggregateOperations: aggregateOperationsForDataType(column.dataType),
    };
  });
  const localAnalysisScopes: DataGridQueryScope[] = [
    ...(features.rowSelection ? ["selected_rows" as const] : []),
    "visible_page",
  ];
  const remoteQueryScopes = dataMode === "server" && serverAnalysis
    ? serverAnalysis.capabilities.queryScopes.filter(
        (scope, index, scopes) => scopes.indexOf(scope) === index,
      )
    : [];
  const remoteAggregateScopes = dataMode === "server" && serverAnalysis
    ? serverAnalysis.capabilities.aggregateScopes.filter(
        (scope, index, scopes) => scopes.indexOf(scope) === index,
      )
    : [];
  const clientCompleteScopes: DataGridQueryScope[] = dataMode === "client"
    ? ["all", "filtered"]
    : [];
  const analysis = {
    queryScopes: dataMode === "client"
      ? [...clientCompleteScopes, ...localAnalysisScopes]
      : [...localAnalysisScopes, ...remoteQueryScopes],
    aggregateScopes: dataMode === "client"
      ? [...clientCompleteScopes, ...localAnalysisScopes]
      : [...localAnalysisScopes, ...remoteAggregateScopes],
    remote: dataMode === "server" && Boolean(serverAnalysis),
  };

  const getSnapshot = (): DataGridSnapshot => ({
    revision: revisionRef.current.value,
    layoutMode,
    dataMode,
    displayMode,
    features: { ...features },
    sourceColumns,
    columns: dataColumns.map((column, order) => ({
      id: column.id,
      label: getColumnLabel(column.id),
      dataType: columnsById.get(column.id)?.dataType,
      generated: !columnsById.has(column.id),
      visible: column.getIsVisible(),
      order,
      size: column.getSize(),
      minSize: column.columnDef.minSize ?? 0,
      maxSize: column.columnDef.maxSize ?? Number.MAX_SAFE_INTEGER,
      pinned: column.getIsPinned(),
      canHide: column.getCanHide(),
      canSort: column.getCanSort(),
      canFilter: column.getCanFilter(),
      canResize: column.getCanResize(),
      canPin: column.getCanPin(),
      canGroup: column.getCanGroup(),
    })),
    rowCounts: { ...counts },
    analysis,
    state: {
      sorting: state.sorting.map((sort) => ({ ...sort })),
      globalFilter: state.globalFilter,
      columnFilters: state.columnFilters.map((filter) => ({
        ...filter,
        value: cloneSnapshotValue(filter.value),
      })),
      columnVisibility: { ...state.columnVisibility },
      columnSizing: { ...state.columnSizing },
      columnOrder: [...state.columnOrder],
      columnPinning: {
        left: [...(state.columnPinning.left ?? [])],
        right: [...(state.columnPinning.right ?? [])],
      },
      pagination: { ...state.pagination },
      rowSelection: { ...state.rowSelection },
      selectedColumnIds: [...state.selectedColumnIds],
      cellSelection: state.cellSelection
        ? {
            anchor: { ...state.cellSelection.anchor },
            focus: { ...state.cellSelection.focus },
          }
        : null,
      columnPresentation: cloneSnapshotValue(state.columnPresentation) as DataGridColumnPresentationState,
      grouping: [...state.grouping],
      expanded: cloneExpanded(state.expanded),
      pivot: clonePivot(state.pivot),
    },
  });

  const unavailableScope = (scope: DataGridQueryScope) =>
    dataMode === "server" && (scope === "all" || scope === "filtered");

  const resolveQueryColumnIds = (requested?: string[]) => {
    if (requested) return requested;
    const sourceOrder = [...columnsById.keys()];
    if (state.cellSelection) {
      const anchor = sourceOrder.indexOf(state.cellSelection.anchor.columnId);
      const focus = sourceOrder.indexOf(state.cellSelection.focus.columnId);
      if (anchor >= 0 && focus >= 0) {
        return sourceOrder.slice(Math.min(anchor, focus), Math.max(anchor, focus) + 1);
      }
    }
    if (state.selectedColumnIds.length > 0) return state.selectedColumnIds;
    const visible = dataColumns
      .filter((column) => sourceColumnIdSet.has(column.id) && column.getIsVisible())
      .map((column) => column.id);
    return visible.length > 0 ? visible : sourceOrder;
  };

  const invalidColumn = (scope: DataGridQueryScope, columnId: string) => ({
    ok: false as const,
    scope,
    error: {
      code: "invalid_column" as const,
      message: `Unknown source column id: ${columnId}`,
      id: columnId,
    },
  });

  const receiptColumns = (columnIds: string[]): DataGridAnalysisColumn[] =>
    columnIds.map((id) => ({
      id,
      label: columnsById.get(id)?.header ?? id,
      dataType: columnsById.get(id)?.dataType,
    }));

  const receiptFilters = (scope: DataGridQueryScope) => {
    const filtersApply = scope === "filtered" || scope === "visible_page";
    return {
      globalFilter: filtersApply ? state.globalFilter : "",
      columnFilters: filtersApply
        ? state.columnFilters.map((filter) => ({
            id: filter.id,
            value: toSerializableValue(filter.value),
          }))
        : [],
    };
  };

  const createReceipt = ({
    start,
    scope,
    columnIds,
    aggregateBy = [],
    supportingRowIds,
    supportingRowCount,
    supportingRowIdsTruncated,
    supportingGroupKeys = [],
    warnings,
    replay,
    execution = { mode: "client" },
    capturedFilters,
  }: {
    start: AnalysisStart;
    scope: DataGridQueryScope;
    columnIds: string[];
    aggregateBy?: string[];
    supportingRowIds: string[];
    supportingRowCount: number;
    supportingRowIdsTruncated: boolean;
    supportingGroupKeys?: DataGridAnalysisReceipt["supportingGroupKeys"];
    warnings: DataGridAnalysisWarning[];
    replay: DataGridAnalysisReceipt["replay"];
    execution?: DataGridAnalysisReceipt["execution"];
    capturedFilters?: DataGridAnalysisReceipt["filters"];
  }): DataGridAnalysisReceipt => ({
    queryId: start.queryId,
    gridRevision: start.gridRevision,
    completedGridRevision: revisionRef.current.value,
    scope,
    columns: receiptColumns(columnIds),
    filters: capturedFilters
      ? {
          globalFilter: capturedFilters.globalFilter,
          columnFilters: capturedFilters.columnFilters.map((filter) => ({
            id: filter.id,
            value: toSerializableValue(filter.value),
          })),
        }
      : receiptFilters(scope),
    sorting: scope === "visible_page"
      ? state.sorting.map((sort) => ({ ...sort }))
      : [],
    grouping: {
      view: scope === "visible_page" ? [...state.grouping] : [],
      aggregateBy: [...aggregateBy],
    },
    supportingRowIds: [...supportingRowIds],
    supportingRowCount,
    supportingRowIdsTruncated,
    supportingGroupKeys: supportingGroupKeys.map((key) =>
      toSerializableValue(key) as Record<string, ReturnType<typeof toSerializableValue>>,
    ),
    warnings,
    timing: completeAnalysisTiming(start),
    replay,
    execution,
    limits: { ...dataAccessLimits },
  });

  const query = (input: DataGridQuery): DataGridQueryResult => {
    const start = beginAnalysis("query", revisionRef.current.value);
    if (unavailableScope(input.scope)) {
      return {
        ok: false,
        scope: input.scope,
        error: {
          code: "scope_unavailable",
          message: `${input.scope} is unavailable in server mode without a server-wide analysis adapter.`,
        },
      };
    }
    const normalized = normalizeDataGridQuery(input, {
      columns: sourceColumns,
      defaultColumnIds: resolveQueryColumnIds(input.columnIds),
      limits: dataAccessLimits,
    });
    if (!normalized.ok) return { ok: false, scope: input.scope, error: normalized.error };
    const normalizedInput = normalized.value;
    const columnIds = normalizedInput.columnIds as string[];
    const offset = normalizedInput.offset as number;
    const limit = normalizedInput.limit as number;
    const rows = scopeRows[normalizedInput.scope];
    const page = rows.slice(offset, offset + limit);
    const warnings: DataGridAnalysisWarning[] = [];
    if (offset > 0) {
      warnings.push({
        code: "offset_applied",
        message: `The first ${Math.min(offset, rows.length)} supporting rows were skipped by the query offset.`,
        actual: offset,
      });
    }
    if (offset + page.length < rows.length) {
      warnings.push({
        code: "rows_truncated",
        message: `The query returned ${page.length} of ${rows.length} rows because its row limit was applied.`,
        limit,
        actual: rows.length,
      });
    }
    const supportingRowIdsTruncated = page.length < rows.length;
    if (supportingRowIdsTruncated) {
      warnings.push({
        code: "supporting_rows_truncated",
        message: "The receipt contains only the bounded row IDs returned by this query.",
        limit: page.length,
        actual: rows.length,
      });
    }
    const replay = {
      operation: "query" as const,
      payload: { scope: normalizedInput.scope, columnIds: [...columnIds], offset, limit },
    };
    return {
      ok: true,
      scope: normalizedInput.scope,
      columns: columnIds.map((id) => ({
        id,
        label: columnsById.get(id)?.header ?? id,
        dataType: columnsById.get(id)?.dataType,
      })),
      rows: page.map(({ rowId, data }) => ({
        rowId,
        values: Object.fromEntries(
          columnIds.map((columnId) => [columnId, toSerializableValue(getAnalysisValue(data, columnId))]),
        ),
      })),
      rowCount: rows.length,
      returnedRowCount: page.length,
      offset,
      truncated: offset + page.length < rows.length,
      receipt: createReceipt({
        start,
        scope: normalizedInput.scope,
        columnIds,
        supportingRowIds: page.map((row) => row.rowId),
        supportingRowCount: rows.length,
        supportingRowIdsTruncated,
        warnings,
        replay,
      }),
    };
  };

  const aggregate = (input: DataGridAggregateQuery): DataGridAggregateResult => {
    const start = beginAnalysis("aggregate", revisionRef.current.value);
    if (unavailableScope(input.scope)) {
      return {
        ok: false,
        scope: input.scope,
        error: {
          code: "scope_unavailable",
          message: `${input.scope} is unavailable in server mode without a server-wide analysis adapter.`,
        },
      };
    }
    const normalized = normalizeDataGridAggregateQuery(input, {
      columns: sourceColumns,
      limits: dataAccessLimits,
    });
    if (!normalized.ok) return { ok: false, scope: input.scope, error: normalized.error };
    input = normalized.value;
    const referencedColumnIds = [
      ...(input.groupBy ?? []),
      ...input.metrics.flatMap((metric) => (metric.columnId ? [metric.columnId] : [])),
    ];
    const unknownColumn = referencedColumnIds.find((columnId) => !sourceColumnIdSet.has(columnId));
    if (unknownColumn) return invalidColumn(input.scope, unknownColumn);
    const missingMetricColumn = input.metrics.find(
      (metric) => metric.operation !== "count" && !metric.columnId,
    );
    if (missingMetricColumn) {
      return {
        ok: false,
        scope: input.scope,
        error: {
          code: "invalid_query",
          message: `${missingMetricColumn.operation} requires a columnId.`,
        },
      };
    }
    const metricKeys = input.metrics.map(metricResultKey);
    if (hasDuplicates(metricKeys)) {
      return {
        ok: false,
        scope: input.scope,
        error: { code: "invalid_query", message: "Aggregate result keys must be unique." },
      };
    }
    const rows = scopeRows[input.scope];
    if (input.metrics.length > dataAccessLimits.maxCellsPerQuery) {
      return {
        ok: false,
        scope: input.scope,
        error: {
          code: "limit_exceeded",
          message: `Aggregate output exceeds the ${dataAccessLimits.maxCellsPerQuery}-cell limit.`,
        },
      };
    }
    const compute = (groupRows: DataGridAnalysisRow<TData>[]) =>
      Object.fromEntries(
        input.metrics.map((metric) => [
          metricResultKey(metric),
          aggregateMetric(groupRows, metric, dataAccessLimits.maxTopValues),
        ]),
      );
    const groupBy = input.groupBy ?? [];
    const columnIds = [...new Set(referencedColumnIds)];
    const normalizedMetrics = input.metrics.map((metric) => metric.operation === "top_values"
      ? {
          ...metric,
          limit: Math.max(1, Math.min(metric.limit ?? 10, dataAccessLimits.maxTopValues)),
        }
      : { ...metric });
    const warnings: DataGridAnalysisWarning[] = [...normalized.warnings];
    input.metrics.forEach((metric) => {
      if (metric.operation !== "top_values" || !metric.columnId) return;
      const effectiveLimit = Math.max(
        1,
        Math.min(metric.limit ?? 10, dataAccessLimits.maxTopValues),
      );
      if (metric.limit != null && metric.limit !== effectiveLimit) {
        warnings.push({
          code: "limit_clamped",
          message: `${metricResultKey(metric)} requested ${metric.limit} values; the configured limit is ${effectiveLimit}.`,
          limit: effectiveLimit,
          actual: metric.limit,
        });
      }
      const distinctValues = new Set(
        rows
          .map(({ data }) => getAnalysisValue(data, metric.columnId as string))
          .filter((value) => value != null && value !== "")
          .map((value) => JSON.stringify(toSerializableValue(value))),
      ).size;
      if (distinctValues > effectiveLimit) {
        warnings.push({
          code: "top_values_truncated",
          message: `${metricResultKey(metric)} returned the top ${effectiveLimit} of ${distinctValues} distinct values.`,
          limit: effectiveLimit,
          actual: distinctValues,
        });
      }
    });
    const replay = {
      operation: "aggregate" as const,
      payload: {
        scope: input.scope,
        metrics: normalizedMetrics,
        groupBy: [...groupBy],
      },
    };
    const supportingRows = rows.slice(0, dataAccessLimits.maxRowsPerQuery);
    const supportingRowIdsTruncated = supportingRows.length < rows.length;
    if (supportingRowIdsTruncated) {
      warnings.push({
        code: "supporting_rows_truncated",
        message: `The receipt includes ${supportingRows.length} bounded evidence row IDs for ${rows.length} analyzed rows.`,
        limit: dataAccessLimits.maxRowsPerQuery,
        actual: rows.length,
      });
    }
    if (groupBy.length === 0) {
      return {
        ok: true,
        scope: input.scope,
        rowCount: rows.length,
        metrics: compute(rows),
        groups: [],
        truncated: false,
        receipt: createReceipt({
          start,
          scope: input.scope,
          columnIds,
          supportingRowIds: supportingRows.map((row) => row.rowId),
          supportingRowCount: rows.length,
          supportingRowIdsTruncated,
          warnings,
          replay,
        }),
      };
    }
    const grouped = new Map<string, { key: Record<string, ReturnType<typeof toSerializableValue>>; rows: DataGridAnalysisRow<TData>[] }>();
    rows.forEach((row) => {
      const key = Object.fromEntries(
        groupBy.map((columnId) => [columnId, toSerializableValue(getAnalysisValue(row.data, columnId))]),
      );
      const serialized = JSON.stringify(key);
      const current = grouped.get(serialized);
      if (current) current.rows.push(row);
      else grouped.set(serialized, { key, rows: [row] });
    });
    const groups = [...grouped.values()];
    const maxGroupsByCells = Math.max(
      1,
      Math.floor(
        dataAccessLimits.maxCellsPerQuery /
          Math.max(1, input.metrics.length + groupBy.length),
      ),
    );
    const limitedGroups = groups.slice(
      0,
      Math.min(dataAccessLimits.maxGroupsPerAggregate, maxGroupsByCells),
    );
    if (limitedGroups.length < groups.length) {
      warnings.push({
        code: "groups_truncated",
        message: `The aggregate returned ${limitedGroups.length} of ${groups.length} groups because its group limit was applied.`,
        limit: limitedGroups.length,
        actual: groups.length,
      });
    }
    return {
      ok: true,
      scope: input.scope,
      rowCount: rows.length,
      metrics: compute(rows),
      groups: limitedGroups.map((group) => ({
        key: group.key,
        rowCount: group.rows.length,
        metrics: compute(group.rows),
      })),
      truncated: limitedGroups.length < groups.length,
      receipt: createReceipt({
        start,
        scope: input.scope,
        columnIds,
        aggregateBy: groupBy,
        supportingRowIds: supportingRows.map((row) => row.rowId),
        supportingRowCount: rows.length,
        supportingRowIdsTruncated,
        supportingGroupKeys: limitedGroups.map((group) => group.key),
        warnings,
        replay,
      }),
    };
  };

  const analysisError = (
    scope: DataGridQueryScope,
    code: "scope_unavailable" | "analysis_aborted" | "analysis_failed" | "invalid_analysis_response",
    message: string,
  ) => ({ ok: false as const, scope, error: { code, message } });

  const supportsRemoteScope = (
    operation: "query" | "aggregate",
    scope: DataGridQueryScope,
  ) => Boolean(
    serverAnalysis &&
    dataMode === "server" &&
    (scope === "all" || scope === "filtered") &&
    serverAnalysis.capabilities[operation === "query" ? "queryScopes" : "aggregateScopes"]
      .includes(scope),
  );

  const detachedSourceColumns = () => sourceColumns.map((column) => ({
    ...column,
    semantic: column.semantic
      ? {
          ...column.semantic,
          synonyms: column.semantic.synonyms ? [...column.semantic.synonyms] : undefined,
          allowedValues: column.semantic.allowedValues
            ? [...column.semantic.allowedValues]
            : undefined,
        }
      : undefined,
    filter: column.filter
      ? {
          ...column.filter,
          operators: [...column.filter.operators],
          allowedValues: column.filter.allowedValues
            ? [...column.filter.allowedValues]
            : undefined,
        }
      : undefined,
    aggregateOperations: [...column.aggregateOperations],
  }));

  const createServerContext = (
    start: AnalysisStart,
    scope: "all" | "filtered",
  ): DataGridAnalysisContext => {
    const filters = receiptFilters(scope);
    return {
      queryId: start.queryId,
      gridRevision: start.gridRevision,
      scope,
      columns: detachedSourceColumns(),
      filters,
      querySpec: buildDataGridAnalysisQuerySpec(scope, filters, sourceColumns),
      limits: { ...dataAccessLimits },
    };
  };

  const cloneServerContext = (
    context: DataGridAnalysisContext,
  ): DataGridAnalysisContext => ({
    ...context,
    columns: context.columns.map((column) => ({
      ...column,
      semantic: column.semantic
        ? {
            ...column.semantic,
            synonyms: column.semantic.synonyms ? [...column.semantic.synonyms] : undefined,
            allowedValues: column.semantic.allowedValues
              ? [...column.semantic.allowedValues]
              : undefined,
          }
        : undefined,
      filter: column.filter
        ? {
            ...column.filter,
            operators: [...column.filter.operators],
            allowedValues: column.filter.allowedValues
              ? [...column.filter.allowedValues]
              : undefined,
          }
        : undefined,
      aggregateOperations: [...column.aggregateOperations],
    })),
    filters: {
      globalFilter: context.filters.globalFilter,
      columnFilters: context.filters.columnFilters.map((filter) => ({
        id: filter.id,
        value: toSerializableValue(filter.value),
      })),
    },
    querySpec: {
      filters: context.querySpec.filters.map((filter) => ({
        ...filter,
        value: toSerializableValue(filter.value),
      })),
      search: context.querySpec.search
        ? { ...context.querySpec.search, columns: [...context.querySpec.search.columns] }
        : null,
      orderBy: context.querySpec.orderBy.map((sort) => ({ ...sort })),
    },
    limits: { ...context.limits },
  });

  const freezeDetachedAnalysisValue = <T,>(value: T): T => {
    if (value == null || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.values(value).forEach((item) => freezeDetachedAnalysisValue(item));
    return Object.freeze(value);
  };

  const serverWarnings = (
    start: AnalysisStart,
    supportingRowCount: number,
    supportingRowIds: string[],
    warnings: DataGridAnalysisWarning[],
  ) => {
    const result = warnings.map((warning) => ({ ...warning }));
    if (
      supportingRowIds.length < supportingRowCount &&
      !result.some((warning) => warning.code === "supporting_rows_truncated")
    ) {
      result.push({
        code: "supporting_rows_truncated",
        message: `The receipt includes ${supportingRowIds.length} evidence row IDs for ${supportingRowCount} analyzed rows.`,
        limit: supportingRowIds.length,
        actual: supportingRowCount,
      });
    }
    if (
      revisionRef.current.value !== start.gridRevision &&
      !result.some((warning) => warning.code === "view_changed_during_execution")
    ) {
      result.push({
        code: "view_changed_during_execution",
        message: "The grid view changed while this analysis was running; the receipt preserves the starting view.",
      });
    }
    return result;
  };

  const serverExecution = (
    provenance?: DataGridServerAnalysisProvenance,
  ): DataGridAnalysisReceipt["execution"] => ({
    mode: "server",
    adapterId: serverAnalysis?.id,
    sourceRevision: provenance?.sourceRevision,
    requestFingerprint: provenance?.requestFingerprint,
    effectiveOrdering: provenance?.effectiveOrdering,
  });

  const queryAsync = async (
    input: DataGridQuery,
    options?: DataGridAnalysisExecutionOptions,
  ): Promise<DataGridQueryResult> => {
    if (!unavailableScope(input.scope)) return query(input);
    if (!supportsRemoteScope("query", input.scope) || !serverAnalysis) {
      return analysisError(
        input.scope,
        "scope_unavailable",
        `${input.scope} is unavailable because no mounted server analysis adapter supports queries for this scope.`,
      );
    }
    const normalized = normalizeDataGridQuery(input, {
      columns: sourceColumns,
      defaultColumnIds: resolveQueryColumnIds(input.columnIds),
      limits: dataAccessLimits,
    });
    if (!normalized.ok) return { ok: false, scope: input.scope, error: normalized.error };
    const scope = input.scope as "all" | "filtered";
    const start = beginAnalysis("query", revisionRef.current.value);
    const signal = options?.signal ?? new AbortController().signal;
    if (signal.aborted) {
      return analysisError(scope, "analysis_aborted", "Server analysis was aborted before execution.");
    }
    const capturedContext = createServerContext(start, scope);
    const request = {
      operation: "query" as const,
      input: freezeDetachedAnalysisValue({
        ...normalized.value,
        scope,
        columnIds: [...normalized.value.columnIds],
      }),
      context: freezeDetachedAnalysisValue(cloneServerContext(capturedContext)),
      signal,
    };
    let rawPayload: unknown;
    try {
      rawPayload = await serverAnalysis.execute(request);
    } catch {
      return signal.aborted
        ? analysisError(scope, "analysis_aborted", "Server analysis was aborted.")
        : analysisError(scope, "analysis_failed", "The server analysis adapter could not complete the query.");
    }
    if (signal.aborted) {
      return analysisError(scope, "analysis_aborted", "Server analysis was aborted.");
    }
    const validated = validateDataGridServerAnalysisPayload(request, rawPayload);
    if (!validated.ok) {
      return analysisError(
        scope,
        "invalid_analysis_response",
        "The server analysis adapter returned an invalid query response.",
      );
    }
    if (validated.value.operation !== "query") {
      return analysisError(scope, "invalid_analysis_response", "The server analysis response operation did not match the request.");
    }
    const payload = validated.value;
    const supportingRowIds = payload.rows.map((row) => row.rowId);
    const warnings = serverWarnings(
      start,
      payload.rowCount,
      supportingRowIds,
      [...normalized.warnings, ...(payload.warnings ?? [])],
    );
    const replay = {
      operation: "query" as const,
      payload: { ...normalized.value, columnIds: [...normalized.value.columnIds] },
    };
    return {
      ok: true,
      scope,
      columns: receiptColumns(normalized.value.columnIds),
      rows: payload.rows.map((row) => ({
        rowId: row.rowId,
        values: { ...row.values },
      })),
      rowCount: payload.rowCount,
      returnedRowCount: payload.returnedRowCount,
      offset: payload.offset,
      truncated: payload.truncated,
      receipt: createReceipt({
        start,
        scope,
        columnIds: normalized.value.columnIds,
        supportingRowIds,
        supportingRowCount: payload.rowCount,
        supportingRowIdsTruncated: supportingRowIds.length < payload.rowCount,
        warnings,
        replay,
        execution: serverExecution(payload.provenance),
        capturedFilters: capturedContext.filters,
      }),
    };
  };

  const aggregateAsync = async (
    input: DataGridAggregateQuery,
    options?: DataGridAnalysisExecutionOptions,
  ): Promise<DataGridAggregateResult> => {
    if (!unavailableScope(input.scope)) return aggregate(input);
    if (!supportsRemoteScope("aggregate", input.scope) || !serverAnalysis) {
      return analysisError(
        input.scope,
        "scope_unavailable",
        `${input.scope} is unavailable because no mounted server analysis adapter supports aggregation for this scope.`,
      );
    }
    const normalized = normalizeDataGridAggregateQuery(input, {
      columns: sourceColumns,
      limits: dataAccessLimits,
    });
    if (!normalized.ok) return { ok: false, scope: input.scope, error: normalized.error };
    const scope = input.scope as "all" | "filtered";
    const start = beginAnalysis("aggregate", revisionRef.current.value);
    const signal = options?.signal ?? new AbortController().signal;
    if (signal.aborted) {
      return analysisError(scope, "analysis_aborted", "Server analysis was aborted before execution.");
    }
    const capturedContext = createServerContext(start, scope);
    const request = {
      operation: "aggregate" as const,
      input: freezeDetachedAnalysisValue({
        ...normalized.value,
        scope,
        metrics: normalized.value.metrics.map((metric) => ({ ...metric })),
        groupBy: [...normalized.value.groupBy],
      }),
      context: freezeDetachedAnalysisValue(cloneServerContext(capturedContext)),
      signal,
    };
    let rawPayload: unknown;
    try {
      rawPayload = await serverAnalysis.execute(request);
    } catch {
      return signal.aborted
        ? analysisError(scope, "analysis_aborted", "Server analysis was aborted.")
        : analysisError(scope, "analysis_failed", "The server analysis adapter could not complete the aggregate.");
    }
    if (signal.aborted) {
      return analysisError(scope, "analysis_aborted", "Server analysis was aborted.");
    }
    const validated = validateDataGridServerAnalysisPayload(request, rawPayload);
    if (!validated.ok) {
      return analysisError(
        scope,
        "invalid_analysis_response",
        "The server analysis adapter returned an invalid aggregate response.",
      );
    }
    if (validated.value.operation !== "aggregate") {
      return analysisError(scope, "invalid_analysis_response", "The server analysis response operation did not match the request.");
    }
    const payload = validated.value;
    const supportingRowIds = [...(payload.supportingRowIds ?? [])];
    const warnings = serverWarnings(
      start,
      payload.rowCount,
      supportingRowIds,
      [...normalized.warnings, ...(payload.warnings ?? [])],
    );
    const columnIds = [...new Set([
      ...normalized.value.groupBy,
      ...normalized.value.metrics.flatMap((metric) => metric.columnId ? [metric.columnId] : []),
    ])];
    const replay = {
      operation: "aggregate" as const,
      payload: {
        ...normalized.value,
        metrics: normalized.value.metrics.map((metric) => ({ ...metric })),
        groupBy: [...normalized.value.groupBy],
      },
    };
    return {
      ok: true,
      scope,
      rowCount: payload.rowCount,
      metrics: { ...payload.metrics },
      groups: payload.groups.map((group) => ({
        key: { ...group.key },
        rowCount: group.rowCount,
        metrics: { ...group.metrics },
      })),
      truncated: payload.truncated,
      receipt: createReceipt({
        start,
        scope,
        columnIds,
        aggregateBy: normalized.value.groupBy,
        supportingRowIds,
        supportingRowCount: payload.rowCount,
        supportingRowIdsTruncated: supportingRowIds.length < payload.rowCount,
        supportingGroupKeys: payload.groups.map((group) => group.key),
        warnings,
        replay,
        execution: serverExecution(payload.provenance),
        capturedFilters: capturedContext.filters,
      }),
    };
  };

  const dispatch = (
    commands: DataGridCommand[],
    applyChanges = true,
  ): DataGridCommandResult => {
    if (commands.length === 0) {
      return {
        ok: false,
        appliedCommandCount: 0,
        errors: [
          {
            commandIndex: 0,
            code: "empty_command",
            message: "At least one command is required.",
          },
        ],
      };
    }

    const errors: DataGridCommandError[] = [];
    const requireFeature = (
      enabled: boolean,
      commandIndex: number,
      featureName: string,
    ) => {
      if (!enabled) {
        addError(
          errors,
          commandIndex,
          "feature_disabled",
          `${featureName} is disabled for this grid.`,
        );
      }
    };

    commands.forEach((command, commandIndex) => {
      switch (command.type) {
        case "set_column_visibility":
          requireFeature(features.columnVisibility, commandIndex, "Column visibility");
          // Grouped columns may be removed from the rendered leaf model while
          // remaining valid source columns. Transactional plans can ungroup and
          // reveal them in the same batch, so validate against the source set.
          validateIds(command.columnIds, sourceColumnIdSet, errors, commandIndex, "column");
          break;
        case "move_columns":
          requireFeature(features.columnOrdering, commandIndex, "Column ordering");
          validateIds(command.columnIds, dataColumnIdSet, errors, commandIndex, "column");
          if (command.beforeColumnId != null && !dataColumnIdSet.has(command.beforeColumnId)) {
            addError(
              errors,
              commandIndex,
              "invalid_column",
              `Unknown target column id: ${command.beforeColumnId}`,
              command.beforeColumnId,
            );
          }
          if (
            command.beforeColumnId != null &&
            command.columnIds.includes(command.beforeColumnId)
          ) {
            addError(
              errors,
              commandIndex,
              "invalid_value",
              "A moved column cannot also be the target column.",
              command.beforeColumnId,
            );
          }
          break;
        case "pin_columns":
          requireFeature(features.columnPinning, commandIndex, "Column pinning");
          validateIds(command.columnIds, dataColumnIdSet, errors, commandIndex, "column");
          command.columnIds.forEach((columnId) => {
            if (dataColumnIdSet.has(columnId) && !table.getColumn(columnId)?.getCanPin()) {
              addError(
                errors,
                commandIndex,
                "invalid_column",
                `Column cannot be pinned: ${columnId}`,
                columnId,
              );
            }
            if (lockedLeftColumnIdSet.has(columnId) && command.position !== "left") {
              addError(
                errors,
                commandIndex,
                "invalid_value",
                `Column is locked to the left: ${columnId}`,
                columnId,
              );
            }
          });
          break;
        case "set_column_sizes": {
          requireFeature(features.columnResizing, commandIndex, "Column resizing");
          const entries = Object.entries(command.sizes);
          if (entries.length === 0) {
            addError(errors, commandIndex, "empty_command", "At least one column size is required.");
          }
          entries.forEach(([columnId, size]) => {
            if (!dataColumnIdSet.has(columnId)) {
              addError(
                errors,
                commandIndex,
                "invalid_column",
                `Unknown column id: ${columnId}`,
                columnId,
              );
              return;
            }
            const column = table.getColumn(columnId);
            if (!column?.getCanResize()) {
              addError(
                errors,
                commandIndex,
                "invalid_column",
                `Column cannot be resized: ${columnId}`,
                columnId,
              );
              return;
            }
            const minSize = column.columnDef.minSize ?? 0;
            const maxSize = column.columnDef.maxSize ?? Number.MAX_SAFE_INTEGER;
            if (!Number.isFinite(size) || size < minSize || size > maxSize) {
              addError(
                errors,
                commandIndex,
                "invalid_value",
                `Column size for ${columnId} must be between ${minSize} and ${maxSize}.`,
                columnId,
              );
            }
          });
          break;
        }
        case "reset_columns":
          break;
        case "set_sorting":
          requireFeature(features.sorting, commandIndex, "Sorting");
          if (hasDuplicates(command.sorting.map((sort) => sort.id))) {
            addError(errors, commandIndex, "duplicate_id", "Duplicate sort columns are not allowed.");
          }
          command.sorting.forEach((sort) => {
            if (!dataColumnIdSet.has(sort.id) || !table.getColumn(sort.id)?.getCanSort()) {
              addError(
                errors,
                commandIndex,
                "invalid_column",
                `Column cannot be sorted: ${sort.id}`,
                sort.id,
              );
            }
          });
          break;
        case "set_global_filter":
          requireFeature(features.globalSearch, commandIndex, "Global search");
          break;
        case "set_column_filters":
          requireFeature(features.headerFilters, commandIndex, "Column filtering");
          if (hasDuplicates(command.filters.map((filter) => filter.id))) {
            addError(errors, commandIndex, "duplicate_id", "Duplicate filter columns are not allowed.");
          }
          command.filters.forEach((filter) => {
            if (!filterableColumnIdSet.has(filter.id)) {
              addError(
                errors,
                commandIndex,
                "invalid_column",
                `Column cannot be filtered: ${filter.id}`,
                filter.id,
              );
            }
          });
          break;
        case "set_pagination":
          requireFeature(features.pagination, commandIndex, "Pagination");
          if (
            !Number.isInteger(command.pagination.pageIndex) ||
            command.pagination.pageIndex < 0 ||
            !Number.isInteger(command.pagination.pageSize) ||
            command.pagination.pageSize < 1
          ) {
            addError(errors, commandIndex, "invalid_value", "Pagination requires a non-negative pageIndex and positive pageSize.");
          }
          break;
        case "set_row_selection":
          requireFeature(features.rowSelection, commandIndex, "Row selection");
          validateIds(command.rowIds, loadedRowIdSet, errors, commandIndex, "row", true);
          break;
        case "set_selected_columns":
          validateIds(command.columnIds, sourceColumnIdSet, errors, commandIndex, "column", true);
          break;
        case "set_cell_selection":
          requireFeature(features.cellSelection, commandIndex, "Cell selection");
          if (command.selection) {
            [command.selection.anchor.columnId, command.selection.focus.columnId].forEach((id) =>
              validateIds([id], sourceColumnIdSet, errors, commandIndex, "column"),
            );
            [command.selection.anchor.rowId, command.selection.focus.rowId].forEach((id) =>
              validateIds([id], loadedRowIdSet, errors, commandIndex, "row"),
            );
          }
          break;
        case "set_column_presentation":
          validateIds(
            Object.keys(command.presentation),
            sourceColumnIdSet,
            errors,
            commandIndex,
            "column",
            true,
          );
          Object.entries(command.presentation).forEach(([columnId, presentation]) => {
            const message = validatePresentationValue(presentation);
            if (message) addError(errors, commandIndex, "invalid_value", message, columnId);
          });
          break;
        case "set_grouping":
          requireFeature(features.grouping, commandIndex, "Grouping");
          if (layoutMode === "pivot") {
            addError(
              errors,
              commandIndex,
              "unsupported_layout",
              "Use set_pivot to change row axes in pivot layout.",
            );
          }
          validateIds(
            command.columnIds,
            groupableColumnIdSet,
            errors,
            commandIndex,
            "column",
            true,
          );
          break;
        case "set_pivot": {
          if (layoutMode !== "pivot") {
            addError(
              errors,
              commandIndex,
              "unsupported_layout",
              "Pivot state can only be changed in pivot layout.",
            );
          }
          const pivotColumnIds = [
            ...command.pivot.rows,
            ...(command.pivot.columns?.map((axis) => axis.columnId) ?? []),
          ];
          if (hasDuplicates(command.pivot.rows)) {
            addError(errors, commandIndex, "duplicate_id", "Duplicate pivot row axes are not allowed.");
          }
          if (hasDuplicates(command.pivot.columns?.map((axis) => axis.columnId) ?? [])) {
            addError(errors, commandIndex, "duplicate_id", "Duplicate pivot column axes are not allowed.");
          }
          pivotColumnIds.forEach((columnId) => {
            if (!sourceColumnIdSet.has(columnId)) {
              addError(
                errors,
                commandIndex,
                "invalid_column",
                `Unknown pivot source column id: ${columnId}`,
                columnId,
              );
            }
          });
          if (hasDuplicates(command.pivot.measures)) {
            addError(errors, commandIndex, "duplicate_id", "Duplicate pivot measures are not allowed.");
          }
          command.pivot.measures.forEach((measureId) => {
            if (!pivotMeasureIdSet.has(measureId)) {
              addError(
                errors,
                commandIndex,
                "invalid_value",
                `Unknown pivot measure id: ${measureId}`,
                measureId,
              );
            }
          });
          break;
        }
      }
    });

    if (errors.length > 0) {
      return { ok: false, appliedCommandCount: 0, errors };
    }

    if (!applyChanges) {
      return { ok: true, appliedCommandCount: commands.length, errors: [] };
    }

    let nextSorting = state.sorting;
    let nextGlobalFilter = state.globalFilter;
    let nextColumnFilters = state.columnFilters;
    let nextColumnVisibility = state.columnVisibility;
    let nextColumnSizing = state.columnSizing;
    let nextColumnOrder = state.columnOrder;
    let nextColumnPinning = state.columnPinning;
    let nextPagination = state.pagination;
    let nextRowSelection = state.rowSelection;
    let nextSelectedColumnIds = state.selectedColumnIds;
    let nextCellSelection = state.cellSelection;
    let nextColumnPresentation = state.columnPresentation;
    let nextGrouping = state.grouping;
    let nextPivot = state.pivot;
    const changed = new Set<keyof GridEmitters>();
    const clearStorage = {
      columnSizing: false,
      columnOrder: false,
      columnPinning: false,
    };

    const wrapDataColumnOrder = (orderedDataColumnIds: string[]): ColumnOrderState => [
      ...(table.getColumn(SELECT_COLUMN_ID) ? [SELECT_COLUMN_ID] : []),
      ...orderedDataColumnIds,
      ...(table.getColumn(ROW_ACTIONS_COLUMN_ID) ? [ROW_ACTIONS_COLUMN_ID] : []),
    ];

    commands.forEach((command) => {
      switch (command.type) {
        case "set_column_visibility": {
          nextColumnVisibility = { ...nextColumnVisibility };
          command.columnIds.forEach((columnId) => {
            nextColumnVisibility[columnId] = command.visible;
          });
          changed.add("columnVisibility");
          break;
        }
        case "move_columns": {
          const currentOrder = nextColumnOrder.filter((id) => dataColumnIdSet.has(id));
          dataColumnIds.forEach((id) => {
            if (!currentOrder.includes(id)) currentOrder.push(id);
          });
          const movingIdSet = new Set(command.columnIds);
          const remaining = currentOrder.filter((id) => !movingIdSet.has(id));
          const targetIndex = command.beforeColumnId
            ? remaining.indexOf(command.beforeColumnId)
            : remaining.length;
          remaining.splice(targetIndex, 0, ...command.columnIds);
          nextColumnOrder = wrapDataColumnOrder(remaining);
          clearStorage.columnOrder = false;
          changed.add("columnOrder");
          break;
        }
        case "pin_columns": {
          const movingIdSet = new Set(command.columnIds);
          const left = (nextColumnPinning.left ?? []).filter((id) => !movingIdSet.has(id));
          const right = (nextColumnPinning.right ?? []).filter((id) => !movingIdSet.has(id));
          if (command.position === "left") left.push(...command.columnIds);
          if (command.position === "right") right.push(...command.columnIds);
          nextColumnPinning = { left, right };
          clearStorage.columnPinning = false;
          changed.add("columnPinning");
          break;
        }
        case "set_column_sizes":
          nextColumnSizing = { ...nextColumnSizing, ...command.sizes };
          clearStorage.columnSizing = false;
          changed.add("columnSizing");
          break;
        case "reset_columns":
          nextColumnVisibility = {};
          nextColumnSizing = {};
          nextColumnOrder = [...defaultColumnOrder];
          nextColumnPinning = {
            left: [...(defaultColumnPinning.left ?? [])],
            right: [...(defaultColumnPinning.right ?? [])],
          };
          clearStorage.columnSizing = true;
          clearStorage.columnOrder = true;
          clearStorage.columnPinning = true;
          changed.add("columnVisibility");
          changed.add("columnSizing");
          changed.add("columnOrder");
          changed.add("columnPinning");
          break;
        case "set_sorting":
          nextSorting = command.sorting.map((sort) => ({ ...sort }));
          changed.add("sorting");
          break;
        case "set_global_filter":
          nextGlobalFilter = command.value;
          changed.add("globalFilter");
          break;
        case "set_column_filters":
          nextColumnFilters = command.filters.map((filter) => ({ ...filter }));
          changed.add("columnFilters");
          break;
        case "set_pagination":
          nextPagination = { ...command.pagination };
          changed.add("pagination");
          break;
        case "set_row_selection": {
          const selection = command.mode === "replace" || command.mode == null
            ? {}
            : { ...nextRowSelection };
          command.rowIds.forEach((rowId) => {
            if (command.mode === "remove") {
              delete selection[rowId];
            } else {
              selection[rowId] = true;
            }
          });
          nextRowSelection = selection;
          changed.add("rowSelection");
          break;
        }
        case "set_selected_columns": {
          const selection = command.mode === "replace" || command.mode == null
            ? []
            : [...nextSelectedColumnIds];
          const selected = new Set(selection);
          command.columnIds.forEach((columnId) => {
            if (command.mode === "remove") selected.delete(columnId);
            else selected.add(columnId);
          });
          nextSelectedColumnIds = [...columnsById.keys()].filter((columnId) => selected.has(columnId));
          changed.add("selectedColumnIds");
          break;
        }
        case "set_cell_selection":
          nextCellSelection = command.selection
            ? {
                anchor: { ...command.selection.anchor },
                focus: { ...command.selection.focus },
              }
            : null;
          changed.add("cellSelection");
          break;
        case "set_column_presentation":
          nextColumnPresentation = command.mode === "replace"
            ? cloneSnapshotValue(command.presentation) as DataGridColumnPresentationState
            : {
                ...nextColumnPresentation,
                ...cloneSnapshotValue(command.presentation) as DataGridColumnPresentationState,
              };
          changed.add("columnPresentation");
          break;
        case "set_grouping":
          nextGrouping = [...command.columnIds];
          changed.add("grouping");
          break;
        case "set_pivot":
          nextPivot = clonePivot(command.pivot);
          changed.add("pivot");
          break;
      }
    });

    if (changed.has("sorting")) emitters.sorting(nextSorting);
    if (changed.has("globalFilter")) emitters.globalFilter(nextGlobalFilter);
    if (changed.has("columnFilters")) emitters.columnFilters(nextColumnFilters);
    if (changed.has("columnVisibility")) emitters.columnVisibility(nextColumnVisibility);
    if (changed.has("columnSizing")) emitters.columnSizing(nextColumnSizing);
    if (changed.has("columnOrder")) emitters.columnOrder(nextColumnOrder);
    if (changed.has("columnPinning")) emitters.columnPinning(nextColumnPinning);
    if (changed.has("pagination")) emitters.pagination(nextPagination);
    if (changed.has("rowSelection")) emitters.rowSelection(nextRowSelection);
    if (changed.has("selectedColumnIds")) emitters.selectedColumnIds(nextSelectedColumnIds);
    if (changed.has("cellSelection")) emitters.cellSelection(nextCellSelection);
    if (changed.has("columnPresentation")) emitters.columnPresentation(nextColumnPresentation);
    if (changed.has("grouping")) emitters.grouping(nextGrouping);
    if (changed.has("pivot")) emitters.pivot(nextPivot);

    if (clearStorage.columnSizing && controlledState?.columnSizing === undefined) {
      removeJson(storageKeys?.columnSizing);
    }
    if (clearStorage.columnOrder && controlledState?.columnOrder === undefined) {
      removeJson(storageKeys?.columnOrder);
    }
    if (clearStorage.columnPinning && controlledState?.columnPinning === undefined) {
      removeJson(storageKeys?.columnPinning);
    }

    return { ok: true, appliedCommandCount: commands.length, errors: [] };
  };

  const simulateCommands = (commands: DataGridCommand[]): GridState => {
    const next: GridState = {
      ...state,
      sorting: state.sorting,
      columnFilters: state.columnFilters,
      columnVisibility: state.columnVisibility,
      columnSizing: state.columnSizing,
      columnOrder: state.columnOrder,
      columnPinning: state.columnPinning,
      pagination: state.pagination,
      rowSelection: state.rowSelection,
      selectedColumnIds: state.selectedColumnIds,
      cellSelection: state.cellSelection,
      columnPresentation: state.columnPresentation,
      grouping: state.grouping,
      pivot: state.pivot,
    };
    const wrapDataColumnOrder = (orderedDataColumnIds: string[]): ColumnOrderState => [
      ...(table.getColumn(SELECT_COLUMN_ID) ? [SELECT_COLUMN_ID] : []),
      ...orderedDataColumnIds,
      ...(table.getColumn(ROW_ACTIONS_COLUMN_ID) ? [ROW_ACTIONS_COLUMN_ID] : []),
    ];

    commands.forEach((command) => {
      switch (command.type) {
        case "set_column_visibility":
          next.columnVisibility = { ...next.columnVisibility };
          command.columnIds.forEach((columnId) => {
            next.columnVisibility[columnId] = command.visible;
          });
          break;
        case "move_columns": {
          const currentOrder = next.columnOrder.filter((id) => dataColumnIdSet.has(id));
          dataColumnIds.forEach((id) => {
            if (!currentOrder.includes(id)) currentOrder.push(id);
          });
          const movingIdSet = new Set(command.columnIds);
          const remaining = currentOrder.filter((id) => !movingIdSet.has(id));
          const targetIndex = command.beforeColumnId
            ? remaining.indexOf(command.beforeColumnId)
            : remaining.length;
          remaining.splice(targetIndex, 0, ...command.columnIds);
          next.columnOrder = wrapDataColumnOrder(remaining);
          break;
        }
        case "pin_columns": {
          const movingIdSet = new Set(command.columnIds);
          const left = (next.columnPinning.left ?? []).filter((id) => !movingIdSet.has(id));
          const right = (next.columnPinning.right ?? []).filter((id) => !movingIdSet.has(id));
          if (command.position === "left") left.push(...command.columnIds);
          if (command.position === "right") right.push(...command.columnIds);
          next.columnPinning = { left, right };
          break;
        }
        case "set_column_sizes":
          next.columnSizing = { ...next.columnSizing, ...command.sizes };
          break;
        case "reset_columns":
          next.columnVisibility = {};
          next.columnSizing = {};
          next.columnOrder = [...defaultColumnOrder];
          next.columnPinning = {
            left: [...(defaultColumnPinning.left ?? [])],
            right: [...(defaultColumnPinning.right ?? [])],
          };
          break;
        case "set_sorting":
          next.sorting = command.sorting.map((sort) => ({ ...sort }));
          break;
        case "set_global_filter":
          next.globalFilter = command.value;
          break;
        case "set_column_filters":
          next.columnFilters = command.filters.map((filter) => ({ ...filter }));
          break;
        case "set_pagination":
          next.pagination = { ...command.pagination };
          break;
        case "set_row_selection": {
          const selection = command.mode === "replace" || command.mode == null
            ? {}
            : { ...next.rowSelection };
          command.rowIds.forEach((rowId) => {
            if (command.mode === "remove") delete selection[rowId];
            else selection[rowId] = true;
          });
          next.rowSelection = selection;
          break;
        }
        case "set_selected_columns": {
          const selected = new Set(
            command.mode === "replace" || command.mode == null
              ? []
              : next.selectedColumnIds,
          );
          command.columnIds.forEach((columnId) => {
            if (command.mode === "remove") selected.delete(columnId);
            else selected.add(columnId);
          });
          next.selectedColumnIds = [...columnsById.keys()].filter((columnId) => selected.has(columnId));
          break;
        }
        case "set_cell_selection":
          next.cellSelection = command.selection
            ? {
                anchor: { ...command.selection.anchor },
                focus: { ...command.selection.focus },
              }
            : null;
          break;
        case "set_column_presentation":
          next.columnPresentation = command.mode === "replace"
            ? cloneSnapshotValue(command.presentation) as DataGridColumnPresentationState
            : {
                ...next.columnPresentation,
                ...cloneSnapshotValue(command.presentation) as DataGridColumnPresentationState,
              };
          break;
        case "set_grouping":
          next.grouping = [...command.columnIds];
          break;
        case "set_pivot":
          next.pivot = clonePivot(command.pivot);
          break;
      }
    });
    return next;
  };

  const stateKeysForCommand = (command: DataGridCommand): DataGridTransactionStateKey[] => {
    switch (command.type) {
      case "set_column_visibility": return ["columnVisibility"];
      case "move_columns": return ["columnOrder"];
      case "pin_columns": return ["columnPinning"];
      case "set_column_sizes": return ["columnSizing"];
      case "reset_columns": return ["columnVisibility", "columnSizing", "columnOrder", "columnPinning"];
      case "set_sorting": return ["sorting"];
      case "set_global_filter": return ["globalFilter"];
      case "set_column_filters": return ["columnFilters"];
      case "set_pagination": return ["pagination"];
      case "set_row_selection": return ["rowSelection"];
      case "set_selected_columns": return ["selectedColumnIds"];
      case "set_cell_selection": return ["cellSelection"];
      case "set_column_presentation": return ["columnPresentation"];
      case "set_grouping": return ["grouping"];
      case "set_pivot": return ["pivot"];
    }
  };

  const commandColumnIds = (command: DataGridCommand): string[] => {
    switch (command.type) {
      case "set_column_visibility":
      case "move_columns":
      case "pin_columns":
      case "set_selected_columns":
      case "set_grouping":
        return [...command.columnIds, ...(command.type === "move_columns" && command.beforeColumnId
          ? [command.beforeColumnId]
          : [])];
      case "set_column_sizes": return Object.keys(command.sizes);
      case "reset_columns": return [...sourceColumnIdSet];
      case "set_sorting": return command.sorting.map((sort) => sort.id);
      case "set_column_filters": return command.filters.map((filter) => filter.id);
      case "set_column_presentation": return Object.keys(command.presentation);
      case "set_cell_selection": return command.selection
        ? [command.selection.anchor.columnId, command.selection.focus.columnId]
        : [];
      case "set_pivot": return [
        ...command.pivot.rows,
        ...(command.pivot.columns?.map((axis) => axis.columnId) ?? []),
      ];
      default: return [];
    }
  };

  const commandRowIds = (command: DataGridCommand): string[] => {
    if (command.type === "set_row_selection") return command.rowIds;
    if (command.type === "set_cell_selection" && command.selection) {
      return [command.selection.anchor.rowId, command.selection.focus.rowId];
    }
    return [];
  };

  const buildDiff = (commands: DataGridCommand[]): DataGridTransactionDiff => {
    const next = simulateCommands(commands);
    const keys = [...new Set(commands.flatMap(stateKeysForCommand))];
    return {
      entries: keys.flatMap((stateKey) => {
        const before = toSerializableValue(state[stateKey]);
        const after = toSerializableValue(next[stateKey]);
        return JSON.stringify(before) === JSON.stringify(after)
          ? []
          : [{ stateKey, before, after }];
      }),
      commandTypes: commands.map((command) => command.type),
      columnIds: [...new Set(commands.flatMap(commandColumnIds))],
      rowIds: [...new Set(commands.flatMap(commandRowIds))],
    };
  };

  const plan = (commands: DataGridCommand[]): DataGridPlanResult => {
    const validation = dispatch(commands, false);
    if (!validation.ok) return { ok: false, plan: null, errors: validation.errors };
    const detachedCommands = cloneSnapshotValue(commands) as DataGridCommand[];
    return {
      ok: true,
      plan: {
        planId: `dg-plan-${revisionRef.current.value}-${Date.now().toString(36)}-${++actionPlanSequence}`,
        baseRevision: revisionRef.current.value,
        commands: detachedCommands,
        diff: buildDiff(detachedCommands),
      },
      errors: [],
    };
  };

  const stalePlanError = (baseRevision: number): DataGridCommandError => ({
    commandIndex: 0,
    code: "stale_revision",
    message: `Plan revision ${baseRevision} does not match current grid revision ${revisionRef.current.value}.`,
  });

  const validatePlan = (candidate: DataGridActionPlan): DataGridPlanValidationResult => {
    if (pendingApplyBaseRevisionRef.current === candidate.baseRevision) {
      return {
        ok: false,
        planId: candidate.planId,
        revision: revisionRef.current.value,
        errors: [{
          commandIndex: 0,
          code: "stale_revision",
          message: `Another transaction has already been applied from revision ${candidate.baseRevision} and is awaiting commit.`,
        }],
      };
    }
    if (candidate.baseRevision !== revisionRef.current.value) {
      return {
        ok: false,
        planId: candidate.planId,
        revision: revisionRef.current.value,
        errors: [stalePlanError(candidate.baseRevision)],
      };
    }
    const validation = dispatch(candidate.commands, false);
    if (!validation.ok) {
      return {
        ok: false,
        planId: candidate.planId,
        revision: revisionRef.current.value,
        errors: validation.errors,
      };
    }
    return {
      ok: true,
      planId: candidate.planId,
      revision: revisionRef.current.value,
      diff: buildDiff(candidate.commands),
      errors: [],
    };
  };

  const applyPlan = (candidate: DataGridActionPlan): DataGridApplyPlanResult => {
    const validation = validatePlan(candidate);
    if (!validation.ok) return { ok: false, receipt: null, errors: validation.errors };
    const beforeState = Object.fromEntries(
      validation.diff.entries.map(({ stateKey }) => [stateKey, cloneSnapshotValue(state[stateKey])]),
    ) as Partial<GridState>;
    const result = dispatch(candidate.commands);
    if (!result.ok) return { ok: false, receipt: null, errors: result.errors };
    pendingApplyBaseRevisionRef.current = candidate.baseRevision;
    const transactionId = `dg-tx-${candidate.baseRevision}-${Date.now().toString(36)}-${++transactionSequence}`;
    const appliedRevision = candidate.baseRevision + (validation.diff.entries.length > 0 ? 1 : 0);
    transactionsRef.current.set(transactionId, {
      expectedRevision: appliedRevision,
      beforeState,
      diff: validation.diff,
    });
    return {
      ok: true,
      receipt: {
        transactionId,
        planId: candidate.planId,
        baseRevision: candidate.baseRevision,
        appliedRevision,
        appliedCommandCount: candidate.commands.length,
        diff: validation.diff,
      },
      errors: [],
    };
  };

  const undo = (transactionId: string): DataGridUndoResult => {
    const transaction = transactionsRef.current.get(transactionId);
    if (!transaction) {
      return {
        ok: false,
        transactionId: null,
        revertedTransactionId: transactionId,
        revision: revisionRef.current.value,
        errors: [{
          commandIndex: 0,
          code: "invalid_value",
          message: `Unknown or already undone transaction: ${transactionId}.`,
        }],
      };
    }
    if (transaction.expectedRevision !== revisionRef.current.value) {
      return {
        ok: false,
        transactionId: null,
        revertedTransactionId: transactionId,
        revision: revisionRef.current.value,
        errors: [stalePlanError(transaction.expectedRevision)],
      };
    }
    transaction.diff.entries.forEach(({ stateKey }) => {
      const value = cloneSnapshotValue(transaction.beforeState[stateKey]);
      switch (stateKey) {
        case "sorting": emitters.sorting(value as SortingState); break;
        case "globalFilter": emitters.globalFilter(value as string); break;
        case "columnFilters": emitters.columnFilters(value as ColumnFiltersState); break;
        case "columnVisibility": emitters.columnVisibility(value as VisibilityState); break;
        case "columnSizing": emitters.columnSizing(value as ColumnSizingState); break;
        case "columnOrder": emitters.columnOrder(value as ColumnOrderState); break;
        case "columnPinning": emitters.columnPinning(value as ColumnPinningState); break;
        case "pagination": emitters.pagination(value as PaginationState); break;
        case "rowSelection": emitters.rowSelection(value as RowSelectionState); break;
        case "selectedColumnIds": emitters.selectedColumnIds(value as string[]); break;
        case "cellSelection": emitters.cellSelection(value as DataGridCellRange | null); break;
        case "columnPresentation": emitters.columnPresentation(value as DataGridColumnPresentationState); break;
        case "grouping": emitters.grouping(value as GroupingState); break;
        case "pivot": emitters.pivot(value as DataGridPivotState); break;
        case "expanded": break;
      }
    });
    transactionsRef.current.delete(transactionId);
    const undoTransactionId = `dg-undo-${revisionRef.current.value}-${Date.now().toString(36)}-${++transactionSequence}`;
    return {
      ok: true,
      transactionId: undoTransactionId,
      revertedTransactionId: transactionId,
      revision: revisionRef.current.value + (transaction.diff.entries.length > 0 ? 1 : 0),
      diff: {
        ...transaction.diff,
        entries: transaction.diff.entries.map((entry) => ({
          ...entry,
          before: entry.after,
          after: entry.before,
        })),
      },
      errors: [],
    };
  };

  useImperativeHandle(apiRef, () => ({
    getSnapshot,
    query,
    aggregate,
    queryAsync,
    aggregateAsync,
    plan,
    validatePlan,
    applyPlan,
    undo,
    dispatch,
  }));
}
