# Type-aware Filtering Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every DataGrid column filterable by default with a control inferred from its `dataType`, auto-facet low-cardinality text, and surface a removable applied-filter chip bar.

**Architecture:** A new pure module (`filterDefaults.ts`) maps `dataType` → `GridFilterType`. A single `resolvedFilters` memo in `DataGrid.tsx` merges that inference with optional `filters` overrides across all non-synthetic leaf columns, and becomes the one source every consumer reads (predicate maps, header funnels, pivot popover, chip bar) — so grid and pivot stay in lockstep. A self-contained `AppliedFilters.tsx` renders chips. The matching predicate (`matchesFilterValue`) is unchanged.

**Tech Stack:** Vite + React 19 + TypeScript, TanStack Table v8, Tailwind, Vitest + Testing Library (jsdom). Type-check is `npx tsc -b`. Tests run via `npx vitest run`.

**Spec:** `docs/superpowers/specs/2026-06-27-type-aware-filtering-design.md`

**Conventions to honor (from CLAUDE.md / AGENTS.md):**
- `src/components/DataGrid/` stays domain-neutral and generic over `TData extends object`. No retail field names inside it.
- Behavioral work is **test-first**.
- The grid `columnFilterFn` closure and the pivot `pivotSourceRows` loop must stay in lockstep (both already read `filterTypeByColumnId`/`filterOperatorByColumnId`; we only change how those maps are *built*).
- Export any new public type from `src/components/DataGrid/index.ts`.
- No new unscoped `localStorage` keys (none added here).

**Commit style:** small, frequent commits. Use the repo's footer on commit messages:
```
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MQLsh6oxJmQiC4NwUHp9MA
```
(Each step below shows the `git commit -m "<subject>"` subject; append the footer.)

---

## File Structure

**New files**
- `src/components/DataGrid/filterDefaults.ts` — pure inference: `defaultFilterTypeForDataType`, `resolveFilterType`. No React.
- `src/components/DataGrid/filterDefaults.test.ts` — unit tests for the above.
- `src/components/DataGrid/AppliedFilters.tsx` — chip bar (active filters + global search + clear-all). Presentational; props-driven.

**Modified files**
- `src/types/grid.ts` — `GridColumnConfig.enableFiltering?`; `GridFilterConfig.label?` optional + `filterable?`.
- `src/components/DataGrid/gridHelpers.ts` — add `columnNumericExtent` (min/max scan) next to `uniqueColumnValues`.
- `src/components/DataGrid/filters.tsx` — export the existing `summarize` as `summarizeFilter`.
- `src/components/DataGrid/DataGrid.tsx` — new feature flags + `facetThreshold` prop; the `resolvedFilters` memo + derive `filterTypeByColumnId`/`filterOperatorByColumnId`/`filterOptionsById`/`toolbarFilters` from it; render `<AppliedFilters>`.
- `src/components/DataGrid/index.ts` — export new public types/helpers.
- `src/data/mockRetailData.ts` — add a `boolean` column; reduce `retailFilters` to overrides.
- `src/data/fakeServer.ts` — derive `filterTypeById` from the shared inference, not `retailFilters`.
- `src/components/DataGrid/DataGrid.filters.test.tsx` — extend coverage.

---

## Chunk 1: Pure inference module

Self-contained, zero codebase dependencies beyond the two type unions. Build and fully test this first.

### Task 1: `defaultFilterTypeForDataType`

**Files:**
- Create: `src/components/DataGrid/filterDefaults.ts`
- Test: `src/components/DataGrid/filterDefaults.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/components/DataGrid/filterDefaults.test.ts
import { describe, expect, it } from "vitest";
import { defaultFilterTypeForDataType } from "./filterDefaults";

describe("defaultFilterTypeForDataType", () => {
  it("maps each dataType to a sensible default control", () => {
    expect(defaultFilterTypeForDataType("text")).toBe("text");
    expect(defaultFilterTypeForDataType("number")).toBe("range");
    expect(defaultFilterTypeForDataType("currency")).toBe("range");
    expect(defaultFilterTypeForDataType("percent")).toBe("range");
    expect(defaultFilterTypeForDataType("date")).toBe("date");
    expect(defaultFilterTypeForDataType("status")).toBe("multiSelect");
    expect(defaultFilterTypeForDataType("boolean")).toBe("boolean");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/DataGrid/filterDefaults.test.ts`
Expected: FAIL — cannot resolve `./filterDefaults`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/components/DataGrid/filterDefaults.ts
import type { GridDataType, GridFilterType } from "../../types/grid";

