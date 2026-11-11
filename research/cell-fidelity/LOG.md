# cell-fidelity research log

## 2026-11-11 · Outcome: the flag works (AUC 0.997), but cycle count, not model reduction, is where the cost is
- H1 supported: SPMe's 2-cycle minimum electrolyte concentration (`r_min`) separates the 7 untrusted designs from the 42 trusted with ROC AUC 0.997 (bootstrap 95% 0.980 to 1.000). The 3 solver failures count as `r_min = 0` by the plan; over the 46 designs SPMe solved, AUC is 0.994 (4 untrusted). A flag at `r_min <= 0.10` catches all 7 with 1 false flag (design 30, gap 0.17); at `r_min <= 0` it catches 6 with none.
- H2 supported: Spearman(`r_min`, relative gap) = -0.833 over 49.
- H3 refuted, and this is the finding that changes the plan: a 2-cycle run costs SPM 0.3 s, SPMe 1.2 s, DFN 1.3 s (median of 3, baseline design, fresh process, set-up included), so SPMe/DFN = 0.88. Extra run, not in the plan: at 100 cycles, SPM 1.0 s, SPMe 3.9 s, DFN 27.9 s (one run each), SPMe/DFN = 0.14. Going from 100 cycles to 2 saves 21x on DFN; going from DFN to SPMe at 100 cycles saves 7x. A 2-cycle *DFN* run costs no more than the 2-cycle SPMe flag, so the cheapest trustworthy screen may be short-horizon DFN, not SPMe.
- Replay: DFN-verifying the top 10 by SPMe already returns the DFN best of the 49 (163.0); the top 1 to 5 returns 160.9 (regret 2.1, 1.3%). Adding the flagged designs costs 8 DFN calls and finds nothing better, because the designs SPMe mis-scores are not the DFN optimum in this sample. The flag's value is in not pruning a region, not in the best design here.
- Plan change: milestone 2 adds the cycle count as a fidelity axis (2, 10, 30, 100 cycles x SPM, SPMe, DFN) and asks whether early-cycle DFN ranks 100-cycle DFN as well as 100-cycle SPMe does.
- Output: `experiments/trust/results.txt`, `probe.jsonl`, `cost.json`, `cost100.json`, `summary.json`, `trust.svg`.

## 2026-11-11 · Milestone 1: can the cheap model flag where it cannot be trusted? (plan, written before the run)
- Question: `energy-cell-dfn` found that SPMe and DFN agree on most of 49 `energy-cell` designs (median gap 9%) but disagree badly on a few (SPMe 0 to 27.6 Wh/kg where DFN gives 120 to 146), and traced the failures to electrolyte salt depletion. A multi-fidelity search needs to know *before* paying for DFN which cheap scores to distrust. The candidate indicator is free: SPMe's own minimum electrolyte concentration, read from a short SPMe run.
- Data: the 49 designs of `energy-cell-dfn/experiments/selected.json` with their committed 100-cycle SPMe and DFN scores (`dfn.jsonl`, not re-run). New runs: each design under SPMe for 2 cycles (5 A discharge to 2.5 V, 5 A charge to 4.2 V; the `energy-cell` protocol and OKane2022 parameters), recording the minimum electrolyte concentration over space and time divided by the initial 1000 mol/m3 (`r_min`), whether the solve failed, and wall time. A solver failure counts as `r_min = 0`.
- Label (fixed now): a design is *untrusted* when SPMe's cycle-100 score is below DFN's by more than 25% of DFN's (`(DFN - SPMe) / DFN > 0.25`), or SPMe scored 0.
- H1: `r_min` separates untrusted from trusted designs with ROC AUC at least 0.90. Refuted if AUC < 0.80.
- H2: across all 49, `r_min` and the relative gap `(DFN - SPMe) / DFN` have Spearman correlation at most -0.5. Refuted if above -0.3.
- H3 (cost): one 2-cycle SPMe run costs under a tenth of a 2-cycle DFN run on the baseline design (wall time, 3 repeats each, one process). Refuted if the ratio is above 0.25.
- Also reported (no hypothesis): the screen-then-verify replay on the committed scores (DFN on the top-k by SPMe, with and without the flagged designs added), and its regret to the DFN best of the 49.
- Script: `experiments/trust/run.py`; outcome logged above this entry.
