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
import type { DataGridDisplayMode } from "../../types/grid";
import type { AnyColumnConfig } from "./cells";
import type {
  DataGridApi,
  DataGridCommand,
  DataGridCommandError,
  DataGridCommandErrorCode,
  DataGridCommandResult,
  DataGridSnapshot,
} from "./dataGridApi";
import type {
  DataGridControlledState,
  DataGridDataMode,
  DataGridFeatures,
  DataGridLayoutMode,
} from "./dataGridTypes";
import { ROW_ACTIONS_COLUMN_ID, SELECT_COLUMN_ID } from "./gridConstants";
import { removeJson } from "./storage";
import type { DataGridPivotState, PivotRow } from "./pivot";

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
  rowSelection: (updater: Updater<RowSelectionState>) => void;
  grouping: (updater: Updater<GroupingState>) => void;
  pivot: (updater: Updater<DataGridPivotState>) => void;
};

type StorageKeys = {
  columnSizing: string;
  columnOrder: string;
  columnPinning: string;
};

type UseDataGridApiOptions<TData extends object> = {
  apiRef?: Ref<DataGridApi<TData>>;
  table: Table<TData | PivotRow<TData>>;
  columnsById: Map<string, AnyColumnConfig<TData>>;
  resolvedFilterIds: string[];
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
};

const hasDuplicates = (ids: string[]) => new Set(ids).size !== ids.length;

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
  resolvedFilterIds,
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
    state.grouping,
    state.expanded,
    state.pivot,
    counts.loaded,
    counts.filtered,
    counts.selected,
    counts.visible,
    counts.total,
  ];
  const revisionRef = useRef<{ inputs: unknown[]; value: number }>({ inputs: [], value: 0 });
  if (
    revisionRef.current.inputs.length !== revisionInputs.length ||
    revisionRef.current.inputs.some((value, index) => value !== revisionInputs[index])
  ) {
    revisionRef.current = {
      inputs: revisionInputs,
      value: revisionRef.current.value + 1,
    };
  }

  const dataColumns = table
    .getAllLeafColumns()
    .filter((column) => column.id !== SELECT_COLUMN_ID && column.id !== ROW_ACTIONS_COLUMN_ID);
  const dataColumnIds = dataColumns.map((column) => column.id);
  const dataColumnIdSet = new Set(dataColumnIds);
  const sourceColumnIdSet = new Set(columnsById.keys());
  const filterableColumnIdSet = new Set(resolvedFilterIds);
  const groupableColumnIdSet = new Set(groupableColumnIds);
  const loadedRowIdSet = new Set(table.getCoreRowModel().flatRows.map((row) => row.id));
  const pivotMeasureIdSet = new Set(pivotMeasureIds);
  const lockedLeftColumnIdSet = new Set(lockedLeftColumnIds);

  const getSnapshot = (): DataGridSnapshot => ({
    revision: revisionRef.current.value,
    layoutMode,
    dataMode,
    displayMode,
    features: { ...features },
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
      grouping: [...state.grouping],
      expanded: cloneExpanded(state.expanded),
      pivot: clonePivot(state.pivot),
    },
  });

  const dispatch = (commands: DataGridCommand[]): DataGridCommandResult => {
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
          validateIds(command.columnIds, dataColumnIdSet, errors, commandIndex, "column");
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
        case "set_row_selection":
          requireFeature(features.rowSelection, commandIndex, "Row selection");
          validateIds(command.rowIds, loadedRowIdSet, errors, commandIndex, "row", true);
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

    let nextSorting = state.sorting;
    let nextGlobalFilter = state.globalFilter;
    let nextColumnFilters = state.columnFilters;
    let nextColumnVisibility = state.columnVisibility;
    let nextColumnSizing = state.columnSizing;
    let nextColumnOrder = state.columnOrder;
    let nextColumnPinning = state.columnPinning;
    let nextRowSelection = state.rowSelection;
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
    if (changed.has("rowSelection")) emitters.rowSelection(nextRowSelection);
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

  useImperativeHandle(apiRef, () => ({ getSnapshot, dispatch }));
}
