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
- **Without the oracle voltages (milestone 3, 2026-11-12):** at PGLib's own 1.0 pu generator setpoints the same repair clears **2 of 11** API and **2 of 11** SAD cases, and none of its dispatches meets voltage and Q limits; an AC OPF over voltages only, after it, makes 16 of 34 cases fully feasible but at a mean 0.8 to 4.3 % above the optimum's cost ([`results_vsched.txt`](../infra-dcopf/experiments/results_vsched.txt)). The repair has to move voltages with P.
- **Voltages as decision variables (milestone 3b, 2026-11-12):** a repair that moves the generator voltage setpoints with P, with voltage and Q limits as linear rows, run from the 1.0 pu start, is fully feasible on only 5 of 34 cases as pre-registered. It ends within 0.1 % of every limit on 19 but rarely strictly inside. With a small margin inside every limit, a variant chosen after that result, it is fully feasible on **18 of 34**, and on **28 of 34** with the voltage-only stage after it, at a mean **0.17 to 0.34 %** above the AC optimum's cost (milestone 3's best: 16 at 0.8 to 4.3 %). This is tuned on the cases it is scored on; a held-out run is next ([`results_vlin_margin.txt`](../infra-dcopf/experiments/results_vlin_margin.txt)).
- **Analytic sensitivities (milestone 2, 2026-11-13):** taking the repair's sensitivities from the power-flow Jacobian (one sparse solve per round, matching central differences to 1.3e-5) leaves the outcome counts where they were: **19 of 34** fully feasible (finite differences: 18), **29 of 34** with the voltage-only stage (28). It does not make the repair much faster (1.1x): the QP takes 98 to 99 % of the time. And the cost of a finished repair moves by up to 3.1 points with the derivative source, because the method stops at its first feasible round ([`results_vlin_margin_analytic.txt`](../infra-dcopf/experiments/results_vlin_margin_analytic.txt)).

**Not yet shown:** the voltage-moving repair on a held-out set with its rules frozen, the strongest one-shot
linearisations (LPAC, optimised linearisations) as baselines, intervals over perturbed loads, cases
above 300 buses, and the convergence statement. Written with AI assistance (Claude Code).
