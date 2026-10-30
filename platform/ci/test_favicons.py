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
