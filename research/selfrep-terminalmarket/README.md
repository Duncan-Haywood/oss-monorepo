# selfrep-terminalmarket: does a resale value for the finished fleet still end copying late when the goods market saturates?

Follow-up to `selfrep-terminal` and `selfrep-satmarket` in the self-replicating manufacturing track (`PROJECTS.md`, track 1), taking the "combine the terminal value with the saturating market (DP with a terminal reward)" next step that `selfrep-terminal` lists. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/selfrep-terminalmarket/

**Builds on.** `research/selfrep-satmarket` (its fluid model `Params`, `run`, `revenue`, `bang_bang` and `dp_policy`, imported by relative path), `research/selfrep-terminal` (the terminal-value objective and its closed form for a linear market) and `research/selfrep-growth` (`W` = 50.0 h per copy, from `research/selfrep-closure`, RepRap Prusa Mendel; Jones et al., "RepRap – the replicating rapid prototyper", *Robotica* 29(1), 2011, <https://doi.org/10.1017/S026357471000069X>). The question follows von Neumann (1966) and Freitas and Merkle (2004), as in `PROJECTS.md`. No paper's result is reproduced. This project builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
- **Model.** Fleet `N`, copy share `u`, `N' = k u N` with `k = 1/W`; goods revenue rate `R(g) = a c (1 - exp(-g/c))` for `g = (1-u) N` machine-hours per hour. The objective adds `s` per machine at the horizon `T` (an assumed resale value). `s = 0` is `selfrep-satmarket`; `c = inf` is `selfrep-terminal`.
- **DP.** `src/selfrep_terminalmarket/model.py` solves the backward recursion with terminal reward `V_T(n) = s n`, on the same log-spaced fleet grid (400 points) and 21 control levels as `selfrep_satmarket.dp_solve`; only the terminal reward is new. The resulting policy is simulated with the shared Euler integrator (1 h steps), so all values are Euler values.
- **Comparators.** The best bang-bang switch (1 h grid), and the DP policy computed for `s = 0` but evaluated with the true `s` (what ignoring the resale value costs).

## Reproduce
```bash
cd research/selfrep-terminalmarket
python3 -m unittest discover -s tests -v     # 5 tests, standard library only
python3 experiments/run.py                   # about 25 s; writes experiments/results.txt
python3 experiments/figure.py                # redraws experiments/bangbang_vs_resale.svg from results.txt
```

## Results (from `experiments/results.txt`; T = 600 h, a = 1, W = 50 h, failure 0; all assumed; `s*` = a/k = 50)
- **Linear market (c = inf) recovers `selfrep-terminal`.** The DP policy and the bang-bang switch agree within 1 h (switch 549, 562, 574, 600 h for `s` = 0, 12.5, 25, 50), matching the closed form `T - 1/k + s/a`.
- **A saturating market moves the switch earlier at `s = 0` and makes a small `s` decisive.** At c = 1000 machine-hours per hour the DP stops copying near 398 h for `s = 0`, but at `s` = 12.5 (a quarter of `s*`) it copies to the horizon. Fleet at T grows from about 3,900 to about 143,000 machines.
- **Ignoring `s` is costly when the market is small.** Using the `s = 0` DP policy when machines are worth `s` = 12.5 earns 97.5% of the optimum at c = inf, 96.4% at c = 1e5, 60.3% at c = 1e4 and 13.9% at c = 1e3.
- **The DP is not a reliable optimum where the final fleet is large.** For c = 1e4 and 1e3 with `s` > 0, the DP table value is up to about 10% below the simulated policy value (e.g. 6.62e6 vs 7.21e6 at c = 1e4, s = 50; 6.45e6 vs 7.18e6 at c = 1e3), and the simple bang-bang switch beats the DP policy by up to 0.7% (100.62–100.65% at c = 1e3). So those DP rows are lower bounds on the optimum; the percentages "of DP" there are not certificates. A likely cause (not tested here) is the geometric grid: its top point is the fleet at `u = 1` for all `T`, interpolation across wide cells misprices the linear terminal reward, and the table value shows the mismatch.

## Limitations
- Every input is assumed, including `s`. The resale value is linear in the number of machines and does not saturate, although a market for used printers would; selfrep-terminal lists that as a next step.
- Fluid model, cash free, homogeneous fleet, no wear-out, failure 0 only, `a` and `W` as in earlier projects.
- DP discretisation error is large where the fleet is large (above); only one grid size was tried. Optimality of the DP policy is not established, and the conclusions on the switch rely on the bang-bang comparison as well.

## Next steps
Refine the DP grid (or use a different state, such as `log n`) and check that the table and policy values converge; replace the linear `s` with a resale price that falls with the number of machines offered; add the cash constraint.

## Owner steps
- Find the real resale value of a used RepRap-class printer (source and date for each price) and set `s` from it.
- Replace the assumed goods value `a` and market capacity `c` with prices and volumes the shop's goods actually fetch.

## Outside dependencies (vitamins)
Python standard library only, plus the sibling `selfrep-satmarket`, `selfrep-growth` and `selfrep-closure` source trees (relative paths). The vitamins of the printers it describes are those of `selfrep-closure`.
