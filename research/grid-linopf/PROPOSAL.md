# Proposal: when is a linear OPF safe to dispatch from, and which cheap AC correction makes it safe?

Programme `grid-linopf`, opened 2026-11-12 as the first programme of track 21 (`infra`,
`research/PROJECTS.md`; grid and energy lead that track). Written with AI assistance (Claude Code).
It grows out of `research/infra-dcopf`, which holds every result so far and stays the programme's
working directory for experiments until the paper needs its own (`paper/` here). The DOI and arXiv
registries were refused by the session's egress proxy on 2026-11-12, so `cite_check.py` could not run;
each entry below was confirmed by web search that day (title, authors, venue, identifier), and
"Citation status" lists what is not yet read in full.

## Question

On published transmission benchmarks whose thermal and angle limits bind, how often does a linear
optimal power flow (DC, loss-adjusted DC, or a linearisation of the AC power flow) return a dispatch
that is infeasible once the AC physics is applied, and which correction, at what number of AC power
flows, turns it into an AC-feasible dispatch at the AC optimum's cost, with a guarantee that holds on
cases it was not tuned on?

Open because the accuracy literature measures the DC model's *flow* or *angle* error at given
injections (Stott et al. 2009; Dvijotham and Molzahn 2016) or designs linearisations that minimise
an error norm (Misra et al. 2018; Chen and Singh 2025), while the operational question, whether the
*optimised* dispatch is AC-feasible on stressed cases and how many AC solves it takes to repair it,
is answered case by case, not on a benchmark library with held-out sets.

## Why it matters

Markets and system operators clear energy and price congestion with linear OPFs (security-constrained
economic dispatch runs a DC network model in most US ISOs), and every planning and capacity-expansion
study does too. A linear dispatch that overloads a line or breaks an angle (stability) limit is
corrected afterwards by operator action or out-of-market redispatch, at a cost that falls on
consumers. If a few AC power flows per interval are enough to make the linear dispatch AC-feasible
at the AC optimum's cost, an operator can keep its LP/QP market engine and add a bounded repair step;
if not, the evidence says where the full AC OPF is needed. The answer is for grid operators,
market designers and the open-source tool builders (PowerModels, MATPOWER, pandapower) who ship these
approximations.

## Related work

Accuracy of the DC model and its error bounds:
- Stott, Jardim and Alsaç, "DC power flow revisited", *IEEE Trans. Power Systems* 24(3):1290-1300, 2009, doi:10.1109/TPWRS.2009.2021235. The reference account of DC models, loss handling and hot-start variants; measures flow error, not dispatch feasibility under optimisation.
- Purchala, Meeus, Van Dommelen and Belmans, "Usefulness of DC power flow for active power flow analysis", IEEE PES General Meeting 2005, doi:10.1109/PES.2005.1489581. Flow error versus R/X and loading; no OPF.
- Dvijotham and Molzahn, "Error bounds on the DC power flow approximation: a convex relaxation approach", IEEE CDC 2016, doi:10.1109/CDC.2016.7798623. Rigorous worst-case flow error over an injection ball; does not say whether an optimised dispatch is feasible.
- Molzahn and Hiskens, "A survey of relaxations and approximations of the power flow equations", *Foundations and Trends in Electric Energy Systems* 4(1-2):1-221, 2019, doi:10.1561/3100000012. The map of linearisations and relaxations this programme's methods sit in.

Better linearisations:
- Coffrin and Van Hentenryck, "A linear-programming approximation of AC power flows", *INFORMS J. Computing* 26(4):718-734, 2014, doi:10.1287/ijoc.2014.0594 (arXiv:1206.3614). LPAC: a linear model carrying reactive power and voltage; accuracy shown on flows and cost, not repair to AC feasibility on binding-limit cases.
- Misra, Molzahn and Dvijotham, "Optimal adaptive linearizations of the AC power flow equations", PSCC 2018, https://dvij.github.io/publication/8442547. Linearisations fitted to an operating range by worst-case error minimisation; a strong baseline for a one-shot model.
- Buason, Misra, Watson and Molzahn, "Adaptive power flow approximations with second-order sensitivity insights", 2024, arXiv:2404.04391. Picks where to linearise from curvature; the closest idea to a curvature-aware trust region.
- Chen and Singh, "Optimally linearizing power flow equations for improved power system dispatch", 2025, arXiv:2504.03076. Trains the linearisation for the downstream dispatch task by differentiating through the optimisation; the strongest recent competitor and the method to beat on held-out cases.

