import { describe, expect, it } from "vitest";
import { weightedMarginRate, type RetailItem } from "./mockRetailData";

const row = (sales: number, marginRate: number): RetailItem => ({
  item_id: `${sales}-${marginRate}`,
  item_name: "Test item",
  department: "Grocery",
  category: "Produce",
  brand: "Test brand",
  sales,
  units: 1,
  margin_rate: marginRate,
  price_gap: 0,
  recommendation_status: "approved",
  last_restocked_at: "2026-01-01",
  on_promotion: false,
});

describe("weightedMarginRate", () => {
  it("weights row margin rates by sales instead of averaging percentages", () => {
    expect(weightedMarginRate([
      row(900, 0.1),
      row(100, 0.9),
    ])).toBeCloseTo(0.18);
  });

  it("returns null when the group has no sales", () => {
    expect(weightedMarginRate([row(0, 0.5)])).toBeNull();
  });
});
