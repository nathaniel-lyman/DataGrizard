import type { ReactNode } from "react";

export type GridDataType =
  | "text"
  | "number"
  | "currency"
  | "percent"
  | "status"
  | "date"
  | "boolean";

export type GridSemanticAllowedValue = string | number | boolean | null;

/**
 * Optional, domain-neutral business meaning for a column. DataGrizard exposes
 * this metadata through its serializable snapshot and uses it to generate
 * agent tool schemas; it never interprets a sensitivity label on its own.
 */
export type GridColumnSemanticMetadata = {
  description?: string;
  synonyms?: string[];
  unit?: string;
  /** ISO 4217 code when the values represent money (for example, "USD"). */
  currency?: string;
  allowedValues?: GridSemanticAllowedValue[];
  /** Consumer-defined policy label, such as "public" or "restricted". */
  sensitivity?: string;
};

export type GridConditionalFormat<TValue = unknown, TData = unknown> = {
  when: (value: TValue, row: TData) => boolean;
  className: string;
};

/**
 * Continuous background shading across the column's numeric domain. Two colors
 * interpolate min→max; three colors give a diverging scale through a midpoint.
 * The domain defaults to the column's min/max over the filtered rows; pass an
 * explicit `domain` to pin it (required for a stable scale in server mode).
 */
export type GridColorScale = {
  colors: [string, string] | [string, string, string];
  domain?: [number, number] | { min?: number; mid?: number; max?: number };
  /** Pick a readable (black/white) text color per cell background. Default true. */
  autoTextColor?: boolean;
};

/**
 * In-cell horizontal bar drawn behind the value, proportional to the value's
 * position in the domain. When the domain spans zero the bar grows from a center
 * baseline (positive right, negative left). Domain defaults to filtered min/max.
 */
export type GridDataBar = {
  /** Fill color for non-negative values. */
  color?: string;
  /** Fill color for negative values. Defaults to a red token. */
  negativeColor?: string;
  domain?: [number, number];
  /** Render the formatted value over the bar. Default true. */
  showValue?: boolean;
};

export type GridIconSetRule<TValue = unknown, TData = unknown> = {
  when: (value: TValue, row: TData) => boolean;
  icon: ReactNode;
  className?: string;
};

/**
 * Renders an icon alongside (or instead of) the value, chosen by the first
 * matching rule. Domain-neutral: the consumer supplies the icon node. See the
 * shipped `trendIconSet` helper for the common up/down/flat case.
 */
export type GridIconSet<TValue = unknown, TData = unknown> = {
  rules: GridIconSetRule<TValue, TData>[];
  /** Where the icon sits relative to the value. Default "before". */
  position?: "before" | "after" | "only";
};

/**
 * Renders a `percent`-type cell as a 0–100% progress bar. Domain defaults to
 * [0, 1] (the percent convention used by the formatters). Ignored on other types.
 */
export type GridProgressBar = {
  color?: string;
  domain?: [number, number];
  /** Show the formatted percent inside the bar. Default true. */
  showLabel?: boolean;
};

/**
 * Flashes the cell when its value changes (inline edit or live `dataMode="server"`
 * refresh): green-up / red-down for numerics, neutral for other types. Seeded
 * silently on mount, so only changes that happen while the grid is mounted flash.
 */
export type GridFlashOnChange = {
  upClassName?: string;
  downClassName?: string;
  /** Animation/clear duration in ms. Default 1200. */
  duration?: number;
};

/** Props handed to a custom cell editor via `column.renderEditCell`. */
export type GridEditCellProps<TData, K extends Extract<keyof TData, string>> = {
  value: TData[K];
  row: TData;
  onChange: (next: TData[K]) => void;
  commit: () => void;
  cancel: () => void;
  error: string | null;
};

