// Encapsulates the DataGrid's controlled/uncontrolled hybrid table state. Each
// slice follows the same triad: a `current*` value (controlledState ?? internal),
// an `emit*Change` that writes internal state ONLY while uncontrolled, persists
// the four storage-backed slices, then fires the optional on*Change callback.
// DataGrid types are import-type-only (erased, no runtime cycle).
import { useState } from "react";
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
  Updater,
  VisibilityState,
} from "@tanstack/react-table";
import { normalizeColumnPinning, resolveUpdater } from "./gridHelpers";
import { loadJson, saveJson } from "./storage";
import type { DataGridPivotState } from "./pivot";
import type { DataGridControlledState, DataGridSavedViews } from "./DataGrid";

type StorageKeys = {
  columnSizing: string;
  columnOrder: string;
  columnPinning: string;
  savedViews: string;
};

type UseGridStateOptions = {
  controlledState: DataGridControlledState | undefined;
  storageKeys: StorageKeys | undefined;
  defaultColumnOrder: ColumnOrderState;
  defaultPinningState: ColumnPinningState;
  lockedLeftColumnIds: string[];
  defaultGrouping: GroupingState;
  defaultExpanded: ExpandedState;
  defaultPivotState: DataGridPivotState;
  pageSizeOptions: number[];
  columnPinningEnabled: boolean;
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
};

export function useGridState({
  controlledState,
  storageKeys,
  defaultColumnOrder,
  defaultPinningState,
  lockedLeftColumnIds,
  defaultGrouping,
  defaultExpanded,
  defaultPivotState,
  pageSizeOptions,
  columnPinningEnabled,
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
}: UseGridStateOptions) {
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
  const currentColumnPinning = columnPinningEnabled
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

  return {
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
  };
}
