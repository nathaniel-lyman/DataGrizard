import type {
  ColumnFiltersState,
  PaginationState,
  SortingState,
} from "@tanstack/react-table";
import type {
  GridColumnConfig,
  GridDataType,
  GridFilterConfig,
  GridFilterOperator,
  GridFilterType,
} from "../../types/grid";
import { isFilterValueActive, resolveFilterClause } from "./filterMatch";
import { resolveFilterType } from "./filterDefaults";
import type {
  DataGridAnalysisFilterSnapshot,
  DataGridSourceColumnSnapshot,
} from "./dataGridApi";
import type { DataGridServerAnalysisScope } from "./dataGridAnalysisContract";

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

export type DataGridAnalysisQuerySpec = {
  filters: QueryFilterClause[];
  search: QuerySearchClause | null;
  orderBy: QuerySortClause[];
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
  const dataTypeById = new Map<string, GridDataType>(
    options.columns.map((column) => [column.accessorKey as string, column.dataType]),
  );

  const overrideById = new Map<string, GridFilterConfig<TData>>();
  for (const filter of options.filters ?? []) {
    overrideById.set(filter.accessorKey as string, filter);
  }

  // Resolve each column's filter type the SAME way the grid does in server mode:
  // an explicit `filters` override wins, otherwise infer from the column's
  // dataType (isServerMode so text never auto-facets from a single page). This
  // keeps the server query path in lockstep with the grid's auto-provisioned
  // filters — without it, a column the consumer didn't list in `filters` (or
  // listed without a filterType) would fall back to exact "select" match and
  // desync from what the grid emits.
  const filterTypeFor = (id: string): GridFilterType => {
    const override = overrideById.get(id);
    if (override?.filterType) return override.filterType;
    const dataType = dataTypeById.get(id);
    if (!dataType) return "select";
    return resolveFilterType({
      dataType,
      hasStaticOptions: Boolean(override?.options?.length),
      isServerMode: true,
    });
  };

  const filters: QueryFilterClause[] = [];
  for (const columnFilter of request.columnFilters) {
    if (!known.has(columnFilter.id)) continue; // identifier whitelist
    const filterType = filterTypeFor(columnFilter.id);
    const operator = overrideById.get(columnFilter.id)?.operator;
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

/**
 * Builds the detached predicate sent to a complete-dataset analysis adapter.
 * Analysis intentionally does not inherit view sorting: adapters provide a
 * deterministic backend order when an offset query has an empty `orderBy`.
 */
export function buildDataGridAnalysisQuerySpec(
  scope: DataGridServerAnalysisScope,
  filtersSnapshot: DataGridAnalysisFilterSnapshot,
  columns: readonly DataGridSourceColumnSnapshot[],
): DataGridAnalysisQuerySpec {
  if (scope === "all") {
    return { filters: [], search: null, orderBy: [] };
  }

  const columnById = new Map(columns.map((column) => [column.id, column]));
  const filters: QueryFilterClause[] = [];
  for (const columnFilter of filtersSnapshot.columnFilters) {
    const column = columnById.get(columnFilter.id);
    if (!column?.filter) continue;
    const filterType = column.filter.type;
    if (!isFilterValueActive(columnFilter.value, { filterType })) continue;
    const resolved = resolveFilterClause(columnFilter.value, { filterType });
    filters.push({
      column: column.id,
      filterType,
      operator: resolved.operator,
      value: resolved.value,
    });
  }

  const term = filtersSnapshot.globalFilter.trim();
  const searchColumns = columns
    .filter((column) => SEARCHABLE_DATA_TYPES.has(column.dataType))
    .map((column) => column.id);

  return {
    filters,
    search: term ? { term, columns: searchColumns } : null,
    orderBy: [],
  };
}
