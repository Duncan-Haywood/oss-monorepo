"""A C-RAW (CRX wavelet) encoder for sensors stored in several tiles: test and check helper.

Used by ``tests/test_cr3_wavelet.py`` (small synthetic sensors) and ``tools/cr3_craw_tiled_libraw_check.py``
(a real EOS R8 C-RAW re-stored as tiles and read back by LibRaw). Not part of the reader.

Each tile is coded as its own 5/3 decomposition, its first sample even at every level, computed from the
real sensels around it (so the samples at its seams are what a decomposition across the seam gives), and
its subbands are cut to the tile's own coefficients plus the edge coefficients a neighbour lends
(``cr3_wavelet.tile_geometry``, LibRaw's ``exCoefNumTbl``). Coefficients are found by lifting over the tile
and a margin of real sensels around it, keeping only values every input of which was real: no edge is
extended except the sensor's own edges, where the decoder extends symmetrically too. If a band window
needs a value the margin could not give, ``MarginError`` says so instead of writing a wrong file.
"""

from __future__ import annotations

import struct

from shootflow import cr3_wavelet as cw
from test_cr3 import _Writer, _zig, encode_band


class MarginError(ValueError):
    pass


def forward_1d(s: list, a: int, true_left: bool, true_right: bool):
    """5/3 analysis of ``s`` (local indices ``a`` .. ``a + len(s) - 1``), keeping only fully known outputs.

    ``true_left`` (then ``a`` is 0) and ``true_right``: that end is the sensor's edge, extended symmetrically.
    Returns ``(low, low_start, high, high_start)``: low[j] is local index ``low_start + j`` (position
    2 x index), high[j] index ``high_start + j`` (position 2 x index + 1)."""

    b = a + len(s)

    def get(i):
        return s[i - a]

    hs = 0 if true_left else -((-a) // 2)
    high = []
    i = hs
    while 2 * i + 1 <= b - 1:
        if 2 * i + 2 <= b - 1:
            r = get(2 * i + 2)
        elif true_right:
            r = get(2 * i)
        else:
            break
        high.append(get(2 * i + 1) - ((get(2 * i) + r) >> 1))
        i += 1
    he = hs + len(high)
    ls = 0 if true_left else max(hs + 1, -((-a) // 2))
    low = []
    i = ls
    while 2 * i <= b - 1:
        if i < he:
            hr = high[i - hs]
        elif true_right and 2 * i + 1 >= b and i - 1 >= hs:
            hr = high[i - 1 - hs]
        else:
            break
        hl = high[i - 1 - hs] if i - 1 >= hs else hr  # i == 0 at the sensor's left edge: symmetric
        low.append(get(2 * i) + ((hl + hr + 2) >> 2))
        i += 1
    return low, ls, high, hs


def _vec(rows: list[list[int]]):
    return [list(c) for c in zip(*rows)]


def forward_2d(rows: list[list[int]], ax: int, ay: int, edges: tuple[bool, bool, bool, bool]):
    """One level over a region (rows, local origin ``ax``, ``ay``): columns, then rows. ``edges`` is
    (left, right, top, bottom) sensor edges. Returns {name: (lines, x0, y0)} for LL, HL, LH, HH."""

    left, right, top, bottom = edges
    lo_cols, hi_cols = [], []
    ly0 = hy0 = 0
    for col in _vec(rows):
        lo, ly0, hi, hy0 = forward_1d(col, ay, top, bottom)
        lo_cols.append(lo)
        hi_cols.append(hi)
    lo_rows, hi_rows = _vec(lo_cols), _vec(hi_cols)
    out = {}
    for name_lo, name_hi, src, y0 in (("LL", "HL", lo_rows, ly0), ("LH", "HH", hi_rows, hy0)):
        lows, highs = [], []
        lx0 = hx0 = 0
        for r in src:
            lo, lx0, hi, hx0 = forward_1d(r, ax, left, right)
            lows.append(lo)
            highs.append(hi)
        out[name_lo] = (lows, lx0, y0)
        out[name_hi] = (highs, hx0, y0)
    return out


def tile_bands(region: list[list[int]], ax: int, ay: int, tw: int, th: int, levels: int, flags: int) -> list[list[list[int]]]:
    """A tile's subbands in coded order, cut to ``cw.tile_geometry``. ``region`` holds the tile (local origin 0, 0)
    and the margin of real sensels around it, starting at local (ax, ay)."""

    edges = (not flags & cw.LEFT, not flags & cw.RIGHT, not flags & cw.TOP, not flags & cw.BOTTOM)
    per_level = []  # finest first
    sig, sx, sy = region, ax, ay
    for _ in range(levels):
        bands = forward_2d(sig, sx, sy, edges)
        per_level.append(bands)
        sig, sx, sy = bands["LL"]
    geometry = cw.tile_geometry(tw, th, levels, flags)
    picked = [("LL", per_level[-1])]
    for bands in reversed(per_level):
        picked.extend((name, bands) for name in ("HL", "LH", "HH"))
    out = []
    for (name, bands), (w, h, cs, _ce, rs, _re) in zip(picked, geometry):
        lines, x0, y0 = bands[name]
        xs, ys = -cs - x0, -rs - y0
        if xs < 0 or ys < 0 or ys + h > len(lines) or not lines or xs + w > len(lines[0]):
            raise MarginError(f"{name} band needs coefficients outside the known margin")
        out.append([line[xs : xs + w] for line in lines[ys : ys + h]])
    return out


def encode_qp(grid: list[list[int]]) -> bytes:
    """The mirror of ``cr3_wavelet.qp_grid``: ``grid`` rows of stored QP values (decoded value + 4)."""

    w = _Writer()
    k = 0

    def emit(code, k):
        q = code >> k
        if q < 23:
            w.put(0, q)
            w.put(1, 1)
            w.put(code & ((1 << k) - 1), k)
        else:
            if code >= 256:
                raise ValueError("a QP residual past the escape must fit 8 bits")
            w.put(0, 23)
            w.put(1, 1)
            w.put(code, 8)

    qw = len(grid[0])
    prev: list[int] = []
    for r, row in enumerate(grid):
        vals = [v - 4 for v in row]
        cur = [0] * (qw + 2)
        if r == 0:
            for i in range(qw):
                code = _zig(vals[i] - cur[i])
                emit(code, k)
                cur[i + 1] = vals[i]
                k = cw._next_k(k, code, 7)
        else:
            cur[0] = prev[1]
            for i in range(qw):
                left, top, top_left = cur[i], prev[i + 1], prev[i]
                dh = top - top_left
                dv = top_left - left
                pick = (((dv < 0) ^ (dh < 0)) << 1) + ((left < top) ^ (dh < 0))
                value = (left + dh, left + dh, left, top)[pick]
                code = _zig(vals[i] - value)
                emit(code, k)
                cur[i + 1] = vals[i]
                if i < qw - 1:
                    k = cw._next_k(k, (code + 2 * abs(prev[i + 2] - top)) >> 1, 7)
                else:
                    k = cw._next_k(k, code, 7)
        cur[qw + 1] = cur[qw] + 1
        prev = cur
    return w.data()


def quantise(bands: list[list[list[int]]], tw: int, th: int, levels: int, flags: int, steps: list[list[list[int]]],
             mults: list[tuple[int, int]]) -> list[list[list[int]]]:
    """Divide each coefficient by the step the decoder will multiply it by (nearest integer). ``mults``:
    (multiplier, base) per subband in coded order."""

    out = []
    for b, (lines, geo) in enumerate(zip(bands, cw.tile_geometry(tw, th, levels, flags))):
        band = cw.Subband(b, 0, 0, *mults[b])
        band.width, band.height, band.col_start, band.col_end, band.row_start, band.row_end = geo
        band.level = 0 if b == 0 else (b - 1) // 3
        band.shift = 3 - levels + (0 if b == 0 else band.level)
        table = steps[band.level]
        q_lines = []
        for r, line in enumerate(lines):
            row = table[cw.step_row(band, r, len(table))]
            q_line = []
            for i, v in enumerate(line):
                q = band.base + ((row[cw.step_col(band, i, len(row))] * band.mult) >> 3)
                q = 1 if q < 1 else min(q, cw.STEP_MAX)
                q_line.append(int(round(v / q)) if q > 1 else v)
            q_lines.append(q_line)
        out.append(q_lines)
    return out


def encode_tile_plane(job) -> list[bytes]:
    """(region, ax, ay, tw, th, levels, flags, qp_grid or None, mults) -> each subband's bytes."""

    from test_cr3_wavelet import encode_highpass

    region, ax, ay, tw, th, levels, flags, grid, mults = job
    bands = tile_bands(region, ax, ay, tw, th, levels, flags)
    if grid is not None:
        bands = quantise(bands, tw, th, levels, flags, cw.step_tables(grid, levels), mults)
    coded = [encode_band(bands[0])]
    for lines in bands[1:]:
        coded.append(encode_highpass(lines) if any(any(line) for line in lines) else b"")
    return coded


def tiled_jobs(planes: list[list[list[int]]], tile: tuple[int, int], levels: int, margin: int = 48,
               qp=None, mults=None):
    """Encoding jobs, tile by tile and plane by plane. ``planes``: four planes (rows of signed values);
    ``tile``: tile size in plane units. ``qp(tile_row, tile_col, tw, th)`` gives a tile's stored QP grid (None:
    every step 1). Returns (jobs, tiles) with tiles as (index, row, col, width, height, flags)."""

    ph, pw = len(planes[0]), len(planes[0][0])
    tw, th = tile
    cols, rows = -(-pw // tw), -(-ph // th)
    if min(tw, th, pw - tw * (cols - 1), ph - th * (rows - 1)) < 22:
        raise ValueError("a tile or edge remainder under 22 plane sensels (readers refuse it)")
    jobs, tiles = [], []
    for r in range(rows):
        for c in range(cols):
            x, y = c * tw, r * th
            w_, h_ = min(tw, pw - x), min(th, ph - y)
            flags = (cw.RIGHT if c < cols - 1 else 0) | (cw.LEFT if c else 0) | (cw.BOTTOM if r < rows - 1 else 0) | (
                cw.TOP if r else 0)
            ml = min(x, margin) if flags & cw.LEFT else 0
            mr = min(pw - x - w_, margin) if flags & cw.RIGHT else 0
            mt = min(y, margin) if flags & cw.TOP else 0
            mb = min(ph - y - h_, margin) if flags & cw.BOTTOM else 0
            grid = qp(r, c, w_, h_) if qp else None
            tiles.append((len(tiles), y, x, w_, h_, flags, grid))
            for plane in planes:
                region = [line[x - ml : x + w_ + mr] for line in plane[y - mt : y + h_ + mb]]
                jobs.append((region, -ml, -mt, w_, h_, levels, flags, grid, mults or [(0, 1)] * (3 * levels + 1)))
    return jobs, tiles


def flat_qp(tw: int, th: int, value: int = 4) -> list[list[int]]:
    """A tile's QP grid with every value ``value`` (stored; 4 is QP 0, step 1)."""

    return [[value] * ((tw + 7) // 8) for _ in range((th + 1) // 2)]


def assemble(coded: list[list[bytes]], tiles, levels: int, mults=None, pad: int = 3) -> tuple[bytes, int]:
    """The sample: per tile a 0xFF11 header, four 0xFF12 plane headers each with its 0xFF13 subband headers,
    then the data tile after tile (QP stream, planes). Returns (sample, header size)."""

    mults = mults or [(0, 1)] * (3 * levels + 1)
    header, data = b"", b""
    for index, _y, _x, tw, th, _flags, grid in tiles:
        qp_bytes = encode_qp(grid if grid is not None else flat_qp(tw, th))
        planes = coded[4 * index : 4 * index + 4]
        plane_hdrs, blobs = b"", []
        for p, bands in enumerate(planes):
            blob = b"".join(c + b"\xa5" * pad for c in bands)
            sub = b""
            for b, c in enumerate(bands):
                mult, base = mults[b]
                sub += struct.pack(">HHIHHIHH", 0xFF13, 16, len(c) + pad, b << 12, mult, base, pad, 0)
            plane_hdrs += struct.pack(">HHIB3s", 0xFF12, 8, len(blob), (p << 4) | 8, bytes(3)) + sub
            blobs.append(blob)
        body = qp_bytes + b"".join(blobs)
        header += struct.pack(">HHIHHIHH", 0xFF11, 16, len(body), index, 0x4000, len(qp_bytes), 0, 0) + plane_hdrs
        data += body
    header += bytes(4)
    return header + data, len(header)


def craw_sample(values: list[int], width: int, height: int, tile: tuple[int, int], levels: int, mid: int,
                qp=None, mults=None, margin: int = 48) -> tuple[bytes, int]:
    """A whole tiled C-RAW sample of a ``width`` x ``height`` sensor; ``tile`` in sensor units (single process)."""

    pw, ph = width // 2, height // 2
    planes = []
    for p in range(4):
        oy, ox = p >> 1, p & 1
        planes.append([[values[(2 * y + oy) * width + 2 * x + ox] - mid for x in range(pw)] for y in range(ph)])
    jobs, tiles = tiled_jobs(planes, (tile[0] // 2, tile[1] // 2), levels, margin, qp, mults)
    coded = [encode_tile_plane(j) for j in jobs]
    return assemble(coded, tiles, levels, mults)
