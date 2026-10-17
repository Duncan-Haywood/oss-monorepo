"""Range-based localisation (UWB anchors, radar/lidar beacons) in a digital twin.  The twin draws every range as true distance
plus Gaussian noise; a real site also has non-line-of-sight (NLOS) ranges that are biased LONG by an exponential excess path.
Linear model: with n anchors whose unit directions are u_i, small range errors e_i give a position error (H^T H)^-1 H^T e for
H the matrix of unit vectors, so an NLOS fraction p with mean excess m shifts the least-squares fix by p*m*(H^T H)^-1 H^T 1.
Pure Python, 2-D."""
import math, random

__all__ = ["ring", "gdop", "ls_bias", "fix", "trimmed_fix", "simulate", "anchors_needed"]


def ring(n, radius=50.0, start=0.0):
    """n anchors equally spaced on a circle around the origin."""
    return [(radius * math.cos(start + 2 * math.pi * k / n), radius * math.sin(start + 2 * math.pi * k / n)) for k in range(n)]


def _hth(anchors, x):
    a = b = c = 0.0
    for ax, ay in anchors:
        dx, dy = x[0] - ax, x[1] - ay
        d = math.hypot(dx, dy)
        ux, uy = dx / d, dy / d
        a += ux * ux; b += ux * uy; c += uy * uy
    return a, b, c


def gdop(anchors, x=(0.0, 0.0)):
    """sqrt(trace (H^T H)^-1): position std per unit range std with iid errors."""
    a, b, c = _hth(anchors, x)
    det = a * c - b * b
    return math.sqrt((a + c) / det)


def ls_bias(anchors, x, nlos):
    """Linearised bias (bx, by) of the LS fix when anchor i has expected range error nlos[i] (mean excess path)."""
    a, b, c = _hth(anchors, x)
    det = a * c - b * b
    rx = ry = 0.0
    for (ax, ay), m in zip(anchors, nlos):
        dx, dy = x[0] - ax, x[1] - ay
        d = math.hypot(dx, dy)
        rx += dx / d * m; ry += dy / d * m
    return ((c * rx - b * ry) / det, (-b * rx + a * ry) / det)


def fix(anchors, ranges, x0=(0.0, 0.0), iters=8, use=None):
    """Gauss-Newton least-squares position from ranges (optionally only anchor indices `use`)."""
    idx = list(range(len(anchors))) if use is None else list(use)
    x, y = x0
    for _ in range(iters):
        a = b = c = gx = gy = 0.0
        for i in idx:
            ax, ay = anchors[i]
            dx, dy = x - ax, y - ay
            d = math.hypot(dx, dy) or 1e-9
            ux, uy = dx / d, dy / d
            r = ranges[i] - d
            a += ux * ux; b += ux * uy; c += uy * uy
            gx += ux * r; gy += uy * r
        det = a * c - b * b
        if abs(det) < 1e-12:
            break
        x += (c * gx - b * gy) / det
        y += (-b * gx + a * gy) / det
    return x, y


def trimmed_fix(anchors, ranges, drop=1, x0=(0.0, 0.0)):
    """Fix, then repeatedly drop the anchor with the largest residual `drop` times and refit (keeps >= 3 anchors)."""
    use = list(range(len(anchors)))
    x = fix(anchors, ranges, x0, use=use)
    for _ in range(drop):
        if len(use) <= 3:
            break
        res = {i: abs(ranges[i] - math.hypot(x[0] - anchors[i][0], x[1] - anchors[i][1])) for i in use}
        use.remove(max(res, key=res.get))
        x = fix(anchors, ranges, x, use=use)
    return x


def simulate(anchors, x, p, m, sigma, rng, nlos_on=True):
    """One set of ranges: true distance + N(0,sigma^2) + (w.p. p, if nlos_on) Exp(mean m) excess."""
    out = []
    for ax, ay in anchors:
        r = math.hypot(x[0] - ax, x[1] - ay) + rng.gauss(0, sigma)
        if nlos_on and rng.random() < p:
            r += rng.expovariate(1.0 / m)
        out.append(r)
    return out


def anchors_needed(target, sigma, radius=50.0, nmax=200):
    """Smallest ring size whose twin (iid Gaussian) position rms error sigma*GDOP is <= target."""
    for n in range(3, nmax + 1):
        if sigma * gdop(ring(n, radius)) <= target:
            return n
    return None
