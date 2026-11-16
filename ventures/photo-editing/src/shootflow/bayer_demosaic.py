"""A directional demosaic for 2x2 Bayer CFAs (numpy).

The bilinear demosaic (``raw_develop._bilinear``, ``raw_develop_np._bilinear``) averages each missing
colour over the 3x3 window. On a Bayer sensor that is soft, and across an edge it mixes both sides,
which shows as zipper patterns and false colour along every sharp line. This module builds full
colour from published ideas, in this repository's own code (not taken from dcraw, LibRaw or
RawTherapee):

1. **Two greens per red or blue sensel** (after Hamilton and Adams, 1997): along the row, the mean of
   the two neighbouring greens plus ``laplace`` times the sensel's own second difference (its colour,
   two sensels either side), which carries the sensel's detail into green; the same down the column.
   Hamilton and Adams use a quarter, which is exact when the colour difference is locally linear; a
   Taylor expansion of a smooth green gives an eighth. The default, 3/16, sits between them: the
   quarter overshoots on fine, aliased texture (luma 0.8-1 dB behind bilinear on the A7 III and
   K-1 II), measured in ``eval/bayer-laplace-weight-2026-11-15.md``.
2. **Which way the edge runs** (the colour-difference test Menon, Andriani and Calvagno published in
   2007 for their directional filtering): along each row, the colour difference green minus
   red-or-blue is formed at every sensel (at a green sensel from the missing colour's own
   row estimate), and its change from sensel to sensel is summed over a window. Colour differences
   are smooth along an edge and jump across one, so the direction whose sum is smaller is the one the
   edge runs in. The two greens are blended with weights ``(D_other / (D_h + D_v))`` raised to
   ``power`` (a near tie blends, a clear edge picks), not flipped.
3. **Red and blue** (``rb``): at a blue sensel, red is green plus the colour difference red minus
   green of its four diagonal reds, weighted by how smooth each diagonal is (the same idea on the
   diagonals); then at each green sensel, red and blue are green plus the colour difference of the
   four nearest sensels of that colour (two real, two just filled), weighted by step 2's row and
   column weights. ``rb="simple"`` averages instead, without weights.
4. **Optional clean-up** (``median_passes``): a 3x3 median of R - G and B - G, rebuilt around each
   sensel's own value, which removes isolated false colour.

Every sensel keeps its own value in its own colour. ``directional`` returns (h, w, 3) linear values on
the scale of ``c`` (the white-balanced sensel plane, so the three colours are comparable); the caller
clips and encodes them as it does the bilinear result. The frame is processed in row bands with an
overlap that covers every step's reach, so the output does not depend on the band height. Measured
against known truth and LibRaw in ``eval/bayer-directional-demosaic-2026-11-15.md``.
"""

from __future__ import annotations

import numpy as np

WORK = np.float32
_PAD = 8  # covers the reach of every step: 2 (green) + window radius + 2 (red/blue) + 1 (median)
# laplace="adaptive": (lowest weight, highest weight, window radius), picked on the tuning truths
ADAPTIVE_LAPLACE = (0.125, 0.25, 1)
# laplace="learned": a linear model on ``_laplace_features`` (weights in feature order, intercept first),
# fitted by ``tools/bayer_laplace_train.py`` on training frames only, clipped to [1/8, 1/4]
# (eval/bayer-learned-laplace-2026-11-16.md): intercept, 8 features, 36 pairwise products; 40 frames, ridge 1e-5.
LEARNED_LAPLACE: tuple[float, ...] = (
    -0.470135, 2.426672, -0.349805, 0.265092, 0.329468, 0.519358,
    0.118583, 1.447913, -0.203315, -2.459294, -0.133075, -0.536397,
    -1.645395, -0.501441, 3.499013, -2.507955, 0.505209, -0.885136,
    -0.519663, 0.005069, 1.126664, -0.044066, 1.131293, 1.336742,
    0.181405, -0.232095, -0.77143, -0.012986, 0.742217, -0.785529,
    -0.073097, 0.202419, -0.150408, 0.065233, 0.145409, -0.495956,
    -0.128872, -1.395797, 0.684734, -0.572733, 0.208586, -0.39256,
    -1.202942, -1.170081, 0.473836,
)
_FEATURE_REACH = 5  # sensels beyond the green step's own reach that _laplace_features reads


