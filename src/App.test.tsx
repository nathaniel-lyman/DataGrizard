import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import App from "./App";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("DataGrizard product showcase", () => {
  it("presents a narrative page with working section and playground navigation", () => {
    render(<App />);

    expect(screen.getByRole("heading", {
      level: 1,
      name: "An analytical control plane for people and agents.",
    })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Explore demos" })).toHaveAttribute(
      "href",
      "#everyday",
    );
    expect(screen.getAllByRole("link", { name: "Open playground" })[0]).toHaveAttribute(
      "href",
      "#playground",
    );
    expect(screen.getByRole("region", { name: "Find the decision, not the control." })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Let agents act. Keep the proof." })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "A loaded page is not the dataset." })).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(5);
  });

  it("shows clean pivot measures and preserves the weighted-margin explanation", () => {
    render(<App />);
    const pivotSection = screen.getByRole("region", {
      name: "Roll up the business without flattening the meaning.",
    });

    expect(within(pivotSection).getByRole("columnheader", { name: /Sales/ })).toBeInTheDocument();
    expect(within(pivotSection).getByRole("columnheader", { name: /Units/ })).toBeInTheDocument();
    expect(within(pivotSection).getByRole("columnheader", { name: /Margin/ })).toBeInTheDocument();
    expect(within(pivotSection).getByRole("columnheader", { name: /Price Gap/ })).toBeInTheDocument();
    expect(within(pivotSection).getByRole("columnheader", { name: /Status/ })).toBeInTheDocument();
    expect(within(pivotSection).queryByRole("columnheader", { name: /Sum of Sales/ })).not.toBeInTheDocument();
    expect(within(pivotSection).queryByRole("columnheader", { name: /Avg Margin/ })).not.toBeInTheDocument();
    expect(within(pivotSection).getByText(/Σ\(sales × margin rate\) \/ Σ\(sales\)/)).toBeInTheDocument();
  });

  it("switches playground recipes into coherent agent and pivot configurations", () => {
    render(<App />);
    const playground = screen.getByRole("region", { name: "One surface. Five coherent recipes." });

    expect(within(playground).queryByRole("region", { name: "Assistant workflow demo" })).not.toBeInTheDocument();
    fireEvent.click(within(playground).getByRole("tab", { name: /Agent/ }));
    expect(within(playground).getByRole("region", { name: "Assistant workflow demo" })).toBeInTheDocument();
    expect(within(playground).getByRole("button", { name: "Ask live agent" })).toBeEnabled();

    fireEvent.click(within(playground).getByRole("tab", { name: /Pivot/ }));
    expect(within(playground).queryByRole("region", { name: "Assistant workflow demo" })).not.toBeInTheDocument();
    expect(within(playground).getByRole("columnheader", { name: /Margin/ })).toBeInTheDocument();
    expect(within(playground).getByRole("tab", { name: /Pivot/ })).toHaveAttribute("aria-selected", "true");
  });

  it("loads the server recipe and pins the responsive recipe to card mode", async () => {
    render(<App />);
    const playground = screen.getByRole("region", { name: "One surface. Five coherent recipes." });

    fireEvent.click(within(playground).getByRole("tab", { name: /Server/ }));
    expect(await within(playground).findByText(/of 500 items/)).toBeInTheDocument();
    expect(screen.getByText("Page rows ≠ all rows")).toBeInTheDocument();

    fireEvent.click(within(playground).getByRole("tab", { name: /Responsive/ }));
    expect(within(playground).queryByRole("table")).not.toBeInTheDocument();
    expect(within(playground).getByRole("list", { name: "Responsive playground" })).toBeInTheDocument();
    expect(within(playground).getByRole("button", { name: "Filters" })).toBeInTheDocument();
  });

  it("toggles the responsive theme at the consumer wrapper", () => {
    const { container } = render(<App />);
    const toggle = screen.getByRole("button", { name: "Use dark theme" });
    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector("#responsive .dg-theme-dark .dg-root")).toBeInTheDocument();
  });
});
