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


def _cov_ref(p: np.ndarray, idx: np.ndarray) -> np.ndarray:
    """The covariance of rows ``idx`` of ``p`` in a fixed order (2026-11-19): each column's mean is numpy's
    pairwise sum over the rows (``np.add.reduce`` along a contiguous axis) over the count, each entry the
    pairwise sum of the centred products over count - 1. ``np.cov`` hands the products to BLAS, whose order
    (and so the last bits) moves with the library and its threads; this does not, and
    ``noise_native.patch_cov`` gives the same bits in C."""

    x = np.ascontiguousarray(p[idx].T, dtype=np.float64)
    m = x.shape[1]
    xc = x - (np.add.reduce(x, axis=1) / m)[:, None]
    dd = x.shape[0]
    cov = np.empty((dd, dd))
    for j in range(dd):
        s = np.add.reduce(xc[j:] * xc[j], axis=1) / (m - 1)
        cov[j, j:] = s
        cov[j:, j] = s
    return cov


def _cov(p: np.ndarray, idx: np.ndarray) -> np.ndarray:
    from shootflow import noise_native

    out = noise_native.patch_cov(p, idx)
    return _cov_ref(p, idx) if out is None else out


EIG_READS = ("chen", "mp", "mpc", "mpcw", "mpcws", "mpcw1")
# reads that also choose the weak-texture patch set (the others read only the set Chen's iteration keeps)
SELECT_WITH = ("mpcws",)
# reads that reselect once: Chen's iteration picks the set, the whitened read of it sets one more threshold
# over the bin's patches, and the whitened read of that set is the answer (eval/noise-pca-mpcw1-2026-11-22.md:
# ``mpcws`` without its feedback, a high read loosening its own threshold)
RESELECT_ONCE = ("mpcw1",)
# reads whose level is Chen's on the colour-whitened covariance
_WHITENED = ("mpc", "mpcw", "mpcws", "mpcw1")


def _mp_floor(n: int, dim: int) -> float:
    """Where white noise's smallest sample-covariance eigenvalue sits, as a fraction of its variance: the lower
    Marchenko-Pastur edge (1 - sqrt(dim / n))^2 for n patches of ``dim`` samples."""

    return (1.0 - math.sqrt(dim / n)) ** 2


def _eig_sigma2_idx(p: np.ndarray, idx: np.ndarray, eig: str = "chen", cols=None) -> float:
    """sigma^2 of the patches ``idx`` of ``p`` from their covariance's eigenvalues.

    ``eig="chen"`` (the default since 2026-11-17): the mean of the longest ascending prefix whose mean is no
    larger than its median. ``"mp"`` (2026-11-19, eval/noise-pca-min-eigen-2026-11-19.md): the smallest
    eigenvalue over the Marchenko-Pastur floor ``_mp_floor``, so white noise reads its variance while texture
    that fills most directions but not the quietest one drops out. ``"mpc"``: ``"mp"`` on each colour's own
    columns (``cols``: one index array per colour present), the colours' readings averaged by their share of
    the patch, so noise whose variance differs by colour (white balance) is read as the mixed mean, as
    ``"chen"`` reads it, instead of as its quietest colour. ``"mpcw"`` (2026-11-21): the colours' *ratios* from
    those reads and the *level* from ``"chen"`` on the colour-whitened covariance (``_colour_whitening``);
    ``"mpcws"`` and ``"mpcw1"`` read the same way and differ only in the patch set (``_weak_texture_idx``). Below
    4 x dim patches the floor is too loose to trust and ``"chen"`` is used."""

    if idx.size < p.shape[1] + 2:
        return float("nan")
    cov = _cov(p, idx)
    n, dim = int(idx.size), p.shape[1]
    if eig == "mp" and n >= 4 * dim:
        return float(max(np.linalg.eigvalsh(cov)[0], 0.0) / _mp_floor(n, dim))
    if eig in _WHITENED and cols is not None and n >= 4 * dim:
        v = [max(float(np.linalg.eigvalsh(cov[np.ix_(ik, ik)])[0]), 0.0) / _mp_floor(n, ik.size) for ik in cols]
        if eig == "mpc":
            return float(sum(ik.size / dim * vk for ik, vk in zip(cols, v)))
        w = _colour_whitening(v, cols, dim)
        if w is not None:  # Chen's level on the colour-whitened covariance (each colour's noise scaled to 1 ratio)
            return _chen(np.linalg.eigvalsh(cov * np.outer(w, w)))
    return _chen(np.linalg.eigvalsh(cov))


def _chen(lam: np.ndarray) -> float:
    """Chen et al. 2015: the mean of the longest ascending prefix of ``lam`` whose mean is no larger than its median."""

    lam = np.clip(lam, 0.0, None)
    for m in range(lam.size, 0, -1):
        head = lam[:m]
        if head.mean() <= np.median(head):
            return float(head.mean())
    return float(lam[0])


