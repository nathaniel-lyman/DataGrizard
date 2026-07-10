import { createRef } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  DataGrid,
  createDataGridAgentToolkit,
  type DataGridAgentPolicy,
  type DataGridAgentToolName,
  type DataGridApi,
} from "../../src/components/DataGrid";
import { BENCHMARK_OPERATIONS } from "./cases";
import {
  createReliabilityServerAnalysis,
  reliabilityColumns,
  reliabilityFilters,
  reliabilityRows,
  type ReliabilityRow,
} from "./fixture";
import type {
  BenchmarkCase,
  BenchmarkRun,
  BenchmarkSubmission,
  BenchmarkToolTrace,
} from "./types";

export type ReliabilityHarness = {
  api: DataGridApi<ReliabilityRow>;
  toolkit: ReturnType<typeof createDataGridAgentToolkit<ReliabilityRow>>;
  execute: (name: DataGridAgentToolName, input?: unknown) => Promise<{ output: unknown; trace: BenchmarkToolTrace }>;
  snapshotState: () => Record<string, unknown>;
  exposedToolSchema: () => unknown;
  cleanup: () => Promise<void>;
};

const isInvalidToolOutput = (output: unknown) => {
  if (!output || typeof output !== "object" || !("error" in output)) return false;
  const error = (output as { error?: { code?: unknown } }).error;
  return ["invalid_tool_input", "tool_unavailable", "policy_denied", "api_unavailable"].includes(String(error?.code));
};

const policyForCase = (benchmarkCase: BenchmarkCase): DataGridAgentPolicy => ({
  operations: benchmarkCase.policy?.operations ?? BENCHMARK_OPERATIONS,
  scopes: benchmarkCase.policy?.scopes ?? ["all", "filtered", "selected_rows", "visible_page"],
  columns: ({ column }) => benchmarkCase.policy?.allowRestricted === true ||
    column.semantic?.sensitivity !== "restricted",
});

export async function createReliabilityHarness(
  benchmarkCase: BenchmarkCase,
): Promise<ReliabilityHarness> {
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  const apiRef = createRef<DataGridApi<ReliabilityRow>>();
  const dataMode = benchmarkCase.dataMode ?? "client";
  const serverAnalysis = benchmarkCase.serverAnalysis && benchmarkCase.serverAnalysis !== "none"
    ? createReliabilityServerAnalysis(benchmarkCase.serverAnalysis)
    : undefined;
  const data = dataMode === "server" ? reliabilityRows.slice(0, 3) : reliabilityRows;

  await act(async () => {
    root.render(
      <DataGrid
        apiRef={apiRef}
        data={data}
        columns={reliabilityColumns}
        filters={reliabilityFilters}
        dataMode={dataMode}
        rowCount={dataMode === "server" ? reliabilityRows.length : undefined}
        serverAnalysis={serverAnalysis}
        getRowId={(row) => row.id}
        storageKey={`reliability-${benchmarkCase.id}`}
        dataAccessLimits={{
          maxRowsPerQuery: 100,
          maxCellsPerQuery: 2_000,
          maxGroupsPerAggregate: 100,
          maxTopValues: 20,
        }}
      />,
    );
  });

  const api = apiRef.current;
  if (!api) throw new Error(`DataGrid API failed to mount for ${benchmarkCase.id}.`);
  if (benchmarkCase.setup?.length) {
    await act(async () => {
      const result = api.dispatch(benchmarkCase.setup ?? []);
      if (!result.ok) throw new Error(`Setup failed for ${benchmarkCase.id}: ${JSON.stringify(result)}`);
    });
  }

  const toolkit = createDataGridAgentToolkit({
    api: apiRef,
    policy: () => policyForCase(benchmarkCase),
    limits: { maxRowsPerQuery: 100, maxCellsPerQuery: 2_000 },
  });

  return {
    get api() {
      return apiRef.current ?? api;
    },
    toolkit,
    async execute(name, input = {}) {
      const startedAt = new Date().toISOString();
      const started = performance.now();
      let output: unknown;
      await act(async () => {
        output = await toolkit.execute(name, input);
      });
      const trace: BenchmarkToolTrace = {
        name,
        input,
        output,
        startedAt,
        durationMs: performance.now() - started,
        valid: !isInvalidToolOutput(output),
      };
      return { output, trace };
    },
    snapshotState() {
      return structuredClone((apiRef.current ?? api).getSnapshot().state) as unknown as Record<string, unknown>;
    },
    exposedToolSchema() {
      return structuredClone(toolkit.getTools());
    },
    async cleanup() {
      await act(async () => root.unmount());
      container.remove();
      window.localStorage.clear();
    },
  };
}

const successfulPlanId = (output: unknown) => {
  if (!output || typeof output !== "object" || !("ok" in output) || !output.ok) return null;
  const plan = (output as { plan?: { planId?: unknown } }).plan;
  return typeof plan?.planId === "string" ? plan.planId : null;
};

export async function runOracleCase(
  benchmarkCase: BenchmarkCase,
): Promise<BenchmarkRun> {
  const harness = await createReliabilityHarness(benchmarkCase);
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const traces: BenchmarkToolTrace[] = [];
  let lastPlanId: string | null = null;
  try {
    for (const step of benchmarkCase.oracle) {
      const input = step.useLastPlanId ? { planId: lastPlanId } : (step.input ?? {});
      const executed = await harness.execute(step.tool, input);
      traces.push(executed.trace);
      const planId = successfulPlanId(executed.output);
      if (planId) lastPlanId = planId;
      if (!executed.trace.valid) {
        throw new Error(`Oracle emitted an invalid tool call for ${benchmarkCase.id}: ${JSON.stringify(executed.output)}`);
      }
    }

    const submission: BenchmarkSubmission = {
      status: benchmarkCase.expected.status,
      summary: `Deterministic oracle completed ${benchmarkCase.id}.`,
      claims: benchmarkCase.expected.claims ?? [],
      receiptIds: traces.flatMap((trace) => {
        const receipt = trace.output && typeof trace.output === "object"
          ? (trace.output as { receipt?: { queryId?: unknown } }).receipt
          : undefined;
        return typeof receipt?.queryId === "string" ? [receipt.queryId] : [];
      }),
    };
    traces.push({
      name: "benchmark_submit",
      input: submission,
      output: { ok: true },
      startedAt: new Date().toISOString(),
      durationMs: 0,
      valid: true,
    });
    const durationMs = performance.now() - started;
    return {
      schemaVersion: 1,
      runId: `oracle-${benchmarkCase.id}`,
      caseId: benchmarkCase.id,
      category: benchmarkCase.category,
      repetition: 1,
      provider: "deterministic-oracle",
      requestedModel: "none",
      resolvedModel: "none",
      reasoningEffort: "none",
      startedAt,
      durationMs,
      modelDurationMs: 0,
      toolDurationMs: traces.reduce((sum, trace) => sum + trace.durationMs, 0),
      modelTurns: 0,
      usage: { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 },
      submission,
      tools: traces,
      finalState: harness.snapshotState(),
      exposedToolSchema: harness.exposedToolSchema(),
    };
  } finally {
    await harness.cleanup();
  }
}
