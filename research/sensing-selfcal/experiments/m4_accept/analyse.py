"""Milestone 4 analysis: the accept/reject rule on disjoint old/new view sets.

    python3 experiments/m4_accept/analyse.py

Reads results.json (run.py), applies the pre-registered changes (LOG.md, 2026-11-12) to the
new set's solution, scores H18-H22 and writes summary.json and power.png.
"""
import json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "src"))
from selfcal import CHI2_3_99, decide  # noqa: E402

CHI2_1_99 = 6.634896601021214
CHI2_4_99 = 13.276704135987622
S_LIST = (0.96, 0.98, 0.99, 0.995, 1.005, 1.01, 1.02, 1.04)
DU_LIST = (2.0, 5.0, 10.0)
OTHER = {"left": "right", "right": "left"}


def wilson(x, n, z=1.96):
    if n == 0:
        return [float("nan")] * 2
    p = x / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return [float(c - h), float(c + h)]


def theta(sol, nparam=4):
    return np.array([sol["f"], sol["cx"], sol["cy"], sol["k1"]])[:nparam], np.array(sol["cov_intr"])[:nparam, :nparam]


def transform(th, cov, size, s, du):
    p = np.array([size[0] / 2.0, size[1] / 2.0])
    t = th.copy()
    t[0] = s * th[0]
    t[1] = p[0] + s * (th[1] - p[0]) + du
    t[2] = p[1] + s * (th[2] - p[1])
    A = np.diag([s, s, s, 1.0])
    return t, A @ cov @ A.T


def chi2(d, C, idx):
    i = list(idx)
    return float(d[i] @ np.linalg.solve(C[np.ix_(i, i)], d[i]))


