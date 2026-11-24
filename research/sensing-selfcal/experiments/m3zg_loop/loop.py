"""A line-for-line port of OpenCV 5.1.0's undistortPoints loop, for the five-term model.

Source: modules/geometry/src/pinhole.cpp, undistortPointsInternal, at tag 5.1.0
(commit dd8d9c3833e6fbda076660cfbf2ae45611723481, Apache-2.0). Only the five-term
radial-tangential case is ported (no tilt, rational or thin-prism terms; no R or P), so the
output is the normalised undistorted point. Plan: LOG.md, "Milestone 3zg planned".

    undistort(u, v, K, D, criteria, damping=True) -> (x, y, info)

criteria is OpenCV's (type, maxCount, epsilon) with type a bit mask of COUNT (1) and EPS (2).
damping=False is an ablation: the error is still computed when EPS is set, but a step that
raises it is never rejected and alpha never halved. info records the iterations run, the
number of rejected steps and whether the loop left through the negative-1/c(r) branch.
"""
import math

COUNT, EPS = 1, 2
DEFAULT = (COUNT, 5, 0.01)   # what cv2.undistortPoints uses without a criteria argument


def undistort(u, v, K, D, criteria=DEFAULT, damping=True):
    fx, fy, cx, cy = K[0][0], K[1][1], K[0][2], K[1][2]
    k = [0.0] * 14
    for i, d in enumerate(D):
        k[i] = float(d)
    if any(k[5:]):
        raise ValueError("only the five-term model is ported")
    ctype, max_count, epsilon = criteria
    ifx, ify = 1.0 / fx, 1.0 / fy
    x = (u - cx) * ifx
    y = (v - cy) * ify
    x0, y0 = x, y                       # invMatTilt is the identity without tilt terms
    error = prev_error = float("inf")   # std::numeric_limits<double>::max(); only compared
    alpha = 1.0
    info = dict(iterations=0, rejected=0, negative_break=False)
    j = 0
    while True:
        if (ctype & COUNT) and j >= max_count:
            break
        if (ctype & EPS) and error < epsilon:
            break
        r2 = x * x + y * y
        icdist = (1 + ((k[7] * r2 + k[6]) * r2 + k[5]) * r2) / (1 + ((k[4] * r2 + k[1]) * r2 + k[0]) * r2)
        if icdist < 0:
            x = (u - cx) * ifx
            y = (v - cy) * ify
            info["negative_break"] = True
            break
        delta_x = 2 * k[2] * x * y + k[3] * (r2 + 2 * x * x) + k[8] * r2 + k[9] * r2 * r2
        delta_y = k[2] * (r2 + 2 * y * y) + 2 * k[3] * x * y + k[10] * r2 + k[11] * r2 * r2
        new_x = (1.0 - alpha) * x + alpha * (x0 - delta_x) * icdist
        new_y = (1.0 - alpha) * y + alpha * (y0 - delta_y) * icdist
        if ctype & EPS:
            r2 = new_x * new_x + new_y * new_y
            r4 = r2 * r2
            r6 = r4 * r2
            a1 = 2 * new_x * new_y
            a2 = r2 + 2 * new_x * new_x
            a3 = r2 + 2 * new_y * new_y
            cdist = 1 + k[0] * r2 + k[1] * r4 + k[4] * r6
            icdist2 = 1.0 / (1 + k[5] * r2 + k[6] * r4 + k[7] * r6)
            xd0 = new_x * cdist * icdist2 + k[2] * a1 + k[3] * a2 + k[8] * r2 + k[9] * r4
            yd0 = new_y * cdist * icdist2 + k[2] * a3 + k[3] * a1 + k[10] * r2 + k[11] * r4
            x_proj = xd0 * fx + cx
            y_proj = yd0 * fy + cy
            error = math.sqrt((x_proj - u) ** 2 + (y_proj - v) ** 2)
        if damping and error > prev_error:
            alpha *= 0.5
            info["rejected"] += 1
        else:
            x, y = new_x, new_y
        prev_error = error              # as in the source: the rejected step's error, too
        j += 1
    info["iterations"] = j
    return x, y, info


def radial(r, k1, k2, k3):
    """rho(r) = r c(r) and lambda(r) = -r c'(r) / c(r), the undamped map's slope at a fixed point r."""
    u = r * r
    c = 1 + k1 * u + k2 * u * u + k3 * u ** 3
    dc = 2 * k1 * r + 4 * k2 * r ** 3 + 6 * k3 * r ** 5
    return r * c, -r * dc / c


def true_radius(rd, k1, k2, k3, rmax=20.0, n=20000):
    """Smallest r with rho(r) = rd on the monotone branch from 0, or None if rho folds first."""
    prev_r, prev_rho = 0.0, 0.0
    for i in range(1, n + 1):
        r = rmax * i / n
        rho, _ = radial(r, k1, k2, k3)
        if rho < prev_rho:              # folded before reaching rd
            return None
        if rho >= rd:
            lo, hi = prev_r, r
            for _ in range(100):
                mid = 0.5 * (lo + hi)
                if radial(mid, k1, k2, k3)[0] < rd:
                    lo = mid
                else:
                    hi = mid
            return 0.5 * (lo + hi)
        prev_r, prev_rho = r, rho
    return None


def fixed_point_map(x, y, x0, y0, D):
    """One undamped step of the loop (five-term model), as a function of the current (x, y)."""
    k1, k2, p1, p2, k3 = (list(D) + [0.0] * 5)[:5]
    r2 = x * x + y * y
    icdist = 1.0 / (1 + ((k3 * r2 + k2) * r2 + k1) * r2)
    dx = 2 * p1 * x * y + p2 * (r2 + 2 * x * x)
    dy = p1 * (r2 + 2 * y * y) + 2 * p2 * x * y
    return (x0 - dx) * icdist, (y0 - dy) * icdist


def spectral_radius(x, y, x0, y0, D, h=1e-7):
    """Largest |eigenvalue| of the undamped map's 2x2 Jacobian at (x, y), by central differences.
    At the fixed point it decides local convergence of COUNT-only iteration (post hoc, milestone 3zg)."""
    import numpy as np
    J = np.empty((2, 2))
    for j, (ex, ey) in enumerate(((h, 0.0), (0.0, h))):
        a = fixed_point_map(x + ex, y + ey, x0, y0, D)
        b = fixed_point_map(x - ex, y - ey, x0, y0, D)
        J[0, j] = (a[0] - b[0]) / (2 * h)
        J[1, j] = (a[1] - b[1]) / (2 * h)
    return float(max(abs(np.linalg.eigvals(J))))
