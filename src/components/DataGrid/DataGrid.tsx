import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
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
  type Column,
  type FilterFn,
  type GroupingState,
  type Row,
  type SortingFn,
} from "@tanstack/react-table";
import type {
  DataGridDisplayMode,
  GridFilterConfig,
} from "../../types/grid";
import type { FormatOptions } from "../../utils/formatters";
import { Toolbar } from "./Toolbar";
import { composeCardRoles } from "./cardComposition";
import { CardList } from "./CardList";
import { ToolbarCompact, type CompactSortColumn } from "./ToolbarCompact";
import { BottomSheet } from "./BottomSheet";
import { DataGridBody, type RowMeasureProps } from "./DataGridBody";
import { DataGridHeader } from "./DataGridHeader";
import { DataGridPagination } from "./DataGridPagination";
import { useContainerWidth } from "./useContainerWidth";
import type { GridFilter } from "./filters";
import { AppliedFilters } from "./AppliedFilters";
import { DEFAULT_FACET_THRESHOLD } from "./filterDefaults";
import { RowActionsMenu } from "./RowActionsMenu";
import {
  CellEditor,
  type EditCellColumn,
} from "./cellEditor";
import { downloadTextFile, toCsv } from "../../utils/export";
import { removeJson } from "./storage";
import {
  booleanSortingFn,
  dateSortingFn,
  isFilterValueActive,
  matchesFilterValue,
} from "./filterMatch";
import {
  getCellClasses,
  getColumnSearchText,
  reactNodeToText,
  renderCellValue,
  renderGroupingValue,
  type AnyColumnConfig,
} from "./cells";
import {
  colorScaleStyle,
  computeBarGeometry,
  computeColumnDomain,
  flashDirection,
  type FlashDirection,
  type NumericDomain,
} from "./cellEffects";
import { DataBarFill, FlashOverlay } from "./cellEffectsRender";
import {
  collectExpandableGroupIds,
  flattenExpandedRows,
  isPivotRow,
} from "./gridHelpers";
import { useCellEditing } from "./useCellEditing";
import { useCellFocus } from "./useCellFocus";
import { useCellRangeInteractions } from "./useCellRangeInteractions";
import { useColumnOrchestration } from "./useColumnOrchestration";
import { useDataSourceController } from "./useDataSourceController";
import { useGridState } from "./useGridState";
import { useDataGridApi } from "./useDataGridApi";
import { usePivotOrchestration } from "./usePivotOrchestration";
import { ROW_ACTIONS_COLUMN_ID, SELECT_COLUMN_ID } from "./gridConstants";
import { MinusIcon, PlusIcon } from "./icons";
import {
  PIVOT_ROW_LABEL_COLUMN_ID,
  type PivotRow,
} from "./pivot";
import type {
  DataGridDensity,
  DataGridFeatures,
  DataGridProps,
  DataGridSummaryContext,
  DataGridSummaryScope,
} from "./dataGridTypes";

type PivotMeasureColumnMeta = {
  kind?: "pivotMeasure";
  columnPath?: Array<{ label?: ReactNode }>;
  totalLevel?: "subtotal" | "grandTotal";
};

export type {
  DataGridFeatures,
  DataGridCellEdit,
  DataGridCellEditBatch,
  DataGridCellEditBatchSource,
  DataGridColumnGroup,
  DataGridColumnPinningState,
  DataGridControlledState,
  DataGridDataSource,
  DataGridDataSourceRequest,
  DataGridDataSourceResult,
  DataGridDataMode,
  DataGridDensity,
  DataGridExpandedState,
  DataGridFocusedCell,
  DataGridGroupSummaryDisplay,
  DataGridGroupingState,
  DataGridLayoutMode,
  DataGridProps,
  DataGridSavedView,
  DataGridSavedViews,
  DataGridSummaryContext,
  DataGridSummaryItem,
  DataGridSummaryScope,
  DataGridSummarySelectionMode,
} from "./dataGridTypes";
export type {
  DataGridApi,
  DataGridColumnSnapshot,
  DataGridCommand,
  DataGridCommandError,
  DataGridCommandErrorCode,
  DataGridCommandResult,
  DataGridSnapshot,
} from "./dataGridApi";

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
  headerFilters: true,
  autoColumnFilters: true,
  filterSummary: true,
  editing: true,
  cellSelection: true,
  fillHandle: true,
  export: true,
  clipboard: true,
  headerMenu: true,
  headerToolsOnDemand: false,
  rowActions: true,
  collapsibleToolbar: true,
  cardLayout: false,
};

// Stable empty default so consumers that omit `filters` (the common case now
// that filtering is auto-provisioned) don't get a fresh array identity each
// render, which would re-run the per-column facet/extent scans every render.
const EMPTY_FILTERS: never[] = [];

