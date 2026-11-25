"""Milestone 3zh: which undistortion loop a robot actually runs, across OpenCV releases and three callers.

    for each wheel: <venv>/bin/python experiments/m3zh_versions/probe.py --work DIR
    python3 experiments/m3zh_versions/analyse.py --work DIR      # writes summary.json, versions.png

Plan and hypotheses H310-H316: LOG.md, "Milestone 3zh planned". This step needs OpenCV 5.1.0 (the
reference and the round-trip error), numpy, torch and kornia 0.9.2 for H313 (skipped if absent) and
matplotlib for the figure. The corpus is milestone 3zf's; the OpenCV port is milestone 3zg's.
"""
import argparse
import glob
import json
import math
import os
import sys

import numpy as np
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "m3zg_loop"))
from probe import CRITERIA, COUNT, EPS, KD, load_groups  # noqa: E402
from loop import undistort, DEFAULT, spectral_radius  # noqa: E402
from vins import lift_projective, additive_map  # noqa: E402

TOL = 1e-9
UNDAMPED = ("4.5.5", "4.10.0", "4.12.0")
DAMPED = ("4.13.0", "4.14.0", "5.1.0")


def reproject_err(c, px, und):
    K, D = KD(c)
    obj = np.concatenate([und, np.ones((len(und), 1))], axis=1)
    back, _ = cv2.projectPoints(obj, np.zeros(3), np.zeros(3), K, D)
    return np.linalg.norm(back.reshape(-1, 2) - np.asarray(px).reshape(-1, 2), axis=1)


def jac_radius(f, x, y, h=1e-7):
    J = np.empty((2, 2))
    for j, (ex, ey) in enumerate(((h, 0.0), (0.0, h))):
        a, b = f(x + ex, y + ey), f(x - ex, y - ey)
        J[0, j] = (a[0] - b[0]) / (2 * h)
        J[1, j] = (a[1] - b[1]) / (2 * h)
    return float(max(abs(np.linalg.eigvals(J))))


def c_round(v):
    """C's round(): half away from zero."""
    return np.sign(v) * np.floor(np.abs(v) + 0.5)


def orb_bounds(c, criteria=None, f32=True):
    """ORB-SLAM2/3 Frame::ComputeImageBounds: undistort (0,0), (cols,0), (0,rows), (cols,rows) with P = K."""
    K, D = KD(c)
    dt = np.float32 if f32 else np.float64
    K, D = K.astype(dt), D.astype(dt)
    w, h = c["width"], c["height"]
    p = np.array([[0, 0], [w, 0], [0, h], [w, h]], dt).reshape(-1, 1, 2)
    o = (cv2.undistortPoints(p, K, D, None, K) if criteria is None else
         cv2.undistortPoints(p, K, D, None, K, criteria=criteria)).reshape(-1, 2)
    return np.array([min(o[0, 0], o[2, 0]), max(o[1, 0], o[3, 0]), min(o[0, 1], o[1, 1]), max(o[2, 1], o[3, 1])],
                    float)


def orb_dropped(c, grid, bounds, criteria=None, f32=True, cols=64, rows=48):
    """Share of grid pixels whose undistorted point Frame::PosInGrid rejects (FRAME_GRID_COLS/ROWS = 64/48)."""
    K, D = KD(c)
    dt = np.float32 if f32 else np.float64
    K, D = K.astype(dt), D.astype(dt)
    p = grid.astype(dt).reshape(-1, 1, 2)
    o = (cv2.undistortPoints(p, K, D, None, K) if criteria is None else
         cv2.undistortPoints(p, K, D, None, K, criteria=criteria)).reshape(-1, 2).astype(float)
    minx, maxx, miny, maxy = bounds
    gx = c_round((o[:, 0] - minx) * (cols / (maxx - minx)))
    gy = c_round((o[:, 1] - miny) * (rows / (maxy - miny)))
    return float(((gx < 0) | (gx >= cols) | (gy < 0) | (gy >= rows)).mean())


def theory_eigs(c, pt):
    """Radial-only eigenvalues of the additive map at a fixed point: 1 - rho'(r) along the ray, 1 - c(r) across."""
    r = math.hypot(*pt)
    k1, k2 = c["k1"], c["k2"]
    cr = 1 + k1 * r * r + k2 * r ** 4
    return dict(r=r, c=cr, drho_dr=1 + 3 * k1 * r * r + 5 * k2 * r ** 4,
                along=-(3 * k1 * r * r + 5 * k2 * r ** 4), across=1 - cr)