// Maps a column's value semantics (dataType) to the control that fits it best.
// This is the type-awareness the filter layer previously lacked (it defaulted
// every column to "select"). Pure + dependency-free so it is shared by the grid
// (DataGrid.tsx) and the demo server simulation (fakeServer.ts).
export const defaultFilterTypeForDataType = (dataType: GridDataType): GridFilterType => {
  switch (dataType) {
    case "number":
    case "currency":
    case "percent":
      return "range";
    case "date":
      return "date";
    case "status":
      return "multiSelect";
    case "boolean":
      return "boolean";
    case "text":
    default:
      return "text";
  }
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/DataGrid/filterDefaults.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/DataGrid/filterDefaults.ts src/components/DataGrid/filterDefaults.test.ts
git commit -m "feat(filters): add dataType->filterType default mapping"
```

### Task 2: `resolveFilterType` (facet, server, static options)

**Files:**
- Modify: `src/components/DataGrid/filterDefaults.ts`
- Test: `src/components/DataGrid/filterDefaults.test.ts`

- [ ] **Step 1: Write the failing test** (append to the test file)

```ts
import { resolveFilterType } from "./filterDefaults";

describe("resolveFilterType", () => {
  const base = { isServerMode: false, facetThreshold: 12, hasStaticOptions: false };

  it("auto-facets low-cardinality text into multiSelect", () => {
    expect(resolveFilterType({ ...base, dataType: "text", distinctCount: 6 })).toBe("multiSelect");
  });

  it("keeps high-cardinality text as free-text contains", () => {
    expect(resolveFilterType({ ...base, dataType: "text", distinctCount: 13 })).toBe("text");
  });

  it("treats the threshold as inclusive (<=)", () => {
    expect(resolveFilterType({ ...base, dataType: "text", distinctCount: 12 })).toBe("multiSelect");
  });

  it("upgrades text to multiSelect when static options are supplied", () => {
    expect(
      resolveFilterType({ ...base, dataType: "text", distinctCount: 999, hasStaticOptions: true }),
    ).toBe("multiSelect");
  });

  it("falls back to free-text in server mode (cannot facet from one page)", () => {
    expect(
      resolveFilterType({ ...base, dataType: "text", distinctCount: undefined, isServerMode: true }),
    ).toBe("text");
  });

  it("still facets text in server mode when static options exist", () => {
    expect(
      resolveFilterType({ ...base, dataType: "text", isServerMode: true, hasStaticOptions: true }),
    ).toBe("multiSelect");
  });

  it("always makes status multiSelect regardless of cardinality", () => {
    expect(resolveFilterType({ ...base, dataType: "status", distinctCount: 999 })).toBe("multiSelect");
  });

  it("uses the dataType default for non-text/status types", () => {
    expect(resolveFilterType({ ...base, dataType: "number", distinctCount: 3 })).toBe("range");
    expect(resolveFilterType({ ...base, dataType: "date" })).toBe("date");
    expect(resolveFilterType({ ...base, dataType: "boolean" })).toBe("boolean");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/DataGrid/filterDefaults.test.ts`
Expected: FAIL — `resolveFilterType` is not exported.

- [ ] **Step 3: Write minimal implementation** (append to `filterDefaults.ts`)

```ts
export type ResolveFilterTypeArgs = {
  dataType: GridDataType;
  /** Distinct value count over the data; omit in server mode (unknown from one page). */
  distinctCount?: number;
  /** True when the consumer supplied an explicit `options` list. */
  hasStaticOptions?: boolean;
  isServerMode?: boolean;
  /** Text columns with <= this many distinct values auto-facet. Default 12. */
  facetThreshold?: number;
};

// Refines the dataType default with cardinality awareness. Only `text` is
// data-dependent: it becomes a faceted multiSelect when the value set is small
// (or static options are supplied), otherwise a free-text contains box. `status`
// is always categorical. Everything else uses the dataType default verbatim.
export const resolveFilterType = ({
  dataType,
  distinctCount,
  hasStaticOptions = false,
  isServerMode = false,
  facetThreshold = 12,
}: ResolveFilterTypeArgs): GridFilterType => {
  if (dataType === "text") {
    if (hasStaticOptions) return "multiSelect";
    if (!isServerMode && distinctCount != null && distinctCount <= facetThreshold) {
      return "multiSelect";
    }
    return "text";
  }
  return defaultFilterTypeForDataType(dataType);
};

export const DEFAULT_FACET_THRESHOLD = 12;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/DataGrid/filterDefaults.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/components/DataGrid/filterDefaults.ts src/components/DataGrid/filterDefaults.test.ts
git commit -m "feat(filters): add cardinality-aware resolveFilterType"
```

### Task 3: numeric extent helper for range bounds

**Files:**
- Modify: `src/components/DataGrid/gridHelpers.ts:27` (next to `uniqueColumnValues`)
- Test: `src/components/DataGrid/gridHelpers.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

```ts
// src/components/DataGrid/gridHelpers.test.ts
import { describe, expect, it } from "vitest";
import { columnNumericExtent } from "./gridHelpers";

describe("columnNumericExtent", () => {
  it("returns min/max over finite numeric cells", () => {
    const data = [{ n: 5 }, { n: -2 }, { n: 10 }];
    expect(columnNumericExtent(data, "n")).toEqual({ min: -2, max: 10 });
  });

  it("ignores non-finite/blank cells", () => {
    const data = [{ n: 5 }, { n: Number.NaN }, { n: null }, { n: 3 }] as { n: number }[];
    expect(columnNumericExtent(data, "n")).toEqual({ min: 3, max: 5 });
  });

  it("returns null when no finite values exist", () => {
    expect(columnNumericExtent([{ n: null }] as { n: number }[], "n")).toBeNull();
    expect(columnNumericExtent([], "n" as never)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/DataGrid/gridHelpers.test.ts`
Expected: FAIL — `columnNumericExtent` not exported.

- [ ] **Step 3: Write minimal implementation** (add directly after `uniqueColumnValues`, `gridHelpers.ts:30`)

```ts
// Min/max over a column's finite numeric cells, for range-filter input bounds.
// Returns null when the column has no finite values (so callers can skip bounds).
export const columnNumericExtent = <TData extends object>(
  data: TData[],
  key: Extract<keyof TData, string>,
): { min: number; max: number } | null => {
  let min = Infinity;
  let max = -Infinity;
  for (const row of data) {
    const value = Number(row[key]);
    if (!Number.isFinite(value)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return Number.isFinite(min) ? { min, max } : null;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/DataGrid/gridHelpers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/DataGrid/gridHelpers.ts src/components/DataGrid/gridHelpers.test.ts
git commit -m "feat(filters): add columnNumericExtent helper for range bounds"
```

---

## Chunk 2: Public types & feature flags

Type-only + flag wiring. After this chunk, `npx tsc -b` must pass with no behavior change yet (defaults preserve current behavior until Chunk 3 reads them).

### Task 4: extend the public types and feature flags

**Files:**
- Modify: `src/types/grid.ts:95-142` (column config), `:183-204` (`GridFilterConfig`)
- Modify: `src/components/DataGrid/DataGrid.tsx:123-151` (`DataGridFeatures`), `:280` (props type), `:339-360` (`defaultFeatures`), `:430-470` (props destructure)
- Modify: `src/components/DataGrid/index.ts`

- [ ] **Step 1a: Add `enableFiltering` to the public column config** — in `src/types/grid.ts`, inside `GridColumnConfigForKey` (near the other capability flags, after `enableGrouping?` at line ~104):

```ts
  /** Opt this column out of auto-provisioned filtering. Default true. */
  enableFiltering?: boolean;
```

- [ ] **Step 1b: Add `enableFiltering` to the value-erased engine type** — the engine reads columns through a **hand-written** mirror type, `AnyColumnConfig`, in `src/components/DataGrid/cells.tsx:24` (it is NOT derived from `GridColumnConfig`, so it must be edited in parallel or `tsc` fails when Chunk 3 reads `column.enableFiltering`). Add, next to `enableGrouping?` (cells.tsx ~line 32):

```ts
  enableFiltering?: boolean;
```

- [ ] **Step 2: Relax `GridFilterConfig`** — in `src/types/grid.ts`, make `label` optional and add `filterable`:

```ts
export type GridFilterConfig<TData> = {
  accessorKey: Extract<keyof TData, string>;
  /** Defaults to the column's `header`. */
  label?: string;
  /** Set false to opt this column out of filtering even under auto-provision. */
  filterable?: boolean;
  /** Defaults to a control inferred from the column's dataType. */
  filterType?: GridFilterType;
  // ...rest unchanged
```

(Keep every other field as-is. Only `label` becomes optional and `filterable` is added; update the `/** Defaults to "select". */` comment on `filterType` to the line above.)

- [ ] **Step 3: Add the three feature flags** — in `DataGrid.tsx` `DataGridFeatures` (after `floatingFilters` at line 138):

```ts
  /** Master toggle for per-column header filters (auto-provisioned by dataType). */
  headerFilters: boolean;
  /** When false, only columns named in `filters` are filterable (legacy opt-in). */
  autoColumnFilters: boolean;
  /** Show the applied-filter chip bar. */
  filterSummary: boolean;
```

- [ ] **Step 4: Default the flags** — in `defaultFeatures` (line 339-360) add:

```ts
  headerFilters: true,
  autoColumnFilters: true,
  filterSummary: true,
```

- [ ] **Step 5: Add the `facetThreshold` prop** — in the `DataGridProps` type, next to `filters?` (line 280):

```ts
  /** Text columns with <= this many distinct values auto-facet into multiSelect. Default 12. */
  facetThreshold?: number;
```

And in the props destructure (after `filters = []`, line 438) using the exported default:

```ts
  facetThreshold = DEFAULT_FACET_THRESHOLD,
```

Add the import at the top of `DataGrid.tsx` (near the other `./filter*` imports, line ~52):

```ts
import { resolveFilterType, DEFAULT_FACET_THRESHOLD } from "./filterDefaults";
```

- [ ] **Step 6: Export new public surface** — in `src/components/DataGrid/index.ts`:
  - add `GridFilterConfig` is already exported; nothing to change there.
  - add a new export block for the inference helpers:

```ts
export {
  defaultFilterTypeForDataType,
  resolveFilterType,
  DEFAULT_FACET_THRESHOLD,
  type ResolveFilterTypeArgs,
} from "./filterDefaults";
```

- [ ] **Step 7: Type-check**

Run: `npx tsc -b`
Expected: PASS (no errors). `facetThreshold` is currently unused — that is fine; TS does not error on an unused destructured prop. If a "declared but never read" lint-style error appears, leave it for Chunk 3 which consumes it (it will be consumed within the same branch before any commit that could fail CI; if `tsc` flags it now, prefix usage by referencing it in the memo in Chunk 3 — do not add a throwaway reference).

- [ ] **Step 8: Run the existing suite to confirm no regressions**

Run: `npx vitest run`
Expected: PASS (behavior unchanged — new flags not yet read).

- [ ] **Step 9: Commit**

```bash
git add src/types/grid.ts src/components/DataGrid/cells.tsx src/components/DataGrid/DataGrid.tsx src/components/DataGrid/index.ts
git commit -m "feat(filters): add type-aware filter flags and facetThreshold prop"
```

---

## Chunk 3: The `resolvedFilters` source of truth

This is the core integration. It replaces the three places that read the `filters` prop directly with one memo covering all filterable columns. Work test-first: write the auto-provision tests, watch them fail, then wire the memo.

### Task 5: route all filter metadata through `resolvedFilters`

**Files:**
- Modify: `src/components/DataGrid/DataGrid.tsx`
  - `:768-774` (`filterTypeByColumnId` / `filterOperatorByColumnId`) — rebuild from `resolvedFilters`.
  - new memos near there: `filterableColumnConfigs`, `columnFacets`, `columnRangeBounds`, `resolvedFilters`.
  - `:1464-1473` (`filterOptionsById`) — iterate `resolvedFilters` + reuse `columnFacets`.
  - `:1475-1521` (`toolbarFilters`) — iterate `resolvedFilters`.
- Test: `src/components/DataGrid/DataGrid.filters.test.tsx`

**Reference — current shape of the code being replaced:**
- `filterTypeByColumnId` (768): `new Map(filters.map((f) => [f.accessorKey, f.filterType ?? "select"]))`
- `filterOptionsById` (1464): `filter.options ?? (filter.filterType === "boolean" ? ["true","false"] : undefined) ?? (isServerMode ? [] : uniqueColumnValues(data, filter.accessorKey))`
- `toolbarFilters` (1475): maps each `filter` to a `GridFilter` runtime descriptor with `value` (from `table.getColumn(...).getFilterValue()` in grid, `pivotFilter?.value` in pivot) and an `onChange`.
- `columnList` (line ~730): `const columnList = columns as unknown as AnyColumnConfig<TData>[];` — has `accessorKey`, `header`, `dataType`, `enableFiltering`.

- [ ] **Step 1: Write the failing tests** — add to `DataGrid.filters.test.tsx`. **Use `fireEvent`, not `@testing-library/user-event`** (it is NOT a project dependency; every existing test in this file uses `fireEvent`, imported via `import { cleanup, fireEvent, render, screen } from "@testing-library/react"`). Use small inline domain-neutral data. Open a header funnel by its `aria-label` (`"<Label> filter"`), then assert controls/rows. The funnel button label is `` `${filter.label} filter` `` (see `filters.tsx:139`); range inputs are labeled `"<Label> minimum"`/`"<Label> maximum"` (`filterBodies.tsx:229,245`); multiSelect checkboxes use `aria-label={format(option)}` (`filterBodies.tsx:180`); the text body is labeled `"<Label> contains"` (`filterBodies.tsx:265`).

```tsx
// A column with NO entry in `filters` is still filterable, with a control
// inferred from its dataType.
it("auto-provisions a range filter for an unlisted numeric column", () => {
  render(
    <DataGrid
      data={[
        { id: "a", price: 5 },
        { id: "b", price: 50 },
      ]}
      columns={[
        { accessorKey: "id", header: "ID", dataType: "text" },
        { accessorKey: "price", header: "Price", dataType: "currency" },
      ]}
    />,
  );
  // No `filters` prop at all, yet Price has a filter funnel.
  fireEvent.click(screen.getByRole("button", { name: /Price filter/i }));
  // Range control => min/max numeric inputs exist.
  expect(screen.getByLabelText("Price minimum")).toBeInTheDocument();
  expect(screen.getByLabelText("Price maximum")).toBeInTheDocument();
});

it("infers multiSelect for a low-cardinality text column (auto-facet)", () => {
  render(
    <DataGrid
      data={[{ id: "a", dept: "Grocery" }, { id: "b", dept: "Home" }]}
      columns={[
        { accessorKey: "id", header: "ID", dataType: "text" },
        { accessorKey: "dept", header: "Dept", dataType: "text" },
      ]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Dept filter/i }));
  // multiSelect renders a checkbox per distinct value.
  expect(screen.getByRole("checkbox", { name: "Grocery" })).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "Home" })).toBeInTheDocument();
});

it("keeps free-text contains for high-cardinality text under facetThreshold", () => {
  render(
    <DataGrid
      data={[{ id: "a", name: "Alpha" }, { id: "b", name: "Beta" }]}
      columns={[{ accessorKey: "name", header: "Name", dataType: "text" }]}
      facetThreshold={1}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Name filter/i }));
  // contains => single text input, not checkboxes.
  expect(screen.getByLabelText("Name contains")).toBeInTheDocument();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
});

it("respects enableFiltering: false (no funnel)", () => {
  render(
    <DataGrid
      data={[{ id: "a", note: "x" }]}
      columns={[
        { accessorKey: "id", header: "ID", dataType: "text" },
        { accessorKey: "note", header: "Note", dataType: "text", enableFiltering: false },
      ]}
    />,
  );
  expect(screen.queryByRole("button", { name: /Note filter/i })).not.toBeInTheDocument();
});

it("reverts to opt-in when features.autoColumnFilters is false", () => {
  render(
    <DataGrid
      data={[{ id: "a", price: 1 }]}
      columns={[
        { accessorKey: "id", header: "ID", dataType: "text" },
        { accessorKey: "price", header: "Price", dataType: "number" },
      ]}
      filters={[{ accessorKey: "price" }]}
      features={{ autoColumnFilters: false }}
    />,
  );
  expect(screen.getByRole("button", { name: /Price filter/i })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /ID filter/i })).not.toBeInTheDocument();
});

it("infers from dataType when a filters entry omits filterType (regression for the old select default)", () => {
  render(
    <DataGrid
      data={[{ id: "a", price: 5 }, { id: "b", price: 9 }]}
      columns={[{ accessorKey: "price", header: "Price", dataType: "number" }]}
      filters={[{ accessorKey: "price" }]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Price filter/i }));
  expect(screen.getByLabelText("Price minimum")).toBeInTheDocument(); // range, not a select
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/components/DataGrid/DataGrid.filters.test.tsx`
Expected: FAIL — unlisted columns have no funnel; numeric inference not applied.

- [ ] **Step 3: Add the early memos** — in `DataGrid.tsx`, replace the `filterTypeByColumnId`/`filterOperatorByColumnId` block (lines 768-774) with the following. Place `columnFacets` and `columnRangeBounds` and `resolvedFilters` here too (they need only `columnList`, `data`, `features`, `isServerMode`, `facetThreshold` — all defined above this point). Import `columnNumericExtent` from `./gridHelpers` (add to the existing import at line ~90).

```ts
  // Columns eligible for a filter. Non-synthetic leaves only (select/rowActions
  // are not in `columnList`), minus explicit opt-outs. Independent of column
  // visibility so chip metadata survives hiding a filtered column. When
  // auto-provision is off, fall back to exactly the columns named in `filters`.
  const overridesByKey = useMemo(
    () => new Map(filters.map((filter) => [filter.accessorKey as string, filter])),
    [filters],
  );
  const filterableColumnConfigs = useMemo<AnyColumnConfig<TData>[]>(() => {
    if (!features.headerFilters) return [];
    const eligible = columnList.filter((column) => column.enableFiltering !== false);
    if (features.autoColumnFilters) {
      return eligible.filter((column) => overridesByKey.get(column.accessorKey as string)?.filterable !== false);
    }
    return eligible.filter((column) => overridesByKey.has(column.accessorKey as string)
      && overridesByKey.get(column.accessorKey as string)?.filterable !== false);
  }, [features.headerFilters, features.autoColumnFilters, columnList, overridesByKey]);

  // Distinct values (for select/multiSelect options + facet cardinality) and
  // numeric extents (for range input bounds). Page-scoped is meaningless in
  // server mode, so skip the scans there.
  const columnFacets = useMemo(() => {
    const map = new Map<string, string[]>();
    if (isServerMode) return map;
    filterableColumnConfigs.forEach((column) => {
      map.set(column.accessorKey as string, uniqueColumnValues(data, column.accessorKey));
    });
    return map;
  }, [filterableColumnConfigs, data, isServerMode]);

  const columnRangeBounds = useMemo(() => {
    const map = new Map<string, { min: number; max: number }>();
    if (isServerMode) return map;
    filterableColumnConfigs.forEach((column) => {
      if (column.dataType === "number" || column.dataType === "currency" || column.dataType === "percent") {
        const extent = columnNumericExtent(data, column.accessorKey);
        if (extent) map.set(column.accessorKey as string, extent);
      }
    });
    return map;
  }, [filterableColumnConfigs, data, isServerMode]);

  // The single source of truth. One descriptor per filterable column, merging
  // dataType inference with optional `filters` overrides. Every consumer below
  // (filterType/operator maps, header funnels, pivot popover, chip bar) reads
  // this — so grid and pivot stay in lockstep by construction.
  const resolvedFilters = useMemo(() => {
    return filterableColumnConfigs.map((column) => {
      const key = column.accessorKey as string;
      const override = overridesByKey.get(key);
      const hasStaticOptions = Boolean(override?.options?.length);
      const filterType =
        override?.filterType ??
        resolveFilterType({
          dataType: column.dataType,
          distinctCount: columnFacets.get(key)?.length,
          hasStaticOptions,
          isServerMode,
          facetThreshold,
        });
      const bounds = columnRangeBounds.get(key);
      return {
        accessorKey: key,
        label: override?.label ?? column.header,
        filterType,
        operator: override?.operator,
        operators: override?.operators,
        options: override?.options,
        formatOption: override?.formatOption,
        min: override?.min ?? bounds?.min,
        max: override?.max ?? bounds?.max,
        step: override?.step,
        placeholder: override?.placeholder,
        dateFormat: override?.dateFormat,
        presets: override?.presets,
      };
    });
  }, [filterableColumnConfigs, overridesByKey, columnFacets, columnRangeBounds, isServerMode, facetThreshold]);

  const filterTypeByColumnId = useMemo<Map<string, GridFilterType>>(
    () => new Map(resolvedFilters.map((filter) => [filter.accessorKey, filter.filterType])),
    [resolvedFilters],
  );
  const filterOperatorByColumnId = useMemo<Map<string, GridFilterOperator | undefined>>(
    () => new Map(resolvedFilters.map((filter) => [filter.accessorKey, filter.operator])),
    [resolvedFilters],
  );
```

Note: `AnyColumnConfig` is already imported in `DataGrid.tsx` (used for `columnList`). `resolveFilterType` and `DEFAULT_FACET_THRESHOLD` were imported in Chunk 2. `columnList` is declared at `DataGrid.tsx:685` and the replaced `filterTypeByColumnId` block is at `768`, with `columnFilterFn` at `870` — so placing these memos at ~768 sits correctly between them. (Verify the exact line before editing; the ordering constraint 685 < memos < 870 is what matters.)

**Optional (spec fidelity):** the spec names a `ResolvedColumnFilter` type. If you want the named contract instead of the inline shape, declare it in `filterDefaults.ts` and annotate the memo (`useMemo<ResolvedColumnFilter[]>`), exporting it from `index.ts`:

```ts
// filterDefaults.ts
import type { GridFilterOperator, GridFilterType } from "../../types/grid";
export type ResolvedColumnFilter = {
  accessorKey: string;
  label: string;
  filterType: GridFilterType;
  operator?: GridFilterOperator;
  operators?: GridFilterOperator[];
  options?: string[];
  formatOption?: (value: string) => string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  dateFormat?: Intl.DateTimeFormatOptions;
  presets?: boolean;
};
```

- [ ] **Step 4: Rebuild `filterOptionsById` from `resolvedFilters`** — replace lines 1464-1473:

```ts
  const filterOptionsById = useMemo(() => {
    const map: Record<string, string[]> = {};
    resolvedFilters.forEach((filter) => {
      map[filter.accessorKey] =
        filter.options ??
        (filter.filterType === "boolean" ? ["true", "false"] : undefined) ??
        columnFacets.get(filter.accessorKey) ??
        [];
    });
    return map;
  }, [resolvedFilters, columnFacets]);
```

- [ ] **Step 5: Rebuild `toolbarFilters` from `resolvedFilters`** — change the iteration source at line 1475 from `filters.map((filter) => {` to `resolvedFilters.map((filter) => {`. Inside, every `filter.accessorKey` / `filter.label` / `filter.filterType ?? "select"` / `filter.min` etc. now reads the resolved descriptor, so:
  - replace `filterType: filter.filterType ?? "select",` with `filterType: filter.filterType,`
  - the two `isFilterValueActive(value, { filterType: filter.filterType ?? "select", ... })` calls (lines ~1510) become `filterType: filter.filterType`.
  - everything else (the `column = table.getColumn(filter.accessorKey)`, `pivotFilter`, `onChange`) stays identical.

- [ ] **Step 6: Run the new tests**

Run: `npx vitest run src/components/DataGrid/DataGrid.filters.test.tsx`
Expected: the new Step-1 cases PASS. One pre-existing test in this same file — `"filters select columns by exact match"` (line ~27) — will FAIL here because its `dept` filter now auto-facets to multiSelect; that is expected and is fixed in Step 7. (If you prefer no red in this run, apply the line-27 edit from Step 7 now.)

- [ ] **Step 7: Update pre-existing tests that intentionally exercised the OLD `select` default** — the behavior change (omitted `filterType` now infers from `dataType`; low-cardinality text and `status` become `multiSelect`; static-options text upgrades to `multiSelect`) flips four existing tests whose assertions use `getByRole("option", …)` (which only `SelectBody` renders). Preserve each test's intent by adding an explicit `filterType: "select"` to its filter config so it keeps the select control:
  - `src/components/DataGrid/DataGrid.filters.test.tsx:25` — the `"filters select columns by exact match"` test's `filters` becomes `[{ accessorKey: "dept", label: "Dept", filterType: "select" }]`. (This test is *about* select exact-match, so pinning it to `select` is correct.)
  - `src/components/DataGrid/DataGrid.server.test.tsx` — add `filterType: "select"` to **both** `name` filter configs: `filtersWithOptions` (~line 284, has static `options` → would upgrade to multiSelect) **and** `filtersNoOptions` (~line 264, would otherwise become `text` contains in server mode, eroding that test's "does not derive select options from the page" intent even though its negative assertion still passes).
  - `src/components/DataGrid/DataGrid.config.test.tsx:346-366` — add `filterType: "select"` to the `status` filter config (a `dataType:"status"` column otherwise always infers multiSelect).
  - `src/components/DataGrid/DataGrid.test.tsx:586-615` — add `filterType: "select"` to the pivot `department` filter config (low-cardinality text otherwise auto-facets).

- [ ] **Step 8: Run the FULL suite — catch lockstep/pivot regressions**

Run: `npx vitest run`
Expected: PASS, including the four tests updated in Step 7. If a pivot filter test fails, confirm the pivot `pivotSourceRows` loop (lines ~1070-1112) still reads `filterTypeByColumnId`/`filterOperatorByColumnId` (it does; we only changed how those maps are built).

- [ ] **Step 9: Type-check**

Run: `npx tsc -b`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/components/DataGrid/DataGrid.tsx \
  src/components/DataGrid/DataGrid.filters.test.tsx \
  src/components/DataGrid/DataGrid.server.test.tsx \
  src/components/DataGrid/DataGrid.config.test.tsx \
  src/components/DataGrid/DataGrid.test.tsx
git commit -m "feat(filters): auto-provision type-aware filters via resolvedFilters"
```

### Task 6: number / percent / currency / boolean predicate coverage

The predicate already supports these; the gap is **test coverage** (the demo never exercised number/percent/boolean). Add behavior tests that drive the controls.

**Files:**
- Test: `src/components/DataGrid/DataGrid.filters.test.tsx`

- [ ] **Step 1: Write the tests** — cover, for a `number` column, each operator path and edges (min only, max only, between, gt/gte/lt/lte, equals, negative, decimal, zero, inverted min>max → no rows); a `percent` column range; a `currency` column range; and a `boolean` column (assert the funnel renders an `is`-style control via SelectBody with true/false options and filters correctly). Drive controls by `aria-label` (`"<Label> minimum"`, `"<Label> maximum"`, `"<Label> operator"`) consistent with `filterBodies.tsx`. Keep each `it()` focused.

- [ ] **Step 2: Run to verify they pass** (predicate already implements these)

Run: `npx vitest run src/components/DataGrid/DataGrid.filters.test.tsx`
Expected: PASS. Any FAIL here is a real predicate bug — debug with superpowers:systematic-debugging before proceeding.

- [ ] **Step 3: Commit**

```bash
git add src/components/DataGrid/DataGrid.filters.test.tsx
git commit -m "test(filters): cover number/percent/currency/boolean filtering"
```

---

## Chunk 4: Applied-filter chip bar

### Task 7: extract `summarizeFilter`

**Files:**
- Modify: `src/components/DataGrid/filters.tsx:65` (the private `summarize`)

- [ ] **Step 1: Export the helper** — rename the module-private `summarize` to an exported `summarizeFilter` and update its internal call sites in `filters.tsx` (the `<span className="truncate">{summarize(filter)}</span>` in the inline button). Signature unchanged: `(filter: GridFilter) => string`.

```ts
export const summarizeFilter = (filter: GridFilter): string => { /* existing body */ };
```

- [ ] **Step 2: Type-check + existing tests**

Run: `npx tsc -b && npx vitest run src/components/DataGrid/DataGrid.filters.test.tsx`
Expected: PASS (pure refactor).

- [ ] **Step 3: Commit**

```bash
git add src/components/DataGrid/filters.tsx
git commit -m "refactor(filters): export summarizeFilter for reuse"
```

### Task 8: `AppliedFilters` component

**Files:**
- Create: `src/components/DataGrid/AppliedFilters.tsx`
- Test: `src/components/DataGrid/DataGrid.filters.test.tsx`

- [ ] **Step 1: Write the failing test** — render a grid with a filterable column, assert: one chip per active filter (text contains the label + summary), the chip's remove button clears just that filter, "Clear all" clears everything, and the bar is absent when nothing is active. Use `fireEvent`; add `within` to the existing `@testing-library/react` import (`import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";`).

```tsx
it("shows a removable chip per active filter and a clear-all", () => {
  render(
    <DataGrid
      data={[
        { id: "a", dept: "Grocery", price: 5 },
        { id: "b", dept: "Home", price: 50 },
      ]}
      columns={[
        { accessorKey: "dept", header: "Dept", dataType: "text" },
        { accessorKey: "price", header: "Price", dataType: "number" },
      ]}
      getRowId={(r) => r.id}
    />,
  );
  // Apply a Dept facet selection (low-cardinality text => multiSelect checkboxes).
  fireEvent.click(screen.getByRole("button", { name: /Dept filter/i }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Grocery" }));
  // A chip appears in the applied-filter bar.
  const chip = screen.getByTestId("applied-filter-dept");
  expect(chip).toHaveTextContent(/Dept/);
  // Removing the chip clears that filter.
  fireEvent.click(within(chip).getByRole("button", { name: /Remove Dept filter/i }));
  expect(screen.queryByTestId("applied-filter-dept")).not.toBeInTheDocument();
});

it("hides the applied-filter bar when features.filterSummary is false", () => {
  render(
    <DataGrid
      data={[{ id: "a", dept: "Grocery" }, { id: "b", dept: "Home" }]}
      columns={[{ accessorKey: "dept", header: "Dept", dataType: "text" }]}
      getRowId={(r) => r.id}
      features={{ filterSummary: false }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Dept filter/i }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Grocery" }));
  expect(screen.queryByTestId("applied-filter-dept")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/DataGrid/DataGrid.filters.test.tsx`
Expected: FAIL — no `applied-filter-*` testid.

- [ ] **Step 3: Implement the component**

```tsx
// src/components/DataGrid/AppliedFilters.tsx
// Presentational summary of active filters: one removable chip per active
// column filter, plus a chip for an active global search, plus Clear all.
// Domain-neutral; reads runtime GridFilter descriptors built by DataGrid.
import { isFilterActive, summarizeFilter, type GridFilter } from "./filters";

export const AppliedFilters = ({
  filters,
  globalSearch,
  onClearGlobalSearch,
  onClearAll,
}: {
  filters: GridFilter[];
  globalSearch: string;
  onClearGlobalSearch: () => void;
  onClearAll: () => void;
}) => {
  const active = filters.filter(isFilterActive);
  const hasGlobal = globalSearch.trim().length > 0;
  if (active.length === 0 && !hasGlobal) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
      {hasGlobal ? (
        <span
          data-testid="applied-filter-search"
          className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700"
        >
          <span className="truncate">Search: “{globalSearch}”</span>
          <button
            type="button"
            aria-label="Remove search filter"
            onClick={onClearGlobalSearch}
            className="text-slate-400 hover:text-slate-700"
          >
            ✕
          </button>
        </span>
      ) : null}
      {active.map((filter) => (
        <span
          key={filter.id}
          data-testid={`applied-filter-${filter.id}`}
          className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700"
        >
          <span className="truncate">
            {filter.label}: {summarizeFilter(filter)}
          </span>
          <button
            type="button"
            aria-label={`Remove ${filter.label} filter`}
            onClick={() => filter.onChange(undefined)}
            className="text-slate-400 hover:text-slate-700"
          >
            ✕
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="ml-1 text-xs font-medium text-slate-500 underline underline-offset-2 hover:text-slate-900"
      >
        Clear all
      </button>
    </div>
  );
};
```

- [ ] **Step 4: Render it in `DataGrid.tsx`** — import at top:

```ts
import { AppliedFilters } from "./AppliedFilters";
```

Insert it directly **after** the existing row-count status bar (`DataGrid.tsx:2985-3003`, the `<div className="flex flex-wrap items-center justify-between ... bg-slate-50 px-4 py-2 ...">` block), so chips sit just under the count:

```tsx
        {features.filterSummary ? (
          <AppliedFilters
            filters={toolbarFilters}
            globalSearch={currentGlobalFilter}
            onClearGlobalSearch={() => emitGlobalFilterChangeWithServerReset("")}
            onClearAll={clearFilters}
          />
        ) : null}
```

`toolbarFilters`, `currentGlobalFilter`, `emitGlobalFilterChangeWithServerReset`, and `clearFilters` are all already in scope at the render site (verify: `clearFilters` defined at 1578; `emitGlobalFilterChangeWithServerReset` used in the Toolbar block at ~2966).

- [ ] **Step 5: Run the new tests**

Run: `npx vitest run src/components/DataGrid/DataGrid.filters.test.tsx`
Expected: PASS.

- [ ] **Step 6: Add the count + hidden-column + pivot tests** — three more `it()` cases:
  1. **Count already present:** assert the existing status bar text `"1 of 2 rows"` (client) updates after filtering. (No new code; this guards the count requirement.)
  2. **Hidden-column chip persistence:** apply a filter, hide that column via `columnVisibility` (pass `state={{ columnVisibility: { dept: false } }}` controlled, or toggle through the column menu), assert the chip and its remove button still resolve. This guards the §1 decision that `filterableColumnConfigs` ignores visibility.
  3. **Pivot:** render with `layoutMode="pivot"` + a pivot config, apply a filter through the toolbar Filters popover, assert a chip renders. (Pattern after existing pivot tests in `DataGrid.test.tsx`.)

- [ ] **Step 7: Run + type-check**

Run: `npx vitest run && npx tsc -b`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/DataGrid/AppliedFilters.tsx src/components/DataGrid/DataGrid.tsx src/components/DataGrid/DataGrid.filters.test.tsx
git commit -m "feat(filters): add applied-filter chip bar"
```

---

## Chunk 5: Demo + server simulation

### Task 9: add a boolean column and reduce `retailFilters` to overrides

**Files:**
- Modify: `src/data/mockRetailData.ts` (`RetailItem` type, `retailColumns`, the row generator, `retailFilters`)

- [ ] **Step 1: Add `on_promotion: boolean`** to the `RetailItem` type (after `last_restocked_at`).

- [ ] **Step 2: Add the column** to `retailColumns` (after `last_restocked_at`):

```ts
  { accessorKey: "on_promotion", header: "On Promotion", dataType: "boolean", width: 130 },
```

- [ ] **Step 3: Populate it in the row generator** — in the `mockRetailData` builder (`mockRetailData.ts:251`), add `on_promotion` to the returned object literal (alongside `last_restocked_at`). The generator seeds each field as `seededRandom(rowNumber * <prime>)`; offsets up to 41 are used, so use the next free one, 43:

```ts
    last_restocked_at: lastRestockedAt,
    on_promotion: seededRandom(rowNumber * 43) > 0.6,
  };
```

- [ ] **Step 4: Reduce `retailFilters` to genuine overrides:**

```ts
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
```

Everything else (`category`, `brand`, `units`, `margin_rate`, `price_gap`, `last_restocked_at`, `on_promotion`, `item_id`) now auto-resolves: `brand`→multiSelect (8 distinct), `category`→text contains (24 distinct > 12), numerics→range, date→date, boolean→boolean.

- [ ] **Step 5: Type-check + run the app smoke** (the demo is the consumer)

Run: `npx tsc -b && npx vitest run`
Expected: PASS. Then use the **run** skill (or `npm run dev`) to eyeball: every column shows a funnel; numeric/date/boolean controls render correctly.

- [ ] **Step 6: Commit**

```bash
git add src/data/mockRetailData.ts
git commit -m "feat(demo): exercise every dataType filter path incl. boolean"
```

### Task 10: fix `fakeServer` to use shared inference

**Files:**
- Modify: `src/data/fakeServer.ts:28-40`
- Test: `src/data/fakeServer.test.ts`

- [ ] **Step 1: Write the failing test** — in `fakeServer.test.ts`, assert that a **text** column filter does *contains* (not exact match) and a **boolean** filter matches. Example: query `columnFilters: [{ id: "item_name", value: "<substring present in several names>" }]` returns >1 row (proving contains, not exact). And a `{ id: "on_promotion", value: true }` (or `{operator:"is", value:true}`) returns only promoted rows.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/data/fakeServer.test.ts`
Expected: FAIL — current `filterTypeById` resolves `item_name` via `?? "select"` → exact match.

- [ ] **Step 3: Replace the `filterTypeById` map** — `fakeServer` knows each column's `dataType` via `retailColumns`, and must resolve the **same** filterType the grid produced in server mode (so the value shape matches). Use `isServerMode: true` so text stays contains:

```ts
import { resolveFilterType } from "../components/DataGrid/filterDefaults";
import { mockRetailData, retailColumns, retailFilters, type RetailItem } from "./mockRetailData";

const overrideByKey = new Map(retailFilters.map((f) => [f.accessorKey as string, f]));

const filterTypeById = new Map(
  retailColumns.map((column) => {
    const key = column.accessorKey as string;
    const override = overrideByKey.get(key);
    return [
      key,
      override?.filterType ??
        resolveFilterType({
          dataType: column.dataType,
          hasStaticOptions: Boolean(override?.options?.length),
          isServerMode: true,
        }),
    ];
  }),
);
```

Keep `filterOperatorById` deriving from `retailFilters` overrides (operators are only ever set as overrides):

```ts
const filterOperatorById = new Map(
  retailFilters.map((f) => [f.accessorKey as string, f.operator]),
);
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/data/fakeServer.test.ts`
Expected: PASS (contains + boolean correct).

- [ ] **Step 5: Run full suite + type-check**

Run: `npx vitest run && npx tsc -b`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/data/fakeServer.ts src/data/fakeServer.test.ts
git commit -m "fix(demo-server): derive filter types from shared inference"
```

---

## Chunk 6: Final verification

### Task 11: full verification & package build

**Files:** none (verification only).

- [ ] **Step 1: Type-check** — `npx tsc -b` → PASS.
- [ ] **Step 2: Full test suite** — `npm test` (i.e. `vitest run`) → PASS, including `filterDefaults.test.ts`, `gridHelpers.test.ts`, `DataGrid.filters.test.tsx`, `fakeServer.test.ts`, and all pre-existing suites.
- [ ] **Step 3: Library build** — `npm run build:package` → succeeds (declarations emit for the new public exports). Then `npm run test:package` → PASS (tarball + ESM/CJS smoke).
- [ ] **Step 4: Manual smoke** — use the **run** skill / `npm run dev`; verify in the browser: every column has a funnel; numeric columns show min/max; low-cardinality text shows checkboxes; high-cardinality text shows a contains box; the boolean column filters; applied-filter chips appear, remove individually, and clear-all works; pivot mode shows chips and the Filters popover.
- [ ] **Step 5: Use superpowers:requesting-code-review** before merge.
- [ ] **Step 6: Use superpowers:finishing-a-development-branch** to decide merge/PR.

---

## Notes & risks

- **Memo placement:** the new early memos (`resolvedFilters` et al.) must sit *after* `columnList` (`DataGrid.tsx:685`) and *before* `columnFilterFn` (~870). The replaced `filterTypeByColumnId` block (768) is already in that window — keep them there.
- **Result-count wording (accepted deviation):** the spec §4/§5 asks for "Showing X of Y" (client) / "{rowCount} results" (server). The existing status bar (`DataGrid.tsx:2985`) already renders `{filteredRowCount} of {displayedTotalRowCount} {rowLabel}`, and `displayedTotalRowCount = isServerMode ? rowCount : data.length` (`:1977`), so the count requirement is already satisfied in both modes via existing code; the chip bar does NOT duplicate it. We keep the existing wording rather than re-skinning it (would be churn/scope creep). The plan only adds the client-count guard test; this is an intentional, documented deviation.
- **Performance:** `columnFacets`/`columnRangeBounds` scan `data` per filterable column. This generalizes the existing per-`filters`-entry `uniqueColumnValues` scan to all columns; for the 500-row demo it is negligible. If a consumer has very wide/large client data, they can disable auto-provision (`features.autoColumnFilters: false`) or opt columns out.
- **Server-mode categoricals:** a `status`/text column with no static `options` becomes an empty `multiSelect`/`text` in server mode (pre-existing degradation, documented in CLAUDE.md). The demo supplies `options` for `department` and `recommendation_status` so they work in both modes.
- **Out of scope:** `serverQuery.ts` / `retailBigQuery.ts` have the same "derive filter type" dependency as `fakeServer` but live outside the component — follow-up, not in this plan.
- **No predicate changes:** `matchesFilterValue` is untouched. If a number/percent/boolean test fails in Task 6, it is a latent predicate bug — stop and debug, do not paper over it in the plan.
```
