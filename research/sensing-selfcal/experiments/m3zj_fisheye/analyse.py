"""Milestone 3zj: the fisheye undistortion path on 16 distinct equidistant calibrations shipped with SLAM/VIO systems.

    python3 experiments/m3zj_fisheye/analyse.py      # writes summary.json, results.txt, regions.png

Plan and hypotheses H321-H327: LOG.md, "Milestone 3zj planned". Needs numpy, OpenCV (4.12.0 wheel) and
matplotlib. Truth is the increasing-branch root of theta (1 + k1 t^2 + ... + k4 t^8) = theta_d, found by
vectorised bisection in float64 (checked against src/fisheyecheck.py's scalar inverse on a subsample).
"""
import json
import warnings
import math
import os
import sys
import time

import numpy as np
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
import fisheyecheck as fc  # noqa: E402

GRID = 2
HALF_PI = math.pi / 2


def distinct(cams):
    out = []
    for c in cams:
        v = [c["fx"], c["fy"], c["cx"], c["cy"]] + c["k"]
        for g in out:
            if all(abs(a - b) <= 1e-6 * max(1.0, abs(a)) for a, b in zip(g["v"], v)):
                g["sources"].append(c["url"].split("/", 3)[3] + ":" + c["cam"])
                break
        else:
            out.append(dict(v=v, width=c["width"], height=c["height"], sources=[c["url"].split("/", 3)[3] + ":" + c["cam"]]))
    return out


def label(src):
    s = src[0]
    if "TUM-VI" in s or "tum_vi" in s:
        return "TUM-VI " + ("cam1" if s.endswith("cam1") else "cam0")
    if "T265" in s:
        return "T265 ORB-SLAM3 " + s.rsplit(":", 1)[1]
    if "rs_t265" in s:
        return "T265 OpenVINS " + s.rsplit(":", 1)[1]
    if "RealSenseIR" in s:
        return "Kimera RealSenseIR " + ("left" if "Left" in s else "right")
    return s.split("/")[-2] + " " + s.rsplit(":", 1)[1]                 # OpenVINS config directory


def td_poly(t, k):
    t2 = t * t
    return t * (1 + t2 * (k[0] + t2 * (k[1] + t2 * (k[2] + t2 * k[3]))))


def truth_theta(td, k, hi):
    """Vectorised bisection on [0, hi] (hi = fold or pi); NaN where theta_d(hi) < td."""
    lo = np.zeros_like(td)
    up = np.full_like(td, hi)
    ok = td_poly(up, k) >= td
    for _ in range(80):
        mid = 0.5 * (lo + up)
        g = td_poly(mid, k) > td
        up = np.where(g, mid, up)
        lo = np.where(g, lo, mid)
    t = 0.5 * (lo + up)
    return np.where(ok, t, np.nan)


def orb3_unproject(xd, yd, k, precision=np.float32(1e-6)):
    """Float32 port of ORB_SLAM3 KannalaBrandt8::unproject (UZ-SLAMLab/ORB_SLAM3@4452a3c): (x, y) of its (x, y, 1)."""
    f = np.float32
    xd, yd = xd.astype(f), yd.astype(f)
    k = [f(x) for x in k]
    tdr = np.sqrt(xd * xd + yd * yd)
    td = np.minimum(np.maximum(f(-np.pi / 2), tdr), f(np.pi / 2)).astype(f)
    t = td.copy()
    done = ~(td > 1e-8)
    for _ in range(10):
        t2 = t * t
        t4 = t2 * t2
        t6 = t4 * t2
        t8 = t4 * t4
        fix = ((t * (f(1) + k[0] * t2 + k[1] * t4 + k[2] * t6 + k[3] * t8) - td) /
               (f(1) + f(3) * k[0] * t2 + f(5) * k[1] * t4 + f(7) * k[2] * t6 + f(9) * k[3] * t8)).astype(f)
        t = np.where(done, t, (t - fix).astype(f))
        done = done | (np.abs(fix) < precision)
    scale = np.where(td > 1e-8, (np.tan(t) / td).astype(f), f(1))
    return (xd * scale).astype(np.float64), (yd * scale).astype(np.float64)


