"""Milestone 27: take-up by the *share* of adopting neighbours, without the awareness question.
Milestone 26 found that take-up among the aware, binned by the share of adopting neighbours,
identifies the information (I), threshold (T) and reinforcement (R-delta) models. The real BCDJ
survey has no awareness question, but it does record who adopted and the network, so the same
share bins over *all* non-leaders can be computed on the 43 real villages. Does that moment still
identify the model, and what do the real villages say with it?
Plan and hypotheses H95 to H99 in LOG.md (2026-11-23, milestone 27), pushed before the run.

python3 experiments/m27_share_real/run.py   (about 4 minutes on 4 cores; writes results.txt, results.json)

Milestone 3's harness unchanged (850-point grid, S = 75, seed 0 fits, seed 1 scores, the three
identity-fit processes and their 200 datasets per process from the same seeds). Designs:
X (ext8, milestone 3) and XS0 (ext8 + the four share bins over all non-leaders, 12 moments).
Weightings: identity; sd-data (primary: SD across the dataset's own 43 villages, milestone 25);
sd-synth (SD across the synthetic villages of the three processes, milestone 24).
"""
import importlib.util
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

POINTS, FAMS, DGP, SEEDS, S, R_DATA = m3.POINTS, m3.FAMS, m3.DGP, m3.SEEDS, m3.S, m3.R_DATA
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


def _job(args):
    k, seed = args
    _f, a, b, g, d, t = POINTS[k]
    M = np.zeros((len(_V), 8 + NX))
    pbar = []
    for j, v in enumerate(_V):
        rng = np.random.default_rng([seed, v.village])
        Y = cx.simulate(v, _BETA, a, b, S, rng, gamma=g, theta=t, delta=d)
        M[j, :8] = cx.moments_ext(v, Y).mean(0)
        M[j, 8:] = ms.moments_share(v, Y).mean(0)
        pbar.append(Y.mean(1))
    return k, seed, M, np.concatenate(pbar)


