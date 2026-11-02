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


if __name__ == "__main__":
    unittest.main()
