"""2D lidar point-to-line scan matching in a corridor: exact information, a real ICP, and a filter that trusts the twin's covariance.

World = list of line segments. A scan is ray-cast with Gaussian range noise. The matcher is Levenberg-damped Gauss-Newton on the
signed point-to-line distance to the nearest map segment (pose = x, y, theta). Linearised at the true pose, with correspondences
fixed, the estimate error is (A)^-1 sum h_i r_i, A = sum h_i h_i^T, h_i = [n_x, n_y, p_i x n_i], r_i = sigma n_i.u_i eps_i, so
Cov = A^-1 (sum h_i h_i^T s_i^2) A^-1, s_i = sigma |n_i.u_i| (sandwich form, exact for the unweighted estimator).
"""
import math
import random


def corridor(length=60.0, width=2.0, spacing=None, depth=0.3):
    """Two walls y=+-width/2, end caps, and (optionally) door-frame stubs of the given depth every `spacing` metres."""
    h = width / 2.0
    segs = [((-5.0, -h), (length, -h)), ((-5.0, h), (length, h)), ((-5.0, -h), (-5.0, h)), ((length, -h), (length, h))]
    if spacing:
        x = spacing
        while x < length - 1.0:
            segs.append(((x, h), (x, h - depth)))
            segs.append(((x, -h), (x, -h + depth)))
            x += spacing
    return segs


def room(side=20.0):
    h = side / 2.0
    return [((-h, -h), (h, -h)), ((h, -h), (h, h)), ((h, h), (-h, h)), ((-h, h), (-h, -h))]


def _hit(ox, oy, dx, dy, seg):
    (ax, ay), (bx, by) = seg
    ex, ey = bx - ax, by - ay
    den = dx * ey - dy * ex
    if abs(den) < 1e-12:
        return None
    t = ((ax - ox) * ey - (ay - oy) * ex) / den
    u = ((ax - ox) * dy - (ay - oy) * dx) / den
    return t if t > 1e-9 and -1e-12 <= u <= 1 + 1e-12 else None


def raycast(segs, pose, nrays=360, maxr=30.0):
    """Noise-free ranges at the given angles (sensor frame); None where nothing is hit within maxr."""
    x, y, th = pose
    out = []
    for k in range(nrays):
        a = 2.0 * math.pi * k / nrays
        dx, dy = math.cos(th + a), math.sin(th + a)
        best = None
        for s in segs:
            t = _hit(x, y, dx, dy, s)
            if t is not None and (best is None or t < best):
                best = t
        out.append(best if best is not None and best <= maxr else None)
    return out


def scan(segs, pose, sigma, rng, nrays=360, maxr=30.0):
    """Sensor-frame points (px, py) with range noise; returns list of (angle, range)."""
    r = raycast(segs, pose, nrays, maxr)
    return [(2.0 * math.pi * k / nrays, ri + rng.gauss(0.0, sigma)) for k, ri in enumerate(r) if ri is not None]


def _nearest(segs, px, py):
    """Closest point on the map to (px, py): returns (distance, unit normal pointing from the map to the point)."""
    best = (1e18, 0.0, 0.0)
    for (ax, ay), (bx, by) in segs:
        ex, ey = bx - ax, by - ay
        t = max(0.0, min(1.0, ((px - ax) * ex + (py - ay) * ey) / (ex * ex + ey * ey)))
        cx, cy = ax + t * ex, ay + t * ey
        d2 = (px - cx) ** 2 + (py - cy) ** 2
        if d2 < best[0] ** 2:
            d = math.sqrt(d2)
            if 0.0 < t < 1.0:  # interior hit: use the segment normal so that the residual is point-to-line
                L = math.sqrt(ex * ex + ey * ey)
                nx, ny = -ey / L, ex / L
                if nx * (px - cx) + ny * (py - cy) < 0:
                    nx, ny = -nx, -ny
            elif d > 1e-12:
                nx, ny = (px - cx) / d, (py - cy) / d
            else:
                nx, ny = 0.0, 1.0
            best = (d, nx, ny)
    return best


def solve3(A, g):
    """Solve the 3x3 system A d = g by Gaussian elimination with partial pivoting."""
    M = [row[:] + [g[i]] for i, row in enumerate(A)]
    for c in range(3):
        p = max(range(c, 3), key=lambda r: abs(M[r][c]))
        M[c], M[p] = M[p], M[c]
        for r in range(c + 1, 3):
            f = M[r][c] / M[c][c]
            for k in range(c, 4):
                M[r][k] -= f * M[c][k]
    d = [0.0] * 3
    for r in (2, 1, 0):
        d[r] = (M[r][3] - sum(M[r][k] * d[k] for k in range(r + 1, 3))) / M[r][r]
    return d


