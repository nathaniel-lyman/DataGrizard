import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { Column, Row, Table, Updater } from "@tanstack/react-table";
import type { FormatOptions } from "../../utils/formatters";
import { toTsv, writeClipboardText } from "../../utils/export";
import { normalizeClipboardInput, parseClipboardTsv } from "./clipboard";
import { computeEditError, parseEditValue, type EditCellColumn } from "./cellEditor";
import { getColumnSearchText, type AnyColumnConfig } from "./cells";
import type {
  DataGridCellEdit,
  DataGridCellEditBatchSource,
  DataGridCellRange,
  DataGridFeatures,
  DataGridFocusedCell,
  DataGridProps,
} from "./dataGridTypes";
import { ROW_ACTIONS_COLUMN_ID, SELECT_COLUMN_ID } from "./gridConstants";
import { isPivotRow } from "./gridHelpers";
import type { PivotRow } from "./pivot";

type NormalizedCellRange = {
  rowIds: string[];
  columnIds: string[];
  startRowIdx: number;
  startColIdx: number;
  area: number;
};

type CellRangeInteractionsArgs<TData extends object> = {
  features: DataGridFeatures;
  isPivotLayout: boolean;
  table: Table<TData | PivotRow<TData>>;
  data: TData[];
  columnsById: Map<string, AnyColumnConfig<TData>>;
  formatOptions: FormatOptions;
  locale?: string;
  navRowIds: string[];
  navColumnIds: string[];
  rowById: Map<string, Row<TData | PivotRow<TData>>>;
  activeTabCell: Exclude<DataGridFocusedCell, null> | null;
  cellSelection: DataGridCellRange | null;
  onCellSelectionChange: (updater: Updater<DataGridCellRange | null>) => void;
  cellKey: (rowId: string, columnId: string) => string;
  focusCell: (rowId: string, columnId: string) => void;
  editingCell: DataGridFocusedCell;
  isCellEditable: (row: Row<TData | PivotRow<TData>>, columnId: string) => boolean;
  beginEdit: (rowId: string, columnId: string) => void;
  hasLeafRowAction: boolean;
  handleRowClick: (row: TData) => void;
  onCellEdit?: DataGridProps<TData>["onCellEdit"];
  onCellEditBatch?: DataGridProps<TData>["onCellEditBatch"];
};

