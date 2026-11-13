"""Milestone 6b: render a flat checkerboard through a known camera, and measure the
image statistics (grey levels, edge blur, noise) that the render should match.

Camera model as selfcal.py: fx = fy = f, principal point (cx, cy), radial 1 + k1 r^2 + k2 r^4.
Board as selfcal.board_points: inner corners at integer (x, y), x = 0..8, y = 0..5, so the
squares span x in [-1, 9], y in [-1, 6]; a white margin of `margin` squares surrounds them
and a uniform background lies beyond.
"""
import numpy as np
import cv2
from scipy.optimize import least_squares
from scipy.special import erf

from selfcal import PATTERN


def undistort_norm(xd, k1, k2, iters=30):
    """Invert xd = xn (1 + k1 r^2 + k2 r^4), r = |xn|, by fixed-point iteration. xd: (..., 2)."""
    xn = xd.copy()
    for _ in range(iters):
        r2 = (xn ** 2).sum(-1, keepdims=True)
        xn = xd / (1.0 + k1 * r2 + k2 * r2 ** 2)
    return xn


def board_intensity(xb, yb, levels, margin=0.5, xreach=1.0, pattern=PATTERN):
    """Reflectance-free shading of board coordinates: dark/bright squares, white margin, background.
    xreach: how far the end squares of each row reach past the first and last inner corner (1.0 =
    full squares; the real board's measure about 0.5, milestone 6b's outer.py)."""
    dark, bright, bg = levels
    nx, ny = pattern[0] + 1, pattern[1] + 1          # 10 x 7 squares
    x0, x1 = -xreach, nx - 2 + xreach
    inside = (xb >= x0) & (xb < x1) & (yb >= -1) & (yb < ny - 1)
    in_margin = (xb >= x0 - margin) & (xb < x1 + margin) & (yb >= -1 - margin) & (yb < ny - 1 + margin)
    par = (np.floor(xb).astype(np.int64) + np.floor(yb).astype(np.int64)) % 2
    out = np.full(xb.shape, float(bg))
    out[in_margin] = bright
    sq = np.where(par == 0, dark, bright)
    out[inside] = sq[inside]
    return out


def render_clean(intr, rvec, tvec, size, levels, margin=0.5, ss=4, xreach=1.0):
    """Area-sampled image (float, before blur and noise): each pixel is the mean of an ss x ss
    grid of rays. intr = (f, cx, cy, k1, k2)."""
    f, cx, cy, k1, k2 = intr
    w, h = size
    o = (np.arange(ss) + 0.5) / ss - 0.5
    u = (np.arange(w)[:, None] + o[None]).ravel()
    v = (np.arange(h)[:, None] + o[None]).ravel()
    U, V = np.meshgrid(u, v)                          # (h*ss, w*ss)
    xd = np.stack([(U - cx) / f, (V - cy) / f], -1)
    xn = undistort_norm(xd, k1, k2)
    R, _ = cv2.Rodrigues(np.asarray(rvec, float))
    H = np.column_stack([R[:, 0], R[:, 1], np.asarray(tvec, float).ravel()])
    ray = np.concatenate([xn, np.ones(xn.shape[:-1] + (1,))], -1)
    b = ray @ np.linalg.inv(H).T
    front = b[..., 2] > 0
    xb = b[..., 0] / b[..., 2]
    yb = b[..., 1] / b[..., 2]
    img = board_intensity(xb, yb, levels, margin, xreach)
    img[~front] = levels[2]
    return img.reshape(h, ss, w, ss).mean(axis=(1, 3))


def degrade(clean, blur, noise, rng, jpeg=90):
    """Gaussian blur (sigma px), additive Gaussian noise (sigma grey levels), 8-bit, JPEG."""
    img = cv2.GaussianBlur(clean, (0, 0), blur) if blur > 0 else clean.copy()
    if noise > 0:
        img = img + rng.normal(0.0, noise, img.shape)
    img = np.clip(np.round(img), 0, 255).astype(np.uint8)
    if jpeg:
        ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, int(jpeg)])
        img = cv2.imdecode(buf, cv2.IMREAD_GRAYSCALE)
    return img


# ---------------------------------------------------------------------------
# Image statistics, measured the same way on real images and on renders.

def _square_centres(corners, pattern=PATTERN):
    G = corners.reshape(pattern[1], pattern[0], 2)
    return ((G[:-1, :-1] + G[:-1, 1:] + G[1:, :-1] + G[1:, 1:]) / 4).reshape(-1, 2)


def grey_levels(img, corners, pattern=PATTERN):
    """Medians of the dark and bright inner squares (3x3 mean at each square's centre)."""
    vals = []
    for u, v in _square_centres(corners, pattern):
        i, j = int(round(v)), int(round(u))
        vals.append(float(img[i - 1:i + 2, j - 1:j + 2].mean()))
    vals = np.array(vals)
    thr = (vals.min() + vals.max()) / 2
    return float(np.median(vals[vals < thr])), float(np.median(vals[vals >= thr]))


def noise_sigma(img, corners, half=3, pattern=PATTERN):
    """Pixel noise sigma from a 3x3 Laplacian in 7x7 patches at inner-square centres.
    For i.i.d. noise of sigma s the 4-neighbour Laplacian has variance 20 s^2."""
    k = np.array([[0, 1, 0], [1, -4, 1], [0, 1, 0]], float)
    L = cv2.filter2D(img.astype(float), -1, k)
    vals = []
    for u, v in _square_centres(corners, pattern):
        i, j = int(round(v)), int(round(u))
        vals.append(L[i - half + 1:i + half, j - half + 1:j + half].ravel())
    return float(np.sqrt(np.mean(np.concatenate(vals) ** 2) / 20.0))


def edge_sigmas(img, corners, reach=6.0, pattern=PATTERN):
    """Gaussian blur sigma of each inner square edge: an erf fitted to the intensity profile
    across the midpoint of every segment between grid-adjacent inner corners."""
    G = corners.reshape(pattern[1], pattern[0], 2)
    segs = [(G[r, c], G[r, c + 1]) for r in range(pattern[1]) for c in range(pattern[0] - 1)]
    segs += [(G[r, c], G[r + 1, c]) for r in range(pattern[1] - 1) for c in range(pattern[0])]
    s = np.linspace(-reach, reach, 49)
    out = []
    im = img.astype(np.float32)
    for a, b in segs:
        m = (a + b) / 2
        t = (b - a) / np.linalg.norm(b - a)
        n = np.array([-t[1], t[0]])
        pts = (m[None] + s[:, None] * n[None]).astype(np.float32)
        prof = cv2.remap(im, pts[:, 0].reshape(1, -1), pts[:, 1].reshape(1, -1), cv2.INTER_LINEAR).ravel().astype(float)
        a0 = (prof[:5].mean() + prof[-5:].mean()) / 2
        b0 = (prof[-5:].mean() - prof[:5].mean()) / 2
        if abs(b0) < 20:
            continue

        def res(p):
            return p[0] + p[1] * erf((s - p[2]) / (np.sqrt(2) * abs(p[3]))) - prof
        try:
            sol = least_squares(res, [a0, b0, 0.0, 1.0])
        except Exception:
            continue
        if sol.success and abs(sol.x[2]) < 3:
            out.append(abs(sol.x[3]))
    return np.array(out)
