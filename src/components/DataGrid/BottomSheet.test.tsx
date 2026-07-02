import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BottomSheet } from "./BottomSheet";

afterEach(cleanup);

describe("BottomSheet", () => {
  it("renders nothing when closed", () => {
    render(
      <BottomSheet open={false} label="Sort by" onClose={() => {}}>
        <p>Body</p>
      </BottomSheet>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders a modal dialog and moves focus into it when open", () => {
    render(
      <BottomSheet open label="Sort by" onClose={() => {}}>
        <button type="button">Body action</button>
      </BottomSheet>,
    );
    const dialog = screen.getByRole("dialog", { name: "Sort by" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveFocus();
  });

  it("Escape closes and does not bubble to document listeners", () => {
    const onClose = vi.fn();
    const documentEscape = vi.fn();
    document.addEventListener("keydown", documentEscape);
    render(
      <BottomSheet open label="Filters" onClose={onClose}>
        <p>Body</p>
      </BottomSheet>,
    );
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(documentEscape).not.toHaveBeenCalled();
    document.removeEventListener("keydown", documentEscape);
  });

  it("backdrop click closes", () => {
    const onClose = vi.fn();
    const { container } = render(
      <BottomSheet open label="Filters" onClose={onClose}>
        <p>Body</p>
      </BottomSheet>,
    );
    fireEvent.click(container.querySelector("[data-sheet-backdrop]")!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("returns focus to the opener and restores body scroll on close", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const { rerender } = render(
      <BottomSheet open label="Sort by" onClose={() => {}}>
        <p>Body</p>
      </BottomSheet>,
    );
    expect(document.body.style.overflow).toBe("hidden");
    rerender(
      <BottomSheet open={false} label="Sort by" onClose={() => {}}>
        <p>Body</p>
      </BottomSheet>,
    );
    expect(document.body.style.overflow).toBe("");
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it("Tab wraps focus inside the sheet", () => {
    render(
      <BottomSheet open label="Filters" onClose={() => {}}>
        <button type="button">First</button>
        <button type="button">Last</button>
      </BottomSheet>,
    );
    const last = screen.getByRole("button", { name: "Last" });
    last.focus();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab" });
    expect(screen.getByRole("button", { name: "First" })).toHaveFocus();
  });
});
