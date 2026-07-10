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
  VisibilityState,
} from "@tanstack/react-table";
import type { GridDataType } from "../../types/grid";
import type { DataGridDataMode, DataGridFeatures, DataGridLayoutMode } from "./dataGridTypes";
import type { DataGridPivotState } from "./pivot";

export type DataGridColumnSnapshot = {
  id: string;
  label: string;
  dataType?: GridDataType;
  generated: boolean;
  visible: boolean;
  order: number;
  size: number;
  minSize: number;
  maxSize: number;
  pinned: false | "left" | "right";
  canHide: boolean;
  canSort: boolean;
  canFilter: boolean;
  canResize: boolean;
  canPin: boolean;
  canGroup: boolean;
};

export type DataGridSnapshot = {
  revision: number;
  layoutMode: DataGridLayoutMode;
  dataMode: DataGridDataMode;
  displayMode: "table" | "cards";
  features: DataGridFeatures;
  columns: DataGridColumnSnapshot[];
  rowCounts: {
    loaded: number;
    filtered: number;
    selected: number;
    visible: number;
    total?: number;
  };
  state: {
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
};

export type DataGridCommand =
  | {
      type: "set_column_visibility";
      columnIds: string[];
      visible: boolean;
    }
  | {
      type: "move_columns";
      columnIds: string[];
      /** Omit to move the columns to the end of the data-column order. */
      beforeColumnId?: string;
    }
  | {
      type: "pin_columns";
      columnIds: string[];
      position: "left" | "right" | null;
    }
  | {
      type: "set_column_sizes";
      sizes: Record<string, number>;
    }
  | { type: "reset_columns" }
  | { type: "set_sorting"; sorting: SortingState }
  | { type: "set_global_filter"; value: string }
  | { type: "set_column_filters"; filters: ColumnFiltersState }
  | {
      type: "set_row_selection";
      rowIds: string[];
      mode?: "replace" | "add" | "remove";
    }
  | { type: "set_grouping"; columnIds: string[] }
  | { type: "set_pivot"; pivot: DataGridPivotState };

export type DataGridCommandErrorCode =
  | "empty_command"
  | "duplicate_id"
  | "feature_disabled"
  | "invalid_column"
  | "invalid_row"
  | "invalid_value"
  | "unsupported_layout";

export type DataGridCommandError = {
  commandIndex: number;
  code: DataGridCommandErrorCode;
  message: string;
  id?: string;
};

export type DataGridCommandResult =
  | { ok: true; appliedCommandCount: number; errors: [] }
  | { ok: false; appliedCommandCount: 0; errors: DataGridCommandError[] };

export type DataGridApi<TData extends object> = {
  /** Returns a detached, serializable description of the current grid view. */
  getSnapshot: () => DataGridSnapshot;
  /** Validates the complete batch before applying any command. */
  dispatch: (commands: DataGridCommand[]) => DataGridCommandResult;
};

