"""Milestone 4f: does the view jackknife stop overstating f's spread as the view set grows?

    python3 experiments/m4f_setsize/analyse.py      # about a minute; reads this milestone's results.json.gz

Per camera, on cornerSubPix 5x5 corners, from every solved subset of 3..12 of the 13 views:
the real spread of f by disjoint pairs (DP, n <= 6) and around the all-view f (A13, any n), the
leave-one-view-out jackknife J(n) and the solver's reported sigma R(n). Scores H48-H51 (LOG.md,
2026-11-13, milestone 4f planned) and writes summary.json and ratio.png.
"""
import gzip, itertools, json, os, sys
import numpy as np
from scipy import stats

HERE = os.path.dirname(os.path.abspath(__file__))
CAMS = ("left", "right")
NS = range(3, 13)
MAD = 1.4826


def ok(s):
    return s is not None and s["status"] > 0 and np.isfinite(s["f"])


def load(path=os.path.join(HERE, "results.json.gz")):
    with gzip.open(path, "rt") as fh:
        res = json.load(fh)
    out = {cam: {} for cam in CAMS}
    for r in res["solutions"]:
        out[r["cam"]][tuple(r["views"])] = r["sol"]
    return out


def per_size(sols, drop=None):
    """Every quantity of the plan for one camera; `drop` leaves out every set holding that view."""
    f13 = sols[tuple(range(13))]["f"]
    fs = {v: s["f"] / f13 - 1 for v, s in sols.items() if ok(s) and len(v) < 13 and (drop is None or drop not in v)}
    sf = {v: sols[v]["sf"] / f13 for v in fs}
    out = {}
    for n in NS:
        sets = [v for v in itertools.combinations(range(13), n) if drop is None or drop not in v]
        have = [v for v in sets if v in fs]
        x = np.array([fs[v] for v in have])
        row = dict(n=n, sets=len(sets), converged=len(have))
        row["a13"] = float(np.sqrt(np.mean(x ** 2) / (1 - n / 13)))
        row["a13_robust"] = float(MAD * np.median(np.abs(x)) / np.sqrt(1 - n / 13))
        if 2 * n <= 13:
            d = []
            for a in have:
                rest = [u for u in range(13) if u not in a and u != drop]
                for b in itertools.combinations(rest, n):
                    if a < b and b in fs:
                        d.append(fs[a] - fs[b])
            d = np.array(d)
            row["dp"] = float(np.sqrt(np.mean(d ** 2) / 2))
            row["dp_robust"] = float(MAD * np.median(np.abs(d)) / np.sqrt(2))
            row["dp_pairs"] = len(d)
        if n >= 4:
            vj = []
            for v in have:
                loo = [tuple(u for u in v if u != w) for w in v]
                if all(t in fs for t in loo):
                    a = np.array([fs[t] for t in loo])
                    vj.append((n - 1) / n * np.sum((a - a.mean()) ** 2))
            vj = np.array(vj)
            row["jack"] = float(np.sqrt(np.mean(vj))) if len(vj) else float("nan")
            row["jack_robust"] = float(np.sqrt(np.median(vj))) if len(vj) else float("nan")
            row["jack_sets"] = len(vj)
        row["reported"] = float(np.sqrt(np.mean([sf[v] ** 2 for v in have])))
        out[n] = row
    return out


def ratios(tab):
    r = {}
    for n, row in tab.items():
        if n < 4:
            continue
        r[n] = dict(J_a13=row["jack"] / row["a13"], R_a13=row["reported"] / row["a13"],
                    J_a13_robust=row["jack_robust"] / row["a13_robust"])
        if "dp" in row:
            r[n].update(J_dp=row["jack"] / row["dp"], a13_dp=row["a13"] / row["dp"],
                        J_dp_robust=row["jack_robust"] / row["dp_robust"])
    return r


