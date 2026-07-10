import type {
  DataGridAggregateQuery,
  DataGridApi,
  DataGridCommand,
  DataGridDataAccessLimits,
  DataGridQuery,
} from "./dataGridApi";

export type DataGridAgentPermissions = {
  readData: boolean;
  changeView: boolean;
  changeFormatting: boolean;
};

export type DataGridAgentToolkitOptions<TData extends object> = {
  api: DataGridApi<TData> | { current: DataGridApi<TData> | null };
  permissions: DataGridAgentPermissions;
  limits?: Partial<Pick<DataGridDataAccessLimits, "maxRowsPerQuery" | "maxCellsPerQuery">>;
};

export type DataGridAgentToolDefinition = {
  name:
    | "grid_get_context"
    | "grid_query_rows"
    | "grid_aggregate"
    | "grid_update_view"
    | "grid_update_selection"
    | "grid_format_columns";
  description: string;
  inputSchema: Record<string, unknown>;
};

const scopeSchema = {
  type: "string",
  enum: ["all", "filtered", "selected_rows", "visible_page"],
};

const numberFormatSchema = {
  type: "object",
  properties: Object.fromEntries([
    "localeMatcher", "style", "currency", "currencyDisplay", "currencySign", "useGrouping",
    "minimumIntegerDigits", "minimumFractionDigits", "maximumFractionDigits",
    "minimumSignificantDigits", "maximumSignificantDigits", "compactDisplay", "notation",
    "signDisplay", "unit", "unitDisplay", "roundingMode", "roundingPriority",
    "roundingIncrement", "trailingZeroDisplay",
  ].map((key) => [key, {}])),
  additionalProperties: false,
};

const dateFormatSchema = {
  type: "object",
  properties: Object.fromEntries([
    "dateStyle", "timeStyle", "calendar", "dayPeriod", "numberingSystem", "localeMatcher",
    "timeZone", "hour12", "hourCycle", "formatMatcher", "weekday", "era", "year", "month",
    "day", "hour", "minute", "second", "timeZoneName", "fractionalSecondDigits",
  ].map((key) => [key, {}])),
  additionalProperties: false,
};

