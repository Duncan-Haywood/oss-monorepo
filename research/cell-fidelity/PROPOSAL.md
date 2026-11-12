# Proposal: fidelity-aware lithium-ion cell design search

Programme `cell-fidelity`, opened 2026-11-11 (track 16, energy). Written with
AI assistance (Claude Code). This is a plan, not a result: nothing below has
been measured unless it cites a file in this repository. Bibliographic details
were checked against PyBaMM's bundled `CITATIONS.bib` (PyBaMM 26.10.1.1) where
marked **[bib]**, or taken from another programme in this repository that
cites the same work, marked **[repo]**. `research/_shared/cite_check.py`
could not reach doi.org or arxiv.org from this session (proxy 403), and the
works marked **[unchecked]** are cited from memory: check them before any
reuse. Claims about what a work does come from its title, abstract and
standard knowledge of the field, not a full re-reading in this session.

## Question

When a lithium-ion cell's electrode design (thickness, porosity, loading,
N/P ratio) is searched with a reduced electrochemical model (SPM, SPMe) and
checked with the full porous-electrode model (DFN), which designs does the
cheap model mis-score, can that be predicted from the cheap model's own
output before any DFN call, and how much DFN budget does a search that uses
the prediction save while still returning the DFN optimum, checked against
measured cells?

It is open because the reduced models' error is known *asymptotically*
(small electrolyte gradients, low C-rate; Marquis et al. 2019,
Brosa Planella et al. 2021, Richardson et al. 2020), but design searches push
exactly into thick, dense, high-rate electrodes where those assumptions
break, and nobody has turned the asymptotic validity condition into a
per-design trust test that a multi-fidelity search can act on. Our own
`energy-cell-dfn` found that SPMe ranks 45 designs like DFN (Spearman 0.86)
yet scores a few at 0 to 28 Wh/kg where DFN gives 120 to 146, because of
salt depletion, and that `energy-cell`'s SPMe search had pruned that region as
infeasible.

## Why it matters

Cell designers at EV, UAV and grid-storage manufacturers screen electrode
designs in simulation before building pouch cells, and the thick-electrode,
low-porosity designs that raise Wh/kg are where reduced models are least
reliable. A practitioner using PyBaMM or a commercial P2D tool today picks
one fidelity and either pays for DFN on every candidate (seconds to minutes
each, gigabytes of memory per 100-cycle run in our experience) or trusts
SPMe and silently loses the high-energy region. A trust test that costs
nothing extra, plus a search that spends DFN only where the test fires,
changes that trade, and says when the cheap screen is safe. The artefact is
a drop-in PyBaMM search loop.

## Related work

