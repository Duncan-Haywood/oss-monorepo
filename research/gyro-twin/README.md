# Gyro twin: a gyro twin calibrated on white noise hides the bias random walk, so how wrong is its heading error, re-alignment interval and dead-reckoning budget, and does a single-point Allan fit help?

Pure Python, no dependencies. Real gyro: rate = white noise `N = 0.005 °/√s` plus a bias that random-walks with `K = 10⁻⁴ °/s/√s` (`t* = √3N/K = 86.6 s`); twin: white noise only. Results (all from `experiments/results.txt`): (1) heading variance `N²t + K²t³/3` vs the twin's `N²t`, ratio exactly `1+(t/t*)²` (2.33 at 100 s, 134 at 1000 s), matched by Monte Carlo and an exact discrete formula; (2) Allan variance `N²/τ+K²τ/3` reproduced from a simulated record to 3% for τ ≤ 10 s (7% low near the minimum, 33% low at 1000 s where one record has ~10 independent pairs); (3) re-aligning so that 2σ heading stays within 1° is every 416 s, the twin allows 10 000 s (24×), where the real error exceeds 1° with probability 0.986; (4) an Allan fit at τ₀ = 1–10 s changes nothing, at 100 s it is exact only at t = 100 s (variance ratio 2.3 at 1 s, 0.18 at 300 s) and at 1000 s it is 5.6× too conservative; (5) cross-track error `v²(N²t³/3 + K²t⁵/20)`: for 2σ ≤ 1 m the twin reports 1.74× (1 m/s) and 1.25× (5 m/s) too much usable distance. Stylised: linear-Gaussian, one axis, parameters chosen by me, no aiding sensor, no real IMU data; see `paper/whitepaper.md`.

```bash
cd research/gyro-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests, about 1 s
PYTHONPATH=src python3 experiments/run.py                 # about 5 s; output in experiments/results.txt
```

**Builds on.** The digital-twin sensor-simulation and sim-to-real perception/SLAM direction of ARPG (<https://arpg.colorado.edu/>), and the UAV and field-robot autonomy of RECUV (<https://www.colorado.edu/recuv/>) and the Autonomous Systems IRT (<https://www.colorado.edu/irt/autonomous-systems/>); no specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. Allan-variance noise identification follows IEEE Std 952 and El-Sheimy et al. (2008), and dead-reckoning error growth follows Woodman (2007); this project restates those in closed form and checks what a white-noise twin gets wrong, not a new method. Companion to `odometry-twin` (persistent bias), `rendezvous-twin` and `shutter-twin` in this repository.

Stylised: simulated "real" sensor, no IMU data. MIT.
