# Server analysis contract and complete-dataset agent scope

**Status:** Proposed implementation spec (2026-07-10)  
**Component:** `src/components/DataGrid/` reusable `DataGrid` and agent toolkit  
**Scope:** Provider-neutral, asynchronous query and aggregation over complete server datasets  
**Depends on:** The agent API/toolkit work in `b7cf51c`, `e8361d9`, `3a37770`, and `cb8177f`

## Summary

DataGrizard's agent surface can inspect grid state, read bounded rows, compute
aggregates, explain results with replayable receipts, and apply view changes as
revision-safe transactions. In client mode, `all` and `filtered` analysis can use
the complete in-memory dataset. In server mode, the grid only holds one loaded
page, so those scopes currently and correctly return `scope_unavailable` and are
omitted from generated agent tools.

This specification adds an opt-in, provider-neutral server analysis adapter that
can execute the same normalized query and aggregation envelopes against the
complete remote dataset. The adapter supplies result data and remote-source
provenance; DataGrizard continues to own input validation, capability routing,
limits, response validation, warnings, and the canonical result receipt.

The existing synchronous `query()` and `aggregate()` methods remain local-only
and preserve their current honest `scope_unavailable` behavior in server mode.
New asynchronous methods route complete-dataset scopes through the adapter. The
agent toolkit becomes consistently asynchronous and uses those methods, allowing
the same `grid_query_rows` and `grid_aggregate` tools to expose complete server
scope only when the mounted adapter actually supports it.

## Goals

- Preserve the current truthful behavior when no server analysis adapter exists.
- Execute `all` and `filtered` queries and aggregates over a complete remote
  dataset without treating the loaded page as the dataset.
- Keep the package independent of SQL dialects, ORMs, transports, warehouses,
  model providers, and application domains.
- Give client and server analysis the same public success/error result unions and
  the same receipt shape.
- Record execution mode, applied limits, bounded supporting evidence, remote
  source identity, timing, normalized replay payload, and view provenance.
- Generate tool schemas from real mounted capabilities rather than inferring
  capability from `dataMode` alone.
- Enforce limits and validate column/operation legality before dispatch and again
  after an adapter response.
- Capture immutable request context so an in-flight view change cannot corrupt
  the eventual receipt.
- Preserve the existing client-mode synchronous API for direct consumers.

## Non-goals

- No SQL, REST, GraphQL, BigQuery, Postgres, or ORM implementation inside the
  reusable component package.
- No remote mutation, cell editing, row creation/deletion, or server transaction
  contract. The existing agent transaction lifecycle changes grid view state.
- No complete-dataset `selected_rows` scope. Selection remains truthful to loaded
  rows until a separate cross-page selection/id-set contract exists.
- No server-side pivot materialization, remote grouping UI, infinite scrolling,
  or SSRM-style row blocks.
- No server-generated agent schemas or provider SDK integration.
- No attempt to enumerate every supporting row ID for a large aggregate.
- No silent fallback from a failed remote analysis to analysis of the loaded page.

## Existing behavior that must remain true

1. `DataGridApi.query()` and `DataGridApi.aggregate()` return synchronous result
   unions.
2. In server mode, synchronous `all` and `filtered` calls return
   `scope_unavailable`.
3. `visible_page` and loaded `selected_rows` remain local, bounded, and truthful.
4. The agent toolkit applies operation, scope, and column policy before calling
   the API and repeats validation at execution time.
5. Query and aggregate results contain only plain serializable values.
6. Every successful result includes a detached receipt and normalized replay
   payload.
7. Mutation tools continue to use `plan -> validate -> apply -> undo`; server
   analysis does not alter that lifecycle.

## Core design decisions

### 1. Separate display loading from analysis

`dataSource` remains the page-loading adapter. It owns the common server-table
flow of sorting, filtering, searching, and pagination and returns rendered rows
plus `rowCount`.

