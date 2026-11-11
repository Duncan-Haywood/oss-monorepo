# energy-cell-dfn research log

## 2026-11-11 · Outcome: low rate cannot separate the models; at 2C on the Ai cell DFN fits, on the Ecker cell at 5C neither does
- H2 supported: SPMe and DFN differ by 0.4 mV (Ai 0.1C) and 0.5 mV (Ecker 1C), against 52 and 40 mV of error each against data.
- H1 split. Ai 2C: DFN 17.9 mV RMSE against SPMe 53.4 (4x mesh; same on 1x and 2x): supported. Ecker 5C: SPMe 66.5 against DFN 70.6 (4x mesh), SPMe better on every mesh and thermal option: refuted for this cell.
- Surprises: Ecker 5C was not mesh-converged on PyBaMM's default mesh (DFN 85.6 / 73.0 / 70.6 mV at 1x / 2x / 4x); the lumped thermal model changes the Ecker 5C error by 26 mV and makes the Ai 2C fit worse (DFN 46 mV), so the thermal treatment is a larger lever than the model choice on the Ecker cell.
- Depletion: DFN's minimum salt is 30% of initial at Ai 2C, the deepest measured case; the SPMe-DFN gap grows with depletion (0.4, 3.4, 10, 41 mV at 97, 84, 67, 30%). The `energy-cell` failures sit near 0%, beyond every measured case.
- Run fix: the first attempt used CasadiSolver in safe mode (about 13 minutes for 2 of 18 runs, with "mxstep" warnings); IDAKLU gave the same RMSE to 0.01 mV in a quarter of the time. Two 4x DFN runs in parallel were OOM-killed; they now run one at a time.
- Output: `experiments/validate_data.txt`, `validate_data.json`, `validate_data.svg`; five tests pin the hypotheses' outcomes.

## 2026-11-10 · Are SPMe and DFN told apart by measured discharge curves? (plan, written before the run)
- Question: README "Next steps" asks to compare both models with measured discharge curves. No measured curve exists for the OKane2022 (LG M50) designs here, so this uses the two measured sets PyBaMM ships with a matching parameter set: Ecker et al. 2015 (Kokam 7.5 Ah, `Ecker2015`, 1C and 5C) and Ai et al. 2020 (Enertech 2.28 Ah LCO pouch, `Ai2020`, 0.1C, 0.5C, 1C, 2C). Data from `pybamm.DataLoader` (pybamm-data v1.0.2).
- Models: SPM, SPMe, DFN, each isothermal and with a lumped thermal model; same parameters per cell, constant-current discharge to the data's cut-off. Metric: voltage RMSE against data over the time both cover, and discharge-time error at cut-off. Mesh doubled once as a convergence check.
- H1: at each cell's highest rate (Ecker 5C, Ai 2C), DFN's RMSE is lower than SPMe's. Refuted if SPMe is within 5 mV of DFN or better.
- H2: at the lowest rate (Ai 0.1C, Ecker 1C), the SPMe-DFN difference (RMSE between the two model curves) is below both models' RMSE against data, so the data cannot tell them apart there. Refuted if the model-model RMSE exceeds the smaller model-data RMSE.
- Also recorded (no hypothesis): DFN's minimum electrolyte concentration in each case, to say how close these measured cases come to the depletion regime where SPMe failed on the energy-cell designs.
- Script: `experiments/validate_data.py`; outcome logged in the entry above this one.

## 2026-11-10 · Outcome: salt diffusion decides the collapse; conductivity treatment only changes its size
- H2 supported: electrolyte diffusivity x2 removes SPMe's negative concentration (minimum 404 and 422 mol/m3) and the collapse; SPMe's cycle-2 charge is 6.24 / 5.73 Ah against DFN's 6.35 / 5.82 (within 2%), where at x1 it was 0.36 / 0.72 against 5.60 / 4.94.
- H1 not refuted by the logged threshold: `integrated` conductivity lifts SPMe's cycle-2 charge to 3.19 / 2.19 Ah (above the 1 Ah line), but the concentration still goes negative and the gap to DFN stays 43% / 56%. `composite` equals the default; `leading order` is rejected for SPMe in PyBaMM 26.10.1.1.
- H3 not tested: the planned read happened at the charge's first time point, where the minimum concentration is inherited from the discharge on the positive side, so the negative-electrode |j| ratio there (1.16 to 1.69) is not evidence either way. Fix: read j at the negative-electrode minimum during the charge.
- Output: `experiments/diagnose6.txt`, `diagnose6.json`; two tests pin the x2 result.

## 2026-11-10 · Does changing SPMe's electrolyte treatment remove the 5 A collapse? (plan, written before the run)
- Question: README "Next steps" asks to test the electrolyte explanation of SPMe's collapse by changing the electrolyte treatment, not only reading the concentration (diagnose4/5).
- Designs: `bayes3` and `random1`, the two low-score designs whose SPMe electrolyte concentration went negative. 5 A charge, two cycles, same parameters as `run.py`.
- H1 (conductivity): if SPMe's electrolyte-potential treatment causes the collapse, one of the `electrolyte conductivity` options (composite, integrated, leading order) removes it. Refuted if the cycle-2 charge stays below 1 Ah under every option.
- H2 (diffusion): if it is electrolyte depletion, scaling electrolyte diffusivity by 2 and 4 removes SPMe's negative concentration and the collapse. Refuted if SPMe still collapses at x4.
- H3 (mechanism): DFN's negative-electrode reaction at its minimum-concentration moment is far from uniform (max/mean of |j| well above 1), which SPMe's x-averaged reaction cannot represent. Refuted if max/mean stays below about 1.2.
- Script: `experiments/diagnose6.py`; outcome logged in the entry above.