def _phase(pat) -> tuple[int, ...]:
    if len(pat) != 4:
        raise ValueError("the Bayer demosaic needs a 2x2 pattern")
    p = tuple(int(v) for v in pat)
    if not ((p[1] == p[2] == 1 and {p[0], p[3]} == {0, 2}) or (p[0] == p[3] == 1 and {p[1], p[2]} == {0, 2})):
        raise ValueError(f"not a Bayer pattern (two greens on a diagonal, one red, one blue): {p}")
    return p


def _box(a: np.ndarray, r: int) -> np.ndarray:
    """Sum over a (2r+1) square window, same shape (edge values repeated; the pad hides the edges). Summed
    as shifted copies, not a running total, so each output depends only on its own window and the band
    height cannot change a bit of it."""

    if r == 0:
        return a
    rows = a.copy()
    for dx in range(1, r + 1):
        rows += _sh(a, 0, -dx) + _sh(a, 0, dx)
    out = rows.copy()
    for dy in range(1, r + 1):
        out += _sh(rows, -dy, 0) + _sh(rows, dy, 0)
    return out


def _sh(a: np.ndarray, dy: int, dx: int) -> np.ndarray:
    """a shifted so that out[y, x] = a[y + dy, x + dx] (edge values repeated), by slice copies."""

    h, w = a.shape
    out = np.empty_like(a)
    ys, yd = (slice(dy, h), slice(0, h - dy)) if dy >= 0 else (slice(0, h + dy), slice(-dy, h))
    xs, xd = (slice(dx, w), slice(0, w - dx)) if dx >= 0 else (slice(0, w + dx), slice(-dx, w))
    if abs(dy) >= h or abs(dx) >= w:
        return np.pad(a, max(abs(dy), abs(dx)), mode="edge")[
            max(abs(dy), abs(dx)) + dy : max(abs(dy), abs(dx)) + dy + h,
            max(abs(dy), abs(dx)) + dx : max(abs(dy), abs(dx)) + dx + w,
        ]
    out[yd, xd] = a[ys, xs]
    if dx > 0:
        out[yd, w - dx :] = a[ys, w - 1 : w]
    elif dx < 0:
        out[yd, :-dx] = a[ys, 0:1]
    if dy > 0:
        out[h - dy :, :] = out[h - dy - 1 : h - dy, :]
    elif dy < 0:
        out[:-dy, :] = out[-dy : -dy + 1, :]
    return out


def _median9(a: np.ndarray) -> np.ndarray:
    stack = np.stack([_sh(a, dy, dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1)])
    return np.median(stack, axis=0).astype(a.dtype)


def _laplace_map(c, sign, mean_h, lap_h, mean_v, lap_v, adaptive, eps) -> np.ndarray:
    """Per-sensel Laplacian weight: the least-squares weight that makes the colour difference closest to
    linear along both lines over a (2r+1) square window, clipped to [lo, hi].

    With weight w the row's colour difference is ``A - w B`` (A = sign (c - mean of the two neighbours),
    B = sign x the sensel's second difference). Its own second difference along the row is
    ``d2A - w d2B``; the w minimising the summed square over the window, rows and columns pooled, is
    sum(d2A d2B) / sum(d2B^2). Hamilton and Adams' quarter is exact where the colour difference is
    linear, so this asks the data, sensel by sensel, how much of the sensel's own detail the green should
    carry (``eval/bayer-adaptive-laplace-2026-11-16.md``)."""

    lo, hi, r = adaptive
    num = np.zeros_like(c)
    den = np.zeros_like(c)
    for mean, lap, (dy, dx) in ((mean_h, lap_h, (0, 1)), (mean_v, lap_v, (1, 0))):
        a = sign * (c - mean)
        b = sign * lap
        d2a = 2 * a - _sh(a, dy, dx) - _sh(a, -dy, -dx)
        d2b = 2 * b - _sh(b, dy, dx) - _sh(b, -dy, -dx)
        num += d2a * d2b
        den += d2b * d2b
    w = _box(num, r) / (_box(den, r) + eps * eps)
    return np.clip(w, lo, hi).astype(WORK)


