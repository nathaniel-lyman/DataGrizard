import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reliabilityCases } from "./cases";
import { openAIResponsesAdapter } from "./openai";

const response = (id: string, output: unknown[], status = 200) => new Response(JSON.stringify({
  id,
  model: "gpt-5.5-resolved",
  output,
  usage: {
    input_tokens: 10,
    output_tokens: 5,
    total_tokens: 15,
    output_tokens_details: { reasoning_tokens: 2 },
  },
}), { status, headers: { "Content-Type": "application/json" } });

const call = (callId: string, name: string, args: unknown) => ({
  type: "function_call",
  call_id: callId,
  name,
  arguments: typeof args === "string" ? args : JSON.stringify(args),
});

describe("OpenAI reliability adapter", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-only-not-a-real-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENAI_API_KEY;
  });

  it("continues Responses API function calls through context, analysis, and terminal submission", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response("resp-1", [call("call-1", "grid_get_context", {})]))
      .mockResolvedValueOnce(response("resp-2", [call("call-2", "grid_aggregate", {
        scope: "all",
        metrics: [{ operation: "count", as: "count" }],
      })]))
      .mockResolvedValueOnce(response("resp-3", [call("call-3", "benchmark_submit", {
        status: "completed",
        summary: "Six products.",
        claims: [{ key: "count", value: 6 }],
        receiptIds: [],
      })]));
    vi.stubGlobal("fetch", fetchMock);
    const run = await openAIResponsesAdapter.runCase(reliabilityCases.find((item) => item.id === "agg-01")!, {
      model: "gpt-5.5",
      reasoningEffort: "high",
      repetition: 1,
    });
    expect(run.submission).toMatchObject({ status: "completed", claims: [{ value: 6 }] });
    expect(run.tools.map((tool) => tool.name)).toEqual([
      "grid_get_context",
      "grid_aggregate",
      "benchmark_submit",
    ]);
    expect(run.resolvedModel).toBe("gpt-5.5-resolved");
    expect(run.usage).toEqual({ inputTokens: 30, outputTokens: 15, reasoningTokens: 6, totalTokens: 45 });
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(request).toMatchObject({ model: "gpt-5.5", reasoning: { effort: "high" }, parallel_tool_calls: false });
  });

  it("records malformed arguments as an invalid call without executing the toolkit", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response("resp-1", [call("call-1", "grid_query_rows", "{not-json")]))
      .mockResolvedValueOnce(response("resp-2", [call("call-2", "benchmark_submit", {
        status: "refused", summary: "Invalid request.", claims: [], receiptIds: [],
      })])));
    const run = await openAIResponsesAdapter.runCase(reliabilityCases.find((item) => item.id === "invalid-04")!, {
      model: "gpt-5.5", reasoningEffort: "high", repetition: 1,
    });
    expect(run.tools[0]).toMatchObject({ name: "grid_query_rows", valid: false });
    expect(run.submission.status).toBe("refused");
  });

  it("turns API failures into a scored unsupported result without exposing credentials", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response("error", [], 500)));
    const run = await openAIResponsesAdapter.runCase(reliabilityCases[0], {
      model: "gpt-5.5", reasoningEffort: "high", repetition: 1,
    });
    expect(run.submission.status).toBe("unsupported");
    expect(run.adapterError).toContain("HTTP 500");
    expect(JSON.stringify(run)).not.toContain("test-only-not-a-real-key");
  });

  it("stops prose-only responses at the configured model-turn limit", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(response("resp-text", [{
      type: "message",
      content: [{ type: "output_text", text: "I will not call a tool." }],
    }]))));
    const run = await openAIResponsesAdapter.runCase(reliabilityCases[0], {
      model: "gpt-5.5", reasoningEffort: "high", repetition: 1, maxModelTurns: 2,
    });
    expect(run.modelTurns).toBe(2);
    expect(run.submission.status).toBe("unsupported");
    expect(run.adapterError).toContain("within 2 turns");
  });
});
