import type {
  DataGridAggregateOperation,
  DataGridAggregateQuery,
  DataGridApi,
  DataGridCommand,
  DataGridDataAccessLimits,
  DataGridQuery,
  DataGridSnapshot,
  DataGridSourceColumnSnapshot,
} from "./dataGridApi";

export type DataGridAgentPermissions = {
  readData: boolean;
  changeView: boolean;
  changeFormatting: boolean;
  /**
   * Optional sensitivity allowlist. Columns without a sensitivity label remain
   * available. Omit this property to allow every consumer-defined label.
   */
  allowedSensitivityLevels?: string[];
};

export type DataGridAgentPermissionSource =
  | DataGridAgentPermissions
  | (() => DataGridAgentPermissions);

export type DataGridAgentToolkitOptions<TData extends object> = {
  api: DataGridApi<TData> | { current: DataGridApi<TData> | null };
  /** A callback keeps generated schemas aligned with changing user/session permissions. */
  permissions: DataGridAgentPermissionSource;
  limits?: Partial<Pick<DataGridDataAccessLimits, "maxRowsPerQuery" | "maxCellsPerQuery">>;
};

export type DataGridAgentToolName =
  | "grid_get_context"
  | "grid_query_rows"
  | "grid_aggregate"
  | "grid_update_view"
  | "grid_update_selection"
  | "grid_format_columns";

export type DataGridAgentToolDefinition = {
  name: DataGridAgentToolName;
  description: string;
  inputSchema: Record<string, unknown>;
};

type JsonSchema = Record<string, unknown>;

