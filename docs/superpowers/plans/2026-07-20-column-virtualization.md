# Column Virtualization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Window unpinned center columns to the horizontal viewport (`virtualizeColumns` prop), pin-aware, in grid and pivot layouts, per `docs/superpowers/specs/2026-07-20-column-virtualization-design.md`.

**Architecture:** A second `useVirtualizer` (`horizontal: true`) shares the existing `scrollRef` with `rowVirtualizer`. Pure windowing math lives in a new sibling `src/components/DataGrid/columnVirtual.ts` (partition / window / row-assembly helpers, all plain-data-in/plain-data-out). `DataGrid.tsx` threads a nullable `ColumnWindow` into the colgroup, body cells, and `DataGridHeader`; `useCellFocus` gains column scroll-into-view.

**Tech Stack:** React 19, TypeScript, TanStack Table v8, `@tanstack/react-virtual` (already a dev dependency, bundled), Vitest + jsdom + Testing Library.

**Read first:** the spec (`docs/superpowers/specs/2026-07-20-column-virtualization-design.md`), `CLAUDE.md` (commands + architecture), and these files end to end: `src/components/DataGrid/columnVirtual.ts`'s future neighbors `gridHelpers.ts` (pure-helper idiom), `DataGridBody.tsx` (row spacer idiom), `DataGridHeader.tsx`, `useCellFocus.ts`, `DataGrid.virtual.test.tsx` (no-mock jsdom test idiom).

**Conventions that bind every task:**
- `src/components/DataGrid/` stays domain-neutral and generic over `TData extends object`. No retail names.
- Type-check is `npx tsc -b`. There is no lint script. Full test run is `npm test` (vitest run, jsdom).
- Commit after every green test, message style `feat(datagrid): …` / `test(datagrid): …` as in recent history.
- **One documented deviation from the spec:** the spec splits header windowing into `clipHeaderGroups` (clip only) + renderer-inserted spacers. We instead ship one pure helper `windowHeaderRow` that clips, filters, **and** emits spacer markers, and a twin `windowLeafCells` for leaf-cell rows. Rationale: the spec reviewer flagged spacer-position ambiguity as the likeliest implementation slip; a pure helper that owns clip+position is testable for exactly that and removes the ambiguity. The renderer still owns turning markers into `<th>`/`<td>`/`<col>` elements.

---

## Chunk 1: Pure windowing helpers (`columnVirtual.ts`)

### Task 1: `partitionLeafColumns` + `computeColumnWindow`

**Files:**
- Create: `src/components/DataGrid/columnVirtual.ts`
- Create: `src/components/DataGrid/columnVirtual.test.ts`

- [ ] **Step 1: Write failing tests for partition + window math**

Create `src/components/DataGrid/columnVirtual.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  partitionLeafColumns,
  computeColumnWindow,
  windowLeafCells,
  windowHeaderRow,
} from "./columnVirtual";

type Col = { id: string; pinned: false | "left" | "right"; size: number };
const col = (id: string, pinned: Col["pinned"] = false, size = 100): Col => ({ id, pinned, size });
const getId = (c: Col) => c.id;
const getPinned = (c: Col) => c.pinned;

describe("partitionLeafColumns", () => {
  it("splits visible leaves into left / center / right preserving order", () => {
    const cols = [col("sel", "left"), col("a"), col("b"), col("act", "right"), col("c")];
    const p = partitionLeafColumns(cols, getPinned);
    expect(p.left.map(getId)).toEqual(["sel"]);
    expect(p.center.map(getId)).toEqual(["a", "b", "c"]);
    expect(p.right.map(getId)).toEqual(["act"]);
  });

  it("handles no pinned columns and all pinned columns", () => {
    expect(partitionLeafColumns([col("a"), col("b")], getPinned).center).toHaveLength(2);
    const allPinned = partitionLeafColumns([col("a", "left"), col("b", "right")], getPinned);
    expect(allPinned.center).toHaveLength(0);
  });
});

describe("computeColumnWindow", () => {
  const center = [col("a"), col("b"), col("c"), col("d"), col("e")];

  it("computes rendered ids and spacer widths from virtual items (mid-scroll)", () => {
    // Window covers b..d: items start where a (100px) ends, end at 400.
    const w = computeColumnWindow({
      virtualItems: [
        { index: 1, start: 100, end: 200 },
        { index: 2, start: 200, end: 300 },
        { index: 3, start: 300, end: 400 },
      ],
      centerColumns: center,
      getId,
      totalCenterWidth: 500,
      pinnedLeafIds: ["sel", "act"],
    });
    expect([...w.renderedLeafIds].sort()).toEqual(["act", "b", "c", "d", "sel"]);
    expect(w.leftSpacerWidth).toBe(100);
    expect(w.rightSpacerWidth).toBe(100);
  });

  it("has zero spacers when the window covers everything", () => {
    const w = computeColumnWindow({
      virtualItems: center.map((_, i) => ({ index: i, start: i * 100, end: (i + 1) * 100 })),
      centerColumns: center,
      getId,
      totalCenterWidth: 500,
      pinnedLeafIds: [],
    });
    expect(w.leftSpacerWidth).toBe(0);
    expect(w.rightSpacerWidth).toBe(0);
    expect(w.renderedLeafIds.size).toBe(5);
  });

  it("renders only pinned columns when there are no center columns", () => {
    const w = computeColumnWindow({
      virtualItems: [],
      centerColumns: [],
      getId,
      totalCenterWidth: 0,
      pinnedLeafIds: ["sel"],
    });
    expect([...w.renderedLeafIds]).toEqual(["sel"]);
    expect(w.leftSpacerWidth).toBe(0);
    expect(w.rightSpacerWidth).toBe(0);
  });
});
```

