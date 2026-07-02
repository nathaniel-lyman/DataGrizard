// The per-filter-type body UIs (select / multiSelect / range / text / date) and
// the FilterBody dispatcher. Stateless and value-driven; the popover chrome that
// hosts them lives in filters.tsx. GridFilter is imported type-only (erased).
import type { GridFilter } from "./filters";
import {
  defaultOperatorForFilterType,
  resolveFilterClause,
} from "./filterMatch";
import type { GridFilterOperator, GridFilterType } from "../../types/grid";

export const formatOptionLabel = (option: string) =>
  option
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const inputClass =
  "h-8 rounded-md border border-slate-300 bg-white px-2 text-xs font-medium text-slate-800 outline-none transition focus-visible:border-slate-500 focus-visible:ring-2 focus-visible:ring-slate-300";

const operatorClass =
  "h-8 rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-800 outline-none transition focus-visible:border-slate-500 focus-visible:ring-2 focus-visible:ring-slate-300";

const operatorLabels: Record<GridFilterOperator, string> = {
  is: "Is",
  isNot: "Is not",
  isAnyOf: "Is any of",
  isNoneOf: "Is none of",
  contains: "Contains",
  notContains: "Does not contain",
  startsWith: "Starts with",
  endsWith: "Ends with",
  equals: "Equals",
  notEquals: "Does not equal",
  gt: "Greater than",
  gte: "Greater than or equal",
  lt: "Less than",
  lte: "Less than or equal",
  between: "Between",
  before: "Before",
  onOrBefore: "On or before",
  after: "After",
  onOrAfter: "On or after",
  isEmpty: "Is empty",
  isNotEmpty: "Is not empty",
};

const defaultOperatorsByType: Record<GridFilterType, GridFilterOperator[]> = {
  select: ["is", "isNot", "isEmpty", "isNotEmpty"],
  boolean: ["is", "isNot", "isEmpty", "isNotEmpty"],
  multiSelect: ["isAnyOf", "isNoneOf", "isEmpty", "isNotEmpty"],
  text: ["contains", "notContains", "equals", "notEquals", "startsWith", "endsWith", "isEmpty", "isNotEmpty"],
  range: ["between", "equals", "notEquals", "gt", "gte", "lt", "lte", "isEmpty", "isNotEmpty"],
  date: ["between", "equals", "notEquals", "before", "onOrBefore", "after", "onOrAfter", "isEmpty", "isNotEmpty"],
};

const getOperators = (filter: GridFilter) =>
  filter.operators?.length ? filter.operators : defaultOperatorsByType[filter.filterType];

const isUnaryOperator = (operator: GridFilterOperator) =>
  operator === "isEmpty" || operator === "isNotEmpty";

const emptyOptions = (
  <p className="px-2 py-1.5 text-xs font-medium text-slate-500">No options available</p>
);

const resolveFilterState = (filter: GridFilter) => {
  const clause = resolveFilterClause(filter.value, {
    filterType: filter.filterType,
    operator: filter.operator,
  });
  return {
    operator: clause.operator,
    value: clause.value,
  };
};

const commitFilterValue = (filter: GridFilter, operator: GridFilterOperator, value: unknown) => {
  const defaultOperator = filter.operator ?? defaultOperatorForFilterType(filter.filterType);
  if (isUnaryOperator(operator)) {
    filter.onChange({ operator });
    return;
  }
  const emptyArray = Array.isArray(value) && value.length === 0;
  const emptyObject =
    value != null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !Object.values(value as Record<string, unknown>).some((bound) => bound != null && bound !== "");
  if (value == null || value === "" || emptyArray || emptyObject) {
    filter.onChange(operator === defaultOperator ? undefined : { operator, value });
    return;
  }
  filter.onChange({ operator, value });
};

const OperatorSelect = ({ filter }: { filter: GridFilter }) => {
  const { operator, value } = resolveFilterState(filter);
  const operators = getOperators(filter);
  return (
    <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
      Match
      <select
        aria-label={`${filter.label} operator`}
        value={operator}
        onChange={(event) => commitFilterValue(filter, event.target.value as GridFilterOperator, value)}
        className={`${operatorClass} w-full`}
      >
        {operators.map((item) => (
          <option key={item} value={item}>
            {operatorLabels[item]}
          </option>
        ))}
      </select>
    </label>
  );
};

