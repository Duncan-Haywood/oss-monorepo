"""Milestone 4b analysis: the update test with four covariances on two detectors.

    python3 experiments/m4b_viewcov/analyse.py

Reads results.json.gz (run.py), forms the covariances R (reported), T (reported x the other
camera's nested rms z), V (sandwich clustered by view) and J (leave-one-view-out jackknife),
applies milestone 4's disturbances and rule, scores H23-H27 (LOG.md, 2026-11-12) and writes
summary.json and power.png.
"""
import gzip, json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "src"))
from selfcal import CHI2_3_99, decide, jackknife_cov  # noqa: E402

CHI2_1_99 = 6.634896601021214
S_LIST = (0.96, 0.98, 0.99, 0.995, 1.005, 1.01, 1.02, 1.04)
DU_LIST = (2.0, 5.0, 10.0)
OTHER = {"left": "right", "right": "left"}
CAMS = ("left", "right")
METHODS = ("subpix11", "sb")
COVS = ("R", "T", "V", "J")
LABEL = {"R": "reported", "T": "reported × other camera's κ", "V": "sandwich by view", "J": "jackknife by view"}


def wilson(x, n, z=1.96):
    if n == 0:
        return [float("nan")] * 2
    p = x / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return [float(c - h), float(c + h)]


def theta(sol):
    return np.array([sol["f"], sol["cx"], sol["cy"]])


def transform(th, size, s, du):
    p = np.array([size[0] / 2.0, size[1] / 2.0])
    return np.array([s * th[0], p[0] + s * (th[1] - p[0]) + du, p[1] + s * (th[2] - p[1])])


def chi2(d, C, idx=(0, 1, 2)):
    i = list(idx)
    try:
        return float(d[i] @ np.linalg.solve(C[np.ix_(i, i)], d[i]))
    except np.linalg.LinAlgError:
        return float("nan")


def nested_kappa():
    """Per camera and detector: H8's nested rms z of the reported sigma of f, on milestone 6's random
    4-12-view subsets against that detector's all-view target-free solution."""
    R = json.load(open(os.path.join(ROOT, "experiments", "m6_detector", "results.json")))
    out = {}
    for m in METHODS:
        out[m] = {}
        for cam in CAMS:
            a = R["cams"][cam][m]["selfcal_k1"]
            zs = []
            for r in R["subsets"]:
                s = r["selfcal"]
                if r["cam"] != cam or r["method"] != m or r["kind"] != "random" or not 4 <= r["k"] <= 12:
                    continue
                if s is None or not np.isfinite(s["sf"]) or s["sf"] <= 0:
                    continue
                v = s["sf"] ** 2 - a["sf"] ** 2
                if v > 0:
                    zs.append((s["f"] - a["f"]) / np.sqrt(v))
            out[m][cam] = float(np.sqrt(np.mean(np.square(zs))))
    return out


