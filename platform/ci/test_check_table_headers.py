import contextlib
import io
import tempfile
import unittest
from pathlib import Path

from check_table_headers import ROOT, headerless, main, scan


class TableHeaders(unittest.TestCase):
    def test_bare_td_table_fails(self):
        self.assertTrue(headerless("<table><tr><td>a</td><td>b</td></tr></table>"))

    def test_row_header_passes(self):
        self.assertFalse(headerless('<table><tr><th scope="row">a</th><td>b</td></tr></table>'))

    def test_th_in_script_template_passes(self):
        html = "<table id=t></table><script>t.innerHTML = '<tr><th scope=\"row\">x</th></tr>'</script>"
        self.assertFalse(headerless(html))

    def test_page_without_table_passes(self):
        self.assertFalse(headerless("<p>no table, <thead> mention</p>"))

    def test_commented_th_does_not_count(self):
        self.assertTrue(headerless("<table><tr><td>a</td></tr></table><!-- <th> -->"))

    def test_table_named_in_json_ld_is_not_a_table(self):
        self.assertFalse(headerless('<script type="application/ld+json">{"text": "a <table> here"}</script>'))

    def test_scan_and_exit_code(self):
        with tempfile.TemporaryDirectory() as d:
            page = Path(d) / "ventures" / "v" / "index.html"
            page.parent.mkdir(parents=True)
            page.write_text("<table><tr><td>a</td></tr></table>")
            self.assertEqual(len(scan(d)), 1)
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main(["--root", d]), 1)
            page.write_text("<table><tr><th>a</th></tr></table>")
            self.assertEqual(scan(d), [])
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main(["--root", d]), 0)

    def test_root_is_the_repository_root(self):
        # a wrong ROOT makes test_repository_is_clean scan nothing and pass
        self.assertTrue((ROOT / "ventures").is_dir())
        self.assertTrue(any(ROOT.glob("ventures/*/**/*.html")))

    def test_repository_is_clean(self):
        self.assertEqual(scan(ROOT), [])


if __name__ == "__main__":
    unittest.main()
