// src/components/DataGrid/AppliedFilters.tsx
// Presentational summary of active filters: one removable chip per active
// column filter, plus a chip for an active global search, plus Clear all.
// Domain-neutral; reads runtime GridFilter descriptors built by DataGrid.
import { isFilterActive, summarizeFilter, type GridFilter } from "./filters";

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
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
      {hasGlobal ? (
        <span
          data-testid="applied-filter-search"
          className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700"
        >
          <span className="truncate">Search: “{globalSearch}”</span>
          <button
            type="button"
            aria-label="Remove search filter"
            onClick={onClearGlobalSearch}
            className="text-slate-400 hover:text-slate-700"
          >
            ✕
          </button>
        </span>
      ) : null}
      {active.map((filter) => (
        <span
          key={filter.id}
          data-testid={`applied-filter-${filter.id}`}
          className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700"
        >
          <span className="truncate">
            {filter.label}: {summarizeFilter(filter)}
          </span>
          <button
            type="button"
            aria-label={`Remove ${filter.label} filter`}
            onClick={() => filter.onChange(undefined)}
            className="text-slate-400 hover:text-slate-700"
          >
            ✕
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="ml-1 text-xs font-medium text-slate-500 underline underline-offset-2 hover:text-slate-900"
      >
        Clear all
      </button>
    </div>
  );
};
