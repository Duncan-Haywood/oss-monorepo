"""Numeric core for night-sky work: find stars, align frames on them, stack.

Everything here is deterministic numpy/scipy on linear float32 RGB arrays (H, W, 3) in 0..1;
the judgment calls (which mode, which frames, where the horizon is, how to grade) live in
`igmp.astro`, which calls these.

Stars (`find_stars`)
--------------------
Background is a median of a 1/8-scale copy, smoothed and scaled back up, so the Milky Way's
broad glow and a sky gradient are both background. On the residual, a star is a local maximum
above k x the robust noise (1.4826 x MAD) that is compact: its 5x5 neighbourhood holds most of
its flux, which rejects the edges of lit foreground and noise ridges. Centroids are flux
weighted over 3x3. Returns (N, 3) = x, y, flux, brightest first.

Alignment (`estimate_transform`)
--------------------------------
The sky turns about the celestial pole, so between two frames the stars move by a rotation
plus a translation (a similarity with scale ~1). Matching uses triangles of the brightest
stars, each with its two nearest neighbours, described by side ratios that do not change under
a similarity; candidate pairs vote, and RANSAC over the voted pairs fits the transform with
least squares on its inliers. This is the astroalign idea, kept small enough to need only scipy.

Stacking
--------
* `sigma_clip_mean` - per pixel, frames more than `kappa` robust sigmas from the median are
  dropped (satellites, planes, hot pixels that wander once aligned) and the rest averaged:
  noise falls by about sqrt(N).
* `lighten` - per-pixel maximum: star trails.
* `trail_frames` - running maximum with decay, one output frame per input: a timelapse whose
  stars leave comet tails.
"""
from __future__ import annotations

import math
from collections.abc import Iterable, Sequence

import numpy as np
from scipy import ndimage
from scipy.spatial import cKDTree

MAX_STARS = 400
TRIANGLE_STARS = 40          # brightest stars used to build matching triangles
RANSAC_ITERS = 300
RANSAC_TOL_PX = 3.0
MIN_INLIERS = 6


def luminance(rgb: np.ndarray) -> np.ndarray:
    return (rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722).astype(np.float32)


