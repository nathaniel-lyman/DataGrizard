# Adoption-Readiness Spec

**Status:** local implementation complete (2026-07-09). Work packages A-C and
the local documentation/theming surface are implemented and verified. Registry
publication, the live Next.js consumer check, demo deployment, and release/tag
steps remain explicitly deferred to the owner-facing release package.

**Goal:** a stranger can `npm install datagrizard`, import one component and one
stylesheet into an existing app — any CSS setup, any framework, light or dark
theme — and have a working, restylable grid in minutes.

**Owner decision already made:** Tailwind is **dropped from the library**. It was
the source of the complicated styling contract (consumers adding our package to
their Tailwind `content` globs, v3-vs-v4 config differences, `prefix` foot-guns,
preflight leaking a global reset). The library moves to prefixed semantic
classes (`dg-*`) styled by hand-written CSS with custom properties. Tailwind may
remain in the **demo app only** (see Q1).

---

## 1. Context — what exists today

Read `CLAUDE.md` and `AGENTS.md` first; they describe the architecture and
contribution rules. Facts relevant to this spec, verified 2026-07-06:

- The product is one component, `src/components/DataGrid/` (37 source files,
  ~281 `className=` sites). Public boundary: `src/components/DataGrid/index.ts`.
- **Not yet published to npm** (`npm view datagrizard` → 404). Version 0.1.0,
  changelog entirely under "Unreleased".
- **Styling today:** Tailwind utility classes hardcoded in TSX (~300 color
  utilities, all light-theme `slate-*`; zero CSS variables, zero `dark:`
  variants). Two consumer paths documented in README: (1) consumer adds the
  package to their Tailwind content globs, or (2) imports precompiled
  `dist/datagrid.css`, which includes **Tailwind preflight — a global CSS reset
  that restyles the host app**. Both paths are being replaced by this spec.
- **Library CSS build:** `npm run build:css` runs Tailwind CLI with
  `tailwind.lib.config.js` over `src/styles.css` → `dist/datagrid.css` (25 KB).
  `src/styles.css` also holds hand-written keyframes (`dg-flash-*`, `dg-sheet`)
  which are **duplicated in `src/index.css`** (the demo stylesheet) — a
  documented lockstep in CLAUDE.md that this migration should eliminate.
- **Type packaging is broken for `moduleResolution: node16/nodenext`**
  (verified with `npx @arethetypeswrong/cli --pack .`):
  - node16-from-CJS: "Masquerading as ESM" — `exports["."]` has a single
    `types` file; because the package is `"type": "module"`, the `.d.ts` is
    ESM-flavored against the `.cjs` runtime.
  - node16-from-ESM: "Internal resolution error" — 40 loose `.d.ts` files under
    `dist/types/` use extensionless relative imports (`from "./pivot"`).
  - Bundler resolution is green (which is why `npm run test:package` passes).
  - `npx publint` flags the same `types`/require mismatch, plus missing
    `engines.node`.
- **No `"use client"` banner** in `dist/datagrid.js` → hook errors when
  imported from a Next.js App Router server component.
- **Dependency double-declaration:** `@tanstack/react-virtual` and
  `lucide-react` are in `dependencies` but are **bundled** (only react,
  react-dom, react/jsx-runtime, @tanstack/react-table are externalized in
  `vite.lib.config.ts`). Consumers install copies they never execute.
  `lucide-react` supplies ~17 icons total (`icons.tsx` imports 15,
  `trendIconSet.tsx` imports 3, overlapping `Minus`).
- **React peers say `>=18`** but everything (dev, tests, emitted declarations)
  runs against React 19 / `@types/react@19`. The claim is untested.
- **No CI** (no `.github/` directory). No automated check would have caught the
  attw/publint failures.
- **No live demo, no README screenshot.** A `screenshots/` directory exists;
  8 debugging PNGs and a snapshot .md sit at the repo root.
- Bundle: `dist/datagrid.js` 239 KB / ~57 KB gzip; CJS 161 KB; CSS 25 KB.
- Two test files assert Tailwind color classes directly
  (`DataGrid.editing.test.tsx`, `DataGrid.config.test.tsx`) — they will need
  updating in the CSS migration. Other tests may assert classes indirectly;
  grep before assuming.

