import { useMemo, useState, type Ref } from "react";
import {
  DataGrid,
  type DataGridApi,
  type DataGridColumnGroup,
  type DataGridDataSource,
  type DataGridFeatures,
  type DataGridLayoutMode,
  type GridColorScale,
} from "../components/DataGrid";
import { queryRetail, applyEdit } from "../data/fakeServer";
import { fakeRetailServerAnalysis } from "../data/fakeServerAnalysis";
import {
  mockRetailData,
  retailColumns,
  retailFilters,
  retailGroupSummaryItems,
  retailPivotMeasures,
  retailSummaryItems,
  type RecommendationStatus,
  type RetailItem,
} from "../data/mockRetailData";
import { createRetailBigQueryDataSource } from "../data/retailBigQuery";

const retailEndpoint = (import.meta.env as Record<string, string | undefined>)
  .VITE_RETAIL_ENDPOINT;

const darkSalesColorScale: GridColorScale = { colors: ["#2e1065", "#a78bfa"] };

export const retailColumnGroups: DataGridColumnGroup[] = [
  { groupId: "item", header: "Item", children: ["item_id", "item_name"] },
  {
    groupId: "merch",
    header: "Merchandising",
    children: ["department", "category", "brand"],
  },
  {
    groupId: "performance",
    header: "Performance",
    children: ["sales", "units", "margin_rate", "price_gap"],
  },
];

type RetailGridDemoProps = {
  apiRef?: Ref<DataGridApi<RetailItem>>;
  cardMode?: "auto" | "cards" | "table";
  dataMode?: "client" | "server";
  featureOverrides?: Partial<DataGridFeatures>;
  isDark?: boolean;
  layoutMode?: DataGridLayoutMode;
  rowLimit?: number;
  storageKey: string;
  tableLabel: string;
  virtualizeRows?: boolean;
};

export function RetailGridDemo({
  apiRef,
  cardMode = "table",
  dataMode = "client",
  featureOverrides,
  isDark = false,
  layoutMode = "grid",
  rowLimit = 48,
  storageKey,
  tableLabel,
  virtualizeRows = false,
}: RetailGridDemoProps) {
  const [rows, setRows] = useState(() =>
    mockRetailData.slice(0, rowLimit).map((row) => ({ ...row })),
  );
  const bigQuerySource = useMemo(
    () => (retailEndpoint ? createRetailBigQueryDataSource({ endpoint: retailEndpoint }) : null),
    [],
  );
  const fakeDataSource = useMemo<DataGridDataSource<RetailItem>>(
    () => ({ sorting, columnFilters, globalFilter, pagination }) =>
      queryRetail({ sorting, columnFilters, globalFilter, pagination }),
    [],
  );
  const columns = useMemo(
    () =>
      isDark
        ? retailColumns.map((column) =>
            column.accessorKey === "sales"
              ? { ...column, colorScale: darkSalesColorScale }
              : column,
          )
        : retailColumns,
    [isDark],
  );
  const isServer = dataMode === "server" && layoutMode === "grid";

  const updateStatus = (item: RetailItem, status: RecommendationStatus) => {
    if (isServer) {
      applyEdit(item.item_id, "recommendation_status", status);
      return;
    }
    setRows((current) =>
      current.map((row) =>
        row.item_id === item.item_id
          ? { ...row, recommendation_status: status }
          : row,
      ),
    );
  };

  return (
    <div className={isDark ? "dg-theme-dark" : undefined}>
      <DataGrid
        apiRef={apiRef}
        data={isServer ? undefined : rows}
        dataSource={isServer ? bigQuerySource ?? fakeDataSource : undefined}
        serverAnalysis={isServer && !bigQuerySource ? fakeRetailServerAnalysis : undefined}
        columns={columns}
        layoutMode={layoutMode}
        dataMode={isServer ? "server" : "client"}
        columnGroups={retailColumnGroups}
        filters={retailFilters}
        summaryItems={retailSummaryItems}
        groupSummaryItems={retailGroupSummaryItems}
        groupSummaryDisplay="columns"
        pivot={{
          rows: ["department", "category"],
          measures: retailPivotMeasures,
          showLeafRows: true,
          defaultState: {
            rows: ["department", "category"],
            measures: ["sales", "units", "margin", "price_gap", "status_mix"],
            expanded: {},
            showGrandTotals: true,
            showSubtotals: true,
          },
          rowLabelColumn: { header: "Department / Category", size: 240 },
        }}
        features={{
          detailPanel: false,
          headerToolsOnDemand: true,
          cardLayout: true,
          ...featureOverrides,
        }}
        cardView={{
          mode: cardMode,
          breakpoint: 700,
          card: { title: "item_name", badge: "recommendation_status" },
        }}
        onCellEdit={({ rowId, columnId, value }) => {
          if (isServer) {
            applyEdit(rowId, columnId, value);
            return;
          }
          setRows((current) =>
            current.map((row) =>
              row.item_id === rowId ? { ...row, [columnId]: value } : row,
            ),
          );
        }}
        getExportFileName={({ selectedCount }) =>
          selectedCount > 0
            ? `retail-selection-${selectedCount}.csv`
            : "retail-recommendations.csv"
        }
        storageKey={storageKey}
        rowLabel="items"
        tableLabel={tableLabel}
        searchPlaceholder="Search item, brand, department..."
        viewNamePlaceholder="Pricing review"
        getRowId={(row) => row.item_id}
        getRowLabel={(row) => row.item_name}
        rowActions={(row) => [
          {
            id: "approve",
            label: "Approve",
            hidden: row.recommendation_status === "approved",
            onSelect: () => updateStatus(row, "approved"),
          },
          {
            id: "investigate",
            label: "Mark investigate",
            disabled: row.recommendation_status === "investigate",
            onSelect: () => updateStatus(row, "investigate"),
          },
          {
            id: "reject",
            label: "Reject",
            hidden: row.recommendation_status === "rejected",
            destructive: true,
            onSelect: () => updateStatus(row, "rejected"),
          },
        ]}
        virtualizeRows={virtualizeRows}
      />
    </div>
  );
}
