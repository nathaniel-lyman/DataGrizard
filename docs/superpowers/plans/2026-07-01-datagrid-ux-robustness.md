# DataGrid UX Robustness Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the two remaining review recommendations (reveal-on-demand header tools; viewport-aware floating UI) plus five small robustness fixes surfaced by the grid-mode UX sweep.

**Architecture:** All work stays inside `src/components/DataGrid/` and follows the existing house rules: domain-neutral and generic over `TData extends object`, new behavior behind typed props / feature flags, pure logic extracted into focused sibling files, TDD with concern-split test files next to the engine. Chunk 1 adds a `headerToolsOnDemand` feature flag and a per-column `enableSorting` opt-out. Chunk 2 introduces one pure placement helper (`popoverPosition.ts`) and threads it through every naively-positioned floating element (filter popover, header menu, cell-editor error, loading overlay). Chunk 3 is five independent one-file fixes.

**Tech Stack:** React 19 + TypeScript, TanStack Table v8, Tailwind CSS 3.4 (note: `has-[...]` and `group/name` variants are available), Vitest + Testing Library (jsdom — no real layout, so tests assert DOM structure/classes and pure-function math, never pixel positions).

**Background (why each change):** Committed `f53d6ab` fixed the width contract (`table-fixed` + colgroup). Remaining findings from the review of 2026-07-01:
- Header chrome (funnel 24px + kebab 24px + sort icon + gaps + padding ≈ 84px) dominates narrow columns (default `minSize` 88px), leaving labels ~4px.
- `enableSorting` is only settable grid-wide via `features.sorting` (`DataGrid.tsx:1103` area); no per-column opt-out.
- Filter popover guards only the right viewport edge with a hardcoded 280px estimate (`filters.tsx:126-127`) and never flips vertically; header menu (`HeaderColumnMenu.tsx:109`) has no guard at all; the cell-editor error renders `top-full` and runs below the fold when the edited row sits near the viewport bottom (`cellEditor.tsx:196-204`); the loading overlay is `absolute inset-0` *inside* the scroller (`DataGrid.tsx:3204-3212`) so it scrolls out of view. (Note: effect-cell `overflow-hidden` does **not** clip the editor — `barGeometry`/`flashEntry` are computed with `!isEditingCell` guards, so an editing `<td>` never has `overflow-hidden`; the original review finding was half wrong and the fix is viewport-flip only.)
- Applied-filter chips never truncate (no bounded width), empty filter option lists render a blank popover, big multiSelect lists have no search, an invalid inline edit traps mouse-only users on blur, and saving over an existing view name gives no feedback.

**Verification commands used throughout:**
- Single test file: `npx vitest run src/components/DataGrid/<file> 2>&1 | tail -20`
- Full gate: `npx tsc -b && npm test`
- Line numbers below are as of commit `f53d6ab`; re-locate with the quoted code, not the number, if drift occurs.

---

## Chunk 1: Header tools on demand + per-column sorting opt-out

### Task 1: `features.headerToolsOnDemand` — reveal funnel/kebab on hover, focus, active state, or open menu

The funnel and kebab collapse to zero width (`w-0 opacity-0 pointer-events-none`) and reveal on: `<th>` hover (`group/header`), keyboard focus landing inside the cluster (`focus-within:` — the buttons stay in the tab order because we never use `display:none`), an active filter (`has-[[data-active]]` — the funnel button already sets `data-active` when its filter is active, `filters.tsx:142`), or an open menu (`has-[[aria-expanded=true]]`). Deliberately **no** `overflow-hidden` on the collapsed cluster: the popovers render absolutely inside it and must not be clipped; while collapsed the children overflow the 0-width box invisibly (opacity-0) and un-interactively (pointer-events-none).

**Files:**
- Modify: `src/components/DataGrid/DataGrid.tsx` (the `DataGridFeatures` type at :127, `defaultFeatures` at :359, the `<th>` render + the funnel/menu siblings in the header map, currently `DataGrid.tsx:3301-3346` region)
- Test: `src/components/DataGrid/DataGrid.header.test.tsx` (extend — this file already covers header layout)

- [ ] **Step 1: Write the failing tests**

Append to `src/components/DataGrid/DataGrid.header.test.tsx`:

```tsx
describe("DataGrid header tools on demand", () => {
  const getToolsCluster = (headerText: string) => {
    const cell = screen.getByRole("columnheader", { name: new RegExp(headerText) });
    const funnel = cell.querySelector('button[aria-label$=" filter"]');
    expect(funnel).not.toBeNull();
    return funnel!.closest("[data-header-tools]");
  };

  it("collapses the funnel/menu cluster when headerToolsOnDemand is on", () => {
    renderGrid({
      features: { rowSelection: false, pagination: false, headerToolsOnDemand: true },
    });

    const cluster = getToolsCluster("Dept");
    expect(cluster).not.toBeNull();
    expect(cluster).toHaveClass("w-0", "opacity-0", "pointer-events-none");
    // Reveal styles must exist so hover/focus/active/open can restore the cluster.
    expect(cluster!.className).toContain("group-hover/header:w-auto");
    expect(cluster!.className).toContain("focus-within:w-auto");
    expect(cluster!.className).toContain("has-[[data-active]]:w-auto");
    expect(cluster!.className).toContain("has-[[aria-expanded=true]]:w-auto");
    // Never display:none — the buttons must stay keyboard-reachable.
    expect(cluster).not.toHaveClass("hidden");
  });

  it("keeps the cluster expanded by default (flag off)", () => {
    renderGrid();

    const cluster = getToolsCluster("Dept");
    expect(cluster).not.toBeNull();
    expect(cluster).not.toHaveClass("w-0");
    expect(cluster).not.toHaveClass("opacity-0");
  });

  it("marks the header cell as the hover group", () => {
    renderGrid({
      features: { rowSelection: false, pagination: false, headerToolsOnDemand: true },
    });

    const cell = screen.getByRole("columnheader", { name: /Dept/ });
    expect(cell).toHaveClass("group/header");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/DataGrid/DataGrid.header.test.tsx 2>&1 | tail -20`