def vins_theta(td, k, tol=1e-10):
    """Port of VINS-Fusion EquidistantCamera::backprojectSymmetric (HKUST-Aerial-Robotics/VINS-Fusion@be55a93).

    VINS names KB's k1..k4 k2..k5. Companion matrix as in the source (A(i+1, i) = 1, last column -coeffs/coeffs(npow)),
    eigenvalues by numpy; the smallest real (|imag| <= tol) non-negative root (t in [-tol, 0) -> 0); theta_d if none."""
    npow = 9
    for kk in (k[3], k[2], k[1], k[0]):
        if kk == 0.0:
            npow -= 2
    coeffs = np.zeros((td.size, npow + 1))
    coeffs[:, 0] = -td
    coeffs[:, 1] = 1.0
    for j, kk in zip((3, 5, 7, 9), k):
        if npow >= j:
            coeffs[:, j] = kk
    A = np.zeros((td.size, npow, npow))
    A[:, 1:, :npow - 1] = np.eye(npow - 1)
    A[:, :, npow - 1] = -coeffs[:, :npow] / coeffs[:, npow:npow + 1]
    ev = np.linalg.eigvals(A)
    real = np.abs(ev.imag) <= tol
    t = ev.real
    keep = real & (t >= -tol)
    t = np.where(t < 0, 0.0, t)
    t = np.where(keep, t, np.inf)
    th = t.min(axis=1)
    return np.where(np.isfinite(th), th, td)


def ray_from_plane(x, y):
    v = np.stack([x, y, np.ones_like(x)], -1)
    return v / np.linalg.norm(v, axis=-1, keepdims=True)


def ray_from_theta(xd, yd, th):
    td = np.hypot(xd, yd)
    s = np.where(td > 0, np.sin(th) / np.where(td > 0, td, 1), 0.0)
    return np.stack([xd * s, yd * s, np.cos(th)], -1)


def angle(a, b):
    """Angle between unit rays, atan2(|a x b|, a.b): arccos's floor near 1 is ~3e-8 rad (post hoc, after the first run)."""
    return np.arctan2(np.linalg.norm(np.cross(a, b), axis=-1), (a * b).sum(-1))


def reproj_px(x, y, u, v, K, k):
    """Pixel error of the normalised point (x, y) sent back through the fisheye forward model."""
    fx, fy, cx, cy = K
    r = np.hypot(x, y)
    th = np.arctan(r)
    tdv = td_poly(th, k)
    s = np.where(r > 0, tdv / np.where(r > 0, r, 1), 1.0)
    return np.hypot(x * s * fx + cx - u, y * s * fy + cy - v)


