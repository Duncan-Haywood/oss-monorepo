"""Fujifilm's compressed RAF sensor data, lossless and lossy, standard library only.

From the X-Pro2 and X-T2 on, Fujifilm bodies can store their sensor data with a
lossless compression of their own (a menu choice; later bodies, X-S10 and X-E4 among
them, also offer a lossy one). The data block then starts with a 16-byte big-endian header::

    0  0x4953     signature
    2  version    (1 lossless, 0 lossy)
    3  raw type   (16 X-Trans, 0 Bayer)
    4  bits       (12 or 14)
    5  height, rounded width, width, block width (768), blocks per row, line groups

then one 32-bit big-endian byte count per block (padded to 16 bytes), then (lossy
only) ``(line groups + 15) & ~15`` quantisation bases per block, then the blocks. A block is a vertical strip of the frame, ``block width`` sensels wide (the
last one narrower), coded independently of the others, six rows at a time.

**Line buffers.** Inside a strip, each group of six rows is held as 18 lines of
``line width + 2`` values (one pad at each end): red R0..R4, green G0..G7 and blue
B0..B4. R0, R1, G0, G1, B0 and B1 are the previous group's last lines (zero at the
top). The six rows are coded as six pairs of lines, in this order::

    (R2, G2)  (G3, B2)  (R3, G4)  (G5, B3)  (R4, G6)  (G7, B4)

Row ``k`` of the group reads its greens from ``G(2 + k)`` and its reds and blues
from ``R(2 + k // 2)`` and ``B(2 + k // 2)``. On X-Trans a line is two thirds of
the strip's width: sensel ``x`` reads entry ``(2x/3 & ~1 | x % 3 & 1) + (x % 3) // 2``
(six sensels to four entries, 0 1 1 2 3 3); on Bayer it is half, entry ``x // 2``.

**Coding.** Each pair is coded left to right, the even entries of both lines first
(a sensel ahead), the odd ones eight entries behind so their right neighbour is
known. An entry is predicted from its decoded neighbours (above, above-left,
above-right and two lines up for an even entry; left, right and above for an odd
one), a quantised gradient of those neighbours picks one of 41 adaptive contexts
(three sets, by the pair's index mod 3, kept per strip), and the residual follows
as a unary prefix (count of zero bits) and a suffix whose length the context's
running mean of residual sizes sets (zig-zag sign). An X-Trans line entry that no
sensel of its rows reads is not coded: it is interpolated from the line above
(the same rule as an even prediction) and serves only as context.

**Lossy.** Each strip's line group has a quantisation base ``q`` (0 to 13 on the two
real files). A residual is then a count of steps of ``2q + 1``, so a sensel can land up
to ``q`` from the camera's value; the gradient quantiser's thresholds widen with ``q``
(``main_qtable``), and the 41 contexts restart whenever ``q`` changes. Where the
neighbours are nearly flat (summed differences at most 5, 6 or 7) and ``q`` is at least
1, 2 or 3, one of three fixed side quantisers (bases 0, 1, 2, with five contexts each,
kept for the whole strip) is used instead (``side_qtables``). The camera picks ``q`` to
hold a bit budget: both real files sit at 4.75 bits a sensel.

An independent implementation of the format as LibRaw (``fuji_compressed.cpp``)
reads it: written in this repository's own terms, from the layout described
above (Fujifilm publishes no specification; the format is known from open-source
decoders such as LibRaw's and rawspeed's, credited here, whose code is not used),
and checked value for value against LibRaw 0.22 on real files
(``tools/raf_compressed_check.py``,
``eval/fujifilm-compressed-raf-2026-11-15.md``). No LibRaw code is used.
"""

from __future__ import annotations

from array import array

SIGNATURE = 0x4953

# Pair order inside a six-row group: (first line, second line) as (colour, index).
# Colour 0 red, 1 green, 2 blue; red and blue indices 2..4, green 2..7.
PAIRS = (((0, 2), (1, 2)), ((1, 3), (2, 2)), ((0, 3), (1, 4)), ((1, 5), (2, 3)), ((0, 4), (1, 6)), ((1, 7), (2, 4)))

