// Column-axis bucket construction + per-bucket measure value computation for
// pivot materialization. Layered on pivotHelpers (one-way dependency); pivot
// types are import-type-only (erased, no runtime cycle).
import type {
  DataGridPivotColumnAxis,
  DataGridPivotMeasure,
  PivotGroupPathSegment,
} from "./pivot";
import {
  aggregateMeasure,
  getSourceValue,
  measureColumnId,
  stableValueKey,
  sumNumericValues,
  type PivotSourceColumn,
} from "./pivotHelpers";

// A node in the column-axis bucket tree: the group path, its source rows, any
// child buckets, and an optional subtotal/grand-total marker.
export type PivotColumnBucket<TData extends object> = {
  path: PivotGroupPathSegment[];
  rows: TData[];
  children?: PivotColumnBucket<TData>[];
  totalLevel?: "subtotal" | "grandTotal";
};

export const computeValues = <TData extends object>(
  rows: TData[],
  measures: DataGridPivotMeasure<TData>[],
  rowPath: PivotGroupPathSegment[],
  valueBuckets: PivotColumnBucket<TData>[],
) => {
  const values: Record<string, unknown> = {};

  valueBuckets.forEach((bucket) => {
    measures.forEach((measure) => {
      const columnId = measureColumnId(measure.id, bucket.path, bucket.totalLevel);
      const behavior = bucket.totalLevel ? measure.totalBehavior ?? "aggregate" : "aggregate";

      if (behavior === "blank") {
        values[columnId] = "";
        return;
      }

      if (behavior === "sumVisibleChildren" && bucket.children?.length) {
        values[columnId] = sumNumericValues(
          flattenBuckets(bucket.children).map((childBucket) => {
            const childRows = rows.filter((row) => childBucket.rows.includes(row));
            return aggregateMeasure(childRows, measure, {
              columnId: measure.columnId,
              measureId: measure.id,
              rowPath,
              columnPath: childBucket.path,
            });
          }),
        );
        return;
      }

      const bucketRows =
        bucket.path.length || bucket.totalLevel
          ? rows.filter((row) => bucket.rows.includes(row))
          : rows;
      values[columnId] = aggregateMeasure(bucketRows, measure, {
        columnId: measure.columnId,
        measureId: measure.id,
        rowPath,
        columnPath: bucket.path,
      });
    });
  });

  return values;
};

export const flattenBuckets = <TData extends object>(
  buckets: PivotColumnBucket<TData>[],
): PivotColumnBucket<TData>[] =>
  buckets.flatMap((bucket) =>
    bucket.children?.length ? flattenBuckets(bucket.children) : [bucket],
  );

export const buildColumnBuckets = <TData extends object>(
  rows: TData[],
  axes: DataGridPivotColumnAxis[] | undefined,
  columnsById: Map<string, PivotSourceColumn<TData>>,
) => {
  const build = (
    bucketRows: TData[],
    depth: number,
    path: PivotGroupPathSegment[],
  ): PivotColumnBucket<TData>[] => {
    const axis = axes?.[depth];

    if (!axis) {
      return [{ path, rows: bucketRows }];
    }

    const sourceColumn = columnsById.get(axis.columnId as Extract<keyof TData, string>);
    const groups = new Map<string, { value: unknown; rows: TData[] }>();

    bucketRows.forEach((row) => {
      const value = getSourceValue(row, sourceColumn);
      const key = stableValueKey(value);
      const bucket = groups.get(key) ?? { value, rows: [] };
      bucket.rows.push(row);
      groups.set(key, bucket);
    });

    const grouped = Array.from(groups.entries()).map(([stableKey, group]) => {
      const label =
        sourceColumn?.formatGroupingValue?.(group.value, group.rows) ??
        (group.value == null || group.value === "" ? "Blank" : String(group.value));
      const nextPath = [
        ...path,
        {
          columnId: axis.columnId,
          value: group.value,
          label,
          stableKey,
        },
      ];

      return {
        path: nextPath,
        rows: group.rows,
        children: build(group.rows, depth + 1, nextPath),
      };
    });

    grouped.sort((a, b) => {
      const aSegment = a.path[a.path.length - 1];
      const bSegment = b.path[b.path.length - 1];
      const result = String(aSegment?.value ?? "").localeCompare(String(bSegment?.value ?? ""));
      return axis.order === "desc" ? -result : result;
    });

    return grouped;
  };

  return axes?.length ? build(rows, 0, []) : [{ path: [], rows }];
};

export const collectValueBuckets = <TData extends object>(
  buckets: PivotColumnBucket<TData>[],
  includeGrandTotal: boolean,
  sourceRows: TData[],
): PivotColumnBucket<TData>[] => {
  const withSubtotals = (bucketList: PivotColumnBucket<TData>[]): PivotColumnBucket<TData>[] =>
    bucketList.flatMap((bucket) => {
      if (!bucket.children?.length) {
        return [bucket];
      }

      return [
        ...withSubtotals(bucket.children),
        {
          path: bucket.path,
          rows: bucket.rows,
          children: bucket.children,
          totalLevel: "subtotal" as const,
        },
      ];
    });

  return [
    ...withSubtotals(buckets),
    ...(includeGrandTotal ? [{ path: [], rows: sourceRows, totalLevel: "grandTotal" as const }] : []),
  ];
};
