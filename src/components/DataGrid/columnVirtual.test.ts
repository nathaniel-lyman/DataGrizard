import { describe, expect, it } from "vitest";
import {
  partitionLeafColumns,
  computeColumnWindow,
  windowLeafCells,
  windowHeaderRow,
} from "./columnVirtual";

type Col = { id: string; pinned: false | "left" | "right" };
const col = (id: string, pinned: Col["pinned"] = false): Col => ({ id, pinned });
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

describe("windowLeafCells", () => {
  const cols = [col("sel", "left"), col("a"), col("b"), col("c"), col("act", "right")];
  const window = {
    renderedLeafIds: new Set(["sel", "b", "act"]),
    leftSpacerWidth: 100,
    rightSpacerWidth: 100,
  };

  it("emits left pinned, left spacer, windowed center, right spacer, right pinned", () => {
    const out = windowLeafCells({ items: cols, getId, getPinned, window });
    expect(
      out.map((e) => (e.kind === "cell" ? getId(e.item) : `spacer:${e.width}`)),
    ).toEqual(["sel", "spacer:100", "b", "spacer:100", "act"]);
  });

  it("omits zero-width spacers", () => {
    const out = windowLeafCells({
      items: cols,
      getId,
      getPinned,
      window: { renderedLeafIds: new Set(["sel", "a", "b", "c", "act"]), leftSpacerWidth: 0, rightSpacerWidth: 0 },
    });
    expect(out.every((e) => e.kind === "cell")).toBe(true);
    expect(out).toHaveLength(5);
  });
});

describe("windowHeaderRow", () => {
  // Band row over leaves: sel | [a b c] band | act. Window renders sel, b, act.
  // Each header instance lives wholly in one pin region (TanStack splits
  // groups whose leaves are pinned into separate header instances).
  const headers = [
    { id: "h-sel", leafIds: ["sel"], pinned: "left" as const },
    { id: "h-band", leafIds: ["a", "b", "c"], pinned: false as const },
    { id: "h-act", leafIds: ["act"], pinned: "right" as const },
  ];
  type HeaderLike = (typeof headers)[number];
  const getLeafIds = (h: HeaderLike) => h.leafIds;
  const getHeaderPinned = (h: HeaderLike) => h.pinned;
  const window = {
    renderedLeafIds: new Set(["sel", "b", "act"]),
    leftSpacerWidth: 100,
    rightSpacerWidth: 100,
  };

  it("clips band colSpan to rendered leaves and positions spacers by leaf order", () => {
    const out = windowHeaderRow({ headers, getLeafIds, getPinned: getHeaderPinned, window });
    expect(
      out.map((e) =>
        e.kind === "header" ? `${e.item.id}:${e.colSpan}` : `spacer:${e.width}`,
      ),
    ).toEqual(["h-sel:1", "spacer:100", "h-band:1", "spacer:100", "h-act:1"]);
  });

  it("drops bands with zero rendered leaves", () => {
    const out = windowHeaderRow({
      headers,
      getLeafIds,
      getPinned: getHeaderPinned,
      window: { renderedLeafIds: new Set(["sel", "act"]), leftSpacerWidth: 300, rightSpacerWidth: 0 },
    });
    expect(
      out.map((e) => (e.kind === "header" ? e.item.id : `spacer:${e.width}`)),
    ).toEqual(["h-sel", "spacer:300", "h-act"]);
  });

  it("passes every header through untouched when all leaves render", () => {
    const out = windowHeaderRow({
      headers,
      getLeafIds,
      getPinned: getHeaderPinned,
      window: { renderedLeafIds: new Set(["sel", "a", "b", "c", "act"]), leftSpacerWidth: 0, rightSpacerWidth: 0 },
    });
    expect(out.map((e) => (e.kind === "header" ? e.colSpan : -1))).toEqual([1, 3, 1]);
  });
});
