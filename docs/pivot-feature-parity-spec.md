# Pivot Feature Parity Spec

Date: 2026-06-24
Status: Draft
Owner: DataGrid component surface

## Objective

Rebuild pivot mode so it has full feature parity with the standard grid layout by rendering pivot output through the same TanStack Table path:

- `table.getHeaderGroups()`
- `row.getVisibleCells()`
- `flexRender(...)`

Pivot mode should become a materialized table model, not a separate table renderer. The implementation must keep `src/components/DataGrid/` domain-neutral and expose any reusable public contracts through `src/components/DataGrid/index.ts`.

## Current Problem

The current pivot implementation shares filtering, grouping state, saved views, and some toolbar wiring with the grid, but it renders a different semantic table:

- Pivot headers are synthetic JSX: `Row Labels` plus `pivotSummaryItems`.
- Pivot rows are manually flattened from grouped rows.
- Pivot values are rendered directly from summary callbacks.
- Standard cells use `row.getVisibleCells()` and `flexRender(...)`; pivot cells do not.
- Column resizing, pinning, sorting affordances, selection, detail/drill-through, and pagination all depend on real TanStack columns/rows/cells, so pivot either disables them or needs one-off behavior.

This makes parity expensive because each grid feature must be reimplemented for pivot instead of falling out of the same column/row/cell pipeline.

## Design Principle

Pivot mode should produce a normal TanStack input:

```ts
type PivotMaterialization<TData> = {
  data: PivotRow<TData>[];
  columns: ColumnDef<PivotRow<TData>, unknown>[];
  metadata: PivotMaterializationMetadata<TData>;
};
```

After materialization, the outer `DataGrid` renderer should not care whether the user selected `layoutMode="grid"` or `layoutMode="pivot"` for core table chrome. The renderer should still use the normal header/body path, with only small styling and behavior branches where the product semantics are genuinely different.

## Public API

### Pivot State

Add an explicit pivot state object instead of overloading `grouping` and `summaryItems`.

```ts
export type DataGridPivotState = {
  rows: string[];
  columns?: DataGridPivotColumnAxis[];
  measures: string[];
  expanded?: ExpandedState;
  showGrandTotals?: boolean;
  showSubtotals?: boolean;
  paginationMode?: "topLevelGroups" | "visibleRows";
};

export type DataGridPivotColumnAxis = {
  columnId: string;
  order?: "asc" | "desc";
};
```

Controlled/uncontrolled behavior should follow the existing state triad:

- `state.pivot`
- `onPivotChange`
- internal `pivot` state when uncontrolled
- scoped persistence only behind `storageKey`

Saved views should include pivot state. Existing saved views with only `grouping` should continue to load.

### Pivot Measures

Replace the pivot use of `summaryItems` with richer measure definitions.

```ts
export type DataGridPivotMeasure<TData extends object, TValue = unknown> = {
  id: string;
  label: string;
  columnId?: Extract<keyof TData, string>;
  aggregation: DataGridPivotAggregation<TData, TValue>;
  format?: (value: TValue, context: DataGridPivotCellContext<TData>) => ReactNode;
  cell?: (context: DataGridPivotCellContext<TData, TValue>) => ReactNode;
  sortFn?: SortingFn<PivotRow<TData>>;
  className?: string | ((context: DataGridPivotCellContext<TData, TValue>) => string);
  drillThrough?: (context: DataGridPivotCellContext<TData, TValue>) => void;
  totalBehavior?: "aggregate" | "sumVisibleChildren" | "blank" | "custom";
};

export type DataGridPivotAggregation<TData extends object, TValue> =
  | "count"
  | "sum"
  | "avg"
  | "min"
  | "max"
  | ((rows: TData[], context: DataGridPivotAggregationContext<TData>) => TValue);
```

Compatibility path:

- `summaryItems` and `groupSummaryItems` stay supported for the grid summary bar and existing consumers.
- In pivot mode, old summary items can be adapted into measures during a deprecation window.
- New docs should teach `pivotMeasures`.

### DataGrid Props

Candidate additions:

```ts
type DataGridProps<TData extends object> = {
  pivot?: DataGridPivotConfig<TData>;
  onPivotCellClick?: (context: DataGridPivotCellContext<TData>) => void;
};

type DataGridPivotConfig<TData extends object> = {
  rows?: string[];
  columns?: DataGridPivotColumnAxis[];
  measures?: DataGridPivotMeasure<TData>[];
  defaultState?: Partial<DataGridPivotState>;
  rowLabelColumn?: DataGridPivotRowLabelColumnConfig<TData>;
};
```