def run_one(g):
    fx, fy, cx, cy = g["v"][:4]
    k = g["v"][4:]
    K = (fx, fy, cx, cy)
    w, h = int(g["width"]), int(g["height"])
    uu, vv = np.meshgrid(np.arange(0, w, GRID, dtype=np.float64), np.arange(0, h, GRID, dtype=np.float64))
    u, v = uu.ravel(), vv.ravel()
    xd, yd = (u - cx) / fx, (v - cy) / fy
    td = np.hypot(xd, yd)
    corner_td = max(math.hypot((a - cx) / fx, (b - cy) / fy) for a in (0, w - 1) for b in (0, h - 1))
    corner_theta = fc.inverse_theta(corner_td, k)
    fold = fc.fold_theta(k)
    th = truth_theta(td, k, fold if fold is not None else math.pi)
    reg = np.where(np.isnan(th), "F", np.where(th >= HALF_PI, "C", np.where(td > HALF_PI, "B", "A")))
    true_ray = ray_from_theta(xd, yd, np.nan_to_num(th))

    # OpenCV, default criterion, float64 and float32 (OpenVINS passes CV_32F)
    pts = np.stack([u, v], -1).reshape(-1, 1, 2)
    Kc = np.array([[fx, 0, cx], [0, fy, cy], [0, 0, 1.0]])
    Dc = np.array(k, dtype=np.float64)
    o64 = cv2.fisheye.undistortPoints(pts.astype(np.float64), Kc, Dc).reshape(-1, 2)
    o32 = cv2.fisheye.undistortPoints(pts.astype(np.float32), Kc, Dc).reshape(-1, 2).astype(np.float64)
    ox, oy = orb3_unproject(xd, yd, k)
    vt = vins_theta(td, k)

    res = dict(label=label(g["sources"]), sources=g["sources"], K=K, k=k, size=(w, h), points=int(u.size),
               fold_theta=fold, corner_theta_d=corner_td, corner_theta=corner_theta,
               monotone_to_corner=fold is None or (corner_theta is not None and corner_theta < fold),
               td90=fc.theta_d(HALF_PI, k), r90_px=(fx * fc.theta_d(HALF_PI, k), fy * fc.theta_d(HALF_PI, k)))
    for r in "ABCF":
        res["share_" + r] = float((reg == r).mean())
    A, B, C = reg == "A", reg == "B", reg == "C"

    def caller(name, x, y):
        sent = (x == -1e6) & (y == -1e6)
        mir = (~sent) & (x * xd + y * yd < 0)
        ray = ray_from_plane(np.where(sent, 0, x), np.where(sent, 0, y))
        ang = angle(ray, true_ray)
        d = dict()
        if A.any():
            ok = A & ~sent
            d["A_sentinel"] = int((A & sent).sum())
            d["A_max_reproj_px"] = float(reproj_px(x[ok], y[ok], u[ok], v[ok], K, k).max()) if ok.any() else None
            d["A_max_angle_rad"] = float(ang[ok].max()) if ok.any() else None
        for nm, m in (("B", B), ("C", C)):
            if m.any():
                d[nm + "_n"] = int(m.sum())
                d[nm + "_sentinel"] = int((m & sent).sum())
                d[nm + "_mirrored"] = int((m & mir).sum())
                d[nm + "_max_angle_deg"] = float(np.degrees(ang[m & ~sent].max())) if (m & ~sent).any() else None
                d[nm + "_median_angle_deg"] = float(np.degrees(np.median(ang[m & ~sent]))) if (m & ~sent).any() else None
        d["mirrored_share"] = float(mir.mean())
        return d, x, y, sent, mir

    res["opencv64"], x64, y64, s64, m64 = caller("opencv64", o64[:, 0], o64[:, 1])
    res["opencv32"], *_ = caller("opencv32", o32[:, 0], o32[:, 1])
    res["orb3"], xo, yo, so, mo = caller("orb3", ox, oy)
    # ORB-SLAM3 against OpenCV float64 in region A, and the mirrored sets
    okA = A & ~s64
    # (reprojected, as planned: both outputs sent back through the forward model, then compared in pixels)
    if okA.any():
        fwd = lambda x, y: (lambda r: (lambda s: (x * s * fx + cx, y * s * fy + cy))(
            np.where(r > 0, td_poly(np.arctan(r), k) / np.where(r > 0, r, 1), 1.0)))(np.hypot(x, y))
        a1, b1 = fwd(xo[okA], yo[okA])
        a2, b2 = fwd(x64[okA], y64[okA])
        res["orb3_vs_cv64_A_max_px"] = float(np.hypot(a1 - a2, b1 - b2).max())
    else:
        res["orb3_vs_cv64_A_max_px"] = None
    res["orb3_mirrors_same_C"] = bool(np.array_equal(mo & C, m64 & C))
    mono = res["monotone_to_corner"]
    va = angle(ray_from_theta(xd, yd, vt), true_ray)
    res["vins"] = dict(max_angle_rad=float(va[reg != "F"].max()), max_angle_rad_C=float(va[C].max()) if C.any() else None)
    # tool vs numpy truth on a subsample
    idx = np.linspace(0, u.size - 1, 400).astype(int)
    tool = [fc.inverse_theta(td[i], k) for i in idx]
    res["tool_vs_truth_max"] = float(max(abs(a - b) for a, b in zip(tool, th[idx]) if a is not None and not np.isnan(b)))
    tool_loop = [fc.opencv_loop(xd[i], yd[i], k) for i in idx]
    dif = [math.hypot(p[0] - o64[i, 0], p[1] - o64[i, 1]) for p, i in zip(tool_loop, idx) if p is not None]
    res["tool_loop_vs_cv_max"] = float(max(dif)) if dif else None
    res["tool_loop_sentinel_agree"] = all((p is None) == bool(s64[i]) for p, i in zip(tool_loop, idx))
    grid_shape = uu.shape
    return res, dict(reg=reg.reshape(grid_shape), mir=m64.reshape(grid_shape), u=uu, v=vv, td90=res["td90"], K=K, k=k)


