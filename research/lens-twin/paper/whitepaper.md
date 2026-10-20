# A pinhole twin of a radially distorted camera mis-ranges the near field by exactly 1/(1+k₁h²/R²): what a twin-trained braking policy does, what focal calibration fixes, and what one grid image identifies

## Question
Simulated cameras are usually ideal pinholes. A real wide-angle camera has radial distortion. If a perception or stopping policy is trained or certified in the pinhole twin, how wrong is the range it reads from the floor, how far from the intended standoff does it actually stop, and does fitting the twin's focal length repair it?

## Model
Brown's first radial term: a scene point at normalised coordinates `(X, Y) = (x/z, y/z)` is imaged at `(X, Y)(1 + k₁r²)`, `r² = X² + Y²` (`k₁ < 0` barrel, `> 0` pincushion). The camera is at height `h = 0.5 m` with a horizontal axis over a flat floor, so a floor point at range `R` on the axis column has `ρ = Y = h/R` and is imaged at `ρ_d = ρ(1 + k₁ρ²)`. The twin reads range `h/ρ_d` (pinhole, `k₁ = 0`).

Closed forms (checked against the code, which evaluates the distortion and inverts it by bisection):
- **Range.** `R_twin/R = 1/(1 + k₁h²/R²)` exactly; relative error `≈ −k₁h²/R²`, falling as `1/R²`.
- **Standoff braking.** A policy "stop when twin range = `R₀`" stops at true range `R = h/ρ` with `ρ + k₁ρ³ = h/R₀`. To first order `R − R₀ ≈ k₁h²/R₀`.
- **Line bow.** The scene line `X = d` is imaged with lateral displacement `k₁dY²` at height `Y`, exactly.
- **Focal calibration.** Least squares of `ρ_d` on `sρ` over `ρ ~ U[0, ρ_max]` gives `s = 1 + 3k₁ρ_max²/5`.
- **Identification.** `x_d − x = k₁r²x` is linear in `k₁`, so one image of a known planar grid gives `k₁` by linear least squares.

## Results
(all numbers from `experiments/results.txt`)
1. **Range.** With `k₁ = −0.3`, `h = 0.5 m`, the uncalibrated twin over-reads range by 15.4% at `R = 0.75 m`, 8.1% at 1 m, 1.9% at 2 m, 0.5% at 4 m and 0.08% at 10 m; with `k₁ = +0.2` it under-reads by 8.2%, 4.8%, 1.2%, 0.3%, 0.05%. Simulation and formula agree to the printed digits. The error matters in the near field (docking, parking, manipulation standoff) and vanishes far away.
2. **Braking.** With `k₁ = −0.3` a policy trained to stop at 1.0 m stops at 0.909 m (9.1 cm short), at 0.75 m it stops at 0.586 m (16.4 cm short), at 3 m it stops 2.5 cm short; pincushion (`k₁ = 0.1`) stops long by 2.4 cm at 1 m. The first-order formula is accurate far out (−2.54 vs −2.50 cm at 3 m) but understates the error when `ρ` is large (−16.4 vs −10.0 cm at 0.75 m, where `ρ₀ = 0.67`), so it should be used only for `|k₁|ρ² ≲ 0.05`.
3. **Line bow.** Sim and `k₁dY²` agree exactly (for `d = 0.4`, `k₁ = −0.3`, `Y = 0.5`: −0.0300).
4. **Calibration moves the error, it does not remove it.** Fitting the focal scale over `ρ ≤ 0.5` (`k₁ = −0.3`) gives `s = 0.955` (closed form and grid fit agree to 2·10⁻⁵); the range ratio becomes 1.032 at the near edge (`ρ = 0.5`), 0.973 at `ρ = 0.25` and 0.956 at `ρ = 0.05`: near error 8.1% → 3.2%, but a new far-field under-read of 4.4%. Braking to 1 m then stops at 0.962 m (was 0.909), and to 4 m at 4.170 m (was 3.981), i.e. 17 cm long. Whether that trade is acceptable depends on which side of the target is safer.
5. **Identification.** From one 7×7 grid (half-width 0.6 on the plane `z = 1`) the estimator is unbiased; RMS error in `k₁` is 0.0003, 0.0011, 0.0042 at normalised pixel noise 0.0005, 0.002, 0.008 (both signs of `k₁`), which at 1 m range implies a range-ratio error of at most 0.001 from the estimation error.

## Limitations
One distortion term (no `k₂`, tangential terms or decentring), axis-column floor points only, horizontal optical axis, known camera height, a flat floor, noise only in the image points and with a known grid. The "real" camera is a model, not measured images; there is no comparison with a real lens or a rendered fisheye, and the known-grid identification assumes the grid pose is given (in practice it is estimated jointly, e.g. by Zhang's method, which correlates it with `k₁`). The bisection inverse is valid only on the monotone branch; for `k₁ = −0.3` this ends at `ρ = 1/√(0.9) ≈ 1.05`, and the code raises outside it. The closed forms restate standard distortion algebra; nothing here is new method.

## Next steps
Higher-order and fisheye models with a ray-angle parameterisation; joint estimation of pose and `k₁`; propagate into a learned detector's bounding-box range; connect to `occupancy-twin` (floor-range errors become map errors) and `shutter-twin` (the other geometric camera effect a render omits).

## References
- Brown, D. C. (1971). Close-range camera calibration. *Photogrammetric Engineering* 37(8).
- Zhang, Z. (2000). A flexible new technique for camera calibration. *IEEE TPAMI* 22(11).
- Zhao, W., Queralta, J. P. & Westerlund, T. (2020). Sim-to-real transfer in deep reinforcement learning for robotics: a survey. *IEEE SSCI*.
