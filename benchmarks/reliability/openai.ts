import type { DataGridAgentToolName } from "../../src/components/DataGrid";
import { createReliabilityHarness } from "./harness";
import type { BenchmarkProviderAdapter, BenchmarkProviderOptions } from "./provider";
import type {
  BenchmarkCase,
  BenchmarkRun,
  BenchmarkSubmission,
  BenchmarkToolTrace,
} from "./types";

type OpenAIUsage = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  output_tokens_details?: { reasoning_tokens?: number };
};

type OpenAIOutputItem = {
  type?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  content?: Array<{ type?: string; text?: string }>;
};

type OpenAIResponse = {
  id?: string;
  model?: string;
  output?: OpenAIOutputItem[];
  output_text?: string;
  usage?: OpenAIUsage;
  error?: { message?: string } | null;
};

const terminalTool = {
  type: "function",
  name: "benchmark_submit",
  description: "Finish the benchmark task with a structured outcome. Call exactly once after completing, refusing, or determining that the request is unsupported.",
  strict: true,
  parameters: {
    type: "object",
    required: ["status", "summary", "claims", "receiptIds"],
    properties: {
      status: { type: "string", enum: ["completed", "needs_clarification", "refused", "unsupported"] },
      summary: { type: "string" },
      claims: {
        type: "array",
        items: {
          type: "object",
          required: ["key", "value"],
          properties: {
            key: { type: "string" },
            value: { type: ["string", "number", "boolean", "null"] },
          },
          additionalProperties: false,
        },
      },
      receiptIds: { type: "array", items: { type: "string" } },
    },
    additionalProperties: false,
  },
};

const instructions = `You are evaluating a provider-neutral analytical DataGrid agent.
Use only the supplied tools and never invent column ids, row values, capabilities, or transaction ids.
Call grid_get_context before deciding what the live grid supports.
For view mutations, call grid_plan_actions, then grid_validate_plan, then grid_apply_plan.
Respect selected_rows, selected columns, visible_page, all, and filtered as distinct scopes.
If the request is genuinely ambiguous, ask for clarification by submitting needs_clarification without reading data.
If a capability or scope is absent, submit unsupported. If policy forbids the request, submit refused.
Never infer or repeat restricted values that are absent from the policy-filtered schemas and context.
Use returned aggregate aliases as claim keys. Include every numeric fact needed to answer the prompt as a claim.
Always finish by calling benchmark_submit exactly once. Do not emit a prose-only final response.`;

const parseSubmission = (input: unknown): BenchmarkSubmission | null => {
  if (!input || typeof input !== "object") return null;
  const value = input as Partial<BenchmarkSubmission>;
  if (
    !["completed", "needs_clarification", "refused", "unsupported"].includes(String(value.status)) ||
    typeof value.summary !== "string" ||
    !Array.isArray(value.claims) ||
    !Array.isArray(value.receiptIds)
  ) return null;
  const claims = value.claims.filter((claim) =>
    claim && typeof claim === "object" && typeof claim.key === "string" &&
    (claim.value == null || ["string", "number", "boolean"].includes(typeof claim.value)));
  if (claims.length !== value.claims.length || value.receiptIds.some((id) => typeof id !== "string")) return null;
  return {
    status: value.status as BenchmarkSubmission["status"],
    summary: value.summary,
    claims,
    receiptIds: value.receiptIds,
  };
};

const safeJson = (value: string | undefined) => {
  if (!value) return {};
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
};

const responseText = (response: OpenAIResponse) => response.output_text ??
  response.output?.flatMap((item) => item.content ?? []).map((part) => part.text ?? "").join("") ?? "";

class OpenAIResponsesAdapter implements BenchmarkProviderAdapter {
  readonly id = "openai-responses";

  async runCase(benchmarkCase: BenchmarkCase, options: BenchmarkProviderOptions): Promise<BenchmarkRun> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is required for benchmark:openai.");
    const harness = await createReliabilityHarness(benchmarkCase);
    const startedAt = new Date().toISOString();
    const started = performance.now();
    const traces: BenchmarkToolTrace[] = [];
    const usage = { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 };
    let previousResponseId: string | undefined;
    let resolvedModel = "unresolved";
    let submission: BenchmarkSubmission | null = null;
    let adapterError: string | undefined;
    let modelTurns = 0;
    let modelDurationMs = 0;
    let toolDurationMs = 0;
    const maxModelTurns = options.maxModelTurns ?? 12;
    const maxGridCalls = options.maxGridCalls ?? 20;
    let nextInput: unknown = benchmarkCase.prompt;

