import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import App from "./App";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("App server-mode demo", () => {
  it("starts the grid at item level without grouping", () => {
    const { container } = render(<App />);

    expect(container.querySelector(".dg-row--group")).not.toBeInTheDocument();
    expect(screen.queryByText(/grouped$/)).not.toBeInTheDocument();
  });

  it("applies the dark preset through a demo wrapper", () => {
    const { container } = render(<App />);
    const toggle = screen.getByRole("button", { name: "Dark theme" });

    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(container.querySelector(".dg-theme-dark .dg-root")).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector(".dg-theme-dark .dg-root")).toBeInTheDocument();
  });

  it("loads a server page (total from the fake server) when toggled on", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Grid" }));
    fireEvent.click(screen.getByRole("button", { name: "Server" }));

    // queryRetail resolves after ~300ms; findBy polls up to 1000ms.
    expect(await screen.findByText(/of 500 items/)).toBeInTheDocument();
  });

  it("runs the agent proof in server mode", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Server" }));

    expect(await screen.findByText(/of 500 items/)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Ask the live grid agent" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Ask live agent" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Run deterministic proof" })).toBeEnabled();
    expect(screen.queryByText("Available in grid layout.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Run deterministic proof" }));
    expect(await screen.findByText(/5 Grocery products/)).toBeInTheDocument();
    expect(screen.getByText("View analysis receipt")).toBeInTheDocument();
  });

  it("disables the Server toggle and removes inactive agent controls in pivot layout", () => {
    render(<App />); // starts in grid
    expect(screen.getByRole("region", { name: "Assistant workflow demo" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Pivot" }));

    expect(screen.getByRole("button", { name: "Server" })).toBeDisabled();
    expect(screen.queryByRole("region", { name: "Assistant workflow demo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ask live agent" })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Sales/ })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Margin/ })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /Sum of Sales/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /Avg Margin/ })).not.toBeInTheDocument();
  });

  it("shows Client as the active data source while pivot disables Server", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Grid" }));
    fireEvent.click(screen.getByRole("button", { name: "Server" }));
    expect(screen.getByRole("button", { name: "Server" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Pivot" }));

    expect(screen.getByRole("button", { name: "Server" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Server" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Client" })).toHaveAttribute("aria-pressed", "true");
  });
});
