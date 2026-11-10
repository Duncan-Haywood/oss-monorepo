# energy-cell-dfn: do the lithium-ion cell designs found with a fast model still win under the full porous-electrode model?

Track 16 (`PROJECTS.md`), a fidelity check on [`energy-cell`](../energy-cell), taking its first "Next step" (check the winners against a DFN model). `energy-cell` searched four electrode numbers with PyBaMM's single-particle model with electrolyte (SPMe). Here 49 of its designs (the baseline, the best design of each search run, 36 spread evenly over its SPMe ranking, and 3 designs SPMe could not cycle) are re-scored under the full Doyle-Fuller-Newman model (DFN), with the same parameters, protocol and mass model. Produced with AI assistance (Claude).

**Live page:** https://marisstella.app/research/energy-cell-dfn/

**Headline (modelled, stack level, one parameter set; not a tested cell).** Over the 45 designs both models could cycle, the two models rank cycle-100 energy per kilogram with Spearman correlation **0.86** (0.93 at beginning of life). The SPMe winner (143.4 Wh/kg, a session proposal) is still near the top under DFN: **3rd of 45**, at 160.9 Wh/kg against a DFN best of 163.0 for another design. The design gain survives: the SPMe winner beats the reference cell by **+31% under SPMe and +38% under DFN**. DFN reports more energy than SPMe for almost every design (mean +18.6 Wh/kg, median relative gap 9%), and the gap is far larger for a few designs (up to +127 Wh/kg). SPMe could not cycle 3 designs that DFN cycled normally.

