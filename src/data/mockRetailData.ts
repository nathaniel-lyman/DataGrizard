import { trendIconSet, type DataGridSummaryItem } from "../components/DataGrid";
import type { GridColumnConfig, GridFilterConfig } from "../types/grid";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatSignedPercent,
  formatStatusLabel,
} from "../utils/formatters";

export type RecommendationStatus =
  | "approved"
  | "pending"
  | "rejected"
  | "investigate";

export type RetailItem = {
  item_id: string;
  item_name: string;
  department: string;
  category: string;
  brand: string;
  sales: number;
  units: number;
  margin_rate: number;
  price_gap: number;
  recommendation_status: RecommendationStatus;
  last_restocked_at: string;
  on_promotion: boolean;
};

const departments = ["Grocery", "Apparel", "Home", "Electronics", "Beauty", "Sporting Goods"] as const;

const categoriesByDepartment: Record<(typeof departments)[number], string[]> = {
  Grocery: ["Pantry", "Frozen", "Beverage", "Produce"],
  Apparel: ["Men", "Women", "Kids", "Footwear"],
  Home: ["Kitchen", "Bedding", "Storage", "Decor"],
  Electronics: ["Audio", "Mobile", "Computing", "Accessories"],
  Beauty: ["Skin Care", "Hair Care", "Cosmetics", "Fragrance"],
  "Sporting Goods": ["Fitness", "Outdoor", "Team Sports", "Cycling"],
};

const brands = [
  "Northline",
  "Crest & Co.",
  "Market Row",
  "BrightGoods",
  "Everyday Supply",
  "Stonewell",
  "Urban Peak",
  "Hearthmark",
] as const;

const itemNouns = [
  "Assortment",
  "Pack",
  "Kit",
  "Bundle",
  "Refill",
  "Set",
  "Series",
  "Collection",
] as const;

const statuses: RecommendationStatus[] = ["approved", "pending", "rejected", "investigate"];

const seededRandom = (seed: number) => {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

const pick = <T,>(values: readonly T[], seed: number) =>
  values[Math.floor(seededRandom(seed) * values.length)];

const statusStyles: Record<RecommendationStatus, string> = {
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  rejected: "border-rose-200 bg-rose-50 text-rose-700",
  investigate: "border-indigo-200 bg-indigo-50 text-indigo-700",
};

export const retailColumns: GridColumnConfig<RetailItem>[] = [
  { accessorKey: "item_id", header: "Item ID", dataType: "text", width: 112 },
  { accessorKey: "item_name", header: "Item Name", dataType: "text", width: 240 },
  {
    accessorKey: "department",
    header: "Department",
    dataType: "text",
    width: 150,
    enableGrouping: true,
  },
  {
    accessorKey: "category",
    header: "Category",
    dataType: "text",
    width: 142,
    enableGrouping: true,
  },
  {
    accessorKey: "brand",
    header: "Brand",
    dataType: "text",
    width: 150,
    enableGrouping: true,
  },
  {
    accessorKey: "sales",
    header: "Sales",
    dataType: "currency",
    width: 128,
    colorScale: { colors: ["#ecfdf5", "#10b981", "#065f46"] },
  },
  {
    accessorKey: "units",
    header: "Units",
    dataType: "number",
    width: 140,
    editable: true,
    validate: (value) => (Number(value) < 0 ? "Units cannot be negative" : null),
    dataBar: { color: "#93c5fd" },
    flashOnChange: true,
  },
  {
    accessorKey: "margin_rate",
    header: "Margin",
    dataType: "percent",
    width: 128,
    progressBar: { color: "#10b981" },
  },
  {
    accessorKey: "price_gap",
    header: "Price Gap",
    dataType: "percent",
    width: 130,
    formatValue: (value) => formatSignedPercent(Number(value)),
    getCellClassName: (value) => (Number(value) < 0 ? "font-semibold text-rose-700" : ""),
    iconSet: trendIconSet<RetailItem>(),
  },
  {
    accessorKey: "recommendation_status",
    header: "Status",
    dataType: "status",
    width: 150,
    enableGrouping: true,
    editable: true,
    statusStyles,
    formatGroupingValue: (value) => formatStatusLabel(String(value)),
    getStatusClassName: (value) => statusStyles[value as RecommendationStatus],
  },
  { accessorKey: "last_restocked_at", header: "Last Restocked", dataType: "date", width: 140, editable: true },
  { accessorKey: "on_promotion", header: "On Promotion", dataType: "boolean", width: 130 },
];

export const retailFilters: GridFilterConfig<RetailItem>[] = [
  // High-cardinality text: keep the friendlier placeholder; inference already
  // picks free-text contains.
  { accessorKey: "item_name", placeholder: "Search names…" },
  // Provide canonical option lists so these facet identically in client AND
  // server mode (server mode cannot derive options from one page).
  { accessorKey: "department", options: [...departments] },
  { accessorKey: "recommendation_status", options: [...statuses] },
  // Range bounds/step are a presentation choice, not inferable.
  { accessorKey: "sales", min: 0, step: 1000 },
];

const sum = (rows: RetailItem[], key: "sales" | "units") =>
  rows.reduce((total, row) => total + row[key], 0);

const average = (rows: RetailItem[], key: "margin_rate" | "price_gap") =>
  rows.length === 0 ? 0 : rows.reduce((total, row) => total + row[key], 0) / rows.length;

export const retailSummaryItems: DataGridSummaryItem<RetailItem>[] = [
  {
    id: "sales",
    columnId: "sales",
    label: "Sales",
    value: ({ rows }) => formatCurrency(sum(rows, "sales")),
    description: ({ scope }) => (scope === "selected" ? "Selected items" : "Filtered items"),
  },
  {
    id: "units",
    columnId: "units",
    label: "Units",
    value: ({ rows }) => formatNumber(sum(rows, "units")),
  },
  {
    id: "margin",
    columnId: "margin_rate",
    label: "Avg margin",
    value: ({ rows }) => formatPercent(average(rows, "margin_rate")),
  },
  {
    id: "price_gap",
    columnId: "price_gap",
    label: "Avg price gap",
    value: ({ rows }) => formatSignedPercent(average(rows, "price_gap")),
  },
  {
    id: "status_mix",
    columnId: "recommendation_status",
    label: "Top status",
    value: ({ rows }) => {
      const counts = rows.reduce<Record<string, number>>((totals, row) => {
        totals[row.recommendation_status] = (totals[row.recommendation_status] ?? 0) + 1;
        return totals;
      }, {});
      const topStatus = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];

      return topStatus ? formatStatusLabel(topStatus[0]) : "None";
    },
    description: ({ rows }) => `${rows.length} items in scope`,
  },
];

