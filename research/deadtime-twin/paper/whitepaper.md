# An ideal photon-counter twin of a single-photon lidar has no dead time: saturation, a paralyzable ambiguity and first-photon range bias

## Question
Lidar simulators often turn light into detections with a linear counter: observed rate equals flux, and a pulse returns a timestamp with the pulse's own jitter. A real single-photon avalanche diode (SPAD) is blind for a dead time `τ` after each detection. How wrong is the linear twin about intensity, and about range through first-photon timing, and is the error correctable?

## Model
Flux `n`, `x = nτ`, `y = mτ` (observed rate). Non-paralyzable: `y = x/(1+x)`. Paralyzable: `y = x e^{−x}`, maximal at `x = 1` with `y = 1/e`. Timing: a Gaussian pulse (σ = 1) delivers Poisson(`N`) photons; the detector fires on the earliest, so the first-photon density is `f(t) = N φ(t) exp(−NΦ(t))`, with mass `1 − e^{−N}`. The twin says the detection time has mean 0 and standard deviation σ for every `N`. Moments and the mode come from quadrature of `f`.

Exact small-`N` law: `f ≈ Nφ(1 − NΦ)` and `∫tφΦ dt = 1/(2√π)` give mean bias `−N/(2√π)·σ`. The Coates correction `λ_k = −ln(1 − h_k/(M − Σ_{j<k}h_j))` rebuilds the arrival intensity from a first-photon histogram of `M` pulses.

## Results
(all from `experiments/results.txt`)
1. **Counting.** At `x = 1` the non-paralyzable detector reports half the flux and the paralyzable one 36.8% (undercount 0.500 and 0.632); at `x = 5` the paralyzable detector undercounts by 99.3%.
2. **Paralyzable ambiguity.** The curve has a maximum, so one observed rate has two fluxes: `y = 0.2` gives `x = 0.259` or `2.543` (ratio 9.8); `y = 0.05` gives 0.053 or 4.50 (ratio 85). A twin reading `y` as flux is 12.7× too low on the high branch for `y = 0.2` and 90× for `y = 0.05`. Non-paralyzable is invertible (`x = y/(1−y)`): `y = 0.9` is `x = 9`.
3. **First-photon bias.** Mean bias (σ units): −0.028, −0.278, −0.754, −1.504, −2.034 at `N = 0.1, 1, 3, 10, 30`; for σ = 1 ns that is −0.4, −4.2, −11.3, −22.6, −30.5 cm of range. The small-`N` law is accurate to 1% at `N = 0.1` and over-predicts the bias by 1.9× at `N = 10` (it is not an asymptote, and the bias saturates). The histogram mode is biased worse than the mean for `N ≤ 3` (−0.372 vs −0.278 at `N = 1`) and slightly less at `N ≥ 10`. The standard deviation falls from 1 to 0.50 at `N = 30`, so the twin's precision is too pessimistic while its mean is wrong: the error is a bias, not noise, and does not average out.
4. **Check and correction.** Monte Carlo (200,000 pulses, seed 11) matches quadrature (−0.274 vs −0.278 at `N = 1`; −0.751 vs −0.754 at 3; −1.504 vs −1.505 at 10). The Coates-corrected histogram mean is +0.004, +0.005, −0.018 at `N = 1, 3, 10`.

## Limitations
Stylised, no sensor data. One Gaussian pulse and no background light (ambient photons add a uniform first-photon term and make pile-up worse), an idealised gate always open, an ideal non-jittering SPAD with no afterpulsing, crosstalk or timing walk, a pulse shape known to the correction, `M` pulses per histogram independent, and a single target. Dead time is treated as a known constant. The Coates step uses 0.1σ bins on ±6σ and loses accuracy when the histogram is nearly exhausted.

## Next steps
Add background and afterpulsing; multi-return scenes where an early return shadows a later one; adaptive attenuation (gating) policies; a closed-loop range-based controller tuned in each twin in the `twin-certification` style; companion to `shot-twin` (photon-counting statistics, here the detector's memory) and `saturation-twin`.

## References
See `references.bib`: Coates (1968), Knoll (2010), Heide et al. (2018).
