import { useEffect, useRef, useState } from "react";
import { MoreVerticalIcon } from "./icons";

type PinState = false | "left" | "right";

type HeaderColumnMenuProps = {
  label: string;
  canSort: boolean;
  sortState: false | "asc" | "desc";
  canFilter: boolean;
  filterActive: boolean;
  canHide: boolean;
  canPin: boolean;
  pinState: PinState;
  canResize: boolean;
  onSortAsc: () => void;
  onSortDesc: () => void;
  onClearSort: () => void;
  onClearFilter: () => void;
  onHide: () => void;
  onPin: (position: PinState) => void;
  onAutosize: () => void;
  onFit: () => void;
  onResetWidth: () => void;
};

const itemClass =
  "flex w-full items-center justify-between gap-4 px-3 py-1.5 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent";

export function HeaderColumnMenu({
  label,
  canSort,
  sortState,
  canFilter,
  filterActive,
  canHide,
  canPin,
  pinState,
  canResize,
  onSortAsc,
  onSortDesc,
  onClearSort,
  onClearFilter,
  onHide,
  onPin,
  onAutosize,
  onFit,
  onResetWidth,
}: HeaderColumnMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

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

  const run = (action: () => void) => {
    action();
    setOpen(false);
  };

  return (
    <div className="relative shrink-0" onMouseDown={(event) => event.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Open ${label} column menu`}
        title={`${label} column menu`}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-slate-500 transition hover:bg-slate-200 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
      >
        <MoreVerticalIcon className="h-3.5 w-3.5" />
      </button>

      {open ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label={`${label} column menu`}
          className="absolute right-0 top-full z-50 mt-1 min-w-48 overflow-hidden rounded-md border border-slate-200 bg-white py-1 text-slate-800 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            disabled={!canSort}
            onClick={() => run(onSortAsc)}
            className={itemClass}
          >
            Sort ascending
            {sortState === "asc" ? <span aria-hidden="true">On</span> : null}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!canSort}
            onClick={() => run(onSortDesc)}
            className={itemClass}
          >
            Sort descending
            {sortState === "desc" ? <span aria-hidden="true">On</span> : null}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!canSort || !sortState}
            onClick={() => run(onClearSort)}
            className={itemClass}
          >
            Clear sort
          </button>
          <div className="my-1 border-t border-slate-100" />
          <button
            type="button"
            role="menuitem"
            disabled={!canFilter || !filterActive}
            onClick={() => run(onClearFilter)}
            className={itemClass}
          >
            Clear filter
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!canHide}
            onClick={() => run(onHide)}
            className={itemClass}
          >
            Hide column
          </button>
          <div className="my-1 border-t border-slate-100" />
          {pinState ? (
            <button
              type="button"
              role="menuitem"
              disabled={!canPin}
              onClick={() => run(() => onPin(false))}
              className={itemClass}
            >
              Unpin column
            </button>
          ) : (
            <>
              <button
                type="button"
                role="menuitem"
                disabled={!canPin}
                onClick={() => run(() => onPin("left"))}
                className={itemClass}
              >
                Pin left
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!canPin}
                onClick={() => run(() => onPin("right"))}
                className={itemClass}
              >
                Pin right
              </button>
            </>
          )}
          <div className="my-1 border-t border-slate-100" />
          <button
            type="button"
            role="menuitem"
            disabled={!canResize}
            onClick={() => run(onAutosize)}
            className={itemClass}
          >
            Autosize column
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!canResize}
            onClick={() => run(onFit)}
            className={itemClass}
          >
            Fit visible columns
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!canResize}
            onClick={() => run(onResetWidth)}
            className={itemClass}
          >
            Reset width
          </button>
        </div>
      ) : null}
    </div>
  );
}
