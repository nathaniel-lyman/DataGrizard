# Mobile Card Layout Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Below a container-width threshold, DataGrid rows morph into auto-composed cards with a touch-native chrome (search + sort/filter bottom sheets), behind an opt-in `features.cardLayout` flag.

**Architecture:** A render-path swap only — the single `useReactTable` instance, `useGridState` triads, `resolvedFilters`, and pagination keep working untouched; card mode swaps the `<table>` for a `CardList` and the `Toolbar` for a `ToolbarCompact`. A pure `cardComposition.ts` module assigns every visible leaf column a card role (title/badge/subtitle/metrics/meta) by dataType + visible order, overridable via a typed `DataGridCardConfig`. Mode detection is container-driven (`ResizeObserver` on the grid root), pinnable via `cardView.mode` (which is also how jsdom tests force it).

**Tech Stack:** React 19, TypeScript, TanStack Table v8, @tanstack/react-virtual, Tailwind, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-07-02-mobile-card-layout-design.md`

**House rules that bind every task:** `src/components/DataGrid/` stays domain-neutral and generic over `TData extends object` — no retail names anywhere in it. Every new public type exports from `src/components/DataGrid/index.ts`. Type-check is `npx tsc -b` (there is no lint script). Tests run with `npx vitest run <file>`.

---

## Chunk 1: Pure foundations (types, composition heuristic, container hook)

### Task 1: Public types + exports

**Files:**
- Modify: `src/types/grid.ts` (append at end of file)
- Modify: `src/components/DataGrid/index.ts` (extend the existing `types/grid` export block, lines 46–61)

- [ ] **Step 1: Append the card types to `src/types/grid.ts`**

```ts
export type DataGridDisplayMode = "table" | "cards";

/** Context handed to a custom `renderCard`. */
export type DataGridCardContext = {
  /** True when this row is the active (detail-panel) row. */
  isActive: boolean;
};

/**
 * Card-mode role overrides. Each role names columns by accessorKey; any role
 * left unset falls back to the auto-composition heuristic (first text column →
 * title, first status column → badge, next text columns → subtitle, numeric
 * columns → metrics, remainder → meta). `renderCard` replaces the whole card
 * body.
 */
export type DataGridCardConfig<TData> = {
  title?: Extract<keyof TData, string>;
  subtitle?: Extract<keyof TData, string>[];
  badge?: Extract<keyof TData, string>;
  /** Ordered metric tiles. */
  metrics?: Extract<keyof TData, string>[];
  meta?: Extract<keyof TData, string>[];
  /** Cap on auto-assigned metric tiles (ignored when `metrics` is set). Default 3. */
  maxMetrics?: number;
  /** Full card override; when set, the role props above are ignored. */
  renderCard?: (row: TData, context: DataGridCardContext) => ReactNode;
};

/**
 * Card-mode configuration. Inert unless `features.cardLayout` is on. Grid
 * layout only — pivot ignores card mode entirely.
 */
export type DataGridCardView<TData> = {
  /** Container width (px) below which "auto" switches to cards. Default 640. */
  breakpoint?: number;
  /**
   * "auto" (default) resolves from the grid root's own width via
   * ResizeObserver; "cards"/"table" pin the mode (also the test/demo forcing
   * mechanism — jsdom has no ResizeObserver).
   */
  mode?: "auto" | DataGridDisplayMode;
  card?: DataGridCardConfig<TData>;
  onDisplayModeChange?: (mode: DataGridDisplayMode) => void;
};
```

Note: the spec writes `title?: keyof TData`; the plan intentionally tightens this to `Extract<keyof TData, string>` (accessorKeys are strings — symbol/number keys would break the string-keyed maps in `cardComposition.ts`). Do not "fix" it back toward the spec.

- [ ] **Step 2: Add the four names to the `types/grid` export block in `src/components/DataGrid/index.ts`**

Insert alphabetically into the existing `export type { ... } from "../../types/grid";` block:

```ts
  DataGridCardConfig,
  DataGridCardContext,
  DataGridCardView,
  DataGridDisplayMode,
```

- [ ] **Step 3: Type-check**

Run: `npx tsc -b`
Expected: exits 0, no output.

- [ ] **Step 4: Commit**

```bash
git add src/types/grid.ts src/components/DataGrid/index.ts
git commit -m "feat(datagrid): public types for card layout (DataGridCardView/CardConfig/DisplayMode)"
```

### Task 2: `cardComposition.ts` — the pure role-assignment heuristic

**Files:**
- Create: `src/components/DataGrid/cardComposition.ts`
- Test: `src/components/DataGrid/cardComposition.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import type { AnyColumnConfig } from "./cells";
import { composeCardRoles } from "./cardComposition";

type Row = {
  sku: string;
  product: string;
  dept: string;
  status: string;
  revenue: number;
  units: number;
  margin: number;
  discount: number;
  restocked: string;
  active: boolean;
};

const col = (accessorKey: keyof Row & string, dataType: AnyColumnConfig<Row>["dataType"]): AnyColumnConfig<Row> => ({
  accessorKey,
  header: accessorKey,
  dataType,
});

// Visible order matters: sku is the FIRST text column, so it wins title by default.
const columns: AnyColumnConfig<Row>[] = [
  col("sku", "text"),
  col("product", "text"),
  col("dept", "text"),
  col("status", "status"),
  col("revenue", "currency"),
  col("units", "number"),
  col("margin", "percent"),
  col("discount", "percent"),
  col("restocked", "date"),
  col("active", "boolean"),
];

const keys = (list: AnyColumnConfig<Row>[]) => list.map((c) => c.accessorKey);

