# RANSAC twin: an iteration budget sized on a fixed-inlier-fraction twin vs scenes whose inlier fraction varies

Pure Python, no dependencies. Real system (simulated): robust line fitting by RANSAC (Fischler & Bolles 1981) on N = 100 correspondences, minimal sample s = 2, in scenes whose inlier count is beta-binomial with mean 50% and concentration κ (κ = 4 gives a scene-to-scene inlier-fraction sd of 0.23). The twin gives every scene exactly 50 inliers, so the textbook budget K = ⌈log(1−p)/log(1−q)⌉ is 17 for p = 0.99, with a twin failure rate of 0.8%. Results (all from `experiments/results.txt`): (1) the exact failure probability at K = 17 is 1.3% (binomial scene variation only), 2.4% (κ = 50), 7.0% (κ = 10), 14.1% (κ = 4), 21.7% (κ = 2) and 30.0% (κ = 1); the budget that restores 99% is 19, 23, 58, 458 and, for κ ≤ 2, does not exist because scenes with fewer than s inliers (2.0% at κ = 2, 8.5% at κ = 1) cannot succeed at any K; (2) the exact failure matches a Monte-Carlo sampler (e.g. 0.1408 vs 0.1397 at κ = 4, 3000 scenes); (3) in an end-to-end line fit with noise, 17 iterations give a slope-failure rate of 0.9% when κ is large but 12.6% at κ = 4, and the 458-iteration budget brings it to 1.8% (1000 scenes each; a different event from the sampling failure, and the 1.8% is above the 1% target).

```bash
cd research/ransac-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 6 tests, under 1 s
PYTHONPATH=src python3 experiments/run.py                 # under a minute; output in experiments/results.txt
```

**Builds on.** The perception sim-to-real and multi-robot mapping directions of ARPG (<https://arpg.colorado.edu/>); no specific paper from that group is reproduced and nothing here is affiliated with or endorsed by them. RANSAC and its iteration formula: Fischler & Bolles, "Random sample consensus", Communications of the ACM 24(6):381–395, 1981. Companion to `particle-twin` and `gate-twin`.

Stylised: simulated scenes; the beta-binomial law for scene inlier counts is an assumption chosen to span "twin-like" to "highly variable", not fitted to any dataset; only line fitting with s = 2; the sampler and budget assume independent draws; the end-to-end failure threshold (slope error 0.1) is arbitrary. MIT.
