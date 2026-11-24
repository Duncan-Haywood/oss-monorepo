"""Milestone 31: does any contagion remain once homophily is in?
Milestone 29 found homophily (L: the information model plus a network-correlated latent
propensity, no influence of adopting neighbours on the decision) predicts the real villages
best, with its fit at two grid edges (rho = 8, delta = -0.5). This run (i) extends L past those
edges (family L+ = L's grid plus sigma 2.5, rho 32, delta -1.0) and (ii) adds a mixed family M:
L+'s latent propensity plus milestone 3's reinforcement (gamma * adopting neighbours in the
logit). Do the real villages prefer M over L+ on held-out villages, and could the race tell M from
L+ if M were true?
Plan and hypotheses H116 to H120 in LOG.md (2026-11-24, milestone 31), pushed before the run.

OMP_NUM_THREADS=1 python3 experiments/m31_mixed/run.py   (about 25 minutes on 4 cores)

Milestone 29's harness unchanged (S = 75, seed 0 fits, seed 1 scores, designs X and XS0,
weightings identity / sd-data / sd-synth, B = 2000 paired Bayesian bootstrap), grid extended.
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
# milestone 31: L past its edges (family L+ = L's points plus these) and the mixed family M
SIGMA2 = [0.5, 1.0, 1.5, 2.0, 2.5]
RHO2 = [0.5, 2.0, 8.0, 32.0]
LDELTA2 = [0.0, -0.5, -1.0]
POINTS += [("Lx", a, b, 0.0, d, (s_, r))
           for a, b, s_, r, d in itertools.product(m3.QN, m3.QP, SIGMA2, RHO2, LDELTA2)
           if not (s_ in SIGMA and r in RHO and d in LDELTA)]
MSIGMA = [1.0, 1.5, 2.0]
MRHO = [8.0, 32.0]
MDELTA = [-0.5, -1.0]
MGAMMA = [0.05, 0.10, 0.20]
POINTS += [("M", a, b, g, d, (s_, r))
           for a, b, s_, r, d, g in itertools.product(m3.QN, m3.QP, MSIGMA, MRHO, MDELTA, MGAMMA)]
if os.environ.get("M31_SMOKE"):   # crash test only: a thin grid and 3 datasets; never reported
    POINTS = POINTS[::37]
    R_DATA = 3
FAMS5 = ("I", "T", "R", "H", "L")
FAMS4 = ("I", "T", "R", "H")
FAMS6 = ("I", "T", "R", "H", "L+", "M")      # the race: L+ replaces L (L+ contains L's grid)
FAMS7 = ("I", "T", "R", "H", "L", "L+", "M")
FIDX = {f: np.array([i for i, p in enumerate(POINTS) if p[0] == f]) for f in ("I", "T", "R", "H", "L", "M")}
FIDX["L+"] = np.array([i for i, p in enumerate(POINTS) if p[0] in ("L", "Lx")])
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
    if f in ("L", "Lx"):
        return cx.simulate(v, beta, a, b, R, rng, delta=d, latent=t)
    if f == "M":
        return cx.simulate(v, beta, a, b, R, rng, gamma=g, delta=d, latent=t)
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
    if f in ("L", "Lx"):
        return f"L qN={a} qP={b} sigma={t[0]} rho={t[1]:g} delta={d}"
    if f == "M":
        return f"M qN={a} qP={b} sigma={t[0]} rho={t[1]:g} delta={d} gamma={g}"
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
    p("# Milestone 31: homophily past its grid edges (L+) and homophily plus reinforcement (M)")
    p(f"grid {len(POINTS)} points ({len(FIDX['H'])} H: mu {MU} x kappa {KAPPA}; {len(FIDX['L'])} L: "
      f"sigma {SIGMA} x rho {RHO} x delta {LDELTA}; {len(FIDX['L+'])} L+: sigma {SIGMA2} x rho {RHO2} x delta {LDELTA2}; "
      f"{len(FIDX['M'])} M: sigma {MSIGMA} x rho {MRHO} x delta {MDELTA} x gamma {MGAMMA}), S = {S}, seeds "
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
    rng = np.random.default_rng(2031)
    J["real"] = {}
    p("\n## (a) real data, seven families (L = milestone 29's grid; L+ = L's grid extended; M = L+'s latent "
      "propensity plus reinforcement); race over I, T, R, H, L+, M (leave one village out; paired Bayesian bootstrap)")
    for w in WEIGHTS:
        sc = scale_for(w, own_real, synth_scale)
        J["real"][w] = {}
        for dn, cols in COLS.items():
            r = select(Dreal[0] / sc, Dreal[1] / sc, cols, FAMS7)
            best = min(FAMS6, key=lambda f: r["loo"][f])
            jj = {"arg": {f: label(r["arg"][f]) for f in FAMS7},
                  "Q": {f: float(r["Q"][f]) for f in FAMS7},
                  "loo": {f: float(r["loo"][f]) for f in FAMS7}, "best_loo": best,
                  "best_in_sample": min(FAMS6, key=lambda f: r["Q"][f]), "pairs": {},
                  "arg_idx": {f: r["arg"][f] for f in FAMS7},
                  }
            line = (f"  {w:8s} {dn:4s}: LOO " + ", ".join(f"{f} {r['loo'][f]:.4f}" for f in FAMS7)
                    + f"; lowest of race {best}; in-sample Q " + ", ".join(f"{f} {r['Q'][f]:.4f}" for f in FAMS7)
                    + "\n      fits: " + "; ".join(jj["arg"][f] for f in FAMS7))
            pairs = [(best, f) for f in FAMS6 if f != best]
            for extra in (("M", "L+"), ("L+", "L")):
                if extra not in pairs:
                    pairs.append(extra)
            for a_, b_ in pairs:
                d = r["vill"][a_] - r["vill"][b_]
                share, ci = m25.bb_lower(d, rng, B_PAIRED)
                wins = int((r["vill"][b_] < r["vill"][a_]).sum())
                line += (f"\n      {a_} vs {b_}: lower in {share:.3f} of draws; mean diff "
                         f"{d.mean():+.4f} [{ci[0]:+.4f}, {ci[1]:+.4f}]; {b_} better in {wins}/{G}")
                jj["pairs"][f"{a_}-{b_}"] = {"share_first_lower": share, "mean_diff": float(d.mean()),
                                             "ci": ci.tolist(), "villages_second_better": wins}
            p(line)
            J["real"][w][dn] = jj

    # (b) the H, L+ and M processes at their real sd-data XS0 in-sample fits
    J["process_fit"] = {}
    for fam, sd in (("H", 1003), ("L+", 1005), ("M", 1006)):
        k = J["real"]["sd-data"]["XS0"]["arg_idx"][fam]
        p(f"\n## (b) {fam} process: {label(k)} (real in-sample fit, sd-data XS0)")
        Ys = [sim(v, beta, POINTS[k], R_DATA, np.random.default_rng([sd, v.village])) for v in V]
        data[fam] = (Ys, np.stack([ms.moments_share(v, Y) for v, Y in zip(V, Ys)]))
        J["process_fit"][fam] = label(k)
    p("  real, mean over villages: " + "; ".join(f"{n} {x:.3f}" for n, x in zip(BIN_NAMES, real_x.mean(0))))
    J["process_profile"] = {}
    for name in FAMS6:
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

    # (c) recovery: the six-family race at all six processes; also how often M's chosen gamma is > 0
    choice = {w: {d: {n: [] for n in FAMS6} for d in COLS} for w in WEIGHTS}
    for name in FAMS6:
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
                    res = select(D0, D1, cols, FAMS6)
                    choice[w][dn][name].append(
                        (min(FAMS6, key=lambda f: res["Q"][f]), min(FAMS6, key=lambda f: res["loo"][f]),
                         # nested M-vs-L+ LOO comparison on this dataset (the real-data H118 contrast)
                         float(res["loo"]["M"] - res["loo"]["L+"])))
    p(f"\nselection done in {time.time() - t0:.0f} s")
    rec = {}
    for w in WEIGHTS:
        rec[w] = {}
        for rule, ri in (("loo", 1), ("in-sample", 0)):
            rec[w][rule] = {}
            p(f"\n## (c) recovery, 6 families, {w} weights, rule {rule}")
            for dn in COLS:
                conf = {n: {f: float(np.mean([c[ri] == f for c in choice[w][dn][n]])) for f in FAMS6}
                        for n in FAMS6}
                row = {n: conf[n][n] for n in FAMS6}
                mx = {n: float(np.mean([c[2] < 0 for c in choice[w][dn][n]])) for n in ("L+", "M")}
                rec[w][rule][dn] = {"recovery": row, "confusion": conf, "M_loo_below_Lplus": mx}
                p(f"  {dn:4s}: " + "  ".join(f"{n} {row[n]:.3f}" for n in FAMS6)
                  + "   (" + "; ".join(f"{n}->" + "/".join(f"{conf[n][f]:.2f}" for f in FAMS6) for n in FAMS6)
                  + f"); M LOO below L+ on L+ data {mx['L+']:.3f}, on M data {mx['M']:.3f}")
    J["recovery"] = rec

    p("\n## hypotheses")
    rs = J["real"]["sd-data"]["XS0"]
    l5 = [round(rs["loo"][f], 2) for f in FAMS5]
    ok = l5 == [13.39, 14.61, 13.81, 13.13, 11.86] and rs["arg"]["L"] == "L qN=0.1 qP=0.2 sigma=1.5 rho=8 delta=-0.5"
    p(f"H116 (sanity: real sd-data XS0 LOO I/T/R/H/L = m29 13.39/14.61/13.81/13.13/11.86, L fit unchanged): "
      f"{l5}, {rs['arg']['L']} -> {'held' if ok else 'REFUTED'}")
    p(f"H117 (the edges hid little: L+ LOO >= L LOO - 0.5): L+ {rs['loo']['L+']:.4f} ({rs['arg']['L+']}), "
      f"L {rs['loo']['L']:.4f} -> " + ("held" if rs["loo"]["L+"] >= rs["loo"]["L"] - 0.5 else "refuted"))
    mxs = rs["pairs"]["M-L+"]["share_first_lower"]
    p(f"H118 (no contagion remains: M lower than L+ in < 0.80 of draws; >= 0.95 refutes): {mxs:.3f}, "
      f"M fit {rs['arg']['M']} -> " + ("held" if mxs < 0.80 else "refuted" if mxs >= 0.95 else "inconclusive"))
    h119 = rec["sd-data"]["loo"]["XS0"]["recovery"]["M"]
    p(f"H119 (power: M datasets called M, 6 families, sd-data XS0 LOO, >= 0.70; refuted < 0.50): {h119:.3f} -> "
      + ("held" if h119 >= 0.70 else "refuted" if h119 < 0.50 else "inconclusive"))
    h120 = rec["sd-data"]["loo"]["XS0"]["recovery"]["L+"]
    p(f"H120 (L+ datasets called L+, >= 0.70; refuted < 0.50): {h120:.3f} -> "
      + ("held" if h120 >= 0.70 else "refuted" if h120 < 0.50 else "inconclusive"))
    p(f"runtime {time.time() - t0:.0f} s")
    txt = "\n".join(out) + "\n"
    open(os.path.join(HERE, "results.txt"), "w").write(txt)
    J["synth_scale"] = synth_scale.tolist()
    json.dump(J, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    print(txt)


if __name__ == "__main__":
    main()
