import { describe, expect, it } from "vitest";
import {
  colorScaleStyle,
  computeBarGeometry,
  computeColumnDomain,
  flashDirection,
  getReadableTextColor,
  interpolateColor,
  parseColor,
} from "./cellEffects";

describe("parseColor", () => {
  it("parses #rgb, #rrggbb and rgb()", () => {
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseColor("#000000")).toEqual({ r: 0, g: 0, b: 0 });
    expect(parseColor("rgb(10, 20, 30)")).toEqual({ r: 10, g: 20, b: 30 });
    expect(parseColor("nope")).toBeNull();
  });
});

describe("interpolateColor", () => {
  it("returns endpoints at t=0 and t=1", () => {
    expect(interpolateColor("#000000", "#ffffff", 0)).toBe("rgb(0, 0, 0)");
    expect(interpolateColor("#000000", "#ffffff", 1)).toBe("rgb(255, 255, 255)");
  });
  it("returns the midpoint at t=0.5 and clamps out-of-range t", () => {
    expect(interpolateColor("#000000", "#ffffff", 0.5)).toBe("rgb(128, 128, 128)");
    expect(interpolateColor("#000000", "#ffffff", 2)).toBe("rgb(255, 255, 255)");
    expect(interpolateColor("#000000", "#ffffff", -1)).toBe("rgb(0, 0, 0)");
  });
});

describe("getReadableTextColor", () => {
  it("picks dark text on light backgrounds and light text on dark", () => {
    expect(getReadableTextColor("#ffffff")).toBe("#0f172a");
    expect(getReadableTextColor("#000000")).toBe("#f8fafc");
  });
});

describe("colorScaleStyle", () => {
  const auto = { min: 0, max: 100 };
  it("interpolates a 2-color scale across the domain", () => {
    expect(colorScaleStyle(0, { colors: ["#000000", "#ffffff"] }, auto)?.backgroundColor).toBe(
      "rgb(0, 0, 0)",
    );
    expect(colorScaleStyle(100, { colors: ["#000000", "#ffffff"] }, auto)?.backgroundColor).toBe(
      "rgb(255, 255, 255)",
    );
    expect(colorScaleStyle(50, { colors: ["#000000", "#ffffff"] }, auto)?.backgroundColor).toBe(
      "rgb(128, 128, 128)",
    );
  });
  it("diverges a 3-color scale through the midpoint", () => {
    const scale = { colors: ["#ff0000", "#ffffff", "#00ff00"] as [string, string, string] };
    expect(colorScaleStyle(-10, scale, { min: -10, max: 10 })?.backgroundColor).toBe("rgb(255, 0, 0)");
    expect(colorScaleStyle(0, scale, { min: -10, max: 10 })?.backgroundColor).toBe("rgb(255, 255, 255)");
    expect(colorScaleStyle(10, scale, { min: -10, max: 10 })?.backgroundColor).toBe("rgb(0, 255, 0)");
  });
  it("adds a readable text color unless disabled", () => {
    expect(colorScaleStyle(100, { colors: ["#000000", "#000000"] }, auto)?.color).toBe("#f8fafc");
    expect(
      colorScaleStyle(100, { colors: ["#000000", "#000000"], autoTextColor: false }, auto)?.color,
    ).toBeUndefined();
  });
  it("ignores non-finite values", () => {
    expect(colorScaleStyle(null, { colors: ["#000", "#fff"] }, auto)).toBeNull();
    expect(colorScaleStyle("abc", { colors: ["#000", "#fff"] }, auto)).toBeNull();
  });
  it("honors an explicit domain over the auto domain", () => {
    expect(
      colorScaleStyle(50, { colors: ["#000000", "#ffffff"], domain: [0, 50] }, { min: 0, max: 1000 })
        ?.backgroundColor,
    ).toBe("rgb(255, 255, 255)");
  });
});

describe("computeBarGeometry", () => {
  it("grows from the left for a non-negative domain", () => {
    const auto = { min: 0, max: 100 };
    expect(computeBarGeometry(0, {}, auto)).toEqual({ leftPct: 0, widthPct: 0, negative: false });
    expect(computeBarGeometry(50, {}, auto)).toEqual({ leftPct: 0, widthPct: 50, negative: false });
    expect(computeBarGeometry(100, {}, auto)).toEqual({ leftPct: 0, widthPct: 100, negative: false });
  });
  it("uses a center baseline when the domain spans zero", () => {
    const auto = { min: -100, max: 100 };
    expect(computeBarGeometry(100, {}, auto)).toEqual({ leftPct: 50, widthPct: 50, negative: false });
    const neg = computeBarGeometry(-100, {}, auto);
    expect(neg?.negative).toBe(true);
    expect(neg?.leftPct).toBe(0);
    expect(neg?.widthPct).toBe(50);
  });
  it("clamps values outside the domain", () => {
    expect(computeBarGeometry(200, {}, { min: 0, max: 100 })?.widthPct).toBe(100);
  });
  it("returns null for non-finite values or a degenerate domain", () => {
    expect(computeBarGeometry(null, {}, { min: 0, max: 100 })).toBeNull();
    expect(computeBarGeometry(5, {}, { min: 0, max: 0 })).toBeNull();
  });
});

describe("flashDirection", () => {
  it("compares numerics and falls back to neutral", () => {
    expect(flashDirection(1, 2)).toBe("up");
    expect(flashDirection(2, 1)).toBe("down");
    expect(flashDirection(2, 2)).toBe("neutral");
    expect(flashDirection("a", "b")).toBe("neutral");
  });
});

describe("computeColumnDomain", () => {
  it("finds the numeric min/max and ignores blanks", () => {
    const rows = [{ v: 5 }, { v: 1 }, { v: null }, { v: 9 }, { v: "x" }];
    expect(computeColumnDomain(rows, "v")).toEqual({ min: 1, max: 9 });
  });
  it("returns null when there are no finite values", () => {
    expect(computeColumnDomain([{ v: null }, { v: "x" }], "v")).toBeNull();
  });
});
