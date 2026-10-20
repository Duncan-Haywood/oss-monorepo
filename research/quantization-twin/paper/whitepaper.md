# What does a Kalman filter tuned in an ideal-sensor twin cost on a quantizing real sensor?

**Status: preliminary, stylised, simulation only.** Not peer reviewed.

## 1. Question
Digital twins of sensors often omit finite resolution (ADC step, depth-image rounding, encoder ticks). A filter whose gain is tuned in such a twin sees noise variance `R`, while the real sensor delivers `round(x+v)` to a grid of step `D`. Two questions: how much does the twin's gain cost, and does the standard fix (Sheppard 1897: add `D²/12` to the noise variance) recover it?

## 2. Setup
Plant `x' = a x + w`, `w~N(0,Q)`, `a=0.9`, `Q=1`; sensor `y = D·round((x+v)/D)`, `v~N(0,R)`. The filter is `x̂ = a x̂⁻ + K(y − a x̂⁻)` with fixed `K`. Candidates: `K_t` (twin: Riccati gain for `R`), `K_sh` (Riccati gain for `R + D²/12`), and `K*` (best on a 0.02 grid, from simulation). All gains are run on the same noise stream (10⁵ steps after burn-in 500, seed 3) so comparisons are paired. Under white noise `R'` the real MSE has the exact closed form `((1−K)²Q+K²R')/(1−(1−K)²a²)`; it is used here as the Sheppard prediction (with `R'=R+D²/12`), and validated against simulation at `D=0` in the tests.

## 3. Results (from `experiments/results.txt`)
`R=1`:

| D | K_sh | K* | real MSE, K_t | K_sh | K* | Sheppard prediction | twin regret |
|---|---|---|---|---|---|---|---|
| 0.5 | 0.594 | 0.60 | 0.6086 | 0.6086 | 0.6087 | 0.6059 | ~0 |
| 1 | 0.582 | 0.58 | 0.6344 | 0.6337 | 0.6338 | 0.6310 | 0.1% |
| 2 | 0.543 | 0.54 | 0.7370 | 0.7270 | 0.7270 | 0.7246 | 1.4% |
| 4 | 0.440 | 0.44 | 1.1477 | 1.0306 | 1.0306 | 1.0259 | 11.4% |
| 8 | 0.276 | 0.32 | 2.8952 | 2.4601 | 2.4390 | 1.7494 | 18.7% |

`R=0.01` (`D/σ_v` = 5…80): twin regret 1.0%, 6.7%, 25.6%, 64.4%, 42.4% for `D`=0.5, 1, 2, 4, 8; `K_sh` regret ≤ 0.4% throughout (negative values ≈ −1% at `D=0` are grid/sampling noise, since `K*` is picked on a coarse grid from the same finite run). Sheppard MSE prediction matches simulation to 0.4% for `D` ≤ 2 but gives 0.728 vs 0.804 at `D`=4 and 1.61 vs 2.82 at `D`=8.

## 4. Findings
1. **The twin's gain is cheap to ignore only while `D` is below the noise scale.** With `R=0.01` the cost is already 6.7% at `D=1` (10σ_v).
2. **Sheppard retuning recovers essentially all of it** (gain choice within ≤1% MSE of the best grid gain in all 12 configurations), even where its MSE *formula* is wrong.
3. **The MSE claim fails when `D` exceeds the state's scale** (stationary std of `x` ≈ 1.5 with these parameters): the quantizer output is mostly 0 and ±D, the error is signal-dependent, and the white-noise closed form under-predicts by up to 43%. A twin that reports Sheppard-corrected accuracy would be optimistic in this regime although its gain is near-optimal.

## 5. Limitations and next steps
Scalar, Gaussian, fixed-gain, no saturation, one `a`/`Q`. Only one seed per configuration, so differences under ~1% are not resolved. No claim is made about real sensors. Next: dithered vs undithered sensors, a state-dependent gain (extended filter), and a quantization-aware filter.

## References
```bibtex
@article{kalman1960, author={R. E. Kalman}, title={A New Approach to Linear Filtering and Prediction Problems}, journal={Journal of Basic Engineering}, volume={82}, number={1}, pages={35--45}, year={1960}}
@article{sheppard1897, author={W. F. Sheppard}, title={On the calculation of the most probable values of frequency-constants, for data arranged according to equidistant division of a scale}, journal={Proceedings of the London Mathematical Society}, volume={s1-29}, pages={353--380}, year={1897}}
@book{widrow2008, author={B. Widrow and I. Kollár}, title={Quantization Noise: Roundoff Error in Digital Computation, Signal Processing, Control, and Communications}, publisher={Cambridge University Press}, year={2008}}
```