(The `windowLeafCells` / `windowHeaderRow` imports fail to resolve until Task 2 — that is fine; this file compiles once Task 2 lands. For this task, you may comment those two imports and their describe blocks in, uncommenting in Task 2, or simply write only the two describe blocks above now and append in Task 2. Prefer append-in-Task-2.)

- [ ] **Step 2: Run tests, verify failure**

Run: `npx vitest run src/components/DataGrid/columnVirtual.test.ts`
Expected: FAIL — cannot resolve `./columnVirtual`.

- [ ] **Step 3: Implement `partitionLeafColumns` + `computeColumnWindow`**

Create `src/components/DataGrid/columnVirtual.ts`:

```ts
// Pure column-windowing math for virtualizeColumns. Structural typing (id /
// pinned / size accessors passed in) keeps these testable without TanStack
// objects, mirroring gridHelpers.ts. The engine adapts Column instances.

export type ColumnPartition<TCol> = {
  left: TCol[];
  center: TCol[];
  right: TCol[];
};

export function partitionLeafColumns<TCol>(
  visibleLeafColumns: TCol[],
  getPinned: (column: TCol) => false | "left" | "right",
): ColumnPartition<TCol> {
  const left: TCol[] = [];
  const center: TCol[] = [];
  const right: TCol[] = [];
  for (const column of visibleLeafColumns) {
    const pinned = getPinned(column);
    if (pinned === "left") left.push(column);
    else if (pinned === "right") right.push(column);
    else center.push(column);
  }
  return { left, center, right };
}

export type ColumnWindow = {
  /** Pinned leaves + the windowed center leaves — everything that renders. */
  renderedLeafIds: Set<string>;
  leftSpacerWidth: number;
  rightSpacerWidth: number;
};

type VirtualItemLike = { index: number; start: number; end: number };

export function computeColumnWindow<TCol>(options: {
  virtualItems: VirtualItemLike[];
  centerColumns: TCol[];
  getId: (column: TCol) => string;
  totalCenterWidth: number;
  pinnedLeafIds: string[];
}): ColumnWindow {
  const { virtualItems, centerColumns, getId, totalCenterWidth, pinnedLeafIds } = options;
  const renderedLeafIds = new Set(pinnedLeafIds);
  for (const item of virtualItems) {
    const column = centerColumns[item.index];
    if (column) renderedLeafIds.add(getId(column));
  }
  const leftSpacerWidth = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const rightSpacerWidth =
    virtualItems.length > 0
      ? Math.max(0, totalCenterWidth - virtualItems[virtualItems.length - 1].end)
      : 0;
  return { renderedLeafIds, leftSpacerWidth, rightSpacerWidth };
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/components/DataGrid/columnVirtual.test.ts`
Expected: PASS (partition + window describes).

- [ ] **Step 5: Commit**

```bash
git add src/components/DataGrid/columnVirtual.ts src/components/DataGrid/columnVirtual.test.ts
git commit -m "feat(datagrid): column-window partition and spacer math"
```

### Task 2: `windowLeafCells` + `windowHeaderRow` row-assembly helpers

**Files:**
- Modify: `src/components/DataGrid/columnVirtual.ts`
- Modify: `src/components/DataGrid/columnVirtual.test.ts`

- [ ] **Step 1: Append failing tests**

Append to `columnVirtual.test.ts`:

```ts
describe("windowLeafCells", () => {
  const cols = [col("sel", "left"), col("a"), col("b"), col("c"), col("act", "right")];
  const window = {
    renderedLeafIds: new Set(["sel", "b", "act"]),
    leftSpacerWidth: 100,
    rightSpacerWidth: 100,
  };

  it("emits left pinned, left spacer, windowed center, right spacer, right pinned", () => {
    const out = windowLeafCells({ items: cols, getId, getPinned, window });
    expect(
      out.map((e) => (e.kind === "cell" ? getId(e.item) : `spacer:${e.width}`)),
    ).toEqual(["sel", "spacer:100", "b", "spacer:100", "act"]);
  });

  it("omits zero-width spacers", () => {
    const out = windowLeafCells({
      items: cols,
      getId,
      getPinned,
      window: { renderedLeafIds: new Set(["sel", "a", "b", "c", "act"]), leftSpacerWidth: 0, rightSpacerWidth: 0 },
    });
    expect(out.every((e) => e.kind === "cell")).toBe(true);
    expect(out).toHaveLength(5);
  });
});

describe("windowHeaderRow", () => {
  // Band row over leaves: sel | [a b c] band | act. Window renders sel, b, act.
  // Each header instance lives wholly in one pin region (TanStack splits
  // groups whose leaves are pinned into separate header instances).
  const headers = [
    { id: "h-sel", leafIds: ["sel"], pinned: "left" as const },
    { id: "h-band", leafIds: ["a", "b", "c"], pinned: false as const },
    { id: "h-act", leafIds: ["act"], pinned: "right" as const },
  ];
  type HeaderLike = (typeof headers)[number];
  const getLeafIds = (h: HeaderLike) => h.leafIds;
  const getHeaderPinned = (h: HeaderLike) => h.pinned;
  const window = {
    renderedLeafIds: new Set(["sel", "b", "act"]),
    leftSpacerWidth: 100,
    rightSpacerWidth: 100,
  };

  it("clips band colSpan to rendered leaves and positions spacers by leaf order", () => {
    const out = windowHeaderRow({ headers, getLeafIds, getPinned: getHeaderPinned, window });
    expect(
      out.map((e) =>
        e.kind === "header" ? `${e.item.id}:${e.colSpan}` : `spacer:${e.width}`,
      ),
    ).toEqual(["h-sel:1", "spacer:100", "h-band:1", "spacer:100", "h-act:1"]);
  });

  it("drops bands with zero rendered leaves", () => {
    const out = windowHeaderRow({
      headers,
      getLeafIds,
      getPinned: getHeaderPinned,
      window: { renderedLeafIds: new Set(["sel", "act"]), leftSpacerWidth: 300, rightSpacerWidth: 0 },
    });
    expect(
      out.map((e) => (e.kind === "header" ? e.item.id : `spacer:${e.width}`)),
    ).toEqual(["h-sel", "spacer:300", "h-act"]);
  });

  it("passes every header through untouched when all leaves render", () => {
    const out = windowHeaderRow({
      headers,
      getLeafIds,
      getPinned: getHeaderPinned,
      window: { renderedLeafIds: new Set(["sel", "a", "b", "c", "act"]), leftSpacerWidth: 0, rightSpacerWidth: 0 },
    });
    expect(out.map((e) => (e.kind === "header" ? e.colSpan : -1))).toEqual([1, 3, 1]);
  });
});
```