def _laplace_features(c, sign, mean_h, lap_h, mean_v, lap_v, eps) -> list[np.ndarray]:
    """Scale-free local measures of how much of the sensel's own detail its green should carry. Every one is
    a ratio of sums over a small window, so exposure and white balance do not move it. In order:

    0. the least-squares weight of ``_laplace_map`` (3 x 3 window), clipped to [0, 1/2];
    1. curvature against slope: the sensel's own second differences against the first differences of its
       line's neighbours (large where the detail is finer than the sensel spacing can follow);
    2. green disagreement: the row and column means of the greens against each other, over the curvature;
    3. edge confidence: how clearly the colour difference picks a direction (0 a tie, 1 a clean edge);
    4. colour-difference size against level (how far the colours are from grey);
    5. contrast at the finest scale: the summed second differences over the local level;
    6-7. features 1 and 2 over a 5 x 5 window (texture on a wider patch).

    Each ratio r enters as r / (1 + r), so a feature stays in [0, 1)."""

    def sq(r):
        return r / (1 + r)

    e = eps
    num = np.zeros_like(c)
    den = np.zeros_like(c)
    for mean, lap, (dy, dx) in ((mean_h, lap_h, (0, 1)), (mean_v, lap_v, (1, 0))):
        a = sign * (c - mean)
        b = sign * lap
        d2a = 2 * a - _sh(a, dy, dx) - _sh(a, -dy, -dx)
        d2b = 2 * b - _sh(b, dy, dx) - _sh(b, -dy, -dx)
        num += d2a * d2b
        den += d2b * d2b
    lsq = np.clip(_box(num, 1) / (_box(den, 1) + e * e), 0.0, 0.5)
    curv = np.abs(lap_h) + np.abs(lap_v)
    slope = np.abs(_sh(c, 0, 1) - _sh(c, 0, -1)) + np.abs(_sh(c, 1, 0) - _sh(c, -1, 0))
    disagree = np.abs(mean_h - mean_v)
    est_h, est_v = mean_h + 0.1875 * lap_h, mean_v + 0.1875 * lap_v
    dh, dv = sign * (c - est_h), sign * (c - est_v)
    gh = _box(np.abs(dh - _sh(dh, 0, 1)) + np.abs(dh - _sh(dh, 0, -1)), 2)
    gv = _box(np.abs(dv - _sh(dv, 1, 0)) + np.abs(dv - _sh(dv, -1, 0)), 2)
    level = _box(np.abs(c) + np.abs(mean_h) + np.abs(mean_v), 1) + e
    feats = [
        lsq,
        sq(_box(curv, 1) / (_box(slope, 1) + e)),
        sq(_box(disagree, 1) / (_box(curv, 1) * 0.25 + e)),
        np.abs(gh - gv) / (gh + gv + e),
        sq(_box(np.abs(dh) + np.abs(dv), 1) / level),
        sq(4 * _box(curv, 1) / level),
        sq(_box(curv, 2) / (_box(slope, 2) + e)),
        sq(_box(disagree, 2) / (_box(curv, 2) * 0.25 + e)),
    ]
    return [f.astype(WORK) for f in feats]


