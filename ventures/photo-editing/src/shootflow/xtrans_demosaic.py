"""A directional demosaic for Fujifilm's 6x6 X-Trans CFA (numpy).

The bilinear demosaic (``raw_develop._bilinear``, ``raw_develop_np._bilinear``) averages each missing
colour over the 3x3 window. On X-Trans that is correct but soft, and across a sharp edge it mixes
both sides, which shows as false colour along the edge. This module follows the idea Frank
Markesteijn described for X-Trans and dcraw/LibRaw ship as their X-Trans method: build the green
plane several times, each time interpolating along one direction only, fill red and blue from each,
and keep, pixel by pixel, the direction whose result is most homogeneous in a perceptual space. The
code is this repository's own (written from the idea, not from dcraw's source), and every step works
from the 6x6 pattern given, so any rotation or phase of the layout works.

Steps, on the white-balanced sensel plane ``c`` (so that the three colours are comparable):

1. **Isotropic estimates.** Each colour's 3x3 average (every 3x3 X-Trans window holds all three
   colours), the starting point for the colour differences below.
2. **Directional green.** For each of four directions (across, down, and both diagonals) and each
   red or blue sensel, the nearest green on each side along that line (1 to 3 sensels away; the
   distances depend only on the phase) are interpolated linearly, as colour differences: the green
   minus the sensel's own colour, the latter taken from step 1 at the green sites. Adding the
   sensel's own value back gives a green that follows the edge along that line and is not dragged
   across it. The estimate is then held between those two greens (``clamp``): the colour difference
   carries the sensel's own detail, but where the 3x3 estimate of its colour is off (fine texture,
   an edge), it overshoots, and a green outside the two it lies between is almost always wrong
   (2026-11-15: 1.7 dB on the X-E1 frame, eval/xtrans-clamp-gradient-2026-11-15.md).
3. **Red and blue per direction.** Colour differences (red minus green, blue minus green) at the
   sensels holding red or blue, averaged over the 3x3 window and added to that direction's green.
4. **Choice** (``select``). The default, ``"gradient"`` (2026-11-15), weighs each direction's
   picture by how smooth it is along its own line: the second difference along that direction,
   summed over the three channels and a 3x3 window, D; the weights are (D_min / D)^4, so the
   smoothest direction dominates but near ties are blended, not flipped. ``"homogeneity"`` (the
   2026-11-14 rule, kept to reproduce it) takes each direction's picture to CIE L*a*b* (as if camera
   RGB were linear sRGB), counts for each pixel its 8 neighbours within the pixel's own lightness and
   colour tolerances (the smallest step along its best direction, as in adaptive
   homogeneity-directed demosaicing), sums over a 3x3 window and averages the directions that score
   within ``keep`` of the best. Measured, that rule did no better than averaging all four directions
   on a real frame (36.38 against 36.39 dB) and worse on a synthetic sheet.
5. **Optional clean-up** (``median_passes``): a 3x3 median of R - G and B - G, rebuilt around the
   sensels' own values, which removes isolated false colour left by step 4.

The output keeps every sensel's own value in its own colour. ``directional`` returns (h, w, 3) linear
values on the scale of ``c``; the caller clips and encodes them as it does the bilinear result.
"""

from __future__ import annotations

import numpy as np

WORK = np.float32  # working precision: ample for 16-bit output, half the memory traffic of float64
DIRECTIONS = ((0, 1), (1, 0), (1, 1), (1, -1))  # across, down, diagonal, anti-diagonal
_MAX_REACH = 3


