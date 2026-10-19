"""Scan to parametric dimensions for an axis-aligned plate with two through holes.

A scan is a point cloud sampled uniformly (by area) from the part surface, then perturbed by isotropic
Gaussian noise. Fitting is sequential RANSAC for planes (normals restricted to near the coordinate axes,
i.e. the scan is assumed to be registered to the part axes), then a circle fit to the points the planes
did not claim, in the plane perpendicular to the top face. Numpy only.
"""
from dataclasses import dataclass
import numpy as np


@dataclass(frozen=True)
class Part:
    length: float = 80.0      # x, mm
    width: float = 40.0       # y, mm
    thickness: float = 10.0   # z, mm
    hole_d: float = 8.0       # mm
    hole_gap: float = 40.0    # centre-to-centre along x, mm

    def centres(self):
        cx, cy = self.length / 2, self.width / 2
        return [(cx - self.hole_gap / 2, cy), (cx + self.hole_gap / 2, cy)]

    def true_dims(self):
        return {"length": self.length, "width": self.width, "thickness": self.thickness,
                "hole_d": self.hole_d, "hole_gap": self.hole_gap}


def sample_part(part, n, rng):
    """n points uniform by area on the surface (6 faces minus hole openings, plus two hole walls)."""
    L, W, T, r = part.length, part.width, part.thickness, part.hole_d / 2
    a_face = L * W - 2 * np.pi * r * r
    areas = {"top": a_face, "bot": a_face, "x0": W * T, "x1": W * T, "y0": L * T, "y1": L * T,
             "hole0": 2 * np.pi * r * T, "hole1": 2 * np.pi * r * T}
    names = list(areas)
    p = np.array([areas[k] for k in names])
    counts = rng.multinomial(n, p / p.sum())
    c = part.centres()
    pts = []
    for name, k in zip(names, counts):
        if k == 0:
            continue
        if name in ("top", "bot"):
            out = np.empty((0, 2))
            while len(out) < k:
                xy = rng.random((2 * k + 8, 2)) * [L, W]
                ok = np.ones(len(xy), bool)
                for cx, cy in c:
                    ok &= (xy[:, 0] - cx) ** 2 + (xy[:, 1] - cy) ** 2 > r * r
                out = np.vstack([out, xy[ok]])
            xy = out[:k]
            z = np.full(k, T if name == "top" else 0.0)
            pts.append(np.column_stack([xy, z]))
        elif name in ("x0", "x1"):
            pts.append(np.column_stack([np.full(k, 0.0 if name == "x0" else L), rng.random(k) * W, rng.random(k) * T]))
        elif name in ("y0", "y1"):
            pts.append(np.column_stack([rng.random(k) * L, np.full(k, 0.0 if name == "y0" else W), rng.random(k) * T]))
        else:
            cx, cy = c[int(name[-1])]
            th = rng.random(k) * 2 * np.pi
            pts.append(np.column_stack([cx + r * np.cos(th), cy + r * np.sin(th), rng.random(k) * T]))
    return np.vstack(pts)


def add_noise(points, sigma, rng, outlier_frac=0.0, box=None):
    """Isotropic Gaussian noise of standard deviation sigma (mm); optionally replace a fraction with uniform outliers."""
    q = points + rng.normal(0.0, sigma, points.shape)
    if outlier_frac > 0:
        lo, hi = (points.min(0) - 5, points.max(0) + 5) if box is None else box
        m = rng.random(len(q)) < outlier_frac
        q[m] = lo + rng.random((m.sum(), 3)) * (hi - lo)
    return q


def _fit_plane(p):
    c = p.mean(0)
    u, s, vt = np.linalg.svd(p - c, full_matrices=False)
    n = vt[2]
    return n, c


def ransac_planes(points, thresh, n_planes=6, iters=300, max_axis_deg=10.0, rng=None, min_inliers=50):
    """Sequential RANSAC. A candidate must have its normal within max_axis_deg of a coordinate axis.

    Returns a list of (normal, centroid, inlier_count) with normals signed to point along +axis.
    """
    rng = np.random.default_rng(0) if rng is None else rng
    rem = points.copy()
    found = []
    cos_lim = np.cos(np.radians(max_axis_deg))
    per_axis = [0, 0, 0]
    for _ in range(n_planes):
        if len(rem) < min_inliers:
            break
        sub = rem if len(rem) <= 4000 else rem[rng.choice(len(rem), 4000, replace=False)]
        idx = rng.integers(0, len(sub), (iters, 3))
        a, b, c = sub[idx[:, 0]], sub[idx[:, 1]], sub[idx[:, 2]]
        nrm = np.cross(b - a, c - a)
        ln = np.linalg.norm(nrm, axis=1)
        good = ln > 1e-9
        nrm[good] /= ln[good, None]
        good &= np.abs(nrm).max(1) >= cos_lim
        # a box has two faces per axis; further planes on that axis would just slice the side walls
        good &= np.array([per_axis[k] < 2 for k in np.abs(nrm).argmax(1)]) if good.any() else good
        if not good.any():
            break
        nrm, a = nrm[good], a[good]
        d = np.abs(np.einsum("hpk,hk->hp", sub[None, :, :] - a[:, None, :], nrm))
        best = int(np.argmax((d < thresh).sum(1)))
        n, c0 = nrm[best], a[best]
        for _r in range(2):
            m = np.abs((rem - c0) @ n) < thresh
            if m.sum() < 3:
                break
            n, c0 = _fit_plane(rem[m])
        m = np.abs((rem - c0) @ n) < thresh
        if m.sum() < min_inliers:
            break
        ax = int(np.argmax(np.abs(n)))
        if n[ax] < 0:
            n = -n
        per_axis[ax] += 1
        found.append((n, c0, int(m.sum())))
        rem = rem[~m]
    return found, rem


