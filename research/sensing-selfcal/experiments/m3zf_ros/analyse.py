"""Milestone 3zf: fold check and OpenCV corner round trip over deployed robots' ROS calibrations.

    python3 experiments/m3zf_ros/analyse.py      # reads calibs.json (from fetch.py), writes summary.json, fleet.png

Plan and hypotheses H299-H304: LOG.md, "Milestone 3zf planned". Needs numpy and OpenCV
(opencv-python-headless); matplotlib for the figure (skipped without it). The fold check, round
trip and slope diagnostic are milestone 3ze's (experiments/m3ze_fleet/analyse.py), imported.
"""
import json
import os
import sys

import numpy as np
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from foldcheck import check  # noqa: E402
import importlib.util  # noqa: E402

_spec = importlib.util.spec_from_file_location("m3ze_analyse", os.path.join(HERE, "..", "m3ze_fleet", "analyse.py"))
_m3ze = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_m3ze)
round_trip, min_slope = _m3ze.round_trip, _m3ze.min_slope   # milestone 3ze's, unchanged

KEYS = ("fx", "fy", "cx", "cy", "k1", "k2", "p1", "p2", "k3")
IT100 = (cv2.TERM_CRITERIA_COUNT | cv2.TERM_CRITERIA_EPS, 100, 1e-12)


def normalise(c):
    """dict with KEYS, width, height; raises on a rational or other term beyond the fifth."""
    D = list(c["D"]) + [0.0] * (5 - len(c["D"]))
    if any(x != 0 for x in D[5:]):
        raise ValueError("terms beyond k3 are not supported: " + c["url"])
    out = dict(zip(("k1", "k2", "p1", "p2", "k3"), D[:5]), fx=c["fx"], fy=c["fy"], cx=c["cx"], cy=c["cy"],
               width=c["width"], height=c["height"])
    return out


def distinct(cams):
    groups = {}
    for c in cams:
        n = normalise(c)
        key = tuple(float(f"{n[k]:.6g}") for k in KEYS) + (n["width"], n["height"])
        g = groups.setdefault(key, {"cam": n, "sources": [], "repos": set()})
        g["sources"].append(c["url"].replace("https://raw.githubusercontent.com/", ""))
        g["repos"].add(c["repo"])
    for g in groups.values():
        g["repos"] = sorted(g["repos"])
    return list(groups.values())


def is_duckiebot(g):
    return g["repos"][0].startswith("duckietown/") and (g["cam"]["width"], g["cam"]["height"]) == (640, 480)


def row(g):
    c = g["cam"]
    r = check(c["fx"], c["fy"], c["cx"], c["cy"], c["width"], c["height"], c["k1"], c["k2"], c["k3"])
    return dict(sources=g["sources"], repos=g["repos"], duckiebot=is_duckiebot(g), **{k: c[k] for k in KEYS},
                width=c["width"], height=c["height"], fold_radius_px=r["fold_radius_px"],
                corner_radius_px=r["corner_radius_px"], folds_inside=r["folds_inside"],
                corners_beyond_fold=r.get("corners_beyond_fold", 0), margin_px=r["margin_px"],
                round_trip_default_px=round_trip(c), round_trip_100_px=round_trip(c, IT100), min_slope=min_slope(c))


def q(a):
    a = np.asarray(a, float)
    return dict(median=float(np.median(a)), q25=float(np.percentile(a, 25)), q75=float(np.percentile(a, 75)),
                min=float(a.min()), max=float(a.max()))


