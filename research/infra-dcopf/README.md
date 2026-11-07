# infra-dcopf: how wrong is the DC approximation of optimal power flow on the IEEE 30-, 39- and 118-bus cases?

Track 21 (`infra`), grid first. Grid dispatch is routinely planned and priced with the DC optimal power flow (a linear programme with no losses and no voltage), and the AC OPF is the physics it stands in for. This project measures the difference on three standard cases, with the same cost curves and limits in both models: how far off is the DC model's cost, and what happens when its dispatch is run through an AC power flow? Produced with AI assistance (Claude). No method transfer from outside power systems; the benchmark use of IEEE cases follows the pandapower and MATPOWER literature. No CU Boulder group's work is reproduced and no connection is claimed.

**Live page:** https://marisstella.app/research/infra-dcopf/

**Headline (modelled in pandapower on the MATPOWER/IEEE cases; not a measured system; results in `experiments/results.txt`).**
- **IEEE 118-bus, no branch binding:** the DC OPF reports a cost **1.9 to 2.9 % below** the AC optimum (it cannot see 55 to 150 MW of losses). Running its dispatch through an AC power flow (the slack pays the losses) costs **0.7 to 1.7 % more than the AC optimum** (up to 1.9 % with limits scaled by 0.5) with no voltage or loading violation, so the DC dispatch is feasible but wrongly ordered; the excess grows with load (0.73 % at 0.6 of the case's load, 1.48 % at 1.0, 1.68 % at 1.1).
- **IEEE 39-bus:** the DC cost is 1.0 to 1.5 % below the AC optimum, and the DC dispatch is nearly free in cost terms (within 0.06 %) but **breaks voltage limits**: 15 buses out of band at 0.6 of load, 5 at 0.8, 1 at the case's load (highest 1.079 pu).
- **IEEE 30-bus:** the DC cost is 1.3 to 2.3 % below; at the case's load the DC dispatch overloads one branch to 111 % and is 0.31 % *cheaper* than the AC optimum, which is the signature of a violated constraint, not a better plan.
- **Reading:** the DC model's price error is a loss term of 1 to 3 % here, and the danger of its dispatch is not cost but reactive and voltage limits it never modelled, on the smaller cases. Neither is a large number, and none says DC is wrong for planning.

![IEEE 118-bus: DC OPF cost error and AC cost of the DC dispatch](experiments/gap_vs_load.svg)

## Does feeding the losses back fix it? (loss-adjusted DC, `experiments/results_lossadj.txt`)
`loss_adjusted_dc` solves the DC OPF, runs its dispatch through an AC power flow, spreads the measured losses over all loads in proportion to their power, and re-solves, until the losses move by under 0.05 MW (2 to 4 passes). Everything else is as above. Losses are placed uniformly, not where they occur, which is the simplest scheme; nodal loss factors are the next step.
- **The cost estimate is largely repaired.** On the 118-bus case the adjusted DC cost is within **0.6 to 1.2 %** of the AC optimum, against 1.9 to 2.9 % below it for plain DC. On case30 and case39 it is within 0.4 % (plain DC: 1.0 to 2.3 % below).
- **The dispatch is barely repaired.** The AC cost of the adjusted 118-bus dispatch is 0.58 to 1.18 % above the AC optimum, against 0.73 to 1.68 % for plain DC: it recovers only **13 to 32 %** of the excess (0.6, 0.8, 1.0, 1.1 of load: 13, 23, 20, 32 %). The surviving excess is generators ordered by a loss-blind marginal cost, which a uniform loss share does not change.
- **No effect on voltages.** Case39 still has 15, 5 and 1 buses out of band at 0.6, 0.8 and 1.0 of load, exactly as plain DC; the losses are not what breaks them (reactive power is, step 3 below).
- On case30 and case39 the dispatch differences are within 0.1 % of cost and change sign, so the "recovered" percentage there is not meaningful. The load 1.1 rows of case30 and case39 returned no solution from the AC OPF.
- **Reading:** loss feedback is the right fix for the *price level* and the wrong one for the *merit order*. Fixing the order needs losses charged at the margin where they occur (penalty factors).

## Nodal loss penalty factors (added 2026-11-04, `experiments/run_penalty.py`, `results_penalty.txt`)
`penalty_adjusted_dc` adds to the uniform loss share each generator's penalty factor 1/(1 - dLoss/dP), from a finite-difference AC loss sensitivity (+1 MW at the generator, the external grid absorbing), applied as a multiplier on the generator's cost curve, with the factors updated each pass (damped 0.5; undamped it oscillated at full load). Dispatches are priced with the original costs under AC power flow. AC cost of the dispatch above the AC optimum, case118:

| load | plain DC | uniform loss share | penalty factors |
|---|---|---|---|
| 0.6 | 0.728 % | 0.635 % | 0.559 % |
| 0.8 | 0.750 % | 0.577 % | 0.461 % |
| 1.0 | 1.479 % | 1.179 % | 1.345 % |
| 1.1 | 1.678 % | 1.149 % | 2.236 % |

- **Mixed result, one solver, one dispatch point per cell.** Penalty factors repair the merit order further at light load (at 0.8 they recover about 39 % of plain DC's excess against 23 % for the uniform share), but at the case's full load and above they are *worse* than the uniform share and, at 1.1, than plain DC. A first undamped run was far worse (3.5 and 20.8 %), so the damping matters and I have not shown the damped iteration converges; the sensitivities are taken at the DC dispatch, not the AC optimum, and an operating point where the slack's own loss sensitivity differs from the marginal one may make the factors wrong.
- On case30 and case39 differences are within 0.1 % and change sign, as before; not interpretable. Load 1.1 has no AC solution on those two.
- So step 2 is not "done": penalty factors are not a safe fix at high load here. Next: take sensitivities at the AC optimum (one-shot), or use a distributed slack.

## Case300: pandapower's AC OPF does not give usable prices (added 2026-11-05, `experiments/run_case300.py`, `results_case300.txt`)
Next step 1 asked for a case whose published ratings bind. MATPOWER `case300` (300 buses, 68 generators) was run at loads 0.5 to 1.0 and branch-limit factors 1.0, 0.5, 0.3, with the AC OPF tried from pandapower's default start and then from a flat start.
- **The AC OPF converged in 3 of 18 cells** (loads 0.6, 0.7, 0.8 at the published limits); nowhere at full load or with tightened limits. The DC OPF solved in all 18.
- **No DC branch binds** in any converged cell, so DC prices are one flat number (31.9, 34.0, 36.0).
- **The AC prices are not credible.** Bus prices range from -2954 to 115 per MWh at load 0.6, 31 to 83 at 0.7, and -16 to 1366 at 0.8, against a DC price of about 32 to 36. The AC-optimum cost is 2.6 to 4.0 % *above* the DC cost, and the DC dispatch run through AC power flow costs 0.7 to 2.0 % *less* than the claimed AC optimum, which cannot happen at a true optimum. So these are local or poorly converged points of a non-convex problem, not optima.
- **Conclusion for this step:** I could not separate the loss and congestion components of price on case300 with this solver. The comparison needs a different AC OPF solver (for example IPOPT through PowerModels.jl or MATPOWER's own MIPS/IPOPT) and a check against MATPOWER's published case300 optimum; both are outside this container. Until then, the case118 LMP result above is the only price comparison here, and case300 AC cost figures should not be quoted.

## Voltage violations: a setpoint and reactive problem, not a dispatch one (added 2026-11-05, `experiments/run_voltage.py`, `results_voltage.txt`)
Next step 3 asked whether voltage-band constraints in the LP would remove case39's violations. Before building that LP I held the *same* DC dispatch under AC with different voltage controls (case39, loads 0.6, 0.8, 1.0; pandapower, one solver):
- **Setpoints matter, not P.** As shipped, the PV buses are held at the case's `vm_pu` (up to 1.064, above the 1.06 band), giving 15, 5 and 1 buses out of band. Clamping setpoints into the band alone fixes almost nothing (14, 5, 1; the last is 1.0600 by rounding). A single uniform setpoint (1.005, 1.010, 1.015) gives **0 voltage violations** at 0.02 to 0.07 % cost difference from the AC optimum.
- **But that breaks reactive limits.** pandapower does not enforce generator Q limits in a power flow; checking them, the uniform setpoint leaves 5, 3 and 3 generators outside their Qmin/Qmax, and no uniform setpoint on a 0.005 grid satisfies both voltage and Q at any of the three loads.
- **A simple per-generator rule fails too:** nudging each generator's setpoint against its own Q violation (`q_balancing_setpoints`) found a feasible profile at load 1.0 only, not at 0.6 or 0.8 (a heuristic, not an optimiser).
- **The DC dispatch itself is fine.** An AC OPF with real power pinned to the DC dispatch (`reactive_redispatch`, only voltages, Q and slack free) finds a feasible profile at 0.6 and 0.8 on case39 (vmax 1.06, cost **0.023 and 0.039 %** above the AC optimum) and on case30 (0.078, 0.069 %). At load 1.0 pandapower returned no solution on either case, which is not proof of infeasibility.
- **Reading:** the violations come from fixed voltage setpoints and reactive capability, which the DC model (and a plain power flow) leave uncontrolled. A voltage-aware *P* dispatch is not what is missing; a voltage/Q stage after the DC dispatch is. Not shown: that this holds on other cases, with N-1, or at full load. No LP with voltage-band constraints was built, so step 3 as written is answered by a different route.

## Penalty factors taken at the AC optimum (added 2026-11-06, `experiments/run_penalty_acopt.py`, `results_penalty_acopt.txt`)
Next step 2 asked for loss sensitivities at the AC optimum instead of at a DC dispatch. `ac_optimum_penalty_dc` solves the AC OPF, takes the finite-difference loss sensitivities there (same `loss_sensitivities`, slack as reference), sets the loss level to the AC optimum's own losses, and solves the DC OPF once on penalty-scaled costs (no iteration, nothing to damp). AC cost of the resulting dispatch above the AC optimum, case118:

| load | plain DC | uniform loss share | iterated penalty factors | factors at AC optimum |
|---|---|---|---|---|
| 0.6 | 0.728 % | 0.635 % | 0.559 % | 0.563 % |
| 0.8 | 0.750 % | 0.577 % | 0.461 % | 0.464 % |
| 1.0 | 1.479 % | 1.179 % | 1.345 % | **0.367 %** |
| 1.1 | 1.678 % | 1.149 % | 2.236 % | **0.339 %** |

- **The failure at high load was the sensitivity point, not the idea.** With sensitivities at the AC optimum the penalty-factor dispatch recovers about 75 % (load 1.0) and 80 % (1.1) of plain DC's excess, against 9 % and -33 % for the iterated version; at 0.6 and 0.8 the two versions agree (within 0.004 points).
- **This is a diagnostic bound, not a method.** It uses the AC optimum, which a DC planner does not have; it shows what factors evaluated at the right operating point can do. A practical scheme needs factors from a good estimate of that point (for example a previous interval's AC solution).
- Case30 and case39: differences are within 0.1 % and change sign, as before, so not interpretable; load 1.1 has no AC solution there. One solver, one dispatch point per cell.

## Penalty factors from a previous interval (added 2026-11-07, `experiments/run_prev_interval.py`, `results_prev_interval.txt`)
Next step 2 asked for a usable scheme: `previous_interval_penalty_dc` takes factors and loss share from the AC optimum at a *different* load level (standing in for the previous dispatch interval) and solves one DC OPF at the current load, with no AC solve there. AC cost above the current AC optimum, case118 (prediction before running: a 0.1 step keeps most of the gain, a 0.2 step much less):

| previous load | current load | plain DC | factors from previous | factors at current optimum |
|---|---|---|---|---|
| 0.5 | 0.6 | 0.728 % | 0.570 % | 0.563 % |
| 0.7 | 0.8 | 0.750 % | 0.472 % | 0.464 % |
| 0.9 | 1.0 | 1.479 % | 0.402 % | 0.367 % |
| 1.0 | 1.1 | 1.678 % | 0.368 % | 0.339 % |
| 0.8 | 1.0 | 1.479 % | 0.703 % | 0.367 % |
| 1.0 | 0.8 | 0.750 % | 0.471 % | 0.464 % |

- A 0.1 load step keeps 88 to 90 % of the oracle's gain at high load (0.402 vs 0.367 against plain 1.479) and nearly all at low load. Supported.
- A 0.2 upward step (0.8 to 1.0) keeps about 70 % of it (0.703 %); stale factors still beat plain DC, but the sensitivity point matters, consistent with the earlier finding. Stepping down (1.0 to 0.8) costs almost nothing.
- Limits: one network (case118), a load scale stands in for a real interval (same load shape, no outages or renewables), one solver, one dispatch point per cell.

## Method (`src/infra_dcopf/dcopf.py`)
- **Cases.** `case30`, `case39` and `case118` from `pandapower.networks` (MATPOWER cases), with their quadratic generator costs (`poly_cost`).
- **Two OPFs per condition.** `runopp` (AC, PIPS interior point, voltage and branch loading limits) and `rundcopp` (DC), on the same network with load scaled by 0.6, 0.8, 1.0 and 1.1 (P and Q together).
- **DC dispatch under AC.** The DC generator set-points are fixed in an AC power flow with the external grid as slack; we count buses outside their voltage limits, branches above their loading limit, and the cost of the resulting dispatch (slack included) with the same cost function (`gen_cost`, checked to match pandapower's `res_cost` to 1e-6).
- **Tightened limits.** A second sweep scales every line's `max_i_ka` and transformer `sn_mva` by 0.7 and 0.5 to force congestion. Many of those runs have no solution (below).

## Checks (`tests/`, 8)
A two-bus network with a closed-form answer (DC cost 10x50 + 0.01x50^2 = 525; the AC slack supplies load plus line loss); `gen_cost` equals pandapower's cost on case39; the 118-bus DC dispatch is feasible and costs no less than the AC optimum; the DC cost error lies in 1 to 5 %; case39's DC dispatch breaks voltage limits at light load; the loss-adjusted model's cost on case118 is under half of plain DC's error and the losses it feeds back exceed 50 MW; on the two-bus case its fed-back loss equals the AC loss of its dispatch.

## Limitations
- **"No solution" is not "infeasible".** A row marked `no solution` means pandapower's solver returned an error; for the tightened-limit sweeps on case30 and case39 this happens often, and I did not separate true infeasibility from non-convergence. Those rows prove nothing about the cases. At limits x0.7 case30 solves only at 0.6 of load.
- **On case118 the thermal limits never bind.** The case's `max_i_ka` is large (peak branch loading 2.9 to 9 % of it even at 0.5 limits), so the 118-bus rows are a losses-only comparison, not a congestion study. LMP and congestion-rent error are not measured here (next step).
- **Single dispatch point per condition, no unit commitment, no N-1 security.** Costs are the cases' own, in the case currency, not market prices; the loss share depends on each case's line data, taken as published.
- One solver per model (pandapower's PYPOWER-based OPF); another solver might differ at the margin on the non-convex AC problem.
- Safety-critical note: this is research on a benchmark. Any operational use of dispatch methods needs the system operator and licensed engineers.

## LMP comparison on case118 (added 2026-11-02)
`experiments/run_lmp.py` (about 1 min) compares bus prices (`lam_p`) from pandapower's AC and DC OPF on case118 at nominal load, with every line's `max_i_ka` scaled by f so some limits bind. Output: `experiments/results_lmp.txt`.

| f | DC binding lines | mean AC / DC LMP | mean abs LMP gap | AC price spread | DC price spread |
|---|---|---|---|---|---|
| 1.00 to 0.05 | 0 | 39.4 to 39.5 / 39.38 | 0.9 to 1.3 | 4.7 to 5.4 | 0.00 |
| 0.04 | 2 | 39.32 / 39.56 | 1.33 | 6.39 | 1.99 |
| 0.03 | 2 | 39.23 / 39.92 | 1.47 | 9.02 | 6.81 |

Findings (one case, one load level, preliminary):
- Where no DC line binds, the DC price is flat (one system price). The AC price still varies by 4.7 to 5.4 per MWh across buses, which is the loss component. A lossless model cannot show it, so the DC-to-AC LMP gap there (about 1 per MWh, roughly 2.4 % of the price) is a loss effect, not congestion.
- Only at f <= 0.04 (limits at 4 % of case118's published ratings, an extreme setting; the case's ratings are loose, see Limitations) do two lines bind and DC prices separate. Even then the AC spread (6.4, 9.0) exceeds the DC spread (2.0, 6.8): the DC model understates the price separation.
- The load-weighted "rent" column is a proxy (sum of (LMP minus system mean) times load), not settlement-grade congestion rent. The AC proxy includes losses, so the DC-AC rent difference mixes both effects. Separating them needs nodal loss factors (next step 2).
- Correlation of bus prices is undefined (nan) while the DC prices are flat, and 0.31 to 0.39 once two lines bind.

## Case300 with a converging AC solver (loss versus congestion), 2026-11-06
Next step 1 above, done. `experiments/run_case300_pypower.py` uses PYPOWER's primal-dual interior-point AC OPF (`pip install pypower`, a port of MATPOWER's PIPS). **Validation first:** on unmodified case300 it returns 719,725.08 $/h, equal to MATPOWER's published optimum (719,725.08) to the cent, where pandapower's solver failed in 15 of 18 cells (above).
Loss and congestion are separated by differencing two AC solves: with no branch limits, the bus-price spread is losses (and voltage effects) only; adding limits and subtracting leaves the congestion part. Case300's own ratings do not bind, so the n most loaded branches are capped at a fraction f of their free-flow value (binding by construction; capping all branches is infeasible and the solver says so). Full table: `experiments/results_case300_pypower.txt`.

| load | f | n capped | AC cost rise from limits | AC loss-only price spread ($/MWh) | AC congestion part (max abs shift) | DC price spread |
|---|---|---|---|---|---|---|
| 0.8 | 0.90 | 3 | 0.025 % | 7.15 | 1.53 | 1.93 |
| 0.8 | 0.90 | 10 | 0.179 % | 7.15 | 25.63 | 6.75 |
| 1.0 | 0.90 | 3 | 0.067 % | 9.57 | 2.45 | 3.13 |
| 1.0 | 0.80 | 3 | 0.275 % | 9.57 | 5.57 | 5.60 |

Findings (this one case, 12 converged cells of 18 attempted; 6 were infeasible for AC or both):
- Losses alone spread bus prices by 7 to 10 $/MWh, larger than the congestion spread when only 3 branches bind. A DC model, whose spread is congestion only, therefore misses the larger part of the price gap in that regime; with 10 caps the congestion part (25.6) dominates.
- DC's congestion spread tracks the AC congestion shift within about 0.2 to 1.0 $/MWh when 3 branches bind (5.60 vs 5.57 at load 1.0, f 0.8) and understates it badly with 10 (6.75 vs 25.63): once many limits bind, the DC price is a poor guide.
- DC cost is 1.4 to 1.9 % below AC cost in every cell, because DC drops losses; this is not DC "being cheaper".
- Limitation: caps are synthetic, not published ratings. The loss/congestion split by differencing is an approximation (the two solves can also differ through voltage-limit effects).

## Next steps
1. Solver validated and loss/congestion split done with synthetic caps (section above). Next: a case whose published ratings bind (e.g. a PGLib-OPF congested case) and an exact decomposition from the AC duals instead of differencing.
2. Previous-interval factors keep ~90 % of the oracle gain for 0.1 load steps (above). Next: a real time series (e.g. an hourly load profile), a DC-based estimate of the point, or a distributed slack.
3. Done by another route (see "Voltage violations" above). Next: a voltage/Q stage that is not a full AC OPF, and full-load feasibility with a solver that converges.

## Reproduce
```bash
pip install pytest numpy pandapower
cd research/infra-dcopf
python -m pytest -q tests                     # 11 tests, about 20 s
PYTHONPATH=src python experiments/run.py      # about 1 min; writes experiments/results.txt
PYTHONPATH=src python experiments/run_penalty_acopt.py  # about 3 min; writes results_penalty_acopt.txt
PYTHONPATH=src python experiments/run_prev_interval.py  # about 2 min; writes results_prev_interval.txt
PYTHONPATH=src python experiments/run_lossadj.py  # loss-adjusted DC, about 1 min; writes results_lossadj.txt
PYTHONPATH=src python experiments/run_case300_pypower.py  # about 2 min; needs pypower; writes results_case300_pypower.txt
PYTHONPATH=src python experiments/run_case300.py  # case300 sweep, about 1.5 min; writes results_case300.txt
python experiments/run_lmp.py                 # LMP comparison, about 1 min; writes experiments/results_lmp.txt
PYTHONPATH=src python experiments/run_voltage.py  # voltage setpoint study, about 1 min; writes results_voltage.txt
python experiments/figure.py                  # experiments/gap_vs_load.svg
```

## References
(DOIs from memory; the DOI resolver was unreachable through the proxy, so they were not looked up in this run.)
- Thurner, L. et al. (2018), pandapower, *IEEE Trans. Power Systems* 33(6), doi:10.1109/TPWRS.2018.2829021.
- Zimmerman, R. D., Murillo-Sanchez, C. E., Thomas, R. J. (2011), MATPOWER, *IEEE Trans. Power Systems* 26(1), doi:10.1109/TPWRS.2010.2051168.
- Stott, B., Jardim, J., Alsac, O. (2009), DC power flow revisited, *IEEE Trans. Power Systems* 24(3), doi:10.1109/TPWRS.2009.2021235.

## Outside dependencies
pandapower (and its PYPOWER-derived solvers), the MATPOWER case data it ships.
