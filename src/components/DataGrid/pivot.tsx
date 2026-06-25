import { type ReactNode } from "react";
import {
  type ColumnDef,
  type ExpandedState,
  type PaginationState,
  type SortingFn,
  type SortingState,
} from "@tanstack/react-table";
import { MinusIcon, PlusIcon } from "./icons";
import {
  asText,
  getSourceValue,
  groupId,
  isExpanded,
  leafId,
  measureColumnId,
  segmentId,
  stableValueKey,
  type PivotSourceColumn,
} from "./pivotHelpers";
import {
  buildColumnBuckets,
  collectValueBuckets,
  computeValues,
  type PivotColumnBucket,
} from "./pivotColumns";

export const PIVOT_ROW_LABEL_COLUMN_ID = "pivot:rowLabel";

export type DataGridPivotColumnAxis = {
  columnId: string;
  order?: "asc" | "desc";
};

export type DataGridPivotPaginationMode = "topLevelGroups" | "visibleRows";

export type DataGridPivotSelectionMode = "groups" | "leaves" | "sourceRows" | "mixed";

export type DataGridPivotState = {
  rows: string[];
  columns?: DataGridPivotColumnAxis[];
  measures: string[];
  expanded?: ExpandedState;
  showGrandTotals?: boolean;
  showSubtotals?: boolean;
  paginationMode?: DataGridPivotPaginationMode;
};

export type PivotRowKind = "group" | "leaf" | "subtotal" | "grandTotal";

export type PivotGroupPathSegment = {
  columnId: string;
  value: unknown;
  label: ReactNode;
  stableKey: string;
};

export type PivotRow<TData extends object> = {
  __pivot: true;
  __kind: PivotRowKind;
  __id: string;
  __depth: number;
  __sourceRows: TData[];
  __leafRow?: TData;
  __groupPath: PivotGroupPathSegment[];
  __values: Record<string, unknown>;
  __canExpand?: boolean;
  __isExpanded?: boolean;
  __label: ReactNode;
  __labelText: string;
};

export type DataGridPivotAggregationContext<TData extends object> = {
  columnId?: string;
  measureId: string;
  rowPath: PivotGroupPathSegment[];
  columnPath: PivotGroupPathSegment[];
};

export type DataGridPivotCellContext<TData extends object, TValue = unknown> = {
  value: TValue;
  sourceRows: TData[];
  row: PivotRow<TData>;
  measure: DataGridPivotMeasure<TData, TValue>;
  rowPath: PivotGroupPathSegment[];
  columnPath: PivotGroupPathSegment[];
  scope: "cell" | "rowTotal" | "columnTotal" | "grandTotal";
};

export type DataGridPivotAggregation<TData extends object, TValue> =
  | "count"
  | "sum"
  | "avg"
  | "min"
  | "max"
  | ((rows: TData[], context: DataGridPivotAggregationContext<TData>) => TValue);

export type DataGridPivotMeasure<TData extends object, TValue = unknown> = {
  id: string;
  label: string;
  columnId?: Extract<keyof TData, string>;
  aggregation: DataGridPivotAggregation<TData, TValue>;
  format?: (value: TValue, context: DataGridPivotCellContext<TData, TValue>) => ReactNode;
  cell?: (context: DataGridPivotCellContext<TData, TValue>) => ReactNode;
  sortFn?: SortingFn<PivotRow<TData>>;
  className?: string | ((context: DataGridPivotCellContext<TData, TValue>) => string);
  drillThrough?: (context: DataGridPivotCellContext<TData, TValue>) => void;
  totalBehavior?: "aggregate" | "sumVisibleChildren" | "blank" | "custom";
};

export type DataGridPivotRowLabelColumnConfig<TData extends object> = {
  header?: ReactNode;
  size?: number;
  minSize?: number;
  maxSize?: number;
  formatLeafLabel?: (row: TData) => ReactNode;
};

export type DataGridPivotConfig<TData extends object> = {
  rows?: string[];
  columns?: DataGridPivotColumnAxis[];
  measures?: DataGridPivotMeasure<TData>[];
  defaultState?: Partial<DataGridPivotState>;
  rowLabelColumn?: DataGridPivotRowLabelColumnConfig<TData>;
  selectionMode?: DataGridPivotSelectionMode;
  showLeafRows?: boolean;
};

