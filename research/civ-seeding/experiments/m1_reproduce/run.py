"""Milestone 1: reproduce the Banerjee et al. (2013) information-model estimate.

python3 experiments/m1_reproduce/run.py   (about 6 minutes on 4 cores; writes results.txt)
"""
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from civ_seeding import bcdj  # noqa: E402

S = 75
B = 1000
SEEDS = (0, 1, 2)

_V = None
_BETA = None


def _init():
    global _V, _BETA
    _V = bcdj.load()
    _BETA = bcdj.leader_logit(_V)[0]


def _row(args):
    i, seed = args
    return i, seed, np.stack([bcdj.divergence(_V, _BETA, bcdj.QN_GRID[i], qp, S, seed)
                              for qp in bcdj.QP_GRID])


def takeup(V, beta, qN, qP, S=200, seed=7):
    """Mean over villages of simulated non-leader take-up and informed share."""
    t, inf = [], []
    for v in V:
        rng = np.random.default_rng([seed, v.village])
        Y, I = bcdj.simulate(v, beta, qN, qP, S, rng, return_informed=True)
        t.append(Y[~v.leader].mean())
        inf.append(I.mean())
    return float(np.mean(t)), float(np.mean(inf))


def main():
    t0 = time.time()
    V = bcdj.load()
    beta, se = bcdj.leader_logit(V)
    out = []
    p = out.append
    tk = np.array([v.takeup[~v.leader].mean() for v in V])
    tl = np.array([v.takeup[v.leader].mean() for v in V])
    p("# Milestone 1: reproduce Banerjee, Chandrasekhar, Duflo and Jackson (2013)")
    p(f"villages {len(V)}, households {sum(v.n for v in V)}, "
      f"ties {int(sum(v.A.sum() for v in V) / 2)}, leaders/village {np.mean([v.leader.sum() for v in V]):.1f}")
    p(f"H1 non-leader take-up mean {tk.mean():.4f} sd {tk.std(ddof=1):.4f} (paper 0.185, 0.084)")
    p(f"H1 leader take-up mean {tl.mean():.4f} sd {tl.std(ddof=1):.4f} (paper 0.248, 0.125)")
    p("leader logit beta (const, z1..z6): " + " ".join(f"{b:.3f}({s:.3f})" for b, s in zip(beta, se)))
    emp = np.mean([bcdj.moments(v, v.takeup.astype(float)) for v in V], 0)
    p("empirical moments (village means): " + " ".join(f"{m:.4f}" for m in emp))

    nq, npp = len(bcdj.QN_GRID), len(bcdj.QP_GRID)
    D = {s: np.zeros((nq, npp, len(V), 5)) for s in SEEDS}
    with ProcessPoolExecutor(4, initializer=_init) as ex:
        for i, seed, rows in ex.map(_row, [(i, s) for s in SEEDS for i in range(nq)]):
            D[seed][i] = rows
    np.savez_compressed(os.path.join(HERE, "dgrid.npz"), **{f"seed{s}": D[s] for s in SEEDS})

    for s in SEEDS:
        i, j, Q = bcdj.gmm_estimate(D[s])
        p(f"H2 seed {s}: qN = {bcdj.QN_GRID[i]:.3f}, qP = {bcdj.QP_GRID[j]:.3f}, Q = {Q[i, j]:.3e} "
          f"(paper 0.10, 0.50)")
        # restricted model q = qN = qP (the diagonal of the grid where values coincide)
        common = [(a, b) for a in range(nq) for b in range(npp)
                  if abs(bcdj.QN_GRID[a] - bcdj.QP_GRID[b]) < 1e-9]
        a, b = min(common, key=lambda ab: Q[ab])
        p(f"   restricted qN = qP: q = {bcdj.QN_GRID[a]:.3f}, Q = {Q[a, b]:.3e}")

    rng = np.random.default_rng(2013)
    est = []
    for _ in range(B):
        w = rng.exponential(1.0, len(V))
        i, j, _q = bcdj.gmm_estimate(D[0], w)
        est.append((bcdj.QN_GRID[i], bcdj.QP_GRID[j]))
    est = np.array(est)
    p(f"bootstrap (B = {B}, seed 0 grid): qN mean {est[:, 0].mean():.3f} sd {est[:, 0].std():.3f}; "
      f"qP mean {est[:, 1].mean():.3f} sd {est[:, 1].std():.3f}")
    p(f"H3 share of draws with qP > qN: {(est[:, 1] > est[:, 0]).mean():.3f}; "
      f"qP - qN mean {(est[:, 1] - est[:, 0]).mean():.3f} sd {(est[:, 1] - est[:, 0]).std():.3f}")
    for k, name in ((0, "qN"), (1, "qP")):
        lo, hi = np.percentile(est[:, k], [2.5, 97.5])
        p(f"   {name} 95% bootstrap interval [{lo:.3f}, {hi:.3f}]")

    i, j, _q = bcdj.gmm_estimate(D[0])
    qn, qp = bcdj.QN_GRID[i], bcdj.QP_GRID[j]
    base = takeup(V, beta, qn, qp)
    off = takeup(V, beta, 0.0, qp)
    pap = takeup(V, beta, 0.10, 0.50)
    pap0 = takeup(V, beta, 0.0, 0.50)
    p(f"H4 at our estimate ({qn:.3f}, {qp:.3f}): take-up {base[0]:.4f}, informed {base[1]:.3f}; "
      f"qN = 0: take-up {off[0]:.4f}, informed {off[1]:.3f}; drop {1 - off[0] / base[0]:.3f}")
    p(f"   at the paper's (0.10, 0.50): take-up {pap[0]:.4f}, informed {pap[1]:.3f}; "
      f"qN = 0: take-up {pap0[0]:.4f}, informed {pap0[1]:.3f}; drop {1 - pap0[0] / pap[0]:.3f} "
      f"(paper: 20.2% -> 13.7%, informed 81% -> 57%, drop 0.32)")
    # criterion profile around the minimum, for the README
    p("criterion Q / Q_min at the paper's point (0.10, 0.50): "
      f"{bcdj.gmm_estimate(D[0])[2][list(np.round(bcdj.QN_GRID, 3)).index(0.1), list(np.round(bcdj.QP_GRID, 3)).index(0.5)] / bcdj.gmm_estimate(D[0])[2].min():.2f}")
    p(f"runtime {time.time() - t0:.0f} s")
    txt = "\n".join(out) + "\n"
    open(os.path.join(HERE, "results.txt"), "w").write(txt)
    print(txt)


if __name__ == "__main__":
    main()
