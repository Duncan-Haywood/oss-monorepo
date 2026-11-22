"""Milestone 26: does take-up among the aware by the *share* of adopting neighbours split a
fractional threshold from reinforcement, and does the awareness design still identify the model
when the moment scale comes from the data (milestone 25's sd-data)? Milestone 3's harness (grid,
seeds, data-generating fits, the same 200 synthetic datasets per process) with milestone 24's
awareness moments and the new share moments (`measure.moments_aware_share`).
Plan and hypotheses H90 to H94 in LOG.md (2026-11-22, milestone 26), pushed before the run.

python3 experiments/m26_share/run.py   (about 5 minutes on 4 cores; writes results.txt, results.json)
"""
import json
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
sys.path.insert(0, os.path.join(HERE, "..", "m3_identify"))
from civ_seeding import bcdj, complex as cx, measure as ms  # noqa: E402
import run as m3  # noqa: E402

sys.path.insert(0, os.path.join(HERE, "..", "m25_scaled"))
import importlib.util  # noqa: E402
_spec = importlib.util.spec_from_file_location("m25", os.path.join(HERE, "..", "m25_scaled", "run.py"))
m25 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m25)

POINTS, FAMS, DGP, SEEDS, S, R_DATA = m3.POINTS, m3.FAMS, m3.DGP, m3.SEEDS, m3.S, m3.R_DATA
NX = 9                            # aware 5 (milestone 24), share 4 (milestone 26)
COLS = {"X": np.arange(8),
        "XA": np.r_[0:8, 8:13],             # milestone 24: aware share + take-up by count
        "XS": np.r_[0:8, 8, 13:17],          # aware share + take-up by share
        "XAS": np.r_[0:17]}
BUDGETS = (43, 20)
SUBSETS_SEED = 2424               # milestone 24's subsets
WEIGHTS = ("identity", "sd-synth", "sd-data")

_V = _BETA = None


def _init():
    global _V, _BETA
    _V = bcdj.load()
    _BETA = bcdj.leader_logit(_V)[0]


def extra_moments(v, Y, aware):
    return np.column_stack([ms.moments_aware(v, Y, aware), ms.moments_aware_share(v, Y, aware)])


def _job(args):
    k, seed = args
    _f, a, b, g, d, t = POINTS[k]
    M = np.zeros((len(_V), 8 + NX))
    pbar = []
    for j, v in enumerate(_V):
        rng = np.random.default_rng([seed, v.village])
        Y, inf, _ta = ms.simulate_tracked(v, _BETA, a, b, S, rng, gamma=g, theta=t, delta=d)
        M[j, :8] = cx.moments_ext(v, Y).mean(0)
        M[j, 8:] = extra_moments(v, Y, inf).mean(0)
        pbar.append(Y.mean(1))
    return k, seed, M, np.concatenate(pbar)


def safe_sd(X, axis=0):
    s = X.std(axis)
    return np.where(s == 0, 1.0, s)


