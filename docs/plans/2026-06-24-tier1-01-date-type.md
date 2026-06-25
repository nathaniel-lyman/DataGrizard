# Feature 1: Date Data Type — Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Test-first per repo convention. Run `npx tsc -b` and `npm test` green before the final commit.

**Goal:** Add a first-class `date` column type to DataGrid — locale-aware formatting, chronological sorting across mixed value representations, and formatted-text global search — without breaking the typed per-key column-callback contract.

**Architecture:** Date columns keep `accessorKey` (so `formatValue`/`getCellClassName`/`conditionalFormats` still receive the raw `TData[K]`). A `toDate` normalizer accepts `Date | ISO string | epoch ms`; `formatDate` renders via `Intl.DateTimeFormat`. A `dateSortingFn` compares normalized timestamps (blanks to the end under ascending sort). No new dependency.

**Tech Stack:** TypeScript, React 19, TanStack Table v8 (8.21.3), Vitest + jsdom, `Intl.DateTimeFormat`.

**Source spec:** `docs/tier1-feature-parity-spec.md` (rev. 4), Feature 1.

---

## File Structure

- `src/utils/formatters.ts` — add `toDate`, `formatDate`; extend `FormatOptions` with `dateFormat`.
- `src/utils/formatters.test.ts` — unit tests for `toDate` / `formatDate`.
- `src/types/grid.ts` — `GridDataType += "date"`; add `dateFormat?` to `GridColumnConfigForKey`.
- `src/components/DataGrid/DataGrid.tsx` — import the helpers; mirror `dateFormat` on `AnyColumnConfig`; add `dateFormat` to the `formatOptions` memo and `DataGridProps`; add the `date` branch to `renderCellValue` and `getColumnSearchText`; add `dateSortingFn`; build date `ColumnDef`s with the date `sortingFn`.
- `src/data/mockRetailData.ts` — add a `lastRestockedAt` date field + column config to the demo.
- `src/App.tsx` — (no change required if the column is added to the shared config; verify it renders).
- `src/components/DataGrid/DataGrid.config.test.tsx` — behavioral tests for date rendering / sort / search.

---

## Task 1: `toDate` + `formatDate` formatters

**Files:**
- Modify: `src/utils/formatters.ts`
- Test: `src/utils/formatters.test.ts`

- [ ] **Step 1: Write failing tests** in `src/utils/formatters.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatDate, toDate } from "./formatters";

describe("toDate", () => {
  it("parses Date, ISO string, and epoch ms", () => {
    expect(toDate(new Date(2026, 5, 24))?.getFullYear()).toBe(2026);
    expect(toDate("2026-06-24")?.getMonth()).toBe(5); // June
    expect(toDate(1750723200000)?.getTime()).toBe(1750723200000);
  });

  it("returns null for blank/unparseable input", () => {
    expect(toDate("")).toBeNull();
    expect(toDate(null)).toBeNull();
    expect(toDate(undefined)).toBeNull();
    expect(toDate("not-a-date")).toBeNull();
  });

  it("parses a date-only ISO string as local midnight (no day shift)", () => {
    // "2026-06-24" must read as June 24 locally, not shift to the 23rd in
    // negative-offset zones (which `new Date('2026-06-24')` would do via UTC).
    const d = toDate("2026-06-24")!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(24);
    expect(d.getHours()).toBe(0);
  });
});

describe("formatDate", () => {
  it("formats with the default medium style", () => {
    expect(formatDate("2026-06-24", { locale: "en-US" })).toBe("Jun 24, 2026");
  });

  it("honors a per-call dateFormat", () => {
    expect(
      formatDate("2026-06-24", { locale: "en-US", dateFormat: { year: "numeric", month: "2-digit", day: "2-digit" } }),
    ).toBe("06/24/2026");
  });

  it("returns empty string for unparseable input", () => {
    expect(formatDate("nope", { locale: "en-US" })).toBe("");
    expect(formatDate(null, { locale: "en-US" })).toBe("");
  });
});
```

