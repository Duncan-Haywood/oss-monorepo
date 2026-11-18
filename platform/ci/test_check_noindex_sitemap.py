import tempfile
import unittest
from pathlib import Path

import check_noindex_sitemap as c


class T(unittest.TestCase):
    def venture(self, d, sitemap, pages):
        v = Path(d, "demo")
        v.mkdir()
        for name, html in pages.items():
            (v / name).write_text(html)
        (v / "sitemap.xml").write_text(sitemap)
        return v

    def test_flags_noindex_page_in_sitemap(self):
        with tempfile.TemporaryDirectory() as d:
            sm = ("<urlset><url><loc>https://x.example/demo/a.html</loc></url>"
                  "<url><loc>https://x.example/demo/b.html</loc></url></urlset>")
            v = self.venture(d, sm, {"a.html": '<meta name="robots" content="noindex">', "b.html": "<p>ok</p>"})
            self.assertEqual(list(c.conflicts(v)), ["a.html"])

    def test_relative_and_repo_links(self):
        with tempfile.TemporaryDirectory() as d:
            sm = ("<urlset><url><loc>./a.html</loc></url>"
                  "<url><loc>https://github.com/o/r/blob/main/ventures/demo/a.html</loc></url></urlset>")
            v = self.venture(d, sm, {"a.html": '<meta content="noindex" name="robots">'})
            self.assertEqual(list(c.conflicts(v)), ["a.html"])

    def test_is_noindex_needs_robots_and_noindex(self):
        with tempfile.TemporaryDirectory() as d:
            a = Path(d, "a.html"); a.write_text('<meta name="robots" content="index">')
            b = Path(d, "b.html"); b.write_text('<meta name="description" content="why noindex matters">')
            self.assertFalse(c.is_noindex(a))
            self.assertFalse(c.is_noindex(b))
            self.assertFalse(c.is_noindex(Path(d, "missing.html")))  # unreadable is not a conflict

    def test_main_exit_codes_and_scan(self):
        import contextlib, io
        with tempfile.TemporaryDirectory() as d:
            sm = "<urlset><url><loc>https://x.example/demo/a.html</loc></url></urlset>"
            self.venture(d, sm, {"a.html": '<meta name="robots" content="noindex">'})
            Path(d, "stray.txt").write_text("not a dir")
            Path(d, "nositemap").mkdir()
            Path(d, "nositemap", "x.html").write_text("x")
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                self.assertEqual(c.main(["--root", d]), 1)
            self.assertIn("1 conflict(s) across 1 sitemaps", out.getvalue())
            Path(d, "demo", "a.html").write_text("<p>ok</p>")
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                self.assertEqual(c.main(["--root", d]), 0)
            self.assertIn("0 conflict(s) across 1 sitemaps", out.getvalue())

    def test_default_root_is_repo_ventures_and_help(self):
        import contextlib, io
        self.assertTrue((c.ROOT / "ventures").is_dir())
        out = io.StringIO()
        with contextlib.redirect_stdout(out), self.assertRaises(SystemExit):
            c.main(["--help"])
        self.assertIn("Fail if a venture's sitemap.xml", out.getvalue())
        self.assertEqual(c.main([]), 0)  # our own tree starts green


if __name__ == "__main__":
    unittest.main()
