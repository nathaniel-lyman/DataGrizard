import { FiltersPopover, type GridFilter } from "./filters";
import { ToolbarAdvancedControls } from "./ToolbarAdvancedControls";
import { ToolbarColumns } from "./ToolbarColumns";
import { ToolbarGrouping } from "./ToolbarGrouping";
import { ToolbarSavedViews } from "./ToolbarSavedViews";
import { ToolbarSearch } from "./ToolbarSearch";

type ToolbarProps = {
  search: string;
  searchPlaceholder: string;
  filters: GridFilter[];
  /** Pivot mode: render a consolidated Filters popover (grid mode filters live in headers). */
  showFiltersPopover: boolean;
  enableExport: boolean;
  onExportCsv: () => void;
  enableGlobalSearch: boolean;
  enableColumnVisibility: boolean;
  enableColumnOrdering: boolean;
  enableColumnPinning: boolean;
  enableSavedViews: boolean;
  enableGrouping: boolean;
  enableCollapsibleControls: boolean;
  columns: Array<{
    id: string;
    label: string;
    visible: boolean;
    canHide: boolean;
    pinned: false | "left" | "right";
    canPin: boolean;
  }>;
  groupableColumns: Array<{ id: string; label: string }>;
  grouping: string[];
  savedViews: string[];
  activeViewName: string;
  viewNamePlaceholder: string;
  onSearchChange: (value: string) => void;
  onColumnVisibilityChange: (columnId: string, visible: boolean) => void;
  onColumnMove: (columnId: string, direction: "up" | "down") => void;
  onColumnDrop: (fromColumnId: string, toColumnId: string) => void;
  onColumnPin: (columnId: string, position: false | "left" | "right") => void;
  onGroupingAdd: (columnId: string) => void;
  onGroupingRemove: (columnId: string) => void;
  onGroupingMove: (columnId: string, direction: "up" | "down") => void;
  onClearGrouping: () => void;
  onClearFilters: () => void;
  onResetColumns: () => void;
  onResetView: () => void;
  onSaveView: () => void;
  onApplyView: (name: string) => void;
  onDeleteView: (name: string) => void;
  onActiveViewNameChange: (name: string) => void;
};

export function Toolbar({
  search,
  searchPlaceholder,
  filters,
  showFiltersPopover,
  enableExport,
  onExportCsv,
  enableGlobalSearch,
  enableColumnVisibility,
  enableColumnOrdering,
  enableColumnPinning,
  enableSavedViews,
  enableGrouping,
  enableCollapsibleControls,
  columns,
  groupableColumns,
  grouping,
  savedViews,
  activeViewName,
  viewNamePlaceholder,
  onSearchChange,
  onColumnVisibilityChange,
  onColumnMove,
  onColumnDrop,
  onColumnPin,
  onGroupingAdd,
  onGroupingRemove,
  onGroupingMove,
  onClearGrouping,
  onClearFilters,
  onResetColumns,
  onResetView,
  onSaveView,
  onApplyView,
  onDeleteView,
  onActiveViewNameChange,
}: ToolbarProps) {
  const showColumnControls = enableColumnVisibility || enableColumnOrdering || enableColumnPinning;
  const showGroupingControls = enableGrouping && groupableColumns.length > 0;
  const showSecondaryControls = showColumnControls || enableSavedViews || showGroupingControls;
  const showFilterControls = enableGlobalSearch || filters.length > 0 || enableExport;
  const showPrimaryControls = showFilterControls || showSecondaryControls;

  if (!showPrimaryControls) {
    return null;
  }

  return (
    <div className="dg-toolbar">
      {showFilterControls ? (
        <div className="dg-toolbar-row">
          {enableGlobalSearch ? (
            <ToolbarSearch
              search={search}
              searchPlaceholder={searchPlaceholder}
              onSearchChange={onSearchChange}
            />
          ) : null}

          {showFiltersPopover && filters.length > 0 ? <FiltersPopover filters={filters} /> : null}

          {filters.length > 0 ? (
            <button
              type="button"
              onClick={onClearFilters}
              className="dg-btn dg-btn--secondary"
            >
              Clear filters
            </button>
          ) : null}

          {enableExport ? (
            <button
              type="button"
              onClick={onExportCsv}
              className="dg-btn dg-btn--surface dg-toolbar-export"
            >
              Export CSV
            </button>
          ) : null}
        </div>
      ) : null}

      {showSecondaryControls ? (
        enableCollapsibleControls ? (
          <ToolbarAdvancedControls
            columnCount={columns.filter((column) => column.visible).length}
            groupingCount={grouping.length}
            savedViewCount={savedViews.length}
            onResetView={onResetView}
          >
            {showGroupingControls ? (
              <ToolbarGrouping
                groupableColumns={groupableColumns}
                grouping={grouping}
                onGroupingAdd={onGroupingAdd}
                onGroupingRemove={onGroupingRemove}
                onGroupingMove={onGroupingMove}
                onClearGrouping={onClearGrouping}
              />
            ) : null}

            {showColumnControls ? (
              <ToolbarColumns
                columns={columns}
                enableColumnVisibility={enableColumnVisibility}
                enableColumnOrdering={enableColumnOrdering}
                enableColumnPinning={enableColumnPinning}
                onColumnVisibilityChange={onColumnVisibilityChange}
                onColumnMove={onColumnMove}
                onColumnDrop={onColumnDrop}
                onColumnPin={onColumnPin}
                onResetColumns={onResetColumns}
              />
            ) : null}

            {enableSavedViews ? (
              <ToolbarSavedViews
                savedViews={savedViews}
                activeViewName={activeViewName}
                viewNamePlaceholder={viewNamePlaceholder}
                onSaveView={onSaveView}
                onApplyView={onApplyView}
                onDeleteView={onDeleteView}
                onActiveViewNameChange={onActiveViewNameChange}
              />
            ) : null}
          </ToolbarAdvancedControls>
        ) : (
          <>
            <div className={`dg-toolbar-row ${showFilterControls ? "dg-toolbar-row--spaced" : ""}`}>
              <button
                type="button"
                onClick={onResetView}
                className="dg-btn dg-btn--secondary"
              >
                Reset view
              </button>
            </div>
            <div className="dg-toolbar-row dg-toolbar-row--secondary">
              {showGroupingControls ? (
                <ToolbarGrouping
                  groupableColumns={groupableColumns}
                  grouping={grouping}
                  onGroupingAdd={onGroupingAdd}
                  onGroupingRemove={onGroupingRemove}
                  onGroupingMove={onGroupingMove}
                  onClearGrouping={onClearGrouping}
                />
              ) : null}

              {showColumnControls ? (
                <ToolbarColumns
                  columns={columns}
                  enableColumnVisibility={enableColumnVisibility}
                  enableColumnOrdering={enableColumnOrdering}
                  enableColumnPinning={enableColumnPinning}
                  onColumnVisibilityChange={onColumnVisibilityChange}
                  onColumnMove={onColumnMove}
                  onColumnDrop={onColumnDrop}
                  onColumnPin={onColumnPin}
                  onResetColumns={onResetColumns}
                />
              ) : null}

              {enableSavedViews ? (
                <ToolbarSavedViews
                  savedViews={savedViews}
                  activeViewName={activeViewName}
                  viewNamePlaceholder={viewNamePlaceholder}
                  onSaveView={onSaveView}
                  onApplyView={onApplyView}
                  onDeleteView={onDeleteView}
                  onActiveViewNameChange={onActiveViewNameChange}
                />
              ) : null}
            </div>
          </>
        )
      ) : null}
    </div>
  );
}
