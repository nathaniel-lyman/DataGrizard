// Pure placement math for the grid's anchored popovers (filter popover,
// header menu, editor error). Deliberately dependency-free and DOM-free so it
// unit-tests without layout; callers pass getBoundingClientRect() output.

export type AnchoredPlacement = {
  /** Right-align the popover to the trigger (would cross the right edge). */
  alignEnd: boolean;
  /** Open above the trigger (more room above than below). */
  openUp: boolean;
  /** Clamp height to the available side; undefined when the estimate fits. */
  maxHeight: number | undefined;
};

/** Popovers shorter than this are unusable; never clamp below it. */
export const MIN_POPOVER_HEIGHT = 120;

const MARGIN = 8;

export function computeAnchoredPlacement(options: {
  trigger: Pick<DOMRect, "left" | "top" | "bottom">;
  viewportWidth: number;
  viewportHeight: number;
  estimatedWidth: number;
  estimatedHeight: number;
}): AnchoredPlacement {
  const { trigger, viewportWidth, viewportHeight, estimatedWidth, estimatedHeight } = options;
  const alignEnd = trigger.left + estimatedWidth > viewportWidth - MARGIN;
  const spaceBelow = viewportHeight - trigger.bottom - MARGIN;
  const spaceAbove = trigger.top - MARGIN;
  const openUp = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;
  const available = openUp ? spaceAbove : spaceBelow;
  const maxHeight =
    available >= estimatedHeight ? undefined : Math.max(MIN_POPOVER_HEIGHT, Math.floor(available));
  return { alignEnd, openUp, maxHeight };
}
