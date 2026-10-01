# Odometry twin: what does a simulator tuned on one-step odometry noise get wrong about drift, relocalisation and loop closure?

Pure Python, no dependencies. Each traversal has a persistent bias `b~N(0,σ_b²)` plus white noise, so real error after `T` steps has variance `σ_1²(ρT²+(1−ρ)T)`; a twin fitted to one-step increments (identical for every `ρ`) predicts `σ_1²T`, and the ratio is exactly `1+(T−1)ρ`. Results (stylised, 1-D): with 5% of step variance persistent, the twin's relocalisation interval (163 steps for a 5% miss target at 0.5 m) is 3.4× too long and the real miss probability is 51.6%; a 3σ loop-closure gate tuned in the twin accepts true closures with probability 0.908/0.642/0.327 at `T`=50/200/1000 instead of 0.9973, and in a closed loop the rejections make error run away (RMS 8.8 m vs 0.17 m calibrated at `T=200`). A calibrated gate is not a cure-all: with aliased closures offset by 1 m it accepts 97–99% of them once drift uncertainty exceeds the offset. Inflating the twin variance by a ratio fitted at the loop length from `n` ground-truth traversals recovers recall to 0.970 at `n=5` and 0.996 at `n=50`, but the ratio does not transfer to other loop lengths. See `paper/whitepaper.md`.

```bash
cd research/odometry-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 10 tests, ~1 s
PYTHONPATH=src python3 experiments/run.py                 # ~25 s; output in experiments/results.txt
```

**Builds on.** The perception, SLAM and sensor-simulation direction of the ARPG group (Christoffer Heckman, <https://arpg.colorado.edu/>), where simulated environments and sensors are used to develop and test mapping; no specific paper from that group is reproduced and nothing here is affiliated with or endorsed by it. The method is classical: Allan (1966), *Proc. IEEE* 54(2), on distinguishing white from persistent noise by lag; Mahalanobis gating (Bar-Shalom, Li & Kirubarajan 2001, *Estimation with Applications to Tracking and Navigation*); aliased closures (Sünderhauf & Protzel 2012, IROS); SLAM survey context (Cadena et al. 2016, *IEEE T-RO* 32(6)). Companion to `radar-clutter-twin`, `occupancy-twin`, `randomized-twin` and, closest, `loop-closure-twin` (which studies the same gate with a too-clean drift-variance twin; this project instead separates persistent bias from white noise, which one-step fitting cannot identify) in this repository.

Stylised: 1-D Gaussian error, one bias per traversal, an assumed one-step-fitted twin, chosen gate and alias offset, Monte Carlo closed loop without error bars, no real odometry data. MIT.
