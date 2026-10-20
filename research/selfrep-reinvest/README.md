# selfrep-reinvest: when should a replicating shop stop copying itself and start making goods?

Fourth milestone of the self-replicating manufacturing track (`PROJECTS.md`, track 1). A fleet of printers splits its machine time between building copies of itself and making goods; a control policy decides the split over time. Bang-bang (copy flat out, then switch to goods), constant and smooth policies are compared on the total value of goods made. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/selfrep-reinvest/

**Builds on.** `research/selfrep-growth` (imported, not copied): its per-copy work `W` = 50.0 h and vitamin cost `V` = 170.3 units, which come in turn from `research/selfrep-closure` (RepRap Prusa Mendel part model; Jones et al., "RepRap – the replicating rapid prototyper", *Robotica* 29(1), 2011, <https://doi.org/10.1017/S026357471000069X>). The question follows von Neumann (1966) and Freitas and Merkle (2004), as in `PROJECTS.md`. No paper's result is reproduced or compared here. The only theory is the elementary calculation below. This project builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
- **State.** Fleet size N (continuous, a *fluid* approximation) and cash M. **Control** u(t) in [0, 1]: the share of machine time spent starting copies. The rest, 1 - u, makes goods worth `a` currency units per machine-hour.
- **Copies.** Copies start at rate uN/W per hour, each costing V in cash. A start fails with probability `fail` and loses its vitamins and hours, so N grows at uN(1 - fail)/W.
- **Cash.** M gains `budget` per hour from outside plus `resale` x (goods value). If M cannot pay for the copies a policy asks for, the unfunded share of machine time makes goods instead. "Cash free" runs switch this constraint off.
- **Objective.** Total value of goods made over a horizon T = 600 h. The fleet left at T is worth nothing, so the final switch is as sharp as it can be; a terminal fleet value would move it.
- **Policies** (`src/selfrep_reinvest/model.py`, standard library, Euler step 1 h): bang-bang with a grid-searched switch time ts; constant u (grid of 21); smooth (logistic ramp-down, grid over centre and width); and a 20-segment piecewise-constant policy improved by coordinate ascent from the best bang-bang. The last is a local search, so it is a lower bound on the true optimum and not a proof of optimality.
- **Closed form (cash free).** With N' = kuN and k = (1 - fail)/W, copying until ts and then making goods gives J(ts) = a N0 e^(k ts) (T - ts). Setting dJ/dts = 0 gives ts = T - 1/k and J = a N0 e^(kT-1)/k. Here 1/k is the e-folding time of the fleet, so the shop should stop copying one e-folding time before the horizon. That is the textbook calculus of the switch, not a new result. The test suite checks the numerics against it.

## Reproduce
```bash
cd research/selfrep-reinvest
python3 -m unittest discover -s tests -v     # 8 tests, standard library only
python3 experiments/run.py                   # about 20 s; writes experiments/results.txt
```

## Results (from `experiments/results.txt`; percentages are of the best bang-bang policy's goods value)
- **Free cash: copy, then switch, one e-folding time before the end.** The switch is at 549 h against the closed-form 550 h (T - 1/k, 1/k = 50 h). Failures move it earlier: 1/k = 62 / 83 / 125 h at 20% / 40% / 60% failed builds, and the grid optimum is 537 / 516 / 475 h.
- **Constant splits do badly.** The best constant u captures only 9% of the bang-bang value at 0% failures, 12% at 20%, 16% at 40%, 27% at 60%. A shop that always spends a fixed share on copies never compounds.
- **Smooth policies are as good as bang-bang, not better.** The best logistic ramp (width 2 h, the narrowest tried) reaches 99.7-100.0% of bang-bang. Wider ramps are worse, which is the signature of a bang-bang optimum. The 20-segment local search gets 98.4-99.9%, below 100% in part because its segments (30 h) cannot place the switch exactly.
- **Cash-limited cases are close to trivial in these parameters.** With an outside budget of 0.25-64 per hour, or with goods sold to fund vitamins, cash binds for the whole horizon: the best policy is to ask for copies all the time (u = 1, funded as far as cash allows) and switch to goods about 50 h before the end (best switch 549-550 h). Best constant u = 1 is within 79-99.9% of bang-bang; the gap grows as goods become more valuable (a = 4, full resale: constant is 79%) because the switch then pays more. Smooth and local-search policies match bang-bang to within 0.4%.
- **Horizon.** With free cash the switch moves from 50 h (T = 100) to 1550 h (T = 1600): 50% to 97% of the horizon spent copying.
- **Numerical accuracy.** At dt = 1 h the Euler scheme gives 89.7% of the closed-form value at the closed-form switch, 97.3% at 0.25 h and 99.5% at 0.05 h. Policy comparisons share the step size and hold in ratio, but the absolute J values in `results.txt` are low by the Euler error and should not be read as exact.

## Limitations
- **Every input is assumed**: goods value per machine-hour `a`, resale share, import budget, failure rate. The W and V inherited from earlier projects are themselves assumed. Absolute goods values are illustrations, not forecasts; the shapes (bang-bang optimum, switch at about T - 1/k, constant splits losing most of the value) are the findings.
- **Fluid model**: N is continuous and reaches tens of thousands of units at T = 600 h with free cash. No real shop would, and demand, floor space and the price of goods would have saturated first. The sharp bang-bang result comes from objective and dynamics that are both linear in the control; saturating markets or diminishing returns would produce smooth optima.
- The final fleet is worth nothing, which makes the end-game switch exact. A shop that keeps running would value the fleet.
- Homogeneous printer fleet making only printers and goods; no other machines, no queueing, no feedstock limits, no learning. Goods demand is unlimited at a fixed price.
- Piecewise-constant policies are optimised by local search, so "optimal" here means the best of the policies tried. There is no Pontryagin or dynamic-programming solution of the cash-limited problem.
- No comparison with Lackner and Wendt's (1995) model; that is still open from `selfrep-growth`.

## Next steps
`selfrep-materials`: mass and energy balance of material recycling. Also: a terminal fleet value; a saturating goods market to test when smooth optima appear; a dynamic-programming solution of the cash-limited problem to certify the local search; the Lackner and Wendt comparison, once the paper has been read.

## Owner steps
- Measure real print throughput, failure rate and the price the shop's goods fetch, and replace the assumed `a`, `resale` and `fail`.
- Replace the assumed vitamin costs with dated quotes (source and date for every price), as for `selfrep-closure`.

## Outside dependencies (vitamins)
Python standard library only. The vitamins of the printers it describes are those listed in `selfrep-closure`.
