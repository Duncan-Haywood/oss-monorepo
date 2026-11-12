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
* the colour matrix row is ``(m0*r + m1*g) + m2*b``;
* a profile's hue/saturation map and look table (``apply_look``) repeat
  ``dng_colour.HueSatTable.apply`` and ``ProfileLook.apply`` step for step;
  the sRGB-encoded value axis calls Python's own ``**`` per sample, since
  numpy's vectorised ``power`` may differ from it in the last bit.

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


def _normalised_plane(vals, rw, top, left, w, h, spp, lin, black, span, dh, dv, rr, rc, caplines, gain_maps=()):
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
    if gain_maps:
        from shootflow import dng_opcodes

        out = np.where(out < 0.0, 0.0, np.where(out > 1.0, 1.0, out))
        dng_opcodes.apply_plane(gain_maps, out, h, w, spp)
    caps = np.array(caplines, dtype=np.float64)[ys % 2]
    clipped = int(np.count_nonzero(out >= caps))
    out = np.where(out < 0.0, 0.0, np.where(out > caps, caps, out))
    return out, clipped


def _encode(r, g, b, hi, m, curve, lut_size, look):
    """(rows, cols) channel planes, white-balanced, to uint16 (rows, cols, 3)."""

    r = np.where(r > hi, hi, np.where(r < 0, 0.0, r))
    g = np.where(g > hi, hi, np.where(g < 0, 0.0, g))
    b = np.where(b > hi, hi, np.where(b < 0, 0.0, b))
    lut = np.asarray(curve, dtype=np.uint16)
    out = np.empty(r.shape + (3,), dtype=np.uint16)
    planes = []
    for i in range(3):
        v = m[i][0] * r + m[i][1] * g
        v += m[i][2] * b
        planes.append(v)
    if look is not None:
        planes = list(apply_look(look, *planes))
    for i in range(3):
        v = planes[i]
        idx = (v * (lut_size - 1) + 0.5).astype(np.int64)
        np.clip(idx, 0, lut_size - 1, out=idx)
        enc = lut[idx]
        enc[v <= 0] = 0
        enc[v >= 1] = 65535
        out[..., i] = enc
    return out


def _bilinear(norm, w, h, pat, mults, hi, m, curve, lut_size, look, sink=None):
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
        if sink is not None:
            for i in range(3):
                sink[y0:y1, :, i] = _clip(chans[i] * mults[i], hi)
            continue
        out[y0:y1] = _encode(chans[0] * mults[0], chans[1] * mults[1], chans[2] * mults[2], hi, m, curve, lut_size, look)
    return out


def _clip(v, hi):
    """``_encode``'s clip, alone (the warp runs on clipped linear values, as the pure path keeps them)."""

    return np.where(v > hi, hi, np.where(v < 0, 0.0, v))


def _encode_warped(img, warps, hi, m, curve, lut_size, look):
    """Warp a clipped linear (h, w, 3) image (``dng_opcodes.warp_planes``), then encode it band by band."""

    from shootflow import dng_opcodes

    img = dng_opcodes.warp_planes(warps, img)
    out = np.empty(img.shape, dtype=np.uint16)
    for y0 in range(0, img.shape[0], _BAND_ROWS):
        band = img[y0 : y0 + _BAND_ROWS]
        out[y0 : y0 + _BAND_ROWS] = _encode(band[..., 0], band[..., 1], band[..., 2], hi, m, curve, lut_size, look)
    return out


def _half(norm, w, h, pat, mults, hi, m, curve, lut_size, look):
    ow, oh = w // 2, h // 2
    acc = [np.zeros((oh, ow), dtype=np.float64) for _ in range(3)]
    cnt = [0, 0, 0]
    for dy in (0, 1):
        for dx in (0, 1):
            c = pat[dy * 2 + dx]
            acc[c] = acc[c] + norm[dy : 2 * oh : 2, dx : 2 * ow : 2]
            cnt[c] += 1
    return _encode(
        acc[0] / cnt[0] * mults[0], acc[1] / cnt[1] * mults[1], acc[2] / cnt[2] * mults[2], hi, m, curve, lut_size, look
    )


