# selfrep-repair: when is repairing a printer worth more than building a new one? (stylised)

Follow-up to `selfrep-wearout` in the self-replicating manufacturing track (`PROJECTS.md`, track 1), taking one of that project's listed next steps: repair as a cheaper alternative to replacement. A discrete-event simulation (standard library) is compared with a vitamin-balance formula. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/selfrep-repair/

**Builds on.** `research/selfrep-growth` and, through it, `research/selfrep-closure` (imported by relative path, not copied): work per copy W = 50.0 h and imported vitamins per copy V = 170.3 (assumed currency units). The build rule and the discrete-event structure follow `research/selfrep-wearout`. Behind them: the RepRap project (Jones et al., "RepRap – the replicating rapid prototyper", *Robotica* 29(1), 2011, <https://doi.org/10.1017/S026357471000069X>), and the question of von Neumann (1966) and Freitas and Merkle (2004), as in `PROJECTS.md`. I did not read or compare Lackner and Wendt (1995). This project builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
- Same build rule as `selfrep-growth`: a copy needs W unit-hours (lognormal, CV 0.2) and V vitamins from an import stream of B = 4 units/hour. No bad builds here.
- Machines break down at a constant rate 1/L (exponential). A build in progress is lost with its vitamins.
- **New: repair.** On a breakdown the shop may spend `c` x V of spare-part vitamins and `repair_h` hours of downtime. The repair works with probability `s` and the machine is then as good as new; otherwise it is retired. If the stock holds less than `c` x V, the machine is retired. Replace-only is the baseline.
- **New: reserve.** Builds only start when stock reaches V x (1 + reserve), so spares are on hand when a breakdown comes.
- **Formula** (`fixed_point`): the import-limited vitamin balance B = N (c + 1 - s) V / L, so N = B L / (V (c + 1 - s)); replace-only is N = B L / V. This predicts that repair gives a bigger fleet iff **c < s**. The formula ignores builds cut short, the wait for stock, downtime and the build-time spread. It was written before the runs; the mismatches it showed are reported below.
- Fleet size is the number of *working* machines (alive and not in repair), averaged over the last quarter of each run. "Dead" is the share of runs with no working machine at the end. Runs start from one new machine, last 20000 h, 100 runs per row, seed 0.

## Reproduce
```bash
cd research/selfrep-repair
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests, standard library only
python3 experiments/run.py                                 # about 5 s; writes experiments/results.txt
python3 experiments/figure.py                              # plots section A (working fleet vs repair cost share) to experiments/repair_share.svg from the committed results.txt
```

## Results (from `experiments/results.txt`; B = 4, L = 2000 h unless stated)
- **The break-even c = s holds in this model.** At s = 0.8 the fleet is 142 / 91 / 64 / 50 / 46.5 / 44 / 41 machines at c = 0.1 / 0.3 / 0.5 / 0.7 / 0.8 / 0.9 / 1.0, against 45.7 for replace-only. The crossing is at c about 0.8; the simulation is within 9% of the formula in this sweep, below it for c up to 0.8 (formula 157 at c = 0.1, simulation 142) and slightly above it at c = 0.9 and 1.0. Varying s at c = 0.3 gives the same picture (41.6 at s = 0.2, below replace-only; 45.6 at s = 0.3, level; 133 at s = 1.0 against a formula value of 157).
- **Spares must be held back, or repair mostly fails to happen.** With c = 0.2 and s = 0.9, no reserve gave 69.6 machines (formula 156.5); reserve 0.1 / 0.2 / 0.4 / 1.0 gave 81 / 122 / 136 / 143. Without a reserve the stock is mostly below the spares price because builds drain it to zero each time it reaches V, so many breakdowns find no spares and the machine is retired. I did not expect this size of effect; it is a mechanism I diagnosed from the first run, not a pre-registered prediction.
- **Repair rescues short-lived fleets, partly.** From one seed with c = 0.2, s = 0.9, reserve 0.4: at L = 100 / 150 / 200 / 300 / 500 h, replace-only died out in 100% / 100% / 100% / 67% / 21% of runs; with repair 55% / 39% / 31% / 20% / 13% died out, and the survivors held 5.8 / 9.3 / 12.7 / 20.3 / 34.3 machines against 0 / 0 / 0 / 6.1 / 10.8. At L = 300 a reserve of 1.0 gave more dead runs (29%) than 0.4 (20%): withholding stock also delays the first builds. Single seed set, so differences of a few percentage points are not established.
- **Downtime hardly matters here.** The shop is import-limited, not machine-limited. 0 / 5 / 50 / 200 / 1000 h of repair downtime gave 141.7 / 142.7 / 143.7 / 140.5 / 128.5 working machines. It would matter in the machine-limited early growth, which this project does not study.

## Limitations
- Stylised. Every input is assumed: build time, V, budget units, breakdown rate, repair cost, repair success and downtime. Nothing here is a measurement of a real printer, and no real repair cost is claimed.
- Breakdowns are memoryless and a repair resets the machine to new, so there is no wear-out or ageing (`selfrep-wearout` has Weibull lifetimes but no repair). A repaired machine is as good as new, which favours repair.
- Spares are bought from the same vitamin stock as new machines. A real shop could print spare parts (closure above zero), which would make repair cheaper than the sweep's `c` suggests; that link to `selfrep-closure` is not modelled. No recycling of retired machines (see `selfrep-wearout` and `selfrep-recyclers`).
- The formula overstates the fleet by up to 15% with a full reserve (at s = 1.0 and c = 0.3, 157 against 133) (and by more without a reserve); I did not separate the sources (builds cut short, stock waits, build-time spread).
- Single seed set, 100 runs per row; the dead-share differences between neighbouring rows are noisy.

## Next steps
Let part of the spares be printed in-house, with `c` set from the closure of the machine's wear parts in `selfrep-closure`. Make the breakdown rate depend on the machine's bill of materials and age. Add repair labour as a constraint on machine-limited growth.

## Owner steps
- Measure real time to failure and the real cost and success rate of repairs for a printer's wear parts (belts, bearings, hot end), and replace the assumed values.
- Replace assumed vitamin costs with dated quotes (source and date for every price), as for `selfrep-closure`.

## Outside dependencies (vitamins)
Python standard library only, plus the sibling `selfrep-growth` and `selfrep-closure` source trees (relative paths). The vitamins of the printers it describes are those of `selfrep-closure`.