export type PivotMaterialization<TData extends object> = {
  data: PivotRow<TData>[];
  columns: ColumnDef<PivotRow<TData>, unknown>[];
  metadata: {
    generatedColumnIds: string[];
    sourceRows: TData[];
    topLevelGroupCount: number;
  };
};

type MaterializePivotOptions<TData extends object> = {
  sourceRows: TData[];
  sourceColumns: PivotSourceColumn<TData>[];
  pivot: DataGridPivotState;
  pagination: PaginationState;
  measures: DataGridPivotMeasure<TData>[];
  sorting: SortingState;
  getRowId?: (row: TData, index: number) => string;
  getRowLabel?: (row: TData) => string;
  rowLabelColumn?: DataGridPivotRowLabelColumnConfig<TData>;
  showLeafRows?: boolean;
  onToggleRow: (rowId: string) => void;
  onLeafClick?: (row: TData) => void;
  hasLeafRowAction: boolean;
  enableSorting: boolean;
  enableColumnVisibility: boolean;
  enableColumnResizing: boolean;
  enableColumnPinning: boolean;
};

const comparePivotRows = <TData extends object>(
  a: PivotRow<TData>,
  b: PivotRow<TData>,
  sorting: SortingState,
) => {
  for (const sort of sorting) {
    const aValue = sort.id === PIVOT_ROW_LABEL_COLUMN_ID ? a.__labelText : a.__values[sort.id];
    const bValue = sort.id === PIVOT_ROW_LABEL_COLUMN_ID ? b.__labelText : b.__values[sort.id];
    const aNumber = Number(aValue);
    const bNumber = Number(bValue);
    const result =
      Number.isFinite(aNumber) && Number.isFinite(bNumber)
        ? aNumber - bNumber
        : String(aValue ?? "").localeCompare(String(bValue ?? ""));

    if (result !== 0) {
      return sort.desc ? -result : result;
    }
  }

  return 0;
};

