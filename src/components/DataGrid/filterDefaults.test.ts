import { describe, expect, it } from "vitest";
import { defaultFilterTypeForDataType } from "./filterDefaults";

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
