# Proposal: multi-fidelity, verification-aware design-space search for open-source chip flows

Programme `verified-dse`, opened 2026-10-24. Written with AI assistance
(Claude Code). This is a plan, not a result: nothing below has been measured
unless it cites an existing project in this repository. Related-work claims
come from the papers' titles and abstracts as returned by
`research/_shared/cite_check.py`; the full texts have not all been read, and
the proposal says where a claim rests on that.

## Question

Given a hardware design with a large space of flow and design choices (ABC
pass sequences, clock targets, placement utilisation, arithmetic
architecture), how much of the cost of finding a Pareto-good design on real
SKY130 place-and-route can be saved by (a) ranking candidates on cheap
fidelity rungs (generic-gate synthesis, then liberty-mapped synthesis, then
placement, then routing) and (b) predicting, before paying for a formal
equivalence proof, whether a candidate will pass it, with a guarantee that
holds whatever the rung-to-rung bias?

It is open because multi-fidelity search is well understood for
hyperparameters and Gaussian-process surrogates, while chip-flow search
papers mostly use one fidelity and treat equivalence as a binary filter at
the end. Our own `chip-pnr` measured that synthesis-only estimates and
placed-and-routed numbers disagree by design; nobody has said how much that
disagreement costs a search that trusts the cheap rung.

## Why it matters

Open flows (Yosys, ABC, OpenROAD) put a full RTL-to-GDS run within reach of a
laptop, but a single run still costs minutes to hours, and a search needs
hundreds. Teams, and LLM-driven RTL-rewriting loops like our `chip-ppa-loop`,
therefore pick a rung and live with its bias. A method that spends cheap
rungs on elimination, spends place-and-route only on survivors, and spends
formal proofs only where they are likely to pass changes what an
open-source design-space search costs, and tells a practitioner when the
cheap rung is safe to trust.

## Related work

