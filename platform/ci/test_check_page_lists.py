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


if __name__ == "__main__":
    unittest.main()