- [ ] **Step 2: Run, verify fail** — `npx vitest run src/utils/formatters.test.ts` → FAIL (`toDate`/`formatDate` undefined).

- [ ] **Step 3: Implement** in `src/utils/formatters.ts`. Extend `FormatOptions` and add the two helpers:

```ts
export type FormatOptions = {
  locale?: string;
  currency?: string;
  dateFormat?: Intl.DateTimeFormatOptions;
};

const DEFAULT_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
};

// Accept Date | ISO-8601 string | epoch ms. Date-only ISO ("2026-06-24") is
// parsed as LOCAL midnight (not new Date("2026-06-24"), which is UTC and shifts
// a day in negative-offset zones). Returns null for blank/unparseable input.
export const toDate = (value: unknown): Date | null => {
  if (value == null || value === "") {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number") {
    const fromEpoch = new Date(value);
    return Number.isNaN(fromEpoch.getTime()) ? null : fromEpoch;
  }
  if (typeof value === "string") {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (dateOnly) {
      const [, y, m, d] = dateOnly;
      return new Date(Number(y), Number(m) - 1, Number(d));
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

export const formatDate = (value: unknown, options: FormatOptions = {}) => {
  const date = toDate(value);
  if (!date) {
    return "";
  }
  return new Intl.DateTimeFormat(
    options.locale ?? DEFAULT_LOCALE,
    options.dateFormat ?? DEFAULT_DATE_FORMAT,
  ).format(date);
};
```

