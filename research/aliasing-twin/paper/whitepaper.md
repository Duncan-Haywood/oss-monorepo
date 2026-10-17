# A radar twin with unlimited unambiguous velocity certifies speeds the real radar aliases, and averaging cannot fix it

*Stylised: one target, one radial-velocity channel, `n` independent Gaussian-noise returns; twin with no velocity ambiguity vs a "real" radar that wraps to `[−V, V]`. Pure Python; every number below is from `experiments/results.txt` (seeded, ~10 s). The "real" radar is a simulation, not radar data. Preliminary.*

## Question
A pulsed Doppler radar measures radial velocity only modulo `2V` (`V = λ·PRF/4`; Richards 2005). Radar sensor twins commonly render velocity as a real number. If an estimator or a tolerance is validated in such a twin, which speeds does the twin over-certify, and does collecting more returns close the gap?

## Model
Twin: return `y = μ + e`, `e ~ N(0, s²)`. Real: the radar reports `wrap(y) = y − 2V·⌊(y+V)/2V⌋ ∈ [−V, V)`. The estimate is the mean of `n` returns. The twin claims MSE `s²/n`. Set `V=10`, `s=1` for the numbers.
- **Bias (exact).** `E[wrap(y)] − μ = −2V Σ_{j≥1}[Φ((μ−(2j−1)V)/s) − Φ((−(2j−1)V−μ)/s)]`. At `μ=V` exactly half of the mass wraps and the bias is `−V`; beyond `V` it tends to `−2V`.
- **MSE (exact).** Summing Gaussian partial moments of `s z − 2Vk` over wrap cells `k` gives `E[(wrap(y)−μ)²]`; the real MSE of the mean is `bias² + (MSE₁ − bias²)/n`. Both match Monte Carlo (tests; results §1–2).
- **Safe speed.** The largest `μ` with `|bias| ≤ tol` is, to the digits printed, `V + s·Φ⁻¹(tol/2V)` (leading term; the exact root from bisection agrees to four decimals in every cell below).
- **Unwrapping with a prior.** Lift each return to the lattice point `wrap(y)+2Vk` nearest a prior speed `μ + N(0, s_p²)` (cf. Itoh 1982 for the analogous phase problem). The lift is wrong iff `|e − e_p| > V`, so the failure probability is exactly `2Φ(−V/√(s²+s_p²))`, and the MSE is `s² + 4V²E[J²] − 4V(s²/S²)E[dJ]` with `d=e−e_p ~ N(0,S²)`, `J=round(d/2V)`.

## Results
1. **Bias switches on over about 3 noise standard deviations.** Exact bias of one return: 0.0006 at `μ=6`, −0.455 at 8, −3.17 at 9, −10.0 at 10, −16.8 at 11, −20.0 at 14 (Monte Carlo, 200,000 draws, agrees within 4 s.e.). The twin predicts 0 everywhere.
2. **Averaging makes the gap worse, not better.** Real MSE over the twin's claim at `n=1/10/100/10⁴`: `μ=6`: 1.01 at all `n`; `μ=8`: 7.9, 9.8, 28, 2.1×10³; `μ=9`: 55, 145, 1.05×10³, 1.0×10⁵; `μ=10`: 185, 1.1×10³, 1.0×10⁴, 1.0×10⁶. The real MSE has a floor `bias²` (10.07 at `μ=9`) while the twin's claim goes to 0. Exact vs Monte Carlo at `n=10, μ=8.5`: 3.861 vs 3.839±0.033.
3. **The over-certified range depends on the noise.** Largest speed with `|bias| ≤ tol`: `tol=0.1`: 8.71, 7.42, 4.85 for `s`=0.5, 1, 2 (87%, 74%, 48% of `V`); `tol=0.01`, `s=1`: 6.71; `tol=1`, `s=1`: 8.36. A twin validated only at low speeds (where wrapping is invisible: ratio 1.01 at `μ=6`) gives no warning.
4. **A prior fixes it only if it is good enough.** With `μ=3` the MSE of prior-unwrapped returns is 1.002, 6.71, 39.7, 85.3, 130 for prior error `s_p`=2, 4, 6, 8, 10 (failure probability 7.7×10⁻⁶, 0.015, 0.10, 0.21, 0.32; Monte Carlo agrees within 4 s.e.). MSE within 10% of the twin's claim needs `s_p ≤ 0.257V` (2.57 here). The failure is a rare, large (`±2V`) error, so a Gaussian-error claim is wrong in shape as well as size.

## Limitations
One radial channel, one target, known Gaussian noise, independent returns; real radars use staggered PRFs or chirp-sequence modulation and resolve ambiguities, which is exactly what a faithful twin would need to simulate. The mean is used as the estimator for clarity; a circular mean or robust estimator would behave differently (the mean is the natural choice in a twin that has no wrapping). Bias and MSE are exact for the stated model, not measured from a radar; the prior in §4 is idealised as independent Gaussian. Preliminary.

## Next steps
Circular-mean and staggered-PRF estimators; moving-target contamination on top of aliasing (`doppler-twin`); feeding the aliasing-induced error into a filter (`filter-twin`); how many real frames identify `V` and `s` well enough to bound the over-certified range (`validate-twin`).

## References
See `references.bib`. Richards (2005), *Fundamentals of Radar Signal Processing*, McGraw-Hill; Kellner, Barjenbruch, Klappstein, Dickmann & Dietmayer (2013), Instantaneous ego-motion estimation using Doppler radar, ITSC; Itoh (1982), Analysis of the phase unwrapping algorithm, *Applied Optics* 21(14); Zhao, Queralta & Westerlund (2020), Sim-to-real transfer in deep reinforcement learning for robotics: a survey, IEEE SSCI.
