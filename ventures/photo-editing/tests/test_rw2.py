"""Panasonic RW2 read straight into the developer (``shootflow.rw2``).

Each test builds a small RW2 here: a TIFF with the RW2 magic ("IIU\\0") whose
IFD0 holds Panasonic's sensor size, borders, CFA code, black levels and white
balance tags, and a RawDataOffset pointing at sensor data coded by an encoder in
this file. The encoder picks a shift for every three sensels and writes each
value through the decoder's own bit addressing (rotated 0x4000-byte blocks,
17-bit positions read downward), so every decoded sensel is checked exactly, on
the C decoder and the Python reference. Four real RW2s against LibRaw (every
sensel equal): ``tools/rw2_libraw_check.py`` and
``eval/panasonic-rw2-reader-2026-11-14.md``.
"""

from __future__ import annotations

import io
import random
import struct
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from shootflow import camera_profiles, ljpeg_native, raw_preview, rw2
from shootflow import raw_develop as rd
from shootflow.cli import main
from test_arw import make_profile
from test_raw_develop import _ifd_bytes

W, H = 36, 10


class _PanaWriter:
    """Writes values where ``rw2._decode_python``'s ``bits`` reads them: blocks of 0x4000 bytes in their rotated
    order, 17-bit positions counting down from the top of each block."""

    def __init__(self):
        self.blocks: list[bytearray] = []
        self.vbits = 0
        self.set: list[set] = []

    def put(self, value: int, n: int) -> None:
        if self.vbits == 0:
            self.blocks.append(bytearray(rw2.BLOCK + 1))
            self.set.append(set())
            self.vbits = 0x20000  # a fresh block: positions count down from its top
        assert self.vbits >= n, "a value straddling two blocks: pick another size"
        self.vbits = (self.vbits - n) & 0x1FFFF
        buf, used = self.blocks[-1], self.set[-1]
        at = (self.vbits >> 3) ^ 0x3FF0
        shift = self.vbits & 7
        for k in range(n):
            byte, bit = at + (shift + k) // 8, (shift + k) % 8
            assert (byte, bit) not in used, "two values on one bit"
            used.add((byte, bit))
            if (value >> k) & 1:
                buf[byte] |= 1 << bit

    def file_bytes(self) -> bytes:
        """The blocks as the camera writes them: each rotated back (its first 0x2008 bytes go last)."""

        out = bytearray()
        for b in self.blocks:
            b = bytes(b[: rw2.BLOCK])
            out += b[rw2.SPLIT :] + b[: rw2.SPLIT]
        assert rw2.rotated_blocks(bytes(out)) == b"".join(bytes(b[: rw2.BLOCK]) for b in self.blocks)
        return bytes(out)


def _step(pred: int, sh: int, j: int) -> int:
    """The decoder's update for a non-zero step ``j`` at shift ``sh``."""

    pred -= 0x80 << sh
    if pred < 0 or sh == 4:
        pred &= ~(-1 << sh)
    return pred + (j << sh)


def _code(pred: int, sh: int, v: int) -> int | None:
    """The 8-bit step that takes ``pred`` to ``v`` at shift ``sh``, or None."""

    if v == pred:
        return 0
    for j in range(1, 256):
        if _step(pred, sh, j) == v:
            return j
    return None


SHIFT_CODE = {0: 0, 1: 1, 2: 2, 4: 3}  # sh = 4 >> (3 - code)


