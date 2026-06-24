import type { RetailItem } from "../data/mockRetailData";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatSignedPercent,
  formatStatusLabel,
} from "../utils/formatters";

type RetailDetailPanelProps = {
  item: RetailItem | null;
};

const DetailRow = ({ label, value }: { label: string; value: string }) => (
  <div className="grid grid-cols-[104px_1fr] gap-3 border-b border-slate-100 py-2 text-xs">
    <dt className="font-medium text-slate-500">{label}</dt>
    <dd className="font-semibold text-slate-900">{value}</dd>
  </div>
);

export function RetailDetailPanel({ item }: RetailDetailPanelProps) {
  return (
    <aside className="flex max-h-72 min-h-0 w-full flex-col border-t border-slate-200 bg-white lg:max-h-none lg:w-80 lg:border-l lg:border-t-0">
      <div className="border-b border-slate-200 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Item detail
        </p>
        <h2 className="mt-1 truncate text-sm font-semibold text-slate-950">
          {item ? item.item_name : "Select a row"}
        </h2>
      </div>

      {item ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <dl className="px-4 py-2">
            <DetailRow label="Item ID" value={item.item_id} />
            <DetailRow label="Department" value={item.department} />
            <DetailRow label="Category" value={item.category} />
            <DetailRow label="Brand" value={item.brand} />
            <DetailRow label="Sales" value={formatCurrency(item.sales)} />
            <DetailRow label="Units" value={formatNumber(item.units)} />
            <DetailRow label="Margin" value={formatPercent(item.margin_rate)} />
            <DetailRow label="Price gap" value={formatSignedPercent(item.price_gap)} />
            <DetailRow label="Status" value={formatStatusLabel(item.recommendation_status)} />
          </dl>

          <div className="mt-auto border-t border-slate-200 p-4">
            <div className="grid grid-cols-1 gap-2">
              <button className="h-8 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white transition hover:bg-slate-700">
                Approve
              </button>
              <button className="h-8 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 transition hover:bg-slate-50">
                Reject
              </button>
              <button className="h-8 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 transition hover:bg-slate-50">
                Investigate
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="px-4 py-6 text-sm text-slate-500">
          Click a grid row to inspect recommendation context and take action.
        </div>
      )}
    </aside>
  );
}