(If Step 1 of Task 1 chose the append route, also add `windowLeafCells, windowHeaderRow` to the import.)

- [ ] **Step 2: Run tests, verify the new describes fail**

Run: `npx vitest run src/components/DataGrid/columnVirtual.test.ts`
Expected: FAIL — `windowLeafCells` / `windowHeaderRow` not exported.

- [ ] **Step 3: Implement both helpers**

Append to `columnVirtual.ts`:

```ts
export type WindowedEntry<T> =
  | { kind: "cell"; item: T }
  | { kind: "spacer"; side: "left" | "right"; width: number };

/** Assemble a leaf-cell row (colgroup, body row, floating-filter row):
 *  left pinned → left spacer → windowed center → right spacer → right pinned.
 *  Zero-width spacers are omitted. Items must already be in visual order. */
export function windowLeafCells<T>(options: {
  items: T[];
  getId: (item: T) => string;
  getPinned: (item: T) => false | "left" | "right";
  window: ColumnWindow;
}): WindowedEntry<T>[] {
  const { items, getId, getPinned, window } = options;
  const partition = partitionLeafColumns(items, getPinned);
  const out: WindowedEntry<T>[] = partition.left.map((item) => ({ kind: "cell" as const, item }));
  if (window.leftSpacerWidth > 0) {
    out.push({ kind: "spacer", side: "left", width: window.leftSpacerWidth });
  }
  for (const item of partition.center) {
    if (window.renderedLeafIds.has(getId(item))) out.push({ kind: "cell", item });
  }
  if (window.rightSpacerWidth > 0) {
    out.push({ kind: "spacer", side: "right", width: window.rightSpacerWidth });
  }
  for (const item of partition.right) out.push({ kind: "cell", item });
  return out;
}

export type WindowedHeaderEntry<T> =
  | { kind: "header"; item: T; colSpan: number }
  | { kind: "spacer"; side: "left" | "right"; width: number };

/** Assemble one header row. Each TanStack header instance lives wholly in one
 *  pin region (groups whose leaves are pinned are split into separate header
 *  instances per region), so the row is built exactly like windowLeafCells —
 *  partition headers by region, then: left → left spacer → clipped center →
 *  right spacer → right. Headers clip their colSpan to rendered leaves and
 *  drop out at zero, so every header row consumes the same column slots as
 *  the leaf rows under table-layout: fixed. */
export function windowHeaderRow<T>(options: {
  headers: T[];
  getLeafIds: (header: T) => string[];
  getPinned: (header: T) => false | "left" | "right";
  window: ColumnWindow;
}): WindowedHeaderEntry<T>[] {
  const { headers, getLeafIds, getPinned, window } = options;
  const partition = partitionLeafColumns(headers, getPinned);
  const out: WindowedHeaderEntry<T>[] = [];
  const pushClipped = (header: T) => {
    const colSpan = getLeafIds(header).filter((id) => window.renderedLeafIds.has(id)).length;
    if (colSpan > 0) {
      out.push({ kind: "header", item: header, colSpan });
    }
  };
  partition.left.forEach(pushClipped);
  if (window.leftSpacerWidth > 0) {
    out.push({ kind: "spacer", side: "left", width: window.leftSpacerWidth });
  }
  partition.center.forEach(pushClipped);
  if (window.rightSpacerWidth > 0) {
    out.push({ kind: "spacer", side: "right", width: window.rightSpacerWidth });
  }
  partition.right.forEach(pushClipped);
  return out;
}
```

**Why this is correct by construction:** it is the same partition + emit-order
as `windowLeafCells`, generalized with colSpan clipping — for a leaf-level row
(every header exactly one leaf) it degenerates to the identical sequence. The
one structural assumption — a header instance never spans two pin regions —
is TanStack's own pinned-header model (pinned leaves are pulled into separate
header instances with placeholders). Hand-trace the three Step 1 tests to
confirm before running.

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/components/DataGrid/columnVirtual.test.ts`
Expected: PASS, all describes.

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc -b`
Expected: clean.

