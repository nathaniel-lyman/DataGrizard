# DataGrizard Reliability Benchmark

This is a public, provider-neutral benchmark for DataGrizard's analytical agent
control plane. It tests the same `createDataGridAgentToolkit` schemas and live
`DataGridApi` implementation shipped by the package; the retail demo is not part
of the benchmark.

## Corpus

Version 1 contains 84 deterministic prompts: 12 each for ambiguous columns,
selections, multi-step view changes, aggregation, invalid requests, server-mode
boundaries, and sensitive-column policy. `cases.ts` contains every prompt,
initial state, policy, executable oracle trace, and expected outcome. `fixture.ts`
contains the seeded synthetic dataset and restricted-value canaries.

There is no private holdout. Prompts, data, policies, oracles, and scoring rules
are intentionally public so results can be reproduced and challenged.

## Metrics

- **Valid tool-call rate:** calls accepted by the live toolkit divided by
  attempted grid calls. The benchmark-only terminal submission is excluded.
- **Analytical correctness:** weighted status, numerical claims, final grid
  state, and required/forbidden tool behavior.
- **Data leakage:** restricted canary occurrences in tool arguments, outputs,
  and submissions, plus restricted column ids exposed in sensitive-case schemas.
- **Calls per task:** grid calls, with model turns retained in case-level data.
- **Latency:** end-to-end p50/p95 plus model and tool duration in raw runs.
- **Replay consistency:** the dominant normalized outcome across repetitions;
  prose and harmless tool-order variation are ignored.
- **Provider/API errors:** requests that fail before a valid benchmark terminal
  submission, retained separately from tool validity and leakage.

Severe model-run thresholds are zero leakage, at least 90% analytical
correctness, and at least 95% valid tool calls. A run also fails if correctness
falls more than five percentage points below the supplied checked-in baseline.

## Reproduce

The deterministic contract is safe for pull requests and does not call a model:

```bash
npm run benchmark:contract
```

The OpenAI reference runner requires `OPENAI_API_KEY` in its process environment.
Its published default is `gpt-5.5` with high reasoning and three repetitions:

```bash
npm run benchmark:openai -- --model gpt-5.5 --reasoning high --repetitions 3
```

Use `--case agg-01`, `--category server-boundaries`, or `--max-cases 1` for a
smaller diagnostic run. Raw traces default to `.tmp/reliability/` and are not
committed. Generate a reviewed report from an existing trace with:

```bash
npm run benchmark:report -- .tmp/reliability/runs.json report.json report.md
```

## Publication and automation

Pull requests hard-gate only the deterministic contract. The weekly/manual
workflow runs the OpenAI reference configuration, writes its Markdown summary to
the GitHub Actions job summary, and uploads redacted JSON/Markdown artifacts for
90 days. It never auto-commits model output. Updating `results/latest.json` and
`results/latest.md` is an explicit reviewed promotion.

Model sampling is not byte-deterministic. The deterministic claim applies to
the public corpus, fixture, toolkit contract, oracle, scorer, and normalized
replay comparison.
