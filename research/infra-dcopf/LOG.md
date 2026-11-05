# Research log

## 2026-11-05 · Voltage violations on case39: setpoints and Q, not dispatch
- Prediction (before running): clamping the generator setpoints into the bus band removes most violations. Refuted: 14, 5, 1 buses remain. A uniform setpoint removes all of them (held in the second form of the idea) but leaves 3 to 5 generators outside Q limits; no uniform setpoint satisfies both.
- An AC OPF with P pinned at the DC dispatch is feasible at loads 0.6 and 0.8 (case39 and case30), 0.02 to 0.08 % above the AC optimum; no solution at load 1.0 (not proof of infeasibility).
- Next: a lighter voltage/Q stage; a converging solver at full load.

## 2026-11-05 · Case300 price comparison (negative result)
- Question: with a case whose ratings bind, can the loss and congestion parts of the AC-DC price gap be separated? Answer: not with pandapower's AC OPF. It converged in 3 of 18 (load, limit) cells on case300, with bus prices from -2954 to 1366 per MWh, and the DC dispatch beat the claimed AC optimum in all three, so those are not optima.
- Next: a solver that converges (IPOPT via PowerModels.jl or MATPOWER), validated on MATPOWER's published case300 cost first.

## 2026-11-04 · Nodal loss penalty factors
- Hypothesis: penalty factors from AC loss sensitivities repair the merit order better than a uniform loss share. Refuted at case118 load 1.0 and 1.1 (1.35 and 2.24 % excess vs 1.18 and 1.15 %), supported at 0.6 and 0.8.
- Undamped iteration oscillated (3.5 % and 20.8 % excess at 1.0, 1.1); damping 0.5 stopped that. Convergence not proved.
