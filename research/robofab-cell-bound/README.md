# Where is the bottleneck of a robot-arm, 3D-printer and inspection cell? A discrete-event twin with a utilisation bound

A stylised, simulation-only companion to `research/robofab-cell` (milestone 4 of the `robofab` track), which a parallel run merged first under that slug; this project keeps the non-overlapping part: a closed-loop, throughput-capacity view with a utilisation bound, rework loops and upgrade comparisons, where `robofab-cell` studies makespan of a fixed batch and dispatch rules. The two models were written independently and their numbers are not comparable. A cell has one arm that loads and unloads P 3D printers, and an inspection station. Parts that fail inspection are reprinted. Jobs are of two types (A: 20 min print, 10% fail; B: 60 min print, 20% fail). The model is a hand-written event-driven simulation (`heapq`, no SimPy). All numbers are from `experiments/results.txt` (20 seeds, 24 h horizon after a 4 h warm-up, mean ± standard error).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/robofab-cell-bound/

- **A utilisation bound names the bottleneck, and the simulation tracks it from below.** With 1 to 10 printers the printers are the bottleneck; from 12 on the arm is (4 arm-minutes per pass, so about 12.7 good parts/h at most). With noise (cv 0.3), simulated throughput is within 1% of the bound for 1 to 4 printers, 5% and 7% below it at 6 and 8, and 10% and 11% below it at 10 and 12 printers, near the switch, where printers and arm are both close to saturation. It is 3.5% below at 14 and within 2% from 16; at 20 printers it reaches 12.68 ± 0.10 against a bound of 12.71, so printers beyond about 16 buy nothing.
- **Fix the named bottleneck, then the next one.** At 12 printers, a 25% faster arm raises throughput from 11.34 ± 0.11 to 12.68 ± 0.07 parts/h; a second inspector alone does nothing (11.36 ± 0.11), and two more printers give 12.27 ± 0.09. With the faster arm the bound moves back to the printers (13.81/h).
- **Arm dispatch rule: no gain found.** FIFO and shortest-processing-time are identical here (load and unload times do not depend on the job type, so the second rule reduces to the first). "Unload first" was 0.2 to 0.3 parts/h lower than FIFO at 10 and 12 printers (about two standard errors each) and level at 8; I would not call this more than a hint that it does not help.
- **WIP above printers + 1 only lengthens the queue.** At 8 printers, WIP of 9 to 24 gives 8.3 to 8.5 parts/h while mean flow time grows from 64 to 170 min (consistent with Little's law). A WIP of 8 (one job per printer) gives 8.07 ± 0.08.
- **Printer "utilisation" is occupancy.** It counts a printer as busy while it waits for the arm to load or unload it, so it sits near 0.97 in every row. Read the arm and inspection utilisations for the bottleneck.

```bash
pip install numpy
cd research/robofab-cell-bound
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests, < 1 s
python3 experiments/run.py                                # a few seconds; writes experiments/results.{txt,json}
```
Produced with numpy and Python 3.11.

## Motivation

Track 4 wants general-purpose arms that run a manufacturing cell. Before programming one, a throughput twin says where an extra machine or a faster arm pays off, which is the same question as which model fidelity is enough to decide: here, a back-of-envelope utilisation bound against a stochastic simulation.

## Builds on

The workcell-twin direction of the HIRO Group (Alessandro Roncone, <https://hiro-group.ronc.one/>), and `research/robofab-program` in this repository (same cell idea, kinematic level). No paper from the group is reproduced; nothing here is affiliated with or endorsed by them. The only literature relied on is Little (1961), "A proof for the queuing formula: L = λW", *Operations Research* 9(3):383–387 (the identity used in a test and in the WIP row). This run had no web access to re-check that reference, so verify it before citing.

## Method

- **Model** (`src/robofab_cell_bound/cell.py`). A job holds a printer from the start of its load until the end of its unload. The single arm does loads and unloads one at a time; then the part goes to inspection (K stations). With the job type's failure probability it re-enters the printer queue; otherwise it counts as a good part and a new job of a random type (equal mix) starts, so WIP is fixed (a closed loop, which measures capacity rather than arrivals).
- **Times** in minutes: load and unload 2 each, inspection 3, print per type as above. Optional lognormal noise with coefficient of variation 0.3 (the `cv0.3` rows); 0 means deterministic.
- **Bound** (`bound`): for each resource, capacity divided by the expected demand per good part, counting repeat passes 1/(1 − q); throughput cannot exceed the smallest.
- **Arm rules**: FIFO, unload-first, shortest-processing-time.
- All parameter values are my choice for illustration; none comes from a measured cell.

## Results

See the bullets above and `experiments/results.txt` (sweeps of printer count, dispatch rule, upgrades, WIP); short discussion in `paper/whitepaper.md`.

## Limitations

Stylised. One arm with fixed move times (no travel between printers, no kinematics, no collisions); no breakdowns, material changeovers or operator time; failure is an independent coin flip; only two job types; a closed loop with fixed WIP. The utilisation bound is only as good as its demand figures. The dispatch comparison is weak: with equal load and unload times, SPT cannot differ from FIFO, and the unload-first differences are near the noise. No claim concerns a physical cell.

## Next steps

Feed measured step times from `research/robofab-program`'s twin (or MuJoCo) into the arm's load/unload times, add travel between printers, breakdowns and changeovers, job-dependent arm times so that dispatch rules can differ, and compare with an analytic queueing network.

## Owner steps

None for this milestone; nothing was built or ordered. A real cell would need a priced bill of materials (an open arm such as the SO-101, printers, a camera for inspection) with sourced, dated prices, which are not given here.

## Outside dependencies

`numpy` only. No language model or hardware was used. Produced with AI assistance (Claude).

MIT.
