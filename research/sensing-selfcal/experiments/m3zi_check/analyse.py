"""Milestone 3zi: src/undistcheck.py (stdlib) against OpenCV 5.1.0 on milestone 3zf's 179 calibrations.

    python3 experiments/m3zi_check/analyse.py     # writes summary.json and results.txt

Plan and hypotheses H317-H320: LOG.md, "Milestone 3zi planned". Needs numpy and OpenCV for the
comparison only; the tool itself is stdlib. Corpus, de-duplication and corners are milestone
3zf's and 3ze's, imported unchanged; milestone 3zg's finite-difference rho comes from its port.
"""
import importlib.util
import json
import math
import os
import sys
import time

import numpy as np
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
sys.path.insert(0, os.path.join(ROOT, "src"))
sys.path.insert(0, os.path.join(HERE, "..", "m3zg_loop"))
import undistcheck as uc  # noqa: E402
from loop import spectral_radius  # noqa: E402


def _load(name, rel):
    s = importlib.util.spec_from_file_location(name, os.path.join(HERE, "..", rel))
    m = importlib.util.module_from_spec(s)
    s.loader.exec_module(m)
    return m


m3zg = _load("m3zg_an", "m3zg_loop/analyse.py")
m3zf = m3zg._m3zf
distinct, is_duckiebot, corners = m3zf.distinct, m3zf.is_duckiebot, m3zf._m3ze.corners
KD, cv_und, reproject_err = m3zg.KD, m3zg.cv_und, m3zg.reproject_err
EPS200 = (cv2.TERM_CRITERIA_COUNT | cv2.TERM_CRITERIA_EPS, 200, 1e-12)


