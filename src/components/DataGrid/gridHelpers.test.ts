import { describe, expect, it } from "vitest";
import { columnNumericExtent } from "./gridHelpers";

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
});
