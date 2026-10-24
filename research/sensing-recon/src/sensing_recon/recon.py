"""Pinhole cameras on an orbit, noisy feature tracks, linear (DLT) triangulation, Chamfer score.

Units: the object has a mean radius of about 1, so errors are fractions of that radius.
Camera poses and feature correspondences are given (no feature matching, no bundle adjustment).
"""
from dataclasses import dataclass
import numpy as np

F_PX = 800.0          # focal length in pixels
CX, CY = 320.0, 240.0  # principal point, 640 x 480 image
W, H = 640, 480
DIST = 4.0            # camera distance from the object centre
SURFACE = (1.2, 0.9, 0.8, 0.12, 4.0, 3.0, 5.0)  # ellipsoid axes, bump amplitude, three bump frequencies
MIN_COS = 0.25        # a surface point is seen if its normal faces the camera by this cosine


@dataclass
class Camera:
    R: np.ndarray   # world -> camera rotation (3x3)
    t: np.ndarray   # world -> camera translation (3,)

    def P(self):
        K = np.array([[F_PX, 0, CX], [0, F_PX, CY], [0, 0, 1.0]])
        return K @ np.hstack([self.R, self.t[:, None]])

    def centre(self):
        return -self.R.T @ self.t


def _radius(d, rng_params):
    """Radius of a bumpy ellipsoid in direction d (unit vectors, n x 3)."""
    a, b, c, amp, f1, f2, f3 = rng_params
    base = 1.0 / np.sqrt((d[:, 0] / a) ** 2 + (d[:, 1] / b) ** 2 + (d[:, 2] / c) ** 2)
    bump = 1 + amp * np.sin(f1 * d[:, 0] + f2 * d[:, 1]) * np.cos(f3 * d[:, 2])
    return base * bump


def make_object(n, seed=0):
    """n points and unit-ish normals on a bumpy ellipsoid (a stand-in for a textured object)."""
    rng = np.random.default_rng(seed)
    params = SURFACE
    d = rng.normal(size=(n, 3))
    d /= np.linalg.norm(d, axis=1, keepdims=True)
    pts = d * _radius(d, params)[:, None]
    # normal from the gradient of the implicit radial function, by finite differences
    eps = 1e-4
    nrm = np.zeros_like(pts)
    for k in range(3):
        dp = pts.copy(); dp[:, k] += eps
        dm = pts.copy(); dm[:, k] -= eps
        nrm[:, k] = _implicit(dp, params) - _implicit(dm, params)
    nrm /= np.linalg.norm(nrm, axis=1, keepdims=True)
    return pts, nrm


def _implicit(p, params):
    r = np.linalg.norm(p, axis=1)
    d = p / r[:, None]
    return r - _radius(d, params)


def orbit_cameras(n_views, span_deg=360.0, elevation_deg=30.0, centre_deg=0.0):
    """n_views cameras of azimuth span `span_deg` centred on `centre_deg`, looking at the origin.

    Elevation alternates +/- `elevation_deg` between neighbouring cameras so top and bottom are both seen."""
    if n_views == 1:
        az = np.array([centre_deg])
    elif span_deg >= 360.0:
        az = centre_deg + np.arange(n_views) * 360.0 / n_views
    else:
        az = centre_deg + np.linspace(-span_deg / 2, span_deg / 2, n_views)
    az = np.radians(az)
    cams = []
    for k, a in enumerate(az):
        el = np.radians(elevation_deg if k % 2 == 0 else -elevation_deg)
        c = DIST * np.array([np.cos(el) * np.cos(a), np.cos(el) * np.sin(a), np.sin(el)])
        z = -c / np.linalg.norm(c)                    # optical axis toward the origin
        x = np.cross(z, [0, 0, 1.0]); x /= np.linalg.norm(x)   # image right
        y = np.cross(z, x)                            # image down
        R = np.vstack([x, y, z])
        cams.append(Camera(R, -R @ c))
    return cams


def project(cam, pts):
    pc = pts @ cam.R.T + cam.t
    return np.stack([F_PX * pc[:, 0] / pc[:, 2] + CX, F_PX * pc[:, 1] / pc[:, 2] + CY], axis=1)


def visible(cam, pts, nrm):
    """Facing the camera, in front of it and inside the image."""
    to_cam = cam.centre() - pts
    to_cam /= np.linalg.norm(to_cam, axis=1, keepdims=True)
    ok = (nrm * to_cam).sum(1) > MIN_COS
    uv = project(cam, pts)
    return ok & (uv[:, 0] >= 0) & (uv[:, 0] < W) & (uv[:, 1] >= 0) & (uv[:, 1] < H)


def triangulate_all(cams, uvs, vis, min_angle_deg=2.0):
    """DLT triangulation of every point seen in >= 2 views with a ray angle >= min_angle_deg.

    uvs: (V, n, 2) observed pixels. vis: (V, n) bool. Returns (points, index of each in the input).
    """
    Ps = [c.P() for c in cams]
    centres = np.array([c.centre() for c in cams])
    out, idx = [], []
    cos_max = np.cos(np.radians(min_angle_deg))
    for i in range(vis.shape[1]):
        views = np.flatnonzero(vis[:, i])
        if len(views) < 2:
            continue
        A = []
        for v in views:
            P = Ps[v]
            u, w = uvs[v, i]
            A.append(u * P[2] - P[0])
            A.append(w * P[2] - P[1])
        _, _, vt = np.linalg.svd(np.array(A))
        X = vt[-1]
        if abs(X[3]) < 1e-12:
            continue
        X = X[:3] / X[3]
        # widest ray pair must exceed the angle threshold
        rays = centres[views] - X
        rays /= np.linalg.norm(rays, axis=1, keepdims=True)
        if (rays @ rays.T).min() > cos_max:
            continue
        out.append(X); idx.append(i)
    return np.array(out).reshape(-1, 3), np.array(idx, dtype=int)


def surface_error(recon):
    """Distance of each reconstructed point to the true surface, to first order (radial offset).

    Exact surface rather than a sampled reference cloud, so the score has no sampling floor.
    """
    return np.abs(_implicit(recon, SURFACE))


def run_trial(n_views, span_deg, sigma_px, seed, n_feat=800, pose_sigma_deg=0.0):
    """One reconstruction. Returns mean and RMS surface error (object radii), completeness and point count.

    completeness = reconstructed points / surface features. pose_sigma_deg perturbs each
    camera's rotation (an error in the assumed pose).
    """
    rng = np.random.default_rng(1000 + seed)
    pts, nrm = make_object(n_feat, seed=seed)
    true_cams = orbit_cameras(n_views, span_deg)
    vis = np.array([visible(c, pts, nrm) for c in true_cams])
    uvs = np.array([project(c, pts) + rng.normal(0, sigma_px, (len(pts), 2)) for c in true_cams])
    cams = true_cams
    if pose_sigma_deg > 0:
        cams = []
        for c in true_cams:
            w = np.radians(rng.normal(0, pose_sigma_deg, 3))
            K = np.array([[0, -w[2], w[1]], [w[2], 0, -w[0]], [-w[1], w[0], 0]])
            R = (np.eye(3) + K + 0.5 * K @ K) @ c.R
            cams.append(Camera(R, c.t))
    rec, _ = triangulate_all(cams, uvs, vis)
    if len(rec) == 0:
        return {"mean_err": float("inf"), "rms_err": float("inf"), "completeness": 0.0, "n_points": 0}
    e = surface_error(rec)
    return {"mean_err": float(e.mean()), "rms_err": float(np.sqrt((e ** 2).mean())),
            "completeness": len(rec) / n_feat, "n_points": len(rec)}
