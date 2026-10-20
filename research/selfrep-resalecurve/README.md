# selfrep-resalecurve: how does a falling resale price for the finished fleet change when the shop stops copying?

Follow-up to `selfrep-terminalmarket` in the self-replicating manufacturing track (`PROJECTS.md`, track 1), taking the "replace the linear `s` with a resale price that falls with the number of machines offered" next step that project lists. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/selfrep-resalecurve/

**Builds on.** `research/selfrep-terminalmarket` (objective and DP layout), `research/selfrep-satmarket` (fluid model `Params`, `run`, `revenue`, `bang_bang`, `dp_policy`, imported by relative path) and `research/selfrep-growth` (`W` = 50.0 h per copy, from `research/selfrep-closure`, RepRap Prusa Mendel; Jones et al., "RepRap – the replicating rapid prototyper", *Robotica* 29(1), 2011, <https://doi.org/10.1017/S026357471000069X>). The question follows von Neumann (1966) and Freitas and Merkle (2004), as in `PROJECTS.md`. No paper's result is reproduced. This project builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
- **Model.** Fleet `N`, copy share `u`, `N' = k u N`, `k = 1/W`; goods revenue rate `R(g) = a c (1 - exp(-g/c))` for `g = (1-u) N`. At the horizon `T` the fleet is sold for `S(N) = s m (1 - exp(-N/m))`: `s` is the price of the first machine offered, `m` the depth of the used-machine market (machines), and total proceeds are capped at `s m`. `m = inf` is the linear resale value of `selfrep-terminalmarket`. This concave form is an assumption chosen for tractability, not fitted to any market.
- **Solvers.** The best single bang-bang switch (1 h grid), and a backward DP (400 log-spaced fleet points, 21 control levels) whose terminal reward is `S`. Policies are simulated with the shared 1 h Euler integrator, so all `J` values are Euler values.

## Reproduce
```bash
cd research/selfrep-resalecurve
python3 -m unittest discover -s tests -v     # 6 tests, standard library only
python3 experiments/run.py                   # about 20 s; writes experiments/results.txt
```

## Results (from `experiments/results.txt`; T = 600 h, a = 1, W = 50 h, failure 0, `s` = 25 = half of `s*` = a/k; all inputs assumed)
- **Unsaturated goods market (c = inf): a shallower resale market moves the switch earlier, and bang-bang matches the DP.** Switch time falls from 574 h (m = inf) to 572, 562, 550 and 549 h for m = 1e6, 1e5, 1e4, 1e3. The DP policy value is within 0.01% of the bang-bang value in every row. Fleet at the switch falls from about 97,000 to about 59,000 machines, because each extra machine is worth less once the market is shallow.
- **Saturating goods market (c = 1e4): the single switch is no longer near-optimal.** The DP policy beats the best switch by 0.3% (m = inf), 0.8% (1e6), 13.6% (1e5), 5.6% (1e4) and 4.6% (1e3). At m = 1e5 the best switch is "copy to the horizon" (ts = 600 h) while the DP policy stops copying with a fleet of about 110,000 machines. The cause is not examined here.
- **The DP table is not a certificate at c = inf.** For c = inf, m = 1e4, the table value is 3.54e6, 3.08e6 and 2.97e6 at 200, 400 and 800 grid points, against a simulated policy value of 2.934e6 that barely moves (2.934009e6, 2.934563e6, 2.934581e6). The table overstates the optimum and converges slowly (the same interpolation issue noted in `selfrep-terminalmarket`); the policy values are the reliable numbers. For c = 1e4 at large m the table is below the simulated policy value (e.g. 3.44e6 vs 3.63e6 at m = inf), as in `selfrep-terminalmarket`, so DP rows there are lower bounds on the optimum.

## Limitations
- Stylised. Every input is assumed: `s`, `m`, `a`, `c`, and the exponential shape of both market curves. Only one `s` (0.5 `s*`) and two `c` values were run.
- Fluid model, cash free, homogeneous fleet, no wear-out, failure 0, resale at one date only (no selling during the horizon).
- Discretisation: one grid size for the main table; the grid check covers one case. Optimality of the DP policy is not established.

## Next steps
Sweep `s` and check whether the c = 1e4 gap to bang-bang comes from a two-stage policy (copy, make goods, copy again); add the cash constraint; allow selling machines during the horizon.

## Owner steps
- Find the real resale prices and market depth for used RepRap-class printers (source and date for each price) and fit `s` and `m`.
- Replace the assumed goods value `a` and market capacity `c` with prices and volumes the shop's goods actually fetch.

## Outside dependencies (vitamins)
Python standard library only, plus the sibling `selfrep-satmarket`, `selfrep-growth` and `selfrep-closure` source trees (relative paths). The vitamins of the printers it describes are those of `selfrep-closure`.
