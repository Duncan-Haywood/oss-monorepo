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
   sensels' own values, which removes isolated false colour left by step 4. Rebuilding green this way
   puts the sensel's own noise into green; ``median_green=False`` sets red and blue only. Measured on
   seven held-out truths on 2026-11-16 that loses on six of them noise-free (up to 1.4 dB colour PSNR) and
   is a wash at SNR 25, so green stays in the median by default (eval/xtrans-fresh-truths-2026-11-16.md).

With a C compiler the whole piece runs in ``shootflow.xtrans_native`` instead (``native``), equal to this
code bit for bit; this module stays the reference and the fallback.

The output keeps every sensel's own value in its own colour. ``directional`` returns (h, w, 3) linear
values on the scale of ``c``; the caller clips and encodes them as it does the bilinear result.
"""

from __future__ import annotations

import warnings

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
    q = smooth.min(axis=0) / smooth  # in (0, 1], 1 for the smoothest
    q *= q
    weights = q * q  # q ** GRADIENT_POWER by squaring: numpy's float32 ``**`` follows the CPU's SIMD library
    # (on an AVX-512 machine it differs from libm's powf on 20% of values, 2026-11-15), squaring does not,
    # so the result is the same on every machine and equals the C path's bit for bit.
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
    median_green: bool = True,
    band_rows: int | None = BAND_ROWS,
    threads: int | None = None,
    native: bool | None = None,
) -> np.ndarray:
    """Demosaic the white-balanced sensel plane ``c`` (h, w) with the 6x6 (or 2x2) pattern ``pat``.

    ``scale`` is the level treated as white for the perceptual comparison (default: the plane's 99.9th
    percentile). ``keep`` is the share below the best homogeneity score that still counts as best (0
    keeps only exact ties; ``select="homogeneity"`` only). ``clamp`` holds each directional green between the
    two greens it was interpolated from; ``select`` is ``"gradient"`` or ``"homogeneity"`` (step 4); ``median_green=False`` keeps green out of the
    median (step 5; numpy only). Returns (h, w, 3) float64. Large frames run in bands of ``band_rows`` rows
    (None: one piece) on ``threads`` threads (``SHOOTFLOW_THREADS`` or up to 4 when None); every band reads
    ``OVERLAP * (passes + 1)`` rows past its own on each side, so the result equals the one-piece result exactly.

    ``native``: None (default) runs each piece through the C function of ``shootflow.xtrans_native`` when it
    builds and ``select`` is ``"gradient"``; False forces numpy; True refuses to fall back. The two are equal
    bit for bit (``eval/xtrans-native-2026-11-15.md``).
    """

    import os
    from concurrent.futures import ThreadPoolExecutor

    if select not in SELECTS:
        raise ValueError(f"unknown select {select!r}; choose one of {', '.join(SELECTS)}")
    c = np.asarray(c, dtype=np.float64)
    h = c.shape[0]
    if scale is None:
        scale = float(np.percentile(c, 99.9)) or 1.0
    use_c = False
    if native is not False and select == "gradient" and median_green:
        from shootflow import xtrans_native

        use_c = xtrans_native.available()
    if native is True and not use_c:
        raise RuntimeError("the native X-Trans demosaic is unavailable (no C compiler, SHOOTFLOW_NATIVE=0, select other than gradient or median_green=False)")

    def piece_of(part, part_pat):
        return _directional_piece(
            part, part_pat, scale=scale, keep=keep, median_passes=median_passes, passes=passes, clamp=clamp, select=select,
            median_green=median_green, native=use_c,
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
    median_green: bool = True,
    return_choice: bool = False,
    native: bool = False,
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
    if native and select == "gradient" and not return_choice:
        from shootflow import xtrans_native

        out = xtrans_native.piece(
            c, cmap, _reach_table(pat, p), p, clamp, WORK(1e-6 * scale), passes, median_passes
        )
        if out is not None:
            return _finish(out, c0, cmap, pad)
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
        if median_green:
            g = np.where(masks[0], c - rg, np.where(masks[2], c - bg, c))
        else:  # green as the pass left it: the median sets red and blue only
            g = out[..., 1]
        out = np.stack(
            [np.where(masks[0], c, g + rg), g, np.where(masks[2], c, g + bg)],
            axis=-1,
        )

    out = _finish(out, c0, cmap, pad)
    if return_choice:
        return out, chosen[:, pad:-pad, pad:-pad]
    return out


def _finish(out, c0, cmap, pad):
    """Crop the padding, widen to float64 and put back every sensel's exact own value."""

    out = out[pad:-pad, pad:-pad].astype(np.float64)  # float64 out, so each sensel keeps its exact value
    out[...] = np.where(cmap[pad:-pad, pad:-pad, None] == np.arange(3), c0[..., None], out)  # exact own values
    return out


def _reach_table(pat, p: int) -> np.ndarray:
    """(4, 2, p, p) distances from each phase to the nearest green forward and back along each direction."""

    t = np.zeros((4, 2, p, p), dtype=np.int8)
    for d, (dy, dx) in enumerate(DIRECTIONS):
        for py in range(p):
            for px in range(p):
                if pat[py * p + px] != 1:
                    t[d, 0, py, px] = _reach(pat, p, py, px, dy, dx)
                    t[d, 1, py, px] = _reach(pat, p, py, px, -dy, -dx)
    return t


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


