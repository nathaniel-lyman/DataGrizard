import type {
  ColumnFiltersState,
  PaginationState,
  SortingState,
} from "@tanstack/react-table";
import { matchesFilterValue } from "../components/DataGrid/filterMatch";
import { mockRetailData, retailFilters, type RetailItem } from "./mockRetailData";

// Accept readonly inputs so callers can pass `as const` query literals (the
// demo/tests do); the engine only reads these slices, copying when it sorts.
export type RetailQuery = {
  sorting: ReadonlyArray<SortingState[number]>;
  columnFilters: ReadonlyArray<ColumnFiltersState[number]>;
  globalFilter: string;
  pagination: Readonly<PaginationState>;
};

export type RetailQueryResult = {
  rows: RetailItem[];
  rowCount: number;
};

const LATENCY_MS = 300;

// Mutable in-memory store (a copy) so applyEdit persists across queries.
const store: RetailItem[] = mockRetailData.map((row) => ({ ...row }));

const filterTypeById = new Map(
  retailFilters.map((filter) => [
    filter.accessorKey as string,
    filter.filterType ?? "select",
  ]),
);

const SEARCH_FIELDS: (keyof RetailItem)[] = [
  "item_id",
  "item_name",
  "department",
  "category",
  "brand",
  "recommendation_status",
];

const compare = (a: unknown, b: unknown): number => {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
};

const applySort = (
  rows: RetailItem[],
  sorting: RetailQuery["sorting"],
): RetailItem[] => {
  if (sorting.length === 0) return rows;
  return [...rows].sort((rowA, rowB) => {
    for (const sort of sorting) {
      const result = compare(
        rowA[sort.id as keyof RetailItem],
        rowB[sort.id as keyof RetailItem],
      );
      if (result !== 0) return sort.desc ? -result : result;
    }
    return 0;
  });
};

const applyColumnFilters = (
  rows: RetailItem[],
  columnFilters: RetailQuery["columnFilters"],
): RetailItem[] =>
  rows.filter((row) =>
    columnFilters.every((filter) => {
      const raw = row[filter.id as keyof RetailItem];
      return matchesFilterValue(raw, filter.value, {
        filterType: filterTypeById.get(filter.id),
        searchText: String(raw ?? ""),
      });
    }),
  );

const applyGlobalFilter = (rows: RetailItem[], globalFilter: string): RetailItem[] => {
  const needle = globalFilter.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) =>
    SEARCH_FIELDS.some((field) =>
      String(row[field] ?? "").toLowerCase().includes(needle),
    ),
  );
};

/** Simulated server query: filters/searches/sorts/paginates the in-memory store. */
export async function queryRetail(query: RetailQuery): Promise<RetailQueryResult> {
  await new Promise((resolve) => setTimeout(resolve, LATENCY_MS));

  const filtered = applyGlobalFilter(
    applyColumnFilters(store, query.columnFilters),
    query.globalFilter,
  );
  const sorted = applySort(filtered, query.sorting);
  const { pageIndex, pageSize } = query.pagination;
  const start = pageIndex * pageSize;
  return { rows: sorted.slice(start, start + pageSize), rowCount: sorted.length };
}

/** Mutation entry point so demo edits survive a refetch (see App.tsx onCellEdit). */
export function applyEdit(itemId: string, columnId: string, value: unknown): void {
  const target = store.find((row) => row.item_id === itemId);
  if (target) {
    (target as Record<string, unknown>)[columnId] = value;
  }
}