# The absolute X-Trans layout the compressed format assumes (row-major, 0 R 1 G 2 B);
# every compressed X-Trans body checked here stores it with this phase.
XTRANS_ABS = (
    (1, 1, 0, 1, 1, 2),
    (1, 1, 2, 1, 1, 0),
    (2, 0, 1, 0, 2, 1),
    (1, 1, 2, 1, 1, 0),
    (1, 1, 0, 1, 1, 2),
    (0, 2, 1, 2, 0, 1),
)
BAYER_ABS = ((0, 1), (1, 2))  # RGGB


class CompressedRafError(ValueError):
    pass


class Header:
    __slots__ = ("version", "raw_type", "bits", "height", "rounded_width", "width", "block_size", "blocks", "lines")

    def __init__(self, buf: bytes) -> None:
        if len(buf) < 16:
            raise CompressedRafError("compressed RAF: header truncated")
        sig = buf[0] << 8 | buf[1]
        if sig != SIGNATURE:
            raise CompressedRafError("compressed RAF: no 0x4953 signature")
        self.version = buf[2]
        self.raw_type = buf[3]
        self.bits = buf[4]
        self.height = buf[5] << 8 | buf[6]
        self.rounded_width = buf[7] << 8 | buf[8]
        self.width = buf[9] << 8 | buf[10]
        self.block_size = buf[11] << 8 | buf[12]
        self.blocks = buf[13]
        self.lines = buf[14] << 8 | buf[15]

    @property
    def lossless(self) -> bool:
        return self.version == 1

    @property
    def xtrans(self) -> bool:
        return self.raw_type == 16

    def check(self) -> None:
        if self.version not in (0, 1):
            raise CompressedRafError(f"compressed RAF: header version {self.version} is not read here")
        if self.raw_type not in (0, 16):
            raise CompressedRafError(f"compressed RAF: raw type {self.raw_type} is not read here")
        if self.bits not in (12, 14, 16) or not self.block_size or self.block_size % 6:
            raise CompressedRafError("compressed RAF: implausible bits or block width")
        if not self.width or not self.height or self.lines * 6 != self.height:
            raise CompressedRafError("compressed RAF: the line groups do not cover the height")
        if self.blocks * self.block_size != self.rounded_width or self.width > self.rounded_width:
            raise CompressedRafError("compressed RAF: the blocks do not cover the width")


def is_compressed(buf: bytes) -> bool:
    return len(buf) >= 16 and (buf[0] << 8 | buf[1]) == SIGNATURE


def _log2ceil(v: int) -> int:
    """Bits needed for ``v`` distinct values (LibRaw's ``log2ceil``: 1 -> 1, 2 -> 1, 3 -> 2, 16384 -> 14)."""

    r = 0
    v -= 1
    if v >= 0:
        while True:
            r += 1
            v >>= 1
            if not v:
                break
    return r


def _qlut(points: tuple[int, int, int, int, int]) -> bytearray:
    """Gradient quantiser over differences ``-top..top``, stored +4 so entries are 0..8."""

    q = points
    top = q[4]
    table = bytearray(2 * top + 1)
    for i in range(2 * top + 1):
        v = i - top
        if v <= -q[3]:
            t = -4
        elif v <= -q[2]:
            t = -3
        elif v <= -q[1]:
            t = -2
        elif v < -q[0]:
            t = -1
        elif v <= q[0]:
            t = 0
        elif v < q[1]:
            t = 1
        elif v < q[2]:
            t = 2
        elif v < q[3]:
            t = 3
        else:
            t = 4
        table[i] = t + 4
    return table


class QTable:
    """One quantiser: a gradient table and the residual step ``2 * q_base + 1``.

    ``total`` is how many residual codes there are, ``raw_bits`` the escape's length,
    ``mult`` the weight of the first gradient and ``max_grad`` (side tables only)
    the largest summed neighbour difference the table is used for.
    """

    __slots__ = ("q_base", "table", "total", "raw_bits", "mult", "max_grad", "step")

    def __init__(self, q_base: int, points: tuple[int, int, int, int, int], total: int, mult: int, max_grad: int) -> None:
        self.q_base = q_base
        self.table = _qlut(points)
        self.total = total
        self.raw_bits = _log2ceil(total)
        self.mult = mult
        self.max_grad = max_grad
        self.step = 2 * q_base + 1


