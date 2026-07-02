import { useState } from "react";
import { BottomSheet } from "./BottomSheet";
import { FilterBody } from "./filterBodies";
import { isFilterActive, type GridFilter } from "./filters";
import { ToolbarSearch } from "./ToolbarSearch";

export type CompactSortColumn = {
  id: string;
  label: string;
  direction: false | "asc" | "desc";
};

// Card-mode toolbar: search + two chips opening bottom sheets. A presentation
// swap over the same state slices the desktop chrome writes — the sort sheet
// emits `sorting`, the filter bodies emit `columnFilters` via GridFilter.onChange.
type ToolbarCompactProps = {
  search: string;
  searchPlaceholder: string;
  enableGlobalSearch: boolean;
  onSearchChange: (value: string) => void;
  enableSorting: boolean;
  sortColumns: CompactSortColumn[];
  onSortColumn: (columnId: string) => void;
  onClearSort: () => void;
  filters: GridFilter[];
  onClearFilters: () => void;
};

// h-11 = 44px: spec §4 mandates ≥44px touch targets for all new card-mode UI.
const chipClass = (active: boolean) =>
  `h-11 rounded-full border px-4 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 ${
    active
      ? "border-slate-900 bg-slate-900 text-white"
      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
  }`;

const directionMarker = (direction: false | "asc" | "desc") =>
  direction === "asc" ? "↑" : direction === "desc" ? "↓" : "";

export function ToolbarCompact({
  search,
  searchPlaceholder,
  enableGlobalSearch,
  onSearchChange,
  enableSorting,
  sortColumns,
  onSortColumn,
  onClearSort,
  filters,
  onClearFilters,
}: ToolbarCompactProps) {
  const [openSheet, setOpenSheet] = useState<null | "sort" | "filters">(null);
  const activeSort = sortColumns.find((column) => column.direction !== false);
  const activeFilterCount = filters.filter(isFilterActive).length;
  const showSortChip = enableSorting && sortColumns.length > 0;
  const showFiltersChip = filters.length > 0;

  if (!enableGlobalSearch && !showSortChip && !showFiltersChip) {
    return null;
  }

  return (
    <div className="border-b border-slate-200 bg-white px-3 py-3">
      {enableGlobalSearch ? (
        <ToolbarSearch
          search={search}
          searchPlaceholder={searchPlaceholder}
          onSearchChange={onSearchChange}
        />
      ) : null}

      {showSortChip || showFiltersChip ? (
        <div className={`${enableGlobalSearch ? "mt-2 " : ""}flex flex-wrap items-center gap-2`}>
          {showSortChip ? (
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => setOpenSheet("sort")}
              className={chipClass(Boolean(activeSort))}
            >
              {activeSort ? (
                <>
                  {`Sort: ${activeSort.label}`}{" "}
                  <span aria-hidden="true">{directionMarker(activeSort.direction)}</span>
                </>
              ) : (
                "Sort"
              )}
            </button>
          ) : null}
          {showFiltersChip ? (
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => setOpenSheet("filters")}
              className={chipClass(activeFilterCount > 0)}
            >
              {activeFilterCount > 0 ? `Filters (${activeFilterCount})` : "Filters"}
            </button>
          ) : null}
        </div>
      ) : null}

      <BottomSheet open={openSheet === "sort"} label="Sort by" onClose={() => setOpenSheet(null)}>
        <div className="flex flex-col">
          {sortColumns.map((column) => (
            <button
              key={column.id}
              type="button"
              onClick={() => onSortColumn(column.id)}
              className="flex min-h-11 items-center justify-between border-b border-slate-100 px-1 text-left text-sm text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
            >
              <span className={column.direction ? "font-semibold" : undefined}>{column.label}</span>
              <span aria-hidden="true" className="text-slate-500">
                {directionMarker(column.direction)}
              </span>
            </button>
          ))}
          {activeSort ? (
            <button
              type="button"
              onClick={onClearSort}
              className="mt-3 h-11 rounded-md border border-slate-300 bg-slate-50 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
            >
              Clear sort
            </button>
          ) : null}
        </div>
      </BottomSheet>

      <BottomSheet open={openSheet === "filters"} label="Filters" onClose={() => setOpenSheet(null)}>
        <div className="flex flex-col gap-4">
          {filters.map((filter) => (
            // FilterBody renders its own label header + per-filter Clear, so no
            // extra label chrome here. No-op onClose: applying one filter must
            // not dismiss the sheet — the Done button closes it.
            <div key={filter.id}>
              <FilterBody filter={filter} onClose={() => {}} />
            </div>
          ))}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClearFilters}
              className="h-11 flex-1 rounded-md border border-slate-300 bg-slate-50 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
            >
              Clear all filters
            </button>
            <button
              type="button"
              onClick={() => setOpenSheet(null)}
              className="h-11 flex-1 rounded-md bg-slate-900 text-xs font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              Done
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