**Multi-fidelity search.**
- Kandasamy, Dasarathy, Schneider & Poczos (2016), *Multi-fidelity Gaussian
  process bandit optimisation*; [arXiv:1603.06288](https://arxiv.org/abs/1603.06288).
  Regret analysis for GP optimisation with cheap approximations of known
  maximum bias. It assumes a bound on the bias; whether rung bias in chip
  flows has such a bound is the open part.
- Takeno et al. (2019), *Multi-fidelity Bayesian optimization with max-value
  entropy search and its parallelization*; [arXiv:1901.08275](https://arxiv.org/abs/1901.08275).
  An information-theoretic acquisition over fidelities. A candidate method
  here, not a chip-specific one.
- Jamieson & Talwalkar (2015), *Non-stochastic best arm identification and
  hyperparameter optimization*; [arXiv:1502.07943](https://arxiv.org/abs/1502.07943).
  Successive halving: spend budget on cheap rungs and cull. No guarantee when
  the cheap rung's ranking differs from the expensive one.
- Li et al. (2017), *Hyperband*; [arXiv:1603.06560](https://arxiv.org/abs/1603.06560),
  and Falkner, Klein & Hutter (2018), *BOHB*; [arXiv:1807.01774](https://arxiv.org/abs/1807.01774).
  The strongest simple multi-fidelity baselines; the ones a chip-flow search
  has to beat.
- Balandat et al. (2020), *BoTorch*; [arXiv:1910.06403](https://arxiv.org/abs/1910.06403).
  The software for Monte-Carlo Bayesian optimisation with multi-fidelity
  acquisitions; our implementation baseline.

**Search for chip flows.**
- Yu, Xiao & De Micheli (2018), *Developing synthesis flows without human
  knowledge*; [arXiv:1804.05714](https://arxiv.org/abs/1804.05714). Learns
  ABC pass sequences; evaluates on synthesis-level quality, one fidelity.
- Huang et al. (2021), *Machine learning for electronic design automation:
  a survey*; [arXiv:2102.03357](https://arxiv.org/abs/2102.03357). The map of
  where ML enters EDA; used to check what has not been done.
- Mirhoseini et al. (2021), *A graph placement methodology for fast chip
  design*, Nature; [doi:10.1038/s41586-021-03544-w](https://doi.org/10.1038/s41586-021-03544-w),
  and the reassessment *An updated assessment of reinforcement learning for
  macro placement*; [arXiv:2302.11014](https://arxiv.org/abs/2302.11014). A
  warning on baselines: the headline learned method was re-evaluated against
  stronger conventional ones. This programme commits to equal-budget,
  strong baselines for the same reason.

**Tools and verification.**
- Brayton & Mishchenko (2010), *ABC: an academic industrial-strength
  verification tool*, CAV; [doi:10.1007/978-3-642-14295-6_5](https://doi.org/10.1007/978-3-642-14295-6_5).
  The synthesis and equivalence engine in Yosys flows; defines the pass
  space we search.
- Yosys (<https://yosyshq.net/yosys/>), OpenROAD and OpenROAD-flow-scripts
  (<https://theopenroadproject.org/>). The open flow; no paper is cited for
  OpenROAD here.

**Distribution-free guarantees.**
- Angelopoulos & Bates (2021), *A gentle introduction to conformal
  prediction and distribution-free uncertainty quantification*;
  [arXiv:2107.07511](https://arxiv.org/abs/2107.07511). The route to
  coverage guarantees for "this candidate will pass the proof" and "this
  rung's estimate is within x of the final" without a model of the bias.
  Applying it to rung-to-rung prediction in an EDA flow is, as far as the
  survey above shows, not done; that rests on the survey and a search of
  abstracts, not exhaustive reading.

**Our own prior steps** (small, mostly single-design studies; this programme
consolidates them). `chip-toolchain` (open flow and Yosys miter equivalence),
`chip-ppa-loop` (equivalence-gated rewrites against a sweep),
`chip-ppa-sky130mac` (does a generic-gate score rank SKY130 cells
the same way), `chip-pnr` (synthesis-only versus placed-and-routed on SKY130),
`chip-scriptsearch` (ABC pass sequences: random versus hill climbing at equal
budget), `accel-nsga` and the `accel-*` surrogate projects.

## Gap

1. **Rung-to-rung bias measured on real SKY130 place-and-route for a pass
   space**, not one design: how often does the cheap rung's ranking of
   candidates disagree with the routed ranking, and by how much?
2. **A multi-fidelity search with a coverage guarantee on its final
   claim**: the set returned contains a design within epsilon of the routed
   Pareto front with stated probability, whatever the bias, by calibrating
   rung predictions on a small routed pilot.
3. **Verification-aware budgeting**: predicting equivalence-proof success
   and cost from cheap features, and charging the proof inside the search
   budget rather than as a final filter.

## Hypotheses

- **H1 (bias is large).** On a benchmark of at least 8 designs, the
  generic-gate rung's Kendall tau against routed area-delay is below 0.7 on
  at least a third of designs. *Refuted if* tau is at least 0.7 on all but
  one design.
- **H2 (multi-fidelity wins at equal budget).** At equal wall-clock budget,
  a successive-halving or multi-fidelity-BO search over the rungs finds a
  routed design with lower area-delay than single-fidelity random search
  and hill climbing, with the paired difference's 95% interval excluding 0
  on most designs. *Refuted if* the interval includes 0 on most designs.
- **H3 (it cannot be trusted blind).** Plain successive halving on the
  cheap rung loses more than 5% of routed area-delay against the best known
  on at least one design that a calibrated variant recovers. *Refuted if*
  the plain variant is within 5% everywhere.
- **H4 (coverage).** A conformal rung-calibrated shortlist keeps nominal
  coverage (the true routed optimum within epsilon is in the set) within 2
  points on held-out designs. *Refuted if* coverage falls more than 2
  points below nominal.
- **H5 (proofs are predictable).** A classifier on cheap features predicts
  Yosys/ABC equivalence-proof success or timeout with AUC at least 0.8 on
  rewrites of held-out designs. *Refuted if* AUC is below 0.7.

## Method

Theory: under a bounded rung-bias assumption that a routed pilot can check,
bound the regret of successive halving as a function of the bias and the
number of rungs, and show where the bound is vacuous (the case in H3).
Experiments: a benchmark of designs (adders, multipliers, MACs, FIFOs,
small ALUs, from `chip-toolchain`, `chip-pnr` and open collections, with
licences checked) with a pass-sequence and clock-target space; four rungs
(generic gates, SKY130 liberty mapping, placement, global route plus
timing repair) measured with the OpenROAD-flow-scripts SKY130 HD platform
as in `chip-pnr`; the equivalence gate is the Yosys miter used in
`chip-ppa-loop`. Every rung's cost is its measured wall-clock time on the
session machine, not an assumed ratio.

## Evaluation

Baselines on equal wall-clock budgets: random search, hill climbing
(`chip-scriptsearch`), NSGA-II (`accel-nsga`), Hyperband and BOHB, and
single-fidelity GP Bayesian optimisation via BoTorch. Metrics: routed
area-delay of the best design found, hypervolume for the two-objective
case, rung Kendall tau, shortlist coverage, proof AUC. At least 20 seeds
per cell; paired bootstrap intervals; Wilcoxon signed-rank across designs.
Ablations: drop each rung, drop the conformal calibration, charge versus
ignore proof cost.

## Milestones

1. **Rung-bias benchmark.** Measure all four rungs on 8 or more designs over
   a pass-sequence space; report H1. Land the cost table. (Next session.)
2. **Search baselines at equal budget** on the cached benchmark, so search
   comparisons need no re-running of the flow.
3. **Successive halving and BO across rungs**; report H2 and H3.
4. **Conformal shortlist**; report H4.
5. **Proof-success model** from rewrites; report H5.
6. **Theory**: regret bound under the pilot-checkable bias assumption.
7. **Paper draft** in the venue's format and a one-command-per-figure
   artefact.

## Target venue

MLCAD (the ACM/IEEE Workshop on Machine Learning for CAD), with ICCAD as
the stretch target for the full version; MLCAD takes 6-page papers with
an optional artefact. An aim, not a claim of acceptance. Submission is an
owner step.
