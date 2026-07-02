# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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
- **`headerWrap` prop:** opt-in two-line (clamped) header labels. Header cells
  top-align and the sort/filter/menu tools anchor to the first line, so tools
  stay aligned across columns regardless of how many lines each label wraps to.
- Header labels expose the full column name via a native `title` tooltip
  (string headers only), so truncated names are recoverable.
- **`features.headerToolsOnDemand`:** collapse per-column funnel/menu buttons
  until hover, keyboard focus, an active filter, or an open menu.
- Per-column `enableSorting` opt-out on `GridColumnConfig`.
- MultiSelect filter bodies over 10 options get an in-list search box.
- Saved-views save button relabels to "Update view" when the name exists.
- **Fill handle:** drag the handle at the corner of a cell selection down or
  right to replicate/tile its value(s) into adjacent cells, or use `Ctrl+D`
  (fill down) / `Ctrl+R` (fill right) as the keyboard equivalent over an
  existing multi-row/multi-column selection (`features.fillHandle`).

### Fixed

- **Column widths are now authoritative:** the table uses `table-layout: fixed`
  with a per-leaf-column `<colgroup>`. Previously, a long header label silently
  expanded its column past the configured/resized width (`truncate` never
  engaged), drag-resize could not shrink such a column, and — because pinned
  sticky offsets are computed from `getSize()` sums — pinned columns visibly
  overlapped their neighbors once rendered widths drifted.
- Non-sortable header labels now truncate with an ellipsis (the label span was
  a flex container, where `text-overflow: ellipsis` does not apply).
- Filter popovers and the header column menu flip vertically and clamp their
  height instead of running below short viewports.
- Inline-edit validation errors flip above the field near the viewport bottom.
- The loading/empty overlay anchors to the visible area instead of scrolling
  away with the content.
- Applied-filter chips truncate at a bounded width with a full-value tooltip.
- Empty filter option lists show "No options available" instead of a blank
  popover; blur with an invalid inline edit reverts instead of trapping the
  editor open.

## [0.1.0] - 2026-06-27

Initial public release of the `DataGrid` component — a domain-neutral analytical
data grid for React built on TanStack Table v8, distributed as ESM + CJS with
TypeScript declarations and a precompiled stylesheet.

### Added

- **Two layouts from one component:** a standard **grid** and an Excel-style
  **pivot** (`layoutMode`), both rendered through the same TanStack Table path so
  sorting, resizing, visibility, ordering, pinning, saved views, pagination, and
  virtualization apply to generated pivot columns too.
- **Type-aware columns:** `GridColumnConfig` with `text` / `number` / `currency`
  / `percent` / `status` / `date` / `boolean` data types driving locale-aware
  formatting and alignment, plus `formatValue`, `getCellClassName`,
  `statusStyles`, and composable `conditionalFormats`.
- **Value-driven cell effects (grid mode):** `colorScale` heatmaps, in-cell
  `dataBar`, `iconSet`, `progressBar`, and `flashOnChange` (motion gated by
  `prefers-reduced-motion`).
- **Auto-provisioned, type-aware filtering:** every leaf column is filterable by
  default with a control inferred from its data type (low-cardinality text
  auto-facets to multi-select), an applied-filter chip bar, operator-aware
  clauses, and a single source of truth shared by grid headers and the pivot
  toolbar. Tunable via `features.headerFilters`, `autoColumnFilters`,
  `filterSummary`, `floatingFilters`, and `facetThreshold`.
- **Grouping, summaries, and pivot measures:** grouped/expanded rows, a summary
  bar with scope-aware aggregations, and `pivot.measures` with built-in or custom
  aggregations, subtotals, and grand totals.
- **Controlled / uncontrolled hybrid state:** every slice (sorting, filters,
  visibility, sizing, order, pinning, pagination, selection, grouping, expansion,
  pivot, saved views, active view) is independently controllable.
- **Server data:** high-level `dataSource` adapter (grid owns sorting, search,
  filters, pagination; abortable requests with stale-response guarding) plus the
  lower-level `dataMode="server"` controlled API.
- **Keyboard cell navigation & inline editing:** roving-tabindex cell grid,
  arrow/Home/End/Ctrl/Page navigation, and controlled inline editing
  (`onCellEdit`) with parse/validate — the grid never mutates `data`.
- **Export & clipboard:** CSV export of the current view (or selection) and
  Ctrl/Cmd-C TSV copy.
- **Row actions:** domain-neutral per-row actions column, static or per-row
  resolved, with hidden/disabled support.
- **Column header groups, density, detail panel, saved views, and a collapsible
  toolbar** (`collapsibleToolbar`).
- **Row virtualization** (`virtualizeRows`) for grid and materialized pivot rows.
- **Scoped persistence:** opt-in via `storageKey` for column sizing, order,
  pinning, and saved views only.
- **Internationalization:** `locale` / `currency` / `dateFormat` applied to
  formatting and searchable text.
- **Accessibility:** native table semantics, ARIA grid annotations
  (`aria-rowcount`/`-colcount`, per-cell `aria-rowindex`/`-colindex`,
  `aria-sort`), full keyboard operation, and managed focus, targeting WCAG 2.1
  Level AA. See the README's Accessibility section for scope and limitations.
- **Packaging:** `exports`/`main`/`module`/`types` plus a `./styles.css` subpath;
  `react`, `react-dom`, and `@tanstack/react-table` are peer dependencies; a
  packaged smoke test (`npm run test:package`) asserts tarball purity and import
  resolution.

[Unreleased]: https://github.com/nathaniel-lyman/DataGrizard/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/nathaniel-lyman/DataGrizard/releases/tag/v0.1.0
