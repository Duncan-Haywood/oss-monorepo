# CRN twin: does giving two policies the same seed in a digital twin actually pair them?

Pure Python, no dependencies. A twin can do what reality cannot: replay two policies on the *same* random stream (common random numbers, CRN) so that their difference has far lower variance. But a seed only pairs the policies while their read pointers into the stream stay aligned. If one policy sometimes consumes an extra draw (a replan, a re-sampled sensor noise; probability `q` per step) every later draw is shifted and the two returns decorrelate. With return `Σ w_t z_{t+D_t}`, `D_t ~ Bin(t,q)`, the paired correlation is exactly `ρ = Σ_t Σ_d Bin(t,q)(d) w_t w_{t+d} / Σ w_t²` (matched to 30,000-episode simulation within 0.012), and the paired difference has variance `2σ_R²(1−ρ)`. For a flat 20-step sum `q` = 0.05/0.3 gives `ρ` = 0.952/0.767; for a **terminal-only** score `ρ = (1−q)^T` = 0.358/0.001, so a fixed seed buys nothing at `q=0.3`. Episodes for a 90%-power test of a 0.3σ gap: 233 independent, 11/55 flat, 150/233 terminal at `q`=0.05/0.3. Sizing a comparison as if seeds stayed synchronised (`ρ=0.95`, n=12) gives power 0.85 (flat, q=0.05), 0.29 (flat, q=0.3) and 0.11–0.16 (terminal) against a nominal 0.90. Keying each draw by (episode, step) restores `ρ=1` exactly. See `paper/whitepaper.md`.

```bash
cd research/crn-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests, ~3 s
PYTHONPATH=src python3 experiments/run.py                 # ~40 s; output in experiments/results.txt
```

**Builds on.** The simulation-based policy-comparison direction of the HIRO group (<https://hiro-group.ronc.one/>), ARPG (<https://arpg.colorado.edu/>) and RECUV (<https://www.colorado.edu/recuv/>), where policies are ranked in simulation before real trials. No specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. CRN and its synchronisation requirement are classical (Law & Kelton 2000; Glasserman & Yao 1992); counter-based parallel generators are from Salmon et al. (2011). Companion to `twin-evaluation` (the twin as a control variate for *real* rollouts, where seeds cannot be shared) in this repository.

Stylised: Gaussian per-step noise, policies that differ only in how many draws they consume (plus an optional mean gap), events independent of the noise; no robot or simulator data. In the degenerate equal-means case the counter-based repair gives a difference of exactly zero, so the repair's value on real policies depends on how much of their difference is not shared noise. MIT.
