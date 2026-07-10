import type { BenchmarkCase, BenchmarkRun } from "./types";

export type BenchmarkProviderOptions = {
  model: string;
  reasoningEffort: string;
  repetition: number;
  maxModelTurns?: number;
  maxGridCalls?: number;
  signal?: AbortSignal;
};

export type BenchmarkProviderAdapter = {
  id: string;
  runCase: (
    benchmarkCase: BenchmarkCase,
    options: BenchmarkProviderOptions,
  ) => Promise<BenchmarkRun>;
};
