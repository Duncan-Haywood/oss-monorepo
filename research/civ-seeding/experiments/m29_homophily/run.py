"""Milestone 29: homophily (L) as the rival explanation of the real villages' middle share bin.
Milestone 28 found no contagion family reaches the real take-up among households with 40 to 60%
adopting neighbours (28.8%). L has no contagion through adoption: the information model plus a
network-correlated latent propensity sigma * z_i in every household's logit
(`complex.latent_field`). Does L reproduce the profile, do the real villages prefer it on
held-out villages, and can it be told apart from contagion?
Plan and hypotheses H105 to H109 in LOG.md (2026-11-23, milestone 29), pushed before the run.

OMP_NUM_THREADS=1 python3 experiments/m29_homophily/run.py   (about 10 minutes on 4 cores)

Milestone 28's harness unchanged (850 I/T/R + 750 H points, S = 75, seed 0 fits, seed 1 scores,
designs X and XS0, weightings identity / sd-data / sd-synth), plus 1200 L points.
"""
import importlib.util
import itertools
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

_spec = importlib.util.spec_from_file_location("m25", os.path.join(HERE, "..", "m25_scaled", "run.py"))
m25 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m25)

S, SEEDS, R_DATA = m3.S, m3.SEEDS, m3.R_DATA
MU = [0.3, 0.4, 0.5, 0.6, 0.75]
KAPPA = [2.0, 5.0, 20.0]
POINTS = m3.POINTS + [("H", a, b, 0.0, 0.0, (mu, k))
                      for a, b, mu, k in itertools.product(m3.QN, m3.QP, MU, KAPPA)]
SIGMA = [0.5, 1.0, 1.5, 2.0]
RHO = [0.5, 2.0, 8.0]
LDELTA = [0.0, -0.5]
POINTS += [("L", a, b, 0.0, d, (s, r))
           for a, b, s, r, d in itertools.product(m3.QN, m3.QP, SIGMA, RHO, LDELTA)]
FAMS5 = ("I", "T", "R", "H", "L")
FAMS4 = ("I", "T", "R", "H")
FIDX = {f: np.array([i for i, p in enumerate(POINTS) if p[0] == f]) for f in FAMS5}
NX = 4
COLS = {"X": np.arange(8), "XS0": np.arange(12)}
WEIGHTS = ("identity", "sd-data", "sd-synth")
B_PAIRED = 2000
BIN_NAMES = ["share 0", "share (0,0.4)", "share [0.4,0.6)", "share [0.6,1]"]

_V = _BETA = None


def _init():
    global _V, _BETA
    _V = bcdj.load()
    _BETA = bcdj.leader_logit(_V)[0]


def sim(v, beta, pt, R, rng):
    f, a, b, g, d, t = pt
    if f == "H":
        return cx.simulate(v, beta, a, b, R, rng, theta_beta=t)
    if f == "L":
        return cx.simulate(v, beta, a, b, R, rng, delta=d, latent=t)
    return cx.simulate(v, beta, a, b, R, rng, gamma=g, theta=t, delta=d)


def _job(args):
    k, seed = args
    M = np.zeros((len(_V), 8 + NX))
    pbar = []
    for j, v in enumerate(_V):
        Y = sim(v, _BETA, POINTS[k], S, np.random.default_rng([seed, v.village]))
        M[j, :8] = cx.moments_ext(v, Y).mean(0)
        M[j, 8:] = ms.moments_share(v, Y).mean(0)
        pbar.append(Y.mean(1))
    return k, seed, M, np.concatenate(pbar)


def label(i):
    f, a, b, g, d, t = POINTS[i]
    if f == "H":
        return f"H qN={a} qP={b} mu={t[0]} kappa={t[1]:g}"
    if f == "L":
        return f"L qN={a} qP={b} sigma={t[0]} rho={t[1]:g} delta={d}"
    return m3.label(i)


def select(D0, D1, cols, fams):
    """m3.select over the given families of this grid."""
    G = D0.shape[1]
    Dc0 = D0[:, :, cols]
    Q = (Dc0.mean(1) ** 2).sum(-1)
    tot = Dc0.sum(1)
    Qloo = ((((tot[:, None, :] - Dc0) / (G - 1)) ** 2).sum(-1))
    ev = (D1[:, :, cols] ** 2).sum(-1)
    res = {"Q": {}, "loo": {}, "vill": {}, "arg": {}}
    for f in fams:
        idx = FIDX[f]
        res["Q"][f] = Q[idx].min()
        res["arg"][f] = int(idx[np.argmin(Q[idx])])
        ch = idx[np.argmin(Qloo[idx], 0)]
        vl = ev[ch, np.arange(G)]
        res["loo"][f] = vl.mean()
        res["vill"][f] = vl
    return res


