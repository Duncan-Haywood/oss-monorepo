# Checkpointing Under Churn: The Exact Interval and the Synchronous Scaling Wall

*Stylised model; MIT licensed. Code: `src/churn_checkpointing`, results: `experiments/results.txt`.*

## Abstract
Decentralised training runs on workers that disappear. Each checkpoint (in a verifiable setting, a committed Merkle root; see `reproducible-refereed-training`) costs time `C`; each failure loses the work since the last one and costs a restart `R`. With Poisson failures at rate `λ` the expected time for a segment of `w` work is exactly `(1/λ+R)(e^{λ(w+C)}−1)`, and the optimal interval is `w* = (1+W₀(−e^{−1−λC}))/λ` with `W₀` the principal Lambert-W branch. It does not depend on `R`. The Young/Daly rule `√(2C/λ)` is its first-order limit and overshoots by 5% at `λC=0.01` and 25% at `λC=0.2`. The optimum is flat: intervals within a factor 2 of `w*` cost at most 3.5% extra. The consequential result concerns scale: a synchronous job on `n` workers restarts at rate `nλ`, so efficiency at the optimal interval falls with `n` and crosses 50% near `n≈700` at `λ=10⁻⁴`, `C=1`. In a heterogeneous pool, admitting flaky workers to a synchronous job cut throughput five-fold. All formulas are checked against Monte Carlo or grid search.

## 1. Model
Failures arrive as a Poisson process of rate `λ`. Work is cut into segments of length `w`, each followed by a checkpoint of length `C`; failures may strike during the checkpoint. On failure the segment restarts from the last checkpoint after a failure-free restart of length `R`. Let `L = w+C`.

**Lemma 1 (exact segment time).** `E[T_seg] = (1/λ + R)(e^{λL} − 1)`.
*Proof.* Conditioning on the first failure time `X ~ Exp(λ)`: `E[T] = P·L + E[(X+R+T); X<L]` with `P = e^{−λL}`, and `E[X; X<L] = 1/λ − (L+1/λ)P`. Solving, `P·E[T] = (1/λ+R)(1−P)`. ∎
Monte Carlo (300k trials, `λ=0.01`, `C=1`, `R=5`): 3.1977 vs 3.1988 (`w=2`), 9.8883 vs 9.8854 (`w=8`), 24.536 vs 24.558 (`w=20`).

## 2. The optimal interval
Minimise the overhead per unit work `f(w) = (1/λ+R)(e^{λ(w+C)}−1)/w`. Setting `f'=0` gives `e^{λ(w+C)}(1−λw) = 1`. With `z = 1−λw` this is `z e^{−z} = e^{−1−λC}`, so `z = −W₀(−e^{−1−λC})` and

`w* = (1 + W₀(−e^{−1−λC}))/λ`.

`R` multiplies `f` and so drops out of the optimum: the checkpoint interval is set by `λC` alone, though `R` still sets the overhead level. For small `λC`, `w* ≈ √(2C/λ)` (Young 1974, Daly 2006); the exact rule is shorter because `e^{λL}` grows faster than its quadratic expansion. E1 (`C=1`): `λ=10⁻⁴, 10⁻³, 10⁻², 0.05, 0.2` give Young/`w*` = 1.005, 1.015, 1.049, 1.114, 1.248; the extra overhead from using Young is under 0.03% until `λC=0.01` and 1.3% at `λC=0.2`, so the practical stake is small, and the exact form matters mostly as a reference.

**Robustness (E2).** Using `a·w*` at `λ=0.01`, `C=1`, `R=5`: overhead ratio 1.147 (`a=¼`), 1.033 (½), 1.003 (0.8), 1.003 (1.25), 1.035 (2), 1.174 (4). Being off by 2× in either direction costs about 3.5%, so imprecise estimates of `λ` (which sets `w*` through `1/√λ`, i.e. a 4× error in `λ` gives a 2× error in `w`) cost little. This is a modest, locally symmetric loss, not a cliff.

## 3. The synchronous scaling wall
In synchronous data parallelism any of `n` workers failing restarts the job from the checkpoint, so the failure rate is `Λ = nλ` and everything above holds with `Λ` in place of `λ`. Efficiency is `1/f(w*)`. For `λ=10⁻⁴` per worker, `C=1`, `R=5` (E3): efficiency 0.985 (`n=1`), 0.951 (10), 0.824 (100), 0.411 (1000), 0.164 (3000), 0.026 (10⁴). Optimal interval shrinks from 141 to 0.84. Efficiency crosses 90% at `n=36` and 50% at `n=691`; with a costlier commit `C=10` the 50% point falls to `n=156`. For small `nλC` efficiency is `≈ 1 − √(2nλC) − nλR`: the loss grows as `√n`, then linearly. Commit cost matters at scale: a tenfold costlier commit cuts the 50% point by a factor 4.4.

**Elastic training (E4).** If a failure only costs the failed slot a rebalance time `ρ`, efficiency is `1/(1+λρ)`, independent of `n`. With `λ=10⁻⁴`, `C=1`, `R=5`, elastic wins from `n=1` at `ρ=50` and `n=2` at `ρ=200`, and only from `n=32` at `ρ=1000`. The crossover here is a statement about the parameters (synchronous pays `C` even at `n=1`); the durable claim is the shape: synchronous efficiency is decreasing in `n`, elastic is flat.

## 4. Heterogeneous pools
For a synchronous job the failure rates add, so throughput of a chosen set is `k·η(Σλ_i)`, and for a given size the best set is the `k` most reliable workers. In a pool of 100 workers at `λ=10⁻⁴` and 100 at `5·10⁻³` (E5) the best set is exactly the 100 reliable workers with throughput 82.4, versus 16.8 with everyone included: the flaky half destroys 80% of throughput. Admission should therefore be by marginal throughput, not by availability. (Flaky workers are useful for elastic or asynchronous jobs, or as replicas; see `replicated-execution`.)

## 5. Limitations and connections
Poisson (memoryless) failures, failure-free restart, one shared checkpoint cost and fixed `R` are assumptions; real preemptions are bursty and correlated, which would fatten the tail beyond `e^{λL}`. Checkpoint cost is treated as constant though it depends on state size. The interval also sets the audit granularity of a Merkle-committed trace (`spot-check-slashing`, `dispute-arity`): a short interval yields cheaper dispute leaves but costs efficiency, a coupling not modelled here. The elastic comparison uses a single stylised `ρ`. Results are for wall-clock overhead only, not for statistical efficiency of the optimisation. The contributions are the exact interval with its short derivation, the robustness numbers, and a concrete scaling wall for synchronous jobs on unreliable workers, each with executable checks.

## Reproduce
`PYTHONPATH=src python3 -m unittest discover -s tests -v` (8 tests) and `PYTHONPATH=src python3 experiments/run.py`.
