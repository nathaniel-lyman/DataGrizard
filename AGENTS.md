# Repository Guidelines

## Project Structure & Module Organization

This repository is a Vite + React + TypeScript component-surface project for a reusable analytical data grid. Treat reusable component APIs as the primary product; demo retail analytics screens are only consumers that prove the component surface.

- `src/App.tsx` composes the application shell and mounts the grid.
- `src/components/DataGrid/` contains the reusable grid surface:
  - `DataGrid.tsx` is the orchestration engine — it composes state, builds column defs, owns the single `useReactTable` call, and renders the shared table chrome. It is long; navigate it via the `// ----- N. Phase -----` banners (a table-of-contents comment sits above the `DataGrid` function).
  - State and interaction logic are extracted into hooks: `useGridState.ts` (the controlled/uncontrolled hybrid state triad), `useCellFocus.ts` (roving-`tabIndex` focus geometry), `useCellEditing.ts` (inline-edit state machine). `gridHelpers.ts` holds their shared pure utilities.
  - `cells.tsx` / `filterMatch.ts` / `columnGroups.ts` / `storage.ts` hold pure engine helpers (cell rendering, the filter predicate, column-group assembly, scoped `localStorage`).
  - `filters.tsx` owns filter-control chrome (header popover, floating row, pivot Filters popover) delegating per-type bodies to `filterBodies.tsx`; `cellEditor.tsx` owns inline edit UI; `pivot.tsx` owns pivot materialization (pure helpers in `pivotColumns.ts` / `pivotHelpers.ts`).
  - `Toolbar.tsx` is a prop-driven shell that arranges sub-controls, each its own component: `ToolbarSearch.tsx`, `ToolbarColumns.tsx`, `ToolbarGrouping.tsx`, `ToolbarSavedViews.tsx`, plus Export (filtering lives in the column headers, not the toolbar).
  - `index.ts` exports the component boundary.
- `src/types/grid.ts` defines reusable grid column and filter configuration types.
- `src/data/mockRetailData.ts` generates synthetic retail rows plus demo column/filter configuration.
- `src/demo/` contains retail-specific demo UI, such as detail panels and action placeholders.
- `src/utils/formatters.ts` contains number, currency, percent, status, and date formatters; `src/utils/export.ts` holds domain-neutral CSV/TSV + clipboard helpers.
- `src/index.css` holds Tailwind setup and global base styles.

Tests live next to the feature they cover, for example `src/components/DataGrid/DataGrid.test.tsx`.

## Component-Surface First

Default every change toward a reusable component surface, not a one-off demo. `src/components/DataGrid/` must remain domain-neutral and generic over consumer row types. Do not add retail-specific field names, copy, status values, mock data assumptions, action labels, or detail layouts inside the reusable component folder.

Prefer explicit, typed extension points over hidden assumptions:

- Add public props for configurable behavior, such as `features`, `filters`, `storageKey`, `rowLabel`, `searchPlaceholder`, `viewNamePlaceholder`, `renderDetailPanel`, row ID/label callbacks, and column formatter/class callbacks.
- Keep persistence scoped by consumer-provided keys; never introduce global localStorage keys that can collide across multiple grids.
- Keep demo-specific data, detail panels, status styling, labels, and placeholder actions under `src/data/`, `src/demo/`, or `src/App.tsx`.
- Export reusable types through `src/components/DataGrid/index.ts` when they are part of the public component contract.
- When adding a feature, make it toggleable or configurable if a consumer may reasonably want the grid without it.

## Build, Test, and Development Commands

- `npm install` installs dependencies from `package-lock.json`.
- `npm run dev` starts Vite at `http://127.0.0.1:5173/`.
- `npm run build` runs TypeScript project build checks and produces a production Vite build in `dist/`.
- `npm run preview` serves the production build locally for smoke testing.
- `npm test` runs the Vitest suite once (jsdom). Run a single file with `npx vitest run <path>`, a single test with `npx vitest run -t "<name>"`, or watch with `npx vitest`.

## Coding Style & Naming Conventions

Use TypeScript with strict types. Keep React components as focused function components and prefer explicit props types. Use two-space indentation and double quotes, matching the current files.

Use PascalCase for components and component files, such as `DataGrid.tsx` and `RetailDetailPanel.tsx`. Use camelCase for functions, local variables, and formatter utilities. Keep reusable grid-surface types in `src/types/grid.ts`; keep demo row-shape/domain types beside their demo data.

Styling is Tailwind-first. Keep classes compact, neutral, and aligned with the internal-tool visual direction already present.

Use `lucide-react` for UI icon chrome. Keep icon usage routed through small local wrapper modules such as `src/components/DataGrid/icons.tsx` when that preserves a stable internal component boundary. Icons should be decorative by default (`aria-hidden`) when the surrounding button, input, or text already provides the accessible name; do not add one-off inline SVG icons for ordinary controls when a Lucide icon exists.

## Testing Guidelines

Tests use Vitest with React Testing Library in a jsdom environment (`@testing-library/jest-dom` matchers). Prefer focused component tests for table behavior and pure unit tests for data/formatting helpers. Suggested coverage targets: filtering, sorting, selection, detail-panel opening, conditional formatting, and formatter output.

Name tests after the unit under test, for example `formatters.test.ts` or `DataGrid.test.tsx`.

## Commit & Pull Request Guidelines

Follow the established Conventional Commits history: `type(scope): subject` with an imperative subject, e.g. `fix(datagrid): keep pinned body cells below the sticky header`, `feat(demo): client/server data-source toggle`, or `docs(datagrid): note dataMode server primitive`. Common scopes are `datagrid` and `demo`; common types are `feat`, `fix`, and `docs`.

Pull requests should include a short summary, screenshots for UI changes, commands run, and any known limitations. Mention whether `npm run build` passes.

## Security & Configuration Tips

Do not commit generated output or local dependencies. `.gitignore` already excludes `node_modules/`, `dist/`, Playwright artifacts, local env files, and temporary grid screenshots.
