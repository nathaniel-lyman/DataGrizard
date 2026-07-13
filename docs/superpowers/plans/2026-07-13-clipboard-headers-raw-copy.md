# Clipboard Copy-with-Headers + Raw-Value Copy Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add copy-with-headers (Ctrl/Cmd-Shift-C + `clipboardIncludeHeaders` prop) and raw-value copy (`clipboardValueMode="raw"`) to the DataGrid clipboard path.

**Architecture:** All behavior lives in the existing clipboard copy path: `copyFromCell` in `src/components/DataGrid/useCellRangeInteractions.ts` gains an `{ includeHeaders }` option and a value-mode switch between the existing formatted `getCellText` and a new `getCellRawText`. Two new flat props on `DataGridProps` thread from `DataGrid.tsx` into the hook. Nothing else changes — export CSV, paste, and fill are untouched.

**Tech Stack:** React 19 + TypeScript, TanStack Table v8, Vitest + Testing Library (jsdom). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-13-clipboard-headers-raw-copy-design.md`

**Conventions that govern this work (CLAUDE.md):**
- `src/components/DataGrid/` stays domain-neutral — no retail names anywhere.
- New public types are exported from `src/components/DataGrid/index.ts`.
- Behavioral work is test-first. Tests live beside the engine; copy tests go in `DataGrid.export.test.tsx`.
- Type-check is `npx tsc -b` (there is no lint script).

---

## Chunk 1: All tasks

### File structure

- Modify: `src/components/DataGrid/dataGridTypes.ts` — `DataGridClipboardValueMode` type + 2 props on `DataGridProps` (near `locale`, ~line 253).
- Modify: `src/components/DataGrid/index.ts` — export the new type (type export block, ~line 92).
- Modify: `src/components/DataGrid/useCellRangeInteractions.ts` — 2 new args, `getCellRawText`, `getHeaderLabel`, reworked `copyFromCell`, Shift handling in the copy keydown branch (~line 509).
- Modify: `src/components/DataGrid/DataGrid.tsx` — destructure the 2 props (~line 319, near `locale`) and pass them to the hook call (~line 1761).
- Test: `src/components/DataGrid/DataGrid.export.test.tsx` — new cases in the existing "DataGrid clipboard copy" describe block plus a new raw-mode describe block.
- Modify: `CLAUDE.md` — one-sentence extension of the "Export & clipboard" bullet (done last).

### Task 1: Copy with headers (Ctrl/Cmd-Shift-C)

**Files:**
- Modify: `src/components/DataGrid/useCellRangeInteractions.ts`
- Test: `src/components/DataGrid/DataGrid.export.test.tsx`

- [ ] **Step 1.1: Write the failing tests**

Add to the `describe("DataGrid clipboard copy", ...)` block in `DataGrid.export.test.tsx` (reuse the file's existing `data`/`columns`/`cellOf` fixtures and the `navigator.clipboard` mock pattern):

```tsx
it("prepends a header row on Ctrl/Cmd-Shift-C", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

  render(<DataGrid data={data} columns={columns} getRowId={(r) => r.id} features={{ rowSelection: false }} />);
  const cell = cellOf("Alpha");
  cell.focus();
  fireEvent.keyDown(cell, { key: "C", ctrlKey: true, shiftKey: true });

  expect(writeText).toHaveBeenCalledWith("Name\r\nAlpha");
  // The announcement fires in the writeClipboardText microtask and the status
  // element renders conditionally, so it must be awaited (same pattern as the
  // existing legacy-copy-path test). Header row does not change the count.
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Copied 1 cell."));
});

it("header row follows the selected range's columns, not all visible columns", () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

  render(<DataGrid data={data} columns={columns} getRowId={(r) => r.id} features={{ rowSelection: false }} />);
  const start = cellOf("Alpha");
  fireEvent.mouseDown(start, { button: 0, buttons: 1 });
  fireEvent.mouseEnter(cellOf("$900"), { buttons: 1 });
  fireEvent.mouseUp(document);
  fireEvent.keyDown(start, { key: "C", ctrlKey: true, shiftKey: true });

  expect(writeText).toHaveBeenCalledWith("Name\tRevenue\r\nAlpha\t$1,200\r\nBravo\t$900");
});

