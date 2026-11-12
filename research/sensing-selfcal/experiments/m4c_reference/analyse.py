"""Milestone 4c: is the jackknife update test deaf because of its chi^2 reference, or for lack of information?

    python3 experiments/m4c_reference/analyse.py      # seconds; no new solve

Reads milestone 4b's stored solves (../m4b_viewcov/results.json.gz), forms the jackknife covariance J
of each old and new view set as 4b did, applies 4b's splits and disturbances, and compares references
for W = d^T (J_old + s^2 J_new)^-1 d: chi^2_3 (4b), a Satterthwaite-Hotelling F, the other camera's
empirical S0 99th percentile (E) and the same camera's own (O, an oracle upper bound); and for the
one-parameter z_f^2: chi^2_1 and F_{1, nu}. Scores H28-H32 (LOG.md, 2026-11-12) and writes
summary.json and power.png.
"""
import gzip, json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "src"))
from selfcal import CHI2_3_99, decide, jackknife_cov, satterthwaite_nu, hotelling_crit  # noqa: E402

import importlib.util  # noqa: E402

_spec = importlib.util.spec_from_file_location("m4b", os.path.join(ROOT, "experiments", "m4b_viewcov", "analyse.py"))
m4b = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m4b)
wilson, theta, transform = m4b.wilson, m4b.theta, m4b.transform
S_LIST, DU_LIST, OTHER, CAMS, METHODS = m4b.S_LIST, m4b.DU_LIST, m4b.OTHER, m4b.CAMS, m4b.METHODS

CHI2_1_99 = 6.634896601021214
REFS = ("chi2", "F", "E", "O")           # for W (3 parameters)
REFS1 = ("chi2_1", "F_1", "E_1", "O_1")  # for z_f^2 (f alone)
# Exploratory, not pre-registered: fire if W exceeds E or z_f^2 exceeds E_1 (both transferred)
REFS1 = REFS1 + ("U",)
LABEL = {"chi2": "χ²₃ (milestone 4b)", "F": "Satterthwaite–Hotelling F", "E": "other camera's S0 99th pct",
         "O": "own S0 99th pct (oracle)", "chi2_1": "f alone, χ²₁", "F_1": "f alone, F₁,ν",
         "E_1": "f alone, other camera's 99th pct", "O_1": "f alone, oracle",
         "U": "W or f alone, both transferred (exploratory)"}


