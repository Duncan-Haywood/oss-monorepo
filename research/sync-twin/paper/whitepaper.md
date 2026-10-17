# A twin with synchronised sensor clocks over-promises its fused estimate: exact cost of clock offset and jitter

*Scope: stylised two-sensor Gaussian model, closed forms checked by simulation, no real sensor logs.*

## Abstract
A digital twin simulates every sensor on one clock; real sensors have a constant offset and per-sample jitter. For two sensors observing a smooth signal (squared-exponential kernel, length scale ℓ), the clock error `u = δ + J` adds an exact variance `g = 2σ²[1 − (1+s²/ℓ²)^{−½}e^{−δ²/(2(ℓ²+s²))}] ≈ σ²(δ²+s²)/ℓ²` to the delayed sensor, so offset and jitter enter through their root-sum-square. Inverse-variance fusion designed in the twin then has real MSE `ab/(a+b) + a²g/(a+b)²`, a factor `1 + ag/(b(a+b))` above the twin's claim, and is worse than the reference sensor alone exactly when `g > a + b`. With sensor noise variances `a = 0.01`, `b = 0.04` a 0.3ℓ offset costs 44% over the claim and 0.5ℓ costs 118%; the break-even offset is 0.225ℓ. A more accurate delayed sensor is hurt more. Randomising the twin's clock at the right timing variance recovers the optimal weight; too wide a range is cheap (1–4% at 4×), no randomisation costs up to 29%.

## 1. Setting
`x(t)` is a zero-mean Gaussian process with kernel `σ² exp(−τ²/2ℓ²)`. Sensor A reports `x(t) + n_A` on the reference clock, sensor B reports `x(t−u) + n_B` with independent noises of variance `a`, `b` and `u ~ N(δ, s²)` independent of everything else. The estimate is `w y_A + (1−w) y_B`. Because the noises are independent of the signal, the B error variance is `b + g` with `g = E[(x(t) − x(t−u))²] = 2σ²(1 − E e^{−u²/2ℓ²})`, and the Gaussian identity `E e^{−u²/2ℓ²} = (1+s²/ℓ²)^{−½} e^{−δ²/(2(ℓ²+s²))}` gives `g` in closed form. All other quantities are algebra on `MSE(w) = w²a + (1−w)²(b+g)`. Time is in units of ℓ; a millisecond figure needs an assumed ℓ (0.3 s below).

## 2. Results (`experiments/results.txt`)
**Exactness.** Closed-form vs simulated real MSE of the twin-designed fusion (200 000 draws): 0.00840/0.00837 (δ = 0.1, s = 0), 0.00840/0.00837 (δ = 0, s = 0.1), 0.00996/0.00994 (0.2, 0.1), 0.01740/0.01741 (0.5, 0), 0.01447/0.01450 (0.3, 0.3); the ratio to the closed form is within 0.5% (tests use ±3%). The quadrature approximation `g ≈ σ²(δ²+s²)/ℓ²` is within 1–3% for errors up to 0.2ℓ (offset and jitter each), 10% high at δ = s = 0.3ℓ and 45% high at δ = s = 0.6ℓ.

**Excess over the claim.** The twin claims `ab/(a+b) = 0.0080`. Real MSE is 1.012 / 1.050 / 1.198 / 1.440 / 2.175 / 3.739 / 6.132 times the claim for pure offsets of 0.05 / 0.1 / 0.2 / 0.3 / 0.5 / 0.8 / 1.2 ℓ, matching `1 + ag/(b(a+b))`. The fusion is worse than A alone (0.010) iff `g > a+b = 0.05`, a pure offset of 0.225ℓ. Compared with the optimum for known `g` the regret is smaller than the excess over the claim (at 0.3ℓ: 0.01152 vs 0.00928, 24%, against 44% over the claim), i.e. much of the claim gap is unavoidable timing error and only the rest is a weight error.

**Better sensors suffer more.** At `g = 0.02`, `a = 0.01`, the excess is 3.67 / 2.00 / 1.33 / 1.10 / 1.007 / 1.000 for `b` = 0.005 / 0.01 / 0.02 / 0.04 / 0.16 / 0.64: the twin gives the delayed sensor weight 0.67 when it is the more accurate one.

**Sync budget.** A 10% excess over the claim needs `g ≤ εb(a+b)/a = 0.02`, a pure offset (or RMS timing error) of 0.142ℓ (small-error rule 0.141ℓ); 2% needs 0.063ℓ, 50% needs 0.32ℓ (rule 0.316ℓ). At an assumed ℓ = 0.3 s these are 19 / 43 / 96 ms for ε = 0.02 / 0.1 / 0.5.

**Randomising the twin's clock.** Learning the weight under randomised timing variance `g_r` gives `(b+g_r)/(a+b+g_r)`, optimal at `g_r = g`. Real MSE relative to the optimum: at `g = 0.02`, 1.027 (no randomisation), 1.012 (`g_r = g/4`), 1.000, 1.008 (2×), 1.036 (4×), 1.086 (10×), 1.155 (100×); at `g = 0.1`, 1.286 / 1.071 / 1.000 / 1.011 / 1.032 / 1.052 / 1.069; at `g = 0.005` the whole range is within 1.002 up to 2× and 1.18 at 100×.

## 3. Interpretation
A twin that gives every sensor the same clock does not merely omit a nuisance parameter: it reports a fused-estimate accuracy that real hardware cannot deliver, and, because inverse-variance fusion trusts the most accurate sensor most, the gap is largest when the delayed sensor is the good one. The relevant quantity is RMS timing error relative to the signal's length scale, so a fast manoeuvre (small ℓ) tightens the sync budget in proportion. Domain randomisation of clock offset and jitter is cheap insurance because being too wide costs little, but the range should be chosen from a measured timing variance rather than by convention.

## 4. Limitations
The squared-exponential kernel is extremely smooth; for a rougher signal (Ornstein–Uhlenbeck) `g` grows linearly in `|u|`, not quadratically, and the sync budget is much tighter — not computed here. One scalar signal, static weights, independent Gaussian jitter; no drift, no dropped frames, no rolling shutter, no spatial extrinsics. The asymmetry claim in the randomisation study depends on `a, b` and the scales tried. The offset is known in the randomisation study, whereas in practice it must be estimated (Furgale et al. 2013; Qin & Shen 2018) and the estimate's error acts as jitter in the same formula; the calibration data needed for a given `s` is not derived. The 0.3 s length scale is an assumption for illustration. No real data.

## 5. Next steps
A rougher-signal `g(u)` and its budget; estimation of the offset from a finite log and the calibration length needed for a target `s`; time-varying weights (Kalman filtering) instead of static ones; drift; comparison with logged multi-sensor timestamps.

## References
See `references.bib`: Furgale, Rehder & Siegwart (2013); Qin & Shen (2018); Knapp & Carter (1976); Tobin et al. (2017); Rasmussen & Williams (2006).
