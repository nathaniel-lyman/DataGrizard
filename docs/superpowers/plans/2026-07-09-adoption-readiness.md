# Adoption-Readiness Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `datagrizard` installable by a stranger: Tailwind-free scoped styling with CSS-variable theming (+ dark preset), Node16-correct type packaging, `"use client"` bundles, honest dependencies, hardened package verification, and CI.

**Architecture:** Sequential work on one branch (`feat/adoption-readiness`). Packaging correctness (spec § 3) lands first so its verify tooling gates the CSS migration; then the de-Tailwind migration (spec § 2) proceeds file-batch by file-batch with the Tailwind lib pipeline kept alive until the last batch, then swapped for a plain-CSS minify step; CI (spec § 4) freezes the final pipeline. Spec § 5 (publish) and § 6 (demo hosting/screenshots) are **out of scope** except the README styling rewrite.

**Tech Stack:** Vite 6 lib mode, `vite-plugin-dts` (rollupTypes), esbuild (CSS minify), publint + @arethetypeswrong/cli, hand-written CSS with custom properties, GitHub Actions.

**Source spec:** `docs/adoption-readiness-spec.md`. Read CLAUDE.md and AGENTS.md before any task.

---

## Locked decisions (spec § 8 answers)

| Q | Decision |
|---|----------|
| Q1 demo Tailwind | **Keep Tailwind in the demo only** (`src/index.css` keeps `@tailwind` directives; `tailwindcss`/`postcss`/`autoprefixer` stay devDependencies). The demo doubles as the Tailwind-coexistence proof. |
| Q2 dark mode | Opt-in `.dg-theme-dark` class only. No `theme` prop in v1. Demo gets a toggle button (demo layer). |
| Q3 lucide | Inline all icons as local SVG components; delete `lucide-react` entirely. `trendIconSet` keeps its public API shape, icons become local SVGs. |
| Q4 react-virtual | Keep bundling `@tanstack/react-virtual`; remove it from `dependencies`. |
| Q5 React 18 | Keep `react`/`react-dom` peers at `>=18` and add a React 18 leg to CI (the package currently claims 18; user directed: test what we claim). If the suite proves red under 18 and the fix is non-trivial, STOP and escalate — the fallback is peers `>=19`. |
| Q8 CJS | Keep dual ESM+CJS. |
| Q9 browser floor | Modern floor (2022+ evergreen). No autoprefixer in the lib CSS pipeline. |

### Deviation from spec § 2.A2: no `@layer`

The spec wraps shipped CSS in `@layer datagrizard` so consumer styles win. **This interacts fatally with Q1:** Tailwind v3 preflight is *unlayered*, and per CSS Cascade 5 unlayered author styles beat layered ones regardless of specificity. Preflight's `*, ::before, ::after { border-width: 0 }` would zero every grid border (43 `border-slate-200` sites) in any Tailwind-v3 host — including our own demo — failing the pixel-parity criterion. Instead:

- **Flat, low-specificity selectors:** every rule is a single class (`.dg-cell`, specificity 0,1,0) or `.dg-root :where(...)` for the scoped reset. No descendant chains like `.dg-root .dg-toolbar button`; give the element a class.
- **Consumer overrides win** by (a) equal specificity + later source order (document: "import `datagrizard/styles.css` before your own styles"), or (b) any specificity bump. Verified by the Task 10 fixture (consumer CSS loaded after ours must win).
- The scoped reset uses `:where()` so it never outranks component rules: e.g. `.dg-root :where(button) { ... }` is (0,1,0).

Everything else in § 2 stands (scoped reset, no global selectors, tokens, pixel parity).

### Class-naming convention (record in AGENTS.md in Task 12)

- Blocks/elements: flat kebab-case with `dg-` prefix — `dg-root`, `dg-toolbar`, `dg-header-cell`, `dg-cell`, `dg-cell-numeric`, `dg-pill`, `dg-menu`, `dg-menu-item`, `dg-card`, …
- State: `--modifier` suffix on the same block — `dg-cell--focused`, `dg-row--active`, `dg-pill--muted`. Styled as the modifier class alone (`.dg-cell--focused { ... }`) declared **after** the base rule.
- No unprefixed classes (`is-active` etc.) — everything the grid emits starts with `dg-`.

### Design tokens (light defaults = current slate theme, Tailwind v3 hex)