def background(gray: np.ndarray, scale: int = 8, size: int = 9, mask: np.ndarray | None = None) -> np.ndarray:
    """Smooth sky background (gradient, airglow, Milky Way glow) at full size.

    With `mask` (True = sky) the model is built from sky pixels only and carried flat across the
    land: otherwise a bright foreground (a moonlit rock, a lit tent) bleeds into the sky beside
    it, and subtracting that model leaves a halo of the opposite colour along the skyline.
    """
    h, w = gray.shape
    hh, ww = h - h % scale, w - w % scale

    def blocks(x):
        return x[:hh, :ww].reshape(hh // scale, scale, ww // scale, scale)

    if mask is not None and mask.any() and not mask.all():
        m = blocks(mask.astype(np.float32))
        cover = m.mean(axis=(1, 3))
        small = (blocks(gray) * m).sum(axis=(1, 3)) / np.maximum(m.sum(axis=(1, 3)), 1)
        holes = cover < 0.5
        if holes.all():
            small = np.full(cover.shape, float(np.median(gray[mask])), np.float32)
        elif holes.any():   # nearest sky value: the model continues flat beneath the horizon
            idx = ndimage.distance_transform_edt(holes, return_distances=False, return_indices=True)
            small = small[tuple(idx)]
    else:
        small = blocks(gray).mean(axis=(1, 3))
    small = ndimage.median_filter(small, size=size, mode="nearest")
    small = ndimage.gaussian_filter(small, 1.5)
    zoom = (h / small.shape[0], w / small.shape[1])
    return ndimage.zoom(small, zoom, order=1, mode="nearest")[:h, :w].astype(np.float32)


def robust_sigma(x: np.ndarray) -> float:
    med = float(np.median(x))
    return float(1.4826 * np.median(np.abs(x - med))) or 1e-6


def find_stars(gray: np.ndarray, k: float = 5.0, max_stars: int = MAX_STARS,
               mask: np.ndarray | None = None) -> np.ndarray:
    """Point sources in a 2-D luminance image -> (N, 3) x, y, flux, brightest first.

    `mask` (True = sky) limits the search, so lit buildings and the horizon do not count.
    """
    res = gray - background(gray)
    sample = res[mask] if mask is not None and mask.any() else res
    sig = robust_sigma(sample[:: max(1, sample.size // 200_000)] if sample.ndim == 1 else sample.ravel()[:: max(1, sample.size // 200_000)])
    peaks = (res == ndimage.maximum_filter(res, size=5)) & (res > k * sig)
    if mask is not None:
        peaks &= mask
    ys, xs = np.nonzero(peaks)
    if not len(xs):
        return np.zeros((0, 3), np.float32)
    h, w = gray.shape
    keep = (xs >= 3) & (ys >= 3) & (xs < w - 3) & (ys < h - 3)
    xs, ys = xs[keep], ys[keep]
    out = []
    for x, y in zip(xs, ys):
        core = np.clip(res[y - 1:y + 2, x - 1:x + 2], 0, None)
        ring = np.clip(res[y - 3:y + 4, x - 3:x + 4], 0, None)
        flux = float(core.sum())
        if flux <= 0 or ring.sum() > 3.0 * flux:     # extended: an edge or glow, not a star
            continue
        oy, ox = np.mgrid[-1:2, -1:2]
        out.append((x + float((core * ox).sum()) / flux, y + float((core * oy).sum()) / flux, flux))
    if not out:
        return np.zeros((0, 3), np.float32)
    arr = np.array(out, np.float32)
    return arr[np.argsort(-arr[:, 2])][:max_stars]


# --- alignment ---------------------------------------------------------------------------
def _triangles(pts: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Each star with its 2 nearest neighbours -> (index triples, invariants)."""
    if len(pts) < 3:
        return np.zeros((0, 3), int), np.zeros((0, 2))
    tree = cKDTree(pts)
    k = min(5, len(pts))
    _, nn = tree.query(pts, k=k)
    tris, inv = set(), []
    for i in range(len(pts)):
        cands = nn[i][1:]
        for a in range(len(cands)):
            for b in range(a + 1, len(cands)):
                tris.add(tuple(sorted((i, int(cands[a]), int(cands[b])))))
    tris = np.array(sorted(tris), int)
    for t in tris:
        p = pts[t]
        sides = sorted([np.linalg.norm(p[0] - p[1]), np.linalg.norm(p[1] - p[2]), np.linalg.norm(p[0] - p[2])])
        inv.append((sides[2] / max(sides[1], 1e-6), sides[1] / max(sides[0], 1e-6)))
    return tris, np.array(inv)


def _fit_similarity(src: np.ndarray, dst: np.ndarray) -> np.ndarray:
    """Least-squares 2x3 similarity (Umeyama) mapping src -> dst."""
    ms, md = src.mean(0), dst.mean(0)
    s, d = src - ms, dst - md
    cov = d.T @ s / len(src)
    u, sv, vt = np.linalg.svd(cov)
    sign = np.sign(np.linalg.det(u @ vt)) or 1.0
    r = u @ np.diag([1.0, sign]) @ vt
    var = (s ** 2).sum() / len(src)
    scale = (sv * [1.0, sign]).sum() / var if var else 1.0
    t = md - scale * r @ ms
    return np.hstack([scale * r, t[:, None]])


def apply(m: np.ndarray, pts: np.ndarray) -> np.ndarray:
    return pts @ m[:, :2].T + m[:, 2]


def estimate_transform(ref: np.ndarray, cur: np.ndarray, seed: int = 0) -> tuple[np.ndarray, int] | None:
    """2x3 similarity mapping `cur` star positions onto `ref` ones, and its inlier count.

    None when there are too few stars or no consistent match (clouds, a different scene).
    """
    a, b = ref[:TRIANGLE_STARS, :2], cur[:TRIANGLE_STARS, :2]
    if len(a) < 4 or len(b) < 4:
        return None
    ta, ia = _triangles(a)
    tb, ib = _triangles(b)
    if not len(ta) or not len(tb):
        return None
    tree = cKDTree(ia)
    votes: dict[tuple[int, int], int] = {}
    for j, inv in enumerate(ib):
        for i in tree.query_ball_point(inv, r=0.03):
            # triangle vertices sorted by index are not in corresponding order; order by the
            # opposite side length so corresponding vertices line up
            for p, q in zip(_vertex_order(a[ta[i]]), _vertex_order(b[tb[j]])):
                key = (int(ta[i][p]), int(tb[j][q]))
                votes[key] = votes.get(key, 0) + 1
    if len(votes) < 3:
        return None
    pairs = np.array(sorted(votes, key=lambda k: -votes[k])[: 4 * TRIANGLE_STARS])
    src, dst = b[pairs[:, 1]], a[pairs[:, 0]]
    rng = np.random.default_rng(seed)
    best, best_in = None, np.zeros(len(pairs), bool)
    for _ in range(RANSAC_ITERS):
        pick = rng.choice(len(pairs), 2, replace=False)
        if np.linalg.norm(src[pick[0]] - src[pick[1]]) < 5:
            continue
        m = _fit_similarity(src[pick], dst[pick])
        if not 0.95 < math.hypot(m[0, 0], m[1, 0]) < 1.05:
            continue
        inl = np.linalg.norm(apply(m, src) - dst, axis=1) < RANSAC_TOL_PX
        if inl.sum() > best_in.sum():
            best, best_in = m, inl
    if best is None or best_in.sum() < MIN_INLIERS:
        return None
    m = _fit_similarity(src[best_in], dst[best_in])
    return m, int(best_in.sum())


def _vertex_order(p: np.ndarray) -> list[int]:
    """Vertex indices ordered by the length of the side opposite each."""
    opp = [np.linalg.norm(p[1] - p[2]), np.linalg.norm(p[0] - p[2]), np.linalg.norm(p[0] - p[1])]
    return list(np.argsort(opp))


def warp(img: np.ndarray, m: np.ndarray) -> np.ndarray:
    """Resample `img` (H, W[, C]) so that pixel p lands where `m` maps it (bilinear)."""
    full = np.vstack([m, [0, 0, 1]])
    inv = np.linalg.inv(full)
    # ndimage works in (row, col); swap x/y
    mat = inv[:2, :2][::-1, ::-1]
    off = inv[:2, 2][::-1]
    if img.ndim == 2:
        return ndimage.affine_transform(img, mat, offset=off, order=1, mode="constant", cval=0.0)
    return np.stack([ndimage.affine_transform(img[..., c], mat, offset=off, order=1, mode="constant", cval=0.0)
                     for c in range(img.shape[2])], axis=-1)


def drift_px_per_min(m: np.ndarray, dt_s: float, size: tuple[int, int]) -> float:
    """How far the frame corners move per minute under `m`: the star motion a single exposure
    or an unaligned stack would smear."""
    h, w = size
    corners = np.array([[0, 0], [w, 0], [0, h], [w, h]], float)
    move = np.linalg.norm(apply(m, corners) - corners, axis=1).max()
    return float(move / max(dt_s / 60.0, 1e-6))


# --- stacking ----------------------------------------------------------------------------
def sigma_clip_mean(frames: Sequence[np.ndarray], kappa: float = 2.5,
                    weights: Sequence[np.ndarray] | None = None) -> np.ndarray:
    """Per-pixel mean after rejecting values more than kappa robust sigmas from the median.

    `weights` are per-frame coverage masks (0 where a warp left no data), so frame edges that
    rotated out of view do not darken the stack.
    """
    cube = np.stack(frames).astype(np.float32)
    w = np.ones(cube.shape[:-1] if cube.ndim == 4 else cube.shape, np.float32) if weights is None \
        else np.stack(weights).astype(np.float32)
    if cube.ndim == 4:
        w = w[..., None] * np.ones_like(cube[:1])
    masked = np.where(w > 0.5, cube, np.nan)
    med = np.nanmedian(masked, axis=0)
    mad = np.nanmedian(np.abs(masked - med), axis=0) * 1.4826 + 1e-6
    keep = (np.abs(masked - med) <= kappa * mad) & (w > 0.5)
    num = np.where(keep, cube, 0).sum(0)
    den = keep.sum(0)
    return np.where(den > 0, num / np.maximum(den, 1), med if not np.isnan(med).all() else 0).astype(np.float32)


def star_signal(frame: np.ndarray, mask: np.ndarray | None = None, k: float = 2.5) -> tuple[np.ndarray, np.ndarray]:
    """(background, stars) of one linear RGB frame: the per-channel sky model and what stands
    above it by more than k x the noise. Trails are the running maximum of the second, so the
    maximum of the noise - which grows with every frame and lifts a whole sky - never enters."""
    bg = np.stack([background(frame[..., c], mask=mask) for c in range(frame.shape[2])], axis=-1)
    res = frame - bg
    lum = luminance(res)
    sample = lum[mask] if mask is not None and mask.any() else lum.ravel()
    sig = robust_sigma(sample[:: max(1, sample.size // 200_000)])
    return bg, np.where((lum > k * sig)[..., None], np.clip(res, 0, None), 0).astype(np.float32)


def lighten(frames: Iterable[np.ndarray]) -> np.ndarray:
    out = None
    for f in frames:
        out = f.copy() if out is None else np.maximum(out, f)
    if out is None:
        raise ValueError("no frames")
    return out


def trail_frames(frames: Iterable[np.ndarray], decay: float = 0.97) -> Iterable[np.ndarray]:
    """Running max with exponential fade: decay=1 keeps whole trails, 0.9 short comet tails."""
    acc = None
    for f in frames:
        acc = f.copy() if acc is None else np.maximum(acc * decay, f)
        yield acc


def horizon_mask(horizon: Sequence[Sequence[float]] | None, size: tuple[int, int]) -> np.ndarray:
    """True above a horizon polyline given in normalised (x, y) points, left to right.

    None or [] -> the whole frame is sky.
    """
    h, w = size
    if not horizon:
        return np.ones((h, w), bool)
    pts = sorted((float(x), float(y)) for x, y in horizon)
    if pts[0][0] > 0:
        pts.insert(0, (0.0, pts[0][1]))
    if pts[-1][0] < 1:
        pts.append((1.0, pts[-1][1]))
    xs = np.linspace(0, 1, w)
    ys = np.interp(xs, [p[0] for p in pts], [p[1] for p in pts]) * h
    return np.arange(h)[:, None] < ys[None, :]


def feather(mask: np.ndarray, px: float) -> np.ndarray:
    return ndimage.gaussian_filter(mask.astype(np.float32), px) if px > 0 else mask.astype(np.float32)