const numberFormatSchema: JsonSchema = {
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

const dateFormatSchema: JsonSchema = {
  type: "object",
  properties: Object.fromEntries([
    "dateStyle", "timeStyle", "calendar", "dayPeriod", "numberingSystem", "localeMatcher",
    "timeZone", "hour12", "hourCycle", "formatMatcher", "weekday", "era", "year", "month",
    "day", "hour", "minute", "second", "timeZoneName", "fractionalSecondDigits",
  ].map((key) => [key, {}])),
  additionalProperties: false,
};

const toneSchema = {
  type: "string",
  enum: ["positive", "negative", "warning", "accent", "muted"],
};

const scalarSchemaForColumn = (column: DataGridSourceColumnSnapshot): JsonSchema => {
  const allowedValues = column.semantic?.allowedValues ?? column.filter?.allowedValues;
  if (allowedValues?.length) return { enum: allowedValues };
  if (["number", "currency", "percent"].includes(column.dataType)) {
    return {
      type: "number",
      ...(column.filter?.min == null ? {} : { minimum: column.filter.min }),
      ...(column.filter?.max == null ? {} : { maximum: column.filter.max }),
    };
  }
  if (column.dataType === "boolean") return { type: "boolean" };
  return { type: "string" };
};

const columnDescription = (column: DataGridSourceColumnSnapshot) => {
  const semantic = column.semantic;
  return [
    `${column.label} (${column.id}); type: ${column.dataType}`,
    semantic?.description,
    semantic?.synonyms?.length ? `Synonyms: ${semantic.synonyms.join(", ")}.` : undefined,
    semantic?.unit ? `Unit: ${semantic.unit}.` : undefined,
    semantic?.currency ? `Currency: ${semantic.currency}.` : undefined,
    semantic?.allowedValues?.length
      ? `Allowed values: ${semantic.allowedValues.map(String).join(", ")}.`
      : undefined,
    semantic?.sensitivity ? `Sensitivity: ${semantic.sensitivity}.` : undefined,
  ].filter(Boolean).join(" ");
};

const columnIdSchema = (columns: DataGridSourceColumnSnapshot[]): JsonSchema => ({
  type: "string",
  oneOf: columns.map((column) => ({
    const: column.id,
    title: column.label,
    description: columnDescription(column),
  })),
});

const filterValueSchema = (
  column: DataGridSourceColumnSnapshot,
  operator: string,
): JsonSchema => {
  const scalar = scalarSchemaForColumn(column);
  if (operator === "isAnyOf" || operator === "isNoneOf") {
    return { type: "array", items: scalar, minItems: 1, uniqueItems: true };
  }
  if (operator === "between" && column.filter?.type === "range") {
    return {
      type: "object",
      properties: { min: scalar, max: scalar },
      additionalProperties: false,
    };
  }
  if (operator === "between" && column.filter?.type === "date") {
    return {
      type: "object",
      properties: {
        from: { type: "string", format: "date" },
        to: { type: "string", format: "date" },
      },
      additionalProperties: false,
    };
  }
  return scalar;
};

const filterClauseSchema = (column: DataGridSourceColumnSnapshot): JsonSchema => {
  const operators = column.filter?.operators ?? [];
  return {
    oneOf: operators.map((operator) => {
      const unary = operator === "isEmpty" || operator === "isNotEmpty";
      return {
        type: "object",
        required: ["operator", ...(unary ? [] : ["value"])],
        properties: {
          operator: { const: operator },
          ...(unary ? {} : { value: filterValueSchema(column, operator) }),
        },
        additionalProperties: false,
      };
    }),
  };
};

const presentationRuleSchema = (column: DataGridSourceColumnSnapshot): JsonSchema => ({
  type: "array",
  items: {
    type: "object",
    required: ["operator", "tone"],
    properties: {
      operator: {
        type: "string",
        enum: column.filter?.operators ?? ["is", "isNot", "isEmpty", "isNotEmpty"],
      },
      value: scalarSchemaForColumn(column),
      tone: toneSchema,
    },
    additionalProperties: false,
  },
});

const presentationKeysForColumn = (column: DataGridSourceColumnSnapshot) => new Set([
  ...(["number", "currency", "percent"].includes(column.dataType)
    ? ["numberFormat", "colorScale", "dataBar"]
    : []),
  ...(column.dataType === "date" ? ["dateFormat"] : []),
  ...(column.dataType === "percent" ? ["progressBar"] : []),
  "rules",
]);

const presentationSchemaForColumn = (column: DataGridSourceColumnSnapshot): JsonSchema => {
  const numeric = ["number", "currency", "percent"].includes(column.dataType);
  return {
    type: "object",
    properties: {
      ...(numeric ? {
        numberFormat: numberFormatSchema,
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
      } : {}),
      ...(column.dataType === "date" ? { dateFormat: dateFormatSchema } : {}),
      ...(column.dataType === "percent" ? { progressBar: { type: "boolean" } } : {}),
      rules: presentationRuleSchema(column),
    },
    additionalProperties: false,
  };
};

const availableScopes = (snapshot: DataGridSnapshot) => [
  ...(snapshot.dataMode === "client" ? ["all", "filtered"] : []),
  ...(snapshot.features.rowSelection ? ["selected_rows"] : []),
  "visible_page",
];

const isColumnAllowed = (
  column: DataGridSourceColumnSnapshot,
  permissions: DataGridAgentPermissions,
) => {
  const sensitivity = column.semantic?.sensitivity;
  return !sensitivity ||
    permissions.allowedSensitivityLevels == null ||
    permissions.allowedSensitivityLevels.includes(sensitivity);
};

const getAllowedColumns = (
  snapshot: DataGridSnapshot,
  permissions: DataGridAgentPermissions,
) => snapshot.sourceColumns.filter((column) => isColumnAllowed(column, permissions));

const createToolDefinitions = (
  snapshot: DataGridSnapshot,
  permissions: DataGridAgentPermissions,
  limits: { maxRowsPerQuery: number; maxCellsPerQuery: number },
): DataGridAgentToolDefinition[] => {
  const columns = getAllowedColumns(snapshot, permissions);
  const scopes = availableScopes(snapshot);
  const tools: DataGridAgentToolDefinition[] = [];

  if (permissions.readData) {
    tools.push({
      name: "grid_get_context",
      description: "Get the permission-filtered live grid contract, counts, capabilities, view state, and current selections.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
    });

    if (columns.length > 0) {
      tools.push({
        name: "grid_query_rows",
        description: `Read bounded source-row values. Live data mode: ${snapshot.dataMode}. Maximum ${limits.maxRowsPerQuery} rows and ${limits.maxCellsPerQuery} cells per call.`,
        inputSchema: {
          type: "object",
          required: ["scope"],
          properties: {
            scope: { type: "string", enum: scopes },
            columnIds: {
              type: "array",
              items: columnIdSchema(columns),
              minItems: 1,
              uniqueItems: true,
            },
            offset: { type: "integer", minimum: 0 },
            limit: { type: "integer", minimum: 0, maximum: limits.maxRowsPerQuery },
          },
          additionalProperties: false,
        },
      });

      const metricVariants: JsonSchema[] = [{
        type: "object",
        required: ["operation"],
        properties: {
          operation: { const: "count" },
          as: { type: "string" },
        },
        additionalProperties: false,
      }];
      columns.forEach((column) => {
        metricVariants.push({
          type: "object",
          required: ["columnId", "operation"],
          properties: {
            columnId: { const: column.id, description: columnDescription(column) },
            operation: { type: "string", enum: column.aggregateOperations },
            as: { type: "string" },
            limit: { type: "integer", minimum: 1 },
          },
          additionalProperties: false,
        });
      });
      tools.push({
        name: "grid_aggregate",
        description: `Compute only type-legal metrics over an available scope. Live data mode: ${snapshot.dataMode}.`,
        inputSchema: {
          type: "object",
          required: ["scope", "metrics"],
          properties: {
            scope: { type: "string", enum: scopes },
            groupBy: {
              type: "array",
              items: columnIdSchema(columns),
              uniqueItems: true,
            },
            metrics: {
              type: "array",
              minItems: 1,
              items: { oneOf: metricVariants },
            },
          },
          additionalProperties: false,
        },
      });
    }
  }

  if (permissions.changeView && columns.length > 0) {
    const hideable = columns.filter((column) => column.canHide);
    const sortable = columns.filter((column) => column.canSort);
    const filterable = columns.filter((column) => column.canFilter && column.filter);
    const groupable = columns.filter((column) => column.canGroup);
    const properties: Record<string, JsonSchema> = {};
    if (snapshot.features.columnVisibility && hideable.length > 0) {
      properties.visibleColumnIds = {
        type: "array",
        items: columnIdSchema(hideable),
        uniqueItems: true,
      };
    }
    if (snapshot.features.sorting && sortable.length > 0) {
      properties.sorting = {
        type: "array",
        items: {
          type: "object",
          required: ["id", "desc"],
          properties: {
            id: columnIdSchema(sortable),
            desc: { type: "boolean" },
          },
          additionalProperties: false,
        },
      };
    }
    if (snapshot.features.headerFilters && filterable.length > 0) {
      properties.filters = {
        type: "array",
        items: {
          oneOf: filterable.map((column) => ({
            type: "object",
            required: ["id", "value"],
            properties: {
              id: { const: column.id, description: columnDescription(column) },
              value: filterClauseSchema(column),
            },
            additionalProperties: false,
          })),
        },
      };
    }
    if (snapshot.features.grouping && snapshot.layoutMode === "grid" && groupable.length > 0) {
      properties.grouping = {
        type: "array",
        items: columnIdSchema(groupable),
        uniqueItems: true,
      };
    }
    if (snapshot.features.globalSearch) properties.globalFilter = { type: "string" };
    if (snapshot.features.pagination) {
      properties.pageIndex = { type: "integer", minimum: 0 };
      properties.pageSize = { type: "integer", minimum: 1 };
    }
    if (Object.keys(properties).length > 0) {
      tools.push({
        name: "grid_update_view",
        description: `Change only view operations enabled by the live ${snapshot.layoutMode} grid.`,
        inputSchema: { type: "object", properties, additionalProperties: false },
      });
    }

    const selectionProperties: Record<string, JsonSchema> = {
      columnIds: {
        type: "array",
        items: columnIdSchema(columns),
        uniqueItems: true,
      },
      columnMode: { type: "string", enum: ["replace", "add", "remove"] },
    };
    if (snapshot.features.rowSelection) {
      selectionProperties.rowIds = { type: "array", items: { type: "string" }, uniqueItems: true };
      selectionProperties.rowMode = { type: "string", enum: ["replace", "add", "remove"] };
    }
    if (snapshot.features.cellSelection) {
      const cell = {
        type: "object",
        required: ["rowId", "columnId"],
        properties: {
          rowId: { type: "string" },
          columnId: columnIdSchema(columns),
        },
        additionalProperties: false,
      };
      selectionProperties.cellSelection = {
        anyOf: [
          { type: "null" },
          {
            type: "object",
            required: ["anchor", "focus"],
            properties: { anchor: cell, focus: cell },
            additionalProperties: false,
          },
        ],
      };
    }
    tools.push({
      name: "grid_update_selection",
      description: "Change only selection modes enabled by the live grid.",
      inputSchema: { type: "object", properties: selectionProperties, additionalProperties: false },
    });
  }

  if (permissions.changeFormatting && columns.length > 0) {
    tools.push({
      name: "grid_format_columns",
      description: "Apply type-aware, serializable presentation to authorized source columns.",
      inputSchema: {
        type: "object",
        required: ["presentation"],
        properties: {
          presentation: {
            type: "object",
            properties: Object.fromEntries(
              columns.map((column) => [column.id, presentationSchemaForColumn(column)]),
            ),
            additionalProperties: false,
          },
          mode: { type: "string", enum: ["merge", "replace"] },
        },
        additionalProperties: false,
      },
    });
  }

  return tools;
};

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

const unavailableTool = (toolName: DataGridAgentToolName) => ({
  ok: false as const,
  error: {
    code: "tool_unavailable",
    message: `${toolName} is not available under the live grid features, permissions, and data mode.`,
  },
});

const filterRecord = <T>(record: Record<string, T>, allowed: Set<string>) =>
  Object.fromEntries(Object.entries(record).filter(([id]) => allowed.has(id)));

const sanitizeSnapshot = (
  snapshot: DataGridSnapshot,
  permissions: DataGridAgentPermissions,
) => {
  const sourceColumns = getAllowedColumns(snapshot, permissions);
  const allowed = new Set(sourceColumns.map((column) => column.id));
  const cellSelection = snapshot.state.cellSelection &&
    allowed.has(snapshot.state.cellSelection.anchor.columnId) &&
    allowed.has(snapshot.state.cellSelection.focus.columnId)
    ? snapshot.state.cellSelection
    : null;
  return {
    ...snapshot,
    permissions: {
      ...permissions,
      allowedSensitivityLevels: permissions.allowedSensitivityLevels
        ? [...permissions.allowedSensitivityLevels]
        : undefined,
    },
    sourceColumns,
    columns: snapshot.columns.filter((column) =>
      column.generated
        ? sourceColumns.length === snapshot.sourceColumns.length
        : allowed.has(column.id),
    ),
    state: {
      ...snapshot.state,
      sorting: snapshot.state.sorting.filter((item) => allowed.has(item.id)),
      columnFilters: snapshot.state.columnFilters.filter((item) => allowed.has(item.id)),
      columnVisibility: filterRecord(snapshot.state.columnVisibility, allowed),
      columnSizing: filterRecord(snapshot.state.columnSizing, allowed),
      columnOrder: snapshot.state.columnOrder.filter((id) => allowed.has(id)),
      columnPinning: {
        left: (snapshot.state.columnPinning.left ?? []).filter((id) => allowed.has(id)),
        right: (snapshot.state.columnPinning.right ?? []).filter((id) => allowed.has(id)),
      },
      selectedColumnIds: snapshot.state.selectedColumnIds.filter((id) => allowed.has(id)),
      cellSelection,
      columnPresentation: filterRecord(snapshot.state.columnPresentation, allowed),
      grouping: snapshot.state.grouping.filter((id) => allowed.has(id)),
      pivot: {
        ...snapshot.state.pivot,
        rows: snapshot.state.pivot.rows.filter((id) => allowed.has(id)),
        columns: snapshot.state.pivot.columns?.filter((axis) => allowed.has(axis.columnId)),
      },
    },
  };
};

const defaultQueryColumns = (
  snapshot: DataGridSnapshot,
  columns: DataGridSourceColumnSnapshot[],
) => {
  const allowed = new Set(columns.map((column) => column.id));
  const sourceOrder = snapshot.sourceColumns.map((column) => column.id).filter((id) => allowed.has(id));
  const selection = snapshot.state.cellSelection;
  if (selection && allowed.has(selection.anchor.columnId) && allowed.has(selection.focus.columnId)) {
    const anchor = sourceOrder.indexOf(selection.anchor.columnId);
    const focus = sourceOrder.indexOf(selection.focus.columnId);
    if (anchor >= 0 && focus >= 0) {
      return sourceOrder.slice(Math.min(anchor, focus), Math.max(anchor, focus) + 1);
    }
  }
  const selected = snapshot.state.selectedColumnIds.filter((id) => allowed.has(id));
  if (selected.length > 0) return selected;
  const visible = columns.filter((column) => column.visible).map((column) => column.id);
  return visible.length > 0 ? visible : sourceOrder;
};

export function createDataGridAgentToolkit<TData extends object>({
  api: apiOrRef,
  permissions: permissionSource,
  limits,
}: DataGridAgentToolkitOptions<TData>) {
  const getApi = () => "current" in apiOrRef ? apiOrRef.current : apiOrRef;
  const getPermissions = () => typeof permissionSource === "function"
    ? permissionSource()
    : permissionSource;
  const resolvedLimits = {
    maxRowsPerQuery: Math.max(1, Math.floor(limits?.maxRowsPerQuery ?? 100)),
    maxCellsPerQuery: Math.max(1, Math.floor(limits?.maxCellsPerQuery ?? 2_000)),
  };
  const getTools = () => {
    const api = getApi();
    if (!api) return [];
    return createToolDefinitions(api.getSnapshot(), getPermissions(), resolvedLimits);
  };

  const execute = (toolName: DataGridAgentToolName, input: unknown = {}) => {
    const api = getApi();
    if (!api) {
      return { ok: false as const, error: { code: "api_unavailable", message: "The grid API is not mounted." } };
    }
    const permissions = getPermissions();
    const snapshot = api.getSnapshot();
    const columns = getAllowedColumns(snapshot, permissions);
    const columnById = new Map(columns.map((column) => [column.id, column]));
    const availableToolNames = new Set(
      createToolDefinitions(snapshot, permissions, resolvedLimits).map((tool) => tool.name),
    );
    if (!availableToolNames.has(toolName)) {
      if (toolName === "grid_get_context" || toolName === "grid_query_rows" || toolName === "grid_aggregate") {
        if (!permissions.readData) return permissionError("readData");
      }
      if (toolName === "grid_update_view" || toolName === "grid_update_selection") {
        if (!permissions.changeView) return permissionError("changeView");
      }
      if (toolName === "grid_format_columns" && !permissions.changeFormatting) {
        return permissionError("changeFormatting");
      }
      return unavailableTool(toolName);
    }
    const value = input && typeof input === "object" ? input as Record<string, unknown> : {};
    const validateColumnIds = (ids: unknown, predicate?: (column: DataGridSourceColumnSnapshot) => boolean) => {
      if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
        return "Column ids must be an array of strings.";
      }
      const invalid = ids.find((id) => {
        const column = columnById.get(id as string);
        return !column || (predicate ? !predicate(column) : false);
      });
      return invalid == null ? null : `Column is unavailable for this operation: ${String(invalid)}.`;
    };

    if (toolName === "grid_get_context") {
      return sanitizeSnapshot(snapshot, permissions);
    }
    if (toolName === "grid_query_rows") {
      const scopes = availableScopes(snapshot);
      const query = value as DataGridQuery;
      if (!scopes.includes(query.scope)) return invalidInput("A scope available in the live data mode is required.");
      const columnIds = query.columnIds ?? defaultQueryColumns(snapshot, columns);
      const columnError = validateColumnIds(columnIds);
      if (columnError) return invalidInput(columnError);
      const limit = query.limit ?? resolvedLimits.maxRowsPerQuery;
      if (
        limit > resolvedLimits.maxRowsPerQuery ||
        limit * columnIds.length > resolvedLimits.maxCellsPerQuery
      ) {
        return invalidInput(`Query exceeds the toolkit's ${resolvedLimits.maxRowsPerQuery}-row or ${resolvedLimits.maxCellsPerQuery}-cell limit.`);
      }
      return api.query({ ...query, columnIds, limit });
    }
    if (toolName === "grid_aggregate") {
      if (
        !availableScopes(snapshot).includes(value.scope as string) ||
        !Array.isArray(value.metrics) ||
        value.metrics.length === 0
      ) {
        return invalidInput("A scope available in the live data mode and at least one metric are required.");
      }
      const groupError = value.groupBy == null ? null : validateColumnIds(value.groupBy);
      if (groupError) return invalidInput(groupError);
      for (const candidate of value.metrics) {
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
          return invalidInput("Each metric must be an object.");
        }
        const metric = candidate as Record<string, unknown>;
        if (metric.operation === "count" && metric.columnId == null) continue;
        if (typeof metric.columnId !== "string" || typeof metric.operation !== "string") {
          return invalidInput("Each non-row-count metric requires a columnId and operation.");
        }
        const column = columnById.get(metric.columnId);
        if (!column || !column.aggregateOperations.includes(metric.operation as DataGridAggregateOperation)) {
          return invalidInput(`Operation ${metric.operation} is unavailable for column ${metric.columnId}.`);
        }
      }
      return api.aggregate(value as DataGridAggregateQuery);
    }
    if (toolName === "grid_update_view") {
      const commands: DataGridCommand[] = [];
      if (Array.isArray(value.visibleColumnIds)) {
        const hideable = columns.filter((column) => column.canHide);
        const error = validateColumnIds(value.visibleColumnIds, (column) => column.canHide);
        if (error) return invalidInput(error);
        const visible = new Set(value.visibleColumnIds as string[]);
        commands.push({
          type: "set_column_visibility",
          columnIds: hideable.map((column) => column.id),
          visible: false,
        });
        if (visible.size > 0) {
          commands.push({ type: "set_column_visibility", columnIds: [...visible], visible: true });
        }
      }
      if (Array.isArray(value.sorting)) {
        if (value.sorting.some((item) => !item || typeof item !== "object" || Array.isArray(item))) {
          return invalidInput("Each sort entry must be an object.");
        }
        const ids = value.sorting.map((item) => (item as { id?: unknown }).id);
        const error = validateColumnIds(ids, (column) => column.canSort);
        if (error) return invalidInput(error);
        commands.push({ type: "set_sorting", sorting: value.sorting as never });
      }
      if (Array.isArray(value.filters)) {
        for (const candidate of value.filters) {
          if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
            return invalidInput("Each filter entry must be an object.");
          }
          const filter = candidate as { id?: unknown; value?: unknown };
          const error = validateColumnIds([filter.id], (column) => column.canFilter);
          if (error) return invalidInput(error);
          const column = columnById.get(filter.id as string);
          const operator = filter.value && typeof filter.value === "object"
            ? (filter.value as { operator?: unknown }).operator
            : undefined;
          if (typeof operator !== "string" || !column?.filter?.operators.includes(operator as never)) {
            return invalidInput(`A legal filter operator is required for column ${String(filter.id)}.`);
          }
        }
        commands.push({ type: "set_column_filters", filters: value.filters as never });
      }
      if (Array.isArray(value.grouping)) {
        const error = validateColumnIds(value.grouping, (column) => column.canGroup);
        if (error) return invalidInput(error);
        commands.push({ type: "set_grouping", columnIds: value.grouping as string[] });
      }
      if (typeof value.globalFilter === "string") {
        if (!snapshot.features.globalSearch) return unavailableTool(toolName);
        commands.push({ type: "set_global_filter", value: value.globalFilter });
      }
      if (value.pageIndex != null || value.pageSize != null) {
        if (!snapshot.features.pagination) return unavailableTool(toolName);
        const current = snapshot.state.pagination;
        commands.push({
          type: "set_pagination",
          pagination: {
            pageIndex: typeof value.pageIndex === "number" ? value.pageIndex : current.pageIndex,
            pageSize: typeof value.pageSize === "number" ? value.pageSize : current.pageSize,
          },
        });
      }
      return commands.length > 0 ? api.dispatch(commands) : invalidInput("At least one live view change is required.");
    }
    if (toolName === "grid_update_selection") {
      const commands: DataGridCommand[] = [];
      if (Array.isArray(value.rowIds)) {
        if (!snapshot.features.rowSelection) return unavailableTool(toolName);
        commands.push({ type: "set_row_selection", rowIds: value.rowIds as string[], mode: value.rowMode as never });
      }
      if (Array.isArray(value.columnIds)) {
        const error = validateColumnIds(value.columnIds);
        if (error) return invalidInput(error);
        commands.push({ type: "set_selected_columns", columnIds: value.columnIds as string[], mode: value.columnMode as never });
      }
      if ("cellSelection" in value) {
        if (!snapshot.features.cellSelection) return unavailableTool(toolName);
        const selection = value.cellSelection as { anchor?: { columnId?: unknown }; focus?: { columnId?: unknown } } | null;
        if (selection) {
          const error = validateColumnIds([
            selection.anchor?.columnId,
            selection.focus?.columnId,
          ]);
          if (error) return invalidInput(error);
        }
        commands.push({ type: "set_cell_selection", selection: value.cellSelection as never });
      }
      return commands.length > 0 ? api.dispatch(commands) : invalidInput("At least one live selection change is required.");
    }
    const presentation = value.presentation;
    if (!presentation || typeof presentation !== "object" || Array.isArray(presentation)) {
      return invalidInput("presentation is required.");
    }
    const error = validateColumnIds(Object.keys(presentation));
    if (error) return invalidInput(error);
    for (const [columnId, candidate] of Object.entries(presentation)) {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
        return invalidInput(`Presentation for ${columnId} must be an object.`);
      }
      const column = columnById.get(columnId);
      const legalKeys = column ? presentationKeysForColumn(column) : new Set<string>();
      const invalidKey = Object.keys(candidate).find((key) => !legalKeys.has(key));
      if (invalidKey) {
        return invalidInput(`${invalidKey} is unavailable for column ${columnId}.`);
      }
    }
    return api.dispatch([{
      type: "set_column_presentation",
      presentation: presentation as never,
      mode: value.mode === "replace" ? "replace" : "merge",
    }]);
  };

  return {
    /** Recomputed from the mounted grid whenever it is read. */
    get tools() {
      return getTools();
    },
    getTools,
    execute,
  };
}
