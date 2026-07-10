import { describe, expect, it } from "vitest";
import type {
  DataGridDataAccessLimits,
  DataGridSourceColumnSnapshot,
} from "./dataGridApi";
import type {
  DataGridAnalysisContext,
  DataGridServerAggregateRequest,
  DataGridServerQueryRequest,
} from "./dataGridAnalysisContract";
import {
  normalizeDataGridAggregateQuery,
  normalizeDataGridQuery,
  validateDataGridServerAggregatePayload,
  validateDataGridServerQueryPayload,
} from "./dataGridAnalysisValidation";
import { buildDataGridAnalysisQuerySpec } from "./serverQuery";

const limits: DataGridDataAccessLimits = {
  maxRowsPerQuery: 3,
  maxCellsPerQuery: 6,
  maxGroupsPerAggregate: 3,
  maxTopValues: 2,
};

const columns: DataGridSourceColumnSnapshot[] = [
  {
    id: "name",
    label: "Name",
    dataType: "text",
    visible: true,
    canHide: true,
    canSort: true,
    canFilter: true,
    canGroup: true,
    filter: { type: "text", operators: ["contains", "equals"] },
    aggregateOperations: ["count", "distinct_count", "top_values"],
  },
  {
    id: "amount",
    label: "Amount",
    dataType: "number",
    visible: true,
    canHide: true,
    canSort: true,
    canFilter: true,
    canGroup: true,
    filter: { type: "range", operators: ["between", "gt"] },
    aggregateOperations: [
      "count", "sum", "average", "min", "max", "min_max", "distinct_count", "top_values",
    ],
  },
  {
    id: "region",
    label: "Region",
    dataType: "status",
    visible: true,
    canHide: true,
    canSort: true,
    canFilter: true,
    canGroup: true,
    filter: { type: "multiSelect", operators: ["isAnyOf", "isNoneOf"] },
    aggregateOperations: ["count", "distinct_count", "top_values"],
  },
];

const context = (scope: "all" | "filtered"): DataGridAnalysisContext => ({
  queryId: "query-1",
  gridRevision: 4,
  scope,
  columns,
  filters: { globalFilter: "", columnFilters: [] },
  querySpec: { filters: [], search: null, orderBy: [] },
  limits,
});

describe("analysis query-spec construction", () => {
  it("makes all independent from filters, search, and sorting", () => {
    expect(buildDataGridAnalysisQuerySpec(
      "all",
      {
        globalFilter: "boots",
        columnFilters: [{ id: "amount", value: { operator: "gt", value: 10 } }],
      },
      columns,
    )).toEqual({ filters: [], search: null, orderBy: [] });
  });

  it("normalizes the filtered predicate through resolved filter metadata", () => {
    expect(buildDataGridAnalysisQuerySpec(
      "filtered",
      {
        globalFilter: "  boots  ",
        columnFilters: [
          { id: "amount", value: { operator: "gt", value: 10 } },
          { id: "region", value: ["North", "West"] },
          { id: "unknown", value: "ignored" },
        ],
      },
      columns,
    )).toEqual({
      filters: [
        { column: "amount", filterType: "range", operator: "gt", value: 10 },
        {
          column: "region",
          filterType: "multiSelect",
          operator: "isAnyOf",
          value: ["North", "West"],
        },
      ],
      search: { term: "boots", columns: ["name", "region"] },
      orderBy: [],
    });
  });
});

describe("analysis request normalization", () => {
  it("fills query defaults without mutating the caller input", () => {
    const input = { scope: "filtered" as const };
    const result = normalizeDataGridQuery(input, {
      columns,
      defaultColumnIds: ["name", "amount"],
      limits,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scope: "filtered",
        columnIds: ["name", "amount"],
        offset: 0,
        limit: 3,
      },
      warnings: [],
    });
    expect(input).toEqual({ scope: "filtered" });
  });

  it("rejects duplicate, unknown, and over-limit query projections", () => {
    expect(normalizeDataGridQuery(
      { scope: "all", columnIds: ["name", "name"] },
      { columns, defaultColumnIds: [], limits },
    )).toMatchObject({ ok: false, error: { code: "invalid_query" } });
    expect(normalizeDataGridQuery(
      { scope: "all", columnIds: ["missing"] },
      { columns, defaultColumnIds: [], limits },
    )).toMatchObject({ ok: false, error: { code: "invalid_column", id: "missing" } });
    expect(normalizeDataGridQuery(
      { scope: "all", columnIds: ["name", "amount", "region"], limit: 3 },
      { columns, defaultColumnIds: [], limits },
    )).toMatchObject({ ok: false, error: { code: "limit_exceeded" } });
  });

  it("normalizes top_values limits and rejects type-illegal metrics", () => {
    const normalized = normalizeDataGridAggregateQuery({
      scope: "filtered",
      metrics: [{ operation: "top_values", columnId: "name", limit: 20, as: "names" }],
    }, { columns, limits });
    expect(normalized).toMatchObject({
      ok: true,
      value: {
        metrics: [{ operation: "top_values", columnId: "name", limit: 2, as: "names" }],
        groupBy: [],
      },
      warnings: [{ code: "limit_clamped", limit: 2, actual: 20 }],
    });

    expect(normalizeDataGridAggregateQuery({
      scope: "all",
      metrics: [{ operation: "sum", columnId: "name" }],
    }, { columns, limits })).toMatchObject({
      ok: false,
      error: { code: "invalid_query", id: "name" },
    });
  });

  it("rejects duplicate aggregate aliases and group ids", () => {
    expect(normalizeDataGridAggregateQuery({
      scope: "all",
      metrics: [
        { operation: "sum", columnId: "amount", as: "total" },
        { operation: "count", as: "total" },
      ],
    }, { columns, limits })).toMatchObject({ ok: false, error: { code: "invalid_query" } });
    expect(normalizeDataGridAggregateQuery({
      scope: "all",
      metrics: [{ operation: "count" }],
      groupBy: ["region", "region"],
    }, { columns, limits })).toMatchObject({ ok: false, error: { code: "invalid_query" } });
  });
});

