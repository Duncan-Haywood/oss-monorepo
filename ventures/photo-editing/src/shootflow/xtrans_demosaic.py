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
    hb, wb = max(1, h // block), max(1, w // block)
    a = a[: hb * block, : wb * block] if h >= block and w >= block else a
    bh, bw = (block, block) if h >= block and w >= block else (h, w)
    tiles = a.reshape(hb, bh, wb, bw, *a.shape[2:]).swapaxes(1, 2).reshape(hb, wb, -1)
    return fn(tiles)


def _noise_model(level: np.ndarray, spread: np.ndarray) -> tuple[float, float]:
    """Fit variance = g * level + r (shot and read noise) to the quietest blocks at each brightness: the
    blocks are put in eight brightness bins and each bin's 15th percentile of ``spread`` squared is taken,
    so texture (which only adds spread) mostly drops out."""

    lv, sp = level.ravel(), spread.ravel()
    if lv.size < 8:
        return 0.0, float(np.median(sp) ** 2)
    edges = np.quantile(lv, np.linspace(0, 1, 9))
    xs, ys = [], []
    for i in range(8):
        sel = (lv >= edges[i]) & (lv <= edges[i + 1])
        if sel.sum() >= 3:
            xs.append(float(np.median(lv[sel])))
            ys.append(float(np.percentile(sp[sel], 15)) ** 2)
    x, y = np.asarray(xs), np.asarray(ys)
    if x.size < 2 or np.ptp(x) == 0:
        return 0.0, float(np.mean(y)) if y.size else 0.0
    g, r = np.polyfit(x, y, 1)
    if r < 0:
        g, r = max(0.0, float(x @ y / (x @ x))), 0.0
    if g < 0:
        g, r = 0.0, float(np.mean(y))
    return float(g), float(r)


def _block_spread(c, pat) -> tuple[np.ndarray, np.ndarray]:
    """Per BLOCK x BLOCK block of the mosaic ``c``: its mean level and its noise spread, the median of each
    sensel's leave-one-out residual against its same-colour neighbours (5 x 5, triangle-weighted) as a sigma."""

    c = np.asarray(c, dtype=np.float64)
    h, w = c.shape
    level = _block_stat(np.clip(c, 0.0, None), lambda t: t.mean(axis=-1))
    cmap = colour_map(pat, h, w)
    pred = np.zeros_like(c)
    for k in range(3):
        m = (cmap == k).astype(np.float64)
        s = _box3(_box3(c * m)) - 9.0 * c * m
        n = _box3(_box3(m)) - 9.0 * m
        pred += np.where(m > 0, s / np.maximum(n, 1e-9), 0.0)
    resid = np.abs(c - pred) * 1.4826 * 0.85  # MAD to sigma; 0.85 removes the neighbours' own share
    spread = _block_stat(resid, lambda t: np.median(t, axis=-1))
    return level, spread


def estimate_noise(c, pat) -> tuple[float, float]:
    """The sensor's (shot, read) model, variance = shot * level + read, fitted from the mosaic ``c`` alone: the
    quietest blocks' spread at each brightness (``_block_spread``, ``_noise_model``). Texture only adds to the
    spread, so on a detailed frame this reads high; on a smooth one it reads about 0.8 of the true sigma
    (eval/noise-profile-real-dngs-2026-11-16.md)."""

    return _noise_model(*_block_spread(c, pat))


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


def profile_ratio(c, pat, noise: tuple[float, float], *, spread: tuple[np.ndarray, np.ndarray] | None = None) -> float:
    """How many times the noise a profile ``noise`` (shot, read on ``c``'s scale) states exceeds what the mosaic
    shows: the largest, over brightness bins clear of the black clip, of the profile's sigma at the bin's median
    level over ESTIMATE_BIAS x the bin's 15th-percentile block spread, blocks that reach the frame's top value
    (clipped) left out. NaN when no bin qualifies."""

    c = np.asarray(c, dtype=np.float64)
    level, sp = _block_spread(c, pat) if spread is None else spread
    # Blocks holding a sensel at the frame's top value are clipped (white or the white-balanced plane's cap),
    # and their spread reads near 0: a real Huawei VTR-L09 frame's top bin read 4e-16 and the ratio 3.5e13.
    top = float(c.max())
    unclipped = (_block_stat(c, lambda t: t.max(axis=-1)) < top * (1.0 - 1e-9)).ravel()
    lv, sv = level.ravel()[unclipped], sp.ravel()[unclipped]
    shot, read = float(noise[0]), float(noise[1])
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
        sig = float(np.sqrt(max(shot * x + read, 0.0)))
        if q <= 0.0 or sig <= 0.0 or x < 3.0 * q:  # near black the clip at 0 hides noise
            continue
        r = sig / q
        best = r if not best == best or r > best else best
    return best


def guard_profile(c, pat, noise: tuple[float, float], *, cap: float = PROFILE_CAP) -> tuple[tuple[float, float], float]:
    """``noise`` checked against the mosaic: the (shot, read) to use and ``profile_ratio``. Past ``cap`` both terms
    are scaled by the same factor, so the profile keeps its shot/read shape and states ``cap`` x what the
    cleanest bin shows."""

    shot, read = float(noise[0]), float(noise[1])
    ratio = profile_ratio(c, pat, (shot, read))
    if not ratio == ratio or ratio <= cap:
        return (shot, read), ratio
    k = (cap / ratio) ** 2
    return (shot * k, read * k), ratio


def frame_measures(
    c, pat, bilinear: np.ndarray, directional_out: np.ndarray, *, noise: tuple[float, float] | None = None,
    blocks: bool = False,
) -> dict:
    """Noise and detail of a white-balanced sensel plane, from the mosaic and its two demosaics.

    ``noise``: the sensor's (shot, read) model, variance = shot * level + read on the plane's scale, when it
    is known (a DNG NoiseProfile, a camera profile); else it is fitted to each sensel's leave-one-out
    residual against its same-colour neighbours (5 x 5, triangle-weighted) in the quietest blocks, which
    over-reads the noise where texture fills every block. ``sigma``: the model's noise at the frame's median
    level. ``detail``: the RMS of directional minus bilinear. ``q``: the median over BLOCK x BLOCK blocks of
    block detail over the model's noise at that block's level (``q_blocks`` with ``blocks=True``).
    """

    c = np.asarray(c, dtype=np.float64)
    level = _block_stat(np.clip(c, 0.0, None), lambda t: t.mean(axis=-1))
    if noise is None:
        g, r = estimate_noise(c, pat)
    else:
        g, r = float(noise[0]), float(noise[1])
    diff = np.asarray(directional_out, dtype=np.float64) - np.asarray(bilinear, dtype=np.float64)
    det = _block_stat(diff, lambda t: np.sqrt(np.mean(t**2, axis=-1)))
    noise_b = np.sqrt(np.maximum(g * level + r, 1e-12))
    qb = det / noise_b
    out = {
        "sigma": float(np.sqrt(max(g * float(np.median(level)) + r, 0.0))),
        "detail": float(np.sqrt(np.mean(diff**2))),
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


def blend(bilinear: np.ndarray, directional_out: np.ndarray, q_blocks: np.ndarray, q_low: float, q_high: float) -> np.ndarray:
    """``a * directional + (1 - a) * bilinear``, ``a`` per block from its ``q`` (0 at ``q_low``, 1 at ``q_high``,
    linear between), spread to pixels by bilinear interpolation between block centres."""

    ab = np.clip((np.asarray(q_blocks, dtype=np.float64) - q_low) / max(q_high - q_low, 1e-9), 0.0, 1.0)
    h, w = bilinear.shape[:2]
    a = (_interp_matrix(h, ab.shape[0]) @ ab @ _interp_matrix(w, ab.shape[1]).T)[..., None]  # (h, w, 1)
    return a * directional_out + (1.0 - a) * bilinear


def noise_aware(
    c, pat, *, bilinear: np.ndarray | None = None, directional_out: np.ndarray | None = None,
    noise: tuple[float, float] | None = None, q_low: float | None = None, q_high: float | None = None,
    per_block: bool = True,
) -> np.ndarray:
    """Directional where it adds detail above the noise, bilinear where it adds mostly noise.

    Weights per block from ``frame_measures`` (``blend``) with the CFA's ``RAMPS`` unless ``q_low``/``q_high``
    are given; with ``per_block=False`` the frame's median ``q`` sets one weight for the whole frame (measured
    worse: a frame mixes smooth and detailed regions). Pass ``noise`` whenever it is known: estimated from
    the mosaic it reads texture as noise on detailed frames and lost up to 5 dB on held-out tiles. Without
    ``directional_out`` the CFA's own directional demosaic runs (X-Trans here, ``bayer_demosaic`` on a 2 x 2
    pattern) at its defaults. Both inputs
    keep each sensel's own value, so the blend does too.
    """

    ramp = RAMPS[6 if len(pat) == 36 else 2]
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
    return blend(bilinear, directional_out, m["q_blocks"], q_low, q_high)
