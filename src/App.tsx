import { useEffect, useMemo, useRef, useState } from "react";
import type { ColumnFiltersState, PaginationState, SortingState } from "@tanstack/react-table";
import {
  DataGrid,
  createDataGridAgentToolkit,
  type DataGridApi,
  type DataGridColumnGroup,
  type DataGridDataMode,
  type DataGridLayoutMode,
  type GridColorScale,
} from "./components/DataGrid";
import {
  mockRetailData,
  retailColumns,
  retailFilters,
  retailGroupSummaryItems,
  retailSummaryItems,
  type RecommendationStatus,
  type RetailItem,
} from "./data/mockRetailData";
import { applyEdit, queryRetail } from "./data/fakeServer";
import { createRetailBigQueryDataSource } from "./data/retailBigQuery";
import { AssistantDemo } from "./demo/AssistantDemo";

// When VITE_RETAIL_ENDPOINT is set, server mode round-trips to the real
// Express + BigQuery backend; otherwise it uses the in-memory fake server.
const retailEndpoint = (import.meta.env as Record<string, string | undefined>)
  .VITE_RETAIL_ENDPOINT;

const layouts: { id: DataGridLayoutMode; label: string }[] = [
  { id: "pivot", label: "Pivot" },
  { id: "grid", label: "Grid" },
];

const dataModes: { id: DataGridDataMode; label: string }[] = [
  { id: "client", label: "Client" },
  { id: "server", label: "Server" },
];

// colorScale interpolates literal colors, so it can't ride the --dg-* CSS
// tokens that handle every other theme switch automatically — the demo swaps
// in a dark-appropriate ramp itself when dg-theme-dark is active.
const darkSalesColorScale: GridColorScale = { colors: ["#2e1065", "#a78bfa"] };

// Grid-mode header bands (ignored in pivot mode).
const retailColumnGroups: DataGridColumnGroup[] = [
  { groupId: "item", header: "Item", children: ["item_id", "item_name"] },
  { groupId: "merch", header: "Merchandising", children: ["department", "category", "brand"] },
  {
    groupId: "performance",
    header: "Performance",
    children: ["sales", "units", "margin_rate", "price_gap"],
  },
];

