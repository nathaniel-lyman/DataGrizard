import { useState } from "react";
import type { DataGridAgentToolDefinition } from "../components/DataGrid";
import { requestLiveAssistant, type LiveAssistantToolOutput } from "./liveAssistant";
import {
  runRetailAssistantWorkflow,
  type RetailAssistantWorkflowResult,
} from "./retailAssistantAdapter";

type AssistantDemoProps = {
  toolkit: {
    getTools?: () => DataGridAgentToolDefinition[];
    execute: (name: DataGridAgentToolDefinition["name"], input?: unknown) => Promise<unknown>;
  };
  disabled?: boolean;
};

const defaultPrompt = "Filter to Grocery, rank the top five products by sales, add data bars, then summarize the evidence.";
const waitForGridUpdate = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export function AssistantDemo({ toolkit, disabled = false }: AssistantDemoProps) {
  const [result, setResult] = useState<RetailAssistantWorkflowResult | null>(null);
  const [workflowRunning, setWorkflowRunning] = useState(false);
  const [undoRunning, setUndoRunning] = useState(false);
  const [undoComplete, setUndoComplete] = useState(false);
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [agentAnswer, setAgentAnswer] = useState<string | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [agentSteps, setAgentSteps] = useState<string[]>([]);
  const [agentRunning, setAgentRunning] = useState(false);
  const receipt = result?.aggregation.ok ? result.aggregation.receipt : null;

  const runLiveAgent = async () => {
    if (!toolkit.getTools) {
      setAgentError("This demo needs a live DataGrid toolkit.");
      return;
    }
    setAgentRunning(true);
    setAgentAnswer(null);
    setAgentError(null);
    setAgentSteps([]);

    try {
      let response = await requestLiveAssistant({ prompt, tools: toolkit.getTools() });
      for (let turn = 0; turn < 8; turn += 1) {
        if (response.toolCalls.length === 0) {
          setAgentAnswer(response.text || "The agent completed its grid analysis.");
          return;
        }

        const toolOutputs: LiveAssistantToolOutput[] = [];
        for (const toolCall of response.toolCalls) {
          let input: unknown = {};
          try {
            input = JSON.parse(toolCall.arguments);
          } catch {
            toolOutputs.push({
              callId: toolCall.callId,
              output: { ok: false, error: { code: "invalid_model_arguments", message: "Tool arguments were not valid JSON." } },
            });
            continue;
          }
          setAgentSteps((steps) => [...steps, toolCall.name]);
          toolOutputs.push({
            callId: toolCall.callId,
            output: await toolkit.execute(toolCall.name, input),
          });
          // Give React/TanStack a frame to commit a planned mutation before the
          // next model turn asks for a new schema or grid revision.
          await waitForGridUpdate();
        }
        response = await requestLiveAssistant({
          previousResponseId: response.responseId,
          toolOutputs,
          tools: toolkit.getTools(),
        });
      }
      throw new Error("The agent reached the eight-turn safety limit before completing the request.");
    } catch (error) {
      setAgentError(error instanceof Error ? error.message : "The live assistant could not complete the request.");
    } finally {
      setAgentRunning(false);
    }
  };

  return (
    <section aria-label="Assistant workflow demo" className="border-b border-slate-200 bg-white px-3 py-4 sm:px-5">
      <div className="mx-auto max-w-7xl text-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-slate-900">Live grid agent</h2>
            <p className="mt-1 leading-5 text-slate-600">The model chooses typed tools; the mounted grid enforces policy and applies every visible change.</p>
          </div>
          <button
            type="button"
            disabled={disabled || workflowRunning || agentRunning}
            onClick={async () => {
              setWorkflowRunning(true);
              try {
                setUndoComplete(false);
                setResult(await runRetailAssistantWorkflow(toolkit));
              } finally {
                setWorkflowRunning(false);
              }
            }}
            className="h-10 rounded-md border border-slate-300 bg-white px-4 font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {workflowRunning ? "Running proof…" : "Run deterministic proof"}
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-violet-200 bg-violet-50/70 p-3 sm:flex-row sm:items-center">
          <label className="sr-only" htmlFor="live-agent-prompt">Ask the live grid agent</label>
          <input
            id="live-agent-prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            disabled={disabled || agentRunning}
            className="h-10 min-w-0 flex-1 rounded-md border border-violet-200 bg-white px-3.5 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 disabled:cursor-not-allowed"
          />
          <button
            type="button"
            disabled={disabled || agentRunning || workflowRunning || prompt.trim().length === 0}
            onClick={runLiveAgent}
            className="h-10 rounded-md bg-violet-700 px-5 font-semibold text-white shadow-sm transition hover:bg-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {agentRunning ? "Agent working…" : "Ask live agent"}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2.5 text-slate-600">
          <span className="font-medium text-slate-500">Try an example:</span>
          {[
            "Show the highest-sales Grocery products and summarize the results.",
            "Which department has the strongest sales? Use evidence.",
          ].map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => setPrompt(suggestion)}
              disabled={disabled || agentRunning}
              className="min-h-9 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-left leading-5 transition hover:border-violet-300 hover:text-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {suggestion}
            </button>
          ))}
        </div>
        {agentSteps.length > 0 ? (
          <p className="mt-3 text-slate-500">
            Tool trace: <span className="font-mono text-slate-700">{agentSteps.join(" → ")}</span>
          </p>
        ) : null}
        {agentAnswer ? <output className="mt-3 block rounded-md border border-violet-100 bg-white px-3 py-2 font-medium leading-5 text-slate-700">{agentAnswer}</output> : null}
        {agentError ? <p role="alert" className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 font-medium text-rose-800">{agentError}</p> : null}
        {result ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <output className="block font-medium text-slate-700">{result.summary}</output>
            <button
              type="button"
              disabled={undoRunning || undoComplete}
              onClick={async () => {
                setUndoRunning(true);
                try {
                  const transactionId = result.transactionIds[result.transactionIds.length - 1];
                  if (transactionId) {
                    await toolkit.execute("grid_undo", { transactionId });
                    await waitForGridUpdate();
                  }
                  setUndoComplete(true);
                } finally {
                  setUndoRunning(false);
                }
              }}
              className="h-10 rounded-md border border-slate-300 bg-white px-4 font-semibold text-slate-700 transition hover:border-violet-300 hover:text-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {undoRunning ? "Undoing…" : undoComplete ? "Latest change undone" : "Undo latest agent change"}
            </button>
          </div>
        ) : null}
        {receipt ? (
          <details className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600">
            <summary className="cursor-pointer font-semibold text-slate-700">
              View analysis receipt
            </summary>
            <dl className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-[max-content_1fr]">
              <dt className="font-semibold">Query</dt>
              <dd className="break-all font-mono">{receipt.queryId}</dd>
              <dt className="font-semibold">Grid revision</dt>
              <dd>{receipt.gridRevision}</dd>
              <dt className="font-semibold">Scope</dt>
              <dd>{receipt.scope}</dd>
              <dt className="font-semibold">Columns</dt>
              <dd>{receipt.columns.map((column) => column.label).join(", ") || "Row count only"}</dd>
              <dt className="font-semibold">Supporting rows</dt>
              <dd className="break-all font-mono">
                {receipt.supportingRowIds.join(", ") || "None"}
              </dd>
              <dt className="font-semibold">Warnings</dt>
              <dd>
                {receipt.warnings.length > 0
                  ? receipt.warnings.map((warning) => warning.message).join(" ")
                  : "None"}
              </dd>
              <dt className="font-semibold">Execution</dt>
              <dd>{receipt.timing.durationMs.toFixed(3)} ms</dd>
            </dl>
            <pre className="mt-3 max-h-56 overflow-auto rounded bg-slate-900 p-3 text-[11px] leading-5 text-slate-100">
              {JSON.stringify({
                filters: receipt.filters,
                sorting: receipt.sorting,
                grouping: receipt.grouping,
                supportingGroupKeys: receipt.supportingGroupKeys,
                replay: receipt.replay,
              }, null, 2)}
            </pre>
          </details>
        ) : null}
        {disabled ? <span className="mt-3 block text-slate-400">Available in grid layout.</span> : null}
      </div>
    </section>
  );
}
