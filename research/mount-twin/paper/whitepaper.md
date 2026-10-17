# A twin that assumes the radar is aligned with the body: the error is a rotation, bounded by the path diameter, and invisible to loop closure

*Stylised: planar kinematics with known headings, pure Python; every number is from `experiments/results.txt` (deterministic). The "real" system is simulated; no field data. The 3-D item is a limitation, not a generalisation.*

## Question
Radar ego-velocity dead reckoning is a standard sim-to-real perception pipeline. A twin usually assumes the sensor frame equals the body frame. If the real mount is yawed by `e`, how large is the error, how does it grow, and does a typical twin validation notice?

## Model
Body heading `θ(t)`, body velocity `v_b`. The radar reports `v_s = R(−e) v_b`; the twin uses `v_s` as `v_b`. Then `p̂' = R(θ)R(−e)v_b = R(−e)R(θ)v_b` because planar rotations commute, so `p̂(t) = R(−e)p(t)` (start at the origin) and `|p̂ − p| = 2 sin(e/2)|p|`.

## Results
1. **Exact rotation.** Over 20 random-walk headings (500 steps) the maximum deviation of `p̂` from `R(−e)p` is below 10⁻¹², and from the chord formula below 10⁻¹², for e = 1°–20°. Error/displacement: 0.01745, 0.03490, 0.08724, 0.17431, 0.34730 at 1°, 2°, 5°, 10°, 20°.
2. **Bounded, and zero after loops.** Error depends on displacement from the start, not path length. On a radius-50 circle (path 314) at e = 10° the end-of-lap error is 1.5·10⁻¹⁴ and the peak mid-lap error is 17.43 = chord × diameter; an out-and-back path gives 2.7·10⁻¹⁴, while 157 m driven straight gives 27.37 = chord × 157. A validation set made of loops or out-and-backs certifies the misaligned twin perfectly.
3. **Calibration.** The least-squares rotation between dead-reckoned and reference positions is `atan2(Σ cross, Σ dot)`; with i.i.d. position noise σ its standard deviation is `σ/√Σ|p_i|²`. Measured vs predicted (degrees, 4000 trials, e = 5°): 0.0978 vs 0.0985 (100 straight fixes, σ = 1), 0.0124 vs 0.0124 (400), 0.0129 vs 0.0129 (wiggly), 0.0645 vs 0.0645 (σ = 5), 0.0459 vs 0.0463 (tight loops, smaller displacements); 95% interval coverage 0.947–0.952. Information comes from displacement from the start, so tight loops calibrate worse than straight runs of equal length.
4. **Limitation: 3-D.** With the mount pitched by e on a level circle (R = 5), vertical drift is exactly `laps·2πR sin e` (2.7381, 5.4762, 13.6904, 27.3808 at 1, 2, 5, 10 laps, matching simulation) while x-y closure is ~10⁻¹⁴. Non-commuting rotations break results 1–2, so the planar story must not be transferred to pitch or roll mounts.

## Limitations
Noiseless velocities and known headings; in practice heading itself comes from an estimator that may absorb part of the offset. Only a constant mount offset; no lever-arm or time-offset terms. Planar except item 4. Not evidence about any specific radar.

## Next steps
Add lever arm and time offset, estimate heading jointly, and test on recorded radar/GNSS logs.

## References
Kabsch (1976); Umeyama (1991); see `refs.bib`. Builds on the digital-twin sensor-simulation direction of ARPG, the Autonomous Systems IRT and RECUV (no affiliation or endorsement implied).
