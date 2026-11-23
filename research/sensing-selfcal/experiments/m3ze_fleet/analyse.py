"""Milestone 3ze: fold check and OpenCV corner round trip over published SLAM/VIO calibrations.

    python3 experiments/m3ze_fleet/analyse.py      # reads calibs.json (from fetch.py), writes summary.json, fleet.png

Plan and hypotheses H295-H298: LOG.md, "Milestone 3ze planned". Needs numpy and OpenCV
(opencv-python-headless); matplotlib for the figure (skipped without it).
"""
import json
import os
import sys

import numpy as np
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from foldcheck import check  # noqa: E402

KEYS = ("fx", "fy", "cx", "cy", "k1", "k2", "p1", "p2", "k3")


def distinct(cams):
    """Merge cameras with the same intrinsics and distortion (6 significant figures); fill a
    missing image size from a duplicate that has one (ORB-SLAM2's files give no size)."""
    groups = {}
    for c in cams:
        key = tuple(float(f"{c[k]:.6g}") for k in KEYS)
        g = groups.setdefault(key, {"cam": dict(c), "sources": []})
        g["sources"].append(c["url"].replace("https://raw.githubusercontent.com/", "") + "#" + c["cam"])
        if g["cam"].get("width") is None and c.get("width") is not None:
            g["cam"]["width"], g["cam"]["height"] = c["width"], c["height"]
    return list(groups.values())


def corners(w, h):
    return np.array([[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]], dtype=np.float64)


def round_trip(c, criteria=None):
    """Max pixel error of undistortPoints -> projectPoints at the four corner pixels."""
    K = np.array([[c["fx"], 0, c["cx"]], [0, c["fy"], c["cy"]], [0, 0, 1]], dtype=np.float64)
    D = np.array([c[k] for k in ("k1", "k2", "p1", "p2", "k3")], dtype=np.float64)
    px = corners(c["width"], c["height"]).reshape(-1, 1, 2)
    if criteria is None:
        und = cv2.undistortPoints(px, K, D)
    else:
        und = cv2.undistortPoints(px, K, D, criteria=criteria)
    obj = np.concatenate([und.reshape(-1, 2), np.ones((4, 1))], axis=1)
    back, _ = cv2.projectPoints(obj, np.zeros(3), np.zeros(3), K, D)
    err = np.linalg.norm(back.reshape(-1, 2) - px.reshape(-1, 2), axis=1)
    return [float(e) for e in err]


def min_slope(c, n=4000):
    """Smallest d rho / dx of the radial model over the rays that land inside the image
    (x from 0 to where rho reaches the farthest corner, or to the fold). 1 is no distortion;
    0 is a fold. Unscored diagnostic: how close a monotone model comes to folding."""
    k1, k2, k3 = c["k1"], c["k2"], c["k3"]
    rn = max(np.hypot((u - c["cx"]) / c["fx"], (v - c["cy"]) / c["fy"])
             for u, v in corners(c["width"] + 1, c["height"] + 1))
    x = np.linspace(0, 3 * rn, 30 * n)
    u = x * x
    r = x * (1 + k1 * u + k2 * u * u + k3 * u ** 3)
    dr = 1 + 3 * k1 * u + 5 * k2 * u * u + 7 * k3 * u ** 3
    stop = np.argmax((r >= rn) | (dr <= 0)) or len(x) - 1
    return float(dr[: stop + 1].min())