function App() {
  const gridApi = useRef<DataGridApi<RetailItem> | null>(null);
  const assistantToolkit = useMemo(
    () =>
      createDataGridAgentToolkit({
        api: gridApi,
        permissions: { readData: true, changeView: true, changeFormatting: true },
        limits: { maxRowsPerQuery: 100, maxCellsPerQuery: 2_000 },
      }),
    [],
  );
  const [layoutMode, setLayoutMode] = useState<DataGridLayoutMode>("grid");
  const [dataMode, setDataMode] = useState<DataGridDataMode>("client");
  const [isDarkTheme, setIsDarkTheme] = useState(false);
  const themedRetailColumns = useMemo(() => {
    if (!isDarkTheme) return retailColumns;
    return retailColumns.map((column) =>
      column.accessorKey === "sales" ? { ...column, colorScale: darkSalesColorScale } : column,
    );
  }, [isDarkTheme]);

  // Client mode: the grid never mutates `data`; we apply onCellEdit by item_id.
  const [rows, setRows] = useState(mockRetailData);

  // Server mode: we control the query slices and hold the fetched page.
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 50 });
  const [serverRows, setServerRows] = useState<RetailItem[]>([]);
  const [serverRowCount, setServerRowCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const requestIdRef = useRef(0);

  // Server mode applies to grid layout only.
  const effectiveDataMode: DataGridDataMode = layoutMode === "pivot" ? "client" : dataMode;
  const isServer = effectiveDataMode === "server";

  // The real backend adapter (created once); null falls back to the fake server.
  const bigQuerySource = useMemo(
    () => (retailEndpoint ? createRetailBigQueryDataSource({ endpoint: retailEndpoint }) : null),
    [],
  );

  const updateRecommendationStatus = (item: RetailItem, status: RecommendationStatus) => {
    if (isServer) {
      applyEdit(item.item_id, "recommendation_status", status);
      setRefreshToken((token) => token + 1);
      return;
    }

    setRows((current) =>
      current.map((row) =>
        row.item_id === item.item_id ? { ...row, recommendation_status: status } : row,
      ),
    );
  };

  useEffect(() => {
    if (!isServer) return;
    const requestId = ++requestIdRef.current;
    const controller = new AbortController();
    setIsLoading(true);
    const query = { sorting, columnFilters, globalFilter, pagination };
    // Same wire contract either way: the BigQuery adapter takes the grid's
    // request shape (signal + requestId), the fake server takes the slices.
    const pending = bigQuerySource
      ? bigQuerySource({ ...query, signal: controller.signal, requestId })
      : queryRetail(query);
    Promise.resolve(pending)
      .then((result) => {
        if (requestId !== requestIdRef.current) return; // drop stale responses
        setServerRows(result.rows);
        setServerRowCount(result.rowCount ?? 0);
        setIsLoading(false);
      })
      .catch((error) => {
        if (controller.signal.aborted || requestId !== requestIdRef.current) return;
        console.error("Server query failed:", error);
        setServerRows([]);
        setServerRowCount(0);
        setIsLoading(false);
      });
    return () => controller.abort();
  }, [isServer, sorting, columnFilters, globalFilter, pagination, refreshToken, bigQuerySource]);

  return (
    <main className="flex min-h-dvh flex-col bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-3 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-slate-950">
              Retail Recommendation Workbench
            </h1>
            <p className="mt-0.5 text-xs text-slate-500">
              {layoutMode === "pivot"
                ? "Pivot view — grouped subtotals. Switch to Grid to drill to item level."
                : isServer
                  ? "Grid view — server mode: sort/filter/paginate round-trip to a simulated backend."
                  : "Grid view — expand a group to see item rows."}
            </p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 text-xs text-slate-500 sm:w-auto">
            <div
              role="group"
              aria-label="Data source"
              className="flex rounded-md border border-slate-200 bg-slate-50 p-0.5"
            >
              {dataModes.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setDataMode(mode.id)}
                  aria-pressed={effectiveDataMode === mode.id}
                  disabled={mode.id === "server" && layoutMode === "pivot"}
                  title={
                    mode.id === "server" && layoutMode === "pivot"
                      ? "Server mode is grid-only"
                      : undefined
                  }
                  className={`h-7 rounded px-3 font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-40 ${
                    effectiveDataMode === mode.id
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <div
              role="group"
              aria-label="Layout mode"
              className="flex rounded-md border border-slate-200 bg-slate-50 p-0.5"
            >
              {layouts.map((layout) => (
                <button
                  key={layout.id}
                  type="button"
                  onClick={() => setLayoutMode(layout.id)}
                  aria-pressed={layoutMode === layout.id}
                  className={`h-7 rounded px-3 font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 ${
                    layoutMode === layout.id
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {layout.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setIsDarkTheme((current) => !current)}
              aria-pressed={isDarkTheme}
              className={`h-8 rounded-md border border-slate-200 px-3 font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 ${
                isDarkTheme
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-slate-50 text-slate-600 hover:text-slate-900"
              }`}
            >
              Dark theme
            </button>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-medium">
              500 rows
            </span>
          </div>
        </div>
      </header>

      <AssistantDemo
        toolkit={assistantToolkit}
        disabled={layoutMode !== "grid" || isServer}
      />

      <section
        className={`flex min-h-0 flex-1 p-3 sm:p-4 ${isDarkTheme ? "dg-theme-dark" : ""}`}
      >
        <DataGrid
          apiRef={gridApi}
          data={isServer ? serverRows : rows}
          columns={themedRetailColumns}
          layoutMode={layoutMode}
          dataMode={isServer ? "server" : "client"}
          rowCount={isServer ? serverRowCount : undefined}
          isLoading={isServer ? isLoading : false}
          state={isServer ? { sorting, columnFilters, globalFilter, pagination } : undefined}
          onSortingChange={isServer ? setSorting : undefined}
          onColumnFiltersChange={isServer ? setColumnFilters : undefined}
          onGlobalFilterChange={isServer ? setGlobalFilter : undefined}
          onPaginationChange={isServer ? setPagination : undefined}
          columnGroups={retailColumnGroups}
          filters={retailFilters}
          onCellEdit={({ rowId, columnId, value }) => {
            if (isServer) {
              applyEdit(rowId, columnId, value);
              setRefreshToken((token) => token + 1);
            } else {
              setRows((current) =>
                current.map((row) =>
                  row.item_id === rowId ? { ...row, [columnId]: value } : row,
                ),
              );
            }
          }}
          getExportFileName={({ selectedCount }) =>
            selectedCount > 0 ? `retail-selection-${selectedCount}.csv` : "retail-recommendations.csv"
          }
          summaryItems={retailSummaryItems}
          groupSummaryItems={retailGroupSummaryItems}
          groupSummaryDisplay="columns"
          defaultGrouping={["department", "category"]}
          pivot={{ showLeafRows: true }}
          features={{ detailPanel: false, headerToolsOnDemand: true, cardLayout: true }}
          cardView={{
            // item_id is the first text column and would win title by default;
            // the card reads better titled by name.
            card: { title: "item_name", badge: "recommendation_status" },
          }}
          storageKey="retail-recommendation-workbench"
          rowLabel="items"
          tableLabel="Retail recommendation analytics"
          searchPlaceholder="Search item, brand, department..."
          viewNamePlaceholder="Pricing review"
          getRowId={(row) => row.item_id}
          getRowLabel={(row) => row.item_id}
          rowActions={(row) => [
            {
              id: "approve",
              label: "Approve",
              hidden: row.recommendation_status === "approved",
              onSelect: () => updateRecommendationStatus(row, "approved"),
            },
            {
              id: "investigate",
              label: "Mark investigate",
              disabled: row.recommendation_status === "investigate",
              onSelect: () => updateRecommendationStatus(row, "investigate"),
            },
            {
              id: "reject",
              label: "Reject",
              hidden: row.recommendation_status === "rejected",
              destructive: true,
              onSelect: () => updateRecommendationStatus(row, "rejected"),
            },
          ]}
          virtualizeRows
        />
      </section>
    </main>
  );
}

export default App;
