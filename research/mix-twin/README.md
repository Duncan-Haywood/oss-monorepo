# Mix twin: how should cheap biased twin samples be weighted against scarce real ones?

Pure Python, no dependencies. Estimate a real parameter from `n` real samples and `m` twin samples whose mean is off by a bias `δ`. The optimal mix is exact: `w* = a/(a+b+δ²)` (`a=σ²/n`, `b=τ²/m`), MSE `1/(1/a + 1/(b+δ²))`, so the twin is worth at most `σ²/δ²` real samples however many twin rollouts are run. With `σ=τ=1`, `n`=10, `m`=1000: `δ`=0.5√a is worth 48.5 real samples (cap 50), `δ`=0.25√a is worth 137.9 at `m`=1000 and 157.5 at `m`=10⁴ (cap 160). **Equal-weight pooling** of all samples beats real-only iff `δ²<a+b` (exact for `τ=σ`): the more twin data, the closer the threshold falls to `δ<√a` (1.41√a at `m`=10, 1.05√a at `m`=100), and beyond it pooling is 1.44× worse than real-only at 1.2√a and 3.99× at 2√a (`m`=10⁴). Each twin sample should carry loss weight `σ²/(τ²+mδ²)` relative to a real one (0.138 at `m`=1000, `δ`=0.25√a). **Negative result on unknown bias:** estimating `δ` from the data (`D=z̄−ȳ`) costs a lot: the plug-in weight gets MSE 0.47·a at `δ`=0 (oracle 0.010·a) and is worse than real-only for `δ`≥1.5√a (peak 1.243×); the debiased plug-in peaks at 1.445×, a 5% pretest at 2.41×, naive pooling at 98×. All from `experiments/results.txt`. See `paper/whitepaper.md`.

```bash
cd research/mix-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 9 tests, ~2 s
PYTHONPATH=src python3 experiments/run.py                 # ~15 s; output in experiments/results.txt
```

**Builds on.** The sim-to-real direction of the HIRO group (<https://hiro-group.ronc.one/>) and ARPG (<https://arpg.colorado.edu/>), where cheap simulated data is mixed with scarce real data; no specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. The bias–variance combination and the pretest/shrinkage estimators are classical (Stein 1956); the multilevel alternative is in Giles (2015); sim-to-real motivation follows Tobin et al. (2017) and Zhao et al. (2020). Companion to `ladder-twin` (multilevel split of a simulation budget), `twin-transfer` and `finetune-twin` in this repository.

Stylised: a scalar mean, Gaussian noise with known variances, a constant twin bias, independent twin samples, no robot data. The adaptive-weight comparison covers three simple rules on one grid, not an optimal procedure. Preliminary. MIT.
