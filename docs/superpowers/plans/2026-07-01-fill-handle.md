# Fill Handle Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the spreadsheet-standard fill handle (drag-to-extend + `Ctrl+D`/`Ctrl+R`) for `DataGrid` grid-mode cell editing, per `docs/superpowers/specs/2026-07-01-fill-handle-design.md`.

**Architecture:** All work is inside `src/components/DataGrid/DataGrid.tsx`, gated behind a new `features.fillHandle` flag that is inert unless `cellSelection` is also on (`fillHandleEnabled = features.fillHandle && cellSelectionEnabled`). Drag state reuses the existing rectangular-selection machinery (`cellSelection`, `normalizeCellRange`, the document-level `mouseup` listener, the per-cell `onMouseEnter`) rather than introducing a parallel selection system. A single `commitFill(source, target)` function — colocated with `pasteTextIntoCell` since it is the closest existing analog (rectangular range, `rowById`/`columnsById` lookups, `isCellEditable` + `computeEditError` gating, batched `onCellEdit` calls) — is the one code path used by both the mouse-drag commit and the `Ctrl+D`/`Ctrl+R` keyboard commit. Tiling (both "replicate one cell" and "repeat an N×M block") is a single modulo-indexing formula. New tests live in a **dedicated** `DataGrid.fillHandle.test.tsx` from the start (not folded into `DataGrid.editing.test.tsx` first) — the design doc's own 6–8-case split threshold is exceeded by this plan's ~14 cases, so starting split avoids a pointless migration step.

**Tech Stack:** React 19 + TypeScript, TanStack Table v8, Vitest + Testing Library (jsdom — `fireEvent.mouseDown`/`mouseEnter`/`mouseUp`/`keyDown` simulate the same drag/keyboard sequences the existing range-selection and paste tests already use).

**Design deviations from the spec doc (and why):**
- `src/index.css`/`src/styles.css` are **not** touched. The spec assumed `data-cell-selected` has a CSS-file rule to mirror for `data-fill-preview`; it does not — cell-selection styling is 100% inline Tailwind classes computed in JS (`DataGrid.tsx:2949`, `:2932-2933`). `data-fill-handle`/`data-fill-preview` attributes are still added (useful as test/consumer hooks), but their *visual* styling is inline Tailwind, matching the real precedent instead of an invented one.
- `fillSourceRef`/the drag-commit `target` use raw `DataGridCellRange` (anchor/focus), not the anonymous object `normalizeCellRange` returns — the spec's pseudocode conflated the two; `commitFill` normalizes both `source` and `target` internally, matching how `pasteTextIntoCell` already normalizes `cellSelection` once at its own top.
- The drag-path `target` passed to `commitFill` is the **whole** fill-preview rectangle (source ∪ new cells), not just the new cells — `commitFill` skips any target cell whose key is already in the source's own key set. This makes diagonal drags degrade safely (no L-shaped-region math needed) and keeps `commitFill`'s single rectangular-`target` contract identical for both the drag and keyboard paths.
- `Ctrl+D`/`Ctrl+R` always intercept (`return`) when a nav cell has focus and the modifier+key match, mirroring the existing `Ctrl+C`/`Ctrl+V` branches exactly (`DataGrid.tsx:2482-2495`) — `event.preventDefault()` fires whenever `fillHandleEnabled` is true, regardless of whether the current selection shape actually supports a fill. Otherwise a single-cell selection would let the browser's native Ctrl+D (bookmark) / Ctrl+R (reload) fire through, which is worse UX than always claiming the shortcut once the feature is on.

**Verification commands used throughout:**
- Single test file: `npx vitest run src/components/DataGrid/DataGrid.fillHandle.test.tsx 2>&1 | tail -40`
- Type-check only: `npx tsc -b`
- Full gate: `npx tsc -b && npm test`
- Line numbers below are current as of branch `feat/fill-handle` off commit `159f72f`; re-locate with the quoted code, not the number, if drift occurs.

---

## Chunk 1: Feature flag + handle rendering

### Task 1: `features.fillHandle` flag, `fillHandleEnabled`, and the `[data-fill-handle]` corner element

**Files:**
- Modify: `src/components/DataGrid/DataGrid.tsx` (`DataGridFeatures` type at `:152`, `defaultFeatures` at `:384`, `cellSelectionEnabled`/refs at `:2261-2264`, new `fillHandleTargetCell` memo after `:2305`, the `<td>` render at `:2839-2951`/`:2987`)
- Test: `src/components/DataGrid/DataGrid.fillHandle.test.tsx` (new file)

- [ ] **Step 1: Write the failing tests (new file)**

Create `src/components/DataGrid/DataGrid.fillHandle.test.tsx`:

```tsx
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataGrid } from "./DataGrid";
import type { GridColumnConfig } from "../../types/grid";

type FillRow = { id: string; name: string; qty: number; price: number; locked?: boolean };

const makeFillData = (): FillRow[] => [
  { id: "1", name: "Alpha", qty: 5, price: 100 },
  { id: "2", name: "Bravo", qty: 9, price: 200, locked: true },
  { id: "3", name: "Charlie", qty: 3, price: 300 },
  { id: "4", name: "Delta", qty: 7, price: 400 },
];

const fillColumns: GridColumnConfig<FillRow>[] = [
  { accessorKey: "name", header: "Name", dataType: "text", editable: (row) => !row.locked },
  {
    accessorKey: "qty",
    header: "Qty",
    dataType: "number",
    editable: true,
    validate: (value) => (Number(value) < 0 ? "Must be positive" : null),
  },
  { accessorKey: "price", header: "Price", dataType: "currency", editable: true },
];

const cellOf = (text: string) => screen.getByText(text).closest("td") as HTMLElement;

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("DataGrid fill handle rendering", () => {
  it("renders the fill handle at the focused cell by default", () => {
    render(
      <DataGrid
        data={makeFillData()}
        columns={fillColumns}
        getRowId={(r) => r.id}
        features={{ rowSelection: false }}
      />,
    );
    expect(cellOf("Alpha").querySelector("[data-fill-handle]")).not.toBeNull();
  });

  it("does not render the fill handle when features.fillHandle is false", () => {
    render(
      <DataGrid
        data={makeFillData()}
        columns={fillColumns}
        getRowId={(r) => r.id}
        features={{ rowSelection: false, fillHandle: false }}
      />,
    );
    expect(cellOf("Alpha").querySelector("[data-fill-handle]")).toBeNull();
  });

  it("does not render the fill handle when features.cellSelection is false", () => {
    render(
      <DataGrid
        data={makeFillData()}
        columns={fillColumns}
        getRowId={(r) => r.id}
        features={{ rowSelection: false, cellSelection: false }}
      />,
    );
    expect(cellOf("Alpha").querySelector("[data-fill-handle]")).toBeNull();
  });

  it("moves the fill handle to the bottom-right corner of an active range selection", () => {
    render(
      <DataGrid
        data={makeFillData()}
        columns={fillColumns}
        getRowId={(r) => r.id}
        features={{ rowSelection: false }}
      />,
    );
    const start = cellOf("Alpha");
    fireEvent.mouseDown(start, { button: 0, buttons: 1 });
    fireEvent.mouseEnter(cellOf("9"), { buttons: 1 }); // Bravo's qty cell -> rows 1-2, columns name-qty
    fireEvent.mouseUp(document);

    expect(start.querySelector("[data-fill-handle]")).toBeNull();
    expect(cellOf("9").querySelector("[data-fill-handle]")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/DataGrid/DataGrid.fillHandle.test.tsx 2>&1 | tail -40`
Expected: all 4 tests FAIL. TypeScript will also flag `fillHandle` as an unknown `features` key (part of the failure signal) until Step 3 lands.

- [ ] **Step 3: Add the `fillHandle` feature flag**

In `src/components/DataGrid/DataGrid.tsx`, inside `export type DataGridFeatures = {` (`:127`), after the `cellSelection: boolean;` member (`:152`, just before `export: boolean;` at `:154`):

```ts
  /**
   * Drag a handle from the corner of the current cell selection (or the
   * focused cell) to replicate its value(s) into adjacent cells, plus the
   * Ctrl+D (fill down) / Ctrl+R (fill right) keyboard equivalents. Inert
   * unless `cellSelection` is also on.
   */
  fillHandle: boolean;
```

In `defaultFeatures` (`:365`), after `cellSelection: true,` (`:384`):

```ts
  fillHandle: true,
```

- [ ] **Step 4: Add `fillHandleEnabled`, drag refs, and the `fillHandleTargetCell` memo**

In `DataGrid.tsx`, the block at `:2261-2264` currently reads:

```ts
  const cellSelectionEnabled = features.cellSelection && !isPivotLayout;
  const [cellSelection, setCellSelection] = useState<DataGridCellRange | null>(null);
  const isSelectingCellsRef = useRef(false);
  const suppressNextCellClickRef = useRef(false);
```

Replace with:

```ts
  const cellSelectionEnabled = features.cellSelection && !isPivotLayout;
  const fillHandleEnabled = features.fillHandle && cellSelectionEnabled;
  const [cellSelection, setCellSelection] = useState<DataGridCellRange | null>(null);
  const isSelectingCellsRef = useRef(false);
  const suppressNextCellClickRef = useRef(false);
  const isFillDraggingRef = useRef(false);
  const fillSourceRef = useRef<DataGridCellRange | null>(null);
```

Then, right after the `selectedCellKeys` memo closes (`:2305`, the line `}, [cellSelection, navColumnIds, navRowIds]);`) and before the `useEffect` that registers the document `mouseup` listener (`:2307`), insert a new memo:

```ts
  const fillHandleTargetCell = useMemo(() => {
    if (!fillHandleEnabled) {
      return null;
    }
    const normalized = normalizeCellRange(cellSelection);
    if (normalized) {
      return {
        rowId: normalized.rowIds[normalized.rowIds.length - 1],
        columnId: normalized.columnIds[normalized.columnIds.length - 1],
      };
    }
    return activeTabCell;
    // normalizeCellRange is intentionally local and depends on these arrays.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fillHandleEnabled, cellSelection, navColumnIds, navRowIds, activeTabCell]);
```

- [ ] **Step 5: Render the handle at the corner cell and fold it into the `relative` positioning gate**

In the `<td>` render (inside `row.getVisibleCells().map((cell) => { ... })`), the block at `:2839-2840` currently reads:

```ts
          const selectedCellKey = cellKey(row.id, cell.column.id);
          const isCellRangeSelected = selectedCellKeys.has(selectedCellKey);
```

Add a line after it:

```ts
          const selectedCellKey = cellKey(row.id, cell.column.id);
          const isCellRangeSelected = selectedCellKeys.has(selectedCellKey);
          const isFillHandleCell =
            fillHandleTargetCell?.rowId === row.id && fillHandleTargetCell?.columnId === cell.column.id;
```