---

## 2. Work package A — de-Tailwind the library (semantic classes + CSS variables)

The largest package, and the prerequisite for the theming story. Direction:
what AG Grid does — prefixed semantic class names, one shipped stylesheet,
themable via CSS custom properties.

### A1. Design tokens

Define a small set of CSS custom properties on the grid root (working set —
final list emerges during migration):

```
--dg-bg, --dg-surface (headers/toolbars), --dg-surface-raised (menus/popovers),
--dg-border, --dg-border-strong,
--dg-text, --dg-text-muted, --dg-text-faint,
--dg-accent, --dg-accent-text, --dg-accent-bg (selection/focus/active states),
--dg-danger, --dg-success, --dg-warning (+ matching -bg variants),
--dg-radius, --dg-font-family, --dg-font-size, --dg-shadow
```

- Defaults on `.dg-root` reproduce the **current slate light theme exactly** —
  this migration must be pixel-neutral by default (verify by before/after
  screenshots of the demo).
- Provide `.dg-theme-dark` (a class that reassigns the variables) as the
  built-in dark preset. Do **not** auto-switch on `prefers-color-scheme`; the
  consumer opts in by adding the class (see Q2).
- Document the variables in the README as the theming API.

### A2. Class migration

- Replace every Tailwind utility string in `src/components/DataGrid/**` with
  semantic classes: `dg-header-cell`, `dg-toolbar`, `dg-cell`, `dg-cell-numeric`,
  `dg-pill`, `dg-menu`, `dg-menu-item`, `dg-filter-popover`, `dg-card`, … Reuse
  the existing `dg-` prefix convention (`dg-flash-*`, `dg-sheet` already exist).
  Naming: flat, kebab-case, state via modifier classes (`dg-cell--focused` or
  `is-focused` — pick one convention and state it in AGENTS.md).
- Write the stylesheet by hand in a new `src/components/DataGrid/datagrid.css`
  (single source of truth; kills the `src/styles.css` / `src/index.css`
  keyframe duplication — demo imports the same file).
- Structure the shipped file as:
  1. `@layer datagrizard { ... }` wrapping **everything** — layered styles lose
     to consumers' unlayered styles, so consumer overrides (`statusStyles`,
     `getRowClassName`, their own `.dg-*` overrides) win by construction.
  2. A scoped reset **inside the layer, under `.dg-root`** replacing preflight:
     `box-sizing: border-box`, `border: 0 solid var(--dg-border)`,
     button/input font + background normalization, margins zeroed on elements
     the grid renders. ~20–40 lines. No global selectors anywhere in the file.
  3. Token defaults on `.dg-root`, `.dg-theme-dark` overrides.
  4. Component rules.
- Keep dynamic styling that is currently inline (colorScale backgrounds,
  dataBar geometry from `cellEffects.ts`) as inline styles — that machinery is
  value-driven and doesn't change.
- **Consumer-supplied class names** (`statusStyles`, `conditionalFormats`,
  `getCellClassName`, `getRowClassName`) remain pass-through strings — that
  contract doesn't change. The demo's own Tailwind classes keep working because
  the demo has its own Tailwind build.

### A3. Build/config cleanup

- `build:css` becomes a copy/minify step (e.g. `lightningcss` or `esbuild
  --minify`) of `datagrid.css` → `dist/datagrid.css`. Delete
  `tailwind.lib.config.js`. Remove `tailwindcss`/`postcss`/`autoprefixer` from
  devDependencies **if** the demo also drops Tailwind (Q1); otherwise they stay
  for the demo only.
- Alternative worth evaluating in planning: import the CSS from the entry and
  let Vite lib mode emit it, if that simplifies the pipeline. Keep the
  `datagrizard/styles.css` export path and `sideEffects` either way.
- Autoprefixing: the current browser floor is whatever Tailwind emitted.
  Decide (plan-time) whether to keep autoprefixer in the pipeline or declare a
  modern `browserslist`.