def q(a):
    a = np.asarray([x for x in a if x is not None], float)
    return dict(n=int(a.size), median=float(np.median(a)), q25=float(np.percentile(a, 25)),
                q75=float(np.percentile(a, 75)), min=float(a.min()), max=float(a.max())) if a.size else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", required=True)
    a = ap.parse_args()
    assert cv2.__version__ == "5.1.0", "the reference is OpenCV 5.1.0"
    groups, is_duckiebot, corners = load_groups()
    probes = {}
    for f in sorted(glob.glob(os.path.join(a.work, "opencv-*.json"))):
        d = json.load(open(f))
        probes[d["opencv"]] = d
    assert set(UNDAMPED + DAMPED) <= set(probes), sorted(probes)

    # H310 / H311: every release against the port, damped and undamped
    per_release = {}
    for ver, d in probes.items():
        worst_damped = worst_undamped = 0.0
        for g, row in zip(groups, d["calibrations"]):
            c = g["cam"]
            assert row["source"] == g["sources"][0]
            K, D = KD(c)
            px = corners(c["width"], c["height"])
            for name, crit in CRITERIA:
                cr = DEFAULT if crit is None else crit
                for (u, v), (ox, oy) in zip(px, row["out"][name]):
                    xd, yd, _ = undistort(u, v, K, D, cr, damping=True)
                    xu, yu, _ = undistort(u, v, K, D, cr, damping=False)
                    worst_damped = max(worst_damped, abs(xd - ox), abs(yd - oy))
                    worst_undamped = max(worst_undamped, abs(xu - ox), abs(yu - oy))
        per_release[ver] = dict(vs_damped_port=worst_damped, vs_undamped_port=worst_undamped)
    h310 = dict(held=all(per_release[v]["vs_undamped_port"] <= TOL for v in UNDAMPED),
                **{v: per_release[v] for v in UNDAMPED})
    h311 = dict(held=all(per_release[v]["vs_damped_port"] <= TOL for v in DAMPED[:2]),
                **{v: per_release[v] for v in DAMPED})

    # corner errors per release (round trip through OpenCV 5.1.0's projectPoints)
    duck_idx = [i for i, g in enumerate(groups) if is_duckiebot(g)]
    over1 = {}
    for ver, d in probes.items():
        over1[ver] = {}
        for name in ("default", "count200", "eps200"):
            n = 0
            for i in duck_idx:
                c = groups[i]["cam"]
                e = reproject_err(c, corners(c["width"], c["height"]), np.array(d["calibrations"][i]["out"][name]))
                n += int((e > 1).sum())
            over1[ver][name] = n
    h312 = dict(held=over1["4.12.0"]["eps200"] >= 50, corners_over_1px_eps200_4_12=over1["4.12.0"]["eps200"],
                corners=4 * len(duck_idx))

    # H313: Kornia
    try:
        import torch
        import kornia
        from kornia.geometry.calibration import undistort_points as k_und
        worst = worst_unguarded = 0.0
        guarded = 0
        ref = probes["5.1.0"]
        for i, g in enumerate(groups):
            c = g["cam"]
            K, D = KD(c)
            px = corners(c["width"], c["height"])
            for n in (5, 200):
                o = k_und(torch.tensor(px[None], dtype=torch.float64), torch.tensor(K[None]),
                          torch.tensor(D[None]), num_iters=n)[0].numpy()
                # OpenCV's normalised output, mapped to pixels with K, as Kornia returns pixels
                cvn = np.array(ref["calibrations"][i]["out"][f"count{n}"])
                cvp = np.stack([cvn[:, 0] * c["fx"] + c["cx"], cvn[:, 1] * c["fy"] + c["cy"]], axis=1)
                worst = max(worst, float(np.abs(o - cvp).max()))
                # post hoc (after the first run): split off the corners where OpenCV's loop left through its
                # negative-1/c(r) guard, which Kornia's loop does not have
                for j, (u, v) in enumerate(px):
                    if undistort(u, v, K, D, (COUNT, n, 0.0))[2]["negative_break"]:
                        guarded += 1
                    else:
                        worst_unguarded = max(worst_unguarded, float(np.abs(o[j] - cvp[j]).max()))
        h313 = dict(held=worst <= TOL, kornia=kornia.__version__, torch=torch.__version__, worst_abs_diff_px=worst,
                    post_hoc_guard_corner_runs=guarded, post_hoc_worst_without_guard_px=worst_unguarded)
    except ImportError as e:
        h313 = dict(held=None, skipped=str(e))

    # H314 / H315: VINS-Mono camodocs' additive loop
    rows, conv_pts = [], []
    for i, g in enumerate(groups):
        c = g["cam"]
        K, D = KD(c)
        px = corners(c["width"], c["height"])
        conv = np.array(probes["5.1.0"]["calibrations"][i]["out"]["eps200"])
        conv_err = reproject_err(c, px, conv)
        conv_pts.append(conv.tolist())
        k1, k2, p1, p2 = c["k1"], c["k2"], c["p1"], c["p2"]
        rad, e8, e200, need = [], [], [], []
        for j, (u, v) in enumerate(px):
            xd, yd = (u - c["cx"]) / c["fx"], (v - c["cy"]) / c["fy"]
            rad.append(jac_radius(lambda x, y: additive_map(x, y, xd, yd, k1, k2, p1, p2), conv[j, 0], conv[j, 1]))
            for n, store in ((8, e8), (200, e200)):
                x, y = lift_projective(u, v, c, n)
                store.append(float(reproject_err(c, [[u, v]], np.array([[x, y]]))[0]))
            steps = None
            for n in range(1, 2001):
                x, y = lift_projective(u, v, c, n)
                if reproject_err(c, [[u, v]], np.array([[x, y]]))[0] <= 0.01:
                    steps = n
                    break
            need.append(steps)
        rows.append(dict(source=g["sources"][0], duckiebot=is_duckiebot(g), k3=c["k3"],
                         converged_err=conv_err.tolist(), vins_rho=rad, vins_err8=e8, vins_err200=e200,
                         vins_steps_to_0p01=need))
    # non-folding = OpenCV's damped 200-step round trip closes (3zf/3zg: the two folding models stay at 4 and 146 px)
    nonfold = [r for r in rows if max(r["converged_err"]) <= 0.01]
    h314_rho = max(max(r["vins_rho"]) for r in nonfold)
    h314_err = max(max(r["vins_err200"]) for r in nonfold)
    h314 = dict(held=h314_rho < 1 and h314_err <= 0.01, calibrations=len(nonfold), max_rho=h314_rho,
                max_err200_px=h314_err, k3_nonzero_in_nonfold=sum(r["k3"] != 0 for r in nonfold),
                note="VINS's PinholeCamera has no k3; calibrations with k3 != 0 are run without it, "
                     "so their round trip is through a different model")
    # post hoc breakdown: VINS's model has no k3, so a k3 != 0 calibration converges to a different model;
    # and the theory's eigenvalue 1 - rho'(r) at the corners whose spectral radius reaches 1
    k30 = [r for r in nonfold if r["k3"] == 0]
    h314["post_hoc"] = dict(
        k3_zero=len(k30), k3_zero_corners_rho_ge_1=sum(x >= 1 for r in k30 for x in r["vins_rho"]),
        k3_zero_max_err200_excluding_rho_ge_1=max(e for r in k30 for e, x in zip(r["vins_err200"], r["vins_rho"])
                                                  if x < 1),
        k3_nonzero_max_rho=max(max(r["vins_rho"]) for r in nonfold if r["k3"] != 0),
        rho_ge_1=[dict(source=r["source"], corner=j, rho=x, theory=theory_eigs(groups[i]["cam"], conv_pts[i][j]))
                  for i, r in enumerate(rows) if r in k30 for j, x in enumerate(r["vins_rho"]) if x >= 1])
    duck = [r for r in rows if r["duckiebot"]]
    med8 = float(np.median([max(r["vins_err8"]) for r in duck]))
    h315 = dict(held=0.5 < med8 < 10.2, duckiebot_median_worst_corner_err8_px=med8,
                spread=q([max(r["vins_err8"]) for r in duck]))

    # H316: ORB-SLAM2/3 frame bounds; and the share of the image its grid drops
    gx, gy = np.meshgrid(np.arange(0, 640, 4, dtype=np.float64), np.arange(0, 480, 4, dtype=np.float64))
    grid = np.stack([gx.ravel(), gy.ravel()], axis=1)
    conv_crit = (COUNT | EPS, 200, 1e-12)
    shift, drop_def, drop_conv = [], [], []
    for i in duck_idx:
        c = groups[i]["cam"]
        bd = orb_bounds(c)
        bc = orb_bounds(c, conv_crit, f32=False)
        shift.append(float(np.abs(bd - bc).max()))
        drop_def.append(orb_dropped(c, grid, bd))
        drop_conv.append(orb_dropped(c, grid, bc, conv_crit, f32=False))
        rows[i]["orb_bounds_default"], rows[i]["orb_bounds_converged"] = bd.tolist(), bc.tolist()
        rows[i]["orb_grid_drop_default"], rows[i]["orb_grid_drop_converged"] = drop_def[-1], drop_conv[-1]
    share5 = float(np.mean([s > 5 for s in shift]))
    h316 = dict(held=share5 >= 0.2, share_with_a_bound_over_5px=share5, bound_shift_px=q(shift))

    hyp = dict(H310=h310, H311=h311, H312=h312, H313=h313, H314=h314, H315=h315, H316=h316)
    unscored = dict(
        duckiebot_corners_over_1px_by_release=over1,
        vins_steps_to_0p01_duckiebot_worst_corner=q([max(s for s in r["vins_steps_to_0p01"] if s) for r in duck
                                                      if any(r["vins_steps_to_0p01"])]),
        vins_rho_duckiebot_max_corner=q([max(r["vins_rho"]) for r in duck]),
        vins_err200_nonduck=[dict(source=r["source"], err200=max(r["vins_err200"]), k3=r["k3"])
                             for r in rows if not r["duckiebot"]],
        orb_grid_drop_default=q(drop_def), orb_grid_drop_converged=q(drop_conv),
        orb_drop_over_1pct_default=sum(d > 0.01 for d in drop_def),
        orb_drop_over_1pct_converged=sum(d > 0.01 for d in drop_conv),
    )
    out = dict(reference_opencv=cv2.__version__, releases=sorted(probes), distinct=len(groups),
               duckiebot=len(duck_idx), hypotheses=hyp, unscored=unscored, rows=rows)
    json.dump(out, open(os.path.join(HERE, "summary.json"), "w"), indent=1, default=float)
    print(f"releases {sorted(probes)}; {len(groups)} distinct calibrations, {len(duck_idx)} Duckiebot")
    for k, v in hyp.items():
        print(k, {True: "held", False: "refuted", None: "untestable"}[v["held"]],
              json.dumps({a: b for a, b in v.items() if a != "held"}, default=str))
    print("unscored:", json.dumps({k: v for k, v in unscored.items() if k != "vins_err200_nonduck"}, default=str))
    print("vins_err200_nonduck:", json.dumps(unscored["vins_err200_nonduck"]))
    figure(probes, groups, duck_idx, corners, rows, drop_def, drop_conv)
    return 0