def render(
    *, vals, rw, top, left, w, h, spp, lin, black, span, dh, dv, rr, rc, caplines,
    linear_raw, pat, half, mults, hi, m, curve, lut_size, look=None, gain_maps=(), warps=(),
):
    """Returns ``(pixels uint16 (oh, ow, 3), ow, oh, clipped)``."""

    norm, clipped = _normalised_plane(vals, rw, top, left, w, h, spp, lin, black, span, dh, dv, rr, rc, caplines, gain_maps)
    if warps:
        # WarpRectilinear: keep the clipped, white-balanced linear image, warp it, then encode (raw_develop.develop).
        if linear_raw:
            img = norm.reshape(h, w, 3)
            lin = np.stack([_clip(img[..., i] * mults[i], hi) for i in range(3)], axis=-1)
            ow, oh = w, h
        elif half:
            ow, oh = w // 2, h // 2
            acc = [np.zeros((oh, ow), dtype=np.float64) for _ in range(3)]
            cnt = [0, 0, 0]
            for dy in (0, 1):
                for dx in (0, 1):
                    c = pat[dy * 2 + dx]
                    acc[c] = acc[c] + norm[dy : 2 * oh : 2, dx : 2 * ow : 2]
                    cnt[c] += 1
            lin = np.stack([_clip(acc[i] / cnt[i] * mults[i], hi) for i in range(3)], axis=-1)
        else:
            ow, oh = w, h
            lin = np.empty((h, w, 3), dtype=np.float64)
            _bilinear(norm, w, h, pat, mults, hi, m, curve, lut_size, look, sink=lin)
        del norm
        return _encode_warped(lin, warps, hi, m, curve, lut_size, look), ow, oh, clipped
    if linear_raw:
        img = norm.reshape(h, w, 3)
        out = _encode(img[..., 0] * mults[0], img[..., 1] * mults[1], img[..., 2] * mults[2], hi, m, curve, lut_size, look)
        return out, w, h, clipped
    if half:
        out = _half(norm, w, h, pat, mults, hi, m, curve, lut_size, look)
        return out, w // 2, h // 2, clipped
    return _bilinear(norm, w, h, pat, mults, hi, m, curve, lut_size, look), w, h, clipped


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
    if isinstance(diffs, array) and diffs.itemsize == 4:  # the native Huffman reader's array('i')
        d = np.frombuffer(diffs, dtype=np.int32, count=width * height * nf).astype(np.int64)
    else:
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


def _pin(v):
    return np.where(v < 0.0, 0.0, np.where(v > 1.0, 1.0, v))


_pow = np.frompyfunc(lambda x, e: float(x) ** e, 2, 1)


def _srgb_encode(v):
    lo = v <= 0.0031308
    hi = np.where(lo, 1.0, v)
    enc = 1.055 * _pow(hi, 1.0 / 2.4).astype(np.float64) - 0.055
    return np.where(lo, 12.92 * v, enc)


def _srgb_decode(v):
    lo = v <= 0.04045
    hi = np.where(lo, 1.0, v)
    dec = _pow((hi + 0.055) / 1.055, 2.4).astype(np.float64)
    return np.where(lo, v / 12.92, dec)


def _table_apply(table, r, g, b):
    """``dng_colour.HueSatTable.apply`` on arrays, the same operations in the same order."""

    mx = np.maximum(np.maximum(r, g), b)
    gap = mx - np.minimum(np.minimum(r, g), b)
    some = gap > 0.0
    safe = np.where(some, gap, 1.0)
    hr = (g - b) / safe
    hr = np.where(hr < 0.0, hr + 6.0, hr)
    hg = 2.0 + (b - r) / safe
    hb = 4.0 + (r - g) / safe
    h = np.where(r == mx, hr, np.where(g == mx, hg, hb))
    h = np.where(some, h, 0.0)
    s = np.where(some, gap / np.where(some, mx, 1.0), 0.0)
    v = mx
    ve = _srgb_encode(v) if table.srgb else v

    hd, sd, vd = table.dims
    d = np.asarray(table.data, dtype=np.float64)
    hs = h * (hd / 6.0) if hd >= 2 else np.zeros_like(h)
    ss = s * (sd - 1)
    hi0 = hs.astype(np.int64)
    si0 = np.minimum(ss.astype(np.int64), sd - 2)
    hi1 = hi0 + 1
    wrap = hi0 >= hd - 1
    hi0 = np.where(wrap, hd - 1, hi0)
    hi1 = np.where(wrap, 0, hi1)
    hf1 = hs - hi0
    sf1 = ss - si0
    hf0 = 1.0 - hf1
    sf0 = 1.0 - sf1
    e00 = (hi0 * sd + si0) * 3
    e01 = (hi1 * sd + si0) * 3
    out = []
    if vd < 2:
        for k in range(3):
            a0 = hf0 * d[e00 + k] + hf1 * d[e01 + k]
            a1 = hf0 * d[e00 + 3 + k] + hf1 * d[e01 + 3 + k]
            out.append(sf0 * a0 + sf1 * a1)
    else:
        vs = ve * (vd - 1)
        vi0 = np.minimum(vs.astype(np.int64), vd - 2)
        vf1 = vs - vi0
        vf0 = 1.0 - vf1
        step = hd * sd * 3
        e00 = e00 + vi0 * step
        e01 = e01 + vi0 * step
        e10 = e00 + step
        e11 = e01 + step
        for k in range(3):
            j = k + 3
            a0 = vf0 * (hf0 * d[e00 + k] + hf1 * d[e01 + k]) + vf1 * (hf0 * d[e10 + k] + hf1 * d[e11 + k])
            a1 = vf0 * (hf0 * d[e00 + j] + hf1 * d[e01 + j]) + vf1 * (hf0 * d[e10 + j] + hf1 * d[e11 + j])
            out.append(sf0 * a0 + sf1 * a1)
    shift, sat, val = out
    h = h + shift * (6.0 / 360.0)
    s = _pin(s * sat)
    if table.srgb:
        v = _srgb_decode(_pin(ve * val))
    else:
        v = _pin(v * val)

    # hsv_to_rgb
    h = np.where(h < 0.0, h + 6.0, h)
    h = np.where(h >= 6.0, h - 6.0, h)
    i = np.minimum(h.astype(np.int64), 5)
    f = h - i
    p = v * (1.0 - s)
    q = v * (1.0 - s * f)
    t = v * (1.0 - s * (1.0 - f))
    conds = [i == 0, i == 1, i == 2, i == 3, i == 4]
    ro = np.select(conds, [v, q, p, p, t], v)
    go = np.select(conds, [t, v, v, q, p], p)
    bo = np.select(conds, [p, p, t, v, v], q)
    grey = s <= 0.0
    return np.where(grey, v, ro), np.where(grey, v, go), np.where(grey, v, bo)