### A4. Tests, docs, demo

- Update the two class-asserting test files; sweep all tests for Tailwind
  class assumptions. Prefer asserting semantic classes (`dg-pill`) or roles
  over color utilities.
- Rewrite README "Styling" to: one import line, the variable table, the dark
  preset, and the note that consumer-supplied classes must exist in the
  consumer's own CSS.
- Update CLAUDE.md and AGENTS.md (styling rules, the removed dual-stylesheet
  lockstep, the class-naming convention).
- Demo verification: run the demo importing **only** the packaged CSS path in
  a Tailwind-free harness (extend `scripts/verify-package.mjs` or a tiny
  fixture app) — this is the regression net for everything preflight was
  silently providing.

**Acceptance criteria:** demo is pixel-equivalent by default; no global
selectors in shipped CSS; grep finds zero Tailwind utilities under
`src/components/DataGrid/`; dark preset renders legibly across grid + pivot +
card modes; `npm run test:package` passes with the new CSS.

---

## 3. Work package B — packaging correctness

1. **Roll up declarations** to a single `dist/datagrid.d.ts` + `datagrid.d.cts`
   (options: `vite-plugin-dts` with `rollupTypes: true`, API Extractor, or
   moving the lib build to `tsup`; evaluate in planning — must handle the
   `TData` generics and the distributive `GridColumnConfig` union faithfully).
   Update `exports`:

   ```json
   ".": {
     "import": { "types": "./dist/datagrid.d.ts", "default": "./dist/datagrid.js" },
     "require": { "types": "./dist/datagrid.d.cts", "default": "./dist/datagrid.cjs" }
   },
   "./styles.css": "./dist/datagrid.css",
   "./package.json": "./package.json"
   ```

   Top-level `types` points at the ESM `.d.ts`. Delete the `dist/types/` tree
   from the package.
2. **`"use client"` banner** on both bundles via
   `rollupOptions.output.banner: '"use client";'` in `vite.lib.config.ts`.
3. **Dependencies:** decide bundle-vs-externalize (Q3/Q4). Default
   recommendation: inline the ~17 lucide icons as plain SVG components and
   delete `lucide-react` entirely (matches the existing `icons.tsx` inline-SVG
   intent); keep `@tanstack/react-virtual` bundled and **remove it from
   `dependencies`** (it's an implementation detail; bundling avoids peer-range
   coordination).
4. **Misc:** add `engines.node` (match CI matrix); keep `sideEffects` accurate.
5. **Extend `scripts/verify-package.mjs`** to run `publint` and
   `@arethetypeswrong/cli --pack` and fail on errors (attw's `styles.css` 💀
   rows are a known false positive for CSS subpaths — configure ignores rather
   than skipping the tool).

**Acceptance criteria:** attw green for node10/node16-CJS/node16-ESM/bundler on
the `.` entry; publint clean; `npm run test:package` covers all of it.

---

## 4. Work package C — CI

`.github/workflows/ci.yml` on PR + push to main:

1. `npm ci`
2. `npx tsc -b` (the only type gate — there is deliberately no ESLint)
3. `npm test`
4. `npm run test:package` (now including publint + attw from B5)

React-version matrix: pending Q5. If React 18 support is kept, add a job that
installs `react@18 react-dom@18 @types/react@18` and runs the test suite; if
not, change peers to `>=19` before first publish (cheaper).

---

## 5. Work package D — release

1. Decide first-publish version (suggest `0.2.0` — the CSS contract changes
   relative to the never-published 0.1.0 README).
2. Move the changelog "Unreleased" block to the version heading; add a
   "Styling" migration note even though no external consumers exist yet.
3. `npm publish --access public` (owner runs it — needs their npm account/2FA;
   see Q6). Optional, later: release automation (changesets/release-please).
   Not required for v1 of this effort.
4. Tag the release on GitHub with the changelog excerpt.

---

## 6. Work package E — docs, demo, trust signals

1. **Deploy the demo** (host per Q7) and link it in README line ~3. The demo
   build is `npm run build` (static output in `dist/` — note it clobbers the
   package build; keep the two builds in separate CI jobs/artifacts).
