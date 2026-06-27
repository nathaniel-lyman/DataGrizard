import { afterEach, describe, expect, it, vi } from "vitest";
import { mockRetailData } from "./mockRetailData";
import { applyEdit, queryRetail } from "./fakeServer";

// Drive the simulated network latency deterministically.
const resolveQuery = async (query: Parameters<typeof queryRetail>[0]) => {
  vi.useFakeTimers();
  const promise = queryRetail(query);
  await vi.runAllTimersAsync();
  const result = await promise;
  vi.useRealTimers();
  return result;
};

const baseQuery = {
  sorting: [],
  columnFilters: [],
  globalFilter: "",
  pagination: { pageIndex: 0, pageSize: 25 },
} as const;

afterEach(() => {
  vi.useRealTimers();
});

describe("queryRetail", () => {
  it("returns the first page and the full filtered rowCount", async () => {
    const result = await resolveQuery({ ...baseQuery });
    expect(result.rows).toHaveLength(25);
    expect(result.rowCount).toBe(500);
  });

  it("slices by page", async () => {
    const page2 = await resolveQuery({
      ...baseQuery,
      pagination: { pageIndex: 1, pageSize: 25 },
    });
    expect(page2.rows).toHaveLength(25);
    expect(page2.rowCount).toBe(500);
  });

  it("sorts ascending and descending", async () => {
    const asc = await resolveQuery({ ...baseQuery, sorting: [{ id: "sales", desc: false }] });
    const desc = await resolveQuery({ ...baseQuery, sorting: [{ id: "sales", desc: true }] });
    expect(asc.rows[0].sales).toBeLessThanOrEqual(asc.rows[1].sales);
    expect(desc.rows[0].sales).toBeGreaterThanOrEqual(desc.rows[1].sales);
  });

  it("applies a multiSelect column filter", async () => {
    const result = await resolveQuery({
      ...baseQuery,
      columnFilters: [{ id: "department", value: ["Grocery"] }],
    });
    expect(result.rowCount).toBeGreaterThan(0);
    expect(result.rowCount).toBeLessThan(500);
    expect(result.rows.every((row) => row.department === "Grocery")).toBe(true);
  });

  it("filters text columns by contains, not exact match", async () => {
    // Derive a brand substring that recurs across many rows (robust across data changes).
    const brand = mockRetailData[0].item_name.split(" ")[0];
    const result = await resolveQuery({
      ...baseQuery,
      pagination: { pageIndex: 0, pageSize: 500 },
      columnFilters: [{ id: "item_name", value: brand }],
    });
    // Under exact-match ("select") this would be 0 rows; contains must return many.
    expect(result.rowCount).toBeGreaterThan(1);
    expect(
      result.rows.every((row) =>
        row.item_name.toLowerCase().includes(brand.toLowerCase()),
      ),
    ).toBe(true);
  });

  it("filters boolean columns correctly", async () => {
    const trueResult = await resolveQuery({
      ...baseQuery,
      pagination: { pageIndex: 0, pageSize: 500 },
      columnFilters: [{ id: "on_promotion", value: true }],
    });
    expect(trueResult.rowCount).toBeGreaterThan(0);
    expect(trueResult.rowCount).toBeLessThan(500);
    expect(trueResult.rows.every((row) => row.on_promotion === true)).toBe(true);

    const falseResult = await resolveQuery({
      ...baseQuery,
      pagination: { pageIndex: 0, pageSize: 500 },
      columnFilters: [{ id: "on_promotion", value: false }],
    });
    expect(falseResult.rowCount).toBeGreaterThan(0);
    expect(falseResult.rows.every((row) => row.on_promotion === false)).toBe(true);
    // Together they account for all rows.
    expect(trueResult.rowCount + falseResult.rowCount).toBe(500);
  });

  it("applies global search scoped to the searched string fields", async () => {
    const all = await resolveQuery({ ...baseQuery });
    const needle = all.rows[0].item_name.slice(0, 4).toLowerCase();
    const result = await resolveQuery({ ...baseQuery, globalFilter: needle });
    expect(result.rowCount).toBeGreaterThan(0);
    // Search narrows the set (not a no-op pass-through).
    expect(result.rowCount).toBeLessThan(500);
    // Every match is in a SEARCHED field — not merely "somewhere in the JSON"
    // (which would pass even if field-scoping were wrong).
    const searched = [
      "item_id",
      "item_name",
      "department",
      "category",
      "brand",
      "recommendation_status",
    ] as const;
    expect(
      result.rows.every((row) =>
        searched.some((field) => String(row[field]).toLowerCase().includes(needle)),
      ),
    ).toBe(true);
  });
});

describe("applyEdit", () => {
  it("persists an edit so a later query reflects it", async () => {
    const before = await resolveQuery({ ...baseQuery });
    const target = before.rows[0];
    applyEdit(target.item_id, "units", 99999);
    const after = await resolveQuery({ ...baseQuery });
    const updated = after.rows.find((row) => row.item_id === target.item_id);
    expect(updated?.units).toBe(99999);
  });
});
