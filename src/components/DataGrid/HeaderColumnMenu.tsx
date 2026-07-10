import { useEffect, useRef, useState } from "react";
import { MoreVerticalIcon } from "./icons";
import { computeAnchoredPlacement, type AnchoredPlacement } from "./popoverPosition";

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

const itemClass = "dg-menu-item dg-menu-item--split";

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
  const [placement, setPlacement] = useState<AnchoredPlacement>({
    alignEnd: true,
    openUp: false,
    maxHeight: undefined,
  });
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
    <div className="dg-menu-anchor" onMouseDown={(event) => event.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Open ${label} column menu`}
        title={`${label} column menu`}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => {
            if (!current) {
              const rect = triggerRef.current?.getBoundingClientRect();
              if (rect) {
                setPlacement(
                  computeAnchoredPlacement({
                    trigger: rect,
                    viewportWidth: window.innerWidth,
                    viewportHeight: window.innerHeight,
                    estimatedWidth: 192,
                    estimatedHeight: 420,
                  }),
                );
              }
            }
            return !current;
          });
        }}
        className="dg-menu-trigger"
      >
        <MoreVerticalIcon className="dg-icon--sm" />
      </button>

      {open ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label={`${label} column menu`}
          style={placement.maxHeight ? { maxHeight: placement.maxHeight } : undefined}
          className={`dg-menu dg-column-menu ${
            placement.alignEnd ? "dg-popover--align-end" : "dg-popover--align-start"
          } ${placement.openUp ? "dg-popover--above" : "dg-popover--below"}`}
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
          <div className="dg-menu-separator" />
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
          <div className="dg-menu-separator" />
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
          <div className="dg-menu-separator" />
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
