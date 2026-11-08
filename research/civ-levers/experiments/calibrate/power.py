"""Could this design see a bounded confidence tolerance if there were one? (reads crosstabs.json, writes power.txt)

For each item the wave-1 distribution, the bin sample sizes and the bin standard errors are the real ones.
The bin means are replaced by the mean-field map with a true eps and the item's fitted kappa, plus Gaussian
noise of each bin's standard error (sampling error only: measurement error would make it harder).
Detection: the finite-eps gain in SSE over eps = unbounded exceeds the 95th percentile of the same gain
when eps is unbounded (a size-5% test). Needs numpy only.
"""
import json
import numpy as np
from fit import EPS, gfun, fit_one, summarise

R, SEED = 300, 8
TRUE = [0.2, 0.3, 0.4, 0.5, 0.7]
ITEMS = ["polviews|2018-2020", "partyid|2018-2020", "eqwlth|2018-2020", "helppoor|2018-2020",
         "meovrwrk|2018-2020", "marblk|2018-2020", "fepresch|2018-2020"]


def main():
    data = json.load(open("crosstabs.json")); rng = np.random.default_rng(SEED)
    lines = [f"power of the panel design to detect a finite eps (size 5%), {R} replicates, seed {SEED}",
             "item n | true eps: " + " ".join(f"{e:.1f}" for e in TRUE) + " | null 95th pct of gain"]
    tot = np.zeros(len(TRUE)); cnt = 0
    for key in ITEMS:
        v = data[key]; k = len(v["levels"]); x = np.arange(k) / (k - 1); tab = np.array(v["table"], float)
        ni, keep, _, yb, var = summarise(tab, x)
        p = tab.sum(1) / tab.sum(); xs, ps, ws = x[keep], p[keep] / p[keep].sum(), ni[keep]
        se = np.sqrt(var / np.maximum(ni, 1))[keep]
        sse, kap = fit_one(xs, ps, yb[keep], ws); kinf = abs(kap[-1]) or 0.4
        def gain(mean):
            s, _ = fit_one(xs, ps, mean + rng.normal(0, 1, len(xs)) * se, ws)
            return s[-1] - s.min()
        null = np.array([gain(xs + kinf * gfun(xs, ps, 1.0)) for _ in range(R)])
        thr = np.percentile(null, 95)
        row = []
        for e in TRUE:
            mean = xs + kinf * gfun(xs, ps, e)
            row.append(np.mean([gain(mean) > thr for _ in range(R)]))
        tot += row; cnt += 1
        lines.append(f"{key.split('|')[0]:9s} {v['n']:4d} | " + " ".join(f"{r:.2f}" for r in row) + f" | {thr:.4f}")
    lines.append(f"mean power | " + " ".join(f"{t/cnt:.2f}" for t in tot))
    open("power.txt", "w").write("\n".join(lines) + "\n"); print("\n".join(lines))


if __name__ == "__main__":
    main()
