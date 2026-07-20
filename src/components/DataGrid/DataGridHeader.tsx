import type { CSSProperties } from "react";
import {
  flexRender,
  type Column,
  type Header,
  type SortingState,
  type Table,
} from "@tanstack/react-table";
import type { DataGridFeatures } from "./dataGridTypes";
import { windowHeaderRow, windowLeafCells, type ColumnWindow } from "./columnVirtual";
import { FilterPopover, isFilterActive, type GridFilter } from "./filters";
import { HeaderColumnMenu } from "./HeaderColumnMenu";
import { SortIcon } from "./icons";
import type { PivotRow } from "./pivot";

type HeaderDensityStyle = { header: string; cell: string };

type DataGridHeaderProps<TData extends object> = {
  table: Table<TData | PivotRow<TData>>;
  visibleLeafColumns: Column<TData | PivotRow<TData>, unknown>[];
  isPivotLayout: boolean;
  features: DataGridFeatures;
  densityStyle: HeaderDensityStyle;
  headerWrap: boolean;
  currentSorting: SortingState;
  selectedColumnIds: string[];
  headerFilterById: Map<string, GridFilter>;
  columnWindow: ColumnWindow | null;
  getColumnControlLabel: (column: Column<TData | PivotRow<TData>, unknown>) => string;
  getHeaderResizeLabel: (column: Column<TData | PivotRow<TData>, unknown>) => string;
  getPinnedColumnStyle: (
    column: Column<TData | PivotRow<TData>, unknown>,
    options?: { header?: boolean; backgroundColor?: string },
  ) => CSSProperties;
  onSortingChange: (sorting: SortingState) => void;
  resetPageIndex: () => void;
  autosizeColumn: (column: Column<TData | PivotRow<TData>, unknown>) => void;
  fitVisibleColumns: () => void;
  resetColumnWidth: (column: Column<TData | PivotRow<TData>, unknown>) => void;
};