def _circle3(p):
    """Circle through three points; None if collinear."""
    a, b, c = p
    d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]))
    if abs(d) < 1e-9:
        return None
    ux = ((a @ a) * (b[1] - c[1]) + (b @ b) * (c[1] - a[1]) + (c @ c) * (a[1] - b[1])) / d
    uy = ((a @ a) * (c[0] - b[0]) + (b @ b) * (a[0] - c[0]) + (c @ c) * (b[0] - a[0])) / d
    return ux, uy, float(np.hypot(a[0] - ux, a[1] - uy))


def fit_circle(xy, tol, rng, trials=300, iters=30):
    """Circle fit robust to stray points: best three-point circle by inliers within tol, then Gauss-Newton on its inliers."""
    best, bn = None, -1
    for t in rng.integers(0, len(xy), (trials, 3)):
        if len(set(t)) < 3:
            continue
        c = _circle3(xy[t])
        if c is None or c[2] > 1e3:
            continue
        k = int((np.abs(np.hypot(xy[:, 0] - c[0], xy[:, 1] - c[1]) - c[2]) < tol).sum())
        if k > bn:
            best, bn = c, k
    if best is None:
        return float("nan"), float("nan"), float("nan")
    cx, cy, r = best
    for _ in range(3):
        m = np.abs(np.hypot(xy[:, 0] - cx, xy[:, 1] - cy) - r) < tol
        p = xy[m]
        if len(p) < 5:
            break
        for _g in range(iters):
            dx, dy = p[:, 0] - cx, p[:, 1] - cy
            rho = np.hypot(dx, dy) + 1e-12
            J = np.column_stack([-dx / rho, -dy / rho, -np.ones(len(p))])
            step = np.linalg.lstsq(J, -(rho - r), rcond=None)[0]
            cx, cy, r = cx + step[0], cy + step[1], r + step[2]
            if np.abs(step).max() < 1e-9:
                break
    return float(cx), float(cy), float(r)


def _split_two(xy):
    """Two-cluster split of hole points along x (the holes sit along x): 1-D k-means from the extremes."""
    x = xy[:, 0]
    c = np.array([x.min(), x.max()])
    for _ in range(30):
        lab = np.abs(x[:, None] - c[None, :]).argmin(1)
        new = np.array([x[lab == k].mean() if (lab == k).any() else c[k] for k in range(2)])
        if np.allclose(new, c):
            break
        c = new
    return lab


def extract_dimensions(planes, rem, tol, rng):
    """Dimensions from fitted planes (normals along x, y, z) and leftover points (hole walls). None if the fit failed."""
    by_axis = {0: [], 1: [], 2: []}
    for n, c, k in planes:
        by_axis[int(np.argmax(np.abs(n)))].append((float(n @ c), k))
    for ax in by_axis:
        if len(by_axis[ax]) != 2:
            return None
    ext = {}
    for ax, name in zip(range(3), ["length", "width", "thickness"]):
        d = sorted(v for v, _ in by_axis[ax])
        ext[name] = d[1] - d[0]
    if len(rem) < 20:
        return None
    lab = _split_two(rem[:, :2])
    if min((lab == 0).sum(), (lab == 1).sum()) < 10:
        return None
    circ = [fit_circle(rem[lab == k, :2], tol, rng) for k in (0, 1)]
    ext["hole_d"] = float(np.mean([2 * c[2] for c in circ]))
    ext["hole_gap"] = float(np.hypot(circ[0][0] - circ[1][0], circ[0][1] - circ[1][1]))
    return ext


def fit_part(points, sigma, rng, iters=300, k_thresh=3.0):
    """Full pipeline. Threshold is k_thresh sigma (sigma taken as the scanner's quoted noise); returns dims dict or None."""
    thresh = max(k_thresh * sigma, 0.05)
    planes, rem = ransac_planes(points, thresh, n_planes=6, iters=iters, rng=rng)
    # keep only remaining points that look like hole walls: inside the slab between the top and bottom planes
    zs = [float(n @ c) for n, c, _ in planes if np.argmax(np.abs(n)) == 2]
    if len(zs) == 2:
        lo, hi = min(zs), max(zs)
        rem = rem[(rem[:, 2] > lo + thresh) & (rem[:, 2] < hi - thresh)]
    dims = extract_dimensions(planes, rem, thresh, rng)
    if dims is None or any(not np.isfinite(v) for v in dims.values()):
        return None
    return dims


def dimension_errors(dims, truth):
    if dims is None:
        return None
    return {k: dims[k] - truth[k] for k in truth}


def cadquery_script(dims):
    """Text of a CadQuery script for the fitted plate. Generated, not executed here (CadQuery is not installed)."""
    return (
        "import cadquery as cq\n"
        f"L, W, T, D, G = {dims['length']:.3f}, {dims['width']:.3f}, {dims['thickness']:.3f}, "
        f"{dims['hole_d']:.3f}, {dims['hole_gap']:.3f}\n"
        "part = (cq.Workplane('XY').box(L, W, T, centered=(False, False, False))\n"
        "        .faces('>Z').workplane(centerOption='CenterOfBoundBox')\n"
        "        .pushPoints([(-G / 2, 0), (G / 2, 0)]).hole(D))\n"
        "cq.exporters.export(part, 'plate.step')\n"
    )
