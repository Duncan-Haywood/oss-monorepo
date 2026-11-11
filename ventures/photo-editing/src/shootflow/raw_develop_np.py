"""Optional numpy engine for ``raw_develop``: the same arithmetic, vectorised.

``raw_develop`` is stdlib only and stays the reference. When numpy is
importable, ``develop`` hands the per-pixel work (levels, clamping, demosaic,
colour matrix, curve, crop and orientation) to this module, which repeats every
floating-point operation of the pure-Python path in the same order on IEEE
doubles. numpy's ``add`` and ``multiply`` ufuncs do not fuse into FMA, so each
output sample is the same 16-bit value, not merely close: the tests and
``tools/develop_engine_check.py`` compare the two engines byte for byte.

Where the order matters, it is kept:

* normalising a sensel: ``(v - (black + dv)) * scale`` on the fast path and
  ``(((v - black) - dv) - dh) * scale`` otherwise, as ``norm_row`` does;
* bilinear: each missing colour sums its same-colour neighbours in the
  3x3 offset order, starting from 0.0 (an out-of-image neighbour adds +0.0,
  which leaves any sum unchanged), then divides by the count;
* half size: the 2x2 block's samples are added in row order from 0.0;
* the colour matrix row is ``(m0*r + m1*g) + m2*b``.

Images narrower or shorter than 2 pixels go to the pure-Python path, which
reflects neighbours at a 1-pixel edge.
"""

from __future__ import annotations

from array import array

import numpy as np

# Rows demosaiced and encoded per band: bounds the float64 working set to a
# few hundred MB on a 50 MP frame instead of several GB.
_BAND_ROWS = 256


def available() -> bool:
    return True


def _normalised_plane(vals, rw, top, left, w, h, spp, lin, black, span, dh, dv, rr, rc, caplines):
    """Active-area samples, black-subtracted, scaled and clamped; and the clip count."""

    full = np.frombuffer(vals, dtype=np.uint16 if vals.typecode == "H" else np.uint32)
    plane = full.reshape(-1, rw * spp)[top : top + h, left * spp : (left + w) * spp]
    if lin:
        table = np.asarray(lin, dtype=np.float64)
        plane = table[np.minimum(plane, len(lin) - 1)]
    else:
        plane = plane.astype(np.float64)
    ys = np.arange(h)
    dvy = np.array([float(dv[y]) if y < len(dv) else 0.0 for y in range(h)], dtype=np.float64)
    if spp == 1 and rc == 1 and not dh:
        # off = black + dv per row, then (v - off) * scale (the pure fast path).
        black_rows = np.array([black[y % rr][0][0] for y in range(h)], dtype=np.float64)
        off = black_rows + dvy
        out = (plane - off[:, None]) * span[0][0][0]
    else:
        width = w * spp
        xs = np.arange(width)
        px, s = xs // spp, xs % spp
        dhx = np.array([float(dh[x]) if x < len(dh) else 0.0 for x in range(w)], dtype=np.float64)[px]
        # black and span per (row phase, sample column)
        bl = np.array([[black[r][c][si] for c, si in zip(px % rc, s)] for r in range(rr)], dtype=np.float64)
        sp = np.array([[span[r][c][si] for c, si in zip(px % rc, s)] for r in range(rr)], dtype=np.float64)
        rphase = ys % rr
        out = plane - bl[rphase]
        out -= dvy[:, None]
        out -= dhx[None, :]
        out *= sp[rphase]
    caps = np.array(caplines, dtype=np.float64)[ys % 2]
    clipped = int(np.count_nonzero(out >= caps))
    out = np.where(out < 0.0, 0.0, np.where(out > caps, caps, out))
    return out, clipped


def _encode(r, g, b, hi, m, curve, lut_size):
    """(rows, cols) channel planes, white-balanced, to uint16 (rows, cols, 3)."""

    r = np.where(r > hi, hi, np.where(r < 0, 0.0, r))
    g = np.where(g > hi, hi, np.where(g < 0, 0.0, g))
    b = np.where(b > hi, hi, np.where(b < 0, 0.0, b))
    lut = np.asarray(curve, dtype=np.uint16)
    out = np.empty(r.shape + (3,), dtype=np.uint16)
    for i in range(3):
        v = m[i][0] * r + m[i][1] * g
        v += m[i][2] * b
        idx = (v * (lut_size - 1) + 0.5).astype(np.int64)
        np.clip(idx, 0, lut_size - 1, out=idx)
        enc = lut[idx]
        enc[v <= 0] = 0
        enc[v >= 1] = 65535
        out[..., i] = enc
    return out


def _bilinear(norm, w, h, pat, mults, hi, m, curve, lut_size):
    pad = np.zeros((h + 2, w + 2), dtype=np.float64)
    pad[1:-1, 1:-1] = norm
    inside = np.zeros((h + 2, w + 2), dtype=np.int64)
    inside[1:-1, 1:-1] = 1
    out = np.empty((h, w, 3), dtype=np.uint16)
    for y0 in range(0, h, _BAND_ROWS):
        y1 = min(h, y0 + _BAND_ROWS)
        bh = y1 - y0
        chans = [np.empty((bh, w), dtype=np.float64) for _ in range(3)]
        for py in (0, 1):
            # band rows with this row parity
            ry0 = y0 + ((py - y0) % 2)
            if ry0 >= y1:
                continue
            for px in (0, 1):
                if px >= w:
                    continue
                own = pat[py * 2 + px]
                rows = slice(ry0, y1, 2)
                cols = slice(px, w, 2)
                lr, lc = slice(ry0 - y0, bh, 2), cols
                for colour in (0, 1, 2):
                    if colour == own:
                        chans[colour][lr, lc] = norm[rows, cols]
                        continue
                    offs = [
                        (dy, dx)
                        for dy in (-1, 0, 1)
                        for dx in (-1, 0, 1)
                        if pat[((py + dy) % 2) * 2 + (px + dx) % 2] == colour
                    ]
                    total = None
                    count = None
                    for dy, dx in offs:
                        prow = slice(ry0 + 1 + dy, y1 + 1 + dy, 2)
                        pcol = slice(px + 1 + dx, w + 1 + dx, 2)
                        v = pad[prow, pcol]
                        k = inside[prow, pcol]
                        if total is None:
                            total = 0.0 + v
                            count = k.copy()
                        else:
                            total = total + v
                            count = count + k
                    chans[colour][lr, lc] = total / count
        out[y0:y1] = _encode(chans[0] * mults[0], chans[1] * mults[1], chans[2] * mults[2], hi, m, curve, lut_size)
    return out


