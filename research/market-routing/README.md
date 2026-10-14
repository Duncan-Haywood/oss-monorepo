# Markets as routers: LMSR = Hedge, quadratic potential = sparsemax

Small, dependency-free (stdlib only) research code linking

- **algorithmic economics** — cost-function prediction markets and their
  equivalence to no-regret learning (Chen & Vaughan 2010; Abernethy, Chen &
  Vaughan 2013; Frongillo, Della Penna & Reid 2012; Gensyn's
  ["Prediction Markets are Learning Algorithms"](https://www.gensyn.ai/research/prediction-markets-are-learning-algorithms)), and
- **modular / continual-learning architectures** — routing over expert
  modules, where sparse routing means fewer modules to compute (and, for
  decentralised inference, fewer devices to pay and to verify).

A market with potential `C(q) = max_p <p,q> - b R(p)` prices outcomes by
`grad C(q)`, the FTRL iterate with cumulative gains `q`. Choosing `R`:

| regulariser R | market | router | prices |
|---|---|---|---|
| negative entropy | LMSR (Hanson) | Hedge / softmax | always dense |
| `1/2 ||p||^2` | quadratic-potential market | sparsemax (Euclidean simplex projection) | exact zeros |

`paper/whitepaper.md` states the results, `src/market_routing/` implements
them, and `tests/` checks each claim numerically (10+ tests, ~1s).

```bash
cd research/market-routing
PYTHONPATH=src python3 -m unittest discover -s tests -v
PYTHONPATH=src python3 experiments/switching.py     # ~6s
```

## Verified claims (`tests/test_markets.py`)

1. LMSR prices equal multiplicative-weights (Hedge) weights to 1e-10 along
   arbitrary trade sequences.
2. Prices are the gradient of the cost function (finite differences), and a
   trade pays at least `<price, bundle>` (convexity), for both markets.
3. The maker's realised loss never exceeds `b * (max R - min R)`
   (`b ln n` for LMSR, `b (1-1/n)/2` for the quadratic market).
4. Regret against the best fixed expert respects the FTRL bounds
   (`b ln n + T/(8b)` for Hedge; `b(1-1/n)/2 + Tn/(2b)` for L2, a loose
   bound using `||g||^2 <= n`).
5. Quadratic-market prices contain exact zeros; LMSR prices never do.
6. Forgetting (`q <- decay * q`) lets both routers recover after the best
   expert changes; the static routers do not.

## Experiment: switching best expert (`experiments/switching.py`)

16 experts, 3000 rounds, Bernoulli gains (best 0.65, others 0.5), best expert
switches every 500 rounds, 6 seeds, forgetting decay 0.99. Regret is against
the switching comparator; "active" = experts with weight > 1e-3.

| b | LMSR regret | LMSR active | sparsemax regret | sparsemax active |
|---|---|---|---|---|
| 0.25 | 74.8 | 1.2 | 74.2 | 1.0 |
| 1 | 84.4 | 2.6 | 75.0 | 1.1 |
| 2 | 116.8 | 8.5 | 78.1 | 1.2 |
| 4 | 228.1 | 15.9 | 86.5 | 1.4 |
| 8 | 357.8 | 16.0 | 113.7 | 2.1 |

Without forgetting both routers stay near 373 (b=1): they never switch.

**Reading it.** (i) Forgetting is what matters for switching: ~5x lower
regret than any static router. (ii) At small `b` both routers are near
argmax and indistinguishable. (iii) As `b` grows, the sparsemax market
degrades much more slowly and keeps 1-2 active modules where LMSR spreads
over all 16. Plausible mechanism (untested): decay bounds `q`, so softmax
of a bounded score vector stays diffuse at large `b`, whereas the
projection thresholds low scores to exactly zero.

## Limitations

- One synthetic environment, 6 seeds, no confidence intervals; the sparsity
  finding is a hypothesis to test on real mixture-of-experts gating, not a
  result about neural networks.
- Forgetting is a hand-set constant; a fixed-share / adaptive-restart
  variant and a matching switching-regret bound for decayed markets are not
  proved here.
- The L2 regret bound is loose. No claim is made about security of a
  routing market against strategic traders.
