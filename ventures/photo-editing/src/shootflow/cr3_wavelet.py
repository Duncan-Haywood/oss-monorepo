"""Canon CR3 C-RAW: the wavelet-coded quality, standard library only (C when present).

A C-RAW sensor sample (CMP1 version 0x200, ``imageLevels`` 1-3) stores each of
the four Bayer planes as a reversible 5/3 wavelet decomposition (the JPEG 2000
lifting filter, symmetric at the edges) whose subbands are quantised. Per
plane there are ``3 * levels + 1`` subbands, each with its own byte range:
the deepest low band (LL) first, then for each level from the deepest to the
finest its HL (high across, low down), LH (low across, high down) and HH bands.

* **Headers** (big-endian, at the start of the sample): a tile header
  (0xFF01, or 0xFF11 with 16 bytes when the tile carries quantisation data:
  its size, then the sizes of the QP stream and of an extra block that follow
  the tile header in the data), a plane header (0xFF02/0xFF12: size, plane
  number, partial flag, rounded bits) and one subband header per subband
  (0xFF03 old style, 0xFF13 new: size, band number, a step multiplier, a step
  base and the padding at the end of the band's bytes).
* **Quantisation steps** (0xFF11 tiles): a Golomb-coded grid of QP values, one
  per 8 columns and 2 rows of the plane, coded with the same median edge
  predictor as the lossless bands. Each level's step table averages the grid
  down to that level's rows (two rows for the middle level, four for the
  deepest); a QP maps to a step through a six-entry table that doubles every
  six (``q_step``). A coefficient's multiplier is ``base + (step * mult >> 3)``,
  clamped to 1..0x168000, the step taken at the coefficient's row and its
  column shifted down to the grid.
* **The deepest LL band** is coded like a lossless band (``cr3.decode_band``:
  median prediction, adaptive Rice code, run mode). **Every other band** is
  coded without reference to the line above's values (``decode_highpass``):
  a zero left, above and above-right sample starts run mode (a run of zeros),
  and the Rice parameter also follows the parameter stored for the column
  above, so it adapts to vertical structure.
* **The inverse transform**, per level from the deepest: rows first (the low
  and high halves of each line interleaved by the 5/3 lifting steps), then
  columns, the result becoming the next level's LL band. The plane sample is
  the result plus ``2^(bits-1)``, clamped to the bit range.

Implemented independently from the format as LibRaw's ``crx.cpp`` (Alexey
Danilchenko's reverse-engineered decoder, LGPL-2.1/CDDL; no code copied) reads
it, and checked sensel for sensel against LibRaw 0.22 on three real C-RAW
files from two bodies (``tools/cr3_libraw_check.py``,
``eval/canon-cr3-craw-2026-11-15.md``). Several tiles (with the extra edge
coefficients LibRaw's ``exCoefNumTbl`` adds where tiles meet) and the
old-style per-line ``qParam`` updates are not read: no test file has either.
"""

from __future__ import annotations

import struct

from shootflow import raw_develop as rd

# Quantisation step for QP 36..41 (six steps to an octave; QP 36 + 6n is 0x28 << n).
Q_STEP = (0x28, 0x2D, 0x33, 0x39, 0x40, 0x48)
J = (0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 9, 10, 11, 12, 13, 14, 15)
JS = tuple(1 << j for j in J)
STEP_MAX = 0x168000


class Subband:
    __slots__ = ("index", "offset", "size", "width", "height", "mult", "base", "shift", "level")

    def __init__(self, index: int, offset: int, size: int, mult: int, base: int):
        self.index, self.offset, self.size, self.mult, self.base = index, offset, size, mult, base
        self.width = self.height = self.shift = self.level = 0


class Plane:
    __slots__ = ("number", "offset", "size", "partial", "bands")

    def __init__(self, number: int, offset: int, size: int, partial: bool):
        self.number, self.offset, self.size, self.partial = number, offset, size, partial
        self.bands: list[Subband] = []