def main():
    res = json.load(open(os.path.join(HERE, "results.json")))
    m3 = json.load(open(os.path.join(ROOT, "experiments", "m3_robust", "summary.json")))
    nested = m3["hypotheses"]["H8_nested"]["sf"]["per_cam"]
    kappa_tr = {cam: nested[OTHER[cam]] for cam in ("left", "right")}   # never fitted on the scored camera
    sols = {(r["cam"], tuple(r["views"])): r["sol"] for r in res["solutions"]}
    bad = [k for k, v in sols.items() if v is None or v["status"] <= 0]
    truth = {cam: theta(sols[(cam, tuple(range(13)))])[0] for cam in ("left", "right")}
    size = {cam: res["cams"][cam]["size"] for cam in ("left", "right")}

    scen = [("S0", 1.0, 0.0)] + [("S1", s, 0.0) for s in S_LIST] + [("S2", 1.0, du) for du in DU_LIST]
    rows = []
    for cam in ("left", "right"):
        for sp in res["splits"]:
            so, sn = sols[(cam, tuple(sp["old"]))], sols[(cam, tuple(sp["new"]))]
            th_o, C_o = theta(so)
            th_n0, C_n0 = theta(sn)
            cases = [(name, s, du, th_n0, C_n0, cam) for name, s, du in scen]
            # S3: the old calibration comes from the other camera's old set (a real unit swap)
            so_x = sols[(OTHER[cam], tuple(sp["old"]))]
            cases.append(("S3", 1.0, 0.0, th_n0, C_n0, OTHER[cam]))
            for name, s, du, thn, Cn, old_cam in cases:
                if name == "S3":
                    tho, Co = theta(so_x)
                    t_true = truth[cam]
                else:
                    tho, Co = th_o, C_o
                    thn, Cn = transform(thn, Cn, size[cam], s, du)
                    t_true, _ = transform(truth[cam], np.eye(4), size[cam], s, du)
                d = thn - tho
                for kname, kap in (("k1", 1.0), ("tr", kappa_tr[cam])):
                    C = kap ** 2 * (Co + Cn)
                    c3 = chi2(d, C, (0, 1, 2))
                    dec = decide(c3, np.sqrt(Cn[0, 0]), thn[0])   # the gate uses the reported sigma, as in milestone 2
                    e_old = abs(tho[0] - t_true[0]) / t_true[0]
                    e_new = abs(thn[0] - t_true[0]) / t_true[0]
                    e_dec = e_new if dec == "adopt" else e_old
                    rows.append(dict(cam=cam, k=sp["k"], i=sp["i"], scen=name, s=s, du=du, kappa=kname,
                                     chi2=c3, chi2_f=chi2(d, C, (0,)), det=bool(c3 > CHI2_3_99),
                                     z=(d[:3] / np.sqrt(np.diag(C)[:3])).tolist(),
                                     det_f=bool(chi2(d, C, (0,)) > CHI2_1_99),
                                     det_4=bool(chi2(d, C, (0, 1, 2, 3)) > CHI2_4_99),
                                     dec=dec, e_old=e_old, e_new=e_new, e_dec=e_dec,
                                     pp_old=float(np.hypot(*(tho[1:3] - t_true[1:3]))),
                                     pp_new=float(np.hypot(*(thn[1:3] - t_true[1:3]))),
                                     harmful=bool(dec == "adopt" and e_new - e_old > 0.005)))

    def sel(**kw):
        out = rows
        for k, v in kw.items():
            if callable(v):
                out = [r for r in out if v(r[k])]
            else:
                out = [r for r in out if r[k] == v]
        return out

    def rate(rs, key="det"):
        x = sum(bool(r[key]) for r in rs)
        return dict(n=len(rs), rate=x / len(rs) if rs else float("nan"), ci95=wilson(x, len(rs)))

    S = {"kappa_transferred": kappa_tr, "failed_solves": [list(map(str, b)) for b in bad],
         "n_solutions": len(sols), "truth": {c: truth[c].tolist() for c in truth}}
    H = {}
    # H18: S0 false alarms with the reported covariance
    h18 = {cam: rate(sel(scen="S0", kappa="k1", cam=cam)) for cam in ("left", "right")}
    h18["pooled"] = rate(sel(scen="S0", kappa="k1"))
    h18["holds"] = bool(h18["pooled"]["rate"] > 0.05)
    H["H18"] = h18
    # H19: with the transferred kappa
    h19 = {cam: rate(sel(scen="S0", kappa="tr", cam=cam)) for cam in ("left", "right")}
    h19["pooled"] = rate(sel(scen="S0", kappa="tr"))
    h19["holds"] = h19["pooled"]["rate"] <= 0.03 and all(h19[c]["rate"] <= 0.05 for c in ("left", "right"))
    H["H19"] = h19
    # H20: the swap, k >= 4, each direction (named by the new data's camera)
    h20 = {cam: rate(sel(scen="S3", kappa="tr", cam=cam, k=lambda k: k >= 4)) for cam in ("left", "right")}
    h20["holds"] = all(h20[c]["rate"] >= 0.9 for c in ("left", "right"))
    H["H20"] = h20
    # H21: s = 0.99 / 1.01, k >= 5
    h21 = {str(s): rate(sel(scen="S1", s=s, kappa="tr", k=lambda k: k >= 5)) for s in (0.99, 1.01)}
    h21["holds"] = all(h21[str(s)]["rate"] >= 0.8 for s in (0.99, 1.01))
    H["H21"] = h21
    # H22: harmful adoption over everything
    h22 = rate(rows, "harmful")
    h22["by_kappa"] = {kn: rate(sel(kappa=kn), "harmful") for kn in ("k1", "tr")}
    h22["holds"] = h22["rate"] <= 0.02
    H["H22"] = h22
    S["hypotheses"] = H

    # Power and decision tables, by scenario, kappa and k
    tab = []
    for name, s, du in scen + [("S3", 1.0, 0.0)]:
        for kn in ("k1", "tr"):
            for k in (3, 4, 5, 6):
                rs = sel(scen=name, s=s, du=du, kappa=kn, k=k)
                dec = {d: sum(r["dec"] == d for r in rs) / len(rs) for d in ("keep", "adopt", "flag")}
                tab.append(dict(scen=name, s=s, du=du, kappa=kn, k=k, n=len(rs),
                                det=rate(rs)["rate"], det_f=rate(rs, "det_f")["rate"], det_4=rate(rs, "det_4")["rate"],
                                **dec, harmful=rate(rs, "harmful")["rate"],
                                err_ge_1pct=sum(r["e_dec"] >= 0.01 for r in rs) / len(rs),
                                med_e_dec=float(np.median([r["e_dec"] for r in rs])),
                                med_pp_new=float(np.median([r["pp_new"] for r in rs])),
                                med_pp_old=float(np.median([r["pp_old"] for r in rs]))))
    S["table"] = tab

    # Unscored diagnostics: how wrong is the covariance on disjoint view sets, per parameter,
    # and what factor would the test need (fitted in sample, so optimistic)?
    diag = {}
    for cam in ("left", "right"):
        rs = sel(scen="S0", kappa="k1", cam=cam)
        z = np.array([r["z"] for r in rs])
        c3 = np.array([r["chi2"] for r in rs])
        cf = np.array([r["chi2_f"] for r in rs])
        k3 = float(np.sqrt(np.quantile(c3, 0.99) / CHI2_3_99))
        kf = float(np.sqrt(np.quantile(cf, 0.99) / CHI2_1_99))
        by_k = {k: np.sqrt(np.mean(np.array([r["z"] for r in rs if r["k"] == k]) ** 2, axis=0)).round(2).tolist()
                for k in (3, 4, 5, 6)}
        # power of the f-only test at the in-sample factor, per focal change and k
        pw = {}
        for s_ in S_LIST:
            for k in (3, 4, 5, 6):
                q = sel(scen="S1", s=s_, kappa="k1", cam=cam, k=k)
                pw[f"{s_}_{k}"] = float(np.mean([r["chi2_f"] / kf ** 2 > CHI2_1_99 for r in q]))
        # and the 3-parameter test at its in-sample factor on the real swap
        sw = {k: float(np.mean([r["chi2"] / k3 ** 2 > CHI2_3_99 for r in sel(scen="S3", kappa="k1", cam=cam, k=k)]))
              for k in (3, 4, 5, 6)}
        diag[cam] = dict(rms_z_f_cx_cy=np.sqrt(np.mean(z ** 2, axis=0)).round(3).tolist(), rms_z_by_k=by_k,
                         kappa99_3param=k3, kappa99_f=kf, power_f_at_kappa99=pw, swap_3param_at_kappa99=sw)
    S["diagnostics_S0"] = diag
    print(json.dumps(diag, indent=0)[:3000])
    S["flag_rate"] = {kn: sum(r["dec"] == "flag" for r in sel(kappa=kn)) / len(sel(kappa=kn)) for kn in ("k1", "tr")}
    S["err_ge_1pct_after_decision"] = {kn: sum(r["e_dec"] >= 0.01 for r in sel(kappa=kn)) / len(sel(kappa=kn))
                                       for kn in ("k1", "tr")}
    S["harmful_examples"] = [r for r in rows if r["harmful"]][:20]
    with open(os.path.join(HERE, "summary.json"), "w") as fh:
        json.dump(S, fh, indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o))
    for h, v in H.items():
        print(h, "holds" if v["holds"] else "REFUTED", json.dumps({k: v[k] for k in v if k != "holds"})[:400])
    figure(tab)


