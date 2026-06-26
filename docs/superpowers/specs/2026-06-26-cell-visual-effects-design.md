# DataGrid — Value-Driven Cell Visual Effects

**Date:** 2026-06-26
**Status:** Approved (section-by-section), implementing.

## Summary

Add five value-driven visual effects to `DataGrid` cells, declared per column on the
public `GridColumnConfig`. Today's `conditionalFormats` are *binary* predicates → static
class. These add *continuous, value-relative* visualization plus per-value adornments.

Scope decisions (made during brainstorming):
- **Grid mode only.** Pivot measure columns are out of scope for v1.
- **Negatives supported.** Data bars use a zero baseline when the domain crosses zero;
  color scales support a diverging midpoint.
- **API style A:** flat per-effect props (mirrors `conditionalFormats` / `statusStyles`),
  not a grouped `visual` object.
- Icon set is **domain-neutral**: consumer supplies the icon node; a lucide-backed
  `trendIconSet` helper ships for the common ▲▼ case (lucide-react is already a bundled
  dependency).

## Public API (new optional props on `GridColumnConfig<TData>`)

```ts
colorScale?: {
  colors: [string, string] | [string, string, string]; // 2-pt min→max | 3-pt diverging
  domain?: [number, number] | { min?: number; mid?: number; max?: number }; // default auto
  autoTextColor?: boolean; // default true — readable fg over the tint
};
dataBar?: {
  color?: string; negativeColor?: string;
  domain?: [number, number]; // default auto over filtered rows (incl. negatives)
  showValue?: boolean;       // default true
};
iconSet?: {
  rules: { when: (value: TData[K], row: TData) => boolean; icon: ReactNode; className?: string }[];
  position?: "before" | "after" | "only"; // default "before"
};
progressBar?: boolean | { color?: string; domain?: [number, number]; showLabel?: boolean }; // percent cols
flashOnChange?: boolean | { upClassName?: string; downClassName?: string; duration?: number };
```

Shipped helper: `trendIconSet({ positiveColor?, negativeColor?, neutralColor?, threshold? })`.

## Per-column domain subsystem

- `colorScale` + `dataBar` need each column's numeric min/max (and midpoint for diverging).
- `DataGrid.tsx` computes `Map<columnId, { min, max }>` via `useMemo` over the **filtered**
  row model, only for columns declaring those effects without an explicit `domain`.
- **Server mode:** filtered model = loaded page, so domain is page-scoped (documented like
  the other `dataModeFeatureDefaults` degradations); explicit `domain` opts out.
- Pure helpers live in `cellEffects.ts`: `interpolateColor`, `getReadableTextColor`,
  `computeBarGeometry`, domain resolvers.

## Rendering, composition, a11y

- Layering back→front: colorScale bg → dataBar fill → flash overlay → icon + value/progress.
- All five compose. `getCellClassName` / `conditionalFormats` classes win over the
  colorScale inline background (explicit rule beats continuous scale).
- Value text always rendered (never color-only). `autoTextColor` picks readable fg.
- Numerics keep right-align + `tabular-nums`. Progress bars get `role="progressbar"` +
  `aria-valuenow/min/max`.
- All animation wrapped in `@media (prefers-reduced-motion: reduce)`; flash degrades to a
  brief static tint. Keyframes ship in the precompiled `datagrid.css`.

## Flash-on-change mechanics (virtualization-safe)

- Grid-level previous-value memory keyed `${rowId}:${columnId}`, updated in a `useEffect`
  keyed on `data` (avoids strict-mode render hazards). First run **seeds silently** (no
  flash on mount).
- On a data change, changed numeric cells get a `flashMap` entry `{ dir, token }`; the
  cell renders a keyed overlay span (`key={token}`) so the one-shot CSS animation restarts.
- Entries are removed after `duration` (timer guarded by token), so scroll-back after
  expiry does not re-flash. Survives cell unmount because the map is grid-level state.
- Triggers identically for inline edits (consumer mutates `data`) and `dataMode="server"`
  refreshes — keyed off the actual data value, not the edit event.

## Files

- New: `cellEffects.ts` (pure), `cellEffects.tsx` (render pieces), `trendIconSet.tsx`,
  `DataGrid.effects.test.tsx`, `cellEffects.test.ts`.
- Modified: `types/grid.ts`, `cells.tsx` (`AnyColumnConfig` + iconSet/progressBar in
  `renderCellValue`), `DataGrid.tsx` (domain memo, flash state, td layering), `index.ts`
  (exports + `trendIconSet`), `index.css` (keyframes + reduced-motion).
- Demo: retail config wires one column per effect.

## Testing (test-first)

Pure: color interpolation at min/mid/max, readable-text pick, bar geometry incl. negative
baseline, domain resolution. Behavioral: heatmap bg ordering, bar widths/baseline, icon
rule matching + position, progress role/value, flash up/down + no-flash-on-mount +
no-flash-on-scroll-back, server-mode page-scoped domain, reduced-motion, value-always-present.
