import contextlib
import io
import tempfile
import unittest
from pathlib import Path

import check_page_lists as c

NAMES = [f"p{i}.html" for i in range(9)]


def venture(tmp: Path, listed, pages) -> Path:
    d = tmp / "ventures" / "v"
    d.mkdir(parents=True)
    for p in pages:
        (d / p).write_text("<html></html>")
    body = ", ".join(f'"{n}"' for n in listed)
    t = d / "page.test.mjs"
    t.write_text(f"import x from 'y';\nfor (const n of [{body}]) {{}}\n")
    return t


class PageListTest(unittest.TestCase):
    def test_list_missing_a_page_is_reported(self):
        with tempfile.TemporaryDirectory() as tmp:
            t = venture(Path(tmp), NAMES[:8], NAMES)
            self.assertEqual(c.lagging_lists(t), [(2, ["p8.html"])])
            self.assertEqual(c.main(Path(tmp)), 1)

    def test_complete_list_passes(self):
        with tempfile.TemporaryDirectory() as tmp:
            venture(Path(tmp), NAMES, NAMES)
            self.assertEqual(c.main(Path(tmp)), 0)

    def test_short_feature_lists_are_left_alone(self):
        with tempfile.TemporaryDirectory() as tmp:
            t = venture(Path(tmp), NAMES[:3], NAMES)
            self.assertEqual(c.lagging_lists(t), [])

    def test_list_of_files_not_beside_the_test_is_left_alone(self):
        with tempfile.TemporaryDirectory() as tmp:
            t = venture(Path(tmp), NAMES[:8] + ["generated.html"], NAMES)
            self.assertEqual(c.lagging_lists(t), [])

    def test_line_number_counts_a_leading_blank_line(self):
        with tempfile.TemporaryDirectory() as tmp:
            t = venture(Path(tmp), NAMES[:8], NAMES)
            t.write_text("\n" + t.read_text())
            self.assertEqual(c.lagging_lists(t), [(3, ["p8.html"])])

    def _report(self, tmp: Path) -> str:
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            self.assertEqual(c.main(tmp), 1)
        return out.getvalue().splitlines()[0]

    def test_exactly_five_missing_pages_are_all_shown_without_ellipsis(self):
        names = [f"p{i}.html" for i in range(13)]
        with tempfile.TemporaryDirectory() as tmp:
            venture(Path(tmp), names[:8], names)
            line = self._report(Path(tmp))
            self.assertIn("misses 5 page(s)", line)
            self.assertTrue(line.endswith("p8.html, p9.html"), line)

    def test_six_missing_pages_end_with_ellipsis(self):
        names = [f"p{i}.html" for i in range(14)]
        with tempfile.TemporaryDirectory() as tmp:
            venture(Path(tmp), names[:8], names)
            self.assertTrue(self._report(Path(tmp)).endswith(" ..."))


if __name__ == "__main__":
    unittest.main()
