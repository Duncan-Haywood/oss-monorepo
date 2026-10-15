# Warm-start twin: how biased is a short digital-twin run started from a default state?

Pure Python, no dependencies. Averaging `n` steps of a twin reset to an empty queue or zero error biases the mean toward that start. For AR(1) output the bias, variance and MSE-optimal warm-up deletion are exact (bias/sd 1.88, 0.67, 0.28, 0.12 at n=20/100/500/2500, φ=0.9, a=3, matched to simulation). For the M/M/1 wait started empty the summed bias is `C = ρ/(1−ρ)³` (a closed form matched to an exact Spitzer series and to coupled simulation), so bias equals one standard deviation only at `n* = C²/V` = 0.55/2.0/22.6 jobs at ρ=0.5/0.7/0.9, small next to the relaxation time (12/37/380): at run lengths long enough for a valid interval the cold start costs 1–3 points of coverage. Short runs are different: at ρ=0.9 the mean of 50 waits from an empty start is 5.6 below the true 9 (62%), a systematically optimistic twin; a start at the mean cuts the bias but not reliably the RMSE; a start from a noisy real-state estimate is unbiased but has 3.6× the sd; and MSER-5 truncation made both bias and coverage worse here. See `paper/whitepaper.md`.

```bash
cd research/warmstart-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 10 tests, ~2 s
PYTHONPATH=src python3 experiments/run.py                 # a few minutes; output in experiments/results.txt
```

**Builds on.** The digital-twin simulation-fidelity and field-robot direction of the Autonomous Systems IRT (<https://www.colorado.edu/irt/autonomous-systems/>) and the lab-workcell twins of the HIRO Group (<https://hiro-group.ronc.one/>); no specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. The method is classical initial-transient analysis (Spitzer 1956; White 1997 for MSER; Law & Kelton 2000). Companion to `autocorr-twin` (variance of one long run) and `queue-twin` in this repository.

Stylised: Gaussian AR(1) and M/M/1 output, a simulated "real" system, no lab data; `C = ρ/(1−ρ)³` is verified numerically, not proved. MIT.