```bash
git add src/components/DataGrid/columnVirtual.ts src/components/DataGrid/columnVirtual.test.ts
git commit -m "feat(datagrid): windowed row-assembly helpers for column virtualization"
```

---

## Chunk 2: Engine wiring — prop, virtualizer, colgroup, body

### Task 3: `virtualizeColumns` prop + column virtualizer instance

**Files:**
- Modify: `src/components/DataGrid/dataGridTypes.ts` (beside `virtualizeRows`, ~line 267)
- Modify: `src/components/DataGrid/DataGrid.tsx` (prop destructure ~line 329; virtualizer block ~line 1590)

- [ ] **Step 1: Add the prop type**

In `dataGridTypes.ts`, directly under the `virtualizeRows` / `estimatedRowHeight` pair:

```ts
  /** Window unpinned center columns to the horizontal viewport (opt-in).
   *  Pinned columns always render. Ignored in card layout. */
  virtualizeColumns?: boolean;
```

- [ ] **Step 2: Wire the virtualizer in `DataGrid.tsx`**

Destructure `virtualizeColumns = false` beside `virtualizeRows` (~line 329).

Immediately after the `rowVirtualizer` block (~line 1597), add:

```ts
  // Column windowing (spec: docs/superpowers/specs/2026-07-20-column-virtualization-design.md).
  // Pinned columns always render; only the unpinned center is windowed. Widths
  // come from columnSizing via getSize(), so estimates are exact — no
  // measureElement pass. Card layout has no table; pivot works unchanged
  // because windowing runs on the post-reconciliation visible leaf set.
  const columnPartition = partitionLeafColumns(
    table.getVisibleLeafColumns(),
    (column) => column.getIsPinned(),
  );
  const virtualizeColumnsEnabled = virtualizeColumns && !isCardMode;
  const columnVirtualizer = useVirtualizer({
    horizontal: true,
    count: columnPartition.center.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => columnPartition.center[index]?.getSize() ?? 0,
    overscan: 4,
    enabled: virtualizeColumnsEnabled,
  });
  // Re-measure when widths / order / visibility change so drag-resize,
  // autosize, and column chooser keep offsets true.
  useEffect(() => {
    if (virtualizeColumnsEnabled) {
      columnVirtualizer.measure();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [virtualizeColumnsEnabled, currentColumnSizing, currentColumnOrder, currentColumnVisibility, columnVirtualizer]);
  const totalCenterWidth = columnPartition.center.reduce(
    (sum, column) => sum + column.getSize(),
    0,
  );
  const columnWindow: ColumnWindow | null = virtualizeColumnsEnabled
    ? computeColumnWindow({
        virtualItems: columnVirtualizer.getVirtualItems(),
        centerColumns: columnPartition.center,
        getId: (column) => column.id,
        totalCenterWidth,
        pinnedLeafIds: [...columnPartition.left, ...columnPartition.right].map((c) => c.id),
      })
    : null;
```

Imports: add `partitionLeafColumns, computeColumnWindow, windowLeafCells, type ColumnWindow` from `./columnVirtual`. (`noUnusedLocals` is confirmed OFF in `tsconfig.app.json`, so adding all four here — with `windowLeafCells` first used in Task 4 — compiles cleanly.)

The repo has no ESLint — drop the `eslint-disable` comment line from the snippet entirely.

- [ ] **Step 3: Type-check + full-suite sanity**

Run: `npx tsc -b && npm test`
Expected: clean compile; all existing tests pass (prop unused so far ⇒ zero behavior change).

- [ ] **Step 4: Commit**

```bash
git add src/components/DataGrid/dataGridTypes.ts src/components/DataGrid/DataGrid.tsx
git commit -m "feat(datagrid): virtualizeColumns prop and horizontal virtualizer wiring"
```

### Task 4: Window the colgroup and body cells (TDD)

**Files:**
- Create: `src/components/DataGrid/DataGrid.columnVirtual.test.tsx`
- Modify: `src/components/DataGrid/DataGrid.tsx` (colgroup ~line 2513; `renderVisibleRow` cell loop ~line 2058)

- [ ] **Step 1: Write failing integration tests**

