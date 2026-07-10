import { useMemo } from "react";
import type {
  ColumnDef,
  ColumnFiltersState,
  ColumnOrderState,
  ColumnPinningState,
  ExpandedState,
  GroupingState,
  PaginationState,
  RowSelectionState,
  SortingState,
  Updater,
  VisibilityState,
} from "@tanstack/react-table";
import type { FormatOptions } from "../../utils/formatters";
import type { GridFilterOperator, GridFilterType } from "../../types/grid";
import type {
  DataGridFeatures,
  DataGridProps,
  DataGridSummaryItem,
} from "./dataGridTypes";
import type { AnyColumnConfig } from "./cells";
import { getColumnSearchText } from "./cells";
import { buildGroupedColumnDefs } from "./columnGroups";
import type { DataGridColumnGroup } from "./columnGroups";
import { isFilterValueActive, matchesFilterValue } from "./filterMatch";
import {
  getSelectionStatus,
  isGeneratedPivotColumnId,
  normalizeColumnPinning,
  reconcileColumnOrder,
} from "./gridHelpers";
import { ROW_ACTIONS_COLUMN_ID, SELECT_COLUMN_ID } from "./gridConstants";
import {
  materializePivot,
  type DataGridPivotMeasure,
  type DataGridPivotState,
  type PivotRow,
} from "./pivot";

type PivotOrchestrationArgs<TData extends object> = {
  data: TData[];
  isPivotLayout: boolean;
  features: DataGridFeatures;
  columnList: AnyColumnConfig<TData>[];
  columnsById: Map<string, AnyColumnConfig<TData>>;
  filterTypeByColumnId: Map<string, GridFilterType>;
  filterOperatorByColumnId: Map<string, GridFilterOperator | undefined>;
  formatOptions: FormatOptions;
  currentColumnFilters: ColumnFiltersState;
  currentGlobalFilter: string;
  currentExpanded: ExpandedState;
  currentGrouping: GroupingState;
  currentPivot: DataGridPivotState;
  currentPagination: PaginationState;
  currentSorting: SortingState;
  currentRowSelection: RowSelectionState;
  currentColumnVisibility: VisibilityState;
  currentColumnPinning: ColumnPinningState;
  currentColumnOrder: ColumnOrderState;
  pivotMeasureIds: string[];
  defaultExpanded: ExpandedState;
  defaultColumnOrder: ColumnOrderState;
  lockedLeftColumnIds: string[];
  pivotConfig?: DataGridProps<TData>["pivot"];
  groupSummaryItems?: DataGridSummaryItem<TData>[];
  summaryItems: DataGridSummaryItem<TData>[];
  getRowId?: DataGridProps<TData>["getRowId"];
  getRowLabel?: DataGridProps<TData>["getRowLabel"];
  handleRowClick: (row: TData) => void;
  hasLeafRowAction: boolean;
  emitPivotChange: (updater: Updater<DataGridPivotState>) => void;
  emitRowSelectionChange: (updater: Updater<RowSelectionState>) => void;
  columnDefs: ColumnDef<TData>[];
  columnGroups?: DataGridColumnGroup[];
  rowActionsColumn: ColumnDef<TData | PivotRow<TData>, unknown> | null;
  showRowActions: boolean;
};