**Porous-electrode models and their reductions.**
- Newman and Tobias (1962), theoretical analysis of current distribution in
  porous electrodes, *J. Electrochem. Soc.* 109, 1183 **[bib]**
  (https://doi.org/10.1149/1.2428700, DOI from memory **[unchecked]**).
  Porous-electrode theory; the reaction-distribution argument behind why
  thick electrodes defeat x-averaged models. No design search.
- Doyle, Fuller and Newman (1993), galvanostatic charge and discharge of the
  lithium/polymer/insertion cell, *J. Electrochem. Soc.* 140, 1526,
  doi:10.1149/1.2221597 **[bib]**. The DFN (P2D) model, our high fidelity.
  Says nothing about when cheaper models suffice for design.
- Marquis, Sulzer, Timms, Please and Chapman (2019), an asymptotic derivation
  of a single particle model with electrolyte, *J. Electrochem. Soc.* 166,
  A3693, doi:10.1149/2.0341915jes **[bib]**. SPMe and its error order in the
  C-rate; validity is asymptotic, not a per-design test.
- Brosa Planella, Sheikh and Widanage (2021), reduced
  thermal-electrochemical model by asymptotic methods, *Electrochimica Acta*
  388, 138524, doi:10.1016/j.electacta.2021.138524 **[bib]**. Extends the
  reduction with thermal coupling and validates on data; no design use.
- Richardson, Korotkin, Ranom, Castle and Foster (2020), generalised single
  particle models for high-rate operation of graded electrodes,
  *Electrochimica Acta* 339, 135862, doi:10.1016/j.electacta.2020.135862
  **[bib]**. Shows standard SPMs fail at high rate and proposes corrected
  ones; the closest prior work on *where* reductions break, but not as a
  search-time trust test.
- Brosa Planella et al. (2022), a continuum of physics-based lithium-ion
  battery models reviewed, *Progress in Energy* 4, 042003,
  doi:10.1088/2516-1083/ac7d31 **[unchecked]**. Review of the model
  hierarchy; frames the fidelity ladder this programme searches over.

**Tools and parameter sets.**
- Sulzer, Marquis, Timms, Robinson and Chapman (2021), PyBaMM, *J. Open
  Research Software* 9, 14, doi:10.5334/jors.309 **[bib]**. The simulator; all
  rungs share one parameter set and mesh, so rung differences are model
  differences.
- Chen et al. (2020), experimental techniques for parameterisation of
  multi-scale lithium-ion battery models, *J. Electrochem. Soc.* 167, 080534,
  doi:10.1149/1945-7111/ab9050 **[bib]**. LG M50 (NMC811/graphite-SiOx)
  parameters, the base of `OKane2022`.
- O'Kane et al. (2022), lithium-ion battery degradation: how to model it,
  *Phys. Chem. Chem. Phys.* 24, 7909, doi:10.1039/D2CP00417H **[bib]**. The
  coupled SEI and plating set our 100-cycle score uses.
- Ecker et al. (2015), parameterisation of a physico-chemical model, I and
  II, *J. Electrochem. Soc.* 162, A1836 and A1849, doi:10.1149/2.0551509jes
  and doi:10.1149/2.0541509jes **[bib]**; Ai et al. (2020), *J. Electrochem.
  Soc.* 167, 013512, doi:10.1149/2.0122001JES **[bib]**. The measured curves
  `energy-cell-dfn` already used to separate SPMe from DFN at 2C.

**Cell design.**
- Lain, Brandon and Kendrick (2019), design strategies for high power vs.
  high energy lithium-ion cells, *Batteries* 5, 64,
  doi:10.3390/batteries5040064 **[bib]**. The thickness and porosity trade the
  search explores, from manufactured cells; no model-fidelity question.

**Battery optimisation with learning.**
- Attia et al. (2020), closed-loop optimisation of fast-charging protocols
  with machine learning, *Nature* 578, 397, doi:10.1038/s41586-020-1994-5
  **[unchecked]**. Multi-fidelity in spirit (early-cycle prediction as the
  cheap rung, Bayesian optimisation) on real cells; protocols, not electrode
  design, and the cheap rung is data-driven, not a reduced physics model.
- Severson et al. (2019), data-driven prediction of battery cycle life before
  capacity degradation, *Nature Energy* 4, 383, doi:10.1038/s41560-019-0356-8
  **[unchecked]**. The early-prediction rung Attia builds on.

**Multi-fidelity optimisation.**
- Kennedy and O'Hagan (2000), predicting the output from a complex computer
  code when fast approximations are available, *Biometrika* 87, 1,
  doi:10.1093/biomet/87.1.1 **[repo]** (`hanger-codesign` cites it, marked
  there as not looked up). The autoregressive co-kriging baseline.
- Peherstorfer, Willcox and Gunzburger (2018), survey of multifidelity
  methods, *SIAM Review* 60, 550, doi:10.1137/16M1082469 **[repo]**
  (`sim2real-inference`). Adaptation, fusion and filtering; filtering by a
  trust test is the strategy tested here.
- Kandasamy, Dasarathy, Schneider and Poczos (2017), multi-fidelity Bayesian
  optimisation with continuous approximations, ICML, arXiv:1703.06240
  **[unchecked]**. BOCA; assumes fidelity error is smooth and bounded, which
  the SPMe collapse is not.
- Huang, Allen, Notz and Miller (2006), sequential kriging optimization using
  multiple-fidelity evaluations, *Struct. Multidisc. Optim.* 32, 369,
  doi:10.1007/s00158-005-0587-0 **[checked 2026-11-12]**. Augmented EI, the
  fidelity rule milestone 4b runs on co-kriging; it fixes the start design, which
  4b found decides the outcome.
- Kandasamy, Dasarathy, Oliva, Schneider and Poczos (2016), multi-fidelity
  Gaussian process bandit optimisation, arXiv:1603.06288 **[checked
  2026-11-12]**. MF-GP-UCB's rule (query the cheap fidelity while its
  uncertainty exceeds a cost-scaled threshold), run in milestone 4b with the
  threshold from the fitted discrepancy.
- Poloczek, Wang and Frazier (2017), multi-information source optimisation,
  NeurIPS, arXiv:1603.00389 **[unchecked]**. Models source bias with a GP;
  a strong baseline for H3.
- Li, Jamieson, DeSalvo, Rostamizadeh and Talwalkar (2018), Hyperband,
  *JMLR* 18, arXiv:1603.06560 **[repo]** (`verified-dse`). Successive halving
  across fidelities, the bandit baseline.

**Our own prior work.** `research/energy-cell` (SPMe design search, four
variables, random against GP-EI against a session proposer);
`research/energy-cell-dfn` (49 designs re-scored under DFN, the salt
diffusion diagnosis, direct DFN search, measured-curve check);
`research/verified-dse` (the same multi-fidelity question for chip flows,
whose negative halving result is a warning for H3).

## Gap

