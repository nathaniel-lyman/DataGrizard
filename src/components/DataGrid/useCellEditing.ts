// Inline cell-editing state machine: which cell is editing, whether a cell is
// editable, and begin/cancel/commit transitions. The grid never mutates `data`
// — commit emits onCellEdit and the consumer updates the data prop. Depends on
// focusCell + navColumnIds from useCellFocus (one-directional). DataGrid types
// are import-type-only (erased, no runtime cycle).
import { useState } from "react";
import type { Row } from "@tanstack/react-table";
import { isPivotRow, uniqueColumnValues } from "./gridHelpers";
import type { AnyColumnConfig } from "./cells";
import type { PivotRow } from "./pivot";
import type { DataGridCellEdit } from "./dataGridTypes";

type UseCellEditingOptions<TData extends object> = {
  editingEnabled: boolean;
  columnsById: Map<string, AnyColumnConfig<TData>>;
  navColumnIds: string[];
  data: TData[];
  onCellEdit?: (edit: DataGridCellEdit<TData>) => void;
  focusCell: (rowId: string, columnId: string) => void;
};

export function useCellEditing<TData extends object>({
  editingEnabled,
  columnsById,
  navColumnIds,
  data,
  onCellEdit,
  focusCell,
}: UseCellEditingOptions<TData>) {
  const [editingCell, setEditingCell] = useState<{ rowId: string; columnId: string } | null>(null);

  const isCellEditable = (row: Row<TData | PivotRow<TData>>, columnId: string) => {
    if (!editingEnabled || isPivotRow(row.original)) {
      return false;
    }
    const column = columnsById.get(columnId);
    if (!column?.editable) {
      return false;
    }
    const source = row.original as TData;
    return typeof column.editable === "function" ? column.editable(source) : column.editable;
  };
  const nextEditableColumnId = (row: Row<TData | PivotRow<TData>>, columnId: string) => {
    for (let i = navColumnIds.indexOf(columnId) + 1; i < navColumnIds.length; i += 1) {
      if (isCellEditable(row, navColumnIds[i])) {
        return navColumnIds[i];
      }
    }
    return null;
  };
  const beginEdit = (rowId: string, columnId: string) => setEditingCell({ rowId, columnId });
  const cancelEdit = (rowId: string, columnId: string) => {
    setEditingCell(null);
    focusCell(rowId, columnId);
  };
  // The grid never mutates `data`: it emits onCellEdit and the consumer updates
  // the data prop. Tab advances to the next editable cell in the row.
  const commitEdit = (
    row: Row<TData | PivotRow<TData>>,
    columnId: string,
    value: unknown,
    advance: boolean,
  ) => {
    const source = row.original as TData;
    const previousValue = (source as Record<string, unknown>)[columnId];
    onCellEdit?.({ rowId: row.id, row: source, columnId, value, previousValue });
    if (advance) {
      const nextColumnId = nextEditableColumnId(row, columnId);
      if (nextColumnId) {
        beginEdit(row.id, nextColumnId);
        return;
      }
    }
    setEditingCell(null);
    focusCell(row.id, columnId);
  };
  const statusEditOptions = (columnId: string) => {
    const column = columnsById.get(columnId);
    const styleKeys = column?.statusStyles ? Object.keys(column.statusStyles) : [];
    return styleKeys.length > 0 ? styleKeys : uniqueColumnValues(data, columnId as Extract<keyof TData, string>);
  };

  return {
    editingCell,
    isCellEditable,
    beginEdit,
    cancelEdit,
    commitEdit,
    statusEditOptions,
  };
}
