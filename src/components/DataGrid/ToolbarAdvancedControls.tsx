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
    <section className="dg-advanced-controls">
      <div className="dg-advanced-header">
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={() => setIsOpen((open) => !open)}
          className="dg-advanced-trigger"
        >
          <SlidersIcon className="dg-icon--sm dg-advanced-trigger-icon" />
          <span>View controls</span>
          <ChevronDownIcon
            className={`dg-icon--sm dg-advanced-chevron ${
              isOpen ? "dg-advanced-chevron--open" : ""
            }`}
          />
        </button>

        <div className="dg-advanced-stats">
          {groupingCount > 0 ? (
            <span className="dg-advanced-stat">
              {groupingCount} grouped
            </span>
          ) : null}
          <span className="dg-advanced-stat">
            {columnCount} visible
          </span>
          <span className="dg-advanced-stat">
            {savedViewCount} saved
          </span>
        </div>
      </div>

      {isOpen ? (
        <div
          id={panelId}
          className="dg-advanced-panel"
        >
          <div className="dg-advanced-panel-header">
            <div className="dg-advanced-copy">
              <p className="dg-advanced-title">Advanced view setup</p>
              <p className="dg-advanced-description">
                Group rows, tune visible columns, and save reusable views.
              </p>
            </div>
            <button
              type="button"
              onClick={onResetView}
              className="dg-btn dg-btn--surface dg-advanced-reset"
            >
              Reset view
            </button>
          </div>
          <div className="dg-toolbar-row dg-advanced-content">{children}</div>
        </div>
      ) : null}
    </section>
  );
}
