import type { ColumnDef } from "@tanstack/react-table";

/**
 * A grid-mode column-group band. `children` are leaf column `accessorKey`s or
 * nested groups. Groups render as header bands over their (visible) leaf
 * columns through the standard `getHeaderGroups()` path. Ignored in pivot mode.
 */
export type DataGridColumnGroup = {
  groupId: string;
  header: string;
  children: Array<string | DataGridColumnGroup>;
};

// Assemble flat leaf ColumnDefs into nested grouped ColumnDefs per columnGroups.
// A group is emitted at the position of its first-encountered member and pulls
// all its (declared-order) leaves into the band; columns named in no group stay
// standalone. Bands span their visible leaves automatically via getHeaderGroups.
export const buildGroupedColumnDefs = <TData,>(
  dataDefs: ColumnDef<TData>[],
  columnGroups: DataGridColumnGroup[],
): ColumnDef<TData>[] => {
  const defByKey = new Map<string, ColumnDef<TData>>();
  dataDefs.forEach((def) => {
    const key = (def as { accessorKey?: string }).accessorKey;
    if (key) {
      defByKey.set(key, def);
    }
  });

  const topGroupByKey = new Map<string, DataGridColumnGroup>();
  const collectLeaves = (group: DataGridColumnGroup, top: DataGridColumnGroup) => {
    group.children.forEach((child) => {
      if (typeof child === "string") {
        topGroupByKey.set(child, top);
      } else {
        collectLeaves(child, top);
      }
    });
  };
  columnGroups.forEach((group) => collectLeaves(group, group));

  const consumed = new Set<string>();
  const buildGroup = (group: DataGridColumnGroup): ColumnDef<TData> | null => {
    const columns = group.children
      .map((child) => {
        if (typeof child === "string") {
          const def = defByKey.get(child);
          if (!def) {
            return null;
          }
          consumed.add(child);
          return def;
        }
        return buildGroup(child);
      })
      .filter((def): def is ColumnDef<TData> => Boolean(def));
    if (!columns.length) {
      return null;
    }
    return { id: group.groupId, header: group.header, columns };
  };

  const result: ColumnDef<TData>[] = [];
  dataDefs.forEach((def) => {
    const key = (def as { accessorKey?: string }).accessorKey;
    if (key && consumed.has(key)) {
      return;
    }
    const top = key ? topGroupByKey.get(key) : undefined;
    if (!top) {
      result.push(def);
      if (key) {
        consumed.add(key);
      }
      return;
    }
    const groupDef = buildGroup(top);
    if (groupDef) {
      result.push(groupDef);
    }
  });
  return result;
};