def figure(probes, groups, duck_idx, corners, rows, drop_def, drop_conv):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        return
    vers = sorted(probes, key=lambda v: tuple(int(x) for x in v.split(".")))
    fig, (ax, bx) = plt.subplots(1, 2, figsize=(10.5, 4.2))
    names = [("default", "default (COUNT, 5)"), ("count200", "COUNT, 200"), ("eps200", "COUNT|EPS, 200")]
    for k, (name, label) in enumerate(names):
        med = []
        for v in vers:
            w = [max(reproject_err(groups[i]["cam"], corners(640, 480), np.array(probes[v]["calibrations"][i]["out"][name])))
                 for i in duck_idx]
            med.append(sum(x > 1 for x in w))
        ax.plot(range(len(vers)), med, "o-", label=label)
    ax.set_xticks(range(len(vers)))
    ax.set_xticklabels(vers, fontsize=8)
    ax.axvline(2.5, color="0.6", lw=0.8, ls="--")
    ax.text(2.55, ax.get_ylim()[1] * 0.92, "damping (PR #27993)", fontsize=7, color="0.4")
    ax.set_xlabel("OpenCV release (pip wheel)")
    ax.set_ylabel(f"Duckiebots with a corner over 1 px (of {len(duck_idx)})")
    ax.legend(fontsize=7)
    duck = [r for r in rows if r["duckiebot"]]
    bx.scatter([max(r["vins_rho"]) for r in duck], [max(max(r["vins_err8"]), 1e-4) for r in duck], s=8, c="C2",
               label="VINS-Mono loop, 8 steps")
    bx.scatter([max(r["vins_rho"]) for r in duck], [max(max(r["vins_err200"]), 1e-4) for r in duck], s=8, c="C0",
               label="same loop, 200 steps")
    bx.set_yscale("log")
    bx.set_xlabel("spectral radius of VINS's additive map at the worst corner")
    bx.set_ylabel("worst-corner round trip, px (floored at 1e-4)")
    bx.legend(fontsize=7)
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "versions.png"), dpi=130)


if __name__ == "__main__":
    sys.exit(main())