A new `serverAnalysis` prop owns complete-dataset analysis. Keeping the contracts
separate avoids overloading a page-fetch callback with aggregation semantics and
allows consumers to use different endpoints, permissions, caches, or backends for
display and analysis.

```tsx
<DataGrid
  columns={columns}
  dataSource={productsDataSource}
  serverAnalysis={productsAnalysisAdapter}
/>
```

`serverAnalysis` is inert in client mode. Client analysis continues to use the
in-memory executor so a consumer does not accidentally send local rows or filter
state to a remote service merely because an adapter was provided.

### 2. Keep synchronous direct reads; add explicit async reads

Do not change `query()` or `aggregate()` to a `Result | Promise<Result>` union.
Maybe-Promise APIs force every consumer to branch at runtime and make provider
integration easy to misuse.

Extend `DataGridApi` with consistently asynchronous methods:

```ts
export type DataGridAnalysisExecutionOptions = {
  signal?: AbortSignal;
};

export type DataGridApi<TData extends object> = {
  getSnapshot: () => DataGridSnapshot;

  // Existing local, synchronous methods. Unchanged.
  query: (input: DataGridQuery) => DataGridQueryResult;
  aggregate: (input: DataGridAggregateQuery) => DataGridAggregateResult;

  // New canonical methods for integrations that may cross a remote boundary.
  queryAsync: (
    input: DataGridQuery,
    options?: DataGridAnalysisExecutionOptions,
  ) => Promise<DataGridQueryResult>;
  aggregateAsync: (
    input: DataGridAggregateQuery,
    options?: DataGridAnalysisExecutionOptions,
  ) => Promise<DataGridAggregateResult>;

  // Existing action methods remain synchronous.
  plan: (commands: DataGridCommand[]) => DataGridPlanResult;
  validatePlan: (plan: DataGridActionPlan) => DataGridPlanValidationResult;
  applyPlan: (plan: DataGridActionPlan) => DataGridApplyPlanResult;
  undo: (transactionId: string) => DataGridUndoResult;
  dispatch: (commands: DataGridCommand[]) => DataGridCommandResult;
};
```

Routing rules:

| Data mode | Scope | `query()` / `aggregate()` | Async methods |
|---|---|---|---|
| client | any available local scope | local executor | same local executor, Promise-wrapped |
| server | `visible_page` | local executor | same local executor, Promise-wrapped |
| server | loaded `selected_rows` | local executor | same local executor, Promise-wrapped |
| server | `all` / `filtered`, no capable adapter | `scope_unavailable` | `scope_unavailable` |
| server | `all` / `filtered`, capable adapter | `scope_unavailable` | remote adapter |

The synchronous error message should continue to explain that complete scope is
unavailable through the local API. It may additionally point consumers to the
async API when an adapter is mounted, but its error code remains unchanged.

### 3. One normalized request envelope

The server adapter receives a discriminated, JSON-safe request plus a runtime
`AbortSignal`. It never receives `TData`, TanStack table instances, React state
setters, accessors, formatters, or JavaScript predicates.

```ts
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

export type DataGridServerAnalysisRequest =
  | {
      operation: "query";
      input: Required<DataGridQuery> & { scope: DataGridServerAnalysisScope };
      context: DataGridAnalysisContext;
      signal: AbortSignal;
    }
  | {
      operation: "aggregate";
      input: DataGridAggregateQuery & {
        scope: DataGridServerAnalysisScope;
        groupBy: string[];
      };
      context: DataGridAnalysisContext;
      signal: AbortSignal;
    };
```

`context` is captured and detached at invocation time. Receipt construction must
use this captured context, not whatever state happens to be current after the
Promise resolves.

### 4. Extend the existing backend-neutral query specification

`serverQuery.ts` already translates live grid filter/search/sort state into a
dialect-neutral specification with whitelisted identifiers. Extend that concept
for analysis rather than creating a SQL-shaped contract.

```ts
export type DataGridAnalysisQuerySpec = {
  filters: QueryFilterClause[];
  search: QuerySearchClause | null;
  orderBy: QuerySortClause[];
};
```

