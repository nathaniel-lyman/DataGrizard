import { describe, expect, it } from "vitest";
import { reliabilityCases } from "./cases";
import { runOracleCase } from "./harness";
import { renderReportMarkdown } from "./report";
import { buildReport, scoreRun } from "./score";

describe("public reliability corpus", () => {
  it("contains 84 unique prompts split evenly across the seven public categories", () => {
    expect(reliabilityCases).toHaveLength(84);
    expect(new Set(reliabilityCases.map((item) => item.id)).size).toBe(84);
    expect(new Set(reliabilityCases.map((item) => item.prompt)).size).toBe(84);
    const counts = Object.fromEntries([...new Set(reliabilityCases.map((item) => item.category))]
      .map((category) => [category, reliabilityCases.filter((item) => item.category === category).length]));
    expect(counts).toEqual({
      "ambiguous-columns": 12,
      selections: 12,
      "multi-step-views": 12,
      aggregation: 12,
      "invalid-requests": 12,
      "server-boundaries": 12,
      "sensitive-columns": 12,
    });
  });

  it("executes every deterministic oracle against the mounted DataGrid toolkit", async () => {
    const runs = [];
    for (const benchmarkCase of reliabilityCases) {
      const run = await runOracleCase(benchmarkCase);
      const score = scoreRun(benchmarkCase, run);
      expect(score.failures, `${benchmarkCase.id}: ${JSON.stringify({ state: run.finalState, tools: run.tools })}`).toEqual([]);
      runs.push(run);
    }
    const report = buildReport(reliabilityCases, runs);
    expect(report.caseCount).toBe(84);
    expect(report.metrics.validToolCallRate).toBe(1);
    expect(report.metrics.analyticalCorrectness).toBe(1);
    expect(report.metrics.dataLeakageCount).toBe(0);
    expect(report.metrics.passRate).toBe(1);
    expect(report.severeFailures).toEqual([]);
    expect(renderReportMarkdown(report)).toContain("Valid tool-call rate | 100.0%");
  }, 60_000);
});