def _half(norm, w, h, pat, mults, hi, m, curve, lut_size):
    ow, oh = w // 2, h // 2
    acc = [np.zeros((oh, ow), dtype=np.float64) for _ in range(3)]
    cnt = [0, 0, 0]
    for dy in (0, 1):
        for dx in (0, 1):
            c = pat[dy * 2 + dx]
            acc[c] = acc[c] + norm[dy : 2 * oh : 2, dx : 2 * ow : 2]
            cnt[c] += 1
    return _encode(
        acc[0] / cnt[0] * mults[0], acc[1] / cnt[1] * mults[1], acc[2] / cnt[2] * mults[2], hi, m, curve, lut_size
    )


def render(
    *, vals, rw, top, left, w, h, spp, lin, black, span, dh, dv, rr, rc, caplines,
    linear_raw, pat, half, mults, hi, m, curve, lut_size,
):
    """Returns ``(pixels uint16 (oh, ow, 3), ow, oh, clipped)``."""

    norm, clipped = _normalised_plane(vals, rw, top, left, w, h, spp, lin, black, span, dh, dv, rr, rc, caplines)
    if linear_raw:
        img = norm.reshape(h, w, 3)
        out = _encode(img[..., 0] * mults[0], img[..., 1] * mults[1], img[..., 2] * mults[2], hi, m, curve, lut_size)
        return out, w, h, clipped
    if half:
        out = _half(norm, w, h, pat, mults, hi, m, curve, lut_size)
        return out, w // 2, h // 2, clipped
    return _bilinear(norm, w, h, pat, mults, hi, m, curve, lut_size), w, h, clipped


def crop(pixels, cx, cy, cw, ch):
    return pixels[cy : cy + ch, cx : cx + cw]


def orient(pixels, orientation):
    """The EXIF orientations ``raw_develop._orient`` applies, as array views."""

    if orientation == 2:
        return pixels[:, ::-1]
    if orientation == 3:
        return pixels[::-1, ::-1]
    if orientation == 4:
        return pixels[::-1, :]
    t = pixels.transpose(1, 0, 2)
    if orientation == 5:
        return t
    if orientation == 6:
        return t[:, ::-1]
    if orientation == 7:
        return t[::-1, ::-1]
    if orientation == 8:
        return t[::-1, :]
    return pixels


def to_array(pixels) -> array:
    out = array("H")
    out.frombytes(np.ascontiguousarray(pixels, dtype=np.uint16).tobytes())
    return out


def predict_rows(diffs, width, height, nf, predictor, initial, restart) -> array:
    """``raw_develop._predict_rows`` vectorised: the same samples, exactly.

    Lossless-JPEG predictors 1 (left) and 2 (above) with restart intervals on
    row boundaries. Differences are summed in 64-bit integers and reduced
    modulo 2**16 once at the end, which equals masking every step because both
    predictors only add (no sum of a 16-bit stream's differences over one
    image comes near 2**63).

    * Predictor 1: each row is a running sum along x that starts from its
      first column; the first column is a running sum down y of each row's
      first difference, restarted (from ``initial``) on every fresh row.
    * Predictor 2: a fresh row is ``initial`` plus a running sum along x; every
      other row adds its differences to the row above, so each column is a
      running sum down y, restarted on every fresh row.

    Returns an ``array('H')`` (row-major, components interleaved), which
    ``parse_raw`` copies into the raw image without a per-sample step;
    ``decode_lossless_jpeg`` turns it into a list for its other callers.
    """

    # Differences fit 32 bits (|d| <= 32768); reading them as int32 is the
    # cheaper conversion from a list, and the sums run in int64.
    d = np.fromiter(diffs, dtype=np.int32, count=width * height * nf).astype(np.int64)
    d = d.reshape(height, width, nf)
    fresh = np.zeros(height, dtype=bool)
    fresh[0] = True
    if restart:
        ys = np.arange(height)
        fresh |= (ys * width) % restart == 0
    if predictor == 1:
        col = d[:, 0, :].copy()
        col[fresh] += initial
        d[:, 0, :] = _segmented_cumsum(col, fresh)
        np.cumsum(d, axis=1, out=d)
    else:
        first = d[fresh]
        first[:, 0, :] += initial
        d[fresh] = np.cumsum(first, axis=1)
        d = _segmented_cumsum(d, fresh)
    return array("H", (d & 0xFFFF).astype(np.uint16).tobytes())


def _segmented_cumsum(a, starts):
    """Running sum down axis 0 that restarts at every row where ``starts`` is set."""

    total = np.cumsum(a, axis=0)
    seg = np.cumsum(starts) - 1
    begin = np.flatnonzero(starts)
    before = np.zeros((len(begin),) + a.shape[1:], dtype=a.dtype)
    before[1:] = total[begin[1:] - 1]
    total -= before[seg]
    return total