Scope semantics are fixed:

- `all`: `filters=[]`, `search=null`, and no view-derived sorting.
- `filtered`: current active column filters and global search, normalized through
  the same resolved filter metadata used by the grid; no view-derived sorting.
- `visible_page`: stays local and records current view sorting/grouping as today.
- `selected_rows`: stays local and refers only to loaded selected row IDs.

`all` and `filtered` intentionally preserve the current client semantics of not
inheriting view sorting. Because offset reads require stable replay, every remote
adapter must apply a deterministic backend order, normally its primary row key,
when `orderBy` is empty. The adapter records the effective ordering description in
remote provenance when it is not represented by a public grid column.

The analysis input supplies projection, pagination, metrics, and `groupBy`; the
query specification supplies the normalized dataset predicate. Backend adapters
render both into SQL, ORM calls, or an application API.

### 5. Provider-neutral adapter contract

```ts
export type DataGridServerAnalysisProvenance = {
  /** Version/etag/snapshot identifier of the remote dataset, when available. */
  sourceRevision?: string;
  /** Backend query/job/request identifier useful for audit correlation. */
  requestFingerprint?: string;
  /** Human-readable stable ordering used for offset queries when no orderBy exists. */
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
```

The adapter does not return `DataGridQueryResult` or
`DataGridAggregateResult`. It cannot author a successful canonical receipt or
bypass package-level response validation. DataGrizard joins the adapter payload
with requested column metadata and the captured context to build the existing
public result union.

The adapter may enforce stricter limits than the grid. If it truncates within the
requested envelope, it returns an appropriate warning and `truncated=true`. It
must never return more data than requested.

### 6. Canonical result and receipt parity

`queryAsync()` resolves `DataGridQueryResult`; `aggregateAsync()` resolves
`DataGridAggregateResult`. Client and server callers do not branch on the result
shape.

Extend `DataGridAnalysisReceipt` for both execution modes:

```ts
export type DataGridAnalysisExecution = {
  mode: "client" | "server";
  adapterId?: string;
  sourceRevision?: string;
  requestFingerprint?: string;
  effectiveOrdering?: string;
};

export type DataGridAnalysisReceipt = {
  // Existing fields retained.
  queryId: string;
  gridRevision: number;
  scope: DataGridQueryScope;
  columns: DataGridAnalysisColumn[];
  filters: DataGridAnalysisFilterSnapshot;
  sorting: SortingState;
  grouping: { view: string[]; aggregateBy: string[] };
  supportingRowIds: string[];
  supportingGroupKeys: Array<Record<string, DataGridSerializableValue>>;
  warnings: DataGridAnalysisWarning[];
  timing: DataGridAnalysisTiming;
  replay: DataGridQueryReplay | DataGridAggregateReplay;

  // New parity/provenance fields.
  completedGridRevision: number;
  execution: DataGridAnalysisExecution;
  limits: DataGridDataAccessLimits;
  supportingRowCount: number;
  supportingRowIdsTruncated: boolean;
};
```

Semantics:

- `gridRevision` is the revision captured when execution begins.
- `completedGridRevision` is the live revision when execution completes.
- A revision mismatch does not invalidate a read whose complete predicate was
  captured; it adds a `view_changed_during_execution` warning so an assistant can
  avoid presenting the result as the current view without qualification.
- Query `supportingRowIds` contains the returned row IDs and remains bounded by
  query row/cell limits.
- Aggregate `supportingRowIds` is a bounded evidence sample. It is never required
  to contain the entire analyzed dataset.
- `supportingRowCount` records the complete number of input rows represented by
  the result.
- `supportingRowIdsTruncated` is true whenever the IDs are not exhaustive.
- `limits` records the effective grid limits used for preflight and response
  validation, even when no warning was needed.
- Client receipts set `execution.mode="client"` and omit server-only fields.
- Server receipts set `execution.mode="server"` and include `adapterId`.

