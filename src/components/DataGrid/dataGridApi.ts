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
import type {
  GridColumnSemanticMetadata,
  GridDataType,
  GridFilterOperator,
  GridFilterType,
  GridSemanticAllowedValue,
} from "../../types/grid";
import type {
  DataGridCellRange,
  DataGridColumnPresentationState,
  DataGridDataMode,
  DataGridFeatures,
  DataGridLayoutMode,
} from "./dataGridTypes";
import type { DataGridPivotState } from "./pivot";
import type {
  DataGridAnalysisCapabilities,
  DataGridAnalysisExecution,
  DataGridAnalysisExecutionOptions,
} from "./dataGridAnalysisContract";

export type DataGridQueryScope = "all" | "filtered" | "selected_rows" | "visible_page";

export type DataGridSerializableValue =
  | null
  | boolean
  | number
  | string
  | DataGridSerializableValue[]
  | { [key: string]: DataGridSerializableValue };

export type DataGridDataAccessLimits = {
  maxRowsPerQuery: number;
  maxCellsPerQuery: number;
  maxGroupsPerAggregate: number;
  maxTopValues: number;
};

export type DataGridQuery = {
  scope: DataGridQueryScope;
  /** Defaults to the cell/column selection, then the visible data columns. */
  columnIds?: string[];
  offset?: number;
  limit?: number;
};

export type DataGridQueryRow = {
  rowId: string;
  values: Record<string, DataGridSerializableValue>;
};

export type DataGridAnalysisColumn = {
  id: string;
  label: string;
  dataType?: GridDataType;
};

export type DataGridAnalysisFilterSnapshot = {
  globalFilter: string;
  columnFilters: Array<{
    id: string;
    value: DataGridSerializableValue;
  }>;
};

export type DataGridAnalysisWarningCode =
  | "offset_applied"
  | "rows_truncated"
  | "groups_truncated"
  | "top_values_truncated"
  | "limit_clamped"
  | "supporting_rows_truncated"
  | "view_changed_during_execution"
  | "provider_limit_applied";

export type DataGridAnalysisWarning = {
  code: DataGridAnalysisWarningCode;
  message: string;
  limit?: number;
  actual?: number;
};

export type DataGridAnalysisTiming = {
  startedAt: string;
  completedAt: string;
  durationMs: number;
};

export type DataGridQueryReplay = {
  operation: "query";
  payload: Required<DataGridQuery>;
};

export type DataGridAggregateReplay = {
  operation: "aggregate";
  payload: DataGridAggregateQuery & { groupBy: string[] };
};

/**
 * Detached provenance for an analysis result. Consumers can render this beside
 * an assistant answer and replay the normalized payload against the same grid.
 */
export type DataGridAnalysisReceipt = {
  queryId: string;
  gridRevision: number;
  scope: DataGridQueryScope;
  columns: DataGridAnalysisColumn[];
  filters: DataGridAnalysisFilterSnapshot;
  sorting: SortingState;
  grouping: {
    /** Grouping that shaped a visible-page scope. */
    view: string[];
    /** Grouping explicitly requested by an aggregate query. */
    aggregateBy: string[];
  };
  supportingRowIds: string[];
  supportingGroupKeys: Array<Record<string, DataGridSerializableValue>>;
  warnings: DataGridAnalysisWarning[];
  timing: DataGridAnalysisTiming;
  replay: DataGridQueryReplay | DataGridAggregateReplay;
  completedGridRevision: number;
  execution: DataGridAnalysisExecution;
  limits: DataGridDataAccessLimits;
  supportingRowCount: number;
  supportingRowIdsTruncated: boolean;
};

export type DataGridDataErrorCode =
  | "invalid_column"
  | "invalid_query"
  | "limit_exceeded"
  | "scope_unavailable"
  | "analysis_aborted"
  | "analysis_failed"
  | "invalid_analysis_response";

export type DataGridDataError = {
  code: DataGridDataErrorCode;
  message: string;
  id?: string;
};

export type DataGridQueryResult =
  | {
      ok: true;
      scope: DataGridQueryScope;
      columns: Array<{ id: string; label: string; dataType?: GridDataType }>;
      rows: DataGridQueryRow[];
      rowCount: number;
      returnedRowCount: number;
      offset: number;
      truncated: boolean;
      receipt: DataGridAnalysisReceipt;
    }
  | { ok: false; scope: DataGridQueryScope; error: DataGridDataError };

export type DataGridAggregateOperation =
  | "count"
  | "sum"
  | "average"
  | "min"
  | "max"
  | "min_max"
  | "distinct_count"
  | "top_values";

export type DataGridColumnFilterSnapshot = {
  type: GridFilterType;
  operators: GridFilterOperator[];
  allowedValues?: GridSemanticAllowedValue[];
  min?: number;
  max?: number;
};

/** Source-column contract used by analysis and agent integrations. */
export type DataGridSourceColumnSnapshot = {
  id: string;
  label: string;
  dataType: GridDataType;
  semantic?: GridColumnSemanticMetadata;
  visible: boolean;
  canHide: boolean;
  canSort: boolean;
  canFilter: boolean;
  canGroup: boolean;
  filter?: DataGridColumnFilterSnapshot;
  aggregateOperations: DataGridAggregateOperation[];
};

export type DataGridAggregateMetric = {
  /** Optional only for count, which counts rows when omitted. */
  columnId?: string;
  operation: DataGridAggregateOperation;
  /** Stable result key. Defaults to `${operation}:${columnId ?? "rows"}`. */
  as?: string;
  /** Only applies to top_values and is clamped by the grid data-access limits. */
  limit?: number;
};

