import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";

// Touch-native modal panel fixed to the bottom of the BROWSER viewport (it
// escapes the grid container by design), used in card mode for the sort sheet,
// the filters sheet, and the detail panel.
// Dialog semantics: focus moves in on open, Tab wraps inside, Escape/backdrop
// dismiss, and focus returns to the opener on close. Escape stops propagation
// so the grid's document-level Escape listener (detail panel) never fires for
// the same keypress.
type BottomSheetProps = {
  open: boolean;
  label: string;
  onClose: () => void;
  children: ReactNode;
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function BottomSheet({ open, label, onClose, children }: BottomSheetProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open || typeof document === "undefined") {
      return;
    }
    openerRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      openerRef.current?.focus();
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    const panel = panelRef.current;
    if (!panel) {
      return;
    }
    const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (focusables.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="dg-sheet-layer">
      <div
        aria-hidden="true"
        data-sheet-backdrop
        onClick={onClose}
        className="dg-sheet-backdrop"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="dg-sheet"
      >
        <div aria-hidden="true" className="dg-sheet-handle" />
        {children}
      </div>
    </div>
  );
}
