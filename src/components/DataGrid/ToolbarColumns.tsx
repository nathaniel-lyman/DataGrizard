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
      className="relative flex min-w-48 flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-slate-500"
    >
      Columns
      <button
        ref={columnsTriggerRef}
        type="button"
        onClick={() => setColumnsOpen((isOpen) => !isOpen)}
        className="flex h-8 items-center justify-between gap-3 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium normal-case tracking-normal text-slate-800 outline-none transition hover:bg-slate-50 focus-visible:border-slate-500 focus-visible:ring-2 focus-visible:ring-slate-300"
        aria-expanded={columnsOpen}
        aria-haspopup="dialog"
      >
        <span>{visibleColumnCount} visible</span>
        <span aria-hidden="true" className="text-slate-400">
          {columnsOpen ? (
            <ChevronUpIcon className="h-3.5 w-3.5" />
          ) : (
            <ChevronDownIcon className="h-3.5 w-3.5" />
          )}
        </span>
      </button>

      {columnsOpen ? (
        <div
          className="absolute left-0 top-full z-20 mt-1 w-72 rounded-md border border-slate-200 bg-white p-2 shadow-lg"
          aria-label="Column settings"
        >
          <div className="max-h-72 overflow-auto">
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
                className="flex h-8 items-center gap-2 rounded px-2 text-xs font-medium normal-case tracking-normal text-slate-800 hover:bg-slate-50"
              >
                {enableColumnOrdering ? (
                  <span
                    className="cursor-grab select-none text-slate-400 active:cursor-grabbing"
                    aria-hidden="true"
                  >
                    <GripIcon className="h-3.5 w-3.5" />
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
                    className="h-3.5 w-3.5 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                  />
                ) : null}
                <span className="min-w-0 flex-1 truncate">{column.label}</span>
                {enableColumnPinning && column.canPin ? (
                  <span className="flex shrink-0 overflow-hidden rounded border border-slate-200">
                    <button
                      type="button"
                      onClick={() => onColumnPin(column.id, "left")}
                      disabled={column.pinned === "left"}
                      className="flex h-6 w-6 items-center justify-center text-[10px] font-bold text-slate-500 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:bg-slate-900 disabled:text-white"
                      aria-label={`Pin ${column.label} left`}
                      title="Pin left"
                    >
                      L
                    </button>
                    <button
                      type="button"
                      onClick={() => onColumnPin(column.id, false)}
                      disabled={!column.pinned}
                      className="flex h-6 w-6 items-center justify-center border-l border-slate-200 text-slate-500 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label={`Unpin ${column.label}`}
                      title="Unpin"
                    >
                      <CloseIcon className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onColumnPin(column.id, "right")}
                      disabled={column.pinned === "right"}
                      className="flex h-6 w-6 items-center justify-center border-l border-slate-200 text-[10px] font-bold text-slate-500 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:bg-slate-900 disabled:text-white"
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
                      className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 text-slate-500 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label={`Move ${column.label} left`}
                    >
                      <ChevronUpIcon className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onColumnMove(column.id, "down")}
                      disabled={index === columns.length - 1}
                      className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 text-slate-500 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label={`Move ${column.label} right`}
                    >
                      <ChevronDownIcon className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : null}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={onResetColumns}
            className="mt-2 h-8 w-full rounded-md border border-slate-300 bg-slate-50 px-3 text-xs font-semibold normal-case tracking-normal text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-200"
          >
            Reset columns
          </button>
        </div>
      ) : null}
    </div>
  );
}
