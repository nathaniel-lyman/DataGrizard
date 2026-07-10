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
  const receipt = result?.aggregation.ok ? result.aggregation.receipt : null;

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
        {receipt ? (
          <details className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600">
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
        {disabled ? <span className="w-full text-slate-400">Available in client grid mode.</span> : null}
      </div>
    </section>
  );
}
