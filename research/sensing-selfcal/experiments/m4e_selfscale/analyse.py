"""Milestone 4e: the f-alone update test with a threshold set by the old views' own split-half spread.

    python3 experiments/m4e_selfscale/analyse.py      # seconds; reads 4b's, 4d's and this run's solves

For each old set of 7 views, every 4 + 3 partition (35) gives r = (f_A - f_B)/f_old; the per-view scale
tau^2 = median(r^2) / 0.45494 / (1/4 + 1/3) predicts the variance of the relative update,
v = tau^2 (1/7 + 1/k), and z_H^2 = (df/f_old)^2 / v is compared with F_{1,6} (primary) and chi^2_1.
Decisions, disturbances and the adoption rule are milestone 4c's (`score`, unchanged). Scores H43-H47
(LOG.md, 2026-11-13) and writes summary.json and power.png.
"""
import gzip, itertools, json, os, sys
import numpy as np
from scipy import stats

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "src"))
from selfcal import decide  # noqa: E402
import importlib.util  # noqa: E402

_spec = importlib.util.spec_from_file_location("m4c", os.path.join(ROOT, "experiments", "m4c_reference", "analyse.py"))
m4c = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m4c)
CAMS, OTHER, wilson, SCEN = m4c.CAMS, m4c.OTHER, m4c.wilson, m4c.SCEN
METHODS = ("subpix11", "sb", "subpix5")
NAME = {"subpix11": "cornerSubPix 11×11", "sb": "findChessboardCornersSB", "subpix5": "cornerSubPix 5×5"}
MED_CHI2_1 = float(stats.chi2.ppf(0.5, 1))          # 0.45494
CRIT = {"H_F": float(stats.f.ppf(0.99, 1, 6)),      # 13.745, primary
        "H_chi2": float(stats.chi2.ppf(0.99, 1))}   # 6.635
MIN_PARTS = 20


def load():
    res = None
    for rel in ("m4b_viewcov", "m4d_window", "m4e_selfscale"):
        with gzip.open(os.path.join(ROOT, "experiments", rel, "results.json.gz"), "rt") as fh:
            r = json.load(fh)
        if res is None:
            res = r
        else:
            assert r["splits"] == res["splits"]
            res["solutions"] += r["solutions"]
    return res


def ok(s):
    return s is not None and s["status"] > 0


def self_scale(sols, m, cam, old):
    """(tau^2, number of usable partitions, r values) for one old set."""
    so = sols.get((m, cam, tuple(old)))
    if not ok(so):
        return np.nan, 0, []
    r = []
    for a in itertools.combinations(old, 4):
        b = tuple(v for v in old if v not in a)
        sa, sb = sols.get((m, cam, a)), sols.get((m, cam, b))
        if ok(sa) and ok(sb):
            r.append((sa["f"] - sb["f"]) / so["f"])
    if len(r) < MIN_PARTS:
        return np.nan, len(r), r
    return float(np.median(np.square(r)) / MED_CHI2_1 / (1 / 4 + 1 / 3)), len(r), r


