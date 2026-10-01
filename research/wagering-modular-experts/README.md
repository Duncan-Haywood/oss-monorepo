# Self-financed wagering as a router for modular, continually learning experts

Pure-stdlib research code (MIT). Connects the **wagering-mechanism** line of
work from Frongillo/Waggoner and coauthors
([Lambert et al., *Self-financed wagering mechanisms for forecasting*, EC 2008](https://www.bowaggoner.com/);
[Frongillo & Waggoner, CU Boulder Algorithmic Economics](https://www.colorado.edu/cs-theory/alg-econ))
to Gensyn's setting of modular models contributed by many untrusted parties
on heterogeneous hardware.

## Idea

If a network is a pool of independently trained *modules* (experts), who gets
influence when the data distribution drifts and regimes recur? A
weighted-score wagering mechanism (WSWM) answers with money: each module
wagers a fraction `f` of its wealth, is paid `m_i(1 + s_i - s_bar)` (Brier
score `s_i`, wager-weighted mean `s_bar`), and the aggregate forecast is the
wager-weighted pool. Properties (all unit-tested here): budget balance,
non-negative payoffs, truthfulness for a proper score, sybil-proofness.
The wealth update `w_i <- w_i (1 + f (s_i - s_bar))` **is** a multiplicative-
weights update with learning rate `f`, so wealth = router weight and the
mechanism doubles as a verifiable, permissionless mixture-of-experts gate:
the update is a deterministic public function of reports and outcomes, so a
referee can replay it (cf. Gensyn's Verde).

Question: how does this behave under piecewise-stationary drift with
*recurring* regimes (continual learning)?

## Setup (`src/wagering_experts`)

Stream of binary outcomes with latent `q_t ~ U(0.1, 0.9)`; 3 regimes cycling
every `period` rounds. Module `k` is a specialist (report noise 0.05 in
regime `k`, 0.35 elsewhere), plus a lazy module (always 0.5) and an adversary
(reports ~`1 - q`). Regret is per-round Brier loss minus the best-in-regime
expert. Baselines: equal weights, Hedge (eta=2), Hedge + fixed share.
`alpha` is a fixed-share wealth tax (redistributed equally, total wealth
conserved).

```bash
cd research/wagering-modular-experts
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 13 tests
python3 experiments/run_experiment.py                      # ~25 s, all tables
```

## Results (10 seeds, 6000 rounds; numbers from `run_experiment.py`)

**1. Regret per round vs oracle (mean ± sd).** Lower is better.

| period | equal | Hedge | Hedge+FS | WSWM f=.5 | WSWM f=1 | WSWM+FS f=.5 | WSWM+FS f=1 |
|---|---|---|---|---|---|---|---|
| 25 | 0.0288 ± 0.0022 | 0.0488 ± 0.0021 | 0.0217 ± 0.0012 | 0.0498 ± 0.0028 | 0.0521 ± 0.0049 | 0.0195 ± 0.0016 | 0.0200 ± 0.0014 |
| 100 | 0.0286 ± 0.0021 | 0.0489 ± 0.0022 | 0.0137 ± 0.0007 | 0.0507 ± 0.0020 | 0.0516 ± 0.0022 | 0.0158 ± 0.0013 | 0.0126 ± 0.0010 |
| 400 | 0.0283 ± 0.0021 | 0.0490 ± 0.0026 | 0.0105 ± 0.0009 | 0.0524 ± 0.0023 | 0.0524 ± 0.0023 | 0.0133 ± 0.0014 | 0.0082 ± 0.0010 |

**Finding 1 — plain WSWM locks in.** Without a tax, WSWM (like plain Hedge)
is *worse than equal weights* under recurring regimes: wealth concentrates on
whichever specialist won first and the others' wealth decays to ~0, so they
cannot regain influence when their regime returns (final wealth shares
0.900 / 0.000 / 0.100 for the three specialists). This is a continual-
learning failure of a mechanism that is otherwise a static-environment
optimum.

**Finding 2 — a fixed-share tax fixes it.** WSWM+FS beats Hedge+FS at every
period (e.g. period 400: 0.0082 vs 0.0105; period 25: 0.0195 vs 0.0217),
though Hedge's eta=2 was fixed, not tuned, so this is not a claim about the
best possible Hedge.

**2. (f, alpha) grid, period 100, regret per round.**

| f \ alpha | 0.0 | 0.01 | 0.03 | 0.1 | 0.3 |
|---|---|---|---|---|---|
| 0.1 | 0.0282 | 0.0183 | 0.0220 | 0.0261 | 0.0279 |
| 0.25 | 0.0431 | 0.0166 | 0.0175 | 0.0233 | 0.0270 |
| 0.5 | 0.0507 | 0.0186 | 0.0145 | 0.0199 | 0.0256 |
| 1.0 | 0.0516 | 0.0222 | 0.0132 | 0.0160 | 0.0236 |

The best `alpha` grows with the wager fraction `f` (aggressive wagering needs
a bigger floor); a small `f` alone (0.1) also mitigates lock-in by learning
slowly, at the price of slower specialisation.

**3. Excess loss right after a switch (period 100)** — not a fast-recovery
story: within 20 rounds of a switch no mechanism closes the gap
(WSWM+FS ~0.028 → 0.020 vs equal ~0.029 → 0.028). The tax's benefit is
mostly avoiding lock-in, not instant re-routing. (Table in script output.)

**4. Final wealth shares** — WSWM: 0.900 / 0.000 / 0.100 / 0 / 0.
WSWM+FS (alpha 0.03): 0.101 / 0.189 / 0.482 / **0.179 lazy** / 0.049 adversary
(snapshot at the end of one regime, so shares are regime-dependent).

**Finding 3 — the tax breaks incentive compatibility at the margin.**
Mean per-round wealth change: plain WSWM: lazy −0.00017, adversary −0.00017;
alpha=0.03: lazy −0.00002, adversary −0.00013; alpha=0.1: lazy **+0.00001**.
The redistribution subsidises uninformative free-riders to near break-even
(positive at alpha=0.1) — the tax that buys adaptivity also pays lazy modules
for existing. The truthfulness/sybil tests cover plain WSWM only; the
fixed-share variant preserves budget balance but not the "uninformed lose
money" property.

## Limitations / open questions

- Synthetic Gaussian-noise experts and an oracle-revealed outcome; no real
  model ensembles. Outcomes must be observable — in a decentralised setting
  they could come from the peer-prediction/market layer in
  [`../decentralized-verification-markets`](../decentralized-verification-markets).
- Sybil-proofness holds only for splitting *identical* reports with the same
  total wealth; fixed-share breaks it (equal redistribution rewards
  identity-splitting), which should be tested formally.
- Open: a tax redistributed by trailing *positive* score (or a wealth-
  proportional floor) might keep lock-in protection without subsidising lazy
  modules; and whether wager-fraction can be chosen by participants without
  losing the regret guarantee (Kelly/wealth-dynamics analysis, cf. Frongillo
  et al. on Kelly bettors as mirror descent).
- No regret bound proved; results are empirical, 10 seeds.

## Citations

Lambert, Langford, Wortman, Vaughan, Chen, Pennock, Waggoner, Frongillo
(2008), *Self-financed wagering mechanisms for forecasting*, EC; Herbster &
Warmuth (1998), *Tracking the best expert* (fixed share); Frongillo, Della
Penna & Reid (2012), *Interpreting prediction markets as stochastic mirror
descent*; Gensyn, *Verde* and *Prediction
Markets are Learning Algorithms*.