def main():
    t0 = time.time()
    d = json.load(open(os.path.join(HERE, "calibs.json")))
    groups = distinct(d["cameras"])
    rows, maps = [], {}
    for g in groups:
        r, m = run_one(g)
        rows.append(r)
        maps[r["label"]] = m
    hyp = {}
    hyp["H321"] = all(r["opencv64"].get("A_max_reproj_px") is not None and r["opencv64"]["A_max_reproj_px"] <= 1e-6
                      and r["opencv64"]["A_sentinel"] == 0 for r in rows)
    withC = [r for r in rows if r["share_C"] > 0]
    hyp["H322"] = bool(withC) and all(r["opencv64"]["C_sentinel"] == 0 for r in withC)
    low = [r for r in withC if r["td90"] < HALF_PI]
    hyp["H323"] = bool(low) and all(r["opencv64"]["C_mirrored"] == r["opencv64"]["C_n"] for r in low)
    tum0 = next(r for r in rows if r["label"] == "TUM-VI cam0")
    onlyC = all(("TUM-VI" in r["label"] or "T265" in r["label"]) for r in withC)
    hyp["H324"] = onlyC and 0.05 <= tum0["share_C"] <= 0.09
    hyp["H325"] = all((r["orb3_vs_cv64_A_max_px"] or 0) <= 1e-3 and r["orb3_mirrors_same_C"] for r in rows)
    hyp["H326"] = all(r["vins"]["max_angle_rad"] <= 1e-9 for r in rows if r["monotone_to_corner"])
    hyp["H327"] = all(r["monotone_to_corner"] for r in rows)
    tot = dict(C_pixels=sum(r["opencv64"].get("C_n", 0) for r in rows),
               C_sentinel=sum(r["opencv64"].get("C_sentinel", 0) for r in rows),
               C_mirrored=sum(r["opencv64"].get("C_mirrored", 0) for r in rows),
               calibrations_with_C=len(withC))
    out = dict(opencv=cv2.__version__, totals=tot, numpy=np.__version__, grid_px=GRID, files=d["files"], cameras=len(d["cameras"]),
               distinct=len(rows), hypotheses=hyp, calibrations=rows, seconds=round(time.time() - t0, 1))
    json.dump(out, open(os.path.join(HERE, "summary.json"), "w"), indent=1, default=float)

    L = [f"Milestone 3zj: OpenCV {cv2.__version__}, {len(d['cameras'])} cameras -> {len(rows)} distinct, {GRID}-px grid, "
         f"{out['seconds']} s", ""]
    L.append(f"{'calibration':34s} {'r90 px':>7s} {'fold':>6s} {'A%':>6s} {'B%':>5s} {'C%':>6s} {'cv A px':>9s} "
             f"{'cv32 A px':>9s} {'C sent':>6s} {'C mirr':>6s} {'C med deg':>9s} {'orb-cv px':>9s} {'vins rad':>9s}")
    for r in rows:
        o = r["opencv64"]
        fold = "-" if r["fold_theta"] is None else f"{r['fold_theta']:.2f}"
        L.append(f"{r['label']:34s} {r['r90_px'][0]:7.1f} {fold:>6s} "
                 f"{100*r['share_A']:6.2f} {100*r['share_B']:5.2f} {100*r['share_C']:6.2f} {o['A_max_reproj_px']:9.1e} "
                 f"{r['opencv32']['A_max_reproj_px']:9.1e} {o.get('C_sentinel', '-')!s:>6s} {o.get('C_mirrored', '-')!s:>6s} "
                 f"{(o.get('C_median_angle_deg') or float('nan')):9.1f} {r['orb3_vs_cv64_A_max_px']:9.1e} {r['vins']['max_angle_rad']:9.1e}")
    L.append("")
    for kx, vx in hyp.items():
        L.append(f"{kx}: {'held' if vx else 'refuted'}")
    L.append(f"tool vs truth (theta, rad) max over subsamples: {max(r['tool_vs_truth_max'] for r in rows):.1e}; "
             f"tool loop vs OpenCV max {max((r['tool_loop_vs_cv_max'] or 0) for r in rows):.1e}; "
             f"sentinels agree {all(r['tool_loop_sentinel_agree'] for r in rows)}")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))
    figure(maps)


def figure(maps):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.colors import ListedColormap
    names = ["TUM-VI cam0", "T265 ORB-SLAM3 Camera1"]
    fig, axs = plt.subplots(1, 2, figsize=(10, 4.6))
    cmap = ListedColormap(["#d9d9d9", "#f4a261", "#c0392b", "#5b2c6f"])
    for ax, n in zip(axs, names):
        m = maps[n]
        code = np.select([m["reg"] == "A", m["reg"] == "B", (m["reg"] == "C") & m["mir"], m["reg"] == "C"], [0, 1, 2, 3], 3)
        ax.imshow(code, cmap=cmap, vmin=-0.5, vmax=3.5, extent=(0, m["u"].max(), m["v"].max(), 0), interpolation="nearest")
        fx, fy, cx, cy = m["K"]
        tt = np.linspace(0, 2 * np.pi, 400)
        ax.plot(cx + fx * m["td90"] * np.cos(tt), cy + fy * m["td90"] * np.sin(tt), "k--", lw=0.8)
        ax.set_xlim(0, m["u"].max())
        ax.set_ylim(m["v"].max(), 0)
        ax.set_title(n, fontsize=10)
        ax.set_xlabel("u (px)")
    axs[0].set_ylabel("v (px)")
    from matplotlib.patches import Patch
    fig.legend(handles=[Patch(color=cmap(0), label="A: OpenCV exact"), Patch(color=cmap(1), label="B: clamped, < 90°"),
                        Patch(color=cmap(2), label="C: ray ≥ 90°, returned mirrored, unflagged"),
                        Patch(color=cmap(3), label="C: ray ≥ 90°, other")], loc="lower center", ncol=2, fontsize=8, frameon=False)
    fig.suptitle("cv::fisheye::undistortPoints (4.12.0, default criterion) by pixel; dashed: where a 90° ray lands", fontsize=10)
    fig.tight_layout(rect=(0, 0.1, 1, 0.95))
    fig.savefig(os.path.join(HERE, "regions.png"), dpi=110)


if __name__ == "__main__":
    main()