Successive linear programming and penalty methods for AC OPF:
- Castillo, Lipka, Watson, Oren and O'Neill, "A successive linear programming approach to solving the IV-ACOPF", *IEEE Trans. Power Systems* 31(4):2752-2763, 2016, doi:10.1109/TPWRS.2015.2487042 (DOI from an aggregator; to confirm on IEEE Xplore). SLP as a full AC OPF solver in current-voltage form; our method C is a narrower SLP that starts from the market's DC dispatch and stops at feasibility.
- Fletcher and Sainz de la Maza, "Nonlinear programming and nonsmooth optimization by successive linear programming", *Mathematical Programming* 43:235-256, 1989, doi:10.1007/BF01582278. The l1-penalty trust-region SLP whose convergence theory a proof here would adapt.

Benchmarks and tools:
- Babaeinejadsarookolaee et al., "The power grid library for benchmarking AC optimal power flow algorithms", 2019, arXiv:1908.02788. PGLib-OPF: TYP, API (congested) and SAD (small angle difference) sets with published objectives; our benchmark and held-out split.
- Zimmerman, Murillo-Sánchez and Thomas, "MATPOWER: steady-state operations, planning, and analysis tools for power systems research and education", *IEEE Trans. Power Systems* 26(1):12-19, 2011, doi:10.1109/TPWRS.2010.2051168. The case format and the DC/AC OPF formulation (PYPOWER is its Python port).
- Coffrin, Bent, Sundar, Ng and Lubin, "PowerModels.jl: an open-source framework for exploring power flow formulations", PSCC 2018, arXiv:1711.01728. The formulations behind PGLib's published DC values (whose susceptance convention differs from MATPOWER's by up to 2.8 %, `infra-dcopf`).
- Thurner et al., "pandapower: an open-source Python tool for convenient modeling, analysis, and optimization of electric power systems", *IEEE Trans. Power Systems* 33(6):6510-6521, 2018, doi:10.1109/TPWRS.2018.2829021.

Our own: `research/infra-dcopf` (13 steps since 2026-10-21; PGLib validation within 0.004 % of the
published AC objectives; DC infeasible on 11 of 11 API cases; successive linearisation C clean on 7 of
11), `research/infra-n1screen`, `research/infra-hosting`.

## Gap

Narrow and checkable against the work above: **a benchmark-wide, held-out measurement of whether a
linear OPF's optimised dispatch is AC-feasible, and of the number of AC power flows a repair needs to
make it so at the AC optimum's cost, on PGLib's congested and angle-limited sets**, with the repair's
rules frozen on one set and scored on the others; and a convergence statement for that repair (a
trust-region SLP started at the DC dispatch) under conditions that can be checked on each case.
Chen and Singh (2025) and Misra et al. (2018) improve the linear model itself; Castillo et al. (2016)
solve the full AC OPF by SLP. None reports feasibility rates of the market dispatch on held-out
binding-limit benchmarks or the AC-solve budget a repair needs.

## Hypotheses

- **H1 (the DC dispatch is not safe where it matters).** On PGLib API and SAD cases the plain DC
  dispatch breaks a thermal or angle limit in AC on at least 80 % of cases with an AC optimum.
  Refuted below 50 %. (API: 11 of 11, `infra-dcopf`.)
- **H2 (a few relinearisations repair it).** A trust-region successive linearisation with rules frozen
  on API reaches an AC-feasible dispatch within 10 rounds on at least 75 % of held-out cases (SAD, then
  the larger PGLib cases), at a cost within 0.1 % of the AC optimum. Refuted below 50 %.
- **H3 (one shot is not enough, even optimally fitted).** A single linearisation (at the DC dispatch,
  or an adaptive/optimised one in the style of Misra et al. or Chen and Singh) is AC-feasible on fewer
  than half of the cases where H2's method is. Refuted if a one-shot model matches it.
- **H4 (theory).** Under a checkable condition (the AC power flow's Jacobian stays nonsingular and the
  limit functions have bounded curvature on the trust region), the repair's merit decreases
  monotonically and reaches feasibility in a number of rounds bounded by the initial violation over the
  minimum per-round decrease; the bound is within a factor of 10 of the observed rounds on the
  benchmark. Refuted if the condition holds on a case where the method cycles.

## Method

Theory: adapt the convergence argument of l1-penalty trust-region SLP (Fletcher and Sainz de la Maza
1989) to the restricted problem "AC-feasible dispatch near a given point, minimal cost", with voltages
held at a schedule, and state the bound in quantities computed from each case (Jacobian conditioning,
second-order sensitivities of flows and angles).
Experiments: PYPOWER's AC power flow and OPF (validated against PGLib's published objectives), PGLib
v23.07 TYP, API and SAD sets of 12 cases each from 14 to 300 buses, then the larger cases (500 to
2,000 buses) when the run time allows. Sensitivities first by finite differences (`infra-dcopf`), then
analytically from the power-flow Jacobian. Voltage schedule: first the AC optimum's (an oracle, as
now), then a schedule not taken from the AC OPF (the case file's, or a reactive stage after the
dispatch), which is what a market engine would have.