Create `src/components/DataGrid/DataGrid.columnVirtual.test.tsx`. **Execution finding (supersedes the spec's jsdom bullet):** jsdom has no layout, so `@tanstack/virtual-core` measures 0 everywhere and the window is genuinely *empty*, not "a small overscan default" (the row-virtual test is silently masked by only asserting upper bounds/absence). Stub `HTMLElement.prototype.offsetWidth` to 800 in `beforeAll`/`afterAll` so the horizontal virtualizer computes a real window. Also: the two header-`<th>` assertions below cannot pass until Task 5 windows `DataGridHeader` — the header-count test is `it.skip` until Task 5 (which un-skips it), and the pinned test asserts **body cells** instead:

```tsx
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DataGrid } from "./DataGrid";
import type { GridColumnConfig } from "../../types/grid";

type WideRow = Record<string, string | number> & { id: string };

const COL_COUNT = 40;
const wideColumns: GridColumnConfig<WideRow>[] = Array.from({ length: COL_COUNT }, (_, i) => ({
  accessorKey: `c${i}`,
  header: `Col ${i}`,
  dataType: "number" as const,
}));

const makeWideRows = (n: number): WideRow[] =>
  Array.from({ length: n }, (_, r) => {
    const row: WideRow = { id: String(r) };
    for (let c = 0; c < COL_COUNT; c++) row[`c${c}`] = r * COL_COUNT + c;
    return row;
  });

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("DataGrid column virtualization", () => {
  it("renders far fewer header cells than columns when virtualizeColumns is on", () => {
    render(
      <DataGrid
        data={makeWideRows(5)}
        columns={wideColumns}
        getRowId={(r) => r.id}
        virtualizeColumns
        features={{ pagination: false, rowSelection: false }}
      />,
    );
    const headers = screen.getAllByRole("columnheader");
    expect(headers.length).toBeLessThan(COL_COUNT);
    expect(screen.queryByText("Col 39")).not.toBeInTheDocument();
  });

  it("windows body cells to match and keeps colgroup spacer widths true", () => {
    render(
      <DataGrid
        data={makeWideRows(3)}
        columns={wideColumns}
        getRowId={(r) => r.id}
        virtualizeColumns
        features={{ pagination: false, rowSelection: false }}
      />,
    );
    const firstBodyRow = document.querySelector("tbody tr");
    const cells = firstBodyRow ? firstBodyRow.querySelectorAll("td") : [];
    expect(cells.length).toBeLessThan(COL_COUNT);
    // colgroup: rendered cols + spacer cols; total col width must equal the
    // full table width (sum of every leaf column's size = 40 * default size).
    const cols = document.querySelectorAll("colgroup col");
    expect(cols.length).toBeLessThan(COL_COUNT);
    const widthOf = (el: Element) =>
      Number.parseFloat((el as HTMLElement).style.width || "0");
    const totalColWidth = [...cols].reduce((sum, c) => sum + widthOf(c), 0);
    const fullWidth = [...document.querySelectorAll("thead th")].length; // placeholder — replaced below
    // Instead of relying on header count, assert the invariant directly:
    // spacer widths make the colgroup sum equal COL_COUNT * the default
    // column width. Read the default width from the first rendered col.
    const perColumn = widthOf(cols[0]);
    expect(totalColWidth).toBeCloseTo(perColumn * COL_COUNT, 0);
    void fullWidth;
  });

  it("always renders pinned columns", () => {
    render(
      <DataGrid
        data={makeWideRows(3)}
        columns={wideColumns}
        getRowId={(r) => r.id}
        virtualizeColumns
        defaultColumnPinning={{ left: ["c0"], right: ["c39"] }}
        features={{ pagination: false, rowSelection: false, columnPinning: true }}
      />,
    );
    expect(screen.getByText("Col 0")).toBeInTheDocument();
    expect(screen.getByText("Col 39")).toBeInTheDocument();
    // Center columns beyond the window still unmounted.
    expect(screen.queryByText("Col 30")).not.toBeInTheDocument();
  });

  it("renders every column when virtualizeColumns is off (regression guard)", () => {
    render(
      <DataGrid
        data={makeWideRows(2)}
        columns={wideColumns}
        getRowId={(r) => r.id}
        features={{ pagination: false, rowSelection: false }}
      />,
    );
    expect(screen.getByText("Col 0")).toBeInTheDocument();
    expect(screen.getByText("Col 39")).toBeInTheDocument();
  });
});
```

**Verified against the codebase:** `defaultColumnPinning` is the real public prop (`DataGrid.tsx:315`), and the test's columns (no `width` set) all fall back uniformly to TanStack's 150px default (`size: column.width` at `DataGrid.tsx:683` is the only width source), so the `perColumn * COL_COUNT` colgroup invariant holds as written.

- [ ] **Step 2: Run new tests, verify the virtualized ones fail**

Run: `npx vitest run src/components/DataGrid/DataGrid.columnVirtual.test.tsx`
Expected: the three virtualized tests FAIL (all 40 columns render); the regression guard passes.

- [ ] **Step 3: Implement colgroup + body windowing in `DataGrid.tsx`**

Colgroup (~line 2513) — replace the plain map:

```tsx
            <colgroup>
              {columnWindow
                ? windowLeafCells({
                    items: visibleLeafColumns,
                    getId: (column) => column.id,
                    getPinned: (column) => column.getIsPinned(),
                    window: columnWindow,
                  }).map((entry) =>
                    entry.kind === "cell" ? (
                      <col key={entry.item.id} style={{ width: entry.item.getSize() }} />
                    ) : (
                      <col key={`dg-col-spacer-${entry.side}`} style={{ width: entry.width }} />
                    ),
                  )
                : visibleLeafColumns.map((column) => (
                    <col key={column.id} style={{ width: column.getSize() }} />
                  ))}
            </colgroup>
```

Body rows — in `renderGridLeafRow` (defined ~line 2008; the cell loop is at ~line 2058 — note `renderVisibleRow` at ~2240 is a separate dispatcher, not the place to edit), replace `row.getVisibleCells().map((cell) => { … })` with a windowed list, keeping the existing cell-render callback **byte-for-byte identical** (extract it to a local `renderBodyCell` taking the cell; `Cell` is not currently imported by name in `DataGrid.tsx` — either import the type from `@tanstack/react-table` or let inference type the parameter):

```tsx
        {(columnWindow
          ? windowLeafCells({
              items: row.getVisibleCells(),
              getId: (cell) => cell.column.id,
              getPinned: (cell) => cell.column.getIsPinned(),
              window: columnWindow,
            })
          : row.getVisibleCells().map((cell) => ({ kind: "cell" as const, item: cell }))
        ).map((entry) =>
          entry.kind === "cell" ? (
            renderBodyCell(entry.item)
          ) : (
            <td
              key={`dg-cell-spacer-${entry.side}`}
              aria-hidden="true"
              style={{ padding: 0, border: 0 }}
            />
          ),
        )}
```

Notes:
- The spacer `<td>` carries no width — the spacer `<col>` owns width under `table-layout: fixed` (this is why every row must emit the spacer cells).
- Full-width rows (group toggle rows `colSpan={visibleCellCount}` ~line 1251, summary row ~line 1330, detail rows) are **left untouched**: their `colSpan` may exceed the windowed `<col>` count; HTML clamps this and clamping is the wanted behavior (spec: "do not fix it").
- `bodyColSpan` stays the full leaf count (row-virtualization spacer `<tr>`s keep working).
- `aria-colcount` / per-cell `aria-colindex` already derive from `visibleLeafColumns` (full set) — no change; verify `colIndex` lookup (~line 2067) still uses `visibleLeafColumns.findIndex`, which it does.

- [ ] **Step 4: Run the new test file, then the full suite**

Run: `npx vitest run src/components/DataGrid/DataGrid.columnVirtual.test.tsx`
Expected: PASS.
Run: `npx tsc -b && npm test`
Expected: clean; no regressions (especially `DataGrid.grid`, `DataGrid.a11y`, `DataGrid.virtual` suites).

- [ ] **Step 5: Commit**

```bash
git add src/components/DataGrid/DataGrid.tsx src/components/DataGrid/DataGrid.columnVirtual.test.tsx
git commit -m "feat(datagrid): window colgroup and body cells under virtualizeColumns"
```

---

## Chunk 3: Header windowing, keyboard nav, pivot, docs

### Task 5: Header rows — bands, leaf row, floating filters (TDD)

**Files:**
- Modify: `src/components/DataGrid/DataGridHeader.tsx`
- Modify: `src/components/DataGrid/DataGrid.tsx` (pass `columnWindow` to `DataGridHeader`)
- Modify: `src/components/DataGrid/DataGrid.columnVirtual.test.tsx`

- [ ] **Step 1: Append failing band-clipping test**

Append to `DataGrid.columnVirtual.test.tsx`:

```tsx
  it("clips grouped-header band colSpan to rendered leaves", () => {
    render(
      <DataGrid
        data={makeWideRows(2)}
        columns={wideColumns}
        getRowId={(r) => r.id}
        virtualizeColumns
        columnGroups={[
          { groupId: "g-early", header: "Early", children: ["c0", "c1", "c2", "c3"] },
          { groupId: "g-late", header: "Late", children: ["c36", "c37", "c38", "c39"] },
        ]}
        features={{ pagination: false, rowSelection: false }}
      />,
    );
    // Early band renders, clipped to its rendered leaves (window starts at c0).
    const early = screen.getByText("Early").closest("th");
    expect(early).not.toBeNull();
    const colSpan = Number(early?.getAttribute("colspan") ?? "1");
    expect(colSpan).toBeGreaterThanOrEqual(1);
    expect(colSpan).toBeLessThanOrEqual(4);
    // Late band's leaves are all outside the initial window: band dropped.
    expect(screen.queryByText("Late")).not.toBeInTheDocument();
    // Band row and leaf row must consume identical total column slots:
    const [bandRow, leafRow] = document.querySelectorAll("thead tr");
    const slots = (tr: Element) =>
      [...tr.children].reduce((sum, cell) => sum + Number(cell.getAttribute("colspan") ?? "1"), 0);
    expect(slots(bandRow)).toBe(slots(leafRow));
  });
```

(`DataGridColumnGroup` shape verified against `columnGroups.ts:8-12`: `{ groupId, header, children }`, matching real usage in `RetailGridDemo.tsx:30-42`.)

- [ ] **Step 2: Run, verify failure**

Run: `npx vitest run src/components/DataGrid/DataGrid.columnVirtual.test.tsx -t "clips grouped-header"`
Expected: FAIL (band row renders all headers; `Late` present).

- [ ] **Step 3: Implement header windowing**

`DataGridHeader.tsx`:
1. Add prop `columnWindow: ColumnWindow | null` (import type from `./columnVirtual`).
2. In the `headerGroup.headers.map(...)` render (~line 57): when `columnWindow` is set, replace the direct map with `windowHeaderRow({ headers: headerGroup.headers, getLeafIds: (h) => h.getLeafHeaders().map((leaf) => leaf.column.id), getPinned: (h) => h.getLeafHeaders()[0]?.column.getIsPinned() ?? false, window: columnWindow })` — note TanStack's `Header` has `getLeafHeaders()`, **not** `getLeafColumns()` (that only exists on `Column`); every leaf of a header instance shares one pin region, so the first leaf's pin state stands for the header and map entries: `kind === "header"` → the existing `<th>` JSX with `colSpan={entry.colSpan}` instead of `header.colSpan` (extract the current `<th>` body into a local `renderHeaderCell(header, colSpan)` so the JSX is not duplicated); `kind === "spacer"` → `<th key={…} aria-hidden="true" style={{ padding: 0, border: 0 }} />`.
3. Floating-filter row (~line 237): same treatment via `windowLeafCells` over `table.getVisibleLeafColumns()`, spacer `<td aria-hidden style={{ padding: 0, border: 0 }} />`.
4. `DataGrid.tsx`: pass `columnWindow={columnWindow}` to `<DataGridHeader …>` (~line 2518).
5. Un-skip the deferred header-count test in `DataGrid.columnVirtual.test.tsx` (`it.skip("renders far fewer header cells…")` → `it`) — it goes green once `DataGridHeader` consumes `columnWindow`.

- [ ] **Step 4: Run the file, then full suite**

Run: `npx vitest run src/components/DataGrid/DataGrid.columnVirtual.test.tsx`
Expected: PASS (all, including earlier header-count test — recheck it now goes through `windowHeaderRow`).
Run: `npx tsc -b && npm test`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/DataGrid/DataGridHeader.tsx src/components/DataGrid/DataGrid.tsx src/components/DataGrid/DataGrid.columnVirtual.test.tsx
git commit -m "feat(datagrid): clip header bands and window header rows under virtualizeColumns"
```

### Task 6: Keyboard scroll-into-view for off-window columns (TDD)

**Files:**
- Modify: `src/components/DataGrid/useCellFocus.ts`
- Modify: `src/components/DataGrid/DataGrid.tsx` (pass new options)
- Modify: `src/components/DataGrid/DataGrid.a11y.test.tsx` (stub-based spy test, beside the existing `useCellFocus` renderHook test ~line 182)

- [ ] **Step 1: Write the failing spy test**

Beside the existing `renderHook(useCellFocus)` test in `DataGrid.a11y.test.tsx` (follow its option-builder shape exactly, ~lines 183–207):

```tsx
  it("scrolls an off-window column into view via the column virtualizer and defers focus", () => {
    const scrolled: number[] = [];
    const visibleRows = [{ id: "a", getIsGrouped: () => false }];
    const table = {
      getVisibleLeafColumns: () => [
        { id: "pin", getIsPinned: () => "left" },
        { id: "c0", getIsPinned: () => false },
        { id: "c1", getIsPinned: () => false },
      ],
      getHeaderGroups: () => [{ id: "h" }],
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const options: any = {
      visibleRows,
      isPivotLayout: false,
      table,
      floatingFiltersEnabled: false,
      virtualizeRows: false,
      rowVirtualizer: { scrollToIndex: () => {} },
      virtualizeColumns: true,
      columnVirtualizer: { scrollToIndex: (i: number) => scrolled.push(i) },
    };
    const { result } = renderHook(() => useCellFocus(options));
    // "c1" is not mounted (no cellRef registered): focusCell must ask the
    // column virtualizer for its CENTER index (1), not its leaf index (2).
    act(() => result.current.focusCell("a", "c1"));
    expect(scrolled).toEqual([1]);
  });
```

(Import `act` from `@testing-library/react` if not already imported in the file.)

- [ ] **Step 2: Run, verify failure**

Run: `npx vitest run src/components/DataGrid/DataGrid.a11y.test.tsx -t "scrolls an off-window column"`
Expected: FAIL — `useCellFocus` has no `columnVirtualizer` option / no scroll call.

- [ ] **Step 3: Implement in `useCellFocus.ts`**

1. Extend options:

```ts
  virtualizeColumns: boolean;
  columnVirtualizer: Pick<Virtualizer<HTMLDivElement, Element>, "scrollToIndex">;
```

2. Compute the center-index map beside `rowVisibleIndexById` (center = unpinned visible leaves, via the already-imported table):

```ts
  const centerColumnIndexById = useMemo(() => {
    const map = new Map<string, number>();
    let index = 0;
    for (const column of table.getVisibleLeafColumns()) {
      if (!column.getIsPinned()) {
        map.set(column.id, index);
        index += 1;
      }
    }
    return map;
  }, [table, visibleRows]); // visibleRows proxies "table state changed", same as navColumnIds recompute
```

**Check:** `getVisibleLeafColumns()[i].getIsPinned` exists on the real Table type used here — the stub in the existing a11y test lacks it, which is why the new test's stub includes it; make the implementation tolerate columns without `getIsPinned` (`column.getIsPinned?.() ?? false`) so the older stub-based test keeps passing.

3. In `focusCell`, after the row-scroll branch (~line 79–85), add the column branch (both may fire for a diagonal jump like Ctrl+End):

```ts
    if (virtualizeColumns) {
      const centerIndex = centerColumnIndexById.get(columnId);
      if (centerIndex != null) {
        columnVirtualizer.scrollToIndex(centerIndex, { align: "auto" });
      }
      pendingFocusKey.current = key;
    }
```

The existing pending-focus effect already completes the deferred focus once the cell mounts — no change there.

4. `DataGrid.tsx`: pass `virtualizeColumns: virtualizeColumnsEnabled, columnVirtualizer` at the `useCellFocus` call site.

5. Update the pre-existing `useCellFocus` renderHook test's options builder in `DataGrid.a11y.test.tsx` (~line 190) to include the two new keys (`virtualizeColumns: false`, `columnVirtualizer: { scrollToIndex: () => {} }`). Note: that builder is typed `any`, so the suite would pass without this — do it anyway so the stub mirrors the real contract.

- [ ] **Step 4: Run the a11y file, then full suite**

Run: `npx vitest run src/components/DataGrid/DataGrid.a11y.test.tsx && npx tsc -b && npm test`
Expected: PASS / clean, including the pre-existing renderHook test (its builder was updated in Step 3 sub-step 5). Keep the new options **required** on `UseCellFocusOptions` — that keeps the DataGrid call site honest.

- [ ] **Step 5: Commit**

```bash
git add src/components/DataGrid/useCellFocus.ts src/components/DataGrid/DataGrid.tsx src/components/DataGrid/DataGrid.a11y.test.tsx
git commit -m "feat(datagrid): keyboard focus scrolls off-window columns into view"
```

### Task 7: Pivot windowing test, demo opt-in, docs

**Files:**
- Modify: `src/components/DataGrid/DataGrid.columnVirtual.test.tsx`
- Modify: `src/demo/RetailGridDemo.tsx` + `src/App.tsx`
- Modify: `CLAUDE.md`, `README.md`

- [ ] **Step 1: Append the pivot integration test (should pass with no new code)**

```tsx
  it("windows generated pivot measure columns", () => {
    type PivotSource = { id: string; segment: string; region: string; revenue: number };
    const rows: PivotSource[] = Array.from({ length: 200 }, (_, i) => ({
      id: String(i),
      segment: `Segment ${i % 5}`,
      region: `Region ${i % 40}`,
      revenue: i,
    }));
    render(
      <DataGrid<PivotSource>
        data={rows}
        columns={[
          { accessorKey: "segment", header: "Segment", dataType: "text" },
          { accessorKey: "region", header: "Region", dataType: "text" },
          { accessorKey: "revenue", header: "Revenue", dataType: "currency" },
        ]}
        layoutMode="pivot"
        getRowId={(r) => r.id}
        virtualizeColumns
        features={{ pagination: false, rowSelection: false }}
        pivot={{
          rows: ["segment"],
          columns: [{ columnId: "region" }],
          measures: [{ id: "revenue", label: "Revenue", columnId: "revenue", aggregation: "sum" }],
        }}
      />,
    );
    // 40 region buckets × 1 measure (+ row label + totals) — the window
    // renders a strict subset of leaf header cells.
    const leafHeaderRow = [...document.querySelectorAll("thead tr")].at(-1);
    expect(leafHeaderRow).toBeDefined();
    expect(leafHeaderRow!.querySelectorAll("th").length).toBeLessThan(40);
  });
```

(Pivot config shape verified: `columns` takes `DataGridPivotColumnAxis[]` — `{ columnId, order? }` objects, per `pivot.tsx:30-33` and usage in `DataGrid.test.tsx`.)

Run: `npx vitest run src/components/DataGrid/DataGrid.columnVirtual.test.tsx`
Expected: PASS with no production-code change (windowing operates on the post-reconciliation leaf set). If it fails, debug via superpowers:systematic-debugging before touching pivot code — the spec expects zero pivot special-casing.

- [ ] **Step 2: Demo opt-in**

- `src/demo/RetailGridDemo.tsx`: add `virtualizeColumns?: boolean` prop (beside `virtualizeRows`, ~line 54/67) and pass it through to `<DataGrid>` (~line 191).
- `src/App.tsx` (~line 276): pass `virtualizeColumns` alongside `virtualizeRows` for the same recipes: `virtualizeColumns={recipe === "analyst" || recipe === "agent"}`.

Run: `npm run dev` and eyeball http://127.0.0.1:5173/ in grid + pivot layouts (horizontal scroll stays smooth, pinned select/actions columns stay put, no column misalignment). Then `npx tsc -b && npm test`.

- [ ] **Step 3: Docs**

- `CLAUDE.md` — extend the "Grouping, expansion & row windowing" bullet's last sentence with column windowing, e.g.: "When `virtualizeColumns` is set, unpinned center columns are likewise windowed via a horizontal virtualizer (`columnVirtual.ts` holds the pure partition/window/row-assembly helpers); pinned columns always render, header-band `colSpan`s are clipped to rendered leaves, and spacer `<col>`/`<th>`/`<td>`s preserve fixed-table geometry. Card layout ignores it." Also add `columnVirtual.ts` to the "State & helper hooks" sibling list sentence where `gridHelpers.ts` is enumerated.
- `README.md` — wherever row virtualization is featured (lines ~20/234/261/833), mention column virtualization in the same breath (one clause each; follow existing prose style).
- `CLAUDE.md` (same edit pass): add one sentence to the column-header-groups bullet noting consumers should not split a single `columnGroups` band across pinned and unpinned columns — TanStack's unified `getHeaderGroups()` can fuse adjacent same-group headers across the pin boundary (pre-existing TanStack behavior; the plan reviewer traced it in `buildHeaderGroups`), and `windowHeaderRow` assumes one pin region per header instance.

- [ ] **Step 4: Full verification**

Run: `npx tsc -b && npm test && npm run build:package && npm run test:package`
Expected: all green — `test:package` guards the public artifact surface (new prop is type-only surface; `datagrid.d.ts` must roll up cleanly).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(datagrid): pivot column-windowing coverage, demo opt-in, docs"
```

### Task 8: Final review gate

- [ ] **Step 1:** Re-read the spec top to bottom; confirm every requirement maps to landed code or a documented deviation (the `windowHeaderRow` consolidation is the only one).
- [ ] **Step 2:** Run the complete gate one last time: `npx tsc -b && npm test && npm run test:package`. Expected: green.
- [ ] **Step 3:** Use superpowers:requesting-code-review to dispatch a code review of the full diff (`git diff main@{upstream}` scope or the feature's commit range) against the spec.
- [ ] **Step 4:** Fix anything the review surfaces (superpowers:receiving-code-review); re-run the gate; commit.
