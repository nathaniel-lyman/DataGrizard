import type {
  DataGridAggregateOperation,
  DataGridAggregateQuery,
  DataGridActionPlan,
  DataGridApi,
  DataGridCommand,
  DataGridDataAccessLimits,
  DataGridQuery,
  DataGridQueryScope,
  DataGridSnapshot,
  DataGridSourceColumnSnapshot,
} from "./dataGridApi";

export type DataGridAgentOperation =
  | "get_context"
  | "query_rows"
  | "aggregate"
  | "set_column_visibility"
  | "set_sorting"
  | "set_global_filter"
  | "set_column_filters"
  | "set_pagination"
  | "set_row_selection"
  | "set_selected_columns"
  | "set_cell_selection"
  | "set_column_presentation"
  | "set_grouping"
  | "undo";

export type DataGridAgentScopePolicyContext = {
  operation: "query_rows" | "aggregate";
  scope: DataGridQueryScope;
  snapshot: DataGridSnapshot;
};

export type DataGridAgentColumnPolicyContext = {
  operation: DataGridAgentOperation;
  column: DataGridSourceColumnSnapshot;
  snapshot: DataGridSnapshot;
};

/** Missing operations are denied; omitted scope/column policies allow them. */
export type DataGridAgentPolicy = {
  operations:
    | readonly DataGridAgentOperation[]
    | ((operation: DataGridAgentOperation, snapshot: DataGridSnapshot) => boolean);
  scopes?:
    | readonly DataGridQueryScope[]
    | ((context: DataGridAgentScopePolicyContext) => boolean);
  columns?:
    | readonly string[]
    | ((context: DataGridAgentColumnPolicyContext) => boolean);
};

export type DataGridAgentPolicySource =
  | DataGridAgentPolicy
  | (() => DataGridAgentPolicy);

export type DataGridAgentToolkitOptions<TData extends object> = {
  api: DataGridApi<TData> | { current: DataGridApi<TData> | null };
  /** A callback keeps generated schemas aligned with changing user/session policy. */
  policy: DataGridAgentPolicySource;
  limits?: Partial<Pick<DataGridDataAccessLimits, "maxRowsPerQuery" | "maxCellsPerQuery">>;
};

export type DataGridAgentToolName =
  | "grid_get_context"
  | "grid_query_rows"
  | "grid_aggregate"
  | "grid_plan_actions"
  | "grid_validate_plan"
  | "grid_apply_plan"
  | "grid_undo";

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

const liveScopes = (snapshot: DataGridSnapshot): DataGridQueryScope[] => [
  ...(snapshot.dataMode === "client" ? ["all", "filtered"] as const : []),
  ...(snapshot.features.rowSelection ? ["selected_rows"] as const : []),
  "visible_page",
];

const isOperationAllowed = (
  policy: DataGridAgentPolicy,
  operation: DataGridAgentOperation,
  snapshot: DataGridSnapshot,
) => typeof policy.operations === "function"
  ? policy.operations(operation, snapshot)
  : policy.operations.includes(operation);

const isScopeAllowed = (
  policy: DataGridAgentPolicy,
  operation: "query_rows" | "aggregate",
  scope: DataGridQueryScope,
  snapshot: DataGridSnapshot,
) => policy.scopes == null || (typeof policy.scopes === "function"
  ? policy.scopes({ operation, scope, snapshot })
  : policy.scopes.includes(scope));

const availableScopes = (
  snapshot: DataGridSnapshot,
  policy: DataGridAgentPolicy,
  operation: "query_rows" | "aggregate",
) => isOperationAllowed(policy, operation, snapshot)
  ? liveScopes(snapshot).filter((scope) => isScopeAllowed(policy, operation, scope, snapshot))
  : [];

const isColumnAllowed = (
  column: DataGridSourceColumnSnapshot,
  policy: DataGridAgentPolicy,
  operation: DataGridAgentOperation,
  snapshot: DataGridSnapshot,
) => policy.columns == null || (typeof policy.columns === "function"
  ? policy.columns({ operation, column, snapshot })
  : policy.columns.includes(column.id));

const getAllowedColumns = (
  snapshot: DataGridSnapshot,
  policy: DataGridAgentPolicy,
  operation: DataGridAgentOperation,
) => snapshot.sourceColumns.filter((column) =>
  isOperationAllowed(policy, operation, snapshot) &&
  isColumnAllowed(column, policy, operation, snapshot));

