import tempfile
import unittest
from pathlib import Path

import gen_llms_txt as g


class GenLlms(unittest.TestCase):
    def _venture(self, root, name, html):
        d = Path(root) / name
        d.mkdir()
        (d / "index.html").write_text(html)
        return d

    def test_built_from_page_and_links_subpages(self):
        with tempfile.TemporaryDirectory() as r:
            d = self._venture(r, "x", '<title>T</title><meta name="description" content="A &amp; B."><h1>Hello</h1>')
            (d / "faq.html").write_text("<h1>The FAQ</h1>")
            out = g.build(d)
            self.assertTrue(out.startswith("# Hello\n\n> A & B."))
            self.assertIn("/x/faq.html", out)

    def test_licence_line_follows_the_venture_licence(self):
        notice = (Path(__file__).resolve().parents[2] / "portfolio/monetization/licences/ALL-RIGHTS-RESERVED").read_text()
        with tempfile.TemporaryDirectory() as r:
            page = '<title>T</title><meta name="description" content="D."><h1>H</h1>'
            free = self._venture(r, "free", page)
            self.assertIn("source available (FSL-1.1-MIT)", g.build(free))
            paid = self._venture(r, "paid", page)
            (paid / "LICENSE").write_text(notice)
            out = g.build(paid)
            self.assertIn("source visible (all rights reserved)", out)
            self.assertNotIn("FSL", out)

    def test_no_description_means_no_file(self):
        with tempfile.TemporaryDirectory() as r:
            self.assertIsNone(g.build(self._venture(r, "y", "<h1>Only a heading</h1>")))

    def test_site_subfolder_entry(self):
        with tempfile.TemporaryDirectory() as r:
            d = Path(r) / "z"
            (d / "site").mkdir(parents=True)
            (d / "site" / "index.html").write_text('<meta name="description" content="D."><h1>Z</h1>')
            out = g.build(d)
            self.assertTrue(out.startswith("# Z\n\n> D."))


if __name__ == "__main__":
    unittest.main()