Expected: the two `headerToolsOnDemand` tests FAIL (`cluster` is null — no `[data-header-tools]` wrapper exists yet); the flag-off test also FAILS for the same reason. TypeScript may also flag `headerToolsOnDemand` as an unknown feature key — that is part of the failure signal.

- [ ] **Step 3: Add the feature flag**

In `src/components/DataGrid/DataGrid.tsx`, inside `export type DataGridFeatures = {` (line ~127), after the `headerMenu: boolean;` member (line ~158), add:

```ts
  /**
   * Collapse the per-column funnel + menu buttons until the header is
   * hovered, a tool has keyboard focus, the filter is active, or the menu is
   * open. Reclaims label space in narrow columns. Default false.
   */
  headerToolsOnDemand: boolean;
```

In `defaultFeatures` (line ~359), after `headerMenu: true,` add:

```ts
  headerToolsOnDemand: false,
```

- [ ] **Step 4: Wrap the funnel + menu in a collapsible cluster**

In the header map in `DataGrid.tsx`, the funnel and menu currently render as two bare siblings after the `min-w-0 flex-1` label div:

```tsx
                            {headerFilter ? (
                              <FilterPopover filter={headerFilter} variant="icon" />
                            ) : null}
                            {showHeaderMenu ? (
                              <HeaderColumnMenu
```

Wrap them (keeping every existing prop of `HeaderColumnMenu` untouched) and close the wrapper after `showHeaderMenu`'s closing `: null}`:

```tsx
                            {headerFilter || showHeaderMenu ? (
                              <div
                                data-header-tools
                                className={`flex shrink-0 items-center gap-1 ${
                                  features.headerToolsOnDemand
                                    ? "w-0 opacity-0 pointer-events-none transition-opacity " +
                                      "group-hover/header:w-auto group-hover/header:opacity-100 group-hover/header:pointer-events-auto " +
                                      "focus-within:w-auto focus-within:opacity-100 focus-within:pointer-events-auto " +
                                      "has-[[data-active]]:w-auto has-[[data-active]]:opacity-100 has-[[data-active]]:pointer-events-auto " +
                                      "has-[[aria-expanded=true]]:w-auto has-[[aria-expanded=true]]:opacity-100 has-[[aria-expanded=true]]:pointer-events-auto"
                                    : ""
                                }`}
                              >
                                {headerFilter ? (
                                  <FilterPopover filter={headerFilter} variant="icon" />
                                ) : null}
                                {showHeaderMenu ? (
                                  <HeaderColumnMenu
                                    ... (existing props unchanged) ...
                                  />
                                ) : null}
                              </div>
                            ) : null}
```

And add `group/header` to the `<th>` className (the template literal starting `relative border-r ${densityStyle.header}` at ~:3298):

