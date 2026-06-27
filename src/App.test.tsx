import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import App from "./App";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("App server-mode demo", () => {
  it("loads a server page (total from the fake server) when toggled on", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Grid" }));
    fireEvent.click(screen.getByRole("button", { name: "Server" }));

    // queryRetail resolves after ~300ms; findBy polls up to 1000ms.
    expect(await screen.findByText(/of 500 items/)).toBeInTheDocument();
  });

  it("disables the Server toggle in pivot layout (server is grid-only)", () => {
    render(<App />); // starts in grid
    fireEvent.click(screen.getByRole("button", { name: "Pivot" }));
    expect(screen.getByRole("button", { name: "Server" })).toBeDisabled();
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