class Layout:
    """Where everything lies in a one-tile C-RAW sample: QP stream, planes and their subbands (offsets from the sample start)."""

    def __init__(self, qp_offset: int, qp_size: int, planes: list[Plane], levels: int, width: int, height: int):
        self.qp_offset, self.qp_size, self.planes = qp_offset, qp_size, planes
        self.levels, self.width, self.height = levels, width, height


def _trunc_div(a: int, b: int) -> int:
    """C's integer division (toward zero)."""

    q = abs(a) // abs(b)
    return q if (a >= 0) == (b > 0) else -q


def _trunc_mod(a: int, b: int) -> int:
    return a - b * _trunc_div(a, b)


def q_step(qp: int) -> int:
    """The quantisation step for one QP value."""

    octave, rest = _trunc_div(qp, 6), _trunc_mod(qp, 6)
    if octave >= 6:
        return Q_STEP[rest] << ((octave - 6) & 0x1F)
    return Q_STEP[max(0, rest)] >> (6 - octave)


def band_sizes(width: int, height: int, levels: int) -> list[tuple[int, int]]:
    """(width, height) of each subband in coded order: LL, then HL, LH, HH from the deepest level to the finest."""

    per_level = []
    w, h = width, height
    for _ in range(levels):
        lw, lh = (w + 1) >> 1, (h + 1) >> 1
        per_level.append([(w >> 1, lh), (lw, h >> 1), (w >> 1, h >> 1)])
        w, h = lw, lh
    out = [(w, h)]
    for group in reversed(per_level):
        out.extend(group)
    return out


def read_layout(sample: bytes, header_size: int, levels: int, planes: int, width: int, height: int) -> Layout:
    """Parse a one-tile C-RAW sample's headers. ``width`` and ``height`` are one plane's (half the sensor's)."""

    hdr = sample[:header_size]
    if len(hdr) < 12:
        raise rd.DevelopError("CR3: the C-RAW header is too short")
    tag, size = struct.unpack_from(">HH", hdr, 0)
    if tag not in (0xFF01, 0xFF11) or size not in (8, 16) or (tag == 0xFF01 and size != 8):
        raise rd.DevelopError(f"CR3: C-RAW tile header tag {tag:#06x} size {size} is not known")
    tile_size, number, tail = struct.unpack_from(">IHH", hdr, 4)
    if number != 0 or (size == 8 and tail) or (size == 16 and tail != 0x4000):
        raise rd.DevelopError("CR3: C-RAW tile header is not the single tile this reader expects")
    qp_size = extra = 0
    if size == 16:
        qp_size, extra = struct.unpack_from(">IH", hdr, 12)
    pos = 4 + size
    data_at = header_size + qp_size + extra
    out_planes: list[Plane] = []
    sizes = band_sizes(width, height, levels)
    for p in range(planes):
        tag, size, plane_size = struct.unpack_from(">HHI", hdr, pos)
        flags = hdr[pos + 8]
        if tag not in (0xFF02, 0xFF12) or size != 8 or flags >> 4 != p:
            raise rd.DevelopError(f"CR3: C-RAW plane header {p} (tag {tag:#06x}) is not valid")
        if (flags >> 1) & 3:
            raise rd.DevelopError("CR3: a wavelet plane with rounded bits is not valid")
        plane = Plane(p, data_at, plane_size, bool(flags & 8))
        pos += 12
        band_at = data_at
        for b in range(3 * levels + 1):
            tag, size, band_size = struct.unpack_from(">HHI", hdr, pos)
            if hdr[pos + 8] >> 4 != b:
                raise rd.DevelopError(f"CR3: C-RAW subband header {b} is out of order")
            if tag == 0xFF13 and size == 16:
                head2, mult, base, pad, end = struct.unpack_from(">HHIHH", hdr, pos + 8)
                if head2 & 0xFFF or end:
                    raise rd.DevelopError("CR3: a C-RAW subband with partial decoding is not supported (no test file)")
                band = Subband(b, band_at, band_size - pad, mult, base)
            elif tag == 0xFF03 and size == 8:
                raise rd.DevelopError("CR3: an old-style C-RAW subband header (per-line quantisation) is not supported (no test file)")
            else:
                raise rd.DevelopError(f"CR3: C-RAW subband header tag {tag:#06x} is not known")
            band.width, band.height = sizes[b]
            # Level 0 is the deepest; the LL band belongs to it.
            band.level = 0 if b == 0 else (b - 1) // 3
            # The step grid has one column per 8 plane columns: shift a column at this band's scale down to it.
            band.shift = 3 - levels + (0 if b == 0 else band.level)
            plane.bands.append(band)
            band_at += band_size
            pos += 4 + size
        if band_at - data_at > plane_size:
            raise rd.DevelopError("CR3: C-RAW subbands run past their plane")
        out_planes.append(plane)
        data_at += plane_size
    if data_at > len(sample):
        raise rd.DevelopError("CR3: the C-RAW planes run past the end of the sensor sample")
    if not qp_size:
        raise rd.DevelopError("CR3: a C-RAW tile without quantisation data is not supported (no test file)")
    return Layout(header_size, qp_size, out_planes, levels, width, height)


