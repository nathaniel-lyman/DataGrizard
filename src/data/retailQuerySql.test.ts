import { describe, expect, it } from "vitest";
import { buildRetailQuery } from "./retailQuerySql";
import type { RetailQuery } from "./fakeServer";

const TABLE = "my_project.retail.items";

const baseQuery: RetailQuery = {
  sorting: [],
  columnFilters: [],
  globalFilter: "",
  pagination: { pageIndex: 0, pageSize: 25 },
};

describe("buildRetailQuery", () => {
  it("selects from the given table with a deterministic default sort", () => {
    const { sql } = buildRetailQuery(baseQuery, { table: TABLE });
    expect(sql).toContain("FROM `my_project.retail.items`");
    // Deterministic ordering so OFFSET paging is stable when no sort is set.
    expect(sql).toContain("ORDER BY `item_id` ASC");
  });

  it("paginates with parameterized LIMIT/OFFSET", () => {
    const { sql, params } = buildRetailQuery(
      { ...baseQuery, pagination: { pageIndex: 2, pageSize: 25 } },
      { table: TABLE },
    );
    expect(sql).toContain("LIMIT @limit OFFSET @offset");
    expect(params.limit).toBe(25);
    expect(params.offset).toBe(50);
  });

  it("orders by whitelisted sort columns and ignores unknown ids", () => {
    const { sql } = buildRetailQuery(
      {
        ...baseQuery,
        sorting: [
          { id: "sales", desc: true },
          { id: "item_name DROP TABLE", desc: false },
        ],
      },
      { table: TABLE },
    );
    expect(sql).toContain("ORDER BY `sales` DESC");
    expect(sql).not.toContain("DROP TABLE");
  });

  it("builds a parameterized IN clause for multiSelect filters", () => {
    const { sql, params } = buildRetailQuery(
      { ...baseQuery, columnFilters: [{ id: "department", value: ["Grocery", "Home"] }] },
      { table: TABLE },
    );
    expect(sql).toContain("`department` IN UNNEST(@p0)");
    expect(params.p0).toEqual(["Grocery", "Home"]);
    // The literal value never appears inline in the SQL string.
    expect(sql).not.toContain("Grocery");
  });

  it("builds an exact-match clause for select filters", () => {
    const { sql, params } = buildRetailQuery(
      { ...baseQuery, columnFilters: [{ id: "category", value: "Frozen" }] },
      { table: TABLE },
    );
    expect(sql).toContain("`category` = @p0");
    expect(params.p0).toBe("Frozen");
  });

  it("builds a BETWEEN-style clause for range filters", () => {
    const { sql, params } = buildRetailQuery(
      { ...baseQuery, columnFilters: [{ id: "sales", value: { min: 100, max: 500 } }] },
      { table: TABLE },
    );
    expect(sql).toContain("`sales` >= @p0");
    expect(sql).toContain("`sales` <= @p1");
    expect(params.p0).toBe(100);
    expect(params.p1).toBe(500);
  });

  it("emits only the provided side of an open-ended range", () => {
    const { sql, params } = buildRetailQuery(
      { ...baseQuery, columnFilters: [{ id: "sales", value: { min: 100 } }] },
      { table: TABLE },
    );
    expect(sql).toContain("`sales` >= @p0");
    expect(sql).not.toContain("<=");
    expect(params.p0).toBe(100);
    expect(params.p1).toBeUndefined();
  });

  it("builds a case-insensitive contains clause for text filters", () => {
    const { sql, params } = buildRetailQuery(
      { ...baseQuery, columnFilters: [{ id: "item_name", value: "Apple" }] },
      { table: TABLE },
    );
    expect(sql).toContain("LOWER(`item_name`) LIKE @p0");
    expect(params.p0).toBe("%apple%");
  });

  it("builds a date range clause for date filters", () => {
    const { sql, params } = buildRetailQuery(
      {
        ...baseQuery,
        columnFilters: [
          { id: "last_restocked_at", value: { from: "2026-01-01", to: "2026-03-01" } },
        ],
      },
      { table: TABLE },
    );
    expect(sql).toContain("`last_restocked_at` >= @p0");
    expect(sql).toContain("`last_restocked_at` <= @p1");
    expect(params.p0).toBe("2026-01-01");
    expect(params.p1).toBe("2026-03-01");
  });

  it("ignores filters on non-whitelisted columns", () => {
    const { sql, params } = buildRetailQuery(
      { ...baseQuery, columnFilters: [{ id: "evil); DROP TABLE items;--", value: "x" }] },
      { table: TABLE },
    );
    expect(sql).not.toContain("DROP TABLE");
    expect(sql).not.toContain("WHERE");
    expect(params.p0).toBeUndefined();
  });

  it("searches across the configured search fields with one shared param", () => {
    const { sql, params } = buildRetailQuery(
      { ...baseQuery, globalFilter: "Mug" },
      { table: TABLE },
    );
    expect(sql).toContain("LOWER(`item_name`) LIKE @q");
    expect(sql).toContain("LOWER(`brand`) LIKE @q");
    expect(sql).toContain(" OR ");
    expect(params.q).toBe("%mug%");
  });

  it("produces a matching count query with the same WHERE but no ORDER/LIMIT", () => {
    const { countSql, params } = buildRetailQuery(
      { ...baseQuery, columnFilters: [{ id: "department", value: ["Grocery"] }] },
      { table: TABLE },
    );
    expect(countSql).toContain("SELECT COUNT(*) AS total");
    expect(countSql).toContain("`department` IN UNNEST(@p0)");
    expect(countSql).not.toContain("ORDER BY");
    expect(countSql).not.toContain("LIMIT");
    expect(params.p0).toEqual(["Grocery"]);
  });

  it("rejects a table name that is not a valid BigQuery identifier path", () => {
    expect(() =>
      buildRetailQuery(baseQuery, { table: "items`; DROP TABLE x; --" }),
    ).toThrow();
  });
});
