import contextlib
import io
import tempfile
import unittest
from pathlib import Path

import check_local_assets as c


class T(unittest.TestCase):
    def run_on(self, files):
        with tempfile.TemporaryDirectory() as d:
            for name, body in files.items():
                p = Path(d, name)
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text(body)
            return list(c.broken(Path(d, "index.html")))

    def test_missing_image_reported(self):
        self.assertEqual(self.run_on({"index.html": '<img src="a.png">'}), ["a.png"])

    def test_present_and_query_ok(self):
        self.assertEqual(self.run_on({"index.html": '<script src="a.js?v=1"></script>', "a.js": ""}), [])

    def test_skips_remote_template_bundled_absolute(self):
        html = ('<img src="https://x/y.png"><img src="data:abc"><img src="${id}/v.svg">'
                '<script src="/src/main.tsx"></script><link href="/x.css">')
        self.assertEqual(self.run_on({"index.html": html}), [])

    def test_mustache_placeholder_skipped_alone(self):
        self.assertEqual(self.run_on({"index.html": '<img src="{{ name }}.png">'}), [])

    def main_on(self, files):
        with tempfile.TemporaryDirectory() as d:
            for name, body in files.items():
                p = Path(d, name)
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text(body)
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                code = c.main(["--root", d])
            return code, out.getvalue()

    def test_main_clean_counts_pages_and_exits_zero(self):
        code, out = self.main_on({"a.html": "<p>x</p>", "b/c.html": "<p>y</p>", "node_modules/z.html": '<img src="no.png">'})
        self.assertEqual(code, 0)
        self.assertIn("2 pages, 0 missing", out)

    def test_main_broken_exits_one(self):
        code, out = self.main_on({"a.html": '<img src="no.png">'})
        self.assertEqual(code, 1)
        self.assertIn("1 pages, 1 missing", out)
        self.assertIn("missing no.png", out)

    def test_default_root_is_ventures_dir(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            c.main([])
        self.assertRegex(out.getvalue(), r"\d+ pages, \d+ missing")


if __name__ == "__main__":
    unittest.main()