# ---------------------------------------------------------------- QP grid


def _golomb(bits, k: int) -> int:
    code = bits.zeros()
    if code >= 23:
        return bits.get(8)
    if k:
        return bits.get(k) | (code << k)
    return code


def _next_k(k: int, code: int, cap: int) -> int:
    nk = k - (code < ((1 << k) >> 1)) + ((code >> k) > 2) + ((code >> k) > 5)
    return nk if (not cap or nk < cap) else cap


def qp_grid(data: bytes, width: int, height: int) -> list[list[int]]:
    """The tile's QP values: ``ceil(height / 2)`` rows of ``ceil(width / 8)`` (plane width and height)."""

    from shootflow.cr3 import _Bits

    qw = (width >> 3) + ((width & 7) != 0)
    qh = (height >> 1) + (height & 1)
    bits = _Bits(data)
    k = 0
    rows: list[list[int]] = []
    prev: list[int] = []
    for r in range(qh):
        cur = [0] * (qw + 2)
        if r == 0:
            for i in range(qw):
                code = _golomb(bits, k)
                cur[i + 1] = cur[i] + (-(code & 1) ^ (code >> 1))
                k = _next_k(k, code, 7)
        else:
            cur[0] = prev[1]
            for i in range(qw):
                left, top, top_left = cur[i], prev[i + 1], prev[i]
                dh = top - top_left
                dv = top_left - left
                pick = (((dv < 0) ^ (dh < 0)) << 1) + ((left < top) ^ (dh < 0))
                value = (left + dh, left + dh, left, top)[pick]
                code = _golomb(bits, k)
                cur[i + 1] = value + (-(code & 1) ^ (code >> 1))
                if i < qw - 1:
                    k = _next_k(k, (code + 2 * abs(prev[i + 2] - top)) >> 1, 7)
                else:
                    k = _next_k(k, code, 7)
        cur[qw + 1] = cur[qw] + 1
        rows.append([v + 4 for v in cur[1 : qw + 1]])
        prev = cur
    return rows


