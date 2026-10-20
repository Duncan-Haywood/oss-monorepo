"""Writes data/ruptures-crosscheck.json: seeded series plus the changepoints an
independent PELT (the `ruptures` package, BSD-2) returns for them.

engine.test.mjs replays the fixture through this venture's own pelt(), so the
test needs no Python. Regenerate with:

    python3 -m venv v && v/bin/pip install ruptures numpy
    v/bin/python data/make_ruptures_fixture.py

ruptures cost models: CostL2 (sum of squares, our `mean` model at sigma = 1)
and CostNormal (Gaussian mean and variance, our `meanvar` model). Penalties
are passed as plain numbers so both sides price a change identically.
"""
import json
import math
import sys

import numpy as np
import ruptures as rpt


def make_series(rng, n, kind):
    k = int(rng.integers(0, 4))
    cuts = sorted(rng.choice(np.arange(15, n - 15), size=k, replace=False).tolist())
    edges = [0] + cuts + [n]
    out = []
    for a, b in zip(edges[:-1], edges[1:]):
        mu = float(rng.normal(0, 3 if kind == "mean" else 1))
        sd = 1.0 if kind == "mean" else float(rng.choice([0.5, 1.0, 2.5]))
        out.extend(rng.normal(mu, sd, b - a).tolist())
    return [round(v, 6) for v in out]


def main():
    rng = np.random.default_rng(20261020)
    cases = []
    for kind, min_size, pen_fns in [
        ("mean", 2, [lambda n: 2 * math.log(n), lambda n: 10.0, lambda n: 25.0]),
        ("meanvar", 5, [lambda n: 3 * math.log(n), lambda n: 15.0]),
    ]:
        for _ in range(20):
            n = int(rng.integers(60, 200))
            x = make_series(rng, n, kind)
            sig = np.array(x).reshape(-1, 1)
            for pf in pen_fns:
                pen = round(pf(n), 6)
                model = "l2" if kind == "mean" else "normal"
                algo = rpt.Pelt(model=model, min_size=min_size, jump=1).fit(sig)
                bkps = algo.predict(pen=pen)[:-1]
                cases.append({"model": kind, "minSegment": min_size, "penalty": pen,
                              "values": x, "changepoints": bkps})
    json.dump({"reference": f"ruptures {rpt.__version__} Pelt", "cases": cases},
              open("data/ruptures-crosscheck.json", "w"), separators=(",", ":"))
    print(len(cases), "cases; with changes:", sum(1 for c in cases if c["changepoints"]))


main()