def main():
    with gzip.open(os.path.join(ROOT, "experiments", "m4b_viewcov", "results.json.gz"), "rt") as fh:
        res = json.load(fh)
    sols = {(r["method"], r["cam"], tuple(r["views"])): r["sol"] for r in res["solutions"]}
    size = {cam: res["cams"][cam]["size"] for cam in CAMS}
    truth = {(m, cam): theta(sols[(m, cam, tuple(range(13)))]) for m in METHODS for cam in CAMS}

    def jk(m, cam, views):
        s = sols[(m, cam, tuple(views))]
        if s is None or s["status"] <= 0:
            return None
        loo = []
        for d in views:
            t = sols.get((m, cam, tuple(v for v in views if v != d)))
            loo.append(theta(t) if t is not None and t["status"] > 0 else [np.nan] * 3)
        n = int(np.all(np.isfinite(loo), axis=1).sum())
        return theta(s), jackknife_cov(loo), n, np.sqrt(np.array(s["cov_intr"])[0, 0])

    scen = [("S0", 1.0, 0.0)] + [("S1", s, 0.0) for s in S_LIST] + [("S2", 1.0, du) for du in DU_LIST] + [("S3", 1.0, 0.0)]
    rows = []
    for m in METHODS:
        for cam in CAMS:
            for sp in res["splits"]:
                if sp["k"] < 4:
                    continue
                o_same, o_swap, n0 = jk(m, cam, sp["old"]), jk(m, OTHER[cam], sp["old"]), jk(m, cam, sp["new"])
                if n0 is None:
                    continue
                for name, s, du in scen:
                    o = o_swap if name == "S3" else o_same
                    if o is None:
                        continue
                    tho, Jo, mo, _ = o
                    thn0, Jn, mn, sf_rep0 = n0
                    if name == "S3":
                        thn, t_true = thn0, truth[(m, cam)]
                    else:
                        thn = transform(thn0, size[cam], s, du)
                        t_true = transform(truth[(m, cam)], size[cam], s, du)
                    C = Jo + s * s * Jn
                    d = thn - tho
                    try:
                        W = float(d @ np.linalg.solve(C, d))
                    except np.linalg.LinAlgError:
                        continue
                    if not np.isfinite(W) or mo < 2 or mn < 2:
                        continue
                    zf2 = float(d[0] ** 2 / C[0, 0])
                    nu = satterthwaite_nu(Jo[0, 0], s * s * Jn[0, 0], mo, mn)
                    rows.append(dict(m=m, cam=cam, k=sp["k"], i=sp["i"], scen=name, s=s, du=du, W=W, zf2=zf2, nu=nu,
                                     crit_F=hotelling_crit(3, nu), crit_F1=hotelling_crit(1, nu),
                                     sf_rep=s * sf_rep0, f_new=float(thn[0]),
                                     e_old=abs(tho[0] - t_true[0]) / t_true[0], e_new=abs(thn[0] - t_true[0]) / t_true[0]))

    # Empirical S0 99th percentiles per detector and camera (k >= 4 pooled)
    q = {}
    for m in METHODS:
        for cam in CAMS:
            s0 = [r for r in rows if r["m"] == m and r["cam"] == cam and r["scen"] == "S0"]
            q[(m, cam)] = (float(np.quantile([r["W"] for r in s0], 0.99)), float(np.quantile([r["zf2"] for r in s0], 0.99)),
                           len(s0))
    for r in rows:
        own, oth = q[(r["m"], r["cam"])], q[(r["m"], OTHER[r["cam"]])]
        crit = {"chi2": CHI2_3_99, "F": r["crit_F"], "E": oth[0], "O": own[0]}
        crit1 = {"chi2_1": CHI2_1_99, "F_1": r["crit_F1"], "E_1": oth[1], "O_1": own[1]}
        r["det"] = {k: bool(np.isfinite(c) and r["W"] > c) for k, c in crit.items()}
        r["det"].update({k: bool(np.isfinite(c) and r["zf2"] > c) for k, c in crit1.items()})
        r["det"]["U"] = r["det"]["E"] or r["det"]["E_1"]
        r["harmful"] = {}
        for k, fired in r["det"].items():
            # milestone 4's rule: adopt iff detected and the reported sigma_f of the new set <= 0.5% of f
            dec = decide(1.0 if fired else 0.0, r["sf_rep"], r["f_new"], crit=0.5)
            r["harmful"][k] = bool(dec == "adopt" and r["e_new"] - r["e_old"] > 0.005)

    def sel(**kw):
        out = rows
        for k, v in kw.items():
            out = [r for r in out if (v(r[k]) if callable(v) else r[k] == v)]
        return out

    def rate(rs, ref, key="det"):
        x = sum(bool(r[key][ref]) for r in rs)
        return dict(n=len(rs), rate=x / len(rs) if rs else float("nan"), ci95=wilson(x, len(rs)))

    pm2 = lambda s: s in (0.98, 1.02)  # noqa: E731
    pm4 = lambda s: s in (0.96, 1.04)  # noqa: E731
    H = {}
    h = {m: rate(sel(m=m, scen="S0"), "F") for m in METHODS}
    h["holds"] = all(h[m]["rate"] <= 0.01 for m in METHODS)
    H["H28"] = h
    h = {}
    for m in METHODS:
        rs = sel(m=m, scen="S1", s=pm4, k=6)
        h[m] = {"chi2": rate(rs, "chi2"), "F": rate(rs, "F")}
        h[m]["kept"] = h[m]["F"]["rate"] / h[m]["chi2"]["rate"] if h[m]["chi2"]["rate"] else float("nan")
    h["holds"] = all(h[m]["kept"] < 0.5 for m in METHODS)
    H["H29"] = h
    h = {m: {cam: rate(sel(m=m, scen="S0", cam=cam), "E") for cam in CAMS} for m in METHODS}
    h["holds"] = all(h[m][cam]["rate"] <= 0.05 for m in METHODS for cam in CAMS)
    H["H30"] = h
    h = {m: rate(sel(m=m, scen="S1", s=pm2, k=6), "O") for m in METHODS}
    h["holds"] = all(h[m]["rate"] < 0.25 for m in METHODS)
    H["H31"] = h
    h = {}
    for m in METHODS:
        rs = sel(m=m, scen="S1", s=pm2, k=6)
        h[m] = {"f_alone_chi2_1": rate(rs, "chi2_1"), "W_chi2_3": rate(rs, "chi2"),
                "f_alone_S0": rate(sel(m=m, scen="S0"), "chi2_1")}
    h["holds"] = all(h[m]["f_alone_chi2_1"]["rate"] > h[m]["W_chi2_3"]["rate"] and h[m]["f_alone_S0"]["rate"] <= 0.03
                     for m in METHODS)
    H["H32"] = h

    S = {"n_decisions": len(rows), "hypotheses": H,
         "thresholds": {f"{m}/{cam}": dict(W_99=q[(m, cam)][0], zf2_99=q[(m, cam)][1], n_S0=q[(m, cam)][2]) for m, cam in q},
         "nu": {m: dict(median=float(np.median([r["nu"] for r in sel(m=m, scen="S0")])),
                        p10=float(np.quantile([r["nu"] for r in sel(m=m, scen="S0")], 0.1)),
                        p90=float(np.quantile([r["nu"] for r in sel(m=m, scen="S0")], 0.9)),
                        crit_F_median=float(np.nanmedian([r["crit_F"] for r in sel(m=m, scen="S0")])),
                        crit_F1_median=float(np.nanmedian([r["crit_F1"] for r in sel(m=m, scen="S0")])))
                for m in METHODS}}
    tab = []
    for m in METHODS:
        for name, s, du in scen:
            for k in (4, 5, 6, "4-6"):
                rs = sel(m=m, scen=name, s=s, du=du, k=(lambda x: x >= 4) if k == "4-6" else k)
                if not rs:
                    continue
                tab.append(dict(m=m, scen=name, s=s, du=du, k=k, n=len(rs),
                                det={ref: rate(rs, ref)["rate"] for ref in REFS + REFS1},
                                harmful={ref: rate(rs, ref, "harmful")["rate"] for ref in REFS + REFS1}))
    S["table"] = tab
    S["false_alarm_by_cam"] = {m: {ref: {cam: rate(sel(m=m, scen="S0", cam=cam), ref)["rate"] for cam in CAMS}
                                    for ref in REFS + REFS1} for m in METHODS}
    S["harmful_all"] = {m: {ref: rate(sel(m=m), ref, "harmful") for ref in REFS + REFS1} for m in METHODS}
    with open(os.path.join(HERE, "summary.json"), "w") as fh:
        json.dump(S, fh, indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o))
    print("decisions", len(rows))
    print("thresholds", json.dumps(S["thresholds"]))
    print("nu", json.dumps(S["nu"]))
    for hn, v in H.items():
        print(hn, "holds" if v["holds"] else "REFUTED", json.dumps({k: v[k] for k in v if k != "holds"}))
    print("false alarms by cam", json.dumps(S["false_alarm_by_cam"]))
    print("harmful", json.dumps({m: {r: round(v["rate"], 4) for r, v in S["harmful_all"][m].items()} for m in METHODS}))
    for t in tab:
        if t["k"] == 6 or (t["k"] == "4-6" and t["scen"] in ("S0", "S3")):
            print(t["m"], t["scen"], t["s"], t["du"], t["k"], {r: round(x, 3) for r, x in t["det"].items()})
    figure(tab)


