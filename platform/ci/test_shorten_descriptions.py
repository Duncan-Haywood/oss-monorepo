import tempfile
import unittest
from pathlib import Path

import shorten_descriptions as sd
import serp_snippets as s

OG = "Catch what breaks an import, with the line number, before you upload. Nothing leaves your device."


def page(desc, og=OG):
    return (f'<title>T</title><meta name="description" content="{desc}">'
            f'<meta property="og:description" content="{og}">')


class Shorten(unittest.TestCase):
    def test_long_desc_takes_og(self):
        out = sd.shorten(page("x " * 200))
        self.assertEqual(s.snippet_of(out)[1], OG)
        self.assertIn(f'og:description" content="{OG}"', out)

    def test_short_desc_untouched(self):
        self.assertIsNone(sd.shorten(page("fine")))

    def test_long_og_or_missing_og_untouched(self):
        self.assertIsNone(sd.shorten(page("x " * 200, "y " * 150)))
        self.assertIsNone(sd.shorten('<title>T</title><meta name="description" content="' + "x " * 200 + '">'))

    def test_description_exactly_at_the_limit_is_untouched(self):
        desc = "x" * 320
        self.assertIsNone(sd.shorten(page(desc)))
        self.assertIsNotNone(sd.shorten(page(desc + "y")))

    def test_og_length_bounds_are_inclusive(self):
        for n, ok in ((59, False), (60, True), (200, True), (201, False)):
            out = sd.shorten(page("x " * 200, "o" * n))
            self.assertEqual(out is not None, ok, n)

    def test_apostrophe_and_quotes_stay_valid(self):
        og = "Apple&#39;s &quot;rules&quot; checked against your feed, with the line number, before you publish it."
        out = sd.shorten(page("x " * 200, og))
        self.assertFalse(s.broken_meta(out))
        self.assertEqual(s.snippet_of(out)[1], sd.og_of(page("a", og)))


class Main(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        d = Path(self.tmp.name) / "ventures" / "demo"
        d.mkdir(parents=True)
        self.long = d / "long.html"
        self.long.write_text(page("x " * 200))
        self.short = d / "short.html"
        self.short.write_text(page("fine"))

    def run_main(self, *args):
        import contextlib, io
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            rc = sd.main(["--root", self.tmp.name, *args])
        return rc, buf.getvalue()

    def test_dry_run_lists_changes_without_writing(self):
        before = self.long.read_text()
        rc, out = self.run_main()
        self.assertEqual(rc, 0)
        self.assertIn("ventures/demo/long.html", out)
        self.assertNotIn("short.html", out)
        self.assertIn("1 pages would change", out)
        self.assertEqual(self.long.read_text(), before)

    def test_apply_rewrites_only_the_long_page(self):
        short_before = self.short.read_text()
        rc, out = self.run_main("--apply")
        self.assertEqual(rc, 0)
        self.assertIn("1 pages rewritten", out)
        self.assertEqual(s.snippet_of(self.long.read_text())[1], OG)
        self.assertEqual(self.short.read_text(), short_before)


if __name__ == "__main__":
    unittest.main()
