import { ChevronDownIcon, ChevronUpIcon, CloseIcon } from "./icons";
import { DropdownSelect } from "./DropdownSelect";

type ToolbarGroupingProps = {
  groupableColumns: Array<{ id: string; label: string }>;
  grouping: string[];
  onGroupingAdd: (columnId: string) => void;
  onGroupingRemove: (columnId: string) => void;
  onGroupingMove: (columnId: string, direction: "up" | "down") => void;
  onClearGrouping: () => void;
};

export function ToolbarGrouping({
  groupableColumns,
  grouping,
  onGroupingAdd,
  onGroupingRemove,
  onGroupingMove,
  onClearGrouping,
}: ToolbarGroupingProps) {
  const groupedColumns = grouping
    .map((columnId) => groupableColumns.find((column) => column.id === columnId))
    .filter((column): column is { id: string; label: string } => Boolean(column));
  const availableGroupColumns = groupableColumns.filter(
    (column) => !grouping.includes(column.id),
  );

  return (
    <div className="dg-field dg-grouping-field">
      Group by
      <div className="dg-grouping-control">
        {groupedColumns.map((column, index) => (
          <span
            key={column.id}
            className="dg-grouping-chip"
          >
            {column.label}
            <button
              type="button"
              onClick={() => onGroupingMove(column.id, "up")}
              disabled={index === 0}
              className="dg-icon-btn dg-grouping-chip-btn"
              aria-label={`Move ${column.label} earlier`}
            >
              <ChevronUpIcon className="dg-icon--xs" />
            </button>
            <button
              type="button"
              onClick={() => onGroupingMove(column.id, "down")}
              disabled={index === groupedColumns.length - 1}
              className="dg-icon-btn dg-grouping-chip-btn"
              aria-label={`Move ${column.label} later`}
            >
              <ChevronDownIcon className="dg-icon--xs" />
            </button>
            <button
              type="button"
              onClick={() => onGroupingRemove(column.id)}
              className="dg-icon-btn dg-grouping-chip-btn"
              aria-label={`Remove ${column.label} grouping`}
            >
              <CloseIcon className="dg-icon--xs" />
            </button>
          </span>
        ))}
        <DropdownSelect
          value=""
          onChange={(value) => {
            onGroupingAdd(value);
          }}
          disabled={availableGroupColumns.length === 0}
          className="dg-grouping-select"
          ariaLabel="Add grouping"
          placeholder={groupedColumns.length ? "Add level" : "No grouping"}
          options={availableGroupColumns.map((column) => ({
            value: column.id,
            label: column.label,
          }))}
        />
        {groupedColumns.length > 0 ? (
          <button
            type="button"
            onClick={onClearGrouping}
            className="dg-grouping-clear"
          >
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}
