# Ghost ranges at a depth edge: what a single-ray lidar twin cannot produce

## Question
Perception stacks trained or validated in a simulator that casts one ray per beam see only the near or the far surface at a depth edge. Real beams have finite width, and when the two return pulses are too close to resolve, the detector reports an energy-weighted range between the surfaces: a ghost point in free space. How wide is the beam region that produces ghosts, how many ghost returns does an edge cost, and do persistence filters remove them?

## Model
A near surface fills `x < 0` at range `r1`, a far wall sits at `r1 + D`. The beam has a Gaussian transverse profile with unit standard deviation; with its centre at offset `u` (positive toward the near side) the near surface receives fraction `w(u) = Φ(u)` of the energy. Received energies are `E1 = wρ1/r1²` and `E2 = (1−w)ρ2/r2²`, and `κ = (ρ2/ρ1)(r1/r2)²` is their ratio at half coverage. For `D` below the merge range the reported range is `r1 + D f`, `f = E2/(E1+E2) = κ(1−w)/(w+κ(1−w))`. A return is a ghost if `f ∈ (ε/D, 1−ε/D)`. Inverting, `w/(1−w) = κ(1−f)/f`, so the ghost band is `u ∈ (u(1−ε/D), u(ε/D))` with `u(f) = Φ⁻¹(κ(1−f)/(f+κ(1−f)))`. At `κ = 1` it is symmetric with width `2Φ⁻¹(1−ε/D)`. With a beam std of `q` scan steps an edge crossing yields `q·width` ghosts on average and at least one with probability `min(1, q·width)` over a uniform scan phase. The twin returns `r1` for `u > 0` and `r1 + D` otherwise.

## Results
(all from `experiments/results.txt`)
1. **Width.** At `κ = 1`, `ε/D = 0.01, 0.05, 0.1, 0.2, 0.4, 0.49` gives 4.653, 3.290, 2.563, 1.683, 0.507, 0.050 beam std; the direct scan of the returned range agrees to 1e-4. It is zero at `ε/D = 0.5`. Pushing it below 1, 0.5, 0.25 beam std needs `ε/D ≥ 0.309, 0.401, 0.450`.
2. **Brightness.** At `ε/D = 0.1`, `κ = 0.01, 0.1, 0.3, 1, 3, 10, 100` gives widths 1.671, 2.225, 2.461, 2.563, 2.477, 2.225, 1.671 and centres −2.224, −1.178, −0.618, 0, 0.564, 1.178, 2.224: the band sits where the dimmer surface starts to dominate and narrows as `|ln κ|` grows. A strongest-return detector shows no ghosts but moves the apparent edge by `Φ⁻¹(κ/(1+κ))`: −2.330, −1.335, −0.736, 0, 0.674, 1.335, 2.330 beam std.
3. **Absolute scale.** With `ε = 0.10 m`: no ghost for `D ≤ 0.2 m`; `D = 0.25, 0.4, 0.6, 1, 2 m` gives bands of 0.507, 1.349, 1.935, 2.563, 3.290 beam std. If pulses merge only below `R = 0.75 m` ghosts exist only for `D ∈ (0.2, 0.75)`; with `R = 2.25 m` they exist up to the largest step tabulated (2 m). At `q = 1` an edge yields 0.51–3.29 ghosts; at `q = 2`, at least one for every `D ≥ 0.25 m`.
4. **Scan simulation.** Edges every ≈100 beams (jittered ±25), 600000 beams: ghost fraction equals `width·q/100` to within 0.3% (ratios 0.9973, 1.0006, 1.0000, 1.0011, 0.9988 for `(κ, ε/D, q)` = (1, 0.1, 1), (1, 0.1, 3), (1, 0.02, 1), (10, 0.1, 2), (0.1, 0.25, 2)).
5. **Persistence.** Ghost samples are a property of the geometry, not of noise. A 3-of-5 persistence filter over five scans of a static robot passes 99.2%, 98.4%, 95.0%, 80.4% of ghost samples at pointing jitter 0.05, 0.1, 0.3, 1 beam std. Only motion that exceeds a beam width starts to remove them.
6. **Worked example.** `r1 = 10 m`, `D = 0.5 m`, equal energies, beam on the edge: the twin returns 10.00 m or 10.50 m, the real sensor 10.250 m, 0.25 m from either surface.

## Limitations
Stylised, no real scans. The merge is a hard threshold on `D` rather than a waveform model with partial resolution, and ranges are an exact energy centroid with no range noise. The footprint is 1-D across a straight edge: no 2-D footprint, curved edges, surface slope, incidence-angle or saturation effects; `κ` is fixed rather than varying with range and reflectance. Persistence uses i.i.d. pointing jitter on a static robot, not platform motion. The twin is a deliberately naive baseline; a beam-aware twin reproduces these results by construction, so the point is the size of the effect, not that it is unfixable.

## Next steps
Fit `ε`, `κ` and the merge range from real scans of calibrated edges; a 2-D footprint with slanted edges; a waveform-level twin that resolves partial overlap; the geometry-based filters (neighbour range jumps, incidence angle) and their cost in genuine edge points; effect on occupancy mapping and on frontier-based exploration, where a phantom obstacle in a doorway blocks a free route.

## References
- Tuley, J., Vandapel, N., Hebert, M. (2005). Analysis and removal of artifacts in 3-D LADAR data. *IEEE ICRA*.
- Sotoodeh, S. (2006). Outlier detection in laser scanner point clouds. *ISPRS Archives* 36(5).