Declared on `.dg-root`; `.dg-theme-dark` reassigns them. Working set — extend when a color recurs ≥3 times during migration; one-off colors stay literal in the rule.

```css
.dg-root {
  --dg-bg: #ffffff;              /* bg-white */
  --dg-surface: #f8fafc;         /* slate-50: headers, toolbar, zebra */
  --dg-surface-raised: #ffffff;  /* menus, popovers, sheets */
  --dg-hover: #f1f5f9;           /* slate-100 */
  --dg-active: #e2e8f0;          /* slate-200 */
  --dg-border: #e2e8f0;          /* slate-200 */
  --dg-border-strong: #cbd5e1;   /* slate-300 */
  --dg-text: #0f172a;            /* slate-900 */
  --dg-text-strong: #020617;     /* slate-950 */
  --dg-text-muted: #64748b;      /* slate-500 */
  --dg-text-faint: #94a3b8;      /* slate-400 */
  --dg-accent: #0f172a;          /* slate-900: primary buttons, active toggles */
  --dg-accent-text: #ffffff;
  --dg-accent-bg: #f1f5f9;       /* selection/focus wash */
  --dg-danger: #be123c;          /* rose-700 */
  --dg-danger-bg: #fff1f2;       /* rose-50 */
  --dg-success: #047857;         /* emerald-700 */
  --dg-info-bg: #eff6ff;         /* blue-50 */
  --dg-info-text: #1e40af;       /* blue-800 */
  --dg-radius: 0.375rem;         /* rounded-md */
  --dg-radius-sm: 0.25rem;
  --dg-font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --dg-font-size: 0.875rem;
  --dg-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1); /* shadow-md */
  --dg-ring: #cbd5e1;            /* slate-300 default ring */
  --dg-ring-strong: #64748b;     /* slate-500 focus ring */
}
```

Reference hex for migration (Tailwind v3): slate-50 `#f8fafc`, 100 `#f1f5f9`, 200 `#e2e8f0`, 300 `#cbd5e1`, 400 `#94a3b8`, 500 `#64748b`, 600 `#475569`, 700 `#334155`, 800 `#1e293b`, 900 `#0f172a`, 950 `#020617`; rose-600 `#e11d48`, rose-700 `#be123c`; emerald-700 `#047857`; red-700 `#b91c1c`; blue-50 `#eff6ff`, blue-200 `#bfdbfe`, blue-800 `#1e40af`, blue-900 `#1e3a8a`.

### Migration method (applies to Tasks 5–8)

For each `className` string in the batch's files:
1. Invent/reuse a semantic class per the naming convention. Reuse aggressively — most buttons/menus share one class.
2. Add a rule to `src/components/DataGrid/datagrid.css` whose declarations are the **exact CSS equivalents** of the removed utilities (`px-2` → `padding-left/right: 0.5rem`; `text-xs` → `font-size: 0.75rem; line-height: 1rem`; `ring-1 ring-slate-300` → `box-shadow: 0 0 0 1px var(--dg-ring)`; `divide-y` → child-combinator border rule on a classed child if possible, else `> :not(:first-child)` under a single-classed parent). Use tokens where a mapping exists in the table above, literal hex otherwise.
3. Conditional class logic in TSX keeps its shape — swap the utility strings for semantic/modifier classes; do not refactor the conditionals.
4. Leave consumer-facing pass-through class props (`statusStyles`, `conditionalFormats`, `getCellClassName`, `getRowClassName` values, and everything in `src/data/` / `src/demo/` / `src/App.tsx`) untouched.
5. Keep value-driven inline styles (`cellEffects.ts` geometry/colors) inline — out of scope.
6. After the batch: `grep -nE "className=[\"'{][^\"']*\\b(bg|text|border|ring|rounded|px|py|p|m|mx|my|mt|mb|ml|mr|flex|grid|gap|h|w|min-w|max-w|items|justify|font|tracking|leading|shadow|divide|space|overflow|whitespace|truncate|sr-only|absolute|relative|sticky|inset|z|top|left|right|bottom|cursor|select|underline|uppercase|tabular|transition|duration|opacity|pointer-events|animate)-?" <files>` must return zero (audit any hits by eye — semantic classes may legitimately contain words like `dg-grid`).
7. `npx tsc -b && npm test` green before commit. Dark-theme values for new rules: use the token; if a rule needs a non-token color that must differ in dark mode, add a token.