def _laplace_learned(feats, coef) -> np.ndarray:
    """w = intercept + linear terms (+ every pairwise product f_i f_j, i <= j, when ``coef`` is that long),
    clipped to [1/8, 1/4]. Term order matches ``tools/bayer_laplace_train.design``."""

    k = len(feats)
    if len(coef) not in (1 + k, 1 + k + k * (k + 1) // 2):
        raise ValueError(f"{len(coef)} learned weights do not fit {k} features")
    w = np.full_like(feats[0], coef[0])
    for c, f in zip(coef[1 : 1 + k], feats):
        w += WORK(c) * f
    if len(coef) > 1 + k:
        terms = iter(coef[1 + k :])
        for i in range(k):
            for j in range(i, k):
                w += WORK(next(terms)) * (feats[i] * feats[j])
    return np.clip(w, 0.125, 0.25).astype(WORK)


def laplace_features(c: np.ndarray, pat) -> np.ndarray:
    """(k, h, w) stack of ``_laplace_features`` over the whole plane ``c`` (for fitting the learned weight)."""

    p = _phase(pat)
    c = np.asarray(c, dtype=WORK)
    pad = _PAD + _FEATURE_REACH
    pad += pad % 2
    big = np.pad(c, pad, mode="reflect")
    H, W = big.shape
    yy, xx = (np.arange(H) - pad) % 2, (np.arange(W) - pad) % 2
    cm = np.asarray(p, dtype=np.int8).reshape(2, 2)[yy[:, None], xx[None, :]]
    eps = WORK(1e-6 * max(float(np.max(np.abs(c))), 1e-6))
    sign = np.where(cm == 1, WORK(1), WORK(-1))
    left, right, up, down = _sh(big, 0, -1), _sh(big, 0, 1), _sh(big, -1, 0), _sh(big, 1, 0)
    mean_h, lap_h = (left + right) / 2, 2 * big - _sh(big, 0, -2) - _sh(big, 0, 2)
    mean_v, lap_v = (up + down) / 2, 2 * big - _sh(big, -2, 0) - _sh(big, 2, 0)
    f = _laplace_features(big, sign, mean_h, lap_h, mean_v, lap_v, eps)
    h, w = c.shape
    return np.stack([a[pad : pad + h, pad : pad + w] for a in f])


def _piece(c: np.ndarray, masks, window: int, power: float, rb: str, median_passes: int, eps,
           laplace: float = 0.1875, adaptive=None, learned=None) -> np.ndarray:
    is_r, is_g, is_b = masks
    h, w = c.shape

    left, right = _sh(c, 0, -1), _sh(c, 0, 1)
    up, down = _sh(c, -1, 0), _sh(c, 1, 0)
    left2, right2 = _sh(c, 0, -2), _sh(c, 0, 2)
    up2, down2 = _sh(c, -2, 0), _sh(c, 2, 0)

    # Step 1: row and column estimates of the missing colour at every sensel. At a red or blue sensel this
    # is green; at a green sensel it is the row's (or column's) other colour. Both carry the sensel's own
    # second difference.
    sign = np.where(is_g, WORK(1), WORK(-1))
    mean_h, lap_h = (left + right) / 2, 2 * c - left2 - right2
    mean_v, lap_v = (up + down) / 2, 2 * c - up2 - down2
    lap: np.floating | np.ndarray
    if learned is not None:
        lap = _laplace_learned(_laplace_features(c, sign, mean_h, lap_h, mean_v, lap_v, eps), learned)
    elif adaptive is None:
        lap = WORK(laplace)
    else:
        lap = _laplace_map(c, sign, mean_h, lap_h, mean_v, lap_v, adaptive, eps)
    est_h = mean_h + lap_h * lap
    est_v = mean_v + lap_v * lap

    # Step 2: colour difference green minus other along each line, and how fast it changes.
    dh = sign * (c - est_h)  # = G - other everywhere on the row
    dv = sign * (c - est_v)
    grad_h = np.abs(dh - _sh(dh, 0, 1)) + np.abs(dh - _sh(dh, 0, -1))
    grad_v = np.abs(dv - _sh(dv, 1, 0)) + np.abs(dv - _sh(dv, -1, 0))
    sh_, sv_ = _box(grad_h, window) + eps, _box(grad_v, window) + eps
    wh = (sv_ / (sh_ + sv_)) ** power
    wv = (sh_ / (sh_ + sv_)) ** power
    norm = wh + wv
    wh, wv = wh / norm, wv / norm

    green = np.where(is_g, c, wh * est_h + wv * est_v).astype(WORK)

    # Step 3: red and blue as colour differences from green.
    out = np.empty((h, w, 3), dtype=WORK)
    out[..., 1] = green
    for own, other in ((is_r, is_b), (is_b, is_r)):
        k = np.where(own, c - green, 0).astype(WORK)  # own colour minus green, at own sites only
        # at the other colour's sites: the four diagonals
        diag = [(-1, -1), (-1, 1), (1, -1), (1, 1)]
        if rb == "simple":
            at_other = sum(_sh(k, dy, dx) for dy, dx in diag) / 4
        else:
            # weight each diagonal by how smooth the raw is along it (sensel to its far-side twin)
            wsum = np.zeros_like(c)
            acc = np.zeros_like(c)
            for dy, dx in diag:
                g = (
                    np.abs(_sh(c, dy, dx) - _sh(c, -dy, -dx))
                    + np.abs(c - _sh(c, 2 * dy, 2 * dx))
                    + np.abs(_sh(green, dy, dx) - green)
                )
                wd = 1 / (_box(g, 1) + eps) ** 2
                acc += wd * _sh(k, dy, dx)
                wsum += wd
            at_other = acc / wsum
        k = np.where(other, at_other, k).astype(WORK)
        # at green sites: the four nearest of this colour (two real, two just filled)
        kh = (_sh(k, 0, -1) + _sh(k, 0, 1)) / 2
        kv = (_sh(k, -1, 0) + _sh(k, 1, 0)) / 2
        at_green = (kh + kv) / 2 if rb == "simple" else wh * kh + wv * kv
        k = np.where(is_g, at_green, k)
        chan = 0 if own is is_r else 2
        out[..., chan] = np.where(own, c, green + k)

    for _ in range(median_passes):
        g = out[..., 1]
        rg = _median9(out[..., 0] - g)
        bg = _median9(out[..., 2] - g)
        # green at red and blue sensels from the sensel's own value and the cleaned difference
        g2 = np.where(is_r, c - rg, np.where(is_b, c - bg, c))
        out[..., 0] = np.where(is_r, c, g2 + rg)
        out[..., 2] = np.where(is_b, c, g2 + bg)
        out[..., 1] = g2
    return out


def directional(
    c: np.ndarray,
    pat,
    *,
    window: int = 2,
    power: float = 2.0,
    laplace: float | str = 0.1875,
    rb: str = "weighted",
    median_passes: int = 0,
    band: int | None = None,
    threads: int | None = None,
    native: bool | None = None,
) -> np.ndarray:
    """Demosaic the (h, w) Bayer plane ``c`` (pattern ``pat``: 4 colours, 0 R, 1 G, 2 B, row-major over
    the top-left 2x2) to (h, w, 3) float32. See the module docstring for the steps and options;
    ``laplace=0.25`` is the 2026-11-15 first version (Hamilton and Adams' weight). ``laplace="adaptive"``
    picks the weight per sensel in [1/8, 1/4] (``_laplace_map``; numpy only, opt-in: it gains on the
    D810 and the sheet but loses luma on the A7 III and K-1 II, ``eval/bayer-adaptive-laplace-2026-11-16.md``).

    ``native``: None (default) runs the C path of ``shootflow.bayer_native`` when it builds and
    ``median_passes`` is 0, else numpy; True requires it (RuntimeError if unavailable); False is numpy
    only. The two agree to float32 rounding (``eval/bayer-native-2026-11-15.md``)."""

    if rb not in ("weighted", "simple"):
        raise ValueError(f"unknown rb {rb!r} (weighted or simple)")
    adaptive = learned = None
    if isinstance(laplace, str):
        if laplace == "adaptive":
            adaptive = ADAPTIVE_LAPLACE
        elif laplace == "learned":
            learned = LEARNED_LAPLACE
        else:
            raise ValueError(f"unknown laplace {laplace!r} (a number, 'adaptive' or 'learned')")
        laplace = 0.1875
    elif not isinstance(laplace, (int, float)):
        learned, laplace = tuple(float(v) for v in laplace), 0.1875  # a model's weights (fitting runs)
    p = _phase(pat)
    c = np.asarray(c, dtype=WORK)
    h, w = c.shape
    if h < 2 or w < 2:
        raise ValueError("the Bayer demosaic needs at least 2 x 2 sensels")
    pad = _PAD + window
    if adaptive is not None:
        pad += adaptive[2] + 1  # the weight map reads one sensel further, plus its window
    if learned is not None:
        if not learned:
            raise RuntimeError("no learned Laplacian weights are fitted")
        pad += _FEATURE_REACH
    pad += pad % 2  # an even pad keeps the CFA phase of the padded plane
    # Mirror padding about the edge sensel (offset -k reads +k, repeated for small frames) keeps every
    # padded sensel's colour equal to the CFA's colour at that position.
    big = np.pad(c, pad, mode="reflect")
    H, W = big.shape
    yy = (np.arange(H) - pad) % 2
    xx = (np.arange(W) - pad) % 2
    colours = np.asarray(p, dtype=np.int8).reshape(2, 2)[yy[:, None], xx[None, :]]
    # one floor for the whole frame (not per band), so the band height never changes the output
    eps = WORK(1e-6 * max(float(np.max(np.abs(c))), 1e-6))
    out = np.empty((h, w, 3), dtype=WORK)
    use_c = False
    if native is not False and median_passes == 0 and adaptive is None:
        from shootflow import bayer_native

        use_c = 0 <= int(window) <= 12 and bayer_native.available()
    if native is True and not use_c:
        raise RuntimeError("the native Bayer demosaic is unavailable (no C compiler, SHOOTFLOW_NATIVE=0, median_passes > 0, laplace='adaptive', or window over 12)")
    # The C path keeps 17 band-sized float32 planes; 128 rows keep that near 60 MB per thread at 6000 columns.
    band = max(int(band if band is not None else (128 if use_c else 512)), 16)

    def run(y0: int) -> None:
        y1 = min(h, y0 + band)
        a, b = y0, y1 + 2 * pad  # rows of `big` covering [y0 - pad, y1 + pad)
        cm = colours[a:b]
        if use_c:
            from shootflow import bayer_native

            bayer_native.piece(big[a:b], cm, window, power, rb == "simple", float(eps), pad, pad, out[y0:y1], laplace, learned)
            return
        masks = (cm == 0, cm == 1, cm == 2)
        piece = _piece(big[a:b], masks, window, power, rb, median_passes, eps, laplace, adaptive, learned)
        out[y0:y1] = piece[pad : pad + (y1 - y0), pad : pad + w]

    # Bands are independent (each reads its own overlap, writes its own rows), and numpy releases the GIL in
    # its array operations, so they run on a thread pool; neither the band height nor the thread count
    # changes a bit of the output. Threads: ``threads``, else ``SHOOTFLOW_THREADS``, else every CPU.
    starts = list(range(0, h, band))
    if threads is None:
        import os

        env = os.environ.get("SHOOTFLOW_THREADS", "")
        threads = int(env) if env.isdigit() and int(env) > 0 else (os.cpu_count() or 1)
    n = max(1, min(int(threads), len(starts)))
    if n == 1:
        for y0 in starts:
            run(y0)
    else:
        from concurrent.futures import ThreadPoolExecutor

        with ThreadPoolExecutor(max_workers=n) as ex:
            list(ex.map(run, starts))
    return out
