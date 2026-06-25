import { describe, expect, it } from "vitest";
import {
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
  formatSignedPercent,
  formatStatusLabel,
  toDate,
} from "./formatters";

describe("formatters", () => {
  it("formats currency with no fraction digits", () => {
    expect(formatCurrency(1200)).toBe("$1,200");
  });

  it("formats whole numbers with grouping", () => {
    expect(formatNumber(4200)).toBe("4,200");
  });

  it("formats a percent to one decimal place", () => {
    expect(formatPercent(0.123)).toBe("12.3%");
  });

  it("title-cases underscored status labels", () => {
    expect(formatStatusLabel("in_progress")).toBe("In Progress");
  });

  describe("formatSignedPercent", () => {
    it("prefixes a plus sign for positive magnitudes", () => {
      expect(formatSignedPercent(0.123)).toBe("+12.3%");
    });

    it("prefixes a minus sign for negative magnitudes", () => {
      expect(formatSignedPercent(-0.123)).toBe("-12.3%");
    });

    it("renders an unsigned zero for exact zero", () => {
      expect(formatSignedPercent(0)).toBe("0.0%");
    });

    it("does not render '-0.0%' for tiny negatives that round to zero", () => {
      expect(formatSignedPercent(-0.0003)).toBe("0.0%");
    });

    it("does not render '+0.0%' for tiny positives that round to zero", () => {
      expect(formatSignedPercent(0.0003)).toBe("0.0%");
    });
  });

  describe("toDate", () => {
    it("parses Date, ISO string, and epoch ms", () => {
      expect(toDate(new Date(2026, 5, 24))?.getFullYear()).toBe(2026);
      expect(toDate("2026-06-24")?.getMonth()).toBe(5); // June
      const epoch = new Date(2026, 5, 24).getTime();
      expect(toDate(epoch)?.getTime()).toBe(epoch);
    });

    it("returns null for blank/unparseable input", () => {
      expect(toDate("")).toBeNull();
      expect(toDate(null)).toBeNull();
      expect(toDate(undefined)).toBeNull();
      expect(toDate("not-a-date")).toBeNull();
    });

    it("parses a date-only ISO string as local midnight (no day shift)", () => {
      const d = toDate("2026-06-24")!;
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(5);
      expect(d.getDate()).toBe(24);
      expect(d.getHours()).toBe(0);
    });
  });

  describe("formatDate", () => {
    it("formats with the default medium style", () => {
      expect(formatDate("2026-06-24", { locale: "en-US" })).toBe("Jun 24, 2026");
    });

    it("honors a per-call dateFormat", () => {
      expect(
        formatDate("2026-06-24", {
          locale: "en-US",
          dateFormat: { year: "numeric", month: "2-digit", day: "2-digit" },
        }),
      ).toBe("06/24/2026");
    });

    it("returns empty string for unparseable input", () => {
      expect(formatDate("nope", { locale: "en-US" })).toBe("");
      expect(formatDate(null, { locale: "en-US" })).toBe("");
    });
  });
});
