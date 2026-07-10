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

const chipClass = (active: boolean) =>
  `dg-compact-chip ${active ? "dg-compact-chip--active" : ""}`;

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
    <div className="dg-toolbar dg-toolbar--compact">
      {enableGlobalSearch ? (
        <ToolbarSearch
          search={search}
          searchPlaceholder={searchPlaceholder}
          onSearchChange={onSearchChange}
        />
      ) : null}

      {showSortChip || showFiltersChip ? (
        <div className={`dg-compact-chips ${enableGlobalSearch ? "dg-compact-chips--spaced" : ""}`}>
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
        <div className="dg-compact-list">
          {sortColumns.map((column) => (
            <button
              key={column.id}
              type="button"
              onClick={() => onSortColumn(column.id)}
              className="dg-compact-list-item"
            >
              <span className={column.direction ? "dg-compact-list-label--active" : undefined}>{column.label}</span>
              <span aria-hidden="true" className="dg-compact-direction">
                {directionMarker(column.direction)}
              </span>
            </button>
          ))}
          {activeSort ? (
            <button
              type="button"
              onClick={onClearSort}
              className="dg-btn dg-btn--secondary dg-btn--touch dg-compact-clear-sort"
            >
              Clear sort
            </button>
          ) : null}
        </div>
      </BottomSheet>

      <BottomSheet open={openSheet === "filters"} label="Filters" onClose={() => setOpenSheet(null)}>
        <div className="dg-compact-filters">
          {filters.map((filter) => (
            // FilterBody renders its own label header + per-filter Clear, so no
            // extra label chrome here. No-op onClose: applying one filter must
            // not dismiss the sheet — the Done button closes it.
            <div key={filter.id}>
              <FilterBody filter={filter} onClose={() => {}} />
            </div>
          ))}
          <div className="dg-compact-actions">
            <button
              type="button"
              onClick={onClearFilters}
              className="dg-btn dg-btn--secondary dg-btn--touch dg-btn--grow"
            >
              Clear all filters
            </button>
            <button
              type="button"
              onClick={() => setOpenSheet(null)}
              className="dg-btn dg-btn--primary dg-btn--touch dg-btn--grow"
            >
              Done
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
