# Research log

## 2026-11-11 · Line outages: do penalty factors survive a topology change?
- Question (next step 2): factors taken at the pre-outage AC optimum, applied to the DC OPF of the network after a single line trip (the DC model knows the new topology; only the factors are stale). case118 at its own load (k=1.0), the 20 most-loaded lines whose trip keeps every bus supplied, plus 20 others drawn at random (seed 0).
- Prediction (written before running): stale factors beat plain DC on at least 80 % of outages; their gap to the post-outage oracle grows with the tripped line's pre-outage flow; on at least one outage the stale factors do worse than plain DC.

## 2026-11-11 · PGLib-OPF: published ratings that bind
- Question: with the benchmark's own ratings (no synthetic caps), how bad is the DC OPF on congested cases? 12 PGLib-OPF v23.07 cases, TYP and API sets.
- Solver check first: AC within 0.004 % of PGLib's published IPOPT objectives on 23 of 24 (case179 API no convergence). The published DC values only match with PowerModels' DCP convention (b = x/(r²+x²), no taps); MATPOWER's 1/(x tap) differs by up to 2.8 % and is infeasible on case240 TYP. Not expected before running.
- Expectation (held informally, not written down before the run): most API dispatches would overload and a 5 to 10 % derate would fix them. The first held (11 of 11); the second did not: derating clears 1 of 11 before the DC becomes infeasible, and an iterated loss + per-branch correction also clears 1 of 11 (8 TYP cases clean).
- Next: an AC-informed linearisation at a nearby AC point on the API set; dual-based LMP decomposition.

## 2026-11-08 · Stale penalty factors at the steepest real ramps
- Prediction (before running): factors age gracefully for a few hours and lose most of their gain by 12 hours. Half refuted: gap to oracle grows from 0.01 point (1 to 3 h) to 0.16 point (12 h), but stale factors beat plain DC in all 50 hours and cut its excess 58 % at 12 h (0.584 vs 1.406 %).
- 10 hours per lag, one case, uniform load shape, no outage. Next: line-trip stress test.

## 2026-11-07 · Penalty factors from a previous interval
- Prediction (before running): factors from a 0.1-lower load level keep most of the gain; a 0.2 step much less. Supported: case118 at load 1.0 excess 0.402 % (0.1 step) and 0.703 % (0.2 step) vs 0.367 % oracle and 1.479 % plain DC.
- Load scale stands in for time; next a real hourly profile.

## 2026-11-06 · Penalty factors at the AC optimum
- Prediction (before running): factors from sensitivities at the AC optimum fix the high-load failure of the iterated version. Supported: case118 excess 0.367 % (load 1.0) and 0.339 % (1.1) against 1.345 and 2.236 %; unchanged at 0.6 and 0.8.
- Caveat: it uses the AC optimum, so it is a bound on what factors can do, not a deployable scheme. Next: factors from a previous-interval estimate.

## 2026-11-06 · Case300: a converging AC solver, and loss versus congestion
- Prediction (before running): with caps on the most loaded branches, the DC price spread would match the AC congestion part and the loss-only spread would be small. Half refuted: DC tracks AC congestion with 3 caps (5.60 vs 5.57), but the loss-only AC spread (7 to 10 $/MWh) exceeds the congestion spread with 3 caps, and DC understates congestion with 10 caps (6.75 vs 25.63).
- Solver check first: PYPOWER's PIPS gives 719,725.08 on case300, equal to MATPOWER's published value.
- Capping every branch is infeasible; synthetic caps are a limitation. Next: published congested case and dual-based decomposition.

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
