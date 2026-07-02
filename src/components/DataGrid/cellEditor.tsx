import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { GridDataType } from "../../types/grid";
import { toDate } from "../../utils/formatters";

// Value-erased column shape the editor needs (the public per-key config is cast
// to this once at the prop boundary, mirroring AnyColumnConfig in the engine).
export type EditCellColumn<TData> = {
  accessorKey: string;
  dataType: GridDataType;
  parseValue?: (input: string) => unknown;
  validate?: (value: unknown, row: TData) => string | null;
  statusStyles?: Record<string, string>;
  renderEditCell?: (props: {
    value: unknown;
    row: TData;
    onChange: (next: unknown) => void;
    commit: () => void;
    cancel: () => void;
    error: string | null;
  }) => ReactNode;
};

const isNumericType = (dataType: GridDataType) =>
  dataType === "number" || dataType === "currency" || dataType === "percent";

const toDateInputValue = (value: unknown): string => {
  const date = toDate(value);
  if (!date) {
    return "";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const toInputString = <TData,>(column: EditCellColumn<TData>, value: unknown): string => {
  if (value == null) {
    return "";
  }
  if (column.dataType === "date") {
    return toDateInputValue(value);
  }
  if (column.dataType === "boolean") {
    return value === true || String(value).toLowerCase() === "true" ? "true" : "false";
  }
  return String(value);
};

// Default string -> typed conversion when the column provides no parseValue.
// Numeric -> Number (NaN is rejected by computeEditError); date -> the ISO
// yyyy-mm-dd string from the date input; text/status -> the string.
export const parseEditValue = <TData,>(column: EditCellColumn<TData>, input: string): unknown => {
  if (column.parseValue) {
    return column.parseValue(input);
  }
  if (isNumericType(column.dataType)) {
    return input === "" ? Number.NaN : Number(input);
  }
  if (column.dataType === "boolean") {
    return input === "true";
  }
  return input;
};

// A custom `validate` fully owns validation (so a consumer can allow blanks);
// otherwise the built-in numeric-NaN / invalid-date guards apply.
export const computeEditError = <TData,>(
  column: EditCellColumn<TData>,
  value: unknown,
  row: TData,
): string | null => {
  if (column.validate) {
    return column.validate(value, row);
  }
  if (isNumericType(column.dataType) && typeof value === "number" && Number.isNaN(value)) {
    return "Enter a number";
  }
  if (column.dataType === "date" && (value == null || value === "" || toDate(value) === null)) {
    return "Enter a valid date";
  }
  return null;
};

const inputClass =
  "h-7 w-full rounded border border-slate-400 bg-white px-1.5 text-xs text-slate-900 outline-none focus:border-slate-600 focus:ring-2 focus:ring-slate-300";

// ~40px bubble; flip when the field bottom is within that band of the viewport
// (and there is room above). Exported for direct unit testing.
export const shouldFlipErrorAbove = (
  rect: { top: number; bottom: number } | undefined,
  viewportHeight: number,
): boolean => Boolean(rect && rect.bottom + 40 > viewportHeight && rect.top > 40);

export function CellEditor<TData>({
  column,
  value,
  row,
  statusOptions,
  onCommit,
  onCancel,
}: {
  column: EditCellColumn<TData>;
  value: unknown;
  row: TData;
  statusOptions: string[];
  onCommit: (value: unknown, advance: boolean) => void;
  onCancel: () => void;
}) {
  const [draftValue, setDraftValue] = useState<unknown>(value);
  const [draftText, setDraftText] = useState<string>(() => toInputString(column, value));
  const [error, setError] = useState<string | null>(null);
  const [errorAbove, setErrorAbove] = useState(false);
  const committedRef = useRef(false);
  const fieldRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);
  const errorId = useId();

  useEffect(() => {
    const node = fieldRef.current;
    node?.focus();
    if (node instanceof HTMLInputElement && node.type !== "date") {
      node.select();
    }
  }, []);

  useEffect(() => {
    if (!error) return;
    setErrorAbove(
      shouldFlipErrorAbove(fieldRef.current?.getBoundingClientRect(), window.innerHeight),
    );
  }, [error]);

  const commitTyped = (typed: unknown, advance: boolean): boolean => {
    if (committedRef.current) {
      return true;
    }
    const validationError = computeEditError(column, typed, row);
    if (validationError) {
      setError(validationError);
      return false;
    }
    committedRef.current = true;
    onCommit(typed, advance);
    return true;
  };
  const commitText = (advance: boolean): boolean => {
    let parsed: unknown;
    try {
      parsed = parseEditValue(column, draftText);
    } catch {
      // A consumer parseValue that throws surfaces as a validation error rather
      // than an unhandled exception that leaves the editor silently stuck.
      setError("Invalid value");
      return false;
    }
    return commitTyped(parsed, advance);
  };
  const cancel = () => {
    committedRef.current = true;
    onCancel();
  };

  if (column.renderEditCell) {
    return (
      <div onKeyDown={(event) => event.stopPropagation()}>
        {column.renderEditCell({
          value: draftValue,
          row,
          onChange: (next) => {
            setDraftValue(next);
            setError(null);
          },
          commit: () => commitTyped(draftValue, false),
          cancel,
          error,
        })}
      </div>
    );
  }

  // Editing keys must never bubble to the cell-navigation handler.
  const onKeyDown = (event: React.KeyboardEvent) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      commitText(false);
    } else if (event.key === "Tab") {
      event.preventDefault();
      commitText(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  };

  const common = {
    ref: (node: HTMLInputElement | HTMLSelectElement | null) => {
      fieldRef.current = node;
    },
    onKeyDown,
    onBlur: () => {
      if (!commitText(false)) {
        cancel();
      }
    },
    "aria-invalid": error ? true : undefined,
    // Error is surfaced via a described element, not aria-label, so the field
    // keeps its own accessible name and the message is also visible.
    "aria-describedby": error ? errorId : undefined,
    className: error ? `${inputClass} border-rose-500 ring-2 ring-rose-200` : inputClass,
  };

  const withError = (field: ReactNode) => (
    <div className="relative">
      {field}
      {error ? (
        <span
          id={errorId}
          role="alert"
          className={`absolute left-0 z-10 rounded bg-rose-600 px-1 py-0.5 text-[10px] font-medium text-white shadow ${
            errorAbove ? "bottom-full mb-0.5" : "top-full mt-0.5"
          }`}
        >
          {error}
        </span>
      ) : null}
    </div>
  );

  if (column.dataType === "status") {
    return withError(
      <select
        {...common}
        value={draftText}
        onChange={(event) => {
          setDraftText(event.target.value);
          setError(null);
        }}
      >
        {statusOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>,
    );
  }

  if (column.dataType === "boolean") {
    return withError(
      <select
        {...common}
        value={draftText === "true" ? "true" : "false"}
        onChange={(event) => {
          setDraftText(event.target.value);
          setError(null);
        }}
      >
        <option value="true">True</option>
        <option value="false">False</option>
      </select>,
    );
  }

  return withError(
    <input
      {...common}
      type={isNumericType(column.dataType) ? "number" : column.dataType === "date" ? "date" : "text"}
      value={draftText}
      onChange={(event) => {
        setDraftText(event.target.value);
        setError(null);
      }}
    />,
  );
}
