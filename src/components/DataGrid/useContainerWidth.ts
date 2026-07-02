import { useEffect, useState, type RefObject } from "react";

// Observes the grid root's OWN width (not the viewport) so an embedded grid —
// split pane, dashboard tile — responds to the space it actually has. Returns
// null until the first measure; callers treat null as "table" so SSR and first
// paint never flash card mode. Guards both `window` (SSR) and `ResizeObserver`
// (jsdom): with no observer available it measures once on mount, which is
// enough for tests that pin the mode and environments that never resize.
export const useContainerWidth = (
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
): number | null => {
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return;
    }
    const element = ref.current;
    if (!element) {
      return;
    }
    setWidth(element.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setWidth(entry.contentRect.width);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, enabled]);

  return enabled ? width : null;
};