export const retailGroupSummaryItems: DataGridSummaryItem<RetailItem>[] = [
  {
    id: "sales",
    columnId: "sales",
    label: "Sum of Sales",
    value: ({ rows }) => formatCurrency(sum(rows, "sales")),
  },
  {
    id: "units",
    columnId: "units",
    label: "Sum of Units",
    value: ({ rows }) => formatNumber(sum(rows, "units")),
  },
  {
    id: "margin",
    columnId: "margin_rate",
    label: "Avg Margin",
    value: ({ rows }) => formatPercent(average(rows, "margin_rate")),
  },
  {
    id: "price_gap",
    columnId: "price_gap",
    label: "Avg Price Gap",
    value: ({ rows }) => formatSignedPercent(average(rows, "price_gap")),
  },
  {
    id: "status_mix",
    columnId: "recommendation_status",
    label: "Top Status",
    value: ({ rows }) => {
      const counts = rows.reduce<Record<string, number>>((totals, row) => {
        totals[row.recommendation_status] = (totals[row.recommendation_status] ?? 0) + 1;
        return totals;
      }, {});
      const topStatus = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];

      return topStatus ? formatStatusLabel(topStatus[0]) : "None";
    },
  },
];

export const mockRetailData: RetailItem[] = Array.from({ length: 500 }, (_, index) => {
  const rowNumber = index + 1;
  const department = pick(departments, rowNumber * 3);
  const category = pick(categoriesByDepartment[department], rowNumber * 7);
  const brand = pick(brands, rowNumber * 11);
  const status = pick(statuses, rowNumber * 17);
  const sales = Math.round(2400 + seededRandom(rowNumber * 19) * 78000);
  const units = Math.round(35 + seededRandom(rowNumber * 23) * 4200);
  const marginRate = Number((0.12 + seededRandom(rowNumber * 29) * 0.38).toFixed(3));
  const priceGap = Number((-0.18 + seededRandom(rowNumber * 31) * 0.34).toFixed(3));
  const itemNoun = pick(itemNouns, rowNumber * 37);
  // Deterministic restock date in the first ~6 months of 2026 (stable across reloads).
  const restockBase = new Date(2026, 0, 1).getTime();
  const restockOffsetDays = Math.floor(seededRandom(rowNumber * 41) * 180);
  const lastRestockedAt = new Date(restockBase + restockOffsetDays * 86_400_000)
    .toISOString()
    .slice(0, 10);

  return {
    item_id: `SKU-${String(100000 + rowNumber).slice(1)}`,
    item_name: `${brand} ${category} ${itemNoun}`,
    department,
    category,
    brand,
    sales,
    units,
    margin_rate: marginRate,
    price_gap: priceGap,
    recommendation_status: status,
    last_restocked_at: lastRestockedAt,
    on_promotion: seededRandom(rowNumber * 43) > 0.6,
  };
});