export type DataGridAggregateQuery = {
  scope: DataGridQueryScope;
  metrics: DataGridAggregateMetric[];
  /** One or more source columns for grouped metrics. */
  groupBy?: string[];
};

export type DataGridAggregateGroup = {
  key: Record<string, DataGridSerializableValue>;
  rowCount: number;
  metrics: Record<string, DataGridSerializableValue>;
};

export type DataGridAggregateResult =
  | {
      ok: true;
      scope: DataGridQueryScope;
      rowCount: number;
      metrics: Record<string, DataGridSerializableValue>;
      groups: DataGridAggregateGroup[];
      truncated: boolean;
      receipt: DataGridAnalysisReceipt;
    }
  | { ok: false; scope: DataGridQueryScope; error: DataGridDataError };

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
  /** Stable source columns, including when the rendered pivot columns are generated. */
  sourceColumns: DataGridSourceColumnSnapshot[];
  /** Columns in the current rendered layout (source or generated pivot columns). */
  columns: DataGridColumnSnapshot[];
  rowCounts: {
    loaded: number;
    filtered: number;
    selected: number;
    visible: number;
    total?: number;
  };
  analysis: DataGridAnalysisCapabilities;
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
    selectedColumnIds: string[];
    cellSelection: DataGridCellRange | null;
    columnPresentation: DataGridColumnPresentationState;
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
  | { type: "set_pagination"; pagination: PaginationState }
  | {
      type: "set_row_selection";
      rowIds: string[];
      mode?: "replace" | "add" | "remove";
    }
  | {
      type: "set_selected_columns";
      columnIds: string[];
      mode?: "replace" | "add" | "remove";
    }
  | { type: "set_cell_selection"; selection: DataGridCellRange | null }
  | {
      type: "set_column_presentation";
      presentation: DataGridColumnPresentationState;
      mode?: "merge" | "replace";
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
  | "stale_revision"
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

export type DataGridTransactionStateKey = keyof DataGridSnapshot["state"];

export type DataGridTransactionDiffEntry = {
  stateKey: DataGridTransactionStateKey;
  before: DataGridSerializableValue;
  after: DataGridSerializableValue;
};

/** Serializable preview of every state slice a command batch would change. */
export type DataGridTransactionDiff = {
  entries: DataGridTransactionDiffEntry[];
  commandTypes: DataGridCommand["type"][];
  columnIds: string[];
  rowIds: string[];
};

export type DataGridActionPlan = {
  planId: string;
  baseRevision: number;
  commands: DataGridCommand[];
  diff: DataGridTransactionDiff;
};

export type DataGridPlanResult =
  | { ok: true; plan: DataGridActionPlan; errors: [] }
  | { ok: false; plan: null; errors: DataGridCommandError[] };

export type DataGridPlanValidationResult =
  | {
      ok: true;
      planId: string;
      revision: number;
      diff: DataGridTransactionDiff;
      errors: [];
    }
  | {
      ok: false;
      planId: string;
      revision: number;
      errors: DataGridCommandError[];
    };

export type DataGridTransactionReceipt = {
  transactionId: string;
  planId: string;
  baseRevision: number;
  /** Revision expected after React commits the emitted state changes. */
  appliedRevision: number;
  appliedCommandCount: number;
  diff: DataGridTransactionDiff;
};

export type DataGridApplyPlanResult =
  | { ok: true; receipt: DataGridTransactionReceipt; errors: [] }
  | { ok: false; receipt: null; errors: DataGridCommandError[] };

export type DataGridUndoResult =
  | {
      ok: true;
      transactionId: string;
      revertedTransactionId: string;
      revision: number;
      diff: DataGridTransactionDiff;
      errors: [];
    }
  | {
      ok: false;
      transactionId: null;
      revertedTransactionId: string;
      revision: number;
      errors: DataGridCommandError[];
    };

export type DataGridApi<TData extends object> = {
  /** Returns a detached, serializable description of the current grid view. */
  getSnapshot: () => DataGridSnapshot;
  /** Reads bounded, plain serializable rows from a well-defined grid scope. */
  query: (input: DataGridQuery) => DataGridQueryResult;
  /** Computes bounded, serializable metrics over a well-defined grid scope. */
  aggregate: (input: DataGridAggregateQuery) => DataGridAggregateResult;
  /** Reads through the local executor or a mounted complete-dataset adapter. */
  queryAsync: (
    input: DataGridQuery,
    options?: DataGridAnalysisExecutionOptions,
  ) => Promise<DataGridQueryResult>;
  /** Aggregates through the local executor or a mounted complete-dataset adapter. */
  aggregateAsync: (
    input: DataGridAggregateQuery,
    options?: DataGridAnalysisExecutionOptions,
  ) => Promise<DataGridAggregateResult>;
  /** Builds a detached preview without mutating the grid. */
  plan: (commands: DataGridCommand[]) => DataGridPlanResult;
  /** Revalidates commands and rejects a plan whose base revision is stale. */
  validatePlan: (plan: DataGridActionPlan) => DataGridPlanValidationResult;
  /** Applies a valid plan as one prevalidated transaction. */
  applyPlan: (plan: DataGridActionPlan) => DataGridApplyPlanResult;
  /** Reverts an applied transaction if its resulting grid revision is still current. */
  undo: (transactionId: string) => DataGridUndoResult;
  /** Validates the complete batch before applying any command. */
  dispatch: (commands: DataGridCommand[]) => DataGridCommandResult;
};