Three things, each checkable against the list above. (1) A **per-design
trust test** for a reduced battery model computed from its own solution (the
minimum electrolyte concentration, and the asymptotic small parameters it
implies), evaluated as a classifier of where SPMe's *design score* (not its
voltage) is wrong. Marquis 2019 and Richardson 2020 give the asymptotic
conditions; neither tests them as a search-time filter. (2) A
**multi-fidelity electrode-design search** (SPM, SPMe, DFN rungs) compared
against single-fidelity BO, BOCA-style and Hyperband-style baselines at equal
wall-clock budget. Attia 2020 is multi-fidelity on protocols with a
data-driven rung. (3) A **check of the winning designs against measured
cells**, which neither our own work nor the asymptotic papers do for design
optima.

## Hypotheses

- **H1 (trust test).** SPMe's minimum electrolyte concentration from a
  2-cycle run classifies designs whose 100-cycle SPMe score is more than 25%
  below DFN's with ROC AUC at least 0.90 on the `energy-cell-dfn` designs.
  Refuted if AUC < 0.80. (Milestone 1.)
- **H2 (asymptotics).** The trust test's threshold matches the asymptotic
  validity condition of Marquis 2019 (electrolyte concentration variation of
  order one) within a factor of 2, so it transfers across parameter sets
  without refitting. Refuted if the best threshold on `Chen2020`/`OKane2022`
  misclassifies more than 20% of designs on `Ecker2015` or `Ai2020`.
- **H3 (search).** An SPMe search that DFN-verifies only flagged designs and
  a top-k shortlist reaches within 1% of direct DFN-BO's best (164.3 to 164.4
  Wh/kg in `energy-cell-dfn`) using at most a third of the DFN calls, over at
  least 10 seeds. Refuted if its median gap exceeds 2% at that budget or
  Hyperband / BOCA match it at a smaller budget.
- **H4 (real cells).** The design ranking under DFN agrees better with
  measured rate capability of published thick-electrode cells than SPMe's
  ranking does. Refuted if the measured data cannot tell them apart (the
  `energy-cell-dfn` finding at low rate).

## Method

**Theory.** Derive the trust test from the SPMe expansion: SPMe's error is
controlled by the electrolyte concentration variation relative to its mean;
where the cheap solution's own minimum approaches zero the expansion is
invalid. Bound the regret of screen-then-verify search by the number of
designs above the cheap model's score threshold whose flag is false
(a fidelity-inversion count in the style of `verified-dse`'s halving bound).

**Experiments.** PyBaMM 26.x, `OKane2022` as the design cell, the
`energy-cell` design space and protocol (5 A charge and discharge, 100
cycles, SEI and plating on), stack-level Wh/kg. Rungs: SPM, SPMe, DFN, and
DFN on a refined mesh as a convergence check. Each DFN call in a fresh
process (it does not release memory). Transfer: `Ecker2015`, `Ai2020`,
`Chen2020` parameter sets. Measured data: the curves PyBaMM ships (Ecker,
Ai) and published rate tests on thick electrodes, sourced and dated.

## Evaluation

Baselines at equal wall-clock: random search on DFN; GP-EI on DFN (as in
`energy-cell-dfn`); SPMe-only GP-EI with a top-k DFN re-score; Hyperband
over the rungs; a two-fidelity co-kriging BO (Kennedy and O'Hagan) and a
BOCA-style continuous-fidelity BO. Metrics: best DFN Wh/kg at a budget,
DFN calls and wall time to within 1% of the best known, trust-test AUC with
bootstrap intervals, Spearman between rungs. At least 10 seeds per
search, medians with 95% bootstrap intervals, paired Wilcoxon tests between
methods. Ablations: trust test off; threshold swept; SPM in place of SPMe.

## Milestones

1. **Trust test on logged designs** (this session): 2-cycle SPMe minimum
   concentration on the 49 `energy-cell-dfn` designs against their committed
   SPMe and DFN scores; H1; rung cost table; screen-then-verify replay.
2. **Dense paired benchmark**: SPM, SPMe and DFN on a few hundred
   space-filling designs (Sobol), cached, so search baselines replay without
   re-running PyBaMM.
3. **Theory**: the trust test from the SPMe expansion and the regret bound.
4. **Search comparison** on the cached benchmark (H3), 10+ seeds.
5. **Transfer** to `Ecker2015`, `Ai2020`, `Chen2020` (H2).
6. **Measured-cell check** of the rankings (H4).
7. **Paper draft** in the venue's format, one command per figure.

## Target venue

*Journal of Power Sources* or *Journal of The Electrochemical Society*
(the field's journals, full-length papers with supplementary code), with
*Applied Energy* as an alternative for the search-cost framing. An aim, not a
claim of acceptance. Submission is an owner step.

## Deep-tech application

The system is the electrode-design loop of a cell maker or a pack integrator
choosing a custom cell (EV, UAV, power tool). The number it moves is
DFN-verified Wh/kg found per hour of compute, and the region of design space
a reduced-model screen wrongly discards. A modelling engineer running
PyBaMM or a commercial P2D tool would act on it by adopting the trust test
as a filter. Trying it on the real thing means building a few pouch cells at
flagged and unflagged designs and running rate tests, which is an owner step
with certified equipment (track 16 guardrails).
