import { describe, expect, it } from "vitest";
import type { AnyColumnConfig } from "./cells";
import { composeCardRoles } from "./cardComposition";

type Row = {
  sku: string;
  product: string;
  dept: string;
  status: string;
  revenue: number;
  units: number;
  margin: number;
  discount: number;
  restocked: string;
  active: boolean;
};

const col = (accessorKey: keyof Row & string, dataType: AnyColumnConfig<Row>["dataType"]): AnyColumnConfig<Row> => ({
  accessorKey,
  header: accessorKey,
  dataType,
});

// Visible order matters: sku is the FIRST text column, so it wins title by default.
const columns: AnyColumnConfig<Row>[] = [
  col("sku", "text"),
  col("product", "text"),
  col("dept", "text"),
  col("status", "status"),
  col("revenue", "currency"),
  col("units", "number"),
  col("margin", "percent"),
  col("discount", "percent"),
  col("restocked", "date"),
  col("active", "boolean"),
];

const keys = (list: AnyColumnConfig<Row>[]) => list.map((c) => c.accessorKey);

describe("composeCardRoles heuristic", () => {
  it("assigns title/badge/subtitle/metrics/meta by dataType and visible order", () => {
    const roles = composeCardRoles(columns);
    expect(roles.title?.accessorKey).toBe("sku");
    expect(roles.badge?.accessorKey).toBe("status");
    expect(keys(roles.subtitle)).toEqual(["product", "dept"]);
    // First 3 numerics in visible order; the 4th (discount) overflows to meta.
    expect(keys(roles.metrics)).toEqual(["revenue", "units", "margin"]);
    expect(keys(roles.meta)).toEqual(["discount", "restocked", "active"]);
  });

  it("every visible column lands in exactly one role", () => {
    const roles = composeCardRoles(columns);
    const all = [
      ...(roles.title ? [roles.title] : []),
      ...(roles.badge ? [roles.badge] : []),
      ...roles.subtitle,
      ...roles.metrics,
      ...roles.meta,
    ];
    expect(keys(all).sort()).toEqual(keys(columns).sort());
  });

  it("maxMetrics widens the metric cap", () => {
    const roles = composeCardRoles(columns, { maxMetrics: 4 });
    expect(keys(roles.metrics)).toEqual(["revenue", "units", "margin", "discount"]);
  });

  it("overrides claim their columns; the heuristic fills the rest without double-assigning", () => {
    const roles = composeCardRoles(columns, { title: "product", metrics: ["margin"] });
    expect(roles.title?.accessorKey).toBe("product");
    expect(keys(roles.metrics)).toEqual(["margin"]);
    // sku no longer wins title (product claimed it) — it flows to subtitle.
    expect(keys(roles.subtitle)).toEqual(["sku", "dept"]);
    // Unclaimed numerics overflow to meta, never duplicated.
    expect(keys(roles.meta)).toEqual(expect.arrayContaining(["revenue", "units", "discount"]));
    expect(keys(roles.meta)).not.toContain("margin");
  });

  it("an override naming a hidden/unknown column falls back to the heuristic", () => {
    const roles = composeCardRoles(columns, { title: "nope" as keyof Row & string });
    expect(roles.title?.accessorKey).toBe("sku");
  });

  it("with no text column, the first non-status column becomes the title", () => {
    const numericOnly = [col("status", "status"), col("revenue", "currency"), col("units", "number")];
    const roles = composeCardRoles(numericOnly);
    expect(roles.title?.accessorKey).toBe("revenue");
    expect(roles.badge?.accessorKey).toBe("status");
    expect(keys(roles.metrics)).toEqual(["units"]);
  });

  it("an explicit empty override array suppresses that role (it does not fall back)", () => {
    const roles = composeCardRoles(columns, { subtitle: [] });
    expect(roles.subtitle).toEqual([]);
    // The unclaimed text columns flow to meta instead of vanishing.
    expect(keys(roles.meta)).toEqual(expect.arrayContaining(["product", "dept"]));
  });
});
