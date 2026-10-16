"""Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt  (also writes experiments/level.png)
Size of the parametric-bootstrap LRT of h = 0 under the null, with exact binomial intervals, for n in NS."""
from multiprocessing import Pool
import numpy as np
from ambient_hlrtlevel.est import PRIOR, confusion, draw3_hard, bootstrap_p, NESTED_GRID
from ambient_hlrtlevel.stats import clopper_pearson

AUD, LA = 0.8, 0.7
C = confusion(LA)
STARTS = NESTED_GRID[:2]
NS, DRAWS, B = (100, 200, 500), 200, 39


def one(args):
    n, seed = args
    rng = np.random.default_rng(seed)
    c = draw3_hard(C, AUD, 0.0, 0.5, PRIOR, n, rng)
    return bootstrap_p(c, STARTS, B, rng)


if __name__ == "__main__":
    print(f"Null data only (h = 0), label accuracy {LA}, auditors {AUD}. Bootstrap B = {B}, {len(STARTS)} starts, {DRAWS} draws per n.")
    print("n | rejections at p<=0.05 | rate | exact 95% CI | rejections at p<=0.10 | rate | exact 95% CI | mean p")
    res = {}
    with Pool() as pool:
        for n in NS:
            p = np.array([q for q, _ in pool.map(one, [(n, 5 * 10**6 + 13 * i + n) for i in range(DRAWS)])])
            res[n] = p
            row = [f"{n}"]
            for a in (0.05, 0.10):
                k = int((p <= a).sum()); lo, hi = clopper_pearson(k, DRAWS)
                row += [f"{k}/{DRAWS}", f"{k/DRAWS:.3f}", f"[{lo:.3f}, {hi:.3f}]"]
            row.append(f"{p.mean():.3f}")
            print(" | ".join(row), flush=True)
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(figsize=(4.6, 3.6))
    g = np.linspace(0, 1, 101)
    for n in NS:
        ax.plot(g, [(res[n] <= x).mean() for x in g], label=f"n={n}")
    ax.plot([0, 1], [0, 1], "k:", lw=1)
    ax.set_xlabel("nominal level"); ax.set_ylabel("share of null data sets with p <= level"); ax.legend(fontsize=7)
    ax.set_title("Bootstrap p-values under h = 0 (uniform = valid)", fontsize=8)
    fig.tight_layout(); fig.savefig("experiments/level.png", dpi=110)