# --- Noise-aware blend with bilinear (2026-11-16, eval/xtrans-noise-aware-blend-2026-11-16.md) -------------
#
# Edge-keeping pays where a region holds detail near the sampling limit and costs where it holds little
# but noise: the directional green follows each sensel's own noise along one line instead of averaging it
# over the 3 x 3 window. ``frame_measures`` estimates, from the mosaic alone, how much the directional
# result departs from the bilinear one (``detail``) against the sensor noise there (``sigma``), per
# BLOCK x BLOCK block; ``noise_aware`` blends the two per block by that ratio.

BLOCK = 24


def _block_stat(a: np.ndarray, fn, block: int = BLOCK) -> np.ndarray:
    h, w = a.shape[:2]
    if h >= block and w >= block:
        hb, wb, bh, bw = h // block, w // block, block, block
        a = a[: hb * block, : wb * block]
    else:  # one block, the whole frame, as ``_block_detail`` takes it; until 2026-11-19 a frame under one block
        # tall but over one wide (or the reverse) got hb = 1 but wb = w // block and failed to reshape
        hb, wb, bh, bw = 1, 1, h, w
    tiles = a.reshape(hb, bh, wb, bw, *a.shape[2:]).swapaxes(1, 2).reshape(hb, wb, -1)
    return fn(tiles)


def _block_level(c: np.ndarray) -> np.ndarray:
    """Each block's mean of ``c`` clipped at 0: ``_block_stat(np.clip(c, 0.0, None), mean)``. Since 2026-11-19
    in C when a compiler is there (``noise_native.block_mean_max``: one pass, no clipped or reshaped full-frame
    copy, numpy's pairwise summation order, the same bits; eval/noise-aware-native-levels-2026-11-19.md)."""

    from shootflow import noise_native

    fast = noise_native.block_mean_max(c, BLOCK)
    if fast is not None:
        return fast[0]
    return _block_stat(np.clip(c, 0.0, None), lambda t: t.mean(axis=-1))


def _block_top(c: np.ndarray) -> np.ndarray:
    """Each block's largest value of ``c``: ``_block_stat(c, max)``, in C as ``_block_level`` when it can be."""

    from shootflow import noise_native

    fast = noise_native.block_mean_max(c, BLOCK, mean=False, top=True)
    if fast is not None:
        return fast[1]
    return _block_stat(c, lambda t: t.max(axis=-1))


def _noise_model(level: np.ndarray, spread: np.ndarray, pct: float = 15.0) -> tuple[float, float]:
    """Fit variance = g * level + r (shot and read noise) to the quietest blocks at each brightness: the
    blocks are put in eight brightness bins and each bin's ``pct``th percentile (15th by default) of ``spread``
    squared is taken, so texture (which only adds spread) mostly drops out."""

    lv, sp = level.ravel(), spread.ravel()
    if lv.size < 8:
        return 0.0, float(np.median(sp) ** 2)
    edges = np.quantile(lv, np.linspace(0, 1, 9))
    xs, ys = [], []
    for i in range(8):
        sel = (lv >= edges[i]) & (lv <= edges[i + 1])
        if sel.sum() >= 3:
            xs.append(float(np.median(lv[sel])))
            ys.append(float(np.percentile(sp[sel], pct)) ** 2)
    x, y = np.asarray(xs), np.asarray(ys)
    if x.size < 2 or np.ptp(x) == 0:
        return 0.0, float(np.mean(y)) if y.size else 0.0
    g, r = np.polyfit(x, y, 1)
    if r < 0:
        g, r = max(0.0, float(x @ y / (x @ x))), 0.0
    if g < 0:
        g, r = 0.0, float(np.mean(y))
    return float(g), float(r)


def _residual(c, pat, *, band: int = 240, threads: int | None = None) -> np.ndarray:
    """Each sensel's leave-one-out residual against its same-colour neighbours (5 x 5, triangle-weighted), as
    a sigma (MAD to sigma; 0.85 removes the neighbours' own share).

    Computed in bands of ``band`` rows on a thread pool (``raw_develop_np._run_bands``), each band read with
    ``_RESID_HALO`` rows above and below: the two nested 3 x 3 sums reach two rows, so a halo row's reflected
    pad never reaches a kept row, and at the frame's top and bottom the band's edge is the frame's edge. Every
    kept sample is the same arithmetic in the same order as one whole-frame pass, so neither the band height
    nor the thread count changes a bit; the working set is a band, not a dozen full-frame float64 planes
    (eval/noise-aware-full-frame-cost-2026-11-17.md). Since 2026-11-19 the same arithmetic runs in C when a
    compiler is there (``noise_native.residual``, 7.5x faster on four cores at 24 MP, the same bits;
    ``_residual_np`` is the numpy reference, eval/noise-aware-native-spread-2026-11-19.md)."""

    from shootflow import noise_native

    c = np.asarray(c, dtype=np.float64)
    fast = noise_native.residual(c, pat, band=band, threads=threads)
    if fast is not None:
        return fast  # the same arithmetic in C, bit for bit (eval/noise-aware-native-spread-2026-11-19.md)
    return _residual_np(c, pat, band=band, threads=threads)


