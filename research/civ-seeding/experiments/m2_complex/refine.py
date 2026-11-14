"""Milestone 2, post hoc (LOG.md, second 2026-11-14 entry): a fine reinforcement grid with a
free logit-intercept shift, and the take-up-by-adopting-neighbours gap. Writes refine.txt.

python3 experiments/m2_complex/refine.py   (about 5 minutes on 4 cores)
"""
import itertools
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from civ_seeding import bcdj, complex as cx  # noqa: E402
from run import bb_share  # noqa: E402

S = 75
SEEDS = (0, 1)
QN = [0.025, 0.05, 0.075, 0.10]
QP = [round(0.1 * k, 1) for k in range(1, 11)]
GAMMA = [-0.1, -0.05, 0.0, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4]
DELTA = [0.0, -0.25, -0.5, -0.75, -1.0, -1.5]
POINTS = list(itertools.product(QN, QP, GAMMA, DELTA))
FAM = {"I": [i for i, p in enumerate(POINTS) if p[2] == 0 and p[3] == 0],
       "Id": [i for i, p in enumerate(POINTS) if p[2] == 0],
       "Rd": list(range(len(POINTS)))}
EXT = slice(0, 8)
_V = _BETA = None


def _init():
    global _V, _BETA
    _V = bcdj.load()
    _BETA = bcdj.leader_logit(_V)[0]


def _job(args):
    k, seed = args
    a, b, g, d = POINTS[k]
    return k, seed, cx.divergence(_V, _BETA, a, b, S, seed, gamma=g, delta=d)


def label(k):
    a, b, g, d = POINTS[k]
    return f"qN={a:.3f} qP={b:.1f} gamma={g:+.2f} delta={d:+.2f}"


def main():
    t0 = time.time()
    V = bcdj.load()
    beta = bcdj.leader_logit(V)[0]
    G = len(V)
    out = []
    p = out.append
    p("# Milestone 2, post hoc: reinforcement with a free intercept (fine grid)")
    p(f"grid: {len(POINTS)} points, S = {S}, seeds {SEEDS}")
    D = {s: np.zeros((len(POINTS), G, 8)) for s in SEEDS}
    with ProcessPoolExecutor(4, initializer=_init) as ex:
        for k, seed, d in ex.map(_job, [(k, s) for s in SEEDS for k in range(len(POINTS))],
                                 chunksize=8):
            D[seed][k] = d
    p(f"grid simulated in {time.time() - t0:.0f} s")
    rng = np.random.default_rng(2016)
    for sname, cols in (("bcdj5", slice(0, 5)), ("ext8", EXT)):
        p(f"\n## moment set {sname}")
        loss = {}
        for fam, idx in FAM.items():
            i, Q = cx.fit(D[0][idx], cols=cols)
            l, _ch = cx.loo_losses(D[0][idx], D[1][idx], cols)
            loss[fam] = l
            p(f"{fam}: in-sample {label(idx[i])} Q = {Q[i]:.3e}; LOO mean loss {l.mean():.4e}")
        for a, b in (("Rd", "Id"), ("Rd", "I"), ("Id", "I")):
            d = loss[a] - loss[b]
            share, ci = bb_share(d, rng, 2000)
            p(f"{a} vs {b}: {a} lower in {share:.3f} of 2000 paired draws; mean diff {d.mean():+.3e} "
              f"[{ci[0]:+.3e}, {ci[1]:+.3e}]; {a} better in {int((d < 0).sum())}/{G} villages")
    gam = []
    for _ in range(1000):
        w = rng.exponential(1.0, G)
        i, _q = cx.fit(D[0][FAM["Rd"]], w, EXT)
        gam.append(POINTS[FAM["Rd"][i]][2])
    gam = np.array(gam)
    vals, cnt = np.unique(gam, return_counts=True)
    p("\ngamma-hat bootstrap (ext8, B = 1000): " + ", ".join(f"{x:+.2f}: {c / 1000:.3f}" for x, c in zip(vals, cnt)))
    _i, Q = cx.fit(D[0], cols=EXT)
    p("profile ext8 gamma (min over qN, qP, delta): " + " ".join(
        f"{g:+.2f}:{min(Q[k] for k, pt in enumerate(POINTS) if pt[2] == g):.3e}" for g in GAMMA))

    # take-up among non-leaders by adopting neighbours: data against the I fit, paired by village
    i, _q = cx.fit(D[0][FAM["I"]], cols=EXT)
    qn, qp, _g, _d = POINTS[FAM["I"][i]]
    ea = np.zeros((G, 5)); eh = np.zeros((G, 5)); sa = np.zeros((G, 5)); sh = np.zeros((G, 5))
    for g, v in enumerate(V):
        ea[g], eh[g] = cx.takeup_by_k(v, v.takeup.astype(float)[:, None])
        Y = cx.simulate(v, beta, qn, qp, 200, np.random.default_rng([7, v.village]))
        sa[g], sh[g] = cx.takeup_by_k(v, Y)
    W = rng.exponential(1.0, (2000, G))
    emp = (W @ ea) / (W @ eh)
    sim = (W @ sa) / (W @ sh)
    gap = emp - sim
    p(f"\ntake-up by adopting neighbours (non-leaders), data vs I fit ({label(FAM['I'][i])}), "
      "village bootstrap B = 2000:")
    for k in range(5):
        lo, hi = np.percentile(gap[:, k], [2.5, 97.5])
        p(f"  k={k if k < 4 else '4+'}: data {ea[:, k].sum() / eh[:, k].sum():.3f}, "
          f"I {sa[:, k].sum() / sh[:, k].sum():.3f}, gap 95% [{lo:+.3f}, {hi:+.3f}], "
          f"share gap > 0 {(gap[:, k] > 0).mean():.3f}")
    p(f"runtime {time.time() - t0:.0f} s")
    txt = "\n".join(out) + "\n"
    open(os.path.join(HERE, "refine.txt"), "w").write(txt)
    print(txt)


if __name__ == "__main__":
    main()
