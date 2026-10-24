"""Writes data/poisson-crosscheck.json: seeded count series plus the changepoints
an independent PELT (the `ruptures` package, BSD-2) returns for them under a
Poisson cost computed with scipy (BSD-3), not with this venture's formula.

The cost of a segment is -2 * sum(scipy.stats.poisson.logpmf(x, mean(x))): the
full Poisson log-likelihood at the segment's maximum-likelihood rate, with the
log(x!) term left in. That term sums to the same total for every partition, so
it cannot move a changepoint; this venture drops it. engine.test.mjs replays
the fixture through its own pelt(), so the test needs no Python. Regenerate:

    python3 -m venv v && v/bin/pip install ruptures numpy scipy
    v/bin/python data/make_poisson_fixture.py
"""
import json
import math

import numpy as np
import ruptures as rpt
from ruptures.base import BaseCost
from scipy.stats import poisson


class PoissonCost(BaseCost):
    model = ""
    min_size = 1

    def fit(self, signal):
        self.signal = np.asarray(signal).reshape(-1)
        return self

    def error(self, start, end):
        seg = self.signal[start:end]
        rate = seg.mean()
        if rate == 0:
            return 0.0
        return float(-2.0 * poisson.logpmf(seg, rate).sum())


def make_series(rng, n):
    k = int(rng.integers(0, 4))
    cuts = sorted(rng.choice(np.arange(15, n - 15), size=k, replace=False).tolist())
    edges = [0] + cuts + [n]
    out = []
    for a, b in zip(edges[:-1], edges[1:]):
        lam = float(rng.choice([0.5, 2.0, 5.0, 12.0, 30.0]))
        out.extend(rng.poisson(lam, b - a).tolist())
    return [int(v) for v in out]


def main():
    rng = np.random.default_rng(20261020)
    cases = []
    for _ in range(30):
        n = int(rng.integers(60, 200))
        x = make_series(rng, n)
        sig = np.array(x, dtype=float).reshape(-1, 1)
        for pen in (round(2 * math.log(n), 6), 10.0, 25.0):
            algo = rpt.Pelt(custom_cost=PoissonCost(), min_size=2, jump=1).fit(sig)
            bkps = algo.predict(pen=pen)[:-1]
            cases.append({"minSegment": 2, "penalty": pen, "values": x, "changepoints": bkps})
    json.dump({"reference": f"ruptures {rpt.__version__} Pelt, scipy.stats.poisson cost", "cases": cases},
              open("data/poisson-crosscheck.json", "w"), separators=(",", ":"))
    print(len(cases), "cases; with changes:", sum(1 for c in cases if c["changepoints"]))


main()