Add warning codes:

```ts
type DataGridAnalysisWarningCode =
  | ExistingWarningCodes
  | "supporting_rows_truncated"
  | "view_changed_during_execution"
  | "provider_limit_applied";
```

### 7. Limits are output bounds, not scan bounds

`DataGridDataAccessLimits` remains the single package-level limits contract:

- `maxRowsPerQuery`: maximum returned query rows and maximum aggregate evidence
  row IDs.
- `maxCellsPerQuery`: maximum returned query cells and bounded aggregate output
  cardinality.
- `maxGroupsPerAggregate`: maximum returned aggregate groups.
- `maxTopValues`: maximum entries returned by each `top_values` metric.

An aggregate may scan more remote rows than `maxRowsPerQuery`; otherwise a
complete-dataset sum or count would be impossible. The limits constrain returned
data and evidence cardinality, while the consumer's backend remains responsible
for workload quotas, timeouts, and cost controls.

Validation happens twice:

1. **Preflight:** normalize input; validate source columns, type-legal operations,
   unique metric aliases, offsets, requested rows/cells/groups/top-values, live
   capability, and agent policy.
2. **Postflight:** validate the payload discriminator, scope correlation, requested
   columns and aliases, serializability, counts, duplicate row IDs, offsets,
   rows/cells/groups/top-values, warnings, and bounded evidence.

An adapter response that exceeds the envelope is rejected; DataGrizard does not
silently slice an invalid payload into compliance because that can make counts,
truncation flags, and provenance disagree.

### 8. Error model

Preserve existing errors and add neutral execution errors:

```ts
export type DataGridDataErrorCode =
  | "invalid_column"
  | "invalid_query"
  | "limit_exceeded"
  | "scope_unavailable"
  | "analysis_aborted"
  | "analysis_failed"
  | "invalid_analysis_response";
```

- No adapter or unsupported operation/scope: `scope_unavailable`.
- Aborted before or during execution: `analysis_aborted`.
- Adapter rejection/transport/backend failure: `analysis_failed`.
- Malformed, mismatched, non-serializable, or over-limit response:
  `invalid_analysis_response`.

Errors retain the requested `scope` and never fall back to loaded-page analysis.
Do not expose stack traces, SQL, credentials, or raw backend errors in the public
result. Consumer logging and observability belong inside the adapter.

### 9. Capability-driven snapshots and tools

Add analysis capabilities to `DataGridSnapshot`:

```ts
export type DataGridAnalysisCapabilities = {
  queryScopes: DataGridQueryScope[];
  aggregateScopes: DataGridQueryScope[];
  remote: boolean;
};

export type DataGridSnapshot = {
  // existing fields
  analysis: DataGridAnalysisCapabilities;
};
```

Capability derivation:

- Client mode: `all`, `filtered`, conditionally `selected_rows`, and
  `visible_page` for both operations.
- Server mode without adapter: conditionally `selected_rows` and
  `visible_page`.
- Server mode with adapter: local scopes plus only the remote scopes explicitly
  advertised for the relevant operation.

Replace the toolkit's `liveScopes(snapshot)` heuristic with
`snapshot.analysis.queryScopes` and `snapshot.analysis.aggregateScopes`. Policy
filters those live capabilities; it does not create capabilities the grid lacks.

`grid_get_context` includes the policy-filtered analysis capability block. Tool
schemas therefore add or remove `all`/`filtered` automatically when the adapter,
data mode, features, or policy changes.

### 10. Make agent execution consistently asynchronous

Change `createDataGridAgentToolkit().execute()` to always return a Promise. It
calls `queryAsync()` and `aggregateAsync()` for reads and Promise-wraps existing
synchronous context/action operations.

```ts
const output = await toolkit.execute(toolCall.name, toolCall.arguments);
```

Do not expose a Maybe-Promise executor. Update the reference workflow, README,
tests, and package declarations in the same change. This agent API was introduced
in the immediately preceding pre-1.0 commits, so this is the correct point to
establish the durable asynchronous contract.