def encode(values, width, height):
    """Panasonic-compress 12-bit ``values`` (row-major) into RawFormat 4 sensor data; returns (bytes, shifts used)."""

    wr = _PanaWriter()
    used = set()
    for row in range(height):
        base = row * width
        pred, nonz, sh = [0, 0], [0, 0], 0
        col = 0
        while col < width:
            i = col % rw2.RUN
            if i == 0:
                pred, nonz = [0, 0], [0, 0]
            if i % 3 == 2:
                # The smallest shift that codes the next three sensels (fewer when the row or run ends).
                span = [c for c in range(col, min(col + 3, width)) if c // rw2.RUN == col // rw2.RUN]
                for sh in (0, 1, 2, 4):
                    p, nz, ok = list(pred), list(nonz), True
                    for c in span:
                        q, v = (c % rw2.RUN) & 1, values[base + c]
                        if not nz[q]:  # a first value is coded whole, at any shift
                            nz[q] = v >> 4
                            if nz[q] or c % rw2.RUN > 11:
                                p[q] = v
                            continue
                        j = _code(p[q], sh, v)
                        if j is None:
                            ok = False
                            break
                        if j:
                            p[q] = _step(p[q], sh, j)
                    if ok:
                        break
                else:
                    raise AssertionError(f"no shift codes row {row} columns {span}")
                wr.put(SHIFT_CODE[sh], 2)
                used.add(sh)
            q = i & 1
            v = values[base + col]
            if nonz[q]:
                j = _code(pred[q], sh, v)
                assert j is not None
                wr.put(j, 8)
                if j:
                    pred[q] = _step(pred[q], sh, j)
            else:
                assert v == 0 or v >= 16 or i > 11, "a run's first value per parity is 0 or at least 16"
                nonz[q] = v >> 4
                wr.put(nonz[q], 8)
                if nonz[q] or i > 11:
                    wr.put(v & 15, 4)
                    pred[q] = v
            assert pred[q] == v
            col += 1
    return wr.file_bytes(), used


def field(seed=3, width=W, height=H):
    """Values the format can code: built from random shifts and steps, mostly small (a smooth picture) with
    some large ones (edges), then coded back from the values alone by ``encode``."""

    rng = random.Random(seed)
    vals = []
    for _row in range(height):
        pred, nonz, sh = [0, 0], [0, 0], 0
        for col in range(width):
            i = col % rw2.RUN
            if i == 0:
                pred, nonz = [0, 0], [0, 0]
            if i % 3 == 2:
                sh = rng.choice((0, 0, 0, 1, 2, 4))
            q = i & 1
            if not nonz[q]:
                v = 0 if rng.random() < 0.05 else rng.randint(16, 4095)
                nonz[q] = v >> 4
                if nonz[q] or i > 11:
                    pred[q] = v
            elif rng.random() >= 0.1:
                ok = [j for j in range(1, 256) if _step(pred[q], sh, j) <= 4095]
                near = [j for j in ok if abs(_step(pred[q], sh, j) - pred[q]) <= 60]
                pred[q] = _step(pred[q], sh, rng.choice(near if near and rng.random() < 0.8 else ok))
            vals.append(pred[q])
    return vals


def _encodable(seed, width, height):
    vals = field(seed, width, height)
    return vals, encode(vals, width, height)


def make_rw2(*, width=W, height=H, cfa=2, black=(128, 129, 130), wb=(662, 256, 370), model="DMC-GF7",
             borders=(2, 4, 8, 32), linearity=4095, values=None, raw_format=4):
    """An RW2: (file bytes, expected sensels). ``borders`` = (top, left, bottom, right)."""

    if values is None:
        expected, (payload, _) = _encodable(5, width, height)
    else:
        expected, (payload, _) = values, encode(values, width, height)

    def ifd0(data_at):
        e = [
            (0x02, 3, (width,)), (0x03, 3, (height,)),
            (0x04, 3, (borders[0],)), (0x05, 3, (borders[1],)), (0x06, 3, (borders[2],)), (0x07, 3, (borders[3],)),
            (0x09, 3, (cfa,)), (0x0A, 3, (12,)), (0x0B, 3, (34316,)),
            (0x0E, 3, (linearity,)), (0x0F, 3, (linearity,)), (0x10, 3, (linearity,)),
            (0x2D, 3, (raw_format,)),
            (271, 2, tuple(b"Panasonic\0")), (272, 2, tuple(model.encode() + b"\0")),
            (273, 4, (0xFFFFFFFF,)), (0x118, 4, (data_at,)),
        ]
        if black:
            e += [(0x1C, 3, (black[0],)), (0x1D, 3, (black[1],)), (0x1E, 3, (black[2],))]
        if wb:
            e += [(0x24, 3, (wb[0],)), (0x25, 3, (wb[1],)), (0x26, 3, (wb[2],))]
        return e

    head_len = 8 + len(_ifd_bytes(ifd0(0), 8))
    blob = b"IIU\0" + struct.pack("<I", 8) + _ifd_bytes(ifd0(head_len), 8) + payload
    return blob, expected


def engines():
    return ["python", "native"] if ljpeg_native.available() else ["python"]


class ReadTests(unittest.TestCase):
    def test_sensels_exact_on_both_engines(self):
        data, expected = make_rw2()
        for engine in engines():
            raw = rw2.parse_rw2(data, engine=engine)
            self.assertEqual(list(raw.values), expected, engine)
        self.assertEqual(raw.source, "rw2")
        self.assertIn("RawFormat 4", raw.notes[0])

    def test_every_shift_and_several_blocks(self):
        # 154 x 300 sensels at about nine bits each fill more than two 0x4000-byte blocks; the field uses most shifts.
        width, height = 154, 300
        for seed in (1, 2):
            vals, (payload, used) = _encodable(seed, width, height)
            self.assertGreater(len(payload), 2 * rw2.BLOCK)
            self.assertIn(4, used)
            self.assertGreaterEqual(len(used), 3)
            for e in engines():
                got = list(rw2.decode_panasonic(payload, width, height, engine=e))
                self.assertEqual(got, vals, (seed, e))

    def test_zero_runs_and_late_first_values(self):
        # A parity that stays at zero until the run's last two sensels reads four more bits there.
        width = 28
        vals = []
        for x in range(width):
            vals.append(0 if x % 14 < 12 else 5 + x % 14)
        vals = vals * 2
        payload, _ = encode(vals, width, 2)
        for e in engines():
            self.assertEqual(list(rw2.decode_panasonic(payload, width, 2, engine=e)), vals, e)

    def test_truncated_data_reads_zeros_on_both_decoders(self):
        payload, _ = encode(make_rw2()[1], W, H)
        cut = payload[:100]
        outs = {e: tuple(rw2.decode_panasonic(cut, W, H, engine=e)) for e in engines()}
        self.assertEqual(len(set(outs.values())), 1)

    def test_tags_levels_balance_cfa_and_crop(self):
        e = rw2.parse_rw2(make_rw2()[0]).ifd.entries
        # GRBG; black is the tag plus 15 (as dcraw and LibRaw), green's for both greens.
        self.assertEqual(e[rd.TAG_CFA_PATTERN], (1, 0, 2, 1))
        self.assertEqual(e[rd.TAG_BLACK_LEVEL], (144.0, 143.0, 145.0, 144.0))
        r, _, b = (1 / v for v in e[rd.TAG_AS_SHOT_NEUTRAL])
        self.assertAlmostEqual(r, 662 / 256)
        self.assertAlmostEqual(b, 370 / 256)
        self.assertEqual(e[rd.TAG_WHITE_LEVEL], (4095,))
        self.assertEqual((e[rd.TAG_CROP_ORIGIN], e[rd.TAG_CROP_SIZE]), ((4, 2), (28, 6)))
        for code, pattern in ((1, (0, 1, 1, 2)), (3, (1, 2, 0, 1)), (4, (2, 1, 1, 0))):
            got = rw2.parse_rw2(make_rw2(cfa=code)[0]).ifd.entries[rd.TAG_CFA_PATTERN]
            self.assertEqual(got, pattern)
        # The GF1 writes 16383 as its linearity limit: the 12-bit ceiling is kept.
        self.assertEqual(rw2.parse_rw2(make_rw2(linearity=16383)[0]).ifd.entries[rd.TAG_WHITE_LEVEL], (4095,))
        self.assertEqual(rw2.parse_rw2(make_rw2(linearity=3900)[0]).ifd.entries[rd.TAG_WHITE_LEVEL], (3900,))
        outside = rw2.parse_rw2(make_rw2(borders=(0, 0, 12, 40))[0]).ifd.entries
        self.assertNotIn(rd.TAG_CROP_SIZE, outside)
        no_wb = rw2.parse_rw2(make_rw2(wb=None)[0])
        self.assertNotIn(rd.TAG_AS_SHOT_NEUTRAL, no_wb.ifd.entries)
        self.assertTrue(any("white balance" in n for n in no_wb.notes))

    def test_other_raw_formats_are_refused(self):
        with self.assertRaisesRegex(rd.DevelopError, "RawFormat 5.*not supported"):
            rw2.parse_rw2(make_rw2(raw_format=5)[0])

    def test_dispatch_and_names(self):
        data, _ = make_rw2()
        self.assertTrue(rw2.is_rw2(data))
        self.assertEqual(rw2.camera_model(data), "Panasonic DMC-GF7")
        self.assertEqual(rd.parse_raw(data).source, "rw2")
        tiff = b"II*\0" + struct.pack("<I", 8) + _ifd_bytes([(271, 2, tuple(b"Panasonic\0"))], 8)
        self.assertFalse(rw2.is_rw2(tiff))
        with self.assertRaisesRegex(rd.DevelopError, "not a Panasonic RW2"):
            rw2.parse_rw2(tiff)
        self.assertTrue(raw_preview.needs_profile_path(Path("P1000001.RW2")))


class DevelopTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)
        (self.dir / "profiles").mkdir()
        (self.dir / "profiles" / "Panasonic DMC-GF7 Adobe Standard.dcp").write_bytes(make_profile("Panasonic DMC-GF7"))

    def test_needs_a_profile(self):
        raw = rd.parse_raw(make_rw2()[0])
        with self.assertRaisesRegex(rd.DevelopError, "an RW2 carries no colour matrix.*Panasonic DMC-GF7"):
            rd.develop(raw, rd.DevelopSettings(engine="python"))

    def test_profile_chooser_and_cli(self):
        src = self.dir / "P1000001.RW2"
        src.write_bytes(make_rw2()[0])
        self.assertEqual(camera_profiles.camera_of(src), "Panasonic DMC-GF7")
        out, err = io.StringIO(), io.StringIO()
        code = main(["develop", str(src), "--out", str(self.dir / "m"), "--dcp", str(self.dir / "profiles")], stdout=out, stderr=err)
        self.assertEqual(code, 0, err.getvalue())
        master = self.dir / "m" / "P1000001.tif"
        self.assertTrue(master.exists())
        tif = rd._Reader(master.read_bytes())
        ifd, _ = tif.read_ifd(tif.first_ifd_offset())
        self.assertEqual((ifd.one(rd.TAG_WIDTH), ifd.one(rd.TAG_HEIGHT)), (28, 6))  # the sensor borders applied
        self.assertIn("Panasonic DMC-GF7 Adobe Standard.dcp", out.getvalue())


if __name__ == "__main__":
    unittest.main()
