import { describe, expect, it } from "vitest";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatSignedPercent,
  formatStatusLabel,
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
});
