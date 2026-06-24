import type { SVGProps } from "react";

// Small, dependency-free inline icons. All are decorative by default
// (aria-hidden) — the interactive control that wraps them carries the
// accessible name via aria-label / text.
type IconProps = SVGProps<SVGSVGElement>;

const base = (props: IconProps) => ({
  viewBox: "0 0 16 16",
  width: "1em",
  height: "1em",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
  ...props,
});

export const ChevronDownIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M4 6l4 4 4-4" />
  </svg>
);

export const ChevronUpIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M4 10l4-4 4 4" />
  </svg>
);

export const ChevronRightIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M6 4l4 4-4 4" />
  </svg>
);

export const CloseIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
);

export const PlusIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M8 3.5v9M3.5 8h9" />
  </svg>
);

export const MinusIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M3.5 8h9" />
  </svg>
);

export const SearchIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <circle cx="7" cy="7" r="3.5" />
    <path d="M10 10l3 3" />
  </svg>
);

export const GripIcon = (props: IconProps) => (
  <svg {...base({ strokeWidth: 0, fill: "currentColor", ...props })}>
    <circle cx="6" cy="4" r="1" />
    <circle cx="10" cy="4" r="1" />
    <circle cx="6" cy="8" r="1" />
    <circle cx="10" cy="8" r="1" />
    <circle cx="6" cy="12" r="1" />
    <circle cx="10" cy="12" r="1" />
  </svg>
);

export const SortIcon = ({ state }: { state: false | "asc" | "desc" }) => (
  <svg
    aria-hidden="true"
    focusable="false"
    viewBox="0 0 12 12"
    className="ml-auto h-3 w-3 shrink-0 text-slate-400"
    fill="none"
  >
    {state === "asc" ? (
      <path d="M6 2.5 3.5 5h5L6 2.5Z" fill="currentColor" />
    ) : state === "desc" ? (
      <path d="M6 9.5 8.5 7h-5L6 9.5Z" fill="currentColor" />
    ) : (
      <>
        <path d="M6 2.5 3.5 5h5L6 2.5Z" fill="currentColor" opacity="0.55" />
        <path d="M6 9.5 8.5 7h-5L6 9.5Z" fill="currentColor" opacity="0.55" />
      </>
    )}
  </svg>
);