```tsx
                        className={`group/header relative border-r ${densityStyle.header} font-semibold last:border-r-0 ${
```

(`group/header` is unconditional — it is inert when the flag is off.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/components/DataGrid/DataGrid.header.test.tsx 2>&1 | tail -10`
Expected: all tests in the file PASS (including the six pre-existing ones — the flag-off wrapper is a visual no-op).

- [ ] **Step 6: Full gate**

Run: `npx tsc -b && npm test 2>&1 | tail -5`
Expected: no type errors; all test files pass. If `DataGrid.a11y.test.tsx` or `DataGrid.filters.test.tsx` fail on funnel/menu queries, the wrapper broke a selector — fix the wrapper, not the tests (the buttons themselves must be unchanged).

- [ ] **Step 7: Opt the demo in**

In `src/App.tsx`, the demo passes `features={{ detailPanel: false }}` (search for `detailPanel`). Extend it:

```tsx
          features={{ detailPanel: false, headerToolsOnDemand: true }}
```

- [ ] **Step 8: Commit**

```bash
git add src/components/DataGrid/DataGrid.tsx src/components/DataGrid/DataGrid.header.test.tsx src/App.tsx
git commit -m "feat(datagrid): headerToolsOnDemand feature flag collapses header tools until needed"
```

### Task 2: Per-column `enableSorting` opt-out

**Files:**
- Modify: `src/types/grid.ts` (`GridColumnConfigForKey`, the `enableFiltering?: boolean;` neighborhood at :106)
- Modify: `src/components/DataGrid/DataGrid.tsx` (the data-column `ColumnDef` mapping, `enableSorting: features.sorting,` at :1110)
- Test: `src/components/DataGrid/DataGrid.header.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
describe("DataGrid per-column sorting opt-out", () => {
  it("renders a non-sortable header for a column with enableSorting false", () => {
    const cols: GridColumnConfig<Row>[] = [
      { accessorKey: "dept", header: "Dept", dataType: "text", enableSorting: false },
      { accessorKey: "revenue", header: "Revenue", dataType: "currency" },
    ];
    render(
      <DataGrid
        data={rows}
        columns={cols}
        getRowId={(r) => r.id}
        features={{ rowSelection: false, pagination: false, rowActions: false }}
      />,
    );

    // No sort toggle button for the opted-out column…
    expect(screen.queryByRole("button", { name: "Dept" })).toBeNull();
    // …but the label still renders (non-sortable span path), with its tooltip.
    const header = screen.getByRole("columnheader", { name: "Dept" });
    expect(header.querySelector("span[title='Dept']")).not.toBeNull();
    // Other columns keep sorting.
    expect(screen.getByRole("button", { name: "Revenue" })).toBeInTheDocument();
    // And the opted-out header carries no aria-sort.
    expect(header).not.toHaveAttribute("aria-sort");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/DataGrid/DataGrid.header.test.tsx 2>&1 | tail -20`
Expected: FAIL — TypeScript will reject `enableSorting` on the column config (unknown property) and/or the sort button for "Dept" still renders.

- [ ] **Step 3: Add the config property and thread it**

In `src/types/grid.ts`, inside `GridColumnConfigForKey` next to `enableFiltering?: boolean;` (line ~106), add:

```ts
  /** Per-column sorting opt-out; features.sorting remains the master switch. */
  enableSorting?: boolean;
```

In `src/components/DataGrid/DataGrid.tsx`, in the data-column mapping, change:

```ts
        enableSorting: features.sorting,
```

to:

```ts
        enableSorting: features.sorting && (column.enableSorting ?? true),
```

⚠️ There are several `enableSorting:` occurrences in the file (synthetic select column, pivot-generated columns). Only change the one inside `...columnList.map<ColumnDef<TData>>((column) => ({`, recognizable by its neighbors `size: column.width,` / `minSize: column.minWidth ?? 88,`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/DataGrid/DataGrid.header.test.tsx 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 5: Full gate and commit**

Run: `npx tsc -b && npm test 2>&1 | tail -5` — expected all green.

```bash
git add src/types/grid.ts src/components/DataGrid/DataGrid.tsx src/components/DataGrid/DataGrid.header.test.tsx
git commit -m "feat(datagrid): per-column enableSorting opt-out on GridColumnConfig"
```

---

## Chunk 2: Viewport-aware floating UI

One pure helper computes placement; three consumers apply it; the loading overlay is re-anchored. jsdom cannot measure layout, so the helper gets exhaustive unit tests with synthetic rects, and consumers get structure tests (default placement classes) — visual behavior is confirmed in the final verification task.

### Task 3: `popoverPosition.ts` — pure placement math

**Files:**
- Create: `src/components/DataGrid/popoverPosition.ts`
- Test: `src/components/DataGrid/popoverPosition.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/components/DataGrid/popoverPosition.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeAnchoredPlacement } from "./popoverPosition";

const trigger = (left: number, top: number, width = 24, height = 24) =>
  ({ left, top, right: left + width, bottom: top + height, width, height }) as DOMRect;

const viewport = { viewportWidth: 1280, viewportHeight: 720 };
const estimate = { estimatedWidth: 280, estimatedHeight: 360 };

describe("computeAnchoredPlacement", () => {
  it("opens down-left-aligned with room below and to the right", () => {
    const p = computeAnchoredPlacement({ trigger: trigger(100, 100), ...viewport, ...estimate });
    expect(p).toEqual({ alignEnd: false, openUp: false, maxHeight: undefined });
  });

  it("aligns end when the popover would cross the right edge", () => {
    const p = computeAnchoredPlacement({ trigger: trigger(1100, 100), ...viewport, ...estimate });
    expect(p.alignEnd).toBe(true);
  });

  it("opens up when space below is short and space above is larger", () => {
    const p = computeAnchoredPlacement({ trigger: trigger(100, 600), ...viewport, ...estimate });
    expect(p.openUp).toBe(true);
    // 600 - 8 margin = 592 above; full estimate fits, no clamp needed.
    expect(p.maxHeight).toBeUndefined();
  });

  it("stays down but clamps maxHeight when neither side fits and below is larger", () => {
    // trigger at 300 in a 720 viewport: 292 above, 396 below - 8 = 388 < 360? no; use a taller estimate
    const p = computeAnchoredPlacement({
      trigger: trigger(100, 300),
      ...viewport,
      estimatedWidth: 280,
      estimatedHeight: 500,
    });
    expect(p.openUp).toBe(false);
    expect(p.maxHeight).toBe(720 - (300 + 24) - 8); // space below the trigger minus margin
  });

  it("clamps to the minimum usable height in a tiny viewport", () => {
    // 200px viewport, trigger at 100: 92 above, 68 below - both under the
    // 120 minimum - so the clamp floor must kick in.
    const p = computeAnchoredPlacement({
      trigger: trigger(100, 100),
      viewportWidth: 1280,
      viewportHeight: 200,
      ...estimate,
    });
    expect(p.openUp).toBe(true); // 92 above > 68 below
    expect(p.maxHeight).toBe(120);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/DataGrid/popoverPosition.test.ts 2>&1 | tail -10`
Expected: FAIL — module `./popoverPosition` not found.

- [ ] **Step 3: Implement**

Create `src/components/DataGrid/popoverPosition.ts`:

```ts
// Pure placement math for the grid's anchored popovers (filter popover,
// header menu, editor error). Deliberately dependency-free and DOM-free so it
// unit-tests without layout; callers pass getBoundingClientRect() output.

export type AnchoredPlacement = {
  /** Right-align the popover to the trigger (would cross the right edge). */
  alignEnd: boolean;
  /** Open above the trigger (more room above than below). */
  openUp: boolean;
  /** Clamp height to the available side; undefined when the estimate fits. */
  maxHeight: number | undefined;
};

/** Popovers shorter than this are unusable; never clamp below it. */
export const MIN_POPOVER_HEIGHT = 120;

const MARGIN = 8;

export function computeAnchoredPlacement(options: {
  trigger: Pick<DOMRect, "left" | "top" | "bottom">;
  viewportWidth: number;
  viewportHeight: number;
  estimatedWidth: number;
  estimatedHeight: number;
}): AnchoredPlacement {
  const { trigger, viewportWidth, viewportHeight, estimatedWidth, estimatedHeight } = options;
  const alignEnd = trigger.left + estimatedWidth > viewportWidth - MARGIN;
  const spaceBelow = viewportHeight - trigger.bottom - MARGIN;
  const spaceAbove = trigger.top - MARGIN;
  const openUp = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;
  const available = openUp ? spaceAbove : spaceBelow;
  const maxHeight =
    available >= estimatedHeight ? undefined : Math.max(MIN_POPOVER_HEIGHT, Math.floor(available));
  return { alignEnd, openUp, maxHeight };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/components/DataGrid/popoverPosition.test.ts 2>&1 | tail -10`
Expected: PASS (5 tests). If the "clamps maxHeight" expectation mismatches by a pixel, fix the *test's arithmetic comment*, not the margin — the formula is `viewportHeight - trigger.bottom - MARGIN`.

- [ ] **Step 5: Commit**

```bash
git add src/components/DataGrid/popoverPosition.ts src/components/DataGrid/popoverPosition.test.ts
git commit -m "feat(datagrid): pure anchored-placement helper for popovers"
```

### Task 4: FilterPopover uses the helper (vertical flip + height clamp)

**Files:**
- Modify: `src/components/DataGrid/filters.tsx` (`FilterPopover`, :107-176)
- Test: `src/components/DataGrid/DataGrid.filters.test.tsx` (extend)

- [ ] **Step 1: Write the failing test**

In `DataGrid.filters.test.tsx` (reuse its existing render helpers/fixtures — read the file's top before editing), add:

```tsx
  it("filter popover dialog carries scrollable clamp styling and default down placement", () => {
    // jsdom rects are all zeros → helper reports openUp=false/alignEnd=false;
    // this pins the default branch and the overflow guard.
    renderGrid(); // whatever existing helper renders a filterable grid
    fireEvent.click(screen.getAllByRole("button", { name: /filter$/ })[0]);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveClass("top-full");
    expect(dialog).toHaveClass("overflow-auto");
    expect(dialog).not.toHaveClass("bottom-full");
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/DataGrid/DataGrid.filters.test.tsx 2>&1 | tail -15`
Expected: FAIL — dialog lacks `overflow-auto` today.

- [ ] **Step 3: Implement in `filters.tsx`**

Replace the `alignEnd` state and `toggleOpen` (currently :115-132) with placement state:

```tsx
  const [placement, setPlacement] = useState<AnchoredPlacement>({
    alignEnd: true,
    openUp: false,
    maxHeight: undefined,
  });

  const toggleOpen = () => {
    setOpen((isOpen) => {
      if (!isOpen) {
        const rect = triggerRef.current?.getBoundingClientRect();
        if (rect) {
          setPlacement(
            computeAnchoredPlacement({
              trigger: rect,
              viewportWidth: window.innerWidth,
              viewportHeight: window.innerHeight,
              estimatedWidth: 280,
              estimatedHeight: 360,
            }),
          );
        }
      }
      return !isOpen;
    });
  };
```

with import `import { computeAnchoredPlacement, type AnchoredPlacement } from "./popoverPosition";`.

Replace the dialog element (currently :163-172) with:

```tsx
        <div
          role="dialog"
          aria-label={`${filter.label} filter`}
          style={placement.maxHeight ? { maxHeight: placement.maxHeight } : undefined}
          className={`absolute z-30 overflow-auto rounded-md border border-slate-200 bg-white p-2 text-left shadow-lg ${
            placement.alignEnd ? "right-0" : "left-0"
          } ${placement.openUp ? "bottom-full mb-1" : "top-full mt-1"}`}
        >
```

- [ ] **Step 4: Run filters tests, then the full gate**

Run: `npx vitest run src/components/DataGrid/DataGrid.filters.test.tsx 2>&1 | tail -10` — expected PASS.
Run: `npx tsc -b && npm test 2>&1 | tail -5` — expected all green (pivot Filters popover and floating row reuse `FilterPopover`, so their tests re-cover this path).

- [ ] **Step 5: Commit**

```bash
git add src/components/DataGrid/filters.tsx src/components/DataGrid/DataGrid.filters.test.tsx
git commit -m "fix(datagrid): filter popover flips vertically and clamps to the viewport"
```

### Task 5: HeaderColumnMenu uses the helper

**Files:**
- Modify: `src/components/DataGrid/HeaderColumnMenu.tsx` (trigger `onClick` :95-98, menu div :104-110)
- Test: `src/components/DataGrid/DataGrid.header.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
describe("DataGrid header menu placement", () => {
  it("menu opens down by default with a scroll clamp guard", () => {
    renderGrid();
    fireEvent.click(screen.getByRole("button", { name: "Open Dept column menu" }));
    const menu = screen.getByRole("menu");
    expect(menu).toHaveClass("top-full");
    expect(menu).toHaveClass("overflow-auto");
    expect(menu).not.toHaveClass("bottom-full");
  });
});
```

(Add `fireEvent` to the testing-library import in this file.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/DataGrid/DataGrid.header.test.tsx 2>&1 | tail -15`
Expected: FAIL — the menu currently has `overflow-hidden`, not `overflow-auto`.

- [ ] **Step 3: Implement in `HeaderColumnMenu.tsx`**

Add state + import:

```tsx
import { computeAnchoredPlacement, type AnchoredPlacement } from "./popoverPosition";
// inside the component:
  const [placement, setPlacement] = useState<AnchoredPlacement>({
    alignEnd: true,
    openUp: false,
    maxHeight: undefined,
  });
```

In the trigger `onClick` (:95-98), compute placement before opening (menu ≈ 192 wide × 420 tall — 13 items + separators):

```tsx
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => {
            if (!current) {
              const rect = triggerRef.current?.getBoundingClientRect();
              if (rect) {
                setPlacement(
                  computeAnchoredPlacement({
                    trigger: rect,
                    viewportWidth: window.innerWidth,
                    viewportHeight: window.innerHeight,
                    estimatedWidth: 192,
                    estimatedHeight: 420,
                  }),
                );
              }
            }
            return !current;
          });
        }}