def main_qtable(q_base: int, top: int) -> QTable:
    """The main quantiser for a line group whose quantisation base is ``q_base`` (0 is lossless)."""

    top1 = top + 1
    p1 = 3 * q_base + 0x12
    p2 = 5 * q_base + 0x43
    p3 = 7 * q_base + 0x114
    if p1 >= top1 or p1 < q_base + 1:
        p1 = q_base + 1
    if p2 < p1 or p2 >= top1:
        p2 = p1
    if p3 < p2 or p3 >= top1:
        p3 = p2
    total = (top + 2 * q_base) // (2 * q_base + 1) + 1
    return QTable(q_base, (q_base, p1, p2, p3, top), total, 9, 0)


def side_qtables(top: int) -> tuple[QTable, QTable, QTable]:
    """The three fixed quantisers a lossy stream uses in flat areas (bases 0, 1, 2)."""

    out = []
    for q_base, pts, max_grad in ((0, (0x12, 0x43, 0x114), 5), (1, (0x15, 0x48, 0x11B), 6), (2, (0x18, 0x4D, 0x122), 7)):
        p1 = pts[0] if top >= pts[0] else q_base + 1
        p2 = pts[1] if top >= pts[1] else p1
        p3 = pts[2] if top >= pts[2] else p2
        total = (top + 2 * q_base) // (2 * q_base + 1) + 1
        out.append(QTable(q_base, (q_base, p1, p2, p3, top), total, 3, max_grad))
    return out[0], out[1], out[2]


class Params:
    """The constants for a stream of ``bits`` bits (the lossless main quantiser in ``q_table``)."""

    def __init__(self, bits: int, line_width: int) -> None:
        self.bits = bits
        self.line_width = line_width
        top = (1 << bits) - 1
        self.top = top
        self.total = 1 << bits
        self.max_bits = 4 * _log2ceil(top + 1)
        self.max_diff = 1 << (bits - 6)
        self.min_value = 0x40
        self.main0 = main_qtable(0, top)
        self.q_table = self.main0.table
        self.side = side_qtables(top)


