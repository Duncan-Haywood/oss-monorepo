"""Milestone 3b: a village random effect on the base adoption rate. Every family of milestone 3
(I, T, R-delta) gains sigma, the SD of a per-village, per-run shift of every household's logit,
identified by a ninth moment (the squared non-leader take-up rate). Real-data fits, a village
bootstrap of sigma-hat, and synthetic datasets from the fitted random-effect processes for a
calibration check and a leave-one-village-out confusion matrix. Plan in LOG.md (2026-11-14,
milestone 3b).

/usr/bin/python3.13 experiments/m3b_hetero/run.py   (about 10 minutes on 4 cores; writes results.txt)

As in milestone 3, moments 2 and 3 classify households by the data's leader take-up and are
linear in simulated adoption, and the ninth moment's simulated value does not depend on the
data, so each grid point is simulated once and reused for every dataset (exact).
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
R_DATA = 200
B_BOOT = 1000
QN = [0.025, 0.05, 0.075, 0.10, 0.15]
QP = [round(0.1 * k, 1) for k in range(1, 11)]
THETA = [0.4, 0.5, 0.6, 0.75]
GAMMA = [0.05, 0.10, 0.15, 0.20]
DELTA = [0.0, -0.25, -0.5]
SIGMA = [0.0, 0.25, 0.5, 0.75, 1.0, 1.25]
if os.environ.get("SMOKE"):          # tiny grid for a quick check of the pipeline
    QN, QP, THETA, GAMMA, SIGMA, R_DATA, B_BOOT = [0.05, 0.1], [0.1, 0.3], [0.6], [0.1], [0.0, 0.5], 5, 20
# grid points: (family, qN, qP, gamma, delta, theta, sigma)
POINTS = ([("I", a, b, 0.0, d, None, s) for a, b, d, s in itertools.product(QN, QP, DELTA, SIGMA)]
          + [("T", a, b, 0.0, d, t, s)
             for a, b, t, d, s in itertools.product(QN, QP, THETA, DELTA, SIGMA)]
          + [("R", a, b, g, d, None, s)
             for a, b, g, d, s in itertools.product(QN, QP, GAMMA, DELTA, SIGMA)])
FAMS = ("I", "T", "R")
FIDX = {f: np.array([i for i, p in enumerate(POINTS) if p[0] == f]) for f in FAMS}
# milestone-3 grid inside this one: sigma = 0, and delta = 0 for I and T
M3IDX = {f: np.array([i for i in FIDX[f] if POINTS[i][6] == 0.0
                      and (f == "R" or POINTS[i][4] == 0.0)]) for f in FAMS}
FIT, SCORE = slice(0, 9), slice(0, 8)
M = 9

_V = _BETA = None


def _init():
    global _V, _BETA
    _V = bcdj.load()
    _BETA = bcdj.leader_logit(_V)[0]


def zdraw(seed, village, S_):
    """Standard normal village effects, one per run, from their own stream."""
    return np.random.default_rng([seed, village, 7]).standard_normal(S_)


def moments9(v, Y):
    """R x 9: the extended eight and the squared non-leader take-up rate."""
    m8 = cx.moments_ext(v, Y)
    rate = Y[~v.leader].mean(0)
    return np.column_stack([m8, rate ** 2])


def simulate_point(v, beta, k, S_, seed):
    _f, a, b, g, d, t, s = POINTS[k]
    rng = np.random.default_rng([seed, v.village])
    return cx.simulate(v, beta, a, b, S_, rng, gamma=g, theta=t, delta=d,
                       shift=s * zdraw(seed, v.village, S_))


def _job(args):
    k, seed = args
    Mm = np.zeros((len(_V), M))
    pbar = []
    for j, v in enumerate(_V):
        Y = simulate_point(v, _BETA, k, S, seed)
        Mm[j] = moments9(v, Y).mean(0)
        pbar.append(Y.mean(1))
    return k, seed, Mm, np.concatenate(pbar).astype(np.float32)


def leader_masks(v, Y):
    L = v.leader[:, None]
    tl = L & (Y > 0.5)
    nl = L & (Y < 0.5)
    near_t = ((v.A @ tl) > 0) & ~tl
    near_n = ((v.A @ nl) > 0) & ~nl
    return near_t & ~near_n, near_n & ~near_t


def divergences(V, Msim, Pbar, Ydata):
    """Yields, for each dataset r, {seed: D (P, G, 9)}: simulated minus data moments."""
    G = len(V)
    R = Ydata[0].shape[1]
    dm, val = [], {s: [] for s in SEEDS}
    for g, v in enumerate(V):
        Y = Ydata[g]
        d = moments9(v, Y)
        masks = leader_masks(v, Y)
        for c, mask in zip((1, 2), masks):
            d[:, c] = (Y * mask).sum(0) / np.maximum(mask.sum(0), 1)
        dm.append(d)
        for s in SEEDS:
            val[s].append(np.stack([(Pbar[s][g] @ m) / np.maximum(m.sum(0), 1)
                                    for m in masks], -1))   # P x R x 2
    for r in range(R):
        out = {}
        for s in SEEDS:
            D = Msim[s].copy()
            for g in range(G):
                D[:, g, 1:3] = val[s][g][:, r, :]
                D[:, g, :] -= dm[g][r]
            out[s] = D
        yield out


def select(D0, D1, fidx=FIDX):
    """In-sample (nine moments) and leave-one-out (fit on nine, score on eight) per family."""
    G = D0.shape[1]
    Dc0 = D0[:, :, FIT]
    Q = (Dc0.mean(1) ** 2).sum(-1)
    tot = Dc0.sum(1)
    Qloo = (((tot[:, None, :] - Dc0) / (G - 1)) ** 2).sum(-1)
    ev = (D1[:, :, SCORE] ** 2).sum(-1)
    res = {"Q": {}, "loo": {}, "vill": {}, "arg": {}, "cols": {}}
    for f in FAMS:
        idx = fidx[f]
        res["Q"][f] = Q[idx].min()
        res["arg"][f] = idx[np.argmin(Q[idx])]
        ch = idx[np.argmin(Qloo[idx], 0)]
        vl = ev[ch, np.arange(G)]
        res["loo"][f] = vl.mean()
        res["vill"][f] = vl
        res["cols"][f] = (D1[ch, np.arange(G), :] ** 2).mean(0)   # 9 per-moment held-out MSE
    return res


def select_m3(D0, D1):
    """Milestone 3's rule on its own subgrid (eight moments both ways), for the sanity check."""
    G = D0.shape[1]
    Dc0 = D0[:, :, SCORE]
    tot = Dc0.sum(1)
    Qloo = (((tot[:, None, :] - Dc0) / (G - 1)) ** 2).sum(-1)
    ev = (D1[:, :, SCORE] ** 2).sum(-1)
    out = {}
    for f in FAMS:
        idx = M3IDX[f]
        ch = idx[np.argmin(Qloo[idx], 0)]
        out[f] = ev[ch, np.arange(G)]
    return out