```

Replace the menu div (:104-110):

```tsx
        <div
          ref={menuRef}
          role="menu"
          aria-label={`${label} column menu`}
          style={placement.maxHeight ? { maxHeight: placement.maxHeight } : undefined}
          className={`absolute z-50 min-w-48 overflow-auto rounded-md border border-slate-200 bg-white py-1 text-slate-800 shadow-lg ${
            placement.alignEnd ? "right-0" : "left-0"
          } ${placement.openUp ? "bottom-full mb-1" : "top-full mt-1"}`}
        >
```

- [ ] **Step 4: Run tests to verify pass, full gate**

Run: `npx vitest run src/components/DataGrid/DataGrid.header.test.tsx 2>&1 | tail -10` — PASS.
Run: `npx tsc -b && npm test 2>&1 | tail -5` — all green.

- [ ] **Step 5: Commit**

```bash
git add src/components/DataGrid/HeaderColumnMenu.tsx src/components/DataGrid/DataGrid.header.test.tsx
git commit -m "fix(datagrid): header column menu flips vertically and clamps to the viewport"
```

### Task 6: Cell-editor error flips above the field near the viewport bottom

The error bubble renders `top-full` unconditionally today; when the edited row sits in the bottom band of the viewport the message runs below the fold, leaving only a red border. Flip it above the field in that case. (Do **not** touch the `<td>` `overflow-hidden` expression in `DataGrid.tsx` — editing cells already drop it because `barGeometry`/`flashEntry` carry `!isEditingCell` guards; see the Background note.)

**Files:**
- Modify: `src/components/DataGrid/cellEditor.tsx` (`withError` :193-206)
- Test: `src/components/DataGrid/DataGrid.editing.test.tsx` (the `onCellEdit` tests live here — reuse its enter-edit fixtures)

- [ ] **Step 1: Write the failing test**

Beside the existing editing tests (same render helper — read that describe block first). Note: cells expose `role="cell"` in this table, not `gridcell`.

```tsx
  it("renders the edit validation error below by default, flipping only near the viewport bottom", () => {
    // start an edit on an editable numeric cell, type garbage, press Enter
    // (reuse the file's existing enter-edit helper/fixture)
    ...enter edit mode, fireEvent.change(input, { target: { value: "not-a-number" } });
    fireEvent.keyDown(input, { key: "Enter" });
    const alert = screen.getByRole("alert");
    // jsdom rects are 0 → rect.top > 40 is false → no flip: pins the default
    // branch and proves the flip class is driven by measurement, not always on.
    expect(alert).toHaveClass("top-full");
    expect(alert).not.toHaveClass("bottom-full");
  });