def figure(tab):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, axes = plt.subplots(1, 2, figsize=(10, 4))
    xs = sorted(set(S_LIST) | {1.0})
    for kn, ax, title in (("k1", axes[0], "reported covariance (κ = 1)"), ("tr", axes[1], "κ from the other camera")):
        for k, col in zip((3, 4, 5, 6), ("#c8a2c8", "#8e6bbf", "#4b5fb0", "#1b2f6b")):
            ys = []
            for s in xs:
                name = "S0" if s == 1.0 else "S1"
                r = [t for t in tab if t["scen"] == name and t["s"] == s and t["kappa"] == kn and t["k"] == k]
                ys.append(r[0]["det"])
            ax.plot([100 * (s - 1) for s in xs], ys, "o-", color=col, label=f"{k} new views")
        ax.axhline(0.01, color="grey", lw=0.8, ls=":")
        ax.set_title(title, fontsize=10)
        ax.set_xlabel("focal change applied to the new views (%)")
        ax.set_ylim(-0.02, 1.02)
    axes[0].set_ylabel("share of splits where the χ² test fires")
    axes[1].legend(fontsize=8, loc="lower right")
    fig.suptitle("In-field update test on real images (OpenCV stereo set, 60 splits per k and camera)", fontsize=10)
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "power.png"), dpi=130)


if __name__ == "__main__":
    main()
