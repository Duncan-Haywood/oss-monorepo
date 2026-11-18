import tempfile
import unittest
from pathlib import Path

import favicons


class FaviconTests(unittest.TestCase):
    def test_detects_icon(self):
        self.assertTrue(favicons.has_icon('<head><link rel="icon" href="x"></head>'))
        self.assertTrue(favicons.has_icon("<head><link href=x rel='shortcut icon'></head>"))
        self.assertFalse(favicons.has_icon('<head><link rel="canonical" href="x"></head>'))

    def test_inserts_after_charset_and_is_idempotent(self):
        html = '<html><head>\n<meta charset="utf-8">\n<title>t</title></head></html>'
        out = favicons.with_icon(html, "tax-thing")
        self.assertIn('rel="icon"', out)
        self.assertLess(out.index("charset"), out.index('rel="icon"'))
        self.assertTrue(favicons.has_icon(out))

    def test_deterministic_and_distinct(self):
        self.assertEqual(favicons.icon_href("a-b"), favicons.icon_href("a-b"))
        self.assertNotEqual(favicons.icon_href("a-b"), favicons.icon_href("zz"))

    def test_colour_is_a_dark_saturated_hex_and_pinned(self):
        import re, urllib.parse
        for slug in ("a-b", "zz", "ledger"):
            svg = urllib.parse.unquote(favicons.icon_href(slug))
            m = re.search(r"fill='#([0-9a-f]{6})'/>", svg)
            self.assertIsNotNone(m, svg)
            r, g, b = (int(m.group(1)[i:i + 2], 16) for i in (0, 2, 4))
            # HLS lightness 0.30 / saturation 0.65: bright channel 0.495*255, dark 0.105*255
            self.assertEqual((max(r, g, b), min(r, g, b)), (126, 27), (slug, m.group(1)))

    def test_root_is_the_repository_root(self):
        self.assertTrue((favicons.ROOT / "ventures").is_dir())
        self.assertTrue((favicons.ROOT / "platform" / "ci").is_dir())

    def test_fix_and_check_roundtrip(self):
        with tempfile.TemporaryDirectory() as d:
            v = Path(d) / "ventures" / "demo"
            v.mkdir(parents=True)
            (v / "index.html").write_text("<html><head><title>x</title></head></html>")
            self.assertEqual(favicons.main(["--root", d]), 1)
            self.assertEqual(favicons.main(["--root", d, "--fix"]), 0)
            self.assertEqual(favicons.main(["--root", d]), 0)


if __name__ == "__main__":
    unittest.main()
