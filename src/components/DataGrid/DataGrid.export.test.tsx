import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataGrid } from "./DataGrid";
import type { GridColumnConfig } from "../../types/grid";

type Row = { id: string; name: string; revenue: number };

const data: Row[] = [
  { id: "1", name: "Alpha", revenue: 1200 },
  { id: "2", name: "Bravo", revenue: 900 },
  { id: "3", name: "Cara", revenue: 1500 },
];

const columns: GridColumnConfig<Row>[] = [
  { accessorKey: "name", header: "Name", dataType: "text" },
  { accessorKey: "revenue", header: "Revenue", dataType: "currency" },
];

const cellOf = (text: string) => screen.getByText(text).closest("td") as HTMLElement;

let blobs: Blob[] = [];
let lastDownloadName = "";

beforeEach(() => {
  blobs = [];
  lastDownloadName = "";
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob: Blob | MediaSource) => {
    blobs.push(blob as Blob);
    return "blob:mock";
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    lastDownloadName = this.download;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, "execCommand");
  cleanup();
  window.localStorage.clear();
});

const lastCsv = async () => (blobs.length ? blobs[blobs.length - 1].text() : "");

describe("DataGrid CSV export", () => {
  it("exports the current view with a header and formatted values", async () => {
    render(<DataGrid data={data} columns={columns} getRowId={(r) => r.id} features={{ rowSelection: false }} />);

    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    const csv = await lastCsv();

    expect(csv).toContain("Name,Revenue");
    expect(csv).toContain("Alpha,$1,200".replace("$1,200", '"$1,200"')); // currency has a comma → quoted
    expect(csv.split("\r\n")).toHaveLength(4); // header + 3 rows
  });

  it("exports all filtered rows across pages, not just the current page", async () => {
    render(
      <DataGrid
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        features={{ rowSelection: false }}
        pageSizeOptions={[1]}
        state={{ pagination: { pageIndex: 0, pageSize: 1 } }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    const csv = await lastCsv();

    // Only 1 row is on the visible page, but all 3 export.
    expect(csv).toContain("Alpha");
    expect(csv).toContain("Bravo");
    expect(csv).toContain("Cara");
  });

  it("exports only the loaded page in server mode (documented degradation)", async () => {
    // data is the current page (3 rows); rowCount says the server has 1000.
    render(
      <DataGrid
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        features={{ rowSelection: false }}
        dataMode="server"
        rowCount={1000}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    const csv = await lastCsv();

    // Header + the 3 loaded rows only — NOT an attempt at all 1000 server rows.
    expect(csv.split("\r\n")).toHaveLength(4);
    expect(csv).toContain("Alpha");
    expect(csv).toContain("Cara");
  });

  it("exports only selected rows when a selection exists", async () => {
    render(<DataGrid data={data} columns={columns} getRowId={(r) => r.id} />);

    fireEvent.click(screen.getByLabelText("Select 2")); // Bravo
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    const csv = await lastCsv();

    expect(csv).toContain("Bravo");
    expect(csv).not.toContain("Alpha");
    expect(csv).not.toContain("Cara");
  });

  it("honors getExportFileName", async () => {
    render(
      <DataGrid
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        features={{ rowSelection: false }}
        getExportFileName={({ rowCount }) => `rows-${rowCount}.csv`}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(lastDownloadName).toBe("rows-3.csv");
  });
});

describe("DataGrid clipboard copy", () => {
  it("copies the focused cell as TSV on Ctrl/Cmd-C", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    render(<DataGrid data={data} columns={columns} getRowId={(r) => r.id} features={{ rowSelection: false }} />);
    const cell = cellOf("Alpha");
    cell.focus();
    fireEvent.keyDown(cell, { key: "c", ctrlKey: true });

    expect(writeText).toHaveBeenCalledWith("Alpha");
  });

  it("copies all selected rows as TSV when a selection exists", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    render(<DataGrid data={data} columns={columns} getRowId={(r) => r.id} />);
    fireEvent.click(screen.getByLabelText("Select 1")); // Alpha
    fireEvent.click(screen.getByLabelText("Select 3")); // Cara

    const cell = cellOf("Bravo");
    cell.focus();
    fireEvent.keyDown(cell, { key: "c", metaKey: true });

    expect(writeText).toHaveBeenCalledTimes(1);
    const tsv = writeText.mock.calls[0][0] as string;
    expect(tsv).toContain("Alpha\t$1,200");
    expect(tsv).toContain("Cara\t$1,500");
    expect(tsv).not.toContain("Bravo");
  });

  it("copies a selected cell range as TSV before falling back to selected rows", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    render(<DataGrid data={data} columns={columns} getRowId={(r) => r.id} />);
    fireEvent.click(screen.getByLabelText("Select 3")); // row selection should not win over a multi-cell range

    const start = cellOf("Alpha");
    fireEvent.mouseDown(start, { button: 0, buttons: 1 });
    fireEvent.mouseEnter(cellOf("$900"), { buttons: 1 });
    fireEvent.mouseUp(document);
    fireEvent.keyDown(start, { key: "c", ctrlKey: true });

    expect(writeText).toHaveBeenCalledWith("Alpha\t$1,200\r\nBravo\t$900");
  });

  it("falls back to the legacy copy path when async clipboard permission is denied", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    Object.defineProperty(document, "execCommand", { value: execCommand, configurable: true });

    render(<DataGrid data={data} columns={columns} getRowId={(r) => r.id} features={{ rowSelection: false }} />);
    const cell = cellOf("Alpha");
    cell.focus();
    fireEvent.keyDown(cell, { key: "c", ctrlKey: true });

    await waitFor(() => expect(execCommand).toHaveBeenCalledWith("copy"));
    expect(screen.getByRole("status")).toHaveTextContent("Copied 1 cell.");
  });
});
