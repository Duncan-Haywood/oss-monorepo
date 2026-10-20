import contextlib
import io
import tempfile
import unittest
from pathlib import Path

import check_control_labels
from check_control_labels import main, scan, unlabeled


class ControlLabels(unittest.TestCase):
    def test_placeholder_is_not_a_name(self):
        self.assertEqual(unlabeled('<textarea id="p" placeholder="Paste"></textarea>'), [(1, "p")])

    def test_for_wrapping_and_aria_count(self):
        html = ('<label for="a">A</label><input id="a">'
                '<label>B <input id="b"></label>'
                '<input id="c" aria-label="C"><select id="d" title="D"></select>')
        self.assertEqual(unlabeled(html), [])

    def test_label_scope_ends(self):
        self.assertEqual(unlabeled('<label>x</label><input id="e">'), [(1, "e")])

    def test_skips_buttons_and_hidden(self):
        self.assertEqual(unlabeled('<input type="hidden"><input type="submit"><input type="button">'), [])

    def test_nested_tags_keep_label_open(self):
        html = '<label><span>Name</span> <input id="n"></label>'
        self.assertEqual(unlabeled(html), [])

    def test_root_is_repo_root(self):
        self.assertTrue((check_control_labels.ROOT / "ventures").is_dir())

    def test_help_describes_the_check(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out), self.assertRaises(SystemExit):
            main(["--help"])
        self.assertIn("Fail if a served page has a form control", out.getvalue())

    def test_main_exit_codes(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "ventures" / "v").mkdir(parents=True)
            page = root / "ventures" / "v" / "index.html"
            page.write_text('<label>A <input id="a"></label>')
            self.assertEqual(scan(root), [])
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main(["--root", d]), 0)
            page.write_text('<input id="bad" placeholder="x">')
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                self.assertEqual(main(["--root", d]), 1)
            self.assertIn("bad", out.getvalue())


if __name__ == "__main__":
    unittest.main()
