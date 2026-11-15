"""Fujifilm compressed RAF, lossless and lossy (``shootflow.raf_compressed``), and its C strip decoder.

Real files (lossless: X-T2, X-H1, X-T3, X-S10 X-Trans and GFX 50S Bayer; lossy: X-S10 and X-E4)
were checked sensel for sensel against LibRaw (``tools/raf_libraw_check.py``,
``eval/fujifilm-compressed-raf-2026-11-15.md``, ``eval/fujifilm-lossy-raf-2026-11-15.md``); they
are 18-50 MB, so they are not in the repository. Here an encoder written for the test (the
coding run backwards: same predictions, quantisers and contexts, the residual written instead
of read) makes small streams, X-Trans and Bayer, 12 and 14 bits, several strips with a narrow
last one. Lossless, both decoders must give the sensels back exactly; lossy, they must give
back what the encoder reconstructed (each sensel within the line group's quantisation base of
the input, wrap-around aside).
"""

from __future__ import annotations

import random
import struct
import sys
import unittest
from array import array
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from shootflow import ljpeg_native, raf
from shootflow import raf_compressed as rc
from shootflow import raw_develop as rd
from test_raf import XE1_PATTERN, _fuji_tiff, _record


class _BitWriter:
    def __init__(self) -> None:
        self.out = bytearray()
        self.acc = 0
        self.n = 0

    def put(self, value: int, bits: int) -> None:
        for i in range(bits - 1, -1, -1):
            self.acc = (self.acc << 1) | ((value >> i) & 1)
            self.n += 1
            if self.n == 8:
                self.out.append(self.acc)
                self.acc = 0
                self.n = 0

    def done(self) -> bytes:
        if self.n:
            self.out.append(self.acc << (8 - self.n))
            self.acc = self.n = 0
        return bytes(self.out) + bytes(8)