describe("server analysis payload validation", () => {
  const queryRequest: DataGridServerQueryRequest = {
    operation: "query",
    input: { scope: "all", columnIds: ["name", "amount"], offset: 0, limit: 2 },
    context: context("all"),
    signal: new AbortController().signal,
  };

  it("accepts a correlated, bounded query response", () => {
    expect(validateDataGridServerQueryPayload(queryRequest, {
      operation: "query",
      rows: [{ rowId: "r1", values: { name: "Boot", amount: 12 } }],
      rowCount: 1,
      returnedRowCount: 1,
      offset: 0,
      truncated: false,
      provenance: { sourceRevision: "v4", effectiveOrdering: "id asc" },
    })).toMatchObject({ ok: true });
  });

  it("rejects duplicate ids, bad projections, non-finite values, and inconsistent counts", () => {
    const base = {
      operation: "query",
      rows: [
        { rowId: "r1", values: { name: "Boot", amount: 12 } },
        { rowId: "r1", values: { name: "Hat", amount: 8 } },
      ],
      rowCount: 2,
      returnedRowCount: 2,
      offset: 0,
      truncated: false,
    };
    expect(validateDataGridServerQueryPayload(queryRequest, base)).toMatchObject({
      ok: false,
      error: { code: "invalid_analysis_response" },
    });
    expect(validateDataGridServerQueryPayload(queryRequest, {
      ...base,
      rows: [{ rowId: "r1", values: { name: "Boot", extra: 12 } }],
      rowCount: 1,
      returnedRowCount: 1,
    })).toMatchObject({ ok: false });
    expect(validateDataGridServerQueryPayload(queryRequest, {
      ...base,
      rows: [{ rowId: "r1", values: { name: "Boot", amount: Number.NaN } }],
      rowCount: 1,
      returnedRowCount: 1,
    })).toMatchObject({ ok: false });
    expect(validateDataGridServerQueryPayload(queryRequest, {
      ...base,
      rows: [{ rowId: "r1", values: { name: "Boot", amount: 12 } }],
      returnedRowCount: 2,
    })).toMatchObject({ ok: false });
  });

  const aggregateRequest: DataGridServerAggregateRequest = {
    operation: "aggregate",
    input: {
      scope: "filtered",
      metrics: [{ operation: "top_values", columnId: "name", as: "names", limit: 2 }],
      groupBy: ["region"],
    },
    context: context("filtered"),
    signal: new AbortController().signal,
  };

  it("does not confuse aggregate scan count with returned evidence limits", () => {
    expect(validateDataGridServerAggregatePayload(aggregateRequest, {
      operation: "aggregate",
      rowCount: 10_000,
      metrics: { names: [{ value: "Boot", count: 4000 }] },
      groups: [
        {
          key: { region: "North" },
          rowCount: 6000,
          metrics: { names: [{ value: "Boot", count: 3000 }] },
        },
      ],
      truncated: true,
      supportingRowIds: ["r1", "r2", "r3"],
    })).toMatchObject({ ok: true });
  });

  it("rejects unexpected aliases, over-limit top values, groups, and evidence", () => {
    const base = {
      operation: "aggregate",
      rowCount: 10,
      metrics: { names: [{ value: "Boot", count: 4 }] },
      groups: [],
      truncated: false,
    };
    expect(validateDataGridServerAggregatePayload(aggregateRequest, {
      ...base,
      metrics: { unexpected: 1 },
    })).toMatchObject({ ok: false, error: { code: "invalid_analysis_response" } });
    expect(validateDataGridServerAggregatePayload(aggregateRequest, {
      ...base,
      metrics: {
        names: [
          { value: "Boot", count: 4 },
          { value: "Hat", count: 3 },
          { value: "Coat", count: 2 },
        ],
      },
    })).toMatchObject({ ok: false });
    expect(validateDataGridServerAggregatePayload(aggregateRequest, {
      ...base,
      groups: Array.from({ length: 4 }, (_, index) => ({
        key: { region: `r${index}` },
        rowCount: 1,
        metrics: { names: [] },
      })),
    })).toMatchObject({ ok: false });
    expect(validateDataGridServerAggregatePayload(aggregateRequest, {
      ...base,
      supportingRowIds: ["r1", "r2", "r3", "r4"],
    })).toMatchObject({ ok: false });
  });
});
