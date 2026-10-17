# Interference twin: an interference-free or mean-noise-rise radar twin vs real mutual interference between robots

## Question
When several robots carry radars, each raises the others' noise floor intermittently. Simulators usually either ignore this or add the mean interference to the noise. Is that right, and what should a twin report when mission success depends on the pattern of hit frames?

## Model
Victim noise 1; echo `S(r) = s₀(r₀/r)⁴`, detect iff `S ≥ T(1+I)`, clear-air range `r₀(s₀/T)^{1/4}` (158.1 m for `s₀ = 1000`, `r₀ = 50`, `T = 10`). `K` interferers with `d²` uniform on `[d₀², R²]` contribute `c/d²` in a frame w.p. `q` each, independently. Then `E[1/d²] = ln(R²/d₀²)/(R²−d₀²)`, mean interference `Kqc·E[1/d²]`, and the mean-rise twin has range `r₀(s₀/(T(1+E I)))^{1/4}`. For `K = 1` the per-frame detection probability is `(1−q) + q·clip((R² − c/(S/T−1))/(R²−d₀²))`. For fixed geometry the per-frame probability is a sum over hit subsets, and an `m`-of-`N` mission succeeds w.p. a binomial tail of it. Twins compared: clear air; mean-rise; i.i.d.-per-frame-geometry ensemble; geometry-blind exact; geometry-aware.

## Results
(all from `experiments/results.txt`; `K = 4`, `q = 0.1`, `N = 10`, 4000 geometries for marginals, 2000 simulated missions per range.)
1. Closed form vs Monte Carlo (K = 1, q = 0.2): within 0.003 at five ranges.
2. Mean interference 36.9; mean-rise range 63.7 m with real Pd 0.858 there; real range at Pd ≥ 0.9 is 58.4 m. Real Pd falls from 0.98 (40 m) to 0.656 and stays at 0.656 from about 90 m to 158 m, the probability that no interferer hits the frame; clear-air twin range 158.1 m has real Pd 0.
3. 3-of-10 missions: Brier clear 0.0027, mean-rise 0.6896, all calibrated models 0.0027. 9-of-10 missions: clear 0.6360, mean-rise 0.1296, i.i.d.-geometry 0.1011, geometry-blind exact 0.1007, geometry-aware 0.0892. Within-mission geometry persistence changes mission probabilities by up to 0.04 (e.g. 0.947 vs 0.983 at 40 m, 0.417 vs 0.383 at 70 m) but barely changes the Brier score of a geometry-blind forecaster; knowing the geometry does.
4. Over `q ∈ {0.02, 0.05, 0.1, 0.2, 0.4}` the mean-rise range is 92.9, 75.3, 63.7, 53.8, 45.3 m against real Pd ≥ 0.9 ranges 158.1, 70.2, 58.4, 48.5, 40.4 m.

## Limitations
Stylised simulated truth; illustrative `c`, `q`; independent hits, `1/d²` only, no waveform, ghost-target or mitigation modelling; hard SINR threshold (no Pd–SNR curve); one target; the 3-of-10 and `q = 0.02` rows show the mean-rise twin can be badly pessimistic when the mission tolerates hit frames, so the sign of its error depends on the mission rule, not just on the interference level.

## Next steps
Replace the hit model with a chirp-overlap simulation (slope, sweep, offsets) and add mitigation; calibrate `c`, `q` against automotive radar measurements; use interference-aware Pd in multi-robot mapping or formation planning.

## References
Kunert, M. (2012). The EU project MOSARIM: A general overview of project objectives and conducted work. *European Radar Conference*. Goppelt, M., Blöcher, H.-L., Menzel, W. (2010). Automotive radar – investigation of mutual interference mechanisms. *Advances in Radio Science* 8, 55–60. Skolnik, M. I. (2008). *Radar Handbook*, 3rd ed. McGraw-Hill.
