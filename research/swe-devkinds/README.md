# Which kind of recorded deviation predicts a partial outcome? Tooling failures do (preliminary)

Pure Python standard library. Follows up `swe-deviations`, whose next step was to classify deviations and test whether any kind predicts partial outcomes. Produced with AI assistance (Claude). **Preliminary: observational data, crude keyword classes.**

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/swe-devkinds/

All numbers are from `experiments/results.txt` (1,606 run records, 213 listing at least one deviation).

- **A deviation that is a tooling failure goes with a partial outcome:** within track, those runs end `partial` 22.6 percentage points more often than runs with no deviation (permutation p = 0.001, 24 runs in usable strata, 5,000 shuffles).
- **Skipped steps (+1.3 points, p = 0.67) and switched tasks (+1.3 points, p = 0.63) do not.** Deviating by choice is not what drives the partial rate seen in `swe-deviations`; breakage is.
- **"Other" (unclassified) is +13.3 points (p = 0.008)** on 36 runs; its entries were not read individually, so it is not interpreted.
- Counts (a run can have several kinds): skipped 108, switched 43, other 38, tooling 27.

## Motivation

If the brief asks runs to deviate when it is sensible, the cost of doing so matters. This separates deviations made by choice from deviations forced by a broken tool.

## Method

`src/swe_devkinds/kinds.py` assigns each deviation `why` text the first matching kind from an ordered keyword list (tooling, skipped, switched, else other); the keywords were fixed before outcomes were looked at, but they are crude. For each kind, runs listing that kind are compared with runs listing no deviation, stratified by track (strata need at least 3 runs per arm), with the weighted difference in partial rate and a permutation p-value that shuffles the label inside each stratum.

```bash
cd research/swe-devkinds
PYTHONPATH=src python3 -m unittest discover -s tests -v    # 6 tests
python3 experiments/run.py > experiments/results.txt       # seconds; reads ../../prompts/runs/*.json
```

## Limitations

- Keyword rules misclassify; a "failed" in a skipped-step explanation is called tooling (first rule wins). No hand-labelled sample was used to measure accuracy.
- A partial outcome may itself cause a tooling note ("push failed" is both), so the direction is not established.
- Observational; no adjustment for task difficulty or regime (cost tooling began 16 October). Four kinds were tested with no multiplicity correction.
- Self-reported records, read as of the checkout date.

## Next steps

Hand-label a random sample of 50 deviations to measure classifier accuracy, and test whether tooling-failure runs also cost more.

## Owner steps

None.

## Outside dependencies

None (standard library only). No language-model classifier was used.

MIT.
