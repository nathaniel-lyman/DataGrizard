import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataGrid, type DataGridDataSourceRequest } from "./DataGrid";
import type { GridColumnConfig } from "../../types/grid";

type Row = { id: string; name: string; revenue: number };

const rows: Row[] = [
  { id: "1", name: "Charlie", revenue: 300 },
  { id: "2", name: "Alice", revenue: 100 },
  { id: "3", name: "Bob", revenue: 200 },
];

const columns: GridColumnConfig<Row>[] = [
  { accessorKey: "name", header: "Name", dataType: "text" },
  { accessorKey: "revenue", header: "Revenue", dataType: "currency" },
];

const bodyNames = () =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0]?.textContent ?? "");

const pageRows = (request: DataGridDataSourceRequest) => {
  const sorted = [...rows];
  const firstSort = request.sorting[0];
  if (firstSort?.id === "name") {
    sorted.sort((a, b) =>
      firstSort.desc ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name),
    );
  }
  const searched = request.globalFilter
    ? sorted.filter((row) =>
        row.name.toLowerCase().includes(request.globalFilter.toLowerCase()),
      )
    : sorted;
  const start = request.pagination.pageIndex * request.pagination.pageSize;
  return {
    rows: searched.slice(start, start + request.pagination.pageSize),
    rowCount: searched.length,
  };
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("DataGrid dataSource", () => {
  it("fetches initial rows and total through the convenience API", async () => {
    const dataSource = vi.fn(async (request: DataGridDataSourceRequest) => pageRows(request));

    render(
      <DataGrid
        columns={columns}
        dataSource={dataSource}
        getRowId={(row) => row.id}
        pageSizeOptions={[2]}
        features={{ rowSelection: false }}
      />,
    );

    await screen.findByText("Charlie");

    expect(dataSource).toHaveBeenCalledWith(
      expect.objectContaining({
        sorting: [],
        globalFilter: "",
        columnFilters: [],
        pagination: { pageIndex: 0, pageSize: 2 },
        requestId: 1,
      }),
    );
    expect(dataSource.mock.calls[0]?.[0].signal).toBeInstanceOf(AbortSignal);
    expect(bodyNames()).toEqual(["Charlie", "Alice"]);
    expect(screen.getByText(/2 of 3 rows/)).toBeInTheDocument();
    expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument();
  });

  it("refetches on server query changes and resets page index for search", async () => {
    const dataSource = vi.fn(async (request: DataGridDataSourceRequest) => pageRows(request));

    render(
      <DataGrid
        columns={columns}
        dataSource={dataSource}
        getRowId={(row) => row.id}
        pageSizeOptions={[2]}
        features={{ rowSelection: false }}
      />,
    );
    await screen.findByText("Charlie");

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(dataSource).toHaveBeenLastCalledWith(
        expect.objectContaining({
          pagination: { pageIndex: 1, pageSize: 2 },
        }),
      ),
    );
    expect(bodyNames()).toEqual(["Bob"]);

    fireEvent.change(screen.getByPlaceholderText(/Search/i), {
      target: { value: "ali" },
    });

    await waitFor(() =>
      expect(dataSource).toHaveBeenLastCalledWith(
        expect.objectContaining({
          globalFilter: "ali",
          pagination: { pageIndex: 0, pageSize: 2 },
        }),
      ),
    );
    expect(bodyNames()).toEqual(["Alice"]);
  });

  it("aborts and ignores stale responses", async () => {
    const first = deferred<{ rows: Row[]; rowCount: number }>();
    const second = deferred<{ rows: Row[]; rowCount: number }>();
    const dataSource = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    render(
      <DataGrid
        columns={columns}
        dataSource={dataSource}
        getRowId={(row) => row.id}
        features={{ rowSelection: false }}
      />,
    );

    await waitFor(() => expect(dataSource).toHaveBeenCalledTimes(1));
    const firstSignal = dataSource.mock.calls[0]?.[0].signal as AbortSignal;

    fireEvent.click(screen.getByRole("button", { name: "Name" }));
    await waitFor(() => expect(dataSource).toHaveBeenCalledTimes(2));
    expect(firstSignal.aborted).toBe(true);

    await act(async () => {
      second.resolve({ rows: [rows[1]], rowCount: 1 });
    });
    expect(await screen.findByText("Alice")).toBeInTheDocument();

    await act(async () => {
      first.resolve({ rows: [rows[0]], rowCount: 1 });
    });
    expect(screen.queryByText("Charlie")).not.toBeInTheDocument();
    expect(bodyNames()).toEqual(["Alice"]);
  });

  it("surfaces rejected requests with a customizable error renderer", async () => {
    const error = new Error("offline");
    const onDataSourceError = vi.fn();
    const dataSource = vi.fn(async () => {
      throw error;
    });

    render(
      <DataGrid
        columns={columns}
        dataSource={dataSource}
        getRowId={(row) => row.id}
        renderDataSourceError={(reason) =>
          reason instanceof Error ? `Load failed: ${reason.message}` : "Load failed"
        }
        onDataSourceError={onDataSourceError}
      />,
    );

    expect(await screen.findByText("Load failed: offline")).toBeInTheDocument();
    expect(onDataSourceError).toHaveBeenCalledWith(error);
  });
});