def _colour_whitening(v, cols, dim: int) -> np.ndarray | None:
    """``"mpcw"``'s column scales (eval/noise-pca-whitened-level-2026-11-21.md): each colour's noise *ratio*
    r_k = v_k / mean(v) from the per-colour Marchenko-Pastur reads ``v`` (the mean over colours, equal weight,
    as ``carries`` puts white-balanced noise into one model), and 1 / sqrt(r_k) on that colour's columns. Chen's
    read of the scaled covariance is then the colours' mean variance, while the *level* keeps Chen's prefix (so
    texture that fills the quietest direction is not amplified by the Marchenko-Pastur division). None when a
    colour reads 0 (``"chen"`` is used)."""

    m = sum(v) / len(v)
    if m <= 0 or min(v) <= 0:
        return None
    w = np.empty(dim)
    for ik, vk in zip(cols, v):
        w[ik] = math.sqrt(m / vk)
    return w


def eig_sigma2(p: np.ndarray) -> float:
    """sigma^2 from a patch set's covariance eigenvalues: the mean of the longest ascending prefix whose mean is
    no larger than its median (Chen et al. 2015). The covariance is ``_cov_ref``'s fixed order."""

    p = np.ascontiguousarray(p, dtype=np.float64)
    return _eig_sigma2_idx(p, np.arange(p.shape[0]))


def _csr(D: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """D's nonzero entries row by row, columns ascending: (rowptr, cols, coef)."""

    rowptr, cols, coef = [0], [], []
    for row in D:
        nz = np.flatnonzero(row)
        cols.extend(nz.tolist())
        coef.extend(row[nz].tolist())
        rowptr.append(len(cols))
    return np.asarray(rowptr, dtype=np.intc), np.asarray(cols, dtype=np.intc), np.asarray(coef, dtype=np.float64)


def _energy_ref(p: np.ndarray, rowptr, cols, coef) -> np.ndarray:
    """Each patch's texture energy, the sum over D's rows of the squared row product, in a fixed order: per
    row, t = 0 then t + coef * x over the nonzero columns ascending; g = 0 then g + t * t row by row
    (``noise_native.patch_energy`` in C, the same bits; ``p @ D.T`` was BLAS's order)."""

    g = np.zeros(p.shape[0])
    for r in range(len(rowptr) - 1):
        t = np.zeros(p.shape[0])
        for k in range(rowptr[r], rowptr[r + 1]):
            t = t + coef[k] * p[:, cols[k]]
        g = g + t * t
    return g


def _energy(p: np.ndarray, D: np.ndarray) -> np.ndarray:
    from shootflow import noise_native

    csr = _csr(D)
    g = noise_native.patch_energy(p, *csr)
    return _energy_ref(p, *csr) if g is None else g


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


def _texture_params(d: int, step: int, D: np.ndarray | None, dof: float | None):
    if D is None:
        D = _grad_matrix(d, step)
    tr = float((D * D).sum())  # white noise of variance s2 gives mean s2 * tr
    q = _gamma_q99((D.shape[0] if dof is None else dof) / 2.0)
    return D, tr, q


def _weak_texture_idx(p: np.ndarray, idx: np.ndarray, g: np.ndarray, tr: float, q: float,
                      iters: int = 6, eig: str = "chen", cols=None) -> tuple[float, int]:
    """Liu's iteration on the patches ``idx`` of ``p`` (``g``: every patch's texture energy). The patch set is
    chosen with ``"chen"``'s reading whatever ``eig`` is; ``eig`` reads sigma^2 from the final set."""

    gi = g[idx]
    sel = eig if eig in SELECT_WITH else "chen"
    s2 = _eig_sigma2_idx(p, idx, sel, cols)
    keep = idx
    for _ in range(iters):
        if not s2 == s2:
            break
        new = idx[gi < s2 * tr * q]
        if new.size < p.shape[1] + 2:
            break
        if np.array_equal(new, keep):
            break
        keep = new
        s2 = _eig_sigma2_idx(p, keep, sel, cols)
    if eig != "chen" and s2 == s2:
        s2 = _eig_sigma2_idx(p, keep, eig, cols)
    if eig in RESELECT_ONCE and s2 == s2:  # one pass at the whitened level, never iterated on its own read
        new = idx[gi < s2 * tr * q]
        if new.size >= p.shape[1] + 2:
            keep = new
            s2 = _eig_sigma2_idx(p, keep, eig, cols)
    return s2, int(keep.size)


def weak_texture_sigma2(p: np.ndarray, d: int, iters: int = 6, step: int = 1, D: np.ndarray | None = None,
                        dof: float | None = None) -> tuple[float, int]:
    """Liu et al.'s iteration on one bin's patches: (sigma^2, patches kept). ``D`` (rows: linear maps whose
    squares sum to the patch's texture energy) defaults to the step-``step`` gradients; ``dof`` (the Gamma's
    degrees of freedom) defaults to its row count."""

    p = np.ascontiguousarray(p, dtype=np.float64)
    D, tr, q = _texture_params(d, step, D, dof)
    return _weak_texture_idx(p, np.arange(p.shape[0]), _energy(p, D), tr, q, iters)


def pca_bins(c: np.ndarray, period: int, d: int = 4, stride: int = 2, bins: int = 8,
             mosaic: bool = False, pat=None, texture: str | None = None,
             shifts: tuple = ((0, 0),), info: dict | None = None, eig: str = "chen") -> tuple[np.ndarray, np.ndarray]:
    """Per brightness bin of the mosaic's patches: (median level, sigma^2). ``mosaic``: d x d patches of the
    mosaic (``mosaic_patches``) instead of a subplane's. ``texture`` (mosaic only): "grad" (same-colour
    differences one period apart), "colour" (each sensel against its colour's mean in the patch) or "near"
    (differences of touching same-colour sensels, ``_near_matrix``); by default "near" on X-Trans
    (eval/xtrans-noise-pca-12-2026-11-17.md: 0 of 248 held tiles lose over 0.1 dB to directional, was 17),
    "grad" on Bayer. ``info``, when given, receives "kept" and "patches": how many binned patches the
    weak-texture test kept, of how many (a frame whose spread is mostly noise keeps nearly all)."""

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
    p = np.ascontiguousarray(p, dtype=np.float64)
    D, tr, q = _texture_params(d, step, D, dof)
    g = _energy(p, D)  # once for every patch: a patch's energy does not depend on its bin
    cols = None
    if eig not in EIG_READS:
        raise ValueError(f"unknown eig {eig!r} ({', '.join(EIG_READS)})")
    if eig in _WHITENED and mosaic and pat is not None:  # every mosaic patch starts on the CFA's origin
        col = np.array([pat[(y % period) * period + (x % period)] for y in range(d) for x in range(d)])
        cols = [np.flatnonzero(col == k) for k in np.unique(col)]
    res: list = [None] * bins

    def run(i0, i1):  # one bin per call; bins are independent, so the thread count changes no bit
        for i in range(i0, i1):
            sel = (lv >= edges[i]) & (lv <= edges[i + 1])
            idx = np.flatnonzero(sel)
            if idx.size < d * d + 2:
                continue
            s2, k = _weak_texture_idx(p, idx, g, tr, q, eig=eig, cols=cols)
            res[i] = (s2, k, idx.size, float(np.median(lv[sel])))

    from shootflow.raw_develop_np import _run_bands

    _run_bands(run, bins, band=1)
    xs, ys = [], []
    kept = total = 0
    for r in res:
        if r is None:
            continue
        s2, k, n, med = r
        kept, total = kept + k, total + n
        if s2 == s2:
            xs.append(med)
            ys.append(s2)
    if info is not None:
        info["kept"], info["patches"] = kept, total
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
                       texture: str | None = None, shifts: tuple = ((0, 0),),
                       info: dict | None = None, eig: str = "chen") -> tuple[float, float]:
    """The (shot, read) model of the mosaic ``c`` from patch PCA on weak-texture patches. The default, 6 x 6
    patches of the mosaic itself, read closest to the truth on the tune tiles
    (eval/noise-pca-estimator-2026-11-17.md; tools/noise_estimator_accuracy.py); on X-Trans with the "near"
    texture test (touching same-colour sensels; eval/xtrans-noise-pca-12-2026-11-17.md). ``info``: as ``pca_bins``."""

    period = 6 if len(pat) == 36 else 2
    return fit_line(*pca_bins(c, period, d, stride, mosaic=mosaic, pat=pat, texture=texture,
                             shifts=shifts, info=info, eig=eig))