Open question: whether pivot belongs under one `pivot` prop or as separate top-level props. Prefer one `pivot` prop to avoid widening `DataGridProps` with many pivot-only fields.

## Materialized Row Model

### Row Shape

Pivot rows should be real row objects passed to TanStack.

```ts
type PivotRowKind = "group" | "leaf" | "subtotal" | "grandTotal";

type PivotRow<TData extends object> = {
  __pivot: true;
  __kind: PivotRowKind;
  __id: string;
  __depth: number;
  __sourceRows: TData[];
  __leafRow?: TData;
  __groupPath: PivotGroupPathSegment[];
  __values: Record<string, unknown>;
};

type PivotGroupPathSegment = {
  columnId: string;
  value: unknown;
  label: ReactNode;
  stableKey: string;
};
```

Stable row IDs:

- Top-level group: `pivot:group|department=95`
- Nested group: `pivot:group|department=95|category=12`
- Leaf row: `pivot:leaf|source=<getRowId(row)>`
- Subtotal row: `pivot:subtotal|department=95|category=12`
- Grand total row: `pivot:grandTotal`

IDs must be deterministic across reloads for saved expansion, selection, and virtualization measurement cache stability.

### Grouping Semantics

The materializer owns pivot grouping, even if it reuses helpers from the standard grouping path. It should:

- Apply active filters before grouping.
- Build group trees from `pivot.rows`.
- Optionally build column-axis buckets from `pivot.columns`.
- Include leaf rows only when drill-through/item-level display is enabled.
- Carry `__sourceRows` on every aggregate row for selection, summaries, and drill-through.
- Compute row labels with existing `formatGroupingValue` and `getGroupingValue` where possible.

Do not store React nodes as identity. Store stable keys and raw values separately, then render labels through column formatting.

## Materialized Column Model

### Row Label Column

The row label column should be a real `ColumnDef` with a stable ID.

```ts
const PIVOT_ROW_LABEL_COLUMN_ID = "pivot:rowLabel";
```

It should support:

- sorting by group label or aggregate value, depending on active sort target
- resizing
- pinning left by default
- keyboard expansion controls
- accessible labels for group depth and expanded state
- optional leaf-row click/detail behavior

### Measure Columns

Generated measure columns should be real `ColumnDef`s.

Column ID examples:

- `measure:revenue`
- `measure:revenue|col:department=95`
- `measure:revenue|col:department=95|week=2026W21`

Column metadata should include:

```ts
type PivotMeasureColumnMeta<TData extends object> = {
  kind: "pivotMeasure";
  measureId: string;
  columnPath: PivotGroupPathSegment[];
  sourceRows: TData[];
  totalLevel?: "subtotal" | "grandTotal";
};
```

Each generated measure column should define:

- `header`
- `cell`
- `sortingFn`
- `size`, `minSize`, `maxSize`
- `enableSorting`
- `enableResizing`
- `enablePinning`
- `meta`

This lets the existing header renderer provide sorting, multi-sort indicators, resizing handles, column visibility, column ordering, and pinning without pivot-specific markup.

### Column-Axis Groups

If `pivot.columns` is used, generated `ColumnDef`s should be nested so TanStack header groups render multi-level pivot headers:

```txt
                 2026W21               2026W22
Row Labels       Revenue   Units        Revenue   Units
```

If there is no column axis, measures render as simple leaf columns beside `Row Labels`.

## Feature Semantics

### Sorting

Pivot sorting must be explicit:

- Sorting `pivot:rowLabel` sorts sibling groups by rendered/raw group label.
- Sorting a measure column sorts sibling groups by that aggregate value.
- Sorting should not flatten all groups into one global order unless `paginationMode="visibleRows"` and the consumer opts into flat sorting.
- Leaf rows sort within their parent group when leaf rows are visible.
- Multi-sort follows TanStack behavior, but the materializer must apply it within each sibling set.

Implementation note: TanStack's sorted row model may not understand tree-local aggregate sorting after materialization. If needed, sort during materialization using the active sorting state, then let TanStack receive already ordered rows.

### Resizing

Generated columns must participate in the existing `columnSizing` slice.

- `pivot:rowLabel` has a default wider size.
- Measure columns inherit sizing defaults from the measure definition or source column.
- Sizing persists by generated column ID.
- If generated IDs include high-cardinality column-axis values, document that sizing persistence is tied to those values.

### Pinning

Pinning should use the existing `columnPinning` slice.

