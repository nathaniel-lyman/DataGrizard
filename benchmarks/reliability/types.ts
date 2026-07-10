import type {
  DataGridAgentOperation,
  DataGridAgentToolName,
  DataGridCommand,
  DataGridQueryScope,
} from "../../src/components/DataGrid";

export type BenchmarkCategory =
  | "ambiguous-columns"
  | "selections"
  | "multi-step-views"
  | "aggregation"
  | "invalid-requests"
  | "server-boundaries"
  | "sensitive-columns";

export type BenchmarkStatus =
  | "completed"
  | "needs_clarification"
  | "refused"
  | "unsupported";

export type BenchmarkScalar = null | boolean | number | string;

export type BenchmarkClaim = {
  key: string;
  value: BenchmarkScalar;
};

export type BenchmarkSubmission = {
  status: BenchmarkStatus;
  summary: string;
  claims: BenchmarkClaim[];
  receiptIds: string[];
};

export type BenchmarkOracleStep = {
  tool: DataGridAgentToolName;
  input?: Record<string, unknown>;
  /** Replace this step's planId with the last successful plan's id. */
  useLastPlanId?: boolean;
};

export type BenchmarkExpectedState = {
  sorting?: Array<{ id: string; desc: boolean }>;
  globalFilter?: string;
  grouping?: string[];
  selectedColumnIds?: string[];
  rowSelection?: Record<string, boolean>;
  pagination?: { pageIndex: number; pageSize: number };
  columnVisibility?: Record<string, boolean>;
};

export type BenchmarkCase = {
  id: string;
  category: BenchmarkCategory;
  tags: string[];
  prompt: string;
  dataMode?: "client" | "server";
  serverAnalysis?: "none" | "all" | "filtered" | "all-and-filtered";
  setup?: DataGridCommand[];
  policy?: {
    operations?: DataGridAgentOperation[];
    scopes?: DataGridQueryScope[];
    allowRestricted?: boolean;
  };
  oracle: BenchmarkOracleStep[];
  expected: {
    status: BenchmarkStatus;
    claims?: BenchmarkClaim[];
    state?: BenchmarkExpectedState;
    requiredTools?: DataGridAgentToolName[];
    forbiddenTools?: DataGridAgentToolName[];
    forbiddenTokens?: string[];
  };
};

export type BenchmarkToolTrace = {
  name: DataGridAgentToolName | "benchmark_submit";
  input: unknown;
  output: unknown;
  startedAt: string;
  durationMs: number;
  valid: boolean;
};

export type BenchmarkRun = {
  schemaVersion: 1;
  runId: string;
  caseId: string;
  category: BenchmarkCategory;
  repetition: number;
  provider: string;
  requestedModel: string;
  resolvedModel: string;
  reasoningEffort: string;
  startedAt: string;
  durationMs: number;
  modelDurationMs: number;
  toolDurationMs: number;
  modelTurns: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    totalTokens: number;
  };
  submission: BenchmarkSubmission;
  tools: BenchmarkToolTrace[];
  finalState: Record<string, unknown>;
  exposedToolSchema: unknown;
  adapterError?: string;
};

export type BenchmarkCaseScore = {
  caseId: string;
  category: BenchmarkCategory;
  passed: boolean;
  analyticalCorrectness: number;
  validToolCalls: number;
  attemptedToolCalls: number;
  dataLeakageCount: number;
  gridCalls: number;
  modelTurns: number;
  durationMs: number;
  outcomeFingerprint: string;
  failures: string[];
};

export type BenchmarkReport = {
  schemaVersion: 1;
  generatedAt: string;
  corpusVersion: string;
  caseCount: number;
  runCount: number;
  provider: string;
  requestedModel: string;
  resolvedModels: string[];
  reasoningEffort: string;
  repetitions: number;
  metrics: {
    validToolCallRate: number;
    analyticalCorrectness: number;
    dataLeakageCount: number;
    callsPerTask: number;
    latencyP50Ms: number;
    latencyP95Ms: number;
    replayConsistency: number;
    passRate: number;
    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    adapterErrors: number;
  };
  severeFailures: string[];
  cases: BenchmarkCaseScore[];
};