def step_tables(grid: list[list[int]], levels: int) -> list[list[list[int]]]:
    """One step table per level, deepest first: the QP grid averaged over 4 rows (level 0 of 3), 2 rows, then as is."""

    qh = len(grid)
    out: list[list[list[int]]] = []
    for level in range(levels):
        group = 1 << (levels - 1 - level)
        rows = []
        for r in range((qh + group - 1) // group):
            picks = [grid[min(group * r + j, qh - 1)] for j in range(group)]
            if group == 4:
                qps = [((s < 0) * 3 + s) >> 2 for s in (a + b + c + d for a, b, c, d in zip(*picks))]
            elif group == 2:
                qps = [_trunc_div(a + b, 2) for a, b in zip(*picks)]
            else:
                qps = list(picks[0])
            rows.append([q_step(q) for q in qps])
        out.append(rows)
    return out


# ---------------------------------------------------------------- high-pass bands


def decode_highpass(data: bytes, width: int, height: int) -> list[list[int]]:
    """A subband other than the deepest LL: ``height`` lines of ``width`` signed coefficients.

    No value prediction: the coefficient is the decoded error itself. Run mode (a run of zeros) starts
    where the left, above and above-right coefficients are all zero; a value right after a run is coded
    one step toward zero (it cannot be zero). The Rice parameter K adapts as on the other bands and is
    also nudged up when the column above was coded with a K more than one higher.
    """

    from shootflow.cr3 import _Bits

    bits = _Bits(data)
    s = 0
    k = 0
    kcol = [0] * (width + 1)  # K stored per column by the line above
    lines: list[list[int]] = []
    above = [0] * (width + 2)

    def rice(k):
        code = bits.zeros()
        if code >= 41:
            return bits.get(21)
        if k:
            return bits.get(k) | (code << k)
        return code

    def run(limit):
        """Length of a zero run starting here, ``limit`` samples left on the line (0 if the first bit is 0)."""

        nonlocal s
        if not bits.get(1):
            return 0
        n = 1
        while bits.get(1):
            n += JS[s]
            if n > limit:
                n = limit
                break
            if s < 31:
                s += 1
            if n == limit:
                break
        if n < limit:
            if J[s]:
                n += bits.get(J[s])
            if s > 0:
                s -= 1
            if n > limit:
                raise rd.DevelopError("CR3: a C-RAW run is longer than the rest of its line")
        return n

    # Top line: run mode wherever the left coefficient is zero.
    cur = [0] * (width + 2)
    i = 0
    length = width
    while length > 1:
        if cur[i]:
            code = rice(k)
            cur[i + 1] = -(code & 1) ^ (code >> 1)
            k = _next_k(k, code, 15)
        else:
            n = run(length)
            length -= n
            for _ in range(n):
                kcol[i] = 0
                cur[i + 1] = 0
                i += 1
            if length <= 0:
                break
            code = rice(k)
            cur[i + 1] = -((code + 1) & 1) ^ ((code + 1) >> 1)
            k = _next_k(k, code, 15)
        kcol[i] = k
        i += 1
        length -= 1
    if length == 1:
        code = rice(k)
        cur[i + 1] = -(code & 1) ^ (code >> 1)
        k = _next_k(k, code, 15)
        kcol[i] = k
        i += 1
    lines.append(cur[1 : width + 1])
    above = cur
    above[width + 1] = 0

    for _line in range(1, height):
        cur = [0] * (width + 2)
        i = 0
        last = width - 1
        while i < last:
            if above[i + 2] | above[i + 1] | cur[i]:
                code = rice(k)
                cur[i + 1] = -(code & 1) ^ (code >> 1)
                k = _next_k(k, code, 0)
                if kcol[i + 1] - k <= 1:
                    if k >= 15:
                        k = 15
                else:
                    k += 1
            else:
                n = run(width - i)
                if n:
                    for j in range(i, i + n):
                        kcol[j] = 0
                    i += n  # the zeros are already in cur
                if i >= last:
                    if i == last:
                        code = rice(k)
                        cur[i + 1] = -((code + 1) & 1) ^ ((code + 1) >> 1)
                        k = _next_k(k, code, 15)
                        kcol[i] = k
                    i += 1
                    continue
                code = rice(k)
                cur[i + 1] = -((code + 1) & 1) ^ ((code + 1) >> 1)
                k = _next_k(k, code, 0)
                if kcol[i + 1] - k <= 1:
                    if k >= 15:
                        k = 15
                else:
                    k += 1
            kcol[i] = k
            i += 1
        if i == last:
            code = rice(k)
            cur[i + 1] = -(code & 1) ^ (code >> 1)
            k = _next_k(k, code, 15)
            kcol[i] = k
        lines.append(cur[1 : width + 1])
        above = cur
    return lines


# ---------------------------------------------------------------- dequantisation and the inverse transform


def dequantise(lines: list[list[int]], band: Subband, table: list[list[int]]) -> None:
    """Multiply each coefficient by its step, in place (single tile: no edge add-ons)."""

    for r, line in enumerate(lines):
        steps = table[r]
        mult, base, shift = band.mult, band.base, band.shift
        cache: dict[int, int] = {}
        for i, v in enumerate(line):
            if not v:
                continue
            col = i >> shift
            q = cache.get(col)
            if q is None:
                q = base + ((steps[col] * mult) >> 3)
                q = 1 if q < 1 else (STEP_MAX if q > STEP_MAX else q)
                cache[col] = q
            line[i] = v * q


def inverse_53(low: list[int], high: list[int], n: int) -> list[int]:
    """One line (or column) of the reversible 5/3 inverse with symmetric edges; ``n`` output samples."""

    if n <= 1:
        return [low[0]]
    m = len(high)
    even = [0] * len(low)
    even[0] = low[0] - ((high[0] + 1) >> 1)
    for k in range(1, m):
        even[k] = low[k] - ((high[k - 1] + high[k] + 2) >> 2)
    if n & 1:
        even[m] = low[m] - ((high[m - 1] + 1) >> 1)
    out = [0] * n
    out[0::2] = even
    for k in range(m):
        out[2 * k + 1] = high[k] + ((even[k] + even[k + 1]) >> 1) if k + 1 < len(even) else high[k] + even[k]
    return out


def _rows(low: list[list[int]], high: list[list[int]], width: int) -> list[list[int]]:
    return [inverse_53(lo, hi, width) for lo, hi in zip(low, high)]


def inverse_level(ll: list[list[int]], hl: list[list[int]], lh: list[list[int]], hh: list[list[int]], width: int, height: int) -> list[list[int]]:
    """Rebuild a ``width`` x ``height`` band from its four subbands."""

    lo_rows = _rows(ll, hl, width)  # vertically low
    hi_rows = _rows(lh, hh, width) if lh else []  # vertically high
    if height <= 1:
        return lo_rows[:1]
    m = len(hi_rows)
    even: list[list[int]] = [None] * len(lo_rows)  # type: ignore[list-item]
    even[0] = [a - ((b + 1) >> 1) for a, b in zip(lo_rows[0], hi_rows[0])]
    for r in range(1, m):
        even[r] = [a - ((b + c + 2) >> 2) for a, b, c in zip(lo_rows[r], hi_rows[r - 1], hi_rows[r])]
    if height & 1:
        even[m] = [a - ((b + 1) >> 1) for a, b in zip(lo_rows[m], hi_rows[m - 1])]
    out: list[list[int]] = []
    for r in range(m):
        out.append(even[r])
        if r + 1 < len(even):
            out.append([h + ((a + b) >> 1) for h, a, b in zip(hi_rows[r], even[r], even[r + 1])])
        else:
            out.append([h + a for h, a in zip(hi_rows[r], even[r])])
    if height & 1:
        out.append(even[m])
    return out


def decode_plane(sample: bytes, layout: Layout, plane: Plane, tables: list[list[list[int]]]) -> list[list[int]]:
    """One plane's signed values (before the ``2^(bits-1)`` offset): ``height`` lines of ``width``."""

    from shootflow.cr3 import decode_band

    bands = plane.bands
    coeffs: list[list[list[int]]] = []
    for band in bands:
        chunk = sample[band.offset : band.offset + band.size]
        if not band.size:
            lines = [[0] * band.width for _ in range(band.height)]
        elif band.index == 0:
            if not plane.partial:
                raise rd.DevelopError("CR3: a C-RAW low band without the partial flag is not supported (no test file)")
            lines = decode_band(chunk, band.width, band.height)
        else:
            lines = decode_highpass(chunk, band.width, band.height)
        dequantise(lines, band, tables[band.level])
        coeffs.append(lines)
    ll = coeffs[0]
    sizes = [(layout.width, layout.height)]
    w, h = layout.width, layout.height
    for _ in range(layout.levels - 1):
        w, h = (w + 1) >> 1, (h + 1) >> 1
        sizes.append((w, h))
    sizes.reverse()  # output size of each level, deepest first
    for level in range(layout.levels):
        hl, lh, hh = coeffs[3 * level + 1 : 3 * level + 4]
        ll = inverse_level(ll, hl, lh, hh, *sizes[level])
    return ll


def native_decode(fn, sample: bytes, layout: Layout, bits: int, out, stride: int) -> int:
    """All four planes through ``shootflow_craw_plane`` (one thread per plane; ctypes lets go of the GIL)."""

    import ctypes
    from array import array
    from concurrent.futures import ThreadPoolExecutor

    tables = step_tables(qp_grid(sample[layout.qp_offset : layout.qp_offset + layout.qp_size], layout.width, layout.height), layout.levels)
    qw = len(tables[0][0])
    flat = array("i")
    offsets = array("l")
    rows = array("l")
    for table in tables:
        offsets.append(len(flat))
        rows.append(len(table))
        for row in table:
            flat.extend(row)
    keep = [flat, offsets, rows]
    base_addr = out.buffer_info()[0]

    def one(plane: Plane) -> int:
        info = array("l")
        for band in plane.bands:
            info.extend((band.offset, band.size, band.width, band.height, band.mult, band.base, band.shift))
        keep.append(info)
        oy, ox = plane.number >> 1, plane.number & 1
        first = base_addr + 2 * (oy * stride + ox)
        return fn(sample, len(sample), layout.levels, info.buffer_info()[0], flat.buffer_info()[0], offsets.buffer_info()[0],
                  rows.buffer_info()[0], qw, layout.width, layout.height, bits, ctypes.c_void_p(first), stride)

    with ThreadPoolExecutor(max_workers=len(layout.planes)) as pool:
        results = list(pool.map(one, layout.planes))
    return min(results) if results else -1


def decode_sensor(sample: bytes, head, out, engine: str = "auto") -> None:
    """Decode a C-RAW sample into ``out`` (``width * height`` 16-bit sensels, row-major), as ``cr3.decode_sensor``."""

    from array import array

    w, h = head.width, head.height
    pw, ph = w // 2, h // 2
    layout = read_layout(sample, head.header_size, head.levels, head.planes, pw, ph)
    native = None
    if engine in ("auto", "c"):
        from shootflow import ljpeg_native

        native = ljpeg_native.craw_function()
        if native is None and engine == "c":
            raise rd.DevelopError("CR3: the C decoder is not available")
    if native is not None:
        if native_decode(native, sample, layout, head.bits, out, w) < 0:
            raise rd.DevelopError("CR3: the C-RAW data is invalid")
        return
    mid, top = 1 << (head.bits - 1), (1 << head.bits) - 1
    tables = step_tables(qp_grid(sample[layout.qp_offset : layout.qp_offset + layout.qp_size], pw, ph), head.levels)
    for plane in layout.planes:
        oy, ox = plane.number >> 1, plane.number & 1
        for y, row in enumerate(decode_plane(sample, layout, plane, tables)):
            base = (2 * y + oy) * w + ox
            out[base : base + 2 * pw : 2] = array("H", (0 if v + mid < 0 else (top if v + mid > top else v + mid) for v in row))
