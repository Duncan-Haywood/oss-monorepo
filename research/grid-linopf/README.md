# When is a linear optimal power flow safe to dispatch from, and which cheap AC repair makes it safe?

**Live page:** https://marisstella.app/research/grid-linopf/

**Status: open research programme (opened 2026-11-12), track 21 (`infra`, grid first).** Markets and
grid operators dispatch generators with a linear (DC) optimal power flow. This programme measures, on
the PGLib-OPF benchmark library with its published thermal and angle limits, how often that dispatch
breaks a limit once the AC physics is applied, and how many AC power flows a repair needs to make it
feasible at the AC optimum's cost, with the repair's rules frozen on one set and scored on held-out
sets. Plan, related work and hypotheses: [`PROPOSAL.md`](PROPOSAL.md); log: [`LOG.md`](LOG.md).
Experiments run in [`research/infra-dcopf`](../infra-dcopf) (13 steps since 2026-10-21).

**Results so far (modelled on PGLib-OPF v23.07 with PYPOWER; AC optima within 0.005 % of the published values; voltages held at the AC optimum's schedule unless stated):**
- The plain DC dispatch overloads branches on **all 11** congested (API) cases with an AC optimum; derating or iterated loss and rating feedback repairs 1 of 11 ([`infra-dcopf`](../infra-dcopf/README.md)).
- A trust-region successive linearisation of the AC power flow (loss factors and flow sensitivities by finite differences, a QP, an elastic fallback) repairs **7 of 11** API cases at the AC optimum's cost; its rules were set on those cases.
- **Held-out (milestone 1, 2026-11-12):** on the 12 angle-limited SAD cases, the same rules plus two linearised angle rows per branch repair **7 of the 11** with an AC optimum, the tuning set's rate; the angle-blind version repairs 3, and its dispatches sit 6.5 to 17.6 % below the optimum's cost because they break up to 16 angle limits. The misses end within 0.01 % of a limit ([`results_sad.txt`](../infra-dcopf/experiments/results_sad.txt)).
- **Without the oracle voltages (milestone 3, 2026-11-12):** at PGLib's own 1.0 pu generator setpoints the same repair clears **2 of 11** API and **2 of 11** SAD cases, and none of its dispatches meets voltage and Q limits; an AC OPF over voltages only, after it, makes 16 of 34 cases fully feasible but at a mean 0.8 to 4.3 % above the optimum's cost ([`results_vsched.txt`](../infra-dcopf/experiments/results_vsched.txt)). The repair has to move voltages with P (next milestone).

**Not yet shown:** a repair that moves voltage setpoints with active power, the strongest one-shot
linearisations (LPAC, optimised linearisations) as baselines, intervals over perturbed loads, cases
above 300 buses, and the convergence statement. Written with AI assistance (Claude Code).
