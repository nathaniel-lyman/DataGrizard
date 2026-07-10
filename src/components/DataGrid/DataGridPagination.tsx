import type { Table } from "@tanstack/react-table";
import type { PivotRow } from "./pivot";
import { DropdownSelect } from "./DropdownSelect";

type DataGridPaginationProps<TData extends object> = {
  table: Table<TData | PivotRow<TData>>;
  displayedTotalRowCount?: number;
  rowLabel: string;
  pageSizeOptions: number[];
};

export function DataGridPagination<TData extends object>({
  table,
  displayedTotalRowCount,
  rowLabel,
  pageSizeOptions,
}: DataGridPaginationProps<TData>) {
  return (
    <div className="dg-pagination">
      <div className="dg-pagination-group">
        <span>
          Page {table.getState().pagination.pageIndex + 1}
          {displayedTotalRowCount == null
            ? ""
            : ` of ${Math.max(table.getPageCount(), 1)}`}
        </span>
        <DropdownSelect
          value={String(table.getState().pagination.pageSize)}
          onChange={(value) => table.setPageSize(Number(value))}
          className="dg-pagination-select"
          ariaLabel={`${rowLabel} per page`}
          options={pageSizeOptions.map((pageSize) => ({
            value: String(pageSize),
            label: `${pageSize} ${rowLabel}`,
          }))}
        />
      </div>
      <div className="dg-pagination-group">
        <button
          type="button"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
          className="dg-pagination-button"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
          className="dg-pagination-button"
        >
          Next
        </button>
      </div>
    </div>
  );
}
