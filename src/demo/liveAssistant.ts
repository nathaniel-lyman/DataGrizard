import type { DataGridAgentToolDefinition } from "../components/DataGrid";

export type LiveAssistantToolCall = {
  callId: string;
  name: DataGridAgentToolDefinition["name"];
  arguments: string;
};

export type LiveAssistantTurn = {
  responseId: string;
  text: string;
  toolCalls: LiveAssistantToolCall[];
};

export type LiveAssistantToolOutput = {
  callId: string;
  output: unknown;
};

type LiveAssistantRequest = {
  prompt?: string;
  previousResponseId?: string;
  toolOutputs?: LiveAssistantToolOutput[];
  tools: DataGridAgentToolDefinition[];
};

/**
 * Calls the local Vite middleware. The browser never receives the OpenAI key;
 * it only executes policy-bounded tools from the mounted DataGrid toolkit.
 */
export async function requestLiveAssistant(
  request: LiveAssistantRequest,
): Promise<LiveAssistantTurn> {
  const response = await fetch("/api/demo-agent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  const payload = await response.json().catch(() => null) as
    | LiveAssistantTurn
    | { error?: string }
    | null;

  if (!response.ok || !payload || !("responseId" in payload)) {
    throw new Error(payload && "error" in payload && payload.error
      ? payload.error
      : "The local agent endpoint did not return a usable response.");
  }
  return payload;
}
