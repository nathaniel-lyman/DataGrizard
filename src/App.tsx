import { useEffect, useRef, useState } from "react";
import type { ColumnFiltersState, PaginationState, SortingState } from "@tanstack/react-table";
import {
  DataGrid,
  type DataGridColumnGroup,
  type DataGridDataMode,
  type DataGridLayoutMode,
} from "./components/DataGrid";
import {
  mockRetailData,
  retailColumns,
  retailFilters,
  retailGroupSummaryItems,
  retailSummaryItems,
  type RetailItem,
} from "./data/mockRetailData";
import { applyEdit, queryRetail } from "./data/fakeServer";
import { RetailDetailPanel } from "./demo/RetailDetailPanel";

const layouts: { id: DataGridLayoutMode; label: string }[] = [
  { id: "pivot", label: "Pivot" },
  { id: "grid", label: "Grid" },
];

const dataModes: { id: DataGridDataMode; label: string }[] = [
  { id: "client", label: "Client" },
  { id: "server", label: "Server" },
];

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
  const [layoutMode, setLayoutMode] = useState<DataGridLayoutMode>("pivot");
  const [dataMode, setDataMode] = useState<DataGridDataMode>("client");

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
  const isServer = dataMode === "server" && layoutMode === "grid";

  useEffect(() => {
    if (!isServer) return;
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    queryRetail({ sorting, columnFilters, globalFilter, pagination }).then((result) => {
      if (requestId !== requestIdRef.current) return; // drop stale responses
      setServerRows(result.rows);
      setServerRowCount(result.rowCount);
      setIsLoading(false);
    });
  }, [isServer, sorting, columnFilters, globalFilter, pagination, refreshToken]);

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
                  : "Grid view — expand a group to see items, or click a row for detail."}
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
                  aria-pressed={dataMode === mode.id}
                  disabled={mode.id === "server" && layoutMode === "pivot"}
                  title={
                    mode.id === "server" && layoutMode === "pivot"
                      ? "Server mode is grid-only"
                      : undefined
                  }
                  className={`h-7 rounded px-3 font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-40 ${
                    dataMode === mode.id
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
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-medium">
              500 rows
            </span>
          </div>
        </div>
      </header>

      <section className="flex min-h-0 flex-1 p-3 sm:p-4">
        <DataGrid
          data={isServer ? serverRows : rows}
          columns={retailColumns}
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
          storageKey="retail-recommendation-workbench"
          rowLabel="items"
          tableLabel="Retail recommendation analytics"
          searchPlaceholder="Search item, brand, department..."
          viewNamePlaceholder="Pricing review"
          getRowId={(row) => row.item_id}
          getRowLabel={(row) => row.item_id}
          virtualizeRows
          renderDetailPanel={(item) => <RetailDetailPanel item={item} />}
        />
      </section>
    </main>
  );
}

export default App;
