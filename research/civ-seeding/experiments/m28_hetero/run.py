"""Milestone 28: a threshold drawn per household (H). Milestone 27 found the real villages' take-up
rising smoothly with the share of adopting neighbours, with no deterministic threshold step.
Each household here draws theta_i ~ Beta(mu kappa, (1 - mu) kappa). Does H reproduce the real
profile, do the real villages prefer it on held-out villages, and is it identified?
Plan and hypotheses H100 to H104 in LOG.md (2026-11-23, milestone 28), pushed before the run.

OMP_NUM_THREADS=1 python3 experiments/m28_hetero/run.py   (about 6 minutes on 4 cores)

Milestone 27's harness unchanged (milestone 3's 850-point grid, S = 75, seed 0 fits, seed 1
scores, designs X and XS0, weightings identity / sd-data / sd-synth), plus 750 H points.
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
FAMS4 = ("I", "T", "R", "H")
FAMS3 = ("I", "T", "R")
FIDX = {f: np.array([i for i, p in enumerate(POINTS) if p[0] == f]) for f in FAMS4}
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
    p("# Milestone 28: a heterogeneous (per-household Beta) threshold, family H")
    p(f"grid {len(POINTS)} points ({len(FIDX['H'])} H: mu {MU} x kappa {KAPPA}), S = {S}, seeds "
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
    rng = np.random.default_rng(2028)
    J["real"] = {}
    p("\n## (a) real data, four families (leave one village out; paired Bayesian bootstrap)")
    for w in WEIGHTS:
        sc = scale_for(w, own_real, synth_scale)
        J["real"][w] = {}
        for dn, cols in COLS.items():
            r = select(Dreal[0] / sc, Dreal[1] / sc, cols, FAMS4)
            best = min(FAMS4, key=lambda f: r["loo"][f])
            jj = {"arg": {f: label(r["arg"][f]) for f in FAMS4},
                  "Q": {f: float(r["Q"][f]) for f in FAMS4},
                  "loo": {f: float(r["loo"][f]) for f in FAMS4}, "best_loo": best,
                  "best_in_sample": min(FAMS4, key=lambda f: r["Q"][f]), "pairs": {},
                  "arg_idx": {f: r["arg"][f] for f in FAMS4}}
            line = (f"  {w:8s} {dn:4s}: LOO " + ", ".join(f"{f} {r['loo'][f]:.4f}" for f in FAMS4)
                    + f"; lowest {best}; in-sample Q " + ", ".join(f"{f} {r['Q'][f]:.4f}" for f in FAMS4)
                    + "\n      fits: " + "; ".join(jj["arg"][f] for f in FAMS4))
            for f in FAMS4:
                if f == best:
                    continue
                d = r["vill"][best] - r["vill"][f]
                share, ci = m25.bb_lower(d, rng, B_PAIRED)
                wins = int((r["vill"][f] < r["vill"][best]).sum())
                line += (f"\n      {best} vs {f}: lower in {share:.3f} of draws; mean diff "
                         f"{d.mean():+.4f} [{ci[0]:+.4f}, {ci[1]:+.4f}]; {f} better in {wins}/{G}")
                jj["pairs"][f] = {"share_best_lower": share, "mean_diff": float(d.mean()),
                                  "ci": ci.tolist(), "villages_other_better": wins}
            p(line)
            J["real"][w][dn] = jj

    # (b) the H process at its real sd-data XS0 in-sample fit
    hk = J["real"]["sd-data"]["XS0"]["arg_idx"]["H"]
    hpt = POINTS[hk]
    p(f"\n## (b) H process: {label(hk)} (real in-sample fit, sd-data XS0)")
    Ys = [sim(v, beta, hpt, R_DATA, np.random.default_rng([1003, v.village])) for v in V]
    data["H"] = (Ys, np.stack([ms.moments_share(v, Y) for v, Y in zip(V, Ys)]))
    J["H_process"] = {"label": label(hk), "mu": hpt[5][0], "kappa": hpt[5][1], "qN": hpt[1],
                      "qP": hpt[2]}
    p("  real, mean over villages: " + "; ".join(f"{n} {x:.3f}" for n, x in zip(BIN_NAMES, real_x.mean(0))))
    J["process_profile"] = {}
    for name in FAMS4:
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

    # (c) recovery
    choice = {k_: {w: {d: {n: [] for n in FAMS4} for d in COLS} for w in WEIGHTS} for k_ in ("3", "4")}
    for name in FAMS4:
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
                    res = select(D0, D1, cols, FAMS4)
                    for k_, fams in (("3", FAMS3), ("4", FAMS4)):
                        choice[k_][w][dn][name].append(
                            (min(fams, key=lambda f: res["Q"][f]), min(fams, key=lambda f: res["loo"][f])))
    p(f"\nselection done in {time.time() - t0:.0f} s")
    rec = {}
    for k_, fams in (("3", FAMS3), ("4", FAMS4)):
        rec[k_] = {}
        procs = FAMS4 if k_ == "4" else FAMS4  # H datasets are scored in the 3-family race too
        for w in WEIGHTS:
            rec[k_][w] = {}
            for rule, ri in (("loo", 1), ("in-sample", 0)):
                rec[k_][w][rule] = {}
                p(f"\n## (c) recovery, {k_} families, {w} weights, rule {rule}")
                for dn in COLS:
                    conf = {n: {f: float(np.mean([c[ri] == f for c in choice[k_][w][dn][n]])) for f in fams}
                            for n in procs}
                    row = {n: conf[n].get(n, float("nan")) for n in procs}
                    low_itr = min(row[n] for n in FAMS3)
                    rec[k_][w][rule][dn] = {"recovery": row, "confusion": conf, "lowest_ITR": low_itr}
                    p(f"  {dn:4s}: " + "  ".join(f"{n} {row[n]:.3f}" for n in procs)
                      + f"   lowest of I/T/R {low_itr:.3f}   ("
                      + "; ".join(f"{n}->" + "/".join(f"{conf[n][f]:.2f}" for f in fams) for n in procs) + ")")
    J["recovery"] = rec

    p("\n## hypotheses")
    r3 = J["real"]["sd-data"]["XS0"]["loo"]
    # three-family real numbers: the same losses, H left out
    l3 = [round(r3[f], 2) for f in FAMS3]
    rr3 = [round(rec["3"]["sd-data"]["loo"]["XS0"]["recovery"][f], 3) for f in FAMS3]
    ok = l3 == [13.39, 14.61, 13.81] and rr3 == [0.815, 0.995, 0.895]
    p(f"H100 (sanity: real sd-data XS0 LOO I/T/R = m27 13.39/14.61/13.81; 3-family recovery "
      f"0.815/0.995/0.895): {l3}, {rr3} -> {'held' if ok else 'REFUTED'}")
    hp = J["process_profile"]["H"]
    rx = real_x.mean(0)
    in2 = hp["p5"][2] <= rx[2] <= hp["p95"][2]
    in3 = hp["p5"][3] <= rx[3] <= hp["p95"][3]
    p(f"H101 (real [0.4,0.6) {rx[2]:.3f} in H band {hp['p5'][2]:.3f}-{hp['p95'][2]:.3f}: {in2}; real "
      f"[0.6,1] {rx[3]:.3f} in {hp['p5'][3]:.3f}-{hp['p95'][3]:.3f}: {in3}) -> "
      + ("held" if in2 and in3 else "refuted"))
    rs = J["real"]["sd-data"]["XS0"]
    if rs["best_loo"] != "H":
        v102 = f"refuted (lowest is {rs['best_loo']})"
    else:
        mn = min(x["share_best_lower"] for x in rs["pairs"].values())
        v102 = f"min share {mn:.3f} -> " + ("held" if mn >= 0.95 else "refuted" if mn < 0.80 else "inconclusive")
    p(f"H102 (real sd-data XS0: H lowest LOO, lower than each other in >= 0.95 of draws): {v102}")
    h103 = rec["4"]["sd-data"]["loo"]["XS0"]["recovery"]["H"]
    p(f"H103 (H datasets recovered as H, 4 families, sd-data XS0 LOO, >= 0.80; refuted < 0.70): "
      f"{h103:.3f} -> " + ("held" if h103 >= 0.80 else "refuted" if h103 < 0.70 else "inconclusive"))
    lo4 = rec["4"]["sd-data"]["loo"]["XS0"]["lowest_ITR"]
    lo3 = rec["3"]["sd-data"]["loo"]["XS0"]["lowest_ITR"]
    p(f"H104 (lowest I/T/R recovery falls by <= 0.10 when H is added): {lo3:.3f} -> {lo4:.3f} -> "
      + ("held" if lo3 - lo4 <= 0.10 + 1e-9 else "refuted"))
    p(f"runtime {time.time() - t0:.0f} s")
    txt = "\n".join(out) + "\n"
    open(os.path.join(HERE, "results.txt"), "w").write(txt)
    J["synth_scale"] = synth_scale.tolist()
    json.dump(J, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    print(txt)


if __name__ == "__main__":
    main()