it("selected-rows copy with headers uses the visible non-synthetic column set", () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

  render(<DataGrid data={data} columns={columns} getRowId={(r) => r.id} />);
  fireEvent.click(screen.getByLabelText("Select 1")); // Alpha

  const cell = cellOf("Bravo");
  cell.focus();
  fireEvent.keyDown(cell, { key: "C", metaKey: true, shiftKey: true });

  const tsv = writeText.mock.calls[0][0] as string;
  expect(tsv.split("\r\n")[0]).toBe("Name\tRevenue"); // no select-column header
  expect(tsv).toContain("Alpha\t$1,200");
});
```

- [ ] **Step 1.2: Run the tests to verify they fail**

Run: `npx vitest run src/components/DataGrid/DataGrid.export.test.tsx`
Expected: the 3 new tests FAIL — clipboard receives the TSV **without** the header row (Ctrl-Shift-C already copies today; it just ignores Shift). All pre-existing tests still PASS.

- [ ] **Step 1.3: Implement header support in `useCellRangeInteractions.ts`**

(a) Add a header-label resolver directly below `getCellText` (~line 424). `Column` is already imported in this file:

```ts
const getHeaderLabel = (column: Column<TData | PivotRow<TData>, unknown>) => {
  const columnConfig = columnsById.get(column.id);
  if (columnConfig) return columnConfig.header;
  const defHeader = column.columnDef.header;
  return typeof defHeader === "string" ? defHeader : column.id;
};
```

(b) Rework `copyFromCell` (~line 426) to track the matrix's column set and accept an options argument. Replace the whole function with:

```ts
const copyFromCell = (
  row: Row<TData | PivotRow<TData>>,
  columnId: string,
  options?: { includeHeaders?: boolean },
) => {
  const columns = table
    .getVisibleLeafColumns()
    .filter((column) => column.id !== SELECT_COLUMN_ID && column.id !== ROW_ACTIONS_COLUMN_ID);
  const selected = isPivotLayout
    ? []
    : table.getSelectedRowModel().flatRows.filter((selectedRow) => !selectedRow.getIsGrouped());
  const focusedColumn = table.getColumn(columnId);
  const normalized = normalizeCellRange(cellSelection);
  let matrix: string[][] = [];
  let headerLabels: string[] = [];
  if (normalized && normalized.area > 1) {
    headerLabels = normalized.columnIds.map((selectedColumnId) => {
      const selectedColumn = table.getColumn(selectedColumnId);
      return selectedColumn ? getHeaderLabel(selectedColumn) : "";
    });
    matrix = normalized.rowIds.map((rowId) => {
      const selectedRow = rowById.get(rowId);
      return normalized.columnIds.map((selectedColumnId) => {
        const selectedColumn = table.getColumn(selectedColumnId);
        return selectedRow && selectedColumn ? getCellText(selectedRow, selectedColumn) : "";
      });
    });
  } else if (selected.length) {
    headerLabels = columns.map(getHeaderLabel);
    matrix = selected.map((selectedRow) => columns.map((column) => getCellText(selectedRow, column)));
  } else if (focusedColumn) {
    headerLabels = [getHeaderLabel(focusedColumn)];
    matrix = [[getCellText(row, focusedColumn)]];
  }
  if (!matrix.length) return;
  const cellCount = matrix.reduce((count, matrixRow) => count + matrixRow.length, 0);
  const clipboardRows = options?.includeHeaders ? [headerLabels, ...matrix] : matrix;
  void writeClipboardText(toTsv(clipboardRows)).then((copied) => {
    announceClipboard(
      copied
        ? `Copied ${cellCount} ${cellCount === 1 ? "cell" : "cells"}.`
        : "Copy failed. Allow clipboard access and try again.",
      copied ? "success" : "error",
    );
  });
};
```

Note the announcement still uses `cellCount` from the data matrix only — headers are excluded by construction.

(c) In the copy keydown branch (~line 509), pass Shift through. Change `copyFromCell(row, columnId);` to:

```ts
copyFromCell(row, columnId, { includeHeaders: event.shiftKey });
```

Leave everything else in the branch (the `features.clipboard` gate, `preventDefault`) exactly as it is.

- [ ] **Step 1.4: Run the tests to verify they pass**

Run: `npx vitest run src/components/DataGrid/DataGrid.export.test.tsx`
Expected: ALL tests PASS (the 4 pre-existing clipboard tests prove plain Ctrl/Cmd-C output is byte-identical to before).

- [ ] **Step 1.5: Commit**

```bash
git add src/components/DataGrid/useCellRangeInteractions.ts src/components/DataGrid/DataGrid.export.test.tsx
git commit -m "feat(datagrid): copy with headers on Ctrl/Cmd-Shift-C"
```

### Task 2: `clipboardIncludeHeaders` prop

**Files:**
- Modify: `src/components/DataGrid/dataGridTypes.ts`
- Modify: `src/components/DataGrid/DataGrid.tsx`
- Modify: `src/components/DataGrid/useCellRangeInteractions.ts`
- Test: `src/components/DataGrid/DataGrid.export.test.tsx`

- [ ] **Step 2.1: Write the failing test**

```tsx
it("clipboardIncludeHeaders makes plain Ctrl/Cmd-C include the header row", () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

  render(
    <DataGrid
      data={data}
      columns={columns}
      getRowId={(r) => r.id}
      features={{ rowSelection: false }}
      clipboardIncludeHeaders
    />,
  );
  const cell = cellOf("Alpha");
  cell.focus();
  fireEvent.keyDown(cell, { key: "c", ctrlKey: true });

  expect(writeText).toHaveBeenCalledWith("Name\r\nAlpha");
});
```

- [ ] **Step 2.2: Run the test to verify it fails**

Run: `npx vitest run src/components/DataGrid/DataGrid.export.test.tsx`
Expected: FAIL — TypeScript/React ignores the unknown prop at runtime in jsdom, so clipboard receives `"Alpha"` without the header. (`npx tsc -b` would also fail on the unknown prop at this point; that is the same signal.)

- [ ] **Step 2.3: Implement the prop**

(a) `dataGridTypes.ts` — next to `locale?: string;` (~line 253) add:

```ts
/** When true, plain Ctrl/Cmd-C prepends a header row. Ctrl/Cmd-Shift-C always includes headers. */
clipboardIncludeHeaders?: boolean;
```

(b) `DataGrid.tsx` — destructure near `locale` (~line 319):

```ts
clipboardIncludeHeaders = false,
```

and pass it in the `useCellRangeInteractions({ ... })` call (~line 1761, after `locale,`):

```ts
clipboardIncludeHeaders,
```

(c) `useCellRangeInteractions.ts` — add to `CellRangeInteractionsArgs` (after `locale?: string;`):

```ts
clipboardIncludeHeaders?: boolean;
```

destructure it in the function signature (after `locale,`) as `clipboardIncludeHeaders = false,` and change the keydown call:

```ts
copyFromCell(row, columnId, { includeHeaders: clipboardIncludeHeaders || event.shiftKey });
```

- [ ] **Step 2.4: Run tests + type-check to verify they pass**

Run: `npx vitest run src/components/DataGrid/DataGrid.export.test.tsx && npx tsc -b`
Expected: ALL PASS, clean type-check.

- [ ] **Step 2.5: Commit**

```bash
git add src/components/DataGrid/dataGridTypes.ts src/components/DataGrid/DataGrid.tsx src/components/DataGrid/useCellRangeInteractions.ts src/components/DataGrid/DataGrid.export.test.tsx
git commit -m "feat(datagrid): clipboardIncludeHeaders prop"
```

### Task 3: `clipboardValueMode="raw"`

**Files:**
- Modify: `src/components/DataGrid/dataGridTypes.ts`
- Modify: `src/components/DataGrid/index.ts`
- Modify: `src/components/DataGrid/DataGrid.tsx`
- Modify: `src/components/DataGrid/useCellRangeInteractions.ts`
- Test: `src/components/DataGrid/DataGrid.export.test.tsx`

- [ ] **Step 3.1: Write the failing tests**

Add a new describe block at the bottom of `DataGrid.export.test.tsx`. It needs its own domain-neutral fixtures (percent stored as a fraction; date as a UTC-pinned `Date` so the ISO assertion is timezone-safe):

```tsx
describe("DataGrid raw clipboard mode", () => {
  type RawRow = { id: string; label: string; margin: number; price: number; when: Date; state: string };
  const rawData: RawRow[] = [
    {
      id: "1",
      label: "First",
      margin: 0.23,
      price: 1234.5,
      when: new Date(Date.UTC(2026, 0, 15)),
      state: "in_stock",
    },
  ];
  const rawColumns: GridColumnConfig<RawRow>[] = [
    { accessorKey: "label", header: "Label", dataType: "text" },
    { accessorKey: "margin", header: "Margin", dataType: "percent" },
    { accessorKey: "price", header: "Price", dataType: "currency", formatValue: () => "OVERRIDDEN" },
    { accessorKey: "when", header: "When", dataType: "date" },
    { accessorKey: "state", header: "State", dataType: "status" },
  ];

  const renderRaw = () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(
      <DataGrid
        data={rawData}
        columns={rawColumns}
        getRowId={(r) => r.id}
        features={{ rowSelection: false }}
        clipboardValueMode="raw"
      />,
    );
    return writeText;
  };

  it("copies underlying values: fraction percent, plain number, ISO date, raw status; formatValue ignored", () => {
    const writeText = renderRaw();
    const start = cellOf("First");
    fireEvent.mouseDown(start, { button: 0, buttons: 1 });
    fireEvent.mouseEnter(cellOf("In Stock"), { buttons: 1 });
    fireEvent.mouseUp(document);
    fireEvent.keyDown(start, { key: "c", ctrlKey: true });

    expect(writeText).toHaveBeenCalledWith(
      "First\t0.23\t1234.5\t2026-01-15T00:00:00.000Z\tin_stock",
    );
  });

  it("headers stay plain text in raw mode", () => {
    const writeText = renderRaw();
    const cell = cellOf("First");
    cell.focus();
    fireEvent.keyDown(cell, { key: "C", ctrlKey: true, shiftKey: true });

    expect(writeText).toHaveBeenCalledWith("Label\r\nFirst");
  });
});
```

Note: the status cell renders as a formatted pill label — `formatStatusLabel("in_stock")` capitalizes every underscore-separated part, so the rendered text is `In Stock` (that's what `cellOf` must target); the raw copy assertion still expects the underlying `in_stock`.

- [ ] **Step 3.2: Run the tests to verify they fail**

Run: `npx vitest run src/components/DataGrid/DataGrid.export.test.tsx`
Expected: FAIL — clipboard receives formatted text (`23%`, `OVERRIDDEN`, locale date, status label) instead of raw values.

- [ ] **Step 3.3: Implement raw mode**

(a) `dataGridTypes.ts` — add near the top with the other small exported types:

```ts
export type DataGridClipboardValueMode = "formatted" | "raw";
```

and next to `clipboardIncludeHeaders` on `DataGridProps`:

```ts
/** What Ctrl/Cmd-C serializes per cell: formatted display text (default) or underlying raw values. */
clipboardValueMode?: DataGridClipboardValueMode;
```

(b) `index.ts` — add `DataGridClipboardValueMode,` to the type-export block from `./dataGridTypes` (~line 92), keeping the block's alphabetical ordering (it slots before `DataGridDataMode`).

(c) `DataGrid.tsx` — destructure `clipboardValueMode = "formatted",` near `locale` and pass `clipboardValueMode,` to the hook call.

(d) `useCellRangeInteractions.ts`:
- Add `clipboardValueMode?: DataGridClipboardValueMode;` to `CellRangeInteractionsArgs` (import the type from `./dataGridTypes` — extend the existing type-import), destructure as `clipboardValueMode = "formatted",`.
- Add imports: `isNumericDataType` from `./cells`, `toDate` from `../../utils/formatters`. Careful: the existing formatters import is type-only (`import type { FormatOptions } from "../../utils/formatters"`); `toDate` is a **value** import and needs its own `import { toDate } from "../../utils/formatters";` line — do not add it to the `import type`.
- Add below `getCellText`:

```ts
const getCellRawText = (
  row: Row<TData | PivotRow<TData>>,
  column: Column<TData | PivotRow<TData>, unknown>,
) => {
  const value = row.getValue(column.id);
  if (value == null) return "";
  if (isPivotRow(row.original)) return String(value);
  const columnConfig = columnsById.get(column.id);
  if (!columnConfig) return String(value);
  if (isNumericDataType(columnConfig.dataType)) {
    return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
  }
  if (columnConfig.dataType === "date") {
    const date = toDate(value);
    return date ? date.toISOString() : "";
  }
  return String(value);
};
```

- In `copyFromCell`, add as the first line:

```ts
const cellText = clipboardValueMode === "raw" ? getCellRawText : getCellText;
```

and replace the three `getCellText(` call sites inside `copyFromCell` with `cellText(`. `getHeaderLabel` is untouched — headers are plain text in both modes.

- [ ] **Step 3.4: Run tests + type-check to verify they pass**

Run: `npx vitest run src/components/DataGrid/DataGrid.export.test.tsx && npx tsc -b`
Expected: ALL PASS, clean type-check.

- [ ] **Step 3.5: Commit**

```bash
git add src/components/DataGrid/dataGridTypes.ts src/components/DataGrid/index.ts src/components/DataGrid/DataGrid.tsx src/components/DataGrid/useCellRangeInteractions.ts src/components/DataGrid/DataGrid.export.test.tsx
git commit -m "feat(datagrid): clipboardValueMode raw copy"
```

### Task 4: Full-suite verification + docs

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 4.1: Run the full test suite and type-check**

Run: `npm test && npx tsc -b`
Expected: ALL PASS — in particular the pivot, fill-handle, editing, and keyboard suites prove pivot copy, paste, and fill are unchanged.

- [ ] **Step 4.2: Update CLAUDE.md**

In the "**Export & clipboard.**" bullet, after the sentence describing Ctrl/Cmd-C, add:

```
Ctrl/Cmd-Shift-C copies with a header row; `clipboardIncludeHeaders` makes plain copy include headers, and `clipboardValueMode="raw"` copies underlying values (fraction percents, plain numbers, ISO dates, raw status codes; `formatValue` ignored) instead of formatted text.
```

- [ ] **Step 4.3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document clipboard header/raw copy options"
```
