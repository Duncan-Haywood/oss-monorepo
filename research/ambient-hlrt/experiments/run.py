"""Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt  (also writes experiments/hlrt.png)"""
import sys
from multiprocessing import Pool
import numpy as np
from ambient_hlrt.est import PRIOR, confusion, draw3_hard, lrt_stat, bootstrap_p, NESTED_GRID

AUD, LA = 0.8, 0.7
C = confusion(LA)
STARTS = NESTED_GRID[:2]           # the 2-start grid: ambient-startcount found 2-4 starts enough when h > 0
CHI = {"chi2(1) 3.84": 3.841, "chi2(2) 5.99": 5.991}
NULL_DRAWS, DRAWS, B = 300, 60, 39
CELLS = [(0.0, 0.5), (0.1, 0.5), (0.3, 0.5), (0.3, 1 / 3)]   # (h, hard accuracy); h = 0 is the null


def one(args):
    h, ha, n, seed, boot = args
    rng = np.random.default_rng(seed)
    c = draw3_hard(C, AUD, h, ha, PRIOR, n, rng)
    if boot:
        p, T = bootstrap_p(c, STARTS, B, rng)
        return T, p
    return lrt_stat(c, STARTS)[0], None


if __name__ == "__main__":
    print(f"Label accuracy {LA}, three auditors of overall accuracy {AUD}. Statistic T = 2n(loglik of best of {len(STARTS)} hardness-aware starts - loglik of the h = 0 model), clipped at 0.")
    print(f"Part A: null distribution of T over {NULL_DRAWS} draws. Part B: {DRAWS} draws per cell, parametric bootstrap with B = {B} (p = (1 + #T* >= T)/(B + 1), reject if p <= 0.05).\n")
    out = {}
    with Pool() as pool:
        print("== Part A: T under h = 0")
        for n in (200, 1000):
            T = np.array([t for t, _ in pool.map(one, [(0.0, 0.5, n, 10**6 + 7 * i + n, False) for i in range(NULL_DRAWS)])])
            q = np.quantile(T, [0.5, 0.9, 0.95, 0.99])
            out[("A", n)] = T
            print(f"  n={n:5d}: median {q[0]:.2f}, 90% {q[1]:.2f}, 95% {q[2]:.2f}, 99% {q[3]:.2f}, share T=0 {np.mean(T == 0):.2f}; "
                  + "; ".join(f"reject at {k}: {np.mean(T > v):.3f}" for k, v in CHI.items()))
        print("\n== Part B: rejection rates at nominal 0.05")
        print("  cell (h, hard acc), n | bootstrap reject | chi2(1) reject | chi2(2) reject | median T")
        for h, ha in CELLS:
            for n in (200, 1000):
                r = pool.map(one, [(h, ha, n, 2 * 10**6 + int(1e4 * h) + int(100 * ha) * 31 + 7 * i + n, True) for i in range(DRAWS)])
                T = np.array([t for t, _ in r]); p = np.array([q for _, q in r])
                out[("B", h, ha, n)] = (T, p)
                print(f"  h={h:.1f} hard={ha:.2f} n={n:5d} | {np.mean(p <= 0.05):.3f} | {np.mean(T > 3.841):.3f} | {np.mean(T > 5.991):.3f} | {np.median(T):.2f}", flush=True)
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, axs = plt.subplots(1, 2, figsize=(9, 3.4))
    for n, col in ((200, "C0"), (1000, "C1")):
        T = np.sort(out[("A", n)])
        axs[0].plot(T, np.arange(1, len(T) + 1) / len(T), color=col, label=f"null, n={n}")
    axs[0].axvline(3.841, color="k", ls=":", lw=1); axs[0].axvline(5.991, color="k", ls="--", lw=1)
    axs[0].set_xlim(0, 20); axs[0].set_xlabel("T = 2n x loglik gain"); axs[0].set_ylabel("cumulative share"); axs[0].legend(fontsize=7)
    for n, col in ((200, "C0"), (1000, "C1")):
        axs[1].plot([c[0] for c in CELLS], [np.mean(out[("B", h, ha, n)][1] <= 0.05) for h, ha in CELLS], "o-", color=col, label=f"bootstrap, n={n}")
        axs[1].plot([c[0] for c in CELLS], [np.mean(out[("B", h, ha, n)][0] > 3.841) for h, ha in CELLS], "x--", color=col, label=f"chi2(1) 3.84, n={n}")
    axs[1].axhline(0.05, color="k", ls=":", lw=1); axs[1].set_xlabel("true h (cells: 0, 0.1/0.5, 0.3/0.5, 0.3/0.33)"); axs[1].set_ylabel("rejection rate"); axs[1].legend(fontsize=6)
    fig.suptitle("Stylised model: LRT of h = 0 for hardness-aware DS (3 auditors)", fontsize=9)
    fig.tight_layout(); fig.savefig("experiments/hlrt.png", dpi=110)