def main():
    d = json.load(open(os.path.join(HERE, "..", "m3zf_ros", "calibs.json")))
    cams = [c for c in d["cameras"] if not all(x == 0 for x in c["D"])]
    groups = distinct(cams)
    rows = []
    for g in groups:
        c = g["cam"]
        K = (c["fx"], c["fy"], c["cx"], c["cy"])
        D = [c[k] for k in ("k1", "k2", "p1", "p2", "k3")]
        px = corners(c["width"], c["height"])
        ocv_def = cv_und(c, px, None)
        ocv_eps = cv_und(c, px, EPS200)
        e_def = reproject_err(c, px, ocv_def)
        e_eps = reproject_err(c, px, ocv_eps)
        # OpenCV's negative-1/c guard, detected as milestone 3zg did (its port, COUNT 200)
        Km, Dm = KD(c)
        neg = [m3zg.undistort(u, v, Km, Dm, (1, 200, 0.0))[2]["negative_break"] for u, v in px]
        cr = []
        for i, (u, v) in enumerate(px):
            xd, yd = (u - c["cx"]) / c["fx"], (v - c["cy"]) / c["fy"]
            info = {}
            t = uc.undistort(xd, yd, D, info=info)
            x5, y5, g5 = uc.fixed_point(xd, yd, D, 5)
            row = dict(newton=None if t is None else list(t), newton_iter=info.get("iterations"),
                       newton_res=info.get("residual"),
                       newton_err_px=None if t is None else uc._px_err(t[0], t[1], u, v, K, D),
                       ocv_eps=ocv_eps[i].tolist(), ocv_eps_err_px=float(e_eps[i]),
                       ocv_default_err_px=float(e_def[i]), loop5_err_px=uc._px_err(x5, y5, u, v, K, D),
                       loop5_guarded=g5, ocv_negative_break=bool(neg[i]))
            if t is not None:
                row["rho_analytic"] = uc.loop_radius(t[0], t[1], D)
                row["rho_additive"] = uc.additive_radius(t[0], t[1], D)
                # post hoc (added after the first run refuted H319): the same finite difference at Newton's point
                row["rho_fd_at_newton"] = spectral_radius(t[0], t[1], xd, yd, Dm)
            # 3zg's finite-difference rho at OpenCV's converged output
            row["rho_fd_3zg"] = spectral_radius(ocv_eps[i, 0], ocv_eps[i, 1], xd, yd, Dm)
            cr.append(row)
        rows.append(dict(source=g["sources"][0], duckiebot=is_duckiebot(g), K=K, D=D,
                         width=c["width"], height=c["height"], folds=any(r["newton"] is None for r in cr),
                         corners=cr))

    # H317
    nc = [c for r in rows for c in r["corners"] if not r["folds"]]
    worst_newton_px = max(c["newton_err_px"] for c in nc)
    max_iter = max(c["newton_iter"] for c in nc)
    agree = [max(abs(a - b) for a, b in zip(c["newton"], c["ocv_eps"])) for c in nc if c["ocv_eps_err_px"] <= 1e-6]
    h317 = dict(held=worst_newton_px <= 1e-6 and max_iter <= 12 and max(agree) <= 1e-9,
                calibrations=sum(not r["folds"] for r in rows), corners=len(nc),
                worst_newton_err_px=worst_newton_px, max_newton_iterations=max_iter,
                median_newton_iterations=float(np.median([c["newton_iter"] for c in nc])),
                corners_where_opencv_converged=len(agree), worst_diff_vs_opencv_norm=max(agree))
    # H318
    allc = [(r, c) for r in rows for c in r["corners"]]
    cmp_ = [abs(c["loop5_err_px"] - c["ocv_default_err_px"]) for r, c in allc if not c["ocv_negative_break"]]
    duck = [r for r in rows if r["duckiebot"]]
    v_tool = [max(c["loop5_err_px"] for c in r["corners"]) > 1 for r in duck]
    v_ocv = [max(c["ocv_default_err_px"] for c in r["corners"]) > 1 for r in duck]
    h318 = dict(held=max(cmp_) <= 1e-6 and v_tool == v_ocv, corners_compared=len(cmp_),
                excluded_negative_break=len(allc) - len(cmp_), worst_abs_diff_px=max(cmp_),
                duckiebots=len(duck), tool_over_1px=sum(v_tool), opencv_over_1px=sum(v_ocv),
                verdict_mismatches=sum(a != b for a, b in zip(v_tool, v_ocv)))
    # H319
    rd = [abs(c["rho_analytic"] - c["rho_fd_3zg"]) for c in nc]
    h319 = dict(held=max(rd) <= 1e-5, corners=len(rd), worst_abs_diff=max(rd))
    # H320
    negc = [c for r, c in allc if c["ocv_negative_break"]]
    refused_nonfold = sum(c["newton"] is None for r in rows
                          if r["source"] not in [x["source"] for x in rows if any(cc["ocv_negative_break"] for cc in x["corners"])]
                          for c in r["corners"])
    h320 = dict(held=all(c["newton"] is None for c in negc) and refused_nonfold == 0,
                negative_break_corners=len(negc), refused_of_those=sum(c["newton"] is None for c in negc),
                refused_elsewhere=refused_nonfold,
                folding_calibrations=[r["source"] for r in rows if r["folds"]],
                refused_corners_total=sum(c["newton"] is None for r, c in allc))
    # post hoc diagnoses, added after the first run (H317 and H319 missed their tolerances)
    post = dict(
        note="added after the first run; not scored",
        rho_analytic_vs_fd_same_point=max(abs(c["rho_analytic"] - c["rho_fd_at_newton"]) for c in nc),
        opencv_eps200_not_within_1e6px=sum(c["ocv_eps_err_px"] > 1e-6 for c in nc),
        opencv_eps200_worst_err_px=max(c["ocv_eps_err_px"] for c in nc),
        worst_newton_vs_opencv_px_where_opencv_within_1e6=max(
            max(abs(a - b) for a, b in zip(c["newton"], c["ocv_eps"])) * r["K"][0]
            for r in rows if not r["folds"] for c in r["corners"] if c["ocv_eps_err_px"] <= 1e-6),
        rho_class_flips_vs_3zg=sum((c["rho_analytic"] >= 1) != (c["rho_fd_3zg"] >= 1) or
                                   (c["rho_analytic"] < 0.9) != (c["rho_fd_3zg"] < 0.9) for c in nc),
    )
    hyp = dict(H317=h317, H318=h318, H319=h319, H320=h320)

    # unscored: grid share against milestone 3zg's OpenCV grid share, and timing
    zg = json.load(open(os.path.join(HERE, "..", "m3zg_loop", "summary.json")))
    zg_share = {json.dumps(r["sources"][0], sort_keys=True): r.get("grid_share_over_1px") for r in zg["rows"]}
    diffs, tool_share = [], []
    t0 = time.perf_counter()
    for r in duck:
        g = uc.check(r["K"], r["D"], r["width"], r["height"], grid=4)["grid"]
        tool_share.append(g["share_loop5_over_1px"])
        o = zg_share.get(json.dumps(r["source"], sort_keys=True))
        if o is not None:
            diffs.append(abs(g["share_loop5_over_1px"] - o))
    t_grid = time.perf_counter() - t0
    r0 = duck[0]
    K, D = r0["K"], r0["D"]
    pts = [((u - K[2]) / K[0], (v - K[3]) / K[1]) for v in range(0, 480, 8) for u in range(0, 640, 8)]
    def tm(f):
        t = time.perf_counter()
        for xd, yd in pts:
            f(xd, yd)
        return (time.perf_counter() - t) / len(pts) * 1e6
    timing = dict(points=len(pts), newton_us=tm(lambda a, b: uc.undistort(a, b, D)),
                  loop5_us=tm(lambda a, b: uc.fixed_point(a, b, D, 5)),
                  loop200_us=tm(lambda a, b: uc.fixed_point(a, b, D, 200)))
    iters = [c["newton_iter"] for c in nc]
    add = [max(c["rho_additive"] for c in r["corners"]) for r in duck]
    unscored = dict(
        post_hoc=post,
        grid_share_vs_3zg=dict(duckiebots=len(diffs), worst_abs_diff=max(diffs) if diffs else None,
                               median_tool_share=float(np.median(tool_share)), seconds=t_grid),
        newton_iterations=dict(median=float(np.median(iters)), max=int(max(iters)),
                               histogram={str(k): iters.count(k) for k in sorted(set(iters))}),
        timing_pure_python_us_per_point=timing,
        duckiebot_max_additive_radius=dict(median=float(np.median(add)), max=float(max(add)),
                                           over_1=sum(a >= 1 for a in add)),
        corners_loop_radius_ge_1=sum(c.get("rho_analytic", 0) >= 1 for c in nc),
    )
    out = dict(opencv=cv2.__version__, calibrations=len(rows), duckiebots=len(duck),
               hypotheses=hyp, unscored=unscored)
    json.dump(out, open(os.path.join(HERE, "summary.json"), "w"), indent=1, default=float)
    lines = [f"OpenCV {cv2.__version__}; {len(rows)} distinct calibrations ({len(duck)} Duckiebots)"]
    for k, v in hyp.items():
        lines.append(f"{k}: {'HELD' if v['held'] else 'REFUTED'}  " +
                     ", ".join(f"{a}={b}" for a, b in v.items() if a != "held"))
    for k, v in unscored.items():
        lines.append(f"{k}: {v}")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