def _residual_np(c, pat, *, band: int = 240, threads: int | None = None) -> np.ndarray:
    """``_residual`` in numpy: the reference the C path (``noise_native.residual``) must equal bit for bit, and
    the path taken without a C compiler or with ``SHOOTFLOW_NATIVE=0``."""

    from shootflow.raw_develop_np import _run_bands

    c = np.asarray(c, dtype=np.float64)
    h, w = c.shape
    period = 6 if len(pat) == 36 else 2
    out = np.empty((h, w), dtype=np.float64)

    def run(y0, y1):
        a0, a1 = max(0, y0 - _RESID_HALO), min(h, y1 + _RESID_HALO)
        # the slice starts on row a0, so its colour map starts on a0's row phase
        tile = np.asarray(pat, dtype=np.int8).reshape(period, period)
        tile = np.roll(tile, -(a0 % period), axis=0)
        cmap = np.tile(tile, ((a1 - a0) // period + 1, w // period + 1))[: a1 - a0, :w]
        cb = c[a0:a1]
        pred = np.zeros_like(cb)
        for k in range(3):
            m = (cmap == k).astype(np.float64)
            s = _box3(_box3(cb * m)) - 9.0 * cb * m
            n = _box3(_box3(m)) - 9.0 * m
            pred += np.where(m > 0, s / np.maximum(n, 1e-9), 0.0)
        out[y0:y1] = (np.abs(cb - pred) * 1.4826 * 0.85)[y0 - a0 : y0 - a0 + (y1 - y0)]

    _run_bands(run, h, band=band, threads=threads)
    return out


_RESID_HALO = 4  # rows read past a band's edge by ``_residual`` (two nested 3 x 3 sums reach 2)


def _block_spread(c, pat) -> tuple[np.ndarray, np.ndarray]:
    """Per BLOCK x BLOCK block of the mosaic ``c``: its mean level and its noise spread, the median of each
    sensel's leave-one-out residual against its same-colour neighbours (5 x 5, triangle-weighted) as a sigma."""

    from shootflow import noise_native

    c = np.asarray(c, dtype=np.float64)
    level = _block_level(c)
    resid = _residual(c, pat)
    spread = noise_native.block_median(resid, BLOCK)  # bit for bit with the line below; None without C
    if spread is None:
        spread = _block_stat(resid, lambda t: np.median(t, axis=-1))
    return level, spread


def _colour_block_spread(c, pat, k: int, resid: np.ndarray | None = None) -> tuple[np.ndarray, np.ndarray]:
    """``_block_spread`` over colour ``k``'s sensels only (0 R, 1 G, 2 B): each block's mean level of that
    colour and the median of that colour's residuals. NaN in a block that holds no sensel of it."""

    c = np.asarray(c, dtype=np.float64)
    h, w = c.shape
    m = colour_map(pat, h, w) == k
    lv = np.where(m, np.clip(c, 0.0, None), np.nan)
    rs = np.where(m, _residual(c, pat) if resid is None else resid, np.nan)
    with warnings.catch_warnings():  # an all-NaN block (no sensel of k) is meant to read NaN
        warnings.simplefilter("ignore", RuntimeWarning)
        level = _block_stat(lv, lambda t: np.nanmean(t, axis=-1))
        spread = _block_stat(rs, lambda t: np.nanmedian(t, axis=-1))
    return level, spread


def as_planes(noise) -> np.ndarray:
    """A noise model as a (3, 2) array, (shot, read) per colour (rows R, G, B: ``colour_map``'s 0, 1, 2).
    One (shot, read) pair is the same model on every colour."""

    a = np.asarray(noise, dtype=np.float64)
    if a.shape == (2,):
        return np.tile(a, (3, 1))
    if a.shape == (3, 2):
        return a
    raise ValueError(f"noise must be (shot, read) or three such pairs, got shape {a.shape}")


def variance_map(c, pat, noise) -> np.ndarray:
    """Each sensel's noise variance under ``noise`` (one (shot, read) pair or one per colour, ``as_planes``):
    shot_k * max(c, 0) + read_k for the sensel's colour k."""

    c = np.asarray(c, dtype=np.float64)
    p = as_planes(noise)
    cmap = colour_map(pat, *c.shape)
    return p[cmap, 0] * np.clip(c, 0.0, None) + p[cmap, 1]


def estimate_noise(c, pat, pct: float = 15.0) -> tuple[float, float]:
    """The sensor's (shot, read) model, variance = shot * level + read, fitted from the mosaic ``c`` alone: the
    quietest blocks' spread at each brightness (``_block_spread``, ``_noise_model``). Texture only adds to the
    spread, so on a detailed frame this reads high; on a smooth one it reads about 0.8 of the true sigma
    (eval/noise-profile-real-dngs-2026-11-16.md)."""

    return _noise_model(*_block_spread(c, pat), pct=pct)


# The profile guard (2026-11-16, eval/noise-profile-real-dngs-2026-11-16.md). Blocks are put in eight brightness
# bins, as ``_noise_model`` does; in each, the 15th percentile of the blocks' spread reads 0.80 of the true sigma
# on a smooth synthetic field (both CFAs) and more where texture fills the bin. So the profile's sigma at the
# bin's level over ESTIMATE_BIAS x that spread, in the cleanest bin, reads how far the profile overstates the
# noise (0.95-1.02 for an honest synthetic profile, k for one k times too high); texture can only make it read
# low. On 83 real CFA DNGs from 80 bodies (raw.pixls.us, 2026-11-16) Adobe-written profiles read 0.94-1.20 and
# 43 of 83 read over PROFILE_CAP: 25 over 2x, 11 over 5x, up to 77x (three iPhone apps 14-32x). Past the cap the
# profile is scaled down to it: overstating the noise by about 1.5x or more costs dB in the blend, understating
# it only moves the blend toward the directional default.
ESTIMATE_BIAS = 1.25
PROFILE_CAP = 1.25


def _bin_ratio(lv: np.ndarray, sv: np.ndarray, sig_fn) -> float:
    """The largest, over eight brightness bins of the blocks' levels ``lv``, of the profile's sigma at the bin's
    median level (``sig_fn``) over ESTIMATE_BIAS x the bin's 15th-percentile spread ``sv``; bins near black
    (median level under 3 x that spread) skipped. NaN when no bin qualifies."""

    ok = np.isfinite(lv) & np.isfinite(sv)
    lv, sv = lv[ok], sv[ok]
    if lv.size < 8:
        return float("nan")
    edges = np.quantile(lv, np.linspace(0, 1, 9))
    best = float("nan")
    for i in range(8):
        sel = (lv >= edges[i]) & (lv <= edges[i + 1])
        if sel.sum() < 3:
            continue
        x = float(np.median(lv[sel]))
        q = ESTIMATE_BIAS * float(np.percentile(sv[sel], 15))
        sig = float(sig_fn(x))
        if q <= 0.0 or sig <= 0.0 or x < 3.0 * q:  # near black the clip at 0 hides noise
            continue
        r = sig / q
        best = r if not best == best or r > best else best
    return best


def _unclipped(c) -> np.ndarray:
    # Blocks holding a sensel at the frame's top value are clipped (white or the white-balanced plane's cap),
    # and their spread reads near 0: a real Huawei VTR-L09 frame's top bin read 4e-16 and the ratio 3.5e13.
    top = float(c.max())
    return (_block_top(c) < top * (1.0 - 1e-9)).ravel()


def profile_ratio(c, pat, noise, *, spread: tuple[np.ndarray, np.ndarray] | None = None) -> float:
    """How many times the noise a profile ``noise`` (shot, read on ``c``'s scale) states exceeds what the mosaic
    shows: the largest, over brightness bins clear of the black clip, of the profile's sigma at the bin's median
    level over ESTIMATE_BIAS x the bin's 15th-percentile block spread, blocks that reach the frame's top value
    (clipped) left out. NaN when no bin qualifies. A per-colour ``noise`` (three pairs) is read through
    ``plane_ratios`` and the largest of the three returned."""

    c = np.asarray(c, dtype=np.float64)
    if np.asarray(noise).shape == (3, 2):
        r = plane_ratios(c, pat, noise)
        return float(np.nanmax(r)) if np.isfinite(r).any() else float("nan")
    level, sp = _block_spread(c, pat) if spread is None else spread
    keep = _unclipped(c)
    shot, read = float(noise[0]), float(noise[1])
    return _bin_ratio(level.ravel()[keep], sp.ravel()[keep], lambda x: np.sqrt(max(shot * x + read, 0.0)))


def plane_ratios(c, pat, noise) -> np.ndarray:
    """``profile_ratio`` per colour (R, G, B): each colour's own blocks' levels and spread against that
    colour's (shot, read) from ``noise`` (``as_planes``). On the white-balanced plane the colours' noise differs
    by the white-balance gain (red and blue often 1.5-2.5x green's sigma), so one mixed reading cannot say
    which plane a profile overstates (eval/noise-aware-planes-luma-2026-11-16.md)."""

    c = np.asarray(c, dtype=np.float64)
    p = as_planes(noise)
    keep = _unclipped(c)
    resid = _residual(c, pat)
    out = np.full(3, np.nan)
    for k in range(3):
        level, sp = _colour_block_spread(c, pat, k, resid)
        s, r = float(p[k, 0]), float(p[k, 1])
        out[k] = _bin_ratio(level.ravel()[keep], sp.ravel()[keep], lambda x, s=s, r=r: np.sqrt(max(s * x + r, 0.0)))
    return out


def guard_profile(c, pat, noise, *, cap: float = PROFILE_CAP):
    """``noise`` checked against the mosaic: the noise model to use and ``profile_ratio``. Past ``cap`` both terms
    are scaled by the same factor, so the profile keeps its shot/read shape and states ``cap`` x what the
    cleanest bin shows. A per-colour ``noise`` (three pairs, ``as_planes``) is checked plane by plane
    (``plane_ratios``): each plane over ``cap`` is scaled on its own, the others kept; the ratio returned is the
    largest of the three, and the model returned is a (3, 2) array."""

    if np.asarray(noise).shape == (3, 2):
        p = as_planes(noise).copy()
        r = plane_ratios(c, pat, p)
        for k in range(3):
            if r[k] == r[k] and r[k] > cap:
                p[k] *= (cap / r[k]) ** 2
        return p, (float(np.nanmax(r)) if np.isfinite(r).any() else float("nan"))
    shot, read = float(noise[0]), float(noise[1])
    ratio = profile_ratio(c, pat, (shot, read))
    if not ratio == ratio or ratio <= cap:
        return (shot, read), ratio
    f = (cap / ratio) ** 2
    return (shot * f, read * f), ratio


# A file with no NoiseProfile (every raw read directly: ARW, NEF, CR2, RW2, ...) can get its noise model from the
# frame (``DevelopSettings.noise_from_frame``, the default since the evening of 2026-11-17,
# eval/noise-fallback-real-2026-11-17.md; tools/noise_aware_estimated.py). Since the afternoon of
# 2026-11-17 the model comes from patch PCA on weak-texture mosaic patches (``noise_pca.estimate_noise_pca``,
# eval/noise-pca-estimator-2026-11-17.md) with sigma times FRAME_SCALE, then ``guard_profile``. The block-spread
# estimate it replaced (``estimator="spread"``, eval/noise-aware-estimated-2026-11-17.md) read fine texture as
# noise: 43 of 240 held-out Bayer tiles lost over 0.1 dB to directional, down to 4.17 dB. With patch PCA none
# did (worst 0.03 dB) at the same mean luma gain (+0.52 dB); on X-Trans 17 of 248 did (worst 1.48 dB, against
# 45 and 5.65 dB). An understated model only moves the blend toward directional, so the estimate is scaled down.
FRAME_PCT = 15.0
FRAME_SCALE = 0.8
FRAME_ESTIMATORS = ("pca", "spread")


def frame_noise(c, pat, *, pct: float = FRAME_PCT, scale: float = FRAME_SCALE,
                estimator: str = "pca") -> tuple[float, float]:
    """A (shot, read) noise model for the noise-aware blend read from the mosaic ``c`` alone, on ``c``'s scale:
    patch PCA (``noise_pca.estimate_noise_pca``; ``estimator="spread"``: ``estimate_noise`` at the ``pct``th
    block-spread percentile, the 2026-11-17 morning model), sigma times ``scale``, through ``guard_profile``."""

    if estimator == "pca":
        from shootflow.noise_pca import estimate_noise_pca

        shot, read = estimate_noise_pca(c, pat)
    elif estimator == "spread":
        shot, read = estimate_noise(c, pat, pct=pct)
    else:
        raise ValueError(f"unknown estimator {estimator!r} ({', '.join(FRAME_ESTIMATORS)})")
    f = scale * scale
    used, _ = guard_profile(c, pat, (shot * f, read * f))
    return float(used[0]), float(used[1])


_MEASURE_BAND = 10 * BLOCK  # rows per band of ``_block_detail`` and ``blend``: whole blocks, a few tens of MB


def _block_detail(bilinear, directional_out, threads: int | None = None) -> tuple[np.ndarray, float]:
    """Per BLOCK x BLOCK block, the RMS of directional minus bilinear (``_block_stat``'s blocks); and the RMS over
    the whole frame. Run in bands of whole blocks (``_MEASURE_BAND`` rows) on a thread pool, so the full-frame
    (h, w, 3) float64 difference and its square are never held (on a 36 MP frame, 0.9 GB each). Each block's
    value is the same arithmetic as one whole-frame ``_block_stat``, bit for bit; the frame RMS sums the
    bands' sums of squares, so it can differ from one ``np.mean`` in the last bits."""

    from shootflow.raw_develop_np import _run_bands

    h, w = bilinear.shape[:2]

    def rms(t):
        return np.sqrt(np.mean(t**2, axis=-1))

    if h < BLOCK or w < BLOCK:  # one block: the whole frame (``_block_stat``)
        diff = np.asarray(directional_out, dtype=np.float64) - np.asarray(bilinear, dtype=np.float64)
        return _block_stat(diff, rms), float(np.sqrt(np.mean(diff**2)))
    hb = h // BLOCK
    det = np.empty((hb, max(1, w // BLOCK)), dtype=np.float64)
    sums: dict[int, float] = {}

    def run(y0, y1):
        diff = np.asarray(directional_out[y0:y1], dtype=np.float64) - np.asarray(bilinear[y0:y1], dtype=np.float64)
        sums[y0] = float(np.sum(diff**2))
        b0, b1 = y0 // BLOCK, min(hb, y1 // BLOCK)
        if b1 > b0:
            det[b0:b1] = _block_stat(diff[: (b1 - b0) * BLOCK], rms)

    _run_bands(run, h, band=_MEASURE_BAND, threads=threads)
    return det, float(np.sqrt(sum(sums[k] for k in sorted(sums)) / (h * w * (bilinear.shape[2] if bilinear.ndim == 3 else 1))))


def frame_measures(
    c, pat, bilinear: np.ndarray, directional_out: np.ndarray, *, noise: tuple[float, float] | None = None,
    blocks: bool = False,
) -> dict:
    """Noise and detail of a white-balanced sensel plane, from the mosaic and its two demosaics.

    ``noise``: the sensor's (shot, read) model, variance = shot * level + read on the plane's scale, or one
    such pair per colour (a (3, 2) array, ``as_planes``; each block's noise is then the mean of its sensels'
    own variances, ``variance_map``), when it is known (a DNG NoiseProfile, a camera profile); else it is fitted to each sensel's leave-one-out
    residual against its same-colour neighbours (5 x 5, triangle-weighted) in the quietest blocks, which
    over-reads the noise where texture fills every block. ``sigma``: the model's noise at the frame's median
    level. ``detail``: the RMS of directional minus bilinear. ``q``: the median over BLOCK x BLOCK blocks of
    block detail over the model's noise at that block's level (``q_blocks`` with ``blocks=True``).
    """

    c = np.asarray(c, dtype=np.float64)
    level = _block_level(c)
    planes = noise is not None and np.asarray(noise).shape == (3, 2)
    if noise is None:
        g, r = estimate_noise(c, pat)
    elif planes:
        # One (shot, read) per colour: each block's noise is the mean of its own sensels' variances
        # (``variance_map``), so a block's red and blue sensels count at their own white-balanced noise.
        p = as_planes(noise)
        frac = np.bincount(colour_map(pat, *c.shape).ravel(), minlength=3) / c.size
        g, r = float(frac @ p[:, 0]), float(frac @ p[:, 1])
    else:
        g, r = float(noise[0]), float(noise[1])
    det, detail = _block_detail(bilinear, directional_out)
    if planes:
        noise_b = np.sqrt(np.maximum(_block_stat(variance_map(c, pat, noise), lambda t: t.mean(axis=-1)), 1e-12))
    else:
        noise_b = np.sqrt(np.maximum(g * level + r, 1e-12))
    qb = det / noise_b
    out = {
        "sigma": float(np.sqrt(max(g * float(np.median(level)) + r, 0.0))),
        "detail": detail,
        "q": float(np.median(qb)),
        "q_mean": float(np.mean(np.minimum(qb, 1e3))),
        "shot": g,
        "read": r,
    }
    if blocks:
        out["q_blocks"] = qb
    return out


# The ramp (q_low, q_high) per CFA, fitted on 21 "tune" files' tiles and scored on 25 held-out files'
# (eval/xtrans-noise-aware-blend-2026-11-16.md): colour PSNR +0.43 dB (X-Trans) and +0.31 dB (Bayer) on
# average over the directional default, no held-out tile worse by more than 0.01 dB, with the noise known.
RAMPS = {6: (0.4, 2.0), 2: (0.4, 1.2)}

# A second, later ramp for luma only (``blend(..., luma_ramp=)``): the output keeps ``RAMPS``' colour
# difference (R-G, B-G) and takes its luma from this ramp, which leans further toward bilinear. Fitted on the
# same 21 tune files with luma scored (tools/noise_aware_ramp_refit.py, eval/noise-aware-luma-ramp-2026-11-17.md):
# on 25 held-out files luma +0.23 dB (Bayer) and +0.16 dB (X-Trans) over ``RAMPS`` alone, RGB PSNR +0.13 / +0.10,
# no held-out tile worse than the directional default by more than 0.07 dB.
LUMA_RAMPS = {6: (0.8, 2.0), 2: (0.8, 1.5)}
LUMA_WEIGHTS = np.array([0.2126, 0.7152, 0.0722])  # Rec. 709; they sum to 1


# ``lift_near_detail``'s k per CFA, the default of ``noise_aware`` since 2026-11-19: tuned on the raw.pixls.us
# `fourth` set and passed a rule committed before the `first` set was scored (eval/near-clean-gate-2026-11-19.md).
NEAR_DETAIL: dict[int, float | None] = {2: 12.0, 6: None}


def lift_near_detail(q_blocks: np.ndarray, k: float) -> np.ndarray:
    """Each block's ``q`` raised to at least its largest 3 x 3 neighbour's over ``k``.

    ``blend`` spreads block weights to pixels by interpolating between block centres, so half of a detailed
    block's area takes part of its smooth neighbour's bilinear weight. Near clean that leak is what loses: a
    smooth block (q under ``q_low``) beside a block of q 30 pulls the detailed block's edge toward a bilinear
    demosaic 10 dB worse than directional there (Pentax K-3 Mark III tile, SNR 200: -0.58 dB luma with the
    true noise model, eval/near-clean-gate-2026-11-19.md). The lift lets a block keep its bilinear weight only
    when no neighbour's q is over ``k`` times the ramp's; on noisy frames the neighbours' q are small and
    nothing moves."""

    q = np.asarray(q_blocks, dtype=np.float64)
    h, w = q.shape
    p = np.pad(q, 1, mode="edge")
    m = q.copy()
    for dy in range(3):
        for dx in range(3):
            np.maximum(m, p[dy:dy + h, dx:dx + w], out=m)
    return np.maximum(q, m / k)


def _interp_matrix(n: int, nb: int) -> np.ndarray:
    """(n, nb) weights that interpolate nb block-centre values linearly to n pixel centres, held flat past
    the first and last centre (``np.interp``'s rule)."""

    centres = (np.arange(nb) + 0.5) * (n / nb)
    x = np.clip(np.arange(n) + 0.5, centres[0], centres[-1])
    out = np.zeros((n, nb))
    if nb == 1:
        out[:, 0] = 1.0
        return out
    j = np.clip(np.searchsorted(centres, x, side="right") - 1, 0, nb - 2)
    t = (x - centres[j]) / (centres[j + 1] - centres[j])
    out[np.arange(n), j] = 1.0 - t
    out[np.arange(n), j + 1] = t
    return out


def _interp_taps(n: int, nb: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """``_interp_matrix``'s two non-zero taps per row: columns ``j`` and ``j1`` with weights ``1 - t`` and ``t``."""

    if nb == 1:
        z = np.zeros(n, dtype=np.intp)
        return z, z, np.zeros(n)
    centres = (np.arange(nb) + 0.5) * (n / nb)
    x = np.clip(np.arange(n) + 0.5, centres[0], centres[-1])
    j = np.clip(np.searchsorted(centres, x, side="right") - 1, 0, nb - 2)
    t = (x - centres[j]) / (centres[j + 1] - centres[j])
    return j, j + 1, t


def _ramp(q: np.ndarray, q_low: float, q_high: float) -> np.ndarray:
    """Block weights: 0 at ``q_low``, 1 at ``q_high``, linear between."""

    return np.clip((q - q_low) / max(q_high - q_low, 1e-9), 0.0, 1.0)


def _weights(q_blocks: np.ndarray, q_low: float, q_high: float, h: int, w: int,
             rows: slice | None = None) -> np.ndarray:
    """Per-pixel blend weights (h, w), or only ``rows`` of them: ``_interp_matrix(h) @ ab @ _interp_matrix(w).T``
    taken two taps at a time (rows, then columns) instead of as dense products. Each value is the same few
    multiply-adds wherever its row falls, so a band's weights equal the whole frame's bit for bit, on any BLAS;
    the dense product's blocking changed with the row count and moved 1 value in 1,000 by a last bit
    (eval/noise-aware-full-frame-cost-2026-11-17.md)."""

    ab = _ramp(np.asarray(q_blocks, dtype=np.float64), q_low, q_high)
    jy, jy1, ty = _interp_taps(h, ab.shape[0])
    if rows is not None:
        jy, jy1, ty = jy[rows], jy1[rows], ty[rows]
    m = ab[jy] * (1.0 - ty)[:, None] + ab[jy1] * ty[:, None]  # (rows, wb)
    jx, jx1, tx = _interp_taps(w, ab.shape[1])
    return m[:, jx] * (1.0 - tx) + m[:, jx1] * tx  # (rows, w)


def blend(
    bilinear: np.ndarray, directional_out: np.ndarray, q_blocks: np.ndarray, q_low: float, q_high: float,
    luma_ramp: tuple[float, float] | None = None, *, out: np.ndarray | None = None, threads: int | None = None,
    clip_hi: float | None = None,
) -> np.ndarray:
    """``a * directional + (1 - a) * bilinear``, ``a`` per block from its ``q`` (0 at ``q_low``, 1 at ``q_high``,
    linear between), spread to pixels by bilinear interpolation between block centres.

    With ``luma_ramp`` (q_low, q_high) the result's luma (Rec. 709) comes from a second blend on that ramp and
    its colour difference (R-G, B-G) from the first: the luma difference is added equally to R, G and B. Each
    pixel then lies between its inputs' luma, and its R-G and B-G between theirs.

    Runs in bands of rows on a thread pool, each band's weights made for its rows only, so no full-frame
    weight map or (h, w, 3) temporary is held. ``out``: an (h, w, 3) float64 array to write into; it may be
    ``bilinear`` itself (each band reads its own rows before writing them), which the develop path passes to
    save a frame (eval/noise-aware-full-frame-cost-2026-11-17.md).

    The luma of D - B is ``(x0 * 0.2126 + x1 * 0.7152) + x2 * 0.0722`` in that order, elementwise. Until
    2026-11-19 it was a matrix-vector product, whose BLAS fused multiply-adds in a CPU-dependent order, so the
    same raw could develop to different last bits on different machines; the fixed order gives one answer
    everywhere and lets ``noise_native.blend`` (tried first) copy it bit for bit
    (eval/noise-aware-native-blend-2026-11-19.md). ``clip_hi``: clip the stored result to [0, clip_hi] as
    ``raw_develop_np._clip`` does, in the same pass (the develop path's float32 image)."""

    from shootflow import noise_native
    from shootflow.raw_develop_np import _clip, _run_bands

    h, w = bilinear.shape[:2]
    if out is None:
        out = np.empty((h, w, 3), dtype=np.float64)
    q = np.asarray(q_blocks, dtype=np.float64)
    ab = _ramp(q, q_low, q_high)
    abl = None if luma_ramp is None else _ramp(q, luma_ramp[0], luma_ramp[1])
    if noise_native.blend(bilinear, directional_out, ab, abl, _interp_taps(h, q.shape[0]), _interp_taps(w, q.shape[1]),
                          LUMA_WEIGHTS, out, clip_hi=clip_hi, band=_MEASURE_BAND, threads=threads):
        return out

    def run(y0, y1):
        rows = slice(y0, y1)
        a = _weights(q_blocks, q_low, q_high, h, w, rows)[..., None]
        b, d = bilinear[rows], directional_out[rows]
        res = a * d + (1.0 - a) * b
        if luma_ramp is not None:
            a_l = _weights(q_blocks, luma_ramp[0], luma_ramp[1], h, w, rows)
            x = np.asarray(d, dtype=np.float64) - b  # D - B
            dy = (x[..., 0] * LUMA_WEIGHTS[0] + x[..., 1] * LUMA_WEIGHTS[1]) + x[..., 2] * LUMA_WEIGHTS[2]
            res = res + ((a_l - a[..., 0]) * dy)[..., None]
        out[rows] = res
        if clip_hi is not None:
            o = out[rows]
            o[...] = _clip(o, clip_hi)

    _run_bands(run, h, band=_MEASURE_BAND, threads=threads)
    return out


def noise_aware(
    c, pat, *, bilinear: np.ndarray | None = None, directional_out: np.ndarray | None = None,
    noise: tuple[float, float] | None = None, q_low: float | None = None, q_high: float | None = None,
    per_block: bool = True, luma_ramp: tuple[float, float] | None | bool = True, out: np.ndarray | None = None,
    clip_hi: float | None = None, near_detail: float | None | bool = True,
) -> np.ndarray:
    """Directional where it adds detail above the noise, bilinear where it adds mostly noise.

    Weights per block from ``frame_measures`` (``blend``) with the CFA's ``RAMPS`` unless ``q_low``/``q_high``
    are given; with ``per_block=False`` the frame's median ``q`` sets one weight for the whole frame (measured
    worse: a frame mixes smooth and detailed regions). Pass ``noise`` whenever it is known: estimated from
    the mosaic it reads texture as noise on detailed frames and lost up to 5 dB on held-out tiles. Without
    ``directional_out`` the CFA's own directional demosaic runs (X-Trans here, ``bayer_demosaic`` on a 2 x 2
    pattern) at its defaults. Both inputs
    keep each sensel's own value, so the one-ramp blend does too. ``luma_ramp``: ``True`` (default) takes the
    CFA's ``LUMA_RAMPS`` for luma, a pair sets one, ``None``/``False`` blends luma on the colour ramp as before
    2026-11-17. It applies only with ``per_block``. The luma ramp moves every channel of a pixel by the same
    ``(a_l - a) * Y(D - B)``, so a sensel's own channel is no longer its raw value; putting it back was
    measured and gave back most of the luma gain (eval/noise-aware-luma-ramp-2026-11-17.md). ``out``: passed to
    ``blend`` (it may be ``bilinear``); with ``per_block=False`` it is ignored, as is ``clip_hi`` (``blend``'s:
    clip the stored result in the same pass). ``near_detail``: ``lift_near_detail``'s k, applied to the block
    q before ``blend``: ``True`` (default) takes the CFA's ``NEAR_DETAIL``, a number sets one, ``None``/``False``
    is off (the blend before 2026-11-19). Only with ``per_block``.
    """

    ramp = RAMPS[6 if len(pat) == 36 else 2]
    if luma_ramp is True:
        luma_ramp = LUMA_RAMPS[6 if len(pat) == 36 else 2]
    elif luma_ramp is False:
        luma_ramp = None
    if near_detail is True:
        near_detail = NEAR_DETAIL[6 if len(pat) == 36 else 2]
    elif near_detail is False:
        near_detail = None
    q_low = ramp[0] if q_low is None else q_low
    q_high = ramp[1] if q_high is None else q_high
    c = np.asarray(c, dtype=np.float64)
    if bilinear is None:
        from shootflow import raw_develop_np as rnp

        h, w = c.shape
        bilinear = np.empty((h, w, 3), dtype=np.float64)
        rnp._bilinear(c, w, h, pat, (1.0, 1.0, 1.0), 1e9, None, None, None, None, sink=bilinear, threads=1)
    if directional_out is None:
        if len(pat) == 4:
            from shootflow.bayer_demosaic import directional as bayer

            directional_out = bayer(c, pat)
        else:
            directional_out = directional(c, pat)
    m = frame_measures(c, pat, bilinear, directional_out, noise=noise, blocks=True)
    if not per_block:
        a = float(np.clip((m["q"] - q_low) / max(q_high - q_low, 1e-9), 0.0, 1.0))
        return a * directional_out + (1.0 - a) * bilinear
    q_blocks = m["q_blocks"] if near_detail is None else lift_near_detail(m["q_blocks"], near_detail)
    return blend(bilinear, directional_out, q_blocks, q_low, q_high, luma_ramp=luma_ramp, out=out,
                 clip_hi=clip_hi)
