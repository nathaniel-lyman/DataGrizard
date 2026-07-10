import type { ReactNode } from "react";
import type {
  ColumnFiltersState,
  ColumnOrderState,
  ColumnPinningState,
  ColumnSizingState,
  ExpandedState,
  GroupingState,
  PaginationState,
  Row,
  RowSelectionState,
  SortingState,
  VisibilityState,
} from "@tanstack/react-table";
import type {
  DataGridCardView,
  GridColumnConfig,
  GridFilterConfig,
} from "../../types/grid";
import type { DataGridColumnGroup } from "./columnGroups";
import type { DataGridRowActions } from "./RowActionsMenu";
import type { DataGridPivotConfig, DataGridPivotState } from "./pivot";

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
  /** Master toggle for per-column header filters (auto-provisioned by dataType). */
  headerFilters: boolean;
  /** When false, only columns named in `filters` are filterable (legacy opt-in). */
  autoColumnFilters: boolean;
  /** Show the applied-filter chip bar. */
  filterSummary: boolean;
  /** Enable inline cell editing (inert until a column sets `editable`). */
  editing: boolean;
  /** Enable rectangular cell selection for spreadsheet-style copy/paste. */
  cellSelection: boolean;
  /**
   * Drag a handle from the corner of the current cell selection (or the
   * focused cell) to replicate its value(s) into adjacent cells, plus the
   * Ctrl+D (fill down) / Ctrl+R (fill right) keyboard equivalents.
   */
  fillHandle: boolean;
  /** Show the toolbar Export CSV button. */
  export: boolean;
  /** Enable Ctrl/Cmd-C copy and Ctrl/Cmd-V paste for grid cells as TSV. */
  clipboard: boolean;
  /** Show the per-column header menu for sort/filter/hide/pin/width actions. */
  headerMenu: boolean;
  /** Collapse header tools until the header is hovered, focused, active, or open. */
  headerToolsOnDemand: boolean;
  /** Show a per-row actions menu when `rowActions` is supplied. */
  rowActions: boolean;
  /** Collapse grouping, column, and saved-view controls behind a toolbar disclosure. */
  collapsibleToolbar: boolean;
  /** Enable the responsive card layout in grid mode. */
  cardLayout: boolean;
};

export type DataGridSummaryScope = "filtered" | "selected" | "group";
export type DataGridSummarySelectionMode = "auto" | Exclude<DataGridSummaryScope, "group">;
export type DataGridGroupingState = GroupingState;
export type DataGridExpandedState = ExpandedState;
export type DataGridColumnPinningState = ColumnPinningState;
export type DataGridLayoutMode = "grid" | "pivot";
export type DataGridDataMode = "client" | "server";
export type DataGridGroupSummaryDisplay = "inline" | "columns";
export type DataGridDensity = "compact" | "standard" | "comfortable";
export type DataGridFocusedCell = { rowId: string; columnId: string } | null;

export type DataGridCellEdit<TData extends object> = {
  rowId: string;
  row: TData;
  columnId: string;
  value: unknown;
  previousValue: unknown;
};

export type DataGridCellEditBatchSource = "paste" | "fill";

export type DataGridCellEditBatch<TData extends object> = {
  source: DataGridCellEditBatchSource;
  edits: DataGridCellEdit<TData>[];
  /** Cells omitted because they were outside the grid, read-only, unparseable, or invalid. */
  skippedCellCount: number;
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

export type DataGridDataSourceRequest = {
  sorting: SortingState;
  globalFilter: string;
  columnFilters: ColumnFiltersState;
  pagination: PaginationState;
  signal: AbortSignal;
  requestId: number;
};

export type DataGridDataSourceResult<TData extends object> = {
  rows: TData[];
  rowCount?: number;
};

export type DataGridDataSource<TData extends object> = (
  request: DataGridDataSourceRequest,
) => DataGridDataSourceResult<TData> | Promise<DataGridDataSourceResult<TData>>;

export type DataGridProps<TData extends object> = {
  /** Client rows, or initial rows shown until `dataSource` resolves. */
  data?: TData[];
  columns: GridColumnConfig<TData>[];
  /** Convenience server adapter layered over the controlled server API. */
  dataSource?: DataGridDataSource<TData>;
  layoutMode?: DataGridLayoutMode;
  dataMode?: DataGridDataMode;
  rowCount?: number;
  /** Grid-mode header bands. Ignored in pivot mode. */
  columnGroups?: DataGridColumnGroup[];
  pivot?: DataGridPivotConfig<TData>;
  /** Card-mode configuration; inert unless `features.cardLayout` is on. */
  cardView?: DataGridCardView<TData>;
  filters?: GridFilterConfig<TData>[];
  /** Text columns with <= this many distinct values auto-facet into multiSelect. Default 12. */
  facetThreshold?: number;
  summaryItems?: DataGridSummaryItem<TData>[];
  groupSummaryItems?: DataGridSummaryItem<TData>[];
  groupSummaryDisplay?: DataGridGroupSummaryDisplay;
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
  density?: DataGridDensity;
  headerWrap?: boolean;
  searchPlaceholder?: string;
  viewNamePlaceholder?: string;
  pageSizeOptions?: number[];
  /** Window the rows for large datasets (opt-in). Best with pagination off. */
  virtualizeRows?: boolean;
  /** Estimated row height in px used to seed the virtualizer. */
  estimatedRowHeight?: number;
  renderDetailPanel?: (row: TData | null, controls: { close: () => void }) => ReactNode;
  rowActions?: DataGridRowActions<TData>;
  getRowId?: (row: TData, index: number, parent?: Row<TData>) => string;
  getRowLabel?: (row: TData) => string;
  getRowClassName?: (row: TData) => string;
  onRowClick?: (row: TData) => void;
  onActiveRowChange?: (row: TData | null) => void;
  onFocusedCellChange?: (cell: DataGridFocusedCell) => void;
  onCellEdit?: (edit: DataGridCellEdit<TData>) => void;
  onCellEditBatch?: (batch: DataGridCellEditBatch<TData>) => void;
  getExportFileName?: (context: { rowCount: number; selectedCount: number }) => string;
  renderDataSourceError?: (error: unknown) => ReactNode;
  onDataSourceError?: (error: unknown) => void;
};

export type { DataGridColumnGroup } from "./columnGroups";
