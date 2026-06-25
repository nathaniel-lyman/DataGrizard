import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getGroupedRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type Column,
  type FilterFn,
  type ColumnOrderState,
  type ColumnPinningState,
  type ColumnSizingState,
  type ExpandedState,
  type GroupingState,
  type PaginationState,
  type Row,
  type RowSelectionState,
  type SortingFn,
  type SortingState,
  type Updater,
  type VisibilityState,
} from "@tanstack/react-table";
import type { GridColumnConfig, GridDataType, GridFilterConfig, GridFilterType } from "../../types/grid";

// Widened, value-erased view of a column config used internally by the engine.
// The public GridColumnConfig is a per-key union (value: TData[K]); the engine
// works generically over `unknown` cell values, so consumer columns are cast to
// this shape once at the prop boundary.
type AnyColumnConfig<TData> = {
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
};

// Props attached to a row when virtualization is active so @tanstack/react-virtual
// can measure its real height. Undefined when not virtualizing.
type RowMeasureProps = {
  ref: (node: HTMLTableRowElement | null) => void;
  "data-index": number;
};
import {
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
  formatStatusLabel,
  toDate,
  type FormatOptions,
} from "../../utils/formatters";
import { Toolbar } from "./Toolbar";
import { FilterPopover, type GridFilter } from "./filters";
import { MinusIcon, PlusIcon, SortIcon } from "./icons";
import {
  PIVOT_ROW_LABEL_COLUMN_ID,
  materializePivot,
  type DataGridPivotCellContext,
  type DataGridPivotColumnAxis,
  type DataGridPivotConfig,
  type DataGridPivotMeasure,
  type DataGridPivotState,
  type PivotRow,
} from "./pivot";

type PivotMeasureColumnMeta = {
  kind?: "pivotMeasure";
  columnPath?: Array<{ label?: ReactNode }>;
  totalLevel?: "subtotal" | "grandTotal";
};

export type DataGridFeatures = {
  toolbar: boolean;
  globalSearch: boolean;
  sorting: boolean;
  columnVisibility: boolean;
  columnResizing: boolean;
  columnOrdering: boolean;
  columnPinning: boolean;
  savedViews: boolean;
  pagination: boolean;
  rowSelection: boolean;
  detailPanel: boolean;
  summaries: boolean;
  grouping: boolean;
  /** Grid mode: render an always-visible filter row under the headers. */
  floatingFilters: boolean;
};

export type DataGridSummaryScope = "filtered" | "selected" | "group";

export type DataGridSummarySelectionMode = "auto" | Exclude<DataGridSummaryScope, "group">;

export type DataGridGroupingState = GroupingState;

export type DataGridExpandedState = ExpandedState;

export type DataGridColumnPinningState = ColumnPinningState;

export type DataGridLayoutMode = "grid" | "pivot";

/**
 * A grid-mode column-group band. `children` are leaf column `accessorKey`s or
 * nested groups. Groups render as header bands over their (visible) leaf
 * columns through the standard `getHeaderGroups()` path. Ignored in pivot mode.
 */
export type DataGridColumnGroup = {
  groupId: string;
  header: string;
  children: Array<string | DataGridColumnGroup>;
};

export type DataGridSummaryContext<TData extends object> = {
  rows: TData[];
  filteredRows: TData[];
  selectedRows: TData[];
  allRows: TData[];
  scope: DataGridSummaryScope;
};

export type DataGridSummaryItem<TData extends object> = {
  id: string;
  columnId?: Extract<keyof TData, string>;
  label: string;
  value: (context: DataGridSummaryContext<TData>) => ReactNode;
  description?: (context: DataGridSummaryContext<TData>) => ReactNode;
};

export type DataGridSavedView = {
  sorting: SortingState;
  globalFilter: string;
  columnFilters: ColumnFiltersState;
  columnVisibility: VisibilityState;
  columnSizing: ColumnSizingState;
  columnOrder?: ColumnOrderState;
  columnPinning?: ColumnPinningState;
  grouping?: GroupingState;
  pivot?: DataGridPivotState;
};

export type DataGridSavedViews = Record<string, DataGridSavedView>;

export type DataGridControlledState = {
  sorting?: SortingState;
  globalFilter?: string;
  columnFilters?: ColumnFiltersState;
  columnVisibility?: VisibilityState;
  columnSizing?: ColumnSizingState;
  columnOrder?: ColumnOrderState;
  columnPinning?: ColumnPinningState;
  pagination?: PaginationState;
  rowSelection?: RowSelectionState;
  grouping?: GroupingState;
  expanded?: ExpandedState;
  pivot?: DataGridPivotState;
  savedViews?: DataGridSavedViews;
  activeViewName?: string;
};

export type DataGridProps<TData extends object> = {
  data: TData[];
  columns: GridColumnConfig<TData>[];
  layoutMode?: DataGridLayoutMode;
  /** Grid-mode header bands. Ignored in pivot mode. */
  columnGroups?: DataGridColumnGroup[];
  pivot?: DataGridPivotConfig<TData>;
  filters?: GridFilterConfig<TData>[];
  summaryItems?: DataGridSummaryItem<TData>[];
  groupSummaryItems?: DataGridSummaryItem<TData>[];
  summarySelectionMode?: DataGridSummarySelectionMode;
  features?: Partial<DataGridFeatures>;
  isLoading?: boolean;
  error?: ReactNode;
  emptyState?: ReactNode;
  loadingState?: ReactNode;
  state?: DataGridControlledState;
  onSortingChange?: (sorting: SortingState) => void;
  onGlobalFilterChange?: (globalFilter: string) => void;
  onColumnFiltersChange?: (columnFilters: ColumnFiltersState) => void;
  onColumnVisibilityChange?: (columnVisibility: VisibilityState) => void;
  onColumnSizingChange?: (columnSizing: ColumnSizingState) => void;
  onColumnOrderChange?: (columnOrder: ColumnOrderState) => void;
  onColumnPinningChange?: (columnPinning: ColumnPinningState) => void;
  onPaginationChange?: (pagination: PaginationState) => void;
  onRowSelectionChange?: (rowSelection: RowSelectionState) => void;
  onGroupingChange?: (grouping: GroupingState) => void;
  onExpandedChange?: (expanded: ExpandedState) => void;
  onPivotChange?: (pivot: DataGridPivotState) => void;
  onSavedViewsChange?: (savedViews: DataGridSavedViews) => void;
  onActiveViewNameChange?: (activeViewName: string) => void;
  defaultGrouping?: GroupingState;
  defaultColumnPinning?: ColumnPinningState;
  storageKey?: string;
  rowLabel?: string;
  tableLabel?: string;
  locale?: string;
  currency?: string;
  dateFormat?: Intl.DateTimeFormatOptions;
  searchPlaceholder?: string;
  viewNamePlaceholder?: string;
  pageSizeOptions?: number[];
  /** Window the rows for large datasets (opt-in). Best with pagination off. */
  virtualizeRows?: boolean;
  /** Estimated row height in px used to seed the virtualizer. */
  estimatedRowHeight?: number;
  renderDetailPanel?: (row: TData | null, controls: { close: () => void }) => ReactNode;
  getRowId?: (row: TData, index: number, parent?: Row<TData>) => string;
  getRowLabel?: (row: TData) => string;
  getRowClassName?: (row: TData) => string;
  onRowClick?: (row: TData) => void;
  onActiveRowChange?: (row: TData | null) => void;
};

const defaultFeatures: DataGridFeatures = {
  toolbar: true,
  globalSearch: true,
  sorting: true,
  columnVisibility: true,
  columnResizing: true,
  columnOrdering: true,
  columnPinning: true,
  savedViews: true,
  pagination: true,
  rowSelection: true,
  detailPanel: true,
  summaries: true,
  grouping: true,
  floatingFilters: false,
};

const resolveUpdater = <TValue,>(updater: Updater<TValue>, current: TValue): TValue =>
  typeof updater === "function" ? (updater as (old: TValue) => TValue)(current) : updater;

const loadJson = <TValue,>(key: string | undefined, fallback: TValue): TValue => {
  if (!key || typeof window === "undefined") {
    return fallback;
  }

  try {
    const stored = window.localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as TValue) : fallback;
  } catch {
    return fallback;
  }
};

