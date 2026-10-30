import contextlib
import io
import tempfile
import unittest
from pathlib import Path

from check_inline_scripts import ROOT, inline_scripts, main


class InlineScripts(unittest.TestCase):
    def test_default_root_is_repo_root(self):
        self.assertTrue((ROOT / "ventures").is_dir())

    def test_skips_data_blocks_and_src(self):
        html = (
            '<script type="application/ld+json">{"a":1}</script>'
            '<script src="x.js"></script><script></script>'
            "<script>var a=1;</script>"
            '<script type="module">export const b=2;</script>'
        )
        got = [(m, s) for _, m, s in inline_scripts(html)]
        self.assertEqual(got, [(False, "var a=1;"), (True, "export const b=2;")])

    def run_on(self, html):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "a").mkdir()
            (Path(d) / "a" / "index.html").write_text(html)
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                code = main(["--root", d])
            return code, out.getvalue()

    def test_good_script_passes(self):
        self.assertEqual(self.run_on("<script>const a = () => 1;</script>")[0], 0)

    def test_batch_screen_keeps_node_check_verdicts(self):
        # a top-level return passes `node --check` (CommonJS wrapper) but not vm.Script
        self.assertEqual(self.run_on("<script>return 1;</script>")[0], 0)
        self.assertEqual(self.run_on('<script type="module">import x from "y"; export const a = 1;</script>')[0], 0)
        code, out = self.run_on('<script>var a=1;</script>\n<script type="module">export const = 1;</script>')
        self.assertEqual((code, "index.html:2:" in out), (1, True))

    def test_syntax_error_fails_with_line(self):
        code, out = self.run_on("<p>x</p>\n<script>function (</script>")
        self.assertEqual(code, 1)
        self.assertIn("index.html:2:", out)


    def test_syntax_error_fallback_keeps_last_120_chars_of_stderr(self):
        from unittest import mock
        import check_inline_scripts as c
        fake = mock.Mock(returncode=1, stderr="x" * 50 + "y" * 120)
        with mock.patch.object(c.subprocess, "run", return_value=fake):
            self.assertEqual(c.syntax_error("1", False, tempfile.gettempdir()), "y" * 120)


if __name__ == "__main__":
    unittest.main()
