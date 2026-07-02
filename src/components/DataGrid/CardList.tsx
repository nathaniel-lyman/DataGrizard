import type { Row } from "@tanstack/react-table";
import type { Virtualizer } from "@tanstack/react-virtual";
import type { ReactNode } from "react";
import type { DataGridCardConfig } from "../../types/grid";
import type { FormatOptions } from "../../utils/formatters";
import type { CardRoles } from "./cardComposition";
import { getColumnSearchText, renderCellValue, type AnyColumnConfig } from "./cells";

// Card-mode render path. Rows come from the SAME table instance as the grid —
// sorting/filter/pagination state is untouched; only presentation changes.
// List semantics (not ARIA grid): each card is one focusable element.
type CardListProps<TData extends object> = {
  rows: Row<TData>[];
  roles: CardRoles<TData>;
  card?: DataGridCardConfig<TData>;
  formatOptions: FormatOptions;
  activeRow: TData | null;
  hasRowAction: boolean;
  onCardClick: (row: TData) => void;
  getRowClassName?: (row: TData) => string;
  virtualizeRows: boolean;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  label?: string;
};

const plainText = <TData extends object>(
  column: AnyColumnConfig<TData>,
  row: TData,
  formatOptions: FormatOptions,
): string =>
  getColumnSearchText(column, row[column.accessorKey as keyof TData], row, formatOptions);

function CardBody<TData extends object>({
  row,
  roles,
  formatOptions,
}: {
  row: TData;
  roles: CardRoles<TData>;
  formatOptions: FormatOptions;
}) {
  const subtitleText = roles.subtitle
    .map((column) => plainText(column, row, formatOptions))
    .filter(Boolean)
    .join(" · ");
  const metaText = roles.meta
    .map((column) => {
      const text = plainText(column, row, formatOptions);
      return text ? `${column.header}: ${text}` : "";
    })
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-semibold text-slate-900">
          {roles.title
            ? renderCellValue(
                roles.title,
                row[roles.title.accessorKey as keyof TData],
                row,
                formatOptions,
              )
            : null}
        </span>
        {roles.badge
          ? renderCellValue(
              roles.badge,
              row[roles.badge.accessorKey as keyof TData],
              row,
              formatOptions,
            )
          : null}
      </div>
      {subtitleText ? (
        <div className="mt-0.5 truncate text-xs text-slate-500">{subtitleText}</div>
      ) : null}
      {roles.metrics.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
          {roles.metrics.map((column) => (
            <div key={column.accessorKey as string} className="min-w-0">
              <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                {column.header}
              </div>
              <div className="text-sm font-semibold tabular-nums text-slate-900">
                {renderCellValue(
                  column,
                  row[column.accessorKey as keyof TData],
                  row,
                  formatOptions,
                )}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {metaText ? (
        <div className="mt-2 truncate text-[11px] text-slate-400">{metaText}</div>
      ) : null}
    </>
  );
}

export function CardList<TData extends object>({
  rows,
  roles,
  card,
  formatOptions,
  activeRow,
  hasRowAction,
  onCardClick,
  getRowClassName,
  virtualizeRows,
  virtualizer,
  label,
}: CardListProps<TData>) {
  const renderCard = (row: Row<TData>, index: number, measureRef?: (el: Element | null) => void): ReactNode => {
    const isActive = activeRow === row.original;
    const content = card?.renderCard ? (
      card.renderCard(row.original, { isActive })
    ) : (
      <CardBody row={row.original} roles={roles} formatOptions={formatOptions} />
    );
    const cardClass = `block w-full rounded-lg border bg-white p-3 text-left shadow-sm transition ${
      isActive ? "border-slate-400 ring-2 ring-inset ring-slate-400" : "border-slate-200"
    } ${getRowClassName?.(row.original) ?? ""}`;
    return (
      <li key={row.id} data-index={index} ref={measureRef}>
        {hasRowAction ? (
          <button
            type="button"
            onClick={() => onCardClick(row.original)}
            aria-expanded={isActive}
            className={`${cardClass} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400`}
          >
            {content}
          </button>
        ) : (
          <div className={cardClass}>{content}</div>
        )}
      </li>
    );
  };

  let items: ReactNode;
  if (virtualizeRows) {
    const virtualItems = virtualizer.getVirtualItems();
    const totalSize = virtualizer.getTotalSize();
    const topSpacer = virtualItems.length > 0 ? virtualItems[0].start : 0;
    const bottomSpacer =
      virtualItems.length > 0 ? totalSize - virtualItems[virtualItems.length - 1].end : 0;
    items = (
      <>
        {topSpacer > 0 ? <li aria-hidden="true" style={{ height: topSpacer }} /> : null}
        {virtualItems.map((virtualItem) => {
          const row = rows[virtualItem.index];
          return row ? renderCard(row, virtualItem.index, virtualizer.measureElement) : null;
        })}
        {bottomSpacer > 0 ? <li aria-hidden="true" style={{ height: bottomSpacer }} /> : null}
      </>
    );
  } else {
    items = rows.map((row, index) => renderCard(row, index));
  }

  return (
    <ul role="list" aria-label={label} className="flex flex-col gap-2 p-3">
      {items}
    </ul>
  );
}
