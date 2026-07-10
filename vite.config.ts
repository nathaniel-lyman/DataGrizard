import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

type DemoTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

type DemoRequest = {
  prompt?: unknown;
  previousResponseId?: unknown;
  toolOutputs?: unknown;
  tools?: unknown;
};

const maxRequestBytes = 250_000;

const readJsonBody = async (request: NodeJS.ReadableStream) => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxRequestBytes) throw new Error("Request body is too large.");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as DemoRequest;
};

const isDemoTool = (value: unknown): value is DemoTool => !!value && typeof value === "object" &&
  typeof (value as DemoTool).name === "string" &&
  typeof (value as DemoTool).description === "string" &&
  !!(value as DemoTool).inputSchema && typeof (value as DemoTool).inputSchema === "object";

const sendJson = (response: import("node:http").ServerResponse, status: number, body: unknown) => {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
};

const liveAgentDemo = () => ({
  name: "local-openai-grid-agent-demo",
  configureServer(server: { middlewares: { use: (path: string, handler: (request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse) => void) => void } }) {
    server.middlewares.use("/api/demo-agent", (request, response) => {
      void (async () => {
        if (request.method !== "POST") {
          sendJson(response, 405, { error: "Use POST for the live agent endpoint." });
          return;
        }
        if (!process.env.OPENAI_API_KEY) {
          sendJson(response, 503, { error: "OPENAI_API_KEY is not available to the local Vite process." });
          return;
        }

        try {
          const body = await readJsonBody(request);
          const tools = Array.isArray(body.tools) ? body.tools.filter(isDemoTool).slice(0, 12) : [];
          const isContinuation = typeof body.previousResponseId === "string" && Array.isArray(body.toolOutputs);
          if ((!isContinuation && (typeof body.prompt !== "string" || body.prompt.trim().length === 0)) || tools.length === 0) {
            sendJson(response, 400, { error: "A prompt and at least one grid tool are required." });
            return;
          }

          const input = isContinuation
            ? (body.toolOutputs as Array<{ callId?: unknown; output?: unknown }>).slice(0, 12).flatMap((item) =>
              typeof item.callId === "string"
                ? [{ type: "function_call_output", call_id: item.callId, output: JSON.stringify(item.output ?? null) }]
                : [],
            )
            : body.prompt;
          const apiResponse = await fetch("https://api.openai.com/v1/responses", {
            method: "POST",
            headers: {
              authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              model: process.env.OPENAI_MODEL ?? "gpt-5.6-luna",
              instructions: "You are a concise analytical copilot for a local demo grid. Inspect the live grid with grid_get_context before any other action. Before every visible mutation, use grid_plan_actions, then grid_validate_plan, then grid_apply_plan in order. Use grid_query_rows or grid_aggregate before stating numerical evidence. Never claim a change or result unless a tool output confirms it. Keep the final answer under 90 words and name the evidence used.",
              input,
              previous_response_id: isContinuation ? body.previousResponseId : undefined,
              tools: tools.map((tool) => ({
                type: "function",
                name: tool.name,
                description: tool.description,
                parameters: tool.inputSchema,
                strict: false,
              })),
              parallel_tool_calls: false,
              reasoning: { effort: "low" },
              text: { verbosity: "low" },
            }),
          });
          const payload = await apiResponse.json() as {
            id?: string;
            output_text?: string;
            output?: Array<{
              type?: string;
              call_id?: string;
              name?: string;
              arguments?: string;
              content?: Array<{ type?: string; text?: string }>;
            }>;
            error?: { message?: string };
          };
          if (!apiResponse.ok || !payload.id) {
            sendJson(response, apiResponse.status || 502, { error: payload.error?.message ?? "OpenAI did not return a response." });
            return;
          }
          const outputText = payload.output_text ?? (payload.output ?? [])
            .flatMap((item) => item.type === "message" ? item.content ?? [] : [])
            .filter((item) => item.type === "output_text" && typeof item.text === "string")
            .map((item) => item.text)
            .join("\n");
          sendJson(response, 200, {
            responseId: payload.id,
            text: outputText,
            toolCalls: (payload.output ?? []).flatMap((item) =>
              item.type === "function_call" && item.call_id && item.name && item.arguments
                ? [{ callId: item.call_id, name: item.name, arguments: item.arguments }]
                : [],
            ),
          });
        } catch (error) {
          sendJson(response, 500, { error: error instanceof Error ? error.message : "The local agent endpoint failed." });
        }
      })();
    });
  },
});

export default defineConfig({
  plugins: [react(), liveAgentDemo()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    // The repository can contain standalone nested apps with their own test
    // runners. Keep the package suite scoped to the DataGrizard source tree.
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
