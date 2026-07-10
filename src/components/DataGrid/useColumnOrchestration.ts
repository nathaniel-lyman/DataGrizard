import { useMemo } from "react";
import type {
  ColumnOrderState,
  ColumnPinningState,
  ExpandedState,
  GroupingState,
} from "@tanstack/react-table";
import type {
  GridColumnConfig,
  GridFilterConfig,
  GridFilterOperator,
  GridFilterType,
} from "../../types/grid";
import type { DataGridFeatures, DataGridSummaryItem } from "./dataGridTypes";
import { DEFAULT_FACET_THRESHOLD, resolveFilterType } from "./filterDefaults";
import {
  columnNumericExtent,
  normalizeColumnPinning,
  uniqueColumnValues,
} from "./gridHelpers";
import type { AnyColumnConfig } from "./cells";
import { PIVOT_ROW_LABEL_COLUMN_ID, type DataGridPivotConfig, type DataGridPivotState } from "./pivot";
import { ROW_ACTIONS_COLUMN_ID, SELECT_COLUMN_ID } from "./gridConstants";

type ColumnOrchestrationArgs<TData extends object> = {
  columns: GridColumnConfig<TData>[];
  filters: GridFilterConfig<TData>[];
  features: DataGridFeatures;
  data: TData[];
  isPivotLayout: boolean;
  isServerMode: boolean;
  pivotConfig?: DataGridPivotConfig<TData>;
  groupSummaryItems?: DataGridSummaryItem<TData>[];
  summaryItems: DataGridSummaryItem<TData>[];
  defaultGrouping: GroupingState;
  defaultColumnPinning?: ColumnPinningState;
  storageKey?: string;
  showRowActions: boolean;
  facetThreshold?: number;
};

export function useColumnOrchestration<TData extends object>({
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
  facetThreshold = DEFAULT_FACET_THRESHOLD,
}: ColumnOrchestrationArgs<TData>) {
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
            columnPresentation: `${storageKey}.columnPresentation`,
            savedViews: `${storageKey}.savedViews`,
          }
        : undefined,
    [storageKey],
  );
  const defaultColumnOrder = useMemo<ColumnOrderState>(
    () => [
      ...(features.rowSelection ? [SELECT_COLUMN_ID] : []),
      ...(isPivotLayout
        ? [PIVOT_ROW_LABEL_COLUMN_ID, ...pivotMeasureIds.map((id) => `measure:${id}`)]
        : columnList.map((column) => column.accessorKey)),
      ...(showRowActions ? [ROW_ACTIONS_COLUMN_ID] : []),
    ],
    [columnList, features.rowSelection, isPivotLayout, pivotMeasureIds, showRowActions],
  );
  const lockedLeftColumnIds = useMemo(
    () => (features.columnPinning && features.rowSelection ? [SELECT_COLUMN_ID] : []),
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
        ...(showRowActions ? [ROW_ACTIONS_COLUMN_ID] : []),
      ],
    };

    return normalizeColumnPinning(configured, lockedLeftColumnIds);
  }, [columnList, defaultColumnPinning, isPivotLayout, lockedLeftColumnIds, showRowActions]);
  const columnsById = useMemo<Map<string, AnyColumnConfig<TData>>>(
    () => new Map(columnList.map((column) => [column.accessorKey, column])),
    [columnList],
  );
  const overridesByKey = useMemo(
    () => new Map(filters.map((filter) => [filter.accessorKey as string, filter])),
    [filters],
  );
  const filterableColumnConfigs = useMemo<AnyColumnConfig<TData>[]>(() => {
    if (!features.headerFilters) return [];
    const eligible = columnList.filter((column) => column.enableFiltering !== false);
    if (features.autoColumnFilters) {
      return eligible.filter(
        (column) => overridesByKey.get(column.accessorKey as string)?.filterable !== false,
      );
    }
    return eligible.filter(
      (column) =>
        overridesByKey.has(column.accessorKey as string) &&
        overridesByKey.get(column.accessorKey as string)?.filterable !== false,
    );
  }, [columnList, features.autoColumnFilters, features.headerFilters, overridesByKey]);

  const columnFacets = useMemo(() => {
    const map = new Map<string, string[]>();
    if (isServerMode) return map;
    filterableColumnConfigs.forEach((column) => {
      const overrideType = overridesByKey.get(column.accessorKey as string)?.filterType;
      const needsFacets =
        overrideType === "select" ||
        overrideType === "multiSelect" ||
        column.dataType === "text" ||
        column.dataType === "status";
      if (needsFacets) {
        map.set(column.accessorKey as string, uniqueColumnValues(data, column.accessorKey));
      }
    });
    return map;
  }, [data, filterableColumnConfigs, isServerMode, overridesByKey]);

  const columnRangeBounds = useMemo(() => {
    const map = new Map<string, { min: number; max: number }>();
    if (isServerMode) return map;
    filterableColumnConfigs.forEach((column) => {
      if (
        column.dataType === "number" ||
        column.dataType === "currency" ||
        column.dataType === "percent"
      ) {
        const extent = columnNumericExtent(data, column.accessorKey);
        if (extent) map.set(column.accessorKey as string, extent);
      }
    });
    return map;
  }, [data, filterableColumnConfigs, isServerMode]);

  const resolvedFilters = useMemo(
    () =>
      filterableColumnConfigs.map((column) => {
        const key = column.accessorKey as string;
        const override = overridesByKey.get(key);
        const filterType =
          override?.filterType ??
          resolveFilterType({
            dataType: column.dataType,
            distinctCount: columnFacets.get(key)?.length,
            hasStaticOptions: Boolean(override?.options?.length),
            isServerMode,
            facetThreshold,
          });
        const bounds = columnRangeBounds.get(key);
        return {
          accessorKey: key,
          label: override?.label ?? column.header,
          filterType,
          operator: override?.operator,
          operators: override?.operators,
          options: override?.options,
          formatOption: override?.formatOption,
          min: override?.min ?? bounds?.min,
          max: override?.max ?? bounds?.max,
          step: override?.step,
          placeholder: override?.placeholder,
          dateFormat: override?.dateFormat,
          presets: override?.presets,
        };
      }),
    [
      columnFacets,
      columnRangeBounds,
      facetThreshold,
      filterableColumnConfigs,
      isServerMode,
      overridesByKey,
    ],
  );
  const filterTypeByColumnId = useMemo<Map<string, GridFilterType>>(
    () => new Map(resolvedFilters.map((filter) => [filter.accessorKey, filter.filterType])),
    [resolvedFilters],
  );
  const filterOperatorByColumnId = useMemo<Map<string, GridFilterOperator | undefined>>(
    () => new Map(resolvedFilters.map((filter) => [filter.accessorKey, filter.operator])),
    [resolvedFilters],
  );
  const groupableColumns = useMemo(
    () =>
      columnList
        .filter((column) => features.grouping && column.enableGrouping)
        .map((column) => ({ id: column.accessorKey, label: column.header })),
    [columnList, features.grouping],
  );

  return {
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
  };
}
