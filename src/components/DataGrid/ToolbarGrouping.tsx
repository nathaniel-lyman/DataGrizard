import { ChevronDownIcon, ChevronUpIcon, CloseIcon } from "./icons";

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
    <div className="flex min-w-72 flex-1 flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
      Group by
      <div className="flex min-h-8 flex-wrap items-center gap-2 rounded-md border border-slate-300 bg-white px-2 py-1 normal-case tracking-normal">
        {groupedColumns.map((column, index) => (
          <span
            key={column.id}
            className="inline-flex h-6 items-center gap-1 rounded border border-slate-200 bg-slate-50 pl-2 pr-1 text-xs font-medium text-slate-800"
          >
            {column.label}
            <button
              type="button"
              onClick={() => onGroupingMove(column.id, "up")}
              disabled={index === 0}
              className="flex h-5 w-5 items-center justify-center rounded text-slate-500 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-30"
              aria-label={`Move ${column.label} earlier`}
            >
              <ChevronUpIcon className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => onGroupingMove(column.id, "down")}
              disabled={index === groupedColumns.length - 1}
              className="flex h-5 w-5 items-center justify-center rounded text-slate-500 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-30"
              aria-label={`Move ${column.label} later`}
            >
              <ChevronDownIcon className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => onGroupingRemove(column.id)}
              className="flex h-5 w-5 items-center justify-center rounded text-slate-500 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
              aria-label={`Remove ${column.label} grouping`}
            >
              <CloseIcon className="h-3 w-3" />
            </button>
          </span>
        ))}
        <select
          value=""
          onChange={(event) => {
            if (event.target.value) {
              onGroupingAdd(event.target.value);
            }
          }}
          disabled={availableGroupColumns.length === 0}
          className="h-6 min-w-32 flex-1 border-0 bg-transparent px-1 text-xs font-medium text-slate-700 outline-none disabled:text-slate-400"
          aria-label="Add grouping"
        >
          <option value="">
            {groupedColumns.length ? "Add level" : "No grouping"}
          </option>
          {availableGroupColumns.map((column) => (
            <option key={column.id} value={column.id}>
              {column.label}
            </option>
          ))}
        </select>
        {groupedColumns.length > 0 ? (
          <button
            type="button"
            onClick={onClearGrouping}
            className="h-6 rounded border border-slate-200 px-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}
