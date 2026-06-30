import { describe, expect, it } from "vitest";
import { columnNumericExtent, reconcileColumnOrder } from "./gridHelpers";

describe("columnNumericExtent", () => {
  it("returns min/max over finite numeric cells", () => {
    const data = [{ n: 5 }, { n: -2 }, { n: 10 }];
    expect(columnNumericExtent(data, "n")).toEqual({ min: -2, max: 10 });
  });

  it("ignores non-finite/blank cells", () => {
    const data = [{ n: 5 }, { n: Number.NaN }, { n: null }, { n: 3 }] as { n: number }[];
    expect(columnNumericExtent(data, "n")).toEqual({ min: 3, max: 5 });
  });

  it("returns null when no finite values exist", () => {
    expect(columnNumericExtent([{ n: null }] as unknown as { n: number }[], "n")).toBeNull();
    expect(columnNumericExtent([], "n" as never)).toBeNull();
  });

  it("preserves legitimate zero values", () => {
    expect(columnNumericExtent([{ n: 0 }, { n: 5 }], "n")).toEqual({ min: 0, max: 5 });
  });

  it("ignores empty-string cells", () => {
    expect(
      columnNumericExtent([{ n: "" }, { n: 4 }] as unknown as { n: number }[], "n"),
    ).toEqual({ min: 4, max: 4 });
  });
});

describe("reconcileColumnOrder", () => {
  it("preserves valid order, drops stale ids, dedupes, and appends new defaults", () => {
    expect(
      reconcileColumnOrder(
        ["revenue", "old", "product", "revenue"],
        ["select", "product", "revenue", "units"],
      ),
    ).toEqual(["revenue", "product", "select", "units"]);
  });

  it("falls back to default order when every persisted id is stale", () => {
    expect(reconcileColumnOrder(["old-a", "old-b"], ["product", "revenue"])).toEqual([
      "product",
      "revenue",
    ]);
  });
});
