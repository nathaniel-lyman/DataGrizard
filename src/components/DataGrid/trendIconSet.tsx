import type { ReactNode } from "react";
import type { GridIconSet } from "../../types/grid";
import type { DgIconProps } from "./icons";

/*
 * Icon paths below are reproduced from lucide-react v1.21.0
 * (https://lucide.dev), licensed under the ISC License:
 *
 * ISC License
 *
 * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022
 * as part of Feather (MIT). All other copyright (c) for Lucide are held by
 * Lucide Contributors 2022.
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */

const TrendIconBase = ({
  size,
  color,
  strokeWidth,
  children,
  ...rest
}: DgIconProps & { children: ReactNode }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size ?? 24}
    height={size ?? 24}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color ?? "currentColor"}
    strokeWidth={strokeWidth ?? 2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
    {...rest}
  >
    {children}
  </svg>
);

const TrendingUp = (props: DgIconProps) => (
  <TrendIconBase {...props}>
    <path d="M16 7h6v6" />
    <path d="m22 7-8.5 8.5-5-5L2 17" />
  </TrendIconBase>
);

const TrendingDown = (props: DgIconProps) => (
  <TrendIconBase {...props}>
    <path d="M16 17h6v-6" />
    <path d="m22 17-8.5-8.5-5 5L2 7" />
  </TrendIconBase>
);

const Minus = (props: DgIconProps) => (
  <TrendIconBase {...props}>
    <path d="M5 12h14" />
  </TrendIconBase>
);

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
 * A {@link GridIconSet} for the common up/flat/down case: renders a
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