def score(rat):
    H = {}
    h = {}
    for cam in CAMS:
        rr = rat[cam]
        rho = stats.spearmanr(list(range(4, 11)), [rr[n]["J_a13"] for n in range(4, 11)]).statistic
        h[cam] = dict(J_dp_4=rr[4]["J_dp"], J_dp_6=rr[6]["J_dp"], spearman_4_10=float(rho),
                      holds=bool(rr[4]["J_dp"] > rr[6]["J_dp"] and rho <= -0.8))
    h["holds"] = all(h[c]["holds"] for c in CAMS)
    H["H48"] = h
    h = {cam: {n: rat[cam][n]["J_a13"] for n in (8, 9, 10)} for cam in CAMS}
    h["holds"] = all(0.67 <= h[c][n] <= 1.5 for c in CAMS for n in (8, 9, 10))
    H["H49"] = h
    h = {cam: {n: rat[cam][n]["a13_dp"] for n in (4, 5, 6)} for cam in CAMS}
    h["holds"] = all(0.8 <= h[c][n] <= 1.25 for c in CAMS for n in (4, 5, 6))
    H["H50"] = h
    h = {cam: {n: rat[cam][n]["R_a13"] for n in range(4, 11)} for cam in CAMS}
    h["holds"] = all(h[c][n] <= 0.67 for c in CAMS for n in range(4, 11))
    H["H51"] = h
    return H


def figure(tab, rat, path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, axes = plt.subplots(1, 2, figsize=(10, 3.8))
    for cam, c in zip(CAMS, ("#1f6fb2", "#c4512b")):
        ns = sorted(n for n in rat[cam] if n <= 10)
        axes[0].plot([n for n in NS], [100 * tab[cam][n]["a13"] for n in NS], "-o", color=c, label=f"{cam}: real (A13)")
        axes[0].plot([n for n in NS if n >= 4], [100 * tab[cam][n]["jack"] for n in NS if n >= 4], "--s", color=c, label=f"{cam}: jackknife")
        axes[0].plot([n for n in NS if "dp" in tab[cam][n]], [100 * tab[cam][n]["dp"] for n in NS if "dp" in tab[cam][n]], ":^", color=c, label=f"{cam}: real (disjoint pairs)")
        axes[1].plot(ns, [rat[cam][n]["J_a13"] for n in ns], "-o", color=c, label=f"{cam}: jackknife / real")
        axes[1].plot(ns, [rat[cam][n]["R_a13"] for n in ns], ":v", color=c, label=f"{cam}: reported σ / real")
    axes[0].set_yscale("log")
    axes[0].set_xlabel("views in the set")
    axes[0].set_ylabel("sd of f (% of f)")
    axes[0].legend(fontsize=7)
    axes[1].axhspan(0.67, 1.5, color="0.9")
    axes[1].axhline(1, color="0.5", lw=0.8)
    axes[1].set_yscale("log")
    axes[1].set_xlabel("views in the set")
    axes[1].set_ylabel("predicted / real sd")
    axes[1].legend(fontsize=7)
    fig.suptitle("Milestone 4f: f's spread against view-set size, 5×5 corners (shaded: 0.67–1.5)", fontsize=10)
    fig.tight_layout()
    fig.savefig(path, dpi=130)


def main():
    sols = load()
    tab = {cam: per_size(sols[cam]) for cam in CAMS}
    rat = {cam: ratios(tab[cam]) for cam in CAMS}
    H = score(rat)
    sens = {}
    for cam in CAMS:
        runs = [ratios(per_size(sols[cam], drop=v)) for v in range(13)]
        sens[cam] = {n: {k: [float(min(r[n][k] for r in runs)), float(max(r[n][k] for r in runs))]
                         for k in ("J_a13", "R_a13") + (("J_dp", "a13_dp") if "J_dp" in rat[cam][n] else ())}
                     for n in rat[cam]}
    S = dict(table=tab, ratios=rat, hypotheses=H, drop_one_view_range=sens)
    for cam in CAMS:
        print(cam)
        for n in NS:
            t = tab[cam][n]
            print(f"  n={n:2d} conv {t['converged']}/{t['sets']} a13 {100*t['a13']:.2f}% dp {100*t.get('dp', np.nan):.2f}% "
                  f"jack {100*t.get('jack', np.nan):.2f}% rep {100*t['reported']:.2f}%  "
                  + (" ".join(f"{k}={v:.2f}" for k, v in rat[cam][n].items()) if n in rat[cam] else ""))
    for k, v in H.items():
        print(k, json.dumps(v, default=float))
    with open(os.path.join(HERE, "summary.json"), "w") as fh:
        json.dump(S, fh, indent=1, default=float)
    figure(tab, rat, os.path.join(HERE, "ratio.png"))


if __name__ == "__main__":
    main()
