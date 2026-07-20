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
