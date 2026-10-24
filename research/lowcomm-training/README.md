# Low-communication training: which of sync interval, compression, delay, momentum and robust aggregation sets the final loss?

**Status: open research programme, milestone 1 done.** The harness (`src/lowcomm/`, `tests/`, `experiments/m1_check.py`) reproduces the synchronous loop exactly at `M = 1, H = 1` and the `noisy-local-sgd` closed form on a quadratic (ratio 0.983, 95% CI containing it). No result about the research question yet. This directory is where the work
toward one publishable paper accumulates across sessions (see [`PROPOSAL.md`](PROPOSAL.md)).

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/lowcomm-training/

**The question.** DiLoCo-style local SGD trains a language model across workers that synchronise only
every `H` steps. The sync interval, a compressor, a delayed or momentum-based outer update and a robust
aggregator each change the final loss. Can a model with a few measured constants per model size predict
the loss of a configuration never run, from the structure of the algorithm, as well as an empirical
scaling law refitted on the same runs?

**Why it is open.** Theory bounds local SGD on convex problems with constants nobody measures; empirical
scaling laws (Charles et al., 2025) fit size, workers and `H` but do not explain the cost of each axis.
About a dozen projects here derive the stationary loss and stability limit of each axis on a quadratic
(`noisy-local-sgd`, `compressed-outer`, `delayed-outer`, `outer-momentum`, `robust-outer` and others). Whether those
factors hold on a trained transformer, and whether they compose, is untested.

- [`PROPOSAL.md`](PROPOSAL.md): question, 16 related works, gap, hypotheses H1 to H6, method, evaluation,
  milestones and target venue. Citations are not yet machine-checked (registries returned 403).
- [`LOG.md`](LOG.md): research log.

Related labs: none (no lab affiliation is implied); this programme is general ML systems research.

```bash
cd research/lowcomm-training
PYTHONPATH=src python3 -m pytest tests -q          # 6 tests, about 40 s, needs torch
PYTHONPATH=src python3 experiments/m1_check.py     # about 4 min, writes experiments/results.txt
```

- First loss-against-`H` smoke sweep (numpy harness, 14k parameters, 3 seeds, outer step untuned): U-shaped, `H=16` 2.32, `H=4` 2.74, `H=160` diverges on one seed; synchronous 2.44. It does not test H2. See [`experiments/numpy_h_sweep/`](experiments/numpy_h_sweep) and the LOG. Run: `cd experiments/numpy_h_sweep && PYTHONPATH=. python3 h_sweep.py` (about 8 min; tests in `tests/` need numpy only).
- Same sweep with the outer optimiser tuned per `H` (grid of 9, tuned on one held-out half, reported on the other, 5 seeds): `H=1` 2.342, `H=4` 2.348, `H=16` 2.274, `H=64` 2.410, `H=160` 2.481, synchronous 2.383. Tuning removes most of the small-`H` penalty and the divergence, but `H=4` stays 0.075 above `H=16` (Welch t = 4.3), so the weak form of H2 still fails as stated; the lr grid tops out at 1.0, which binds for three of the five `H`. See the LOG, "Milestone 2a".
- Inner lr tuned per `H` (grid 1e-3 to 3e-2) with the outer step set to plain averaging, 5 seeds: synchronous 2.159, `H=1` 2.149, `H=4` 2.167, `H=16` 2.183, `H=64` 2.210, `H=160` 2.218. The U-shape and the "DiLoCo beats synchronous" readings of the earlier sweeps disappear: loss rises gently with `H`, and `H<=16` is within 2 sd of synchronous (`H=16` narrowly). `H<=16` picks sit at the grid edge. See the LOG, "Milestone 2e".
- Inner lr 0.1 added to the grid (it loses at every `H`, so the edge picks were real optima) and outer momentum put back on top of the tuned inner lr: it hurts. At `H=160`, plain averaging 2.218, outer (1, 0.5) 2.269, the DiLoCo-paper setting (0.7, 0.9) 2.486 ± 0.07, against synchronous 2.159. Tiny, under-trained model, three outer settings only; not a statement about scale. See the LOG, "Milestone 2f". Run: `cd experiments/numpy_h_sweep && OMP_NUM_THREADS=1 python3 outer_momentum_sweep.py` (about 17 min on 4 cores).
- First result on the real transformer (413k-parameter GPT, Tiny Shakespeare, `M = 4`, 960 inner steps per worker, plain averaging, inner lr tuned per `H`): the gap to synchronous AdamW is already +0.08 nats at `H=4` and +0.14 at `H=16`, reaching +0.155 at `H=240` (sync 1.798). That is 2.5 times the numpy model's gap and rises earlier, then flattens. Three report seeds, one size and a short budget. See the LOG, "Milestone 3a". Run: `cd experiments/gpt_h_sweep && PYTHONPATH=../../src python3 h_sweep.py tune`, then `report` and `analyse.py` (about 75 minutes on 4 cores, needs torch).