**Builds on.** `research/energy-cell` (code imported unchanged: parameters, mass model, bounds, logged designs); the DFN model of Doyle, Fuller and Newman (1993), *J. Electrochem. Soc.*, and the SPMe reduction as implemented in PyBaMM (Sulzer et al. 2021, *J. Open Research Software*); the `OKane2022` parameter set (O'Kane et al. 2022, *Phys. Chem. Chem. Phys.*). Citations were not re-fetched in this run; check them before reuse. No group in `prompt.md` covers battery design, and none is claimed.

![SPMe against DFN energy at cycle 100](experiments/scatter.svg)

## Method
- `experiments/run.py select` picks the designs deterministically from `energy-cell/experiments/auto.json` and `session.json` (`selected.json`).
- `run.py dfn` scores each under DFN and SPMe with one protocol (100 cycles, 5 A discharge to 2.5 V, 5 A charge to 4.2 V, solvent-diffusion-limited SEI and irreversible lithium plating; score = discharge Wh at cycle 100 per kg of stack). The SPMe baseline reproduces `energy-cell`'s 109.1 Wh/kg (a test checks it). DFN needed 4 to 13 GB of memory per design and did not release it, so each design runs in a fresh process (about 35 s each). Per-design results are in `experiments/dfn.jsonl`.
- `run.py report` writes `experiments/results.txt`; `figure.py` draws the scatter from it.

## Results
See `experiments/results.txt` (sections A to C; every design is listed). In short:
- Baseline: SPMe 109.1, DFN 116.3 Wh/kg at cycle 100.
- The top SPMe designs (140-143 Wh/kg) span roughly 154 to 163 Wh/kg under DFN, so the near-plateau that `energy-cell` found is not flat under DFN: DFN would pick a different design from within it (115 µm, porosities 0.38 / 0.28, N/P ratio 1.3, at 163.0).
- The large disagreements are on designs SPMe scores low or zero: one scores 27.6 under SPMe and 129.9 under DFN. Section "Why SPMe fails" below traces the cause.

## Why SPMe fails (diagnosis, 2026-10-31)
`experiments/diagnose.py`, `diagnose2.py`, `diagnose3.py` re-run the failing designs and keep what `evaluate_with` swallowed (outputs: `diagnose.txt`, `diagnose2.txt`, `diagnose3.txt`). Findings, all modelled with the same parameters and no measured data:
- **The three "0.0" scores are a solver error, not a physical verdict.** PyBaMM raises `SolverError: All steps in the cycle ... are infeasible due to exceeded bounds at initial conditions` after SPMe's first 5 A discharge ends early. In the first cycle, SPMe moves only 2.1 Ah for one of them against 7.9 Ah under DFN (positive-electrode porosity 0.21, 138 µm). `evaluate_with` caught the exception and scored 0, so `energy-cell`'s search read these as infeasible.
- **The two low scores (18.9 and 27.6) are a collapse after the first cycle.** Cycle-1 energy is normal (29.2 and 20.5 Wh), cycle-2 energy is 0.22 and 3.0 Wh. At 5 A the SPMe charge reaches 4.2 V after 0.35 Ah (design `bayes3`, negative porosity 0.204) where DFN charges 5.6 Ah. At a 2 A charge SPMe and DFN agree within a few percent (7.6 against 7.5 Ah for `bayes3`) and there is no collapse. So the failure is a rate effect, and DFN carries 5 A in all five cases.
- **Where it happens.** Over all 48 designs, the relative gap (DFN minus SPMe)/DFN correlates with positive-electrode thickness (Spearman 0.64) and hardly with porosity alone (0.03 for positive, -0.29 negative). The 6 designs with a gap above 30% are all 113 µm or thicker, and 5 of the 6 have positive porosity below 0.25 (11 designs in the set do).
- **Electrolyte term isolated (2026-11-06, `experiments/diagnose4.py`, output `diagnose4.txt`).** For `bayes3` (113 µm, porosities 0.288 / 0.204, N/P 1.16) over two cycles, SPMe's electrolyte concentration goes **negative** during the 5 A charge: minimum −37 mol/m³ in cycle 1 (initial 1,000 mol/m³ scale, maximum 3,229), and the charge then ends after 0.355 Ah in cycle 2. A negative salt concentration is unphysical and the electrolyte-dependent terms (conductivity, exchange current, potential) are then evaluated outside their valid range. DFN stays positive throughout (minimum 4 mol/m³ at the end of the first discharge, 41 in cycle 2) and carries 5.6 Ah per charge. At a 2 A charge SPMe's minimum is 72 mol/m³ and DFN's is 4 to 22, and the two agree on capacity within 3%. So the collapse is the reduced model's electrolyte transport failing in the thin-pore (negative porosity 0.204) high-rate case, not a degradation effect: the negative-electrode porosity is unchanged (0.204) at the end of every step. One design, one parameter set; the other four failures were not probed this way, and the plating variable name did not exist in this PyBaMM version (26.10.1.1), so plating was not compared.
- **The other four failures, probed the same way (2026-11-07, `experiments/diagnose5.py`, output `diagnose5.txt`; 5 A charge, two cycles, SPMe against DFN; PyBaMM 26.10.1.1, one parameter set).**
  - The 27.6 Wh/kg design (`random1`: 149.6 µm, porosities 0.249 / 0.251, N/P 0.93) repeats the `bayes3` pattern. SPMe's electrolyte concentration goes negative (minimum −25 mol/m³ in cycle 1), the 5 A charge then ends after 0.72 Ah, and cycle 2 discharges 1.0 Ah. DFN charges 5.0 Ah per cycle with a minimum of 1 to 2 mol/m³, never negative. So two of the two low-score designs show the negative-concentration signature.
  - The three zero-score designs cannot be probed this way: SPMe raises the same `SolverError` (infeasible at initial conditions) before it returns any solution, so there is no SPMe concentration to read. DFN carries all three at 5 A, but charges only 1.9 to 5.5 Ah per cycle and its concentration reaches about 0 mol/m³ (rounds to 0 or −0): the two designs with positive porosity 0.20 to 0.21 and negative porosity 0.20 charge 1.9 Ah and 4.5 Ah, the third (negative porosity 0.389) 5.5 Ah. These are close to electrolyte depletion even under DFN, which fits (does not prove) the SPMe failure being the same mechanism.
  - Not done: plating was not compared (variable absent in this PyBaMM version), and no run changes the SPMe electrolyte treatment to see the failure go away, so "electrolyte transport" is still the best-supported explanation, not a tested cause.
- **Electrolyte treatment changed (2026-11-10, `experiments/diagnose6.py`, output `diagnose6.txt` / `diagnose6.json`; hypotheses logged first in `LOG.md`).** Same two low-score designs, 5 A charge, two cycles; Ah of the cycle-2 charge:

  | case | `bayes3` SPMe | `bayes3` DFN | `random1` SPMe | `random1` DFN |
  |---|---|---|---|---|
  | as before (D<sub>e</sub> &times;1, composite conductivity) | 0.36 (c<sub>e</sub> min &minus;37) | 5.60 (min 4) | 0.72 (min &minus;25) | 4.94 (min 1) |
  | SPMe conductivity `integrated` | 3.19 (min &minus;37) | | 2.19 (min &minus;25) | |
  | electrolyte diffusivity &times;2 | 6.24 (min 404) | 6.35 (min 418) | 5.73 (min 422) | 5.82 (min 383) |
  | electrolyte diffusivity &times;4 | 6.45 (min 673) | 6.54 (min 675) | 5.93 (min 692) | 6.09 (min 675) |

  - Doubling the electrolyte diffusivity (conductivity unchanged) removes the negative concentration and the collapse in both designs: SPMe's cycle-2 charge rises from 0.36 to 6.24 Ah and from 0.72 to 5.73 Ah, within 2% of DFN's at the same diffusivity (DFN moves by 13% and 18%). So the collapse is set by electrolyte salt transport, and the SPMe&ndash;DFN disagreement in this region is confined to the regime where the electrolyte nearly empties.
  - Swapping SPMe's conductivity treatment does not remove it. `composite` is identical to the default; `integrated` (the integrated form of Brosa Planella, Sheikh and Widanage 2021, *Electrochimica Acta* 388, 138524, doi:10.1016/j.electacta.2021.138524, taken from PyBaMM's CITATIONS.bib; the DOI lookup was refused by the proxy in this run) raises the cycle-2 charge to 3.19 and 2.19 Ah but the concentration still goes negative and the gap to DFN stays 43% and 56%. `leading order` is not accepted for SPMe in PyBaMM 26.10.1.1. By the threshold logged in advance (cycle-2 charge below 1 Ah under every option), H1 is not refuted, because `integrated` passes 1 Ah: the potential treatment changes how badly SPMe fails, the diffusion limit decides whether it fails.
  - DFN's reaction distribution (H3) was not measured as planned. The minimum concentration during the cycle-1 charge sits at the first time point, inherited from the discharge and on the positive-electrode side (node 59 of the cell grid), so the negative-electrode |j| max/mean read there (1.16 to 1.69) says nothing about depletion in the negative electrode. Logged as a flawed measurement, not a result.
  - One parameter set (OKane2022), two designs, two cycles; the diffusivity scaling is a sensitivity probe, not a claim about any real electrolyte.
