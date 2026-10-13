# A well-featured twin and the along-track blindness of scan matching in a corridor

## Question
A digital twin used to tune or validate localisation is often built from scenes with structure in every direction. Real subterranean and indoor robots spend long stretches in corridors and tunnels, where a 2D scan constrains the pose across the track but not along it. How wrong is a twin's accuracy claim, and what does a filter that trusts it do?

## Model
Pose `(x, y, θ)`; a ray `i` hits a map line with unit normal `n_i` at range `r_i` along direction `u_i`; range noise `σ`. Point-to-line Gauss-Newton uses residual `n_i·(w_i − c_i)` with Jacobian `h_i = [n_x, n_y, p_i × n_i]` (p relative to the sensor). Linearised at the true pose with fixed correspondences, the estimate error is `A⁻¹ Σ h_i s_i ε_i` with `A = Σ h_i h_iᵀ` and `s_i = σ|n_i·u_i|`, so `Cov = A⁻¹ (Σ h_i h_iᵀ s_i²) A⁻¹` (sandwich form, exact for the unweighted estimator). In a corridor with only two parallel walls every `n_i = (0, ±1)`, so the first column of `A` is zero: along-track information is exactly zero, and with the matcher's damping the solution returns the initial guess. Door-frame stubs (normals `(±1, 0)`) supply the only along-track information. The twin is a 20 m square room (isotropic `A`). A 1-D Kalman filter on `x` is fed with scan-matched `x` whose variance is either the twin's (a 10 m room at the same sensor settings: 1.9 mm) or the exact sandwich value (update skipped if `cond(A) > 10⁵`).

## Results
(from `experiments/results.txt`; `σ = 2` cm)
1. **Information.** Room: exact along-track sd 1.35 mm, MC 1.29 mm (200 scans); corridor, no stubs: `A` exactly singular, MC sd 0, mean error 0.0500 (the start offset). Stubs every 20, 10, 5, 2 m: `λ_min(A)` = 6.0, 10.0, 26.0, 76.2 (`λ_max` 5116, 3000, 1935, 561), exact sd_x 8.14, 6.31, 3.89, 2.20 mm, MC 7.25, 6.19, 4.25, 2.42 mm (4.7×, 2.9× of the room at 10 and 5 m). sd_y stays 0.78–0.95 mm (MC 0.78–1.0) and sd_θ 0.05–0.45 mrad, so a single position-variance number hides an anisotropic covariance whose long axis is 6× the room's.
2. **Basin.** Stubs every 10 m, start offset 0.0/0.05/0.1/0.2 m: mean error 1.8–2.0 mm, sd 6.7–6.9 mm, no run beyond 5 cm; 0.3 m: mean 0.131 m, 43% of runs beyond 5 cm; 0.5 and 1 m: error equals the offset (1.00). The exact covariance is valid only inside the basin.
3. **Filter.** 40 runs, 100 steps of 0.5 m; stubs every 5 m except 15–45 m; sensor range 10 m so x in 20–40 m sees nothing. Odometry-only claimed sd averages 0.070 m (1 cm/step). Mean NEES, twin filter: 22.9 (x<20), **431.5** (blind span), 77.7 (x>40) at 1 cm/step, and 23.5, **1535**, 388 at 2 cm/step; claimed sd 1.9 mm throughout against actual errors up to 6–12 cm at the span's end. Exact-covariance filter: 1.17, 0.75, 2.23 (1 cm) and 1.14, 0.75, 8.27 (2 cm). RMSE at x=40: 6.1 cm twin, 5.8 cm real (1 cm/step), 11.7 vs 11.5 cm (2 cm/step) — the twin's estimate is no worse, its *claimed* accuracy is. RMSE at the end of the run is ≈5 mm for both once stubs reappear.
4. **Negative result.** The covariance-aware filter is not consistent after the span: its measurement variance (cm-level) assumes the matcher is inside its basin, but the drift at re-entry (6–12 cm) is at the basin's edge, so mismatches enter as confident measurements (NEES 2.2 at 1 cm/step, 8.3 at 2 cm/step). A twin check of covariance must include the association basin, not only the information matrix.

## Limitations
Stylised, no logs. 2D; one sensor and noise level; stubs of 0.3 m depth; the room twin is a straw baseline chosen for its isotropy; nearest-neighbour association; a 1-D filter with y, θ supplied; 40 runs per filter row; the basin width is specific to this geometry. We do not claim a new estimator or degeneracy detector; the contribution is the quantified size of the error from an isotropic-information twin and the check that the sandwich covariance matches an actual ICP inside its basin.

## Next steps
Per-scan degeneracy flags (eigenvalues of `A`, as in Zhang et al. 2016) and covariance inflation with the basin; 3D tunnels with a lidar and realistic roughness; a twin that generates corridor clutter statistics (cf. generative scene synthesis) so the twin's information matches the field; fusion with radar or visual odometry in the along-track direction; connect to `filter-twin` and `loopclosure-twin`.

## References
- Censi, A. (2008). An ICP variant using a point-to-line metric. *IEEE ICRA*, 19–25.
- Gelfand, N., Ikemoto, L., Rusinkiewicz, S., Levoy, M. (2003). Geometrically stable sampling for the ICP algorithm. *3DIM*, 260–267.
- Zhang, J., Kaess, M., Singh, S. (2016). On degeneracy of optimization-based state estimation problems. *IEEE ICRA*, 809–816.
- Besl, P. J., McKay, N. D. (1992). A method for registration of 3-D shapes. *IEEE TPAMI* 14(2), 239–256.
- Bar-Shalom, Y., Li, X. R., Kirubarajan, T. (2001). *Estimation with Applications to Tracking and Navigation*. Wiley.
