# What does an agent run cost, and which runs cost the most? 355 priced runs, 14 to 18 October 2026

Pure Python standard library. A follow-up to `swe-ledger`, which found cost fields in at most 1% of the run log and so reported none. Since then `prompts/runcost.py attach` has filled them in, and 355 of the 968 run records in `prompts/runs/` now carry `cost_usd`. Part of track 10 (the software-engineering loop). Produced with AI assistance (Claude). **Preliminary: five days of data, and the cost is an API-equivalent estimate, not a bill.**

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/swe-runcost/

- **A typical run costs about 68 cents; the 355 together cost $337.** Median $0.68 (95% bootstrap interval $0.64 to $0.72), mean $0.95. All but 12 used one model (`claude-sonnet-5-5`), so no model comparison is possible.
- **Spend is only mildly concentrated.** The top 10% of runs hold 36% of the money and the top four runs 14%. Trimming the tail would not by itself change the bill much.
- **The track mix, not the track, sets the budget.** Research runs are 46% of the runs and 47% of the spend (median $0.82, the highest). Process runs are 14% of the runs but 24% of the spend, with a lower median ($0.51) and a long tail (one run at $19). Red-team runs are the cheapest (median $0.44, interval $0.38 to $0.47, disjoint from research's).
- **Cost grows faster than the work.** On a log-log fit, cost scales with tool calls with exponent 1.18 (interval 1.11 to 1.25), and input tokens with exponent 1.37 (1.30 to 1.42): a run with twice the tool calls reads about 2.6 times the input. This is what a growing conversation context re-read at each step would produce; the data cannot separate that from longer runs also being harder.
- **Wall time is a poor guide.** Cost scales with recorded wall minutes with exponent only 0.36 (0.30 to 0.42), and the median recorded wall time is 3.6 minutes, which is far shorter than a session lasts, so the field probably measures something narrower than elapsed time. Use tool calls.
- **Implied prices.** Least squares of cost on input and output tokens gives $0.24 per million input tokens and $25 per million output tokens. These are effective prices after caching, fitted to the estimator's output, so they check the estimator's arithmetic and say nothing about the real invoice.

```bash
cd research/swe-runcost
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 5 tests, under a second
python3 experiments/run.py > experiments/results.txt      # a few seconds
python3 experiments/figure.py                             # writes experiments/spend_by_track.svg
```

## Motivation

Track 10's metric is valuable, correct work per unit of compute. `swe-ledger` showed the cost term was missing; now it exists for part of the log, so the first questions are the plain ones: what does a run cost, where does the money go, and what should the next run's budget look like?

## Builds on

`swe-ledger` (coverage of the run log). Efron (1979), "Bootstrap methods: another look at the jackknife", *Annals of Statistics* 7(1), for the percentile intervals. No lab's work is built on, and no lab is affiliated with or endorses this project.

## Method

`src/swe_runcost/runcost.py`. `experiments/costs_snapshot.jsonl` holds the cost-bearing fields (date, track, model, `cost_usd`, tokens, wall minutes, tool calls, commits, tests added, project count) of every record in `prompts/runs/` whose `cost_usd` is not null at 2026-10-18, one line per run, copied unchanged. Intervals are 2,000-resample percentile bootstraps over runs, seed 1. Exponents are ordinary least squares slopes of log on log. The price fit solves the two-variable normal equations without an intercept. Tests check each helper against a case with a known answer.

## Limitations

- Cost is `prompts/runcost.py`'s API-equivalent estimate from the transcript, not what was billed; the subscription's real weekly limit is unseen from a sandbox.
- Selection: only runs that followed the cost step are included (355 of 968), and the 12 Opus runs are too few to compare. Runs that skipped it may differ.
- Five days, one model: nothing here shows how cost moves with prompt version or model, and the track medians describe this week's mix.
- Cost is not value. A cheap run that merges nothing is worse than a dear one that ships a product; `swe-value` is the milestone that scores value, and this project does not join the two.
- The exponent reading (context re-read) is an explanation that fits, not one tested here.

## Next steps

Join cost to merged outcome by session (pull request merge state is not in the records, `merged` is mostly null) to get cost per merged project by track; test the context-growth reading by comparing runs that split work into subagents; rerun as history grows and per model.

## Owner steps

None.

## Outside dependencies

None (standard library only), apart from this repository's run records. No language-model proposer was used.

MIT.
