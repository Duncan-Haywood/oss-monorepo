"""Milestone 3t: pool milestone 3s's scored TUM windows (est, est_c, est_cr) by inverse variance,
DerSimonian-Laird random effects and the Hartung-Knapp-Sidik-Jonkman variance, and score H223-H230
(unscored, added after the first run showed HKSJ blowing up on a K = 3 block whose q fell near 0: `hkm`,
the HKSJ variance with q floored at 1, the "modified Knapp-Hartung" of Roever et al. 2015)
(LOG.md, milestone 3t planned). Analysis only: reads milestone 3p's and 3s's results.json through
../m3s_causal/analyse.py; no window is re-solved. Writes summary.json and poolprior.png.
Run (from research/sensing-selfcal): python3 experiments/m3t_poolprior/analyse.py
"""
import importlib.util
import json
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
EXP = os.path.join(HERE, "..")


def _load(name, path):
    s = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(s)
    s.loader.exec_module(m)
    return m


m3d = _load("m3d_pool", os.path.join(EXP, "m3d_pool", "pool.py"))
dl_pool, ivw_pool = m3d.dl_pool, m3d.ivw_pool
KS = (1, 3, 5, 8)
K_MAIN = 5
MODELS = ("est", "est_c", "est_cr")
FLOOR = 0.01          # unscored: 1% of f added in quadrature to every pooled sd


def hk_pool(f, sd, floor_q=False):
    """DL random-effects mean with the Hartung-Knapp-Sidik-Jonkman variance q / sum(w*),
    q = sum w* (f - mu)^2 / (k - 1). For k = 1 it falls back to the DL sd."""
    mu, sd_re, tau2 = dl_pool(f, sd)
    k = len(f)
    if k < 2:
        return mu, sd_re
    ws = 1 / (np.asarray(sd, float) ** 2 + tau2)
    q = float((ws * (np.asarray(f, float) - mu) ** 2).sum() / (k - 1))
    if floor_q:
        q = max(q, 1.0)
    return mu, float(np.sqrt(q / ws.sum()))


def i2(f, sd):
    f = np.asarray(f, float); w = 1 / np.asarray(sd, float) ** 2
    k = len(f)
    if k < 2:
        return 0.0
    mu = (w * f).sum() / w.sum()
    q = (w * (f - mu) ** 2).sum()
    return float(max(0.0, (q - (k - 1)) / q)) if q > 0 else 0.0


def blocks(seq_rows, model, k, refs):
    """seq_rows: one sequence's scored windows in recording order. Blocks containing a window where
    `model` did not converge are dropped."""
    out = []
    for i in range(len(seq_rows) - k + 1):
        b = seq_rows[i:i + k]
        if any(model not in r for r in b):
            continue
        f = [r[model]["f"] for r in b]
        sd = [r[model]["sd_rel"] * r[model]["f"] for r in b]
        mi, si = ivw_pool(f, sd)
        mr, sr, tau2 = dl_pool(f, sd)
        mh, sh = hk_pool(f, sd)
        _, shm = hk_pool(f, sd, floor_q=True)
        out.append({"start": b[0]["window"], "ref": {n: R[b[0]["unit"]] for n, R in refs.items()},
                    "ivw": mi, "sd_ivw": si, "re": mr, "sd_re": sr, "hk": mh, "sd_hk": sh, "hkm": mh, "sd_hkm": shm,
                    "tau_rel": float(np.sqrt(tau2) / mr), "i2": i2(f, sd)})
    return out


def score(bl, ref="board"):
    if not bl:
        return {"n": 0}
    R = np.array([b["ref"][ref] for b in bl])
    out = {"n": len(bl), "med_tau_rel_pct": float(np.median([b["tau_rel"] for b in bl]) * 100),
           "med_i2": float(np.median([b["i2"] for b in bl]))}
    for m in ("ivw", "re", "hk", "hkm"):
        x = np.array([b[m] for b in bl]); sd = np.array([b["sd_" + m] for b in bl])
        z = (x - R) / sd
        zf = (x - R) / np.sqrt(sd ** 2 + (FLOOR * x) ** 2)
        out[m] = {"rms_z": float(np.sqrt(np.mean(z ** 2))), "cover2": float(np.mean(np.abs(z) <= 2)),
                  "rms_z_floor": float(np.sqrt(np.mean(zf ** 2))),
                  "med_abs_e_pct": float(np.median(np.abs(x - R) / R) * 100),
                  "med_sd_pct": float(np.median(sd / x) * 100),
                  "usable": float(np.mean((sd / x <= 0.02) & (np.abs(x - R) / R <= 0.02))),
                  "max_abs_z": float(np.max(np.abs(z)))}
    return out


def analyse(S, refs):
    seqs = sorted({r["seq"] for r in S})
    res = {}
    for m in MODELS:
        res[m] = {}
        for k in KS:
            per, allb = {}, []
            for s in seqs:
                rs = sorted([r for r in S if r["seq"] == s], key=lambda r: r["rank"])
                b = blocks(rs, m, k, refs)
                allb += b
                per[s] = {ref: score(b, ref) for ref in refs}
            res[m][k] = {"all": {ref: score(allb, ref) for ref in refs}, "seq": per}
    return res


def k_to_2pct(res, m):
    for k in KS:
        if res[m][k]["all"]["board"]["re"]["med_abs_e_pct"] <= 2.0:
            return k
    return None


