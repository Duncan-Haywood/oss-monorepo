# How much of the track-allocation gain is luck of the history? Block-bootstrap intervals for the sequential replay (preliminary, stylised)

Pure Python, no dependencies. A follow-up to `swe-decay` (track 10, the software-engineering loop, in `PROJECTS.md`), taking its "Next steps" item to resample the history order. `swe-decay`'s intervals covered only the policies' own randomness, and greedy's was zero-width. Here each track's ordered project sequence is resampled in circular blocks, the replay is repeated on 200 resampled histories, and the spread of *policy minus uniform* across histories is the interval. All numbers come from `experiments/results.txt`. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/swe-bootstrap/

## Question

Does greedy or Thompson allocation still beat the uniform track draw once the uncertainty in the project history itself is counted?

## Results

- **Setup.** Same 7 arms, scores (`pass_A`, `pass_B`) and lines-added cost as `swe-decay`. Per history, each track's sequence is rebuilt from random contiguous blocks (length 1, i.e. i.i.d., or 4), same length as the original. 200 histories, 5 policy seeds each, budgets 5,000, 10,000 and 20,000 lines. Intervals are 95% percentile intervals over histories.
- **At 20,000 lines the lead is robust.** Pass A, block 4: greedy +33.4 over uniform (95% 15.0 to 52.6), Thompson +30.8 (14.6 to 50.2), beating uniform in 100% of histories; block 1 is the same (+34.8, +31.0). Pass B, block 4: greedy +26.7 (5.6 to 46.0), Thompson +23.5 (2.0 to 44.4), winning in 99% and 98% of histories. Intervals exclude zero in all eight greedy/Thompson cases.
- **Knapsack-UCB's lead is not.** At 20,000 lines its interval includes zero in every case (pass A block 4: +8.9, −4.2 to +25.0; pass B: +4.7, −8.2 to +23.6), winning in 72% to 93% of histories.
- **At 10,000 lines the sign is likely positive but the interval often touches zero.** Pass A block 4: greedy +12.5 (−1.8 to +24.8), Thompson +10.4 (0.2 to 21.8). Pass B: both intervals include zero.
- **The small-budget loss does not reproduce.** At 5,000 lines the mean difference is about +1 with an interval of roughly −7 to +7, winning in 58% to 66% of histories. `swe-decay`'s loss (24 against 30) came from the one real order in which each track's first, large projects were the forced pulls. Resampling mixes early and late projects within a track, so this result says the loss belongs to the observed order and is not a general property of the policies. It does not show that a real early-history penalty is absent.
- **Block length 1 against 4 changes little**, so short-range order within a track carries little of the policy comparison; the gain comes from differences between tracks.

## Limitations

Resampling within a track destroys the long-range decay `swe-decay` fitted (early projects are not larger or better on average in the bootstrap), so this measures uncertainty about each track's value-per-line distribution, not about its trend. The value scores still agree only weakly (`swe-value`, kappa 0.07), lines are a proxy for cost, tracks with under 6 projects are dropped, there is a single bootstrap design (no stationary or moving-block variants), and no live trial was run. Percentile intervals from 200 histories are themselves noisy at the ends. No policy is adopted.

## Method

`src/swe_bootstrap/boot.py`: `block_resample` (circular blocks), `resample_history`, `paired_diffs` (policy minus uniform per resampled history, averaged over policy seeds, with the hindsight reference per history) and `percentile_ci`. Policies and the replay come unchanged from `swe-decay` and `swe-allocate`. Six unit tests cover resample length and membership, block contiguity, i.i.d. at block 1, the percentile rule, determinism and the sign on two well-separated arms.

## Reproduce

```bash
cd research/swe-bootstrap
python3 -m unittest discover -s tests -v   # 6 tests
python3 experiments/run.py                 # about 7 s; writes experiments/results.txt
```

`experiments/scores.csv` is a copy of `swe-allocate`'s.

## Builds on

`swe-decay` (replay), `swe-allocate` (policies, data), `swe-value` (scores). Efron and Tibshirani (1993), *An Introduction to the Bootstrap*, Chapman & Hall; Künsch (1989), "The jackknife and the bootstrap for general stationary observations", *Annals of Statistics* 17(3); Politis and Romano (1992), "A circular block-resampling procedure for stationary data". No lab's work is built on, and no lab is affiliated with or endorses this project.

## Next steps

Resample whole-run histories while keeping the order trend (for example a residual bootstrap around the fitted decay); add a cheap-prior start to test whether it removes the small-budget loss; replace lines with tokens once the ledger records them.

## Owner steps

None beyond `swe-allocate`'s (decide whether to trial a weighted track draw).

## Outside dependencies

None (standard library only). No language-model proposer was used.

MIT.
