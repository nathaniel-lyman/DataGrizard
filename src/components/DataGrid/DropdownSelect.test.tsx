import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DropdownSelect } from "./DropdownSelect";

const options = [
  { value: "one", label: "First option" },
  { value: "two", label: "Second option" },
];

describe("DropdownSelect", () => {
  it("renders a themed listbox and chooses an option", () => {
    const onChange = vi.fn();
    render(
      <DropdownSelect
        value=""
        options={options}
        placeholder="Choose"
        ariaLabel="Example dropdown"
        onChange={onChange}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Example dropdown" });
    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("listbox", { name: "Example dropdown options" })).toHaveClass(
      "dg-dropdown-menu",
    );
    fireEvent.click(screen.getByRole("option", { name: "Second option" }));

    expect(onChange).toHaveBeenCalledWith("two");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("supports arrow-key navigation and Escape dismissal", () => {
    render(
      <DropdownSelect
        value="one"
        options={options}
        ariaLabel="Keyboard dropdown"
        onChange={() => undefined}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Keyboard dropdown" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: "First option" })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole("option", { name: "First option" }), {
      key: "ArrowDown",
    });
    expect(screen.getByRole("option", { name: "Second option" })).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });
});