const saveJson = (key: string | undefined, value: unknown) => {
  if (!key || typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
};

const removeJson = (key: string | undefined) => {
  if (!key || typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(key);
};

const uniqueIds = (ids: string[]) => Array.from(new Set(ids.filter(Boolean)));

const normalizeColumnPinning = (
  pinning: ColumnPinningState | undefined,
  lockedLeftIds: string[] = [],
): ColumnPinningState => {
  const right = uniqueIds(pinning?.right ?? []).filter((id) => !lockedLeftIds.includes(id));
  const left = uniqueIds([...(lockedLeftIds ?? []), ...(pinning?.left ?? [])]).filter(
    (id) => !right.includes(id),
  );

  return { left, right };
};

const uniqueColumnValues = <TData extends object>(
  data: TData[],
  key: Extract<keyof TData, string>,
) => Array.from(new Set(data.map((row) => String(row[key] ?? "")))).filter(Boolean).sort();

// Assemble flat leaf ColumnDefs into nested grouped ColumnDefs per columnGroups.
// A group is emitted at the position of its first-encountered member and pulls
// all its (declared-order) leaves into the band; columns named in no group stay
// standalone. Bands span their visible leaves automatically via getHeaderGroups.
const buildGroupedColumnDefs = <TData,>(
  dataDefs: ColumnDef<TData>[],
  columnGroups: DataGridColumnGroup[],
): ColumnDef<TData>[] => {
  const defByKey = new Map<string, ColumnDef<TData>>();
  dataDefs.forEach((def) => {
    const key = (def as { accessorKey?: string }).accessorKey;
    if (key) {
      defByKey.set(key, def);
    }
  });

  const topGroupByKey = new Map<string, DataGridColumnGroup>();
  const collectLeaves = (group: DataGridColumnGroup, top: DataGridColumnGroup) => {
    group.children.forEach((child) => {
      if (typeof child === "string") {
        topGroupByKey.set(child, top);
      } else {
        collectLeaves(child, top);
      }
    });
  };
  columnGroups.forEach((group) => collectLeaves(group, group));

  const consumed = new Set<string>();
  const buildGroup = (group: DataGridColumnGroup): ColumnDef<TData> | null => {
    const columns = group.children
      .map((child) => {
        if (typeof child === "string") {
          const def = defByKey.get(child);
          if (!def) {
            return null;
          }
          consumed.add(child);
          return def;
        }
        return buildGroup(child);
      })
      .filter((def): def is ColumnDef<TData> => Boolean(def));
    if (!columns.length) {
      return null;
    }
    return { id: group.groupId, header: group.header, columns };
  };

  const result: ColumnDef<TData>[] = [];
  dataDefs.forEach((def) => {
    const key = (def as { accessorKey?: string }).accessorKey;
    if (key && consumed.has(key)) {
      return;
    }
    const top = key ? topGroupByKey.get(key) : undefined;
    if (!top) {
      result.push(def);
      if (key) {
        consumed.add(key);
      }
      return;
    }
    const groupDef = buildGroup(top);
    if (groupDef) {
      result.push(groupDef);
    }
  });
  return result;
};

const isPivotRow = <TData extends object>(row: TData | PivotRow<TData>): row is PivotRow<TData> =>
  "__pivot" in row && row.__pivot === true;

const isGeneratedPivotColumnId = (columnId: string) =>
  columnId === PIVOT_ROW_LABEL_COLUMN_ID || columnId.startsWith("measure:");

const reactNodeToText = (value: ReactNode) => {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  return "";
};

const isNumericDataType = (dataType: GridDataType) =>
  dataType === "currency" || dataType === "number" || dataType === "percent";

const formatNumericValue = (
  dataType: GridDataType,
  value: unknown,
  formatOptions: FormatOptions,
) => {
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

const getColumnControlLabel = <TData extends object>(
  column: Column<TData | PivotRow<TData>, unknown>,
) => {
  const label = String(column.columnDef.header ?? column.id);
  const meta = column.columnDef.meta as PivotMeasureColumnMeta | undefined;
  if (meta?.kind !== "pivotMeasure") {
    return label;
  }

  const pathLabel = meta.columnPath?.map((segment) => reactNodeToText(segment.label)).filter(Boolean);
  if (meta.totalLevel === "grandTotal") {
    return `Grand Total ${label}`;
  }
  if (meta.totalLevel === "subtotal") {
    return `${pathLabel?.join(" / ") || "Subtotal"} ${label}`;
  }
  if (pathLabel?.length) {
    return `${pathLabel.join(" / ")} ${label}`;
  }
  return label;
};

const hasDateBounds = (value: object): value is { from?: unknown; to?: unknown } =>
  "from" in value || "to" in value;

type MatchOptions = {
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
const matchesFilterValue = (raw: unknown, filterValue: unknown, options?: MatchOptions) => {
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
const dateSortingFn: SortingFn<unknown> = (rowA, rowB, columnId) => {
  const a = toDate(rowA.getValue(columnId))?.getTime() ?? null;
  const b = toDate(rowB.getValue(columnId))?.getTime() ?? null;
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
};

const renderCellValue = <TData extends object>(
  column: AnyColumnConfig<TData>,
  value: unknown,
  row: TData,
  formatOptions: FormatOptions,
) => {
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

  return String(value);
};

const renderGroupingValue = <TData extends object>(
  column: AnyColumnConfig<TData>,
  value: unknown,
  rows: TData[],
) => {
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
const getColumnSearchText = <TData extends object>(
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
  return String(value);
};

const getCellClasses = <TData extends object>(
  column: AnyColumnConfig<TData>,
  value: unknown,
  row: TData,
) => {
  const alignment =
    isNumericDataType(column.dataType)
      ? "text-right tabular-nums"
      : "text-left";

  const conditional = (column.conditionalFormats ?? [])
    .filter((rule) => rule.when(value, row))
    .map((rule) => rule.className)
    .join(" ");

  return `${alignment} text-slate-800 ${column.getCellClassName?.(value, row) ?? ""} ${conditional}`.trim();
};

const flattenExpandedRows = <TData extends object>(rows: Row<TData>[]): Row<TData>[] =>
  rows.flatMap((row) =>
    row.getIsGrouped() && row.getIsExpanded()
      ? [row, ...flattenExpandedRows(row.subRows)]
      : [row],
  );

const collectExpandableGroupIds = <TData extends object>(
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

const getSelectionStatus = (rowIds: string[], selectedIds: Set<string>) => {
  const selectedCount = rowIds.filter((rowId) => selectedIds.has(rowId)).length;

  return {
    allSelected: rowIds.length > 0 && selectedCount === rowIds.length,
    someSelected: selectedCount > 0 && selectedCount < rowIds.length,
  };
};

export function DataGrid<TData extends object>({
  data,
  columns,
  layoutMode = "grid",
  columnGroups,
  pivot: pivotConfig,
  filters = [],
  summaryItems = [],
  groupSummaryItems,
  summarySelectionMode = "auto",
  features: featureOverrides,
  isLoading = false,
  error,
  emptyState,
  loadingState,
  state: controlledState,
  onSortingChange,
  onGlobalFilterChange,
  onColumnFiltersChange,
  onColumnVisibilityChange,
  onColumnSizingChange,
  onColumnOrderChange,
  onColumnPinningChange,
  onPaginationChange,
  onRowSelectionChange,
  onGroupingChange,
  onExpandedChange,
  onPivotChange,
  onSavedViewsChange,
  onActiveViewNameChange,
  defaultGrouping = [],
  defaultColumnPinning,
  storageKey,
  rowLabel = "rows",
  tableLabel,
  locale,
  currency,
  dateFormat,
  searchPlaceholder = "Search rows...",
  viewNamePlaceholder = "Analysis view",
  pageSizeOptions = [25, 50, 100, 250],
  virtualizeRows = false,
  estimatedRowHeight = 36,
  renderDetailPanel,
  getRowId,
  getRowLabel,
  getRowClassName,
  onRowClick,
  onActiveRowChange,
}: DataGridProps<TData>) {
  const isPivotLayout = layoutMode === "pivot";
  const layoutFeatureDefaults: Partial<DataGridFeatures> =
    isPivotLayout
      ? {
          grouping: true,
        }
      : {};
  const features = { ...defaultFeatures, ...layoutFeatureDefaults, ...featureOverrides };
  const columnList = columns as unknown as AnyColumnConfig<TData>[];
  const defaultExpanded = useMemo<ExpandedState>(
    () => (isPivotLayout ? true : {}),
    [isPivotLayout],
  );
  const pivotMeasureIds = useMemo(
    () =>
      (pivotConfig?.measures?.length
        ? pivotConfig.measures
        : groupSummaryItems ?? summaryItems
      ).map((item) => item.id),
    [groupSummaryItems, pivotConfig?.measures, summaryItems],
  );
  const defaultPivotState = useMemo<DataGridPivotState>(
    () => ({
      rows: pivotConfig?.rows ?? defaultGrouping,
      columns: pivotConfig?.columns,
      measures: pivotMeasureIds,
      expanded: pivotConfig?.defaultState?.expanded ?? defaultExpanded,
      showGrandTotals: pivotConfig?.defaultState?.showGrandTotals ?? true,
      showSubtotals: pivotConfig?.defaultState?.showSubtotals ?? true,
      paginationMode: pivotConfig?.defaultState?.paginationMode ?? "topLevelGroups",
      ...pivotConfig?.defaultState,
    }),
    [
      defaultExpanded,
      defaultGrouping,
      pivotConfig?.columns,
      pivotConfig?.defaultState,
      pivotConfig?.rows,
      pivotMeasureIds,
    ],
  );
  const storageKeys = useMemo(
    () =>
      storageKey
        ? {
            columnSizing: `${storageKey}.columnSizing`,
            columnOrder: `${storageKey}.columnOrder`,
            columnPinning: `${storageKey}.columnPinning`,
            savedViews: `${storageKey}.savedViews`,
          }
        : undefined,
    [storageKey],
  );
  const defaultColumnOrder = useMemo<ColumnOrderState>(
    () => [
      ...(features.rowSelection ? ["select"] : []),
      ...(isPivotLayout
        ? [PIVOT_ROW_LABEL_COLUMN_ID, ...pivotMeasureIds.map((id) => `measure:${id}`)]
        : columnList.map((column) => column.accessorKey)),
    ],
    [columnList, features.rowSelection, isPivotLayout, pivotMeasureIds],
  );
  const lockedLeftColumnIds = useMemo(
    () => (features.columnPinning && features.rowSelection ? ["select"] : []),
    [features.columnPinning, features.rowSelection],
  );
  const defaultPinningState = useMemo<ColumnPinningState>(() => {
    const configured = {
      left: [
        ...(defaultColumnPinning?.left ?? []),
        ...(isPivotLayout ? [PIVOT_ROW_LABEL_COLUMN_ID] : []),
        ...columnList
          .filter((column) => column.pinned === "left")
          .map((column) => column.accessorKey),
      ],
      right: [
        ...(defaultColumnPinning?.right ?? []),
        ...columnList
          .filter((column) => column.pinned === "right")
          .map((column) => column.accessorKey),
      ],
    };

    return normalizeColumnPinning(configured, lockedLeftColumnIds);
  }, [columnList, defaultColumnPinning, isPivotLayout, lockedLeftColumnIds]);
  const columnsById = useMemo<Map<string, AnyColumnConfig<TData>>>(
    () => new Map(columnList.map((column) => [column.accessorKey, column])),
    [columnList],
  );
  const filterTypeByColumnId = useMemo<Map<string, GridFilterType>>(
    () => new Map(filters.map((filter) => [filter.accessorKey, filter.filterType ?? "select"])),
    [filters],
  );
  const groupableColumns = useMemo(
    () =>
      columnList
        .filter((column) => features.grouping && column.enableGrouping)
        .map((column) => ({
          id: column.accessorKey,
          label: column.header,
        })),
    [columnList, features.grouping],
  );
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(() =>
    loadJson<ColumnSizingState>(storageKeys?.columnSizing, {}),
  );
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(() =>
    loadJson<ColumnOrderState>(storageKeys?.columnOrder, defaultColumnOrder),
  );
  const [columnPinning, setColumnPinning] = useState<ColumnPinningState>(() =>
    normalizeColumnPinning(
      loadJson<ColumnPinningState>(storageKeys?.columnPinning, defaultPinningState),
      lockedLeftColumnIds,
    ),
  );
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: pageSizeOptions[1] ?? pageSizeOptions[0] ?? 50,
  });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [grouping, setGrouping] = useState<GroupingState>(defaultGrouping);
  const [expanded, setExpanded] = useState<ExpandedState>(defaultExpanded);
  const [pivot, setPivot] = useState<DataGridPivotState>(defaultPivotState);
  const [activeRow, setActiveRow] = useState<TData | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [savedViews, setSavedViews] = useState<DataGridSavedViews>(() =>
    loadJson<DataGridSavedViews>(storageKeys?.savedViews, {}),
  );
  const [activeViewName, setActiveViewName] = useState("");
  const currentSorting = controlledState?.sorting ?? sorting;
  const currentGlobalFilter = controlledState?.globalFilter ?? globalFilter;
  const currentColumnFilters = controlledState?.columnFilters ?? columnFilters;
  const currentColumnVisibility = controlledState?.columnVisibility ?? columnVisibility;
  const currentColumnSizing = controlledState?.columnSizing ?? columnSizing;
  const currentColumnOrder = controlledState?.columnOrder ?? columnOrder;
  const currentColumnPinning = features.columnPinning
    ? normalizeColumnPinning(
        controlledState?.columnPinning ?? columnPinning,
        lockedLeftColumnIds,
      )
    : {};
  const currentPagination = controlledState?.pagination ?? pagination;
  const currentRowSelection = controlledState?.rowSelection ?? rowSelection;
  const currentGrouping = controlledState?.grouping ?? grouping;
  const currentExpanded = controlledState?.expanded ?? expanded;
  const currentPivot = controlledState?.pivot ?? pivot;
  const currentSavedViews = controlledState?.savedViews ?? savedViews;
  const currentActiveViewName = controlledState?.activeViewName ?? activeViewName;
  const emitSortingChange = (updater: Updater<SortingState>) => {
    const next = resolveUpdater(updater, currentSorting);
    if (controlledState?.sorting === undefined) {
      setSorting(next);
    }
    onSortingChange?.(next);
  };
  const emitGlobalFilterChange = (updater: Updater<string>) => {
    const next = resolveUpdater(updater, currentGlobalFilter);
    if (controlledState?.globalFilter === undefined) {
      setGlobalFilter(next);
    }
    onGlobalFilterChange?.(next);
  };
  const emitColumnFiltersChange = (updater: Updater<ColumnFiltersState>) => {
    const next = resolveUpdater(updater, currentColumnFilters);
    if (controlledState?.columnFilters === undefined) {
      setColumnFilters(next);
    }
    onColumnFiltersChange?.(next);
  };
  const emitColumnVisibilityChange = (updater: Updater<VisibilityState>) => {
    const next = resolveUpdater(updater, currentColumnVisibility);
    if (controlledState?.columnVisibility === undefined) {
      setColumnVisibility(next);
    }
    onColumnVisibilityChange?.(next);
  };
  const emitColumnSizingChange = (updater: Updater<ColumnSizingState>) => {
    const next = resolveUpdater(updater, currentColumnSizing);
    if (controlledState?.columnSizing === undefined) {
      setColumnSizing(next);
      saveJson(storageKeys?.columnSizing, next);
    }
    onColumnSizingChange?.(next);
  };
  const emitColumnOrderChange = (updater: Updater<ColumnOrderState>) => {
    const next = resolveUpdater(updater, currentColumnOrder);
    if (controlledState?.columnOrder === undefined) {
      setColumnOrder(next);
      saveJson(storageKeys?.columnOrder, next);
    }
    onColumnOrderChange?.(next);
  };
  const emitColumnPinningChange = (updater: Updater<ColumnPinningState>) => {
    const next = normalizeColumnPinning(
      resolveUpdater(updater, currentColumnPinning),
      lockedLeftColumnIds,
    );
    if (controlledState?.columnPinning === undefined) {
      setColumnPinning(next);
      saveJson(storageKeys?.columnPinning, next);
    }
    onColumnPinningChange?.(next);
  };
  const emitPaginationChange = (updater: Updater<PaginationState>) => {
    const next = resolveUpdater(updater, currentPagination);
    if (controlledState?.pagination === undefined) {
      setPagination(next);
    }
    onPaginationChange?.(next);
  };
  const emitRowSelectionChange = (updater: Updater<RowSelectionState>) => {
    const next = resolveUpdater(updater, currentRowSelection);
    if (controlledState?.rowSelection === undefined) {
      setRowSelection(next);
    }
    onRowSelectionChange?.(next);
  };
  const emitGroupingChange = (updater: Updater<GroupingState>) => {
    const next = resolveUpdater(updater, currentGrouping);
    if (controlledState?.grouping === undefined) {
      setGrouping(next);
    }
    onGroupingChange?.(next);
  };
  const emitExpandedChange = (updater: Updater<ExpandedState>) => {
    const next = resolveUpdater(updater, currentExpanded);
    if (controlledState?.expanded === undefined) {
      setExpanded(next);
    }
    onExpandedChange?.(next);
  };
  const emitPivotChange = (updater: Updater<DataGridPivotState>) => {
    const next = resolveUpdater(updater, currentPivot);
    if (controlledState?.pivot === undefined) {
      setPivot(next);
    }
    onPivotChange?.(next);
  };
  const emitSavedViewsChange = (next: DataGridSavedViews) => {
    if (controlledState?.savedViews === undefined) {
      setSavedViews(next);
      saveJson(storageKeys?.savedViews, next);
    }
    onSavedViewsChange?.(next);
  };
  const emitActiveViewNameChange = (next: string) => {
    if (controlledState?.activeViewName === undefined) {
      setActiveViewName(next);
    }
    onActiveViewNameChange?.(next);
  };

  const formatOptions = useMemo<FormatOptions>(
    () => ({ locale, currency, dateFormat }),
    [locale, currency, dateFormat],
  );
  // Component-scoped so the "text" filter can match the column's FORMATTED text
  // (needs the column config + formatOptions). The same matcher runs in the
  // pivot source-row loop below, keeping both filter paths in lockstep.
  const columnFilterFn = useMemo<FilterFn<TData>>(
    () => (row, columnId, filterValue) => {
      const filterType = filterTypeByColumnId.get(columnId);
      const raw = row.getValue(columnId);
      const column = columnsById.get(columnId);
      const searchText =
        filterType === "text" && column
          ? getColumnSearchText(column, raw, row.original, formatOptions)
          : undefined;
      return matchesFilterValue(raw, filterValue, { filterType, searchText });
    },
    [columnsById, filterTypeByColumnId, formatOptions],
  );
  const showDetailPanel = features.detailPanel && Boolean(renderDetailPanel);
  const hasLeafRowAction = showDetailPanel || Boolean(onRowClick);

  const updateActiveRow = (row: TData | null) => {
    setActiveRow(row);
    onActiveRowChange?.(row);
  };
  const closeActiveRow = () => updateActiveRow(null);

  const handleRowClick = (row: TData) => {
    if (!hasLeafRowAction) {
      return;
    }

    updateActiveRow(activeRow === row ? null : row);
    onRowClick?.(row);
  };

  const adaptedPivotMeasures = useMemo<DataGridPivotMeasure<TData>[]>(
    () =>
      (pivotConfig?.measures?.length
        ? pivotConfig.measures
        : groupSummaryItems ?? summaryItems
      ).map((item) =>
        "aggregation" in item
          ? item
          : {
              id: item.id,
              label: item.label,
              columnId: item.columnId,
              aggregation: (rows) =>
                item.value({
                  rows,
                  filteredRows: rows,
                  selectedRows: [],
                  allRows: data,
                  scope: "group",
                }),
            },
      ),
    [data, groupSummaryItems, pivotConfig?.measures, summaryItems],
  );

  const columnDefs = useMemo<ColumnDef<TData>[]>(
    () => [
      ...(features.rowSelection
        ? [
            {
              id: "select",
              header: ({ table }) => (
                <input
                  type="checkbox"
                  checked={table.getIsAllPageRowsSelected()}
                  ref={(input) => {
                    if (input) {
                      input.indeterminate = table.getIsSomePageRowsSelected();
                    }
                  }}
                  onChange={table.getToggleAllPageRowsSelectedHandler()}
                  aria-label="Select all visible rows"
                  className="h-3.5 w-3.5 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                />
              ),
              cell: ({ row }) => (
                <input
                  type="checkbox"
                  checked={row.getIsSelected()}
                  disabled={!row.getCanSelect()}
                  onClick={(event) => event.stopPropagation()}
                  onChange={row.getToggleSelectedHandler()}
                  aria-label={`Select ${getRowLabel?.(row.original) ?? row.id}`}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                />
              ),
              enableSorting: false,
              enableColumnFilter: false,
              enableHiding: false,
              enableResizing: false,
              enablePinning: false,
              size: 44,
            } satisfies ColumnDef<TData>,
          ]
        : []),
      ...columnList.map<ColumnDef<TData>>((column) => ({
        accessorKey: column.accessorKey,
        header: column.header,
        size: column.width,
        minSize: column.minWidth ?? 88,
        maxSize: column.maxWidth ?? 420,
        enableSorting: features.sorting,
        enableHiding: features.columnVisibility,
        enableResizing: features.columnResizing,
        enablePinning: features.columnPinning && (column.enablePinning ?? true),
        enableGrouping: features.grouping && Boolean(column.enableGrouping),
        enableGlobalFilter: true,
        filterFn: columnFilterFn,
        ...(column.dataType === "date" ? { sortingFn: dateSortingFn as SortingFn<TData> } : {}),
        getGroupingValue: column.getGroupingValue,
        cell: ({ getValue, row }) => renderCellValue(column, getValue(), row.original, formatOptions),
      })),
    ],
    [
      columnList,
      columnFilterFn,
      features.columnPinning,
      features.columnResizing,
      features.sorting,
      features.columnVisibility,
      features.grouping,
      features.rowSelection,
      formatOptions,
      getRowLabel,
    ],
  );

  const globalFilterFn = useMemo<FilterFn<TData>>(
    () => (row, columnId, filterValue) => {
      const needle = String(filterValue ?? "").trim().toLowerCase();
      if (!needle) {
        return true;
      }
      const value = row.getValue(columnId);
      const column = columnsById.get(columnId);
      const text = column ? getColumnSearchText(column, value, row.original, formatOptions) : "";
      // Date columns match the formatted text only; the raw value (which may be a
      // Date object) would otherwise pollute the haystack with toString() noise.
      const haystack = column?.dataType === "date" ? text : `${value ?? ""} ${text}`;
      return haystack.toLowerCase().includes(needle);
    },
    [columnsById, formatOptions],
  );

  const pivotSourceRows = useMemo(() => {
    if (!isPivotLayout) {
      return data;
    }

    const activeFilters = currentColumnFilters.filter(
      (filter) => filter.value != null && filter.value !== "",
    );
    const needle = features.globalSearch
      ? String(currentGlobalFilter ?? "").trim().toLowerCase()
      : "";

    return data.filter((row) => {
      const passesColumnFilters = activeFilters.every((filter) => {
        const raw = row[filter.id as Extract<keyof TData, string>];
        const filterType = filterTypeByColumnId.get(filter.id);
        const column = columnsById.get(filter.id);
        const searchText =
          filterType === "text" && column
            ? getColumnSearchText(column, raw, row, formatOptions)
            : undefined;
        return matchesFilterValue(raw, filter.value, { filterType, searchText });
      });

      if (!passesColumnFilters || !needle) {
        return passesColumnFilters;
      }

      return columnList.some((column) => {
        const raw = row[column.accessorKey];
        const text = getColumnSearchText(column, raw, row, formatOptions);
        const haystack = column.dataType === "date" ? text : `${raw ?? ""} ${text}`;
        return haystack.toLowerCase().includes(needle);
      });
    });
  }, [
    columnList,
    columnsById,
    currentColumnFilters,
    currentGlobalFilter,
    data,
    features.globalSearch,
    filterTypeByColumnId,
    formatOptions,
    isPivotLayout,
  ]);

  const togglePivotRow = (rowId: string) => {
    emitPivotChange((current) => {
      const currentExpanded = current.expanded ?? defaultExpanded;
      const nextExpanded =
        currentExpanded === true
          ? { [rowId]: false }
          : {
              ...(typeof currentExpanded === "object" ? currentExpanded : {}),
              [rowId]: !Boolean(
                typeof currentExpanded === "object" ? currentExpanded[rowId] : false,
              ),
            };

      return { ...current, expanded: nextExpanded };
    });
  };

  const resolvedPivotState = useMemo<DataGridPivotState>(
    () => ({
      ...currentPivot,
      expanded: currentPivot.expanded ?? currentExpanded,
      rows: currentPivot.rows.length ? currentPivot.rows : currentGrouping,
      measures: currentPivot.measures.length ? currentPivot.measures : pivotMeasureIds,
      paginationMode: currentPivot.paginationMode ?? "topLevelGroups",
    }),
    [currentExpanded, currentGrouping, currentPivot, pivotMeasureIds],
  );
  const pivotMaterialization = useMemo(
    () =>
      isPivotLayout
        ? materializePivot({
            sourceRows: pivotSourceRows,
            sourceColumns: columnList,
            pivot: resolvedPivotState,
            pagination: currentPagination,
            measures: adaptedPivotMeasures,
            sorting: currentSorting,
            getRowId: getRowId
              ? (row, index) => getRowId(row, index)
              : undefined,
            getRowLabel,
            rowLabelColumn: pivotConfig?.rowLabelColumn,
            showLeafRows: pivotConfig?.showLeafRows,
            onToggleRow: togglePivotRow,
            onLeafClick: handleRowClick,
            hasLeafRowAction,
            enableSorting: features.sorting,
            enableColumnVisibility: features.columnVisibility,
            enableColumnResizing: features.columnResizing,
            enableColumnPinning: features.columnPinning,
          })
        : undefined,
    [
      adaptedPivotMeasures,
      columnList,
      currentPagination,
      currentSorting,
      features.columnPinning,
      features.columnResizing,
      features.columnVisibility,
      features.sorting,
      getRowId,
      getRowLabel,
      hasLeafRowAction,
      isPivotLayout,
      pivotConfig?.rowLabelColumn,
      pivotConfig?.showLeafRows,
      pivotSourceRows,
      resolvedPivotState,
    ],
  );

  const getSourceRowId = (row: TData) => {
    const rowIndex = data.indexOf(row);
    return getRowId?.(row, rowIndex < 0 ? 0 : rowIndex) ?? String(rowIndex);
  };
  const pivotSelectionMode = pivotConfig?.selectionMode ?? "sourceRows";
  const pivotSelectedSourceIds = useMemo(
    () => new Set(Object.keys(currentRowSelection).filter((rowId) => currentRowSelection[rowId])),
    [currentRowSelection],
  );
  const setSourceRowsSelected = (rowsToSelect: TData[], selected: boolean) => {
    emitRowSelectionChange((current) => {
      const next = { ...current };
      rowsToSelect.forEach((row) => {
        const rowId = getSourceRowId(row);
        if (selected) {
          next[rowId] = true;
        } else {
          delete next[rowId];
        }
      });
      return next;
    });
  };
  const pivotSelectionColumn = useMemo<ColumnDef<PivotRow<TData>, unknown>>(
    () => ({
      id: "select",
      header: ({ table }) => {
        if (pivotSelectionMode !== "sourceRows") {
          return (
            <input
              type="checkbox"
              checked={table.getIsAllPageRowsSelected()}
              ref={(input) => {
                if (input) {
                  input.indeterminate = table.getIsSomePageRowsSelected();
                }
              }}
              onChange={table.getToggleAllPageRowsSelectedHandler()}
              aria-label="Select all visible pivot rows"
              className="h-3.5 w-3.5 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
            />
          );
        }

        const sourceIds = pivotSourceRows.map(getSourceRowId);
        const selection = getSelectionStatus(sourceIds, pivotSelectedSourceIds);
        return (
          <input
            type="checkbox"
            checked={selection.allSelected}
            ref={(input) => {
              if (input) {
                input.indeterminate = selection.someSelected;
              }
            }}
            onChange={(event) => setSourceRowsSelected(pivotSourceRows, event.currentTarget.checked)}
            aria-label="Select all filtered source rows"
            className="h-3.5 w-3.5 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
          />
        );
      },
      cell: ({ row }) => {
        if (pivotSelectionMode !== "sourceRows") {
          return (
            <input
              type="checkbox"
              checked={row.getIsSelected()}
              disabled={!row.getCanSelect()}
              onClick={(event) => event.stopPropagation()}
              onChange={row.getToggleSelectedHandler()}
              aria-label={`Select ${row.original.__labelText} pivot row`}
              className="h-3.5 w-3.5 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
            />
          );
        }

        const sourceIds = row.original.__sourceRows.map(getSourceRowId);
        const selection = getSelectionStatus(sourceIds, pivotSelectedSourceIds);
        return (
          <input
            type="checkbox"
            checked={selection.allSelected}
            ref={(input) => {
              if (input) {
                input.indeterminate = selection.someSelected;
              }
            }}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) =>
              setSourceRowsSelected(row.original.__sourceRows, event.currentTarget.checked)
            }
            aria-label={`Select source rows for ${row.original.__labelText}`}
            className="h-3.5 w-3.5 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
          />
        );
      },
      enableSorting: false,
      enableColumnFilter: false,
      enableHiding: false,
      enableResizing: false,
      enablePinning: false,
      size: 44,
    }),
    [
      pivotConfig?.selectionMode,
      pivotSelectedSourceIds,
      pivotSelectionMode,
      pivotSourceRows,
    ],
  );
  const tableData = (pivotMaterialization?.data ?? data) as (TData | PivotRow<TData>)[];
  // Grid-mode column groups: wrap the data column defs in nested group defs that
  // render as header bands through the standard getHeaderGroups() path. The
  // select column stays at the top level; pivot ignores columnGroups entirely.
  const groupedColumnDefs = useMemo(() => {
    if (isPivotLayout || !columnGroups || columnGroups.length === 0) {
      return columnDefs;
    }
    const selectDef = features.rowSelection ? columnDefs[0] : undefined;
    const dataDefs = features.rowSelection ? columnDefs.slice(1) : columnDefs;
    const grouped = buildGroupedColumnDefs(dataDefs, columnGroups);
    return selectDef ? [selectDef, ...grouped] : grouped;
  }, [columnDefs, columnGroups, features.rowSelection, isPivotLayout]);
  const tableColumns = (pivotMaterialization
    ? [
        ...(features.rowSelection ? [pivotSelectionColumn] : []),
        ...pivotMaterialization.columns,
      ]
    : groupedColumnDefs) as ColumnDef<TData | PivotRow<TData>, unknown>[];
  const effectiveDefaultColumnOrder = useMemo<ColumnOrderState>(
    () =>
      pivotMaterialization
        ? [
            ...(features.rowSelection ? ["select"] : []),
            ...pivotMaterialization.metadata.generatedColumnIds,
          ]
        : defaultColumnOrder,
    [defaultColumnOrder, features.rowSelection, pivotMaterialization],
  );
  const generatedPivotColumnIds = useMemo(
    () => new Set(pivotMaterialization?.metadata.generatedColumnIds ?? []),
    [pivotMaterialization],
  );
  const effectiveColumnVisibility = useMemo<VisibilityState>(() => {
    if (!pivotMaterialization) {
      return currentColumnVisibility;
    }

    return Object.fromEntries(
      Object.entries(currentColumnVisibility).filter(
        ([columnId]) => !isGeneratedPivotColumnId(columnId) || generatedPivotColumnIds.has(columnId),
      ),
    );
  }, [currentColumnVisibility, generatedPivotColumnIds, pivotMaterialization]);
  const effectiveColumnPinning = useMemo<ColumnPinningState>(() => {
    if (!pivotMaterialization) {
      return currentColumnPinning;
    }

    return normalizeColumnPinning(
      {
        left: (currentColumnPinning.left ?? []).filter(
          (columnId) => !isGeneratedPivotColumnId(columnId) || generatedPivotColumnIds.has(columnId),
        ),
        right: (currentColumnPinning.right ?? []).filter(
          (columnId) => !isGeneratedPivotColumnId(columnId) || generatedPivotColumnIds.has(columnId),
        ),
      },
      lockedLeftColumnIds,
    );
  }, [currentColumnPinning, generatedPivotColumnIds, lockedLeftColumnIds, pivotMaterialization]);
  const effectiveColumnOrder = useMemo<ColumnOrderState>(() => {
    if (!pivotMaterialization) {
      return currentColumnOrder;
    }

    const generatedAxisIds = pivotMaterialization.metadata.generatedColumnIds.filter((columnId) =>
      columnId.includes("|col:"),
    );
    const hasGeneratedPivotOrder = generatedAxisIds.length
      ? currentColumnOrder.some((columnId) => generatedAxisIds.includes(columnId))
      : currentColumnOrder.some((columnId) =>
          pivotMaterialization.metadata.generatedColumnIds.includes(columnId),
        );
    if (!hasGeneratedPivotOrder) {
      return effectiveDefaultColumnOrder;
    }

    const reconciled = currentColumnOrder.filter(
      (columnId) => !isGeneratedPivotColumnId(columnId) || generatedPivotColumnIds.has(columnId),
    );
    const missingGeneratedIds = effectiveDefaultColumnOrder.filter(
      (columnId) => !reconciled.includes(columnId),
    );
    return [...reconciled, ...missingGeneratedIds];
  }, [currentColumnOrder, effectiveDefaultColumnOrder, generatedPivotColumnIds, pivotMaterialization]);
  const isTopLevelPivotPagination =
    isPivotLayout && resolvedPivotState.paginationMode === "topLevelGroups";
  const pivotPageCount =
    pivotMaterialization && isTopLevelPivotPagination
      ? Math.max(Math.ceil(pivotMaterialization.metadata.topLevelGroupCount / currentPagination.pageSize), 1)
      : undefined;

  const table = useReactTable<TData | PivotRow<TData>>({
    data: tableData,
    columns: tableColumns,
    globalFilterFn: globalFilterFn as FilterFn<TData | PivotRow<TData>>,
    state: {
      sorting: features.sorting ? currentSorting : [],
      globalFilter: features.globalSearch && !isPivotLayout ? currentGlobalFilter : "",
      columnFilters: isPivotLayout ? [] : currentColumnFilters,
      columnVisibility: features.columnVisibility ? effectiveColumnVisibility : {},
      columnSizing: features.columnResizing ? currentColumnSizing : {},
      columnOrder: features.columnOrdering ? effectiveColumnOrder : effectiveDefaultColumnOrder,
      columnPinning: features.columnPinning ? effectiveColumnPinning : {},
      pagination: currentPagination,
      rowSelection: currentRowSelection,
      grouping: features.grouping && !isPivotLayout ? currentGrouping : [],
      expanded: features.grouping && !isPivotLayout ? currentExpanded : {},
    },
    getRowId: (row, index, parent) =>
      isPivotRow(row) ? row.__id : getRowId?.(row as TData, index, parent as Row<TData>) ?? String(index),
    enableSorting: features.sorting,
    enableRowSelection: features.rowSelection,
    enableGrouping: features.grouping && !isPivotLayout,
    enableColumnPinning: features.columnPinning,
    enableExpanding: features.grouping && !isPivotLayout,
    columnResizeMode: "onChange",
    groupedColumnMode: "remove",
    paginateExpandedRows: false,
    manualPagination: isTopLevelPivotPagination,
    pageCount: pivotPageCount,
    onSortingChange: emitSortingChange,
    onGlobalFilterChange: emitGlobalFilterChange,
    onColumnFiltersChange: emitColumnFiltersChange,
    onColumnVisibilityChange: emitColumnVisibilityChange,
    onColumnOrderChange: emitColumnOrderChange,
    onColumnPinningChange: emitColumnPinningChange,
    onColumnSizingChange: emitColumnSizingChange,
    onPaginationChange: emitPaginationChange,
    onRowSelectionChange: emitRowSelectionChange,
    onGroupingChange: emitGroupingChange,
    onExpandedChange: emitExpandedChange,
    getRowCanExpand: (row) => !isPivotRow(row.original) && row.getIsGrouped(),
    getCoreRowModel: getCoreRowModel(),
    ...(features.sorting && !isPivotLayout ? { getSortedRowModel: getSortedRowModel() } : {}),
    getFilteredRowModel: getFilteredRowModel(),
    ...(features.grouping && !isPivotLayout ? { getGroupedRowModel: getGroupedRowModel() } : {}),
    ...(features.grouping && !isPivotLayout ? { getExpandedRowModel: getExpandedRowModel() } : {}),
    ...(features.pagination && !isTopLevelPivotPagination
      ? { getPaginationRowModel: getPaginationRowModel() }
      : {}),
  });

  // Option lists are the only O(rows) work here, so derive them once per
  // data/filters change instead of on every render (e.g. each keystroke).
  const filterOptionsById = useMemo(() => {
    const map: Record<string, string[]> = {};
    filters.forEach((filter) => {
      map[filter.accessorKey] = filter.options ?? uniqueColumnValues(data, filter.accessorKey);
    });
    return map;
  }, [data, filters]);

  const toolbarFilters: GridFilter[] = filters.map((filter) => {
    const column = isPivotLayout ? undefined : table.getColumn(filter.accessorKey);
    const pivotFilter = currentColumnFilters.find((item) => item.id === filter.accessorKey);
    return {
      id: filter.accessorKey,
      label: filter.label,
      filterType: filter.filterType ?? "select",
      value: isPivotLayout ? pivotFilter?.value : column?.getFilterValue(),
      options: filterOptionsById[filter.accessorKey] ?? [],
      formatOption: filter.formatOption,
      min: filter.min,
      max: filter.max,
      step: filter.step,
      placeholder: filter.placeholder,
      dateFormat: filter.dateFormat,
      presets: filter.presets,
      onChange: (value: unknown) => {
        if (!isPivotLayout) {
          column?.setFilterValue(value);
          resetPageIndex();
          return;
        }

        emitColumnFiltersChange((current) => {
          const next = current.filter((item) => item.id !== filter.accessorKey);
          if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) {
            return next;
          }
          return [...next, { id: filter.accessorKey, value }];
        });
        resetPageIndex();
      },
    };
  });
  const headerFilterById = new Map(toolbarFilters.map((filter) => [filter.id, filter]));

  const resetPageIndex = () => {
    if (!features.pagination) {
      return;
    }
    emitPaginationChange((current) => ({ ...current, pageIndex: 0 }));
  };

  const currentToolbarGrouping = isPivotLayout ? currentPivot.rows : currentGrouping;

  const setGroupingAndReset = (nextGrouping: GroupingState) => {
    if (isPivotLayout) {
      emitPivotChange((current) => ({
        ...current,
        rows: nextGrouping,
        expanded: defaultExpanded,
      }));
      onGroupingChange?.(nextGrouping);
    } else {
      emitGroupingChange(nextGrouping);
      emitExpandedChange(defaultExpanded);
    }
    resetPageIndex();
  };

  const addGrouping = (columnId: string) => {
    if (!columnId || currentToolbarGrouping.includes(columnId)) {
      return;
    }

    setGroupingAndReset([...currentToolbarGrouping, columnId]);
  };

  const removeGrouping = (columnId: string) => {
    setGroupingAndReset(currentToolbarGrouping.filter((id) => id !== columnId));
  };

  const moveGrouping = (columnId: string, direction: "up" | "down") => {
    const fromIndex = currentToolbarGrouping.indexOf(columnId);
    const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;

    if (fromIndex < 0 || toIndex < 0 || toIndex >= currentToolbarGrouping.length) {
      return;
    }

    const nextGrouping = [...currentToolbarGrouping];
    const [movedId] = nextGrouping.splice(fromIndex, 1);
    nextGrouping.splice(toIndex, 0, movedId);
    setGroupingAndReset(nextGrouping);
  };

  const clearGrouping = () => {
    setGroupingAndReset([]);
  };

  const clearFilters = () => {
    emitGlobalFilterChange("");
    if (isPivotLayout) {
      emitColumnFiltersChange([]);
    } else {
      table.resetColumnFilters();
    }
    resetPageIndex();
  };

  const setPersistedColumnOrder = (nextOrder: ColumnOrderState) => {
    emitColumnOrderChange(nextOrder);
  };

  const getOrderedDataColumnIds = () =>
    table
      .getAllLeafColumns()
      .filter((column) => column.id !== "select")
      .map((column) => column.id);

  const moveColumn = (columnId: string, direction: "up" | "down") => {
    const orderedIds = getOrderedDataColumnIds();
    const fromIndex = orderedIds.indexOf(columnId);
    const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;

    if (fromIndex < 0 || toIndex < 0 || toIndex >= orderedIds.length) {
      return;
    }

    const nextIds = [...orderedIds];
    const [movedId] = nextIds.splice(fromIndex, 1);
    nextIds.splice(toIndex, 0, movedId);
    setPersistedColumnOrder([...(features.rowSelection ? ["select"] : []), ...nextIds]);
  };

  const dropColumn = (fromColumnId: string, toColumnId: string) => {
    const orderedIds = getOrderedDataColumnIds();
    const fromIndex = orderedIds.indexOf(fromColumnId);
    const toIndex = orderedIds.indexOf(toColumnId);

    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
      return;
    }

    const nextIds = [...orderedIds];
    const [movedId] = nextIds.splice(fromIndex, 1);
    nextIds.splice(toIndex, 0, movedId);
    setPersistedColumnOrder([...(features.rowSelection ? ["select"] : []), ...nextIds]);
  };

  const pinColumn = (columnId: string, position: false | "left" | "right") => {
    table.getColumn(columnId)?.pin(position);
  };

  const resetColumns = () => {
    emitColumnVisibilityChange({});
    emitColumnSizingChange({});
    setPersistedColumnOrder(effectiveDefaultColumnOrder);
    emitColumnPinningChange(defaultPinningState);
    if (controlledState?.columnSizing === undefined) {
      removeJson(storageKeys?.columnSizing);
    }
    if (controlledState?.columnPinning === undefined) {
      removeJson(storageKeys?.columnPinning);
    }
  };

  const resetView = () => {
    emitSortingChange([]);
    emitGlobalFilterChange("");
    emitColumnFiltersChange([]);
    emitRowSelectionChange({});
    emitGroupingChange(defaultGrouping);
    emitExpandedChange(defaultExpanded);
    emitPivotChange(defaultPivotState);
    setActiveRow(null);
    onActiveRowChange?.(null);
    resetPageIndex();
    emitActiveViewNameChange("");
  };

  const saveView = () => {
    const name = currentActiveViewName.trim();

    if (!name) {
      return;
    }

    const nextViews = {
      ...currentSavedViews,
      [name]: {
        sorting: currentSorting,
        globalFilter: currentGlobalFilter,
        columnFilters: currentColumnFilters,
        columnVisibility: effectiveColumnVisibility,
        columnSizing: currentColumnSizing,
        columnOrder: effectiveColumnOrder,
        columnPinning: effectiveColumnPinning,
        grouping: currentGrouping,
        pivot: currentPivot,
      },
    };

    emitSavedViewsChange(nextViews);
  };

  const applyView = (name: string) => {
    const view = currentSavedViews[name];

    if (!view) {
      return;
    }

    emitActiveViewNameChange(name);
    emitSortingChange(view.sorting);
    emitGlobalFilterChange(view.globalFilter);
    emitColumnFiltersChange(view.columnFilters);
    emitColumnVisibilityChange(view.columnVisibility);
    emitColumnSizingChange(view.columnSizing);
    setPersistedColumnOrder(view.columnOrder ?? effectiveDefaultColumnOrder);
    emitColumnPinningChange(view.columnPinning ?? defaultPinningState);
    emitGroupingChange(view.grouping ?? []);
    emitPivotChange(
      view.pivot ?? {
        ...defaultPivotState,
        rows: view.grouping ?? defaultPivotState.rows,
      },
    );
    emitExpandedChange(defaultExpanded);
    resetPageIndex();
  };

  const deleteView = (name: string) => {
    const trimmedName = name.trim();

    if (!trimmedName || !currentSavedViews[trimmedName]) {
      return;
    }

    const nextViews = { ...currentSavedViews };
    delete nextViews[trimmedName];
    emitSavedViewsChange(nextViews);
    emitActiveViewNameChange("");
  };

  useEffect(() => {
    if (activeRow == null) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeActiveRow();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRow]);

  const toggleGroupRow = (row: Row<TData>) => {
    emitExpandedChange((current) => {
      const isExpanded =
        current === true ? true : Boolean(current[row.id]);

      if (current === true) {
        const expandableIds = collectExpandableGroupIds(table.getRowModel().rows, currentGrouping.length);
        return Object.fromEntries(
          expandableIds.map((rowId) => [rowId, rowId !== row.id]),
        );
      }

      return {
        ...current,
        [row.id]: !isExpanded,
      };
    });
  };

  const getGroupSummaryContext = (row: Row<TData>): DataGridSummaryContext<TData> => {
    const leafRowModels = row.getLeafRows().filter((leafRow) => !leafRow.getIsGrouped());
    const leafRows = leafRowModels.map((leafRow) => leafRow.original);
    const selectedLeafRows = leafRowModels
      .filter((leafRow) => leafRow.getIsSelected())
      .map((leafRow) => leafRow.original);

    return {
      rows: leafRows,
      filteredRows: leafRows,
      selectedRows: selectedLeafRows,
      allRows: data,
      scope: "group",
    };
  };

  const getGroupLabels = (row: Row<TData>) => {
    const groupingColumnId = row.groupingColumnId;
    const groupingColumn = groupingColumnId ? columnsById.get(groupingColumnId) : undefined;
    const leafRows = row
      .getLeafRows()
      .filter((leafRow) => !leafRow.getIsGrouped())
      .map((leafRow) => leafRow.original);
    const groupColumnLabel = String(groupingColumn?.header ?? groupingColumnId ?? "Group");
    const groupValueLabel =
      row.groupingValue == null || row.groupingValue === ""
        ? "Blank"
        : String(row.groupingValue);

    return {
      groupingColumn,
      groupColumnLabel,
      groupValueLabel,
      renderedGroupValue: groupingColumn
        ? renderGroupingValue(groupingColumn, row.groupingValue, leafRows)
        : groupValueLabel,
    };
  };

  const renderGroupRow = (row: Row<TData>, measureProps?: RowMeasureProps) => {
    const groupContext = getGroupSummaryContext(row);
    const { groupColumnLabel, groupValueLabel, renderedGroupValue } = getGroupLabels(row);
    const leafRows = groupContext.rows;
    const visibleCellCount = Math.max(row.getVisibleCells().length, 1);
    const summaryItemsForGroup = groupSummaryItems ?? summaryItems;

    return (
      <tr
        key={row.id}
        ref={measureProps?.ref}
        data-index={measureProps?.["data-index"]}
        className="bg-slate-50"
      >
        <td
          colSpan={visibleCellCount}
          className="border-b border-slate-200 p-0"
        >
          <button
            type="button"
            onClick={() => toggleGroupRow(row)}
            className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 text-left text-xs font-semibold text-slate-900 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-slate-300"
            style={{ paddingLeft: 12 + row.depth * 18 }}
            aria-expanded={row.getIsExpanded()}
            aria-label={`Toggle ${groupColumnLabel} ${groupValueLabel} group`}
          >
            <span
              aria-hidden="true"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-slate-300 bg-white text-slate-600"
            >
              {row.getIsExpanded() ? (
                <MinusIcon className="h-3 w-3" />
              ) : (
                <PlusIcon className="h-3 w-3" />
              )}
            </span>
            <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-slate-500">
              {groupColumnLabel}
            </span>
            <span className="min-w-0 truncate">
              {renderedGroupValue}
            </span>
            <span className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
              {leafRows.length} {rowLabel}
            </span>

            {summaryItemsForGroup.map((item) => (
              <span
                key={item.id}
                className="inline-flex items-center gap-1 border-l border-slate-200 pl-3 text-[11px]"
              >
                <span className="font-medium uppercase tracking-wide text-slate-500">
                  {item.label}
                </span>
                <span className="font-semibold text-slate-900">
                  {item.value(groupContext)}
                </span>
              </span>
            ))}
          </button>
        </td>
      </tr>
    );
  };

  const filteredSummaryRows = isPivotLayout
    ? pivotSourceRows
    : table.getFilteredRowModel().rows.map((row) => row.original as TData);
  // Selected scope is intersected with the active filter so summaries/counts
  // never include rows the user has filtered out of view.
  const selectedSummaryRows = isPivotLayout && pivotSelectionMode === "sourceRows"
    ? pivotSourceRows.filter((row) => pivotSelectedSourceIds.has(getSourceRowId(row)))
    : table
        .getFilteredSelectedRowModel()
        .rows.map((row) => row.original)
        .flatMap((row) =>
          isPivotRow(row) ? row.__sourceRows : [row as TData],
        );
  const filteredRowCount = filteredSummaryRows.length;
  const selectedRowCount = selectedSummaryRows.length;
  const showSelectAllBanner =
    features.rowSelection &&
    !isPivotLayout &&
    table.getIsAllPageRowsSelected() &&
    selectedRowCount > 0 &&
    selectedRowCount < filteredRowCount;
  const summaryScope: DataGridSummaryScope =
    summarySelectionMode === "selected" ||
    (summarySelectionMode === "auto" && selectedSummaryRows.length > 0)
      ? "selected"
      : "filtered";
  const summaryContext: DataGridSummaryContext<TData> = {
    rows: summaryScope === "selected" ? selectedSummaryRows : filteredSummaryRows,
    filteredRows: filteredSummaryRows,
    selectedRows: selectedSummaryRows,
    allRows: data,
    scope: summaryScope,
  };
  const minTableWidth = Math.max(table.getTotalSize(), isPivotLayout ? 480 : 720);
  const showSummaries = !isPivotLayout && features.summaries && summaryItems.length > 0;
  // getExpandedRowModel() is the nested pre-pagination tree (top-level rows with
  // nested subRows). getRowModel() is the FINAL model, which is already flattened
  // when the pagination row model is registered. Flatten manually only over the
  // nested source so leaf rows are never double-emitted (see bugs #1/#3).
  const visibleRows = features.grouping
    ? isPivotLayout
      ? table.getRowModel().rows
      : features.pagination
        ? table.getRowModel().rows
        : flattenExpandedRows(table.getExpandedRowModel().rows)
    : table.getRowModel().rows;

  const rowVirtualizer = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimatedRowHeight,
    overscan: 12,
    enabled: virtualizeRows,
  });
  const bodyColSpan = table.getVisibleLeafColumns().length;

  const getPinnedColumnStyle = (
    column: Column<TData | PivotRow<TData>, unknown>,
    options: { header?: boolean; backgroundColor?: string } = {},
  ): CSSProperties => {
    if (!features.columnPinning) {
      return {};
    }

    const pinned = column.getIsPinned();

    if (!pinned) {
      return {};
    }

    const isLeftEdge = pinned === "left" && column.getIsLastColumn("left");
    const isRightEdge = pinned === "right" && column.getIsFirstColumn("right");

    return {
      position: "sticky",
      left: pinned === "left" ? column.getStart("left") : undefined,
      right: pinned === "right" ? column.getAfter("right") : undefined,
      top: options.header ? 0 : undefined,
      zIndex: options.header ? 30 : 20,
      backgroundColor: options.backgroundColor,
      boxShadow: isLeftEdge
        ? "2px 0 4px -2px rgba(15, 23, 42, 0.28)"
        : isRightEdge
          ? "-2px 0 4px -2px rgba(15, 23, 42, 0.28)"
          : undefined,
    };
  };

  const renderGridLeafRow = (
    row: Row<TData | PivotRow<TData>>,
    measureProps?: RowMeasureProps,
  ) => {
    const pivotRow = isPivotRow(row.original) ? row.original : undefined;
    const sourceRow = pivotRow ? pivotRow.__leafRow : row.original;
    const isActionable =
      !pivotRow && hasLeafRowAction
        ? true
        : pivotRow?.__kind === "leaf" && hasLeafRowAction && Boolean(sourceRow);
    const rowBackground = pivotRow
      ? pivotRow.__kind === "grandTotal"
        ? "#cffafe"
        : pivotRow.__depth === 0
          ? "#ecfeff"
          : "#ffffff"
      : row.getIsSelected()
        ? "#eff6ff"
        : "#ffffff";
    const rowClassName = pivotRow
      ? `border-b border-slate-200 ${
          pivotRow.__kind === "grandTotal"
            ? "bg-cyan-100 font-bold"
            : pivotRow.__depth === 0
              ? "bg-cyan-50 font-semibold"
              : "bg-white hover:bg-slate-50"
        }`
      : `${isActionable ? "cursor-pointer" : ""} border-b border-slate-100 transition ${
          row.getIsSelected() ? "bg-blue-50" : "bg-white hover:bg-slate-50"
        } ${activeRow === sourceRow ? "ring-2 ring-inset ring-slate-400" : ""} ${
          isActionable
            ? "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400"
            : ""
        } ${sourceRow ? getRowClassName?.(sourceRow as TData) ?? "" : ""}`;

    return (
      <tr
        key={row.id}
        ref={measureProps?.ref}
        data-index={measureProps?.["data-index"]}
        role={isActionable ? "button" : undefined}
        tabIndex={isActionable ? 0 : undefined}
        onClick={() => {
          if (sourceRow && isActionable) {
            handleRowClick(sourceRow as TData);
          }
        }}
        onKeyDown={(event) => {
          if (isActionable && sourceRow && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            handleRowClick(sourceRow as TData);
          }
        }}
        className={rowClassName}
      >
        {row.getVisibleCells().map((cell) => {
          const columnConfig = !pivotRow ? columnsById.get(cell.column.id) : undefined;
          const isPivotMeasure = Boolean(pivotRow) && cell.column.id !== PIVOT_ROW_LABEL_COLUMN_ID;

          return (
            <td
              key={cell.id}
              style={{
                width: cell.column.getSize(),
                ...getPinnedColumnStyle(cell.column, {
                  backgroundColor: row.getIsSelected() ? "#eff6ff" : rowBackground,
                }),
              }}
              className={`border-b border-r px-3 py-2 align-middle last:border-r-0 ${
                pivotRow ? "border-slate-200" : "border-slate-100"
              } ${
                isPivotMeasure
                  ? "text-right tabular-nums text-slate-950"
                  : columnConfig
                    ? getCellClasses(columnConfig, cell.getValue(), sourceRow as TData)
                    : "text-left text-slate-950"
              }`}
            >
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </td>
          );
        })}
      </tr>
    );
  };

  const renderVisibleRow = (row: Row<TData | PivotRow<TData>>, measureProps?: RowMeasureProps) => {
    if (isPivotLayout) {
      return renderGridLeafRow(row, measureProps);
    }
    return row.getIsGrouped()
      ? renderGroupRow(row as Row<TData>, measureProps)
      : renderGridLeafRow(row, measureProps);
  };

  const renderBodyRows = () => {
    if (!virtualizeRows) {
      return visibleRows.map((row) => renderVisibleRow(row));
    }
    const virtualItems = rowVirtualizer.getVirtualItems();
    const totalSize = rowVirtualizer.getTotalSize();
    const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
    const paddingBottom =
      virtualItems.length > 0 ? totalSize - virtualItems[virtualItems.length - 1].end : 0;

    return (
      <>
        {paddingTop > 0 ? (
          <tr aria-hidden="true">
            <td colSpan={bodyColSpan} style={{ height: paddingTop, padding: 0, border: 0 }} />
          </tr>
        ) : null}
        {virtualItems.map((virtualItem) =>
          renderVisibleRow(visibleRows[virtualItem.index], {
            ref: rowVirtualizer.measureElement,
            "data-index": virtualItem.index,
          }),
        )}
        {paddingBottom > 0 ? (
          <tr aria-hidden="true">
            <td colSpan={bodyColSpan} style={{ height: paddingBottom, padding: 0, border: 0 }} />
          </tr>
        ) : null}
      </>
    );
  };
  const overlay: ReactNode =
    error !== undefined && error !== null ? (
      <div className="flex max-w-sm flex-col items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.6}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7.5v5" strokeLinecap="round" />
          <circle cx="12" cy="16" r="0.6" fill="currentColor" />
        </svg>
        <div>{error}</div>
      </div>
    ) : isLoading ? (
      loadingState ?? (
        <div className="flex flex-col items-center gap-3 text-sm font-medium text-slate-600">
          <span
            aria-hidden="true"
            className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600"
          />
          <span>Loading {rowLabel}...</span>
        </div>
      )
    ) : visibleRows.length === 0 ? (
      emptyState ?? (
        <div className="flex flex-col items-center gap-2 text-sm font-medium text-slate-500">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-7 w-7 text-slate-300" fill="none" stroke="currentColor" strokeWidth={1.4}>
            <rect x="3.5" y="5" width="17" height="14" rx="2" />
            <path d="M3.5 9.5h17M9 5v14" />
          </svg>
          <span>No {rowLabel} found.</span>
        </div>
      )
    ) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm lg:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {features.toolbar ? (
          <Toolbar
            search={currentGlobalFilter}
            searchPlaceholder={searchPlaceholder}
            filters={toolbarFilters}
            showFiltersPopover={isPivotLayout}
            enableGlobalSearch={features.globalSearch}
            enableColumnVisibility={features.columnVisibility}
            enableColumnOrdering={features.columnOrdering}
            enableColumnPinning={features.columnPinning}
            enableSavedViews={features.savedViews}
            enableGrouping={features.grouping}
            columns={table
              .getAllLeafColumns()
              .filter((column) => column.id !== "select")
              .map((column) => ({
                id: column.id,
                label: getColumnControlLabel(column),
                visible: column.getIsVisible(),
                canHide: column.getCanHide(),
                pinned: column.getIsPinned(),
                canPin: column.getCanPin(),
              }))}
            groupableColumns={groupableColumns}
            grouping={currentToolbarGrouping}
            savedViews={Object.keys(currentSavedViews).sort()}
            activeViewName={currentActiveViewName}
            viewNamePlaceholder={viewNamePlaceholder}
            onSearchChange={emitGlobalFilterChange}
            onColumnVisibilityChange={(columnId, visible) =>
              table.getColumn(columnId)?.toggleVisibility(visible)
            }
            onColumnMove={moveColumn}
            onColumnDrop={dropColumn}
            onColumnPin={pinColumn}
            onGroupingAdd={addGrouping}
            onGroupingRemove={removeGrouping}
            onGroupingMove={moveGrouping}
            onClearGrouping={clearGrouping}
            onClearFilters={clearFilters}
            onResetColumns={resetColumns}
            onResetView={resetView}
            onSaveView={saveView}
            onApplyView={applyView}
            onDeleteView={deleteView}
            onActiveViewNameChange={emitActiveViewNameChange}
          />
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600">
          <span>
            {filteredRowCount} of {data.length} {rowLabel}
          </span>
          <div className="flex items-center gap-3">
            {features.sorting && currentSorting.length > 0 ? (
              <button
                type="button"
                onClick={() => emitSortingChange([])}
                className="font-medium text-slate-600 underline underline-offset-2 transition hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
              >
                Clear sort
              </button>
            ) : null}
            {features.rowSelection ? <span>{selectedRowCount} selected</span> : null}
          </div>
        </div>

        {showSelectAllBanner ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-200 bg-blue-50 px-4 py-2 text-xs text-blue-800">
            <span>
              All {selectedRowCount} {rowLabel} on this page are selected.
            </span>
            <button
              type="button"
              onClick={() =>
                table.setRowSelection(
                  Object.fromEntries(
                    table.getFilteredRowModel().rows.map((row) => [row.id, true]),
                  ),
                )
              }
              className="font-semibold underline underline-offset-2 transition hover:text-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
            >
              Select all {filteredRowCount} {rowLabel}
            </button>
          </div>
        ) : null}

        {showSummaries ? (
          <div className="border-b border-slate-200 bg-white px-4 py-3">
            <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-medium uppercase tracking-wide text-slate-500">
              <span>Summary</span>
              <span>
                {summaryScope === "selected"
                  ? `${selectedSummaryRows.length} selected`
                  : `${filteredSummaryRows.length} filtered`}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
              {summaryItems.map((item) => (
                <div
                  key={item.id}
                  className="rounded-md border border-slate-200 bg-slate-50/60 px-3 py-2"
                >
                  <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    {item.label}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-950">
                    {item.value(summaryContext)}
                  </div>
                  {item.description ? (
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      {item.description(summaryContext)}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto">
          {overlay ? (
            <div
              role={error ? "alert" : "status"}
              aria-live="polite"
              className="absolute inset-0 z-20 flex items-center justify-center bg-white/90 px-6 text-center"
            >
              {overlay}
            </div>
          ) : null}
          <table className="w-full border-separate border-spacing-0 text-xs" style={{ minWidth: minTableWidth }}>
            {tableLabel ? <caption className="sr-only">{tableLabel}</caption> : null}
            <thead
              className={`sticky top-0 z-10 text-left shadow-[0_2px_4px_-1px_rgba(15,23,42,0.12)] ${
                isPivotLayout
                  ? "bg-cyan-100 text-xs text-slate-950"
                  : "bg-slate-100 text-[11px] uppercase tracking-wide text-slate-600"
              }`}
            >
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const canSort = header.column.getCanSort();
                    const sortState = header.column.getIsSorted();
                    // Grid-mode header filter affordance (pivot filters live in
                    // the toolbar popover). Only declared, leaf data columns.
                    const headerFilter =
                      isPivotLayout || header.isPlaceholder
                        ? undefined
                        : headerFilterById.get(header.column.id);

                    return (
                      <th
                        key={header.id}
                        scope="col"
                        colSpan={header.colSpan}
                        aria-sort={
                          canSort
                            ? sortState === "asc"
                              ? "ascending"
                              : sortState === "desc"
                                ? "descending"
                                : "none"
                            : undefined
                        }
                        style={{
                          width: header.getSize(),
                          ...getPinnedColumnStyle(header.column, {
                            header: true,
                            backgroundColor: isPivotLayout ? "#cffafe" : "#f1f5f9",
                          }),
                        }}
                        className={`relative border-r px-3 py-2 font-semibold last:border-r-0 ${
                          isPivotLayout ? "border-cyan-200" : "border-slate-200"
                        }`}
                      >
                        {header.isPlaceholder ? null : (
                          <div className="flex w-full items-center gap-1">
                            <div className="min-w-0 flex-1">
                              {canSort ? (
                                <button
                                  type="button"
                                  onClick={header.column.getToggleSortingHandler()}
                                  title="Click to sort. Shift-click to add to multi-sort."
                                  className="flex w-full cursor-pointer items-center gap-1 rounded-sm hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                                >
                                  <span className="truncate">
                                    {flexRender(header.column.columnDef.header, header.getContext())}
                                  </span>
                                  <SortIcon state={sortState} />
                                  {currentSorting.length > 1 && header.column.getSortIndex() >= 0 ? (
                                    <span className="ml-0.5 rounded bg-slate-200 px-1 text-[9px] font-semibold leading-tight text-slate-600">
                                      {header.column.getSortIndex() + 1}
                                    </span>
                                  ) : null}
                                </button>
                              ) : (
                                <div className="flex w-full items-center truncate">
                                  {flexRender(header.column.columnDef.header, header.getContext())}
                                </div>
                              )}
                            </div>
                            {headerFilter ? (
                              <FilterPopover filter={headerFilter} variant="icon" />
                            ) : null}
                          </div>
                        )}
                        {features.columnResizing && header.column.getCanResize() ? (
                          <button
                            type="button"
                            aria-label={`Resize ${String(header.column.columnDef.header)}`}
                            onDoubleClick={() => header.column.resetSize()}
                            onMouseDown={header.getResizeHandler()}
                            onTouchStart={header.getResizeHandler()}
                            onKeyDown={(event) => {
                              const step = event.shiftKey ? 40 : 12;
                              const columnId = header.column.id;
                              const current = header.getSize();
                              const min = header.column.columnDef.minSize ?? 0;
                              const max = header.column.columnDef.maxSize ?? Number.POSITIVE_INFINITY;
                              if (event.key === "ArrowRight") {
                                event.preventDefault();
                                table.setColumnSizing((sizing) => ({
                                  ...sizing,
                                  [columnId]: Math.min(max, current + step),
                                }));
                              } else if (event.key === "ArrowLeft") {
                                event.preventDefault();
                                table.setColumnSizing((sizing) => ({
                                  ...sizing,
                                  [columnId]: Math.max(min, current - step),
                                }));
                              } else if (event.key === "Enter" || event.key === "Home") {
                                event.preventDefault();
                                header.column.resetSize();
                              }
                            }}
                            className={`absolute right-0 top-0 h-full w-1.5 cursor-col-resize touch-none select-none bg-slate-300 opacity-0 transition hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400 ${
                              header.column.getIsResizing() ? "bg-slate-500 opacity-100" : ""
                            }`}
                          />
                        ) : null}
                      </th>
                    );
                  })}
                </tr>
              ))}
              {features.floatingFilters && !isPivotLayout ? (
                <tr>
                  {table.getVisibleLeafColumns().map((column) => {
                    const filter = headerFilterById.get(column.id);
                    return (
                      <td
                        key={column.id}
                        style={{
                          width: column.getSize(),
                          ...getPinnedColumnStyle(column, {
                            header: true,
                            backgroundColor: "#f8fafc",
                          }),
                        }}
                        className="border-r border-slate-200 px-2 py-1 align-top last:border-r-0"
                      >
                        {filter ? <FilterPopover filter={filter} variant="inline" /> : null}
                      </td>
                    );
                  })}
                </tr>
              ) : null}
            </thead>
            <tbody>{renderBodyRows()}</tbody>
          </table>
        </div>

        {features.pagination ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-2 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <span>
                Page {table.getState().pagination.pageIndex + 1} of{" "}
                {Math.max(table.getPageCount(), 1)}
              </span>
              <select
                value={table.getState().pagination.pageSize}
                onChange={(event) => table.setPageSize(Number(event.target.value))}
                className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs font-medium text-slate-800 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                aria-label={`${rowLabel} per page`}
              >
                {pageSizeOptions.map((pageSize) => (
                  <option key={pageSize} value={pageSize}>
                    {pageSize} {rowLabel}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="h-8 rounded-md border border-slate-300 bg-slate-50 px-3 font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="h-8 rounded-md border border-slate-300 bg-slate-50 px-3 font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {showDetailPanel ? renderDetailPanel?.(activeRow, { close: closeActiveRow }) : null}
    </div>
  );
}
