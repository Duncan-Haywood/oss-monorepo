# A Gaussian-clutter twin miscalibrates a CFAR detector: exact false-alarm inflation and a real-cell calibration budget

*Stylised: CA-CFAR on square-law power, `N=16` reference cells unless stated, unit-mean gamma texture of shape ν independent per cell (K-distributed power), design false-alarm probability (Pfa) set in a Gaussian-clutter twin. Pure Python; every number is from `experiments/results.txt`, and each formula is checked against a direct simulation (`tests/`).*

## Question
A radar simulator is the cheapest place to set a detector's threshold. Radar clutter is heavier-tailed than Gaussian, so the question is what a threshold calibrated in a Gaussian twin does in the field, how much threshold it takes to repair it, and how many real clutter-only cells are needed to repair it from data. This is the perception-side analogue of the actuation-gain question in `twin-transfer`: a fidelity error in one distributional feature, and a price in real samples for correcting it.

## Model
Cell power is `τ·e` with `e~Exp(1)` speckle and `τ~Gamma(ν,1/ν)` texture (ν→∞ is the Gaussian twin). The test cell `X` is compared with `(α/N)ΣY_i` over `N` reference cells. In the twin, `Pfa=(1+α/N)^{-N}`, so `α=N(Pfa^{-1/N}−1)` (`α=5.34, 12.45, 21.94` for 1e-2, 1e-4, 1e-6).

## Results
1. **Exact real Pfa.** Integrating out speckle gives `Pfa = E_{τ0} Π_i E_{τi}[1/(1+ατ_i/(Nτ0))]`, computed by quadrature. Against 400k-trial direct simulation at design 1e-2: 0.0305 vs 0.0303 (ν=2) and 0.0197 vs 0.0195 (ν=5); the Gaussian twin gives 0.0102.
2. **Inflation grows fast as the design Pfa falls.** Real/design: 1e-2 → 3.0× (ν=2), 1.95× (ν=5), 1.26× (ν=20); 1e-4 → 30×, 9.2×, 2.4×; 1e-6 → 358×, 50×, 4.9×. A twin that validates well at moderate false-alarm rates says little about the tail that operators care about.
3. **Asymptotic constant.** As α→∞ (ν>1), inflation → `Γ(ν+N)/(Γ(ν)(ν−1)^N)`: 294.5 at ν=20 and 2.36e7 at ν=5 (`N=16`), matched to 0.2% at α=1e6. That regime corresponds to twin Pfa ~1e-77; at practical Pfa the inflation is far below the limit, so the limit is a structural statement (the exponent in α is unchanged, the constant is not), not a working number. Inflation also grows with window length (ν=5, 1e-4: 6.6, 9.2, 10.7, 11.6 for N=8…64).
4. **The repair costs threshold, not much.** The multiplier that restores the design Pfa in real clutter is 1.56× (1.9 dB) at ν=5 and 2.34× (3.7 dB) at ν=2 for 1e-4; 1.81× (2.6 dB) and 3.04× (4.8 dB) for 1e-6. Detection loss at that threshold depends on target statistics and is not computed here.
5. **Spatial correlation matters.** If one texture draw covers the whole window, the ratio test cancels it: 0.0101 at ν=2 and ν=5 against a 0.0100 design. The failure above needs texture that decorrelates within the window, so a twin should model clutter's spatial correlation length, not just its marginal.
6. **Calibration budget.** Fit ν by moments from `n` real clutter-only cells (`E[P²]/E[P]²=2(1+1/ν)`), reset the threshold for design 1e-4, and evaluate the true Pfa (200 trials). Ratio real/design, median / 90th percentile: ν=5: 1.69/9.2 at n=100, 1.24/3.3 at 300, 1.12/2.1 at 1000, 1.04/1.6 at 3000, 1.01/1.3 at 10⁴ (uncalibrated: 9.16). ν=2: 2.2/9.6, 1.5/4.0, 1.15/2.2, 1.08/1.6, 1.04/1.3 (uncalibrated: 30). At n=100 the ν=5 fit looks Gaussian in 16% of trials, which then reverts to the uncalibrated twin. Direct empirical thresholding at Pfa 1e-4 would need ~10⁶ cells for 10% error, so the twin as a *parametric prior* is worth roughly two to three orders of magnitude of real data here, provided the family (gamma texture) is right.

## Limitations
Not evidence about any real radar: no measured data, no target model, no Doppler or range structure, iid texture across cells, a correct-family assumption in result 6 (the fit is only as good as the K-distribution model; misspecification is not tested), moment estimator not optimal, lower clamp ν̂≥0.6 is a design choice, and only Pfa (not detection probability) is analysed. The 10⁶-cell figure is the binomial rule of thumb `1/(Pfa·rel.err²)`.

## Next steps
Add a target and compute detection loss at the repaired threshold; other CFAR variants (OS, GO); test on public radar clutter data; mis-specified-family calibration; connect to `randomized-twin` by randomizing ν in the twin.

## References
- Finn, H. M. & Johnson, R. S. (1968). Adaptive detection mode with threshold control as a function of spatially sampled clutter-level estimates. *RCA Review* 29(3), 414–464.
- Rohling, H. (1983). Radar CFAR thresholding in clutter and multiple target situations. *IEEE Trans. Aerospace and Electronic Systems* 19(4), 608–621.
- Ward, K. D. (1981). Compound representation of high resolution sea clutter. *Electronics Letters* 17(16), 561–563.
