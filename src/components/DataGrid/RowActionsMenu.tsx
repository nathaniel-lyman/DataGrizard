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

const itemClass = "dg-menu-item";

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
    <div className="dg-row-actions" onMouseDown={(event) => event.stopPropagation()}>
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
        className="dg-menu-trigger dg-row-actions-trigger"
      >
        <MoreVerticalIcon className="dg-icon--md" />
      </button>

      {open ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label={`Actions for ${rowLabel}`}
          className="dg-menu dg-row-actions-menu dg-popover--align-end dg-popover--below"
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
                  action.destructive && !disabled ? "dg-menu-item--danger" : ""
                }`}
              >
                {action.icon ? <span className="dg-menu-item-icon">{action.icon}</span> : null}
                <span className="dg-truncate">{action.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
