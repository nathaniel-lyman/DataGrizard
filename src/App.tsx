import { useState } from "react";
import { DataGrid, type DataGridLayoutMode } from "./components/DataGrid";
import {
  mockRetailData,
  retailColumns,
  retailFilters,
  retailGroupSummaryItems,
  retailSummaryItems,
} from "./data/mockRetailData";
import { RetailDetailPanel } from "./demo/RetailDetailPanel";

const layouts: { id: DataGridLayoutMode; label: string }[] = [
  { id: "pivot", label: "Pivot" },
  { id: "grid", label: "Grid" },
];

function App() {
  const [layoutMode, setLayoutMode] = useState<DataGridLayoutMode>("pivot");

  return (
    <main className="flex h-screen flex-col bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-semibold text-slate-950">
              Retail Recommendation Workbench
            </h1>
            <p className="mt-0.5 text-xs text-slate-500">
              {layoutMode === "pivot"
                ? "Pivot view — grouped subtotals. Switch to Grid to drill to item level."
                : "Grid view — expand a group to see items, or click a row for detail."}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
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

      <section className="flex min-h-0 flex-1 p-4">
        <DataGrid
          data={mockRetailData}
          columns={retailColumns}
          layoutMode={layoutMode}
          filters={retailFilters}
          summaryItems={retailSummaryItems}
          groupSummaryItems={retailGroupSummaryItems}
          defaultGrouping={["department", "category"]}
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