def label(k):
    f, a, b, g, d, t, s = POINTS[k]
    out = f"{f} qN={a:.3f} qP={b:.1f} delta={d:+.2f} sigma={s:.2f}"
    if f == "T":
        out += f" theta={t:.2f}"
    if f == "R":
        out += f" gamma={g:.2f}"
    return out


def main():
    t0 = time.time()
    V = bcdj.load()
    beta = bcdj.leader_logit(V)[0]
    G = len(V)
    out = []
    p = out.append
    p("# Milestone 3b: a village random effect on the base adoption rate")
    p(f"grid: {len(POINTS)} points ({', '.join(f'{f} {len(FIDX[f])}' for f in FAMS)}), S = {S}, "
      f"seeds {SEEDS}; sigma in {SIGMA}; {R_DATA} synthetic datasets per process; "
      "beta held at the real-data leader logit; fit on 9 moments, held-out loss on the extended 8")
    sizes = [v.n for v in V]
    offs = np.r_[0, np.cumsum(sizes)]
    Msim = {s: np.zeros((len(POINTS), G, M)) for s in SEEDS}
    pb = {s: np.zeros((len(POINTS), offs[-1]), np.float32) for s in SEEDS}
    with ProcessPoolExecutor(4, initializer=_init) as ex:
        for k, seed, Mm, pbar in ex.map(_job, [(k, s) for s in SEEDS for k in range(len(POINTS))],
                                        chunksize=8):
            Msim[seed][k] = Mm
            pb[seed][k] = pbar
    Pbar = {s: [pb[s][:, offs[g]:offs[g + 1]].astype(float) for g in range(G)] for s in SEEDS}
    p(f"grid simulated in {time.time() - t0:.0f} s")

    real_Y = [v.takeup.astype(float)[:, None] for v in V]
    D_real = next(divergences(V, Msim, Pbar, real_Y))
    real = select(D_real[0], D_real[1])

    p("\n## sanity: milestone-3 subgrid (sigma 0; delta 0 for I and T), eight moments")
    m3 = select_m3(D_real[0], D_real[1])
    p("LOO mean loss " + ", ".join(f"{f} {m3[f].mean():.4f}" for f in FAMS)
      + f"; R better than I in {int((m3['R'] < m3['I']).sum())}/{G} villages "
      "(milestone 3: I 0.1743, T 0.1841, R 0.1906, 13/43)")

    rates = np.array([v.takeup[~v.leader].mean() for v in V])
    p(f"\n## real data: non-leader take-up rate across villages mean {rates.mean():.4f}, "
      f"SD {rates.std():.4f}; ninth moment (mean squared rate) {np.mean(rates ** 2):.4f}")
    for f in FAMS:
        k = real["arg"][f]
        k0 = M3IDX[f][np.argmin(((D_real[0][M3IDX[f]][:, :, FIT].mean(1)) ** 2).sum(-1))]
        p(f"in-sample {f}: {label(k)}  Q={real['Q'][f]:.3e}  (best with sigma 0 on the "
          f"milestone-3 subgrid: {label(k0)}, Q={((D_real[0][k0][:, FIT].mean(0)) ** 2).sum():.3e})")
        p(f"   moments sim-data at fit: " + " ".join(f"{x:+.4f}" for x in D_real[0][k].mean(0)))
    p("LOO (fit 9, score 8) mean loss " + ", ".join(f"{f} {real['loo'][f]:.4f}" for f in FAMS)
      + f"; R better than I in {int((real['vill']['R'] < real['vill']['I']).sum())}/{G}, "
      f"T better than I in {int((real['vill']['T'] < real['vill']['I']).sum())}/{G}")

    # H6: village bootstrap of sigma-hat (in sample, nine moments)
    rng = np.random.default_rng(42)
    D0 = D_real[0][:, :, FIT]
    p("\n## H6: Bayesian village bootstrap of sigma-hat (B = %d, nine moments, in sample)" % B_BOOT)
    shares = {}
    for f in FAMS:
        idx = FIDX[f]
        Df = D0[idx]
        sh = []
        for _ in range(B_BOOT):
            w = rng.exponential(size=G)
            w /= w.sum()
            Q = (np.einsum("g,pgm->pm", w, Df) ** 2).sum(-1)
            sh.append(POINTS[idx[np.argmin(Q)]][6])
        u, c = np.unique(sh, return_counts=True)
        shares[f] = dict(zip(u, c / B_BOOT))
        p(f"  {f}: " + ", ".join(f"sigma {x:g}: {n / B_BOOT:.3f}" for x, n in zip(u, c)))
    z0 = shares["I"].get(0.0, 0.0)
    sI = POINTS[real["arg"]["I"]][6]
    p(f"H6: I sigma-hat {sI:g}, sigma-hat = 0 in {z0:.3f} of draws -> "
      f"{'held' if sI > 0 and z0 < 0.025 else 'refuted'}")

    # synthetic datasets from the fitted random-effect processes
    datasets = {}
    for di, f in enumerate(FAMS):
        _f, a, b, g, d, t, s = POINTS[real["arg"][f]]
        datasets[f] = [cx.simulate(v, beta, a, b, R_DATA,
                                   np.random.default_rng([2000 + di, v.village]),
                                   gamma=g, theta=t, delta=d,
                                   shift=s * zdraw(2000 + di, v.village, R_DATA)) for v in V]
    sel = {}
    for name, Yd in datasets.items():
        sel[name] = [select(D[0], D[1]) for D in divergences(V, Msim, Pbar, Yd)]
    p(f"\nsynthetic selection done in {time.time() - t0:.0f} s")

    p("\n## H7: real held-out losses against each random-effect process's synthetic spread")
    rw = int((real["vill"]["R"] < real["vill"]["I"]).sum())
    h7 = None
    for a in FAMS:
        rr = sel[a]
        line = []
        for f in FAMS:
            x = np.array([r["loo"][f] for r in rr])
            share = (x >= real["loo"][f]).mean()
            if a == "I" and f == "I":
                h7 = share
            line.append(f"{f} real {real['loo'][f]:.4f} vs 5-95% {np.percentile(x, 5):.4f}-"
                        f"{np.percentile(x, 95):.4f} (share at or above real {share:.3f})")
        w = np.array([int((r["vill"]["R"] < r["vill"]["I"]).sum()) for r in rr])
        p(f"  {a} process ({label(real['arg'][a])}): " + "; ".join(line)
          + f"; R better than I in median {np.median(w):.0f}/43 villages (5-95% "
          f"{np.percentile(w, 5):.0f}-{np.percentile(w, 95):.0f}), <= {rw} in {(w <= rw).mean():.3f}")
    p(f"H7: under the I random-effect process, {h7:.3f} of synthetic datasets reach the real I "
      f"held-out loss -> {'held' if h7 >= 0.05 else 'refuted'}")

    # diagnostic added after a smoke run on a tiny grid showed the ninth moment already matched
    # at sigma = 0: which moments carry the real-vs-synthetic gap in held-out loss?
    p("\n## diagnostic: held-out squared error by moment, I family (real; 5-95% under each process)")
    names = ["m1 no adopting nb", "m2 nb of adopting leader", "m3 nb of non-adopting leader",
             "m4 own x share nb", "m5 own x 2nd nb", "m6 k=1", "m7 k=2", "m8 k>=3", "m9 rate^2"]
    for c, nm in enumerate(names):
        p(f"  {nm}: real {real['cols']['I'][c]:.5f}; " + "; ".join(
            f"{a} {np.percentile([r['cols']['I'][c] for r in sel[a]], 5):.5f}-"
            f"{np.percentile([r['cols']['I'][c] for r in sel[a]], 95):.5f}" for a in FAMS))

    p("\n## leave-one-village-out confusion under the random-effect processes "
      "(rows: true process; columns: share choosing I, T, R)")
    for a in FAMS:
        ch = [min(FAMS, key=lambda f: r["loo"][f]) for r in sel[a]]
        row = [np.mean([c == f for c in ch]) for f in FAMS]
        p(f"  {a}: " + "  ".join(f"{f} {x:.3f}" for f, x in zip(FAMS, row))
          + f"   recovered {row[FAMS.index(a)]:.3f}")
    p("  in-sample (nine moments):")
    for a in FAMS:
        ch = [min(FAMS, key=lambda f: r["Q"][f]) for r in sel[a]]
        row = [np.mean([c == f for c in ch]) for f in FAMS]
        p(f"  {a}: " + "  ".join(f"{f} {x:.3f}" for f, x in zip(FAMS, row))
          + f"   recovered {row[FAMS.index(a)]:.3f}")

    p("\n## sigma recovery within the true family (in sample): share of datasets at each value")
    for a in FAMS:
        vals = [POINTS[r["arg"][a]][6] for r in sel[a]]
        u, c = np.unique(vals, return_counts=True)
        p(f"  {a} (true sigma {POINTS[real['arg'][a]][6]:g}): "
          + ", ".join(f"{x:g}: {n / len(vals):.2f}" for x, n in zip(u, c)))
    p(f"runtime {time.time() - t0:.0f} s")
    txt = "\n".join(out) + "\n"
    open(os.path.join(HERE, "results.txt"), "w").write(txt)
    print(txt)


if __name__ == "__main__":
    main()