def bin_mosaic(c: np.ndarray, period: int) -> np.ndarray:
    """The mosaic at half size, each sensel the mean of four same-colour sensels one CFA period apart (offsets
    0 and ``period`` in each direction), so the colour layout is unchanged. Independent noise loses half its
    sigma; a scene's coarser texture keeps its amplitude."""

    c = np.asarray(c, dtype=np.float64)
    k = 2 * period
    h, w = (c.shape[0] // k) * k, (c.shape[1] // k) * k
    t = c[:h, :w].reshape(h // k, 2, period, w // k, 2, period).mean(axis=(1, 4))
    return t.reshape(h // 2, w // 2)


def sigma18(model: tuple[float, float]) -> float:
    return math.sqrt(max(model[0] * 0.18 + model[1], 0.0))


def whiteness(c: np.ndarray, pat, full: tuple[float, float] | None = None) -> float | None:
    """How white the noise the patch-PCA estimate reads is: its sigma at 18% grey on ``bin_mosaic(c)`` over the
    same on ``c`` (``full``, when already estimated). White noise gives 0.5; a reading that is really the
    scene's own fine texture, which binning does not average away, gives nearer 1. None when either is 0.
    The binned plane needs about 480 x 480 sensels: on a 480 x 480 frame white noise reads 0.39, not 0.5
    (eval/noise-scale-per-frame-2026-11-17.md)."""

    period = 6 if len(pat) == 36 else 2
    a = sigma18(full if full is not None else estimate_noise_pca(c, pat))
    b = sigma18(estimate_noise_pca(bin_mosaic(c, period), pat))
    return b / a if a > 0 and b > 0 else None