def main():
    t0 = time.time()
    V = bcdj.load()
    beta = bcdj.leader_logit(V)[0]
    G = len(V)
    out = []
    p = out.append
    p("# Milestone 26: take-up among the aware by share of adopting neighbours")
    p(f"milestone 3 harness: grid {len(POINTS)} points, S = {S}, seeds {SEEDS}, {R_DATA} datasets "
      f"per process; share bins {ms.SHARE_BINS}")
    sizes = [v.n for v in V]
    offs = np.r_[0, np.cumsum(sizes)]
    Msim = {s: np.zeros((len(POINTS), G, 8 + NX)) for s in SEEDS}
    pb = {s: np.zeros((len(POINTS), offs[-1])) for s in SEEDS}
    with ProcessPoolExecutor(4, initializer=_init) as ex:
        for k, seed, M, pbar in ex.map(_job, [(k, s) for s in SEEDS for k in range(len(POINTS))],
                                       chunksize=4):
            Msim[seed][k] = M
            pb[seed][k] = pbar
    Pbar = {s: [pb[s][:, offs[g]:offs[g + 1]] for g in range(G)] for s in SEEDS}
    p(f"grid simulated in {time.time() - t0:.0f} s")

    data = {}
    for di, (name, par) in enumerate(DGP.items()):
        Ys, Xs = [], []
        for v in V:
            Y, inf, _ta = ms.simulate_tracked(v, beta, par["qN"], par["qP"], R_DATA,
                                              np.random.default_rng([1000 + di, v.village]),
                                              gamma=par["gamma"], theta=par["theta"],
                                              delta=par["delta"])
            Ys.append(Y)
            Xs.append(extra_moments(v, Y, inf))
        data[name] = (Ys, Xs)

    names = ["aware share", "take-up|aware k=0", "k=1", "k=2", "k=3+",
             "share=0", "share (0,0.4)", "share [0.4,0.6)", "share [0.6,1]"]
    p("\n## added moments under each process (mean over villages and datasets; 5-95% over datasets)")
    shape = {}
    for name in DGP:
        vm = np.stack(data[name][1]).mean(0)       # R x 9
        shape[name] = vm.mean(0).tolist()
        p(f"  {name}: " + "; ".join(f"{n} {vm[:, c].mean():.3f} ({np.percentile(vm[:, c], 5):.3f}-"
                                    f"{np.percentile(vm[:, c], 95):.3f})" for c, n in enumerate(names)))

    allX = np.concatenate([np.stack(data[n][1]).reshape(-1, NX) for n in DGP])
    allE = np.concatenate([np.concatenate([cx.moments_ext(v, Y) for v, Y in zip(V, data[n][0])])
                           for n in DGP])
    synth_scale = np.r_[safe_sd(allE), safe_sd(allX)]

    rng_sub = np.random.default_rng(SUBSETS_SEED)
    subsets = {gb: [np.sort(rng_sub.choice(G, gb, replace=False)) if gb < G else np.arange(G)
                    for _ in range(R_DATA)] for gb in BUDGETS}
    choice = {w: {d: {gb: {n: [] for n in DGP} for gb in BUDGETS} for d in COLS} for w in WEIGHTS}
    for name in DGP:
        Ys, Xs = data[name]
        dm8 = m25.data_moments(V, Ys)                                 # G x R x 8
        for r, D in enumerate(m3.divergences(V, {s: Msim[s][:, :, :8] for s in SEEDS}, Pbar, Ys)):
            xr = np.stack([Xs[g][r] for g in range(G)])               # G x 9
            Dfull = {s: np.concatenate([D[s], Msim[s][:, :, 8:] - xr[None]], -1) for s in SEEDS}
            own = np.c_[dm8[:, r, :], xr]                             # G x 17 data moments
            for w in WEIGHTS:
                for gb in BUDGETS:
                    sub = subsets[gb][r]
                    if w == "identity":
                        sc = np.ones(8 + NX)
                    elif w == "sd-synth":
                        sc = synth_scale
                    else:
                        sc = safe_sd(own[sub])                        # the study's own villages
                    for dn, cols in COLS.items():
                        res = m3.select(Dfull[0][:, sub] / sc, Dfull[1][:, sub] / sc, cols)
                        choice[w][dn][gb][name].append(
                            (min(FAMS, key=lambda f: res["Q"][f]),
                             min(FAMS, key=lambda f: res["loo"][f])))
    p(f"selection done in {time.time() - t0:.0f} s")

    rec = {}
    for w in WEIGHTS:
        rec[w] = {}
        for rule, ri in (("loo", 1), ("in-sample", 0)):
            rec[w][rule] = {}
            p(f"\n## recovery, {w} weights, rule {rule} (share of {R_DATA} datasets choosing the "
              f"true family; confusion lists the share choosing I/T/R)")
            for dn in COLS:
                rec[w][rule][dn] = {}
                for gb in BUDGETS:
                    conf = {n: {f: float(np.mean([c[ri] == f for c in choice[w][dn][gb][n]]))
                                for f in FAMS} for n in DGP}
                    row = {n: conf[n][n] for n in DGP}
                    rec[w][rule][dn][gb] = {"recovery": row, "confusion": conf,
                                            "lowest": min(row.values())}
                    p(f"  {dn:4s} G={gb:2d}: " + "  ".join(f"{n} {row[n]:.3f}" for n in DGP)
                      + f"   lowest {min(row.values()):.3f}   ("
                      + "; ".join(f"{n}->" + "/".join(f"{conf[n][f]:.2f}" for f in FAMS)
                                  for n in DGP) + ")")

    L = {w: rec[w]["loo"] for w in WEIGHTS}
    v = lambda ok, bad=None: "held" if ok else ("refuted" if bad is None or bad else "inconclusive")  # noqa: E731
    p("\n## hypotheses (leave one village out)")
    xi = L["identity"]["X"][43]["recovery"]
    xa = L["identity"]["XA"][43]["recovery"]
    xd = L["sd-data"]["X"][43]["recovery"]
    r3 = lambda d: [round(d[f], 3) for f in FAMS]  # noqa: E731
    ok90 = (r3(xi) == [0.585, 0.82, 0.555] and r3(xa) == [0.91, 0.735, 0.915]
            and r3(xd) == [0.69, 0.815, 0.79])
    p(f"H90 (sanity: identity X = m3 0.585/0.820/0.555, identity XA = m24 0.910/0.735/0.915, "
      f"sd-data X = m25 0.690/0.815/0.790): X {r3(xi)}, XA {r3(xa)}, sd-data X {r3(xd)} -> {v(ok90)}")
    xs = L["identity"]["XS"][43]
    tr_xs, tr_xa = xs["confusion"]["T"]["R"], L["identity"]["XA"][43]["confusion"]["T"]["R"]
    ok91 = xs["recovery"]["T"] >= 0.85 and tr_xs <= tr_xa / 2
    p(f"H91 (XS, identity, 43: T recovery >= 0.85 and T->R at most half of XA's): T "
      f"{xs['recovery']['T']:.3f}, T->R {tr_xs:.3f} vs XA {tr_xa:.3f} -> {v(ok91)}")
    lo92 = L["sd-data"]["XAS"][43]["lowest"]
    p(f"H92 (XAS, sd-data, 43: lowest >= 0.85; refuted below 0.75): {lo92:.3f} -> "
      f"{v(lo92 >= 0.85, lo92 < 0.75)}")
    lo93 = L["sd-data"]["XAS"][20]["lowest"]
    p(f"H93 (XAS, sd-data, 20 villages: lowest >= 0.70): {lo93:.3f} -> {v(lo93 >= 0.70)}")
    cmp94 = {w: (L[w]["XS"][43]["lowest"], L[w]["XA"][43]["lowest"]) for w in WEIGHTS}
    ok94 = all(a >= b for a, b in cmp94.values())
    p(f"H94 (XS lowest >= XA lowest under every weighting, 43): "
      + "; ".join(f"{w} XS {a:.3f} XA {b:.3f}" for w, (a, b) in cmp94.items()) + f" -> {v(ok94)}")
    p(f"runtime {time.time() - t0:.0f} s")
    txt = "\n".join(out) + "\n"
    open(os.path.join(HERE, "results.txt"), "w").write(txt)
    json.dump({"recovery": rec, "added_moments": shape, "added_moment_names": names,
               "share_bins": ms.SHARE_BINS, "synth_scale": synth_scale.tolist()},
              open(os.path.join(HERE, "results.json"), "w"), indent=1)
    print(txt)


if __name__ == "__main__":
    main()