def main():
    with gzip.open(os.path.join(HERE, "results.json.gz"), "rt") as fh:
        res = json.load(fh)
    sols = {(r["method"], r["cam"], tuple(r["views"])): r["sol"] for r in res["solutions"]}
    bad = [list(map(str, k)) for k, v in sols.items() if v is None or v["status"] <= 0]
    kap = nested_kappa()
    kappa_tr = {m: {cam: kap[m][OTHER[cam]] for cam in CAMS} for m in METHODS}
    size = {cam: res["cams"][cam]["size"] for cam in CAMS}
    truth = {(m, cam): theta(sols[(m, cam, tuple(range(13)))]) for m in METHODS for cam in CAMS}

    def covs(m, cam, views):
        s = sols[(m, cam, tuple(views))]
        C = {"R": np.array(s["cov_intr"])[:3, :3], "V": np.array(s["cov_intr_cr_view"])[:3, :3]}
        C["T"] = kappa_tr[m][cam] ** 2 * C["R"]
        if len(views) >= 4:
            loo = []
            for d in views:
                t = sols.get((m, cam, tuple(v for v in views if v != d)))
                loo.append(theta(t) if t is not None and t["status"] > 0 else [np.nan] * 3)
            C["J"] = jackknife_cov(loo)
            C["J_n"] = int(np.all(np.isfinite(loo), axis=1).sum())
        else:
            C["J"] = np.full((3, 3), np.nan)
            C["J_n"] = 0
        return theta(s), C

    scen = [("S0", 1.0, 0.0)] + [("S1", s, 0.0) for s in S_LIST] + [("S2", 1.0, du) for du in DU_LIST] + [("S3", 1.0, 0.0)]
    rows = []
    for m in METHODS:
        for cam in CAMS:
            for sp in res["splits"]:
                th_o_same, C_o_same = covs(m, cam, sp["old"])
                th_o_swap, C_o_swap = covs(m, OTHER[cam], sp["old"])
                th_n0, C_n0 = covs(m, cam, sp["new"])
                for name, s, du in scen:
                    if name == "S3":
                        tho, Co, thn, t_true = th_o_swap, C_o_swap, th_n0, truth[(m, cam)]
                    else:
                        tho, Co = th_o_same, C_o_same
                        thn = transform(th_n0, size[cam], s, du)
                        t_true = transform(truth[(m, cam)], size[cam], s, du)
                    sc2 = s * s
                    d = thn - tho
                    e_old = abs(tho[0] - t_true[0]) / t_true[0]
                    e_new = abs(thn[0] - t_true[0]) / t_true[0]
                    for cv in COVS:
                        C = Co[cv] + sc2 * C_n0[cv]
                        c3 = chi2(d, C)
                        if not np.isfinite(c3):
                            continue
                        sf_rep = np.sqrt(sc2 * C_n0["R"][0, 0])
                        dec = decide(c3, sf_rep, thn[0])
                        dec_jg = decide(c3, np.sqrt(sc2 * C_n0["J"][0, 0]), thn[0]) if sp["k"] >= 4 else None
                        e_dec = e_new if dec == "adopt" else e_old
                        z = d / np.sqrt(np.diag(C))
                        rows.append(dict(m=m, cam=cam, k=sp["k"], i=sp["i"], scen=name, s=s, du=du, cov=cv,
                                         chi2=c3, det=bool(c3 > CHI2_3_99), det_f=bool(z[0] ** 2 > CHI2_1_99),
                                         z=z.tolist(), dec=dec, dec_jgate=dec_jg, e_old=e_old, e_new=e_new,
                                         e_dec=e_dec, harmful=bool(dec == "adopt" and e_new - e_old > 0.005),
                                         harmful_jgate=bool(dec_jg == "adopt" and e_new - e_old > 0.005)))

    def sel(**kw):
        out = rows
        for k, v in kw.items():
            out = [r for r in out if (v(r[k]) if callable(v) else r[k] == v)]
        return out

    def rate(rs, key="det"):
        x = sum(bool(r[key]) for r in rs)
        return dict(n=len(rs), rate=x / len(rs) if rs else float("nan"), ci95=wilson(x, len(rs)))

    k4 = lambda k: k >= 4  # noqa: E731
    S = {"kappa_nested": kap, "kappa_transferred": kappa_tr, "failed_solves": bad, "n_solutions": len(sols),
         "truth": {f"{m}/{c}": truth[(m, c)].tolist() for m, c in truth}}
    H = {}
    # H23: R with SB corners, S0, k >= 4, pooled >= 50%
    h = {m: rate(sel(m=m, cov="R", scen="S0", k=k4)) for m in METHODS}
    h["holds"] = h["sb"]["rate"] >= 0.5
    H["H23"] = h
    # H24: V, S0, k >= 4, pooled > 5% on both detectors
    h = {m: rate(sel(m=m, cov="V", scen="S0", k=k4)) for m in METHODS}
    h["holds"] = all(h[m]["rate"] > 0.05 for m in METHODS)
    H["H24"] = h
    # H25: J, S0, k >= 4: pooled <= 3% and each camera <= 5%, both detectors
    h = {}
    for m in METHODS:
        h[m] = {"pooled": rate(sel(m=m, cov="J", scen="S0", k=k4))}
        h[m].update({cam: rate(sel(m=m, cov="J", scen="S0", k=k4, cam=cam)) for cam in CAMS})
    h["holds"] = all(h[m]["pooled"]["rate"] <= 0.03 and all(h[m][c]["rate"] <= 0.05 for c in CAMS) for m in METHODS)
    H["H25"] = h
    # H26: J detects the swap (k >= 4, pooled) in fewer splits than T, both detectors
    h = {}
    for m in METHODS:
        h[m] = {cv: rate(sel(m=m, cov=cv, scen="S3", k=k4)) for cv in COVS}
        h[m]["by_cam"] = {cv: {cam: rate(sel(m=m, cov=cv, scen="S3", k=k4, cam=cam))["rate"] for cam in CAMS}
                          for cv in COVS}
    h["holds"] = all(h[m]["J"]["rate"] < h[m]["T"]["rate"] for m in METHODS)
    H["H26"] = h
    # H27: harmful adoption with J, all scenarios, k >= 4, <= 2% on both detectors
    h = {m: rate(sel(m=m, cov="J", k=k4), "harmful") for m in METHODS}
    h["holds"] = all(h[m]["rate"] <= 0.02 for m in METHODS)
    H["H27"] = h
    S["hypotheses"] = H

    # Unscored: false alarms, swap power, harm, flag rate per covariance, detector and k
    tab = []
    for m in METHODS:
        for cv in COVS:
            for name, s, du in scen:
                for k in (3, 4, 5, 6):
                    rs = sel(m=m, cov=cv, scen=name, s=s, du=du, k=k)
                    if not rs:
                        continue
                    tab.append(dict(m=m, cov=cv, scen=name, s=s, du=du, k=k, n=len(rs), det=rate(rs)["rate"],
                                    det_f=rate(rs, "det_f")["rate"],
                                    adopt=sum(r["dec"] == "adopt" for r in rs) / len(rs),
                                    flag=sum(r["dec"] == "flag" for r in rs) / len(rs),
                                    harmful=rate(rs, "harmful")["rate"],
                                    err_ge_1pct=sum(r["e_dec"] >= 0.01 for r in rs) / len(rs)))
    S["table"] = tab
    S["rms_z_S0"] = {m: {cv: {cam: np.sqrt(np.mean(np.square([r["z"] for r in sel(m=m, cov=cv, scen="S0", k=k4, cam=cam)]),
                                                     axis=0)).round(3).tolist() for cam in CAMS} for cv in COVS}
                     for m in METHODS}
    S["false_alarm_by_cam"] = {m: {cv: {cam: rate(sel(m=m, cov=cv, scen="S0", k=k4, cam=cam))["rate"] for cam in CAMS}
                                    for cv in COVS} for m in METHODS}
    S["jackknife_gate"] = {m: dict(harmful=rate(sel(m=m, cov="J", k=k4), "harmful_jgate"),
                                   adopt_rate=float(np.mean([r["dec_jgate"] == "adopt" for r in sel(m=m, cov="J", k=k4)])),
                                   adopt_rate_reported_gate=float(np.mean([r["dec"] == "adopt" for r in sel(m=m, cov="J", k=k4)])))
                           for m in METHODS}
    with open(os.path.join(HERE, "summary.json"), "w") as fh:
        json.dump(S, fh, indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o))
    print("kappa nested", json.dumps(kap))
    for hn, v in H.items():
        print(hn, "holds" if v["holds"] else "REFUTED", json.dumps({k: v[k] for k in v if k != "holds"})[:700])
    print("false alarms k>=4 by cam", json.dumps(S["false_alarm_by_cam"]))
    print("rms z S0", json.dumps(S["rms_z_S0"]))
    print("jackknife gate", json.dumps(S["jackknife_gate"]))
    figure(tab)


