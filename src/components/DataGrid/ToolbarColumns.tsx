import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon, ChevronUpIcon, CloseIcon, GripIcon } from "./icons";

type ToolbarColumn = {
  id: string;
  label: string;
  visible: boolean;
  canHide: boolean;
  pinned: false | "left" | "right";
  canPin: boolean;
};

type ToolbarColumnsProps = {
  columns: ToolbarColumn[];
  enableColumnVisibility: boolean;
  enableColumnOrdering: boolean;
  enableColumnPinning: boolean;
  onColumnVisibilityChange: (columnId: string, visible: boolean) => void;
  onColumnMove: (columnId: string, direction: "up" | "down") => void;
  onColumnDrop: (fromColumnId: string, toColumnId: string) => void;
  onColumnPin: (columnId: string, position: false | "left" | "right") => void;
  onResetColumns: () => void;
};

export function ToolbarColumns({
  columns,
  enableColumnVisibility,
  enableColumnOrdering,
  enableColumnPinning,
  onColumnVisibilityChange,
  onColumnMove,
  onColumnDrop,
  onColumnPin,
  onResetColumns,
}: ToolbarColumnsProps) {
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [draggedColumnId, setDraggedColumnId] = useState<string | null>(null);
  const columnsRef = useRef<HTMLDivElement | null>(null);
  const columnsTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!columnsOpen) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      if (columnsRef.current && !columnsRef.current.contains(event.target as Node)) {
        setColumnsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setColumnsOpen(false);
        columnsTriggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [columnsOpen]);

  const visibleColumnCount = columns.filter((column) => column.visible).length;

  return (
    <div
      ref={columnsRef}
      className="dg-field dg-columns-field"
    >
      Columns
      <button
        ref={columnsTriggerRef}
        type="button"
        onClick={() => setColumnsOpen((isOpen) => !isOpen)}
        className="dg-select-trigger"
        aria-expanded={columnsOpen}
        aria-haspopup="dialog"
      >
        <span>{visibleColumnCount} visible</span>
        <span aria-hidden="true" className="dg-select-chevron">
          {columnsOpen ? (
            <ChevronUpIcon className="dg-icon--sm" />
          ) : (
            <ChevronDownIcon className="dg-icon--sm" />
          )}
        </span>
      </button>

      {columnsOpen ? (
        <div
          className="dg-columns-menu"
          aria-label="Column settings"
        >
          <div className="dg-columns-list">
            {columns.map((column, index) => (
              <div
                key={column.id}
                draggable={enableColumnOrdering}
                onDragStart={() => setDraggedColumnId(column.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (
                    enableColumnOrdering &&
                    draggedColumnId &&
                    draggedColumnId !== column.id
                  ) {
                    onColumnDrop(draggedColumnId, column.id);
                  }
                  setDraggedColumnId(null);
                }}
                onDragEnd={() => setDraggedColumnId(null)}
                className="dg-columns-item"
              >
                {enableColumnOrdering ? (
                  <span
                    className="dg-drag-handle"
                    aria-hidden="true"
                  >
                    <GripIcon className="dg-icon--sm" />
                  </span>
                ) : null}
                {enableColumnVisibility ? (
                  <input
                    type="checkbox"
                    checked={column.visible}
                    disabled={!column.canHide}
                    aria-label={`Toggle ${column.label} column`}
                    onChange={(event) =>
                      onColumnVisibilityChange(column.id, event.target.checked)
                    }
                    className="dg-checkbox"
                  />
                ) : null}
                <span className="dg-columns-label">{column.label}</span>
                {enableColumnPinning && column.canPin ? (
                  <span className="dg-pin-controls">
                    <button
                      type="button"
                      onClick={() => onColumnPin(column.id, "left")}
                      disabled={column.pinned === "left"}
                      className="dg-icon-btn dg-pin-btn"
                      aria-label={`Pin ${column.label} left`}
                      title="Pin left"
                    >
                      L
                    </button>
                    <button
                      type="button"
                      onClick={() => onColumnPin(column.id, false)}
                      disabled={!column.pinned}
                      className="dg-icon-btn dg-pin-btn dg-pin-btn--divided dg-pin-btn--unpin"
                      aria-label={`Unpin ${column.label}`}
                      title="Unpin"
                    >
                      <CloseIcon className="dg-icon--xs" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onColumnPin(column.id, "right")}
                      disabled={column.pinned === "right"}
                      className="dg-icon-btn dg-pin-btn dg-pin-btn--divided"
                      aria-label={`Pin ${column.label} right`}
                      title="Pin right"
                    >
                      R
                    </button>
                  </span>
                ) : null}
                {enableColumnOrdering ? (
                  <>
                    <button
                      type="button"
                      onClick={() => onColumnMove(column.id, "up")}
                      disabled={index === 0}
                      className="dg-icon-btn dg-move-btn"
                      aria-label={`Move ${column.label} left`}
                    >
                      <ChevronUpIcon className="dg-icon--sm" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onColumnMove(column.id, "down")}
                      disabled={index === columns.length - 1}
                      className="dg-icon-btn dg-move-btn"
                      aria-label={`Move ${column.label} right`}
                    >
                      <ChevronDownIcon className="dg-icon--sm" />
                    </button>
                  </>
                ) : null}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={onResetColumns}
            className="dg-btn dg-btn--secondary dg-btn--block dg-columns-reset"
          >
            Reset columns
          </button>
        </div>
      ) : null}
    </div>
  );
}
