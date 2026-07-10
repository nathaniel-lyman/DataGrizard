// src/components/DataGrid/AppliedFilters.tsx
// Presentational summary of active filters: one removable chip per active
// column filter, plus a chip for an active global search, plus Clear all.
// Domain-neutral; reads runtime GridFilter descriptors built by DataGrid.
import { isFilterActive, summarizeFilter, type GridFilter } from "./filters";

const chipClass = "dg-applied-filter";

export const AppliedFilters = ({
  filters,
  globalSearch,
  onClearGlobalSearch,
  onClearAll,
}: {
  filters: GridFilter[];
  globalSearch: string;
  onClearGlobalSearch: () => void;
  onClearAll: () => void;
}) => {
  const active = filters.filter(isFilterActive);
  const hasGlobal = globalSearch.trim().length > 0;
  if (active.length === 0 && !hasGlobal) return null;

  return (
    <div
      aria-label="Active filters"
      className="dg-applied-filters"
    >
      {hasGlobal ? (
        <span data-testid="applied-filter-search" className={chipClass}>
          <span className="dg-applied-filter-label" title={globalSearch}>
            Search: “{globalSearch}”
          </span>
          <button
            type="button"
            aria-label="Remove search filter"
            onClick={onClearGlobalSearch}
            className="dg-applied-filter-remove"
          >
            ✕
          </button>
        </span>
      ) : null}
      {active.map((filter) => (
        <span key={filter.id} data-testid={`applied-filter-${filter.id}`} className={chipClass}>
          <span
            className="dg-applied-filter-label"
            title={`${filter.label}: ${summarizeFilter(filter)}`}
          >
            {filter.label}: {summarizeFilter(filter)}
          </span>
          <button
            type="button"
            aria-label={`Remove ${filter.label} filter`}
            onClick={() => filter.onChange(undefined)}
            className="dg-applied-filter-remove"
          >
            ✕
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="dg-applied-filters-clear"
      >
        Clear all
      </button>
    </div>
  );
};
