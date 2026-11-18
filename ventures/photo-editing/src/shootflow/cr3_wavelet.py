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
``eval/canon-cr3-craw-2026-11-15.md``).

**The older layout (2026-11-18).** Bodies of 2018-2023 (EOS R, RP, M50, M6
Mark II, 250D, 90D, R100...) write C-RAW as CMP1 version 0x100 with wavelet
levels: tile headers 0xFF01 with no QP stream, and 0xFF03 subband headers whose
one 32-bit word holds the band number (top four bits), a per-line flag (bit
27), the band's QP (bits 19-26) and its padding (low 19 bits). Every
coefficient of the band is multiplied by ``q_step(QP)``, LibRaw's "prev.
version" path; here as a zero multiplier and a base of that step. Checked on
real files of eight bodies against LibRaw
(``eval/canon-cr3-every-body-2026-11-18.md``). The per-line ``qParam``
updates (the flag set) are not read: no file seen has them.

**Several tiles (2026-11-16).** A CR3 may store the planes cut into a grid of
tiles (``cr3.tile_grid``; the real R5 and R5 Mark II files of 2026-11-18 are one tile). Each tile is its own 5/3
decomposition, its first sample even at every level, and its subbands carry
edge coefficients lent by its neighbours: one more high-pass coefficient
before a left (or top) neighbour, and after a right (or bottom) one the counts
LibRaw's ``exCoefNumTbl`` gives for the tile's size mod 8 (``tile_geometry``).
With them the inverse runs across the seam with the interior lifting rule
(``inverse_53``'s ``first`` and ``last``), each level producing the next
level's low band with its own edge coefficients (``level_sizes``). Each tile
has its own QP grid at the tile's size; a borrowed coefficient takes the step
of the nearest own column (and, as LibRaw reads it, row: ``step_row``). No
public tiled C-RAW file exists to test with, so real R8 and R3 C-RAW frames
were re-stored as tiles (``tests/craw_tiled.py``) and LibRaw 0.22 read them
back (``tools/cr3_craw_tiled_libraw_check.py``,
``eval/canon-cr3-craw-tiled-2026-11-16.md``).
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
    __slots__ = ("index", "offset", "size", "width", "height", "mult", "base", "shift", "level",
                 "col_start", "col_end", "row_start", "row_end", "old_style")

    def __init__(self, index: int, offset: int, size: int, mult: int, base: int):
        self.index, self.offset, self.size, self.mult, self.base = index, offset, size, mult, base
        self.old_style = False
        self.width = self.height = self.shift = self.level = 0
        # Edge coefficients borrowed from neighbouring tiles (0 on a one-tile sensor): the first ``col_start``
        # and last ``col_end`` columns, the first ``row_start`` and last ``row_end`` rows.
        self.col_start = self.col_end = self.row_start = self.row_end = 0


class Plane:
    __slots__ = ("number", "offset", "size", "partial", "bands")

    def __init__(self, number: int, offset: int, size: int, partial: bool):
        self.number, self.offset, self.size, self.partial = number, offset, size, partial
        self.bands: list[Subband] = []


# Neighbouring tiles (LibRaw's tile flags).
RIGHT, LEFT, BOTTOM, TOP = 1, 2, 4, 8

# Extra coefficients a tile's subbands carry past its right (or bottom) edge, from the format as LibRaw's
# ``exCoefNumTbl`` gives it: 48 entries per level count (1-3), six per value of the tile's width (or height)
# mod 8, two per level (finest first): the high band's count, then the low band's.
EX_COEF = (
    1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0,
    0, 1, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 1, 0, 1, 0,
    0, 0, 1, 2, 2, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0, 1, 2, 2,
    1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1, 0, 1, 2, 2, 2, 2, 1, 1, 1,
    1, 2, 2, 1, 1, 1, 1, 2, 2, 1, 1, 0, 1, 1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1,
)


class TileLayout:
    """One tile of a C-RAW sample: where its QP stream and planes lie (offsets from the sample start), its
    place and size in plane units, its neighbours and the size each level's inverse produces (deepest first)."""

    def __init__(self, index: int, row: int, col: int, width: int, height: int, flags: int, levels: int):
        self.index, self.row, self.col, self.width, self.height = index, row, col, width, height
        self.flags, self.levels = flags, levels
        self.qp_offset = self.qp_size = 0
        self.old_style = False
        self.planes: list[Plane] = []
        self.geometry = tile_geometry(width, height, levels, flags)
        self.level_sizes = level_sizes(self.geometry, width, height, levels)


class Layout:
    """Where everything lies in a C-RAW sample: its tiles, each with a QP stream and four planes of subbands."""

    def __init__(self, tiles: list[TileLayout], levels: int, width: int, height: int):
        self.tiles, self.levels, self.width, self.height = tiles, levels, width, height

    # One-tile conveniences (the sample's only tile).
    @property
    def planes(self) -> list[Plane]:
        return self.tiles[0].planes

    @property
    def qp_offset(self) -> int:
        return self.tiles[0].qp_offset

    @property
    def qp_size(self) -> int:
        return self.tiles[0].qp_size


def tile_geometry(width: int, height: int, levels: int, flags: int = 0) -> list[tuple[int, int, int, int, int, int]]:
    """Each subband's (width, height, col_start, col_end, row_start, row_end) in coded order, for a tile of
    ``width`` x ``height`` plane sensels with the neighbours ``flags`` names.

    A tile's bands are those of its own 5/3 decomposition (its first sample even at every level), plus edge
    coefficients from its neighbours so the inverse runs across the seam as on one plane: one more high-pass
    coefficient before a left (or top) neighbour, and after a right (or bottom) one the counts ``EX_COEF``
    gives for the tile's size mod 8, a high and a low count per level. With no neighbours this is
    ``band_sizes``."""

    if not levels:
        return [(width, height, 0, 0, 0, 0)]
    row_ex = EX_COEF[0x30 * (levels - 1) + 6 * (width & 7):][:6]
    col_ex = EX_COEF[0x30 * (levels - 1) + 6 * (height & 7):][:6]
    per_level = []  # finest first: (HL, LH, HH)
    bw, bh = width, height
    for level in range(levels):
        odd_w, odd_h = bw & 1, bh & 1
        bw, bh = (bw + odd_w) >> 1, (bh + odd_h) >> 1
        wx0 = wx1 = hx0 = hx1 = cs = rs = 0
        if flags & RIGHT:
            wx0, wx1 = row_ex[2 * level], row_ex[2 * level + 1]
        if flags & LEFT:
            wx0 += 1
            cs = 1
        if flags & BOTTOM:
            hx0, hx1 = col_ex[2 * level], col_ex[2 * level + 1]
        if flags & TOP:
            hx0 += 1
            rs = 1
        hh = (bw + wx0 - odd_w, bh + hx0 - odd_h, cs, wx0 - cs, rs, hx0 - rs)
        lh = (bw + wx1, bh + hx0 - odd_h, 0, wx1, rs, hx0 - rs)
        hl = (bw + wx0 - odd_w, bh + hx1, cs, wx0 - cs, 0, hx1)
        per_level.append((hl, lh, hh))
    wx = row_ex[2 * levels - 1] if flags & RIGHT else 0
    hx = col_ex[2 * levels - 1] if flags & BOTTOM else 0
    out = [(bw + wx, bh + hx, 0, wx, 0, hx)]
    for group in reversed(per_level):
        out.extend(group)
    return out


def level_sizes(geometry, width: int, height: int, levels: int) -> list[tuple[int, int]]:
    """The (width, height) each level's inverse produces, deepest first: the next level's low band with its
    edge coefficients, and the tile itself at the finest level."""

    out = []
    for level in range(levels):
        if level == levels - 1:
            out.append((width, height))
        else:
            out.append((geometry[3 * (level + 1) + 2][0], geometry[3 * (level + 1) + 1][1]))
    return out


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


def read_layout(sample: bytes, header_size: int, levels: int, planes: int, width: int, height: int,
                grid=None) -> Layout:
    """Parse a C-RAW sample's headers. ``width`` and ``height`` are one plane's (half the sensor's); ``grid``
    is ``cr3.tile_grid``'s tiles (plane units) when the sensor is stored in several, else one tile.

    The header holds, for each tile in turn, a tile header (0xFF11: the tile's byte count, its index, then the
    sizes of the QP stream and of an extra block that open the tile's data), its four plane headers and each
    plane's subband headers. The data follows tile after tile: QP stream, extra block, then the planes."""

    if grid is None:
        grid = [(0, 0, 0, width, height)]
    else:
        grid = [(t.index, t.row, t.col, t.width, t.height) for t in grid]
    cols = sum(1 for g in grid if g[1] == 0)
    rows = len(grid) // cols
    hdr = sample[:header_size]
    pos = 0
    tile_at = header_size
    tiles: list[TileLayout] = []
    for index, row, col, tw, th in grid:
        r, c = divmod(index, cols)
        flags = (RIGHT if c < cols - 1 else 0) | (LEFT if c else 0) | (BOTTOM if r < rows - 1 else 0) | (TOP if r else 0)
        tile = TileLayout(index, row, col, tw, th, flags, levels)
        if len(hdr) < pos + 12:
            raise rd.DevelopError("CR3: the C-RAW header is too short")
        tag, size = struct.unpack_from(">HH", hdr, pos)
        if tag not in (0xFF01, 0xFF11) or size not in (8, 16) or (tag == 0xFF01 and size != 8):
            raise rd.DevelopError(f"CR3: C-RAW tile header tag {tag:#06x} size {size} is not known")
        tile_size, number, tail = struct.unpack_from(">IHH", hdr, pos + 4)
        if number != index or (size == 8 and tail) or (size == 16 and tail != 0x4000):
            raise rd.DevelopError(f"CR3: C-RAW tile header {index} is not valid (it names tile {number})")
        qp_size = extra = 0
        if size == 16:
            qp_size, extra, end = struct.unpack_from(">IHH", hdr, pos + 12)
            if end:
                raise rd.DevelopError("CR3: a C-RAW tile header does not end in two zero bytes")
        # A tile with no QP stream (0xFF01) must carry old-style subband headers (0xFF03), each with one fixed
        # step; that is checked once the bands are read.
        tile.old_style = not qp_size
        tile.qp_offset, tile.qp_size = tile_at, qp_size
        pos += 4 + size
        data_at = tile_at + qp_size + extra
        geometry = tile.geometry
        for p in range(planes):
            if len(hdr) < pos + 12:
                raise rd.DevelopError("CR3: the C-RAW header ends inside a tile's plane headers")
            tag, size, plane_size = struct.unpack_from(">HHI", hdr, pos)
            flags_byte = hdr[pos + 8]
            if tag not in (0xFF02, 0xFF12) or size != 8 or flags_byte >> 4 != p or hdr[pos + 9 : pos + 12] != bytes(3):
                raise rd.DevelopError(f"CR3: C-RAW plane header {p} of tile {index} (tag {tag:#06x}) is not valid")
            if (flags_byte >> 1) & 3:
                raise rd.DevelopError("CR3: a wavelet plane with rounded bits is not valid")
            plane = Plane(p, data_at, plane_size, bool(flags_byte & 8))
            pos += 12
            band_at = data_at
            for b in range(3 * levels + 1):
                if len(hdr) < pos + 12:
                    raise rd.DevelopError("CR3: the C-RAW header ends inside a subband header")
                tag, size, band_size = struct.unpack_from(">HHI", hdr, pos)
                if len(hdr) < pos + 4 + size:
                    raise rd.DevelopError("CR3: the C-RAW header ends inside a subband header")
                if hdr[pos + 8] >> 4 != b:
                    raise rd.DevelopError(f"CR3: C-RAW subband header {b} is out of order")
                if tag == 0xFF13 and size == 16:
                    head2, mult, base, pad, end = struct.unpack_from(">HHIHH", hdr, pos + 8)
                    if head2 & 0xFFF or end:
                        raise rd.DevelopError("CR3: a C-RAW subband with partial decoding is not supported (no test file)")
                    if pad > band_size:
                        raise rd.DevelopError("CR3: a C-RAW subband's padding is larger than the subband")
                    band = Subband(b, band_at, band_size - pad, mult, base)
                elif tag == 0xFF03 and size == 8:
                    # Old style (EOS R100 C-RAW, 2026-11-18): a 32-bit word of band number (top four bits), a
                    # per-line flag (bit 27), the band's QP (bits 19-26) and the padding (low 19 bits). With no
                    # per-line flag the whole band takes one step, q_step(QP), as LibRaw's "prev. version" path.
                    word = struct.unpack_from(">I", hdr, pos + 8)[0]
                    if word & 0x08000000:
                        raise rd.DevelopError("CR3: an old-style C-RAW subband with per-line quantisation is not supported (no test file)")
                    pad, scale = word & 0x7FFFF, q_step((word >> 19) & 0xFF)
                    if pad > band_size:
                        raise rd.DevelopError("CR3: a C-RAW subband's padding is larger than the subband")
                    if scale < 1:
                        # LibRaw multiplies such a band by 0; no file seen has one.
                        raise rd.DevelopError("CR3: an old-style C-RAW subband with a zero step is not supported (no test file)")
                    # A fixed step through the grid's formula: base + (step * 0 >> 3) is the base at every coefficient.
                    band = Subband(b, band_at, band_size - pad, 0, scale)
                    band.old_style = True
                else:
                    raise rd.DevelopError(f"CR3: C-RAW subband header tag {tag:#06x} is not known")
                (band.width, band.height, band.col_start, band.col_end, band.row_start, band.row_end) = geometry[b]
                # Level 0 is the deepest; the LL band belongs to it.
                band.level = 0 if b == 0 else (b - 1) // 3
                # The step grid has one column per 8 plane columns: shift a column at this band's scale down to it.
                band.shift = 3 - levels + (0 if b == 0 else band.level)
                plane.bands.append(band)
                band_at += band_size
                pos += 4 + size
            if band_at - data_at > plane_size:
                raise rd.DevelopError("CR3: C-RAW subbands run past their plane")
            if any(band.old_style != tile.old_style for band in plane.bands):
                raise rd.DevelopError(
                    "CR3: a C-RAW tile mixes a QP stream and old-style subband headers (or lacks both); not supported (no test file)")
            tile.planes.append(plane)
            data_at += plane_size
        if data_at > tile_at + tile_size:
            raise rd.DevelopError(f"CR3: tile {index}'s planes run past its byte count")
        tile_at += tile_size
        tiles.append(tile)
    if tile_at > len(sample):
        raise rd.DevelopError("CR3: the C-RAW tiles run past the end of the sensor sample")
    return Layout(tiles, levels, width, height)


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


def step_row(band: Subband, r: int, rows: int) -> int:
    """The step-table row for line ``r`` of ``band``, as LibRaw's ``getSubbandRow`` picks it: 0 for the
    borrowed top lines, ``r - row_end`` inside, the last own row for the borrowed bottom lines.

    Inside, LibRaw subtracts the bottom count, where the columns' rule (below) would subtract the top
    one; the two agree on a one-tile sensor and on a single row of tiles. Followed as LibRaw reads it, and
    clamped to the table where that rule would step outside it. Only a real tiled C-RAW file can say which
    Canon meant (``eval/canon-cr3-craw-tiled-2026-11-16.md``)."""

    if r < band.row_start:
        i = 0
    elif r < band.height - band.row_end:
        i = r - band.row_end
    else:
        i = band.height - band.row_end - band.row_start - 1
    return 0 if i < 0 else (rows - 1 if i >= rows else i)


def step_col(band: Subband, i: int, cols: int) -> int:
    """The step-table column for coefficient ``i`` of a line: the first own column's for borrowed left
    coefficients, the column shifted down to the grid inside, the last own column's for borrowed right ones."""

    if i < band.col_start:
        c = 0
    elif i < band.width - band.col_end:
        c = (i - band.col_start) >> band.shift
    else:
        c = (band.width - band.col_end - band.col_start - 1) >> band.shift
    return 0 if c < 0 else (cols - 1 if c >= cols else c)


def dequantise(lines: list[list[int]], band: Subband, table: list[list[int]]) -> None:
    """Multiply each coefficient by its step, in place."""

    rows = len(table)
    mult, base = band.mult, band.base
    for r, line in enumerate(lines):
        steps = table[step_row(band, r, rows)]
        cols = len(steps)
        cache: dict[int, int] = {}
        for i, v in enumerate(line):
            if not v:
                continue
            col = step_col(band, i, cols)
            q = cache.get(col)
            if q is None:
                q = base + ((steps[col] * mult) >> 3)
                q = 1 if q < 1 else (STEP_MAX if q > STEP_MAX else q)
                cache[col] = q
            line[i] = v * q


def _evens(n: int, nh: int, first: bool, last: bool) -> list[tuple[int, int, int]]:
    """For each even output sample of an ``n``-sample 5/3 inverse: (low index, high index before, high index
    after). ``first``: the high band opens with a borrowed coefficient (a neighbour before); ``last``: the
    bands run on past the end (a neighbour after), so the edge samples use the interior rule. With no
    neighbour the missing high coefficient is the other one (symmetric extension)."""

    hoff = 1 if first else 0
    ne = (n + 1) >> 1
    count = ne + (1 if last and not n & 1 else 0)
    out = []
    for k in range(count):
        a, b = k - 1 + hoff, k + hoff
        a_ok = a >= 0
        b_ok = b < nh and (last or 2 * k + 1 < n)
        if not a_ok:
            a = b
        if not b_ok:
            b = a
        out.append((k, a, b))
    return out


def inverse_53(low: list[int], high: list[int], n: int, first: bool = False, last: bool = False) -> list[int]:
    """One line (or column) of the reversible 5/3 inverse; ``n`` output samples. With no neighbours
    (``first``, ``last``) the edges are symmetric; see ``_evens``."""

    if n <= 1:
        return [low[0]]
    hoff = 1 if first else 0
    even = [low[k] - ((high[a] + high[b] + 2) >> 2) for k, a, b in _evens(n, len(high), first, last)]
    out = [0] * n
    out[0::2] = even[: (n + 1) >> 1]
    count = len(even)
    for k in range(n >> 1):
        h = high[k + hoff]
        out[2 * k + 1] = h + ((even[k] + even[k + 1]) >> 1) if k + 1 < count else h + even[k]
    return out


def inverse_level(ll: list[list[int]], hl: list[list[int]], lh: list[list[int]], hh: list[list[int]], width: int, height: int,
                  flags: int = 0) -> list[list[int]]:
    """Rebuild a ``width`` x ``height`` band from its four subbands: rows first, then columns."""

    left, right, top, bottom = bool(flags & LEFT), bool(flags & RIGHT), bool(flags & TOP), bool(flags & BOTTOM)
    lo_rows = [inverse_53(lo, hi, width, left, right) for lo, hi in zip(ll, hl)]  # vertically low
    hi_rows = [inverse_53(lo, hi, width, left, right) for lo, hi in zip(lh, hh)] if lh else []  # vertically high
    if height <= 1:
        return lo_rows[:1]
    even = [[a - ((b + c + 2) >> 2) for a, b, c in zip(lo_rows[k], hi_rows[i], hi_rows[j])]
            for k, i, j in _evens(height, len(hi_rows), top, bottom)]
    hoff = 1 if top else 0
    out: list[list[int]] = []
    count = len(even)
    for r in range(height >> 1):
        out.append(even[r])
        hr = hi_rows[r + hoff]
        if r + 1 < count:
            out.append([h + ((a + b) >> 1) for h, a, b in zip(hr, even[r], even[r + 1])])
        else:
            out.append([h + a for h, a in zip(hr, even[r])])
    if height & 1:
        out.append(even[height >> 1])
    return out


def decode_plane(sample: bytes, tile: TileLayout, plane: Plane, tables: list[list[list[int]]]) -> list[list[int]]:
    """One tile's plane, signed values (before the ``2^(bits-1)`` offset): ``tile.height`` lines of ``tile.width``."""

    from shootflow.cr3 import decode_band

    coeffs: list[list[list[int]]] = []
    for band in plane.bands:
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
    for level in range(tile.levels):
        hl, lh, hh = coeffs[3 * level + 1 : 3 * level + 4]
        ll = inverse_level(ll, hl, lh, hh, *tile.level_sizes[level], flags=tile.flags)
    return ll


def tile_tables(sample: bytes, tile: TileLayout) -> list[list[list[int]]]:
    """A tile's step tables, from its own QP stream (a grid at the tile's width and height). An old-style tile
    has none: a grid of zeros at the same shape, which its bands' zero multipliers ignore."""

    if tile.old_style:
        qw, qh = (tile.width >> 3) + ((tile.width & 7) != 0), (tile.height >> 1) + (tile.height & 1)
        return step_tables([[0] * qw for _ in range(qh)], tile.levels)
    return step_tables(qp_grid(sample[tile.qp_offset : tile.qp_offset + tile.qp_size], tile.width, tile.height), tile.levels)


def native_decode(fn, sample: bytes, layout: Layout, bits: int, out, stride: int) -> int:
    """Every tile's four planes through ``shootflow_craw_plane`` (planes of a tile on their own threads;
    ctypes lets go of the GIL). ``stride`` is the sensor's width."""

    import ctypes
    from array import array
    from concurrent.futures import ThreadPoolExecutor

    base_addr = out.buffer_info()[0]
    results: list[int] = []
    with ThreadPoolExecutor(max_workers=4) as pool:
        for tile in layout.tiles:
            tables = tile_tables(sample, tile)
            qw = len(tables[0][0])
            flat = array("i")
            offsets = array("l")
            rows = array("l")
            for table in tables:
                offsets.append(len(flat))
                rows.append(len(table))
                for row in table:
                    flat.extend(row)
            sizes = array("l")
            for w, h in tile.level_sizes:
                sizes.extend((w, h))
            keep = [flat, offsets, rows, sizes]

            def one(plane: Plane, tile=tile, qw=qw, keep=keep) -> int:
                info = array("l")
                for band in plane.bands:
                    info.extend((band.offset, band.size, band.width, band.height, band.mult, band.base, band.shift,
                                 band.col_start, band.col_end, band.row_start, band.row_end))
                keep.append(info)
                oy, ox = plane.number >> 1, plane.number & 1
                first = base_addr + 2 * ((2 * tile.row + oy) * stride + 2 * tile.col + ox)
                flat_, offsets_, rows_, sizes_ = keep[:4]
                return fn(sample, len(sample), tile.levels, info.buffer_info()[0], sizes_.buffer_info()[0], tile.flags,
                          flat_.buffer_info()[0], offsets_.buffer_info()[0], rows_.buffer_info()[0], qw, tile.width,
                          tile.height, bits, ctypes.c_void_p(first), stride)

            results.extend(pool.map(one, tile.planes))
    return min(results) if results else -1


def decode_sensor(sample: bytes, head, out, engine: str = "auto") -> None:
    """Decode a C-RAW sample into ``out`` (``width * height`` 16-bit sensels, row-major), as ``cr3.decode_sensor``."""

    from array import array

    from shootflow import cr3

    w, h = head.width, head.height
    pw, ph = w // 2, h // 2
    grid = cr3.tile_grid(head) if (head.tile_width, head.tile_height) != (head.width, head.height) else None
    layout = read_layout(sample, head.header_size, head.levels, head.planes, pw, ph, grid)
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
    for tile in layout.tiles:
        tables = tile_tables(sample, tile)
        for plane in tile.planes:
            oy, ox = plane.number >> 1, plane.number & 1
            for y, row in enumerate(decode_plane(sample, tile, plane, tables)):
                base = (2 * (tile.row + y) + oy) * w + 2 * tile.col + ox
                out[base : base + 2 * tile.width : 2] = array("H", (0 if v + mid < 0 else (top if v + mid > top else v + mid) for v in row))
