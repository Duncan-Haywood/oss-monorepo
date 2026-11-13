"""Milestone 4d: milestone 4c's update test on cornerSubPix 5x5-window corners.

    python3 experiments/m4d_window/analyse.py      # seconds; reads this run's and milestone 4b's solves

Merges results.json.gz (5x5 corners, run.py) with milestone 4b's stored 11x11 and SB solves, scores
every k >= 4 decision with milestone 4c's statistics and references (`m4c_reference/analyse.py`,
`score`, unchanged), scores H38-H42 (LOG.md, 2026-11-13) and writes summary.json and power.png.
"""
import gzip, json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "src"))
import importlib.util  # noqa: E402

_spec = importlib.util.spec_from_file_location("m4c", os.path.join(ROOT, "experiments", "m4c_reference", "analyse.py"))
m4c = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m4c)
CAMS, OTHER, wilson, theta, SCEN = m4c.CAMS, m4c.OTHER, m4c.wilson, m4c.theta, m4c.SCEN
REFS = m4c.REFS + m4c.REFS1
METHODS = ("subpix11", "sb", "subpix5")
NAME = {"subpix11": "cornerSubPix 11×11", "sb": "findChessboardCornersSB", "subpix5": "cornerSubPix 5×5"}
ZHANG5 = {"left": 532.9, "right": 536.2}   # milestone 6b's best estimate (LOG.md), for the unscored comparison


def load():
    with gzip.open(os.path.join(ROOT, "experiments", "m4b_viewcov", "results.json.gz"), "rt") as fh:
        res = json.load(fh)
    with gzip.open(os.path.join(HERE, "results.json.gz"), "rt") as fh:
        new = json.load(fh)
    assert new["splits"] == res["splits"]
    res["solutions"] += new["solutions"]
    return res, new


