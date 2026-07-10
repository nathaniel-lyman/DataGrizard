import { useState } from "react";
import type { DataGridAgentToolDefinition } from "../components/DataGrid";
import {
  runRetailAssistantWorkflow,
  type RetailAssistantWorkflowResult,
} from "./retailAssistantAdapter";

type AssistantDemoProps = {
  toolkit: {
    execute: (name: DataGridAgentToolDefinition["name"], input?: unknown) => unknown;
  };
  disabled?: boolean;
};

export function AssistantDemo({ toolkit, disabled = false }: AssistantDemoProps) {
  const [result, setResult] = useState<RetailAssistantWorkflowResult | null>(null);
  const [running, setRunning] = useState(false);

  return (
    <section aria-label="Assistant workflow demo" className="border-b border-slate-200 bg-white px-3 py-2 sm:px-5">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="font-semibold text-slate-700">Assistant demo</span>
        <span className="min-w-0 flex-1 text-slate-500">
          “Filter to Grocery, show the top five products by revenue, add data bars, and summarize the result.”
        </span>
        <button
          type="button"
          disabled={disabled || running}
          onClick={async () => {
            setRunning(true);
            setResult(await runRetailAssistantWorkflow(toolkit));
            setRunning(false);
          }}
          className="h-8 rounded-md border border-slate-300 bg-slate-900 px-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {running ? "Running…" : "Run workflow"}
        </button>
        {result ? <output className="w-full font-medium text-slate-700">{result.summary}</output> : null}
        {disabled ? <span className="w-full text-slate-400">Available in client grid mode.</span> : null}
      </div>
    </section>
  );
}
