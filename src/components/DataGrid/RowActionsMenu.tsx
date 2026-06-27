import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MoreVerticalIcon } from "./icons";

export type DataGridRowActionContext<TData extends object> = {
  row: TData;
  rowId: string;
  closeMenu: () => void;
};

export type DataGridRowAction<TData extends object> = {
  id: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean | ((row: TData) => boolean);
  hidden?: boolean | ((row: TData) => boolean);
  destructive?: boolean;
  onSelect: (row: TData, context: DataGridRowActionContext<TData>) => void;
};

export type DataGridRowActions<TData extends object> =
  | DataGridRowAction<TData>[]
  | ((row: TData) => DataGridRowAction<TData>[]);

type RowActionsMenuProps<TData extends object> = {
  row: TData;
  rowId: string;
  rowLabel: string;
  actions: DataGridRowActions<TData>;
};

const itemClass =
  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent";

const resolveFlag = <TData extends object>(
  value: boolean | ((row: TData) => boolean) | undefined,
  row: TData,
) => (typeof value === "function" ? value(row) : Boolean(value));

export function RowActionsMenu<TData extends object>({
  row,
  rowId,
  rowLabel,
  actions,
}: RowActionsMenuProps<TData>) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const visibleActions = useMemo(
    () =>
      (typeof actions === "function" ? actions(row) : actions).filter(
        (action) => !resolveFlag(action.hidden, row),
      ),
    [actions, row],
  );
  const triggerLabel = `Open actions for ${rowLabel}`;

  useEffect(() => {
    if (!open) {
      return;
    }
    const onDown = (event: MouseEvent) => {
      if (
        menuRef.current?.contains(event.target as Node) ||
        triggerRef.current?.contains(event.target as Node)
      ) {
        return;
      }
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const run = (action: DataGridRowAction<TData>) => {
    action.onSelect(row, { row, rowId, closeMenu: () => setOpen(false) });
    setOpen(false);
  };

  return (
    <div className="relative flex justify-end" onMouseDown={(event) => event.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={triggerLabel}
        title={triggerLabel}
        disabled={visibleActions.length === 0}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-slate-500 transition hover:bg-slate-200 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <MoreVerticalIcon className="h-4 w-4" />
      </button>

      {open ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label={`Actions for ${rowLabel}`}
          className="absolute right-0 top-full z-50 mt-1 min-w-44 overflow-hidden rounded-md border border-slate-200 bg-white py-1 text-slate-800 shadow-lg"
          onClick={(event) => event.stopPropagation()}
        >
          {visibleActions.map((action) => {
            const disabled = resolveFlag(action.disabled, row);
            return (
              <button
                key={action.id}
                type="button"
                role="menuitem"
                disabled={disabled}
                onClick={() => run(action)}
                className={`${itemClass} ${
                  action.destructive && !disabled ? "text-rose-700 hover:bg-rose-50" : ""
                }`}
              >
                {action.icon ? <span className="shrink-0">{action.icon}</span> : null}
                <span className="truncate">{action.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
