"""Minolta and Konica Minolta MRW read straight into the developer (``shootflow.mrw``).

A writer here builds MRW files the way the cameras lay them out: the ``\\0MRM`` header, a PRD block (sensor
size, data size, storage method, Bayer pattern), WBG gains in the pattern's 2x2 order, a TTW block holding a
little-endian TIFF with Make, Model and Orientation, RIF and PAD blocks the reader skips, then the sensor,
12-bit packed or 16-bit big-endian. The decoded sensels are checked exactly. The nine real files from nine
bodies against LibRaw (every sensel equal): ``tools/mrw_libraw_check.py`` and
``eval/minolta-mrw-reader-2026-11-18.md``.
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

from shootflow import camera_profiles, mrw, raw_preview
from shootflow import raw_develop as rd
from shootflow.cli import main
from test_arw import make_profile
from test_raw_develop import _ifd_bytes

W, H = 32, 12


def sensor(w=W, h=H, seed=3, top=4095):
    rng = random.Random(seed)
    return [rng.randrange(0, top + 1) for _ in range(w * h)]


def pack12(values, w):
    out = bytearray()
    for i in range(0, len(values), 2):
        a, b = values[i], values[i + 1]
        out += bytes((a >> 4, ((a & 15) << 4) | (b >> 8), b & 255))
    return bytes(out)


def block(name: bytes, body: bytes) -> bytes:
    return name + struct.pack(">I", len(body)) + body


def ttw(make="KONICA MINOLTA", model="DYNAX 7D", orientation=1) -> bytes:
    entries = [
        (271, 2, tuple(make.encode() + b"\0")),
        (272, 2, tuple(model.encode() + b"\0")),
        (274, 3, (orientation,)),
    ]
    return b"II*\0" + struct.pack("<I", 8) + _ifd_bytes(entries, 8)


def make_mrw(values=None, w=W, h=H, packed=True, bayer=1, gains=(400, 256, 256, 450), make="KONICA MINOLTA",
             model="DYNAX 7D", orientation=1, with_wbg=True, extra=b""):
    values = sensor(w, h) if values is None else values
    prd = b"21810002" + struct.pack(">HHHHBBBBHH", h, w, h - 8, w - 8, 12 if packed else 16, 12,
                                    0x59 if packed else 0x52, 0, 0, bayer)
    blocks = block(b"\0PRD", prd)
    if with_wbg:
        blocks += block(b"\0WBG", bytes((2, 2, 2, 2)) + struct.pack(">4H", *gains))
    blocks += block(b"\0RIF", bytes(56)) + block(b"\0TTW", ttw(make, model, orientation)) + block(b"\0PAD", bytes(12))
    data = pack12(values, w) if packed else struct.pack(f">{len(values)}H", *values)
    return b"\0MRM" + struct.pack(">I", len(blocks)) + blocks + data + extra


class ReaderTests(unittest.TestCase):
    def test_packed_sensels_exact(self):
        vals = sensor()
        raw = mrw.parse_mrw(make_mrw(vals))
        self.assertEqual(list(raw.values), vals)
        self.assertEqual((raw.width, raw.height, raw.source), (W, H, "mrw"))
        self.assertIn("MRW: 12-bit packed", raw.notes)

    def test_unpacked_sensels_exact(self):
        vals = sensor(seed=9)
        raw = mrw.parse_mrw(make_mrw(vals, packed=False, model="DiMAGE 7", make="Minolta Co., Ltd."))
        self.assertEqual(list(raw.values), vals)
        self.assertIn("MRW: 16-bit unpacked", raw.notes)

    def test_python_unpack_matches(self):
        vals = sensor(seed=5)
        data = make_mrw(vals)
        _, start, found = mrw.blocks(data)
        info = mrw.prd(data, ">", found)
        self.assertEqual(list(rd._unpack_bits(data[start:], 12, W * H, W)), vals)
        self.assertEqual(info["storage"], mrw.STORAGE_PACKED)

    def test_tags_rggb(self):
        raw = mrw.parse_mrw(make_mrw(gains=(400, 256, 256, 450)))
        self.assertEqual(raw.ifd.get(rd.TAG_CFA_PATTERN), (0, 1, 1, 2))
        self.assertEqual(raw.ifd.get(rd.TAG_BLACK_LEVEL), (0.0,) * 4)
        n = raw.ifd.get(rd.TAG_AS_SHOT_NEUTRAL)
        self.assertAlmostEqual(1 / n[0], 400 / 256)
        self.assertAlmostEqual(1 / n[2], 450 / 256)
        self.assertEqual(raw.ifd0.one(rd.TAG_ORIENTATION, 1), 1)

    def test_gbrg_gains_follow_the_pattern(self):
        # The A200: pattern GBRG, gains stored G, B, R, G (LibRaw: R 480, B 416 from 255, 416, 480, 255).
        raw = mrw.parse_mrw(make_mrw(bayer=4, gains=(255, 416, 480, 255), model="DiMAGE A200"))
        self.assertEqual(raw.ifd.get(rd.TAG_CFA_PATTERN), (1, 2, 0, 1))
        n = raw.ifd.get(rd.TAG_AS_SHOT_NEUTRAL)
        self.assertAlmostEqual(1 / n[0], 480 / 255)
        self.assertAlmostEqual(1 / n[2], 416 / 255)

    def test_white_from_clip_pile(self):
        vals = [min(v, 3000) for v in sensor(64, 32, seed=1)]  # a quarter of the frame clipped at 3000
        raw = mrw.parse_mrw(make_mrw(vals, w=64, h=32))
        self.assertEqual(raw.ifd.one(rd.TAG_WHITE_LEVEL), 3000)
        unclipped = mrw.parse_mrw(make_mrw(sensor(64, 32, seed=1, top=2500), w=64, h=32))
        self.assertEqual(unclipped.ifd.one(rd.TAG_WHITE_LEVEL), 4095)

    def test_orientation_from_ttw(self):
        raw = mrw.parse_mrw(make_mrw(orientation=6))
        self.assertEqual(raw.ifd0.one(rd.TAG_ORIENTATION), 6)

    def test_no_wbg(self):
        raw = mrw.parse_mrw(make_mrw(with_wbg=False))
        self.assertIsNone(raw.ifd.get(rd.TAG_AS_SHOT_NEUTRAL))
        self.assertIn("MRW: no WBG block: no as-shot white balance", raw.notes)

    def test_refusals(self):
        with self.assertRaisesRegex(rd.DevelopError, "Bayer pattern code 0x2"):
            mrw.parse_mrw(make_mrw(bayer=2))
        good = make_mrw()
        with self.assertRaisesRegex(rd.DevelopError, "runs past the end"):
            mrw.parse_mrw(good[:-10])
        bad = bytearray(make_mrw())
        bad[8 + 8 + 8 + 8] = 0x10  # data size 16 with storage packed: not a layout seen
        with self.assertRaisesRegex(rd.DevelopError, "layout"):
            mrw.parse_mrw(bytes(bad))
        self.assertFalse(mrw.is_mrw(b"\t\xb2!\x0f" + bytes(100)))  # the DiMAGE Z2's headerless ".MRW"
        self.assertFalse(mrw.is_mrw(b"\0MRM\xff\xff\xff\xff"))
        with self.assertRaisesRegex(rd.DevelopError, "no \\\\0MRM header"):
            mrw.parse_mrw(b"II*\0" + bytes(40))

    def test_names(self):
        self.assertEqual(mrw.camera_model(make_mrw()), "Konica Minolta DYNAX 7D")
        self.assertEqual(mrw.camera_model(make_mrw(make="Minolta Co., Ltd.", model="DiMAGE A1")), "Minolta DiMAGE A1")
        self.assertEqual(rd.parse_raw(make_mrw()).source, "mrw")


class DevelopTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)
        (self.dir / "profiles").mkdir()
        (self.dir / "profiles" / "Konica Minolta DYNAX 7D Adobe Standard.dcp").write_bytes(
            make_profile("Konica Minolta DYNAX 7D")
        )

    def test_needs_a_profile(self):
        raw = rd.parse_raw(make_mrw())
        with self.assertRaisesRegex(rd.DevelopError, "an MRW carries no colour matrix.*Konica Minolta DYNAX 7D"):
            rd.develop(raw, rd.DevelopSettings(engine="python"))

    def test_paths(self):
        path = self.dir / "PICT0001.MRW"
        self.assertTrue(raw_preview.is_developable_path(path))
        self.assertTrue(raw_preview.needs_profile_path(path))

    def test_profile_chooser_and_cli(self):
        src = self.dir / "PICT0001.MRW"
        src.write_bytes(make_mrw(sensor(64, 32, seed=2, top=3000), w=64, h=32))
        self.assertEqual(camera_profiles.camera_of(src), "Konica Minolta DYNAX 7D")
        out, err = io.StringIO(), io.StringIO()
        code = main(["develop", str(src), "--out", str(self.dir / "m"), "--dcp", str(self.dir / "profiles")], stdout=out, stderr=err)
        self.assertEqual(code, 0, err.getvalue())
        master = self.dir / "m" / "PICT0001.tif"
        self.assertTrue(master.exists())
        tif = rd._Reader(master.read_bytes())
        ifd, _ = tif.read_ifd(tif.first_ifd_offset())
        self.assertEqual((ifd.one(rd.TAG_WIDTH), ifd.one(rd.TAG_HEIGHT)), (64, 32))
        self.assertIn("Konica Minolta DYNAX 7D Adobe Standard.dcp", out.getvalue())


if __name__ == "__main__":
    unittest.main()
