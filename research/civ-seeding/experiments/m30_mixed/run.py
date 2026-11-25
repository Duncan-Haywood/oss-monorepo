"""Milestone 30: once homophily is in, does any influence of adopting neighbours remain?
Milestone 29 found homophily with no adoption influence (L) fits the real share profile and predicts
held-out villages best, with its fit at two grid edges (rho = 8, delta = -0.5). This run extends L
(L+ = milestone 29's L points plus 36 new shapes: sigma up to 2.5, rho 32, delta -1) and adds a
mixed family LR: the same latent field plus reinforcement gamma * k in the logit.
Plan and hypotheses H110 to H114 in LOG.md (2026-11-25, milestone 30), committed before the run.

OMP_NUM_THREADS=1 python3 experiments/m30_mixed/run.py   (about 30 to 40 minutes on 4 cores)

Milestone 29's harness unchanged (S = 75, seed 0 fits, seed 1 scores, designs X and XS0,
weightings identity / sd-data / sd-synth), grid 2800 (milestone 29) + 1800 (L+) + 2700 (LR).
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
N29 = len(POINTS)
SIGMA_X = [0.5, 1.0, 1.5, 2.0, 2.5]
RHO_X = [0.5, 2.0, 8.0, 32.0]
DELTA_X = [0.0, -0.5, -1.0]
POINTS += [("LX", a, b, 0.0, d, (s, r))
           for a, b, s, r, d in itertools.product(m3.QN, m3.QP, SIGMA_X, RHO_X, DELTA_X)
           if not (s in SIGMA and r in RHO and d in LDELTA)]
SIGMA_M = [1.0, 1.5, 2.0]
RHO_M = [8.0, 32.0]
GAMMA_M = [0.05, 0.10, 0.20]
DELTA_M = [-0.5, -1.0, -1.5]
POINTS += [("LR", a, b, g, d, (s, r))
           for a, b, s, r, g, d in itertools.product(m3.QN, m3.QP, SIGMA_M, RHO_M, GAMMA_M, DELTA_M)]
_TAG = {"I": ("I",), "T": ("T",), "R": ("R",), "H": ("H",), "L": ("L",), "L+": ("L", "LX"),
        "LR": ("LR",)}
FIDX = {f: np.array([i for i, p in enumerate(POINTS) if p[0] in tags]) for f, tags in _TAG.items()}
FAMS5 = ("I", "T", "R", "H", "L")            # milestone 29's race (sanity)
FAMS7 = ("I", "T", "R", "H", "L", "L+", "LR")  # real-data report
FAMS6 = ("I", "T", "R", "H", "L+", "LR")      # recovery race (L is a subset of L+)
PROCS = ("I", "R", "L+", "LR")
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
    if f in ("L", "LX"):
        return cx.simulate(v, beta, a, b, R, rng, delta=d, latent=t)
    if f == "LR":
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
    if f in ("L", "LX"):
        return f"L+ qN={a} qP={b} sigma={t[0]} rho={t[1]:g} delta={d}"
    if f == "LR":
        return f"LR qN={a} qP={b} sigma={t[0]} rho={t[1]:g} gamma={g} delta={d}"
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


def pairs(r, a, others, rng, G):
    """Paired Bayesian bootstrap of family a against each of others: share of draws a is lower."""
    out = {}
    for f in others:
        d = r["vill"][a] - r["vill"][f]
        share, ci = m25.bb_lower(d, rng, B_PAIRED)
        out[f] = {"share_lower": share, "mean_diff": float(d.mean()), "ci": ci.tolist(),
                  "villages_other_better": int((r["vill"][f] < r["vill"][a]).sum())}
    return out


def main():
    t0 = time.time()
    V = bcdj.load()
    beta = bcdj.leader_logit(V)[0]
    G = len(V)
    out, J = [], {}
    p = out.append
    p("# Milestone 30: homophily extended (L+) and homophily plus reinforcement (LR)")
    p(f"grid {len(POINTS)} points (milestone 29's {N29}; L+ {len(FIDX['L+'])} incl. "
      f"{len(FIDX['L'])} of milestone 29: sigma {SIGMA_X} x rho {RHO_X} x delta {DELTA_X}; "
      f"LR {len(FIDX['LR'])}: sigma {SIGMA_M} x rho {RHO_M} x gamma {GAMMA_M} x delta {DELTA_M}), "
      f"S = {S}, seeds {SEEDS}, {R_DATA} datasets per process; share bins {ms.SHARE_BINS}")
    offs = np.r_[0, np.cumsum([v.n for v in V])]
    Msim = {s: np.zeros((len(POINTS), G, 8 + NX)) for s in SEEDS}
    pb = {s: np.zeros((len(POINTS), offs[-1]), np.float32) for s in SEEDS}
    with ProcessPoolExecutor(4, initializer=_init) as ex:
        for k, seed, M, pbar in ex.map(_job, [(k, s) for s in SEEDS for k in range(len(POINTS))],
                                       chunksize=4):
            Msim[seed][k] = M
            pb[seed][k] = pbar
    Pbar = {s: [pb[s][:, offs[g]:offs[g + 1]].astype(float) for g in range(G)] for s in SEEDS}
    del pb
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
    rng = np.random.default_rng(2030)
    J["real"] = {}
    p("\n## (a) real data (leave one village out; paired Bayesian bootstrap)")
    for w in WEIGHTS:
        sc = scale_for(w, own_real, synth_scale)
        J["real"][w] = {}
        for dn, cols in COLS.items():
            r = select(Dreal[0] / sc, Dreal[1] / sc, cols, FAMS7)
            best6 = min(FAMS6, key=lambda f: r["loo"][f])
            jj = {"arg": {f: label(r["arg"][f]) for f in FAMS7},
                  "arg_idx": {f: r["arg"][f] for f in FAMS7},
                  "Q": {f: float(r["Q"][f]) for f in FAMS7},
                  "loo": {f: float(r["loo"][f]) for f in FAMS7}, "best_loo_6": best6,
                  "best_in_sample_6": min(FAMS6, key=lambda f: r["Q"][f]),
                  "LR_vs": pairs(r, "LR", [f for f in FAMS6 if f != "LR"], rng, G),
                  "Lplus_vs": pairs(r, "L+", [f for f in FAMS6 if f != "L+"], rng, G)}
            p(f"  {w:8s} {dn:4s}: LOO " + ", ".join(f"{f} {r['loo'][f]:.4f}" for f in FAMS7)
              + f"; lowest of six {best6}; in-sample Q " + ", ".join(f"{f} {r['Q'][f]:.4f}" for f in FAMS7)
              + "\n      fits: " + "; ".join(jj["arg"][f] for f in FAMS7)
              + "\n      LR lower than: " + "; ".join(
                  f"{f} {x['share_lower']:.3f} ({x['mean_diff']:+.3f} [{x['ci'][0]:+.3f}, {x['ci'][1]:+.3f}])"
                  for f, x in jj["LR_vs"].items())
              + "\n      L+ lower than: " + "; ".join(
                  f"{f} {x['share_lower']:.3f} ({x['mean_diff']:+.3f} [{x['ci'][0]:+.3f}, {x['ci'][1]:+.3f}])"
                  for f, x in jj["Lplus_vs"].items()))
            J["real"][w][dn] = jj

    # (b) the L+ and LR processes at their real sd-data XS0 in-sample fits
    J["process_fit"] = {}
    for fam, sd in (("L+", 1005), ("LR", 1006)):
        k = J["real"]["sd-data"]["XS0"]["arg_idx"][fam]
        p(f"\n## (b) {fam} process: {label(k)} (real in-sample fit, sd-data XS0)")
        Ys = [sim(v, beta, POINTS[k], R_DATA, np.random.default_rng([sd, v.village])) for v in V]
        data[fam] = (Ys, np.stack([ms.moments_share(v, Y) for v, Y in zip(V, Ys)]))
        J["process_fit"][fam] = label(k)
    p("  real, mean over villages: " + "; ".join(f"{n} {x:.3f}" for n, x in zip(BIN_NAMES, real_x.mean(0))))
    J["process_profile"] = {}
    for name in PROCS:
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

    # (c) recovery in the six-family race, four processes
    choice = {w: {d: {n: [] for n in PROCS} for d in COLS} for w in WEIGHTS}
    for name in PROCS:
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
                    choice[w][dn][name].append((min(FAMS6, key=lambda f: res["Q"][f]),
                                                min(FAMS6, key=lambda f: res["loo"][f])))
        p(f"  recovery for process {name} done at {time.time() - t0:.0f} s")
    rec = {}
    for w in WEIGHTS:
        rec[w] = {}
        for rule, ri in (("loo", 1), ("in-sample", 0)):
            rec[w][rule] = {}
            p(f"\n## (c) recovery, six families {FAMS6}, {w} weights, rule {rule}")
            for dn in COLS:
                conf = {n: {f: float(np.mean([c[ri] == f for c in choice[w][dn][n]])) for f in FAMS6}
                        for n in PROCS}
                row = {n: conf[n][n] for n in PROCS}
                rec[w][rule][dn] = {"recovery": row, "confusion": conf}
                p(f"  {dn:4s}: " + "  ".join(f"{n} {row[n]:.3f}" for n in PROCS) + "   ("
                  + "; ".join(f"{n}->" + "/".join(f"{conf[n][f]:.2f}" for f in FAMS6) for n in PROCS) + ")")
    J["recovery"] = rec

    p("\n## hypotheses")
    rs = J["real"]["sd-data"]["XS0"]
    l5 = [round(rs["loo"][f], 2) for f in FAMS5]
    p(f"H110 (sanity: real sd-data XS0 LOO I/T/R/H/L = m29 13.39/14.61/13.81/13.13/11.86): {l5} -> "
      + ("held" if l5 == [13.39, 14.61, 13.81, 13.13, 11.86] else "REFUTED"))
    f_l = POINTS[rs["arg_idx"]["L+"]]
    interior = f_l[5][1] != max(RHO_X) and f_l[4] != min(DELTA_X)
    p(f"H111 (L+ real fit interior in rho and delta): {label(rs['arg_idx']['L+'])} -> "
      + ("held" if interior else "refuted (at an edge)"))
    sh = rs["LR_vs"]["L+"]["share_lower"]
    p(f"H112 (LR below L+ in >= 0.95 of draws; refuted < 0.80): {sh:.3f} -> "
      + ("held" if sh >= 0.95 else "refuted" if sh < 0.80 else "inconclusive"))
    rr = rec["sd-data"]["loo"]["XS0"]["recovery"]
    lo = min(rr["LR"], rr["L+"])
    p(f"H113 (LR and L+ each recovered >= 0.80, sd-data XS0 LOO; refuted < 0.70): LR {rr['LR']:.3f}, "
      f"L+ {rr['L+']:.3f} -> " + ("held" if lo >= 0.80 else "refuted" if lo < 0.70 else "inconclusive"))
    rx = real_x.mean(0)
    ok = {}
    for fam in ("L+", "LR"):
        pp = J["process_profile"][fam]
        ok[fam] = all(pp["p5"][c] <= rx[c] <= pp["p95"][c] for c in (2, 3))
    p(f"H114 (real [0.4,0.6) and [0.6,1] inside the L+ and LR bands): L+ {ok['L+']}, LR {ok['LR']} -> "
      + ("held" if all(ok.values()) else "refuted"))
    p(f"runtime {time.time() - t0:.0f} s")
    txt = "\n".join(out) + "\n"
    open(os.path.join(HERE, "results.txt"), "w").write(txt)
    J["synth_scale"] = synth_scale.tolist()
    json.dump(J, open(os.path.join(HERE, "results.json"), "w"), indent=1, default=int)
    print(txt)


if __name__ == "__main__":
    main()
