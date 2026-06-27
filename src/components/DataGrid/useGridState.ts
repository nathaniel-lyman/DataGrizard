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

type EmitChangeOptions<TValue> = {
  isControlled: boolean;
  setValue: (next: TValue) => void;
  storageKey?: string;
  onChange?: (next: TValue) => void;
};

const emitResolvedChange = <TValue,>(
  next: TValue,
  { isControlled, setValue, storageKey, onChange }: EmitChangeOptions<TValue>,
) => {
  if (!isControlled) {
    setValue(next);
    saveJson(storageKey, next);
  }
  onChange?.(next);
};

const emitUpdaterChange = <TValue,>(
  updater: Updater<TValue>,
  current: TValue,
  options: EmitChangeOptions<TValue>,
  normalize?: (next: TValue) => TValue,
) => {
  const resolved = resolveUpdater(updater, current);
  emitResolvedChange(normalize ? normalize(resolved) : resolved, options);
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
    emitUpdaterChange(updater, currentSorting, {
      isControlled: controlledState?.sorting !== undefined,
      setValue: setSorting,
      onChange: onSortingChange,
    });
  };
  const emitGlobalFilterChange = (updater: Updater<string>) => {
    emitUpdaterChange(updater, currentGlobalFilter, {
      isControlled: controlledState?.globalFilter !== undefined,
      setValue: setGlobalFilter,
      onChange: onGlobalFilterChange,
    });
  };
  const emitColumnFiltersChange = (updater: Updater<ColumnFiltersState>) => {
    emitUpdaterChange(updater, currentColumnFilters, {
      isControlled: controlledState?.columnFilters !== undefined,
      setValue: setColumnFilters,
      onChange: onColumnFiltersChange,
    });
  };
  const emitColumnVisibilityChange = (updater: Updater<VisibilityState>) => {
    emitUpdaterChange(updater, currentColumnVisibility, {
      isControlled: controlledState?.columnVisibility !== undefined,
      setValue: setColumnVisibility,
      onChange: onColumnVisibilityChange,
    });
  };
  const emitColumnSizingChange = (updater: Updater<ColumnSizingState>) => {
    emitUpdaterChange(updater, currentColumnSizing, {
      isControlled: controlledState?.columnSizing !== undefined,
      setValue: setColumnSizing,
      storageKey: storageKeys?.columnSizing,
      onChange: onColumnSizingChange,
    });
  };
  const emitColumnOrderChange = (updater: Updater<ColumnOrderState>) => {
    emitUpdaterChange(updater, currentColumnOrder, {
      isControlled: controlledState?.columnOrder !== undefined,
      setValue: setColumnOrder,
      storageKey: storageKeys?.columnOrder,
      onChange: onColumnOrderChange,
    });
  };
  const emitColumnPinningChange = (updater: Updater<ColumnPinningState>) => {
    emitUpdaterChange(
      updater,
      currentColumnPinning,
      {
        isControlled: controlledState?.columnPinning !== undefined,
        setValue: setColumnPinning,
        storageKey: storageKeys?.columnPinning,
        onChange: onColumnPinningChange,
      },
      (next) => normalizeColumnPinning(next, lockedLeftColumnIds),
    );
  };
  const emitPaginationChange = (updater: Updater<PaginationState>) => {
    emitUpdaterChange(updater, currentPagination, {
      isControlled: controlledState?.pagination !== undefined,
      setValue: setPagination,
      onChange: onPaginationChange,
    });
  };
  const emitRowSelectionChange = (updater: Updater<RowSelectionState>) => {
    emitUpdaterChange(updater, currentRowSelection, {
      isControlled: controlledState?.rowSelection !== undefined,
      setValue: setRowSelection,
      onChange: onRowSelectionChange,
    });
  };
  const emitGroupingChange = (updater: Updater<GroupingState>) => {
    emitUpdaterChange(updater, currentGrouping, {
      isControlled: controlledState?.grouping !== undefined,
      setValue: setGrouping,
      onChange: onGroupingChange,
    });
  };
  const emitExpandedChange = (updater: Updater<ExpandedState>) => {
    emitUpdaterChange(updater, currentExpanded, {
      isControlled: controlledState?.expanded !== undefined,
      setValue: setExpanded,
      onChange: onExpandedChange,
    });
  };
  const emitPivotChange = (updater: Updater<DataGridPivotState>) => {
    emitUpdaterChange(updater, currentPivot, {
      isControlled: controlledState?.pivot !== undefined,
      setValue: setPivot,
      onChange: onPivotChange,
    });
  };
  const emitSavedViewsChange = (next: DataGridSavedViews) => {
    emitResolvedChange(next, {
      isControlled: controlledState?.savedViews !== undefined,
      setValue: setSavedViews,
      storageKey: storageKeys?.savedViews,
      onChange: onSavedViewsChange,
    });
  };
  const emitActiveViewNameChange = (next: string) => {
    emitResolvedChange(next, {
      isControlled: controlledState?.activeViewName !== undefined,
      setValue: setActiveViewName,
      onChange: onActiveViewNameChange,
    });
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
