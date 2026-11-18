import contextlib
import io
import tempfile
import unittest
from pathlib import Path

import check_unrendered_placeholders as c


class T(unittest.TestCase):
    def test_flags_visible_leaks(self):
        for html in ("<p>Hi {{name}}</p>", "<p>${total}</p>", "<b>[object Object]</b>",
                     "<td>undefined</td>", "<p>%(user)s</p>"):
            self.assertEqual(len(list(c.leaks(html))), 1, html)

    def test_ignores_code_script_comment(self):
        html = ("<code>{{a}}</code><pre>${b}</pre><script>`${c}`</script>"
                "<!-- {{d}} --><textarea>{{e}}</textarea><p>fine</p>")
        self.assertEqual(list(c.leaks(html)), [])

    def run_main(self, files):
        with tempfile.TemporaryDirectory() as d:
            for name, html in files.items():
                f = Path(d, name)
                f.parent.mkdir(parents=True, exist_ok=True)
                f.write_text(html)
            with contextlib.redirect_stdout(io.StringIO()):
                return c.main(["--root", d])

    def test_exit_codes(self):
        self.assertEqual(self.run_main({"a/index.html": "<p>ok</p>"}), 0)
        self.assertEqual(self.run_main({"a/index.html": "<p>{{x}}</p>"}), 1)
        self.assertEqual(self.run_main({"drip-keeper/index.html": "<p>{{name}}</p>"}), 0)

    def test_reports_exact_page_count_and_skips_node_modules(self):
        with tempfile.TemporaryDirectory() as d:
            for n in ("a/index.html", "b/index.html", "node_modules/x/index.html"):
                Path(d, n).parent.mkdir(parents=True, exist_ok=True)
                Path(d, n).write_text("<p>ok</p>")
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                c.main(["--root", d])
        self.assertIn("2 pages, 0 unrendered placeholders", buf.getvalue())

    def test_default_root_is_the_ventures_tree(self):
        self.assertEqual(c.ROOT, Path(__file__).resolve().parents[2])
        self.assertTrue((c.ROOT / "ventures").is_dir())


if __name__ == "__main__":
    unittest.main()
