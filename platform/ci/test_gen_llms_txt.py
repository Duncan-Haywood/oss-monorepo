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

    def test_no_description_means_no_file(self):
        with tempfile.TemporaryDirectory() as r:
            self.assertIsNone(g.build(self._venture(r, "y", "<h1>Only a heading</h1>")))


if __name__ == "__main__":
    unittest.main()