const SelectBody = ({ filter, onClose }: { filter: GridFilter; onClose: () => void }) => {
  const { operator, value } = resolveFilterState(filter);
  const selected = typeof value === "boolean" ? String(value) : typeof value === "string" ? value : "";
  const format = filter.formatOption ?? formatOptionLabel;
  const choose = (value: string) => {
    commitFilterValue(filter, operator, value || undefined);
    onClose();
  };
  if (isUnaryOperator(operator)) {
    return null;
  }
  if (filter.options.length === 0) {
    return <div className="w-56">{emptyOptions}</div>;
  }
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
  const { operator, value } = resolveFilterState(filter);
  const selected = Array.isArray(value) ? (value as string[]) : [];
  const format = filter.formatOption ?? formatOptionLabel;
  const toggle = (option: string) => {
    const next = selected.includes(option)
      ? selected.filter((value) => value !== option)
      : [...selected, option];
    commitFilterValue(filter, operator, next.length ? next : undefined);
  };
  if (isUnaryOperator(operator)) {
    return null;
  }
  if (filter.options.length === 0) {
    return <div className="w-48">{emptyOptions}</div>;
  }
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
  const { operator, value: clauseValue } = resolveFilterState(filter);
  const value =
    clauseValue && typeof clauseValue === "object" && !Array.isArray(clauseValue)
      ? (clauseValue as { min?: number; max?: number })
      : {};
  const parse = (raw: string) => (raw === "" ? undefined : Number(raw));
  const update = (patch: { min?: number; max?: number }) => {
    const next = { min: value.min, max: value.max, ...patch };
    commitFilterValue(filter, operator, next.min == null && next.max == null ? undefined : next);
  };
  const singleValue =
    typeof clauseValue === "number" || typeof clauseValue === "string" ? clauseValue : value.min ?? "";
  const updateSingle = (raw: string) => commitFilterValue(filter, operator, parse(raw));
  if (isUnaryOperator(operator)) {
    return null;
  }
  if (operator !== "between") {
    return (
      <input
        type="number"
        inputMode="numeric"
        placeholder="Value"
        aria-label={`${filter.label} value`}
        value={singleValue ?? ""}
        min={filter.min}
        max={filter.max}
        step={filter.step}
        onChange={(event) => updateSingle(event.target.value)}
        className={`${inputClass} w-full`}
      />
    );
  }
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
  const { operator, value: clauseValue } = resolveFilterState(filter);
  const value = typeof clauseValue === "string" ? clauseValue : "";
  if (isUnaryOperator(operator)) {
    return null;
  }
  return (
    <input
      type="text"
      aria-label={`${filter.label} contains`}
      placeholder={filter.placeholder ?? "Contains…"}
      value={value}
      onChange={(event) => commitFilterValue(filter, operator, event.target.value || undefined)}
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
  const { operator, value: clauseValue } = resolveFilterState(filter);
  const value =
    clauseValue && typeof clauseValue === "object" && !Array.isArray(clauseValue)
      ? (clauseValue as { from?: string; to?: string })
      : {};
  const update = (patch: { from?: string; to?: string }) => {
    const next = { from: value.from, to: value.to, ...patch };
    const from = next.from || undefined;
    const to = next.to || undefined;
    commitFilterValue(filter, operator, from || to ? { from, to } : undefined);
  };
  const singleValue = typeof clauseValue === "string" ? clauseValue : value.from ?? "";
  const updateSingle = (raw: string) => commitFilterValue(filter, operator, raw || undefined);
  // Presets resolve to concrete {from,to} bounds when applied (they do not stay
  // relative — a saved view captures the resolved bounds).
  const applyPreset = (preset: "today" | "7d" | "30d" | "month") => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const to = toIsoDay(today);
    if (preset === "today") {
      commitFilterValue(filter, operator, { from: to, to });
    } else if (preset === "7d") {
      commitFilterValue(filter, operator, { from: toIsoDay(new Date(today.getTime() - 6 * 86_400_000)), to });
    } else if (preset === "30d") {
      commitFilterValue(filter, operator, { from: toIsoDay(new Date(today.getTime() - 29 * 86_400_000)), to });
    } else {
      commitFilterValue(filter, operator, { from: toIsoDay(new Date(now.getFullYear(), now.getMonth(), 1)), to });
    }
  };
  const showPresets = filter.presets !== false;
  if (isUnaryOperator(operator)) {
    return null;
  }
  if (operator !== "between") {
    return (
      <input
        type="date"
        aria-label={`${filter.label} value`}
        value={singleValue}
        onChange={(event) => updateSingle(event.target.value)}
        className={`${inputClass} w-full`}
      />
    );
  }
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
  const body =
    filter.filterType === "multiSelect" ? (
      <MultiSelectBody filter={filter} />
    ) : filter.filterType === "range" ? (
      <RangeBody filter={filter} />
    ) : filter.filterType === "text" ? (
      <TextBody filter={filter} />
    ) : filter.filterType === "date" ? (
      <DateBody filter={filter} />
    ) : (
      <SelectBody filter={filter} onClose={onClose} />
    );

  return (
    <div className="flex min-w-56 flex-col gap-3">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Filter</div>
          <div className="text-sm font-semibold text-slate-900">{filter.label}</div>
        </div>
        <button
          type="button"
          onClick={() => filter.onChange(undefined)}
          className="h-7 rounded-md border border-slate-200 px-2 text-[11px] font-semibold text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98]"
        >
          Clear
        </button>
      </div>
      <OperatorSelect filter={filter} />
      {body ? <div>{body}</div> : null}
    </div>
  );
};
