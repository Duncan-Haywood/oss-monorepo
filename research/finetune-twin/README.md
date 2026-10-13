# Finetune twin: how many real steps does a twin-pretrained policy save, and where must the twin be right?

Pure Python, no dependencies. A policy is pretrained in a digital twin, then fine-tuned with constant-step SGD on the real plant. On a quadratic real loss `½Σλᵢeᵢ²` with gradient noise `s`, the expected loss after `k` real steps is exact: `E eᵢ(k)² = rᵢ²ᵏ eᵢ(0)² + ηs²/(λᵢ(2−ηλᵢ))(1−rᵢ²ᵏ)`, `rᵢ = 1−ηλᵢ`, matched to Monte Carlo within 0.3% (`d`=10, `κ`=100, `η`=0.1, `s`=0.3). Results, all from `experiments/results.txt`: (1) the twin start saves a fraction of the cold-start steps (64% at twin error 0.6× the cold error, all targets from 8× to 1.2× the SGD floor), exactly 0 at equal error, and is **negative transfer** (−138 steps at 1.5×, −523 at 3×) once the twin is worse than a zero start; (2) for *any* curvature spectrum the loss left by a twin error of norm `b` after `k` real steps is `≤ b²/(4eηk)`, attained (within 3%) by the single direction `λ* = 1/(2ηk)`, so twin error does not wash out geometrically: the damaging direction moves flatter as you fine-tune; (3) at the same initial loss (0.5), a twin error in the stiffest direction needs 13 real steps to reach 2× the floor, isotropic-in-loss needs 599, and in the flattest direction 1,541 (118×). Fine-tuning repairs a twin where the loss is steep and inherits it where the loss is flat. See `paper/whitepaper.md`.

```bash
cd research/finetune-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests, ~2 s
PYTHONPATH=src python3 experiments/run.py                 # ~10 s; output in experiments/results.txt
```

**Builds on.** The sim-to-real direction of the HIRO group (<https://hiro-group.ronc.one/>) and ARPG (<https://arpg.colorado.edu/>), where policies and perception models are trained in simulation and adapted on hardware; no specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. The SGD recursion is the standard quadratic analysis (Bach & Moulines 2013; Défossez & Bach 2015); the sim-to-real motivation follows Zhao et al. (2020) and Tobin et al. (2017). Companion to `twin-transfer` (twin as a ridge prior, worth in real probe steps) and `twin-upkeep` in this repository.

Stylised: a convex quadratic with known spectrum, additive isotropic gradient noise, the twin's error given as a fixed parameter offset (not derived from a physical model mismatch), constant step size, no robot data. Preliminary. MIT.
