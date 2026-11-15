"""Fujifilm RAF read straight into the developer (``shootflow.raf``), and the X-Trans 6x6 demosaic.

A builder here writes small RAFs the way the real ones are laid out: the fixed
big-endian header, the RAF header records (0x0100 size, 0x0110/0x0111 picture
area, 0x0130 layout, 0x0131 the X-Trans layout stored backwards, 0x2FF0 balance)
and a CFA block that is either a little-endian TIFF with a 0xF000 sub-IFD
(X-Trans: 16-bit words or 12-bit packing) or bare 16-bit sensor data (older
Bayer bodies). Known sensels go in and must come out exactly. The X-Trans
demosaic is checked on both engines (byte for byte, full and half size) and on
flat fields, which must stay flat. The three real RAFs against LibRaw (every
sensel equal): ``tools/raf_libraw_check.py`` and
``eval/fujifilm-raf-reader-2026-11-14.md``.
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

from shootflow import camera_profiles, catalog, ingest, raf, raw_preview
from shootflow import raw_develop as rd
from shootflow.cli import main
from test_arw import make_profile

# The X-E1's layout from the stored frame's origin, as LibRaw reads it (0 R, 1 G, 2 B).
XE1 = "GGRGGBGGBGGRBRGRBGGGBGGRGGRGGBRBGBRG"
XE1_PATTERN = tuple("RGB".index(c) for c in XE1)


def has_numpy() -> bool:
    try:
        import numpy  # noqa: F401
    except ImportError:
        return False
    return True


def pack12(values) -> bytes:
    out = bytearray()
    vals = list(values)
    for i in range(0, len(vals) - 1, 2):
        a, b = vals[i], vals[i + 1]
        out += bytes((a & 0xFF, (a >> 8) | ((b & 15) << 4), b >> 4))
    if len(vals) % 2:
        a = vals[-1]
        out += bytes((a & 0xFF, a >> 8, 0))
    return bytes(out)


def _record(tag: int, body: bytes) -> bytes:
    return struct.pack(">HH", tag, len(body)) + body


def _fuji_tiff(width, height, bits, data: bytes, black, wb) -> bytes:
    """A little-endian TIFF whose IFD0 holds 0xF000, a sub-IFD of Fujifilm tags."""

    entries = [
        (0xF001, 4, [width]),
        (0xF002, 4, [height]),
        (0xF003, 4, [bits]),
        (0xF007, 4, [0]),  # data offset, patched below
        (0xF008, 4, [len(data)]),
        (0xF00A, 4, list(black)),
        (0xF00E, 4, list(wb)),
    ]
    sub_at = 26
    sub_len = 2 + 12 * len(entries) + 4
    extra_at = sub_at + sub_len
    extra = bytearray()
    body = bytearray()
    data_at = extra_at + sum(4 * len(v) for _, _, v in entries if len(v) > 1)
    data_at = (data_at + 15) // 16 * 16
    for tag, typ, vals in entries:
        if tag == 0xF007:
            vals = [data_at]
        if len(vals) == 1:
            body += struct.pack("<HHII", tag, typ, 1, vals[0])
        else:
            body += struct.pack("<HHII", tag, typ, len(vals), extra_at + len(extra))
            extra += struct.pack(f"<{len(vals)}I", *vals)
    head = b"II*\0" + struct.pack("<I", 8) + struct.pack("<H", 1) + struct.pack("<HHII", 0xF000, 13, 1, sub_at) + b"\0\0\0\0"
    assert len(head) == sub_at
    sub = struct.pack("<H", len(entries)) + bytes(body) + b"\0\0\0\0"
    out = bytearray(head + sub + bytes(extra))
    out += bytes(data_at - len(out))
    return bytes(out) + data


def make_raf(kind="xtrans16", width=24, height=18, seed=1, picture=(2, 3, 12, 18), model=b"X-E1", layout=b"\x0c\x0c\x0c\x0c"):
    """(file bytes, expected sensels). ``picture`` is (top, left, height, width)."""

    rng = random.Random(seed)
    bits = {"xtrans16": 14, "xtrans12": 12, "bayer": 14, "xtrans_short": 14}[kind]
    values = [rng.randrange(1 << bits) for _ in range(width * height)]
    records = [
        _record(0x0100, struct.pack(">HH", height, width)),
        _record(0x0110, struct.pack(">HH", picture[0], picture[1])),
        _record(0x0111, struct.pack(">HH", picture[2], picture[3])),
        _record(0x0130, layout),
    ]
    if kind.startswith("xtrans"):
        records.append(_record(0x0131, bytes(reversed(XE1_PATTERN))))
        if kind == "xtrans12":
            payload = pack12(values)
        else:
            payload = struct.pack(f"<{len(values)}H", *values)
            if kind == "xtrans_short":
                payload = payload[: len(payload) // 3]  # as short as compressed data would be
        cfa = _fuji_tiff(width, height, bits, payload, [255] * 36, (302, 556, 671))
    else:
        records.append(_record(0x2FF0, struct.pack(">4H", 80, 129, 80, 123)))
        cfa = struct.pack(f"<{len(values)}H", *values)
    header = struct.pack(">I", len(records)) + b"".join(records)
    jpeg = b""
    head_at = 148
    cfa_at = head_at + len(header)
    cfa_at = (cfa_at + 15) // 16 * 16
    top = bytearray(raf.MAGIC + b"0201FF116502" + model.ljust(32, b"\0"))
    top += bytes(84 - len(top))
    top += struct.pack(">6I", 0, len(jpeg), head_at, len(header), cfa_at, len(cfa))
    top += bytes(head_at - len(top))
    out = bytearray(top + header)
    out += bytes(cfa_at - len(out))
    return bytes(out) + cfa, values


class ReadTests(unittest.TestCase):
    def test_xtrans_words_and_packing_decode_exactly(self):
        for kind in ("xtrans16", "xtrans12"):
            for width in (24, 23):  # an odd sensel count ends 12-bit packing on half a group
                data, expected = make_raf(kind, width=width, height=7)
                raw = raf.parse_raf(data)
                self.assertEqual(list(raw.values), expected, (kind, width))
                self.assertEqual((raw.width, raw.height, raw.source), (width, 7, "raf"))

    def test_xtrans_tags(self):
        data, _ = make_raf("xtrans12")
        raw = raf.parse_raf(data)
        e = raw.ifd.entries
        self.assertEqual(tuple(e[rd.TAG_CFA_REPEAT]), (6, 6))
        self.assertEqual(tuple(e[rd.TAG_CFA_PATTERN]), XE1_PATTERN)  # 0x0131 read backwards
        self.assertEqual(tuple(e[rd.TAG_BLACK_REPEAT]), (6, 6))
        self.assertEqual(set(e[rd.TAG_BLACK_LEVEL]), {255.0})
        self.assertEqual(e[rd.TAG_WHITE_LEVEL], (4095,))
        neutral = e[rd.TAG_AS_SHOT_NEUTRAL]
        self.assertAlmostEqual(1 / neutral[0], 556 / 302)
        self.assertAlmostEqual(1 / neutral[2], 671 / 302)
        self.assertEqual(tuple(e[rd.TAG_CROP_ORIGIN]), (3, 2))  # (left, top) from 0x0110's (top, left)
        self.assertEqual(tuple(e[rd.TAG_CROP_SIZE]), (18, 12))
        self.assertEqual(raf.camera_model(data), "Fujifilm X-E1")
        self.assertIn("Fujifilm X-E1", bytes(raw.ifd0.get(rd.TAG_UNIQUE_CAMERA_MODEL)).decode())

    def test_bayer_block(self):
        data, expected = make_raf("bayer", width=10, height=6, picture=(0, 0, 6, 10), model=b"FinePix S5500")
        raw = raf.parse_raf(data)
        self.assertEqual(list(raw.values), expected)
        e = raw.ifd.entries
        self.assertEqual(tuple(e[rd.TAG_CFA_PATTERN]), (0, 1, 1, 2))
        self.assertEqual(e[rd.TAG_WHITE_LEVEL], (0x3E00,))
        self.assertEqual(set(e[rd.TAG_BLACK_LEVEL]), {0.0})
        self.assertAlmostEqual(1 / e[rd.TAG_AS_SHOT_NEUTRAL][0], 129 / 80)
        self.assertAlmostEqual(1 / e[rd.TAG_AS_SHOT_NEUTRAL][2], 123 / 80)
        self.assertEqual(raf.camera_model(data), "Fujifilm FinePix S5500")

    def test_refusals(self):
        with self.assertRaisesRegex(rd.DevelopError, "not an uncompressed layout"):
            raf.parse_raf(make_raf("xtrans_short")[0])
        with self.assertRaisesRegex(rd.DevelopError, "SuperCCD"):
            raf.parse_raf(make_raf("bayer", layout=b"\x80\x00\x00\x00")[0])
        with self.assertRaisesRegex(rd.DevelopError, "not a Fujifilm RAF"):
            raf.parse_raf(b"II*\0" + bytes(200))
        self.assertFalse(raf.is_raf(b"FUJIFILM"))

    def test_picture_area_outside_the_frame_is_ignored(self):
        raw = raf.parse_raf(make_raf("xtrans16", picture=(10, 10, 20, 20))[0])
        self.assertNotIn(rd.TAG_CROP_ORIGIN, raw.ifd.entries)

    def test_unpack12_matches_pack12(self):
        rng = random.Random(4)
        for n in (1, 2, 3, 10, 11):
            vals = [rng.randrange(4096) for _ in range(n)]
            self.assertEqual(list(raf.unpack12_le(pack12(vals), n)), vals)

    def test_dispatch_and_extensions(self):
        data, expected = make_raf("xtrans16")
        self.assertEqual(list(rd.parse_raw(data).values), expected)
        self.assertTrue(raw_preview.is_developable_path(Path("DSCF0001.RAF")))
        self.assertTrue(raw_preview.needs_profile_path(Path("DSCF0001.raf")))
        self.assertIn(".raf", ingest.MEDIA_EXTENSIONS)
        self.assertIn(".raf", catalog._PHOTO_EXTENSIONS)


class XTransDemosaicTests(unittest.TestCase):
    def raw(self, width=25, height=19, fill=None, seed=3):
        data, _ = make_raf("xtrans12", width=width, height=height, picture=(1, 2, height - 3, width - 4), seed=seed)
        raw = raf.parse_raf(data)
        if fill is not None:
            for i in range(width * height):
                y, x = divmod(i, width)
                raw.values[i] = fill[XE1_PATTERN[(y % 6) * 6 + x % 6]]
        return raw

    def develop(self, raw, **kw):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "p.dcp"
            p.write_bytes(make_profile("Fujifilm X-E1"))
            dcp = rd.read_dcp(p)
        return rd.develop(raw, rd.DevelopSettings(dcp=dcp, **kw))

    def test_cfa_offsets_cover_every_colour(self):
        offsets = rd.cfa_offsets(XE1_PATTERN)
        for py in range(6):
            for px in range(6):
                for colour in range(3):
                    self.assertTrue(offsets[(py, px, colour)], (py, px, colour))

    def test_flat_field_stays_flat(self):
        # Each colour at its own level: every output pixel must be the same colour (the demosaic only averages
        # same-colour neighbours), on both engines, full and half size.
        raw = self.raw(fill={0: 1000, 1: 2000, 2: 1500})
        for engine in ["python"] + (["numpy"] if has_numpy() else []):
            for half in (False, True):
                w, h, px, rep = self.develop(raw, engine=engine, half=half)  # numpy: the directional demosaic
                first = tuple(px[0:3])
                self.assertTrue(all(tuple(px[i : i + 3]) == first for i in range(0, len(px), 3)), (engine, half))
                self.assertEqual(rep.cfa, XE1)

    @unittest.skipUnless(has_numpy(), "numpy engine not installed")
    def test_engines_agree_byte_for_byte(self):
        for seed, (width, height) in enumerate(((25, 19), (13, 8), (6, 6), (31, 14))):
            raw = self.raw(width=width, height=height, seed=seed)
            for half in (False, True):
                # bilinear on both: the directional X-Trans demosaic is numpy only (tests/test_xtrans_demosaic.py)
                a = self.develop(raw, engine="python", half=half, demosaic="bilinear")
                b = self.develop(raw, engine="numpy", half=half, demosaic="bilinear")
                self.assertEqual(a[:2], b[:2], (width, height, half))
                self.assertEqual(list(a[2]), list(b[2]), (width, height, half))

    def test_half_size(self):
        raw = self.raw(width=25, height=19)
        w, h, _, _ = self.develop(raw, engine="python", half=True)
        full_w, full_h, _, _ = self.develop(raw, engine="python")
        self.assertEqual((w, h), (full_w // 2, full_h // 2))

    def test_other_periods_refused(self):
        raw = self.raw()
        raw.ifd.entries[rd.TAG_CFA_REPEAT] = (4, 4)
        with self.assertRaisesRegex(rd.DevelopError, "2x2 \\(Bayer\\) and 6x6 \\(X-Trans\\)"):
            self.develop(raw, engine="python")


class DevelopTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)
        (self.dir / "profiles").mkdir()
        (self.dir / "profiles" / "Fujifilm X-E1 Adobe Standard.dcp").write_bytes(make_profile("Fujifilm X-E1"))

    def test_needs_a_profile(self):
        raw = rd.parse_raw(make_raf("xtrans16")[0])
        with self.assertRaisesRegex(rd.DevelopError, "a RAF carries no colour matrix.*Fujifilm X-E1"):
            rd.develop(raw, rd.DevelopSettings(engine="python"))

    def test_profile_chooser_and_cli(self):
        src = self.dir / "DSCF0001.RAF"
        src.write_bytes(make_raf("xtrans12")[0])
        self.assertEqual(camera_profiles.camera_of(src), "Fujifilm X-E1")
        out, err = io.StringIO(), io.StringIO()
        code = main(["develop", str(src), "--out", str(self.dir / "m"), "--dcp", str(self.dir / "profiles")], stdout=out, stderr=err)
        self.assertEqual(code, 0, err.getvalue())
        tif = rd._Reader((self.dir / "m" / "DSCF0001.tif").read_bytes())
        ifd, _ = tif.read_ifd(tif.first_ifd_offset())
        self.assertEqual((ifd.one(rd.TAG_WIDTH), ifd.one(rd.TAG_HEIGHT)), (18, 12))  # the picture area
        self.assertIn("Fujifilm X-E1 Adobe Standard.dcp", out.getvalue())


if __name__ == "__main__":
    unittest.main()
