import { useId, useState, type ReactNode } from "react";
import { ChevronDownIcon, SlidersIcon } from "./icons";

type ToolbarAdvancedControlsProps = {
  children: ReactNode;
  columnCount: number;
  groupingCount: number;
  savedViewCount: number;
  onResetView: () => void;
};

export function ToolbarAdvancedControls({
  children,
  columnCount,
  groupingCount,
  savedViewCount,
  onResetView,
}: ToolbarAdvancedControlsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();

  return (
    <section className="mt-3 border-t border-slate-100 pt-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={() => setIsOpen((open) => !open)}
          className="group inline-flex h-9 min-w-0 items-center gap-2 rounded-md border border-slate-300 bg-slate-50 px-3 text-xs font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
        >
          <SlidersIcon className="h-3.5 w-3.5 shrink-0 text-slate-500" />
          <span>View controls</span>
          <ChevronDownIcon
            className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] font-medium text-slate-500">
          {groupingCount > 0 ? (
            <span className="rounded border border-slate-200 bg-white px-2 py-1">
              {groupingCount} grouped
            </span>
          ) : null}
          <span className="rounded border border-slate-200 bg-white px-2 py-1">
            {columnCount} visible
          </span>
          <span className="rounded border border-slate-200 bg-white px-2 py-1">
            {savedViewCount} saved
          </span>
        </div>
      </div>

      {isOpen ? (
        <div
          id={panelId}
          className="mt-3 rounded-md border border-slate-200 bg-slate-50/80 p-3"
        >
          <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-900">Advanced view setup</p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Group rows, tune visible columns, and save reusable views.
              </p>
            </div>
            <button
              type="button"
              onClick={onResetView}
              className="h-8 shrink-0 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
              Reset view
            </button>
          </div>
          <div className="flex min-w-0 flex-wrap items-end gap-3 sm:gap-4">{children}</div>
        </div>
      ) : null}
    </section>
  );
}