## Evaluation

Baselines: plain DC (MATPOWER and PowerModels conventions), uniform derating, iterated loss and rating
correction, loss-factor (penalty-factor) DC, LPAC (Coffrin and Van Hentenryck 2014), a one-shot
optimised linearisation (Misra et al. 2018 or Chen and Singh 2025, reimplemented if no code), and the
full AC OPF (PIPS, and IPOPT through PowerModels when available) as the cost reference.
Metrics: share of cases AC-feasible (thermal, angle, slack limits; voltage and Q reported), AC cost
over the AC optimum, AC power flows used, wall time. Splits: rules tuned on API only, scored on SAD
and the larger cases; load-perturbed copies (seeds 0 to 9, load scaled 0.9 to 1.1 per bus) for
intervals on the rates (Wilson intervals; paired sign tests between methods on the same cases).
Ablations: no trust region, no elastic QP, finite-difference versus analytic sensitivities, oracle
versus non-oracle voltage schedule.

## Milestones

1. Held-out SAD test of the API-tuned repair, frozen and with angle rows (2026-11-12, `infra-dcopf`, `results_sad.txt`).
2. Analytic sensitivities from the Jacobian; same results to 1e-4, fewer power flows (2026-11-13, `infra-dcopf`, `results_sens.txt`, `results_vlin_margin_analytic.txt`: matches central differences to 1.3e-5 scaled, J-m 19 of 34 against 18, 29 against 28 with the reactive stage; 2 power flows per round, but only 1.1x faster because the QP dominates; finished-repair cost path-dependent by up to 3.08 pp).
2b. A sparse or screened QP (rows near their bounds only) so the repair scales to milestone 6's cases; a post-feasibility phase that keeps optimising cost while staying clean.
3. A voltage schedule not taken from the AC optimum; re-run TYP, API, SAD (2026-11-12, `infra-dcopf`, `results_vsched.txt`: at 1.0 pu the repair is clean on 2 of 11 API and SAD, 6 and 7 at the oracle schedule).
3b. Generator voltage setpoints as decision variables in the linearisation, from the case-file start (2026-11-12, `infra-dcopf`, `results_vlin.txt`, `results_vlin_margin.txt`: as planned 5 of 34 fully clean; with interior margins, a post-hoc variant, 18 of 34, and 28 of 34 with the reactive stage, at +0.17 to +0.34 % mean cost; held-out check owed).
4. LPAC and a one-shot optimised linearisation as baselines on all three sets.
5. Load-perturbed copies for intervals; paired tests.
6. Larger PGLib cases (500 to 2,000 buses) as the second held-out set.
7. The convergence statement (H4), checked against observed rounds.
8. `paper/`: an 8-page IEEE Transactions draft with one command per figure.

## Target venue

*IEEE Transactions on Power Systems* (regular paper, 8 to 10 pages double column), with PSCC 2028
(8 pages, full-paper review) as the conference route. An aim, not a claim of acceptance.

## Deep-tech application

The system is a transmission grid's day-ahead and real-time market engine (security-constrained
economic dispatch on a DC network model). The numbers it moves are the share of market intervals
whose dispatch needs out-of-market correction and the redispatch cost of that correction. An ISO
market-engineering group or a grid-software vendor would act on it by adding a bounded AC repair
step to the LP clearing. Trying it on the real thing needs an ISO's network model and historical
intervals (not public); the open path is PGLib and, next, the synthetic Texas and US grids published
by Texas A&M (to be checked for licence and size).

## Citation status

Confirmed by web search on 2026-11-12 (registry lookups refused by the proxy): Stott et al. 2009,
Dvijotham and Molzahn 2016, Molzahn and Hiskens 2019, Coffrin and Van Hentenryck 2014, Misra et al.
2018 (venue and authors from the author's page; no DOI found), Chen and Singh 2025, Castillo et al. 2016
(DOI from an aggregator), MATPOWER 2011, PowerModels (arXiv; PSCC venue not confirmed by that search),
Buason et al. 2024. Carried from `PROJECTS.md` and `infra-dcopf` (checked there): PGLib, pandapower.
Not yet confirmed this session: Purchala et al. 2005 and Fletcher and Sainz de la Maza 1989 (DOIs
written from the citing literature; open before the paper relies on them).
