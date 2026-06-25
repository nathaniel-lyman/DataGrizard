import { useEffect, useRef, useState, type RefObject } from "react";
import { ChevronDownIcon, FilterIcon } from "./icons";

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

const formatOptionLabel = (option: string) =>
  option
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

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

const inputClass =
  "h-8 rounded-md border border-slate-300 bg-white px-2 text-xs font-medium text-slate-800 outline-none transition focus-visible:border-slate-500 focus-visible:ring-2 focus-visible:ring-slate-300";

const SelectBody = ({ filter, onClose }: { filter: GridFilter; onClose: () => void }) => {
  const selected = typeof filter.value === "string" ? filter.value : "";
  const format = filter.formatOption ?? formatOptionLabel;
  const choose = (value: string) => {
    filter.onChange(value || undefined);
    onClose();
  };
  return (
    <div role="listbox" aria-label={`${filter.label} options`} className="max-h-64 w-56 overflow-auto">
      <button
        type="button"
        role="option"
        aria-selected={selected === ""}
        onClick={() => choose("")}
        className={`flex h-8 w-full items-center rounded px-2 text-left text-xs font-medium ${
          selected === "" ? "bg-slate-900 text-white" : "text-slate-800 hover:bg-slate-50"
        }`}
      >
        All
      </button>
      {filter.options.map((option) => (
        <button
          key={option}
          type="button"
          role="option"
          aria-selected={selected === option}
          onClick={() => choose(option)}
          className={`flex h-8 w-full items-center rounded px-2 text-left text-xs font-medium ${
            selected === option ? "bg-slate-900 text-white" : "text-slate-800 hover:bg-slate-50"
          }`}
        >
          <span className="truncate">{format(option)}</span>
        </button>
      ))}
    </div>
  );
};

const MultiSelectBody = ({ filter }: { filter: GridFilter }) => {
  const selected = Array.isArray(filter.value) ? (filter.value as string[]) : [];
  const format = filter.formatOption ?? formatOptionLabel;
  const toggle = (option: string) => {
    const next = selected.includes(option)
      ? selected.filter((value) => value !== option)
      : [...selected, option];
    filter.onChange(next.length ? next : undefined);
  };
  return (
    <div className="max-h-64 w-48 overflow-auto">
      {filter.options.map((option) => (
        <label
          key={option}
          className="flex h-7 items-center gap-2 rounded px-1 text-xs font-medium text-slate-800 hover:bg-slate-50"
        >
          <input
            type="checkbox"
            checked={selected.includes(option)}
            onChange={() => toggle(option)}
            aria-label={format(option)}
            className="h-3.5 w-3.5 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
          />
          <span className="truncate">{format(option)}</span>
        </label>
      ))}
    </div>
  );
};

const RangeBody = ({ filter }: { filter: GridFilter }) => {
  const value =
    filter.value && typeof filter.value === "object" && !Array.isArray(filter.value)
      ? (filter.value as { min?: number; max?: number })
      : {};
  const parse = (raw: string) => (raw === "" ? undefined : Number(raw));
  const update = (patch: { min?: number; max?: number }) => {
    const next = { min: value.min, max: value.max, ...patch };
    filter.onChange(next.min == null && next.max == null ? undefined : next);
  };
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        inputMode="numeric"
        placeholder="Min"
        aria-label={`${filter.label} minimum`}
        value={value.min ?? ""}
        min={filter.min}
        max={filter.max}
        step={filter.step}
        onChange={(event) => update({ min: parse(event.target.value) })}
        className={`${inputClass} w-20`}
      />
      <span aria-hidden="true" className="text-slate-400">
        –
      </span>
      <input
        type="number"
        inputMode="numeric"
        placeholder="Max"
        aria-label={`${filter.label} maximum`}
        value={value.max ?? ""}
        min={filter.min}
        max={filter.max}
        step={filter.step}
        onChange={(event) => update({ max: parse(event.target.value) })}
        className={`${inputClass} w-20`}
      />
    </div>
  );
};

const TextBody = ({ filter }: { filter: GridFilter }) => {
  const value = typeof filter.value === "string" ? filter.value : "";
  return (
    <input
      type="text"
      aria-label={`${filter.label} contains`}
      placeholder={filter.placeholder ?? "Contains…"}
      value={value}
      onChange={(event) => filter.onChange(event.target.value || undefined)}
      className={`${inputClass} w-48`}
    />
  );
};

const toIsoDay = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const DateBody = ({ filter }: { filter: GridFilter }) => {
  const value =
    filter.value && typeof filter.value === "object" && !Array.isArray(filter.value)
      ? (filter.value as { from?: string; to?: string })
      : {};
  const update = (patch: { from?: string; to?: string }) => {
    const next = { from: value.from, to: value.to, ...patch };
    const from = next.from || undefined;
    const to = next.to || undefined;
    filter.onChange(from || to ? { from, to } : undefined);
  };
  // Presets resolve to concrete {from,to} bounds when applied (they do not stay
  // relative — a saved view captures the resolved bounds).
  const applyPreset = (preset: "today" | "7d" | "30d" | "month") => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const to = toIsoDay(today);
    if (preset === "today") {
      filter.onChange({ from: to, to });
    } else if (preset === "7d") {
      filter.onChange({ from: toIsoDay(new Date(today.getTime() - 6 * 86_400_000)), to });
    } else if (preset === "30d") {
      filter.onChange({ from: toIsoDay(new Date(today.getTime() - 29 * 86_400_000)), to });
    } else {
      filter.onChange({ from: toIsoDay(new Date(now.getFullYear(), now.getMonth(), 1)), to });
    }
  };
  const showPresets = filter.presets !== false;
  return (
    <div className="flex w-56 flex-col gap-2">
      <div className="flex items-center gap-1">
        <input
          type="date"
          aria-label={`${filter.label} from`}
          value={value.from ?? ""}
          onChange={(event) => update({ from: event.target.value })}
          className={`${inputClass} flex-1`}
        />
        <span aria-hidden="true" className="text-slate-400">
          –
        </span>
        <input
          type="date"
          aria-label={`${filter.label} to`}
          value={value.to ?? ""}
          onChange={(event) => update({ to: event.target.value })}
          className={`${inputClass} flex-1`}
        />
      </div>
      {showPresets ? (
        <div className="flex flex-wrap gap-1">
          {([
            ["Today", "today"],
            ["Last 7 days", "7d"],
            ["Last 30 days", "30d"],
            ["This month", "month"],
          ] as const).map(([label, preset]) => (
            <button
              key={preset}
              type="button"
              onClick={() => applyPreset(preset)}
              className="h-6 rounded border border-slate-200 px-2 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => filter.onChange(undefined)}
            className="h-6 rounded border border-slate-200 px-2 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
          >
            Clear
          </button>
        </div>
      ) : null}
    </div>
  );
};

const FilterBody = ({ filter, onClose }: { filter: GridFilter; onClose: () => void }) => {
  if (filter.filterType === "multiSelect") {
    return <MultiSelectBody filter={filter} />;
  }
  if (filter.filterType === "range") {
    return <RangeBody filter={filter} />;
  }
  if (filter.filterType === "text") {
    return <TextBody filter={filter} />;
  }
  if (filter.filterType === "date") {
    return <DateBody filter={filter} />;
  }
  return <SelectBody filter={filter} onClose={onClose} />;
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
