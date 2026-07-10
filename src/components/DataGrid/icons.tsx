import type { ReactNode, SVGProps } from "react";

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

/** Local replacement for lucide-react's `LucideProps`: an svg element's props plus `size`. */
export type DgIconProps = Omit<SVGProps<SVGSVGElement>, "color"> & {
  size?: number | string;
  color?: string;
};

type IconProps = DgIconProps;

/** Renders a lucide-shaped 24x24 outline icon from raw `<path>`/`<circle>` children. */
const IconBase = ({
  size,
  color,
  strokeWidth,
  children,
  ...rest
}: IconProps & { children: ReactNode }) => (
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
    {...rest}
  >
    {children}
  </svg>
);

const decorativeProps = (props: IconProps): IconProps => ({
  size: "1em",
  strokeWidth: 1.8,
  "aria-hidden": true,
  focusable: false,
  ...props,
});

const ArrowDown = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M12 5v14" />
    <path d="m19 12-7 7-7-7" />
  </IconBase>
);

const ArrowUp = (props: IconProps) => (
  <IconBase {...props}>
    <path d="m5 12 7-7 7 7" />
    <path d="M12 19V5" />
  </IconBase>
);

const ArrowUpDown = (props: IconProps) => (
  <IconBase {...props}>
    <path d="m21 16-4 4-4-4" />
    <path d="M17 20V4" />
    <path d="m3 8 4-4 4 4" />
    <path d="M7 4v16" />
  </IconBase>
);

const ChevronDown = (props: IconProps) => (
  <IconBase {...props}>
    <path d="m6 9 6 6 6-6" />
  </IconBase>
);

const ChevronRight = (props: IconProps) => (
  <IconBase {...props}>
    <path d="m9 18 6-6-6-6" />
  </IconBase>
);

const ChevronUp = (props: IconProps) => (
  <IconBase {...props}>
    <path d="m18 15-6-6-6 6" />
  </IconBase>
);

const Funnel = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z" />
  </IconBase>
);

const GripVertical = (props: IconProps) => (
  <IconBase {...props}>
    <circle cx="9" cy="12" r="1" />
    <circle cx="9" cy="5" r="1" />
    <circle cx="9" cy="19" r="1" />
    <circle cx="15" cy="12" r="1" />
    <circle cx="15" cy="5" r="1" />
    <circle cx="15" cy="19" r="1" />
  </IconBase>
);

const Minus = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M5 12h14" />
  </IconBase>
);

const MoreVertical = (props: IconProps) => (
  <IconBase {...props}>
    <circle cx="12" cy="12" r="1" />
    <circle cx="12" cy="5" r="1" />
    <circle cx="12" cy="19" r="1" />
  </IconBase>
);

const Plus = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </IconBase>
);

const Search = (props: IconProps) => (
  <IconBase {...props}>
    <path d="m21 21-4.34-4.34" />
    <circle cx="11" cy="11" r="8" />
  </IconBase>
);

const SlidersHorizontal = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M10 5H3" />
    <path d="M12 19H3" />
    <path d="M14 3v4" />
    <path d="M16 17v4" />
    <path d="M21 12h-9" />
    <path d="M21 19h-5" />
    <path d="M21 5h-7" />
    <path d="M8 10v4" />
    <path d="M8 12H3" />
  </IconBase>
);

const X = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </IconBase>
);

export const ChevronDownIcon = (props: IconProps) => <ChevronDown {...decorativeProps(props)} />;

export const ChevronUpIcon = (props: IconProps) => <ChevronUp {...decorativeProps(props)} />;

export const ChevronRightIcon = (props: IconProps) => <ChevronRight {...decorativeProps(props)} />;

export const CloseIcon = (props: IconProps) => <X {...decorativeProps(props)} />;

export const PlusIcon = (props: IconProps) => <Plus {...decorativeProps(props)} />;

export const MinusIcon = (props: IconProps) => <Minus {...decorativeProps(props)} />;

export const MoreVerticalIcon = (props: IconProps) => <MoreVertical {...decorativeProps(props)} />;

export const SearchIcon = (props: IconProps) => <Search {...decorativeProps(props)} />;

export const FilterIcon = (props: IconProps) => <Funnel {...decorativeProps(props)} />;

export const GripIcon = (props: IconProps) => <GripVertical {...decorativeProps(props)} />;

export const SlidersIcon = (props: IconProps) => <SlidersHorizontal {...decorativeProps(props)} />;

export const SortIcon = ({ state }: { state: false | "asc" | "desc" }) => {
  const Icon = state === "asc" ? ArrowUp : state === "desc" ? ArrowDown : ArrowUpDown;

  return (
    <Icon
      size="1em"
      strokeWidth={1.8}
      aria-hidden="true"
      focusable="false"
      className="dg-sort-icon"
    />
  );
};
