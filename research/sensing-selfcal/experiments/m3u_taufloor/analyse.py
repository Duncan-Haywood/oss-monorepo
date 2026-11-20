"""Milestone 3u: a floor on the between-window spread tau, learned causally from the camera's own earlier
windows, for random-effects pools of milestone 3s's scored TUM windows (est, est_c, est_cr); scores H231-H238
(LOG.md, milestone 3u planned). Analysis only: reads milestone 3p's and 3s's results.json through
../m3s_causal/analyse.py and re-uses milestone 3t's pools; no window is re-solved.
Writes summary.json and taufloor.png.
Run (from research/sensing-selfcal): python3 experiments/m3u_taufloor/analyse.py
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
dl_pool = m3d.dl_pool
KS = (1, 3, 5, 8)
MODELS = ("est", "est_c", "est_cr")
N_HIST = 5          # fewer earlier windows: no floor (the causal prior's N_min)
Q1 = 0.01           # milestone 3t's fixed floor: 1% of f in quadrature
POOLS = ("re", "tf", "q1")


def mad_sd(x):
    x = np.asarray(x, float)
    return float(1.4826 * np.median(np.abs(x - np.median(x))))


def value(r, model):
    """What the robot reported for window r under `model`: the model's own solve, else est."""
    v = r.get(model) or r.get("est")
    return None if v is None else (v["f"], v["sd_rel"] * v["f"])


def tau2_hist(history, model, n_hist=N_HIST):
    """Causal floor from earlier windows: robust variance of their f minus their median solver variance.
    None when fewer than n_hist windows are usable."""
    vals = [value(r, model) for r in history]
    vals = [v for v in vals if v is not None]
    if len(vals) < n_hist:
        return None
    f = np.array([v[0] for v in vals]); sd = np.array([v[1] for v in vals])
    return max(0.0, mad_sd(f) ** 2 - float(np.median(sd ** 2)))


def floored_pool(f, sd, t2_floor):
    """DL random effects with tau^2 = max(tau^2_DL, floor); floor None means plain DL."""
    mu, s, t2 = dl_pool(f, sd)
    if t2_floor is None or t2_floor <= t2:
        return mu, s, t2, t2
    f = np.asarray(f, float); v = np.asarray(sd, float) ** 2
    w = 1 / (v + t2_floor)
    return float((w * f).sum() / w.sum()), float(np.sqrt(1 / w.sum())), t2, float(t2_floor)


def blocks(seq_rows, unit_rows, model, k, refs):
    """seq_rows: one sequence's scored windows in recording order; unit_rows: every counted window of the
    camera (any sequence), for the history. Blocks with an unconverged window of `model` are dropped."""
    out = []
    for i in range(len(seq_rows) - k + 1):
        b = seq_rows[i:i + k]
        if any(model not in r for r in b):
            continue
        f = [r[model]["f"] for r in b]
        sd = [r[model]["sd_rel"] * r[model]["f"] for r in b]
        hist = [r for r in unit_rows if r["rank"] < b[0]["rank"]]
        th = tau2_hist(hist, model)
        mt, st, t2dl, t2 = floored_pool(f, sd, th)
        mr, sr, _ = dl_pool(f, sd)
        out.append({"start": b[0]["window"], "ref": {n: R[b[0]["unit"]] for n, R in refs.items()},
                    "re": mr, "sd_re": sr, "tf": mt, "sd_tf": st, "q1": mr, "sd_q1": float(np.hypot(sr, Q1 * mr)),
                    "tau0": bool(k > 1 and t2dl == 0.0), "has_floor": th is not None,
                    "tau_dl_rel": float(np.sqrt(t2dl) / mr), "tau_hist_rel": None if th is None else float(np.sqrt(th) / mr)})
    return out


def score(bl, ref="board"):
    if not bl:
        return {"n": 0}
    R = np.array([b["ref"][ref] for b in bl])
    th = [b["tau_hist_rel"] for b in bl if b["tau_hist_rel"] is not None]
    out = {"n": len(bl), "n_floor": len(th), "n_tau0": int(sum(b["tau0"] for b in bl)),
           "med_tau_dl_pct": float(np.median([b["tau_dl_rel"] for b in bl]) * 100),
           "med_tau_hist_pct": float(np.median(th) * 100) if th else None}
    t0 = np.array([b["tau0"] for b in bl])
    for m in POOLS:
        x = np.array([b[m] for b in bl]); sd = np.array([b["sd_" + m] for b in bl])
        z = (x - R) / sd
        out[m] = {"rms_z": float(np.sqrt(np.mean(z ** 2))), "cover2": float(np.mean(np.abs(z) <= 2)),
                  "max_abs_z": float(np.max(np.abs(z))),
                  "med_abs_e_pct": float(np.median(np.abs(x - R) / R) * 100),
                  "med_sd_pct": float(np.median(sd / x) * 100),
                  "usable": float(np.mean((sd / x <= 0.02) & (np.abs(x - R) / R <= 0.02))),
                  "rms_z_tau0": float(np.sqrt(np.mean(z[t0] ** 2))) if t0.any() else None}
    return out


def analyse(R, S, refs):
    seqs = sorted({r["seq"] for r in S})
    res = {}
    for m in MODELS:
        res[m] = {}
        for k in KS:
            per, allb = {}, []
            for s in seqs:
                rs = sorted([r for r in S if r["seq"] == s], key=lambda r: r["rank"])
                unit = rs[0]["unit"]
                ur = sorted([r for r in R if r["unit"] == unit], key=lambda r: r["rank"])
                b = blocks(rs, ur, m, k, refs)
                allb += b
                per[s] = {ref: score(b, ref) for ref in refs}
            res[m][k] = {"all": {ref: score(allb, ref) for ref in refs}, "seq": per}
    return res