- `pivot:rowLabel` pins left by default.
- Measure columns can be pinned left or right.
- Generated columns must appear in the existing Columns menu.
- Pinning state must prune generated IDs that no longer exist after pivot state changes.

### Selection

Selection needs first-class pivot semantics.

```ts
type DataGridPivotSelectionMode =
  | "groups"
  | "leaves"
  | "sourceRows"
  | "mixed";
```

Proposed default: `sourceRows`.

Behavior:

- Selecting a group row selects all source leaf rows under that group.
- Selecting a leaf row selects only that source row.
- Header select-all selects all filtered source rows, not just currently visible aggregate rows.
- The selected count should report source rows unless `selectionMode="groups"`.
- `getFilteredSelectedRowModel()` must remain meaningful for summary scope.

Open question: expose pivot aggregate-row selection separately from source-row selection, or map it into existing rowSelection only. Prefer source-row mapping first because it preserves current summary semantics.

### Pagination

Pivot pagination needs an explicit mode.

```ts
type DataGridPivotPaginationMode = "topLevelGroups" | "visibleRows";
```

`topLevelGroups`:

- Page boundaries apply only to depth-0 groups.
- Expanded children stay with their parent group.
- Better for pivot readability.
- Page sizes are approximate in rendered row count.

`visibleRows`:

- Page boundaries apply to the flattened visible row list.
- Better for huge expanded pivots.
- Can split children away from parents.

Default: `topLevelGroups` for pivot.

The current bug history around duplicated rows means pagination must be covered by regression tests for both modes.

### Drill-Through and Row Interaction

V1 should keep pivot interaction aligned with today's grid behavior: only lowest-level leaf rows are actionable. Aggregate/group rows and aggregate measure cells should not open sidebars or drill-through panels in V1.

```ts
type DataGridPivotCellContext<TData extends object, TValue = unknown> = {
  value: TValue;
  sourceRows: TData[];
  row: PivotRow<TData>;
  measure: DataGridPivotMeasure<TData, TValue>;
  rowPath: PivotGroupPathSegment[];
  columnPath: PivotGroupPathSegment[];
  scope: "cell" | "rowTotal" | "columnTotal" | "grandTotal";
};
```

V1 behavior:

- Leaf rows can use the existing row click/detail-panel behavior.
- Group rows can expand/collapse but should not open a detail sidebar.
- Aggregate measure cells should render as values only, with no click target or keyboard activation.
- The cursor, `role`, `tabIndex`, and keyboard handlers should only be applied to actionable leaf rows.
- Aggregate-cell drill-through remains a future extension, not part of parity V1.

Future candidate API, when aggregate-cell drill-through is intentionally added:

```ts
renderPivotDetailPanel?: (
  context: DataGridPivotCellContext<TData> | DataGridPivotRowContext<TData>,
  controls: { close: () => void },
) => ReactNode;
```

### Totals

Totals should be generated rows/columns, not a custom `<tfoot>`.

Required total types:

- row subtotals
- column subtotals
- grand total row
- grand total column

`totalBehavior` controls whether a measure recomputes against all source rows, sums visible child aggregate values, renders blank, or uses a custom total callback.

Grand totals should stay compatible with column visibility and filters.

### Column Visibility and Ordering

Generated pivot columns should be visible in the existing Columns menu.

Rules:

- Source dimension columns should not appear as normal grid columns in pivot mode unless explicitly enabled.
- Measure columns should be hideable.
- Column-axis generated columns should be hideable at the leaf measure level first.
- Future enhancement: hide/show whole column-axis groups.
- Column ordering should persist over generated measure column IDs, then reconcile when the generated set changes.

### Filtering and Global Search

Existing filters should apply before pivot materialization.

Global search should either:

- filter source rows before pivoting, matching the current grid behavior, or
- optionally search materialized labels and aggregate values.

Default: filter source rows before pivoting. Add an explicit `pivot.searchMode` only if consumers need aggregate-value search.

### Virtualization

The existing row virtualizer should work after materialization because pivot rows become normal visible rows.

Requirements:

- Stable row IDs for measurement cache.
- Correct spacer `colSpan` using generated visible leaf columns.
- Expansion should not duplicate rows.
- Group/total rows can have different heights, so `measureElement` must remain enabled.

### Accessibility

Pivot parity must preserve or improve table semantics.

Requirements:

- Use real `<th scope="col">` for generated headers through the normal header path.
- Row label cells for group rows should expose expansion state and group depth.
- Aggregate cells with drill-through should be keyboard reachable.
- Sorting state should be reflected through `aria-sort`.
- Selection controls should have labels that distinguish group/source-row behavior.
- Caption behavior via `tableLabel` remains unchanged.