def colour_map(pat, h: int, w: int) -> np.ndarray:
    """The colour (0 R, 1 G, 2 B) of each sensel of an (h, w) frame whose CFA repeats ``pat``."""

    p = 6 if len(pat) == 36 else 2
    tile = np.asarray(pat, dtype=np.int8).reshape(p, p)
    return np.tile(tile, (h // p + 1, w // p + 1))[:h, :w]


def _box3(a: np.ndarray) -> np.ndarray:
    """3x3 sum, edges reflected; separable (columns of three, then rows of three)."""

    p = np.pad(a, 1, mode="reflect")
    rows = p[:-2] + p[1:-1]
    rows += p[2:]
    s = rows[:, :-2] + rows[:, 1:-1]
    s += rows[:, 2:]
    return s


def _shift(a: np.ndarray, dy: int, dx: int) -> np.ndarray:
    """``out[y, x] = a[y + dy, x + dx]``, edges reflected (|dy|, |dx| up to 3)."""

    r = _MAX_REACH
    p = np.pad(a, r, mode="reflect")
    h, w = a.shape
    return p[r + dy : r + dy + h, r + dx : r + dx + w]


def _box_average(values: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """Mean of ``values`` over the sensels of ``mask`` in each 3x3 window; where a window at the frame's edge
    (reflected) holds none, the 5x5 window's mean."""

    v = np.where(mask, values, 0.0)
    m = mask.astype(values.dtype)
    num, den = _box3(v), _box3(m)
    empty = den == 0
    if empty.any():
        num = np.where(empty, _box3(_box3(v)), num)
        den = np.where(empty, _box3(_box3(m)), den)
    return num / den


def _reach(pat, p: int, py: int, px: int, dy: int, dx: int) -> int:
    """Sensels from phase (py, px) to the nearest green along (dy, dx); 0 if none within reach."""

    for k in range(1, _MAX_REACH + 1):
        if pat[((py + k * dy) % p) * p + (px + k * dx) % p] == 1:
            return k
    return 0


def _lab(rgb: np.ndarray, scale: float) -> np.ndarray:
    """CIE L*a*b* (D65) of linear sRGB ``rgb / scale``; used only to compare directions."""

    m = np.array(
        [[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.0721750], [0.0193339, 0.1191920, 0.9503041]],
        dtype=rgb.dtype,
    )
    m /= np.array([[0.95047], [1.0], [1.08883]], dtype=rgb.dtype)  # D65 white to 1
    xyz = np.clip(rgb * rgb.dtype.type(1.0 / scale), 0.0, None) @ m.T
    f = np.where(xyz > 216 / 24389, np.cbrt(xyz), (24389 / 27 * xyz + 16) / 116)
    lab = np.empty_like(f)
    lab[..., 0] = 116 * f[..., 1] - 16
    lab[..., 1] = 500 * (f[..., 0] - f[..., 1])
    lab[..., 2] = 200 * (f[..., 1] - f[..., 2])
    return lab


_MEDIAN9 = (  # a 19 compare-exchange network whose element 4 ends as the median of nine
    (1, 2), (4, 5), (7, 8), (0, 1), (3, 4), (6, 7), (1, 2), (4, 5), (7, 8), (0, 3),
    (5, 8), (4, 7), (3, 6), (1, 4), (2, 5), (4, 7), (4, 2), (6, 4), (4, 2),
)


def _median9(a: np.ndarray) -> np.ndarray:
    """3x3 median, edges reflected."""

    h, w = a.shape
    p = np.pad(a, 1, mode="reflect")
    v = [p[dy : dy + h, dx : dx + w] for dy in range(3) for dx in range(3)]
    for i, j in _MEDIAN9:
        v[i], v[j] = np.minimum(v[i], v[j]), np.maximum(v[i], v[j])
    return v[4]


SELECTS = ("gradient", "homogeneity")
GRADIENT_POWER = 4  # weights (D_min / D)^4: tuned on the X-E1 frame and the synthetic sheet (1, 2 and 4 tried)


def _gradient_select(pictures, h: int, w: int, scale: float):
    """Blend the directions' pictures, each weighted by (D_min / D)^4, D its second difference along its
    own line summed over the channels and a 3x3 window. Returns the picture and the (4, h, w) weights."""

    eps = WORK(1e-6 * scale)  # a flat patch: every direction equal, so all four blend
    rough = []
    for (dy, dx), pic in zip(DIRECTIONS, pictures):
        pp = np.pad(pic, ((1, 1), (1, 1), (0, 0)), mode="reflect")
        fwd = pp[1 + dy : 1 + dy + h, 1 + dx : 1 + dx + w]
        back = pp[1 - dy : 1 - dy + h, 1 - dx : 1 - dx + w]
        rough.append(_box3(np.abs(fwd + back - 2 * pic).sum(axis=-1)) + eps)
    smooth = np.stack(rough)
    weights = (smooth.min(axis=0) / smooth) ** GRADIENT_POWER  # in (0, 1], 1 for the smoothest
    weights /= weights.sum(axis=0)
    out = np.zeros((h, w, 3), dtype=WORK)
    for d, pic in enumerate(pictures):
        out += pic * weights[d][..., None]
    return out, weights


BAND_ROWS = 192  # rows per band (a multiple of 6); about 70 MB of working arrays per 1,000 columns
OVERLAP = 12  # rows per pass (plus 12) each band reads beyond its own on each side: more than one pass's reach (about 9)


def directional(
    c: np.ndarray,
    pat,
    *,
    scale: float | None = None,
    keep: float = 0.125,
    median_passes: int = 1,
    passes: int = 1,
    clamp: bool = True,
    select: str = "gradient",
    band_rows: int | None = BAND_ROWS,
    threads: int | None = None,
) -> np.ndarray:
    """Demosaic the white-balanced sensel plane ``c`` (h, w) with the 6x6 (or 2x2) pattern ``pat``.

    ``scale`` is the level treated as white for the perceptual comparison (default: the plane's 99.9th
    percentile). ``keep`` is the share below the best homogeneity score that still counts as best (0
    keeps only exact ties; ``select="homogeneity"`` only). ``clamp`` holds each directional green between the
    two greens it was interpolated from; ``select`` is ``"gradient"`` or ``"homogeneity"`` (step 4). Returns (h, w, 3) float64. Large frames run in bands of ``band_rows`` rows
    (None: one piece) on ``threads`` threads (``SHOOTFLOW_THREADS`` or up to 4 when None); every band reads
    ``OVERLAP * (passes + 1)`` rows past its own on each side, so the result equals the one-piece result exactly.
    """

    import os
    from concurrent.futures import ThreadPoolExecutor

    if select not in SELECTS:
        raise ValueError(f"unknown select {select!r}; choose one of {', '.join(SELECTS)}")
    c = np.asarray(c, dtype=np.float64)
    h = c.shape[0]
    if scale is None:
        scale = float(np.percentile(c, 99.9)) or 1.0

    def piece_of(part, part_pat):
        return _directional_piece(
            part, part_pat, scale=scale, keep=keep, median_passes=median_passes, passes=passes, clamp=clamp, select=select
        )

    overlap = OVERLAP * (passes + 1)
    if band_rows is None or h <= band_rows + 2 * overlap:
        return piece_of(c, pat)
    band_rows = max(6, band_rows - band_rows % 6)
    out = np.empty(c.shape + (3,), dtype=np.float64)

    def run(y0):
        y1 = min(h, y0 + band_rows)
        a = max(0, y0 - overlap)  # a multiple of 6, as overlap and y0 are
        b = min(h, y1 + overlap)
        piece = piece_of(c[a:b], _rotate_rows(pat, a))
        out[y0:y1] = piece[y0 - a : y1 - a]

    if threads is None:
        threads = int(os.environ.get("SHOOTFLOW_THREADS") or min(4, os.cpu_count() or 1))
    starts = range(0, h, band_rows)
    if threads <= 1:
        for y0 in starts:
            run(y0)
    else:
        with ThreadPoolExecutor(max_workers=threads) as pool:
            list(pool.map(run, starts))
    return out


def _rotate_rows(pat, a: int):
    """The pattern as seen from row ``a`` (unchanged when ``a`` is a multiple of the period)."""

    p = 6 if len(pat) == 36 else 2
    return tuple(pat[((y + a) % p) * p + x] for y in range(p) for x in range(p))


def _directional_piece(
    c: np.ndarray,
    pat,
    *,
    scale: float | None = None,
    keep: float = 0.125,
    median_passes: int = 1,
    passes: int = 1,
    clamp: bool = True,
    select: str = "gradient",
    return_choice: bool = False,
):
    """``directional`` on one piece; with ``return_choice`` also the (4, h, w) weight of each direction."""

    c0 = np.asarray(c, dtype=np.float64)
    p = 6 if len(pat) == 36 else 2
    if c0.shape[0] < p or c0.shape[1] < p:
        raise ValueError(f"the directional demosaic needs at least {p} x {p} sensels")
    if scale is None:
        scale = float(np.percentile(c0, 99.9)) or 1.0
    # Work on a frame padded by whole periods, each padded sensel copied from the nearest sensel of the same
    # phase inside, so every step sees the true layout up to the edge; the padding is cropped at the end.
    pad = 2 * 6
    c = c0[np.ix_(_fold(c0.shape[0], pad, p), _fold(c0.shape[1], pad, p))].astype(WORK)
    h, w = c.shape
    # colour_map(pat) from the padded origin: the padding is a whole number of periods.
    cmap = colour_map(pat, h, w)
    masks = [cmap == k for k in range(3)]

    # 1. Isotropic 3x3 estimates of each colour everywhere.
    iso = [np.where(masks[k], c, _box_average(c, masks[k])) for k in range(3)]
    for _pass in range(passes):
        out, chosen = _one_pass(c, pat, p, h, w, masks, iso, scale, keep, clamp, select)
        # Later passes take their colour differences from the previous pass's picture.
        iso = [np.where(masks[k], c, out[..., k]) for k in range(3)]

    # 5. Optional false-colour clean-up around the sensels' own values.
    for _ in range(median_passes):
        rg = _median9(out[..., 0] - out[..., 1])
        bg = _median9(out[..., 2] - out[..., 1])
        g = np.where(masks[0], c - rg, np.where(masks[2], c - bg, c))
        out = np.stack(
            [np.where(masks[0], c, g + rg), g, np.where(masks[2], c, g + bg)],
            axis=-1,
        )

    out = out[pad:-pad, pad:-pad].astype(np.float64)  # float64 out, so each sensel keeps its exact value
    out[...] = np.where(cmap[pad:-pad, pad:-pad, None] == np.arange(3), c0[..., None], out)  # exact own values
    if return_choice:
        return out, chosen[:, pad:-pad, pad:-pad]
    return out


def _fold(n: int, pad: int, p: int) -> np.ndarray:
    """Indices 0..n-1 extended by ``pad`` on each side, each outside index moved by whole periods ``p``
    to the nearest inside index of the same phase (``pad`` a multiple of ``p``, ``n >= p``)."""

    idx = np.arange(-pad, n + pad)
    under = idx < 0
    idx[under] += p * ((-idx[under] + p - 1) // p)
    over = idx >= n
    idx[over] -= p * ((idx[over] - n) // p + 1)
    return idx


def _one_pass(c, pat, p, h, w, masks, iso, scale, keep, clamp=True, select="gradient"):
    r = _MAX_REACH
    yy = np.arange(h)[:, None] % p
    xx = np.arange(w)[None, :] % p
    # The own-colour differences (green minus the estimate of red, or of blue), padded once.
    diffs = {k: np.pad(c - iso[k], r, mode="reflect") for k in (0, 2)}
    cp = np.pad(c, r, mode="reflect") if clamp else None
    sites = {k: np.nonzero(masks[k]) for k in (0, 2)}

    pictures = []
    for dy, dx in DIRECTIONS:
        # Per-pixel distances to the nearest green on each side along this line (they depend on the phase only).
        fwd = np.zeros((p, p), dtype=np.int64)
        back = np.zeros((p, p), dtype=np.int64)
        for py in range(p):
            for px in range(p):
                if pat[py * p + px] != 1:
                    fwd[py, px] = _reach(pat, p, py, px, dy, dx)
                    back[py, px] = _reach(pat, p, py, px, -dy, -dx)
        a_map = fwd[yy, xx]
        b_map = back[yy, xx]
        # 2. Green along this line, as a colour difference against the sensel's own colour: at a red sensel
        # the greens' (green - red estimate), at a blue one (green - blue estimate).
        g = np.where(masks[1], c, iso[1])
        for k in (0, 2):
            ys, xs = sites[k]
            ka, kb = a_map[ys, xs], b_map[ys, xs]
            ok = (ka > 0) & (kb > 0)
            ys, xs, ka, kb = ys[ok], xs[ok], ka[ok], kb[ok]
            d = diffs[k]
            d_f = d[ys + r + ka * dy, xs + r + ka * dx]
            d_b = d[ys + r - kb * dy, xs + r - kb * dx]
            est = c[ys, xs] + (kb * d_f + ka * d_b) / (ka + kb)
            if clamp:  # held between the two greens it lies between
                g_f = cp[ys + r + ka * dy, xs + r + ka * dx]
                g_b = cp[ys + r - kb * dy, xs + r - kb * dx]
                est = np.clip(est, np.minimum(g_f, g_b), np.maximum(g_f, g_b))
            g[ys, xs] = est
        # 3. Red and blue from this green, as 3x3 colour differences.
        rgb = np.empty((h, w, 3), dtype=WORK)
        rgb[..., 1] = g
        for k in (0, 2):
            d = _box_average(c - g, masks[k])
            rgb[..., k] = np.where(masks[k], c, g + d)
        pictures.append(rgb)

    if select == "gradient":
        return _gradient_select(pictures, h, w, scale)
    # 4. Homogeneity in L*a*b*. Each L*a*b* plane is padded once; neighbours are views into it.
    padded = []
    for pic in pictures:
        lab = _lab(pic, scale)
        padded.append([np.pad(lab[..., i], 1, mode="reflect") for i in range(3)])
    del lab

    def at(pl, dy, dx):
        return pl[1 + dy : 1 + dy + h, 1 + dx : 1 + dx + w]

    eps_l = None
    eps_c = None
    for (dy, dx), (pl, pa, pb) in zip(DIRECTIONS, padded):
        l0, a0, b0 = at(pl, 0, 0), at(pa, 0, 0), at(pb, 0, 0)
        el = np.maximum(np.abs(l0 - at(pl, dy, dx)), np.abs(l0 - at(pl, -dy, -dx)))
        cf = (a0 - at(pa, dy, dx)) ** 2 + (b0 - at(pb, dy, dx)) ** 2
        cb = (a0 - at(pa, -dy, -dx)) ** 2 + (b0 - at(pb, -dy, -dx)) ** 2
        ec = np.maximum(cf, cb)
        eps_l = el if eps_l is None else np.minimum(eps_l, el)
        eps_c = ec if eps_c is None else np.minimum(eps_c, ec)
    scores = []
    for pl, pa, pb in padded:
        l0, a0, b0 = at(pl, 0, 0), at(pa, 0, 0), at(pb, 0, 0)
        homo = np.zeros((h, w), dtype=WORK)
        for ny in (-1, 0, 1):
            for nx in (-1, 0, 1):
                if ny == 0 and nx == 0:
                    continue
                dl = np.abs(l0 - at(pl, ny, nx))
                dc = (a0 - at(pa, ny, nx)) ** 2 + (b0 - at(pb, ny, nx)) ** 2
                homo += (dl <= eps_l) & (dc <= eps_c)
        scores.append(_box3(homo))
    scores = np.stack(scores)
    best = scores.max(axis=0)
    chosen = scores >= best * (1.0 - keep)
    total = np.zeros((h, w, 3), dtype=WORK)
    for d, pic in enumerate(pictures):
        total += pic * chosen[d][..., None]
    out = total / chosen.sum(axis=0)[..., None]
    return out, chosen