- **What this still does not show.** The pattern fits SPMe's reduced electrolyte treatment breaking down at high rate with thick, poorly connected electrodes, and the 2026-11-10 run ties it to salt diffusion (doubling the diffusivity removes it), but with no measured cell neither model is shown to be the accurate one.
- **Consequence for `energy-cell`.** Its 0-score region (thick electrode, low porosity) was partly an SPMe artefact at the 5 A rate, so a search that treats it as infeasible has pruned designs DFN cycles normally (120 to 140 Wh/kg at cycle 100 here). Re-searching with a charge-rate-aware or DFN score is the natural next step.

## Direct DFN search (2026-11-01)
`experiments/dfn_search.py` runs the `energy-cell` proposers (random, Gaussian-process Bayesian) with the same 30-evaluation budget but scoring every candidate with DFN (cycle-100 Wh/kg). Outputs: `experiments/dfn_search_<proposer><seed>.json`. 2 seeds per proposer, so this shows a size, not a ranking.
| proposer, seed | best DFN Wh/kg | design (positive thickness &micro;m, pos. porosity, neg. porosity, N/P) | zero scores |
|---|---|---|---|
| Bayesian 0 | 164.3 | 135.6, 0.385, 0.268, 1.30 | 0 |
| Bayesian 1 | 164.4 | 128.9, 0.389, 0.286, 1.30 | 0 |
| random 0 | 155.1 | 131.3, 0.383, 0.321, 1.19 | 0 |
| random 1 | 159.7 | 101.2, 0.390, 0.229, 1.28 | 0 |
- The best design the SPMe-guided route reaches (SPMe search, then re-scored under DFN) is 163.0 Wh/kg. Direct DFN Bayesian search finds 164.3-164.4, **about 0.8% more**, in the same region: positive electrode 129-136 &micro;m, positive porosity 0.385-0.39, N/P at the top of the range. So SPMe screening costs little here; the DFN optimum is a nearby point on the same plateau.
- Under DFN no evaluation scored 0 (120 evaluations): the zeros in `energy-cell` were SPMe's, as diagnosed above. `failures.json` (from `classify_failures.py`) re-runs the three SPMe zeros with the failure labels: all three are `solver_error`, infeasible at initial conditions.
- Random search is 3-9 Wh/kg behind Bayesian here, unlike under SPMe where the proposers tied; with 2 seeds, treat as suggestive.
- Not shown: any measured cell; the 1% gap is inside what a parameter uncertainty would move. Each evaluation runs in a fresh process because a single in-process DFN search exceeded 14 GB and was OOM-killed (cost 30 s each).

## Limitations
- 49 designs, one cell, one parameter set, one protocol. The designs were chosen to spread across the SPMe ranking, so the correlation is not the one over the whole search space or over what a search visits.
- Both models use the same degradation submodels and the same parameters; DFN giving more energy is not evidence that it is closer to a real cell. No measured data is used, so neither model is validated here.
- Stack-level mass only (no casing or tabs), as in `energy-cell`.

## Next steps
Compare plating once the variable name is found; measure DFN's negative-electrode reaction distribution during the charge (not at the step start, see diagnose6); find how far the diffusivity can drop before the SPMe winners' ranking changes, since the failing region is set by it; more DFN-search seeds and a tuned GP; compare both models with measured discharge curves.

## Reproduce
`python experiments/run.py select|dfn|report`, then `python experiments/figure.py` (needs numpy, scipy, pybamm; `dfn` needs a lot of RAM headroom and takes about 30 minutes). Tests: `pytest research/energy-cell-dfn/tests`.

## Outside dependencies
PyBaMM and its parameter data. Cell fabrication, cycling and measured parameters are owner steps.