export function usePivotOrchestration<TData extends object>({
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
}: PivotOrchestrationArgs<TData>) {
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

  const pivotSourceRows = useMemo(() => {
    if (!isPivotLayout) return data;
    const activeFilters = currentColumnFilters.filter((filter) =>
      isFilterValueActive(filter.value, {
        filterType: filterTypeByColumnId.get(filter.id),
        operator: filterOperatorByColumnId.get(filter.id),
      }),
    );
    const needle = features.globalSearch
      ? String(currentGlobalFilter ?? "").trim().toLowerCase()
      : "";

    return data.filter((row) => {
      const passesColumnFilters = activeFilters.every((filter) => {
        const raw = row[filter.id as Extract<keyof TData, string>];
        const filterType = filterTypeByColumnId.get(filter.id);
        const operator = filterOperatorByColumnId.get(filter.id);
        const column = columnsById.get(filter.id);
        const searchText =
          filterType === "text" && column
            ? getColumnSearchText(column, raw, row, formatOptions)
            : undefined;
        return matchesFilterValue(raw, filter.value, { filterType, operator, searchText });
      });
      if (!passesColumnFilters || !needle) return passesColumnFilters;
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
    filterOperatorByColumnId,
    filterTypeByColumnId,
    formatOptions,
    isPivotLayout,
  ]);

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
            getRowId: getRowId ? (row, index) => getRowId(row, index) : undefined,
            getRowLabel,
            rowLabelColumn: pivotConfig?.rowLabelColumn,
            showLeafRows: pivotConfig?.showLeafRows,
            onToggleRow: (rowId) => {
              emitPivotChange((current) => {
                const expanded = current.expanded ?? defaultExpanded;
                const nextExpanded =
                  expanded === true
                    ? { [rowId]: false }
                    : {
                        ...(typeof expanded === "object" ? expanded : {}),
                        [rowId]: !Boolean(
                          typeof expanded === "object" ? expanded[rowId] : false,
                        ),
                      };
                return { ...current, expanded: nextExpanded };
              });
            },
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
      defaultExpanded,
      features.columnPinning,
      features.columnResizing,
      features.columnVisibility,
      features.sorting,
      getRowId,
      getRowLabel,
      handleRowClick,
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
        if (selected) next[rowId] = true;
        else delete next[rowId];
      });
      return next;
    });
  };
  const pivotSelectionColumn = useMemo<ColumnDef<PivotRow<TData>, unknown>>(
    () => ({
      id: SELECT_COLUMN_ID,
      header: ({ table }) => {
        if (pivotSelectionMode !== "sourceRows") {
          return (
            <input
              type="checkbox"
              checked={table.getIsAllPageRowsSelected()}
              ref={(input) => {
                if (input) input.indeterminate = table.getIsSomePageRowsSelected();
              }}
              onChange={table.getToggleAllPageRowsSelectedHandler()}
              aria-label="Select all visible pivot rows"
              className="dg-checkbox"
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
              if (input) input.indeterminate = selection.someSelected;
            }}
            onChange={(event) => setSourceRowsSelected(pivotSourceRows, event.currentTarget.checked)}
            aria-label="Select all filtered source rows"
            className="dg-checkbox"
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
              className="dg-checkbox"
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
              if (input) input.indeterminate = selection.someSelected;
            }}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) =>
              setSourceRowsSelected(row.original.__sourceRows, event.currentTarget.checked)
            }
            aria-label={`Select source rows for ${row.original.__labelText}`}
            className="dg-checkbox"
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
    [pivotSelectedSourceIds, pivotSelectionMode, pivotSourceRows],
  );

  const tableData = (pivotMaterialization?.data ?? data) as (TData | PivotRow<TData>)[];
  const groupedColumnDefs = useMemo(() => {
    if (isPivotLayout || !columnGroups?.length) return columnDefs;
    const selectDef = features.rowSelection ? columnDefs[0] : undefined;
    const dataDefs = features.rowSelection ? columnDefs.slice(1) : columnDefs;
    const grouped = buildGroupedColumnDefs(dataDefs, columnGroups);
    return selectDef ? [selectDef, ...grouped] : grouped;
  }, [columnDefs, columnGroups, features.rowSelection, isPivotLayout]);
  const tableColumns = (pivotMaterialization
    ? [
        ...(features.rowSelection ? [pivotSelectionColumn] : []),
        ...pivotMaterialization.columns,
        ...(rowActionsColumn ? [rowActionsColumn] : []),
      ]
    : [...groupedColumnDefs, ...(rowActionsColumn ? [rowActionsColumn] : [])]) as ColumnDef<
    TData | PivotRow<TData>,
    unknown
  >[];
  const effectiveDefaultColumnOrder = useMemo<ColumnOrderState>(
    () =>
      pivotMaterialization
        ? [
            ...(features.rowSelection ? [SELECT_COLUMN_ID] : []),
            ...pivotMaterialization.metadata.generatedColumnIds,
            ...(showRowActions ? [ROW_ACTIONS_COLUMN_ID] : []),
          ]
        : defaultColumnOrder,
    [defaultColumnOrder, features.rowSelection, pivotMaterialization, showRowActions],
  );
  const generatedPivotColumnIds = useMemo(
    () => new Set(pivotMaterialization?.metadata.generatedColumnIds ?? []),
    [pivotMaterialization],
  );
  const effectiveColumnVisibility = useMemo<VisibilityState>(() => {
    if (!pivotMaterialization) return currentColumnVisibility;
    return Object.fromEntries(
      Object.entries(currentColumnVisibility).filter(
        ([columnId]) => !isGeneratedPivotColumnId(columnId) || generatedPivotColumnIds.has(columnId),
      ),
    );
  }, [currentColumnVisibility, generatedPivotColumnIds, pivotMaterialization]);
  const effectiveColumnPinning = useMemo<ColumnPinningState>(() => {
    if (!pivotMaterialization) return currentColumnPinning;
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
      return reconcileColumnOrder(currentColumnOrder, effectiveDefaultColumnOrder);
    }
    const generatedAxisIds = pivotMaterialization.metadata.generatedColumnIds.filter((columnId) =>
      columnId.includes("|col:"),
    );
    const hasGeneratedPivotOrder = generatedAxisIds.length
      ? currentColumnOrder.some((columnId) => generatedAxisIds.includes(columnId))
      : currentColumnOrder.some((columnId) =>
          pivotMaterialization.metadata.generatedColumnIds.includes(columnId),
        );
    return hasGeneratedPivotOrder
      ? reconcileColumnOrder(currentColumnOrder, effectiveDefaultColumnOrder)
      : effectiveDefaultColumnOrder;
  }, [currentColumnOrder, effectiveDefaultColumnOrder, pivotMaterialization]);
  const isTopLevelPivotPagination =
    isPivotLayout && resolvedPivotState.paginationMode === "topLevelGroups";
  const pivotPageCount =
    pivotMaterialization && isTopLevelPivotPagination
      ? Math.max(
          Math.ceil(
            pivotMaterialization.metadata.topLevelGroupCount / currentPagination.pageSize,
          ),
          1,
        )
      : undefined;

  return {
    pivotSourceRows,
    pivotSelectionMode,
    pivotSelectedSourceIds,
    getSourceRowId,
    resolvedPivotState,
    pivotMaterialization,
    tableData,
    tableColumns,
    effectiveDefaultColumnOrder,
    effectiveColumnVisibility,
    effectiveColumnPinning,
    effectiveColumnOrder,
    isTopLevelPivotPagination,
    pivotPageCount,
  };
}