Policy is re-read immediately before execution. For a remote read, the toolkit
validates policy before calling the async API, and the API validates the detached
request again before adapter dispatch. The remote endpoint must independently
authorize the authenticated user, dataset, columns, and operation; browser-side
JSON schemas and policy callbacks are not a security boundary.

## Internal architecture

Move analysis mechanics out of the already-large `useDataGridApi.ts` into pure,
testable modules.

```text
DataGrid / useDataGridApi
  -> capture detached execution context
  -> normalize + validate request
  -> choose executor by data mode, scope, and capability
       -> client executor (materialized scope rows)
       -> server adapter (complete remote dataset)
  -> validate executor payload
  -> build canonical receipt
  -> return existing public result union
```

Recommended module seams:

- `dataGridAnalysis.ts`: retain serialization and metric primitives.
- `dataGridAnalysisContract.ts` (new): public/internal request, adapter, payload,
  execution, and capability types.
- `dataGridAnalysisValidation.ts` (new): pure normalization, preflight checks,
  response validation, limits, and warning helpers.
- `dataGridClientAnalysis.ts` (new): local query/aggregate executor over
  `DataGridAnalysisRow[]`.
- `useDataGridApi.ts`: capture context, select executor, coordinate sync/async
  methods, and expose the imperative API.
- `serverQuery.ts`: construct the normalized predicate/search query spec shared
  by page loading and analysis.

The local executor and server adapter return equivalent internal payloads. A
single result/receipt finalizer converts either payload into the public union.

## Public API additions

Export through `src/components/DataGrid/index.ts`:

- `DataGridAnalysisExecutionOptions`
- `DataGridAnalysisExecution`
- `DataGridAnalysisCapabilities`
- `DataGridAnalysisContext`
- `DataGridAnalysisQuerySpec`
- `DataGridServerAnalysisScope`
- `DataGridServerAnalysisCapabilities`
- `DataGridServerAnalysisProvenance`
- `DataGridServerAnalysisRequest`
- `DataGridServerQueryPayload`
- `DataGridServerAggregatePayload`
- `DataGridServerAnalysisPayload`
- `DataGridServerAnalysisAdapter`

Add to `DataGridProps<TData>`:

```ts
/** Complete-dataset query/aggregate adapter for server mode. */
serverAnalysis?: DataGridServerAnalysisAdapter;
```

The adapter is intentionally not generic over `TData`; its wire boundary uses
stable column IDs and serializable values.

## Data flow examples

### Server `filtered` aggregate

1. Agent reads the live tools and sees that `grid_aggregate` permits `filtered`.
2. Agent calls `grid_aggregate` with metrics and optional `groupBy`.
3. Toolkit re-checks operation, scope, columns, types, aliases, and limits.
4. `aggregateAsync()` captures revision, active filters/search, columns, limits,
   query ID, and start timing.
5. DataGrid normalizes the filter/search predicate through `serverQuery.ts`.
6. Adapter translates the request into its backend query and executes it with the
   provided `AbortSignal`.
7. DataGrid validates the returned metrics/groups/counts/evidence.
8. DataGrid builds the canonical server receipt from captured context and adapter
   provenance.
9. Toolkit returns the same `DataGridAggregateResult` shape used in client mode.

### Server mode without an adapter

1. Snapshot capabilities omit remote `all` and `filtered`.
2. Generated tool schemas omit those scopes.
3. A stale or direct attempt still reaches API validation.
4. API returns `scope_unavailable`.
5. No loaded-page fallback occurs.

## File-level implementation plan

### Phase 1: Contract and pure validation

**Modify:**

- `src/components/DataGrid/dataGridApi.ts`
- `src/components/DataGrid/dataGridTypes.ts`
- `src/components/DataGrid/dataGridAnalysis.ts`
- `src/components/DataGrid/serverQuery.ts`
- `src/components/DataGrid/index.ts`

