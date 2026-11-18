import tempfile
import unittest
from pathlib import Path

import check_blank_targets as c


class T(unittest.TestCase):
    def run_on(self, html):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d, "index.html")
            p.write_text(html)
            return list(c.unsafe(p))

    def test_flags_missing_rel(self):
        self.assertEqual(len(self.run_on('<a href="x" target="_blank">x</a><a target=_blank href=y>')), 2)

    def test_allows_noopener_or_noreferrer(self):
        html = ('<a href="x" target="_blank" rel="noopener">x</a>'
                '<a rel="external noreferrer" href="y" target="_blank">y</a><a href="z">z</a>')
        self.assertEqual(self.run_on(html), [])

    def test_rel_inside_another_attribute_value_is_not_safe(self):
        for html in ('<a href="x?rel=noopener" target="_blank">x</a>',
                     '<a target="_blank" data-rel="noopener" href=y>y</a>',
                     '<a target="_blank" title="rel=noreferrer">y</a>'):
            self.assertEqual(len(self.run_on(html)), 1, html)
        self.assertEqual(self.run_on('<a target="_blank" REL=noopener href=y>y</a>'), [])

    def tree(self, d, bad):
        Path(d, "a").mkdir()
        Path(d, "a", "index.html").write_text('<a href="x" target="_blank">x</a>' if bad else "<p>ok</p>")
        Path(d, "node_modules").mkdir()
        Path(d, "node_modules", "n.html").write_text('<a target="_blank" href="x">x</a>')

    def main_on(self, bad):
        import contextlib, io
        with tempfile.TemporaryDirectory() as d:
            self.tree(d, bad)
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                rc = c.main(["--root", d])
            return rc, out.getvalue()

    def test_main_exit_1_and_counts_when_bad(self):
        rc, out = self.main_on(True)
        self.assertEqual(rc, 1)
        self.assertIn("1 pages, 1 _blank links", out)

    def test_main_exit_0_when_clean_and_skips_node_modules(self):
        rc, out = self.main_on(False)
        self.assertEqual(rc, 0)
        self.assertIn("1 pages, 0 _blank links", out)

    def test_default_root_is_repo_ventures(self):
        self.assertEqual(c.ROOT / "ventures", Path(__file__).resolve().parents[2] / "ventures")
        self.assertTrue((c.ROOT / "ventures").is_dir())


if __name__ == "__main__":
    unittest.main()
