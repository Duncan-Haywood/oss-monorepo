"""A patch-PCA noise estimator with weak-texture selection, on a CFA mosaic (2026-11-17).

The in-frame estimators in ``tools/noise_estimator_accuracy.py`` all read a block's spread, so a scene whose
finest texture fills every block reads as noisy. This one follows Liu, Tanaka and Okutomi, "Single-image noise
level estimation for blind denoising" (IEEE TIP 22(12), 2013) and Chen, Zhu and Heng, "An efficient statistical
method for image noise level estimation" (ICCV 2015):

- patches are d x d samples of one same-colour subplane (every sensel at one CFA position in the period), so a
  patch holds one colour and no CFA structure;
- patches are grouped into brightness bins by their mean (the noise is signal-dependent, roughly constant in a
  bin);
- in each bin, a weak-texture set is chosen iteratively (Liu): a patch is kept when its gradient energy (sum of
  squared horizontal and vertical neighbour differences) is under what white noise of the current sigma
  would give at the 99th percentile, sigma is re-read from the kept set, until the set stops changing;
- sigma^2 is read from the kept set's covariance eigenvalues: structure (texture, gradients, edges) is
  concentrated in a few directions, white noise spreads evenly over all d^2, so the noise is in the small
  eigenvalues. Of the ascending eigenvalues, the longest prefix whose mean is no larger than its median (Chen:
  a noise-only set is about symmetric about its mean; a signal eigenvalue drags the mean up) gives sigma^2 as
  that prefix's mean.

Each bin gives (median level, sigma^2); a line variance = shot * level + read is fitted to them as
``_noise_model`` fits its bins.

The gradient threshold's constant (99th percentile of the Gamma that Liu fits to white noise's gradient
energy over its mean) depends only on d; it is computed here with a Wilson-Hilferty normal approximation of
the Gamma quantile, so the estimator needs numpy only.
"""

from __future__ import annotations

import math

import numpy as np


def _gamma_q99(shape: float) -> float:
    """99th percentile of Gamma(shape, scale=1/shape) (mean 1), Wilson-Hilferty."""

    z = 2.326347874
    k = shape
    return (1.0 - 1.0 / (9.0 * k) + z * math.sqrt(1.0 / (9.0 * k))) ** 3


def subplane_patches(c: np.ndarray, period: int, d: int = 4, stride: int = 2) -> np.ndarray:
    """Every d x d patch (step ``stride``) of every same-position subplane of the mosaic ``c``, as rows of
    d * d samples."""

    out = []
    for py in range(period):
        for px in range(period):
            s = np.ascontiguousarray(c[py::period, px::period])
            if s.shape[0] < d or s.shape[1] < d:
                continue
            v = np.lib.stride_tricks.sliding_window_view(s, (d, d))[::stride, ::stride]
            out.append(v.reshape(-1, d * d))
    return np.concatenate(out) if out else np.zeros((0, d * d))


