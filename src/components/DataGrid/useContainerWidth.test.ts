import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRef } from "react";
import { useContainerWidth } from "./useContainerWidth";

type ObserverCallback = (entries: { contentRect: { width: number } }[]) => void;

let observerCallback: ObserverCallback | null = null;
const observe = vi.fn();
const disconnect = vi.fn();

class ResizeObserverStub {
  constructor(callback: ObserverCallback) {
    observerCallback = callback;
  }
  observe = observe;
  disconnect = disconnect;
}

const withElementRef = (width: number) => {
  const element = document.createElement("div");
  element.getBoundingClientRect = () => ({ width } as DOMRect);
  return renderHook(
    ({ enabled }: { enabled: boolean }) => {
      const ref = useRef<HTMLElement | null>(element);
      return useContainerWidth(ref, enabled);
    },
    { initialProps: { enabled: true } },
  );
};

afterEach(() => {
  vi.unstubAllGlobals();
  observerCallback = null;
  observe.mockClear();
  disconnect.mockClear();
});

describe("useContainerWidth", () => {
  it("measures on mount and tracks ResizeObserver updates", () => {
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    const { result } = withElementRef(800);
    expect(result.current).toBe(800);
    expect(observe).toHaveBeenCalledTimes(1);
    act(() => observerCallback?.([{ contentRect: { width: 480 } }]));
    expect(result.current).toBe(480);
  });

  it("returns null when disabled", () => {
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    const { result, rerender } = withElementRef(800);
    rerender({ enabled: false });
    expect(result.current).toBeNull();
  });

  it("without ResizeObserver (jsdom/SSR-adjacent), still measures once on mount", () => {
    // No stub installed — exercises the typeof ResizeObserver === "undefined" guard.
    const { result } = withElementRef(500);
    expect(result.current).toBe(500);
  });

  it("disconnects the observer on unmount", () => {
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    const { unmount } = withElementRef(800);
    unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
