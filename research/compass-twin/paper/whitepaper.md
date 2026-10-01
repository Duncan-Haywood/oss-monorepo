# A compass twin with an ideal magnetometer: hard-iron and soft-iron heading error in closed form, a 2Lβ/B loop-closure error, and how much of a turn a swing calibration needs

## Question
Simulators usually return heading as the true yaw plus white noise. A real magnetometer on a robot sees the Earth's field plus a fixed offset from the vehicle's own magnets and currents (hard iron) and a distortion from nearby ferromagnetic material (soft iron). How large is the heading error a twin with an ideal compass hides, what does it do to a compass-held path, and how much of a turn does a calibration swing need?

## Model
Planar body-frame reading `m = (B cosψ + β cosφ, rB sinψ + β sinφ) + noise`, heading `atan2(m_y, m_x)`; `β/B` is the offset relative to the horizontal field, `r` a scale on one axis. Twin: `β = 0`, `r = 1`. All parameters are chosen by me, not measured. Closed forms (derived here; checked numerically):
- hard iron: error `≈ (β/B) sin(φ−ψ)`, peak exactly `asin(β/B)` (for `β < B`), RMS over heading `≈ (β/B)/√2`;
- soft iron: `tan(ψ_m) = r tanψ`, peak exactly `asin(|1−r|/(1+r))` at `tanψ = 1/√r`, twice per turn;
- compass-held square of side `L` (steer so the measured heading equals the command): closure error `2Lβ/B`, independent of the offset direction `φ`;
- a straight compass-held leg hits cross-track tolerance `tol` after `tol/(β/B)` at the worst heading;
- Kåsa circle fit of the offset from `n` readings over a full turn with per-axis noise `σ`: Euclidean RMS error `≈ 2σ/√n` (in units of `B`).

## Results
(all numbers from `experiments/results.txt`)
1. **Hard iron.** The numerical sweep matches `asin(β/B)` to the printed digits: 1.146° at `β/B = 0.02`, 5.739° at 0.10, 11.537° at 0.20, 53.130° at 0.80; the linear approximation `β/B` is 7% low at 0.20 and 14% low at 0.80.
2. **Soft iron.** Peak error 1.469° at `r = 0.95`, 6.379° at `r = 0.8` (same at `r = 1.25`), 14.478° at `r = 0.6`, all equal to `asin(|1−r|/(1+r))`. Removing the hard-iron offset exactly leaves the soft-iron error unchanged (6.379° at `r = 0.8`).
3. **Loop closure.** For `L = 100 m` the compass-held square closes with an error of 2.000, 6.000, 20.000 and 60.000 m at `β/B = 0.01, 0.03, 0.1, 0.3`, for all three offset directions tested (0°, 52°, 143°), i.e. exactly `2Lβ/B` even at 0.3 in these runs; the ideal twin and true-heading tracking both close to 10⁻¹⁴ m. So the twin predicts zero closure error and the real robot misses by 2% of a 100 m side at a 1% offset.
4. **Straight legs.** To keep cross-track error under 1 m at the worst heading, a compass-held leg may be 50, 20 and 10 m long at `β/B = 0.02, 0.05, 0.10`.
5. **Swing calibration.** With a full turn the fitted offset's RMS error is 0.00787, 0.00400, 0.00209 at `n = 25, 100, 400` against `2σ/√n` = 0.00800, 0.00400, 0.00200 (`σ = 0.02`, 400 trials). Shrinking the turned arc at `n = 100`: RMS error ×1.1 at 270°, ×1.8 at 180°, ×4.6 at 120°, ×12 at 90°, ×45 at 60°, ×190 at 30° relative to the full turn (these ratios carry Monte Carlo error of a few percent for large arcs). Converted to a peak heading error, the median residual is 0.18° after a full turn, 0.34° after 180°, 2.2° after 90° and 10.7° after 60° (90th percentile 4.0° and 13.4° for the last two).

## Limitations
2-D model with a level sensor; no tilt, no declination, no time-varying disturbance (motors switching on), no magnetic anomalies along the route, and no gyro fusion, which is how real systems suppress exactly this error. Noise is isotropic and Gaussian, the circle fit is the simple algebraic (Kåsa) one and the soft-iron term is not calibrated at all; an ellipse fit would be needed for it. "Compass-held" means perfect steering to the measured heading. I did not use recorded magnetometer data, so this verifies algebra and code, not physical realism. The `2Lβ/B` closure law is shown exact only numerically for the four-leg square tested here; I have not proved it beyond first order.

## Next steps
Fit the full ellipse (soft and hard iron together) and report the arc needed; fuse with `gyro-twin` in a complementary filter; add motor-current-dependent offsets; test closure for other polygons; record a real magnetometer on a vehicle.

## References
- Kåsa, I. (1976). A circle fitting procedure and its error analysis. *IEEE Trans. Instrumentation and Measurement* 25(1).
- Caruso, M. J. (1997). Applications of magnetic sensors for low cost compass systems. *Honeywell Application Note AN-213*.
- Vasconcelos, J. F., Elkaim, G., Silvestre, C., Oliveira, P. & Cardeira, B. (2011). Geometric approach to strapdown magnetometer calibration in sensor frame. *IEEE Trans. Aerospace and Electronic Systems* 47(2).
- Zhao, W., Queralta, J. P. & Westerlund, T. (2020). Sim-to-real transfer in deep reinforcement learning for robotics: a survey. *IEEE SSCI*.