```

(This is a sketch of the assertions; flesh out with the file's existing fixtures — the *assertions* are the contract.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/DataGrid/DataGrid.editing.test.tsx 2>&1 | tail -15`
Expected: the new test PASSES against current code (the `top-full` class is already unconditional), so it cannot serve as the red step by itself. Make it red by writing Step 3's implementation with the ternary **inverted** once (`errorAbove ? "top-full mt-0.5" : "bottom-full mb-0.5"`), watching this test fail, then correcting the ternary — that proves the test discriminates the branch. Alternatively (preferred if quick): unit-test the flip decision by extracting it as a pure function `shouldFlipErrorAbove(rect: {top: number; bottom: number} | undefined, viewportHeight: number): boolean` in `cellEditor.tsx` and asserting both branches directly — that gives a genuine red.

- [ ] **Step 3: Implement**

In `cellEditor.tsx`, compute the flip when an error appears (the field ref already exists). If Step 2's preferred route was taken, the decision lives in the exported pure helper and the effect just calls it:

```tsx
// ~40px bubble; flip when the field bottom is within that band of the viewport
// (and there is room above). Exported for direct unit testing.
export const shouldFlipErrorAbove = (
  rect: { top: number; bottom: number } | undefined,
  viewportHeight: number,
): boolean => Boolean(rect && rect.bottom + 40 > viewportHeight && rect.top > 40);

// inside the component:
  const [errorAbove, setErrorAbove] = useState(false);
  useEffect(() => {
    if (!error) return;
    setErrorAbove(
      shouldFlipErrorAbove(fieldRef.current?.getBoundingClientRect(), window.innerHeight),
    );
  }, [error]);
```

and in `withError` (:196-204) replace the span's positioning classes:

```tsx
          className={`absolute left-0 z-10 rounded bg-rose-600 px-1 py-0.5 text-[10px] font-medium text-white shadow ${
            errorAbove ? "bottom-full mb-0.5" : "top-full mt-0.5"
          }`}
```

- [ ] **Step 4: Run tests to verify pass, full gate**

Run: `npx vitest run src/components/DataGrid/DataGrid.editing.test.tsx 2>&1 | tail -10` — PASS.
Run: `npx tsc -b && npm test 2>&1 | tail -5` — all green.

- [ ] **Step 5: Commit**

```bash
git add src/components/DataGrid/cellEditor.tsx src/components/DataGrid/DataGrid.editing.test.tsx
git commit -m "fix(datagrid): flip edit validation errors above the field near the viewport bottom"
```

