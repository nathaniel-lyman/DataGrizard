import { useEffect, useRef, useState, type RefObject } from "react";
import { ChevronDownIcon, FilterIcon } from "./icons";
import { FilterBody, formatOptionLabel } from "./filterBodies";

// Runtime descriptor for one column filter. Domain-neutral: built by DataGrid
// from the public GridFilterConfig + current filter value, and rendered in the
// column headers (grid mode) or a consolidated toolbar popover (pivot mode).
export type GridFilter = {
  id: string;
  label: string;
  filterType: "select" | "multiSelect" | "range" | "text" | "date";
  value: unknown;
  options: string[];
  formatOption?: (value: string) => string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  dateFormat?: Intl.DateTimeFormatOptions;
  presets?: boolean;
  onChange: (value: unknown) => void;
};

export const isFilterActive = (filter: GridFilter) => {
  const value = filter.value;
  if (value == null || value === "") {
    return false;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((bound) => bound != null && bound !== "");
  }
  return true;
};

// Outside-click + Escape dismissal shared by every filter popover.
const useDismiss = (
  open: boolean,
  close: () => void,
  containerRef: RefObject<HTMLElement | null>,
  triggerRef: RefObject<HTMLElement | null>,
) => {
  useEffect(() => {
    if (!open) {
      return;
    }
    const onDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        close();
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close, containerRef, triggerRef]);
};

const summarize = (filter: GridFilter) => {
  const format = filter.formatOption ?? formatOptionLabel;
  const value = filter.value;
  if (!isFilterActive(filter)) {
    return "All";
  }
  if (filter.filterType === "multiSelect" && Array.isArray(value)) {
    return `${value.length} selected`;
  }
  if (filter.filterType === "select" && typeof value === "string") {
    return format(value);
  }
  if (filter.filterType === "text" && typeof value === "string") {
    return `"${value}"`;
  }
  if (typeof value === "object" && value) {
    const bounds = value as { min?: number; max?: number; from?: string; to?: string };
    const lo = bounds.min ?? bounds.from ?? "";
    const hi = bounds.max ?? bounds.to ?? "";
    return `${lo || "…"} – ${hi || "…"}`;
  }
  return "Filtered";
};

// Trigger + popover. `variant="icon"` (column header) shows a funnel that turns
// solid when active; `variant="inline"` (floating row / pivot list) shows a
// labeled button summarizing the current value.
export const FilterPopover = ({
  filter,
  variant = "icon",
}: {
  filter: GridFilter;
  variant?: "icon" | "inline";
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const active = isFilterActive(filter);
  useDismiss(open, () => setOpen(false), containerRef, triggerRef);

  return (
    <div ref={containerRef} className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        aria-label={`${filter.label} filter`}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-active={active || undefined}
        onClick={() => setOpen((isOpen) => !isOpen)}
        className={
          variant === "icon"
            ? `flex h-6 w-6 items-center justify-center rounded transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 ${
                active ? "bg-slate-900 text-white" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              }`
            : `flex h-8 w-full items-center justify-between gap-2 rounded-md border px-2 text-xs font-medium normal-case tracking-normal transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 ${
                active ? "border-slate-400 bg-slate-50 text-slate-900" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`
        }
      >
        {variant === "icon" ? (
          <FilterIcon className="h-3.5 w-3.5" />
        ) : (
          <>
            <span className="truncate">{summarize(filter)}</span>
            <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          </>
        )}
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label={`${filter.label} filter`}
          className="absolute right-0 top-full z-30 mt-1 rounded-md border border-slate-200 bg-white p-2 text-left shadow-lg"
        >
          <FilterBody filter={filter} onClose={() => setOpen(false)} />
        </div>
      ) : null}
    </div>
  );
};

// Labeled inline filter, used inside the pivot-mode "Filters" popover list.
export const FilterField = ({ filter }: { filter: GridFilter }) => (
  <div className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
    {filter.label}
    <span className="normal-case tracking-normal">
      <FilterPopover filter={filter} variant="inline" />
    </span>
  </div>
);

// Consolidated "Filters" popover for pivot mode, where there are no leaf data
// columns to host per-column header filters.
export const FiltersPopover = ({ filters }: { filters: GridFilter[] }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const activeCount = filters.filter(isFilterActive).length;
  useDismiss(open, () => setOpen(false), containerRef, triggerRef);

  return (
    <div
      ref={containerRef}
      className="relative flex min-w-36 flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-slate-500"
    >
      Filters
      <button
        ref={triggerRef}
        type="button"
        aria-label="Filters"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((isOpen) => !isOpen)}
        className="flex h-8 items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium normal-case tracking-normal text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
      >
        <span>{activeCount ? `${activeCount} active` : "All"}</span>
        <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Filters"
          className="absolute left-0 top-full z-30 mt-1 flex w-64 flex-col gap-3 rounded-md border border-slate-200 bg-white p-3 shadow-lg"
        >
          {filters.map((filter) => (
            <FilterField key={filter.id} filter={filter} />
          ))}
        </div>
      ) : null}
    </div>
  );
};