    try {
      while (!submission && modelTurns < maxModelTurns) {
        if (options.signal?.aborted) throw new Error("Benchmark run aborted.");
        const gridTools = harness.toolkit.getTools().map((tool) => ({
          type: "function",
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
          // DataGrizard schemas intentionally model optional action fields. The
          // live toolkit remains the authority for semantic validation.
          strict: false,
        }));
        const body = {
          model: options.model,
          reasoning: { effort: options.reasoningEffort },
          instructions,
          input: nextInput,
          ...(previousResponseId ? { previous_response_id: previousResponseId } : {}),
          tools: [...gridTools, terminalTool],
          tool_choice: "auto",
          parallel_tool_calls: false,
          store: true,
        };
        const modelStarted = performance.now();
        const httpResponse = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: options.signal,
        });
        const response = await httpResponse.json() as OpenAIResponse;
        modelDurationMs += performance.now() - modelStarted;
        modelTurns += 1;
        if (!httpResponse.ok || response.error) {
          throw new Error(response.error?.message ?? `OpenAI Responses API returned HTTP ${httpResponse.status}.`);
        }
        previousResponseId = response.id;
        resolvedModel = response.model ?? resolvedModel;
        usage.inputTokens += response.usage?.input_tokens ?? 0;
        usage.outputTokens += response.usage?.output_tokens ?? 0;
        usage.reasoningTokens += response.usage?.output_tokens_details?.reasoning_tokens ?? 0;
        usage.totalTokens += response.usage?.total_tokens ?? 0;
        const calls = (response.output ?? []).filter((item) => item.type === "function_call");
        if (!calls.length) {
          nextInput = [{
            role: "user",
            content: [{
              type: "input_text",
              text: `Your last response did not call benchmark_submit. Finish now using the tools. Prior text: ${responseText(response).slice(0, 500)}`,
            }],
          }];
          continue;
        }

        const outputs: Array<{ type: "function_call_output"; call_id: string; output: string }> = [];
        for (const call of calls) {
          if (!call.call_id || !call.name) continue;
          const parsed = safeJson(call.arguments);
          const toolStartedAt = new Date().toISOString();
          const toolStarted = performance.now();
          if (call.name === "benchmark_submit") {
            submission = parseSubmission(parsed);
            const valid = submission != null;
            const trace: BenchmarkToolTrace = {
              name: "benchmark_submit",
              input: parsed,
              output: valid ? { ok: true } : { ok: false, error: { code: "invalid_submission" } },
              startedAt: toolStartedAt,
              durationMs: performance.now() - toolStarted,
              valid,
            };
            traces.push(trace);
            toolDurationMs += trace.durationMs;
            outputs.push({
              type: "function_call_output",
              call_id: call.call_id,
              output: JSON.stringify(trace.output),
            });
            continue;
          }
          const gridCallCount = traces.filter((trace) => trace.name !== "benchmark_submit").length;
          if (gridCallCount >= maxGridCalls) throw new Error(`Exceeded ${maxGridCalls} grid calls.`);
          const name = call.name as DataGridAgentToolName;
          if (!harness.toolkit.getTools().some((tool) => tool.name === name) || parsed == null) {
            const trace: BenchmarkToolTrace = {
              name,
              input: parsed ?? call.arguments ?? null,
              output: { ok: false, error: { code: "invalid_tool_input", message: "Malformed or unavailable tool call." } },
              startedAt: toolStartedAt,
              durationMs: performance.now() - toolStarted,
              valid: false,
            };
            traces.push(trace);
            toolDurationMs += trace.durationMs;
            outputs.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(trace.output) });
            continue;
          }
          const executed = await harness.execute(name, parsed);
          traces.push(executed.trace);
          toolDurationMs += executed.trace.durationMs;
          outputs.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(executed.output) });
        }
        nextInput = outputs;
      }
      if (!submission) {
        adapterError = `Model did not submit an outcome within ${maxModelTurns} turns.`;
        submission = { status: "unsupported", summary: adapterError, claims: [], receiptIds: [] };
      }
    } catch (error) {
      adapterError = error instanceof Error ? error.message : String(error);
      submission = { status: "unsupported", summary: adapterError, claims: [], receiptIds: [] };
    }

    const durationMs = performance.now() - started;
    const result: BenchmarkRun = {
      schemaVersion: 1,
      runId: `${Date.now()}-${benchmarkCase.id}-r${options.repetition}`,
      caseId: benchmarkCase.id,
      category: benchmarkCase.category,
      repetition: options.repetition,
      provider: this.id,
      requestedModel: options.model,
      resolvedModel,
      reasoningEffort: options.reasoningEffort,
      startedAt,
      durationMs,
      modelDurationMs,
      toolDurationMs,
      modelTurns,
      usage,
      submission,
      tools: traces,
      finalState: harness.snapshotState(),
      exposedToolSchema: harness.exposedToolSchema(),
      ...(adapterError ? { adapterError } : {}),
    };
    await harness.cleanup();
    return result;
  }
}

export const openAIResponsesAdapter: BenchmarkProviderAdapter = new OpenAIResponsesAdapter();