# dng_colour.rgb_tone's seven orderings, in its order of tests: for each, the
# (largest, middle, smallest) channel; the middle one is placed between the
# other two after the curve, except in case 3 (r >= g == b) where it takes the
# smallest one's value.
_TONE_ORDER = np.array([(0, 1, 2), (2, 0, 1), (0, 2, 1), (0, 2, 1), (1, 0, 2), (2, 1, 0), (1, 2, 0)])


def _tone_lookup(curve, x):
    """``dng_colour.ToneCurve.__call__`` on an array."""

    table = np.asarray(curve.table, dtype=np.float64)
    steps = len(table) - 2
    x = np.clip(x, 0.0, 1.0)
    y = x * steps
    i = y.astype(np.int64)
    np.clip(i, 0, steps, out=i)
    f = y - i
    t0 = table[i]
    return t0 + f * (table[i + 1] - t0)


def rgb_tone(curve, r, g, b):
    """``dng_colour.rgb_tone`` on arrays, case for case."""

    r, g, b = np.broadcast_arrays(np.asarray(r, dtype=np.float64), np.asarray(g, dtype=np.float64), np.asarray(b, dtype=np.float64))
    case = np.select(
        [
            (r >= g) & (g > b),
            (r >= g) & (b > r),
            (r >= g) & (b > g),
            (r >= g),
            (r >= b),
            (b > g),
        ],
        [0, 1, 2, 3, 4, 5],
        6,
    )
    chans = np.stack([r, g, b])
    order = _TONE_ORDER[case]  # (..., 3)
    hi_i, mid_i, lo_i = (np.moveaxis(order, -1, 0)[k][None] for k in range(3))
    hi = np.take_along_axis(chans, hi_i, 0)[0]
    mid = np.take_along_axis(chans, mid_i, 0)[0]
    lo = np.take_along_axis(chans, lo_i, 0)[0]
    big = _tone_lookup(curve, hi)
    small = _tone_lookup(curve, lo)
    span = hi - lo
    safe = np.where(span > 0, span, 1.0)
    placed = small + (big - small) * (mid - lo) / safe
    middle = np.where(case == 3, small, placed)
    out = np.empty_like(chans)
    np.put_along_axis(out, lo_i, small[None], 0)
    np.put_along_axis(out, mid_i, middle[None], 0)
    np.put_along_axis(out, hi_i, big[None], 0)
    return out[0], out[1], out[2]


def apply_look(look, r, g, b):
    """``dng_colour.ProfileLook.apply`` on arrays."""

    if look.hue_sat_map is not None:
        gain = look.gain
        r, g, b = _table_apply(look.hue_sat_map, _pin(r / gain), _pin(g / gain), _pin(b / gain))
        r, g, b = r * gain, g * gain, b * gain
    r, g, b = _pin(r), _pin(g), _pin(b)
    if look.look_table is not None:
        r, g, b = _table_apply(look.look_table, r, g, b)
    if look.tone is not None:
        r, g, b = rgb_tone(look.tone, r, g, b)
    m = look.out
    return (
        m[0][0] * r + m[0][1] * g + m[0][2] * b,
        m[1][0] * r + m[1][1] * g + m[1][2] * b,
        m[2][0] * r + m[2][1] * g + m[2][2] * b,
    )
