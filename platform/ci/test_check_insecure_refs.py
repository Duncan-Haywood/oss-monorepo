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

    def test_flags_loaders_the_regex_missed(self):
        # Red team 2026-11-11: each of these loads plain-http content on an
        # https page and each passed the old quoted-src/href/action regex.
        cases = [
            '<img src=http://a/x.png>',
            '<link rel=stylesheet href=http://a/s.css>',
            '<img srcset="https://a/1.png 1x, http://a/2.png 2x">',
            '<link rel="preload" as="image" imagesrcset="http://a/p.png 2x">',
            '<video poster="http://a/p.jpg"></video>',
            '<object data="http://a/o.svg"></object>',
            '<button formaction="http://a/post">x</button>',
            '<track src="http://a/t.vtt">',
            '<input type="image" src="http://a/i.png">',
            '<img alt="a>b" src="http://a/x.png">',
            '<base href="http://a/">',
            '<div style="background:url(http://a/b.png)"></div>',
            "<style>@import 'http://a/a.css'; .x{background:url( \"http://a/c.png\" )}</style>",
        ]
        for html in cases:
            with self.subTest(html=html):
                self.assertTrue(self.run_on(html), html)
        self.assertEqual(len(self.run_on(cases[-1])), 2)

    def test_allows_https_relative_data_and_scripts_text(self):
        html = ('<img srcset="https://a/1.png 1x, /2.png 2x, data:image/png;base64,AA 3x">'
                '<div style="background:url(/b.png)"></div><style>.x{background:url(https://a/b.png)}</style>'
                '<script>var u = "<img src=http://a/x.png>";</script>'
                '<p>see http://example.org</p><a href=http://example.org>x</a>'
                '<link rel="canonical" href="https://a/"><img src="http://127.0.0.1/a.png">')
        self.assertEqual(self.run_on(html), [])

    def test_main_scans_css_files(self):
        rc, out = self.main_on({"a.css": "body{background:url('http://a/b.png')}",
                                "ok.css": "body{background:url(https://a/b.png)}"})
        self.assertEqual(rc, 1)
        self.assertIn("a.css: http://a/b.png", out)
        self.assertNotIn("ok.css", out)

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