def main():
    res = load()
    sols = {(r["method"], r["cam"], tuple(r["views"])): r["sol"] for r in res["solutions"]}
    missing = sum(1 for m in METHODS for cam in CAMS for sp in res["splits"] if sp["k"] >= 4
                  for a in itertools.combinations(sp["old"], 4) if (m, cam, a) not in sols)
    assert missing == 0, missing
    rows, q = m4c.score(res, METHODS)
    split = {(sp["k"], sp["i"]): sp for sp in res["splits"]}
    tau = {}
    for m in METHODS:
        for cam in CAMS:
            for sp in res["splits"]:
                if sp["k"] >= 4:
                    tau[(m, cam, tuple(sp["old"]))] = self_scale(sols, m, cam, sp["old"])
    for r in rows:
        old = tuple(split[(r["k"], r["i"])]["old"])
        ocam = OTHER[r["cam"]] if r["scen"] == "S3" else r["cam"]
        t2, npart, _ = tau[(r["m"], ocam, old)]
        f_old = r["f_new"] - r["df"]
        r["v"] = t2 * (1 / 7 + 1 / r["k"])
        r["rel"] = r["df"] / f_old
        r["zH2"] = r["rel"] ** 2 / r["v"] if np.isfinite(t2) else np.nan
        r["npart"] = npart
        for ref, c in CRIT.items():
            fired = bool(np.isfinite(r["zH2"]) and r["zH2"] > c)
            r["det"][ref] = fired
            dec = decide(1.0 if fired else 0.0, r["sf_rep"], r["f_new"], crit=0.5)
            r["harmful"][ref] = bool(dec == "adopt" and r["e_new"] - r["e_old"] > 0.005)
        r["det"]["H_F_or_W"] = r["det"]["H_F"] or r["det"]["chi2"]   # exploratory union with 4b's W test
        dec = decide(1.0 if r["det"]["H_F_or_W"] else 0.0, r["sf_rep"], r["f_new"], crit=0.5)
        r["harmful"]["H_F_or_W"] = bool(dec == "adopt" and r["e_new"] - r["e_old"] > 0.005)
    n_undecided = {m: sum(1 for r in rows if r["m"] == m and not np.isfinite(r["zH2"])) for m in METHODS}

    def sel(**kw):
        out = rows
        for k, v in kw.items():
            out = [r for r in out if (v(r[k]) if callable(v) else r[k] == v)]
        return out

    def rate(rs, ref, key="det"):
        rs = [r for r in rs if np.isfinite(r["zH2"])]
        x = sum(bool(r[key][ref]) for r in rs)
        return dict(n=len(rs), rate=x / len(rs) if rs else float("nan"), ci95=wilson(x, len(rs)))

    pm2 = lambda s: s in (0.98, 1.02)  # noqa: E731
    REFS = ("H_F", "H_chi2", "E_1", "O_1", "chi2_1", "chi2", "H_F_or_W")
    H = {}
    m = "subpix5"
    h = {cam: rate(sel(m=m, scen="S0", cam=cam), "H_F") for cam in CAMS}
    h["holds"] = all(h[c]["rate"] <= 0.03 for c in CAMS)
    H["H43"] = h
    h = {"pooled": rate(sel(m=m, scen="S1", s=pm2, k=6), "H_F")}
    h["holds"] = h["pooled"]["rate"] >= 0.40
    H["H44"] = h

    def scale_ratio(mm, cam, k=6):
        rs = [r for r in sel(m=mm, scen="S0", cam=cam, k=k) if np.isfinite(r["zH2"])]
        x = np.array([r["rel"] for r in rs])
        real = float(np.std(x, ddof=1))
        pred = float(np.sqrt(np.mean([r["v"] for r in rs])))
        return dict(real_sd_pct=100 * real, pred_sd_pct=100 * pred, ratio=real / pred, n=len(rs))
    h = {cam: scale_ratio(m, cam) for cam in CAMS}
    h["holds"] = all(0.67 <= h[c]["ratio"] <= 1.5 for c in CAMS)
    H["H45"] = h

    def q99(mm, cam):
        return float(np.quantile([r["zH2"] for r in sel(m=mm, scen="S0", cam=cam) if np.isfinite(r["zH2"])], 0.99))
    h = {cam: q99(m, cam) for cam in CAMS}
    h["factor"] = max(h.values()) / min(h.values())
    h["holds"] = h["factor"] <= 2.0
    H["H46"] = h
    h = {"all": rate(sel(m=m), "H_F", "harmful")}
    h["holds"] = h["all"]["rate"] <= 0.015
    H["H47"] = h

    # unscored
    tab = []
    for mm in METHODS:
        for name, s, du in SCEN:
            for k in (4, 5, 6, "4-6"):
                rs = sel(m=mm, scen=name, s=s, du=du, k=(lambda x: x >= 4) if k == "4-6" else k)
                if rs:
                    tab.append(dict(m=mm, scen=name, s=s, du=du, k=k, n=len(rs),
                                    det={ref: rate(rs, ref)["rate"] for ref in REFS},
                                    harmful={ref: rate(rs, ref, "harmful")["rate"] for ref in REFS}))
    tau_tab = {}
    for mm in METHODS:
        for cam in CAMS:
            t = [np.sqrt(v[0]) for (a, c, _), v in tau.items() if a == mm and c == cam and np.isfinite(v[0])]
            tau_tab[f"{mm}/{cam}"] = dict(n_old_sets=len(t), tau_pct_median=100 * float(np.median(t)),
                                          tau_pct_p10=100 * float(np.quantile(t, 0.1)), tau_pct_p90=100 * float(np.quantile(t, 0.9)),
                                          parts_median=float(np.median([v[1] for (a, c, _), v in tau.items() if a == mm and c == cam])))
    # Post hoc (written after H45 failed): how does the spread of f over view subsets scale with n?
    # Robust sd (1.4826 MAD) of f around the all-view f, over every solved subset of each size. If each
    # view adds an independent offset, Var(f_S - f_all) = tau^2 (1/n - 1/13) (a subset shares its views
    # with the all-view set), so per_view_pct = sd / sqrt(1/n - 1/13) should not depend on n.
    by_n = {}
    for mm in METHODS:
        for cam in CAMS:
            fall = sols[(mm, cam, tuple(range(13)))]["f"]
            d = {}
            for (a, c, v), so in sols.items():
                if a == mm and c == cam and ok(so) and len(v) < 13:
                    d.setdefault(len(v), []).append(so["f"] / fall - 1)
            by_n[f"{mm}/{cam}"] = {n: dict(count=len(x), rms_pct=100 * float(np.sqrt(np.mean(np.square(x)))),
                                          mad_pct=100 * 1.4826 * float(np.median(np.abs(x))),
                                          per_view_pct=100 * 1.4826 * float(np.median(np.abs(x)) / np.sqrt(1 / n - 1 / 13)))
                                   for n, x in sorted(d.items()) if len(x) >= 20}
    S = {"crit": CRIT, "spread_by_n_post_hoc": by_n, "min_partitions": MIN_PARTS, "n_decisions": len(rows), "undecided": n_undecided,
         "n_solves_m4e": sum(1 for r in res["solutions"]), "hypotheses": H, "tau": tau_tab,
         "scale_ratio": {f"{mm}/{cam}": scale_ratio(mm, cam) for mm in METHODS for cam in CAMS},
         "zH2_99": {f"{mm}/{cam}": q99(mm, cam) for mm in METHODS for cam in CAMS},
         "false_alarm_by_cam": {mm: {ref: {cam: rate(sel(m=mm, scen="S0", cam=cam), ref)["rate"] for cam in CAMS}
                                     for ref in REFS} for mm in METHODS},
         "harmful_all": {mm: {ref: rate(sel(m=mm), ref, "harmful") for ref in REFS} for mm in METHODS},
         "table": tab}
    with open(os.path.join(HERE, "summary.json"), "w") as fh:
        json.dump(S, fh, indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o))
    print("decisions", len(rows), "undecided", n_undecided)
    print("tau", json.dumps(tau_tab))
    print("scale ratio", json.dumps(S["scale_ratio"]))
    for key, v in by_n.items():
        print("spread by n", key, {n: (round(x["mad_pct"], 2), round(x["per_view_pct"], 2), x["count"]) for n, x in v.items()})
    print("zH2 99th", json.dumps(S["zH2_99"]))
    for hn, v in H.items():
        print(hn, "holds" if v["holds"] else "REFUTED", json.dumps({k: v[k] for k in v if k != "holds"}))
    print("false alarms by cam", json.dumps(S["false_alarm_by_cam"]))
    print("harmful", json.dumps({mm: {r: round(v["rate"], 4) for r, v in S["harmful_all"][mm].items()} for mm in METHODS}))
    for t in tab:
        if t["k"] == 6 or (t["k"] == "4-6" and t["scen"] in ("S0", "S3")):
            print(t["m"], t["scen"], t["s"], t["du"], t["k"], {r: round(x, 3) for r, x in t["det"].items()})
    figure(tab)