def mosaic_patches(c: np.ndarray, period: int, d: int, max_patches: int = 200_000,
                   shifts: tuple = ((0, 0),)) -> np.ndarray:
    """Every d x d patch of the mosaic itself, stepped by the CFA period so every patch has the same colour
    layout: one vector holds all colours, and texture (correlated across colours) is lower-rank in it than
    noise (independent sensel to sensel). ``shifts``: further lattice offsets that map the CFA onto itself
    (X-Trans: (3, 3), ``XTRANS_SHIFTS``), each adding a grid of patches with the same layout."""

    h, w = c.shape
    if h < d or w < d:
        return np.zeros((0, d * d))
    n = ((h - d) // period + 1) * ((w - d) // period + 1) * len(shifts)
    step = period * max(1, math.ceil(math.sqrt(n / max_patches)))  # a whole frame: a regular subsample
    v = np.lib.stride_tricks.sliding_window_view(np.ascontiguousarray(c), (d, d))
    out = [v[dy::step, dx::step].reshape(-1, d * d) for dy, dx in shifts if dy < v.shape[0] and dx < v.shape[1]]
    return np.concatenate(out)


XTRANS_SHIFTS = ((0, 0), (3, 3))  # the X-Trans 6 x 6 layout repeats on a (3, 3) shift


def _grad_matrix(d: int, step: int = 1) -> np.ndarray:
    """The rows are every horizontal and vertical difference of samples ``step`` apart in a d x d patch
    (row-major); ``step`` = the CFA period compares same-colour sensels of a mosaic patch."""

    rows = []
    for y in range(d):
        for x in range(d):
            i = y * d + x
            if x + step < d:
                r = np.zeros(d * d)
                r[i], r[i + step] = -1.0, 1.0
                rows.append(r)
            if y + step < d:
                r = np.zeros(d * d)
                r[i], r[i + step * d] = -1.0, 1.0
                rows.append(r)
    return np.asarray(rows)


def eig_sigma2(p: np.ndarray) -> float:
    """sigma^2 from a patch set's covariance eigenvalues: the mean of the longest ascending prefix whose mean is
    no larger than its median (Chen et al. 2015)."""

    if p.shape[0] < p.shape[1] + 2:
        return float("nan")
    lam = np.clip(np.linalg.eigvalsh(np.cov(p, rowvar=False)), 0.0, None)
    for m in range(lam.size, 0, -1):
        head = lam[:m]
        if head.mean() <= np.median(head):
            return float(head.mean())
    return float(lam[0])


def _colour_residual_matrix(pat, d: int) -> tuple[np.ndarray, float]:
    """For a d x d mosaic patch whose top-left sensel is at the CFA's origin: the projection that takes each
    sensel's difference from its colour's mean in the patch. Where the period is the patch size (X-Trans,
    d = 6) no two same-colour sensels sit a whole period apart, so this stands in for the gradient."""

    period = 6 if len(pat) == 36 else 2
    col = np.array([pat[(y % period) * period + (x % period)] for y in range(d) for x in range(d)])
    m = np.zeros((d * d, d * d))
    for k in np.unique(col):
        idx = np.flatnonzero(col == k)
        m[np.ix_(idx, idx)] = 1.0 / idx.size
    return np.eye(d * d) - m, float(d * d - np.unique(col).size)


def _near_matrix(pat, d: int) -> np.ndarray:
    """The rows are the differences of every pair of same-colour sensels that touch (horizontally, vertically
    or diagonally) in a d x d mosaic patch whose top-left sensel is at the CFA's origin. On X-Trans, where a
    colour's next copy one period away is 6 sensels off, these are the finest-scale texture readings the
    layout has: 20 of every 36 sensels are green and every green touches another, so the test sees texture
    at one sensel, not at six (eval/xtrans-noise-pca-12-2026-11-17.md)."""

    period = 6 if len(pat) == 36 else 2
    col = [pat[(y % period) * period + (x % period)] for y in range(d) for x in range(d)]
    rows = []
    for y in range(d):
        for x in range(d):
            for dy, dx in ((0, 1), (1, -1), (1, 0), (1, 1)):
                yy, xx = y + dy, x + dx
                if 0 <= yy < d and 0 <= xx < d and col[y * d + x] == col[yy * d + xx]:
                    r = np.zeros(d * d)
                    r[y * d + x], r[yy * d + xx] = -1.0, 1.0
                    rows.append(r)
    return np.asarray(rows)


def weak_texture_sigma2(p: np.ndarray, d: int, iters: int = 6, step: int = 1, D: np.ndarray | None = None,
                        dof: float | None = None) -> tuple[float, int]:
    """Liu et al.'s iteration on one bin's patches: (sigma^2, patches kept). ``D`` (rows: linear maps whose
    squares sum to the patch's texture energy) defaults to the step-``step`` gradients; ``dof`` (the Gamma's
    degrees of freedom) defaults to its row count."""

    if D is None:
        D = _grad_matrix(d, step)
    g = ((p @ D.T) ** 2).sum(axis=1)  # gradient energy per patch
    tr = float((D * D).sum())  # white noise of variance s2 gives mean s2 * tr
    q = _gamma_q99((D.shape[0] if dof is None else dof) / 2.0)
    s2 = eig_sigma2(p)
    keep = np.ones(p.shape[0], dtype=bool)
    for _ in range(iters):
        if not s2 == s2:
            break
        new = g < s2 * tr * q
        if new.sum() < p.shape[1] + 2:
            break
        if np.array_equal(new, keep):
            break
        keep = new
        s2 = eig_sigma2(p[keep])
    return s2, int(keep.sum())


def pca_bins(c: np.ndarray, period: int, d: int = 4, stride: int = 2, bins: int = 8,
             mosaic: bool = False, pat=None, texture: str | None = None,
             shifts: tuple = ((0, 0),)) -> tuple[np.ndarray, np.ndarray]:
    """Per brightness bin of the mosaic's patches: (median level, sigma^2). ``mosaic``: d x d patches of the
    mosaic (``mosaic_patches``) instead of a subplane's. ``texture`` (mosaic only): "grad" (same-colour
    differences one period apart), "colour" (each sensel against its colour's mean in the patch) or "near"
    (differences of touching same-colour sensels, ``_near_matrix``); by default "near" on X-Trans
    (eval/xtrans-noise-pca-12-2026-11-17.md: 0 of 248 held tiles lose over 0.1 dB to directional, was 17),
    "grad" on Bayer."""

    c = np.asarray(c, dtype=np.float64)
    p = mosaic_patches(c, period, d, shifts=shifts) if mosaic else subplane_patches(c, period, d, stride)
    step = period if mosaic else 1
    D = dof = None
    tex = texture or ("near" if mosaic and period == 6 else "colour" if step >= d else "grad")
    if mosaic and tex == "colour":
        D, dof = _colour_residual_matrix(pat, d)
    elif mosaic and tex == "near":
        D = _near_matrix(pat, d)
    if p.shape[0] == 0:
        return np.zeros(0), np.zeros(0)
    lv = p.mean(axis=1)
    # a small frame: fewer bins, so each keeps at least 4 x d^2 patches (a 480 x 480 tile keeps all eight)
    bins = max(1, min(bins, p.shape[0] // (4 * d * d)))
    edges = np.quantile(lv, np.linspace(0, 1, bins + 1))
    xs, ys = [], []
    for i in range(bins):
        sel = (lv >= edges[i]) & (lv <= edges[i + 1])
        if sel.sum() < d * d + 2:
            continue
        s2, _ = weak_texture_sigma2(p[sel], d, step=step, D=D, dof=dof)
        if s2 == s2:
            xs.append(float(np.median(lv[sel])))
            ys.append(s2)
    return np.asarray(xs), np.asarray(ys)


def fit_line(x: np.ndarray, y: np.ndarray) -> tuple[float, float]:
    """variance = shot * level + read through the bins, with ``_noise_model``'s fallbacks."""

    if x.size == 0:
        return 0.0, 0.0
    if x.size < 2 or np.ptp(x) == 0:
        return 0.0, float(np.mean(y))
    g, r = np.polyfit(x, y, 1)
    if r < 0:
        g, r = max(0.0, float(x @ y / (x @ x))), 0.0
    if g < 0:
        g, r = 0.0, float(np.mean(y))
    return float(g), float(r)


def estimate_noise_pca(c: np.ndarray, pat, d: int = 6, stride: int = 2, mosaic: bool = True,
                       texture: str | None = None, shifts: tuple = ((0, 0),)) -> tuple[float, float]:
    """The (shot, read) model of the mosaic ``c`` from patch PCA on weak-texture patches. The default, 6 x 6
    patches of the mosaic itself, read closest to the truth on the tune tiles
    (eval/noise-pca-estimator-2026-11-17.md; tools/noise_estimator_accuracy.py); on X-Trans with the "near"
    texture test (touching same-colour sensels; eval/xtrans-noise-pca-12-2026-11-17.md)."""

    period = 6 if len(pat) == 36 else 2
    return fit_line(*pca_bins(c, period, d, stride, mosaic=mosaic, pat=pat, texture=texture,
                             shifts=shifts))