def icp(segs, pts, init, iters=15, lam=1e-3):
    """Damped Gauss-Newton point-to-line matching of sensor-frame polar points to the map. Returns the pose estimate."""
    x, y, th = init
    for _ in range(iters):
        A = [[0.0] * 3 for _ in range(3)]
        g = [0.0] * 3
        for a, r in pts:
            bx, by = r * math.cos(a), r * math.sin(a)  # sensor-frame point
            c, s = math.cos(th), math.sin(th)
            wx, wy = x + c * bx - s * by, y + s * bx + c * by
            d, nx, ny = _nearest(segs, wx, wy)
            res = d  # the normal points from the map to the point, so the signed point-to-line residual is +d
            rx, ry = wx - x, wy - y
            h = (nx, ny, -ry * nx + rx * ny)
            for i in range(3):
                g[i] += h[i] * res
                for j in range(3):
                    A[i][j] += h[i] * h[j]
        for i in range(3):
            A[i][i] += lam * (A[i][i] + 1e-9) + 1e-9
        dlt = solve3(A, g)
        x, y, th = x - dlt[0], y - dlt[1], th - dlt[2]
        if max(abs(dlt[0]), abs(dlt[1])) < 1e-7 and abs(dlt[2]) < 1e-8:
            break
    return (x, y, th)


def sandwich_cov(segs, pose, sigma, nrays=360, maxr=30.0, ridge=0.0):
    """Exact linearised covariance (3x3 list) of the unweighted point-to-line estimate at `pose` (noise-free correspondences)."""
    x, y, th = pose
    A = [[0.0] * 3 for _ in range(3)]
    B = [[0.0] * 3 for _ in range(3)]
    for k, r in enumerate(raycast(segs, pose, nrays, maxr)):
        if r is None:
            continue
        a = th + 2.0 * math.pi * k / nrays
        ux, uy = math.cos(a), math.sin(a)
        px, py = x + r * ux, y + r * uy
        d, nx, ny = _nearest(segs, px, py)
        h = (nx, ny, -(r * uy) * nx + (r * ux) * ny)
        s2 = (sigma * (nx * ux + ny * uy)) ** 2
        for i in range(3):
            for j in range(3):
                A[i][j] += h[i] * h[j]
                B[i][j] += h[i] * h[j] * s2
    return A, B


def inv3(A):
    cols = []
    for j in range(3):
        cols.append(solve3(A, [1.0 if i == j else 0.0 for i in range(3)]))
    return [[cols[j][i] for j in range(3)] for i in range(3)]


def matmul(X, Y):
    return [[sum(X[i][k] * Y[k][j] for k in range(3)) for j in range(3)] for i in range(3)]


def cov_from(A, B, ridge=0.0):
    Ar = [[A[i][j] + (ridge if i == j else 0.0) for j in range(3)] for i in range(3)]
    Ai = inv3(Ar)
    return matmul(matmul(Ai, B), Ai)


def eig_sym3_min_max(A):
    """Smallest and largest eigenvalue of a symmetric 3x3 by power / inverse iteration (enough for a condition number)."""
    v = [1.0, 0.7, 0.3]
    lmax = 0.0
    for _ in range(200):
        w = [sum(A[i][j] * v[j] for j in range(3)) for i in range(3)]
        lmax = math.sqrt(sum(t * t for t in w))
        v = [t / lmax for t in w]
    u = [1.0, 0.7, 0.3]
    lmin_inv = 0.0
    for _ in range(200):
        w = solve3(A, u)
        lmin_inv = math.sqrt(sum(t * t for t in w))
        u = [t / lmin_inv for t in w]
    return 1.0 / lmin_inv, lmax


def gapped_corridor(length=60.0, width=2.0, spacing=5.0, gap=(15.0, 45.0), depth=0.3):
    """Corridor with door-frame stubs every `spacing` m except in the featureless span `gap`."""
    segs = corridor(length, width)
    h = width / 2.0
    x = spacing
    while x < length - 1.0:
        if not gap[0] <= x <= gap[1]:
            segs.append(((x, h), (x, h - depth)))
            segs.append(((x, -h), (x, -h + depth)))
        x += spacing
    return segs


def observable(A, cond_max=1e5):
    try:
        lo, hi = eig_sym3_min_max(A)
    except ZeroDivisionError:  # exactly singular information (e.g. a featureless corridor)
        return False
    return lo > 0 and hi / lo < cond_max


def run_filter(segs, rng, mode, sigma=0.02, sig_odo=0.01, step=0.5, x0=5.0, x1=55.0, nrays=180, maxr=10.0, y=0.2, th=0.05,
               R_twin=None):
    """Drive along the corridor with a 1-D along-track Kalman filter fed by scan-matching x.

    mode 'odo'  : odometry only.
    mode 'twin' : measurement variance R_twin everywhere (the isotropic well-featured twin's value).
    mode 'real' : measurement variance from the sandwich covariance at the predicted pose; update skipped if the scan
                  information matrix is ill-conditioned (unobservable along track).
    Returns a list of (x_true, error, P) per step.
    """
    xt = x0
    xe, P = x0, 0.0
    out = []
    for _ in range(int(round((x1 - x0) / step))):
        xt += step
        xe += step + rng.gauss(0.0, sig_odo)  # odometry reading = truth + noise: error accumulates as a random walk
        P += sig_odo ** 2
        if mode != "odo":
            pts = scan(segs, (xt, y, th), sigma, rng, nrays, maxr)
            if mode == "twin":
                R = R_twin
            else:
                A, B = sandwich_cov(segs, (xe, y, th), sigma, nrays, maxr)
                R = cov_from(A, B)[0][0] if observable(A) else None
            if R is not None:
                z = icp(segs, pts, (xe, y, th))[0]
                K = P / (P + R)
                xe += K * (z - xe)
                P *= (1.0 - K)
        out.append((xt, xe - xt, P))
    return out
