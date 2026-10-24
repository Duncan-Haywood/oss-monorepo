# eda-gridorder: does the order a grid proposer walks a chip-design space matter? (follow-up to `eda-proposers`, track 7)

Why it seemed worth doing: `eda-proposers` found the grid the weakest method at small budgets (0.098 of the true-front hypervolume at 8 evaluations against 0.815 for random) and said "a stride or space-filling grid would do better; this is the order the harness ships." That is a one-line change to the harness default, so this project measures it. Produced with AI assistance (Claude). Stylised and preliminary: one 80-design table of one toy accelerator family, nothing new simulated (the table is `eda-proposers`' committed log; this runs on stdlib Python alone).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/eda-gridorder/

**Builds on.** `research/eda-proposers` (the 80-design table, the exact hypervolume code and the metric), `research/eda-harness` (whose lexicographic `GridProposer` is the baseline), `research/chip-accel`. No CU Boulder lab's work is built on and no affiliation is implied.

## Question and headline
If a search must walk a full grid anyway, in what order should it visit the points? On this table the harness's lexicographic order is far behind a random order up to 30 evaluations and needs 75 evaluations to find the whole front, while a space-filling order (Halton, or greedy farthest-point from the centre) reaches 90% of the true-front hypervolume in 7 to 15 evaluations against about 17 for random. The ranking among space-filling orders is not established by one table (see Limitations).

## Method
Orders (`src/eda_gridorder/orders.py`), each a full permutation of the 80 designs:
- `lexicographic`: sorted index tuples, the harness default.
- `halton`: the Halton sequence (bases 2, 3, 5) scaled onto the index grid; repeats skipped, leftovers appended in lexicographic order.
- `farthest`: greedy maximin on range-normalised L1 distance, starting at the centre-most design. `farthest-rand-start` is the same with a random first design.
- `latin`: batches of 8 designs that each use every level of every axis about once.
- `random`: a uniform shuffle.

Metric and budget are `eda-proposers`': the hypervolume of the found non-dominated set over that of the true front (12 of 80 designs; reference 1.1 on each normalised objective), at B distinct designs. Deterministic orders are one run. Stochastic orders use 300 seeds with 95% bootstrap intervals.

## Reproduce
```bash
cd research/eda-gridorder
python3 -m unittest discover -s tests          # 7 tests, under 1 s, stdlib only
python3 experiments/run.py                     # about 7 s; writes experiments/results.txt
python3 experiments/figure.py                  # writes experiments/figure.svg
```

## Results (from `experiments/results.txt`; figure `experiments/figure.svg`)
Mean fraction of the true-front hypervolume found:

| budget | lexicographic | halton | farthest | farthest, random start | latin | random |
|---|---|---|---|---|---|---|
| 4 | 0.060 | 0.748 | 0.889 | 0.663 | 0.734 | 0.690 |
| 8 | 0.098 | 0.926 | 0.891 | 0.822 | 0.850 | 0.808 |
| 16 | 0.664 | 0.942 | 0.912 | 0.911 | 0.910 | 0.893 |
| 30 | 0.749 | 0.955 | 0.980 | 0.957 | 0.949 | 0.945 |
| 40 | 0.926 | 0.955 | 0.984 | 0.967 | 0.965 | 0.965 |

- **Lexicographic is the clear loser**: worse than all 300 random orders at every budget to 30 (rank 0.00 in `results.txt`), and 75 evaluations to find the full front where random needs 76 and farthest-point 47. It walks `p = 1` first and the front lives mostly at larger `p`.
- **Space-filling orders mostly beat random for the first ~20 evaluations**: at budget 8, Halton 0.926 against random 0.808 [0.799, 0.816]; the random-start farthest-point and Latin orders gain +0.014 and +0.042, intervals just above random's (but at budget 4 random-start farthest-point is below random, 0.663 against 0.690). The median evaluations to reach 90% of the front: Halton 7, farthest 15, farthest (random start) 15, Latin 15, random 17.
- **Later the gain fades**: by budget 40 random, Latin and random-start farthest-point are within 0.002, and Halton (0.955) has fallen behind random (0.965) after stalling at its last front point until evaluation 75.
- **The deterministic leaders are single draws.** Halton at budget 8 beats 98% of random orders and farthest-point at budget 4 beats 99%, but each is one fixed ordering on one table; the same ordering could as easily have missed. The random-start farthest-point, whose spread over starts is measured, is the fairer estimate of what a space-filling design buys: about +0.01 to +0.04 over random from budget 8 to 20, nothing by 40.

## Limitations
- **One small, structured table.** Eighty designs on three axes; a front that is entirely `abc -g` with wb 4 to 6 and p in {1, 2, 4, 8}. Whether Halton or farthest-point leads depends on where that front sits relative to the sequence's early points, which this table cannot separate from luck.
- **Deterministic orders have no interval.** Re-running them changes nothing, so their advantage over random is one data point each. A second design family or relabelled axes would be needed to test it.
- **Not a stand-in for a model-based search.** `eda-proposers` found TPE, NSGA-II and the GA ahead of random from 16 evaluations; this project does not compare against them and only fixes the baseline the harness ships.
- Objectives are generic-gate counts, cycles and held-out error of a toy network. Nothing is said about real chips or sign-off numbers.

## Next steps
Offer a `halton` or `farthest` order in `eda-harness` alongside the lexicographic default, and repeat on a second design family (`chip-systolic`) so the deterministic orders can be scored on more than one table.

## Owner steps
None.

## Outside dependencies
None. Python standard library only; the table was produced with Yosys 0.33 in `eda-proposers` and is reused unchanged. All code original, MIT.
