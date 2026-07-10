import type {
  DataGridAggregateGroup,
  DataGridAggregateQuery,
  DataGridAnalysisFilterSnapshot,
  DataGridAnalysisWarning,
  DataGridDataAccessLimits,
  DataGridQuery,
  DataGridQueryRow,
  DataGridQueryScope,
  DataGridSerializableValue,
  DataGridSourceColumnSnapshot,
} from "./dataGridApi";
import type { DataGridAnalysisQuerySpec } from "./serverQuery";

export type DataGridAnalysisExecutionOptions = {
  signal?: AbortSignal;
};

export type DataGridAnalysisExecution = {
  mode: "client" | "server";
  adapterId?: string;
  sourceRevision?: string;
  requestFingerprint?: string;
  effectiveOrdering?: string;
};

export type DataGridAnalysisCapabilities = {
  queryScopes: DataGridQueryScope[];
  aggregateScopes: DataGridQueryScope[];
  remote: boolean;
};

export type DataGridServerAnalysisScope = Extract<
  DataGridQueryScope,
  "all" | "filtered"
>;

export type DataGridServerAnalysisCapabilities = {
  queryScopes: readonly DataGridServerAnalysisScope[];
  aggregateScopes: readonly DataGridServerAnalysisScope[];
};

export type DataGridAnalysisContext = {
  queryId: string;
  gridRevision: number;
  scope: DataGridServerAnalysisScope;
  columns: DataGridSourceColumnSnapshot[];
  filters: DataGridAnalysisFilterSnapshot;
  querySpec: DataGridAnalysisQuerySpec;
  limits: DataGridDataAccessLimits;
};

export type DataGridServerQueryRequest = {
  operation: "query";
  input: Required<DataGridQuery> & { scope: DataGridServerAnalysisScope };
  context: DataGridAnalysisContext;
  signal: AbortSignal;
};

export type DataGridServerAggregateRequest = {
  operation: "aggregate";
  input: DataGridAggregateQuery & {
    scope: DataGridServerAnalysisScope;
    groupBy: string[];
  };
  context: DataGridAnalysisContext;
  signal: AbortSignal;
};

export type DataGridServerAnalysisRequest =
  | DataGridServerQueryRequest
  | DataGridServerAggregateRequest;

export type DataGridServerAnalysisProvenance = {
  /** Version/etag/snapshot identifier of the remote dataset, when available. */
  sourceRevision?: string;
  /** Backend query/job/request identifier useful for audit correlation. */
  requestFingerprint?: string;
  /** Stable ordering used for offset queries when it is not represented by the public spec. */
  effectiveOrdering?: string;
};

export type DataGridServerQueryPayload = {
  operation: "query";
  rows: DataGridQueryRow[];
  rowCount: number;
  returnedRowCount: number;
  offset: number;
  truncated: boolean;
  warnings?: DataGridAnalysisWarning[];
  provenance?: DataGridServerAnalysisProvenance;
};

export type DataGridServerAggregatePayload = {
  operation: "aggregate";
  rowCount: number;
  metrics: Record<string, DataGridSerializableValue>;
  groups: DataGridAggregateGroup[];
  truncated: boolean;
  /** Optional bounded evidence sample; never the complete remote id set. */
  supportingRowIds?: string[];
  warnings?: DataGridAnalysisWarning[];
  provenance?: DataGridServerAnalysisProvenance;
};

export type DataGridServerAnalysisPayload =
  | DataGridServerQueryPayload
  | DataGridServerAggregatePayload;

export type DataGridServerAnalysisAdapter = {
  /** Stable consumer-defined identifier included in every server receipt. */
  id: string;
  capabilities: DataGridServerAnalysisCapabilities;
  execute: (
    request: DataGridServerAnalysisRequest,
  ) => Promise<DataGridServerAnalysisPayload>;
};
