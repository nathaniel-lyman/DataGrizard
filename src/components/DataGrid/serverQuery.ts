import type {
  ColumnFiltersState,
  PaginationState,
  SortingState,
} from "@tanstack/react-table";
import type {
  GridColumnConfig,
  GridFilterConfig,
  GridFilterOperator,
  GridFilterType,
} from "../../types/grid";
import { isFilterValueActive, resolveFilterClause } from "./filterMatch";

/**
 * Dialect-neutral translation of a grid query (the `dataSource` request slices)
 * into a backend-agnostic query spec, derived from the SAME `GridColumnConfig` /
 * `GridFilterConfig` the consumer already passes to <DataGrid>.
 *
 * It emits NO SQL — only a parameterizable intermediate representation: filter
 * clauses (column + resolved operator + value), sort, search, and page. A
 * consumer renders that spec into their dialect (BigQuery, Postgres, an ORM, a
 * REST query string). This is the genuinely-reusable, backend-neutral half of
 * server-data integration; SQL generation and transport stay consumer-side.
 *
 * Two properties make it safe to render downstream:
 *  - Identifiers (columns) come ONLY from the column config — request `id`s that
 *    aren't known columns are dropped, so attacker-controlled ids can't reach a
 *    query.
 *  - Operators are resolved through the grid's own `resolveFilterClause`, so a
 *    server path built on this spec stays in lockstep with `matchesFilterValue`.
 */

export type QuerySortClause = { column: string; direction: "asc" | "desc" };

export type QueryFilterClause = {
  column: string;
  filterType: GridFilterType;
  operator: GridFilterOperator;
  value: unknown;
};

export type QuerySearchClause = { term: string; columns: string[] };

export type QuerySpec = {
  filters: QueryFilterClause[];
  search: QuerySearchClause | null;
  sort: QuerySortClause[];
  page: { limit: number; offset: number };
};

/** The request slices the spec needs (a subset of DataGridDataSourceRequest). */
export type QueryRequestSlices = {
  sorting: ReadonlyArray<SortingState[number]>;
  columnFilters: ReadonlyArray<ColumnFiltersState[number]>;
  globalFilter: string;
  pagination: Readonly<PaginationState>;
};

export type RequestToQuerySpecOptions<TData> = {
  /** The same columns passed to <DataGrid>; defines the identifier whitelist. */
  columns: GridColumnConfig<TData>[];
  /** The same filters passed to <DataGrid>; supplies filter types/operators. */
  filters?: GridFilterConfig<TData>[];
  /**
   * Columns global search scans. Defaults to the text/status columns — the
   * string-like fields a contains-search is meaningful against.
   */
  searchColumns?: string[];
};

const SEARCHABLE_DATA_TYPES = new Set<string>(["text", "status"]);

export function requestToQuerySpec<TData>(
  request: QueryRequestSlices,
  options: RequestToQuerySpecOptions<TData>,
): QuerySpec {
  const known = new Set(options.columns.map((column) => column.accessorKey as string));

  const filterTypeById = new Map<string, GridFilterType>();
  const operatorById = new Map<string, GridFilterOperator | undefined>();
  for (const filter of options.filters ?? []) {
    const key = filter.accessorKey as string;
    filterTypeById.set(key, filter.filterType ?? "select");
    operatorById.set(key, filter.operator);
  }

  const filters: QueryFilterClause[] = [];
  for (const columnFilter of request.columnFilters) {
    if (!known.has(columnFilter.id)) continue; // identifier whitelist
    const filterType = filterTypeById.get(columnFilter.id) ?? "select";
    const operator = operatorById.get(columnFilter.id);
    if (!isFilterValueActive(columnFilter.value, { filterType, operator })) continue;
    const resolved = resolveFilterClause(columnFilter.value, { filterType, operator });
    filters.push({
      column: columnFilter.id,
      filterType,
      operator: resolved.operator,
      value: resolved.value,
    });
  }

  const sort: QuerySortClause[] = [];
  for (const entry of request.sorting) {
    if (!known.has(entry.id)) continue;
    sort.push({ column: entry.id, direction: entry.desc ? "desc" : "asc" });
  }

  const term = request.globalFilter.trim();
  const searchColumns =
    options.searchColumns ??
    options.columns
      .filter((column) => SEARCHABLE_DATA_TYPES.has(column.dataType))
      .map((column) => column.accessorKey as string);
  const search = term ? { term, columns: searchColumns } : null;

  const { pageIndex, pageSize } = request.pagination;
  return {
    filters,
    search,
    sort,
    page: { limit: pageSize, offset: pageIndex * pageSize },
  };
}