def main():
    d = json.load(open(os.path.join(HERE, "calibs.json")))
    cams = d["cameras"]
    models = {}
    for c in cams:
        models[c["model"]] = models.get(c["model"], 0) + 1
    radial = [c for c in cams if c["model"] == "radtan"]
    zero = [c for c in radial if all(c[k] == 0 for k in ("k1", "k2", "p1", "p2", "k3"))]
    nonzero = [c for c in radial if c not in zero]
    groups = distinct(nonzero)
    rows = []
    it100 = (cv2.TERM_CRITERIA_COUNT | cv2.TERM_CRITERIA_EPS, 100, 1e-12)
    for g in groups:
        c = g["cam"]
        if c.get("width") is None:
            rows.append(dict(sources=g["sources"], skipped="no image size"))
            continue
        r = check(c["fx"], c["fy"], c["cx"], c["cy"], c["width"], c["height"], c["k1"], c["k2"], c["k3"])
        rt5, rt100 = round_trip(c), round_trip(c, it100)
        rows.append(dict(sources=g["sources"], width=c["width"], height=c["height"],
                         **{k: c[k] for k in KEYS}, fold_radius_px=r["fold_radius_px"],
                         corner_radius_px=r["corner_radius_px"], folds_inside=r["folds_inside"],
                         corners_beyond_fold=r.get("corners_beyond_fold", 0), margin_px=r["margin_px"],
                         round_trip_default_px=rt5, round_trip_100_px=rt100, min_slope=min_slope(c)))
    scored = [r for r in rows if "skipped" not in r]
    fold = [r for r in scored if r["folds_inside"]]
    mono = [r for r in scored if not r["folds_inside"]]
    hyp = {
        "H295": dict(held=len(fold) >= 2, folds_inside=len(fold), of=len(scored)),
        "H296": dict(held=None if not fold else all(r["k3"] == 0 for r in fold),
                     k3_of_folding=[r["k3"] for r in fold]),
        "H297": dict(held=None if not fold else all(max(r["round_trip_default_px"]) > 1 for r in fold),
                     max_default_px=[max(r["round_trip_default_px"]) for r in fold]),
        "H298": dict(held=bool(mono) and all(max(r["round_trip_default_px"]) <= 0.5 for r in mono),
                     max_default_px=[max(r["round_trip_default_px"]) for r in mono]),
    }
    # Post hoc, unscored: the one folding model the project knows, milestone 3zd's Kinect board fit
    b = json.load(open(os.path.join(HERE, "..", "m3i_principal", "tum_summary.json")))["board_reference"]["fr1"]
    kc = dict(fx=b["f"], fy=b["f"], cx=b["cx"], cy=b["cy"], k1=b["k1"], k2=b["k2"], p1=0.0, p2=0.0, k3=0.0,
              width=640, height=480)
    kr = check(kc["fx"], kc["fy"], kc["cx"], kc["cy"], 640, 480, kc["k1"], kc["k2"])
    kinect = dict(fold_radius_px=kr["fold_radius_px"], corner_radius_px=kr["corner_radius_px"],
                  corners_beyond_fold=kr["corners_beyond_fold"], round_trip_default_px=round_trip(kc),
                  round_trip_100_px=round_trip(kc, it100), min_slope=min_slope(kc))
    print("post hoc, Kinect board fit (m3zd):", {k: (round(v, 3) if isinstance(v, float) else
                                                    [round(e, 3) for e in v] if isinstance(v, list) else v)
                                                for k, v in kinect.items()})
    out = dict(kinect_board_fit_post_hoc=kinect, opencv=cv2.__version__, files=d["files"], cameras=len(cams), models=models, radial_zero=len(zero),
               radial_nonzero=len(nonzero), distinct=len(groups), rows=rows, hypotheses=hyp)
    json.dump(out, open(os.path.join(HERE, "summary.json"), "w"), indent=1)
    print(f"{len(cams)} cameras; models {models}; radial with all-zero distortion {len(zero)}; "
          f"non-zero {len(nonzero)} -> {len(groups)} distinct, {len(scored)} scored")
    print(f"{'source':58s} {'size':>9s} {'k1':>8s} {'k2':>8s} {'k3':>7s} {'fold':>7s} {'corner':>7s} "
          f"{'beyond':>6s} {'rt5':>8s} {'rt100':>8s} {'slope':>6s}")
    for r in sorted(scored, key=lambda r: (r["margin_px"] is None, r["margin_px"] or 0)):
        fr = f"{r['fold_radius_px']:.1f}" if r["fold_radius_px"] else "none"
        print(f"{r['sources'][0][:58]:58s} {int(r['width']):4d}x{int(r['height']):<4d} {r['k1']:8.4f} {r['k2']:8.4f} "
              f"{r['k3']:7.3f} {fr:>7s} {r['corner_radius_px']:7.1f} {r['corners_beyond_fold']:6d} "
              f"{max(r['round_trip_default_px']):8.3g} {max(r['round_trip_100_px']):8.3g} {r['min_slope']:6.3f}")
    for k, v in hyp.items():
        print(k, {True: "held", False: "refuted", None: "untestable (no folding calibration)"}[v["held"]], {a: b for a, b in v.items() if a != "held"})
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        return 0
    # The planned figure (fold radius against corner radius) is empty when nothing folds, so the
    # figure shows the smallest slope of the radial map inside each image instead (1 = no distortion,
    # 0 = a fold), with milestone 3zd's folding Kinect board fit for reference.
    def label(r):
        src = r["sources"][0]
        proj = src.split("/")[1].replace("_", "-")
        tail = src.split("/master/")[1].replace("config/", "").replace("Examples/", "")
        return f"{proj}: {tail.replace('/kalibr_imucam_chain.yaml', '').replace('.yaml', '')}"[:52]
    bars = sorted(scored, key=lambda r: r["min_slope"])
    names = ["Kinect board fit, this project (m3zd)"] + [label(r) for r in bars]
    vals = [kinect["min_slope"]] + [r["min_slope"] for r in bars]
    fig, ax = plt.subplots(figsize=(7.2, 5.2))
    ax.barh(range(len(vals)), vals, color=["C3"] + ["C0"] * len(bars))
    ax.set_yticks(range(len(vals)))
    ax.set_yticklabels(names, fontsize=7)
    ax.invert_yaxis()
    ax.axvline(0, color="k", lw=0.8)
    ax.text(0.015, 0, f"slope 0: folds at {kinect['fold_radius_px']:.0f} px, corner at "
            f"{kinect['corner_radius_px']:.0f} px", va="center", fontsize=7, color="C3")
    ax.set_xlim(-0.02, 1.05)
    ax.set_xlabel("smallest slope dρ/dx of the radial model inside the image (0 = folds)")
    ax.set_title(f"{len(scored)} distinct published SLAM/VIO pinhole calibrations: none folds inside its image\n"
                 "(red: the Kinect two-term board fit, which does)", fontsize=9)
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "fleet.png"), dpi=130)
    return 0


if __name__ == "__main__":
    sys.exit(main())