The `<td>` `className` template at `:2949-2951` currently ends:

```tsx
              } ${isCellRangeSelected ? "shadow-[inset_0_0_0_1px_rgb(37_99_235)]" : ""} ${
                cellSelectionEnabled ? "select-none" : ""
              } ${hasCellOverlay ? "relative overflow-hidden" : ""}`}
```

Replace the last line so a fill-handle corner cell (with no other overlay) still gets `position: relative` — needed so the absolutely-positioned handle anchors to the cell, not some other ancestor — without picking up `overflow-hidden` (which would clip a data-bar/flash overlay but must not clip the handle):

```tsx
              } ${isCellRangeSelected ? "shadow-[inset_0_0_0_1px_rgb(37_99_235)]" : ""} ${
                cellSelectionEnabled ? "select-none" : ""
              } ${
                hasCellOverlay
                  ? "relative overflow-hidden"
                  : fillHandleEnabled && isFillHandleCell
                    ? "relative"
                    : ""
              }`}
```

Finally, inside the `<td>`'s children, right after the existing content block (`:2953-2987`, the `{barGeometry ? ... : flexRender(...)}` chain) and before the closing `</td>` (`:2988`), add the handle element:

```tsx
              {fillHandleEnabled && isFillHandleCell ? (
                <span
                  data-fill-handle
                  className="absolute bottom-0 right-0 z-[2] h-1.5 w-1.5 cursor-crosshair bg-blue-600"
                  onMouseDown={(event) => {
                    event.stopPropagation();
                    if (event.button !== 0) {
                      return;
                    }
                    fillSourceRef.current =
                      cellSelection ?? (activeTabCell ? { anchor: activeTabCell, focus: activeTabCell } : null);
                    isFillDraggingRef.current = true;
                  }}
                />
              ) : null}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/components/DataGrid/DataGrid.fillHandle.test.tsx 2>&1 | tail -40`
