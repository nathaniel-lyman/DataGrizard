import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GridFilter } from "./filters";
import { ToolbarCompact, type CompactSortColumn } from "./ToolbarCompact";

afterEach(cleanup);

const sortColumns: CompactSortColumn[] = [
  { id: "product", label: "Product", direction: false },
  { id: "revenue", label: "Revenue", direction: "desc" },
];

const deptFilter: GridFilter = {
  id: "dept",
  label: "Dept",
  filterType: "multiSelect",
  value: ["Grocery"],
  options: ["Grocery", "Home"],
  onChange: vi.fn(),
};

const baseProps = {
  search: "",
  searchPlaceholder: "Search rows...",
  enableGlobalSearch: true,
  onSearchChange: vi.fn(),
  enableSorting: true,
  sortColumns,
  onSortColumn: vi.fn(),
  onClearSort: vi.fn(),
  filters: [deptFilter],
  onClearFilters: vi.fn(),
};

describe("ToolbarCompact", () => {
  it("renders search plus Sort and Filters chips with active summaries", () => {
    render(<ToolbarCompact {...baseProps} />);
    expect(screen.getByPlaceholderText("Search rows...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sort: Revenue/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filters (1)" })).toBeInTheDocument();
  });

  it("sort sheet lists sortable columns; tapping one calls onSortColumn and stays open", () => {
    render(<ToolbarCompact {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Sort: Revenue/ }));
    const dialog = screen.getByRole("dialog", { name: "Sort by" });
    fireEvent.click(screen.getByRole("button", { name: /^Product/ }));
    expect(baseProps.onSortColumn).toHaveBeenCalledWith("product");
    expect(dialog).toBeInTheDocument();
  });

  it("sort sheet offers Clear sort when a sort is active", () => {
    render(<ToolbarCompact {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Sort: Revenue/ }));
    fireEvent.click(screen.getByRole("button", { name: "Clear sort" }));
    expect(baseProps.onClearSort).toHaveBeenCalledTimes(1);
  });

  it("filters sheet renders one labeled control body per filter and a Clear all", () => {
    render(<ToolbarCompact {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Filters (1)" }));
    const dialog = screen.getByRole("dialog", { name: "Filters" });
    expect(dialog).toHaveTextContent("Dept");
    // The multiSelect body renders its options as labeled checkboxes.
    expect(screen.getByRole("checkbox", { name: "Grocery" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Clear all filters" }));
    expect(baseProps.onClearFilters).toHaveBeenCalledTimes(1);
  });

  it("Done closes the filters sheet", () => {
    render(<ToolbarCompact {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Filters (1)" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("hides chips with nothing to show", () => {
    render(
      <ToolbarCompact
        {...baseProps}
        enableSorting={false}
        filters={[]}
      />,
    );
    expect(screen.queryByRole("button", { name: /Sort/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Filters/ })).not.toBeInTheDocument();
  });
});