Every batch task: the "test" is the existing suite (it asserts behavior/roles mostly) + orchestrator visual check against baseline screenshots after commit. Tests asserting Tailwind classes are updated **in the same batch** as the component they test (grep first: `grep -rn "slate-\|bg-white\|rose-\|emerald-\|blue-" src/components/DataGrid/*.test.tsx`).

---

## Chunk 1: Packaging correctness (spec § 3)

### Task 1: Inline SVG icons, delete lucide-react

**Files:**
- Modify: `src/components/DataGrid/icons.tsx` (15 lucide imports → local SVGs)
- Modify: `src/components/DataGrid/trendIconSet.tsx` (3 lucide imports → local SVGs)
- Modify: `package.json` (remove `lucide-react` from `dependencies`)
- Modify: `vite.lib.config.ts` only if it references lucide (it doesn't — verify)

- [ ] **Step 1:** Read both files. List every lucide icon used and where it renders (`icons.tsx` already wraps them; `trendIconSet.tsx` is public API — its exported shape must not change).
- [ ] **Step 2:** For each icon, replace with a local `<svg>` component reproducing the lucide 24×24 outline paths (viewBox `0 0 24 24`, `fill="none"`, `stroke="currentColor"`, `strokeWidth={2}`, `strokeLinecap="round"`, `strokeLinejoin="round"`), accepting the same props the call sites pass (at minimum `className`, `size`/width-height, `aria-hidden`). Copy path data from the installed `lucide-react` package (`node_modules/lucide-react/dist/esm/icons/*.js`) so the icons are pixel-identical. Keep lucide's ISC license note in a comment block above the path data.
- [ ] **Step 3:** Remove the `lucide-react` imports; `npm uninstall lucide-react`.
- [ ] **Step 4:** `npx tsc -b && npm test` — expect green (icon components are rendered in many tests).
- [ ] **Step 5:** `npm run test:package` — expect green; then `grep -r "lucide" src/ package.json` → only license comments remain.
- [ ] **Step 6:** Commit: `refactor(icons): inline lucide icons as local SVG components, drop lucide-react`

### Task 2: Type rollup, exports map, "use client", dependency + engines cleanup

**Files:**
- Modify: `vite.lib.config.ts` (add `vite-plugin-dts` with `rollupTypes: true`; add `"use client"` banner)
- Modify: `package.json` (exports/types/main/module, remove `@tanstack/react-virtual` from `dependencies`, add `engines`, adjust `build:package`/`build:types` scripts)
- Modify: `scripts/verify-package.mjs` (expected-file assertions: `dist/datagrid.d.ts`, `dist/datagrid.d.cts` present; `dist/types/**` absent)
- Delete usage of: `tsconfig.lib.json` declaration emit path (keep the tsconfig if vite-plugin-dts consumes it; otherwise delete)

- [ ] **Step 1:** `npm i -D vite-plugin-dts @microsoft/api-extractor` (api-extractor is required by `rollupTypes`).
- [ ] **Step 2:** In `vite.lib.config.ts`: add `dts({ rollupTypes: true, tsconfigPath: "./tsconfig.lib.json", outDir: "dist" })` to plugins, and `rollupOptions.output.banner: '"use client";'`. Ensure emitted file is `dist/datagrid.d.ts` (use `beforeWriteFile` or the plugin's `rollupOptions`/`fileName` handling; acceptable alternative: let it emit `index.d.ts` and rename in a script step).
- [ ] **Step 3:** Add a post-build script step that copies `dist/datagrid.d.ts` → `dist/datagrid.d.cts` (tsup-style identical-content dual declarations). Wire into `build:package`; remove the separate `build:types` tsc step.
- [ ] **Step 4:** Update `package.json`:

```json
"main": "./dist/datagrid.cjs",
"module": "./dist/datagrid.js",
"types": "./dist/datagrid.d.ts",
"exports": {
  ".": {
    "import": { "types": "./dist/datagrid.d.ts", "default": "./dist/datagrid.js" },
    "require": { "types": "./dist/datagrid.d.cts", "default": "./dist/datagrid.cjs" }
  },
  "./styles.css": "./dist/datagrid.css",
  "./package.json": "./package.json"
},
"engines": { "node": ">=20" }
```

  and delete the `dependencies` block entirely (`@tanstack/react-virtual` stays a devDependency so the bundle build still resolves it — move it there).
- [ ] **Step 5:** Update `verify-package.mjs` expected files: require `dist/datagrid.d.ts` + `dist/datagrid.d.cts`; forbid any `dist/types/` path.
- [ ] **Step 6:** `npm run build:package`. Inspect: `head -1 dist/datagrid.js` and `head -1 dist/datagrid.cjs` are `"use client";`. `dist/datagrid.d.ts` exists, contains `DataGridProps`, `GridColumnConfig`, and the distributive union survives (spot-check: the `GridColumnConfig` type still maps over `keyof TData`).
- [ ] **Step 7:** `npx @arethetypeswrong/cli --pack . --exclude-entrypoints ./styles.css` → all green for node10 / node16-CJS / node16-ESM / bundler. `npx publint` → no errors. If api-extractor mangles the generics (known risk with distributive mapped unions), STOP: report BLOCKED with the emitted `.d.ts` excerpt — fallback path is `dts-bundle-generator`, decided by controller.
- [ ] **Step 8:** `npm test && npm run test:package` green.
- [ ] **Step 9:** Commit: `fix(package): rolled-up dual declarations, use-client banner, honest deps, engines`

### Task 3: Harden verify-package.mjs (publint + attw + type-fidelity fixtures)

**Files:**
- Modify: `scripts/verify-package.mjs`
- Modify: `package.json` (devDeps: `publint`, `@arethetypeswrong/cli`)

- [ ] **Step 1:** `npm i -D publint @arethetypeswrong/cli`.
- [ ] **Step 2:** In `verify-package.mjs`, after the existing tarball checks: run `npx publint --strict` (via `run(...)`) and fail on nonzero; run `npx attw --pack . --exclude-entrypoints ./styles.css --format ascii` and fail on nonzero.
- [ ] **Step 3:** Add two **type-fidelity fixtures** compiled against the extracted package in `.tmp/package-smoke` with `tsc --noEmit`:
  - `consumer-esm.ts` + tsconfig `{"module":"nodenext","moduleResolution":"nodenext","strict":true,"jsx":"react-jsx"}`
  - `consumer-cjs.cts` with the same tsconfig.
  Fixture body must exercise the generic surface: define `type Row = { qty: number; name: string }`, build a `GridColumnConfig<Row>[]` where a `qty` column's `formatValue` parameter is checked as `number` (assign to a `number`-typed variable) and include one `// @ts-expect-error` line assigning it to `string`. Symlink `typescript` like the other deps, or resolve the repo's `node_modules/.bin/tsc`.
- [ ] **Step 4:** `npm run test:package` green. Sabotage-check the fixture works: temporarily flip the `@ts-expect-error` line to a plain assignment, confirm the script FAILS, revert.
- [ ] **Step 5:** Commit: `test(package): gate on publint, attw, and node16 type-fidelity fixtures`

---

## Chunk 2: De-Tailwind (spec § 2)

> The Tailwind lib pipeline stays alive until Task 9: during Tasks 4–8, `src/styles.css` gains `@import "./components/DataGrid/datagrid.css";` (Tailwind CLI inlines it via postcss-import) so the shipped CSS carries both old utilities and new `dg-*` rules mid-migration, and `npm run test:package` keeps passing at every commit.

### Task 4: Stylesheet foundation (tokens, scoped reset, dark preset, keyframes)

**Files:**
- Create: `src/components/DataGrid/datagrid.css`
- Modify: `src/styles.css` (drop its duplicated keyframes; add the `@import`)
- Modify: `src/index.css` (drop duplicated `dg-flash-*`/`dg-sheet` keyframes)
- Modify: `src/main.tsx` (add `import "./components/DataGrid/datagrid.css";` before `./index.css`)
- Modify: `src/components/DataGrid/DataGrid.tsx` (root element gains `dg-root` class alongside existing classes)

- [ ] **Step 1:** Create `datagrid.css` with, in order: (1) header comment stating the file is the single styling source of truth, the naming convention, and the no-global-selectors rule; (2) the token block from this plan's "Design tokens" section verbatim; (3) `.dg-theme-dark { ... }` reassigning every token to a legible dark equivalent (bg `#0f172a`, surface `#1e293b`, raised `#1e293b`, hover `#334155`, border `#334155`/strong `#475569`, text `#f1f5f9`/muted `#94a3b8`/faint `#64748b`, accent `#e2e8f0` with accent-text `#0f172a`, danger/success/info lightened for contrast — AA against their backgrounds); (4) the scoped reset:

```css
.dg-root {
  box-sizing: border-box;
  font-family: var(--dg-font-family);
  font-size: var(--dg-font-size);
  color: var(--dg-text);
  line-height: 1.5;
  -webkit-text-size-adjust: 100%;
  tab-size: 4;
}
.dg-root :where(*, ::before, ::after) {
  box-sizing: border-box;
  border-width: 0;
  border-style: solid;
  border-color: var(--dg-border);
}
.dg-root :where(h1, h2, h3, h4, p, figure, blockquote, dl, dd, ul, ol) { margin: 0; padding: 0; }
.dg-root :where(button, input, optgroup, select, textarea) {
  font: inherit; color: inherit; margin: 0; padding: 0;
  background-color: transparent; background-image: none;
}
.dg-root :where(button, [role="button"]) { cursor: pointer; text-transform: none; }
.dg-root :where(button):disabled { cursor: default; }
.dg-root :where(table) { border-collapse: collapse; border-spacing: 0; text-indent: 0; }
.dg-root :where(svg) { display: block; }
.dg-root :where(input)::placeholder, .dg-root :where(textarea)::placeholder { color: var(--dg-text-faint); opacity: 1; }
```

  (5) the `dg-flash-*` keyframes + classes and `dg-sheet` keyframes moved verbatim from `src/styles.css`/`src/index.css`, including the `prefers-reduced-motion` guard. Keyframe names are global — keep the existing `dg-` prefixed names.
- [ ] **Step 2:** `src/styles.css`: delete the duplicated keyframe blocks, add `@import "./components/DataGrid/datagrid.css";` above the `@tailwind` directives. `src/index.css`: delete its duplicated keyframe blocks (demo now gets them from `datagrid.css` via main.tsx import).
- [ ] **Step 3:** Add `dg-root` to the DataGrid root element's className (prepend; keep all current classes).
- [ ] **Step 4:** `npx tsc -b && npm test` green; `npm run build:css` and confirm `dist/datagrid.css` contains `.dg-root` tokens AND still contains Tailwind utilities; `npm run test:package` green.
- [ ] **Step 5:** `npm run dev` — orchestrator visually confirms the demo is unchanged (the scoped reset overlaps preflight, which is already loaded in the demo, so no visible delta expected; the `:where()` reset cannot outrank anything).
- [ ] **Step 6:** Commit: `feat(datagrid): dg-root token layer, scoped reset, dark preset, unified keyframes`

### Task 5: Migrate DataGrid.tsx (core chrome — 87 className sites)

**Files:**
- Modify: `src/components/DataGrid/DataGrid.tsx`
- Modify: `src/components/DataGrid/datagrid.css`
- Modify: any `*.test.tsx` that asserts classes rendered by DataGrid.tsx (grep first)

Covers: root/container, table, thead/header cells/sort indicators/resize handles, body rows (zebra, hover, active, group rows), cells (base, numeric right-align `tabular-nums`, focused ring, editing, selection column), summary bar, pagination footer, detail panel shell, virtualization spacers, fill handle, box-effect wrappers (colorScale/dataBar/flash `<td>` classes — the *classes*, not the inline styles).

- [ ] **Step 1:** Work top-to-bottom through the 11 phase banners. Apply the Migration method. Suggested vocabulary: `dg-container`, `dg-table`, `dg-thead`, `dg-header-cell`, `dg-header-cell--sortable`, `dg-sort-indicator`, `dg-resize-handle`, `dg-row`, `dg-row--zebra`, `dg-row--active`, `dg-row--group`, `dg-cell`, `dg-cell--numeric`, `dg-cell--focused`, `dg-cell--editing`, `dg-select-cell`, `dg-summary-bar`, `dg-pagination`, `dg-detail-panel`, `dg-fill-handle`.
- [ ] **Step 2:** Update class-asserting tests in the same commit (prefer role/semantic-class assertions).
- [ ] **Step 3:** Batch grep from Migration method step 6 over `DataGrid.tsx` → zero Tailwind utilities.
- [ ] **Step 4:** `npx tsc -b && npm test` green.
- [ ] **Step 5:** Commit: `refactor(datagrid): migrate core table chrome to dg-* classes`

### Task 6: Migrate cells, editor, effects, pivot, icons

**Files:** `cells.tsx`, `cellEditor.tsx`, `cellEffectsRender.tsx`, `pivot.tsx`, `icons.tsx` (+ `datagrid.css`, + affected tests — `DataGrid.editing.test.tsx` and `DataGrid.config.test.tsx` are known Tailwind-asserters)

Covers: status pills (`dg-pill` + built-in tone variants used by `getStatusClassName` defaults), grouping value renders, edit input + validation error styles, progress bar / icon-set wrappers, pivot row-label indents, subtotal/grand-total emphasis. Note: `statusStyles` values from consumers pass through untouched.

- [ ] Steps: same Migration method; grep gate over the five files; tests updated; `npx tsc -b && npm test`; commit `refactor(datagrid): migrate cells, editor, effects, pivot to dg-* classes`.

### Task 7: Migrate toolbar family

**Files:** `Toolbar.tsx`, `ToolbarSearch.tsx`, `ToolbarColumns.tsx`, `ToolbarGrouping.tsx`, `ToolbarSavedViews.tsx`, `ToolbarAdvancedControls.tsx`, `ToolbarCompact.tsx` (+ `datagrid.css`, + affected tests)

Shared vocabulary matters here: `dg-toolbar`, `dg-toolbar-group`, `dg-btn`, `dg-btn--primary`, `dg-btn--ghost`, `dg-input`, `dg-menu`, `dg-menu-item`, `dg-menu-item--active`, `dg-drag-handle`, `dg-chip`. Define once, reuse across all seven files.

- [ ] Steps: same Migration method; grep gate; `npx tsc -b && npm test`; commit `refactor(datagrid): migrate toolbar components to dg-* classes`.

### Task 8: Migrate filters, menus, cards, sheet

**Files:** `filters.tsx`, `filterBodies.tsx`, `HeaderColumnMenu.tsx`, `RowActionsMenu.tsx`, `AppliedFilters.tsx`, `CardList.tsx`, `BottomSheet.tsx`, `cellEffectsRender.tsx` leftovers if any (+ `datagrid.css`, + affected tests)

Reuse Task 7's `dg-menu`/`dg-btn`/`dg-input` vocabulary; add `dg-popover`, `dg-filter-*`, `dg-card`, `dg-card-*`, `dg-sheet`, `dg-sheet-backdrop`.

- [ ] Steps: same Migration method; grep gate; `npx tsc -b && npm test`; commit `refactor(datagrid): migrate filters, menus, card layout to dg-* classes`.

### Task 9: Swap the CSS build; delete the Tailwind lib pipeline

**Files:**
- Modify: `package.json` (`build:css` → esbuild minify; devDep `esbuild`)
- Delete: `tailwind.lib.config.js`, `src/styles.css`
- Modify: `src/main.tsx` / `src/index.css` only if they referenced `src/styles.css` (they shouldn't)

- [ ] **Step 1:** Repo-wide gate first — Migration method grep over **all** of `src/components/DataGrid/*.tsx` returns zero Tailwind utilities; also `grep -rn "@tailwind\|tailwind" src/components/DataGrid/` → nothing.
- [ ] **Step 2:** `npm i -D esbuild`; `"build:css": "esbuild src/components/DataGrid/datagrid.css --minify --outfile=dist/datagrid.css"`.
- [ ] **Step 3:** Delete `tailwind.lib.config.js` and `src/styles.css`.
- [ ] **Step 4:** Add to `verify-package.mjs`: assert `dist/datagrid.css` contains `.dg-root` and does **not** contain `--tw-` or a bare `*{` / `body{` / `html{` global selector outside `.dg-root` scoping (cheap regex: fail if `/(^|})\s*(\*|html|body|:root)\s*[,{]/` matches).
- [ ] **Step 5:** `npm test && npm run test:package` green. `wc -c dist/datagrid.css` — expect well under the old 25 KB.
- [ ] **Step 6:** Commit: `build(css): hand-written datagrid.css replaces Tailwind lib pipeline`

### Task 10: Tailwind-free consumer fixture + override-order check

**Files:**
- Modify: `scripts/verify-package.mjs`

- [ ] **Step 1:** Extend the smoke harness with a **CSS isolation + override check** (no bundler needed): write `.tmp/package-smoke/css-check.mjs` that reads `dist/datagrid.css` as text and asserts (a) every top-level selector outside `@keyframes`/`@media` starts with `.dg-` (parse naively by splitting on `}`), (b) keyframe names start with `dg-`.
- [ ] **Step 2:** Add a jsdom render fixture `consumer-render.mjs` run with the repo's vitest **or** plain node + jsdom symlink: render `<DataGrid data={[...3 rows]} columns={[...2 cols]} />` from the **extracted package** inside jsdom, assert it renders `.dg-root` and column headers. Then inject a consumer stylesheet after the package CSS (`<style>.dg-cell { background: rgb(1, 2, 3); }</style>`) and assert `getComputedStyle` on a cell yields the consumer value (override-order criterion). Symlink `jsdom` from root node_modules like other deps.
- [ ] **Step 3:** `npm run test:package` green; sabotage-check: temporarily add `body { margin: 0 }` to `datagrid.css`, confirm css-check FAILS, revert.
- [ ] **Step 4:** Commit: `test(package): css isolation and consumer-override checks`

### Task 11: Dark preset polish + demo toggle

**Files:**
- Modify: `src/App.tsx` (demo-layer theme toggle button applying `dg-theme-dark` — a wrapper class/state on the demo's container plus passing it via the grid's existing `className`-style prop if one exists, else wrapping div)
- Modify: `src/components/DataGrid/datagrid.css` (dark token fixes found during review)

- [ ] **Step 1:** Add the demo toggle (plain demo code; Tailwind allowed here).
- [ ] **Step 2:** Orchestrator reviews dark rendering across grid, pivot, and card modes in the browser; implementer fixes reported contrast/legibility issues by adjusting `.dg-theme-dark` token values (not per-component dark rules — tokens only, unless a rule hardcodes a literal that should have been a token, in which case tokenize it).
- [ ] **Step 3:** `npm test` green. Commit: `feat(datagrid): dark theme polish + demo theme toggle`

### Task 12: Docs — README styling rewrite, CLAUDE.md, AGENTS.md

**Files:** `README.md`, `CLAUDE.md`, `AGENTS.md`

- [ ] **Step 1:** README "Styling" section: one import line (`import "datagrizard/styles.css"` — before your own styles), the token table (name / default / what it controls), `.dg-theme-dark` usage, note that consumer-supplied classes (`statusStyles` etc.) must exist in the consumer's CSS, and that the stylesheet is fully scoped (no global reset). Remove both old Tailwind consumer paths (content-glob instructions and preflight warnings).
- [ ] **Step 2:** CLAUDE.md: update the styling bullets (kill the dual-stylesheet lockstep notes in the "Value-driven cell visual effects" and "Mobile card layout" sections — keyframes now live only in `datagrid.css`), the Commands section (`build:css` description, no tailwind.lib.config.js), dependency notes (icons are local SVGs; react-virtual bundled, no runtime deps), packaging notes (rolled-up d.ts/d.cts, use-client banner, publint/attw in test:package).
- [ ] **Step 3:** AGENTS.md: add the class-naming convention (from this plan) and the rule "styling changes go in datagrid.css; no Tailwind utilities inside src/components/DataGrid/".
- [ ] **Step 4:** Commit: `docs: styling/theming API, packaging and contribution-rule updates`

---

## Chunk 3: CI (spec § 4)

### Task 13: GitHub Actions workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1:** Create:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npx tsc -b
      - run: npm test
      - run: npm run test:package

  react-18:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm i --no-save react@18 react-dom@18 @types/react@18 @types/react-dom@18
      - run: npm test
```

- [ ] **Step 2:** Locally simulate the react-18 leg: run its two npm commands, then `git checkout -- package.json package-lock.json && npm ci` to restore. If the suite is red under React 18: STOP, report BLOCKED with the failures — controller decides between fixing and switching peers to `>=19` (which would also delete this job).
- [ ] **Step 3:** Validate YAML (`npx yaml-lint` or a node one-liner with `js-yaml` if available; otherwise careful review).
- [ ] **Step 4:** Commit: `ci: type-check, tests, package verification, react-18 matrix leg`

---

## Final verification (orchestrator, end state)

- [ ] `npm run build:package && npm run test:package` green (covers attw, publint, type fixtures, CSS isolation, override order).
- [ ] `npx tsc -b && npm test` green.
- [ ] Demo pixel-parity: compare against baseline screenshots (grid, pivot, card, filters open, menus open) captured on `main` before Task 4.
- [ ] Dark preset legible in grid/pivot/card.
- [ ] `grep -rE "(bg|text|border|ring)-(slate|white|rose|emerald|blue|red)" src/components/DataGrid/*.tsx` → zero.
- [ ] Dispatch final code-reviewer over the whole branch diff.
