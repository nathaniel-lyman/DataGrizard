import { describe, expect, it, vi } from "vitest";
import { createRetailBigQueryDataSource } from "./retailBigQuery";
import type { DataGridDataSourceRequest } from "../components/DataGrid";

const makeRequest = (
  overrides: Partial<DataGridDataSourceRequest> = {},
): DataGridDataSourceRequest => ({
  sorting: [{ id: "sales", desc: true }],
  globalFilter: "mug",
  columnFilters: [{ id: "department", value: ["Grocery"] }],
  pagination: { pageIndex: 1, pageSize: 25 },
  signal: new AbortController().signal,
  requestId: 1,
  ...overrides,
});

const okResponse = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body }) as Response;

describe("createRetailBigQueryDataSource", () => {
  it("POSTs only the JSON-safe query slices to the endpoint", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => okResponse({ rows: [], rowCount: 0 }));
    const source = createRetailBigQueryDataSource({
      endpoint: "/api/retail/query",
      fetchImpl,
    });

    await source(makeRequest());

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("/api/retail/query");
    expect(init?.method).toBe("POST");
    const sent = JSON.parse(init!.body as string);
    expect(sent).toEqual({
      sorting: [{ id: "sales", desc: true }],
      globalFilter: "mug",
      columnFilters: [{ id: "department", value: ["Grocery"] }],
      pagination: { pageIndex: 1, pageSize: 25 },
    });
    // Internal-only fields must never go over the wire.
    expect(sent.signal).toBeUndefined();
    expect(sent.requestId).toBeUndefined();
  });

  it("forwards the abort signal so the grid can cancel stale requests", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => okResponse({ rows: [], rowCount: 0 }));
    const source = createRetailBigQueryDataSource({
      endpoint: "/api/retail/query",
      fetchImpl,
    });
    const controller = new AbortController();

    await source(makeRequest({ signal: controller.signal }));

    expect(fetchImpl.mock.calls[0]![1]?.signal).toBe(controller.signal);
  });

  it("returns the rows and rowCount from the response", async () => {
    const rows = [{ item_id: "1" }];
    const fetchImpl = vi.fn<typeof fetch>(async () => okResponse({ rows, rowCount: 137 }));
    const source = createRetailBigQueryDataSource({
      endpoint: "/api/retail/query",
      fetchImpl,
    });

    const result = await source(makeRequest());

    expect(result.rows).toBe(rows);
    expect(result.rowCount).toBe(137);
  });

  it("throws on a non-ok response so the grid shows its error state", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () => ({ ok: false, status: 500, json: async () => ({}) }) as Response,
    );
    const source = createRetailBigQueryDataSource({
      endpoint: "/api/retail/query",
      fetchImpl,
    });

    await expect(source(makeRequest())).rejects.toThrow(/500/);
  });
});