Expected: all 4 tests PASS.

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/DataGrid/DataGrid.tsx src/components/DataGrid/DataGrid.fillHandle.test.tsx
git commit -m "feat(datagrid): fillHandle feature flag renders a corner drag handle"
```

---

## Chunk 2: Drag-to-fill commit mechanism

### Task 2: `commitFill`, `clampToDownRight`, drag-preview wiring, and the document-mouseup commit

**Files:**
- Modify: `src/components/DataGrid/DataGrid.tsx` (new state near `:2264`; `clampToDownRight` after `normalizeCellRange` at `:2290`; `fillPreviewCellKeys` memo after the Chunk 1 `fillHandleTargetCell` memo; the `mouseup` effect at `:2307-2313`; the per-cell `onMouseEnter` at `:2894-2903`; `commitFill` + ref-sync after `pasteFromClipboard` at `:2446`; the `<td>` `data-cell-selected`/`aria-selected` attributes at `:2924-2925` and the `className` template touched in Chunk 1)
- Test: `src/components/DataGrid/DataGrid.fillHandle.test.tsx` (extend)

- [ ] **Step 1: Write the failing tests**

Append to `src/components/DataGrid/DataGrid.fillHandle.test.tsx`:

```tsx
describe("DataGrid fill handle drag-to-extend", () => {
  it("drags the fill handle down 3 rows and replicates the source value", () => {
    const onCellEdit = vi.fn();
    render(
      <DataGrid
        data={makeFillData()}
        columns={fillColumns}
        getRowId={(r) => r.id}
        onCellEdit={onCellEdit}
        features={{ rowSelection: false }}
      />,
    );
    const source = cellOf("$100"); // row1 price
    fireEvent.mouseDown(source, { button: 0, buttons: 1 });
    fireEvent.mouseUp(document);

    const handle = source.querySelector("[data-fill-handle]") as HTMLElement;
    fireEvent.mouseDown(handle, { button: 0, buttons: 1 });
    fireEvent.mouseEnter(cellOf("$400"), { buttons: 1 }); // row4 price
    fireEvent.mouseUp(document);

    expect(onCellEdit).toHaveBeenCalledTimes(3);
    expect(onCellEdit).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ rowId: "2", columnId: "price", value: 100, previousValue: 200 }),
    );
    expect(onCellEdit).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ rowId: "3", columnId: "price", value: 100, previousValue: 300 }),
    );
    expect(onCellEdit).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ rowId: "4", columnId: "price", value: 100, previousValue: 400 }),
    );
    expect(source).toHaveAttribute("data-cell-selected", "true");
    expect(cellOf("$400")).toHaveAttribute("data-cell-selected", "true");
  });

  it("tiles a 2-row source's pattern when dragged down to 4 rows", () => {
    const onCellEdit = vi.fn();
    render(
      <DataGrid
        data={makeFillData()}
        columns={fillColumns}
        getRowId={(r) => r.id}
        onCellEdit={onCellEdit}
        features={{ rowSelection: false }}
      />,
    );
    const start = cellOf("5"); // row1 qty
    fireEvent.mouseDown(start, { button: 0, buttons: 1 });
    fireEvent.mouseEnter(cellOf("9"), { buttons: 1 }); // row2 qty -> selects rows 1-2
    fireEvent.mouseUp(document);

    const handle = cellOf("9").querySelector("[data-fill-handle]") as HTMLElement;
    fireEvent.mouseDown(handle, { button: 0, buttons: 1 });
    fireEvent.mouseEnter(cellOf("7"), { buttons: 1 }); // row4 qty -> extend to rows 1-4
    fireEvent.mouseUp(document);

    expect(onCellEdit).toHaveBeenCalledTimes(2);
    expect(onCellEdit).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ rowId: "3", columnId: "qty", value: 5, previousValue: 3 }),
    );
    expect(onCellEdit).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ rowId: "4", columnId: "qty", value: 9, previousValue: 7 }),
    );
  });

  it("drags the fill handle right across 2 columns and replicates the source value", () => {
    const onCellEdit = vi.fn();
    render(
      <DataGrid
        data={makeFillData()}
        columns={fillColumns}
        getRowId={(r) => r.id}
        onCellEdit={onCellEdit}
        features={{ rowSelection: false }}
      />,
    );
    const source = cellOf("Alpha");
    fireEvent.mouseDown(source, { button: 0, buttons: 1 });
    fireEvent.mouseUp(document);

    const handle = source.querySelector("[data-fill-handle]") as HTMLElement;
    fireEvent.mouseDown(handle, { button: 0, buttons: 1 });
    fireEvent.mouseEnter(cellOf("$100"), { buttons: 1 }); // row1 price -> extend name..price
    fireEvent.mouseUp(document);

    expect(onCellEdit).toHaveBeenCalledTimes(2);
    expect(onCellEdit).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ rowId: "1", columnId: "qty", value: "Alpha" }),
    );
    expect(onCellEdit).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ rowId: "1", columnId: "price", value: "Alpha" }),
    );
  });

  it("skips a non-editable target cell while sibling cells in the same fill still commit", () => {
    const onCellEdit = vi.fn();
    render(
      <DataGrid
        data={makeFillData()}
        columns={fillColumns}
        getRowId={(r) => r.id}
        onCellEdit={onCellEdit}
        features={{ rowSelection: false }}
      />,
    );
    const source = cellOf("Alpha"); // row1 name
    fireEvent.mouseDown(source, { button: 0, buttons: 1 });
    fireEvent.mouseUp(document);

    const handle = source.querySelector("[data-fill-handle]") as HTMLElement;
    fireEvent.mouseDown(handle, { button: 0, buttons: 1 });
    fireEvent.mouseEnter(cellOf("Delta"), { buttons: 1 }); // row4 name -> rows 1-4 (row2 is locked)
    fireEvent.mouseUp(document);

    expect(onCellEdit).toHaveBeenCalledTimes(2);
    expect(onCellEdit).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ rowId: "3", columnId: "name", value: "Alpha" }),
    );
    expect(onCellEdit).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ rowId: "4", columnId: "name", value: "Alpha" }),
    );
  });

  it("skips a target cell that fails computeEditError", () => {
    const onCellEdit = vi.fn();
    const data: FillRow[] = [
      { id: "1", name: "Alpha", qty: -1, price: 100 },
      { id: "2", name: "Bravo", qty: 9, price: 200 },
    ];
    render(
      <DataGrid
        data={data}
        columns={fillColumns}
        getRowId={(r) => r.id}
        onCellEdit={onCellEdit}
        features={{ rowSelection: false }}
      />,
    );
    const source = cellOf("Alpha").closest("tr")!.querySelectorAll("td")[1] as HTMLElement; // row1 qty (-1)
    fireEvent.mouseDown(source, { button: 0, buttons: 1 });
    fireEvent.mouseUp(document);

    const handle = source.querySelector("[data-fill-handle]") as HTMLElement;
    fireEvent.mouseDown(handle, { button: 0, buttons: 1 });
    const target = cellOf("Bravo").closest("tr")!.querySelectorAll("td")[1] as HTMLElement; // row2 qty
    fireEvent.mouseEnter(target, { buttons: 1 });
    fireEvent.mouseUp(document);

    expect(onCellEdit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/DataGrid/DataGrid.fillHandle.test.tsx 2>&1 | tail -60`
Expected: the 5 new tests FAIL (dragging the handle does nothing yet — `onCellEdit` is never called, so `toHaveBeenCalledTimes(3)`/`(2)` fail, and the `data-cell-selected` assertions fail since `cellSelection` never updates from a drag).

- [ ] **Step 3: Add `fillPreview` state and the ref that carries the latest `commitFill` to the stable `mouseup` listener**

The block touched in Chunk 1 Step 4 now reads (after that chunk landed):

```ts
  const isFillDraggingRef = useRef(false);
  const fillSourceRef = useRef<DataGridCellRange | null>(null);
```

Add two more lines after `fillSourceRef`:

```ts
  const isFillDraggingRef = useRef(false);
  const fillSourceRef = useRef<DataGridCellRange | null>(null);
  const [fillPreview, setFillPreview] = useState<DataGridCellRange | null>(null);
  const fillPreviewRef = useRef<DataGridCellRange | null>(null);
  useEffect(() => {
    fillPreviewRef.current = fillPreview;
  }, [fillPreview]);
  const commitFillRef = useRef<(source: DataGridCellRange, target: DataGridCellRange) => void>(() => {});
```

`commitFillRef` is declared here (before `commitFill` itself exists, near `pasteTextIntoCell`, per Step 6) specifically so the `mouseup` effect below — which has an empty dependency array and therefore only runs its setup once — always calls the *current* `commitFill` closure instead of a stale one from the first render. This mirrors the existing `renderDataSourceErrorRef`/`onDataSourceErrorRef` pattern at `DataGrid.tsx:552-558`.

`fillPreviewRef` mirrors `fillPreview` state the same way, for the same reason: the `mouseup` listener (Step 5) needs to read the *current* preview rectangle at commit time, but it's registered once via an empty-dependency effect.

- [ ] **Step 4: Add `clampToDownRight` and the `fillPreviewCellKeys` memo**

Right after `normalizeCellRange`'s closing brace (`:2290`, the line `};` that ends the function started at `:2266`), insert:

```ts
  const clampToDownRight = (
    source: DataGridCellRange,
    hovered: Exclude<DataGridFocusedCell, null>,
  ): DataGridCellRange | null => {
    const normalizedSource = normalizeCellRange(source);
    if (!normalizedSource) {
      return null;
    }
    const hoveredRowIdx = navRowIds.indexOf(hovered.rowId);
    const hoveredColIdx = navColumnIds.indexOf(hovered.columnId);
    if (hoveredRowIdx < 0 || hoveredColIdx < 0) {
      return null;
    }
    const sourceEndRowIdx = normalizedSource.startRowIdx + normalizedSource.rowIds.length - 1;
    const sourceEndColIdx = normalizedSource.startColIdx + normalizedSource.columnIds.length - 1;
    const clampedRowIdx = Math.max(hoveredRowIdx, sourceEndRowIdx);
    const clampedColIdx = Math.max(hoveredColIdx, sourceEndColIdx);
    return {
      anchor: {
        rowId: navRowIds[normalizedSource.startRowIdx],
        columnId: navColumnIds[normalizedSource.startColIdx],
      },
      focus: { rowId: navRowIds[clampedRowIdx], columnId: navColumnIds[clampedColIdx] },
    };
  };
```

`clampToDownRight` always anchors the preview at `source`'s own top-left corner and clamps the hovered corner to never be above/left of `source`'s own bottom-right corner (`Math.max`, independently per axis) — so hovering above or left of the source collapses the preview back to the source itself (down/right-only invariant), and the returned rectangle always fully contains `source`.

Then, right after the Chunk 1 `fillHandleTargetCell` memo, add:

```ts
  const fillPreviewCellKeys = useMemo(() => {
    if (!fillPreview) {
      return new Set<string>();
    }
    const normalizedPreview = normalizeCellRange(fillPreview);
    if (!normalizedPreview) {
      return new Set<string>();
    }
    const normalizedSource = normalizeCellRange(fillSourceRef.current);
    const sourceKeys = new Set<string>();
    normalizedSource?.rowIds.forEach((rowId) => {
      normalizedSource.columnIds.forEach((columnId) => {
        sourceKeys.add(cellKey(rowId, columnId));
      });
    });
    const keys = new Set<string>();
    normalizedPreview.rowIds.forEach((rowId) => {
      normalizedPreview.columnIds.forEach((columnId) => {
        const key = cellKey(rowId, columnId);
        if (!sourceKeys.has(key)) {
          keys.add(key);
        }
      });
    });
    return keys;
    // normalizeCellRange is intentionally local and depends on these arrays.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fillPreview, navColumnIds, navRowIds]);
```

`fillSourceRef.current` is read directly (not as a dependency) because it is set once at drag start and held constant for the duration of the drag — it only changes when `fillPreview` itself changes (on each `mouseenter`) or is cleared (on `mouseup`), so re-deriving this memo on `fillPreview` changes always reads the correct, current source.

- [ ] **Step 5: Extend the document `mouseup` listener to commit the fill and extend `onMouseEnter` to update the preview**

The effect at `:2307-2313` currently reads:

```ts
  useEffect(() => {
    const stopSelecting = () => {
      isSelectingCellsRef.current = false;
    };
    document.addEventListener("mouseup", stopSelecting);
    return () => document.removeEventListener("mouseup", stopSelecting);
  }, []);
```

Replace with:

```ts
  useEffect(() => {
    const stopSelecting = () => {
      isSelectingCellsRef.current = false;
      if (!isFillDraggingRef.current) {
        return;
      }
      isFillDraggingRef.current = false;
      const source = fillSourceRef.current;
      const preview = fillPreviewRef.current;
      fillSourceRef.current = null;
      if (source && preview) {
        commitFillRef.current(source, preview);
        setCellSelection(preview);
      }
      setFillPreview(null);
    };
    document.addEventListener("mouseup", stopSelecting);
    return () => document.removeEventListener("mouseup", stopSelecting);
  }, []);
```

`stopSelecting` is a plain DOM event listener, not a render/updater/effect function, so — unlike a `setState` updater — it is never double-invoked by React Strict Mode (this project's demo wraps the tree in `<StrictMode>`, `src/main.tsx:7`). That's why the commit and `setCellSelection` calls are plain statements here reading `fillPreviewRef.current`/`fillSourceRef.current`, rather than living inside a `setFillPreview` updater: state updater functions must be pure per React's contract, and stuffing `commitFillRef.current(...)` (which fires `onCellEdit`, the grid's one public write callback) inside one would make it fire twice in dev whenever Strict Mode double-invokes the updater. Since `clampToDownRight` always returns a rectangle that fully contains `source` (Step 4), `preview` at commit time already represents the union of source + filled cells, so `setCellSelection(preview)` alone is the correct post-fill selection.

The per-cell `onMouseEnter` at `:2894-2903` currently reads:

```tsx
              onMouseEnter={
                isNavCell && cellSelectionEnabled
                  ? (event) => {
                      if (!isSelectingCellsRef.current || event.buttons !== 1) {
                        return;
                      }
                      extendCellSelection({ rowId: row.id, columnId: cell.column.id });
                    }
                  : undefined
              }
```

Replace with:

```tsx
              onMouseEnter={
                isNavCell && cellSelectionEnabled
                  ? (event) => {
                      if (isFillDraggingRef.current && event.buttons === 1) {
                        const source = fillSourceRef.current;
                        if (source) {
                          setFillPreview(clampToDownRight(source, { rowId: row.id, columnId: cell.column.id }));
                        }
                        return;
                      }
                      if (!isSelectingCellsRef.current || event.buttons !== 1) {
                        return;
                      }
                      extendCellSelection({ rowId: row.id, columnId: cell.column.id });
                    }
                  : undefined
              }
```

- [ ] **Step 6: Add `commitFill` and sync `commitFillRef` to it**

Right after `pasteFromClipboard`'s closing brace (`:2446`), insert:

```ts
  const commitFill = (source: DataGridCellRange, target: DataGridCellRange) => {
    if (!features.editing || !onCellEdit) {
      return;
    }
    const normalizedSource = normalizeCellRange(source);
    const normalizedTarget = normalizeCellRange(target);
    if (!normalizedSource || !normalizedTarget) {
      return;
    }
    const sourceRowIds = normalizedSource.rowIds;
    const sourceColumnIds = normalizedSource.columnIds;
    const sourceKeys = new Set<string>();
    sourceRowIds.forEach((rowId) => {
      sourceColumnIds.forEach((columnId) => {
        sourceKeys.add(cellKey(rowId, columnId));
      });
    });
    const edits: DataGridCellEdit<TData>[] = [];
    normalizedTarget.rowIds.forEach((targetRowId, rowIdx) => {
      const targetRow = rowById.get(targetRowId);
      if (!targetRow) {
        return;
      }
      normalizedTarget.columnIds.forEach((targetColumnId, colIdx) => {
        if (sourceKeys.has(cellKey(targetRowId, targetColumnId))) {
          return; // part of the source range itself, not a fill target
        }
        const columnConfig = columnsById.get(targetColumnId);
        if (!columnConfig || !isCellEditable(targetRow, targetColumnId)) {
          return;
        }
        const sourceRowId = sourceRowIds[rowIdx % sourceRowIds.length];
        const sourceColumnId = sourceColumnIds[colIdx % sourceColumnIds.length];
        const sourceRow = rowById.get(sourceRowId);
        if (!sourceRow) {
          return;
        }
        const sourceOriginal = sourceRow.original as TData;
        const value = (sourceOriginal as Record<string, unknown>)[sourceColumnId];
        const targetOriginal = targetRow.original as TData;
        if (computeEditError(columnConfig as unknown as EditCellColumn<TData>, value, targetOriginal)) {
          return; // skip, consistent with pasteTextIntoCell's semantics
        }
        edits.push({
          rowId: targetRow.id,
          row: targetOriginal,
          columnId: targetColumnId,
          value,
          previousValue: (targetOriginal as Record<string, unknown>)[targetColumnId],
        });
      });
    });
    edits.forEach((edit) => onCellEdit(edit));
  };
  useEffect(() => {
    commitFillRef.current = commitFill;
  }, [commitFill]);
```

Note the deliberate asymmetry with `pasteTextIntoCell`: the source is already-typed data read straight from `sourceRow.original`, not clipboard text, so there is no `parseEditValue` step — only `computeEditError` gates each target. Do not "fix" this into a redundant parse.

`rowIdx`/`colIdx` in the `forEach` callbacks are the target-local indices (0-based within `normalizedTarget.rowIds`/`columnIds`), which is what the modulo tiling needs — since the drag path's `target` always starts exactly at `source`'s own top-left corner (by construction of `clampToDownRight`), and the keyboard path's `source` is always exactly one row or one column wide (so the modulo is trivially 0 regardless of target offset), this indexing is correct for every case this feature supports.

- [ ] **Step 7: Wire `data-fill-preview` onto the `<td>`**

The attributes at `:2924-2925` currently read:

```tsx
              aria-selected={isCellRangeSelected ? true : undefined}
              data-cell-selected={isCellRangeSelected ? "true" : undefined}
```

Chunk 1 Step 5 added, right after `:2840`:

```ts
          const isFillHandleCell =
            fillHandleTargetCell?.rowId === row.id && fillHandleTargetCell?.columnId === cell.column.id;
```

Add a new line directly after it:

```ts
          const isFillPreviewCell = fillPreviewCellKeys.has(selectedCellKey);
```

And add the attribute:

```tsx
              aria-selected={isCellRangeSelected ? true : undefined}
              data-cell-selected={isCellRangeSelected ? "true" : undefined}
              data-fill-preview={isFillPreviewCell ? "true" : undefined}
```

Finally, extend the `className` template (touched in Chunk 1 Step 5) to render a dashed outline for preview cells. It currently ends:

```tsx
              } ${
                hasCellOverlay
                  ? "relative overflow-hidden"
                  : fillHandleEnabled && isFillHandleCell
                    ? "relative"
                    : ""
              }`}
```

Replace with:

```tsx
              } ${
                hasCellOverlay
                  ? "relative overflow-hidden"
                  : fillHandleEnabled && isFillHandleCell
                    ? "relative"
                    : ""
              } ${
                isFillPreviewCell ? "outline outline-2 outline-dashed outline-blue-500 outline-offset-[-2px]" : ""
              }`}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run src/components/DataGrid/DataGrid.fillHandle.test.tsx 2>&1 | tail -60`
Expected: all 9 tests in the file PASS (4 from Chunk 1 + 5 new).

Run: `npx tsc -b`
Expected: no errors. If `commitFillRef` in the `mouseup` effect (Step 5) somehow raises a "used before declaration" diagnostic, move Step 3's `commitFillRef` declaration is already safe as written (it is declared as a plain `useRef` with a no-op initial value, not `useRef(commitFill)`) — this should not occur, but if it does, double-check no other edit accidentally changed `commitFillRef`'s initializer back to `useRef(commitFill)`.

- [ ] **Step 9: Commit**

```bash
git add src/components/DataGrid/DataGrid.tsx src/components/DataGrid/DataGrid.fillHandle.test.tsx
git commit -m "feat(datagrid): drag the fill handle to replicate/tile cell values"
```

---

## Chunk 3: Keyboard fill (`Ctrl+D` / `Ctrl+R`) + no-op edge cases

### Task 3: `onCellKeyDown` branches and edge-case coverage

**Files:**
- Modify: `src/components/DataGrid/DataGrid.tsx` (`onCellKeyDown` at `:2464-2536`)
- Test: `src/components/DataGrid/DataGrid.fillHandle.test.tsx` (extend)

- [ ] **Step 1: Write the failing tests**

Append to `src/components/DataGrid/DataGrid.fillHandle.test.tsx`:

```tsx
describe("DataGrid fill handle keyboard (Ctrl+D / Ctrl+R)", () => {
  it("Ctrl+D fills the top row into the remaining rows of a selection", () => {
    const onCellEdit = vi.fn();
    render(
      <DataGrid
        data={makeFillData()}
        columns={fillColumns}
        getRowId={(r) => r.id}
        onCellEdit={onCellEdit}
        features={{ rowSelection: false }}
      />,
    );
    const start = cellOf("5"); // row1 qty
    fireEvent.mouseDown(start, { button: 0, buttons: 1 });
    fireEvent.mouseEnter(cellOf("3"), { buttons: 1 }); // row3 qty -> selects rows 1-3
    fireEvent.mouseUp(document);
    fireEvent.keyDown(start, { key: "d", ctrlKey: true });

    expect(onCellEdit).toHaveBeenCalledTimes(2);
    expect(onCellEdit).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ rowId: "2", columnId: "qty", value: 5, previousValue: 9 }),
    );
    expect(onCellEdit).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ rowId: "3", columnId: "qty", value: 5, previousValue: 3 }),
    );
  });

  it("Ctrl+R fills the left column into the remaining columns of a selection", () => {
    const onCellEdit = vi.fn();
    render(
      <DataGrid
        data={makeFillData()}
        columns={fillColumns}
        getRowId={(r) => r.id}
        onCellEdit={onCellEdit}
        features={{ rowSelection: false }}
      />,
    );
    const start = cellOf("Alpha");
    fireEvent.mouseDown(start, { button: 0, buttons: 1 });
    fireEvent.mouseEnter(cellOf("$100"), { buttons: 1 }); // row1 price -> selects name..price
    fireEvent.mouseUp(document);
    fireEvent.keyDown(start, { key: "r", ctrlKey: true });

    expect(onCellEdit).toHaveBeenCalledTimes(2);
    expect(onCellEdit).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ rowId: "1", columnId: "qty", value: "Alpha" }),
    );
    expect(onCellEdit).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ rowId: "1", columnId: "price", value: "Alpha" }),
    );
  });
});