type GridColumnConfigForKey<TData, K extends Extract<keyof TData, string>> = {
  accessorKey: K;
  header: string;
  dataType: GridDataType;
  /** Business meaning used by generic agent/schema integrations. */
  semantic?: GridColumnSemanticMetadata;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  pinned?: "left" | "right";
  enablePinning?: boolean;
  enableGrouping?: boolean;
  /** Opt this column out of auto-provisioned filtering. Default true. */
  enableFiltering?: boolean;
  /** Per-column sorting opt-out; features.sorting remains the master switch. */
  enableSorting?: boolean;
  /** Date columns: Intl options for this column's display, overriding the grid-level `dateFormat`. */
  dateFormat?: Intl.DateTimeFormatOptions;
  /** Cell value is typed as the field's own type, e.g. `TData["revenue"]`. */
  formatValue?: (value: TData[K], row: TData) => ReactNode;
  formatGroupingValue?: (value: TData[K], rows: TData[]) => ReactNode;
  getGroupingValue?: (row: TData) => unknown;
  getCellClassName?: (value: TData[K], row: TData) => string;
  getStatusClassName?: (value: TData[K], row: TData) => string;
  /**
   * Declarative alternative to getStatusClassName: maps a raw status value to a
   * pill className. getStatusClassName, when provided, takes precedence.
   */
  statusStyles?: Record<string, string>;
  /**
   * Declarative conditional cell formatting. Every rule whose `when` predicate
   * matches contributes its className. Composes with getCellClassName.
   */
  conditionalFormats?: GridConditionalFormat<TData[K], TData>[];
  /** Continuous value→background shading. See {@link GridColorScale}. */
  colorScale?: GridColorScale;
  /** In-cell bar proportional to value. See {@link GridDataBar}. */
  dataBar?: GridDataBar;
  /** Icon chosen by value. See {@link GridIconSet}. */
  iconSet?: GridIconSet<TData[K], TData>;
  /** Render a `percent` cell as a progress bar. See {@link GridProgressBar}. */
  progressBar?: boolean | GridProgressBar;
  /** Flash the cell on value change. See {@link GridFlashOnChange}. */
  flashOnChange?: boolean | GridFlashOnChange;
  /** Whether this column's cells can be edited (static or per-row). */
  editable?: boolean | ((row: TData) => boolean);
  /** Returns an error message (non-null blocks commit). When provided, it fully
   * owns validation — the built-in numeric/date checks are skipped. */
  validate?: (value: TData[K], row: TData) => string | null;
  /** Converts the editor's string input to the typed value. Defaults per dataType. */
  parseValue?: (input: string) => TData[K];
  /** Full editor override; receives value/onChange/commit/cancel/error. */
  renderEditCell?: (props: GridEditCellProps<TData, K>) => ReactNode;
};

/**
 * A column definition. Distributes over the keys of `TData` so each column's
 * value-typed callbacks (formatValue, getCellClassName, conditionalFormats…)
 * receive `TData[accessorKey]` rather than `unknown`.
 */
export type GridColumnConfig<TData> = {
  [K in Extract<keyof TData, string>]: GridColumnConfigForKey<TData, K>;
}[Extract<keyof TData, string>];

export type GridFilterType = "select" | "multiSelect" | "range" | "text" | "date" | "boolean";

export type GridFilterOperator =
  | "is"
  | "isNot"
  | "isAnyOf"
  | "isNoneOf"
  | "contains"
  | "notContains"
  | "startsWith"
  | "endsWith"
  | "equals"
  | "notEquals"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between"
  | "before"
  | "onOrBefore"
  | "after"
  | "onOrAfter"
  | "isEmpty"
  | "isNotEmpty";

export type GridFilterValue = {
  operator: GridFilterOperator;
  value?: unknown;
};

export type GridFilterConfig<TData> = {
  accessorKey: Extract<keyof TData, string>;
  /** Defaults to the column's `header`. */
  label?: string;
  /** Set false to opt this column out of filtering even under auto-provision. */
  filterable?: boolean;
  /** Defaults to a control inferred from the column's dataType. */
  filterType?: GridFilterType;
  /** Default operator for this filter. If omitted, the filter type chooses one. */
  operator?: GridFilterOperator;
  /** Restrict which operators appear in the filter UI. */
  operators?: GridFilterOperator[];
  options?: string[];
  formatOption?: (value: string) => string;
  /** Range-filter bounds (filterType: "range"). */
  min?: number;
  max?: number;
  step?: number;
  /** Placeholder for the text filter input (filterType: "text"). */
  placeholder?: string;
  /** Display options for date-filter bounds (filterType: "date"). */
  dateFormat?: Intl.DateTimeFormatOptions;
  /** Show quick date presets (filterType: "date"). Defaults to true. */
  presets?: boolean;
};

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
