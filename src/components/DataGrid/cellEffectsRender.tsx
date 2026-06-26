import type { ReactNode } from "react";
import type { GridIconSet, GridProgressBar } from "../../types/grid";
import { formatPercent, type FormatOptions } from "../../utils/formatters";
import type { BarGeometry, FlashDirection } from "./cellEffects";

const clampPct = (value: number) => Math.min(Math.max(value, 0), 100);

/**
 * Renders a `percent` cell as a 0–100% progress bar. Domain defaults to [0, 1]
 * (the fraction convention used by the formatters). Blank/non-finite → empty.
 */
export const renderProgressBar = (
  value: unknown,
  config: boolean | GridProgressBar,
  formatOptions: FormatOptions,
): ReactNode => {
  const numeric = value == null || value === "" ? NaN : Number(value);
  if (!Number.isFinite(numeric)) {
    return "";
  }
  const options = typeof config === "object" ? config : {};
  const [min, max] = options.domain ?? [0, 1];
  const span = max - min;
  const pct = clampPct(span === 0 ? 0 : ((numeric - min) / span) * 100);
  const showLabel = options.showLabel !== false;
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="dg-progress relative h-4 w-full min-w-[64px] overflow-hidden rounded-full bg-slate-100"
    >
      <div
        className="dg-progress-fill absolute inset-y-0 left-0 rounded-full"
        style={{ width: `${pct}%`, background: options.color ?? "#10b981" }}
      />
      {showLabel ? (
        <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-slate-900">
          {formatPercent(numeric, formatOptions)}
        </span>
      ) : null}
    </div>
  );
};

/** Wraps a formatted value with an icon chosen by the first matching rule. */
export const renderIconSet = <TData,>(
  base: ReactNode,
  value: unknown,
  row: TData,
  iconSet: GridIconSet<unknown, TData>,
): ReactNode => {
  const rule = iconSet.rules.find((candidate) => candidate.when(value, row));
  if (!rule) {
    return base;
  }
  const position = iconSet.position ?? "before";
  const icon = (
    <span className={`dg-icon inline-flex items-center ${rule.className ?? ""}`} aria-hidden="true">
      {rule.icon}
    </span>
  );
  if (position === "only") {
    return icon;
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      {position === "before" ? icon : null}
      <span>{base}</span>
      {position === "after" ? icon : null}
    </span>
  );
};

/** The bar fill drawn behind a cell's value (data-bar effect). */
export const DataBarFill = ({
  geometry,
  color,
  negativeColor,
}: {
  geometry: BarGeometry;
  color?: string;
  negativeColor?: string;
}) => (
  <span
    aria-hidden="true"
    className="dg-databar pointer-events-none absolute inset-y-1 z-0 rounded-sm opacity-50"
    style={{
      left: `${geometry.leftPct}%`,
      width: `${geometry.widthPct}%`,
      background: geometry.negative ? negativeColor ?? "#f87171" : color ?? "#60a5fa",
    }}
  />
);

/** One-shot flash overlay; remounted via a changing `key` to restart the animation. */
export const FlashOverlay = ({
  direction,
  className,
  duration,
}: {
  direction: FlashDirection;
  className?: string;
  duration?: number;
}) => (
  <span
    aria-hidden="true"
    className={`dg-flash dg-flash-${direction} pointer-events-none absolute inset-0 z-0 ${className ?? ""}`}
    style={duration ? { animationDuration: `${duration}ms` } : undefined}
  />
);
