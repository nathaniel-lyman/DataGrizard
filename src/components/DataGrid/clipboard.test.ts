import { describe, expect, it } from "vitest";
import { normalizeClipboardInput, parseClipboardTsv } from "./clipboard";

describe("parseClipboardTsv", () => {
  it("parses quoted tabs, escaped quotes, embedded newlines, and CRLF", () => {
    expect(parseClipboardTsv('"Alpha\tBeta"\t"Said ""hi"""\r\n"Line 1\nLine 2"\t42\r\n')).toEqual([
      ["Alpha\tBeta", 'Said "hi"'],
      ["Line 1\nLine 2", "42"],
    ]);
  });

  it("preserves empty cells without adding a phantom terminal row", () => {
    expect(parseClipboardTsv("A\t\n\tB\n")).toEqual([
      ["A", ""],
      ["", "B"],
    ]);
  });
});

describe("normalizeClipboardInput", () => {
  it("normalizes formatted numbers, currency, percentages, and accounting negatives", () => {
    expect(normalizeClipboardInput("$1,200", "currency", "en-US")).toBe("1200");
    expect(normalizeClipboardInput("12.5%", "percent", "en-US")).toBe("0.125");
    expect(normalizeClipboardInput("(€1.234,50)", "currency", "de-DE")).toBe("-1234.5");
  });

  it("normalizes common spreadsheet boolean labels", () => {
    expect(normalizeClipboardInput("Yes", "boolean", "en-US")).toBe("true");
    expect(normalizeClipboardInput("0", "boolean", "en-US")).toBe("false");
  });
});