def figure(tab):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, axes = plt.subplots(1, 2, figsize=(10, 4.4), sharey=True)
    xs = sorted(set(S_LIST) | {1.0})
    cols = {"chi2": "#1b2f6b", "F": "#b0b0b0", "E": "#c08a3e", "chi2_1": "#2e8b57", "E_1": "#c0392b"}
    for m, ax, title in (("subpix11", axes[0], "cornerSubPix 11×11 corners"), ("sb", axes[1], "findChessboardCornersSB corners")):
        for ref, c in cols.items():
            ys = []
            for s in xs:
                name = "S0" if s == 1.0 else "S1"
                r = [t for t in tab if t["m"] == m and t["scen"] == name and t["s"] == s and t["k"] == 6]
                ys.append(r[0]["det"][ref] if r else np.nan)
            ax.plot([100 * (s - 1) for s in xs], ys, "o-", color=c, label=LABEL[ref])
        ax.axhline(0.01, color="grey", lw=0.8, ls=":")
        ax.set_title(title, fontsize=10)
        ax.set_xlabel("focal change applied to the 6 new views (%)")
        ax.set_ylim(-0.02, 1.02)
    axes[0].set_ylabel("share of splits where the jackknife test fires")
    h, lab = axes[0].get_legend_handles_labels()
    fig.legend(h, lab, fontsize=8, loc="lower center", ncol=5, frameon=False)
    fig.suptitle("Jackknife update test, five references (OpenCV stereo set, 120 splits per point, k = 6)", fontsize=10)
    fig.tight_layout(rect=(0, 0.07, 1, 1))
    fig.savefig(os.path.join(HERE, "power.png"), dpi=130)


if __name__ == "__main__":
    main()