- [ ] **Step 4: Run, verify pass** — `npx vitest run src/utils/formatters.test.ts` → PASS. (If the default-style assertion fails on the CI ICU build, adjust the expected string to the runner's `Intl` output and keep the structural assertions.)

- [ ] **Step 5: Commit** — `git add src/utils/formatters.ts src/utils/formatters.test.ts && git commit -m "feat(grid): add toDate + formatDate helpers"`

---

## Task 2: Add `date` to the public column type

**Files:**
- Modify: `src/types/grid.ts`

- [ ] **Step 1: Edit the type.** Change `GridDataType` and add `dateFormat` to `GridColumnConfigForKey`:

```ts
export type GridDataType = "text" | "number" | "currency" | "percent" | "status" | "date";
```

Inside `GridColumnConfigForKey<TData, K>` (alongside `width`/`minWidth`):

```ts
  /** Date columns: Intl options for this column's display, overriding the grid-level dateFormat. */
  dateFormat?: Intl.DateTimeFormatOptions;
```

- [ ] **Step 2: Verify types** — `npx tsc -b` → PASS (no behavioral change yet; `date` is now an allowed `dataType`). Commit with Task 3 (type change alone has no runtime test).

---

## Task 3: Wire `date` into the engine

**Files:**
- Modify: `src/components/DataGrid/DataGrid.tsx`

- [ ] **Step 1: Import helpers.** Add `formatDate`, `toDate` to the existing `../../utils/formatters` import.

- [ ] **Step 2: Mirror `dateFormat` on `AnyColumnConfig`** (the value-erased internal shape, ~line 34):

```ts
  dateFormat?: Intl.DateTimeFormatOptions;
```

- [ ] **Step 3: Add `dateFormat` to `DataGridProps`** (~line 195, near `locale`/`currency`):

```ts
  dateFormat?: Intl.DateTimeFormatOptions;
```

Destructure it in the component signature with the other display props.

- [ ] **Step 4: Thread it into `formatOptions`** (~line 795):

```ts
  const formatOptions = useMemo<FormatOptions>(
    () => ({ locale, currency, dateFormat }),
    [locale, currency, dateFormat],
  );
```

- [ ] **Step 5: Add the `date` branch to `renderCellValue`** (after the `status` branch, before the final `String(value)` fallback). Per-column `dateFormat` overrides the grid default:

```ts
  if (column.dataType === "date") {
    return formatDate(value, {
      ...formatOptions,
      dateFormat: column.dateFormat ?? formatOptions.dateFormat,
    });
  }
```

- [ ] **Step 6: Add the `date` branch to `getColumnSearchText`** (before the final `String(value)` fallback):

```ts
  if (column.dataType === "date") {
    return formatDate(value, {
      ...formatOptions,
      dateFormat: column.dateFormat ?? formatOptions.dateFormat,
    });
  }
```

- [ ] **Step 7: Add `dateSortingFn`** near `gridColumnFilterFn` (~line 365). Import `SortingFn` from `@tanstack/react-table` (add to the existing type import). Blanks sort to the end under ascending:

```ts
const dateSortingFn: SortingFn<unknown> = (rowA, rowB, columnId) => {
  const a = toDate(rowA.getValue(columnId))?.getTime() ?? null;
  const b = toDate(rowB.getValue(columnId))?.getTime() ?? null;
  if (a === null && b === null) return 0;
  if (a === null) return 1; // blank a after b
  if (b === null) return -1; // blank b after a
  return a - b;
};
```

- [ ] **Step 8: Attach the date `sortingFn` in `columnDefs`** (~line 879). Keep `accessorKey`; add `sortingFn` only for date columns so the typed callbacks still receive raw values:

```ts
      ...columnList.map<ColumnDef<TData>>((column) => ({
        accessorKey: column.accessorKey,
        header: column.header,
        size: column.width,
        minSize: column.minWidth ?? 88,
        maxSize: column.maxWidth ?? 420,
        enableSorting: features.sorting,
        enableHiding: features.columnVisibility,
        enableResizing: features.columnResizing,
        enablePinning: features.columnPinning && (column.enablePinning ?? true),
        enableGrouping: features.grouping && Boolean(column.enableGrouping),
        enableGlobalFilter: true,
        filterFn: gridColumnFilterFn as FilterFn<TData>,
        ...(column.dataType === "date" ? { sortingFn: dateSortingFn as SortingFn<TData> } : {}),
        getGroupingValue: column.getGroupingValue,
        cell: ({ getValue, row }) => renderCellValue(column, getValue(), row.original, formatOptions),
      })),
```

- [ ] **Step 9: Type-check** — `npx tsc -b` → PASS.

---

## Task 4: Date behavior tests

**Files:**
- Test: `src/components/DataGrid/DataGrid.config.test.tsx`

- [ ] **Step 1: Add tests** that mount a small grid with a `date` column and assert rendering, sorting, and search. Use the existing test helpers/patterns in that file (mirror an existing `render`/`columns` setup). Cover:
  - A `date` cell renders the `Intl`-formatted string (e.g. `Jun 24, 2026`) for an ISO value, and renders empty for a blank value.
  - Sorting the date column ascending orders rows chronologically across **mixed representations** (one ISO string, one epoch ms, one `Date`), with the blank-date row **last**.
  - Global search by a formatted token (e.g. `"Jun 24"`) matches the row whose date formats to it.

- [ ] **Step 2: Run** — `npx vitest run src/components/DataGrid/DataGrid.config.test.tsx` → PASS.

---

## Task 5: Exercise the date type in the demo

**Files:**
- Modify: `src/data/mockRetailData.ts`
- Verify: `src/App.tsx`

- [ ] **Step 1:** Add a `lastRestockedAt` field to `RetailItem` and the deterministic generator (an ISO string derived from the existing `seededRandom`), plus a column config `{ accessorKey: "lastRestockedAt", header: "Last Restocked", dataType: "date" }`. Keep the component domain-neutral — only the demo/data layer references the field.

- [ ] **Step 2:** Run the demo type-check/build path — `npx tsc -b` → PASS. (Optional: `npm run dev` and eyeball the column.)

---

## Final Verification

- [ ] `npx tsc -b` → clean.
- [ ] `npm test` → all green (new date tests + existing suite, including pivot/filters unaffected).
- [ ] **Commit** — `git add -A && git commit -m "feat(grid): add date data type (format, sort, search)"`

## Done When

- `date` is a usable `dataType`: formats via `Intl`, sorts chronologically across `Date`/ISO/epoch with blanks ending ascending, and global search matches formatted text.
- Typed per-key callbacks still receive raw `TData[K]` for date columns (no accessor normalization).
- Full suite green; demo shows a date column.
