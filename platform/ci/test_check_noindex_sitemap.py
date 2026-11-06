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


if __name__ == "__main__":
    unittest.main()
