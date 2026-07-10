import type { GridColorScale, GridDataBar } from "../../types/grid";

// Pure, React-free helpers backing the value-driven cell visual effects.
// Kept separate from cellEffects.tsx so the math is unit-testable in isolation.

export type NumericDomain = { min: number; max: number };

type Rgb = { r: number; g: number; b: number };

const clamp = (value: number, lo: number, hi: number) => Math.min(Math.max(value, lo), hi);

// Number(null) and Number("") are both 0, which would wrongly style blank cells.
// Treat null/undefined/empty string as non-numeric (NaN) instead.
const toNumber = (value: unknown): number => {
  if (value == null || value === "") {
    return NaN;
  }
  return Number(value);
};

/** Parse #rgb / #rrggbb (and rgb()/rgba()) into channels. Returns null if unparseable. */
export const parseColor = (input: string): Rgb | null => {
  const value = input.trim();
  const hex = value.replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    return {
      r: parseInt(hex[0] + hex[0], 16),
      g: parseInt(hex[1] + hex[1], 16),
      b: parseInt(hex[2] + hex[2], 16),
    };
  }
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }
  const rgb = value.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (rgb) {
    return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
  }
  return null;
};

const toRgbString = ({ r, g, b }: Rgb) =>
  `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;

/** Linearly interpolate between two colors. `t` is clamped to [0, 1]. */
export const interpolateColor = (from: string, to: string, t: number): string => {
  const a = parseColor(from);
  const b = parseColor(to);
  if (!a || !b) {
    return from;
  }
  const k = clamp(t, 0, 1);
  return toRgbString({
    r: a.r + (b.r - a.r) * k,
    g: a.g + (b.g - a.g) * k,
    b: a.b + (b.b - a.b) * k,
  });
};

const srgbChannelToLinear = (channel: number): number => {
  const normalized = channel / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : Math.pow((normalized + 0.055) / 1.055, 2.4);
};

/** WCAG relative luminance (linearized sRGB), used for contrast-ratio math. */
const relativeLuminance = ({ r, g, b }: Rgb): number =>
  0.2126 * srgbChannelToLinear(r) + 0.7152 * srgbChannelToLinear(g) + 0.0722 * srgbChannelToLinear(b);

/** WCAG contrast ratio between two relative luminances (always ≥ 1). */
const contrastRatio = (a: number, b: number): number => {
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
};

const DARK_TEXT = "#0f172a";
const LIGHT_TEXT = "#f8fafc";
const DARK_TEXT_LUMINANCE = relativeLuminance({ r: 15, g: 23, b: 42 });
const LIGHT_TEXT_LUMINANCE = relativeLuminance({ r: 248, g: 250, b: 252 });

/**
 * WCAG contrast-ratio pick of a readable foreground (--dg-text vs. an
 * off-white) for a given background. Picking by perceived luminance alone
 * (a 0-1 threshold) flips to white far too early on mid-tone backgrounds —
 * e.g. a mid-ramp emerald passes ~2:1 contrast with white text (fails the
 * 4.5:1 WCAG minimum) while dark text on the same background clears ~8:1.
 */
export const getReadableTextColor = (background: string): string => {
  const rgb = parseColor(background);
  if (!rgb) {
    return DARK_TEXT;
  }
  const bgLuminance = relativeLuminance(rgb);
  const contrastWithDark = contrastRatio(bgLuminance, DARK_TEXT_LUMINANCE);
  const contrastWithLight = contrastRatio(bgLuminance, LIGHT_TEXT_LUMINANCE);
  return contrastWithDark >= contrastWithLight ? DARK_TEXT : LIGHT_TEXT;
};

const resolveScaleDomain = (
  scale: GridColorScale,
  auto: NumericDomain | undefined,
): { min: number; mid: number; max: number } => {
  const fallbackMin = auto?.min ?? 0;
  const fallbackMax = auto?.max ?? 1;
  let min = fallbackMin;
  let max = fallbackMax;
  let mid: number | undefined;
  if (Array.isArray(scale.domain)) {
    [min, max] = scale.domain;
  } else if (scale.domain) {
    min = scale.domain.min ?? fallbackMin;
    max = scale.domain.max ?? fallbackMax;
    mid = scale.domain.mid;
  }
  return { min, max, mid: mid ?? (min + max) / 2 };
};

export type ColorScaleResult = { backgroundColor: string; color?: string };

/**
 * Background (and optional readable text) color for a value under a color scale.
 * 2-color scales interpolate min→max; 3-color scales diverge through the midpoint.
 * Returns null for non-finite values (blank cells stay unstyled).
 */
export const colorScaleStyle = (
  value: unknown,
  scale: GridColorScale,
  auto: NumericDomain | undefined,
): ColorScaleResult | null => {
  const numeric = toNumber(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  const { min, mid, max } = resolveScaleDomain(scale, auto);
  let backgroundColor: string;
  if (scale.colors.length === 3) {
    const [low, middle, high] = scale.colors;
    if (numeric <= mid) {
      const span = mid - min;
      backgroundColor = interpolateColor(low, middle, span === 0 ? 1 : (numeric - min) / span);
    } else {
      const span = max - mid;
      backgroundColor = interpolateColor(middle, high, span === 0 ? 0 : (numeric - mid) / span);
    }
  } else {
    const [low, high] = scale.colors;
    const span = max - min;
    backgroundColor = interpolateColor(low, high, span === 0 ? 0.5 : (numeric - min) / span);
  }
  const result: ColorScaleResult = { backgroundColor };
  if (scale.autoTextColor !== false) {
    result.color = getReadableTextColor(backgroundColor);
  }
  return result;
};

export type BarGeometry = { leftPct: number; widthPct: number; negative: boolean };

const resolveBarDomain = (bar: GridDataBar, auto: NumericDomain | undefined): NumericDomain => {
  if (bar.domain) {
    return { min: bar.domain[0], max: bar.domain[1] };
  }
  return { min: auto?.min ?? 0, max: auto?.max ?? 1 };
};

/**
 * Geometry for a data bar. Anchors at zero: a non-negative domain grows from the
 * left; a domain spanning zero grows from a center baseline (positive right,
 * negative left). Returns null for non-finite values or a degenerate domain.
 */
export const computeBarGeometry = (
  value: unknown,
  bar: GridDataBar,
  auto: NumericDomain | undefined,
): BarGeometry | null => {
  const numeric = toNumber(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  const { min, max } = resolveBarDomain(bar, auto);
  const lo = Math.min(0, min);
  const hi = Math.max(0, max);
  const range = hi - lo;
  if (range <= 0) {
    return null;
  }
  const pct = (x: number) => ((clamp(x, lo, hi) - lo) / range) * 100;
  const baseline = pct(0);
  const here = pct(numeric);
  const leftPct = Math.min(baseline, here);
  const widthPct = Math.abs(here - baseline);
  return { leftPct, widthPct, negative: numeric < 0 };
};

export type FlashDirection = "up" | "down" | "neutral";

/** Direction of a value change: numeric comparison, else neutral. */
export const flashDirection = (previous: unknown, next: unknown): FlashDirection => {
  const a = toNumber(previous);
  const b = toNumber(next);
  if (Number.isFinite(a) && Number.isFinite(b)) {
    if (b > a) return "up";
    if (b < a) return "down";
    return "neutral";
  }
  return "neutral";
};

/** Min/max of a numeric field across rows. Returns null when no finite values exist. */
export const computeColumnDomain = <TData>(
  rows: TData[],
  accessorKey: keyof TData,
): NumericDomain | null => {
  let min = Infinity;
  let max = -Infinity;
  for (const row of rows) {
    const numeric = toNumber(row[accessorKey]);
    if (Number.isFinite(numeric)) {
      if (numeric < min) min = numeric;
      if (numeric > max) max = numeric;
    }
  }
  if (min === Infinity) {
    return null;
  }
  return { min, max };
};
