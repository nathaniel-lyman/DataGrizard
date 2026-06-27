import { describe, expect, it } from "vitest";
import { requestToQuerySpec, type QueryRequestSlices } from "./serverQuery";
import type { GridColumnConfig, GridFilterConfig } from "../../types/grid";

type Row = {
  name: string;
  qty: number;
  status: string;
  when: string;
  region: string;
  secret: number;
};

const columns: GridColumnConfig<Row>[] = [
  { accessorKey: "name", header: "Name", dataType: "text" },
  { accessorKey: "qty", header: "Qty", dataType: "number" },
  { accessorKey: "status", header: "Status", dataType: "status" },
  { accessorKey: "when", header: "When", dataType: "date" },
  { accessorKey: "region", header: "Region", dataType: "text" },
  { accessorKey: "secret", header: "Secret", dataType: "number" },
];

const filters: GridFilterConfig<Row>[] = [
  { accessorKey: "name", label: "Name", filterType: "text" },
  { accessorKey: "status", label: "Status", filterType: "multiSelect" },
  { accessorKey: "qty", label: "Qty", filterType: "range" },
  { accessorKey: "when", label: "When", filterType: "date" },
  { accessorKey: "region", label: "Region" }, // no filterType → defaults to "select"
];

const base: QueryRequestSlices = {
  sorting: [],
  columnFilters: [],
  globalFilter: "",
  pagination: { pageIndex: 0, pageSize: 25 },
};

const spec = (req: Partial<QueryRequestSlices>) =>
  requestToQuerySpec({ ...base, ...req }, { columns, filters });

describe("requestToQuerySpec", () => {
  it("maps pagination to limit/offset", () => {
    const { page } = spec({ pagination: { pageIndex: 2, pageSize: 25 } });
    expect(page).toEqual({ limit: 25, offset: 50 });
  });

  it("maps sorting to direction and drops unknown columns", () => {
    const { sort } = spec({
      sorting: [
        { id: "qty", desc: true },
        { id: "qty; DROP TABLE", desc: false },
      ],
    });
    expect(sort).toEqual([{ column: "qty", direction: "desc" }]);
  });

  it("resolves a multiSelect filter to the isAnyOf operator", () => {
    const { filters: f } = spec({
      columnFilters: [{ id: "status", value: ["A", "B"] }],
    });
    expect(f).toEqual([
      { column: "status", filterType: "multiSelect", operator: "isAnyOf", value: ["A", "B"] },
    ]);
  });

  it("infers a config-less filter type from the column dataType (text → contains)", () => {
    // `region` is a text column with no explicit filterType in the config, so it
    // resolves to the dataType-inferred control (free-text contains in server
    // mode) — in lockstep with the auto-provisioned grid filter.
    const { filters: f } = spec({ columnFilters: [{ id: "region", value: "West" }] });
    expect(f).toEqual([
      { column: "region", filterType: "text", operator: "contains", value: "West" },
    ]);
  });

  it("resolves range and date filters to the between operator", () => {
    const { filters: f } = spec({
      columnFilters: [
        { id: "qty", value: { min: 1, max: 9 } },
        { id: "when", value: { from: "2026-01-01", to: "2026-03-01" } },
      ],
    });
    expect(f).toEqual([
      { column: "qty", filterType: "range", operator: "between", value: { min: 1, max: 9 } },
      {
        column: "when",
        filterType: "date",
        operator: "between",
        value: { from: "2026-01-01", to: "2026-03-01" },
      },
    ]);
  });

  it("resolves a text filter to the contains operator", () => {
    const { filters: f } = spec({ columnFilters: [{ id: "name", value: "foo" }] });
    expect(f).toEqual([
      { column: "name", filterType: "text", operator: "contains", value: "foo" },
    ]);
  });

  it("honors a wrapped {operator, value} clause (lockstep with the grid predicate)", () => {
    const { filters: f } = spec({
      columnFilters: [{ id: "qty", value: { operator: "gt", value: 5 } }],
    });
    expect(f).toEqual([
      { column: "qty", filterType: "range", operator: "gt", value: 5 },
    ]);
  });

  it("drops inactive filters (empty string / empty array)", () => {
    const { filters: f } = spec({
      columnFilters: [
        { id: "name", value: "" },
        { id: "status", value: [] },
      ],
    });
    expect(f).toEqual([]);
  });

  it("drops filters on columns not in the config (identifier whitelist)", () => {
    const { filters: f } = spec({
      columnFilters: [{ id: "secret_or_injection)--", value: "x" }],
    });
    expect(f).toEqual([]);
  });

  it("defaults global search to text/status columns", () => {
    const { search } = spec({ globalFilter: "  abc  " });
    expect(search).toEqual({ term: "abc", columns: ["name", "status", "region"] });
  });

  it("returns null search for an empty global filter", () => {
    expect(spec({ globalFilter: "   " }).search).toBeNull();
  });

  it("respects an explicit searchColumns override", () => {
    const result = requestToQuerySpec(
      { ...base, globalFilter: "x" },
      { columns, filters, searchColumns: ["name"] },
    );
    expect(result.search).toEqual({ term: "x", columns: ["name"] });
  });
});
