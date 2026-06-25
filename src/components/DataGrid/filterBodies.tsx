// The per-filter-type body UIs (select / multiSelect / range / text / date) and
// the FilterBody dispatcher. Stateless and value-driven; the popover chrome that
// hosts them lives in filters.tsx. GridFilter is imported type-only (erased).
import type { GridFilter } from "./filters";

export const formatOptionLabel = (option: string) =>
  option
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

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

export const FilterBody = ({ filter, onClose }: { filter: GridFilter; onClose: () => void }) => {
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
