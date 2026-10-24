# Does an Opus agent run cost more than a Sonnet run on the same kind of work? 6.3x the cost, 3.2x the tool calls, 1.4x per self-estimated human hour (preliminary)

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/free-modelcost/

Pure Python standard library. A free-choice project (the `swe-*` runs described cost by track and by tool calls but never split it by model). Why it seemed worth doing: the run log now holds 46 Opus and 958 Sonnet runs, and the owner picks the model per routine, so "what does the bigger model cost?" has a measurable answer. Builds on none of the labs in `prompts/research/prompt-0.md`. Produced with AI assistance (Claude).

## Question and method

`prompts/runs/*.json` records, for 1,004 runs by `claude-sonnet-5-5` or `claude-opus-5-5`, the API-equivalent cost (`prompts/runcost.py`, list prices from `prompts/pricing.json`, as of 2026-10-06), tool calls, wall minutes, cache-read tokens and the agent's own estimate of the human hours the run replaces.

Pooled medians would mix model with task: Opus runs are concentrated on 2026-10-20 and in the `process` track. So each comparison is made **inside strata of (date, track)** that contain both models (11 strata). Per stratum: log of the ratio of medians (Opus over Sonnet). The pooled estimate is the mean over strata weighted by the smaller group's size. The 95% interval is a bootstrap (2,000 resamples of runs within each group of each stratum, seed 1).

## Results (`experiments/results.txt`, figure `experiments/ratios.svg`)

| metric | pooled medians, Opus / Sonnet | matched ratio (95% CI) |
|---|---|---|
| cost, USD | 3.75 / 0.67 | **6.31x** (4.69-8.01) |
| tool calls | 61.5 / 22 | 3.15x (2.39-3.90) |
| wall minutes | 19.5 / 3.2 | 6.32x (4.22-9.17) |
| cost per tool call | 0.06 / 0.03 | 2.00x (1.79-2.19) |
| cache-read tokens per call | 119k / 69k | 1.91x (1.65-2.36) |
| self-estimated human hours | 7 / 3 | 3.62x (3.03-5.23) |
| cost per self-estimated human hour | 0.54 / 0.31 | **1.43x** (1.11-1.72) |

Reading: an Opus run is longer (more calls, more time) and each call is about twice as expensive. List prices for input, output and cache writes are exactly 2x (`pricing.json`: Opus 4/20 vs Sonnet 2/10 USD per million) but cache reads cost the same (0.20), and cache reads dominate cost (`swe-cachecost`: 86%). So the 2.0x per call is not a price effect alone: Opus calls also carry 1.9x more cached context. Per unit of the work each run claims to replace, Opus is dearer by 1.1-1.7x, much less than the 6x per run. The agent reported more human-equivalent hours for Opus runs, but that estimate is the agent's own (`low` certainty in the run records), so this last row says Opus runs took on larger tasks, or described them as larger; it does not show they were more productive.

Tests (`tests/`) check the stratified estimator against a hand-computed geometric mean (4 and 9 give 6) and show that it removes a planted confound (pooled medians say 10x, matched says 2x).

## Limitations

- Preliminary: 46 Opus runs, six days, 11 strata; only 44 Opus runs have a stratum with a Sonnet counterpart.
- Not randomised. Within a (date, track) stratum the owner's routines may still give Opus harder tasks, so the ratios are associations. A trial would alternate models on the same prompt.
- Costs are API-equivalent list-price figures, not charges (runs are billed under a subscription), and records from a resumed session can undercount.
- Quality is not measured here: all but a few runs record `outcome: success`, so no model-quality claim follows.

## Reproduce

```
python3 -m unittest discover -s research/free-modelcost/tests
python3 research/free-modelcost/experiments/run.py
python3 research/free-modelcost/experiments/figure.py
```

## Next steps

- Re-run as Opus runs accumulate; with 200 the intervals roughly halve.
- Add tests-added and PRs merged per dollar as outcome measures, once enough runs record them.
- An alternating-model trial on identical prompts would remove the task-mix caveat.

## Outside dependencies

Run records written by `prompts/runcost.py` from Claude Code transcripts; list prices in `prompts/pricing.json`.