2. **README top:** add a screenshot or short GIF (grid + pivot; assets exist
   under `screenshots/`, or capture fresh post-retheme). Add a 3–4 sentence
   "why this vs AG Grid / MUI X / headless TanStack" positioning paragraph.
3. **Repo hygiene (completed 2026-07-10):** pivot-debug captures now live in
   `screenshots/pivot-debug-2026-06-24/`; historical plans and implementation
   specs now live under `docs/internal/`. This adoption-readiness spec remains
   at `docs/` because it tracks the public release boundary.
4. README styling section rewrite ships with package A (§ 2.A4).

---

## 7. Sequencing and dependencies

```
A (de-Tailwind + tokens)  ──┐
B (packaging correctness) ──┼──> C (CI) ──> D (publish) ──> E2/E3 anytime; E1 after A
```

- A and B are independent; they can run in parallel branches, but **A lands
  first** if serialized, because B's verify tooling (attw/publint in
  test:package) should gate A's build changes too.
- C wants A+B merged so the pipeline it freezes is the final one.
- D is blocked by A, B, C and by answers to Q5/Q6.
- Each package is test-first where behavior changes (per AGENTS.md); A is
  mostly mechanical restyling where the "test" is the pixel-parity +
  packaged-CSS demo check.

---

## 8. Open questions — ask the owner before planning

1. **Demo app Tailwind (Q1):** keep Tailwind for `src/App.tsx` / `src/demo/`
   only (recommended: it doubles as proof that a Tailwind consumer coexists
   cleanly), or purge it repo-wide for a single-stylesheet codebase?
2. **Dark mode surface (Q2):** is an opt-in `.dg-theme-dark` class enough for
   v1, or do you want a `theme` prop on `DataGrid` (`"light" | "dark" |
   "custom"`) that applies the class for the consumer?
3. **lucide-react (Q3):** OK to inline the ~17 icons as local SVG components
   and drop the dependency? (`trendIconSet` is public API — its icons would
   become local SVGs too; confirm that's acceptable.)
4. **react-virtual (Q4):** keep bundling (and remove from `dependencies`), or
   externalize as a real dependency? Bundling recommended.
5. **React 18 (Q5):** support it (adds a CI matrix leg + testing against
   `@types/react@18`) or set peers to `>=19`? What do your target consumers run?
6. **npm publish (Q6):** is the `datagrizard` name final, do you have the npm
   account ready, and do you want to run `npm publish` yourself or set up a
   granular automation token for CI publishing?
7. **Demo hosting (Q7):** GitHub Pages (free, same repo) or Vercel? Any custom
   domain?
8. **CJS (Q8):** keep the dual ESM+CJS build (status quo, assumed by § 3), or
   go ESM-only (halves the packaging surface; rules out `require()` consumers
   on older Node/Jest setups)?
9. **Browser floor (Q9):** `@layer` requires Chrome/Edge 99+, Safari 15.4+,
   Firefox 97+ (all March 2022). Acceptable floor? If yes, autoprefixer can
   likely be dropped; if you need older browsers, the layer strategy needs a
   fallback and A2's plan must say so.

---

## 9. Verification checklist (end state)

- [ ] `npm view datagrizard` resolves; `npm i datagrizard` + one import + one
      CSS line renders the grid in a fresh Vite app with **no Tailwind**.
- [ ] Same in a fresh Next.js App Router page **without** a `"use client"`
      wrapper written by the consumer.
- [x] Host-app styles outside the grid are untouched by `datagrizard/styles.css`
      (no preflight bleed).
- [x] A consumer class passed via `statusStyles`/`getRowClassName` visibly wins
      over the grid's default styling (layer ordering works).
- [x] `.dg-theme-dark` renders grid, pivot, card, and filter-sheet modes legibly.
- [x] attw + publint clean; local tests/package gates green; CI workflow added;
      README quick start is covered by the extracted-package consumer fixture.
- [x] CLAUDE.md / AGENTS.md updated (styling rules, build pipeline, naming).
