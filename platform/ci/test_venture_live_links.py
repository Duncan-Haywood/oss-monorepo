import tempfile
import unittest
from pathlib import Path

import venture_live_links as v


class VentureLiveLinks(unittest.TestCase):
    def test_flags_missing_and_skips_not_a_venture(self):
        with tempfile.TemporaryDirectory() as t:
            root = Path(t)
            for name, text, marker in [
                ("ok", f"x {v.BASE}ok/", False),
                ("bad", "no link", False),
                ("skip", "no link", True),
            ]:
                d = root / "ventures" / name
                d.mkdir(parents=True)
                (d / "README.md").write_text(text)
                (d / "index.html").write_text("")
                if marker:
                    (d / "NOT-A-VENTURE").write_text("")
            self.assertEqual(v.missing(root), ["bad"])

    def test_repo_is_clean(self):
        self.assertEqual(v.missing(), [])


if __name__ == "__main__":
    unittest.main()
