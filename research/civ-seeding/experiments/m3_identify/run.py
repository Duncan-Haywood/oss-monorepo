"""Milestone 3: identification by simulation. Synthetic villages on the real networks from each
fitted model (I, T, R-delta), refit all three families, confusion matrices for an in-sample and
a leave-one-village-out selection rule, and the Jacobian of the moment map at the R-delta fit.
Plan in LOG.md (2026-11-14, milestone 3).

python3 experiments/m3_identify/run.py   (about 3 minutes on 4 cores; writes results.txt)

Moments 2 and 3 classify households by the data's leader take-up, so they change with each
synthetic dataset. They are linear in simulated adoption, so the per-household mean adoption at
each grid point (pbar) gives them exactly for any classification; every grid point is simulated
once and reused for all datasets.
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
R_DATA = 200                # synthetic datasets per process
QN = [0.025, 0.05, 0.075, 0.10, 0.15]
QP = [round(0.1 * k, 1) for k in range(1, 11)]
THETA = [0.4, 0.5, 0.6, 0.75]
GAMMA = [0.05, 0.10, 0.15, 0.20]
DELTA = [0.0, -0.25, -0.5]
# grid points: (family, qN, qP, gamma, delta, theta)
POINTS = ([("I", a, b, 0.0, 0.0, None) for a, b in itertools.product(QN, QP)]
          + [("T", a, b, 0.0, 0.0, t) for a, b, t in itertools.product(QN, QP, THETA)]
          + [("R", a, b, g, d, None) for a, b, g, d in itertools.product(QN, QP, GAMMA, DELTA)])
FAMS = ("I", "T", "R")
FIDX = {f: np.array([i for i, p in enumerate(POINTS) if p[0] == f]) for f in FAMS}
# data-generating processes: the milestone-2 fits on the extended moments
DGP = {"I": dict(qN=0.05, qP=0.3, gamma=0.0, delta=0.0, theta=None),
       "T": dict(qN=0.075, qP=0.1, gamma=0.0, delta=0.0, theta=0.60),
       "R": dict(qN=0.10, qP=0.1, gamma=0.10, delta=-0.25, theta=None)}
SETS = {"bcdj5": slice(0, 5), "ext8": slice(0, 8)}

_V = _BETA = None


def _init():
    global _V, _BETA
    _V = bcdj.load()
    _BETA = bcdj.leader_logit(_V)[0]


def _job(args):
    k, seed = args
    _f, a, b, g, d, t = POINTS[k]
    M = np.zeros((len(_V), 8))
    pbar = []
    for j, v in enumerate(_V):
        rng = np.random.default_rng([seed, v.village])
        Y = cx.simulate(_V[j], _BETA, a, b, S, rng, gamma=g, theta=t, delta=d)
        M[j] = cx.moments_ext(v, Y).mean(0)
        pbar.append(Y.mean(1))
    return k, seed, M, np.concatenate(pbar)


def leader_masks(v, Y):
    """Moments 2 and 3 masks (households next to adopting leaders only / non-adopting leaders
    only), as in bcdj.Village.prepare, for each column of Y (n x R). Returns two n x R bools."""
    L = v.leader[:, None]
    tl = L & (Y > 0.5)
    nl = L & (Y < 0.5)
    near_t = ((v.A @ tl) > 0) & ~tl
    near_n = ((v.A @ nl) > 0) & ~nl
    return near_t & ~near_n, near_n & ~near_t


def masked_mean(X, mask):
    """X: (P, n) or (n, R)-compatible; mean of rows of X over mask columns, 0 if empty."""
    cnt = mask.sum(0)
    return (X @ mask) / np.maximum(cnt, 1), cnt


def divergences(V, Msim, Pbar, Ydata):
    """Yields, for each dataset r, {seed: D (P, G, 8)}: simulated minus data moments."""
    G = len(V)
    R = Ydata[0].shape[1]
    dm, val = [], {s: [] for s in SEEDS}
    for g, v in enumerate(V):
        Y = Ydata[g]
        d = cx.moments_ext(v, Y)                         # R x 8, cols 1, 2 with real masks
        masks = leader_masks(v, Y)
        for c, mask in zip((1, 2), masks):
            d[:, c] = (Y * mask).sum(0) / np.maximum(mask.sum(0), 1)
        dm.append(d)
        for s in SEEDS:
            val[s].append(np.stack([masked_mean(Pbar[s][g], m)[0] for m in masks], -1))  # P x R x 2
    for r in range(R):
        out = {}
        for s in SEEDS:
            D = Msim[s].copy()
            for g in range(G):
                D[:, g, 1:3] = val[s][g][:, r, :]
                D[:, g, :] -= dm[g][r]
            out[s] = D
        yield out


def select(D0, D1, cols):
    """In-sample and leave-one-out family choice for one dataset. D0, D1: (P, G, 8).
    Returns dict with in-sample Q per family, LOO mean loss per family, per-village LOO losses."""
    G = D0.shape[1]
    Dc0 = D0[:, :, cols]
    Q = (Dc0.mean(1) ** 2).sum(-1)                              # P
    tot = Dc0.sum(1)                                            # P x m
    Qloo = ((((tot[:, None, :] - Dc0) / (G - 1)) ** 2).sum(-1))  # P x G
    ev = (D1[:, :, cols] ** 2).sum(-1)                          # P x G
    res = {"Q": {}, "loo": {}, "vill": {}, "arg": {}}
    for f in FAMS:
        idx = FIDX[f]
        res["Q"][f] = Q[idx].min()
        res["arg"][f] = idx[np.argmin(Q[idx])]
        ch = idx[np.argmin(Qloo[idx], 0)]                       # G
        vl = ev[ch, np.arange(G)]
        res["loo"][f] = vl.mean()
        res["vill"][f] = vl
    return res


def jacobian(V, beta, S_j=1000):
    th = np.array([0.10, 0.1, 0.10, -0.25])     # qN, qP, gamma, delta at the R-delta fit
    h = np.array([0.01, 0.02, 0.02, 0.05])
    rngs = np.array([0.125, 0.9, 0.15, 0.5])    # grid ranges, for scaling

    def m(x):
        return np.mean([cx.moments_ext(v, cx.simulate(v, beta, x[0], x[1], S_j,
                        np.random.default_rng([99, v.village]), gamma=x[2], delta=x[3])).mean(0)
                        for v in V], 0)
    J = np.zeros((8, 4))
    for i in range(4):
        e = np.zeros(4)
        e[i] = h[i]
        J[:, i] = (m(th + e) - m(th - e)) / (2 * h[i])
    return J, J * rngs


def label(k):
    f, a, b, g, d, t = POINTS[k]
    s = f"{f} qN={a:.3f} qP={b:.1f}"
    if f == "T":
        s += f" theta={t:.2f}"
    if f == "R":
        s += f" gamma={g:.2f} delta={d:+.2f}"
    return s


def main():
    t0 = time.time()
    V = bcdj.load()
    beta = bcdj.leader_logit(V)[0]
    G = len(V)
    out = []
    p = out.append
    p("# Milestone 3: identification by simulation")
    p(f"grid: {len(POINTS)} points ({', '.join(f'{f} {len(FIDX[f])}' for f in FAMS)}), S = {S}, "
      f"seeds {SEEDS}; {R_DATA} synthetic datasets per process; beta held at the real-data logit")
    sizes = [v.n for v in V]
    offs = np.r_[0, np.cumsum(sizes)]
    Msim = {s: np.zeros((len(POINTS), G, 8)) for s in SEEDS}
    pb = {s: np.zeros((len(POINTS), offs[-1])) for s in SEEDS}
    with ProcessPoolExecutor(4, initializer=_init) as ex:
        for k, seed, M, pbar in ex.map(_job, [(k, s) for s in SEEDS for k in range(len(POINTS))],
                                       chunksize=4):
            Msim[seed][k] = M
            pb[seed][k] = pbar
    Pbar = {s: [pb[s][:, offs[g]:offs[g + 1]] for g in range(G)] for s in SEEDS}
    p(f"grid simulated in {time.time() - t0:.0f} s")

    datasets = {}
    for di, (name, par) in enumerate(DGP.items()):
        datasets[name] = [cx.simulate(v, beta, par["qN"], par["qP"], R_DATA,
                                      np.random.default_rng([1000 + di, v.village]),
                                      gamma=par["gamma"], theta=par["theta"], delta=par["delta"])
                          for v in V]
    datasets["real"] = [v.takeup.astype(float)[:, None] for v in V]

    sel = {}
    for name, Yd in datasets.items():
        sel[name] = {sn: [] for sn in SETS}
        for D in divergences(V, Msim, Pbar, Yd):
            for sn, cols in SETS.items():
                sel[name][sn].append(select(D[0], D[1], cols))
    p(f"selection done in {time.time() - t0:.0f} s")

    p("\n## real data, this grid")
    for sn in SETS:
        r = sel["real"][sn][0]
        p(f"{sn}: in-sample " + "; ".join(f"{f} {label(r['arg'][f])} Q={r['Q'][f]:.3e}" for f in FAMS))
        p(f"{sn}: LOO mean loss " + ", ".join(f"{f} {r['loo'][f]:.4f}" for f in FAMS)
          + f"; R better than I in {int((r['vill']['R'] < r['vill']['I']).sum())}/{G} villages"
          + f", T better than I in {int((r['vill']['T'] < r['vill']['I']).sum())}/{G}")

    for rule in ("Q", "loo"):
        for sn in SETS:
            p(f"\n## confusion, rule {'in-sample' if rule == 'Q' else 'leave-one-village-out'}, "
              f"moments {sn} (rows: true process; columns: share choosing I, T, R)")
            for name in DGP:
                ch = [min(FAMS, key=lambda f: r[rule][f]) for r in sel[name][sn]]
                row = [np.mean([c == f for c in ch]) for f in FAMS]
                p(f"  {name}: " + "  ".join(f"{f} {x:.3f}" for f, x in zip(FAMS, row))
                  + f"   recovered {row[FAMS.index(name)]:.3f}")
            p("  pairwise recovery (true a scores lower than b):")
            for a in DGP:
                p("   " + "  ".join(
                    f"{a}>{b} {np.mean([r[rule][a] < r[rule][b] for r in sel[a][sn]]):.3f}"
                    for b in FAMS if b != a))

    # H2: bcdj5 in-sample
    rec = {a: np.mean([min(FAMS, key=lambda f: r["Q"][f]) == a for r in sel[a]["bcdj5"]])
           for a in DGP}
    pair = [np.mean([r["Q"][a] < r["Q"][b] for r in sel[a]["bcdj5"]]) for a in DGP for b in FAMS if b != a]
    v2 = ("held" if min(rec.values()) < 0.70 else
          "refuted" if min(pair) >= 0.80 else "neither (inconclusive band)")
    p(f"\nH2 (bcdj5, in-sample): recovery {', '.join(f'{a} {x:.3f}' for a, x in rec.items())}; "
      f"min pairwise {min(pair):.3f} -> {v2}")
    rr = sel["R"]["ext8"]
    pref = np.mean([r["loo"]["R"] < r["loo"]["I"] for r in rr])
    wins = np.array([int((r["vill"]["R"] < r["vill"]["I"]).sum()) for r in rr])
    p(f"H2b (R process, LOO ext8): R preferred to I in {pref:.3f} of {len(rr)} datasets -> "
      f"{'held' if pref < 0.80 else 'refuted'}; R better in <= 13/43 held-out villages in "
      f"{(wins <= 13).mean():.3f} (median {np.median(wins):.0f}, 5-95% {np.percentile(wins, 5):.0f}-"
      f"{np.percentile(wins, 95):.0f})")
    for a in DGP:
        w = np.array([int((r["vill"]["R"] < r["vill"]["I"]).sum()) for r in sel[a]["ext8"]])
        p(f"  {a} process: R better than I in median {np.median(w):.0f}/43 held-out villages "
          f"(5-95% {np.percentile(w, 5):.0f}-{np.percentile(w, 95):.0f})")

    # post hoc (written after seeing the village counts above): are the real data typical of
    # any process? Real LOO mean losses and R-vs-I village wins against each process's spread.
    p("\n## post hoc: real data against each process's synthetic spread (LOO, ext8)")
    real = sel["real"]["ext8"][0]
    rw = int((real["vill"]["R"] < real["vill"]["I"]).sum())
    for a in DGP:
        rr = sel[a]["ext8"]
        line = []
        for f in FAMS:
            x = np.array([r["loo"][f] for r in rr])
            line.append(f"{f} loss real {real['loo'][f]:.4f} vs {np.percentile(x, 5):.4f}-"
                        f"{np.percentile(x, 95):.4f} (share above real {(x >= real['loo'][f]).mean():.3f})")
        w = np.array([int((r["vill"]["R"] < r["vill"]["I"]).sum()) for r in rr])
        p(f"  {a} process: " + "; ".join(line)
          + f"; R wins <= {rw} villages in {(w <= rw).mean():.3f}")

    # parameter recovery within the true family (in-sample, ext8)
    p("\n## parameter recovery within the true family (in-sample, ext8): share of datasets at each value")
    for a, par in DGP.items():
        ks = [r["arg"][a] for r in sel[a]["ext8"]]
        for pi, nm in ((1, "qN"), (2, "qP"), (3, "gamma"), (4, "delta"), (5, "theta")):
            vals = [POINTS[k][pi] for k in ks]
            if vals[0] is None or (a != "R" and nm in ("gamma", "delta")):
                continue
            u, c = np.unique(vals, return_counts=True)
            p(f"  {a} {nm} (true {par[nm] if nm in par else None}): "
              + ", ".join(f"{x:g}: {n / len(vals):.2f}" for x, n in zip(u, c)))

    J, Js = jacobian(V, beta)
    p("\n## Jacobian of village-mean ext8 moments at the R-delta fit (qN, qP, gamma, delta), S = 1000")
    for m in range(8):
        p(f"  m{m + 1}: " + " ".join(f"{x:+.4f}" for x in J[m]))
    for nm, M in (("raw", J), ("scaled to grid ranges", Js)):
        U, sv, Vt = np.linalg.svd(M, full_matrices=False)
        p(f"  {nm}: singular values " + " ".join(f"{x:.4g}" for x in sv)
          + f"; condition {sv[0] / sv[-1]:.1f}; weakest direction (qN, qP, gamma, delta) "
          + " ".join(f"{x:+.3f}" for x in Vt[-1]))
    for nm, cols in SETS.items():
        sv = np.linalg.svd(Js[cols], compute_uv=False)
        Vt = np.linalg.svd(Js[cols])[2]
        p(f"  scaled, {nm} only: singular values " + " ".join(f"{x:.4g}" for x in sv)
          + f"; condition {sv[0] / sv[-1]:.1f}; weakest " + " ".join(f"{x:+.3f}" for x in Vt[-1]))
    p(f"runtime {time.time() - t0:.0f} s")
    txt = "\n".join(out) + "\n"
    open(os.path.join(HERE, "results.txt"), "w").write(txt)
    print(txt)


if __name__ == "__main__":
    main()
