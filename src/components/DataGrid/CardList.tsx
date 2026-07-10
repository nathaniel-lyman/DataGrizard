import type { Row } from "@tanstack/react-table";
import type { Virtualizer } from "@tanstack/react-virtual";
import type { ReactNode } from "react";
import type { DataGridCardConfig } from "../../types/grid";
import type { FormatOptions } from "../../utils/formatters";
import type { CardRoles } from "./cardComposition";
import { getColumnSearchText, renderCellValue, type AnyColumnConfig } from "./cells";
import { colorScaleStyle, computeBarGeometry, type NumericDomain } from "./cellEffects";

// Card-mode render path. Rows come from the SAME table instance as the grid —
// sorting/filter/pagination state is untouched; only presentation changes.
// List semantics (not ARIA grid): each card is one focusable element.
type CardListProps<TData extends object> = {
  rows: Row<TData>[];
  roles: CardRoles<TData>;
  card?: DataGridCardConfig<TData>;
  formatOptions: FormatOptions;
  columnDomains: Map<string, NumericDomain>;
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
  columnDomains,
}: {
  row: TData;
  roles: CardRoles<TData>;
  formatOptions: FormatOptions;
  columnDomains: Map<string, NumericDomain>;
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
      <div className="dg-card-header">
        <span className="dg-card-title">
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
        <div className="dg-card-subtitle">{subtitleText}</div>
      ) : null}
      {roles.metrics.length > 0 ? (
        <div className="dg-card-metrics">
          {roles.metrics.map((column) => (
            <div key={column.accessorKey as string} className="dg-card-metric">
              <div className="dg-card-metric-label">
                {column.header}
              </div>
              {(() => {
                const value = row[column.accessorKey as keyof TData];
                const domain = columnDomains.get(column.accessorKey as string);
                const tint = column.colorScale
                  ? colorScaleStyle(value, column.colorScale, domain)
                  : null;
                const bar = column.dataBar
                  ? computeBarGeometry(value, column.dataBar, domain)
                  : null;
                return (
                  <>
                    <div
                      data-card-tint={tint ? "" : undefined}
                      style={tint ?? undefined}
                      className={`dg-card-metric-value ${
                        tint ? "dg-card-metric-value--tinted" : ""
                      }`}
                    >
                      {renderCellValue(column, value, row, formatOptions)}
                    </div>
                    {bar ? (
                      <div className="dg-card-data-bar">
                        <div
                          data-card-bar
                          className="dg-card-data-bar-fill"
                          style={{
                            width: `${bar.widthPct}%`,
                            marginLeft: `${bar.leftPct}%`,
                            backgroundColor: bar.negative
                              ? column.dataBar?.negativeColor ?? "var(--dg-data-bar-negative)"
                              : column.dataBar?.color ?? "var(--dg-data-bar)",
                          }}
                        />
                      </div>
                    ) : null}
                  </>
                );
              })()}
            </div>
          ))}
        </div>
      ) : null}
      {metaText ? (
        <div className="dg-card-meta">{metaText}</div>
      ) : null}
    </>
  );
}

export function CardList<TData extends object>({
  rows,
  roles,
  card,
  formatOptions,
  columnDomains,
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
      <CardBody
        row={row.original}
        roles={roles}
        formatOptions={formatOptions}
        columnDomains={columnDomains}
      />
    );
    const cardClass = `dg-card ${
      isActive ? "dg-card--active" : ""
    } ${getRowClassName?.(row.original) ?? ""}`;
    return (
      <li key={row.id} data-index={index} ref={measureRef}>
        {hasRowAction ? (
          <button
            type="button"
            onClick={() => onCardClick(row.original)}
            aria-expanded={isActive}
            className={`${cardClass} dg-card--actionable`}
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
    <ul role="list" aria-label={label} className="dg-card-list">
      {items}
    </ul>
  );
}
