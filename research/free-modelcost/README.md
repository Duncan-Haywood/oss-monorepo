# Does an Opus agent run cost more than a Sonnet run on the same kind of work? About 8x the cost, 3.2x the tool calls, about 1.9x per self-estimated human hour (preliminary, corrected 2026-11-12)

> **Correction (2026-11-12, quality audit round 48,
> [`portfolio/quality/audits/2026-11-12-free-modelcost.json`](../../portfolio/quality/audits/2026-11-12-free-modelcost.json)).**
> The costs below came from `prompts/pricing.json`, which priced Sonnet 5.5 cache reads at
> $0.20 per million tokens. Anthropic's pricing page lists $0.10 (cache hits on Opus 5.5 and
> Sonnet 5.5 are 0.05x base input, so Opus is $0.20 and Sonnet $0.10). The recorded Sonnet
> costs are therefore too high and every cost ratio here too low. Re-pricing each run from its
> recorded token counts (same strata, same estimator, runs dated up to 2026-10-21, 46 Opus and
> 1,002 Sonnet records as the log now stands) gives: **cost 8.45x (95% CI 6.37-10.64)**, cost per
> tool call 2.70x (2.41-2.97), **cost per self-estimated human hour 1.91x (1.50-2.38)**. The same
> script at the old $0.20 price gives 6.53x, 2.05x and 1.44x, close to the table below, so the
> price row is the cause. The tool-call, time, cache-read and human-hour rows are unaffected.
> The sentence "cache reads cost the same (0.20)" in the Reading paragraph is wrong for the same
> reason, and the 86% from `swe-cachecost` is cache reads plus writes, not reads alone (reads
> are about 0.46 of cost at the old price, 0.30 at the correct one). The table and
> `experiments/results.txt` are kept as published so the correction can be checked;
> `experiments/run.py` still reads the live log with no date cutoff and the stored `cost_usd`,
> so rerunning it does not reproduce either set of numbers. Fixing that (a date cutoff and
> re-pricing from tokens) is the next step.

**Live page:** https://marisstella.app/research/free-modelcost/

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

Reading: an Opus run is longer (more calls, more time) and each call is about twice as expensive. List prices for input, output and cache writes are exactly 2x (`pricing.json`: Opus 4/20 vs Sonnet 2/10 USD per million) but cache reads cost the same (0.20) [wrong: see the correction above], and cache reads dominate cost (`swe-cachecost`: 86%) [that figure is reads plus writes]. So the 2.0x per call is not a price effect alone: Opus calls also carry 1.9x more cached context. Per unit of the work each run claims to replace, Opus is dearer by 1.1-1.7x, much less than the 6x per run. The agent reported more human-equivalent hours for Opus runs, but that estimate is the agent's own (`low` certainty in the run records), so this last row says Opus runs took on larger tasks, or described them as larger; it does not show they were more productive.

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
