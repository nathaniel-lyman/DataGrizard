import { describe, expect, it } from "vitest";
import {
  partitionLeafColumns,
  computeColumnWindow,
  windowLeafCells,
  windowHeaderRow,
} from "./columnVirtual";

type Col = { id: string; pinned: false | "left" | "right"; size: number };
const col = (id: string, pinned: Col["pinned"] = false, size = 100): Col => ({ id, pinned, size });
const getId = (c: Col) => c.id;
const getPinned = (c: Col) => c.pinned;

describe("partitionLeafColumns", () => {
  it("splits visible leaves into left / center / right preserving order", () => {
    const cols = [col("sel", "left"), col("a"), col("b"), col("act", "right"), col("c")];
    const p = partitionLeafColumns(cols, getPinned);
    expect(p.left.map(getId)).toEqual(["sel"]);
    expect(p.center.map(getId)).toEqual(["a", "b", "c"]);
    expect(p.right.map(getId)).toEqual(["act"]);
  });

  it("handles no pinned columns and all pinned columns", () => {
    expect(partitionLeafColumns([col("a"), col("b")], getPinned).center).toHaveLength(2);
    const allPinned = partitionLeafColumns([col("a", "left"), col("b", "right")], getPinned);
    expect(allPinned.center).toHaveLength(0);
  });
});

describe("computeColumnWindow", () => {
  const center = [col("a"), col("b"), col("c"), col("d"), col("e")];

  it("computes rendered ids and spacer widths from virtual items (mid-scroll)", () => {
    // Window covers b..d: items start where a (100px) ends, end at 400.
    const w = computeColumnWindow({
      virtualItems: [
        { index: 1, start: 100, end: 200 },
        { index: 2, start: 200, end: 300 },
        { index: 3, start: 300, end: 400 },
      ],
      centerColumns: center,
      getId,
      totalCenterWidth: 500,
      pinnedLeafIds: ["sel", "act"],
    });
    expect([...w.renderedLeafIds].sort()).toEqual(["act", "b", "c", "d", "sel"]);
    expect(w.leftSpacerWidth).toBe(100);
    expect(w.rightSpacerWidth).toBe(100);
  });

  it("has zero spacers when the window covers everything", () => {
    const w = computeColumnWindow({
      virtualItems: center.map((_, i) => ({ index: i, start: i * 100, end: (i + 1) * 100 })),
      centerColumns: center,
      getId,
      totalCenterWidth: 500,
      pinnedLeafIds: [],
    });
    expect(w.leftSpacerWidth).toBe(0);
    expect(w.rightSpacerWidth).toBe(0);
    expect(w.renderedLeafIds.size).toBe(5);
  });

  it("renders only pinned columns when there are no center columns", () => {
    const w = computeColumnWindow({
      virtualItems: [],
      centerColumns: [],
      getId,
      totalCenterWidth: 0,
      pinnedLeafIds: ["sel"],
    });
    expect([...w.renderedLeafIds]).toEqual(["sel"]);
    expect(w.leftSpacerWidth).toBe(0);
    expect(w.rightSpacerWidth).toBe(0);
  });
});
