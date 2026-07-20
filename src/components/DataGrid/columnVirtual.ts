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
