import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon, ChevronUpIcon, CloseIcon, GripIcon, SearchIcon } from "./icons";
import { FiltersPopover, type GridFilter } from "./filters";

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
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [draggedColumnId, setDraggedColumnId] = useState<string | null>(null);
  const columnsRef = useRef<HTMLDivElement | null>(null);
  const columnsTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!columnsOpen) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      if (columnsRef.current && !columnsRef.current.contains(event.target as Node)) {
        setColumnsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setColumnsOpen(false);
        columnsTriggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [columnsOpen]);
  const visibleColumnCount = columns.filter((column) => column.visible).length;
  const groupedColumns = grouping
    .map((columnId) => groupableColumns.find((column) => column.id === columnId))
    .filter((column): column is { id: string; label: string } => Boolean(column));
  const availableGroupColumns = groupableColumns.filter(
    (column) => !grouping.includes(column.id),
  );
  const showColumnControls = enableColumnVisibility || enableColumnOrdering || enableColumnPinning;
  const showGroupingControls = enableGrouping && groupableColumns.length > 0;
  const showSecondaryControls = showColumnControls || enableSavedViews || showGroupingControls;
  const showFilterControls = enableGlobalSearch || filters.length > 0 || enableExport;
  const showPrimaryControls = showFilterControls || showSecondaryControls;

  if (!showPrimaryControls) {
    return null;
  }

  return (
    <div className="border-b border-slate-200 bg-white px-4 py-3">
      {showFilterControls ? (
        <div className="flex flex-wrap items-end gap-3">
          {enableGlobalSearch ? (
            <label className="flex min-w-72 flex-1 flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Search
              <div className="relative">
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                >
                  <SearchIcon className="h-3.5 w-3.5" />
                </span>
                <input
                  value={search}
                  onChange={(event) => onSearchChange(event.target.value)}
                  placeholder={searchPlaceholder}
                  className="h-8 w-full rounded-md border border-slate-300 bg-white pl-8 pr-8 text-xs font-medium normal-case tracking-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus-visible:border-slate-500 focus-visible:ring-2 focus-visible:ring-slate-300"
                />
                {search ? (
                  <button
                    type="button"
                    onClick={() => onSearchChange("")}
                    aria-label="Clear search"
                    className="absolute right-2 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded text-slate-400 transition hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                  >
                    <CloseIcon className="h-3 w-3" />
                  </button>
                ) : null}
              </div>
            </label>
          ) : null}

          {showFiltersPopover && filters.length > 0 ? <FiltersPopover filters={filters} /> : null}

          {filters.length > 0 ? (
            <button
              type="button"
              onClick={onClearFilters}
              className="h-8 rounded-md border border-slate-300 bg-slate-50 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
              Clear filters
            </button>
          ) : null}

          {enableExport ? (
            <button
              type="button"
              onClick={onExportCsv}
              className="ml-auto h-8 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
              Export CSV
            </button>
          ) : null}
        </div>
      ) : null}

      {showSecondaryControls ? (
        <div className={`${showFilterControls ? "mt-3 " : ""}flex flex-wrap items-end gap-3`}>
          <button
            type="button"
            onClick={onResetView}
            className="h-8 rounded-md border border-slate-300 bg-slate-50 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-200"
          >
            Reset view
          </button>
        </div>
      ) : null}

      {showSecondaryControls ? (
        <div className="mt-3 flex flex-wrap items-end gap-4 border-t border-slate-100 pt-3">
          {showGroupingControls ? (
            <div className="flex min-w-72 flex-1 flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Group by
              <div className="flex min-h-8 flex-wrap items-center gap-2 rounded-md border border-slate-300 bg-white px-2 py-1 normal-case tracking-normal">
                {groupedColumns.map((column, index) => (
                  <span
                    key={column.id}
                    className="inline-flex h-6 items-center gap-1 rounded border border-slate-200 bg-slate-50 pl-2 pr-1 text-xs font-medium text-slate-800"
                  >
                    {column.label}
                    <button
                      type="button"
                      onClick={() => onGroupingMove(column.id, "up")}
                      disabled={index === 0}
                      className="flex h-5 w-5 items-center justify-center rounded text-slate-500 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label={`Move ${column.label} earlier`}
                    >
                      <ChevronUpIcon className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onGroupingMove(column.id, "down")}
                      disabled={index === groupedColumns.length - 1}
                      className="flex h-5 w-5 items-center justify-center rounded text-slate-500 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label={`Move ${column.label} later`}
                    >
                      <ChevronDownIcon className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onGroupingRemove(column.id)}
                      className="flex h-5 w-5 items-center justify-center rounded text-slate-500 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                      aria-label={`Remove ${column.label} grouping`}
                    >
                      <CloseIcon className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <select
                  value=""
                  onChange={(event) => {
                    if (event.target.value) {
                      onGroupingAdd(event.target.value);
                    }
                  }}
                  disabled={availableGroupColumns.length === 0}
                  className="h-6 min-w-32 flex-1 border-0 bg-transparent px-1 text-xs font-medium text-slate-700 outline-none disabled:text-slate-400"
                  aria-label="Add grouping"
                >
                  <option value="">
                    {groupedColumns.length ? "Add level" : "No grouping"}
                  </option>
                  {availableGroupColumns.map((column) => (
                    <option key={column.id} value={column.id}>
                      {column.label}
                    </option>
                  ))}
                </select>
                {groupedColumns.length > 0 ? (
                  <button
                    type="button"
                    onClick={onClearGrouping}
                    className="h-6 rounded border border-slate-200 px-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {showColumnControls ? (
            <div
              ref={columnsRef}
              className="relative flex min-w-48 flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-slate-500"
            >
              Columns
              <button
                ref={columnsTriggerRef}
                type="button"
                onClick={() => setColumnsOpen((isOpen) => !isOpen)}
                className="flex h-8 items-center justify-between gap-3 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium normal-case tracking-normal text-slate-800 outline-none transition hover:bg-slate-50 focus-visible:border-slate-500 focus-visible:ring-2 focus-visible:ring-slate-300"
                aria-expanded={columnsOpen}
                aria-haspopup="dialog"
              >
                <span>{visibleColumnCount} visible</span>
                <span aria-hidden="true" className="text-slate-400">
                  {columnsOpen ? (
                    <ChevronUpIcon className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDownIcon className="h-3.5 w-3.5" />
                  )}
                </span>
              </button>

              {columnsOpen ? (
                <div
                  className="absolute left-0 top-full z-20 mt-1 w-72 rounded-md border border-slate-200 bg-white p-2 shadow-lg"
                  aria-label="Column settings"
                >
                  <div className="max-h-72 overflow-auto">
                    {columns.map((column, index) => (
                      <div
                        key={column.id}
                        draggable={enableColumnOrdering}
                        onDragStart={() => setDraggedColumnId(column.id)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => {
                          if (
                            enableColumnOrdering &&
                            draggedColumnId &&
                            draggedColumnId !== column.id
                          ) {
                            onColumnDrop(draggedColumnId, column.id);
                          }
                          setDraggedColumnId(null);
                        }}
                        onDragEnd={() => setDraggedColumnId(null)}
                        className="flex h-8 items-center gap-2 rounded px-2 text-xs font-medium normal-case tracking-normal text-slate-800 hover:bg-slate-50"
                      >
                        {enableColumnOrdering ? (
                          <span
                            className="cursor-grab select-none text-slate-400 active:cursor-grabbing"
                            aria-hidden="true"
                          >
                            <GripIcon className="h-3.5 w-3.5" />
                          </span>
                        ) : null}
                        {enableColumnVisibility ? (
                          <input
                            type="checkbox"
                            checked={column.visible}
                            disabled={!column.canHide}
                            aria-label={`Toggle ${column.label} column`}
                            onChange={(event) =>
                              onColumnVisibilityChange(column.id, event.target.checked)
                            }
                            className="h-3.5 w-3.5 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                          />
                        ) : null}
                        <span className="min-w-0 flex-1 truncate">{column.label}</span>
                        {enableColumnPinning && column.canPin ? (
                          <span className="flex shrink-0 overflow-hidden rounded border border-slate-200">
                            <button
                              type="button"
                              onClick={() => onColumnPin(column.id, "left")}
                              disabled={column.pinned === "left"}
                              className="flex h-6 w-6 items-center justify-center text-[10px] font-bold text-slate-500 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:bg-slate-900 disabled:text-white"
                              aria-label={`Pin ${column.label} left`}
                              title="Pin left"
                            >
                              L
                            </button>
                            <button
                              type="button"
                              onClick={() => onColumnPin(column.id, false)}
                              disabled={!column.pinned}
                              className="flex h-6 w-6 items-center justify-center border-l border-slate-200 text-slate-500 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-30"
                              aria-label={`Unpin ${column.label}`}
                              title="Unpin"
                            >
                              <CloseIcon className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onColumnPin(column.id, "right")}
                              disabled={column.pinned === "right"}
                              className="flex h-6 w-6 items-center justify-center border-l border-slate-200 text-[10px] font-bold text-slate-500 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:bg-slate-900 disabled:text-white"
                              aria-label={`Pin ${column.label} right`}
                              title="Pin right"
                            >
                              R
                            </button>
                          </span>
                        ) : null}
                        {enableColumnOrdering ? (
                          <>
                            <button
                              type="button"
                              onClick={() => onColumnMove(column.id, "up")}
                              disabled={index === 0}
                              className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 text-slate-500 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-30"
                              aria-label={`Move ${column.label} left`}
                            >
                              <ChevronUpIcon className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onColumnMove(column.id, "down")}
                              disabled={index === columns.length - 1}
                              className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 text-slate-500 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-30"
                              aria-label={`Move ${column.label} right`}
                            >
                              <ChevronDownIcon className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={onResetColumns}
                    className="mt-2 h-8 w-full rounded-md border border-slate-300 bg-slate-50 px-3 text-xs font-semibold normal-case tracking-normal text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  >
                    Reset columns
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {enableSavedViews ? (
            <div className="flex min-w-[360px] flex-wrap items-end gap-2">
              <label className="flex min-w-40 flex-1 flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                View name
                <input
                  value={activeViewName}
                  onChange={(event) => onActiveViewNameChange(event.target.value)}
                  placeholder={viewNamePlaceholder}
                  className="h-8 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium normal-case tracking-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </label>
              <button
                type="button"
                onClick={onSaveView}
                className="h-8 rounded-md border border-slate-900 bg-slate-900 px-3 text-xs font-semibold text-white transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-200"
              >
                Save view
              </button>
              <select
                value=""
                onChange={(event) => {
                  if (event.target.value) {
                    onApplyView(event.target.value);
                  }
                }}
                className="h-8 min-w-36 rounded-md border border-slate-300 bg-white px-2 text-xs font-medium text-slate-800 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                aria-label="Apply saved view"
              >
                <option value="">Saved views</option>
                {savedViews.map((view) => (
                  <option key={view} value={view}>
                    {view}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => onDeleteView(activeViewName)}
                className="h-8 rounded-md border border-slate-300 bg-slate-50 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-200"
              >
                Delete
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
