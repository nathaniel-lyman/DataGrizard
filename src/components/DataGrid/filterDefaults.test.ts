import { describe, expect, it } from "vitest";
import { defaultFilterTypeForDataType, resolveFilterType } from "./filterDefaults";

describe("defaultFilterTypeForDataType", () => {
  it("maps each dataType to a sensible default control", () => {
    expect(defaultFilterTypeForDataType("text")).toBe("text");
    expect(defaultFilterTypeForDataType("number")).toBe("range");
    expect(defaultFilterTypeForDataType("currency")).toBe("range");
    expect(defaultFilterTypeForDataType("percent")).toBe("range");
    expect(defaultFilterTypeForDataType("date")).toBe("date");
    expect(defaultFilterTypeForDataType("status")).toBe("multiSelect");
    expect(defaultFilterTypeForDataType("boolean")).toBe("boolean");
  });
});

describe("resolveFilterType", () => {
  const base = { isServerMode: false, facetThreshold: 12, hasStaticOptions: false };

  it("auto-facets low-cardinality text into multiSelect", () => {
    expect(resolveFilterType({ ...base, dataType: "text", distinctCount: 6 })).toBe("multiSelect");
  });

  it("keeps high-cardinality text as free-text contains", () => {
    expect(resolveFilterType({ ...base, dataType: "text", distinctCount: 13 })).toBe("text");
  });

  it("treats the threshold as inclusive (<=)", () => {
    expect(resolveFilterType({ ...base, dataType: "text", distinctCount: 12 })).toBe("multiSelect");
  });

  it("upgrades text to multiSelect when static options are supplied", () => {
    expect(
      resolveFilterType({ ...base, dataType: "text", distinctCount: 999, hasStaticOptions: true }),
    ).toBe("multiSelect");
  });

  it("falls back to free-text in server mode (cannot facet from one page)", () => {
    expect(
      resolveFilterType({ ...base, dataType: "text", distinctCount: undefined, isServerMode: true }),
    ).toBe("text");
  });

  it("still facets text in server mode when static options exist", () => {
    expect(
      resolveFilterType({ ...base, dataType: "text", isServerMode: true, hasStaticOptions: true }),
    ).toBe("multiSelect");
  });

  it("always makes status multiSelect regardless of cardinality", () => {
    expect(resolveFilterType({ ...base, dataType: "status", distinctCount: 999 })).toBe("multiSelect");
  });

  it("uses the dataType default for non-text/status types", () => {
    expect(resolveFilterType({ ...base, dataType: "number", distinctCount: 3 })).toBe("range");
    expect(resolveFilterType({ ...base, dataType: "date" })).toBe("date");
    expect(resolveFilterType({ ...base, dataType: "boolean" })).toBe("boolean");
  });
});
