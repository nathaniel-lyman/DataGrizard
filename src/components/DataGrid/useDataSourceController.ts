import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  ColumnFiltersState,
  PaginationState,
  SortingState,
} from "@tanstack/react-table";
import type {
  DataGridControlledState,
  DataGridDataMode,
  DataGridDataSource,
  DataGridProps,
} from "./dataGridTypes";

type DataSourceControllerArgs<TData extends object> = {
  externalData: TData[];
  dataSource?: DataGridDataSource<TData>;
  isPivotLayout: boolean;
  dataMode: DataGridDataMode;
  externalRowCount?: number;
  externalIsLoading: boolean;
  externalError?: ReactNode;
  externalControlledState?: DataGridControlledState;
  pageSizeOptions: number[];
  externalOnSortingChange?: DataGridProps<TData>["onSortingChange"];
  externalOnGlobalFilterChange?: DataGridProps<TData>["onGlobalFilterChange"];
  externalOnColumnFiltersChange?: DataGridProps<TData>["onColumnFiltersChange"];
  externalOnPaginationChange?: DataGridProps<TData>["onPaginationChange"];
  renderDataSourceError?: DataGridProps<TData>["renderDataSourceError"];
  onDataSourceError?: DataGridProps<TData>["onDataSourceError"];
};