def full(D8, Msim, xr):
    return {s: np.concatenate([D8[s], Msim[s][:, :, 8:] - xr[None]], -1) for s in SEEDS}


def scale_for(w, own, synth_scale):
    if w == "identity":
        return np.ones(8 + NX)
    if w == "sd-data":
        return m25.safe_sd(own)
    return synth_scale


def main():
    t0 = time.time()
    V = bcdj.load()
    beta = bcdj.leader_logit(V)[0]
    G = len(V)
    out, J = [], {}
    p = out.append
    p("# Milestone 29: homophily (network-correlated latent propensity, no contagion), family L")
    p(f"grid {len(POINTS)} points ({len(FIDX['H'])} H: mu {MU} x kappa {KAPPA}; {len(FIDX['L'])} L: "
      f"sigma {SIGMA} x rho {RHO} x delta {LDELTA}), S = {S}, seeds "
      f"{SEEDS}, {R_DATA} datasets per process; share bins {ms.SHARE_BINS}")
    offs = np.r_[0, np.cumsum([v.n for v in V])]
    Msim = {s: np.zeros((len(POINTS), G, 8 + NX)) for s in SEEDS}
    pb = {s: np.zeros((len(POINTS), offs[-1])) for s in SEEDS}
    with ProcessPoolExecutor(4, initializer=_init) as ex:
        for k, seed, M, pbar in ex.map(_job, [(k, s) for s in SEEDS for k in range(len(POINTS))],
                                       chunksize=4):
            Msim[seed][k] = M
            pb[seed][k] = pbar
    Pbar = {s: [pb[s][:, offs[g]:offs[g + 1]] for g in range(G)] for s in SEEDS}
    M8 = {s: Msim[s][:, :, :8] for s in SEEDS}
    p(f"grid simulated in {time.time() - t0:.0f} s")

    # milestone 27's three processes and synthetic scale, same seeds
    data = {}
    for di, (name, par) in enumerate(m3.DGP.items()):
        Ys = [cx.simulate(v, beta, par["qN"], par["qP"], R_DATA,
                          np.random.default_rng([1000 + di, v.village]), gamma=par["gamma"],
                          theta=par["theta"], delta=par["delta"]) for v in V]
        data[name] = (Ys, np.stack([ms.moments_share(v, Y) for v, Y in zip(V, Ys)]))
    allE = np.concatenate([np.concatenate([cx.moments_ext(v, Y) for v, Y in zip(V, data[n][0])])
                           for n in m3.DGP])
    allX = np.concatenate([data[n][1].reshape(-1, NX) for n in m3.DGP])
    synth_scale = np.r_[m25.safe_sd(allE), m25.safe_sd(allX)]

    # (a) the real villages
    real_Y = [v.takeup.astype(float) for v in V]
    real_x = np.stack([ms.moments_share(v, y) for v, y in zip(V, real_Y)])
    dm_real = m25.data_moments(V, [y[:, None] for y in real_Y])[:, 0, :]
    Dreal = full(next(m3.divergences(V, M8, Pbar, [y[:, None] for y in real_Y])), Msim, real_x)
    own_real = np.c_[dm_real, real_x]
    rng = np.random.default_rng(2029)
    J["real"] = {}
    p("\n## (a) real data, five families (leave one village out; paired Bayesian bootstrap)")
    for w in WEIGHTS:
        sc = scale_for(w, own_real, synth_scale)
        J["real"][w] = {}
        for dn, cols in COLS.items():
            r = select(Dreal[0] / sc, Dreal[1] / sc, cols, FAMS5)
            best = min(FAMS5, key=lambda f: r["loo"][f])
            jj = {"arg": {f: label(r["arg"][f]) for f in FAMS5},
                  "Q": {f: float(r["Q"][f]) for f in FAMS5},
                  "loo": {f: float(r["loo"][f]) for f in FAMS5}, "best_loo": best,
                  "best_in_sample": min(FAMS5, key=lambda f: r["Q"][f]), "pairs": {}, "L_pairs": {},
                  "arg_idx": {f: r["arg"][f] for f in FAMS5}}
            line = (f"  {w:8s} {dn:4s}: LOO " + ", ".join(f"{f} {r['loo'][f]:.4f}" for f in FAMS5)
                    + f"; lowest {best}; in-sample Q " + ", ".join(f"{f} {r['Q'][f]:.4f}" for f in FAMS5)
                    + "\n      fits: " + "; ".join(jj["arg"][f] for f in FAMS5))
            for f in FAMS5:
                if f == best:
                    continue
                d = r["vill"][best] - r["vill"][f]
                share, ci = m25.bb_lower(d, rng, B_PAIRED)
                wins = int((r["vill"][f] < r["vill"][best]).sum())
                line += (f"\n      {best} vs {f}: lower in {share:.3f} of draws; mean diff "
                         f"{d.mean():+.4f} [{ci[0]:+.4f}, {ci[1]:+.4f}]; {f} better in {wins}/{G}")
                jj["pairs"][f] = {"share_best_lower": share, "mean_diff": float(d.mean()),
                                  "ci": ci.tolist(), "villages_other_better": wins}
            if best != "L":
                for f in FAMS4:
                    d = r["vill"]["L"] - r["vill"][f]
                    share, ci = m25.bb_lower(d, rng, B_PAIRED)
                    jj["L_pairs"][f] = {"share_L_lower": share, "mean_diff": float(d.mean()),
                                        "ci": ci.tolist()}
                line += "\n      L vs each: " + "; ".join(
                    f"{f} {x['share_L_lower']:.3f} ({x['mean_diff']:+.3f})" for f, x in jj["L_pairs"].items())
            p(line)
            J["real"][w][dn] = jj

    # (b) the H and L processes at their real sd-data XS0 in-sample fits
    data["H"] = data["L"] = None
    J["process_fit"] = {}
    for fam, sd in (("H", 1003), ("L", 1004)):
        k = J["real"]["sd-data"]["XS0"]["arg_idx"][fam]
        p(f"\n## (b) {fam} process: {label(k)} (real in-sample fit, sd-data XS0)")
        Ys = [sim(v, beta, POINTS[k], R_DATA, np.random.default_rng([sd, v.village])) for v in V]
        data[fam] = (Ys, np.stack([ms.moments_share(v, Y) for v, Y in zip(V, Ys)]))
        J["process_fit"][fam] = label(k)
    p("  real, mean over villages: " + "; ".join(f"{n} {x:.3f}" for n, x in zip(BIN_NAMES, real_x.mean(0))))
    J["process_profile"] = {}
    for name in FAMS5:
        vm = data[name][1].mean(0)
        pp = {"mean": vm.mean(0).tolist(), "p5": np.percentile(vm, 5, 0).tolist(),
              "p95": np.percentile(vm, 95, 0).tolist(),
              "share_le_real": [float((vm[:, c] <= real_x.mean(0)[c]).mean()) for c in range(NX)],
              "overall_takeup_nonleader": float(np.mean([Y[~v.leader].mean() for v, Y in zip(V, data[name][0])]))}
        J["process_profile"][name] = pp
        p(f"  process {name}: " + "; ".join(
            f"{n} {pp['mean'][c]:.3f} ({pp['p5'][c]:.3f}-{pp['p95'][c]:.3f}; real at or above "
            f"{pp['share_le_real'][c]:.3f})" for c, n in enumerate(BIN_NAMES))
            + f"; non-leader take-up {pp['overall_takeup_nonleader']:.3f}")
    J["real_profile"] = real_x.mean(0).tolist()
    J["real_takeup_nonleader"] = float(np.mean([y[~v.leader].mean() for v, y in zip(V, real_Y)]))
    p(f"  real non-leader take-up (mean over villages) {J['real_takeup_nonleader']:.3f}")

    # (c) recovery: four-family race (milestone 28) and five-family race, all five processes
    races = (("4", FAMS4), ("5", FAMS5))
    choice = {k_: {w: {d: {n: [] for n in FAMS5} for d in COLS} for w in WEIGHTS} for k_, _ in races}
    for name in FAMS5:
        Ys, Xs = data[name]
        dm8 = m25.data_moments(V, Ys)
        for r, D in enumerate(m3.divergences(V, M8, Pbar, Ys)):
            xr = Xs[:, r, :]
            Df = full(D, Msim, xr)
            own = np.c_[dm8[:, r, :], xr]
            for w in WEIGHTS:
                sc = scale_for(w, own, synth_scale)
                D0, D1 = Df[0] / sc, Df[1] / sc
                for dn, cols in COLS.items():
                    res = select(D0, D1, cols, FAMS5)
                    for k_, fams in races:
                        choice[k_][w][dn][name].append(
                            (min(fams, key=lambda f: res["Q"][f]), min(fams, key=lambda f: res["loo"][f])))
    p(f"\nselection done in {time.time() - t0:.0f} s")
    rec = {}
    for k_, fams in races:
        rec[k_] = {}
        for w in WEIGHTS:
            rec[k_][w] = {}
            for rule, ri in (("loo", 1), ("in-sample", 0)):
                rec[k_][w][rule] = {}
                p(f"\n## (c) recovery, {k_} families, {w} weights, rule {rule}")
                for dn in COLS:
                    conf = {n: {f: float(np.mean([c[ri] == f for c in choice[k_][w][dn][n]])) for f in fams}
                            for n in FAMS5}
                    row = {n: conf[n].get(n, float("nan")) for n in FAMS5}
                    low4 = min(row[n] for n in FAMS4)
                    rec[k_][w][rule][dn] = {"recovery": row, "confusion": conf, "lowest_ITRH": low4}
                    p(f"  {dn:4s}: " + "  ".join(f"{n} {row[n]:.3f}" for n in FAMS5)
                      + f"   lowest of I/T/R/H {low4:.3f}   ("
                      + "; ".join(f"{n}->" + "/".join(f"{conf[n][f]:.2f}" for f in fams) for n in FAMS5) + ")")
    J["recovery"] = rec

    p("\n## hypotheses")
    rs = J["real"]["sd-data"]["XS0"]
    l4 = [round(rs["loo"][f], 2) for f in FAMS4]
    rr4 = [round(rec["4"]["sd-data"]["loo"]["XS0"]["recovery"][f], 3) for f in FAMS4]
    ok = l4 == [13.39, 14.61, 13.81, 13.13] and rr4 == [0.815, 0.83, 0.895, 0.77]
    p(f"H105 (sanity: real sd-data XS0 LOO I/T/R/H = m28 13.39/14.61/13.81/13.13; 4-family recovery "
      f"0.815/0.830/0.895/0.770): {l4}, {rr4} -> {'held' if ok else 'REFUTED'}")
    lp = J["process_profile"]["L"]
    rx = real_x.mean(0)
    in2 = lp["p5"][2] <= rx[2] <= lp["p95"][2]
    in3 = lp["p5"][3] <= rx[3] <= lp["p95"][3]
    p(f"H106 (real [0.4,0.6) {rx[2]:.3f} in L band {lp['p5'][2]:.3f}-{lp['p95'][2]:.3f}: {in2}; real "
      f"[0.6,1] {rx[3]:.3f} in {lp['p5'][3]:.3f}-{lp['p95'][3]:.3f}: {in3}) -> "
      + ("held" if in2 and in3 else "refuted"))
    if rs["best_loo"] != "L":
        v107 = f"refuted (lowest is {rs['best_loo']})"
    else:
        mn = min(x["share_best_lower"] for x in rs["pairs"].values())
        v107 = f"min share {mn:.3f} -> " + ("held" if mn >= 0.95 else "refuted" if mn < 0.80 else "inconclusive")
    p(f"H107 (real sd-data XS0: L lowest LOO, lower than each other in >= 0.95 of draws): {v107}")
    h108 = rec["5"]["sd-data"]["loo"]["XS0"]["recovery"]["L"]
    p(f"H108 (L datasets recovered as L, 5 families, sd-data XS0 LOO, >= 0.80; refuted < 0.70): "
      f"{h108:.3f} -> " + ("held" if h108 >= 0.80 else "refuted" if h108 < 0.70 else "inconclusive"))
    lo4 = rec["4"]["sd-data"]["loo"]["XS0"]["lowest_ITRH"]
    lo5 = rec["5"]["sd-data"]["loo"]["XS0"]["lowest_ITRH"]
    p(f"H109 (lowest I/T/R/H recovery falls by <= 0.10 when L is added): {lo4:.3f} -> {lo5:.3f} -> "
      + ("held" if lo4 - lo5 <= 0.10 + 1e-9 else "refuted"))
    p(f"runtime {time.time() - t0:.0f} s")
    txt = "\n".join(out) + "\n"
    open(os.path.join(HERE, "results.txt"), "w").write(txt)
    J["synth_scale"] = synth_scale.tolist()
    json.dump(J, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    print(txt)


if __name__ == "__main__":
    main()
