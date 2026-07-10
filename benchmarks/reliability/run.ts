import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { installBenchmarkDom } from "./dom";
import { reliabilityCases } from "./cases";
import { writeBenchmarkReport } from "./report";
import type { BenchmarkReport, BenchmarkRun } from "./types";

type CliOptions = {
  model: string;
  reasoning: string;
  repetitions: number;
  caseId?: string;
  category?: string;
  maxCases?: number;
  output: string;
  reportJson: string;
  reportMarkdown: string;
  baseline?: string;
};

const valueAfter = (args: string[], flag: string) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

const parseOptions = (): CliOptions => {
  const args = process.argv.slice(2);
  const stamp = new Date().toISOString().replace(/:/g, "-");
  const output = valueAfter(args, "--output") ?? `.tmp/reliability/runs-${stamp}.json`;
  return {
    model: valueAfter(args, "--model") ?? "gpt-5.5",
    reasoning: valueAfter(args, "--reasoning") ?? "high",
    repetitions: Number(valueAfter(args, "--repetitions") ?? "3"),
    caseId: valueAfter(args, "--case"),
    category: valueAfter(args, "--category"),
    maxCases: valueAfter(args, "--max-cases") ? Number(valueAfter(args, "--max-cases")) : undefined,
    output,
    reportJson: valueAfter(args, "--report-json") ?? `${output.replace(/\.json$/, "")}-report.json`,
    reportMarkdown: valueAfter(args, "--report-markdown") ?? `${output.replace(/\.json$/, "")}-report.md`,
    baseline: valueAfter(args, "--baseline"),
  };
};

const compareBaseline = async (report: BenchmarkReport, path?: string) => {
  if (!path) return [];
  const baseline = JSON.parse(await readFile(path, "utf8")) as BenchmarkReport;
  return baseline.metrics.analyticalCorrectness - report.metrics.analyticalCorrectness > 0.05
    ? [`Analytical correctness regressed by more than five percentage points from ${path}.`]
    : [];
};

async function main() {
  const options = parseOptions();
  if (!Number.isInteger(options.repetitions) || options.repetitions < 1) {
    throw new Error("--repetitions must be a positive integer.");
  }
  const disposeDom = installBenchmarkDom();
  const { openAIResponsesAdapter } = await import("./openai");
  let selected = reliabilityCases.filter((item) =>
    (!options.caseId || item.id === options.caseId) &&
    (!options.category || item.category === options.category));
  if (options.maxCases != null) selected = selected.slice(0, options.maxCases);
  if (!selected.length) throw new Error("No reliability cases matched the supplied filters.");
  const runs: BenchmarkRun[] = [];
  try {
    for (let repetition = 1; repetition <= options.repetitions; repetition += 1) {
      for (const benchmarkCase of selected) {
        process.stdout.write(`[${runs.length + 1}/${selected.length * options.repetitions}] ${benchmarkCase.id} repetition ${repetition}\n`);
        const run = await openAIResponsesAdapter.runCase(benchmarkCase, {
          model: options.model,
          reasoningEffort: options.reasoning,
          repetition,
        });
        runs.push(run);
        await mkdir(dirname(resolve(options.output)), { recursive: true });
        await writeFile(options.output, `${JSON.stringify(runs, null, 2)}\n`, "utf8");
      }
    }
    const report = await writeBenchmarkReport(runs, options.reportJson, options.reportMarkdown);
    const relativeFailures = await compareBaseline(report, options.baseline);
    if (relativeFailures.length) {
      report.severeFailures.push(...relativeFailures);
      await writeFile(options.reportJson, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    }
    process.stdout.write(`Report: ${options.reportMarkdown}\n`);
    if (report.severeFailures.length) process.exitCode = 1;
  } finally {
    disposeDom();
  }
}

void main();