def main():
    res, new = load()
    rows, q = m4c.score(res, METHODS)

    def sel(**kw):
        out = rows
        for k, v in kw.items():
            out = [r for r in out if (v(r[k]) if callable(v) else r[k] == v)]
        return out

    def rate(rs, ref, key="det"):
        x = sum(bool(r[key][ref]) for r in rs)
        return dict(n=len(rs), rate=x / len(rs) if rs else float("nan"), ci95=wilson(x, len(rs)))

    pm2 = lambda s: s in (0.98, 1.02)  # noqa: E731
    H = {}
    m = "subpix5"
    h = {"pooled": rate(sel(m=m, scen="S0"), "chi2")}
    h.update({cam: rate(sel(m=m, scen="S0", cam=cam), "chi2") for cam in CAMS})
    h["holds"] = h["pooled"]["rate"] <= 0.03 and all(h[c]["rate"] <= 0.05 for c in CAMS)
    H["H38"] = h

    def offset_sd(mm, k=6):
        dev = []
        for cam in CAMS:
            rs = sel(m=mm, scen="S0", cam=cam, k=k)
            x = np.array([r["df"] / r["f_new"] for r in rs])
            dev += list(x - x.mean())
        return float(np.sqrt(np.sum(np.square(dev)) / (len(dev) - len(CAMS))))
    h = {mm: offset_sd(mm) for mm in METHODS}
    h["holds"] = h["subpix5"] < h["subpix11"] and h["subpix5"] < h["sb"]
    H["H39"] = h
    h = {mm: rate(sel(m=mm, scen="S1", s=pm2, k=6), "E_1") for mm in METHODS}
    h["holds"] = h["subpix5"]["rate"] >= 0.40
    H["H40"] = h
    h = {cam: rate(sel(m=m, scen="S0", cam=cam), "E_1") for cam in CAMS}
    h["holds"] = all(h[c]["rate"] <= 0.05 for c in CAMS)
    H["H41"] = h
    h = {mm: rate(sel(m=mm, scen="S3"), "chi2") for mm in METHODS}
    h["holds"] = h["subpix5"]["rate"] >= 0.50
    H["H42"] = h

    sols = {(r["method"], r["cam"], tuple(r["views"])): r["sol"] for r in res["solutions"]}
    allview = {}
    for mm in METHODS:
        for cam in CAMS:
            t = sols[(mm, cam, tuple(range(13)))]
            allview[f"{mm}/{cam}"] = dict(f=t["f"], cx=t["cx"], cy=t["cy"], k1=t["k1"], sf=t["sf"],
                                         f_vs_zhang5_pct=100 * (t["f"] / ZHANG5[cam] - 1))
    # per-parameter rms z of old-vs-new on S0 under J (is J still conservative?), and the jackknife sigma_f
    rmsz = {mm: float(np.sqrt(np.mean([r["zf2"] for r in sel(m=mm, scen="S0")]))) for mm in METHODS}
    nfail = {mm: sum(1 for (a, c, v), s in sols.items() if a == mm and (s is None or s["status"] <= 0)) for mm in METHODS}

    tab = []
    for mm in METHODS:
        for name, s, du in SCEN:
            for k in (4, 5, 6, "4-6"):
                rs = sel(m=mm, scen=name, s=s, du=du, k=(lambda x: x >= 4) if k == "4-6" else k)
                if rs:
                    tab.append(dict(m=mm, scen=name, s=s, du=du, k=k, n=len(rs),
                                    det={ref: rate(rs, ref)["rate"] for ref in REFS},
                                    harmful={ref: rate(rs, ref, "harmful")["rate"] for ref in REFS}))
    S = {"n_decisions": len(rows), "n_decisions_5x5": len(sel(m="subpix5")), "hypotheses": H,
         "reproduce_m4b": new["reproduce_m4b"], "not_converged": nfail, "allview": allview, "rms_zf_S0_J": rmsz,
         "thresholds": {f"{a}/{c}": dict(W_99=q[(a, c)][0], zf2_99=q[(a, c)][1], n_S0=q[(a, c)][2]) for a, c in q},
         "false_alarm_by_cam": {mm: {ref: {cam: rate(sel(m=mm, scen="S0", cam=cam), ref)["rate"] for cam in CAMS}
                                     for ref in REFS} for mm in METHODS},
         "harmful_all": {mm: {ref: rate(sel(m=mm), ref, "harmful") for ref in REFS} for mm in METHODS},
         "table": tab}
    with open(os.path.join(HERE, "summary.json"), "w") as fh:
        json.dump(S, fh, indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o))
    print("decisions", len(rows), "not converged", nfail)
    print("allview", json.dumps(allview))
    print("rms z_f S0 (J)", rmsz)
    print("thresholds", json.dumps(S["thresholds"]))
    for hn, v in H.items():
        print(hn, "holds" if v["holds"] else "REFUTED", json.dumps({k: v[k] for k in v if k != "holds"}))
    print("false alarms by cam", json.dumps({mm: {r: S["false_alarm_by_cam"][mm][r] for r in ("chi2", "E", "E_1", "U")}
                                              for mm in METHODS}))
    print("harmful", json.dumps({mm: {r: round(v["rate"], 4) for r, v in S["harmful_all"][mm].items()} for mm in METHODS}))
    for t in tab:
        if t["k"] == 6 or (t["k"] == "4-6" and t["scen"] in ("S0", "S3")):
            print(t["m"], t["scen"], t["s"], t["du"], t["k"], {r: round(x, 3) for r, x in t["det"].items()})
    figure(tab)


def figure(tab):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, axes = plt.subplots(1, 2, figsize=(10, 4.4), sharey=True)
    xs = sorted(set(m4c.S_LIST) | {1.0})
    cols = {"subpix11": "#c08a3e", "sb": "#1b2f6b", "subpix5": "#c0392b"}
    for ref, ax, title in (("E_1", axes[0], "f alone, other camera's 99th percentile"),
                           ("chi2", axes[1], "W (f, cₓ, c_y), χ²₃")):
        for mm in METHODS:
            ys = []
            for s in xs:
                name = "S0" if s == 1.0 else "S1"
                r = [t for t in tab if t["m"] == mm and t["scen"] == name and t["s"] == s and t["k"] == 6]
                ys.append(r[0]["det"][ref] if r else np.nan)
            ax.plot([100 * (s - 1) for s in xs], ys, "o-", color=cols[mm], label=NAME[mm] + " corners")
        ax.axhline(0.01, color="grey", lw=0.8, ls=":")
        ax.set_title(title, fontsize=10)
        ax.set_xlabel("focal change applied to the 6 new views (%)")
        ax.set_ylim(-0.02, 1.02)
    axes[0].set_ylabel("share of splits where the jackknife test fires")
    h, lab = axes[0].get_legend_handles_labels()
    fig.legend(h, lab, fontsize=8, loc="lower center", ncol=3, frameon=False)
    fig.suptitle("Jackknife update test by corner localiser (OpenCV stereo set, 120 splits per point, k = 6)", fontsize=10)
    fig.tight_layout(rect=(0, 0.07, 1, 1))
    fig.savefig(os.path.join(HERE, "power.png"), dpi=130)


if __name__ == "__main__":
    main()
