import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  type FilterFn,
  type ColumnOrderState,
  type ColumnSizingState,
  type ExpandedState,
  type GroupingState,
  type PaginationState,
  type Row,
  type RowSelectionState,
  type SortingState,
  type Updater,
  type VisibilityState,
} from "@tanstack/react-table";
import type { GridColumnConfig, GridDataType, GridFilterConfig } from "../../types/grid";

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
  enableGrouping?: boolean;
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
  formatNumber,
  formatPercent,
  formatStatusLabel,
  type FormatOptions,
} from "../../utils/formatters";
import { Toolbar } from "./Toolbar";
import { ChevronDownIcon, MinusIcon, PlusIcon, SortIcon } from "./icons";

export type DataGridFeatures = {
  columnVisibility: boolean;
  columnResizing: boolean;
  columnOrdering: boolean;
  savedViews: boolean;
  pagination: boolean;
  rowSelection: boolean;
  detailPanel: boolean;
  summaries: boolean;
  grouping: boolean;
};

export type DataGridSummaryScope = "filtered" | "selected" | "group";

export type DataGridSummarySelectionMode = "auto" | Exclude<DataGridSummaryScope, "group">;

export type DataGridGroupingState = GroupingState;

export type DataGridExpandedState = ExpandedState;

export type DataGridLayoutMode = "grid" | "pivot";

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
  grouping?: GroupingState;
};

export type DataGridSavedViews = Record<string, DataGridSavedView>;

export type DataGridControlledState = {
  sorting?: SortingState;
  globalFilter?: string;
  columnFilters?: ColumnFiltersState;
  columnVisibility?: VisibilityState;
  columnSizing?: ColumnSizingState;
  columnOrder?: ColumnOrderState;
  pagination?: PaginationState;
  rowSelection?: RowSelectionState;
  grouping?: GroupingState;
  expanded?: ExpandedState;
  savedViews?: DataGridSavedViews;
  activeViewName?: string;
};

export type DataGridProps<TData extends object> = {
  data: TData[];
  columns: GridColumnConfig<TData>[];
  layoutMode?: DataGridLayoutMode;
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
  onPaginationChange?: (pagination: PaginationState) => void;
  onRowSelectionChange?: (rowSelection: RowSelectionState) => void;
  onGroupingChange?: (grouping: GroupingState) => void;
  onExpandedChange?: (expanded: ExpandedState) => void;
  onSavedViewsChange?: (savedViews: DataGridSavedViews) => void;
  onActiveViewNameChange?: (activeViewName: string) => void;
  defaultGrouping?: GroupingState;
  storageKey?: string;
  rowLabel?: string;
  tableLabel?: string;
  locale?: string;
  currency?: string;
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
  columnVisibility: true,
  columnResizing: true,
  columnOrdering: true,
  savedViews: true,
  pagination: true,
  rowSelection: true,
  detailPanel: true,
  summaries: true,
  grouping: true,
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

const uniqueColumnValues = <TData extends object>(
  data: TData[],
  key: Extract<keyof TData, string>,
) => Array.from(new Set(data.map((row) => String(row[key] ?? "")))).filter(Boolean).sort();

// Unified column filter: exact match for a string filter value (select),
// membership for an array (multi-select), and numeric bounds for an object
// { min, max } (range). Exact match avoids the substring leakage of the
// default includesString filter (e.g. "Men" matching "Women").
const gridColumnFilterFn: FilterFn<unknown> = (row, columnId, filterValue) => {
  if (filterValue == null || filterValue === "") {
    return true;
  }
  const raw = row.getValue(columnId);
  if (Array.isArray(filterValue)) {
    if (filterValue.length === 0) {
      return true;
    }
    return filterValue.map(String).includes(String(raw ?? ""));
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
  return String(raw ?? "") === String(filterValue);
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

  if (
    column.dataType === "currency" ||
    column.dataType === "number" ||
    column.dataType === "percent"
  ) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return "";
    }
    if (column.dataType === "currency") {
      return formatCurrency(numericValue, formatOptions);
    }
    if (column.dataType === "number") {
      return formatNumber(numericValue, formatOptions);
    }
    return formatPercent(numericValue, formatOptions);
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
  if (
    column.dataType === "currency" ||
    column.dataType === "number" ||
    column.dataType === "percent"
  ) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return "";
    }
    if (column.dataType === "currency") {
      return formatCurrency(numericValue, formatOptions);
    }
    if (column.dataType === "number") {
      return formatNumber(numericValue, formatOptions);
    }
    return formatPercent(numericValue, formatOptions);
  }
  return String(value);
};