**Create:**

- `src/components/DataGrid/dataGridAnalysisContract.ts`
- `src/components/DataGrid/dataGridAnalysisValidation.ts`
- `src/components/DataGrid/dataGridAnalysisValidation.test.ts`

**Work:**

- Add adapter/request/payload/capability/execution types.
- Extend receipt, warning, error, snapshot, API, and prop types.
- Extract normalization and validation from `useDataGridApi` without changing
  current synchronous behavior.
- Add analysis query-spec construction using the resolved filter metadata.
- Unit-test exact normalization and limit semantics.

### Phase 2: Shared local/remote execution

**Modify:**

- `src/components/DataGrid/useDataGridApi.ts`
- `src/components/DataGrid/DataGrid.tsx`
- `src/components/DataGrid/DataGrid.agent.test.tsx`

**Create:**

- `src/components/DataGrid/dataGridClientAnalysis.ts`
- `src/components/DataGrid/DataGrid.serverAnalysis.test.tsx`

**Work:**

- Move local query/aggregate calculations into the client executor.
- Capture immutable execution context before sync or async work begins.
- Add `queryAsync()` and `aggregateAsync()` routing.
- Preserve synchronous `scope_unavailable` behavior.
- Validate server payloads and finalize both modes through one receipt builder.
- Bound aggregate supporting IDs and add parity fields to client receipts.

### Phase 3: Capability-driven agent toolkit

**Modify:**

- `src/components/DataGrid/dataGridAgentToolkit.ts`
- `src/components/DataGrid/DataGrid.agent.test.tsx`
- `src/demo/retailAssistantAdapter.ts`
- `src/demo/AssistantDemo.test.tsx`

**Work:**

- Derive schema scopes from snapshot analysis capabilities.
- Make `execute()` consistently asynchronous.
- Route read tools through the async API.
- Promise-wrap synchronous context and action tools.
- Re-check policy immediately before async dispatch.
- Update the reference assistant workflow to await every tool execution.

### Phase 4: Reference adapter, documentation, and package proof

**Modify:**

- `README.md`
- `src/App.tsx` only if a visible server-analysis demo is useful
- package smoke fixtures if the exported API changes require them

**Create:**

- `src/data/fakeServerAnalysis.ts`
- `src/data/fakeServerAnalysis.test.ts`

**Work:**

- Implement a domain-layer fake remote adapter against the complete retail
  fixture, reusing shared filter and aggregation semantics.
- Document a fetch-backed adapter that forwards only the JSON-safe request body
  and runtime abort signal.
- Demonstrate that `dataSource` and `serverAnalysis` may use separate endpoints.
- Verify ESM, CJS, declarations, CSS isolation, publint, and ATTW.

## Test matrix

### Contract and normalization

- `all` produces no filters/search/sorting.
- `filtered` produces the same typed operators and values as live grid filtering.
- Unknown columns and duplicate IDs/aliases fail before adapter dispatch.
- Type-illegal aggregates fail before adapter dispatch.
- Query rows/cells, groups, and top-values use the configured limits.
- Aggregate scan row count is not incorrectly capped by `maxRowsPerQuery`.

### Capability and honest degradation

- Server mode without an adapter omits `all`/`filtered` from tool schemas.
- Direct sync and async complete-scope calls without an adapter return
  `scope_unavailable`.
- Adapter query and aggregate capabilities are independent.
- Policy can remove an adapter-supported scope but cannot add an unsupported one.
- Removing/changing the adapter changes live tools on the next read.

### Client/server parity

- The same fixture and normalized query produce structurally identical query
  results in client and fake-server execution.
- The same fixture and normalized metrics produce structurally identical
  aggregate results, including grouped and `top_values` cases.
- Both receipts contain execution, limits, support counts, warnings, timing, and
  replay payloads.
- Client execution is marked `client`; remote execution includes adapter ID and
  optional source provenance.

Numeric parity should use appropriate floating-point tolerance for averages.
Ordering assertions must use a deterministic adapter order.