def _coded_masks(xtrans: bool) -> dict[tuple[int, int], tuple[bool, bool, bool, bool]]:
    """For each line, which of its entries (mod 4) some sensel of its rows reads."""

    out: dict[tuple[int, int], list[bool]] = {}
    for a, b in PAIRS:
        out[a] = [False] * 4
        out[b] = [False] * 4
    for row in range(6):
        for x in range(12):
            if xtrans:
                colour = XTRANS_ABS[row][x % 6]
                idx = (((x * 2 // 3) & ~1) | ((x % 3) & 1)) + ((x % 3) >> 1)
            else:
                colour = BAYER_ABS[row & 1][x & 1]
                idx = x >> 1
            line = (colour, 2 + row) if colour == 1 else (colour, 2 + row // 2)
            out[line][idx % 4] = True
    return {k: (v[0], v[1], v[2], v[3]) for k, v in out.items()}


def _line_index(colour: int, i: int) -> int:
    """Position of line (colour, i) in the 18-line buffer: R0..R4, G0..G7, B0..B4."""

    return (0, 5, 13)[colour] + i


class _Bits:
    """MSB-first bit reader over one strip."""

    __slots__ = ("data", "pos", "end", "acc", "n")

    def __init__(self, data: bytes, start: int, end: int) -> None:
        self.data = data
        self.pos = start
        self.end = end
        self.acc = 0
        self.n = 0


def decode_strip(
    data: bytes,
    start: int,
    end: int,
    params: Params,
    lines: int,
    strip_width: int,
    xtrans: bool,
    q_bases: bytes | None = None,
) -> list[array]:
    """Decode one strip: ``6 * lines`` rows of ``strip_width`` sensels each.

    ``q_bases`` (a lossy stream only) holds the strip's quantisation base for each line
    group; ``None`` is the lossless stream (base 0 throughout).
    """

    lw = params.line_width
    stride = lw + 2
    buf = [array("i", [0]) * stride for _ in range(18)]
    top = params.top
    max_bits = params.max_bits
    min_value = params.min_value
    side = params.side
    main = params.main0
    # grads[set][gradient] = [sum of |residual|, count]
    grads_even = [[[params.max_diff, 1] for _ in range(41)] for _ in range(3)]
    grads_odd = [[[params.max_diff, 1] for _ in range(41)] for _ in range(3)]
    # a lossy stream's side quantisers keep five contexts each, per set, for the whole strip
    side_even = [[[[max(2, (t.total + 0x20) >> 6), 1] for _ in range(5)] for t in side] for _ in range(3)]
    side_odd = [[[[max(2, (t.total + 0x20) >> 6), 1] for _ in range(5)] for t in side] for _ in range(3)]
    masks = _coded_masks(xtrans)

    src = data
    pos = start
    acc = 0
    nbits = 0
    errors = 0

    rows: list[array] = []

    for group in range(lines):
        if q_bases is not None:
            qb = q_bases[group]
            if group == 0 or qb != main.q_base:
                main = main_qtable(qb, top)
                md = max(2, (main.total + 0x20) >> 6)
                grads_even = [[[md, 1] for _ in range(41)] for _ in range(3)]
                grads_odd = [[[md, 1] for _ in range(41)] for _ in range(3)]
        main_base = main.q_base
        for pair_no, (la, lb) in enumerate(PAIRS):
            gset = pair_no % 3
            ge = grads_even[gset]
            go = grads_odd[gset]
            se = side_even[gset]
            so = side_odd[gset]
            lines_here = []
            for colour, idx in (la, lb):
                bi = _line_index(colour, idx)
                lines_here.append((buf[bi], buf[bi - 1], buf[bi - 2], masks[(colour, idx)]))
            even = [0, 0]
            odd = [1, 1]
            while even[0] < lw or odd[0] < lw:
                for step in (0, 1):
                    if step == 0:
                        if even[0] >= lw:
                            continue
                        which = even
                    else:
                        if even[0] <= 8:
                            continue
                        which = odd
                    for li in (0, 1):
                        cur, up, up2, mask = lines_here[li]
                        p = which[li]
                        which[li] = p + 2
                        c = p + 1  # buffer index (pad at 0)
                        if step == 0:
                            rb = up[c]
                            rc = up[c - 1]
                            rd = up[c + 1]
                            rf = up2[c]
                            d_cb = rc - rb if rc > rb else rb - rc
                            d_fb = rf - rb if rf > rb else rb - rf
                            d_db = rd - rb if rd > rb else rb - rd
                            if d_cb > d_fb and d_cb > d_db:
                                interp = rf + rd + 2 * rb
                            elif d_db > d_cb and d_db > d_fb:
                                interp = rf + rc + 2 * rb
                            else:
                                interp = rd + rc + 2 * rb
                            if not mask[p & 3]:
                                cur[c] = interp >> 2
                                continue
                            qt = main
                            ctx = ge
                            if main_base:
                                flat = d_fb + d_cb
                                for si in range(3 if main_base >= 3 else main_base):
                                    if flat <= side[si].max_grad:
                                        qt = side[si]
                                        ctx = se[si]
                                        break
                            qtab = qt.table
                            grad = (qtab[top + rb - rf] - 4) * qt.mult + (qtab[top + rc - rb] - 4)
                            interp >>= 2
                        else:
                            ra = cur[c - 1]
                            rb = up[c]
                            rc = up[c - 1]
                            rd = up[c + 1]
                            rg = cur[c + 1]
                            qt = main
                            ctx = go
                            if main_base:
                                flat = (rc - ra if rc > ra else ra - rc) + (rb - rc if rb > rc else rc - rb)
                                for si in range(3 if main_base >= 3 else main_base):
                                    if flat <= side[si].max_grad:
                                        qt = side[si]
                                        ctx = so[si]
                                        break
                            qtab = qt.table
                            grad = (qtab[top + rb - rc] - 4) * qt.mult + (qtab[top + rc - ra] - 4)
                            if (rb > rc and rb > rd) or (rb < rc and rb < rd):
                                interp = (rg + ra + 2 * rb) >> 2
                            else:
                                interp = (ra + rg) >> 1
                        gradient = grad if grad >= 0 else -grad
                        g = ctx[gradient]
                        # unary prefix: count zero bits up to a one
                        sample = 0
                        while True:
                            if nbits == 0:
                                if pos < end:
                                    acc = src[pos]
                                    pos += 1
                                else:
                                    acc = 0
                                    errors += 1
                                nbits = 8
                            nbits -= 1
                            if (acc >> nbits) & 1:
                                break
                            sample += 1
                            if errors > 64:  # past the end, reading zeros: stop
                                raise CompressedRafError("compressed RAF: the strip ends early (truncated or corrupt)")
                        raw_bits = qt.raw_bits
                        if sample < max_bits - raw_bits - 1:
                            v1, v2 = g[0], g[1]
                            dec = 0
                            if v2 < v1:
                                while True:
                                    dec += 1
                                    if dec > 15 or (v2 << dec) >= v1:
                                        break
                                if dec > 15:
                                    dec = 15
                            k = dec
                            code = 0
                            while k:
                                if nbits == 0:
                                    if pos < end:
                                        acc = src[pos]
                                        pos += 1
                                    else:
                                        acc = 0
                                        errors += 1
                                    nbits = 8
                                take = k if k < nbits else nbits
                                nbits -= take
                                code = (code << take) | ((acc >> nbits) & ((1 << take) - 1))
                                k -= take
                            code += sample << dec
                        else:
                            k = raw_bits
                            code = 0
                            while k:
                                if nbits == 0:
                                    if pos < end:
                                        acc = src[pos]
                                        pos += 1
                                    else:
                                        acc = 0
                                        errors += 1
                                    nbits = 8
                                take = k if k < nbits else nbits
                                nbits -= take
                                code = (code << take) | ((acc >> nbits) & ((1 << take) - 1))
                                k -= take
                            code += 1
                        total = qt.total
                        if code < 0 or code >= total:
                            errors += 1
                        if code & 1:
                            code = -1 - (code >> 1)
                        else:
                            code >>= 1
                        g[0] += code if code >= 0 else -code
                        if g[1] == min_value:
                            g[0] >>= 1
                            g[1] >>= 1
                        g[1] += 1
                        qstep = qt.step
                        if grad < 0:
                            interp -= code * qstep
                        else:
                            interp += code * qstep
                        if interp < -qt.q_base:
                            interp += total * qstep
                        elif interp > qt.q_base + top:
                            interp -= total * qstep
                        cur[c] = (interp if interp <= top else top) if interp >= 0 else 0
            # extend the pads of both colours' lines from the line before each
            for colour in {la[0], lb[0]}:
                first = (2, 2, 2)[colour]
                last = (4, 7, 4)[colour]
                for i in range(first, last + 1):
                    bi = _line_index(colour, i)
                    buf[bi][0] = buf[bi - 1][1]
                    buf[bi][lw + 1] = buf[bi - 1][lw]
        # copy the six rows out
        for row in range(6):
            out = array("H", [0]) * strip_width
            gl = buf[_line_index(1, 2 + row)]
            rl = buf[_line_index(0, 2 + row // 2)]
            bl = buf[_line_index(2, 2 + row // 2)]
            pick = (rl, gl, bl)
            for x in range(strip_width):
                if xtrans:
                    colour = XTRANS_ABS[row][x % 6]
                    idx = (((x * 2 // 3) & ~1) | ((x % 3) & 1)) + ((x % 3) >> 1)
                else:
                    colour = BAYER_ABS[row & 1][x & 1]
                    idx = x >> 1
                out[x] = pick[colour][idx + 1]
            rows.append(out)
        # the last two lines of each colour become the next group's history
        for colour, last in ((0, 4), (1, 7), (2, 4)):
            b0 = _line_index(colour, 0)
            b_last = _line_index(colour, last)
            buf[b0][:] = buf[b_last - 1]
            buf[b0 + 1][:] = buf[b_last]
            buf[b0 + 2][0] = buf[b0 + 1][1]
            buf[b0 + 2][lw + 1] = buf[b0 + 1][lw]
    if errors:
        raise CompressedRafError(f"compressed RAF: {errors} coding errors in a strip (corrupt or not a lossless stream)")
    return rows


def _layout(buf: bytes) -> tuple[Header, Params, list[tuple[int, int, int]], list[bytes | None]]:
    """The header, constants, each strip's (start, end, width) and its quantisation bases.

    A lossy stream stores, after the block sizes, ``(lines + 15) & ~15`` bytes per strip:
    one quantisation base for each six-row group of that strip.
    """

    h = Header(buf)
    h.check()
    lw = (h.block_size * 2) // 3 if h.xtrans else h.block_size // 2
    params = Params(h.bits, lw)
    sizes_at = 16
    if len(buf) < sizes_at + 4 * h.blocks:
        raise CompressedRafError("compressed RAF: the block sizes are truncated")
    sizes = [int.from_bytes(buf[sizes_at + 4 * i : sizes_at + 4 * i + 4], "big") for i in range(h.blocks)]
    start = sizes_at + 4 * h.blocks
    start += (-start) % 16
    q_bases: list[bytes | None] = [None] * h.blocks
    if not h.lossless:
        per = (h.lines + 15) & ~15
        if len(buf) < start + per * h.blocks:
            raise CompressedRafError("compressed RAF: the quantisation bases are truncated")
        q_bases = [bytes(buf[start + per * b : start + per * b + h.lines]) for b in range(h.blocks)]
        start += per * h.blocks
    strips = []
    for b, size in enumerate(sizes):
        width = min(h.block_size, h.width - b * h.block_size)
        strips.append((start, min(start + size, len(buf)), max(0, width)))
        start += size
    return h, params, strips, q_bases


def decode(
    buf: bytes, max_groups: int | None = None, only_blocks: list[int] | None = None, native: bool | None = None
) -> tuple[Header, array]:
    """The whole frame (``6 * groups`` rows of ``width``, row-major) from a compressed data block.

    The C strip decoder in ``ljpeg_native`` runs when it builds (strips in parallel on
    ``SHOOTFLOW_THREADS`` threads, default up to 4); ``native=False`` forces the Python
    reference, ``native=True`` requires C.
    """

    h, params, strips, q_bases = _layout(buf)
    lines = h.lines if max_groups is None else min(h.lines, max_groups)
    out = array("H", [0]) * (h.width * 6 * lines)
    wanted = [b for b in range(len(strips)) if (only_blocks is None or b in only_blocks) and strips[b][2] > 0]
    fn = None
    if native is not False:
        from shootflow import ljpeg_native

        fn = ljpeg_native.fuji_strip_function()
        if fn is None and native:
            raise CompressedRafError("compressed RAF: the native decoder is not available")
    if fn is not None:
        import os
        from concurrent.futures import ThreadPoolExecutor

        data = bytes(buf)
        base = out.buffer_info()[0]

        def run(b: int) -> int:
            start, end, width = strips[b]
            return int(
                fn(
                    data,
                    start,
                    end,
                    h.bits,
                    params.line_width,
                    lines,
                    width,
                    1 if h.xtrans else 0,
                    h.width,
                    base + 2 * b * h.block_size,
                    q_bases[b],
                )
            )

        threads = max(1, min(int(os.environ.get("SHOOTFLOW_THREADS", "0") or 0) or min(4, os.cpu_count() or 1), len(wanted) or 1))
        with ThreadPoolExecutor(max_workers=threads) as pool:
            errors = list(pool.map(run, wanted))
        if any(errors):
            raise CompressedRafError(
                f"compressed RAF: {sum(e for e in errors if e > 0)} coding errors (corrupt or not a lossless stream)"
            )
        return h, out
    for b in wanted:
        start, end, width = strips[b]
        rows = decode_strip(buf, start, end, params, lines, width, h.xtrans, q_bases[b])
        x0 = b * h.block_size
        for y, row in enumerate(rows):
            out[y * h.width + x0 : y * h.width + x0 + width] = row
    return h, out
