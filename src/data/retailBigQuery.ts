import type {
  DataGridDataSource,
  DataGridDataSourceRequest,
} from "../components/DataGrid";
import type { RetailQueryResult } from "./fakeServer";
import type { RetailItem } from "./mockRetailData";

/**
 * Consumer-side adapter that turns the DataGrid's `dataSource` request into a
 * call against a real backend (the Express + BigQuery handler in `server/`).
 *
 * This is the entire boundary between the grid and BigQuery: it is a drop-in
 * replacement for `queryRetail` (the fake server). Swap which source you pass to
 * `<DataGrid dataSource={…} />` to switch between the simulated and real
 * backends — the component never changes.
 */

export type RetailBigQueryOptions = {
  /** URL of the query endpoint, e.g. "/api/retail/query". */
  endpoint: string;
  /** Injectable fetch (defaults to global fetch); handy for tests/SSR. */
  fetchImpl?: typeof fetch;
};

export function createRetailBigQueryDataSource(
  options: RetailBigQueryOptions,
): DataGridDataSource<RetailItem> {
  const doFetch = options.fetchImpl ?? fetch;

  return async (request: DataGridDataSourceRequest): Promise<RetailQueryResult> => {
    // Send only the JSON-safe query slices — never the AbortSignal/requestId,
    // which are runtime-only. The body matches the `RetailQuery` wire contract.
    const body = JSON.stringify({
      sorting: request.sorting,
      globalFilter: request.globalFilter,
      columnFilters: request.columnFilters,
      pagination: request.pagination,
    });

    const response = await doFetch(options.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      // Forwarding the grid's signal lets it abort superseded requests.
      signal: request.signal,
    });

    if (!response.ok) {
      throw new Error(`Retail query failed: ${response.status}`);
    }

    return (await response.json()) as RetailQueryResult;
  };
}
