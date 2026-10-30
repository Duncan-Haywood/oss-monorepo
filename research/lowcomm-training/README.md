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
- Longer budget (Milestone 3b): at 3,840 inner steps per worker the same sweep shrinks the gap to synchronous AdamW to +0.004 nats at `H=4`, +0.034 at `H=16` and +0.017 at `H=64` (sync 1.599), about 4 times smaller than at 960 steps, so most of 3a's gap was a short-budget effect. Three seeds, inner lr not re-tuned. See the LOG, "Milestone 3b". Run: `cd experiments/gpt_long_budget && PYTHONPATH=../../src python3 long_budget.py` (about 40 minutes on 4 cores, needs torch).
- Re-tuned lr (Milestone 3c): tuning the inner lr at 3,840 steps (grid 3e-4, 1e-3, 3e-3; two tuning seeds) picks 1e-3 for both `H=16` and `H=64`. `H=16` then matches synchronous AdamW (gap -0.002 nats, three seeds, within noise) and beats `H=64` (+0.017), so 3b's inversion was a stale learning rate. Sync and `H=4` were not re-tuned. See the LOG, "Milestone 3c". Run: `cd experiments/gpt_retune && PYTHONPATH=../../src python3 retune.py tune && python3 retune.py report` (about 1 hour on 4 cores, needs torch).
- Fair re-tune of every method (Milestone 3d, after 3c): at 3,840 steps every `H` picks 2e-3. The gaps to synchronous AdamW (1.5897) become -0.007 at `H=4`, -0.014 at `H=16` and +0.005 at `H=64` nats, and `H=16` beats `H=64` on every seed, so 3c's finding holds with sync and `H=4` also re-tuned (sync gains too: 1.5994 to 1.5897) came from stale learning rates. 3 seeds, one shared 3-point grid: the sign of the `H=16` gain is suggestive only. Run: `cd experiments/gpt_retune_all && python3 retune.py tune && python3 retune.py report` (about 2 hours on 4 cores, needs torch).
- More seeds (Milestone 3e): over 11 paired seeds at 3d's settings, `H=16` beats synchronous AdamW by 0.012 nats (95% interval [-0.021, -0.004], better on 10 of 11 seeds, paired t p = 0.011), so 3d's sign was real under a shared lr 2e-3; whether sync is under-tuned is open. Run: `cd experiments/gpt_seeds && PYTHONPATH=../../src python3 seeds.py run && python3 seeds.py report` (about 45 minutes on 4 cores, needs torch and scipy).
- Compression (Milestone 4a, hypothesis H3 on the real GPT): unbiased random sparsification of each worker's delta at `H=16`, `M=4`, 3 seeds. Mean excess loss over uncompressed (1.5758) is +0.006, +0.017, +0.042, +0.083 nats at keep fractions 1/2, 1/4, 1/8, 1/16: linear in 1+omega (R² 0.999, log-log slope 1.26, inside H3's [0.6, 1.4]). No quantisation, error feedback or outer-lr variation yet; bytes-versus-loss is not tested. See the LOG, "Milestone 4a". Run: `cd experiments/gpt_compression && OMP_NUM_THREADS=1 python3 compression.py run && python3 compression.py report` (about 45 minutes on 4 cores, needs torch).
- Top-k and error feedback (Milestone 4b): biased per-tensor top-k of each worker's delta, `H=16`, `M=4`, 3 seeds. At keep 1/16 plain top-k costs +0.064 nats and rand-k +0.083, but top-k with error feedback is at -0.005 (uncompressed loss within seed noise) on all 3 seeds; at keep 1/4 EF top-k is also -0.005. Bytes are not modelled. See the LOG, "Milestone 4b". Run: `cd experiments/gpt_topk_ef && OMP_NUM_THREADS=1 python3 topk_ef.py run && python3 topk_ef.py report` (about 25 minutes on 4 cores, needs torch).
- Where error feedback breaks (Milestone 4c): EF top-k at keep 1/64 costs +0.043 nats and at 1/256 +0.121 (3 seeds, `H=16`, `M=4`), against -0.005 at 1/16 (4b); the pre-registered claim that 1/64 stays within 0.02 was refuted. Run: `cd experiments/gpt_topk_ef_low && python3 topk_ef_low.py run && python3 topk_ef_low.py report`.