def figure(tab):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, axes = plt.subplots(1, 3, figsize=(13, 4.4), sharey=True)
    xs = sorted(set(m4c.S_LIST) | {1.0})
    cols = {"H_F": ("#c0392b", "own split-half scale, F₁,₆ (4e)"), "E_1": ("#1b2f6b", "other camera's 99th pct (4c/4d)"),
            "O_1": ("#b0b0b0", "own 99th pct (oracle)")}
    for ax, mm in zip(axes, METHODS):
        for ref, (c, lab) in cols.items():
            ys = []
            for s in xs:
                name = "S0" if s == 1.0 else "S1"
                r = [t for t in tab if t["m"] == mm and t["scen"] == name and t["s"] == s and t["k"] == 6]
                ys.append(r[0]["det"][ref] if r else np.nan)
            ax.plot([100 * (s - 1) for s in xs], ys, "o-", color=c, label=lab)
        ax.axhline(0.01, color="grey", lw=0.8, ls=":")
        ax.set_title(NAME[mm] + " corners", fontsize=10)
        ax.set_xlabel("focal change applied to the 6 new views (%)")
        ax.set_ylim(-0.02, 1.02)
    axes[0].set_ylabel("share of splits where the f-alone test fires")
    h, lab = axes[0].get_legend_handles_labels()
    fig.legend(h, lab, fontsize=8, loc="lower center", ncol=3, frameon=False)
    fig.suptitle("f-alone update test: threshold from the old views' own split-half spread vs borrowed (k = 6)", fontsize=10)
    fig.tight_layout(rect=(0, 0.07, 1, 1))
    fig.savefig(os.path.join(HERE, "power.png"), dpi=130)


if __name__ == "__main__":
    main()
