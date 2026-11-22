"""Milestone 25: refit the real villages with scaled moments. Does the leave-one-village-out
comparison of the information (I), threshold (T) and reinforcement (R-delta) models change once
each moment is divided by its spread, and can that scale come from the data alone?
Plan and hypotheses H85 to H89 in LOG.md (2026-11-22, milestone 25), pushed before the run.

python3 experiments/m25_scaled/run.py   (about 4 minutes on 4 cores; writes results.txt, results.json)

Weightings of the eight extended moments (milestone 3's ext8):
  identity   milestone 3's criterion
  sd-data    each moment divided by its SD across the dataset's own villages (primary)
  sd-synth   milestone 24's scale: SD across the synthetic villages of the three identity processes
  two-step   real data only: inverse covariance of the village divergences at the identity I fit
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
from civ_seeding import bcdj, complex as cx  # noqa: E402
import run as m3  # noqa: E402

POINTS, FAMS, DGP, SEEDS, S, R_DATA = m3.POINTS, m3.FAMS, m3.DGP, m3.SEEDS, m3.S, m3.R_DATA
COLS = slice(0, 8)
B_PAIRED = 2000
SEED_BASE_REFIT = 2000           # datasets from the processes refitted under sd-data
WEIGHTS = ("identity", "sd-data", "sd-synth")


def data_moments(V, Ydata):
    """G x R x 8 data moments, with moments 2 and 3 on each dataset's own leader take-up
    (as m3.divergences builds them)."""
    out = []
    for v, Y in zip(V, Ydata):
        d = cx.moments_ext(v, Y)
        for c, mask in zip((1, 2), m3.leader_masks(v, Y)):
            d[:, c] = (Y * mask).sum(0) / np.maximum(mask.sum(0), 1)
        out.append(d)
    return np.stack(out)


def safe_sd(X, axis=0):
    s = X.std(axis)
    return np.where(s == 0, 1.0, s)


def scaled(D, scale):
    return {s: D[s] / scale for s in SEEDS}


def whitened(D, L):
    return {s: D[s] @ L for s in SEEDS}


def winner(res, rule):
    return min(FAMS, key=lambda f: res[rule][f])


def bb_lower(d, rng, B):
    """Share of Bayesian-bootstrap draws (exponential village weights) in which the weighted mean
    of d is below 0, and the 95% interval of the weighted mean."""
    W = rng.exponential(1.0, (B, len(d)))
    m = (W * d).sum(1) / W.sum(1)
    return float((m < 0).mean()), np.percentile(m, [2.5, 97.5])


def recovery(V, Msim, Pbar, datasets, synth_scale):
    """For each process: per weighting, the list of (in-sample, LOO) choices and per-dataset
    LOO losses per family (for the real-data comparison)."""
    out = {w: {} for w in WEIGHTS}
    for name, Yd in datasets.items():
        dm = data_moments(V, Yd)                       # G x R x 8
        for w in WEIGHTS:
            out[w][name] = {"choice": [], "loo": []}
        for r, D in enumerate(m3.divergences(V, Msim, Pbar, Yd)):
            for w in WEIGHTS:
                if w == "identity":
                    Dw = D
                elif w == "sd-data":
                    Dw = scaled(D, safe_sd(dm[:, r, :]))
                else:
                    Dw = scaled(D, synth_scale)
                res = m3.select(Dw[0], Dw[1], COLS)
                out[w][name]["choice"].append((winner(res, "Q"), winner(res, "loo")))
                out[w][name]["loo"].append({f: float(res["loo"][f]) for f in FAMS})
    return out


def rec_table(rec, p, title):
    summ = {}
    for w in WEIGHTS:
        summ[w] = {}
        for rule, ri in (("loo", 1), ("in-sample", 0)):
            row = {}
            conf = {}
            for name in rec[w]:
                ch = [c[ri] for c in rec[w][name]["choice"]]
                conf[name] = {f: float(np.mean([c == f for c in ch])) for f in FAMS}
                row[name] = conf[name][name]
            summ[w][rule] = {"recovery": row, "confusion": conf, "lowest": min(row.values())}
            p(f"{title} | {w:8s} {rule:9s}: " + "  ".join(f"{n} {x:.3f}" for n, x in row.items())
              + f"   lowest {min(row.values()):.3f}   confusion "
              + "; ".join(f"{n}->" + "/".join(f"{conf[n][f]:.2f}" for f in FAMS) for n in conf))
    return summ


def main():
    t0 = time.time()
    V = bcdj.load()
    beta = bcdj.leader_logit(V)[0]
    G = len(V)
    out = []
    p = out.append
    J = {}
    p("# Milestone 25: the real villages refitted with scaled moments")
    p(f"milestone 3 harness: grid {len(POINTS)} points, S = {S}, seeds {SEEDS}, {R_DATA} datasets "
      f"per process; moments ext8; confusion rows list the share choosing I/T/R")

    sizes = [v.n for v in V]
    offs = np.r_[0, np.cumsum(sizes)]
    Msim = {s: np.zeros((len(POINTS), G, 8)) for s in SEEDS}
    pb = {s: np.zeros((len(POINTS), offs[-1])) for s in SEEDS}
    with ProcessPoolExecutor(4, initializer=m3._init) as ex:
        for k, seed, M, pbar in ex.map(m3._job, [(k, s) for s in SEEDS for k in range(len(POINTS))],
                                       chunksize=4):
            Msim[seed][k] = M
            pb[seed][k] = pbar
    Pbar = {s: [pb[s][:, offs[g]:offs[g + 1]] for g in range(G)] for s in SEEDS}
    p(f"grid simulated in {time.time() - t0:.0f} s")

    def make(dgp, base):
        return {name: [cx.simulate(v, beta, par["qN"], par["qP"], R_DATA,
                                   np.random.default_rng([base + di, v.village]),
                                   gamma=par["gamma"], theta=par["theta"], delta=par["delta"])
                       for v in V]
                for di, (name, par) in enumerate(dgp.items())}

    data_id = make(DGP, 1000)                        # milestone 3's datasets, same seeds
    # milestone 24's scale: moments_ext on the synthetic villages of all three processes
    allE = np.concatenate([np.concatenate([cx.moments_ext(v, Y) for v, Y in zip(V, data_id[n])])
                           for n in DGP])
    synth_scale = safe_sd(allE)
    real_Y = [v.takeup.astype(float)[:, None] for v in V]
    real_dm = data_moments(V, real_Y)[:, 0, :]
    data_scale = safe_sd(real_dm)
    p("scales (moments 1..8): sd-synth " + " ".join(f"{x:.4f}" for x in synth_scale))
    p("                       sd-data (real villages) " + " ".join(f"{x:.4f}" for x in data_scale))
    J["scale"] = {"sd-synth": synth_scale.tolist(), "sd-data-real": data_scale.tolist()}

    # (a) real data under each weighting
    Dreal = next(m3.divergences(V, Msim, Pbar, real_Y))
    res_id = m3.select(Dreal[0], Dreal[1], COLS)
    kI = res_id["arg"]["I"]
    Dg = Dreal[0][kI][:, COLS]
    Wts = np.linalg.inv(Dg.T @ Dg / G)
    L = np.linalg.cholesky(Wts)
    variants = {"identity": Dreal, "sd-data": scaled(Dreal, data_scale),
                "sd-synth": scaled(Dreal, synth_scale), "two-step": whitened(Dreal, L)}
    rng = np.random.default_rng(2025)
    p("\n## (a) real data")
    J["real"] = {}
    real_res = {}
    for w, Dw in variants.items():
        r = m3.select(Dw[0], Dw[1], COLS)
        real_res[w] = r
        best = winner(r, "loo")
        line = (f"{w}: in-sample " + "; ".join(f"{m3.label(r['arg'][f])} Q={r['Q'][f]:.4g}" for f in FAMS)
                + f"\n  LOO mean loss " + ", ".join(f"{f} {r['loo'][f]:.4f}" for f in FAMS)
                + f"; lowest {best}; in-sample lowest {winner(r, 'Q')}")
        jj = {"arg": {f: m3.label(r["arg"][f]) for f in FAMS},
              "Q": {f: float(r["Q"][f]) for f in FAMS},
              "loo": {f: float(r["loo"][f]) for f in FAMS}, "best_loo": best, "pairs": {}}
        for f in FAMS:
            if f == best:
                continue
            d = r["vill"][best] - r["vill"][f]          # < 0: best scores lower
            share, ci = bb_lower(d, rng, B_PAIRED)
            wins = int((r["vill"][f] < r["vill"][best]).sum())
            line += (f"\n  {best} vs {f}: {best} lower in {share:.3f} of {B_PAIRED} paired draws; "
                     f"mean diff {d.mean():+.4f} [{ci[0]:+.4f}, {ci[1]:+.4f}]; {f} better in {wins}/{G} villages")
            jj["pairs"][f] = {"share_best_lower": share, "mean_diff": float(d.mean()),
                              "ci": ci.tolist(), "villages_other_better": wins}
        for f in ("R", "T"):
            jj[f"villages_{f}_better_than_I"] = int((r["vill"][f] < r["vill"]["I"]).sum())
        p(line)
        J["real"][w] = jj

    # (b) recovery at milestone 3's identity processes
    p("\n## (b) recovery at the identity-fit processes (milestone 3's datasets)")
    rec_id = recovery(V, Msim, Pbar, data_id, synth_scale)
    J["recovery_identity_dgp"] = rec_table(rec_id, p, "identity DGPs")
    p(f"elapsed {time.time() - t0:.0f} s")

    # (c) processes refitted to the real data under sd-data
    DGP2 = {}
    for f in FAMS:
        _f, a, b, g, d, t = POINTS[real_res["sd-data"]["arg"][f]]
        DGP2[f] = dict(qN=a, qP=b, gamma=g, delta=d, theta=t)
    p("\n## (c) recovery at the processes refitted under sd-data: "
      + "; ".join(f"{f} {m3.label(real_res['sd-data']['arg'][f])}" for f in FAMS))
    J["dgp_sd_data"] = DGP2
    data_sd = make(DGP2, SEED_BASE_REFIT)
    rec_sd = recovery(V, Msim, Pbar, data_sd, synth_scale)
    J["recovery_sd_dgp"] = rec_table(rec_sd, p, "sd-data DGPs")

    # (d) the real LOO differences against each process's synthetic spread (sd-data)
    p("\n## (d) real LOO loss differences against the synthetic spread (sd-data weights)")
    rr = J["real"]["sd-data"]["loo"]
    J["position"] = {}
    for title, rec in (("identity DGPs", rec_id), ("sd-data DGPs", rec_sd)):
        J["position"][title] = {}
        for name in rec["sd-data"]:
            L_ = rec["sd-data"][name]["loo"]
            parts = []
            for f in ("R", "T"):
                x = np.array([l[f] - l["I"] for l in L_])
                real = rr[f] - rr["I"]
                sh = float((x <= real).mean())
                parts.append(f"{f}-I real {real:+.4f} vs 5-95% {np.percentile(x, 5):+.4f} to "
                             f"{np.percentile(x, 95):+.4f} (share at or below real {sh:.3f})")
                J["position"][title].setdefault(name, {})[f] = {
                    "real": real, "p5": float(np.percentile(x, 5)), "p95": float(np.percentile(x, 95)),
                    "share_le_real": sh}
            p(f"  {title}, process {name}: " + "; ".join(parts))

    # verdicts
    p("\n## hypotheses")
    ri = J["real"]["identity"]
    m24 = J["recovery_identity_dgp"]["sd-synth"]["loo"]["recovery"]
    m3r = J["recovery_identity_dgp"]["identity"]["loo"]["recovery"]
    ok85 = (round(ri["loo"]["I"], 4) == 0.1742 and round(ri["loo"]["T"], 4) == 0.1837
            and round(ri["loo"]["R"], 4) == 0.1906 and ri["villages_R_better_than_I"] == 13
            and [round(m24[f], 3) for f in FAMS] == [0.835, 0.870, 0.875]
            and [round(m3r[f], 3) for f in FAMS] == [0.585, 0.820, 0.555])
    p(f"H85 (sanity: milestone 3 real-data numbers, milestone 3 and 24 recovery): "
      f"{'held' if ok85 else 'REFUTED'}")
    lo86 = J["recovery_identity_dgp"]["sd-data"]["loo"]["lowest"]
    p(f"H86 (sd-data recovery at identity processes >= 0.80): lowest {lo86:.3f} -> "
      + ("held" if lo86 >= 0.80 else "refuted" if lo86 < 0.70 else "inconclusive"))
    rs = J["real"]["sd-data"]
    mn = min(v["share_best_lower"] for v in rs["pairs"].values())
    p(f"H87 (real data decide under sd-data: best {rs['best_loo']} lower in >= 0.95 of paired draws "
      f"against each family): min share {mn:.3f} -> "
      + ("held" if mn >= 0.95 else "refuted" if mn < 0.80 else "inconclusive"))
    p(f"H88 (I still lowest real LOO loss under sd-data): best {rs['best_loo']} -> "
      + ("held" if rs["best_loo"] == "I" else "refuted"))
    lo89 = J["recovery_sd_dgp"]["sd-data"]["loo"]["lowest"]
    p(f"H89 (sd-data recovery at sd-data processes >= 0.80): lowest {lo89:.3f} -> "
      + ("held" if lo89 >= 0.80 else "refuted" if lo89 < 0.70 else "inconclusive"))
    p(f"runtime {time.time() - t0:.0f} s")
    txt = "\n".join(out) + "\n"
    open(os.path.join(HERE, "results.txt"), "w").write(txt)
    json.dump(J, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    print(txt)


if __name__ == "__main__":
    main()
