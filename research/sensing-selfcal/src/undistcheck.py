"""Which pixels does your undistortion get wrong? A stdlib check and an inverse that is right.

    python3 src/undistcheck.py camera_info.yaml            # a ROS camera_calibration / camera_info YAML
    python3 src/undistcheck.py --json calib.json           # {"K": [[fx,0,cx],[0,fy,cy],[0,0,1]], "D": [k1,k2,p1,p2,k3], "size": [w,h]}
    python3 src/undistcheck.py camera_info.yaml --grid 4   # also the share of a 4-px grid off by > 1 px

Stdlib only, MIT. Written from the model's equations, not from any library's source.

Most callers invert OpenCV's five-term (plumb_bob) model with the classic undamped fixed-point
loop x <- (x_d - Delta(x)) / c(r): cv2.undistortPoints with its default criterion (5 steps) in
every release and with any criterion before 4.13.0, Kornia's undistort_points, ORB-SLAM2/3's
Frame and ROS image_geometry's rectifyPoint (LOG.md, milestones 3zg and 3zh). That loop converges
at a pixel only where the spectral radius of its Jacobian at the answer is below 1; at the
corners of many wide-angle robot calibrations it is not, and the loop returns a point tens or
hundreds of pixels off without any error. This tool

  * runs that loop (`fixed_point`) and reports its reprojection error per corner at 5 and 200 steps;
  * gives the loop's spectral radius at the answer (`loop_radius`; < 1 converges, >= 1 cannot);
  * inverts the model by Newton's method with step halving (`undistort`), refusing (None) where
    the model folds, i.e. where no ray on the invertible branch lands on the pixel.

Exit status: 0 if the 5-step loop is within 1 px at every corner, 1 if not (or the model folds
inside the image), 2 on bad input.
"""
import argparse
import json
import math
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from foldcheck import fold_x, rho as radial_rho  # noqa: E402


def _coeffs(D):
    D = [float(d) for d in D]
    if len(D) > 5 and any(D[5:]):
        raise ValueError("only the five-term model (k1, k2, p1, p2, k3) is supported")
    return (D + [0.0] * 5)[:5]


def distort(x, y, D):
    """Normalised undistorted (x, y) -> normalised distorted point, OpenCV's five-term model."""
    k1, k2, p1, p2, k3 = _coeffs(D)
    r2 = x * x + y * y
    c = 1 + r2 * (k1 + r2 * (k2 + r2 * k3))
    return (x * c + 2 * p1 * x * y + p2 * (r2 + 2 * x * x),
            y * c + p1 * (r2 + 2 * y * y) + 2 * p2 * x * y)


def jacobian(x, y, D):
    """Analytic 2x2 Jacobian of `distort` at (x, y), and c(r)."""
    k1, k2, p1, p2, k3 = _coeffs(D)
    r2 = x * x + y * y
    c = 1 + r2 * (k1 + r2 * (k2 + r2 * k3))
    dc = k1 + r2 * (2 * k2 + 3 * k3 * r2)           # dc / d(r^2)
    a = c + 2 * x * x * dc + 2 * p1 * y + 6 * p2 * x
    b = 2 * x * y * dc + 2 * p1 * x + 2 * p2 * y
    d = c + 2 * y * y * dc + 6 * p1 * y + 2 * p2 * x
    return (a, b, b, d), c


def _spectral(m):
    a, b, c, d = m
    tr, det = a + d, a * d - b * c
    disc = tr * tr / 4 - det
    if disc >= 0:
        s = math.sqrt(disc)
        return max(abs(tr / 2 + s), abs(tr / 2 - s))
    return math.sqrt(det)                            # complex pair: |lambda|^2 = det


def loop_radius(x, y, D):
    """Spectral radius of the undamped loop's Jacobian at its fixed point (x, y).
    At a fixed point the loop's Jacobian is I - J_f / c, J_f the forward model's Jacobian."""
    (a, b, c_, d), c = jacobian(x, y, D)
    return _spectral((1 - a / c, -b / c, -c_ / c, 1 - d / c))


def additive_radius(x, y, D):
    """The same for VINS-Mono's additive loop x <- x_d - (f(x) - x), whose Jacobian is I - J_f."""
    (a, b, c_, d), _ = jacobian(x, y, D)
    return _spectral((1 - a, -b, -c_, 1 - d))


