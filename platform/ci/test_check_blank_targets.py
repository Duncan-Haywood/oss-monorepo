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


if __name__ == "__main__":
    unittest.main()
