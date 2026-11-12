"""Canon CR2 read straight into the developer (``shootflow.cr2``).

Each test builds a small CR2 here: a TIFF with the 'CR' marker, an Exif IFD
whose maker note is a Canon IFD (SensorInfo 0x00E0 and a ColorData 0x4001 of
the 5D Mark II's length, as-shot levels at 0x3F), and a raw IFD holding the
sensor as one lossless JPEG cut into Canon's vertical slices (tag 0xC640).
The sensor is a known scene of coloured cells behind a 2x2 CFA, with masked
columns at a known black level, so every inferred tag can be checked exactly.
A real 5D Mark II file against LibRaw: ``tools/cr2_develop_check.py`` and
``eval/cr2-direct-2026-11-12.md``.
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

from shootflow import cr2
from shootflow import raw_develop as rd
from shootflow.cli import main
from test_raw_develop import _ifd_bytes, encode_lossless_jpeg

SENSOR_W, SENSOR_H = 64, 38
LEFT, TOP, RIGHT, BOTTOM = 12, 4, 60, 36  # active area, right/bottom exclusive
BLACK = (510, 512, 514, 516)  # per 2x2 position, relative to the active area's origin
SLICES = (1, 40, 24)
FRAME_NF = 2


def scene(seed=7):
    """Reflectances (r, g, b) for each 4x4 cell of the active area."""

    rng = random.Random(seed)
    cells = {}
    for cy in range((BOTTOM - TOP) // 4):
        for cx in range((RIGHT - LEFT) // 4):
            cells[cy, cx] = (rng.uniform(0.05, 0.9), rng.uniform(0.05, 0.9), rng.uniform(0.05, 0.9))
    cells[0, 0] = (0.5, 0.5, 0.5)  # a grey cell for the neutrality check
    return cells


def sensor(pattern="GBRG", levels=(2048, 1024, 1024, 1536), seed=7):
    """Row-major sensor values: masked borders at BLACK, the scene behind ``pattern``."""

    pat = cr2.PHASES[pattern]
    mult = (levels[0] / 1024, 1.0, levels[3] / 1024)
    cells = scene(seed)
    out = []
    for y in range(SENSOR_H):
        for x in range(SENSOR_W):
            py, px = (y - TOP) % 2, (x - LEFT) % 2
            b = BLACK[py * 2 + px]
            if TOP <= y < BOTTOM and LEFT <= x < RIGHT:
                colour = pat[py * 2 + px]
                refl = cells[(y - TOP) // 4, (x - LEFT) // 4][colour]
                out.append(b + int(round(refl / mult[colour] * 6000)))
            else:
                out.append(b)
    return out


def sliced(values):
    """Canon's slice order: each slice's rows in turn, then the next slice."""

    count, width, last = SLICES
    widths = [width] * count + [last]
    out, x0 = [], 0
    for sw in widths:
        for y in range(SENSOR_H):
            out.extend(values[y * SENSOR_W + x0 : y * SENSOR_W + x0 + sw])
        x0 += sw
    return out


def make_cr2(pattern="GBRG", levels=(2048, 1024, 1024, 1536), color_data_len=1250, sensor_info=True, seed=7):
    values = sensor(pattern, levels, seed)
    stream = encode_lossless_jpeg(sliced(values), SENSOR_W // FRAME_NF, SENSOR_H, FRAME_NF, precision=14)
    # Layout: header (16) | IFD0 | Exif IFD | Canon IFD | raw IFD | stream
    blob = bytearray(b"II*\0" + struct.pack("<I", 16) + b"CR\x02\0" + struct.pack("<I", 0))

    def ifd0_at(exif_at):
        return _ifd_bytes(
            [
                (271, 2, tuple(b"Canon\0")),
                (272, 2, tuple(b"Canon EOS 5D Mark II\0")),
                (274, 3, (1,)),
                (34665, 4, (exif_at,)),
            ],
            16,
        )

    ifd0_len = len(ifd0_at(0))
    exif_at = 16 + ifd0_len
    exif_len = len(_ifd_bytes([(37500, 4, (0,))], exif_at))
    canon_at = exif_at + exif_len
    color = [0] * color_data_len
    if 0x3F + 4 <= color_data_len:
        color[0x3F : 0x3F + 4] = list(levels)
    canon_entries = [(0x4001, 3, tuple(color))]
    if sensor_info:
        canon_entries.append(
            (0x00E0, 3, (34, SENSOR_W, SENSOR_H, 1, 1, LEFT, TOP, RIGHT - 1, BOTTOM - 1, 0, 0, 0, 0, 0, 0, 0, 0))
        )
    canon = _ifd_bytes(canon_entries, canon_at)
    raw_at = canon_at + len(canon)
    raw_len = len(_ifd_bytes([(259, 3, (6,)), (273, 4, (0,)), (279, 4, (0,)), (0xC640, 3, SLICES)], raw_at))
    stream_at = raw_at + raw_len
    raw_ifd = _ifd_bytes([(259, 3, (6,)), (273, 4, (stream_at,)), (279, 4, (len(stream),)), (0xC640, 3, SLICES)], raw_at)

    ifd0 = bytearray(ifd0_at(exif_at))
    struct.pack_into("<I", ifd0, 2 + 12 * 4, raw_at)  # IFD0 -> raw IFD
    exif = bytearray(_ifd_bytes([(37500, 4, (canon_at,))], exif_at))
    struct.pack_into("<HI", exif, 2 + 2, 7, len(canon))  # MakerNote: UNDEFINED, the Canon IFD's length
    blob += ifd0 + exif + canon + raw_ifd + stream
    return bytes(blob), values


def make_profile():
    """A DCP whose colour matrix is XYZ->linear sRGB (camera RGB = sRGB), D65."""

    from test_dng_profile_tables import make_dcp

    m = rd._inverse3(rd._XYZ_TO_SRGB_D65)
    flat = tuple(m[r][c] for r in range(3) for c in range(3))
    blob = make_dcp([(50721, 10, flat), (50778, 3, (21,)), (50708, 2, tuple(b"Canon EOS 5D Mark II\0"))])
    with tempfile.NamedTemporaryFile(suffix=".dcp", delete=False) as fh:
        fh.write(blob)
    return Path(fh.name)


class ReadTests(unittest.TestCase):
    def test_tags_and_sensor(self):
        blob, values = make_cr2()
        raw = rd.parse_raw(blob)
        self.assertEqual(raw.source, "cr2")
        self.assertEqual((raw.width, raw.height), (SENSOR_W, SENSOR_H))
        self.assertEqual(list(raw.values), values)
        tags = raw.ifd.entries
        self.assertEqual(tags[rd.TAG_ACTIVE_AREA], (TOP, LEFT, BOTTOM, RIGHT))
        self.assertEqual(tags[rd.TAG_BLACK_LEVEL], tuple(float(b) for b in BLACK))
        self.assertEqual(tags[rd.TAG_WHITE_LEVEL], (16383.0,))
        self.assertEqual(tags[rd.TAG_CFA_PATTERN], cr2.PHASES["GBRG"])
        neutral = tags[rd.TAG_AS_SHOT_NEUTRAL]
        self.assertAlmostEqual(neutral[0], 0.5)
        self.assertAlmostEqual(neutral[2], 1024 / 1536)
        self.assertEqual(bytes(raw.ifd0.entries[rd.TAG_UNIQUE_CAMERA_MODEL]), b"Canon EOS 5D Mark II\0")
        self.assertIn("CR2: CFA GBRG from green diagonal and as-shot balance", raw.notes)

    def test_every_phase_is_found(self):
        for name in cr2.PHASES:
            with self.subTest(name):
                raw = rd.parse_raw(make_cr2(pattern=name)[0])
                self.assertEqual(raw.ifd.entries[rd.TAG_CFA_PATTERN], cr2.PHASES[name])

    def test_tungsten_balance_flips_red_and_blue(self):
        # Under warm light the red gain is the smaller: the brighter non-green is red.
        raw = rd.parse_raw(make_cr2(pattern="RGGB", levels=(1300, 1024, 1024, 2600))[0])
        self.assertEqual(raw.ifd.entries[rd.TAG_CFA_PATTERN], cr2.PHASES["RGGB"])

    def test_unclear_phase_is_refused_not_guessed(self):
        blob, _ = make_cr2(levels=(1400, 1024, 1024, 1450))
        with self.assertRaisesRegex(rd.DevelopError, "--cfa"):
            rd.parse_raw(blob)
        raw = rd.parse_raw(blob, cfa="gbrg")
        self.assertEqual(raw.ifd.entries[rd.TAG_CFA_PATTERN], cr2.PHASES["GBRG"])
        self.assertIn("CR2: CFA GBRG from given", raw.notes)

    def test_unknown_color_data_version(self):
        blob, _ = make_cr2(color_data_len=999)
        with self.assertRaisesRegex(rd.DevelopError, "--cfa"):
            rd.parse_raw(blob)
        raw = rd.parse_raw(blob, cfa="GBRG")
        self.assertNotIn(rd.TAG_AS_SHOT_NEUTRAL, raw.ifd.entries)
        self.assertTrue(any("999 entries is not known" in n for n in raw.notes))

    def test_no_sensor_info_uses_whole_sensor(self):
        raw = rd.parse_raw(make_cr2(sensor_info=False)[0], cfa="GBRG")
        self.assertEqual(raw.ifd.entries[rd.TAG_ACTIVE_AREA], (0, 0, SENSOR_H, SENSOR_W))
        self.assertTrue(any("no Canon SensorInfo" in n for n in raw.notes))

    def test_sraw_refused(self):
        blob = bytearray(make_cr2()[0])
        sof = blob.index(b"\xff\xc3")
        blob[sof + 2 + 2 + 6 + 1] = 0x21  # first component sampled 2x1
        with self.assertRaisesRegex(rd.DevelopError, "sRAW"):
            rd.parse_raw(bytes(blob))

    def test_bad_cfa_name(self):
        with self.assertRaisesRegex(rd.DevelopError, "CFA phase"):
            rd.parse_raw(make_cr2()[0], cfa="RGBG")

    def test_not_a_cr2_still_names_dng(self):
        with self.assertRaisesRegex(rd.DevelopError, "not a DNG or a Canon CR2"):
            rd.parse_raw(b"II*\0" + struct.pack("<I", 8) + _ifd_bytes([(256, 3, (1,))], 8))


class DevelopTests(unittest.TestCase):
    def setUp(self):
        self.dcp_path = make_profile()
        self.addCleanup(self.dcp_path.unlink)

    def test_needs_a_profile(self):
        raw = rd.parse_raw(make_cr2()[0])
        with self.assertRaisesRegex(rd.DevelopError, "--dcp"):
            rd.develop(raw, rd.DevelopSettings(engine="python"))

    def test_grey_cell_is_neutral_and_engines_agree(self):
        raw = rd.parse_raw(make_cr2()[0])
        dcp = rd.read_dcp(self.dcp_path)
        outs = {}
        for engine in ("python", "numpy"):
            try:
                w, h, px, report = rd.develop(
                    raw, rd.DevelopSettings(engine=engine, dcp=dcp, default_tone="never")
                )
            except rd.DevelopError:
                continue  # numpy not installed
            outs[engine] = px
        self.assertEqual((w, h), (RIGHT - LEFT, BOTTOM - TOP))
        self.assertEqual(report.cfa, "GBRG")
        self.assertEqual(report.white_balance, (2.0, 1.0, 1.5))
        # Centre of the grey cell (0, 0): inside the 4x4 cell, away from bilinear seams.
        i = (1 * w + 1) * 3
        r, g, b = (px[i + k] for k in range(3))
        self.assertLess(max(r, g, b) - min(r, g, b), 0.01 * 65535)
        if len(outs) == 2:
            self.assertEqual(outs["python"].tobytes(), outs["numpy"].tobytes())

    def test_cli_develops_a_cr2(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "IMG_0001.CR2"
            src.write_bytes(make_cr2()[0])
            out, err = io.StringIO(), io.StringIO()
            code = main(["develop", str(src), "--out", str(Path(tmp) / "m")], stdout=out, stderr=err)
            self.assertNotEqual(code, 0)
            self.assertIn("--dcp", err.getvalue())
            out, err = io.StringIO(), io.StringIO()
            code = main(
                ["develop", str(src), "--out", str(Path(tmp) / "m"), "--dcp", str(self.dcp_path), "--half"],
                stdout=out,
                stderr=err,
            )
            self.assertEqual(code, 0, err.getvalue())
            self.assertTrue((Path(tmp) / "m" / "IMG_0001.tif").exists())
            self.assertIn('"cfa": "GBRG"', out.getvalue())


if __name__ == "__main__":
    unittest.main()
