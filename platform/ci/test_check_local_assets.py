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

    def test_mustache_placeholder_skipped(self):
        self.assertEqual(self.run_on({"index.html": '<img src="{{ img }}/v.svg">'}), [])

    def main_on(self, files):
        with tempfile.TemporaryDirectory() as d:
            for name, body in files.items():
                p = Path(d, name)
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text(body)
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                rc = c.main(["--root", d])
            return rc, out.getvalue()

    def test_main_clean_exits_zero_and_counts_pages(self):
        rc, out = self.main_on({"index.html": "<p>hi</p>", "sub/b.html": "<p>b</p>"})
        self.assertEqual(rc, 0)
        self.assertIn("2 pages, 0 missing local references", out)

    def test_main_missing_exits_one(self):
        rc, out = self.main_on({"index.html": '<img src="gone.png">'})
        self.assertEqual(rc, 1)
        self.assertIn("1 pages, 1 missing local references", out)

    def test_description_is_first_docstring_line(self):
        with self.assertRaises(SystemExit) as cm, contextlib.redirect_stdout(io.StringIO()) as o:
            c.main(["--help"])
        self.assertEqual(cm.exception.code, 0)
        self.assertIn("Fail if a venture page points", o.getvalue())


if __name__ == "__main__":
    unittest.main()
