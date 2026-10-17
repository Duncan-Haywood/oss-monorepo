# A clear-air lidar twin overstates range by exp(αr): closed-form detection range in fog, how far a mis-set extinction moves it, and why a policy trained on the mean fog is unsafe half the time

## Question
Lidar simulators usually render returns without atmospheric loss. In fog, rain or dust the real sensor loses range. How wrong is the clear-air twin, how accurately must the twin's extinction be set, and what should a twin that is used to choose a driving speed assume when fog density changes from episode to episode or varies along the beam?

## Model
Return power from an extended Lambertian target is `P0 ρ e^{−2τ(r)}/r²` with optical depth `τ(r) = ∫₀ʳ α`. Detection is a hard threshold. The clear-air range `r0` absorbs `P0`, `ρ` and the threshold (`r0 ∝ √ρ`), so a target is detected iff `ln(r/r0) + τ(r) ≤ 0`. For uniform extinction this is `r e^{αr} = r0`, so `r = W(α r0)/α` (Lambert W). Visibility `V` maps to `α = 3.912/V` (Koschmieder, 2% contrast). Parameters: `r0 = 100 m`, braking 5 m/s², reaction time 0.5 s. Extension 1: `α ~ LogNormal(ln α_med, σ)` per episode with `α_med` from V = 500 m. Extension 2: a fog bank, clear before 40 m and `α_b = 0.05 /m` beyond.

Two facts follow directly. (i) The clear-air twin overstates the range by exactly `r0/r = e^{αr}`. (ii) Differentiating `ln r + αr = ln r0` gives the elasticity `−d ln r / d ln α = W/(1+W) < 1`: a relative error in the twin's extinction always produces a smaller relative range error. Because range is strictly decreasing in `α`, the `q`-quantile of the range under random `α` is exactly the range at the `(1−q)`-quantile of `α`.

## Results
(all numbers from `experiments/results.txt`)
1. **Uniform fog.** Range is 92.98, 74.67, 43.07, 30.42, 14.70 m at V = 5000, 1000, 200, 100, 30 m; the clear-air twin overstates by ×1.075, ×1.339, ×2.322, ×3.287, ×6.802, matching `r0/r` and `e^{αr}`. Elasticity rises from 0.07 to 0.66 over that range and never reaches 1.
2. **Mis-set extinction** (true V = 200 m, range 43.07 m). Twin extinction ×0.5, ×0.8, ×1.25, ×2 gives range error +32.7%, +10.4%, −10.0%, −29.4%. The ratio of range error to extinction error is 0.18–0.86 across these (including ×4, 0.176) and falls as the twin over-attenuates. Under-estimating `α` is the unsafe direction and the error there is larger (×0.25 gives +64.3%).
3. **Variable fog** (`σ = 0.8`, `α_med` at V = 500 m). The range quantiles are 35.5 m (q05), 61.7 m (median) and 83.9 m (q95). The median-`α` twin believes 61.71 m; the Monte Carlo mean range is 60.97 m; the range at mean `α` is 55.18 m, so plugging in the mean extinction is *conservative* on average range here, and the gap grows with `σ` (46.99 vs 60.22 at σ = 1.2). Speed chosen so stopping distance equals the believed range gives a violation probability (real range below stopping distance) of 1.000 (clear air; any fog at all violates it), 0.500 (median `α`, 22.5 m/s), 0.345 (mean `α`), 0.050 (q05 range, 16.5 m/s) and 0.010 (q01); Monte Carlo agrees to ±0.001 (0.5012, 0.3449, 0.0506, 0.0099). The q05 policy is 43.5% slower than the clear-air one.
4. **Patchy fog breaks calibration transfer.** With a bank at 40 m, a single extinction calibrated on a bright target (`r0 = 150 m`, `α_eff = 0.01596 /m`) underestimates the range of darker targets by 10.7% (`r0 = 100`), 24.1% (60), 28.9% (30) and overestimates a brighter one (`r0 = 250`) by 13.2%. Calibrated on a dark target near the bank (`r0 = 45`, `α_eff = 0.0019 /m`) it overestimates bright targets by 61% (`r0 = 100`), 103% (150) and 168% (250). In uniform fog the calibration transfers exactly (range-to-`α` inversion is a bijection, tested), so the failure is attributable to the non-uniform profile alone.

## Limitations
Stylised, no lidar data. Hard threshold detection, no noise, no target fluctuation, no beam-divergence or near-field overlap loss, extended Lambertian target only (point targets scale as `1/r⁴`), single wavelength and a Beer–Lambert medium with no multiple scattering or backscatter clutter from the fog itself, which in practice adds false returns. The lognormal fog model and the Koschmieder constant are assumptions, not fitted. The driving-speed example uses a fixed braking model and ignores that a real planner also fuses radar, which suffers far less fog loss. Item 4 uses one bank geometry.

## Next steps
Fit `α` (and its episode-to-episode spread) from logged detection ranges; point-target `1/r⁴` and radar fusion variants (`fusion-twin`, `radar-detection-twin`); backscatter clutter and false alarms; scoring the range quantiles as probabilistic forecasts (`twin-elicitation`).

## References
- Koschmieder, H. (1924). Theorie der horizontalen Sichtweite. *Beiträge zur Physik der freien Atmosphäre* 12.
- Corless, R. M., Gonnet, G. H., Hare, D. E. G., Jeffrey, D. J. & Knuth, D. E. (1996). On the Lambert W function. *Advances in Computational Mathematics* 5.
- Rasshofer, R. H., Spies, M. & Spies, H. (2011). Influences of weather phenomena on automotive laser radar systems. *Advances in Radio Science* 9.
- Zhao, W., Queralta, J. P. & Westerlund, T. (2020). Sim-to-real transfer in deep reinforcement learning for robotics: a survey. *IEEE SSCI*.