const densityStyles: Record<DataGridDensity, { header: string; cell: string; rowHeight: number }> = {
  compact: {
    header: "dg-density-header--compact",
    cell: "dg-density-cell--compact",
    rowHeight: 28,
  },
  standard: {
    header: "dg-density-header--standard",
    cell: "dg-density-cell--standard",
    rowHeight: 36,
  },
  comfortable: {
    header: "dg-density-header--comfortable",
    cell: "dg-density-cell--comfortable",
    rowHeight: 44,
  },
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

const getHeaderResizeLabel = <TData extends object>(
  column: Column<TData | PivotRow<TData>, unknown>,
) => {
  const label = getColumnControlLabel(column);
  const leafColumns = column.getLeafColumns();
  const isLeafColumn = leafColumns.length === 1 && leafColumns[0]?.id === column.id;

  if (isLeafColumn) {
    return `Resize ${label}`;
  }

  const leafLabelSummary = leafColumns.map(getColumnControlLabel).filter(Boolean).join(", ");
  return `Resize ${label} group${leafLabelSummary ? ` (${leafLabelSummary})` : ""}`;
};

// The DataGrid engine now coordinates extracted controllers and render surfaces
// while retaining the one useReactTable ownership boundary:
//
//   1. Feature/data source   — useDataSourceController + resolved feature flags
//   2. Column config         — useColumnOrchestration
//   3. Hybrid table state    — the current*/emit* triad (delegated to useGridState.ts)
//   4. Filter matcher        — columnFilterFn closure (lockstep with the pivot loop)
//   5-6. Pivot/column defs   — usePivotOrchestration
//   7. Table instance        — the single useReactTable call
//   8. Derived view data     — option lists, summary scopes, page totals, visibleRows
//   9. Cell interaction      — focus/edit hooks + useCellRangeInteractions
//  10. Export                — CSV construction (clipboard stays with range interactions)
//  11. Render                — DataGridHeader / DataGridBody / DataGridPagination
export function DataGrid<TData extends object>({
  data: externalData = [],
  columns,
  dataSource,
  layoutMode = "grid",
  dataMode = "client",
  rowCount: externalRowCount,
  columnGroups,
  pivot: pivotConfig,
  cardView,
  filters = EMPTY_FILTERS as GridFilterConfig<TData>[],
  facetThreshold = DEFAULT_FACET_THRESHOLD,
  summaryItems = [],
  groupSummaryItems,
  groupSummaryDisplay = "inline",
  summarySelectionMode = "auto",
  features: featureOverrides,
  isLoading: externalIsLoading = false,
  error: externalError,
  emptyState,
  loadingState,
  apiRef,
  state: externalControlledState,
  onSortingChange: externalOnSortingChange,
  onGlobalFilterChange: externalOnGlobalFilterChange,
  onColumnFiltersChange: externalOnColumnFiltersChange,
  onColumnVisibilityChange,
  onColumnSizingChange,
  onColumnOrderChange,
  onColumnPinningChange,
  onPaginationChange: externalOnPaginationChange,
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
  density = "standard",
  headerWrap = false,
  searchPlaceholder = "Search rows...",
  viewNamePlaceholder = "Analysis view",
  pageSizeOptions = [25, 50, 100, 250],
  virtualizeRows = false,
  estimatedRowHeight,
  renderDetailPanel,
  rowActions,
  getRowId,
  getRowLabel,
  getRowClassName,
  onRowClick,
  onActiveRowChange,
  onFocusedCellChange,
  onCellEdit,
  onCellEditBatch,
  getExportFileName,
  renderDataSourceError,
  onDataSourceError,
}: DataGridProps<TData>) {
  // ----- 1. Feature resolution -----
  const isPivotLayout = layoutMode === "pivot";
  const {
    isDataSourceMode,
    data,
    rowCount,
    effectiveDataMode,
    isLoading,
    error,
    controlledState,
    onSortingChange,
    onGlobalFilterChange,
    onColumnFiltersChange,
    onPaginationChange,
  } = useDataSourceController({
    externalData,
    dataSource,
    isPivotLayout,
    dataMode,
    externalRowCount,
    externalIsLoading,
    externalError,
    externalControlledState,
    pageSizeOptions,
    externalOnSortingChange,
    externalOnGlobalFilterChange,
    externalOnColumnFiltersChange,
    externalOnPaginationChange,
    renderDataSourceError,
    onDataSourceError,
  });
  const isServerMode = effectiveDataMode === "server" && !isPivotLayout;
  const layoutFeatureDefaults: Partial<DataGridFeatures> =
    isPivotLayout
      ? {
          grouping: true,
        }
      : {};
  // Server mode renders a single page, so any whole-dataset aggregate (summary
  // bar, grid grouping) cannot be correct: default them OFF rather than wrong.
  // Consumer `featureOverrides` stays last, so every default is reversible.
  const dataModeFeatureDefaults: Partial<DataGridFeatures> = isServerMode
    ? { grouping: false, summaries: false }
    : {};
  const baseFeatures = {
    ...defaultFeatures,
    ...layoutFeatureDefaults,
    ...dataModeFeatureDefaults,
    ...featureOverrides,
  };
  const rootRef = useRef<HTMLDivElement | null>(null);
  const cardModeCandidate = baseFeatures.cardLayout && !isPivotLayout;
  const cardViewMode = cardView?.mode ?? "auto";
  const containerWidth = useContainerWidth(
    rootRef,
    cardModeCandidate && cardViewMode === "auto",
  );
  const displayMode: DataGridDisplayMode = !cardModeCandidate
    ? "table"
    : cardViewMode === "auto"
      ? containerWidth != null && containerWidth < (cardView?.breakpoint ?? 640)
        ? "cards"
        : "table"
      : cardViewMode;
  const isCardMode = displayMode === "cards";
  // Card mode drops the desktop-only chrome. headerFilters stays ON — it feeds
  // resolvedFilters, which the Filters sheet renders. Consumer overrides win.
  const cardModeFeatureDefaults: Partial<DataGridFeatures> = isCardMode
    ? {
        editing: false,
        cellSelection: false,
        fillHandle: false,
        clipboard: false,
        rowSelection: false,
        export: false,
        grouping: false,
        savedViews: false,
        columnResizing: false,
        floatingFilters: false,
        rowActions: false,
      }
    : {};
  const features = {
    ...baseFeatures,
    ...cardModeFeatureDefaults,
    ...featureOverrides,
  };
  const onDisplayModeChangeRef = useRef(cardView?.onDisplayModeChange);
  useEffect(() => {
    onDisplayModeChangeRef.current = cardView?.onDisplayModeChange;
  });
  const previousDisplayModeRef = useRef(displayMode);
  useEffect(() => {
    if (previousDisplayModeRef.current !== displayMode) {
      previousDisplayModeRef.current = displayMode;
      onDisplayModeChangeRef.current?.(displayMode);
    }
  }, [displayMode]);
  const densityStyle = densityStyles[density] ?? densityStyles.standard;
  const resolvedEstimatedRowHeight = estimatedRowHeight ?? densityStyle.rowHeight;
  const showRowActions =
    features.rowActions &&
    (typeof rowActions === "function" || (Array.isArray(rowActions) && rowActions.length > 0));
  // ----- 2. Column/filter orchestration -----
  const {
    columnList,
    defaultExpanded,
    pivotMeasureIds,
    defaultPivotState,
    storageKeys,
    defaultColumnOrder,
    lockedLeftColumnIds,
    defaultPinningState,
    columnsById,
    columnFacets,
    resolvedFilters,
    filterTypeByColumnId,
    filterOperatorByColumnId,
    groupableColumns,
  } = useColumnOrchestration({
    columns,
    filters,
    features,
    data,
    isPivotLayout,
    isServerMode,
    pivotConfig,
    groupSummaryItems,
    summaryItems,
    defaultGrouping,
    defaultColumnPinning,
    storageKey,
    showRowActions,
    facetThreshold,
  });
  // ----- 3. Hybrid table state (the current*/emit* triad lives in useGridState.ts) -----
  const {
    currentSorting,
    currentGlobalFilter,
    currentColumnFilters,
    currentColumnVisibility,
    currentColumnSizing,
    currentColumnOrder,
    currentColumnPinning,
    currentPagination,
    currentRowSelection,
    currentGrouping,
    currentExpanded,
    currentPivot,
    currentSavedViews,
    currentActiveViewName,
    emitSortingChange,
    emitGlobalFilterChange,
    emitColumnFiltersChange,
    emitColumnVisibilityChange,
    emitColumnSizingChange,
    emitColumnOrderChange,
    emitColumnPinningChange,
    emitPaginationChange,
    emitRowSelectionChange,
    emitGroupingChange,
    emitExpandedChange,
    emitPivotChange,
    emitSavedViewsChange,
    emitActiveViewNameChange,
  } = useGridState({
    controlledState,
    storageKeys,
    defaultColumnOrder,
    defaultPinningState,
    lockedLeftColumnIds,
    defaultGrouping,
    defaultExpanded,
    defaultPivotState,
    pageSizeOptions,
    columnPinningEnabled: features.columnPinning,
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
  });
  const [activeRow, setActiveRow] = useState<TData | null>(null);
  const [horizontalScrollLeft, setHorizontalScrollLeft] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const resetServerPaginationForQueryChange = () => {
    if (!isServerMode || isDataSourceMode || currentPagination.pageIndex === 0) {
      return;
    }
    emitPaginationChange({ ...currentPagination, pageIndex: 0 });
  };
  const emitSortingChangeWithServerReset = (updater: Parameters<typeof emitSortingChange>[0]) => {
    emitSortingChange(updater);
    resetServerPaginationForQueryChange();
  };
  const emitGlobalFilterChangeWithServerReset = (
    updater: Parameters<typeof emitGlobalFilterChange>[0],
  ) => {
    emitGlobalFilterChange(updater);
    resetServerPaginationForQueryChange();
  };

  const formatOptions = useMemo<FormatOptions>(
    () => ({ locale, currency, dateFormat }),
    [locale, currency, dateFormat],
  );
  // ----- 4. Filter matcher -----
  // Component-scoped so the "text" filter can match the column's FORMATTED text
  // (needs the column config + formatOptions). The same matcher runs in the
  // pivot source-row loop below, keeping both filter paths in lockstep.
  const columnFilterFn = useMemo<FilterFn<TData>>(
    () => (row, columnId, filterValue) => {
      const filterType = filterTypeByColumnId.get(columnId);
      const operator = filterOperatorByColumnId.get(columnId);
      const raw = row.getValue(columnId);
      const column = columnsById.get(columnId);
      const searchText =
        filterType === "text" && column
          ? getColumnSearchText(column, raw, row.original, formatOptions)
          : undefined;
      return matchesFilterValue(raw, filterValue, { filterType, operator, searchText });
    },
    [columnsById, filterOperatorByColumnId, filterTypeByColumnId, formatOptions],
  );
  const showDetailPanel = features.detailPanel && Boolean(renderDetailPanel);
  const hasLeafRowAction = showDetailPanel || Boolean(onRowClick);

  const updateActiveRow = useCallback((row: TData | null) => {
    setActiveRow(row);
    onActiveRowChange?.(row);
  }, [onActiveRowChange]);
  const closeActiveRow = useCallback(() => updateActiveRow(null), [updateActiveRow]);

  const handleRowClick = useCallback((row: TData) => {
    if (!hasLeafRowAction) {
      return;
    }

    setActiveRow((current) => {
      const next = current === row ? null : row;
      onActiveRowChange?.(next);
      return next;
    });
    onRowClick?.(row);
  }, [hasLeafRowAction, onActiveRowChange, onRowClick]);

  const getSourceRowLabel = (row: TData) => {
    const rowIndex = data.indexOf(row);
    const rowId = getRowId?.(row, rowIndex < 0 ? 0 : rowIndex) ?? String(rowIndex);
    return getRowLabel?.(row) ?? rowId;
  };

  const columnDefs = useMemo<ColumnDef<TData>[]>(
    () => [
      ...(features.rowSelection
        ? [
            {
              id: SELECT_COLUMN_ID,
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
                  className="dg-checkbox"
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
                  className="dg-checkbox"
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
        enableSorting: features.sorting && (column.enableSorting ?? true),
        enableHiding: features.columnVisibility,
        enableResizing: features.columnResizing,
        enablePinning: features.columnPinning && (column.enablePinning ?? true),
        enableGrouping: features.grouping && Boolean(column.enableGrouping),
        enableGlobalFilter: true,
        filterFn: columnFilterFn,
        ...(column.dataType === "date"
          ? { sortingFn: dateSortingFn as SortingFn<TData> }
          : column.dataType === "boolean"
            ? { sortingFn: booleanSortingFn as SortingFn<TData>, sortDescFirst: false }
            : {}),
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

  const rowActionsColumn = useMemo<ColumnDef<TData | PivotRow<TData>, unknown> | null>(
    () =>
      showRowActions && rowActions
        ? {
            id: ROW_ACTIONS_COLUMN_ID,
            header: () => <span className="dg-sr-only">Actions</span>,
            cell: ({ row }) => {
              const original = row.original;
              const sourceRow = isPivotRow(original) ? original.__leafRow : original;

              if (!sourceRow) {
                return null;
              }

              const typedRow = sourceRow as TData;
              const rowIndex = data.indexOf(typedRow);
              const rowId = getRowId?.(typedRow, rowIndex < 0 ? 0 : rowIndex) ?? row.id;

              return (
                <RowActionsMenu<TData>
                  row={typedRow}
                  rowId={rowId}
                  rowLabel={getSourceRowLabel(typedRow)}
                  actions={rowActions}
                />
              );
            },
            enableSorting: false,
            enableColumnFilter: false,
            enableHiding: false,
            enableResizing: false,
            enablePinning: false,
            size: 52,
          }
        : null,
    [data, getRowId, getSourceRowLabel, rowActions, showRowActions],
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

  // ----- 5-6. Pivot materialization + generated-column reconciliation -----
  const {
    pivotSourceRows,
    pivotSelectionMode,
    pivotSelectedSourceIds,
    getSourceRowId,
    resolvedPivotState,
    tableData,
    tableColumns,
    effectiveDefaultColumnOrder,
    effectiveColumnVisibility,
    effectiveColumnPinning,
    effectiveColumnOrder,
    isTopLevelPivotPagination,
    pivotPageCount,
  } = usePivotOrchestration({
    data,
    isPivotLayout,
    features,
    columnList,
    columnsById,
    filterTypeByColumnId,
    filterOperatorByColumnId,
    formatOptions,
    currentColumnFilters,
    currentGlobalFilter,
    currentExpanded,
    currentGrouping,
    currentPivot,
    currentPagination,
    currentSorting,
    currentRowSelection,
    currentColumnVisibility,
    currentColumnPinning,
    currentColumnOrder,
    pivotMeasureIds,
    defaultExpanded,
    defaultColumnOrder,
    lockedLeftColumnIds,
    pivotConfig,
    groupSummaryItems,
    summaryItems,
    getRowId,
    getRowLabel,
    handleRowClick,
    hasLeafRowAction,
    emitPivotChange,
    emitRowSelectionChange,
    columnDefs,
    columnGroups,
    rowActionsColumn,
    showRowActions,
  });

  // ----- 7. Table instance (single useReactTable; manual* flags flip on in server mode) -----
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
    getColumnCanGlobalFilter: () => true,
    enableExpanding: features.grouping && !isPivotLayout,
    columnResizeMode: "onChange",
    groupedColumnMode: "remove",
    paginateExpandedRows: false,
    // Editing and server refreshes replace the data array. Preserve the user's
    // expanded working context instead of collapsing groups after every edit.
    autoResetExpanded: false,
    manualSorting: isServerMode,
    manualFiltering: isServerMode,
    manualPagination: isServerMode || isTopLevelPivotPagination,
    // Unknown-total server page: -1 is TanStack's sentinel that keeps next/prev
    // operable (getCanNextPage stays true) so the consumer can page forward
    // blindly until the server returns a short/empty page. With a known rowCount,
    // TanStack derives the page count from it; pivot keeps its own pageCount.
    pageCount: isServerMode && rowCount == null ? -1 : pivotPageCount,
    rowCount: isServerMode ? rowCount : undefined,
    onSortingChange: emitSortingChangeWithServerReset,
    onGlobalFilterChange: emitGlobalFilterChangeWithServerReset,
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
    ...(features.pagination && !isTopLevelPivotPagination && !isServerMode
      ? { getPaginationRowModel: getPaginationRowModel() }
      : {}),
  });

  // ----- 8. Derived view data (option lists, summary scopes, page totals, visibleRows) -----
  // Option lists are the only O(rows) work here, so derive them once per
  // data/filters change instead of on every render (e.g. each keystroke).
  const filterOptionsById = useMemo(() => {
    const map: Record<string, string[]> = {};
    resolvedFilters.forEach((filter) => {
      map[filter.accessorKey] =
        filter.options ??
        (filter.filterType === "boolean" ? ["true", "false"] : undefined) ??
        columnFacets.get(filter.accessorKey) ??
        [];
    });
    return map;
  }, [resolvedFilters, columnFacets]);

  const toolbarFilters: GridFilter[] = resolvedFilters.map((filter) => {
    const column = isPivotLayout ? undefined : table.getColumn(filter.accessorKey);
    const pivotFilter = currentColumnFilters.find((item) => item.id === filter.accessorKey);
    return {
      id: filter.accessorKey,
      label: filter.label,
      filterType: filter.filterType,
      operator: filter.operator,
      operators: filter.operators,
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
          const keepsInactiveOperator =
            value != null &&
            typeof value === "object" &&
            !Array.isArray(value) &&
            "operator" in value;
          if (
            !keepsInactiveOperator &&
            !isFilterValueActive(value, {
              filterType: filter.filterType,
              operator: filter.operator,
            })
          ) {
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

  const getOrderedDataColumnIds = () =>
    table
      .getAllLeafColumns()
      .filter((column) => column.id !== SELECT_COLUMN_ID && column.id !== ROW_ACTIONS_COLUMN_ID)
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
    emitColumnOrderChange([
      ...(features.rowSelection ? [SELECT_COLUMN_ID] : []),
      ...nextIds,
      ...(showRowActions ? [ROW_ACTIONS_COLUMN_ID] : []),
    ]);
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
    emitColumnOrderChange([
      ...(features.rowSelection ? [SELECT_COLUMN_ID] : []),
      ...nextIds,
      ...(showRowActions ? [ROW_ACTIONS_COLUMN_ID] : []),
    ]);
  };

  const pinColumn = (columnId: string, position: false | "left" | "right") => {
    table.getColumn(columnId)?.pin(position);
  };

  const resetColumns = () => {
    emitColumnVisibilityChange({});
    emitColumnSizingChange({});
    emitColumnOrderChange(effectiveDefaultColumnOrder);
    emitColumnPinningChange(defaultPinningState);
    if (controlledState?.columnSizing === undefined) {
      removeJson(storageKeys?.columnSizing);
    }
    if (controlledState?.columnOrder === undefined) {
      removeJson(storageKeys?.columnOrder);
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
    emitColumnOrderChange(view.columnOrder ?? effectiveDefaultColumnOrder);
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
    const summaryItemByColumnId = new Map(
      summaryItemsForGroup
        .filter((item) => item.columnId)
        .map((item) => [item.columnId, item] as const),
    );
    const firstSummaryColumnIndex = visibleLeafColumns.findIndex((column) =>
      summaryItemByColumnId.has(column.id as Extract<keyof TData, string>),
    );
    const renderColumnSummaryRow =
      groupSummaryDisplay === "columns" && firstSummaryColumnIndex > 0;

    if (!renderColumnSummaryRow) {
      return (
        <tr
          key={row.id}
          ref={measureProps?.ref}
          data-index={measureProps?.["data-index"]}
          aria-rowindex={
            rowVisibleIndexById.has(row.id)
              ? headerRowCount + (rowVisibleIndexById.get(row.id) ?? 0) + 1
              : undefined
          }
          className="dg-row dg-row--group"
        >
          <td
            colSpan={visibleCellCount}
            className="dg-group-cell"
          >
            <button
              type="button"
              onClick={() => toggleGroupRow(row)}
              className={`dg-group-toggle ${densityStyle.cell}`}
              style={{ paddingLeft: 12 + row.depth * 18 }}
              aria-expanded={row.getIsExpanded()}
              aria-label={`Toggle ${groupColumnLabel} ${groupValueLabel} group`}
            >
              <span
                aria-hidden="true"
                className="dg-group-expander"
              >
                {row.getIsExpanded() ? (
                  <MinusIcon className="dg-icon--xs" />
                ) : (
                  <PlusIcon className="dg-icon--xs" />
                )}
              </span>
              <span className="dg-group-label">
                {groupColumnLabel}
              </span>
              <span className="dg-group-value">
                {renderedGroupValue}
              </span>
              <span className="dg-group-count">
                {leafRows.length} {rowLabel}
              </span>

              {summaryItemsForGroup.map((item) => (
                <span
                  key={item.id}
                  className="dg-group-measure"
                >
                  <span className="dg-group-measure-label">
                    {item.label}
                  </span>
                  <span className="dg-group-measure-value">
                    {item.value(groupContext)}
                  </span>
                </span>
              ))}
            </button>
          </td>
        </tr>
      );
    }

    const labelColumns = visibleLeafColumns.slice(0, firstSummaryColumnIndex);
    const labelWidth = labelColumns.reduce((total, column) => total + column.getSize(), 0);
    const visibleLabelWidth = Math.max(0, labelWidth - horizontalScrollLeft);
    const columnSummaryLabelStyle: CSSProperties = {
      position: "sticky",
      left: 0,
      zIndex: 1,
      width: labelWidth,
      backgroundColor: "var(--dg-surface)",
      boxShadow: "var(--dg-pinned-shadow-left)",
      clipPath:
        visibleLabelWidth < labelWidth
          ? `inset(0 ${labelWidth - visibleLabelWidth}px 0 0)`
          : undefined,
    };

    return (
      <tr
        key={row.id}
        ref={measureProps?.ref}
        data-index={measureProps?.["data-index"]}
        aria-rowindex={
          rowVisibleIndexById.has(row.id)
            ? headerRowCount + (rowVisibleIndexById.get(row.id) ?? 0) + 1
            : undefined
        }
        className="dg-row dg-row--group"
      >
        <td
          colSpan={firstSummaryColumnIndex}
          aria-colindex={1}
          style={columnSummaryLabelStyle}
          className="dg-group-cell dg-group-cell--summary-label"
        >
          <button
            type="button"
            onClick={() => toggleGroupRow(row)}
            className={`dg-group-toggle ${densityStyle.cell}`}
            style={{ paddingLeft: 12 + row.depth * 18 }}
            aria-expanded={row.getIsExpanded()}
            aria-label={`Toggle ${groupColumnLabel} ${groupValueLabel} group`}
          >
            <span
              aria-hidden="true"
              className="dg-group-expander"
            >
              {row.getIsExpanded() ? (
                <MinusIcon className="dg-icon--xs" />
              ) : (
                <PlusIcon className="dg-icon--xs" />
              )}
            </span>
            <span className="dg-group-label">
              {groupColumnLabel}
            </span>
            <span className="dg-group-value">
              {renderedGroupValue}
            </span>
            <span className="dg-group-count">
              {leafRows.length} {rowLabel}
            </span>
          </button>
        </td>
        {visibleLeafColumns.slice(firstSummaryColumnIndex).map((column) => {
          const item = summaryItemByColumnId.get(column.id as Extract<keyof TData, string>);
          const columnConfig = columnsById.get(column.id);
          const isNumeric =
            columnConfig?.dataType === "currency" ||
            columnConfig?.dataType === "number" ||
            columnConfig?.dataType === "percent";

          return (
            <td
              key={`${row.id}:${column.id}`}
              aria-colindex={visibleLeafColumns.findIndex((visible) => visible.id === column.id) + 1}
              style={{ width: column.getSize() }}
              className={`dg-group-summary-cell ${densityStyle.cell} ${
                isNumeric ? "dg-cell--numeric" : "dg-cell--text"
              }`}
              title={item?.label}
            >
              {item ? (
                <span className="dg-group-summary-value">
                  <span className="dg-sr-only">{item.label}: </span>
                  {item.value(groupContext)}
                </span>
              ) : null}
            </td>
          );
        })}
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
  // Server mode: the page total comes from the server (rowCount), not from the
  // in-memory page (data.length). Undefined when an unknown-total server page.
  const displayedTotalRowCount = isServerMode ? rowCount : data.length;
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

  useDataGridApi({
    apiRef,
    table,
    columnsById,
    resolvedFilterIds: resolvedFilters.map((filter) => filter.accessorKey),
    groupableColumnIds: groupableColumns.map((column) => column.id),
    pivotMeasureIds,
    layoutMode,
    dataMode: effectiveDataMode,
    displayMode,
    features,
    state: {
      sorting: currentSorting,
      globalFilter: currentGlobalFilter,
      columnFilters: currentColumnFilters,
      columnVisibility: effectiveColumnVisibility,
      columnSizing: currentColumnSizing,
      columnOrder: effectiveColumnOrder,
      columnPinning: effectiveColumnPinning,
      pagination: currentPagination,
      rowSelection: currentRowSelection,
      grouping: currentGrouping,
      expanded: currentExpanded,
      pivot: currentPivot,
    },
    emitters: {
      sorting: emitSortingChangeWithServerReset,
      globalFilter: emitGlobalFilterChangeWithServerReset,
      columnFilters: emitColumnFiltersChange,
      columnVisibility: emitColumnVisibilityChange,
      columnSizing: emitColumnSizingChange,
      columnOrder: emitColumnOrderChange,
      columnPinning: emitColumnPinningChange,
      rowSelection: emitRowSelectionChange,
      grouping: emitGroupingChange,
      pivot: emitPivotChange,
    },
    counts: {
      loaded: data.length,
      filtered: filteredRowCount,
      selected: selectedRowCount,
      visible: visibleRows.length,
      total: displayedTotalRowCount,
    },
    defaultColumnOrder: effectiveDefaultColumnOrder,
    defaultColumnPinning: defaultPinningState,
    lockedLeftColumnIds,
    controlledState,
    storageKeys,
    getColumnLabel: (columnId) => {
      const column = table.getColumn(columnId);
      return column ? getColumnControlLabel(column) : columnId;
    },
  });

  // Card layout renders leaf rows only (grouping defaults off in card mode,
  // but a consumer can force it back on — group rows are filtered, not shown).
  // Grid layout only (pivot never reaches card mode), so originals are TData.
  const cardRows = isCardMode
    ? (visibleRows.filter((row) => !row.getIsGrouped()) as unknown as Row<TData>[])
    : [];

  const rowVirtualizer = useVirtualizer({
    count: isCardMode ? cardRows.length : visibleRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () =>
      isCardMode ? Math.max(resolvedEstimatedRowHeight, 96) : resolvedEstimatedRowHeight,
    overscan: 12,
    enabled: virtualizeRows,
  });
  const bodyColSpan = table.getVisibleLeafColumns().length;
  const rowById = useMemo(
    () => new Map(visibleRows.map((row) => [row.id, row])),
    [visibleRows],
  );

  // ----- 9. Keyboard cell navigation + inline editing -----
  // useCellFocus owns the roving-tabindex geometry + focus; useCellEditing owns
  // the edit state machine; onCellKeyDown (below) is the precedence-chain
  // orchestrator that wires them together with row actions and clipboard.
  const visibleLeafColumns = table.getVisibleLeafColumns();
  // Card composition follows the CURRENT visible leaf set, so column
  // visibility/order changes keep applying in card mode.
  const cardRoles = useMemo(
    () =>
      composeCardRoles(
        visibleLeafColumns
          .map((column) => columnsById.get(column.id))
          .filter((column): column is AnyColumnConfig<TData> => Boolean(column)),
        cardView?.card,
      ),
    [visibleLeafColumns, columnsById, cardView?.card],
  );
  const compactSortColumns = useMemo<CompactSortColumn[]>(
    () =>
      visibleLeafColumns
        .filter(
          (column) =>
            column.id !== SELECT_COLUMN_ID &&
            column.id !== ROW_ACTIONS_COLUMN_ID &&
            column.getCanSort(),
        )
        .map((column) => ({
          id: column.id,
          label: getColumnControlLabel(column),
          direction: column.getIsSorted(),
        })),
    // currentSorting is what actually changes getIsSorted()'s answer.
    [visibleLeafColumns, currentSorting],
  );
  // Single-column cycle: tap a new column → asc; same column → desc; again → clear.
  const handleCompactSort = (columnId: string) => {
    const current = currentSorting[0];
    if (current?.id !== columnId) {
      emitSortingChangeWithServerReset([{ id: columnId, desc: false }]);
    } else if (!current.desc) {
      emitSortingChangeWithServerReset([{ id: columnId, desc: true }]);
    } else {
      emitSortingChangeWithServerReset([]);
    }
  };
  const clampColumnWidth = (
    column: Column<TData | PivotRow<TData>, unknown>,
    width: number,
  ) => {
    const min = column.columnDef.minSize ?? 48;
    const max = column.columnDef.maxSize ?? Number.POSITIVE_INFINITY;
    return Math.round(Math.max(min, Math.min(max, width)));
  };
  const setColumnWidth = (
    column: Column<TData | PivotRow<TData>, unknown>,
    width: number,
  ) => {
    emitColumnSizingChange((current) => ({
      ...current,
      [column.id]: clampColumnWidth(column, width),
    }));
  };
  const autosizeColumn = (column: Column<TData | PivotRow<TData>, unknown>) => {
    const label = getColumnControlLabel(column);
    const sampleRows = visibleRows.slice(0, 100);
    const longestText = sampleRows.reduce((longest, row) => {
      const raw = row.getValue(column.id);
      const columnConfig = columnsById.get(column.id);
      const text =
        columnConfig && !isPivotRow(row.original)
          ? getColumnSearchText(columnConfig, raw, row.original, formatOptions)
          : String(raw ?? "");
      return Math.max(longest, text.length);
    }, label.length);
    setColumnWidth(column, longestText * 8 + 48);
  };
  const fitVisibleColumns = () => {
    const resizableColumns = table.getVisibleLeafColumns().filter((column) => column.getCanResize());
    if (resizableColumns.length === 0) {
      return;
    }

    const targetWidth = Math.max(scrollRef.current?.clientWidth ?? 0, minTableWidth);
    const baseWidths = resizableColumns.map((column) =>
      clampColumnWidth(column, column.columnDef.size ?? column.getSize()),
    );
    const baseTotal = baseWidths.reduce((total, width) => total + width, 0);
    if (baseTotal <= 0) {
      return;
    }

    emitColumnSizingChange((current) => {
      const next = { ...current };
      resizableColumns.forEach((column, index) => {
        next[column.id] = clampColumnWidth(column, (baseWidths[index] / baseTotal) * targetWidth);
      });
      return next;
    });
  };
  const resetColumnWidth = (column: Column<TData | PivotRow<TData>, unknown>) => {
    emitColumnSizingChange((current) => {
      const next = { ...current };
      delete next[column.id];
      return next;
    });
  };
  const {
    navColumnIds,
    navRowIds,
    rowVisibleIndexById,
    headerRowCount,
    activeTabCell,
    cellKey,
    cellRefs,
    focusCell,
    updateFocusedCell,
  } = useCellFocus({
    visibleRows,
    isPivotLayout,
    table,
    floatingFiltersEnabled: features.floatingFilters,
    nonNavigableColumnIds: [SELECT_COLUMN_ID, ROW_ACTIONS_COLUMN_ID],
    virtualizeRows,
    rowVirtualizer,
    onFocusedCellChange,
  });
  const {
    editingCell,
    isCellEditable,
    beginEdit,
    cancelEdit,
    commitEdit,
    statusEditOptions,
  } = useCellEditing({
    editingEnabled: features.editing,
    columnsById,
    data,
    navColumnIds,
    onCellEdit,
    focusCell,
  });
  const {
    cellSelectionEnabled,
    fillHandleEnabled,
    clipboardNotice,
    getCellRangeState,
    onCellClick,
    onCellMouseDown,
    onCellMouseEnter,
    onFillHandleMouseDown,
    onCellKeyDown,
    onCellPaste,
  } = useCellRangeInteractions({
    features,
    isPivotLayout,
    table,
    data,
    columnsById,
    formatOptions,
    locale,
    navRowIds,
    navColumnIds,
    rowById,
    activeTabCell,
    cellKey,
    focusCell,
    editingCell,
    isCellEditable,
    beginEdit,
    hasLeafRowAction,
    handleRowClick,
    onCellEdit,
    onCellEditBatch,
  });

  useEffect(() => {
    if (activeRow == null) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      // The editor stops Escape from reaching here, but guard anyway so a cell
      // edit always wins the Escape over closing the detail panel.
      if (event.key === "Escape" && editingCell == null) {
        closeActiveRow();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRow, editingCell]);

  // ----- 10. Export + clipboard -----
  const exportLeafColumns = () =>
    table
      .getVisibleLeafColumns()
      .filter((column) => column.id !== SELECT_COLUMN_ID && column.id !== ROW_ACTIONS_COLUMN_ID);
  const getExportText = (
    row: Row<TData | PivotRow<TData>>,
    column: Column<TData | PivotRow<TData>, unknown>,
  ) => {
    const value = row.getValue(column.id);
    if (isPivotRow(row.original)) {
      return value == null ? "" : String(value);
    }
    const columnConfig = columnsById.get(column.id);
    return columnConfig
      ? getColumnSearchText(columnConfig, value, row.original as TData, formatOptions)
      : value == null
        ? ""
        : String(value);
  };
  const leafExportRows = (source: Row<TData | PivotRow<TData>>[]) =>
    source.filter((row) => !row.getIsGrouped());
  // Selection-only export is a grid-mode feature. Pivot selection is over source
  // rows (a separate, less-complete model), so pivot always exports all visible
  // pivot rows rather than silently mapping a selection it can't represent here.
  const selectedExportRows = () =>
    isPivotLayout ? [] : leafExportRows(table.getSelectedRowModel().flatRows);
  const handleExportCsv = () => {
    const columns = exportLeafColumns();
    const selected = selectedExportRows();
    // No selection → all filtered rows across pages (client mode). In server
    // mode getFilteredRowModel() holds only the loaded page, so export is
    // scoped to that page (documented degradation).
    const exportRows = selected.length
      ? selected
      : isPivotLayout
        ? table.getPrePaginationRowModel().rows
        : leafExportRows(table.getFilteredRowModel().flatRows);
    const header = columns.map((column) => getColumnControlLabel(column));
    const body = exportRows.map((row) => columns.map((column) => getExportText(row, column)));
    const fileName =
      getExportFileName?.({ rowCount: exportRows.length, selectedCount: selected.length }) ??
      `${tableLabel ?? "data"}.csv`;
    downloadTextFile(fileName, "text/csv;charset=utf-8", toCsv([header, ...body]));
  };
  // ----- Value-driven cell visual effects (grid mode) -----
  // Per-column numeric domain (min/max) over the filtered rows, computed only for
  // colorScale/dataBar columns that did not pin an explicit domain. In server mode
  // the filtered model is the loaded page, so the domain is page-scoped.
  const effectColumns = useMemo(
    () => columnList.filter((column) => column.colorScale || column.dataBar),
    [columnList],
  );
  const filteredRowModel = table.getFilteredRowModel();
  const columnDomains = useMemo(() => {
    const domains = new Map<string, NumericDomain>();
    if (effectColumns.length === 0) {
      return domains;
    }
    const leafRows = filteredRowModel.flatRows
      .filter((row) => row.subRows.length === 0 && !isPivotRow(row.original))
      .map((row) => row.original as TData);
    for (const column of effectColumns) {
      const needsAutoDomain =
        (column.colorScale && !column.colorScale.domain) || (column.dataBar && !column.dataBar.domain);
      if (!needsAutoDomain) {
        continue;
      }
      const domain = computeColumnDomain(leafRows, column.accessorKey as keyof TData);
      if (domain) {
        domains.set(column.accessorKey, domain);
      }
    }
    return domains;
  }, [effectColumns, filteredRowModel]);

  // Flash-on-change: a grid-level previous-value map (survives cell unmount under
  // virtualization), diffed in an effect keyed on `data` to avoid render-time
  // hazards. The first run seeds silently so nothing flashes on mount.
  const flashColumns = useMemo(
    () => columnList.filter((column) => column.flashOnChange),
    [columnList],
  );
  const flashEnabled = flashColumns.length > 0;
  type FlashEntry = { direction: FlashDirection; token: number; className?: string; duration: number };
  const [flashMap, setFlashMap] = useState<Map<string, FlashEntry>>(() => new Map());
  const flashPrevRef = useRef<Map<string, unknown>>(new Map());
  const flashSeededRef = useRef(false);
  const flashTokenRef = useRef(0);
  const flashTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    if (!flashEnabled) {
      return;
    }
    const leaves = table
      .getCoreRowModel()
      .flatRows.filter((row) => row.subRows.length === 0 && !isPivotRow(row.original));
    const previous = flashPrevRef.current;
    const next = new Map(previous);
    const changes: Array<{ key: string; direction: FlashDirection; className?: string; duration: number }> = [];
    for (const row of leaves) {
      for (const column of flashColumns) {
        const key = `${row.id}:${column.accessorKey}`;
        const value = (row.original as Record<string, unknown>)[column.accessorKey];
        if (previous.has(key) && !Object.is(previous.get(key), value)) {
          const config = typeof column.flashOnChange === "object" ? column.flashOnChange : {};
          const direction = flashDirection(previous.get(key), value);
          changes.push({
            key,
            direction,
            className:
              direction === "up"
                ? config.upClassName
                : direction === "down"
                  ? config.downClassName
                  : undefined,
            duration: config.duration ?? 1200,
          });
        }
        next.set(key, value);
      }
    }
    flashPrevRef.current = next;
    if (!flashSeededRef.current) {
      flashSeededRef.current = true;
      return;
    }
    if (changes.length === 0) {
      return;
    }
    const entries = changes.map((change) => ({ ...change, token: ++flashTokenRef.current }));
    setFlashMap((current) => {
      const updated = new Map(current);
      for (const entry of entries) {
        updated.set(entry.key, {
          direction: entry.direction,
          token: entry.token,
          className: entry.className,
          duration: entry.duration,
        });
      }
      return updated;
    });
    for (const entry of entries) {
      const timer = setTimeout(() => {
        flashTimersRef.current.delete(timer);
        setFlashMap((current) => {
          const existing = current.get(entry.key);
          if (!existing || existing.token !== entry.token) {
            return current;
          }
          const updated = new Map(current);
          updated.delete(entry.key);
          return updated;
        });
      }, entry.duration);
      flashTimersRef.current.add(timer);
    }
  }, [data, flashEnabled, flashColumns, table]);

  useEffect(() => {
    const timers = flashTimersRef.current;
    return () => {
      for (const timer of timers) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

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
      // Header cells (z-30) live inside the `sticky z-10` <thead> stacking
      // context, so 30 is only relative to sibling header cells. Pinned body
      // cells live in <tbody> (no stacking context), so their z-index resolves
      // against the root alongside the header's effective z-10 — keep it below
      // 10 (but above non-pinned body cells at z-auto) or they paint over the
      // header as the body scrolls underneath.
      zIndex: options.header ? 30 : 1,
      backgroundColor: options.backgroundColor,
      boxShadow: isLeftEdge
        ? "var(--dg-pinned-shadow-left)"
        : isRightEdge
          ? "var(--dg-pinned-shadow-right)"
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
        ? "var(--dg-pivot-grand-bg)"
        : pivotRow.__depth === 0
          ? "var(--dg-pivot-group-bg)"
          : "var(--dg-bg)"
      : row.getIsSelected()
        ? "var(--dg-info-bg)"
        : "var(--dg-bg)";
    const rowClassName = pivotRow
      ? `dg-row dg-row--pivot ${
          pivotRow.__kind === "grandTotal"
            ? "dg-row--grand-total"
            : pivotRow.__depth === 0
              ? "dg-row--pivot-group"
              : "dg-row--pivot-leaf"
        }`
      : `dg-row ${isActionable ? "dg-row--actionable" : ""} ${
          row.getIsSelected() ? "dg-row--selected" : "dg-row--default"
        } ${activeRow === sourceRow ? "dg-row--active" : ""} ${
          isActionable ? "dg-row--focusable" : ""
        } ${sourceRow ? getRowClassName?.(sourceRow as TData) ?? "" : ""}`;

    return (
      <tr
        key={row.id}
        ref={measureProps?.ref}
        data-index={measureProps?.["data-index"]}
        aria-rowindex={
          rowVisibleIndexById.has(row.id)
            ? headerRowCount + (rowVisibleIndexById.get(row.id) ?? 0) + 1
            : undefined
        }
        onClick={() => {
          if (sourceRow && isActionable) {
            handleRowClick(sourceRow as TData);
          }
        }}
        className={rowClassName}
      >
        {row.getVisibleCells().map((cell) => {
          const columnConfig = !pivotRow ? columnsById.get(cell.column.id) : undefined;
          const isPivotMeasure =
            Boolean(pivotRow) &&
            cell.column.id !== PIVOT_ROW_LABEL_COLUMN_ID &&
            cell.column.id !== ROW_ACTIONS_COLUMN_ID;
          const isNavCell = navColumnIds.includes(cell.column.id);
          const isTabStop =
            activeTabCell?.rowId === row.id && activeTabCell?.columnId === cell.column.id;
          const colIndex = visibleLeafColumns.findIndex((column) => column.id === cell.column.id);
          const isEditingCell =
            editingCell?.rowId === row.id && editingCell?.columnId === cell.column.id;
          const canEditCell = isNavCell && Boolean(columnConfig) && isCellEditable(row, cell.column.id);
          const {
            isSelected: isCellRangeSelected,
            isFillHandle: isFillHandleCell,
            isFillPreview: isFillPreviewCell,
          } = getCellRangeState(row.id, cell.column.id);

          // Value-driven visual effects (grid data cells only; suppressed while editing).
          const cellValue = cell.getValue();
          const effectDomain = columnConfig ? columnDomains.get(cell.column.id) : undefined;
          const cellColorScale =
            columnConfig?.colorScale && !isEditingCell
              ? colorScaleStyle(cellValue, columnConfig.colorScale, effectDomain)
              : null;
          const barGeometry =
            columnConfig?.dataBar && !isEditingCell
              ? computeBarGeometry(cellValue, columnConfig.dataBar, effectDomain)
              : null;
          const flashEntry =
            flashEnabled && columnConfig?.flashOnChange && !isEditingCell
              ? flashMap.get(`${row.id}:${cell.column.id}`)
              : undefined;
          const hasCellOverlay = Boolean(barGeometry || flashEntry);
          const useScaleStyle = Boolean(cellColorScale) && !isCellRangeSelected && !row.getIsSelected();

          return (
            <td
              key={cell.id}
              onDoubleClick={
                canEditCell ? () => beginEdit(row.id, cell.column.id) : undefined
              }
              onClick={
                cell.column.id === ROW_ACTIONS_COLUMN_ID
                  ? (event) => event.stopPropagation()
                  : isNavCell
                  ? onCellClick
                  : undefined
              }
              onMouseDown={
                isNavCell && cellSelectionEnabled
                  ? (event) =>
                      onCellMouseDown(event, { rowId: row.id, columnId: cell.column.id })
                  : undefined
              }
              onMouseEnter={
                isNavCell && cellSelectionEnabled
                  ? (event) =>
                      onCellMouseEnter(event, { rowId: row.id, columnId: cell.column.id })
                  : undefined
              }
              ref={
                isNavCell
                  ? (node) => {
                      const key = cellKey(row.id, cell.column.id);
                      if (node) {
                        cellRefs.current.set(key, node);
                      } else {
                        cellRefs.current.delete(key);
                      }
                    }
                  : undefined
              }
              aria-colindex={colIndex >= 0 ? colIndex + 1 : undefined}
              tabIndex={isNavCell ? (isTabStop ? 0 : -1) : undefined}
              onKeyDown={isNavCell ? (event) => onCellKeyDown(event, row, cell.column.id) : undefined}
              onPaste={
                isNavCell
                  ? (event) => onCellPaste(event, row, cell.column.id)
                  : undefined
              }
              onFocus={
                isNavCell
                  ? () => updateFocusedCell({ rowId: row.id, columnId: cell.column.id })
                  : undefined
              }
              aria-selected={isCellRangeSelected ? true : undefined}
              data-cell-selected={isCellRangeSelected ? "true" : undefined}
              data-fill-preview={isFillPreviewCell ? "true" : undefined}
              style={{
                width: cell.column.getSize(),
                ...(useScaleStyle
                  ? { backgroundColor: cellColorScale?.backgroundColor, color: cellColorScale?.color }
                  : {}),
                ...getPinnedColumnStyle(cell.column, {
                  backgroundColor: isCellRangeSelected
                    ? "var(--dg-range-bg)"
                    : row.getIsSelected()
                      ? "var(--dg-info-bg)"
                      : useScaleStyle
                        ? cellColorScale?.backgroundColor
                        : rowBackground,
                }),
              }}
              className={`dg-cell ${densityStyle.cell} ${
                pivotRow ? "dg-cell--pivot" : "dg-cell--body"
              } ${
                isPivotMeasure
                  ? "dg-cell--numeric dg-cell--strong"
                  : columnConfig
                    ? getCellClasses(columnConfig, cell.getValue(), sourceRow as TData)
                    : "dg-cell--text dg-cell--strong"
              } ${isCellRangeSelected ? "dg-cell--selected" : ""} ${
                cellSelectionEnabled ? "dg-cell--selection-enabled" : ""
              } ${
                isEditingCell ? "dg-cell--editing" : ""
              } ${
                hasCellOverlay
                  ? "dg-cell--effect"
                  : fillHandleEnabled && isFillHandleCell
                    ? "dg-cell--fill-target"
                    : ""
              } ${
                isFillPreviewCell ? "dg-cell--fill-preview" : ""
              }`}
            >
              {barGeometry ? (
                <DataBarFill
                  geometry={barGeometry}
                  color={columnConfig?.dataBar?.color}
                  negativeColor={columnConfig?.dataBar?.negativeColor}
                />
              ) : null}
              {flashEntry ? (
                <FlashOverlay
                  key={flashEntry.token}
                  direction={flashEntry.direction}
                  className={flashEntry.className}
                  duration={flashEntry.duration}
                />
              ) : null}
              {isEditingCell && columnConfig ? (
                <CellEditor<TData>
                  column={columnConfig as unknown as EditCellColumn<TData>}
                  value={cell.getValue()}
                  row={sourceRow as TData}
                  statusOptions={statusEditOptions(cell.column.id)}
                  onCommit={(value, advance) => commitEdit(row, cell.column.id, value, advance)}
                  onCancel={() => cancelEdit(row.id, cell.column.id)}
                />
              ) : hasCellOverlay ? (
                <span
                  className={`dg-cell-effect-value ${
                    columnConfig?.dataBar?.showValue === false ? "dg-cell-effect-value--hidden" : ""
                  }`}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </span>
              ) : (
                flexRender(cell.column.columnDef.cell, cell.getContext())
              )}
              {fillHandleEnabled && isFillHandleCell ? (
                <span
                  data-fill-handle
                  aria-hidden="true"
                  className="dg-fill-handle"
                  onMouseDown={onFillHandleMouseDown}
                />
              ) : null}
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

  // ----- 11. Render (toolbar → table/card body → pager) -----
  const overlay: ReactNode =
    error !== undefined && error !== null ? (
      <div className="dg-state-message dg-state-message--error">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="dg-state-icon" fill="none" stroke="currentColor" strokeWidth={1.6}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7.5v5" strokeLinecap="round" />
          <circle cx="12" cy="16" r="0.6" fill="currentColor" />
        </svg>
        <div>{error}</div>
      </div>
    ) : isLoading ? (
      loadingState ?? (
        <div className="dg-state-message dg-state-message--loading">
          <span
            aria-hidden="true"
            className="dg-spinner"
          />
          <span>Loading {rowLabel}...</span>
        </div>
      )
    ) : visibleRows.length === 0 ? (
      emptyState ?? (
        <div className="dg-state-message dg-state-message--empty">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="dg-state-icon dg-state-icon--empty" fill="none" stroke="currentColor" strokeWidth={1.4}>
            <rect x="3.5" y="5" width="17" height="14" rx="2" />
            <path d="M3.5 9.5h17M9 5v14" />
          </svg>
          <span>No {rowLabel} found.</span>
        </div>
      )
    ) : null;

  return (
    <div ref={rootRef} className="dg-root dg-container">
      <div className="dg-main">
        {features.toolbar ? (
          isCardMode ? (
            <ToolbarCompact
              search={String(currentGlobalFilter ?? "")}
              searchPlaceholder={searchPlaceholder}
              enableGlobalSearch={features.globalSearch}
              onSearchChange={emitGlobalFilterChangeWithServerReset}
              enableSorting={features.sorting}
              sortColumns={compactSortColumns}
              onSortColumn={handleCompactSort}
              onClearSort={() => emitSortingChangeWithServerReset([])}
              filters={toolbarFilters}
              onClearFilters={clearFilters}
            />
          ) : (
          <Toolbar
            search={currentGlobalFilter}
            searchPlaceholder={searchPlaceholder}
            filters={toolbarFilters}
            showFiltersPopover={isPivotLayout}
            enableExport={features.export}
            onExportCsv={handleExportCsv}
            enableGlobalSearch={features.globalSearch}
            enableColumnVisibility={features.columnVisibility}
            enableColumnOrdering={features.columnOrdering}
            enableColumnPinning={features.columnPinning}
            enableSavedViews={features.savedViews}
            enableGrouping={features.grouping}
            enableCollapsibleControls={features.collapsibleToolbar}
            columns={table
              .getAllLeafColumns()
              .filter((column) => column.id !== SELECT_COLUMN_ID && column.id !== ROW_ACTIONS_COLUMN_ID)
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
            onSearchChange={emitGlobalFilterChangeWithServerReset}
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
          )
        ) : null}

        <div className="dg-status-bar">
          <span>
            {displayedTotalRowCount != null
              ? `${filteredRowCount} of ${displayedTotalRowCount} ${rowLabel}`
              : `${filteredRowCount} ${rowLabel}`}
          </span>
          <div className="dg-status-actions">
            {clipboardNotice ? (
              <span
                key={clipboardNotice.id}
                role="status"
                aria-live="polite"
                aria-atomic="true"
                data-tone={clipboardNotice.tone}
                className="dg-clipboard-status"
              >
                {clipboardNotice.message}
              </span>
            ) : null}
            {features.sorting && currentSorting.length > 0 ? (
              <button
                type="button"
                onClick={() => emitSortingChangeWithServerReset([])}
                className="dg-link-button"
              >
                Clear sort
              </button>
            ) : null}
            {features.rowSelection ? <span>{selectedRowCount} selected</span> : null}
          </div>
        </div>

        {features.filterSummary ? (
          <AppliedFilters
            filters={toolbarFilters}
            globalSearch={String(currentGlobalFilter ?? "")}
            onClearGlobalSearch={() => emitGlobalFilterChangeWithServerReset("")}
            onClearAll={clearFilters}
          />
        ) : null}

        {showSelectAllBanner ? (
          <div className="dg-selection-banner">
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
              className="dg-selection-banner-action"
            >
              Select all {filteredRowCount} {rowLabel}
            </button>
          </div>
        ) : null}

        {showSummaries ? (
          isCardMode ? (
            <div className="dg-summary-bar">
              {summaryItems.map((item) => (
                <div
                  key={item.id}
                  className="dg-summary-chip"
                >
                  <span className="dg-summary-chip-label">
                    {item.label}
                  </span>
                  <span className="dg-summary-chip-value">
                    {item.value(summaryContext)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
          <div className="dg-summary-panel">
            <div className="dg-summary-heading">
              <span>Summary</span>
              <span>
                {summaryScope === "selected"
                  ? `${selectedSummaryRows.length} selected`
                  : `${filteredSummaryRows.length} filtered`}
              </span>
            </div>
            <div className="dg-summary-grid">
              {summaryItems.map((item) => (
                <div
                  key={item.id}
                  className="dg-summary-item"
                >
                  <div className="dg-summary-item-label">
                    {item.label}
                  </div>
                  <div className="dg-summary-item-value">
                    {item.value(summaryContext)}
                  </div>
                  {item.description ? (
                    <div className="dg-summary-item-description">
                      {item.description(summaryContext)}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
          )
        ) : null}

        <div className="dg-table-region">
          {overlay ? (
            <div
              role={error ? "alert" : "status"}
              aria-live="polite"
              className="dg-overlay"
            >
              {overlay}
            </div>
          ) : null}
          <div
            ref={scrollRef}
            onScroll={(event) => setHorizontalScrollLeft(event.currentTarget.scrollLeft)}
            className="dg-scroll-area"
          >
          {isCardMode ? (
            <CardList
              rows={cardRows}
              roles={cardRoles}
              card={cardView?.card}
              formatOptions={formatOptions}
              columnDomains={columnDomains}
              activeRow={activeRow}
              hasRowAction={hasLeafRowAction}
              onCardClick={handleRowClick}
              getRowClassName={getRowClassName}
              virtualizeRows={virtualizeRows}
              virtualizer={rowVirtualizer}
              label={tableLabel}
            />
          ) : (
          <table
            data-density={density}
            className="dg-table"
            style={{ minWidth: minTableWidth }}
            aria-rowcount={
              headerRowCount +
              (isServerMode
                ? Math.max(rowCount ?? visibleRows.length, 0)
                : visibleRows.length)
            }
            aria-colcount={visibleLeafColumns.length}
          >
            {tableLabel ? <caption className="dg-sr-only">{tableLabel}</caption> : null}
            {/* Fixed layout reads column widths from the first row, which can
                be a band-header row with colSpans — a colgroup keeps leaf
                widths authoritative so getSize() matches what renders (pinned
                offsets are computed from getSize() sums). */}
            <colgroup>
              {visibleLeafColumns.map((column) => (
                <col key={column.id} style={{ width: column.getSize() }} />
              ))}
            </colgroup>
            <DataGridHeader
              table={table}
              visibleLeafColumns={visibleLeafColumns}
              isPivotLayout={isPivotLayout}
              features={features}
              densityStyle={densityStyle}
              headerWrap={headerWrap}
              currentSorting={currentSorting}
              headerFilterById={headerFilterById}
              getColumnControlLabel={getColumnControlLabel}
              getHeaderResizeLabel={getHeaderResizeLabel}
              getPinnedColumnStyle={getPinnedColumnStyle}
              onSortingChange={(sorting) => emitSortingChangeWithServerReset(sorting)}
              resetPageIndex={resetPageIndex}
              autosizeColumn={autosizeColumn}
              fitVisibleColumns={fitVisibleColumns}
              resetColumnWidth={resetColumnWidth}
            />
            <DataGridBody
              visibleRows={visibleRows}
              virtualizeRows={virtualizeRows}
              bodyColSpan={bodyColSpan}
              rowVirtualizer={rowVirtualizer}
              renderRow={renderVisibleRow}
            />
          </table>
          )}
          </div>
        </div>

        {features.pagination ? (
          <DataGridPagination
            table={table}
            displayedTotalRowCount={displayedTotalRowCount}
            rowLabel={rowLabel}
            pageSizeOptions={pageSizeOptions}
          />
        ) : null}
      </div>

      {showDetailPanel ? (
        isCardMode ? (
          <BottomSheet open={activeRow !== null} label="Details" onClose={closeActiveRow}>
            {renderDetailPanel?.(activeRow, { close: closeActiveRow })}
          </BottomSheet>
        ) : (
          renderDetailPanel?.(activeRow, { close: closeActiveRow })
        )
      ) : null}
    </div>
  );
}