def hypotheses(res):
    g = lambda m, k=K_MAIN: res[m][k]["all"]["board"]
    h = {}
    a, c = g("est")["re"]["med_abs_e_pct"], g("est_c")["re"]["med_abs_e_pct"]
    h["H223"] = {"est": a, "est_c": c, "ratio": c / a, "holds": c <= 0.85 * a}
    z = g("est_c")["ivw"]["rms_z"]
    h["H224"] = {"rms_z_ivw_est_c": z, "holds": z > 2}
    ze, zc = g("est")["re"]["rms_z"], g("est_c")["re"]["rms_z"]
    h["H225"] = {"est": ze, "est_c": zc, "holds": zc > ze}
    h["H226"] = {"est_c": zc, "holds": zc <= 2}
    zh = g("est_c")["hk"]["rms_z"]
    h["H227"] = {"hk": zh, "re": zc, "holds": abs(zh - 1) <= abs(zc - 1)}
    ue, uc = g("est")["re"]["usable"], g("est_c")["re"]["usable"]
    h["H228"] = {"est": ue, "est_c": uc, "holds": uc >= ue + 0.10}
    ke, kc = k_to_2pct(res, "est"), k_to_2pct(res, "est_c")
    h["H229"] = {"est": ke, "est_c": kc,
                 "holds": kc is not None and (ke is None or kc < ke)}
    zr = g("est_cr")["re"]["rms_z"]
    h["H230"] = {"est": ze, "est_c": zc, "est_cr": zr, "holds": zr > max(ze, zc)}
    return h


def main():
    m3s = _load("m3s_an", os.path.join(EXP, "m3s_causal", "analyse.py"))
    R, n_min = m3s.rows()
    S = [r for r in R if r["scored"]]
    refs = m3s.REFS
    res = analyse(S, refs)
    hyp = hypotheses(res)
    out = {"rules": {"K": KS, "K_main": K_MAIN, "floor": FLOOR, "n_min": n_min, "windows": len(S),
                     "converged": {m: sum(m in r for r in S) for m in MODELS}},
           "hypotheses": hyp, "pools": res}
    with open(os.path.join(HERE, "summary.json"), "w") as fh:
        json.dump(out, fh, indent=1)
    for k, v in hyp.items():
        print(k, json.dumps(v))
    for m in MODELS:
        for k in KS:
            a = res[m][k]["all"]
            print(f"{m:6s} K={k} n={a['board']['n']:2d} tau {a['board']['med_tau_rel_pct']:.2f}% "
                  f"I2 {a['board']['med_i2']:.2f} | " + " | ".join(
                      f"{p} rmsz {a['board'][p]['rms_z']:.2f} (floor {a['board'][p]['rms_z_floor']:.2f}) "
                      f"cov2 {a['board'][p]['cover2']:.2f} |e| {a['board'][p]['med_abs_e_pct']:.2f}% "
                      f"sd {a['board'][p]['med_sd_pct']:.2f}% use {a['board'][p]['usable']:.2f}"
                      for p in ("ivw", "re", "hk", "hkm")))
            print("        refs re |e|/rmsz: " + ", ".join(
                f"{ref} {a[ref]['re']['med_abs_e_pct']:.2f}%/{a[ref]['re']['rms_z']:.2f}" for ref in refs))
            print("        seq re |e|/rmsz/use: " + ", ".join(
                f"{s} n={q['board']['n']} {q['board']['re']['med_abs_e_pct']:.2f}%/{q['board']['re']['rms_z']:.2f}/"
                f"{q['board']['re']['usable']:.2f}" for s, q in res[m][k]["seq"].items() if q["board"]["n"]))
    figure(res)


def figure(res):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("matplotlib missing: poolprior.png not drawn")
        return
    cols = {"est": "#888888", "est_c": "#1f77b4", "est_cr": "#d62728"}
    lab = {"est": "no prior (est)", "est_c": "causal prior (est_c)", "est_cr": "recursive prior (est_cr)"}
    fig, axes = plt.subplots(1, 2, figsize=(10, 3.8))
    ax = axes[0]
    for m in MODELS:
        a = [res[m][k]["all"]["board"]["re"] for k in KS]
        ax.plot(KS, [x["med_abs_e_pct"] for x in a], "o-", color=cols[m], label=f"{lab[m]} |error|")
        ax.plot(KS, [x["med_sd_pct"] for x in a], "s--", color=cols[m], alpha=0.6, label=f"{lab[m]} pooled sd")
    ax.axhline(2, color="k", lw=0.8)
    ax.set_xlabel("windows pooled, K (1.2 s each)")
    ax.set_ylabel("% of f, median over blocks (random effects)")
    ax.legend(fontsize=6)
    ax = axes[1]
    for m in MODELS:
        for p, ls in (("ivw", ":"), ("re", "-"), ("hk", "--")):
            ax.plot(KS, [res[m][k]["all"]["board"][p]["rms_z"] for k in KS], ls, marker="o", color=cols[m],
                    label=f"{lab[m]} {p}")
    ax.axhline(1, color="k", lw=0.8); ax.axhline(2, color="k", lw=0.8, ls="--")
    ax.set_yscale("log")
    ax.set_xlabel("windows pooled, K")
    ax.set_ylabel("rms z against the board f (1 = honest)")
    ax.legend(fontsize=5, ncol=3)
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "poolprior.png"), dpi=130)


if __name__ == "__main__":
    main()
