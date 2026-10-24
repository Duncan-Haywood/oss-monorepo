# Low-communication training: which of sync interval, compression, delay, momentum and robust aggregation sets the final loss?

**Status: open research programme; milestone 1 (harness) done, first smoke result logged.** This directory is where the work
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
- [`src/lowcomm/`](src/lowcomm): milestone 1 harness, numpy only. A one-block transformer with a hand-written backward pass, a simulated `M`-worker DiLoCo trainer (AdamW or SGD inner, Nesterov or heavy-ball outer) and a synchronous reference. Reuses `noisy-local-sgd`'s exact quadratic floor as a test oracle.
- First result (smoke test, 14k-parameter model, 640 steps, Tiny Shakespeare, 3 seeds, outer step not tuned per `H`): held-out loss against `H` is U-shaped (`H=4` 2.74, `H=16` 2.32, `H=64` 2.51, `H=160` diverges on one seed; synchronous 2.44). It does not test H2; see the LOG for why.

```bash
cd research/lowcomm-training
PYTHONPATH=src python3 -m unittest discover -s tests -v    # 7 tests, about 15 s
PYTHONPATH=src python3 experiments/h_sweep.py              # about 8 min; writes experiments/h_sweep_results.txt
```
Data: Tiny Shakespeare (public domain), fetched from the char-rnn repository on GitHub.

Related labs: none (no lab affiliation is implied); this programme is general ML systems research.
