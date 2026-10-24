# Do agent runs that record a deviation from the brief cost more or end worse? 203 of 1,564 run records (preliminary)

Pure Python standard library. A new question for track 10 (the software-engineering loop), not a variation of an earlier result: `prompt.md` asks every run to list the instructions it chose not to follow (`deviations`) and the review track uses them to improve the brief. If deviating is costly or tends to end in a partial outcome, the brief should say so; if it is free, the brief can invite more of it. `swe-fieldfill` counted how often the field is filled (12.6%); this project asks what the filled records look like. Produced with AI assistance (Claude). **Preliminary: nineteen days of observational data, no randomisation.**

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/swe-deviations/

All numbers are from `experiments/results.txt` (1,564 records dated 2026-10-01 to 2026-10-20; 203 list at least one deviation).

- **Who deviates depends almost entirely on track:** review 58.8% (30 of 51), ventures 26.6% (118 of 444), process 6.5%, explore 6.3%, research 5.0% (36 of 713), red team 3.2%. Any pooled comparison must be made within track.
- **Within track and recording regime, runs that list a deviation cost about 1.2 times as much and take about 1.6 times as long** (median cost ratio 1.22, wall-time ratio 1.56; stratified permutation p < 0.001 for both, 5,000 shuffles). Most strata differ by far less than that: ventures cost $0.65 against $0.64 median, research $0.97 against $0.83.
- **The cost gap rests largely on the `process` track.** Its 7 deviating runs with a cost have a median of $3.69 against $0.43 for 89 others (34.8 against 1.4 minutes). Without `process` the pooled cost ratio falls to 1.07 (p = 0.052); the wall-time ratio stays at 1.30 (p = 0.014). Without `ventures` it rises to 1.51. So: deviation goes with longer runs, and with more cost mainly where the run is already a long process-improvement job.
- **Deviating runs end `partial` slightly more often:** pooled difference +5.2 percentage points (p = 0.018), e.g. ventures late 15 of 103 against 22 of 283. Research shows 0 of 35 partial among deviating runs against 1 of 365.

## Motivation

A deviation record is the brief's feedback channel (`prompts/steering.md`). Whether deviating costs anything decides how hard the brief should push for or against it.

## Method

`experiments/run.py` reads every `prompts/runs/*.json` with a `date` and an `outcome`. A run "deviates" when `deviations` is a non-empty list. Because cost, wall time and tool calls were not recorded before 16 October (`swe-fieldfill`), records are stratified by track and by early/late regime; only strata with at least 3 records in each arm are used. The pooled statistic is a weighted mean over strata (weight: the smaller arm's size) of log(median with / median without). The p-value shuffles the deviation label inside each stratum 5,000 times (seeded, deterministic). Section D drops one track at a time. The partial-outcome comparison uses the same scheme on the share of `outcome: partial`.

```bash
cd research/swe-deviations
PYTHONPATH=src python3 -m unittest discover -s tests -v    # 8 tests, under a second
python3 experiments/run.py > experiments/results.txt       # a few seconds; reads ../../prompts/runs/*.json
```

## Limitations

- **Observational.** Longer, harder runs have more occasion to deviate. The data cannot say that deviating causes the extra time.
- **Self-reported.** An empty `deviations` list can mean none, or an unexamined run (`swe-fieldfill`).
- **Few runs behind the cost gap.** Several strata have under 10 deviating runs with a cost, and permutation p-values do not repair confounding by task difficulty.
- **Records change after merge**, and this reads the checkout as of 2026-10-20.
- Deviation count and kind are not used, only presence.

## Next steps

Classify deviations (skipped a gate, chose a different task, tooling failure) and test whether any kind predicts partial outcomes; add the task-difficulty proxy `tool_calls` as a covariate.

## Owner steps

None.

## Outside dependencies

None (standard library only). No language-model proposer was used.

MIT.