### Task 7: Re-anchor the loading/empty overlay outside the scroller

The overlay (`role="status"`/`"alert"`, `DataGrid.tsx:3204-3212`) is absolutely positioned *inside* the `overflow-auto` scroller, so it covers only the first client-height of content and scrolls out of view. Move it to a new relative wrapper that contains the scroller, so it is anchored to the visible area.

**Files:**
- Modify: `src/components/DataGrid/DataGrid.tsx` (:3199-3212 region)
- Test: `src/components/DataGrid/DataGrid.config.test.tsx` (net-new coverage — no existing test file exercises the overlay or `isLoading` today)

- [ ] **Step 1: Write the failing test**

```tsx
  it("anchors the loading overlay outside the scroll container", () => {
    render(<DataGrid data={[]} columns={columns} isLoading features={{ pagination: false }} />);
    const overlay = screen.getByRole("status");
    // The overlay must be a *sibling* of the scroller, not inside it,
    // or it scrolls out of view with the content.
    const scroller = overlay.parentElement!.querySelector(".overflow-auto");
    expect(scroller).not.toBeNull();
    expect(scroller!.contains(overlay)).toBe(false);
  });
```

(The prop is `isLoading` — `DataGrid.tsx:304`, destructured as `externalIsLoading` at :474; the `overlay` node itself is derived at :3029-3040.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/DataGrid/DataGrid.config.test.tsx 2>&1 | tail -15`
Expected: FAIL — the overlay is currently a child of the `overflow-auto` div.

- [ ] **Step 3: Implement**

Restructure `DataGrid.tsx` :3199-3212. Current:

```tsx
        <div
          ref={scrollRef}
          onScroll={(event) => setHorizontalScrollLeft(event.currentTarget.scrollLeft)}
          className="relative h-[min(68dvh,640px)] min-h-72 overflow-auto md:h-auto md:min-h-0 md:flex-1"
        >
          {overlay ? (
            <div ... className="absolute inset-0 z-20 flex items-center justify-center bg-white/90 px-6 text-center">
              {overlay}
            </div>
          ) : null}
```

New (overlay becomes a sibling inside a relative wrapper; the wrapper joins the outer flex column via `md:flex-1` and the scroller fills it with its own `md:flex-1`; the scroller drops `relative`):

```tsx
        <div className="relative flex min-h-0 flex-col md:flex-1">
          {overlay ? (
            <div
              role={error ? "alert" : "status"}
              aria-live="polite"
              className="absolute inset-0 z-20 flex items-center justify-center bg-white/90 px-6 text-center"
            >
              {overlay}
            </div>
          ) : null}
          <div
            ref={scrollRef}
            onScroll={(event) => setHorizontalScrollLeft(event.currentTarget.scrollLeft)}
            className="h-[min(68dvh,640px)] min-h-72 overflow-auto md:h-auto md:min-h-0 md:flex-1"
          >
```

and close the new wrapper `</div>` right after the scroller's closing `</div>` (before the pagination bar). ⚠️ The `sticky top-0` `<thead>` and pinned-column sticky offsets resolve against the nearest scroll container — that is still the same `overflow-auto` div, so they are unaffected; do not add `overflow` to the wrapper.

- [ ] **Step 4: Run tests to verify pass, full gate**

Run: `npx vitest run src/components/DataGrid/DataGrid.config.test.tsx 2>&1 | tail -10` — PASS.
Run: `npx tsc -b && npm test 2>&1 | tail -5` — all green (virtualization tests exercise `scrollRef`; if they fail, the ref moved — it must stay on the `overflow-auto` div).

- [ ] **Step 5: Commit**

```bash
git add src/components/DataGrid/DataGrid.tsx src/components/DataGrid/DataGrid.config.test.tsx
git commit -m "fix(datagrid): anchor loading/empty overlay to the visible area, not scroll content"
```

---

## Chunk 3: Small robustness fixes

Five independent tasks; each is one file + one test + one commit. Order is arbitrary.

### Task 8: Applied-filter chips get a bounded width

**Files:**
- Modify: `src/components/DataGrid/AppliedFilters.tsx` (:32 and :45)
- Test: `src/components/DataGrid/DataGrid.filters.test.tsx` (chip tests already reference `data-testid="applied-filter-…"`)

- [ ] **Step 1: Write the failing test**

```tsx
  it("bounds applied-filter chip labels so long values cannot push Clear all away", () => {
    // render a grid with an active text filter whose value is very long
    // (reuse the existing applied-filter fixtures in this file)
    const chip = screen.getByTestId(/applied-filter-/);
    const label = chip.querySelector("span.truncate");
    expect(label).toHaveClass("max-w-64", "min-w-0");
  });
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/components/DataGrid/DataGrid.filters.test.tsx 2>&1 | tail -10`; FAIL (no `max-w-64`).

- [ ] **Step 3: Implement** — in `AppliedFilters.tsx`, change both label spans (:32 and :45) from `className="truncate"` to:

```tsx
          <span className="min-w-0 max-w-64 truncate">
```

(`truncate` needs a bounded width to engage inside an `inline-flex` chip; `max-w-64` = 16rem.) Also add `title` so the full value is recoverable: `title={globalSearch}` on the search chip span and `` title={`${filter.label}: ${summarizeFilter(filter)}`} `` on the filter chip span.

- [ ] **Step 4: Verify pass + gate** — file run PASS, then `npx tsc -b && npm test 2>&1 | tail -5`.

- [ ] **Step 5: Commit**

```bash
git add src/components/DataGrid/AppliedFilters.tsx src/components/DataGrid/DataGrid.filters.test.tsx
git commit -m "fix(datagrid): bound applied-filter chip width so Clear all stays reachable"
```

### Task 9: Empty filter option lists say so

**Files:**
- Modify: `src/components/DataGrid/filterBodies.tsx` (`SelectBody` :114-154, `MultiSelectBody` :156-188)
- Test: `src/components/DataGrid/DataGrid.filters.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
  it("shows a message instead of a blank popover when a multiSelect filter has no options", () => {
    // grid-mode with autoColumnFilters off and a named multiSelect filter with
    // no static options (the documented server-mode degradation)
    ...open the funnel...
    expect(screen.getByText("No options available")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run to verify failure** — FAIL (blank body).

- [ ] **Step 3: Implement** — in `filterBodies.tsx`, add one shared element and use it in both bodies:

```tsx
const emptyOptions = (
  <p className="px-2 py-1.5 text-xs font-medium text-slate-500">No options available</p>
);
```

In `MultiSelectBody`, before the options map (after the unary-operator early return :166-168):

```tsx
  if (filter.options.length === 0) {
    return <div className="w-48">{emptyOptions}</div>;
  }
```

In `SelectBody`, same guard returning `<div className="w-56">{emptyOptions}</div>`.

- [ ] **Step 4: Verify pass + gate.**

- [ ] **Step 5: Commit**

```bash
git add src/components/DataGrid/filterBodies.tsx src/components/DataGrid/DataGrid.filters.test.tsx
git commit -m "fix(datagrid): empty filter option lists render an explanatory message"
```

### Task 10: MultiSelect filter gets an in-list search above ~10 options

**Files:**
- Modify: `src/components/DataGrid/filterBodies.tsx` (`MultiSelectBody`)
- Test: `src/components/DataGrid/DataGrid.filters.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
  it("adds a search box to multiSelect filters with many options and filters the list", () => {
    // fixture: a text column with 11-12 distinct values — auto-faceting requires
    // distinctCount <= facetThreshold (default 12, filterDefaults.ts:28), and the
    // search box needs > 10 options, so 11-12 is the only window at the default
    // threshold. With 13+ values pass facetThreshold={20} on the grid instead.
    ...open the funnel...
    const search = screen.getByPlaceholderText("Find option...");
    fireEvent.change(search, { target: { value: "Apple" } });
    // only matching options remain
    expect(screen.getAllByRole("checkbox").length).toBeLessThan(12);
  });

  it("omits the search box for short option lists", () => {
    ...open a funnel with 3 options...
    expect(screen.queryByPlaceholderText("Find option...")).toBeNull();
  });
```

- [ ] **Step 2: Run to verify failure** — FAIL (no such placeholder).

- [ ] **Step 3: Implement** — `MultiSelectBody` becomes stateful:

```tsx
const MULTISELECT_SEARCH_THRESHOLD = 10;

const MultiSelectBody = ({ filter }: { filter: GridFilter }) => {
  const { operator, value } = resolveFilterState(filter);
  const selected = Array.isArray(value) ? (value as string[]) : [];
  const format = filter.formatOption ?? formatOptionLabel;
  const [query, setQuery] = useState("");
  const toggle = (option: string) => { /* unchanged */ };
  if (isUnaryOperator(operator)) {
    return null;
  }
  if (filter.options.length === 0) {
    return <div className="w-48">{emptyOptions}</div>;
  }
  const needle = query.trim().toLowerCase();
  const visibleOptions = needle
    ? filter.options.filter((option) => format(option).toLowerCase().includes(needle))
    : filter.options;
  return (
    <div className="w-48">
      {filter.options.length > MULTISELECT_SEARCH_THRESHOLD ? (
        <input
          type="text"
          value={query}
          placeholder="Find option..."
          aria-label={`Find ${filter.label} option`}
          onChange={(event) => setQuery(event.target.value)}
          className={`${inputClass} mb-1 w-full`}
        />
      ) : null}
      <div className="max-h-64 overflow-auto">
        {visibleOptions.length === 0 ? emptyOptions : visibleOptions.map((option) => (
          /* existing <label> row, unchanged */
        ))}
      </div>
    </div>
  );
};
```

(Add `useState` to the react import; selected-but-filtered-out options stay selected — the search filters *display* only.)

- [ ] **Step 4: Verify pass + gate.**

- [ ] **Step 5: Commit**

```bash
git add src/components/DataGrid/filterBodies.tsx src/components/DataGrid/DataGrid.filters.test.tsx
git commit -m "feat(datagrid): searchable multiSelect filter body above 10 options"
```

### Task 11: Blur with an invalid edit reverts instead of trapping

Today `onBlur: () => commitText(false)` (`cellEditor.tsx:185`) fails validation silently and leaves the editor open with focus already gone — a mouse-only user has no exit. New behavior: blur commits when valid, cancels (reverts) when invalid. Enter keeps the current stay-open-and-show-error behavior.

**Files:**
- Modify: `src/components/DataGrid/cellEditor.tsx` (`commitText` :130-141, `common.onBlur` :185)
- Test: `src/components/DataGrid/DataGrid.editing.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
  it("reverts the edit when the editor blurs with an invalid value", () => {
    ...enter edit on a numeric editable cell...
    fireEvent.change(input, { target: { value: "garbage" } });
    fireEvent.blur(input);
    expect(onCellEdit).not.toHaveBeenCalled();
    // editor closed, original formatted value back in the cell
    expect(screen.queryByRole("alert")).toBeNull();
    expect(cell).toHaveTextContent(originalFormattedValue);
  });
```

- [ ] **Step 2: Run to verify failure** — FAIL (editor stays open with the alert).

- [ ] **Step 3: Implement** — make the commit helpers report success and branch on blur:

```tsx
  const commitTyped = (typed: unknown, advance: boolean): boolean => {
    // existing body; return false where it currently `return`s after
    // setError(...), return true after onCommit(typed, advance);
  };
  const commitText = (advance: boolean): boolean => {
    // existing body; return false in the catch branch, otherwise
    // return commitTyped(parsed, advance);
  };
```

and:

```tsx
    onBlur: () => {
      if (!commitText(false)) {
        cancel();
      }
    },
```

Also return `true` from the `committedRef.current` guard at the top of `commitTyped` (:118-121 — the double-commit guard): a blur that fires right after a successful Enter/Tab commit must not fall through to `cancel()`.

- [ ] **Step 4: Verify pass + gate** — also rerun the whole suite: the Enter-shows-error tests must still pass since only the blur path branches.

- [ ] **Step 5: Commit**

```bash
git add src/components/DataGrid/cellEditor.tsx src/components/DataGrid/DataGrid.editing.test.tsx
git commit -m "fix(datagrid): blur with an invalid edit reverts instead of trapping the editor open"
```

### Task 12: Saved-views save button signals overwrite

**Files:**
- Modify: `src/components/DataGrid/ToolbarSavedViews.tsx` (the Save button, :33-40)
- Test: `src/components/DataGrid/DataGrid.controlled.test.tsx` (saved-view tests live there; confirm with `grep -l "Save view" src/components/DataGrid/*.test.tsx`)

- [ ] **Step 1: Write the failing test**

```tsx
  it("relabels the save button to Update view when the name already exists", () => {
    ...render grid, save a view named "Weekly"...
    // type the same name again
    fireEvent.change(screen.getByLabelText(/View name/i), { target: { value: "Weekly" } });
    expect(screen.getByRole("button", { name: "Update view" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save view" })).toBeNull();
  });
```

- [ ] **Step 2: Run to verify failure** — FAIL (button always says "Save view").

- [ ] **Step 3: Implement** — in `ToolbarSavedViews.tsx` the component already receives both `savedViews` and `activeViewName`:

```tsx
  const willOverwrite = savedViews.includes(activeViewName.trim());
```

and in the save button:

```tsx
        {willOverwrite ? "Update view" : "Save view"}
```

- [ ] **Step 4: Verify pass + gate.**

- [ ] **Step 5: Commit**

```bash
git add src/components/DataGrid/ToolbarSavedViews.tsx src/components/DataGrid/DataGrid.controlled.test.tsx
git commit -m "feat(toolbar): save button signals when it will overwrite an existing view"
```

---

## Chunk 4: Docs + end-to-end verification

### Task 13: CHANGELOG + CLAUDE.md touch-ups

**Files:**
- Modify: `CHANGELOG.md` (Unreleased section)
- Modify: `CLAUDE.md` (the "Filtering is auto-provisioned…" bullet gains a sentence on the multiSelect search + empty-options message; the "Keyboard cell navigation & editing" bullet gains the blur-reverts rule)

- [ ] **Step 1: Add CHANGELOG entries under `## [Unreleased]`**

```markdown
### Added

- **`features.headerToolsOnDemand`:** collapse per-column funnel/menu buttons
  until hover, keyboard focus, an active filter, or an open menu.
- **Per-column `enableSorting`** opt-out on `GridColumnConfig`.
- MultiSelect filter bodies over 10 options get an in-list search box.
- Saved-views save button relabels to "Update view" when the name exists.

### Fixed

- Filter popovers and the header column menu flip vertically and clamp their
  height instead of running below short viewports.
- Inline-edit validation errors flip above the field near the viewport bottom.
- The loading/empty overlay anchors to the visible area instead of scrolling
  away with the content.
- Applied-filter chips truncate at a bounded width with a full-value tooltip.
- Empty filter option lists show "No options available" instead of a blank
  popover; blur with an invalid inline edit reverts instead of trapping the
  editor open.
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md CLAUDE.md
git commit -m "docs: changelog + architecture notes for UX robustness pass"
```

### Task 14: End-to-end visual verification (Playwright against the demo)

No commit from this task; it produces evidence. Use the `verify` skill conventions.

- [ ] **Step 1:** `npm run dev` (background), open `http://127.0.0.1:5173/` with Playwright, `localStorage.clear()` + reload.
- [ ] **Step 2:** Header tools: confirm funnel/kebab hidden at rest, revealed on `<th>` hover; apply a filter, move the mouse away, confirm the active funnel stays visible; Tab to a funnel, confirm it reveals on focus. Screenshot.
- [ ] **Step 3:** Resize the window to ~900×500. Header-anchored popovers sit near the viewport top, so they exercise the *clamp*, not the flip: open a header filter and the column menu and confirm each is height-clamped with internal scroll, fully on-screen. For the *flip*, enable `features.floatingFilters` temporarily (or scroll the page so a header sits low) and confirm a low-anchored popover opens upward. Screenshot both.
- [ ] **Step 4:** Edit a `units` cell at the bottom of the viewport with an invalid value, press Enter: the error bubble must be fully visible (flipped above). Then click elsewhere: the edit reverts and the editor closes.
- [ ] **Step 5:** Switch to Server mode, scroll mid-table, change a sort: the loading overlay must appear in view. Screenshot.
- [ ] **Step 6:** Filter chips: apply a long text filter (type a ~80-char string into a text filter), confirm the chip truncates and "Clear all" stays reachable.
- [ ] **Step 7:** Confirm pivot mode still renders and its toolbar Filters popover behaves (shares `FilterPopover`).
- [ ] **Step 8:** Kill the dev server, confirm `git status` is clean apart from intended commits, send screenshots to the user with a verification report.
