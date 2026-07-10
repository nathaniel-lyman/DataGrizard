import { describe, expect, it } from "vitest";
import type {
  DataGridAnalysisContext,
  DataGridServerAnalysisRequest,
} from "../components/DataGrid/dataGridAnalysisContract";
import { validateDataGridServerAnalysisPayload } from "../components/DataGrid/dataGridAnalysisValidation";
import { mockRetailData } from "./mockRetailData";
import { fakeRetailServerAnalysis } from "./fakeServerAnalysis";

const columns = [
  "item_id",
  "item_name",
  "department",
  "category",
  "brand",
  "sales",
  "units",
  "margin_rate",
  "price_gap",
  "recommendation_status",
  "last_restocked_at",
  "on_promotion",
];

const context = (overrides: Partial<DataGridAnalysisContext> = {}): DataGridAnalysisContext => ({
  queryId: "query-1",
  gridRevision: 1,
  scope: "all",
  columns: [],
  filters: { globalFilter: "", columnFilters: [] },
  querySpec: { filters: [], search: null, orderBy: [] },
  limits: {
    maxRowsPerQuery: 100,
    maxCellsPerQuery: 2_000,
    maxGroupsPerAggregate: 100,
    maxTopValues: 10,
  },
  ...overrides,
});

const queryRequest = (
  overrides: Partial<Extract<DataGridServerAnalysisRequest, { operation: "query" }>> = {},
): Extract<DataGridServerAnalysisRequest, { operation: "query" }> => ({
  operation: "query",
  input: { scope: "all", columnIds: columns, offset: 0, limit: 100 },
  context: context(),
  signal: new AbortController().signal,
  ...overrides,
});

describe("fakeRetailServerAnalysis", () => {
  it("queries the complete fixture in deterministic item_id order with projection and provenance", async () => {
    const request = queryRequest({
      input: { scope: "all", columnIds: ["item_name", "sales"], offset: 10, limit: 3 },
    });
    const payload = await fakeRetailServerAnalysis.execute(request);

    expect(validateDataGridServerAnalysisPayload(request, payload).ok).toBe(true);
    expect(payload.operation).toBe("query");
    if (payload.operation !== "query") return;
    expect(payload.rowCount).toBe(mockRetailData.length);
    expect(payload.returnedRowCount).toBe(3);
    expect(payload.rows.map((row) => row.rowId)).toEqual([
      "SKU-00011",
      "SKU-00012",
      "SKU-00013",
    ]);
    expect(Object.keys(payload.rows[0].values)).toEqual(["item_name", "sales"]);
    expect(payload.provenance).toMatchObject({
      sourceRevision: "mock-retail-2026-07-10",
      requestFingerprint: expect.stringMatching(/^fake-[0-9a-f]{8}$/),
      effectiveOrdering: "item_id ascending",
    });
    expect(payload.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "offset_applied" }),
      expect.objectContaining({ code: "rows_truncated" }),
    ]));
  });

  it("applies the normalized typed filter and field-scoped search clauses", async () => {
    const request = queryRequest({
      input: { scope: "filtered", columnIds: ["department", "item_name"], offset: 0, limit: 100 },
      context: context({
        scope: "filtered",
        querySpec: {
          filters: [{
            column: "department",
            filterType: "multiSelect",
            operator: "isAnyOf",
            value: ["Grocery"],
          }],
          search: { term: "Northline", columns: ["item_name"] },
          orderBy: [],
        },
      }),
    });
    const payload = await fakeRetailServerAnalysis.execute(request);

    expect(validateDataGridServerAnalysisPayload(request, payload).ok).toBe(true);
    expect(payload.operation).toBe("query");
    if (payload.operation !== "query") return;
    expect(payload.rowCount).toBeGreaterThan(0);
    expect(payload.rows.every((row) =>
      row.values.department === "Grocery" &&
      String(row.values.item_name).includes("Northline"))).toBe(true);
  });

  it("returns complete aggregates, deterministic groups, bounded evidence, and top-values warnings", async () => {
    const request = {
      operation: "aggregate",
      input: {
        scope: "all",
        metrics: [
          { operation: "count", as: "items" },
          { operation: "sum", columnId: "sales", as: "sales" },
          { operation: "top_values", columnId: "brand", as: "brands", limit: 2 },
        ],
        groupBy: ["department"],
      },
      context: context({
        limits: {
          maxRowsPerQuery: 5,
          maxCellsPerQuery: 2_000,
          maxGroupsPerAggregate: 100,
          maxTopValues: 2,
        },
      }),
      signal: new AbortController().signal,
    } satisfies Extract<DataGridServerAnalysisRequest, { operation: "aggregate" }>;
    const payload = await fakeRetailServerAnalysis.execute(request);

    expect(validateDataGridServerAnalysisPayload(request, payload).ok).toBe(true);
    expect(payload.operation).toBe("aggregate");
    if (payload.operation !== "aggregate") return;
    expect(payload.rowCount).toBe(mockRetailData.length);
    expect(payload.metrics.items).toBe(mockRetailData.length);
    expect(payload.metrics.sales).toBe(mockRetailData.reduce((total, row) => total + row.sales, 0));
    expect(payload.groups).toHaveLength(6);
    expect(payload.groups.reduce((total, group) => total + group.rowCount, 0)).toBe(mockRetailData.length);
    expect(payload.supportingRowIds).toEqual([
      "SKU-00001",
      "SKU-00002",
      "SKU-00003",
      "SKU-00004",
      "SKU-00005",
    ]);
    expect(payload.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "top_values_truncated" }),
      expect.objectContaining({ code: "supporting_rows_truncated" }),
    ]));
  });

  it("honors a pre-aborted or immediately aborted caller signal", async () => {
    const preAborted = new AbortController();
    preAborted.abort();
    await expect(fakeRetailServerAnalysis.execute(queryRequest({ signal: preAborted.signal })))
      .rejects.toMatchObject({ name: "AbortError" });

    const inFlight = new AbortController();
    const pending = fakeRetailServerAnalysis.execute(queryRequest({ signal: inFlight.signal }));
    inFlight.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
