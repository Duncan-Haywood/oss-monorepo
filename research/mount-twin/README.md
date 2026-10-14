# Mount twin: a radar twin assumes the sensor is aligned with the body, what does a real mount-yaw error do to dead reckoning, and can the twin's validation see it?

Pure Python, no dependencies. A robot drives a planar path; a radar measures ego velocity in a sensor frame yawed by `e` relative to the body, and the twin assumes `e = 0`. Results (all from `experiments/results.txt`): (1) in 2-D rotations commute, so the dead-reckoned path is *exactly* the true path rotated by `−e` about the start and the position error is `2 sin(e/2)·|p(t)−p(0)|` (max deviation from the formula 10⁻¹² over 20 random paths; 0.0175, 0.0872, 0.347 of the displacement at 1°, 5°, 20°), so it is bounded by the path diameter, does not accumulate with path length, and is zero after any closed loop; (2) therefore a loop-closure or out-and-back validation of the twin reports error 10⁻¹⁴ while the same path length driven straight has 27.4 m error at `e = 10°` over 157 m, and on a radius-50 circle the error peaks at 17.43 m mid-lap (`chord × diameter`); (3) the angle is recovered in closed form by a 2-D rotation fit against position fixes with standard deviation `σ/√Σ|p_i|²` (0.0985° predicted vs 0.0978° measured for 100 straight fixes at σ = 1; 95% intervals cover 94.7–95.2%), so a long, non-returning path is what calibrates it; (4) the result is a 2-D artefact: a *pitched* mount on a level circle gives vertical drift exactly `laps·2πR sin e` (27.38 over 10 laps at R = 5, e = 5°) while x-y closure is 10⁻¹⁴, so loop closure does not remove it. Stylised: known headings, noiseless velocities, planar (except the last item), simulated "real" system; see `paper/whitepaper.md`.

```bash
cd research/mount-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 6 tests, under 1 s
PYTHONPATH=src python3 experiments/run.py                 # a few seconds; output in experiments/results.txt
```

**Builds on.** The radar-sensing, sim-to-real perception and field-robot direction of ARPG (<https://arpg.colorado.edu/>) and the Autonomous Systems IRT (<https://www.colorado.edu/irt/autonomous-systems/>) and RECUV (<https://www.colorado.edu/recuv/>); no specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. Extrinsic calibration and the least-squares rotation fit are classical (Kabsch 1976; Umeyama 1991). Companion to `doppler-twin`, `odometry-twin` and `gyro-twin` in this repository.

Stylised: planar kinematics, simulated "real" system, no field data. MIT.