export function DataGridHeader<TData extends object>({
  table,
  visibleLeafColumns,
  isPivotLayout,
  features,
  densityStyle,
  headerWrap,
  currentSorting,
  selectedColumnIds,
  headerFilterById,
  columnWindow,
  getColumnControlLabel,
  getHeaderResizeLabel,
  getPinnedColumnStyle,
  onSortingChange,
  resetPageIndex,
  autosizeColumn,
  fitVisibleColumns,
  resetColumnWidth,
}: DataGridHeaderProps<TData>) {
  const headerLabelClass = headerWrap ? "dg-header-label--wrap" : "dg-header-label";

  const renderHeaderCell = (
    header: Header<TData | PivotRow<TData>, unknown>,
    colSpan: number,
  ) => {
    const canSort = header.column.getCanSort();
    const sortState = header.column.getIsSorted();
    const headerFilter =
      isPivotLayout || header.isPlaceholder ? undefined : headerFilterById.get(header.column.id);
    const headerColIndex = visibleLeafColumns.findIndex(
      (column) => column.id === header.column.id,
    );
    const isLeafHeader = headerColIndex >= 0;
    const isSelectedColumn = isLeafHeader && selectedColumnIds.includes(header.column.id);
    const headerLabel = getColumnControlLabel(header.column);
    const headerTitle =
      typeof header.column.columnDef.header === "string"
        ? header.column.columnDef.header
        : undefined;
    const showHeaderMenu =
      features.headerMenu &&
      isLeafHeader &&
      (canSort ||
        Boolean(headerFilter) ||
        header.column.getCanHide() ||
        header.column.getCanPin() ||
        (features.columnResizing && header.column.getCanResize()));

    return (
      <th
        key={header.id}
        scope="col"
        colSpan={colSpan}
        aria-colindex={headerColIndex >= 0 ? headerColIndex + 1 : undefined}
        aria-sort={
          canSort
            ? sortState === "asc"
              ? "ascending"
              : sortState === "desc"
                ? "descending"
                : "none"
            : undefined
        }
        aria-selected={isSelectedColumn ? true : undefined}
        data-column-selected={isSelectedColumn ? "true" : undefined}
        style={{
          width: header.getSize(),
          ...getPinnedColumnStyle(header.column, {
            header: true,
            backgroundColor: isPivotLayout ? "var(--dg-pivot-grand-bg)" : "var(--dg-hover)",
          }),
        }}
        className={`dg-header-cell ${densityStyle.header} ${
          headerWrap ? "dg-header-cell--wrapped" : ""
        } ${isPivotLayout ? "dg-header-cell--pivot" : "dg-header-cell--grid"} ${
          isSelectedColumn ? "dg-header-cell--selected" : ""
        }`}
      >
        {header.isPlaceholder ? null : (
          <div
            className={`dg-header-content ${headerWrap ? "dg-header-content--wrapped" : ""}`}
          >
            <div className="dg-header-main">
              {canSort ? (
                <button
                  type="button"
                  onClick={header.column.getToggleSortingHandler()}
                  title="Click to sort. Shift-click to add to multi-sort."
                  className={`dg-header-sort-button ${
                    headerWrap ? "dg-header-sort-button--wrapped" : ""
                  }`}
                >
                  <span title={headerTitle} className={headerLabelClass}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </span>
                  <SortIcon state={sortState} />
                  {currentSorting.length > 1 && header.column.getSortIndex() >= 0 ? (
                    <span className="dg-sort-order">{header.column.getSortIndex() + 1}</span>
                  ) : null}
                </button>
              ) : (
                <div className="dg-header-label-row">
                  <span title={headerTitle} className={headerLabelClass}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </span>
                </div>
              )}
            </div>
            {headerFilter || showHeaderMenu ? (
              <div
                data-header-tools
                className={`dg-header-tools ${
                  features.headerToolsOnDemand ? "dg-header-tools--on-demand" : ""
                }`}
              >
                {headerFilter ? <FilterPopover filter={headerFilter} variant="icon" /> : null}
                {showHeaderMenu ? (
                  <HeaderColumnMenu
                    label={headerLabel}
                    canSort={canSort}
                    sortState={sortState}
                    canFilter={Boolean(headerFilter)}
                    filterActive={headerFilter ? isFilterActive(headerFilter) : false}
                    canHide={header.column.getCanHide()}
                    canPin={header.column.getCanPin()}
                    pinState={header.column.getIsPinned()}
                    canResize={features.columnResizing && header.column.getCanResize()}
                    onSortAsc={() => onSortingChange([{ id: header.column.id, desc: false }])}
                    onSortDesc={() => onSortingChange([{ id: header.column.id, desc: true }])}
                    onClearSort={() => header.column.clearSorting()}
                    onClearFilter={() => {
                      header.column.setFilterValue(undefined);
                      resetPageIndex();
                    }}
                    onHide={() => header.column.toggleVisibility(false)}
                    onPin={(position) => header.column.pin(position)}
                    onAutosize={() => autosizeColumn(header.column)}
                    onFit={fitVisibleColumns}
                    onResetWidth={() => resetColumnWidth(header.column)}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        )}
        {features.columnResizing && header.column.getCanResize() ? (
          <button
            type="button"
            aria-label={getHeaderResizeLabel(header.column)}
            onDoubleClick={() => header.column.resetSize()}
            onMouseDown={header.getResizeHandler()}
            onTouchStart={header.getResizeHandler()}
            onKeyDown={(event) => {
              const step = event.shiftKey ? 40 : 12;
              const columnId = header.column.id;
              const current = header.getSize();
              const min = header.column.columnDef.minSize ?? 0;
              const max = header.column.columnDef.maxSize ?? Number.POSITIVE_INFINITY;
              if (event.key === "ArrowRight") {
                event.preventDefault();
                table.setColumnSizing((sizing) => ({
                  ...sizing,
                  [columnId]: Math.min(max, current + step),
                }));
              } else if (event.key === "ArrowLeft") {
                event.preventDefault();
                table.setColumnSizing((sizing) => ({
                  ...sizing,
                  [columnId]: Math.max(min, current - step),
                }));
              } else if (event.key === "Enter" || event.key === "Home") {
                event.preventDefault();
                header.column.resetSize();
              }
            }}
            className={`dg-resize-handle ${
              header.column.getIsResizing() ? "dg-resize-handle--active" : ""
            }`}
          />
        ) : null}
      </th>
    );
  };

  const renderFilterCell = (column: Column<TData | PivotRow<TData>, unknown>) => {
    const filter = headerFilterById.get(column.id);
    return (
      <td
        key={column.id}
        style={{
          width: column.getSize(),
          ...getPinnedColumnStyle(column, {
            header: true,
            backgroundColor: "var(--dg-surface)",
          }),
        }}
        className={`dg-floating-filter-cell ${densityStyle.cell}`}
      >
        {filter ? <FilterPopover filter={filter} variant="inline" /> : null}
      </td>
    );
  };

  return (
    <thead className={`dg-thead ${isPivotLayout ? "dg-thead--pivot" : "dg-thead--grid"}`}>
      {table.getHeaderGroups().map((headerGroup, headerRowIndex) => (
        <tr key={headerGroup.id} aria-rowindex={headerRowIndex + 1}>
          {columnWindow
            ? windowHeaderRow({
                headers: headerGroup.headers,
                // getLeafHeaders() is not a pure leaf set: for any header with
                // subHeaders, TanStack's recursion pushes the descendant
                // leaves AND then the header itself (table-core's
                // getLeafHeaders recurses into subHeaders unconditionally,
                // then unconditionally pushes the header too — see
                // @tanstack/table-core core/headers.ts). For a real group
                // header the extra self-id (e.g. "g-early") never matches a
                // real leaf id, so it's harmless; for a depth-0 placeholder
                // header mirroring a single standalone leaf column, the
                // "self" push duplicates that same leaf's own id, which
                // would double-count it in the colSpan clip below. Dedupe.
                getLeafIds: (header) => [
                  ...new Set(header.getLeafHeaders().map((leaf) => leaf.column.id)),
                ],
                getPinned: (header) =>
                  header.getLeafHeaders()[0]?.column.getIsPinned() ?? false,
                window: columnWindow,
              }).map((entry) =>
                entry.kind === "header" ? (
                  renderHeaderCell(entry.item, entry.colSpan)
                ) : (
                  <th
                    key={`dg-header-spacer-${entry.side}-${headerGroup.id}`}
                    aria-hidden="true"
                    className="dg-cell-spacer"
                  />
                ),
              )
            : headerGroup.headers.map((header) => renderHeaderCell(header, header.colSpan))}
        </tr>
      ))}
      {features.floatingFilters && !isPivotLayout ? (
        <tr>
          {columnWindow
            ? windowLeafCells({
                items: table.getVisibleLeafColumns(),
                getId: (column) => column.id,
                getPinned: (column) => column.getIsPinned(),
                window: columnWindow,
              }).map((entry) =>
                entry.kind === "cell" ? (
                  renderFilterCell(entry.item)
                ) : (
                  <td
                    key={`dg-filter-spacer-${entry.side}`}
                    aria-hidden="true"
                    className="dg-cell-spacer"
                  />
                ),
              )
            : table.getVisibleLeafColumns().map(renderFilterCell)}
        </tr>
      ) : null}
    </thead>
  );
}