def _entry_map(xtrans: bool, row: int, x: int) -> tuple[int, int]:
    if xtrans:
        colour = rc.XTRANS_ABS[row][x % 6]
        idx = (((x * 2 // 3) & ~1) | ((x % 3) & 1)) + ((x % 3) >> 1)
    else:
        colour = rc.BAYER_ABS[row & 1][x & 1]
        idx = x >> 1
    return colour, idx


def encode_strip(
    frame: list[list[int]], x0: int, width: int, bits: int, block: int, xtrans: bool, q_bases: list[int] | None = None
) -> tuple[bytes, list[list[int]]]:
    """One strip of ``frame`` coded as the decoder reads it, and the rows a decoder gets back.

    ``q_bases`` (one per six-row group) makes a lossy stream: each residual is rounded to the
    group's step ``2 * q_base + 1``, so the rows returned are the reconstruction, not ``frame``.
    """

    lw = block * 2 // 3 if xtrans else block // 2
    params = rc.Params(bits, lw)
    stride = lw + 2
    buf = [[0] * stride for _ in range(18)]
    ge = [[[params.max_diff, 1] for _ in range(41)] for _ in range(3)]
    go = [[[params.max_diff, 1] for _ in range(41)] for _ in range(3)]
    side = params.side
    se = [[[[max(2, (t.total + 0x20) >> 6), 1] for _ in range(5)] for t in side] for _ in range(3)]
    so = [[[[max(2, (t.total + 0x20) >> 6), 1] for _ in range(5)] for t in side] for _ in range(3)]
    masks = rc._coded_masks(xtrans)
    w = _BitWriter()
    top = params.top
    main = params.main0
    rows_out: list[list[int]] = []
    for g in range(len(frame) // 6):
        if q_bases is not None and (g == 0 or q_bases[g] != main.q_base):
            main = rc.main_qtable(q_bases[g], top)
            md = max(2, (main.total + 0x20) >> 6)
            ge = [[[md, 1] for _ in range(41)] for _ in range(3)]
            go = [[[md, 1] for _ in range(41)] for _ in range(3)]
        nside = min(main.q_base, 3)
        # the values each line must hold, from the sensels of the six rows
        target: dict[int, dict[int, int]] = {}
        for row in range(6):
            for x in range(width):
                colour, idx = _entry_map(xtrans, row, x)
                line = rc._line_index(colour, 2 + row if colour == 1 else 2 + row // 2)
                target.setdefault(line, {})[idx] = frame[g * 6 + row][x0 + x]
        for pair_no, (la, lb) in enumerate(rc.PAIRS):
            cts = (ge[pair_no % 3], go[pair_no % 3])
            sts = (se[pair_no % 3], so[pair_no % 3])
            lines = [rc._line_index(*la), rc._line_index(*lb)]
            even, odd = [0, 0], [1, 1]
            while even[0] < lw or odd[0] < lw:
                for step in (0, 1):
                    if (step == 0 and even[0] >= lw) or (step == 1 and even[0] <= 8):
                        continue
                    for k in (0, 1):
                        li = lines[k]
                        cur, up, up2 = buf[li], buf[li - 1], buf[li - 2]
                        p = odd[k] if step else even[k]
                        if step:
                            odd[k] += 2
                        else:
                            even[k] += 2
                        c = p + 1
                        qt, ctx = main, cts[step]
                        if not step:
                            rb, rc_, rd_, rf = up[c], up[c - 1], up[c + 1], up2[c]
                            dcb, dfb, ddb = abs(rc_ - rb), abs(rf - rb), abs(rd_ - rb)
                            if dcb > dfb and dcb > ddb:
                                interp = rf + rd_ + 2 * rb
                            elif ddb > dcb and ddb > dfb:
                                interp = rf + rc_ + 2 * rb
                            else:
                                interp = rd_ + rc_ + 2 * rb
                            if not masks[(la, lb)[k]][p & 3]:
                                cur[c] = interp >> 2
                                continue
                            for t in range(nside):
                                if dfb + dcb <= side[t].max_grad:
                                    qt, ctx = side[t], sts[0][t]
                                    break
                            q = qt.table
                            grad = (q[top + rb - rf] - 4) * qt.mult + (q[top + rc_ - rb] - 4)
                            interp >>= 2
                        else:
                            ra, rb, rc_, rd_, rg = cur[c - 1], up[c], up[c - 1], up[c + 1], cur[c + 1]
                            for t in range(nside):
                                if abs(rc_ - ra) + abs(rb - rc_) <= side[t].max_grad:
                                    qt, ctx = side[t], sts[1][t]
                                    break
                            q = qt.table
                            grad = (q[top + rb - rc_] - 4) * qt.mult + (q[top + rc_ - ra] - 4)
                            if (rb > rc_ and rb > rd_) or (rb < rc_ and rb < rd_):
                                interp = (rg + ra + 2 * rb) >> 2
                            else:
                                interp = (ra + rg) >> 1
                        total, qs = qt.total, qt.step
                        value = target.get(li, {}).get(p, 0)  # past the strip's right edge: anything decodable
                        diff = value - interp if grad >= 0 else interp - value
                        diff = (diff + qt.q_base) // qs if diff >= 0 else -((-diff + qt.q_base) // qs)
                        diff = (diff + total // 2) % total - total // 2
                        code = 2 * diff if diff >= 0 else -2 * diff - 1
                        cx = ctx[abs(grad)]
                        dec = 0
                        if cx[1] < cx[0]:
                            while True:
                                dec += 1
                                if dec > 15 or (cx[1] << dec) >= cx[0]:
                                    break
                            dec = min(dec, 15)
                        sample = code >> dec
                        long_cut = params.max_bits - qt.raw_bits - 1
                        if sample < long_cut:
                            w.put(0, sample)
                            w.put(1, 1)
                            w.put(code & ((1 << dec) - 1), dec)
                        else:
                            w.put(0, long_cut)
                            w.put(1, 1)
                            w.put(code - 1, qt.raw_bits)
                        r = -1 - (code >> 1) if code & 1 else code >> 1
                        cx[0] += abs(r)
                        if cx[1] == params.min_value:
                            cx[0] >>= 1
                            cx[1] >>= 1
                        cx[1] += 1
                        got = interp - r * qs if grad < 0 else interp + r * qs
                        if got < -qt.q_base:
                            got += total * qs
                        elif got > qt.q_base + top:
                            got -= total * qs
                        cur[c] = min(got, top) if got >= 0 else 0
                        if q_bases is None:
                            assert cur[c] == value or value == 0 and li not in target, (cur[c], value)
            for colour in {la[0], lb[0]}:
                for i in range(2, (4, 7, 4)[colour] + 1):
                    bi = rc._line_index(colour, i)
                    buf[bi][0] = buf[bi - 1][1]
                    buf[bi][lw + 1] = buf[bi - 1][lw]
        for row in range(6):
            out = []
            for x in range(width):
                colour, idx = _entry_map(xtrans, row, x)
                line = rc._line_index(colour, 2 + row if colour == 1 else 2 + row // 2)
                out.append(buf[line][idx + 1])
            rows_out.append(out)
        for colour, last in ((0, 4), (1, 7), (2, 4)):
            b0, bl = rc._line_index(colour, 0), rc._line_index(colour, last)
            buf[b0] = list(buf[bl - 1])
            buf[b0 + 1] = list(buf[bl])
            buf[b0 + 2][0] = buf[b0 + 1][1]
            buf[b0 + 2][lw + 1] = buf[b0 + 1][lw]
    return w.done(), rows_out


def encode_with_rows(
    frame: list[list[int]], bits: int, xtrans: bool, block: int = 48, q_bases: list[list[int]] | None = None
) -> tuple[bytes, list[list[int]]]:
    """A whole compressed block (lossy when ``q_bases``, one list per strip, is given) and the frame it decodes to."""

    height, width = len(frame), len(frame[0])
    blocks = -(-width // block)
    coded = [
        encode_strip(frame, b * block, min(block, width - b * block), bits, block, xtrans, q_bases[b] if q_bases else None)
        for b in range(blocks)
    ]
    strips = [c[0] for c in coded]
    version = 0 if q_bases else 1
    head = struct.pack(
        ">HBBBHHHHBH", rc.SIGNATURE, version, 16 if xtrans else 0, bits, height, blocks * block, width, block, blocks, height // 6
    )
    sizes = b"".join(struct.pack(">I", len(s)) for s in strips)
    body = head + sizes
    body += bytes((-len(body)) % 16)
    if q_bases:
        per = (height // 6 + 15) & ~15
        for qb in q_bases:
            body += bytes(qb) + bytes(per - len(qb))
    decoded = [[v for c in coded for v in c[1][y]] for y in range(height)]
    return body + b"".join(strips), decoded


def encode(frame: list[list[int]], bits: int, xtrans: bool, block: int = 48, version: int = 1) -> bytes:
    if version == 0:
        groups = len(frame) // 6
        blocks = -(-len(frame[0]) // block)
        return encode_with_rows(frame, bits, xtrans, block, [[1] * groups for _ in range(blocks)])[0]
    return encode_with_rows(frame, bits, xtrans, block)[0]


def scene(width: int, height: int, bits: int, seed: int) -> list[list[int]]:
    """Smooth gradients, an edge, noise and a few clipped and black sensels: every code path."""

    rng = random.Random(seed)
    top = (1 << bits) - 1
    rows = []
    for y in range(height):
        row = []
        for x in range(width):
            v = (x * 37 + y * 23) % (top // 3) + (top // 2 if x > width // 2 else 0) + rng.randrange(-40, 41)
            if rng.random() < 0.01:
                v = rng.choice((0, top, rng.randrange(top + 1)))
            row.append(max(0, min(top, v)))
        rows.append(row)
    return rows


def flat(frame: list[list[int]]) -> array:
    return array("H", [v for row in frame for v in row])


class RoundTripTests(unittest.TestCase):
    def check(self, width, height, bits, xtrans, block=48, seed=1):
        frame = scene(width, height, bits, seed)
        blob = encode(frame, bits, xtrans, block)
        head, got = rc.decode(blob, native=False)
        self.assertEqual((head.width, head.height, head.bits, head.xtrans), (width, height, bits, xtrans))
        self.assertEqual(got, flat(frame))
        if ljpeg_native.fuji_strip_function() is not None:
            _, native = rc.decode(blob, native=True)
            self.assertEqual(native, got)
        return blob

    def test_xtrans_14_bit_several_strips_narrow_last(self):
        self.check(width=132, height=24, bits=14, xtrans=True)  # strips of 48, 48, 36

    def test_xtrans_12_bit(self):
        self.check(width=96, height=18, bits=12, xtrans=True, seed=2)

    def test_bayer_14_bit(self):
        self.check(width=100, height=18, bits=14, xtrans=False, seed=3)

    def test_wide_residuals_take_the_long_code(self):
        # Alternating black and white columns: residuals near full scale, coded with the raw-bits escape.
        frame = [[(1 << 14) - 1 if (x // 3 + y) % 2 else 0 for x in range(48)] for y in range(12)]
        blob = encode(frame, 14, True)
        self.assertEqual(rc.decode(blob, native=False)[1], flat(frame))

    def test_truncated_stream_is_an_error(self):
        frame = scene(48, 12, 14, 4)
        blob = encode(frame, 14, True)
        with self.assertRaises(rc.CompressedRafError):
            rc.decode(blob[: len(blob) // 3], native=False)
        if ljpeg_native.fuji_strip_function() is not None:
            with self.assertRaises(rc.CompressedRafError):
                rc.decode(blob[: len(blob) // 3], native=True)

    def test_header_checks(self):
        blob = bytearray(encode(scene(48, 12, 14, 5), 14, True))
        self.assertTrue(rc.is_compressed(bytes(blob)))
        self.assertFalse(rc.is_compressed(b"\0" * 16))
        bad = bytearray(blob)
        bad[3] = 7  # raw type
        with self.assertRaisesRegex(rc.CompressedRafError, "raw type"):
            rc.decode(bytes(bad))
        bad = bytearray(blob)
        bad[13] = 3  # blocks no longer cover the width
        with self.assertRaisesRegex(rc.CompressedRafError, "cover the width"):
            rc.decode(bytes(bad))

    def test_coded_entries_match_the_layouts(self):
        # X-Trans: R2 and B2 code only odd entries; G4 and G7 (the rows with two greens) too.
        m = rc._coded_masks(True)
        self.assertEqual(m[(0, 2)], (False, True, False, True))
        self.assertEqual(m[(2, 2)], (False, True, False, True))
        self.assertEqual(m[(1, 4)], (False, True, False, True))
        self.assertEqual(m[(1, 2)], (True, True, True, True))
        self.assertEqual(m[(0, 3)], (False, True, True, True))
        self.assertEqual(m[(0, 4)], (True, True, False, True))
        # Bayer: every entry of every line is a sensel.
        self.assertTrue(all(all(v) for v in rc._coded_masks(False).values()))


def patchy_scene(width: int, height: int, bits: int, seed: int) -> list[list[int]]:
    """Flat patches (sensels within a few counts, where the side quantisers take over) beside busy ones."""

    rng = random.Random(seed)
    top = (1 << bits) - 1
    rows = []
    for y in range(height):
        row = []
        for x in range(width):
            if (x // 16 + y // 6) % 2:
                v = top // 5 + rng.randrange(-2, 3)
            else:
                v = (x * 53 + y * 31) % (top // 2) + rng.randrange(-60, 61)
            if rng.random() < 0.005:
                v = rng.choice((0, top))
            row.append(max(0, min(top, v)))
        rows.append(row)
    return rows


class LossyTests(unittest.TestCase):
    """Header version 0: residuals rounded to ``2 * q_base + 1``, a base per strip and line group."""

    def check(self, frame, bits, xtrans, q_bases, block=48):
        blob, expected = encode_with_rows(frame, bits, xtrans, block, q_bases)
        head, got = rc.decode(blob, native=False)
        self.assertFalse(head.lossless)
        self.assertEqual(got, flat(expected))
        if ljpeg_native.fuji_strip_function() is not None:
            self.assertEqual(rc.decode(blob, native=True)[1], got)
        # each sensel lands within the group's base of the input (none of these scenes wraps)
        for y, (want, have) in enumerate(zip(frame, expected)):
            for x, (a, b) in enumerate(zip(want, have)):
                self.assertLessEqual(abs(a - b), q_bases[x // block][y // 6], (y, x))
        return expected

    def test_xtrans_bases_change_between_groups(self):
        # bases 0 to 6 across five groups: the main quantiser is rebuilt and all three side ones used
        frame = patchy_scene(132, 30, 14, 7)
        expected = self.check(frame, 14, True, [[1, 5, 0, 2, 6], [3, 3, 1, 4, 2], [6, 0, 2, 2, 1]])
        self.assertNotEqual(expected, frame)  # lossy: some sensels moved

    def test_bayer_12_bit(self):
        self.check(patchy_scene(100, 18, 12, 8), 12, False, [[2, 1, 4], [1, 7, 3], [3, 3, 3]])

    def test_base_zero_throughout_is_exact(self):
        # a lossy stream whose bases are all 0 is the lossless coding with the version byte at 0
        frame = scene(96, 18, 14, 9)
        self.assertEqual(self.check(frame, 14, True, [[0, 0, 0], [0, 0, 0]]), frame)

    def test_side_quantisers(self):
        side = rc.side_qtables((1 << 14) - 1)
        self.assertEqual([(t.q_base, t.max_grad, t.mult, t.total) for t in side], [(0, 5, 3, 16384), (1, 6, 3, 5462), (2, 7, 3, 3278)])
        main = rc.main_qtable(3, (1 << 14) - 1)
        self.assertEqual((main.step, main.total, main.raw_bits, main.mult), (7, 2342, 12, 9))
        self.assertEqual(rc._log2ceil(16384), 14)
        self.assertEqual(rc._log2ceil(5462), 13)

    def test_truncated_bases_are_an_error(self):
        blob, _ = encode_with_rows(scene(48, 12, 14, 4), 14, True, 48, [[1, 1]])
        with self.assertRaisesRegex(rc.CompressedRafError, "quantisation bases"):
            rc.decode(blob[:40])


def make_compressed_raf(xtrans=True, version=1, width=96, height=18, bits=14, seed=6):
    frame = scene(width, height, bits, seed)
    payload = encode(frame, bits, xtrans, version=version)
    records = [
        _record(0x0100, struct.pack(">HH", height, width)),
        _record(0x0110, struct.pack(">HH", 0, 0)),
        _record(0x0111, struct.pack(">HH", height, width)),
        _record(0x0130, b"\x0c\x0c\x0c\x0c"),
    ]
    if xtrans:
        records.append(_record(0x0131, bytes(reversed(XE1_PATTERN))))
    cfa = _fuji_tiff(width, height, bits, payload, [1022] * 36, (302, 556, 671))
    header = struct.pack(">I", len(records)) + b"".join(records)
    head_at = 148
    cfa_at = (head_at + len(header) + 15) // 16 * 16
    top = bytearray(raf.MAGIC + b"0201FF129502" + b"X-T3".ljust(32, b"\0"))
    top += bytes(84 - len(top))
    top += struct.pack(">6I", 0, 0, head_at, len(header), cfa_at, len(cfa))
    top += bytes(head_at - len(top))
    out = bytearray(top + header)
    out += bytes(cfa_at - len(out))
    return bytes(out) + cfa, flat(frame)


class ParseTests(unittest.TestCase):
    def test_parse_raf_reads_a_compressed_xtrans_file(self):
        blob, expected = make_compressed_raf()
        raw = raf.parse_raf(blob)
        self.assertEqual(raw.values, expected)
        self.assertIn("lossless compressed (X-Trans, 14-bit", raw.notes[0])
        self.assertEqual(raw.ifd.one(rd.TAG_WHITE_LEVEL), 16383)

    def test_bayer_takes_dcraws_white(self):
        blob, expected = make_compressed_raf(xtrans=False, width=100)
        raw = raf.parse_raf(blob)
        self.assertEqual(raw.values, expected)
        self.assertEqual(raw.ifd.one(rd.TAG_WHITE_LEVEL), raf.BAYER_WHITE)

    def test_parse_raf_reads_a_lossy_file(self):
        blob, _ = make_compressed_raf(version=0)
        raw = raf.parse_raf(blob)
        self.assertIn("lossy compressed (X-Trans, 14-bit", raw.notes[0])
        payload = encode(scene(96, 18, 14, 6), 14, True, version=0)
        self.assertEqual(raw.values, rc.decode(payload, native=False)[1])


if __name__ == "__main__":
    unittest.main()
