import { describe, expect, it } from "vitest";
import { computeAnchoredPlacement } from "./popoverPosition";

const trigger = (left: number, top: number, width = 24, height = 24) =>
  ({ left, top, right: left + width, bottom: top + height, width, height }) as DOMRect;

const viewport = { viewportWidth: 1280, viewportHeight: 720 };
const estimate = { estimatedWidth: 280, estimatedHeight: 360 };

describe("computeAnchoredPlacement", () => {
  it("opens down-left-aligned with room below and to the right", () => {
    const p = computeAnchoredPlacement({ trigger: trigger(100, 100), ...viewport, ...estimate });
    expect(p).toEqual({ alignEnd: false, openUp: false, maxHeight: undefined });
  });

  it("aligns end when the popover would cross the right edge", () => {
    const p = computeAnchoredPlacement({ trigger: trigger(1100, 100), ...viewport, ...estimate });
    expect(p.alignEnd).toBe(true);
  });

  it("opens up when space below is short and space above is larger", () => {
    const p = computeAnchoredPlacement({ trigger: trigger(100, 600), ...viewport, ...estimate });
    expect(p.openUp).toBe(true);
    // 600 - 8 margin = 592 above; full estimate fits, no clamp needed.
    expect(p.maxHeight).toBeUndefined();
  });

  it("stays down but clamps maxHeight when neither side fits and below is larger", () => {
    const p = computeAnchoredPlacement({
      trigger: trigger(100, 300),
      ...viewport,
      estimatedWidth: 280,
      estimatedHeight: 500,
    });
    expect(p.openUp).toBe(false);
    expect(p.maxHeight).toBe(720 - (300 + 24) - 8); // space below the trigger minus margin
  });

  it("clamps to the minimum usable height in a tiny viewport", () => {
    // 200px viewport, trigger at 100: 92 above, 68 below - both under the
    // 120 minimum - so the clamp floor must kick in.
    const p = computeAnchoredPlacement({
      trigger: trigger(100, 100),
      viewportWidth: 1280,
      viewportHeight: 200,
      ...estimate,
    });
    expect(p.openUp).toBe(true); // 92 above > 68 below
    expect(p.maxHeight).toBe(120);
  });
});