describe("DataGrid fill handle no-op conditions", () => {
  it("does not fill on Ctrl+D when features.fillHandle is false", () => {
    const onCellEdit = vi.fn();
    render(
      <DataGrid
        data={makeFillData()}
        columns={fillColumns}
        getRowId={(r) => r.id}
        onCellEdit={onCellEdit}
        features={{ rowSelection: false, fillHandle: false }}
      />,
    );
    const start = cellOf("5");
    fireEvent.mouseDown(start, { button: 0, buttons: 1 });
    fireEvent.mouseEnter(cellOf("3"), { buttons: 1 });
    fireEvent.mouseUp(document);
    fireEvent.keyDown(start, { key: "d", ctrlKey: true });

    expect(onCellEdit).not.toHaveBeenCalled();
  });

  it("does not commit a drag-fill when features.editing is false", () => {
    const onCellEdit = vi.fn();
    render(
      <DataGrid
        data={makeFillData()}
        columns={fillColumns}
        getRowId={(r) => r.id}
        onCellEdit={onCellEdit}
        features={{ rowSelection: false, editing: false }}
      />,
    );
    const source = cellOf("Alpha");
    fireEvent.mouseDown(source, { button: 0, buttons: 1 });
    fireEvent.mouseUp(document);

    const handle = source.querySelector("[data-fill-handle]") as HTMLElement;
    expect(handle).not.toBeNull();
    fireEvent.mouseDown(handle, { button: 0, buttons: 1 });
    fireEvent.mouseEnter(cellOf("Delta"), { buttons: 1 });
    fireEvent.mouseUp(document);

    expect(onCellEdit).not.toHaveBeenCalled();
  });

  it("does not fill on Ctrl+D when the selection is a single row", () => {
    const onCellEdit = vi.fn();
    render(
      <DataGrid
        data={makeFillData()}
        columns={fillColumns}
        getRowId={(r) => r.id}
        onCellEdit={onCellEdit}
        features={{ rowSelection: false }}
      />,
    );
    const cell = cellOf("5");
    fireEvent.mouseDown(cell, { button: 0, buttons: 1 });
    fireEvent.mouseUp(document);
    fireEvent.keyDown(cell, { key: "d", ctrlKey: true });

    expect(onCellEdit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/DataGrid/DataGrid.fillHandle.test.tsx 2>&1 | tail -80`
Expected: the 2 keyboard tests FAIL (`onCellEdit` never called — `d`/`r` aren't handled yet). The 3 no-op tests may already PASS (nothing calls `commitFill` for them yet either way) — that's fine; they exist as regression coverage for the behavior this step is about to land, not because they're expected to flip from red to green. Confirm the 2 keyboard tests are the ones actually failing before proceeding.

- [ ] **Step 3: Add the `Ctrl+D`/`Ctrl+R` branches to `onCellKeyDown`**

In `onCellKeyDown` (`:2464-2536`), the existing Ctrl+V branch ends at `:2495`:

```ts
    if (ctrl && (event.key === "v" || event.key === "V")) {
      if (features.clipboard && features.editing) {
        pasteFromClipboard(row, columnId);
        event.preventDefault();
      }
      return;
    }
    const navigationTarget = navigateTargetForKey(event.key, rowIdx, colIdx, ctrl);
```

Insert two new branches between them, immediately after the Ctrl+V branch's closing `}` and before `const navigationTarget = ...`:

```ts
    if (ctrl && (event.key === "d" || event.key === "D")) {
      if (fillHandleEnabled) {
        const normalized = normalizeCellRange(cellSelection);
        if (normalized && normalized.rowIds.length > 1) {
          const firstRowId = normalized.rowIds[0];
          const lastColumnId = normalized.columnIds[normalized.columnIds.length - 1];
          commitFill(
            {
              anchor: { rowId: firstRowId, columnId: normalized.columnIds[0] },
              focus: { rowId: firstRowId, columnId: lastColumnId },
            },
            {
              anchor: { rowId: normalized.rowIds[1], columnId: normalized.columnIds[0] },
              focus: { rowId: normalized.rowIds[normalized.rowIds.length - 1], columnId: lastColumnId },
            },
          );
        }
        event.preventDefault();
      }
      return;
    }
    if (ctrl && (event.key === "r" || event.key === "R")) {
      if (fillHandleEnabled) {
        const normalized = normalizeCellRange(cellSelection);
        if (normalized && normalized.columnIds.length > 1) {
          const firstColumnId = normalized.columnIds[0];
          const lastRowId = normalized.rowIds[normalized.rowIds.length - 1];
          commitFill(
            {
              anchor: { rowId: normalized.rowIds[0], columnId: firstColumnId },
              focus: { rowId: lastRowId, columnId: firstColumnId },
            },
            {
              anchor: { rowId: normalized.rowIds[0], columnId: normalized.columnIds[1] },
              focus: { rowId: lastRowId, columnId: normalized.columnIds[normalized.columnIds.length - 1] },
            },
          );
        }
        event.preventDefault();
      }
      return;
    }
```

This mirrors the Ctrl+C/Ctrl+V branches' precedence exactly: always `return` (never falls through to arrow-key navigation or the row-action/edit switch below), but only calls `commitFill` + `preventDefault()` when the feature is actually on. `commitFill` is called directly here (not via `commitFillRef`) because `onCellKeyDown` itself is a fresh closure every render, so there's no staleness concern — the ref indirection in Chunk 2 exists only for the `mouseup` listener's empty-dependency-array effect.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/DataGrid/DataGrid.fillHandle.test.tsx 2>&1 | tail -80`
Expected: all 14 tests in the file PASS.

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/DataGrid/DataGrid.tsx src/components/DataGrid/DataGrid.fillHandle.test.tsx
git commit -m "feat(datagrid): Ctrl+D/Ctrl+R keyboard fill over a selection"
```

---

## Chunk 4: Docs

### Task 4: `CLAUDE.md` + `CHANGELOG.md`

**Files:**
- Modify: `CLAUDE.md` (the "Keyboard cell navigation & editing" bullet)
- Modify: `CHANGELOG.md` (`## [Unreleased]` → `### Added`)

- [ ] **Step 1: Extend the CLAUDE.md bullet**

In `CLAUDE.md`, find the "**Keyboard cell navigation & editing.**" bullet (it ends with the sentence about `aria-rowcount`/`aria-colcount`/`aria-rowindex`/`aria-colindex`). Append a new sentence at the end of that bullet's paragraph:

```
 When `features.fillHandle` is on (inert unless `cellSelection` is also on), a small handle at the bottom-right corner of the selection/focused cell drags down/right to replicate its value(s) into the cells passed over, and `Ctrl+D`/`Ctrl+R` provide the keyboard equivalent over an existing multi-row/multi-column selection (top row / left column tiled into the rest via modulo indexing). Both paths commit through `commitFill`, the same validated-edit contract as paste — `computeEditError` gates each target (no `parseValue` step, since the source is already-typed data, not clipboard text) — silently skipping non-editable/invalid targets, and leave the union of source + filled cells selected.
```

- [ ] **Step 2: Add the CHANGELOG entry**

In `CHANGELOG.md`, under `## [Unreleased]` → `### Added` (`:10-21`), add a new bullet (alphabetical/logical placement doesn't matter here — append to the list):

```
- **Fill handle:** drag the handle at the corner of a cell selection down or
  right to replicate/tile its value(s) into adjacent cells, or use `Ctrl+D`
  (fill down) / `Ctrl+R` (fill right) as the keyboard equivalent over an
  existing multi-row/multi-column selection (`features.fillHandle`).
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md CHANGELOG.md
git commit -m "docs: fill handle feature notes in CLAUDE.md and CHANGELOG"
```
