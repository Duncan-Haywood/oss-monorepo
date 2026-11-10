# energy-cell-dfn research log

## 2026-11-10 · Does changing SPMe's electrolyte treatment remove the 5 A collapse? (plan, written before the run)
- Question: README "Next steps" asks to test the electrolyte explanation of SPMe's collapse by changing the electrolyte treatment, not only reading the concentration (diagnose4/5).
- Designs: `bayes3` and `random1`, the two low-score designs whose SPMe electrolyte concentration went negative. 5 A charge, two cycles, same parameters as `run.py`.
- H1 (conductivity): if SPMe's electrolyte-potential treatment causes the collapse, one of the `electrolyte conductivity` options (composite, integrated, leading order) removes it. Refuted if the cycle-2 charge stays below 1 Ah under every option.
- H2 (diffusion): if it is electrolyte depletion, scaling electrolyte diffusivity by 2 and 4 removes SPMe's negative concentration and the collapse. Refuted if SPMe still collapses at x4.
- H3 (mechanism): DFN's negative-electrode reaction at its minimum-concentration moment is far from uniform (max/mean of |j| well above 1), which SPMe's x-averaged reaction cannot represent. Refuted if max/mean stays below about 1.2.
- Script: `experiments/diagnose6.py`; outcome logged in the next entry.
