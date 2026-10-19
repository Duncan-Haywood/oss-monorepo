import contextlib
import io
import tempfile
import unittest
from unittest import mock
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

    def test_skips_dirs_without_readme_or_index_and_stray_files(self):
        with tempfile.TemporaryDirectory() as t:
            root = Path(t)
            (root / "ventures" / "noreadme").mkdir(parents=True)
            (root / "ventures" / "noreadme" / "index.html").write_text("")
            (root / "ventures" / "noindex").mkdir()
            (root / "ventures" / "noindex" / "README.md").write_text("x")
            (root / "ventures" / "stray.txt").write_text("")
            self.assertEqual(v.missing(root), [])

    def test_main_exit_code(self):
        with mock.patch.object(v, "missing", return_value=["a"]), \
                contextlib.redirect_stdout(io.StringIO()) as out:
            self.assertEqual(v.main(), 1)
        self.assertIn(f"{v.BASE}a/", out.getvalue())
        with mock.patch.object(v, "missing", return_value=[]):
            self.assertEqual(v.main(), 0)

    def test_repo_is_clean(self):
        self.assertEqual(v.missing(), [])


if __name__ == "__main__":
    unittest.main()