const createToolDefinitions = (
  snapshot: DataGridSnapshot,
  policy: DataGridAgentPolicy,
  limits: { maxRowsPerQuery: number; maxCellsPerQuery: number },
): DataGridAgentToolDefinition[] => {
  const tools: DataGridAgentToolDefinition[] = [];

  if (isOperationAllowed(policy, "get_context", snapshot)) {
    tools.push({
      name: "grid_get_context",
      description: "Get the policy-filtered live grid contract, counts, capabilities, view state, and current selections.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
    });

  }

  const queryColumns = getAllowedColumns(snapshot, policy, "query_rows");
  const queryScopes = availableScopes(snapshot, policy, "query_rows");
  if (queryColumns.length > 0 && queryScopes.length > 0) {
      tools.push({
        name: "grid_query_rows",
        description: `Read bounded source-row values. Live data mode: ${snapshot.dataMode}. Maximum ${limits.maxRowsPerQuery} rows and ${limits.maxCellsPerQuery} cells per call.`,
        inputSchema: {
          type: "object",
          required: ["scope"],
          properties: {
            scope: { type: "string", enum: queryScopes },
            columnIds: {
              type: "array",
              items: columnIdSchema(queryColumns),
              minItems: 1,
              uniqueItems: true,
            },
            offset: { type: "integer", minimum: 0 },
            limit: { type: "integer", minimum: 0, maximum: limits.maxRowsPerQuery },
          },
          additionalProperties: false,
        },
      });

  }

  const aggregateColumns = getAllowedColumns(snapshot, policy, "aggregate");
  const aggregateScopes = availableScopes(snapshot, policy, "aggregate");
  if (aggregateColumns.length > 0 && aggregateScopes.length > 0) {
      const metricVariants: JsonSchema[] = [{
        type: "object",
        required: ["operation"],
        properties: {
          operation: { const: "count" },
          as: { type: "string" },
        },
        additionalProperties: false,
      }];
      aggregateColumns.forEach((column) => {
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
            scope: { type: "string", enum: aggregateScopes },
            groupBy: {
              type: "array",
              items: columnIdSchema(aggregateColumns),
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

  const visibilityColumns = getAllowedColumns(snapshot, policy, "set_column_visibility");
  const sortingColumns = getAllowedColumns(snapshot, policy, "set_sorting");
  const filterColumns = getAllowedColumns(snapshot, policy, "set_column_filters");
  const groupingColumns = getAllowedColumns(snapshot, policy, "set_grouping");
  const selectedColumns = getAllowedColumns(snapshot, policy, "set_selected_columns");
  const cellColumns = getAllowedColumns(snapshot, policy, "set_cell_selection");
  const presentationColumns = getAllowedColumns(snapshot, policy, "set_column_presentation");
  const hideable = visibilityColumns.filter((column) => column.canHide);
  const sortable = sortingColumns.filter((column) => column.canSort);
  const filterable = filterColumns.filter((column) => column.canFilter && column.filter);
  const groupable = groupingColumns.filter((column) => column.canGroup);
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
    if (snapshot.features.globalSearch && isOperationAllowed(policy, "set_global_filter", snapshot)) {
      properties.globalFilter = { type: "string" };
    }
    if (snapshot.features.pagination && isOperationAllowed(policy, "set_pagination", snapshot)) {
      properties.pageIndex = { type: "integer", minimum: 0 };
      properties.pageSize = { type: "integer", minimum: 1 };
    }
    if (selectedColumns.length > 0) {
      properties.columnIds = {
        type: "array",
        items: columnIdSchema(selectedColumns),
        uniqueItems: true,
      };
      properties.columnMode = { type: "string", enum: ["replace", "add", "remove"] };
    }
    if (snapshot.features.rowSelection && isOperationAllowed(policy, "set_row_selection", snapshot)) {
      properties.rowIds = { type: "array", items: { type: "string" }, uniqueItems: true };
      properties.rowMode = { type: "string", enum: ["replace", "add", "remove"] };
    }
    if (snapshot.features.cellSelection && cellColumns.length > 0) {
      const cell = {
        type: "object",
        required: ["rowId", "columnId"],
        properties: {
          rowId: { type: "string" },
          columnId: columnIdSchema(cellColumns),
        },
        additionalProperties: false,
      };
      properties.cellSelection = {
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
    if (presentationColumns.length > 0) {
      properties.presentation = {
            type: "object",
            properties: Object.fromEntries(
              presentationColumns.map((column) => [column.id, presentationSchemaForColumn(column)]),
            ),
            additionalProperties: false,
      };
      properties.presentationMode = { type: "string", enum: ["merge", "replace"] };
    }
    if (Object.keys(properties).length > 0) {
      tools.push({
        name: "grid_plan_actions",
        description: `Preview one atomic batch of policy-authorized changes to the live ${snapshot.layoutMode} grid. No mutation occurs.`,
        inputSchema: { type: "object", properties, additionalProperties: false },
      });
      tools.push({
        name: "grid_validate_plan",
        description: "Revalidate a proposed grid action plan against live policy and grid revision.",
        inputSchema: {
          type: "object",
          required: ["planId"],
          properties: { planId: { type: "string" } },
          additionalProperties: false,
        },
      });
      tools.push({
        name: "grid_apply_plan",
        description: "Atomically apply a previously validated, non-stale grid action plan.",
        inputSchema: {
          type: "object",
          required: ["planId"],
          properties: { planId: { type: "string" } },
          additionalProperties: false,
        },
      });
    }
    if (isOperationAllowed(policy, "undo", snapshot)) {
      tools.push({
        name: "grid_undo",
        description: "Undo an applied grid transaction when its resulting revision is still current.",
        inputSchema: {
          type: "object",
          required: ["transactionId"],
          properties: { transactionId: { type: "string" } },
          additionalProperties: false,
        },
      });
  }

  return tools;
};

const policyError = (operation: DataGridAgentOperation) => ({
  ok: false as const,
  error: {
    code: "policy_denied",
    message: `Toolkit policy denies operation ${operation}.`,
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
    message: `${toolName} is not available under the live grid features, policy, and data mode.`,
  },
});

const filterRecord = <T>(record: Record<string, T>, allowed: Set<string>) =>
  Object.fromEntries(Object.entries(record).filter(([id]) => allowed.has(id)));

const sanitizeSnapshot = (
  snapshot: DataGridSnapshot,
  policy: DataGridAgentPolicy,
) => {
  const sourceColumns = getAllowedColumns(snapshot, policy, "get_context");
  const allowed = new Set(sourceColumns.map((column) => column.id));
  const cellSelection = snapshot.state.cellSelection &&
    allowed.has(snapshot.state.cellSelection.anchor.columnId) &&
    allowed.has(snapshot.state.cellSelection.focus.columnId)
    ? snapshot.state.cellSelection
    : null;
  return {
    ...snapshot,
    policy: {
      allowedOperations: ([
        "get_context", "query_rows", "aggregate", "set_column_visibility", "set_sorting",
        "set_global_filter", "set_column_filters", "set_pagination", "set_row_selection",
        "set_selected_columns", "set_cell_selection", "set_column_presentation", "set_grouping",
        "undo",
      ] satisfies DataGridAgentOperation[]).filter((operation) =>
        isOperationAllowed(policy, operation, snapshot)),
      allowedScopes: {
        query_rows: availableScopes(snapshot, policy, "query_rows"),
        aggregate: availableScopes(snapshot, policy, "aggregate"),
      },
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

const commandColumnIds = (command: DataGridCommand): string[] => {
  switch (command.type) {
    case "set_column_visibility":
    case "move_columns":
    case "pin_columns":
    case "set_selected_columns":
    case "set_grouping":
      return [...command.columnIds, ...(command.type === "move_columns" && command.beforeColumnId
        ? [command.beforeColumnId]
        : [])];
    case "set_column_sizes": return Object.keys(command.sizes);
    case "set_sorting": return command.sorting.map((sort) => sort.id);
    case "set_column_filters": return command.filters.map((filter) => filter.id);
    case "set_column_presentation": return Object.keys(command.presentation);
    case "set_cell_selection": return command.selection
      ? [command.selection.anchor.columnId, command.selection.focus.columnId]
      : [];
    case "set_pivot": return [
      ...command.pivot.rows,
      ...(command.pivot.columns?.map((axis) => axis.columnId) ?? []),
    ];
    default: return [];
  }
};

export function createDataGridAgentToolkit<TData extends object>({
  api: apiOrRef,
  policy: policySource,
  limits,
}: DataGridAgentToolkitOptions<TData>) {
  const getApi = () => "current" in apiOrRef ? apiOrRef.current : apiOrRef;
  const getPolicy = () => typeof policySource === "function"
    ? policySource()
    : policySource;
  const plans = new Map<string, DataGridActionPlan>();
  const resolvedLimits = {
    maxRowsPerQuery: Math.max(1, Math.floor(limits?.maxRowsPerQuery ?? 100)),
    maxCellsPerQuery: Math.max(1, Math.floor(limits?.maxCellsPerQuery ?? 2_000)),
  };
  const getTools = () => {
    const api = getApi();
    if (!api) return [];
    return createToolDefinitions(api.getSnapshot(), getPolicy(), resolvedLimits);
  };

  const execute = (toolName: DataGridAgentToolName, input: unknown = {}) => {
    const api = getApi();
    if (!api) {
      return { ok: false as const, error: { code: "api_unavailable", message: "The grid API is not mounted." } };
    }
    const policy = getPolicy();
    const snapshot = api.getSnapshot();
    const availableToolNames = new Set(
      createToolDefinitions(snapshot, policy, resolvedLimits).map((tool) => tool.name),
    );
    if (!availableToolNames.has(toolName)) {
      if (toolName === "grid_get_context") return policyError("get_context");
      if (toolName === "grid_query_rows") return policyError("query_rows");
      if (toolName === "grid_aggregate") return policyError("aggregate");
      if (toolName === "grid_undo") return policyError("undo");
      return unavailableTool(toolName);
    }
    const value = input && typeof input === "object" ? input as Record<string, unknown> : {};
    const validateColumnIds = (
      ids: unknown,
      operation: DataGridAgentOperation,
      predicate?: (column: DataGridSourceColumnSnapshot) => boolean,
    ) => {
      if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
        return "Column ids must be an array of strings.";
      }
      const columnById = new Map(
        getAllowedColumns(snapshot, policy, operation).map((column) => [column.id, column]),
      );
      const invalid = ids.find((id) => {
        const column = columnById.get(id as string);
        return !column || (predicate ? !predicate(column) : false);
      });
      return invalid == null ? null : `Column is unavailable for this operation: ${String(invalid)}.`;
    };

    if (toolName === "grid_get_context") {
      return sanitizeSnapshot(snapshot, policy);
    }
    if (toolName === "grid_query_rows") {
      const columns = getAllowedColumns(snapshot, policy, "query_rows");
      const scopes = availableScopes(snapshot, policy, "query_rows");
      const query = value as DataGridQuery;
      if (!scopes.includes(query.scope)) return invalidInput("A scope available in the live data mode is required.");
      const columnIds = query.columnIds ?? defaultQueryColumns(snapshot, columns);
      const columnError = validateColumnIds(columnIds, "query_rows");
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
      const columns = getAllowedColumns(snapshot, policy, "aggregate");
      const columnById = new Map(columns.map((column) => [column.id, column]));
      if (
        !availableScopes(snapshot, policy, "aggregate").includes(value.scope as DataGridQueryScope) ||
        !Array.isArray(value.metrics) ||
        value.metrics.length === 0
      ) {
        return invalidInput("A scope available in the live data mode and at least one metric are required.");
      }
      const groupError = value.groupBy == null ? null : validateColumnIds(value.groupBy, "aggregate");
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
    if (toolName === "grid_validate_plan" || toolName === "grid_apply_plan") {
      if (typeof value.planId !== "string") return invalidInput("planId is required.");
      const candidate = plans.get(value.planId);
      if (!candidate) return invalidInput(`Unknown plan: ${value.planId}.`);
      const denied = candidate.commands.find((command) => {
        const operation = command.type as DataGridAgentOperation;
        if (!isOperationAllowed(policy, operation, snapshot)) return true;
        return commandColumnIds(command).some((columnId) => {
          const column = snapshot.sourceColumns.find((item) => item.id === columnId);
          return column != null && !isColumnAllowed(column, policy, operation, snapshot);
        });
      });
      if (denied) return policyError(denied.type as DataGridAgentOperation);
      const validation = api.validatePlan(candidate);
      if (toolName === "grid_validate_plan" || !validation.ok) return validation;
      const applied = api.applyPlan(candidate);
      if (applied.ok) plans.delete(candidate.planId);
      return applied;
    }
    if (toolName === "grid_undo") {
      if (typeof value.transactionId !== "string") return invalidInput("transactionId is required.");
      return api.undo(value.transactionId);
    }

    const commands: DataGridCommand[] = [];
      if (Array.isArray(value.visibleColumnIds)) {
        const hideable = getAllowedColumns(snapshot, policy, "set_column_visibility")
          .filter((column) => column.canHide);
        const error = validateColumnIds(
          value.visibleColumnIds,
          "set_column_visibility",
          (column) => column.canHide,
        );
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
        const error = validateColumnIds(ids, "set_sorting", (column) => column.canSort);
        if (error) return invalidInput(error);
        commands.push({ type: "set_sorting", sorting: value.sorting as never });
      }
      if (Array.isArray(value.filters)) {
        for (const candidate of value.filters) {
          if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
            return invalidInput("Each filter entry must be an object.");
          }
          const filter = candidate as { id?: unknown; value?: unknown };
          const error = validateColumnIds(
            [filter.id],
            "set_column_filters",
            (column) => column.canFilter,
          );
          if (error) return invalidInput(error);
          const column = getAllowedColumns(snapshot, policy, "set_column_filters")
            .find((item) => item.id === filter.id);
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
        const error = validateColumnIds(value.grouping, "set_grouping", (column) => column.canGroup);
        if (error) return invalidInput(error);
        commands.push({ type: "set_grouping", columnIds: value.grouping as string[] });
      }
      if (typeof value.globalFilter === "string") {
        if (!isOperationAllowed(policy, "set_global_filter", snapshot)) {
          return policyError("set_global_filter");
        }
        commands.push({ type: "set_global_filter", value: value.globalFilter });
      }
      if (value.pageIndex != null || value.pageSize != null) {
        if (!isOperationAllowed(policy, "set_pagination", snapshot)) {
          return policyError("set_pagination");
        }
        const current = snapshot.state.pagination;
        commands.push({
          type: "set_pagination",
          pagination: {
            pageIndex: typeof value.pageIndex === "number" ? value.pageIndex : current.pageIndex,
            pageSize: typeof value.pageSize === "number" ? value.pageSize : current.pageSize,
          },
        });
      }
      if (Array.isArray(value.rowIds)) {
        if (!isOperationAllowed(policy, "set_row_selection", snapshot)) {
          return policyError("set_row_selection");
        }
        commands.push({ type: "set_row_selection", rowIds: value.rowIds as string[], mode: value.rowMode as never });
      }
      if (Array.isArray(value.columnIds)) {
        const error = validateColumnIds(value.columnIds, "set_selected_columns");
        if (error) return invalidInput(error);
        commands.push({ type: "set_selected_columns", columnIds: value.columnIds as string[], mode: value.columnMode as never });
      }
      if ("cellSelection" in value) {
        if (!isOperationAllowed(policy, "set_cell_selection", snapshot)) {
          return policyError("set_cell_selection");
        }
        const selection = value.cellSelection as { anchor?: { columnId?: unknown }; focus?: { columnId?: unknown } } | null;
        if (selection) {
          const error = validateColumnIds([
            selection.anchor?.columnId,
            selection.focus?.columnId,
          ], "set_cell_selection");
          if (error) return invalidInput(error);
        }
        commands.push({ type: "set_cell_selection", selection: value.cellSelection as never });
      }
    if (value.presentation != null) {
      const presentation = value.presentation;
      if (!presentation || typeof presentation !== "object" || Array.isArray(presentation)) {
        return invalidInput("presentation must be an object.");
      }
      const error = validateColumnIds(Object.keys(presentation), "set_column_presentation");
      if (error) return invalidInput(error);
      const columnById = new Map(
        getAllowedColumns(snapshot, policy, "set_column_presentation")
          .map((column) => [column.id, column]),
      );
      for (const [columnId, candidate] of Object.entries(presentation)) {
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
          return invalidInput(`Presentation for ${columnId} must be an object.`);
        }
        const column = columnById.get(columnId);
        const legalKeys = column ? presentationKeysForColumn(column) : new Set<string>();
        const invalidKey = Object.keys(candidate).find((key) => !legalKeys.has(key));
        if (invalidKey) return invalidInput(`${invalidKey} is unavailable for column ${columnId}.`);
      }
      commands.push({
        type: "set_column_presentation",
        presentation: presentation as never,
        mode: value.presentationMode === "replace" ? "replace" : "merge",
      });
    }
    if (commands.length === 0) return invalidInput("At least one live grid action is required.");
    const planned = api.plan(commands);
    if (planned.ok) plans.set(planned.plan.planId, planned.plan);
    return planned;
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
