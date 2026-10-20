# selfrep-dpgrid: is the dynamic-programming table for the replicating shop with a resale value converged?

Follow-up to `selfrep-terminalmarket` in the self-replicating manufacturing track (`PROJECTS.md`, track 1), taking the "refine the DP grid and check that the table and policy values converge" next step that project lists. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/selfrep-dpgrid/

**Builds on.** `research/selfrep-terminalmarket` (its `Params`, `value`, `best_switch`, `dp_policy`, imported by relative path; its `dp_solve` is re-implemented here with a second interpolation option), `research/selfrep-satmarket` (the fluid model) and `research/selfrep-growth` (`W` = 50.0 h per copy, from `research/selfrep-closure`, RepRap Prusa Mendel; Jones et al., "RepRap – the replicating rapid prototyper", *Robotica* 29(1), 2011, <https://doi.org/10.1017/S026357471000069X>). Backward dynamic programming is the method of Bellman (1957), *Dynamic Programming*, Princeton University Press. The question follows von Neumann (1966) and Freitas and Merkle (2004), as in `PROJECTS.md`. No paper's result is reproduced. This project builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
- **Model** as in `selfrep-terminalmarket`: fleet `N`, copy share `u`, `N' = k u N`, `k = 1/W`; goods revenue `R(g) = a c (1 - exp(-g/c))`; resale value `s` per machine at `T` = 600 h; Euler step 1 h; all inputs assumed.
- **Grid refinement.** The log-spaced fleet grid goes from 100 to 1,600 points (21 control levels), plus one run with 81 levels.
- **Interpolation rule.** `index`: linear in the grid index (the `selfrep-terminalmarket` rule). `n`: linear in fleet size between the bracketing grid points. I expected `n` to remove the table's bias because it is exact for the linear terminal reward; the results below do not show that.
- **Reported per run.** The DP table value at the start (`table`), the Euler value `J` of the DP's own feedback policy, and the best bang-bang switch `J_bb`. Cases: (c, s) = (1e4, 50), (1e3, 12.5), (1e3, 50), the three where `selfrep-terminalmarket` saw the largest gaps.

## Reproduce
```bash
cd research/selfrep-dpgrid
python3 -m unittest discover -s tests -v     # 4 tests, standard library only
python3 experiments/run.py                   # about 40 s; writes experiments/results.txt
```

## Results (from `experiments/results.txt`; all inputs assumed)
- **The policy value is converged to about 0.15%; the table is not.** Across the three cases, `J` of the DP policy changes by at most about 0.3% from 800 to 1,600 points (e.g. 7,215,104 to 7,225,819 at c = 1e4, s = 50, index rule), and at 1,600 points it is 99.85–100.11% of `J_bb`. The table value is below `J` by 8–13% at 400 points, 4–6% at 800 and 2–3% at 1,600, roughly halving per doubling.
- **So the earlier table gap was discretisation, and the table is a slowly converging lower-looking value, not a certificate.** A first-order (Richardson) extrapolation from the 800 and 1,600 point tables gives 99.84–100.40% of `J_bb` with the index rule, and 100.15–100.76% with the `n` rule. That uses two grids and assumes first-order convergence, which the sequence 100, 200, 400, 800, 1,600 supports only roughly. It suggests the bang-bang switch is within about 1% of the optimum of the discretised problem in these cases; it does not prove it.
- **The two interpolation rules err in opposite directions and neither is better.** In the linear-market check (s = 50, where always copying is feasible), the index rule's table is above the all-copy value (+18.7% at 100 points, +0.21% at 1,600) and the `n` rule's is below it (−20.4%, −0.15%). The `n` rule gave larger gaps than the index rule on the main cases. The hypothesis that linear-in-`n` interpolation would remove the bias is not supported.
- **More control levels did not help.** 81 levels at 400 points moves `J` by less than 0.3% and leaves the gap at −11% to −13%.
- **Bang-bang is not beaten.** The DP policy ties the best switch within 0.2% at 1,600 points (slightly above it in one case, slightly below in two); the differences are at the size of the discretisation error, so no ranking is claimed.

## Limitations
- Every input is assumed; fluid model, cash free, homogeneous fleet, no wear-out, failure 0.
- The cause of the table's downward gap at fixed grid size is not diagnosed (the `n` rule was a hypothesis that failed). Only a log-spaced grid in `n` and a fixed horizon were tried; a grid in the time-to-go or an adaptive grid is not tested.
- The extrapolation rests on an assumed convergence order. Euler discretisation error of the model itself (step 1 h) is shared by all rows and not varied.
- Simulated results only; no claim about a real shop.

## Next steps
Diagnose the bias (for example by comparing with a continuous-time solution of the Hamilton–Jacobi–Bellman equation or a semi-Lagrangian scheme with a higher-order interpolant); vary the Euler step; add the cash constraint.

## Owner steps
- Find the real resale value of a used RepRap-class printer (source and date for each price) and set `s` from it.
- Replace the assumed goods value `a` and market capacity `c` with prices and volumes the shop's goods actually fetch.

## Outside dependencies (vitamins)
Python standard library only, plus the sibling `selfrep-terminalmarket`, `selfrep-satmarket` and `selfrep-growth` source trees (relative paths). The vitamins of the printers it describes are those of `selfrep-closure`.
