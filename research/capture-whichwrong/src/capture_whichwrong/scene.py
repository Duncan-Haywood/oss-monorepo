"""A tiny ray-traced scene: textured ground, a subject cylinder and optional bystander cylinders.

Everything is analytic and deterministic, so a view rendered from any pose is an exact ground truth for a
synthesised view. Units are metres; y is up.
"""
import numpy as np

W, H = 192, 128           # image size (assumed, small so a sweep runs in seconds)
HFOV = 60.0               # horizontal field of view in degrees (assumed)
F = (W / 2) / np.tan(np.radians(HFOV / 2))
R_CAM, CAM_H = 3.0, 1.5   # ring radius and camera height (assumed, as capture-rig)
TARGET = np.array([0.0, 0.9, 0.0])
SUBJECT = (0.0, 0.0, 0.25, 1.8)   # x, z, radius, height
SKY = np.array([0.55, 0.7, 0.9])


def _noise(a, b, seed):
    """Deterministic hash noise in [0,1) of two arrays."""
    n = np.sin(a * 127.1 + b * 311.7 + seed * 74.7) * 43758.5453
    return n - np.floor(n)


def _tex(a, b, scale, seed):
    """Two-octave value texture (smooth, so not the worst case for matching)."""
    out = 0
    for amp, s in ((0.65, scale), (0.35, scale * 3)):
        x, y = a * s, b * s
        xi, yi = np.floor(x), np.floor(y)
        fx, fy = x - xi, y - yi
        fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
        n00, n10 = _noise(xi, yi, seed), _noise(xi + 1, yi, seed)
        n01, n11 = _noise(xi, yi + 1, seed), _noise(xi + 1, yi + 1, seed)
        out = out + amp * ((n00 * (1 - fx) + n10 * fx) * (1 - fy) + (n01 * (1 - fx) + n11 * fx) * fy)
    return out


def camera(angle_deg, radius=R_CAM, height=CAM_H):
    """Camera on the ring at an azimuth, looking at the subject. Returns (centre, rotation, rows = right, down, forward)."""
    a = np.radians(angle_deg)
    c = np.array([radius * np.sin(a), height, radius * np.cos(a)])
    fwd = TARGET - c
    fwd = fwd / np.linalg.norm(fwd)
    right = np.cross(np.array([0.0, 1.0, 0.0]), fwd)
    right = right / np.linalg.norm(right)
    down = np.cross(fwd, right)
    return c, np.stack([right, down, fwd])


def pixel_rays(rot):
    u, v = np.meshgrid(np.arange(W) + 0.5, np.arange(H) + 0.5)
    d = np.stack([(u - W / 2) / F, (v - H / 2) / F, np.ones_like(u)], -1)
    d = d @ rot  # camera -> world (rows of rot are the camera axes)
    return d / np.linalg.norm(d, axis=-1, keepdims=True)


def render(angle_deg, bystanders=(), noise=0.0, seed=0, tex=1):
    """Render colour (H,W,3) and metric depth along the optical axis (H,W) from a ring camera."""
    c, rot = camera(angle_deg)
    return render_pose(c, rot, bystanders, noise, seed, tex)


def stereo_pair(angle_deg, baseline, bystanders=(), noise=0.0, seed=0, tex=1):
    """Rectified pair: the ring camera (left) and a copy shifted `baseline` metres along its right axis.

    Returns (left colour, left depth, right colour, right depth). Parallel axes, so a point at depth z has
    disparity F * baseline / z pixels. `noise` is the sigma of independent Gaussian sensor noise per channel.
    """
    c, rot = camera(angle_deg)
    lc, lz = render_pose(c, rot, bystanders, noise, seed, tex)
    rc, rz = render_pose(c + baseline * rot[0], rot, bystanders, noise, seed + 1, tex)
    return lc, lz, rc, rz


def render_pose(c, rot, bystanders=(), noise=0.0, seed=0, tex=1):
    d = pixel_rays(rot)
    best = np.full((H, W), np.inf)
    col = np.tile(SKY, (H, W, 1))
    with np.errstate(divide="ignore", invalid="ignore"):
        t = -c[1] / d[..., 1]
    hit = (t > 0) & (t < 40)
    p = c + d * t[..., None]
    g = _tex(p[..., 0], p[..., 2], 1.3, tex)
    chk = (np.floor(p[..., 0] * 2) + np.floor(p[..., 2] * 2)) % 2
    gcol = np.stack([0.30 + 0.35 * g, 0.38 + 0.35 * g, 0.22 + 0.25 * g], -1) * (0.85 + 0.15 * chk[..., None])
    col[hit] = gcol[hit]
    best[hit] = t[hit]
    for k, (cx, cz, r, h) in enumerate((SUBJECT,) + tuple(bystanders)):
        ox, oz = c[0] - cx, c[2] - cz
        A = d[..., 0] ** 2 + d[..., 2] ** 2
        B = 2 * (ox * d[..., 0] + oz * d[..., 2])
        C = ox * ox + oz * oz - r * r
        disc = B * B - 4 * A * C
        with np.errstate(invalid="ignore", divide="ignore"):
            tt = (-B - np.sqrt(disc)) / (2 * A)
        y = c[1] + d[..., 1] * tt
        ok = (disc > 0) & (tt > 0) & (y >= 0) & (y <= h) & (tt < best)
        ang = np.arctan2(c[0] + d[..., 0] * tt - cx, c[2] + d[..., 2] * tt - cz)
        s = _tex(ang * r * 4, y, 3.0, 2 + k + 7 * (tex - 1))
        ccol = np.stack([0.75 * s + 0.2, 0.3 + 0.4 * (1 - s), 0.25 + 0.5 * s * (0.5 + 0.5 * np.sin(y * 9))], -1)
        col[ok] = ccol[ok]
        best[ok] = tt[ok]
    # depth along the optical axis, not the ray
    z = best * (d @ rot[2])
    z = np.where(np.isfinite(best), z, np.inf)
    if noise:
        col = col + noise * np.random.default_rng(seed).standard_normal(col.shape)
    return np.clip(col, 0, 1), z