def fixed_point(xd, yd, D, n, guard=True):
    """n steps of the classic undamped loop from the distorted point. With guard, a negative 1/c(r)
    ends it and returns the distorted point, as cv2.undistortPoints does. Returns (x, y, guarded)."""
    k1, k2, p1, p2, k3 = _coeffs(D)
    x, y = xd, yd
    for _ in range(n):
        r2 = x * x + y * y
        ic = 1.0 / (1 + r2 * (k1 + r2 * (k2 + r2 * k3)))
        if guard and ic < 0:
            return xd, yd, True
        dx = 2 * p1 * x * y + p2 * (r2 + 2 * x * x)
        dy = p1 * (r2 + 2 * y * y) + 2 * p2 * x * y
        x, y = (xd - dx) * ic, (yd - dy) * ic
    return x, y, False


def undistort(xd, yd, D, tol=1e-15, max_iter=50, info=None):
    """Normalised distorted (xd, yd) -> normalised undistorted (x, y) by Newton's method with step
    halving, or None where the pixel lies past the model's fold (no preimage on the invertible
    branch, or the Jacobian's determinant is not positive at the answer). `info`, a dict, gets
    the iterations taken."""
    x, y = xd, yd
    fx_, fy_ = distort(x, y, D)
    res = math.hypot(fx_ - xd, fy_ - yd)
    it = 0
    while res > tol and it < max_iter:
        (a, b, c, d), _ = jacobian(x, y, D)
        det = a * d - b * c
        if det == 0:
            return None
        ex, ey = fx_ - xd, fy_ - yd
        sx, sy = -(d * ex - b * ey) / det, -(-c * ex + a * ey) / det
        t = 1.0
        for _ in range(40):
            nx, ny = x + t * sx, y + t * sy
            gx, gy = distort(nx, ny, D)
            nres = math.hypot(gx - xd, gy - yd)
            if nres < res:
                break
            t *= 0.5
        else:
            break                                    # no descent: stalled
        x, y, fx_, fy_, res = nx, ny, gx, gy, nres
        it += 1
    if info is not None:
        info["iterations"] = it
        info["residual"] = res
    if res > 1e-10:
        return None
    (a, b, c, d), _ = jacobian(x, y, D)
    if a * d - b * c <= 0:
        return None
    k1, k2, _, _, k3 = _coeffs(D)
    xf = fold_x(k1, k2, k3)
    if xf is not None and math.hypot(x, y) > xf:
        return None
    return x, y


def _px_err(x, y, u, v, K, D):
    fx, fy, cx, cy = K
    xd, yd = distort(x, y, D)
    return math.hypot(xd * fx + cx - u, yd * fy + cy - v)


def check(K, D, width, height, grid=0):
    """Per-corner report for the pixel corners (0,0), (w-1,0), (0,h-1), (w-1,h-1)."""
    fx, fy, cx, cy = K
    out = dict(corners=[])
    for u, v in ((0.0, 0.0), (width - 1.0, 0.0), (0.0, height - 1.0), (width - 1.0, height - 1.0)):
        xd, yd = (u - cx) / fx, (v - cy) / fy
        row = dict(pixel=(u, v))
        info = {}
        t = undistort(xd, yd, D, info=info)
        row["folds"] = t is None
        row["newton_iterations"] = info.get("iterations")
        if t is not None:
            row["loop_radius"] = loop_radius(t[0], t[1], D)
        for n in (5, 200):
            x, y, g = fixed_point(xd, yd, D, n)
            row[f"loop{n}_err_px"] = _px_err(x, y, u, v, K, D)
            row[f"loop{n}_guarded"] = g
        out["corners"].append(row)
    if grid:
        bad = tot = refused = 0
        for v in range(0, int(height), grid):
            for u in range(0, int(width), grid):
                xd, yd = (u - cx) / fx, (v - cy) / fy
                x, y, _ = fixed_point(xd, yd, D, 5)
                tot += 1
                bad += _px_err(x, y, u, v, K, D) > 1
                if undistort(xd, yd, D) is None:
                    refused += 1
        out["grid"] = dict(step=grid, points=tot, share_loop5_over_1px=bad / tot, share_folded=refused / tot)
    return out


NUM = r"([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)"


