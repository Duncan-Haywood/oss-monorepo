import contextlib
import io
import tempfile
import unittest
from pathlib import Path

from check_main_landmark import ROOT, fixable, has_main, main, wrap

PAGE = "<html><body>\n<header><h1>T</h1></header>\n<section>x</section>\n<footer>f</footer></body></html>"


class MainLandmark(unittest.TestCase):
    def test_default_root_is_repo_root(self):
        self.assertTrue((ROOT / "ventures").is_dir())
        self.assertTrue((ROOT / "platform" / "ci").is_dir())

    def test_wraps_between_header_and_footer(self):
        out = wrap(PAGE)
        self.assertTrue(has_main(out))
        self.assertLess(out.index("</header>"), out.index("<main>"))
        self.assertLess(out.index("</main>"), out.index("<footer"))

    def test_bare_h1_page_wraps_from_body(self):
        s = "<body>\n<h1>T</h1><p>x</p><footer>f</footer></body>"
        self.assertTrue(fixable(s))
        out = wrap(s)
        self.assertLess(out.index("<main>"), out.index("<h1>"))

    def test_print_rule_on_body_child_is_not_fixable(self):
        s = "<style>@media print{body > :not(#c){display:none}}</style>" + PAGE
        self.assertFalse(fixable(s))

    def test_cli_fix_then_clean(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "a"
            p.mkdir()
            (p / "index.html").write_text(PAGE)
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main(["--root", d]), 1)
                self.assertEqual(main(["--root", d, "--fix"]), 0)
                self.assertEqual(main(["--root", d]), 0)


if __name__ == "__main__":
    unittest.main()
