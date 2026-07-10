# Mobile Card Layout — Design

**Date:** 2026-07-02
**Status:** Approved (brainstorm with visual companion; spec review loop skipped by user request)

## Context & goals

DataGrid has no mobile handling today: a fixed-layout `<table>` in an `overflow-auto` scroller, no media/container queries anywhere in the component. This design adds a first-class, domain-neutral responsive layout to the **library** (not demo polish).

Scope decisions made during brainstorming:

- **Library feature** — typed props/feature flags on the public surface, exported from `index.ts`.
- **Primary mobile job: scan + drill in.** Read-mostly; tap a row for full detail. Editing and heavy features stay desktop-first.
- **Must remain accessible on mobile:** global search, sorting, type-aware filters, summaries.
- **Allowed to degrade:** row selection, export, grouping/pivot, inline editing, fill handle, clipboard, column management.

Approach chosen: **Auto-Composed Cards** (over "priority columns + row expand" and "anchor + swipeable column panes"): below a container-width threshold, rows morph into cards the grid composes automatically from column metadata. Innovation matches the grid's zero-config philosophy (parallel to auto-provisioned filters), and the existing cell-effects system gives cards instant visual richness.

## §1 — Public API & mode detection

Opt-in flag + config prop, mirroring `layoutMode` + `pivot`:

```ts
features={{ cardLayout: true }}          // default OFF — no existing consumer changes
cardView={{
  breakpoint?: number,                    // container width px, default 640
  mode?: "auto" | "table" | "cards",     // default "auto"
  card?: DataGridCardConfig<TData>,       // role overrides (§2)
  onDisplayModeChange?: (m: "table" | "cards") => void,
}}
```

- **Container-driven, not viewport-driven.** A `useContainerWidth` hook (ResizeObserver on the grid root) resolves the display mode from the grid's own width — works embedded in split panes/dashboard tiles with no consumer wiring. `mode: "cards" | "table"` pins the mode (also the test/demo forcing mechanism).
- **SSR-safe:** first paint assumes table, corrects on mount (`typeof window` discipline as in `storage.ts`).
- **Render-path swap only.** Sorting, filters, search, pagination, and every controlled-state slice keep flowing through the same `useGridState` triads and the single `useReactTable` instance; cards render `table.getRowModel().rows`.
- New public types `DataGridCardView<TData>`, `DataGridCardConfig<TData>` export from `index.ts`.

## §2 — Auto-composition heuristic & card anatomy

Every **visible** leaf column gets a card role by dataType + visible order (hidden columns stay hidden; column visibility/order keep working):

| Rule | Column(s) | Card role |
|---|---|---|
| 1 | First visible `text` column | **Title** |
| 2 | First visible `status` column | **Badge** (pill; reuses `statusStyles`/`getStatusClassName`) |
| 3 | 2nd/3rd `text` columns | **Subtitle line** |
| 4 | `currency`/`number`/`percent`, visible order | **Metrics** — first 3 by default (`maxMetrics` tunes) |
| 5 | `date` + `boolean` + leftover columns | **Meta footer** (label · value, dot-separated) |

- **All formatting through `renderCellValue`:** locale formatters, `formatValue` overrides, status pill styles carry over with zero consumer code.
- **Cell effects translate:** `dataBar` → mini-bar under the metric value, `colorScale` → value tint, `iconSet`/`progressBar` render inline (they already live inside `renderCellValue`). `flashOnChange` may flash the metric value (nice-to-have, not gating).
- Heuristic lives in a **pure module `cardComposition.ts`** (testable-sibling pattern, like `filterDefaults.ts`): input = visible column configs, output = role assignment.

```ts
type DataGridCardConfig<TData> = {
  title?: keyof TData;
  subtitle?: (keyof TData)[];
  badge?: keyof TData;
  metrics?: (keyof TData)[];   // ordered
  meta?: (keyof TData)[];
  maxMetrics?: number;         // default 3
  renderCard?: (row: TData, ctx: CardContext) => ReactNode;  // full escape hatch
};
```

Unset roles fall back to the heuristic per-role (overrides and inference compose).

## §3 — Mobile chrome

- **Toolbar condenses** in card mode to a sticky search bar + chips: `Sort: <col> ▾` and `Filters (n)`. Column chooser, grouping builder, saved views, export hide by default via a **`cardModeFeatureDefaults` merge** (same mechanism as `dataModeFeatureDefaults`; every default consumer-overridable).
- **`BottomSheet.tsx`** — one new internal primitive: backdrop, drag handle, Escape/backdrop dismiss, focus trap, body scroll lock, slide-up animation with `prefers-reduced-motion` guard. Keyframes in **both** `src/index.css` and `src/styles.css` (flash precedent).
- **Sort sheet:** list of sortable columns, tap toggles asc/desc, writes the existing `sorting` slice.
- **Filters sheet:** stacks the same `filterBodies.tsx` per-type controls driven by the same `resolvedFilters` memo — the pivot Filters popover pattern in a sheet. Writes `columnFilters`.
- **Summaries** condense to a horizontally scrollable pill strip; `AppliedFilters` chip bar stays as-is.
- **Detail panel:** tap card → `activeRow` (existing pattern) → `renderDetailPanel` renders in a full-height bottom sheet instead of the side panel.

## §4 — A11y, degradations, files, testing

**Accessibility.** Card mode uses list semantics (`role="list"`/`listitem`), each card one focusable element; Enter/Space opens the detail sheet. No roving tabindex in card mode; with virtualization only rendered cards are tabbable. Sheets are dialogs: `aria-modal`, focus trap, focus returns to the opening chip. Touch targets ≥44px.

**Degradations (explicit, overridable).** `cardModeFeatureDefaults` disables in card mode: inline editing, fill handle, clipboard/cell selection, row selection, export, grouping UI, column chooser, floating filters. *Errata:* the `headerFilters` flag itself stays **ON** — it is the master toggle that feeds `resolvedFilters`, which the Filters sheet renders; header funnels simply have no table header to appear in (an earlier draft listed header filters as disabled). **Pivot ignores `cardLayout`.** Server mode composes: cards render the loaded page, pager stays. `virtualizeRows` windows the card list with the same react-virtual + `measureElement` wiring.

**Files.**

| File | Owns |
|---|---|
| `useContainerWidth.ts` | ResizeObserver hook, SSR-safe |
| `cardComposition.ts` (+ `.test.ts`) | pure heuristic: visible columns → card roles |
| `CardList.tsx` | card render path, consumes `renderCellValue` |
| `BottomSheet.tsx` | sheet primitive |
| `ToolbarCompact.tsx` | search + chips + sort/filter sheet contents (reuses `filterBodies.tsx`) |
| `src/types/grid.ts`, `index.ts` | new public types + exports |

**Testing (test-first).** `DataGrid.cards.test.tsx`: force `cardView.mode="cards"` in jsdom (+ ResizeObserver mock for auto-mode), heuristic-driven render assertions, chrome swap, sort sheet → `sorting`, filter sheet → `columnFilters`, detail sheet via `activeRow`, list semantics, degradation defaults, and a regression guard that flag-off table mode is unchanged. `cardComposition.test.ts` covers the pure heuristic. Type-check via `npx tsc -b`.

**Demo.** `App.tsx` opts in (`features.cardLayout`) so resizing the window below ~640px shows the morph live; optionally demonstrates a `cardView.card` override.

## Out of scope / future

- Pivot-mode cards; mobile editing; swipe gestures/row actions on cards; approach B ("priority columns") as a tablet-width intermediate stage; flipping `cardLayout` default on.
