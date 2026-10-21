import contextlib
import io
import tempfile
import unittest
from pathlib import Path

from check_duplicate_ids import duplicates, main, scan


class DuplicateIds(unittest.TestCase):
    def test_input_and_tbody_clash(self):
        html = '<input id="years">\n<table><tbody id="years"></tbody></table>'
        self.assertEqual(duplicates(html), [(2, "years", 1)])

    def test_unique_ids_pass(self):
        self.assertEqual(duplicates('<a id="a"></a><b id="b"></b><i></i>'), [])

    def test_script_and_comment_text_is_ignored(self):
        html = '<p id="x"></p><script>h = \'<i id="x"></i>\'</script><!-- <b id="x"> -->'
        self.assertEqual(duplicates(html), [])

    def test_scan_and_exit_code(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "ventures" / "v").mkdir(parents=True)
            page = root / "ventures" / "v" / "index.html"
            page.write_text('<p id="a"></p><p id="a"></p>')
            self.assertEqual(len(scan(root)), 1)
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                self.assertEqual(main(["--root", d]), 1)
            self.assertIn("index.html:1: id 'a' repeats", out.getvalue())
            page.write_text('<p id="a"></p><p id="b"></p>')
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main(["--root", d]), 0)


if __name__ == "__main__":
    unittest.main()
