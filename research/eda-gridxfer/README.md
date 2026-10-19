# eda-gridxfer: does a space-filling grid order beat the harness's lexicographic order on other chip-design families, or was that luck of one table? (follow-up to `eda-gridorder`, track 7)

Why it seemed worth doing: `eda-gridorder` found the harness's lexicographic grid far behind a random order and Halton or farthest-point orders far ahead, on **one** 80-design table, and said so: the deterministic orders are single draws, so a second design family was needed to see whether the result is about the orders or about where that table's front sat. This project replays the same orders on two families that already have measured cells and cycles (`eda-surrogate`'s MAC and FIR generators), and ships the order as an option in `eda-harness`. Produced with AI assistance (Claude). **Stylised and preliminary:** two 36-design families, two objectives (Yosys generic cells, analytic cycles), no accuracy axis, no place and route.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/eda-gridxfer/

**Builds on.** `research/eda-gridorder` (the orders and the first table), `research/eda-proposers` (exact hypervolume and the metric), `research/eda-surrogate` (the MAC and FIR designs and their measured cell counts, reused unchanged), `research/eda-harness` (gains the option). No CU Boulder lab's work is built on and no affiliation is implied.

## Question and headline
Does the order a grid proposer walks a design space change how fast it finds the cells-versus-cycles Pareto front, and does the answer carry across families? **The lexicographic order is not reliably bad; it is arbitrary.** It was the worst order on the MAC family (90% of the front's hypervolume after 25 evaluations, against 3 to 4 for the others) and the *best* on the FIR family (4 evaluations, against 5 to 9). Farthest-point was ahead of random from 4 evaluations on MAC and from 6 on FIR (0.988 against 0.857 at budget 6), but it was the lowest of all orders at budget 4 on FIR (0.697), so no order here wins everywhere.

## Method
- Data: `eda-surrogate/experiments/dataset.jsonl`, families `mac` (lanes `p` × width `w`, 6 × 6 designs) and `fir` (`taps` × `lanes` × `w`, 4 × 3 × 3). Objectives: Yosys cell count and the analytic cycle count for a fixed workload, both minimised, scaled to [0, 1] within the family. No synthesis is run here.
- Orders, metric and bootstrap interval are `eda-gridorder`'s (imported, not copied): lexicographic, Halton, farthest-point (centre start and random start), Latin batches, random. Metric: hypervolume of the found front over that of the true front, reference (1.1, 1.1), after B distinct designs. Deterministic orders are one run; stochastic ones 300 seeds with a 95% bootstrap interval.
- Harness: `eda_harness.GridProposer(space, order="farthest")` walks the same greedy maximin order (centre-most start). The default stays lexicographic.

## Reproduce
```bash
cd research/eda-gridxfer
python3 -m unittest discover -s tests          # 5 tests, stdlib only
python3 experiments/run.py                     # a few seconds; writes experiments/results.txt
python3 experiments/figure.py                  # writes experiments/figure_mac.svg, figure_fir.svg
cd ../eda-harness && PYTHONPATH=src:../chip-accel/src python3 -m pytest tests   # needs numpy, yosys, iverilog; about 2 minutes
```

## Results (`experiments/results.txt`; figures `experiments/figure_mac.svg`, `figure_fir.svg`)
Fraction of the true-front hypervolume found (mean for stochastic orders):

| family | budget | lexicographic | halton | farthest | random |
|---|---|---|---|---|---|
| mac | 4 | 0.093 | 0.922 | 0.942 | 0.877 |
| mac | 8 | 0.617 | 0.961 | 0.976 | 0.946 |
| mac | 16 | 0.779 | 0.994 | 0.989 | 0.982 |
| fir | 4 | 0.926 | 0.805 | 0.697 | 0.809 |
| fir | 8 | 1.000 | 0.929 | 0.988 | 0.886 |
| fir | 16 | 1.000 | 0.959 | 1.000 | 0.947 |

Evaluations to reach 90% / full front (median for random): mac lexicographic 25 / 31, halton 3 / 30, farthest 4 / 29, random 4 / 33; fir lexicographic 4 / 7, halton 8 / 30, farthest 5 / 16, random 9 / 28.

- **Why lexicographic flips.** The MAC front is six designs at the narrowest width and every lane count; lexicographic walks the width axis first within one lane count, so it spends its first six evaluations on one lane count. The FIR front is three designs at taps 4, width 4, and the first design in lexicographic order is already one of them. The order is good when the front sits at the first corner of the leading axis and bad otherwise, which no designer of a generic harness can know.
- **Farthest-point is the robust choice here.** It was ahead of random at 8 and 16 evaluations on both families and on the `eda-gridorder` table, and found FIR's full front in 16 evaluations against 28 for random. At budgets 2 to 4 on FIR it was below random (0.697 against 0.809 at 4), since its first points are corners and the front is at one of them.
- **Halton is mixed.** Best at small budgets on MAC, but on FIR it trails random's mean at budgets 4 and 6 and needs 30 evaluations for the full front, because snapping a low-discrepancy sequence onto a 3-level axis repeats designs.
- **A deterministic order still has no interval.** Each is one draw per family. With three families now (this and `eda-gridorder`) the pattern for lexicographic is "arbitrary", and for farthest-point "ahead of random from about 6 evaluations on all three tables", which is three observations, not a law.

## Limitations
- Two 36-design families with a front of 3 and 6 points; hypervolume steps are coarse, and ties between orders at one budget are not significant.
- Cycles are analytic and independent of width, so width is a dominated axis in both families. A real flow has accuracy or timing coupling that could move the front off the low corner and change which order wins.
- Objectives are generic-gate counts and an analytic cycle count; nothing is said about real chips.
- The `farthest` option is exercised on a toy space in the harness tests; it has not been run through a full synthesis loop.

## Next steps
Run the harness's `farthest` order end to end on `chip-systolic` (needs the full flow, about a minute per design) to confirm the replay matches a live run; add a model-based proposer to the comparison now that three tables exist; try an order that adapts (farthest from evaluated points, weighted toward the best so far).

## Owner steps
None.

## Outside dependencies
None to run the experiment (Python standard library). The harness test needs numpy, Yosys and Icarus Verilog. All code original, MIT.