## Implementation Plan

### Phase 1: Types and Adapter

- Add pivot public types in `DataGrid.tsx` or a new neutral file under `src/components/DataGrid/`.
- Re-export public types from `src/components/DataGrid/index.ts`.
- Add an adapter from old `summaryItems`/`groupSummaryItems` into `pivotMeasures`.
- Add focused unit tests for aggregation helpers and stable ID generation.

### Phase 2: Materializer

- Create a pivot materialization helper that accepts source rows, source columns, pivot state, measures, filters, sorting, expansion, selection, and format options.
- Return materialized rows, generated columns, and metadata.
- Keep this helper domain-neutral and free of retail assumptions.
- Add tests for row-axis grouping, column-axis grouping, totals, stable IDs, and no duplicated rows.

### Phase 3: Render Through Normal Path

- Route pivot mode through the same table header/body rendering path as grid mode.
- Remove the custom pivot `<thead>`, `<tbody>`, and `<tfoot>` branch.
- Keep only styling hooks/classes needed for pivot visual density.
- Verify sorting, resizing, visibility, ordering, and pinning on generated columns.

### Phase 4: Selection, Pagination, Drill-Through

- Implement pivot selection mode with source-row default semantics.
- Implement `topLevelGroups` and `visibleRows` pagination modes.
- Preserve existing leaf-row detail behavior in pivot mode.
- Keep aggregate row/cell drill-through out of V1 unless explicitly requested later.
- Update the toolbar/status row copy so counts are truthful for pivot semantics.

### Phase 5: Documentation and Migration

- Update README pivot docs to teach `pivot.measures`.
- Document compatibility behavior for `summaryItems` in pivot mode.
- Update `CLAUDE.md` architecture notes after the old custom renderer is removed.
- Keep the demo retail wiring under `src/data/`, `src/demo/`, or `src/App.tsx`.

## Test Matrix

Required tests before declaring parity:

- Pivot renders through generated ColumnDefs and `row.getVisibleCells()`.
- Sorting row labels sorts sibling groups.
- Sorting a measure sorts sibling groups by aggregate value.
- Multi-sort works for row labels plus measure values.
- Column resizing works for row label and measure columns.
- Column pinning works for row label and measure columns.
- Column visibility hides generated measure columns.
- Column ordering moves generated measure columns.
- Saved views persist and restore pivot state, generated column sizing/order/pinning, and visibility.
- Group row selection maps to source rows by default.
- Header select-all selects all filtered source rows.
- Pagination by top-level groups keeps children with parents.
- Pagination by visible rows does not duplicate or skip rows.
- Lowest-level pivot leaf rows can open the existing detail behavior.
- Aggregate rows and measure cells do not expose click, keyboard activation, or sidebar behavior in V1.
- Grand totals and subtotals honor filters and hidden measures.
- Virtualized pivot rows do not duplicate rows and keep correct `colSpan`.
- Accessibility assertions cover table caption, sortable headers, expansion controls, and keyboard activation.

## Open Questions

- Should pivot state live in `state.pivot`, or should row/column axes reuse `grouping` and add only `pivotColumns`/`pivotMeasures`?
- Should pivot generated columns be persisted by exact generated ID, or should there be a normalized persistence key that survives value-label changes?
- Should aggregate group selection be represented as source-row selection only, or should `rowSelection` support aggregate row IDs as a separate mode?
- Should grand totals render as materialized body rows, pinned bottom rows, or a footer-like row generated through TanStack-compatible APIs?
- Should aggregate-value global search be in scope for parity, or remain a later opt-in feature?
- When aggregate drill-through is added after V1, should `renderDetailPanel` be generalized, or should pivot drill-through get a separate render prop to preserve existing row-detail semantics?

## Non-Goals

- No retail-specific pivot behavior.
- No dependency swap away from TanStack Table.
- No custom pivot-only table renderer after the migration.
- No global localStorage keys for pivot state.
- No breaking removal of `summaryItems` without a compatibility window.

## Definition of Done

Pivot mode reaches feature parity when generated pivot rows and columns render through the standard TanStack path and the existing grid affordances work without pivot-specific duplicate implementations:

- sorting
- resizing
- column visibility
- column ordering
- column pinning
- saved views
- row/source selection
- pagination
- virtualization
- leaf-row detail behavior
- accessibility

The final implementation should make pivot mode feel compact and Excel-like through styling and materialized data shape, not through a second table renderer.
