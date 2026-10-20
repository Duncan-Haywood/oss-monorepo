"""Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt  (also writes experiments/level.png)
Size of the parametric-bootstrap LRT of h = 0 when the data have no hard messages (h = 0) but the three
auditors differ in accuracy (mean accuracy 0.8 in every configuration), against the fitted null that forces
one shared auditor matrix."""
from multiprocessing import Pool
import numpy as np
from ambient_hlrtmis.est import PRIOR, confusion, draw3_unequal, bootstrap_p, NESTED_GRID
from ambient_hlrtmis.stats import clopper_pearson

C = confusion(0.7)
STARTS = NESTED_GRID[:2]
CONFIGS = {"equal (0.8, 0.8, 0.8)": (0.8, 0.8, 0.8), "mild (0.9, 0.8, 0.7)": (0.9, 0.8, 0.7),
           "strong (0.95, 0.8, 0.65)": (0.95, 0.8, 0.65)}
NS, DRAWS, B = (200, 500), 100, 39


def one(args):
    accs, n, seed = args
    rng = np.random.default_rng(seed)
    return bootstrap_p(draw3_unequal(C, accs, PRIOR, n, rng), STARTS, B, rng)


if __name__ == "__main__":
    print(f"h = 0 data, unequal auditors, classifier accuracy 0.7. Bootstrap B = {B}, {len(STARTS)} starts, {DRAWS} draws per cell.")
    print("config | n | rej p<=0.05 | rate | exact 95% CI | rej p<=0.10 | rate | exact 95% CI | mean p")
    res = {}
    with Pool() as pool:
        for ci, (name, accs) in enumerate(CONFIGS.items()):
            for n in NS:
                p = np.array([q for q, _ in pool.map(one, [(accs, n, 7 * 10**6 + 1000 * ci + 13 * i + n) for i in range(DRAWS)])])
                res[(name, n)] = p
                row = [name, str(n)]
                for a in (0.05, 0.10):
                    k = int((p <= a).sum()); lo, hi = clopper_pearson(k, DRAWS)
                    row += [f"{k}/{DRAWS}", f"{k/DRAWS:.3f}", f"[{lo:.3f}, {hi:.3f}]"]
                row.append(f"{p.mean():.3f}")
                print(" | ".join(row), flush=True)
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, axs = plt.subplots(1, 2, figsize=(7.6, 3.6), sharey=True)
    g = np.linspace(0, 1, 101)
    for ax, n in zip(axs, NS):
        for name in CONFIGS:
            ax.plot(g, [(res[(name, n)] <= x).mean() for x in g], label=name.split(" ")[0])
        ax.plot([0, 1], [0, 1], "k:", lw=1)
        ax.set_title(f"n = {n}", fontsize=8); ax.set_xlabel("nominal level")
    axs[0].set_ylabel("share of h = 0 data sets with p <= level"); axs[0].legend(fontsize=7)
    fig.tight_layout(); fig.savefig("experiments/level.png", dpi=110)
