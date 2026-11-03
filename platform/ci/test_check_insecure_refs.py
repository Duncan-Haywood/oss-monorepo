import tempfile
import unittest
from pathlib import Path

import check_insecure_refs as c


class T(unittest.TestCase):
    def run_on(self, html):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d, "index.html")
            p.write_text(html)
            return list(c.insecure(p))

    def test_flags_script_img_css_form(self):
        html = ('<script src="http://a/x.js"></script><img alt="" src=\'http://a/y.png\'>'
                '<link rel="stylesheet" href="http://a/z.css"><form action="http://a/p">')
        self.assertEqual(len(self.run_on(html)), 4)

    def test_allows_anchor_https_localhost_namespace(self):
        html = ('<a href="http://example.org">x</a><script src="https://a/x.js"></script>'
                '<img src="http://localhost:3000/a.png"><svg xmlns="http://www.w3.org/2000/svg"></svg>')
        self.assertEqual(self.run_on(html), [])

    def main_on(self, files):
        import contextlib, io
        with tempfile.TemporaryDirectory() as d:
            for name, html in files.items():
                f = Path(d, name)
                f.parent.mkdir(parents=True, exist_ok=True)
                f.write_text(html)
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                rc = c.main(["--root", d])
            return rc, out.getvalue()

    def test_main_exit_zero_and_counts_pages(self):
        rc, out = self.main_on({"a.html": "<p>x</p>", "sub/b.html": "<p>y</p>",
                                "node_modules/c.html": '<img src="http://a/z.png">'})
        self.assertEqual(rc, 0)
        self.assertIn("2 pages, 0 plain-http loaders", out)

    def test_main_exit_one_and_reports_offender(self):
        rc, out = self.main_on({"a.html": '<img src="http://a/z.png">'})
        self.assertEqual(rc, 1)
        self.assertIn("http://a/z.png", out)
        self.assertIn("1 pages, 1 plain-http loaders", out)

    def test_default_root_is_repo_ventures(self):
        self.assertTrue((c.ROOT / "ventures").is_dir())
        self.assertTrue((c.ROOT / "platform" / "ci").is_dir())

    def test_help_uses_first_docstring_line(self):
        import contextlib, io
        out = io.StringIO()
        with contextlib.redirect_stdout(out), self.assertRaises(SystemExit):
            c.main(["--help"])
        self.assertIn("Fail if a venture page loads or posts", out.getvalue())


if __name__ == "__main__":
    unittest.main()
