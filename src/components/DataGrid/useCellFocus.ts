// Roving-tabindex focus geometry for the cell grid: the navigable row/column id
// arrays, the single tab-stop cell, the cell-ref map, and focusCell (which
// scrolls a virtualized row into range and defers focus to the row's mount).
// The keyboard precedence chain (onCellKeyDown) stays in DataGrid as the
// orchestrator that wires focus + editing + row actions together.
import { useEffect, useMemo, useRef, useState } from "react";
import type { Row, Table } from "@tanstack/react-table";
import type { Virtualizer } from "@tanstack/react-virtual";
import type { PivotRow } from "./pivot";
import type { DataGridFocusedCell } from "./DataGrid";

type UseCellFocusOptions<TData extends object> = {
  visibleRows: Row<TData | PivotRow<TData>>[];
  isPivotLayout: boolean;
  table: Table<TData | PivotRow<TData>>;
  floatingFiltersEnabled: boolean;
  nonNavigableColumnIds?: string[];
  virtualizeRows: boolean;
  rowVirtualizer: Virtualizer<HTMLDivElement, Element>;
  onFocusedCellChange?: (cell: DataGridFocusedCell) => void;
};

export function useCellFocus<TData extends object>({
  visibleRows,
  isPivotLayout,
  table,
  floatingFiltersEnabled,
  nonNavigableColumnIds = ["select"],
  virtualizeRows,
  rowVirtualizer,
  onFocusedCellChange,
}: UseCellFocusOptions<TData>) {
  const [focusedCell, setFocusedCell] = useState<DataGridFocusedCell>(null);
  const cellRefs = useRef<Map<string, HTMLTableCellElement>>(new Map());
  const pendingFocusKey = useRef<string | null>(null);

  // Group rows render a single spanning toggle button (already Tab-focusable) and
  // the select column hosts its own checkbox, so neither participates in the cell
  // grid. The grid is therefore leaf data rows × non-select visible leaf columns.
  const navColumnIds = table
    .getVisibleLeafColumns()
    .map((column) => column.id)
    .filter((id) => !nonNavigableColumnIds.includes(id));
  const navRowIds = visibleRows
    .filter((row) => isPivotLayout || !row.getIsGrouped())
    .map((row) => row.id);
  const rowVisibleIndexById = useMemo(
    () => new Map(visibleRows.map((row, index) => [row.id, index])),
    [visibleRows],
  );
  const headerRowCount =
    table.getHeaderGroups().length + (floatingFiltersEnabled && !isPivotLayout ? 1 : 0);
  const cellKey = (rowId: string, columnId: string) => `${rowId}\u0000${columnId}`;
  const focusInGrid =
    focusedCell != null &&
    navRowIds.includes(focusedCell.rowId) &&
    navColumnIds.includes(focusedCell.columnId);
  const fallbackTabCell: DataGridFocusedCell =
    navRowIds.length > 0 && navColumnIds.length > 0
      ? { rowId: navRowIds[0], columnId: navColumnIds[0] }
      : null;
  const activeTabCell = focusInGrid ? focusedCell : fallbackTabCell;

  const updateFocusedCell = (cell: DataGridFocusedCell) => {
    setFocusedCell(cell);
    onFocusedCellChange?.(cell);
  };
  const focusCell = (rowId: string, columnId: string) => {
    updateFocusedCell({ rowId, columnId });
    const key = cellKey(rowId, columnId);
    const existing = cellRefs.current.get(key);
    if (existing) {
      existing.focus();
      return;
    }
    // Target row is outside the virtual window: scroll it into range and defer
    // focus to the pending-focus effect, which fires once the row mounts (a
    // single rAF is not enough for variable-height rows / large jumps).
    if (virtualizeRows) {
      const index = rowVisibleIndexById.get(rowId);
      if (index != null) {
        rowVirtualizer.scrollToIndex(index, { align: "auto" });
      }
      pendingFocusKey.current = key;
    }
  };

  // Focuses a cell that focusCell scrolled into range, once the virtualizer
  // mounts its row. Runs every render; a cheap no-op while nothing pends.
  useEffect(() => {
    const key = pendingFocusKey.current;
    if (!key) {
      return;
    }
    const node = cellRefs.current.get(key);
    if (node) {
      node.focus();
      pendingFocusKey.current = null;
    }
  });

  return {
    navColumnIds,
    navRowIds,
    rowVisibleIndexById,
    headerRowCount,
    activeTabCell,
    cellKey,
    cellRefs,
    focusCell,
    updateFocusedCell,
  };
}
