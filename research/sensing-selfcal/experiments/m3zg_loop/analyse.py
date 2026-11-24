"""Milestone 3zg: OpenCV 5.1.0's undistortPoints loop, ported, and the undamped iteration's slope.

    python3 experiments/m3zg_loop/analyse.py      # reads ../m3zf_ros/calibs.json; writes summary.json, loop.png

Plan and hypotheses H305-H309: LOG.md, "Milestone 3zg planned". Needs numpy and OpenCV
(opencv-python-headless); matplotlib for the figure. The corpus and its de-duplication are
milestone 3zf's (experiments/m3zf_ros/analyse.py), imported unchanged.
"""
import importlib.util
import json
import math
import os
import sys

import numpy as np
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from loop import COUNT, EPS, DEFAULT, undistort, radial, true_radius, spectral_radius  # noqa: E402

_spec = importlib.util.spec_from_file_location("m3zf_analyse", os.path.join(HERE, "..", "m3zf_ros", "analyse.py"))
_m3zf = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_m3zf)
distinct, is_duckiebot = _m3zf.distinct, _m3zf.is_duckiebot
corners = _m3zf._m3ze.corners

COUNTS = (5, 10, 20, 50, 100, 200)
CRITERIA = [("default", None)] + [(f"count{n}", (COUNT, n, 0.0)) for n in COUNTS] + \
           [(f"eps{n}", (COUNT | EPS, n, 1e-12)) for n in COUNTS]


def KD(c):
    K = np.array([[c["fx"], 0, c["cx"]], [0, c["fy"], c["cy"]], [0, 0, 1]], dtype=np.float64)
    D = np.array([c[k] for k in ("k1", "k2", "p1", "p2", "k3")], dtype=np.float64)
    return K, D


def cv_und(c, px, criteria):
    K, D = KD(c)
    p = np.asarray(px, np.float64).reshape(-1, 1, 2)
    out = cv2.undistortPoints(p, K, D) if criteria is None else cv2.undistortPoints(p, K, D, criteria=criteria)
    return out.reshape(-1, 2)


def reproject_err(c, px, und):
    K, D = KD(c)
    obj = np.concatenate([und, np.ones((len(und), 1))], axis=1)
    back, _ = cv2.projectPoints(obj, np.zeros(3), np.zeros(3), K, D)
    return np.linalg.norm(back.reshape(-1, 2) - np.asarray(px).reshape(-1, 2), axis=1)


def corner_lambda(c, u, v):
    """|lambda| at the corner's true undistorted radius (radial terms only), its r*, and r_d."""
    rd = math.hypot((u - c["cx"]) / c["fx"], (v - c["cy"]) / c["fy"])
    r = true_radius(rd, c["k1"], c["k2"], c["k3"])
    if r is None:
        return None, None, rd
    return abs(radial(r, c["k1"], c["k2"], c["k3"])[1]), r, rd


def lambda_crossing_px(c, rmax=6.0, n=6000):
    """Distorted radius (px, at fx) where |lambda| first reaches 1 on the monotone branch, or None."""
    prev = 0.0
    for i in range(1, n + 1):
        r = rmax * i / n
        rho, lam = radial(r, c["k1"], c["k2"], c["k3"])
        if rho < prev:
            return None
        if abs(lam) >= 1:
            return rho * c["fx"]
        prev = rho
    return None


def spearman(a, b):
    ra = np.argsort(np.argsort(a))
    rb = np.argsort(np.argsort(b))
    return float(np.corrcoef(ra, rb)[0, 1])


