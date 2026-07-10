import { createRef } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GridColumnConfig } from "../../types/grid";
import { DataGrid } from "./DataGrid";
import type { DataGridApi } from "./dataGridApi";
import type {
  DataGridServerAnalysisAdapter,
  DataGridServerAnalysisRequest,
} from "./dataGridAnalysisContract";

type Row = { id: string; category: string; amount: number };

const rows: Row[] = [
  { id: "1", category: "A", amount: 12 },
  { id: "2", category: "B", amount: 20 },
];

const columns: GridColumnConfig<Row>[] = [
  { accessorKey: "id", header: "ID", dataType: "text" },
  { accessorKey: "category", header: "Category", dataType: "text" },
  { accessorKey: "amount", header: "Amount", dataType: "number" },
];

afterEach(cleanup);

const queryPayload = {
  operation: "query" as const,
  rows: [{ rowId: "remote-1", values: { category: "A", amount: 42 } }],
  rowCount: 10,
  returnedRowCount: 1,
  offset: 0,
  truncated: true,
  provenance: {
    sourceRevision: "warehouse-v4",
    requestFingerprint: "job-123",
    effectiveOrdering: "id ascending",
  },
};

describe("DataGrid server analysis", () => {
  it("preserves honest local behavior without an adapter", async () => {
    const apiRef = createRef<DataGridApi<Row>>();
    render(
      <DataGrid
        apiRef={apiRef}
        data={rows}
        columns={columns}
        dataMode="server"
        rowCount={100}
        getRowId={(row) => row.id}
      />,
    );

    expect(apiRef.current?.getSnapshot().analysis).toEqual({
      queryScopes: ["selected_rows", "visible_page"],
      aggregateScopes: ["selected_rows", "visible_page"],
      remote: false,
    });
    expect(await apiRef.current?.queryAsync({ scope: "all" })).toMatchObject({
      ok: false,
      error: { code: "scope_unavailable" },
    });
    expect(await apiRef.current?.aggregateAsync({
      scope: "filtered",
      metrics: [{ operation: "count" }],
    })).toMatchObject({ ok: false, error: { code: "scope_unavailable" } });
  });

  it("routes only advertised complete scopes through the adapter and builds a canonical receipt", async () => {
    const apiRef = createRef<DataGridApi<Row>>();
    const execute = vi.fn(async (request: DataGridServerAnalysisRequest) => {
      if (request.operation === "query") return queryPayload;
      return {
        operation: "aggregate" as const,
        rowCount: 10,
        metrics: { total: 420 },
        groups: [],
        truncated: false,
        supportingRowIds: ["remote-1", "remote-2"],
        provenance: { sourceRevision: "warehouse-v4" },
      };
    });
    const adapter: DataGridServerAnalysisAdapter = {
      id: "warehouse",
      capabilities: {
        queryScopes: ["all", "filtered"],
        aggregateScopes: ["filtered"],
      },
      execute,
    };
    render(
      <DataGrid
        apiRef={apiRef}
        data={rows}
        columns={columns}
        dataMode="server"
        rowCount={100}
        serverAnalysis={adapter}
        state={{
          globalFilter: "A",
          columnFilters: [{ id: "amount", value: { operator: "gte", value: 10 } }],
        }}
        getRowId={(row) => row.id}
      />,
    );

    expect(apiRef.current?.getSnapshot().analysis).toEqual({
      queryScopes: ["selected_rows", "visible_page", "all", "filtered"],
      aggregateScopes: ["selected_rows", "visible_page", "filtered"],
      remote: true,
    });
    expect(apiRef.current?.query({ scope: "filtered" })).toMatchObject({
      ok: false,
      error: { code: "scope_unavailable" },
    });

    const result = await apiRef.current?.queryAsync({
      scope: "filtered",
      columnIds: ["category", "amount"],
      limit: 5,
    });
    expect(result).toMatchObject({
      ok: true,
      rows: queryPayload.rows,
      rowCount: 10,
      receipt: {
        scope: "filtered",
        execution: {
          mode: "server",
          adapterId: "warehouse",
          sourceRevision: "warehouse-v4",
          requestFingerprint: "job-123",
          effectiveOrdering: "id ascending",
        },
        supportingRowCount: 10,
        supportingRowIds: ["remote-1"],
        supportingRowIdsTruncated: true,
        limits: expect.objectContaining({ maxRowsPerQuery: expect.any(Number) }),
        filters: {
          globalFilter: "A",
          columnFilters: [{ id: "amount", value: { operator: "gte", value: 10 } }],
        },
      },
    });
    const request = execute.mock.calls[0][0];
    expect(request).toMatchObject({
      operation: "query",
      input: {
        scope: "filtered",
        columnIds: ["category", "amount"],
        offset: 0,
        limit: 5,
      },
      context: {
        scope: "filtered",
        querySpec: {
          filters: [{ column: "amount", operator: "gte", value: 10 }],
          search: { term: "A" },
          orderBy: [],
        },
      },
    });

    expect(await apiRef.current?.aggregateAsync({
      scope: "all",
      metrics: [{ operation: "count" }],
    })).toMatchObject({ ok: false, error: { code: "scope_unavailable" } });
    const aggregate = await apiRef.current?.aggregateAsync({
      scope: "filtered",
      metrics: [{ operation: "sum", columnId: "amount", as: "total" }],
    });
    expect(aggregate).toMatchObject({
      ok: true,
      metrics: { total: 420 },
      receipt: {
        execution: { mode: "server", adapterId: "warehouse" },
        supportingRowCount: 10,
        supportingRowIds: ["remote-1", "remote-2"],
        supportingRowIdsTruncated: true,
      },
    });
  });

  it("maps aborts, adapter failures, and invalid payloads to neutral errors", async () => {
    const apiRef = createRef<DataGridApi<Row>>();
    let behavior: "reject" | "invalid" | "wait" = "reject";
    const execute = vi.fn(async (request: DataGridServerAnalysisRequest) => {
      if (behavior === "reject") throw new Error("secret SQL failure");
      if (behavior === "invalid") return { ...queryPayload, returnedRowCount: 99 };
      await new Promise<void>((resolve, reject) => {
        request.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
      return queryPayload;
    });
    const adapter: DataGridServerAnalysisAdapter = {
      id: "warehouse",
      capabilities: { queryScopes: ["all"], aggregateScopes: [] },
      execute,
    };
    render(
      <DataGrid
        apiRef={apiRef}
        data={rows}
        columns={columns}
        dataMode="server"
        serverAnalysis={adapter}
        getRowId={(row) => row.id}
      />,
    );

    const failed = await apiRef.current?.queryAsync({ scope: "all", columnIds: ["amount"] });
    expect(failed).toMatchObject({ ok: false, error: { code: "analysis_failed" } });
    expect(JSON.stringify(failed)).not.toContain("secret SQL");

    behavior = "invalid";
    expect(await apiRef.current?.queryAsync({ scope: "all", columnIds: ["amount"] }))
      .toMatchObject({ ok: false, error: { code: "invalid_analysis_response" } });

    behavior = "wait";
    const controller = new AbortController();
    const pending = apiRef.current?.queryAsync(
      { scope: "all", columnIds: ["amount"] },
      { signal: controller.signal },
    );
    controller.abort();
    expect(await pending).toMatchObject({ ok: false, error: { code: "analysis_aborted" } });
  });

  it("keeps start context immutable and warns when the view changes in flight", async () => {
    const apiRef = createRef<DataGridApi<Row>>();
    let release: (() => void) | undefined;
    const execute = vi.fn(async () => {
      await new Promise<void>((resolve) => { release = resolve; });
      return queryPayload;
    });
    const adapter: DataGridServerAnalysisAdapter = {
      id: "warehouse",
      capabilities: { queryScopes: ["filtered"], aggregateScopes: [] },
      execute,
    };
    const view = render(
      <DataGrid
        apiRef={apiRef}
        data={rows}
        columns={columns}
        dataMode="server"
        serverAnalysis={adapter}
        state={{ globalFilter: "before" }}
        getRowId={(row) => row.id}
      />,
    );
    const startRevision = apiRef.current?.getSnapshot().revision;
    const pending = apiRef.current?.queryAsync({
      scope: "filtered",
      columnIds: ["category", "amount"],
    });
    view.rerender(
      <DataGrid
        apiRef={apiRef}
        data={rows}
        columns={columns}
        dataMode="server"
        serverAnalysis={adapter}
        state={{ globalFilter: "after" }}
        getRowId={(row) => row.id}
      />,
    );
    await act(async () => release?.());
    const result = await pending;
    expect(result).toMatchObject({
      ok: true,
      receipt: {
        gridRevision: startRevision,
        completedGridRevision: apiRef.current?.getSnapshot().revision,
        filters: { globalFilter: "before" },
        warnings: expect.arrayContaining([expect.objectContaining({
          code: "view_changed_during_execution",
        })]),
      },
    });
  });
});