export function materializePivot<TData extends object>({
  sourceRows,
  sourceColumns,
  pivot,
  pagination,
  measures,
  sorting,
  getRowId,
  getRowLabel,
  rowLabelColumn,
  showLeafRows = false,
  onToggleRow,
  onLeafClick,
  hasLeafRowAction,
  enableSorting,
  enableColumnVisibility,
  enableColumnResizing,
  enableColumnPinning,
}: MaterializePivotOptions<TData>): PivotMaterialization<TData> {
  const columnsById = new Map(sourceColumns.map((column) => [column.accessorKey, column]));
  const visibleMeasures = measures.filter((measure) => pivot.measures.includes(measure.id));
  const columnBucketTree = buildColumnBuckets(sourceRows, pivot.columns, columnsById);
  const allValueColumnBuckets = pivot.columns?.length
    ? collectValueBuckets(columnBucketTree, pivot.showGrandTotals ?? true, sourceRows)
    : [{ path: [], rows: sourceRows }];

  let topLevelGroupCount = 0;
  const buildGroupRows = (
    rows: TData[],
    depth: number,
    path: PivotGroupPathSegment[],
  ): PivotRow<TData>[] => {
    const rowAxis = pivot.rows[depth];

    if (!rowAxis) {
      if (!showLeafRows) {
        return [];
      }
      return rows.map((row, index) => {
        const label = rowLabelColumn?.formatLeafLabel?.(row) ?? getRowLabel?.(row) ?? leafId(row, index, getRowId);
        return {
          __pivot: true,
          __kind: "leaf",
          __id: leafId(row, index, getRowId),
          __depth: depth,
          __sourceRows: [row],
          __leafRow: row,
          __groupPath: path,
          __values: computeValues([row], visibleMeasures, path, allValueColumnBuckets),
          __label: label,
          __labelText: asText(label) || leafId(row, index, getRowId),
        };
      });
    }

    const sourceColumn = columnsById.get(rowAxis as Extract<keyof TData, string>);
    const groups = new Map<string, { value: unknown; rows: TData[] }>();

    rows.forEach((row) => {
      const value = getSourceValue(row, sourceColumn);
      const key = stableValueKey(value);
      const bucket = groups.get(key) ?? { value, rows: [] };
      bucket.rows.push(row);
      groups.set(key, bucket);
    });

    const groupedRows = Array.from(groups.entries()).map(([stableKey, group]) => {
      const label =
        sourceColumn?.formatGroupingValue?.(group.value, group.rows) ??
        (group.value == null || group.value === "" ? "Blank" : String(group.value));
      const nextPath = [
        ...path,
        {
          columnId: rowAxis,
          value: group.value,
          label,
          stableKey,
        },
      ];
      const id = groupId(nextPath);
      const canExpand = depth < pivot.rows.length - 1 || showLeafRows;
      const expanded = isExpanded(pivot.expanded, id);
      const row: PivotRow<TData> = {
        __pivot: true,
        __kind: "group",
        __id: id,
        __depth: depth,
        __sourceRows: group.rows,
        __groupPath: nextPath,
        __values: computeValues(group.rows, visibleMeasures, nextPath, allValueColumnBuckets),
        __canExpand: canExpand,
        __isExpanded: expanded,
        __label: label,
        __labelText: asText(label) || String(group.value ?? "Blank"),
      };

      return {
        row,
        children: canExpand && expanded ? buildGroupRows(group.rows, depth + 1, nextPath) : [],
      };
    });

    groupedRows.sort((a, b) => comparePivotRows(a.row, b.row, sorting));

    const visibleGroupedRows =
      depth === 0 && pivot.paginationMode === "topLevelGroups"
        ? groupedRows.slice(
            pagination.pageIndex * pagination.pageSize,
            pagination.pageIndex * pagination.pageSize + pagination.pageSize,
          )
        : groupedRows;

    if (depth === 0) {
      topLevelGroupCount = groupedRows.length;
    }

    return visibleGroupedRows.flatMap(({ row, children }) => [row, ...children]);
  };

  const data = buildGroupRows(sourceRows, 0, []);

  if (pivot.showGrandTotals ?? true) {
    data.push({
      __pivot: true,
      __kind: "grandTotal",
      __id: "pivot:grandTotal",
      __depth: 0,
      __sourceRows: sourceRows,
      __groupPath: [],
      __values: computeValues(sourceRows, visibleMeasures, [], allValueColumnBuckets),
      __label: "Grand Total",
      __labelText: "Grand Total",
    });
  }

  const rowLabelHeader = rowLabelColumn?.header ?? "Row Labels";
  const rowLabelColumnDef: ColumnDef<PivotRow<TData>, unknown> = {
    id: PIVOT_ROW_LABEL_COLUMN_ID,
    header: typeof rowLabelHeader === "string" ? rowLabelHeader : () => rowLabelHeader,
    accessorFn: (row) => row.__labelText,
    size: rowLabelColumn?.size ?? 240,
    minSize: rowLabelColumn?.minSize ?? 180,
    maxSize: rowLabelColumn?.maxSize ?? 520,
    enableSorting,
    enableHiding: false,
    enableResizing: enableColumnResizing,
    enablePinning: enableColumnPinning,
    sortingFn: "alphanumeric",
    cell: ({ row }) => {
      const pivotRow = row.original;
      const isLeafAction = pivotRow.__kind === "leaf" && hasLeafRowAction && pivotRow.__leafRow;

      return (
        <div
          className="flex min-w-0 items-center gap-1.5"
          style={{ paddingLeft: pivotRow.__depth * 20 }}
        >
          {pivotRow.__canExpand ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onToggleRow(pivotRow.__id);
              }}
              className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border border-slate-400 bg-white leading-none text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              aria-expanded={pivotRow.__isExpanded}
              aria-label={`Toggle ${pivotRow.__labelText} group`}
            >
              {pivotRow.__isExpanded ? (
                <MinusIcon className="h-2.5 w-2.5" />
              ) : (
                <PlusIcon className="h-2.5 w-2.5" />
              )}
            </button>
          ) : (
            <span className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          )}
          {isLeafAction ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onLeafClick?.(pivotRow.__leafRow as TData);
              }}
              className="min-w-0 truncate text-left underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              {pivotRow.__label}
            </button>
          ) : (
            <span className="min-w-0 truncate">{pivotRow.__label}</span>
          )}
        </div>
      );
    },
  };

  const createMeasureColumn = (
    measure: DataGridPivotMeasure<TData>,
    bucket: PivotColumnBucket<TData>,
  ): ColumnDef<PivotRow<TData>, unknown> => {
    const columnId = measureColumnId(measure.id, bucket.path, bucket.totalLevel);
    return {
      id: columnId,
      header: measure.label,
      accessorFn: (row) => row.__values[columnId],
      size: 150,
      minSize: 96,
      maxSize: 320,
      enableSorting,
      enableHiding: enableColumnVisibility,
      enableResizing: enableColumnResizing,
      enablePinning: enableColumnPinning,
      sortingFn: measure.sortFn,
      meta: {
        kind: "pivotMeasure",
        measureId: measure.id,
        columnPath: bucket.path,
        sourceRows: bucket.rows,
        totalLevel: bucket.totalLevel,
      },
      cell: ({ row, getValue }) => {
        const value = getValue();
        const context: DataGridPivotCellContext<TData> = {
          value,
          sourceRows: row.original.__sourceRows,
          row: row.original,
          measure,
          rowPath: row.original.__groupPath,
          columnPath: bucket.path,
          scope:
            row.original.__kind === "grandTotal"
              ? "grandTotal"
              : bucket.totalLevel === "grandTotal"
                ? "grandTotal"
                : bucket.totalLevel === "subtotal"
                  ? "columnTotal"
              : bucket.path.length
                ? "cell"
                : "rowTotal",
        };
        const className =
          typeof measure.className === "function"
            ? measure.className(context)
            : measure.className;

        return (
          <span className={className}>
            {measure.cell?.(context) ?? measure.format?.(value, context) ?? String(value ?? "")}
          </span>
        );
      },
    };
  };

  const buildMeasureColumns = (
    buckets: PivotColumnBucket<TData>[],
    options: { includeGrandTotal?: boolean } = { includeGrandTotal: true },
  ): ColumnDef<PivotRow<TData>, unknown>[] =>
    pivot.columns?.length
      ? [
          ...buckets.map<ColumnDef<PivotRow<TData>, unknown>>((bucket) => {
            const isLeafWrapper =
              bucket.children?.length === 1 &&
              bucket.children[0].path.length === bucket.path.length &&
              !bucket.children[0].children?.length;
            const childColumns =
              bucket.children?.length && !isLeafWrapper
                ? [
                    ...buildMeasureColumns(bucket.children, { includeGrandTotal: false }),
                    ...(pivot.showSubtotals ?? true
                      ? [
                          {
                            id: `pivot:column|subtotal|${bucket.path.map(segmentId).join("|")}`,
                            header: "Subtotal",
                            columns: visibleMeasures.map((measure) =>
                              createMeasureColumn(measure, {
                                path: bucket.path,
                                rows: bucket.rows,
                                children: bucket.children,
                                totalLevel: "subtotal",
                              }),
                            ),
                          } satisfies ColumnDef<PivotRow<TData>, unknown>,
                        ]
                      : []),
                  ]
                : visibleMeasures.map((measure) => createMeasureColumn(measure, bucket));

            return {
              id: `pivot:column|${bucket.path.map(segmentId).join("|")}`,
              header:
                typeof bucket.path[bucket.path.length - 1]?.label === "string"
                  ? String(bucket.path[bucket.path.length - 1]?.label)
                  : () => bucket.path[bucket.path.length - 1]?.label ?? "",
              columns: childColumns,
            };
          }),
          ...(options.includeGrandTotal && (pivot.showGrandTotals ?? true)
            ? [
                {
                  id: "pivot:column|grandTotal",
                  header: "Grand Total",
                  columns: visibleMeasures.map((measure) =>
                    createMeasureColumn(measure, {
                      path: [],
                      rows: sourceRows,
                      totalLevel: "grandTotal",
                    }),
                  ),
                } satisfies ColumnDef<PivotRow<TData>, unknown>,
              ]
            : []),
        ]
      : visibleMeasures.map((measure) => createMeasureColumn(measure, { path: [], rows: sourceRows }));

  const measureColumns = buildMeasureColumns(columnBucketTree);
  const generatedColumnIds = [
    PIVOT_ROW_LABEL_COLUMN_ID,
    ...allValueColumnBuckets.flatMap((bucket) =>
      visibleMeasures.map((measure) => measureColumnId(measure.id, bucket.path, bucket.totalLevel)),
    ),
  ];

  return {
    data,
    columns: [rowLabelColumnDef, ...measureColumns],
    metadata: {
      generatedColumnIds,
      sourceRows,
      topLevelGroupCount,
    },
  };
}