### Async correctness

- Adapter receives the caller's `AbortSignal`.
- Pre-aborted and in-flight-aborted work returns `analysis_aborted`.
- Adapter rejection returns `analysis_failed` without leaking raw backend detail.
- View changes during execution preserve the start revision/filter context and add
  `view_changed_during_execution`.
- Concurrent requests receive distinct query IDs and cannot mix receipts.

### Response validation

- Wrong operation discriminator is rejected.
- Over-limit rows, cells, groups, top values, or evidence IDs are rejected.
- Unknown/missing metric aliases and unexpected columns are rejected.
- Negative/non-finite counts and inconsistent `returnedRowCount` are rejected.
- Duplicate row IDs and non-serializable values are rejected.
- Adapter warnings outside the public warning enum are rejected.
- Invalid payloads never become successful public results.

### Regression and package boundary

- Existing local query/aggregate tests continue to pass.
- Existing transaction tests remain unchanged apart from awaiting toolkit calls.
- Existing server page-loading behavior remains unchanged.
- Existing no-adapter `scope_unavailable` test remains explicit.
- Declaration consumers can implement a typed adapter from both ESM and CJS.

## Acceptance criteria

- [ ] `DataGridApi` exposes local sync and canonical async analysis methods.
- [ ] `DataGridProps` accepts an optional provider-neutral `serverAnalysis` adapter.
- [ ] No adapter preserves the current `scope_unavailable` behavior and tool
      schema omission.
- [ ] A capable adapter enables complete `all`/`filtered` scope only for the
      operations it advertises.
- [ ] Client and server success results use the same public result unions.
- [ ] Client and server receipts use the same shape and record execution mode,
      limits, bounded evidence, timing, replay, and revision provenance.
- [ ] Aggregate evidence IDs are bounded; complete remote ID enumeration is not
      required.
- [ ] Request context is detached at start and cannot be rewritten by later view
      changes.
- [ ] Inputs and adapter responses are both validated against capabilities,
      columns, types, and limits.
- [ ] Agent toolkit execution is consistently asynchronous and policy-safe.
- [ ] Existing page `dataSource`, local analysis, and transaction behavior do not
      regress.
- [ ] Focused analysis tests, full Vitest, application build, package smoke,
      publint, ATTW, and `git diff --check` pass.

## Risks and mitigations

- **Breaking toolkit execution timing:** changing `execute()` to Promise-returning
  affects the newly added reference workflow and any early adopters. Do it now,
  update every repository call site, and document the migration as adding
  `await`.
- **Client/backend filter drift:** build the adapter envelope from the same
  resolved filter metadata and `serverQuery` normalization used by DataGrid; test
  every filter type against a shared fixture.
- **Misleading provenance after view changes:** capture request state at start and
  record both start/completion revisions plus a warning.
- **Remote cost or runaway scans:** return limits do not control scan cost. The
  adapter/backend must enforce authentication, quotas, timeouts, and warehouse
  cost controls.
- **Trusting frontend policy:** repeat authorization at the remote endpoint.
  Toolkit schemas are discoverability and UX, not backend authorization.
- **Adapter lies about counts or truncation:** perform structural and envelope
  validation, reject impossible combinations, and keep receipt construction in
  DataGrizard.
- **Receipt growth:** bound evidence arrays and group keys through existing limits;
  use remote job/source identifiers for full audit correlation.

## Verification commands

Run serially because package commands write `dist/`:

```bash
npx vitest run src/components/DataGrid/dataGridAnalysisValidation.test.ts
npx vitest run src/components/DataGrid/DataGrid.serverAnalysis.test.tsx
npx vitest run src/components/DataGrid/DataGrid.agent.test.tsx src/demo/AssistantDemo.test.tsx
npm run build
npm test
npm run test:package
git diff --check
git status --short
```

Completion requires a clean `git diff --check`, no unintended generated files,
and an explicit review of all new public exports in the packed declarations.
