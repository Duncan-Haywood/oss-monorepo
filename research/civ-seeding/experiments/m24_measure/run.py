"""Milestone 24: which extra measurement would tell simple from complex contagion, and how many
villages does it need? Milestone 3's identification harness (its grid, seeds, data-generating
fits and synthetic datasets, unchanged), with moments from an end-line awareness question and
from adoption timing added (`src/civ_seeding/measure.py`). Plan in LOG.md (2026-11-21,
milestone 24).

python3 experiments/m24_measure/run.py   (a few minutes on 4 cores; writes results.txt, results.json)
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

POINTS, FAMS, FIDX, DGP, SEEDS, S, R_DATA = (m3.POINTS, m3.FAMS, m3.FIDX, m3.DGP, m3.SEEDS,
                                            m3.S, m3.R_DATA)
MISS, FALSE = 0.15, 0.05          # awareness misreport rates (design XAn)
NX = 15                           # extra columns: aware 5, timing 5, noisy aware 5
COLS = {"X": np.arange(8),
        "XA": np.r_[0:8, 8:13],
        "XH": np.r_[0:8, 13:18],
        "XAH": np.r_[0:18],
        "XAn": np.r_[0:8, 18:23]}
BUDGETS = (43, 20, 10)
SUBSETS_SEED = 2424

_V = _BETA = None


def _init():
    global _V, _BETA
    _V = bcdj.load()
    _BETA = bcdj.leader_logit(_V)[0]


def extra_moments(v, Y, aware, tadopt, rng):
    """R x 15: awareness (5), timing (5), awareness misreported (5)."""
    an = ms.misreport(aware, rng, MISS, FALSE)
    return np.column_stack([ms.moments_aware(v, Y, aware), ms.moments_timing(v, tadopt),
                            ms.moments_aware(v, Y, an)])


def _job(args):
    k, seed = args
    _f, a, b, g, d, t = POINTS[k]
    M = np.zeros((len(_V), 8 + NX))
    pbar = []
    for j, v in enumerate(_V):
        rng = np.random.default_rng([seed, v.village])
        Y, inf, ta = ms.simulate_tracked(v, _BETA, a, b, S, rng, gamma=g, theta=t, delta=d)
        M[j, :8] = cx.moments_ext(v, Y).mean(0)
        M[j, 8:] = extra_moments(v, Y, inf, ta, np.random.default_rng([seed, v.village, 7])).mean(0)
        pbar.append(Y.mean(1))
    return k, seed, M, np.concatenate(pbar)


def label(k):
    return m3.label(k)


def main():
    t0 = time.time()
    V = bcdj.load()
    beta = bcdj.leader_logit(V)[0]
    G = len(V)
    out = []
    p = out.append
    p("# Milestone 24: which extra measurement identifies the model?")
    p(f"milestone 3 harness: grid {len(POINTS)} points, S = {S}, seeds {SEEDS}, {R_DATA} datasets "
      f"per process; awareness misreport miss {MISS}, false {FALSE}")
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

    # synthetic datasets: milestone 3's draws (same seeds), now with awareness and timing kept
    data = {}
    for di, (name, par) in enumerate(DGP.items()):
        Ys, Xs = [], []
        for v in V:
            Y, inf, ta = ms.simulate_tracked(v, beta, par["qN"], par["qP"], R_DATA,
                                             np.random.default_rng([1000 + di, v.village]),
                                             gamma=par["gamma"], theta=par["theta"],
                                             delta=par["delta"])
            Ys.append(Y)
            Xs.append(extra_moments(v, Y, inf, ta,
                                    np.random.default_rng([1000 + di, v.village, 7])))
        data[name] = (Ys, Xs)

    # what the added moments look like under each process (village mean, mean over datasets)
    names = ["aware share", "take-up | aware, k=0", "k=1", "k=2", "k=3+",
             "hazard k=0", "k=1", "k=2", "k=3+", "mean period / T",
             "noisy aware share", "take-up | said aware, k=0", "k=1", "k=2", "k=3+"]
    p("\n## added moments under each process (mean over villages and 200 datasets; 5-95% over datasets)")
    shape = {}
    for name in DGP:
        X = np.stack(data[name][1])            # G x R x 15
        vm = X.mean(0)                         # R x 15
        shape[name] = vm.mean(0).tolist()
        p(f"  {name}: " + "; ".join(f"{n} {vm[:, c].mean():.3f} ({np.percentile(vm[:, c], 5):.3f}-"
                                    f"{np.percentile(vm[:, c], 95):.3f})" for c, n in enumerate(names)))

    # secondary weighting: each column divided by its SD across synthetic villages (all processes)
    allX = np.concatenate([np.stack(data[n][1]).reshape(-1, NX) for n in DGP])
    allE = np.concatenate([np.concatenate([cx.moments_ext(v, Y) for v, Y in zip(V, data[n][0])])
                           for n in DGP])
    scale = np.r_[allE.std(0), allX.std(0)]
    scale[scale == 0] = 1

    rng_sub = np.random.default_rng(SUBSETS_SEED)
    subsets = {gb: [np.sort(rng_sub.choice(G, gb, replace=False)) if gb < G else np.arange(G)
                    for _ in range(R_DATA)] for gb in BUDGETS}
    # choice[weight][design][budget][process] -> list of (in-sample family, LOO family)
    choice = {w: {d: {gb: {n: [] for n in DGP} for gb in BUDGETS} for d in COLS}
              for w in ("identity", "sd")}
    for name in DGP:
        Ys, Xs = data[name]
        for r, D in enumerate(m3.divergences(V, {s: Msim[s][:, :, :8] for s in SEEDS}, Pbar, Ys)):
            Dfull = {}
            for s in SEEDS:
                Dx = Msim[s][:, :, 8:] - np.stack([Xs[g][r] for g in range(G)])[None]
                Dfull[s] = np.concatenate([D[s], Dx], -1)
            for w in ("identity", "sd"):
                Dw = Dfull if w == "identity" else {s: Dfull[s] / scale for s in SEEDS}
                for gb in BUDGETS:
                    sub = subsets[gb][r]
                    for dn, cols in COLS.items():
                        res = m3.select(Dw[0][:, sub], Dw[1][:, sub], cols)
                        choice[w][dn][gb][name].append(
                            (min(FAMS, key=lambda f: res["Q"][f]),
                             min(FAMS, key=lambda f: res["loo"][f])))
    p(f"selection done in {time.time() - t0:.0f} s")

    rec = {}
    for w in ("identity", "sd"):
        rec[w] = {}
        for rule, ri in (("loo", 1), ("in-sample", 0)):
            rec[w][rule] = {}
            p(f"\n## recovery, {w} weights, rule {rule} (rows: design and villages; share of 200 "
              f"datasets whose chosen family is the true one)")
            for dn in COLS:
                rec[w][rule][dn] = {}
                for gb in BUDGETS:
                    row = {}
                    conf = {}
                    for name in DGP:
                        ch = [c[ri] for c in choice[w][dn][gb][name]]
                        row[name] = float(np.mean([c == name for c in ch]))
                        conf[name] = {f: float(np.mean([c == f for c in ch])) for f in FAMS}
                    rec[w][rule][dn][gb] = {"recovery": row, "confusion": conf}
                    p(f"  {dn:4s} G={gb:2d}: " + "  ".join(f"{n} {row[n]:.3f}" for n in DGP)
                      + f"   min {min(row.values()):.3f}   ("
                      + "; ".join(f"{n}->" + ",".join(f"{f}{conf[n][f]:.2f}" for f in FAMS)
                                  for n in DGP) + ")")

    L = rec["identity"]["loo"]
    mn = {dn: {gb: min(L[dn][gb]["recovery"].values()) for gb in BUDGETS} for dn in COLS}
    x = L["X"][43]["recovery"]
    verdict = lambda ok: "held" if ok else "refuted"  # noqa: E731
    p("\n## verdicts (identity weights, leave one village out)")
    p(f"H79 (XA, 43 villages, every family >= 0.80): {L['XA'][43]['recovery']} -> "
      f"{verdict(mn['XA'][43] >= 0.80)}")
    p(f"H80 (XH min < XA min): XH {mn['XH'][43]:.3f}, XA {mn['XA'][43]:.3f} -> "
      f"{verdict(mn['XH'][43] < mn['XA'][43])}")
    p(f"H81 (XAH min >= 0.90 at 43): {mn['XAH'][43]:.3f} -> {verdict(mn['XAH'][43] >= 0.90)}")
    p(f"H82 (XAH min >= 0.80 at 20): {mn['XAH'][20]:.3f} -> {verdict(mn['XAH'][20] >= 0.80)}")
    ok83 = (abs(x["I"] - 0.585) < 1e-9 and abs(x["T"] - 0.82) < 1e-9 and abs(x["R"] - 0.555) < 1e-9)
    p(f"H83 (X equals milestone 3's 0.585 / 0.820 / 0.555): {x} -> {verdict(ok83)}")
    p(f"H84 (XAn min within 0.10 of XA min): XAn {mn['XAn'][43]:.3f}, XA {mn['XA'][43]:.3f} -> "
      f"{verdict(abs(mn['XAn'][43] - mn['XA'][43]) <= 0.10)}")
    p(f"runtime {time.time() - t0:.0f} s")
    txt = "\n".join(out) + "\n"
    open(os.path.join(HERE, "results.txt"), "w").write(txt)
    json.dump({"recovery": rec, "min_recovery_identity_loo": mn, "added_moments": shape,
               "added_moment_names": names, "misreport": [MISS, FALSE]},
              open(os.path.join(HERE, "results.json"), "w"), indent=1)
    print(txt)


if __name__ == "__main__":
    main()