def hypotheses(res):
    g = lambda m, k: res[m][k]["all"]["board"]
    h = {}
    z3 = g("est_c", 3)["tf"]["rms_z"]
    h["H231"] = {"tf": z3, "re": g("est_c", 3)["re"]["rms_z"], "holds": z3 <= 2}
    mz = g("est_c", 3)["tf"]["max_abs_z"]
    h["H232"] = {"tf": mz, "re": g("est_c", 3)["re"]["max_abs_z"], "holds": mz <= 4}
    z5 = g("est_c", 5)["tf"]["rms_z"]
    h["H233"] = {"K3": z3, "K5": z5, "holds": z3 >= 0.7 and z5 >= 0.7}
    a, b = g("est_c", 5)["re"]["med_abs_e_pct"], g("est_c", 5)["tf"]["med_abs_e_pct"]
    h["H234"] = {"re": a, "tf": b, "ratio": b / a, "holds": b <= 1.1 * a}
    u = g("est_c", 5)["tf"]["usable"]
    h["H235"] = {"tf": u, "re": g("est_c", 5)["re"]["usable"], "holds": u >= 0.20}
    zq = g("est_c", 3)["q1"]["rms_z"]
    h["H236"] = {"tf": z3, "q1": zq, "holds": abs(z3 - 1) < abs(zq - 1)}
    zr = g("est_cr", 3)["tf"]["rms_z"]
    h["H237"] = {"tf": zr, "re": g("est_cr", 3)["re"]["rms_z"], "holds": zr <= 2}
    z1 = g("est_c", 1)["tf"]["rms_z"]
    h["H238"] = {"tf": z1, "re": g("est_c", 1)["re"]["rms_z"], "holds": 0.5 <= z1 <= 2}
    return h


def main():
    m3s = _load("m3s_an", os.path.join(EXP, "m3s_causal", "analyse.py"))
    R, n_min = m3s.rows()
    S = [r for r in R if r["scored"]]
    refs = m3s.REFS
    res = analyse(R, S, refs)
    hyp = hypotheses(res)
    out = {"rules": {"K": KS, "n_hist": N_HIST, "q1": Q1, "n_min": n_min, "windows": len(S), "counted": len(R)},
           "hypotheses": hyp, "pools": res}
    with open(os.path.join(HERE, "summary.json"), "w") as fh:
        json.dump(out, fh, indent=1)
    for k, v in hyp.items():
        print(k, json.dumps(v))
    for m in MODELS:
        for k in KS:
            a = res[m][k]["all"]
            bd = a["board"]
            print(f"{m:6s} K={k} n={bd['n']:2d} floor={bd['n_floor']} tau0={bd['n_tau0']} tauDL {bd['med_tau_dl_pct']:.2f}% "
                  f"tauH {bd['med_tau_hist_pct']}% | " + " | ".join(
                      f"{p} rmsz {bd[p]['rms_z']:.2f} max {bd[p]['max_abs_z']:.1f} cov2 {bd[p]['cover2']:.2f} "
                      f"|e| {bd[p]['med_abs_e_pct']:.2f}% sd {bd[p]['med_sd_pct']:.2f}% use {bd[p]['usable']:.2f} "
                      f"tau0z {bd[p]['rms_z_tau0']}" for p in POOLS))
            print("        refs tf |e|/rmsz: " + ", ".join(
                f"{ref} {a[ref]['tf']['med_abs_e_pct']:.2f}%/{a[ref]['tf']['rms_z']:.2f}" for ref in refs))
            print("        seq tf |e|/rmsz/use: " + ", ".join(
                f"{s} n={q['board']['n']} {q['board']['tf']['med_abs_e_pct']:.2f}%/{q['board']['tf']['rms_z']:.2f}/"
                f"{q['board']['tf']['usable']:.2f}" for s, q in res[m][k]["seq"].items() if q["board"]["n"]))
    figure(res)


def figure(res):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("matplotlib missing: taufloor.png not drawn")
        return
    cols = {"est": "#888888", "est_c": "#1f77b4", "est_cr": "#d62728"}
    lab = {"est": "no prior", "est_c": "causal prior", "est_cr": "recursive prior"}
    sty = {"re": (":", "DL"), "q1": ("--", "DL + 1% of f"), "tf": ("-", "history floor")}
    fig, axes = plt.subplots(1, 2, figsize=(10, 3.8))
    for m in MODELS:
        for p, (ls, pl) in sty.items():
            axes[0].plot(KS, [res[m][k]["all"]["board"][p]["rms_z"] for k in KS], ls, marker="o", color=cols[m],
                         label=f"{lab[m]}, {pl}")
            axes[1].plot(KS, [res[m][k]["all"]["board"][p]["max_abs_z"] for k in KS], ls, marker="o", color=cols[m])
    for ax in axes:
        ax.set_yscale("log"); ax.set_xlabel("windows pooled, K (1.2 s each)")
        ax.axhline(1, color="k", lw=0.8); ax.axhline(2, color="k", lw=0.8, ls="--")
    axes[0].set_ylabel("rms z against the board f (1 = honest)")
    axes[1].set_ylabel("worst block |z|")
    axes[0].legend(fontsize=5.5, ncol=3)
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "taufloor.png"), dpi=130)


if __name__ == "__main__":
    main()