export function useCellRangeInteractions<TData extends object>({
  features,
  isPivotLayout,
  table,
  data,
  columnsById,
  formatOptions,
  locale,
  navRowIds,
  navColumnIds,
  rowById,
  activeTabCell,
  cellSelection,
  onCellSelectionChange: setCellSelection,
  cellKey,
  focusCell,
  editingCell,
  isCellEditable,
  beginEdit,
  hasLeafRowAction,
  handleRowClick,
  onCellEdit,
  onCellEditBatch,
}: CellRangeInteractionsArgs<TData>) {
  const cellSelectionEnabled = features.cellSelection && !isPivotLayout;
  const fillHandleEnabled = features.fillHandle && cellSelectionEnabled;
  const [clipboardNotice, setClipboardNotice] = useState<{
    id: number;
    message: string;
    tone: "success" | "error";
  } | null>(null);
  const clipboardNoticeIdRef = useRef(0);
  const isSelectingCellsRef = useRef(false);
  const suppressNextCellClickRef = useRef(false);
  const isFillDraggingRef = useRef(false);
  const fillSourceRef = useRef<DataGridCellRange | null>(null);
  const [fillPreview, setFillPreview] = useState<DataGridCellRange | null>(null);
  const fillPreviewRef = useRef<DataGridCellRange | null>(null);
  const commitFillRef = useRef<(source: DataGridCellRange, target: DataGridCellRange) => void>(() => {});

  useEffect(() => {
    fillPreviewRef.current = fillPreview;
  }, [fillPreview]);

  useEffect(() => {
    if (!clipboardNotice) return;
    const timeout = window.setTimeout(() => setClipboardNotice(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [clipboardNotice]);

  const announceClipboard = (message: string, tone: "success" | "error" = "success") => {
    clipboardNoticeIdRef.current += 1;
    setClipboardNotice({ id: clipboardNoticeIdRef.current, message, tone });
  };

  const emitCellEditBatch = (
    source: DataGridCellEditBatchSource,
    edits: DataGridCellEdit<TData>[],
    skippedCellCount: number,
  ) => {
    if (onCellEditBatch) {
      onCellEditBatch({ source, edits, skippedCellCount });
      return;
    }
    edits.forEach((edit) => onCellEdit?.(edit));
  };

  const normalizeCellRange = (range: DataGridCellRange | null): NormalizedCellRange | null => {
    if (!range) return null;
    const anchorRowIdx = navRowIds.indexOf(range.anchor.rowId);
    const focusRowIdx = navRowIds.indexOf(range.focus.rowId);
    const anchorColIdx = navColumnIds.indexOf(range.anchor.columnId);
    const focusColIdx = navColumnIds.indexOf(range.focus.columnId);
    if (anchorRowIdx < 0 || focusRowIdx < 0 || anchorColIdx < 0 || focusColIdx < 0) {
      return null;
    }
    const startRowIdx = Math.min(anchorRowIdx, focusRowIdx);
    const endRowIdx = Math.max(anchorRowIdx, focusRowIdx);
    const startColIdx = Math.min(anchorColIdx, focusColIdx);
    const endColIdx = Math.max(anchorColIdx, focusColIdx);
    const rowIds = navRowIds.slice(startRowIdx, endRowIdx + 1);
    const columnIds = navColumnIds.slice(startColIdx, endColIdx + 1);
    return {
      rowIds,
      columnIds,
      startRowIdx,
      startColIdx,
      area: rowIds.length * columnIds.length,
    };
  };

  const clampToDownRight = (
    source: DataGridCellRange,
    hovered: Exclude<DataGridFocusedCell, null>,
  ): DataGridCellRange | null => {
    const normalizedSource = normalizeCellRange(source);
    if (!normalizedSource) return null;
    const hoveredRowIdx = navRowIds.indexOf(hovered.rowId);
    const hoveredColIdx = navColumnIds.indexOf(hovered.columnId);
    if (hoveredRowIdx < 0 || hoveredColIdx < 0) return null;
    const sourceEndRowIdx = normalizedSource.startRowIdx + normalizedSource.rowIds.length - 1;
    const sourceEndColIdx = normalizedSource.startColIdx + normalizedSource.columnIds.length - 1;
    return {
      anchor: {
        rowId: navRowIds[normalizedSource.startRowIdx],
        columnId: navColumnIds[normalizedSource.startColIdx],
      },
      focus: {
        rowId: navRowIds[Math.max(hoveredRowIdx, sourceEndRowIdx)],
        columnId: navColumnIds[Math.max(hoveredColIdx, sourceEndColIdx)],
      },
    };
  };

  const selectedCellKeys = useMemo(() => {
    const normalized = normalizeCellRange(cellSelection);
    const keys = new Set<string>();
    normalized?.rowIds.forEach((rowId) => {
      normalized.columnIds.forEach((columnId) => keys.add(cellKey(rowId, columnId)));
    });
    return keys;
    // normalizeCellRange intentionally closes over the navigation arrays.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cellKey, cellSelection, navColumnIds, navRowIds]);

  const fillHandleTargetCell = useMemo(() => {
    if (!fillHandleEnabled) return null;
    const normalized = normalizeCellRange(cellSelection);
    return normalized
      ? {
          rowId: normalized.rowIds[normalized.rowIds.length - 1],
          columnId: normalized.columnIds[normalized.columnIds.length - 1],
        }
      : activeTabCell;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabCell, cellSelection, fillHandleEnabled, navColumnIds, navRowIds]);

  const fillPreviewCellKeys = useMemo(() => {
    const normalizedPreview = normalizeCellRange(fillPreview);
    if (!normalizedPreview) return new Set<string>();
    const normalizedSource = normalizeCellRange(fillSourceRef.current);
    const sourceKeys = new Set<string>();
    normalizedSource?.rowIds.forEach((rowId) => {
      normalizedSource.columnIds.forEach((columnId) => sourceKeys.add(cellKey(rowId, columnId)));
    });
    const keys = new Set<string>();
    normalizedPreview.rowIds.forEach((rowId) => {
      normalizedPreview.columnIds.forEach((columnId) => {
        const key = cellKey(rowId, columnId);
        if (!sourceKeys.has(key)) keys.add(key);
      });
    });
    return keys;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cellKey, fillPreview, navColumnIds, navRowIds]);

  const beginCellSelection = (
    cell: Exclude<DataGridFocusedCell, null>,
    extendFromExisting: boolean,
  ) => {
    if (!cellSelectionEnabled) return;
    setCellSelection((current) => ({
      anchor: extendFromExisting ? current?.anchor ?? activeTabCell ?? cell : cell,
      focus: cell,
    }));
  };

  const extendCellSelection = (cell: Exclude<DataGridFocusedCell, null>) => {
    if (!cellSelectionEnabled) return;
    setCellSelection((current) => {
      const anchor = current?.anchor ?? activeTabCell ?? cell;
      if (anchor.rowId !== cell.rowId || anchor.columnId !== cell.columnId) {
        suppressNextCellClickRef.current = true;
      }
      return { anchor, focus: cell };
    });
  };

  const commitFill = (source: DataGridCellRange, target: DataGridCellRange) => {
    if (!features.editing || (!onCellEdit && !onCellEditBatch)) return;
    const normalizedSource = normalizeCellRange(source);
    const normalizedTarget = normalizeCellRange(target);
    if (!normalizedSource || !normalizedTarget) return;
    const sourceKeys = new Set<string>();
    normalizedSource.rowIds.forEach((rowId) => {
      normalizedSource.columnIds.forEach((columnId) => sourceKeys.add(cellKey(rowId, columnId)));
    });
    const edits: DataGridCellEdit<TData>[] = [];
    let skippedCellCount = 0;
    normalizedTarget.rowIds.forEach((targetRowId, rowIdx) => {
      const targetRow = rowById.get(targetRowId);
      if (!targetRow) return;
      normalizedTarget.columnIds.forEach((targetColumnId, colIdx) => {
        if (sourceKeys.has(cellKey(targetRowId, targetColumnId))) return;
        const columnConfig = columnsById.get(targetColumnId);
        if (!columnConfig || !isCellEditable(targetRow, targetColumnId)) {
          skippedCellCount += 1;
          return;
        }
        const sourceRowId = normalizedSource.rowIds[rowIdx % normalizedSource.rowIds.length];
        const sourceColumnId =
          normalizedSource.columnIds[colIdx % normalizedSource.columnIds.length];
        const sourceRow = rowById.get(sourceRowId);
        if (!sourceRow) return;
        const sourceOriginal = sourceRow.original as TData;
        const value = (sourceOriginal as Record<string, unknown>)[sourceColumnId];
        const targetOriginal = targetRow.original as TData;
        if (
          computeEditError(
            columnConfig as unknown as EditCellColumn<TData>,
            value,
            targetOriginal,
          )
        ) {
          skippedCellCount += 1;
          return;
        }
        edits.push({
          rowId: targetRow.id,
          row: targetOriginal,
          columnId: targetColumnId,
          value,
          previousValue: (targetOriginal as Record<string, unknown>)[targetColumnId],
        });
      });
    });
    emitCellEditBatch("fill", edits, skippedCellCount);
  };

  useEffect(() => {
    commitFillRef.current = commitFill;
  }, [commitFill]);

  useEffect(() => {
    const stopSelecting = () => {
      isSelectingCellsRef.current = false;
      if (!isFillDraggingRef.current) return;
      isFillDraggingRef.current = false;
      const source = fillSourceRef.current;
      const preview = fillPreviewRef.current;
      fillSourceRef.current = null;
      if (source && preview) {
        commitFillRef.current(source, preview);
        setCellSelection(preview);
      }
      setFillPreview(null);
    };
    document.addEventListener("mouseup", stopSelecting);
    return () => document.removeEventListener("mouseup", stopSelecting);
  }, []);

  const pasteTextIntoCell = (
    text: string,
    row: Row<TData | PivotRow<TData>>,
    columnId: string,
  ) => {
    if (!features.editing || (!onCellEdit && !onCellEditBatch)) return;
    const matrix = parseClipboardTsv(text);
    if (!matrix.length || !matrix.some((matrixRow) => matrixRow.length > 0)) return;
    const normalized = normalizeCellRange(cellSelection);
    const rangeTarget = normalized && normalized.area > 1 ? normalized : null;
    const startRowIdx = rangeTarget?.startRowIdx ?? navRowIds.indexOf(row.id);
    const startColIdx = rangeTarget?.startColIdx ?? navColumnIds.indexOf(columnId);
    if (startRowIdx < 0 || startColIdx < 0) return;
    const singleClipboardCell = matrix.length === 1 && matrix[0].length === 1;
    const rowCount = rangeTarget?.rowIds.length ?? matrix.length;
    const columnCount =
      rangeTarget?.columnIds.length ?? Math.max(...matrix.map((matrixRow) => matrixRow.length));
    const edits: DataGridCellEdit<TData>[] = [];
    let skippedCellCount = 0;

    for (let rowOffset = 0; rowOffset < rowCount; rowOffset += 1) {
      const targetRowId = navRowIds[startRowIdx + rowOffset];
      const targetRow = targetRowId ? rowById.get(targetRowId) : undefined;
      if (!targetRow) {
        skippedCellCount += columnCount;
        continue;
      }
      for (let columnOffset = 0; columnOffset < columnCount; columnOffset += 1) {
        const targetColumnId = navColumnIds[startColIdx + columnOffset];
        const columnConfig = targetColumnId ? columnsById.get(targetColumnId) : undefined;
        const input = singleClipboardCell ? matrix[0][0] : matrix[rowOffset]?.[columnOffset];
        if (
          !targetColumnId ||
          !columnConfig ||
          input === undefined ||
          !isCellEditable(targetRow, targetColumnId)
        ) {
          skippedCellCount += 1;
          continue;
        }
        let value: unknown;
        try {
          const editColumn = columnConfig as unknown as EditCellColumn<TData>;
          const clipboardInput = editColumn.parseValue
            ? input
            : normalizeClipboardInput(input, editColumn.dataType, locale);
          value = parseEditValue(editColumn, clipboardInput);
        } catch {
          skippedCellCount += 1;
          continue;
        }
        const target = targetRow.original as TData;
        if (
          computeEditError(columnConfig as unknown as EditCellColumn<TData>, value, target)
        ) {
          skippedCellCount += 1;
          continue;
        }
        edits.push({
          rowId: targetRow.id,
          row: target,
          columnId: targetColumnId,
          value,
          previousValue: (target as Record<string, unknown>)[targetColumnId],
        });
      }
    }

    emitCellEditBatch("paste", edits, skippedCellCount);
    if (edits.length === 0) {
      announceClipboard(
        skippedCellCount > 0
          ? `Nothing pasted; ${skippedCellCount} ${skippedCellCount === 1 ? "cell was" : "cells were"} invalid, read-only, or outside the grid.`
          : "Nothing pasted.",
        "error",
      );
    } else {
      announceClipboard(
        `Pasted ${edits.length} ${edits.length === 1 ? "cell" : "cells"}${
          skippedCellCount > 0 ? `; skipped ${skippedCellCount}` : ""
        }.`,
      );
    }
  };

  const onCellPaste = (
    event: ReactClipboardEvent<HTMLTableCellElement>,
    row: Row<TData | PivotRow<TData>>,
    columnId: string,
  ) => {
    if (!features.clipboard || !features.editing || (!onCellEdit && !onCellEditBatch)) return;
    const text = event.clipboardData.getData("text/plain");
    if (text === "") {
      announceClipboard("Clipboard does not contain text to paste.", "error");
      return;
    }
    pasteTextIntoCell(text, row, columnId);
    event.preventDefault();
  };

  const getCellText = (
    row: Row<TData | PivotRow<TData>>,
    column: Column<TData | PivotRow<TData>, unknown>,
  ) => {
    const value = row.getValue(column.id);
    if (isPivotRow(row.original)) return value == null ? "" : String(value);
    const columnConfig = columnsById.get(column.id);
    return columnConfig
      ? getColumnSearchText(columnConfig, value, row.original as TData, formatOptions)
      : value == null
        ? ""
        : String(value);
  };

  const copyFromCell = (row: Row<TData | PivotRow<TData>>, columnId: string) => {
    const columns = table
      .getVisibleLeafColumns()
      .filter((column) => column.id !== SELECT_COLUMN_ID && column.id !== ROW_ACTIONS_COLUMN_ID);
    const selected = isPivotLayout
      ? []
      : table.getSelectedRowModel().flatRows.filter((selectedRow) => !selectedRow.getIsGrouped());
    const focusedColumn = table.getColumn(columnId);
    const normalized = normalizeCellRange(cellSelection);
    const rangeMatrix =
      normalized && normalized.area > 1
        ? normalized.rowIds.map((rowId) => {
            const selectedRow = rowById.get(rowId);
            return normalized.columnIds.map((selectedColumnId) => {
              const selectedColumn = table.getColumn(selectedColumnId);
              return selectedRow && selectedColumn ? getCellText(selectedRow, selectedColumn) : "";
            });
          })
        : null;
    const matrix = rangeMatrix
      ? rangeMatrix
      : selected.length
        ? selected.map((selectedRow) => columns.map((column) => getCellText(selectedRow, column)))
        : focusedColumn
          ? [[getCellText(row, focusedColumn)]]
          : [];
    if (!matrix.length) return;
    const cellCount = matrix.reduce((count, matrixRow) => count + matrixRow.length, 0);
    void writeClipboardText(toTsv(matrix)).then((copied) => {
      announceClipboard(
        copied
          ? `Copied ${cellCount} ${cellCount === 1 ? "cell" : "cells"}.`
          : "Copy failed. Allow clipboard access and try again.",
        copied ? "success" : "error",
      );
    });
  };

  const navigateTargetForKey = (
    key: string,
    rowIdx: number,
    colIdx: number,
    ctrl: boolean,
  ): Exclude<DataGridFocusedCell, null> | null => {
    const lastRow = navRowIds.length - 1;
    const lastCol = navColumnIds.length - 1;
    const page = 10;
    switch (key) {
      case "ArrowDown":
        return { rowId: navRowIds[Math.min(lastRow, rowIdx + 1)], columnId: navColumnIds[colIdx] };
      case "ArrowUp":
        return { rowId: navRowIds[Math.max(0, rowIdx - 1)], columnId: navColumnIds[colIdx] };
      case "ArrowRight":
        return { rowId: navRowIds[rowIdx], columnId: navColumnIds[Math.min(lastCol, colIdx + 1)] };
      case "ArrowLeft":
        return { rowId: navRowIds[rowIdx], columnId: navColumnIds[Math.max(0, colIdx - 1)] };
      case "Home":
        return ctrl
          ? { rowId: navRowIds[0], columnId: navColumnIds[0] }
          : { rowId: navRowIds[rowIdx], columnId: navColumnIds[0] };
      case "End":
        return ctrl
          ? { rowId: navRowIds[lastRow], columnId: navColumnIds[lastCol] }
          : { rowId: navRowIds[rowIdx], columnId: navColumnIds[lastCol] };
      case "PageDown":
        return { rowId: navRowIds[Math.min(lastRow, rowIdx + page)], columnId: navColumnIds[colIdx] };
      case "PageUp":
        return { rowId: navRowIds[Math.max(0, rowIdx - page)], columnId: navColumnIds[colIdx] };
      default:
        return null;
    }
  };

  const onCellKeyDown = (
    event: ReactKeyboardEvent<HTMLTableCellElement>,
    row: Row<TData | PivotRow<TData>>,
    columnId: string,
  ) => {
    if (editingCell?.rowId === row.id && editingCell?.columnId === columnId) return;
    const rowIdx = navRowIds.indexOf(row.id);
    const colIdx = navColumnIds.indexOf(columnId);
    if (rowIdx < 0 || colIdx < 0) return;
    const ctrl = event.ctrlKey || event.metaKey;
    if (ctrl && (event.key === "c" || event.key === "C")) {
      if (features.clipboard) {
        copyFromCell(row, columnId);
        event.preventDefault();
      }
      return;
    }
    if (ctrl && (event.key === "d" || event.key === "D")) {
      if (fillHandleEnabled) {
        const normalized = normalizeCellRange(cellSelection);
        if (normalized && normalized.rowIds.length > 1) {
          const firstRowId = normalized.rowIds[0];
          const lastColumnId = normalized.columnIds[normalized.columnIds.length - 1];
          commitFill(
            {
              anchor: { rowId: firstRowId, columnId: normalized.columnIds[0] },
              focus: { rowId: firstRowId, columnId: lastColumnId },
            },
            {
              anchor: { rowId: normalized.rowIds[1], columnId: normalized.columnIds[0] },
              focus: {
                rowId: normalized.rowIds[normalized.rowIds.length - 1],
                columnId: lastColumnId,
              },
            },
          );
        }
        event.preventDefault();
      }
      return;
    }
    if (ctrl && (event.key === "r" || event.key === "R")) {
      if (fillHandleEnabled) {
        const normalized = normalizeCellRange(cellSelection);
        if (normalized && normalized.columnIds.length > 1) {
          const firstColumnId = normalized.columnIds[0];
          const lastRowId = normalized.rowIds[normalized.rowIds.length - 1];
          commitFill(
            {
              anchor: { rowId: normalized.rowIds[0], columnId: firstColumnId },
              focus: { rowId: lastRowId, columnId: firstColumnId },
            },
            {
              anchor: { rowId: normalized.rowIds[0], columnId: normalized.columnIds[1] },
              focus: {
                rowId: lastRowId,
                columnId: normalized.columnIds[normalized.columnIds.length - 1],
              },
            },
          );
        }
        event.preventDefault();
      }
      return;
    }
    const navigationTarget = navigateTargetForKey(event.key, rowIdx, colIdx, ctrl);
    if (navigationTarget) {
      if (event.shiftKey && cellSelectionEnabled) extendCellSelection(navigationTarget);
      else setCellSelection(null);
      focusCell(navigationTarget.rowId, navigationTarget.columnId);
      event.preventDefault();
      return;
    }
    let handled = true;
    switch (event.key) {
      case "Enter":
      case "F2":
        if (isCellEditable(row, columnId)) {
          setCellSelection(null);
          beginEdit(row.id, columnId);
        } else if (!isPivotRow(row.original) && hasLeafRowAction) {
          handleRowClick(row.original as TData);
        } else handled = false;
        break;
      case " ":
        setCellSelection(null);
        if (features.rowSelection && !isPivotLayout && row.getCanSelect()) row.toggleSelected();
        else handled = false;
        break;
      default:
        handled = false;
    }
    if (handled) event.preventDefault();
  };

  const getCellRangeState = (rowId: string, columnId: string) => {
    const key = cellKey(rowId, columnId);
    return {
      isSelected: selectedCellKeys.has(key),
      isFillHandle:
        fillHandleTargetCell?.rowId === rowId && fillHandleTargetCell?.columnId === columnId,
      isFillPreview: fillPreviewCellKeys.has(key),
    };
  };

  const onCellClick = (event: ReactMouseEvent<HTMLTableCellElement>) => {
    if (suppressNextCellClickRef.current) {
      event.stopPropagation();
      suppressNextCellClickRef.current = false;
    }
  };

  const onCellMouseDown = (
    event: ReactMouseEvent<HTMLTableCellElement>,
    cell: Exclude<DataGridFocusedCell, null>,
  ) => {
    if (!cellSelectionEnabled || event.button !== 0) return;
    beginCellSelection(cell, event.shiftKey);
    focusCell(cell.rowId, cell.columnId);
    isSelectingCellsRef.current = true;
    if (event.shiftKey) suppressNextCellClickRef.current = true;
  };

  const onCellMouseEnter = (
    event: ReactMouseEvent<HTMLTableCellElement>,
    cell: Exclude<DataGridFocusedCell, null>,
  ) => {
    if (!cellSelectionEnabled) return;
    if (isFillDraggingRef.current && event.buttons === 1) {
      const source = fillSourceRef.current;
      if (source) setFillPreview(clampToDownRight(source, cell));
      return;
    }
    if (isSelectingCellsRef.current && event.buttons === 1) extendCellSelection(cell);
  };

  const onFillHandleMouseDown = (event: ReactMouseEvent<HTMLSpanElement>) => {
    event.stopPropagation();
    if (event.button !== 0) return;
    fillSourceRef.current =
      cellSelection ?? (activeTabCell ? { anchor: activeTabCell, focus: activeTabCell } : null);
    isFillDraggingRef.current = true;
  };

  return {
    cellSelectionEnabled,
    fillHandleEnabled,
    clipboardNotice,
    getCellRangeState,
    onCellClick,
    onCellMouseDown,
    onCellMouseEnter,
    onFillHandleMouseDown,
    onCellKeyDown,
    onCellPaste,
  };
}
