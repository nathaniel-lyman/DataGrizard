import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { GridIconSet } from "../../types/grid";

export type TrendIconSetOptions = {
  /** Icon color for values above the threshold. Default green. */
  positiveColor?: string;
  /** Icon color for values below the threshold. Default red. */
  negativeColor?: string;
  /** Icon color for values at the threshold. Default amber. */
  neutralColor?: string;
  /** Comparison point separating up from down. Default 0. */
  threshold?: number;
  /** Icon size in px. Default 14. */
  size?: number;
};

const toFinite = (value: unknown): number =>
  value == null || value === "" ? NaN : Number(value);

/**
 * A lucide-backed {@link GridIconSet} for the common up/flat/down case: renders a
 * trend arrow colored by whether the value sits above, below, or at `threshold`.
 * Everything is overridable; pass your own `iconSet` for full control.
 */
export const trendIconSet = <TData,>(options: TrendIconSetOptions = {}): GridIconSet<number, TData> => {
  const threshold = options.threshold ?? 0;
  const size = options.size ?? 14;
  const positiveColor = options.positiveColor ?? "#16a34a";
  const negativeColor = options.negativeColor ?? "#dc2626";
  const neutralColor = options.neutralColor ?? "#ca8a04";
  return {
    rules: [
      {
        when: (value) => {
          const numeric = toFinite(value);
          return Number.isFinite(numeric) && numeric > threshold;
        },
        icon: <TrendingUp size={size} color={positiveColor} />,
      },
      {
        when: (value) => {
          const numeric = toFinite(value);
          return Number.isFinite(numeric) && numeric < threshold;
        },
        icon: <TrendingDown size={size} color={negativeColor} />,
      },
      {
        when: (value) => Number.isFinite(toFinite(value)),
        icon: <Minus size={size} color={neutralColor} />,
      },
    ],
  };
};
