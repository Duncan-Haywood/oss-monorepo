import contextlib
import io
import tempfile
import unittest
from pathlib import Path

from check_html_is_html import ROOT, looks_like_markup, main


class HtmlIsHtml(unittest.TestCase):
    def test_markup(self):
        self.assertTrue(looks_like_markup("﻿\n<!DOCTYPE html><html>"))
        self.assertTrue(looks_like_markup("<!-- c --><html>"))

    def test_source_code(self):
        self.assertFalse(looks_like_markup('/** Converted */\nimport x from "y";'))

    def test_main_flags_only_bad_files(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "ok.html").write_text("<html></html>")
            (Path(d) / "bad.html").write_text("import a from 'b';")
            (Path(d) / "node_modules").mkdir()
            (Path(d) / "node_modules" / "x.html").write_text("junk")
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                self.assertEqual(main(["--root", d]), 1)
            self.assertIn("bad.html", out.getvalue())
            self.assertNotIn("ok.html", out.getvalue())
            self.assertNotIn("node_modules", out.getvalue())

    def test_default_root_is_the_ventures_tree(self):
        # A wrong default (e.g. one directory too high) scans nothing and passes.
        self.assertTrue((ROOT / "ventures").is_dir())
        self.assertTrue((ROOT / "platform" / "ci").is_dir())
        seen = []
        import check_html_is_html as m
        orig = m.bad_files
        m.bad_files = lambda root: seen.append(Path(root)) or iter(())
        try:
            self.assertEqual(main([]), 0)
        finally:
            m.bad_files = orig
        self.assertEqual(seen, [ROOT / "ventures"])

    def test_repo_is_clean(self):
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(main(["--root", str(ROOT / "ventures")]), 0)


if __name__ == "__main__":
    unittest.main()
