# Does Opus pay for itself on this portfolio's runs? Cost ratio by track, and the sample needed to find out (preliminary)

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/swe-modelmix/

Pure Python standard library. Milestone 8 of track 10 (the software-engineering loop): which model for which kind of task. Produced with AI assistance (Claude). **Preliminary: the ledger holds 12 priced Opus runs against 342 Sonnet runs, so this measures cost, not value, and says how much data a value comparison needs.**

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/swe-modelmix/

- **An Opus run costs about 8 to 9 times a Sonnet run in the same track.** Process: 7.9 (bootstrap 6.7 to 11.7, 8 Opus and 41 Sonnet runs). Research: 9.1 (3.7 to 12.1, only 3 Opus runs). Ventures has one Opus run, too few to interval, and is left out. Numbers are in `experiments/results.txt`.
- **The ledger cannot yet say whether the extra cost buys more.** Projects landed per Sonnet research run has a coefficient of variation of 1.43 (161 runs). Detecting a 50% difference in projects per run needs about 129 runs per arm, and 25% needs about 515. A 9x-priced Opus arm of 129 runs would cost as much as about 1,160 Sonnet runs.
- **Opus and Sonnet runs are not comparable as logged.** Opus runs sit mostly on 2026-10-14 to 16 and in the process track, so model is confounded with date and task. A fair comparison needs the randomised assignment `swe-prompt` describes.

```bash
cd research/swe-modelmix
PYTHONPATH=src python3 -m unittest discover -s tests -v
python3 experiments/run.py > experiments/results.txt
python3 experiments/figure.py   # writes experiments/runs_needed.svg from results.txt
```

## Motivation

Track 10 optimises valuable correct work per unit of the subscription limits. If a stronger model costs 9x a run, it must deliver more than 9x the value per run to win; this project computes the first number and the data needed for the second.

## Builds on

`swe-runcost` (the cost snapshot, copied here as `experiments/costs_snapshot.jsonl`). Sample size uses the normal approximation for a two-sample comparison of means (two-sided 5%, 80% power); the bootstrap follows Efron (1979), *Annals of Statistics* 7(1). No lab's work is built on, and no lab endorses this project.

## Limitations

Median-of-cost ratio, not mean; cost comes from runs' own transcripts. The CV treats projects per run as roughly normal, which it is not (heavy right tail), so the sample sizes are rough. Value is proxied by projects landed, which `swe-value` shows is crude.

## Next steps

Randomly assign model within the research track for a few weeks, then compare projects landed and `swe-audit` defect rate per dollar; reuse the 129-run figure to plan it.

## Owner steps

None.

## Outside dependencies

None beyond the Python standard library. No language-model proposer was used.

MIT.
