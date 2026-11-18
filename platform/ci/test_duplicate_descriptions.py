import tempfile
import unittest
from pathlib import Path

import contextlib
import io

import duplicate_descriptions
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

    def test_short_threshold_is_exclusive(self):
        with tempfile.TemporaryDirectory() as r:
            page(r, "a", "index.html", "x" * 40)  # exactly --short: not short
            self.assertEqual(main(["--root", r, "--strict"]), 0)
            page(r, "b", "index.html", "x" * 39)  # one under: short
            self.assertEqual(main(["--root", r, "--strict"]), 1)

    def test_entities_in_attribute_are_decoded(self):
        with tempfile.TemporaryDirectory() as r:
            page(r, "a", "index.html", "Rock &amp; roll is a description long enough to count.")
            groups, _ = scan(r)
            self.assertIn("Rock & roll is a description long enough to count.", groups)

    def test_default_root_is_the_repository_root(self):
        self.assertTrue((duplicate_descriptions.ROOT / "ventures").is_dir())

    def test_only_meta_description_tags_count(self):
        with tempfile.TemporaryDirectory() as r:
            d = Path(r, "ventures", "a")
            d.mkdir(parents=True)
            (d / "index.html").write_text(
                '<html><head><meta charset="utf-8">'
                '<meta name="description" content="The real description, long enough to count."></head>'
                '<body><div name="description" content="not a meta tag"></div></body></html>')
            groups, total = scan(r)
            self.assertEqual(list(groups), ["The real description, long enough to count."])
            self.assertEqual(total, 1)

    def test_first_description_wins_and_earlier_tags_do_not_set_it(self):
        with tempfile.TemporaryDirectory() as r:
            d = Path(r, "ventures", "a")
            d.mkdir(parents=True)
            (d / "index.html").write_text(
                '<html lang="en"><head><title>T</title><meta charset="utf-8">'
                '<meta name="description" content="First description, long enough to count.">'
                '<meta name="description" content="Second description, also long enough."></head></html>')
            groups, total = scan(r)
            self.assertEqual(list(groups), ["First description, long enough to count."])
            self.assertEqual(total, 1)

    def test_duplicate_report_is_capped_at_25_groups(self):
        with tempfile.TemporaryDirectory() as r:
            for i in range(26):
                for slug in ("a", "b"):
                    page(r, f"{slug}{i}", "index.html", f"Shared description number {i:02d}, long enough to count.")
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                main(["--root", r])
            self.assertEqual(out.getvalue().count("pages share:"), 25)


if __name__ == "__main__":
    unittest.main()
