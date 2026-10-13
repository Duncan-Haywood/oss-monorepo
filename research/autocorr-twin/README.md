# Autocorrelation twin: how much is one long digital-twin run worth when its output is serially correlated?

Pure Python, no dependencies. A twin is often run once for a long time and summarised as `mean ± 1.96 s/√n`, which assumes independent samples. For stationary AR(1) output the run mean has exact variance `(σ²/n²)[n + 2Σ(n−k)φ^k]` (matched to simulation: `n·Var` 18.82 vs 19.15 at φ=0.9, n=1000), so 1000 draws are worth an effective 334/53/6 at φ=0.5/0.9/0.99 and the naive interval covers 76%/34%/10% instead of 95%. For the M/M/1 waiting time of a shared lab instrument the asymptotic variance of the run mean is `ρ(2+5ρ−4ρ²+ρ³)/(1−ρ)⁴` (Daley 1968; Whitt 1989), 9.7×/33×/363× the iid value at ρ=0.5/0.7/0.9: from 10⁴ jobs the naive interval covers the true mean wait 53%/26%/9% of the time and its half-width is 14× too small at ρ=0.9. A twin that "certifies" an SLA of 8 when the true mean wait is 9 does so in 26.0% of naive runs vs 4.8% with 30-batch means. The iid formula asks for 470 jobs for ±10% at ρ=0.9; the exact length is 170 268, and higher load needs a longer run, not a shorter one. Batch means restore coverage (94.7%/93.7% at ρ=0.5/0.7, 94.2% at the exact run length) but only when batches outlast the correlation: coverage 0.535 at φ=0.99 with 33-draw batches, 82.5% at ρ=0.9 and n=10⁴. See `paper/whitepaper.md`.

```bash
cd research/autocorr-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests, ~3 s
PYTHONPATH=src python3 experiments/run.py                 # ~2 min; output in experiments/results.txt
```

**Builds on.** The digital-twin simulation-fidelity and field-robot direction of the Autonomous Systems IRT (<https://www.colorado.edu/irt/autonomous-systems/>) and the lab-workcell twins of the HIRO Group (<https://hiro-group.ronc.one/>); no specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. The method is classical simulation output analysis: batch means (Schmeiser 1982; Law & Kelton 2000) and the M/M/1 waiting-time asymptotics of Daley (1968) and Whitt (1989). Companion to `queue-twin` (wrong service law) and `twin-evaluation` (twin as control variate) in this repository.

Stylised: Gaussian AR(1) and M/M/1 output, fixed-length runs, one batch rule (b=30), a simulated "real" system, no lab data. The M/M/1 formula is cited, not derived; simulation agrees within the noise of the estimate (see the paper). MIT.