def full(D8, Msim, xr):
    """Append the share-moment divergences (simulated minus data) to milestone 3's D."""
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
    p("# Milestone 27: take-up by share of adopting neighbours, without awareness")
    p(f"milestone 3 harness: grid {len(POINTS)} points, S = {S}, seeds {SEEDS}, {R_DATA} datasets "
      f"per process; share bins {ms.SHARE_BINS}; confusion rows list the share choosing I/T/R")
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
    M8 = {s: Msim[s][:, :, :8] for s in SEEDS}
    p(f"grid simulated in {time.time() - t0:.0f} s")

    # synthetic datasets: milestone 3's, same seeds
    data = {}
    for di, (name, par) in enumerate(DGP.items()):
        Ys = [cx.simulate(v, beta, par["qN"], par["qP"], R_DATA,
                          np.random.default_rng([1000 + di, v.village]), gamma=par["gamma"],
                          theta=par["theta"], delta=par["delta"]) for v in V]
        data[name] = (Ys, np.stack([ms.moments_share(v, Y) for v, Y in zip(V, Ys)]))  # G x R x 4

    allE = np.concatenate([np.concatenate([cx.moments_ext(v, Y) for v, Y in zip(V, data[n][0])])
                           for n in DGP])
    allX = np.concatenate([data[n][1].reshape(-1, NX) for n in DGP])
    synth_scale = np.r_[m25.safe_sd(allE), m25.safe_sd(allX)]

    # real data: the share profile and its counts
    real_Y = [v.takeup.astype(float) for v in V]
    real_x = np.stack([ms.moments_share(v, y) for v, y in zip(V, real_Y)])      # G x 4
    real_cnt = np.stack([ms.share_counts(v, y[:, None])[0] for v, y in zip(V, real_Y)])
    pooled = np.zeros(NX)
    for c, (lo, hi) in enumerate(ms.SHARE_BINS):
        a = h = 0
        for v, y in zip(V, real_Y):
            sh = (v.A @ y) / np.maximum(v.deg, 1)
            m = (~v.leader) & (sh >= lo) & (sh <= hi)
            a += y[m].sum()
            h += m.sum()
        pooled[c] = a / max(h, 1)
    p("\n## the share profile: take-up among non-leaders by share of adopting neighbours")
    p("  real, mean over villages: " + "; ".join(f"{n} {x:.3f}" for n, x in zip(BIN_NAMES, real_x.mean(0))))
    p("  real, pooled households:  " + "; ".join(f"{n} {x:.3f}" for n, x in zip(BIN_NAMES, pooled)))
    p("  real households per bin (sum over villages): " + ", ".join(str(int(c)) for c in real_cnt.sum(0))
      + f"; villages with an empty bin: " + ", ".join(str(int((real_cnt[:, c] == 0).sum())) for c in range(NX)))
    J["real_profile"] = {"village_mean": real_x.mean(0).tolist(), "pooled": pooled.tolist(),
                         "households": real_cnt.sum(0).tolist(),
                         "villages_empty": [int((real_cnt[:, c] == 0).sum()) for c in range(NX)]}
    J["process_profile"] = {}
    for name in DGP:
        vm = data[name][1].mean(0)                       # R x 4, mean over villages
        J["process_profile"][name] = {
            "mean": vm.mean(0).tolist(), "p5": np.percentile(vm, 5, 0).tolist(),
            "p95": np.percentile(vm, 95, 0).tolist(),
            "share_le_real": [float((vm[:, c] <= real_x.mean(0)[c]).mean()) for c in range(NX)]}
        pp = J["process_profile"][name]
        p(f"  process {name}: " + "; ".join(
            f"{n} {pp['mean'][c]:.3f} ({pp['p5'][c]:.3f}-{pp['p95'][c]:.3f}; real at or above "
            f"{pp['share_le_real'][c]:.3f})" for c, n in enumerate(BIN_NAMES)))

    # (a) recovery at the identity processes
    choice = {w: {d: {n: [] for n in DGP} for d in COLS} for w in WEIGHTS}
    looL = {w: {d: {n: [] for n in DGP} for d in COLS} for w in WEIGHTS}
    for name in DGP:
        Ys, Xs = data[name]
        dm8 = m25.data_moments(V, Ys)                                 # G x R x 8
        for r, D in enumerate(m3.divergences(V, M8, Pbar, Ys)):
            xr = Xs[:, r, :]
            Df = full(D, Msim, xr)
            own = np.c_[dm8[:, r, :], xr]
            for w in WEIGHTS:
                sc = scale_for(w, own, synth_scale)
                for dn, cols in COLS.items():
                    res = m3.select(Df[0] / sc, Df[1] / sc, cols)
                    choice[w][dn][name].append((min(FAMS, key=lambda f: res["Q"][f]),
                                                min(FAMS, key=lambda f: res["loo"][f])))
                    looL[w][dn][name].append({f: float(res["loo"][f]) for f in FAMS})
    p(f"\nselection done in {time.time() - t0:.0f} s")
    rec = {}
    for w in WEIGHTS:
        rec[w] = {}
        for rule, ri in (("loo", 1), ("in-sample", 0)):
            rec[w][rule] = {}
            p(f"\n## (a) recovery, {w} weights, rule {rule}, 43 villages")
            for dn in COLS:
                conf = {n: {f: float(np.mean([c[ri] == f for c in choice[w][dn][n]])) for f in FAMS}
                        for n in DGP}
                row = {n: conf[n][n] for n in DGP}
                rec[w][rule][dn] = {"recovery": row, "confusion": conf, "lowest": min(row.values())}
                p(f"  {dn:4s}: " + "  ".join(f"{n} {row[n]:.3f}" for n in DGP)
                  + f"   lowest {min(row.values()):.3f}   ("
                  + "; ".join(f"{n}->" + "/".join(f"{conf[n][f]:.2f}" for f in FAMS) for n in DGP) + ")")
    J["recovery"] = rec

    # (b) the real villages
    dm_real = m25.data_moments(V, [y[:, None] for y in real_Y])[:, 0, :]
    Dreal = full(next(m3.divergences(V, M8, Pbar, [y[:, None] for y in real_Y])), Msim, real_x)
    own_real = np.c_[dm_real, real_x]
    rng = np.random.default_rng(2027)
    J["real"] = {}
    p("\n## (b) real data (leave one village out; paired Bayesian bootstrap over villages)")
    for w in WEIGHTS:
        sc = scale_for(w, own_real, synth_scale)
        J["real"][w] = {}
        for dn, cols in COLS.items():
            r = m3.select(Dreal[0] / sc, Dreal[1] / sc, cols)
            best = min(FAMS, key=lambda f: r["loo"][f])
            jj = {"arg": {f: m3.label(r["arg"][f]) for f in FAMS},
                  "Q": {f: float(r["Q"][f]) for f in FAMS},
                  "loo": {f: float(r["loo"][f]) for f in FAMS}, "best_loo": best,
                  "best_in_sample": min(FAMS, key=lambda f: r["Q"][f]), "pairs": {}}
            line = (f"  {w:8s} {dn:4s}: LOO " + ", ".join(f"{f} {r['loo'][f]:.4f}" for f in FAMS)
                    + f"; lowest {best}; in-sample lowest {jj['best_in_sample']} ("
                    + "; ".join(jj["arg"][f] for f in FAMS) + ")")
            for f in FAMS:
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

    # (c) the real LOO differences against each process's synthetic spread
    p("\n## (c) real LOO loss differences (T - I, R - I) against each process's synthetic spread")
    J["position"] = {}
    for w in WEIGHTS:
        J["position"][w] = {}
        for dn in COLS:
            rr = J["real"][w][dn]["loo"]
            J["position"][w][dn] = {}
            parts = []
            for name in DGP:
                L_ = looL[w][dn][name]
                for f in ("T", "R"):
                    x = np.array([l[f] - l["I"] for l in L_])
                    real = rr[f] - rr["I"]
                    sh = float((x <= real).mean())
                    J["position"][w][dn].setdefault(name, {})[f] = {
                        "real": real, "p5": float(np.percentile(x, 5)),
                        "p95": float(np.percentile(x, 95)), "share_le_real": sh}
                parts.append(f"{name}: T-I {J['position'][w][dn][name]['T']['share_le_real']:.3f}, "
                             f"R-I {J['position'][w][dn][name]['R']['share_le_real']:.3f}")
            p(f"  {w:8s} {dn:4s}: share of each process's datasets at or below the real difference: "
              + "; ".join(parts))

    p("\n## hypotheses")
    L = {w: rec[w]["loo"] for w in WEIGHTS}
    r3 = lambda d: [round(d[f], 3) for f in FAMS]  # noqa: E731
    ri = J["real"]["identity"]["X"]["loo"]
    ok95 = (r3(L["identity"]["X"]["recovery"]) == [0.585, 0.82, 0.555]
            and r3(L["sd-data"]["X"]["recovery"]) == [0.69, 0.815, 0.79]
            and [round(ri[f], 4) for f in FAMS] == [0.1742, 0.1837, 0.1906])
    p(f"H95 (sanity: identity X = m3 0.585/0.820/0.555, sd-data X = m25 0.690/0.815/0.790, real "
      f"identity LOO I 0.1742 T 0.1837 R 0.1906): {r3(L['identity']['X']['recovery'])}, "
      f"{r3(L['sd-data']['X']['recovery'])}, {[round(ri[f], 4) for f in FAMS]} -> "
      f"{'held' if ok95 else 'REFUTED'}")
    lo96 = L["sd-data"]["XS0"]["lowest"]
    p(f"H96 (XS0, sd-data: lowest >= 0.80; refuted below 0.70): {lo96:.3f} -> "
      + ("held" if lo96 >= 0.80 else "refuted" if lo96 < 0.70 else "inconclusive"))
    lo97 = L["sd-data"]["X"]["lowest"]
    p(f"H97 (XS0 lowest >= X lowest + 0.05, sd-data): {lo96:.3f} vs {lo97:.3f} -> "
      + ("held" if lo96 >= lo97 + 0.05 - 1e-9 else "refuted"))
    rs = J["real"]["sd-data"]["XS0"]
    mn = min(v_["share_best_lower"] for v_ in rs["pairs"].values())
    p(f"H98 (real, XS0, sd-data: best {rs['best_loo']} lower in >= 0.95 of draws against each; "
      f"refuted below 0.80): min {mn:.3f} -> "
      + ("held" if mn >= 0.95 else "refuted" if mn < 0.80 else "inconclusive"))
    tp = J["process_profile"]["T"]
    top_real = real_x.mean(0)[3]
    p(f"H99 (real top-bin take-up below the threshold process's 5th percentile): real {top_real:.3f}, "
      f"T 5th pct {tp['p5'][3]:.3f} -> " + ("held" if top_real < tp["p5"][3] else "refuted"))
    p(f"runtime {time.time() - t0:.0f} s")
    txt = "\n".join(out) + "\n"
    open(os.path.join(HERE, "results.txt"), "w").write(txt)
    J["synth_scale"] = synth_scale.tolist()
    J["share_bins"] = ms.SHARE_BINS
    json.dump(J, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    print(txt)


if __name__ == "__main__":
    main()
