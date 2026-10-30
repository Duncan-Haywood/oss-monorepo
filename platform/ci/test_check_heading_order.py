import unittest
from pathlib import Path

import check_heading_order as c


class HeadingOrder(unittest.TestCase):

    def test_clean_outline_has_no_skips(self):
        self.assertEqual(c.skips("<h1>a</h1><h2>b</h2><h3>c</h3><h2>d</h2>"), [])


    def test_skip_is_found(self):
        self.assertEqual(c.skips("<h1>a</h1><h3>b</h3>"), [(1, 3)])


    def test_script_strings_and_comments_are_ignored(self):
        html = '<h1>a</h1><script>x="<h4>q</h4>"</script><!-- <h3>z</h3> --><h2>b</h2>'
        self.assertEqual(c.skips(html), [])


    def test_fix_pulls_a_run_up_and_keeps_closing_tags_paired(self):
        html = '<h1 id="t">A</h1><h3 class="x">B</h3><h4>C</h4><h2>D</h2><h3>E</h3>'
        out = c.fix(html)
        self.assertEqual(out, '<h1 id="t">A</h1><h2 class="x">B</h2><h3>C</h3><h2>D</h2><h3>E</h3>')
        self.assertEqual(c.skips(out), [])


    def test_fix_leaves_script_strings_alone(self):
        html = '<h1>A</h1><h3>B</h3><script>"<h3>x</h3>"</script>'
        self.assertIn('"<h3>x</h3>"', c.fix(html))


    def test_fix_keeps_text_before_first_heading_and_headings_right_after_ignored_spans(self):
        html = '<p>intro</p><h1>A</h1><!-- c --><h3>B</h3>'
        self.assertEqual(c.fix(html), '<p>intro</p><h1>A</h1><!-- c --><h2>B</h2>')


    def test_fix_survives_a_stray_closing_tag(self):
        html = '</h3><h1>A</h1><h3>B</h3>'
        self.assertEqual(c.fix(html), '</h3><h1>A</h1><h2>B</h2>')


    def test_main_checks_only_the_given_files_and_exits_1_on_a_skip(self):
        import contextlib, io, tempfile
        with tempfile.TemporaryDirectory() as d:
            bad = Path(d) / "bad.html"
            bad.write_text("<html><h1>a</h1><h3>b</h3></html>")
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                self.assertEqual(c.main([str(bad)]), 1)
            self.assertIn("1 page(s)", out.getvalue())
            self.assertIn("bad.html", out.getvalue())
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(c.main(["--fix", str(bad)]), 0)
            self.assertIn("<h2>b</h2>", bad.read_text())


    def test_default_scan_root_is_the_repo_checkout(self):
        self.assertTrue((c.ROOT / "ventures").is_dir())
        self.assertTrue((c.ROOT / "platform" / "ci" / "check_heading_order.py").is_file())


    def test_repo_pages_have_no_skips(self):
        self.assertEqual(c.main([]), 0)


    def test_script_entry_point_passes_every_argument(self):
        import subprocess
        import sys
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / "p.html"
            f.write_text("<html><h1>a</h1><h3>b</h3></html>")
            r = subprocess.run([sys.executable, str(Path(c.__file__)), str(f)],
                               capture_output=True, text=True)
        self.assertEqual(r.returncode, 1)
        self.assertIn("1 page(s)", r.stdout)


if __name__ == "__main__":
    unittest.main()
