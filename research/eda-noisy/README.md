# eda-noisy: how much error in a cheap objective can design-search proposers tolerate before they stop beating random search? (track 7)

Why it seemed worth doing: `eda-proposers` and `eda-refpoint` assumed every search query returns the true objectives. In a fidelity ladder (`eda-fidelity`) the cheap rungs are biased, and a search that only sees them is optimising the wrong numbers. `eda-refpoint` listed "a noisy space" as its next step; this runs it. Produced with AI assistance (Claude). **Stylised and preliminary:** one 80-design accelerator table, synthetic Gaussian error (not measured from any tool), generic-gate cell counts, no place and route.

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/eda-noisy/

**Builds on.** `research/eda-proposers` (table, six proposers and runner, imported unchanged) and `research/eda-refpoint` (the scoring convention: hypervolume ratio at reference 1.1 on min-max scaled objectives). Multi-fidelity search background: Peherstorfer, Willcox and Gunzburger (2018), *SIAM Review* (cited from memory, not re-read). No CU Boulder lab's work is built on.

## Method
Each proposer queries a view of the table whose three scaled objectives (cells, cycles, error) each carry an error drawn from N(0, sigma), fixed per design within a run (re-querying gives the same value, as a deterministic cheap model would). The found set is then scored on the *true* objectives. Sigma is in scaled units, where each objective spans 1.0 over the table: 0, 0.05, 0.1, 0.2, 0.4, 0.8. 100 seeds, budgets 16 and 30. Random search ignores objective values, so it is the same set of designs at every sigma; each proposer is compared with random on the same seed (paired).

## Result
- **TPE's lead over random shrinks smoothly with noise and is gone at sigma 0.8.** Budget 30, paired gain over random: +0.037 (sigma 0), +0.032 (0.05), +0.027 (0.1), +0.022 (0.2), +0.013 (0.4), +0.006 (0.8, 95% CI [-0.001, +0.013]). At sigma 0.4, TPE is still better than random on 65% of seeds.
- **NSGA-II and the genetic method lose their lead at about sigma 0.1.** NSGA-II: +0.016 (0), +0.008 (0.05), -0.001 (0.1). The genetic method: +0.012, +0.010, +0.006 with a CI containing 0. Both are indistinguishable from random, or slightly worse, from sigma 0.1 up.
- **Annealing is worse than random at every sigma, including 0** (budget 30: -0.015 at sigma 0; -0.021 to -0.033 with noise), as in `eda-proposers`.
- **At budget 16 only TPE is above random** (+0.026 at sigma 0 to +0.004 at 0.8, CI crossing 0 at 0.8).
- Sigma 0 reproduces `eda-refpoint`'s budget-30 figure (TPE +0.037).

Full tables: `experiments/results.txt`. Figure: `experiments/gain_vs_noise.png`.

## Reproduce
```bash
pip install numpy matplotlib
cd research/eda-noisy
PYTHONPATH=src python -m unittest discover -s tests      # 5 tests
PYTHONPATH=src python experiments/run.py                 # about 1 minute; writes experiments/results.txt
python experiments/figure.py
```

## Limitations
- The error is independent Gaussian noise per objective and design. Real cheap rungs have structured error (a cost model is biased in the same direction for similar designs), so this is only a first, optimistic probe.
- One 80-design table and five untuned proposers; the true front has 12 points. Nothing here says how large real rung error is: that needs `eda-fidelity`-style measurements.
- Proposers here are given a fixed budget of noisy queries and never re-measure a design on the true rung, which is what a multi-fidelity search would do.
- Cell counts are Yosys generic-gate counts (version 0.33), not area; nothing here is a claim about silicon.

## Next steps
Replace the synthetic error with the measured disagreement between `eda-fidelity`'s rungs; let each proposer spend part of its budget re-checking its picks on the true rung.

## Owner steps
None.

## Outside dependencies
None to run (NumPy; matplotlib for the figure). Needs `research/eda-proposers` in the tree. All code original, MIT.
