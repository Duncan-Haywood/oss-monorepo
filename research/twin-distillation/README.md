# Twin distillation: what a too-clean digital twin does to a cloned student

Pure Python, no dependencies. Companion to `twin-transfer`, `twin-audit` and `occupancy-twin`. A privileged teacher (sees the true state) is trained in a digital twin and its actions are cloned into a student that only sees a noisy sensor `z = x + ζ` — the standard sim-to-real "teacher–student" recipe. Because the sensor noise attenuates a least-squares fit, the cloned gain is `k = gP/(P+s)` where `P` is the state variance of whatever loop generated the demonstrations; the twin's own process noise therefore sets the student's gain. Results (scalar LQ, stylised): the cloned gain depends on the twin only through the ratio of twin process noise to sensor noise; a twin with a quarter of the real process noise gives a student that under-controls and pays 0.36 (s=0.5) to 1.11 (s=2) excess cost against 0.005 to 0.10 from an exact twin, 2.8–3.6× worse than on-policy DAgger in the same twin; on-policy imitation of an exact teacher in the real plant is within 3.5% of the best memoryless student over a 252-cell grid; behaviour cloning's regret can *cancel* an actuator error in the teacher but the cancellation point moves with sensor noise (bh=0.906 at s=0.5, 0.642 at s=2), so it is not a robustness property; aggregated DAgger converges like `1/n`; and injecting demonstration noise in the twin, set from one real scalar (`Var z − s`), recovers the on-policy real gain in two rounds (regret 0.357 → 0.0035 → 0.00003) with 300 real steps enough for a ≤ 0.009 90th-percentile regret. See `paper/whitepaper.md`.

**Builds on / related labs:** CAIRO Lab (learning from demonstration), HIRO Group (sim-to-real for manipulation), ARPG (sim-to-real for perception). It builds on, and does not imply any affiliation with, the cited work: Ross, Gordon & Bagnell (DAgger, 2011), Laskey et al. (DART, 2017), Chen et al. (Learning by Cheating, 2019), Lee et al. (2020), Kumar et al. (RMA, 2021).

```bash
cd research/twin-distillation
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 9 tests, ~1 s
PYTHONPATH=src python3 experiments/run.py                 # ~1 min; output in experiments/results.txt
```
Stylised scalar LQ, Gaussian noise, linear memoryless student, known sensor noise `s`; no real robot data. MIT.
