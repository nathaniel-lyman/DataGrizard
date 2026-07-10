import type { ReactNode } from "react";
import type { GridIconSet, GridProgressBar } from "../../types/grid";
import { formatPercent, type FormatOptions } from "../../utils/formatters";
import type { BarGeometry, FlashDirection } from "./cellEffects";

const clampPct = (value: number) => Math.min(Math.max(value, 0), 100);

/**
 * Renders a `percent` cell as a 0–100% progress bar. Domain defaults to [0, 1]
 * (the fraction convention used by the formatters). Blank/non-finite → empty.
 * The label sits beside the track, not centered over the fill, so it never
 * straddles the fill/track edge at mid-range values.
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
    <div className="dg-progress-row">
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="dg-progress"
      >
        <div
          className="dg-progress-fill"
          style={{ width: `${pct}%`, background: options.color ?? "var(--dg-progress-fill)" }}
        />
      </div>
      {showLabel ? (
        <span className="dg-progress-label">{formatPercent(numeric, formatOptions)}</span>
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
    <span className={`dg-icon ${rule.className ?? ""}`} aria-hidden="true">
      {rule.icon}
    </span>
  );
  if (position === "only") {
    return icon;
  }
  return (
    <span className="dg-icon-value">
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
    className="dg-databar"
    style={{
      left: `${geometry.leftPct}%`,
      width: `${geometry.widthPct}%`,
      background: geometry.negative
        ? negativeColor ?? "var(--dg-data-bar-negative)"
        : color ?? "var(--dg-data-bar)",
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
    className={`dg-flash dg-flash-${direction} dg-flash-overlay ${className ?? ""}`}
    style={duration ? { animationDuration: `${duration}ms` } : undefined}
  />
);
