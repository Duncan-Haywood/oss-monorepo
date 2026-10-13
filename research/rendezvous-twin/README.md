# Rendezvous twin: how often should robots rendezvous when the twin's odometry drift has no bias?

Pure Python, no dependencies. A multi-robot mapping team dead-reckons and resets its position error at a rendezvous or loop closure (cost `c=50`). The real error variance `t` time units after a reset is `V(t)=s²t+b²t²`: white odometry noise plus a per-run bias rate (calibration error, slip, gyro bias) of variance `b²`. A twin fitted on short-horizon increments sees only `s²t`, so it plans a rendezvous every `√(2c/(λs²))=10` and claims a peak error std of `√(s²T)=3.16`. The real cost-optimal interval solves the cubic `(2/3)λb²T³+(λs²/2)T²=c` (bisection), and the real error at the twin's interval is exactly `√(1+b²T/s²)` times the claim. Results (stylised; variance law and pairwise law checked by Monte Carlo): with quadratic-to-linear ratio `ρ=b²T/s²` of 0.1/0.3/1/3 the twin's interval has real regret 0.19/1.35/8.65/34.6%, the real optimum is 6–80% more rendezvous, and the peak error is 1.05–2.0× the claim. Under an error-budget rule the twin's interval breaches the budget for 8–55% of each cycle. Map merging uses the pairwise relative frame, where a shared bias cancels: with bias correlation 0.9 the twin's regret falls from 5.3% to 0.10%. Fitting `(s²,b²)` needs ground-truth error at a long lag as well as a short one, and about 5–10 runs to beat the twin's mean regret (8.65%) reliably. See `paper/whitepaper.md`.

```bash
cd research/rendezvous-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests, ~1 s
PYTHONPATH=src python3 experiments/run.py                 # ~1 min; output in experiments/results.txt
```

**Builds on.** The multi-robot mapping and sensor-simulation direction of the ARPG group (Christoffer Heckman, <https://arpg.colorado.edu/>), where simulated environments are used to develop SLAM and field-robot perception; no specific paper from that group is reproduced and nothing here is affiliated with or endorsed by it. The method is classical: random-walk versus bias drift in inertial and odometry error models (Allan 1966, *Proc. IEEE* 54(2), on variance as a function of averaging time; Thrun, Burgard & Fox 2005, *Probabilistic Robotics*, MIT Press) and renewal-reward planning of reset intervals. Companion to `twin-transfer`, `latency-twin` and `workcell-twin` in this repository.

Stylised: one-dimensional error, Gaussian white noise plus a Gaussian constant bias per run, an instantaneous reset with no residual measurement noise, a quadratic error cost, and synthetic rather than logged odometry. MIT.
