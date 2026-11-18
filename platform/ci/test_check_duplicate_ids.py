import contextlib
import io
import tempfile
import unittest
from pathlib import Path

from check_duplicate_ids import ROOT, duplicates, main, scan


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

    def test_scan_reaches_nested_pages_but_not_node_modules(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            for sub in ("v/site", "v/node_modules/x"):
                (root / "ventures" / sub).mkdir(parents=True)
                (root / "ventures" / sub / "index.html").write_text('<p id="a"></p><p id="a"></p>')
            found = scan(root)
            self.assertEqual([str(p) for p, *_ in found], ["ventures/v/site/index.html"])

    def test_default_root_is_the_repo_root(self):
        self.assertTrue((ROOT / "ventures").is_dir())

    def test_help_describes_the_check(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out), self.assertRaises(SystemExit):
            main(["--help"])
        self.assertIn("Fail if a served page uses the same", out.getvalue())


    def test_pool_scan_matches_serial_scan_in_order(self):
        # Above page_pool.MIN_POOL files the pages are parsed on a process
        # pool; the findings must come back in the same sorted-path order.
        import page_pool
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            for n in range(page_pool.MIN_POOL + 40):
                v = root / "ventures" / f"v{n:03d}"
                v.mkdir(parents=True)
                body = '<p id="a"></p><p id="a"></p>' if n % 3 == 0 else '<p id="a"></p>'
                (v / "index.html").write_text(body)
            pooled = scan(root)
            old = page_pool.workers
            page_pool.workers = lambda: 1
            try:
                serial = scan(root)
            finally:
                page_pool.workers = old
            self.assertEqual(len(pooled), (page_pool.MIN_POOL + 40 + 2) // 3)
            self.assertEqual(pooled, serial)


if __name__ == "__main__":
    unittest.main()
