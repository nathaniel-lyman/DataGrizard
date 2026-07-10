import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { reliabilityCases } from "./cases";
import { buildReport } from "./score";
import type { BenchmarkReport, BenchmarkRun } from "./types";

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const duration = (value: number) => value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${value.toFixed(0)}ms`;

export function renderReportMarkdown(report: BenchmarkReport) {
  const categoryRows = [...new Set(report.cases.map((item) => item.category))].map((category) => {
    const cases = report.cases.filter((item) => item.category === category);
    const correctness = cases.reduce((sum, item) => sum + item.analyticalCorrectness, 0) / cases.length;
    const passRate = cases.filter((item) => item.passed).length / cases.length;
    return `| ${category} | ${cases.length} | ${percent(correctness)} | ${percent(passRate)} | ${cases.reduce((sum, item) => sum + item.dataLeakageCount, 0)} |`;
  }).join("\n");
  const failures = report.cases.filter((item) => !item.passed);
  return `# DataGrizard Reliability Benchmark

Generated ${report.generatedAt} from corpus ${report.corpusVersion}.

| Configuration | Value |
| --- | --- |
| Provider | ${report.provider} |
| Requested model | ${report.requestedModel} |
| Resolved model(s) | ${report.resolvedModels.join(", ")} |
| Reasoning effort | ${report.reasoningEffort} |
| Cases / runs | ${report.caseCount} / ${report.runCount} |
| Repetitions | ${report.repetitions} |

## Headline metrics

| Metric | Result |
| --- | ---: |
| Valid tool-call rate | ${percent(report.metrics.validToolCallRate)} |
| Analytical correctness | ${percent(report.metrics.analyticalCorrectness)} |
| Data leakage occurrences | ${report.metrics.dataLeakageCount} |
| Calls per task | ${report.metrics.callsPerTask.toFixed(2)} |
| Latency p50 / p95 | ${duration(report.metrics.latencyP50Ms)} / ${duration(report.metrics.latencyP95Ms)} |
| Replay consistency | ${percent(report.metrics.replayConsistency)} |
| Run pass rate | ${percent(report.metrics.passRate)} |
| Provider/API errors | ${report.metrics.adapterErrors} |
| Input / output / reasoning tokens | ${report.metrics.inputTokens} / ${report.metrics.outputTokens} / ${report.metrics.reasoningTokens} |

## Category results

| Category | Cases | Correctness | All-repetition pass rate | Leakage |
| --- | ---: | ---: | ---: | ---: |
${categoryRows}

## Severe failures

${report.severeFailures.length ? report.severeFailures.map((item) => `- ${item}`).join("\n") : "None."}

## Failed cases

${failures.length ? failures.map((item) => `- **${item.caseId}:** ${item.failures.join(" ")}`).join("\n") : "None."}

## Methodology

The corpus, fixtures, expected outcomes, and scorer are public in
\`benchmarks/reliability/\`. Deterministic oracle runs execute the same live
DataGrid toolkit used by model-backed runs. Model replay consistency compares
normalized outcomes, not byte-identical prose or tool ordering.
`;
}

export async function writeBenchmarkReport(
  runs: BenchmarkRun[],
  jsonPath: string,
  markdownPath: string,
) {
  const report = buildReport(reliabilityCases, runs);
  await mkdir(dirname(resolve(jsonPath)), { recursive: true });
  await mkdir(dirname(resolve(markdownPath)), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, renderReportMarkdown(report), "utf8");
  return report;
}

async function main() {
  const [input, jsonOutput = "benchmarks/reliability/results/latest.json", markdownOutput = "benchmarks/reliability/results/latest.md"] = process.argv.slice(2);
  if (!input) throw new Error("Usage: benchmark:report <runs.json> [report.json] [report.md]");
  const runs = JSON.parse(await readFile(input, "utf8")) as BenchmarkRun[];
  const report = await writeBenchmarkReport(runs, jsonOutput, markdownOutput);
  process.stdout.write(`${JSON.stringify(report.metrics)}\n`);
  if (report.severeFailures.length) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void main();
}
