# selfrep-wearout: what fleet can a replicating printer shop sustain when its machines wear out? (stylised)

Follow-up to `selfrep-growth` in the self-replicating manufacturing track (`PROJECTS.md`, track 1). The growth model there lets machines live forever. Here every machine is retired at a random age, a build in progress on it is lost, and a share of its vitamin value can be recovered into the stock. A discrete-event simulation (standard library) is compared with a fluid model and a corrected closed form. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/selfrep-wearout/

**Builds on.** `research/selfrep-growth` and, through it, `research/selfrep-closure` (imported by relative path, not copied): work per copy W = 50.0 h and imported vitamins per copy V = 170.3 (assumed currency units). Behind them: the RepRap project (Jones et al., "RepRap – the replicating rapid prototyper", *Robotica* 29(1), 2011, <https://doi.org/10.1017/S026357471000069X>), and the question of von Neumann (1966) and Freitas and Merkle (2004), as in `PROJECTS.md`. I did not read or compare Lackner and Wendt (1995). Weibull lifetimes are the standard reliability model; I give no reference for the distribution beyond its name. The project builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
- Same build rule as `selfrep-growth`: a copy needs W unit-hours (lognormal, CV 0.2) and V vitamins from an import stream of B units/hour; with probability `f` a finished build is bad and its hours and vitamins are lost.
- New: each machine gets a Weibull lifetime with mean L and shape k (k = 1 constant hazard, k > 1 wear-out). At retirement, an idle or building machine disappears; a build in progress is lost with its vitamins. `rho` x V of vitamin value returns to the stock.
- **Fluid model**: dN/dt = min((1-f)N/W, (1-f)(B + rho V N/L)/V) - N/L, integrated by Euler. Import-limited equilibrium N = (1-f) B L / (V (1 - rho(1-f))).
- **Corrected equilibrium** (`interrupted_fixed_point`): also charges the vitamins of builds cut short by retirement, with interruption probability q = 1 - exp(-W/L) (exponential life): N = B L / (V (1/((1-f)(1-q)) - rho)). **I added this after seeing the fluid model disagree with the simulation, so it is a post-hoc explanation tested on the same runs, not an independent prediction.**
- Experiments start from one new machine, run 20000 h and use 100 runs per row (seed 0). The reported size is the fleet averaged over the last quarter of each run that still has machines; "dead" is the share of runs that ended with none.

## Reproduce
```bash
cd research/selfrep-wearout
python3 -m unittest discover -s tests -v     # 8 tests, standard library only
python3 experiments/run.py                   # about 10 s; writes experiments/results.txt
```

## Results (from `experiments/results.txt`; B = 4 units/h unless stated)
- **Short-lived machines cannot sustain a fleet from one seed.** For L = 40 to 200 h every run died out, although the fluid model predicts a fleet of 1.3 to 4.7 machines for L = 55 to 200 h. At L = 500 h 20% of runs died out and survivors held about 10 machines (fluid 11.7); at 2000 h 3% died out, 45 machines (fluid 47). Larger seed fleets (1, 2, 4, 8) did not help at L = 200 h. This is consistent with demographic extinction of a small birth-death population (an equilibrium of 4 to 5 machines over about 100 lifetimes), but I did not test that cause separately.
- **Wear-out versus constant hazard at the same mean life** (L = 500 h): shape 1/2/3/5 gave 20% / 1% / 0% / 0% dead and 10.3 / 11.0 / 11.3 / 11.7 machines. The same mean life with less spread is safer.
- **Recycling matters most at high rho.** rho = 0 / 0.25 / 0.5 / 0.75 / 0.95 gave 10.3 / 13.6 / 19.3 / 32.5 / 73.4 machines. The plain fluid equilibrium over-predicts at high rho (47.0 at 0.75, 234.8 at 0.95). Running 100000 h instead of 20000 h gave 76.3, so the gap is not slow convergence. The corrected equilibrium gives 33.1 and 75.7, close to the simulation.
- **Failures and budget.** At rho = 0.5, f = 0 / 0.1 / 0.3 / 0.5 gave 19.3 / 16.4 / 11.1 / 6.7 machines and 20% / 23% / 27% / 49% dead. Fleet size scaled about linearly with budget (B = 2 / 4 / 8 / 16: 5.5 / 10.3 / 21.2 / 42.2); at B = 1 only 2% of runs survived.
- **Residual discrepancy.** At L = 8000 h the simulation gave 165.8 against 186.7 (corrected) and 187.9 (fluid); the 20000 h run is only 2.5 lifetimes long, and the fluid trajectory at the horizon is 172.5, so this row is not at equilibrium.

## Limitations
- Every input is assumed, as in `selfrep-growth`: build time, vitamin cost, budget units, failure rate, lifetime and recovery share. Nothing here is a measurement of a real printer, and no real lifetime is claimed.
- Machines are identical printers building only printers; a retired machine is replaced only by new builds. No repair, no maintenance, no spare parts, no queueing, no learning, no goods output.
- The recovered share rho is a single number applied to V; the actual recoverable value depends on which parts survive, which `selfrep-recyclers` models separately and this project does not.
- Only the equilibrium of the import-limited regime has a closed form; the machine-limited early growth is simulated only. The corrected formula assumes exponential life and ignores the wait for stock and the build-time spread.
- The extinction explanation is not isolated by an experiment. Runs are from a single seed set.

## Next steps
Make the lifetime depend on the machine's own bill of materials (which parts wear), and add repair as a cheaper alternative to replacement. Fold the recyclers of `selfrep-recyclers` in for the recovery share. Test the extinction explanation with a birth-death model that has a known extinction time.

## Owner steps
- Measure real time to failure for a printer's wear parts (belts, bearings, hot end) and the share of a retired machine that can be recovered, and replace the assumed lifetimes and rho.
- Replace assumed vitamin costs with dated quotes (source and date for every price), as for `selfrep-closure`.

## Outside dependencies (vitamins)
Python standard library only, plus the sibling `selfrep-growth` and `selfrep-closure` source trees (relative paths). The vitamins of the printers it describes are those of `selfrep-closure`.
