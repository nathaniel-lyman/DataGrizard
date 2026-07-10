import type { ReactNode } from "react";
import type { Row } from "@tanstack/react-table";
import type { Virtualizer } from "@tanstack/react-virtual";
import type { PivotRow } from "./pivot";

export type RowMeasureProps = {
  ref: (node: HTMLTableRowElement | null) => void;
  "data-index": number;
};

type DataGridBodyProps<TData extends object> = {
  visibleRows: Row<TData | PivotRow<TData>>[];
  virtualizeRows: boolean;
  bodyColSpan: number;
  rowVirtualizer: Virtualizer<HTMLDivElement, Element>;
  renderRow: (
    row: Row<TData | PivotRow<TData>>,
    measureProps?: RowMeasureProps,
  ) => ReactNode;
};

export function DataGridBody<TData extends object>({
  visibleRows,
  virtualizeRows,
  bodyColSpan,
  rowVirtualizer,
  renderRow,
}: DataGridBodyProps<TData>) {
  if (!virtualizeRows) {
    return <tbody>{visibleRows.map((row) => renderRow(row))}</tbody>;
  }

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems.length > 0 ? totalSize - virtualItems[virtualItems.length - 1].end : 0;

  return (
    <tbody>
      {paddingTop > 0 ? (
        <tr aria-hidden="true">
          <td colSpan={bodyColSpan} style={{ height: paddingTop, padding: 0, border: 0 }} />
        </tr>
      ) : null}
      {virtualItems.map((virtualItem) =>
        renderRow(visibleRows[virtualItem.index], {
          ref: rowVirtualizer.measureElement,
          "data-index": virtualItem.index,
        }),
      )}
      {paddingBottom > 0 ? (
        <tr aria-hidden="true">
          <td colSpan={bodyColSpan} style={{ height: paddingBottom, padding: 0, border: 0 }} />
        </tr>
      ) : null}
    </tbody>
  );
}