export function useDataSourceController<TData extends object>({
  externalData,
  dataSource,
  isPivotLayout,
  dataMode,
  externalRowCount,
  externalIsLoading,
  externalError,
  externalControlledState,
  pageSizeOptions,
  externalOnSortingChange,
  externalOnGlobalFilterChange,
  externalOnColumnFiltersChange,
  externalOnPaginationChange,
  renderDataSourceError,
  onDataSourceError,
}: DataSourceControllerArgs<TData>) {
  const isDataSourceMode = Boolean(dataSource) && !isPivotLayout;
  const [dataSourceRows, setDataSourceRows] = useState<TData[]>(() => externalData);
  const [dataSourceRowCount, setDataSourceRowCount] = useState<number | undefined>(
    externalRowCount,
  );
  const [dataSourceLoading, setDataSourceLoading] = useState(() => isDataSourceMode);
  const [dataSourceError, setDataSourceError] = useState<ReactNode>(null);
  const [dataSourceSorting, setDataSourceSorting] = useState<SortingState>(
    externalControlledState?.sorting ?? [],
  );
  const [dataSourceGlobalFilter, setDataSourceGlobalFilter] = useState(
    externalControlledState?.globalFilter ?? "",
  );
  const [dataSourceColumnFilters, setDataSourceColumnFilters] = useState<ColumnFiltersState>(
    externalControlledState?.columnFilters ?? [],
  );
  const [dataSourcePagination, setDataSourcePagination] = useState<PaginationState>(
    externalControlledState?.pagination ?? {
      pageIndex: 0,
      pageSize: pageSizeOptions[1] ?? pageSizeOptions[0] ?? 50,
    },
  );
  const requestIdRef = useRef(0);
  const renderErrorRef = useRef(renderDataSourceError);
  const onErrorRef = useRef(onDataSourceError);

  useEffect(() => {
    renderErrorRef.current = renderDataSourceError;
    onErrorRef.current = onDataSourceError;
  }, [onDataSourceError, renderDataSourceError]);

  const sorting = externalControlledState?.sorting ?? dataSourceSorting;
  const globalFilter = externalControlledState?.globalFilter ?? dataSourceGlobalFilter;
  const columnFilters = externalControlledState?.columnFilters ?? dataSourceColumnFilters;
  const pagination = externalControlledState?.pagination ?? dataSourcePagination;

  const setPagination = useCallback(
    (next: PaginationState) => {
      if (externalControlledState?.pagination === undefined) {
        setDataSourcePagination(next);
      }
      externalOnPaginationChange?.(next);
    },
    [externalControlledState?.pagination, externalOnPaginationChange],
  );

  const resetPageIndex = useCallback(() => {
    if (pagination.pageIndex !== 0) {
      setPagination({ ...pagination, pageIndex: 0 });
    }
  }, [pagination, setPagination]);

  const handleSortingChange = useCallback(
    (next: SortingState) => {
      if (externalControlledState?.sorting === undefined) {
        setDataSourceSorting(next);
      }
      externalOnSortingChange?.(next);
      resetPageIndex();
    },
    [externalControlledState?.sorting, externalOnSortingChange, resetPageIndex],
  );

  const handleGlobalFilterChange = useCallback(
    (next: string) => {
      if (externalControlledState?.globalFilter === undefined) {
        setDataSourceGlobalFilter(next);
      }
      externalOnGlobalFilterChange?.(next);
      resetPageIndex();
    },
    [externalControlledState?.globalFilter, externalOnGlobalFilterChange, resetPageIndex],
  );

  const handleColumnFiltersChange = useCallback(
    (next: ColumnFiltersState) => {
      if (externalControlledState?.columnFilters === undefined) {
        setDataSourceColumnFilters(next);
      }
      externalOnColumnFiltersChange?.(next);
      resetPageIndex();
    },
    [externalControlledState?.columnFilters, externalOnColumnFiltersChange, resetPageIndex],
  );

  useEffect(() => {
    if (!isDataSourceMode || !dataSource) {
      return;
    }

    const controller = new AbortController();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setDataSourceLoading(true);
    setDataSourceError(null);

    Promise.resolve(
      dataSource({
        sorting,
        globalFilter,
        columnFilters,
        pagination,
        signal: controller.signal,
        requestId,
      }),
    )
      .then((result) => {
        if (controller.signal.aborted || requestId !== requestIdRef.current) {
          return;
        }
        if (!Array.isArray(result.rows)) {
          throw new Error("DataGrid dataSource must return a rows array.");
        }
        const nextRowCount =
          typeof result.rowCount === "number" && Number.isFinite(result.rowCount)
            ? Math.max(result.rowCount, 0)
            : undefined;
        setDataSourceRows(result.rows);
        setDataSourceRowCount(nextRowCount);
        setDataSourceLoading(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || requestId !== requestIdRef.current) {
          return;
        }
        onErrorRef.current?.(error);
        setDataSourceError(
          renderErrorRef.current ? renderErrorRef.current(error) : "Unable to load rows.",
        );
        setDataSourceLoading(false);
      });

    return () => controller.abort();
  }, [columnFilters, dataSource, globalFilter, isDataSourceMode, pagination, sorting]);

  const controlledState = useMemo<DataGridControlledState | undefined>(
    () =>
      isDataSourceMode
        ? {
            ...externalControlledState,
            sorting,
            globalFilter,
            columnFilters,
            pagination,
          }
        : externalControlledState,
    [
      columnFilters,
      externalControlledState,
      globalFilter,
      isDataSourceMode,
      pagination,
      sorting,
    ],
  );

  return {
    isDataSourceMode,
    data: isDataSourceMode ? dataSourceRows : externalData,
    rowCount: isDataSourceMode ? dataSourceRowCount : externalRowCount,
    effectiveDataMode: isDataSourceMode ? ("server" as const) : dataMode,
    isLoading: isDataSourceMode ? externalIsLoading || dataSourceLoading : externalIsLoading,
    error:
      externalError !== undefined && externalError !== null
        ? externalError
        : isDataSourceMode
          ? dataSourceError
          : externalError,
    controlledState,
    onSortingChange: isDataSourceMode ? handleSortingChange : externalOnSortingChange,
    onGlobalFilterChange: isDataSourceMode
      ? handleGlobalFilterChange
      : externalOnGlobalFilterChange,
    onColumnFiltersChange: isDataSourceMode
      ? handleColumnFiltersChange
      : externalOnColumnFiltersChange,
    onPaginationChange: isDataSourceMode ? setPagination : externalOnPaginationChange,
  };
}
