# cell-fidelity research log

## 2026-11-11 · Milestone 1: can the cheap model flag where it cannot be trusted? (plan, written before the run)
- Question: `energy-cell-dfn` found that SPMe and DFN agree on most of 49 `energy-cell` designs (median gap 9%) but disagree badly on a few (SPMe 0 to 27.6 Wh/kg where DFN gives 120 to 146), and traced the failures to electrolyte salt depletion. A multi-fidelity search needs to know *before* paying for DFN which cheap scores to distrust. The candidate indicator is free: SPMe's own minimum electrolyte concentration, read from a short SPMe run.
- Data: the 49 designs of `energy-cell-dfn/experiments/selected.json` with their committed 100-cycle SPMe and DFN scores (`dfn.jsonl`, not re-run). New runs: each design under SPMe for 2 cycles (5 A discharge to 2.5 V, 5 A charge to 4.2 V; the `energy-cell` protocol and OKane2022 parameters), recording the minimum electrolyte concentration over space and time divided by the initial 1000 mol/m3 (`r_min`), whether the solve failed, and wall time. A solver failure counts as `r_min = 0`.
- Label (fixed now): a design is *untrusted* when SPMe's cycle-100 score is below DFN's by more than 25% of DFN's (`(DFN - SPMe) / DFN > 0.25`), or SPMe scored 0.
- H1: `r_min` separates untrusted from trusted designs with ROC AUC at least 0.90. Refuted if AUC < 0.80.
- H2: across all 49, `r_min` and the relative gap `(DFN - SPMe) / DFN` have Spearman correlation at most -0.5. Refuted if above -0.3.
- H3 (cost): one 2-cycle SPMe run costs under a tenth of a 2-cycle DFN run on the baseline design (wall time, 3 repeats each, one process). Refuted if the ratio is above 0.25.
- Also reported (no hypothesis): the screen-then-verify replay on the committed scores (DFN on the top-k by SPMe, with and without the flagged designs added), and its regret to the DFN best of the 49.
- Script: `experiments/trust/run.py`; outcome logged above this entry.
