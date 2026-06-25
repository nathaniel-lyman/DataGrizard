import { describe, expect, it } from "vitest";
import { toCsv, toTsv } from "./export";

describe("export delimited text", () => {
  it("joins rows and columns as CSV", () => {
    expect(toCsv([["a", "b"], ["1", "2"]])).toBe("a,b\r\n1,2");
  });

  it("quotes fields containing the delimiter, quotes, or newlines", () => {
    expect(toCsv([["a,b", 'c"d', "e\nf"]])).toBe('"a,b","c""d","e\nf"');
  });

  it("does not quote plain fields", () => {
    expect(toCsv([["plain", "value"]])).toBe("plain,value");
  });

  it("uses tabs for TSV and quotes tab-containing fields", () => {
    expect(toTsv([["a", "b"], ["1", "2"]])).toBe("a\tb\r\n1\t2");
    expect(toTsv([["a\tb"]])).toBe('"a\tb"');
  });
});