def main():
    d = json.load(open(os.path.join(HERE, "..", "m3zf_ros", "calibs.json")))
    cams = [c for c in d["cameras"] if not all(x == 0 for x in c["D"])]
    groups = distinct(cams)

    # H305: the port against OpenCV, all corners, all criteria
    worst_port = 0.0
    for g in groups:
        c = g["cam"]
        K, D = KD(c)
        px = corners(c["width"], c["height"])
        for name, crit in CRITERIA:
            ocv = cv_und(c, px, crit)
            for (u, v), (ox, oy) in zip(px, ocv):
                x, y, _ = undistort(u, v, K, D, DEFAULT if crit is None else crit)
                worst_port = max(worst_port, abs(x - ox), abs(y - oy))

    rows = []
    for g in groups:
        c = g["cam"]
        K, D = KD(c)
        px = corners(c["width"], c["height"])
        err = {name: reproject_err(c, px, cv_und(c, px, crit)).tolist() for name, crit in CRITERIA}
        lam = [corner_lambda(c, u, v) for u, v in px]
        neg = [undistort(u, v, K, D, (COUNT, 200, 0.0))[2]["negative_break"] for u, v in px]
        # H308 ablations, the port only: EPS with eps=0 (never stops early) and the same without damping
        e0 = [undistort(u, v, K, D, (COUNT | EPS, 200, 0.0)) for u, v in px]
        nd = [undistort(u, v, K, D, (COUNT | EPS, 200, 0.0), damping=False) for u, v in px]
        ocv_eps = cv_und(c, px, (COUNT | EPS, 200, 1e-12))
        ocv_cnt = cv_und(c, px, (COUNT, 200, 0.0))
        h308a = max(max(abs(a[0] - o[0]), abs(a[1] - o[1])) for a, o in zip(e0, ocv_eps))
        h308b = max(max(abs(a[0] - o[0]), abs(a[1] - o[1])) for a, o in zip(nd, ocv_cnt))
        # post hoc (added after the first run refuted H306): the full 2-D map's spectral radius at
        # the true fixed point, taken as OpenCV's COUNT|EPS 200-iteration output, tangential terms included
        fp = ocv_eps
        rhoj = [spectral_radius(fp[i, 0], fp[i, 1], (u - c["cx"]) / c["fx"], (v - c["cy"]) / c["fy"], D)
                for i, (u, v) in enumerate(px)]
        rows.append(dict(sources=g["sources"][:1], duckiebot=is_duckiebot(g), rho_jacobian=rhoj,
                         **{k: c[k] for k in ("fx", "fy", "cx", "cy", "k1", "k2", "p1", "p2", "k3", "width", "height")},
                         err=err, lam=[l[0] for l in lam], r_true=[l[1] for l in lam], r_d=[l[2] for l in lam],
                         negative_break_count200=neg, rejected_eps200=[e[2]["rejected"] for e in e0],
                         h308_eps0_vs_ocv=h308a, h308_nodamp_vs_ocv_count=h308b,
                         lambda_crossing_px=lambda_crossing_px(c)))
    duck = [r for r in rows if r["duckiebot"]]

    # H306 over Duckiebot corners
    over, low_bad, mid = [], [], []
    for r in duck:
        for i in range(4):
            lam, e = r["lam"][i], r["err"]["count200"][i]
            if e > 1:
                over.append(lam)
            if lam is not None and lam < 0.9 and e > 0.01:
                low_bad.append((r["sources"][0], i, lam, e))
            if lam is not None and 0.9 <= lam < 1:
                mid.append((lam, e))
    h306 = dict(held=all(l is not None and l >= 1 for l in over) and not low_bad,
                over_1px=len(over), of_those_lambda_ge_1=sum(l is not None and l >= 1 for l in over),
                lambda_lt_0p9_over_0p01px=len(low_bad), lambda_lt_0p9_corners=sum(
                    l is not None and l < 0.9 for r in duck for l in r["lam"]),
                corners=4 * len(duck), between_0p9_and_1=len(mid), examples_lt_0p9_bad=low_bad[:5])
    maxlam = [max(l for l in r["lam"] if l is not None) for r in duck]
    deferr = [max(r["err"]["default"]) for r in duck]
    rho = spearman(maxlam, deferr)
    h307 = dict(held=rho >= 0.8, spearman=rho, n=len(duck))
    worst308a = max(r["h308_eps0_vs_ocv"] for r in rows)
    worst308b = max(r["h308_nodamp_vs_ocv_count"] for r in rows)
    h308 = dict(held=worst308a <= 1e-9 and worst308b <= 1e-9, eps0_vs_opencv_eps=worst308a,
                nodamp_vs_opencv_count=worst308b)

    # H309: default error on a 4-px grid of every Duckiebot image
    gx, gy = np.meshgrid(np.arange(0, 640, 4, dtype=np.float64), np.arange(0, 480, 4, dtype=np.float64))
    grid = np.stack([gx.ravel(), gy.ravel()], axis=1)
    share1, share05, med_err, radius1 = [], [], [], []
    for r in duck:
        e = reproject_err(r, grid, cv_und(r, grid, None))
        share1.append(float((e > 1).mean()))
        share05.append(float((e > 0.5).mean()))
        med_err.append(float(np.median(e)))
        rad = np.hypot(grid[:, 0] - r["cx"], grid[:, 1] - r["cy"])
        radius1.append(float(rad[e > 1].min()) if (e > 1).any() else None)
        r["grid_share_over_1px"], r["grid_share_over_0p5px"] = share1[-1], share05[-1]
    h309 = dict(held=float(np.median(share1)) < 0.10, median_share_over_1px=float(np.median(share1)),
                q25=float(np.percentile(share1, 25)), q75=float(np.percentile(share1, 75)), max=float(max(share1)))
    hyp = dict(H305=dict(held=worst_port <= 1e-9, worst_abs_diff=worst_port, calibrations=len(groups),
                         criteria=len(CRITERIA)), H306=h306, H307=h307, H308=h308, H309=h309)

    # unscored
    def q(a):
        a = np.asarray([x for x in a if x is not None], float)
        return dict(n=int(a.size), median=float(np.median(a)), q25=float(np.percentile(a, 25)),
                    q75=float(np.percentile(a, 75)), min=float(a.min()), max=float(a.max())) if a.size else None
    unscored = dict(
        duckiebot_max_corner_lambda=q(maxlam),
        duckiebot_with_a_corner_lambda_ge_1=sum(l >= 1 for l in maxlam),
        duckiebot_lambda_crossing_px=q([r["lambda_crossing_px"] for r in duck]),
        duckiebot_never_cross=sum(r["lambda_crossing_px"] is None for r in duck),
        negative_break_corners_count200=sum(sum(r["negative_break_count200"]) for r in rows),
        negative_break_calibrations=[r["sources"][0] for r in rows if any(r["negative_break_count200"])],
        rejected_steps_eps200_duckiebot=q([max(r["rejected_eps200"]) for r in duck]),
        grid_share_over_0p5px=q(share05), grid_median_error_px=q(med_err),
        grid_smallest_radius_over_1px=q(radius1),
        spearman_maxlam_vs_count200=spearman(maxlam, [max(r["err"]["count200"]) for r in duck]),
        non_duckiebot=[dict(source=r["sources"][0], lam=r["lam"], default_err=max(r["err"]["default"]))
                       for r in rows if not r["duckiebot"]],
    )
    # post hoc: H306 restated with the full Jacobian's spectral radius in place of the radial lambda
    J = [(r["rho_jacobian"][i], r["err"]["count200"][i], r["err"]["default"][i]) for r in duck for i in range(4)]
    stalled = [j for j in J if j[1] > 1]
    unscored["post_hoc_jacobian"] = dict(
        note="added after the first run; tangential terms included; fixed point = OpenCV COUNT|EPS 200",
        corners=len(J), stalled_over_1px=len(stalled),
        stalled_with_rho_ge_1=sum(j[0] >= 1 for j in stalled), stalled_min_rho=min(j[0] for j in stalled),
        rho_ge_1=sum(j[0] >= 1 for j in J), rho_ge_1_within_1px=sum(j[0] >= 1 and j[1] <= 1 for j in J),
        rho_lt_0p9=sum(j[0] < 0.9 for j in J), rho_lt_0p9_over_0p01px=sum(j[0] < 0.9 and j[1] > 0.01 for j in J),
        rho_0p9_to_1=sum(0.9 <= j[0] < 1 for j in J),
        duckiebots_with_a_corner_rho_ge_1=sum(max(r["rho_jacobian"]) >= 1 for r in duck),
        spearman_max_rho_vs_default=spearman([max(r["rho_jacobian"]) for r in duck], deferr),
        spearman_max_rho_vs_count200=spearman([max(r["rho_jacobian"]) for r in duck],
                                              [max(r["err"]["count200"]) for r in duck]))
    out = dict(opencv=cv2.__version__, source="opencv/opencv@dd8d9c3833e6fbda076660cfbf2ae45611723481 "
               "modules/geometry/src/pinhole.cpp undistortPointsInternal", distinct=len(groups), duckiebot=len(duck),
               hypotheses=hyp, unscored=unscored, rows=rows)
    json.dump(out, open(os.path.join(HERE, "summary.json"), "w"), indent=1, default=float)
    print(f"OpenCV {cv2.__version__}; {len(groups)} distinct calibrations, {len(duck)} Duckiebot")
    for k, v in hyp.items():
        print(k, {True: "held", False: "refuted", None: "untestable"}[v["held"]],
              json.dumps({a: b for a, b in v.items() if a != "held"}, default=str))
    print("unscored:", json.dumps(unscored, default=str))

    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        return 0
    fig, (ax, bx) = plt.subplots(1, 2, figsize=(10, 4.2))
    L = [l for r in duck for l in r["rho_jacobian"]]
    E5 = [e for r in duck for e in r["err"]["default"]]
    E200 = [e for r in duck for e in r["err"]["count200"]]
    ok = [True for l in L]
    ax.scatter([l for l, o in zip(L, ok) if o], [max(e, 1e-4) for e, o in zip(E5, ok) if o], s=6, c="C1",
               label="default (COUNT, 5)")
    ax.scatter([l for l, o in zip(L, ok) if o], [max(e, 1e-4) for e, o in zip(E200, ok) if o], s=6, c="C0",
               label="COUNT only, 200")
    ax.axvline(1, color="0.5", lw=0.8)
    ax.set_yscale("log")
    ax.set_xlabel("spectral radius of the undamped map at the corner's fixed point (post hoc)")
    ax.set_ylabel("corner round-trip error, px (floored at 1e-4)")
    ax.set_title(f"{len(duck)} Duckiebots, 4 corners each", fontsize=9)
    ax.legend(fontsize=7)
    med = int(np.argsort(share1)[len(share1) // 2])
    e = reproject_err(duck[med], grid, cv_und(duck[med], grid, None)).reshape(gx.shape)
    im = bx.imshow(np.log10(np.maximum(e, 1e-3)), extent=(0, 640, 480, 0), cmap="viridis", vmin=-3, vmax=2)
    bx.contour(gx, gy, e, levels=[1], colors="w", linewidths=0.8)
    fig.colorbar(im, ax=bx, label="log$_{10}$ default round-trip error, px")
    bx.set_title(f"median Duckiebot by share over 1 px ({share1[med]:.1%}); white: 1 px", fontsize=9)
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "loop.png"), dpi=130)
    return 0


if __name__ == "__main__":
    sys.exit(main())
