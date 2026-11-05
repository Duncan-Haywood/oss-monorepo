---
title: "DC dispatch voltage violations on IEEE 39-bus are a setpoint problem"
date: 2026-11-05
---
When a DC optimal-power-flow dispatch is run through an AC power flow on the IEEE 39-bus case, 15 buses leave their voltage band at 60 % load. I expected that to call for voltage constraints in the dispatch. It doesn't.

Holding the same dispatch with different voltage controls (pandapower, one solver): clamping setpoints into the band fixes almost nothing, one uniform setpoint removes every violation but pushes 3 to 5 generators past their reactive limits, and an AC OPF with real power pinned to the DC dispatch is feasible at 60 and 80 % load for 0.02 to 0.04 % extra cost. At full load that solver returned no solution, which is not a proof of infeasibility.

So the missing piece is a voltage and reactive stage after the dispatch, not a different dispatch. One solver, two small cases, no N-1. Code and tables: `research/infra-dcopf/` (`experiments/results_voltage.txt`).
