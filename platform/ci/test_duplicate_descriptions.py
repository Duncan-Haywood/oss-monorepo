import tempfile
import unittest
from pathlib import Path

from duplicate_descriptions import main, scan


def page(root, slug, name, desc):
    d = Path(root, "ventures", slug)
    d.mkdir(parents=True, exist_ok=True)
    (d / name).write_text(f'<html><head><meta name="description" content="{desc}"></head></html>')


class Dupes(unittest.TestCase):
    def test_groups_identical_descriptions(self):
        with tempfile.TemporaryDirectory() as r:
            page(r, "a", "vs-x.html", "Same text here for the test of duplicates.")
            page(r, "b", "vs-x.html", "Same text here for the test of duplicates.")
            page(r, "c", "index.html", "A different description that is long enough to pass.")
            groups, total = scan(r)
            self.assertEqual(total, 3)
            self.assertEqual(sorted(len(v) for v in groups.values()), [1, 2])
            self.assertEqual(main(["--root", r, "--strict"]), 1)

    def test_apostrophe_inside_double_quotes_is_not_truncated(self):
        with tempfile.TemporaryDirectory() as r:
            page(r, "a", "index.html", "A flat-rate's price is not the job's cost, so check both numbers.")
            groups, _ = scan(r)
            self.assertIn("A flat-rate's price is not the job's cost, so check both numbers.", groups)

    def test_clean_tree_passes_strict(self):
        with tempfile.TemporaryDirectory() as r:
            page(r, "a", "index.html", "One unique description that is long enough to count.")
            self.assertEqual(main(["--root", r, "--strict"]), 0)


if __name__ == "__main__":
    unittest.main()
