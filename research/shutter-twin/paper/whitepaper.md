# A global-shutter twin of a rolling-shutter camera ignores target motion: orientation estimates are biased by speed, yet the same frame identifies pose and velocity

## Question
Synthetic images for training perception are usually rendered with a global shutter. A real rolling-shutter camera exposes row `r` at `t = rτ/H`, so a moving target is imaged at a different pose in every row. How wrong is an orientation estimator that is trained or certified on global-shutter renders, and does the rolling-shutter frame contain information the twin lacks?

## Model
Image of `H = 480` rows, readout `τ = 30 ms`, `k = τ/H = 6.25·10⁻⁵ s/row`. Target: rectangle `W_d × H_d = 200 × 120` px, centre `(320, 240)` at `t = 0`, rotation `θ`, velocity `(u, w)` px/s, constant during readout. Edge lines at time `t` satisfy `n·p = d + n·v t` with `n = (cos θ, sin θ)` (vertical edges) or `m = (−sin θ, cos θ)` (horizontal edges); substituting `t = r k` gives a line in the image with normals
`n' = (cos θ, sin θ(1 − wk) − cos θ·uk)`, `m' = (−sin θ, cos θ(1 − wk) + sin θ·uk)`.
Vertical-edge tilt `t_v = n'_y/n'_x = tan θ (1 − wk) − uk`; horizontal-edge slope `t_h = tan θ / s`, `s = 1 − wk + tan θ·uk`; row gap between the horizontal edges `Δr = H_d/(cos θ · s)`. Inverse (known `H_d`): `sin θ = t_h H_d/Δr`, `s = H_d/(Δr cos θ)`, `1 − wk = (s + tan θ t_v)/(1 + tan²θ)`, `uk = tan θ(1 − wk) − t_v`. The forward simulation (`measure`) does not use these formulas: it bisects each row's edge column at that row's own exposure time, and finds horizontal-edge crossings row by row with linear interpolation, then fits lines. Twin: `k = 0`. Naive estimator: mean of `atan t_v` and `atan t_h`.

## Results
(all numbers from `experiments/results.txt`)
1. **Closed forms.** Simulation and formulas agree to 7·10⁻¹⁶ (`t_v`), 3·10⁻¹⁶ (`t_h`) and 0.000 px (gap) over 200 random poses. Because the forward model is linear in the pixel coordinates this checks the derivation and the code, not the physics of a real sensor.
2. **Speed biases orientation.** With `θ = 0`, `u = 250, 500, 1000, 1500 px/s`, the vertical edges tilt by −0.90°, −1.79°, −3.58°, −5.36° and the horizontal edges by 0; the naive estimate is biased by half (−0.45° to −2.68°). Vertical speed `w = −1000…1500 px/s` changes the apparent target height by 0.941× to 1.103× (`1/(1 − wk)`).
3. **The frame identifies the motion.** Noiseless, `(θ, u, w)` are recovered to machine precision. With 0.25 px Gaussian noise per edge point (200 random poses per row, `θ` within ±17°), RMS orientation error is 0.244°, 0.485°, 0.969° for the naive estimator at speed ranges ±250, ±500, ±1000 px/s and 0.027° for the rolling-shutter solver at all three; the solver's RMS speed errors are 16.2 px/s (`u`) and 4.8 px/s (`w`), independent of range.
4. **Size sensitivity.** `w` is identified only through the apparent height. A height error of −5%, −2%, +2%, +5% changes the estimate for a true `w = −500` px/s to 313.9, −174.7, −825.1, −1312.1 px/s, and `u` (true 650) to 456.0, 571.2, 730.4, 853.9. Orientation moves by at most 0.35°.

## Limitations
One geometry (rectangle, straight edges), constant velocity during readout, no lens distortion, no exposure blur, no rotation rate (`θ` constant during readout, which is also a rolling-shutter effect for a spinning camera), exactly known target size in the solver, Gaussian edge noise with a single σ, one readout time. The "real" camera is a model, not measured images; I did not compare against real rolling-shutter footage or an existing implementation. The closed forms restate known rolling-shutter geometry for this special case. The error numbers in (3) are empirical for this geometry and noise level, not derived bounds.

## Next steps
Include target angular velocity and camera ego-motion; estimate the target size jointly from several frames; a conic or circle target; compare with a rendered rolling-shutter sensor model in a physics simulator and with real footage; connect to `doppler-twin` (a velocity reading a radar twin also provides) and `latency-twin` for the timing contribution.

## References
- Meingast, M., Geyer, C. & Sastry, S. (2005). Geometric models of rolling-shutter cameras. *OMNIVIS Workshop*.
- Ait-Aider, O., Andreff, N., Lapresté, J. M. & Martinet, P. (2006). Simultaneous object pose and velocity computation using a single view from a rolling shutter camera. *ECCV*.
- Zhao, W., Queralta, J. P. & Westerlund, T. (2020). Sim-to-real transfer in deep reinforcement learning for robotics: a survey. *IEEE SSCI*.