const getCellClasses = <TData extends object>(
  column: AnyColumnConfig<TData>,
  value: unknown,
  row: TData,
) => {
  const alignment =
    column.dataType === "number" || column.dataType === "currency" || column.dataType === "percent"
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

const flattenPivotRows = <TData extends object>(
  rows: Row<TData>[],
  groupingDepth: number,
): Row<TData>[] =>
  rows.flatMap((row) => {
    if (!row.getIsGrouped()) {
      return groupingDepth === 0 ? [row] : [];
    }

    const shouldRenderChildren = row.getIsExpanded() && row.depth < groupingDepth - 1;
    return shouldRenderChildren
      ? [row, ...flattenPivotRows(row.subRows, groupingDepth)]
      : [row];
  });

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

export function DataGrid<TData extends object>({
  data,
  columns,
  layoutMode = "grid",
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
  onPaginationChange,
  onRowSelectionChange,
  onGroupingChange,
  onExpandedChange,
  onSavedViewsChange,
  onActiveViewNameChange,
  defaultGrouping = [],
  storageKey,
  rowLabel = "rows",
  tableLabel,
  locale,
  currency,
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
          rowSelection: false,
          detailPanel: false,
          pagination: false,
          grouping: true,
        }
      : {};
  const features = { ...defaultFeatures, ...layoutFeatureDefaults, ...featureOverrides };
  const columnList = columns as unknown as AnyColumnConfig<TData>[];
  const defaultExpanded = useMemo<ExpandedState>(
    () => (isPivotLayout ? true : {}),
    [isPivotLayout],
  );
  const storageKeys = useMemo(
    () =>
      storageKey
        ? {
            columnSizing: `${storageKey}.columnSizing`,
            columnOrder: `${storageKey}.columnOrder`,
            savedViews: `${storageKey}.savedViews`,
          }
        : undefined,
    [storageKey],
  );
  const defaultColumnOrder = useMemo<ColumnOrderState>(
    () => [
      ...(features.rowSelection ? ["select"] : []),
      ...columnList.map((column) => column.accessorKey),
    ],
    [columnList, features.rowSelection],
  );
  const columnsById = useMemo<Map<string, AnyColumnConfig<TData>>>(
    () => new Map(columnList.map((column) => [column.accessorKey, column])),
    [columnList],
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
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: pageSizeOptions[1] ?? pageSizeOptions[0] ?? 50,
  });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [grouping, setGrouping] = useState<GroupingState>(defaultGrouping);
  const [expanded, setExpanded] = useState<ExpandedState>(defaultExpanded);
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
  const currentPagination = controlledState?.pagination ?? pagination;
  const currentRowSelection = controlledState?.rowSelection ?? rowSelection;
  const currentGrouping = controlledState?.grouping ?? grouping;
  const currentExpanded = controlledState?.expanded ?? expanded;
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

  const formatOptions = useMemo<FormatOptions>(() => ({ locale, currency }), [locale, currency]);

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
        enableHiding: features.columnVisibility,
        enableResizing: features.columnResizing,
        enableGrouping: features.grouping && Boolean(column.enableGrouping),
        enableGlobalFilter: true,
        filterFn: gridColumnFilterFn as FilterFn<TData>,
        getGroupingValue: column.getGroupingValue,
        cell: ({ getValue, row }) => renderCellValue(column, getValue(), row.original, formatOptions),
      })),
    ],
    [
      columnList,
      features.columnResizing,
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
      return `${value ?? ""} ${text}`.toLowerCase().includes(needle);
    },
    [columnsById, formatOptions],
  );

  const table = useReactTable({
    data,
    columns: columnDefs,
    globalFilterFn,
    state: {
      sorting: currentSorting,
      globalFilter: currentGlobalFilter,
      columnFilters: currentColumnFilters,
      columnVisibility: features.columnVisibility ? currentColumnVisibility : {},
      columnSizing: features.columnResizing ? currentColumnSizing : {},
      columnOrder: features.columnOrdering ? currentColumnOrder : defaultColumnOrder,
      pagination: currentPagination,
      rowSelection: currentRowSelection,
      grouping: features.grouping ? currentGrouping : [],
      expanded: features.grouping ? currentExpanded : {},
    },
    getRowId,
    enableRowSelection: features.rowSelection,
    enableGrouping: features.grouping,
    enableExpanding: features.grouping,
    columnResizeMode: "onChange",
    groupedColumnMode: "remove",
    paginateExpandedRows: false,
    onSortingChange: emitSortingChange,
    onGlobalFilterChange: emitGlobalFilterChange,
    onColumnFiltersChange: emitColumnFiltersChange,
    onColumnVisibilityChange: emitColumnVisibilityChange,
    onColumnOrderChange: emitColumnOrderChange,
    onColumnSizingChange: emitColumnSizingChange,
    onPaginationChange: emitPaginationChange,
    onRowSelectionChange: emitRowSelectionChange,
    onGroupingChange: emitGroupingChange,
    onExpandedChange: emitExpandedChange,
    getRowCanExpand: (row) => row.getIsGrouped(),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    ...(features.grouping ? { getGroupedRowModel: getGroupedRowModel() } : {}),
    ...(features.grouping ? { getExpandedRowModel: getExpandedRowModel() } : {}),
    ...(features.pagination ? { getPaginationRowModel: getPaginationRowModel() } : {}),
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

  const toolbarFilters = filters.map((filter) => {
    const column = table.getColumn(filter.accessorKey);
    return {
      id: filter.accessorKey,
      label: filter.label,
      filterType: filter.filterType ?? "select",
      value: column?.getFilterValue(),
      options: filterOptionsById[filter.accessorKey] ?? [],
      formatOption: filter.formatOption,
      min: filter.min,
      max: filter.max,
      step: filter.step,
      onChange: (value: unknown) => column?.setFilterValue(value),
    };
  });

  const resetPageIndex = () => {
    if (!features.pagination) {
      return;
    }
    emitPaginationChange((current) => ({ ...current, pageIndex: 0 }));
  };

  const setGroupingAndReset = (nextGrouping: GroupingState) => {
    emitGroupingChange(nextGrouping);
    emitExpandedChange(defaultExpanded);
    resetPageIndex();
  };

  const addGrouping = (columnId: string) => {
    if (!columnId || currentGrouping.includes(columnId)) {
      return;
    }

    setGroupingAndReset([...currentGrouping, columnId]);
  };

  const removeGrouping = (columnId: string) => {
    setGroupingAndReset(currentGrouping.filter((id) => id !== columnId));
  };

  const moveGrouping = (columnId: string, direction: "up" | "down") => {
    const fromIndex = currentGrouping.indexOf(columnId);
    const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;

    if (fromIndex < 0 || toIndex < 0 || toIndex >= currentGrouping.length) {
      return;
    }

    const nextGrouping = [...currentGrouping];
    const [movedId] = nextGrouping.splice(fromIndex, 1);
    nextGrouping.splice(toIndex, 0, movedId);
    setGroupingAndReset(nextGrouping);
  };

  const clearGrouping = () => {
    setGroupingAndReset([]);
  };

  const clearFilters = () => {
    emitGlobalFilterChange("");
    table.resetColumnFilters();
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

  const resetColumns = () => {
    emitColumnVisibilityChange({});
    emitColumnSizingChange({});
    setPersistedColumnOrder(defaultColumnOrder);
    if (controlledState?.columnSizing === undefined) {
      removeJson(storageKeys?.columnSizing);
    }
  };

  const resetView = () => {
    emitSortingChange([]);
    emitGlobalFilterChange("");
    emitColumnFiltersChange([]);
    emitRowSelectionChange({});
    emitGroupingChange(defaultGrouping);
    emitExpandedChange(defaultExpanded);
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
        columnVisibility: currentColumnVisibility,
        columnSizing: currentColumnSizing,
        columnOrder: currentColumnOrder,
        grouping: currentGrouping,
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
    setPersistedColumnOrder(view.columnOrder ?? defaultColumnOrder);
    emitGroupingChange(view.grouping ?? []);
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

  const pivotSummaryItems = (groupSummaryItems ?? summaryItems).filter((item) => {
    if (!item.columnId) {
      return true;
    }

    return table.getColumn(item.columnId)?.getIsVisible() ?? true;
  });

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

  const renderPivotRow = (row: Row<TData>, measureProps?: RowMeasureProps) => {
    const isGroupedRow = row.getIsGrouped();
    const canExpandPivotGroup = isGroupedRow && row.depth < currentGrouping.length - 1;
    const rowValues = isGroupedRow
      ? getGroupSummaryContext(row)
      : {
          rows: [row.original],
          filteredRows: [row.original],
          selectedRows: row.getIsSelected() ? [row.original] : [],
          allRows: data,
          scope: "group" as const,
        };
    const labels = isGroupedRow ? getGroupLabels(row) : undefined;
    const rowLabelText = isGroupedRow
      ? labels?.renderedGroupValue
      : getRowLabel?.(row.original) ?? row.id;
    const isTopGroup = isGroupedRow && row.depth === 0;
    const isActionablePivotRow = canExpandPivotGroup || (!isGroupedRow && hasLeafRowAction);

    return (
      <tr
        key={row.id}
        ref={measureProps?.ref}
        data-index={measureProps?.["data-index"]}
        role={isActionablePivotRow ? "button" : undefined}
        tabIndex={isActionablePivotRow ? 0 : undefined}
        onClick={() => {
          if (canExpandPivotGroup) {
            toggleGroupRow(row);
          } else if (!isGroupedRow) {
            handleRowClick(row.original);
          }
        }}
        onKeyDown={(event) => {
          if (!isActionablePivotRow || (event.key !== "Enter" && event.key !== " ")) {
            return;
          }
          event.preventDefault();
          if (canExpandPivotGroup) {
            toggleGroupRow(row);
          } else if (!isGroupedRow) {
            handleRowClick(row.original);
          }
        }}
        className={`border-b border-slate-200 ${
          isActionablePivotRow
            ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400"
            : ""
        } ${isTopGroup ? "bg-cyan-50 font-semibold" : "bg-white hover:bg-slate-50"}`}
      >
        <td className="border-r border-slate-200 px-2 py-1.5 text-slate-950">
          <div
            className="flex min-w-0 items-center gap-1.5"
            style={{ paddingLeft: isGroupedRow ? row.depth * 20 : 0 }}
          >
            {canExpandPivotGroup ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  toggleGroupRow(row);
                }}
                className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border border-slate-400 bg-white leading-none text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                aria-expanded={row.getIsExpanded()}
                aria-label={`Toggle ${labels?.groupColumnLabel ?? "group"} ${
                  labels?.groupValueLabel ?? row.id
                } group`}
              >
                {row.getIsExpanded() ? (
                  <MinusIcon className="h-2.5 w-2.5" />
                ) : (
                  <PlusIcon className="h-2.5 w-2.5" />
                )}
              </button>
            ) : (
              <span className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            )}
            <span className="min-w-0 truncate">{rowLabelText}</span>
          </div>
        </td>
        {pivotSummaryItems.map((item) => (
          <td
            key={item.id}
            className={`border-r border-slate-200 px-2 py-1.5 text-right tabular-nums text-slate-950 last:border-r-0 ${
              isTopGroup ? "font-semibold" : ""
            }`}
          >
            {item.value(rowValues)}
          </td>
        ))}
      </tr>
    );
  };

  const filteredSummaryRows = table.getFilteredRowModel().rows.map((row) => row.original);
  // Selected scope is intersected with the active filter so summaries/counts
  // never include rows the user has filtered out of view.
  const selectedSummaryRows = table
    .getFilteredSelectedRowModel()
    .rows.map((row) => row.original);
  const filteredRowCount = table.getFilteredRowModel().rows.length;
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
  const minTableWidth = isPivotLayout
    ? Math.max(320, 220 + pivotSummaryItems.length * 150)
    : Math.max(table.getTotalSize(), 720);
  const showSummaries = !isPivotLayout && features.summaries && summaryItems.length > 0;
  // getExpandedRowModel() is the nested pre-pagination tree (top-level rows with
  // nested subRows). getRowModel() is the FINAL model, which is already flattened
  // when the pagination row model is registered. Flatten manually only over the
  // nested source so leaf rows are never double-emitted (see bugs #1/#3).
  const visibleRows = features.grouping
    ? isPivotLayout
      ? flattenPivotRows(table.getExpandedRowModel().rows, currentGrouping.length)
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
  const bodyColSpan = isPivotLayout
    ? 1 + pivotSummaryItems.length
    : table.getVisibleLeafColumns().length;

  const renderGridLeafRow = (row: Row<TData>, measureProps?: RowMeasureProps) => (
    <tr
      key={row.id}
      ref={measureProps?.ref}
      data-index={measureProps?.["data-index"]}
      role={hasLeafRowAction ? "button" : undefined}
      tabIndex={hasLeafRowAction ? 0 : undefined}
      onClick={() => handleRowClick(row.original)}
      onKeyDown={(event) => {
        if (hasLeafRowAction && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          handleRowClick(row.original);
        }
      }}
      className={`${hasLeafRowAction ? "cursor-pointer" : ""} border-b border-slate-100 transition ${
        row.getIsSelected() ? "bg-blue-50" : "bg-white hover:bg-slate-50"
      } ${activeRow === row.original ? "ring-2 ring-inset ring-slate-400" : ""} ${
        hasLeafRowAction
          ? "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400"
          : ""
      } ${getRowClassName?.(row.original) ?? ""}`}
    >
      {row.getVisibleCells().map((cell) => {
        const columnConfig = columnsById.get(cell.column.id);

        return (
          <td
            key={cell.id}
            style={{ width: cell.column.getSize() }}
            className={`border-b border-r border-slate-100 px-3 py-2 align-middle last:border-r-0 ${
              columnConfig
                ? getCellClasses(columnConfig, cell.getValue(), row.original)
                : "text-center"
            }`}
          >
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </td>
        );
      })}
    </tr>
  );

  const renderVisibleRow = (row: Row<TData>, measureProps?: RowMeasureProps) => {
    if (isPivotLayout) {
      return renderPivotRow(row, measureProps);
    }
    return row.getIsGrouped()
      ? renderGroupRow(row, measureProps)
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
        <Toolbar
          search={currentGlobalFilter}
          searchPlaceholder={searchPlaceholder}
          filters={toolbarFilters}
          enableColumnVisibility={features.columnVisibility}
          enableColumnOrdering={features.columnOrdering}
          enableSavedViews={features.savedViews}
          enableGrouping={features.grouping}
          columns={table
            .getAllLeafColumns()
            .filter((column) => column.id !== "select")
            .map((column) => ({
              id: column.id,
              label: String(column.columnDef.header ?? column.id),
              visible: column.getIsVisible(),
              canHide: column.getCanHide(),
            }))}
          groupableColumns={groupableColumns}
          grouping={currentGrouping}
          savedViews={Object.keys(currentSavedViews).sort()}
          activeViewName={currentActiveViewName}
          viewNamePlaceholder={viewNamePlaceholder}
          onSearchChange={emitGlobalFilterChange}
          onColumnVisibilityChange={(columnId, visible) =>
            table.getColumn(columnId)?.toggleVisibility(visible)
          }
          onColumnMove={moveColumn}
          onColumnDrop={dropColumn}
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

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600">
          <span>
            {filteredRowCount} of {data.length} {rowLabel}
          </span>
          <div className="flex items-center gap-3">
            {currentSorting.length > 0 ? (
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
            {isPivotLayout ? (
              <>
                <thead className="sticky top-0 z-10 bg-cyan-100 text-left text-xs text-slate-950 shadow-[0_1px_0_0_#38bdf8]">
                  <tr>
                    <th className="border-r border-cyan-200 px-2 py-1.5 font-semibold">
                      <div className="flex items-center gap-1">
                        <span>Row Labels</span>
                        <span
                          aria-hidden="true"
                          className="flex h-5 w-5 items-center justify-center border border-slate-400 bg-slate-100 text-slate-600"
                        >
                          <ChevronDownIcon className="h-3 w-3" />
                        </span>
                      </div>
                    </th>
                    {pivotSummaryItems.map((item) => (
                      <th
                        key={item.id}
                        className="border-r border-cyan-200 px-2 py-1.5 text-right font-semibold last:border-r-0"
                      >
                        {item.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>{renderBodyRows()}</tbody>
                <tfoot className="bg-cyan-100 text-slate-950 shadow-[0_-1px_0_0_#38bdf8]">
                  <tr>
                    <td className="border-r border-cyan-200 px-2 py-1.5 font-bold">
                      Grand Total
                    </td>
                    {pivotSummaryItems.map((item) => (
                      <td
                        key={item.id}
                        className="border-r border-cyan-200 px-2 py-1.5 text-right font-bold tabular-nums last:border-r-0"
                      >
                        {item.value({
                          rows: filteredSummaryRows,
                          filteredRows: filteredSummaryRows,
                          selectedRows: selectedSummaryRows,
                          allRows: data,
                          scope: "filtered",
                        })}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </>
            ) : (
              <>
                <thead className="sticky top-0 z-10 bg-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-600 shadow-[0_2px_4px_-1px_rgba(15,23,42,0.12)]">
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map((header) => {
                        const canSort = header.column.getCanSort();
                        const sortState = header.column.getIsSorted();

                        return (
                          <th
                            key={header.id}
                            scope="col"
                            aria-sort={
                              canSort
                                ? sortState === "asc"
                                  ? "ascending"
                                  : sortState === "desc"
                                    ? "descending"
                                    : "none"
                                : undefined
                            }
                            style={{ width: header.getSize() }}
                            className="relative border-r border-slate-200 px-3 py-2 font-semibold last:border-r-0"
                          >
                            {header.isPlaceholder ? null : canSort ? (
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
                              <div className="flex w-full items-center">
                                {flexRender(header.column.columnDef.header, header.getContext())}
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
                                  const max =
                                    header.column.columnDef.maxSize ?? Number.POSITIVE_INFINITY;
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
                </thead>
                <tbody>{renderBodyRows()}</tbody>
              </>
            )}
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