describe("composeCardRoles heuristic", () => {
  it("assigns title/badge/subtitle/metrics/meta by dataType and visible order", () => {
    const roles = composeCardRoles(columns);
    expect(roles.title?.accessorKey).toBe("sku");
    expect(roles.badge?.accessorKey).toBe("status");
    expect(keys(roles.subtitle)).toEqual(["product", "dept"]);
    // First 3 numerics in visible order; the 4th (discount) overflows to meta.
    expect(keys(roles.metrics)).toEqual(["revenue", "units", "margin"]);
    expect(keys(roles.meta)).toEqual(["discount", "restocked", "active"]);
  });

  it("every visible column lands in exactly one role", () => {
    const roles = composeCardRoles(columns);
    const all = [
      ...(roles.title ? [roles.title] : []),
      ...(roles.badge ? [roles.badge] : []),
      ...roles.subtitle,
      ...roles.metrics,
      ...roles.meta,
    ];
    expect(keys(all).sort()).toEqual(keys(columns).sort());
  });

  it("maxMetrics widens the metric cap", () => {
    const roles = composeCardRoles(columns, { maxMetrics: 4 });
    expect(keys(roles.metrics)).toEqual(["revenue", "units", "margin", "discount"]);
  });

  it("overrides claim their columns; the heuristic fills the rest without double-assigning", () => {
    const roles = composeCardRoles(columns, { title: "product", metrics: ["margin"] });
    expect(roles.title?.accessorKey).toBe("product");
    expect(keys(roles.metrics)).toEqual(["margin"]);
    // sku no longer wins title (product claimed it) — it flows to subtitle.
    expect(keys(roles.subtitle)).toEqual(["sku", "dept"]);
    // Unclaimed numerics overflow to meta, never duplicated.
    expect(keys(roles.meta)).toEqual(expect.arrayContaining(["revenue", "units", "discount"]));
    expect(keys(roles.meta)).not.toContain("margin");
  });

  it("an override naming a hidden/unknown column falls back to the heuristic", () => {
    const roles = composeCardRoles(columns, { title: "nope" as keyof Row & string });
    expect(roles.title?.accessorKey).toBe("sku");
  });

  it("with no text column, the first non-status column becomes the title", () => {
    const numericOnly = [col("status", "status"), col("revenue", "currency"), col("units", "number")];
    const roles = composeCardRoles(numericOnly);
    expect(roles.title?.accessorKey).toBe("revenue");
    expect(roles.badge?.accessorKey).toBe("status");
    expect(keys(roles.metrics)).toEqual(["units"]);
  });

  it("an explicit empty override array suppresses that role (it does not fall back)", () => {
    const roles = composeCardRoles(columns, { subtitle: [] });
    expect(roles.subtitle).toEqual([]);
    // The unclaimed text columns flow to meta instead of vanishing.
    expect(keys(roles.meta)).toEqual(expect.arrayContaining(["product", "dept"]));
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/DataGrid/cardComposition.test.ts`
Expected: FAIL — cannot resolve `./cardComposition`.

- [ ] **Step 3: Implement `src/components/DataGrid/cardComposition.ts`**

```ts
import type { DataGridCardConfig } from "../../types/grid";
import { isNumericDataType, type AnyColumnConfig } from "./cells";

export type CardRoles<TData> = {
  title: AnyColumnConfig<TData> | null;
  badge: AnyColumnConfig<TData> | null;
  subtitle: AnyColumnConfig<TData>[];
  metrics: AnyColumnConfig<TData>[];
  meta: AnyColumnConfig<TData>[];
};

const DEFAULT_MAX_METRICS = 3;
const MAX_SUBTITLE_COLUMNS = 2;

// Assigns every visible leaf column a card role. Overrides claim their columns
// first (an override naming a column the grid can't see is ignored); the
// heuristic fills any role still empty from the remaining columns in visible
// order. Columns never disappear: anything unclaimed lands in `meta`, so the
// card always shows the same fields the table would.
export const composeCardRoles = <TData extends object>(
  columns: AnyColumnConfig<TData>[],
  overrides?: DataGridCardConfig<TData>,
): CardRoles<TData> => {
  const byKey = new Map(columns.map((column) => [column.accessorKey as string, column]));
  const claimed = new Set<string>();

  const claim = (key: string | undefined): AnyColumnConfig<TData> | null => {
    if (!key || claimed.has(key)) return null;
    const column = byKey.get(key);
    if (!column) return null;
    claimed.add(key);
    return column;
  };
  const claimAll = (columnKeys: string[]): AnyColumnConfig<TData>[] =>
    columnKeys
      .map((key) => claim(key))
      .filter((column): column is AnyColumnConfig<TData> => column !== null);
  const remaining = () => columns.filter((column) => !claimed.has(column.accessorKey as string));

  // 1. Overrides claim first, in role order.
  let title = claim(overrides?.title);
  let badge = claim(overrides?.badge);
  const subtitle = claimAll(overrides?.subtitle ?? []);
  const metrics = claimAll(overrides?.metrics ?? []);
  const meta = claimAll(overrides?.meta ?? []);

  // 2. The heuristic fills roles the overrides left empty, visible order.
  if (!title) {
    title =
      claim(remaining().find((column) => column.dataType === "text")?.accessorKey) ??
      claim(remaining().find((column) => column.dataType !== "status")?.accessorKey);
  }
  if (!badge) {
    badge = claim(remaining().find((column) => column.dataType === "status")?.accessorKey);
  }
  if (!overrides?.subtitle) {
    subtitle.push(
      ...claimAll(
        remaining()
          .filter((column) => column.dataType === "text")
          .slice(0, MAX_SUBTITLE_COLUMNS)
          .map((column) => column.accessorKey as string),
      ),
    );
  }
  if (!overrides?.metrics) {
    const cap = overrides?.maxMetrics ?? DEFAULT_MAX_METRICS;
    metrics.push(
      ...claimAll(
        remaining()
          .filter((column) => isNumericDataType(column.dataType))
          .slice(0, cap)
          .map((column) => column.accessorKey as string),
      ),
    );
  }

  // 3. Everything left (dates, booleans, overflow text/numerics) → meta.
  meta.push(...claimAll(remaining().map((column) => column.accessorKey as string)));

  return { title, badge, subtitle, metrics, meta };
};
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/components/DataGrid/cardComposition.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/DataGrid/cardComposition.ts src/components/DataGrid/cardComposition.test.ts
git commit -m "feat(datagrid): pure card-role composition heuristic"
```

### Task 3: `useContainerWidth.ts` — container-driven detection

**Files:**
- Create: `src/components/DataGrid/useContainerWidth.ts`
- Test: `src/components/DataGrid/useContainerWidth.test.ts`

- [ ] **Step 1: Write the failing tests**

jsdom has no `ResizeObserver`; the tests install a controllable stub.

```ts
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRef } from "react";
import { useContainerWidth } from "./useContainerWidth";

type ObserverCallback = (entries: { contentRect: { width: number } }[]) => void;

let observerCallback: ObserverCallback | null = null;
const observe = vi.fn();
const disconnect = vi.fn();

class ResizeObserverStub {
  constructor(callback: ObserverCallback) {
    observerCallback = callback;
  }
  observe = observe;
  disconnect = disconnect;
}

const withElementRef = (width: number) => {
  const element = document.createElement("div");
  element.getBoundingClientRect = () => ({ width } as DOMRect);
  return renderHook(
    ({ enabled }: { enabled: boolean }) => {
      const ref = useRef<HTMLElement | null>(element);
      return useContainerWidth(ref, enabled);
    },
    { initialProps: { enabled: true } },
  );
};

afterEach(() => {
  vi.unstubAllGlobals();
  observerCallback = null;
  observe.mockClear();
  disconnect.mockClear();
});

describe("useContainerWidth", () => {
  it("measures on mount and tracks ResizeObserver updates", () => {
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    const { result } = withElementRef(800);
    expect(result.current).toBe(800);
    expect(observe).toHaveBeenCalledTimes(1);
    act(() => observerCallback?.([{ contentRect: { width: 480 } }]));
    expect(result.current).toBe(480);
  });

  it("returns null when disabled", () => {
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    const { result, rerender } = withElementRef(800);
    rerender({ enabled: false });
    expect(result.current).toBeNull();
  });

  it("without ResizeObserver (jsdom/SSR-adjacent), still measures once on mount", () => {
    // No stub installed — exercises the typeof ResizeObserver === "undefined" guard.
    const { result } = withElementRef(500);
    expect(result.current).toBe(500);
  });

  it("disconnects the observer on unmount", () => {
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    const { unmount } = withElementRef(800);
    unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/DataGrid/useContainerWidth.test.ts`
Expected: FAIL — cannot resolve `./useContainerWidth`.

- [ ] **Step 3: Implement `src/components/DataGrid/useContainerWidth.ts`**

```ts
import { useEffect, useState, type RefObject } from "react";

// Observes the grid root's OWN width (not the viewport) so an embedded grid —
// split pane, dashboard tile — responds to the space it actually has. Returns
// null until the first measure; callers treat null as "table" so SSR and first
// paint never flash card mode. Guards both `window` (SSR) and `ResizeObserver`
// (jsdom): with no observer available it measures once on mount, which is
// enough for tests that pin the mode and environments that never resize.
export const useContainerWidth = (
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
): number | null => {
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return;
    }
    const element = ref.current;
    if (!element) {
      return;
    }
    setWidth(element.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setWidth(entry.contentRect.width);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, enabled]);

  return enabled ? width : null;
};
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/components/DataGrid/useContainerWidth.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/DataGrid/useContainerWidth.ts src/components/DataGrid/useContainerWidth.test.ts
git commit -m "feat(datagrid): useContainerWidth hook for container-driven card mode"
```

---

## Chunk 2: UI primitives (BottomSheet, ToolbarCompact)

### Task 4: `BottomSheet.tsx` — the touch-native dialog primitive

**Files:**
- Create: `src/components/DataGrid/BottomSheet.tsx`
- Test: `src/components/DataGrid/BottomSheet.test.tsx`
- Modify: `src/index.css` (append) and `src/styles.css` (append) — keyframes live in **both**, per the flash precedent

- [ ] **Step 1: Write the failing tests**

```tsx
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BottomSheet } from "./BottomSheet";

afterEach(cleanup);

describe("BottomSheet", () => {
  it("renders nothing when closed", () => {
    render(
      <BottomSheet open={false} label="Sort by" onClose={() => {}}>
        <p>Body</p>
      </BottomSheet>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders a modal dialog and moves focus into it when open", () => {
    render(
      <BottomSheet open label="Sort by" onClose={() => {}}>
        <button type="button">Body action</button>
      </BottomSheet>,
    );
    const dialog = screen.getByRole("dialog", { name: "Sort by" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveFocus();
  });

  it("Escape closes and does not bubble to document listeners", () => {
    const onClose = vi.fn();
    const documentEscape = vi.fn();
    document.addEventListener("keydown", documentEscape);
    render(
      <BottomSheet open label="Filters" onClose={onClose}>
        <p>Body</p>
      </BottomSheet>,
    );
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(documentEscape).not.toHaveBeenCalled();
    document.removeEventListener("keydown", documentEscape);
  });

  it("backdrop click closes", () => {
    const onClose = vi.fn();
    const { container } = render(
      <BottomSheet open label="Filters" onClose={onClose}>
        <p>Body</p>
      </BottomSheet>,
    );
    fireEvent.click(container.querySelector("[data-sheet-backdrop]")!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("returns focus to the opener and restores body scroll on close", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const { rerender } = render(
      <BottomSheet open label="Sort by" onClose={() => {}}>
        <p>Body</p>
      </BottomSheet>,
    );
    expect(document.body.style.overflow).toBe("hidden");
    rerender(
      <BottomSheet open={false} label="Sort by" onClose={() => {}}>
        <p>Body</p>
      </BottomSheet>,
    );
    expect(document.body.style.overflow).toBe("");
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it("Tab wraps focus inside the sheet", () => {
    render(
      <BottomSheet open label="Filters" onClose={() => {}}>
        <button type="button">First</button>
        <button type="button">Last</button>
      </BottomSheet>,
    );
    const last = screen.getByRole("button", { name: "Last" });
    last.focus();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab" });
    expect(screen.getByRole("button", { name: "First" })).toHaveFocus();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/DataGrid/BottomSheet.test.tsx`
Expected: FAIL — cannot resolve `./BottomSheet`.

- [ ] **Step 3: Implement `src/components/DataGrid/BottomSheet.tsx`**

```tsx
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";

// Touch-native modal panel fixed to the bottom of the BROWSER viewport (it
// escapes the grid container by design), used in card mode for the sort sheet,
// the filters sheet, and the detail panel.
// Dialog semantics: focus moves in on open, Tab wraps inside, Escape/backdrop
// dismiss, and focus returns to the opener on close. Escape stops propagation
// so the grid's document-level Escape listener (detail panel) never fires for
// the same keypress.
type BottomSheetProps = {
  open: boolean;
  label: string;
  onClose: () => void;
  children: ReactNode;
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function BottomSheet({ open, label, onClose, children }: BottomSheetProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open || typeof document === "undefined") {
      return;
    }
    openerRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      openerRef.current?.focus();
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    const panel = panelRef.current;
    if (!panel) {
      return;
    }
    const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (focusables.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-40">
      <div
        aria-hidden="true"
        data-sheet-backdrop
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="dg-sheet absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t border-slate-200 bg-white p-4 shadow-2xl focus:outline-none"
      >
        <div aria-hidden="true" className="mx-auto mb-3 h-1 w-9 rounded-full bg-slate-300" />
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Append the animation CSS to BOTH `src/index.css` and `src/styles.css`**

The `dg-` prefix matches the existing keyframe convention in both files (`dg-flash-up-kf` etc.).

```css
/* Card-mode bottom sheet (BottomSheet.tsx). Mirrored in the other stylesheet
   so the demo and the packaged datagrid.css stay in lockstep. */
@keyframes dg-sheet-in {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

.dg-sheet {
  animation: dg-sheet-in 200ms ease-out;
}

@media (prefers-reduced-motion: reduce) {
  .dg-sheet {
    animation: none;
  }
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/components/DataGrid/BottomSheet.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/DataGrid/BottomSheet.tsx src/components/DataGrid/BottomSheet.test.tsx src/index.css src/styles.css
git commit -m "feat(datagrid): BottomSheet primitive for card-mode chrome"
```

### Task 5: `ToolbarCompact.tsx` — search + chips + sheets

**Files:**
- Create: `src/components/DataGrid/ToolbarCompact.tsx`
- Test: `src/components/DataGrid/ToolbarCompact.test.tsx`

Reuses `ToolbarSearch` (same props as desktop), `FilterBody` from `filterBodies.tsx`, and `isFilterActive` from `filters.tsx`. Note: each `FilterBody` gets a **no-op** `onClose` — in a multi-filter sheet, applying one filter must not dismiss the sheet; the Done button closes it.

- [ ] **Step 1: Write the failing tests**

```tsx
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GridFilter } from "./filters";
import { ToolbarCompact, type CompactSortColumn } from "./ToolbarCompact";

afterEach(cleanup);

const sortColumns: CompactSortColumn[] = [
  { id: "product", label: "Product", direction: false },
  { id: "revenue", label: "Revenue", direction: "desc" },
];

const deptFilter: GridFilter = {
  id: "dept",
  label: "Dept",
  filterType: "multiSelect",
  value: ["Grocery"],
  options: ["Grocery", "Home"],
  onChange: vi.fn(),
};

const baseProps = {
  search: "",
  searchPlaceholder: "Search rows...",
  enableGlobalSearch: true,
  onSearchChange: vi.fn(),
  enableSorting: true,
  sortColumns,
  onSortColumn: vi.fn(),
  onClearSort: vi.fn(),
  filters: [deptFilter],
  onClearFilters: vi.fn(),
};

describe("ToolbarCompact", () => {
  it("renders search plus Sort and Filters chips with active summaries", () => {
    render(<ToolbarCompact {...baseProps} />);
    expect(screen.getByPlaceholderText("Search rows...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sort: Revenue/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filters (1)" })).toBeInTheDocument();
  });

  it("sort sheet lists sortable columns; tapping one calls onSortColumn and stays open", () => {
    render(<ToolbarCompact {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Sort: Revenue/ }));
    const dialog = screen.getByRole("dialog", { name: "Sort by" });
    fireEvent.click(screen.getByRole("button", { name: /^Product/ }));
    expect(baseProps.onSortColumn).toHaveBeenCalledWith("product");
    expect(dialog).toBeInTheDocument();
  });

  it("sort sheet offers Clear sort when a sort is active", () => {
    render(<ToolbarCompact {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Sort: Revenue/ }));
    fireEvent.click(screen.getByRole("button", { name: "Clear sort" }));
    expect(baseProps.onClearSort).toHaveBeenCalledTimes(1);
  });

  it("filters sheet renders one labeled control body per filter and a Clear all", () => {
    render(<ToolbarCompact {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Filters (1)" }));
    const dialog = screen.getByRole("dialog", { name: "Filters" });
    expect(dialog).toHaveTextContent("Dept");
    // The multiSelect body renders its options as labeled checkboxes.
    expect(screen.getByRole("checkbox", { name: "Grocery" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Clear all filters" }));
    expect(baseProps.onClearFilters).toHaveBeenCalledTimes(1);
  });

  it("Done closes the filters sheet", () => {
    render(<ToolbarCompact {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Filters (1)" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("hides chips with nothing to show", () => {
    render(
      <ToolbarCompact
        {...baseProps}
        enableSorting={false}
        filters={[]}
      />,
    );
    expect(screen.queryByRole("button", { name: /Sort/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Filters/ })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/DataGrid/ToolbarCompact.test.tsx`
Expected: FAIL — cannot resolve `./ToolbarCompact`.

- [ ] **Step 3: Implement `src/components/DataGrid/ToolbarCompact.tsx`**

```tsx
import { useState } from "react";
import { BottomSheet } from "./BottomSheet";
import { FilterBody } from "./filterBodies";
import { isFilterActive, type GridFilter } from "./filters";
import { ToolbarSearch } from "./ToolbarSearch";

export type CompactSortColumn = {
  id: string;
  label: string;
  direction: false | "asc" | "desc";
};

// Card-mode toolbar: search + two chips opening bottom sheets. A presentation
// swap over the same state slices the desktop chrome writes — the sort sheet
// emits `sorting`, the filter bodies emit `columnFilters` via GridFilter.onChange.
type ToolbarCompactProps = {
  search: string;
  searchPlaceholder: string;
  enableGlobalSearch: boolean;
  onSearchChange: (value: string) => void;
  enableSorting: boolean;
  sortColumns: CompactSortColumn[];
  onSortColumn: (columnId: string) => void;
  onClearSort: () => void;
  filters: GridFilter[];
  onClearFilters: () => void;
};

// h-11 = 44px: spec §4 mandates ≥44px touch targets for all new card-mode UI.
const chipClass = (active: boolean) =>
  `h-11 rounded-full border px-4 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 ${
    active
      ? "border-slate-900 bg-slate-900 text-white"
      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
  }`;

const directionMarker = (direction: false | "asc" | "desc") =>
  direction === "asc" ? "↑" : direction === "desc" ? "↓" : "";

export function ToolbarCompact({
  search,
  searchPlaceholder,
  enableGlobalSearch,
  onSearchChange,
  enableSorting,
  sortColumns,
  onSortColumn,
  onClearSort,
  filters,
  onClearFilters,
}: ToolbarCompactProps) {
  const [openSheet, setOpenSheet] = useState<null | "sort" | "filters">(null);
  const activeSort = sortColumns.find((column) => column.direction !== false);
  const activeFilterCount = filters.filter(isFilterActive).length;
  const showSortChip = enableSorting && sortColumns.length > 0;
  const showFiltersChip = filters.length > 0;

  if (!enableGlobalSearch && !showSortChip && !showFiltersChip) {
    return null;
  }

  return (
    <div className="border-b border-slate-200 bg-white px-3 py-3">
      {enableGlobalSearch ? (
        <ToolbarSearch
          search={search}
          searchPlaceholder={searchPlaceholder}
          onSearchChange={onSearchChange}
        />
      ) : null}

      {showSortChip || showFiltersChip ? (
        <div className={`${enableGlobalSearch ? "mt-2 " : ""}flex flex-wrap items-center gap-2`}>
          {showSortChip ? (
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => setOpenSheet("sort")}
              className={chipClass(Boolean(activeSort))}
            >
              {activeSort ? (
                <>
                  {`Sort: ${activeSort.label}`}{" "}
                  <span aria-hidden="true">{directionMarker(activeSort.direction)}</span>
                </>
              ) : (
                "Sort"
              )}
            </button>
          ) : null}
          {showFiltersChip ? (
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => setOpenSheet("filters")}
              className={chipClass(activeFilterCount > 0)}
            >
              {activeFilterCount > 0 ? `Filters (${activeFilterCount})` : "Filters"}
            </button>
          ) : null}
        </div>
      ) : null}

      <BottomSheet open={openSheet === "sort"} label="Sort by" onClose={() => setOpenSheet(null)}>
        <div className="flex flex-col">
          {sortColumns.map((column) => (
            <button
              key={column.id}
              type="button"
              onClick={() => onSortColumn(column.id)}
              className="flex min-h-11 items-center justify-between border-b border-slate-100 px-1 text-left text-sm text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
            >
              <span className={column.direction ? "font-semibold" : undefined}>{column.label}</span>
              <span aria-hidden="true" className="text-slate-500">
                {directionMarker(column.direction)}
              </span>
            </button>
          ))}
          {activeSort ? (
            <button
              type="button"
              onClick={onClearSort}
              className="mt-3 h-11 rounded-md border border-slate-300 bg-slate-50 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
            >
              Clear sort
            </button>
          ) : null}
        </div>
      </BottomSheet>

      <BottomSheet open={openSheet === "filters"} label="Filters" onClose={() => setOpenSheet(null)}>
        <div className="flex flex-col gap-4">
          {filters.map((filter) => (
            // FilterBody renders its own label header + per-filter Clear, so no
            // extra label chrome here. No-op onClose: applying one filter must
            // not dismiss the sheet — the Done button closes it.
            <div key={filter.id}>
              <FilterBody filter={filter} onClose={() => {}} />
            </div>
          ))}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClearFilters}
              className="h-11 flex-1 rounded-md border border-slate-300 bg-slate-50 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
            >
              Clear all filters
            </button>
            <button
              type="button"
              onClick={() => setOpenSheet(null)}
              className="h-11 flex-1 rounded-md bg-slate-900 text-xs font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              Done
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/components/DataGrid/ToolbarCompact.test.tsx`
Expected: PASS (6 tests). If the `FilterBody` multiSelect checkbox names differ (formatted labels), adjust the assertion to the actual accessible name rather than changing `FilterBody`.

- [ ] **Step 5: Commit**

```bash
git add src/components/DataGrid/ToolbarCompact.tsx src/components/DataGrid/ToolbarCompact.test.tsx
git commit -m "feat(datagrid): compact card-mode toolbar with sort/filter bottom sheets"
```

---

## Chunk 3: Engine wiring (flag, mode resolution, CardList, chrome swap)

### Task 6: `cardLayout` flag + display-mode resolution + `CardList` render swap

**Files:**
- Create: `src/components/DataGrid/CardList.tsx`
- Modify: `src/components/DataGrid/DataGrid.tsx` — features type (~line 127), `defaultFeatures` (~line 372), props type (~line 275) + destructure (~line 473), phase 1 (~line 706–729), virtualizer (~line 2151), phase 8/9 derived data (~line 2143–2168), render (~line 3310, 3448–3475)
- Test: `src/components/DataGrid/DataGrid.cards.test.tsx` (new)

- [ ] **Step 1: Write the failing integration tests**

```tsx
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataGrid, type DataGridProps } from "./DataGrid";
import type { GridColumnConfig } from "../../types/grid";

type Item = {
  product: string;
  dept: string;
  status: string;
  revenue: number;
  units: number;
  margin: number;
  restocked: string;
};

const rows: Item[] = [
  { product: "Almond Butter", dept: "Grocery", status: "approved", revenue: 1200, units: 24, margin: 0.31, restocked: "2026-06-12" },
  { product: "Apples", dept: "Grocery", status: "pending", revenue: 900, units: 42, margin: 0.22, restocked: "2026-06-20" },
  { product: "Shelf Bin", dept: "Home", status: "approved", revenue: 700, units: 18, margin: 0.4, restocked: "2026-05-30" },
  { product: "Lamp", dept: "Home", status: "rejected", revenue: 500, units: 12, margin: 0.18, restocked: "2026-06-02" },
];

const columns: GridColumnConfig<Item>[] = [
  { accessorKey: "product", header: "Product", dataType: "text" },
  { accessorKey: "dept", header: "Dept", dataType: "text" },
  { accessorKey: "status", header: "Status", dataType: "status" },
  { accessorKey: "revenue", header: "Revenue", dataType: "currency" },
  { accessorKey: "units", header: "Units", dataType: "number" },
  { accessorKey: "margin", header: "Margin", dataType: "percent" },
  { accessorKey: "restocked", header: "Restocked", dataType: "date" },
];

const renderCards = ({ features, cardView, ...rest }: Partial<DataGridProps<Item>> = {}) =>
  render(
    <DataGrid
      data={rows}
      columns={columns}
      getRowId={(row) => row.product}
      {...rest}
      features={{ cardLayout: true, ...features }}
      cardView={{ mode: "cards", ...cardView }}
    />,
  );

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("DataGrid card mode: render swap", () => {
  it("renders a card list instead of a table when pinned to cards", () => {
    renderCards();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });

  it("composes cards from column metadata: title, status pill, ≤3 metrics, meta footer", () => {
    renderCards();
    const card = screen.getAllByRole("listitem")[0];
    expect(within(card).getByText("Almond Butter")).toBeInTheDocument();
    // status renders through the shared pill path (formatStatusLabel → "Approved").
    expect(within(card).getByText("Approved")).toBeInTheDocument();
    // metric labels come from column headers; restocked (date) overflows to meta.
    expect(within(card).getByText("Revenue")).toBeInTheDocument();
    expect(within(card).getByText("$1,200.00")).toBeInTheDocument();
    expect(within(card).getByText(/Restocked:/)).toBeInTheDocument();
  });

  it("cardView.card overrides a role while the heuristic fills the rest", () => {
    renderCards({ cardView: { mode: "cards", card: { title: "dept" } } });
    const card = screen.getAllByRole("listitem")[0];
    expect(within(card).getByText("Grocery")).toBeInTheDocument();
  });

  it("stays a table when features.cardLayout is off", () => {
    render(
      <DataGrid data={rows} columns={columns} getRowId={(r) => r.product} cardView={{ mode: "cards" }} />,
    );
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("pivot layout ignores card mode", () => {
    render(
      <DataGrid
        data={rows}
        columns={columns}
        getRowId={(r) => r.product}
        layoutMode="pivot"
        defaultGrouping={["dept"]}
        features={{ cardLayout: true }}
        cardView={{ mode: "cards" }}
      />,
    );
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("auto mode in jsdom measures width 0 and flips to cards (pin mode:'table' to opt out)", () => {
    render(
      <DataGrid
        data={rows}
        columns={columns}
        getRowId={(r) => r.product}
        features={{ cardLayout: true }}
        cardView={{ mode: "auto" }}
      />,
    );
    // jsdom: getBoundingClientRect().width === 0 < 640 would flip to cards, BUT
    // the width IS measured (0), so this asserts the real jsdom behavior:
    // auto mode measures 0 → cards. Pin mode:"table" to keep a table in jsdom.
    // We assert the deterministic outcome so the suite catches accidental changes.
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("card-mode feature defaults: no selection checkboxes, no Export button; summaries stay", () => {
    renderCards({
      summaryItems: [
        { id: "count", label: "Items", value: ({ filteredRows }) => filteredRows.length },
      ],
    });
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Export CSV" })).not.toBeInTheDocument();
    expect(screen.getByText("Items")).toBeInTheDocument();
  });

  it("tapping a card toggles the active row", () => {
    const onActiveRowChange = vi.fn();
    renderCards({
      onActiveRowChange,
      renderDetailPanel: (row) => (row ? <div>Detail: {row.product}</div> : null),
    });
    fireEvent.click(within(screen.getAllByRole("listitem")[0]).getByRole("button"));
    expect(onActiveRowChange).toHaveBeenCalledWith(rows[0]);
  });
});
```

Note the `auto mode` test pins down real jsdom behavior (width 0 → cards): the SSR guarantee is "no cards before first measure", and jsdom *does* measure (0px) on mount. The test documents this so nobody "fixes" it blind; consumers and tests that need a table in a zero-width environment pin `mode: "table"`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/DataGrid/DataGrid.cards.test.tsx`
Expected: FAIL — `cardLayout`/`cardView` don't exist yet.

- [ ] **Step 3: Add the feature flag and prop plumbing in `DataGrid.tsx`**

3a. In `DataGridFeatures` (after `collapsibleToolbar: boolean;`, ~line 175):

```ts
  /**
   * Card layout below `cardView.breakpoint` container width (grid layout
   * only; pivot ignores it). Inert without this flag even if `cardView` is
   * passed. Default false.
   */
  cardLayout: boolean;
```

3b. In `defaultFeatures` (~line 398): `cardLayout: false,`

3c. Imports at top of `DataGrid.tsx`:

```ts
import type { DataGridCardView, DataGridDisplayMode } from "../../types/grid";
import { composeCardRoles } from "./cardComposition";
import { CardList } from "./CardList";
import { ToolbarCompact, type CompactSortColumn } from "./ToolbarCompact";
import { BottomSheet } from "./BottomSheet";
import { useContainerWidth } from "./useContainerWidth";
```

3d. In `DataGridProps` (after `pivot?: DataGridPivotConfig<TData>;`):

```ts
  /** Card-mode configuration; inert unless `features.cardLayout` is on. */
  cardView?: DataGridCardView<TData>;
```

and `cardView,` in the destructure (after `pivot: pivotConfig,`).

3e. Replace the single features merge (~lines 719–724) with the two-step merge — the card-mode defaults depend on `cardLayout`, which the base merge resolves first:

```ts
  const baseFeatures = {
    ...defaultFeatures,
    ...layoutFeatureDefaults,
    ...dataModeFeatureDefaults,
    ...featureOverrides,
  };
  const rootRef = useRef<HTMLDivElement | null>(null);
  const cardModeCandidate = baseFeatures.cardLayout && !isPivotLayout;
  const cardViewMode = cardView?.mode ?? "auto";
  const containerWidth = useContainerWidth(
    rootRef,
    cardModeCandidate && cardViewMode === "auto",
  );
  const displayMode: DataGridDisplayMode = !cardModeCandidate
    ? "table"
    : cardViewMode === "auto"
      ? containerWidth != null && containerWidth < (cardView?.breakpoint ?? 640)
        ? "cards"
        : "table"
      : cardViewMode;
  const isCardMode = displayMode === "cards";
  // Card mode drops the desktop-only chrome. headerFilters stays ON — it feeds
  // resolvedFilters, which the Filters sheet renders. Consumer overrides win.
  const cardModeFeatureDefaults: Partial<DataGridFeatures> = isCardMode
    ? {
        editing: false,
        cellSelection: false,
        fillHandle: false,
        clipboard: false,
        rowSelection: false,
        export: false,
        grouping: false,
        savedViews: false,
        columnResizing: false,
        floatingFilters: false,
        rowActions: false,
      }
    : {};
  const features = {
    ...baseFeatures,
    ...cardModeFeatureDefaults,
    ...featureOverrides,
  };
```

3f. `onDisplayModeChange` — after the block above:

```ts
  const onDisplayModeChangeRef = useRef(cardView?.onDisplayModeChange);
  useEffect(() => {
    onDisplayModeChangeRef.current = cardView?.onDisplayModeChange;
  });
  const previousDisplayModeRef = useRef(displayMode);
  useEffect(() => {
    if (previousDisplayModeRef.current !== displayMode) {
      previousDisplayModeRef.current = displayMode;
      onDisplayModeChangeRef.current?.(displayMode);
    }
  }, [displayMode]);
```

3g. Card rows, immediately after the `visibleRows` declaration (~line 2149) and BEFORE `rowVirtualizer` — the virtualizer's `count` needs it:

```ts
  // Card layout renders leaf rows only (grouping defaults off in card mode,
  // but a consumer can force it back on — group rows are filtered, not shown).
  // Grid layout only (pivot never reaches card mode), so originals are TData.
  const cardRows = isCardMode
    ? (visibleRows.filter((row) => !row.getIsGrouped()) as unknown as Row<TData>[])
    : [];
```

3h. Virtualizer (~line 2151): the count must match what CardList actually indexes, and cards are taller than rows —

```ts
    count: isCardMode ? cardRows.length : visibleRows.length,
    estimateSize: () => (isCardMode ? Math.max(resolvedEstimatedRowHeight, 96) : resolvedEstimatedRowHeight),
```

3i. Card roles, after `const visibleLeafColumns = table.getVisibleLeafColumns();` (~line 2168):

```ts
  // Card composition follows the CURRENT visible leaf set, so column
  // visibility/order changes keep applying in card mode.
  const cardRoles = useMemo(
    () =>
      composeCardRoles(
        visibleLeafColumns
          .map((column) => columnsById.get(column.id))
          .filter((column): column is AnyColumnConfig<TData> => Boolean(column)),
        cardView?.card,
      ),
    [visibleLeafColumns, columnsById, cardView?.card],
  );
```

- [ ] **Step 4: Implement `src/components/DataGrid/CardList.tsx`**

```tsx
import type { Row } from "@tanstack/react-table";
import type { Virtualizer } from "@tanstack/react-virtual";
import type { ReactNode } from "react";
import type { DataGridCardConfig } from "../../types/grid";
import type { FormatOptions } from "../../utils/formatters";
import type { CardRoles } from "./cardComposition";
import { getColumnSearchText, renderCellValue, type AnyColumnConfig } from "./cells";

// Card-mode render path. Rows come from the SAME table instance as the grid —
// sorting/filter/pagination state is untouched; only presentation changes.
// List semantics (not ARIA grid): each card is one focusable element.
type CardListProps<TData extends object> = {
  rows: Row<TData>[];
  roles: CardRoles<TData>;
  card?: DataGridCardConfig<TData>;
  formatOptions: FormatOptions;
  activeRow: TData | null;
  hasRowAction: boolean;
  onCardClick: (row: TData) => void;
  getRowClassName?: (row: TData) => string;
  virtualizeRows: boolean;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  label?: string;
};

const plainText = <TData extends object>(
  column: AnyColumnConfig<TData>,
  row: TData,
  formatOptions: FormatOptions,
): string =>
  getColumnSearchText(column, row[column.accessorKey as keyof TData], row, formatOptions);

function CardBody<TData extends object>({
  row,
  roles,
  formatOptions,
}: {
  row: TData;
  roles: CardRoles<TData>;
  formatOptions: FormatOptions;
}) {
  const subtitleText = roles.subtitle
    .map((column) => plainText(column, row, formatOptions))
    .filter(Boolean)
    .join(" · ");
  const metaText = roles.meta
    .map((column) => {
      const text = plainText(column, row, formatOptions);
      return text ? `${column.header}: ${text}` : "";
    })
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-semibold text-slate-900">
          {roles.title
            ? renderCellValue(
                roles.title,
                row[roles.title.accessorKey as keyof TData],
                row,
                formatOptions,
              )
            : null}
        </span>
        {roles.badge
          ? renderCellValue(
              roles.badge,
              row[roles.badge.accessorKey as keyof TData],
              row,
              formatOptions,
            )
          : null}
      </div>
      {subtitleText ? (
        <div className="mt-0.5 truncate text-xs text-slate-500">{subtitleText}</div>
      ) : null}
      {roles.metrics.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
          {roles.metrics.map((column) => (
            <div key={column.accessorKey as string} className="min-w-0">
              <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                {column.header}
              </div>
              <div className="text-sm font-semibold tabular-nums text-slate-900">
                {renderCellValue(
                  column,
                  row[column.accessorKey as keyof TData],
                  row,
                  formatOptions,
                )}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {metaText ? (
        <div className="mt-2 truncate text-[11px] text-slate-400">{metaText}</div>
      ) : null}
    </>
  );
}

export function CardList<TData extends object>({
  rows,
  roles,
  card,
  formatOptions,
  activeRow,
  hasRowAction,
  onCardClick,
  getRowClassName,
  virtualizeRows,
  virtualizer,
  label,
}: CardListProps<TData>) {
  const renderCard = (row: Row<TData>, index: number, measureRef?: (el: Element | null) => void): ReactNode => {
    const isActive = activeRow === row.original;
    const content = card?.renderCard ? (
      card.renderCard(row.original, { isActive })
    ) : (
      <CardBody row={row.original} roles={roles} formatOptions={formatOptions} />
    );
    const cardClass = `block w-full rounded-lg border bg-white p-3 text-left shadow-sm transition ${
      isActive ? "border-slate-400 ring-2 ring-inset ring-slate-400" : "border-slate-200"
    } ${getRowClassName?.(row.original) ?? ""}`;
    return (
      <li key={row.id} data-index={index} ref={measureRef}>
        {hasRowAction ? (
          <button
            type="button"
            onClick={() => onCardClick(row.original)}
            aria-expanded={isActive}
            className={`${cardClass} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400`}
          >
            {content}
          </button>
        ) : (
          <div className={cardClass}>{content}</div>
        )}
      </li>
    );
  };

  let items: ReactNode;
  if (virtualizeRows) {
    const virtualItems = virtualizer.getVirtualItems();
    const totalSize = virtualizer.getTotalSize();
    const topSpacer = virtualItems.length > 0 ? virtualItems[0].start : 0;
    const bottomSpacer =
      virtualItems.length > 0 ? totalSize - virtualItems[virtualItems.length - 1].end : 0;
    items = (
      <>
        {topSpacer > 0 ? <li aria-hidden="true" style={{ height: topSpacer }} /> : null}
        {virtualItems.map((virtualItem) => {
          const row = rows[virtualItem.index];
          return row ? renderCard(row, virtualItem.index, virtualizer.measureElement) : null;
        })}
        {bottomSpacer > 0 ? <li aria-hidden="true" style={{ height: bottomSpacer }} /> : null}
      </>
    );
  } else {
    items = rows.map((row, index) => renderCard(row, index));
  }

  return (
    <ul role="list" aria-label={label} className="flex flex-col gap-2 p-3">
      {items}
    </ul>
  );
}
```

- [ ] **Step 5: Swap the render paths in `DataGrid.tsx` phase 11**

5a. Root div (~line 3311) gets the ref: `<div ref={rootRef} className="flex min-h-0 flex-1 ...">`.

5b. Body swap: inside the scroll container (~line 3458–3463), wrap the `<table>`:

```tsx
          <div
            ref={scrollRef}
            onScroll={(event) => setHorizontalScrollLeft(event.currentTarget.scrollLeft)}
            className="h-[min(68dvh,640px)] min-h-72 overflow-auto md:h-auto md:min-h-0 md:flex-1"
          >
          {isCardMode ? (
            <CardList
              rows={cardRows}
              roles={cardRoles}
              card={cardView?.card}
              formatOptions={formatOptions}
              activeRow={activeRow}
              hasRowAction={hasLeafRowAction}
              onCardClick={handleRowClick}
              getRowClassName={getRowClassName}
              virtualizeRows={virtualizeRows}
              virtualizer={rowVirtualizer}
              label={tableLabel}
            />
          ) : (
          <table
            ...existing table unchanged, through `</table>`...
          )}
          </div>
```

(The `aria-rowcount`/`aria-colcount` attributes stay on the `<table>` branch only — card mode uses list semantics.)

- [ ] **Step 6: Run the new tests + the full suite (regression guard)**

Run: `npx vitest run src/components/DataGrid/DataGrid.cards.test.tsx`
Expected: PASS (8 tests). The toolbar-swap assertions come in Task 7 — if a test written above fails only on toolbar chrome, defer that single assertion to Task 7 rather than reordering.

Run: `npm test`
Expected: all existing suites still PASS (table path untouched when the flag is off).

- [ ] **Step 7: Type-check and commit**

Run: `npx tsc -b` — exits 0.

```bash
git add src/components/DataGrid/CardList.tsx src/components/DataGrid/DataGrid.tsx src/components/DataGrid/DataGrid.cards.test.tsx
git commit -m "feat(datagrid): cardLayout flag, container-driven display mode, CardList render path"
```

### Task 7: Compact toolbar wiring + condensed summary strip

**Files:**
- Modify: `src/components/DataGrid/DataGrid.tsx` — toolbar JSX (~line 3313–3363), summaries JSX (~line 3415–3446), plus a `handleCompactSort` helper and `compactSortColumns` memo near the other derived data (~line 2168+)
- Test: `src/components/DataGrid/DataGrid.cards.test.tsx` (extend)

- [ ] **Step 1: Write the failing tests (append to `DataGrid.cards.test.tsx`)**

```tsx
describe("DataGrid card mode: chrome", () => {
  it("replaces the desktop toolbar with search + Sort/Filters chips", () => {
    renderCards();
    expect(screen.getByPlaceholderText("Search rows...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sort" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filters" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View controls" })).not.toBeInTheDocument();
  });

  it("sort sheet cycles asc → desc → clear on the same column and reorders cards", () => {
    renderCards();
    fireEvent.click(screen.getByRole("button", { name: "Sort" }));
    fireEvent.click(screen.getByRole("button", { name: "Revenue" }));
    // asc: lowest revenue first
    let cards = screen.getAllByRole("listitem");
    expect(within(cards[0]).getByText("Lamp")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Revenue" }));
    // desc: highest revenue first
    cards = screen.getAllByRole("listitem");
    expect(within(cards[0]).getByText("Almond Butter")).toBeInTheDocument();
    // third tap clears: the chip label (aria-hidden arrow excluded) reverts to
    // plain "Sort" — data order happens to equal desc order, so assert the chip.
    fireEvent.click(screen.getByRole("button", { name: "Revenue" }));
    expect(screen.getByRole("button", { name: "Sort" })).toBeInTheDocument();
  });

  it("filters sheet writes columnFilters: facet a value, cards filter, chip counts", () => {
    renderCards();
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    // dept is low-cardinality text → auto-faceted multiSelect checkboxes.
    fireEvent.click(screen.getByRole("checkbox", { name: "Grocery" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Filters (1)" })).toBeInTheDocument();
  });

  it("summaries condense to a horizontal strip in card mode", () => {
    renderCards({
      summaryItems: [
        { id: "count", label: "Items", value: ({ filteredRows }) => filteredRows.length },
      ],
    });
    // The desktop summary header ("Summary" + scope) is not rendered.
    expect(screen.queryByText("Summary")).not.toBeInTheDocument();
    expect(screen.getByText("Items")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });
});
```

Sort-sheet rows are plain buttons whose accessible name is the column label (the ↑/↓ marker span is `aria-hidden`), so `getByRole("button", { name: "Revenue" })` is unambiguous — the active chip's name is "Sort: Revenue". As in Task 5: if the multiSelect checkbox accessible names turn out to be formatted labels rather than raw values, adjust the assertion — do not change `FilterBody`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/DataGrid/DataGrid.cards.test.tsx`
Expected: new tests FAIL (desktop toolbar still renders in card mode).

- [ ] **Step 3: Add the sort wiring in `DataGrid.tsx`** (near `cardRoles`, after `visibleLeafColumns`)

```ts
  const compactSortColumns = useMemo<CompactSortColumn[]>(
    () =>
      visibleLeafColumns
        .filter(
          (column) =>
            column.id !== SELECT_COLUMN_ID &&
            column.id !== ROW_ACTIONS_COLUMN_ID &&
            column.getCanSort(),
        )
        .map((column) => ({
          id: column.id,
          label: getColumnControlLabel(column),
          direction: column.getIsSorted(),
        })),
    // currentSorting is what actually changes getIsSorted()'s answer.
    [visibleLeafColumns, currentSorting],
  );
  // Single-column cycle: tap a new column → asc; same column → desc; again → clear.
  const handleCompactSort = (columnId: string) => {
    const current = currentSorting[0];
    if (current?.id !== columnId) {
      emitSortingChangeWithServerReset([{ id: columnId, desc: false }]);
    } else if (!current.desc) {
      emitSortingChangeWithServerReset([{ id: columnId, desc: true }]);
    } else {
      emitSortingChangeWithServerReset([]);
    }
  };
```

- [ ] **Step 4: Swap the toolbar in the JSX (~line 3313)**

```tsx
        {features.toolbar ? (
          isCardMode ? (
            <ToolbarCompact
              search={String(currentGlobalFilter ?? "")}
              searchPlaceholder={searchPlaceholder}
              enableGlobalSearch={features.globalSearch}
              onSearchChange={emitGlobalFilterChangeWithServerReset}
              enableSorting={features.sorting}
              sortColumns={compactSortColumns}
              onSortColumn={handleCompactSort}
              onClearSort={() => emitSortingChangeWithServerReset([])}
              filters={toolbarFilters}
              onClearFilters={clearFilters}
            />
          ) : (
            <Toolbar
              ...existing props unchanged...
            />
          )
        ) : null}
```

- [ ] **Step 5: Condense the summary bar (~line 3415)**

```tsx
        {showSummaries ? (
          isCardMode ? (
            <div className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2">
              {summaryItems.map((item) => (
                <div
                  key={item.id}
                  className="flex shrink-0 items-baseline gap-1.5 rounded-full border border-slate-200 bg-slate-50/60 px-3 py-1"
                >
                  <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                    {item.label}
                  </span>
                  <span className="text-xs font-semibold text-slate-950">
                    {item.value(summaryContext)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            ...existing desktop summary block unchanged...
          )
        ) : null}
```

- [ ] **Step 6: Run to verify pass, then full suite + type-check**

Run: `npx vitest run src/components/DataGrid/DataGrid.cards.test.tsx` — PASS.
Run: `npm test` — PASS. Run: `npx tsc -b` — exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/components/DataGrid/DataGrid.tsx src/components/DataGrid/DataGrid.cards.test.tsx
git commit -m "feat(datagrid): card-mode compact toolbar wiring and condensed summary strip"
```

### Task 8: Detail panel as bottom sheet + mode-change callback + virtualized cards

**Files:**
- Modify: `src/components/DataGrid/DataGrid.tsx` — detail panel render (~line 3748)
- Test: `src/components/DataGrid/DataGrid.cards.test.tsx` (extend)

- [ ] **Step 1: Write the failing tests (append)**

```tsx
describe("DataGrid card mode: detail sheet + mode callback + virtualization", () => {
  it("renders the detail panel in a bottom sheet; Escape closes it", () => {
    renderCards({
      renderDetailPanel: (row) => (row ? <div>Detail: {row.product}</div> : null),
    });
    fireEvent.click(within(screen.getAllByRole("listitem")[0]).getByRole("button"));
    const dialog = screen.getByRole("dialog", { name: "Details" });
    expect(within(dialog).getByText("Detail: Almond Butter")).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("fires onDisplayModeChange when the pinned mode flips", () => {
    const onDisplayModeChange = vi.fn();
    const { rerender } = render(
      <DataGrid
        data={rows}
        columns={columns}
        getRowId={(r) => r.product}
        features={{ cardLayout: true }}
        cardView={{ mode: "table", onDisplayModeChange }}
      />,
    );
    expect(onDisplayModeChange).not.toHaveBeenCalled();
    rerender(
      <DataGrid
        data={rows}
        columns={columns}
        getRowId={(r) => r.product}
        features={{ cardLayout: true }}
        cardView={{ mode: "cards", onDisplayModeChange }}
      />,
    );
    expect(onDisplayModeChange).toHaveBeenCalledWith("cards");
  });

  it("virtualizeRows renders the card list without crashing", () => {
    renderCards({ virtualizeRows: true, features: { pagination: false } });
    expect(screen.getByRole("list")).toBeInTheDocument();
    // jsdom measures the scroller at 0 height, so react-virtual windows to ZERO
    // rows here (documented gotcha — see DataGrid.virtual.test.tsx, which only
    // ever asserts upper bounds). Assert the card path tolerates windowing;
    // real rendering is covered by the manual verification in Task 10.
    expect(screen.queryAllByRole("listitem").length).toBeLessThanOrEqual(rows.length);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/DataGrid/DataGrid.cards.test.tsx`
Expected: detail-sheet test FAILS (panel renders inline, not in a dialog).

- [ ] **Step 3: Wrap the detail panel (~line 3748)**

```tsx
      {showDetailPanel ? (
        isCardMode ? (
          <BottomSheet open={activeRow !== null} label="Details" onClose={closeActiveRow}>
            {renderDetailPanel?.(activeRow, { close: closeActiveRow })}
          </BottomSheet>
        ) : (
          renderDetailPanel?.(activeRow, { close: closeActiveRow })
        )
      ) : null}
```

- [ ] **Step 4: Run to verify pass, full suite, type-check**

Run: `npx vitest run src/components/DataGrid/DataGrid.cards.test.tsx` — PASS.
Run: `npm test` — PASS. Run: `npx tsc -b` — exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/DataGrid/DataGrid.tsx src/components/DataGrid/DataGrid.cards.test.tsx
git commit -m "feat(datagrid): card-mode detail bottom sheet, onDisplayModeChange, virtualized cards"
```

---

## Chunk 4: Metric effects, demo, docs, verification

### Task 9: Metric box effects — colorScale tint + dataBar mini-bar

Content effects (`iconSet`, `progressBar`) already flow through `renderCellValue`. This task ports the two box effects using the pure helpers in `cellEffects.ts` (`colorScaleStyle(value, scale, domain)`, `computeBarGeometry(value, bar, domain)`), fed by the existing `columnDomains` memo (~line 2826 in `DataGrid.tsx`). `flashOnChange` is explicitly out of scope (spec: nice-to-have, not gating).

**Files:**
- Modify: `src/components/DataGrid/CardList.tsx` (metric tile)
- Modify: `src/components/DataGrid/DataGrid.tsx` (pass `columnDomains` to `CardList`)
- Test: `src/components/DataGrid/DataGrid.cards.test.tsx` (extend)

- [ ] **Step 1: Write the failing tests (append)**

```tsx
describe("DataGrid card mode: metric effects", () => {
  const effectColumns: GridColumnConfig<Item>[] = columns.map((column) =>
    column.accessorKey === "revenue"
      ? { ...column, dataBar: { color: "#10b981" } }
      : column.accessorKey === "margin"
        ? { ...column, colorScale: { colors: ["#fee2e2", "#dcfce7"] } }
        : column,
  );

  it("dataBar renders a proportional mini-bar under the metric value", () => {
    const { container } = renderCards({ columns: effectColumns });
    const bars = container.querySelectorAll("[data-card-bar]");
    expect(bars.length).toBe(4); // one per card
    // Almond Butter has the max revenue → full-width bar.
    expect((bars[0] as HTMLElement).style.width).toBe("100%");
  });

  it("colorScale tints the metric value", () => {
    const { container } = renderCards({ columns: effectColumns });
    const tinted = container.querySelectorAll("[data-card-tint]");
    expect(tinted.length).toBe(4);
    expect((tinted[0] as HTMLElement).style.backgroundColor).not.toBe("");
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/components/DataGrid/DataGrid.cards.test.tsx`: FAIL (no bar/tint elements).

- [ ] **Step 3: Implement**

3a. `CardList.tsx`: thread a `columnDomains` prop down to the metric tile. Three mechanical edits plus the tile itself:

1. `import { colorScaleStyle, computeBarGeometry, type NumericDomain } from "./cellEffects";`
2. Add `columnDomains: Map<string, NumericDomain>;` to `CardListProps` **and** to `CardBody`'s inline props type.
3. Pass it through both call sites: `<CardBody row={row.original} roles={roles} formatOptions={formatOptions} columnDomains={columnDomains} />` (and destructure it in both components).

Then replace the metric value `<div>` inside `CardBody`'s metrics map with (verified: `GridColumnConfig.colorScale`/`dataBar` are always objects — `GridColorScale`/`GridDataBar`, never boolean — so no type dance is needed):

```tsx
              {(() => {
                const value = row[column.accessorKey as keyof TData];
                const domain = columnDomains.get(column.accessorKey as string);
                const tint = column.colorScale
                  ? colorScaleStyle(value, column.colorScale, domain)
                  : null;
                const bar = column.dataBar
                  ? computeBarGeometry(value, column.dataBar, domain)
                  : null;
                return (
                  <>
                    <div
                      data-card-tint={tint ? "" : undefined}
                      style={tint ?? undefined}
                      className={`text-sm font-semibold tabular-nums text-slate-900 ${
                        tint ? "inline-block rounded px-1" : ""
                      }`}
                    >
                      {renderCellValue(column, value, row, formatOptions)}
                    </div>
                    {bar ? (
                      <div className="mt-1 h-1 w-16 overflow-hidden rounded-full bg-slate-200">
                        <div
                          data-card-bar
                          className="h-1 rounded-full"
                          style={{
                            width: `${bar.widthPct}%`,
                            marginLeft: `${bar.leftPct}%`,
                            backgroundColor: bar.negative
                              ? column.dataBar?.negativeColor ?? "#ef4444"
                              : column.dataBar?.color ?? "#0ea5e9",
                          }}
                        />
                      </div>
                    ) : null}
                  </>
                );
              })()}
```

3b. `DataGrid.tsx`: pass `columnDomains={columnDomains}` in the `<CardList>` invocation. `columnDomains` is declared at ~line 2826, *after* phase 9 where `cardRoles` lives but *before* the render — the JSX reference is fine; no reordering needed.

- [ ] **Step 4: Run to verify pass, full suite, type-check** — all PASS, `npx tsc -b` exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/DataGrid/CardList.tsx src/components/DataGrid/DataGrid.tsx src/components/DataGrid/DataGrid.cards.test.tsx
git commit -m "feat(datagrid): colorScale tint and dataBar mini-bars on card metrics"
```

### Task 10: Demo opt-in + manual verification

**Files:**
- Modify: `src/App.tsx` (features + cardView props on the `<DataGrid>`)

- [ ] **Step 1: Opt the demo in**

In `src/App.tsx`, change the features line (~line 224) and add `cardView` below it:

```tsx
          features={{ detailPanel: false, headerToolsOnDemand: true, cardLayout: true }}
          cardView={{
            // item_id is the first text column and would win title by default;
            // the card reads better titled by name.
            card: { title: "item_name", badge: "recommendation_status" },
          }}
```

- [ ] **Step 2: Manual verification (this is the run/observe step — do it, don't skip)**

Run: `npm run dev` → open http://127.0.0.1:5173/ in Grid layout, Client mode.
- Narrow the browser window below ~640px content width: the table morphs into cards titled by item name with a status pill, ≤3 metric tiles, and a meta line.
- The toolbar shows search + `Sort` + `Filters` chips; each chip opens a bottom sheet; sorting by Sales reorders cards; faceting Department filters them; the applied-filter chip bar appears.
- Summary pills scroll horizontally.
- Widen the window: the table returns with all desktop chrome intact.
- Switch to Pivot layout: table always (card mode ignored).

Expected: all of the above; no console errors.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(demo): opt the workbench into cardLayout with a title/badge override"
```

### Task 11: Docs + full verification + package sanity

**Files:**
- Modify: `CLAUDE.md` (add a card-layout bullet in the architecture subsystem list, after the "Value-driven cell visual effects" bullet)
- Modify: `CHANGELOG.md` (new entry at top, matching existing entry style)

- [ ] **Step 1: CLAUDE.md bullet (adjust wording to final reality, keep it ≤ the neighbors' length)**

```markdown
- **Mobile card layout (grid mode, opt-in).** `features.cardLayout` + the `cardView` prop switch the render path to auto-composed cards below a container-width breakpoint (default 640px, measured on the grid root via `useContainerWidth.ts` — container-driven, not viewport). `cardComposition.ts` (pure) assigns every visible leaf column a role (title/badge/subtitle/metrics/meta) by dataType + visible order; `DataGridCardConfig` overrides any role; `renderCard` replaces the body. `CardList.tsx` renders list semantics through the same table instance (`renderCellValue` formatting, colorScale/dataBar carried onto metric tiles); `ToolbarCompact.tsx` + `BottomSheet.tsx` provide the search/sort/filters chrome writing the existing `sorting`/`columnFilters` slices (`FilterBody` reuse). Card mode defaults desktop-only features off via `cardModeFeatureDefaults` (same merge mechanism as server mode; `headerFilters` stays ON — it feeds `resolvedFilters` → the Filters sheet). Pivot ignores card mode. `cardView.mode` pins the mode (how jsdom tests force it); sheet keyframes live in both `src/index.css` and `src/styles.css`.
```

- [ ] **Step 2: CHANGELOG entry** — add under the existing `## [Unreleased]` → `### Added` section (Keep a Changelog format, matching neighbor style):

```markdown
- **Mobile card layout (opt-in):** `features.cardLayout` + the `cardView` prop
  render rows as auto-composed cards when the grid's own container is narrower
  than `cardView.breakpoint` (default 640px, ResizeObserver on the grid root).
  A pure heuristic assigns visible columns to card roles (title / status badge
  / subtitle / metric tiles / meta footer) by dataType and visible order;
  `DataGridCardConfig` overrides any role and `renderCard` replaces the body.
  Card mode swaps the toolbar for touch-first search + Sort/Filters chips over
  bottom sheets (writing the existing `sorting`/`columnFilters` slices),
  condenses summaries to a pill strip, moves the detail panel into a bottom
  sheet, and defaults desktop-only features (editing, selection, export,
  grouping UI…) off — every default consumer-overridable. Grid layout only;
  pivot ignores card mode. New public types: `DataGridCardView`,
  `DataGridCardConfig`, `DataGridCardContext`, `DataGridDisplayMode`.
```

- [ ] **Step 3: Full verification**

Run, in order, expecting success from each:
- `npm test` — all suites pass.
- `npx tsc -b` — exits 0.
- `npm run build` — demo build succeeds.
- `npm run test:package` — package build + tarball + ESM/CJS/styles smoke test pass (catches a missing export or a CSS-only-in-index.css mistake).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md CHANGELOG.md
git commit -m "docs: mobile card layout feature notes"
```

---

## Out of scope (per spec — do not build)

Pivot-mode cards; mobile editing; swipe gestures / row actions on cards; `flashOnChange` on card metrics; priority-columns tablet stage; flipping `cardLayout` on by default.
