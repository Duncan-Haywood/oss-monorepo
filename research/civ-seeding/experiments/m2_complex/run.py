"""Milestone 2: information vs reinforcement vs fractional-threshold contagion, fitted to the
43 BCDJ villages and compared leaving one village out. Plan in LOG.md (2026-11-14).

python3 experiments/m2_complex/run.py   (writes results.txt and dgrid.npz)
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

S = 75
SEEDS = (0, 1)              # 0 fits, 1 scores held-out villages
B_PAIRED = 2000
B_PARAM = 1000
QN = [0.0, 0.025, 0.05, 0.075, 0.10, 0.15, 0.20]
QP = [round(0.1 * k, 1) for k in range(1, 11)]
GAMMA = [-1.0, -0.5, 0.0, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0]
THETA = [0.2, 0.3, 0.4, 0.5, 0.6, 0.75, 1.0]
SETS = {"bcdj5": slice(0, 5), "ext8": slice(0, 8)}

# grid points: (family, qN, qP, gamma, theta)
POINTS = ([("R", a, b, g, None) for a, b, g in itertools.product(QN, QP, GAMMA)]
          + [("T", a, b, 0.0, t) for a, b, t in itertools.product(QN, QP, THETA)])
FAM = {"I": [i for i, p in enumerate(POINTS) if p[0] == "R" and p[3] == 0.0],
       "R": [i for i, p in enumerate(POINTS) if p[0] == "R"],
       # T includes theta = off, i.e. the information model's points
       "T": [i for i, p in enumerate(POINTS) if p[0] == "T" or (p[0] == "R" and p[3] == 0.0)]}

_V = _BETA = None


def _init():
    global _V, _BETA
    _V = bcdj.load()
    _BETA = bcdj.leader_logit(_V)[0]


def _job(args):
    k, seed = args
    _f, a, b, g, t = POINTS[k]
    return k, seed, cx.divergence(_V, _BETA, a, b, S, seed, gamma=g, theta=t)


def label(k):
    f, a, b, g, t = POINTS[k]
    s = f"qN={a:.3f} qP={b:.1f}"
    if f == "R":
        s += f" gamma={g:+.2f}"
    else:
        s += f" theta={t:.2f}"
    return s


def bb_share(d, rng, B):
    """Share of Bayesian-bootstrap draws (exponential village weights) with weighted mean of
    d below 0, and the 95% interval of the weighted mean."""
    W = rng.exponential(1.0, (B, len(d)))
    m = (W * d).sum(1) / W.sum(1)
    return (m < 0).mean(), np.percentile(m, [2.5, 97.5])


def main():
    t0 = time.time()
    V = bcdj.load()
    beta = bcdj.leader_logit(V)[0]
    G = len(V)
    out = []
    p = out.append
    p("# Milestone 2: information (I), reinforcement (R), fractional threshold (T)")
    p(f"grid: {len(POINTS)} points ({len(FAM['R'])} R incl. {len(FAM['I'])} with gamma = 0, "
      f"{len(POINTS) - len(FAM['R'])} T), S = {S}, seeds {SEEDS}")

    # descriptive: empirical non-leader take-up by number of adopting neighbours
    a = np.zeros(5)
    h = np.zeros(5)
    for v in V:
        ai, hi = cx.takeup_by_k(v, v.takeup.astype(float)[:, None])
        a += ai
        h += hi
    p("empirical non-leader take-up by adopting neighbours 0,1,2,3,4+: "
      + " ".join(f"{x:.3f}(n={int(c)})" for x, c in zip(a / h, h)))

    D = {s: np.zeros((len(POINTS), G, 8)) for s in SEEDS}
    with ProcessPoolExecutor(4, initializer=_init) as ex:
        for k, seed, d in ex.map(_job, [(k, s) for s in SEEDS for k in range(len(POINTS))],
                                 chunksize=4):
            D[seed][k] = d
    np.savez_compressed(os.path.join(HERE, "dgrid.npz"), seed0=D[0], seed1=D[1])
    p(f"grid simulated in {time.time() - t0:.0f} s")

    fits = {}
    for sname, cols in SETS.items():
        p(f"\n## moment set {sname}")
        for fam, idx in FAM.items():
            i, Q = cx.fit(D[0][idx], cols=cols)
            k = idx[i]
            fits[(sname, fam)] = k
            q1 = cx.fit(D[1][idx], cols=cols)[1][i]
            p(f"in-sample {fam}: {label(k)}  Q = {Q[i]:.3e} (seed 1 at same point {q1:.3e})")
        rng = np.random.default_rng(2014)
        loss = {}
        for fam, idx in FAM.items():
            l, ch = cx.loo_losses(D[0][idx], D[1][idx], cols)
            loss[fam] = l
            picks = np.unique(np.array(idx)[ch], return_counts=True)
            top = picks[0][np.argmax(picks[1])]
            p(f"LOO {fam}: mean held-out loss {l.mean():.4e} (median {np.median(l):.4e}); "
              f"most common fit {label(top)} ({picks[1].max()}/{G})")
        for fam in ("R", "T"):
            d = loss[fam] - loss["I"]
            share, ci = bb_share(d, rng, B_PAIRED)
            wins = int((d < 0).sum())
            p(f"H3{'' if fam == 'R' else 'b'} {fam} vs I: {fam} lower in {share:.3f} of {B_PAIRED} "
              f"paired draws; mean diff {d.mean():+.3e} [{ci[0]:+.3e}, {ci[1]:+.3e}]; "
              f"{fam} better in {wins}/{G} villages")

    # H3c: bootstrap of gamma-hat and theta-hat in sample (extended moments)
    rng = np.random.default_rng(2015)
    gam, th = [], []
    for _ in range(B_PARAM):
        w = rng.exponential(1.0, G)
        i, _q = cx.fit(D[0][FAM["R"]], w, SETS["ext8"])
        gam.append(POINTS[FAM["R"][i]][3])
        j, _q = cx.fit(D[0][FAM["T"]], w, SETS["ext8"])
        t = POINTS[FAM["T"][j]][4]
        th.append(np.inf if t is None else t)
    gam = np.array(gam)
    th = np.array(th)
    lo, hi = np.percentile(gam, [2.5, 97.5])
    p(f"\nH3c gamma-hat bootstrap (ext8, B = {B_PARAM}): mean {gam.mean():+.3f}, 95% [{lo:+.2f}, {hi:+.2f}], "
      f"share > 0 {(gam > 0).mean():.3f}, share = 0 {(gam == 0).mean():.3f}, share < 0 {(gam < 0).mean():.3f}")
    vals, cnt = np.unique(th, return_counts=True)
    p("theta-hat bootstrap (ext8): " + ", ".join(
        f"{'off' if np.isinf(x) else f'{x:.2f}'}: {c / B_PARAM:.3f}" for x, c in zip(vals, cnt)))

    # criterion profile in gamma (min over qN, qP), for the figure
    for sname, cols in SETS.items():
        _i, Q = cx.fit(D[0][FAM["R"]], cols=cols)
        prof = []
        for g in GAMMA:
            prof.append(min(Q[n] for n, k in enumerate(FAM["R"]) if POINTS[k][3] == g))
        p(f"profile {sname} gamma: " + " ".join(f"{g:+.2f}:{q:.3e}" for g, q in zip(GAMMA, prof)))
        _i, Q = cx.fit(D[0][FAM["T"]], cols=cols)
        prof = []
        for t in THETA + [None]:
            prof.append(min(Q[n] for n, k in enumerate(FAM["T"])
                            if (POINTS[k][4] == t and POINTS[k][0] == "T") or (t is None and POINTS[k][0] == "R")))
        p(f"profile {sname} theta: " + " ".join(
            f"{'off' if t is None else f'{t:.2f}'}:{q:.3e}" for t, q in zip(THETA + [None], prof)))

    # take-up by adopting neighbours, simulated at each family's ext8 fit
    p("")
    for fam in FAM:
        _f, qn, qp, g, t = POINTS[fits[("ext8", fam)]]
        a = np.zeros(5)
        h = np.zeros(5)
        tot = []
        for v in V:
            Y = cx.simulate(v, beta, qn, qp, 200, np.random.default_rng([7, v.village]), g, t)
            ai, hi = cx.takeup_by_k(v, Y)
            a += ai
            h += hi
            tot.append(Y[~v.leader].mean())
        p(f"simulated at {fam} ext8 fit ({label(fits[('ext8', fam)])}): non-leader take-up {np.mean(tot):.3f}; "
          "by adopting neighbours 0..4+: " + " ".join(f"{x:.3f}" for x in a / h))
    p(f"runtime {time.time() - t0:.0f} s")
    txt = "\n".join(out) + "\n"
    open(os.path.join(HERE, "results.txt"), "w").write(txt)
    print(txt)


if __name__ == "__main__":
    main()