def figure(tab):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, axes = plt.subplots(1, 2, figsize=(10, 4.4), sharey=True)
    xs = sorted(set(S_LIST) | {1.0})
    cols = {"R": "#b0b0b0", "T": "#c08a3e", "V": "#8e6bbf", "J": "#1b2f6b"}
    for m, ax, title in (("subpix11", axes[0], "cornerSubPix 11×11 corners"), ("sb", axes[1], "findChessboardCornersSB corners")):
        for cv in COVS:
            ys = []
            for s in xs:
                name = "S0" if s == 1.0 else "S1"
                r = [t for t in tab if t["m"] == m and t["cov"] == cv and t["scen"] == name and t["s"] == s and t["k"] == 6]
                ys.append(r[0]["det"] if r else np.nan)
            ax.plot([100 * (s - 1) for s in xs], ys, "o-", color=cols[cv], label=LABEL[cv])
        ax.axhline(0.01, color="grey", lw=0.8, ls=":")
        ax.set_title(title, fontsize=10)
        ax.set_xlabel("focal change applied to the 6 new views (%)")
        ax.set_ylim(-0.02, 1.02)
    axes[0].set_ylabel("share of splits where the χ² test fires")
    h, l = axes[0].get_legend_handles_labels()
    fig.legend(h, l, fontsize=8, loc="lower center", ncol=4, frameon=False)
    fig.suptitle("Update test with a covariance from each calibration's own views (OpenCV stereo set, 120 splits per point)",
                 fontsize=10)
    fig.tight_layout(rect=(0, 0.07, 1, 1))
    fig.savefig(os.path.join(HERE, "power.png"), dpi=130)


if __name__ == "__main__":
    main()
