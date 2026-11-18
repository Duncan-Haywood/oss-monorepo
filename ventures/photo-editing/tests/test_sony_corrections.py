"""Sony's in-file lens tables (ARW 0x7032, 0x7035, 0x7037): parsing, the decoded curves, the DNG warp fit and the
develop stage. The knot arrays are copied from real files (drewnoakes/metadata-extractor-images: ILCE-7M3 with
FE 24-105mm F4 G OSS at 24 mm, ILCE-5000 with E PZ 16-50mm at 16 mm); eval/sony-in-file-corrections-2026-11-15.md
compares them with lensfun."""

from __future__ import annotations

import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from shootflow import raw_develop as rd  # noqa: E402
from shootflow import sony_corrections as sc  # noqa: E402
from test_arw import make_arw, make_profile  # noqa: E402

A7M3_DIST = (16, 11, -2, -31, -66, -119, -180, -253, -331, -417, -503, -595, -685, -774, -857, -936, -1008)
A7M3_CA = (32, 512, 384, 256, 128, 0, 0, 0, 0, 0, 0, -128, -128, -128, -128, -256, -768, 1152, 1280, 1408, 1536,
           1664, 1664, 1664, 1664, 1664, 1664, 1536, 1536, 1536, 1536, 1664, 1920)
A7M3_VIG = (16, 0, 64, 128, 256, 448, 704, 1024, 1344, 1792, 2496, 3520, 4992, 6784, 8832, 11008, 13184)
A5000_DIST = (11, 86, 0, -122, -259, -438, -632, -862, -1092, -1351, -1603, -1869, 0, 0, 0, 0, 0)


def ifd(**tags):
    out = rd.Ifd()
    for tag, values in tags.items():
        out.entries[int(tag[1:], 16)] = values
    return out


class ParseTests(unittest.TestCase):
    def test_real_tables(self):
        corr = sc.from_ifd(ifd(t7037=A7M3_DIST, t7035=A7M3_CA, t7032=A7M3_VIG))
        self.assertEqual(len(corr.distortion), 16)
        self.assertEqual(corr.ca_red[0], 512)
        self.assertEqual(corr.ca_blue[-1], 1920)
        self.assertEqual(corr.vignetting[-1], 13184)
        # 11 knots in a 17-value array: the zero padding is not read as knots.
        short = sc.from_ifd(ifd(t7037=A5000_DIST))
        self.assertEqual(short.distortion, A5000_DIST[1:12])
        self.assertIsNone(short.ca_red)

    def test_malformed_counts_are_ignored(self):
        self.assertIsNone(sc.from_ifd(ifd(t7037=(40, 1, 2, 3))))  # more knots than values
        self.assertIsNone(sc.from_ifd(ifd(t7035=(5, 1, 2, 3, 4, 5))))  # odd count for two colours
        self.assertIsNone(sc.from_ifd(ifd(t7037=(1, 5))))
        self.assertIsNone(sc.from_ifd(ifd()))

    def test_decoded_values(self):
        corr = sc.from_ifd(ifd(t7037=A7M3_DIST, t7035=A7M3_CA, t7032=A7M3_VIG))
        self.assertAlmostEqual(corr.distortion_factor(0.0), 1 + 11 / 16384)
        self.assertAlmostEqual(corr.distortion_factor(1.0), 1 - 1008 / 16384)
        mid = 1 + 0.5 * (-595 - 685) / 16384  # halfway between knots 10 and 11
        self.assertAlmostEqual(corr.distortion_factor(10.5 / 15), mid)
        r, b = corr.ca_factors(1.0)
        self.assertAlmostEqual(r, 1 - 768 / 2**21)
        self.assertAlmostEqual(b, 1 + 1920 / 2**21)
        self.assertAlmostEqual(corr.vignetting_gain(0.0), 1.0)
        self.assertAlmostEqual(math.log2(corr.vignetting_gain(1.0)), 2 ** (13184 / 8192 - 1) - 0.5)
        self.assertIn("-6.22% at the corner", sc.describe(corr))


class WarpTests(unittest.TestCase):
    def test_polynomial_fit_follows_the_table(self):
        for dist, limit in ((A7M3_DIST, 0.3), (A5000_DIST, 1.0)):
            corr = sc.from_ifd(ifd(t7037=dist))
            kr = sc.warp_terms(corr)
            self.assertLess(sc.max_fit_error(corr, kr, math.hypot(3000, 2000)), limit)

    def test_build_warp_planes_and_picture(self):
        corr = sc.from_ifd(ifd(t7037=A7M3_DIST, t7035=A7M3_CA))
        warp, k, notes = sc.build_warp(corr, 600, 400)
        self.assertEqual(len(warp.terms), 3)
        self.assertLess(k, 1.0)  # barrel: the corrected frame can zoom out and stay inside the picture
        self.assertIn("lateral colour", notes[0])
        one, _, notes = sc.build_warp(corr, 600, 400, tca=False, fill=False)
        self.assertEqual(len(one.terms), 1)
        self.assertNotIn("lateral colour", notes[0])
        # A frame with a margin round the picture: the knots end inside the frame's corner.
        _, _, notes = sc.build_warp(corr, 700, 500, picture=(600, 400))
        self.assertIn("knots end at the corner of 600 x 400", notes[0])


class DevelopTests(unittest.TestCase):
    def develop(self, tags, **kw):
        import tempfile

        raw = rd.parse_raw(make_arw("plain", extra_raw_tags=tags)[0])
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "p.dcp"
            path.write_bytes(make_profile())
            dcp = rd.read_dcp(path)
        return rd.develop(raw, rd.DevelopSettings(engine="python", dcp=dcp, default_tone="never", **kw))

    def test_tables_reach_develop_and_switch_off(self):
        tags = [(0x7037, 8, A7M3_DIST), (0x7035, 8, A7M3_CA), (0x7032, 8, A7M3_VIG)]
        _, _, plain_px, plain = self.develop([])
        _, _, px, report = self.develop(tags)
        self.assertEqual(report.lens, "Sony in-file corrections")
        self.assertTrue(any("Sony tables" in n for n in report.lens_notes))
        self.assertNotEqual(px.tobytes(), plain_px.tobytes())
        _, _, off_px, off = self.develop(tags, lens_in_file=False)
        self.assertIsNone(off.lens)
        self.assertEqual(off_px.tobytes(), plain_px.tobytes())
        self.assertIsNone(plain.lens)


if __name__ == "__main__":
    unittest.main()