def _seq_after(t, key):
    m = re.search(r"^\s*" + re.escape(key) + r"\s*:", t, re.M)
    if not m:
        return None
    rest = t[m.end():]
    if re.match(r"\s*\n\s+(cols|rows|data)\s*:", rest):
        rest = rest[re.search(r"^\s+data\s*:", rest, re.M).end():]
    f = re.match(r"\s*\[([^\]]*)\]", rest)
    if f:
        return [float(x) for x in re.findall(NUM, f.group(1))]
    b = re.match(r"\s*\n((?:\s*-\s*" + NUM + r"\s*\n)+)", rest + "\n")
    return [float(x) for x in re.findall(NUM, b.group(1))] if b else None


def _scalar(t, *keys):
    for k in keys:
        m = re.search(r"^\s*" + re.escape(k) + r"\s*:\s*" + NUM, t, re.M)
        if m:
            return float(m.group(1))
    return None


def load(path):
    """(K=(fx, fy, cx, cy), D, width, height) from a ROS camera_info YAML or the JSON above."""
    text = open(path).read()
    if path.endswith(".json"):
        o = json.loads(text)
        K, (w, h) = o["K"], o["size"]
        return (K[0][0], K[1][1], K[0][2], K[1][2]), _coeffs(o["D"]), float(w), float(h)
    t = "\n".join(re.sub(r"#.*$", "", ln) for ln in text.splitlines())
    m = re.search(r"^\s*distortion_model\s*:\s*['\"]?([A-Za-z_]+)", t, re.M)
    if m and m.group(1) not in ("plumb_bob", "rational_polynomial"):
        raise ValueError(f"distortion model {m.group(1)!r} is not the five-term polynomial (equidistant: use src/fisheyecheck.py)")
    K = _seq_after(t, "camera_matrix") or _seq_after(t, "K")
    D = _seq_after(t, "distortion_coefficients") or _seq_after(t, "D")
    w, h = _scalar(t, "image_width", "width"), _scalar(t, "image_height", "height")
    if not K or len(K) != 9 or D is None or w is None or h is None:
        raise ValueError("need camera_matrix (9 numbers), distortion_coefficients, image_width, image_height")
    return (K[0], K[4], K[2], K[5]), _coeffs(D), w, h


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("path", nargs="?")
    p.add_argument("--json")
    p.add_argument("--grid", type=int, default=0, help="also scan a grid with this step in pixels")
    a = p.parse_args(argv)
    try:
        path = a.json or a.path
        if not path:
            raise ValueError("give a camera_info YAML or --json")
        K, D, w, h = load(path)
    except (ValueError, KeyError, OSError) as e:
        print("undistcheck:", e, file=sys.stderr)
        return 2
    r = check(K, D, w, h, a.grid)
    worst = 0.0
    folded = False
    print("corner          rho(loop)  loop 5 steps  loop 200 steps  Newton")
    for c in r["corners"]:
        u, v = c["pixel"]
        folded |= c["folds"]
        worst = max(worst, c["loop5_err_px"])
        rl = "   folds" if c["folds"] else f"{c['loop_radius']:9.3f}"
        nw = "refused (past the fold)" if c["folds"] else f"exact in {c['newton_iterations']} steps"
        print(f"({u:6.0f},{v:6.0f})  {rl}  {c['loop5_err_px']:9.3f} px  {c['loop200_err_px']:11.3f} px  {nw}")
    if "grid" in r:
        g = r["grid"]
        print(f"grid every {g['step']} px: {100 * g['share_loop5_over_1px']:.1f}% of pixels off by > 1 px with "
              f"5 loop steps; {100 * g['share_folded']:.1f}% past the fold")
    if folded:
        print("FOLDS: some corner has no preimage on the model's invertible branch; recalibrate with "
              "features out to the corners (milestone 3zd).")
    if worst > 1:
        print("STALLS: the undamped loop (cv2.undistortPoints default; any criterion before OpenCV 4.13; "
              "Kornia; ORB-SLAM; ROS image_geometry) is off by > 1 px. Where rho >= 1 more steps do not help: "
              "use undistort() here, or OpenCV >= 4.13 with criteria=(COUNT|EPS, n, eps).")
    return 1 if (folded or worst > 1) else 0


if __name__ == "__main__":
    sys.exit(main())