const columnPresentationSchema = {
  type: "object",
  properties: {
    numberFormat: numberFormatSchema,
    dateFormat: dateFormatSchema,
    colorScale: {
      type: "object",
      required: ["colors"],
      properties: {
        colors: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 3 },
        domain: {},
        autoTextColor: { type: "boolean" },
      },
      additionalProperties: false,
    },
    dataBar: {
      type: "object",
      properties: {
        color: { type: "string" },
        negativeColor: { type: "string" },
        domain: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
        showValue: { type: "boolean" },
      },
      additionalProperties: false,
    },
    progressBar: { type: "boolean" },
    rules: {
      type: "array",
      items: {
        type: "object",
        required: ["operator", "tone"],
        properties: {
          operator: {
            type: "string",
            enum: ["is", "isNot", "isAnyOf", "isNoneOf", "contains", "notContains", "startsWith", "endsWith", "equals", "notEquals", "gt", "gte", "lt", "lte", "between", "before", "onOrBefore", "after", "onOrAfter", "isEmpty", "isNotEmpty"],
          },
          value: {},
          tone: { type: "string", enum: ["positive", "negative", "warning", "accent", "muted"] },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
};

export const dataGridAgentToolDefinitions: DataGridAgentToolDefinition[] = [
  {
    name: "grid_get_context",
    description: "Get serializable columns, counts, capabilities, view state, and current selections.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "grid_query_rows",
    description: "Read bounded, serializable source-row values from a grid scope.",
    inputSchema: {
      type: "object",
      required: ["scope"],
      properties: {
        scope: scopeSchema,
        columnIds: { type: "array", items: { type: "string" }, uniqueItems: true },
        offset: { type: "integer", minimum: 0 },
        limit: { type: "integer", minimum: 0 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "grid_aggregate",
    description: "Compute count, sum, average, min/max, distinct count, top values, or grouped metrics.",
    inputSchema: {
      type: "object",
      required: ["scope", "metrics"],
      properties: {
        scope: scopeSchema,
        groupBy: { type: "array", items: { type: "string" }, uniqueItems: true },
        metrics: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            required: ["operation"],
            properties: {
              columnId: { type: "string" },
              operation: {
                type: "string",
                enum: ["count", "sum", "average", "min", "max", "min_max", "distinct_count", "top_values"],
              },
              as: { type: "string" },
              limit: { type: "integer", minimum: 1 },
            },
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "grid_update_view",
    description: "Change visible columns, sorting, filters, or global search using declarative state.",
    inputSchema: {
      type: "object",
      properties: {
        visibleColumnIds: { type: "array", items: { type: "string" }, uniqueItems: true },
        sorting: { type: "array", items: { type: "object" } },
        filters: { type: "array", items: { type: "object" } },
        grouping: { type: "array", items: { type: "string" }, uniqueItems: true },
        globalFilter: { type: "string" },
        pageIndex: { type: "integer", minimum: 0 },
        pageSize: { type: "integer", minimum: 1 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "grid_update_selection",
    description: "Select source rows, columns, and/or a rectangular cell range.",
    inputSchema: {
      type: "object",
      properties: {
        rowIds: { type: "array", items: { type: "string" }, uniqueItems: true },
        rowMode: { type: "string", enum: ["replace", "add", "remove"] },
        columnIds: { type: "array", items: { type: "string" }, uniqueItems: true },
        columnMode: { type: "string", enum: ["replace", "add", "remove"] },
        cellSelection: {
          anyOf: [
            { type: "null" },
            {
              type: "object",
              required: ["anchor", "focus"],
              properties: {
                anchor: { type: "object", required: ["rowId", "columnId"] },
                focus: { type: "object", required: ["rowId", "columnId"] },
              },
            },
          ],
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "grid_format_columns",
    description: "Apply serializable number/date formats, color scales, data bars, progress bars, and tone rules.",
    inputSchema: {
      type: "object",
      required: ["presentation"],
      properties: {
        presentation: { type: "object", additionalProperties: columnPresentationSchema },
        mode: { type: "string", enum: ["merge", "replace"] },
      },
      additionalProperties: false,
    },
  },
];

const permissionError = (permission: keyof DataGridAgentPermissions) => ({
  ok: false as const,
  error: {
    code: "permission_denied",
    message: `Toolkit permission ${permission} is required for this tool.`,
  },
});

const invalidInput = (message: string) => ({
  ok: false as const,
  error: { code: "invalid_tool_input", message },
});

export function createDataGridAgentToolkit<TData extends object>({
  api: apiOrRef,
  permissions,
  limits,
}: DataGridAgentToolkitOptions<TData>) {
  const getApi = () =>
    "current" in apiOrRef ? apiOrRef.current : apiOrRef;
  const maxRowsPerQuery = Math.max(1, Math.floor(limits?.maxRowsPerQuery ?? 100));
  const maxCellsPerQuery = Math.max(1, Math.floor(limits?.maxCellsPerQuery ?? 2_000));

  const execute = (toolName: DataGridAgentToolDefinition["name"], input: unknown = {}) => {
    const api = getApi();
    if (!api) return { ok: false as const, error: { code: "api_unavailable", message: "The grid API is not mounted." } };
    const value = input && typeof input === "object" ? input as Record<string, unknown> : {};

    if (toolName === "grid_get_context") {
      return permissions.readData ? api.getSnapshot() : permissionError("readData");
    }
    if (toolName === "grid_query_rows") {
      if (!permissions.readData) return permissionError("readData");
      const query = value as DataGridQuery;
      if (!["all", "filtered", "selected_rows", "visible_page"].includes(query.scope)) {
        return invalidInput("A supported query scope is required.");
      }
      const limit = query.limit ?? maxRowsPerQuery;
      const snapshot = api.getSnapshot();
      const defaultColumnCount = snapshot.state.cellSelection
        ? Math.abs(
            snapshot.columns.findIndex((column) => column.id === snapshot.state.cellSelection?.anchor.columnId) -
            snapshot.columns.findIndex((column) => column.id === snapshot.state.cellSelection?.focus.columnId),
          ) + 1
        : snapshot.state.selectedColumnIds.length || snapshot.columns.filter((column) => column.visible).length;
      const columnCount = query.columnIds?.length ?? defaultColumnCount;
      if (limit > maxRowsPerQuery || limit * columnCount > maxCellsPerQuery) {
        return invalidInput(`Query exceeds the toolkit's ${maxRowsPerQuery}-row or ${maxCellsPerQuery}-cell limit.`);
      }
      return api.query({ ...query, limit });
    }
    if (toolName === "grid_aggregate") {
      if (!permissions.readData) return permissionError("readData");
      if (
        !["all", "filtered", "selected_rows", "visible_page"].includes(value.scope as string) ||
        !Array.isArray(value.metrics) ||
        value.metrics.length === 0
      ) {
        return invalidInput("A supported scope and at least one metric are required.");
      }
      return api.aggregate(value as DataGridAggregateQuery);
    }
    if (toolName === "grid_update_view") {
      if (!permissions.changeView) return permissionError("changeView");
      const commands: DataGridCommand[] = [];
      if (Array.isArray(value.visibleColumnIds)) {
        const visible = new Set(value.visibleColumnIds as string[]);
        const allColumnIds = api.getSnapshot().columns.filter((column) => !column.generated).map((column) => column.id);
        commands.push({ type: "set_column_visibility", columnIds: allColumnIds, visible: false });
        if (visible.size > 0) commands.push({ type: "set_column_visibility", columnIds: [...visible], visible: true });
      }
      if (Array.isArray(value.sorting)) commands.push({ type: "set_sorting", sorting: value.sorting as never });
      if (Array.isArray(value.filters)) commands.push({ type: "set_column_filters", filters: value.filters as never });
      if (Array.isArray(value.grouping)) commands.push({ type: "set_grouping", columnIds: value.grouping as string[] });
      if (typeof value.globalFilter === "string") commands.push({ type: "set_global_filter", value: value.globalFilter });
      if (value.pageIndex != null || value.pageSize != null) {
        const current = api.getSnapshot().state.pagination;
        commands.push({
          type: "set_pagination",
          pagination: {
            pageIndex: typeof value.pageIndex === "number" ? value.pageIndex : current.pageIndex,
            pageSize: typeof value.pageSize === "number" ? value.pageSize : current.pageSize,
          },
        });
      }
      return commands.length > 0 ? api.dispatch(commands) : invalidInput("At least one view change is required.");
    }
    if (toolName === "grid_update_selection") {
      if (!permissions.changeView) return permissionError("changeView");
      const commands: DataGridCommand[] = [];
      if (Array.isArray(value.rowIds)) {
        commands.push({ type: "set_row_selection", rowIds: value.rowIds as string[], mode: value.rowMode as never });
      }
      if (Array.isArray(value.columnIds)) {
        commands.push({ type: "set_selected_columns", columnIds: value.columnIds as string[], mode: value.columnMode as never });
      }
      if ("cellSelection" in value) {
        commands.push({ type: "set_cell_selection", selection: value.cellSelection as never });
      }
      return commands.length > 0 ? api.dispatch(commands) : invalidInput("At least one selection change is required.");
    }
    if (!permissions.changeFormatting) return permissionError("changeFormatting");
    if (!value.presentation || typeof value.presentation !== "object") {
      return invalidInput("presentation is required.");
    }
    return api.dispatch([{
      type: "set_column_presentation",
      presentation: value.presentation as never,
      mode: value.mode === "replace" ? "replace" : "merge",
    }]);
  };

  return { tools: dataGridAgentToolDefinitions, execute };
}