def main():
    d = json.load(open(os.path.join(HERE, "calibs.json")))
    cams = d["cameras"]
    zero = [c for c in cams if all(x == 0 for x in c["D"])]
    groups = distinct([c for c in cams if c not in zero])
    rows = [row(g) for g in groups]
    duck = [r for r in rows if r["duckiebot"]]
    apollo = [r for r in rows if r["repos"] == ["ApolloAuto/apollo"]]
    dfold = [r for r in duck if r["folds_inside"]]
    mono = [r for r in rows if not r["folds_inside"]]
    med = {k: float(np.median([r[k] for r in duck])) for k in KEYS}
    med.update(width=640, height=480)
    mr = check(med["fx"], med["fy"], med["cx"], med["cy"], 640, 480, med["k1"], med["k2"], med["k3"])
    median_model = dict(**med, fold_radius_px=mr["fold_radius_px"], corner_radius_px=mr["corner_radius_px"],
                        folds_inside=mr["folds_inside"], round_trip_default_px=round_trip(med),
                        min_slope=min_slope(med))
    hyp = {
        "H299": dict(held=len(dfold) >= 0.10 * len(duck), folds_inside=len(dfold), of=len(duck)),
        "H300": dict(held=all(r["k3"] == 0 for r in duck), k3_nonzero=sum(r["k3"] != 0 for r in duck), of=len(duck)),
        "H301": dict(held=None if not dfold else all(max(r["round_trip_default_px"]) > 1 for r in dfold),
                     at_most_1px=sum(max(r["round_trip_default_px"]) <= 1 for r in dfold), of=len(dfold)),
        "H302": dict(held=bool(mono) and all(max(r["round_trip_default_px"]) <= 0.5 for r in mono),
                     over_half_px=sum(max(r["round_trip_default_px"]) > 0.5 for r in mono), of=len(mono),
                     worst_px=max(max(r["round_trip_default_px"]) for r in mono)),
        "H303": dict(held=not mr["folds_inside"], fold_radius_px=mr["fold_radius_px"],
                     corner_radius_px=mr["corner_radius_px"]),
        "H304": dict(held=not any(r["folds_inside"] for r in apollo), folds_inside=sum(r["folds_inside"] for r in apollo),
                     of=len(apollo)),
    }
    spread = {k: q([r[k] for r in duck]) for k in ("fx", "k1", "k2")}
    beyond = [r["corners_beyond_fold"] for r in dfold]
    unscored = dict(
        duckiebot_spread=spread, median_model=median_model,
        folding_corners_beyond=dict((n, beyond.count(n)) for n in range(1, 5)),
        folding_fold_radius_px=q([r["fold_radius_px"] for r in dfold]) if dfold else None,
        folding_round_trip_default_px=q([max(r["round_trip_default_px"]) for r in dfold]) if dfold else None,
        folding_round_trip_100_px=q([max(r["round_trip_100_px"]) for r in dfold]) if dfold else None,
        monotone_duckiebot_round_trip_default_px=q([max(r["round_trip_default_px"]) for r in duck if not r["folds_inside"]])
        if len(dfold) < len(duck) else None,
        monotone_min_slope=q([r["min_slope"] for r in mono]),
        duckiebot_never_fold=sum(r["fold_radius_px"] is None for r in duck),
        cross_set_duplicates=sum(len(r["repos"]) > 1 for r in duck),
    )
    # Post hoc (added after the first run, which found the default round trip off by pixels on
    # calibrations that do not fold): is OpenCV's default criterion 5 iterations, and how many
    # iterations does each monotone calibration need to bring the corner round trip under 0.1 px?
    five = (cv2.TERM_CRITERIA_COUNT, 5, 0.01)
    same = all(np.allclose(round_trip(g["cam"]), round_trip(g["cam"], five), atol=1e-9) for g in groups)
    counts = (5, 10, 20, 50, 100, 200)
    need = []
    for r, g in zip(rows, groups):
        if r["folds_inside"]:
            continue
        errs = [max(round_trip(g["cam"], (cv2.TERM_CRITERIA_COUNT, n, 0))) for n in counts]
        eps = [max(round_trip(g["cam"], (cv2.TERM_CRITERIA_COUNT | cv2.TERM_CRITERIA_EPS, n, 1e-12))) for n in counts]
        need.append(dict(duckiebot=r["duckiebot"], errs=errs, eps=eps,
                         n_for_0p1=next((n for n, e in zip(counts, errs) if e < 0.1), None), min_slope=r["min_slope"]))
    nd = [x for x in need if x["duckiebot"]]
    unscored["post_hoc_iterations"] = dict(
        default_equals_count5_eps0p01=bool(same), counts=list(counts),
        duckiebot_share_under_0p1px={n: sum(x["errs"][i] < 0.1 for x in nd) / len(nd) for i, n in enumerate(counts)},
        all_share_under_0p1px={n: sum(x["errs"][i] < 0.1 for x in need) / len(need) for i, n in enumerate(counts)},
        duckiebot_median_px={n: float(np.median([x["errs"][i] for x in nd])) for i, n in enumerate(counts)},
        duckiebot_over_1px_count_only={n: sum(x["errs"][i] > 1 for x in nd) for i, n in enumerate(counts)},
        duckiebot_max_px_count_only={n: float(max(x["errs"][i] for x in nd)) for i, n in enumerate(counts)},
        # the same iteration budgets with the EPS flag set (eps 1e-12, so only the count stops it)
        duckiebot_share_under_0p1px_eps={n: sum(x["eps"][i] < 0.1 for x in nd) / len(nd) for i, n in enumerate(counts)},
        duckiebot_max_px_eps={n: float(max(x["eps"][i] for x in nd)) for i, n in enumerate(counts)},
        all_max_px_eps={n: float(max(x["eps"][i] for x in need)) for i, n in enumerate(counts)},
        spearman_slope_vs_default_error=float(np.corrcoef(np.argsort(np.argsort([x["min_slope"] for x in nd])),
                                                          np.argsort(np.argsort([x["errs"][0] for x in nd])))[0, 1]))
    f = np.array([r["fx"] for r in duck])
    unscored["post_hoc_f_outliers"] = dict(rule="fx more than 20% from the fleet median",
                                           n=int((abs(f / np.median(f) - 1) > 0.2).sum()), of=len(duck))
    out = dict(opencv=cv2.__version__, sources=d["sources"], files=len(d["files"]), cameras=len(cams),
               all_zero=len(zero), distinct=len(groups), duckiebot=len(duck), apollo=len(apollo),
               other=len(rows) - len(duck) - len(apollo), hypotheses=hyp, unscored=unscored, rows=rows)
    json.dump(out, open(os.path.join(HERE, "summary.json"), "w"), indent=1)

    print(f"OpenCV {cv2.__version__}; {len(cams)} cameras, {len(zero)} all-zero, {len(groups)} distinct: "
          f"{len(duck)} Duckiebot, {len(apollo)} Apollo, {out['other']} other")
    print(f"{'source':52s} {'size':>9s} {'f':>7s} {'k1':>8s} {'k2':>8s} {'k3':>7s} {'fold':>7s} {'corner':>7s} "
          f"{'beyond':>6s} {'rt5':>8s} {'rt100':>8s} {'slope':>6s}")
    for r in sorted(rows, key=lambda r: (r["margin_px"] is None, r["margin_px"] or 0)):
        fr = f"{r['fold_radius_px']:.1f}" if r["fold_radius_px"] else "none"
        src = r["sources"][0].split("/", 3)[-1][-52:]
        print(f"{src:52s} {int(r['width']):4d}x{int(r['height']):<4d} {r['fx']:7.1f} {r['k1']:8.4f} {r['k2']:8.4f} "
              f"{r['k3']:7.3f} {fr:>7s} {r['corner_radius_px']:7.1f} {r['corners_beyond_fold']:6d} "
              f"{max(r['round_trip_default_px']):8.3g} {max(r['round_trip_100_px']):8.3g} {r['min_slope']:6.3f}")
    for k, v in hyp.items():
        print(k, {True: "held", False: "refuted", None: "untestable"}[v["held"]], {a: b for a, b in v.items() if a != "held"})
    print("unscored:", json.dumps({k: v for k, v in unscored.items() if k not in ("median_model", "post_hoc_iterations")},
                                  default=str))
    print("post hoc, iterations:", json.dumps(unscored["post_hoc_iterations"]))
    print("median model:", {k: round(v, 4) if isinstance(v, float) else v for k, v in median_model.items()})

    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        return 0
    # (k1, k2) plane for a two-term model: where does it fold inside a 640x480 image at the fleet's
    # median f and principal point? Shade the region whose fold radius is below the corner radius.
    k1g, k2g = np.meshgrid(np.linspace(-0.45, -0.15, 301), np.linspace(-0.05, 0.25, 301))
    xc = max(np.hypot((u - med["cx"]) / med["fx"], (v - med["cy"]) / med["fy"])
             for u, v in ((0, 0), (640, 0), (0, 480), (640, 480)))
    # folds inside iff d rho/dx <= 0 for some x <= x_fold with rho(x_fold) reaching the corner;
    # equivalently the peak of rho over [0, inf) lies below the corner's distorted radius.
    xs = np.linspace(1e-3, 3.0, 1500)[:, None, None]
    u = xs * xs
    rho = xs * (1 + k1g * u + k2g * u * u)
    drho = 1 + 3 * k1g * u + 5 * k2g * u * u
    first = np.argmax(drho <= 0, axis=0)
    has = (drho <= 0).any(axis=0)
    peak = np.take_along_axis(rho, first[None], axis=0)[0]
    inside = has & (peak < xc)
    fig, (ax, bx) = plt.subplots(1, 2, figsize=(10, 4.4))
    ax.contourf(k1g, k2g, inside.astype(float), levels=[0.5, 1.5], colors=["#f4c7c3"])
    ax.contour(k1g, k2g, inside.astype(float), levels=[0.5], colors=["C3"], linewidths=0.8)
    shown = [r for r in duck if -0.45 <= r["k1"] <= -0.15 and -0.05 <= r["k2"] <= 0.25]
    ax.scatter([r["k1"] for r in shown], [r["k2"] for r in shown], s=10, c="C0",
               label=f"Duckiebot calibration ({len(shown)} shown, {len(duck) - len(shown)} off the axes)")
    ax.scatter([med["k1"]], [med["k2"]], s=60, facecolors="none", edgecolors="k", label="fleet median model")
    ax.set_xlim(-0.45, -0.15)
    ax.set_ylim(-0.05, 0.25)
    ax.set_xlabel("k$_1$")
    ax.set_ylabel("k$_2$")
    ax.set_title(f"None of {len(duck)} folds inside its image\n(shaded: a two-term model at the median f would)", fontsize=9)
    ax.legend(fontsize=7, loc="upper left")
    ph = unscored["post_hoc_iterations"]
    bx.plot(counts, [max(ph["duckiebot_median_px"][n], 1e-3) for n in counts], "o-", c="C1",
            label="COUNT only (OpenCV's default type), median")
    bx.plot(counts, [ph["duckiebot_max_px_count_only"][n] for n in counts], "o--", c="C1", label="COUNT only, worst")
    bx.plot(counts, [max(ph["duckiebot_max_px_eps"][n], 1e-3) for n in counts], "s--", c="C0",
            label="COUNT|EPS (eps 1e-12), worst")
    bx.axvline(5, color="0.6", lw=0.8)
    bx.text(5.3, 200, "default: 5", fontsize=7, color="0.4")
    bx.set_xscale("log")
    bx.set_yscale("log")
    bx.set_ylim(1e-3, 1e3)
    bx.set_xlabel("undistortPoints iterations")
    bx.set_ylabel("corner round-trip error, px (floored at 0.001)")
    bx.set_title("cv2.undistortPoints then projectPoints at the image corners", fontsize=9)
    bx.legend(fontsize=7)
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "fleet.png"), dpi=130)
    return 0


if __name__ == "__main__":
    sys.exit(main())
