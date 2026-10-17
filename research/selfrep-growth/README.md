# selfrep-growth: how fast does a replicating printer shop grow when vitamins must be bought?

Third milestone of the self-replicating manufacturing track (`PROJECTS.md`, track 1). A fleet of identical printers each builds copies of itself from printed parts plus imported vitamins. A discrete-event simulation and a closed-form fluid model give the doubling time as a function of the import budget, build failures and closure. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/selfrep-growth/

**Builds on.** `research/selfrep-closure` (imported, not copied): its Prusa Mendel part model sets the printed mass and the vitamin cost per copy. Through it, the RepRap project (Jones et al., "RepRap – the replicating rapid prototyper", *Robotica* 29(1), 2011, <https://doi.org/10.1017/S026357471000069X>). The question follows von Neumann (1966) and Freitas and Merkle (2004), as in `PROJECTS.md`. Lackner and Wendt (1995), "Exponential growth of large self-reproducing machine systems", *Math. Comput. Modelling* 21(10):55-81, <https://doi.org/10.1016/0895-7177(95)00071-9>, is the named comparison for this milestone: **this project does not make that comparison**, because I did not have the paper's text and will not describe its model from memory. The only theory used here is the textbook exponential-then-linear law derived below. This project builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
- One *unit* is a printer. A copy needs `W` unit-hours (printing the makeable mass at an assumed rate, plus an assumed assembly time) and one copy's worth of vitamins `V`, bought from an import stream of `B` currency units per hour. A unit that finishes a copy and the new copy both start again. With probability `fail` a build fails at its end and loses its hours and vitamins.
- `W` and `V` come from `selfrep-closure` (printer-alone shop, LM8UU bearings): makeable mass / 25 g/h + 6 h assembly = 50.0 h; vitamins = (1 - cost closure) x total assumed cost = 170.3 units (11.4% cost closure of 192.3).
- **Discrete-event model** (`src/selfrep_growth/model.py`, standard library): events are build completions and "stock reaches V" times; build time is lognormal with CV 0.2. Fleet 1 -> 64 units (6 doublings), 300 runs per row, seed 0. *Effective doubling time* = time(1 -> 64) / 6.
- **Fluid model**: dN/dt = min(N(1-f)/W, B(1-f)/V). Exponential growth while machine time limits, linear growth once N exceeds N* = B W / V, where the budget limits. Closed form in `time_to_reach_ode`.

## Reproduce
```bash
cd research/selfrep-growth
python3 -m unittest discover -s tests -v     # 7 tests, standard library only
python3 experiments/run.py                   # about 1 s; writes experiments/results.txt
```

## Results (from `experiments/results.txt`; hours; median [5th-95th percentile])
- **Two regimes.** With a small budget the fleet is import-limited and the effective doubling time falls almost in proportion to the budget: 7162 h at 0.25 units/h, 455 h at 4/h, 120 h at 16/h. Beyond about 64/h machine time limits and the doubling time flattens at about 53 h, which is the build time W (50 h) plus variability: in the simulation the fleet doubles in generations, each taking one build.
- **Fluid versus discrete.** The fluid model gives a free doubling time W ln 2 = 34.7 h, against about 53 h in the discrete-event model. This is a modelling difference, not noise: the fluid limit lets partial copies progress in parallel, while a unit here finishes a whole copy before the fleet grows. Under import limits (budget up to 16/h) the two agree within about 3% (e.g. 455 vs 447 h at 4/h); near the crossover the discrete model is up to 20% slower (64/h: 53.5 vs 44.5 h). Treat the discrete model as the reference when machine time limits.
- **Failures.** At 4/h, 10% / 30% / 50% failed builds raise the doubling time from 455 h to 505 / 649 / 903 h, close to the 1/(1-f) of the fluid model (497 / 639 / 895 h). With a generous budget (64/h) the penalty is 57 / 70 / 92 h.
- **Closure helps most when imports bind.** At 4/h, raising cost closure from 11% to 25% / 50% / 75% / 90% lowers the doubling time from 457 h to 387 / 261 / 134 / 59 h. Here W is held fixed, though a higher closure would in practice mean more machine time per copy, so this is an upper bound on the benefit.

## Limitations
- **Every input is assumed, none sourced**: print rate, assembly time, vitamin cost (inherited assumed costs), budget in arbitrary currency units, failure rate and build-time spread. Absolute hours are illustrations, not forecasts; the shapes (1/B scaling, crossover at N* = BW/V, 1/(1-f) penalty) are the findings.
- Homogeneous fleet of printers building only printers. No other machines, no queueing for shared tools, no learning, no material feedstock limits, no consumption of goods.
- Assembly is done by the printer fleet itself, which no real RepRap can do; it is a stand-in for "someone assembles it" and is listed under owner steps.
- Failure model is crude (a failed build loses everything). Doubling-time comparison with Lackner and Wendt's model is **not done**.
- The 1 -> 64 horizon is short; the results are not asymptotic growth rates.

## Next steps
`selfrep-reinvest`: split output between more machines and goods as an optimal-control problem, using this fleet model. Also: read Lackner and Wendt (1995) and compare their growth law with the crossover law here; give the added machines their own bills of materials.

## Owner steps
- Measure real print throughput, assembly time and failure rate for one printer, and replace the assumed inputs.
- Replace assumed vitamin costs with dated quotes (source and date for every price), as for `selfrep-closure`.

## Outside dependencies (vitamins)
Python standard library only. The vitamins of the printers it describes are those listed in `selfrep-closure`.

`python3 experiments/figure.py` plots effective doubling time against vitamin import budget for the discrete-event and fluid models (section A) from the committed `experiments/results.txt` and writes `experiments/doubling_vs_budget.svg` (standard library only; no new results; stylised model).
