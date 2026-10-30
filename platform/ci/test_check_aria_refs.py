import contextlib
import io
import tempfile
import unittest
from pathlib import Path

from check_aria_refs import ROOT, dangling, main, scan


class AriaRefs(unittest.TestCase):
    def test_label_for_missing_id(self):
        self.assertEqual(dangling('<label for="a">A</label>\n<input id="b">'), [(1, "for", "a")])

    def test_resolving_refs_pass(self):
        html = '<label for="a">A</label><input id="a" aria-describedby="h1 h2"><p id="h1"></p><p id="h2"></p>'
        self.assertEqual(dangling(html), [])

    def test_each_missing_id_in_a_list_is_reported(self):
        self.assertEqual(
            dangling('<div aria-labelledby="x y" id="x"></div>'), [(1, "aria-labelledby", "y")]
        )

    def test_data_for_and_templated_values_are_ignored(self):
        self.assertEqual(dangling('<div data-for="regular"></div><i aria-controls="p-${n}"></i>'), [])

    def test_for_on_non_label_is_ignored(self):
        self.assertEqual(dangling('<output for="a b"></output>'), [])

    def test_clean_tree_exits_zero(self):
        with tempfile.TemporaryDirectory() as d, contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(main(["--root", d]), 0)

    def test_scan_and_exit_code(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "ventures" / "v").mkdir(parents=True)
            (root / "ventures" / "v" / "index.html").write_text('<i aria-controls="gone"></i>')
            self.assertEqual(len(scan(root)), 1)
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                self.assertEqual(main(["--root", d]), 1)
            self.assertIn("aria-controls='gone'", out.getvalue())

    def test_repository_is_clean(self):
        self.assertEqual(scan(ROOT), [])


if __name__ == "__main__":
    unittest.main()
